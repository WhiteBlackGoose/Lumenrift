import {
  BUILD_TIME,
  BUILDINGS,
  BuildingDef,
  BuildingId,
  bountyScale,
  CORE_LEVELS,
  CORE_X,
  CORE_Y,
  DIFFICULTY,
  Difficulty,
  EARLY_CALL_BONUS,
  ENEMIES,
  EnemyDef,
  EnemyId,
  FIRST_BUILD_TIME,
  hpScale,
  LevelStats,
  MAP_H,
  MAP_W,
  NOVA_COOLDOWN,
  NOVA_RADIUS,
  SELL_REFUND,
  START_MONEY,
  VICTORY_WAVE,
} from './config';
import { computeFlow, DIRS, generateMap, idx, inBounds, INF, isCoreTile, MapData, Terrain } from './grid';
import type { StringKey } from '../i18n/en';
import { Rng } from './rng';
import { planWave, riftsOpenAt, WavePlan, WaveSpawn } from './waves';

export type TargetMode = 'first' | 'last' | 'strong' | 'close';
export const TARGET_MODES: TargetMode[] = ['first', 'last', 'strong', 'close'];

export interface Building {
  uid: number;
  def: BuildingDef;
  x: number;
  y: number;
  level: number; // 0-based
  hp: number;
  maxHp: number;
  cd: number;
  angle: number;
  targetUid: number;
  invested: number;
  freshSpend: number; // spent during current build phase (fully refundable)
  beamTime: number;
  firing: number; // >0 while firing (render hint)
  recoil: number;
  mode: TargetMode;
  kills: number;
  dealt: number;
  hurt: number; // render hint: recently damaged
}

export interface Enemy {
  uid: number;
  def: EnemyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  slow: number;
  slowT: number;
  slowAmt: number;
  burn: number;
  burnT: number;
  wx: number;
  wy: number;
  hasWp: boolean;
  jx: number;
  jy: number;
  attackCd: number;
  attacking: number; // -1 none, 0 core, >0 building uid
  dist: number;
  dead: boolean;
  age: number;
  hit: number;
  abilityCd: number;
  facing: number;
  bounty: number;
  elite: boolean;
}

export interface Projectile {
  kind: 'bolt' | 'shell' | 'missile' | 'core';
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  targetUid: number;
  speed: number;
  damage: number;
  splash: number;
  pierce: number;
  t: number;
  flight: number;
  air: boolean;
  ground: boolean;
  src: number;
  color: string;
  dead: boolean;
}

export interface Strike {
  x: number;
  y: number;
  targetUid: number;
  t: number;
  damage: number;
  splash: number;
  src: number;
}

export type GameEvent =
  | { type: 'shoot'; kind: BuildingId | 'core'; x: number; y: number; tx: number; ty: number }
  | { type: 'hit'; x: number; y: number; color: string }
  | { type: 'explode'; x: number; y: number; r: number; color: string }
  | { type: 'die'; x: number; y: number; enemy: EnemyId; big: boolean }
  | { type: 'bounty'; x: number; y: number; amount: number }
  | { type: 'chain'; pts: { x: number; y: number }[] }
  | { type: 'build'; x: number; y: number; id: BuildingId }
  | { type: 'upgrade'; x: number; y: number; id: BuildingId; level: number }
  | { type: 'sell'; x: number; y: number; amount: number }
  | { type: 'destroyed'; x: number; y: number; id: BuildingId }
  | { type: 'coreHit'; x: number; y: number; dmg: number }
  | { type: 'coreUp'; level: number }
  | { type: 'nova'; r: number }
  | { type: 'strikeWarn'; x: number; y: number; r: number }
  | { type: 'strike'; x: number; y: number; r: number }
  | { type: 'harvest'; x: number; y: number; amount: number }
  | { type: 'waveStart'; wave: number; plan: WavePlan }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'riftOpen'; x: number; y: number }
  | { type: 'bossSpawn'; x: number; y: number; enemy: EnemyId }
  | { type: 'spawn'; x: number; y: number }
  | { type: 'heal'; x: number; y: number }
  | { type: 'thorns'; x: number; y: number }
  | { type: 'frost'; x: number; y: number; r: number }
  | { type: 'error'; msg: StringKey; vars?: Record<string, string | number> }
  | { type: 'defeat' }
  | { type: 'victory' };

export interface PlaceCheck {
  ok: boolean;
  reason?: StringKey;
  vars?: Record<string, number>;
}

const DT = 1 / 60;

export class Game {
  readonly map: MapData;
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly rng: Rng;

  buildings: Building[] = [];
  buildingAt: Int32Array; // tile -> building uid, 0 = none
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  strikes: Strike[] = [];
  events: GameEvent[] = [];

  flowG = new Float32Array(MAP_W * MAP_H);
  flowB = new Float32Array(MAP_W * MAP_H);
  flowVersion = 0;

  money = START_MONEY;
  coreLevel = 0;
  coreHp = CORE_LEVELS[0].hp;
  coreCd = 0;
  coreAngle = 0;
  coreHurt = 0;
  novaCd = 12;
  wave = 0; // number of the last started wave
  phase: 'build' | 'wave' = 'build';
  buildTimer = FIRST_BUILD_TIME;
  waveTime = 0;
  plan: WavePlan | null = null;
  nextPlan: WavePlan;
  private queue: WaveSpawn[] = [];
  get queued() {
    return this.queue.length;
  }
  time = 0;
  over = false;
  won = false;
  endless = false;
  stats = { kills: 0, earned: 0, built: 0, lost: 0, bossKills: 0, leaked: 0 };

  private uidSeq = 1;
  private byUid = new Map<number, Building>();
  private enemyByUid = new Map<number, Enemy>();

