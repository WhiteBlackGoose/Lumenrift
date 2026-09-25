import { ENEMIES, EnemyId } from '../../game/config';
import type { Enemy } from '../../game/game';
import { mix, rgba, shade } from './util';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Vertical offset (tiles) at which flyers are drawn above their ground position. */
export const FLY_HEIGHT = 0.45;

type Mode = 'body' | 'glow';

interface Pose {
  x: number;
  y: number;
  s: number;
  a: number;
  flip: number;
  ph: number;
}

function pose(e: Enemy, t: number): Pose {
  const ph = e.uid * 1.618;
  const k = Math.max(0, Math.min(1, e.age / 0.4));
  const s = e.def.radius * (0.55 + 0.45 * k);
  let y = e.y;
  if (e.def.flying) y -= FLY_HEIGHT + Math.sin(t * 3 + ph) * 0.06;
  const flip = Math.cos(e.facing) < -0.1 ? -1 : 1;
  return { x: e.x, y, s, a: k, flip, ph };
}

function fillBody(c: C, path: Path2D, e: Enemy, t: number, base: string, lw = 0.09) {
  const g = c.createRadialGradient(-0.3, -0.45, 0.05, 0, 0, 1.35);
  g.addColorStop(0, shade(base, 0.16));
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade(base, -0.8));
  c.fillStyle = g;
  c.fill(path);
  const slowed = e.slow > 0 || e.slowT > 0;
  if (slowed) {
    c.fillStyle = 'rgba(130,215,255,0.3)';
    c.fill(path);
  }
  if (e.burnT > 0) {
    c.fillStyle = rgba('#ff6a28', 0.16 + 0.1 * Math.sin(t * 25 + e.uid));
    c.fill(path);
  }
  if (e.hit > 0) {
    c.fillStyle = rgba('#ffffff', Math.min(1, e.hit / 0.12) * 0.8);
    c.fill(path);
  }
  c.strokeStyle = slowed ? 'rgba(200,240,255,0.9)' : 'rgba(6,3,14,0.85)';
  c.lineWidth = lw;
  c.stroke(path);
  if (!slowed) {
    // faint backlit rim in the creature's own eye colour so silhouettes read in the dark
    c.strokeStyle = rgba(e.def.eye, 0.28);
    c.lineWidth = lw * 0.4;
    c.stroke(path);
  }
}

/** Eye: solid dot in body mode, soft halo in glow mode (composite 'lighter' set by caller). */
function eye(c: C, mode: Mode, x: number, y: number, r: number, col: string, rot = 0, squash = 0.75) {
  if (mode === 'body') {
    c.fillStyle = mix(col, '#ffffff', 0.35);
    c.beginPath();
    c.ellipse(x, y, r, r * squash, rot, 0, TAU);
    c.fill();
    return;
  }
  const R = r * 3.2;
  const g = c.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, rgba(mix(col, '#ffffff', 0.5), 0.95));
  g.addColorStop(0.3, rgba(col, 0.6));
  g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g;
  c.fillRect(x - R, y - R, R * 2, R * 2);
}

function groundShadow(c: C, x: number, y: number, rx: number, a: number) {
  c.fillStyle = `rgba(0,0,0,${0.32 * a})`;
  c.beginPath();
  c.ellipse(x, y + 0.05, rx, rx * 0.4, 0, 0, TAU);
  c.fill();
}

// ------------------------------------------------------------------ types (local unit = radius)

function shadeEnemy(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  const b = Math.sin(t * 4 + P.ph) * 0.08;
  if (mode === 'body') {
    const p = new Path2D();
    p.moveTo(-0.85, 0.15 + b);
    p.arc(0, -0.05 + b, 0.85, Math.PI, 0);
    p.lineTo(0.85, 0.5 + b);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x0 = 0.85 - (i / n) * 1.7,
        x1 = 0.85 - ((i + 1) / n) * 1.7;
      const tip = 0.95 + 0.12 * Math.sin(t * 6 + P.ph + i * 1.3) + b;
      p.quadraticCurveTo((x0 + x1) / 2, tip + 0.1, x1, 0.55 + b + 0.05 * Math.sin(t * 5 + i));
    }
    p.closePath();
    fillBody(c, p, e, t, e.def.color);
  }
  const ex = P.flip * 0.12;
  eye(c, mode, -0.3 + ex, -0.15 + b, 0.13, e.def.eye, 0.35);
  eye(c, mode, 0.3 + ex, -0.15 + b, 0.13, e.def.eye, -0.35);
}

