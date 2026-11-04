# ADR-0010: Navegación naval asíncrona mediante grafo de rutas

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
El agua, las islas y los barcos deben influir estratégicamente sin simular físicamente cada navío 24/7.

## Decisión
Crear grafo de rutas terrestres/navegables/puertos; transporte exige disponibilidad, capacidad, embarque y desembarque válidos. ETA validado en servidor, movimientos en `army_movements`; animación interpolada en mapa visual. No incluir PvP naval táctico ni barcos físicos de servidor en MVP.

## Consecuencias positivas
- Océanos y puertos tienen valor de gameplay
- Costo muy bajo con rutas por evento

## Consecuencias y riesgos
- Requiere tests de conectividad y anti-teletransporte
- El bloqueo naval profundo se pospone o abstrae

## Alternativas evaluadas
- Navmesh global + física continua: costoso
- Mar puramente estético: no satisface visión

## Señal de revisión
Agregar bloqueo naval y batallas navales reales solo tras validar logística.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
