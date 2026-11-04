# ADR-0007: PlayCanvas React y escenas 3D por contexto

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Se necesita presentación convincente en navegador sin obligar a GPU/servidor de juego para renderizado.

## Decisión
React + TypeScript + `@playcanvas/react` para ciudad, mapa y repeticiones. Arquitectura de tres escenas: mapa mundial por regiones, ciudad por aldea, replay por combate. Cargar assets con manifest y demanda, aplicar LOD, instancing, culling, quality profiles y análisis de draw calls. HTML/React para UI accesible.

## Consecuencias positivas
- 3D en el cliente y CDN compatible
- Stack front-end TypeScript conocido
- Posibilidad de ajustes gráficos

## Consecuencias y riesgos
- El rendimiento depende mucho de assets y GPU del cliente
- No toda feature WebGPU está disponible en todos los navegadores; fallback WebGL2

## Alternativas evaluadas
- Unreal/Unity Web: peso y ciclo de publicación mayores
- Three.js manual: más sistemas de juego que desarrollar

## Señal de revisión
Revaluar motor si las pruebas muestran limitaciones estructurales, no por preferencia abstracta.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