function skitter(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  c.rotate(e.facing);
  if (mode === 'body') {
    c.strokeStyle = shade(e.def.color, -0.3);
    c.lineWidth = 0.17;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const xs = [-0.4, -0.12, 0.14, 0.38];
    for (let i = 0; i < 4; i++)
      for (const s of [-1, 1]) {
        const sw = Math.sin(t * 20 + P.ph + i * 1.6 + (s > 0 ? Math.PI : 0)) * 0.25;
        const x = xs[i];
        c.beginPath();
        c.moveTo(x, s * 0.2);
        c.lineTo(x + sw * 0.6 + 0.05, s * 0.75);
        c.lineTo(x + sw - 0.12 + (i - 1.5) * 0.15, s * 1.15);
        c.stroke();
      }
    const p = new Path2D();
    p.ellipse(-0.35, 0, 0.62, 0.46, 0, 0, TAU);
    p.moveTo(0.72, 0);
    p.ellipse(0.4, 0, 0.32, 0.28, 0, 0, TAU);
    fillBody(c, p, e, t, e.def.color, 0.1);
    c.strokeStyle = rgba(e.def.eye, 0.35);
    c.lineWidth = 0.06;
    c.beginPath();
    c.moveTo(-0.7, 0);
    c.lineTo(-0.1, 0);
    c.stroke();
  }
  eye(c, mode, 0.58, -0.11, 0.07, e.def.eye);
  eye(c, mode, 0.58, 0.11, 0.07, e.def.eye);
  eye(c, mode, 0.48, -0.2, 0.05, e.def.eye);
  eye(c, mode, 0.48, 0.2, 0.05, e.def.eye);
}

function wraith(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  c.scale(P.flip, 1);
  if (mode === 'body') {
    const p = new Path2D();
    p.moveTo(-0.46, -0.3);
    p.arc(0, -0.42, 0.47, Math.PI * 0.92, Math.PI * 0.08);
    const w1 = Math.sin(t * 4 + P.ph) * 0.12;
    p.quadraticCurveTo(0.6, -0.1, 0.85 + w1, 0.25);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x0 = 0.85 - (i / n) * 1.7,
        x1 = 0.85 - ((i + 1) / n) * 1.7;
      const tipY = 0.95 + 0.14 * Math.sin(t * 6 + P.ph + i * 1.9);
      p.lineTo((x0 + x1) / 2 + Math.sin(t * 5 + i) * 0.05, tipY);
      p.lineTo(x1, 0.55 + (i === n - 1 ? -0.3 : 0));
    }
    p.quadraticCurveTo(-0.6, -0.1, -0.46, -0.3);
    p.closePath();
    fillBody(c, p, e, t, e.def.color);
    // tattered sleeve
    c.fillStyle = shade(e.def.color, -0.35);
    c.beginPath();
    c.moveTo(0.35, -0.05);
    c.quadraticCurveTo(0.95, 0.05 + w1, 1.05, 0.4 + w1);
    c.lineTo(0.55, 0.25);
    c.closePath();
    c.fill();
    c.fillStyle = '#05030a';
    c.beginPath();
    c.ellipse(0.05, -0.36, 0.28, 0.24, 0, 0, TAU);
    c.fill();
  }
  eye(c, mode, -0.06, -0.38, 0.07, e.def.eye);
  eye(c, mode, 0.16, -0.38, 0.07, e.def.eye);
}

