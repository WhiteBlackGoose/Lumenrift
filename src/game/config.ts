// All balance data lives here. Positions/ranges are in tiles, speeds in tiles/second.

export const MAP_W = 37;
export const MAP_H = 23;
export const CORE_X = 18; // center tile of the 3x3 Beacon
export const CORE_Y = 11;

export const START_MONEY = 240;
export const SELL_REFUND = 0.7;
export const VICTORY_WAVE = 30;
export const FIRST_BUILD_TIME = 40;
export const BUILD_TIME = 22;
export const EARLY_CALL_BONUS = 1.5; // aether per second skipped

export type BuildingId =
  | 'wall'
  | 'arbalest'
  | 'thorns'
  | 'harvester'
  | 'mortar'
  | 'frost'
  | 'mire'
  | 'tesla'
  | 'pyre'
  | 'mender'
  | 'prism'
  | 'skyhunter'
  | 'obelisk';

export type Targets = 'ground' | 'air' | 'both' | 'none';

export interface LevelStats {
  cost: number; // cost to build (L1) or to upgrade into this level
  hp: number;
  damage?: number;
  rate?: number; // attacks per second
  range?: number;
  minRange?: number;
  splash?: number;
  chain?: number;
  slow?: number; // fraction of speed removed
  heal?: number; // hp per second
  income?: number; // aether per wave cleared
  burn?: number; // burn dps applied
  shots?: number; // projectiles per volley
  light: number;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  blurb: string;
  tier: number; // Beacon level required
  kind: 'wall' | 'tower' | 'trap' | 'eco' | 'support';
  blocks: boolean;
  targets: Targets;
  onlyOn?: 'crystal';
  color: string;
  levels: LevelStats[];
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  wall: {
    id: 'wall',
    name: 'Bulwark',
    blurb: 'Cheap barricade. Shape the path the shadows must walk. Brutes will smash it.',
    tier: 1,
    kind: 'wall',
    blocks: true,
    targets: 'none',
    color: '#9aa7c7',
    levels: [
      { cost: 8, hp: 260, light: 0 },
      { cost: 18, hp: 650, light: 0 },
      { cost: 40, hp: 1500, light: 0.8 },
    ],
  },
  arbalest: {
    id: 'arbalest',
    name: 'Arbalest',
    blurb: 'Rapid bolt thrower. Hits ground and air. Reliable all-rounder.',
    tier: 1,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    color: '#ffb347',
    levels: [
      { cost: 45, hp: 220, damage: 14, rate: 1.6, range: 3.6, light: 2.2 },
      { cost: 60, hp: 300, damage: 25, rate: 1.9, range: 3.9, light: 2.5 },
      { cost: 125, hp: 420, damage: 44, rate: 2.3, range: 4.3, light: 2.8 },
    ],
  },
  thorns: {
    id: 'thorns',
    name: 'Thornfield',
    blurb: 'Walkable spike trap. Shreds ground units crossing it. Ignores most armor.',
    tier: 1,
    kind: 'trap',
    blocks: false,
    targets: 'ground',
    color: '#c7d36a',
    levels: [
      { cost: 30, hp: 1, damage: 10, rate: 3, light: 0.6 },
      { cost: 45, hp: 1, damage: 19, rate: 3, light: 0.8 },
      { cost: 90, hp: 1, damage: 34, rate: 3, light: 1 },
    ],
  },
  harvester: {
    id: 'harvester',
    name: 'Harvester',
    blurb: 'Drills aether crystal. Pays out each night survived. Must sit on a crystal vein.',
    tier: 1,
    kind: 'eco',
    blocks: true,
    targets: 'none',
    onlyOn: 'crystal',
    color: '#66e0ff',
    levels: [
      { cost: 90, hp: 250, income: 24, light: 1.6 },
      { cost: 110, hp: 350, income: 50, light: 1.9 },
      { cost: 180, hp: 500, income: 85, light: 2.2 },
    ],
  },
  mortar: {
    id: 'mortar',
    name: 'Ember Mortar',
    blurb: 'Lobs explosive shells. Heavy splash damage to ground. Cannot fire point-blank.',
    tier: 2,
    kind: 'tower',
    blocks: true,
    targets: 'ground',
    color: '#ff7a3d',
    levels: [
      { cost: 110, hp: 280, damage: 38, rate: 0.5, range: 5.5, minRange: 1.6, splash: 1.1, light: 2 },
      { cost: 130, hp: 380, damage: 66, rate: 0.55, range: 6, minRange: 1.6, splash: 1.25, light: 2.3 },
      { cost: 240, hp: 520, damage: 115, rate: 0.6, range: 6.5, minRange: 1.6, splash: 1.4, light: 2.6 },
    ],
  },
  frost: {
    id: 'frost',
    name: 'Frost Pylon',
    blurb: 'Radiates a chilling aura that slows everything nearby, air included.',
    tier: 2,
    kind: 'support',
    blocks: true,
    targets: 'both',
    color: '#8fe8ff',
    levels: [
      { cost: 85, hp: 250, damage: 3, range: 2.4, slow: 0.35, light: 2.4 },
      { cost: 90, hp: 330, damage: 6, range: 2.8, slow: 0.45, light: 2.8 },
      { cost: 170, hp: 450, damage: 12, range: 3.2, slow: 0.55, light: 3.2 },
    ],
  },
  mire: {
    id: 'mire',
    name: 'Tar Mire',
    blurb: 'Walkable sticky pool. Heavily slows ground units standing in it.',
    tier: 2,
    kind: 'trap',
    blocks: false,
    targets: 'ground',
    color: '#b07cff',
    levels: [
      { cost: 35, hp: 1, slow: 0.5, damage: 0, light: 0.5 },
      { cost: 45, hp: 1, slow: 0.6, damage: 4, light: 0.6 },
      { cost: 80, hp: 1, slow: 0.7, damage: 10, light: 0.8 },
    ],
  },
  tesla: {
    id: 'tesla',
    name: 'Tesla Coil',
    blurb: 'Arcs lightning between several foes at once. Excellent against swarms.',
    tier: 3,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    color: '#9d8cff',
    levels: [
      { cost: 170, hp: 300, damage: 30, rate: 0.9, range: 3.3, chain: 4, light: 2.6 },
      { cost: 190, hp: 400, damage: 48, rate: 1.0, range: 3.6, chain: 5, light: 2.9 },
      { cost: 340, hp: 540, damage: 78, rate: 1.1, range: 4.0, chain: 7, light: 3.2 },
    ],
  },
  pyre: {
    id: 'pyre',
    name: 'Pyre',
    blurb: 'Short-range flame cone that sets targets ablaze. Melts packs of ground and air.',
    tier: 3,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    color: '#ff5533',
    levels: [
      { cost: 150, hp: 340, damage: 34, range: 2.3, burn: 8, light: 2.4 },
      { cost: 170, hp: 450, damage: 58, range: 2.5, burn: 14, light: 2.7 },
      { cost: 310, hp: 600, damage: 98, range: 2.8, burn: 24, light: 3 },
    ],
  },
  mender: {
    id: 'mender',
    name: 'Mender Shrine',
    blurb: 'Knits nearby structures back together. Also soothes the Beacon at a quarter rate.',
    tier: 3,
    kind: 'support',
    blocks: true,
    targets: 'none',
    color: '#7dff9a',
    levels: [
      { cost: 120, hp: 260, heal: 14, range: 3, light: 2.2 },
      { cost: 130, hp: 340, heal: 26, range: 3.4, light: 2.5 },
      { cost: 240, hp: 460, heal: 45, range: 3.8, light: 2.8 },
    ],
  },
  prism: {
    id: 'prism',
    name: 'Prism Lance',
    blurb: 'Focused beam whose damage climbs the longer it holds one target. Boss killer.',
    tier: 4,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    color: '#ff8adf',
    levels: [
      { cost: 290, hp: 360, damage: 32, range: 4.8, light: 2.8 },
      { cost: 300, hp: 480, damage: 52, range: 5.2, light: 3.1 },
      { cost: 520, hp: 640, damage: 86, range: 5.6, light: 3.4 },
    ],
  },
  skyhunter: {
    id: 'skyhunter',
    name: 'Skyhunter',
    blurb: 'Long-range homing missile battery. Prioritises flyers; can hit ground too.',
    tier: 4,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    color: '#7dffcf',
    levels: [
      { cost: 250, hp: 320, damage: 40, rate: 0.55, range: 7, shots: 3, splash: 0.6, light: 2.4 },
      { cost: 270, hp: 430, damage: 60, rate: 0.6, range: 7.5, shots: 4, splash: 0.7, light: 2.7 },
      { cost: 480, hp: 570, damage: 92, rate: 0.65, range: 8, shots: 5, splash: 0.8, light: 3 },
    ],
  },
  obelisk: {
    id: 'obelisk',
    name: 'Sun Obelisk',
    blurb: 'Calls down a pillar of sunfire on the mightiest foe in a huge radius.',
    tier: 5,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    color: '#fff1a8',
    levels: [
      { cost: 600, hp: 500, damage: 480, rate: 0.2, range: 9, splash: 1.6, light: 3.6 },
      { cost: 650, hp: 650, damage: 800, rate: 0.23, range: 10, splash: 1.8, light: 4 },
      { cost: 1100, hp: 850, damage: 1350, rate: 0.26, range: 11, splash: 2, light: 4.5 },
    ],
  },
};

