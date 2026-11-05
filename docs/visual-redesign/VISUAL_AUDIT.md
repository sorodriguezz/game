# Auditoría visual — Fase 0

**Fecha:** 2026-11-05 · **Commit auditado:** `7538e75` (MVP 1 iteración 1 + MVP 2 Gate 1 `TRAINING`)
**Método:** lectura del código real, ejecución del juego (build de producción con `vite preview`) y benchmark instrumentado
[`apps/web/e2e/visual-benchmark.e2e.mjs`](../../apps/web/e2e/visual-benchmark.e2e.mjs). Capturas en [`screenshots/before/`](screenshots/before/); métricas en [`PERFORMANCE_BASELINE.md`](PERFORMANCE_BASELINE.md).

## 1. Documentación leída y alcance real

- `README.md`, `AGENTS.md`, `PRD_MVP1.md`, `ADRs_MVP1_COMPLETOS.md`, `BACKLOG_MVP1.md`, `Reinos_de_la_Frontera_MVP2/` (PRD, GDD táctico, ADR-0021…0037) y `docs/mvp2/DESGLOSE-MVP2.md`.
- **No existe documentación de un MVP 3** en el repositorio. Se registra como ausencia; no se inventa su alcance.
- Funcionalidad que existe hoy (y por tanto lo único que puede rediseñarse sin inventar pantallas): autenticación, selección de mundos, ciudad 3D con construcción/mejora, economía, reclutamiento, campaña sobre mapa 2D, informes de combate, entrenamiento táctico (lobby, arena 3D, resultado). Ver §8 para las pantallas del encargo que **no** existen.

## 2. Arquitectura gráfica actual

| Aspecto | Estado | Archivo |
|---|---|---|
| Motor | PlayCanvas 2.23.3 vía `@playcanvas/react` 0.11.7 (React 19, Vite 8) | `apps/web/package.json` |
| Inicialización | Un `<Application>` por escena (`FILLMODE_NONE`, `RESOLUTION_AUTO`, `antialias`); dos escenas: ciudad y arena. El mapa del mundo es un `<canvas>` 2D | `scene/CityScene.tsx`, `battle/ArenaScene.tsx`, `ui/panels.tsx` |
| Cámara de ciudad | Script `CameraControls` (órbita, *pitch* −85…−14°, zoom 30–200 m, paneo) | `CityScene.tsx` |
| Cámara de batalla | Cámara RTS propia: WASD/flechas, Q/E, rueda; inclinación fija 55° | `ArenaScene.tsx` (`RtsCamera`) |
| Iluminación | Sol direccional con sombra PCF3 2048² a 170–220 m + **luz de relleno direccional**; ambiente de color plano; niebla lineal; exposición 1,1; **sin IBL, sin *tone mapping* configurado, sin postproceso** (`CameraFrame` no se usa) | ambos |
| Materiales | ~40 `StandardMaterial` de **color plano** (sin texturas, sin normales); agua = plano translúcido | `scene/kit.tsx` |
| Geometría | Todo es **primitiva** (`box`, `cylinder`, `cone`, `sphere`, `capsule`) compuesta en JSX: 91 primitivas en `buildings.tsx`, 22 en `CityScene.tsx`, 33 en `kit.tsx` | `scene/*` |
| Carga de recursos | **Ningún GLB.** `public/assets/manifest.json` lista 13 assets en `BLOCKOUT` con `file: null`; el cliente no lee el manifiesto | `public/assets/manifest.json` |
| Personajes | Ciudad: aldeanos = cápsula + esfera. Batalla: soldados por *instancing* de primitivas (cuerpo cápsula, cabeza esfera, casco cono, arma caja) | `CityScene.tsx`, `battle/instancing.ts` |
| Picking | `onClick` de entidades `@playcanvas/react` (ciudad) y rayo cámara→suelo (arena) | ambos |
| HUD | `styles.css` (636 líneas, 12 variables CSS), componentes en `ui/panels.tsx` (890 líneas); sin librería de UI | `ui/*`, `styles.css` |
| Pruebas | Vitest (100 tests, sin UI), e2e Playwright como *scripts* (`e2e`, `e2e:tactical`), **sin regresión visual** por comparación de píxeles | `apps/web/e2e/` |
| Pipeline de assets | Contrato de manifiesto (zod) + inspector GLB (`@gltf-transform/core`) con presupuestos | `packages/asset-pipeline` |

