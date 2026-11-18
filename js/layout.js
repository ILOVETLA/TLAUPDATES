// Grid layout helpers: 12 columns, rows auto-size to content.
export const COLS = 12;
export const MAX_ROWS = 500;

export const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Pushes blocks down so nothing overlaps. The block with id `pinId` (the one the user is moving) keeps its spot. */
export function resolve(blocks, pinId) {
  const order = [...blocks].sort((a, b) =>
    (a.id === pinId ? -1 : b.id === pinId ? 1 : 0) || a.y - b.y || a.x - b.x);
  const placed = [];
  for (const b of order) {
    b.w = Math.max(1, Math.min(COLS, b.w));
    b.x = Math.max(0, Math.min(COLS - b.w, b.x));
    b.y = Math.max(0, b.y);
    let hit;
    let guard = 0;
    while ((hit = placed.find(p => overlaps(p, b))) && guard++ < 1000) b.y = hit.y + hit.h;
    placed.push(b);
  }
}

export const bottom = (blocks) => blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0);

export function rank(blocks) {
  const r = new Map();
  [...blocks].sort((a, b) => a.y - b.y || a.x - b.x).forEach((b, i) => r.set(b.id, i));
  return r;
}
