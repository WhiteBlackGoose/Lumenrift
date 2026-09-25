import { audio } from '../audio/audio';
import {
  BUILD_ORDER,
  BUILDINGS,
  BuildingId,
  CORE_LEVELS,
  DIFFICULTY,
  Difficulty,
  EnemyId,
  ENEMIES,
  LevelStats,
  NOVA_COOLDOWN,
  VICTORY_WAVE,
} from '../game/config';
import { Building, Game, GameEvent, TargetMode } from '../game/game';
import { drawIcon } from '../render/sprites';
import { loadBest } from './storage';

export interface AppApi {
  game: Game | null;
  placing: BuildingId | null;
  selected: Building | null;
  coreSelected: boolean;
  speed: number;
  paused: boolean;
  touch: boolean;
  difficulty: Difficulty;
  setPlacing(id: BuildingId | null): void;
  deselect(): void;
  selectCore(): void;
  startGame(d: Difficulty): void;
  restart(): void;
  toTitle(): void;
  continueEndless(): void;
  togglePause(force?: boolean): void;
  cycleSpeed(): void;
  callWave(): void;
  nova(): void;
  upgradeCore(): void;
  upgradeSelected(): void;
  sellSelected(): void;
  cycleMode(): void;
}

export const ENEMY_LORE: Record<EnemyId, string> = {
  shade: 'A drifting scrap of night. Common and steady.',
  skitter: 'Fast and fragile. Arrives in skittering swarms.',
  wraith: 'Flies straight over walls toward the Beacon. Needs anti-air.',
  brute: 'Armoured hulk. Smashes through walls instead of walking around them.',
  brood: 'Bloated egg-sac. Bursts into skitters when slain.',
  warden: 'Hooded healer. Mends nearby shadows. Kill it first.',
  carapace: 'Thick plates blunt weak hits. Bring heavy damage or piercing.',
  colossus: 'Boss. Crushes walls and sheds shades as it walks.',
  wyrm: 'Flying boss. Sheds wraiths from its coils.',
};

const MODE_LABEL: Record<TargetMode, string> = { first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' };
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'O'];
export const BUILD_KEYS: Record<string, BuildingId> = Object.fromEntries(BUILD_ORDER.map((id, i) => [KEYS[i], id]));

const SVG = {
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="2" rx="1"/><rect x="4" y="11" width="16" height="2" rx="1"/><rect x="4" y="16" width="16" height="2" rx="1"/></svg>',
  nova: '<svg viewBox="0 0 32 32"><defs><radialGradient id="ng"><stop offset="0" stop-color="#fff8dc"/><stop offset="0.5" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient></defs><circle cx="16" cy="16" r="15" fill="url(#ng)"/><g stroke="#fff3c4" stroke-width="2" stroke-linecap="round"><path d="M16 2v5M16 25v5M2 16h5M25 16h5M6 6l3.5 3.5M22.5 22.5L26 26M6 26l3.5-3.5M22.5 9.5L26 6"/></g></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function iconCanvas(id: BuildingId | EnemyId | 'core', css: number): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(css * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawIcon(ctx, id, css);
  return c;
}

const iconCache = new Map<string, HTMLCanvasElement>();
function cachedIcon(id: BuildingId | EnemyId | 'core', css: number): HTMLCanvasElement {
  const key = id + ':' + css;
  let src = iconCache.get(key);
  if (!src) {
    src = iconCanvas(id, css);
    iconCache.set(key, src);
  }
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

const fmt = (n: number) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.floor(n).toString());
const gem = '<span class="gem"></span>';

export class UI {
  private root: HTMLElement;
  private coreStat!: HTMLElement;
  private coreFill!: HTMLElement;
  private coreNum!: HTMLElement;
  private money!: HTMLElement;
  private nightN!: HTMLElement;
  private callBtn!: HTMLButtonElement;
  private speedBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private soundBtn!: HTMLButtonElement;
  private bossBar!: HTMLElement;
  private preview!: HTMLElement;
  private toasts!: HTMLElement;
  private panel!: HTMLElement;
  private buildBtns = new Map<BuildingId, HTMLButtonElement>();
  private novaBtn!: HTMLButtonElement;
  private beaconBtn!: HTMLButtonElement;
  private tooltip!: HTMLElement;
  private hint!: HTMLElement;
  private hud: HTMLElement[] = [];
  private screen: HTMLElement | null = null;
  private last: Record<string, unknown> = {};
  private seenUnlocked = new Set<BuildingId>();
  private lastErr = '';
  private lastErrT = 0;
  previewCollapsed = window.innerWidth <= 900 || window.innerHeight <= 500;

  constructor(private app: AppApi) {
    this.root = document.getElementById('ui')!;
    this.buildHud();
  }

  // ------------------------------------------------------------------ construction

