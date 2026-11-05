# Resultados de rendimiento — antes / después

**Comparación:** línea base `7538e75` ([`PERFORMANCE_BASELINE.md`](PERFORMANCE_BASELINE.md), [JSON](perf-baseline.json)) frente a `a5b8825` + F1.4 inicial ([JSON](perf-after-f1.json)).
**Método idéntico:** build de producción, `vite preview`, `apps/web/e2e/visual-benchmark.e2e.mjs`, 1920×1080, Chromium con **SwiftShader** (sin GPU).
**Regla:** los FPS de esta máquina no son válidos (ver línea base); se comparan magnitudes deterministas.

## Ciudad

| Escenario | Llamadas de dibujo | Instancias de malla | Triángulos | VRAM (MB) | CPU/frame |
|---|---|---|---|---|---|
| Ciudad recién fundada | 901 → **267** (−70 %) | 650 → **164** | 125.788 → 132.154 | 16,1 → 92,1 | 5,8 → 3,1 ms |
| Ciudad desarrollada costera | 1.354 → **285** (−79 %) | 918 → **168** | 157.048 → 167.132 | 16,1 → 95,3 | 5,1 → 2,5 ms |
| Ciudad con paneles abiertos | 1.044 → **358** | 918 → **178** | 157.048 → 198.312 | 22,0 → 101,2 | 3,9 → 3,6 ms |

Carga de la ciudad (red local): **550 KB → 7,9 MB** transferidos (10 → 105 recursos), por los GLB y la biblioteca de texturas.

## Lectura

- **Mejora real:** con edificios detallados, muralla con torres, terreno con relieve, mar, vegetación y barcos, la ciudad emite **un 70–79 % menos de llamadas de dibujo** que el *blockout* (materiales compartidos por nombre, vegetación y muralla instanciadas). Objetivo de la Art Bible (≤ 250 en perfil Medio): **casi alcanzado** (267–285); los paneles abiertos suben a 358.
- **Coste nuevo — VRAM:** de 16 a ~95 MB por las texturas (512² base/normal, 256² ORM). Dentro de lo razonable para escritorio, pero hay que vigilarlo (F1.6): texturas comprimidas (KTX2/Basis) y liberar materiales no usados.
- **Coste nuevo — descarga:** 7,9 MB en la primera visita a la ciudad. Pendiente: Draco en GLB (requiere servir el decodificador del navegador), grupos de suavizado para reducir vértices duplicados y carga diferida de etapas no visibles.
- **CPU por frame** baja de 5–6 ms a 2,5–3,6 ms (menos entidades que recorrer).

## No medido en esta ejecución

- Arenas tácticas: el *script* falló después de las escenas de ciudad esperando la pestaña de mapa (el hilo principal estaba saturado por el render por software); las arenas no cambian en esta fase. Los tiempos de espera se ampliaron para la próxima ejecución.
- FPS reales y percentiles en GPU: requieren el equipo de referencia (pendiente de definir).
