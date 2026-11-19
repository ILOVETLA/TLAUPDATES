// Single source of truth for every block type: its fields, defaults and validation.
// normalizeSite() runs on everything loaded from GitHub, so a broken or hand-edited
// data file can never crash the page or smuggle in unexpected values.
import { uid } from './dom.js';
import { COLS, MAX_ROWS, resolve } from './layout.js';

const T = (k, label, def = '', x = {}) => ({ k, label, t: 'text', def, ...x });
const A = (k, label, def = '', x = {}) => ({ k, label, t: 'area', def, ...x });
const S = (k, label, opts, def) => ({ k, label, t: 'select', opts, def: def ?? opts[0] });
const N = (k, label, def, min, max, x = {}) => ({ k, label, t: 'num', def, min, max, ...x });
const L = (k, label, def = [], x = {}) => ({ k, label, t: 'list', def, ...x });
const M = (k, label, def = '', x = {}) => ({ k, label, t: 'media', def, ...x });
const B = (k, label, def = false) => ({ k, label, t: 'bool', def });
const R = (k, label, sub, def = []) => ({ k, label, t: 'rows', sub, def });
const D = (k, label, def = '') => ({ k, label, t: 'date', def });

export const TONES = ['ink', 'violet', 'gold', 'paper'];
export const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export const GROUPS = ['Write', 'Game', 'Media', 'Extras'];

