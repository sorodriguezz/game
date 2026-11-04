# ADR-0028: Reconexión y fallback ante caída de sala

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** las sesiones de navegador se cortan y los servidores fallan; una guerra persistente debe alcanzar un resultado.

**Decisión:** gestionar reconexión con el flujo oficial de Colyseus para cliente aún vivo y token para reload; plazo de gracia propuesto de 30 s. En ausencia, doctrina militar toma las órdenes. Si falla la sala y hay checkpoint validado, reanudar; de lo contrario aplicar motor AUTO sobre el **snapshot original**, con incidente, sin usar un resultado parcial no confirmado.

**Alternativas:** derrota automática del desconectado (injusta); dejar batalla inconclusa indefinidamente (bloqueo); reiniciar con nuevas tropas (duplicación).

**Consecuencias:** mecanismos watchdog, timeouts, eventos de incidente y reconciliación; política de fallback explícita por versión.

**Invariantes / pruebas:** desconexión 1/2 adversarios, reload, server SIGTERM, kill -9, DB temporalmente caída, reconexión después de expiración, limpieza de reserva; nunca dos resultados aplicados.

**Revisar si:** almacenamiento de checkpoints complejos supera beneficio frente a fallback automático.
