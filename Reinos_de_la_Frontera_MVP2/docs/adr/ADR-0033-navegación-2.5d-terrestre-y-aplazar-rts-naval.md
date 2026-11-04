# ADR-0033: Navegación 2.5D terrestre y aplazar RTS naval

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** ya existen ríos, islas, puertos, oasis y barcos de transporte asíncrono en MVP 1. Combate naval en vivo implica otro modelo de formación, rutas, colisión y arte.

**Decisión:** MVP 2 P0 admite terrenos cercanos a costa como escenario visual terrestre. Los viajes y barcos siguen en el sistema asíncrono. No introducir barcos tácticos hasta una prueba técnica de navegación naval y abordaje, planificada como MVP 2.1/MVP 3.

**Alternativas:** añadir combate naval simultáneo a terrestre (doble scope, retraso de lanzamiento); quitar agua/rutas navales (regresión); simular física de olas por barco en servidor (coste alto).

**Consecuencias:** shipping temprano de RTS terrestre y conservación de la identidad náutica de la estrategia de mundo.

**Invariantes / pruebas:** traslado barco+ejército sigue operativo, agua bloquea formaciones terrestres en batallas, sistema de PNA y rutas navales no altera comportamiento previo.

**Revisar si:** terreno/escenas terrestres están estables y hay recursos de arte para navegación naval.
