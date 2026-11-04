# ADR-0016: Despliegue de alfa en VPS con Docker Compose y assets estáticos

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Evitar costes y operaciones de Kubernetes o plataformas serverless incompatibles con worker persistente.

## Decisión
Contenedores de API, worker y PostgreSQL en un VPS con Docker Compose. Frontend estático y GLB en hosting/CDN opcional, HTTPS, backups externos, restauración probada, secretos fuera del repositorio y métricas. Carga real decide cuándo separar BD y añadir réplicas. No alojar GPU ni generadores IA en producción.

## Consecuencias positivas
- Coste base bajo y control completo
- Configuración reproducible y depuración simple

## Consecuencias y riesgos
- Un VPS es punto único de fallo; no prometer alta disponibilidad
- Responsabilidad de parches, backups, seguridad y alertas

## Alternativas evaluadas
- AKS/Kubernetes: coste elevado
- Solo serverless: worker persistente y websockets dependen de limitaciones proveedor

## Señal de revisión
Migrar servicios gradualmente si concurrencia, uptime y operación lo justifican.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