  constructor(seed: number, difficulty: Difficulty) {
    this.seed = seed;
    this.difficulty = difficulty;
    this.rng = new Rng(seed ^ 0xabcdef);
    this.map = generateMap(seed);
    this.buildingAt = new Int32Array(MAP_W * MAP_H);
    this.money = Math.round(START_MONEY * DIFFICULTY[difficulty].money);
    this.recomputeFlow();
    this.nextPlan = planWave(1, difficulty, seed);
  }

  // ---------------------------------------------------------------- queries

  get core() {
    return CORE_LEVELS[this.coreLevel];
  }
  get coreMaxHp() {
    return this.core.hp;
  }
  get riftCount() {
    return riftsOpenAt(Math.max(1, this.phase === 'build' ? this.wave + 1 : this.wave));
  }
  /** Rifts that exist now (including one that will open with the next wave, shown as forming). */
  activeRifts() {
    return this.map.rifts.slice(0, riftsOpenAt(Math.max(1, this.wave)));
  }
  formingRifts() {
    return this.map.rifts.slice(riftsOpenAt(Math.max(1, this.wave)), riftsOpenAt(Math.max(1, this.wave + 1)));
  }
  buildingByUid(uid: number) {
    return this.byUid.get(uid);
  }
  enemyByUidGet(uid: number) {
    return this.enemyByUid.get(uid);
  }
  buildingAtTile(x: number, y: number): Building | undefined {
    if (!inBounds(x, y)) return undefined;
    const u = this.buildingAt[idx(x, y)];
    return u ? this.byUid.get(u) : undefined;
  }
  stats_(b: Building): LevelStats {
    return b.def.levels[b.level];
  }
  isUnlocked(id: BuildingId) {
    return BUILDINGS[id].tier <= this.coreLevel + 1;
  }
  upgradeCost(b: Building): number | null {
    return b.level + 1 < b.def.levels.length ? b.def.levels[b.level + 1].cost : null;
  }
  sellValue(b: Building): number {
    return Math.floor(b.freshSpend + (b.invested - b.freshSpend) * SELL_REFUND);
  }
  coreUpgradeCost(): number | null {
    return this.coreLevel + 1 < CORE_LEVELS.length ? CORE_LEVELS[this.coreLevel + 1].upgradeCost : null;
  }

  // ---------------------------------------------------------------- flow fields

  private groundCost(i: number, extraBlock = -1): number {
    const t = this.map.terrain[i];
    if (t === Terrain.Rock || t === Terrain.Core) return INF;
    if (i === extraBlock) return INF;
    const u = this.buildingAt[i];
    if (u) {
      const b = this.byUid.get(u)!;
      if (b.def.blocks) return INF;
    }
    return 1;
  }

  private breakerCost(i: number): number {
    const t = this.map.terrain[i];
    if (t === Terrain.Rock || t === Terrain.Core) return INF;
    const u = this.buildingAt[i];
    if (u) {
      const b = this.byUid.get(u)!;
      if (b.def.blocks) return 3 + b.hp / 120;
    }
    return 1;
  }

  recomputeFlow() {
    computeFlow((i) => this.groundCost(i), this.flowG);
    computeFlow((i) => this.breakerCost(i), this.flowB);
    this.flowVersion++;
    for (const e of this.enemies) e.hasWp = false;
  }

  // ---------------------------------------------------------------- player actions

  canPlace(id: BuildingId, x: number, y: number): PlaceCheck {
    const def = BUILDINGS[id];
    if (!inBounds(x, y)) return { ok: false, reason: 'err.bounds' };
    if (!this.isUnlocked(id)) return { ok: false, reason: 'err.locked', vars: { n: def.tier } };
    const i = idx(x, y);
    const t = this.map.terrain[i];
    if (t === Terrain.Rock) return { ok: false, reason: 'err.rock' };
    if (t === Terrain.Core) return { ok: false, reason: 'err.core' };
    if (t === Terrain.Rift) return { ok: false, reason: 'err.rift' };
    if (this.buildingAt[i]) return { ok: false, reason: 'err.occupied' };
    if (def.onlyOn === 'crystal' && t !== Terrain.Crystal) return { ok: false, reason: 'err.crystal' };
    if (this.money < def.levels[0].cost) return { ok: false, reason: 'err.money' };
    if (def.blocks) {
      for (const e of this.enemies) {
        if (e.def.flying || e.dead) continue;
        if (Math.abs(e.x - (x + 0.5)) < 0.5 + e.def.radius && Math.abs(e.y - (y + 0.5)) < 0.5 + e.def.radius)
          return { ok: false, reason: 'err.enemy' };
      }
      if (!this.pathStillOpen(i)) return { ok: false, reason: 'err.seal' };
    }
    return { ok: true };
  }

  private scratch = new Float32Array(MAP_W * MAP_H);
  private pathStillOpen(blockIdx: number): boolean {
    const f = computeFlow((i) => this.groundCost(i, blockIdx), this.scratch);
    // every rift, including ones that have not opened yet, must keep a path to the Beacon
    for (const r of this.map.rifts) if (f[idx(r.x, r.y)] >= INF) return false;
    for (const e of this.enemies) {
      if (e.def.flying || e.dead) continue;
      const ti = idx(Math.floor(e.x), Math.floor(e.y));
      if (ti !== blockIdx && f[ti] >= INF && this.flowG[ti] < INF) return false;
    }
    return true;
  }

