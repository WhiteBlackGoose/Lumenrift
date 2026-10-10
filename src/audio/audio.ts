// Procedural WebAudio engine for LUMENRIFT: synthesized SFX + generative ambient score.
// Everything is created lazily on unlock(); before that every call is a no-op.

export type SfxName =
  | 'arbalest'
  | 'mortar_fire'
  | 'explosion'
  | 'tesla'
  | 'pyre'
  | 'prism'
  | 'missile'
  | 'obelisk_charge'
  | 'obelisk_strike'
  | 'frost_pulse'
  | 'thorns'
  | 'hit'
  | 'enemy_die'
  | 'boss_die'
  | 'build'
  | 'upgrade'
  | 'sell'
  | 'error'
  | 'core_hit'
  | 'core_shot'
  | 'nova'
  | 'wave_start'
  | 'wave_clear'
  | 'rift_open'
  | 'boss_spawn'
  | 'ui_click'
  | 'harvest'
  | 'building_destroyed'
  | 'victory'
  | 'defeat'
  | 'splash'
  // day realm
  | 'javelin'
  | 'glyph'
  | 'bell'
  | 'gust'
  | 'snare'
  | 'halo'
  | 'falcon'
  | 'lens'
  | 'ballista'
  | 'titan_charge'
  | 'titan_slam'
  | 'daybreak'
  | 'blight_die'
  | 'blight_well';

export type Realm = 'night' | 'day';

export type Mood = 'menu' | 'build' | 'wave' | 'boss' | 'defeat' | 'victory';

interface PlayOpts {
  pan?: number;
  volume?: number;
}

/** Per-sound limits: minimum interval between triggers (s) and max simultaneous voices. */
const LIMITS: Partial<Record<SfxName, [number, number]>> = {
  hit: [0.03, 6],
  arbalest: [0.04, 6],
  pyre: [0.12, 3],
  enemy_die: [0.025, 8],
  thorns: [0.06, 4],
  tesla: [0.06, 4],
  mortar_fire: [0.06, 4],
  explosion: [0.05, 6],
  missile: [0.05, 6],
  prism: [0.15, 3],
  frost_pulse: [0.15, 3],
  core_shot: [0.08, 3],
  core_hit: [0.12, 3],
  splash: [0.08, 3],
  harvest: [0.08, 4],
  building_destroyed: [0.1, 3],
  ui_click: [0.03, 3],
  error: [0.15, 1],
  // day realm
  javelin: [0.05, 5],
  glyph: [0.06, 4],
  bell: [0.35, 3],
  gust: [0.15, 3],
  snare: [0.1, 3],
  halo: [0.3, 2],
  falcon: [0.6, 2],
  lens: [0.2, 2],
  ballista: [0.08, 3],
  titan_charge: [0.5, 2],
  titan_slam: [0.3, 2],
  daybreak: [0.5, 1],
  blight_die: [0.025, 8],
  blight_well: [0.5, 2],
};
const DEFAULT_LIMIT: [number, number] = [0.02, 4];
const MAX_VOICES = 40;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Voice {
  out: GainNode; // voice output (goes through panner)
  send: GainNode; // reverb send
  t: number;
}

interface MoodSpec {
  bpm: number;
  prog: number[][];
  stepsPerChord: number;
  pad: number;
  arp: number;
  bass: number;
  drums: number;
  arpProb: number;
}

// D dorian-ish progression: Dm9, Bbmaj7, C6/9, Am7
const PROG_CALM = [
  [50, 57, 60, 64, 65],
  [46, 53, 57, 62, 65],
  [48, 55, 60, 62, 67],
  [45, 52, 57, 60, 64],
];
// Darker phrygian flavour for bosses: Dm, Ebmaj, Dm, Db+
const PROG_BOSS = [
  [50, 57, 62, 65],
  [51, 58, 63, 67],
  [50, 57, 62, 65],
  [49, 56, 61, 65],
];
// Bright major resolution
const PROG_VICTORY = [
  [50, 57, 62, 66, 69],
  [55, 62, 67, 71, 74],
  [52, 59, 64, 67, 71],
  [57, 64, 69, 73, 76],
];

const MOODS: Record<Mood, MoodSpec> = {
  menu: { bpm: 64, prog: PROG_CALM, stepsPerChord: 32, pad: 1, arp: 0.5, bass: 0, drums: 0, arpProb: 0.16 },
  build: { bpm: 70, prog: PROG_CALM, stepsPerChord: 32, pad: 1, arp: 0.7, bass: 0, drums: 0, arpProb: 0.24 },
  wave: { bpm: 92, prog: PROG_CALM, stepsPerChord: 32, pad: 0.7, arp: 0.8, bass: 0.85, drums: 0.8, arpProb: 0.3 },
  boss: { bpm: 100, prog: PROG_BOSS, stepsPerChord: 16, pad: 0.8, arp: 0.7, bass: 1, drums: 1, arpProb: 0.35 },
  defeat: { bpm: 60, prog: PROG_CALM, stepsPerChord: 32, pad: 0, arp: 0, bass: 0, drums: 0, arpProb: 0 },
  victory: { bpm: 80, prog: PROG_VICTORY, stepsPerChord: 16, pad: 1, arp: 0.8, bass: 0, drums: 0, arpProb: 0.4 },
};

// ---- Day realm score: bright, warm, airy (C major / F lydian colours).
// Pastoral: Fmaj9, G6/9, Am7(add11), Cmaj7
const PROG_DAY_CALM = [
  [53, 60, 64, 67, 69],
  [55, 62, 67, 69, 71],
  [57, 64, 67, 72, 74],
  [48, 55, 64, 67, 71],
];
// Heroic I-V-vi-IV: C, G/B, Am, F
const PROG_DAY_WAVE = [
  [48, 55, 60, 64, 67],
  [47, 55, 62, 67, 71],
  [45, 52, 60, 64, 69],
  [41, 53, 60, 65, 69],
];
// Epic vi-IV-I-V: Am, F, C, G
const PROG_DAY_BOSS = [
  [45, 52, 57, 60, 64],
  [41, 53, 57, 60, 65],
  [48, 55, 60, 64, 67],
  [43, 55, 59, 62, 67],
];
// Radiant resolution: C, F/C, G/C, Cmaj9
const PROG_DAY_VICTORY = [
  [48, 55, 60, 64, 67],
  [48, 57, 60, 65, 69],
  [48, 55, 62, 67, 71],
  [48, 55, 64, 67, 74],
];

