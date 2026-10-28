import type { VerovioToolkit } from 'verovio/esm';

export interface ScoreNote {
  id: string;
  onQ: number;
  offQ: number;
  pitch: number;
  /** 0-based staff index from the top of the system (0 = soprano in SATB). */
  staff: number;
}

export interface ScoreMeasure {
  id: string;
  label: string;
  startQ: number;
  endQ: number;
}

export interface ScoreData {
  svg: string;
  title: string;
  staffNames: string[];
  notes: ScoreNote[];
  measures: ScoreMeasure[];
  totalQ: number;
  /** Tempo the file declares (verovio defaults to 120 when absent). */
  fileBpm: number;
}

interface TimemapEntry {
  qstamp: number;
  tstamp: number;
  tempo?: number;
  on?: string[];
  off?: string[];
  measureOn?: string;
}

let toolkitPromise: Promise<VerovioToolkit> | null = null;

function getToolkit() {
  // The engraver (~8 MB of WebAssembly) loads on demand so the app shell paints first.
  toolkitPromise ??= Promise.all([import('verovio/wasm'), import('verovio/esm')]).then(async ([wasm, esm]) => new esm.VerovioToolkit(await wasm.default()));
  return toolkitPromise;
}

export async function loadScore(url: string): Promise<ScoreData> {
  const [tk, data] = await Promise.all([getToolkit(), fetch(url).then((r) => r.text())]);
  tk.setOptions({
    pageWidth: 2100,
    pageHeight: 60000,
    adjustPageHeight: true,
    pageMarginTop: 60,
    pageMarginBottom: 120,
    pageMarginLeft: 80,
    pageMarginRight: 80,
    scale: 40,
    breaks: 'auto',
    spacingSystem: 14,
    svgHtml5: true,
    header: 'none',
    footer: 'none',
  });
  tk.loadData(data);
  const svg = tk.renderToSVG(1);
  const timemap = tk.renderToTimemap({ includeMeasures: true }) as TimemapEntry[];

  // P0 reads repeats linearly (each measure once, in page order). Verovio's timemap
  // expands repeats with "-rendN" ids; we keep first passes and close the gaps.
  // Repeat-aware playback maps arrive with the alignment work (AUD-04, phase 2).
  const isPass = (id: string) => /-rend\d+$/.test(id);
  let rawTotal = 0;
  let fileBpm = 120;
  const seq: { id: string; q: number }[] = [];
  for (const e of timemap) {
    if (e.tempo) fileBpm = e.tempo;
    if (e.measureOn) seq.push({ id: e.measureOn, q: e.qstamp });
    rawTotal = Math.max(rawTotal, e.qstamp);
  }
  const firstPass: { id: string; oldStart: number; oldEnd: number; start: number }[] = [];
  let cursor = 0;
  seq.forEach((m, i) => {
    if (isPass(m.id)) return;
    const oldEnd = seq[i + 1]?.q ?? rawTotal;
    firstPass.push({ id: m.id, oldStart: m.q, oldEnd, start: cursor });
    cursor += oldEnd - m.q;
  });
  const totalQ = cursor;
  const remap = (q: number, edge: 'on' | 'off') => {
    const m = firstPass.find((mm) => (edge === 'on' ? q >= mm.oldStart && q < mm.oldEnd : q > mm.oldStart && q <= mm.oldEnd));
    return m ? m.start + (q - m.oldStart) : null;
  };

  const onQ = new Map<string, number>();
  const offQ = new Map<string, number>();
  for (const e of timemap) {
    e.on?.forEach((id) => {
      if (isPass(id)) return;
      const q = remap(e.qstamp, 'on');
      if (q !== null) onQ.set(id, q);
    });
    e.off?.forEach((id) => {
      if (isPass(id) || offQ.has(id)) return;
      const q = remap(e.qstamp, 'off');
      if (q !== null) offQ.set(id, q);
    });
  }

  // Staff index per note comes from the rendered SVG structure.
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const staffOf = new Map<string, number>();
  doc.querySelectorAll('g.measure').forEach((m) => {
    m.querySelectorAll(':scope > g.staff').forEach((st, i) => {
      st.querySelectorAll('g.note').forEach((n) => staffOf.set(n.getAttribute('data-id') ?? '', i));
    });
  });
  const staffNames = Array.from(doc.querySelectorAll('g.system')[0]?.querySelectorAll('g.label text') ?? [])
    .map((t) => (t.textContent ?? '').trim())
    .filter(Boolean);

  const notes: ScoreNote[] = [];
  onQ.forEach((q, id) => {
    const midi = tk.getMIDIValuesForElement(id) as { pitch?: number };
    if (!midi?.pitch) return;
    notes.push({ id, onQ: q, offQ: offQ.get(id) ?? q + 1, pitch: midi.pitch, staff: staffOf.get(id) ?? 0 });
  });
  notes.sort((a, b) => a.onQ - b.onQ || a.staff - b.staff);

  const measures: ScoreMeasure[] = firstPass.map((m, i) => {
    const attr = tk.getElementAttr(m.id) as { n?: string };
    return { id: m.id, label: attr?.n ?? String(i + 1), startQ: m.start, endQ: m.start + (m.oldEnd - m.oldStart) };
  });

  const title =
    doc.querySelector('g.pgHead text')?.textContent?.trim() || url.split('/').pop()?.replace(/\.\w+$/, '') || 'Partitura';

  return { svg, title, staffNames, notes, measures, totalQ, fileBpm };
}
