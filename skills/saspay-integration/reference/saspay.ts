import "server-only";

/**
 * ============================================================
 *  SASPAY — encaissement Mobile Money (serveur uniquement)
 * ============================================================
 * Modèle validé en production (Gosalle). Doc : https://docs.saspay.me/llms.txt
 *
 * DISCRÉTION : le client ne doit jamais savoir que le site encaisse avec SasPay.
 *  - `customer.email` envoyé à SasPay = SASPAY_EMAIL_RECUS (l'adresse du propriétaire du site),
 *    JAMAIS l'e-mail du client : c'est le propriétaire qui reçoit les reçus SasPay.
 *  - Les messages d'erreur de SasPay ne sont jamais renvoyés tels quels au navigateur.
 *
 * Variables d'environnement (serveur) :
 *   SASPAY_SECRET_KEY      sk_live_… (ou sk_test_… en développement)
 *   SASPAY_WEBHOOK_SECRET  secret de signature du webhook (affiché une seule fois par SasPay)
 *   SASPAY_EMAIL_RECUS     adresse qui reçoit les reçus SasPay à la place du client
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- réponses JSON de SasPay */
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.saspay.me/api/v1";

export class ErreurSaspay extends Error {
  constructor(
    message: string,
    public code: string,
    public http: number,
  ) {
    super(message);
  }
}

export function saspayConfigure(): boolean {
  return !!process.env.SASPAY_SECRET_KEY && !!emailRecus();
}

