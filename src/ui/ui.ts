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
import { Building, Game, GameEvent } from '../game/game';
import { drawIcon } from '../render/sprites';
import { lang, LANG_ORDER, LANGS, Lang, setLang, StringKey, t } from '../i18n';
import { listSessions, SessionMeta } from './sessions';
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
  readonly inAttract: boolean;
  setPlacing(id: BuildingId | null): void;
  deselect(): void;
  selectCore(): void;
  startGame(d: Difficulty): void;
  resumeSession(id: string): void;
  deleteSession(id: string): void;
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
    this.coreStat.title = t('hud.coreTip');
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
    moneyStat.title = t('hud.moneyTip');
    this.money = el('span', 'money');
    moneyStat.append(this.money);

    const night = el('div', 'stat night glass');
    night.innerHTML = `<span class="label">${t('hud.night')}</span>`;
    this.nightN = el('span', 'n', '1');
    night.append(this.nightN, el('span', 'of', '/ ' + VICTORY_WAVE));

    this.callBtn = el('button', 'call-btn') as HTMLButtonElement;
    this.callBtn.title = t('hud.callTip');
    this.callBtn.addEventListener('click', () => this.app.callWave());

    const grp = el('div', 'btn-group');
    this.speedBtn = el('button', 'icon-btn glass') as HTMLButtonElement;
    this.speedBtn.title = t('hud.speedTip');
    this.speedBtn.addEventListener('click', () => this.app.cycleSpeed());
    this.pauseBtn = el('button', 'icon-btn glass', SVG.pause) as HTMLButtonElement;
    this.pauseBtn.title = t('hud.pauseTip');
    this.pauseBtn.addEventListener('click', () => this.app.togglePause());
    this.soundBtn = el('button', 'icon-btn glass opt', SVG.sound) as HTMLButtonElement;
    this.soundBtn.title = t('hud.muteTip');
    this.soundBtn.addEventListener('click', () => {
      audio.muted = !audio.muted;
    });
    const menuBtn = el('button', 'icon-btn glass', SVG.menu) as HTMLButtonElement;
    menuBtn.title = t('hud.menuTip');
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
      b.dataset.new = t('hud.new');
      b.append(cachedIcon(id, 42));
      b.append(el('span', 'cost'));
      b.append(el('span', 'key', KEYS[i]));
      b.addEventListener('click', () => {
        if (!this.app.game) return;
        this.seenUnlocked.add(id);
        if (!this.app.game.isUnlocked(id)) {
          this.toast(t('toast.unlocksAt', { name: bname(id), n: BUILDINGS[id].tier }), 'small err');
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
    this.novaBtn.innerHTML = `${SVG.nova}<span class="lbl">${t('hud.nova')}</span><span class="sub"></span><span class="key">V</span><i class="cd"></i>`;
    this.novaBtn.title = t('hud.novaTip');
    this.novaBtn.addEventListener('click', () => this.app.nova());
    this.beaconBtn = el('button', 'abtn') as HTMLButtonElement;
    const bi = cachedIcon('core', 30);
    bi.style.width = bi.style.height = '30px';
    this.beaconBtn.append(bi);
    this.beaconBtn.insertAdjacentHTML('beforeend', `<span class="lbl">${t('hud.beacon')}</span><span class="sub"></span><span class="key">B</span>`);
    this.beaconBtn.title = t('hud.beaconTip');
    this.beaconBtn.addEventListener('click', () => this.app.selectCore());
    abil.append(this.novaBtn, this.beaconBtn);
    bottom.append(buildBar, abil);

    this.tooltip = el('div', 'glass hidden');
    this.tooltip.id = 'tooltip';
    this.hint = el('div', 'hint glass hidden');

    this.hud = [top, this.bossBar, this.preview, this.panel, bottom, this.hint];
    this.root.append(top, this.bossBar, this.preview, this.toasts, this.panel, bottom, this.tooltip, this.hint);
  }

  resetRun() {
    this.seenUnlocked.clear();
    this.last = {};
    this.toasts.innerHTML = '';
  }

  setHudVisible(v: boolean) {
    for (const h of this.hud) h.style.display = v ? '' : 'none';
    if (v) {
      this.last = {};
      this.panel.classList.add('hidden');
    }
  }

  /** Height of the top and bottom HUD bands, so the camera can avoid them. */
  insets(): { top: number; bottom: number; left: number } {
    const top = document.getElementById('hud-top');
    const bottom = document.getElementById('hud-bottom');
    const tr = top?.getBoundingClientRect();
    const br = bottom?.getBoundingClientRect();
    const topIn = tr && tr.height ? tr.bottom + 6 : 70;
    // phone landscape: the build bar becomes a vertical strip on the left
    if (br && br.height > br.width) return { top: topIn, bottom: 6, left: br.right + 6 };
    return { top: topIn, bottom: br && br.height ? Math.max(0, window.innerHeight - br.top) + 6 : 104, left: 0 };
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
    const m = g.sandbox ? -1 : Math.floor(g.money);
    set('money', m, () => {
      this.money.innerHTML = gem + (g.sandbox ? '∞' : fmt(m));
    });
    const shownWave = g.phase === 'build' && !g.over ? g.wave + 1 : g.wave;
    set('night', shownWave, () => (this.nightN.textContent = String(shownWave)));

    if (g.phase === 'build' && g.sandbox) {
      set('call', 'sandbox', () => {
        this.callBtn.className = 'call-btn';
        this.callBtn.innerHTML = `<span class="txt">${t('hud.callNight')}</span><span class="time">▸</span>`;
      });
    } else if (g.phase === 'build') {
      const secs = Math.ceil(g.buildTimer);
      const bonus = Math.floor(g.buildTimer * 1.5);
      set('call', 'b' + secs + ':' + bonus, () => {
        this.callBtn.className = 'call-btn';
        this.callBtn.innerHTML = `<span class="txt">${t('hud.callNight')}</span><span class="bonus">+${bonus}◆</span><span class="time">${secs}s</span>`;
      });
    } else {
      const remaining = g.enemies.length + g.queued;
      set('call', 'w' + remaining, () => {
        this.callBtn.className = 'call-btn wave';
        this.callBtn.innerHTML = `<span class="txt">${t('hud.shadows')}</span><span class="time">${remaining}</span>`;
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
      const poor = !g.canAfford(cost);
      const active = this.app.placing === id;
      const fresh = unlocked && def.tier > 1 && !this.seenUnlocked.has(id);
      set('bb' + id, `${unlocked}${poor}${active}${fresh}`, () => {
        btn.classList.toggle('locked', !unlocked);
        btn.classList.toggle('poor', unlocked && poor);
        btn.classList.toggle('active', active);
        btn.classList.toggle('fresh', fresh);
        (btn.querySelector('.cost') as HTMLElement).textContent = unlocked ? String(cost) : t('hud.lv', { n: def.tier });
      });
    }

    // nova
    const cdF = g.novaCd / NOVA_COOLDOWN;
    set('nova', Math.ceil(g.novaCd), () => {
      const ready = g.novaCd <= 0;
      this.novaBtn.classList.toggle('ready', ready);
      (this.novaBtn.querySelector('.sub') as HTMLElement).textContent = ready ? t('hud.ready') : Math.ceil(g.novaCd) + 's';
    });
    (this.novaBtn.querySelector('.cd') as HTMLElement).style.transform = `scaleY(${cdF})`;
    const cc = g.coreUpgradeCost();
    const canAsc = cc !== null && g.canAfford(cc);
    set('beacon', `${g.coreLevel}:${cc}:${canAsc}`, () => {
      const sub = this.beaconBtn.querySelector('.sub') as HTMLElement;
      sub.innerHTML = cc === null ? t('hud.max') : `${gem}${cc}`;
      sub.style.color = canAsc ? 'var(--aether)' : '';
      this.beaconBtn.classList.toggle('ready', canAsc);
    });

    // boss bar
    const boss = g.enemies.find((e) => e.def.boss);
    set('boss', boss ? boss.uid + ':' + Math.ceil((boss.hp / boss.maxHp) * 200) : '', () => {
      this.bossBar.classList.toggle('hidden', !boss);
      if (boss) {
        (this.bossBar.querySelector('.name') as HTMLElement).textContent = ename(boss.def.id);
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
    const title = el('div', 'title', `<span>${t(g.phase === 'build' ? 'preview.coming' : 'preview.now', { n: `<b>${plan.wave}</b>` })}</span><span class="toggle">${this.previewCollapsed ? '▾' : '▴'}</span>`);
    p.append(title);
    if (g.sandbox && g.phase === 'build') {
      // sandbox night picker: step ±1 / ±5 nights
      const pick = el('div', 'night-pick');
      const mk = (label: string, d: number, tip: string) => {
        const b = el('button', 'pick-btn', label) as HTMLButtonElement;
        b.title = tip;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          g.setNextWave(g.nextPlan.wave + d);
          audio.play('ui_click');
        });
        return b;
      };
      pick.append(mk('«', -5, t('sandbox.prev')), mk('◀', -1, t('sandbox.prev')), el('span', 'pick-n', String(plan.wave)), mk('▶', 1, t('sandbox.next')), mk('»', 5, t('sandbox.next')));
      title.after(pick);
    }
    if (plan.tag) p.append(el('div', 'tag', t(plan.tag)));
    const foes = el('div', 'foes');
    for (const [id, n] of Object.entries(plan.counts) as [EnemyId, number][]) {
      if (!n) continue;
      const f = el('div', 'foe' + (plan.newEnemy === id ? ' new' : ''));
      f.title = `${ename(id)}: ${elore(id)}`;
      f.append(cachedIcon(id, 26), document.createTextNode('×' + n));
      foes.append(f);
    }
    p.append(foes);
    const notes: string[] = [];
    if (plan.newEnemy) notes.push(t('preview.new', { name: ename(plan.newEnemy) }));
    if (g.phase === 'build' && g.formingRifts().length) notes.push(t('preview.rift'));
    if (plan.spawns.some((s) => s.elite > 1)) notes.push(t('preview.elite'));
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
        ? t('hint.touch', { name: bname(placing) })
        : [t('hint.click', { name: bname(placing) }), ...(drag ? [t('hint.drag')] : []), t('hint.cancel')].join(' · ');
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
      const key = `b${b.uid}:${b.level}:${b.mode}:${up !== null && g.canAfford(up)}:${g.sellValue(b)}:${Math.ceil(b.hp)}:${b.kills}:${g.phase}`;
      set(this, 'panel', key, () => this.renderBuildingPanel(g, b));
    } else {
      const cc = g.coreUpgradeCost();
      const key = `core:${g.coreLevel}:${cc !== null && g.canAfford(cc)}:${Math.ceil(g.coreHp)}:${Math.ceil(g.novaCd)}`;
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
    const info = el('div', '', `<div class="name">${bname(def.id)}</div><div class="lvl">${t('panel.level', { n: b.level + 1 })}<span class="pips">${pips}</span></div>`);
    const close = el('button', 'close', '×');
    close.addEventListener('click', () => this.app.deselect());
    head.append(info, close);
    p.append(head);
    p.append(el('div', 'blurb', t(`b.${def.id}.blurb` as StringKey)));
    const next = b.level + 1 < def.levels.length ? def.levels[b.level + 1] : null;
    p.append(statsList(def.levels[b.level], next, b.hp));

    const actions = el('div', 'actions');
    const up = g.upgradeCost(b);
    const ub = el('button', 'act primary') as HTMLButtonElement;
    if (up === null) {
      ub.textContent = t('panel.maxLevel');
      ub.disabled = true;
    } else {
      ub.innerHTML = `${t('panel.upgrade')} <span class="c">${gem}${up}</span>`;
      ub.disabled = !g.canAfford(up);
      ub.title = t('panel.upgradeTip');
      ub.addEventListener('click', () => this.app.upgradeSelected());
    }
    const sb = el('button', 'act sell') as HTMLButtonElement;
    sb.innerHTML = `${t('panel.sell')} <span class="c">+${g.sellValue(b)}</span>`;
    sb.title = g.phase === 'build' && b.freshSpend > 0 ? t('panel.sellFreshTip') : t('panel.sellTip');
    sb.addEventListener('click', () => this.app.sellSelected());
    actions.append(ub, sb);
    if (def.kind === 'tower' && def.id !== 'obelisk' && def.id !== 'pyre') {
      const mb = el('button', 'act small') as HTMLButtonElement;
      mb.innerHTML = `◎ ${t(`mode.${b.mode}` as StringKey)}`;
      mb.title = t('panel.targetTip');
      mb.addEventListener('click', () => this.app.cycleMode());
      actions.append(mb);
    }
    p.append(actions);
    if (def.kind === 'tower' || def.kind === 'trap' || def.id === 'frost')
      p.append(el('div', 'kills', `<span>${t('panel.kills', { n: b.kills })}</span><span>${t('panel.damage', { n: fmt(b.dealt) })}</span>`));
  }

  private renderCorePanel(g: Game) {
    const p = this.panel;
    p.classList.remove('hidden');
    p.innerHTML = '';
    const head = el('div', 'head');
    head.append(cachedIcon('core', 48));
    const pips = CORE_LEVELS.map((_, i) => `<i class="${i <= g.coreLevel ? 'on' : ''}"></i>`).join('');
    head.append(el('div', '', `<div class="name">${t('core.name')}</div><div class="lvl">${t('panel.level', { n: g.coreLevel + 1 })}<span class="pips">${pips}</span></div>`));
    const close = el('button', 'close', '×');
    close.addEventListener('click', () => this.app.deselect());
    head.append(close);
    p.append(head);
    p.append(el('div', 'blurb', t('core.blurb')));
    const C = g.core;
    const N = g.coreLevel + 1 < CORE_LEVELS.length ? CORE_LEVELS[g.coreLevel + 1] : null;
    const dl = el('dl', 'stats');
    const row = (k: string, v: string, nv?: string) => {
      dl.append(el('dt', '', k), el('dd', '', v + (nv && nv !== v ? `<span class="up">→ ${nv}</span>` : '')));
    };
    row(t('stat.health'), `${Math.ceil(g.coreHp)} / ${C.hp}`, N ? String(N.hp) : undefined);
    row(t('core.gun'), String(C.damage), N ? String(N.damage) : undefined);
    row(t('core.nova'), String(C.nova), N ? String(N.nova) : undefined);
    p.append(dl);
    if (N) {
      const unlocks = BUILD_ORDER.filter((id) => BUILDINGS[id].tier === g.coreLevel + 2).map(bname);
      if (unlocks.length) p.append(el('div', 'unlocks', t('core.unlocks', { list: unlocks.join(', ') })));
    }
    const actions = el('div', 'actions');
    const cc = g.coreUpgradeCost();
    const ub = el('button', 'act primary') as HTMLButtonElement;
    if (cc === null) {
      ub.textContent = t('core.maxed');
      ub.disabled = true;
    } else {
      ub.innerHTML = `${t('core.ascend')} <span class="c">${g.sandbox ? t('hud.free') : gem + cc}</span>`;
      ub.disabled = !g.canAfford(cc);
      ub.addEventListener('click', () => this.app.upgradeCore());
    }
    // The Nova lives here too, so touch players have it one tap away from the Beacon.
    const nb = el('button', 'act nova') as HTMLButtonElement;
    const ready = g.novaCd <= 0;
    nb.innerHTML = `${SVG.nova}${t('hud.nova')} <span class="c">${ready ? t('hud.ready') : Math.ceil(g.novaCd) + 's'}</span>`;
    nb.disabled = !ready;
    nb.title = t('hud.novaTip');
    nb.addEventListener('click', () => this.app.nova());
    actions.append(ub, nb);
    p.append(actions);
  }

  // ------------------------------------------------------------------ tooltip

  private showTip(id: BuildingId, anchor: HTMLElement) {
    const g = this.app.game;
    const def = BUILDINGS[id];
    const tip = this.tooltip;
    tip.innerHTML = '';
    tip.append(el('div', 'name', `${bname(id)}<span>${gem}${def.levels[0].cost}</span>`));
    tip.append(el('div', 'blurb', t(`b.${id}.blurb` as StringKey)));
    tip.append(statsList(def.levels[0], null));
    if (g && !g.isUnlocked(id)) tip.append(el('div', 'lock', t('err.locked', { n: def.tier })));
    tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const w = 250;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.bottom = window.innerHeight - r.top + 10 + 'px';
    tip.style.top = 'auto';
  }
  hideTip() {
    this.tooltip.classList.add('hidden');
  }

  // ------------------------------------------------------------------ toasts & events

  toast(html: string, cls = 'small info', life = 2.4) {
    const el_ = el('div', 'toast ' + cls, html);
    el_.style.setProperty('--life', life + 's');
    this.toasts.append(el_);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
    setTimeout(() => el_.remove(), (life + 0.7) * 1000);
    return el_;
  }

  onEvent(ev: GameEvent, g: Game) {
    switch (ev.type) {
      case 'waveStart': {
        const plan = ev.plan;
        const sub = plan.tag ? t(plan.tag) : ev.wave === 1 ? t('toast.firstNight') : '';
        this.toast(`<div class="t1">${t('toast.night', { n: ev.wave })}</div>${sub ? `<div class="t2">${sub}</div>` : ''}`, 'big' + (plan.boss ? ' boss' : ''), 2);
        if (plan.newEnemy) {
          const id = plan.newEnemy;
          const intro = this.toast(`<div><div class="t1">${t('toast.newFoe', { name: ename(id) })}</div><div class="t2">${elore(id)}</div></div>`, 'intro', 5);
          intro.prepend(cachedIcon(id, 48));
        }
        this.last.preview = null;
        break;
      }
      case 'waveClear':
        if (!g.over) this.toast(`${t('toast.survived', { n: ev.wave })} &nbsp;<span style="color:var(--aether)">+${ev.bonus}◆</span>`, 'small info', 2.6);
        this.last.preview = null;
        break;
      case 'riftOpen':
        this.toast(t('toast.rift'), 'small err', 3);
        break;
      case 'bossSpawn':
        this.toast(`<div class="t1">${ename(ev.enemy)}</div><div class="t2">${elore(ev.enemy)}</div>`, 'big boss', 3);
        break;
      case 'coreUp': {
        const unlocks = BUILD_ORDER.filter((id) => BUILDINGS[id].tier === ev.level + 1).map(bname);
        this.toast(
          `<div class="t1">${t('toast.ascend')}</div><div class="t2">${unlocks.length ? t('toast.unlocked', { list: unlocks.join(' · ') }) : t('toast.level', { n: ev.level + 1 })}</div>`,
          'big',
          2.8,
        );
        break;
      }
      case 'destroyed':
        this.toast(t('toast.destroyed', { name: bname(ev.id) }), 'small err', 1.8);
        break;
      case 'error': {
        const now = performance.now();
        if (ev.msg !== this.lastErr || now - this.lastErrT > 1200) {
          this.toast(t(ev.msg, ev.vars), 'small err', 1.4);
          this.lastErr = ev.msg;
          this.lastErrT = now;
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ screens

  private screenKind: (() => void) | null = null;

  private showScreen(card: HTMLElement, dismissOnBackdrop = false, redraw: (() => void) | null = null) {
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
    this.screenKind = redraw;
  }

  closeScreen() {
    this.screen?.remove();
    this.screen = null;
    this.screenKind = null;
  }

  get screenOpen() {
    return !!this.screen;
  }

  /** Rebuild all DOM text after a language change, keeping the current screen open. */
  relocalize() {
    const hudVisible = this.hud[0]?.style.display !== 'none';
    const redraw = this.screenKind;
    for (const h of [...this.hud, this.toasts, this.tooltip]) h.remove();
    this.buildBtns.clear();
    this.hud = [];
    this.buildHud();
    this.setHudVisible(hudVisible);
    this.last = {};
    if (redraw) redraw();
  }

  private secondary(label: string): HTMLButtonElement {
    const b = el('button', 'big-btn alt', label) as HTMLButtonElement;
    return b;
  }

  showTitle() {
    this.hideTip();
    const card = el('div', 'card glass');
    card.append(el('div', 'logo', 'LUMENRIFT'), el('div', 'tagline', t('title.tagline')));
    const sessions = listSessions();
    if (sessions.length) {
      card.append(this.sessionList(sessions));
      card.append(el('div', 'section-h', t('saves.newGame')));
    }
    const best = loadBest();
    const diffs = el('div', 'diffs');
    let chosen: Difficulty = this.app.difficulty;
    const cards: HTMLElement[] = [];
    (Object.keys(DIFFICULTY) as Difficulty[]).forEach((d) => {
      const c = el('button', 'diff' + (d === chosen ? ' sel' : ''));
      const b = best[d];
      c.innerHTML = `<div class="dn">${t(`diff.${d}.label` as StringKey)}</div><div class="dd">${t(`diff.${d}.desc` as StringKey)}</div><div class="best">${b ? t('title.best', { n: b }) + (b >= VICTORY_WAVE ? ' ☀' : '') : ''}</div>`;
      c.addEventListener('click', () => {
        chosen = d;
        this.app.difficulty = d;
        cards.forEach((x) => x.classList.remove('sel'));
        c.classList.add('sel');
        audio.unlock();
        audio.play('ui_click');
      });
      cards.push(c);
      diffs.append(c);
    });
    card.append(diffs);
    const go = el('button', 'big-btn', t('title.start'));
    go.addEventListener('click', () => {
      audio.unlock();
      this.app.startGame(chosen);
    });
    card.append(go);
    const links = el('div', 'link-row');
    const how = el('button', 'link-btn', t('title.how'));
    how.addEventListener('click', () => this.showHelp(() => this.showTitle()));
    const set_ = el('button', 'link-btn', t('title.settings'));
    set_.addEventListener('click', () => this.showSettings(() => this.showTitle()));
    links.append(how, set_, this.langSelect());
    card.append(links, aboutFooter());
    this.showScreen(card, false, () => this.showTitle());
  }

  /** Saved games, most recent first, each resumable or deletable (with an inline confirm). */
  private sessionList(sessions: SessionMeta[]): HTMLElement {
    const wrap = el('div', 'saves');
    wrap.append(el('div', 'section-h', t('saves.title')));
    sessions.forEach((s, i) => {
      const row = el('div', 'save-row' + (i === 0 ? ' latest' : ''));
      const info = el('div', 'save-info');
      const night = t('toast.night', { n: s.night }) + (s.won ? ' ☀' : '');
      const diffTag = `<span class="save-diff d-${s.difficulty}">${t(`diff.${s.difficulty}.label` as StringKey)}</span>`;
      const bits = [
        s.won ? t('saves.dawn') : s.inNight ? t('saves.inNight') : '',
        relTime(s.updated),
      ].filter(Boolean);
      info.innerHTML = `<div class="save-main"><b>${night}</b>${diffTag}<span class="save-hp"><i style="width:${Math.round(s.beacon * 100)}%"></i></span></div><div class="save-sub">${bits.join(' · ')} · ${t('saves.beacon', { p: Math.round(s.beacon * 100) })} · ☠ ${fmt(s.kills)}</div>`;
      info.title = new Date(s.updated).toLocaleString(lang());
      const resume = el('button', 'save-go', `▶ ${t('saves.resume')}`) as HTMLButtonElement;
      resume.addEventListener('click', () => {
        audio.unlock();
        this.app.resumeSession(s.id);
      });
      const del = el('button', 'save-del', '✕') as HTMLButtonElement;
      del.title = t('saves.delete');
      del.setAttribute('aria-label', t('saves.delete'));
      del.addEventListener('click', () => {
        // swap the row for an inline confirmation
        row.classList.add('confirm');
        row.innerHTML = '';
        const q = el('div', 'save-info', `<div class="save-main">${t('saves.confirm')}</div><div class="save-sub">${night} · ${bits.join(' · ')}</div>`);
        const yes = el('button', 'save-go danger', t('saves.delete')) as HTMLButtonElement;
        const no = el('button', 'save-go', t('saves.keep')) as HTMLButtonElement;
        yes.addEventListener('click', () => {
          this.app.deleteSession(s.id);
          audio.play('sell');
          this.showTitle();
        });
        no.addEventListener('click', () => this.showTitle());
        row.append(q, yes, no);
      });
      row.append(info, resume, del);
      wrap.append(row);
    });
    return wrap;
  }

  /** Compact language dropdown. */
  private langSelect(): HTMLElement {
    const sel = el('select', 'lang-select') as HTMLSelectElement;
    sel.setAttribute('aria-label', t('settings.language'));
    for (const l of LANG_ORDER) {
      const o = el('option', '', LANGS[l]['meta.language'] ?? l) as HTMLOptionElement;
      o.value = l;
      o.selected = l === lang();
      sel.append(o);
    }
    sel.addEventListener('change', () => setLang(sel.value as Lang));
    return sel;
  }

  showMenu() {
    if (!this.app.game || this.app.game.over || this.app.inAttract) return;
    this.app.togglePause(true);
    const card = el('div', 'card glass');
    card.append(el('div', 'over-title win', t('menu.paused')));
    card.append(el('div', 'over-sub', t('menu.sub', { n: this.app.game.phase === 'build' ? this.app.game.wave + 1 : this.app.game.wave, diff: t(`diff.${this.app.game.difficulty}.label` as StringKey) })));
    const col = el('div', '');
    col.style.display = 'grid';
    col.style.gap = '10px';
    const resume = el('button', 'big-btn', t('menu.resume'));
    resume.addEventListener('click', () => {
      this.closeScreen();
      this.app.togglePause(false);
    });
    const restart = this.secondary(t('menu.restart'));
    restart.addEventListener('click', () => this.app.restart());
    const quit = this.secondary(t('menu.quit'));
    quit.addEventListener('click', () => this.app.toTitle());
    col.append(resume, restart, quit);
    card.append(col);
    const links = el('div', 'link-row');
    const how = el('button', 'link-btn', t('title.how'));
    how.addEventListener('click', () => this.showHelp(() => this.showMenu()));
    const st = el('button', 'link-btn', t('title.settings'));
    st.addEventListener('click', () => this.showSettings(() => this.showMenu()));
    links.append(how, st);
    card.append(links, aboutFooter());
    this.showScreen(card, true, () => this.showMenu());
  }

  showHelp(back: () => void) {
    const card = el('div', 'card glass');
    const touch = this.app.touch;
    card.innerHTML = `<div class="over-title win" style="font-size:30px">${t('help.title')}</div>
    <div class="help">
      <p>${t('help.intro', { n: VICTORY_WAVE })}</p>
      <h3>${t('help.buildH')}</h3>
      <ul>
        <li>${t(touch ? 'help.build1.touch' : 'help.build1.click')}</li>
        <li>${t('help.build2')}</li>
        <li>${t('help.build3')}</li>
        <li>${t('help.build4')}</li>
        <li>${t('help.build5')}</li>
      </ul>
      <h3>${t('help.betweenH')}</h3>
      <p>${t('help.between')}</p>
      ${touch ? `<h3>${t('help.touchH')}</h3><p>${t('help.touch')}</p>` : `<h3>${t('help.keysH')}</h3><p>${t('help.keys')}</p>`}
      <h3>${t('help.bestiary')}</h3>
      <div class="bestiary"></div>
    </div>`;
    const best = card.querySelector('.bestiary')!;
    for (const id of Object.keys(ENEMIES) as EnemyId[]) {
      const b = el('div', 'b');
      b.append(cachedIcon(id, 36));
      b.append(el('div', '', `<b>${ename(id)}</b>${elore(id)}`));
      best.append(b);
    }
    const back_ = el('button', 'big-btn', t('settings.back'));
    back_.style.marginTop = '18px';
    back_.addEventListener('click', back);
    card.append(back_);
    this.showScreen(card, false, () => this.showHelp(back));
  }

  showSettings(back: () => void) {
    const card = el('div', 'card glass');
    card.append(el('div', 'over-title win', t('settings.title')));
    card.style.width = 'min(420px, 100%)';
    const s = el('div', 'settings');
    s.append(el('label', '', t('settings.language')), this.langSelect());
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
    slider(t('settings.music'), () => audio.musicVolume, (v) => (audio.musicVolume = v));
    slider(t('settings.effects'), () => audio.sfxVolume, (v) => {
      audio.sfxVolume = v;
      audio.play('build');
    });
    const mute = el('input') as HTMLInputElement;
    mute.type = 'checkbox';
    mute.checked = audio.muted;
    mute.addEventListener('change', () => (audio.muted = mute.checked));
    s.append(el('label', '', t('settings.mute')), mute);
    card.append(s);
    const b = el('button', 'big-btn', t('settings.back'));
    b.addEventListener('click', back);
    card.append(b);
    this.showScreen(card, false, () => this.showSettings(back));
  }

  showGameOver(g: Game, won: boolean, newBest: boolean) {
    this.hideTip();
    const card = el('div', 'card glass');
    card.append(el('div', 'over-title' + (won ? ' win' : ''), t(won ? 'over.win' : 'over.lose')));
    const sub = won ? t('over.winSub', { n: VICTORY_WAVE }) : t('over.loseSub', { n: g.wave });
    const rec = newBest ? ' ' + t(won ? 'over.record' : 'over.recordLose') : '';
    card.append(el('div', 'over-sub', sub + rec));
    const sum = el('div', 'summary');
    sum.innerHTML = `<div><b>${won ? g.wave : g.wave - 1}</b><span>${t('over.nights')}</span></div><div><b>${fmt(g.stats.kills)}</b><span>${t('over.kills')}</span></div><div><b>${fmt(g.stats.earned)}</b><span>${t('over.earned')}</span></div>`;
    card.append(sum);
    const row = el('div', 'row-btns');
    if (won) {
      const cont = el('button', 'big-btn', t('over.endless'));
      cont.style.fontSize = '16px';
      cont.addEventListener('click', () => {
        this.closeScreen();
        this.app.continueEndless();
      });
      row.append(cont);
    }
    const again = el('button', 'big-btn' + (won ? ' alt' : ''), t('over.again'));
    again.addEventListener('click', () => this.app.restart());
    const title = el('button', 'big-btn alt', t('over.title'));
    title.addEventListener('click', () => this.app.toTitle());
    row.append(again, title);
    card.append(row);
    this.showScreen(card, false, () => this.showGameOver(g, won, newBest));
  }
}

function set(ui: UI, key: string, v: unknown, fn: () => void) {
  const last = (ui as unknown as { last: Record<string, unknown> }).last;
  if (last[key] !== v) {
    last[key] = v;
    fn();
  }
}

const REPO_URL = 'https://github.com/WhiteBlackGoose/Lumenrift';

/** Small footer: link to the source and the CC0 dedication. */
function aboutFooter(): HTMLElement {
  const f = el('div', 'about');
  f.innerHTML =
    `<a href="${REPO_URL}" target="_blank" rel="noopener">` +
    `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>` +
    `${t('about.source')}</a><span>·</span>` +
    `<a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">${t('about.license')}</a>`;
  return f;
}

/** "5 minutes ago" / "vor 2 Stunden" in the current language; plain date after a week. */
function relTime(ts: number): string {
  const s = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(s);
  try {
    const rtf = new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' });
    if (abs < 60) return rtf.format(0, 'second');
    if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (abs < 7 * 86400) return rtf.format(Math.round(s / 86400), 'day');
  } catch {
    /* Intl unavailable */
  }
  return new Date(ts).toLocaleDateString(lang());
}

export const bname = (id: BuildingId) => t(`b.${id}.name` as StringKey);
export const ename = (id: EnemyId) => t(`e.${id}.name` as StringKey);
export const elore = (id: EnemyId) => t(`e.${id}.lore` as StringKey);

function statsList(L: LevelStats, N: LevelStats | null, hp?: number): HTMLElement {
  const dl = el('dl', 'stats');
  const row = (k: StringKey, v: number | undefined, nv: number | undefined, fmtv: (n: number) => string = (n) => String(n)) => {
    if (v === undefined || (v === 0 && !nv)) return;
    const up = N && nv !== undefined && nv !== v ? `<span class="up">→ ${fmtv(nv)}</span>` : '';
    dl.append(el('dt', '', t(k)), el('dd', '', fmtv(v) + up));
  };
  const pct = (n: number) => Math.round(n * 100) + '%';
  const one = (n: number) => (Math.round(n * 10) / 10).toString();
  row('stat.damage', L.damage, N?.damage);
  if (L.rate && L.damage) row('stat.dps', L.damage * L.rate * (L.shots ?? 1), N ? (N.damage ?? 0) * (N.rate ?? 0) * (N.shots ?? 1) : undefined, one);
  row('stat.range', L.range, N?.range, one);
  row('stat.splash', L.splash, N?.splash, one);
  row('stat.chain', L.chain, N?.chain);
  row('stat.missiles', L.shots, N?.shots);
  row('stat.slow', L.slow, N?.slow, pct);
  row('stat.burn', L.burn, N?.burn);
  row('stat.heal', L.heal, N?.heal);
  row('stat.income', L.income, N?.income);
  if (L.hp > 1) {
    const cur = hp !== undefined ? `${Math.ceil(hp)} / ${L.hp}` : String(L.hp);
    dl.append(el('dt', '', t('stat.health')), el('dd', '', cur + (N && N.hp !== L.hp ? `<span class="up">→ ${N.hp}</span>` : '')));
  }
  return dl;
}
