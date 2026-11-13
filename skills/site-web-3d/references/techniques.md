# Techniques des sites 3D

## Sommaire
1. Ce que font les sites de référence
2. Choisir la technique
3. Socle : Lenis + GSAP ScrollTrigger
4. Hero épinglé et scénarisé au scroll
5. Nuages / particules traversés (Three.js sprites)
6. Terrain à partir d'une heightmap
7. Modèle 3D .glb
8. Séquence d'images pilotée par le scroll (« vidéo au scroll »)
9. Calques de profondeur (texte derrière le sujet)
10. Révélations : clip-path, BlurText, compteurs
11. Défilement horizontal épinglé
12. Carte réelle + tracé animé (d3-geo + MotionPath)
13. Effets d'interface portés de React Bits
14. Véhicule qui roule au scroll (roues qui tournent + décor qui défile)

---

## 1. Ce que font les sites de référence

| Site | Pile technique | L'effet |
|---|---|---|
| everest.suraj.work | Vite, Three.js r170, Lenis | Montagnes générées depuis `heightmap.png` + textures ; la caméra suit un parcours au scroll ; étiquettes 3D→2D ; tableau de bord en direct ; son. |
| peachweb.io / curated.media / bmw.peachworlds.com | PeachWeb (no-code), Three.js r180, Lenis | Modèles .glb (poisson, colibri, voiture), éclairage HDR, vidéos utilisées comme textures, brouillard qui monte au scroll. |
| haoqi.design | Next.js, Three.js r184, Lenis | Texte 3D gonflé (.gltf) qui se dissout en trame de points ; cartes projet qui se plient (shader). |
| butter.video | Next.js, Three.js r183, Lenis | Porte-clés de 7 .glb avec physique ; icônes 3D qui tombent dans le texte ; beaucoup de petites vidéos en boucle. |
| airvoir.com | Webflow, GSAP, **pas de 3D** | L'avion est une simple vidéo .webm. Preuve qu'une vidéo bien intégrée suffit. |

Vidéos d'inspiration de l'utilisateur (dossier `~/Downloads/3D WEBSITES INSPIRATION/`) : châssis qui s'assemble en voiture, montagne → brume → océan avec pétrolier, tour → maquette → plan, café qui se verse dans une tasse → **séquences vidéo IA pilotées au scroll**. Villa derrière une porte puis « Future » derrière une femme, « Luxury » derrière une main → **calques de profondeur**. Hôtel avec collages et gravures → images IA + masques GSAP.

## 2. Choisir la technique

| L'effet voulu | Technique | Pourquoi |
|---|---|---|
| Liquide, assemblage, transformation photoréaliste | Séquence d'images au scroll (§8) | Le temps réel ne rendra jamais aussi bien. |
| Traverser des nuages, un paysage, des particules | Three.js sprites/terrain (§5, §6) | Profondeur réelle, réagit à la souris. |
| Objet que l'on fait tourner ou qui suit la souris | Modèle .glb (§7) | Interaction vraie. Il faut le modèle (Sketchfab, Spline, fabricant). |
| Sujet héroïque devant un mot géant | Calques (§9) + image détourée | Très fort pour peu d'effort. |
| Itinéraire, réseau, implantation | Carte réelle d'après des données (§12) | Crédible et animable. |

