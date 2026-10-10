// Day realm art: the sunlit Sanctum and its marble-and-gold guardians, plus the Blight-wells.
// Same conventions as the night buildings: world ctx (1 unit = 1 tile), tile (x,y) spans [x,x+1]×[y,y+1].
import { CORE_X, CORE_Y } from '../../game/config';
import type { Building, Game } from '../../game/game';
import { cached, facet, glow, hash, ngon, poly, pxOf, rgba, shade } from './util';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// palette
const MARBLE = '#f1ece0';
const MARBLE_MID = '#ddd4c0';
const MARBLE_DARK = '#b5a98f';
const GOLD = '#e7b648';
const GOLD_LIGHT = '#ffe08a';
const GOLD_DARK = '#9a6e1e';
const SKY = '#7fd3ff';
const OUT = 'rgba(64,50,30,0.9)';
const SHADOW = 'rgba(28,62,22,0.3)';

function circle(c: C, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}

function ell(c: C, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, TAU);
}

/** Fill + crisp outline. */
function fo(c: C, fill: string | CanvasGradient, lw = 0.02, stroke = OUT) {
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = stroke;
  c.lineWidth = lw;
  c.stroke();
}

/** Vertical marble gradient for a shaft spanning x0..x1 (lit from upper-left). */
function marbleGrad(c: C, x0: number, x1: number, base = MARBLE) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(base, 0.15));
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade(base, -0.22));
  return g;
}

function goldGrad(c: C, x0: number, y0: number, x1: number, y1: number) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GOLD_LIGHT);
  g.addColorStop(0.5, GOLD);
  g.addColorStop(1, GOLD_DARK);
  return g;
}

/**
 * A smooth, scalloped wing. Root at (x,y); `side` -1 = left wing, +1 = right; the wing sweeps
 * outward and up by `lift` radians; `len` is the span.
 */
function wing(c: C, x: number, y: number, len: number, side: number, lift: number, gold: boolean) {
  c.save();
  c.translate(x, y);
  c.scale(side, 1);
  c.rotate(-lift);
  // silhouette: leading edge arcs up to the tip, trailing edge comes back in feather scallops
  c.beginPath();
  c.moveTo(0, 0.02);
  c.quadraticCurveTo(len * 0.3, -len * 0.42, len, -len * 0.3);
  const n = 4;
  let px = len,
    py = -len * 0.3;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const nx = len * (1 - k) * 0.95,
      ny = -len * 0.3 * (1 - k) + len * 0.18 * Math.sin(k * Math.PI) + 0.02 * k;
    c.quadraticCurveTo((px + nx) / 2 + len * 0.02, Math.max(py, ny) + len * 0.12, nx, ny);
    px = nx;
    py = ny;
  }
  c.closePath();
  const g = c.createLinearGradient(0, -len * 0.4, 0, len * 0.2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#ddd5c2');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = gold ? GOLD_DARK : 'rgba(96,84,62,0.9)';
  c.lineWidth = 0.016;
  c.stroke();
  // feather lines
  c.strokeStyle = gold ? rgba(GOLD, 0.8) : 'rgba(150,138,112,0.6)';
  c.lineWidth = 0.009;
  for (let i = 1; i <= 3; i++) {
    const k = i / 4;
    c.beginPath();
    c.moveTo(len * 0.12 * k, -len * 0.06);
    c.quadraticCurveTo(len * (0.35 + k * 0.25), -len * 0.3 * (1 - k * 0.3), len * (0.55 + k * 0.35), -len * 0.26 + len * 0.09 * k);
    c.stroke();
  }
  if (gold) {
    c.strokeStyle = GOLD_LIGHT;
    c.lineWidth = 0.014;
    c.beginPath();
    c.moveTo(0, 0.0);
    c.quadraticCurveTo(len * 0.3, -len * 0.42, len, -len * 0.3);
    c.stroke();
  }
  c.restore();
}

/** Soft green drop shadow on the meadow. */
function dropShadow(c: C, x: number, y: number, rx: number, ry: number) {
  c.fillStyle = SHADOW;
  ell(c, x, y, rx, ry);
  c.fill();
}

// ------------------------------------------------------------------ marble plinth

function plinthCanvas(c: C, col: string, level: number) {
  return cached(`dplinth|${col}|${level}`, pxOf(c), -0.08, -0.05, 1.2, 1.25, (g) => {
    const top = ngon(0.5, 0.47, 0.43, 8, Math.PI / 8, 0.86);
    g.fillStyle = SHADOW;
    poly(
      g,
      top.map(([x, y]) => [x + 0.07, y + 0.15]),
    );
    g.fill();
    // skirt
    g.fillStyle = MARBLE_DARK;
    poly(
      g,
      top.map(([x, y]) => [x, y + 0.1]),
    );
    g.fill();
    g.strokeStyle = OUT;
    g.lineWidth = 0.022;
    g.stroke();
    // top
    facet(g, top, 0.42, 0.38, level === 2 ? '#f6f1e4' : MARBLE, 0.18, OUT, 0.024);
    // veins
    g.strokeStyle = 'rgba(150,140,120,0.35)';
    g.lineWidth = 0.008;
    g.beginPath();
    g.moveTo(0.22, 0.36);
    g.quadraticCurveTo(0.4, 0.48, 0.36, 0.66);
    g.moveTo(0.62, 0.28);
    g.quadraticCurveTo(0.7, 0.42, 0.82, 0.46);
    g.stroke();
    // gold trim
    g.strokeStyle = rgba(GOLD, level >= 1 ? 0.95 : 0.55);
    g.lineWidth = level >= 1 ? 0.025 : 0.016;
    poly(g, ngon(0.5, 0.47, 0.37, 8, Math.PI / 8, 0.86));
    g.stroke();
    if (level >= 1) {
      g.strokeStyle = rgba(col, 0.6);
      g.lineWidth = 0.014;
      poly(g, ngon(0.5, 0.47, 0.31, 8, Math.PI / 8, 0.86));
      g.stroke();
    }
    if (level >= 2) {
      for (const [x, y] of top) {
        g.fillStyle = GOLD_LIGHT;
        circle(g, x + (0.5 - x) * 0.1, y + (0.47 - y) * 0.1, 0.026);
        g.fill();
        g.strokeStyle = GOLD_DARK;
        g.lineWidth = 0.008;
        g.stroke();
      }
    }
  });
}

function plinth(c: C, b: Building) {
  c.drawImage(plinthCanvas(c, b.def.color, b.level), b.x - 0.08, b.y - 0.05, 1.2, 1.25);
}

function dayPips(c: C, cx: number, y: number, level: number) {
  for (let i = 0; i <= level; i++) {
    const x = cx + (i - level / 2) * 0.1;
    c.fillStyle = GOLD_LIGHT;
    poly(c, [
      [x, y - 0.035],
      [x + 0.03, y],
      [x, y + 0.035],
      [x - 0.03, y],
    ]);
    c.fill();
    c.strokeStyle = GOLD_DARK;
    c.lineWidth = 0.01;
    c.stroke();
  }
}

function buffSparkles(c: C, b: Building, t: number) {
  for (let i = 0; i < 4; i++) {
    const p = (t * 0.6 + i / 4 + hash(b.uid * 13 + i) * 0.3) % 1;
    const x = b.x + 0.2 + hash(b.uid * 7 + i) * 0.6;
    const y = b.y + 0.75 - p * 0.9;
    c.fillStyle = rgba('#bff0ff', 0.9 * Math.sin(p * Math.PI));
    poly(c, [
      [x, y - 0.04],
      [x + 0.012, y],
      [x, y + 0.04],
      [x - 0.012, y],
    ]);
    c.fill();
  }
}

// ------------------------------------------------------------------ colonnade (wall)

