import './style.css';
import { audio, SfxName } from './audio/audio';
import { Bot } from './game/bot';
import { BUILDINGS, BuildingId, Difficulty, MAP_W } from './game/config';
import { Building, Game, GameEvent } from './game/game';
import { isCoreTile } from './game/grid';
import { Renderer, ViewState } from './render/renderer';
import { Input } from './ui/input';
import { saveBest } from './ui/storage';
import { AppApi, BUILD_KEYS, UI } from './ui/ui';

const params = new URLSearchParams(location.search);

const SHOOT_SFX: Partial<Record<string, SfxName>> = {
  arbalest: 'arbalest',
  mortar: 'mortar_fire',
  tesla: 'tesla',
  pyre: 'pyre',
  prism: 'prism',
  skyhunter: 'missile',
  core: 'core_shot',
};

class App implements AppApi {
  game: Game | null = null;
  placing: BuildingId | null = null;
  selected: Building | null = null;
  coreSelected = false;
  speed = 1;
  paused = false;
  touch = false;
  difficulty: Difficulty = 'normal';

  renderer: Renderer;
  private ui: UI;
  private attract: Bot | null = null;
  get inAttract() {
    return !!this.attract;
  }
  private hover: { x: number; y: number } | null = null;
  private ghost: { x: number; y: number } | null = null;
  private overHandled = false;
  private lastT = 0;
  private autoBot: Bot | null = null;

  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.ui = new UI(this);
    this.touch = matchMedia('(pointer: coarse)').matches;
    new Input(canvas, {
      cam: this.renderer.cam,
      hover: (x, y) => {
        this.hover = x === null ? null : { x, y };
        if (this.placing && x !== null) this.ghost = { x, y };
      },
      click: (x, y) => this.clickTile(x, y),
      tap: (x, y) => this.tapTile(x, y),
      paint: (x, y) => {
        if (!this.placing || !this.game) return;
        const k = BUILDINGS[this.placing].kind;
        if (k === 'wall' || k === 'trap') this.tryPlace(x, y, true);
      },
      cancel: () => this.setPlacing(null),
      isPlacing: () => !!this.placing,
      onTouchDetected: () => {
        this.touch = true;
      },
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && !this.attract && !this.game.over) {
        this.togglePause(true);
      }
    });
    // unlock audio on first gesture
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.resize();
    if (params.get('autostart')) {
      this.startGame((params.get('autostart') as Difficulty) || 'normal');
    } else {
      this.startAttract();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private resize() {
    const ins = this.attract ? { top: 0, bottom: 0 } : this.ui.insets();
    this.renderer.resize(window.innerWidth, window.innerHeight, ins.top, ins.bottom);
  }

  // ------------------------------------------------------------------ game lifecycle

  private startAttract(showTitle = true) {
    this.autoBot = null;
    this.renderer.reset();
    const g = new Game((Math.random() * 1e9) | 0, 'casual');
    this.attract = new Bot(g, { skill: 0.8, maze: false });
    // fast-forward so the backdrop shows a living defence
    for (let i = 0; i < 60 * 70; i++) {
      this.attract.update(1 / 60);
      g.step(1 / 60);
    }
    g.drainEvents();
    this.game = g;
    this.placing = null;
    this.selected = null;
    this.coreSelected = false;
    this.paused = false;
    this.speed = 1;
    this.ui.setHudVisible(false);
    this.resize();
    this.renderer.cam.reset();
    if (showTitle) {
      this.ui.showTitle();
      audio.setMood('menu');
    }
  }

  startGame(d: Difficulty) {
    this.difficulty = d;
    const seed = params.get('seed') ? Number(params.get('seed')) : (Math.random() * 1e9) | 0;
    this.attract = null;
    this.autoBot = null;
    this.renderer.reset();
    this.ui.resetRun();
    this.game = new Game(seed, d);
    this.placing = null;
    this.selected = null;
    this.coreSelected = false;
    this.paused = false;
    this.speed = 1;
    this.overHandled = false;
    this.ui.closeScreen();
    this.ui.setHudVisible(true);
    this.resize();
    this.renderer.cam.reset();
    audio.setMood('build');
    if (params.get('bot')) this.autoBot = new Bot(this.game, { skill: 0.8, maze: false });
    const ff = Number(params.get('ff') ?? 0);
    if (ff > 0) {
      const bot = this.autoBot ?? new Bot(this.game, { skill: 0.8, maze: false });
      for (let i = 0; i < ff * 60 && !this.game.over; i++) {
        bot.update(1 / 60);
        this.game.step(1 / 60);
      }
      this.game.drainEvents();
    }
    this.tutorial();
  }

  private tutTimers: number[] = [];
  /** A few gentle hints the very first time someone plays. */
  private tutorial() {
    this.tutTimers.forEach(clearTimeout);
    this.tutTimers = [];
    let seen = false;
    try {
      seen = !!localStorage.getItem('lumen.tutorial');
      localStorage.setItem('lumen.tutorial', '1');
    } catch {
      /* ignore */
    }
    if (seen) {
      this.ui.toast('Build your defences, then call the night', 'small info', 3);
      return;
    }
    const act = this.touch ? 'Tap' : 'Click';
    const tips = [
      'Shadows will pour from the glowing rift and follow the pink trail to the Beacon.',
      `Pick the Arbalest from the bottom bar, then ${act.toLowerCase()} beside the trail to build it.`,
      'Bulwarks bend the trail. Longer paths mean more time under your towers\' fire.',
      'When you are ready, call the night early for bonus aether, or wait for the countdown.',
    ];
    tips.forEach((t, i) => this.tutTimers.push(window.setTimeout(() => this.game && !this.attract && this.game.wave === 0 && this.ui.toast(t, 'small info', 5.2), 400 + i * 6000)));
  }

  restart() {
    this.startGame(this.difficulty);
  }

  toTitle() {
    this.ui.closeScreen();
    this.startAttract();
  }

  continueEndless() {
    this.game?.continueEndless();
    this.overHandled = false;
    this.paused = false;
    audio.setMood('build');
  }

  // ------------------------------------------------------------------ actions

  setPlacing(id: BuildingId | null) {
    this.placing = id;
    this.ghost = id && this.hover ? { ...this.hover } : null;
    if (id) {
      this.selected = null;
      this.coreSelected = false;
    }
  }

  deselect() {
    this.selected = null;
    this.coreSelected = false;
  }

  selectCore() {
    if (!this.game || this.attract) return;
    this.placing = null;
    this.selected = null;
    this.coreSelected = !this.coreSelected;
    audio.play('ui_click');
  }

  togglePause(force?: boolean) {
    if (!this.game || this.attract) return;
    this.paused = force ?? !this.paused;
  }

  cycleSpeed() {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
    audio.play('ui_click');
  }

  callWave() {
    if (!this.game || this.game.phase !== 'build' || this.attract) return;
    this.game.callWaveNow();
    this.paused = false;
  }

  nova() {
    if (!this.game || this.attract) return;
    if (!this.game.nova()) {
      this.ui.toast('Nova is recharging', 'small err', 1.2);
      audio.play('error');
    }
  }

  upgradeCore() {
    this.game?.upgradeCore();
  }

  upgradeSelected() {
    if (!this.game) return;
    if (this.selected) this.game.upgrade(this.selected);
    else if (this.coreSelected) this.game.upgradeCore();
  }

  sellSelected() {
    if (!this.game || !this.selected) return;
    this.game.sell(this.selected);
    this.selected = null;
  }

  cycleMode() {
    if (this.game && this.selected) {
      this.game.cycleMode(this.selected);
      audio.play('ui_click');
    }
  }

  private tryPlace(x: number, y: number, quiet = false): boolean {
    const g = this.game!;
    const id = this.placing!;
    const chk = g.canPlace(id, x, y);
    if (!chk.ok) {
      if (!quiet) g.events.push({ type: 'error', msg: chk.reason! });
      return false;
    }
    g.place(id, x, y);
    if (g.money < BUILDINGS[id].levels[0].cost) this.setPlacing(null);
    return true;
  }

  private clickTile(x: number, y: number) {
    const g = this.game;
    if (!g || this.attract) return;
    if (this.placing) {
      this.tryPlace(x, y);
      return;
    }
    this.selectAt(x, y);
  }

  private tapTile(x: number, y: number) {
    const g = this.game;
    if (!g || this.attract) return;
    if (this.placing) {
      if (this.ghost && this.ghost.x === x && this.ghost.y === y) {
        this.tryPlace(x, y);
      } else {
        this.ghost = { x, y };
      }
      return;
    }
    this.selectAt(x, y);
  }

  private selectAt(x: number, y: number) {
    const g = this.game!;
    const b = g.buildingAtTile(x, y);
    if (b) {
      this.selected = this.selected === b ? null : b;
      this.coreSelected = false;
      audio.play('ui_click');
    } else if (isCoreTile(x, y)) {
      this.selectCore();
    } else {
      this.deselect();
    }
  }

  private key(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const g = this.game;
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (k === 'Escape') {
      if (this.attract) return;
      if (this.placing) this.setPlacing(null);
      else if (this.selected || this.coreSelected) this.deselect();
      else if (this.ui.screenOpen && g && !g.over && !this.attract) {
        this.ui.closeScreen();
        this.togglePause(false);
      } else this.ui.showMenu();
      return;
    }
    if (!g || this.attract || this.ui.screenOpen) return;
    const bid = BUILD_KEYS[k];
    if (bid) {
      if (g.isUnlocked(bid)) this.setPlacing(this.placing === bid ? null : bid);
      else {
        this.ui.toast(`${BUILDINGS[bid].name} unlocks at Beacon level ${BUILDINGS[bid].tier}`, 'small err');
        audio.play('error');
      }
      return;
    }
    switch (k) {
      case ' ':
        e.preventDefault();
        this.togglePause();
        break;
      case 'F':
        this.cycleSpeed();
        break;
      case 'N':
        this.callWave();
        break;
      case 'V':
        this.nova();
        break;
      case 'B':
        this.selectCore();
        break;
      case 'U':
        this.upgradeSelected();
        break;
      case 'X':
      case 'Delete':
      case 'Backspace':
        this.sellSelected();
        break;
      case 'T':
        this.cycleMode();
        break;
      case 'M':
        audio.muted = !audio.muted;
        break;
    }
  }

  // ------------------------------------------------------------------ loop

  private frame(ts: number) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (ts - (this.lastT || ts)) / 1000);
    this.lastT = ts;
    const g = this.game;
    if (!g) return;

    const running = !this.paused && !(this.ui.screenOpen && !this.attract && !g.over);
    let simDt = 0;
    if (running) {
      simDt = dt * this.speed;
      if (this.attract) {
        this.attract.update(simDt);
        if (g.over) {
          this.startAttract(false);
          return;
        }
      }
      this.autoBot?.update(simDt);
      g.update(simDt);
    }

    for (const ev of g.drainEvents()) {
      this.renderer.onEvent(ev, g);
      if (!this.attract) {
        this.ui.onEvent(ev, g);
        this.sound(ev);
      }
    }

    if (this.selected && !g.buildings.includes(this.selected)) this.selected = null;

    if (!this.attract) {
      if (g.over && !this.overHandled) {
        this.overHandled = true;
        const won = g.won;
        const best = saveBest(g.difficulty, won ? g.wave : g.wave - 1);
        this.placing = null;
        setTimeout(() => this.ui.showGameOver(g, won, best), won ? 1200 : 1800);
      }
      audio.setIntensity(Math.min(1, g.enemies.length / 40));
    }

    this.renderer.update(g, simDt);
    const ghost = this.placing ? (this.touch ? this.ghost : this.hover) : null;
    const view: ViewState = {
      placing: this.placing,
      hover: ghost,
      ghostOk: ghost && this.placing ? g.canPlace(this.placing, ghost.x, ghost.y).ok : false,
      selected: this.selected,
      coreSelected: this.coreSelected,
      hoverTile: this.hover,
    };
    this.renderer.draw(g, view);
    if (!this.attract) this.ui.update();
  }

  private sound(ev: GameEvent) {
    const pan = (x: number) => Math.max(-0.8, Math.min(0.8, (x / MAP_W) * 2 - 1));
    switch (ev.type) {
      case 'shoot': {
        const s = SHOOT_SFX[ev.kind];
        if (s) audio.play(s, { pan: pan(ev.x), volume: ev.kind === 'core' ? 0.6 : 1 });
        break;
      }
      case 'explode':
        audio.play('explosion', { pan: pan(ev.x), volume: Math.min(1, 0.4 + ev.r * 0.4) });
        break;
      case 'die':
        audio.play(ev.enemy === 'colossus' || ev.enemy === 'wyrm' ? 'boss_die' : 'enemy_die', { pan: pan(ev.x) });
        break;
      case 'hit':
        audio.play('hit', { pan: pan(ev.x), volume: 0.5 });
        break;
      case 'chain':
        break;
      case 'build':
        audio.play('build', { pan: pan(ev.x) });
        break;
      case 'upgrade':
        audio.play('upgrade', { pan: pan(ev.x) });
        break;
      case 'sell':
        audio.play('sell', { pan: pan(ev.x) });
        break;
      case 'destroyed':
        audio.play('building_destroyed', { pan: pan(ev.x) });
        break;
      case 'coreHit':
        audio.play('core_hit', { volume: Math.min(1, 0.5 + ev.dmg / 60) });
        break;
      case 'coreUp':
        audio.play('upgrade');
        audio.play('wave_clear');
        break;
      case 'nova':
        audio.play('nova');
        break;
      case 'strikeWarn':
        audio.play('obelisk_charge', { pan: pan(ev.x) });
        break;
      case 'strike':
        audio.play('obelisk_strike', { pan: pan(ev.x) });
        break;
      case 'harvest':
        audio.play('harvest', { pan: pan(ev.x) });
        break;
      case 'waveStart':
        audio.play('wave_start');
        audio.setMood(ev.plan.boss ? 'boss' : 'wave');
        break;
      case 'waveClear':
        audio.play('wave_clear');
        audio.setMood('build');
        break;
      case 'riftOpen':
        audio.play('rift_open', { pan: pan(ev.x) });
        break;
      case 'bossSpawn':
        audio.play('boss_spawn', { pan: pan(ev.x) });
        break;
      case 'thorns':
        audio.play('thorns', { pan: pan(ev.x), volume: 0.6 });
        break;
      case 'frost':
        audio.play('frost_pulse', { pan: pan(ev.x), volume: 0.5 });
        break;
      case 'error':
        audio.play('error');
        break;
      case 'defeat':
        audio.play('defeat');
        audio.setMood('defeat');
        break;
      case 'victory':
        audio.play('victory');
        audio.setMood('victory');
        break;
    }
  }
}

(window as unknown as { lumen: App }).lumen = new App();
