// The Blight: day-realm enemies. Same conventions as enemies.ts — the ctx is translated to the
// body centre and scaled so 1 local unit = the enemy's radius; `mode` draws either the body or
// only its glowing bits (eyes, spores, pods) for the additive pass.
import type { EnemyId } from '../../game/config';
import type { Enemy } from '../../game/game';
import { eye, fillBody, type Mode, type Pose } from './enemies';
import { mix, rgba, shade } from './util';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ rotling: squelchy mould blob

function rotling(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  const sq = Math.sin(t * 5 + P.ph);
  c.scale(1 + sq * 0.05, 1 - sq * 0.05);
  if (mode === 'body') {
    const base = e.def.color;
    const p = new Path2D();
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const r = 0.86 + 0.08 * Math.sin(3 * a + t * 4 + P.ph) + 0.05 * Math.sin(5 * a - t * 3);
      const x = Math.cos(a) * r;
      const y = Math.min(0.62, Math.sin(a) * r * 0.86);
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    fillBody(c, p, e, t, base, 0.1);
    // moss cap and lumps
    c.fillStyle = mix(base, '#b9d06a', 0.45);
    for (const [x, y, rx] of [
      [-0.35, -0.55, 0.26],
      [0.1, -0.7, 0.3],
      [0.48, -0.45, 0.2],
    ] as const) {
      c.beginPath();
      c.ellipse(x, y, rx, rx * 0.6, 0, 0, TAU);
      c.fill();
    }
    c.fillStyle = mix(base, '#e3f0a0', 0.5);
    c.beginPath();
    c.ellipse(-0.05, -0.75, 0.12, 0.06, 0, 0, TAU);
    c.fill();
    // a tiny toadstool riding on top
    c.strokeStyle = '#d8ccb0';
    c.lineWidth = 0.06;
    c.beginPath();
    c.moveTo(0.42, -0.55);
    c.lineTo(0.47, -0.82);
    c.stroke();
    c.fillStyle = '#b06a4a';
    c.beginPath();
    c.ellipse(0.48, -0.84, 0.17, 0.1, 0.15, Math.PI, 0);
    c.fill();
    c.fillStyle = 'rgba(255,240,210,0.85)';
    c.beginPath();
    c.arc(0.43, -0.88, 0.03, 0, TAU);
    c.arc(0.53, -0.86, 0.025, 0, TAU);
    c.fill();
    // ooze drips
    c.fillStyle = shade(base, -0.35);
    for (const x of [-0.55, -0.1, 0.4]) {
      const d = 0.08 + 0.06 * Math.sin(t * 3 + x * 9 + P.ph);
      c.beginPath();
      c.ellipse(x, 0.62 + d, 0.06, 0.06 + d * 0.6, 0, 0, TAU);
      c.fill();
    }
    // gaping mouth
    c.fillStyle = 'rgba(25,20,8,0.9)';
    c.beginPath();
    c.ellipse(P.flip * 0.05, 0.2, 0.26, 0.09 + 0.05 * Math.abs(sq), 0, 0, TAU);
    c.fill();
  }
  const ex = P.flip * 0.1;
  eye(c, mode, -0.28 + ex, -0.15, 0.12, e.def.eye, 0.2);
  eye(c, mode, 0.24 + ex, -0.22, 0.1, e.def.eye, -0.2);
}

// ------------------------------------------------------------------ gnat: a tiny buzzing cluster

function gnat(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = t * 7 + (i / n) * TAU + P.ph;
    const x = Math.cos(a) * 0.55 + Math.sin(t * 13 + i * 2.3) * 0.14;
    const y = Math.sin(a * 1.3) * 0.42 - 0.15 + Math.cos(t * 11 + i) * 0.12;
    const s = 0.82 + (i % 2) * 0.22;
    if (mode === 'body') {
      // blurred wings
      const w = 0.16 + 0.1 * Math.abs(Math.sin(t * 60 + i * 1.7));
      c.fillStyle = 'rgba(235,245,220,0.6)';
      c.beginPath();
      c.ellipse(x - 0.1 * s, y - 0.12 * s, w * s, 0.08 * s, -0.5, 0, TAU);
      c.ellipse(x + 0.1 * s, y - 0.12 * s, w * s, 0.08 * s, 0.5, 0, TAU);
      c.fill();
      const b = new Path2D();
      b.ellipse(x, y, 0.18 * s, 0.13 * s, 0, 0, TAU);
      fillBody(c, b, e, t, e.def.color, 0.06);
    }
    eye(c, mode, x + 0.08 * s, y - 0.03 * s, 0.05 * s, e.def.eye, 0, 1);
  }
}