export const TYPES = {
  title: { label: 'Title', icon: 'T', group: 'Write', w: 12, h: 1, fields: [
    T('text', 'Title', 'New Title'), T('tag', 'Small tag (optional)'),
    S('size', 'Size', ['small', 'medium', 'large'], 'medium'), S('align', 'Align', ['left', 'center', 'right'], 'left')] },
  description: { label: 'Description', icon: '¶', group: 'Write', w: 8, h: 1, fields: [
    A('text', 'Text', 'Write a description here.')] },
  text: { label: 'Text Box', icon: '▤', group: 'Write', w: 6, h: 3, fields: [
    T('heading', 'Heading', 'Heading'), A('body', 'Body (supports **bold**, *italic*, - lists, [link](https://...))', 'Write something here.\n\n- Point one\n- Point two')] },
  code: { label: 'Code', icon: '</>', group: 'Write', w: 6, h: 4, fields: [
    T('title', 'File / title', 'Script.lua'), T('lang', 'Language label', 'lua'),
    A('code', 'Code', 'local function hello()\n\tprint("ORA ORA ORA!")\nend\n\nhello()', { mono: true })] },

  patch: { label: 'Update Panel', icon: '★', group: 'Game', w: 7, h: 5, fields: [
    T('badge', 'Badge', 'MAJOR UPDATE'), T('version', 'Version', 'VERSION 1.0.0'), T('title', 'Title', 'UPDATE NAME'),
    T('sfx', 'Sound effect text', 'ゴゴゴゴ'), T('tagline', 'Tagline', 'A NEW POWER EMERGES...'),
    R('sections', 'Sections', [T('label', 'Label', 'NEW CONTENT'), L('items', 'Items (one per line)')],
      [{ label: 'NEW CONTENT', items: ['Added something new'] }]),
    T('btnText', 'Button text', 'READ FULL PATCH NOTES →'), T('btnUrl', 'Button link'), B('released', 'Show RELEASED stamp', true)] },
  ability: { label: 'New Ability', icon: '⚡', group: 'Game', w: 4, h: 3, fields: [
    T('name', 'Ability name', 'New Ability'), T('key', 'Key', 'Q', { max: 6 }), T('owner', 'Stand / character'),
    T('cooldown', 'Cooldown', '10s'), T('damage', 'Damage', '25'), L('tags', 'Tags (one per line)'),
    A('desc', 'Description', 'What does it do?')] },
  quest: { label: 'New Quest', icon: '!', group: 'Game', w: 4, h: 3, fields: [
    T('name', 'Quest name', 'New Quest'), T('npc', 'Quest giver'), T('level', 'Level requirement', 'Lv. 1'),
    A('desc', 'Story / description', ''), L('objectives', 'Objectives (one per line)', ['Do the thing']), L('rewards', 'Rewards (one per line)', ['500 Gold'])] },
  skin: { label: 'New Skin', icon: '✦', group: 'Game', w: 4, h: 4, fields: [
    T('name', 'Skin name', 'New Skin'), S('rarity', 'Rarity', RARITIES, 'Epic'), T('forWho', 'For (stand / character)'),
    T('obtain', 'How to get it', 'Shop'), A('desc', 'Description', ''), M('image', 'Image')] },
  balance: { label: 'Balance Changes', icon: '⚖', group: 'Game', w: 6, h: 3, fields: [
    T('title', 'Title', 'Balance Changes'),
    R('rows', 'Changes', [T('target', 'Stand / ability', 'Stand'), T('stat', 'Stat', 'Damage'), T('from', 'From', '10'), T('to', 'To', '12'),
      S('kind', 'Kind', ['buff', 'nerf', 'rework', 'fix'], 'buff')], [{ target: 'Stand', stat: 'Damage', from: '10', to: '12', kind: 'buff' }]),
    A('note', 'Note (optional)')] },
  zone: { label: 'New Map Zone', icon: '⌖', group: 'Game', w: 4, h: 3, fields: [
    T('name', 'Zone name', 'New Zone'), T('levels', 'Level range', 'Lv. 1 - 10'), A('desc', 'Description', ''),
    L('threats', 'Enemies / bosses (one per line)'), M('image', 'Image')] },
  mechanic: { label: 'New Mechanic', icon: '⚙', group: 'Game', w: 4, h: 3, fields: [
    T('name', 'Mechanic name', 'New Mechanic'), T('summary', 'One-line summary'), A('desc', 'Description', ''), L('tips', 'Tips (one per line)')] },
  stand: { label: 'Stand Showcase', icon: '☗', group: 'Game', w: 5, h: 3, fields: [
    T('name', 'Name', 'STAND NAME'), S('rarity', 'Rarity', RARITIES, 'Legendary'), M('image', 'Image'),
    R('stats', 'Stats (0-100)', [T('label', 'Label', 'Power'), N('value', 'Value', 50, 0, 100, { range: true })],
      [{ label: 'Power', value: 80 }, { label: 'Speed', value: 70 }, { label: 'Range', value: 50 }, { label: 'Durability', value: 65 }]),
    A('desc', 'Description')] },

  image: { label: 'Image Box', icon: '▣', group: 'Media', w: 4, h: 4, fields: [
    M('url', 'Image', '', { accept: 'image/*' }), T('alt', 'Alt text'), T('caption', 'Caption'),
    N('tilt', '3D tilt strength (0 = off)', 14, 0, 35, { range: true }), S('fit', 'Fit', ['cover', 'contain'], 'cover')] },
  video: { label: 'Video Box', icon: '▶', group: 'Media', w: 6, h: 4, fields: [
    M('url', 'YouTube link or .mp4 / .webm', '', { accept: 'video/mp4,video/webm' }), T('caption', 'Caption'),
    S('fit', 'Fit (cover = fill & crop, contain = show whole video)', ['cover', 'contain'], 'cover')] },

  hero: { label: 'Hero Banner', icon: '◆', group: 'Extras', w: 12, h: 5, fields: [
    T('tag', 'Chapter tag', 'CHAPTER 001 — NEW BEGINNINGS'), T('title', 'Title (white)', 'THE NEXT CHAPTER'), T('accent', 'Title (accent colour)', 'BEGINS...'),
    T('sub', 'Subtitle', 'New Stands. New Abilities. A new era.'), T('btnText', 'Button text', 'VIEW LATEST UPDATE →'), T('btnUrl', 'Button link', '#updates'),
    T('note', 'Small note', 'Released: today'), T('sfx', 'Big sound effect', 'ドン!!'),
    M('image', 'Art (right side)', '', { accept: 'image/*' }), B('duo', 'Ink + theme-colour duotone on art', true)] },
  history: { label: 'Version History', icon: '☰', group: 'Extras', w: 5, h: 2, fields: [
    T('title', 'Title', 'VERSION HISTORY'),
    R('rows', 'Versions', [T('version', 'Version', 'v1.0.0'), T('name', 'Name', 'Name'), B('latest', 'Latest')], [{ version: 'v1.0.0', name: 'Launch', latest: true }])] },
  sfx: { label: 'Sound Effect', icon: 'ゴ', group: 'Extras', w: 3, h: 2, fields: [
    T('text', 'Text', 'ゴゴゴ'), S('size', 'Size', ['medium', 'large', 'huge'], 'large'), N('rotate', 'Rotation (deg)', -6, -45, 45)] },
  buttons: { label: 'Link Buttons', icon: '⇗', group: 'Extras', w: 4, h: 1, fields: [
    R('rows', 'Buttons', [T('label', 'Label', 'PLAY NOW'), T('url', 'Link')], [{ label: 'PLAY NOW', url: '' }])] },
  countdown: { label: 'Countdown', icon: '⏱', group: 'Extras', w: 4, h: 2, fields: [
    T('title', 'Title', 'NEXT UPDATE IN'), D('target', 'Date & time'), T('done', 'Text when finished', 'OUT NOW!')] },
  divider: { label: 'To Be Continued', icon: '—', group: 'Extras', w: 12, h: 1, fields: [
    T('text', 'Text', 'TO BE CONTINUED...'), T('jp', 'Japanese text', 'まだ終わりではない…')] },
};

