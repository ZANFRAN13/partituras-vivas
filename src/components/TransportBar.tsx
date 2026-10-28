import { useRef } from 'react';
import { transport } from '../audio/transport';
import { useStore } from '../model/store';
import { useFrame, useTransport } from '../hooks';

const VOICES = ['S', 'A', 'T', 'B'];

export function TransportBar({ compact = false }: { compact?: boolean }) {
  const t = useTransport();
  const score = useStore((s) => s.score);
  const posRef = useRef<HTMLSpanElement>(null);

  useFrame(() => {
    if (!posRef.current || !score) return;
    const q = transport.q;
    const m = score.measures.find((mm) => q >= mm.startQ && q < mm.endQ) ?? score.measures[score.measures.length - 1];
    if (!m) return;
    const beat = Math.floor(q - m.startQ) + 1;
    const text = `c. ${m.label} · ${beat}`;
    if (posRef.current.textContent !== text) posRef.current.textContent = text;
  });

  const setBpm = (bpm: number) => {
    transport.setBpm(bpm);
    useStore.getState().change((p) => ({ ...p, bpm }), 'bpm');
  };

  return (
    <div className={`transport ${compact ? 'compact' : ''}`}>
      <button className="play" onClick={() => transport.toggle()} aria-label={t.playing ? 'Pausa' : 'Reproducir'}>
        {t.playing ? '❚❚' : '▶'}
      </button>
      <button onClick={() => transport.seek(t.loop?.startQ ?? 0)} title="Volver al inicio">
        ⏮
      </button>
      <span className="pos" ref={posRef} />
      <label className="tempo">
        <span>♩ = {Math.round(t.bpm)}</span>
        <input type="range" min={30} max={160} value={t.bpm} onChange={(e) => setBpm(+e.target.value)} />
      </label>
      {t.loop && (
        <button className="on" onClick={() => transport.setLoop(null)} title="Quitar bucle">
          ⟲ Bucle
        </button>
      )}
      <button className={t.metronome ? 'on' : ''} onClick={() => ((transport.metronome = !transport.metronome), transport.setVolume(transport.volume))} title="Metrónomo">
        Metrónomo
      </button>
      {!compact && (
        <div className="voices" title="Clic: silenciar · Alt + clic: solo">
          {VOICES.map((v, i) => (
            <button
              key={v}
              className={`${t.solo === i ? 'solo' : ''} ${t.muted[i] ? 'muted' : ''}`}
              onClick={(e) => (e.altKey ? transport.setSolo(t.solo === i ? null : i) : transport.setMute(i, !t.muted[i]))}
            >
              {score?.staffNames[i]?.[0] ?? v}
            </button>
          ))}
        </div>
      )}
      <label className="vol">
        <span>Vol</span>
        <input type="range" min={0} max={1} step={0.01} value={t.volume} onChange={(e) => transport.setVolume(+e.target.value)} />
      </label>
    </div>
  );
}
