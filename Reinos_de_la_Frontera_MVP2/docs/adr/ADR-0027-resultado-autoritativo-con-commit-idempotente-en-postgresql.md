# ADR-0027: Resultado autoritativo con commit idempotente en PostgreSQL

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** una sala puede reenviar resultados y API reiniciarse en cualquier punto; aplicar dos veces bajas o botín corrompe el juego.

**Decisión:** `battle-server` prepara resultado firmado/autenticado y checksum; NestJS lo valida contra snapshot, identidad y versión. Una transacción PostgreSQL inserta `battle_results` con `encounter_id` único, descuenta bajas/libera reservas, aplica botín y publica eventos outbox de rankings/alianzas. Un repetido resultado idéntico retorna estado `APPLIED`; uno diferente es incidente, no sobrescribe.

**Alternativas:** Colyseus escribe directo en tablas M1 (mezcla propiedad de dominio); bus de mensajes como fuente de verdad (complejidad); aplicar resultado sin unicidad (corrupción).

**Consecuencias:** latencia de commit y reconciliación necesaria; propiedad del estado mundial preservada.

**Invariantes / pruebas:** envío duplicado/triple, crash antes/después de commit, dos workers concurrentes, replay de POST, conclusión de temporada durante commit, una sola contabilización de ranking.

**Revisar si:** requisitos de throughput de resultados exceden el diseño transaccional actual.