function brute(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  const bob = -Math.abs(Math.sin(t * 5 + P.ph)) * 0.07;
  const sa = Math.sin(t * 5 + P.ph) * 0.14;
  c.translate(0, bob);
  if (mode === 'body') {
    const base = e.def.color;
    // horns
    c.fillStyle = '#6a5a52';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 0.18, -0.72);
      c.quadraticCurveTo(s * 0.95, -0.8, s * 0.88, -1.22);
      c.quadraticCurveTo(s * 0.72, -0.85, s * 0.42, -0.5);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(10,4,8,0.8)';
      c.lineWidth = 0.06;
      c.stroke();
    }
    const legs = new Path2D();
    legs.rect(-0.5, 0.55, 0.3, 0.35 + sa);
    legs.rect(0.2, 0.55, 0.3, 0.35 - sa);
    fillBody(c, legs, e, t, shade(base, -0.2), 0.07);
    const p = new Path2D();
    p.ellipse(0, 0.08, 0.88, 0.75, 0, 0, TAU);
    p.moveTo(0.42, -0.52);
    p.arc(0, -0.52, 0.42, 0, TAU);
    fillBody(c, p, e, t, base);
    for (const s of [-1, 1]) {
      const f = new Path2D();
      f.arc(s * 0.92, 0.32 + s * sa, 0.3, 0, TAU);
      fillBody(c, f, e, t, shade(base, 0.08), 0.08);
    }
    // cracks of inner fire
    c.strokeStyle = rgba(e.def.eye, 0.35);
    c.lineWidth = 0.05;
    c.beginPath();
    c.moveTo(-0.3, 0.0);
    c.lineTo(-0.1, 0.2);
    c.lineTo(-0.2, 0.45);
    c.moveTo(0.35, -0.05);
    c.lineTo(0.2, 0.25);
    c.stroke();
  }
  const ex = P.flip * 0.08;
  eye(c, mode, -0.16 + ex, -0.52, 0.1, e.def.eye, 0.4, 0.45);
  eye(c, mode, 0.16 + ex, -0.52, 0.1, e.def.eye, -0.4, 0.45);
}

const BROOD_EYES: [number, number, number][] = [
  [-0.55, -0.5, 0.09],
  [-0.38, -0.3, 0.06],
  [0.5, -0.45, 0.08],
  [0.66, -0.28, 0.06],
  [0.05, -0.7, 0.08],
  [-0.12, -0.08, 0.07],
  [0.22, -0.12, 0.06],
];

function brood(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  const p = 1 + 0.05 * Math.sin(t * 3 + P.ph);
  if (mode === 'body') {
    c.strokeStyle = shade(e.def.color, -0.5);
    c.lineWidth = 0.09;
    c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x = -0.6 + i * 0.24;
      const sw = Math.sin(t * 10 + P.ph + i * 1.3) * 0.1;
      c.beginPath();
      c.moveTo(x, 0.6);
      c.lineTo(x + sw + (x < 0 ? -0.1 : 0.1), 0.98);
      c.stroke();
    }
    const path = new Path2D();
    path.ellipse(0, 0.1, 0.95 * p, 0.78 * p, 0, 0, TAU);
    path.moveTo(-0.17, -0.45);
    path.arc(-0.55, -0.45, 0.38, 0, TAU);
    path.moveTo(0.89, -0.42);
    path.arc(0.55, -0.42, 0.34, 0, TAU);
    path.moveTo(0.35, -0.62);
    path.arc(0.05, -0.62, 0.3, 0, TAU);
    fillBody(c, path, e, t, e.def.color);
    // translucent egg veins
    c.strokeStyle = rgba(e.def.eye, 0.18);
    c.lineWidth = 0.04;
    c.beginPath();
    c.moveTo(-0.6, 0.3);
    c.quadraticCurveTo(0, 0.0, 0.6, 0.35);
    c.moveTo(-0.3, 0.6);
    c.quadraticCurveTo(0.1, 0.35, 0.45, 0.65);
    c.stroke();
  }
  for (const [x, y, r] of BROOD_EYES) eye(c, mode, x * p, y * p, r, e.def.eye, 0, 1);
}

