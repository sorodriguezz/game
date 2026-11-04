# ADR-0006: Batallas tácticas controlables quedan fuera del MVP 1

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Introducir maniobras en tiempo real en ataques a defensores desconectados crea injusticia, costes y complejidad de reconexión.

## Decisión
MVP 1 usa ataques automáticos con doctrinas defensivas, informes y visualización 3D diferida. MVP 2 agrega partidas tácticas opt-in con aceptación mutua y reglas equivalentes, servidor autoritativo y resolución por IA en desconexión.

## Consecuencias positivas
- Temporada jugable sin bloquear desarrollo por netcode
- Paridad de defensa offline

## Consecuencias y riesgos
- La experiencia de control directo se retrasa
- Debe comunicarse claramente la diferencia entre replay y partida táctica

## Alternativas evaluadas
- RTS forzoso en todos los ataques: no apto para offline
- Táctico client-authoritative: vulnerable

## Señal de revisión
No incluir Colyseus en dependencias del MVP; evaluar cuando MVP 2 esté aprobado.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
