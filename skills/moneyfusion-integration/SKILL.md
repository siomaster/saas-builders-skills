---
name: moneyfusion-integration
description: "Intégrer MoneyFusion (Mobile Money Afrique) DANS la page de paiement d'un site, exactement comme sur OSKOOL — page MoneyFusion affichée dans la page (pas de redirection externe), vérification automatique toutes les 3 s et passage tout seul sur la page de remerciement dès que le client est débité, sans bouton « Vérifier ». Avec relais IP fixe (VPS), webhook revérifié et rattrapage automatique. Déclencheurs : « Money Fusion Integration », « intègre MoneyFusion », « paiement MoneyFusion dans la page », « MoneyFusion ne valide pas la vente », « le client doit cliquer sur Vérifier »."
---

# Intégration MoneyFusion dans la page de paiement (modèle OSKOOL, validé en production)

Architecture de référence (validée en production, fichiers à créer dans le projet) :
- Serveur : `supabase/functions/_shared/moneyfusion.ts`, `moneyfusion-checkout/`, `moneyfusion-webhook/`, `verify-payment/`, `subscription-cron/` (rattrapage).
- Page : `src/components/MoneyFusionPay.tsx`, `src/pages/Checkout.tsx`, `src/pages/CheckoutSuccess.tsx`.

Le parcours obtenu : le client voit la page MoneyFusion **à l'intérieur** de l'étape Paiement, choisit son opérateur, valide sur son téléphone, et la page part **seule** sur la confirmation, sans aucun clic.

## 1. Demander d'abord (une seule fois)

1. **URL d'API de l'application MoneyFusion** (tableau de bord → Paiement API → application). Secret serveur `MONEYFUSION_API_URL`, jamais dans le code.
2. **IP fixe** : le serveur du site (Supabase, Vercel, Cloudflare) n'en a pas, et MoneyFusion bloque toute IP non déclarée.
   - Utiliser un relais sur un petit VPS à IP fixe (Hetzner, Contabo, OVH…), exposé en HTTPS sur `https://relay.<ton-domaine>`.
   - Déclarer l'IP et le site (https://domaine) dans l'application MoneyFusion.
3. **Secrets du relais** : `MONEYFUSION_RELAY_URL` et `MONEYFUSION_RELAY_SECRET`. Un secret différent par projet.
4. **Backend**, table des commandes, accès à donner, page de confirmation, e-mails.

L'utilisateur ne peut pas coller ses clés dans le chat : lui faire ajouter les secrets lui-même (Supabase → Edge Functions → Secrets). Vérifier ensuite leur **présence par leur nom** via l'API de gestion, sans jamais lire leur valeur.

## 2. Relais IP fixe (VPS)

- Petit serveur Node (ex. `/opt/payment-relay/server.js`, service systemd `payment-relay`, variables dans `/etc/payment-relay.env`, Caddy en HTTPS vers `127.0.0.1:8787`). Modèle prêt à adapter : `../sebpay-integration/reference/relay/server.mjs`.
- `POST /moneyfusion/pay` :
  - en-tête `x-relay-secret` obligatoire, sinon 401 ;
  - corps `{ api_url, payload }`, avec `api_url` limitée à `*.moneyfusion.net` ;
  - il renvoie la réponse de MoneyFusion telle quelle.
- `GET /health` → `{"ok":true}`.
- **Piège vécu :** le secret `MONEYFUSION_RELAY_URL` contenait déjà `/moneyfusion/pay`, et le code l'ajoutait une seconde fois, d'où un 404 « not found ». Toujours normaliser : `relayUrl.replace(/\/$/, "").replace(/\/moneyfusion\/pay$/, "")`, puis ajouter `/moneyfusion/pay`.

## 3. Serveur

