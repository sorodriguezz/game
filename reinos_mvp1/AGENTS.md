# AGENTS.md — Reinos de la Frontera

Estas reglas se aplican a todo agente que trabaje en este repositorio.

## Contexto obligatorio
1. Leer `PRD_MVP1.md`.
2. Leer `docs/adr/README_ADR.md` y las ADR relacionadas con el cambio.
3. Leer `BACKLOG_MVP1.md` y el catálogo de assets/reglas pertinentes.
4. Si faltan datos de balance, usar una propuesta parametrizada y documentarla; no inventar una regla irrevocable.

## Reglas innegociables
- MVP 1 = temporada jugable; no incluir batallas tácticas en tiempo real ni héroes.
- No añadir Redis, Valkey, BullMQ, Kafka, Kubernetes, Colyseus o microservicios sin ADR nueva respaldada por medición.
- PostgreSQL es fuente de verdad; worker de PostgreSQL para eventos vencidos.
- Backend valida cada mutación, permisos, mundo, recurso, ejército, ataque, diplomacia y premio.
- `world_id` en agregados, claves compuestas y filtros; no cruzar recursos/jugadores de mundos distintos.
- Idempotencia en órdenes, jobs, recompensa, combate y cierre de temporada.
- Game rules son puras y deterministas; semillas/versiones explícitas.
- IA generativa se usa en desarrollo de código/assets; NPC del mundo usan reglas deterministas.
- Los gráficos finales no son placeholders, cubos o palitos; assets reconocibles, PBR y revisados visualmente.
- No modificar balance de un mundo en curso sin migración/reglas/versionado aprobados.
- No commit de secrets, tokens, licencias privadas ni assets con procedencia desconocida.

## Workflow de tarea
1. Identificar FR/ADR implicadas y criterio de aceptación.
2. Proponer archivos, contratos y tests antes de editar.
3. Implementar cambio más pequeño que satisfaga la historia.
4. Ejecutar format/lint/typecheck/tests relevantes; recopilar resultados reales.
5. Para 3D: inspección GLB, captura real y métricas de escena.
6. Revisar concurrencia/idempotencia/seguridad/cross-world si hay datos.
7. Entregar resumen, evidencia, riesgos y siguiente historia desbloqueada.

## Condiciones de salida por tipo
- **Economía:** test de precisión, saldo no negativo, dos gastos simultáneos, reintento.
- **Movimientos:** no doble gasto de tropas, ETA autoritativo, llegada única, ruta válida.
- **Combate:** mismo snapshot+semilla+versión = mismo resultado, operación aplicada una vez.
- **Diplomacia:** rol permitido, firmas dobles, PNA activo e inactivo, misma alianza/mundo.
- **Rankings:** snapshot estable, una entrega semanal, protección contra duplicación.
- **Maravillas:** 100 niveles, condiciones de victoria, único ganador ante carrera.
- **3D/assets:** calidad en motor, escala, pivotes, PBR, colisión, rig/LOD según tipo y licencia.

## Organización
- No mezclar motor gráfico con el dominio autoritativo.
- Mantener paquetes `game-rules`, `contracts`, `game-config` independientes de NestJS/React.
- Solicitar ADR nueva cuando cambiar un límite o tecnología sea necesario.
