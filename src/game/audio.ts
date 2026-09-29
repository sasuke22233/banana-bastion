type ToneOpts = { slide?: number; delay?: number; attack?: number; detune?: number };
type NoiseOpts = { type?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; delay?: number };

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
const MASTER_VOL = 0.55;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: { nodes: AudioScheduledSourceNode[]; gain: GainNode } | null = null;
  muted = false;

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOL;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : MASTER_VOL, this.ctx.currentTime, 0.04);
    }
  }

  private tone(freq: number, type: OscillatorType, dur: number, vol: number, o: ToneOpts = {}) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (o.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (o.detune) osc.detune.value = o.detune;
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + dur);
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, o: NoiseOpts = {}) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (o.delay ?? 0);
    const len = Math.max(1, Math.ceil(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, t0);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + dur);
    f.Q.value = o.q ?? 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---- SFX ----
  collect(combo: number, golden = false) {
    const semi = PENTATONIC[combo % PENTATONIC.length];
    const base = golden ? 783.99 : 523.25;
    const f = base * Math.pow(2, semi / 12);
    this.tone(f, 'sine', 0.2, 0.22);
    this.tone(f * 2, 'triangle', 0.12, 0.07);
    if (golden) {
      this.tone(f * 1.5, 'sine', 0.3, 0.15, { delay: 0.06 });
      this.tone(f * 2, 'sine', 0.35, 0.12, { delay: 0.12 });
    }
  }

  nearMiss() {
    this.noise(0.28, 0.35, { type: 'bandpass', freq: 300, freqEnd: 3500, q: 3 });
    this.tone(220, 'sine', 0.15, 0.08, { slide: 660 });
  }

  hit() {
    this.tone(180, 'sawtooth', 0.4, 0.35, { slide: 35 });
    this.noise(0.35, 0.5, { freq: 900, freqEnd: 80 });
  }

  explode(big = false) {
    this.noise(big ? 0.7 : 0.25, big ? 0.6 : 0.28, { freq: big ? 700 : 1600, freqEnd: 50 });
    this.tone(big ? 70 : 150, 'sine', big ? 0.5 : 0.25, big ? 0.4 : 0.2, { slide: 30 });
  }

  powerup() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(440 * Math.pow(2, s / 12), 'square', 0.16, 0.09, { delay: i * 0.06 }));
    this.tone(880, 'sine', 0.4, 0.1, { delay: 0.24 });
  }

  nova() {
    this.noise(1.0, 0.5, { type: 'lowpass', freq: 4000, freqEnd: 60 });
    [0, 7, 12, 19, 24].forEach((s, i) => this.tone(220 * Math.pow(2, s / 12), 'triangle', 0.5, 0.15, { delay: i * 0.05 }));
  }

  shoot() {
    this.tone(900, 'square', 0.07, 0.045, { slide: 300 });
  }

  shieldUp() {
    this.tone(330, 'sine', 0.35, 0.15, { slide: 990 });
    this.tone(660, 'triangle', 0.3, 0.08, { delay: 0.1, slide: 1320 });
  }

  shieldBreak() {
    this.noise(0.3, 0.4, { type: 'highpass', freq: 2500 });
    this.tone(1400, 'sine', 0.35, 0.2, { slide: 250 });
  }

  sector() {
    [0, 7, 12, 19].forEach((s, i) => this.tone(330 * Math.pow(2, s / 12), 'triangle', 0.6, 0.13, { delay: i * 0.11 }));
  }

  record() {
    [0, 4, 7, 12, 16, 19].forEach((s, i) => this.tone(523.25 * Math.pow(2, s / 12), 'triangle', 0.3, 0.12, { delay: i * 0.07 }));
  }

  gameOver() {
    this.noise(1.2, 0.5, { freq: 500, freqEnd: 40 });
    [12, 7, 3, 0].forEach((s, i) => this.tone(196 * Math.pow(2, s / 12), 'sawtooth', 0.55, 0.12, { delay: 0.3 + i * 0.2 }));
  }

  warning() {
    this.tone(1200, 'square', 0.08, 0.06);
    this.tone(1200, 'square', 0.08, 0.06, { delay: 0.12 });
  }

  click() {
    this.tone(700, 'sine', 0.06, 0.12, { slide: 500 });
  }

  buy() {
    [0, 5, 9].forEach((s, i) => this.tone(587 * Math.pow(2, s / 12), 'sine', 0.2, 0.12, { delay: i * 0.05 }));
  }

  denied() {
    this.tone(180, 'square', 0.15, 0.08);
    this.tone(150, 'square', 0.2, 0.08, { delay: 0.12 });
  }

  // ---- Ambient ----
  startDrone() {
    if (!this.ctx || !this.master || this.drone) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.045, this.ctx.currentTime, 1.5);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    const nodes: AudioScheduledSourceNode[] = [];
    [[55, 'sine'], [82.41, 'triangle'], [110.5, 'sine']].forEach(([f, t], i) => {
      const o = this.ctx!.createOscillator();
      o.type = t as OscillatorType;
      o.frequency.value = f as number;
      o.detune.value = i * 4;
      o.connect(lp);
      o.start();
      nodes.push(o);
    });
    lp.connect(g);
    g.connect(this.master);
    this.drone = { nodes, gain: g };
  }

  stopDrone() {
    if (!this.ctx || !this.drone) return;
    const { nodes, gain } = this.drone;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
    const t = this.ctx.currentTime + 2.5;
    nodes.forEach(n => n.stop(t));
    this.drone = null;
  }
}
