import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import Lenis from 'lenis';
import { initClouds } from './clouds.js';
import { mountIcons } from './icons.js';
import { frameScrub } from './frame-scrub.js';
import { spotlight, magnet, blurText, logoLoop, followImage, slidingTabs, counters } from './effects.js';

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

mountIcons();

/* ---------- Scroll fluide (Lenis) relié à GSAP ---------- */
const lenis = new Lenis({ lerp: 0.09 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
lenis.stop();
document.body.classList.add('is-loading');

/* ---------- Navigation + menu mobile ---------- */
const nav = $('.nav');
const menu = $('.menu');
const burger = $('.nav__burger');
const setMenu = (open) => {
  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', !open);
  burger.setAttribute('aria-expanded', open);
  document.body.classList.toggle('menu-open', open);
  open ? lenis.stop() : lenis.start();
};
burger.addEventListener('click', () => setMenu(true));
$('.menu__close').addEventListener('click', () => setMenu(false));

$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    e.preventDefault();
    if (menu.classList.contains('is-open')) setMenu(false);
    lenis.scrollTo(id === '#top' ? 0 : id, { duration: 1.6 });
  });
});

// Masquage au scroll via la propriété CSS `translate` (jamais `transform`, réservé à GSAP)
lenis.on('scroll', ({ scroll, direction }) => nav.classList.toggle('is-hidden', scroll > 300 && direction === 1));

/* ---------- Effets d'interface ---------- */
spotlight();
magnet();
logoLoop();
followImage();
slidingTabs();
counters(ScrollTrigger);

/* ---------- Nuages 3D (À ADAPTER : couleur du brouillard ≈ horizon de l'image de fond) ---------- */
const clouds = initClouds($('.hero__clouds'), { fog: 0xf3a758 });
clouds.start();

/* ---------- Chargement ---------- */
const critical = [$('.hero__sky').getAttribute('src'), $('.hero__subject').getAttribute('src'), '/img/logo.png'];
let loaded = 0;
const counter = { v: 0 };
const loaderBar = $('.loader__bar span');
const loaderCount = $('.loader__count');
const updateLoader = () =>
  gsap.to(counter, {
    v: (loaded / critical.length) * 100,
    duration: 0.6,
    ease: 'power2.out',
    onUpdate: () => {
      loaderCount.textContent = Math.round(counter.v);
      loaderBar.style.transform = `scaleX(${counter.v / 100})`;
    },
  });

Promise.all(
  critical.map(
    (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          updateLoader();
          resolve();
        };
        img.src = src;
      })
  )
).then(() => gsap.delayedCall(0.6, intro));

function intro() {
  gsap
    .timeline({
      onComplete: () => {
        document.body.classList.remove('is-loading');
        lenis.start();
        ScrollTrigger.refresh();
      },
    })
    .to('.loader', { yPercent: -100, duration: 1.1, ease: 'expo.inOut' })
    .set('.loader', { display: 'none' })
    .from('.hero__sky', { scale: 1.25, duration: 2.2, ease: 'expo.out' }, 0.3)
    .from('.hero__clouds', { opacity: 0, duration: 1.6 }, 0.6)
    .from('.hero__word span', { yPercent: 110, opacity: 0, duration: 1.4, stagger: 0.06, ease: 'expo.out' }, 0.7)
    .from('.hero__subject-wrap', { scale: 0.35, y: 160, opacity: 0, duration: 2, ease: 'expo.out' }, 0.9)
    .from('.hero__copy > *', { y: 40, opacity: 0, duration: 1.1, stagger: 0.08, ease: 'expo.out' }, 1.2)
    .from('.nav > *', { autoAlpha: 0, duration: 0.8, stagger: 0.08 }, 1.1)
    .from('.hero__hint', { opacity: 0, duration: 1 }, 1.8);
}

