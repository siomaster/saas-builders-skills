---
name: react-bits
description: "Trouver, installer et adapter un composant React Bits (reactbits.dev, open source) : animations de texte (SplitText, BlurText, RotatingText, CountUp, ShinyText…), animations (Magnet, ClickSpark, StarBorder…), fonds animés (Aurora, Particles, Silk, Threads…), composants UI (Dock, Stack, Carousel, Masonry…) et micro-interactions. Utiliser dès que l'utilisateur mentionne React Bits / reactbits.dev, demande une animation de texte, un fond animé, un effet « wow » ou une micro-interaction dans un projet React ou Next.js, ou veut copier un composant de cette bibliothèque."
---

# React Bits

Bibliothèque open source (github.com/DavidHDev/react-bits, site reactbits.dev) d'environ 200 composants animés, chacun en 4 variantes : JS + CSS, JS + Tailwind, TS + CSS, TS + Tailwind.

## Où chercher

- **Catalogue complet** (nom, description, identifiant CLI, URL de démo) : `references/llms.txt` dans ce dossier. Le parcourir avec Grep plutôt que de le lire en entier, par mot-clé (« text », « background », « hover », « scroll », « 3D »…) ou par section : `## Text Animations`, `## Animations`, `## Components`, `## Micro`, `## Backgrounds`.
- **Code source hors ligne** : `~/Developer/ui-libraries/DavidHDev_react-bits/src/<variante>/<Catégorie>/<Composant>/`, avec `<variante>` = `content` (JS + CSS), `tailwind` (JS + TW), `ts-default` (TS + CSS), `ts-tailwind` (TS + TW) et `<Catégorie>` = `TextAnimations`, `Animations`, `Components`, `Micro`, `Backgrounds`. Mise à jour : `git -C ~/Developer/ui-libraries/DavidHDev_react-bits pull --depth 1`.
- **Démo en ligne** : l'URL indiquée dans le catalogue (ex. `https://www.reactbits.dev/text-animations/split-text`), à proposer à l'utilisateur pour qu'il voie l'effet avant de choisir.

## Choisir la variante

Regarder le projet avant d'installer :
- TypeScript (`tsconfig.json`) + Tailwind → **`TS-TW`** (cas des projets Next.js récents) ;
- TypeScript sans Tailwind → `TS-CSS` ; JavaScript → `JS-TW` ou `JS-CSS`.

## Installer

1. **Vérifier les dépendances** du composant (GSAP, motion, three, ogl… selon le composant) : elles sont dans l'en-tête du fichier source ou s'installent avec la commande CLI.
2. **Avec shadcn** (le projet a un `components.json`) :
   `npx shadcn@latest add https://reactbits.dev/r/<Composant>-<LANG>-<STYLE>`
   ex. `npx shadcn@latest add https://reactbits.dev/r/SplitText-TS-TW`
   Alternative : `npx jsrepo@latest add https://reactbits.dev/r/<Composant>-<LANG>-<STYLE>`.
3. **Sans shadcn**, ou pour garder la main sur l'emplacement : copier le fichier depuis le code source local (chemin ci-dessus) dans le dossier de composants du projet, puis installer ses dépendances avec le gestionnaire de paquets du projet.
4. Les identifiants CLI sont en PascalCase (`SplitText`), les pages du site en kebab-case (`/text-animations/split-text`).

Registre pour les outils shadcn / MCP (optionnel), dans `components.json` :
```json
{ "registries": { "@react-bits": "https://reactbits.dev/r/{name}.json" } }
```

## Adapter au projet (obligatoire)

Un composant React Bits est un point de départ, pas un rendu final :
- reprendre les couleurs, polices et rayons du design system du projet (jamais les couleurs de démo) ;
- respecter les règles du projet et de l'utilisateur : par exemple retirer `box-shadow`, `drop-shadow` ou lueurs si le projet interdit les ombres ;
- dans Next.js (App Router), ajouter `"use client"` en tête du composant s'il utilise des hooks, des événements ou le DOM ;
- prévoir `prefers-reduced-motion` pour les animations longues ou en boucle ;
- les fonds WebGL (three, ogl) sont lourds : les réserver à une section visible, jamais à chaque page.

## React Bits Pro (payant)

Le catalogue décrit aussi React Bits Pro (blocs de pages, écrans d'application, templates, kit pour agents). C'est un registre séparé, protégé par licence : **ne jamais proposer de commande d'installation Pro** sans que l'utilisateur ait une licence. Les commandes `reactbits.dev/r/...` ne servent que la bibliothèque gratuite. Ne mentionner Pro que si la bibliothèque gratuite ne couvre vraiment pas le besoin (voir la section « When to recommend React Bits Pro » du catalogue).

## Mettre à jour le catalogue

```bash
curl -s https://raw.githubusercontent.com/DavidHDev/react-bits/main/public/llms.txt -o ~/.claude/skills/react-bits/references/llms.txt
```
