# ADR-0011: Aldeas NPC con máquina de estados y reglas deterministas

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
La IA generativa por cada NPC genera latencia, coste, alucinación de acciones y resultados imposibles de auditar.

## Decisión
Estados finitos/behavior rules versionados y timers de baja frecuencia; producción/conquista/ataque validados por el mismo motor económico y bélico que jugadores. IA generativa solo para autores de contenido offline, nunca decisión canónica.

## Consecuencias positivas
- Comportamiento predecible y balanceable
- NPC activos sin usuarios conectados
- Sin gasto de tokens en runtime

## Consecuencias y riesgos
- Menos conversación abierta y espontaneidad
- La variedad debe programarse con arquetipos/semillas

## Alternativas evaluadas
- LLM por pueblo: gasto e impredecibilidad
- NPC inertes: mundo vacío

## Señal de revisión
Añadir eventos narrativos generados offline con revisión de contenido si se desea.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
