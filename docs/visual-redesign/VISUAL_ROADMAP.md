# Hoja de ruta del rediseño visual

**Actualizada:** 2026-11-05 · **Rama:** `claude/practical-clarke-ya4vg6`
**Regla de avance:** una fase se cierra solo con sus criterios de aceptación cumplidos y evidencia (capturas reales del juego, pruebas, métricas). Compilar no cierra nada. Las fases visuales con "aprobación humana" quedan en 🟡 hasta que una persona apruebe las capturas de referencia. **No se avanza masivamente** a la fase siguiente si el *vertical slice* anterior no alcanza la calidad exigida.

Estados: ✅ cerrada con evidencia · 🟡 en curso / falta aprobación · ⏳ no iniciada · ⛔ bloqueada por un sistema inexistente.

Sistemas que este rediseño **no modifica**: economía, persistencia, combate (automático y táctico), red, mundos, alianzas, rankings y Maravillas. Solo cambia la presentación y la UI conectada a funciones reales.

## Grafo de dependencias

```text
F0 ─▶ F1 ─┬─▶ F1.1 ─┐
          ├─▶ F1.2 ─┤ (F1.1 necesita el pipeline mínimo de F1.2)
          ├─▶ F1.3 ─┼─▶ F2 ─▶ F2.1 ─▶ F2.2 ─┐
          ├─▶ F1.4 ─┤          ▲            ├─▶ F3 ─▶ F3.1 ─▶ F3.2 ─▶ F3.3 ─┐
          ├─▶ F1.5 ─┤          └ F1.4, F1.5 │                               ├─▶ F4 ─▶ F5 ─▶ F6 ─▶ F7
          └─▶ F1.6 ─┘                       └───────────────────────────────┘
F5 (agua/puertos/naval) comparte assets con el Gate 0 del MVP 3 (barco + mar abierto): ver docs/mvp3/GATE0-AUDIT.md
```

## Fases

### F0 — Auditoría y línea base · ✅

- Entregado en `3956692`: [`VISUAL_AUDIT.md`](VISUAL_AUDIT.md), [`PERFORMANCE_BASELINE.md`](PERFORMANCE_BASELINE.md), telemetría `window.__reinosPerf`, benchmark reproducible, capturas "antes", corrección de la UI en blanco al salir de la arena.

### F1 — Art Bible, Design System y pipeline · 🟡

| Entregable | Estado |
|---|---|
| [`docs/art/ART_BIBLE.md`](../art/ART_BIBLE.md) | ✅ |
| Pipeline de assets (detalle en F1.2 y [`ASSET_PIPELINE.md`](ASSET_PIPELINE.md)) | ✅ núcleo |
| `UI_DESIGN_SYSTEM.md` + tokens | ⏳ → F1.4 |

**Aceptación:** biblia de arte vigente; pipeline reproducible con un comando; tokens de diseño aplicados en al menos una pantalla.

### F1.1 — Validación artística · ✅ (aprobada por el propietario el 2026-11-05)

Referencias representativas, validadas en el motor:

| Asset | Estado | Evidencia |
|---|---|---|
| Castillo (`city_hall.*.s3`, 19,9 k tris, 17,7 × 19,8 × 17,7 m) | 🟡 candidato | [Cycles](../art/references/cycles-city_hall.corona.s3_iso.jpg) · [motor, alineación de escala](../art/references/engine-ref-lineup.jpg) · [ciudad](../art/references/engine-city-corona-coastal-overview.jpg) |
| Muralla (tramo, torre, puerta, empalizada) | 🟡 candidato | [motor](../art/references/engine-ref-lineup.jpg) · [ciudad](../art/references/engine-city-corona-coastal-overview.jpg) |
| Soldado: lancero con esqueleto de 17 huesos y 6 clips (`idle, walk, run, attack_melee, hit, death`), 1,9 k tris | 🟡 candidato | [poses Cycles](../art/references/cycles-unit_spearman.corona_poses.jpg) · [marcha animada en motor](../art/references/engine-ref-spearmen.jpg) |
| Barcos: coca mercante (5,1 k tris) y galera de guerra (6,8 k tris), velas por civilización | 🟡 candidato | [motor sobre el mar](../art/references/engine-ref-ships.jpg) · [Cycles](../art/references/cycles-ship_galley.liga.s1_iso.jpg) |

Defectos conocidos de los candidatos (a corregir antes de pedir aprobación definitiva): el metal oscuro toma un tono azul-violeta del HDRI (pasar la IBL al cielo procedural de PlayCanvas, F1.3); caras en sombra de la caliza con tinte lavanda (misma causa); pinos demasiado oscuros; la roca de la cantera sin variación; soldado con miembros rígidos (pesos rígidos por pieza).

