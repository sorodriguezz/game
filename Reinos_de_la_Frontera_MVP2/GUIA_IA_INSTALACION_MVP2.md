# Instalación y operación de agentes de IA — Reinos de la Frontera MVP 2

**Estado:** guía para ejecutar por el desarrollador/agente; comandos verificados en documentación del proveedor a 2026-11-04, **no ejecutados** aquí.  
**Prerequisito:** código funcional del MVP 1 en monorepo `pnpm`; leer `PRD_MVP1.md` y ADR-0001..0020 antes de modificar. **No crear otro juego desde cero.**

## 1. ¿Qué instalar exactamente?

| Componente | MVP 1 | MVP 2 | Obligación |
|---|---|---|---|
| Node.js y pnpm | Ya instalados | Reusar, fijar versiones | Sí |
| React / Vite / PlayCanvas React | Ya instalados | Reusar renderer RTS | Sí |
| NestJS y PostgreSQL | Ya instalados | Reusar backend/worker | Sí |
| Vitest / Playwright | Ya instalados | Ampliar e2e/capturas | Sí |
| Docker Compose | Ya instalado | Incorporar proceso de batalla | Sí |
| Colyseus (`colyseus`) | No instalado | **Nuevo servidor autoritativo** | Sí |
| Colyseus SDK (`@colyseus/sdk`) | No instalado | **Cliente en `apps/web`** | Sí |
| `@colyseus/schema` | No instalado | Estado de room tipado | Sí / transitorio según scaffold |
| Skills oficiales Colyseus | No instaladas | Se añaden al agente | Recomendado |
| PlayCanvas Skills | Ya existentes | Actualizar, no duplicar | Recomendado |
| Blender + MCP | Ya en pipeline | Actualizar a `mcp-for-blender` | Recomendado |
| glTF Transform | Ya en pipeline | Reusar | Sí para assets |
| Redis / Kafka / BullMQ | No | **No** por defecto | No |
| Kubernetes, GPU producción, SaaS IA en runtime | No | **No** | No |

Las skills son **instrucciones para agentes**, no dependencias que se ejecutan en el juego. Los MCP permiten controlar herramientas de desarrollo; no deben quedar expuestos en producción.

## 2. Revisar la base antes de crear nada

Ejecutar desde la raíz del repositorio M1:

```bash
node --version
pnpm --version
docker compose version
pnpm -r list --depth -1
pnpm -r exec tsc --noEmit # si cada workspace define proyecto TS
pnpm -r test              # si cada workspace define script de test
```

- Usar Node.js 24 reciente, pero comprobar primero los mínimos de las versiones fijadas.
- **No** ejecutar scaffold de MVP 1 de nuevo. La versión oficial de `create-playcanvas` exige Node >=22.23.2 para el generador; aquí ya existe el proyecto.
- Crear rama `feat/mvp2-tactical-core` y baseline de tests/benchmarks.
- Inventariar `packages/game-rules`, `packages/game-config`, `packages/contracts`, tablas `battle_results/battle_snapshots`, scripts `pnpm` y `docker-compose` existentes.
- No aplicar comandos con `--force`, borrado de assets o migraciones destructivas sin revisión.

## 3. Colyseus: prototipar antes de integrarlo

La documentación oficial de Colyseus incluye un preset con red autoritativa de tick fijo y prueba de reconexión. **Para exploración en una carpeta temporal**:

```bash
npm create colyseus-app@latest ./poc-colyseus -- --preset realtime-action --yes
cd poc-colyseus
npm start
```

Usar este POC para aprender la API **actual**; no copiar su sistema de autenticación/BD ni mover el código M1 dentro. Luego integrar solo componentes verificados al monorepo existente.

En la raíz existente:

```bash
mkdir -p apps/battle-server
# Crear package.json, tsconfig y scripts del nuevo workspace, bajo revisión.
cd apps/battle-server
pnpm add colyseus @colyseus/schema
pnpm add -D typescript tsx @types/node
cd ../web
pnpm add @colyseus/sdk
cd ../..
```

> Si el scaffold ya instaló alguna dependencia, no añadirla dos veces. Verificar las API con `pnpm why colyseus` y documentación de versión instalada. Colyseus 0.18+ difiere de tutoriales antiguos; preferir `defineServer`, `defineRoom`, `schema()` y la documentación compatible con el lockfile. `tsx` es herramienta de desarrollo, no requisito de producción si compilas JS.