function warden(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  const sway = Math.sin(t * 2.5 + P.ph);
  const f = P.flip;
  const lx = f * 0.66 + sway * 0.05,
    ly = -0.72;
  if (mode === 'body') {
    c.strokeStyle = '#3a2a1a';
    c.lineWidth = 0.1;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(f * 0.6, 1.0);
    c.lineTo(f * 0.6, -0.95);
    c.quadraticCurveTo(f * 0.62, -1.1, f * 0.8, -1.02);
    c.stroke();
    const p = new Path2D();
    p.moveTo(-0.3, -0.45);
    p.lineTo(-0.78, 0.85);
    p.quadraticCurveTo(0, 1.05 + Math.sin(t * 4 + P.ph) * 0.06, 0.78, 0.85);
    p.lineTo(0.3, -0.45);
    p.closePath();
    p.moveTo(0.42, -0.55);
    p.arc(0, -0.55, 0.42, 0, TAU);
    fillBody(c, p, e, t, e.def.color);
    c.fillStyle = '#040810';
    c.beginPath();
    c.ellipse(f * 0.05, -0.5, 0.25, 0.22, 0, 0, TAU);
    c.fill();
    // lantern
    c.strokeStyle = '#6a7a80';
    c.lineWidth = 0.04;
    c.beginPath();
    c.moveTo(f * 0.8, -1.02);
    c.lineTo(lx, ly - 0.12);
    c.stroke();
    c.fillStyle = '#1a2a2a';
    c.fillRect(lx - 0.11, ly - 0.13, 0.22, 0.27);
    c.fillStyle = mix(e.def.eye, '#ffffff', 0.4);
    c.fillRect(lx - 0.07, ly - 0.09, 0.14, 0.19);
    c.strokeStyle = '#8a9aa0';
    c.lineWidth = 0.03;
    c.strokeRect(lx - 0.11, ly - 0.13, 0.22, 0.27);
  } else {
    const R = 1.4 + 0.1 * Math.sin(t * 7 + P.ph);
    const g = c.createRadialGradient(lx, ly, 0, lx, ly, R);
    g.addColorStop(0, rgba(e.def.eye, 0.7));
    g.addColorStop(0.3, rgba(e.def.eye, 0.25));
    g.addColorStop(1, rgba(e.def.eye, 0));
    c.fillStyle = g;
    c.fillRect(lx - R, ly - R, R * 2, R * 2);
  }
  eye(c, mode, f * 0.05 - 0.1, -0.5, 0.055, e.def.eye);
  eye(c, mode, f * 0.05 + 0.1, -0.5, 0.055, e.def.eye);
}

function carapace(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  c.rotate(e.facing);
  if (mode === 'body') {
    c.strokeStyle = shade(e.def.color, -0.5);
    c.lineWidth = 0.13;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++)
      for (const s of [-1, 1]) {
        const sw = Math.sin(t * 12 + P.ph + i * 2 + (s > 0 ? Math.PI : 0)) * 0.15;
        const x = -0.4 + i * 0.4;
        c.beginPath();
        c.moveTo(x, s * 0.5);
        c.lineTo(x + sw + 0.1, s * 0.95);
        c.stroke();
      }
    const head = new Path2D();
    head.arc(0.8, 0, 0.32, 0, TAU);
    fillBody(c, head, e, t, shade(e.def.color, -0.15));
    c.strokeStyle = '#8a8a70';
    c.lineWidth = 0.07;
    c.beginPath();
    c.moveTo(1.0, -0.15);
    c.quadraticCurveTo(1.3, -0.2, 1.25, 0.02);
    c.moveTo(1.0, 0.15);
    c.quadraticCurveTo(1.3, 0.2, 1.25, -0.02);
    c.stroke();
    const shell = new Path2D();
    shell.ellipse(-0.1, 0, 0.95, 0.78, 0, 0, TAU);
    fillBody(c, shell, e, t, mix(e.def.color, '#6a6a80', 0.35));
    // plates
    c.strokeStyle = 'rgba(8,8,14,0.8)';
    c.lineWidth = 0.06;
    c.beginPath();
    c.moveTo(-1.02, 0);
    c.lineTo(0.82, 0);
    for (const x of [-0.55, 0.0, 0.45]) {
      const hh = Math.sqrt(Math.max(0, 1 - ((x + 0.1) / 0.95) ** 2)) * 0.78;
      c.moveTo(x, -hh);
      c.quadraticCurveTo(x + 0.15, 0, x, hh);
    }
    c.stroke();
    c.fillStyle = 'rgba(230,230,255,0.16)';
    c.beginPath();
    c.ellipse(-0.25, -0.35, 0.45, 0.14, -0.1, 0, TAU);
    c.fill();
    c.fillStyle = rgba(e.def.eye, 0.25);
    for (const x of [-0.75, -0.3, 0.2]) {
      c.beginPath();
      c.arc(x, -0.45, 0.05, 0, TAU);
      c.arc(x, 0.45, 0.05, 0, TAU);
      c.fill();
    }
  }
  eye(c, mode, 0.98, -0.14, 0.07, e.def.eye);
  eye(c, mode, 0.98, 0.14, 0.07, e.def.eye);
}

