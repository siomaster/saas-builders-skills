---
name: moneyfusion
description: "Intégrer MoneyFusion (pay.moneyfusion.net) dans un projet web — encaissement Mobile Money (payin) et retraits (payout), avec IP fixe via un relais sur VPS, webhook dédoublonné et validation automatique de la vente sans bouton « Vérifier ». Pose d'abord les questions nécessaires. Déclencheurs : « MoneyFusion », « Money Fusion », « Mon Fusion », « intègre MoneyFusion », « retrait MoneyFusion », « paiement MoneyFusion ne se valide pas »."
---

# Intégration MoneyFusion

Documentation : https://docs.moneyfusion.net/en (pages `webapi` et `payout`). Relire la doc si un champ a pu changer.

## 1. Questions à poser AVANT de coder

1. **URL d'API de paiement** de l'application MoneyFusion (tableau de bord → « API de paiement » → application). C'est une URL secrète propre à l'application : la garder dans les secrets serveur.
2. **Retraits** prévus ? Il faut alors la **clé privée** (Paramètres → API key), à mettre dans l'en-tête `moneyfusion-private-key`, uniquement côté serveur.
3. **IP fixe** : le backend (Supabase, Vercel, Cloudflare…) n'a pas d'IP fixe. MoneyFusion bloque toute IP non déclarée (« Unauthorized IP or unapproved application (x.x.x.x) »).
   - Utiliser un **relais sur un petit VPS à IP fixe** (Hetzner, Contabo, OVH…), exposé en HTTPS sur `https://relay.<ton-domaine>`.
   - Déclarer cette IP dans l'application MoneyFusion.
4. **Site** déclaré dans l'application : doit être public. `return_url` et `webhook_url` doivent appartenir à ce domaine (ou à un sous-domaine autorisé).
5. **Backend** du projet, table des commandes, accès à donner, page de confirmation.

## 2. Relais IP fixe (VPS)

Organisation conseillée :
- code : `/opt/payment-relay/server.js` ; service systemd `payment-relay` ; variables dans `/etc/payment-relay.env` ;
- Caddy : `relay.<ton-domaine>` → `127.0.0.1:8787`.
- Modèle de relais Node prêt à adapter : `../sebpay-integration/reference/relay/server.mjs` (remplacer l'API et la liste blanche par `*.moneyfusion.net`).

Fonctionnement :
- `POST /moneyfusion/pay`, avec l'en-tête `x-relay-secret` et le corps `{ api_url, payload }`. `api_url` est limitée à `*.moneyfusion.net`.
- `GET /health` pour vérifier que le relais répond.

Pour un **autre projet** :
- lui donner son **propre secret** de relais (un secret différent par projet) ;
- ajouter les routes nécessaires (statut, retrait) en gardant la liste blanche `*.moneyfusion.net` ;
- déclarer l'IP du VPS dans l'application MoneyFusion de ce projet.

Le relais ne sert qu'aux appels **sortants** vers MoneyFusion. Il ne change rien à la réception des webhooks.

## 3. Encaissement (payin)

- **Créer** : `POST <URL d'API de l'application>`, `Content-Type: application/json`, avec :
  - `totalPrice` (nombre) ;
  - `article` (tableau d'objets, ex. `[{"formation": 19000}]`) ;
  - `numeroSend` (téléphone) ;
  - `nomclient` ;
  - `personal_Info` (tableau, ex. `[{"orderId": "<id interne>"}]`) ;
  - `return_url` ;
  - `webhook_url`.
  Réponse : `{ statut: true, token, message, url }`. Stocker `token` sur la commande, puis rediriger vers `url`.
- **Statut** : `GET https://pay.moneyfusion.net/paiementNotif/{token}` → `data.statut` : `pending` | `failure` | `no paid` | `paid`. On y trouve aussi `Montant`, `frais`, `numeroTransaction`, `moyen`, `personal_Info`.
- **Webhook** (POST sur `webhook_url`) :
  - événements : `payin.session.pending`, `payin.session.completed`, `payin.session.cancelled` ;
  - champs : `event`, `tokenPay`, `personal_Info`, `numeroSend`, `nomclient`, `numeroTransaction`, `Montant`, `frais`, `createdAt` ;
  - **aucune signature documentée** : ne jamais valider sur la foi du webhook. Relire `paiementNotif/{tokenPay}`, vérifier `statut === "paid"`, le montant et que `tokenPay` correspond bien à la commande, puis confirmer (fonction unique idempotente) ;
  - **doublons** : identifier par `tokenPay`, ignorer un événement qui ne change pas le statut, ne jamais repasser une commande payée à un autre statut.

## 4. Vente qui ne se valide pas seule (client débité, bouton « Vérifier »)

Causes habituelles, à contrôler dans l'ordre :
1. `webhook_url` absent de la création, mal écrit, hors du domaine déclaré, ou fonction qui exige une authentification (Supabase : déployer avec `--no-verify-jwt`).
2. Le handler attend un champ qui n'existe pas (`status` au lieu de `event`) ou un corps non JSON.
3. Le handler lance une erreur (500), puis ignore les relances.
4. La page de retour (`return_url`) attend un clic au lieu de vérifier seule.

Correctif type :
- webhook public et robuste, qui relit le statut puis confirme ;
- **et** page de retour qui appelle automatiquement une fonction serveur « vérifier » toutes les 3 s (≈ 10 min maximum) et redirige dès que la vente est `paid`. Plus de bouton à cliquer.
- garder une vérification planifiée (cron toutes les 2 min) des commandes `pending` récentes, en filet de sécurité.

L'IP fixe ne corrige PAS ce problème : elle ne sert qu'aux appels sortants.

## 5. Retraits (payout)

- `POST https://pay.moneyfusion.net/api/v1/withdraw`, avec les en-têtes `moneyfusion-private-key` et `Content-Type: application/json`.
  - Corps : `countryCode` (ex. `ci`), `phone`, `amount`, `withdraw_mode` (ex. `mtn-ci`), `webhook_url`.
  - Réponse : `{ statut, tokenPay, message }`.
- Moyens disponibles : `GET https://pay.moneyfusion.net/api/v1/withdraw/methods` (`code` → `countryCode`, `paymentMethods[].key` → `withdraw_mode`).
- Statut : `GET https://pay.moneyfusion.net/api/v1/payout/check-status/{tokenPay}` → `pending` | `success` | `failed`.
- Webhook : `payout.session.completed` ou `payout.session.cancelled`, avec les champs `tokenPay`, `montant`, `numeroRetrait`, `moyen`.
- Toujours passer par le relais (IP fixe déclarée).

## 6. Règles

- Ne jamais déclencher de paiement ou de retrait réel, ni créer de fausses commandes en production, sans accord explicite.
- Les clés et l'URL d'API restent dans les secrets serveur, jamais dans le code ni dans git.
