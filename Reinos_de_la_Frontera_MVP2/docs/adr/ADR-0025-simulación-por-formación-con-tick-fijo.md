# ADR-0025: Simulación por formación con tick fijo

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** representar cientos de soldados es atractivo; calcular IA, pathfinding y colisión por soldado en servidor Node para cada encuentro es caro.

**Decisión:** la unidad simulada es una **formación**. Los soldados individuales son instancias visuales. Motor autoritativo con pasos de 100 ms por defecto (10 Hz), ordenación estable de órdenes/IDs, posiciones y distancias cuantizadas, reglas versionadas y límites de órdenes. Un solo estado es mutable: el del servidor táctico.

**Alternativas:** física 3D individual en servidor (CPU desproporcionada); cliente como autoridad (trampas); cálculo dependiente de frame rate (nondeterminismo).

**Consecuencias:** menor libertad táctica microunidad, pero rendimiento medible; requiere diseño de formación y visual de grupos.

**Invariantes / pruebas:** mismo input/seed/version bajo la misma implementación => hash del estado coincidente en los ticks de control; variación FPS cliente no modifica resultado; fuzzing de secuencia y límites. La reproducibilidad entre plataformas distintas debe verificarse, no asumirse.

**Revisar si:** playtests requieren más granularidad y benchmarks la permiten.
