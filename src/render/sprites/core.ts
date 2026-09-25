import { CORE_X, CORE_Y } from '../../game/config';
import type { Game } from '../../game/game';
import { cached, facet, glow, ngon, poly, pxOf, rgba, shade } from './util';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const GOLD = '#ffd27a';

function dais(c: C, L: number) {
  // local coords: origin at core centre
  return cached(`core-dais|${L}`, pxOf(c), -1.7, -1.7, 3.4, 3.6, (g) => {
    const outer = ngon(0, 0, 1.47, 8, Math.PI / 8, 0.92);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    poly(
      g,
      outer.map(([x, y]) => [x + 0.08, y + 0.2]),
    );
    g.fill();
    g.fillStyle = '#191d29';
    poly(
      g,
      outer.map(([x, y]) => [x, y + 0.14]),
    );
    g.fill();
    facet(g, outer, -0.2, -0.25, '#343b50', 0.25, 'rgba(6,8,14,0.9)', 0.03);
    // slab lines on outer tier
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.02;
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i / 8) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 1.02, Math.sin(a) * 1.02 * 0.92);
      g.lineTo(Math.cos(a) * 1.47, Math.sin(a) * 1.47 * 0.92);
      g.stroke();
    }
    // inner tier
    const inner = ngon(0, -0.05, 1.02, 8, Math.PI / 8, 0.92);
    g.fillStyle = '#1e2230';
    poly(
      g,
      inner.map(([x, y]) => [x, y + 0.1]),
    );
    g.fill();
    facet(g, inner, -0.15, -0.3, L >= 2 ? '#454d66' : '#3e455c', 0.28, 'rgba(6,8,14,0.9)', 0.025);
    // gold inlay rings
    g.strokeStyle = rgba(GOLD, L >= 1 ? 0.7 : 0.35);
    g.lineWidth = 0.025;
    g.beginPath();
    g.ellipse(0, -0.05, 0.86, 0.79, 0, 0, TAU);
    g.stroke();
    if (L >= 3) {
      g.strokeStyle = rgba(GOLD, 0.55);
      g.beginPath();
      g.ellipse(0, 0, 1.36, 1.25, 0, 0, TAU);
      g.stroke();
    }
    // corner pillars
    if (L >= 1) {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i / 4) * TAU;
        const px = Math.cos(a) * 1.18,
          py = Math.sin(a) * 1.18 * 0.92;
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.beginPath();
        g.ellipse(px + 0.05, py + 0.08, 0.13, 0.07, 0, 0, TAU);
        g.fill();
        facet(
          g,
          [
            [px - 0.09, py + 0.05],
            [px + 0.09, py + 0.05],
            [px + 0.08, py - 0.3],
            [px, py - 0.36],
            [px - 0.08, py - 0.3],
          ],
          px - 0.02,
          py - 0.15,
          '#5a6278',
          0.4,
          'rgba(6,8,14,0.9)',
          0.015,
        );
        g.fillStyle = L >= 3 ? '#e8c070' : '#8a7a5a';
        g.beginPath();
        g.ellipse(px, py - 0.34, 0.07, 0.03, 0, 0, TAU);
        g.fill();
      }
    }
    // base of the spire
    const socket = ngon(0, -0.08, 0.36, 6, 0, 0.75);
    facet(g, socket, -0.08, -0.14, '#52506a', 0.35, 'rgba(6,8,14,0.9)', 0.02);
  });
}

