import type { FamilyId, Placement } from './types';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  def: number;
  step?: number;
}

export interface FamilyDef {
  id: FamilyId;
  name: string;
  /** Parameter order is the order of the u_p[] uniform in the family shader. */
  params: ParamDef[];
  /** Parameter that drives the internal phase clock, integrated over musical time. */
  speedKey: string;
  /** Optional sign multiplier for the phase (lets a wave reverse direction smoothly). */
  dirKey?: string;
  placement: Placement;
  offsetY: number;
  heightScale: number;
}

export interface PresetDef {
  id: string;
  family: FamilyId;
  name: string;
  hint: string;
  colorA: string;
  colorB: string;
  params: Record<string, number>;
  /** Background used by the catalog thumbnail. */
  swatch: string;
}

export const FAMILIES: Record<FamilyId, FamilyDef> = {
  olas: {
    id: 'olas',
    name: 'Olas',
    speedKey: 'velocidad',
    dirKey: 'direccion',
    placement: 'debajo',
    offsetY: 0,
    heightScale: 1,
    params: [
      { key: 'amplitud', label: 'Amplitud', min: 0, max: 1, def: 0.5 },
      { key: 'frecuencia', label: 'Frecuencia', min: 0.5, max: 6, def: 2 },
      { key: 'velocidad', label: 'Velocidad', min: 0, max: 3, def: 1 },
      { key: 'direccion', label: 'Dirección', min: -1, max: 1, def: 1 },
      { key: 'espuma', label: 'Espuma', min: 0, max: 1, def: 0.6 },
      { key: 'turbulencia', label: 'Turbulencia', min: 0, max: 1, def: 0.3 },
      { key: 'profundidad', label: 'Profundidad', min: 0, max: 1, def: 0.6 },
      { key: 'intensidad', label: 'Intensidad', min: 0, max: 1, def: 1 },
    ],
  },
  fuego: {
    id: 'fuego',
    name: 'Fuego',
    speedKey: 'velocidad',
    placement: 'pentagrama',
    offsetY: 0,
    heightScale: 1,
    params: [
      { key: 'altura', label: 'Altura de llama', min: 0, max: 1, def: 0.6 },
      { key: 'intensidad', label: 'Intensidad', min: 0, max: 1, def: 1 },
      { key: 'turbulencia', label: 'Turbulencia', min: 0, max: 1, def: 0.5 },
      { key: 'inclinacion', label: 'Inclinación', min: -1, max: 1, def: 0 },
      { key: 'velocidad', label: 'Velocidad', min: 0, max: 3, def: 1 },
      { key: 'brasas', label: 'Brasas', min: 0, max: 1, def: 0.5 },
      { key: 'temperatura', label: 'Temperatura', min: 0, max: 1, def: 0.5 },
      { key: 'densidad', label: 'Lenguas de fuego', min: 0.5, max: 4, def: 1.5 },
    ],
  },
  luz: {
    id: 'luz',
    name: 'Luz',
    speedKey: 'giro',
    placement: 'fondo',
    offsetY: 0,
    heightScale: 1,
    params: [
      { key: 'intensidad', label: 'Intensidad', min: 0, max: 1, def: 0.8 },
      { key: 'radio', label: 'Radio', min: 0.05, max: 1, def: 0.4 },
      { key: 'rayos', label: 'Rayos', min: 0, max: 1, def: 0.5 },
      { key: 'giro', label: 'Giro', min: -2, max: 2, def: 0.3 },
      { key: 'calidez', label: 'Calidez', min: 0, max: 1, def: 0.6 },
      { key: 'pulso', label: 'Pulso con el compás', min: 0, max: 1, def: 0.3 },
      { key: 'posicion', label: 'Posición', min: 0, max: 1, def: 0.5 },
      { key: 'destello', label: 'Destello', min: 0, max: 1, def: 0.4 },
    ],
  },
  nubes: {
    id: 'nubes',
    name: 'Nubes',
    speedKey: 'velocidad',
    dirKey: 'direccion',
    placement: 'arriba',
    offsetY: 0,
    heightScale: 1,
    params: [
      { key: 'densidad', label: 'Densidad', min: 0, max: 1, def: 0.5 },
      { key: 'velocidad', label: 'Velocidad', min: 0, max: 3, def: 0.6 },
      { key: 'oscuridad', label: 'Oscuridad', min: 0, max: 1, def: 0.2 },
      { key: 'suavidad', label: 'Suavidad', min: 0, max: 1, def: 0.6 },
      { key: 'relampagos', label: 'Relámpagos', min: 0, max: 1, def: 0 },
      { key: 'direccion', label: 'Dirección', min: -1, max: 1, def: 1 },
      { key: 'escala', label: 'Escala', min: 0.5, max: 4, def: 1.5 },
      { key: 'intensidad', label: 'Intensidad', min: 0, max: 1, def: 0.9 },
    ],
  },
};

