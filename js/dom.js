// Tiny DOM + safety helpers. Nothing in this site ever uses innerHTML:
// all content is inserted with textContent / createTextNode, and every URL
// goes through safeUrl() first.

/** Map of "assets/foo.png" -> blob: URL, so freshly uploaded files preview instantly in the editor. */
export const overrides = new Map();

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

/** Returns a URL that is safe to put in href/src, or '' if it is not. Only https:, same-site relative paths and #hash links pass. */
export function safeUrl(u) {
  if (typeof u !== 'string') return '';
  u = u.trim();
  if (!u || u.length > 2000) return '';
  if (overrides.has(u)) return overrides.get(u);
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {
    try { const x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; }
  }
  if (u.startsWith('//')) return '';
  if (/(^|\/)\.\.(\/|$)/.test(u) || /[\\<>"'`\s]/.test(u)) return '';
  return u;
}

export function youtubeId(u) {
  try {
    const x = new URL(u);
    const host = x.hostname.replace(/^(www|m)\./, '');
    let id = '';
    if (host === 'youtu.be') id = x.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (x.pathname === '/watch') id = x.searchParams.get('v') || '';
      else { const m = /^\/(embed|shorts|live|v)\/([\w-]{11})/.exec(x.pathname); if (m) id = m[2]; }
    }
    return /^[\w-]{11}$/.test(id) ? id : '';
  } catch { return ''; }
}

export function mediaKind(u) {
  if (!u) return '';
  if (youtubeId(u)) return 'youtube';
  const path = u.split(/[?#]/)[0];
  if (/\.(mp4|webm|m4v|mov|ogv)$/i.test(path)) return 'video';
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)) return 'image';
  return '';
}

/** Mini markdown: paragraphs, "- " lists, "## " headings, **bold**, *italic*, `code`, [text](https://link). Builds DOM, never HTML. */
function inline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(h('strong', { text: t.slice(2, -2) }));
    else if (t.startsWith('`')) out.push(h('code', { text: t.slice(1, -1) }));
    else if (t.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t);
      const u = safeUrl(mm[2]);
      out.push(u ? h('a', { href: u, target: u.startsWith('#') ? null : '_blank', rel: 'noopener noreferrer', text: mm[1] }) : mm[1]);
    } else out.push(h('em', { text: t.slice(1, -1) }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function md(src) {
  const root = h('div', { class: 'md' });
  let list = null;
  for (const raw of String(src || '').split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*[-*] /.test(line)) {
      if (!list) { list = h('ul'); root.append(list); }
      list.append(h('li', null, inline(line.replace(/^\s*[-*] /, ''))));
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    if (/^#{1,3} /.test(line)) root.append(h('h4', null, inline(line.replace(/^#{1,3} /, ''))));
    else root.append(h('p', null, inline(line)));
  }
  return root;
}

const KW = 'local|function|end|if|then|else|elseif|for|while|do|return|in|and|or|not|nil|true|false|const|let|var|class|new|import|from|def|self|break|continue|repeat|until|async|await';
const TOK = new RegExp(`(--[^\\n]*|//[^\\n]*)|("(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*')|\\b(\\d+(?:\\.\\d+)?)\\b|\\b(${KW})\\b`, 'g');

/** Very small syntax highlighter (Lua / JS / Python-ish). Returns DOM nodes. */
export function highlight(code) {
  const out = [];
  let last = 0, m;
  TOK.lastIndex = 0;
  while ((m = TOK.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : 'k';
    out.push(h('span', { class: 'tk-' + cls, text: m[0] }));
    last = m.index + m[0].length;
    if (m[0].length === 0) TOK.lastIndex++;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
