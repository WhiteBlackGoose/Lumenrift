import { CORE_X, CORE_Y } from '../../game/config';
import { idx, MapData, Terrain } from '../../game/grid';
import { facet, glow, mix, ngon, rgba, shade, TRng } from './util';

const GROUND = ['#141d22', '#161b26', '#181a29', '#13201f', '#171f24'];

/** Render the static terrain of the whole map to an offscreen canvas at `px` pixels per tile. */
export function renderGround(map: MapData, px: number): HTMLCanvasElement {
  const W = map.w,
    H = map.h;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(W * px);
  cv.height = Math.ceil(H * px);
  const c = cv.getContext('2d')!;
  c.scale(px, px);
  const T = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? Terrain.Grass : map.terrain[idx(x, y)]);
  const N = (x: number, y: number) => map.noise[idx(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)))];
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
  const pcx = CORE_X + 0.5,
    pcy = CORE_Y + 0.5;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = T(x, y);
      if (t === Terrain.Rock || t === Terrain.Rift) continue;
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
    }

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

  // 8. vignette
  const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.58);
  vg.addColorStop(0, 'rgba(3,4,10,0)');
  vg.addColorStop(1, 'rgba(3,4,10,0.6)');
  c.fillStyle = vg;
  c.fillRect(0, 0, W, H);
  return cv;
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
