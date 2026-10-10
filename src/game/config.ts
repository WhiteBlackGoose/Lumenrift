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

/** The two campaigns: the original night defence and the sunlit Sanctum. */
export type Realm = 'night' | 'day';

export type BuildingId =
  // night
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
  | 'obelisk'
  // day
  | 'colonnade'
  | 'javelin'
  | 'glyph'
  | 'aviary'
  | 'bell'
  | 'windcatcher'
  | 'snare'
  | 'halo'
  | 'fountain'
  | 'falconry'
  | 'lens'
  | 'ballista'
  | 'titan';

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
  shots?: number; // projectiles per volley (falconry: max falcons aloft; halo: blades)
  pierce?: number; // javelin: enemies hit per throw
  push?: number; // windcatcher: knockback distance in tiles
  stun?: number; // seconds of stun (snare, titan)
  buff?: number; // fountain: attack-speed bonus for nearby towers
  duration?: number; // falconry: seconds a falcon hunts
  execute?: number; // ballista: double damage below this hp fraction
  light: number;
}

export interface BuildingDef {
  id: BuildingId;
  realm: Realm;
  /** No targeting-priority button (auto-aims at clusters / fixed behaviour). */
  noTargeting?: boolean;
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
    realm: 'night',
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
    realm: 'night',
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
    realm: 'night',
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
    realm: 'night',
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
    realm: 'night',
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
    realm: 'night',
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
    realm: 'night',
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
    realm: 'night',
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
    realm: 'night',
    noTargeting: true,
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
    realm: 'night',
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
    realm: 'night',
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
    realm: 'night',
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
    realm: 'night',
    noTargeting: true,
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