function colonnadeCanvas(c: C, mask: number, L: number) {
  return cached(`colon|${mask}|${L}`, pxOf(c), -0.05, -0.32, 1.2, 1.45, (g) => {
    const N = mask & 1,
      E = mask & 2,
      S = mask & 4,
      W = mask & 8;
    const h = 0.26,
      ins = 0.12;
    const x0 = W ? 0 : ins,
      x1 = E ? 1 : 1 - ins;
    const fy0 = N ? 0 : ins,
      fy1 = S ? 1 : 1 - ins;
    const y0 = fy0 - h,
      y1 = fy1 - h;
    // shadow on the meadow
    g.fillStyle = SHADOW;
    g.fillRect(x0 + 0.07, fy0 + 0.04, x1 - x0, fy1 - fy0 + 0.06);
    // front face: columns between a base and an architrave
    if (!S) {
      g.fillStyle = MARBLE_MID;
      g.fillRect(x0, y1, x1 - x0, h);
      const n = Math.max(1, Math.round((x1 - x0) / 0.25));
      const step = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        const cxp = x0 + step * (i + 0.5);
        const w = step * 0.55;
        g.fillStyle = marbleGrad(g, cxp - w / 2, cxp + w / 2);
        g.fillRect(cxp - w / 2, y1 + 0.04, w, h - 0.07);
        // flutes
        g.strokeStyle = 'rgba(120,108,85,0.35)';
        g.lineWidth = 0.006;
        g.beginPath();
        g.moveTo(cxp - w * 0.15, y1 + 0.05);
        g.lineTo(cxp - w * 0.15, y1 + h - 0.04);
        g.moveTo(cxp + w * 0.15, y1 + 0.05);
        g.lineTo(cxp + w * 0.15, y1 + h - 0.04);
        g.stroke();
      }
      // shadowed gaps between columns
      g.fillStyle = 'rgba(70,60,40,0.18)';
      g.fillRect(x0, y1 + h - 0.03, x1 - x0, 0.03);
      if (L >= 2) {
        g.fillStyle = goldGrad(g, 0, y1 + 0.02, 0, y1 + 0.05);
        g.fillRect(x0, y1 + 0.015, x1 - x0, 0.03);
        g.fillRect(x0, y1 + h - 0.045, x1 - x0, 0.02);
      }
      g.strokeStyle = OUT;
      g.lineWidth = 0.018;
      g.strokeRect(x0, y1, x1 - x0, h);
    }
    // top face: a marble slab
    const grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, '#fbf8f0');
    grd.addColorStop(1, L === 0 ? '#e4dccb' : '#ebe4d4');
    g.fillStyle = grd;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // slab seams
    g.strokeStyle = 'rgba(140,128,104,0.35)';
    g.lineWidth = 0.008;
    g.beginPath();
    for (let x = 0.5; x < 1; x += 0.5) {
      if (x <= x0 || x >= x1) continue;
      g.moveTo(x, y0);
      g.lineTo(x, y1);
    }
    g.stroke();
    if (L >= 1) {
      g.strokeStyle = rgba(GOLD, L >= 2 ? 0.95 : 0.6);
      g.lineWidth = 0.016;
      g.beginPath();
      if (!N) {
        g.moveTo(x0 + 0.04, y0 + 0.05);
        g.lineTo(x1 - 0.04, y0 + 0.05);
      }
      if (!S) {
        g.moveTo(x0 + 0.04, y1 - 0.05);
        g.lineTo(x1 - 0.04, y1 - 0.05);
      }
      if (!W) {
        g.moveTo(x0 + 0.05, y0 + 0.04);
        g.lineTo(x0 + 0.05, y1 - 0.04);
      }
      if (!E) {
        g.moveTo(x1 - 0.05, y0 + 0.04);
        g.lineTo(x1 - 0.05, y1 - 0.04);
      }
      g.stroke();
    }
    // column capitals on the exposed corners
    const caps: [number, number][] = [];
    if (!N && !W) caps.push([x0 + 0.08, y0 + 0.08]);
    if (!N && !E) caps.push([x1 - 0.08, y0 + 0.08]);
    if (!S && !W) caps.push([x0 + 0.08, y1 - 0.08]);
    if (!S && !E) caps.push([x1 - 0.08, y1 - 0.08]);
    for (const [x, y] of caps) {
      circle(g, x, y, 0.07);
      fo(g, L >= 2 ? GOLD_LIGHT : '#fffaf0', 0.014);
      circle(g, x, y, 0.035);
      g.strokeStyle = rgba(L >= 2 ? GOLD_DARK : MARBLE_DARK, 0.8);
      g.lineWidth = 0.01;
      g.stroke();
    }
    g.strokeStyle = OUT;
    g.lineWidth = 0.018;
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  });
}

function colonnade(c: C, b: Building, game: Game, t: number) {
  const nb = (dx: number, dy: number) => game.buildingAtTile(b.x + dx, b.y + dy)?.def.id === 'colonnade';
  const mask = (nb(0, -1) ? 1 : 0) | (nb(1, 0) ? 2 : 0) | (nb(0, 1) ? 4 : 0) | (nb(-1, 0) ? 8 : 0);
  c.drawImage(colonnadeCanvas(c, mask, b.level), b.x - 0.05, b.y - 0.32, 1.2, 1.45);
  if (b.level >= 2) glow(c, b.x + 0.5, b.y + 0.3, 0.55, GOLD_LIGHT, 0.12 + 0.04 * Math.sin(t * 2 + b.x));
  if (b.hp < b.maxHp * 0.5) {
    c.strokeStyle = 'rgba(80,60,40,0.85)';
    c.lineWidth = 0.018;
    c.beginPath();
    c.moveTo(b.x + 0.3, b.y + 0.05);
    c.lineTo(b.x + 0.38, b.y + 0.2);
    c.lineTo(b.x + 0.33, b.y + 0.32);
    c.stroke();
  }
}

// ------------------------------------------------------------------ plume sentinel (javelin)

/** A standing robed guardian figure, feet at (x, y), `h` tall. */
function guardian(c: C, x: number, y: number, h: number, L: number) {
  const sh = y - h * 0.78,
    hw = h * 0.16;
  // robe
  c.beginPath();
  c.moveTo(x - hw * 0.62, sh);
  c.quadraticCurveTo(x - hw * 1.05, y - h * 0.3, x - hw * 1.08, y);
  c.lineTo(x + hw * 1.08, y);
  c.quadraticCurveTo(x + hw * 1.05, y - h * 0.3, x + hw * 0.62, sh);
  c.closePath();
  fo(c, marbleGrad(c, x - hw, x + hw), 0.016);
  c.strokeStyle = 'rgba(140,126,100,0.5)';
  c.lineWidth = 0.008;
  c.beginPath();
  c.moveTo(x, sh + h * 0.1);
  c.lineTo(x - hw * 0.15, y - 0.01);
  c.moveTo(x + hw * 0.4, sh + h * 0.12);
  c.lineTo(x + hw * 0.55, y - 0.01);
  c.stroke();
  // sash
  c.strokeStyle = L >= 1 ? GOLD : '#c9bea4';
  c.lineWidth = h * 0.05;
  c.beginPath();
  c.moveTo(x - hw * 0.7, sh + h * 0.08);
  c.lineTo(x + hw * 0.75, sh + h * 0.3);
  c.stroke();
  // head
  circle(c, x, sh - h * 0.1, h * 0.11);
  fo(c, '#fbf8f0', 0.015);
  if (L >= 2) {
    c.strokeStyle = GOLD;
    c.lineWidth = 0.014;
    c.beginPath();
    c.arc(x, sh - h * 0.1, h * 0.12, Math.PI * 1.05, Math.PI * 1.95);
    c.stroke();
  }
}

function javelin(c: C, b: Building, cx: number, cy: number, t: number) {
  const L = b.level;
  const fy = cy - 0.02,
    h = 0.56 + L * 0.04;
  const bob = Math.sin(t * 2 + b.uid) * 0.008;
  const facing = Math.cos(b.angle) >= 0 ? 1 : -1;
  const sh = fy - h * 0.78 + bob;
  // wings spread behind the shoulders, wider with level
  const span = 0.34 + L * 0.07,
    lift = 0.35 + L * 0.08;
  wing(c, cx - 0.04, sh + 0.04, span, -1, lift, L >= 1);
  wing(c, cx + 0.04, sh + 0.04, span, 1, lift, L >= 1);
  guardian(c, cx, fy, h, L);
  // throwing arm + javelin aimed at the target
  const hx = cx + facing * 0.09,
    hy = sh + 0.02;
  c.strokeStyle = '#efe8d8';
  c.lineWidth = 0.035;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx + facing * 0.05, sh + 0.08);
  c.lineTo(hx, hy - b.recoil * 0.03);
  c.stroke();
  const vis = b.recoil > 0.5 ? 0 : 1 - b.recoil / 0.5;
  if (vis > 0) {
    const dx = Math.cos(b.angle),
      dy = Math.sin(b.angle) * 0.7;
    c.save();
    c.globalAlpha *= vis;
    c.strokeStyle = GOLD_DARK;
    c.lineWidth = 0.024;
    c.beginPath();
    c.moveTo(hx - dx * 0.22, hy - dy * 0.22);
    c.lineTo(hx + dx * 0.3, hy + dy * 0.3);
    c.stroke();
    c.strokeStyle = GOLD_LIGHT;
    c.lineWidth = 0.01;
    c.stroke();
    const tx = hx + dx * 0.3,
      ty = hy + dy * 0.3;
    c.fillStyle = GOLD_LIGHT;
    poly(c, [
      [tx - dy * 0.035, ty + dx * 0.035],
      [tx + dx * 0.1, ty + dy * 0.1],
      [tx + dy * 0.035, ty - dx * 0.035],
    ]);
    c.fill();
    c.strokeStyle = GOLD_DARK;
    c.lineWidth = 0.008;
    c.stroke();
    c.restore();
  }
}

