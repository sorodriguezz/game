# AGENTS.md combinado — Reinos de la Frontera MVP 1 + MVP 2

**Precedencia:** las reglas M1 se conservan. ADR-0022 autoriza agregar exclusivamente `battle-server` Colyseus para MVP 2, una vez aceptada; no autoriza Redis/Kafka, etc. El alcance M1 sigue excluyendo combates tácticos; el alcance M2 los introduce con condiciones. En este paquete, los documentos M1 se ubican en `reference_mvp1/`.

---

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


---

# Addendum para agentes — MVP 2 (aplicar encima de `AGENTS.md` del MVP 1)

## Lectura obligatoria

1. `reference_mvp1/PRD_MVP1.md`, `reference_mvp1/ADRs_MVP1_COMPLETOS.md` y reglas M1 existentes en el repositorio.
2. `PRD_MVP2.md` y `GDD_COMBATE_TACTICO_MVP2.md`.
3. `docs/adr/README_ADR_MVP2.md` más ADR-0021..0037 pertinentes.
4. `BACKLOG_MVP2.md`, `PLAN_QA_MVP2.md` y contratos `contracts/`.
5. Versión de Colyseus y PlayCanvas fijada **en el lockfile**, no tutoriales antiguos.

## Prohibiciones

- No implementar modos tácticos obligatorios para defensores offline.
- No crear un segundo ledger económico ni tablas de resultados canónicos paralelas al MVP 1.
- No editar automáticamente producción, rankings, premios semanales, PNA/confederaciones ni Maravilla 100 para que «funcione» el RTS.
- No agregar Redis, Kafka, Kubernetes, GPU de servidor, motor gráfico nuevo ni LLM de ejecución sin ADR y benchmarks.
- No crear héroes, magia, equipamientos personales, unidades mágicas o compras que alteren poder.
- No pasar a `WORLD_PVP` sin entrenamiento `TRAINING` aprobado.
- No usar assets de terceros sin registrar licencia/procedencia ni publicar placeholders cúbicos como arte final.
- No exponer tickets, claves, puertos MCP locales o comandos de ejecución arbitraria a jugadores.

## Patrón de trabajo por historia

1. Señalar `FR2-xxx`, `ADR-xxxx`, `M2-Gx-yy` y lo que cambia en MVP 1.
2. Leer código real, contratos, tests y migraciones; no inventar carpetas o servicios si el repositorio difiere.
3. Proponer cambios mínimos y rollback antes de editar.
4. Implementar primero tests del dominio y los casos adversariales.
5. Desarrollar funciones puras que no dependan de PlayCanvas/Colyseus cuando sea posible.
6. Verificar con `lint`, `typecheck`, tests, e2e en dos navegadores, métricas y capturas reales.
7. Informar qué fue ejecutado, qué se omitió, riesgos y estado del gate.

## Reglas de ejecución táctica

- El snapshot se crea/autoriza en API/worker y queda inmutable.
- Colyseus recibe identidad y ticket de un uso con scope mundo/temporada/batalla/rol.
- Inputs deben incluir secuencia y pertenecer a unidades del jugador, con validación espacial.
- El tick es fijo y el server decide daño/posición; el cliente solo anima/interpola.
- Ante desconexión, aplicar doctrina, no derrota automática.
- Ante fallo fatal, seguir política de resolución y no conservar tropas bloqueadas indefinidamente.
- Resultado se confirma una sola vez en PostgreSQL y rankings/alianzas reutilizan el evento canónico.
- `TRAINING` jamás modifica el mundo persistente.

## Calidad 3D

Cada asset usado para batallas incluye manifiesto, licencia, GLB inspeccionado, escala y pivote, rig/animaciones, LOD, presupuesto de texturas, capturas realistas en PlayCanvas y test de rendimiento con varias formaciones.

## Evidencia para aceptar PR

- [ ] Suite M1 sin regresión.
- [ ] Pruebas de órdenes maliciosas y mundo incorrecto.
- [ ] Reintentos idempotentes / reservas concurrentes si toca persistencia.
- [ ] Capturas del juego ejecutado si toca 3D.
- [ ] Métricas de CPU/tick/latencia si toca room/simulación.
- [ ] Rollback y migraciones cuando toca despliegue.
- [ ] Sin secretos ni código arbitrario inseguro desde herramientas MCP.
