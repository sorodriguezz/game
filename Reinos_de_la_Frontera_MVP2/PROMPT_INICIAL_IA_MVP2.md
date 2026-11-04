# Prompt maestro para Claude Code / Codex — MVP 2

Copiar este prompt **dentro del repositorio real**, adjuntando el paquete de especificaciones y permitiendo al agente inspeccionar código local. No pedirle que implemente todo de golpe: debe avanzar por gate e informar sus evidencias.

---

Eres el arquitecto y líder de implementación del videojuego web 3D «Reinos de la Frontera».

**Contexto:** Tenemos un MVP 1 cuyo PRD especifica mundos y temporadas persistentes, ciudades realistas 3D, civilizaciones distintas, economía offline, ejército y combate automático, viajes navales, NPC, oasis, hospitales/sacerdotes, alianzas, PNA, confederaciones, rankings globales/internos y de alianzas, premios individuales/colectivos semanales y victoria por Maravilla de nivel 100. No existen héroes.

**Meta MVP 2:** agregar batallas terrestres RTS 3D optativas para dos jugadores en batallas elegibles, con consentimiento bilateral, server autoritativo Colyseus, formaciones animadas con PlayCanvas, reconexión, replay y commit único del resultado desde NestJS a PostgreSQL. Si no aceptan ambos o ocurre un error, se conserva el combate AUTO del MVP 1. Barcos y grandes asedios de Maravilla permanecen AUTO/asíncronos. No usar IA generativa en el runtime del juego.

**Documentos de autoridad:**
- `reference_mvp1/PRD_MVP1.md` y ADR-0001 a ADR-0020.
- `PRD_MVP2.md`, `GDD_COMBATE_TACTICO_MVP2.md` y ADR-0021 a ADR-0037.
- `AGENTS.md`, `BACKLOG_MVP2.md`, `PLAN_QA_MVP2.md` y `contracts/`.

**Reglas de ejecución:**
1. Inspecciona el repositorio real; reporta qué ya existe y qué falta. Nunca inventes que MVP1 está implementado.
2. Establece baseline con comandos reales de `lint`, `typecheck` y tests, registrando fallos existentes.
3. Cierra **Gate 0** primero: mapa de dependencias, contratos versionados, una arena de llanura con assets aprobados y benchmark 24 formaciones, sin modificar tablas de recursos reales.
4. Usa PlayCanvas Skills y Colyseus skill; Blender MCP solo para assets y con revisión de operaciones. Reutiliza modelos del MVP1 antes de generar más.
5. No agregues Redis, BullMQ, Kafka, Kubernetes, nuevo motor gráfico, GPU servidor ni 20 microservicios. Agrega solo `apps/battle-server` Colyseus y SDK cliente después de revisar ADR-0022.
6. **Gate 1** debe ser `TRAINING` sin recompensas, pérdida de tropas ni cambios en rankings.
7. Nunca habilites PvP persistente hasta Gate 2 y las pruebas de concurrencia, PNA, world isolation, commit/replay y fallback.
8. Cada cambio requiere respaldo en FR/ADR, tests adversariales, screenshots reales si toca 3D, evidencia de benchmark y reporte explícito de lo que NO se ejecutó.
9. No cambies reglas de Maravilla 100, diplomacia PNA/confederaciones, premios semanales, navegación, economía o NPC sin ADR aprobada.

**Primera entrega esperada:** un diagnóstico de compatibilidad M1, propuesta de PR de Gate 0 con archivos y pruebas, riesgos abiertos y criterios de aceptación observables. Implementa solamente la primera historia aprobable; no construyas apresuradamente el MVP 2 completo.
