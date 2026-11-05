# Desglose MVP 2 — ADR y PRD contra el código real

**Fecha:** 2026-11-05 · **Fuentes:** `Reinos_de_la_Frontera_MVP2/` (PRD, GDD, ADR-0021…0037, backlog, plan QA, contratos).
**Regla:** cada fila dice *dónde* está implementada una decisión y *qué test* la demuestra. "Pendiente" significa que no existe código; no se maquilla.

Leyenda de estado: ✅ hecho y probado · 🟡 parcial (se indica qué falta) · ⛔ bloqueado por una dependencia M1 que no existe · ⏳ pendiente (gate posterior).

---

## 1. Diagnóstico de compatibilidad M1 (M2-G0-01)

El paquete MVP 2 presupone un MVP 1 completo. **No lo está**: existe Gate 1 de M1 (vertical slice persistente). Esto condiciona qué partes del MVP 2 pueden empezar.

| El MVP 2 asume… | Realidad en este repositorio | Consecuencia |
|---|---|---|
| Mundos y **temporadas** (`season_id`) | `worlds` con estado; 1 mundo = 1 temporada (ADR-0002), sin tabla de temporadas | Decisión **D-01**: `seasonId = worldId` |
| Tablas `resource_balances`, `unit_stacks`, `battle_results`, `wonder_levels` | Nombres reales: `resource_accounts`, `troop_stacks`, `battles` (resultado en `battles.result`); **no hay Maravillas** | Gate 2 debe mapear a estos nombres; la plantilla SQL del paquete no aplica tal cual |
| Combate AUTO M1 | ✅ `resolveBattle` (game-rules) + worker con `SKIP LOCKED` | El *fallback* AUTO existe y es reutilizable |
| Alianzas, PNA, confederaciones | ⛔ No implementado (Gate 3 M1) | FR2-002/010 y ADR-0032 no pueden validarse; **WORLD_PVP bloqueado** hasta M1 Gate 3 |
| Rankings y premios semanales | ⛔ No implementado (Gate 3 M1) | FR2-010 / INT-016 sin objeto que integrar |
| Maravilla nivel 100 | ⛔ No implementado (Gate 4 M1) | INT-012 sin objeto |
| Naval, NPC, oasis | ⛔ No implementado (Gate 2 M1) | ADR-0033 se cumple trivialmente (el táctico es solo terrestre) |
| Hospital / heridos | 🟡 `wounded_stacks` existe; no hay curación | FR2-008 heridos tras commit: Gate 2/3 |
| Arte final aprobado | ⛔ Gate 0 M1 abierto: solo *blockout* procedural | M2-G0-05/06 no pueden cerrarse con "arte final" (ADR-0030) |
| Worker / outbox / idempotencia | ✅ | Reutilizables para ofertas, expiración y reconciliación |

**Conclusión:** se puede (y se ha hecho) avanzar el **Gate 0 técnico** y el **Gate 1 `TRAINING`** del MVP 2, porque por diseño (ADR-0037) no tocan el mundo. **Gate 2 (`WORLD_PVP`) no debe empezar** hasta que M1 tenga diplomacia (PNA) y el Gate 1 MVP 2 esté aprobado con playtest.

### Mapa de dependencias (código real)

```text
apps/web ──HTTP──▶ apps/api (NestJS) ──▶ packages/core ──▶ packages/db (PostgreSQL)
   │                   │  └─ TrainingService: snapshot + ticket + registro de resultado
   │                   └──HTTP interno (token de servicio)──▶ apps/battle-server (Colyseus 0.18)
   └──WS + ticket────────────────────────────────────────────▶ apps/battle-server
                                                                   │
packages/tactical-sim (puro) ◀── usado por api (snapshot/replay), battle-server (tick) y tests
packages/game-config: ruleset M1 + ruleset táctico versionado · packages/contracts: zod
apps/worker: sin cambios (M1); en Gate 2 gestionará expiración de ofertas y reconciliación
```

---

## 2. Decisiones y aclaraciones adoptadas (M2-G0-03)

Concretan lo que el paquete deja abierto. Cualquier cambio requiere ADR nueva.

