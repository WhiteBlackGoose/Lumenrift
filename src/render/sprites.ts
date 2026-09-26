// Procedural art for LUMENRIFT. All drawing is Canvas2D; world functions expect a ctx scaled to 1 unit = 1 tile.
import { BUILDINGS, BuildingId, CORE_X, CORE_Y, ENEMIES, EnemyId } from '../game/config';
import type { Game } from '../game/game';
import { drawBuildingIcon } from './sprites/buildings';
import { drawCore } from './sprites/core';
import { drawEnemyIcon } from './sprites/enemies';
import { glow, rgba } from './sprites/util';

export { renderGround } from './sprites/ground';
export { drawBuilding, drawGhost } from './sprites/buildings';
export { drawCore } from './sprites/core';
export { drawEnemy, drawEnemyGlow, FLY_HEIGHT } from './sprites/enemies';

const TAU = Math.PI * 2;

/** Swirling violet tear in the ground at rift tile (x,y). */
export function drawRift(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, state: 'open' | 'forming'): void {
  const cx = x + 0.5,
    cy = y + 0.5;
  const open = state === 'open';
  const k = open ? 1 : 0.55 + 0.1 * Math.sin(t * 2);
  const flick = open ? 1 : 0.35 + 0.3 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9));
  ctx.save();
  ctx.globalAlpha *= flick;
  // scorched ground
  const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1.25 * k);
  sg.addColorStop(0, 'rgba(12,2,20,0.85)');
  sg.addColorStop(0.6, 'rgba(25,6,35,0.45)');
  sg.addColorStop(1, 'rgba(25,6,35,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(cx - 1.3, cy - 1.3, 2.6, 2.6);
  glow(ctx, cx, cy, 1.0 * k, '#c040e0', 0.3 + 0.08 * Math.sin(t * 3));
  ctx.translate(cx, cy);
  ctx.scale(1, 0.8);
  // spiral arms
  ctx.lineCap = 'round';
  const arms = 5;
  for (let i = 0; i < arms; i++) {
    const a0 = t * 1.7 + (i / arms) * TAU;
    for (const [lw, col, al] of [
      [0.12, '#8a4fff', 0.35],
      [0.04, '#ff4fd8', 0.85],
    ] as const) {
      ctx.strokeStyle = rgba(col, al);
      ctx.lineWidth = lw * k;
      ctx.beginPath();
      for (let s = 0; s <= 14; s++) {
        const r = (0.1 + (s / 14) * 0.55) * k;
        const a = a0 + (s / 14) * 2.4;
        const px = Math.cos(a) * r,
          py = Math.sin(a) * r;
        if (s) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  }
  // the hole
  const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.26 * k);
  hg.addColorStop(0, '#000000');
  hg.addColorStop(0.7, '#0a0014');
  hg.addColorStop(1, 'rgba(120,40,180,0.9)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, 0, 0.24 * k, 0, TAU);
  ctx.fill();
  // sparks being sucked in
  for (let i = 0; i < 6; i++) {
    const p = (t * 0.6 + i / 6) % 1;
    const a = i * 2.1 - p * 3 + t * 0.5;
    const r = (0.75 - p * 0.6) * k;
    ctx.fillStyle = rgba('#ffb0f0', 0.9 * p);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 0.025, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** UI icon: draws the building / enemy / Beacon centred in a size×size box at (0,0). */
export function drawIcon(ctx: CanvasRenderingContext2D, id: BuildingId | EnemyId | 'core', size: number): void {
  if (id === 'core') {
    ctx.save();
    const k = size / 3.6;
    ctx.scale(k, k);
    ctx.translate(1.8 - (CORE_X + 0.5), 2.25 - (CORE_Y + 0.5));
    const fake = { coreLevel: 1, coreHp: 1, coreMaxHp: 1, coreHurt: 0, coreAngle: 0.6 } as unknown as Game;
    drawCore(ctx, fake, 1.5);
    ctx.restore();
    return;
  }
  if (id in BUILDINGS) drawBuildingIcon(ctx, id as BuildingId, size);
  else if (id in ENEMIES) drawEnemyIcon(ctx, id as EnemyId, size);
}
