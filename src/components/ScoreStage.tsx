import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, uid } from '../model/store';
import { transport } from '../audio/transport';
import { measureLayout, qToX, rangeSegments, systemAtPoint, xToQ, type Layout } from '../score/geometry';
import { FxRenderer, hexToRgb } from '../fx/renderer';
import { buildDraws, effectAreas } from '../fx/scene';
import { envelopeAt, paramAt } from '../model/curves';
import { FAMILIES } from '../model/presets';
import { snap, useFrame, useTransport } from '../hooks';
import type { InkPoint, InkStroke, Range } from '../model/types';
import { SelectionBar } from './SelectionBar';

const INK_DARK = [0.08, 0.07, 0.06];

export function ScoreStage() {
  const score = useStore((s) => s.score);
  const layout = useStore((s) => s.layout);
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const selectedFx = useStore((s) => s.selectedFx);
  const mode = useStore((s) => s.mode);
  const tool = useStore((s) => s.tool);
  const inkColor = useStore((s) => s.inkColor);
  const clean = useStore((s) => s.clean);
  const darkStage = useStore((s) => s.darkStage);
  const t = useTransport();

  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<FxRenderer | null>(null);
  const noteEls = useRef(new Map<string, { el: SVGGElement; color: string; filter: string; sounding: boolean }>());
  const inkRefs = useRef(new Map<string, { path: SVGPathElement; tip: SVGCircleElement | null }>());
  const ambient = useRef({ value: 0, last: 0 });
  const [zoom, setZoom] = useState(1);
  const [livePath, setLivePath] = useState<string | null>(null);

  // Mount the engraved SVG and index its notes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !score) return;
    const host = stage.querySelector<HTMLDivElement>('.notation')!;
    host.innerHTML = score.svg;
    const svg = host.querySelector('svg');
    if (svg) {
      const w = parseFloat(svg.getAttribute('width') ?? '0');
      const h = parseFloat(svg.getAttribute('height') ?? '0');
      if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
    }
    noteEls.current.clear();
    host.querySelectorAll<SVGGElement>('g.note').forEach((el) => {
      noteEls.current.set(el.getAttribute('data-id') ?? '', { el, color: '', filter: '', sounding: false });
    });
  }, [score]);

  // Measure the layout on mount, zoom and resize.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !score) return;
    const measure = () => useStore.getState().setLayout(measureLayout(stage, score));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [score, zoom]);

  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) rendererRef.current = new FxRenderer(canvasRef.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom((z) => Math.min(1.8, z + 0.1));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(0.6, z - 0.1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pointToQ = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    const l = useStore.getState().layout;
    if (!stage || !l || l.systems.length === 0) return null;
    const r = stage.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const sys = systemAtPoint(l, y);
    return { q: xToQ(l, sys, x), sys, x, y };
  }, []);

  // ---- Frame loop: effects, cursor, notes, ink reveal --------------------------------
  useFrame((now) => {
    const st = useStore.getState();
    const l = st.layout;
    const r = rendererRef.current;
    if (!l || !r) return;
    const q = transport.q;
    const wall = now / 1000;
    const amb = ambient.current;
    const dt = amb.last ? Math.min(0.1, wall - amb.last) : 0;
    amb.last = wall;
    if (!transport.playing && st.mode === 'estudio' && !st.reducedMotion) amb.value += dt * 0.35;

    const dpr = Math.min(2, window.devicePixelRatio || 1) * st.quality;
    r.resize(l.width, l.height, dpr);
    const draws = st.clean
      ? []
      : buildDraws(l, st.project.effects, {
          q,
          bpm: transport.bpm,
          playing: transport.playing,
          ambient: amb.value,
          selectedFx: st.mode === 'estudio' ? st.selectedFx : null,
          reducedMotion: st.reducedMotion,
        });
    r.render(draws, l.width, l.height, { dark: st.darkStage, flash: !st.reducedMotion });

    // Cursor
    const cur = cursorRef.current;
    if (cur && l.systems.length) {
      const si = l.systems.findIndex((s) => q >= s.startQ && q < s.endQ);
      const sys = l.systems[si >= 0 ? si : l.systems.length - 1];
      const x = qToX(l, q, si >= 0 ? si : l.systems.length - 1);
      const pad = sys.h * 0.22;
      cur.style.transform = `translate(${x}px, ${sys.y - pad}px)`;
      cur.style.height = `${sys.h + pad * 2}px`;
      cur.style.opacity = transport.playing || q > 0 ? '1' : '0';
      if (transport.playing && scrollRef.current) {
        const sc = scrollRef.current;
        const top = sys.y - sc.clientHeight * 0.3;
        if (Math.abs(sc.scrollTop - top) > sc.clientHeight * 0.25) sc.scrollTo({ top, behavior: 'smooth' });
      }
    }

    // Notes: sounding highlight and effect tints
    const tints: { a: number; b: number; col: [number, number, number]; amt: number }[] = [];
    if (!st.clean) {
      for (const fx of st.project.effects) {
        if (!fx.visible || !fx.tintNotes) continue;
        const env = envelopeAt(fx, q);
        if (env <= 0) continue;
        tints.push({ a: fx.startQ, b: fx.endQ, col: hexToRgb(fx.colorA), amt: env * paramAt(fx, 'intensidad', q) });
      }
    }
    const notes = st.score?.notes ?? [];
    for (const n of notes) {
      const rec = noteEls.current.get(n.id);
      if (!rec) continue;
      const sounding = transport.playing && q >= n.onQ && q < n.offQ - 0.02;
      let color = '';
      let filter = '';
      for (const tt of tints) {
        if (n.onQ >= tt.a && n.onQ < tt.b && tt.amt > 0.02) {
          const m = Math.min(1, tt.amt) * 0.85;
          const base = st.darkStage ? [0.93, 0.91, 0.86] : INK_DARK;
          const c = base.map((v, i) => Math.round((v + (tt.col[i] - v) * m) * 255));
          color = `rgb(${c[0]},${c[1]},${c[2]})`;
          if (m > 0.35) filter = `drop-shadow(0 0 ${(2 + 5 * m).toFixed(1)}px rgba(${c[0]},${c[1]},${c[2]},${(0.5 * m).toFixed(2)}))`;
        }
      }
      if (sounding !== rec.sounding) {
        rec.el.classList.toggle('sounding', sounding);
        rec.sounding = sounding;
      }
      if (color !== rec.color) {
        rec.el.style.fill = color;
        rec.el.style.color = color;
        rec.color = color;
      }
      if (filter !== rec.filter) {
        rec.el.style.filter = filter;
        rec.filter = filter;
      }
    }

    // Ink reveal: strokes draw themselves when the music reaches them.
    const reveal = transport.playing || st.mode === 'ensayo';
    for (const s of st.project.ink) {
      const refs = inkRefs.current.get(s.id);
      if (!refs) continue;
      const T = Math.max(1, s.points[s.points.length - 1]?.t ?? 1);
      const durQ = Math.max(0.25, (T / 1000) * (transport.bpm / 60));
      const f = reveal ? Math.max(0, Math.min(1, (q - s.q) / durQ)) : 1;
      refs.path.style.strokeDashoffset = String(1 - f);
      if (refs.tip) {
        const drawing = f > 0 && f < 1;
        refs.tip.style.opacity = drawing ? '1' : '0';
        if (drawing && l) {
          const m = l.measures.get(s.measureId);
          const tt = f * T;
          const p = s.points.find((pp) => pp.t >= tt) ?? s.points[s.points.length - 1];
          if (m && p) refs.tip.setAttribute('transform', `translate(${m.x + p.u * m.w},${m.y + p.v * m.h})`);
        }
      }
    }
  });

  // ---- Pointer interaction --------------------------------------------------------
  const drag = useRef<
    | { kind: 'select'; startQ: number; moved: boolean; x0: number; y0: number; shift: boolean }
    | { kind: 'handle'; end: 'start' | 'end' }
    | { kind: 'ink'; measureId: string; pts: InkPoint[]; t0: number; q: number }
    | { kind: 'move-fx'; id: string; y0: number; offset0: number; sysH: number }
    | null
  >(null);

  const measureAt = (l: Layout, q: number, sys: number) =>
    l.systems[sys]?.measures.find((m) => q >= m.startQ && q < m.endQ) ?? l.systems[sys]?.measures.at(-1);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = pointToQ(e.clientX, e.clientY);
    const l = useStore.getState().layout;
    if (!p || !l) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (tool === 'tinta') {
      const m = measureAt(l, p.q, p.sys);
      if (!m) return;
      const pt = { u: (p.x - m.x) / m.w, v: (p.y - m.y) / m.h, t: 0, p: e.pressure || 0.5 };
      drag.current = { kind: 'ink', measureId: m.id, pts: [pt], t0: performance.now(), q: snap(p.q, 0.25) };
      setLivePath(`M${p.x} ${p.y}`);
      return;
    }
    // Click on a note selects exactly that note's duration.
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.closest?.('g.note'));
    const noteId = hit?.closest('g.note')?.getAttribute('data-id');
    const note = noteId ? useStore.getState().score?.notes.find((n) => n.id === noteId) : undefined;
    const sel = useStore.getState().selection;
    if (note) {
      const r: Range = e.shiftKey && sel ? { startQ: Math.min(sel.startQ, note.onQ), endQ: Math.max(sel.endQ, note.offQ) } : { startQ: note.onQ, endQ: note.offQ };
      useStore.getState().setSelection(r);
      drag.current = null;
      return;
    }
    drag.current = { kind: 'select', startQ: p.q, moved: false, x0: e.clientX, y0: e.clientY, shift: e.shiftKey };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = pointToQ(e.clientX, e.clientY);
    const l = useStore.getState().layout;
    if (!p || !l) return;
    const step = e.altKey ? 0.25 : 1;
    if (d.kind === 'ink') {
      const m = l.measures.get(d.measureId)!;
      d.pts.push({ u: (p.x - m.x) / m.w, v: (p.y - m.y) / m.h, t: performance.now() - d.t0, p: e.pressure || 0.5 });
      setLivePath((prev) => `${prev} L${p.x} ${p.y}`);
      return;
    }
    if (d.kind === 'select') {
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.moved = true;
      const a = snap(Math.min(d.startQ, p.q), step);
      const b = snap(Math.max(d.startQ, p.q), step);
      useStore.getState().setSelection(b > a ? { startQ: a, endQ: b } : null);
      return;
    }
    if (d.kind === 'handle') {
      const sel = useStore.getState().selection;
      if (!sel) return;
      const q = snap(p.q, e.altKey ? 0.25 : 0.5);
      if (d.end === 'start') useStore.getState().setSelection({ startQ: Math.min(q, sel.endQ - 0.25), endQ: sel.endQ });
      else useStore.getState().setSelection({ startQ: sel.startQ, endQ: Math.max(q, sel.startQ + 0.25) });
      return;
    }
    if (d.kind === 'move-fx') {
      const dy = (e.clientY - d.y0) / d.sysH;
      useStore.getState().updateEffect(d.id, { offsetY: Math.round((d.offset0 + dy) * 100) / 100 }, `move:${d.id}`);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const l = useStore.getState().layout;
    if (d.kind === 'ink') {
      setLivePath(null);
      if (d.pts.length > 2) {
        const s: InkStroke = { id: uid(), measureId: d.measureId, q: d.q, color: inkColor, width: 3, points: d.pts, visible: true };
        useStore.getState().addStroke(s);
      }
      return;
    }
    if (d.kind === 'select' && !d.moved && l) {
      // A plain click selects the whole measure; shift extends the selection.
      const p = pointToQ(e.clientX, e.clientY);
      if (!p) return;
      const m = measureAt(l, p.q, p.sys);
      if (!m) return;
      const sel = useStore.getState().selection;
      const r = d.shift && sel ? { startQ: Math.min(sel.startQ, m.startQ), endQ: Math.max(sel.endQ, m.endQ) } : { startQ: m.startQ, endQ: m.endQ };
      useStore.getState().setSelection(r);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const p = pointToQ(e.clientX, e.clientY);
    if (p) transport.seek(snap(p.q, 0.25));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const presetId = e.dataTransfer.getData('text/x-preset');
    const p = pointToQ(e.clientX, e.clientY);
    const l = useStore.getState().layout;
    if (!presetId || !p || !l) return;
    const sel = useStore.getState().selection;
    let r: Range;
    if (sel && p.q >= sel.startQ && p.q <= sel.endQ) r = sel;
    else {
      const m = measureAt(l, p.q, p.sys)!;
      const all = Array.from(l.measures.values());
      const next = all.find((mm) => mm.startQ >= m.endQ);
      r = { startQ: m.startQ, endQ: next ? next.endQ : m.endQ };
    }
    useStore.getState().addEffect(presetId, r);
    useStore.getState().setSelection(r);
  };

  // ---- Derived overlay geometry -------------------------------------------------------
  const selSegs = useMemo(() => (layout && selection ? rangeSegments(layout, selection.startQ, selection.endQ) : []), [layout, selection]);
  const fxSel = project.effects.find((e) => e.id === selectedFx);
  const fxSelAreas = useMemo(() => (layout && fxSel ? effectAreas(layout, fxSel).segs : []), [layout, fxSel]);

  const inkPaths = useMemo(() => {
    if (!layout) return [];
    return project.ink
      .filter((s) => s.visible)
      .map((s) => {
        const m = layout.measures.get(s.measureId);
        if (!m) return null;
        const pts = s.points.map((p) => [m.x + p.u * m.w, m.y + p.v * m.h]);
        let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
        }
        const last = pts[pts.length - 1];
        d += ` L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
        return { s, d };
      })
      .filter(Boolean) as { s: InkStroke; d: string }[];
  }, [layout, project.ink]);

  const labels = useMemo(() => {
    if (!layout) return [];
    return project.effects
      .filter((fx) => fx.label.trim())
      .map((fx) => {
        const segs = rangeSegments(layout, fx.startQ, fx.endQ);
        const s = segs[0];
        if (!s) return null;
        const sys = layout.systems[s.system];
        // Labels near the right edge hang leftwards so they stay on the page.
        const right = s.x > layout.width * 0.62;
        return { fx, x: right ? layout.width - (s.x + s.w) : s.x, y: sys.y - 44, right };
      })
      .filter(Boolean) as { fx: (typeof project.effects)[number]; x: number; y: number; right: boolean }[];
  }, [layout, project.effects]);

  const loopSegs = useMemo(() => (layout && t.loop ? rangeSegments(layout, t.loop.startQ, t.loop.endQ) : []), [layout, t.loop]);

  return (
    <div className={`stage-scroll ${darkStage ? 'dark' : ''} ${mode}`} ref={scrollRef}>
      {!score && <div className="loading">Afinando la orquesta…</div>}
      <div
        className={`stage tool-${tool}`}
        ref={stageRef}
        style={{ width: `min(${Math.round(1100 * zoom)}px, ${Math.round(100 * zoom)}%)` }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <canvas className="fx-canvas" ref={canvasRef} style={{ width: layout?.width ?? 0, height: layout?.height ?? 0 }} />
        <div className="notation" />
        {!clean && (
          <svg className="ink-layer" width={layout?.width ?? 0} height={layout?.height ?? 0}>
            <defs>
              <filter id="ink-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>
            {inkPaths.map(({ s, d }) => (
              <g key={s.id}>
                <path
                  ref={(el) => {
                    if (el) inkRefs.current.set(s.id, { path: el, tip: inkRefs.current.get(s.id)?.tip ?? null });
                    else inkRefs.current.delete(s.id);
                  }}
                  d={d}
                  pathLength={1}
                  className="ink-stroke"
                  style={{ stroke: s.color, strokeWidth: s.width }}
                />
                <circle
                  ref={(el) => {
                    const cur = inkRefs.current.get(s.id);
                    if (cur) cur.tip = el;
                  }}
                  r={5}
                  className="ink-tip"
                  style={{ fill: s.color }}
                  filter="url(#ink-glow)"
                />
              </g>
            ))}
            {livePath && <path d={livePath} className="ink-live" style={{ stroke: inkColor }} />}
          </svg>
        )}
        <div className="overlay" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={onDoubleClick}>
          {loopSegs.map((s, i) => (
            <div key={`loop${i}`} className="loop-seg" style={{ left: s.x, top: s.y - 10, width: s.w, height: s.h + 20 }} />
          ))}
          {mode === 'estudio' &&
            fxSelAreas.map((s, i) => (
              <div
                key={`fx${i}`}
                className="fx-area"
                style={{ left: s.area.x, top: s.area.y, width: s.area.w, height: s.area.h }}
                onPointerDown={(e) => {
                  if (tool !== 'seleccion' || !e.altKey || !fxSel || !layout) return;
                  e.stopPropagation();
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { kind: 'move-fx', id: fxSel.id, y0: e.clientY, offset0: fxSel.offsetY, sysH: layout.systems[s.system].h };
                }}
              >
                {i === 0 && <span className="fx-area-tag">{FAMILIES[fxSel!.family].name} · Alt + arrastrar para mover</span>}
              </div>
            ))}
          {selSegs.map((s, i) => (
            <div key={`sel${i}`} className="sel-seg" style={{ left: s.x, top: s.y - 12, width: s.w, height: s.h + 24 }}>
              {i === 0 && (
                <span
                  className="handle start"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    drag.current = { kind: 'handle', end: 'start' };
                  }}
                />
              )}
              {i === selSegs.length - 1 && (
                <span
                  className="handle end"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    drag.current = { kind: 'handle', end: 'end' };
                  }}
                />
              )}
            </div>
          ))}
          {!clean &&
            labels.map(({ fx, x, y, right }) => (
              <button
                key={fx.id}
                className={`fx-label ${fx.id === selectedFx ? 'on' : ''} fam-${fx.family}`}
                style={right ? { right: x, top: y } : { left: x, top: y }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => useStore.getState().selectFx(fx.id)}
              >
                {fx.label}
              </button>
            ))}
          <div className="cursor" ref={cursorRef} />
        </div>
        {mode === 'estudio' && selection && selSegs.length > 0 && <SelectionBar seg={selSegs[selSegs.length - 1]} range={selection} />}
      </div>
      <div className="zoom">
        <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))} aria-label="Alejar">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2)))} aria-label="Acercar">+</button>
      </div>
    </div>
  );
}
