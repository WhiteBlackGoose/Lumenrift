import { CORE_X, CORE_Y, Realm } from '../../game/config';
import { MapData, Terrain } from '../../game/grid';
import { facet, glow, mix, ngon, rgba, shade, TRng } from './util';

const GROUND = ['#141d22', '#161b26', '#181a29', '#13201f', '#171f24'];

const TAU = Math.PI * 2;

/** Render the static terrain of the whole map to an offscreen canvas at `px` pixels per tile. */
export interface Ground {
  /** The playable field at full resolution (world rect 0,0 – map.w,map.h). */
  inner: HTMLCanvasElement;
  /** The field plus `margin` tiles of scenery on every side, at lower resolution. */
  outer: HTMLCanvasElement;
  margin: number;
  /** Colour the outer scenery fades into at its far edges. */
  base: string;
}

/** Tiles of decorative scenery generated around the playable field. */
export const GROUND_MARGIN = 14;

/**
 * Render the ground so the landscape continues seamlessly past the playable field.
 * Both canvases are painted from the same extended terrain with the same random sequence, so the
 * high-resolution field and the low-resolution surroundings line up exactly at the border.
 */
export function renderGround(map: MapData, px: number, realm: Realm = 'night'): Ground {
  const M = GROUND_MARGIN;
  const ext = extendMap(map, M, realm);
  const paint = (cv: HTMLCanvasElement, scale: number, ox: number, oy: number) => {
    const c = cv.getContext('2d')!;
    c.scale(scale, scale);
    c.translate(-ox, -oy);
    if (realm === 'day') renderDay(c, ext, M);
    else renderNight(c, ext, M);
    return c;
  };
  const inner = document.createElement('canvas');
  inner.width = Math.ceil(map.w * px);
  inner.height = Math.ceil(map.h * px);
  paint(inner, px, M, M);
  // the surroundings are scenery: render them at a modest resolution to spare memory
  const po = Math.max(12, Math.min(28, Math.round(px * 0.45)));
  const outer = document.createElement('canvas');
  outer.width = Math.ceil(ext.w * po);
  outer.height = Math.ceil(ext.h * po);
  const oc = paint(outer, po, 0, 0);
  // fade the far rim into the base colour so there is never a hard edge, even fully zoomed out
  const base = realm === 'day' ? '#86b862' : '#10161d';
  oc.setTransform(1, 0, 0, 1, 0, 0);
  const W = outer.width,
    H = outer.height,
    f = po * 4;
  const fade = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const g = oc.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, base);
    g.addColorStop(1, base + '00');
    oc.fillStyle = g;
    oc.fillRect(rx, ry, rw, rh);
  };
  fade(0, 0, 0, f, 0, 0, W, f);
  fade(0, H, 0, H - f, 0, H - f, W, f);
  fade(0, 0, f, 0, 0, 0, f, H);
  fade(W, 0, W - f, 0, W - f, 0, f, H);
  return { inner, outer, margin: M, base };
}

/**
 * The real map surrounded by generated scenery: open meadow with groves (a forest edge), a few
 * ruins/boulders and ponds. Never crystal, rifts or a core, so nothing outside looks playable.
 */
function extendMap(map: MapData, M: number, realm: Realm): MapData {
  const w = map.w + 2 * M,
    h = map.h + 2 * M;
  const terrain = new Uint8Array(w * h);
  const noise = new Float32Array(w * h);
  const r = new TRng(Math.floor(map.noise[1] * 1e9) ^ 0x0b0e);
  for (let i = 0; i < noise.length; i++) noise[i] = r.next();
  const inside = (x: number, y: number) => x >= M && y >= M && x < M + map.w && y < M + map.h;
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      terrain[(y + M) * w + x + M] = map.terrain[y * map.w + x];
      noise[(y + M) * w + x + M] = map.noise[y * map.w + x];
    }
  // keep a one-tile strip next to the field clear so rifts and paths open onto grass
  const nearField = (x: number, y: number) => x >= M - 2 && y >= M - 2 && x < M + map.w + 2 && y < M + map.h + 2;
  const put = (x: number, y: number, t: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h || inside(x, y) || nearField(x, y)) return;
    terrain[y * w + x] = t;
  };
  const dist = (x: number, y: number) => Math.max(M - x, x - (M + map.w - 1), M - y, y - (M + map.h - 1), 0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (inside(x, y)) continue;
      // groves get denser further from the field, framing it with a forest edge
      const d = dist(x, y);
      const pTree = (realm === 'day' ? 0.05 : 0.04) + Math.min(0.32, d * 0.025);
      if (r.next() < pTree * 0.35) {
        const n = 1 + Math.floor(r.next() * 4);
        for (let k = 0; k < n; k++) put(x + Math.floor(r.next() * 3) - 1, y + Math.floor(r.next() * 3) - 1, Terrain.Tree);
      } else if (r.next() < 0.012) put(x, y, Terrain.Rock);
    }
  for (let p = 0; p < 7; p++) {
    let x = Math.floor(r.next() * w),
      y = Math.floor(r.next() * h);
    if (inside(x, y) || nearField(x, y)) continue;
    const size = 3 + Math.floor(r.next() * 6);
    for (let k = 0; k < size; k++) {
      put(x, y, Terrain.Water);
      x += Math.floor(r.next() * 3) - 1;
      y += Math.floor(r.next() * 3) - 1;
    }
  }
  return { w, h, terrain, noise, rifts: map.rifts.map((q) => ({ x: q.x + M, y: q.y + M })) };
}

type TFn = (x: number, y: number) => number;