// ------------------------------------------------------------------ moth: plague moth, top-down

function moth(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  c.rotate(e.facing);
  const k = 0.55 + 0.45 * Math.abs(Math.sin(t * 11 + P.ph));
  if (mode === 'body') {
    const base = e.def.color;
    const wingCol = mix(base, '#cbb59c', 0.3);
    for (const s of [-1, 1]) {
      // hindwing
      const h = new Path2D();
      h.moveTo(-0.15, s * 0.1);
      h.quadraticCurveTo(-0.35, s * 0.85 * k, -0.85, s * 0.7 * k);
      h.quadraticCurveTo(-0.85, s * 0.25 * k, -0.4, s * 0.12);
      h.closePath();
      fillBody(c, h, e, t, shade(wingCol, -0.15), 0.06);
      // forewing
      const f = new Path2D();
      f.moveTo(0.2, s * 0.1);
      f.quadraticCurveTo(0.35, s * 1.05 * k, -0.25, s * 1.2 * k);
      f.quadraticCurveTo(-0.5, s * 0.75 * k, -0.25, s * 0.15);
      f.closePath();
      fillBody(c, f, e, t, wingCol, 0.06);
      // dusty bands
      c.strokeStyle = rgba(shade(base, -0.45), 0.6);
      c.lineWidth = 0.05;
      c.beginPath();
      c.moveTo(0.12, s * 0.45 * k);
      c.quadraticCurveTo(-0.05, s * 0.6 * k, -0.32, s * 0.55 * k);
      c.moveTo(0.05, s * 0.8 * k);
      c.quadraticCurveTo(-0.1, s * 0.92 * k, -0.3, s * 0.95 * k);
      c.stroke();
      // eyespot
      c.fillStyle = 'rgba(30,20,30,0.85)';
      c.beginPath();
      c.ellipse(-0.05, s * 0.72 * k, 0.13, 0.13 * k, 0, 0, TAU);
      c.fill();
      c.fillStyle = mix(e.def.eye, '#ffffff', 0.2);
      c.beginPath();
      c.ellipse(-0.05, s * 0.72 * k, 0.055, 0.055 * k, 0, 0, TAU);
      c.fill();
    }
    // fuzzy segmented body
    const b = new Path2D();
    b.ellipse(-0.1, 0, 0.55, 0.17, 0, 0, TAU);
    b.moveTo(0.5, 0);
    b.arc(0.38, 0, 0.13, 0, TAU);
    fillBody(c, b, e, t, shade(base, -0.1), 0.06);
    c.strokeStyle = 'rgba(20,12,20,0.6)';
    c.lineWidth = 0.035;
    c.beginPath();
    for (const x of [-0.45, -0.28, -0.1, 0.08]) {
      c.moveTo(x, -0.15);
      c.lineTo(x, 0.15);
    }
    c.stroke();
    // feathery antennae
    c.strokeStyle = shade(base, -0.4);
    c.lineWidth = 0.035;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(0.46, s * 0.06);
      c.quadraticCurveTo(0.75, s * 0.12, 0.78, s * 0.35);
      c.stroke();
    }
  } else {
    // faint plague dust shimmering off the wings
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.8 + i / 3 + P.ph) % 1;
      const x = -0.4 - ph * 0.9,
        y = Math.sin(i * 2.1 + t * 3) * 0.5;
      const r = 0.18 * (1 - ph);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(e.def.eye, 0.4 * (1 - ph)));
      g.addColorStop(1, rgba(e.def.eye, 0));
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const s of [-1, 1]) eye(c, mode, -0.05, s * 0.72 * k, 0.05, e.def.eye, 0, 1);
  }
  eye(c, mode, 0.46, -0.08, 0.05, e.def.eye, 0, 1);
  eye(c, mode, 0.46, 0.08, 0.05, e.def.eye, 0, 1);
}

