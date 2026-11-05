# Estado de implementación — MVP 1 (iteración 1) + MVP 2 (Gate 0 técnico y Gate 1 `TRAINING`)

**Fecha:** 2026-11-05 · **Regla:** nada se marca como terminado sin prueba ejecutada. Los resultados de abajo son de ejecuciones reales en este repositorio.

Corrección de arranque local (G0-01 / FR-001, ADR-0001/0017): `ThrottlerGuard` se crea con
una fábrica y tokens explícitos, con `Reflector` registrado en el módulo, para evitar el
`UnknownDependenciesException` observado con `tsx`. No cambia contratos ni datos; rollback:
revertir el proveedor en `apps/api/src/app.ts`. Validado con Node 22.23.4 + `tsx`, bundle
de API, health a través del proxy de Vite (200), sesión ausente (401) y registro inválido
(422). Suite completa: 101 tests en 11 archivos con PostgreSQL 17; incluye una prueba
del límite global (429 y `Retry-After`). Typecheck, ESLint y Prettier de la API sin errores.

## 0. MVP 2 — resumen

El desglose completo (ADR-0021…0037, PRD, backlog, plan de QA y decisiones D-01…D-17) está en
[`docs/mvp2/DESGLOSE-MVP2.md`](mvp2/DESGLOSE-MVP2.md). En corto:

- **Hecho y probado:** contratos tácticos zod, ruleset táctico `tactical-mvp2-alpha.0` (PROPOSAL), simulación entera determinista por formaciones a 10 Hz (`packages/tactical-sim`), navegación 2.5D, doctrina, replay verificable, tickets HMAC de un uso, `apps/battle-server` (Colyseus 0.18, niebla de guerra, reconexión, límites), API de entrenamiento (`/api/v1/training…`) que verifica cada resultado re-ejecutando el replay, y arena 3D en la web con soldados por *instancing*.
- **`TRAINING` no escribe en el mundo:** test e2e con huella de 13 tablas de mundo idéntica antes y después de entrenar.
- **No iniciado / bloqueado:** `WORLD_PVP` (Gate 2) espera a que el MVP 1 tenga diplomacia/PNA; arte final (Gate 0 de M1); playtest humano; GPU real; carga.

Capturas reales de la arena (Chromium headless con SwiftShader, render por software):
[despliegue](screenshots/tactico-despliegue.png) · [combate](screenshots/tactico-combate.png) · [resultado](screenshots/tactico-resultado.png) · [duelo PvP](screenshots/tactico-pvp.png).

## 1. Qué existe

```text
./
├── apps/
│   ├── api/           NestJS 12 (monolito modular, ADR-0001): auth, mundos, aldeas, mapa, informes, entrenamiento táctico
│   ├── worker/        Worker de eventos sobre PostgreSQL (ADR-0003)
│   ├── battle-server/ MVP 2: salas tácticas Colyseus 0.18 (ADR-0022), sin acceso a la BD del mundo
│   └── web/           React 19 + PlayCanvas 2 (@playcanvas/react): ciudad 3D, HUD, paneles, mapa 2D, arena táctica
├── packages/
│   ├── game-config/    Ruleset versionado `mvp1-alpha.0` (zod) — catálogo y balance
│   ├── game-rules/     Reglas puras deterministas: economía, combate, viaje, mapa, ciudad
│   ├── contracts/      DTO zod + códigos de error compartidos web/API
│   ├── db/             Esquema Drizzle, migraciones SQL, seed
│   ├── core/           Casos de uso transaccionales compartidos por API y worker (+ TrainingService)
│   ├── tactical-sim/   MVP 2: simulación táctica pura, nav 2.5D, doctrina, replay, tickets
│   └── asset-pipeline/ Contrato de manifest + inspección automática de GLB
└── scripts/bundle.mjs  Empaquetado de API/worker para producción
```

Capturas reales del cliente (Chromium headless, render por software):
[ciudad con todos los edificios del kit *blockout*](screenshots/ciudad-blockout.png) ·
[informe de un saqueo resuelto con el defensor desconectado](screenshots/informe-batalla.png).

## 2. Backlog — estado verificable

