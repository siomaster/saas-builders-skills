import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// « Vidéo au scroll » : une séquence d'images dessinée dans un canvas selon la progression du scroll.
// Découpe : ffmpeg -i video.mp4 -vf "fps=30,scale=1600:-1" -q:v 4 public/seq/f_%04d.jpg
//
// frameScrub({ canvas: '.seq canvas', trigger: '.seq', count: 150,
//              src: (i) => `/seq/f_${String(i + 1).padStart(4, '0')}.jpg`, end: '+=300%' })
export function frameScrub({ canvas, trigger, count, src, end = '+=300%', pin = true, onProgress }) {
  const cv = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
  const ctx = cv.getContext('2d');
  const frames = new Array(count);
  const state = { frame: 0 };
  let drawn = -1;

  // Préchargement : d'abord une image sur 8 (aperçu rapide), puis toutes les autres
  const load = (i) =>
    new Promise((res) => {
      if (frames[i]) return res();
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        frames[i] = img;
        if (i === 0 || Math.abs(i - state.frame) < 2) render(true);
        res();
      };
      img.onerror = res;
      img.src = src(i);
    });
  const order = [...Array(count).keys()].sort((a, b) => (a % 8) - (b % 8) || a - b);
  (async () => {
    for (let k = 0; k < order.length; k += 6) await Promise.all(order.slice(k, k + 6).map(load));
  })();

  const nearest = (i) => {
    for (let d = 0; d < count; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio, 2);
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
    render(true);
  };

  function render(force = false) {
    const i = Math.round(state.frame);
    if (!force && i === drawn) return;
    const img = nearest(i);
    if (!img) return;
    drawn = i;
    // Recadrage façon object-fit: cover
    const s = Math.max(cv.width / img.naturalWidth, cv.height / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  }

  window.addEventListener('resize', resize);
  resize();

  return gsap.to(state, {
    frame: count - 1,
    ease: 'none',
    onUpdate: () => render(),
    scrollTrigger: {
      trigger,
      start: 'top top',
      end,
      pin,
      scrub: 0.5,
      onUpdate: (self) => onProgress && onProgress(self.progress),
    },
  });
}

export { ScrollTrigger };