  place(id: BuildingId, x: number, y: number): Building | null {
    const chk = this.canPlace(id, x, y);
    if (!chk.ok) {
      this.events.push({ type: 'error', msg: chk.reason!, vars: chk.vars });
      return null;
    }
    const def = BUILDINGS[id];
    const L = def.levels[0];
    this.money -= L.cost;
    const b: Building = {
      uid: this.uidSeq++,
      def,
      x,
      y,
      level: 0,
      hp: L.hp,
      maxHp: L.hp,
      cd: 0.3,
      angle: -Math.PI / 2,
      targetUid: 0,
      invested: L.cost,
      freshSpend: this.phase === 'build' ? L.cost : 0,
      beamTime: 0,
      firing: 0,
      recoil: 0,
      mode: id === 'skyhunter' ? 'strong' : 'first',
      kills: 0,
      dealt: 0,
      hurt: 0,
    };
    this.buildings.push(b);
    this.byUid.set(b.uid, b);
    this.buildingAt[idx(x, y)] = b.uid;
    this.stats.built++;
    if (def.blocks) this.recomputeFlow();
    this.events.push({ type: 'build', x: x + 0.5, y: y + 0.5, id });
    return b;
  }

  upgrade(b: Building): boolean {
    const cost = this.upgradeCost(b);
    if (cost === null) return false;
    if (this.money < cost) {
      this.events.push({ type: 'error', msg: 'err.money' });
      return false;
    }
    this.money -= cost;
    b.level++;
    b.invested += cost;
    if (this.phase === 'build') b.freshSpend += cost;
    const L = b.def.levels[b.level];
    const frac = b.hp / b.maxHp;
    b.maxHp = L.hp;
    b.hp = Math.max(b.hp, L.hp * frac, L.hp * 0.5);
    this.events.push({ type: 'upgrade', x: b.x + 0.5, y: b.y + 0.5, id: b.def.id, level: b.level });
    if (b.def.blocks) this.recomputeFlow(); // breaker costs depend on hp
    return true;
  }

  sell(b: Building) {
    const v = this.sellValue(b);
    this.money += v;
    this.removeBuilding(b);
    this.events.push({ type: 'sell', x: b.x + 0.5, y: b.y + 0.5, amount: v });
  }

  private removeBuilding(b: Building) {
    this.buildings = this.buildings.filter((o) => o !== b);
    this.byUid.delete(b.uid);
    this.buildingAt[idx(b.x, b.y)] = 0;
    for (const e of this.enemies) if (e.attacking === b.uid) e.attacking = -1;
    if (b.def.blocks) this.recomputeFlow();
  }

  upgradeCore(): boolean {
    const cost = this.coreUpgradeCost();
    if (cost === null) return false;
    if (this.money < cost) {
      this.events.push({ type: 'error', msg: 'err.money' });
      return false;
    }
    this.money -= cost;
    const oldMax = this.coreMaxHp;
    this.coreLevel++;
    this.coreHp = Math.min(this.coreMaxHp, this.coreHp + (this.coreMaxHp - oldMax) + this.coreMaxHp * 0.25);
    this.events.push({ type: 'coreUp', level: this.coreLevel });
    return true;
  }

  cycleMode(b: Building) {
    b.mode = TARGET_MODES[(TARGET_MODES.indexOf(b.mode) + 1) % TARGET_MODES.length];
  }

  callWaveNow() {
    if (this.phase !== 'build' || this.over) return;
    const bonus = Math.floor(this.buildTimer * EARLY_CALL_BONUS);
    if (bonus > 0) {
      this.money += bonus;
      this.stats.earned += bonus;
      this.events.push({ type: 'bounty', x: CORE_X + 0.5, y: CORE_Y - 1, amount: bonus });
    }
    this.startWave();
  }