/** Adresse qui reçoit les reçus SasPay. Jamais celle du client. */
function emailRecus(): string | null {
  const e = process.env.SASPAY_EMAIL_RECUS?.trim();
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

/** Appel à l'API SasPay ; renvoie le contenu utile (sans l'enveloppe { success, data }). */
async function appel<T>(chemin: string, init: { method?: string; body?: unknown; idempotence?: string } = {}): Promise<T> {
  const cle = process.env.SASPAY_SECRET_KEY;
  if (!cle) throw new ErreurSaspay("Paiement non configuré", "non_configure", 503);
  const res = await fetch(`${BASE}${chemin}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${cle}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.idempotence ? { "Idempotency-Key": init.idempotence } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const texte = await res.text();
  let json: any = null;
  try {
    json = texte ? JSON.parse(texte) : null;
  } catch {
    // réponse non JSON
  }
  const contenu = json && typeof json === "object" && "success" in json && "data" in json ? json.data : json;
  if (!res.ok || json?.success === false) {
    const e = json?.error ?? json ?? {};
    const message =
      typeof e.message === "string"
        ? e.message
        : typeof e === "object"
          ? Object.values(e).flat().filter((v) => typeof v === "string").join(" ") || `Erreur ${res.status}`
          : `Erreur ${res.status}`;
    throw new ErreurSaspay(message, typeof e.code === "string" ? e.code : `http_${res.status}`, res.status);
  }
  return contenu as T;
}

// ---------- Réseaux disponibles ----------

export interface Reseau {
  code: string; // mtn_bj, moov_tg, wave_ci…
  nom: string; // « MTN MoMo Benin »
  pays: string;
  devise: string;
  /** Le client compose un code USSD AVANT de payer (ex. Orange Money CI / BF). */
  otpAvant: boolean;
  consigneOtp: string;
  /** Le client reçoit un code par SMS APRÈS la demande (ex. Wizall SN, Coris BJ). */
  otpApres: boolean;
}

const OTP_APRES = new Set(["wizall_sn", "coris_bj"]);
let cacheTarifs: { quand: number; liste: any[] } | null = null;

/** Réseaux ouverts à l'encaissement pour un pays, d'après les tarifs du compte (cache 10 min). */
export async function reseauxDuPays(pays: string): Promise<Reseau[]> {
  if (!cacheTarifs || Date.now() - cacheTarifs.quand > 10 * 60_000) {
    const liste = await appel<any>("/pricing/my-rates/");
    cacheTarifs = { quand: Date.now(), liste: Array.isArray(liste) ? liste : (liste?.results ?? []) };
  }
  return cacheTarifs.liste
    .filter((r) => r.country_code === pays && r.payin?.available)
    .map((r) => ({
      code: r.network_code,
      nom: r.network_name,
      pays: r.country_code,
      devise: r.currency,
      otpAvant: !!r.payin?.otp_required,
      consigneOtp: r.payin?.otp_instructions ?? "",
      otpApres: OTP_APRES.has(r.network_code),
    }));
}

// ---------- Paiement ----------

export interface DemandePaiement {
  /** Id de la commande chez nous : sert de clé d'idempotence (pas de double débit sur un retry). */
  commandeId: string;
  montant: number; // entier, en FCFA
  devise: string; // XOF ou XAF
  pays: string; // BJ, TG, CI…
  reseau: string; // code réseau
  telephone: string; // +229…
  prenom: string;
  nom: string;
  /** Texte neutre, à la marque du site (jamais « SasPay »). */
  description: string;
  urlRetour: string;
  otp?: string;
}

export interface ReponsePaiement {
  id: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";
  checkout_url?: string;
}

/** Envoie la demande sur le téléphone du client (ou renvoie la page de l'opérateur à ouvrir). */
export function demanderPaiement(d: DemandePaiement) {
  const email = emailRecus();
  if (!email) throw new ErreurSaspay("SASPAY_EMAIL_RECUS manquant", "non_configure", 503);
  return appel<ReponsePaiement>("/payments/softpay/", {
    method: "POST",
    idempotence: d.commandeId,
    body: {
      amount: `${Math.round(d.montant)}.00`,
      currency: d.devise,
      country: d.pays,
      network: d.reseau,
      description: d.description.slice(0, 120),
      // E-mail du PROPRIÉTAIRE : les reçus SasPay lui arrivent, le client ne reçoit rien de SasPay.
      customer: { email, first_name: d.prenom, last_name: d.nom, phone: d.telephone },
      metadata: { commande_id: d.commandeId },
      return_url: d.urlRetour,
      ...(d.otp ? { otp: d.otp } : {}),
    },
  });
}

/** État réel d'un paiement (SasPay revérifie auprès de l'opérateur). */
export function verifierPaiement(id: string) {
  return appel<{ id: string; status: ReponsePaiement["status"]; requested_amount?: string; currency?: string }>(
    `/payments/${encodeURIComponent(id)}/verify/`,
  );
}

/** Code reçu par SMS APRÈS la demande (Wizall SN, Coris BJ). */
export function confirmerOtp(id: string, otp: string) {
  return appel<{ id: string; status: ReponsePaiement["status"] }>(`/payments/${encodeURIComponent(id)}/confirm-otp/`, {
    method: "POST",
    body: { otp },
  });
}

// ---------- Messages pour le client (jamais le texte brut de SasPay) ----------

export function messageClient(e: unknown): string {
  if (e instanceof ErreurSaspay) {
    switch (e.code) {
      case "prepayment_otp_missing":
        return "Ce réseau demande un code de paiement : composez le code indiqué sur votre téléphone, puis saisissez-le.";
      case "invalid_customer":
        return "Le numéro Mobile Money n'est pas accepté. Vérifiez-le.";
      case "invalid_method":
      case "no_route_available":
        return "Ce réseau n'est pas disponible pour le moment. Essayez un autre opérateur.";
      case "non_configure":
        return "Le paiement en ligne n'est pas encore activé.";
    }
    if (e.http === 429) return "Trop de tentatives. Patientez une minute puis réessayez.";
  }
  return "Le paiement n'a pas pu être lancé. Réessayez dans un instant.";
}

// ---------- Notifications (webhooks) ----------

/** Signature HMAC-SHA256 hex de `${horodatage}.${corps brut}`, fenêtre de 5 minutes, comparaison en temps constant. */
export function signatureValide(corpsBrut: string, signature: string | null, horodatage: string | null): boolean {
  const secret = process.env.SASPAY_WEBHOOK_SECRET;
  if (!secret || !signature || !horodatage) return false;
  const maintenant = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(Number(horodatage)) || Math.abs(maintenant - Number(horodatage)) > 300) return false;
  const attendue = createHmac("sha256", secret).update(`${horodatage}.${corpsBrut}`).digest("hex");
  const a = Buffer.from(signature.trim().toLowerCase());
  const b = Buffer.from(attendue);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- Utilitaires ----------

/** Devise de la zone FCFA : XAF en Afrique centrale, XOF en Afrique de l'Ouest. */
export function deviseDuPays(pays: string): string {
  return ["CM", "GA", "CG", "TD", "CF", "GQ"].includes(pays) ? "XAF" : "XOF";
}

export const INDICATIFS: Record<string, string> = {
  BJ: "229", CI: "225", SN: "221", TG: "228", BF: "226", ML: "223", NE: "227", GN: "224",
  CM: "237", GA: "241", CG: "242", TD: "235", CF: "236", CD: "243",
};
