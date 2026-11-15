# Installation des skills SaaS Builders — instructions pour Claude Code

> Ce fichier s'adresse à **Claude Code**. L'élève t'a envoyé ce lien : installe les skills ci-dessous sur sa machine, sans lui demander de manipuler des fichiers. Parle-lui en français, simplement.

## Ce que tu installes

12 skills, dans le dossier de skills **personnel** de l'utilisateur (disponibles dans tous ses projets) :

| Skill | Rôle |
|---|---|
| `react-bits` | Composants animés React Bits (textes, fonds, micro-interactions) |
| `vengeance-ui` | Composants animés VengeanceUI (heroes, boutons, navbars) |
| `ui-libraries` | Index des bibliothèques UI open source à utiliser au lieu de tout coder |
| `site-web-3d` | Sites et landing pages 3D immersifs (Three.js, GSAP, scroll) |
| `dodo-payment-integration` | Paiement par carte avec Dodo Payments (gère la TVA) |
| `paypal` | Paiement PayPal + carte bancaire dans la page |
| `fedapay` | Mobile Money + carte avec FedaPay (Bénin, Togo, CI, Niger, Sénégal) |
| `sebpay-integration` | Mobile Money avec SebPay, sans redirection |
| `saspay-integration` | Mobile Money avec SasPay, en marque blanche (reçus SasPay envoyés sur l'e-mail de l'élève) |
| `moneyfusion` | MoneyFusion : encaissements et retraits Mobile Money |
| `moneyfusion-integration` | MoneyFusion intégré dans la page de paiement |
| `nyole` | Mobile Money avec Nyole / Cartflox (widget SoftPay) |

## Étapes

1. **Télécharger** le dépôt dans un dossier temporaire :
   - macOS / Linux :
     ```bash
     TMP="$(mktemp -d)" && git clone --depth 1 https://github.com/siomaster/saas-builders-skills.git "$TMP/sbs"
     ```
   - Windows (PowerShell) :
     ```powershell
     $TMP = Join-Path $env:TEMP "sbs-$(Get-Random)"; git clone --depth 1 https://github.com/siomaster/saas-builders-skills.git $TMP
     ```
   Si `git` n'est pas installé : macOS → `xcode-select --install` ; Windows → `winget install Git.Git`. Sinon, télécharger l'archive `https://github.com/siomaster/saas-builders-skills/archive/refs/heads/main.zip` et la décompresser.

2. **Copier chaque dossier de `skills/`** vers le dossier de skills personnel :
   - macOS / Linux : `~/.claude/skills/<nom>/`
     ```bash
     mkdir -p ~/.claude/skills
     for d in "$TMP/sbs/skills"/*/; do n="$(basename "$d")"; rm -rf ~/.claude/skills/"$n"; cp -R "$d" ~/.claude/skills/"$n"; done
     ```
   - Windows : `%USERPROFILE%\.claude\skills\<nom>\`
     ```powershell
     $dest = Join-Path $env:USERPROFILE ".claude\skills"; New-Item -ItemType Directory -Force $dest | Out-Null
     Get-ChildItem "$TMP\skills" -Directory | ForEach-Object { $t = Join-Path $dest $_.Name; if (Test-Path $t) { Remove-Item -Recurse -Force $t }; Copy-Item -Recurse $_.FullName $t }
     ```
   Un skill du même nom déjà présent est **remplacé** : c'est ainsi que se font les mises à jour. Ne touche à aucun autre skill.

3. **Vérifier** : chaque dossier copié doit contenir un `SKILL.md`. Liste les 12 skills installés à l'utilisateur, avec une phrase sur leur rôle (tableau ci-dessus).

4. **Nettoyer** le dossier temporaire.

5. **Dire à l'utilisateur** :
   - que les skills sont prêts et se déclenchent tout seuls quand il en parle (ex. « intègre FedaPay », « fais-moi un site 3D », « ajoute un texte animé React Bits ») ;
   - de **redémarrer Claude Code** (fermer puis rouvrir) si les skills n'apparaissent pas encore dans `/skills` ;
   - que pour mettre à jour, il suffit de renvoyer le même lien.

## Règles

- N'installe rien d'autre que ces dossiers. Ne lance aucun script contenu dans les skills pendant l'installation.
- Ne demande jamais de clés API à ce stade (ni l'e-mail de réception de SasPay : le skill le demandera à sa première utilisation) : chaque skill de paiement les demandera au moment de l'intégration, et elles iront dans les secrets serveur, jamais dans le chat.
- Le skill `ui-libraries` clonera lui-même ses bibliothèques open source la première fois qu'il servira : rien à faire maintenant.
