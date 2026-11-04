# Reinos de la Frontera — MVP 1.0

MMORTS web 3D por temporadas. Este directorio contiene la **documentación de producto/arquitectura** y, desde la iteración 1, el **código del monorepo** que la implementa.

- Estado real de la implementación, pruebas y pendientes: [`docs/IMPLEMENTATION-STATUS.md`](docs/IMPLEMENTATION-STATUS.md)
- Arte 3D: la ciudad usa un **kit procedural de validación ("blockout")**, no arte final. Gate 0 sigue abierto.

## Documentación

1. [`PRD_MVP1.md`](PRD_MVP1.md) — Requisitos funcionales y no funcionales.
2. [`ADRs_MVP1_COMPLETOS.md`](ADRs_MVP1_COMPLETOS.md) y [`docs/adr/`](docs/adr/README_ADR.md) — 20 decisiones arquitectónicas.
3. [`GUIA_IA_INSTALACION.md`](GUIA_IA_INSTALACION.md) — Herramientas, MCP y qué **no** instalar.
4. [`AGENTS.md`](AGENTS.md) — Contrato de comportamiento para agentes de IA.
5. [`BACKLOG_MVP1.md`](BACKLOG_MVP1.md) — Implementación en cinco gates.
6. `specs/`, `examples/`, `infra/` — Balance propuesto, manifest de assets y Compose local.

## Arquitectura del código

| Ruta | Rol |
|---|---|
| `apps/web` | React 19 + PlayCanvas (`@playcanvas/react`): ciudad 3D, HUD, ejército, campaña, informes |
| `apps/api` | NestJS 12, monolito modular: auth, mundos, aldeas, mapa, informes (`/api/v1`) |
| `apps/worker` | Procesa eventos vencidos desde PostgreSQL (`FOR UPDATE SKIP LOCKED` + leases) |
| `packages/game-rules` | Reglas puras y deterministas (economía entera, combate BigInt + PRNG sembrado, viaje, mapa) |
| `packages/game-config` | Ruleset versionado `mvp1-alpha.0` (propuesta de balance, no aprobado) |
| `packages/contracts` | DTO zod y códigos de error compartidos |
| `packages/db` | Esquema Drizzle con `world_id` en FKs compuestas, migraciones SQL, seed |
| `packages/core` | Casos de uso transaccionales usados por API y worker |
| `packages/asset-pipeline` | Contrato de manifest de assets e inspección automática de GLB |

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

Tres terminales (API en :3000, worker y web en :5173 con proxy a la API):

```bash
pnpm dev:api
```

```bash
pnpm dev:worker
```

```bash
pnpm dev:web
```

Abre http://localhost:5173, crea una cuenta y únete a **Prueba Rápida ×50** (mundo acelerado para probar) o a **Frontera I** (velocidad 1, protección de principiante de 72 h).

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

- Servidor autoritativo; PostgreSQL es la fuente de verdad y la cola durable. Sin Redis/BullMQ/Kafka/Colyseus/K8s en MVP 1.
- `world_id` en todo agregado, con FKs compuestas; idempotencia en órdenes, eventos y combate.
- Combate automático determinista (MVP 1); RTS táctico en MVP 2. Sin héroes. Sin pay-to-win.
- IA generativa solo en desarrollo (código/assets), nunca en runtime de NPC o combate.
- Ningún placeholder es arte final: los assets se aprueban vía manifest, licencia y revisión humana.