for (const t of Object.values(TYPES)) t.fields.push(S('tone', 'Panel colour', TONES, 'ink'));

export const fieldsOf = (type) => TYPES[type].fields;
export const defaultsOf = (fields) => Object.fromEntries(fields.map(f => [f.k, structuredClone(f.def)]));

export const PRESETS = {
  'Star Platinum': { bg: '#0d0716', primary: '#7b3fe4', accent: '#f2b84b', text: '#f4eefb' },
  'Crimson Blood': { bg: '#12060a', primary: '#d02a3a', accent: '#ffd166', text: '#fbeff0' },
  'Emerald Sea': { bg: '#04130f', primary: '#10a37f', accent: '#f5e663', text: '#eafaf4' },
  'Deep Ocean': { bg: '#050b18', primary: '#2f7bff', accent: '#5ef2d6', text: '#eaf2ff' },
  'Hot Sunset': { bg: '#160a0a', primary: '#ff6b3d', accent: '#ffd23f', text: '#fff3ea' },
  'Pink Dream': { bg: '#140612', primary: '#e640a8', accent: '#7df9ff', text: '#fff0fa' },
  'Ink & Paper': { bg: '#0c0c0c', primary: '#8a8a8a', accent: '#ffffff', text: '#f2f2f2' },
};

// ---------- validation ----------
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);

function nField(f, v) {
  switch (f.t) {
    case 'text': case 'date': return typeof v === 'string' ? v.slice(0, 500) : f.def;
    case 'media': return typeof v === 'string' ? v.slice(0, 2000) : f.def;
    case 'area': return typeof v === 'string' ? v.slice(0, 20000) : f.def;
    case 'select': return f.opts.includes(v) ? v : f.def;
    case 'num': { const n = Number(v); return Number.isFinite(n) ? clamp(n, f.min ?? -1e9, f.max ?? 1e9) : f.def; }
    case 'bool': return typeof v === 'boolean' ? v : f.def;
    case 'list': return Array.isArray(v) ? v.slice(0, 100).map(s => String(s).slice(0, 500).trim()).filter(Boolean) : [...f.def];
    case 'rows': return Array.isArray(v)
      ? v.slice(0, 100).filter(o => o && typeof o === 'object').map(o => nObj(f.sub, o)) : structuredClone(f.def);
    default: return f.def;
  }
}
const nObj = (fields, o) => Object.fromEntries(fields.map(f => [f.k, nField(f, o?.[f.k])]));

const int = (v, d, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };

export function newBlock(type, x = 0, y = 0) {
  const t = TYPES[type];
  return { id: uid(), type, x, y, w: t.w, h: t.h, data: defaultsOf(t.fields) };
}

export function normalizeSite(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const base = defaultSite();
  const th = r.theme || {}, lk = r.look || {}, bg = lk.bg || {}, mu = lk.music || {}, st = r.site || {};
  const out = {
    v: 1,
    site: {
      title: String(st.title ?? base.site.title).slice(0, 80),
      sub: String(st.sub ?? base.site.sub).slice(0, 80),
      discord: String(st.discord ?? '').slice(0, 500),
      play: String(st.play ?? '').slice(0, 500),
      footer: String(st.footer ?? '').slice(0, 300),
    },
    theme: {
      bg: hex(th.bg, base.theme.bg), primary: hex(th.primary, base.theme.primary),
      accent: hex(th.accent, base.theme.accent), text: hex(th.text, base.theme.text),
    },
    look: {
      bg: {
        type: ['none', 'color', 'image', 'video'].includes(bg.type) ? bg.type : 'none',
        color: hex(bg.color, '#000000'), url: String(bg.url ?? '').slice(0, 2000),
        dim: int(bg.dim, 45, 0, 90), halftone: typeof bg.halftone === 'boolean' ? bg.halftone : true,
      },
      music: { on: !!mu.on, url: String(mu.url ?? '').slice(0, 2000), volume: int(mu.volume, 40, 0, 100) },
    },
    pages: [],
  };
  const seen = new Set();
  for (const p of (Array.isArray(r.pages) ? r.pages : []).slice(0, 30)) {
    if (!p || typeof p !== 'object') continue;
    let id = typeof p.id === 'string' && /^[\w-]{1,32}$/.test(p.id) ? p.id : uid();
    while (seen.has(id)) id = uid();
    seen.add(id);
    const blocks = [];
    const bseen = new Set();
    for (const b of (Array.isArray(p.blocks) ? p.blocks : []).slice(0, 300)) {
      if (!b || !TYPES[b.type]) continue;
      let bid = typeof b.id === 'string' && /^[\w-]{1,32}$/.test(b.id) ? b.id : uid();
      while (bseen.has(bid)) bid = uid();
      bseen.add(bid);
      const w = int(b.w, TYPES[b.type].w, 1, COLS);
      blocks.push({
        id: bid, type: b.type, w, h: int(b.h, TYPES[b.type].h, 1, 40),
        x: int(b.x, 0, 0, COLS - w), y: int(b.y, 0, 0, MAX_ROWS),
        data: nObj(fieldsOf(b.type), b.data),
      });
    }
    resolve(blocks);
    out.pages.push({ id, title: String(p.title ?? 'Page').slice(0, 40), blocks });
  }
  if (!out.pages.length) out.pages = base.pages;
  return out;
}

