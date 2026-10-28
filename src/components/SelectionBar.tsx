import { useState } from 'react';
import { useStore } from '../model/store';
import { PRESETS, FAMILIES } from '../model/presets';
import { interpretIntent, type IntentProposal } from '../model/intent';
import { transport } from '../audio/transport';
import { useTransport } from '../hooks';
import type { Range } from '../model/types';
import type { Segment } from '../score/geometry';

export function SelectionBar({ seg, range }: { seg: Segment; range: Range }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<IntentProposal | null>(null);
  const t = useTransport();
  const looping = !!t.loop && t.loop.startQ === range.startQ && t.loop.endQ === range.endQ;

  const apply = (presetId: string) => {
    useStore.getState().addEffect(presetId, range);
    setOpen(false);
  };

  const applyProposal = () => {
    if (!proposal) return;
    const st = useStore.getState();
    const id = st.addEffect(proposal.presetId, range);
    const fx = useStore.getState().project.effects.find((e) => e.id === id)!;
    st.updateEffect(id, { label: proposal.label, params: { ...fx.params, ...proposal.params }, tracks: { ...fx.tracks, ...proposal.tracks } });
    setProposal(null);
    setText('');
    setOpen(false);
  };

  const playPassage = () => {
    transport.setLoop(range);
    transport.seek(range.startQ);
    transport.play();
  };

  return (
    <div className="sel-bar" style={{ left: seg.x + seg.w, top: seg.y - 64 }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="sel-bar-row">
        <button className="magic-btn" onClick={() => setOpen((o) => !o)}>
          ✦ Dar vida
        </button>
        <button onClick={playPassage} title="Reproducir este pasaje en bucle">
          ▶ Pasaje
        </button>
        <button className={looping ? 'on' : ''} onClick={() => transport.setLoop(looping ? null : range)} title="Bucle A-B">
          ⟲
        </button>
        <button onClick={() => useStore.getState().setSelection(null)} title="Quitar selección">
          ×
        </button>
      </div>
      {open && (
        <div className="sel-pop">
          <form
            className="intent"
            onSubmit={(e) => {
              e.preventDefault();
              setProposal(interpretIntent(text, range));
            }}
          >
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe la sensación: «olas suaves que crecen»" />
          </form>
          {proposal && (
            <div className="proposal">
              <div>
                <strong>{PRESETS.find((p) => p.id === proposal.presetId)?.name}</strong>
                <span> · {proposal.summary}</span>
              </div>
              <div className="proposal-actions">
                <button className="magic-btn" onClick={applyProposal}>
                  Aplicar
                </button>
                <button onClick={() => setProposal(null)}>Descartar</button>
              </div>
            </div>
          )}
          <div className="preset-grid">
            {PRESETS.map((p) => (
              <button key={p.id} className="preset-chip" onClick={() => apply(p.id)} title={p.hint}>
                <span className="swatch" style={{ background: p.swatch }} />
                <span>
                  <b>{p.name}</b>
                  <small>{FAMILIES[p.family].name}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
