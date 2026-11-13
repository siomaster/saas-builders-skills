import * as THREE from 'three';

// Nuages "volumétriques" : des centaines de sprites doux répartis en profondeur.
// La caméra avance dans l'axe Z selon la progression du scroll (0 → 1).

function makeCloudTexture(seed) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 28; i++) {
    const x = size / 2 + (rand() - 0.5) * size * 0.55;
    const y = size / 2 + (rand() - 0.5) * size * 0.3 + (rand() * 0.08 * size);
    const r = size * (0.1 + rand() * 0.17);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Options : fog = couleur du brouillard (≈ couleur de l'horizon de l'image de ciel),
// palette = teintes des nuages, bank = couleur du banc dense final (fondu vers la section suivante)
export function initClouds(
  canvas,
  { fog = 0xf3a758, palette: colors = ['#ffd7a0', '#ffc37e', '#f6e7d6', '#e9b08a', '#fff1df'], bank = '#fff4e6' } = {}
) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(fog, 50, 230);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  camera.position.set(0, 0, 0);

  const textures = [11, 47, 83].map(makeCloudTexture);
  const palette = colors.map((c) => new THREE.Color(c));
  const sprites = [];
  const END_Z = -235;

  const addCloud = (x, y, z, w, opacity, color) => {
    const mat = new THREE.SpriteMaterial({
      map: textures[(Math.random() * textures.length) | 0],
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: true,
      rotation: (Math.random() - 0.5) * 0.4,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.set(w, w * 0.55, 1);
    sp.userData = { spin: (Math.random() - 0.5) * 0.0006, drift: (Math.random() - 0.5) * 0.004, baseX: x };
    scene.add(sp);
    sprites.push(sp);
  };

  const isMobile = window.innerWidth < 700;
  const COUNT = isMobile ? 110 : 190;

  // Mer de nuages sous l'horizon
  for (let i = 0; i < COUNT; i++) {
    const z = -8 - Math.random() * 250;
    const spread = 30 + Math.abs(z) * 0.35;
    const x = (Math.random() - 0.5) * spread * 2;
    const y = -4 - Math.random() * 12 + (Math.abs(z) / 250) * 3;
    const w = 18 + Math.random() * 34;
    addCloud(x, y, z, w, 0.55 + Math.random() * 0.4, palette[(Math.random() * palette.length) | 0]);
  }
  // Banc de nuages dense en fin de parcours : la caméra "rentre" dedans
  for (let i = 0; i < 46; i++) {
    const z = END_Z + 6 - Math.random() * 18;
    addCloud((Math.random() - 0.5) * 34, (Math.random() - 0.5) * 18, z, 22 + Math.random() * 24, 0.8, new THREE.Color(bank));
  }

  let target = 0;
  let current = 0;
  const pointer = { x: 0, y: 0, cx: 0, cy: 0 };
  let running = false;
  let raf = 0;

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const tick = () => {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    current += (target - current) * 0.08;
    pointer.cx += (pointer.x - pointer.cx) * 0.04;
    pointer.cy += (pointer.y - pointer.cy) * 0.04;

    const t = performance.now() * 0.001;
    camera.position.z = current * END_Z;
    camera.position.x = pointer.cx * 3;
    camera.position.y = 0.6 - pointer.cy * 1.4 + current * 2;
    camera.rotation.z = -pointer.cx * 0.02;

    for (const sp of sprites) {
      sp.material.rotation += sp.userData.spin;
      sp.position.x = sp.userData.baseX + Math.sin(t * 0.2 + sp.position.z) * 0.6;
    }
    renderer.render(scene, camera);
  };

  return {
    setProgress(p) { target = p; },
    setPointer(x, y) { pointer.x = x; pointer.y = y; },
    start() {
      if (running) return;
      running = true;
      tick();
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
