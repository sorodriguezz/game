# ADR-0019: Acceso a datos tipado con Drizzle y SQL explícito

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
El proyecto requiere TypeScript, migraciones y manejo fino de locks, índices y transacciones; añadir un ORM muy abstracto puede ocultar semántica.

## Decisión
Usar Drizzle ORM para esquema/migraciones y queries tipadas; SQL explícito para `FOR UPDATE SKIP LOCKED`, constraints, cierres de semana y casos críticos. Repositorios por agregado. No permitir writes directos desde controladores.

## Consecuencias positivas
- Tipado end-to-end y control de SQL
- Migraciones versionadas y revisables

## Consecuencias y riesgos
- Equipo debe comprender PostgreSQL e índices
- No todas las consultas complejas son idiomáticas en el ORM

## Alternativas evaluadas
- Prisma: válido, pero preferimos controlar operaciones SQL críticas
- SQL a mano en todos los módulos: aumenta boilerplate

## Señal de revisión
Revisar mantenibilidad y rendimiento tras el primer vertical slice.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
