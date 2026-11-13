import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { createSebpayCollection, listSebpayOperators, readSebpayCollection, settleFromSebpay } from "../_shared/sebpay.ts";
import { COLLECTION_PREFIX, collectionErrorMessage } from "../_shared/sebpay-core.ts";

/**
 * Paiement Mobile Money SebPay dans la page de paiement OSKOOL (API Collectes), sans redirection :
 * - start   : opérateurs du pays de l'acheteur et numéro saisi à l'étape 1 ;
 * - collect : demande de paiement envoyée au téléphone (code OTP si l'opérateur l'exige) ;
 * - status  : relecture chez SebPay (payé, en attente ou refusé).
 * L'accès n'est donné qu'après relecture de la collecte chez SebPay (bon montant, bonne commande).
 */
const sha256 = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((b) => b.toString(16).padStart(2, "0")).join("");

/** Une demande encore en cours sur le téléphone n'est pas doublée avant ce délai (l'acheteur paierait deux fois). */
const PENDING_GUARD_MS = 2 * 60_000;

type Body = { action?: string; payment_id?: string; checkout_token?: string; operator?: string; phone?: string; country?: string; otp_code?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide" }, 400);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: payment } = await admin
    .from("payments")
    .select("*")
    .eq("id", String(body.payment_id || ""))
    .eq("checkout_token_hash", await sha256(String(body.checkout_token || "")))
    .maybeSingle();
  if (!payment) return json({ error: "Commande introuvable" }, 404);
  if (payment.status === "paid") return json({ status: "paid" });
  if (payment.status !== "pending") return json({ error: "Cette commande n'est plus payable." }, 409);
  const { data: settings } = await admin.from("landing_settings").select("mobile_money_provider").limit(1).maybeSingle();
  if (settings?.mobile_money_provider !== "sebpay") return json({ error: "SebPay n'est pas activé." }, 409);

  const country = /^[A-Z]{2}$/.test(String(body.country || "").toUpperCase()) ? String(body.country).toUpperCase() : String(payment.customer_country || "BJ").toUpperCase();
  const previous = payment.raw?.sebpay_collection as { reference?: string; attempt?: number; at?: string; link?: string | null } | undefined;

  if (body.action === "status") {
    const result = await settleFromSebpay(admin, payment, req);
    return json({ status: result.status === "paid" ? "paid" : result.reason === "sebpay-rejected" ? "rejected" : "pending" });
  }

  if (body.action === "collect") {
    const operator = String(body.operator || "").trim();
    const phone = String(body.phone || "").replace(/\D/g, "");
    const otp = String(body.otp_code || "").replace(/\s/g, "");
    if (!/^[a-z0-9_-]{2,40}$/i.test(operator)) return json({ error: "Choisis ton opérateur." }, 400);
    if (phone.length < 8 || phone.length > 15) return json({ error: "Numéro de téléphone invalide." }, 400);

    // Demande précédente : payée → confirmée ; encore en cours depuis peu → on attend au lieu de redemander.
    if (previous?.reference) {
      const last = await readSebpayCollection(previous.reference);
      if (last?.status === "approved") {
        const settled = await settleFromSebpay(admin, payment, req, previous.reference);
        if (settled.status === "paid") return json({ status: "paid" });
      }
      if (last?.status === "pending" && Date.now() - new Date(previous.at || 0).getTime() < PENDING_GUARD_MS) {
        return json({ status: "pending", provider_link: previous.link ?? null, message: "Une demande de paiement est déjà en cours : valide-la sur ton téléphone." });
      }
    }

    const attempt = Number(previous?.attempt ?? 0) + 1;
    const reference = `${payment.id}:c${attempt}`;
    const site = (Deno.env.get("SITE_URL") || "https://example.com").replace(/\/$/, "");
    const name = [payment.customer_first_name, payment.customer_last_name].filter(Boolean).join(" ").trim() || String(payment.customer_name || "");
    const res = await createSebpayCollection({
      amount: Math.round(Number(payment.amount)),
      currency: String(payment.currency || "XOF").toUpperCase(),
      phone,
      operator,
      country,
      external_reference: reference,
      callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/sebpay-webhook`,
      return_url: `${site}/payment/success?payment=${encodeURIComponent(payment.id)}&token=${encodeURIComponent(String(body.checkout_token))}`,
      ...(name ? { customer_name: name.slice(0, 100) } : {}),
      ...(payment.customer_email ? { customer_email: String(payment.customer_email) } : {}),
      ...(otp ? { otp_code: otp } : {}),
    });
    if (!res.ok) {
      const detail = String(res.body?.message || res.body?.code || `HTTP ${res.status}`).slice(0, 300);
      console.error("[sebpay-collect]", payment.id, res.status, detail);
      await admin.from("payments").update({ raw: { ...(payment.raw ?? {}), sebpay_error: detail } }).eq("id", payment.id);
      const { message, otp: needsOtp } = collectionErrorMessage(res.status, res.body);
      return json({ error: message, otp_required: !!needsOtp, detail }, res.status >= 400 && res.status < 500 ? 422 : 502);
    }
    const link = res.collection.provider_link || null;
    await admin
      .from("payments")
      .update({ sebpay_session_id: `${COLLECTION_PREFIX}${reference}`, raw: { ...(payment.raw ?? {}), sebpay_error: null, sebpay_collection: { reference, attempt, at: new Date().toISOString(), operator, link, transaction_id: res.collection.transaction_id ?? null } } })
      .eq("id", payment.id);
    return json({ status: "pending", provider_link: link });
  }

  // start : opérateurs du pays et numéro de l'étape 1 (sans l'indicatif « + »).
  const operators = await listSebpayOperators(country);
  if (!operators) return json({ error: "Le paiement Mobile Money n'a pas pu démarrer. Réessaie dans un instant." }, 502);
  const waiting = previous?.reference && Date.now() - new Date(previous.at || 0).getTime() < PENDING_GUARD_MS ? { provider_link: previous.link ?? null } : null;
  return json({ country, phone: String(payment.customer_phone || "").replace(/\D/g, ""), operators, waiting });
});