// ------------------------------------------------------------------ sun glyph (trap)

function glyphCanvas(c: C, L: number) {
  return cached(`glyph|${L}`, pxOf(c), 0, 0, 1, 1, (g) => {
    // marble tile set into the ground
    const r = 0.1;
    g.beginPath();
    g.roundRect(0.08, 0.08, 0.84, 0.84, r);
    g.fillStyle = SHADOW;
    g.fill();
    g.beginPath();
    g.roundRect(0.06, 0.05, 0.84, 0.84, r);
    const gr = g.createLinearGradient(0.06, 0.05, 0.9, 0.9);
    gr.addColorStop(0, '#fbf7ee');
    gr.addColorStop(1, '#ddd3bd');
    fo(g, gr, 0.02);
    // gold rune: sun disc with rays
    g.strokeStyle = GOLD;
    g.lineWidth = 0.028;
    circle(g, 0.48, 0.47, 0.13);
    g.stroke();
    const rays = 8 + L * 4;
    g.lineWidth = 0.018;
    g.beginPath();
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU;
      const r0 = 0.18,
        r1 = i % 2 ? 0.28 : 0.34;
      g.moveTo(0.48 + Math.cos(a) * r0, 0.47 + Math.sin(a) * r0);
      g.lineTo(0.48 + Math.cos(a) * r1, 0.47 + Math.sin(a) * r1);
    }
    g.stroke();
    if (L >= 1) {
      g.lineWidth = 0.012;
      circle(g, 0.48, 0.47, 0.38);
      g.stroke();
    }
    if (L >= 2) {
      g.fillStyle = GOLD_LIGHT;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i / 4) * TAU;
        circle(g, 0.48 + Math.cos(a) * 0.38, 0.47 + Math.sin(a) * 0.38, 0.03);
        g.fill();
      }
    }
    circle(g, 0.48, 0.47, 0.055);
    g.fillStyle = GOLD_LIGHT;
    g.fill();
  });
}

function glyph(c: C, b: Building, t: number) {
  c.drawImage(glyphCanvas(c, b.level), b.x, b.y, 1, 1);
  const cx = b.x + 0.48,
    cy = b.y + 0.47;
  const f = Math.min(1, b.firing * 4);
  glow(c, cx, cy, 0.4 + f * 0.6, GOLD_LIGHT, 0.15 + 0.06 * Math.sin(t * 3 + b.uid) + f * 0.7);
  if (f > 0) {
    c.strokeStyle = rgba('#fffbe0', f);
    c.lineWidth = 0.03;
    circle(c, cx, cy, 0.3 + (1 - f) * 0.5);
    c.stroke();
  }
}

// ------------------------------------------------------------------ aviary (eco)

function aviary(c: C, b: Building, cx: number, cy: number, t: number) {
  const L = b.level;
  dropShadow(c, cx + 0.06, cy + 0.3, 0.36, 0.13);
  // round marble base on the meadow
  ell(c, cx, cy + 0.24, 0.32, 0.13);
  fo(c, MARBLE_MID, 0.018);
  ell(c, cx, cy + 0.2, 0.32, 0.13);
  fo(c, '#f6f1e5', 0.018);
  // dovecote tower
  const w = 0.2,
    top = cy - 0.3 - L * 0.04;
  c.beginPath();
  c.moveTo(cx - w, cy + 0.2);
  c.lineTo(cx - w * 0.9, top);
  c.lineTo(cx + w * 0.9, top);
  c.lineTo(cx + w, cy + 0.2);
  c.closePath();
  fo(c, marbleGrad(c, cx - w, cx + w), 0.018);
  // round openings
  const rows = 2 + (L >= 1 ? 1 : 0);
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k <= 1; k += 2) {
      const ox = cx + k * 0.08,
        oy = cy + 0.08 - r * 0.15;
      circle(c, ox, oy, 0.035);
      c.fillStyle = '#4a4030';
      c.fill();
      c.strokeStyle = GOLD;
      c.lineWidth = 0.008;
      c.stroke();
    }
  }
  // dome roof
  c.beginPath();
  c.ellipse(cx, top, w * 1.05, 0.055, 0, 0, TAU);
  fo(c, L >= 1 ? GOLD : MARBLE_MID, 0.016);
  c.beginPath();
  c.moveTo(cx - w * 1.0, top);
  c.quadraticCurveTo(cx - w * 0.9, top - 0.24, cx, top - 0.26);
  c.quadraticCurveTo(cx + w * 0.9, top - 0.24, cx + w * 1.0, top);
  c.closePath();
  fo(c, L >= 1 ? goldGrad(c, cx - w, top - 0.2, cx + w, top) : marbleGrad(c, cx - w, cx + w, '#e9e1cf'), 0.018);
  // finial
  c.strokeStyle = GOLD_DARK;
  c.lineWidth = 0.015;
  c.beginPath();
  c.moveTo(cx, top - 0.26);
  c.lineTo(cx, top - 0.36);
  c.stroke();
  circle(c, cx, top - 0.37, 0.025);
  fo(c, GOLD_LIGHT, 0.008, GOLD_DARK);
  // doves circling
  const doves = 2 + L;
  for (let i = 0; i < doves; i++) {
    const a = t * (0.9 + i * 0.13) + (i / doves) * TAU + b.uid;
    const r = 0.36 + 0.08 * Math.sin(t + i);
    const dx = cx + Math.cos(a) * r,
      dy = top - 0.1 + Math.sin(a) * r * 0.45 - 0.06 * Math.sin(t * 2 + i);
    dove(c, dx, dy, Math.cos(a) < 0 ? 1 : -1, t * 14 + i * 2);
  }
}

function dove(c: C, x: number, y: number, dir: number, phase: number) {
  const f = Math.sin(phase);
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  c.fillStyle = '#ffffff';
  c.strokeStyle = 'rgba(90,80,60,0.8)';
  c.lineWidth = 0.008;
  // wings
  c.beginPath();
  c.moveTo(-0.01, 0);
  c.quadraticCurveTo(-0.03, -0.06 * f - 0.01, -0.07, -0.05 * f);
  c.lineTo(0.0, 0.0);
  c.moveTo(0.01, 0);
  c.quadraticCurveTo(0.03, -0.06 * f - 0.01, 0.07, -0.05 * f);
  c.lineTo(0.0, 0.0);
  c.fill();
  c.stroke();
  // body
  ell(c, 0, 0.005, 0.03, 0.014);
  c.fill();
  c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ resonance bell

function bell(c: C, b: Building, cx: number, cy: number, t: number) {
  const L = b.level;
  const by = cy - 0.05;
  const archH = 0.62 + L * 0.06,
    hw = 0.26;
  // posts
  for (const s of [-1, 1]) {
    const px = cx + s * hw;
    c.beginPath();
    c.rect(px - 0.04, by - archH + 0.08, 0.08, archH - 0.04);
    fo(c, marbleGrad(c, px - 0.04, px + 0.04), 0.016);
  }
  // swing
  const f = Math.min(1, b.firing * 2.5);
  const sw = Math.sin(t * 13) * 0.4 * f + Math.sin(t * 1.3 + b.uid) * 0.03;
  // bell
  c.save();
  c.translate(cx, by - archH + 0.12);
  c.rotate(sw);
  c.strokeStyle = GOLD_DARK;
  c.lineWidth = 0.015;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, 0.06);
  c.stroke();
  const bw = 0.15 + L * 0.015,
    bh = 0.3 + L * 0.02;
  c.beginPath();
  c.moveTo(-bw * 0.45, 0.06);
  c.quadraticCurveTo(-bw * 0.6, 0.06 + bh * 0.55, -bw, 0.06 + bh);
  c.lineTo(bw, 0.06 + bh);
  c.quadraticCurveTo(bw * 0.6, 0.06 + bh * 0.55, bw * 0.45, 0.06);
  c.closePath();
  const bg = c.createLinearGradient(-bw, 0, bw, 0);
  bg.addColorStop(0, '#f8d77a');
  bg.addColorStop(0.35, '#d9a03a');
  bg.addColorStop(1, '#7a5214');
  fo(c, bg, 0.018);
  // lip & band
  ell(c, 0, 0.06 + bh, bw, 0.035);
  fo(c, '#a8761f', 0.014);
  if (L >= 1) {
    c.strokeStyle = GOLD_LIGHT;
    c.lineWidth = 0.012;
    c.beginPath();
    c.moveTo(-bw * 0.7, 0.06 + bh * 0.6);
    c.lineTo(bw * 0.7, 0.06 + bh * 0.6);
    c.stroke();
  }
  // clapper
  circle(c, Math.sin(sw * 3) * 0.04, 0.06 + bh + 0.02, 0.025);
  fo(c, '#6a4a14', 0.008);
  c.restore();
  // lintel / arch on top
  c.beginPath();
  c.moveTo(cx - hw - 0.07, by - archH + 0.1);
  c.quadraticCurveTo(cx, by - archH - 0.12 - L * 0.03, cx + hw + 0.07, by - archH + 0.1);
  c.lineTo(cx + hw + 0.07, by - archH + 0.02);
  c.quadraticCurveTo(cx, by - archH - 0.2 - L * 0.03, cx - hw - 0.07, by - archH + 0.02);
  c.closePath();
  fo(c, L >= 2 ? goldGrad(c, cx - hw, by - archH - 0.2, cx + hw, by - archH) : '#f6f1e5', 0.016);
  if (f > 0) glow(c, cx, by - archH + 0.35, 0.5, GOLD_LIGHT, 0.4 * f);
}

