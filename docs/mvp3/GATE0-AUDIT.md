# MVP 3 «Dominio de los Mares» — Gate 0: auditoría de compatibilidad

**Fecha:** 2026-11-05 · **Commit auditado:** `22233d9` · **Resultado: Gate 0 NO superado** — hay incompatibilidades críticas con el estado real del MVP 1. Según la regla del propio encargo («no pasar al siguiente gate si existen incompatibilidades críticas»), no se inicia el Gate 1 hasta resolverlas o hasta una decisión explícita de alcance.

## 1. Documentación del MVP 3

| Documento esperado | En el repositorio |
|---|---|
| PRD MVP 3, GDD naval | ❌ no existen |
| ADR-0038 … ADR-0055 | ❌ no existen (numeración reservada; no se crean ADR vacías) |
| ADR aplicables existentes | ADR-0010 (navegación naval asíncrona por grafo, MVP 1, **sin implementar**), ADR-0033 (táctico 2.5D solo terrestre, RTS naval aplazado: el MVP 3 la **sustituiría** con una ADR nueva) |

## 2. Sistemas del MVP 1/2 que el MVP 3 presupone

Verificado contra `packages/db/src/schema.ts` (18 tablas) y `packages/core`:

| Sistema requerido por el MVP 3 | Estado real | Severidad |
|---|---|---|
| Mundos, ciudades, economía, construcción, reclutamiento, combate automático, worker, idempotencia | ✅ implementado (M1 Gate 1) | — |
| Batallas tácticas terrestres, Colyseus, tickets, reconexión, replay | ✅ solo `TRAINING` (M2 Gate 1); `WORLD_PVP` no existe | alta (Gate 3 naval reutiliza el flujo de consentimiento/commit del M2 Gate 2) |
| Grafo de navegación marítima (ADR-0010), transporte naval, embarque/desembarque | ❌ no existe (`naval_transport` y el puerto existen solo como datos de catálogo y edificio) | **crítica** |
| Alianzas, roles, PNA, confederaciones, guerras | ❌ no existen (punto de validación previsto en `sendMovement`) | **crítica** (diplomacia marítima, permisos de convoyes) |
| Rankings (individual, alianza, interno) y premios semanales | ❌ no existen | **crítica** (rankings y medallas navales) |
| Maravillas nivel 100 y cierre de temporada | ❌ no existen (solo el estado de mundo `WONDER_ERA`) | **crítica** (suministro marítimo de Maravillas) |
| Aldeas NPC con IA, oasis | ❌ solo el enum `village_kind = NPC` | alta (piratas extienden el sistema NPC) |
| Hospitales/curación | 🟡 `wounded_stacks` sin curación | media |
| Tecnologías colectivas | ❌ no existen | media |

**Conclusión:** 14 de los 25 criterios de aceptación del MVP 3 dependen de sistemas que no existen. Implementarlos "por debajo" del MVP 3 sería rehacer los Gates 2–4 del MVP 1 dentro de otra iniciativa, lo que el propio encargo prohíbe («no asumir que una feature está implementada solo porque existe un PRD»).

## 3. Rediseño visual en curso

- Un único *worktree* y una rama (`claude/practical-clarke-ya4vg6`); no hay trabajo de otros agentes que pueda sobrescribirse.
- Reutilizable para el MVP 3: Art Bible, pipeline de assets (Blender `bpy` → glTF Transform → validación → manifiesto), runtime de assets con materiales compartidos y LOD, IBL y perfiles gráficos, agua animada, telemetría y benchmark.
- El primer barco GLB y la escena de mar abierto que pide el Gate 0 del MVP 3 coinciden con la fase F1.1 (barco representativo) y F5 del rediseño: se producirán una sola vez en el pipeline común.

## 4. Lo que sí puede avanzar sin violar el Gate 0

Trabajo desacoplado, sin persistencia de mundo y sin depender de los sistemas ausentes:

1. **Barco GLB representativo** (casco, cubierta, mástiles, velas, timón, aparejos, banderas, LOD) y **escena de mar abierto** — en curso como parte de F1.1 del rediseño.
2. Benchmark de la escena naval con la telemetría existente.
3. Diseño de contratos y reglas puras (grafo naval, máquina de estados de convoy, motor naval automático determinista) como paquete aislado, **sin migraciones ni endpoints de mundo**, solo si se decide la opción B de §5.

## 5. Decisión necesaria (del propietario del producto)

| Opción | Qué implica |
|---|---|
| **A (recomendada)** | Completar primero los Gates 2–4 del MVP 1 (grafo naval de ADR-0010, NPC/oasis, alianzas/PNA/confederaciones, rankings y premios, Maravillas y cierre) y el Gate 2 del MVP 2 (`WORLD_PVP`); después el MVP 3 Gates 1–4 sobre esa base. |
| B | Empezar ya los núcleos puros del MVP 3 (grafo, convoyes, combate naval automático, `NavalBattleRoom` en `TRAINING`) aislados, aceptando que su integración con diplomacia, rankings y Maravillas queda bloqueada hasta que existan. |

Hasta recibir esa decisión, el trabajo continúa en el rediseño visual (que el MVP 3 exige reutilizar) y en los assets navales compartidos.

**Decisión del propietario (2026-11-05): opción A.** Plan de ejecución en [`docs/CONTINUATION_PLAN.md`](../CONTINUATION_PLAN.md).
