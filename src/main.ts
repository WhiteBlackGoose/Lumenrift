import './style.css';
import { audio, SfxName } from './audio/audio';
import { Bot } from './game/bot';
import { BUILDINGS, BuildingId, Difficulty, MAP_W } from './game/config';
import { Building, Game, GameEvent, SaveData } from './game/game';
import { isCoreTile } from './game/grid';
import { Renderer, ViewState } from './render/renderer';
import { Input } from './ui/input';
import { deleteSession, listSessions, loadSession, newSessionId, saveSession } from './ui/sessions';
import { saveBest } from './ui/storage';
import { applyDocument, onLangChange, t } from './i18n';
import { AppApi, bname, BUILD_KEYS, UI } from './ui/ui';

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
  /** Current saved session (null for attract mode and bot/debug runs). */
  private sessionId: string | null = null;
  private sessionCreated = 0;
  private saveTimer = 0;
  private gfxWarned = false;
  /** Snapshots taken at the start of recent build phases, oldest first (for respawning). */
  private checkpoints: SaveData[] = [];
  /** Night on which the Beacon fell in the current run (null while alive). */
  private fallenNight: number | null = null;

  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    applyDocument();
    this.renderer = new Renderer(canvas);
    this.ui = new UI(this);
    onLangChange(() => this.ui.relocalize());
    this.touch = matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch', this.touch);
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
        if (!this.touch) {
          this.touch = true;
          document.body.classList.add('touch');
          this.resize();
        }
      },
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && !this.attract && !this.game.over) {
        this.togglePause(true);
      }
      if (document.hidden) this.saveNow();
    });
    // closing the tab / app: save one last time
    window.addEventListener('pagehide', () => this.saveNow());
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
    const ins = this.attract ? { top: 0, bottom: 0, left: 0 } : this.ui.insets();
    this.renderer.resize(window.innerWidth, window.innerHeight, ins.top, ins.bottom, ins.left);
  }

  // ------------------------------------------------------------------ game lifecycle

  private startAttract(showTitle = true) {
    this.sessionId = null;
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
    this.beginRun(new Game(seed, d));
    this.checkpoints = [];
    this.takeCheckpoint();
    // debug runs (?bot / ?ff) are not saved as sessions
    if (!params.get('bot') && !params.get('ff')) {
      this.sessionId = newSessionId();
      this.sessionCreated = Date.now();
      this.saveNow();
    }
    if (params.get('bot')) this.autoBot = new Bot(this.game!, { skill: 0.8, maze: false });
    const ff = Number(params.get('ff') ?? 0);
    if (ff > 0) {
      const bot = this.autoBot ?? new Bot(this.game!, { skill: 0.8, maze: false });
      for (let i = 0; i < ff * 60 && !this.game!.over; i++) {
        bot.update(1 / 60);
        this.game!.step(1 / 60);
      }
      this.game!.drainEvents();
    }
    if (d === 'sandbox') this.ui.toast(t('sandbox.hint'), 'small info', 6);
    else this.tutorial();
  }

  /** Continue a saved session. It resumes paused so the player can get their bearings. */
  resumeSession(id: string) {
    const blob = loadSession(id);
    if (!blob) {
      deleteSession(id);
      this.ui.showTitle();
      return;
    }
    const data = blob.game;
    const created = listSessions().find((s) => s.id === id)?.created ?? Date.now();
    try {
      const g = Game.fromSave(data);
      this.difficulty = g.difficulty;
      this.beginRun(g);
      this.sessionId = id;
      this.sessionCreated = created;
      this.checkpoints = blob.checkpoints ?? [];
      if (blob.fallenNight) {
        // this run had fallen: continuing it means respawning
        this.fallenNight = blob.fallenNight;
        this.respawn();
        return;
      }
      this.paused = true;
      if (!this.checkpoints.length) this.takeCheckpoint(); // older saves had none
      this.ui.toast(t('saves.resumed', { n: g.phase === 'build' ? g.wave + 1 : g.wave }), 'small info', 5);
    } catch {
      deleteSession(id); // corrupt save: drop it rather than crash
      this.startAttract();
    }
  }

  deleteSession(id: string) {
    deleteSession(id);
  }

  /** Snapshot the game at the start of a build phase (kept for the last few nights). */
  private takeCheckpoint() {
    const g = this.game;
    if (!g || this.attract || g.sandbox || g.phase !== 'build') return;
    const cp = g.toSave();
    this.checkpoints = this.checkpoints.filter((c) => c.wave !== cp.wave);
    this.checkpoints.push(cp);
    this.checkpoints.sort((a, b) => a.wave - b.wave);
    if (this.checkpoints.length > 5) this.checkpoints.shift();
  }

  /** The night a respawn would return to (three nights before the fatal one), or null if impossible. */
  respawnNight(): number | null {
    const cp = this.respawnCheckpoint();
    return cp ? cp.wave + 1 : null;
  }

  private respawnCheckpoint(): SaveData | null {
    if (this.fallenNight === null || !this.checkpoints.length) return null;
    const target = Math.max(1, this.fallenNight - 3);
    // the latest checkpoint at or before the target night, else the earliest we still have
    const ok = this.checkpoints.filter((c) => c.wave + 1 <= target);
    return ok.length ? ok[ok.length - 1] : this.checkpoints[0];
  }

  /** Rewind to the checkpoint three nights back and try again, counting a new attempt. */
  respawn() {
    const cp = this.respawnCheckpoint();
    const old = this.game;
    if (!cp || !old) return;
    const attempts = (old.stats.attempts ?? 1) + 1;
    const g = Game.fromSave(cp);
    g.stats.attempts = attempts;
    const id = this.sessionId,
      created = this.sessionCreated;
    // checkpoints from the failed timeline after this point no longer apply
    this.checkpoints = this.checkpoints.filter((c) => c.wave <= cp.wave);
    this.beginRun(g);
    this.sessionId = id;
    this.sessionCreated = created;
    this.fallenNight = null;
    this.saveNow();
    this.ui.toast(t('toast.respawned', { a: attempts, n: g.wave + 1 }), 'small info', 4);
    audio.play('rift_open');
  }

  /** Shared setup for a fresh or restored game. */
  private beginRun(game: Game) {
    this.fallenNight = null;
    this.attract = null;
    this.autoBot = null;
    this.sessionId = null;
    this.renderer.reset();
    this.ui.resetRun();
    this.game = game;
    this.placing = null;
    this.selected = null;
    this.coreSelected = false;
    this.paused = false;
    this.speed = 1;
    this.overHandled = game.over;
    this.ui.closeScreen();
    this.ui.setHudVisible(true);
    this.resize();
    this.renderer.cam.reset();
    audio.setMood(game.phase === 'wave' ? (game.plan?.boss ? 'boss' : 'wave') : 'build');
  }

  /** Persist the current session (no-op outside a saved run). */
  saveNow() {
    const g = this.game;
    if (!g || this.attract || !this.sessionId) return;
    if (g.over && !g.won && this.fallenNight === null) return;
    saveSession(this.sessionId, g, this.sessionCreated, this.checkpoints, this.fallenNight ?? undefined);
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
      this.ui.toast(t('toast.buildHint'), 'small info', 3);
      return;
    }
    const tips = [t('tut.1'), t(this.touch ? 'tut.2.touch' : 'tut.2.click'), t('tut.3'), t('tut.4')];
    tips.forEach((t, i) => this.tutTimers.push(window.setTimeout(() => this.game && !this.attract && this.game.wave === 0 && this.ui.toast(t, 'small info', 5.2), 400 + i * 6000)));
  }

  restart() {
    // restarting abandons the current run
    if (this.sessionId) deleteSession(this.sessionId);
    this.startGame(this.difficulty);
  }

  toTitle() {
    this.saveNow();
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
      this.ui.toast(t('toast.novaCd'), 'small err', 1.2);
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
      if (!quiet) g.events.push({ type: 'error', msg: chk.reason!, vars: chk.vars });
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
        this.ui.toast(t('toast.unlocksAt', { name: bname(bid), n: BUILDINGS[bid].tier }), 'small err');
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

    let cleared = false;
    for (const ev of g.drainEvents()) {
      if (ev.type === 'waveClear') cleared = true;
      this.renderer.onEvent(ev, g);
      if (!this.attract) {
        this.ui.onEvent(ev, g);
        this.sound(ev);
      }
    }

    if (cleared && !g.over) this.takeCheckpoint();
    if (this.selected && !g.buildings.includes(this.selected)) this.selected = null;

    if (!this.attract) {
      if (g.over && !this.overHandled) {
        this.overHandled = true;
        const won = g.won;
        const best = !g.sandbox && saveBest(g.difficulty, won ? g.wave : g.wave - 1);
        // a victory stays resumable as endless night; a fall stays resumable as a respawn
        if (!won) this.fallenNight = g.wave;
        this.saveNow();
        this.placing = null;
        setTimeout(() => this.ui.showGameOver(g, won, best), won ? 1200 : 1800);
      }
      audio.setIntensity(Math.min(1, g.enemies.length / 40));
      // autosave every few seconds of play
      if (running && !g.over) {
        this.saveTimer += dt;
        if (this.saveTimer > 4) {
          this.saveTimer = 0;
          this.saveNow();
        }
      }
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
    if (this.renderer.graphicsBroken && !this.gfxWarned) {
      this.gfxWarned = true;
      this.ui.toast(t('warn.gfx'), 'small err', 12);
    }
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

(window as unknown as { lumenrift: App }).lumenrift = new App();

// Installable app: register the offline service worker in production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
