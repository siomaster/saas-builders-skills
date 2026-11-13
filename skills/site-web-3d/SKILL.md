---
name: site-web-3d
description: Construire des sites web 3D immersifs et des landing pages « wow » pilotées par le scroll (Three.js / WebGL, GSAP ScrollTrigger, Lenis, Vite), avec des images générées via ChatGPT (Codex CLI) et les vraies données de la marque. À utiliser dès que l'utilisateur demande un « site 3D », « site web 3D », « landing page 3D », « site immersif », « site comme everest.suraj.work / peachweb / butter.video », « effet 3D au scroll », « avion / produit / objet qui bouge au scroll », « vidéo qui avance quand on scrolle », « texte derrière le sujet », « site WebGL / Three.js », ou veut refaire un site existant en version 3D premium — même s'il ne dit pas explicitement « Three.js ». Ne pas utiliser pour une vidéo motion design (MP4) ni pour une simple page sans animation.
---

# Site web 3D immersif

Ce skill condense une méthode éprouvée (analyse de ~10 sites 3D primés + construction complète de la landing page Amazone Airlines) pour produire des sites qui impressionnent **sans être fragiles** : une vraie 3D là où elle apporte quelque chose, des vidéos/images IA là où le photoréalisme compte, et une finition soignée partout.

Point de départ prêt à l'emploi : `templates/starter/` (Vite + Three.js + GSAP + Lenis).

## Le point clé à comprendre

Il y a deux familles d'effets « 3D », et la plupart des sites spectaculaires les mélangent :

1. **Vraie 3D temps réel** (Three.js) : la scène est calculée par le navigateur, réagit à la souris et au scroll. Idéal pour : nuages/terrain/particules traversés, objet 3D (.glb) qu'on fait tourner, texte 3D, cartes.
2. **Fausse 3D** : vidéo ou séquence d'images **pilotée par le scroll**, ou **superposition de calques** (fond / gros titre / sujet détouré devant). Idéal pour : liquides, assemblages photoréalistes, transitions cinématographiques (montagne → océan, tour → plan). Bien moins risqué et souvent plus beau.

Choisis selon l'effet voulu, pas par principe. Détails, code et exemples de sites : `references/techniques.md`.

## Déroulé

### 1. Cadrer (5 minutes, sans bombarder l'utilisateur de questions)
- Marque / sujet, site officiel s'il existe, public, langue (français par défaut).
- L'effet « wow » principal du hero (un seul, fort) + 2-3 effets secondaires.
- Si l'utilisateur donne un site officiel : **récupère ses vraies infos et images** avant de concevoir (étape 2). Si une info manque, choisis une valeur raisonnable et dis-le à la fin plutôt que de bloquer.

### 2. Collecter les vraies données de la marque
- `python3 -I scripts/extract_site_data.py <url> <dossier>` : récupère titre, description, textes, contacts, couleurs CSS fréquentes et toutes les URL d'images (gère les sites Inertia/Vue `data-page`, Next.js `__NEXT_DATA__`, Nuxt et HTML classique). Explore aussi les pages secondaires (`/a-propos`, `/services`, `/faqs`…).
- Télécharge les images utiles, fais une planche contact et **regarde-les** : elles révèlent souvent un détail produit décisif (ex. : la vraie flotte d'Amazone était un jet Embraer, pas un turbopropulseur — l'avion généré a dû être refait).
- `python3 scripts/optimize_images.py <src> <dest> --width 1600` : JPEG progressifs légers.
- Logo, couleurs et vrais produits passent avant tout visuel inventé.
- Couleurs exactes : `extract_site_data.py` remonte souvent les couleurs par défaut de Bootstrap/WordPress ; cherche plutôt les **variables de design** du site (`grep -oiE -- '--(color|Colors)[A-Za-z0-9_-]*:\s*#[0-9a-f]{6}'` sur le HTML + CSS) et la couleur la plus fréquente hors Bootstrap.

### 3. Générer les visuels manquants avec ChatGPT (Codex CLI)
L'utilisateur a Codex connecté à son compte ChatGPT avec la génération d'images. Utilise le script :
```bash
scripts/codex_image.sh <dossier_projet> public/img/hero-sky.png "description détaillée…" [image_reference.jpg]
```
- Lance plusieurs images **en parallèle** (le script tourne en arrière-plan, log dans `.gen/`) puis code pendant ce temps : chaque image prend 2 à 6 minutes.
- Sujet à détourer (avion, produit, personne) : demande un **fond magenta uni #FF00FF**, puis `python3 scripts/key_magenta.py brut.png sujet.webp`.
- Pour un produit réel, passe une photo officielle en référence (4e argument) et demande « fidèlement basé sur l'avion/le produit de la photo jointe ».
- Codex enregistre en PNG même si le nom finit par .jpg → reconvertis avec `optimize_images.py`.
- Détails, modèles de prompts et limites : `references/assets-ia.md`. Codex ne fait pas de vidéo : pour une séquence pilotée au scroll, génère image de début + image de fin et demande à l'utilisateur de produire la vidéo (Kling, Veo, Runway…), puis découpe-la (`references/techniques.md` § Séquence d'images).