// ------------------------------------------------------------------ windcatcher

function windcatcher(c: C, b: Building, cx: number, cy: number, t: number) {
  const L = b.level;
  const baseY = cy + 0.05,
    topY = cy - 0.5 - L * 0.05;
  // slender tapered tower
  c.beginPath();
  c.moveTo(cx - 0.12, baseY);
  c.lineTo(cx - 0.06, topY);
  c.lineTo(cx + 0.06, topY);
  c.lineTo(cx + 0.12, baseY);
  c.closePath();
  fo(c, marbleGrad(c, cx - 0.12, cx + 0.12), 0.016);
  if (L >= 1) {
    c.strokeStyle = GOLD;
    c.lineWidth = 0.014;
    for (const yy of [baseY - 0.12, topY + 0.12]) {
      const k = (baseY - yy) / (baseY - topY);
      const hw = 0.12 - 0.06 * k;
      c.beginPath();
      c.moveTo(cx - hw, yy);
      c.lineTo(cx + hw, yy);
      c.stroke();
    }
  }
  // pennant: shows where the wind is aimed
  const pa = b.angle;
  const flut = Math.sin(t * 9 + b.uid) * 0.12;
  c.save();
  c.translate(cx, topY - 0.02);
  c.strokeStyle = GOLD_DARK;
  c.lineWidth = 0.012;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, -0.22);
  c.stroke();
  c.translate(0, -0.2);
  c.scale(Math.cos(pa) >= 0 ? 1 : -1, 1);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(0.12, -0.02 + flut * 0.3, 0.24, flut);
  c.lineTo(0, 0.07);
  c.closePath();
  fo(c, SKY, 0.01, 'rgba(30,80,110,0.8)');
  c.restore();
  // sails turning (faster when blowing)
  const spin = t * (1.2 + Math.min(1, b.firing * 3) * 8) + b.uid;
  const hubY = topY + 0.06;
  const n = 4;
  const len = 0.34 + L * 0.04;
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * TAU;
    const ex = cx + Math.cos(a) * len,
      ey = hubY + Math.sin(a) * len * 0.8;
    const nx = -Math.sin(a) * 0.07,
      ny = Math.cos(a) * 0.07 * 0.8;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * 0.06, hubY + Math.sin(a) * 0.05);
    c.lineTo(ex, ey);
    c.lineTo(ex + nx, ey + ny);
    c.lineTo(cx + Math.cos(a) * 0.1 + nx, hubY + Math.sin(a) * 0.08 + ny);
    c.closePath();
    fo(c, i % 2 ? '#e8f8ff' : '#bfe9fb', 0.012, 'rgba(40,80,100,0.85)');
    c.strokeStyle = 'rgba(120,90,50,0.9)';
    c.lineWidth = 0.012;
    c.beginPath();
    c.moveTo(cx, hubY);
    c.lineTo(ex, ey);
    c.stroke();
  }
  circle(c, cx, hubY, 0.045);
  fo(c, goldGrad(c, cx - 0.04, hubY - 0.04, cx + 0.04, hubY + 0.04), 0.012, GOLD_DARK);
  // wind wisps when blowing
  const f = Math.min(1, b.firing * 3);
  if (f > 0) {
    c.strokeStyle = rgba('#ffffff', 0.7 * f);
    c.lineWidth = 0.02;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const d = 0.3 + i * 0.12 + (1 - f) * 0.3;
      const ox = cx + Math.cos(pa) * d,
        oy = cy - 0.1 + Math.sin(pa) * d;
      c.beginPath();
      c.arc(ox, oy, 0.08 + i * 0.03, pa - 0.9, pa + 0.9);
      c.stroke();
    }
  }
}

// ------------------------------------------------------------------ honey snare (trap)

function snare(c: C, b: Building, t: number) {
  const L = b.level;
  const cx = b.x + 0.5,
    cy = b.y + 0.52;
  // refilling after being sprung: firing counts down the recharge
  const L0 = b.def.levels[b.level];
  const full = b.firing > 0 ? Math.max(0.15, 1 - b.firing * (L0.rate ?? 0.4)) : 1;
  dropShadow(c, cx + 0.04, cy + 0.06, 0.4, 0.3);
  // wicker ring
  ell(c, cx, cy, 0.4, 0.33);
  fo(c, '#b8894a', 0.02);
  c.strokeStyle = 'rgba(100,66,24,0.8)';
  c.lineWidth = 0.012;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * 0.32, cy + Math.sin(a) * 0.26);
    c.lineTo(cx + Math.cos(a + 0.18) * 0.4, cy + Math.sin(a + 0.18) * 0.33);
    c.stroke();
  }
  if (L >= 1) {
    c.strokeStyle = GOLD;
    c.lineWidth = 0.014;
    ell(c, cx, cy, 0.37, 0.3);
    c.stroke();
  }
  // honey pool
  const r = 0.3 * (0.55 + 0.45 * full);
  ell(c, cx, cy + (1 - full) * 0.03, r, r * 0.8);
  const hg = c.createRadialGradient(cx - 0.08, cy - 0.06, 0.02, cx, cy, r);
  hg.addColorStop(0, '#fff2a8');
  hg.addColorStop(0.45, '#ffbf3a');
  hg.addColorStop(1, '#c7741a');
  fo(c, hg, 0.014, 'rgba(120,70,10,0.8)');
  // shine & a slow bubble
  c.fillStyle = 'rgba(255,255,240,0.75)';
  ell(c, cx - r * 0.35, cy - r * 0.35, r * 0.25, r * 0.1, -0.4);
  c.fill();
  const bp = (t * 0.5 + b.uid * 0.37) % 1;
  c.strokeStyle = rgba('#fff4c0', 0.8 * (1 - bp));
  c.lineWidth = 0.01;
  circle(c, cx + 0.08, cy + 0.04, 0.02 + bp * 0.04);
  c.stroke();
  if (L >= 2) {
    // honeycomb studs on the rim
    c.fillStyle = GOLD_LIGHT;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      poly(c, ngon(cx + Math.cos(a) * 0.4, cy + Math.sin(a) * 0.33, 0.035, 6));
      c.fill();
    }
  }
}

// ------------------------------------------------------------------ halo ring

function haloSpire(c: C, cx: number, cy: number, L: number) {
  const baseY = cy + 0.02,
    topY = cy - 0.62 - L * 0.06;
  c.beginPath();
  c.moveTo(cx - 0.11, baseY);
  c.quadraticCurveTo(cx - 0.1, (baseY + topY) / 2, cx - 0.035, topY + 0.06);
  c.lineTo(cx, topY - 0.06);
  c.lineTo(cx + 0.035, topY + 0.06);
  c.quadraticCurveTo(cx + 0.1, (baseY + topY) / 2, cx + 0.11, baseY);
  c.closePath();
  fo(c, marbleGrad(c, cx - 0.11, cx + 0.11), 0.016);
  // gold tip & rings
  c.beginPath();
  c.moveTo(cx - 0.035, topY + 0.06);
  c.lineTo(cx, topY - 0.06);
  c.lineTo(cx + 0.035, topY + 0.06);
  c.closePath();
  fo(c, GOLD_LIGHT, 0.01, GOLD_DARK);
  c.strokeStyle = GOLD;
  c.lineWidth = 0.014;
  for (let i = 0; i <= L; i++) {
    const y = baseY - 0.12 - i * 0.14;
    const k = (baseY - y) / (baseY - topY);
    const hw = 0.11 - 0.07 * k;
    ell(c, cx, y, hw, hw * 0.35);
    c.stroke();
  }
  return topY;
}

