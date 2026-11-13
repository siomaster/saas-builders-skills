---
name: dodo-payment-integration
description: "Intégrer Dodo Payments (carte bancaire, vendeur officiel qui gère la TVA) DANS la page de paiement d'un site, exactement comme sur OSKOOL — formulaire de carte intégré qui s'ouvre directement sur les champs de la carte (session « confirm » avec l'adresse collectée à l'étape 1), montant exact fixé par le serveur sur un produit à prix libre, vérification serveur, webhook signé, retour immédiat sur la page de remerciement. Déclencheurs : « Dodo Payment intégration », « intègre Dodo Payments », « paiement par carte Dodo », « Dodo dans la page de paiement »."
---

# Intégration Dodo Payments dans la page de paiement (modèle OSKOOL, validé en production)

Architecture de référence (validée en production, fichiers à créer dans le projet) :
- Serveur : `supabase/functions/_shared/dodo.ts`, `dodo-checkout/`, `dodo-webhook/`, `verify-payment/`.
- Page : `src/components/DodoCheckout.tsx`, `src/pages/Checkout.tsx`, `src/pages/CheckoutSuccess.tsx`, `src/components/admin/CardPaymentsCard.tsx`.

## 1. Demander d'abord

1. **Compte Dodo validé** (identité, produit, banque). Un compte personnel suffit, avec la pièce d'identité d'un pays accepté (le Togo l'est).
2. **Clé API Live**, et la clé de test seulement si l'utilisateur veut tester. Elle va dans les secrets serveur, posés par l'utilisateur lui-même (il ne colle jamais ses clés dans le chat) : `DODO_PAYMENTS_API_KEY` (et `DODO_PAYMENTS_TEST_API_KEY`). Vérifier leur présence par leur nom via l'API de gestion.
3. **Webhook :** dans Dodo → Developer → Webhooks, créer un point de réception vers `https://<projet>/functions/v1/dodo-webhook` avec `payment.succeeded`, `payment.failed` et `refund.succeeded`. Le secret `whsec_…` va dans `DODO_PAYMENTS_WEBHOOK_KEY`.
4. **TVA :** par défaut, **prix TVA comprise** (le client paie le prix affiché).
5. **Où afficher la carte :** chez OSKOOL, hors d'Afrique la carte seule en euros ; en Afrique, le Mobile Money par défaut et un bouton « Payer par carte bancaire ».

L'utilisateur a demandé **le mode réel directement**. Ne pas laisser de mode test accessible aux clients : une carte de test ouvrirait un accès gratuit.

## 2. Serveur

- **API :** `https://live.dodopayments.com` (test : `https://test.dodopayments.com`), avec l'en-tête `Authorization: Bearer <clé>`.
- **Produit à prix libre unique** (« Formation <Marque> »), créé au premier paiement et son id gardé en base :

  ```json
  POST /products
  {
    "name": "Formation <Marque>",
    "tax_category": "edtech",
    "price": { "type": "one_time_price", "currency": "EUR", "price": 100, "pay_what_you_want": true, "tax_inclusive": true, "discount": 0, "purchasing_power_parity": false }
  }
  ```
  Le montant de chaque commande est passé en centimes d'euro dans `product_cart[0].amount`. Ça couvre les paniers et les codes promo sans recréer de produits. Conversion depuis le F CFA : `Math.round(xof / 655.957 * 100)`.
- **Session de paiement** `POST /checkouts`. Faire **une suite d'essais**, jusqu'au premier accepté :
  1. **Complet + `confirm: true`** : `customer {email, name, phone_number}`, `billing_address {country, state, city, street, zipcode}`, `customization {theme: "light", force_language: "fr", show_order_details: false}`, `feature_flags {allow_currency_selection: false, allow_discount_code: false, redirect_immediately: true}`, `return_url`, `metadata {payment_id}`.
  2. Même chose **sans le téléphone** : Dodo refuse certains numéros africains.
  3. **Sans `confirm`**, avec le pays et le code postal seulement.
  4. **Le minimum** : `product_cart`, `customer {email, name}`, `return_url`, `metadata`.
  Si tout est refusé, enregistrer la réponse de Dodo sur la commande (`raw.dodo_error`) et la renvoyer dans `detail`.
- **Piège vécu :** `confirm: true` exige une **adresse complète** (pays, région, ville, rue, code postal). Sinon Dodo répond « Complete billing address is required when confirm is true ». Sans `confirm`, Dodo réaffiche ses écrans « Contact Information » et « Billing address ». Avec `confirm`, il ouvre **directement** les champs de la carte. Il faut donc collecter l'adresse côté site :
  - hors d'Afrique : à l'étape 1 (Adresse, Ville, Région, Code postal) ;
  - en Afrique : un petit formulaire avant la carte.
- **Vérification** (page de paiement, page de retour, rattrapage cron et webhook) :
  - `GET /checkouts/{session_id}` → `payment_id` ;
  - `GET /payments/{payment_id}` → exiger `status === "succeeded"`, `metadata.payment_id` égal à l'id de la commande, `currency === "EUR"` et `total_amount + 1 >= montant attendu` ;
  - puis confirmer la commande (fonction unique et idempotente), avec le moyen de paiement « Dodo Payments ».
- **Webhook** (`verify_jwt = false`, norme Standard Webhooks) :
  - en-têtes `webhook-id`, `webhook-timestamp`, `webhook-signature` (« v1,<base64> », éventuellement plusieurs séparés par des espaces) ;
  - clé : le secret sans `whsec_`, décodé en base64 ;
  - signature : HMAC-SHA256 de `${id}.${timestamp}.${corps brut}` en base64, comparée en temps constant ;
  - fenêtre de 5 min ;
  - sur `payment.succeeded`, relire le paiement chez Dodo avant de confirmer.
- **Interrupteur :** la carte doit pouvoir être coupée dans les paramètres (le serveur refuse alors toute session).

## 3. Page de paiement

- **SDK** (version épinglée) : `https://cdn.jsdelivr.net/npm/dodopayments-checkout@2.0.0/dist/index.js`, objet global `DodoPaymentsCheckout.DodoPayments`. Ajouter `https://cdn.jsdelivr.net` au `script-src` de la CSP.
- **Ouverture :**

  ```js
  DodoPayments.Initialize({ mode: "live", displayType: "inline", onEvent });
  DodoPayments.Checkout.open({ checkoutUrl, elementId, showTimer: false, payButtonText: "Payer maintenant" });
  ```
  Le SDK accepte les URL `/session/cks_…` (25 caractères) et les liens de paiement de 8 caractères, que renvoie une session `confirm`.
- **Événements :**
  - `checkout.opened` / `checkout.form_ready` : retirer le chargement ;
  - `checkout.pay_button_clicked` ou `checkout.status` « succeeded » : interroger le serveur toutes les 3 s puis aller sur la confirmation ;
  - `checkout.error` : retirer l'état « confirmation en cours ».
- **Erreur au démarrage :** afficher le message renvoyé par le serveur (lire `error.context.json()` de `supabase.functions.invoke`), jamais un message générique.
- **Page de remerciement :** montants **en euros** pour un paiement par carte ou un client hors d'Afrique, confettis clairs et coche verte animée, sans logo, aucun nom de prestataire.
- **Ne pas masquer** la mention « revendeur en ligne et marchand de référence dodopayments.com » en bas du formulaire. C'est une obligation de Dodo (vendeur officiel) : la cacher expose le compte à une suspension, et le relevé bancaire du client affiche Dodo de toute façon.

## 4. Frais et retraits (à rappeler à l'utilisateur, à revérifier sur dodopayments.com/pricing)

- **Commission :** 4 % + 0,40 $, plus 1,5 % pour les cartes hors des États-Unis. La TVA est collectée par Dodo.
- **Retraits :** deux fois par mois (le 18 et le 4), minimum 50 à 100 $. Frais : 5 $ sous 1 000 $, 25 $ par virement SWIFT en dollars. Payoneer est possible.

## 5. Valider

- Faire valider en local par l'utilisateur avant de pousser, et déployer le serveur seulement avec son accord.
- Pour diagnostiquer sans paiement : une action protégée (secret du cron) qui crée des sessions de test chez Dodo et renvoie ce qui est accepté ou refusé.
- Après un vrai paiement, vérifier en base : `paid`, accès donné, e-mail parti.
