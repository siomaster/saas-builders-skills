/**
 * SebPay (Mobile Money) : session de paiement hébergée, le client paie sur la page SebPay puis revient
 * sur OSKOOL. Le paiement n'est validé qu'après relecture de la session chez SebPay.
 */
import { confirmPayment, type SettleResult } from "./payments.ts";
import { COLLECTION_PREFIX, normalizeOperators, sebpayApiUrl, sebpayCollectionVerdict, sebpayVerdict, type SebpayCollection, type SebpaySession } from "./sebpay-core.ts";

const keys = () => ({ publicKey: Deno.env.get("SEBPAY_PUBLIC_KEY") || "", secretKey: Deno.env.get("SEBPAY_SECRET_KEY") || "" });
export const sebpaySecretKey = () => keys().secretKey;

export async function sebpayFetch(path: string, init: RequestInit = {}) {
  const { publicKey, secretKey } = keys();
  if (!publicKey || !secretKey) return { ok: false, status: 0, body: { message: "SebPay n'est pas encore configuré (clés manquantes)." } };
  const headers = { "X-Public-Key": publicKey, "X-Secret-Key": secretKey, "Content-Type": "application/json", Accept: "application/json" };
  // SebPay n'accepte que les IP déclarées : passage par le relais à IP fixe quand il est configuré.
  const relay = (Deno.env.get("SEBPAY_RELAY_URL") || "").replace(/\/$/, "");
  const relaySecret = Deno.env.get("SEBPAY_RELAY_SECRET") || "";
  const res = relay && relaySecret
    ? await fetch(`${relay}/sebpay/proxy`, {
        method: "POST",
        headers: { ...headers, "x-relay-secret": relaySecret },
        body: JSON.stringify({ method: init.method === "POST" ? "POST" : "GET", path, body: init.body ? JSON.parse(String(init.body)) : undefined }),
      })
    : await fetch(`${sebpayApiUrl(publicKey, Deno.env.get("SEBPAY_API_URL"))}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/** La réponse SebPay peut être l'objet lui-même ou { data: objet }. */
const unwrap = (body: any) => (body?.data && typeof body.data === "object" && body.data.id ? body.data : body);

export async function createSebpaySession(payload: Record<string, unknown>): Promise<SebpaySession | { error: string }> {
  const res = await sebpayFetch("/checkout/sessions", { method: "POST", body: JSON.stringify(payload) });
  const session = unwrap(res.body);
  if (!res.ok || !session?.checkout_url) return { error: String(res.body?.message || res.body?.code || `HTTP ${res.status}`) };
  return session as SebpaySession;
}

export async function readSebpaySession(idOrReference: string): Promise<SebpaySession | null> {
  if (!/^[A-Za-z0-9:_.-]{1,120}$/.test(idOrReference)) return null;
  const res = await sebpayFetch(`/checkout/sessions/${idOrReference}`);
  const session = unwrap(res.body);
  return res.ok && session?.id ? (session as SebpaySession) : null;
}

export async function listSebpayOperators(country: string) {
  const res = await sebpayFetch(`/operators?country=${encodeURIComponent(country)}`);
  return res.ok ? normalizeOperators(res.body) : null;
}

/** Demande de paiement envoyée au téléphone de l'acheteur (ou lien opérateur, ou code OTP). */
export async function createSebpayCollection(payload: Record<string, unknown>) {
  const res = await sebpayFetch("/collections", { method: "POST", body: JSON.stringify(payload) });
  const data = res.body?.data && typeof res.body.data === "object" ? res.body.data : res.body;
  return { ok: res.ok && !!data?.external_reference, status: res.status, body: res.body, collection: data as { transaction_id?: string; status?: string; provider_link?: string | null; message?: string } };
}

export async function readSebpayCollection(reference: string): Promise<SebpayCollection | null> {
  // Référence « <commande>:c1 » envoyée telle quelle : le relais n'accepte que [A-Za-z0-9:_.-] (pas « %3A »).
  if (!/^[A-Za-z0-9:_.-]{1,120}$/.test(reference)) return null;
  const res = await sebpayFetch(`/collections/${reference}`);
  const data = res.body?.data && typeof res.body.data === "object" ? res.body.data : res.body;
  if (res.ok && data?.external_reference) return data as SebpayCollection;
  console.error("[sebpay] lecture collecte", reference, res.status, JSON.stringify(res.body).slice(0, 300));
  return null;
}

/** Collecte relue chez SebPay : approuvée pour cette commande au bon montant, l'accès est donné. */
async function settleCollection(admin: any, payment: any, reference: string, req?: Request): Promise<SettleResult> {
  const c = await readSebpayCollection(reference);
  if (!c) return { status: "pending", reason: "sebpay-unreachable" };
  const verdict = sebpayCollectionVerdict(c, payment);
  if (verdict.status === "paid") {
    await confirmPayment(admin, payment, { id: `sb_${c.transaction_id || c.external_reference}`, provider: "SebPay", provider_reference: c.transaction_id || c.external_reference, amount: Math.round(Number(c.amount)), currency: String(c.currency).toUpperCase(), raw: { sebpay: c } } as never, req);
    return { status: "paid" };
  }
  if (verdict.reason === "sebpay-other-order" || verdict.reason === "sebpay-amount") console.error("[sebpay]", verdict.reason, payment.id, reference);
  return { status: "pending", reason: verdict.reason };
}

/**
 * Relit le paiement SebPay de la commande : collecte (paiement dans la page) ou session hébergée.
 * `reference` : collecte précise annoncée par une notification (une tentative plus ancienne peut aboutir).
 */
export async function settleFromSebpay(admin: any, payment: any, req?: Request, reference?: string): Promise<SettleResult> {
  const stored = String(payment.sebpay_session_id || "");
  const ref = reference || (stored.startsWith(COLLECTION_PREFIX) ? stored.slice(COLLECTION_PREFIX.length) : "");
  if (ref) return settleCollection(admin, payment, ref, req);
  if (!stored) return { status: "pending", reason: "no-sebpay-session" };
  const session = await readSebpaySession(stored);
  if (!session) return { status: "pending", reason: "sebpay-unreachable" };
  const verdict = sebpayVerdict(session, payment);
  if (verdict.status === "paid") {
    await confirmPayment(admin, payment, { id: `sb_${session.id}`, provider: "SebPay", provider_reference: session.transaction_id || session.id, amount: Math.round(Number(session.amount)), currency: String(session.currency).toUpperCase(), raw: { sebpay: session } } as never, req);
    return { status: "paid" };
  }
  if (verdict.status === "failed") {
    await admin.from("payments").update({ status: "failed", raw: { ...(payment.raw ?? {}), sebpay: session } }).eq("id", payment.id).eq("status", "pending");
    return { status: "failed" };
  }
  if (verdict.reason === "sebpay-other-order" || verdict.reason === "sebpay-amount") console.error("[sebpay]", verdict.reason, payment.id, session.id);
  return { status: "pending", reason: verdict.reason };
}