export const BUILD_ORDER: BuildingId[] = [
  'wall',
  'arbalest',
  'thorns',
  'harvester',
  'mortar',
  'frost',
  'mire',
  'tesla',
  'pyre',
  'mender',
  'prism',
  'skyhunter',
  'obelisk',
];

export interface CoreLevel {
  upgradeCost: number; // cost to reach this level
  hp: number;
  damage: number;
  rate: number;
  range: number;
  nova: number; // nova blast damage
  light: number;
}

export const CORE_LEVELS: CoreLevel[] = [
  { upgradeCost: 0, hp: 1000, damage: 16, rate: 1.4, range: 4.2, nova: 120, light: 6 },
  { upgradeCost: 260, hp: 1500, damage: 28, rate: 1.5, range: 4.6, nova: 260, light: 6.8 },
  { upgradeCost: 550, hp: 2100, damage: 45, rate: 1.7, range: 5.0, nova: 520, light: 7.6 },
  { upgradeCost: 950, hp: 2800, damage: 70, rate: 1.9, range: 5.4, nova: 950, light: 8.4 },
  { upgradeCost: 1600, hp: 3600, damage: 110, rate: 2.1, range: 5.8, nova: 1600, light: 9.2 },
];

export const NOVA_COOLDOWN = 45;
export const NOVA_RADIUS = 4.8;