**Aceptación:**
1. Los cuatro assets existen como GLB del pipeline, pasan la validación automática y tienen capturas reales en el motor (vista de juego y cercana) en `docs/art/references/`.
2. Proporciones verificadas contra la Art Bible §2–§4 (medidas del inspector, no a ojo).
3. Ninguno se lee como primitiva de *blockout*: biseles, piezas, materiales PBR texturizados, siluetas reconocibles.
4. Aprobación humana registrada (`validation.humanApproval = PASS` en el manifiesto). Sin ella, F1.1 no se cierra.

### F1.2 — Pipeline profesional de assets · 🟡

| Paso | Herramienta | Estado |
|---|---|---|
| Especificación por asset (id, civ, etapa, dimensiones, materiales, presupuesto, licencia) | `tools/asset-gen` + informe JSON + manifiesto | ✅ |
| Generación | Blender 5.2.3 LTS como módulo (`bpy`), *scripts* propios | ✅ |
| Normalización (escala aplicada, pivote en base, recentrado, normales) | `export.py` | ✅ |
| PBR (biblioteca compartida, texturas procedurales repetibles) | `materials.py`, `textures.py` | ✅ |
| LOD (LOD0/1/2 con piezas de detalle excluidas + decimado) | `export.py` | ✅ |
| Optimización (weld, cuantización KHR_mesh_quantization) | glTF Transform 4.5.1 | ✅ · Draco ⏳ (decodificador de navegador) |
| Validación técnica (geometría flotante, base, atributos, materiales vs biblioteca, presupuestos, LOD decreciente) | `export.py` + `packages/asset-pipeline` | ✅ |
| Validación visual automática (captura en motor por asset) | Playwright + visor | ⏳ |
| Rig y animaciones compartidas | Blender (`bpy`) | ⏳ → F3.1 |
| Colisiones simplificadas | — | ⏳ (hoy el *picking* es por malla) |
| Licencias y procedencia | manifiesto + `.claude/skills/PROVENANCE.md` | ✅ |

Evaluación de herramientas (verificada en este entorno):

| Herramienta | Resultado |
|---|---|
| Blender MCP | No aplicable sin interfaz gráfica; se usa `bpy` directamente (mismo motor, reproducible) |
| PlayCanvas Skills | ✅ instaladas tras revisión (16 skills, MIT) en `.claude/skills/` |
| glTF Transform | ✅ `@gltf-transform/{core,functions,extensions,cli}` 4.5.1 (dev) |
| Hunyuan3D local | ❌ sin GPU y Hugging Face bloqueado por el proxy |
| Meshy / Tripo | No usados: servicios de pago sin autorización |

**Aceptación:** un comando regenera y publica todos los assets; 0 avisos de validación; cada asset con procedencia; animaciones y colisiones cubiertas para unidades y barcos; captura automática en motor por asset.

### F1.3 — Iluminación y escenarios · 🟡

Hecho: IBL con HDRI CC0, ACES, niebla de horizonte, perfiles Bajo/Medio/Alto (resolución, sombras, LOD, `CameraFrame` con SSAO/bloom/gradación en Alto), terreno con relieve y variación macro, playa y mar con normales animadas, vegetación instanciada.
Pendiente: selector de perfil en la UI, espuma de orilla, ajuste de color de sombras, medición por perfil en GPU real.

**Aceptación:** los tres perfiles cambian métricas medibles (resolución, llamadas de dibujo de sombras, VRAM); capturas comparativas por perfil; ningún efecto activado por defecto sin medición.

### F1.4 — Design System y animaciones de UI · ⏳

Tokens centralizados (color, tipografía Cinzel/Inter autoalojadas, espaciado, radios, sombras, elevación, estados, transiciones), componentes React reutilizables (Panel, Button, Tabs, Tooltip, Badge, Meter, Toast, Modal), iconos SVG propios en lugar de emojis, animaciones de apertura/cierre/hover/selección/carga/confirmación con `prefers-reduced-motion`. Solo CSS y lo existente.

**Aceptación:** `UI_DESIGN_SYSTEM.md`; tokens usados por todas las pantallas existentes; foco visible en todo control; contraste AA verificado; animaciones desactivadas con `prefers-reduced-motion` (prueba Playwright con `reducedMotion: 'reduce'`); e2e existentes en verde.

### F1.5 — Cámaras y controles · ⏳

Cámara isométrica con zoom suave, rotación limitada, seguimiento opcional y encuadre de edificio/formación; selección de edificios con contorno discreto; indicadores tácticos pequeños (anillo bajo formación, estandarte, flecha de destino/ataque/retirada). Se conservan *picking*, *raycasting* y órdenes actuales.

**Aceptación:** e2e de selección de parcela y de órdenes tácticas sin cambios de comportamiento; capturas antes/después; ningún indicador opaco mayor que la formación.

### F1.6 — Performance y QA visual · 🟡

