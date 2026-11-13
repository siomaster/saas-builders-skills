import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sebpaySecretKey, settleFromSebpay } from "../_shared/sebpay.ts";
import { verifySebpaySignature } from "../_shared/sebpay-core.ts";

/**
 * Notifications SebPay (statut final d'une tentative de paiement). Signature vérifiée sur le corps brut,
 * puis la session est relue chez SebPay avant toute validation : la notification seule ne suffit pas.
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await req.text();
  if (!(await verifySebpaySignature(raw, req.headers.get("X-SebPay-Signature") || "", sebpaySecretKey()))) {
    console.warn("[sebpay-webhook] signature invalide");
    return new Response("invalid signature", { status: 401 });
  }
  let evt: { checkout_session_id?: string; external_reference?: string; status?: string; transaction_id?: string };
  try {
    evt = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const sessionId = String(evt.checkout_session_id || "");
  const orderId = String(evt.external_reference || "").split(":")[0];
  const { data: payment } = sessionId
    ? await admin.from("payments").select("*").eq("sebpay_session_id", sessionId).maybeSingle()
    : /^[0-9a-f-]{36}$/i.test(orderId)
      ? await admin.from("payments").select("*").eq("id", orderId).maybeSingle()
      : { data: null };
  if (!payment || payment.status === "paid") return new Response("ok", { status: 200 });
  try {
    // Collecte (paiement dans la page) : on relit précisément la tentative notifiée.
    const collection = !sessionId && /:c\d+$/.test(String(evt.external_reference || "")) ? String(evt.external_reference) : undefined;
    console.log("[sebpay-webhook]", payment.id, evt.status, await settleFromSebpay(admin, payment, req, collection));
  } catch (error) {
    console.error("[sebpay-webhook]", payment.id, error);
    return new Response("retry", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
