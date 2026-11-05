# Plan de continuación — MVP 1, MVP 2, MVP 3 y rediseño visual

**Fecha:** 2026-11-05 · **Estado del código:** `main` = rama `claude/practical-clarke-ya4vg6`.
Documento de traspaso para retomar el trabajo en otra sesión sin perder contexto. Leer primero: `AGENTS.md`, este documento y los documentos de estado enlazados.

## 1. Dónde estamos

| Bloque | Estado | Documento |
|---|---|---|
| MVP 1 Gate 1 (economía, construcción, ejército, combate automático, worker) | ✅ | `docs/IMPLEMENTATION-STATUS.md` |
| MVP 1 Gates 2, 3, 4 | ⏳ no iniciados | este documento §3 |
| MVP 2 Gate 0 técnico + Gate 1 `TRAINING` | ✅ (falta playtest humano) | `docs/mvp2/DESGLOSE-MVP2.md` |
| MVP 2 Gates 2–4 (`WORLD_PVP`) | ⏳ | este documento §4 |
| MVP 3 «Dominio de los Mares» | Gate 0 auditado, **no superado** (decisión: opción A) | `docs/mvp3/GATE0-AUDIT.md`, este documento §5 |
| Rediseño visual | F0 ✅, F1.1 ✅ (aprobado por el propietario), F1.2/F1.3/F1.4/F2 🟡 | `docs/visual-redesign/VISUAL_ROADMAP.md` |

**Decisiones del propietario registradas (2026-11-05):** los modelos de referencia de F1.1 están aprobados; se sigue la opción A del MVP 3 (primero completar MVP 1 y MVP 2, luego MVP 3); todo se publica en `main`.

### Arranque del entorno local

API (:3000), worker, battle-server (:2567) y web (:5173) con `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:battle`, `pnpm dev:web` (ver `README.md`). Pipeline de assets: entorno de Blender en `~/.venvs/blender` (ver `docs/visual-redesign/ASSET_PIPELINE.md`). Comprobaciones obligatorias antes de cada commit: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm assets:validate`.

## 2. Orden de trabajo y dependencias

```text
MVP1 Gate 2 ─▶ MVP1 Gate 3 ─▶ MVP1 Gate 4 ─┐
       │              └──────▶ MVP2 Gate 2 ─▶ MVP2 Gate 3 ─▶ MVP2 Gate 4 ─┐
       └─▶ (grafo naval de ADR-0010, base del MVP 3)                       ├─▶ MVP3 Gates 1–4