| Id | Decisión | Motivo |
|---|---|---|
| D-01 | `seasonId === worldId` para `WORLD_PVP` (validado por el contrato) | 1 mundo = 1 temporada (ADR-0002); el contrato del paquete permite un *mapping* explícito |
| D-02 | `TRAINING` no pertenece a ningún mundo: `worldId = seasonId = null`; tabla propia `training_matches` sin FK a tablas de mundo | GDD §2 y ADR-0037 |
| D-03 | IDs de formación cortos y deterministas (`A0…A11`, `D0…D11`) en lugar de UUID | Determinismo, mensajes pequeños, validación de bando por prefijo |
| D-04 | `jti` consumido en memoria del único proceso de battle-server para `TRAINING` | TTL 60 s < reinicio útil (ADR-0031); **Gate 2 lo consumirá en PostgreSQL** |
| D-05 | Simulación 100 % entera: cm, ticks, tantos por mil; orientación como vector ×1000 | ADR-0025 (cuantización) y hash de estado reproducible |
| D-06 | Resultado de entrenamiento es un **tipo distinto** (`TrainingResult`) que no valida como `BattleCanonicalResult` | INT-013 a nivel de contrato, además de no existir endpoint de commit de mundo |
| D-07 | El registro de replay incluye órdenes **rechazadas** con su motivo (como `battle_inputs` del PRD) y el replay exige el mismo veredicto | Auditoría completa; detecta replays manipulados |
| D-08 | Solo la API crea salas (`POST /internal/rooms` con token de servicio); `client.create()` desde un navegador falla | ADR-0026 / §Seguridad de fronteras |
| D-09 | Fase `PREPARE` con reloj detenido hasta que conectan todos los humanos; luego 8 s de despliegue | Nadie gana ventaja por conectar antes |
| D-10 | Si todos los humanos faltan más que la ventana de reconexión: cierre `ABANDONED`/`DRAW` (solo `TRAINING`) | PRD §8.2 "jamás depende de tab abierto"; libera capacidad |
| D-11 | Niebla de guerra con `StateView` de Colyseus: cada cliente recibe solo sus formaciones y las enemigas visibles (70 m); al terminar se revela todo. El destino de `MOVE` no se sincroniza | NET-007/NET-014, PRD §11 |
| D-12 | Lógica táctica en `packages/tactical-sim` (no en `apps/battle-server`) | La usan la API (snapshot/verificación por replay), el servidor y los tests: reutilización real (guía §5) |
| D-13 | Dependencias `@colyseus/core`, `ws-transport`, `schema` (sin el metapaquete `colyseus`) | El metapaquete arrastra `redis-driver`/`redis-presence`; ADR-0031 excluye Redis |
| D-14 | Un escenario P0 (`plain`) en Gate 1; paso montañoso y fortificado en Gate 3 (M2-G3-01/02) | Backlog: Gate 0 pide una llanura |
| D-15 | `TACTICAL_TICK_HZ` solo puede confirmar el valor del ruleset (no cambiarlo) | PRD §8.2: no alterar parámetros con encuentros iniciados |
| D-16 | La invitación de 20 s es de `WORLD_PVP` (Gate 2); el duelo de entrenamiento usa un lobby de 180 s con código | GDD: el entrenamiento no compite con la llegada de un ataque |
| D-17 | La API verifica cada resultado re-ejecutando el replay completo antes de registrarlo | ADR-0027 "validar procedencia"; coste medido < 50 ms por batalla |

---

## 3. Desglose de ADR-0021 … ADR-0037

