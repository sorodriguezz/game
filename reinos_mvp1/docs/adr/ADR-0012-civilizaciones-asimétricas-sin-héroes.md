# ADR-0012: Civilizaciones asimétricas sin héroes

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
La identidad del juego depende de elecciones colectivas y especialización, sin personaje héroe de Travian.

## Decisión
Dos civilizaciones para MVP; cada una con arte, unidad y edificio único y bonificaciones pequeñas parametrizadas. Producción, tropas, templo/hospital y tecnología como sistemas colectivos. Sacerdote = unidad de soporte, jamás héroe con equipo/XP personal.

## Consecuencias positivas
- Identidad diferenciada sin introducir sistemas RPG
- Más sencillo de balancear y probar

## Consecuencias y riesgos
- Menos variedad al lanzamiento inicial
- Variaciones deben evitar civilización dominante

## Alternativas evaluadas
- Cinco civilizaciones iniciales: coste de assets/QA muy alto
- Una sola: no validaría asimetría

## Señal de revisión
Ampliar a cinco civilizaciones tras medir tasas de victoria y adquisición de recursos.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