// ------------------------------------------------------------------ boar: thornback, side view

function boar(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  c.scale(P.flip, 1);
  const trot = Math.sin(t * 9 + P.ph);
  c.translate(0, -Math.abs(trot) * 0.05);
  if (mode === 'body') {
    const base = e.def.color;
    // legs
    const legs = new Path2D();
    for (const [x, ph] of [
      [-0.62, 0],
      [-0.3, Math.PI],
      [0.25, Math.PI],
      [0.52, 0],
    ] as const) {
      const sw = Math.sin(t * 9 + P.ph + ph) * 0.12;
      legs.rect(x + sw - 0.09, 0.32, 0.18, 0.45);
    }
    fillBody(c, legs, e, t, shade(base, -0.3), 0.06);
    // body + head
    const p = new Path2D();
    p.ellipse(-0.12, 0.05, 0.86, 0.55, 0, 0, TAU);
    p.moveTo(1.08, 0.12);
    p.ellipse(0.72, 0.1, 0.38, 0.34, 0.2, 0, TAU);
    fillBody(c, p, e, t, base, 0.08);
    // snout
    const sn = new Path2D();
    sn.ellipse(1.08, 0.24, 0.17, 0.14, 0, 0, TAU);
    fillBody(c, sn, e, t, mix(base, '#c08a7a', 0.45), 0.05);
    c.fillStyle = 'rgba(30,10,10,0.8)';
    c.beginPath();
    c.arc(1.13, 0.22, 0.03, 0, TAU);
    c.arc(1.13, 0.3, 0.03, 0, TAU);
    c.fill();
    // tusks
    c.fillStyle = '#eee3c6';
    c.strokeStyle = 'rgba(40,25,10,0.8)';
    c.lineWidth = 0.03;
    c.beginPath();
    c.moveTo(0.95, 0.34);
    c.quadraticCurveTo(1.12, 0.36, 1.18, 0.05);
    c.quadraticCurveTo(1.06, 0.24, 0.92, 0.26);
    c.closePath();
    c.fill();
    c.stroke();
    // ear
    c.fillStyle = shade(base, -0.25);
    c.beginPath();
    c.moveTo(0.55, -0.15);
    c.lineTo(0.62, -0.5);
    c.lineTo(0.75, -0.18);
    c.closePath();
    c.fill();
    // bramble spines along the back
    c.lineJoin = 'round';
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (1.08 + i * 0.105);
      const bx = -0.12 + Math.cos(a) * 0.86,
        by = 0.05 + Math.sin(a) * 0.55;
      const out = 0.28 + (i % 2) * 0.12;
      const tx = bx + Math.cos(a) * out - 0.12,
        ty = by + Math.sin(a) * out - 0.04;
      c.fillStyle = i % 2 ? '#3d5a24' : '#4f6e2c';
      c.beginPath();
      c.moveTo(bx - 0.08, by + 0.03);
      c.lineTo(tx, ty);
      c.lineTo(bx + 0.08, by + 0.03);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(15,20,8,0.85)';
      c.lineWidth = 0.025;
      c.stroke();
      c.fillStyle = '#c7d28a';
      c.beginPath();
      c.arc(tx, ty, 0.025, 0, TAU);
      c.fill();
    }
    // a curl of vine across the flank
    c.strokeStyle = 'rgba(60,90,35,0.85)';
    c.lineWidth = 0.05;
    c.beginPath();
    c.moveTo(-0.75, 0.25);
    c.bezierCurveTo(-0.4, -0.05, -0.1, 0.4, 0.3, 0.1);
    c.stroke();
  }
  eye(c, mode, 0.8, -0.02, 0.07, e.def.eye, 0, 0.7);
}

// ------------------------------------------------------------------ sporemother: bloated fungal sac

