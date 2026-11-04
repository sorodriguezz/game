# Guía de instalación — IA, herramientas, MCP y pipeline 3D — MVP 1

**Versión:** 1.0 · **Fecha:** 2026-11-03 · **Estado:** Plan de instalación; no implica que los comandos hayan sido ejecutados.  
**Propósito:** crear el proyecto con un agente de código (Claude Code **o** Codex), PlayCanvas React, NestJS, PostgreSQL y Blender, sin servicios innecesarios.

## 1. Principio rector

**IA en desarrollo, NO en cada acción del juego.** El agente crea código, assets, pruebas, arquitectura y documentación. La economía, NPC y combates en producción son algoritmos deterministas en TypeScript sobre PostgreSQL. No pagar llamadas de IA por aldeano, ataque o viaje.

## 2. Instalación mínima (imprescindible)

| Producto | ¿Instalar? | Uso |
|---|---|---|
| Node.js 24 reciente | Sí | Toolchain de frontend, NestJS y MCP; comprobar requisitos concretos del CLI |
| pnpm | Sí | Monorepo y paquetes |
| Git | Sí | Versionado/PR |
| Docker Desktop/Engine + Compose | Sí | PostgreSQL local y pruebas integración |
| PostgreSQL | Sí, por contenedor | Fuente de verdad y eventos diferidos |
| Editor VS Code / CodeFlow | Uno | IDE; el agente funciona en terminal |
| Claude Code **o** Codex | Uno basta | Agente desarrollador principal |
| PlayCanvas + `@playcanvas/react` | Sí | Web 3D |
| Blender | Sí | Corrección/rig/texturas/GLB |
| glTF Transform | Sí | Inspección y optimización GLB |
| Vitest + Playwright | Sí | Tests unitarios/e2e y capturas |
| MCP para Blender | Recomendado | Dar control 3D al agente |
| MCP de PlayCanvas Editor | Opcional | Usar solo si adoptamos el editor en nube; no necesario para proyecto code-first |
| Hunyuan3D local | Opcional | Generar assets en RTX 4090; validar licencia |
| Meshy / Tripo | Opcional | Sustituir/acompañar generador local; no contratar ambos |
| Cloudflare R2/CDN | Posterior | Hosting estático en alfa pública |
| Redis/Valkey/BullMQ/Colyseus | **No instalar en MVP 1** | Posible ampliación medida, no requisito inicial |

### Requisitos de versión
- PlayCanvas React y `create-playcanvas` requieren Node **22.23.2 o superior** según la documentación actual; Nest CLI moderno puede imponer requisitos adicionales. Preferir Node 24 actualizado en todos los proyectos. Verificar con `node -v` antes de scaffolding.
- Recomendable usar una sola versión fijada con `.nvmrc` o equivalente y lockfile.
- Preparar Blender 3.0+ y Python compatible con MCP de Blender; instalar desde páginas oficiales.

## 3. Primer arranque de proyecto

### 3.1 Verificaciones

```bash
node --version
corepack --version
pnpm --version
git --version
docker --version
docker compose version
```

Si pnpm no está disponible, habilitarlo mediante Corepack o instalarlo siguiendo la documentación oficial de pnpm. No mezclar npm y pnpm para dependencias del monorepo una vez creado.

### 3.2 Crear cliente web (scaffold oficial)

Desde una carpeta de trabajo vacía:

```bash
mkdir reinos-de-la-frontera
cd reinos-de-la-frontera
mkdir -p apps packages
npm create playcanvas@latest apps/web -- -f react
```

Sigue prompts de starter y valida archivos creados. `create-playcanvas` instala las **PlayCanvas Skills** en las carpetas de agente compatibles por defecto: **no duplicarlas** con `npx skills add` si ya existen. Instala dependencias del web según el gestor seleccionado y ejecuta su script `dev`.

Si ya tienes un proyecto React y no usas scaffold:

```bash
pnpm add @playcanvas/react playcanvas
npx skills add playcanvas/skills
```

El comando manual anterior se ejecuta dentro del workspace del frontend, no indiscriminadamente en la raíz. Para instalar skills en proyecto existente, colocarte en la raíz y revisar destino de instalación.

### 3.3 Crear backend NestJS

Desde `apps/` (la CLI creará su carpeta `api`):

```bash
cd apps
npx @nestjs/cli new api --package-manager pnpm --skip-git
cd ..
```

El asistente del CLI puede preguntar ESM/CommonJS; para este proyecto elegir **ESM** si versiones de dependencias actuales y scripts lo permiten; mantenerlo uniforme dentro del backend. No activar NestJS Observe de pago por defecto. Comprobar servidor HTTP en local con ruta `GET /health` antes de crear negocio.

### 3.4 Crear workspace pnpm

En raíz, completar `package.json` privado y agregar:

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Paquetes iniciales:
- `packages/game-rules`: funciones puras, sin NestJS, BD ni PlayCanvas.
- `packages/contracts`: DTO/esquemas tipados entre front y back.
- `packages/game-config`: reglas/balance por versión.
- `packages/asset-pipeline`: validaciones de assets.

