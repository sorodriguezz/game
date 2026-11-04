# Backlog ejecutable — MVP 2.0 — Reinos de la Frontera

**Criterio:** gates secuenciales y evidencia real. No se admite pasar a PvP persistente sin superar el prototipo `TRAINING` y las pruebas de regresión MVP 1. **Estimaciones:** no comprometidas, requieren inventario del código actual.

## Gate 0 · Compatibilidad, diseño y arte de referencia

| ID | Historia / tarea | Evidencia de aceptación |
|---|---|---|
| M2-G0-01 | Inventariar módulos y contratos reales de MVP 1 | Mapa de dependencias API/worker/web + DB real |
| M2-G0-02 | Ejecutar suite de regresión M1 y guardar baseline | CI verde y reporte de cobertura conocido |
| M2-G0-03 | ADR-0021..0037 revisadas y registradas | Decisiones aceptadas o cambios documentados |
| M2-G0-04 | Crear contrato `TacticalBattleSnapshot` y `BattleCanonicalResult` versionado | Typecheck y validaciones runtime |
| M2-G0-05 | Construir una llanura 3D con assets finales M1 reutilizados | Capturas reales + inspect GLB y lista de licencias |
| M2-G0-06 | Renderizar 24 formaciones con unidades animadas y LOD | Benchmark de FPS, draw calls, memoria y descarga |
| M2-G0-07 | Elegir y medir navegación para formaciones en mapa 2.5D | Test de colisión, obstáculos y rutas válidas |
| M2-G0-08 | Diseñar reglas de 4 tipos de formación y combate | Simulaciones unitarias y versión de balance |
| M2-G0-09 | Definir métricas y flags de disponibilidad | Dashboard o logs estructurados auditables |

**Salida de Gate 0:** una demostración visual con arte aceptable, contratos aprobados y baseline M1 sin regresiones. No hay todavía consumo de recursos persistentes.

## Gate 1 · Simulación táctica sin persistencia (`TRAINING`)

| ID | Historia / tarea | Evidencia de aceptación |
|---|---|---|
| M2-G1-01 | Crear `apps/battle-server` con Colyseus | Sala accesible desde dos navegadores |
| M2-G1-02 | Integrar SDK Colyseus en la web PlayCanvas | Estado de sala reflejado en renderer real |
| M2-G1-03 | Modelar máquinas de estados para encuentro/room | Tests de transiciones ilegales |
| M2-G1-04 | Tick fijo 10 Hz y cola de comandos | Medición de jitter y secuencias |
| M2-G1-05 | Input `MOVE`, `ATTACK`, `HOLD`, `RETREAT` | Validaciones por owner/formación/terreno |
| M2-G1-06 | Formaciones: línea y cuña; interpolación visual | Dos clientes ven el mismo estado canónico |
| M2-G1-07 | Daño, moral, rutas, retirada y condición de fin | Tests sin OpenGL ni navegador |
| M2-G1-08 | AI doctrinal en desconexión | Simulación prosigue sin cliente |
| M2-G1-09 | Reconexión y reload | Recuperación o finalización segura |
| M2-G1-10 | Captura de órdenes y eventos | Replay reproduce ganador y bajas |
| M2-G1-11 | Test adversarial: paquetes imposibles/repetidos | Ningún comando inválido cambia estado |
| M2-G1-12 | Asegurar que `TRAINING` no toca DB de recursos/tropas | Test integración: cero escrituras mundiales |

**Salida Gate 1:** batalla táctico-terrestre *de entrenamiento*, con dos jugadores, visual profesional, estable, completamente aislada de recursos del mundo.

## Gate 2 · Integración segura al mundo persistente

| ID | Historia / tarea | Evidencia de aceptación |
|---|---|---|
| M2-G2-01 | Migraciones aditivas y modelo Drizzle | Rollforward/rollback probado en copia de DB |
| M2-G2-02 | Validación de elegibilidad, PNA/confederaciones, temporada | Matriz 100% recorrida por tests |
| M2-G2-03 | Snapshot de llegada con hash/reglas congeladas | Snapshot inmutable y auditable |
| M2-G2-04 | Oferta 20s, aceptación doble, rechazo y expiración | No se puede crear sala con una sola aceptación |
| M2-G2-05 | Reservas transaccionales de guarnición / ejército | Dos ataques concurrentes nunca duplican tropas |
| M2-G2-06 | Tickets de un uso con TTL/rol/mundo | Token vencido/duplicado/ajeno rechazado |
| M2-G2-07 | Bootroom desde snapshot autorizado | Colyseus no inventa tropas |
| M2-G2-08 | Resultado firmado y entrega interna | Navegador no puede llamar commit |
| M2-G2-09 | Commit atómico de pérdidas/botín/outbox | 1 resultado observable por encuentro |
| M2-G2-10 | Worker de reconciliación y fallback AUTO | Interrupciones recuperadas sin tropas bloqueadas |
| M2-G2-11 | Deshabilitar Colyseus por flag | El mundo completo sigue jugando normal |
| M2-G2-12 | Probar cierre de temporada durante un encuentro | Política estable y resultado auditable |

