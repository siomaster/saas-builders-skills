---
name: paypal
description: "Intégrer le paiement PayPal (compte PayPal + carte bancaire sans compte, formulaire de carte dans la page, sans redirection) dans un projet web, comme sur OSKOOL. Pose d'abord les questions nécessaires (clés, devise, backend, accès à débloquer), puis crée la commande côté serveur, l'encaissement vérifié, le webhook signé et l'affichage soigné. Déclencheurs : « PayPal », « intègre PayPal », « paiement par carte avec PayPal », « ajoute PayPal à mon projet », « paiement carte bancaire hors Afrique »."
---

# Intégration PayPal (modèle OSKOOL)

Architecture de référence (validée en production, fichiers à créer dans le projet) :
`supabase/functions/_shared/paypal.ts`, `supabase/functions/paypal-checkout/index.ts`,
`supabase/functions/paypal-webhook/index.ts`, `src/components/PayPalButtons.tsx`.

## 1. Questions à poser AVANT de coder (une seule fois, en bloc)

1. **Client ID et Secret** PayPal (developer.paypal.com → Apps & Credentials) : *Live* ou *Sandbox* ?
   - Le Client ID est public (il peut aller dans le code du site).
   - Le Secret va UNIQUEMENT dans les secrets serveur (`PAYPAL_CLIENT_SECRET`), jamais dans le code ni dans git.
2. **Backend** du projet : Supabase Edge Functions, Node/Express, Next.js API, autre ?
3. **Devise** des prix :
   - PayPal n'accepte pas le F CFA (XOF) : convertir en EUR au taux fixe 655,957.
   - Afficher alors uniquement des euros au client hors d'Afrique.
4. **Où PayPal s'affiche** : partout, ou seulement hors d'Afrique (et en second choix sous le Mobile Money en Afrique) ?
5. **Ce qui se passe après paiement** : quelle table/commande marquer payée, quel accès donner, quelle page de confirmation, quels e-mails envoyer.
6. **URL publique du webhook** (fonction serveur) et domaine du site, pour la CSP.

Ne rien inventer : si une info manque, la demander.

## 2. Architecture (obligatoire)

- **Commande interne d'abord.** Le serveur crée sa propre commande (`pending`) avec un jeton secret de paiement (stocker seulement son hash SHA-256). Tout appel PayPal du navigateur passe par `payment_id + checkout_token`.
- **Création de la commande PayPal côté serveur.** `POST /v2/checkout/orders` :
  - `intent: "CAPTURE"` ;
  - `purchase_units[0]` : `reference_id` et `custom_id` = id interne, `invoice_id` = `PREFIX-<id>`, `amount: { currency_code: "EUR", value: "19.00" }` ;
  - en-tête `PayPal-Request-Id` (idempotence) **différent par bouton** (`<id>-<montant>-inline-card`, `…-inline-paypal`), sinon les deux boutons reçoivent la même commande.
- **Préremplissage du formulaire de carte.** Pour le bouton carte, NE PAS envoyer `payment_source`. Envoyer :
  - `payer` en haut de la commande : `name.given_name/surname`, `email_address`, `phone.phone_number.national_number` (chiffres seuls), `address.postal_code` + `country_code` ;
  - `application_context` : `brand_name`, `shipping_preference: "NO_SHIPPING"`, `user_action: "PAY_NOW"`, `locale: "fr-FR"`.
  Si PayPal refuse un champ (4xx), recréer la commande sans `payer` : le paiement ne doit jamais être bloqué par le préremplissage.