**Responsabilidades:**
- `apps/battle-server`: room, autenticación del ticket, tick, simulación efímera, estado difundido y resultado preparado.
- `apps/api`: elegibilidad, consentimiento, snapshots, reservas, emisión del ticket, commit canónico y consultas de informes.
- `apps/worker`: expiraciones, reconciliación, fallback AUTO, limpieza de reservas y outbox.
- `apps/web`: cámara, selección, controles, SDK Colyseus y render PlayCanvas.
- `packages/game-rules`: fórmulas puras compartidas; **sin** conexiones a DB ni motor gráfico.
- `packages/contracts`: validaciones runtime y contratos de mensajes versionados.

## 4. Skills oficiales del agente

### Colyseus: instalación para agentes de código

Desde la raíz del proyecto:

```bash
npx skills add colyseus/skill
```

Documentación oficial: https://docs.colyseus.io/getting-started

### PlayCanvas

Si MVP 1 ya generó `.agents/skills` / `.claude/skills`, **no reinstalar a ciegas**. Si no están presentes:

```bash
npx skills add playcanvas/skills
```

No combinar instalación tipo plugin y skills para el mismo agente: evita duplicar contexto. Referencia: https://github.com/playcanvas/skills

### MCP de Blender (comunitario; cambio de nombre)

El proyecto está ahora publicado bajo el paquete `mcp-for-blender` (antes `blender-mcp`), aunque la denominación vieja puede seguir funcionando. Tras instalar `uv` por método oficial, registrar según agente:

```bash
# Claude Code
claude mcp add blender uvx mcp-for-blender

# O Codex, NO ambos si usarán la misma sesión Blender simultánea
codex mcp add blender -- uvx mcp-for-blender

# Addon de Blender
uvx mcp-for-blender install-addon
```

Abrir Blender y habilitar el addon; mantener interfaz en localhost y configurar modo seguro cuando sea compatible, pues MCP puede ejecutar Python. Revisar cuidadosamente comandos con acceso al disco, red o terminal.

**Referencia actual:** https://github.com/ahujasid/mcp-for-blender

### MCP de PlayCanvas Editor (solo si se usa editor hospedado)

```bash
# Claude Code
claude mcp add playcanvas -- npx -y @playcanvas/editor-mcp-server

# O Codex
codex mcp add playcanvas -- npx -y @playcanvas/editor-mcp-server
```

Este MCP actúa sobre proyectos abiertos en **PlayCanvas Editor**, no sobre cualquier repo React/PlayCanvas local. Si el proyecto M1 es `code-first` con Vite, usar PlayCanvas Skills + Playwright/capturas sin agregar este MCP. Referencia: https://developer.playcanvas.com/user-manual/editor/mcp-server/

## 5. Organización mínima del proyecto existente

```text
apps/
  web/                  # Ya existe; agrega /battle y cliente Colyseus
  api/                  # Ya existe; módulo tactical-battles
  worker/               # Ya existe; expiraciones y reconciliación
  battle-server/        # NUEVO: Colyseus, sin escribir en DB del mundo
packages/
  game-rules/           # Ya existe; ampliar reglas de formación/tick
  game-config/          # Ya existe; versionar reglas y mapas
  contracts/            # Ya existe; DTO/tipos/eventos/validación
  asset-pipeline/       # Ya existe; validar rig/GLB y LOD
  battle-simulator/     # Nuevo SOLO si los módulos ameritan extracción
assets/battlefields/    # Llanura, paso y defensa fortificada
infra/                  # Componer servicio Docker y proxy WSS
```

Evitar crear `packages/battle-simulator` antes de que exista lógica real reutilizada entre tests y server; inicialmente puede residir en `apps/battle-server/src/simulation` con contratos puros.

## 6. Configuración recomendada

Archivo `.env.example` (sin secretos reales):

```dotenv
TACTICAL_BATTLES_ENABLED=false
TACTICAL_MAX_ROOMS=2
TACTICAL_MAX_FORMATIONS_PER_SIDE=12
TACTICAL_INVITE_TIMEOUT_SECONDS=20
TACTICAL_MATCH_MAX_SECONDS=300
TACTICAL_RECONNECT_SECONDS=30
TACTICAL_TICK_HZ=10
TACTICAL_JOIN_TICKET_TTL_SECONDS=60
BATTLE_SERVER_PORT=2567
BATTLE_SERVER_PUBLIC_URL=wss://battle.example.invalid
BATTLE_INTERNAL_API_URL=http://api:3000
# Definir en gestor de secretos, nunca en git:
# BATTLE_INTERNAL_SERVICE_TOKEN
# BATTLE_TICKET_SIGNING_KEY
```