const COLOSSUS_EYES: [number, number, number][] = [
  [0, -0.66, 0.1],
  [-0.22, -0.6, 0.075],
  [0.22, -0.6, 0.075],
  [-0.36, -0.44, 0.06],
  [0.36, -0.44, 0.06],
  [-0.13, -0.42, 0.055],
  [0.13, -0.42, 0.055],
];

function colossus(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  const stomp = -Math.abs(Math.sin(t * 3 + P.ph)) * 0.08;
  const sa = Math.sin(t * 3 + P.ph) * 0.12;
  c.translate(0, stomp);
  if (mode === 'body') {
    const base = e.def.color;
    const legs = new Path2D();
    legs.rect(-0.55, 0.55, 0.38, 0.45 + sa);
    legs.rect(0.17, 0.55, 0.38, 0.45 - sa);
    fillBody(c, legs, e, t, shade(base, -0.2), 0.06);
    const p = new Path2D();
    p.moveTo(-1.0, 0.15);
    p.quadraticCurveTo(-1.05, -0.45, -0.45, -0.55);
    p.lineTo(0.45, -0.55);
    p.quadraticCurveTo(1.05, -0.45, 1.0, 0.15);
    p.quadraticCurveTo(0.9, 0.85, 0, 0.9);
    p.quadraticCurveTo(-0.9, 0.85, -1.0, 0.15);
    p.closePath();
    p.moveTo(0.5, -0.58);
    p.arc(0, -0.58, 0.5, 0, TAU);
    fillBody(c, p, e, t, base, 0.06);
    // crown
    c.fillStyle = '#12081a';
    c.beginPath();
    for (let i = -2; i <= 2; i++) {
      const a = -Math.PI / 2 + i * 0.42;
      const r0 = 0.42,
        r1 = 1.0 + (i === 0 ? 0.2 : Math.abs(i) === 1 ? 0.05 : -0.1);
      c.moveTo(Math.cos(a - 0.14) * r0, -0.58 + Math.sin(a - 0.14) * r0);
      c.lineTo(Math.cos(a) * r1, -0.58 + Math.sin(a) * r1);
      c.lineTo(Math.cos(a + 0.14) * r0, -0.58 + Math.sin(a + 0.14) * r0);
    }
    c.fill();
    c.strokeStyle = rgba(e.def.eye, 0.55);
    c.lineWidth = 0.04;
    c.stroke();
    for (const s of [-1, 1]) {
      const f = new Path2D();
      f.arc(s * 1.02, 0.3 + s * sa, 0.36, 0, TAU);
      fillBody(c, f, e, t, shade(base, 0.1), 0.06);
    }
    c.strokeStyle = rgba(e.def.eye, 0.3);
    c.lineWidth = 0.05;
    c.beginPath();
    c.moveTo(0, -0.1);
    c.lineTo(-0.2, 0.2);
    c.lineTo(0, 0.5);
    c.lineTo(0.2, 0.2);
    c.closePath();
    c.stroke();
  } else {
    const R = 0.5;
    const g = c.createRadialGradient(0, 0.2, 0, 0, 0.2, R);
    g.addColorStop(0, rgba(e.def.eye, 0.25 + 0.15 * Math.sin(t * 4)));
    g.addColorStop(1, rgba(e.def.eye, 0));
    c.fillStyle = g;
    c.fillRect(-R, 0.2 - R, R * 2, R * 2);
  }
  for (const [x, y, r] of COLOSSUS_EYES) eye(c, mode, x + P.flip * 0.04, y, r, e.def.eye, 0, 0.8);
}

