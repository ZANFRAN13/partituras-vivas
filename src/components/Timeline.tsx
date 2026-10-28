import { useRef, useState, useLayoutEffect } from 'react';
import { useStore } from '../model/store';
import { transport } from '../audio/transport';
import { FAMILIES, presetById } from '../model/presets';
import { EASES, paramAt } from '../model/curves';
import { snap, useFrame, useTransport } from '../hooks';
import type { Ease, EffectInstance } from '../model/types';

const RULER = 26;
const LANE = 30;
const CURVE = 104;

type Drag =
  | { kind: 'scrub' }
  | { kind: 'clip'; id: string; q0: number; start0: number; end0: number; tracks0: EffectInstance['tracks'] }
  | { kind: 'trim'; id: string; end: 'start' | 'end' }
  | { kind: 'key'; id: string; param: string; index: number }
  | null;

export function Timeline() {
  const score = useStore((s) => s.score);
  const project = useStore((s) => s.project);
  const selectedFx = useStore((s) => s.selectedFx);
  const selectedParam = useStore((s) => s.selectedParam);
  const selection = useStore((s) => s.selection);
  useTransport();
  const areaRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);
  const [width, setWidth] = useState(800);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalQ = score?.totalQ ?? 1;
  const pxPerQ = Math.max(6, (width - 16) / totalQ);
  const X = (q: number) => 8 + q * pxPerQ;
  const Q = (clientX: number) => {
    const r = areaRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(totalQ, (clientX - r.left + areaRef.current!.scrollLeft - 8) / pxPerQ));
  };

  const fx = project.effects.find((e) => e.id === selectedFx);
  const pdef = fx && selectedParam ? FAMILIES[fx.family].params.find((p) => p.key === selectedParam) : undefined;
  const lanesH = project.effects.length * LANE + LANE;
  const curveTop = RULER + lanesH + 6;
  const totalH = curveTop + (pdef ? CURVE + 10 : 0);

  useFrame(() => {
    if (headRef.current) headRef.current.style.transform = `translateX(${X(transport.q)}px)`;
  });

  const curvePath = (() => {
    if (!fx || !pdef) return '';
    const n = 160;
    const pts: string[] = [];
    for (let i = 0; i <= n; i++) {
      const q = fx.startQ + ((fx.endQ - fx.startQ) * i) / n;
      const v = (paramAt(fx, pdef.key, q) - pdef.min) / (pdef.max - pdef.min);
      pts.push(`${X(q).toFixed(1)},${(curveTop + CURVE - v * CURVE).toFixed(1)}`);
    }
    return `M${pts.join(' L')}`;
  })();

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const st = useStore.getState();
    const q = Q(e.clientX);
    const step = e.altKey ? 0.125 : 0.5;
    if (d.kind === 'scrub') transport.seek(q);
    else if (d.kind === 'clip') {
      const delta = snap(q - d.q0, step);
      const len = d.end0 - d.start0;
      const start = Math.max(0, Math.min(totalQ - len, d.start0 + delta));
      const shift = start - d.start0;
      const tracks = Object.fromEntries(Object.entries(d.tracks0).map(([k, keys]) => [k, keys.map((kk) => ({ ...kk, q: kk.q + shift }))]));
      st.updateEffect(d.id, { startQ: start, endQ: start + len, tracks }, `clip:${d.id}`);
    } else if (d.kind === 'trim') {
      const e0 = st.project.effects.find((x) => x.id === d.id);
      if (!e0) return;
      const qq = snap(q, step);
      if (d.end === 'start') st.updateEffect(d.id, { startQ: Math.min(qq, e0.endQ - 0.5) }, `trim:${d.id}`);
      else st.updateEffect(d.id, { endQ: Math.max(qq, e0.startQ + 0.5) }, `trim:${d.id}`);
    } else if (d.kind === 'key' && fx && pdef) {
      const r = areaRef.current!.getBoundingClientRect();
      const y = e.clientY - r.top;
      const v = pdef.min + Math.max(0, Math.min(1, (curveTop + CURVE - y) / CURVE)) * (pdef.max - pdef.min);
      const keys = (fx.tracks[d.param] ?? []).slice();
      const k = keys[d.index];
      if (!k) return;
      const prev = keys[d.index - 1]?.q ?? -Infinity;
      const next = keys[d.index + 1]?.q ?? Infinity;
      const nq = Math.max(prev + 0.125, Math.min(next - 0.125, snap(q, e.altKey ? 0.0625 : 0.25)));
      keys[d.index] = { ...k, q: nq, v: Math.round(v * 1000) / 1000 };
      st.updateEffect(fx.id, { tracks: { ...fx.tracks, [d.param]: keys } }, `kdrag:${fx.id}:${d.param}:${d.index}`);
    }
  };

  const start = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const cycleEase = (index: number) => {
    if (!fx || !pdef) return;
    const keys = (fx.tracks[pdef.key] ?? []).slice();
    const i = EASES.findIndex((x) => x.id === keys[index].ease);
    keys[index] = { ...keys[index], ease: EASES[(i + 1) % EASES.length].id as Ease };
    useStore.getState().updateEffect(fx.id, { tracks: { ...fx.tracks, [pdef.key]: keys } });
  };

  return (
    <div className="timeline">
      <div className="tl-gutter" style={{ height: totalH }}>
        <div className="tl-gutter-head" style={{ height: RULER }}>
          Compases
        </div>
        {project.effects.map((e) => (
          <div key={e.id} className={`tl-name ${e.id === selectedFx ? 'on' : ''}`} style={{ height: LANE }} onClick={() => useStore.getState().selectFx(e.id)}>
            <span className="dot" style={{ background: presetById(e.presetId)?.swatch }} />
            {e.name}
          </div>
        ))}
        <div className="tl-name ink" style={{ height: LANE }}>
          <span className="dot" style={{ background: useStore.getState().inkColor }} />
          Tinta del director
        </div>
        {pdef && fx && (
          <div className="tl-curve-name" style={{ top: curveTop, height: CURVE }}>
            <select value={pdef.key} onChange={(e) => useStore.getState().selectParam(e.target.value)}>
              {FAMILIES[fx.family].params.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <small>Doble clic: añadir punto · clic derecho: curva</small>
          </div>
        )}
      </div>
      <div className="tl-area" ref={areaRef} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <div className="tl-inner" style={{ width: X(totalQ) + 8, height: totalH }}>
          <div className="tl-ruler" style={{ height: RULER }} onPointerDown={(e) => start(e, { kind: 'scrub' })}>
            {score?.measures.map((m) => (
              <div key={m.id} className="tl-measure" style={{ left: X(m.startQ), width: (m.endQ - m.startQ) * pxPerQ }}>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
          {selection && (
            <div className="tl-selection" style={{ left: X(selection.startQ), width: (selection.endQ - selection.startQ) * pxPerQ, top: RULER, height: totalH - RULER }} />
          )}
          {transport.loop && <div className="tl-loop" style={{ left: X(transport.loop.startQ), width: (transport.loop.endQ - transport.loop.startQ) * pxPerQ }} />}
          {project.effects.map((e, i) => (
            <div
              key={e.id}
              className={`tl-clip ${e.id === selectedFx ? 'on' : ''} ${e.visible ? '' : 'off'}`}
              style={{ left: X(e.startQ), width: (e.endQ - e.startQ) * pxPerQ, top: RULER + i * LANE + 4, height: LANE - 8, background: presetById(e.presetId)?.swatch }}
              onPointerDown={(ev) => {
                useStore.getState().selectFx(e.id);
                start(ev, { kind: 'clip', id: e.id, q0: Q(ev.clientX), start0: e.startQ, end0: e.endQ, tracks0: e.tracks });
              }}
            >
              <span className="tl-clip-label">{e.label || e.name}</span>
              <span className="trim start" onPointerDown={(ev) => start(ev, { kind: 'trim', id: e.id, end: 'start' })} />
              <span className="trim end" onPointerDown={(ev) => start(ev, { kind: 'trim', id: e.id, end: 'end' })} />
            </div>
          ))}
          {project.ink.map((s) => (
            <div key={s.id} className="tl-ink" style={{ left: X(s.q), top: RULER + project.effects.length * LANE + 9, background: s.color }} title="Trazo de tinta" />
          ))}
          {fx && pdef && (
            <svg
              className="tl-curve"
              style={{ top: 0, height: totalH, width: X(totalQ) + 8 }}
              onDoubleClick={(e) => {
                const r = areaRef.current!.getBoundingClientRect();
                const q = snap(Q(e.clientX), 0.25);
                const v = pdef.min + Math.max(0, Math.min(1, (curveTop + CURVE - (e.clientY - r.top)) / CURVE)) * (pdef.max - pdef.min);
                useStore.getState().setKey(fx.id, pdef.key, Math.max(fx.startQ, Math.min(fx.endQ, q)), v);
              }}
            >
              <rect x={X(fx.startQ)} y={curveTop} width={(fx.endQ - fx.startQ) * pxPerQ} height={CURVE} className="tl-curve-bg" />
              <path d={curvePath} className="tl-curve-line" />
              {(fx.tracks[pdef.key] ?? []).map((k, i) => (
                <g key={i}>
                  <circle
                    cx={X(k.q)}
                    cy={curveTop + CURVE - ((k.v - pdef.min) / (pdef.max - pdef.min)) * CURVE}
                    r={6}
                    className={`tl-key ease-${k.ease}`}
                    onPointerDown={(e) => start(e, { kind: 'key', id: fx.id, param: pdef.key, index: i })}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const keys = (fx.tracks[pdef.key] ?? []).filter((_, j) => j !== i);
                      useStore.getState().updateEffect(fx.id, { tracks: { ...fx.tracks, [pdef.key]: keys }, params: keys.length ? fx.params : { ...fx.params, [pdef.key]: k.v } });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      cycleEase(i);
                    }}
                  >
                    <title>{`${EASES.find((x) => x.id === k.ease)?.label} · ${k.v.toFixed(2)}`}</title>
                  </circle>
                </g>
              ))}
            </svg>
          )}
          <div className="tl-head" ref={headRef} style={{ height: totalH }} onPointerDown={(e) => start(e, { kind: 'scrub' })} />
        </div>
      </div>
    </div>
  );
}