function renderNight(c: CanvasRenderingContext2D, map: MapData, off = 0) {
  const W = map.w,
    H = map.h;
  const T = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? Terrain.Grass : map.terrain[y * W + x]);
  const N = (x: number, y: number) => map.noise[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  const rng = new TRng(Math.floor(map.noise[0] * 1e9) ^ 0x5eed);

  // 1. base + per-tile tint
  c.fillStyle = '#12181f';
  c.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = N(x, y);
      c.fillStyle = GROUND[Math.floor(n * GROUND.length) % GROUND.length];
      c.globalAlpha = 0.7;
      c.fillRect(x - 0.02, y - 0.02, 1.04, 1.04);
    }
  c.globalAlpha = 1;

  // 2. large soft colour blobs blend the tiles into a natural field
  for (let i = 0; i < 90; i++) {
    const x = rng.range(-2, W + 2),
      y = rng.range(-2, H + 2);
    const r = rng.range(1.5, 5);
    const col = rng.next() < 0.55 ? '#20403a' : rng.next() < 0.5 ? '#2a2445' : '#1a2a3e';
    glow(c, x, y, r, col, rng.range(0.18, 0.35));
  }
  // darker dirt patches
  for (let i = 0; i < 40; i++) {
    glow(c, rng.range(0, W), rng.range(0, H), rng.range(0.8, 2.2), '#07090d', rng.range(0.15, 0.3));
  }

  // 3. flagstone plaza around the Beacon
  const pcx = CORE_X + 0.5 + off,
    pcy = CORE_Y + 0.5 + off;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = T(x, y);
      if (t !== Terrain.Grass && t !== Terrain.Core && t !== Terrain.Crystal) continue;
      const d = Math.hypot(x + 0.5 - pcx, (y + 0.5 - pcy) * 1.15);
      const n = N(x, y);
      const edge = 3.2 + n * 1.8;
      if (d > edge) continue;
      const fade = Math.min(1, (edge - d) / 1.2);
      const r = new TRng(x * 7919 + y * 104729);
      // split some tiles into two or four slabs
      const split = n < 0.35 ? 1 : n < 0.7 ? 2 : 4;
      const slabs: [number, number, number, number][] =
        split === 1
          ? [[0, 0, 1, 1]]
          : split === 2
            ? n < 0.52
              ? [
                  [0, 0, 0.55, 1],
                  [0.55, 0, 0.45, 1],
                ]
              : [
                  [0, 0, 1, 0.45],
                  [0, 0.45, 1, 0.55],
                ]
            : [
                [0, 0, 0.5, 0.5],
                [0.5, 0, 0.5, 0.5],
                [0, 0.5, 0.5, 0.5],
                [0.5, 0.5, 0.5, 0.5],
              ];
      for (const [sx, sy, sw, sh] of slabs) {
        const j = () => r.range(-0.025, 0.025);
        const g = 0.045;
        const pts: [number, number][] = [
          [x + sx + g + j(), y + sy + g + j()],
          [x + sx + sw - g + j(), y + sy + g + j()],
          [x + sx + sw - g + j(), y + sy + sh - g + j()],
          [x + sx + g + j(), y + sy + sh - g + j()],
        ];
        c.globalAlpha = fade * (0.35 + r.next() * 0.25);
        const base = mix('#262c3c', '#2c3440', r.next());
        c.fillStyle = base;
        c.beginPath();
        pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
        c.closePath();
        c.fill();
        // top-left bevel highlight
        c.strokeStyle = 'rgba(160,170,200,0.10)';
        c.lineWidth = 0.025;
        c.beginPath();
        c.moveTo(pts[3][0], pts[3][1]);
        c.lineTo(pts[0][0], pts[0][1]);
        c.lineTo(pts[1][0], pts[1][1]);
        c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.35)';
        c.beginPath();
        c.moveTo(pts[1][0], pts[1][1]);
        c.lineTo(pts[2][0], pts[2][1]);
        c.lineTo(pts[3][0], pts[3][1]);
        c.stroke();
        if (r.next() < 0.25) {
          // moss in the cracks
          c.fillStyle = 'rgba(60,110,80,0.35)';
          c.beginPath();
          c.ellipse(pts[2][0] - 0.05, pts[2][1] - 0.03, 0.09, 0.04, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  c.globalAlpha = 1;

  // 4. faint tile grid
  c.strokeStyle = 'rgba(180,200,255,0.035)';
  c.lineWidth = 0.02;
  c.beginPath();
  for (let x = 1; x < W; x++) {
    c.moveTo(x, 0);
    c.lineTo(x, H);
  }
  for (let y = 1; y < H; y++) {
    c.moveTo(0, y);
    c.lineTo(W, y);
  }
  c.stroke();

  // 5. decoration on open ground
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = T(x, y);
      if (t !== Terrain.Grass) continue;
      const d = Math.hypot(x + 0.5 - pcx, (y + 0.5 - pcy) * 1.15);
      const r = new TRng(x * 3301 + y * 7727 + 13);
      const inPlaza = d < 3.4;
      if (!inPlaza && r.next() < 0.14) {
        // moss patch
        c.fillStyle = rgba('#2a4a3a', 0.45);
        c.beginPath();
        c.ellipse(x + r.range(0.2, 0.8), y + r.range(0.2, 0.8), r.range(0.12, 0.3), r.range(0.07, 0.15), r.range(0, 3), 0, Math.PI * 2);
        c.fill();
      }
      const tufts = inPlaza ? (r.next() < 0.15 ? 1 : 0) : r.next() < 0.45 ? 1 + Math.floor(r.next() * 3) : 0;
      for (let k = 0; k < tufts; k++) {
        const bx = x + r.range(0.12, 0.88),
          by = y + r.range(0.2, 0.92);
        const col = r.next() < 0.5 ? '#2f5446' : '#3b5a52';
        c.strokeStyle = col;
        c.lineWidth = 0.022;
        c.lineCap = 'round';
        const blades = 3 + Math.floor(r.next() * 3);
        for (let q = 0; q < blades; q++) {
          const a = -Math.PI / 2 + (q - (blades - 1) / 2) * 0.35 + r.range(-0.1, 0.1);
          const len = r.range(0.07, 0.15);
          c.beginPath();
          c.moveTo(bx, by);
          c.quadraticCurveTo(bx + Math.cos(a) * len * 0.5, by + Math.sin(a) * len * 0.6, bx + Math.cos(a) * len + 0.02, by + Math.sin(a) * len);
          c.stroke();
        }
      }
      if (r.next() < 0.18) {
        // pebbles
        const n = 1 + Math.floor(r.next() * 3);
        for (let k = 0; k < n; k++) {
          const px2 = x + r.range(0.15, 0.85),
            py2 = y + r.range(0.15, 0.85),
            pr = r.range(0.025, 0.055);
          c.fillStyle = 'rgba(0,0,0,0.35)';
          c.beginPath();
          c.ellipse(px2 + 0.012, py2 + 0.015, pr, pr * 0.7, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = mix('#2c3142', '#3c4256', r.next());
          c.beginPath();
          c.ellipse(px2, py2, pr, pr * 0.7, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(200,210,255,0.12)';
          c.beginPath();
          c.ellipse(px2 - pr * 0.3, py2 - pr * 0.3, pr * 0.4, pr * 0.25, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
      if (r.next() < 0.07) {
        // crack
        c.strokeStyle = 'rgba(5,7,12,0.55)';
        c.lineWidth = 0.02;
        let cx2 = x + r.range(0.2, 0.8),
          cy2 = y + r.range(0.2, 0.8);
        c.beginPath();
        c.moveTo(cx2, cy2);
        for (let q = 0; q < 4; q++) {
          cx2 += r.range(-0.14, 0.14);
          cy2 += r.range(-0.14, 0.14);
          c.lineTo(cx2, cy2);
        }
        c.stroke();
      }
      if (!inPlaza && r.next() < 0.05) {
        // tiny bioluminescent mushrooms
        const col = r.next() < 0.5 ? '#6fe0c8' : '#b58cff';
        const n = 1 + Math.floor(r.next() * 3);
        const mx = x + r.range(0.25, 0.75),
          my = y + r.range(0.3, 0.8);
        glow(c, mx, my - 0.03, 0.28, col, 0.22);
        for (let k = 0; k < n; k++) {
          const ox = mx + r.range(-0.1, 0.1),
            oy = my + r.range(-0.05, 0.08);
          const s = r.range(0.025, 0.045);
          c.strokeStyle = '#8a8f9e';
          c.lineWidth = 0.012;
          c.beginPath();
          c.moveTo(ox, oy);
          c.lineTo(ox, oy - s * 1.4);
          c.stroke();
          c.fillStyle = col;
          c.beginPath();
          c.ellipse(ox, oy - s * 1.4, s, s * 0.6, 0, Math.PI, 0);
          c.fill();
        }
      }
      if (!inPlaza && r.next() < 0.06) {
        // fallen twig
        const tx = x + r.range(0.2, 0.8),
          ty = y + r.range(0.2, 0.8),
          ta = r.range(0, Math.PI);
        c.strokeStyle = 'rgba(70,55,50,0.7)';
        c.lineWidth = 0.022;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(tx - Math.cos(ta) * 0.18, ty - Math.sin(ta) * 0.18);
        c.lineTo(tx + Math.cos(ta) * 0.18, ty + Math.sin(ta) * 0.18);
        c.moveTo(tx + Math.cos(ta) * 0.05, ty + Math.sin(ta) * 0.05);
        c.lineTo(tx + Math.cos(ta + 0.7) * 0.14, ty + Math.sin(ta + 0.7) * 0.14);
        c.stroke();
      }
      if (!inPlaza && r.next() < 0.05) {
        // little fern curl
        const fx = x + r.range(0.25, 0.75),
          fy = y + r.range(0.35, 0.8);
        c.strokeStyle = 'rgba(55,95,80,0.75)';
        c.lineWidth = 0.02;
        for (const s of [-1, 1]) {
          c.beginPath();
          c.moveTo(fx, fy);
          c.quadraticCurveTo(fx + s * 0.12, fy - 0.12, fx + s * 0.06, fy - 0.2);
          c.stroke();
          for (let q = 1; q <= 3; q++) {
            const k = q / 4;
            const bx = fx + s * 0.1 * k,
              by = fy - 0.17 * k;
            c.beginPath();
            c.moveTo(bx, by);
            c.lineTo(bx + s * 0.06, by - 0.02);
            c.stroke();
          }
        }
      }
      if (!inPlaza && r.next() < 0.012) {
        // old rune stone, faintly glowing
        const sx = x + 0.5,
          sy = y + 0.55;
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.beginPath();
        c.ellipse(sx + 0.03, sy + 0.05, 0.17, 0.08, 0, 0, TAU);
        c.fill();
        facet(c, ngon(sx, sy, 0.15, 6, r.next(), 0.6), sx - 0.04, sy - 0.04, '#3a4054', 0.35);
        glow(c, sx, sy, 0.25, '#9a8cff', 0.18);
        c.strokeStyle = 'rgba(170,160,255,0.55)';
        c.lineWidth = 0.014;
        c.beginPath();
        c.moveTo(sx - 0.05, sy - 0.03);
        c.lineTo(sx, sy + 0.03);
        c.lineTo(sx + 0.05, sy - 0.03);
        c.moveTo(sx, sy - 0.05);
        c.lineTo(sx, sy + 0.03);
        c.stroke();
      }
    }

  // 5b. still, dark pools
  drawWater(c, map, T, N, {
    rim: '#24323f',
    rimHi: 'rgba(130,175,225,0.38)',
    water: '#163049',
    deep: '#0c1d30',
    shine: 'rgba(160,200,245,0.3)',
  });
  waterDecor(c, map, T, 'night');

  // 6. crystal veins
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (T(x, y) !== Terrain.Crystal) continue;
      const r = new TRng(x * 911 + y * 3571 + 7);
      const cx = x + 0.5,
        cy = y + 0.55;
      c.fillStyle = 'rgba(8,24,32,0.75)';
      c.beginPath();
      c.ellipse(cx, cy, 0.46, 0.4, 0, 0, Math.PI * 2);
      c.fill();
      glow(c, cx, cy, 0.8, '#3fd0ff', 0.28);
      // glowing veins spreading out
      c.lineCap = 'round';
      for (let v = 0; v < 3; v++) {
        let vx = cx + r.range(-0.1, 0.1),
          vy = cy + r.range(-0.05, 0.1);
        const a0 = r.range(0, Math.PI * 2);
        c.beginPath();
        c.moveTo(vx, vy);
        for (let q = 0; q < 3; q++) {
          const a = a0 + r.range(-0.5, 0.5);
          vx += Math.cos(a) * 0.11;
          vy += Math.sin(a) * 0.09;
          c.lineTo(vx, vy);
        }
        c.strokeStyle = 'rgba(102,224,255,0.14)';
        c.lineWidth = 0.045;
        c.stroke();
        c.strokeStyle = 'rgba(160,240,255,0.35)';
        c.lineWidth = 0.012;
        c.stroke();
      }
      // shards
      const n = 4 + Math.floor(r.next() * 3);
      const shards: [number, number, number, number, number][] = [];
      for (let k = 0; k < n; k++) {
        {
          const off = r.range(-0.24, 0.24);
          shards.push([cx + off, cy + r.range(0.0, 0.18), off * 1.6 + r.range(-0.2, 0.2), r.range(0.26, 0.5) * (1 - Math.abs(off)), r.range(0.07, 0.1)]);
        }
      }
      shards.sort((a, b) => a[1] - b[1]);
      for (const [sx, sy, ang, len, wd] of shards) crystalShard(c, sx, sy, ang, len, wd, '#66e0ff');
    }

  // 7. rocks: shadows first, then boulders back-to-front
  const rocks: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T(x, y) === Terrain.Rock) rocks.push([x, y]);
  for (const [x, y] of rocks) {
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath();
    c.ellipse(x + 0.6, y + 0.72, 0.58, 0.36, 0, 0, Math.PI * 2);
    c.fill();
  }
  for (const [x, y] of rocks) {
    const r = new TRng(x * 4099 + y * 2203 + 3);
    const cx = x + 0.5,
      cy = y + 0.45;
    const pts: [number, number][] = [];
    const nv = 7 + Math.floor(r.next() * 3);
    for (let k = 0; k < nv; k++) {
      const a = (k / nv) * Math.PI * 2 + r.range(-0.2, 0.2);
      let rad = r.range(0.42, 0.56);
      const dx = Math.cos(a),
        dy = Math.sin(a);
      // reach toward neighbouring rocks so outcrops merge
      if ((dx > 0.5 && T(x + 1, y) === Terrain.Rock) || (dx < -0.5 && T(x - 1, y) === Terrain.Rock)) rad += 0.14;
      if ((dy > 0.5 && T(x, y + 1) === Terrain.Rock) || (dy < -0.5 && T(x, y - 1) === Terrain.Rock)) rad += 0.14;
      pts.push([cx + dx * rad, cy + dy * rad * 0.9]);
    }
    const base = mix('#363d50', '#433d55', r.next());
    // side/skirt (pseudo height)
    c.fillStyle = shade(base, -0.45);
    c.beginPath();
    pts.forEach(([a, b], i) => (i ? c.lineTo(a, b + 0.1) : c.moveTo(a, b + 0.1)));
    c.closePath();
    c.fill();
    facet(c, pts, cx - 0.1 + r.range(-0.05, 0.05), cy - 0.12, base, 0.45, 'rgba(8,8,16,0.8)', 0.02);
    // secondary smaller facet cap
    const cap = ngon(cx - 0.06, cy - 0.1, r.range(0.16, 0.22), 5, r.range(0, 1), 0.85);
    facet(c, cap, cx - 0.12, cy - 0.18, shade(base, 0.12), 0.4);
    // moss specks on top
    if (r.next() < 0.6) {
      c.fillStyle = 'rgba(70,120,90,0.55)';
      for (let k = 0; k < 4; k++) {
        c.beginPath();
        c.ellipse(cx + r.range(-0.25, 0.15), cy + r.range(-0.3, -0.05), r.range(0.03, 0.07), r.range(0.02, 0.04), 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (r.next() < 0.5) {
      // pebble beside
      const pxx = cx + r.range(-0.45, 0.45),
        pyy = y + 0.92;
      facet(c, ngon(pxx, pyy, 0.07, 5, r.next(), 0.7), pxx - 0.02, pyy - 0.03, base, 0.4);
    }
  }

  // 7b. gnarled dead trees
  drawTrees(c, map, T, 'night');

}

/** A single faceted crystal shard standing on (x,y), leaning by `ang`. */
export function crystalShard(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wd: number, col: string) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const tip = -len;
  // left face
  c.fillStyle = shade(col, 0.55);
  c.beginPath();
  c.moveTo(0, 0.02);
  c.lineTo(-wd, -len * 0.25);
  c.lineTo(-wd * 0.7, tip * 0.8);
  c.lineTo(0, tip);
  c.closePath();
  c.fill();
  // right face
  c.fillStyle = shade(col, -0.15);
  c.beginPath();
  c.moveTo(0, 0.02);
  c.lineTo(wd, -len * 0.25);
  c.lineTo(wd * 0.7, tip * 0.8);
  c.lineTo(0, tip);
  c.closePath();
  c.fill();
  c.strokeStyle = shade(col, 0.8);
  c.lineWidth = 0.012;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, tip);
  c.stroke();
  c.strokeStyle = rgba('#051018', 0.6);
  c.lineWidth = 0.012;
  c.beginPath();
  c.moveTo(0, 0.02);
  c.lineTo(-wd, -len * 0.25);
  c.lineTo(-wd * 0.7, tip * 0.8);
  c.lineTo(0, tip);
  c.lineTo(wd * 0.7, tip * 0.8);
  c.lineTo(wd, -len * 0.25);
  c.closePath();
  c.stroke();
  c.restore();
}

// ====================================================================== shared: ponds

interface WaterPal {
  rim: string;
  rimHi: string;
  water: string;
  deep: string;
  shine: string;
}

function waterTiles(map: MapData, T: TFn): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (T(x, y) === Terrain.Water) out.push([x, y]);
  return out;
}

/**
 * Union of rounded blobs over all water tiles so adjacent tiles merge into one organic pond.
 * `grow` inflates the shape (rim / shore), negative values shrink it (deep middle).
 */
function pondPath(map: MapData, T: TFn, N: TFn, grow: number): Path2D {
  // A lattice of overlapping circles (tile centres, edge midpoints, 2x2 centres) gives one smooth,
  // gently scalloped shoreline with no straight tile edges.
  const p = new Path2D();
  const W = (x: number, y: number) => T(x, y) === Terrain.Water;
  const circ = (x: number, y: number, r: number) => {
    if (r <= 0.04) return;
    p.moveTo(x + r, y);
    p.arc(x, y, r, 0, TAU);
  };
  for (const [x, y] of waterTiles(map, T)) {
    const cx = x + 0.5,
      cy = y + 0.5;
    const n = (N(x, y) - 0.5) * 0.08;
    const R = 0.5 + grow + n;
    circ(cx, cy, R);
    if (W(x + 1, y)) circ(cx + 0.5, cy + n * 0.5, R * 0.97);
    if (W(x, y + 1)) circ(cx - n * 0.5, cy + 0.5, R * 0.97);
    if (W(x + 1, y) && W(x, y + 1) && W(x + 1, y + 1)) circ(cx + 0.5, cy + 0.5, R * 1.05);
    // a small wobbly bump on open shores
    const r2 = new TRng(x * 6151 + y * 911);
    const ba = r2.range(0, TAU);
    circ(cx + Math.cos(ba) * 0.2, cy + Math.sin(ba) * 0.2, R * 0.75);
  }
  return p;
}

function drawWater(c: CanvasRenderingContext2D, map: MapData, T: TFn, N: TFn, pal: WaterPal) {
  if (!waterTiles(map, T).length) return;
  const rim = pondPath(map, T, N, 0.12);
  const body = pondPath(map, T, N, 0);
  const deep = pondPath(map, T, N, -0.24);
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.translate(0.03, 0.05);
  c.fill(rim);
  c.translate(-0.03, -0.05);
  c.fillStyle = pal.rim;
  c.fill(rim);
  // light catching the upper shore
  c.fillStyle = pal.rimHi;
  c.translate(-0.02, -0.035);
  c.fill(pondPath(map, T, N, 0.04));
  c.translate(0.02, 0.035);
  c.fillStyle = pal.water;
  c.fill(body);
  c.globalAlpha = 0.45;
  c.fillStyle = pal.deep;
  c.fill(pondPath(map, T, N, -0.12));
  c.globalAlpha = 0.7;
  c.fill(deep);
  c.globalAlpha = 1;
  c.clip(body);
  // reflections: soft horizontal glints
  for (const [x, y] of waterTiles(map, T)) {
    const r = new TRng(x * 733 + y * 389 + 5);
    if (r.next() < 0.6) {
      c.strokeStyle = pal.shine;
      c.lineWidth = 0.035;
      c.lineCap = 'round';
      const gx = x + r.range(0.2, 0.6),
        gy = y + r.range(0.25, 0.75);
      c.beginPath();
      c.moveTo(gx, gy);
      c.lineTo(gx + r.range(0.15, 0.3), gy);
      c.stroke();
    }
  }
  c.restore();
}

/** Things that live in and around ponds: reeds at night; lily pads, sparkles and sand by day. */
function waterDecor(c: CanvasRenderingContext2D, map: MapData, T: TFn, realm: Realm) {
  for (const [x, y] of waterTiles(map, T)) {
    const r = new TRng(x * 211 + y * 1543 + 99);
    const shore =
      T(x + 1, y) !== Terrain.Water || T(x - 1, y) !== Terrain.Water || T(x, y + 1) !== Terrain.Water || T(x, y - 1) !== Terrain.Water;
    if (realm === 'night') {
      if (shore && r.next() < 0.7) {
        // a clump of reeds on the shore side
        const dirs: [number, number][] = [];
        if (T(x + 1, y) !== Terrain.Water) dirs.push([1, 0]);
        if (T(x - 1, y) !== Terrain.Water) dirs.push([-1, 0]);
        if (T(x, y + 1) !== Terrain.Water) dirs.push([0, 1]);
        if (T(x, y - 1) !== Terrain.Water) dirs.push([0, -1]);
        const [dx, dy] = dirs[Math.floor(r.next() * dirs.length)];
        const bx = x + 0.5 + dx * 0.4 + r.range(-0.15, 0.15) * (dy ? 1 : 0),
          by = y + 0.55 + dy * 0.4 + r.range(-0.15, 0.15) * (dx ? 1 : 0);
        c.lineCap = 'round';
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + r.range(-0.45, 0.45);
          const len = r.range(0.18, 0.34);
          c.strokeStyle = k % 2 ? '#2c3b38' : '#38484a';
          c.lineWidth = 0.022;
          c.beginPath();
          c.moveTo(bx + r.range(-0.06, 0.06), by);
          c.quadraticCurveTo(bx + Math.cos(a) * len * 0.5, by + Math.sin(a) * len * 0.5, bx + Math.cos(a) * len, by + Math.sin(a) * len);
          c.stroke();
          if (k === 2) {
            c.fillStyle = '#4a3a30';
            c.beginPath();
            c.ellipse(bx + Math.cos(a) * len, by + Math.sin(a) * len, 0.025, 0.06, a + Math.PI / 2, 0, TAU);
            c.fill();
          }
        }
      }
      if (r.next() < 0.18) {
        // a cold glint of starlight on the water
        const sx = x + r.range(0.3, 0.7),
          sy = y + r.range(0.3, 0.7);
        glow(c, sx, sy, 0.12, '#9ec8ff', 0.4);
      }
    } else {
      if (r.next() < 0.45) {
        // lily pad (maybe flowering)
        const lx = x + r.range(0.25, 0.75),
          ly = y + r.range(0.25, 0.75),
          lr = r.range(0.09, 0.15),
          la = r.range(0, TAU);
        c.fillStyle = 'rgba(20,60,40,0.25)';
        c.beginPath();
        c.ellipse(lx + 0.02, ly + 0.025, lr, lr * 0.85, 0, 0, TAU);
        c.fill();
        c.fillStyle = mix('#4f9a3c', '#6ab34a', r.next());
        c.beginPath();
        c.moveTo(lx, ly);
        c.arc(lx, ly, lr, la + 0.35, la + TAU - 0.05);
        c.closePath();
        c.fill();
        c.strokeStyle = 'rgba(30,70,25,0.5)';
        c.lineWidth = 0.01;
        c.stroke();
        if (r.next() < 0.4) {
          const col = r.next() < 0.5 ? '#ffd0e4' : '#fff6f0';
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU;
            c.fillStyle = col;
            c.beginPath();
            c.ellipse(lx + Math.cos(a) * 0.035, ly + Math.sin(a) * 0.035, 0.035, 0.018, a, 0, TAU);
            c.fill();
          }
          c.fillStyle = '#ffd24a';
          c.beginPath();
          c.arc(lx, ly, 0.018, 0, TAU);
          c.fill();
        }
      }
      if (r.next() < 0.5) {
        // sun sparkle
        const sx = x + r.range(0.2, 0.8),
          sy = y + r.range(0.2, 0.8),
          ss = r.range(0.03, 0.06);
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.beginPath();
        c.moveTo(sx, sy - ss * 1.8);
        c.lineTo(sx + ss * 0.35, sy);
        c.lineTo(sx, sy + ss * 1.8);
        c.lineTo(sx - ss * 0.35, sy);
        c.closePath();
        c.moveTo(sx - ss * 1.8, sy);
        c.lineTo(sx, sy + ss * 0.35);
        c.lineTo(sx + ss * 1.8, sy);
        c.lineTo(sx, sy - ss * 0.35);
        c.closePath();
        c.fill();
      }
    }
  }
}

// ====================================================================== shared: trees

function drawTrees(c: CanvasRenderingContext2D, map: MapData, T: TFn, realm: Realm) {
  const trees: [number, number][] = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (T(x, y) === Terrain.Tree) trees.push([x, y]);
  // shadows first so canopies overlap neighbouring shadows, then trees back-to-front
  for (const [x, y] of trees) {
    const r = new TRng(x * 1999 + y * 271);
    const cx = x + 0.5 + r.range(-0.08, 0.08),
      cy = y + 0.55 + r.range(-0.06, 0.06);
    if (realm === 'day') glowShadow(c, cx + 0.18, cy + 0.22, 0.62, 0.34);
    else glowShadow(c, cx + 0.1, cy + 0.18, 0.55, 0.42);
  }
  for (const [x, y] of trees) {
    const r = new TRng(x * 1999 + y * 271);
    const cx = x + 0.5 + r.range(-0.08, 0.08),
      cy = y + 0.55 + r.range(-0.06, 0.06);
    if (realm === 'day') dayTree(c, cx, cy, r);
    else deadTree(c, cx, cy, r);
  }
}

function glowShadow(c: CanvasRenderingContext2D, x: number, y: number, rx: number, a: number) {
  c.save();
  c.translate(x, y);
  c.scale(1, 0.55);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(0.6, `rgba(0,0,0,${a * 0.6})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, TAU);
  c.fill();
  c.restore();
}

function deadTree(c: CanvasRenderingContext2D, cx: number, cy: number, r: TRng) {
  const bark = mix('#4a4052', '#574a5c', r.next());
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // exposed roots
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + r.range(-0.3, 0.3);
    const len = r.range(0.22, 0.4);
    c.strokeStyle = shade(bark, -0.25);
    c.lineWidth = 0.07;
    c.beginPath();
    c.moveTo(cx, cy + 0.08);
    c.quadraticCurveTo(cx + Math.cos(a) * len * 0.5 + r.range(-0.05, 0.05), cy + 0.1 + Math.sin(a) * len * 0.35, cx + Math.cos(a) * len, cy + 0.1 + Math.sin(a) * len * 0.5);
    c.stroke();
  }
  // trunk
  c.fillStyle = bark;
  c.beginPath();
  c.moveTo(cx - 0.16, cy + 0.12);
  c.quadraticCurveTo(cx - 0.07, cy - 0.1, cx - 0.08, cy - 0.32);
  c.lineTo(cx + 0.08, cy - 0.34);
  c.quadraticCurveTo(cx + 0.08, cy - 0.1, cx + 0.17, cy + 0.12);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(8,6,12,0.8)';
  c.lineWidth = 0.02;
  c.stroke();
  // gnarled branches, recursively
  const branch = (x: number, y: number, a: number, len: number, w: number, d: number) => {
    const bend = r.range(-0.5, 0.5);
    const mx = x + Math.cos(a + bend) * len * 0.5,
      my = y + Math.sin(a + bend) * len * 0.5;
    const ex = x + Math.cos(a) * len,
      ey = y + Math.sin(a) * len;
    c.strokeStyle = 'rgba(8,6,12,0.75)';
    c.lineWidth = w + 0.025;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(mx, my, ex, ey);
    c.stroke();
    c.strokeStyle = shade(bark, 0.1 + d * 0.05);
    c.lineWidth = w;
    c.stroke();
    // cold moonlit edge
    c.strokeStyle = 'rgba(160,175,220,0.22)';
    c.lineWidth = w * 0.35;
    c.beginPath();
    c.moveTo(x - w * 0.25, y - w * 0.25);
    c.quadraticCurveTo(mx - w * 0.25, my - w * 0.25, ex - w * 0.25, ey - w * 0.25);
    c.stroke();
    if (d > 0) {
      const n = d > 1 ? 2 : 1 + (r.next() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) branch(ex, ey, a + r.range(-0.75, 0.75), len * r.range(0.55, 0.75), w * 0.6, d - 1);
    }
  };
  const nb = 3 + Math.floor(r.next() * 2);
  for (let i = 0; i < nb; i++) {
    const a = -Math.PI / 2 + (i - (nb - 1) / 2) * 0.9 + r.range(-0.25, 0.25);
    branch(cx + r.range(-0.03, 0.03), cy - 0.3, a, r.range(0.26, 0.38), 0.085, 2);
  }
  // pale lichen and a hanging moss strand
  c.fillStyle = 'rgba(150,170,150,0.35)';
  c.beginPath();
  c.ellipse(cx - 0.04, cy - 0.12, 0.035, 0.06, 0.2, 0, TAU);
  c.fill();
  if (r.next() < 0.5) glow(c, cx + r.range(-0.3, 0.3), cy - r.range(0.3, 0.5), 0.12, '#7fd8c0', 0.25);
}

function dayTree(c: CanvasRenderingContext2D, cx: number, cy: number, r: TRng) {
  const blossom = r.next() < 0.28;
  const greens = ['#4e8a3a', '#5b9a42', '#4a8040'];
  const leaf = greens[Math.floor(r.next() * greens.length)];
  const crown = blossom ? (r.next() < 0.5 ? '#f0a8c4' : '#f6d2e2') : leaf;
  // trunk peeking out under the canopy
  c.fillStyle = '#6a4a30';
  c.beginPath();
  c.moveTo(cx - 0.07, cy + 0.12);
  c.lineTo(cx - 0.05, cy - 0.1);
  c.lineTo(cx + 0.05, cy - 0.1);
  c.lineTo(cx + 0.08, cy + 0.12);
  c.closePath();
  c.fill();
  const ccx = cx,
    ccy = cy - 0.24;
  const R = r.range(0.44, 0.54);
  // canopy: overlapping puffs, darker underneath, lit from the upper left
  const puffs: [number, number, number][] = [[ccx, ccy, R * 0.75]];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.range(-0.3, 0.3);
    puffs.push([ccx + Math.cos(a) * R * 0.5, ccy + Math.sin(a) * R * 0.45, R * r.range(0.42, 0.55)]);
  }
  c.fillStyle = shade(blossom ? leaf : crown, -0.35);
  for (const [x, y, rr] of puffs) {
    c.beginPath();
    c.arc(x + 0.02, y + 0.05, rr, 0, TAU);
    c.fill();
  }
  for (const [x, y, rr] of puffs) {
    const g = c.createRadialGradient(x - rr * 0.4, y - rr * 0.45, rr * 0.1, x, y, rr);
    g.addColorStop(0, shade(crown, 0.28));
    g.addColorStop(0.6, crown);
    g.addColorStop(1, shade(crown, -0.18));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, rr, 0, TAU);
    c.fill();
  }
  c.strokeStyle = rgba(shade(crown, -0.55), 0.45);
  c.lineWidth = 0.018;
  for (const [x, y, rr] of puffs.slice(1)) {
    c.beginPath();
    c.arc(x, y, rr, 0.2, Math.PI - 0.2);
    c.stroke();
  }
  // leaf / petal speckles
  for (let k = 0; k < 9; k++) {
    const a = r.range(0, TAU),
      d = r.range(0, R * 0.85);
    c.fillStyle = blossom ? (r.next() < 0.5 ? '#ffffff' : '#ffc0d8') : rgba(shade(crown, 0.45), 0.8);
    c.beginPath();
    c.arc(ccx + Math.cos(a) * d, ccy + Math.sin(a) * d * 0.9, 0.022, 0, TAU);
    c.fill();
  }
  if (blossom) {
    // fallen petals on the grass
    for (let k = 0; k < 6; k++) {
      c.fillStyle = r.next() < 0.5 ? 'rgba(255,200,220,0.85)' : 'rgba(255,240,245,0.85)';
      c.beginPath();
      c.ellipse(cx + r.range(-0.55, 0.55), cy + r.range(0.1, 0.42), 0.025, 0.014, r.range(0, 3), 0, TAU);
      c.fill();
    }
  }
}

// ====================================================================== day: a sunlit sky-island meadow

const DAY_GRASS = ['#8cbc66', '#86b862', '#92c06c', '#88b964', '#8fbd68'];

function renderDay(c: CanvasRenderingContext2D, map: MapData, off = 0) {
  const W = map.w,
    H = map.h;
  const T = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? Terrain.Grass : map.terrain[y * W + x]);
  const N = (x: number, y: number) => map.noise[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  const rng = new TRng(Math.floor(map.noise[0] * 1e9) ^ 0xda7);
  const pcx = CORE_X + 0.5 + off,
    pcy = CORE_Y + 0.5 + off;

  // 1. grass base
  c.fillStyle = '#89b964';
  c.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      c.fillStyle = DAY_GRASS[Math.floor(N(x, y) * DAY_GRASS.length) % DAY_GRASS.length];
      c.globalAlpha = 0.28;
      c.fillRect(x - 0.02, y - 0.02, 1.04, 1.04);
    }
  c.globalAlpha = 1;
  for (let i = 0; i < 80; i++) {
    const roll = rng.next();
    const col = roll < 0.4 ? '#a5cf7a' : roll < 0.75 ? '#76a856' : '#bccb7c';
    glow(c, rng.range(-2, W + 2), rng.range(-2, H + 2), rng.range(1.5, 4.5), col, rng.range(0.25, 0.45));
  }
  // mown stripes, very faint, for a cared-for garden feel
  c.fillStyle = 'rgba(255,255,230,0.035)';
  for (let x = 0; x < W; x += 2) c.fillRect(x, 0, 1, H);

  // 2. a round marble rotunda floor: concentric rings of curved slabs, a curb, and mosaic bands
  const ringR = [0.0, 1.05, 1.75, 2.4, 2.95, 3.45];
  const ry = 1 / 1.08; // very slight perspective squash
  const arcPath = (r0: number, r1: number, a0: number, a1: number) => {
    const p = new Path2D();
    p.ellipse(pcx, pcy, r1, r1 * ry, 0, a0, a1);
    if (r0 > 0) p.ellipse(pcx, pcy, r0, r0 * ry, 0, a1, a0, true);
    else p.lineTo(pcx, pcy);
    p.closePath();
    return p;
  };
  // soft shadow + curb
  glowShadow(c, pcx + 0.1, pcy + 0.18, ringR[5] + 0.5, 0.28);
  c.fillStyle = '#b9b09a';
  c.fill(arcPath(0, ringR[5] + 0.12, 0, TAU));
  const prng = new TRng(31337);
  for (let k = 1; k < ringR.length; k++) {
    const r0 = ringR[k - 1],
      r1 = ringR[k];
    const n = k === 1 ? 1 : Math.max(8, Math.round(((r0 + r1) / 2) * 5.2));
    const off = prng.range(0, TAU);
    for (let q = 0; q < n; q++) {
      const a0 = off + (q / n) * TAU,
        a1 = off + ((q + 1) / n) * TAU;
      const slab = arcPath(r0, r1, a0, a1);
      c.fillStyle = mix('#efe9da', k === 4 ? '#e6dcc2' : '#ded6c2', prng.next());
      c.fill(slab);
      c.strokeStyle = 'rgba(140,128,100,0.55)';
      c.lineWidth = 0.022;
      c.stroke(slab);
      if (prng.next() < 0.35) {
        // faint vein
        const am = (a0 + a1) / 2,
          rm = (r0 + r1) / 2;
        c.strokeStyle = 'rgba(165,155,135,0.35)';
        c.lineWidth = 0.01;
        c.beginPath();
        c.moveTo(pcx + Math.cos(am - 0.1) * (r0 + 0.08), pcy + Math.sin(am - 0.1) * (r0 + 0.08) * ry);
        c.quadraticCurveTo(pcx + Math.cos(am) * rm, pcy + Math.sin(am) * rm * ry, pcx + Math.cos(am + 0.08) * (r1 - 0.08), pcy + Math.sin(am + 0.08) * (r1 - 0.08) * ry);
        c.stroke();
      }
    }
  }
  // highlight on the upper-left rim
  c.strokeStyle = 'rgba(255,255,250,0.55)';
  c.lineWidth = 0.04;
  c.beginPath();
  c.ellipse(pcx, pcy, ringR[5] + 0.06, (ringR[5] + 0.06) * ry, 0, Math.PI * 0.95, Math.PI * 1.7);
  c.stroke();
  // mosaic bands of tesserae
  for (const [rad, cols, size] of [
    [2.07, ['#d0a640', '#e2c070'], 0.1],
    [3.2, ['#5fafa6', '#d0a640', '#8cc6be'], 0.085],
  ] as const) {
    const n = Math.floor((TAU * rad) / (size * 1.55));
    for (let q = 0; q < n; q++) {
      const a = (q / n) * TAU;
      c.save();
      c.translate(pcx + Math.cos(a) * rad, pcy + Math.sin(a) * rad * ry);
      c.rotate(a);
      c.fillStyle = cols[q % cols.length];
      c.fillRect(-size / 2, -size / 2, size, size);
      c.fillStyle = 'rgba(255,255,255,0.3)';
      c.fillRect(-size / 2, -size / 2, size, size * 0.3);
      c.restore();
    }
  }
  // gilded sun-ray inlays in the band between
  c.strokeStyle = 'rgba(200,160,70,0.7)';
  c.lineWidth = 0.035;
  c.lineCap = 'round';
  for (let q = 0; q < 24; q++) {
    const a = (q / 24) * TAU;
    const r0 = 2.5,
      r1 = q % 2 ? 2.78 : 2.88;
    c.beginPath();
    c.moveTo(pcx + Math.cos(a) * r0, pcy + Math.sin(a) * r0 * ry);
    c.lineTo(pcx + Math.cos(a) * r1, pcy + Math.sin(a) * r1 * ry);
    c.stroke();
  }
  // grass tufts nestling against the curb
  for (let q = 0; q < 40; q++) {
    const a = prng.range(0, TAU),
      rr = ringR[5] + prng.range(0.1, 0.25);
    const bx = pcx + Math.cos(a) * rr,
      by = pcy + Math.sin(a) * rr * ry;
    c.strokeStyle = prng.next() < 0.5 ? '#5f9446' : '#6fa651';
    c.lineWidth = 0.022;
    for (let b = 0; b < 3; b++) {
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(bx + prng.range(-0.07, 0.07), by - prng.range(0.07, 0.13));
      c.stroke();
    }
  }

  // 3. faint grid so the build grid can still be read
  c.strokeStyle = 'rgba(40,70,20,0.06)';
  c.lineWidth = 0.02;
  c.beginPath();
  for (let x = 1; x < W; x++) {
    c.moveTo(x, 0);
    c.lineTo(x, H);
  }
  for (let y = 1; y < H; y++) {
    c.moveTo(0, y);
    c.lineTo(W, y);
  }
  c.stroke();

  // 4. meadow life: tufts, clover, wildflowers, pebbles, stepping stones
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (T(x, y) !== Terrain.Grass) continue;
      const d = Math.hypot(x + 0.5 - pcx, (y + 0.5 - pcy) * 1.08);
      if (d < 3.8) continue;
      const r = new TRng(x * 3301 + y * 7727 + 77);
      const tufts = r.next() < 0.5 ? 1 + Math.floor(r.next() * 3) : 0;
      for (let k = 0; k < tufts; k++) {
        const bx = x + r.range(0.12, 0.88),
          by = y + r.range(0.2, 0.92);
        c.strokeStyle = r.next() < 0.5 ? '#5f9446' : '#6fa651';
        c.lineWidth = 0.022;
        c.lineCap = 'round';
        const blades = 3 + Math.floor(r.next() * 3);
        for (let q = 0; q < blades; q++) {
          const a = -Math.PI / 2 + (q - (blades - 1) / 2) * 0.35 + r.range(-0.1, 0.1);
          const len = r.range(0.08, 0.16);
          c.beginPath();
          c.moveTo(bx, by);
          c.quadraticCurveTo(bx + Math.cos(a) * len * 0.5, by + Math.sin(a) * len * 0.6, bx + Math.cos(a) * len + 0.02, by + Math.sin(a) * len);
          c.stroke();
        }
      }
      if (r.next() < 0.12) {
        // clover
        const kx = x + r.range(0.2, 0.8),
          ky = y + r.range(0.2, 0.8);
        c.fillStyle = '#5e9a45';
        for (let q = 0; q < 3; q++) {
          const a = (q / 3) * TAU - Math.PI / 2;
          c.beginPath();
          c.arc(kx + Math.cos(a) * 0.04, ky + Math.sin(a) * 0.04, 0.035, 0, TAU);
          c.fill();
        }
      }
      if (r.next() < 0.2) {
        // a few wildflowers
        const cols = ['#ffffff', '#fff2a0', '#d8b8f0', '#ffd0e0'];
        const n = 1 + Math.floor(r.next() * 3);
        for (let q = 0; q < n; q++) {
          const fx = x + r.range(0.15, 0.85),
            fy = y + r.range(0.15, 0.85);
          const col = cols[Math.floor(r.next() * cols.length)];
          const pr = r.range(0.022, 0.034);
          c.fillStyle = 'rgba(40,70,20,0.25)';
          c.beginPath();
          c.arc(fx + 0.01, fy + 0.015, pr * 1.6, 0, TAU);
          c.fill();
          c.fillStyle = col;
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU;
            c.beginPath();
            c.arc(fx + Math.cos(a) * pr, fy + Math.sin(a) * pr, pr * 0.75, 0, TAU);
            c.fill();
          }
          c.fillStyle = col === '#fff2a0' ? '#e0a020' : '#f2c040';
          c.beginPath();
          c.arc(fx, fy, pr * 0.6, 0, TAU);
          c.fill();
        }
      }
      if (r.next() < 0.06) {
        // pale pebbles
        const n = 1 + Math.floor(r.next() * 3);
        for (let k = 0; k < n; k++) {
          const px2 = x + r.range(0.15, 0.85),
            py2 = y + r.range(0.15, 0.85),
            pr = r.range(0.025, 0.05);
          c.fillStyle = 'rgba(40,60,20,0.3)';
          c.beginPath();
          c.ellipse(px2 + 0.012, py2 + 0.015, pr, pr * 0.7, 0, 0, TAU);
          c.fill();
          c.fillStyle = mix('#bdb8a4', '#d6d0bf', r.next());
          c.beginPath();
          c.ellipse(px2, py2, pr * 0.8, pr * 0.56, 0, 0, TAU);
          c.fill();
        }
      }
      if (N(x, y) > 0.988 && d > 4.5) {
        // a flat stepping stone
        const sx = x + 0.5,
          sy = y + 0.5;
        c.fillStyle = 'rgba(40,60,20,0.3)';
        c.beginPath();
        c.ellipse(sx + 0.03, sy + 0.04, 0.3, 0.2, 0.2, 0, TAU);
        c.fill();
        c.fillStyle = '#d8d2c0';
        c.beginPath();
        c.ellipse(sx, sy, 0.3, 0.2, 0.2, 0, TAU);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.beginPath();
        c.ellipse(sx - 0.06, sy - 0.05, 0.16, 0.07, 0.2, 0, TAU);
        c.fill();
      }
    }

  // 5. ponds
  drawWater(c, map, T, N, {
    rim: '#d9c79a',
    rimHi: 'rgba(255,250,220,0.6)',
    water: '#58c3c6',
    deep: '#2f9fb0',
    shine: 'rgba(255,255,255,0.55)',
  });
  waterDecor(c, map, T, 'day');

  // 6. golden flower meadows (where Aviaries are built)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (T(x, y) === Terrain.Crystal) meadow(c, x, y, T);

  // 7. marble ruins
  const rocks: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T(x, y) === Terrain.Rock) rocks.push([x, y]);
  for (const [x, y] of rocks) glowShadow(c, x + 0.62, y + 0.72, 0.62, 0.3);
  for (const [x, y] of rocks) ruin(c, x, y);

  // 8. groves
  drawTrees(c, map, T, 'day');
}

function meadow(c: CanvasRenderingContext2D, x: number, y: number, T: TFn) {
  const r = new TRng(x * 911 + y * 3571 + 11);
  const cx = x + 0.5,
    cy = y + 0.5;
  // warm golden patch, merging with meadow neighbours
  glow(c, cx, cy, 0.85, '#f0d060', 0.55);
  c.fillStyle = 'rgba(200,170,60,0.35)';
  c.beginPath();
  c.ellipse(cx, cy + 0.04, 0.48, 0.42, 0, 0, TAU);
  c.fill();
  if (T(x + 1, y) === Terrain.Crystal) glow(c, cx + 0.5, cy, 0.5, '#f0d060', 0.4);
  if (T(x, y + 1) === Terrain.Crystal) glow(c, cx, cy + 0.5, 0.5, '#f0d060', 0.4);
  // wheat ears
  c.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const sx = cx + r.range(-0.38, 0.38),
      sy = cy + r.range(-0.2, 0.4);
    const lean = r.range(-0.15, 0.15);
    c.strokeStyle = '#b8963a';
    c.lineWidth = 0.016;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx + lean, sy - 0.22);
    c.stroke();
    c.fillStyle = mix('#e8c050', '#f6dc80', r.next());
    for (let q = 0; q < 3; q++) {
      c.beginPath();
      c.ellipse(sx + lean * (0.75 + q * 0.12) + (q % 2 ? 0.02 : -0.02), sy - 0.16 - q * 0.035, 0.022, 0.035, lean, 0, TAU);
      c.fill();
    }
  }
  // golden blossoms
  for (let k = 0; k < 10; k++) {
    const fx = cx + r.range(-0.42, 0.42),
      fy = cy + r.range(-0.36, 0.42);
    const pr = r.range(0.028, 0.042);
    const col = r.next() < 0.75 ? '#ffcf3a' : r.next() < 0.5 ? '#ffffff' : '#ffb04a';
    c.fillStyle = col;
    for (let q = 0; q < 5; q++) {
      const a = (q / 5) * TAU + k;
      c.beginPath();
      c.arc(fx + Math.cos(a) * pr, fy + Math.sin(a) * pr, pr * 0.8, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#b86a10';
    c.beginPath();
    c.arc(fx, fy, pr * 0.5, 0, TAU);
    c.fill();
  }
  if (r.next() < 0.5) {
    // a resting butterfly
    const bx = cx + r.range(-0.25, 0.25),
      by = cy + r.range(-0.25, 0.1);
    const col = r.next() < 0.5 ? '#ffffff' : '#9fd8ff';
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(bx - 0.04, by, 0.045, 0.03, -0.5, 0, TAU);
    c.ellipse(bx + 0.04, by, 0.045, 0.03, 0.5, 0, TAU);
    c.fill();
    c.fillStyle = '#3a2a1a';
    c.fillRect(bx - 0.006, by - 0.03, 0.012, 0.06);
  }
}

const MARBLE = '#e9e4d6';

function ruin(c: CanvasRenderingContext2D, x: number, y: number) {
  const r = new TRng(x * 4099 + y * 2203 + 21);
  const kind = Math.floor(r.next() * 3);
  const cx = x + 0.5,
    cy = y + 0.55;
  const outline = 'rgba(95,85,65,0.7)';
  c.lineJoin = 'round';
  if (kind === 0) {
    // standing broken column on a plinth
    c.fillStyle = '#c8c0ac';
    c.fillRect(cx - 0.36, cy + 0.06, 0.72, 0.2);
    c.fillStyle = MARBLE;
    c.fillRect(cx - 0.36, cy - 0.06, 0.72, 0.14);
    c.strokeStyle = outline;
    c.lineWidth = 0.02;
    c.strokeRect(cx - 0.36, cy - 0.06, 0.72, 0.32);
    const h = r.range(0.45, 0.75);
    const g = c.createLinearGradient(cx - 0.22, 0, cx + 0.22, 0);
    g.addColorStop(0, '#f6f2e8');
    g.addColorStop(0.6, '#e0d9c6');
    g.addColorStop(1, '#bdb49e');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx - 0.22, cy);
    c.lineTo(cx - 0.22, cy - h + 0.06);
    // jagged break
    c.lineTo(cx - 0.1, cy - h - 0.04);
    c.lineTo(cx, cy - h + 0.05);
    c.lineTo(cx + 0.1, cy - h - 0.02);
    c.lineTo(cx + 0.22, cy - h + 0.08);
    c.lineTo(cx + 0.22, cy);
    c.closePath();
    c.fill();
    c.strokeStyle = outline;
    c.stroke();
    c.strokeStyle = 'rgba(130,120,95,0.55)';
    c.lineWidth = 0.014;
    c.beginPath();
    for (const fx of [-0.13, -0.04, 0.05, 0.14]) {
      c.moveTo(cx + fx, cy - 0.02);
      c.lineTo(cx + fx, cy - h + 0.1);
    }
    c.stroke();
  } else if (kind === 1) {
    // toppled column lying on its side
    const a = r.range(-0.5, 0.5);
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    const g = c.createLinearGradient(0, -0.18, 0, 0.18);
    g.addColorStop(0, '#f6f2e8');
    g.addColorStop(0.5, '#e0d9c6');
    g.addColorStop(1, '#b4ab94');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-0.5, -0.17);
    c.lineTo(0.38, -0.17);
    c.lineTo(0.45, -0.05);
    c.lineTo(0.36, 0.04);
    c.lineTo(0.46, 0.17);
    c.lineTo(-0.5, 0.17);
    c.closePath();
    c.fill();
    c.strokeStyle = outline;
    c.lineWidth = 0.02;
    c.stroke();
    c.fillStyle = '#d4ccb8';
    c.beginPath();
    c.ellipse(-0.5, 0, 0.07, 0.17, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(130,120,95,0.5)';
    c.lineWidth = 0.012;
    c.beginPath();
    for (const fy of [-0.1, -0.03, 0.04, 0.11]) {
      c.moveTo(-0.45, fy);
      c.lineTo(0.36, fy);
    }
    c.stroke();
    c.restore();
    // a fragment beside it
    facet(c, ngon(cx + r.range(-0.3, 0.3), cy + 0.3, 0.07, 5, r.next(), 0.7), cx, cy + 0.27, MARBLE, 0.4);
  } else {
    // carved block / fallen capital
    const s = r.range(0.32, 0.4);
    c.fillStyle = '#c4bba5';
    c.beginPath();
    c.moveTo(cx - s, cy - s * 0.4);
    c.lineTo(cx + s, cy - s * 0.4);
    c.lineTo(cx + s, cy + s * 0.55);
    c.lineTo(cx - s, cy + s * 0.55);
    c.closePath();
    c.fill();
    c.strokeStyle = outline;
    c.lineWidth = 0.02;
    c.stroke();
    c.fillStyle = MARBLE;
    c.beginPath();
    c.moveTo(cx - s, cy - s * 0.4);
    c.lineTo(cx - s * 0.7, cy - s * 0.95);
    c.lineTo(cx + s * 1.25, cy - s * 0.95);
    c.lineTo(cx + s, cy - s * 0.4);
    c.closePath();
    c.fill();
    c.stroke();
    // ionic volutes on the face
    c.strokeStyle = 'rgba(120,108,85,0.7)';
    c.lineWidth = 0.018;
    for (const vx of [cx - s * 0.55, cx + s * 0.55]) {
      c.beginPath();
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TAU * 1.6;
        const rr = 0.09 - k * 0.0045;
        const px = vx + Math.cos(a) * rr,
          py = cy + 0.06 + Math.sin(a) * rr;
        k ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.stroke();
    }
  }
  // moss and ivy
  c.fillStyle = 'rgba(105,150,70,0.8)';
  for (let k = 0; k < 4; k++) {
    c.beginPath();
    c.ellipse(cx + r.range(-0.3, 0.3), cy + r.range(0.0, 0.25), r.range(0.04, 0.08), r.range(0.025, 0.045), 0, 0, TAU);
    c.fill();
  }
  if (r.next() < 0.6) {
    c.strokeStyle = 'rgba(70,120,50,0.9)';
    c.lineWidth = 0.018;
    c.beginPath();
    const ix = cx + r.range(-0.15, 0.15);
    c.moveTo(ix, cy + 0.2);
    c.bezierCurveTo(ix + 0.1, cy, ix - 0.1, cy - 0.15, ix + 0.05, cy - 0.3);
    c.stroke();
    c.fillStyle = '#5a9a40';
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.ellipse(ix + r.range(-0.06, 0.08), cy + 0.15 - k * 0.12, 0.035, 0.022, r.range(0, 3), 0, TAU);
      c.fill();
    }
  }
}
