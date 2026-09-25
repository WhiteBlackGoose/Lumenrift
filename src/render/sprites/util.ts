// Shared helpers for procedural art: colour math, deterministic hashing, offscreen caching, faceted fills.

export type RGB = [number, number, number];

const parsed = new Map<string, RGB>();
export function rgbOf(hex: string): RGB {
  let v = parsed.get(hex);
  if (v) return v;
  if (hex.startsWith('rgb')) {
    const m = hex.match(/[\d.]+/g)!.map(Number);
    v = [m[0], m[1], m[2]];
    parsed.set(hex, v);
    return v;
  }
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  v = [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  parsed.set(hex, v);
  return v;
}

const mixCache = new Map<string, string>();
/** Mix two hex colours; k=0 → a, k=1 → b. Returns css rgb(). */
export function mix(a: string, b: string, k: number): string {
  const key = a + b + Math.round(k * 100);
  let s = mixCache.get(key);
  if (s) return s;
  const A = rgbOf(a),
    B = rgbOf(b);
  const kk = Math.max(0, Math.min(1, Math.round(k * 100) / 100));
  s = `rgb(${Math.round(A[0] + (B[0] - A[0]) * kk)},${Math.round(A[1] + (B[1] - A[1]) * kk)},${Math.round(A[2] + (B[2] - A[2]) * kk)})`;
  mixCache.set(key, s);
  return s;
}

/** k > 0 lightens toward white, k < 0 darkens toward black. */
export function shade(hex: string, k: number): string {
  return k >= 0 ? mix(hex, '#ffffff', k) : mix(hex, '#000000', -k);
}

const rgbaCache = new Map<string, string>();
export function rgba(hex: string, a: number): string {
  const key = hex + Math.round(a * 100);
  let s = rgbaCache.get(key);
  if (s) return s;
  const [r, g, b] = rgbOf(hex);
  s = `rgba(${r},${g},${b},${Math.max(0, Math.min(1, Math.round(a * 100) / 100))})`;
  rgbaCache.set(key, s);
  return s;
}

/** Deterministic hash → [0,1). */
export function hash(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Tiny seeded PRNG for decoration. */
export class TRng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
}

/** Quantised pixel scale of the current transform (quarter-octave buckets). */
export function pxOf(ctx: CanvasRenderingContext2D): number {
  const m = ctx.getTransform();
  const a = Math.hypot(m.a, m.b) || 1;
  return Math.max(4, Math.min(256, Math.pow(2, Math.round(Math.log2(a) * 4) / 4)));
}

const cache = new Map<string, HTMLCanvasElement>();
/**
 * Returns an offscreen canvas that covers the local region [ox, ox+w] x [oy, oy+h] (tile units)
 * rendered at `px` pixels per unit. `draw` receives a ctx already scaled to tile units with the
 * local origin at (0,0).
 */
export function cached(
  key: string,
  px: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const k = key + '@' + px;
  let cv = cache.get(k);
  if (cv) return cv;
  if (cache.size > 700) cache.clear();
  cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * px));
  cv.height = Math.max(1, Math.ceil(h * px));
  const c = cv.getContext('2d')!;
  c.scale(px, px);
  c.translate(-ox, -oy);
  draw(c);
  cache.set(k, cv);
  return cv;
}

/** Draw a cached region at world position (x,y) = local origin. */
export function blit(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement, x: number, y: number, ox: number, oy: number, w: number, h: number) {
  ctx.drawImage(cv, x + ox, y + oy, w, h);
}

/**
 * Faceted ("low-poly") polygon fill: triangles from an apex to every edge, each shaded by how
 * much the edge faces the light (from the upper-left).
 */
export function facet(
  c: CanvasRenderingContext2D,
  pts: [number, number][],
  ax: number,
  ay: number,
  color: string,
  strength = 0.35,
  outline: string | null = null,
  lw = 0.03,
) {
  const lx = -0.55,
    ly = -0.83;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const mx = (x1 + x2) / 2 - ax,
      my = (y1 + y2) / 2 - ay;
    const ml = Math.hypot(mx, my) || 1;
    const d = (mx / ml) * lx + (my / ml) * ly;
    c.fillStyle = shade(color, d * strength);
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(x1, y1);
    c.lineTo(x2, y2);
    c.closePath();
    c.fill();
    // hairline stroke in same colour hides AA seams between facets
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 0.008;
    c.stroke();
  }
  if (outline) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.strokeStyle = outline;
    c.lineWidth = lw;
    c.stroke();
  }
}

export function poly(c: CanvasRenderingContext2D, pts: [number, number][]) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

export function ngon(cx: number, cy: number, r: number, n: number, rot = 0, sy = 1): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * sy]);
  }
  return out;
}

/** Soft radial glow (normal composite). */
export function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0 || r <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.4, rgba(color, a * 0.45));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
