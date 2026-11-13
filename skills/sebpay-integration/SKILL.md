---
name: sebpay-integration
description: "Intégrer SebPay (Mobile Money Afrique, new.sebpay.bj) DANS la page de paiement d'un site, exactement comme sur OSKOOL — paiement direct sans redirection (API Collectes) avec le pays et le numéro déjà saisis, choix de l'opérateur avec logos, code OTP quand l'opérateur l'exige, validation sur le téléphone puis passage tout seul sur la page de remerciement. Relais à IP fixe (SebPay n'accepte que les IP déclarées), webhook signé HMAC, rattrapage automatique. L'utilisateur fournit seulement sa clé publique et sa clé secrète. Déclencheurs : « SebPay », « Seb Pay », « intègre SebPay », « paiement SebPay », « SebPay ne valide pas », « Coris Money », « agrégateur SebPay »."
---

# Intégration SebPay dans la page de paiement (modèle OSKOOL, validé en production)

Le code qui fonctionne est copié dans `reference/` (à adapter, pas à réinventer) :
- `reference/supabase/functions/_shared/sebpay-core.ts` : partie pure et testée (signature, verdicts, opérateurs, messages d'erreur).
- `reference/supabase/functions/_shared/sebpay.ts` : appels SebPay via le relais, relecture et validation.
- `reference/supabase/functions/sebpay-checkout/index.ts` : actions `start` / `collect` / `status`.
- `reference/supabase/functions/sebpay-webhook/index.ts` : notifications signées.
- `reference/src/components/SebPayPay.tsx` : formulaire dans la page.
- `reference/public/operators/*.png` : logos ronds 96 px (MTN, Moov, Orange, Wave, Celtiis, Airtel, Free, T-Money, Coris).
- `reference/relay/server.mjs` + `reference/relay/sebpay-setup.sh` : relais IP fixe et son installateur.
- `reference/20261109100000_sebpay.sql`, `reference/sebpay.test.ts`.

Parcours obtenu : à l'étape 2 le client choisit son opérateur (logo + nom), garde le numéro de l'étape 1, clique « Payer maintenant », valide sur son téléphone ; la page part seule sur la confirmation. Pas de redirection, pas de ressaisie du nom, de l'e-mail ou du pays.

## 1. Ce que l'utilisateur donne (et rien d'autre)

Seulement **la clé publique** (`pk_live_…`) et **la clé secrète** (`sk_live_…`), tableau de bord SebPay › Développeurs. Pas de sandbox chez lui : tout est réel.

Il ne colle jamais ses clés dans le chat. Lui donner une commande à lancer dans son terminal (saisie masquée) :
```
read -s "P?Clé publique SebPay : "; echo; read -s "K?Clé secrète SebPay : "; echo
npx supabase secrets set SEBPAY_PUBLIC_KEY="$P" SEBPAY_SECRET_KEY="$K" --project-ref <ref>; unset P K
```
Puis vérifier la **présence** des secrets par leur nom (API de gestion), jamais leur valeur. Tout le reste se déduit du projet : backend, table des commandes, accès à donner, page de confirmation.

## 2. IP fixe obligatoire (le piège n° 1)

SebPay refuse toute IP non déclarée : « Cette adresse IP n'est pas autorisée ». Les fonctions Supabase / Vercel / Cloudflare n'ont pas d'IP fixe.
- Relais sur un petit VPS à IP fixe (ex. Hetzner), `https://relay.<ton-domaine>`, route `/sebpay/*` → Node `127.0.0.1:8788` (à côté d'un éventuel relais MoneyFusion sur 8787).
- L'utilisateur déclare l'IP dans SebPay (sous les clés : « Adresses IP autorisées »). SebPay l'**approuve manuellement** (e-mail « adresse IP approuvée ») : tant que ce n'est pas fait, rien ne passe.
- Secrets du site : `SEBPAY_RELAY_URL` (= `https://relay.<domaine>`) et `SEBPAY_RELAY_SECRET` (affiché par l'installateur). Un secret par projet.
- Le relais n'accepte que `POST /sebpay/proxy` avec `x-relay-secret`, et seulement les chemins `checkout/sessions[/id]`, `collections[/ref]`, `countries`, `operators?country=XX`, `c/calculate-fee`. Les payouts sont bloqués.

**Installer le relais quand le Mac n'a pas de clé SSH du VPS** : servir `sebpay-setup.sh` en statique sur le site (`public/relay/`), puis l'exécuter depuis la console web Hetzner (déjà connectée en root) :
- La console lit le clavier en QWERTY et **perd la touche Maj** : `:`, `|`, `*`, `_` et les majuscules sortent faux. N'utiliser que des minuscules, `/`, `.`, `-` :
  `wget -q <ton-site>/relay/sebpay-setup.sh` puis `bash sebpay-setup.sh` (pas de `https://`, pas de pipe).
- Pour taper soi-même dans la console : ouvrir `https://console.hetzner.com/console/<projet>/<serveur>` dans un onglet piloté (la session root reste ouverte), action `type` puis touche `Return`. Si l'écran semble figé, recharger l'onglet.
- Le script est relançable : il garde le secret existant, remplace la route Caddy, valide la config (retour arrière sinon) et teste `/sebpay/health`.
- Vérifier de l'extérieur : `/sebpay/health` → `{"ok":true}` ; un appel signé avec de fausses clés doit renvoyer le message SebPay « Invalid or inactive API keys » (preuve que le relais transmet).

## 3. Serveur (API Collectes, pas le checkout hébergé)

Le checkout hébergé (`/checkout/sessions`) redirige vers une page SebPay qui redemande nom, e-mail, pays, opérateur, numéro : **refusé par l'utilisateur**. Utiliser `POST /collections`.

Fonction `sebpay-checkout` (`verify_jwt = false`, commande retrouvée par `payment_id` + hash SHA-256 du `checkout_token`, SebPay doit être le fournisseur choisi) :
- `start` : `GET /operators?country=<pays de l'étape 1>` → `[{code, name, otp, ussd}]` + numéro de l'étape 1 (chiffres, indicatif inclus). Champs SebPay : `id, name, slug, code, country, otp_required` (+ `ussd_code` parfois).
- `collect` : `{amount, currency, phone (international sans +), operator, country, external_reference: "<commande>:c<n>", callback_url, return_url, customer_name, customer_email, otp_code?}`.
  - Réponse : `transaction_id`, `status: pending`, `provider_link` (Wave, Orange CI/SN/ML : à ouvrir dans un **nouvel onglet**, la page reste ouverte).
  - Ne jamais relancer une nouvelle référence tant qu'une demande est `pending` depuis moins de 2 min (le client paierait deux fois).
  - Erreurs : 422 `OTP_REQUIRED`, 400 `PAYMENT_DECLINED`, 422 `AMOUNT_TOO_LOW`, 503 maintenance → messages clairs (`collectionErrorMessage`).
  - Stocker la référence dans `payments.sebpay_session_id` sous la forme `col:<référence>` (réutilise vérification et balayage) + `raw.sebpay_collection`.
- `status` : relit et valide ; `rejected` → le formulaire revient avec un message.

Validation (`settleFromSebpay`, commune à la vérification de page, au webhook et au cron) :
- `GET /collections/<référence>` → `status` `pending | approved | rejected`.
- Payé seulement si la référence commence par l'id de la commande, `approved`, bonne devise, montant ≥ attendu. Fonction de confirmation unique et idempotente (id `sb_<transaction_id>`).
- **Piège vécu (payé mais resté « en attente ») :** `encodeURIComponent` transformait `:` en `%3A`, refusé par le relais → relecture impossible. Envoyer la référence **brute** (vérifiée par `^[A-Za-z0-9:_.-]{1,120}$`) et journaliser toute réponse illisible.

Webhook `sebpay-webhook` (`verify_jwt = false`) : signature `X-SebPay-Signature` = HMAC-SHA256 hex du **corps brut** avec la clé secrète, comparaison à temps constant (401 sinon). Envoyé seulement pour `approved` / `rejected`. Pour une collecte (`external_reference` en `:c<n>`, pas de `checkout_session_id`), relire **cette** référence. Répondre 200, ou 500 pour être rappelé.

Rattrapage : cron toutes les 2 min sur les commandes en attente ayant `sebpay_session_id`.

## 4. Page de paiement

- `SebPayPay` : boutons opérateurs (logo rond 28 px + nom, bordure primaire si choisi, fond `#f5f5f7`, pas d'ombre), numéro avec indicatif fixe, champ OTP avec le code USSD si `otp`, bouton pilule « Payer maintenant ».
- Écran d'attente « Valide le paiement sur ton téléphone », sondage `status` toutes les 4 s ; la page de paiement sonde aussi `verify-payment` toutes les 3 s et redirige seule vers `/payment/success`.
- Logos : chercher par code ou nom (`mtn|momo`, `moov|flooz`, `orange`, `wave`, `celtiis`, `airtel`, `free`, `t-money|togocom|yas`, `coris`). **Opérateur sans logo :** le récupérer soi-même sans demander (icône officielle de l'application via `https://itunes.apple.com/lookup?id=<id App Store>` → `artworkUrl512`), le rendre rond 96 px et l'ajouter. Sinon pastille avec l'initiale.

## 5. Frais (à expliquer à l'utilisateur)

Les frais SebPay sont **déduits de ce que reçoit le marchand** ; le client paie le prix exact. Compte « standard » : frais du pays + frais de retrait + conversion éventuelle ; compte professionnel multi-devises : seulement les frais du pays. Tarif exact : `GET /c/calculate-fee`. 5,8 % observé en production : conseiller de négocier ou de passer en compte professionnel.

## 6. Valider

- Tests unitaires (`reference/sebpay.test.ts`), puis aperçu local du formulaire avec réponses simulées (patch de `Object.getPrototypeOf(supabase.functions).invoke`, car `supabase.functions` est recréé à chaque accès).
- Paiement réel fait **par l'utilisateur** (petit montant), puis vérifier en base : `status = paid`, accès donné. Ne jamais déclencher de paiement réel ni créer de fausse vente soi-même.
