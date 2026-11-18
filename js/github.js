// Minimal GitHub REST client. Writing only works with a token that has write access
// to the repo, which is what actually keeps everyone else out.
const API = 'https://api.github.com';

export class GHError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

const utf8 = new TextEncoder();
export function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export class GH {
  constructor(token, repo, branch) { this.t = token; this.repo = repo; this.branch = branch; }

  async api(path, opt = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        ...opt, cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          Authorization: 'Bearer ' + this.t, ...(opt.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch { throw new GHError(0, 'Network error — are you online?'); }
    if (res.status === 204) return null;
    let j = null;
    try { j = await res.json(); } catch {}
    if (!res.ok) {
      const msg = res.status === 401 ? 'GitHub rejected the token (expired or wrong).' : (j && j.message) || res.statusText;
      throw new GHError(res.status, msg);
    }
    return j;
  }

  /** Confirms the token works AND can write to this repo. */
  async check() {
    const j = await this.api(`/repos/${this.repo}`);
    if (!j.permissions || !j.permissions.push) throw new GHError(403, 'This token can read the repo but cannot write to it. Give it "Contents: Read and write".');
    return j;
  }

  /** Creates the data branch from the default branch if it does not exist yet. Returns true if it was created. */
  async ensureBranch(defaultBranch) {
    try { await this.api(`/repos/${this.repo}/branches/${encodeURIComponent(this.branch)}`); return false; }
    catch (e) { if (e.status !== 404) throw e; }
    const ref = await this.api(`/repos/${this.repo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
    await this.api(`/repos/${this.repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${this.branch}`, sha: ref.object.sha }) });
    return true;
  }

  async getFile(path, ref = this.branch) {
    try {
      const j = await this.api(`/repos/${this.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
      const bytes = Uint8Array.from(atob(j.content.replace(/\n/g, '')), c => c.charCodeAt(0));
      return { sha: j.sha, text: new TextDecoder().decode(bytes) };
    } catch (e) { if (e.status === 404) return null; throw e; }
  }

  /** Create/update a file. Pass text, or a base64 string via `b64` for binary uploads. */
  putFile(path, text, message, sha, b64) {
    const body = { message, branch: this.branch, content: b64 ?? bytesToB64(utf8.encode(text)) };
    if (sha) body.sha = sha;
    return this.api(`/repos/${this.repo}/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
  }
}
