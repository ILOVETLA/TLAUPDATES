// Builds edit forms from field definitions (used for blocks and for the settings panels).
import { h } from './dom.js';
import { defaultsOf } from './schema.js';

const btn = (text, onclick, cls = '', title) => h('button', { type: 'button', class: 'ib ' + cls, text, onclick, title });

/**
 * fields: field definitions · obj: object edited in place
 * onChange(key, structural): called after every change · ctx.upload(file) -> Promise<url>
 */
export function buildFields(fields, obj, onChange, ctx = {}) {
  const wrap = h('div', { class: 'fields' });
  for (const f of fields) wrap.append(field(f, obj, onChange, ctx));
  return wrap;
}

function field(f, obj, onChange, ctx) {
  const label = (...kids) => h('label', { class: 'fld f-' + f.t }, h('span', { class: 'fl', text: f.label }), ...kids);
  const set = (v) => { obj[f.k] = v; onChange(f.k, false); };

  switch (f.t) {
    case 'text': {
      return label(h('input', { type: 'text', value: obj[f.k] ?? '', maxlength: 500, oninput: (e) => set(e.target.value) }));
    }
    case 'date': {
      return label(h('input', { type: 'datetime-local', value: obj[f.k] ?? '', oninput: (e) => set(e.target.value) }));
    }
    case 'area': {
      const ta = h('textarea', { rows: f.mono ? 10 : 5, spellcheck: f.mono ? 'false' : null, class: f.mono ? 'mono' : '', maxlength: 20000, oninput: (e) => set(e.target.value) });
      ta.value = obj[f.k] ?? '';
      if (f.mono) ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('\t', ta.selectionStart, ta.selectionEnd, 'end'); set(ta.value); }
      });
      return label(ta);
    }
    case 'select': {
      const s = h('select', { onchange: (e) => set(e.target.value) }, f.opts.map(o => h('option', { value: o, text: o })));
      s.value = obj[f.k];
      return label(s);
    }
    case 'num': {
      const read = (e) => { const n = Number(e.target.value); if (Number.isFinite(n)) set(n); };
      if (f.range) {
        const out = h('output', { text: obj[f.k] });
        const r = h('input', { type: 'range', min: f.min, max: f.max, value: obj[f.k], oninput: (e) => { out.textContent = e.target.value; read(e); } });
        return label(h('div', { class: 'rng' }, r, out));
      }
      return label(h('input', { type: 'number', min: f.min, max: f.max, value: obj[f.k], oninput: read }));
    }
    case 'bool': {
      const c = h('input', { type: 'checkbox', onchange: (e) => set(e.target.checked) });
      c.checked = !!obj[f.k];
      return h('label', { class: 'fld f-bool' }, c, h('span', { text: f.label }));
    }
    case 'color': {
      const txt = h('input', { type: 'text', value: obj[f.k], maxlength: 7, class: 'hex' });
      const pick = h('input', { type: 'color', value: obj[f.k] });
      pick.addEventListener('input', () => { txt.value = pick.value; set(pick.value); });
      txt.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) { pick.value = txt.value; set(txt.value.toLowerCase()); } });
      return label(h('div', { class: 'clr' }, pick, txt));
    }
    case 'list': {
      const ta = h('textarea', { rows: 4, maxlength: 20000, oninput: (e) => set(e.target.value.split('\n')) });
      ta.value = (obj[f.k] || []).join('\n');
      return label(ta);
    }
    case 'media': {
      const input = h('input', { type: 'text', value: obj[f.k] ?? '', maxlength: 2000, placeholder: 'https://…  or upload', oninput: (e) => set(e.target.value) });
      const status = h('small', { class: 'hint' });
      const file = h('input', { type: 'file', hidden: true, accept: f.accept || 'image/*,video/mp4,video/webm' });
      file.addEventListener('change', async () => {
        const fl = file.files[0];
        if (!fl) return;
        if (!ctx.upload) { status.textContent = 'Uploads need an unlocked admin session.'; return; }
        status.textContent = 'Uploading to GitHub…';
        try { const url = await ctx.upload(fl); input.value = url; set(url); status.textContent = 'Uploaded ✓'; }
        catch (e) { status.textContent = 'Upload failed: ' + e.message; }
        file.value = '';
      });
      return label(h('div', { class: 'mediaRow' }, input, btn('Upload', () => file.click(), 'up'), file), status);
    }
    case 'rows': return rowsField(f, obj, onChange, ctx);
  }
  return h('div');
}

function rowsField(f, obj, onChange, ctx) {
  const box = h('div', { class: 'fld f-rows' }, h('span', { class: 'fl', text: f.label }));
  const list = h('div', { class: 'rows' });
  const add = btn('+ Add', () => { obj[f.k].push(defaultsOf(f.sub)); onChange(f.k, true); draw(); }, 'add');
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= obj[f.k].length) return;
    [obj[f.k][i], obj[f.k][j]] = [obj[f.k][j], obj[f.k][i]];
    onChange(f.k, true); draw();
  };
  function draw() {
    list.replaceChildren(...obj[f.k].map((item, i) => h('div', { class: 'rowcard' },
      buildFields(f.sub, item, () => onChange(f.k, false), ctx),
      h('div', { class: 'rowtools' },
        btn('↑', () => move(i, -1), '', 'Move up'), btn('↓', () => move(i, 1), '', 'Move down'),
        btn('✕', () => { obj[f.k].splice(i, 1); onChange(f.k, true); draw(); }, 'del', 'Remove')))));
  }
  draw();
  box.append(list, add);
  return box;
}
