# ADR-0029: Replays auditables con versiones y control de visibilidad

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** el jugador quiere ver batallas con soldados y animaciones; el motor automático del MVP 1 no produce acciones cuadro a cuadro, y las tácticas pueden revelar información secreta.

**Decisión:** diferenciar `AUTO_REPRESENTATION` de `TACTICAL_EVENT_REPLAY`. Registrar snapshot, seed, versión de motor, lista ordenada de órdenes/eventos, estado final y checksum. Replays se pueden descargar como artefactos comprimidos o reproducir mediante interpolación. El backend autoriza acceso a observadores y aplica retrasos para evitar filtraciones.

**Alternativas:** grabar vídeo por servidor GPU (caro); enviar estado completo cada frame (ancho de banda); permitir espectar cualquier batalla en directo (exposición de tácticas).

**Consecuencias:** almacenamiento y versiones de renderer; hay que desarrollar políticas de conservación y herramientas de diagnóstico.

**Invariantes / pruebas:** resultado del replay coincide con `battle_results`; reproducción no ejecuta mutaciones de dominio; cuentas de otras alianzas/mundos no acceden a replays restringidos.

**Revisar si:** los registros de eventos no bastan para reproducir transiciones visuales creíbles.
