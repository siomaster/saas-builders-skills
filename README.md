# SaaS Builders — Skills pour Claude Code

Les skills utilisés dans la formation **SaaS Builders** : interfaces animées, sites 3D et paiements (carte bancaire et Mobile Money Afrique).

## Installation (30 secondes)

Ouvre **Claude Code** et envoie-lui ce message :

```
Installe les skills SaaS Builders en suivant https://github.com/siomaster/saas-builders-skills/blob/main/INSTALL.md
```

Claude s'occupe de tout. Pour mettre à jour, renvoie le même message.

## Ce qui est inclus

**Interface et design**
- `react-bits` — composants animés React Bits (textes, fonds, micro-interactions)
- `vengeance-ui` — composants animés VengeanceUI
- `ui-libraries` — index de bibliothèques UI open source (shadcn, Tremor, Bklit, 3dsvg…)
- `site-web-3d` — sites et landing pages 3D immersifs pilotés par le scroll

**Paiements**
- `dodo-payment-integration` — carte bancaire avec Dodo Payments (TVA gérée)
- `paypal` — PayPal + carte bancaire dans la page
- `fedapay` — FedaPay : Mobile Money + carte (Bénin, Togo, Côte d'Ivoire, Niger, Sénégal)
- `sebpay-integration` — SebPay : Mobile Money sans redirection
- `moneyfusion` / `moneyfusion-integration` — MoneyFusion : encaissements, retraits, paiement dans la page
- `nyole` — Nyole / Cartflox (widget SoftPay)

## Bon à savoir

- Les skills se déclenchent tout seuls : dis simplement à Claude « intègre FedaPay », « fais un site 3D », etc.
- Tes clés API ne se collent **jamais** dans le chat : Claude te montrera comment les ranger dans les secrets de ton serveur.
- `site-web-3d` peut générer des images via **Codex CLI** connecté à ChatGPT (optionnel).
- SebPay et MoneyFusion exigent une **IP fixe** : il te faudra un petit VPS comme relais (le skill explique tout).
