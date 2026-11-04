# Plan de skills propias para agentes

Son **skills que debe crear la IA en el repositorio**, no dependencias públicas que se puedan instalar con ese nombre.

Cada `SKILL.md` tendrá: propósito, precondiciones, entradas, procedimiento, validaciones, reglas de seguridad, ejemplos de uso, criterios de aceptación, archivos permitidos y archivos prohibidos.

| Skill | Archivos prioritarios | Pruebas obligatorias |
|---|---|---|
| architecture-guard | packages/*, apps/*, docs/ADR | Límites de módulos, no cross-world |
| game-domain-rules | packages/game-rules | Misma entrada = mismo resultado |
| postgres-event-worker | apps/worker, packages/db | Crash/retry, locks, reconciliation |
| playcanvas-scene-builder | apps/web, assets | Capture visual + FPS + GLB |
| blender-asset-qa | assets, manifests | Pivote, colisiones, LOD, licencias |
| world-map-naval | game-rules, world generator | No rutas imposibles, puertos válidos |
| gameplay-balance | packages/catalog, tests/sim | Equidad y distribuciones |
| alliance-diplomacy | modules/diplomacy | PNA y cooldown, roles |
| weekly-leaderboards | rankings/awards | No duplicación, cambios de alianza |
| wonder-victory | wonders/worlds | Carrera por nivel 100, cierre único |

**Norma:** cada skill debe especificar cuándo detenerse, qué no modificar y cuándo pedir revisión humana. Nunca habilitar ejecución automática de scripts arbitrarios obtenidos de Internet.