- **Bouton compte PayPal.** Utiliser `payment_source.paypal`, avec les mêmes infos que `payer`, plus `experience_context` (brand_name, NO_SHIPPING, PAY_NOW, locale).
- **Encaissement côté serveur.** `POST /v2/checkout/orders/{id}/capture` :
  - si l'erreur est `ORDER_ALREADY_CAPTURED`, relire la commande (`GET /v2/checkout/orders/{id}`) ;
  - vérifier que `custom_id` correspond à la commande interne, que la devise est `EUR`, que le montant est au moins celui attendu et que le statut de capture est `COMPLETED` ;
  - seulement ensuite : marquer payé et donner l'accès (fonction unique et idempotente, ex. `confirmPayment`) ;
  - `INSTRUMENT_DECLINED` → message clair : « Paiement refusé par ta banque : essaie une autre carte ».
- **Jeton OAuth.** `POST /v1/oauth2/token` en Basic `clientId:secret`, `grant_type=client_credentials`. Le mettre en cache jusqu'à `expires_in - 60 s`. API Live : `https://api-m.paypal.com` ; Sandbox : `https://api-m.sandbox.paypal.com`.
- **Webhook de secours (obligatoire).**
  - Enregistrer `PAYMENT.CAPTURE.COMPLETED` sur l'URL du webhook et garder son `PAYPAL_WEBHOOK_ID` en secret.
  - Vérifier chaque appel via `POST /v1/notifications/verify-webhook-signature` avec les en-têtes `paypal-transmission-id`, `paypal-transmission-time`, `paypal-cert-url`, `paypal-auth-algo`, `paypal-transmission-sig`, plus `webhook_id` et `webhook_event`. Il faut obtenir `verification_status === "SUCCESS"`.
  - Ensuite, relire la commande, retrouver la commande interne par `custom_id`, vérifier le montant, puis confirmer (idempotent).

## 3. Front (formulaire « comme Stripe »)

- SDK : `https://www.paypal.com/sdk/js?client-id=…&currency=EUR&intent=capture&components=buttons&enable-funding=card&disable-funding=paylater,venmo&locale=fr_FR`. Le précharger dès l'étape de paiement.
- Deux boutons **séparés**, affichés sans clic préalable, avec `fundingSource` : d'abord `paypal.FUNDING.CARD` (style `color:"black"`), puis `paypal.FUNDING.PAYPAL` (`color:"gold"`). Vérifier `isEligible()` avant `render()`. Style : `layout:"vertical"`, `shape:"pill"`, `height:48`.
- **Masquer « Optimisé par PayPal »** sous le bouton carte fermé : conteneur `overflow:hidden`, hauteur 48 px.
- **Formulaire ouvert** : surveiller la hauteur du cadre avec un `ResizeObserver`. Au-delà de 150 px, le formulaire est ouvert : remonter le cadre de 100 px (`margin-top:-100px` dans un conteneur `overflow:hidden`). Le bouton « Carte bancaire » et la croix de fermeture disparaissent alors, et le formulaire se colle au récapitulatif.
- **Après `onApprove`** : cacher les boutons, afficher seulement « Confirmation du paiement… », puis aller à la page de confirmation. Ne jamais laisser les boutons visibles pendant la vérification.
- **Impossible** : ouvrir le formulaire de carte sans clic, ou écrire dans ses champs avec un script (cadre d'un autre site). Le seul moyen d'avoir des champs de carte à soi est **Card Fields** (`components=card-fields`). Il faut que le compte ait l'option « Advanced Credit and Debit Card Payments » (vérifier avec `CardFields().isEligible()`).
- **CSP** : `script-src` et `frame-src` doivent autoriser `https://www.paypal.com https://*.paypal.com https://*.paypalobjects.com`.

## 4. Vérifications et règles

- Ne jamais déclencher de paiement réel. Ne jamais créer de fausses commandes en base de production sans accord explicite.
- Tester en Sandbox si possible. Sinon, vérifier la création de commande et laisser l'utilisateur faire le paiement réel.
- Contrôler le rendu des boutons sur une capture (desktop et mobile), puis vérifier le bundle en ligne après déploiement.
- Le paiement doit pouvoir aboutir même si le navigateur se ferme après l'accord (webhook).
