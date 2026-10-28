import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.tsx';
import { transport } from './audio/transport';
import { useStore } from './model/store';

if (import.meta.env.DEV) Object.assign(window, { __pv: { transport, useStore } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