function halo(c: C, b: Building, cx: number, cy: number, t: number) {
  const L = b.level;
  const S = b.def.levels[b.level];
  const n = S.shots ?? 3;
  const icon = b.uid < 0;
  const R = icon ? 0.42 : (S.range ?? 1.8) * 0.92;
  const oy = cy - 0.3;
  const sy = 0.55;
  const bright = b.firing > 0 ? 1 : 0.6;
  // faint orbit
  c.strokeStyle = rgba('#fff6c8', icon ? 0.35 : 0.13);
  c.lineWidth = 0.02;
  ell(c, cx, oy, R, R * sy);
  c.stroke();
  const blade = (a: number) => {
    const x = cx + Math.cos(a) * R,
      y = oy + Math.sin(a) * R * sy;
    const tail = 0.55;
    c.lineCap = 'round';
    for (const [lw, col, al] of [
      [0.12, '#ffe58a', 0.25],
      [0.05, '#fffbe6', 0.9],
    ] as const) {
      c.strokeStyle = rgba(col, al * bright);
      c.lineWidth = lw;
      c.beginPath();
      c.ellipse(cx, oy, R, R * sy, 0, a - tail, a);
      c.stroke();
    }
    glow(c, x, y, 0.22, '#fff3b0', 0.55 * bright);
    c.fillStyle = '#ffffff';
    circle(c, x, y, 0.03);
    c.fill();
  };
  const angs = Array.from({ length: n }, (_, i) => b.spin + (i / n) * TAU);
  for (const a of angs) if (Math.sin(a) < 0) blade(a);
  haloSpire(c, cx, cy, L);
  glow(c, cx, cy - 0.6 - L * 0.06, 0.25, '#fff3b0', 0.4 + 0.15 * Math.sin(t * 3));
  for (const a of angs) if (Math.sin(a) >= 0) blade(a);
}

// ------------------------------------------------------------------ fountain

function fountain(c: C, b: Building, cx: number, cy: number, t: number) {
  const L = b.level;
  const by = cy + 0.08;
  dropShadow(c, cx + 0.06, by + 0.12, 0.44, 0.2);
  // basin
  ell(c, cx, by + 0.06, 0.42, 0.22);
  fo(c, MARBLE_DARK, 0.018);
  ell(c, cx, by, 0.42, 0.22);
  fo(c, marbleGrad(c, cx - 0.42, cx + 0.42), 0.018);
  ell(c, cx, by - 0.01, 0.35, 0.17);
  const wg = c.createRadialGradient(cx - 0.1, by - 0.05, 0.02, cx, by, 0.36);
  wg.addColorStop(0, '#d8f6ff');
  wg.addColorStop(0.6, '#6cc9ef');
  wg.addColorStop(1, '#3a8fc0');
  fo(c, wg, 0.012, 'rgba(40,90,120,0.6)');
  // ripples
  for (let i = 0; i < 2; i++) {
    const p = (t * 0.5 + i * 0.5 + b.uid * 0.1) % 1;
    c.strokeStyle = rgba('#ffffff', 0.5 * (1 - p));
    c.lineWidth = 0.01;
    ell(c, cx, by - 0.01, 0.08 + p * 0.26, (0.08 + p * 0.26) * 0.48);
    c.stroke();
  }
  if (L >= 1) {
    c.strokeStyle = GOLD;
    c.lineWidth = 0.016;
    ell(c, cx, by, 0.42, 0.22);
    c.stroke();
  }
  // central pillar & bowl
  const ph = 0.32 + L * 0.06;
  c.beginPath();
  c.rect(cx - 0.04, by - ph, 0.08, ph);
  fo(c, marbleGrad(c, cx - 0.04, cx + 0.04), 0.012);
  ell(c, cx, by - ph, 0.13, 0.05);
  fo(c, L >= 2 ? GOLD_LIGHT : '#f6f1e5', 0.014);
  // jets & droplets
  const jy = by - ph - 0.02;
  c.strokeStyle = 'rgba(210,245,255,0.85)';
  c.lineWidth = 0.022;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx, jy);
  c.lineTo(cx, jy - 0.16 - 0.02 * Math.sin(t * 8));
  c.stroke();
  const drops = 8 + L * 2;
  for (let i = 0; i < drops; i++) {
    const p = (t * 0.9 + i / drops) % 1;
    const a = (i / drops) * TAU + b.uid;
    const dist = p * 0.3;
    const x = cx + Math.cos(a) * dist,
      y = jy - 0.16 + p * 0.9 * p * 0.55 - p * 0.05 + Math.sin(a) * dist * 0.4;
    c.fillStyle = rgba('#e8fbff', 0.9 * (1 - p * 0.6));
    circle(c, x, y, 0.016);
    c.fill();
  }
}

// ------------------------------------------------------------------ falcon roost

function falconry(c: C, b: Building, cx: number, cy: number, t: number) {
  const L = b.level;
  const baseY = cy + 0.02,
    topY = cy - 0.55 - L * 0.04;
  // marble pillar
  c.beginPath();
  c.moveTo(cx - 0.1, baseY);
  c.lineTo(cx - 0.07, topY + 0.04);
  c.lineTo(cx + 0.07, topY + 0.04);
  c.lineTo(cx + 0.1, baseY);
  c.closePath();
  fo(c, marbleGrad(c, cx - 0.1, cx + 0.1), 0.016);
  if (L >= 1) {
    c.fillStyle = GOLD;
    c.fillRect(cx - 0.085, baseY - 0.16, 0.17, 0.025);
  }
  // nest on a side arm
  c.strokeStyle = '#6a4826';
  c.lineWidth = 0.03;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx, topY + 0.22);
  c.lineTo(cx - 0.22, topY + 0.18);
  c.stroke();
  ell(c, cx - 0.24, topY + 0.16, 0.11, 0.05);
  fo(c, '#a8803e', 0.012);
  c.strokeStyle = 'rgba(90,60,20,0.8)';
  c.lineWidth = 0.008;
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.moveTo(cx - 0.33 + i * 0.045, topY + 0.14);
    c.lineTo(cx - 0.3 + i * 0.045, topY + 0.19);
    c.stroke();
  }
  // T-perch
  c.strokeStyle = L >= 1 ? GOLD : '#7a5530';
  c.lineWidth = 0.028;
  c.beginPath();
  c.moveTo(cx - 0.2, topY);
  c.lineTo(cx + 0.2, topY);
  c.stroke();
  if (L >= 2) {
    circle(c, cx - 0.2, topY, 0.025);
    fo(c, GOLD_LIGHT, 0.008, GOLD_DARK);
    circle(c, cx + 0.2, topY, 0.025);
    fo(c, GOLD_LIGHT, 0.008, GOLD_DARK);
  }
  // a falcon at rest when none are being loosed
  if (b.firing <= 0) {
    const fx = cx + 0.08,
      fy = topY - 0.02;
    const look = Math.sin(t * 0.7 + b.uid) > 0.6 ? -1 : 1;
    c.save();
    c.translate(fx, fy);
    c.scale(look * 1.45, 1.45);
    // body
    c.beginPath();
    c.moveTo(-0.05, 0);
    c.quadraticCurveTo(-0.07, -0.13, 0.0, -0.17);
    c.quadraticCurveTo(0.07, -0.12, 0.05, 0);
    c.closePath();
    fo(c, '#9c6a3a', 0.01);
    // chest
    ell(c, 0.005, -0.07, 0.03, 0.05);
    c.fillStyle = '#f2e6cc';
    c.fill();
    // head + hood
    circle(c, 0.01, -0.18, 0.04);
    fo(c, '#5a3e22', 0.01);
    c.fillStyle = GOLD_LIGHT;
    poly(c, [
      [0.045, -0.185],
      [0.075, -0.175],
      [0.045, -0.165],
    ]);
    c.fill();
    c.restore();
  }
}

// ------------------------------------------------------------------ sun lens

