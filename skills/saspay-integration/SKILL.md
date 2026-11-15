---
name: saspay-integration
description: "Intégrer SasPay (Mobile Money Afrique de l'Ouest et du Centre, api.saspay.me) DANS la page de paiement d'un site, en toute discrétion : le client ne voit jamais SasPay (ni nom, ni logo, ni e-mail SasPay) et les reçus SasPay arrivent sur l'adresse du propriétaire du site. Paiement direct sans redirection (softpay), opérateurs avec logos, code OTP quand l'opérateur l'exige, validation sur le téléphone puis passage tout seul sur la confirmation, webhook signé, vérification serveur. Modèle validé en production (Gosalle). Déclencheurs : « SasPay », « Sas Pay », « SaaSPay », « intègre SasPay », « paiement SasPay », « Mobile Money avec SasPay », « SasPay ne valide pas »."
---

# Intégration SasPay, en marque blanche (modèle Gosalle, validé en production)

Parle à l'utilisateur en français, simplement. Le code de référence est dans `reference/` (à adapter au projet, pas à réinventer) :

- `reference/saspay.ts` : tout ce qui parle à SasPay (serveur uniquement) : réseaux, paiement, vérification, code OTP, signature du webhook, messages d'erreur pour le client.
- `reference/routes-nextjs.ts` : les 5 routes serveur (réseaux, payer, statut, code, notification), avec des noms neutres.
- `reference/PaiementMobileMoney.tsx` : le formulaire dans la page.
- `reference/operateurs/*.png` : logos ronds (MTN, Moov, Orange, Wave, Celtiis, Mixx, Airtel, Free, Coris, Djamo, Wizall, Expresso, T-Money), à copier dans `public/operateurs/`.

Spécification officielle (elle fait foi, n'invente aucun champ) : `https://docs.saspay.me/llms.txt`.

## 0. Avant tout : l'adresse qui reçoit les reçus

SasPay envoie un reçu à l'adresse `customer.email` de chaque paiement. On ne lui donne **jamais l'e-mail du client** : on lui donne l'adresse du propriétaire du site. Ainsi, **le propriétaire reçoit chaque reçu**, et le client ne reçoit rien de SasPay.

1. Lis le fichier `~/.claude/saspay-integration.local.md` (Windows : `%USERPROFILE%\.claude\saspay-integration.local.md`).
2. S'il contient une ligne `email_recus: …`, utilise cette adresse **sans redemander**.
3. Sinon, demande : « Sur quelle adresse e-mail veux-tu recevoir les reçus SasPay de tes clients ? (Tes clients ne verront jamais SasPay.) ». Puis crée le fichier :

   ```markdown
   # Réglages personnels du skill saspay-integration (ne pas partager)
   email_recus: <adresse donnée>
   ```

   Ce fichier est hors du dossier du skill : une mise à jour des skills ne l'efface pas.
4. Cette adresse va dans la variable serveur `SASPAY_EMAIL_RECUS` du projet. Elle n'est **jamais écrite dans le code** ni dans un fichier envoyé sur GitHub.

## 1. Ce que l'utilisateur fait (et rien d'autre)

Dans le tableau de bord SasPay (`app.saspay.me`, section Développeur) :

1. **Créer une clé API** `sk_live_…` (ou `sk_test_…` pour développer) avec le droit d'encaissement (`PAYIN` ou `BOTH`).
2. **Créer le webhook** :
   - URL : `https://<site>/api/paiement/notification` ;
   - événements : `transaction.success` et `transaction.failed` ;
   - copier tout de suite le **secret de signature** (il ne s'affiche qu'une fois).
3. **Ranger les clés lui-même**. Il ne colle **jamais** ses clés dans le chat. Donne-lui l'endroit exact selon le projet :
   - Next.js en local : `.env.local` ;
   - Vercel / Cloudflare / Supabase : les secrets du serveur.
   Les variables :
   ```
   SASPAY_SECRET_KEY=sk_live_...
   SASPAY_WEBHOOK_SECRET=...
   SASPAY_EMAIL_RECUS=<adresse de l'étape 0>
   ```
   Vérifie ensuite leur **présence** (par leur nom), jamais leur valeur. Vérifie que `.env.local` est bien ignoré par git.

Le reste se déduit du projet : backend, table des commandes, accès à donner, page de confirmation.

## 2. Discrétion : le client ne doit jamais savoir que le site utilise SasPay

C'est une exigence de l'utilisateur, non négociable. À vérifier avant de dire « terminé » :

- **E-mail :** `customer.email` = `SASPAY_EMAIL_RECUS`, toujours. Si la variable manque, le paiement refuse de partir. Il ne retombe jamais sur l'e-mail du client. L'e-mail du client reste dans notre base, pas chez SasPay.
- **Aucun mot « SasPay » visible côté client :**
  - textes, titres, boutons, pied de formulaire (« Paiement sécurisé. », pas « par SasPay »), pages légales (« notre prestataire de paiement ») ;
  - noms des routes appelées par le navigateur (`/api/paiement/…`, jamais `/api/saspay/…`), noms de fichiers dans `public/`, `console.log` du navigateur ;
  - aucun logo SasPay : seulement les logos des opérateurs.
- **Erreurs :** ne renvoie jamais au navigateur le message brut de SasPay. Passe par `messageClient()`, et garde le détail dans les journaux du serveur.
- **`description` du paiement** : `« <Marque> — <produit> »`.
- **Pas de checkout hébergé** (`POST /checkout-sessions/`) : c'est une page SasPay. On utilise uniquement le **softpay** (`POST /payments/softpay/`).
- **`checkout_url` non vide** (Wave, Orange Money, Djamo) : c'est la page de l'opérateur. Il faut l'ouvrir, sinon aucun paiement n'a lieu. Ouvre-la dans un nouvel onglet ; la page du site reste ouverte et continue de vérifier. Au premier test réel, regarde si cette page affiche le nom SasPay et dis-le à l'utilisateur.
- **Reçu du client :** si le projet envoie déjà des e-mails (Resend, Brevo…), envoie au client **notre propre** confirmation, à la marque du site, après la validation.
- **Hors du code, à dire à l'utilisateur :** la demande qui arrive sur le téléphone du client (USSD, SMS de l'opérateur) peut afficher le nom du marchand enregistré chez l'opérateur. Pour y mettre sa marque, il doit demander au support SasPay de régler le « nom affiché du marchand ».

