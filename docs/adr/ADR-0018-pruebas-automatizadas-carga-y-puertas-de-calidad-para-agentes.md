# ADR-0018: Pruebas automatizadas, carga y puertas de calidad para agentes

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Un agente puede escribir código plausible que no cumple el producto o degradar la base sin advertirlo.

## Decisión
Vitest para reglas, tests API/integración con PostgreSQL real, Playwright para flujos web y capturas, tests de propiedad para economía/batallas, tests de carrera bajo carga, linters/typecheck, check de licencias y validación GLB. CI bloquea merges sin criterios de aceptación; cada cambio IA llega por PR y se revisa.

## Consecuencias positivas
- Menos regresiones y posibilidad de iterar con IA
- Evidencia objetiva en lugar de demos aisladas

## Consecuencias y riesgos
- Tiempo de diseño de fixtures y ambientes
- Capturas visuales requieren revisión para no validar resultados erróneos

## Alternativas evaluadas
- Verificar solo build: no basta
- QA manual exclusivamente: lento/repetitivo

## Señal de revisión
Medir porcentajes de cobertura sobre módulos críticos pero priorizar invariantes y escenarios.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
