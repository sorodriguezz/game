# ADR-0013: Diplomacia formal: PNA, guerras y confederaciones

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
La política debe afectar órdenes y coordinación sin crear vacíos de reglas aprovechables.

## Decisión
Entidad `diplomatic_pacts` con transiciones auditadas; PNA requiere ambas aprobaciones, ventana de activación/ruptura y bloquear nuevas órdenes de ataque cubiertas. Confedera hasta 3 alianzas por defecto configurable, sin fusionar puntuaciones ni propiedad de ciudades. Roles diplomáticos con autorización.

## Consecuencias positivas
- Relaciones duraderas y visibles
- Reglas de ataque consistentes
- Contratos auditables

## Consecuencias y riesgos
- Requiere resolver movimientos iniciados antes del pacto
- Puede generar abusos si no se imponen cooldowns

## Alternativas evaluadas
- Diplomacia solo texto: no produce reglas
- Fusión automática de alianzas: facilita megabloques

## Señal de revisión
Definir controles de abuso en balance del mundo y pruebas adversariales.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