Los nombres y valores son una **propuesta del proyecto**, no variables mágicas entendidas por Colyseus. La aplicación deberá leerlas con validación de esquema y límites. No permitir URL pública sin TLS fuera de desarrollo.

El archivo de ejemplo completo está en [`examples/env.mvp2.example`](examples/env.mvp2.example).

## 7. Docker y producción mínima

- Mantener el `docker compose` de M1 con API, worker y PostgreSQL.
- Añadir **un** servicio `battle-server` con compilación Node independiente, health check, límite de memoria y red interna.
- Publicar WSS mediante proxy HTTPS, con upgrade `Connection/Upgrade` correcto. No exponer PostgreSQL al público.
- Las invitaciones nuevas solo se habilitan cuando `battle-server` pasa `ready` y existe margen de capacidad; la API aún funciona cuando se cae.
- No ejecutar más procesos Colyseus sin plan de presencia/driver compartidos. Documentación: https://docs.colyseus.io/deployment

Se incluye un ejemplo de servicio para integrar manualmente en compose M1: [`examples/battle-server.compose.fragment.yml`](examples/battle-server.compose.fragment.yml). **No es compose autónomo**.

## 8. Validación artística de una batalla

El agente debe producir en este orden:

1. Aprobación de escena/estilo 3D de una **llanura** con modelos finales (sin cubos/palitos).
2. Inspección de GLB, escala en metros, pivotes, rigs, clips y licencias.
3. Caminar/atacar/recibir impacto/morir/retirarse con materiales PBR y alineación de pies.
4. Renderer de formaciones con instancing o técnicas equivalentes; por cada formación, un único estado de simulación.
5. Capturas de dos cámaras y dos resoluciones, profiling GPU/CPU, draw calls, memoria y tamaño total descargado.
6. Conexión real con estado de Colyseus y comprobación de que un input adversarial no produce cambio del mundo.

No aceptar como completado un vídeo renderizado que no provenga del proyecto ejecutable. No gastar créditos de generación 3D si los assets del MVP 1 ya sirven.

## 9. Checklist de seguridad del agente

- No seguir tutoriales de Colyseus 0.14/0.15 cuando el lockfile instala 0.18+.
- No crear PostgreSQL adicional por sala, ni redis/cache sin métricas.
- No dar capacidad de actualizar recursos desde el cliente ni desde Colyseus.
- No pegar secretos de staging/producción en prompts, scripts, capturas ni CI.
- Rechazar órdenes no autorizadas, fuera de map, spam de input y ticket de otro mundo.
- Comprobar que la sala no puede seguir después del cierre de temporada.
- Correr suite M1 en cada PR que toca `packages/game-rules`, `packages/contracts` o `apps/api`.
- Anotar herramientas instaladas y versiones efectivas en lockfile. Los comandos de esta guía son instrucciones, no prueba de instalación.

## 10. Prompt de arranque listo para el agente

```text
Actúa como el equipo técnico del juego Reinos de la Frontera. Lee primero
PRD_MVP1.md, ADR-0001 a ADR-0020, PRD_MVP2.md, ADR-0021 a ADR-0037,
AGENTS.md y BACKLOG_MVP2.md. NO implementes directamente PVP persistente.
Comienza por Gate 0: inventario de código y pruebas, diagrama del flujo M1,
benchmark visual con 24 formaciones y plan aditivo de migraciones.
Verifica versiones de dependencias y API Colyseus instalada; instala SOLO
lo aprobado en ADR-0022. Mantén PostgreSQL como única fuente de verdad.
Entrega por tarea: cambios, tests reales ejecutados, screenshots verificadas,
resultado de lint/typecheck y evidencia de no-regresión MVP 1.
Nunca cambies reglas de Maravilla 100, PNA, premiación semanal o economía
sin ADR y pruebas. Ante duda, implementa entrenamiento RTS aislado primero.
```

## 11. Fuentes oficiales

- Colyseus: https://docs.colyseus.io/getting-started/server
- Colyseus Skills: https://docs.colyseus.io/getting-started
- Colyseus SDK: https://docs.colyseus.io/getting-started/typescript
- Colyseus state: https://docs.colyseus.io/state
- Colyseus reconnection: https://docs.colyseus.io/room/reconnection
- PlayCanvas Skills: https://github.com/playcanvas/skills
- PlayCanvas MCP: https://developer.playcanvas.com/user-manual/editor/mcp-server/
- Blender MCP: https://github.com/ahujasid/mcp-for-blender
