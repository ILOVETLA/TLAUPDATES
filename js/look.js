// Theme colours, page background and background music.
import { h, safeUrl, youtubeId, mediaKind } from './dom.js';

export function applyTheme(t) {
  const s = document.documentElement.style;
  s.setProperty('--bg', t.bg);
  s.setProperty('--pri', t.primary);
  s.setProperty('--acc', t.accent);
  s.setProperty('--txt', t.text);
}

// ---------- background ----------
let bgSig = '';
export function applyBackground(look) {
  let host = document.getElementById('bg');
  if (!host) { host = h('div', { id: 'bg', 'aria-hidden': 'true' }); document.body.prepend(host); }
  const b = look.bg;
  const sig = [b.type, b.url, b.color, b.dim, b.halftone].join('|');
  if (sig === bgSig) return;
  bgSig = sig;
  host.replaceChildren();
  host.dataset.type = b.type;
  const u = safeUrl(b.url);
  if (b.type === 'color') host.style.background = b.color; else host.style.background = '';
  if (b.type === 'image' && u) {
    const layer = h('div', { class: 'bg-media' });
    layer.style.backgroundImage = `url("${u.replace(/"/g, '%22')}")`;
    host.append(layer);
  } else if (b.type === 'video' && u) {
    const id = youtubeId(u);
    if (id) {
      host.append(h('div', { class: 'bg-media ytwrap' }, h('iframe', {
        class: 'media yt', title: 'Background video', tabindex: '-1',
        src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&modestbranding=1&rel=0&disablekb=1`,
        allow: 'autoplay; encrypted-media', referrerpolicy: 'strict-origin-when-cross-origin', sandbox: 'allow-scripts allow-same-origin',
      })));
    } else if (mediaKind(u) !== 'image') {
      const v = h('video', { class: 'bg-media', src: u, autoplay: true, muted: true, loop: true, playsinline: true, preload: 'auto' });
      v.muted = true; v.defaultMuted = true;
      v.addEventListener('loadeddata', () => v.play().catch(() => {}));
      host.append(v);
    }
  }
  const dim = h('div', { class: 'bg-dim' });
  dim.style.opacity = b.type === 'none' || b.type === 'color' ? 0 : b.dim / 100;
  host.append(dim);
  if (b.halftone) host.append(h('div', { class: 'bg-fx' }));
}

// ---------- music ----------
// Browsers never allow sound before the visitor interacts with the page, so music
// starts on the first click / key press / tap, and a speaker button lets them mute it.
const audio = new Audio();
audio.loop = true;
audio.preload = 'auto';
let userMuted = false;
try { userMuted = localStorage.getItem('jjb.mute') === '1'; } catch {}
let wanted = false, armed = false, autostart = true, button = null;

function icon() { if (button) { button.textContent = userMuted || audio.paused ? '🔇' : '🔊'; button.title = userMuted ? 'Turn music on' : 'Turn music off'; } }

function arm() {
  if (armed) return;
  armed = true;
  const evs = ['pointerdown', 'keydown', 'touchstart'];
  const go = () => { armed = false; evs.forEach(e => removeEventListener(e, go, true)); tryPlay(); };
  evs.forEach(e => addEventListener(e, go, true));
}

function tryPlay() {
  if (!wanted || userMuted) return icon();
  audio.play().then(icon, () => { icon(); arm(); });
}

export function initMusic(opts = {}) {
  autostart = opts.autostart !== false;
  if (opts.autostart === false) userMuted = true;
  button = h('button', { id: 'musicBtn', type: 'button', hidden: true, 'aria-label': 'Toggle background music' });
  button.addEventListener('click', () => {
    userMuted = !userMuted;
    if (opts.autostart !== false) { try { localStorage.setItem('jjb.mute', userMuted ? '1' : '0'); } catch {} }
    if (userMuted) audio.pause(); else tryPlay();
    icon();
  });
  document.body.append(button);
}

export function setMusic(m) {
  const u = safeUrl(m.url);
  wanted = !!(m.on && u);
  if (!wanted) { audio.pause(); audio.removeAttribute('src'); if (button) button.hidden = true; return; }
  if (audio.getAttribute('src') !== u) { audio.src = u; }
  audio.volume = Math.max(0, Math.min(1, m.volume / 100));
  if (button) button.hidden = false;
  tryPlay();
}
