// A heuristic auto-player used for balance simulation (and the title-screen attract mode).
import { BUILDINGS, BuildingId, CORE_X, CORE_Y, MAP_H, MAP_W } from './config';
import { Game } from './game';
import { idx, Terrain } from './grid';
import { Rng } from './rng';

export interface BotOptions {
  /** 0..1: how well the bot plays (affects walls/mazing and spending efficiency). */
  skill: number;
  maze: boolean;
}

export class Bot {
  private rng: Rng;
  private thinkCd = 0;
  private nextPick: BuildingId | null = null;
  private wallBudget = 0;
  private lastPhase = '';
  constructor(
    private g: Game,
    private opt: BotOptions = { skill: 0.7, maze: true },
  ) {
    this.rng = new Rng(g.seed + 17);
  }

  update(dt: number) {
    const g = this.g;
    if (g.over) return;
    this.thinkCd -= dt;
    // Nova when things get close
    if (g.novaCd <= 0) {
      let near = 0;
      for (const e of g.enemies) if (Math.hypot(e.x - CORE_X - 0.5, e.y - CORE_Y - 0.5) < 3.5) near += e.def.boss ? 8 : 1;
      if (near >= 6) g.nova();
    }
    if (g.phase !== this.lastPhase) {
      this.lastPhase = g.phase;
      if (g.phase === 'build') this.wallBudget = g.money * 0.25 * this.opt.skill;
    }
    if (this.thinkCd > 0) return;
    this.thinkCd = g.phase === 'build' ? 0.5 : 3;
    if (g.phase === 'wave' && g.money < 50) return;
    this.think();
    if (g.phase === 'build' && g.buildTimer > 3 && this.opt.skill > 0.5 && g.money < 30) g.callWaveNow();
  }

  private paths(): { x: number; y: number }[] {
    const g = this.g;
    const pts: { x: number; y: number }[] = [];
    for (const r of g.map.rifts.slice(0, g.riftCount)) pts.push(...g.tracePath(r.x, r.y));
    return pts;
  }

  private think() {
    const g = this.g;
    for (let guard = 0; guard < 20; guard++) {
      if (!this.act()) break;
    }
    void g;
  }

  /** Returns true if it spent money. */
  private act(): boolean {
    const g = this.g;
    const w = g.wave + (g.phase === 'build' ? 1 : 0);
    const towers = g.buildings.filter((b) => b.def.kind === 'tower' || b.def.id === 'frost');

    // Beacon upgrades
    const coreGate = [0, 4, 8, 13, 19];
    const cc = g.coreUpgradeCost();
    if (cc !== null && w >= coreGate[g.coreLevel + 1] && towers.length >= 4 + g.coreLevel * 3) {
      if (g.money >= cc) return g.upgradeCore();
      if (g.money >= cc * 0.75) return false; // save up
    }

    // Harvesters
    const harvesters = g.buildings.filter((b) => b.def.id === 'harvester');
    if (w >= 2 && harvesters.length < Math.min(1 + Math.floor(w / 4), 8) && towers.length >= 4 + harvesters.length * 2 && g.money >= BUILDINGS.harvester.levels[0].cost) {
      const spot = this.crystalSpot();
      if (spot && g.place('harvester', spot.x, spot.y)) return true;
    }
    for (const h of harvesters) {
      const c = g.upgradeCost(h);
      if (c !== null && w >= 6 + h.level * 6 && g.money >= c + 40) return g.upgrade(h);
    }

    // Mazing walls during build phases, a slice of the budget
    if (this.opt.maze && g.phase === 'build' && this.wallBudget > 0 && g.money >= 30 && towers.length >= 4 + w / 3) {
      const before = g.money;
      if (this.tryWall()) {
        this.wallBudget -= before - g.money;
        return true;
      }
      this.wallBudget = 0;
    }

    // Upgrade vs build
    if (!this.nextPick || !g.isUnlocked(this.nextPick)) this.nextPick = this.chooseTower(w, towers.length);
    const pickNew = this.nextPick;
    const newCost = BUILDINGS[pickNew].levels[0].cost;
    const upg = towers
      .filter((b) => g.upgradeCost(b) !== null)
      .sort((a, b) => g.upgradeCost(a)! / (a.dealt + 50) - g.upgradeCost(b)! / (b.dealt + 50))[0];
    const preferUpgrade = upg && towers.length >= 4 + g.coreLevel && this.rng.chance(0.55);
    if (preferUpgrade && g.money >= g.upgradeCost(upg)!) return g.upgrade(upg);
    if (g.money >= newCost) {
      const spot = this.towerSpot(pickNew);
      if (spot && g.place(pickNew, spot.x, spot.y)) {
        this.nextPick = null;
        return true;
      }
    }
    if (upg && !preferUpgrade && g.money >= g.upgradeCost(upg)! && g.money > newCost * 1.5) return g.upgrade(upg);
    return false;
  }

