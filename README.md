# Partituras Vivas

Web app para que directores de coro y orquesta den vida a sus partituras: anotaciones, gestos y efectos visuales (olas, fuego, luz, nubes) que se mueven sobre la hoja sincronizados con la música, y que luego se comparten con los músicos.

Este repositorio contiene la **Prueba 0** del plan: validar que la magia se ve y se siente bien sobre una partitura real antes de construir cuentas, biblioteca y colaboración.

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # compila a dist/
```

Requiere un navegador con WebGL2 (Chrome, Edge, Safari 15+, Firefox).

## Qué incluye

- **Lienzo de partitura**: MusicXML grabado con [Verovio](https://www.verovio.org/) en SVG, con un halo de papel alrededor de cada glifo para que ningún efecto tape las notas.
- **Motor visual WebGL2** con cuatro familias del moodboard: Olas (grabado a lo Hokusai), Fuego, Luz radial y Nubes (con niebla y tormenta eléctrica). Cada efecto tiene 8 parámetros animables.
- **Anclaje musical**: los efectos se guardan en tiempo musical (negras desde el inicio), nunca en píxeles; sobreviven al zoom, al reflujo entre sistemas y a los cambios de tempo.
- **Keyframes y curvas** por parámetro (suave, lineal, acelera, frena, escalón), con subidas y bajadas no monótonas. La fase de cada efecto es la integral de su velocidad, así que cambiar velocidad o dirección no produce saltos y saltar a un instante siempre da el mismo estado.
- **Reloj único** basado en `AudioContext`: cursor, síntesis SATB, metrónomo, bucle A-B y efectos comparten el mismo tiempo.
- **Tinta viva**: el director dibuja sobre la hoja y el trazo se vuelve a dibujar solo, a la velocidad del gesto original, cuando la música llega a ese punto.
- **✦ Dar vida**: seleccionar compases o notas y aplicar un preset, o describir la sensación con palabras ("olas suaves que crecen y se apagan"). La propuesta se muestra antes de aplicarse. Hoy la interpreta un analizador local; en Fase 2 la reemplaza la API de Claude con la misma forma de salida.
- **Modo Ensayo** a pantalla completa con escenario oscuro, para proyectar en el ensayo.
- **Accesibilidad**: lectura limpia (L), menos movimiento y sin destellos, y tres niveles de calidad visual.
- Autosave local, deshacer/rehacer, exportar e importar el proyecto como `.pv.json`.

## Atajos

| Tecla | Acción |
| --- | --- |
| Espacio | Reproducir / pausa |
| V / T | Seleccionar / Tinta |
| Clic | Seleccionar compás (Mayús amplía) · clic en una nota selecciona su duración |
| Doble clic | Mover el cabezal |
| K | Punto clave en el parámetro activo |
| L | Lectura limpia |
| E | Modo ensayo |
| ⌘Z / ⇧⌘Z | Deshacer / rehacer |
| ⌘+ / ⌘− | Zoom |
| Alt + arrastrar la zona de un efecto | Moverlo verticalmente |

## Estructura

```
src/
  audio/transport.ts   reloj, planificador y síntesis
  score/verovio.ts     carga y grabado de MusicXML, mapa de tiempo
  score/geometry.ts    tiempo musical ↔ posición en la hoja
  fx/shaders.ts        shaders GLSL de cada familia
  fx/renderer.ts       render WebGL2 con alfa premultiplicado
  fx/scene.ts          zonas de cada efecto y parámetros por cuadro
  model/               tipos, presets, curvas, store (zustand), demo
  components/          interfaz React
```

## Repertorio

- *Aus meines Herzens Grunde*, J. S. Bach, BWV 269 (coral SATB, dominio público; codificación MusicXML del corpus de music21).
- Pendiente: una obra orquestal de dominio público.

## Límites conocidos de la Prueba 0

- Las repeticiones se leen una sola vez, en orden de página; los mapas de ejecución con repeticiones llegan con la alineación de audio (AUD-04, Fase 2).
- La síntesis es un timbre coral sencillo; los SoundFonts llegan en MVP 1.
- Los proyectos se guardan en el navegador; cuentas, biblioteca y compartir por enlace o código llegan en MVP 1.