Combinaison gagnante pour un hero : ciel/décor (image) + nuages Three.js + mot géant + sujet détouré devant + scénario au scroll (le sujet grossit, passe devant la caméra, on traverse les nuages jusqu'à une couleur unie qui introduit la section suivante).

## 3. Socle : Lenis + GSAP ScrollTrigger

```js
const lenis = new Lenis({ lerp: 0.09 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
```
- Ancres : `lenis.scrollTo('#id', { offset: -110, duration: 1.6 })`.
- Pendant le loader : `lenis.stop()`, puis `lenis.start(); ScrollTrigger.refresh()`.
- Regroupe toutes les animations dans `gsap.matchMedia()` avec une condition `(prefers-reduced-motion: no-preference)` et donne une version statique sinon.
- **Crée les ScrollTriggers épinglés dans l'ordre de la page** (cf. pieges.md).

## 4. Hero épinglé et scénarisé

```js
gsap.timeline({
  defaults: { ease: 'none' },
  scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=260%', scrub: 1, pin: true, invalidateOnRefresh: true,
    onUpdate: (s) => clouds.setProgress(s.progress), onToggle: (s) => (s.isActive ? clouds.start() : clouds.stop()) },
})
  .to('.hero__copy', { y: -90, opacity: 0, duration: 2 }, 0)
  .to('.hero__word span', { x: (i) => (i - 3) * innerWidth * 0.07, opacity: 0, duration: 4 }, 0.4)
  .to('.hero__subject', { scale: 1.45, rotation: -4, duration: 4 }, 0)
  .to('.hero__subject', { x: () => innerWidth * 0.62, y: () => -innerHeight * 0.55, scale: 3, duration: 3.5, ease: 'power2.in' }, 4)
  .to('.hero__copy2', { opacity: 1, duration: 1.2 }, 5.2)   // 2e message APRÈS le passage du sujet
  .to('.hero__whiteout', { opacity: 1, duration: 1.8 }, 8.2);
```
- Durées en « unités » (total ≈ 10) : facile à rééquilibrer.
- Positionne le sujet avec `gsap.set(el, { xPercent: -50, yPercent: -50 })` plutôt qu'un `transform` CSS.
- Flottement permanent sur un **élément enfant** (`yoyo`), scénario au scroll sur le parent : jamais deux tweens sur la même propriété du même élément.
- Section suivante qui « sort des nuages » : `margin-top: -48vh` + `z-index` au-dessus du hero.

## 5. Nuages traversés (Three.js)

Voir `templates/starter/src/clouds.js`. Principe :
- 150–200 `THREE.Sprite` avec une texture de nuage générée sur un `<canvas>` (des disques en dégradé radial), `transparent`, `depthWrite: false`, `fog: true`.
- Répartis en Z de -8 à -260, surtout sous l'horizon ; un banc dense en fin de parcours pour le « fondu au blanc ».
- `camera.position.z = progress * END_Z`, avec un lissage (`current += (target - current) * 0.08`) et un léger décalage selon la souris.
- `renderer` avec `alpha: true` pour voir l'image de ciel derrière ; `setPixelRatio(min(dpr, 1.6))` ; moins de sprites sur mobile.
- Boucle de rendu active uniquement pendant que le hero est visible (`onToggle`).

## 6. Terrain par heightmap (façon Everest)

```js
const geo = new THREE.PlaneGeometry(200, 200, 512, 512);
geo.rotateX(-Math.PI / 2);
const mat = new THREE.MeshStandardMaterial({
  map: baseTex, normalMap: normalTex,
  displacementMap: heightTex, displacementScale: 28,
});
```
La heightmap (image en niveaux de gris) peut venir de données réelles (SRTM, terrain.party) ou être générée par IA (« heightmap en niveaux de gris d'une chaîne de montagnes, vue du dessus »). Caméra animée le long d'une `CatmullRomCurve3` : `curve.getPointAt(progress)`.

## 7. Modèle 3D .glb

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
new RGBELoader().load('/env.hdr', (t) => { t.mapping = THREE.EquirectangularReflectionMapping; scene.environment = t; });
new GLTFLoader().load('/model.glb', (g) => scene.add(g.scene));
```
Sources de modèles : Sketchfab (vérifier la licence), Poly Pizza, Spline (export), fabricant. Compresser avec `npx gltf-transform optimize in.glb out.glb --compress draco`. Bibliothèques locales utiles : `~/Developer/ui-libraries/MengTo_threeui` (composants Three.js), `renatoworks_3dsvg` (SVG → objet 3D, lire son `llms.txt`).

## 8. Séquence d'images pilotée par le scroll

1. Obtenir une vidéo : image de début + image de fin générées (Codex), puis vidéo produite par l'utilisateur (Kling / Veo / Runway, mode « start frame + end frame »). Ou une vidéo de la marque.
2. Découper :
```bash
mkdir -p public/seq && ffmpeg -i video.mp4 -vf "fps=30,scale=1600:-1" -q:v 4 public/seq/f_%04d.jpg
```
   Viser 90–180 images, 60–120 Ko chacune. Une version 900 px pour mobile si besoin.
3. Lire au scroll : `templates/starter/src/frame-scrub.js` (canvas « cover », préchargement progressif, image la plus proche si pas encore chargée).
```js
import { frameScrub } from './frame-scrub.js';
frameScrub({ canvas: '.seq canvas', trigger: '.seq', count: 150, src: (i) => `/seq/f_${String(i + 1).padStart(4, '0')}.jpg`, end: '+=300%' });
```
Alternative légère sans découpage : `<video muted playsinline preload="auto">` et `video.currentTime = progress * duration` (moins fluide, surtout sur Safari ; encoder avec `-g 1` pour des images clés partout).

## 9. Calques de profondeur

Ordre z : décor → (nuages/particules) → **mot géant** → **sujet détouré** → interface.
- Sujet : image PNG/WebP transparente (Codex sur fond magenta + `key_magenta.py`).
- Le mot en Urbanist 400, très grand (`clamp(90px, 19vw, 380px)`), blanc à 90 % ; le sujet le chevauche en partie.
- Au scroll : lettres qui s'écartent (`x: i => (i-3)*k`) et s'effacent pendant que le sujet grossit.
- Lisibilité du texte d'accroche : voile en dégradé (`.hero__scrim`) en bas à gauche.

## 10. Révélations

- **Clip-path** (image qui s'ouvre en plein écran) : toujours `fromTo` avec deux chaînes de même format :
  `fromTo(el, { clipPath: 'inset(18% 22% 18% 22% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)' })`.
- **BlurText** (React Bits) : découper le titre en mots, `from({ opacity: 0, filter: 'blur(10px)', y: -24, stagger: 0.06 })`.
- **Compteurs** : `gsap.to(obj, { v: fin, onUpdate })` déclenché une fois à l'entrée ; formater `toLocaleString('fr-FR')`.
- Mots qui s'allument au scroll : opacité 0.14 → 1 en `scrub`.

## 11. Défilement horizontal épinglé

```js
const dist = () => track.scrollWidth - innerWidth;
gsap.to(track, { x: () => -dist(), ease: 'none',
  scrollTrigger: { trigger: '.dest', start: 'top top', end: () => `+=${dist()}`, pin: '.dest__pin', scrub: 1, invalidateOnRefresh: true } });
```
Seulement à partir de 641 px ; en mobile, pile verticale.

## 12. Carte réelle + tracé animé

- Données : geoBoundaries (licence ouverte)
  `https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/<ISO3>/ADM1/geoBoundaries-<ISO3>-ADM1_simplified.geojson` (ADM1 = régions/départements, ADM2 = communes).
- `npm i d3-geo` ; `geoMercator().fitExtent([[30,20],[W-30,H-20]], featureCollection)` ; `geoPath(projection)`.
- **Ré-orienter les anneaux** sinon d3 remplit tout le globe : si `geoArea(polygon) > 2π`, inverser les anneaux (code dans l'exemple Amazone `src/map.js`).
- Corriger les noms du jeu de données (accents, coquilles : « Atlanique » → « Atlantique »).
- Route : `path` SVG en courbe quadratique, `strokeDasharray/strokeDashoffset` au scroll, avion qui suit avec `MotionPathPlugin` (`align`, `autoRotate: 90` si l'icône pointe vers le haut).
- Survol d'une région : infobulle avec nom + chef-lieu.

## 13. Effets d'interface (React Bits → vanilla)

Code prêt dans `templates/starter/src/effects.js` :
- `spotlight('.spot')` — halo radial + liseré qui suivent le pointeur (SpotlightCard).
- `magnet('.magnet')` — bouton attiré par le curseur (Magnet).
- `blurText('.blur-text')` — titres mot à mot en flou (BlurText).
- `logoLoop('.logo-loop__track')` — bande de logos infinie qui ralentit au survol (LogoLoop).
- `followImage('.svc', '.svc-follow')` — l'image de la ligne survolée suit le curseur.
- `slidingTabs('.tabs')` — onglets avec pastille glissante (transitions.dev).
Sources d'origine : `~/Developer/ui-libraries/DavidHDev_react-bits/src/content/…`.

## 14. Véhicule qui roule au scroll

1. Générer le véhicule **en profil strict** (roues rondes), fond magenta, aux couleurs de la marque ; référence = photo réelle de la flotte.
2. `key_magenta.py brut.png src.webp`, puis `split_wheels.py public/img/car.webp public/img src/data/car.json [--recolor #couleur]`.
3. `templates/starter/src/vehicle.js` : `mountVehicle(el)` pose la carrosserie + les deux roues ; `rotate(distancePx)` les fait tourner (distance / circonférence × 360°).
4. Décor : une photo de rue panoramique → bande sans couture = image + son miroir côte à côte, en `background: repeat-x`, `background-position-x = -distance × 0.3` ; route en CSS avec pointillés `repeating-linear-gradient` décalés de `-distance`.
5. Une seule variable « distance » (croisière lente permanente + `progress × 7000 px` au scroll, lissée) pilote roues, décor, pointillés, traits de vitesse et petit rebond de la caisse. L'arrivée et la sortie de la voiture = décalage X ajouté à la distance des roues (elles tournent aussi).
