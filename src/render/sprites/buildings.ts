import { BUILDINGS, BuildingId } from '../../game/config';
import type { Building, Game } from '../../game/game';
import { cached, facet, glow, hash, ngon, poly, pxOf, rgba, shade, TRng } from './util';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function circle(c: C, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}

// ------------------------------------------------------------------ plinth

const PLINTH = '#3a4256';

function plinthCanvas(c: C, col: string, level: number) {
  return cached(`plinth|${col}|${level}`, pxOf(c), -0.05, -0.05, 1.1, 1.2, (g) => {
    const top = ngon(0.5, 0.47, 0.43, 8, Math.PI / 8, 0.86);
    // drop shadow
    g.fillStyle = 'rgba(0,0,0,0.38)';
    poly(
      g,
      top.map(([x, y]) => [x + 0.06, y + 0.14]),
    );
    g.fill();
    // skirt (front face)
    g.fillStyle = '#1b1f2c';
    poly(
      g,
      top.map(([x, y]) => [x, y + 0.09]),
    );
    g.fill();
    g.fillStyle = '#262c3c';
    g.beginPath();
    g.moveTo(top[7][0], top[7][1]);
    g.lineTo(top[7][0], top[7][1] + 0.09);
    for (let i = 0; i < 4; i++) g.lineTo(top[i][0], top[i][1] + 0.09);
    g.lineTo(top[3][0], top[3][1]);
    g.closePath();
    g.fill();
    facet(g, top, 0.42, 0.38, level === 2 ? '#434b62' : PLINTH, 0.3, 'rgba(8,10,18,0.9)', 0.025);
    // inner slab
    const inner = ngon(0.5, 0.47, 0.3, 8, Math.PI / 8, 0.86);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 0.02;
    poly(g, inner);
    g.stroke();
    if (level >= 1) {
      g.strokeStyle = rgba(col, 0.55);
      g.lineWidth = 0.022;
      poly(g, ngon(0.5, 0.47, 0.39, 8, Math.PI / 8, 0.86));
      g.stroke();
    }
    if (level >= 2) {
      for (const [x, y] of top) {
        g.fillStyle = '#e8c070';
        circle(g, x + (0.5 - x) * 0.12, y + (0.47 - y) * 0.12, 0.028);
        g.fill();
      }
    }
  });
}

function plinth(c: C, b: Building) {
  const cv = plinthCanvas(c, b.def.color, b.level);
  c.drawImage(cv, b.x - 0.05, b.y - 0.05, 1.1, 1.2);
}

function pips(c: C, cx: number, y: number, level: number, col: string) {
  for (let i = 0; i <= level; i++) {
    const x = cx + (i - level / 2) * 0.1;
    c.fillStyle = rgba(col, 0.35);
    circle(c, x, y, 0.035);
    c.fill();
    c.fillStyle = shade(col, 0.5);
    circle(c, x, y, 0.018);
    c.fill();
  }
}

// ------------------------------------------------------------------ walls

const WALL_TOP = ['#454c5e', '#4d5569', '#565f76'];
const WALL_FRONT = ['#23273a', '#282d40', '#2e3448'];

