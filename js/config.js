// Where the live data lives. Edits are committed to a separate branch so that saving
// never triggers a GitHub Pages rebuild (Pages has a soft limit on builds per hour)
// and visitors see changes within seconds.
export const DATA_BRANCH = 'site-data';
export const DATA_PATH = 'data/site.json';

/** Guess "owner/repo" from a standard GitHub Pages URL (owner.github.io/repo/). */
export function detectRepo() {
  const host = location.hostname;
  if (!host.endsWith('.github.io')) return '';
  const owner = host.slice(0, -'.github.io'.length);
  const first = location.pathname.split('/').filter(Boolean)[0];
  const isFile = first && first.includes('.');
  return `${owner}/${first && !isFile ? first : owner + '.github.io'}`;
}

export const validRepo = (s) => /^[\w.-]+\/[\w.-]+$/.test(s);
export const validBranch = (s) => /^[\w./-]{1,100}$/.test(s) && !s.includes('..');