const SPORE_EYES: [number, number, number][] = [
  [-0.35, 0.05, 0.08],
  [0.28, -0.02, 0.07],
  [-0.05, 0.25, 0.06],
  [0.5, 0.25, 0.05],
  [-0.55, 0.3, 0.05],
];

function sporemother(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  const p = 1 + 0.06 * Math.sin(t * 2.6 + P.ph);
  if (mode === 'body') {
    const base = e.def.color;
    c.strokeStyle = shade(base, -0.45);
    c.lineWidth = 0.08;
    c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x = -0.55 + i * 0.22;
      const sw = Math.sin(t * 8 + P.ph + i * 1.4) * 0.12;
      c.beginPath();
      c.moveTo(x, 0.55);
      c.quadraticCurveTo(x + sw, 0.8, x + sw * 1.5 + (x < 0 ? -0.08 : 0.08), 0.98);
      c.stroke();
    }
    const sac = new Path2D();
    sac.ellipse(0, 0.15, 0.88 * p, 0.7 * p, 0, 0, TAU);
    fillBody(c, sac, e, t, base);
    // fungal cap
    const capCol = mix(base, '#9a6a7a', 0.55);
    const cap = new Path2D();
    cap.moveTo(-1.0 * p, -0.25);
    cap.bezierCurveTo(-0.95 * p, -1.0 * p, 0.95 * p, -1.0 * p, 1.0 * p, -0.25);
    cap.quadraticCurveTo(0, -0.05, -1.0 * p, -0.25);
    cap.closePath();
    fillBody(c, cap, e, t, capCol, 0.08);
    // gills
    c.strokeStyle = rgba(shade(capCol, -0.5), 0.7);
    c.lineWidth = 0.03;
    c.beginPath();
    for (let i = -4; i <= 4; i++) {
      c.moveTo(i * 0.2 * p, -0.2 + Math.abs(i) * 0.01);
      c.lineTo(i * 0.16 * p, -0.08);
    }
    c.stroke();
    // pale cap spots
    c.fillStyle = 'rgba(245,235,215,0.85)';
    for (const [x, y, r] of [
      [-0.45, -0.55, 0.09],
      [0.1, -0.75, 0.11],
      [0.55, -0.5, 0.07],
      [-0.12, -0.45, 0.06],
    ] as const) {
      c.beginPath();
      c.ellipse(x * p, y * p, r, r * 0.75, 0, 0, TAU);
      c.fill();
    }
    // drifting spore puffs
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.6 + i / 4 + P.ph) % 1;
      const x = Math.sin(i * 2.4 + t) * 0.5,
        y = -0.8 - ph * 0.9;
      c.fillStyle = `rgba(235,240,190,${0.55 * (1 - ph)})`;
      c.beginPath();
      c.arc(x, y, 0.06 + ph * 0.08, 0, TAU);
      c.fill();
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.6 + i / 4 + P.ph) % 1;
      const x = Math.sin(i * 2.4 + t) * 0.5,
        y = -0.8 - ph * 0.9;
      const r = 0.25 * (1 - ph * 0.5);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(e.def.eye, 0.35 * (1 - ph)));
      g.addColorStop(1, rgba(e.def.eye, 0));
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  for (const [x, y, r] of SPORE_EYES) eye(c, mode, x * p, y * p, r, e.def.eye, 0, 1);
}

// ------------------------------------------------------------------ mossweaver: hunched healer