## 3. Serveur (softpay, sans redirection)

**Réseaux du pays** : `GET /pricing/my-rates/` (mettre en cache 10 min). Garder seulement ceux où `country_code` est le pays et `payin.available` est vrai. Pour chacun : `network_code`, `network_name`, `payin.otp_required`, `payin.otp_instructions`.

**Payer** : `POST /payments/softpay/` avec l'en-tête `Idempotency-Key: <id de la commande>`. Sans cet en-tête, un retry réseau débite deux fois.
```json
{
  "amount": "2500.00", "currency": "XOF", "country": "BJ", "network": "mtn_bj",
  "description": "<Marque> — <produit>",
  "customer": { "email": "<SASPAY_EMAIL_RECUS>", "first_name": "…", "last_name": "…", "phone": "+22997000000" },
  "metadata": { "commande_id": "<id>" },
  "return_url": "https://<site>/paiement/merci?commande=<id>",
  "otp": "<seulement si otp_required>"
}
```

**Règles du paiement :**
- **Montant :** une chaîne avec deux décimales (`"2500.00"`). Le prix est **toujours recalculé côté serveur**, y compris après un code promo.
- **Devise :** `XAF` pour CM, GA, CG, TD, CF, GQ ; `XOF` ailleurs en zone FCFA.
- **Téléphone :** au format international avec `+` (indicatif + numéro).
- **Réponse :** `id`, `status` (`PENDING`), `checkout_url` (voir § 2).

**Deux sortes de codes OTP :**
- **Avant le paiement** (`otp_required`, ex. Orange Money CI ou BF) : le client compose un code USSD, puis saisit le code obtenu, que l'on envoie dans `otp`. S'il manque : `422 prepayment_otp_missing`.
- **Après la demande** (Wizall SN, Coris BJ) : le client reçoit un SMS. Il saisit le code, que l'on envoie à `POST /payments/{id}/confirm-otp/` avec `{ "otp": "…" }`.

