# ADR-0005: Motor de combate determinista y servidor autoritativo

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Los defensores pueden estar desconectados y los navegadores no deben decidir resultados.

## Decisión
Crear `packages/game-rules` con un núcleo funcional `resolveBattle(snapshot, seed, version)`. Fijar tropas, doctrinas, terreno, tecnologías y fortificaciones en `BattleSnapshot`. No usar `Math.random()` no sembrado ni estado externo. El worker aplica un resultado una sola vez. La animación 3D solo reproduce el resultado registrado; no tiene autoridad.

## Consecuencias positivas
- Combates offline, auditables y reproducibles
- Tests de miles de escenarios y balance reproducible
- Menos superficie para trampas

## Consecuencias y riesgos
- Requiere definir cuidadosamente resolución de ataques simultáneos
- Las repeticiones automáticas no son movimientos tácticos históricos exactos

## Alternativas evaluadas
- Resolver en cliente: inseguro
- Simular cada batalla visualmente en servidor: prohibitivo para MVP

## Señal de revisión
Modo táctico futuro usará simulación autoritativa de pasos fijos y contrato separado.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