| ADR | Decisión (resumen) | Dónde está | Invariante probada | Estado |
|---|---|---|---|---|
| 0021 Extender sin reescribir | Battle-server efímero; mundo sigue en API/worker; migraciones aditivas | `apps/battle-server` sin cliente de BD; migración `0001` solo crea `training_matches` | e2e: huella de 13 tablas de mundo idéntica tras entrenar (`apps/api/test/training.e2e.test.ts`); suite M1 intacta | ✅ |
| 0022 Colyseus aislado | Proceso aparte, una sala por batalla, SDK en web | `apps/battle-server`, `apps/web/src/battle/useBattleRoom.ts` | battle-server caído ⇒ 503 limpio sin tocar el mundo; capacidad ⇒ `ROOM_AT_CAPACITY` | ✅ (TRAINING) |
| 0023 Consentimiento bilateral, AUTO por defecto | Oferta 20 s, ambos aceptan | — | — | ⏳ Gate 2 (no hay ofertas de mundo aún) |
| 0024 Snapshots inmutables y reservas | Snapshot con hash; reservas de tropas | `buildTrainingSnapshot` + `verifySnapshotHash`; la sala rechaza snapshots manipulados | test de manipulación (unit + battle-server 400) | 🟡 snapshot ✅ · reservas ⏳ Gate 2 |
| 0025 Formación + tick fijo | 10 Hz, enteros, orden estable, PRNG sembrado | `packages/tactical-sim/src/simulation.ts` | mismo input ⇒ mismo hash; propiedades (conservación, moral, transitabilidad); p95 0,24 ms/tick con 24 formaciones | ✅ |
| 0026 Tickets de un uso | HMAC, TTL 60 s, `jti`, scope sala/bando/rol/modo | `tactical-sim/src/tickets.ts`, `TacticalRoom.onAuth` | reutilizado, caducado, otra sala, firma falsa, bando de la doctrina ⇒ rechazados | ✅ (jti en memoria, D-04) |
| 0027 Commit idempotente | Resultado autenticado, validado y único | `TrainingService.recordResult` (TRAINING) | sin token 401; reenvío ⇒ `ALREADY_RECORDED`; resultado distinto ⇒ 409; replay no reproducible ⇒ 422 | 🟡 TRAINING ✅ · commit de mundo ⏳ Gate 2 |
| 0028 Reconexión y fallback | Gracia 30 s, doctrina al caer | `onDrop`/`allowReconnection`/`onReconnect`; `doctrine.ts` | caída ⇒ control `DOCTRINE` y la simulación sigue; reconexión con token ⇒ `PLAYER` | 🟡 sala ✅ · fallback AUTO de mundo ⏳ Gate 2 |
| 0029 Replays auditables | Snapshot + semilla + versión + órdenes + checksum | `runReplay`, `ReplayLog` guardado en `training_matches.replay` | replay reproduce `resultHash`; replay manipulado ⇒ divergencia | 🟡 datos ✅ · visor de replay ⏳ Gate 3 |
| 0030 Arte final + 2.5D | PBR, LOD, instancing, navmesh 2.5D | rejilla 2.5D + A* (`nav.ts`); soldados por **instancing** (`instancing.ts`) | test de rutas (agua bloquea, ruta determinista) | 🟡 técnica ✅ · **arte final ⛔** (blockout) |
| 0031 Un proceso económico | Una instancia, límites, sin Redis | `TACTICAL_MAX_ROOMS`, `/health`, `/metrics` | test de capacidad | ✅ (sin Compose de producción aún) |
| 0032 Preservar diplomacia/rankings/Maravilla | Mismos eventos canónicos | — | — | ⛔ esos sistemas M1 no existen |
| 0033 2.5D terrestre, sin naval RTS | Agua bloquea formaciones | `nav.ts` (agua/roca bloqueadas) | test "agua y roca bloquean" | ✅ |
| 0034 Mundo y temporada en toda sala | `worldId/seasonId` en ticket, snapshot, resultado | contratos zod con reglas TRAINING/WORLD_PVP (D-01/D-02) | sala rechaza ticket con otro modo/mundo (`WRONG_SCOPE`) | 🟡 contratos ✅ · fuzzing de mundo en Gate 2 |
| 0035 Instrumentación | Tick, salas, rechazos, reconexiones, resultados | `apps/battle-server/src/metrics.ts` (`/metrics`), logs JSON correlados por `encounter_id` | test de `/metrics` | 🟡 sin RTT agregado de servidor ni dashboard |
| 0036 Rollout por flags | `TACTICAL_*` por entorno; migraciones aditivas | `/api/v1/battle-config`, `TACTICAL_TRAINING_ENABLED`, `TACTICAL_BATTLES_ENABLED` (forzado a false) + rollback SQL | flag apagado ⇒ `FEATURE_DISABLED` | 🟡 flags globales; por mundo en Gate 2 |
| 0037 TRAINING primero | Sin consecuencias persistentes | `TrainingService` solo escribe `training_matches` | e2e de huella de mundo | ✅ |

---

## 4. Desglose del PRD MVP 2

### P0

| FR | Requisito | Historias (backlog) | Implementación | Estado |
|---|---|---|---|---|
| FR2-001 | Compatibilidad del mundo persistente | M2-G0-01/02, G2-11 | battle-server sin BD; suite M1 verde; apagar el battle-server no afecta al mundo | ✅ para TRAINING |
| FR2-002 | Elegibilidad del encuentro | G2-02 | — | ⛔ requiere PNA (M1 Gate 3) |
| FR2-003 | Propuesta y consentimiento (20 s) | G2-04 | — (duelo de entrenamiento por código, D-16) | ⏳ Gate 2 |
| FR2-004 | Reserva transaccional de tropas | G2-05 | — | ⏳ Gate 2 |
| FR2-005 | Sala RTS 3D | G0-05/06, G1-02/06, G3-04 | arena 3D (`ArenaScene.tsx`), cámara RTS, selección múltiple, clic derecho mover/atacar, teclas H/R/F/1/2/3, minimapa, rechazo visible | 🟡 sin arte final ni 3 escenarios |
| FR2-006 | Simulación autoritativa | G1-04/05/07/11 | tick 10 Hz, validación de transporte (esquema, secuencia, frecuencia, cola) y semántica (bando, terreno, visibilidad) | ✅ |
| FR2-007 | Reconexión y conducta offline | G1-08/09 | doctrina al caer, reconexión 30 s, reingreso tras recargar con token | ✅ |
| FR2-008 | Resultado único y reconciliación | G2-08/09/10 | TRAINING: entrega con reintentos + registro idempotente verificado | 🟡 mundo ⏳ Gate 2 |
| FR2-009 | Replay y observación | G1-10, G3-08/09 | datos de replay verificables; espectadores no implementados | 🟡 |
| FR2-010 | Integración UX mundo/alianzas | G3-07 | — | ⛔ rankings/PNA M1 |
| FR2-011 | Arte y escenas 3D | G0-05/06, G3-03/11 | blockout + instancing; manifest exige GLB/licencia | ⛔ arte final |
| FR2-012 | Observabilidad, operación y seguridad | G0-09, G4-* | `/health`, `/metrics`, logs JSON, flags, tickets, límites de mensaje (4 KB) y órdenes | 🟡 sin dashboard, WSS de producción ni carga |

