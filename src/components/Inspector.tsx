import { useStore } from '../model/store';
import { FAMILIES } from '../model/presets';
import { EASES, paramAt } from '../model/curves';
import { transport } from '../audio/transport';
import { useTransport } from '../hooks';
import type { Ease, Placement } from '../model/types';

const PLACEMENTS: { id: Placement; label: string }[] = [
  { id: 'fondo', label: 'Fondo del sistema' },
  { id: 'debajo', label: 'Debajo del pentagrama' },
  { id: 'arriba', label: 'Sobre el pentagrama' },
  { id: 'pentagrama', label: 'En las notas' },
];

function where(q: number) {
  const ms = useStore.getState().score?.measures ?? [];
  const m = ms.find((mm) => q >= mm.startQ && q < mm.endQ) ?? ms[ms.length - 1];
  if (!m) return '';
  const beat = q - m.startQ + 1;
  return `c. ${m.label}, pulso ${Number.isInteger(beat) ? beat : beat.toFixed(2)}`;
}

export function Inspector() {
  const project = useStore((s) => s.project);
  const selectedFx = useStore((s) => s.selectedFx);
  const selectedParam = useStore((s) => s.selectedParam);
  useTransport();
  const fx = project.effects.find((e) => e.id === selectedFx);

  if (!fx) {
    return (
      <aside className="inspector empty">
        <h3>Inspector</h3>
        <p>Selecciona compases o notas en la partitura y pulsa <b>✦ Dar vida</b>, o arrastra un efecto del catálogo sobre la hoja.</p>
        <ul className="hints">
          <li><kbd>Espacio</kbd> reproducir</li>
          <li><kbd>T</kbd> tinta · <kbd>V</kbd> seleccionar</li>
          <li><kbd>L</kbd> lectura limpia</li>
          <li><kbd>E</kbd> modo ensayo</li>
          <li><kbd>⌘Z</kbd> deshacer</li>
        </ul>
      </aside>
    );
  }

  const fam = FAMILIES[fx.family];
  const q = transport.q;
  const inside = q >= fx.startQ && q <= fx.endQ;
  const st = useStore.getState();
  const up = (patch: Parameters<typeof st.updateEffect>[1], key?: string) => st.updateEffect(fx.id, patch, key);

  return (
    <aside className="inspector">
      <div className="insp-head">
        <h3>{fx.name}</h3>
        <span className="muted">
          {where(fx.startQ)} → {where(fx.endQ)}
        </span>
      </div>

      <label className="field">
        <span>Indicación sobre la hoja</span>
        <input value={fx.label} placeholder="más abierto, como olas" onChange={(e) => up({ label: e.target.value }, `label:${fx.id}`)} />
      </label>

      <div className="row2">
        <label className="field">
          <span>Ubicación</span>
          <select value={fx.placement} onChange={(e) => up({ placement: e.target.value as Placement })}>
            {PLACEMENTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Colores</span>
          <span className="colors">
            <input type="color" value={fx.colorA} onChange={(e) => up({ colorA: e.target.value }, `colA:${fx.id}`)} />
            <input type="color" value={fx.colorB} onChange={(e) => up({ colorB: e.target.value }, `colB:${fx.id}`)} />
          </span>
        </label>
      </div>

      <div className="row2">
        <label className="field">
          <span>Altura de la zona</span>
          <input type="range" min={0.3} max={2.5} step={0.01} value={fx.heightScale} onChange={(e) => up({ heightScale: +e.target.value }, `h:${fx.id}`)} />
        </label>
        <label className="field">
          <span>Posición vertical</span>
          <input type="range" min={-1.5} max={1.5} step={0.01} value={fx.offsetY} onChange={(e) => up({ offsetY: +e.target.value }, `o:${fx.id}`)} />
        </label>
      </div>
      <div className="row2">
        <label className="field">
          <span>Entrada y salida (pulsos)</span>
          <input type="range" min={0} max={4} step={0.25} value={fx.fadeQ} onChange={(e) => up({ fadeQ: +e.target.value }, `f:${fx.id}`)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={fx.tintNotes} onChange={(e) => up({ tintNotes: e.target.checked })} />
          Teñir las notas
        </label>
      </div>

      <div className="params-head">
        <h4>Parámetros vivos</h4>
        <span className="muted">{inside ? `cabezal en ${where(q)}` : 'mueve el cabezal dentro del efecto para animar'}</span>
      </div>
      {fam.params.map((p) => {
        const track = fx.tracks[p.key] ?? [];
        const animated = track.length > 0;
        const atKey = track.find((k) => Math.abs(k.q - q) < 0.06);
        const value = paramAt(fx, p.key, inside ? q : fx.startQ);
        return (
          <div key={p.key} className={`param ${selectedParam === p.key ? 'on' : ''}`}>
            <button
              className={`key-btn ${atKey ? 'at' : animated ? 'anim' : ''}`}
              title={atKey ? 'Quitar punto clave' : 'Añadir punto clave en el cabezal'}
              disabled={!inside}
              onClick={() => {
                st.selectParam(p.key);
                st.toggleKeyAt(fx.id, p.key, q);
              }}
            >
              ◆
            </button>
            <button className="param-name" onClick={() => st.selectParam(p.key)}>
              {p.label}
            </button>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step ?? (p.max - p.min) / 200}
              value={value}
              onPointerDown={() => st.selectParam(p.key)}
              onChange={(e) => st.setParam(fx.id, p.key, +e.target.value, inside ? q : fx.startQ)}
            />
            <span className="val">{value.toFixed(2)}</span>
          </div>
        );
      })}
      {selectedParam && (fx.tracks[selectedParam]?.length ?? 0) > 0 && (
        <label className="field">
          <span>Curva desde el punto anterior al cabezal</span>
          <select
            value={(() => {
              const keys = fx.tracks[selectedParam] ?? [];
              const prev = [...keys].reverse().find((k) => k.q <= q + 0.06) ?? keys[0];
              return prev?.ease ?? 'smooth';
            })()}
            onChange={(e) => {
              const keys = (fx.tracks[selectedParam] ?? []).slice();
              let idx = -1;
              keys.forEach((k, i) => {
                if (k.q <= q + 0.06) idx = i;
              });
              if (idx < 0) idx = 0;
              keys[idx] = { ...keys[idx], ease: e.target.value as Ease };
              up({ tracks: { ...fx.tracks, [selectedParam]: keys } });
            }}
          >
            {EASES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="insp-actions">
        <button onClick={() => up({ visible: !fx.visible })}>{fx.visible ? 'Ocultar' : 'Mostrar'}</button>
        <button
          onClick={() => {
            transport.setLoop({ startQ: fx.startQ, endQ: fx.endQ });
            transport.seek(fx.startQ);
            transport.play();
          }}
        >
          ▶ Escuchar
        </button>
        <button className="danger" onClick={() => st.removeEffect(fx.id)}>
          Eliminar
        </button>
      </div>
    </aside>
  );
}
