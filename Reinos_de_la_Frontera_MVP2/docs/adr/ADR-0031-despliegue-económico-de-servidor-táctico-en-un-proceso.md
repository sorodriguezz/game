# ADR-0031: Despliegue económico de servidor táctico en un proceso

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** MVP 1 corre en VPS Linux Docker Compose con PostgreSQL; escalar automáticamente añade gastos de coordinación antes de tener demanda.

**Decisión:** una instancia `battle-server` con puerto interno y reverse proxy WSS; Node aislado del proceso NestJS, límites de CPU/memoria y salud. PostgreSQL sigue como única DB de negocio. No añadir Redis, Valkey, Kafka, K8s o Colyseus Cloud inicialmente. Medir capacidad y coste por sala.

**Alternativas:** desplegar cluster Colyseus con RedisPresence antes de medir (overengineering); correr simulación dentro del proceso API (ruido de CPU afecta economía); servicio SaaS (costo recurrente).

**Consecuencias:** capacidad limitada y punto único de falla del RTS, mitigado por fallback AUTO; VPS puede necesitar upgrade si se incrementan salas.

**Invariantes / pruebas:** saturación activa modo AUTO; `SIGTERM` drena donde se pueda; límites de room; balance económico M1 sano durante stress; evidencia en métricas.

**Revisar si:** exceder capacidad sostenible, necesidad de región múltiple o alta disponibilidad. Entonces revisar presence/driver compartidos conforme documentación Colyseus.