/* ---------- Sujet : flottement (sur l'enfant) + parallaxe souris ---------- */
gsap.to('.hero__subject', { y: -14, rotation: 0.8, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
const skyX = gsap.quickTo('.hero__sky', 'x', { duration: 1.2, ease: 'power3.out' });
const skyY = gsap.quickTo('.hero__sky', 'y', { duration: 1.2, ease: 'power3.out' });
window.addEventListener('pointermove', (e) => {
  const nx = e.clientX / window.innerWidth - 0.5;
  const ny = e.clientY / window.innerHeight - 0.5;
  clouds.setPointer(nx, ny);
  skyX(nx * -24);
  skyY(ny * -14);
});

gsap.set('.hero__subject-wrap', { xPercent: -50, yPercent: -50, x: 0, y: 0 });
gsap.set('.hero__word', { xPercent: -50, yPercent: -50, x: 0, y: 0 });

/* ---------- Animations au scroll : créées dans l'ordre de la page ---------- */
const seq = $('.seq');
const seqCount = +seq.dataset.count;
if (!seqCount) seq.remove();

const mm = gsap.matchMedia();
mm.add({ motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 641px)' }, (ctx) => {
  const { motion, wide } = ctx.conditions;
  if (!motion) return;

  // 1. Hero : le sujet grossit, passe devant la caméra, on traverse les nuages
  gsap
    .timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: '+=260%',
        scrub: 1,
        pin: true,
        invalidateOnRefresh: true,
        onUpdate: (self) => clouds.setProgress(self.progress),
        onToggle: (self) => (self.isActive ? clouds.start() : clouds.stop()),
      },
    })
    .to('.hero__copy', { y: -90, opacity: 0, duration: 2 }, 0)
    .to('.hero__hint', { opacity: 0, duration: 1 }, 0)
    .to('.hero__sky', { scale: 1.2, yPercent: 7, duration: 10 }, 0)
    .to('.hero__word span', { x: (i, el, all) => (i - (all.length - 1) / 2) * window.innerWidth * 0.07, opacity: 0, duration: 4, ease: 'power1.in' }, 0.4)
    .to('.hero__word', { scale: 1.25, duration: 4 }, 0.4)
    .to('.hero__subject-wrap', { scale: 1.45, y: () => -window.innerHeight * 0.06, rotation: -4, duration: 4, ease: 'power1.inOut' }, 0)
    .to('.hero__subject-wrap', { x: () => window.innerWidth * 0.62, y: () => -window.innerHeight * 0.55, scale: 3, rotation: -13, duration: 3.5, ease: 'power2.in' }, 4)
    .to('.hero__copy2', { opacity: 1, duration: 1.2 }, 5.2)
    .from('.hero__big', { scale: 0.88, duration: 2 }, 5.2)
    .to('.hero__copy2', { opacity: 0, y: -60, duration: 1 }, 8.2)
    .to('.hero__whiteout', { opacity: 1, duration: 1.8 }, 8.2);

  // 2. Titres en flou + bento
  blurText();
  gsap.from('.bento > *', { y: 60, opacity: 0, stagger: 0.08, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.bento', start: 'top 80%', once: true } });

  // 3. Séquence d'images au scroll (si présente)
  if (seqCount) {
    const pattern = seq.dataset.pattern;
    frameScrub({
      canvas: seq.querySelector('canvas'),
      trigger: seq,
      count: seqCount,
      src: (i) => pattern.replace(/%0(\d)d/, (_, n) => String(i + 1).padStart(+n, '0')),
      end: '+=300%',
    });
  }

  // 4. Cartes en défilement horizontal
  if (wide) {
    const track = $('.cards__track');
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: { trigger: '.cards', start: 'top top', end: () => `+=${dist()}`, pin: '.cards__pin', scrub: 1, invalidateOnRefresh: true },
    });
  }

  // 5. Services
  gsap.from('.svc', { y: 40, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.svc-list', start: 'top 80%', once: true } });

  // 6. Image qui s'ouvre en plein écran (fromTo avec deux clip-path de même format)
  gsap
    .timeline({ scrollTrigger: { trigger: '.reveal-media', start: 'top top', end: '+=120%', pin: '.reveal-media__pin', scrub: 1 } })
    .fromTo('.reveal-media__img', { clipPath: 'inset(18% 22% 18% 22% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'power2.inOut', duration: 1 }, 0)
    .to('.reveal-media__img img', { scale: 1, ease: 'power2.inOut', duration: 1 }, 0)
    .from('.reveal-media__title > *', { y: 80, opacity: 0, stagger: 0.1, duration: 0.5 }, 0.45);

  // 7. Apparitions douces
  ScrollTrigger.batch('.reveal', {
    start: 'top 88%',
    once: true,
    onEnter: (els) => gsap.from(els, { y: 50, opacity: 0, duration: 1.1, stagger: 0.08, ease: 'expo.out' }),
  });

  // 8. Footer : parallaxe de la photo
  gsap.fromTo('.footer__cta > img', { yPercent: -8, scale: 1.15 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.footer__cta', start: 'top bottom', end: 'bottom top', scrub: true } });
});