Hecho: telemetría instrumentada y benchmark reproducible. Pendiente: regresión visual por píxeles con escenas deterministas (semilla, cámara, tiempo congelado), criterios numéricos por escena, detección de fugas (entidades, texturas y *listeners* tras montar/desmontar escenas N veces).

**Aceptación:** `QA_VISUAL_REPORT.md` con umbrales; prueba de fugas que monta/desmonta la ciudad 10 veces sin crecimiento de VRAM ni entidades; benchmark antes/después en `PERFORMANCE_RESULTS.md`.

### F2 — *Vertical slice* de ciudad · 🟡

Hecho: 12 tipos × 2 civilizaciones × 3 etapas en GLB (72), muralla modular, terreno, mar, vegetación, barcos fondeados y amarrado junto al puerto, iluminación; llamadas de dibujo de la ciudad desarrollada 1.354 → ~320 (SwiftShader, 1600×900); VRAM de texturas 87,5 MB (a vigilar en F1.6).
Pendiente: habitantes humanoides (reutilizando el esqueleto del lancero), andamio y parcela vacía con assets del pipeline, aprobación humana.

**Aceptación:** ciudad pequeña y desarrollada de ambas civilizaciones sin primitivas visibles; capturas antes/después a 1366/1920/2560; benchmark con llamadas ≤ 250 (perfil Medio) y VRAM registrada; e2e M1 en verde.

### F2.1 — UX interactiva de ciudad · ⏳ (depende de F2, F1.4, F1.5)

Resaltado de parcela, previsualización translúcida del edificio a construir, indicadores válido/inválido, progreso visual de obra (andamio por etapas), panel de costes/tiempo como contexto, transición suave al cambiar de etapa. Las reglas del servidor no cambian.

**Aceptación:** flujo construir/mejorar/ver progreso probado en e2e; la previsualización usa el GLB real de la etapa siguiente; ninguna acción espera a una animación.

### F2.2 — Validación visual y funcional de ciudad · ⏳

Recorrido completo de usuario nuevo en ambas civilizaciones y mundos; regresión visual de ciudad; métricas finales.

**Aceptación:** informe con capturas, métricas y lista de defectos cerrados o registrados.

### F3 — *Vertical slice* de batalla terrestre · ⏳ (depende de F1.1 soldado, F1.5)

Milicia, lancero, arquero, caballería y sacerdote como humanoides con rig compartido; terreno y vegetación de arena desde el pipeline; indicadores discretos.

**Aceptación:** batalla de 24 formaciones sin primitivas; e2e `e2e:tactical` en verde; métricas de arena antes/después.

### F3.1 — Rigging, animaciones y efectos militares · ⏳

Clips compartidos `idle/walk/run/attack_melee/attack_ranged/hit/death/retreat/cheer/pray`, caballo `idle/walk/gallop`; proyectiles, polvo e impactos ligados a eventos confirmados por el servidor.

**Aceptación:** cada clip visible en captura/vídeo; efectos solo con eventos del servidor (prueba: sin eventos no hay impactos).

### F3.2 — Interfaz y controles de combate · ⏳

HUD de batalla con el Design System: lista de formaciones plegable/filtrable, órdenes contextuales, estado/moral compactos, minimapa, latencia, alertas.

**Aceptación:** 1366×768 sin solapes; teclado y ratón; e2e de órdenes.

### F3.3 — Optimización de ejércitos numerosos · ⏳

LOD de soldados, animación por instancias/ *skinning* compartido, frecuencia reducida a distancia, *culling*.

**Aceptación:** escenarios de 100 y 500 soldados visibles medidos; objetivo 60 FPS (Medio) en el equipo de referencia con GPU, registrado como medido o pendiente.

### F4 — Mapa mundial y biomas · ⏳ · F5 — Agua, puertos y guerra naval · ⏳ · F6 — Resto de interfaces · ⏳ · F7 — QA integral, regresión y optimización final · ⏳

F4–F7 se detallan al cerrar F3. F5 depende de sistemas navales que hoy no existen en el juego (ver auditoría del MVP 3); F6 solo rediseña pantallas que existen.

## Registro de avance

| Fecha | Commit | Fases |
|---|---|---|
| 2026-11-05 | `3956692` | F0 ✅ |
| 2026-11-05 | `22233d9` | F1 núcleo, F1.2 núcleo, F1.3 parcial, F2 parcial |
| 2026-11-05 | (este commit) | F1.1: barcos y lancero con esqueleto y clips, visor de assets de desarrollo, capturas en motor; F1.3: cielo sin foto, luz recalibrada |

| 2026-11-05 | (este commit) | F1.1 ✅: aprobación humana registrada en el manifiesto (castillo, muralla, lancero → `APPROVED`; barcos con aprobación visual, `PENDING_REVIEW` hasta tener clips `idle`/`sail`) |
