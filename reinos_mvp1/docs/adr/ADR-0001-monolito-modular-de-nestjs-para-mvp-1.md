# ADR-0001: Monolito modular de NestJS para MVP 1

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Una temporada completa tiene muchos dominios relacionados y restricciones cruzadas. Separarlos en servicios elevaría latencia, costes operacionales y complejidad de transacciones antes de validar el producto.

## Decisión
Usar `apps/api` como monolito modular NestJS/TypeScript organizado por agregados (`worlds`, `economy`, `armies`, `diplomacy`, `rankings`, `wonders`); ejecutar `apps/worker` como proceso separado del mismo monorepo que importa librerías de dominio compartidas. Contratos explícitos, sin acceso directo desde módulos ajenos a tablas de otros agregados salvo repositorios/servicios aprobados.

## Consecuencias positivas
- Transacciones consistentes dentro de PostgreSQL
- Despliegue simple y bajo consumo
- Posibilidad futura de extraer combates en vivo u otro módulo detrás de contratos

## Consecuencias y riesgos
- Los límites modulares requieren disciplina y tests de arquitectura
- Escalado inicial principalmente por proceso/replicación de API; worker puede escalar aparte

## Alternativas evaluadas
- Microservicios event-driven de inicio: excesiva infraestructura y eventual consistency
- Backend monolítico sin módulos: acoplamiento difícil de mantener

## Señal de revisión
Extraer un servicio solo con presión medida de CPU, latencia, equipo o despliegue; no por anticipación.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