// ---------- starter content (mirrors the reference layout) ----------
function mk(type, x, y, w, h, data = {}) {
  const b = newBlock(type, x, y);
  b.w = w; b.h = h; Object.assign(b.data, data);
  return b;
}

export function defaultSite() {
  const page = (id, title, blocks) => ({ id, title, blocks });
  return {
    v: 1,
    site: { title: "JoJo's Bizarre Game", sub: 'UPDATE LOG', discord: '', play: '', footer: 'Not affiliated with Roblox or the original manga. Fan project.' },
    theme: { ...PRESETS['Star Platinum'] },
    look: { bg: { type: 'none', color: '#000000', url: '', dim: 45, halftone: true }, music: { on: false, url: '', volume: 40 } },
    pages: [
      page('home', 'Home', [
        mk('hero', 0, 0, 12, 5, {
          tag: 'CHAPTER 015 — THE AWAKENING', title: 'THE NEXT CHAPTER', accent: 'BEGINS...',
          sub: "New Stands. New Abilities. A new era for JoJo's Bizarre Game.", btnText: 'VIEW LATEST UPDATE →', btnUrl: '#updates',
          note: 'Released: April 26, 2025', sfx: 'ドン!!',
        }),
        mk('patch', 0, 5, 7, 5, {
          badge: 'MAJOR UPDATE', version: 'VERSION 1.5.0', title: 'THE AWAKENING', sfx: 'ゴゴゴゴ', tagline: 'A NEW POWER EMERGES...',
          sections: [
            { label: 'NEW CONTENT', items: ['Added a new Stand', 'New quests and features'] },
            { label: 'BALANCE CHANGES', items: ['Adjusted combat mechanics', 'Reworked abilities'] },
            { label: 'BUG FIXES', items: ['Fixed several issues'] },
          ],
          btnText: 'READ FULL PATCH NOTES →', btnUrl: '#updates', released: true,
        }),
        mk('stand', 7, 5, 5, 3, {
          name: 'THE WORLD', rarity: 'Legendary', desc: '',
          stats: [{ label: 'Power', value: 85 }, { label: 'Speed', value: 75 }, { label: 'Range', value: 45 }, { label: 'Durability', value: 70 }],
        }),
        mk('history', 7, 8, 5, 2, {
          rows: [{ version: 'v1.5.0', name: 'The Awakening', latest: true }, { version: 'v1.4.0', name: 'The Evolution', latest: false }, { version: 'v1.3.0', name: 'The Beginning', latest: false }],
        }),
        mk('divider', 0, 10, 12, 1, { text: 'TO BE CONTINUED...', jp: 'まだ終わりではない…' }),
      ]),
      page('updates', 'Updates', [
        mk('title', 0, 0, 12, 1, { text: 'UPDATES', tag: 'PATCH NOTES', size: 'large' }),
        mk('description', 0, 1, 12, 1, { text: 'Everything that changed in the game. Log in at admin.html to edit this page — drag blocks around, resize them, and add new ones from the left.' }),
        mk('ability', 0, 2, 4, 3, { name: 'Sample Ability', key: 'E', owner: 'Your Stand', cooldown: '12s', damage: '30', tags: ['Melee', 'Stun'], desc: 'Describe what this ability does.' }),
        mk('quest', 4, 2, 4, 3, { name: 'Sample Quest', npc: 'Quest Giver', level: 'Lv. 10', desc: 'A short story for the quest.', objectives: ['Defeat 10 enemies'], rewards: ['500 Gold'] }),
        mk('balance', 8, 2, 4, 3, {}),
      ]),
      page('stands', 'Stands', [
        mk('title', 0, 0, 12, 1, { text: 'STANDS', tag: 'SHOWCASE', size: 'large' }),
        mk('stand', 0, 1, 5, 3, {}),
      ]),
      page('history', 'History', [
        mk('title', 0, 0, 12, 1, { text: 'HISTORY', tag: 'ARCHIVE', size: 'large' }),
        mk('history', 0, 1, 6, 2, {}),
      ]),
      page('events', 'Events', [
        mk('title', 0, 0, 12, 1, { text: 'EVENTS', tag: 'LIVE', size: 'large' }),
        mk('countdown', 0, 1, 4, 2, { title: 'NEXT EVENT IN', target: '' }),
      ]),
    ],
  };
}

export const cloneData = (d) => structuredClone(d);
