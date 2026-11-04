# ADR-0021: Extender MVP 1 sin reescribir el motor persistente

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** MVP 1 ya decide economía, viajes, NPC, batallas automáticas, diplomacia, temporadas, rankings y maravillas. Un segundo motor propietario de esos datos produciría divergencias.

**Decisión:** MVP 2 es una extensión compatible por `feature flags`. `apps/api` y `apps/worker` mantienen autoridad sobre el mundo; `apps/battle-server` controla solamente instancias tácticas efímeras. Nuevas tablas/migraciones aditivas, sin alterar claves existentes ni convertir automáticamente ataques M1.

**Alternativas:** reescribir todo en motor MMO tiempo real (costo y riesgo intolerables); simular batallas en navegador (inseguro); incorporar microservicios generales (prematuro).

**Consecuencias:** un segundo proceso opcional, deuda de integración explícita y dos ritmos de operación. La caída del componente nuevo no debe impedir la partida estratégica.

**Invariantes / pruebas:** suite MVP 1 completa sin dependencias de Colyseus; feature flag apagada; misma batalla antigua mismo resultado; ausencia de mutaciones de tablas M1 desde la cuenta DB del servidor de batalla.

**Revisar si:** los perfiles de carga o límites de transacciones justifican segmentar dominios adicionales.