function lens(c: C, b: Building, cx: number, cy: number, t: number) {
  const L = b.level;
  const hy = cy - 0.36 - L * 0.04;
  // tripod
  c.strokeStyle = '#8a5a20';
  c.lineWidth = 0.03;
  c.lineCap = 'round';
  for (const [dx, dy] of [
    [-0.22, 0.12],
    [0.22, 0.12],
    [0.0, 0.2],
  ]) {
    c.beginPath();
    c.moveTo(cx, hy + 0.08);
    c.lineTo(cx + dx, cy + dy);
    c.stroke();
  }
  c.strokeStyle = GOLD_LIGHT;
  c.lineWidth = 0.01;
  for (const [dx, dy] of [
    [-0.22, 0.12],
    [0.22, 0.12],
  ]) {
    c.beginPath();
    c.moveTo(cx, hy + 0.08);
    c.lineTo(cx + dx, cy + dy);
    c.stroke();
  }
  // lens disc, turned to face the target: the disc is seen edge-on along the aim line
  const a = b.angle;
  const R = 0.24 + L * 0.03;
  const face = 0.35 + 0.65 * Math.abs(Math.sin(a)); // apparent width from above
  c.save();
  c.translate(cx, hy);
  c.rotate(a + Math.PI / 2);
  ell(c, 0, 0, R, R * 0.28 * face + 0.05);
  const gg = c.createLinearGradient(-R, 0, R, 0);
  gg.addColorStop(0, 'rgba(210,245,255,0.85)');
  gg.addColorStop(0.5, 'rgba(140,215,255,0.7)');
  gg.addColorStop(1, 'rgba(90,170,220,0.85)');
  c.fillStyle = gg;
  c.fill();
  c.strokeStyle = goldGrad(c, -R, 0, R, 0);
  c.lineWidth = 0.035 + L * 0.008;
  c.stroke();
  c.strokeStyle = GOLD_DARK;
  c.lineWidth = 0.008;
  c.stroke();
  // glint
  c.fillStyle = 'rgba(255,255,255,0.85)';
  ell(c, -R * 0.4, -0.01, R * 0.18, 0.012);
  c.fill();
  c.restore();
  if (L >= 1) {
    // little sun crest
    circle(c, cx, hy - 0.14, 0.035);
    fo(c, GOLD_LIGHT, 0.01, GOLD_DARK);
  }
  if (b.firing > 0) glow(c, cx + Math.cos(a) * 0.08, hy + Math.sin(a) * 0.05, 0.35, '#fff6c0', 0.7 + 0.2 * Math.sin(t * 30));
}

// ------------------------------------------------------------------ dawn ballista

function ballista(c: C, b: Building, cx: number, cy: number) {
  const L = b.level;
  const ty = cy - 0.08;
  // turntable
  ell(c, cx, ty + 0.05, 0.3, 0.16);
  fo(c, MARBLE_MID, 0.016);
  ell(c, cx, ty, 0.3, 0.16);
  fo(c, marbleGrad(c, cx - 0.3, cx + 0.3), 0.016);
  if (L >= 1) {
    c.strokeStyle = GOLD;
    c.lineWidth = 0.014;
    ell(c, cx, ty, 0.25, 0.13);
    c.stroke();
  }
  c.save();
  c.translate(cx, ty - 0.06);
  c.rotate(b.angle);
  const rec = b.recoil;
  // stock
  c.beginPath();
  c.rect(-0.3, -0.045, 0.52, 0.09);
  const wg = c.createLinearGradient(0, -0.045, 0, 0.045);
  wg.addColorStop(0, '#d8ab6c');
  wg.addColorStop(1, '#7a5228');
  fo(c, wg, 0.014);
  // bow arms (wide, recurved), flex back on recoil
  const span = 0.42 + L * 0.05;
  const flex = 0.07 + (1 - rec) * 0.05;
  c.strokeStyle = '#6a4418';
  c.lineWidth = 0.05;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(0.06, -span);
  c.quadraticCurveTo(0.2, -span * 0.4, 0.14, 0);
  c.quadraticCurveTo(0.2, span * 0.4, 0.06, span);
  c.stroke();
  c.strokeStyle = goldGrad(c, 0, -span, 0, span);
  c.lineWidth = 0.022;
  c.stroke();
  // gold wing-tips
  for (const s of [-1, 1]) {
    c.fillStyle = GOLD_LIGHT;
    poly(c, [
      [0.06, s * span],
      [-0.06, s * (span + 0.06)],
      [0.02, s * (span - 0.06)],
    ]);
    c.fill();
  }
  // string drawn back, released on recoil
  const sx = 0.06 - flex - (1 - rec) * 0.12;
  c.strokeStyle = 'rgba(250,245,230,0.95)';
  c.lineWidth = 0.012;
  c.beginPath();
  c.moveTo(0.06, -span);
  c.lineTo(sx, 0);
  c.lineTo(0.06, span);
  c.stroke();
  // bolt (gone just after a shot)
  if (rec < 0.4) {
    c.strokeStyle = '#fff0c8';
    c.lineWidth = 0.022;
    c.beginPath();
    c.moveTo(sx, 0);
    c.lineTo(0.44, 0);
    c.stroke();
    c.fillStyle = GOLD_LIGHT;
    poly(c, [
      [0.44, -0.035],
      [0.54, 0],
      [0.44, 0.035],
    ]);
    c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------------ winged titan

function titanStatue(c: C, L: number) {
  // cached, local origin = tile centre
  return cached(`titan|${L}`, pxOf(c), -0.95, -2.05, 1.9, 2.3, (g) => {
    const h = 1.32 + L * 0.06;
    const sh = -h * 0.78;
    const span = 0.7 + L * 0.08;
    // grand wings rising behind
    wing(g, -0.08, sh + 0.06, span, -1, 0.75, L >= 1);
    wing(g, 0.08, sh + 0.06, span, 1, 0.75, L >= 1);
    if (L >= 2) {
      wing(g, -0.06, sh + 0.2, span * 0.75, -1, 0.25, true);
      wing(g, 0.06, sh + 0.2, span * 0.75, 1, 0.25, true);
    }
    guardian(g, 0, -0.02, h, Math.max(1, L));
    // great sword held point-down in front
    const sTop = sh + 0.22;
    g.fillStyle = goldGrad(g, -0.04, sTop, 0.04, 0);
    poly(g, [
      [-0.045, sTop + 0.1],
      [0.045, sTop + 0.1],
      [0.03, -0.1],
      [0, 0.0],
      [-0.03, -0.1],
    ]);
    g.fill();
    g.strokeStyle = OUT;
    g.lineWidth = 0.014;
    g.stroke();
    g.fillStyle = '#fffbea';
    g.fillRect(-0.008, sTop + 0.12, 0.016, -sTop - 0.24);
    g.fillStyle = GOLD;
    g.fillRect(-0.16, sTop + 0.06, 0.32, 0.05);
    g.strokeRect(-0.16, sTop + 0.06, 0.32, 0.05);
    g.fillStyle = '#8a5a20';
    g.fillRect(-0.025, sTop - 0.08, 0.05, 0.14);
    circle(g, 0, sTop - 0.1, 0.035);
    fo(g, GOLD_LIGHT, 0.01, GOLD_DARK);
    ell(g, 0, sTop - 0.01, 0.075, 0.035);
    fo(g, '#f4efe3', 0.012);
  });
}

function titan(c: C, b: Building, cx: number, cy: number, t: number) {
  const L = b.level;
  // larger round pedestal
  ell(c, cx, cy + 0.06, 0.34, 0.15);
  fo(c, MARBLE_MID, 0.018);
  ell(c, cx, cy + 0.0, 0.34, 0.15);
  fo(c, marbleGrad(c, cx - 0.34, cx + 0.34), 0.018);
  c.strokeStyle = GOLD;
  c.lineWidth = L >= 1 ? 0.02 : 0.012;
  ell(c, cx, cy, 0.28, 0.12);
  c.stroke();
  if (b.firing > 0) {
    // leapt away: an empty, glowing pedestal and drifting feathers
    glow(c, cx, cy - 0.1, 0.6, '#fff3c8', 0.55);
    for (let i = 0; i < 5; i++) {
      const p = (t * 0.7 + i / 5) % 1;
      const x = cx + Math.sin(t * 2 + i * 1.7) * 0.25,
        y = cy - 0.2 - p * 0.8;
      c.save();
      c.translate(x, y);
      c.rotate(Math.sin(t * 3 + i) * 0.8);
      c.globalAlpha *= 1 - p;
      ell(c, 0, 0, 0.05, 0.016);
      c.fillStyle = '#ffffff';
      c.fill();
      c.restore();
    }
    return;
  }
  const bob = Math.sin(t * 1.4 + b.uid) * 0.01;
  c.drawImage(titanStatue(c, L), cx - 0.95, cy - 2.05 + bob, 1.9, 2.3);
}

// ------------------------------------------------------------------ dispatch

const FLAT = new Set(['glyph', 'snare']);
const NO_PLINTH = new Set(['colonnade', 'glyph', 'snare', 'aviary', 'fountain', 'titan']);

/** Draws a day-realm building. Returns false if `b` isn't a day building. */
export function drawDayBuilding(ctx: C, b: Building, t: number, game: Game): boolean {
  if (b.def.realm !== 'day') return false;
  const id = b.def.id;
  const cx = b.x + 0.5,
    cy = b.y + 0.5;
  ctx.save();
  if (!NO_PLINTH.has(id)) plinth(ctx, b);
  switch (id) {
    case 'colonnade':
      colonnade(ctx, b, game, t);
      break;
    case 'javelin':
      javelin(ctx, b, cx, cy, t);
      break;
    case 'glyph':
      glyph(ctx, b, t);
      break;
    case 'aviary':
      aviary(ctx, b, cx, cy, t);
      break;
    case 'bell':
      bell(ctx, b, cx, cy, t);
      break;
    case 'windcatcher':
      windcatcher(ctx, b, cx, cy, t);
      break;
    case 'snare':
      snare(ctx, b, t);
      break;
    case 'halo':
      halo(ctx, b, cx, cy, t);
      break;
    case 'fountain':
      fountain(ctx, b, cx, cy, t);
      break;
    case 'falconry':
      falconry(ctx, b, cx, cy, t);
      break;
    case 'lens':
      lens(ctx, b, cx, cy, t);
      break;
    case 'ballista':
      ballista(ctx, b, cx, cy);
      break;
    case 'titan':
      titan(ctx, b, cx, cy, t);
      break;
  }
  if (id !== 'colonnade') dayPips(ctx, cx, b.y + (FLAT.has(id) ? 0.94 : 0.9), b.level);
  if (b.buff > 0 && b.def.kind === 'tower') buffSparkles(ctx, b, t);
  if (b.hurt > 0) glow(ctx, cx, cy - 0.1, 0.65, '#ff3030', Math.min(1, b.hurt * 5) * 0.65);
  ctx.restore();
  return true;
}

/** How tall a day building is, for icon framing: 0 = squat, 0.5 = tall, 1 = very tall. */
export function dayIconTall(id: string): number {
  if (id === 'titan') return 1.25;
  if (id === 'windcatcher' || id === 'bell' || id === 'halo' || id === 'falconry' || id === 'aviary') return 0.5;
  return 0;
}

// ------------------------------------------------------------------ the Sanctum (day core)

function sanctumDais(c: C, L: number) {
  return cached(`sanctum-dais|${L}`, pxOf(c), -1.75, -1.6, 3.5, 3.4, (g) => {
    // shadow on the meadow
    g.fillStyle = SHADOW;
    ell(g, 0.12, 0.28, 1.52, 1.32);
    g.fill();
    // three round steps
    const steps: [number, string][] = [
      [1.48, '#d7ceb9'],
      [1.3, '#e6dfcf'],
      [1.1, '#f1ece0'],
    ];
    steps.forEach(([r, col], i) => {
      const y = -i * 0.07;
      ell(g, 0, y + 0.1, r, r * 0.86);
      g.fillStyle = shade(col, -0.18);
      g.fill();
      ell(g, 0, y, r, r * 0.86);
      const gr = g.createLinearGradient(-r, y - r, r, y + r);
      gr.addColorStop(0, shade(col, 0.12));
      gr.addColorStop(1, shade(col, -0.08));
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = OUT;
      g.lineWidth = 0.022;
      g.stroke();
    });
    // floor pattern: radiating inlay
    const fy = -0.14;
    g.strokeStyle = rgba(GOLD, L >= 1 ? 0.75 : 0.45);
    g.lineWidth = 0.018;
    ell(g, 0, fy, 0.78, 0.67);
    g.stroke();
    ell(g, 0, fy, 0.42, 0.36);
    g.stroke();
    g.lineWidth = 0.012;
    g.beginPath();
    const rays = 12 + L * 4;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU;
      g.moveTo(Math.cos(a) * 0.42, fy + Math.sin(a) * 0.36);
      g.lineTo(Math.cos(a) * (i % 2 ? 0.66 : 0.78), fy + Math.sin(a) * (i % 2 ? 0.57 : 0.67));
    }
    g.stroke();
    if (L >= 2) {
      g.strokeStyle = rgba(SKY, 0.6);
      g.lineWidth = 0.014;
      ell(g, 0, 0.0, 1.38, 1.18);
      g.stroke();
    }
    // laurel garland on the outer step
    if (L >= 3) {
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU;
        const x = Math.cos(a) * 1.4,
          y = 0.08 + Math.sin(a) * 1.2;
        g.fillStyle = i % 2 ? '#7aa84a' : '#94c25a';
        ell(g, x, y, 0.05, 0.022, a + 0.6);
        g.fill();
      }
    }
  });
}

