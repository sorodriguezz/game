# ADR-0023: Participación táctica bilateral y modo AUTO por defecto

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** Travian funciona mientras jugadores están ausentes; obligar a estar conectado favorecería a quienes pueden jugar en horario determinado y vulneraría la promesa principal.

**Decisión:** un ataque terrestre elegible ofrece un combate táctico por 20 s (configurable). **Ambos bandos aceptan** explícitamente; rechazo, desconexión, timeout, servidor saturado, requisito diplomático o enfrentamiento complejo resuelve por motor AUTO MVP 1. Ningún jugador pierde recursos por rechazar ni obtiene puntaje extra por participar.

**Alternativas:** atacante fuerza RTS (desigualdad); lobby asíncrono obligatorio que congela ataques (denegación de servicio); combate táctico cosmético sin efectos de decisiones (poco valor lúdico).

**Consecuencias:** solo una fracción de ataques será RTS al principio; defensa justa, control de capacidad y progresión offline intactos.

**Invariantes / pruebas:** ambos consentimientos dentro del plazo; un encuentro no puede llegar a `LIVE` y `AUTO` a la vez; temporizador de servidor; test de usuario desconectado, rechazo, una aceptación tardía y caída del servicio.

**Revisar si:** las métricas de aceptación y los tests de balance justifican nuevas modalidades opt-in.
