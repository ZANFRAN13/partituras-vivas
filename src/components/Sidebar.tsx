import { useStore } from '../model/store';
import { FAMILIES, PRESETS } from '../model/presets';
import type { FamilyId } from '../model/types';

const ORDER: FamilyId[] = ['olas', 'fuego', 'luz', 'nubes'];

export function Sidebar() {
  const project = useStore((s) => s.project);
  const selectedFx = useStore((s) => s.selectedFx);
  const selection = useStore((s) => s.selection);
  const st = useStore.getState();

  return (
    <aside className="sidebar">
      <section>
        <h3>Catálogo de magia</h3>
        <p className="muted small">Arrastra un efecto a un compás{selection ? ' o haz clic para aplicarlo a la selección' : ''}.</p>
        {ORDER.map((f) => (
          <div key={f} className="family">
            <h4>{FAMILIES[f].name}</h4>
            {PRESETS.filter((p) => p.family === f).map((p) => (
              <div
                key={p.id}
                className="catalog-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/x-preset', p.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => selection && st.addEffect(p.id, selection)}
                title={p.hint}
              >
                <span className="swatch" style={{ background: p.swatch }} />
                <span>
                  <b>{p.name}</b>
                  <small>{p.hint}</small>
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className="catalog-soon">
          <b>Próximamente</b>
          <small>Sube tus propios efectos (GIF, video con alfa, Lottie) o genéralos con IA.</small>
        </div>
      </section>

      <section>
        <h3>Capas</h3>
        {project.effects.length === 0 && <p className="muted small">Aún no hay efectos.</p>}
        {project.effects
          .map((e, i) => ({ e, i }))
          .reverse()
          .map(({ e }) => (
            <div key={e.id} className={`layer ${e.id === selectedFx ? 'on' : ''}`} onClick={() => st.selectFx(e.id)}>
              <button
                className="eye"
                onClick={(ev) => {
                  ev.stopPropagation();
                  st.updateEffect(e.id, { visible: !e.visible });
                }}
                title={e.visible ? 'Ocultar' : 'Mostrar'}
              >
                {e.visible ? '●' : '○'}
              </button>
              <span className="layer-name">{e.label || e.name}</span>
              <span className="layer-order">
                <button onClick={(ev) => (ev.stopPropagation(), st.moveEffect(e.id, 1))} title="Subir">
                  ▴
                </button>
                <button onClick={(ev) => (ev.stopPropagation(), st.moveEffect(e.id, -1))} title="Bajar">
                  ▾
                </button>
              </span>
            </div>
          ))}
        <div className="layer ink-layer-row">
          <span className="layer-name">Tinta del director · {project.ink.length} trazos</span>
          {project.ink.length > 0 && (
            <button className="link" onClick={() => st.clearInk()}>
              Borrar
            </button>
          )}
        </div>
      </section>
    </aside>
  );
}
