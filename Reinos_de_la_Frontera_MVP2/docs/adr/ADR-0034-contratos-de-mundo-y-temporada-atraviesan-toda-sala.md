# ADR-0034: Contratos de mundo y temporada atraviesan toda sala

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** el producto administra mundos independientes por temporadas con identidades y estados distintos. El modo táctico agrega conexiones efímeras que podrían confundir contextos.

**Decisión:** cada `encounter`, ticket, room, replay y resultado lleva `world_id` y `season_id`. Versionado `rulesetVersion` + `contentVersion`. El cliente jamás propone libremente el mundo de la batalla; se deriva del encuentro autorizado. Los resultados de una temporada cerrada no alteran el mundo salvo reconciliación excepcional y auditada.

**Alternativas:** room ID global como único contexto (riesgo lateral), archivos sin etiqueta de versión (replays rotos), DB nueva por mundo (costo sin necesidad).

**Consecuencias:** DTO más explícitos y validaciones rígidas; migraciones de esquema/contratos.

**Invariantes / pruebas:** fuzzing de `world_id` inválido, cambio de temporada durante la sala, replay antiguo accesible solo según permisos, índices/constraints por mundo.

**Revisar si:** la distribución física de mundos cambia; la semántica no debe romperse.
