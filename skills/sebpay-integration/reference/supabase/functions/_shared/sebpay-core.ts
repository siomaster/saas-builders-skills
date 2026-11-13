/**
 * SebPay, partie sans dépendance (testée avec Vitest) : serveur selon la clé, vérification de la
 * signature des notifications, lecture d'une session.
 */

/** Clé de test (pk_test_) : serveur sandbox ; sinon le serveur réel. */
export const sebpayApiUrl = (publicKey: string, override?: string) =>
  (override || (publicKey.startsWith("pk_test_") ? "https://api.sandbox.sebpay.bj/api/v1" : "https://newapi.sebpay.bj/api/v1")).replace(/\/$/, "");

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Signature X-SebPay-Signature : HMAC-SHA256 (hexadécimal) du corps brut, avec la clé secrète. Comparaison à temps constant. */
export async function verifySebpaySignature(rawBody: string, signature: string, secretKey: string) {
  if (!signature || !secretKey) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const given = signature.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export type SebpaySession = {
  id: string;
  status: "open" | "completed" | "expired";
  transaction_id?: string | null;
  transaction_status?: "pending" | "approved" | "rejected" | null;
  external_reference?: string | null;
  metadata?: Record<string, unknown> | null;
  amount: number;
  currency: string;
  checkout_url: string;
  expires_at: string;
};

/**
 * Ce que dit la session d'une commande : payée seulement si SebPay l'a approuvée, pour cette commande,
 * au bon montant et dans la bonne devise ; expirée sans paiement = échec ; sinon en attente.
 */
export function sebpayVerdict(session: SebpaySession, payment: { id: string; amount: number | string; currency?: string | null }): { status: "paid" | "failed" | "pending"; reason?: string } {
  const ref = String(session.external_reference ?? "");
  const owner = String(session.metadata?.payment_id ?? "") || ref.split(":")[0];
  if (owner !== payment.id) return { status: "pending", reason: "sebpay-other-order" };
  if (session.transaction_status === "approved") {
    if (String(session.currency).toUpperCase() !== String(payment.currency || "XOF").toUpperCase() || Number(session.amount) + 1 < Number(payment.amount)) {
      return { status: "pending", reason: "sebpay-amount" };
    }
    return { status: "paid" };
  }
  if (session.status === "expired") return { status: "failed" };
  return { status: "pending", reason: `sebpay-${session.transaction_status ?? session.status}` };
}

/**
 * Paiement direct dans la page (API Collectes) : la référence de la collecte est gardée dans
 * payments.sebpay_session_id avec ce préfixe, pour réutiliser la relecture (vérification, balayage).
 */
export const COLLECTION_PREFIX = "col:";

export type SebpayCollection = {
  transaction_id?: string | null;
  external_reference: string;
  status: "pending" | "approved" | "rejected";
  amount: number;
  currency: string;
};

/** Collecte de cette commande approuvée au bon montant = payée ; refusée = à refaire (la commande reste payable). */
export function sebpayCollectionVerdict(c: SebpayCollection, payment: { id: string; amount: number | string; currency?: string | null }): { status: "paid" | "pending"; reason?: string } {
  if (String(c.external_reference ?? "").split(":")[0] !== payment.id) return { status: "pending", reason: "sebpay-other-order" };
  if (c.status === "approved") {
    if (String(c.currency).toUpperCase() !== String(payment.currency || "XOF").toUpperCase() || Number(c.amount) + 1 < Number(payment.amount)) return { status: "pending", reason: "sebpay-amount" };
    return { status: "paid" };
  }
  return { status: "pending", reason: c.status === "rejected" ? "sebpay-rejected" : "sebpay-pending" };
}

export type SebpayOperator = { code: string; name: string; otp: boolean; ussd: string | null };

/** Liste d'opérateurs SebPay (tableau seul ou { data: [...] }) ramenée à ce que la page affiche. */
export function normalizeOperators(body: unknown): SebpayOperator[] {
  const list = Array.isArray(body) ? body : Array.isArray((body as { data?: unknown })?.data) ? (body as { data: unknown[] }).data : [];
  return list
    .map((o: any) => ({ code: String(o?.code || o?.slug || ""), name: String(o?.name || o?.code || ""), otp: o?.otp_required === true, ussd: o?.ussd_code ? String(o.ussd_code) : null }))
    .filter((o) => o.code && o.name);
}

/** Message pour l'acheteur selon le refus SebPay (codes de la doc Collectes). */
export function collectionErrorMessage(status: number, body: any): { message: string; otp?: boolean } {
  const code = String(body?.code || body?.error || body?.errors?.code || "").toUpperCase();
  const text = String(body?.message || "");
  if (code.includes("OTP") || /otp/i.test(text)) return { message: "Cet opérateur demande un code de validation : compose le code indiqué sur ton téléphone puis saisis le code reçu.", otp: true };
  if (code.includes("AMOUNT_TOO_LOW")) return { message: "Montant trop faible pour cet opérateur." };
  if (code.includes("DECLINED") || status === 400) return { message: "L'opérateur a refusé la demande : vérifie le numéro et l'opérateur, puis réessaie." };
  if (status === 503 || code.includes("MAINTENANCE")) return { message: "Cet opérateur est momentanément indisponible. Réessaie plus tard ou choisis un autre opérateur." };
  return { message: "Le paiement Mobile Money n'a pas pu démarrer. Réessaie dans un instant." };
}
