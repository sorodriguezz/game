# ADR-0035: Instrumentación y presupuestos medidos antes de escalar

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** el RTS consume CPU y red distintos del backend de mundo. Escalar sin medir puede llevar a infraestructura costosa o mala experiencia.

**Decisión:** establecer baseline p50/p95 de tick, RTT, sesiones, bytes/s, FPS, memoria, reconexiones, commits y fallbacks. Health/metrics del servidor táctico y correlation IDs entre API, worker y rooms. Definir objetivos de laboratorio, no promesas absolutas hasta benchmark externo.

**Alternativas:** CPU como única métrica (ciega a red y UX); instalar stack enorme de observabilidad de inicio (sobrecosto); logs sin correlación (difícil depuración).

**Consecuencias:** tiempo inicial en instrumentación y pruebas, reducción de incertidumbre/costos.

**Invariantes / pruebas:** stress test documentado con hardware, versión del juego y número de rooms; backend estratégico sano durante saturación RTS; rollback medido y ejecutable.

**Revisar si:** la escala o SLO exige monitoreo gestionado o un recolector central.