export function drawCore(ctx: C, game: Game, t: number): void {
  const L = game.coreLevel;
  const cx = CORE_X + 0.5,
    cy = CORE_Y + 0.5;
  const hpk = Math.max(0, Math.min(1, game.coreHp / game.coreMaxHp));
  const gk = 0.5 + 0.5 * hpk;
  const hurt = Math.max(0, Math.min(1, game.coreHurt * 4));
  ctx.save();
  ctx.drawImage(dais(ctx, L), cx - 1.7, cy - 1.7, 3.4, 3.6);

  // pillar flames
  if (L >= 1) {
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * TAU;
      const px = cx + Math.cos(a) * 1.18,
        py = cy + Math.sin(a) * 1.18 * 0.92 - 0.4;
      const f = 0.8 + 0.2 * Math.sin(t * 9 + i * 2);
      glow(ctx, px, py, 0.28, GOLD, 0.5 * gk);
      ctx.fillStyle = rgba('#fff1c0', 0.9);
      ctx.beginPath();
      ctx.ellipse(px, py, 0.035, 0.07 * f, 0, 0, TAU);
      ctx.fill();
    }
  }

  // rune rings
  const ring = (r: number, n: number, rot: number, alpha: number, col: string) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const x = cx + Math.cos(a) * r,
        y = cy - 0.05 + Math.sin(a) * r * 0.92;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);
      ctx.strokeStyle = rgba(col, alpha * (0.6 + 0.4 * Math.sin(t * 2 + i)));
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      const s = 0.06;
      switch (i % 4) {
        case 0:
          ctx.moveTo(-s, s);
          ctx.lineTo(0, -s);
          ctx.lineTo(s, s);
          break;
        case 1:
          ctx.moveTo(0, -s);
          ctx.lineTo(0, s);
          ctx.moveTo(-s, 0);
          ctx.lineTo(s * 0.6, -s * 0.6);
          break;
        case 2:
          ctx.arc(0, 0, s * 0.7, 0, Math.PI * 1.5);
          break;
        default:
          ctx.moveTo(-s, -s);
          ctx.lineTo(s, -s);
          ctx.lineTo(-s, s);
          ctx.lineTo(s, s);
      }
      ctx.stroke();
      ctx.restore();
    }
  };
  ring(0.72, 12, t * 0.25, 0.85 * gk, GOLD);
  if (L >= 2) ring(1.25, 16, -t * 0.15, 0.6 * gk, '#fff1c0');

  // heart glow
  const pulse = 1 + 0.08 * Math.sin(t * 2.2);
  glow(ctx, cx, cy - 0.35, 1.25 * pulse, GOLD, 0.35 * gk);

  // satellites behind
  const sats: [number, number, number][] = [];
  if (L >= 3) {
    const n = L === 4 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const a = t * 0.6 + (i / n) * TAU;
      sats.push([cx + Math.cos(a) * 0.75, cy - 0.85 + Math.sin(a) * 0.28, Math.sin(a)]);
    }
  }
  const satDraw = (x: number, y: number) => {
    glow(ctx, x, y, 0.18, GOLD, 0.5 * gk);
    ctx.fillStyle = '#fff1b8';
    poly(ctx, [
      [x, y - 0.12],
      [x + 0.05, y],
      [x, y + 0.08],
      [x - 0.05, y],
    ]);
    ctx.fill();
    ctx.fillStyle = '#c8963a';
    poly(ctx, [
      [x, y - 0.12],
      [x + 0.05, y],
      [x, y + 0.08],
    ]);
    ctx.fill();
  };
  for (const [x, y, d] of sats) if (d < 0) satDraw(x, y);

  // side shards
  const side = L >= 2 ? 4 : L >= 1 ? 2 : 0;
  for (let i = 0; i < side; i++) {
    const s = i % 2 ? 1 : -1;
    const k = i < 2 ? 1 : 0.7;
    const bx = cx + s * (i < 2 ? 0.2 : 0.3),
      by = cy - 0.1;
    spire(ctx, bx, by, bx + s * 0.18 * k, by - 0.75 * k, 0.1 * k, gk, hurt);
  }
  // main spire
  const tipY = cy - 1.55 - L * 0.1;
  spire(ctx, cx, cy - 0.05, cx, tipY, 0.2 + L * 0.02, gk, hurt);

  // inner heart
  const hy = cy - 0.55;
  glow(ctx, cx, hy, 0.4 * pulse, '#ffffff', 0.55 * gk);

  for (const [x, y, d] of sats) if (d >= 0) satDraw(x, y);

  // crown / halo at L4
  if (L >= 4) {
    ctx.strokeStyle = rgba('#fff1c0', 0.75 * gk);
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.ellipse(cx, tipY - 0.05, 0.38, 0.12, 0, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, tipY + 0.3);
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i - 4.5) * 0.22;
      const len = 0.5 + 0.12 * Math.sin(t * 2 + i);
      ctx.strokeStyle = rgba(GOLD, 0.35 * gk);
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.45, Math.sin(a) * 0.45);
      ctx.lineTo(Math.cos(a) * (0.45 + len), Math.sin(a) * (0.45 + len));
      ctx.stroke();
    }
    ctx.restore();
  }

  // emitter gem pointing at the current target
  const a = game.coreAngle;
  const ex = cx + Math.cos(a) * 0.5,
    ey = cy - 0.55 + Math.sin(a) * 0.3;
  glow(ctx, ex, ey, 0.2, '#fff0b0', 0.6 * gk);
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  ctx.arc(ex, ey, 0.04, 0, TAU);
  ctx.fill();

  if (hurt > 0) glow(ctx, cx, cy - 0.6, 1.3, '#ff2a2a', 0.4 * hurt);
  ctx.restore();
}

function spire(ctx: C, bx: number, by: number, tx: number, ty: number, w: number, gk: number, hurt: number) {
  const dx = tx - bx,
    dy = ty - by;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len,
    ny = dx / len;
  const P = (along: number, side: number): [number, number] => [bx + dx * along + nx * side * w, by + dy * along + ny * side * w];
  const left: [number, number][] = [P(0, 0), P(0.02, -1), P(0.78, -0.75), P(1, 0)];
  const mid: [number, number][] = [P(0, 0), P(0.02, -1), P(0.78, -0.75), P(1, 0), P(0.78, 0.2), P(0.05, 0.25)];
  const right: [number, number][] = [P(0, 0), P(0.05, 0.25), P(0.78, 0.2), P(1, 0), P(0.78, 0.75), P(0.02, 1)];
  const base = hurt > 0 ? '#ff9a7a' : '#ffd27a';
  ctx.fillStyle = shade(base, -0.05 - (1 - gk) * 0.4);
  poly(ctx, mid);
  ctx.fill();
  ctx.fillStyle = shade(base, 0.55 - (1 - gk) * 0.4);
  poly(ctx, left);
  ctx.fill();
  ctx.fillStyle = shade('#c8963a', -(1 - gk) * 0.4);
  poly(ctx, right);
  ctx.fill();
  ctx.strokeStyle = rgba('#fff8e0', 0.7 * gk);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.moveTo(...P(0.05, 0.25));
  ctx.lineTo(...P(0.78, 0.2));
  ctx.lineTo(...P(1, 0));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60,34,6,0.85)';
  ctx.lineWidth = 0.02;
  poly(ctx, [P(0, 0), P(0.02, -1), P(0.78, -0.75), P(1, 0), P(0.78, 0.75), P(0.02, 1)]);
  ctx.stroke();
  if (hurt > 0) {
    ctx.fillStyle = rgba('#ff2020', 0.45 * hurt);
    poly(ctx, [P(0, 0), P(0.02, -1), P(0.78, -0.75), P(1, 0), P(0.78, 0.75), P(0.02, 1)]);
    ctx.fill();
  }
}