  nova(): boolean {
    if (this.novaCd > 0 || this.over) return false;
    this.novaCd = NOVA_COOLDOWN;
    const cx = CORE_X + 0.5,
      cy = CORE_Y + 0.5;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d <= NOVA_RADIUS) {
        this.damageEnemy(e, this.core.nova * (d < 2.5 ? 1 : 0.7), 99, -1);
        e.slowT = 3;
        e.slowAmt = 0.5;
      }
    }
    this.events.push({ type: 'nova', r: NOVA_RADIUS });
    return true;
  }

  // ---------------------------------------------------------------- simulation

  update(dt: number) {
    // fixed timestep
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 12) {
      this.step(DT);
      this.acc -= DT;
      n++;
    }
    if (n >= 12) this.acc = 0;
  }
  private acc = 0;

  step(dt: number) {
    if (this.over) return;
    this.time += dt;
    if (this.novaCd > 0) this.novaCd = Math.max(0, this.novaCd - dt);
    if (this.coreHurt > 0) this.coreHurt -= dt;

    if (this.phase === 'build') {
      this.buildTimer -= dt;
      if (this.buildTimer <= 0) this.startWave();
    } else {
      this.waveTime += dt;
      while (this.queue.length && this.queue[0].t <= this.waveTime) this.spawn(this.queue.shift()!);
    }

    this.updateEnemies(dt);
    this.updateBuildings(dt);
    this.updateCore(dt);
    this.updateProjectiles(dt);
    this.updateStrikes(dt);

    if (this.enemies.some((e) => e.dead)) {
      this.enemies = this.enemies.filter((e) => {
        if (e.dead) this.enemyByUid.delete(e.uid);
        return !e.dead;
      });
    }
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);

    if (this.phase === 'wave' && !this.queue.length && !this.enemies.length) this.endWave();
  }

  private startWave() {
    this.wave++;
    const newRifts = this.map.rifts.slice(riftsOpenAt(this.wave - 1), riftsOpenAt(this.wave));
    if (this.wave > 1) for (const r of newRifts) this.events.push({ type: 'riftOpen', x: r.x + 0.5, y: r.y + 0.5 });
    this.phase = 'wave';
    this.waveTime = 0;
    this.plan = this.nextPlan;
    this.queue = this.plan.spawns.slice();
    for (const b of this.buildings) b.freshSpend = 0;
    this.events.push({ type: 'waveStart', wave: this.wave, plan: this.plan });
  }

  private endWave() {
    this.phase = 'build';
    this.buildTimer = BUILD_TIME;
    let bonus = Math.round((20 + this.wave * 4) * DIFFICULTY[this.difficulty].money);
    for (const b of this.buildings) {
      const inc = this.stats_(b).income;
      if (inc) {
        bonus += inc;
        this.events.push({ type: 'harvest', x: b.x + 0.5, y: b.y + 0.5, amount: inc });
      }
    }
    this.money += bonus;
    this.stats.earned += bonus;
    this.events.push({ type: 'waveClear', wave: this.wave, bonus });
    this.nextPlan = planWave(this.wave + 1, this.difficulty, this.seed);
    if (this.wave >= VICTORY_WAVE && !this.won && !this.endless) {
      this.won = true;
      this.over = true;
      this.events.push({ type: 'victory' });
    }
  }

  continueEndless() {
    this.endless = true;
    this.over = false;
  }

  private spawn(s: WaveSpawn) {
    const def = ENEMIES[s.enemy];
    const r = this.map.rifts[s.rift] ?? this.map.rifts[0];
    const hp = def.hp * hpScale(this.wave) * DIFFICULTY[this.difficulty].hp * s.elite;
    const e = this.makeEnemy(def, r.x + 0.5, r.y + 0.5, hp);
    if (s.elite > 1) {
      e.bounty *= s.elite;
      e.elite = true;
    }
    this.events.push({ type: def.boss ? 'bossSpawn' : 'spawn', x: e.x, y: e.y, ...(def.boss ? { enemy: def.id } : {}) } as GameEvent);
  }

  private makeEnemy(def: EnemyDef, x: number, y: number, hp: number): Enemy {
    const e: Enemy = {
      uid: this.uidSeq++,
      def,
      x: x + this.rng.range(-0.15, 0.15),
      y: y + this.rng.range(-0.15, 0.15),
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      slow: 0,
      slowT: 0,
      slowAmt: 0,
      burn: 0,
      burnT: 0,
      wx: 0,
      wy: 0,
      hasWp: false,
      jx: this.rng.range(-0.17, 0.17),
      jy: this.rng.range(-0.17, 0.17),
      attackCd: 0.5,
      attacking: -1,
      dist: 999,
      dead: false,
      age: 0,
      hit: 0,
      abilityCd: 3,
      facing: 0,
      bounty: def.bounty * bountyScale(this.wave) * DIFFICULTY[this.difficulty].money,
      elite: false,
    };
    this.enemies.push(e);
    this.enemyByUid.set(e.uid, e);
    return e;
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemies(dt: number) {
    const cx = CORE_X + 0.5,
      cy = CORE_Y + 0.5;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.age += dt;
      if (e.hit > 0) e.hit -= dt;
      // status
      if (e.slowT > 0) {
        e.slowT -= dt;
        e.slow = Math.max(e.slow, e.slowAmt);
      }
      if (e.burnT > 0) {
        e.burnT -= dt;
        this.damageEnemy(e, e.burn * dt, 99, -1, true);
        if (e.dead) continue;
      }
      // abilities
      e.abilityCd -= dt;
      if (e.abilityCd <= 0) this.enemyAbility(e);

      const speed = e.def.speed * (1 - Math.min(0.8, e.slow));
      e.slow = 0; // re-applied each frame by auras
      const px = e.x,
        py = e.y;

      if (e.attacking >= 0) {
        this.enemyAttack(e, dt);
      } else if (e.def.flying) {
        const dx = cx - e.x,
          dy = cy - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 1.55 + e.def.radius * 0.5) {
          this.reachCore(e);
        } else {
          e.x += (dx / d) * speed * dt;
          e.y += (dy / d) * speed * dt;
        }
        e.dist = d;
      } else {
        this.moveGround(e, speed, dt);
      }
      e.vx = (e.x - px) / dt;
      e.vy = (e.y - py) / dt;
      if (Math.abs(e.vx) + Math.abs(e.vy) > 0.01) e.facing = Math.atan2(e.vy, e.vx);
    }
  }

  private coreRectDist(x: number, y: number): number {
    const dx = Math.max(CORE_X - 1 - x, 0, x - (CORE_X + 2));
    const dy = Math.max(CORE_Y - 1 - y, 0, y - (CORE_Y + 2));
    return Math.hypot(dx, dy);
  }

  private moveGround(e: Enemy, speed: number, dt: number) {
    if (this.coreRectDist(e.x, e.y) < e.def.radius + 0.08) {
      e.dist = 0;
      this.reachCore(e);
      return;
    }
    const tx = Math.floor(e.x),
      ty = Math.floor(e.y);
    let field = e.def.breaker ? this.flowB : this.flowG;
    const ti = inBounds(tx, ty) ? idx(tx, ty) : -1;
    if (ti >= 0 && field[ti] >= INF) field = this.flowB;
    e.dist = ti >= 0 ? field[ti] : 999;

    if (!e.hasWp) this.pickWaypoint(e, field);

    let gx: number, gy: number;
    if (e.wx < 0) {
      // adjacent to core: walk straight at it
      gx = CORE_X + 0.5;
      gy = CORE_Y + 0.5;
    } else {
      gx = e.wx + 0.5 + e.jx;
      gy = e.wy + 0.5 + e.jy;
      const bu = this.buildingAt[idx(e.wx, e.wy)];
      if (bu) {
        const b = this.byUid.get(bu)!;
        if (b.def.blocks) {
          const d = Math.hypot(e.wx + 0.5 - e.x, e.wy + 0.5 - e.y);
          if (d < 0.55 + e.def.radius) {
            e.attacking = b.uid;
            return;
          }
          gx = e.wx + 0.5;
          gy = e.wy + 0.5;
        }
      }
    }
    const dx = gx - e.x,
      dy = gy - e.y;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    if (d <= step || d < 0.04) {
      e.x = gx;
      e.y = gy;
      e.hasWp = false;
    } else {
      e.x += (dx / d) * step;
      e.y += (dy / d) * step;
    }
  }

  private pickWaypoint(e: Enemy, field: Float32Array) {
    const x = Math.floor(e.x),
      y = Math.floor(e.y);
    e.hasWp = true;
    if (!inBounds(x, y)) {
      e.wx = Math.max(0, Math.min(MAP_W - 1, x));
      e.wy = Math.max(0, Math.min(MAP_H - 1, y));
      return;
    }
    const breaker = field === this.flowB;
    const pass = (i: number) => (breaker ? this.breakerCost(i) : this.groundCost(i)) < INF;
    let best = field[idx(x, y)];
    let bx = -2,
      by = -2;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (isCoreTile(nx, ny)) {
        e.wx = -1;
        e.wy = -1;
        return;
      }
      const ni = idx(nx, ny);
      if (!pass(ni)) continue;
      if (dx && dy && (!pass(idx(x + dx, y)) || !pass(idx(x, y + dy)))) continue;
      if (field[ni] < best) {
        best = field[ni];
        bx = nx;
        by = ny;
      }
    }
    if (bx === -2) {
      // stuck (e.g. standing on a tile that just got blocked): head for tile center
      e.wx = x;
      e.wy = y;
    } else {
      e.wx = bx;
      e.wy = by;
    }
  }

  /** Regular enemies dive into the Beacon and burn out; bosses stay and pound on it. */
  private reachCore(e: Enemy) {
    if (e.def.boss) {
      e.attacking = 0;
      return;
    }
    e.dead = true;
    this.hurtCore(e.def.leak * (1 + (this.wave - 1) * 0.03) * (e.hp / e.maxHp > 0.5 ? 1 : 0.6), e.x, e.y);
    this.events.push({ type: 'die', x: e.x, y: e.y, enemy: e.def.id, big: false });
  }

  private hurtCore(dmg: number, x: number, y: number) {
    this.coreHp -= dmg;
    this.coreHurt = 0.3;
    this.stats.leaked += dmg;
    this.events.push({ type: 'coreHit', x, y, dmg });
    if (this.coreHp <= 0 && !this.over) {
      this.coreHp = 0;
      this.over = true;
      this.won = false;
      this.events.push({ type: 'defeat' });
    }
  }

  private enemyAttack(e: Enemy, dt: number) {
    if (e.attacking > 0 && !this.byUid.has(e.attacking)) {
      e.attacking = -1;
      e.hasWp = false;
      return;
    }
    e.attackCd -= dt;
    if (e.attackCd > 0) return;
    e.attackCd = 1 / e.def.attackRate;
    const dmg = e.def.damage * (1 + (this.wave - 1) * 0.04);
    if (e.attacking === 0) {
      this.hurtCore(dmg, e.x, e.y);
    } else {
      const b = this.byUid.get(e.attacking)!;
      b.hp -= dmg * (e.def.breaker ? 1.5 : 1);
      b.hurt = 0.2;
      this.events.push({ type: 'hit', x: b.x + 0.5, y: b.y + 0.5, color: '#ffcf8a' });
      if (b.hp <= 0) {
        this.stats.lost++;
        this.events.push({ type: 'destroyed', x: b.x + 0.5, y: b.y + 0.5, id: b.def.id });
        this.removeBuilding(b);
      }
    }
  }

  private enemyAbility(e: Enemy) {
    switch (e.def.id) {
      case 'warden': {
        e.abilityCd = 1.2;
        let any = false;
        for (const o of this.enemies) {
          if (o === e || o.dead) continue;
          if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 2.3 * 2.3 && o.hp < o.maxHp) {
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.06);
            any = true;
          }
        }
        if (any) this.events.push({ type: 'heal', x: e.x, y: e.y });
        break;
      }
      case 'colossus': {
        e.abilityCd = 7;
        if (e.attacking >= 0) break;
        for (let i = 0; i < 3; i++) this.spawnMinion('shade', e);
        break;
      }
      case 'wyrm': {
        e.abilityCd = 6;
        if (e.attacking >= 0) break;
        for (let i = 0; i < 2; i++) this.spawnMinion('wraith', e);
        break;
      }
      default:
        e.abilityCd = 99;
    }
  }

  private spawnMinion(id: EnemyId, from: Enemy) {
    const def = ENEMIES[id];
    const hp = def.hp * hpScale(this.wave) * DIFFICULTY[this.difficulty].hp * 0.8;
    const m = this.makeEnemy(def, from.x, from.y, hp);
    m.bounty *= 0.5;
    this.events.push({ type: 'spawn', x: m.x, y: m.y });
  }

  /** Apply damage. `pierce` ignores that much armor. Returns damage dealt. */
  damageEnemy(e: Enemy, amount: number, pierce: number, src: number, continuous = false): number {
    if (e.dead) return 0;
    const armor = Math.max(0, e.def.armor - pierce);
    let dmg: number;
    if (continuous) dmg = amount * (1 - Math.min(0.5, armor / 20));
    else dmg = Math.max(amount * 0.25, amount - armor);
    e.hp -= dmg;
    if (!continuous) e.hit = 0.12;
    if (src > 0) {
      const b = this.byUid.get(src);
      if (b) b.dealt += dmg;
    }
    if (e.hp <= 0) this.kill(e, src);
    return dmg;
  }

  private kill(e: Enemy, src: number) {
    e.dead = true;
    this.stats.kills++;
    if (e.def.boss) this.stats.bossKills++;
    const bounty = Math.max(1, Math.round(e.bounty));
    this.money += bounty;
    this.stats.earned += bounty;
    this.events.push({ type: 'die', x: e.x, y: e.y, enemy: e.def.id, big: !!e.def.boss || e.def.radius > 0.35 });
    this.events.push({ type: 'bounty', x: e.x, y: e.y - 0.3, amount: bounty });
    if (src > 0) {
      const b = this.byUid.get(src);
      if (b) b.kills++;
    }
    if (e.def.id === 'brood') {
      for (let i = 0; i < 3; i++) {
        const s = this.makeEnemy(ENEMIES.skitter, e.x, e.y, ENEMIES.skitter.hp * hpScale(this.wave) * DIFFICULTY[this.difficulty].hp);
        s.bounty *= 0.5;
      }
    }
  }

  // ---------------------------------------------------------------- buildings

  private canHit(targets: string, e: Enemy): boolean {
    if (targets === 'both') return true;
    if (targets === 'ground') return !e.def.flying;
    if (targets === 'air') return e.def.flying;
    return false;
  }

  private findTarget(
    x: number,
    y: number,
    range: number,
    targets: string,
    mode: TargetMode,
    minRange = 0,
    preferAir = false,
  ): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    const r2 = range * range,
      m2 = minRange * minRange;
    for (const e of this.enemies) {
      if (e.dead || e.age < 0.15) continue;
      if (!this.canHit(targets, e)) continue;
      const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d2 > r2 || d2 < m2) continue;
      let s: number;
      switch (mode) {
        case 'first':
          s = -e.dist;
          break;
        case 'last':
          s = e.dist;
          break;
        case 'strong':
          s = e.hp;
          break;
        default:
          s = -d2;
      }
      if (preferAir && e.def.flying) s += 1e6;
      if (s > bestScore) {
        bestScore = s;
        best = e;
      }
    }
    return best;
  }

  private updateBuildings(dt: number) {
    for (const b of this.buildings) {
      const L = b.def.levels[b.level];
      const bx = b.x + 0.5,
        by = b.y + 0.5;
      if (b.cd > 0) b.cd -= dt;
      if (b.firing > 0) b.firing -= dt;
      if (b.recoil > 0) b.recoil = Math.max(0, b.recoil - dt * 4);
      if (b.hurt > 0) b.hurt -= dt;

      switch (b.def.id) {
        case 'arbalest': {
          if (b.cd > 0) break;
          const t = this.findTarget(bx, by, L.range!, 'both', b.mode);
          if (!t) break;
          b.angle = Math.atan2(t.y - by, t.x - bx);
          b.cd = 1 / L.rate!;
          b.recoil = 1;
          this.fireProjectile('bolt', b, t, L.damage!, 0, 13, '#ffcf7a');
          break;
        }
        case 'mortar': {
          if (b.cd > 0) break;
          const t = this.findTarget(bx, by, L.range!, 'ground', b.mode, L.minRange);
          if (!t) break;
          b.angle = Math.atan2(t.y - by, t.x - bx);
          b.cd = 1 / L.rate!;
          b.recoil = 1;
          const flight = 0.75 + Math.hypot(t.x - bx, t.y - by) * 0.06;
          const p = this.fireProjectile('shell', b, t, L.damage!, L.splash!, 0, '#ff8a4a');
          p.tx = t.x + t.vx * flight * 0.9;
          p.ty = t.y + t.vy * flight * 0.9;
          p.flight = flight;
          break;
        }
        case 'tesla': {
          if (b.cd > 0) break;
          const t = this.findTarget(bx, by, L.range!, 'both', b.mode);
          if (!t) break;
          b.cd = 1 / L.rate!;
          b.firing = 0.15;
          const pts = [{ x: bx, y: by - 0.35 }];
          const hit = new Set<Enemy>();
          let cur: Enemy | null = t;
          let dmg = L.damage!;
          for (let k = 0; k < L.chain! && cur; k++) {
            hit.add(cur);
            pts.push({ x: cur.x, y: cur.y });
            this.damageEnemy(cur, dmg, 2, b.uid);
            dmg *= 0.85;
            let next: Enemy | null = null,
              nd = 2.2 * 2.2;
            for (const o of this.enemies) {
              if (o.dead || hit.has(o)) continue;
              const d2 = (o.x - cur.x) ** 2 + (o.y - cur.y) ** 2;
              if (d2 < nd) {
                nd = d2;
                next = o;
              }
            }
            cur = next;
          }
          this.events.push({ type: 'chain', pts });
          this.events.push({ type: 'shoot', kind: 'tesla', x: bx, y: by, tx: t.x, ty: t.y });
          break;
        }
        case 'pyre': {
          const t = this.findTarget(bx, by, L.range!, 'both', 'close');
          if (!t) break;
          const want = Math.atan2(t.y - by, t.x - bx);
          b.angle = turnToward(b.angle, want, 8 * dt);
          b.firing = 0.1;
          if (b.cd <= 0) {
            b.cd = 0.25;
            this.events.push({ type: 'shoot', kind: 'pyre', x: bx, y: by, tx: t.x, ty: t.y });
          }
          const r2 = L.range! * L.range!;
          for (const e of this.enemies) {
            if (e.dead) continue;
            const dx = e.x - bx,
              dy = e.y - by;
            const d2 = dx * dx + dy * dy;
            if (d2 > r2) continue;
            const da = Math.abs(angDiff(Math.atan2(dy, dx), b.angle));
            if (da > 0.5 && d2 > 0.5) continue;
            this.damageEnemy(e, L.damage! * dt, 0, b.uid, true);
            e.burn = Math.max(e.burn, L.burn!);
            e.burnT = 2.5;
          }
          break;
        }
        case 'prism': {
          let t = b.targetUid ? this.enemyByUid.get(b.targetUid) : undefined;
          if (!t || t.dead || (t.x - bx) ** 2 + (t.y - by) ** 2 > L.range! ** 2) {
            const n = this.findTarget(bx, by, L.range!, 'both', b.mode);
            if (!n) {
              b.targetUid = 0;
              b.beamTime = 0;
              break;
            }
            if (t && !t.dead) b.beamTime *= 0.3; // keep some charge when switching
            else b.beamTime *= 0.5;
            t = n;
            b.targetUid = n.uid;
          }
          b.angle = Math.atan2(t.y - by, t.x - bx);
          b.beamTime += dt;
          b.firing = 0.1;
          const mult = 1 + 3 * Math.min(1, b.beamTime / 3);
          this.damageEnemy(t, L.damage! * mult * dt, 4, b.uid, true);
          if (b.cd <= 0) {
            b.cd = 0.5;
            this.events.push({ type: 'shoot', kind: 'prism', x: bx, y: by, tx: t.x, ty: t.y });
          }
          break;
        }
        case 'skyhunter': {
          if (b.cd > 0) break;
          const cands: Enemy[] = [];
          const r2 = L.range! ** 2;
          for (const e of this.enemies) if (!e.dead && e.age > 0.15 && (e.x - bx) ** 2 + (e.y - by) ** 2 <= r2) cands.push(e);
          if (!cands.length) break;
          const key = (e: Enemy) =>
            (e.def.flying ? 1e7 : 0) + (b.mode === 'strong' ? e.hp : b.mode === 'last' ? e.dist : b.mode === 'close' ? -((e.x - bx) ** 2 + (e.y - by) ** 2) : -e.dist);
          cands.sort((a, c) => key(c) - key(a));
          b.cd = 1 / L.rate!;
          b.recoil = 1;
          for (let k = 0; k < L.shots!; k++) {
            const t = cands[k % Math.min(cands.length, 3)];
            const p = this.fireProjectile('missile', b, t, L.damage!, L.splash!, 5, '#7dffcf');
            const a = -Math.PI / 2 + (k - (L.shots! - 1) / 2) * 0.5;
            p.vx = Math.cos(a) * 3;
            p.vy = Math.sin(a) * 3;
            p.t = -k * 0.08;
          }
          b.angle = Math.atan2(cands[0].y - by, cands[0].x - bx);
          break;
        }
        case 'obelisk': {
          if (b.cd > 0) break;
          const t = this.findTarget(bx, by, L.range!, 'both', 'strong');
          if (!t) break;
          b.cd = 1 / L.rate!;
          b.firing = 0.9;
          this.strikes.push({ x: t.x, y: t.y, targetUid: t.uid, t: 0.85, damage: L.damage!, splash: L.splash!, src: b.uid });
          this.events.push({ type: 'strikeWarn', x: t.x, y: t.y, r: L.splash! });
          break;
        }
        case 'frost': {
          const r2 = L.range! ** 2;
          for (const e of this.enemies) {
            if (e.dead) continue;
            if ((e.x - bx) ** 2 + (e.y - by) ** 2 > r2) continue;
            e.slow = Math.max(e.slow, L.slow!);
            if (L.damage) this.damageEnemy(e, L.damage * dt, 99, b.uid, true);
          }
          if (b.cd <= 0) {
            b.cd = 1.6;
            this.events.push({ type: 'frost', x: bx, y: by, r: L.range! });
          }
          break;
        }
        case 'thorns': {
          if (b.cd > 0) break;
          let any = false;
          for (const e of this.enemies) {
            if (e.dead || e.def.flying) continue;
            if (Math.abs(e.x - bx) < 0.55 && Math.abs(e.y - by) < 0.55) {
              this.damageEnemy(e, L.damage!, 7, b.uid);
              any = true;
            }
          }
          if (any) {
            b.cd = 1 / L.rate!;
            b.firing = 0.15;
            this.events.push({ type: 'thorns', x: bx, y: by });
          }
          break;
        }
        case 'mire': {
          for (const e of this.enemies) {
            if (e.dead || e.def.flying) continue;
            if (Math.abs(e.x - bx) < 0.6 && Math.abs(e.y - by) < 0.6) {
              e.slow = Math.max(e.slow, L.slow!);
              if (L.damage) this.damageEnemy(e, L.damage * dt, 99, b.uid, true);
            }
          }
          break;
        }
        case 'mender': {
          const r2 = L.range! ** 2;
          let any = false;
          for (const o of this.buildings) {
            if (o === b || o.hp >= o.maxHp) continue;
            if ((o.x - b.x) ** 2 + (o.y - b.y) ** 2 > r2) continue;
            o.hp = Math.min(o.maxHp, o.hp + L.heal! * dt);
            any = true;
          }
          if (this.coreRectDist(bx, by) <= L.range! && this.coreHp < this.coreMaxHp) {
            this.coreHp = Math.min(this.coreMaxHp, this.coreHp + (L.heal! / 4) * dt);
            any = true;
          }
          if (any) b.firing = 0.1;
          break;
        }
      }
    }
  }

  private updateCore(dt: number) {
    const C = this.core;
    this.coreCd -= dt;
    if (this.coreCd > 0) return;
    const cx = CORE_X + 0.5,
      cy = CORE_Y + 0.5;
    const t = this.findTarget(cx, cy, C.range, 'both', 'close');
    if (!t) return;
    this.coreCd = 1 / C.rate;
    this.coreAngle = Math.atan2(t.y - cy, t.x - cx);
    const p = this.fireProjectile('core', null, t, C.damage, 0, 11, '#fff0b0');
    p.x = cx;
    p.y = cy - 0.6;
  }

  private fireProjectile(
    kind: Projectile['kind'],
    b: Building | null,
    t: Enemy,
    damage: number,
    splash: number,
    speed: number,
    color: string,
  ): Projectile {
    const x = b ? b.x + 0.5 : CORE_X + 0.5,
      y = b ? b.y + 0.5 : CORE_Y + 0.5;
    const p: Projectile = {
      kind,
      x,
      y,
      sx: x,
      sy: y,
      tx: t.x,
      ty: t.y,
      vx: 0,
      vy: 0,
      targetUid: t.uid,
      speed,
      damage,
      splash,
      pierce: kind === 'shell' ? 2 : 0,
      t: 0,
      flight: 0,
      air: kind !== 'shell',
      ground: true,
      src: b ? b.uid : -1,
      color,
      dead: false,
    };
    this.projectiles.push(p);
    this.events.push({ type: 'shoot', kind: b ? b.def.id : 'core', x, y, tx: t.x, ty: t.y });
    return p;
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.t += dt;
      if (p.t < 0) continue;
      if (p.kind === 'shell') {
        const k = Math.min(1, p.t / p.flight);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k;
        if (k >= 1) {
          p.dead = true;
          this.explode(p.x, p.y, p.splash, p.damage, p.pierce, p.src, false, true, p.color);
        }
        continue;
      }
      let t = this.enemyByUid.get(p.targetUid);
      if (t && t.dead) t = undefined;
      if (!t && p.kind === 'missile') {
        // retarget
        let best: Enemy | undefined,
          bd = 9;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
          if (d2 < bd) {
            bd = d2;
            best = e;
          }
        }
        if (best) {
          t = best;
          p.targetUid = best.uid;
        }
      }
      if (t) {
        p.tx = t.x;
        p.ty = t.y;
      }
      const dx = p.tx - p.x,
        dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (p.kind === 'missile') {
        p.speed = Math.min(9, p.speed + dt * 6);
        const ax = (dx / (d || 1)) * p.speed,
          ay = (dy / (d || 1)) * p.speed;
        const k = Math.min(1, dt * 6);
        p.vx += (ax - p.vx) * k;
        p.vy += (ay - p.vy) * k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (d < 0.25 || p.t > 4) {
          p.dead = true;
          this.explode(p.x, p.y, p.splash, p.damage, 1, p.src, true, true, p.color, t);
        }
        continue;
      }
      const step = p.speed * dt;
      if (d <= step + 0.1) {
        p.dead = true;
        if (t) {
          this.damageEnemy(t, p.damage, 0, p.src);
          this.events.push({ type: 'hit', x: t.x, y: t.y, color: p.color });
        }
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
      if (p.t > 3) p.dead = true;
    }
  }

  private explode(
    x: number,
    y: number,
    r: number,
    damage: number,
    pierce: number,
    src: number,
    air: boolean,
    ground: boolean,
    color: string,
    direct?: Enemy,
  ) {
    const r2 = r * r;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.def.flying ? !air : !ground) continue;
      const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
      const rr = r + e.def.radius;
      if (d2 > rr * rr && e !== direct) continue;
      const falloff = e === direct ? 1 : 1 - 0.4 * Math.min(1, d2 / Math.max(r2, 0.01));
      this.damageEnemy(e, damage * falloff, pierce, src);
    }
    this.events.push({ type: 'explode', x, y, r, color });
  }

  private updateStrikes(dt: number) {
    if (!this.strikes.length) return;
    for (const s of this.strikes) {
      const t = this.enemyByUid.get(s.targetUid);
      if (t && !t.dead) {
        s.x += (t.x - s.x) * Math.min(1, dt * 8);
        s.y += (t.y - s.y) * Math.min(1, dt * 8);
      }
      s.t -= dt;
      if (s.t <= 0) {
        this.explode(s.x, s.y, s.splash, s.damage, 99, s.src, true, true, '#fff1a8', t && !t.dead ? t : undefined);
        this.events.push({ type: 'strike', x: s.x, y: s.y, r: s.splash });
      }
    }
    this.strikes = this.strikes.filter((s) => s.t > 0);
  }

  /** Follow the ground flow field from a tile to the core, for path previews. */
  tracePath(sx: number, sy: number, field = this.flowG): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    let x = sx,
      y = sy;
    for (let n = 0; n < 400; n++) {
      pts.push({ x: x + 0.5, y: y + 0.5 });
      const cur = field[idx(x, y)];
      if (cur <= 1.5) break;
      let best = cur,
        bx = -1,
        by = -1;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx,
          ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (this.groundCost(ni) >= INF) continue;
        if (dx && dy && (this.groundCost(idx(x + dx, y)) >= INF || this.groundCost(idx(x, y + dy)) >= INF)) continue;
        if (field[ni] < best) {
          best = field[ni];
          bx = nx;
          by = ny;
        }
      }
      if (bx < 0) break;
      x = bx;
      y = by;
    }
    return pts;
  }

  drainEvents(): GameEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(cur: number, want: number, maxStep: number): number {
  const d = angDiff(want, cur);
  if (Math.abs(d) <= maxStep) return want;
  return cur + Math.sign(d) * maxStep;
}