## 3. Recursos: reutilizables y a reemplazar

**Reutilizables tal cual**
- Estructura React/PlayCanvas, cámaras (ajustables), picking, *instancing* de soldados (`InstancedPart`), lógica de interpolación de la arena, datos del servidor que alimentan las escenas.
- Contrato de manifiesto e inspector GLB de `packages/asset-pipeline` (se amplían, no se sustituyen).
- Variables CSS existentes (se convierten en tokens del sistema de diseño), estructura de pestañas del HUD.

**A reemplazar (no son arte final)**
- Los 13 edificios, la muralla, las torres, el barco, los aldeanos, árboles, rocas, colinas (esferas escaladas), terreno plano de un color, agua plana y todas las piezas de soldado.
- Iconos con emoji (`⚔`, `🛡`, `👥`, `⏱`; 9 usos) → iconos SVG propios.
- Discos y marcas de selección de formación (ya atenuados en `7538e75`, siguen siendo provisionales).

**Dependencias que ya cumplen**: PlayCanvas (PBR, *instancing*, sombras, `CameraFrame`, animación, carga GLB), `@gltf-transform/core`, Playwright 1.63, Vite. **Añadidas en esta fase solo como herramientas de desarrollo**: Blender 5.2.3 LTS como módulo de Python (`bpy`, PyPI) para modelado por *script*, y `@gltf-transform/cli`/`functions` para optimización. Fuentes OFL y HDRI CC0 vía npm (`@fontsource/*`, `@pmndrs/assets`).

**No disponibles en este entorno** (verificado): GPU (solo SwiftShader), Hunyuan3D (Hugging Face bloqueado por el proxy), Poly Haven / Quaternius / blender.org (bloqueados), Meshy/Tripo (servicios de pago: requieren autorización expresa; no se usan). Blender MCP necesita una instancia de Blender con interfaz y su complemento: no aplicable en un contenedor sin pantalla; se usa `bpy` directamente.

## 4. Problemas de jerarquía visual, navegación y accesibilidad

1. **El panel lateral ocupa el 21 % del ancho a 1920 px y el 30 % a 1366 px** de forma permanente, sin plegarse ([1366](screenshots/before/09-city-1366.jpg)). El escenario 3D queda en segundo plano.
2. La lista de formaciones de la batalla (12 elementos) no se pliega, agrupa ni filtra; tapa el lateral derecho completo.
3. Fuentes no cargadas: `Inter` se declara pero no se sirve (cae a la del sistema); títulos en `Georgia`. Jerarquía tipográfica inconsistente entre pantallas.
4. Estados de foco: solo `button:focus-visible` e `input:focus-visible`; las pestañas y enlaces-botón de listas heredan un foco poco visible sobre fondo oscuro.
5. Emojis como iconos: render dependiente del sistema y sin etiqueta accesible coherente.
6. Contador de FPS de la arena visible al jugador (dato de depuración en la interfaz normal) y aviso "Arte 3D: blockout" permanente.
7. No hay estados de carga ni de error para la escena 3D: un fallo de la escena deja la página en blanco (§6.1).

## 5. Errores visuales de escala, iluminación, sombras y geometría

- **Geometría**: torres = cilindros lisos, tejados = conos/prismas, árboles = esferas apiladas, colinas = esferas semienterradas que asoman como cúpulas, aldeanos y soldados = "palitos" de cápsula ([cercano](screenshots/before/05-city-developed-close-1920.jpg)).
- **Materiales**: colores planos sin variación; el terreno es un único verde y los caminos bandas marrones rectas desde el centro.
- **Iluminación**: ambiente plano + relleno direccional = aspecto de plástico; sin reflejos de entorno, el agua no refleja nada.
- **Sombras**: un mapa 2048² cubriendo 170–220 m produce sombras blandas y escalonadas; sin sombras de contacto.
- **Escala**: puertas y ventanas sin proporción coherente entre edificios (portón del centro urbano de ~3 m frente a ventanas de 1,5 m); soldados de la arena correctos en altura (~2,1 m con casco) pero sin anatomía.
- **Agua**: plano azul translúcido, sin orilla ni movimiento ([arena](screenshots/before/12-arena-balanced-1920.jpg)).

