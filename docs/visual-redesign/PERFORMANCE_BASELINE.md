# Línea base de rendimiento — antes del rediseño

**Fecha:** 2026-11-05 · **Commit:** `7538e75` + instrumentación (sin cambios visuales) · **Datos crudos:** [`perf-baseline.json`](perf-baseline.json)

## Método

- Build de producción (`pnpm --filter @reinos/web build`) servido con `vite preview` (:4173), API/worker/battle-server locales.
- Escenario reproducible: [`apps/web/e2e/visual-benchmark.e2e.mjs`](../../apps/web/e2e/visual-benchmark.e2e.mjs) — cuenta nueva, ciudad recién fundada, ciudad desarrollada fijada en la BD local (12 edificios, muralla 9, puerto 6, aldea costera), paneles abiertos, dos batallas de entrenamiento contra la doctrina.
- Viewport 1920×1080, `deviceScaleFactor` 1. Calentamiento 6 s, medición 8 s por escena.
- Telemetría propia (`apps/web/src/perf/RenderTelemetry.tsx`, expuesta en `window.__reinosPerf`): intervalos reales entre `frameend`, coste de CPU del frame (`frameupdate`→`frameend`), llamadas de dibujo del dispositivo (`app.stats.drawCalls.total`, disponible en *builds* de producción), triángulos e instancias de malla visibles en las capas, VRAM rastreada por el motor.

```bash
pnpm --filter @reinos/web build
```

```bash
cd apps/web && npx vite preview --host 127.0.0.1
```

```bash
cd apps/web && BENCH_LABEL=baseline node e2e/visual-benchmark.e2e.mjs
```

## Entorno

| Elemento | Valor |
|---|---|
| Navegador | HeadlessChrome 153 (Playwright 1.63) |
| GPU | **ANGLE / SwiftShader (render por software, Vulkan 1.3)** — no hay GPU en el contenedor |
| CPU | 4 núcleos, 15 GB RAM |

## Resultados

| Escenario | Llamadas de dibujo | Triángulos | Instancias de malla | CPU/frame (media · p95) | VRAM (texturas + geometría) | Primer frame |
|---|---|---|---|---|---|---|
| `city-small` (ciudad recién fundada) | 901 | 125.788 | 650 | 5,8 · 11,4 ms | 16,1 MB | 201 ms |
| `city-developed` (ciudad desarrollada costera) | 1.354 | 157.048 | 918 | 5,1 · 10,0 ms | 16,1 MB | 187 ms |
| `city-panels-open` (pestaña Informes abierta) | 1.044 | 157.048 | 918 | 3,9 · 6,9 ms | 22,0 MB | — |
| `arena-balanced` (78 soldados visibles) | 52 | 298.832 | 37 | 1,5 · 2,7 ms | 16,4 MB | 451 ms |
| `arena-large` (24 formaciones, 170 soldados visibles) | 54 | 433.156 | 37 | 1,1 · 1,9 ms | 16,4 MB | 296 ms |

Carga (build de producción, red local):

| Página | DOMContentLoaded | Transferido | Recursos | Heap JS |
|---|---|---|---|---|
| Autenticación | 116 ms | 172 KB | 3 | 10 MB |
| Ciudad (tras navegar) | 139 ms | 550 KB | 10 | 10 MB |

### FPS: medidos, pero **no válidos** como rendimiento

| Escenario | FPS medio | Frame p50 | Frame p95 | Frame máx. |
|---|---|---|---|---|
| `city-small` | 1,7 | 588 ms | 1.029 ms | 1.029 ms |
| `city-developed` | 2,5 | 312 ms | 1.330 ms | 1.330 ms |
| `arena-large` | 0,9 | 16,6 ms | 19,4 ms | 30.255 ms |

Con SwiftShader el ritmo de `requestAnimationFrame` se desacopla del render real: la arena muestra frames de 16,6 ms en la mediana y bloqueos de hasta 30 s. **Estas cifras no se usan para decidir nada**; los objetivos de 60 FPS (Medio) y 30 FPS (Bajo) se validarán ejecutando el mismo *script* con `E2E_SWIFTSHADER=0` en un equipo de referencia con GPU, que queda por definir y registrar aquí.

## Lectura

1. **Llamadas de dibujo** de la ciudad: 900–1.350 (objetivo ≤ 250). Causa: una entidad por primitiva, cada una con su llamada en la pasada de color y en la de sombra.
2. **Triángulos de la arena**: ~2.500 por soldado visible, por la teselación por defecto de cápsulas y esferas; con 500 soldados serían ~1,3 M solo en soldados.
3. **VRAM** baja (16 MB, casi todo el mapa de sombras) porque no hay texturas: el rediseño la subirá; se presupuesta en la biblia de arte (§12).
4. La CPU por frame es baja en todas las escenas: el cuello de botella actual es la GPU (llamadas y triángulos), no la lógica.
