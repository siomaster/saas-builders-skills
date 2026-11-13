import gsap from 'gsap';

// Effets d'interface portés de React Bits (SpotlightCard, Magnet, BlurText, LogoLoop)
// et de transitions.dev (onglets glissants), en JavaScript sans framework.

const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

// SpotlightCard : halo + liseré qui suivent le pointeur (le style est dans style.css → .spot)
export function spotlight(selector = '.spot') {
  $$(selector).forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--x', `${e.clientX - r.left}px`);
      card.style.setProperty('--y', `${e.clientY - r.top}px`);
    });
  });
}

// Magnet : l'élément est attiré par le curseur quand il s'en approche
export function magnet(selector = '.magnet', { padding = 60, strength = 0.28 } = {}) {
  if (!finePointer) return;
  $$(selector).forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    window.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const near = Math.abs(e.clientX - cx) < r.width / 2 + padding && Math.abs(e.clientY - cy) < r.height / 2 + padding;
      xTo(near ? (e.clientX - cx) * strength : 0);
      yTo(near ? (e.clientY - cy) * strength : 0);
    });
  });
}

// BlurText : titre découpé en mots qui apparaissent en sortant du flou (à appeler dans un matchMedia)
export function blurText(selector = '.blur-text') {
  $$(selector).forEach((el) => {
    el.innerHTML = el.textContent
      .trim()
      .split(/\s+/)
      .map((w) => `<span class="bw" style="display:inline-block">${w}</span>`)
      .join(' ');
    gsap.from($$('.bw', el), {
      opacity: 0,
      filter: 'blur(10px)',
      y: -24,
      stagger: 0.06,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });
}

// LogoLoop : bande infinie qui ralentit au survol
export function logoLoop(selector = '.logo-loop__track', { duration = 40 } = {}) {
  const track = document.querySelector(selector);
  if (!track) return;
  track.innerHTML += track.innerHTML;
  const loop = gsap.to(track, { xPercent: -50, duration, ease: 'none', repeat: -1 });
  track.addEventListener('pointerenter', () => gsap.to(loop, { timeScale: 0.2, duration: 0.6 }));
  track.addEventListener('pointerleave', () => gsap.to(loop, { timeScale: 1, duration: 0.6 }));
}

// Image qui suit le curseur au survol d'une ligne (attribut data-img sur chaque ligne)
export function followImage(rows = '.svc', follower = '.svc-follow') {
  const box = document.querySelector(follower);
  if (!finePointer || !box) return;
  const img = box.querySelector('img');
  const fx = gsap.quickTo(box, 'x', { duration: 0.5, ease: 'power3.out' });
  const fy = gsap.quickTo(box, 'y', { duration: 0.5, ease: 'power3.out' });
  $$(rows).forEach((row) => {
    row.addEventListener('pointerenter', () => {
      img.src = row.dataset.img;
      box.classList.add('is-visible');
    });
    row.addEventListener('pointerleave', () => box.classList.remove('is-visible'));
  });
  window.addEventListener('pointermove', (e) => {
    fx(e.clientX + 24);
    fy(e.clientY - box.offsetHeight / 2);
  });
}

// Onglets avec pastille glissante
export function slidingTabs(selector = '.tabs') {
  $$(selector).forEach((tabs) => {
    const pill = tabs.querySelector('.tabs__pill');
    const buttons = $$('button', tabs);
    const move = (b) => {
      pill.style.width = `${b.offsetWidth}px`;
      pill.style.transform = `translateX(${b.offsetLeft - 4}px)`;
    };
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        buttons.forEach((t) => {
          t.classList.toggle('is-active', t === b);
          t.setAttribute('aria-selected', t === b);
        });
        move(b);
      })
    );
    const sync = () => move(tabs.querySelector('.is-active') || buttons[0]);
    document.fonts.ready.then(sync);
    window.addEventListener('resize', sync);
  });
}

// Compteurs : <span data-count="60000" data-format="fr">0</span>
export function counters(ScrollTrigger, selector = '[data-count]') {
  $$(selector).forEach((el) => {
    const end = +el.dataset.count;
    const pad = +el.dataset.pad || 0;
    const fmt = (v) => {
      const n = Math.round(v);
      if (el.dataset.format === 'fr') return n.toLocaleString('fr-FR');
      return pad ? String(n).padStart(pad, '0') : n;
    };
    const obj = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () => gsap.to(obj, { v: end, duration: 2, ease: 'expo.out', onUpdate: () => (el.textContent = fmt(obj.v)) }),
    });
  });
}