### 4. Monter le projet
```bash
cp -R ~/.claude/skills/site-web-3d/templates/starter <dossier_projet>
cd <dossier_projet> && npm install && npm run dev
```
Le starter contient : Vite, Three.js, GSAP (ScrollTrigger, MotionPath), Lenis déjà reliés ; un loader ; un hero épinglé avec nuages 3D + sujet devant un gros mot ; `effects.js` (SpotlightCard, Magnet, BlurText, LogoLoop, image qui suit le curseur, onglets glissants — portés de React Bits) ; `frame-scrub.js` (séquence d'images au scroll) ; `style.css` avec tokens. Adapte, supprime ce qui ne sert pas.

Icônes : `python3 scripts/build_icons.py src/icons.js takeoff=airplane-take-off-01 clock=clock-01 …` génère des SVG Hugeicons inline (`<i data-icon="clock"></i>`). Liste des noms : `ls ~/Developer/ui-libraries/hugeicons_hugeicons/icons`. Autres bibliothèques disponibles : skill `ui-libraries`.

Carte géographique : jamais un contour dessiné à la main — utilise les vraies limites administratives (geoBoundaries + d3-geo), voir `references/techniques.md` § Carte.

### 5. Règles de design de l'utilisateur (non négociables sauf avis contraire)
Ces règles viennent de ses retours ; les ignorer a déjà coûté une itération complète.
- **Police : Urbanist par défaut** (ou celle que l'utilisateur demande, ex. DM Sans pour Gozem), graisses fines 200-500. **Jamais de gras** (600+). **Jamais deux polices dans un même titre** (pas d'italique serif « pour l'accent ») — l'accent se fait par la couleur.
- **Le haut de page doit être lisible immédiatement** : logo, menu, bouton d'action visibles sur fond clair/opaque dès l'arrivée.
- **Pas de footer avec le nom de la marque en lettres géantes.** Un footer soigné : bloc CTA avec photo, colonnes de liens, contacts avec icônes, réseaux sociaux, mention légale, éventuellement une fine bande aux couleurs de la marque.
- Chiffres clés et services : **avec icônes** et une vraie mise en page (bento, cartes), pas de gros chiffres nus.
- Préférer les vraies photos / infos de la marque ; dire clairement ce qui est généré par IA.
- Une section = une idée forte ; un effet « wow » principal par écran, pas tout en même temps.

### 6. Contrôler visuellement (obligatoire)
Tu ne peux pas juger une animation au scroll sans la voir :
```bash
python3 scripts/shoot.py http://localhost:5173 <dossier_captures> --stops 0,1,2,3,5,8,12 --mobile
```
Le script fait défiler la page, capture ordinateur (1440×900) et mobile (390×844), assemble des planches et liste les erreurs console. Regarde chaque planche, corrige, recommence. Puis `npm run build` doit passer.
Les pièges qu'on rencontre presque à chaque fois (bande vide à droite d'une image de fond, menu à moitié caché, sections épinglées décalées, clip-path qui part de travers, carte trop haute…) sont listés avec leur correctif dans `references/pieges.md` — lis-le avant la première capture.

### 7. Livrer
Message court en français :
- l'URL locale et comment parcourir le site ;
- ce que fait chaque section (une ligne chacune) ;
- **ce qui est généré par IA** et **ce qui reste à valider** (textes inventés, liens approximatifs, formulaire non branché, données simplifiées) ;
- une ou deux pistes pour aller plus loin (ex. vidéo pilotée au scroll).

## Fichiers du skill
- `references/techniques.md` — familles d'effets, analyse des sites de référence, recettes de code (nuages, terrain par heightmap, modèle .glb, séquence d'images, calques de profondeur, clip-path, défilement horizontal, carte avec MotionPath).
- `references/assets-ia.md` — génération d'images via Codex/ChatGPT : commandes, prompts types, détourage, limites.
- `references/pieges.md` — bugs déjà rencontrés et correctifs.
- `scripts/` — `codex_image.sh`, `key_magenta.py`, `optimize_images.py`, `build_icons.py`, `extract_site_data.py`, `shoot.py`, `split_wheels.py` (véhicule qui roule).
- `templates/starter/` — projet Vite de départ.
