import type { Ease, EffectInstance, Keyframe } from './types';
import { FAMILIES } from './presets';

const easeFn: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  hold: () => 0,
};

export const EASES: { id: Ease; label: string }[] = [
  { id: 'smooth', label: 'Suave' },
  { id: 'linear', label: 'Lineal' },
  { id: 'in', label: 'Acelera' },
  { id: 'out', label: 'Frena' },
  { id: 'hold', label: 'Escalón' },
];

export function evalTrack(keys: Keyframe[], q: number): number {
  if (keys.length === 1 || q <= keys[0].q) return keys[0].v;
  const last = keys[keys.length - 1];
  if (q >= last.q) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (q >= a.q && q <= b.q) {
      const span = b.q - a.q;
      const t = span <= 0 ? 1 : (q - a.q) / span;
      return a.v + (b.v - a.v) * easeFn[a.ease](t);
    }
  }
  return last.v;
}

export function paramAt(fx: EffectInstance, key: string, q: number): number {
  const track = fx.tracks[key];
  if (track && track.length > 0) return evalTrack(track, q);
  return fx.params[key];
}

/** Envelope from the range edges: 0 outside, ramps over fadeQ inside. */
export function envelopeAt(fx: EffectInstance, q: number): number {
  if (q < fx.startQ || q > fx.endQ) return 0;
  const f = Math.max(0.001, fx.fadeQ);
  return Math.min(1, (q - fx.startQ) / f, (fx.endQ - q) / f);
}

/**
 * Internal phase of the effect in seconds: the integral of its speed (times its
 * direction) over musical time. Integrating keeps motion continuous when speed or
 * direction are keyframed, and makes the state at any instant reproducible on seek.
 */
export function phaseAt(fx: EffectInstance, q: number, bpm: number): number {
  const fam = FAMILIES[fx.family];
  const from = fx.startQ - 8;
  const to = Math.max(from, q);
  const steps = Math.min(256, Math.max(8, Math.ceil((to - from) * 4)));
  const dq = (to - from) / steps;
  let acc = 0;
  for (let i = 0; i < steps; i++) {
    const qm = from + (i + 0.5) * dq;
    const s = paramAt(fx, fam.speedKey, qm);
    const d = fam.dirKey ? paramAt(fx, fam.dirKey, qm) : 1;
    acc += s * d * dq;
  }
  return (acc * 60) / bpm;
}

export function upsertKey(keys: Keyframe[], q: number, v: number, ease: Ease = 'smooth'): Keyframe[] {
  const eps = 0.06;
  const idx = keys.findIndex((k) => Math.abs(k.q - q) < eps);
  const next = keys.slice();
  if (idx >= 0) next[idx] = { ...next[idx], v };
  else next.push({ q, v, ease });
  return next.sort((a, b) => a.q - b.q);
}