**Vérification** (commune à la page, au webhook et au rattrapage) : `GET /payments/{id}/verify/`.
- `SUCCESS` : contrôler que `requested_amount` est égal au montant de la commande, puis livrer **une seule fois** avec une fonction idempotente en base.
- `FAILED` ou `CANCELLED` : marquer la commande « échouée ».
- `PENDING` : ne rien faire.
- Ne livre jamais sur la seule foi d'une redirection, d'un délai ou d'un webhook non revérifié.

**Webhook** :
- En-têtes `X-Webhook-Signature` (HMAC-SHA256 en hexadécimal) et `X-Webhook-Timestamp`.
- Signature calculée sur `${timestamp}.${corps brut}` avec `SASPAY_WEBHOOK_SECRET`, comparée en temps constant. Refuser si l'horodatage a plus de 5 minutes d'écart.
- Répondre `200` à `webhook.test`.
- Sur `transaction.*` : retrouver la commande par `data.id`, puis **revérifier** chez SasPay. En cas d'erreur, répondre `500` : SasPay renverra la notification.

**Erreurs fréquentes** :
- `invalid_customer` : le numéro est mauvais.
- `invalid_method` ou `no_route_available` : le réseau est indisponible, proposer un autre opérateur.
- `401` : la clé est fausse, ne pas réessayer.
- `403 api_key_scope_forbidden` : la clé n'a pas le droit `PAYIN`.
- `429` : attendre une minute.

## 4. Page de paiement

1. Le client choisit son opérateur (logo et nom court, ex. « MTN MoMo » au lieu de « MTN MoMo Benin »). Il saisit son numéro, ou le garde s'il l'a déjà donné plus tôt.
2. Si l'opérateur l'exige, afficher la consigne (`otp_instructions`) et un champ « Code de paiement ».
3. « Payer maintenant » affiche l'écran « Validez le paiement sur votre téléphone ». La page interroge `/api/paiement/statut` toutes les 3 s, pendant 5 min.
4. Dès que le paiement est confirmé, passer **tout seul** sur la page de remerciement. Pas de bouton « Vérifier ».
5. En cas d'échec, revenir au formulaire avec un message clair.
6. Pour Wizall ou Coris, afficher un champ « Code reçu par SMS » sur l'écran d'attente.
7. Si le site propose aussi la carte bancaire, cet écran « Validez sur votre téléphone » ne s'affiche **que** pour le Mobile Money.

## 5. Frais

Les frais SasPay dépendent du pays et du réseau (`GET /pricing/my-rates/`, par exemple environ 3,5 % au Bénin). `fee_charge_mode` vaut :
- `ADD_ON` : le client paie les frais en plus ;
- `DEDUCTED` : les frais sont retirés de ce que reçoit le marchand.

Par défaut, c'est le réglage du compte. Rappelle-le à l'utilisateur, et affiche sous le bouton « Les frais de l'opérateur peuvent s'ajouter au montant » si c'est `ADD_ON`.

## 6. Tester et terminer

1. Vérifie la clé sans payer : `GET /pricing/my-rates/` doit répondre et lister les réseaux du pays.
2. Dans le tableau de bord SasPay, déclenche « Tester le webhook » : la route doit répondre `200`, et `403` si la signature est fausse.
3. Fais faire à l'utilisateur **un vrai petit paiement**. Puis vérifie :
   - la commande est « payée » et l'accès est donné ;
   - le reçu SasPay est arrivé sur **son** adresse (`SASPAY_EMAIL_RECUS`) ;
   - le client n'a reçu aucun e-mail SasPay et n'a vu le nom SasPay nulle part ;
   - au besoin, que la page de l'opérateur ne montre pas SasPay.
4. Cherche une dernière fois le mot « saspay » dans tout ce que le navigateur reçoit. Tout le code client, les textes et `public/` doivent répondre « aucun résultat ».

Si un test n'a pas pu être fait, dis-le clairement à l'utilisateur.