function mossweaver(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  const sway = Math.sin(t * 2.2 + P.ph);
  const f = P.flip;
  const px = f * 0.72 + sway * 0.04,
    py = -0.95;
  if (mode === 'body') {
    const base = e.def.color;
    // gnarled staff
    c.strokeStyle = '#5a4128';
    c.lineWidth = 0.1;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(f * 0.55, 1.0);
    c.quadraticCurveTo(f * 0.8, 0.1, f * 0.62, -0.6);
    c.quadraticCurveTo(f * 0.55, -0.85, px, py + 0.12);
    c.stroke();
    // hunched mossy cloak
    const p = new Path2D();
    p.moveTo(-0.75, 0.9);
    p.quadraticCurveTo(-0.95, -0.1, -0.35, -0.55);
    p.quadraticCurveTo(f * 0.25, -0.95, f * 0.55, -0.35);
    p.quadraticCurveTo(0.85, 0.3, 0.72, 0.9);
    p.quadraticCurveTo(0, 1.02 + Math.sin(t * 3 + P.ph) * 0.05, -0.75, 0.9);
    p.closePath();
    fillBody(c, p, e, t, base);
    // hanging moss strands
    c.strokeStyle = mix(base, '#a9d27a', 0.5);
    c.lineWidth = 0.05;
    for (let i = 0; i < 6; i++) {
      const x = -0.6 + i * 0.24;
      const wv = Math.sin(t * 3 + i + P.ph) * 0.04;
      c.beginPath();
      c.moveTo(x, -0.1 + Math.abs(x) * 0.3);
      c.quadraticCurveTo(x + wv, 0.4, x - wv, 0.75 + (i % 2) * 0.1);
      c.stroke();
    }
    // hood opening
    c.fillStyle = '#0d150f';
    c.beginPath();
    c.ellipse(f * 0.2, -0.38, 0.22, 0.2, 0, 0, TAU);
    c.fill();
    // little flowers in the moss
    c.fillStyle = '#e6c8f0';
    for (const [x, y] of [
      [-0.45, 0.2],
      [0.3, 0.45],
      [-0.1, 0.65],
    ] as const) {
      c.beginPath();
      c.arc(x, y, 0.05, 0, TAU);
      c.fill();
    }
    // glowing seed pod
    c.fillStyle = mix(e.def.eye, '#ffffff', 0.35);
    c.strokeStyle = '#2e4a2a';
    c.lineWidth = 0.04;
    c.beginPath();
    c.ellipse(px, py, 0.14, 0.18, 0, 0, TAU);
    c.fill();
    c.stroke();
  } else {
    const R = 1.3 + 0.15 * Math.sin(t * 5 + P.ph);
    const g = c.createRadialGradient(px, py, 0, px, py, R);
    g.addColorStop(0, rgba(e.def.eye, 0.75));
    g.addColorStop(0.3, rgba(e.def.eye, 0.22));
    g.addColorStop(1, rgba(e.def.eye, 0));
    c.fillStyle = g;
    c.fillRect(px - R, py - R, R * 2, R * 2);
  }
  eye(c, mode, f * 0.2 - 0.08, -0.38, 0.05, e.def.eye);
  eye(c, mode, f * 0.2 + 0.08, -0.38, 0.05, e.def.eye);
}

// ------------------------------------------------------------------ husk: bark-armoured beetle, top-down

function husk(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  c.rotate(e.facing);
  if (mode === 'body') {
    const base = e.def.color;
    c.strokeStyle = shade(base, -0.5);
    c.lineWidth = 0.12;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++)
      for (const s of [-1, 1]) {
        const sw = Math.sin(t * 11 + P.ph + i * 2 + (s > 0 ? Math.PI : 0)) * 0.15;
        const x = -0.45 + i * 0.42;
        c.beginPath();
        c.moveTo(x, s * 0.5);
        c.lineTo(x + sw + 0.05, s * 0.8);
        c.lineTo(x + sw - 0.05, s * 1.0);
        c.stroke();
      }
    const head = new Path2D();
    head.ellipse(0.82, 0, 0.26, 0.3, 0, 0, TAU);
    fillBody(c, head, e, t, shade(base, -0.3));
    // mandibles
    c.strokeStyle = '#2a2216';
    c.lineWidth = 0.08;
    c.beginPath();
    c.moveTo(1.0, -0.13);
    c.quadraticCurveTo(1.3, -0.2, 1.24, 0.03);
    c.moveTo(1.0, 0.13);
    c.quadraticCurveTo(1.3, 0.2, 1.24, -0.03);
    c.stroke();
    // rough bark shell: jagged outline
    const shell = new Path2D();
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const j = i % 2 ? 0.94 : 1;
      const x = -0.1 + Math.cos(a) * 0.95 * j,
        y = Math.sin(a) * 0.8 * j;
      i ? shell.lineTo(x, y) : shell.moveTo(x, y);
    }
    shell.closePath();
    const bark = mix(base, '#7a6440', 0.35);
    fillBody(c, shell, e, t, bark, 0.08);
    // bark furrows
    c.strokeStyle = 'rgba(25,18,8,0.75)';
    c.lineWidth = 0.045;
    c.beginPath();
    c.moveTo(-1.02, 0);
    c.lineTo(0.82, 0);
    for (const y of [-0.45, -0.22, 0.22, 0.45]) {
      c.moveTo(-0.85, y);
      c.bezierCurveTo(-0.45, y + 0.06, -0.1, y - 0.06, 0.55, y * 0.85);
    }
    c.stroke();
    // lichen
    c.fillStyle = 'rgba(190,210,140,0.75)';
    for (const [x, y, r] of [
      [-0.55, -0.35, 0.07],
      [0.15, 0.4, 0.06],
      [-0.25, 0.55, 0.05],
      [0.35, -0.5, 0.05],
    ] as const) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
    c.fillStyle = 'rgba(255,240,200,0.14)';
    c.beginPath();
    c.ellipse(-0.25, -0.35, 0.45, 0.13, -0.1, 0, TAU);
    c.fill();
  }
  eye(c, mode, 0.95, -0.13, 0.065, e.def.eye);
  eye(c, mode, 0.95, 0.13, 0.065, e.def.eye);
}