Rediseño F1.x ─▶ F2.x ─▶ F3.x (en paralelo, sin tocar reglas ni persistencia) ┘
```

El MVP 1 Gate 3 (alianzas/PNA) no lo pidió explícitamente, pero el MVP 2 Gate 2 y todo el MVP 3 dependen de él: se incluye en el orden.

## 3. MVP 1 — Gates pendientes (fuente: `BACKLOG_MVP1.md`, `PRD_MVP1.md`)

### Gate 2 — Mapa, naval, NPC, oasis, curación

| Historia | Alcance | Criterio de aceptación |
|---|---|---|
| G2 mapa 3D por regiones | Representación regional del mapa del mundo con carga por zona (reutiliza terreno/vegetación/agua del rediseño) | Solo se cargan las regiones visibles; benchmark de mapa registrado |
| G2 grafo naval (ADR-0010) | Grafo de rutas tierra/mar/puertos versionado por mundo; A*/Dijkstra en `game-rules`; transporte con `naval_transport`, embarque/desembarque en `army_movements` | Tests: conectividad, anti-teletransporte, capacidad, ETA autoritativo; sin cruzar tierra |
| G2 NPC y oasis | Aldeas NPC (`village_kind = NPC`) con máquina de estados determinista; oasis con bonificación | Reglas puras con semilla; tests de comportamiento; nada de IA generativa |
| G2 curación en hospital | `wounded_stacks` → curación por nivel de hospital y sacerdotes | Test de conservación (heridos + curados = entrada) e idempotencia |
| G2 repetición 3D del combate | Visor del informe con la escena del rediseño | Reproduce el resultado guardado sin recalcular daño en el cliente |

### Gate 3 — Diplomacia y competición

Alianzas con roles, PNA (validación ya prevista en `sendMovement`, código `PACT_RESTRICTS_ATTACK`), confederaciones, guerras, rankings (individual, alianza, interno), premios semanales idempotentes. Criterios: firmas dobles, PNA activo/inactivo, misma alianza/mundo, snapshot estable de ranking, una entrega semanal, protección contra duplicación (`AGENTS.md`, condiciones de salida).

### Gate 4 — Maravillas y cierre de temporada

Maravillas niveles 1–100 con etapas visuales modulares (Art Bible §3), condición de victoria y único ganador ante carrera, cierre de temporada, panel admin, pruebas de carga, backups/restauración, Compose de alfa (ADR-0016). Criterios: test de carrera por el nivel 100, cierre idempotente, restauración probada.

## 4. MVP 2 — Terminar (fuente: `Reinos_de_la_Frontera_MVP2/BACKLOG_MVP2.md`)

| Gate | Alcance | Depende de |
|---|---|---|
| Gate 1 (cierre) | Playtest humano documentado; arte final de unidades (rediseño F3: lancero aprobado como referencia → milicia, arquero, caballería, sacerdote) | Rediseño F3 |
| Gate 2 `WORLD_PVP` | Migraciones `battle_encounters`; snapshot de llegada; elegibilidad (PNA); oferta de 20 s con consentimiento bilateral; reservas transaccionales de tropas; tickets con `jti` en PostgreSQL; sala desde snapshot; commit canónico único; reconciliación y *fallback* AUTO en el worker; flag por mundo | MVP 1 Gate 3 |
| Gate 3 | Escenarios paso montañoso y fortificado; espectadores; repeticiones compartibles; integración con rankings/alianzas | MVP 1 Gate 3 |
| Gate 4 | Carga de varias salas, WSS/TLS de producción, observabilidad, seguridad | — |

Pruebas obligatorias por gate en `PLAN_QA_MVP2.md` (INT-001…018, NET-001…014).

## 5. MVP 3 — «Dominio de los Mares» (opción A)

Requisito previo: MVP 1 Gates 2–4 y MVP 2 Gate 2. Antes de empezar, crear en el repositorio el PRD, el GDD naval y las ADR-0038…0055 (hoy no existen); la ADR que habilite el RTS naval debe **sustituir** explícitamente a ADR-0033.

| Gate | Alcance | Reutiliza |
|---|---|---|
| 0 (rehacer) | Repetir la auditoría con MVP 1/2 completos; benchmark de mar abierto | `docs/mvp3/GATE0-AUDIT.md`, barcos y agua ya hechos |
| 1 Mundo marítimo | Grafo navegable (extiende el de MVP 1 G2), flotas, 4 clases de barco (mercante, transporte, galera, asedio), convoyes con máquina de estados explícita, manifiestos, puertos/astilleros (edificios existentes), bloqueos con expiración y reconciliación, piratas NPC por reglas, combate naval automático determinista | `game-rules`, worker de eventos, combate M1 |
| 2 Entrenamiento naval | `NavalBattleRoom` en el **mismo** battle-server, 2.5D, órdenes MOVE_TO/ATTACK_TARGET/HOLD/FORMATION/FOCUS_FIRE/RETREAT/BOARD, reconexión, doctrina | `packages/tactical-sim` (patrón), Colyseus del MVP 2 |
| 3 Integración persistente | Invitaciones, consentimiento, reservas, tickets, commit único, *fallback*, desembarcos, suministros a Maravillas | MVP 2 Gate 2 |
| 4 Competición | Diplomacia naval (PNA/confederaciones), rankings y medallas navales, informes, repeticiones, flags por mundo, QA integral | MVP 1 Gate 3/4 |

Criterios de aceptación finales: los 25 del encargo del MVP 3 (copiados en `docs/mvp3/GATE0-AUDIT.md` §2 como referencia de dependencias).

## 6. Rediseño visual — siguiente paso inmediato

Detalle y criterios en `docs/visual-redesign/VISUAL_ROADMAP.md`. Prioridad: F1.3 (sustituir la IBL del HDRI por el cielo procedural de PlayCanvas para quitar el tinte azul-violeta), F1.4 (componentes React e iconos SVG), F1.5 (cámaras e indicadores), F1.6 (regresión visual, fugas, Draco/KTX2 para bajar 7,9 MB de descarga y 95 MB de VRAM), luego F2.1/F2.2 y F3 (resto de unidades con el esqueleto del lancero).

## 7. Reglas que no cambian

PostgreSQL es la fuente de verdad; `world_id` en todo; idempotencia; reglas puras y deterministas; sin Redis/Kafka/K8s; IA generativa solo en desarrollo; `TRAINING` nunca escribe en el mundo; ningún asset `APPROVED` sin aprobación humana registrada en el manifiesto; ninguna fase se cierra solo porque compila.