  private buildHud() {
    const top = el('div');
    top.id = 'hud-top';

    this.coreStat = el('div', 'stat core-stat glass');
    this.coreStat.title = 'The Beacon. If its light fails, the night wins. Click it to upgrade.';
    const ci = cachedIcon('core', 28);
    ci.style.width = ci.style.height = '28px';
    this.coreStat.append(ci);
    const bar = el('div', 'bar');
    this.coreFill = el('i');
    bar.append(this.coreFill);
    this.coreNum = el('span', 'num');
    this.coreStat.append(bar, this.coreNum);
    this.coreStat.addEventListener('click', () => this.app.selectCore());

    const moneyStat = el('div', 'stat glass');
    moneyStat.title = 'Aether — earned by banishing shadows, surviving nights and harvesting crystal.';
    this.money = el('span', 'money');
    moneyStat.append(this.money);

    const night = el('div', 'stat night glass');
    night.innerHTML = `<span class="label">Night</span>`;
    this.nightN = el('span', 'n', '1');
    night.append(this.nightN, el('span', 'of', '/ ' + VICTORY_WAVE));

    this.callBtn = el('button', 'call-btn') as HTMLButtonElement;
    this.callBtn.title = 'Summon the next night early for bonus aether (N)';
    this.callBtn.addEventListener('click', () => this.app.callWave());

    const grp = el('div', 'btn-group');
    this.speedBtn = el('button', 'icon-btn glass') as HTMLButtonElement;
    this.speedBtn.title = 'Game speed (F)';
    this.speedBtn.addEventListener('click', () => this.app.cycleSpeed());
    this.pauseBtn = el('button', 'icon-btn glass', SVG.pause) as HTMLButtonElement;
    this.pauseBtn.title = 'Pause (Space)';
    this.pauseBtn.addEventListener('click', () => this.app.togglePause());
    this.soundBtn = el('button', 'icon-btn glass opt', SVG.sound) as HTMLButtonElement;
    this.soundBtn.title = 'Mute (M)';
    this.soundBtn.addEventListener('click', () => {
      audio.muted = !audio.muted;
    });
    const menuBtn = el('button', 'icon-btn glass', SVG.menu) as HTMLButtonElement;
    menuBtn.title = 'Menu (Esc)';
    menuBtn.addEventListener('click', () => this.showMenu());
    grp.append(this.speedBtn, this.pauseBtn, this.soundBtn, menuBtn);

    top.append(this.coreStat, moneyStat, night, el('div', 'spacer'), this.callBtn, grp);

    this.bossBar = el('div', 'glass hidden');
    this.bossBar.id = 'boss-bar';
    this.bossBar.innerHTML = '<div class="name"></div><div class="bar"><i></i></div>';

    this.preview = el('div', 'glass');
    this.preview.id = 'preview';
    this.preview.addEventListener('click', () => {
      this.previewCollapsed = !this.previewCollapsed;
      this.last.preview = null;
    });

    this.toasts = el('div');
    this.toasts.id = 'toasts';

    this.panel = el('div', 'glass hidden');
    this.panel.id = 'panel';

    const bottom = el('div');
    bottom.id = 'hud-bottom';
    const buildBar = el('div', 'glass');
    buildBar.id = 'build-bar';
    BUILD_ORDER.forEach((id, i) => {
      const b = el('button', 'bbtn') as HTMLButtonElement;
      b.append(cachedIcon(id, 42));
      b.append(el('span', 'cost'));
      b.append(el('span', 'key', KEYS[i]));
      b.addEventListener('click', () => {
        if (!this.app.game) return;
        this.seenUnlocked.add(id);
        if (!this.app.game.isUnlocked(id)) {
          this.toast(`${BUILDINGS[id].name} unlocks at Beacon level ${BUILDINGS[id].tier}`, 'small err');
          audio.play('error');
          return;
        }
        this.app.setPlacing(this.app.placing === id ? null : id);
        audio.play('ui_click');
      });
      b.addEventListener('pointerenter', (ev) => {
        if (ev.pointerType === 'mouse') this.showTip(id, b);
        if (this.app.game?.isUnlocked(id)) this.seenUnlocked.add(id);
      });
      b.addEventListener('pointerleave', () => this.hideTip());
      this.buildBtns.set(id, b);
      buildBar.append(b);
    });

    const abil = el('div', 'glass');
    abil.id = 'abilities';
    this.novaBtn = el('button', 'abtn') as HTMLButtonElement;
    this.novaBtn.innerHTML = `${SVG.nova}<span class="lbl">Nova</span><span class="sub"></span><span class="key">V</span><i class="cd"></i>`;
    this.novaBtn.title = 'Solar Nova: a blast of light around the Beacon that burns and slows every shadow nearby (V)';
    this.novaBtn.addEventListener('click', () => this.app.nova());
    this.beaconBtn = el('button', 'abtn') as HTMLButtonElement;
    const bi = cachedIcon('core', 30);
    bi.style.width = bi.style.height = '30px';
    this.beaconBtn.append(bi);
    this.beaconBtn.insertAdjacentHTML('beforeend', '<span class="lbl">Beacon</span><span class="sub"></span><span class="key">B</span>');
    this.beaconBtn.title = 'Upgrade the Beacon: more health, a stronger Nova and gun, and new structures (B)';
    this.beaconBtn.addEventListener('click', () => this.app.selectCore());
    abil.append(this.novaBtn, this.beaconBtn);
    bottom.append(buildBar, abil);

    this.tooltip = el('div', 'glass hidden');
    this.tooltip.id = 'tooltip';
    this.hint = el('div', 'hint glass hidden');

    this.hud = [top, this.bossBar, this.preview, this.panel, bottom, this.hint];
    this.root.append(top, this.bossBar, this.preview, this.toasts, this.panel, bottom, this.tooltip, this.hint);
  }

