// Turns site data into DOM. Used by both the public site and the admin editor,
// so what you see while editing is exactly what visitors get.
import { h, safeUrl, youtubeId, mediaKind, md, highlight } from './dom.js';
import { rank } from './layout.js';

export function setPos(el, b) {
  el.style.setProperty('--x', b.x);
  el.style.setProperty('--y', b.y);
  el.style.setProperty('--w', b.w);
  el.style.setProperty('--h', b.h);
}

// ---------- media ----------
function ytFrame(id, fit) {
  return h('div', { class: 'ytwrap' + (fit === 'contain' ? ' contain' : '') }, h('iframe', {
    class: 'media yt', title: 'Video', tabindex: '-1',
    src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&modestbranding=1&rel=0&disablekb=1&iv_load_policy=3`,
    allow: 'autoplay; encrypted-media; picture-in-picture', referrerpolicy: 'strict-origin-when-cross-origin',
    sandbox: 'allow-scripts allow-same-origin',
  }));
}

function videoEl(u, fit) {
  const v = h('video', { class: 'media vid', src: u, autoplay: true, muted: true, loop: true, playsinline: true, preload: 'auto', tabindex: '-1', 'aria-hidden': 'true' });
  v.muted = true; v.defaultMuted = true; v.disablePictureInPicture = true; v.style.objectFit = fit || 'cover';
  v.addEventListener('loadeddata', () => v.play().catch(() => {}));
  return v;
}

const ph = (t = 'Add a URL or upload a file →') => h('div', { class: 'ph', text: t });

/** Auto-playing, always-muted media: YouTube link, mp4/webm, or a plain image. */
export function mediaEl(url, { fit = 'cover', alt = '' } = {}) {
  const u = safeUrl(url);
  if (!u) return ph();
  const id = youtubeId(u);
  if (id) return ytFrame(id, fit);
  const kind = mediaKind(u);
  if (kind === 'image') return h('img', { class: 'media', src: u, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', style: { objectFit: fit } });
  return videoEl(u, fit);
}

// ---------- 3D tilt: images turn to face the cursor ----------
const tilts = new Set();
let tiltReady = false;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function tiltFrame(ev) {
  const vw = innerWidth, vh = innerHeight;
  for (const t of [...tilts]) {
    if (!t.card.isConnected) { tilts.delete(t); continue; }
    const r = t.card.getBoundingClientRect();
    if (r.bottom < -300 || r.top > vh + 300) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = Math.max(-1, Math.min(1, (ev.clientX - cx) / (vw * 0.4)));
    const dy = Math.max(-1, Math.min(1, (ev.clientY - cy) / (vh * 0.4)));
    t.card.style.transform = `rotateX(${(-dy * t.max).toFixed(2)}deg) rotateY(${(dx * t.max).toFixed(2)}deg)`;
    const gx = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
    const gy = Math.max(0, Math.min(100, ((ev.clientY - r.top) / r.height) * 100));
    t.card.style.setProperty('--gx', gx + '%');
    t.card.style.setProperty('--gy', gy + '%');
  }
}
function tiltReset() { for (const t of tilts) t.card.style.transform = ''; }

function registerTilt(card, max) {
  if (!max || reduceMotion()) return;
  tilts.add({ card, max });
  if (tiltReady) return;
  tiltReady = true;
  let raf = 0, last = null;
  addEventListener('pointermove', (e) => {
    last = e;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; tiltFrame(last); });
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', tiltReset);
}

// ---------- small pieces ----------
function btn(text, url, cls = '') {
  if (!text) return null;
  const u = safeUrl(url);
  if (!u) return h('span', { class: 'btn ' + cls, text });
  const ext = !u.startsWith('#');
  return h('a', { class: 'btn ' + cls, href: u, target: ext ? '_blank' : null, rel: ext ? 'noopener noreferrer' : null, text });
}
const chip = (t, cls = '') => (t ? h('span', { class: 'chip ' + cls, text: t }) : null);
const ul = (items, cls = '') => (items && items.length ? h('ul', { class: 'bul ' + cls }, items.map(i => h('li', { text: i }))) : null);
const head = (t) => (t ? h('h3', { class: 'ph3', text: t }) : null);

// ---------- block renderers: (panel, data, ctx) ----------
const R = {
  hero(p, d) {
    p.append(h('div', { class: 'hero-rays' }));
    const art = safeUrl(d.image);
    if (art) p.append(h('div', { class: 'hero-art' + (d.duo ? ' duo' : '') }, h('img', { src: art, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })));
    p.append(
      h('div', { class: 'hero-body' },
        chip(d.tag, 'tag'),
        h('h1', { class: 'hero-title' }, h('span', { text: d.title }), h('em', { text: d.accent })),
        d.sub && h('p', { class: 'hero-sub', text: d.sub }),
        btn(d.btnText, d.btnUrl, 'gold'),
        d.note && h('small', { class: 'hero-note', text: d.note })),
      d.sfx && h('div', { class: 'hero-sfx', text: d.sfx }));
  },

  title(p, d) {
    p.append(h('div', { class: `t-wrap al-${d.align}` }, chip(d.tag, 'tag'), h('h2', { class: 't-title sz-' + d.size, text: d.text })));
  },
  description(p, d) { p.append(h('p', { class: 'lead', text: d.text })); },
  text(p, d) { p.append(head(d.heading), md(d.body)); },

  code(p, d) {
    const code = h('code', null, highlight(d.code));
    const copy = h('button', { class: 'copy', type: 'button', text: 'COPY' });
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(d.code); copy.textContent = 'COPIED!'; } catch { copy.textContent = 'PRESS CTRL+C'; }
      setTimeout(() => (copy.textContent = 'COPY'), 1400);
    });
    p.append(h('div', { class: 'code-head' }, h('b', { text: d.title }), chip(d.lang), copy), h('pre', { tabindex: '0' }, code));
  },

  patch(p, d) {
    p.append(
      chip(d.badge, 'badge'),
      h('div', { class: 'patch' },
        h('div', { class: 'patch-main' },
          h('h2', { class: 'patch-title', text: d.title }),
          d.sfx && h('div', { class: 'patch-sfx', text: d.sfx }),
          d.tagline && h('p', { class: 'patch-tag', text: d.tagline }),
          btn(d.btnText, d.btnUrl, 'gold sm'),
          d.released && h('span', { class: 'stamp', text: 'RELEASED' })),
        h('div', { class: 'patch-side' },
          d.version && h('div', { class: 'ver', text: d.version }),
          d.sections.map(s => h('section', { class: 'sec' }, h('h4', { class: 'sec-label', text: s.label }), ul(s.items))))));
  },

  ability(p, d) {
    p.append(
      h('div', { class: 'row-head' }, d.key && h('span', { class: 'key', text: d.key }), h('h3', { class: 'nm', text: d.name })),
      d.owner && h('div', { class: 'sub', text: d.owner }),
      h('div', { class: 'stats' },
        d.cooldown && h('span', null, h('small', { text: 'COOLDOWN' }), d.cooldown),
        d.damage && h('span', null, h('small', { text: 'DAMAGE' }), d.damage)),
      d.tags.length && h('div', { class: 'chips' }, d.tags.map(t => chip(t))),
      d.desc && h('p', { class: 'body', text: d.desc }));
  },

  quest(p, d) {
    p.append(
      h('div', { class: 'row-head' }, h('span', { class: 'key', text: '!' }), h('h3', { class: 'nm', text: d.name })),
      h('div', { class: 'sub' }, [d.npc && `Given by ${d.npc}`, d.level].filter(Boolean).join('  •  ')),
      d.desc && h('p', { class: 'body', text: d.desc }),
      d.objectives.length ? h('h4', { class: 'sec-label', text: 'OBJECTIVES' }) : null, ul(d.objectives),
      d.rewards.length ? h('h4', { class: 'sec-label', text: 'REWARDS' }) : null, ul(d.rewards, 'gold'));
  },

  skin(p, d) {
    const u = safeUrl(d.image);
    p.append(
      u && h('div', { class: 'thumb' }, h('img', { src: u, alt: d.name, loading: 'lazy', referrerpolicy: 'no-referrer' })),
      h('div', { class: 'row-head' }, h('h3', { class: 'nm', text: d.name }), chip(d.rarity, 'rar rar-' + d.rarity.toLowerCase())),
      d.forWho && h('div', { class: 'sub', text: 'For: ' + d.forWho }),
      d.obtain && h('div', { class: 'sub', text: 'Obtain: ' + d.obtain }),
      d.desc && h('p', { class: 'body', text: d.desc }));
  },

  balance(p, d) {
    const sym = { buff: '▲', nerf: '▼', rework: '⟳', fix: '✔' };
    p.append(head(d.title), h('div', { class: 'bal' }, d.rows.map(r => h('div', { class: 'bal-row k-' + r.kind },
      h('span', { class: 'bal-ic', text: sym[r.kind] }),
      h('span', { class: 'bal-t' }, h('b', { text: r.target }), ' ', r.stat),
      h('span', { class: 'bal-v' }, r.from && h('s', { text: r.from }), r.from && r.to ? ' → ' : '', r.to)))),
    d.note && h('p', { class: 'body', text: d.note }));
  },

  zone(p, d) {
    const u = safeUrl(d.image);
    p.append(
      u && h('div', { class: 'thumb wide' }, h('img', { src: u, alt: d.name, loading: 'lazy', referrerpolicy: 'no-referrer' })),
      h('div', { class: 'row-head' }, h('span', { class: 'key', text: '⌖' }), h('h3', { class: 'nm', text: d.name })),
      d.levels && h('div', { class: 'sub', text: d.levels }),
      d.desc && h('p', { class: 'body', text: d.desc }),
      d.threats.length ? h('h4', { class: 'sec-label', text: 'THREATS' }) : null, ul(d.threats));
  },

  mechanic(p, d) {
    p.append(
      h('div', { class: 'row-head' }, h('span', { class: 'key', text: '⚙' }), h('h3', { class: 'nm', text: d.name })),
      d.summary && h('div', { class: 'sub', text: d.summary }),
      d.desc && h('p', { class: 'body', text: d.desc }),
      d.tips.length ? h('h4', { class: 'sec-label', text: 'TIPS' }) : null, ul(d.tips));
  },

  stand(p, d) {
    const u = safeUrl(d.image);
    p.append(h('div', { class: 'stand' },
      u && h('div', { class: 'stand-art' }, h('img', { src: u, alt: d.name, loading: 'lazy', referrerpolicy: 'no-referrer' })),
      h('div', { class: 'stand-info' },
        h('h3', { class: 'stand-name', text: d.name }), chip(d.rarity, 'rar rar-' + d.rarity.toLowerCase()),
        h('div', { class: 'bars' }, d.stats.map(s => {
          const fill = h('i'); fill.style.width = s.value + '%';
          return h('div', { class: 'bar' }, h('span', { text: s.label }), h('div', { class: 'bar-track' }, fill));
        })),
        d.desc && h('p', { class: 'body', text: d.desc }))));
  },

  image(p, d, ctx) {
    const u = safeUrl(d.url);
    const card = h('div', { class: 'tilt-card' });
    if (u) {
      const m = mediaEl(d.url, { fit: d.fit, alt: d.alt });
      card.append(m);
    } else card.append(ph());
    card.append(h('div', { class: 'glare' }));
    if (d.caption) card.append(h('div', { class: 'cap', text: d.caption }));
    p.append(h('div', { class: 'tilt' }, card));
    registerTilt(card, d.tilt);
  },

  video(p, d) {
    p.append(mediaEl(d.url, { fit: d.fit }), d.caption && h('div', { class: 'cap', text: d.caption }));
  },

  history(p, d) {
    p.append(head(d.title), h('ol', { class: 'hist' }, d.rows.map(r => h('li', null,
      h('b', { text: r.version }), ' – ', h('span', { text: r.name }), r.latest && chip('LATEST', 'latest')))));
  },

  sfx(p, d) {
    const t = h('div', { class: 'sfx sz-' + d.size, text: d.text });
    t.style.transform = `rotate(${d.rotate}deg)`;
    p.append(t);
  },

  buttons(p, d) { p.append(h('div', { class: 'btns' }, d.rows.map(r => btn(r.label, r.url, 'gold')))); },

  countdown(p, d) {
    const out = h('div', { class: 'cd' });
    const target = Date.parse(d.target);
    const tick = () => {
      if (!out.isConnected && out.dataset.ready) { clearInterval(timer); return; }
      out.dataset.ready = '1';
      if (!Number.isFinite(target)) { out.textContent = 'Set a date'; return; }
      let ms = target - Date.now();
      if (ms <= 0) { out.textContent = d.done; clearInterval(timer); return; }
      const s = Math.floor(ms / 1000), D = Math.floor(s / 86400), H = Math.floor(s / 3600) % 24, M = Math.floor(s / 60) % 60, S = s % 60;
      out.replaceChildren(...[[D, 'DAYS'], [H, 'HRS'], [M, 'MIN'], [S, 'SEC']].map(([n, l]) =>
        h('span', null, h('b', { text: String(n).padStart(2, '0') }), h('small', { text: l }))));
    };
    const timer = setInterval(tick, 1000);
    tick();
    p.append(head(d.title), out);
  },

  divider(p, d) {
    p.append(h('div', { class: 'tbc' }, h('span', { class: 'jp', text: d.jp }), h('span', { class: 'en', text: d.text })));
  },
};

const BARE = new Set(['title', 'sfx', 'buttons']);

export function renderBlock(b, ctx = {}) {
  const panel = h('div', { class: `panel p-${b.type} tone-${b.data.tone || 'ink'}` + (BARE.has(b.type) ? ' bare' : '') });
  try { R[b.type](panel, b.data, ctx); } catch (e) { panel.textContent = 'Could not render this block.'; console.error(e); }
  const el = h('div', { class: 'blk t-' + b.type, dataset: { id: b.id } }, panel);
  setPos(el, b);
  return el;
}

export function renderGrid(page, { edit = false, decorate } = {}) {
  const grid = h('div', { class: 'grid' });
  const order = rank(page.blocks);
  for (const b of page.blocks) {
    const el = renderBlock(b, { edit });
    el.style.setProperty('--o', order.get(b.id));
    if (decorate) decorate(el, b);
    grid.append(el);
  }
  if (edit) {
    // extra empty rows at the bottom so blocks can be dragged lower
    const end = page.blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0);
    const pad = h('div', { class: 'pad' });
    pad.style.gridColumn = '1 / -1';
    pad.style.gridRow = `${end + 1} / span 4`;
    grid.append(pad);
  }
  return grid;
}

export function renderHeader(data, pageId, { onNav } = {}) {
  const s = data.site;
  const discord = safeUrl(s.discord), play = safeUrl(s.play);
  const link = (u, text, cls) => h('a', { class: 'pill ' + cls, href: u, target: '_blank', rel: 'noopener noreferrer' }, h('span', { text }));
  return h('header', { class: 'hdr' },
    h('a', { class: 'logo', href: '#' + data.pages[0].id, onclick: onNav ? (e) => { e.preventDefault(); onNav(data.pages[0].id); } : null },
      h('span', { class: 'logo-t' }, h('b', { text: '★ ' + s.title + ' ★' }), h('i', { text: s.sub }))),
    h('nav', { class: 'nav', 'aria-label': 'Pages' }, data.pages.map(p =>
      h('a', {
        href: '#' + p.id, class: p.id === pageId ? 'on' : '',
        onclick: onNav ? (e) => { e.preventDefault(); onNav(p.id); } : null,
      }, h('span', { text: p.title })))),
    h('div', { class: 'ext' }, discord && link(discord, 'DISCORD', 'discord'), play && link(play, 'PLAY NOW', 'play')));
}

export function renderFooter(data) {
  return h('footer', { class: 'ftr' }, data.site.footer && h('p', { text: data.site.footer }));
}