const DAY_MOODS: Record<Mood, MoodSpec> = {
  menu: { bpm: 72, prog: PROG_DAY_CALM, stepsPerChord: 32, pad: 0.9, arp: 0.6, bass: 0, drums: 0, arpProb: 0.2 },
  build: { bpm: 76, prog: PROG_DAY_CALM, stepsPerChord: 32, pad: 0.9, arp: 0.7, bass: 0, drums: 0, arpProb: 0.26 },
  wave: { bpm: 108, prog: PROG_DAY_WAVE, stepsPerChord: 32, pad: 0.6, arp: 0.75, bass: 0.8, drums: 0.75, arpProb: 0.28 },
  boss: { bpm: 112, prog: PROG_DAY_BOSS, stepsPerChord: 16, pad: 0.7, arp: 0.65, bass: 1, drums: 1, arpProb: 0.32 },
  defeat: { bpm: 66, prog: PROG_DAY_CALM, stepsPerChord: 32, pad: 0, arp: 0, bass: 0, drums: 0, arpProb: 0 },
  victory: { bpm: 84, prog: PROG_DAY_VICTORY, stepsPerChord: 16, pad: 1, arp: 0.8, bass: 0, drums: 0, arpProb: 0.4 },
};

const STORE_KEY = 'lumen.audio';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverbIn!: GainNode;
  private delayIn!: GainNode;
  private noiseBuf!: AudioBuffer;

  private padGain!: GainNode;
  private arpGain!: GainNode;
  private bassGain!: GainNode;
  private drumGain!: GainNode;

  private last = new Map<SfxName, number>();
  private active = new Map<SfxName, number>();
  private totalVoices = 0;

  private mood: Mood = 'menu';
  private realm: Realm = 'night';
  private realmFading = false;
  private realmTimer: number | null = null;
  private intensity = 0;
  private schedTimer: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private chordIdx = 0;
  private chord: number[] = PROG_CALM[0];

  private _sfxVolume = 0.7;
  private _musicVolume = 0.5;
  private _muted = false;

  constructor() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { sfx?: number; music?: number; muted?: boolean };
        if (typeof d.sfx === 'number') this._sfxVolume = clamp01(d.sfx);
        if (typeof d.music === 'number') this._musicVolume = clamp01(d.music);
        if (typeof d.muted === 'boolean') this._muted = d.muted;
      }
    } catch {
      /* storage unavailable */
    }
  }

  // ---------------------------------------------------------------- settings

  get sfxVolume(): number {
    return this._sfxVolume;
  }
  set sfxVolume(v: number) {
    this._sfxVolume = clamp01(v);
    this.applyVolumes();
    this.save();
  }
  get musicVolume(): number {
    return this._musicVolume;
  }
  set musicVolume(v: number) {
    this._musicVolume = clamp01(v);
    this.applyVolumes();
    this.save();
  }
  get muted(): boolean {
    return this._muted;
  }
  set muted(v: boolean) {
    this._muted = v;
    this.applyVolumes();
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ sfx: this._sfxVolume, music: this._musicVolume, muted: this._muted }),
      );
    } catch {
      /* ignore */
    }
  }

  private applyVolumes() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this._muted ? 0 : 1, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this._sfxVolume * 0.8, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this._musicVolume * 0.42, t, 0.1);
  }

  // ---------------------------------------------------------------- setup

  unlock(): void {
    try {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private init() {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;

    this.master = ctx.createGain();
    this.master.connect(comp);
    comp.connect(limiter);
    limiter.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    // noise buffer (2s white)
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

    // reverb (generated impulse)
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(3.2, 2.6);
    this.reverbIn = ctx.createGain();
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    this.reverbIn.connect(conv);
    conv.connect(revOut);
    revOut.connect(this.master);

    // ping-pong-ish delay for music arps
    this.delayIn = ctx.createGain();
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = 0.43;
    dr.delayTime.value = 0.64;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2400;
    const pl = ctx.createStereoPanner();
    const pr = ctx.createStereoPanner();
    pl.pan.value = -0.6;
    pr.pan.value = 0.6;
    this.delayIn.connect(dl);
    dl.connect(pl);
    dl.connect(dr);
    dr.connect(pr);
    dr.connect(dlp);
    dlp.connect(fb);
    fb.connect(dl);
    pl.connect(this.musicBus);
    pr.connect(this.musicBus);
    pl.connect(this.reverbIn);

    // music layers
    this.padGain = ctx.createGain();
    this.arpGain = ctx.createGain();
    this.bassGain = ctx.createGain();
    this.drumGain = ctx.createGain();
    for (const g of [this.padGain, this.arpGain, this.bassGain, this.drumGain]) {
      g.gain.value = 0;
      g.connect(this.musicBus);
    }
    const padRev = ctx.createGain();
    padRev.gain.value = 0.7;
    this.padGain.connect(padRev);
    padRev.connect(this.reverbIn);
    const arpRev = ctx.createGain();
    arpRev.gain.value = 0.5;
    this.arpGain.connect(arpRev);
    arpRev.connect(this.reverbIn);
    this.arpGain.connect(this.delayIn);

    this.master.gain.value = this._muted ? 0 : 1;
    this.sfxBus.gain.value = this._sfxVolume * 0.8;
    this.musicBus.gain.value = this._musicVolume * 0.42;

    this.nextStepTime = ctx.currentTime + 0.1;
    this.chord = this.moods[this.mood].prog[0];
    this.updateLayers(0.5);
    this.schedTimer = window.setInterval(() => this.schedule(), 25);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const k = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, decay) * (i < 200 ? i / 200 : 1);
      }
    }
    return buf;
  }

  // ---------------------------------------------------------------- primitives

  private tone(
    dest: AudioNode,
    type: OscillatorType,
    f0: number,
    f1: number | null,
    t: number,
    dur: number,
    peak: number,
    attack = 0.004,
    filterFreq = 0,
    detune = 0,
  ) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (filterFreq > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(
    dest: AudioNode,
    t: number,
    dur: number,
    peak: number,
    ftype: BiquadFilterType,
    f0: number,
    f1: number | null = null,
    q = 1,
    attack = 0.003,
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = ftype;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== null) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private newVoice(pan: number, vol: number, reverb: number): Voice {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(p);
    p.connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = reverb;
    p.connect(send);
    send.connect(this.reverbIn);
    return { out, send, t: ctx.currentTime + 0.005 };
  }

  // ---------------------------------------------------------------- sfx

  play(name: SfxName, opts?: PlayOpts): void {
    const ctx = this.ctx;
    if (!ctx || this._muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const [minGap, maxVoices] = LIMITS[name] ?? DEFAULT_LIMIT;
    const last = this.last.get(name) ?? -1;
    if (now - last < minGap) return;
    const act = this.active.get(name) ?? 0;
    if (act >= maxVoices) return;
    if (this.totalVoices >= MAX_VOICES && !isImportant(name)) return;
    this.last.set(name, now);

    const vol = clamp01(opts?.volume ?? 1);
    const pan = opts?.pan ?? 0;
    const dur = this.render(name, pan, vol);
    this.active.set(name, act + 1);
    this.totalVoices++;
    window.setTimeout(() => {
      this.active.set(name, Math.max(0, (this.active.get(name) ?? 1) - 1));
      this.totalVoices = Math.max(0, this.totalVoices - 1);
    }, dur * 1000 + 60);
  }

  /** Renders a sound; returns its approximate duration in seconds. */
  private render(name: SfxName, pan: number, vol: number): number {
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (name) {
      case 'arbalest': {
        const v = this.newVoice(pan, vol, 0.05);
        const t = v.t;
        const p = r(0.94, 1.08);
        this.noise(v.out, t, 0.03, 0.25, 'highpass', 3000);
        this.tone(v.out, 'triangle', 620 * p, 360 * p, t, 0.13, 0.22, 0.002);
        this.tone(v.out, 'sine', 1240 * p, 900 * p, t, 0.06, 0.06, 0.002);
        return 0.15;
      }
      case 'mortar_fire': {
        const v = this.newVoice(pan, vol, 0.12);
        const t = v.t;
        this.tone(v.out, 'sine', 150, 48, t, 0.3, 0.6, 0.003);
        this.noise(v.out, t, 0.18, 0.3, 'lowpass', 900, 200);
        return 0.32;
      }
      case 'explosion': {
        const v = this.newVoice(pan, vol, 0.25);
        const t = v.t;
        const p = r(0.85, 1.1);
        this.tone(v.out, 'sine', 95 * p, 32, t, 0.55, 0.75, 0.004);
        this.noise(v.out, t, 0.6, 0.45, 'lowpass', 1600 * p, 180, 0.8);
        this.noise(v.out, t, 0.12, 0.2, 'bandpass', 3000, 900, 1.5);
        return 0.62;
      }
      case 'tesla': {
        const v = this.newVoice(pan, vol, 0.15);
        const t = v.t;
        const ctx = this.ctx!;
        const o = ctx.createOscillator();
        o.type = 'square';
        const dur = 0.2;
        for (let i = 0; i < 12; i++) o.frequency.setValueAtTime(r(500, 2600), t + (i * dur) / 12);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1800;
        bp.Q.value = 0.7;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(bp);
        bp.connect(g);
        g.connect(v.out);
        o.start(t);
        o.stop(t + dur + 0.05);
        this.noise(v.out, t, 0.16, 0.22, 'highpass', 4500, null, 0.7);
        this.tone(v.out, 'sawtooth', 60, 50, t, 0.18, 0.08, 0.002, 400);
        return 0.22;
      }
      case 'pyre': {
        const v = this.newVoice(pan, vol, 0.1);
        const t = v.t;
        this.noise(v.out, t, 0.38, 0.28, 'bandpass', 700, 1700, 0.9, 0.08);
        this.noise(v.out, t, 0.3, 0.12, 'lowpass', 400, 250, 1, 0.05);
        return 0.4;
      }
      case 'prism': {
        const v = this.newVoice(pan, vol, 0.35);
        const t = v.t;
        this.tone(v.out, 'sine', 880, 990, t, 0.35, 0.1, 0.03);
        this.tone(v.out, 'sine', 1320, 1480, t, 0.3, 0.06, 0.03);
        this.tone(v.out, 'triangle', 2640, 2960, t, 0.2, 0.025, 0.02);
        return 0.37;
      }
      case 'missile': {
        const v = this.newVoice(pan, vol, 0.12);
        const t = v.t;
        this.noise(v.out, t, 0.4, 0.22, 'bandpass', 400, 2200, 2, 0.02);
        this.tone(v.out, 'sawtooth', 180, 420, t, 0.3, 0.05, 0.01, 1200);
        return 0.42;
      }
      case 'obelisk_charge': {
        const v = this.newVoice(pan, vol, 0.4);
        const t = v.t;
        const ctx = this.ctx!;
        const dur = 1.0;
        for (const [type, mul, det] of [
          ['sawtooth', 1, -8],
          ['sawtooth', 1.5, 8],
          ['sine', 2, 0],
        ] as [OscillatorType, number, number][]) {
          const o = ctx.createOscillator();
          o.type = type;
          o.detune.value = det;
          o.frequency.setValueAtTime(110 * mul, t);
          o.frequency.exponentialRampToValueAtTime(880 * mul, t + dur);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(300, t);
          f.frequency.exponentialRampToValueAtTime(5000, t + dur);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.95);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
          o.connect(f);
          f.connect(g);
          g.connect(v.out);
          o.start(t);
          o.stop(t + dur + 0.12);
        }
        return dur + 0.1;
      }
      case 'obelisk_strike': {
        const v = this.newVoice(pan, vol, 0.6);
        const t = v.t;
        this.tone(v.out, 'sine', 70, 24, t, 1.3, 0.9, 0.005);
        this.noise(v.out, t, 1.5, 0.55, 'lowpass', 4000, 140, 0.7);
        this.noise(v.out, t, 0.08, 0.35, 'highpass', 2500);
        this.tone(v.out, 'sine', 1760, 1740, t, 1.6, 0.08, 0.01);
        this.tone(v.out, 'sine', 2637, 2600, t, 1.2, 0.05, 0.01);
        return 1.6;
      }
      case 'frost_pulse': {
        const v = this.newVoice(pan, vol, 0.6);
        const t = v.t;
        for (let i = 0; i < 5; i++) {
          const f = r(2000, 4200);
          this.tone(v.out, 'sine', f, f * 1.01, t + i * 0.025, r(0.25, 0.5), 0.04, 0.003);
        }
        this.noise(v.out, t, 0.3, 0.05, 'highpass', 7000, null, 0.5, 0.05);
        return 0.6;
      }
      case 'thorns': {
        const v = this.newVoice(pan, vol, 0.03);
        const t = v.t;
        this.noise(v.out, t, 0.04, 0.16, 'highpass', 2500);
        this.tone(v.out, 'triangle', r(280, 340), 180, t, 0.06, 0.12, 0.001);
        return 0.07;
      }
      case 'hit': {
        const v = this.newVoice(pan, vol, 0.02);
        const t = v.t;
        this.noise(v.out, t, 0.045, 0.14, 'bandpass', r(1600, 2600), null, 1.5);
        return 0.05;
      }
      case 'enemy_die': {
        const v = this.newVoice(pan, vol, 0.15);
        const t = v.t;
        const p = r(0.8, 1.25);
        this.noise(v.out, t, 0.22, 0.2, 'bandpass', 1200 * p, 250, 1.2);
        this.tone(v.out, 'sine', 420 * p, 110, t, 0.18, 0.12, 0.003);
        return 0.23;
      }
      case 'boss_die': {
        const v = this.newVoice(pan, vol, 0.7);
        const t = v.t;
        this.tone(v.out, 'sawtooth', 130, 28, t, 2.2, 0.28, 0.02, 700);
        this.tone(v.out, 'sawtooth', 137, 30, t, 2.2, 0.22, 0.02, 600);
        this.tone(v.out, 'sine', 80, 22, t, 1.6, 0.8, 0.005);
        this.noise(v.out, t, 2.0, 0.5, 'lowpass', 3000, 100, 0.6);
        this.tone(v.out, 'sine', 1318, 1318, t + 0.4, 2.2, 0.06, 0.4);
        this.tone(v.out, 'sine', 1976, 1976, t + 0.5, 2.0, 0.04, 0.4);
        return 2.7;
      }
      case 'build': {
        const v = this.newVoice(pan, vol, 0.3);
        const t = v.t;
        this.tone(v.out, 'sine', 120, 70, t, 0.12, 0.3, 0.002);
        this.noise(v.out, t, 0.06, 0.12, 'lowpass', 1500);
        this.bell(v.out, mtof(79), t + 0.03, 0.5, 0.1);
        this.bell(v.out, mtof(86), t + 0.1, 0.6, 0.08);
        return 0.72;
      }
      case 'upgrade': {
        const v = this.newVoice(pan, vol, 0.4);
        const t = v.t;
        [74, 78, 81, 86].forEach((m, i) => this.bell(v.out, mtof(m), t + i * 0.07, 0.6, 0.08));
        this.noise(v.out, t, 0.5, 0.04, 'highpass', 6000, null, 0.5, 0.2);
        return 0.9;
      }
      case 'sell': {
        const v = this.newVoice(pan, vol, 0.25);
        const t = v.t;
        this.bell(v.out, mtof(88), t, 0.3, 0.08);
        this.bell(v.out, mtof(81), t + 0.08, 0.4, 0.08);
        return 0.5;
      }
      case 'error': {
        const v = this.newVoice(pan, vol, 0.05);
        const t = v.t;
        this.tone(v.out, 'square', 150, 140, t, 0.09, 0.08, 0.003, 900);
        this.tone(v.out, 'square', 112, 105, t + 0.11, 0.12, 0.08, 0.003, 900);
        return 0.25;
      }
      case 'core_hit': {
        const v = this.newVoice(pan, vol, 0.35);
        const t = v.t;
        this.tone(v.out, 'sine', 110, 55, t, 0.3, 0.45, 0.003);
        this.tone(v.out, 'triangle', 622, 600, t, 0.4, 0.06, 0.003);
        this.tone(v.out, 'triangle', 660, 640, t, 0.4, 0.06, 0.003);
        return 0.42;
      }
      case 'core_shot': {
        const v = this.newVoice(pan, vol, 0.25);
        const t = v.t;
        this.tone(v.out, 'sine', 660, 720, t, 0.18, 0.09, 0.005);
        this.tone(v.out, 'sine', 990, 1080, t, 0.12, 0.04, 0.005);
        return 0.2;
      }
      case 'nova': {
        const v = this.newVoice(pan, vol, 0.6);
        const t = v.t;
        this.tone(v.out, 'sine', 220, 38, t, 0.9, 0.75, 0.01);
        this.noise(v.out, t, 0.9, 0.35, 'lowpass', 300, 5000, 0.8, 0.12);
        [62, 69, 74, 78, 81].forEach((m, i) => this.bell(v.out, mtof(m), t + 0.05 + i * 0.03, 1.4, 0.06));
        return 1.5;
      }
      case 'wave_start': {
        const v = this.newVoice(pan, vol, 0.5);
        const t = v.t;
        this.tone(v.out, 'sawtooth', 73.4, 73.4, t, 1.8, 0.2, 0.5, 500);
        this.tone(v.out, 'sawtooth', 110, 110, t, 1.8, 0.14, 0.5, 450, 7);
        this.tone(v.out, 'sawtooth', 73.4, 69.3, t + 0.9, 1.4, 0.12, 0.2, 380, -7);
        this.tone(v.out, 'sine', 55, 55, t, 1.8, 0.35, 0.3);
        return 2.4;
      }
      case 'wave_clear': {
        const v = this.newVoice(pan, vol, 0.5);
        const t = v.t;
        [74, 76, 81, 83, 86, 88].forEach((m, i) => this.bell(v.out, mtof(m), t + i * 0.09, 1.2, 0.07));
        this.tone(v.out, 'triangle', mtof(62), null, t, 1.2, 0.08, 0.05);
        return 1.8;
      }
      case 'rift_open': {
        const v = this.newVoice(pan, vol, 0.6);
        const t = v.t;
        this.noise(v.out, t, 1.6, 0.3, 'bandpass', 3000, 120, 3, 0.3);
        this.tone(v.out, 'sawtooth', 58, 41, t, 1.8, 0.18, 0.4, 350);
        this.tone(v.out, 'sawtooth', 61.5, 43, t, 1.8, 0.15, 0.4, 350);
        return 2.0;
      }
      case 'boss_spawn': {
        const v = this.newVoice(pan, vol, 0.6);
        const t = v.t;
        this.tone(v.out, 'sawtooth', 55, 55, t, 2.6, 0.25, 0.6, 450);
        this.tone(v.out, 'sawtooth', 77.8, 73.4, t + 0.2, 2.4, 0.18, 0.6, 450); // tritone-ish
        this.tone(v.out, 'sine', 41, 36, t, 2.6, 0.5, 0.5);
        this.noise(v.out, t, 2.2, 0.12, 'lowpass', 200, 800, 2, 0.8);
        return 3.0;
      }
      case 'ui_click': {
        const v = this.newVoice(pan, vol, 0);
        const t = v.t;
        this.tone(v.out, 'sine', 1200, 1100, t, 0.035, 0.08, 0.001);
        return 0.05;
      }
      case 'harvest': {
        const v = this.newVoice(pan, vol, 0.4);
        const t = v.t;
        this.bell(v.out, 1320, t, 0.4, 0.06);
        this.bell(v.out, 1760, t + 0.05, 0.5, 0.05);
        return 0.6;
      }
      case 'building_destroyed': {
        const v = this.newVoice(pan, vol, 0.3);
        const t = v.t;
        this.tone(v.out, 'sine', 100, 40, t, 0.4, 0.5, 0.003);
        for (let i = 0; i < 4; i++) this.noise(v.out, t + i * 0.07, 0.25, 0.2, 'lowpass', r(600, 1400), 150, 1);
        return 0.6;
      }
      case 'victory': {
        const v = this.newVoice(pan, vol, 0.6);
        const t = v.t;
        [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => this.bell(v.out, mtof(m), t + i * 0.12, 2, 0.08));
        [50, 57, 62, 66].forEach((m) => this.tone(v.out, 'triangle', mtof(m), null, t + 0.8, 2.6, 0.07, 0.3));
        return 3.5;
      }
      case 'defeat': {
        const v = this.newVoice(pan, vol, 0.7);
        const t = v.t;
        [74, 70, 67, 62, 58].forEach((m, i) =>
          this.tone(v.out, 'triangle', mtof(m), mtof(m) * 0.995, t + i * 0.35, 1.2, 0.12, 0.02),
        );
        this.tone(v.out, 'sine', mtof(38), mtof(36), t + 1.4, 2.5, 0.3, 0.3);
        return 4;
      }
      case 'splash': {
        const v = this.newVoice(pan, vol, 0.1);
        const t = v.t;
        this.noise(v.out, t, 0.22, 0.16, 'lowpass', 1400, 300, 1.5, 0.01);
        this.tone(v.out, 'sine', 300, 140, t, 0.12, 0.06, 0.004);
        return 0.25;
      }
      // ======================================================== day realm
      case 'javelin': {
        const v = this.newVoice(pan, vol, 0.08);
        const t = v.t;
        const p = r(0.9, 1.1);
        this.noise(v.out, t, 0.16, 0.2, 'bandpass', 1200 * p, 3600 * p, 1.6, 0.02);
        this.tone(v.out, 'triangle', 230 * p, 120, t + 0.11, 0.09, 0.14, 0.002);
        this.noise(v.out, t + 0.11, 0.03, 0.08, 'lowpass', 900);
        return 0.22;
      }
      case 'glyph': {
        const v = this.newVoice(pan, vol, 0.4);
        const t = v.t;
        const base = [84, 88, 91, 96];
        for (let k = 0; k < 3; k++) this.bell(v.out, mtof(base[Math.floor(Math.random() * base.length)]), t + k * 0.03, 0.45, 0.05);
        this.noise(v.out, t, 0.25, 0.06, 'highpass', 6500, null, 0.6, 0.005);
        this.tone(v.out, 'sine', 300, 120, t, 0.15, 0.12, 0.003);
        return 0.5;
      }
      case 'bell': {
        // bronze toll: hum, prime, minor-third tierce, quint, nominal; higher partials die faster
        const v = this.newVoice(pan, vol, 0.45);
        const t = v.t;
        const roots = [55, 57, 60, 62, 64]; // pentatonic so overlapping bells stay consonant
        const f = mtof(roots[Math.floor(Math.random() * roots.length)]);
        const lp = this.ctx!.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3200;
        lp.connect(v.out);
        const parts: [number, number, number][] = [
          [0.5, 0.09, 2.6],
          [1, 0.1, 2.2],
          [1.19, 0.05, 1.6],
          [1.5, 0.035, 1.3],
          [2, 0.05, 1.1],
          [2.51, 0.02, 0.7],
          [3.01, 0.012, 0.5],
        ];
        for (const [mul, amp, dur] of parts) this.tone(lp, 'sine', f * mul, f * mul * 0.998, t, dur, amp, 0.002);
        this.noise(lp, t, 0.02, 0.06, 'bandpass', 2400, null, 2, 0.001); // strike
        return 2.6;
      }
      case 'gust': {
        const v = this.newVoice(pan, vol, 0.2);
        const t = v.t;
        const ctx = this.ctx!;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.3;
        f.frequency.setValueAtTime(320, t);
        f.frequency.exponentialRampToValueAtTime(1300, t + 0.25);
        f.frequency.exponentialRampToValueAtTime(420, t + 0.65);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.28, t + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        src.connect(f);
        f.connect(g);
        g.connect(v.out);
        src.start(t, Math.random() * 1.5);
        src.stop(t + 0.75);
        this.noise(v.out, t + 0.05, 0.45, 0.05, 'highpass', 5000, null, 0.5, 0.1);
        return 0.75;
      }
      case 'snare': {
        const v = this.newVoice(pan, vol, 0.12);
        const t = v.t;
        this.tone(v.out, 'sine', 420, 120, t, 0.13, 0.22, 0.003);
        this.noise(v.out, t, 0.18, 0.16, 'bandpass', 1300, 380, 6, 0.004);
        this.tone(v.out, 'sine', 180, 260, t + 0.1, 0.08, 0.06, 0.004); // sticky pull
        return 0.25;
      }
      case 'halo': {
        const v = this.newVoice(pan, vol, 0.4);
        const t = v.t;
        this.noise(v.out, t, 0.28, 0.07, 'bandpass', 3800, 6200, 4, 0.06);
        this.tone(v.out, 'sine', 1760, 1800, t, 0.32, 0.03, 0.05);
        this.tone(v.out, 'sine', 2640, 2700, t, 0.26, 0.02, 0.05);
        return 0.35;
      }
      case 'falcon': {
        const v = this.newVoice(pan, vol, 0.25);
        const t = v.t;
        const ctx = this.ctx!;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(2300, t);
        o.frequency.linearRampToValueAtTime(3300, t + 0.05);
        o.frequency.exponentialRampToValueAtTime(1900, t + 0.2);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2900;
        bp.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.045, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(bp);
        bp.connect(g);
        g.connect(v.out);
        o.start(t);
        o.stop(t + 0.25);
        return 0.25;
      }
      case 'lens': {
        const v = this.newVoice(pan, vol, 0.25);
        const t = v.t;
        this.tone(v.out, 'sawtooth', 220, 232, t, 0.35, 0.035, 0.02, 1500);
        this.tone(v.out, 'sawtooth', 330, 345, t, 0.35, 0.025, 0.02, 1500, 6);
        this.noise(v.out, t, 0.3, 0.07, 'highpass', 6000, null, 0.7, 0.02);
        return 0.38;
      }
      case 'ballista': {
        const v = this.newVoice(pan, vol, 0.15);
        const t = v.t;
        const p = r(0.92, 1.06);
        this.noise(v.out, t, 0.04, 0.2, 'bandpass', 900, null, 1.2, 0.001);
        this.tone(v.out, 'triangle', 190 * p, 90 * p, t, 0.28, 0.25, 0.002);
        this.tone(v.out, 'sine', 95 * p, 58, t, 0.3, 0.35, 0.003);
        this.tone(v.out, 'triangle', 380 * p, 300 * p, t + 0.01, 0.18, 0.05, 0.002);
        return 0.32;
      }
      case 'titan_charge': {
        const v = this.newVoice(pan, vol, 0.4);
        const t = v.t;
        for (let k = 0; k < 4; k++) {
          const f = 300 + k * 180;
          this.noise(v.out, t + k * 0.22, 0.2, 0.14 + k * 0.03, 'bandpass', f, f * 1.6, 1.5, 0.05);
        }
        this.noise(v.out, t, 1.0, 0.12, 'bandpass', 200, 3000, 0.8, 0.6);
        return 1.05;
      }
      case 'titan_slam': {
        const v = this.newVoice(pan, vol, 0.55);
        const t = v.t;
        this.tone(v.out, 'sine', 62, 24, t, 1.2, 0.9, 0.004);
        this.noise(v.out, t, 1.3, 0.5, 'lowpass', 2500, 120, 0.7, 0.003);
        for (let k = 0; k < 4; k++) this.noise(v.out, t + 0.05 + k * 0.08, 0.2, 0.12, 'lowpass', r(500, 1100), 150, 1);
        [84, 88, 91].forEach((m, k) => this.bell(v.out, mtof(m), t + 0.08 + k * 0.05, 1.2, 0.045));
        return 1.4;
      }
      case 'daybreak': {
        const v = this.newVoice(pan, vol, 0.6);
        const t = v.t;
        this.tone(v.out, 'sine', 260, 70, t, 0.8, 0.6, 0.01);
        this.noise(v.out, t, 0.9, 0.22, 'highpass', 1500, 7000, 0.7, 0.2);
        [72, 76, 79, 84, 88].forEach((m, k) => this.bell(v.out, mtof(m), t + 0.03 + k * 0.035, 1.6, 0.065));
        [48, 55, 64].forEach((m) => this.tone(v.out, 'triangle', mtof(m), null, t + 0.05, 1.4, 0.07, 0.15, 2500));
        return 1.7;
      }
      case 'blight_die': {
        const v = this.newVoice(pan, vol, 0.12);
        const t = v.t;
        const p = r(0.8, 1.25);
        this.tone(v.out, 'sine', 300 * p, 90, t, 0.12, 0.16, 0.003);
        this.noise(v.out, t, 0.18, 0.18, 'bandpass', 900 * p, 300, 5, 0.004);
        this.noise(v.out, t, 0.015, 0.1, 'highpass', 3000);
        return 0.2;
      }
      case 'blight_well': {
        const v = this.newVoice(pan, vol, 0.5);
        const t = v.t;
        this.tone(v.out, 'sine', 46, 33, t, 1.7, 0.4, 0.2);
        this.noise(v.out, t, 1.6, 0.28, 'lowpass', 320, 140, 1.5, 0.25);
        for (let k = 0; k < 6; k++) this.noise(v.out, t + Math.random() * 1.0, 0.04, 0.1, 'highpass', r(1500, 3000), null, 1, 0.001);
        for (let k = 0; k < 3; k++) {
          const tt = t + 0.9 + k * r(0.15, 0.3);
          this.tone(v.out, 'sine', r(110, 150), r(240, 300), tt, 0.1, 0.1, 0.005);
        }
        return 1.9;
      }
    }
  }

  /** Soft bell/chime: sine + inharmonic partial. */
  private bell(dest: AudioNode, f: number, t: number, dur: number, peak: number) {
    this.tone(dest, 'sine', f, null, t, dur, peak, 0.003);
    this.tone(dest, 'sine', f * 2.76, null, t, dur * 0.4, peak * 0.25, 0.002);
    this.tone(dest, 'triangle', f * 2, null, t, dur * 0.6, peak * 0.15, 0.002);
  }

  // ---------------------------------------------------------------- music

  /** Mood table for the current realm (night keeps the original score). */
  private get moods(): Record<Mood, MoodSpec> {
    return this.realm === 'day' ? DAY_MOODS : MOODS;
  }

  /**
   * Switch between the night and day scores. Safe before unlock (the realm is remembered);
   * once running, the music dips out, swaps instruments/progressions and fades back in.
   */
  setRealm(r: Realm): void {
    if (r === this.realm && !this.realmFading) return;
    if (!this.ctx) {
      this.realm = r;
      this.chord = this.moods[this.mood].prog[0];
      return;
    }
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.realmFading = true;
    for (const g of [this.padGain, this.arpGain, this.bassGain, this.drumGain]) g.gain.setTargetAtTime(0, t, 0.25);
    if (this.realmTimer !== null) window.clearTimeout(this.realmTimer);
    this.realmTimer = window.setTimeout(() => {
      this.realmTimer = null;
      this.realm = r;
      this.realmFading = false;
      this.chordIdx = 0;
      this.step = 0;
      if (this.ctx) {
        this.nextStepTime = Math.max(this.nextStepTime, this.ctx.currentTime + 0.05);
        this.updateLayers(1.4);
      }
    }, 900);
  }

  setMood(m: Mood): void {
    if (m === this.mood) return;
    const prev = this.mood;
    this.mood = m;
    if (!this.ctx) return;
    if (this.moods[m].prog !== this.moods[prev].prog) {
      this.chordIdx = 0;
      this.step = 0; // restart phrase so the new progression lands on a downbeat
    }
    this.updateLayers(m === 'defeat' ? 2.5 : 1.2);
    if (m === 'defeat') {
      if (this.realm === 'day') this.dayDefeatMotif();
      else this.defeatMotif();
    }
  }

  setIntensity(x: number): void {
    const v = clamp01(x);
    if (Math.abs(v - this.intensity) < 0.02) return;
    this.intensity = v;
    if (this.ctx) this.updateLayers(1.5);
  }

  private updateLayers(tc: number) {
    if (this.realmFading) return; // the realm crossfade restores the layers itself
    const ctx = this.ctx!;
    const s = this.moods[this.mood];
    const t = ctx.currentTime;
    const i = this.mood === 'wave' || this.mood === 'boss' ? this.intensity : 1;
    const tc3 = tc / 3;
    this.padGain.gain.setTargetAtTime(s.pad * 0.5, t, tc3);
    this.arpGain.gain.setTargetAtTime(s.arp * 0.45, t, tc3);
    this.bassGain.gain.setTargetAtTime(s.bass * (0.55 + 0.45 * i) * 0.55, t, tc3);
    this.drumGain.gain.setTargetAtTime(s.drums * (0.35 + 0.65 * i) * 0.6, t, tc3);
  }

  private defeatMotif() {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.3;
    const dest = this.musicBus;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    g.connect(dest);
    g.connect(this.reverbIn);
    [69, 65, 62, 60, 57, 53, 50].forEach((m, i) => {
      this.tone(g, 'triangle', mtof(m), null, t + i * 0.55, 1.6, 0.1, 0.05, 2000);
      this.tone(g, 'sine', mtof(m - 12), null, t + i * 0.55, 1.8, 0.06, 0.08);
    });
    this.tone(g, 'sine', mtof(38), null, t + 3.6, 5, 0.12, 1.0);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const ahead = 0.15;
    // If the tab was backgrounded, don't try to catch up on missed steps.
    if (this.nextStepTime < ctx.currentTime - 0.2) this.nextStepTime = ctx.currentTime + 0.05;
    while (this.nextStepTime < ctx.currentTime + ahead) {
      const spec = this.moods[this.mood];
      const stepDur = 60 / spec.bpm / 4;
      this.playStep(spec, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  private playStep(s: MoodSpec, t: number, stepDur: number) {
    if (this.mood === 'defeat') return;
    if (this.realm === 'day') {
      this.playDayStep(s, t, stepDur);
      return;
    }
    const st = this.step % s.stepsPerChord;
    if (st === 0) {
      this.chord = s.prog[this.chordIdx % s.prog.length];
      this.chordIdx++;
      if (s.pad > 0) this.padChord(this.chord, t, stepDur * s.stepsPerChord);
    }
    const combat = this.mood === 'wave' || this.mood === 'boss';
    const i = combat ? this.intensity : 0;
    const beat = this.step % 16;

    // arpeggio
    if (s.arp > 0) {
      const onEighth = beat % 2 === 0;
      const prob = combat ? s.arpProb + 0.45 * i : s.arpProb;
      const allowed = combat && i > 0.45 ? true : onEighth;
      if (allowed && Math.random() < prob) {
        const tones = this.chord.slice(1);
        const m = tones[Math.floor(Math.random() * tones.length)] + 12 * (Math.random() < 0.4 ? 2 : 1);
        this.pluck(m, t, combat ? 0.35 : 0.7, combat ? 0.05 : 0.045);
      }
    }

    // bass pulse
    if (s.bass > 0 && beat % 2 === 0) {
      const root = this.chord[0] - 12;
      const m = beat % 8 === 6 && Math.random() < 0.3 ? root + 7 : root;
      this.bassNote(m, t, stepDur * 1.8);
    }

    // drums
    if (s.drums > 0) {
      const boss = this.mood === 'boss';
      if (beat === 0 || beat === 8 || (boss && (beat === 4 || beat === 12))) this.kick(t);
      if (i > 0.25 && beat % 4 === 2) this.tick(t, 0.05);
      if (i > 0.6 && beat % 2 === 1 && Math.random() < 0.5) this.tick(t, 0.025);
      if (boss && beat === 14) this.tom(t);
    }
  }

  // ---------------------------------------------------------------- day score

  private playDayStep(s: MoodSpec, t: number, stepDur: number) {
    const st = this.step % s.stepsPerChord;
    const combat = this.mood === 'wave' || this.mood === 'boss';
    const boss = this.mood === 'boss';
    const calm = this.mood === 'menu' || this.mood === 'build';
    const i = combat ? this.intensity : 0;
    const beat = this.step % 16;

    if (st === 0) {
      this.chord = s.prog[this.chordIdx % s.prog.length];
      this.chordIdx++;
      if (s.pad > 0) this.dayPad(this.chord, t, stepDur * s.stepsPerChord);
      if (combat) this.brassSwell(this.chord, t, stepDur * Math.min(16, s.stepsPerChord), boss);
      // a soft flute phrase now and then over the calm score
      if ((calm || this.mood === 'victory') && Math.random() < 0.55) this.flutePhrase(this.chord, t + stepDur * 4, stepDur);
    }

    // harp arpeggio: rolling upward figures on eighths, denser in combat
    if (s.arp > 0) {
      const onEighth = beat % 2 === 0;
      const prob = combat ? s.arpProb + 0.4 * i : s.arpProb;
      const allowed = combat && i > 0.5 ? true : onEighth;
      if (allowed && Math.random() < prob) {
        const tones = this.chord.slice(1);
        const idx = (this.step >> 1) % tones.length; // ascending roll
        const m = tones[Math.random() < 0.7 ? idx : Math.floor(Math.random() * tones.length)] + 12 * (Math.random() < 0.35 ? 2 : 1);
        this.harp(m, t, combat ? 0.45 : 0.9, combat ? 0.045 : 0.04);
      }
    }

    // birdsong: very occasional, only in the calm score
    if (calm && Math.random() < 0.0035) this.birdsong(t);

    // pulse bass
    if (s.bass > 0 && beat % 2 === 0) {
      const root = this.chord[0] - 12;
      const m = beat % 8 === 6 && Math.random() < 0.35 ? root + 7 : root;
      this.dayBass(m, t, stepDur * 1.7, boss);
    }

    // percussion: soft kick, tambourine, hand drums; timpani for bosses
    if (s.drums > 0) {
      if (boss) {
        if (beat === 0 || beat === 8) this.timpani(t, this.chord[0] - 24, 0.55);
        if (beat === 6 || (i > 0.5 && beat === 14)) this.timpani(t, this.chord[0] - 17, 0.35);
        if (i > 0.7 && beat === 15) this.timpani(t, this.chord[0] - 24, 0.3);
      } else if (beat === 0 || beat === 8) {
        this.tone(this.drumGain, 'sine', 100, 50, t, 0.3, 0.45, 0.002);
      }
      if (beat % 4 === 2) this.tambourine(t, 0.05);
      if (i > 0.35 && beat % 2 === 1 && Math.random() < 0.6) this.tambourine(t, 0.022);
      if (beat === 6 || beat === 14 || (i > 0.55 && beat === 11)) this.handDrum(t, beat === 14 ? 0.11 : 0.08);
    }
  }

  /** Warm, airy pad: triangles with gentle detune and an opening filter. */
  private dayPad(notes: number[], t: number, len: number) {
    const ctx = this.ctx!;
    const dur = len + 1.5;
    const boss = this.mood === 'boss';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(boss ? 900 : 1300, t);
    lp.frequency.linearRampToValueAtTime(boss ? 1500 : 2400, t + len * 0.5);
    lp.frequency.linearRampToValueAtTime(1100, t + dur);
    lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085, t + Math.min(2.5, len * 0.3));
    g.gain.setValueAtTime(0.085, t + len - 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g);
    g.connect(this.padGain);
    for (const n of notes) {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = n < 52 ? 'sine' : 'triangle';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = n < 52 ? 0.45 : 0.3;
        o.connect(og);
        og.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  /** Harp-like pluck: bright attack, ringing sine body. */
  private harp(m: number, t: number, dur: number, peak: number) {
    const ctx = this.ctx!;
    const f = mtof(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.3);
    g.connect(this.arpGain);
    const parts: [OscillatorType, number, number][] = [
      ['sine', 1, 1],
      ['triangle', 2, 0.22],
      ['sine', 3, 0.08],
    ];
    for (const [type, mul, amp] of parts) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + dur * 1.3 + 0.05);
    }
  }

  /** A few breathy flute notes walking over the chord, with vibrato. */
  private flutePhrase(chord: number[], t: number, stepDur: number) {
    const ctx = this.ctx!;
    const tones = chord.slice(1).map((m) => m + 12);
    const n = 3 + Math.floor(Math.random() * 3);
    let tt = t;
    let idx = Math.floor(Math.random() * tones.length);
    for (let k = 0; k < n; k++) {
      idx = Math.max(0, Math.min(tones.length - 1, idx + (Math.random() < 0.5 ? -1 : 1)));
      const m = tones[idx];
      const len = stepDur * (2 + Math.floor(Math.random() * 3) * 2);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(m);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, tt);
      lg.gain.linearRampToValueAtTime(mtof(m) * 0.006, tt + len * 0.6);
      lfo.connect(lg);
      lg.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.032, tt + 0.09);
      g.gain.setValueAtTime(0.03, tt + len * 0.75);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + len + 0.25);
      o.connect(g);
      g.connect(this.arpGain);
      // a whisper of breath
      this.noise(g, tt, 0.12, 0.08, 'bandpass', mtof(m) * 2, null, 3, 0.04);
      o.start(tt);
      lfo.start(tt);
      o.stop(tt + len + 0.3);
      lfo.stop(tt + len + 0.3);
      tt += len;
    }
  }

  /** Short synthesized bird chirps. */
  private birdsong(t: number) {
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1400;
    for (let k = 0; k < n; k++) {
      const tt = t + k * (0.09 + Math.random() * 0.05);
      const f = base * (0.9 + Math.random() * 0.25);
      this.tone(this.arpGain, 'sine', f, f * (1.25 + Math.random() * 0.3), tt, 0.06, 0.014, 0.004);
    }
  }

  /** Brass-like swell on chord changes during combat. */
  private brassSwell(chord: number[], t: number, len: number, low: boolean) {
    const ctx = this.ctx!;
    const notes = low ? [chord[0] - 12, chord[0] - 5, chord[0]] : [chord[0] + 12, chord[1] + 12, chord[2] + 12];
    const dur = Math.min(len, 3.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.exponentialRampToValueAtTime(low ? 1100 : 1900, t + dur * 0.45);
    lp.frequency.exponentialRampToValueAtTime(400, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(low ? 0.07 : 0.055, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g);
    g.connect(this.padGain);
    for (const m of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = 0.22;
        o.connect(og);
        og.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  private dayBass(m: number, t: number, dur: number, boss: boolean) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = mtof(m);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(boss ? 650 : 520, t);
    f.frequency.exponentialRampToValueAtTime(150, t + dur);
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.bassGain);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private tambourine(t: number, peak: number) {
    this.noise(this.drumGain, t, 0.07, peak, 'bandpass', 9000, null, 1.4, 0.001);
    this.noise(this.drumGain, t + 0.015, 0.05, peak * 0.6, 'bandpass', 11000, null, 2, 0.001);
  }

  private handDrum(t: number, peak: number) {
    this.tone(this.drumGain, 'sine', 320, 190, t, 0.12, peak, 0.002);
    this.noise(this.drumGain, t, 0.03, peak * 0.4, 'bandpass', 1800, null, 1.2, 0.001);
  }

  private timpani(t: number, m: number, peak: number) {
    const f = mtof(m);
    this.tone(this.drumGain, 'sine', f * 1.15, f, t, 1.1, peak, 0.004);
    this.tone(this.drumGain, 'sine', f * 1.5, f * 1.48, t, 0.6, peak * 0.25, 0.004);
    this.noise(this.drumGain, t, 0.15, peak * 0.3, 'lowpass', 700, 200, 1, 0.002);
  }

  /** Day defeat: a wistful falling major-key line. */
  private dayDefeatMotif() {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.3;
    const g = ctx.createGain();
    g.gain.value = 0.85;
    g.connect(this.musicBus);
    g.connect(this.reverbIn);
    [76, 74, 72, 71, 69, 67, 65, 64].forEach((m, i) => {
      this.tone(g, 'sine', mtof(m), null, t + i * 0.5, 1.5, 0.09, 0.06);
      this.tone(g, 'triangle', mtof(m - 12), null, t + i * 0.5, 1.6, 0.04, 0.08, 1800);
    });
    [53, 60, 64].forEach((m) => this.tone(g, 'triangle', mtof(m), null, t + 4, 4.5, 0.05, 1.0, 1500));
  }

  private padChord(notes: number[], t: number, len: number) {
    const ctx = this.ctx!;
    const dur = len + 1.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(this.mood === 'boss' ? 500 : 800, t);
    lp.frequency.linearRampToValueAtTime(this.mood === 'boss' ? 900 : 1400, t + len * 0.5);
    lp.frequency.linearRampToValueAtTime(700, t + dur);
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + Math.min(2.5, len * 0.3));
    g.gain.setValueAtTime(0.09, t + len - 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g);
    g.connect(this.padGain);
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = n < 52 ? 'triangle' : 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = n < 52 ? 0.5 : 0.22;
        o.connect(og);
        og.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  private pluck(m: number, t: number, dur: number, peak: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(m);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = mtof(m) * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.arpGain);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private bassNote(m: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = mtof(m);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(this.mood === 'boss' ? 700 : 520, t);
    f.frequency.exponentialRampToValueAtTime(160, t + dur);
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.bassGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    this.tone(this.drumGain, 'sine', 120, 42, t, 0.35, 0.7, 0.002);
  }

  private tick(t: number, peak: number) {
    this.noise(this.drumGain, t, 0.04, peak, 'highpass', 7000, null, 0.7, 0.001);
  }

  private tom(t: number) {
    this.tone(this.drumGain, 'sine', 180, 90, t, 0.3, 0.35, 0.002);
    this.tone(this.drumGain, 'sine', 140, 70, t + 0.1, 0.3, 0.3, 0.002);
  }

  /** Stops the scheduler (not normally needed). */
  dispose(): void {
    if (this.schedTimer !== null) window.clearInterval(this.schedTimer);
    if (this.realmTimer !== null) window.clearTimeout(this.realmTimer);
    this.schedTimer = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function isImportant(n: SfxName): boolean {
  return (
    n === 'wave_start' ||
    n === 'wave_clear' ||
    n === 'boss_spawn' ||
    n === 'boss_die' ||
    n === 'victory' ||
    n === 'defeat' ||
    n === 'nova' ||
    n === 'obelisk_strike' ||
    n === 'rift_open' ||
    n === 'error' ||
    n === 'build' ||
    n === 'upgrade' ||
    n === 'sell' ||
    n === 'daybreak' ||
    n === 'titan_slam' ||
    n === 'blight_well'
  );
}

export const audio = new AudioEngine();