  setHudVisible(v: boolean) {
    for (const h of this.hud) h.style.display = v ? '' : 'none';
    if (v) {
      this.last = {};
      this.panel.classList.add('hidden');
    }
  }

  /** Height of the top and bottom HUD bands, so the camera can avoid them. */
  insets(): { top: number; bottom: number } {
    const small = window.innerWidth <= 640 || window.innerHeight <= 500;
    return { top: small ? 52 : 70, bottom: small ? 82 : 104 };
  }

  // ------------------------------------------------------------------ per-frame

  update() {
    const g = this.app.game;
    if (!g) return;
    const set = (key: string, v: unknown, fn: () => void) => {
      if (this.last[key] !== v) {
        this.last[key] = v;
        fn();
      }
    };
    const hpF = Math.max(0, g.coreHp / g.coreMaxHp);
    set('hp', Math.ceil(g.coreHp) + '/' + g.coreMaxHp, () => {
      this.coreFill.style.transform = `scaleX(${hpF})`;
      this.coreNum.textContent = `${Math.ceil(g.coreHp)} / ${g.coreMaxHp}`;
      this.coreStat.classList.toggle('low', hpF < 0.3);
    });
    const m = Math.floor(g.money);
    set('money', m, () => {
      this.money.innerHTML = gem + fmt(m);
    });
    const shownWave = g.phase === 'build' && !g.over ? g.wave + 1 : g.wave;
    set('night', shownWave, () => (this.nightN.textContent = String(shownWave)));

    if (g.phase === 'build') {
      const secs = Math.ceil(g.buildTimer);
      const bonus = Math.floor(g.buildTimer * 1.5);
      set('call', 'b' + secs + ':' + bonus, () => {
        this.callBtn.className = 'call-btn';
        this.callBtn.innerHTML = `<span class="txt">Call night</span><span class="bonus">+${bonus}◆</span><span class="time">${secs}s</span>`;
      });
    } else {
      const left = g.enemies.length + (g.plan ? g.plan.spawns.length : 0) - 0;
      const remaining = g.enemies.length;
      set('call', 'w' + remaining + ':' + left, () => {
        this.callBtn.className = 'call-btn wave';
        this.callBtn.innerHTML = `<span class="txt">Shadows</span><span class="time">${remaining}</span>`;
      });
    }
    set('speed', this.app.speed, () => (this.speedBtn.textContent = this.app.speed + '×'));
    set('paused', this.app.paused, () => {
      this.pauseBtn.innerHTML = this.app.paused ? SVG.play : SVG.pause;
      this.pauseBtn.classList.toggle('active', this.app.paused);
    });
    set('muted', audio.muted, () => (this.soundBtn.innerHTML = audio.muted ? SVG.mute : SVG.sound));

    // build buttons
    for (const [id, btn] of this.buildBtns) {
      const def = BUILDINGS[id];
      const unlocked = g.isUnlocked(id);
      const cost = def.levels[0].cost;
      const poor = g.money < cost;
      const active = this.app.placing === id;
      const fresh = unlocked && def.tier > 1 && !this.seenUnlocked.has(id);
      set('bb' + id, `${unlocked}${poor}${active}${fresh}`, () => {
        btn.classList.toggle('locked', !unlocked);
        btn.classList.toggle('poor', unlocked && poor);
        btn.classList.toggle('active', active);
        btn.classList.toggle('fresh', fresh);
        (btn.querySelector('.cost') as HTMLElement).textContent = unlocked ? String(cost) : `Lv ${def.tier}`;
      });
    }

    // nova
    const cdF = g.novaCd / NOVA_COOLDOWN;
    set('nova', Math.ceil(g.novaCd), () => {
      const ready = g.novaCd <= 0;
      this.novaBtn.classList.toggle('ready', ready);
      (this.novaBtn.querySelector('.sub') as HTMLElement).textContent = ready ? 'Ready' : Math.ceil(g.novaCd) + 's';
    });
    (this.novaBtn.querySelector('.cd') as HTMLElement).style.transform = `scaleY(${cdF})`;
    const cc = g.coreUpgradeCost();
    set('beacon', `${g.coreLevel}:${cc}:${g.money >= (cc ?? 1e9)}`, () => {
      const sub = this.beaconBtn.querySelector('.sub') as HTMLElement;
      sub.innerHTML = cc === null ? 'Max' : `${gem}${cc}`;
      sub.style.color = cc !== null && g.money >= cc ? 'var(--aether)' : '';
      this.beaconBtn.classList.toggle('ready', cc !== null && g.money >= cc);
    });

    // boss bar
    const boss = g.enemies.find((e) => e.def.boss);
    set('boss', boss ? boss.uid + ':' + Math.ceil((boss.hp / boss.maxHp) * 200) : '', () => {
      this.bossBar.classList.toggle('hidden', !boss);
      if (boss) {
        (this.bossBar.querySelector('.name') as HTMLElement).textContent = boss.def.name;
        (this.bossBar.querySelector('.bar > i') as HTMLElement).style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
      }
    });

    // preview of next wave
    const pv = g.phase === 'build' ? g.nextPlan : null;
    set('preview', pv ? pv.wave + ':' + this.previewCollapsed : 'none:' + this.previewCollapsed, () => this.renderPreview(g));

    this.updatePanel(g);
    this.updateHint();
  }

