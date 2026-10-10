import { DIFFICULTY, Difficulty, enemyByRole, ENEMIES, EnemyId, Realm, REALMS, waveBudget } from './config';
import type { StringKey } from '../i18n/en';
import { Rng } from './rng';

export interface WaveSpawn {
  enemy: EnemyId;
  rift: number;
  t: number;
  /** Extra HP multiplier: late waves are condensed into fewer, tougher enemies. */
  elite: number;
}

export interface WavePlan {
  wave: number;
  spawns: WaveSpawn[];
  /** Special name for themed nights, or null for an ordinary night. */
  tag: StringKey | null;
  boss: boolean;
  newEnemy: EnemyId | null;
  counts: Partial<Record<EnemyId, number>>;
}

export function riftsOpenAt(wave: number, realm: Realm = 'night'): number {
  return REALMS[realm].riftSchedule.filter((w) => w <= wave).length;
}



/** Deterministically build the spawn list for a wave. */
export function planWave(wave: number, difficulty: Difficulty, seed: number, realm: Realm = 'night'): WavePlan {
  const rng = new Rng(seed * 31 + wave * 1013);
  const rifts = riftsOpenAt(wave, realm);
  const R = REALMS[realm];
  const WEIGHTS = R.weights;
  const role = (r: Parameters<typeof enemyByRole>[1]) => enemyByRole(realm, r);
  let budget = waveBudget(wave) * DIFFICULTY[difficulty].budget;
  const spawns: WaveSpawn[] = [];
  const counts: Partial<Record<EnemyId, number>> = {};
  const pool = R.regular.filter((id) => ENEMIES[id].firstWave <= wave);
  const newEnemy = R.regular.find((id) => ENEMIES[id].firstWave === wave) ?? null;
  let tag: StringKey | null = null;
  let boss = false;
  let t = 0;
  let riftCursor = rng.int(0, rifts - 1);

  const addGroup = (id: EnemyId, n: number, interval: number, rift?: number) => {
    const r = rift ?? riftCursor++ % rifts;
    for (let i = 0; i < n; i++) spawns.push({ enemy: id, rift: r, t: t + i * interval, elite: 1 });
    counts[id] = (counts[id] ?? 0) + n;
    budget -= ENEMIES[id].threat * n;
    return n * interval;
  };

  if (wave % 10 === 0) {
    boss = true;
    const air = wave % 20 === 0;
    const bossId: EnemyId = role(air ? 'bossAir' : 'bossGround');
    tag = air ? 'wave.wyrm' : 'wave.colossus';
    budget *= 0.55;
    // escorts first, boss arrives a bit later
    t = 0;
    addGroup(bossId, 1, 0, rng.int(0, rifts - 1));
    budget += ENEMIES[bossId].threat; // boss is free, budget goes to escorts
    if (wave >= 30) {
      addGroup(role(air ? 'bossGround' : 'bossAir'), 1, 0);
      budget += 60;
      tag = 'wave.eclipse';
    }
    t = 3;
  } else if (wave % 5 === 0 && wave >= 5) {
    const themes = ['air', 'swarm', 'siege'] as const;
    const theme = themes[(wave / 5 - 1) % 3];
    if (theme === 'air') {
      tag = 'wave.air';
      const fl = role('flyer');
      while (budget > ENEMIES[fl].threat * 3) {
        const n = Math.min(rng.int(4, 9), Math.floor(budget / ENEMIES[fl].threat));
        t += addGroup(fl, n, 0.55) + rng.range(1.5, 3.5);
      }
    } else if (theme === 'swarm') {
      tag = 'wave.swarm';
      while (budget > 3) {
        const fa = role('fast');
        const n = Math.min(rng.int(10, 20), Math.floor(budget / ENEMIES[fa].threat));
        t += addGroup(fa, n, 0.22) + rng.range(1.5, 3);
      }
    } else {
      tag = 'wave.siege';
      const br = role('breaker');
      while (budget > ENEMIES[br].threat) {
        const n = Math.min(rng.int(2, 4), Math.floor(budget / ENEMIES[br].threat));
        t += addGroup(br, n, 1.4) + rng.range(2, 4);
        if (budget > 4) t += addGroup(role('basic'), Math.min(6, Math.floor(budget / 2)), 0.6) * 0.5;
      }
    }
  }

  if (newEnemy && budget > 0) {
    const n = Math.max(2, Math.min(6, Math.floor((budget * 0.4) / ENEMIES[newEnemy].threat)));
    t += addGroup(newEnemy, n, 1.0) + 2;
  }

  // Fill the rest of the budget with mixed groups.
  let guard = 0;
  while (budget > 0.5 && guard++ < 200) {
    const affordable = pool.filter((id) => ENEMIES[id].threat <= budget);
    if (!affordable.length) break;
    let total = 0;
    for (const id of affordable) total += WEIGHTS[id] ?? 1;
    let roll = rng.next() * total;
    let id = affordable[0];
    for (const a of affordable) {
      roll -= WEIGHTS[a] ?? 1;
      if (roll <= 0) {
        id = a;
        break;
      }
    }
    const def = ENEMIES[id];
    const maxN = Math.floor(budget / def.threat);
    const base = def.threat <= 0.5 ? rng.int(6, 14) : def.threat <= 1.6 ? rng.int(3, 8) : rng.int(1, 3);
    const n = Math.max(1, Math.min(maxN, base + Math.floor(wave / 8)));
    const interval = def.speed > 1.5 ? 0.3 : def.threat >= 4 ? 1.6 : 0.8;
    const dur = addGroup(id, n, interval);
    // Later waves overlap groups more tightly.
    t += dur * rng.range(0.4, 0.9) + Math.max(0.6, rng.range(1.5, 3.5) - wave * 0.05);
  }

  spawns.sort((a, b) => a.t - b.t);

  // Condense very large waves into fewer, tougher (elite) enemies to keep the field readable.
  const cap = Math.min(160, 50 + wave * 3);
  let out = spawns;
  if (spawns.length > cap) {
    const regular = spawns.filter((s) => !ENEMIES[s.enemy].boss);
    const keepEvery = regular.length / (cap - (spawns.length - regular.length));
    const mult = keepEvery;
    out = [];
    let acc = 0;
    for (const s of spawns) {
      if (ENEMIES[s.enemy].boss) {
        out.push(s);
        continue;
      }
      acc += 1;
      if (acc >= keepEvery) {
        acc -= keepEvery;
        out.push({ ...s, elite: mult });
      }
    }
    for (const k of Object.keys(counts) as EnemyId[]) counts[k] = out.filter((s) => s.enemy === k).length;
  }
  return { wave, spawns: out, tag, boss, newEnemy, counts };
}
