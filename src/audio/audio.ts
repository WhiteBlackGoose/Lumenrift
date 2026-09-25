// Procedural WebAudio engine for LUMEN: synthesized SFX + generative ambient score.
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
  | 'splash';

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
    this.chord = MOODS[this.mood].prog[0];
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
    }
  }

  /** Soft bell/chime: sine + inharmonic partial. */
  private bell(dest: AudioNode, f: number, t: number, dur: number, peak: number) {
    this.tone(dest, 'sine', f, null, t, dur, peak, 0.003);
    this.tone(dest, 'sine', f * 2.76, null, t, dur * 0.4, peak * 0.25, 0.002);
    this.tone(dest, 'triangle', f * 2, null, t, dur * 0.6, peak * 0.15, 0.002);
  }

  // ---------------------------------------------------------------- music

  setMood(m: Mood): void {
    if (m === this.mood) return;
    const prev = this.mood;
    this.mood = m;
    if (!this.ctx) return;
    if (MOODS[m].prog !== MOODS[prev].prog) {
      this.chordIdx = 0;
      this.step = 0; // restart phrase so the new progression lands on a downbeat
    }
    this.updateLayers(m === 'defeat' ? 2.5 : 1.2);
    if (m === 'defeat') this.defeatMotif();
  }

  setIntensity(x: number): void {
    const v = clamp01(x);
    if (Math.abs(v - this.intensity) < 0.02) return;
    this.intensity = v;
    if (this.ctx) this.updateLayers(1.5);
  }

  private updateLayers(tc: number) {
    const ctx = this.ctx!;
    const s = MOODS[this.mood];
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
      const spec = MOODS[this.mood];
      const stepDur = 60 / spec.bpm / 4;
      this.playStep(spec, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  private playStep(s: MoodSpec, t: number, stepDur: number) {
    if (this.mood === 'defeat') return;
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
    n === 'sell'
  );
}

export const audio = new AudioEngine();
