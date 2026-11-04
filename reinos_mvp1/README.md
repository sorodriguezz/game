# Reinos de la Frontera — MVP 1.0

Paquete de **documentación y ejemplos de infraestructura**, no un videojuego ya implementado.

## Entregables
1. [`PRD_MVP1.md`](PRD_MVP1.md) — Requisitos funcionales, no funcionales, mundo, economía, combate, civilizaciones, naval, NPC, diplomacia, rankings, premiación semanal, Maravilla 100, aceptación y riesgos.
2. [`ADRs_MVP1_COMPLETOS.md`](ADRs_MVP1_COMPLETOS.md) — 20 decisiones arquitectónicas consolidadas.
3. [`docs/adr/`](docs/adr/README_ADR.md) — 20 ADR individuales para guardar en Git.
4. [`GUIA_IA_INSTALACION.md`](GUIA_IA_INSTALACION.md) — Qué instalar, comandos verificados, qué MCP usar y qué **no** instalar.
5. [`AGENTS.md`](AGENTS.md) — Contrato de comportamiento para agentes de IA.
6. [`BACKLOG_MVP1.md`](BACKLOG_MVP1.md) — Implementación en cinco gates con criterios de aceptación.
7. `examples/` — Archivo de Compose local y ejemplo de variables de entorno.

## Reglas esenciales
- 3D realista estilizado, sin placeholders cúbicos como calidad final.
- Mundos por temporada, con victoria de Maravilla al nivel 100.
- Alianzas, pactos de no agresión, confederaciones, rankings y premios semanales.
- Combate **automático** y autoritativo offline en MVP 1; modo táctico RTS en MVP 2.
- PostgreSQL + worker transaccional; evitar infraestructura extra en MVP 1.
- IA en construcción del software y assets, no en runtime normal de aldeas/combates.

## Ruta de trabajo
Comenzar por `GUIA_IA_INSTALACION.md` y Gate 0 del backlog. Instruir al agente con `AGENTS.md` y exigir pruebas antes de avanzar.