  private chooseTower(w: number, count: number): BuildingId {
    const g = this.g;
    const opts: [BuildingId, number][] = [['arbalest', w < 8 ? 6 : 2]];
    if (w >= 2) opts.push(['thorns', 1]);
    if (g.isUnlocked('mortar')) opts.push(['mortar', 4]);
    if (g.isUnlocked('frost') && count >= 5) opts.push(['frost', 1.5]);
    if (g.isUnlocked('tesla')) opts.push(['tesla', 4]);
    if (g.isUnlocked('pyre')) opts.push(['pyre', 2]);
    if (g.isUnlocked('prism')) opts.push(['prism', 4]);
    if (g.isUnlocked('skyhunter')) opts.push(['skyhunter', 3]);
    if (g.isUnlocked('obelisk')) opts.push(['obelisk', 4]);
    let total = 0;
    for (const [, v] of opts) total += v;
    let r = this.rng.next() * total;
    for (const [id, v] of opts) if ((r -= v) <= 0) return id;
    return 'arbalest';
  }

  private crystalSpot(): { x: number; y: number } | null {
    const g = this.g;
    let best: { x: number; y: number } | null = null,
      bd = 1e9;
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (g.map.terrain[idx(x, y)] !== Terrain.Crystal) continue;
        if (!g.canPlace('harvester', x, y).ok) continue;
        const d = Math.hypot(x - CORE_X, y - CORE_Y);
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    return best;
  }

  private towerSpot(id: BuildingId): { x: number; y: number } | null {
    const g = this.g;
    const L = BUILDINGS[id].levels[0];
    const range = id === 'thorns' ? 0.5 : (L.range ?? 2.5);
    const minR = L.minRange ?? 0;
    const path = this.paths();
    let best: { x: number; y: number } | null = null,
      bs = -1;
    const onPath = new Set(path.map((p) => idx(Math.floor(p.x), Math.floor(p.y))));
    for (let y = 1; y < MAP_H - 1; y++)
      for (let x = 1; x < MAP_W - 1; x++) {
        const i = idx(x, y);
        if (g.buildingAt[i] || g.map.terrain[i] !== Terrain.Grass) continue;
        const isPath = onPath.has(i);
        if (id === 'thorns' ? !isPath : isPath && this.rng.chance(0.85)) continue;
        let cov = 0;
        for (const p of path) {
          const d = Math.hypot(p.x - x - 0.5, p.y - y - 0.5);
          if (d <= range && d >= minR) cov += 1 / (1 + Math.hypot(p.x - CORE_X - 0.5, p.y - CORE_Y - 0.5) * 0.12);
        }
        const dc = Math.hypot(x - CORE_X, y - CORE_Y);
        const score = cov * 10 - dc * (id === 'obelisk' || id === 'frost' ? 2 : 0.6) + this.rng.next() * 3;
        if (score > bs && g.canPlace(id, x, y).ok) {
          bs = score;
          best = { x, y };
        }
      }
    return best;
  }

  /** Try a short wall segment that lengthens the enemy paths the most per wall. */
  private tryWall(): boolean {
    const g = this.g;
    const walls = g.buildings.filter((b) => b.def.id === 'wall').length;
    if (walls > 10 + g.wave * 3) return false;
    const rifts = g.map.rifts.slice(0, g.riftCount);
    const total = () => rifts.reduce((s, r) => s + Math.min(g.flowG[idx(r.x, r.y)], 500), 0);
    const baseLen = total();
    const path = this.paths();
    const cand: { x: number; y: number }[] = [];
    for (const p of path) {
      const x = Math.floor(p.x),
        y = Math.floor(p.y);
      const dc = Math.hypot(x - CORE_X, y - CORE_Y);
      if (dc < 3 || dc > 12) continue;
      cand.push({ x, y });
    }
    let best: { x: number; y: number }[] | null = null,
      bestScore = 0.3;
    for (let n = 0; n < 30 && cand.length; n++) {
      const c = cand[this.rng.int(0, cand.length - 1)];
      const horiz = this.rng.chance(0.5);
      const len = this.rng.pick([5, 7, 9]);
      const tiles: { x: number; y: number }[] = [];
      for (let k = -(len >> 1); k <= len >> 1; k++) tiles.push(horiz ? { x: c.x + k, y: c.y } : { x: c.x, y: c.y + k });
      const placed = [];
      for (const t of tiles) {
        if (g.canPlace('wall', t.x, t.y).ok) {
          const b = g.place('wall', t.x, t.y);
          if (b) placed.push(b);
        }
      }
      const gain = total() - baseLen;
      const tl = placed.map((b) => ({ x: b.x, y: b.y }));
      for (const b of placed) g.sell(b);
      g.drainEvents();
      if (!placed.length) continue;
      const score = gain / placed.length;
      if (score > bestScore) {
        bestScore = score;
        best = tl;
      }
    }
    if (!best) return false;
    let any = false;
    for (const t of best) if (g.place('wall', t.x, t.y)) any = true;
    return any;
  }
}