// ------------------------------------------------------------------ behemoth: bramble giant (boss)

const BEHEMOTH_EYES: [number, number, number][] = [
  [-0.14, -0.62, 0.09],
  [0.14, -0.62, 0.09],
  [0, -0.75, 0.06],
  [-0.3, -0.5, 0.05],
  [0.3, -0.5, 0.05],
];

function behemoth(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  const stomp = -Math.abs(Math.sin(t * 3 + P.ph)) * 0.08;
  const sa = Math.sin(t * 3 + P.ph) * 0.14;
  c.translate(0, stomp);
  if (mode === 'body') {
    const base = e.def.color;
    // vine-bundle legs
    const legs = new Path2D();
    legs.rect(-0.55, 0.5, 0.36, 0.5 + sa);
    legs.rect(0.19, 0.5, 0.36, 0.5 - sa);
    fillBody(c, legs, e, t, shade(base, -0.2), 0.06);
    // thorns around the silhouette (behind the body)
    c.fillStyle = '#2c3a18';
    c.strokeStyle = 'rgba(10,14,4,0.9)';
    c.lineWidth = 0.025;
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.95 + (i / 13) * 1.1);
      const bx = Math.cos(a) * 0.95,
        by = 0.05 + Math.sin(a) * 0.82;
      const len = 0.22 + (i % 3) * 0.08;
      c.beginPath();
      c.moveTo(bx + Math.cos(a + 1.4) * 0.08, by + Math.sin(a + 1.4) * 0.08);
      c.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len);
      c.lineTo(bx + Math.cos(a - 1.4) * 0.08, by + Math.sin(a - 1.4) * 0.08);
      c.closePath();
      c.fill();
      c.stroke();
    }
    // massive mound
    const p = new Path2D();
    p.moveTo(-1.0, 0.2);
    p.quadraticCurveTo(-1.05, -0.55, -0.4, -0.72);
    p.quadraticCurveTo(0, -0.95, 0.4, -0.72);
    p.quadraticCurveTo(1.05, -0.55, 1.0, 0.2);
    p.quadraticCurveTo(0.9, 0.85, 0, 0.9);
    p.quadraticCurveTo(-0.9, 0.85, -1.0, 0.2);
    p.closePath();
    fillBody(c, p, e, t, base, 0.07);
    // twisted vines
    c.lineCap = 'round';
    for (const [col, w, pts] of [
      ['rgba(85,110,45,0.9)', 0.07, [-0.8, 0.5, -0.3, -0.2, 0.3, 0.4, 0.8, -0.3]],
      ['rgba(40,55,20,0.9)', 0.06, [-0.7, -0.3, -0.2, 0.3, 0.2, -0.4, 0.75, 0.35]],
      ['rgba(110,80,50,0.8)', 0.045, [-0.6, 0.75, -0.1, 0.1, 0.4, 0.75, 0.6, 0.2]],
    ] as const) {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(pts[0], pts[1]);
      c.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
      c.stroke();
    }
    // blight blossoms
    for (const [x, y] of [
      [-0.5, 0.05],
      [0.45, 0.45],
      [0.1, -0.35],
    ] as const) {
      c.fillStyle = '#7a3a7a';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + t * 0.3;
        c.beginPath();
        c.arc(x + Math.cos(a) * 0.07, y + Math.sin(a) * 0.07, 0.06, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#e8d860';
      c.beginPath();
      c.arc(x, y, 0.04, 0, TAU);
      c.fill();
    }
    // crown of thorns on the small head
    c.fillStyle = '#1e2810';
    c.beginPath();
    for (let i = -2; i <= 2; i++) {
      const a = -Math.PI / 2 + i * 0.38;
      const r0 = 0.3,
        r1 = 0.62 + (i === 0 ? 0.15 : 0);
      c.moveTo(Math.cos(a - 0.12) * r0, -0.62 + Math.sin(a - 0.12) * r0);
      c.lineTo(Math.cos(a) * r1, -0.62 + Math.sin(a) * r1);
      c.lineTo(Math.cos(a + 0.12) * r0, -0.62 + Math.sin(a + 0.12) * r0);
    }
    c.fill();
    // club fists
    for (const s of [-1, 1]) {
      const fx = s * 1.08,
        fy = 0.35 + s * sa;
      const f = new Path2D();
      f.arc(fx, fy, 0.34, 0, TAU);
      fillBody(c, f, e, t, shade(base, 0.08), 0.06);
      c.fillStyle = '#2c3a18';
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        c.beginPath();
        c.moveTo(fx + Math.cos(a + 0.4) * 0.3, fy + Math.sin(a + 0.4) * 0.3);
        c.lineTo(fx + Math.cos(a) * 0.5, fy + Math.sin(a) * 0.5);
        c.lineTo(fx + Math.cos(a - 0.4) * 0.3, fy + Math.sin(a - 0.4) * 0.3);
        c.fill();
      }
    }
  } else {
    const R = 0.55;
    const g = c.createRadialGradient(0, 0.15, 0, 0, 0.15, R);
    g.addColorStop(0, rgba(e.def.eye, 0.22 + 0.12 * Math.sin(t * 4)));
    g.addColorStop(1, rgba(e.def.eye, 0));
    c.fillStyle = g;
    c.fillRect(-R, 0.15 - R, R * 2, R * 2);
  }
  for (const [x, y, r] of BEHEMOTH_EYES) eye(c, mode, x + P.flip * 0.04, y, r, e.def.eye, 0, 0.7);
}