Agregar `apps/worker` solo al implementar la primera cola de eventos; puede reutilizar composición de servicios del backend sin importar rutas HTTP.

### 3.5 Base de datos PostgreSQL local

En este paquete se adjunta `examples/compose.postgres.yml` de referencia. Al usarlo en desarrollo:

```bash
docker compose -f examples/compose.postgres.yml up -d
docker compose -f examples/compose.postgres.yml ps
```

No exponer PostgreSQL públicamente ni subir credenciales. Las credenciales de `compose` son solo de desarrollo. En producción usar secretos y copias de seguridad externas.

### 3.6 Drizzle + PostgreSQL

Instalar `drizzle-orm`, `pg`, `drizzle-kit`, `@types/pg` según el workspace; mantener versión **estable compatible** fijada en lockfile. La documentación oficial puede mostrar versiones RC; no asumir que una release candidate es la elección más segura. Para procesos críticos usar SQL explícito dentro de transacciones.

```bash
# Ejecutar dentro de apps/api (o paquete de persistencia dedicado)
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg
```

Crear migraciones desde esquema y verificar rollback/restauración en una BD de prueba; no usar `push` a producción sin revisión.

## 4. Conectar agentes de código

### 4.1 Claude Code

Usa tu suscripción y Claude Code CLI instalado siguiendo instrucciones oficiales de Anthropic; autenticar y verificar comando:

```bash
claude --version
claude
```

### 4.2 Codex

Alternativa o revisor secundario. Instalar/autenticar mediante documentación oficial de Codex; verificar:

```bash
codex --version
codex
```

**No hace falta pagar dos agentes simultáneos.** Uno desarrolla, CI y revisión independiente verifican. Si se dispone del segundo, asignarle revisión, no cambios conflictivos sobre el mismo árbol de trabajo.

### 4.3 PlayCanvas Skills (oficiales)

En el scaffold oficial ya vienen incluidas. En proyectos existentes:

```bash
npx skills add playcanvas/skills
```

Algunas skills disponibles: `build-app`, `apply-conventions`, `find-examples`, `load-assets`, `inspect-glb`, `calibrate-model`, `assemble-scene`, `configure-animation`, `light-scene`, `verify-pixels`, `reduce-draw-calls`. No son paquetes de runtime. Abrir conversación nueva tras actualizar para que el agente las descubra.

### 4.4 PlayCanvas Editor MCP (oficial, **opcional**)

Solo si se quiere que el agente modifique un proyecto abierto en **PlayCanvas Editor** (es independiente de editar directamente el código React local).

```bash
# Claude Code
claude mcp add playcanvas -- npx -y @playcanvas/editor-mcp-server

# Alternativa Codex
codex mcp add playcanvas -- npx -y @playcanvas/editor-mcp-server
```

En PlayCanvas Editor abrir el proyecto, botón MCP, conectar puerto **52000** por defecto. No conceder operaciones destructivas sin checkpoint. El MCP manipula el proyecto del Editor conectado; no asumir que modifica automáticamente el monorepo.

### 4.5 Blender MCP (comunitario, paquete actual `mcp-for-blender`)

**Recomendado:** instalar `uv` de Astral desde fuente oficial; por ejemplo en Mac con Homebrew:

```bash
brew install uv
```

En Windows con winget:

```powershell
winget install --id=astral-sh.uv -e
```

Después, conectar el servidor según el agente:

```bash
# Claude Code
claude mcp add blender uvx mcp-for-blender

# O Codex
codex mcp add blender -- uvx mcp-for-blender
```

Instalar el complemento en Blender:

```bash
uvx mcp-for-blender install-addon
```

En Blender: `Edit > Preferences > Add-ons`, habilitar **MCP for Blender**, abrir panel lateral `N` y comprobar servidor. Alternativamente el proyecto ofrece `uvx mcp-for-blender setup`, que configura las apps automáticamente después de revisar lo que instalará. **No ejecutar instaladores por `curl | sh` sin inspeccionar su contenido.** El MCP puede ejecutar código dentro de Blender: usar archivos de proyecto de prueba y permisos acotados.

## 5. Generación de modelos: pipeline recomendado

1. Crear `ART_DIRECTION.md`: paleta, materiales, siluetas, arquitectura por civilización, escala de humano y formato de cámara.
2. Crear una referencia ilustrada del mismo edificio desde varios ángulos (proceso manual/IA visual).
3. Generar mesh con Blender + MCP y opcionalmente Hunyuan3D local en RTX 4090; no imponer un proveedor de pago.
4. Corregir topología, UV, deformaciones, pivote, proporciones y colisiones.
5. Texturas PBR con tamaños y materiales coherentes; animaciones para unidades.
6. Exportar `.glb` con nombres y convenciones consistentes.
7. Inspección CLI, optimización y capturas dentro de PlayCanvas.
8. Guardar asset manifest: licencia, fuente, creador, técnica/modelo, versión, tamaño, triángulos, materiales, clips, thumbnail y resultado de validación.
9. Aprobar asset solo al cumplir checklist visual/técnico.

