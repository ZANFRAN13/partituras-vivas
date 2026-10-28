import type { EffectInstance, Keyframe, Project } from './types';
import { FAMILIES, defaultParams, presetById } from './presets';
import { emptyProject, uid } from './store';

export const SCORES = [
  {
    url: `${import.meta.env.BASE_URL}scores/bwv269.musicxml`,
    title: 'Aus meines Herzens Grunde',
    composer: 'J. S. Bach · BWV 269 · coral SATB',
  },
];

const k = (q: number, v: number, ease: Keyframe['ease'] = 'smooth'): Keyframe => ({ q, v, ease });

function fx(presetId: string, startQ: number, endQ: number, extra: Partial<EffectInstance>): EffectInstance {
  const p = presetById(presetId)!;
  const fam = FAMILIES[p.family];
  return {
    id: uid(),
    family: p.family,
    presetId,
    name: p.name,
    label: '',
    startQ,
    endQ,
    fadeQ: 1,
    placement: fam.placement,
    offsetY: 0,
    heightScale: 1,
    colorA: p.colorA,
    colorB: p.colorB,
    tintNotes: p.family !== 'olas' && p.family !== 'nubes',
    params: { ...defaultParams(p.family), ...p.params },
    tracks: {},
    seed: 1000 + Math.round(startQ * 37),
    visible: true,
    ...extra,
  };
}

/** The guide scene from the plan: a director's first pass over the chorale. */
export function demoProject(scoreUrl: string): Project {
  return {
    ...emptyProject(),
    title: 'Aus meines Herzens Grunde · Ensayo jueves',
    scoreUrl,
    bpm: 66,
    effects: [
      fx('olas-suave', 1, 13, {
        label: 'más abierto, como olas',
        tracks: { amplitud: [k(1, 0.12), k(7, 0.8), k(10, 0.5), k(13, 0.15)] },
      }),
      fx('luz-natural', 13, 22, {
        label: 'amanece: que se ilumine',
        tracks: { intensidad: [k(13, 0.15), k(19, 0.95), k(22, 0.5)], posicion: [k(13, 0.15), k(22, 0.85, 'linear')] },
      }),
      fx('nubes-niebla', 22, 34, { label: 'misterio, piano' }),
      fx('fuego-llama', 37, 52, {
        label: '¡arde! crescendo al clímax',
        fadeQ: 2,
        tracks: { altura: [k(37, 0.15), k(47, 0.95), k(52, 0.3)], intensidad: [k(37, 0.5), k(46, 1), k(52, 0.6)] },
      }),
      fx('luz-intensa', 55, 63, { label: 'luz final', tracks: { intensidad: [k(55, 0.3), k(63, 1)] } }),
    ],
  };
}
