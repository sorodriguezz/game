# Guía de instalación para agentes de IA — Reinos de la Frontera MVP 1.0

**Fecha de verificación de documentación:** 2026-11-03.  
**Objetivo:** instalar solamente herramientas que ayuden a generar código, assets 3D y pruebas de calidad; no contratar infraestructura ni IA de producción antes de validar el vertical slice.

> Importante: aquí se distinguen **comandos publicados oficialmente** de **estructura que deberá crear el agente**. No se afirma que este paquete ya incluya un repositorio compilado o un servidor operativo. Ejecuta y revisa comandos en tu entorno; las dependencias y versiones deberán quedar congeladas en `pnpm-lock.yaml`.

---

## 1. Decisión mínima de herramientas

### Imprescindible en desarrollo

| Capa | Software | Motivo |
|---|---|---|
| Agente de programación | Claude Code **o** Codex CLI | Plan, implementación y revisión: no necesitas ambos pagando |
| Runtime | Node.js >= 22.23.2 (preferir LTS actual compatible) | Requisito del scaffolder PlayCanvas React |
| Paquetes | pnpm | Monorepo y dependencias compartidas |
| Motor web | PlayCanvas React + Vite | Juego 3D en navegador |
| Backend | NestJS + TypeScript | API, motor de eventos y módulos |
| Datos | PostgreSQL en Docker | Estado de mundos y transacciones |
| Modelado | Blender | Arte 3D, ajustes, rig y exportación |
| GLB | glTF Transform CLI | Inspección y optimización |
| Pruebas | Vitest + Playwright Test | Reglas, API y visual/browser |
| Control versiones | Git | PR y revisión de cambios |

### Skills/MCP recomendados

| Herramienta | Prioridad | Uso | Nota |
|---|---|---|---|
| **PlayCanvas Skills** | Alta | Instrucciones de motor, escena, assets, pruebas visuales | El scaffolder oficial suele incluirlas; evita duplicarlas |
| **Playwright MCP** | Alta | Agente observa y prueba interfaz en navegador | No sustituye tests E2E versionados |
| **Blender MCP** (`mcp-for-blender`) | Alta para arte | Crear/modificar modelos y ejecutar operaciones Blender | Comunitario, requiere revisar ejecución de Python |
| **PlayCanvas Editor MCP** | Condicional | Manipular proyecto en Editor web | No es necesario para código local React; usar solo si se adopta Editor |
| **Hunyuan3D-2 local** | Opcional | Generación IA de mallas y texturas usando RTX 4090 | Setup pesado, licencia/verificación GPU |
| Meshy/Tripo | Opcional de pago | Generación donde el modelo local sea insuficiente | No contratar ambos de inicio |
| GitHub CLI (`gh`) | Opcional | PR/revisión desde terminal | No es MCP esencial |

### No instalar en MVP1

**No** Redis/Valkey, BullMQ, Colyseus, Kafka, RabbitMQ, AKS/Kubernetes, motores de búsqueda, MongoDB, servicios de inferencia GPU en producción ni proveedores de IA con cobro por partida. El worker de PostgreSQL y los combates automáticos son suficientes para el piloto.

## 2. Comprobar herramientas

```bash
node --version
npm --version
pnpm --version
git --version
docker --version
blender --version
```

Si Node no cumple el mínimo requerido, instala una versión LTS compatible usando el gestor de versiones habitual. `npm install -g pnpm` es una opción simple para instalar pnpm.

En macOS se puede usar Homebrew para Git, Blender y `uv`, pero no es requisito usar un Mac como máquina de generación. Para modelos IA locales exigentes, utilizar preferentemente el PC con GPU NVIDIA RTX 4090 y herramientas de CUDA/PyTorch compatibles.

## 3. Crear el repositorio base

### 3.1 Shell: carpetas del monorepo

```bash
mkdir reinos-de-la-frontera
cd reinos-de-la-frontera
mkdir -p apps packages assets/source assets/processed assets/manifests infra docs
printf 'packages:\n  - "apps/*"\n  - "packages/*"\n' > pnpm-workspace.yaml
git init
```

Agrega los documentos de este paquete a `docs/`, `AGENTS.md` a la raíz y `specs/` en raíz o como `packages/catalog`.

### 3.2 Frontend PlayCanvas React

El comando oficial de scaffolding es:

```bash
cd apps
npm create playcanvas@latest web -- -f react
cd ..
```

