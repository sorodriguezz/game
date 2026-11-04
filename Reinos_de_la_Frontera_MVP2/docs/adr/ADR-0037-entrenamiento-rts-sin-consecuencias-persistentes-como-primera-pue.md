# ADR-0037: Entrenamiento RTS sin consecuencias persistentes como primera puerta

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** probar un RTS afectando desde el primer día los ejércitos reales expone recursos y rankings a fallos de red, balance y reglas.

**Decisión:** Gate 1 implementa `TRAINING` con ejércitos/escenarios sintetizados desde catálogos, sin reserva real ni recompensas de poder. Solo después de pruebas de estabilidad y balance se habilita `WORLD_PVP` con consentimiento bilateral.

**Alternativas:** probar únicamente con mocks (no revela problemas de red reales); desplegar PvP persistente sin entrenamiento (riesgo de pérdidas reales).

**Consecuencias:** inversión en una modalidad de bajo riesgo, útil a futuro como tutorial y torneo no puntuable.

**Invariantes / pruebas:** un resultado `TRAINING` jamás puede crear un `resource_ledger` ni modificar `unit_stacks`/rankings, incluso si se reenvía por endpoint interno.

**Revisar si:** modalidad de entrenamiento alcanza usuarios estables y puede expandirse a torneos cosméticos, sin alterar el balance.
