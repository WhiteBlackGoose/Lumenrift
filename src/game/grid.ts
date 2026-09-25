import { CORE_X, CORE_Y, MAP_H, MAP_W } from './config';
import { Rng } from './rng';

export enum Terrain {
  Grass = 0,
  Rock = 1,
  Crystal = 2,
  Core = 3,
  Rift = 4,
}

export const INF = 1e9;

export interface MapData {
  w: number;
  h: number;
  terrain: Uint8Array;
  /** Rift tiles in the order they open. */
  rifts: { x: number; y: number }[];
  /** Per-tile random value for decoration variety. */
  noise: Float32Array;
}

export function idx(x: number, y: number): number {
  return y * MAP_W + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

export function isCoreTile(x: number, y: number): boolean {
  return Math.abs(x - CORE_X) <= 1 && Math.abs(y - CORE_Y) <= 1;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];
export { DIRS };

/** Min-heap keyed by float priority, storing tile indices. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.v.length;
  }
  push(key: number, val: number) {
    const k = this.k,
      v = this.v;
    let i = v.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k,
      v = this.v;
    const top = v[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    const n = v.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

/**
 * Dijkstra flow field toward the core. `cost(i)` returns the cost of entering tile i,
 * or INF if impassable. Diagonal steps are only allowed when both orthogonal neighbours
 * are passable (no corner cutting).
 */
export function computeFlow(cost: (i: number) => number, out: Float32Array): Float32Array {
  out.fill(INF);
  const heap = new Heap();
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const i = idx(CORE_X + dx, CORE_Y + dy);
      out[i] = 0;
      heap.push(0, i);
    }
  while (heap.size) {
    const i = heap.pop();
    const d = out[i];
    const x = i % MAP_W,
      y = (i / MAP_W) | 0;
    for (const [dx, dy, len] of DIRS) {
      const nx = x + dx,
        ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      const c = cost(ni);
      if (c >= INF) continue;
      if (dx !== 0 && dy !== 0) {
        const a = idx(x + dx, y),
          b = idx(x, y + dy);
        if ((cost(a) >= INF && !isCoreIdx(a)) || (cost(b) >= INF && !isCoreIdx(b))) continue;
      }
      const nd = d + c * len;
      if (nd < out[ni]) {
        out[ni] = nd;
        heap.push(nd, ni);
      }
    }
  }
  return out;
}

function isCoreIdx(i: number): boolean {
  return isCoreTile(i % MAP_W, (i / MAP_W) | 0);
}

/** Procedurally generate a map: rock outcrops, crystal veins, and rift sites along the edges. */
export function generateMap(seed: number): MapData {
  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = new Rng(seed + attempt * 7919);
    const m = tryGenerate(rng);
    if (m) return m;
  }
  // Extremely unlikely; fall back to an empty field.
  return tryGenerate(new Rng(seed), true)!;
}

function tryGenerate(rng: Rng, empty = false): MapData | null {
  const w = MAP_W,
    h = MAP_H;
  const terrain = new Uint8Array(w * h);
  const noise = new Float32Array(w * h);
  for (let i = 0; i < noise.length; i++) noise[i] = rng.next();

  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) terrain[idx(CORE_X + dx, CORE_Y + dy)] = Terrain.Core;

  // Rift sites: one per side-ish, shuffled so each run feels different, first rift on left or right.
  const cy = CORE_Y,
    cx = CORE_X;
  const sites = [
    { x: 0, y: cy + rng.int(-4, 4) },
    { x: w - 1, y: cy + rng.int(-4, 4) },
    { x: cx + rng.int(-10, -3), y: 0 },
    { x: cx + rng.int(3, 10), y: h - 1 },
    { x: cx + rng.int(3, 12), y: 0 },
    { x: cx + rng.int(-12, -3), y: h - 1 },
  ];
  const first = rng.chance(0.5) ? 0 : 1;
  const second = 1 - first;
  const rest = [2, 3, 4, 5];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const order = [first, rest[0], second, ...rest.slice(1)];
  const rifts = order.map((o) => sites[o]);
  for (const r of rifts) terrain[idx(r.x, r.y)] = Terrain.Rift;

  const nearRift = (x: number, y: number, d: number) => rifts.some((r) => Math.abs(r.x - x) <= d && Math.abs(r.y - y) <= d);
  const nearCore = (x: number, y: number, d: number) => Math.abs(x - cx) <= d && Math.abs(y - cy) <= d;

  if (!empty) {
    // Rock outcrops via short random walks.
    const clusters = rng.int(9, 13);
    for (let c = 0; c < clusters; c++) {
      let x = rng.int(1, w - 2),
        y = rng.int(1, h - 2);
      const len = rng.int(3, 8);
      for (let s = 0; s < len; s++) {
        if (inBounds(x, y) && terrain[idx(x, y)] === Terrain.Grass && !nearCore(x, y, 3) && !nearRift(x, y, 2)) {
          terrain[idx(x, y)] = Terrain.Rock;
        }
        if (rng.chance(0.5)) x += rng.chance(0.5) ? 1 : -1;
        else y += rng.chance(0.5) ? 1 : -1;
      }
    }
    // Crystal veins: pairs of tiles at mid distance from the core.
    let placed = 0,
      tries = 0;
    while (placed < 6 && tries++ < 400) {
      const x = rng.int(2, w - 3),
        y = rng.int(2, h - 3);
      const d = Math.hypot(x - cx, y - cy);
      if (d < 4.5 || d > 13) continue;
      if (terrain[idx(x, y)] !== Terrain.Grass || nearRift(x, y, 3)) continue;
      terrain[idx(x, y)] = Terrain.Crystal;
      const [dx, dy] = rng.pick([
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]);
      if (terrain[idx(x + dx, y + dy)] === Terrain.Grass) terrain[idx(x + dx, y + dy)] = Terrain.Crystal;
      placed++;
    }
  }

  // Verify every rift can reach the core.
  const flow = computeFlow((i) => (terrain[i] === Terrain.Rock ? INF : 1), new Float32Array(w * h));
  for (const r of rifts) if (flow[idx(r.x, r.y)] >= INF) return null;

  return { w, h, terrain, rifts, noise };
}
