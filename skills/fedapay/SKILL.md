---
name: fedapay
description: "Intégrer FedaPay (Mobile Money + carte Visa/Mastercard, Bénin, Togo, Côte d'Ivoire, Niger, Sénégal) DANS la page de paiement d'un site — transaction créée côté serveur, paiement sans redirection (le client valide sur son téléphone) ou formulaire Checkout.js intégré, webhook signé X-FEDAPAY-SIGNATURE, revérification serveur et passage tout seul sur la page de remerciement. Pose d'abord les questions nécessaires. Déclencheurs : « FedaPay », « Feda Pay », « intègre FedaPay », « paiement FedaPay », « Feda Checkout », « FedaPay ne valide pas la vente »."
---

# Intégration FedaPay dans la page de paiement

Documentation officielle : https://docs.fedapay.com (index complet : https://docs.fedapay.com/llms.txt). La relire si un champ a pu changer.

Parcours visé : le client choisit son opérateur dans la page, garde le numéro déjà saisi, clique « Payer maintenant », valide sur son téléphone ; la page part **seule** sur la confirmation. Pas de bouton « Vérifier ».

## 1. Questions à poser AVANT de coder (une seule fois, en bloc)

1. **Clés API** (tableau de bord FedaPay → Paramètres → API) : mode **sandbox** pour tester, puis **live**.
   - Clé secrète (`sk_sandbox_…` / `sk_live_…`) : uniquement dans les secrets serveur (`FEDAPAY_SECRET_KEY`), jamais dans le code ni dans git.
   - Clé publique (`pk_…`) : peut aller dans le code du site (seulement pour Checkout.js).
   - L'utilisateur ne colle jamais ses clés dans le chat : il les pose lui-même dans les secrets (ex. Supabase → Edge Functions → Secrets, ou `npx supabase secrets set …` avec saisie masquée). Vérifier ensuite leur **présence par leur nom**, jamais leur valeur.
2. **Backend** : Supabase Edge Functions, Next.js API, Node/Express, autre ? URL publique du webhook.
3. **Pays et opérateurs** à proposer, devise (XOF par défaut).
4. **Mode d'intégration** :
   - **A. Sans redirection via l'API (recommandé)** : nos propres boutons opérateurs, le client valide sur son téléphone ;
   - **B. Checkout.js intégré** (`container`) : formulaire FedaPay dans la page, carte bancaire comprise ;
   - **C. Page hébergée** (`token.url`) : le plus simple, mais redirection.
5. **Après paiement** : commande à marquer payée, accès à donner, page de confirmation, e-mails.
6. **Domaine du site** : à autoriser dans FedaPay (photo de profil → Applications → « Nom de domaine à autoriser ») si Checkout.js est utilisé, sinon les clients tombent sur l'inscription FedaPay.

Ne rien inventer : si une info manque, la demander.

## 2. API

- Base : **live** `https://api.fedapay.com/v1`, **sandbox** `https://sandbox-api.fedapay.com/v1`. Choisir selon le préfixe de la clé (`sk_live_` → live).
- En-têtes : `Authorization: Bearer <clé secrète>`, `Content-Type: application/json`.
- SDK officiel Node possible (`npm i fedapay` : `FedaPay.setApiKey`, `FedaPay.setEnvironment('live')`, `Transaction.create`, `generateToken`, `sendNowWithToken`). En Edge Function Deno, préférer `fetch` direct.
- Les réponses sont enveloppées : création/lecture → `{ "v1/transaction": { id, reference, status, amount, … } }`. Lire `json["v1/transaction"] ?? json`.

**Créer la transaction** — `POST /transactions` :
```json
{
  "description": "Commande <id interne>",
  "amount": 19000,
  "currency": { "iso": "XOF" },
  "callback_url": "https://site/payment/success?payment=<id>",
  "merchant_reference": "<id commande interne>",
  "custom_metadata": { "payment_id": "<id commande interne>" },
  "customer": {
    "firstname": "…", "lastname": "…", "email": "…",
    "phone_number": { "number": "+22997000000", "country": "bj" }
  }
}
```
- `amount` : **entier**.
- `merchant_reference` doit être **unique** : si la commande est recréée (code promo…), suffixer (`<id>-2`).
- FedaPay identifie un client par son **e-mail** : même e-mail + autre nom = le client existant est mis à jour. Ne pas s'en servir comme identité de commande.
- Stocker `id` de la transaction FedaPay sur la commande (colonne `fedapay_transaction_id`, unique).

**Obtenir le jeton / lien** — `POST /transactions/{id}/token` → `{ token, url }`. `url` = page hébergée (mode C). `token` sert au mode A.