### P1

FR2-101 entrenamiento con IA doctrinal ✅ (adelantado: es la base de Gate 1) · FR2-102 replay compartible ⏳ · FR2-103 formaciones avanzadas 🟡 (línea, cuña y escaramuza existen) · FR2-104 fortificaciones ⏳ · FR2-105 agua visual en batallas costeras ⏳ · FR2-106 accesibilidad 🟡 (todas las órdenes tienen botón y atajo; lista de formaciones navegable por teclado).

---

## 5. Backlog MVP 2 — estado por historia

### Gate 0 · Compatibilidad, diseño y arte de referencia

| Id | Estado | Evidencia |
|---|---|---|
| M2-G0-01 Inventario M1 | ✅ | §1 de este documento |
| M2-G0-02 Baseline M1 | ✅ | Tras mover el proyecto a la raíz: formato, lint, 9 typechecks y 74 tests M1 en verde antes de tocar nada |
| M2-G0-03 ADR registradas | ✅ | §2–§3; `AGENTS.md` con addendum; índice `docs/adr/README_ADR.md` |
| M2-G0-04 Contratos versionados | ✅ | `packages/contracts/src/tactical.ts` (zod, runtime) |
| M2-G0-05 Llanura con assets finales | 🟡 | Llanura 3D con terreno, bosque, rocas, estanque y colinas **en blockout**; sin GLB aprobados |
| M2-G0-06 24 formaciones animadas + LOD | 🟡 | 24 formaciones / 340 soldados visuales (máx. 16 por formación, dentro del radio que usa el servidor) en 13 lotes de dibujo por *instancing*; animación procedural; sin LOD ni rig. 24–25 FPS con SwiftShader (render por software, un navegador); GPU real sin medir |
| M2-G0-07 Navegación 2.5D | ✅ | `nav.ts`: rejilla 4 m, A* determinista sin cortar esquinas; tests de agua/roca/ruta |
| M2-G0-08 Reglas de formación y combate | ✅ | `tactical-mvp2-alpha.0` (PROPOSAL) + simulador + tests de propiedades |
| M2-G0-09 Métricas y flags | 🟡 | `/metrics`, `/health`, `/battle-config`, flags por entorno; sin dashboard |

### Gate 1 · Simulación táctica sin persistencia (`TRAINING`)

| Id | Estado | Evidencia |
|---|---|---|
| M2-G1-01 `apps/battle-server` Colyseus | ✅ | 0.18 (`@colyseus/core`), sala `tactical` accesible desde dos navegadores: `apps/web/e2e/tactical-training.e2e.mjs` (`pnpm --filter @reinos/web e2e:tactical`) |
| M2-G1-02 SDK en la web PlayCanvas | ✅ | `useBattleRoom.ts` (una sesión compartida por partida: el doble montaje de React no pide un segundo ticket) + `ArenaScene.tsx` |
| M2-G1-03 Máquinas de estados | 🟡 | fases de sala (espera → PREPARE → FIGHT → FINISHED) y de partida de entrenamiento (`training_status`); la máquina de **encuentro de mundo** es de Gate 2 |
| M2-G1-04 Tick 10 Hz y cola | ✅ | `setSimulationInterval`; cola con tope por tick; métricas de duración de tick |
| M2-G1-05 MOVE/ATTACK/HOLD/RETREAT | ✅ | más SET_FORMATION y SUPPORT |
| M2-G1-06 Línea y cuña + interpolación | ✅ | y escaramuza; interpolación entre ticks en el cliente |
| M2-G1-07 Daño, moral, rutas, retirada, fin | ✅ | tests sin navegador |
| M2-G1-08 IA doctrinal en desconexión | ✅ | test de caída: la simulación avanza sin cliente |
| M2-G1-09 Reconexión y reload | ✅ | test con token; en la web, token en `sessionStorage` |
| M2-G1-10 Captura de órdenes y eventos | ✅ | replay reproduce ganador, bajas y `resultHash` |
| M2-G1-11 Paquetes imposibles/repetidos | ✅ | NaN, otro bando, secuencia repetida, agua, payload falso, ráfaga ⇒ rechazados sin efecto |
| M2-G1-12 TRAINING sin escrituras de mundo | ✅ | huella de 13 tablas idéntica |