El creador puede hacer preguntas interactivas acerca del starter; seleccionar React/TypeScript. Los proyectos generados incluyen PlayCanvas Skills en carpetas para agentes compatibles. Verificar la estructura real antes de modificarla.

**No ejecutes `npx skills add playcanvas/skills` automáticamente si la plantilla ya incorporó esas mismas skills**. Para repositorios sin ellas, desde la raíz correspondiente:

```bash
npx skills add playcanvas/skills
```

Consulta: https://developer.playcanvas.com/user-manual/getting-started/use-playcanvas-skills/

### 3.3 API NestJS

Scaffolding oficial (desde `apps`):

```bash
cd apps
npx @nestjs/cli@latest new api --package-manager pnpm --skip-git
cd ..
```

La CLI actual puede preguntar por ESM/CJS y funcionalidades opcionales. Seleccionar ESM si todos los paquetes elegidos son compatibles; seleccionar **NO** en NestJS Observe por defecto, pues no hace falta un servicio externo para iniciar. La CLI puede generar Vitest por defecto en ESM.

**Trabajo para el agente después del scaffold**:
1. Crear `apps/worker` como proceso Node/TS separado, reutilizando los paquetes de reglas, contratos y DB; no duplicar la lógica en otra API.
2. Crear `packages/game-rules`, `packages/contracts`, `packages/catalog`, `packages/db`, `packages/asset-contracts`.
3. Normalizar nombres de los paquetes de workspace y scripts (`dev`, `build`, `test`, `lint`, `db:migrate`).
4. Crear validación de entorno y `env.example` sin secretos reales.
5. Agregar migrations SQL revisadas; comandos críticos con transacciones y locks.

Para capa SQL tipada, valorar Drizzle + `pg`; algunas guías oficiales muestran versiones RC, por lo que el agente debe escoger y fijar versiones compatibles **estables** si están disponibles y validar antes de instalar.

### 3.4 PostgreSQL local

Incluyo `infra/compose.dev.yaml`. Desde la raíz:

```bash
docker compose -f infra/compose.dev.yaml up -d
docker compose -f infra/compose.dev.yaml ps
```

El ejemplo usa contraseña **solo para desarrollo local**. No publicarlo sin cambiar credenciales, redes, volúmenes, TLS y copias de seguridad. Postgres se expone únicamente en `127.0.0.1` del host para evitar conexión pública accidental.

### 3.5 Tests (cuando el agente haya normalizado workspaces)

```bash
# En cada paquete de reglas que necesite Vitest:
pnpm add -D vitest

# En apps/web, para tests E2E automatizados:
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Los scripts y rutas definitivas de cada paquete deberán crearse tras el scaffold y verificarse con `pnpm --filter ... test`.

## 4. Configurar MCP por agente

### 4.1 Playwright MCP (recomendado)

Claude Code:

```bash
claude mcp add playwright npx @playwright/mcp@latest
```

Codex:

```bash
codex mcp add playwright -- npx @playwright/mcp@latest
```

La forma manual estándar para clientes compatibles es:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

La configuración pertenece al cliente MCP, no necesariamente a `package.json`. Fuente: https://playwright.dev/mcp/installation

### 4.2 Blender MCP (recomendado para arte)

**Atención a cambio de nombre:** el proyecto comunitario anteriormente conocido como `blender-mcp` publica el paquete nuevo **`mcp-for-blender`**. No usar tutoriales antiguos a ciegas.

Instalar primero `uv` usando el procedimiento oficial de https://docs.astral.sh/uv/getting-started/installation/ o Homebrew:

```bash
brew install uv
```

Configuración asistida, que detecta clientes y instala el add-on:

```bash
uvx mcp-for-blender setup
```

O instalación manual:

```bash
uvx mcp-for-blender install-addon
claude mcp add blender uvx mcp-for-blender
```

Para Codex:

```bash
codex mcp add blender -- uvx mcp-for-blender
```

Después abrir Blender, habilitar el add-on *MCP for Blender* y confirmar que el servidor del add-on esté iniciado. Solo permitir un cliente controlando el mismo servicio a la vez.

**Seguridad:** el MCP puede ejecutar operaciones de Blender/Python. Probarlo con un proyecto aislado, sin claves de producción, sin montajes de archivos sensibles y revisando las llamadas de alto riesgo.

Fuentes: https://github.com/ahujasid/mcp-for-blender ; https://github.com/ahujasid/blender-mcp

### 4.3 PlayCanvas Editor MCP (opcional)

Úsalo únicamente si el agente va a trabajar en el **PlayCanvas Editor abierto en navegador**. No es necesario para un proyecto puramente code-first con PlayCanvas React.

Claude Code:

```bash
claude mcp add playcanvas -- npx -y @playcanvas/editor-mcp-server
```

Codex:

```bash
codex mcp add playcanvas -- npx -y @playcanvas/editor-mcp-server
```

Luego abre el proyecto en PlayCanvas Editor y conéctalo mediante el botón MCP (puerto por defecto 52000). Mantén un solo servidor usando ese puerto. Fuente: https://developer.playcanvas.com/user-manual/editor/mcp-server/

**No mezclar sin un proceso definido**: la escena local React no aparece mágicamente dentro del editor cloud. Elegir superficie de autoría por tarea.

## 5. Herramientas de assets 3D y flujo de IA

### 5.1 Blender y formato GLB

Instalar Blender desde https://www.blender.org/download/ (aplicación gratuita). Mantener archivos `.blend` originales y exportaciones GLB separadas.

Instalar CLI de optimización:

```bash
npm install --global @gltf-transform/cli
```

Inspección y optimización ejemplo:

```bash
gltf-transform inspect assets/source/castle.glb
gltf-transform optimize assets/source/castle.glb assets/processed/castle.glb \
  --compress draco --texture-compress webp