  // ======================================================================= day realm
  colonnade: {
    id: 'colonnade',
    realm: 'day',
    name: 'Colonnade',
    blurb: 'Marble pillars that bend the path of the Blight. Boars will smash them.',
    tier: 1,
    kind: 'wall',
    blocks: true,
    targets: 'none',
    color: '#e9e2cf',
    levels: [
      { cost: 10, hp: 320, light: 0 },
      { cost: 20, hp: 750, light: 0 },
      { cost: 45, hp: 1700, light: 0.6 },
    ],
  },
  javelin: {
    id: 'javelin',
    realm: 'day',
    name: 'Plume Sentinel',
    blurb: 'A winged statue that hurls javelins straight through several foes in a line.',
    tier: 1,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    color: '#f2c66d',
    levels: [
      { cost: 55, hp: 240, damage: 13, rate: 1.0, range: 4.4, pierce: 2, light: 1.6 },
      { cost: 70, hp: 330, damage: 22, rate: 1.15, range: 4.7, pierce: 3, light: 1.8 },
      { cost: 140, hp: 460, damage: 38, rate: 1.3, range: 5.1, pierce: 3, light: 2 },
    ],
  },
  glyph: {
    id: 'glyph',
    realm: 'day',
    name: 'Sun Glyph',
    blurb: 'A rune set into the paving. It flares in a burst of light when trodden on.',
    tier: 1,
    kind: 'trap',
    blocks: false,
    targets: 'ground',
    noTargeting: true,
    color: '#ffd76a',
    levels: [
      { cost: 35, hp: 1, damage: 34, rate: 0.9, splash: 1.0, light: 0.6 },
      { cost: 50, hp: 1, damage: 60, rate: 0.95, splash: 1.15, light: 0.8 },
      { cost: 100, hp: 1, damage: 105, rate: 1.0, splash: 1.3, light: 1 },
    ],
  },
  aviary: {
    id: 'aviary',
    realm: 'day',
    name: 'Aviary',
    blurb: 'Doves gather golden plumes from the meadow. Pays out each day survived. Must stand on a flower meadow.',
    tier: 1,
    kind: 'eco',
    blocks: true,
    targets: 'none',
    onlyOn: 'crystal',
    color: '#fff1c9',
    levels: [
      { cost: 100, hp: 260, income: 26, light: 1.2 },
      { cost: 120, hp: 360, income: 54, light: 1.4 },
      { cost: 200, hp: 520, income: 90, light: 1.6 },
    ],
  },
  bell: {
    id: 'bell',
    realm: 'day',
    name: 'Resonance Bell',
    blurb: 'Its toll sends a shockwave rolling out in every direction, striking ground and air alike.',
    tier: 2,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    noTargeting: true,
    color: '#e8b04a',
    levels: [
      { cost: 100, hp: 300, damage: 24, rate: 0.55, range: 2.6, light: 1.8 },
      { cost: 120, hp: 400, damage: 42, rate: 0.6, range: 2.9, light: 2 },
      { cost: 230, hp: 540, damage: 74, rate: 0.65, range: 3.2, light: 2.2 },
    ],
  },
  windcatcher: {
    id: 'windcatcher',
    realm: 'day',
    name: 'Windcatcher',
    blurb: 'Gathers the sky winds and blasts a foe backwards, buying precious time.',
    tier: 2,
    kind: 'tower',
    blocks: true,
    targets: 'ground',
    color: '#9fe3ff',
    levels: [
      { cost: 90, hp: 260, damage: 6, rate: 0.45, range: 3.4, push: 1.0, light: 1.4 },
      { cost: 100, hp: 350, damage: 12, rate: 0.55, range: 3.8, push: 1.3, light: 1.6 },
      { cost: 190, hp: 470, damage: 22, rate: 0.65, range: 4.2, push: 1.6, light: 1.8 },
    ],
  },
  snare: {
    id: 'snare',
    realm: 'day',
    name: 'Honey Snare',
    blurb: 'A golden, sticky trap. Roots whatever steps in it, then slowly refills.',
    tier: 2,
    kind: 'trap',
    blocks: false,
    targets: 'ground',
    noTargeting: true,
    color: '#ffb84d',
    levels: [
      { cost: 40, hp: 1, damage: 0, rate: 0.35, stun: 1.2, light: 0.5 },
      { cost: 55, hp: 1, damage: 6, rate: 0.4, stun: 1.6, light: 0.6 },
      { cost: 95, hp: 1, damage: 14, rate: 0.5, stun: 2.0, light: 0.8 },
    ],
  },
  halo: {
    id: 'halo',
    realm: 'day',
    name: 'Halo Ring',
    blurb: 'Blades of light orbit the spire and cut everything that comes near.',
    tier: 3,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    noTargeting: true,
    color: '#fff3b0',
    levels: [
      { cost: 160, hp: 340, damage: 30, range: 1.7, shots: 3, light: 2 },
      { cost: 180, hp: 450, damage: 50, range: 1.9, shots: 4, light: 2.2 },
      { cost: 330, hp: 600, damage: 85, range: 2.1, shots: 5, light: 2.4 },
    ],
  },
  fountain: {
    id: 'fountain',
    realm: 'day',
    name: 'Fountain of Mending',
    blurb: 'Restores nearby structures and quickens every tower within reach of its spray.',
    tier: 3,
    kind: 'support',
    blocks: true,
    targets: 'none',
    noTargeting: true,
    color: '#8fe0ff',
    levels: [
      { cost: 130, hp: 280, heal: 12, range: 3.0, buff: 0.15, light: 1.6 },
      { cost: 140, hp: 370, heal: 22, range: 3.4, buff: 0.25, light: 1.8 },
      { cost: 260, hp: 500, heal: 40, range: 3.8, buff: 0.35, light: 2 },
    ],
  },
  falconry: {
    id: 'falconry',
    realm: 'day',
    name: 'Falcon Roost',
    blurb: 'Looses trained falcons that hunt on their own. They go for flyers first.',
    tier: 3,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    noTargeting: true,
    color: '#d9a066',
    levels: [
      { cost: 180, hp: 320, damage: 15, rate: 0.45, range: 5.5, shots: 2, duration: 6, light: 1.6 },
      { cost: 200, hp: 420, damage: 25, rate: 0.5, range: 6, shots: 3, duration: 6, light: 1.8 },
      { cost: 360, hp: 560, damage: 42, rate: 0.55, range: 6.5, shots: 3, duration: 7, light: 2 },
    ],
  },
  lens: {
    id: 'lens',
    realm: 'day',
    name: 'Sun Lens',
    blurb: 'Focuses sunlight into a searing beam that burns everything along its line.',
    tier: 4,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    color: '#ffe27a',
    levels: [
      { cost: 280, hp: 360, damage: 38, range: 5.0, light: 2.4 },
      { cost: 300, hp: 480, damage: 62, range: 5.4, light: 2.7 },
      { cost: 520, hp: 640, damage: 100, range: 5.8, light: 3 },
    ],
  },
  ballista: {
    id: 'ballista',
    realm: 'day',
    name: 'Dawn Ballista',
    blurb: 'A great bow with a long reach. Its bolts pierce armour and finish off the wounded.',
    tier: 4,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    color: '#c9a46a',
    levels: [
      { cost: 260, hp: 340, damage: 120, rate: 0.35, range: 7.5, execute: 0.3, light: 1.8 },
      { cost: 280, hp: 450, damage: 200, rate: 0.38, range: 8, execute: 0.3, light: 2 },
      { cost: 500, hp: 600, damage: 380, rate: 0.42, range: 8.5, execute: 0.35, light: 2.2 },
    ],
  },
  titan: {
    id: 'titan',
    realm: 'day',
    name: 'Winged Titan',
    blurb: 'A colossal guardian that leaps onto the thickest crowd of foes and stuns them with a great slam.',
    tier: 5,
    kind: 'tower',
    blocks: true,
    targets: 'both',
    noTargeting: true,
    color: '#fff6dc',
    levels: [
      { cost: 650, hp: 520, damage: 420, rate: 0.15, range: 9, splash: 1.9, stun: 1.0, light: 3 },
      { cost: 700, hp: 680, damage: 700, rate: 0.17, range: 10, splash: 2.1, stun: 1.3, light: 3.3 },
      { cost: 1150, hp: 880, damage: 1150, rate: 0.19, range: 11, splash: 2.3, stun: 1.6, light: 3.6 },
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

export const BUILD_ORDER_DAY: BuildingId[] = [
  'colonnade',
  'javelin',
  'glyph',
  'aviary',
  'bell',
  'windcatcher',
  'snare',
  'halo',
  'fountain',
  'falconry',
  'lens',
  'ballista',
  'titan',
];

export interface CoreLevel {
  upgradeCost: number; // cost to reach this level
  hp: number;
  damage: number;
  rate: number;
  range: number;
  nova: number; // core ability damage (Nova at night, Daybreak by day)
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

/** The Sanctum (day realm core). */
export const CORE_LEVELS_DAY: CoreLevel[] = [
  { upgradeCost: 0, hp: 1100, damage: 14, rate: 1.6, range: 4.4, nova: 90, light: 6 },
  { upgradeCost: 280, hp: 1600, damage: 26, rate: 1.75, range: 4.8, nova: 200, light: 6.8 },
  { upgradeCost: 600, hp: 2250, damage: 42, rate: 1.9, range: 5.2, nova: 420, light: 7.6 },
  { upgradeCost: 1000, hp: 3000, damage: 66, rate: 2.1, range: 5.6, nova: 800, light: 8.4 },
  { upgradeCost: 1700, hp: 3800, damage: 104, rate: 2.3, range: 6.0, nova: 1400, light: 9.2 },
];

export type EnemyId =
  // night
  | 'shade'
  | 'skitter'
  | 'wraith'
  | 'brute'
  | 'brood'
  | 'warden'
  | 'carapace'
  | 'colossus'
  | 'wyrm'
  // day (the Blight)
  | 'rotling'
  | 'gnat'
  | 'moth'
  | 'boar'
  | 'sporemother'
  | 'mossweaver'
  | 'husk'
  | 'behemoth'
  | 'roc';

/** What an enemy does, independent of its looks. Waves and abilities are driven by role, not by id. */
export type EnemyRole = 'basic' | 'fast' | 'flyer' | 'breaker' | 'splitter' | 'healer' | 'armored' | 'bossGround' | 'bossAir';

export interface EnemyDef {
  id: EnemyId;
  realm: Realm;
  role: EnemyRole;
  /** Splitters: what they burst into. Bosses: what they shed while walking. */
  spawns?: { id: EnemyId; n: number; every?: number };
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
    id: 'shade', realm: 'night', role: 'basic', leak: 14, name: 'Shade', hp: 38, speed: 1.05, armor: 0, bounty: 4, damage: 8, attackRate: 1,
    radius: 0.28, flying: false, breaker: false, threat: 1, firstWave: 1, color: '#3b2f5c', eye: '#ff4fd8',
  },
  skitter: {
    id: 'skitter', realm: 'night', role: 'fast', leak: 7, name: 'Skitter', hp: 16, speed: 2.0, armor: 0, bounty: 2, damage: 4, attackRate: 1.5,
    radius: 0.2, flying: false, breaker: false, threat: 0.5, firstWave: 3, color: '#2a3b4f', eye: '#7cff6b',
  },
  wraith: {
    id: 'wraith', realm: 'night', role: 'flyer', leak: 18, name: 'Wraith', hp: 42, speed: 1.35, armor: 0, bounty: 6, damage: 10, attackRate: 1,
    radius: 0.3, flying: true, breaker: false, threat: 1.6, firstWave: 5, color: '#4a3a7a', eye: '#8ad8ff',
  },
  brute: {
    id: 'brute', realm: 'night', role: 'breaker', leak: 55, name: 'Brute', hp: 190, speed: 0.6, armor: 3, bounty: 14, damage: 34, attackRate: 0.8,
    radius: 0.4, flying: false, breaker: true, threat: 5, firstWave: 6, color: '#4d2a3a', eye: '#ff6a3d',
  },
  brood: {
    id: 'brood', realm: 'night', role: 'splitter', spawns: { id: 'skitter', n: 3 }, leak: 25, name: 'Broodmother', hp: 95, speed: 0.85, armor: 0, bounty: 7, damage: 10, attackRate: 1,
    radius: 0.36, flying: false, breaker: false, threat: 3, firstWave: 8, color: '#2f4a3a', eye: '#d8ff4f',
  },
  warden: {
    id: 'warden', realm: 'night', role: 'healer', leak: 28, name: 'Hollow Warden', hp: 80, speed: 0.95, armor: 1, bounty: 12, damage: 6, attackRate: 1,
    radius: 0.32, flying: false, breaker: false, threat: 4, firstWave: 11, color: '#26405a', eye: '#4fffd2',
  },
  carapace: {
    id: 'carapace', realm: 'night', role: 'armored', leak: 35, name: 'Carapace', hp: 120, speed: 0.8, armor: 9, bounty: 11, damage: 14, attackRate: 1,
    radius: 0.36, flying: false, breaker: false, threat: 4, firstWave: 13, color: '#3a3a44', eye: '#ffd24f',
  },
  colossus: {
    id: 'colossus', realm: 'night', role: 'bossGround', spawns: { id: 'shade', n: 3, every: 7 }, leak: 0, name: 'Gloom Colossus', hp: 1050, speed: 0.4, armor: 4, bounty: 220, damage: 60, attackRate: 0.5,
    radius: 0.7, flying: false, breaker: true, threat: 60, firstWave: 10, color: '#2a1838', eye: '#ff2f5f', boss: true,
  },
  wyrm: {
    id: 'wyrm', realm: 'night', role: 'bossAir', spawns: { id: 'wraith', n: 2, every: 6 }, leak: 0, name: 'Night Wyrm', hp: 1500, speed: 0.55, armor: 2, bounty: 240, damage: 45, attackRate: 0.6,
    radius: 0.65, flying: true, breaker: false, threat: 60, firstWave: 20, color: '#1c2a48', eye: '#6fe8ff', boss: true,
  },
  // ======================================================================= day realm: the Blight
  rotling: {
    id: 'rotling', realm: 'day', role: 'basic', leak: 13, name: 'Rotling', hp: 40, speed: 0.95, armor: 0, bounty: 4, damage: 8, attackRate: 1,
    radius: 0.28, flying: false, breaker: false, threat: 1, firstWave: 1, color: '#6b7a3a', eye: '#d6ff5c',
  },
  gnat: {
    id: 'gnat', realm: 'day', role: 'fast', leak: 5, name: 'Gnat Swarm', hp: 12, speed: 2.4, armor: 0, bounty: 2, damage: 3, attackRate: 1.6,
    radius: 0.18, flying: false, breaker: false, threat: 0.4, firstWave: 3, color: '#4f5a2a', eye: '#ffe14d',
  },
  moth: {
    id: 'moth', realm: 'day', role: 'flyer', leak: 16, name: 'Plague Moth', hp: 46, speed: 1.25, armor: 0, bounty: 6, damage: 9, attackRate: 1,
    radius: 0.3, flying: true, breaker: false, threat: 1.6, firstWave: 5, color: '#7a5a8a', eye: '#c8ff6a',
  },
  boar: {
    id: 'boar', realm: 'day', role: 'breaker', leak: 50, name: 'Thornback Boar', hp: 220, speed: 0.7, armor: 2, bounty: 15, damage: 40, attackRate: 0.8,
    radius: 0.4, flying: false, breaker: true, threat: 5, firstWave: 7, color: '#5a3a2a', eye: '#ff7a3d',
  },
  sporemother: {
    id: 'sporemother', realm: 'day', role: 'splitter', spawns: { id: 'gnat', n: 5 }, leak: 24, name: 'Spore Mother', hp: 110, speed: 0.8, armor: 0, bounty: 8, damage: 10, attackRate: 1,
    radius: 0.38, flying: false, breaker: false, threat: 3, firstWave: 9, color: '#6a7a4a', eye: '#ffef7a',
  },
  mossweaver: {
    id: 'mossweaver', realm: 'day', role: 'healer', leak: 26, name: 'Mossweaver', hp: 75, speed: 0.9, armor: 0, bounty: 12, damage: 6, attackRate: 1,
    radius: 0.32, flying: false, breaker: false, threat: 4, firstWave: 12, color: '#3f6a4a', eye: '#7dffb0',
  },
  husk: {
    id: 'husk', realm: 'day', role: 'armored', leak: 34, name: 'Husk Beetle', hp: 105, speed: 0.85, armor: 10, bounty: 11, damage: 14, attackRate: 1,
    radius: 0.36, flying: false, breaker: false, threat: 4, firstWave: 14, color: '#4a4230', eye: '#ffb84d',
  },
  behemoth: {
    id: 'behemoth', realm: 'day', role: 'bossGround', spawns: { id: 'rotling', n: 3, every: 7 }, leak: 0, name: 'Bramble Behemoth', hp: 1200, speed: 0.38, armor: 5, bounty: 230, damage: 65, attackRate: 0.5,
    radius: 0.72, flying: false, breaker: true, threat: 60, firstWave: 10, color: '#3a4a22', eye: '#ff5a3d', boss: true,
  },
  roc: {
    id: 'roc', realm: 'day', role: 'bossAir', spawns: { id: 'moth', n: 2, every: 6 }, leak: 0, name: 'Plague Roc', hp: 1350, speed: 0.6, armor: 1, bounty: 250, damage: 50, attackRate: 0.6,
    radius: 0.66, flying: true, breaker: false, threat: 60, firstWave: 20, color: '#4a3a4a', eye: '#d6ff5c', boss: true,
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

/** Everything that differs between the two campaigns. */
export interface RealmDef {
  buildOrder: BuildingId[];
  coreLevels: CoreLevel[];
  abilityCooldown: number;
  abilityRadius: number;
  /** Night's Nova slows; day's Daybreak stuns. */
  abilityStun: number;
  startMoney: number;
  riftSchedule: number[];
  wallId: BuildingId;
  ecoId: BuildingId;
  /** Regular enemies in wave rotation (bosses are picked by role). */
  regular: EnemyId[];
  weights: Partial<Record<EnemyId, number>>;
}

export const REALMS: Record<Realm, RealmDef> = {
  night: {
    buildOrder: BUILD_ORDER,
    coreLevels: CORE_LEVELS,
    abilityCooldown: NOVA_COOLDOWN,
    abilityRadius: NOVA_RADIUS,
    abilityStun: 0,
    startMoney: START_MONEY,
    riftSchedule: RIFT_SCHEDULE,
    wallId: 'wall',
    ecoId: 'harvester',
    regular: ['shade', 'skitter', 'wraith', 'brute', 'brood', 'warden', 'carapace'],
    weights: { shade: 10, skitter: 5, wraith: 4, brute: 3, brood: 3, warden: 2, carapace: 3 },
  },
  day: {
    buildOrder: BUILD_ORDER_DAY,
    coreLevels: CORE_LEVELS_DAY,
    abilityCooldown: 40,
    abilityRadius: 5.2,
    abilityStun: 1.6,
    startMoney: 280,
    riftSchedule: [1, 3, 8, 14, 21, 27],
    wallId: 'colonnade',
    ecoId: 'aviary',
    regular: ['rotling', 'gnat', 'moth', 'boar', 'sporemother', 'mossweaver', 'husk'],
    weights: { rotling: 10, gnat: 6, moth: 4, boar: 3, sporemother: 3, mossweaver: 2, husk: 3 },
  },
};

/** Find the enemy of a realm that plays a given role. */
export function enemyByRole(realm: Realm, role: EnemyRole): EnemyId {
  return (Object.values(ENEMIES).find((e) => e.realm === realm && e.role === role) ?? ENEMIES.shade).id;
}
