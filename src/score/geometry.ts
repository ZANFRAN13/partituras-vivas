import type { ScoreData } from './verovio';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MeasureGeom extends Box {
  id: string;
  system: number;
  startQ: number;
  endQ: number;
  /** Musical time → x anchors inside the measure (barline, note onsets, barline). */
  anchors: { q: number; x: number }[];
}

export interface SystemGeom extends Box {
  measures: MeasureGeom[];
  startQ: number;
  endQ: number;
  /** Top/bottom of each staff (five lines) in the system. */
  staves: { top: number; bottom: number }[];
}

export interface Layout {
  width: number;
  height: number;
  systems: SystemGeom[];
  measures: Map<string, MeasureGeom>;
  notes: Map<string, Box>;
}

export interface Segment extends Box {
  system: number;
  /** Fraction of the whole range covered before this segment, and the fraction it covers. */
  from: number;
  span: number;
}

const rel = (r: DOMRect, o: DOMRect): Box => ({ x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height });

export function measureLayout(stage: HTMLElement, score: ScoreData): Layout {
  const origin = stage.getBoundingClientRect();
  const qInfo = new Map(score.measures.map((m) => [m.id, m]));
  const noteOn = new Map(score.notes.map((n) => [n.id, n.onQ]));
  const notes = new Map<string, Box>();
  const systems: SystemGeom[] = [];
  const measures = new Map<string, MeasureGeom>();

  stage.querySelectorAll<SVGGElement>('g.system').forEach((sysEl) => {
    const sysIndex = systems.length;
    const ms: MeasureGeom[] = [];
    let staves: { top: number; bottom: number }[] = [];
    sysEl.querySelectorAll<SVGGElement>('g.measure').forEach((mEl) => {
      const id = mEl.getAttribute('data-id') ?? '';
      const info = qInfo.get(id);
      if (!info) return;
      // The staff lines give a box that ignores lyrics and ledger-line outliers.
      const staffEls = Array.from(mEl.querySelectorAll<SVGGElement>(':scope > g.staff'));
      const staffBoxes = staffEls.map((s) => {
        const lines = Array.from(s.querySelectorAll(':scope > path')).map((p) => rel(p.getBoundingClientRect(), origin));
        if (lines.length === 0) return rel(s.getBoundingClientRect(), origin);
        const y0 = Math.min(...lines.map((l) => l.y));
        const y1 = Math.max(...lines.map((l) => l.y + l.h));
        const x0 = Math.min(...lines.map((l) => l.x));
        const x1 = Math.max(...lines.map((l) => l.x + l.w));
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      });
      if (ms.length === 0) staves = staffBoxes.map((b) => ({ top: b.y, bottom: b.y + b.h }));
      const top = Math.min(...staffBoxes.map((b) => b.y));
      const bottom = Math.max(...staffBoxes.map((b) => b.y + b.h));
      const x = Math.min(...staffBoxes.map((b) => b.x));
      const right = Math.max(...staffBoxes.map((b) => b.x + b.w));
      const onsets = new Map<number, number>();
      mEl.querySelectorAll<SVGGElement>('g.note').forEach((nEl) => {
        const nid = nEl.getAttribute('data-id') ?? '';
        const head = nEl.querySelector('.notehead') ?? nEl;
        const b = rel(head.getBoundingClientRect(), origin);
        notes.set(nid, b);
        const q = noteOn.get(nid);
        if (q !== undefined) onsets.set(q, Math.min(onsets.get(q) ?? Infinity, b.x + b.w / 2));
      });
      const anchors = [{ q: info.startQ, x }];
      Array.from(onsets.entries())
        .sort((a, b) => a[0] - b[0])
        .forEach(([q, nx]) => {
          if (q > info.startQ) anchors.push({ q, x: nx });
          else anchors[0] = { q, x: Math.min(nx - 14, x + 30) };
        });
      anchors.push({ q: info.endQ, x: right });
      const g: MeasureGeom = { id, system: sysIndex, startQ: info.startQ, endQ: info.endQ, x, y: top, w: right - x, h: bottom - top, anchors };
      ms.push(g);
      measures.set(id, g);
    });
    if (ms.length === 0) return;
    const x = ms[0].x;
    const y = Math.min(...ms.map((m) => m.y));
    const right = ms[ms.length - 1].x + ms[ms.length - 1].w;
    const bottom = Math.max(...ms.map((m) => m.y + m.h));
    systems.push({ x, y, w: right - x, h: bottom - y, measures: ms, startQ: ms[0].startQ, endQ: ms[ms.length - 1].endQ, staves });
  });

  return { width: origin.width, height: origin.height, systems, measures, notes };
}

export function systemAt(layout: Layout, q: number): number {
  const i = layout.systems.findIndex((s) => q >= s.startQ && q < s.endQ);
  return i >= 0 ? i : layout.systems.length - 1;
}

/** x position of musical time q, clamped to the given system. */
export function qToX(layout: Layout, q: number, sysIndex = systemAt(layout, q)): number {
  const sys = layout.systems[sysIndex];
  if (!sys) return 0;
  if (q <= sys.startQ) return sys.measures[0].anchors[0].x;
  if (q >= sys.endQ) return sys.x + sys.w;
  const m = sys.measures.find((mm) => q >= mm.startQ && q < mm.endQ) ?? sys.measures[sys.measures.length - 1];
  const a = m.anchors;
  for (let i = 0; i < a.length - 1; i++) {
    if (q >= a[i].q && q <= a[i + 1].q) {
      const t = a[i + 1].q === a[i].q ? 0 : (q - a[i].q) / (a[i + 1].q - a[i].q);
      return a[i].x + (a[i + 1].x - a[i].x) * t;
    }
  }
  return m.x + m.w;
}

/** Inverse of qToX inside one system. */
export function xToQ(layout: Layout, sysIndex: number, x: number): number {
  const sys = layout.systems[sysIndex];
  const pts = sys.measures.flatMap((m) => m.anchors);
  if (x <= pts[0].x) return pts[0].q;
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i].x && x <= pts[i + 1].x) {
      const dx = pts[i + 1].x - pts[i].x;
      return pts[i].q + (dx <= 0 ? 0 : ((x - pts[i].x) / dx) * (pts[i + 1].q - pts[i].q));
    }
  }
  return sys.endQ;
}

export function systemAtPoint(layout: Layout, y: number): number {
  let best = 0;
  let bestD = Infinity;
  layout.systems.forEach((s, i) => {
    const d = y < s.y ? s.y - y : y > s.y + s.h ? y - (s.y + s.h) : 0;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Splits a musical range into one horizontal segment per system it crosses. */
export function rangeSegments(layout: Layout, startQ: number, endQ: number): Segment[] {
  const total = Math.max(1e-6, endQ - startQ);
  const out: Segment[] = [];
  layout.systems.forEach((s, i) => {
    const a = Math.max(startQ, s.startQ);
    const b = Math.min(endQ, s.endQ);
    if (b <= a) return;
    const x0 = qToX(layout, a, i);
    const x1 = qToX(layout, b, i);
    out.push({ system: i, x: x0, y: s.y, w: Math.max(4, x1 - x0), h: s.h, from: (a - startQ) / total, span: (b - a) / total });
  });
  return out;
}