**Salida Gate 2:** duelo PvP real **solo con consentimiento bilateral**, resuelto una sola vez sin romper economía ni rankings.

## Gate 3 · Presentación, convivencia con producto y calidad

| ID | Historia / tarea | Evidencia de aceptación |
|---|---|---|
| M2-G3-01 | Escenario de paso montañoso, navmesh, colisión | Captura y pruebas de orden de ruta |
| M2-G3-02 | Escenario fortificado, muros y puertas | Eventos de defensa válidos |
| M2-G3-03 | Set de animaciones para infante, arquero y caballería | Rig/clip/escala inspeccionados |
| M2-G3-04 | Interfaz RTS de selección, órdenes, feedback y temporizador | E2E por Playwright con screenshots |
| M2-G3-05 | Estado visual de latencia, reconexión y fallback | UX sin pantallas infinitas |
| M2-G3-06 | Integrar resultado con hospitales/sacerdotes y doctrina | Pruebas con heridos recuperables |
| M2-G3-07 | Integrar resultado con rankings y cierre semanal | No doble puntaje ni premio |
| M2-G3-08 | Reporte de combate y replay con visibilidad | Reporte coincide con registro canónico |
| M2-G3-09 | Restringir espectadores a roles elegibles | No fog-of-war leak |
| M2-G3-10 | Comprobar transporte naval/NPC/Oasis/Maravilla M1 | Todas las pruebas de regresión M1 verdes |
| M2-G3-11 | Audit de archivos 3D, licencia y compresión | `asset-manifest` actualizado |
| M2-G3-12 | Opciones de accesibilidad y calidad gráfica | Test manual con ajustes bajos |

**Salida Gate 3:** experiencia jugable visualmente coherente con el mundo M1 y sin exploits obvios.

## Gate 4 · Seguridad, carga y liberación

| ID | Historia / tarea | Evidencia de aceptación |
|---|---|---|
| M2-G4-01 | Benchmark 1/2/4/8 salas según hardware disponible | Reporte CPU/tick/mem/red y punto de saturación |
| M2-G4-02 | Caída de API, Colyseus, PostgreSQL, proxy y websocket | Reconciliación y fallback documentados |
| M2-G4-03 | Simular 1000 entradas adversariales | Validación sin daño real / crecimiento memoria |
| M2-G4-04 | Revisión de tickets, scopes, PNA, world/season y rate limits | Matriz de amenazas cerrada |
| M2-G4-05 | Probar despliegue + proxy WSS + salud | Clientes conectan con HTTPS end-to-end |
| M2-G4-06 | Feature flag habilitado primero en mundo sandbox | No afectación de otros mundos |
| M2-G4-07 | Habilitar porcentaje limitado de encuentros elegibles | Métricas de aceptación, fallback y fallos |
| M2-G4-08 | Práctica completa de rollback | Nuevos ataques AUTO y sin batallas colgadas |
| M2-G4-09 | Backups/migración restore del mundo | Restore verificado en entorno aislado |
| M2-G4-10 | Manual de operación y dashboard | Alertas útiles y runbooks ensayados |

**Salida Gate 4:** beta controlada que permite habilitar el modo táctico sin depender de él para continuar la temporada.

## P1 — No bloquear MVP2 core

- [ ] M2-P1-01: lobby amistoso para duelos de entrenamiento (sin recursos ni rankings).
- [ ] M2-P1-02: compartir replay diferido con miembros de alianza autorizados.
- [ ] M2-P1-03: formación de escaramuza y contramedidas adicionales.
- [ ] M2-P1-04: mejorar guerra de asedio táctica dentro de cupos, sin Maravilla por defecto.
- [ ] M2-P1-05: mapas costeros con puertos/botes *visuales*; combates marítimos RTS para MVP2.1/MVP3.
- [ ] M2-P1-06: tutorial interactivo para comandos de formaciones.

## Matriz de dependencia

`Gate0 arte/contracts` → `Gate1 entrenamiento` → `Gate2 persistencia` → `Gate3 producto` → `Gate4 beta`. Dentro de Gate2: `snapshot` → `elegibilidad` → `oferta` → `reserva` → `ticket/room` → `result` → `commit/reconciliación`.

## Definición de terminado por PR

- FR2/ADR enlazadas; cambio mínimo y reversible.
- TypeScript typecheck + lint + pruebas unitarias/integ/E2E relevantes + regresión M1.
- Screenshots/videos solo tomados del juego ejecutándose, con versión de assets.
- Métricas de tick/latencia y estimación de costos para todo cambio de simulación.
- PNA/alianzas/Maravilla/rankings/semana no alterados sin contrato y prueba.
- Documentar secuencia de rollback y migración si tocó datos.
