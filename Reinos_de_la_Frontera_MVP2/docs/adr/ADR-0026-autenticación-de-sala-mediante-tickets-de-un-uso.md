# ADR-0026: Autenticación de sala mediante tickets de un uso

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** un enlace WSS público no debe aceptar conexiones que afirmen pertenecer a cualquier mundo/alianza/batalla.

**Decisión:** NestJS autoriza la solicitud y emite ticket firmado de corta vida (TTL 60 s) enlazado a `world_id`, `season_id`, `encounter_id`, `player_id`, `role`, `jti`, vencimiento. Colyseus valida firma o verifica de forma interna la emisión y consume `jti` atómicamente. Autenticar cada operación de room; no exponer token de usuario general ni secreto de servidor al cliente.

**Alternativas:** reutilizar cookie del mundo sin scope (acceso lateral); identificadores públicos como autenticación (trivialmente suplantables); API key estática dentro de web (insegura).

**Consecuencias:** servicio para emitir/consumir tickets, reloj consistente y revocación breve. Configurar reverse proxy WSS y límites de solicitud.

**Invariantes / pruebas:** rechazo de ticket expirado/usado/de otro mundo/otro rol; reasignación imposible; no guardar tickets en logs; contrato autenticado de resultado entre servicios; CI incluye pruebas de autenticación adversarial.

**Revisar si:** esquema de SSO/infraestructura permite delegar a gateway confiable sin relajar alcance.