**Salida de Gate 1:** técnicamente cumplida **salvo "visual profesional"** (depende del arte final, ADR-0030). Falta además un playtest humano documentado antes de declarar el gate aprobado.

### Gates 2–4

Ninguna historia iniciada. Orden recomendado una vez exista diplomacia en M1:
`G2-01 migraciones (battle_encounters…) → G2-03 snapshot de llegada → G2-02 elegibilidad (PNA) → G2-04 oferta 20 s → G2-05 reservas → G2-06 tickets con jti en PostgreSQL → G2-07 sala desde snapshot → G2-08/09 commit canónico → G2-10 reconciliación/fallback AUTO en el worker → G2-11 flag → G2-12 cierre de temporada`.

---

## 6. Plan de QA — cobertura actual

| Caso | Estado | Test |
|---|---|---|
| INT-013 TRAINING no muta el mundo | ✅ | `training.e2e` (huella) + tipo distinto (`simulation.test`) |
| INT-014 battle-server apagado | ✅ (TRAINING) | `training.e2e`: 503 limpio |
| INT-008/009 resultado repetido / distinto | ✅ (TRAINING) | `training.e2e` |
| NET-001/002/003 tickets | ✅ | `battle-server.test` |
| NET-005 ráfaga de órdenes | ✅ | `RATE_LIMITED` |
| NET-006 MOVE inválido / NaN | ✅ | `MALFORMED`, `NOT_PASSABLE` |
| NET-007 atacar propia / no visible | ✅ | `INVALID_TARGET`, `NOT_VISIBLE` |
| NET-008 secuencia duplicada | ✅ | `SEQ_NOT_MONOTONIC` |
| NET-009 cliente falsifica HP/tropas | ✅ | payload con `hp/count` ⇒ `MALFORMED`, estado intacto |
| NET-010/011 abandono y recarga | ✅ | reconexión con token |
| NET-012 kill -9 de Colyseus | ⏳ | requiere reconciliación de Gate 2 (en TRAINING no hay efectos que recuperar) |
| NET-014 espectador ajeno | 🟡 | no hay espectadores; la niebla impide ver enemigos no visibles |
| E2E navegador: batalla contra la doctrina hasta el resultado | ✅ | `e2e:tactical` — contacto real (bajas, desbandadas, huidas), fin por eliminación/desbandada, resultado registrado y verificado por replay en la API |
| E2E navegador: duelo PvP en dos contextos | ✅ | `e2e:tactical` — invitación por código, ambos jugadores en la misma sala |
| INT-001…007, 010…012, 015…018 | ⏳/⛔ | dependen de Gate 2 o de sistemas M1 inexistentes |

---

## 7. Evidencia ejecutada (2026-11-05)

```bash
pnpm format:check && pnpm lint      # sin errores
pnpm typecheck                      # 11 paquetes
pnpm test                           # 11 archivos, 100 tests (M1 74 + MVP 2 26) con PostgreSQL 16 real
pnpm --filter @reinos/web build && pnpm --filter @reinos/battle-server build
pnpm --filter @reinos/web e2e:tactical   # Chromium + SwiftShader contra la pila local
```

Capturas: [despliegue](../screenshots/tactico-despliegue.png) · [combate](../screenshots/tactico-combate.png) · [resultado](../screenshots/tactico-resultado.png) · [duelo PvP](../screenshots/tactico-pvp.png).

## 8. Lo que NO se ejecutó

- Ninguna prueba con GPU real: los FPS medidos son de SwiftShader (render por software) y **no** validan NFR2-001.
- Ninguna prueba de carga de varias salas en hardware de referencia (M2-G4-01).
- Ningún despliegue con proxy WSS/TLS (M2-G4-05).
- Ningún playtest humano ni simulaciones AUTO vs táctico (GDD §8) — obligatorias antes de `WORLD_PVP`.
- Ningún asset final ni revisión artística humana.
