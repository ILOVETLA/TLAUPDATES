// Encrypts your GitHub token with a passphrase before it is stored in this browser.
// AES-256-GCM, key derived with PBKDF2-SHA256 (600k iterations, random salt).
// The passphrase and the unlocked token only ever live in memory.
const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 600000;
const KEY = 'jjb.vault.v1';
const FAIL = 'jjb.fail.v1';

const toB64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(secret, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, ITER);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret));
  return { iter: ITER, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

export async function open(blob, pass) {
  const key = await deriveKey(pass, fromB64(blob.salt), blob.iter);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct));
  return dec.decode(pt);
}

export function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
export function store(v) { localStorage.setItem(KEY, JSON.stringify(v)); }
export function wipe() { try { localStorage.removeItem(KEY); localStorage.removeItem(FAIL); } catch {} }

// Slows down repeated wrong passphrases (5 free tries, then 10s, 20s, 40s ... up to 1 hour).
export function lockRemaining() {
  try {
    const f = JSON.parse(localStorage.getItem(FAIL));
    return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
  } catch { return 0; }
}
export function recordFail() {
  let f = { n: 0, until: 0 };
  try { f = JSON.parse(localStorage.getItem(FAIL)) || f; } catch {}
  f.n++;
  if (f.n > 5) f.until = Date.now() + Math.min(3600, 10 * 2 ** (f.n - 6)) * 1000;
  try { localStorage.setItem(FAIL, JSON.stringify(f)); } catch {}
}
export function clearFails() { try { localStorage.removeItem(FAIL); } catch {} }

export function passphraseProblem(p) {
  if (p.length < 12) return 'Use at least 12 characters. A few random words works well.';
  if (new Set(p).size < 6) return 'That passphrase is too repetitive.';
  return '';
}
