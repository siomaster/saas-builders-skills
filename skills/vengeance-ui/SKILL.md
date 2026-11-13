---
name: vengeance-ui
description: 'Use VengeanceUI (vengenceui.com) animated React/Tailwind components — heroes, buttons, navbars, text animations, backgrounds, cards — when building a landing page, website or UI section, or when the user mentions VengeanceUI, Vengeance UI, vengenceui.com or #vengeance. Covers finding the right component in the local catalog, installing it with shadcn in React/Next.js projects, and porting it to vanilla HTML/CSS/JS for Systeme.io pages.'
---

# VengeanceUI

74 composants animés (Framer Motion, GSAP, Three.js…) distribués via un registre shadcn.
Site : https://www.vengenceui.com — Dépôt : https://github.com/Ashutoshx7/VengeanceUI (MIT).

Préférer un composant du catalogue plutôt que réinventer un équivalent.

## 1. Trouver le composant

1. Lire `catalog.md` (dans ce dossier) : liste par catégorie avec le **componentName** à installer.
2. Pour les props, l'exemple d'utilisation et les dépendances d'un composant, chercher son
   componentName dans `catalog-full.json` (ne jamais charger tout le fichier : grep/jq sur le nom).
3. Pour le code source complet :
   `curl -s https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/public/r/{componentName}.json`
   (le champ `files[].content` contient le code).

## 2. Projet React / Next.js (Vite, Next, Lovable…)

Prérequis dans le projet : shadcn initialisé (`npx shadcn@latest init`), Tailwind, et `cn` dans `@/lib/utils`.

```bash
npx shadcn@latest add https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/public/r/{componentName}.json
```

Raccourci optionnel, dans `components.json` du projet :

```json
{ "registries": { "@vengeanceui": "https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/public/r/{name}.json" } }
```

puis `npx shadcn@latest add @vengeanceui/{componentName}`.

Ensuite : adapter le `usageCode` du catalogue, sans réécrire le composant. Voir `conventions.md`.

## 3. Page Systeme.io (HTML pur, bloc « Code HTML »)

Les composants sont en React : ils ne se collent pas tels quels dans Systeme.io.
Récupérer le code source (étape 1.3), puis le porter en HTML/CSS/JS vanilla :
- Framer Motion → GSAP (cdnjs) ou CSS ;
- classes Tailwind → CSS écrit à la main (pas de Tailwind dans un bloc Systeme.io) ;
- garder le rendu, les timings et les easings d'origine, et la gestion de `prefers-reduced-motion`.
Indiquer à l'utilisateur quel composant VengeanceUI a servi de base.

## Remarques

- Le CLI `npx vengeanceui init` et le serveur MCP `vengeanceui-mcp` cités dans la doc ne sont pas publiés
  sur npm (vérifié le 2026-09-26) : ne pas les lancer. Ce skill les remplace avec le catalogue local.
- Pour mettre le catalogue à jour : retélécharger
  `https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/packages/mcp/data/index.json` dans `catalog-full.json`.
- Jamais d'emoji dans les pages de l'utilisateur.
