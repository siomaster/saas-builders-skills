---
name: nyole
description: "Intégrer le paiement Mobile Money Nyole / Cartflox (app.nyole.com, API cartflox.com) dans un projet web, comme sur OSKOOL — session de paiement serveur, widget SoftPay dans la page, webhook signé HMAC, vérification du statut, contournement PayDunya → PawaPay. Pose d'abord les questions nécessaires. Déclencheurs : « Nyole », « Niole », « Cartflox », « SoftPay », « intègre le Mobile Money », « paiement MTN / Moov / Orange / Wave »."
---

# Intégration Nyole / Cartflox (modèle OSKOOL)

Nyole (tableau de bord : https://app.nyole.com) s'appuie sur l'API **Cartflox**.

Architecture de référence (validée en production, fichiers à créer dans le projet) :
- `supabase/functions/_shared/cartflox.ts`
- `supabase/functions/create-payment/index.ts`
- `supabase/functions/cartflox-webhook/index.ts`
- `supabase/functions/verify-payment/index.ts`
- `supabase/functions/cartflox-softpay-proxy/index.ts`
- `src/pages/Checkout.tsx` (widget SoftPay)

## 1. Questions à poser AVANT de coder

1. **Clé secrète** Cartflox (`af_live_sec_…` ou de test) et **clé publique** (`af_live_pub_…`).
   - La clé secrète va uniquement dans les secrets serveur (`CARTFLOX_SECRET_KEY`).
   - La clé publique peut aller dans le code du site.
2. **Backend** : Supabase Edge Functions, Node, autre ? URL publique du webhook ?
3. **Pays et devise** : XOF par défaut ; quels pays / opérateurs proposer ?
4. **Intégration** :
   - widget **SoftPay** dans la page (recommandé) ;
   - ou redirection / iframe vers la page hébergée (`session.url`).
5. **Après paiement** : commande à marquer payée, accès à donner, page de confirmation, e-mails.

## 2. API

Base : `https://cartflox.com/api/v1`.

**Avec la clé secrète** (`Authorization: Bearer <secret>`) :
- **Créer une session** : `POST /checkout/sessions`
  - en-tête `Idempotency-Key: <id commande interne>` ;
  - corps : `amount` (entier, XOF), `currency: "XOF"`, `customer_name`, `customer_email`, `customer_phone` (format +229…), `description`, `success_url`, `cancel_url`, `metadata` (objet libre : `payment_id`, `user_id`…) ;
  - réponse : `{ id, url, order_id }`. Stocker `id` (provider_token).
- **Statut** : `GET /checkout/sessions/{id}/status` → `{ status: PENDING|SUCCESS|FAILED|CANCELLED|REFUNDED, paid, amount, currency, provider, provider_reference }`.
- **Configurer le webhook** : `PATCH /config/webhook` avec `{ "webhookUrl": "https://…/cartflox-webhook" }`. Une fois par instance, jamais dans le chemin critique d'une commande.

**Avec la clé publique** (`x-api-key`), utilisée par le widget :
- `GET /checkout/sessions/{id}/methods?country=bj` : moyens proposés ;
- `GET /checkout/sessions/{id}/status` ;
- `POST https://cartflox.com/api/checkout/initiate` (hors `/v1`), avec `{ transactionId, gatewayId, methodCode, customerDetails: { name, email, phone, country, otp } }`.

**Montant** : Cartflox peut renvoyer le montant **frais inclus**. Accepter `reçu ≥ attendu` et `reçu − attendu ≤ max(100, 10 % de l'attendu)`.

## 3. Webhook (obligatoire, idempotent)

- Événements : `payment.completed`, `payment.failed`, `payment.cancelled`, `payment.updated`. L'objet est dans `data` (`id` = session, `metadata.payment_id`, `status`).
- **Signature** :
  - en-tête `x-afriflow-signature: t=<ts>,v1=<hex>`, et/ou `x-afriflow-timestamp` ;
  - calcul : HMAC-SHA256 de `${ts}.${corpsBrut}` avec la **clé secrète**, comparé en temps constant ;
  - lire le **corps brut** avant tout `JSON.parse`.
- **Fenêtre d'horodatage : 72 h.** Cartflox rejoue un événement non acquitté avec son horodatage d'origine : une fenêtre de 5 min rejette toutes les relances.
- **Anti-doublon** : table d'événements, clé = sha256(`event|data.id|timestamp`). Si l'événement est déjà vu → répondre 200 sans retraiter.
- **Ne jamais croire le webhook seul** : relire le statut avec la clé secrète, vérifier que la session est bien celle de la commande et que le montant est le bon, puis confirmer (fonction unique idempotente).
- Le widget SoftPay réécrit `metadata.source` en « softpay » et retire les champs nuls : ne pas exiger une égalité stricte des metadata.

## 4. Widget SoftPay (paiement dans la page)

- Script : `https://cartflox.com/cartflox-softpay.js`, préchargé pendant la saisie des coordonnées.
- Configuration : `window.Cartflox.softpay.configure({ publicKey, country: "bj", locale: "fr" })`.
- Montage : `window.Cartflox.softpay.mount({...})` avec :
  - `container`, `title`, `amount`, `currency`, `description` ;
  - `customer_name`, `customer_email`, `customer_phone`, `metadata` ;
  - `success_url`, `cancel_url` ;
  - `theme: { accent, "accent-text", radius, field, border, font }` ;
  - `autoRedirect: false` ;
  - `onSession(s)` : rattacher `s.id` à la commande ;
  - `onSuccess` : lancer la vérification serveur.
  `mount` renvoie un handle avec `destroy()`.
- **Un seul montage par commande** : chaque montage crée une session Cartflox.
- **Proxy** : OSKOOL intercepte `window.fetch` du widget (`installSoftpayProxy`) et fait passer les appels `cartflox.com` par une fonction serveur (`cartflox-softpay-proxy`). Celle-ci vérifie `payment_id + checkout_token`, impose le montant, remappe les moyens de paiement et sert de point de secours.
- **Vérification côté client** : appeler toutes les 3 s une fonction `verify-payment` (≈ 10 min maximum). Elle relit le statut chez Cartflox et confirme. Ne jamais demander au client de cliquer « Vérifier ».

## 5. Pièges connus (octobre 2026)

- **La passerelle PayDunya échoue sur tous les paiements depuis le 20/10/2026** (échec en environ 1 s, sans motif). Router les mêmes opérateurs via **PawaPay** (`gatewayId: "plateforme-pawapay"`) :
  - mtn-benin → MTN_MOMO_BEN ; moov-benin → MOOV_BEN ;
  - mtn-ci → MTN_MOMO_CIV ; orange-money-ci → ORANGE_CIV ;
  - moov-burkina-faso → MOOV_BFA ; orange-money-burkina → ORANGE_BFA ;
  - orange-money-senegal → ORANGE_SEN ; free-money-senegal → FREE_SEN.
  Si PawaPay refuse, réessayer via PayDunya.
- `INSUFFICIENT_BALANCE` (fréquent au Cameroun et au Congo) = solde du client insuffisant, pas un bug.
- Pour diagnostiquer, l'historique des transactions sur https://app.nyole.com/transactions montre la passerelle et le motif d'échec.

## 6. Règles

- Ne jamais déclencher de paiement réel ni créer de fausses commandes en production sans accord explicite. Les sessions de test restent visibles chez Nyole.
- Hors d'Afrique, ne pas afficher les logos Mobile Money ni de montants en F CFA : y proposer la carte ou PayPal (voir le skill `paypal`).
