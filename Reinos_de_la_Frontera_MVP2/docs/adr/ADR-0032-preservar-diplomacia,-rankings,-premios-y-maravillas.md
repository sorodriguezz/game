# ADR-0032: Preservar diplomacia, rankings, premios y Maravillas

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** la competición de temporada depende de PNA, confederaciones, scores semanales y Maravilla de nivel 100. Un modo RTS podría crear exploits de puntuación.

**Decisión:** no crear ranking táctico separado con recompensas de poder. La salida del combate táctico produce los mismos eventos canónicos de daño/defensa que AUTO. Validar pactos y alianza antes del ataque y del resultado. Maravilla y grandes asedios permanecen AUTO en MVP 2 P0. Ganadores del mundo siguen definidos por ADR-0015.

**Alternativas:** doble puntuación por modo (farming), victorias tácticas con recursos especiales (pay-to-win temporal), permitir tácticas sobre Maravilla sin controlar ataques múltiples (inconsistencia).

**Consecuencias:** menor incentivo de premios artificiales por entrar en RTS, más equidad. Se conserva valor estratégico de diplomacia.

**Invariantes / pruebas:** PNA bloquea invitación prohibida, confederaciones no transfieren tropas entre mundos, cierre semanal contabiliza una vez, Maravilla nivel 100 cierra mundo aunque Colyseus caiga.

**Revisar si:** PvP táctico de alianzas pasa pruebas y necesita una modalidad explícita aparte.