// --- wyrm: segmented serpent following its own flight trail
const trails = new WeakMap<Enemy, { x: number; y: number }[]>();
const WYRM_SEGS = 9;

function wyrmSegments(e: Enemy, spacing: number): { x: number; y: number }[] {
  let tr = trails.get(e);
  if (!tr) {
    tr = [];
    trails.set(e, tr);
  }
  const out: { x: number; y: number }[] = [];
  let px = e.x,
    py = e.y,
    need = spacing * 0.6,
    i = 0;
  const bx = -Math.cos(e.facing),
    by = -Math.sin(e.facing);
  while (out.length < WYRM_SEGS) {
    if (i < tr.length) {
      const q = tr[i];
      const d = Math.hypot(q.x - px, q.y - py);
      if (d >= need) {
        const k = need / d;
        px += (q.x - px) * k;
        py += (q.y - py) * k;
        out.push({ x: px, y: py });
        need = spacing;
      } else {
        need -= d;
        px = q.x;
        py = q.y;
        i++;
      }
    } else {
      px += bx * need;
      py += by * need;
      out.push({ x: px, y: py });
      need = spacing;
    }
  }
  return out;
}

function updateTrail(e: Enemy) {
  let tr = trails.get(e);
  if (!tr) {
    tr = [];
    trails.set(e, tr);
  }
  const h = tr[0];
  if (!h || Math.hypot(h.x - e.x, h.y - e.y) > 0.04) {
    tr.unshift({ x: e.x, y: e.y });
    if (tr.length > 80) tr.pop();
  }
}

