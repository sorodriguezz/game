# ADR-0036: Rollout por mundo, fallback y migraciones aditivas

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** una actualización táctica no puede destruir el progreso de una temporada o impedir la victoria de Maravilla.

**Decisión:** flags `TACTICAL_BATTLES_ENABLED`, `TACTICAL_MAX_ROOMS`, `TACTICAL_ELIGIBILITY`, `TACTICAL_INVITE_TIMEOUT`. Publicar primero duelos de entrenamiento, luego un mundo de prueba, después una proporción pequeña de encuentros elegibles en un mundo beta. Migraciones DB aditivas y expand/contract sin borrado inmediato. Rollback desactiva invitaciones nuevas y resuelve pendientes con política AUTO.

**Alternativas:** activación global en todos los mundos (alto riesgo); migraciones destructivas (rollback imposible); degradación con batallas indefinidas (bloqueo).

**Consecuencias:** más fases de despliegue y mantenimiento de compatibilidad, con incidentes acotados y control.

**Invariantes / pruebas:** rollback bajo carga, resultado único en salas que estaban activas, cambios de configuración por mundo persistidos, controles de permisos administrativos.

**Revisar si:** funcionamiento estable y métricas permiten adopción general.
