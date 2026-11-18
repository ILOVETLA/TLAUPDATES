// The admin editor: drag/resize blocks, edit them, and auto-save every change to GitHub.
import { h, safeUrl, overrides } from './dom.js';
import { TYPES, GROUPS, PRESETS, fieldsOf, newBlock, normalizeSite, defaultsOf } from './schema.js';
import { renderHeader, renderGrid, renderFooter, setPos } from './render.js';
import { resolve, bottom, COLS } from './layout.js';
import { applyTheme, applyBackground, setMusic, initMusic } from './look.js';
import { buildFields } from './inspector.js';
import { bytesToB64 } from './github.js';
import { DATA_PATH } from './config.js';

const IDLE_MS = 15 * 60 * 1000;
const MAX_UPLOAD = 25 * 1024 * 1024;
const UPLOAD_OK = /\.(png|jpe?g|gif|webp|avif|mp4|webm|mp3|ogg|wav|m4a)$/i;

export function startEditor({ gh, data: initial, sha: initialSha, onLock, repoInfo }) {
  let data = normalizeSite(initial);
  let pageId = data.pages[0].id;
  let selId = null;
  let preview = false;
  let tab = 'block';
  const undo = [], redo = [];
  let cur = JSON.stringify(data);
  let burst = null;
  let dirty = false, saving = false, again = false, saveTimer = 0;
  let sha = initialSha;
  let lastSaved = JSON.stringify(normalizeSite(initial), null, 2) + '\n';
  if (initialSha === undefined) lastSaved = '';
  let lastSummary = 'edit';

  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), side = $('side'), palette = $('palette'), status = $('status');
  const page = () => data.pages.find(p => p.id === pageId) || data.pages[0];
  const block = (id) => page().blocks.find(b => b.id === id);

  initMusic({ autostart: false });

  // ---------- saving ----------
  function setStatus(kind, text) { status.dataset.k = kind; status.textContent = text; }

  function markDirty(summary) {
    if (summary) lastSummary = summary;
    dirty = true;
    setStatus('dirty', 'Unsaved changes…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 2500);
  }

  async function save() {
    clearTimeout(saveTimer);
    if (saving) { again = true; return; }
    const text = JSON.stringify(normalizeSite(data), null, 2) + '\n';
    if (text === lastSaved) { dirty = false; setStatus('ok', 'All changes saved to GitHub'); return; }
    saving = true;
    let failed = false;
    setStatus('busy', 'Saving to GitHub…');
    try {
      const res = await gh.putFile(DATA_PATH, text, `Update log: ${lastSummary} (auto-save)`, sha);
      sha = res.content.sha; lastSaved = text;
      setStatus('ok', 'Saved to GitHub · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      dirty = false;
    } catch (e) {
      if (e.status === 409 || e.status === 422) await resolveConflict(text);
      else { failed = true; setStatus('err', 'Save failed: ' + e.message + ' — retrying in 15s'); saveTimer = setTimeout(save, 15000); }
    } finally {
      saving = false;
      if (again) { again = false; save(); }
      else if (!failed && JSON.stringify(normalizeSite(data), null, 2) + '\n' !== lastSaved) markDirty();
    }
  }

  async function resolveConflict(text) {
    try {
      const remote = await gh.getFile(DATA_PATH);
      if (!remote || remote.text === lastSaved) {
        sha = remote?.sha;
        const res = await gh.putFile(DATA_PATH, text, `Update log: ${lastSummary} (auto-save)`, sha);
        sha = res.content.sha; lastSaved = text; dirty = false;
        setStatus('ok', 'Saved to GitHub');
        return;
      }
      if (confirm('The data on GitHub was changed somewhere else (another device or tab).\n\nOK = overwrite it with what you have here.\nCancel = load the GitHub version and drop your unsaved changes here.')) {
        const res = await gh.putFile(DATA_PATH, text, `Update log: ${lastSummary} (overwrite)`, remote.sha);
        sha = res.content.sha; lastSaved = text; dirty = false;
        setStatus('ok', 'Saved to GitHub');
      } else {
        sha = remote.sha; lastSaved = remote.text;
        data = normalizeSite(JSON.parse(remote.text)); cur = JSON.stringify(data);
        pageId = data.pages[0].id; selId = null; dirty = false;
        renderAll(); setStatus('ok', 'Loaded the version from GitHub');
      }
    } catch (e) { setStatus('err', 'Conflict could not be resolved: ' + e.message); }
  }

  async function upload(file) {
    if (file.size > MAX_UPLOAD) throw new Error('File is over 25 MB. Host big videos on YouTube and paste the link.');
    if (!UPLOAD_OK.test(file.name)) throw new Error('Allowed: png, jpg, gif, webp, avif, mp4, webm, mp3, ogg, wav, m4a');
    const name = `${Date.now().toString(36)}-${file.name.replace(/[^\w.-]+/g, '_').slice(-60)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await gh.putFile('assets/' + name, '', `Upload ${name}`, undefined, bytesToB64(bytes));
    const url = `https://raw.githubusercontent.com/${gh.repo}/${gh.branch}/assets/${name}`;
    overrides.set(url, URL.createObjectURL(file)); // instant local preview while raw.githubusercontent warms up
    return url;
  }
  const ctx = { upload };

  // ---------- history ----------
  function touch(summary, structural = true) {
    if (!burst) { undo.push(cur); if (undo.length > 100) undo.shift(); redo.length = 0; }
    clearTimeout(burst);
    burst = setTimeout(() => { burst = null; }, structural ? 0 : 800);
    cur = JSON.stringify(data);
    markDirty(summary);
    updateUndoButtons();
  }
  function restore(json) {
    data = JSON.parse(json); cur = json;
    if (!data.pages.find(p => p.id === pageId)) pageId = data.pages[0].id;
    if (selId && !block(selId)) selId = null;
    renderAll(); markDirty('undo/redo');
  }
  function doUndo() { if (!undo.length) return; redo.push(cur); restore(undo.pop()); }
  function doRedo() { if (!redo.length) return; undo.push(cur); restore(redo.pop()); }
  function updateUndoButtons() { $('btnUndo').disabled = !undo.length; $('btnRedo').disabled = !redo.length; }

  // ---------- rendering ----------
  function decorate(el, b) {
    if (b.id === selId) el.classList.add('sel');
    el.append(
      h('div', { class: 'tools' },
        h('button', { class: 'tb drag', type: 'button', title: 'Drag to move', text: '✥' }),
        h('button', { class: 'tb dup', type: 'button', title: 'Duplicate (Ctrl+D)', text: '⧉' }),
        h('button', { class: 'tb del', type: 'button', title: 'Delete (Del)', text: '✕' })),
      h('div', { class: 'rz', title: 'Drag to resize' }));
    el.append(h('span', { class: 'tname', text: TYPES[b.type].label }));
  }

  function renderStage() {
    applyTheme(data.theme);
    applyBackground(data.look);
    setMusic(data.look.music);
    const grid = renderGrid(page(), { edit: !preview, decorate: preview ? null : decorate });
    stage.classList.toggle('preview', preview);
    stage.replaceChildren(
      renderHeader(data, pageId, { onNav: (id) => { pageId = id; selId = null; renderAll(); } }),
      h('main', { class: 'page' }, grid), renderFooter(data));
  }

  function renderAll() { renderStage(); renderSide(); renderPalette(); }

  function refreshBlock(b) {
    const old = stage.querySelector(`.blk[data-id="${b.id}"]`);
    if (!old) return renderStage();
    const fresh = renderGrid({ blocks: [b] }, { edit: false, decorate }).firstChild;
    fresh.style.setProperty('--o', old.style.getPropertyValue('--o'));
    old.replaceWith(fresh);
  }

  function select(id, rerenderSide = true) {
    selId = id;
    stage.querySelectorAll('.blk.sel').forEach(e => e.classList.remove('sel'));
    if (id) stage.querySelector(`.blk[data-id="${id}"]`)?.classList.add('sel');
    if (id && tab !== 'block') tab = 'block';
    if (rerenderSide) renderSide();
  }

  // ---------- block operations ----------
  function addBlock(type, x, y) {
    const b = newBlock(type, x ?? 0, y ?? bottom(page().blocks));
    page().blocks.push(b);
    resolve(page().blocks, b.id);
    selId = b.id;
    touch(`added ${TYPES[type].label}`);
    renderAll();
    stage.querySelector(`.blk[data-id="${b.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function delBlock(id) {
    const i = page().blocks.findIndex(b => b.id === id);
    if (i < 0) return;
    page().blocks.splice(i, 1);
    if (selId === id) selId = null;
    touch('removed a block');
    renderAll();
  }
  function dupBlock(id) {
    const b = block(id);
    if (!b) return;
    const c = structuredClone(b);
    c.id = Math.random().toString(36).slice(2, 9);
    c.y = b.y + b.h;
    page().blocks.push(c);
    resolve(page().blocks, c.id);
    selId = c.id;
    touch('duplicated a block');
    renderAll();
  }

  // ---------- grid geometry for dragging ----------
  function metrics(grid) {
    const cs = getComputedStyle(grid), r = grid.getBoundingClientRect();
    const gap = parseFloat(cs.columnGap) || 0, rgap = parseFloat(cs.rowGap) || 0;
    const colW = (r.width - gap * (COLS - 1)) / COLS;
    const rows = cs.gridTemplateRows.split(' ').map(parseFloat).filter(Number.isFinite);
    return { r, gap, rgap, colW, rows };
  }
  function cellAt(m, px, py) {
    const col = Math.max(0, Math.min(COLS - 1, Math.floor((px - m.r.left) / (m.colW + m.gap))));
    let y = m.r.top, row = 0, found = false;
    for (let i = 0; i < m.rows.length; i++) {
      if (py < y + m.rows[i] + m.rgap / 2) { row = i; found = true; break; }
      y += m.rows[i] + m.rgap;
    }
    if (!found) row = m.rows.length + Math.max(0, Math.floor((py - y) / (56 + m.rgap)));
    return { col, row: Math.max(0, row) };
  }

  let scrollRaf = 0;
  function autoScroll(clientY) {
    cancelAnimationFrame(scrollRaf);
    const r = stage.getBoundingClientRect();
    const dy = clientY < r.top + 70 ? -18 : clientY > r.bottom - 70 ? 18 : 0;
    if (dy) { stage.scrollBy(0, dy); scrollRaf = requestAnimationFrame(() => autoScroll(clientY)); }
  }

  function startMove(e, el, b) {
    e.preventDefault();
    const grid = stage.querySelector('.grid');
    const m0 = metrics(grid);
    const start = cellAt(m0, e.clientX, e.clientY);
    const offX = start.col - b.x, offY = start.row - b.y;
    const sx = e.clientX, sy = e.clientY, scroll0 = stage.scrollTop;
    const ghost = h('div', { class: 'ghost' });
    grid.append(ghost);
    el.classList.add('dragging');
    let tx = b.x, ty = b.y, lastY = e.clientY;
    const put = () => setPos(ghost, { x: tx, y: ty, w: b.w, h: b.h });
    put();
    const move = (ev) => {
      lastY = ev.clientY;
      el.style.transform = `translate(${ev.clientX - sx}px, ${ev.clientY - sy + (stage.scrollTop - scroll0)}px)`;
      const m = metrics(grid);
      const c = cellAt(m, ev.clientX, ev.clientY);
      tx = Math.max(0, Math.min(COLS - b.w, c.col - offX));
      ty = Math.max(0, c.row - offY);
      put();
      autoScroll(ev.clientY);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      cancelAnimationFrame(scrollRaf);
      el.classList.remove('dragging'); el.style.transform = ''; ghost.remove();
      if (tx !== b.x || ty !== b.y) {
        b.x = tx; b.y = ty;
        resolve(page().blocks, b.id);
        touch('moved a block');
        renderStage();
      }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }

  function startResize(e, el, b) {
    e.preventDefault(); e.stopPropagation();
    const grid = stage.querySelector('.grid');
    const ghost = h('div', { class: 'ghost' });
    grid.append(ghost);
    let nw = b.w, nh = b.h;
    const move = (ev) => {
      const c = cellAt(metrics(grid), ev.clientX, ev.clientY);
      nw = Math.max(1, Math.min(COLS - b.x, c.col - b.x + 1));
      nh = Math.max(1, Math.min(40, c.row - b.y + 1));
      setPos(ghost, { x: b.x, y: b.y, w: nw, h: nh });
      autoScroll(ev.clientY);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      cancelAnimationFrame(scrollRaf);
      ghost.remove();
      if (nw !== b.w || nh !== b.h) {
        b.w = nw; b.h = nh;
        resolve(page().blocks, b.id);
        touch('resized a block');
        renderStage();
      }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }

  // drag a new block out of the palette
  function startPaletteDrag(e, type) {
    e.preventDefault();
    const label = h('div', { class: 'pghost', text: TYPES[type].label });
    document.body.append(label);
    let moved = false;
    const move = (ev) => {
      if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 6) moved = true;
      label.style.left = ev.clientX + 12 + 'px'; label.style.top = ev.clientY + 12 + 'px';
      autoScroll(ev.clientY);
    };
    const up = (ev) => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      label.remove(); cancelAnimationFrame(scrollRaf);
      if (!moved) return addBlock(type);
      const grid = stage.querySelector('.grid');
      if (!grid) return;
      const gr = grid.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      if (ev.clientX < sr.left || ev.clientX > sr.right || ev.clientY < sr.top || ev.clientY > sr.bottom) return;
      const c = cellAt(metrics(grid), Math.max(gr.left + 1, ev.clientX), ev.clientY);
      const w = TYPES[type].w;
      addBlock(type, Math.max(0, Math.min(COLS - w, c.col)), c.row);
    };
    move(e);
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  // delegated stage events
  stage.addEventListener('pointerdown', (e) => {
    if (preview || e.button !== 0) return;
    const el = e.target.closest('.blk');
    if (!el) { if (!e.target.closest('a,button')) select(null); return; }
    const b = block(el.dataset.id);
    if (!b) return;
    if (e.target.closest('.rz')) { select(b.id, false); return startResize(e, el, b); }
    if (e.target.closest('.tb.del')) return;
    if (e.target.closest('.tb.dup')) return;
    if (selId !== b.id) select(b.id);
    if (e.target.closest('.tb.drag') || !e.target.closest('a,button,input,textarea,pre')) startMove(e, el, b);
  });
  stage.addEventListener('click', (e) => {
    const el = e.target.closest('.blk');
    if (!el || preview) return;
    if (e.target.closest('.tb.del')) delBlock(el.dataset.id);
    else if (e.target.closest('.tb.dup')) dupBlock(el.dataset.id);
    // stop real navigation inside the editor (buttons/links in blocks)
    const a = e.target.closest('a');
    if (a && !a.closest('.hdr')) e.preventDefault();
  });

  addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { if (typing) return; e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { if (typing) return; e.preventDefault(); doRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (typing || !selId) return;
    const b = block(selId);
    if (!b) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delBlock(selId); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); dupBlock(selId); }
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      b.x = Math.max(0, Math.min(COLS - b.w, b.x + d[0])); b.y = Math.max(0, b.y + d[1]);
      resolve(page().blocks, b.id); touch('moved a block', false); renderStage();
    }
  });

  // ---------- palette ----------
  function renderPalette() {
    palette.replaceChildren(
      h('h2', { text: 'Add a block' }),
      h('p', { class: 'hint', text: 'Click to add at the bottom, or drag onto the page.' }),
      ...GROUPS.map(g => h('section', null,
        h('h3', { text: g }),
        h('div', { class: 'pal' }, Object.entries(TYPES).filter(([, t]) => t.group === g).map(([k, t]) =>
          h('button', { type: 'button', class: 'pal-item', title: t.label, onpointerdown: (e) => startPaletteDrag(e, k) },
            h('span', { class: 'pi', text: t.icon }), h('span', { text: t.label })))))));
  }

  // ---------- side panel ----------
  const TABS = [['block', 'Block'], ['pages', 'Pages'], ['theme', 'Theme'], ['look', 'Look'], ['site', 'Site'], ['sync', 'GitHub']];

  function renderSide() {
    const body = h('div', { class: 'side-body' });
    ({ block: tabBlock, pages: tabPages, theme: tabTheme, look: tabLook, site: tabSite, sync: tabSync })[tab](body);
    side.replaceChildren(
      h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, l]) =>
        h('button', { type: 'button', role: 'tab', class: k === tab ? 'on' : '', text: l, onclick: () => { tab = k; renderSide(); } }))),
      body);
  }

  function tabBlock(body) {
    const b = selId && block(selId);
    if (!b) { body.append(h('p', { class: 'empty', text: 'Select a block on the page to edit it. Drag its ✥ handle to move it anywhere; drag the corner to resize.' })); return; }
    body.append(
      h('h2', { text: TYPES[b.type].label }),
      h('div', { class: 'btnrow' },
        h('button', { type: 'button', class: 'ib', text: '⧉ Duplicate', onclick: () => dupBlock(b.id) }),
        h('button', { type: 'button', class: 'ib del', text: '✕ Delete', onclick: () => delBlock(b.id) })),
      h('div', { class: 'geo' },
        ...[['x', 'Col', 0, COLS - 1], ['y', 'Row', 0, 500], ['w', 'Width', 1, COLS], ['h', 'Height', 1, 40]].map(([k, l, lo, hi]) =>
          h('label', null, h('span', { text: l }), h('input', {
            type: 'number', min: lo, max: hi, value: b[k],
            onchange: (e) => {
              const n = Math.round(Number(e.target.value));
              if (!Number.isFinite(n)) return;
              b[k] = Math.max(lo, Math.min(hi, n));
              b.x = Math.min(b.x, COLS - b.w);
              resolve(page().blocks, b.id); touch('moved a block'); renderStage(); renderSide();
            },
          })))),
      buildFields(fieldsOf(b.type), b.data, (k, structural) => {
        touch(`edited ${TYPES[b.type].label.toLowerCase()}`, structural);
        refreshBlock(b);
      }, ctx));
  }

  function tabPages(body) {
    body.append(h('h2', { text: 'Pages' }), h('p', { class: 'hint', text: 'Each page is one tab in the top menu. The first page is your home page.' }));
    const list = h('div', { class: 'rows' });
    data.pages.forEach((p, i) => {
      const t = h('input', { type: 'text', value: p.title, maxlength: 40, oninput: (e) => { p.title = e.target.value; touch('renamed a page', false); stage.querySelector('.nav')?.replaceWith(renderHeader(data, pageId, { onNav: nav }).querySelector('.nav')); } });
      list.append(h('div', { class: 'rowcard pg' + (p.id === pageId ? ' on' : '') },
        t,
        h('div', { class: 'rowtools' },
          h('button', { type: 'button', class: 'ib', text: 'Open', onclick: () => { pageId = p.id; selId = null; renderAll(); } }),
          h('button', { type: 'button', class: 'ib', text: '↑', onclick: () => { if (i) { [data.pages[i - 1], data.pages[i]] = [data.pages[i], data.pages[i - 1]]; touch('reordered pages'); renderAll(); } } }),
          h('button', { type: 'button', class: 'ib', text: '↓', onclick: () => { if (i < data.pages.length - 1) { [data.pages[i + 1], data.pages[i]] = [data.pages[i], data.pages[i + 1]]; touch('reordered pages'); renderAll(); } } }),
          h('button', { type: 'button', class: 'ib del', text: '✕', onclick: () => {
            if (data.pages.length < 2) return alert('You need at least one page.');
            if (!confirm(`Delete the page "${p.title}" and everything on it?`)) return;
            data.pages.splice(i, 1); if (pageId === p.id) pageId = data.pages[0].id; selId = null; touch('deleted a page'); renderAll();
          } }))));
    });
    body.append(list, h('button', { type: 'button', class: 'ib add', text: '+ New page', onclick: () => {
      if (data.pages.length >= 30) return;
      const id = 'p' + Math.random().toString(36).slice(2, 7);
      data.pages.push({ id, title: 'New Page', blocks: [] }); pageId = id; selId = null; touch('added a page'); renderAll();
    } }));
    function nav(id) { pageId = id; selId = null; renderAll(); }
  }

  function tabTheme(body) {
    const f = [['bg', 'Background'], ['primary', 'Primary (panels, glow)'], ['accent', 'Accent (buttons, highlights)'], ['text', 'Text']]
      .map(([k, label]) => ({ k, label, t: 'color', def: data.theme[k] }));
    body.append(h('h2', { text: 'Colour theme' }), h('p', { class: 'hint', text: 'Four colours drive the whole site: every block, button, border and glow.' }),
      h('div', { class: 'presets' }, Object.entries(PRESETS).map(([name, p]) => h('button', {
        type: 'button', class: 'preset', title: name, onclick: () => { Object.assign(data.theme, p); touch('changed theme'); applyTheme(data.theme); renderSide(); },
      }, h('span', { class: 'sw' }, [p.bg, p.primary, p.accent, p.text].map(c => { const s = h('i'); s.style.background = c; return s; })), h('small', { text: name })))),
      buildFields(f, data.theme, () => { applyTheme(data.theme); touch('changed theme', false); }, ctx));
  }

  function tabLook(body) {
    const bg = data.look.bg, mu = data.look.music;
    const bgFields = [
      { k: 'type', label: 'Background type', t: 'select', opts: ['none', 'color', 'image', 'video'], def: 'none' },
      { k: 'color', label: 'Solid colour', t: 'color', def: '#000000' },
      { k: 'url', label: 'Image / mp4 / YouTube link', t: 'media', def: '', accept: 'image/*,video/mp4,video/webm' },
      { k: 'dim', label: 'Darken image/video', t: 'num', def: 45, min: 0, max: 90, range: true },
      { k: 'halftone', label: 'Manga halftone dots', t: 'bool', def: true },
    ];
    const muFields = [
      { k: 'on', label: 'Play background music', t: 'bool', def: false },
      { k: 'url', label: 'Audio file (mp3 / ogg / wav)', t: 'media', def: '', accept: 'audio/*' },
      { k: 'volume', label: 'Volume', t: 'num', def: 40, min: 0, max: 100, range: true },
    ];
    body.append(
      h('h2', { text: 'Background' }),
      buildFields(bgFields, bg, () => { applyBackground(data.look); touch('changed background', false); }, ctx),
      h('h2', { text: 'Background music' }),
      h('p', { class: 'hint', text: 'Browsers only allow sound after a visitor clicks or taps once, so music starts on their first interaction. They get a 🔊 button to mute it. In this editor it stays off until you press the 🔊 button.' }),
      buildFields(muFields, mu, () => { setMusic(mu); touch('changed music', false); }, ctx));
  }

  function tabSite(body) {
    const s = data.site;
    const f = [
      { k: 'title', label: 'Game name (logo)', t: 'text', def: '' }, { k: 'sub', label: 'Logo subtitle', t: 'text', def: '' },
      { k: 'discord', label: 'Discord link', t: 'text', def: '' }, { k: 'play', label: 'Play Now link (Roblox)', t: 'text', def: '' },
      { k: 'footer', label: 'Footer text', t: 'text', def: '' },
    ];
    body.append(h('h2', { text: 'Site' }), buildFields(f, s, () => { touch('changed site settings', false); const hd = stage.querySelector('.hdr'); if (hd) hd.replaceWith(renderHeader(data, pageId, { onNav: (id) => { pageId = id; selId = null; renderAll(); } })); }, ctx),
      h('h2', { text: 'Backup' }),
      h('div', { class: 'btnrow' },
        h('button', { type: 'button', class: 'ib', text: '⇩ Export JSON', onclick: () => {
          const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(normalizeSite(data), null, 2)], { type: 'application/json' })), download: 'site-backup.json' });
          document.body.append(a); a.click(); a.remove();
        } }),
        h('label', { class: 'ib' }, '⇧ Import JSON', h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
          const fl = e.target.files[0]; if (!fl) return;
          try { const n = normalizeSite(JSON.parse(await fl.text())); data = n; pageId = n.pages[0].id; selId = null; touch('imported a backup'); renderAll(); }
          catch { alert('That file is not a valid backup.'); }
        } }))));
  }

  function tabSync(body) {
    body.append(
      h('h2', { text: 'GitHub sync' }),
      h('dl', { class: 'kv' },
        h('dt', { text: 'Repository' }), h('dd', { text: gh.repo }),
        h('dt', { text: 'Data branch' }), h('dd', { text: gh.branch }),
        h('dt', { text: 'Data file' }), h('dd', { text: DATA_PATH }),
        h('dt', { text: 'Signed in as' }), h('dd', { text: repoInfo?.login || 'token holder' })),
      h('p', { class: 'hint', text: 'Every change is committed to the data branch automatically ~2.5 seconds after you stop editing. Visitors pull the newest version from GitHub every minute, so there is no rebuild to wait for.' }),
      h('div', { class: 'btnrow' },
        h('button', { type: 'button', class: 'ib gold', text: 'Save now (Ctrl+S)', onclick: save }),
        h('a', { class: 'ib', target: '_blank', rel: 'noopener noreferrer', href: `https://github.com/${gh.repo}/commits/${encodeURIComponent(gh.branch)}`, text: 'View history ↗' })),
      h('p', { class: 'hint', text: 'Every save is a commit, so you can roll back any mistake from GitHub\'s history.' }),
      h('h2', { text: 'Security' }),
      h('div', { class: 'btnrow' },
        h('button', { type: 'button', class: 'ib', text: '🔒 Lock now', onclick: lock }),
        h('button', { type: 'button', class: 'ib del', text: 'Forget this device', onclick: () => { if (confirm('Remove the stored (encrypted) token from this browser?')) onLock(true); } })),
      h('p', { class: 'hint', text: 'The editor locks itself after 15 minutes without activity.' }));
  }

  // ---------- top bar ----------
  $('btnUndo').onclick = doUndo;
  $('btnRedo').onclick = doRedo;
  $('btnPreview').onclick = () => { preview = !preview; $('btnPreview').classList.toggle('on', preview); $('btnPreview').textContent = preview ? '✎ Back to editing' : '👁 Preview'; document.body.classList.toggle('previewing', preview); renderStage(); };
  $('btnLock').onclick = lock;
  $('btnView').href = location.pathname.replace(/admin\.html$/, '') || './';

  async function lock() {
    clearTimeout(saveTimer);
    if (dirty) { setStatus('busy', 'Saving before lock…'); await save(); }
    onLock(false);
  }

  addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  let idle = setTimeout(lock, IDLE_MS);
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { clearTimeout(idle); idle = setTimeout(lock, IDLE_MS); }, { passive: true });

  setStatus('ok', initialSha === undefined ? 'Ready — first save will create the data file' : 'All changes saved to GitHub');
  updateUndoButtons();
  renderAll();
  if (initialSha === undefined) markDirty('create site data');

  return { save, getData: () => data };
}
