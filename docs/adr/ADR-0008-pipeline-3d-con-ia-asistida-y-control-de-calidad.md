# ADR-0008: Pipeline 3D con IA asistida y control de calidad

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
La generación automática de meshes no asegura topology, UV, rig, licencias ni consistencia artística.

## Decisión
Arte realista estilizado con guía de estilo, conceptos aprobados y assets ancla. Generación local Hunyuan3D-2 o servicio opcional, revisión/corrección Blender, validación de pivote/escala/UV/colisión, exportación GLB, optimización glTF Transform, captura PlayCanvas, revisión humana y manifest con procedencia/licencia. Reutilizar esqueletos y piezas modulares.

## Consecuencias positivas
- Aspecto profesional sin comprar cientos de packs
- Menores descargas y consistencia técnica del asset

## Consecuencias y riesgos
- Requiere revisión artística; no prometer IA totalmente autónoma
- Licencias de modelos/servicios requieren comprobación por versión y territorio

## Alternativas evaluadas
- IA genera GLB directo a producción: calidad insegura
- Todo manual: tiempo y coste elevados

## Señal de revisión
No aprobar assets sin prueba in-engine y registro de procedencia.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
