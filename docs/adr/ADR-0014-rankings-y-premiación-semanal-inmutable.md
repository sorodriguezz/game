# ADR-0014: Rankings y premiación semanal inmutable

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Premiar dos veces o contar puntajes falsos destruye credibilidad; bonificaciones militares a líderes aumentan la desigualdad.

## Decisión
Eventos de puntuación verificados en PostgreSQL; agregados de ranking por mundo, jugador/alianza/miembro; snapshots al lunes 00:00 UTC, cierre con clave única `(world_id,week,scope,category,rank)` y premios idempotentes mediante `award_grants`. Premio MVP exclusivamente honorífico/cosmético. Historial no editable.

## Consecuencias positivas
- Comparación semanal justa y auditable
- No dependencia de caché para exactitud
- Evita snowball de premios económicos

## Consecuencias y riesgos
- Debemos prevenir manipulación de actividad, multicuentas y cambios de alianza
- Rankings de muchas categorías requieren índices/materialización

## Alternativas evaluadas
- Sumar en cliente: fraude
- Premios de recursos o tropas: desequilibrio

## Señal de revisión
Añadir recompensas funcionales solo tras validar balance y antiabuso.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