export type EnemyId =
  | 'shade'
  | 'skitter'
  | 'wraith'
  | 'brute'
  | 'brood'
  | 'warden'
  | 'carapace'
  | 'colossus'
  | 'wyrm';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  speed: number;
  armor: number;
  bounty: number;
  damage: number; // per attack (vs buildings, and bosses vs the Beacon)
  leak: number; // damage dealt to the Beacon when it reaches it
  attackRate: number;
  radius: number;
  flying: boolean;
  breaker: boolean; // smashes through buildings instead of pathing around
  threat: number; // wave budget cost
  firstWave: number;
  color: string;
  eye: string;
  boss?: boolean;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  shade: {
    id: 'shade', leak: 14, name: 'Shade', hp: 38, speed: 1.05, armor: 0, bounty: 4, damage: 8, attackRate: 1,
    radius: 0.28, flying: false, breaker: false, threat: 1, firstWave: 1, color: '#3b2f5c', eye: '#ff4fd8',
  },
  skitter: {
    id: 'skitter', leak: 7, name: 'Skitter', hp: 16, speed: 2.0, armor: 0, bounty: 2, damage: 4, attackRate: 1.5,
    radius: 0.2, flying: false, breaker: false, threat: 0.5, firstWave: 3, color: '#2a3b4f', eye: '#7cff6b',
  },
  wraith: {
    id: 'wraith', leak: 18, name: 'Wraith', hp: 42, speed: 1.35, armor: 0, bounty: 6, damage: 10, attackRate: 1,
    radius: 0.3, flying: true, breaker: false, threat: 1.6, firstWave: 5, color: '#4a3a7a', eye: '#8ad8ff',
  },
  brute: {
    id: 'brute', leak: 55, name: 'Brute', hp: 190, speed: 0.6, armor: 3, bounty: 14, damage: 34, attackRate: 0.8,
    radius: 0.4, flying: false, breaker: true, threat: 5, firstWave: 6, color: '#4d2a3a', eye: '#ff6a3d',
  },
  brood: {
    id: 'brood', leak: 25, name: 'Broodmother', hp: 95, speed: 0.85, armor: 0, bounty: 7, damage: 10, attackRate: 1,
    radius: 0.36, flying: false, breaker: false, threat: 3, firstWave: 8, color: '#2f4a3a', eye: '#d8ff4f',
  },
  warden: {
    id: 'warden', leak: 28, name: 'Hollow Warden', hp: 80, speed: 0.95, armor: 1, bounty: 12, damage: 6, attackRate: 1,
    radius: 0.32, flying: false, breaker: false, threat: 4, firstWave: 11, color: '#26405a', eye: '#4fffd2',
  },
  carapace: {
    id: 'carapace', leak: 35, name: 'Carapace', hp: 120, speed: 0.8, armor: 9, bounty: 11, damage: 14, attackRate: 1,
    radius: 0.36, flying: false, breaker: false, threat: 4, firstWave: 13, color: '#3a3a44', eye: '#ffd24f',
  },
  colossus: {
    id: 'colossus', leak: 0, name: 'Gloom Colossus', hp: 1050, speed: 0.4, armor: 4, bounty: 220, damage: 60, attackRate: 0.5,
    radius: 0.7, flying: false, breaker: true, threat: 60, firstWave: 10, color: '#2a1838', eye: '#ff2f5f', boss: true,
  },
  wyrm: {
    id: 'wyrm', leak: 0, name: 'Night Wyrm', hp: 1500, speed: 0.55, armor: 2, bounty: 240, damage: 45, attackRate: 0.6,
    radius: 0.65, flying: true, breaker: false, threat: 60, firstWave: 20, color: '#1c2a48', eye: '#6fe8ff', boss: true,
  },
};

