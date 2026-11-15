/**
 * Routes serveur (Next.js App Router) — à découper en fichiers et ADAPTER au projet.
 * Les noms de routes sont NEUTRES (/api/paiement/…) : le navigateur ne voit jamais « saspay ».
 *
 *   app/api/paiement/reseaux/route.ts       GET  ?pays=BJ        → opérateurs avec logo
 *   app/api/paiement/payer/route.ts         POST                  → lance la demande
 *   app/api/paiement/statut/route.ts        GET  ?id=<commande>   → la page interroge toutes les 3 s
 *   app/api/paiement/code/route.ts          POST                  → code SMS reçu APRÈS (Wizall, Coris)
 *   app/api/paiement/notification/route.ts  POST                  → webhook SasPay signé
 *
 * Table d'exemple « commandes » : id uuid, client_id, montant int, statut ('en_attente'|'paye'|'echoue'),
 * reseau text, telephone text, reference text unique (id SasPay), paye_le timestamptz.
 * `livrer(commandeId)` = fonction UNIQUE et IDEMPOTENTE qui donne l'accès / valide la vente
 * (ex. fonction SQL qui ne fait rien si la commande est déjà « paye »).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

import {
  confirmerOtp, demanderPaiement, deviseDuPays, INDICATIFS, messageClient, reseauxDuPays, signatureValide, verifierPaiement,
} from "@/lib/paiement/saspay";

// À fournir par le projet :
declare function clientConnecte(): Promise<{ id: string; prenom: string; nom: string } | null>;
declare function db(): any; // client base de données côté serveur (ex. supabaseAdmin())
declare function livrer(commandeId: string): Promise<void>; // idempotent
declare function prixDuProduit(produitId: string): Promise<{ montant: number; libelle: string } | null>;
const MARQUE = "MaMarque"; // nom du site : c'est lui que le client voit

// ---------- GET /api/paiement/reseaux?pays=BJ ----------
export async function GET_reseaux(req: Request) {
  const pays = (new URL(req.url).searchParams.get("pays") ?? "BJ").toUpperCase().slice(0, 2);
  try {
    const reseaux = await reseauxDuPays(pays);
    // On ne renvoie que ce dont la page a besoin.
    return NextResponse.json({ reseaux: reseaux.map(({ code, nom, otpAvant, consigneOtp, otpApres }) => ({ code, nom, otpAvant, consigneOtp, otpApres })) });
  } catch (e) {
    console.error("[paiement] réseaux indisponibles", e);
    return NextResponse.json({ reseaux: [] });
  }
}

// ---------- POST /api/paiement/payer ----------
export async function POST_payer(req: Request) {
  const client = await clientConnecte();
  if (!client) return NextResponse.json({ erreur: "Connectez-vous à nouveau." }, { status: 401 });

  const corps = (await req.json().catch(() => null)) as { produit?: string; pays?: string; reseau?: string; numero?: string; otp?: string } | null;
  const pays = String(corps?.pays ?? "").toUpperCase();
  const chiffres = String(corps?.numero ?? "").replace(/\D/g, "");
  const otp = String(corps?.otp ?? "").replace(/\s/g, "").slice(0, 12);

  // Le prix vient TOUJOURS du serveur, jamais du navigateur.
  const produit = await prixDuProduit(String(corps?.produit ?? ""));
  if (!produit) return NextResponse.json({ erreur: "Produit inconnu." }, { status: 400 });
  if (!INDICATIFS[pays] || chiffres.length < 8 || chiffres.length > 10) {
    return NextResponse.json({ erreur: "Entrez le numéro Mobile Money complet." }, { status: 400 });
  }

  let reseau;
  try {
    reseau = (await reseauxDuPays(pays)).find((r) => r.code === corps?.reseau);
  } catch (e) {
    console.error("[paiement]", e);
    return NextResponse.json({ erreur: messageClient(e) }, { status: 502 });
  }
  if (!reseau) return NextResponse.json({ erreur: "Choisissez votre opérateur Mobile Money." }, { status: 400 });
  if (reseau.otpAvant && !otp) return NextResponse.json({ erreur: "Saisissez le code de paiement obtenu sur votre téléphone." }, { status: 400 });

  const telephone = `+${INDICATIFS[pays]}${chiffres}`;
  const { data: c, error } = await db()
    .from("commandes")
    .insert({ client_id: client.id, montant: produit.montant, statut: "en_attente", reseau: reseau.code, telephone })
    .select("id")
    .single();
  if (error || !c) return NextResponse.json({ erreur: "Le paiement n'a pas pu être lancé. Réessayez." }, { status: 500 });

  try {
    const r = await demanderPaiement({
      commandeId: c.id,
      montant: produit.montant,
      devise: deviseDuPays(pays),
      pays,
      reseau: reseau.code,
      telephone,
      prenom: client.prenom || "Client",
      nom: client.nom || MARQUE,
      description: `${MARQUE} — ${produit.libelle}`,
      urlRetour: `${new URL(req.url).origin}/paiement/merci?commande=${c.id}`,
      otp: reseau.otpAvant ? otp : undefined,
    });
    await db().from("commandes").update({ reference: r.id, ...(r.status === "FAILED" ? { statut: "echoue" } : {}) }).eq("id", c.id);
    return NextResponse.json({
      commandeId: c.id,
      statut: r.status,
      // Wave, Orange Money, Djamo : la page de l'opérateur à ouvrir (sinon aucun paiement n'a lieu).
      pageOperateur: r.checkout_url || null,
      otpApres: reseau.otpApres,
    });
  } catch (e) {
    console.error("[paiement] demande refusée", e); // log serveur seulement
    await db().from("commandes").update({ statut: "echoue" }).eq("id", c.id);
    return NextResponse.json({ erreur: messageClient(e) }, { status: 502 });
  }
}

// ---------- Vérification commune (page, webhook, rattrapage) ----------
export async function actualiser(commandeId: string): Promise<"paye" | "echoue" | "en_attente"> {
  const { data: c } = await db().from("commandes").select("id, statut, reference, montant").eq("id", commandeId).maybeSingle();
  if (!c) throw new Error("commande_introuvable");
  if (c.statut === "paye") return "paye";
  if (!c.reference) return c.statut;

  const v = await verifierPaiement(c.reference);
  if (v.status === "SUCCESS") {
    // Contrôle du montant : SasPay doit avoir encaissé ce qui a été demandé.
    if (v.requested_amount && Math.round(Number(v.requested_amount)) !== c.montant) {
      console.error("[paiement] montant différent", { commandeId, attendu: c.montant, recu: v.requested_amount });
      return "en_attente";
    }
    await livrer(commandeId); // idempotent
    return "paye";
  }
  if (v.status === "FAILED" || v.status === "CANCELLED") {
    await db().from("commandes").update({ statut: "echoue" }).eq("id", commandeId).eq("statut", "en_attente");
    return "echoue";
  }
  return "en_attente";
}

// ---------- GET /api/paiement/statut?id=… ----------
export async function GET_statut(req: Request) {
  const client = await clientConnecte();
  if (!client) return NextResponse.json({ erreur: "connexion_requise" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erreur: "inconnu" }, { status: 400 });
  const { data: c } = await db().from("commandes").select("client_id").eq("id", id).maybeSingle();
  if (!c || c.client_id !== client.id) return NextResponse.json({ erreur: "inconnu" }, { status: 404 });
  try {
    return NextResponse.json({ etat: await actualiser(id) });
  } catch (e) {
    console.error("[paiement] vérification impossible", e);
    return NextResponse.json({ etat: "en_attente" });
  }
}

// ---------- POST /api/paiement/code (code SMS reçu APRÈS la demande) ----------
export async function POST_code(req: Request) {
  const client = await clientConnecte();
  if (!client) return NextResponse.json({ erreur: "Connectez-vous à nouveau." }, { status: 401 });
  const corps = (await req.json().catch(() => null)) as { id?: string; otp?: string } | null;
  const otp = String(corps?.otp ?? "").replace(/\s/g, "");
  if (!otp) return NextResponse.json({ erreur: "Saisissez le code reçu par SMS." }, { status: 400 });
  const { data: c } = await db().from("commandes").select("client_id, reference").eq("id", String(corps?.id ?? "")).maybeSingle();
  if (!c || c.client_id !== client.id || !c.reference) return NextResponse.json({ erreur: "Paiement inconnu." }, { status: 404 });
  try {
    await confirmerOtp(c.reference, otp);
  } catch (e) {
    console.error("[paiement] code refusé", e);
    return NextResponse.json({ erreur: "Code refusé. Vérifiez-le ou réessayez." }, { status: 422 });
  }
  return NextResponse.json({ etat: await actualiser(String(corps?.id)) });
}

// ---------- POST /api/paiement/notification (webhook SasPay) ----------
// À déclarer dans le tableau de bord SasPay → Développeur → Webhooks :
//   URL https://<site>/api/paiement/notification — événements transaction.success, transaction.failed
export async function POST_notification(req: Request) {
  const brut = await req.text(); // corps BRUT : la signature se calcule dessus
  if (!signatureValide(brut, req.headers.get("x-webhook-signature"), req.headers.get("x-webhook-timestamp"))) {
    return NextResponse.json({ erreur: "signature_invalide" }, { status: 403 });
  }
  let ev: { event?: string; data?: { id?: string } } = {};
  try {
    ev = JSON.parse(brut);
  } catch {
    return NextResponse.json({ erreur: "json_invalide" }, { status: 400 });
  }
  if (ev.event === "webhook.test") return NextResponse.json({ ok: true });
  const reference = ev.data?.id;
  if (!reference || !String(ev.event ?? "").startsWith("transaction.")) return NextResponse.json({ ok: true });

  const { data: c } = await db().from("commandes").select("id").eq("reference", reference).maybeSingle();
  if (!c) return NextResponse.json({ ok: true, ignore: "inconnu" });
  try {
    // On REVÉRIFIE auprès de SasPay : la notification seule ne prouve rien.
    return NextResponse.json({ ok: true, etat: await actualiser(c.id) });
  } catch (e) {
    console.error("[paiement] webhook", e);
    return NextResponse.json({ erreur: "temporaire" }, { status: 500 }); // SasPay renverra plus tard
  }
}
