# Reinos de la Frontera — MVP 2.0 — Paquete de implementación

**Fecha:** 2026-11-04 · **Idioma:** español · **Estado:** especificaciones y ejemplos, no código del videojuego ni instalaciones ejecutadas.

Este paquete complementa el MVP 1. El MVP 1 establece mundos/temporadas persistentes, ciudades 3D, dos civilizaciones, producción/ejércitos offline, aldeas NPC, transporte naval, oasis, hospitales/sacerdotes, alianzas con PNA/confederaciones, rankings y premios semanales, victoria por Maravilla nivel 100. El MVP 2 introduce **batallas terrestres RTS 3D opcionales entre dos jugadores**, servidor autoritativo y fallback AUTO.

## Documentos

| Archivo/carpeta | Uso |
|---|---|
| `PRD_MVP2.md` | Especificación funcional y no funcional, escenarios, reglas, límites, aceptación |
| `GDD_COMBATE_TACTICO_MVP2.md` | Diseño de jugabilidad de combate, formaciones, unidades, mapa y balance |
| `ADRs_MVP2_COMPLETOS.md` | 17 decisiones 0021–0037 consolidadas |
| `docs/adr/` | ADR individuales listas para versionar |
| `GUIA_IA_INSTALACION_MVP2.md` | Herramientas, instalaciones verificadas y secuencia de agentes |
| `BACKLOG_MVP2.md` | Historias ordenadas en Gates 0–4 y backlog P1 |
| `PLAN_QA_MVP2.md` | Test de integridad, red, rendimiento, regresión, seguridad y arte |
| `AGENTS.md` | Normas completas M1 + addendum M2 para agentes |
| `AGENTS_MVP2_ADDENDUM.md` | Solo la ampliación, para incorporar al repo ya existente |
| `contracts/` | Contratos TypeScript y JSON Schema de referencia |
| `examples/` | Plantilla SQL, .env y fragmento compose (NO ejecutar sin adaptar) |
| `reference_mvp1/` | Copia de referencia de docs M1 que soportan este diseño |

## Diferencia MVP 1 vs MVP 2

| Aspecto | MVP 1 | MVP 2 |
|---|---|---|
| Batallas obligatorias de mundo | Automáticas offline | **Siguen automáticas** |
| Batallas tácticas | No | Sí, opt-in bilateral en PvP terrestre elegible |
| Servidor de batalla | No | Colyseus único, proceso aislado |
| Render | Ciudades/mapa/reportes 3D | Tres arenas, formaciones animadas, órdenes tácticas |
| Diplomacia / premios / Maravilla | Sí | Sin cambios; integración vía resultados canónicos |
| Naval | Transporte/ETA | Se conserva; RTS naval posterior |
| Nuevos datos | M1 | Tablas aditivas de encuentro, reserva, room, replay |

## Orden de uso

1. **No partir del cero**. Montar el código M1 y comprobar baseline.
2. Instalar dependencias aprobadas siguiendo `GUIA_IA_INSTALACION_MVP2.md`.
3. Agregar `AGENTS_MVP2_ADDENDUM.md` a instrucciones existentes; no borrar normas M1.
4. Revisar y aceptar ADR 0021–0037.
5. Realizar Gate 0, luego `TRAINING` sin datos persistentes (Gate 1), después integración de PvP real (Gate 2).
6. No habilitar públicamente hasta pasar las pruebas descritas en `PLAN_QA_MVP2.md`.

## Decisión técnica principal

El core continúa en NestJS + PostgreSQL con worker PostgreSQL. Solo se añade Colyseus + SDK WebSocket para sesiones tácticas. **Redis, Kafka, BullMQ, Kubernetes y GPU de producción no son obligatorios.** Se miden límites y costos antes de considerarlos.

## Fuentes de documentación

- https://docs.colyseus.io/getting-started
- https://docs.colyseus.io/state
- https://docs.colyseus.io/room/reconnection
- https://docs.colyseus.io/deployment
- https://github.com/playcanvas/skills
- https://developer.playcanvas.com/user-manual/editor/mcp-server/
- https://github.com/ahujasid/mcp-for-blender

> **No se ha programado el MVP 2.** Los documentos son una especificación y ejemplos de arranque para que el agente de IA implemente el producto por hitos verificables.
