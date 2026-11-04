# ADR-0022: Colyseus como servidor de salas tácticas aislado

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** el RTS necesita WebSocket bidireccional, habitaciones, visibilidad, reconexión, netcode y un estado autoritativo. NestJS no proporciona automáticamente todo el ciclo de una sala de videojuegos.

**Decisión:** añadir `apps/battle-server` como proceso Node/TypeScript **Colyseus** separado, pero dentro del mismo monorepo. Empezar con un proceso/instancia, una sala por batalla y SDK cliente en `apps/web`. Compartir DTO y reglas puras; no compartir las conexiones DB con la UI.

**Alternativas:** WebSocket manual en NestJS (más código de red y reconexión); WebRTC P2P (autoridad y conectividad complejas); Photon/servicio administrado (costo y dependencia); Colyseus Cloud de inicio (innecesario).

**Consecuencias:** dependencia nueva justificada, proceso y puerto WSS adicionales, contrato de autenticación entre API y servidor táctico. Aún no es un conjunto de microservicios de negocio.

**Invariantes / pruebas:** caída de Colyseus ⇒ nuevas batallas AUTO; conexión client SDK con token; room no puede autoasignarse tropas ni alterar inventario; métricas de salas/ticks.

**Revisar si:** el RTT p95, saturación por tick o recuperación de salas muestran necesidad real de clustering. Si se escala a varios procesos, evaluar presencia y driver compartidos según documentación oficial.