// ------------------------------------------------------------------ roc: carrion bird (flying boss), top-down

function roc(c: C, e: Enemy, t: number, P: Pose, mode: Mode) {
  c.rotate(e.facing);
  const f = Math.sin(t * 3.6 + P.ph);
  const span = 1.55 + 0.3 * f;
  const sweep = -0.25 - 0.15 * f;
  if (mode === 'body') {
    const base = e.def.color;
    for (const s of [-1, 1]) {
      // broad wing ending in splayed primary "fingers", like a vulture
      const w = new Path2D();
      const tipX = sweep - 0.05,
        tipY = s * span * 0.82;
      w.moveTo(0.25, s * 0.18);
      w.quadraticCurveTo(0.42, s * span * 0.45, tipX + 0.2, tipY);
      w.lineTo(tipX - 0.3, tipY * 0.98);
      w.quadraticCurveTo(-0.45, s * span * 0.45, -0.25, s * 0.16);
      w.closePath();
      fillBody(c, w, e, t, mix(base, '#6a5a60', 0.2), 0.07);
      for (let k = 0; k < 5; k++) {
        const fx = tipX + 0.18 - k * 0.13,
          fy = tipY + s * (0.05 + (k === 2 ? 0.1 : k === 1 || k === 3 ? 0.06 : 0));
        const fa = Math.atan2(s * (0.9 - k * 0.12), 0.25 - k * 0.22);
        const f = new Path2D();
        f.ellipse(fx + Math.cos(fa) * 0.16, fy + Math.sin(fa) * 0.16, 0.2, 0.06, fa, 0, TAU);
        fillBody(c, f, e, t, shade(base, -0.25), 0.04);
      }
      // pale covert band and sickly mottling
      c.strokeStyle = rgba(mix(base, '#b0a0a8', 0.5), 0.75);
      c.lineWidth = 0.1;
      c.beginPath();
      c.moveTo(0.22, s * 0.3);
      c.quadraticCurveTo(0.25, s * span * 0.5, tipX + 0.1, s * span * 0.72);
      c.stroke();
      c.fillStyle = rgba('#9ab060', 0.45);
      c.beginPath();
      c.ellipse(-0.05, s * span * 0.5, 0.14, 0.07, s * 0.6, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(15,8,15,0.5)';
      c.lineWidth = 0.025;
      c.beginPath();
      for (let k = 1; k < 5; k++) {
        const q = k / 5;
        c.moveTo(0.15 - q * 0.15, s * (0.25 + q * span * 0.55));
        c.lineTo(-0.2 - q * 0.25, s * (0.2 + q * span * 0.5));
      }
      c.stroke();
    }
    // tail fan
    const tail = new Path2D();
    tail.moveTo(-0.45, -0.15);
    for (let i = 0; i <= 4; i++) {
      const y = -0.3 + i * 0.15;
      tail.lineTo(-1.0 - (i % 2) * 0.1, y * 1.3);
    }
    tail.lineTo(-0.45, 0.15);
    tail.closePath();
    fillBody(c, tail, e, t, shade(base, -0.15), 0.06);
    // body
    const b = new Path2D();
    b.ellipse(-0.05, 0, 0.6, 0.3, 0, 0, TAU);
    fillBody(c, b, e, t, base, 0.07);
    // mangy ruff
    c.fillStyle = mix(base, '#c0b0a0', 0.25);
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 + (i / 8 - 0.5) * 2.4;
      c.moveTo(0.32, 0);
      c.lineTo(0.32 + Math.cos(a) * 0.32, Math.sin(a) * 0.3);
    }
    c.lineWidth = 0.06;
    c.strokeStyle = c.fillStyle;
    c.stroke();
    // bald head + hooked beak
    const h = new Path2D();
    h.moveTo(0.55, -0.08);
    h.quadraticCurveTo(0.7, -0.14, 0.82, -0.1);
    h.arc(0.82, 0, 0.13, -Math.PI / 2, Math.PI / 2);
    h.quadraticCurveTo(0.7, 0.14, 0.55, 0.08);
    h.closePath();
    fillBody(c, h, e, t, '#a08484', 0.05);
    c.fillStyle = '#d8c070';
    c.strokeStyle = 'rgba(40,30,10,0.85)';
    c.lineWidth = 0.025;
    c.beginPath();
    c.moveTo(0.92, -0.07);
    c.quadraticCurveTo(1.15, -0.04, 1.12, 0.1);
    c.quadraticCurveTo(1.04, 0.04, 0.92, 0.07);
    c.closePath();
    c.fill();
    c.stroke();
  } else {
    const R = 0.6;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, rgba(e.def.eye, 0.18 + 0.08 * f));
    g.addColorStop(1, rgba(e.def.eye, 0));
    c.fillStyle = g;
    c.fillRect(-R, -R, R * 2, R * 2);
  }
  eye(c, mode, 0.86, -0.07, 0.045, e.def.eye, 0, 1);
  eye(c, mode, 0.86, 0.07, 0.045, e.def.eye, 0, 1);
}

export const DAY_DRAW: Partial<Record<EnemyId, (c: C, e: Enemy, t: number, P: Pose, mode: Mode) => void>> = {
  rotling,
  gnat,
  moth,
  boar,
  sporemother,
  mossweaver,
  husk,
  behemoth,
  roc,
};