**Création** (fonction `moneyfusion-checkout`, appelée avec `payment_id` + `checkout_token`, jeton stocké en hash SHA-256) :
- **Contrôles :** la commande doit être en attente et MoneyFusion choisi dans les paramètres. Si un paiement existe déjà pour cette commande, renvoyer la même URL.
- **Corps envoyé via le relais :**

  ```json
  {
    "totalPrice": 6231,
    "article": [{ "<offre>": 6231 }],
    "numeroSend": "<téléphone, chiffres seuls>",
    "nomclient": "<prénom nom>",
    "personal_Info": [{ "orderId": "<id commande>" }],
    "return_url": "https://site/payment/success?payment=…&token=…",
    "webhook_url": "<URL publique du webhook>"
  }
  ```
- **Réponse :** `{ statut: true, token, url }`. Enregistrer `token` sur la commande (colonne `moneyfusion_token`, unique) et l'`url`.
- **Si MoneyFusion refuse** (souvent le `webhook_url` hors du domaine déclaré) : réessayer sans `webhook_url`. Si ça échoue encore, enregistrer la raison sur la commande (`raw.moneyfusion_error`) et la renvoyer dans `detail` pour pouvoir diagnostiquer.

**Vérification** (`settleFromMoneyFusion`, commune à la page de retour, au webhook et au rattrapage) :
- Lecture : `GET https://pay.moneyfusion.net/paiementNotif/{token}` → `data.statut` vaut `pending`, `failure`, `no paid` ou `paid`.
- Contrôler que `personal_Info[0].orderId` est bien l'id de la commande.
- **Piège vécu (vente payée mais jamais validée) :** `Montant` est le montant **net des frais MoneyFusion**. Le montant payé par le client est `Montant + frais`. Contrôler `Montant + frais + 1 >= montant attendu`, jamais `Montant` seul.
- `paid` : confirmer la commande, avec une fonction unique et idempotente (accès, e-mails, pixel), moyen de paiement « MoneyFusion (<moyen>) ».
- `failure` : passer la commande en échec, ce qui déclenche les relances « paiement échoué ».
- `pending` ou `no paid` : attendre.

**Webhook** (`moneyfusion-webhook`, `verify_jwt = false`) :
- Événements `payin.session.pending`, `payin.session.completed`, `payin.session.cancelled`. Ils ne sont **pas signés** : retrouver la commande par `tokenPay`, puis **relire le statut** et appliquer la vérification. Toujours répondre 200, sauf erreur interne (500 pour être rappelé).

**Rattrapage :** un cron toutes les 2 min (`pg_cron` + `pg_net`) appelle une fonction qui revérifie les commandes en attente des 2 derniers jours ayant un `moneyfusion_token`.

## 4. Page de paiement (le point clé)

- **Afficher la page MoneyFusion dans une iframe** à l'étape Paiement, sans redirection. `payin.moneyfusion.net` accepte d'être intégrée (pas de X-Frame-Options) :

  ```tsx
  <iframe src={url} title="Paiement Mobile Money" className="block h-[760px] w-full border-0" allow="payment; clipboard-write" />
  ```
  Afficher un écran de chargement jusqu'au `onLoad`.
- **Pendant ce temps,** la page de paiement interroge le serveur toutes les 3 s pendant environ 10 min (fonction « verify ») et **redirige elle-même** vers `/payment/success` dès que la commande est `paid`. C'est ce qui évite l'écran MoneyFusion « Paiement en cours de validation… Vérifiez votre paiement ».
- **Page de confirmation :** elle continue à vérifier toutes les 3 s si besoin et ne nomme **jamais** le prestataire (« Quelques secondes, nous confirmons ton paiement. »).
- **Code promo modifié à l'étape 2 :** la commande est recréée. Ne monter l'iframe que lorsque la nouvelle commande est prête (pas pendant le chargement).
- **Affichage :** Mobile Money par défaut pour les visiteurs en Afrique ; hors d'Afrique, uniquement la carte, en euros. Montants en F CFA pour le Mobile Money.

## 5. Valider

- Toujours faire valider en local par l'utilisateur avant de pousser, et ne déployer le serveur qu'avec son accord.
- Test réel : un petit montant (code promo). Vérifier en base : `status = paid`, accès donné, e-mail parti.
- Ne jamais créer de fausses commandes ni de faux paiements en production soi-même.
