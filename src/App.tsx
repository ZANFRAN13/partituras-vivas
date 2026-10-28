import { useEffect } from 'react';
import { useStore } from './model/store';
import { loadScore } from './score/verovio';
import { transport } from './audio/transport';
import { demoProject, SCORES } from './model/demo';
import type { Project } from './model/types';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { ScoreStage } from './components/ScoreStage';
import { Inspector } from './components/Inspector';
import { Timeline } from './components/Timeline';
import { TransportBar } from './components/TransportBar';

const storageKey = (url: string) => `pv:project:${url}`;

function readSaved(url: string): Project | null {
  try {
    const raw = localStorage.getItem(storageKey(url));
    if (!raw) return null;
    const p = JSON.parse(raw) as Project;
    return p.version === 1 ? p : null;
  } catch {
    return null;
  }
}

export default function App() {
  const mode = useStore((s) => s.mode);
  const score = useStore((s) => s.score);

  useEffect(() => {
    const url = SCORES[0].url;
    loadScore(url).then((s) => {
      transport.notes = s.notes;
      transport.totalQ = s.totalQ;
      const project = readSaved(url) ?? demoProject(url);
      transport.bpm = project.bpm;
      useStore.getState().loadProject(project);
      useStore.getState().setScore(s);
    });
  }, []);

  // Autosave: the status only reads "Guardado" once the write has actually happened.
  useEffect(() => {
    let timer = 0;
    return useStore.subscribe((s, prev) => {
      if (s.project === prev.project) return;
      window.clearTimeout(timer);
      useStore.getState().setUi({ saveState: 'guardando' });
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(storageKey(s.project.scoreUrl), JSON.stringify(s.project));
          useStore.getState().setUi({ saveState: 'guardado' });
        } catch {
          useStore.getState().setUi({ saveState: 'error' });
        }
      }, 500);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      const st = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          transport.toggle();
          break;
        case 'l':
        case 'L':
          st.setUi({ clean: !st.clean });
          break;
        case 't':
        case 'T':
          st.setUi({ tool: 'tinta' });
          break;
        case 'v':
        case 'V':
          st.setUi({ tool: 'seleccion' });
          break;
        case 'e':
        case 'E':
          st.setUi(st.mode === 'ensayo' ? { mode: 'estudio', darkStage: false } : { mode: 'ensayo', darkStage: true });
          break;
        case 'k':
        case 'K':
          if (st.selectedFx && st.selectedParam) st.toggleKeyAt(st.selectedFx, st.selectedParam, transport.q);
          break;
        case 'Escape':
          if (st.mode === 'ensayo') st.setUi({ mode: 'estudio', darkStage: false });
          else if (st.selection) st.setSelection(null);
          else st.selectFx(null);
          break;
        case 'Delete':
        case 'Backspace':
          if (st.selectedFx) st.removeEffect(st.selectedFx);
          break;
        case 'Home':
          transport.seek(0);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (mode === 'ensayo') {
    return (
      <div className="app ensayo">
        <ScoreStage />
        <div className="ensayo-bar">
          <span className="ensayo-title">{useStore.getState().project.title}</span>
          <TransportBar compact />
          <button onClick={() => useStore.getState().setUi({ mode: 'estudio', darkStage: false })}>Salir del ensayo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <Sidebar />
        <main className="center">
          <ScoreStage />
        </main>
        <Inspector />
      </div>
      <footer className="bottom">
        <TransportBar />
        {score && <Timeline />}
      </footer>
    </div>
  );
}