export type Difficulty = 'casual' | 'normal' | 'nightmare' | 'sandbox';

export const DIFFICULTY: Record<Difficulty, { label: string; hp: number; budget: number; money: number; desc: string }> = {
  casual: { label: 'Dusk', hp: 0.72, budget: 0.85, money: 1.25, desc: 'Gentler shadows, richer purse.' },
  normal: { label: 'Night', hp: 1, budget: 1, money: 1, desc: 'The intended challenge.' },
  nightmare: { label: 'Nightmare', hp: 1.35, budget: 1.15, money: 0.9, desc: 'For those who have seen the dawn before.' },
  // Sandbox: free building, an unbreakable Beacon, and you choose which night comes next.
  sandbox: { label: 'Sandbox', hp: 1, budget: 1, money: 1, desc: 'Endless aether, no defeat.' },
};

/** Enemy hit point multiplier for a given wave. */
export function hpScale(wave: number): number {
  const w = wave - 1;
  const late = Math.max(0, wave - 8);
  return 1 + 0.06 * w + 0.0095 * w * w + 0.0013 * late * late * late;
}

/** Threat budget for a given wave. */
export function waveBudget(wave: number): number {
  return 5 + 2.6 * wave + 0.15 * wave * wave;
}

/** Bounty multiplier: kills pay slightly more later so economy keeps pace. */
export function bountyScale(wave: number): number {
  return 1 + 0.015 * (wave - 1);
}

/** Waves at which additional rifts open. */
export const RIFT_SCHEDULE = [1, 4, 9, 15, 22, 28];
