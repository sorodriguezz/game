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
