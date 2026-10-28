import { create } from 'zustand';
import type { EffectInstance, InkStroke, Project, Range } from './types';
import { FAMILIES, defaultParams, presetById } from './presets';
import { paramAt, upsertKey } from './curves';
import type { ScoreData } from '../score/verovio';
import type { Layout } from '../score/geometry';

export type Mode = 'estudio' | 'ensayo';
export type Tool = 'seleccion' | 'tinta';
export type SaveState = 'guardado' | 'guardando' | 'sin-guardar' | 'error';

interface State {
  project: Project;
  score: ScoreData | null;
  layout: Layout | null;
  selection: Range | null;
  selectedFx: string | null;
  selectedParam: string | null;
  mode: Mode;
  tool: Tool;
  inkColor: string;
  clean: boolean;
  reducedMotion: boolean;
  darkStage: boolean;
  quality: number;
  saveState: SaveState;
  past: Project[];
  future: Project[];
  lastCoalesce: { key: string; at: number } | null;

  setScore: (s: ScoreData) => void;
  setLayout: (l: Layout) => void;
  loadProject: (p: Project) => void;
  /** Applies a change to the project with undo history; repeated changes with the same key merge. */
  change: (fn: (p: Project) => Project, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (r: Range | null) => void;
  selectFx: (id: string | null) => void;
  selectParam: (key: string | null) => void;
  setUi: (patch: Partial<Pick<State, 'mode' | 'tool' | 'inkColor' | 'clean' | 'reducedMotion' | 'darkStage' | 'quality' | 'saveState'>>) => void;

  addEffect: (presetId: string, range: Range) => string;
  updateEffect: (id: string, patch: Partial<EffectInstance>, coalesceKey?: string) => void;
  removeEffect: (id: string) => void;
  moveEffect: (id: string, dir: -1 | 1) => void;
  setParam: (id: string, key: string, v: number, q: number) => void;
  setKey: (id: string, key: string, q: number, v: number) => void;
  toggleKeyAt: (id: string, key: string, q: number) => void;
  addStroke: (s: InkStroke) => void;
  removeStroke: (id: string) => void;
  clearInk: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<State>((set, get) => ({
  project: emptyProject(),
  score: null,
  layout: null,
  selection: null,
  selectedFx: null,
  selectedParam: null,
  mode: 'estudio',
  tool: 'seleccion',
  inkColor: '#c8102e',
  clean: false,
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  darkStage: false,
  quality: 1,
  saveState: 'guardado',
  past: [],
  future: [],
  lastCoalesce: null,

  setScore: (score) => set({ score }),
  setLayout: (layout) => set({ layout }),
  loadProject: (project) => set({ project, past: [], future: [], selectedFx: null, selection: null }),

  change: (fn, coalesceKey) => {
    const { project, past, lastCoalesce } = get();
    const now = performance.now();
    const merge = coalesceKey && lastCoalesce && lastCoalesce.key === coalesceKey && now - lastCoalesce.at < 800;
    const next = { ...fn(project), updatedAt: Date.now() };
    set({
      project: next,
      past: merge ? past : [...past.slice(-99), project],
      future: [],
      lastCoalesce: coalesceKey ? { key: coalesceKey, at: now } : null,
      saveState: 'sin-guardar',
    });
  },
  undo: () => {
    const { past, project, future } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], lastCoalesce: null, saveState: 'sin-guardar' });
  },
  redo: () => {
    const { past, project, future } = get();
    const next = future[0];
    if (!next) return;
    set({ project: next, past: [...past, project], future: future.slice(1), lastCoalesce: null, saveState: 'sin-guardar' });
  },
  setSelection: (selection) => set({ selection }),
  selectFx: (selectedFx) => {
    const fx = get().project.effects.find((e) => e.id === selectedFx);
    const keep = get().selectedParam;
    const param = fx && keep && FAMILIES[fx.family].params.some((p) => p.key === keep) ? keep : fx ? FAMILIES[fx.family].params[0].key : null;
    set({ selectedFx, selectedParam: param });
  },
  selectParam: (selectedParam) => set({ selectedParam }),
  setUi: (patch) => set(patch),

  addEffect: (presetId, range) => {
    const preset = presetById(presetId);
    if (!preset) return '';
    const fam = FAMILIES[preset.family];
    const id = uid();
    const fx: EffectInstance = {
      id,
      family: preset.family,
      presetId,
      name: preset.name,
      label: '',
      startQ: range.startQ,
      endQ: range.endQ,
      fadeQ: Math.min(1, (range.endQ - range.startQ) / 4),
      placement: fam.placement,
      offsetY: fam.offsetY,
      heightScale: fam.heightScale,
      colorA: preset.colorA,
      colorB: preset.colorB,
      tintNotes: preset.family === 'fuego' || preset.family === 'luz',
      params: { ...defaultParams(preset.family), ...preset.params },
      tracks: {},
      seed: Math.floor(Math.random() * 100000),
      visible: true,
    };
    get().change((p) => ({ ...p, effects: [...p.effects, fx] }));
    get().selectFx(id);
    return id;
  },
  updateEffect: (id, patch, coalesceKey) =>
    get().change((p) => ({ ...p, effects: p.effects.map((e) => (e.id === id ? { ...e, ...patch } : e)) }), coalesceKey),
  removeEffect: (id) => {
    get().change((p) => ({ ...p, effects: p.effects.filter((e) => e.id !== id) }));
    if (get().selectedFx === id) set({ selectedFx: null });
  },
  moveEffect: (id, dir) =>
    get().change((p) => {
      const list = p.effects.slice();
      const i = list.findIndex((e) => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return p;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...p, effects: list };
    }),
  setParam: (id, key, v, q) =>
    get().change(
      (p) => ({
        ...p,
        effects: p.effects.map((e) => {
          if (e.id !== id) return e;
          const track = e.tracks[key];
          // An animated parameter edits the keyframe under the playhead (auto-key).
          if (track && track.length > 0) return { ...e, tracks: { ...e.tracks, [key]: upsertKey(track, q, v) } };
          return { ...e, params: { ...e.params, [key]: v } };
        }),
      }),
      `param:${id}:${key}`,
    ),
  setKey: (id, key, q, v) =>
    get().change(
      (p) => ({
        ...p,
        effects: p.effects.map((e) => (e.id === id ? { ...e, tracks: { ...e.tracks, [key]: upsertKey(e.tracks[key] ?? [], q, v) } } : e)),
      }),
      `key:${id}:${key}`,
    ),
  toggleKeyAt: (id, key, q) =>
    get().change((p) => ({
      ...p,
      effects: p.effects.map((e) => {
        if (e.id !== id) return e;
        const track = e.tracks[key] ?? [];
        const hit = track.findIndex((k) => Math.abs(k.q - q) < 0.06);
        if (hit >= 0) {
          const rest = track.filter((_, i) => i !== hit);
          const params = rest.length === 0 ? { ...e.params, [key]: track[hit].v } : e.params;
          return { ...e, params, tracks: { ...e.tracks, [key]: rest } };
        }
        const v = paramAt(e, key, q);
        return { ...e, tracks: { ...e.tracks, [key]: upsertKey(track, q, v) } };
      }),
    })),
  addStroke: (s) => get().change((p) => ({ ...p, ink: [...p.ink, s] })),
  removeStroke: (id) => get().change((p) => ({ ...p, ink: p.ink.filter((s) => s.id !== id) })),
  clearInk: () => get().change((p) => ({ ...p, ink: [] })),
}));

export function emptyProject(): Project {
  return { version: 1, id: uid(), title: '', scoreUrl: '', bpm: 72, effects: [], ink: [], updatedAt: Date.now() };
}

export { uid };