```

Los parámetros de compresión son **ejemplo**, no receta universal. Verificar animaciones, morph targets, normales, materiales, calidad y decodificación en el motor antes de aprobar. Fuente: https://gltf-transform.dev/cli

### 5.2 IA local (opcional, no dependencia de compilación)

**Hunyuan3D-2**: https://github.com/Tencent-Hunyuan/Hunyuan3D-2

El repositorio oficial indica unos 16 GB de VRAM para forma + textura en la línea Hunyuan3D-2. La RTX 4090 de 24 GB puede ser útil para explorarlo, pero instalación, CUDA, PyTorch, componentes nativos, disponibilidad y licencias se deben verificar en el equipo real. **No fijar automáticamente dependencias GPU dentro del monorepo del videojuego**; usar una máquina/entorno de arte separado.

Secuencia recomendada para el agente de arte:
1. Generar hoja de estilo y vistas ortogonales consistentes.
2. Crear malla 3D local o mediante proveedor externo opcional.
3. Retopología/remesh, corregir puertas/torres/escalas y UV en Blender.
4. Crear PBR y colisiones, generar LODs.
5. Rig y clips de animación para personajes (si aplica).
6. Optimizar y validar GLB, registrar licencia/origen.
7. Hacer capturas desde el motor y comparar con el criterio de aceptación.
8. Solicitar revisión humana para assets centrales antes de aprobados.

Para edificios repetidos, **kit modular** es mejor que generar un asset completamente distinto para cada nivel. Ninguna imagen generada por IA equivale a un archivo GLB exportable por sí sola.

### 5.3 Contrato de asset

```yaml
asset_id: imperial_barracks_lvl1
kind: building
civilization: imperial_crown
source_file: assets/source/imperial_barracks_lvl1.blend
output_file: assets/processed/imperial_barracks_lvl1.glb
license: TO_BE_VERIFIED
units: meters
pivot: bottom_center
lods: [lod0, lod1, lod2]
clips: []
materials: [stone_pbr, oak_pbr]
qa:
  mesh_validated: false
  collision_validated: false
  visual_approved: false
  performance_verified: false