function column(c: C, x: number, y: number, h: number, gold: boolean) {
  const w = 0.09;
  // base
  ell(c, x, y + 0.01, w * 1.3, w * 0.5);
  fo(c, '#ece5d4', 0.014);
  // shaft
  c.beginPath();
  c.rect(x - w / 2, y - h, w, h);
  fo(c, marbleGrad(c, x - w / 2, x + w / 2), 0.014);
  c.strokeStyle = 'rgba(130,118,95,0.4)';
  c.lineWidth = 0.006;
  c.beginPath();
  c.moveTo(x - w * 0.15, y - h + 0.03);
  c.lineTo(x - w * 0.15, y - 0.02);
  c.moveTo(x + w * 0.15, y - h + 0.03);
  c.lineTo(x + w * 0.15, y - 0.02);
  c.stroke();
  // capital
  c.beginPath();
  c.rect(x - w * 0.8, y - h - 0.04, w * 1.6, 0.05);
  fo(c, gold ? GOLD_LIGHT : '#f8f3e8', 0.012, gold ? GOLD_DARK : OUT);
}

export function drawSanctum(ctx: C, game: Game, t: number): void {
  const L = game.coreLevel;
  const cx = CORE_X + 0.5,
    cy = CORE_Y + 0.5;
  const hpk = Math.max(0, Math.min(1, game.coreHp / game.coreMaxHp));
  const gk = 0.45 + 0.55 * hpk;
  const hurt = Math.max(0, Math.min(1, game.coreHurt * 4));
  ctx.save();
  ctx.drawImage(sanctumDais(ctx, L), cx - 1.75, cy - 1.6, 3.5, 3.4);

  const n = 6 + L * 2;
  const R = 0.98,
    ry = 0.84,
    colH = 0.62 + L * 0.06;
  const cols = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU + Math.PI / n;
    return { a, x: cx + Math.cos(a) * R, y: cy - 0.08 + Math.sin(a) * R * ry };
  });
  const goldCols = L >= 3;
  const ringY = (y: number) => y - colH - 0.04;
  // back columns
  for (const p of cols) if (Math.sin(p.a) < 0) column(ctx, p.x, p.y, colH, goldCols);
  // back half of the entablature ring
  const band = (from: number, to: number) => {
    ctx.beginPath();
    ctx.ellipse(cx, ringY(cy - 0.08), R, R * ry, 0, from, to);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 0.11;
    ctx.stroke();
    ctx.strokeStyle = L >= 2 ? GOLD : '#f6f1e5';
    ctx.lineWidth = 0.085;
    ctx.stroke();
    if (L >= 2) {
      ctx.strokeStyle = GOLD_LIGHT;
      ctx.lineWidth = 0.02;
      ctx.stroke();
    }
  };
  band(Math.PI, TAU);

  // open dome: gold ribs from the ring up to an apex above the orb (behind half first)
  const ringTop = ringY(cy - 0.08);
  const apexY = ringTop - 0.75 - L * 0.06;
  const ribs = L >= 3 ? cols : L >= 2 ? cols.filter((_, i) => i % 2 === 0) : [];
  const rib = (p: { x: number; y: number }, alpha: number) => {
    const py = ringY(p.y);
    ctx.beginPath();
    ctx.moveTo(p.x, py);
    ctx.quadraticCurveTo(p.x + (cx - p.x) * 0.15, apexY + (py - apexY) * 0.15, cx, apexY);
    ctx.strokeStyle = rgba(GOLD_DARK, alpha);
    ctx.lineWidth = 0.05;
    ctx.stroke();
    ctx.strokeStyle = rgba(GOLD_LIGHT, alpha);
    ctx.lineWidth = 0.022;
    ctx.stroke();
  };
  for (const p of ribs) if (Math.sin(p.a) < 0) rib(p, 0.9);

  // central pedestal and the sun-orb floating above it
  const pulse = 1 + 0.06 * Math.sin(t * 2.1);
  const oy = ringTop - 0.15 + Math.sin(t * 1.3) * 0.04;
  const orbR = 0.3 + L * 0.025;
  ctx.beginPath();
  ctx.rect(cx - 0.07, cy - 0.5, 0.14, 0.38);
  fo(ctx, marbleGrad(ctx, cx - 0.07, cx + 0.07), 0.016);
  ell(ctx, cx, cy - 0.5, 0.13, 0.05);
  fo(ctx, L >= 1 ? GOLD_LIGHT : '#f6f1e5', 0.014, L >= 1 ? GOLD_DARK : OUT);
  // shaft of light between pedestal and orb
  const beam = ctx.createLinearGradient(0, oy, 0, cy - 0.5);
  beam.addColorStop(0, rgba('#fff4c8', 0.7 * gk));
  beam.addColorStop(1, rgba('#fff4c8', 0.1));
  ctx.fillStyle = beam;
  ctx.fillRect(cx - 0.05, oy, 0.1, cy - 0.5 - oy);
  const orbCol = hurt > 0 ? '#ff6a5a' : '#ffd86a';
  glow(ctx, cx, oy, 1.45 * pulse, orbCol, 0.4 * gk);
  if (L >= 4) {
    const flap = Math.sin(t * 1.6) * 0.06;
    wing(ctx, cx - 0.2, oy + 0.05, 0.95, -1, 0.35 + flap, true);
    wing(ctx, cx + 0.2, oy + 0.05, 0.95, 1, 0.35 + flap, true);
  }
  // rays
  ctx.save();
  ctx.translate(cx, oy);
  ctx.rotate(t * 0.25);
  const nr = 12 + L * 2;
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * TAU;
    const len = (i % 2 ? 0.5 : 0.72) * pulse * (orbR / 0.3);
    ctx.fillStyle = rgba(i % 2 ? '#fff4c8' : '#ffd86a', 0.8 * gk);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.09) * orbR * 0.9, Math.sin(a - 0.09) * orbR * 0.9);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.lineTo(Math.cos(a + 0.09) * orbR * 0.9, Math.sin(a + 0.09) * orbR * 0.9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const og = ctx.createRadialGradient(cx - orbR * 0.3, oy - orbR * 0.3, 0.02, cx, oy, orbR);
  og.addColorStop(0, '#ffffff');
  og.addColorStop(0.45, hurt > 0 ? '#ffb0a0' : '#fff2b0');
  og.addColorStop(1, hurt > 0 ? '#e0503a' : '#f2a72c');
  circle(ctx, cx, oy, orbR);
  ctx.globalAlpha *= 0.55 + 0.45 * gk;
  fo(ctx, og, 0.022, 'rgba(150,90,20,0.85)');
  ctx.globalAlpha = 1;
  if (L >= 2) {
    for (let k = 0; k < (L >= 3 ? 2 : 1); k++) {
      ctx.strokeStyle = rgba('#fff6d0', 0.75 * gk);
      ctx.lineWidth = 0.028;
      ctx.beginPath();
      ctx.ellipse(cx, oy, orbR + 0.16 + k * 0.14, (0.12 + k * 0.05) * (1 + 0.1 * Math.sin(t + k)), Math.sin(t * 0.5 + k) * 0.3, 0, TAU);
      ctx.stroke();
    }
  }
  // gun emitter: a spark on the orb's rim toward the target
  glow(ctx, cx + Math.cos(game.coreAngle) * orbR, oy + Math.sin(game.coreAngle) * orbR, 0.14, '#ffffff', 0.6 * gk);

  // front columns, the front half of the ring, front ribs
  for (const p of cols) if (Math.sin(p.a) >= 0) column(ctx, p.x, p.y, colH, goldCols);
  band(0, Math.PI);
  for (const p of ribs) if (Math.sin(p.a) >= 0) rib(p, 0.55);
  if (ribs.length) {
    circle(ctx, cx, apexY, 0.06);
    fo(ctx, GOLD_LIGHT, 0.012, GOLD_DARK);
  }
  if (hurt > 0) glow(ctx, cx, cy - 0.3, 1.6, '#ff3030', hurt * 0.5);
  ctx.restore();
}

