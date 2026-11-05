# Reinos de la Frontera — MVP 1 + MVP 2 (táctico)

MMORTS web 3D por temporadas. Este directorio contiene la **documentación de producto/arquitectura** y, desde la iteración 1, el **código del monorepo** que la implementa.

- Estado real de la implementación, pruebas y pendientes: [`docs/IMPLEMENTATION-STATUS.md`](docs/IMPLEMENTATION-STATUS.md)
- Desglose del MVP 2 (ADR-0021…0037, PRD, backlog y QA contra el código): [`docs/mvp2/DESGLOSE-MVP2.md`](docs/mvp2/DESGLOSE-MVP2.md)
- Arte 3D: la ciudad usa un **kit procedural de validación ("blockout")**, no arte final. Gate 0 sigue abierto.

## Nuevo mundo terrestre y rediseño

El encargo del 2026-11-05 añade **Reinos Terrestres ×50**, con reglas propias `frontier-alpha.1`:
mapa isométrico fijo por coordenadas, todo tierra, tres razas nuevas y aldeas 3D con tres
recintos. Campos exteriores individuales de madera, barro, hierro y cereal; industria y
cuarteles; ciudadela con castillo, centro urbano y plaza de reuniones.

Para actualizar una instalación existente:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abre http://localhost:5173 y entra en **Reinos Terrestres ×50**. Los mundos anteriores
conservan sus reglas. Desde el mapa selecciona una casilla libre para fundar (centro urbano 5,
plaza 1, tres colonos y recursos), o una aldea para atacar, saquear, conquistar, trasladar o
reforzar según propiedad y alianza. Los emisarios reducen lealtad; las capitales y últimas
aldeas están protegidas. Los oasis tienen animales persistentes y se vinculan a una aldea.

Los traslados propios pasan a ser tropas desplegables de la aldea receptora; los refuerzos
aliados conservan dueño y solo defienden. El servidor filtra las marchas visibles. Dos
marchas enemigas que coinciden en espacio y tiempo combaten en campo sin murallas ni botín;
los supervivientes regresan. Si no se interceptan, el combate sucede en el destino.

Diseño, balance propuesto y validación: [`docs/territory/DESIGN.md`](docs/territory/DESIGN.md).
Es una implementación alfa propia inspirada en el género: no pretende reproducir todas
las versiones, tablas ni sistemas de Travian. Los NPC son aldeas defensoras persistentes;
las patrullas autónomas, la regeneración de animales, la curación y el asedio dirigido
quedan fuera de esta entrega. Los modelos nuevos siguen pendientes de aprobación artística.

## Documentación

1. [`PRD_MVP1.md`](PRD_MVP1.md) — Requisitos funcionales y no funcionales.
2. [`ADRs_MVP1_COMPLETOS.md`](ADRs_MVP1_COMPLETOS.md) y [`docs/adr/`](docs/adr/README_ADR.md) — 20 decisiones arquitectónicas.
3. [`GUIA_IA_INSTALACION.md`](GUIA_IA_INSTALACION.md) — Herramientas, MCP y qué **no** instalar.
4. [`AGENTS.md`](AGENTS.md) — Contrato de comportamiento para agentes de IA.
5. [`BACKLOG_MVP1.md`](BACKLOG_MVP1.md) — Implementación en cinco gates.
6. `specs/`, `examples/`, `infra/` — Balance propuesto, manifest de assets y Compose local.
7. [`Reinos_de_la_Frontera_MVP2/`](Reinos_de_la_Frontera_MVP2/PRD_MVP2.md) — PRD, GDD táctico, ADR-0021…0037, backlog y plan de QA del MVP 2 (batallas RTS por formaciones).

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
| `apps/battle-server` | **MVP 2.** Salas tácticas Colyseus 0.18 (ADR-0022): tick fijo 10 Hz, tickets de un uso, niebla de guerra, reconexión; sin acceso a la BD del mundo |
| `packages/tactical-sim` | **MVP 2.** Simulación táctica pura y entera por formaciones, navegación 2.5D, doctrina, replay y tickets HMAC |

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

**Entrenamiento táctico (MVP 2, Gate 1):** con el battle-server levantado (:2567; Vite lo expone bajo `/battle` con WebSocket), pulsa **⚔ Entrenamiento táctico** en la pantalla de mundos. Puedes luchar contra la doctrina (IA de reglas) o crear un duelo con código para otro jugador. El entrenamiento **nunca** modifica un mundo (ADR-0037). Variables en `.env.example` (`TACTICAL_*`, `BATTLE_*`); las claves de ejemplo son solo de desarrollo.

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
