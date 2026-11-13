# Pièges déjà rencontrés (et correctifs)

Chaque point ci-dessous a réellement cassé un rendu. Vérifie-les avant la première capture.

| Symptôme | Cause | Correctif |
|---|---|---|
| Bande de couleur vide sur le bord droit d'une image de fond agrandie | Règle globale `img { max-width: 100% }` qui bride `width: 108%` | `max-width: none` sur l'image de fond |
| Menu / logo / bouton à moitié sortis par le haut | Animation GSAP `y` sur `.nav` + `transition: transform` CSS qui se battent | Intro de la nav en `autoAlpha` seulement ; masquer au scroll avec la propriété CSS **`translate`** (pas `transform`) |
| Haut de page peu lisible | Liens blancs sur ciel clair | Pastilles blanches opaques/vitrées avec texte foncé + ombre |
| Sections épinglées décalées, espaces vides | ScrollTriggers `pin` créés dans le désordre | Les créer dans l'ordre de la page (ou `refreshPriority`) ; un seul `matchMedia` ordonné |
| L'image en clip-path s'ouvre de travers | GSAP interpole `inset(18% 22% round 28px)` (forme raccourcie calculée) vers 4 valeurs | `fromTo` avec deux chaînes complètes de même format |
| Écran vide entre le hero et la suite | Le hero se termine sur un fond uni puis défile d'une hauteur d'écran | Section suivante remontée (`margin-top: -48vh`, `z-index: 2`) |
| Le 2e message du hero se superpose au sujet | Apparaît pendant que le sujet est encore au centre | Le faire apparaître après le passage du sujet |
| Visage coupé dans un cadre en parallaxe | `height: 120%` + `yPercent` trop fort | `height: 115%`, `yPercent -10 → 0`, `object-position: center 12%` |
| Carte SVG trop haute, sort de l'écran | `height: 100%` sur un enfant de grille à rangée `auto` (ignoré) | Hauteur explicite sur le `<svg>` : `min(calc(100svh - 150px), 860px)` |
| d3-geo dessine un rectangle plein / le globe entier | Anneaux GeoJSON dans le sens RFC 7946 | Inverser les anneaux si `geoArea > 2π` |
| Champs de formulaire tronqués (« Cotonou ( ») | Trop de colonnes + icône en colonne | Icône dans la ligne du libellé, bouton d'envoi sur toute la largeur en dessous |
| `codex exec … -i ref.jpg "prompt"` → « No prompt provided » | `-i` accepte plusieurs fichiers et avale le texte | Mettre le prompt **avant** `-i` (le script `codex_image.sh` le fait) |
| Images « .jpg » de 2-3 Mo | Codex écrit du PNG quel que soit le nom | `optimize_images.py` |
| `python3 -I` → « No module named numpy » | Le mode isolé ignore les paquets utilisateur | Lancer sans `-I` depuis le dossier du skill/scratchpad (fichiers générés par nous, pas téléchargés) |
| Playwright : « Executable doesn't exist » | Navigateurs Playwright non installés pour cette version | `launch(channel='chrome')` (Chrome installé) — déjà dans `shoot.py` |
| Avertissements « GPU stall due to ReadPixels » en capture | Captures d'un canvas WebGL en headless | Sans gravité, ignorer |
| Compteurs à « 59 992 » sur les captures | Capture prise pendant l'animation | Normal ; vérifier la valeur finale à l'œil si besoin |
| Mauvais produit représenté (turbopropulseur au lieu de jet) | Visuel généré avant d'avoir vu les vraies photos | Toujours collecter et regarder les images officielles **avant** de générer |
| Scène Three.js d'une section plus bas reste noire (aucun rendu) | Déclencheur `onToggle` créé avant les sections épinglées du dessus → positions fausses | Démarrer/arrêter la boucle avec un `IntersectionObserver` sur la section, indépendant des ScrollTriggers |
| Détection des roues qui englobe toute la voiture | Carrosserie sombre comptée comme « pneu » | Critère sombre **et peu saturé** + profil par colonnes (`split_wheels.py`) |
| `npm install` échoue ou `npx vite` introuvable sur un disque externe | Disque en exFAT : pas de liens symboliques (node_modules/.bin) | `npm install --no-bin-links` et scripts `node node_modules/vite/bin/vite.js` |
| Tous les sites finissent par se ressembler | Toujours le même gabarit (hero épinglé + bento + révélation + cartes horizontales) | Changer de concept à chaque projet : un monde 3D unique piloté par chapitres (NFT STREETVERSE), voiture qui roule (Gozem), etc. |