```

Asset con licencia `TO_BE_VERIFIED` no puede utilizarse en una publicación comercial.

## 6. Roles recomendados para la IA

**Un agente principal por fase**, y otros agentes como revisores o especialistas, no todos editando el mismo módulo a la vez.

| Rol | Autonomía | Responsable de |
|---|---|---|
| Arquitecto | Diseña y propone | ADR, contratos, backlog y revisión de seguridad |
| Backend | Implementa en rama | Mundo, transacciones, eventos y API |
| Gameplay | Implementa en paquete puro | Economía, combate, balance y simulador |
| World-builder | Implementa visual/algoritmos | Generador de mapa, navegación, ciudades |
| Art/Blender | Modela en aislamiento | Kit artístico, GLB, animaciones, QA |
| QA | Verifica de forma independiente | Vitest, integración, Playwright, fallos y concurrencia |
| Integrador | PR y documentación | Contratos compartidos, release, changelog |

No usar un MCP de generación gráfica en servidores de producción. Los agentes de arte trabajan con recursos y archivos locales, no con cuentas administrativas de mundo activo.

## 7. Skills propias necesarias (a crear, no paquetes existentes)

Cada skill está documentada en `agent/SKILLS-PLAN.md`; usar estándar `SKILL.md` con propósito, pasos, comprobaciones y ejemplos.

Orden recomendado:
1. `architecture-guard`: impide microservicios innecesarios, lógica en UI y violaciones de `world_id`.
2. `game-domain-rules`: diseña y prueba las reglas sin dependencias de Nest/React.
3. `postgres-event-worker`: idempotencia, locks, outbox y reconciliación.
4. `playcanvas-scene-builder`: assets GLB, cámaras, luces y escenas.
5. `blender-asset-qa`: procedencia, geometría, LOD, materiales y capturas.
6. `world-map-naval`: generación de mapa, rutas y puertos.
7. `gameplay-balance`: simulaciones y análisis de distribución de resultados.
8. `alliance-diplomacy`: PNA, confederaciones y permisos.
9. `weekly-leaderboards`: snapshots y premiación.
10. `wonder-victory`: Maravilla y cierre de mundo.

## 8. Secuencia de ejecución para Claude Code / Codex

### Paso A — Auditoría y diseño
- Leer `docs/PRD-MVP1.md`, `docs/ADR-MVP1.md` y `AGENTS.md` completos.
- Verificar compatibilidad de Node, pnpm, Nest CLI, PlayCanvas.
- Preparar estructura monorepo sin añadir servicios no aprobados.
- Crear contratos `catalog`, `game-rules`, `world_id`, `Idempotency-Key`.
- Escribir pruebas de reglas y concurrencia **antes** de operaciones complejas.

### Paso B — Vertical slice artístico
- Definir hoja de estilo de las dos civilizaciones.
- Generar un castillo, una granja, cuartel, puerto, barco, soldado y terreno.
- Importarlos a PlayCanvas, iluminar y documentar rendimiento.
- Capturar screenshots y verificar que no son bloques provisionales.

### Paso C — Vertical slice persistente
- Cuentas, aldea y economía offline.
- Construcción con evento diferido y migración SQL.
- Reclutamiento, envío de ataque, defensa offline y reporte.
- Prueba de caída/reintento y de mundo cruzado.

### Paso D — MVP completo
- Oasis, NPC, transporte naval, civilizaciones, hospitales/templo.
- Alianzas/PNA/confederaciones.
- Rankings semanales y premios.
- Maravilla 1–100, cierre de temporada y archivo.
- QA, carga, backups, restauración, moderación y alfa.

## 9. Definition of Done obligatoria para cambios generados por IA

- [ ] Compila y pasa lint/typecheck.
- [ ] Tests unitarios, integración y E2E pertinentes pasan.
- [ ] No altera recursos, tropas o premios fuera de transacción.
- [ ] Autorización y `world_id` se prueban.
- [ ] Existe test para reintento/fallo cuando se agrega un evento.
- [ ] Contratos/catálogos y versión de reglas actualizados.
- [ ] Capturas y métricas de performance para cambios 3D.
- [ ] Registro de licencia para nuevos assets.
- [ ] Ningún secreto, archivo `.env` real ni token de producción comprometido.
- [ ] PR incluye explicación, riesgos, screenshots cuando corresponda y rollback.

## 10. Fuentes y documentación de referencia

- `create-playcanvas`: https://developer.playcanvas.com/user-manual/getting-started/start-with-create-playcanvas/
- React/PlayCanvas: https://developer.playcanvas.com/user-manual/react/getting-started/installation/
- Skills oficiales: https://github.com/playcanvas/skills
- PlayCanvas Editor MCP: https://developer.playcanvas.com/user-manual/editor/mcp-server/
- NestJS CLI: https://docs.nestjs.com/cli/overview
- Blender MCP: https://github.com/ahujasid/mcp-for-blender
- Playwright MCP: https://playwright.dev/mcp/installation
- Vitest: https://vitest.dev/guide/
- Drizzle: https://orm.drizzle.team/docs/kit-overview
- glTF Transform: https://gltf-transform.dev/cli
- Hunyuan3D-2: https://github.com/Tencent-Hunyuan/Hunyuan3D-2
- Valkey (NO MVP1): https://valkey.io/download/
- BullMQ (NO MVP1): https://docs.bullmq.io/
