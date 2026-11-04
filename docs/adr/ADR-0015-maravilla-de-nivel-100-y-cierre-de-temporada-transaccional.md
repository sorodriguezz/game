# ADR-0015: Maravilla de nivel 100 y cierre de temporada transaccional

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Varios ejércitos pueden llegar junto a mejoras y ruptura de control; un mundo debe tener un único ganador.

## Decisión
Maravillas ubicadas en sedes especiales. Niveles 0-100 consumen tiempo/recursos; primera alianza elegible con nivel 100 inicia período de defensa configurable (propuesta 24h). Transiciones serializadas con lock de mundo/sede y `winner_alliance_id` único; verificación de asedios/propiedad. Archivar puntuaciones y resultados de forma inmutable.

## Consecuencias positivas
- Objetivo colectivo de campaña
- Temporada terminable y premiable
- Reglas transparentes

## Consecuencias y riesgos
- Necesidad de balance de costes/tiempos y ataques
- Riesgo de frustración por remontadas; debe probarse

## Alternativas evaluadas
- Victoria inmediata sin verificación: vulnerable a concurrencia
- Mundo sin fin: no cumple objetivo

## Señal de revisión
Una prueba de concurrencia debe demostrar que dos Maravillas simultáneas nunca generan dos ganadores.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
