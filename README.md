# Reinos de la Frontera — MVP 1 + MVP 2 (táctico)

MMORTS web 3D por temporadas. Este directorio contiene la **documentación de producto/arquitectura** y, desde la iteración 1, el **código del monorepo** que la implementa.

Encargo maestro 2.0/2.1: [estado completo y pendientes](docs/requirements/IMPLEMENTATION.md). Mundo local **Tierras de la Frontera** creado desde administración. Perfiles por credenciales, atlas cuadrado con arrastre, ciudad orgánica, tropas/ataques permanentes, oasis y economía offline. Las reglas nuevas `.4` añaden cultura, celebraciones y Mercado funcional. El encargo completo sigue en desarrollo.

- Estado real de la implementación, pruebas y pendientes: [`docs/IMPLEMENTATION-STATUS.md`](docs/IMPLEMENTATION-STATUS.md)
- Desglose del MVP 2 (ADR-0021…0037, PRD, backlog y QA contra el código): [`docs/mvp2/DESGLOSE-MVP2.md`](docs/mvp2/DESGLOSE-MVP2.md)
- Arte 3D: la ciudad usa un **kit procedural de validación ("blockout")**, no arte final. Gate 0 sigue abierto.

## Nuevo mundo terrestre y rediseño

El mapa usa coordenadas cartesianas con 0|0 central y cuadrícula cuadrada. Se carga todo el terreno una vez y se recorre con arrastre local. Romanos, Galos y Germanos tienen murallas de piedra, madera y arcilla. Las aldeas comienzan con Centro Urbano 1 y campos vacíos de nivel 0. Construcción, investigación, hambre, movimientos y combate AUTO se resuelven offline en PostgreSQL.

Para actualizar una instalación existente:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abre http://localhost:5173. Usuario/correo y contraseña determinan el perfil: Jugador, Moderador o Administrador. El administrador local separado se configura con `apps/api/src/bootstrap-admin.ts` y guarda sus credenciales en `.env.admin.local`, ignorado por Git. El seed no crea mundos públicos. El Administrador crea, edita y publica borradores; el Jugador ve mundos próximos/en curso y se registra con un modal de raza, cuadrante y nombres. Si ya participa en un único mundo abierto, entra directamente.

Los traslados propios pasan a ser tropas desplegables de la aldea receptora; los refuerzos
aliados conservan dueño y solo defienden. El servidor filtra las marchas visibles. Dos
marchas enemigas que coinciden en espacio y tiempo combaten en campo sin murallas ni botín;
los supervivientes regresan. Si no se interceptan, el combate sucede en el destino.

Diseño histórico: [`docs/territory/DESIGN.md`](docs/territory/DESIGN.md). Estado vigente: [`IMPLEMENTATION.md`](docs/requirements/IMPLEMENTATION.md). Oasis y aldeas libres regeneran defensas; los oasis requieren Tesoro 10/15/20, alcance 5×5 y ataques hasta lealtad 0. Las temporadas nuevas pueden habilitar cultura/cupos y Mercado/Oficina de Comercio; los mundos publicados conservan su versión. Quedan pendientes el catálogo militar completo, espionaje, diplomacia, competición/Maravilla, mensajería y arte definitivo, entre otros bloques documentados.

## Documentación

1. [`PRD_MVP1.md`](PRD_MVP1.md) — Requisitos funcionales y no funcionales.
2. [`ADRs_MVP1_COMPLETOS.md`](ADRs_MVP1_COMPLETOS.md) y [`docs/adr/`](docs/adr/README_ADR.md) — 20 decisiones arquitectónicas.
3. [`GUIA_IA_INSTALACION.md`](GUIA_IA_INSTALACION.md) — Herramientas, MCP y qué **no** instalar.
4. [`AGENTS.md`](AGENTS.md) — Contrato de comportamiento para agentes de IA.
5. [`BACKLOG_MVP1.md`](BACKLOG_MVP1.md) — Implementación en cinco gates.
6. `specs/`, `examples/`, `infra/` — Balance propuesto, manifest de assets y Compose local.
7. [`Reinos_de_la_Frontera_MVP2/`](Reinos_de_la_Frontera_MVP2/PRD_MVP2.md) — PRD, GDD táctico, ADR-0021…0037, backlog y plan de QA del MVP 2 (batallas RTS por formaciones).

## Arquitectura del código