function wyrm(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  // drawn in world space (caller did not transform)
  const r = P.s;
  const segs = wyrmSegments(e, r * 0.72);
  const lift = (k: number) => FLY_HEIGHT + Math.sin(t * 3 + P.ph - k * 0.55) * 0.07;
  if (mode === 'body') {
    for (let k = WYRM_SEGS - 1; k >= 0; k--) groundShadow(c, segs[k].x, segs[k].y, r * (0.7 - k * 0.05), P.a * 0.8);
    groundShadow(c, e.x, e.y, r * 0.9, P.a);
  }
  // wings on the first segment
  const s1 = segs[1];
  const hx = e.x,
    hy = P.y;
  const dir = Math.atan2(hy - (s1.y - lift(1)), hx - s1.x);
  const flap = Math.sin(t * 5 + P.ph);
  for (let k = WYRM_SEGS - 1; k >= 0; k--) {
    const sg = segs[k];
    const sx = sg.x,
      sy = sg.y - lift(k + 1);
    const rad = r * (0.6 - k * 0.042);
    c.save();
    c.translate(sx, sy);
    c.scale(rad, rad);
    if (mode === 'body') {
      const p = new Path2D();
      p.arc(0, 0, 1, 0, TAU);
      fillBody(c, p, e, t, k % 2 ? shade(e.def.color, 0.08) : e.def.color, 0.1);
      c.fillStyle = shade(e.def.color, -0.5);
      c.beginPath();
      c.moveTo(-0.3, -0.7);
      c.lineTo(0, -1.4);
      c.lineTo(0.3, -0.7);
      c.fill();
    } else {
      c.fillStyle = rgba(e.def.eye, 0.35);
      c.beginPath();
      c.arc(0, -0.2, 0.18, 0, TAU);
      c.fill();
    }
    c.restore();
    if (k === 1 && mode === 'body') {
      // translucent membrane wings
      for (const side of [-1, 1]) {
        const a = dir + (side * Math.PI) / 2;
        const span = r * 1.9 * (0.8 + 0.2 * flap);
        const back = r * 0.9;
        const tipx = sx + Math.cos(a) * span - Math.cos(dir) * back,
          tipy = sy + Math.sin(a) * span * 0.8 - Math.sin(dir) * back - flap * r * 0.35;
        const rootF = [sx + Math.cos(dir) * r * 0.35, sy + Math.sin(dir) * r * 0.35];
        const rootB = [sx - Math.cos(dir) * r * 1.1, sy - Math.sin(dir) * r * 1.1];
        const wg = c.createLinearGradient(sx, sy, tipx, tipy);
        wg.addColorStop(0, rgba(shade(e.def.color, -0.3), 0.95));
        wg.addColorStop(1, rgba(shade(e.def.color, 0.25), 0.55));
        c.fillStyle = wg;
        c.beginPath();
        c.moveTo(rootF[0], rootF[1]);
        c.quadraticCurveTo(tipx + Math.cos(dir) * r * 0.6, tipy + Math.sin(dir) * r * 0.6, tipx, tipy);
        // scalloped trailing edge
        const mx1 = tipx + (rootB[0] - tipx) * 0.5,
          my1 = tipy + (rootB[1] - tipy) * 0.5;
        c.quadraticCurveTo((tipx + mx1) / 2 - Math.cos(dir) * r * 0.1, (tipy + my1) / 2 - Math.sin(dir) * r * 0.1, mx1, my1);
        c.quadraticCurveTo((mx1 + rootB[0]) / 2 - Math.cos(dir) * r * 0.1, (my1 + rootB[1]) / 2 - Math.sin(dir) * r * 0.1, rootB[0], rootB[1]);
        c.closePath();
        c.fill();
        c.strokeStyle = rgba(e.def.eye, 0.45);
        c.lineWidth = r * 0.05;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(tipx, tipy);
        c.moveTo(sx, sy);
        c.lineTo(mx1, my1);
        c.stroke();
      }
    }
  }
  // head
  c.save();
  c.translate(hx, hy);
  c.scale(r * 0.8, r * 0.8);
  c.rotate(dir);
  if (mode === 'body') {
    const p = new Path2D();
    p.moveTo(1.15, 0);
    p.quadraticCurveTo(0.9, -0.45, 0.2, -0.55);
    p.quadraticCurveTo(-0.55, -0.55, -0.6, 0);
    p.quadraticCurveTo(-0.55, 0.55, 0.2, 0.55);
    p.quadraticCurveTo(0.9, 0.45, 1.15, 0);
    p.closePath();
    // horns
    c.fillStyle = '#8aa0c0';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(-0.2, s * 0.35);
      c.quadraticCurveTo(-0.8, s * 0.7, -1.1, s * 0.55);
      c.quadraticCurveTo(-0.7, s * 0.45, -0.4, s * 0.15);
      c.fill();
    }
    fillBody(c, p, e, t, e.def.color, 0.08);
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 0.06;
    c.beginPath();
    c.moveTo(1.1, 0);
    c.lineTo(0.45, 0.08);
    c.stroke();
  }
  eye(c, mode, 0.42, -0.25, 0.1, e.def.eye, 0.3, 0.55);
  eye(c, mode, 0.42, 0.25, 0.1, e.def.eye, -0.3, 0.55);
  c.restore();
}

const DRAW: Record<EnemyId, (c: C, e: Enemy, t: number, P: Pose, mode: Mode) => void> = {
  shade: shadeEnemy,
  skitter,
  wraith,
  brute,
  brood,
  warden,
  carapace,
  colossus,
  wyrm,
};

function render(c: C, e: Enemy, t: number, mode: Mode) {
  const P = pose(e, t);
  c.save();
  c.globalAlpha *= P.a;
  if (mode === 'body') {
    if (e.elite) eliteAura(c, e, t, P);
    if (e.def.flying && e.def.id !== 'wyrm') groundShadow(c, e.x, e.y, P.s * 0.85, P.a);
    else if (!e.def.flying) groundShadow(c, e.x, e.y + P.s * 0.55, P.s * 0.9, P.a * 0.8);
  }
  if (e.def.id === 'wyrm') {
    if (mode === 'body') updateTrail(e);
    wyrm(c, e, t, P, mode);
  } else {
    c.save();
    c.translate(P.x, P.y);
    c.scale(P.s, P.s);
    DRAW[e.def.id](c, e, t, P, mode);
    c.restore();
  }
  if (mode === 'glow') {
    const R = P.s * 1.9;
    const ag = c.createRadialGradient(P.x, P.y, 0, P.x, P.y, R);
    ag.addColorStop(0, rgba(e.def.eye, 0.13));
    ag.addColorStop(1, rgba(e.def.eye, 0));
    c.fillStyle = ag;
    c.fillRect(P.x - R, P.y - R, R * 2, R * 2);
    if (e.burnT > 0) embers(c, t, P);
    if (e.elite) {
      const R = P.s * 1.6;
      const g = c.createRadialGradient(P.x, P.y, 0, P.x, P.y, R);
      g.addColorStop(0, 'rgba(255,40,70,0.18)');
      g.addColorStop(1, 'rgba(255,40,70,0)');
      c.fillStyle = g;
      c.fillRect(P.x - R, P.y - R, R * 2, R * 2);
    }
  }
  c.restore();
}

