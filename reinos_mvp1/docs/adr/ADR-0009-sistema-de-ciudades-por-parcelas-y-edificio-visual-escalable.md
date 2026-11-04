# ADR-0009: Sistema de ciudades por parcelas y edificio visual escalable

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
La colocación libre completa presenta problemas de colisiones, caminos y sincronización; posiciones totalmente rígidas reducen creatividad.

## Decisión
Usar parcelas/celdas urbanas con reglas de vecindad, restricciones de ocupación y caminos válidos. Edificios con niveles de gameplay múltiples y 3 etapas visuales (variantes reutilizables). La cuadrícula es estructura de simulación, **no** obliga a gráficos cúbicos. Todos los placements validados en servidor.

## Consecuencias positivas
- Construcción flexible y fácil de serializar
- Mayor control artístico y navegación estable

## Consecuencias y riesgos
- Menos libertad que un editor urbano irrestricto
- Hace falta diseñar espacio portuario/especial para edificio único

## Alternativas evaluadas
- Colocación completamente libre: mayor complejidad
- Slots únicos fijos: sensación de UI Travian clásica

## Señal de revisión
Ampliar reglas de parcelas tras tests de usabilidad.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
