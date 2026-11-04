# ADR-0030: Escenarios 3D con arte final y simulación 2.5D

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** el usuario exige calidad artística comparable a un RTS comercial, pero evitar geometrías/física intensivas en servidor.

**Decisión:** PlayCanvas React ya existente para render. Terreno 3D con materiales PBR, GLB originales, sombras controladas, vegetación instanciada, navmesh 2.5D. IA/Blender produce assets en pipeline **offline** y se aprueban por métricas, capturas y licencias. Culling, LOD, atlas y compresión; no pathfinding por soldado. Tres mapas P0.

**Alternativas:** placeholders cúbicos como producción (incumple visión); Unreal en streaming (costo); simular cada objeto 3D servidor (no necesario).

**Consecuencias:** aumenta inversión en contenido y revisión, ahorra render server y reduce latencia.

**Invariantes / pruebas:** snapshots visuales en dos resoluciones, ausencia de personajes sin animación, colisionadores sin interpenetración y carga incremental de assets. Presupuestos medidos en hardware de referencia.

**Revisar si:** métricas de navegador y calidad requieren cambio de técnicas, no cambio de motor por moda.