function wallCanvas(c: C, mask: number, L: number) {
  return cached(`wall|${mask}|${L}`, pxOf(c), -0.02, -0.25, 1.12, 1.4, (g) => {
    const N = mask & 1,
      E = mask & 2,
      S = mask & 4,
      W = mask & 8;
    const h = 0.2,
      ins = 0.1;
    const x0 = W ? 0 : ins,
      x1 = E ? 1 : 1 - ins;
    const fy0 = N ? 0 : ins,
      fy1 = S ? 1 : 1 - ins;
    const y0 = fy0 - h,
      y1 = fy1 - h;
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x0 + 0.06, fy0 + 0.02, x1 - x0, fy1 - fy0 + 0.05);
    // front face
    if (!S) {
      g.fillStyle = WALL_FRONT[L];
      g.fillRect(x0, y1, x1 - x0, h);
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = 0.015;
      g.beginPath();
      for (let x = 0.25; x < 1; x += 0.25) {
        if (x <= x0 || x >= x1) continue;
        g.moveTo(x + (L === 1 ? 0.06 : 0), y1);
        g.lineTo(x + (L === 1 ? 0.06 : 0), y1 + h);
      }
      g.moveTo(x0, y1 + h * 0.5);
      g.lineTo(x1, y1 + h * 0.5);
      g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x0, y1 + h - 0.03, x1 - x0, 0.03);
    }
    // side faces for exposed E/W ends (subtle)
    // top face
    const grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, shade(WALL_TOP[L], 0.08));
    grd.addColorStop(1, shade(WALL_TOP[L], -0.1));
    g.fillStyle = grd;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // bricks
    g.save();
    g.beginPath();
    g.rect(x0, y0, x1 - x0, y1 - y0);
    g.clip();
    const rows = L === 0 ? 4 : 3;
    {
      const step = L === 0 ? 0.5 : 0.66;
      for (let r = 0; r < rows; r++) {
        const yy = -h + r / rows;
        const off = r % 2 ? 0.5 / (L === 0 ? 2 : 1.5) : 0;
        for (let x = off - step; x < 1; x += step) {
          const v = hash(mask * 131 + r * 17 + Math.round(x * 10) + L * 999);
          g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.18 * (0.5 - v)})` : `rgba(200,210,255,${0.1 * (v - 0.5)})`;
          g.fillRect(x, yy, step, 1 / rows);
          if (v > 0.8) {
            g.fillStyle = 'rgba(70,120,90,0.25)';
            g.beginPath();
            g.ellipse(x + step * 0.3, yy + 0.8 / rows, 0.06, 0.025, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    g.strokeStyle = 'rgba(10,12,20,0.7)';
    g.lineWidth = 0.02;
    g.beginPath();
    for (let r = 0; r <= rows; r++) {
      const yy = -h + r / rows;
      g.moveTo(0, yy);
      g.lineTo(1, yy);
      const off = r % 2 ? 0.5 / (L === 0 ? 2 : 1.5) : 0;
      const step = L === 0 ? 0.5 : 0.66;
      for (let x = off; x < 1.001; x += step) {
        g.moveTo(x, yy);
        g.lineTo(x, yy + 1 / rows);
      }
    }
    g.stroke();
    g.restore();
    // bevel highlights on exposed edges
    g.strokeStyle = 'rgba(210,220,255,0.22)';
    g.lineWidth = 0.02;
    g.beginPath();
    if (!N) {
      g.moveTo(x0, y0 + 0.01);
      g.lineTo(x1, y0 + 0.01);
    }
    if (!W) {
      g.moveTo(x0 + 0.01, y0);
      g.lineTo(x0 + 0.01, y1);
    }
    g.stroke();
    g.strokeStyle = 'rgba(5,6,12,0.7)';
    g.lineWidth = 0.02;
    g.beginPath();
    if (!E) {
      g.moveTo(x1, y0);
      g.lineTo(x1, fy1);
    }
    if (!W) {
      g.moveTo(x0, y0);
      g.lineTo(x0, fy1);
    }
    if (!N) {
      g.moveTo(x0, y0);
      g.lineTo(x1, y0);
    }
    if (!S) {
      g.moveTo(x0, fy1);
      g.lineTo(x1, fy1);
    }
    g.stroke();
    if (L >= 1) {
      // iron bands + rivets
      g.fillStyle = '#2a2f3c';
      const cy = (y0 + y1) / 2;
      g.fillRect(x0, cy - 0.035, x1 - x0, 0.07);
      g.fillStyle = '#9aa3b5';
      for (let x = 0.2; x < 1; x += 0.3) {
        if (x < x0 || x > x1) continue;
        circle(g, x, cy, 0.018);
        g.fill();
      }
    }
    if (L >= 2) {
      // glowing rune groove toward connected neighbours
      const cx = 0.5,
        cy = 0.5 - h;
      g.lineCap = 'round';
      for (const [lw, col] of [
        [0.07, 'rgba(154,190,255,0.25)'],
        [0.025, 'rgba(210,228,255,0.95)'],
      ] as const) {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.beginPath();
        if (N) (g.moveTo(cx, cy), g.lineTo(cx, y0));
        if (S) (g.moveTo(cx, cy), g.lineTo(cx, y1));
        if (E) (g.moveTo(cx, cy), g.lineTo(x1, cy));
        if (W) (g.moveTo(cx, cy), g.lineTo(x0, cy));
        g.stroke();
      }
      g.fillStyle = '#d8e4ff';
      poly(g, [
        [cx, cy - 0.09],
        [cx + 0.07, cy],
        [cx, cy + 0.09],
        [cx - 0.07, cy],
      ]);
      g.fill();
      g.fillStyle = '#7f96d8';
      poly(g, [
        [cx, cy - 0.045],
        [cx + 0.035, cy],
        [cx, cy + 0.045],
        [cx - 0.035, cy],
      ]);
      g.fill();
    }
  });
}

function wall(c: C, b: Building, game: Game) {
  const isW = (x: number, y: number) => game.buildingAtTile(x, y)?.def.id === 'wall';
  const mask = (isW(b.x, b.y - 1) ? 1 : 0) | (isW(b.x + 1, b.y) ? 2 : 0) | (isW(b.x, b.y + 1) ? 4 : 0) | (isW(b.x - 1, b.y) ? 8 : 0);
  const cv = wallCanvas(c, mask, b.level);
  c.drawImage(cv, b.x - 0.02, b.y - 0.25, 1.12, 1.4);
}

// ------------------------------------------------------------------ towers

function arbalest(c: C, b: Building, cx: number, cy: number, col: string) {
  const L = b.level;
  c.fillStyle = '#1e1a24';
  circle(c, cx, cy - 0.01, 0.27);
  c.fill();
  c.fillStyle = L === 2 ? '#6e5530' : '#4a3a2c';
  circle(c, cx, cy - 0.04, 0.24);
  c.fill();
  c.strokeStyle = L === 0 ? '#6e5236' : L === 1 ? '#9aa3b5' : '#e8c070';
  c.lineWidth = 0.025;
  c.stroke();
  c.save();
  c.translate(cx, cy - 0.06);
  c.rotate(b.angle);
  const rx = -b.recoil * 0.07;
  // stock
  c.fillStyle = '#5e4028';
  c.beginPath();
  c.moveTo(-0.27 + rx, -0.05);
  c.lineTo(0.22 + rx, -0.04);
  c.lineTo(0.24 + rx, 0);
  c.lineTo(0.22 + rx, 0.04);
  c.lineTo(-0.27 + rx, 0.05);
  c.closePath();
  c.fill();
  c.strokeStyle = '#1a1008';
  c.lineWidth = 0.02;
  c.stroke();
  c.fillStyle = 'rgba(255,220,170,0.18)';
  c.fillRect(-0.25 + rx, -0.045, 0.45, 0.025);
  if (L >= 1) {
    c.fillStyle = L === 2 ? '#e8c070' : '#9aa3b5';
    c.fillRect(-0.08 + rx, -0.06, 0.05, 0.12);
    c.fillRect(-0.24 + rx, -0.06, 0.04, 0.12);
  }
  const limb = L === 0 ? '#8a6a44' : L === 1 ? '#aeb6c6' : '#e8c070';
  const bows = L === 2 ? [0.17, 0.0] : [0.15];
  bows.forEach((bx, i) => {
    const s = i === 0 ? 1 : 0.8;
    const tipX = bx - 0.1 * s + rx,
      tipY = 0.33 * s;
    c.lineCap = 'round';
    c.strokeStyle = shade(limb, -0.45);
    c.lineWidth = 0.065;
    c.beginPath();
    c.moveTo(tipX, -tipY);
    c.quadraticCurveTo(bx + 0.1 * s + rx, -0.18 * s, bx + 0.08 * s + rx, 0);
    c.quadraticCurveTo(bx + 0.1 * s + rx, 0.18 * s, tipX, tipY);
    c.stroke();
    c.strokeStyle = limb;
    c.lineWidth = 0.035;
    c.stroke();
    const sx = bx - 0.16 + b.recoil * 0.2 + rx;
    c.strokeStyle = 'rgba(230,225,210,0.85)';
    c.lineWidth = 0.012;
    c.beginPath();
    c.moveTo(tipX, -tipY);
    c.lineTo(sx, 0);
    c.lineTo(tipX, tipY);
    c.stroke();
    if (i === 0 && b.recoil < 0.6) {
      c.strokeStyle = '#d8c8a8';
      c.lineWidth = 0.022;
      c.beginPath();
      c.moveTo(sx, 0);
      c.lineTo(sx + 0.38, 0);
      c.stroke();
      c.fillStyle = shade(col, 0.4);
      poly(c, [
        [sx + 0.44, 0],
        [sx + 0.36, -0.035],
        [sx + 0.36, 0.035],
      ]);
      c.fill();
    }
  });
  c.restore();
  c.fillStyle = shade(col, 0.3);
  circle(c, cx, cy - 0.06, 0.04);
  c.fill();
}

function mortar(c: C, b: Building, cx: number, cy: number, col: string, t: number) {
  const L = b.level;
  facet(c, ngon(cx, cy - 0.04, 0.3, 8, Math.PI / 8, 0.9), cx - 0.05, cy - 0.1, '#3a3440', 0.35, 'rgba(10,8,14,0.9)', 0.02);
  c.fillStyle = '#9a8c80';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    circle(c, cx + Math.cos(a) * 0.24, cy - 0.04 + Math.sin(a) * 0.21, 0.016);
    c.fill();
  }
  c.save();
  c.translate(cx, cy - 0.06);
  c.rotate(b.angle);
  const rx = -b.recoil * 0.08;
  const w = L === 2 ? 0.16 : 0.14;
  const len = 0.3 + L * 0.02;
  const gr = c.createLinearGradient(0, -w, 0, w);
  gr.addColorStop(0, '#6a5e66');
  gr.addColorStop(0.35, '#3e363f');
  gr.addColorStop(1, '#17131a');
  c.fillStyle = gr;
  c.beginPath();
  c.moveTo(-0.1 + rx, -w * 0.9);
  c.lineTo(len + rx, -w);
  c.lineTo(len + rx, w);
  c.lineTo(-0.1 + rx, w * 0.9);
  c.closePath();
  c.fill();
  c.strokeStyle = '#0c0a0e';
  c.lineWidth = 0.02;
  c.stroke();
  if (L >= 1) {
    c.fillStyle = L === 2 ? '#e8c070' : '#b87333';
    c.fillRect(0.02 + rx, -w - 0.005, 0.04, w * 2 + 0.01);
    c.fillRect(len - 0.07 + rx, -w - 0.01, 0.04, w * 2 + 0.02);
  }
  // muzzle
  c.fillStyle = '#1a151c';
  c.beginPath();
  c.ellipse(len + rx, 0, 0.045, w * 0.95, 0, 0, TAU);
  c.fill();
  const heat = 0.35 + 0.65 * b.recoil + 0.1 * Math.sin(t * 5 + b.uid);
  c.fillStyle = rgba(col, Math.min(1, heat));
  c.beginPath();
  c.ellipse(len + rx, 0, 0.028, w * 0.6, 0, 0, TAU);
  c.fill();
  c.restore();
  c.fillStyle = '#4a4250';
  circle(c, cx, cy - 0.06, 0.1);
  c.fill();
  c.fillStyle = rgba(col, 0.8);
  circle(c, cx, cy - 0.06, 0.035);
  c.fill();
}

function shard(c: C, x: number, y: number, s: number, col: string) {
  c.fillStyle = shade(col, 0.55);
  poly(c, [
    [x, y - s * 1.4],
    [x + s * 0.7, y],
    [x, y + s],
    [x - s * 0.7, y],
  ]);
  c.fill();
  c.fillStyle = shade(col, -0.1);
  poly(c, [
    [x, y - s * 1.4],
    [x + s * 0.7, y],
    [x, y + s],
  ]);
  c.fill();
}

function frost(c: C, b: Building, cx: number, cy: number, col: string, t: number) {
  const L = b.level;
  c.strokeStyle = rgba(col, 0.25);
  c.lineWidth = 0.02;
  c.beginPath();
  c.ellipse(cx, cy + 0.02, 0.34, 0.22, 0, 0, TAU);
  c.stroke();
  const n = 3 + L;
  const oy = cy - 0.2;
  const sh: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = t * 1.3 + (i / n) * TAU + b.uid;
    sh.push([cx + Math.cos(a) * 0.34, oy + Math.sin(a) * 0.14 + Math.sin(t * 3 + i) * 0.02, Math.sin(a)]);
  }
  for (const [x, y, d] of sh) if (d < 0) shard(c, x, y, 0.045, col);
  const top = cy - 0.55 - L * 0.06;
  facet(
    c,
    [
      [cx, top],
      [cx + 0.12, top + 0.16],
      [cx + 0.12, cy + 0.06],
      [cx, cy + 0.14],
      [cx - 0.12, cy + 0.06],
      [cx - 0.12, top + 0.16],
    ],
    cx - 0.02,
    (top + cy) / 2,
    col,
    0.55,
    rgba('#e8fbff', 0.8),
    0.015,
  );
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = 0.015;
  c.beginPath();
  c.moveTo(cx, top + 0.05);
  c.lineTo(cx, cy + 0.08);
  c.stroke();
  if (L >= 1) {
    shard(c, cx - 0.17, cy + 0.02, 0.06, col);
    shard(c, cx + 0.17, cy + 0.02, 0.06, col);
  }
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.5 + b.uid);
  glow(c, cx, (top + cy) / 2, 0.3, '#e8fbff', 0.2 + 0.2 * pulse);
  for (const [x, y, d] of sh) if (d >= 0) shard(c, x, y, 0.05, col);
}

function tesla(c: C, b: Building, cx: number, cy: number, col: string, t: number) {
  const L = b.level;
  if (L >= 1) {
    c.strokeStyle = '#6a5a70';
    c.lineWidth = 0.03;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * 0.25, cy + 0.08);
      c.lineTo(cx + s * 0.22, cy - 0.22);
      c.stroke();
      c.fillStyle = shade(col, 0.3);
      circle(c, cx + s * 0.22, cy - 0.24, 0.035);
      c.fill();
    }
  }
  c.fillStyle = '#2e2636';
  c.fillRect(cx - 0.06, cy - 0.34, 0.12, 0.46);
  for (let i = 0; i < 4; i++) {
    const y = cy + 0.07 - i * 0.11;
    const rx = 0.18 - i * 0.022;
    c.fillStyle = '#5a3418';
    c.beginPath();
    c.ellipse(cx, y + 0.02, rx, 0.055, 0, 0, TAU);
    c.fill();
    const g = c.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, '#e0a060');
    g.addColorStop(0.5, '#b87333');
    g.addColorStop(1, '#6a3c18');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(cx, y, rx, 0.05, 0, 0, TAU);
    c.fill();
  }
  const sy = cy - 0.42;
  const fire = b.firing > 0 ? 1 : 0;
  glow(c, cx, sy, 0.35 + fire * 0.25, col, 0.35 + fire * 0.4);
  if (L >= 2) {
    c.strokeStyle = rgba(col, 0.8);
    c.lineWidth = 0.02;
    c.beginPath();
    c.ellipse(cx, sy, 0.22, 0.07, Math.sin(t) * 0.3, 0, TAU);
    c.stroke();
  }
  const sg = c.createRadialGradient(cx - 0.04, sy - 0.04, 0, cx, sy, 0.13);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(0.4, shade(col, 0.4));
  sg.addColorStop(1, shade(col, -0.35));
  c.fillStyle = sg;
  circle(c, cx, sy, 0.13);
  c.fill();
  // crackle
  const r = new TRng(Math.floor(t * 14) * 131 + b.uid * 977);
  const arcs = fire ? 4 : 2;
  for (let k = 0; k < arcs; k++) {
    const a = r.next() * TAU;
    let x = cx + Math.cos(a) * 0.12,
      y = sy + Math.sin(a) * 0.12;
    const pts: [number, number][] = [[x, y]];
    const len = r.range(0.12, 0.28);
    for (let s = 0; s < 3; s++) {
      x += Math.cos(a + r.range(-0.8, 0.8)) * (len / 3);
      y += Math.sin(a + r.range(-0.8, 0.8)) * (len / 3);
      pts.push([x, y]);
    }
    for (const [lw, st] of [
      [0.04, rgba(col, 0.4)],
      [0.014, 'rgba(255,255,255,0.9)'],
    ] as const) {
      c.strokeStyle = st;
      c.lineWidth = lw;
      c.beginPath();
      pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
      c.stroke();
    }
  }
}

function flame(c: C, bx: number, by: number, w: number, h: number, lx: number, ly: number, col: string) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(bx - w, by);
  c.quadraticCurveTo(bx - w * 1.05, by - h * 0.55, bx + lx, by - h + ly);
  c.quadraticCurveTo(bx + w * 1.05, by - h * 0.55, bx + w, by);
  c.quadraticCurveTo(bx, by + w * 0.6, bx - w, by);
  c.fill();
}

function pyre(c: C, b: Building, cx: number, cy: number, col: string, t: number) {
  const L = b.level;
  const by = cy - 0.08;
  c.strokeStyle = '#2a2020';
  c.lineWidth = 0.04;
  c.beginPath();
  c.moveTo(cx - 0.18, cy + 0.14);
  c.lineTo(cx - 0.12, by);
  c.moveTo(cx + 0.18, cy + 0.14);
  c.lineTo(cx + 0.12, by);
  c.stroke();
  const bw = 0.25 + L * 0.02;
  c.fillStyle = '#2e2626';
  c.beginPath();
  c.moveTo(cx - bw, by - 0.04);
  c.lineTo(cx - bw * 0.6, by + 0.12);
  c.lineTo(cx + bw * 0.6, by + 0.12);
  c.lineTo(cx + bw, by - 0.04);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(255,140,80,0.12)';
  c.fillRect(cx - bw * 0.8, by, bw * 1.6, 0.03);
  if (L >= 2) {
    c.fillStyle = '#e8c070';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * bw, by - 0.02);
      c.quadraticCurveTo(cx + s * (bw + 0.12), by - 0.1, cx + s * (bw + 0.08), by - 0.25);
      c.quadraticCurveTo(cx + s * (bw + 0.02), by - 0.1, cx + s * (bw - 0.06), by - 0.02);
      c.fill();
    }
  }
  c.strokeStyle = L >= 1 ? '#b87333' : '#6a4a3a';
  c.lineWidth = 0.03;
  c.beginPath();
  c.ellipse(cx, by - 0.04, bw, 0.08, 0, 0, TAU);
  c.stroke();
  c.fillStyle = '#140c08';
  c.beginPath();
  c.ellipse(cx, by - 0.04, bw * 0.9, 0.06, 0, 0, TAU);
  c.fill();
  const firing = b.firing > 0;
  const lean = firing ? 0.2 : 0.03 * Math.sin(t * 3 + b.uid);
  const lx = firing ? Math.cos(b.angle) * lean : lean,
    ly = firing ? Math.sin(b.angle) * lean * 0.6 : 0;
  const hk = (0.9 + 0.12 * Math.sin(t * 13 + b.uid) + 0.08 * Math.sin(t * 21.7)) * (1 + L * 0.12) * (firing ? 1.25 : 1);
  glow(c, cx, by - 0.2, 0.45, col, 0.35);
  flame(c, cx, by - 0.04, 0.17 + L * 0.02, 0.5 * hk, lx, ly, rgba(col, 0.9));
  flame(c, cx, by - 0.04, 0.12 + L * 0.015, 0.38 * hk, lx * 0.8, ly * 0.8, '#ff9a3a');
  flame(c, cx, by - 0.04, 0.065, 0.24 * hk, lx * 0.6, ly * 0.6, '#ffe08a');
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.9 + i / 3 + b.uid * 0.37) % 1;
    const ex = cx + Math.sin(p * 9 + i * 2 + b.uid) * 0.12;
    c.fillStyle = rgba('#ffcf7a', 1 - p);
    circle(c, ex, by - 0.3 - p * 0.45, 0.018);
    c.fill();
  }
}

function mender(c: C, b: Building, cx: number, cy: number, col: string, t: number) {
  const L = b.level;
  for (const s of [-1, 1]) {
    facet(
      c,
      [
        [cx + s * 0.2 - 0.045, cy + 0.12],
        [cx + s * 0.2 + 0.045, cy + 0.12],
        [cx + s * 0.2 + 0.04, cy - 0.24],
        [cx + s * 0.2, cy - 0.28],
        [cx + s * 0.2 - 0.04, cy - 0.24],
      ],
      cx + s * 0.2 - 0.01,
      cy - 0.1,
      '#5e6678',
      0.35,
    );
    c.fillStyle = shade(col, 0.2);
    circle(c, cx + s * 0.2, cy - 0.29, 0.03);
    c.fill();
  }
  if (L >= 1) {
    c.strokeStyle = '#6e7890';
    c.lineWidth = 0.035;
    c.beginPath();
    c.arc(cx, cy - 0.26, 0.2, Math.PI, 0);
    c.stroke();
  }
  const oy = cy - 0.3 + Math.sin(t * 2 + b.uid) * 0.04;
  if (b.firing > 0) {
    const p = (t * 1.2) % 1;
    c.strokeStyle = rgba(col, 0.5 * (1 - p));
    c.lineWidth = 0.025;
    c.beginPath();
    c.ellipse(cx, cy + 0.02, 0.1 + p * 0.4, (0.1 + p * 0.4) * 0.55, 0, 0, TAU);
    c.stroke();
  }
  glow(c, cx, oy, 0.35, col, 0.45);
  const g = c.createRadialGradient(cx - 0.03, oy - 0.03, 0, cx, oy, 0.11);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, col);
  g.addColorStop(1, shade(col, -0.5));
  c.fillStyle = g;
  circle(c, cx, oy, 0.1);
  c.fill();
  const n = 3 + L;
  for (let i = 0; i < n; i++) {
    const a = t * 1.5 + (i / n) * TAU;
    const lx = cx + Math.cos(a) * 0.22,
      ly = oy + Math.sin(a) * 0.09;
    c.save();
    c.translate(lx, ly);
    c.rotate(a + Math.PI / 2);
    c.fillStyle = shade(col, Math.sin(a) > 0 ? 0.1 : -0.3);
    c.beginPath();
    c.ellipse(0, 0, 0.04, 0.018, 0, 0, TAU);
    c.fill();
    c.restore();
  }
}

function prism(c: C, b: Building, cx: number, cy: number, col: string, t: number) {
  const L = b.level;
  facet(c, ngon(cx, cy + 0.02, 0.19, 6, 0, 0.7), cx - 0.03, cy - 0.02, '#4a4458', 0.35, 'rgba(10,8,16,0.9)', 0.02);
  const oy = cy - 0.38 + Math.sin(t * 1.7 + b.uid) * 0.03;
  c.strokeStyle = '#8a8098';
  c.lineWidth = 0.035;
  c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i - 1) * 1.0;
    const bx = cx + Math.cos(a + Math.PI) * 0.15 * (i === 1 ? 0 : 1);
    const sx = cx + (i - 1) * 0.16;
    c.beginPath();
    c.moveTo(sx, cy);
    c.quadraticCurveTo(sx + (i - 1) * 0.08, cy - 0.15, bx + (i - 1) * 0.1, oy + 0.12);
    c.stroke();
    c.fillStyle = col;
    circle(c, bx + (i - 1) * 0.1, oy + 0.12, 0.02);
    c.fill();
  }
  const firing = b.firing > 0;
  const charge = Math.min(1, b.beamTime / 3);
  glow(c, cx, oy, 0.35 + (firing ? 0.15 + charge * 0.2 : 0), col, 0.3 + (firing ? 0.3 : 0));
  if (L >= 2) {
    c.strokeStyle = rgba(col, 0.7);
    c.lineWidth = 0.018;
    c.beginPath();
    c.ellipse(cx, oy, 0.25, 0.08, t * 0.5, 0, TAU);
    c.stroke();
  }
  const ph = t * 1.5 + b.uid;
  const cw = Math.cos(ph);
  const w = 0.04 + 0.11 * Math.abs(cw);
  const h = 0.2 + L * 0.02;
  const lf = cw > 0 ? 0.55 : -0.1,
    rf = cw > 0 ? -0.15 : 0.5;
  c.fillStyle = shade(col, lf);
  poly(c, [
    [cx, oy - h],
    [cx, oy + h * 0.8],
    [cx - w, oy],
  ]);
  c.fill();
  c.fillStyle = shade(col, rf);
  poly(c, [
    [cx, oy - h],
    [cx + w, oy],
    [cx, oy + h * 0.8],
  ]);
  c.fill();
  c.strokeStyle = 'rgba(255,240,250,0.8)';
  c.lineWidth = 0.012;
  poly(c, [
    [cx, oy - h],
    [cx + w, oy],
    [cx, oy + h * 0.8],
    [cx - w, oy],
  ]);
  c.stroke();
  if (firing) {
    c.fillStyle = rgba('#ffffff', 0.5 + charge * 0.5);
    circle(c, cx, oy, 0.03 + charge * 0.03);
    c.fill();
  }
  if (L >= 1) {
    const a = -t * 2;
    shard(c, cx + Math.cos(a) * 0.26, oy + Math.sin(a) * 0.09, 0.035, col);
  }
}

function skyhunter(c: C, b: Building, cx: number, cy: number, col: string) {
  const L = b.level;
  c.fillStyle = '#232d33';
  circle(c, cx, cy - 0.02, 0.28);
  c.fill();
  c.strokeStyle = rgba(col, 0.6);
  c.lineWidth = 0.02;
  c.stroke();
  c.save();
  c.translate(cx, cy - 0.06);
  c.rotate(b.angle);
  const rx = -b.recoil * 0.05;
  const n = 3 + L;
  const hw = 0.06 + n * 0.035;
  facet(
    c,
    [
      [-0.19 + rx, -hw],
      [0.17 + rx, -hw],
      [0.2 + rx, 0],
      [0.17 + rx, hw],
      [-0.19 + rx, hw],
    ],
    -0.02 + rx,
    0,
    '#3a5652',
    0.35,
    'rgba(8,14,14,0.9)',
    0.02,
  );
  for (let i = 0; i < n; i++) {
    const yy = (i - (n - 1) / 2) * 0.07;
    c.fillStyle = '#16201f';
    c.fillRect(0.02 + rx, yy - 0.026, 0.2, 0.052);
    if (b.recoil < 0.35) {
      c.fillStyle = '#d8e0dc';
      c.fillRect(0.12 + rx, yy - 0.018, 0.08, 0.036);
      c.fillStyle = col;
      poly(c, [
        [0.25 + rx, yy],
        [0.2 + rx, yy - 0.02],
        [0.2 + rx, yy + 0.02],
      ]);
      c.fill();
    }
  }
  if (L >= 1) {
    c.strokeStyle = '#8fa8a0';
    c.lineWidth = 0.025;
    c.beginPath();
    c.arc(-0.2 + rx, 0, 0.09, Math.PI * 0.6, Math.PI * 1.4);
    c.stroke();
  }
  c.restore();
  c.fillStyle = shade(col, 0.3);
  circle(c, cx, cy - 0.06, 0.03);
  c.fill();
}

function obelisk(c: C, b: Building, cx: number, cy: number, col: string, t: number) {
  const L = b.level;
  const top = cy - 0.78 - L * 0.06;
  const bw = 0.17 + L * 0.015;
  const left: [number, number][] = [
    [cx - bw, cy + 0.12],
    [cx, cy + 0.16],
    [cx, top - 0.14],
    [cx - bw * 0.48, top],
  ];
  const right: [number, number][] = [
    [cx, cy + 0.16],
    [cx + bw, cy + 0.12],
    [cx + bw * 0.48, top],
    [cx, top - 0.14],
  ];
  c.fillStyle = '#e8c46a';
  poly(c, left);
  c.fill();
  c.fillStyle = '#9c7a34';
  poly(c, right);
  c.fill();
  c.strokeStyle = 'rgba(40,24,6,0.9)';
  c.lineWidth = 0.018;
  poly(c, [left[0], left[1], right[1], right[2], left[2], left[3]]);
  c.stroke();
  c.fillStyle = '#fff4c8';
  poly(c, [
    [cx - bw * 0.48, top],
    [cx, top - 0.14],
    [cx, top + 0.02],
  ]);
  c.fill();
  // glyphs
  const glyphs = 3 + L * 2;
  for (let i = 0; i < glyphs; i++) {
    const k = (i + 0.5) / glyphs;
    const y = cy + 0.05 - k * (cy + 0.05 - top - 0.05);
    const w = bw * (1 - k * 0.5) * 0.5;
    const pulse = 0.55 + 0.45 * Math.sin(t * 3 - i * 0.7);
    c.fillStyle = rgba('#7a4a10', 0.9);
    c.fillRect(cx - w - 0.02, y - 0.012, w, 0.024);
    c.fillStyle = rgba('#fff1a8', 0.3 + pulse * 0.4);
    c.fillRect(cx - w - 0.02, y - 0.008, w * (hash(i * 7 + L) * 0.5 + 0.5), 0.016);
  }
  // sun disc
  const charge = b.firing > 0 ? Math.min(1, b.firing / 0.9) : 0;
  const sy = top - 0.35 + Math.sin(t * 1.2 + b.uid) * 0.03;
  const r = 0.12 + charge * 0.08 + L * 0.01;
  glow(c, cx, sy, 0.5 + charge * 0.4, col, 0.4 + charge * 0.4);
  c.save();
  c.translate(cx, sy);
  c.rotate(t * 0.7);
  c.fillStyle = rgba('#ffcf5a', 0.85);
  const rays = 8 + L * 2;
  for (let i = 0; i < rays; i++) {
    c.rotate(TAU / rays);
    poly(c, [
      [r * 0.8, -0.025],
      [r + 0.09 + charge * 0.12, 0],
      [r * 0.8, 0.025],
    ]);
    c.fill();
  }
  c.restore();
  const g = c.createRadialGradient(cx, sy, 0, cx, sy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, col);
  g.addColorStop(1, '#ffb347');
  c.fillStyle = g;
  circle(c, cx, sy, r);
  c.fill();
}

function harvester(c: C, b: Building, cx: number, cy: number, col: string, t: number) {
  const L = b.level;
  glow(c, cx, cy, 0.5, col, 0.35);
  // rails
  c.strokeStyle = '#43525e';
  c.lineWidth = 0.04;
  c.strokeRect(cx - 0.33, cy - 0.3, 0.66, 0.56);
  c.strokeStyle = rgba(col, 0.35);
  c.lineWidth = 0.012;
  c.strokeRect(cx - 0.33, cy - 0.3, 0.66, 0.56);
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    facet(c, ngon(cx + sx * 0.33, cy + sy * 0.28 - 0.02, 0.075, 4, Math.PI / 4), cx + sx * 0.33 - 0.02, cy + sy * 0.28 - 0.05, '#4a5a66', 0.4);
  }
  if (L >= 1) {
    // side tank(s)
    const tanks = L === 2 ? [-1, 1] : [1];
    for (const s of tanks) {
      const tx = cx + s * 0.36,
        ty = cy + 0.05;
      c.fillStyle = '#2a3440';
      c.beginPath();
      c.ellipse(tx, ty, 0.08, 0.14, 0, 0, TAU);
      c.fill();
      const lvl = 0.5 + 0.3 * Math.sin(t * 0.8 + s);
      c.fillStyle = rgba(col, 0.75);
      c.beginPath();
      c.ellipse(tx, ty + 0.14 - lvl * 0.14, 0.055, lvl * 0.11, 0, 0, TAU);
      c.fill();
      c.strokeStyle = '#8fa3b0';
      c.lineWidth = 0.015;
      c.beginPath();
      c.ellipse(tx, ty, 0.08, 0.14, 0, 0, TAU);
      c.stroke();
    }
  }
  // platform
  c.fillStyle = '#26323c';
  c.beginPath();
  c.ellipse(cx, cy, 0.22, 0.18, 0, 0, TAU);
  c.fill();
  c.strokeStyle = rgba(col, 0.7);
  c.lineWidth = 0.02;
  c.stroke();
  // drill (spinning)
  c.save();
  c.translate(cx, cy);
  c.scale(1, 0.8);
  c.rotate(t * (5 + L * 2));
  for (let i = 0; i < 3; i++) {
    c.rotate(TAU / 3);
    c.fillStyle = i % 2 ? '#8fa3b0' : '#5e707c';
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(0.12, -0.05, 0.18, 0.02);
    c.lineTo(0.02, 0.06);
    c.closePath();
    c.fill();
  }
  c.restore();
  // derrick with bobbing head
  const bob = Math.sin(t * 6) * 0.03;
  c.strokeStyle = '#6a7a86';
  c.lineWidth = 0.03;
  c.beginPath();
  c.moveTo(cx - 0.12, cy + 0.02);
  c.lineTo(cx, cy - 0.42);
  c.lineTo(cx + 0.12, cy + 0.02);
  c.stroke();
  c.fillStyle = '#3a4852';
  c.fillRect(cx - 0.06, cy - 0.3 + bob, 0.12, 0.1);
  c.fillStyle = shade(col, 0.4);
  circle(c, cx, cy - 0.44, 0.035);
  c.fill();
  c.fillStyle = '#e8fbff';
  circle(c, cx, cy, 0.035);
  c.fill();
}

function thorns(c: C, b: Building, t: number) {
  const L = b.level;
  const col = b.def.color;
  const x = b.x,
    y = b.y;
  c.fillStyle = 'rgba(24,22,14,0.8)';
  c.beginPath();
  c.roundRect(x + 0.07, y + 0.07, 0.86, 0.86, 0.12);
  c.fill();
  c.strokeStyle = rgba(col, 0.25);
  c.lineWidth = 0.02;
  c.stroke();
  const n = L === 2 ? 4 : 3;
  const ext = b.firing > 0 ? 1.7 : 1 + 0.05 * Math.sin(t * 2 + b.uid);
  const shaft = L === 0 ? '#6e6a4a' : '#9aa0a8';
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n + (j % 2 ? -1 : 0); i++) {
      const sx = x + 0.5 + (i - (n - 1 - (j % 2)) / 2) * (0.8 / n);
      const sy = y + 0.2 + ((j + 0.8) / n) * 0.72;
      const h = (0.14 + L * 0.02) * ext;
      const w = 0.05;
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.beginPath();
      c.ellipse(sx + 0.02, sy, w * 1.1, w * 0.45, 0, 0, TAU);
      c.fill();
      c.fillStyle = shade(shaft, 0.2);
      poly(c, [
        [sx - w, sy],
        [sx, sy - h],
        [sx, sy + 0.01],
      ]);
      c.fill();
      c.fillStyle = shade(shaft, -0.35);
      poly(c, [
        [sx, sy + 0.01],
        [sx, sy - h],
        [sx + w, sy],
      ]);
      c.fill();
      c.fillStyle = col;
      poly(c, [
        [sx - w * 0.35, sy - h * 0.65],
        [sx, sy - h],
        [sx + w * 0.35, sy - h * 0.65],
      ]);
      c.fill();
    }
}

function mire(c: C, b: Building, t: number) {
  const L = b.level;
  const col = b.def.color;
  const cx = b.x + 0.5,
    cy = b.y + 0.52;
  const pts: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r = 0.4 + 0.035 * Math.sin(t * 1.5 + i * 1.7 + b.uid) + hash(b.uid * 31 + i) * 0.04;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85]);
  }
  const g = c.createRadialGradient(cx - 0.08, cy - 0.08, 0, cx, cy, 0.45);
  g.addColorStop(0, '#3e2462');
  g.addColorStop(0.7, '#1f1036');
  g.addColorStop(1, '#120a20');
  c.fillStyle = g;
  c.beginPath();
  // smooth closed curve through midpoints
  for (let i = 0; i <= pts.length; i++) {
    const p = pts[i % pts.length],
      q = pts[(i + 1) % pts.length];
    const mx = (p[0] + q[0]) / 2,
      my = (p[1] + q[1]) / 2;
    if (i === 0) c.moveTo(mx, my);
    else c.quadraticCurveTo(p[0], p[1], mx, my);
  }
  c.closePath();
  c.fill();
  c.strokeStyle = rgba(col, 0.45);
  c.lineWidth = 0.03;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.07)';
  c.beginPath();
  c.ellipse(cx - 0.12, cy - 0.14, 0.12, 0.04, -0.3, 0, TAU);
  c.fill();
  const n = 3 + L;
  for (let i = 0; i < n; i++) {
    const p = (t * 0.7 + i * 0.37 + b.uid * 0.13) % 1;
    const bx = cx + (hash(b.uid * 10 + i) - 0.5) * 0.45,
      by = cy + (hash(b.uid * 10 + i + 5) - 0.5) * 0.35;
    if (p < 0.85) {
      const r = 0.015 + p * 0.05;
      c.fillStyle = rgba(col, 0.3);
      circle(c, bx, by, r);
      c.fill();
      c.strokeStyle = rgba(col, 0.7);
      c.lineWidth = 0.01;
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.4)';
      circle(c, bx - r * 0.35, by - r * 0.35, r * 0.25);
      c.fill();
    } else {
      const k = (p - 0.85) / 0.15;
      c.strokeStyle = rgba(col, 0.6 * (1 - k));
      c.lineWidth = 0.012;
      circle(c, bx, by, 0.065 + k * 0.06);
      c.stroke();
    }
  }
  if (L >= 2) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * 0.3;
      c.fillStyle = rgba(col, 0.5 + 0.4 * Math.sin(t * 3 + i));
      circle(c, cx + Math.cos(a) * 0.44, cy + Math.sin(a) * 0.37, 0.02);
      c.fill();
    }
  }
}

// ------------------------------------------------------------------ public

export function drawBuilding(ctx: C, b: Building, t: number, game: Game): void {
  const id = b.def.id;
  const col = b.def.color;
  const cx = b.x + 0.5,
    cy = b.y + 0.5;
  ctx.save();
  switch (id) {
    case 'wall':
      wall(ctx, b, game);
      break;
    case 'thorns':
      thorns(ctx, b, t);
      break;
    case 'mire':
      mire(ctx, b, t);
      break;
    case 'harvester':
      harvester(ctx, b, cx, cy, col, t);
      break;
    default:
      plinth(ctx, b);
      if (b.hp < b.maxHp * 0.5) cracks(ctx, b);
      switch (id) {
        case 'arbalest':
          arbalest(ctx, b, cx, cy, col);
          break;
        case 'mortar':
          mortar(ctx, b, cx, cy, col, t);
          break;
        case 'frost':
          frost(ctx, b, cx, cy, col, t);
          break;
        case 'tesla':
          tesla(ctx, b, cx, cy, col, t);
          break;
        case 'pyre':
          pyre(ctx, b, cx, cy, col, t);
          break;
        case 'mender':
          mender(ctx, b, cx, cy, col, t);
          break;
        case 'prism':
          prism(ctx, b, cx, cy, col, t);
          break;
        case 'skyhunter':
          skyhunter(ctx, b, cx, cy, col);
          break;
        case 'obelisk':
          obelisk(ctx, b, cx, cy, col, t);
          break;
      }
  }
  if (id !== 'wall') pips(ctx, cx, b.y + (id === 'thorns' || id === 'mire' ? 0.94 : 0.9), b.level, col);
  if (b.hurt > 0) glow(ctx, cx, cy - 0.1, 0.65, '#ff3030', Math.min(1, b.hurt * 5) * 0.65);
  ctx.restore();
}

function cracks(c: C, b: Building) {
  const r = new TRng(b.uid * 7 + 1);
  c.strokeStyle = 'rgba(5,5,10,0.8)';
  c.lineWidth = 0.02;
  const n = b.hp < b.maxHp * 0.25 ? 3 : 1;
  for (let k = 0; k < n; k++) {
    let x = b.x + r.range(0.2, 0.8),
      y = b.y + r.range(0.55, 0.8);
    c.beginPath();
    c.moveTo(x, y);
    for (let i = 0; i < 3; i++) {
      x += r.range(-0.08, 0.08);
      y += r.range(-0.08, 0.06);
      c.lineTo(x, y);
    }
    c.stroke();
  }
}

const stubGame = { buildingAtTile: () => undefined } as unknown as Game;

export function fakeBuilding(id: BuildingId, x: number, y: number, level = 0): Building {
  const def = BUILDINGS[id];
  return {
    uid: 7,
    def,
    x,
    y,
    level,
    hp: def.levels[level].hp,
    maxHp: def.levels[level].hp,
    cd: 0,
    angle: -Math.PI / 4,
    targetUid: 0,
    invested: 0,
    freshSpend: 0,
    beamTime: 0,
    firing: 0,
    recoil: 0,
    mode: 'first',
    kills: 0,
    dealt: 0,
    hurt: 0,
  };
}

export function drawGhost(ctx: C, id: BuildingId, x: number, y: number, t: number, ok: boolean): void {
  ctx.save();
  const col = ok ? '#78ffaa' : '#ff5050';
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  ctx.fillStyle = rgba(col, 0.12 + pulse * 0.08);
  ctx.fillRect(x + 0.03, y + 0.03, 0.94, 0.94);
  ctx.strokeStyle = rgba(col, 0.75);
  ctx.lineWidth = 0.035;
  ctx.setLineDash([0.12, 0.08]);
  ctx.lineDashOffset = -t * 0.3;
  ctx.strokeRect(x + 0.04, y + 0.04, 0.92, 0.92);
  ctx.setLineDash([]);
  ctx.globalAlpha = ok ? 0.65 : 0.45;
  const b = fakeBuilding(id, x, y);
  b.angle = -Math.PI / 2;
  drawBuilding(ctx, b, t, stubGame);
  if (!ok) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba('#ff5050', 0.85);
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(x + 0.3, y + 0.3);
    ctx.lineTo(x + 0.7, y + 0.7);
    ctx.moveTo(x + 0.7, y + 0.3);
    ctx.lineTo(x + 0.3, y + 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBuildingIcon(ctx: C, id: BuildingId, size: number, t = 1.3) {
  ctx.save();
  const tall = id === 'obelisk' ? 1 : id === 'frost' || id === 'tesla' || id === 'prism' || id === 'mender' || id === 'pyre' ? 0.5 : 0;
  const k = size * (tall === 1 ? 0.6 : tall ? 0.8 : 0.92);
  ctx.translate(size / 2, size * (0.5 + tall * 0.14));
  ctx.scale(k, k);
  ctx.translate(-0.5, -0.5);
  if (id === 'harvester') glow(ctx, 0.5, 0.55, 0.6, '#3fd0ff', 0.35);
  const b = fakeBuilding(id, 0, 0);
  if (id === 'mender') b.firing = 0;
  drawBuilding(ctx, b, t, stubGame);
  ctx.restore();
}

