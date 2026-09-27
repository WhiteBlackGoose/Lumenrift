import { BUILDINGS, BuildingId, CORE_X, CORE_Y, MAP_H, MAP_W, NOVA_RADIUS } from '../game/config';
import { Building, Enemy, Game, GameEvent } from '../game/game';
import { idx, Terrain } from '../game/grid';
import { Camera } from './camera';
import { Particles, PK } from './particles';
import * as S from './sprites';
import { cacheFrame } from './sprites/util';

export interface ViewState {
  placing: BuildingId | null;
  hover: { x: number; y: number } | null;
  ghostOk: boolean;
  selected: Building | null;
  coreSelected: boolean;
  hoverTile: { x: number; y: number } | null;
}

interface Chain {
  pts: { x: number; y: number }[];
  t: number;
}
interface Pillar {
  x: number;
  y: number;
  r: number;
  t: number;
}
interface Light {
  x: number;
  y: number;
  r: number;
  a: number;
  t: number;
  max: number;
}

const ENEMY_DEATH_COLORS: Record<string, string> = {
  shade: '#ff4fd8',
  skitter: '#7cff6b',
  wraith: '#8ad8ff',
  brute: '#ff6a3d',
  brood: '#d8ff4f',
  warden: '#4fffd2',
  carapace: '#ffd24f',
  colossus: '#ff2f5f',
  wyrm: '#6fe8ff',
};

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly cam = new Camera();
  readonly parts = new Particles();
  private dpr = 1;
  private ground: HTMLCanvasElement | null = null;
  private groundFor: Game | null = null;
  private light: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private glowCache = new Map<string, HTMLCanvasElement>();
  private chains: Chain[] = [];
  private pillars: Pillar[] = [];
  private lights: Light[] = [];
  private flashRed = 0;
  private flashWhite = 0;
  private darkness = 0.44;
  private pathVersion = -1;
  private pathGame: Game | null = null;
  private pathRifts = -1;
  private paths: { pts: { x: number; y: number }[]; forming: boolean }[] = [];
  private crystals: { x: number; y: number }[] = [];
  time = 0;
  lowFx = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d')!;
  }

  /** Clear transient effects when a new game starts. */
  reset() {
    this.parts.list.length = 0;
    this.chains = [];
    this.pillars = [];
    this.lights = [];
    this.flashRed = this.flashWhite = 0;
    this.cam.shake = 0;
  }

  resize(w: number, h: number, insetTop: number, insetBottom: number, insetLeft = 0) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.light.width = Math.ceil(w / 2);
    this.light.height = Math.ceil(h / 2);
    this.cam.resize(w, h, insetTop, insetBottom, insetLeft);
    // the ground re-renders only if the new size needs noticeably more resolution (see ensureGround)
  }

  // ------------------------------------------------------------------ assets

  glow(color: string): HTMLCanvasElement {
    let c = this.glowCache.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, color);
      grd.addColorStop(0.35, hexA(color, 0.45));
      grd.addColorStop(1, hexA(color, 0));
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      this.glowCache.set(color, c);
    }
    return c;
  }

  private lightSprite(): HTMLCanvasElement {
    const key = '__light';
    let c = this.glowCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.45, 'rgba(0,0,0,0.75)');
      grd.addColorStop(0.75, 'rgba(0,0,0,0.3)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      this.glowCache.set(key, c);
    }
    return c;
  }

  private ensureGround(game: Game) {
    // The ground is rendered once per game (and on big resizes) at a resolution that looks fine
    // across the zoom range; zooming only rescales it, so pinch-zoom never triggers a re-render.
    const want = this.cam.fullFit * this.dpr * 1.8;
    const px = [32, 40, 48, 56, 64, 72].find((b) => b >= want) ?? 72;
    if (this.ground && this.groundFor === game && this.ground.width >= MAP_W * px * 0.8) return;
    this.ground = S.renderGround(game.map, px);
    this.groundFor = game;
    this.crystals = [];
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) if (game.map.terrain[idx(x, y)] === Terrain.Crystal) this.crystals.push({ x: x + 0.5, y: y + 0.5 });
  }

  // ------------------------------------------------------------------ events

  onEvent(ev: GameEvent, game: Game) {
    const P = this.parts;
    switch (ev.type) {
      case 'hit':
        P.burst(ev.x, ev.y, 3, { kind: PK.Spark, color: ev.color, speed: 3, life: 0.25, size: 0.06 });
        break;
      case 'explode': {
        const big = ev.r > 1.2;
        P.add({ kind: PK.Ring, x: ev.x, y: ev.y, size: 0.2, grow: ev.r * 4, life: 0.3, color: ev.color });
        P.burst(ev.x, ev.y, big ? 18 : 10, { kind: PK.Spark, color: ev.color, speed: 5 * ev.r, life: 0.4, size: 0.08 });
        P.burst(ev.x, ev.y, big ? 8 : 4, { kind: PK.Glow, color: ev.color, speed: 1.2, life: 0.45, size: ev.r * 0.6 });
        if (!this.lowFx) P.burst(ev.x, ev.y, 5, { kind: PK.Smoke, color: '#1a1420', speed: 0.8, life: 1.1, size: 0.3, grow: 0.5 });
        this.addLight(ev.x, ev.y, ev.r * 2.2, 0.8, 0.3);
        if (big) this.cam.addShake(0.25);
        break;
      }
      case 'die': {
        const col = ENEMY_DEATH_COLORS[ev.enemy] ?? '#ff4fd8';
        P.burst(ev.x, ev.y, ev.big ? 26 : 10, { kind: PK.Smoke, color: '#120c1c', speed: ev.big ? 2.5 : 1.4, life: 0.9, size: ev.big ? 0.35 : 0.18, grow: 0.3 });
        P.burst(ev.x, ev.y, ev.big ? 24 : 7, { kind: PK.Ember, color: col, speed: ev.big ? 4 : 2, life: 0.7, size: 0.06, grav: -1.5 });
        P.add({ kind: PK.Glow, x: ev.x, y: ev.y, size: ev.big ? 1.4 : 0.5, life: 0.35, color: col });
        if (ev.big) {
          P.add({ kind: PK.Ring, x: ev.x, y: ev.y, size: 0.3, grow: 6, life: 0.6, color: col });
          this.cam.addShake(0.45);
        }
        break;
      }
      case 'bounty':
        if (ev.amount >= 1) P.text(ev.x, ev.y, '+' + ev.amount, '#ffd86b', ev.amount >= 50 ? 0.55 : 0.3);
        break;
      case 'chain':
        this.chains.push({ pts: ev.pts, t: 0.2 });
        for (const p of ev.pts.slice(1)) P.burst(p.x, p.y, 3, { kind: PK.Spark, color: '#c8bfff', speed: 3, life: 0.2, size: 0.05 });
        this.addLight(ev.pts[0].x, ev.pts[0].y, 2.5, 0.7, 0.15);
        break;
      case 'build':
        P.burst(ev.x, ev.y, 14, { kind: PK.Smoke, color: '#3a3448', speed: 1.5, life: 0.6, size: 0.14, grow: 0.3 });
        P.add({ kind: PK.Ring, x: ev.x, y: ev.y, size: 0.2, grow: 2.5, life: 0.35, color: BUILDINGS[ev.id].color });
        break;
      case 'upgrade':
        P.add({ kind: PK.Ring, x: ev.x, y: ev.y, size: 0.2, grow: 3, life: 0.5, color: BUILDINGS[ev.id].color });
        P.burst(ev.x, ev.y, 16, { kind: PK.Ember, color: BUILDINGS[ev.id].color, speed: 1.8, life: 0.9, size: 0.06, grav: -2 });
        break;
      case 'sell':
        P.burst(ev.x, ev.y, 12, { kind: PK.Smoke, color: '#2a2438', speed: 1.4, life: 0.6, size: 0.14, grow: 0.3 });
        P.text(ev.x, ev.y, '+' + ev.amount, '#ffd86b', 0.4);
        break;
      case 'destroyed':
        P.burst(ev.x, ev.y, 20, { kind: PK.Smoke, color: '#221c2e', speed: 2.2, life: 1, size: 0.2, grow: 0.4 });
        P.burst(ev.x, ev.y, 14, { kind: PK.Shard, color: '#8d8aa0', speed: 4, life: 0.6, size: 0.14, grav: 4 });
        this.cam.addShake(0.2);
        break;
      case 'coreHit':
        this.flashRed = Math.min(0.6, this.flashRed + 0.12 + ev.dmg / 300);
        P.burst(ev.x, ev.y, 8, { kind: PK.Spark, color: '#ff5d7a', speed: 3, life: 0.35, size: 0.07 });
        this.cam.addShake(0.12);
        break;
      case 'coreUp':
        P.add({ kind: PK.Ring, x: CORE_X + 0.5, y: CORE_Y + 0.5, size: 0.5, grow: 10, life: 0.9, color: '#ffe39a' });
        P.burst(CORE_X + 0.5, CORE_Y + 0.5, 40, { kind: PK.Ember, color: '#ffe39a', speed: 4, life: 1.4, size: 0.08, grav: -1 });
        this.flashWhite = 0.35;
        break;
      case 'nova': {
        const cx = CORE_X + 0.5,
          cy = CORE_Y + 0.5;
        P.add({ kind: PK.Ring, x: cx, y: cy, size: 1, grow: NOVA_RADIUS * 2.8, life: 0.45, color: '#fff2c0' });
        P.add({ kind: PK.Ring, x: cx, y: cy, size: 0.6, grow: NOVA_RADIUS * 2.2, life: 0.6, color: '#ffc861' });
        P.burst(cx, cy, 60, { kind: PK.Spark, color: '#ffe8a0', speed: 12, life: 0.45, size: 0.1, drag: 3 });
        this.addLight(cx, cy, NOVA_RADIUS * 2.2, 1, 0.6);
        this.flashWhite = 0.5;
        this.cam.addShake(0.5);
        break;
      }
      case 'strike':
        this.pillars.push({ x: ev.x, y: ev.y, r: ev.r, t: 0.55 });
        P.add({ kind: PK.Ring, x: ev.x, y: ev.y, size: 0.3, grow: ev.r * 5, life: 0.5, color: '#fff1a8' });
        P.burst(ev.x, ev.y, 30, { kind: PK.Ember, color: '#ffe38a', speed: 6, life: 0.8, size: 0.08, grav: -1 });
        this.addLight(ev.x, ev.y, ev.r * 3, 1, 0.5);
        this.cam.addShake(0.35);
        break;
      case 'harvest':
        P.text(ev.x, ev.y - 0.3, '+' + ev.amount, '#7fe9ff', 0.36);
        P.burst(ev.x, ev.y, 10, { kind: PK.Shard, color: '#7fe9ff', speed: 2, life: 0.7, size: 0.1, grav: -2 });
        break;
      case 'riftOpen':
        P.add({ kind: PK.Ring, x: ev.x, y: ev.y, size: 0.3, grow: 6, life: 0.8, color: '#ff4fd8' });
        P.burst(ev.x, ev.y, 30, { kind: PK.Smoke, color: '#2a0f33', speed: 2.5, life: 1.3, size: 0.3, grow: 0.4 });
        this.cam.addShake(0.3);
        break;
      case 'spawn':
        if (!this.lowFx) P.burst(ev.x, ev.y, 4, { kind: PK.Smoke, color: '#1c0f26', speed: 0.8, life: 0.6, size: 0.18, grow: 0.3 });
        break;
      case 'bossSpawn':
        P.burst(ev.x, ev.y, 40, { kind: PK.Smoke, color: '#1a0a22', speed: 3, life: 1.6, size: 0.4, grow: 0.5 });
        P.add({ kind: PK.Ring, x: ev.x, y: ev.y, size: 0.5, grow: 8, life: 1, color: '#ff2f5f' });
        this.cam.addShake(0.6);
        break;
      case 'heal':
        P.add({ kind: PK.Ring, x: ev.x, y: ev.y, size: 0.3, grow: 3.2, life: 0.55, color: '#4fffd2' });
        break;
      case 'thorns':
        P.burst(ev.x, ev.y, 4, { kind: PK.Spark, color: '#e8f07a', speed: 2.5, life: 0.2, size: 0.05 });
        break;
      case 'frost':
        P.add({ kind: PK.Ring, x: ev.x, y: ev.y, size: 0.3, grow: ev.r * 1.6, life: 0.9, color: '#8fe8ff' });
        if (!this.lowFx) P.burst(ev.x, ev.y, 5, { kind: PK.Shard, color: '#c9f6ff', speed: ev.r * 1.2, life: 0.8, size: 0.07 });
        break;
      case 'shoot':
        this.onShoot(ev, game);
        break;
      case 'waveStart':
      case 'waveClear':
      case 'error':
      case 'defeat':
      case 'victory':
      case 'strikeWarn':
        break;
    }
  }

  private onShoot(ev: Extract<GameEvent, { type: 'shoot' }>, _game: Game) {
    const P = this.parts;
    const a = Math.atan2(ev.ty - ev.y, ev.tx - ev.x);
    switch (ev.kind) {
      case 'arbalest':
        P.burst(ev.x + Math.cos(a) * 0.35, ev.y + Math.sin(a) * 0.35, 2, { kind: PK.Spark, color: '#ffd28a', speed: 2.5, life: 0.12, size: 0.04, dir: a, spread: 0.6 });
        break;
      case 'mortar':
        P.burst(ev.x + Math.cos(a) * 0.3, ev.y + Math.sin(a) * 0.3 - 0.1, 6, { kind: PK.Smoke, color: '#3a2a28', speed: 1.2, life: 0.7, size: 0.14, grow: 0.3 });
        P.add({ kind: PK.Glow, x: ev.x + Math.cos(a) * 0.3, y: ev.y + Math.sin(a) * 0.3, size: 0.5, life: 0.15, color: '#ff9a4a' });
        this.addLight(ev.x, ev.y, 2, 0.6, 0.15);
        break;
      case 'skyhunter':
        P.burst(ev.x, ev.y, 4, { kind: PK.Smoke, color: '#2d3a36', speed: 1, life: 0.6, size: 0.12, grow: 0.2 });
        break;
      case 'core':
        P.add({ kind: PK.Glow, x: CORE_X + 0.5, y: CORE_Y - 0.1, size: 0.45, life: 0.15, color: '#fff0b0' });
        break;
    }
  }

  private addLight(x: number, y: number, r: number, a: number, t: number) {
    if (this.lights.length > 60) this.lights.shift();
    this.lights.push({ x, y, r, a, t, max: t });
  }

  // ------------------------------------------------------------------ per-frame effect emission

  update(game: Game, dt: number) {
    this.time += dt;
    this.cam.update(dt);
    this.parts.update(dt);
    const P = this.parts;
    for (const c of this.chains) c.t -= dt;
    this.chains = this.chains.filter((c) => c.t > 0);
    for (const p of this.pillars) p.t -= dt;
    this.pillars = this.pillars.filter((p) => p.t > 0);
    for (const l of this.lights) l.t -= dt;
    this.lights = this.lights.filter((l) => l.t > 0);
    this.flashRed = Math.max(0, this.flashRed - dt * 1.5);
    this.flashWhite = Math.max(0, this.flashWhite - dt * 1.5);
    const targetDark = game.phase === 'wave' ? 0.6 : 0.44;
    this.darkness += (targetDark - this.darkness) * Math.min(1, dt * 0.8);
    if (dt <= 0) return;

    for (const b of game.buildings) {
      if (b.firing <= 0) continue;
      const bx = b.x + 0.5,
        by = b.y + 0.5;
      if (b.def.id === 'pyre') {
        const L = b.def.levels[b.level];
        for (let k = 0; k < (this.lowFx ? 1 : 3); k++) {
          const a = b.angle + (Math.random() - 0.5) * 0.8;
          const sp = L.range! * (2.2 + Math.random() * 1.4);
          P.add({
            kind: PK.Glow,
            x: bx + Math.cos(b.angle) * 0.35,
            y: by + Math.sin(b.angle) * 0.35 - 0.1,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 0.38,
            max: 0.38,
            size: 0.18,
            grow: 1.1,
            color: Math.random() < 0.5 ? '#ff7a2a' : '#ffb347',
            drag: 3,
          });
        }
      } else if (b.def.id === 'mender' && Math.random() < dt * 6) {
        P.add({ kind: PK.Ember, x: bx + (Math.random() - 0.5) * 0.6, y: by, vy: -0.9, life: 0.9, max: 0.9, size: 0.06, color: '#7dff9a' });
      }
    }
    for (const e of game.enemies) {
      if (e.burnT > 0 && Math.random() < dt * 10) {
        P.add({ kind: PK.Ember, x: e.x + (Math.random() - 0.5) * e.def.radius, y: e.y - (e.def.flying ? S.FLY_HEIGHT : 0), vy: -1.4, life: 0.5, max: 0.5, size: 0.05, color: '#ff8a3a' });
      }
      if (!this.lowFx && (e.def.id === 'shade' || e.def.id === 'wraith' || e.def.boss) && Math.random() < dt * (e.def.boss ? 14 : 3)) {
        P.add({
          kind: PK.Smoke,
          x: e.x + (Math.random() - 0.5) * e.def.radius,
          y: e.y + e.def.radius * 0.5 - (e.def.flying ? S.FLY_HEIGHT : 0),
          vy: -0.2,
          life: 0.8,
          max: 0.8,
          size: e.def.radius * 0.5,
          grow: 0.2,
          color: '#140c20',
        });
      }
    }
    for (const p of game.projectiles) {
      if (p.t < 0) continue;
      if (p.kind === 'missile' && Math.random() < dt * 40) {
        P.add({ kind: PK.Smoke, x: p.x, y: p.y, life: 0.5, max: 0.5, size: 0.07, grow: 0.25, color: '#2d3a36' });
        P.add({ kind: PK.Glow, x: p.x, y: p.y, life: 0.15, max: 0.15, size: 0.15, color: '#7dffcf' });
      } else if (p.kind === 'shell' && Math.random() < dt * 30) {
        const k = Math.min(1, p.t / p.flight);
        P.add({ kind: PK.Ember, x: p.x, y: p.y - Math.sin(Math.PI * k) * 1.3, life: 0.3, max: 0.3, size: 0.05, color: '#ff9a4a' });
      }
    }
  }

  // ------------------------------------------------------------------ draw

  draw(game: Game, view: ViewState) {
    const ctx = this.ctx;
    const cam = this.cam;
    const dpr = this.dpr;
    const t = this.time;
    this.ensureGround(game);
    cacheFrame(performance.now() - cam.lastZoom < 250);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#04050b';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const s = cam.scale * dpr;
    const ox = cam.toScreenX(0) * dpr,
      oy = cam.toScreenY(0) * dpr;
    const world = () => ctx.setTransform(s, 0, 0, s, ox, oy);
    world();

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.ground!, 0, 0, MAP_W, MAP_H);

    // rifts
    for (const r of game.activeRifts()) S.drawRift(ctx, r.x, r.y, t, 'open');
    if (game.phase === 'build') for (const r of game.formingRifts()) S.drawRift(ctx, r.x, r.y, t, 'forming');

    this.drawPaths(game, view);
    if (view.placing) this.drawGrid(game, view);

    // traps first (flat)
    for (const b of game.buildings) if (b.def.kind === 'trap') S.drawBuilding(ctx, b, t, game);

    // range under selection
    if (view.selected) this.drawRange(view.selected.def.id, view.selected.x, view.selected.y, view.selected.level, true);
    if (view.coreSelected) {
      this.circle(CORE_X + 0.5, CORE_Y + 0.5, game.core.range, 'rgba(255,220,140,0.08)', 'rgba(255,220,140,0.45)');
      this.circle(CORE_X + 0.5, CORE_Y + 0.5, NOVA_RADIUS, null, 'rgba(255,240,190,0.25)', [0.2, 0.2]);
    }

    // buildings, the Beacon and ground enemies interleaved by y so tall sprites overlap correctly
    const air: Enemy[] = [];
    const items: { y: number; draw: () => void }[] = [];
    for (const b of game.buildings) if (b.def.kind !== 'trap') items.push({ y: b.y + 0.5, draw: () => S.drawBuilding(ctx, b, t, game) });
    items.push({ y: CORE_Y + 0.5, draw: () => S.drawCore(ctx, game, t) });
    for (const e of game.enemies) {
      if (e.def.flying) air.push(e);
      else items.push({ y: e.y, draw: () => S.drawEnemy(ctx, e, t) });
    }
    items.sort((a, b) => a.y - b.y);
    this.parts.drawUnder(ctx);
    for (const it of items) it.draw();
    air.sort((a, b) => a.y - b.y);

    this.drawProjectilesBody(game);
    for (const e of air) S.drawEnemy(ctx, e, t);

    // ------------------------------------------------ lighting
    this.drawLighting(game);

    // ------------------------------------------------ additive glow pass
    world();
    ctx.globalCompositeOperation = 'lighter';
    this.drawColorGlows(game);
    for (const e of game.enemies) S.drawEnemyGlow(ctx, e, t);
    this.drawBeams(game);
    this.drawChains();
    this.drawProjectilesGlow(game);
    this.drawStrikes(game);
    this.parts.drawOver(ctx, (c) => this.glow(c));
    ctx.globalCompositeOperation = 'source-over';

    // ------------------------------------------------ overlays
    this.drawBars(game);
    if (view.selected) this.selectRing(view.selected.x, view.selected.y);
    if (view.placing && view.hover) {
      const { x, y } = view.hover;
      this.drawRange(view.placing, x, y, 0, false);
      S.drawGhost(ctx, view.placing, x, y, t, view.ghostOk);
    } else if (view.hoverTile && !view.selected) {
      const b = game.buildingAtTile(view.hoverTile.x, view.hoverTile.y);
      if (b) this.drawRange(b.def.id, b.x, b.y, b.level, false, 0.5);
    }

    // texts & screen flashes in screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.parts.drawText(
      ctx,
      (x) => cam.toScreenX(x),
      (y) => cam.toScreenY(y),
      cam.scale,
    );
    this.drawFlashes(game);
  }

  private drawLighting(game: Game) {
    const l = this.lctx;
    const cam = this.cam;
    const W = this.light.width,
      H = this.light.height;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.globalAlpha = 1;
    l.clearRect(0, 0, W, H);
    l.fillStyle = `rgba(3,4,16,${this.darkness.toFixed(3)})`;
    l.fillRect(0, 0, W, H);
    l.globalCompositeOperation = 'destination-out';
    const spr = this.lightSprite();
    const k = 0.5;
    const put = (x: number, y: number, r: number, a: number) => {
      const sx = cam.toScreenX(x) * k,
        sy = cam.toScreenY(y) * k,
        sr = r * cam.scale * k;
      if (sx + sr < 0 || sy + sr < 0 || sx - sr > W || sy - sr > H) return;
      l.globalAlpha = Math.min(1, a);
      l.drawImage(spr, sx - sr, sy - sr, sr * 2, sr * 2);
    };
    const t = this.time;
    const flick = 1 + Math.sin(t * 7.3) * 0.015 + Math.sin(t * 13.1) * 0.01;
    const hpk = 0.6 + 0.4 * (game.coreHp / game.coreMaxHp);
    put(CORE_X + 0.5, CORE_Y + 0.5, game.core.light * flick * hpk, 1);
    put(CORE_X + 0.5, CORE_Y + 0.5, game.core.light * 0.45, 1);
    for (const b of game.buildings) {
      const L = b.def.levels[b.level].light;
      if (L > 0) put(b.x + 0.5, b.y + 0.5, L * (b.firing > 0 ? 1.12 : 1), 0.9);
    }
    for (const c of this.crystals) put(c.x, c.y, 1.2, 0.45);
    for (const r of game.activeRifts()) put(r.x + 0.5, r.y + 0.5, 2.2, 0.6);
    for (const p of game.projectiles) if (p.t >= 0) put(p.x, p.y, p.kind === 'shell' ? 1.2 : 0.8, 0.5);
    for (const li of this.lights) put(li.x, li.y, li.r, li.a * (li.t / li.max));
    for (const s of game.strikes) put(s.x, s.y, s.splash * 1.5, 0.6);
    // every shadow carries a faint halo of visibility so silhouettes read even far from towers
    for (const e of game.enemies) {
      const fy = e.def.flying ? e.y - S.FLY_HEIGHT : e.y;
      put(e.x, fy, e.def.radius * 3.4 + 0.6, 0.9);
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0, this.canvas.width, this.canvas.height);
  }

  private drawColorGlows(game: Game) {
    const ctx = this.ctx;
    const t = this.time;
    const pulse = 0.8 + Math.sin(t * 2) * 0.1;
    const cr = 2.6 + game.coreLevel * 0.35;
    ctx.globalAlpha = 0.28 * pulse * (game.coreHurt > 0 ? 0.6 : 1);
    ctx.drawImage(this.glow(game.coreHurt > 0 ? '#ff5d5d' : '#ffc861'), CORE_X + 0.5 - cr, CORE_Y + 0.5 - cr, cr * 2, cr * 2);
    for (const b of game.buildings) {
      const L = b.def.levels[b.level].light;
      if (L <= 0 || b.def.kind === 'wall') continue;
      const r = L * 0.55;
      ctx.globalAlpha = (b.firing > 0 ? 0.3 : 0.16) + b.level * 0.03;
      ctx.drawImage(this.glow(b.def.color), b.x + 0.5 - r, b.y + 0.5 - r, r * 2, r * 2);
    }
    for (const r of game.activeRifts()) {
      ctx.globalAlpha = 0.35 + Math.sin(t * 3 + r.x) * 0.08;
      ctx.drawImage(this.glow('#d23cff'), r.x + 0.5 - 1.6, r.y + 0.5 - 1.6, 3.2, 3.2);
    }
    ctx.globalAlpha = 0.14;
    for (const c of this.crystals) ctx.drawImage(this.glow('#5fd8ff'), c.x - 0.8, c.y - 0.8, 1.6, 1.6);
    ctx.globalAlpha = 1;
  }

  private drawBeams(game: Game) {
    const ctx = this.ctx;
    for (const b of game.buildings) {
      if (b.def.id !== 'prism' || b.firing <= 0 || !b.targetUid) continue;
      const e = game.enemyByUidGet(b.targetUid);
      if (!e || e.dead) continue;
      const sx = b.x + 0.5,
        sy = b.y + 0.5 - 0.45;
      const ex = e.x,
        ey = e.y - (e.def.flying ? S.FLY_HEIGHT : 0);
      const ramp = Math.min(1, b.beamTime / 3);
      const w = 0.06 + ramp * 0.12 + Math.sin(this.time * 40) * 0.01;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35 + ramp * 0.3;
      ctx.strokeStyle = '#ff5fcf';
      ctx.lineWidth = w * 3;
      line(ctx, sx, sy, ex, ey);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = ramp > 0.9 ? '#ffffff' : '#ffc4ef';
      ctx.lineWidth = w;
      line(ctx, sx, sy, ex, ey);
      const g = 0.4 + ramp * 0.5;
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.glow('#ff8adf'), ex - g, ey - g, g * 2, g * 2);
      if (Math.random() < 0.3) this.parts.add({ kind: PK.Spark, x: ex, y: ey, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 0.2, max: 0.2, size: 0.05, color: '#ffc4ef' });
    }
    ctx.globalAlpha = 1;
  }

  private drawChains() {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of this.chains) {
      const k = c.t / 0.2;
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = pass ? k : k * 0.4;
        ctx.strokeStyle = pass ? '#eeeaff' : '#8f7bff';
        ctx.lineWidth = pass ? 0.04 : 0.14;
        ctx.beginPath();
        for (let i = 0; i < c.pts.length - 1; i++) {
          const a = c.pts[i],
            b = c.pts[i + 1];
          if (i === 0) ctx.moveTo(a.x, a.y);
          const segs = 5;
          for (let j = 1; j <= segs; j++) {
            const f = j / segs;
            const jit = j === segs ? 0 : 0.18;
            ctx.lineTo(a.x + (b.x - a.x) * f + (Math.random() - 0.5) * jit, a.y + (b.y - a.y) * f + (Math.random() - 0.5) * jit);
          }
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawProjectilesBody(game: Game) {
    const ctx = this.ctx;
    for (const p of game.projectiles) {
      if (p.t < 0) continue;
      if (p.kind === 'shell') {
        const k = Math.min(1, p.t / p.flight);
        const h = Math.sin(Math.PI * k) * 1.3;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 0.12, 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a1a14';
        ctx.beginPath();
        ctx.arc(p.x, p.y - h, 0.11, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'missile') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(a);
        ctx.fillStyle = '#cfe8df';
        ctx.fillRect(-0.12, -0.035, 0.2, 0.07);
        ctx.fillStyle = '#3aa887';
        ctx.fillRect(-0.14, -0.06, 0.05, 0.12);
        ctx.restore();
      }
    }
  }

  private drawProjectilesGlow(game: Game) {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    for (const p of game.projectiles) {
      if (p.t < 0) continue;
      if (p.kind === 'bolt' || p.kind === 'core') {
        const dx = p.tx - p.x,
          dy = p.ty - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const len = p.kind === 'bolt' ? 0.4 : 0.25;
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.kind === 'bolt' ? 0.05 : 0.08;
        line(ctx, p.x, p.y, p.x - (dx / d) * len, p.y - (dy / d) * len);
        ctx.globalAlpha = 0.6;
        const g = p.kind === 'core' ? 0.35 : 0.22;
        ctx.drawImage(this.glow(p.color), p.x - g, p.y - g, g * 2, g * 2);
      } else if (p.kind === 'shell') {
        const k = Math.min(1, p.t / p.flight);
        const h = Math.sin(Math.PI * k) * 1.3;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(this.glow('#ff8a3a'), p.x - 0.3, p.y - h - 0.3, 0.6, 0.6);
      } else if (p.kind === 'missile') {
        ctx.globalAlpha = 0.8;
        ctx.drawImage(this.glow('#7dffcf'), p.x - 0.25, p.y - 0.25, 0.5, 0.5);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawStrikes(game: Game) {
    const ctx = this.ctx;
    const t = this.time;
    for (const s of game.strikes) {
      const k = 1 - s.t / 0.85; // 0 → 1 as it charges
      ctx.globalAlpha = 0.25 + k * 0.5;
      ctx.strokeStyle = '#fff1a8';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.splash * (1.4 - k * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(t * 2);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(Math.cos(a) * s.splash * 0.5, Math.sin(a) * s.splash * 0.5);
        ctx.lineTo(Math.cos(a) * s.splash * 0.8, Math.sin(a) * s.splash * 0.8);
      }
      ctx.stroke();
      ctx.restore();
      // thin descending beam
      ctx.globalAlpha = k * 0.6;
      ctx.lineWidth = 0.05 + k * 0.1;
      line(ctx, s.x, s.y - 12, s.x, s.y);
    }
    for (const p of this.pillars) {
      const k = p.t / 0.55;
      const w = p.r * 0.9 * k;
      const grd = ctx.createLinearGradient(p.x - w, 0, p.x + w, 0);
      grd.addColorStop(0, 'rgba(255,241,168,0)');
      grd.addColorStop(0.5, `rgba(255,250,220,${0.95 * k})`);
      grd.addColorStop(1, 'rgba(255,241,168,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = grd;
      ctx.fillRect(p.x - w, p.y - 30, w * 2, 30);
      ctx.globalAlpha = k;
      const g = p.r * 1.6;
      ctx.drawImage(this.glow('#fff1a8'), p.x - g, p.y - g, g * 2, g * 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawBars(game: Game) {
    const ctx = this.ctx;
    for (const e of game.enemies) {
      if (e.hp >= e.maxHp || e.def.boss) continue;
      const w = Math.max(0.45, e.def.radius * 2.2);
      const y = e.y - e.def.radius - 0.2 - (e.def.flying ? S.FLY_HEIGHT : 0);
      bar(ctx, e.x - w / 2, y, w, 0.07, e.hp / e.maxHp, e.elite ? '#ff5d7a' : '#ff9ad8');
    }
    for (const e of game.enemies) {
      if (!e.def.boss) continue;
      const w = 1.8;
      const y = e.y - e.def.radius - 0.35 - (e.def.flying ? S.FLY_HEIGHT : 0);
      bar(ctx, e.x - w / 2, y, w, 0.13, e.hp / e.maxHp, '#ff2f5f');
    }
    for (const b of game.buildings) {
      if (b.hp >= b.maxHp || b.def.kind === 'trap') continue;
      bar(ctx, b.x + 0.1, b.y + 0.9, 0.8, 0.07, b.hp / b.maxHp, '#7dff9a');
    }
  }

  private drawPaths(game: Game, view: ViewState) {
    const nR = game.activeRifts().length + game.formingRifts().length;
    if (this.pathVersion !== game.flowVersion || this.pathRifts !== nR || this.pathGame !== game) {
      this.pathGame = game;
      this.pathVersion = game.flowVersion;
      this.pathRifts = nR;
      this.paths = [
        ...game.activeRifts().map((r) => ({ pts: game.tracePath(r.x, r.y), forming: false })),
        ...game.formingRifts().map((r) => ({ pts: game.tracePath(r.x, r.y), forming: true })),
      ];
    }
    const ctx = this.ctx;
    const vis = game.phase === 'build' || view.placing ? 1 : 0.45;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of this.paths) {
      if (p.forming && game.phase !== 'build') continue;
      ctx.setLineDash(p.forming ? [0.08, 0.3] : [0.18, 0.22]);
      ctx.lineDashOffset = -this.time * 0.9;
      ctx.strokeStyle = p.forming ? 'rgba(255,120,220,0.35)' : 'rgba(255,90,210,0.45)';
      ctx.globalAlpha = vis;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      p.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawGrid(game: Game, view: ViewState) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(160,180,255,0.07)';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    for (let x = 0; x <= MAP_W; x++) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, MAP_H);
    }
    for (let y = 0; y <= MAP_H; y++) {
      ctx.moveTo(0, y);
      ctx.lineTo(MAP_W, y);
    }
    ctx.stroke();
    if (view.placing === 'harvester') {
      ctx.strokeStyle = 'rgba(120,230,255,0.8)';
      ctx.lineWidth = 0.05;
      ctx.setLineDash([0.12, 0.1]);
      ctx.lineDashOffset = -this.time;
      for (const c of this.crystals) if (!game.buildingAtTile(c.x - 0.5, c.y - 0.5)) ctx.strokeRect(c.x - 0.45, c.y - 0.45, 0.9, 0.9);
    }
    ctx.restore();
  }

  private drawRange(id: BuildingId, x: number, y: number, level: number, strong: boolean, alpha = 1) {
    const L = BUILDINGS[id].levels[level];
    if (!L.range) return;
    const col = BUILDINGS[id].color;
    this.ctx.globalAlpha = alpha;
    this.circle(x + 0.5, y + 0.5, L.range, hexA(col, strong ? 0.1 : 0.07), hexA(col, strong ? 0.6 : 0.4));
    if (L.minRange) this.circle(x + 0.5, y + 0.5, L.minRange, 'rgba(0,0,0,0.15)', hexA(col, 0.3), [0.1, 0.1]);
    this.ctx.globalAlpha = 1;
  }

  private circle(x: number, y: number, r: number, fill: string | null, stroke: string | null, dash?: number[]) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.04;
      if (dash) ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private selectRing(x: number, y: number) {
    const ctx = this.ctx;
    const p = 0.06 + Math.sin(this.time * 5) * 0.03;
    ctx.strokeStyle = 'rgba(255,236,170,0.9)';
    ctx.lineWidth = 0.05;
    const a = -p,
      b = 1 + p,
      c = 0.25;
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [
      [a, a, 1, 1],
      [b, a, -1, 1],
      [a, b, 1, -1],
      [b, b, -1, -1],
    ]) {
      ctx.moveTo(x + cx + dx * c, y + cy);
      ctx.lineTo(x + cx, y + cy);
      ctx.lineTo(x + cx, y + cy + dy * c);
    }
    ctx.stroke();
  }

  private drawFlashes(game: Game) {
    const ctx = this.ctx;
    const W = this.cam.viewW,
      H = this.cam.viewH;
    const low = game.coreHp / game.coreMaxHp;
    const red = Math.max(this.flashRed, low < 0.3 ? (0.3 - low) * (0.6 + Math.sin(this.time * 4) * 0.4) : 0);
    if (red > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${Math.min(0.5, red)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flashWhite > 0.01) {
      ctx.fillStyle = `rgba(255,240,200,${this.flashWhite * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, color: string) {
  ctx.fillStyle = 'rgba(5,5,12,0.75)';
  ctx.fillRect(x - 0.02, y - 0.02, w + 0.04, h + 0.04);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h);
}

/** '#rrggbb' + alpha → rgba() */
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