| Historia | Estado | Evidencia |
|---|---|---|
| G0-01 Monorepo web/API/Postgres/tests | ✅ | `pnpm typecheck`, `pnpm lint`, `pnpm test` verdes; `vite build` y bundles de API/worker arrancan |
| G0-02 Guía artística | ⏳ | Pendiente: requiere decisión humana de dirección de arte |
| G0-03 Contrato asset-manifest + checklist de licencias | ✅ (contrato) | `packages/asset-pipeline/src/manifest.ts`: APPROVED exige GLB, licencia verificada, 5 validaciones PASS y clips por tipo |
| G0-04 Producir/aprobar castillo, granja, hospital, templo, puerto, barco, infante, arbolado | ❌ | **No hay arte final.** Existe un kit procedural *blockout* para validar escala/cámara/parcelas. Requiere Blender/IA local + revisión humana |
| G0-05 Inspección GLB, optimización, capturas | 🟡 | Inspector GLB con presupuestos (triángulos, materiales, texturas, PBR, pivote, escala, clips) + capturas con Playwright. Falta paso de optimización glTF Transform |
| G0-06 Ciudad 3D navegable con selector de parcela | 🟡 | Cámara orbital acotada, picking por clic, 3 etapas visuales por nivel, andamio de obra, muralla, costa/puerto, aldeanos. Con *blockout*, no con edificios aprobados |
| G1-01 Auth seguro, mundos, membresías | ✅ | Argon2id, sesión opaca en cookie HttpOnly/SameSite, CSRF por cabecera, control de `Origin`, rate limit; alta con elección de civilización |
| G1-02 Ledger y liquidación de 4 recursos | ✅ | Enteros (milésimas) + resto exacto; tests de propiedades (tramos == una vez; nunca negativo ni sobre capacidad) |
| G1-03 Construcción en parcelas y finalización offline | ✅ | Cola única por aldea garantizada por índice parcial; finaliza vía worker o en línea; cambio de tasa en el instante exacto |
| G1-04 Cuartel, reclutamiento, pilas, movimiento | ✅ | Cola secuencial por edificio, población, hambruna, compromiso de tropas sin doble gasto |
| G1-05 Worker `SKIP LOCKED`, idempotencia, reconciliación | ✅ | Claim con lease, recuperación de leases caducados, backoff, dead-letter; `Idempotency-Key` en la misma transacción |
| G1-06 Combate determinista + doctrina offline + informe | ✅ | `resolveBattle` BigInt + PRNG sembrado; reserva y retirada; heridos con hospital; informe con hitos |
| G1-07 Carreras en ataque, gasto, finalización y reinicio | ✅ | Ver §3 |
| G2-* a G4-* | ❌ | No iniciados (ver §6) |

**Gate 0 NO está aprobado** (falta arte profesional aprobado). **Gate 1** cumple su criterio funcional — dos usuarios, ataque resuelto con el defensor desconectado, reinicio sin duplicados — pero sus ciudades usan el *blockout*, así que la aprobación formal depende de Gate 0.

## 3. Pruebas ejecutadas (resultado real)

```bash
pnpm test            # 11 archivos, 100 tests (74 M1 + 26 MVP 2): unitarios + integración con PostgreSQL 16 real
pnpm lint            # ESLint sin errores (prohíbe Math.random fuera del cliente)
pnpm typecheck       # 11 paquetes sin errores
pnpm assets:validate # manifest válido; 13 assets en BLOCKOUT (aviso explícito)
pnpm --filter @reinos/web e2e           # escenario M1 completo en Chromium contra la pila levantada
pnpm --filter @reinos/web e2e:tactical  # MVP 2: batalla contra la doctrina hasta el resultado + duelo PvP en dos navegadores
```

Casos obligatorios del PRD cubiertos por tests automatizados:

| PRD §25 / CA | Test |
|---|---|
| §25.1 Dos gastos simultáneos del último recurso | `core/test/economy-construction.test.ts` — 6 peticiones paralelas, 1 éxito, saldo 0 exacto |
| §25.2 Worker cae tras resolver y antes de confirmar | `core/test/combat-worker.test.ts` — fallo inyectado antes del COMMIT, reintento, 1 batalla y 1 asiento de botín |
| §25.3 Llegadas simultáneas, orden estable | mismo archivo — orden `(due_at, priority, id)`; la 2.ª batalla ve las bajas de la 1.ª |
| §25.4 Acceso cruzado entre mundos | lectura, comando y ataque cross-world rechazados + FK compuesta que lo impide en BD |
| §25.11 Cambio de tasa a mitad de período | `game-rules/test/economy.test.ts` y test de integración de construcción |
| CA-ECO-02 Reintento con `Idempotency-Key` | 3 peticiones paralelas con la misma clave → 1 orden; misma clave con otra carga → `IDEMPOTENCY_KEY_REUSED` |
| CA-ECO-03 Construcción termina offline una sola vez | worker drena tarde; segundo drenado no reclama nada |
| NFR-11 Determinismo de combate | snapshot persistido → `resolveBattle` reproduce exactamente el resultado guardado |
| Lease caducado (2 workers) | el worker "colgado" encuentra el evento DONE y lo omite |

## 4. Decisiones de implementación (dentro de las ADR)

- **TypeScript 6.0** (no 7.0): `typescript-eslint` aún no soporta TS 7.
- **NestJS sin `emitDecoratorMetadata`**: inyección con `@Inject(TOKEN)` explícito para ejecutar con tsx/esbuild y empaquetar en un único ESM.
- **Paquetes internos consumidos como fuente TS**; API y worker se empaquetan con esbuild (`scripts/bundle.mjs`).
- **Orden de eventos por aldea**: un evento solo se aplica con todas sus aldeas bloqueadas (`FOR UPDATE`, orden por id) y tras aplicar los anteriores de esas aldeas. Los comandos aplican en línea los eventos vencidos de su aldea; si hay un combate vencido sin resolver responden `EVENTS_PENDING` (reintentable) en vez de adelantar el reloj.
- **Lecturas sin efectos**: `GET` liquida la economía en memoria hasta "ahora" y no escribe.
- **Mapa no persistido**: el terreno se recalcula desde `(seed, size)` con ruido entero; solo se persisten las aldeas.
- **Aparición**: anillo a media distancia del centro con preferencia por casillas costeras (puerto y logística naval) y distancia mínima entre aldeas.
- **Atacar termina la protección de principiante propia.**
- **Informes**: ambos participantes ven el informe completo; el defensor no ve la composición de un ataque entrante antes del impacto.

## 5. Valores propuestos que no estaban en las specs (ruleset `mvp1-alpha.0`, estado PROPOSAL)

Producción base 40/h por nivel + 5/h por aldea; recursos iniciales 750; capacidad 1000 sin almacén y 2000×1,3^(n−1) con él; población 150×1,25^(n−1); carga por unidad (milicia 40, lancero 30, arquero 25, caballería 80, guardia 40, escolta 50); costes de Bastión Imperial y Arsenal Naval; modificadores de civilización (muralla Imperio +4 %/nivel, Liga muralla +15 % de coste y +10 % de carga); combate: suerte ±10 %, muralla +3 %/nivel, defensa base 10, 10 % del botín protegido, heridos con hospital 10 % + 2 %/nivel (máx. 40 %), pérdidas tipo (D/A)^1,5, sacerdotes +3 % por cada 1 % del ejército (máx. 6 %). **Todos requieren simulación y playtesting** antes de abrir un mundo competitivo; cambiar uno exige una versión nueva del ruleset.

## 6. Pendiente (orden sugerido)

1. **Gate 0 — arte real**: guía artística (G0-02) y producción de GLB con Blender/IA local + revisión humana (G0-04); optimización glTF Transform en el pipeline; sustituir el *blockout* vía `manifest.json`.
2. **Gate 1 — cierre**: medición de FPS en equipo de referencia con GPU (en este contenedor solo hay SwiftShader por software, ~4–9 FPS, no representativo); ventana de bloqueo de doctrina antes del impacto (PRD §10.3); outbox publisher (hoy solo se inserta).
3. **Gate 2**: mapa 3D por regiones, grafo naval y transporte, oasis, NPC por máquina de estados, curación en hospital, repetición 3D del combate.
4. **Gate 3**: alianzas/roles, PNA (el punto de validación ya existe en `sendMovement`), confederaciones, rankings, premios semanales.
5. **Gate 4**: Maravillas 1–100, cierre de temporada, panel admin, pruebas de carga, backups/restauración, Docker Compose de alfa (ADR-0016).
6. Skills de agente del repositorio (`agent/SKILLS-PLAN.md`).