| Ruta                      | Rol                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                | React 19 + PlayCanvas (`@playcanvas/react`): ciudad 3D, HUD, ejército, campaña, informes                                                           |
| `apps/api`                | NestJS 12, monolito modular: auth, mundos, aldeas, mapa, informes (`/api/v1`)                                                                      |
| `apps/worker`             | Procesa eventos vencidos desde PostgreSQL (`FOR UPDATE SKIP LOCKED` + leases)                                                                      |
| `packages/game-rules`     | Reglas puras y deterministas (economía entera, combate BigInt + PRNG sembrado, viaje, mapa)                                                        |
| `packages/game-config`    | Ruleset versionado `mvp1-alpha.0` (propuesta de balance, no aprobado)                                                                              |
| `packages/contracts`      | DTO zod y códigos de error compartidos                                                                                                             |
| `packages/db`             | Esquema Drizzle con `world_id` en FKs compuestas, migraciones SQL, seed                                                                            |
| `packages/core`           | Casos de uso transaccionales usados por API y worker                                                                                               |
| `packages/asset-pipeline` | Contrato de manifest de assets e inspección automática de GLB                                                                                      |
| `apps/battle-server`      | **MVP 2.** Salas tácticas Colyseus 0.18 (ADR-0022): tick fijo 10 Hz, tickets de un uso, niebla de guerra, reconexión; sin acceso a la BD del mundo |
| `packages/tactical-sim`   | **MVP 2.** Simulación táctica pura y entera por formaciones, navegación 2.5D, doctrina, replay y tickets HMAC                                      |

## Arranque local

Requisitos: Node ≥ 22.23 (`.nvmrc`), pnpm 10 (vía Corepack), PostgreSQL 16/17 (Docker o local).

```bash
corepack enable
```

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
docker compose -f infra/compose.dev.yaml up -d
```

Si usas el Compose de `infra/`, ajusta `DATABASE_URL` en `.env` a la base `reinos_dev` que crea ese archivo (ya es el valor por defecto de `.env.example`).

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

Tres terminales (API en :3000, worker y web en :5173 con proxy a la API) y una cuarta opcional para el MVP 2:

```bash
pnpm dev:api
```

```bash
pnpm dev:worker
```

```bash
pnpm dev:web
```

```bash
pnpm dev:battle
```

Abre http://localhost:5173, crea una cuenta y únete a **Prueba Rápida ×50** (mundo acelerado para probar) o a **Frontera I** (velocidad 1, protección de principiante de 72 h).

**Entrenamiento táctico (MVP 2, Gate 1):** se conserva separado en `#/training` para QA y desarrollo, sin acceso desde el listado de mundos. Con el battle-server levantado, permite entrenar contra doctrina o mediante un código de duelo. No modifica el mundo persistente (ADR-0037); `WORLD_PVP` sigue cerrado.

Controles de la arena: clic izquierdo selecciona (Mayús añade), clic derecho mueve o ataca, `H` mantener, `R` retirada, `F` apoyo, `1`/`2`/`3` línea/cuña/escaramuza, `WASD`/flechas desplazan la cámara, `Q`/`E` giran y la rueda acerca.

## Calidad

```bash
pnpm lint
```

```bash
pnpm typecheck
```

Tests unitarios y de integración (la integración usa PostgreSQL real; por defecto `postgresql://reinos_dev:reinos_dev_change_me@127.0.0.1:5432/reinos_test`, configurable con `TEST_DATABASE_URL`):

```bash
pnpm test
```

```bash
pnpm assets:validate
```

Escenario completo en navegador (requiere la pila levantada y el seed recién aplicado):

```bash
pnpm --filter @reinos/web e2e
```

## Reglas esenciales (no negociables)

- Servidor autoritativo; PostgreSQL es la fuente de verdad y la cola durable. Sin Redis/BullMQ/Kafka/K8s. Colyseus solo en `apps/battle-server` (ADR-0022, MVP 2).
- `world_id` en todo agregado, con FKs compuestas; idempotencia en órdenes, eventos y combate.
- Combate automático determinista obligatorio (MVP 1); el RTS táctico (MVP 2) es opt-in y hoy solo existe como `TRAINING`. `WORLD_PVP` sigue bloqueado hasta que M1 tenga diplomacia. Sin héroes. Sin pay-to-win.
- IA generativa solo en desarrollo (código/assets), nunca en runtime de NPC o combate.
- Ningún placeholder es arte final: los assets se aprueban vía manifest, licencia y revisión humana.
