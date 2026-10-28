import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { transport } from './audio/transport';

/** Re-renders when the transport changes state (play, pause, seek, loop, mix). */
export function useTransport() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.subscribe(force), []);
  return transport;
}

/** Runs a callback on every animation frame while mounted. */
export function useFrame(cb: (now: number) => void) {
  const ref = useRef(cb);
  useLayoutEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    let id = 0;
    const loop = (t: number) => {
      ref.current(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

export function snap(q: number, step: number) {
  return Math.round(q / step) * step;
}
