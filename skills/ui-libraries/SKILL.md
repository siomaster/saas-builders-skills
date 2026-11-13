---
name: ui-libraries
description: Index of open-source UI/animation/icon libraries (React Bits, Animate UI, Fancy Components, 3dsvg, Bklit, Inspira, VengeanceUI, Tremor, HeroUI, daisyUI, Ant Design, Hugeicons, 21st.dev…), cloned locally in ~/Developer/ui-libraries. Use when building or polishing any UI, landing page, dashboard, animation or icon set in any project, to pick and copy components from these sources instead of writing them from scratch.
---

# Bibliothèques UI (SaaS Builders)

Toutes les sources sont clonées (copie légère, `--depth 1`) dans `~/Developer/ui-libraries/`, un dossier par dépôt nommé `<propriétaire>_<dépôt>`.

## 0. Première utilisation : cloner les sources

Si `~/Developer/ui-libraries/` n'existe pas ou qu'il manque un dossier, le créer sans demander (c'est du code open source en lecture seule) :

```bash
mkdir -p ~/Developer/ui-libraries && cd ~/Developer/ui-libraries
for r in DavidHDev/react-bits Ashutoshx7/VengeanceUI bundui/components CristianOlivera1/openhero \
         ui-layouts/ui-tools uiverse-io/galaxy unovue/inspira-ui Jakubantalik/transitions.dev \
         MengTo/threeui renatoworks/3dsvg bklit/bklit-ui tremorlabs/tremor-blocks \
         shadcnspace/shadcnspace shadcn-ui/ui heroui-inc/heroui saadeghi/daisyui \
         hugeicons/hugeicons dqev/reicon; do
  d="${r/\//_}"; [ -d "$d" ] || git clone --depth 1 "https://github.com/$r.git" "$d" || echo "⚠️  $r indisponible, on continue"
done
```
- Ant Design (`ant-design/ant-design`) est très lourd : ne le cloner que si le projet l'utilise.
- Un dépôt peut avoir été renommé ou déplacé : en cas d'échec, chercher le nouveau nom sur GitHub plutôt que d'abandonner.
- Mettre à jour une source : `git -C ~/Developer/ui-libraries/<dossier> pull --depth 1`.

## Règle d'or

Toujours respecter d'abord les conventions du projet en cours (design system, couleurs, rayons, ombres, polices). Copier un composant = l'adapter au design system du projet, jamais importer toute une bibliothèque concurrente (Ant Design, HeroUI, daisyUI) dans un projet shadcn.

## Composants animés (React + Tailwind + Motion)
| Source | Dossier | Usage |
|---|---|---|
| React Bits | `DavidHDev_react-bits` | Textes animés (SplitText, BlurText, DecryptedText, RotatingText, CountUp, ShinyText), fonds, effets. Aussi via `npx shadcn@latest add https://reactbits.dev/r/<Nom>-TS-TW` (variantes JS/TS × CSS/TW, ex. `SplitText-TS-TW`). Skill `react-bits`. |
| Animate UI | registre | `npx shadcn@latest add @animate-ui/<composant>` (ex. `@animate-ui/primitives-texts-sliding-number`) → `@/components/animate-ui/...` |
| Fancy Components | registre | Ajouter `"@fancy": "https://fancycomponents.dev/r/{name}.json"` dans `registries` de components.json, puis `npx shadcn add @fancy/<nom>` et `npm install` (dépendances non installées automatiquement). Dépend de `motion`. |
| VengeanceUI | `Ashutoshx7_VengeanceUI` | Skill `vengeance-ui` |
| Bundui | `bundui_components` | Composants shadcn animés |
| OpenHero | `CristianOlivera1_openhero` | Sections hero |
| UI Layouts / UI Tools | `ui-layouts_ui-tools` | Layouts, outils de génération |
| Uiverse Galaxy | `uiverse-io_galaxy` | Milliers d'éléments HTML/CSS (boutons, loaders, inputs) |
| Inspira UI | `unovue_inspira-ui` | **Vue/Nuxt** (port de Aceternity/Magic UI) : à convertir pour React |
| Transitions.dev | `Jakubantalik_transitions.dev` | Transitions CSS prêtes pour la prod |
| ThreeUI (Meng To) | `MengTo_threeui` | Composants 3D / Three.js |
| 3dsvg | `renatoworks_3dsvg` | **Très important** : SVG → objets 3D animés. Lire `README.md` et `llms.txt` du dossier |

## Graphiques et tableaux de bord
| Source | Dossier | Usage |
|---|---|---|
| Bklit UI | `bklit_bklit-ui` | Graphiques shadcn |
| Tremor Blocks | `tremorlabs_tremor-blocks` | Blocs de dashboard (KPI, tableaux, graphiques) |
| ShadcnSpace | `shadcnspace_shadcnspace` | Blocs et templates |
| shadcn/ui | `shadcn-ui_ui` | Source officielle (`npx shadcn@latest`) |

## Bibliothèques complètes (uniquement si le projet les utilise déjà)
| Source | Dossier |
|---|---|
| HeroUI | `heroui-inc_heroui` |
| daisyUI | `saadeghi_daisyui` |
| Ant Design | `ant-design_ant-design` (référence) |

## Animation
- GSAP (gratuit, plugins compris) : `npm i gsap` ; skills officielles installables avec `npx skills add greensock/gsap-skills` si besoin.

## Icônes
- Hugeicons : `hugeicons_hugeicons` (`npm i @hugeicons/react @hugeicons/core-free-icons`).
- Reicon : `dqev_reicon`.
- Nucleo : `npx @nucleoicons/skills setup --target react --tools claude` (familles gratuites ; compte Nucleo pour les familles sous licence).

## 21st.dev
- Catalogue de composants React/shadcn : https://21st.dev — CLI `npx @21st-dev/cli` (recherche, installation, génération par IA).

## Dépendances
Installer projet par projet (bonnes versions) : `tailwindcss`, `motion`, `gsap`. shadcn CLI s'utilise via `npx shadcn@latest`.