  private renderPreview(g: Game) {
    const p = this.preview;
    const plan = g.phase === 'build' ? g.nextPlan : g.plan;
    p.classList.toggle('collapsed', this.previewCollapsed);
    if (!plan) {
      p.classList.add('hidden');
      return;
    }
    p.classList.remove('hidden');
    p.innerHTML = '';
    const title = el('div', 'title', `<span>${g.phase === 'build' ? 'Coming' : 'Now'}: Night <b>${plan.wave}</b></span><span class="toggle">${this.previewCollapsed ? '▾' : '▴'}</span>`);
    p.append(title);
    if (plan.tag !== 'Night ' + plan.wave) p.append(el('div', 'tag', plan.tag));
    const foes = el('div', 'foes');
    for (const [id, n] of Object.entries(plan.counts) as [EnemyId, number][]) {
      if (!n) continue;
      const f = el('div', 'foe' + (plan.newEnemy === id ? ' new' : ''));
      f.title = `${ENEMIES[id].name}: ${ENEMY_LORE[id]}`;
      f.append(cachedIcon(id, 26), document.createTextNode('×' + n));
      foes.append(f);
    }
    p.append(foes);
    const notes: string[] = [];
    if (plan.newEnemy) notes.push(`New: ${ENEMIES[plan.newEnemy].name}`);
    if (g.phase === 'build' && g.formingRifts().length) notes.push('A new rift will open!');
    if (plan.spawns.some((s) => s.elite > 1)) notes.push('Elite shadows');
    if (notes.length) p.append(el('div', 'note', notes.join(' · ')));
  }

  private updateHint() {
    const placing = this.app.placing;
    set(this, 'hint', placing ?? '', () => {
      if (!placing) {
        this.hint.classList.add('hidden');
        return;
      }
      this.hint.classList.remove('hidden');
      const drag = BUILDINGS[placing].kind === 'wall' || BUILDINGS[placing].kind === 'trap';
      this.hint.innerHTML = this.app.touch
        ? `Tap a tile, then tap again to build <b>${BUILDINGS[placing].name}</b>`
        : `Click to build <b>${BUILDINGS[placing].name}</b>${drag ? ' · drag to paint' : ''} · Right-click / Esc to cancel`;
    });
  }

  // ------------------------------------------------------------------ selection panel

  private updatePanel(g: Game) {
    const b = this.app.selected;
    const core = this.app.coreSelected;
    if (!b && !core) {
      set(this, 'panel', '', () => this.panel.classList.add('hidden'));
      return;
    }
    if (b) {
      const up = g.upgradeCost(b);
      const key = `b${b.uid}:${b.level}:${b.mode}:${up !== null && g.money >= up}:${g.sellValue(b)}:${Math.ceil(b.hp)}:${b.kills}:${g.phase}`;
      set(this, 'panel', key, () => this.renderBuildingPanel(g, b));
    } else {
      const cc = g.coreUpgradeCost();
      const key = `core:${g.coreLevel}:${cc !== null && g.money >= cc}:${Math.ceil(g.coreHp)}`;
      set(this, 'panel', key, () => this.renderCorePanel(g));
    }
  }

