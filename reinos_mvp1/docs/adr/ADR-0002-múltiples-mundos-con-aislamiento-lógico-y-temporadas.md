# ADR-0002: Múltiples mundos con aislamiento lógico y temporadas

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Un servidor por mundo encarece; compartir BD sin aislamiento permitiría transferencias ilícitas de recursos o ataques entre mundos.

## Decisión
Una instalación atiende N mundos mediante `world_id` obligatorio en todo agregado de juego. Restricciones UNIQUE/FK compuestas incluyen mundo; todas las consultas se limitan por `world_id`. `world_memberships` y roles pertenecen al mundo. Cada mundo tiene semilla, velocidad, calendario, reglas versionadas y máquina de estados de temporada.

## Consecuencias positivas
- No hace falta duplicar despliegues para cada mundo
- Permite temporadas con reglas y horarios independientes
- Facilita archivo y análisis histórico

## Consecuencias y riesgos
- Necesita pruebas automáticas cross-world para cada operación
- Un error de filtro puede causar fugas si no hay FK compuestas; usar helpers de acceso y políticas

## Alternativas evaluadas
- Una base por mundo desde el inicio: mayor coste/operación
- Columna `world_id` sin integridad adicional: insuficiente

## Señal de revisión
Separar físicos mundos de gran tamaño solo después de medir contención o requisitos de aislamiento.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
