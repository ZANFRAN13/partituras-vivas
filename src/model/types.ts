// Musical time is measured in quarter notes from the start of the score ("q").
// Every anchor in a project is musical (q or element ids), never pixels, so
// effects and ink survive zoom, reflow and tempo changes.

export type Ease = 'linear' | 'smooth' | 'in' | 'out' | 'hold';

export interface Keyframe {
  q: number;
  v: number;
  ease: Ease;
}

export type FamilyId = 'olas' | 'fuego' | 'luz' | 'nubes';

export type Placement = 'fondo' | 'debajo' | 'arriba' | 'pentagrama';

export interface EffectInstance {
  id: string;
  family: FamilyId;
  presetId: string;
  name: string;
  /** Free-text direction shown on the score, e.g. "más abierto, como olas". */
  label: string;
  startQ: number;
  endQ: number;
  /** Fade in/out at the range edges, in quarters. */
  fadeQ: number;
  placement: Placement;
  /** Vertical offset and height of the visual area, relative to the system height. */
  offsetY: number;
  heightScale: number;
  colorA: string;
  colorB: string;
  /** Tint the noteheads inside the range with colorB, scaled by the effect intensity. */
  tintNotes: boolean;
  /** Static parameter values; overridden by tracks when a track has keyframes. */
  params: Record<string, number>;
  tracks: Record<string, Keyframe[]>;
  seed: number;
  visible: boolean;
}

export interface InkPoint {
  /** Position relative to the anchor measure box (0..1 on both axes, may overflow). */
  u: number;
  v: number;
  /** Milliseconds since the stroke started, used to replay the gesture. */
  t: number;
  p: number;
}

export interface InkStroke {
  id: string;
  measureId: string;
  /** Musical moment the stroke starts drawing itself during playback. */
  q: number;
  color: string;
  width: number;
  points: InkPoint[];
  visible: boolean;
}

export interface Project {
  version: 1;
  id: string;
  title: string;
  scoreUrl: string;
  bpm: number;
  effects: EffectInstance[];
  ink: InkStroke[];
  updatedAt: number;
}

export interface Range {
  startQ: number;
  endQ: number;
}