## 6. Rendimiento (resumen; detalle en `PERFORMANCE_BASELINE.md`)

| Escena | Llamadas de dibujo | Triángulos | Instancias de malla |
|---|---|---|---|
| Ciudad recién fundada | **901** | 125.788 | 650 |
| Ciudad desarrollada (12 edificios + muralla + puerto) | **1.354** | 157.048 | 918 |
| Arena 24 formaciones (170 soldados visibles) | 54 | **433.156** | 37 |

- La ciudad emite una llamada de dibujo por primitiva y pasada (color + sombra): coste lineal con el detalle. Objetivo de la biblia: ≤ 250.
- La arena ya agrupa por *instancing*, pero cada soldado cuesta ~2.500 triángulos porque las primitivas por defecto (cápsula, esfera) están muy teseladas.
- **El contador de FPS no es fiable en este contenedor**: con SwiftShader el ritmo de `requestAnimationFrame` se desacopla del render (ventanas con mediana de 16,6 ms y un frame de 25–30 s). Los FPS de esta máquina **no** se presentan como rendimiento real; se comparan llamadas de dibujo, triángulos, instancias, VRAM y CPU por frame, y los FPS reales quedan pendientes de un equipo con GPU (§9).

### 6.1 Defecto encontrado durante la auditoría (corregido)

Salir de la arena ("Salir del campo") lanzaba `Cannot read properties of null (reading 'deleteBuffer')`: `InstancedPart.destroy()` se ejecutaba después de que `<Application>` destruyera el dispositivo gráfico (React desmonta primero el padre) y la excepción dejaba la interfaz en blanco. Corregido en `apps/web/src/battle/instancing.ts`; `e2e:tactical` ahora sale del campo y exige volver al lobby sin errores.

## 7. Riesgos de regresión

| Riesgo | Mitigación |
|---|---|
| El *picking* de parcelas depende de entidades con `onClick`; los GLB cambian la jerarquía | Mantener una entidad contenedora por parcela con el `onClick`; el GLB es hijo |
| Selectores de e2e por texto/rol | No renombrar textos accesibles sin actualizar `e2e`; añadir etiquetas, no quitarlas |
| Memoria de GPU al pasar de colores planos a texturas | *Trim sheets* compartidas por civilización, tamaños presupuestados y liberación explícita al desmontar |
| Tiempos de carga por GLB | Caché por URL con conteo de referencias y carga progresiva; *fallback* al kit mientras carga |
| Determinismo y autoridad | Los cambios son solo de presentación: ninguna escena escribe estado; la simulación táctica y las reglas no se tocan |
| Arte "generado" que no alcance la calidad | Estado `PENDING_REVIEW` hasta revisión humana; capturas en motor para cada asset (§Art Bible) |

## 8. Pantallas del encargo que no existen en el código

Perfil del jugador, ajustes, oasis, aldeas NPC, comercio terrestre y marítimo, alianzas y su administración, PNA, confederaciones, declaraciones de guerra, rankings, premios semanales, Maravillas, batallas navales, repeticiones (visor) y centro de notificaciones (solo existen *toasts*). **No se crean como sustitutos**: dependen de sistemas de backend que el MVP 1 aún no implementa. Se registran como propuestas en [`VISUAL_ROADMAP.md`](VISUAL_ROADMAP.md).

## 9. Limitaciones del entorno de auditoría

- Sin GPU: render por software (SwiftShader). Las métricas de FPS de esta máquina no son representativas; los objetivos de 60/30 FPS se validarán en hardware real con el mismo *script* (`E2E_SWIFTSHADER=0`).
- Sin acceso a bancos de assets externos ni a generación 3D por IA: los assets se producen con *scripts* de Blender reproducibles y texturas procedurales (ver [`ASSET_PIPELINE.md`](ASSET_PIPELINE.md)).
