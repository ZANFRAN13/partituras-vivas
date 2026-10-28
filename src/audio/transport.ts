import type { ScoreNote } from '../score/verovio';
import type { Range } from '../model/types';

type Listener = () => void;

const LOOKAHEAD_S = 0.15;
const TICK_MS = 25;

/**
 * The single clock of the app. Musical position is derived from the AudioContext
 * clock, so notation cursor, synth and visual effects can never drift apart.
 */
class Transport {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private staffGains: GainNode[] = [];
  private timer: number | null = null;
  private anchorTime = 0;
  private anchorQ = 0;
  private scheduledUntilQ = 0;
  private listeners = new Set<Listener>();

  playing = false;
  bpm = 72;
  totalQ = 0;
  notes: ScoreNote[] = [];
  loop: Range | null = null;
  muted: boolean[] = [false, false, false, false];
  solo: number | null = null;
  metronome = false;
  volume = 0.8;
  /** Wall-clock seconds; used for ambient motion while paused. */
  wall = () => performance.now() / 1000;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private ensureAudio() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const master = ctx.createGain();
    master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    const pans = [-0.35, -0.12, 0.12, 0.35];
    this.staffGains = pans.map((pan) => {
      const g = ctx.createGain();
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(master);
      return g;
    });
    this.ctx = ctx;
    this.master = master;
    this.applyMix();
    return ctx;
  }

  get q(): number {
    if (!this.playing || !this.ctx) return this.anchorQ;
    return this.anchorQ + ((this.ctx.currentTime - this.anchorTime) * this.bpm) / 60;
  }

  play() {
    if (this.playing) return;
    const ctx = this.ensureAudio();
    void ctx.resume();
    if (this.anchorQ >= this.totalQ - 0.01) this.anchorQ = this.loop?.startQ ?? 0;
    this.anchorTime = ctx.currentTime + 0.05;
    this.scheduledUntilQ = this.anchorQ;
    this.playing = true;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.anchorQ = this.q;
    this.playing = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(q: number) {
    const clamped = Math.max(0, Math.min(this.totalQ, q));
    this.anchorQ = clamped;
    this.scheduledUntilQ = clamped;
    if (this.playing && this.ctx) this.anchorTime = this.ctx.currentTime + 0.02;
    this.emit();
  }

  setBpm(bpm: number) {
    const q = this.q;
    this.bpm = bpm;
    this.seek(q);
  }

  setLoop(r: Range | null) {
    this.loop = r;
    this.emit();
  }

  setMute(staff: number, m: boolean) {
    this.muted[staff] = m;
    this.applyMix();
    this.emit();
  }

  setSolo(staff: number | null) {
    this.solo = staff;
    this.applyMix();
    this.emit();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
    this.emit();
  }

  private applyMix() {
    this.staffGains.forEach((g, i) => {
      const audible = this.solo === null ? !this.muted[i] : this.solo === i;
      g.gain.value = audible ? 1 : 0;
    });
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    let q = this.q;
    if (this.loop && q >= this.loop.endQ) {
      this.seek(this.loop.startQ);
      q = this.q;
    } else if (q >= this.totalQ) {
      this.pause();
      this.seek(this.totalQ);
      return;
    }
    const horizonQ = q + (LOOKAHEAD_S * this.bpm) / 60;
    const limit = this.loop ? Math.min(horizonQ, this.loop.endQ) : horizonQ;
    const from = this.scheduledUntilQ;
    if (limit <= from) return;
    const secPerQ = 60 / this.bpm;
    const timeOf = (nq: number) => this.anchorTime + (nq - this.anchorQ) * secPerQ;
    for (const n of this.notes) {
      if (n.onQ < from) continue;
      if (n.onQ >= limit) break;
      this.voice(n, timeOf(n.onQ), (n.offQ - n.onQ) * secPerQ);
    }
    if (this.metronome) {
      for (let b = Math.ceil(from); b < limit; b++) this.click(timeOf(b), b % 4 === 0);
    }
    this.scheduledUntilQ = limit;
  }

  private voice(n: ScoreNote, at: number, dur: number) {
    const ctx = this.ctx!;
    const out = this.staffGains[Math.min(n.staff, this.staffGains.length - 1)];
    const f = 440 * Math.pow(2, (n.pitch - 69) / 12);
    const t0 = Math.max(at, ctx.currentTime);
    const rel = 0.18;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.16, t0 + 0.07);
    env.gain.setTargetAtTime(0.11, t0 + 0.07, 0.25);
    env.gain.setTargetAtTime(0, t0 + Math.max(0.05, dur - 0.04), rel / 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(4200, f * 5);
    lp.Q.value = 0.6;
    env.connect(lp).connect(out);
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    vib.frequency.value = 5.2;
    vibGain.gain.setValueAtTime(0, t0);
    vibGain.gain.linearRampToValueAtTime(f * 0.004, t0 + 0.4);
    vib.connect(vibGain);
    const partials: [OscillatorType, number, number][] = [
      ['triangle', 1, 1],
      ['sine', 2, 0.22],
      ['sawtooth', 1.003, 0.07],
    ];
    const stopAt = t0 + dur + rel * 2;
    for (const [type, mult, gain] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      vibGain.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(env);
      o.start(t0);
      o.stop(stopAt);
    }
    vib.start(t0);
    vib.stop(stopAt);
  }

  private click(at: number, accent: boolean) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1600 : 1100;
    g.gain.setValueAtTime(0.25, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + 0.06);
  }
}

export const transport = new Transport();
