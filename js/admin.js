// Admin entry: lock screen -> verify token with GitHub -> load data -> start the editor.
// Security model: nothing here is a secret. What protects your site is that GitHub only
// accepts writes from YOUR token. The token is stored encrypted with your passphrase.
import { h } from './dom.js';
import * as vault from './vault.js';
import { GH } from './github.js';
import { defaultSite } from './schema.js';
import { startEditor } from './editor.js';
import { DATA_BRANCH, DATA_PATH, detectRepo, validRepo, validBranch } from './config.js';

// refuse to run inside someone else's frame (clickjacking)
if (window.top !== window.self) { document.documentElement.remove(); throw new Error('framed'); }

const lock = document.getElementById('lock');
const app = document.getElementById('app');

function screen(...kids) { lock.hidden = false; app.hidden = true; lock.replaceChildren(h('div', { class: 'lockbox' }, ...kids)); }

function errBox() { return h('p', { class: 'err', role: 'alert' }); }

// ---------- first-time setup ----------
function showSetup(note) {
  const err = errBox();
  if (note) err.textContent = note;
  const repo = h('input', { type: 'text', id: 'repo', value: detectRepo(), placeholder: 'your-name/your-repo', autocomplete: 'off', spellcheck: 'false' });
  const branch = h('input', { type: 'text', id: 'branch', value: DATA_BRANCH, autocomplete: 'off', spellcheck: 'false' });
  const token = h('input', { type: 'password', id: 'token', placeholder: 'github_pat_…', autocomplete: 'off', spellcheck: 'false' });
  const p1 = h('input', { type: 'password', id: 'p1', autocomplete: 'new-password' });
  const p2 = h('input', { type: 'password', id: 'p2', autocomplete: 'new-password' });
  const remember = h('input', { type: 'checkbox', id: 'remember' });
  remember.checked = true;
  const go = h('button', { type: 'submit', class: 'go', text: 'Verify & unlock' });

  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    const r = repo.value.trim(), b = branch.value.trim(), t = token.value.trim();
    if (!validRepo(r)) return (err.textContent = 'Repository must look like owner/name.');
    if (!validBranch(b)) return (err.textContent = 'That branch name is not valid.');
    if (!t) return (err.textContent = 'Paste your GitHub token.');
    if (remember.checked) {
      const prob = vault.passphraseProblem(p1.value);
      if (prob) return (err.textContent = prob);
      if (p1.value !== p2.value) return (err.textContent = 'The two passphrases do not match.');
    }
    go.disabled = true; go.textContent = 'Checking with GitHub…';
    try {
      const gh = new GH(t, r, b);
      const info = await gh.check();
      if (remember.checked) vault.store({ repo: r, branch: b, sealed: await vault.seal(t, p1.value) });
      vault.clearFails();
      await boot(gh, info);
    } catch (ex) {
      err.textContent = ex.message; go.disabled = false; go.textContent = 'Verify & unlock';
    }
  } },
  h('label', null, h('span', { text: 'GitHub repository' }), repo),
  h('label', null, h('span', { text: 'Data branch (created automatically)' }), branch),
  h('label', null, h('span', { text: 'Fine-grained access token' }), token),
  h('details', { class: 'howto' }, h('summary', { text: 'How do I get a token?' }),
    h('ol', null,
      h('li', null, 'GitHub → Settings → Developer settings → Personal access tokens → ', h('b', { text: 'Fine-grained tokens' }), ' → Generate new token.'),
      h('li', null, 'Repository access: ', h('b', { text: 'Only select repositories' }), ' → pick just this site\'s repo.'),
      h('li', null, 'Permissions → Repository permissions → ', h('b', { text: 'Contents: Read and write' }), ' (nothing else).'),
      h('li', null, 'Set an expiry (90 days is fine), generate, and paste it here.'))),
  h('label', { class: 'chk' }, remember, h('span', { text: 'Remember me on this device (token is stored encrypted)' })),
  h('label', null, h('span', { text: 'Passphrase (12+ characters)' }), p1),
  h('label', null, h('span', { text: 'Repeat passphrase' }), p2),
  err, go);

  screen(h('h1', { text: 'Admin setup' }), h('p', { class: 'lead', text: 'One-time setup. Only someone holding a GitHub token with write access to this repo can ever change the site.' }), form);
  token.focus();
}

// ---------- unlock ----------
function showUnlock(saved) {
  const err = errBox();
  const pass = h('input', { type: 'password', id: 'pass', autocomplete: 'current-password' });
  const go = h('button', { type: 'submit', class: 'go', text: 'Unlock' });
  let timer = 0;

  const tickLock = () => {
    const s = vault.lockRemaining();
    if (s > 0) { go.disabled = true; err.textContent = `Too many wrong tries. Wait ${s}s.`; timer = setTimeout(tickLock, 1000); }
    else { go.disabled = false; if (/Too many/.test(err.textContent)) err.textContent = ''; }
  };

  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    if (vault.lockRemaining() > 0) return tickLock();
    err.textContent = ''; go.disabled = true; go.textContent = 'Unlocking…';
    let token;
    try { token = await vault.open(saved.sealed, pass.value); }
    catch { vault.recordFail(); pass.value = ''; go.textContent = 'Unlock'; err.textContent = 'Wrong passphrase.'; go.disabled = false; return tickLock(); }
    try {
      const gh = new GH(token, saved.repo, saved.branch);
      const info = await gh.check();
      vault.clearFails();
      await boot(gh, info);
    } catch (ex) { err.textContent = ex.message; go.disabled = false; go.textContent = 'Unlock'; }
  } },
  h('p', { class: 'meta', text: `${saved.repo} · ${saved.branch}` }),
  h('label', null, h('span', { text: 'Passphrase' }), pass), err, go,
  h('button', { type: 'button', class: 'linkbtn', text: 'Forget this device / use a different token', onclick: () => { if (confirm('Remove the stored token from this browser?')) { vault.wipe(); showSetup(); } } }));

  screen(h('h1', { text: 'Admin locked 🔒' }), form);
  tickLock();
  pass.focus();
  void timer;
}

// ---------- boot the editor ----------
async function boot(gh, info) {
  screen(h('h1', { text: 'Loading…' }), h('p', { class: 'lead', text: 'Connecting to GitHub' }));
  try {
    const created = await gh.ensureBranch(info.default_branch);
    let file = await gh.getFile(DATA_PATH);
    let data, sha;
    if (file) {
      try { data = JSON.parse(file.text); sha = file.sha; } catch { data = defaultSite(); sha = file.sha; }
    } else {
      // no data yet: start from the sample that ships in the repo, or the built-in starter
      const seed = created ? null : await gh.getFile(DATA_PATH, info.default_branch);
      try { data = seed ? JSON.parse(seed.text) : defaultSite(); } catch { data = defaultSite(); }
      sha = undefined;
    }
    lock.hidden = true; app.hidden = false;
    startEditor({
      gh, data, sha, repoInfo: { login: info.owner?.login },
      onLock: (forget) => { if (forget) vault.wipe(); location.reload(); },
    });
  } catch (ex) {
    screen(h('h1', { text: 'Could not load' }), h('p', { class: 'err', text: ex.message }),
      h('button', { type: 'button', class: 'go', text: 'Back', onclick: () => location.reload() }));
  }
}

const saved = vault.load();
if (saved && saved.sealed && validRepo(saved.repo)) showUnlock(saved); else showSetup();