export const PRESETS: PresetDef[] = [
  {
    id: 'olas-suave', family: 'olas', name: 'Oleaje suave', hint: 'Ola grabada, a lo Hokusai',
    colorA: '#1d3f72', colorB: '#f4ecd9',
    params: { amplitud: 0.45, velocidad: 0.7, espuma: 0.6, turbulencia: 0.25, frecuencia: 1.8 },
    swatch: 'linear-gradient(180deg,#f4ecd9 0%,#9fbfdc 45%,#2d5a92 70%,#1d3f72 100%)',
  },
  {
    id: 'olas-tormenta', family: 'olas', name: 'Ola de tormenta', hint: 'Mar picado que se levanta',
    colorA: '#0f2440', colorB: '#e3ebf2',
    params: { amplitud: 0.85, velocidad: 1.6, espuma: 0.9, turbulencia: 0.7, frecuencia: 2.6, profundidad: 0.9 },
    swatch: 'linear-gradient(180deg,#cfd9e3 0%,#4b6a8a 40%,#0f2440 100%)',
  },
  {
    id: 'fuego-fogata', family: 'fuego', name: 'Fogata', hint: 'Calor que crece desde abajo',
    colorA: '#ff5a1f', colorB: '#ffd27a',
    params: { altura: 0.55, densidad: 1.2, brasas: 0.7, turbulencia: 0.45 },
    swatch: 'radial-gradient(ellipse at 50% 100%,#fff1b8 0%,#ffb03a 25%,#ff5a1f 50%,#3a0d05 100%)',
  },
  {
    id: 'fuego-llama', family: 'fuego', name: 'Llama ardiente', hint: 'Notas que arden en el clímax',
    colorA: '#ff3d00', colorB: '#fff1b8',
    params: { altura: 0.85, intensidad: 1, turbulencia: 0.65, densidad: 2.5, temperatura: 0.7 },
    swatch: 'radial-gradient(ellipse at 50% 110%,#ffffff 0%,#ffe066 20%,#ff3d00 55%,#2a0500 100%)',
  },
  {
    id: 'luz-natural', family: 'luz', name: 'Luz radial natural', hint: 'Un amanecer sobre la frase',
    colorA: '#ffcf70', colorB: '#fff6e0',
    params: { radio: 0.45, rayos: 0.4, destello: 0.3, intensidad: 0.75 },
    swatch: 'radial-gradient(circle at 50% 55%,#fffaf0 0%,#ffd98a 18%,#d9a24a 40%,#3b2a12 100%)',
  },
  {
    id: 'luz-intensa', family: 'luz', name: 'Luz radial intensa', hint: 'Destello de revelación',
    colorA: '#ffb347', colorB: '#ffffff',
    params: { intensidad: 1, radio: 0.7, rayos: 0.85, destello: 0.85, pulso: 0.5 },
    swatch: 'radial-gradient(circle at 50% 50%,#ffffff 0%,#ffe2a8 12%,#ff9d2e 30%,#1c1206 85%)',
  },
  {
    id: 'nubes-dia', family: 'nubes', name: 'Nubes de día soleado', hint: 'Ligereza, aire, cielo abierto',
    colorA: '#ffffff', colorB: '#8fc0ee',
    params: { densidad: 0.45, oscuridad: 0, velocidad: 0.5 },
    swatch: 'radial-gradient(ellipse at 40% 45%,#ffffff 0%,#ffffff 22%,#a9d0f5 50%,#5f9fe0 100%)',
  },
  {
    id: 'nubes-niebla', family: 'nubes', name: 'Niebla misteriosa', hint: 'Bruma que envuelve el pasaje',
    colorA: '#c9ced6', colorB: '#6f7a8c',
    params: { densidad: 0.75, suavidad: 0.95, velocidad: 0.3, oscuridad: 0.3, escala: 1 },
    swatch: 'linear-gradient(180deg,#e7e9ee 0%,#b8bec9 50%,#6f7a8c 100%)',
  },
  {
    id: 'nubes-tormenta', family: 'nubes', name: 'Tormenta eléctrica', hint: 'Tensión, rayos, amenaza',
    colorA: '#3b4252', colorB: '#c8d7ff',
    params: { densidad: 0.8, oscuridad: 0.8, relampagos: 0.7, velocidad: 1.4, escala: 2 },
    swatch: 'radial-gradient(ellipse at 60% 30%,#c8d7ff 0%,#5a6478 25%,#2a303c 60%,#12151b 100%)',
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

export function defaultParams(family: FamilyId): Record<string, number> {
  return Object.fromEntries(FAMILIES[family].params.map((p) => [p.key, p.def]));
}
