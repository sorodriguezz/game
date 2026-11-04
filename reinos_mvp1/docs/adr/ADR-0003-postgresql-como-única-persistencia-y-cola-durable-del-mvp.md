# ADR-0003: PostgreSQL como única persistencia y cola durable del MVP

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Las construcciones, ataques, viajes, NPC y premiaciones deben sobrevivir caídas sin duplicar operaciones. No conviene añadir Valkey/BullMQ antes de que haya necesidad real.

## Decisión
Usar PostgreSQL para estado y tabla `game_events` con `due_at`, `status`, `attempts`, `locked_at`, `lease_owner`, `idempotency_key`, `payload`, `world_id`. Workers toman lotes vencidos mediante `FOR UPDATE SKIP LOCKED` en transacción y marcan el resultado de negocio como aplicado en la misma transacción. Outbox transaccional para notificaciones externas. Reconciliación periódica de eventos vencidos y leases caducadas; backoff y dead-letter auditable.

## Consecuencias positivas
- Menos servicios, menos costes, semántica transaccional fuerte
- Fallos recuperables y trazabilidad del estado de los trabajos

## Consecuencias y riesgos
- Una tabla de eventos de alto volumen puede convertirse en cuello de botella
- Requiere diseñar polling, índices, reintentos y aislamiento
- SKIP LOCKED no equivale a entrega exactamente una vez; la operación debe ser idempotente

## Alternativas evaluadas
- Cron in-memory: pierde tareas
- BullMQ + Valkey: opción futura útil pero añadida complejidad
- Kafka: desproporcionado

## Señal de revisión
Revisar Valkey/BullMQ o colas dedicadas si la latencia, tasa de eventos o contención superan objetivos medidos.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
