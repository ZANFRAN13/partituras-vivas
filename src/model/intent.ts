import type { Keyframe, Range } from './types';

export interface IntentProposal {
  presetId: string;
  label: string;
  params: Record<string, number>;
  tracks: Record<string, Keyframe[]>;
  summary: string;
}

const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

/**
 * Local stand-in for the creative assistant (FX-06 / VFX-11): turns a director's
 * phrase into an editable proposal. Phase 2 replaces this with the Claude API,
 * keeping the same output shape so the UI does not change.
 */
export function interpretIntent(text: string, range: Range): IntentProposal | null {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t.trim()) return null;

  let presetId = 'luz-natural';
  if (has(t, ['ola', 'mar', 'agua', 'marea', 'oleaje'])) presetId = has(t, ['tormenta', 'furia', 'brav', 'picad']) ? 'olas-tormenta' : 'olas-suave';
  else if (has(t, ['fuego', 'arde', 'llama', 'quema', 'brasa', 'incendi', 'calor'])) presetId = has(t, ['fogata', 'calido', 'tibio', 'hogar']) ? 'fuego-fogata' : 'fuego-llama';
  else if (has(t, ['nube', 'niebla', 'bruma', 'cielo', 'tormenta', 'rayo', 'relampago'])) {
    presetId = has(t, ['tormenta', 'rayo', 'relampago', 'electric']) ? 'nubes-tormenta' : has(t, ['niebla', 'bruma', 'misteri']) ? 'nubes-niebla' : 'nubes-dia';
  } else if (has(t, ['luz', 'brill', 'amanec', 'sol', 'ilumin', 'resplandor', 'destell'])) presetId = has(t, ['intens', 'revel', 'destell', 'gloria']) ? 'luz-intensa' : 'luz-natural';

  const family = presetId.split('-')[0];
  const intensityKey = family === 'olas' ? 'amplitud' : family === 'fuego' ? 'altura' : family === 'nubes' ? 'densidad' : 'intensidad';
  const { startQ: a, endQ: b } = range;
  const mid = a + (b - a) * 0.6;
  const tracks: Record<string, Keyframe[]> = {};
  const notes: string[] = [];

  const grows = has(t, ['crece', 'crescendo', 'aument', 'sube', 'intensific', 'despierta', 'se abre', 'abierto']);
  const fades = has(t, ['decrescendo', 'diminuendo', 'se apaga', 'disminu', 'baja', 'desvanec', 'muere', 'calma']);
  if (grows && fades) {
    tracks[intensityKey] = [{ q: a, v: 0.12, ease: 'smooth' }, { q: mid, v: 0.95, ease: 'smooth' }, { q: b, v: 0.15, ease: 'smooth' }];
    notes.push('crece y luego se apaga');
  } else if (grows) {
    tracks[intensityKey] = [{ q: a, v: 0.1, ease: 'in' }, { q: b, v: 0.95, ease: 'smooth' }];
    notes.push('crece a lo largo del pasaje');
  } else if (fades) {
    tracks[intensityKey] = [{ q: a, v: 0.95, ease: 'out' }, { q: b, v: 0.08, ease: 'smooth' }];
    notes.push('se desvanece hacia el final');
  }

  const params: Record<string, number> = {};
  const speedKey = family === 'luz' ? 'giro' : 'velocidad';
  if (has(t, ['suave', 'lento', 'tranquil', 'dulce', 'calma', 'piano'])) {
    params[speedKey] = family === 'luz' ? 0.15 : 0.4;
    notes.push('movimiento lento');
  }
  if (has(t, ['rapid', 'agitad', 'furia', 'violent', 'forte', 'energ'])) {
    params[speedKey] = family === 'luz' ? 0.9 : 1.8;
    notes.push('movimiento enérgico');
  }
  if (has(t, ['contrario', 'reversa', 'hacia atras', 'izquierda'])) {
    params.direccion = -1;
    notes.push('dirección invertida');
  }
  if (family === 'luz' && has(t, ['pulso', 'late', 'respira', 'compas'])) {
    params.pulso = 0.8;
    notes.push('late con el pulso');
  }

  const label = text.trim().replace(/^quiero que\s+/i, '');
  const summary = `${notes.length ? notes.join(', ') : 'parámetros del preset'}`;
  return { presetId, label, params, tracks, summary };
}