function eliteAura(c: C, e: Enemy, t: number, P: Pose) {
  const gx = e.x,
    gy = e.y + (e.def.flying ? 0 : P.s * 0.4);
  const R = P.s * 1.7;
  const g = c.createRadialGradient(gx, gy, R * 0.4, gx, gy, R);
  g.addColorStop(0, 'rgba(255,30,60,0)');
  g.addColorStop(0.75, 'rgba(255,30,60,0.28)');
  g.addColorStop(1, 'rgba(255,30,60,0)');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(gx, gy, R, R * 0.55, 0, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(255,70,90,0.75)';
  c.lineWidth = 0.025;
  c.setLineDash([0.08, 0.06]);
  c.lineDashOffset = -t * 0.4;
  c.beginPath();
  c.ellipse(gx, gy, R * 0.8, R * 0.44, 0, 0, TAU);
  c.stroke();
  c.setLineDash([]);
}

function embers(c: C, t: number, P: Pose) {
  for (let i = 0; i < 4; i++) {
    const ph = (t * 1.6 + i / 4 + P.ph) % 1;
    const x = P.x + Math.sin(P.ph * 7 + i * 2.1 + t * 2) * P.s * 0.7;
    const y = P.y + P.s * 0.3 - ph * P.s * 2.2;
    const r = 0.03 * (1 - ph) + 0.01;
    const g = c.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, rgba('#ffd27a', 0.9 * (1 - ph)));
    g.addColorStop(1, rgba('#ff5020', 0));
    c.fillStyle = g;
    c.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
}

export function drawEnemy(ctx: C, e: Enemy, t: number): void {
  render(ctx, e, t, 'body');
}

export function drawEnemyGlow(ctx: C, e: Enemy, t: number): void {
  render(ctx, e, t, 'glow');
}

export function fakeEnemy(id: EnemyId, x: number, y: number): Enemy {
  const def = ENEMIES[id];
  return {
    uid: 3,
    def,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: 1,
    maxHp: 1,
    slow: 0,
    slowT: 0,
    slowAmt: 0,
    burn: 0,
    burnT: 0,
    wx: 0,
    wy: 0,
    hasWp: false,
    jx: 0,
    jy: 0,
    attackCd: 0,
    attacking: -1,
    dist: 0,
    dead: false,
    age: 5,
    hit: 0,
    abilityCd: 0,
    facing: id === 'wyrm' ? -0.5 : 0,
    bounty: 0,
    elite: false,
  };
}

export function drawEnemyIcon(ctx: C, id: EnemyId, size: number) {
  const def = ENEMIES[id];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.clip();
  const span = id === 'wyrm' ? 4.4 : id === 'colossus' ? 2.6 : 2.5;
  const k = size / (span * def.radius);
  ctx.translate(size / 2, size / 2);
  ctx.scale(k, k);
  let e: Enemy;
  if (id === 'wyrm') e = fakeEnemy(id, def.radius * 1.2, FLY_HEIGHT - def.radius * 0.7);
  else if (def.flying) e = fakeEnemy(id, 0, FLY_HEIGHT - def.radius * 0.15);
  else e = fakeEnemy(id, 0, id === 'brute' || id === 'colossus' ? def.radius * 0.1 : 0);
  drawEnemy(ctx, e, 1.2);
  ctx.globalCompositeOperation = 'lighter';
  drawEnemyGlow(ctx, e, 1.2);
  ctx.restore();
}