### glTF Transform

```bash
npm install --global @gltf-transform/cli

gltf-transform inspect assets/raw/castillo.glb
gltf-transform optimize assets/raw/castillo.glb assets/optimized/castillo.glb --texture-compress webp
```

**Advertencia:** no aplicar simplificación agresiva a personajes con rig o animaciones sin validar deformaciones; el comando de optimización combina varias transformaciones y sus defaults no son apropiados para todo asset.

### Hunyuan3D local

Repositorio: https://github.com/Tencent-Hunyuan/Hunyuan3D-2  
El repositorio declara aproximaciones de VRAM de 6 GB para shape y 16 GB para shape+textura en Hunyuan3D-2. La RTX 4090 de 24 GB puede probar este pipeline **fuera de producción**, con instalación y dependencias conforme al README oficial. Revisar términos de licencia y permisos comerciales; no se incluye un instalador de terceros sin validar compatibilidad de CUDA/PyTorch.

## 6. Testing, lint y evaluación de IA

```bash
# Dentro de cada workspace correspondiente
pnpm add -D vitest

# Dentro del proyecto web, siguiendo prompts
pnpm create playwright
```

Al finalizar cada historia, el agente debe aportar:
- Test unitario de dominio (si hay reglas).
- Test de integración PostgreSQL real (si hay persistencia/colisiones).
- Test de acceso entre mundos y permisos.
- Prueba de idempotencia con reintentos.
- Captura/validación visual para features 3D.
- Reporte de bundle/asset size y FPS en cambios gráficos importantes.
- Cambio mínimo, PR revisable y ADR nueva si se modifica una decisión.

No aceptar «todos los tests pasan» sin evidencia de ejecución y salida de tests.

## 7. Prompt principal para iniciar el trabajo con un agente

Copiar al agente desde la raíz del repositorio:

> Actúa como arquitecto y desarrollador principal de Reinos de la Frontera. Lee primero `PRD_MVP1.md`, `docs/adr/README_ADR.md`, los ADR completos, `AGENTS.md` y `BACKLOG_MVP1.md`. **No agregues tecnologías fuera de las ADR ni cambies el alcance silenciosamente.** Planifica Gate 0 y Gate 1; realiza commits pequeños, tests y evidencia visual. Prioriza primero un castillo, puerto, granja, barco y soldado realista-estilizado, luego dos ciudades persistentes, economía offline y un ataque autoritativo con defensor desconectado. Nunca uses cubos/palitos como resultado final, ni llames a LLM en runtime, ni instales Valkey/BullMQ/Colyseus/Kubernetes para el MVP 1. Si un asset IA presenta defectos, márcalo como no aprobado y corrígelo antes de integrarlo.

**Comportamiento del agente:** primero produce plan de archivos y contratos; después implementa pequeñas tareas; nunca afirma que algo funciona sin comandos y resultados reproducibles.

## 8. Seguridad del entorno del agente
- Nunca pegar claves privadas o tokens de proveedor en prompts/commits.
- MCP de Blender puede ejecutar Python y modificar archivos; ejecutarlo en proyectos y máquinas de desarrollo controlados.
- MCP Editor puede borrar o resetear recursos; comprobar permisos y copias antes de operaciones destructivas.
- No dar al agente credenciales de producción al comenzar.
- Dependencias y contenedores deben escanearse/actualizarse.
- Guardar binarios 3D de origen externo únicamente tras validar procedencia y licencia.

## 9. Costos/servicios que NO contratar al inicio

No es necesario contratar Unity/Unreal, servidores GPU, Kubernetes, Kafka, Redis Cloud, bases de datos duplicadas, Meshy **y** Tripo a la vez, ni un LLM para simular NPC. La primera demo usa desarrollo local y PostgreSQL Docker. En la alfa se evalúa VPS + backups + CDN según medidas reales.

## 10. Fuentes oficiales/verificadas (2026-11-03)

- PlayCanvas React/scaffold: https://developer.playcanvas.com/user-manual/react/getting-started/installation/
- PlayCanvas `create-playcanvas`: https://developer.playcanvas.com/user-manual/getting-started/start-with-create-playcanvas/
- Skills: https://developer.playcanvas.com/user-manual/getting-started/use-playcanvas-skills/
- Editor MCP: https://developer.playcanvas.com/user-manual/editor/mcp-server/
- Blender MCP (comunitario): https://github.com/ahujasid/mcp-for-blender
- glTF Transform: https://github.com/donmccurdy/glTF-Transform
- Hunyuan3D-2: https://github.com/Tencent-Hunyuan/Hunyuan3D-2
- NestJS CLI: https://docs.nestjs.com/cli/usages
- Drizzle: https://orm.drizzle.team/docs/get-started/postgresql-existing
- Playwright: https://playwright.dev/docs/intro
- Vitest: https://vitest.dev/guide/