**Payer sans redirection (mode A)** — `POST /{mode}` avec :
```json
{ "token": "<token>", "phone_number": { "number": "97000000", "country": "bj" } }
```
Modes disponibles sans redirection (à revérifier sur https://docs.fedapay.com/fr/payment-methods) :
| Pays | Opérateur → `mode` |
|---|---|
| Bénin | MTN → `mtn_open`, Moov → `moov`, Celtiis → `sbin` |
| Togo | Moov → `moov_tg`, Mixx by Yas → `togocel` |
| Côte d'Ivoire | MTN → `mtn_ci` |
| Niger | Airtel → `airtel_ne` |
| Sénégal | Free → `free_sn` |
Les autres moyens (BMO, Coris Money, carte Visa/Mastercard) passent par Checkout.js ou la page hébergée.
Le client reçoit une demande de validation (USSD / notification) sur son téléphone. Afficher « Valide le paiement sur ton téléphone ».

**Lire une transaction** — `GET /transactions/{id}` (ou `GET /transactions/merchant/{merchant_reference}`).

**Statuts** : `pending` (défaut, expire après 24 h), `approved` (payé), `declined`, `canceled` (non finaux : une nouvelle tentative est possible), `refunded`, `transferred` (payé, fonds reversés au marchand), `expired`.
Considérer comme **payé** : `approved`, `transferred` (et leurs variantes `*_partially_refunded`).

## 3. Validation (fonction unique, commune à la page, au webhook et au rattrapage)

`settleFromFedaPay(order)` :
1. `GET /transactions/{fedapay_transaction_id}` avec la clé secrète. **Ne jamais croire** le `status` passé dans l'URL de retour (`?id=…&status=approved`) ni le webhook seul.
2. Vérifier : `merchant_reference` (ou `custom_metadata.payment_id`) = la commande, devise XOF, `amount >= montant attendu`, statut payé.
3. Payé → confirmer avec une fonction **idempotente** (accès, e-mails, pixel), moyen « FedaPay (<mode>) ».
4. `declined` / `canceled` → remettre le formulaire avec un message clair ; le client peut réessayer (nouvelle transaction si besoin).
5. `pending` → attendre.

## 4. Webhook (obligatoire)

- Tableau de bord → Webhooks → **Créer** : URL publique de la fonction (Supabase : déployer avec `--no-verify-jwt` / `verify_jwt = false`). Ne cocher que `transaction.approved`, `transaction.declined`, `transaction.canceled`, `transaction.transferred`, `transaction.updated`.
- Secret du point de terminaison (`wh_live_…` / `wh_sandbox_…`, différent entre sandbox et live) → `FEDAPAY_WEBHOOK_SECRET`.
- **Signature** (même algorithme que le SDK officiel `Webhook.constructEvent`) :
  - en-tête `x-fedapay-signature: t=<timestamp>,s=<signature hex>` ;
  - attendu = HMAC-SHA256 hex de `` `${t}.${corpsBrut}` `` avec le secret du webhook ;
  - comparaison à temps constant, fenêtre de 5 min ; lire le **corps brut** avant tout `JSON.parse` ; 400 si invalide.
- Corps : `{ name: "transaction.approved", entity: { id, reference, status, amount, merchant_reference, … } }`.
- Retrouver la commande par `entity.id` (ou `merchant_reference`), puis **appeler `settleFromFedaPay`** (relecture API). Anti-doublon : ignorer un événement qui ne change pas le statut ; ne jamais repasser une commande payée à un autre statut.
- Répondre **2xx** vite. FedaPay réessaie 9 fois puis **désactive** le webhook après 10 échecs : décocher « Désactiver le webhook lorsque l'application génère des erreurs ».

```ts
async function verifyFedaPaySignature(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2)));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const sig = String(parts.s ?? "");
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
```

**Rattrapage** : un cron toutes les 2 min (`pg_cron` + `pg_net`, ou cron Vercel) revérifie les commandes en attente des 48 dernières heures ayant un `fedapay_transaction_id`.

## 5. Page de paiement

**Mode A (sans redirection)** — fonction serveur `fedapay-checkout` (commande retrouvée par `payment_id` + hash SHA-256 d'un `checkout_token`, jamais par un id seul) :
- `start` : renvoie les opérateurs du pays du client + numéro déjà saisi.
- `collect` : crée la transaction (si absente), le token, puis `POST /{mode}`. Ne pas relancer une nouvelle demande tant qu'une transaction est `pending` depuis moins de 2 min (le client paierait deux fois).
- `status` : appelle `settleFromFedaPay`.
- Front : boutons opérateurs (logo rond + nom), numéro avec indicatif fixe, bouton pilule « Payer maintenant », puis écran d'attente ; sondage toutes les **3 s** (≈ 10 min max) et redirection **automatique** vers `/payment/success` dès que la commande est payée.

**Mode B (Checkout.js intégré)** :
```html
<script src="https://cdn.fedapay.com/checkout.js?v=1.1.7"></script>
<div id="fedapay-embed" style="width:100%;height:520px"></div>
<script>
  FedaPay.init({
    public_key: "<clé publique>",
    transaction: { amount: 19000, description: "Commande <id>" },
    customer: { email, firstname, lastname },
    container: "#fedapay-embed",
  });
</script>
```
- Le montant affiché côté navigateur n'est pas une preuve : la validation se fait **toujours** côté serveur (relecture API + montant attendu), et le webhook rattache la transaction à la commande via `merchant_reference` / `custom_metadata` ou l'e-mail + montant si Checkout.js crée lui-même la transaction.
- CSP : autoriser `https://cdn.fedapay.com` (`script-src`) et `https://*.fedapay.com` (`frame-src`, `connect-src`).

**Page de confirmation** : vérifie encore toutes les 3 s si besoin, ne nomme pas le prestataire (« Quelques secondes, nous confirmons ton paiement. »).

## 6. Valider

- Tester d'abord en **sandbox** (numéros de test de la doc FedaPay), puis faire faire **par l'utilisateur** un vrai petit paiement en live.
- Vérifier en base : `status = paid`, accès donné, e-mail parti ; dans FedaPay : transaction `approved`, webhook en 2xx dans les Logs.
- Ne jamais déclencher de paiement réel ni créer de fausses commandes en production soi-même. Les clés restent dans les secrets serveur.