// ------------------------------------------------------------------ blight-well (day rift)

export function drawBlightWell(ctx: C, x: number, y: number, t: number, state: 'open' | 'forming'): void {
  const cx = x + 0.5,
    cy = y + 0.5;
  const open = state === 'open';
  ctx.save();
  if (!open) {
    // a faint, cracking patch of rot
    ctx.globalAlpha *= 0.45 + 0.3 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 1.7));
    ctx.fillStyle = 'rgba(70,60,30,0.45)';
    ell(ctx, cx, cy, 0.5, 0.4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,40,90,0.85)';
    ctx.lineWidth = 0.025;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 0.25, cy + Math.sin(a) * 0.2);
      ctx.lineTo(cx + Math.cos(a + 0.3) * 0.45, cy + Math.sin(a + 0.3) * 0.36);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  // stain of rot spreading into the meadow
  const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1.25);
  sg.addColorStop(0, 'rgba(60,50,40,0.6)');
  sg.addColorStop(0.5, 'rgba(90,100,40,0.3)');
  sg.addColorStop(1, 'rgba(90,100,40,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(cx - 1.3, cy - 1.3, 2.6, 2.6);
  // irregular pool of rot
  const blob = (r: number, wob: number, seed: number) => {
    ctx.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (1 + wob * (hash(seed + i % n) - 0.5) + 0.04 * Math.sin(t * 1.5 + i));
      const px = cx + Math.cos(a) * rr,
        py = cy + Math.sin(a) * rr * 0.78;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  };
  blob(0.56, 0.35, 11);
  const pg = ctx.createRadialGradient(cx, cy, 0.05, cx, cy, 0.58);
  pg.addColorStop(0, '#120a14');
  pg.addColorStop(0.5, '#3a2140');
  pg.addColorStop(0.85, '#6a7a2a');
  pg.addColorStop(1, '#4a5a22');
  fo(ctx, pg, 0.025, 'rgba(30,20,24,0.9)');
  // sickly sheen rings
  blob(0.36, 0.3, 29);
  ctx.strokeStyle = rgba('#9ad23a', 0.35 + 0.15 * Math.sin(t * 2));
  ctx.lineWidth = 0.02;
  ctx.stroke();
  // the deep well
  ell(ctx, cx, cy, 0.17, 0.13);
  const dg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.18);
  dg.addColorStop(0, '#000000');
  dg.addColorStop(1, '#4a1a5a');
  ctx.fillStyle = dg;
  ctx.fill();
  // bramble vines coiling around the rim, thorns pointing out
  for (let v = 0; v < 3; v++) {
    const a0 = (v / 3) * TAU + t * 0.05 + 0.4;
    const sweep = 1.7;
    ctx.lineCap = 'round';
    for (const [lw, col] of [
      [0.06, '#2a1a24'],
      [0.025, '#5a4a30'],
    ] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let k = 0; k <= 14; k++) {
        const a = a0 + (k / 14) * sweep;
        const r = 0.52 + 0.07 * Math.sin(k * 1.3 + v);
        const px = cx + Math.cos(a) * r,
          py = cy + Math.sin(a) * r * 0.78;
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#1e1218';
    for (let k = 1; k < 7; k++) {
      const a = a0 + (k / 7) * sweep;
      const r = 0.52 + 0.07 * Math.sin(k * 2 + v);
      const px = cx + Math.cos(a) * r,
        py = cy + Math.sin(a) * r * 0.78;
      const out = k % 2 ? 1 : -0.7;
      poly(ctx, [
        [px - Math.sin(a) * 0.03, py + Math.cos(a) * 0.03 * 0.78],
        [px + Math.cos(a) * 0.09 * out, py + Math.sin(a) * 0.09 * 0.78 * out],
        [px + Math.sin(a) * 0.03, py - Math.cos(a) * 0.03 * 0.78],
      ]);
      ctx.fill();
    }
  }
  // bubbling ooze
  for (let i = 0; i < 6; i++) {
    const p = (t * 0.7 + hash(i * 31 + x * 7 + y)) % 1;
    const a = hash(i * 13 + x) * TAU;
    const r = 0.18 + hash(i * 17 + y) * 0.22;
    const bx = cx + Math.cos(a) * r,
      by = cy + Math.sin(a) * r * 0.78;
    ctx.strokeStyle = rgba(i % 2 ? '#b6e04a' : '#c06ae0', 0.85 * (1 - p));
    ctx.lineWidth = 0.012;
    circle(ctx, bx, by - p * 0.04, 0.015 + p * 0.035);
    ctx.stroke();
  }
  // glow & rising spores
  glow(ctx, cx, cy, 0.75, '#8ad03a', 0.2 + 0.06 * Math.sin(t * 2.3));
  for (let i = 0; i < 6; i++) {
    const p = (t * 0.35 + i / 6) % 1;
    const sx = cx + Math.sin(t * 1.3 + i * 2.1) * 0.35,
      sy = cy - p * 1.0;
    ctx.fillStyle = rgba(i % 2 ? '#c6ff6a' : '#d9a0ff', 0.75 * (1 - p));
    circle(ctx, sx, sy, 0.022);
    ctx.fill();
  }
  ctx.restore();
}
