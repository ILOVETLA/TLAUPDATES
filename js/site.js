// Public site. Pulls the latest data straight from your GitHub repo (the `site-data`
// branch), so edits made in the admin show up without waiting for a Pages rebuild.
import { h } from './dom.js';
import { normalizeSite, defaultSite } from './schema.js';
import { renderHeader, renderGrid, renderFooter } from './render.js';
import { applyTheme, applyBackground, setMusic, initMusic } from './look.js';
import { DATA_BRANCH, DATA_PATH, detectRepo, validRepo } from './config.js';

const root = document.getElementById('root');
let data = null;
let lastText = '';
let lastPage = null;
let repo = '';

async function getRepo() {
  try {
    const r = await fetch('config.json', { cache: 'no-cache' });
    if (r.ok) { const c = await r.json(); if (c && validRepo(String(c.repo || ''))) return c.repo; }
  } catch {}
  return detectRepo();
}

async function fetchText() {
  const tries = [];
  if (repo) {
    tries.push(() => fetch(`https://api.github.com/repos/${repo}/contents/${DATA_PATH}?ref=${DATA_BRANCH}`,
      { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-cache' }));
    tries.push(() => fetch(`https://raw.githubusercontent.com/${repo}/${DATA_BRANCH}/${DATA_PATH}?t=${Date.now()}`, { cache: 'no-store' }));
  }
  tries.push(() => fetch(`${DATA_PATH}?t=${Date.now()}`, { cache: 'no-store' }));
  for (const t of tries) {
    try { const r = await t(); if (r.ok) return await r.text(); } catch {}
  }
  return null;
}

function currentPageId() {
  const id = decodeURIComponent(location.hash.slice(1));
  return data.pages.find(p => p.id === id)?.id || data.pages[0].id;
}

function draw() {
  const pid = currentPageId();
  const page = data.pages.find(p => p.id === pid);
  applyTheme(data.theme);
  applyBackground(data.look);
  setMusic(data.look.music);
  document.title = `${data.site.title} — ${page.title}`;
  const frag = [renderHeader(data, pid), h('main', { class: 'page' }, renderGrid(page)), renderFooter(data)];
  root.replaceChildren(...frag);
  if (lastPage !== null && lastPage !== pid) scrollTo(0, 0);
  lastPage = pid;
}

async function load(first) {
  const text = await fetchText();
  if (text === null) { if (first) { data = defaultSite(); draw(); } return; }
  if (text === lastText) return;
  lastText = text;
  let parsed;
  try { parsed = JSON.parse(text); } catch { if (first) { data = defaultSite(); draw(); } return; }
  data = normalizeSite(parsed);
  const y = scrollY;
  draw();
  if (!first) scrollTo(0, y);
}

(async function main() {
  initMusic({ autostart: true });
  repo = await getRepo();
  await load(true);
  addEventListener('hashchange', () => data && draw());
  setInterval(() => { if (!document.hidden) load(false); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
})();
