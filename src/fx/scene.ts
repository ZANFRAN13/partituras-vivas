import type { EffectInstance } from '../model/types';
import { FAMILIES } from '../model/presets';
import { envelopeAt, paramAt, phaseAt } from '../model/curves';
import { rangeSegments, type Layout, type Segment } from '../score/geometry';
import { hexToRgb, type FxDraw } from './renderer';

export interface AreaSegment extends Segment {
  area: { x: number; y: number; w: number; h: number };
  xoff: number;
}

/** The visual area of an effect on each system, from its musical range and placement. */
export function effectAreas(layout: Layout, fx: EffectInstance): { segs: AreaSegment[]; total: number } {
  const segs = rangeSegments(layout, fx.startQ, fx.endQ);
  let xoff = 0;
  const out: AreaSegment[] = segs.map((s) => {
    const sys = layout.systems[s.system];
    const H = sys.h;
    let y: number;
    let h: number;
    switch (fx.placement) {
      case 'debajo':
        y = sys.y + H * 0.55;
        h = H * 0.8;
        break;
      case 'arriba':
        y = sys.y - H * 0.5;
        h = H * 0.85;
        break;
      case 'pentagrama':
        y = sys.y - H * 0.18;
        h = H * 1.3;
        break;
      default:
        y = sys.y - H * 0.3;
        h = H * 1.6;
    }
    const cy = y + h / 2 + fx.offsetY * H;
    h *= fx.heightScale;
    y = cy - h / 2;
    const area = { x: s.x - 14, y, w: s.w + 28, h };
    const seg: AreaSegment = { ...s, area, xoff };
    xoff += area.w;
    return seg;
  });
  return { segs: out, total: xoff };
}

export interface SceneOptions {
  q: number;
  bpm: number;
  playing: boolean;
  ambient: number;
  selectedFx: string | null;
  reducedMotion: boolean;
}

export function buildDraws(layout: Layout, effects: EffectInstance[], o: SceneOptions): FxDraw[] {
  const draws: FxDraw[] = [];
  for (const fx of effects) {
    if (!fx.visible) continue;
    let env = envelopeAt(fx, o.q);
    let qEval = o.q;
    // While editing and paused, a selected effect shows a quiet preview of itself.
    if (env <= 0 && !o.playing && fx.id === o.selectedFx) {
      env = 0.35;
      qEval = Math.min(fx.endQ, Math.max(fx.startQ, o.q));
    }
    if (env <= 0.001) continue;
    const fam = FAMILIES[fx.family];
    const params = fam.params.map((p) => paramAt(fx, p.key, qEval));
    let time = phaseAt(fx, qEval, o.bpm) + o.ambient * (paramAt(fx, fam.speedKey, qEval) || 0.3);
    if (o.reducedMotion) time *= 0.12;
    const { segs, total } = effectAreas(layout, fx);
    const colA = hexToRgb(fx.colorA);
    const colB = hexToRgb(fx.colorB);
    for (const s of segs) {
      draws.push({
        family: fx.family,
        rect: s.area,
        xoff: s.xoff,
        total,
        time,
        beat: ((qEval % 1) + 1) % 1,
        env,
        params,
        colA,
        colB,
        seed: fx.seed,
      });
    }
  }
  return draws;
}
