import { useRef } from 'react';
import { useStore } from '../model/store';
import type { Project } from '../model/types';

const INKS = ['#c8102e', '#1f5fbf', '#c9962b', '#2e8b57'];
const SAVE_LABEL = { guardado: 'Guardado', guardando: 'Guardando…', 'sin-guardar': 'Cambios sin guardar', error: 'Error al guardar' };

export function TopBar() {
  const project = useStore((s) => s.project);
  const tool = useStore((s) => s.tool);
  const inkColor = useStore((s) => s.inkColor);
  const clean = useStore((s) => s.clean);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const darkStage = useStore((s) => s.darkStage);
  const quality = useStore((s) => s.quality);
  const saveState = useStore((s) => s.saveState);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = useStore.getState();

  const exportProject = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.title || 'partitura-viva'}.pv.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importProject = async (file: File) => {
    try {
      const p = JSON.parse(await file.text()) as Project;
      if (p.version !== 1 || !Array.isArray(p.effects)) throw new Error('formato');
      st.loadProject({ ...p, scoreUrl: project.scoreUrl });
    } catch {
      alert('Ese archivo no es un proyecto de Partituras Vivas.');
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">✦</span>
        <span>Partituras Vivas</span>
      </div>
      <input
        className="title-input"
        value={project.title}
        onChange={(e) => st.change((p) => ({ ...p, title: e.target.value }), 'title')}
        aria-label="Título del proyecto"
      />
      <span className={`save ${saveState}`}>{SAVE_LABEL[saveState]}</span>

      <div className="group">
        <button onClick={st.undo} disabled={!canUndo} title="Deshacer (⌘Z)">
          ↶
        </button>
        <button onClick={st.redo} disabled={!canRedo} title="Rehacer (⇧⌘Z)">
          ↷
        </button>
      </div>

      <div className="group tools">
        <button className={tool === 'seleccion' ? 'on' : ''} onClick={() => st.setUi({ tool: 'seleccion' })} title="Seleccionar (V)">
          Seleccionar
        </button>
        <button className={tool === 'tinta' ? 'on' : ''} onClick={() => st.setUi({ tool: 'tinta' })} title="Tinta viva (T)">
          ✎ Tinta
        </button>
        {tool === 'tinta' &&
          INKS.map((c) => (
            <button key={c} className={`ink-dot ${inkColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => st.setUi({ inkColor: c })} aria-label="Color de tinta" />
          ))}
      </div>

      <div className="spacer" />

      <div className="group toggles">
        <button className={clean ? 'on' : ''} onClick={() => st.setUi({ clean: !clean })} title="Lectura limpia (L)">
          Lectura limpia
        </button>
        <button className={reducedMotion ? 'on' : ''} onClick={() => st.setUi({ reducedMotion: !reducedMotion })} title="Menos movimiento y sin destellos">
          Menos movimiento
        </button>
        <button className={darkStage ? 'on' : ''} onClick={() => st.setUi({ darkStage: !darkStage })} title="Escenario oscuro">
          ☾
        </button>
        <select value={quality} onChange={(e) => st.setUi({ quality: +e.target.value })} title="Calidad visual">
          <option value={1}>Alta</option>
          <option value={0.75}>Media</option>
          <option value={0.5}>Ligera</option>
        </select>
      </div>

      <div className="group">
        <button onClick={exportProject} title="Descargar el proyecto">
          Exportar
        </button>
        <button onClick={() => fileRef.current?.click()} title="Abrir un proyecto">
          Abrir
        </button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importProject(e.target.files[0])} />
      </div>
      <button className="ensayo-btn" onClick={() => st.setUi({ mode: 'ensayo', darkStage: true })} title="Modo ensayo (E)">
        Ensayo ▸
      </button>
    </header>
  );
}