  private renderBuildingPanel(g: Game, b: Building) {
    const p = this.panel;
    p.classList.remove('hidden');
    p.innerHTML = '';
    const def = b.def;
    const head = el('div', 'head');
    head.append(cachedIcon(def.id, 48));
    const pips = def.levels.map((_, i) => `<i class="${i <= b.level ? 'on' : ''}"></i>`).join('');
    const info = el('div', '', `<div class="name">${def.name}</div><div class="lvl">Level ${b.level + 1}<span class="pips">${pips}</span></div>`);
    const close = el('button', 'close', '×');
    close.addEventListener('click', () => this.app.deselect());
    head.append(info, close);
    p.append(head);
    p.append(el('div', 'blurb', def.blurb));
    const next = b.level + 1 < def.levels.length ? def.levels[b.level + 1] : null;
    p.append(statsList(def.levels[b.level], next, b.hp));

    const actions = el('div', 'actions');
    const up = g.upgradeCost(b);
    const ub = el('button', 'act primary') as HTMLButtonElement;
    if (up === null) {
      ub.textContent = 'Max level';
      ub.disabled = true;
    } else {
      ub.innerHTML = `Upgrade <span class="c">${gem}${up}</span>`;
      ub.disabled = g.money < up;
      ub.title = 'Upgrade (U)';
      ub.addEventListener('click', () => this.app.upgradeSelected());
    }
    const sb = el('button', 'act sell') as HTMLButtonElement;
    sb.innerHTML = `Sell <span class="c">+${g.sellValue(b)}</span>`;
    sb.title = g.phase === 'build' && b.freshSpend > 0 ? 'Full refund for anything bought this build phase (X)' : 'Sell (X)';
    sb.addEventListener('click', () => this.app.sellSelected());
    actions.append(ub, sb);
    if (def.kind === 'tower' && def.id !== 'obelisk' && def.id !== 'pyre') {
      const mb = el('button', 'act small') as HTMLButtonElement;
      mb.innerHTML = `◎ ${MODE_LABEL[b.mode]}`;
      mb.title = 'Targeting priority (T)';
      mb.addEventListener('click', () => this.app.cycleMode());
      actions.append(mb);
    }
    p.append(actions);
    if (def.kind === 'tower' || def.kind === 'trap' || def.id === 'frost')
      p.append(el('div', 'kills', `<span>Shadows banished: ${b.kills}</span><span>Damage: ${fmt(b.dealt)}</span>`));
  }

  private renderCorePanel(g: Game) {
    const p = this.panel;
    p.classList.remove('hidden');
    p.innerHTML = '';
    const head = el('div', 'head');
    head.append(cachedIcon('core', 48));
    const pips = CORE_LEVELS.map((_, i) => `<i class="${i <= g.coreLevel ? 'on' : ''}"></i>`).join('');
    head.append(el('div', '', `<div class="name">The Beacon</div><div class="lvl">Level ${g.coreLevel + 1}<span class="pips">${pips}</span></div>`));
    const close = el('button', 'close', '×');
    close.addEventListener('click', () => this.app.deselect());
    head.append(close);
    p.append(head);
    p.append(el('div', 'blurb', 'The last light. Its gun, its Nova and the structures you can raise all grow as it ascends.'));
    const C = g.core;
    const N = g.coreLevel + 1 < CORE_LEVELS.length ? CORE_LEVELS[g.coreLevel + 1] : null;
    const dl = el('dl', 'stats');
    const row = (k: string, v: string, nv?: string) => {
      dl.append(el('dt', '', k), el('dd', '', v + (nv && nv !== v ? `<span class="up">→ ${nv}</span>` : '')));
    };
    row('Health', `${Math.ceil(g.coreHp)} / ${C.hp}`, N ? String(N.hp) : undefined);
    row('Gun damage', String(C.damage), N ? String(N.damage) : undefined);
    row('Nova damage', String(C.nova), N ? String(N.nova) : undefined);
    p.append(dl);
    if (N) {
      const unlocks = BUILD_ORDER.filter((id) => BUILDINGS[id].tier === g.coreLevel + 2).map((id) => BUILDINGS[id].name);
      if (unlocks.length) p.append(el('div', 'unlocks', `Unlocks: <b>${unlocks.join(', ')}</b>`));
    }
    const actions = el('div', 'actions');
    const cc = g.coreUpgradeCost();
    const ub = el('button', 'act primary') as HTMLButtonElement;
    if (cc === null) {
      ub.textContent = 'Fully ascended';
      ub.disabled = true;
    } else {
      ub.innerHTML = `Ascend <span class="c">${gem}${cc}</span>`;
      ub.disabled = g.money < cc;
      ub.addEventListener('click', () => this.app.upgradeCore());
    }
    actions.append(ub);
    p.append(actions);
  }

  // ------------------------------------------------------------------ tooltip

  private showTip(id: BuildingId, anchor: HTMLElement) {
    const g = this.app.game;
    const def = BUILDINGS[id];
    const t = this.tooltip;
    t.innerHTML = '';
    t.append(el('div', 'name', `${def.name}<span>${gem}${def.levels[0].cost}</span>`));
    t.append(el('div', 'blurb', def.blurb));
    t.append(statsList(def.levels[0], null));
    if (g && !g.isUnlocked(id)) t.append(el('div', 'lock', `Requires Beacon level ${def.tier}`));
    t.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const w = 250;
    t.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    t.style.bottom = window.innerHeight - r.top + 10 + 'px';
    t.style.top = 'auto';
  }
  hideTip() {
    this.tooltip.classList.add('hidden');
  }

  // ------------------------------------------------------------------ toasts & events

  toast(html: string, cls = 'small info', life = 2.4) {
    const t = el('div', 'toast ' + cls, html);
    t.style.setProperty('--life', life + 's');
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
    setTimeout(() => t.remove(), (life + 0.7) * 1000);
    return t;
  }

  onEvent(ev: GameEvent, g: Game) {
    switch (ev.type) {
      case 'waveStart': {
        const plan = ev.plan;
        const sub = plan.tag !== 'Night ' + plan.wave ? plan.tag : ev.wave === 1 ? 'They come for the light' : '';
        this.toast(`<div class="t1">Night ${ev.wave}</div>${sub ? `<div class="t2">${sub}</div>` : ''}`, 'big' + (plan.boss ? ' boss' : ''), 2);
        if (plan.newEnemy) {
          const id = plan.newEnemy;
          const t = this.toast(`<div><div class="t1">New foe: ${ENEMIES[id].name}</div><div class="t2">${ENEMY_LORE[id]}</div></div>`, 'intro', 5);
          t.prepend(cachedIcon(id, 48));
        }
        this.last.preview = null;
        break;
      }
      case 'waveClear':
        if (!g.over) this.toast(`Night ${ev.wave} survived &nbsp;<span style="color:var(--aether)">+${ev.bonus}◆</span>`, 'small info', 2.6);
        this.last.preview = null;
        break;
      case 'riftOpen':
        this.toast('A new rift tears open!', 'small err', 3);
        break;
      case 'bossSpawn':
        this.toast(`<div class="t1">${ENEMIES[ev.enemy].name}</div><div class="t2">${ENEMY_LORE[ev.enemy]}</div>`, 'big boss', 3);
        break;
      case 'coreUp': {
        const unlocks = BUILD_ORDER.filter((id) => BUILDINGS[id].tier === ev.level + 1).map((id) => BUILDINGS[id].name);
        this.toast(
          `<div class="t1">The Beacon Ascends</div><div class="t2">${unlocks.length ? 'Unlocked: ' + unlocks.join(' · ') : 'Level ' + (ev.level + 1)}</div>`,
          'big',
          2.8,
        );
        break;
      }
      case 'destroyed':
        this.toast(`${BUILDINGS[ev.id].name} destroyed!`, 'small err', 1.8);
        break;
      case 'error': {
        const now = performance.now();
        if (ev.msg !== this.lastErr || now - this.lastErrT > 1200) {
          this.toast(ev.msg, 'small err', 1.4);
          this.lastErr = ev.msg;
          this.lastErrT = now;
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ screens

  private showScreen(card: HTMLElement, dismissOnBackdrop = false) {
    this.closeScreen();
    const s = el('div', 'screen');
    s.append(card);
    if (dismissOnBackdrop)
      s.addEventListener('pointerdown', (e) => {
        if (e.target === s) {
          this.closeScreen();
          this.app.togglePause(false);
        }
      });
    this.root.append(s);
    this.screen = s;
  }

  closeScreen() {
    this.screen?.remove();
    this.screen = null;
  }

  get screenOpen() {
    return !!this.screen;
  }

  showTitle() {
    this.hideTip();
    const card = el('div', 'card glass');
    card.append(el('div', 'logo', 'LUMEN'), el('div', 'tagline', 'Hold the light through thirty nights'));
    const best = loadBest();
    const diffs = el('div', 'diffs');
    let chosen: Difficulty = this.app.difficulty;
    const cards: HTMLElement[] = [];
    (Object.keys(DIFFICULTY) as Difficulty[]).forEach((d) => {
      const D = DIFFICULTY[d];
      const c = el('button', 'diff' + (d === chosen ? ' sel' : ''));
      c.innerHTML = `<div class="dn">${D.label}</div><div class="dd">${D.desc}</div><div class="best">${best[d] ? 'Best: night ' + best[d] + (best[d]! >= VICTORY_WAVE ? ' ☀' : '') : ''}</div>`;
      c.addEventListener('click', () => {
        chosen = d;
        cards.forEach((x) => x.classList.remove('sel'));
        c.classList.add('sel');
        audio.unlock();
        audio.play('ui_click');
      });
      cards.push(c);
      diffs.append(c);
    });
    card.append(diffs);
    const go = el('button', 'big-btn', 'Light the Beacon');
    go.addEventListener('click', () => {
      audio.unlock();
      this.app.startGame(chosen);
    });
    card.append(go);
    const links = el('div', 'link-row');
    const how = el('button', 'link-btn', 'How to play');
    how.addEventListener('click', () => this.showHelp(() => this.showTitle()));
    const set_ = el('button', 'link-btn', 'Sound settings');
    set_.addEventListener('click', () => this.showSettings(() => this.showTitle()));
    links.append(how, set_);
    card.append(links);
    this.showScreen(card);
  }

  showMenu() {
    if (!this.app.game || this.app.game.over) return;
    this.app.togglePause(true);
    const card = el('div', 'card glass');
    card.append(el('div', 'over-title win', 'Paused'));
    card.append(el('div', 'over-sub', `Night ${this.app.game.wave} · ${DIFFICULTY[this.app.game.difficulty].label}`));
    const col = el('div', '');
    col.style.display = 'grid';
    col.style.gap = '10px';
    const resume = el('button', 'big-btn', 'Resume');
    resume.addEventListener('click', () => {
      this.closeScreen();
      this.app.togglePause(false);
    });
    const restart = el('button', 'big-btn alt', 'Restart');
    restart.className = 'big-btn';
    restart.style.cssText = 'background:rgba(255,255,255,.07);color:var(--text);box-shadow:none;border:1px solid rgba(255,255,255,.14);font-size:16px';
    restart.addEventListener('click', () => this.app.restart());
    const quit = restart.cloneNode() as HTMLButtonElement;
    quit.textContent = 'Quit to title';
    quit.addEventListener('click', () => this.app.toTitle());
    col.append(resume, restart, quit);
    card.append(col);
    const links = el('div', 'link-row');
    const how = el('button', 'link-btn', 'How to play');
    how.addEventListener('click', () => this.showHelp(() => this.showMenu()));
    const st = el('button', 'link-btn', 'Sound settings');
    st.addEventListener('click', () => this.showSettings(() => this.showMenu()));
    links.append(how, st);
    card.append(links);
    this.showScreen(card, true);
  }

  showHelp(back: () => void) {
    const card = el('div', 'card glass');
    const touch = this.app.touch;
    card.innerHTML = `<div class="over-title win" style="font-size:30px">How to Play</div>
    <div class="help">
      <p>Shadows crawl out of <b>rifts</b> at the edge of the world and hunt the <b>Beacon</b> at its heart. Every shadow that reaches it dims the light. If the light fails, the night wins. Survive <b>${VICTORY_WAVE} nights</b> to see the dawn.</p>
      <h3>Building</h3>
      <ul>
        <li>Pick a structure from the bottom bar, then ${touch ? '<b>tap a tile</b> and <b>tap it again</b> to build' : '<b>click</b> a tile (drag to paint walls and traps)'}.</li>
        <li>Shadows walk the shortest open path, shown by the <b style="color:#ff8adf">pink trail</b>. Use <b>Bulwarks</b> and towers to force a longer route through your killing zone, but you can never seal the path completely.</li>
        <li><b>Brutes</b> and the <b>Colossus</b> smash through walls instead of going around them. <b>Flyers</b> ignore walls entirely.</li>
        <li>Build <b>Harvesters</b> on glowing crystal veins. They pay out every night you survive.</li>
        <li>Ascend the <b>Beacon</b> to unlock stronger structures. Select any structure to upgrade it or sell it. Anything bought during the current build phase is refunded in full.</li>
      </ul>
      <h3>Between nights</h3>
      <p>Build during the countdown, or call the next night early for bonus aether. The panel on the left previews what's coming. Unleash the <b>Nova</b> when shadows get close to the Beacon.</p>
      ${
        touch
          ? '<h3>Touch</h3><p>Drag to pan and pinch to zoom. Tap a structure to select it.</p>'
          : `<h3>Keys</h3><p><kbd>1</kbd>–<kbd>=</kbd> structures · <kbd>U</kbd> upgrade · <kbd>X</kbd> sell · <kbd>T</kbd> targeting · <kbd>V</kbd> Nova · <kbd>B</kbd> Beacon · <kbd>N</kbd> call night · <kbd>Space</kbd> pause · <kbd>F</kbd> speed · <kbd>M</kbd> mute · Wheel zooms · Right-drag pans</p>`
      }
      <h3>Bestiary</h3>
      <div class="bestiary"></div>
    </div>`;
    const best = card.querySelector('.bestiary')!;
    for (const id of Object.keys(ENEMIES) as EnemyId[]) {
      const b = el('div', 'b');
      b.append(cachedIcon(id, 36));
      b.append(el('div', '', `<b>${ENEMIES[id].name}</b>${ENEMY_LORE[id]}`));
      best.append(b);
    }
    const back_ = el('button', 'big-btn', 'Back');
    back_.style.marginTop = '18px';
    back_.addEventListener('click', back);
    card.append(back_);
    this.showScreen(card);
  }

  showSettings(back: () => void) {
    const card = el('div', 'card glass');
    card.append(el('div', 'over-title win', 'Sound'));
    card.style.width = 'min(420px, 100%)';
    const s = el('div', 'settings');
    const slider = (label: string, get: () => number, setv: (v: number) => void) => {
      const i = el('input') as HTMLInputElement;
      i.type = 'range';
      i.min = '0';
      i.max = '100';
      i.value = String(Math.round(get() * 100));
      i.addEventListener('input', () => {
        audio.unlock();
        setv(Number(i.value) / 100);
      });
      s.append(el('label', '', label), i);
    };
    slider('Music', () => audio.musicVolume, (v) => (audio.musicVolume = v));
    slider('Effects', () => audio.sfxVolume, (v) => {
      audio.sfxVolume = v;
      audio.play('build');
    });
    const mute = el('input') as HTMLInputElement;
    mute.type = 'checkbox';
    mute.checked = audio.muted;
    mute.addEventListener('change', () => (audio.muted = mute.checked));
    s.append(el('label', '', 'Mute all'), mute);
    card.append(s);
    const b = el('button', 'big-btn', 'Back');
    b.addEventListener('click', back);
    card.append(b);
    this.showScreen(card);
  }

  showGameOver(g: Game, won: boolean, newBest: boolean) {
    this.hideTip();
    const card = el('div', 'card glass');
    card.append(el('div', 'over-title' + (won ? ' win' : ''), won ? 'Dawn Breaks' : 'The Light Fades'));
    card.append(
      el(
        'div',
        'over-sub',
        won
          ? `You kept the Beacon alight through ${VICTORY_WAVE} nights.${newBest ? ' A new record!' : ''}`
          : `The shadows swallowed the Beacon on night ${g.wave}.${newBest ? ' Still, a new record!' : ''}`,
      ),
    );
    const sum = el('div', 'summary');
    sum.innerHTML = `<div><b>${won ? g.wave : g.wave - 1}</b><span>Nights survived</span></div><div><b>${fmt(g.stats.kills)}</b><span>Shadows banished</span></div><div><b>${fmt(g.stats.earned)}</b><span>Aether earned</span></div>`;
    card.append(sum);
    const row = el('div', 'row-btns');
    if (won) {
      const cont = el('button', 'big-btn', 'Endless night');
      cont.style.fontSize = '16px';
      cont.addEventListener('click', () => {
        this.closeScreen();
        this.app.continueEndless();
      });
      row.append(cont);
    }
    const again = el('button', 'big-btn' + (won ? ' alt' : ''), 'Try again');
    again.addEventListener('click', () => this.app.restart());
    const title = el('button', 'big-btn alt', 'Title');
    title.addEventListener('click', () => this.app.toTitle());
    row.append(again, title);
    card.append(row);
    this.showScreen(card);
  }
}

function set(ui: UI, key: string, v: unknown, fn: () => void) {
  const last = (ui as unknown as { last: Record<string, unknown> }).last;
  if (last[key] !== v) {
    last[key] = v;
    fn();
  }
}

function statsList(L: LevelStats, N: LevelStats | null, hp?: number): HTMLElement {
  const dl = el('dl', 'stats');
  const row = (k: string, v: number | undefined, nv: number | undefined, fmtv: (n: number) => string = (n) => String(n)) => {
    if (v === undefined || (v === 0 && !nv)) return;
    const up = N && nv !== undefined && nv !== v ? `<span class="up">→ ${fmtv(nv)}</span>` : '';
    dl.append(el('dt', '', k), el('dd', '', fmtv(v) + up));
  };
  const pct = (n: number) => Math.round(n * 100) + '%';
  const one = (n: number) => (Math.round(n * 10) / 10).toString();
  row('Damage', L.damage, N?.damage);
  if (L.rate && L.damage) row('DPS', L.damage * L.rate * (L.shots ?? 1), N ? (N.damage ?? 0) * (N.rate ?? 0) * (N.shots ?? 1) : undefined, one);
  row('Range', L.range, N?.range, one);
  row('Splash', L.splash, N?.splash, one);
  row('Chain', L.chain, N?.chain);
  row('Missiles', L.shots, N?.shots);
  row('Slow', L.slow, N?.slow, pct);
  row('Burn', L.burn, N?.burn);
  row('Heal/s', L.heal, N?.heal);
  row('Income', L.income, N?.income);
  if (L.hp > 1) {
    const cur = hp !== undefined ? `${Math.ceil(hp)} / ${L.hp}` : String(L.hp);
    dl.append(el('dt', '', 'Health'), el('dd', '', cur + (N && N.hp !== L.hp ? `<span class="up">→ ${N.hp}</span>` : '')));
  }
  return dl;
}
