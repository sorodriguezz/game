# ADR — Reinos de la Frontera — MVP 2.0

**Estado global:** propuestas para validación e implementación · **Fecha:** 2026-11-04.

Estos ADR-0021 a ADR-0037 son *aditivos* a ADR-0001 a ADR-0020. No sustituyen el PRD ni el código; registrar `Supersedes:` cuando alguna decisión heredada realmente sea sustituida.


# ADR-0021: Extender MVP 1 sin reescribir el motor persistente

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** MVP 1 ya decide economía, viajes, NPC, batallas automáticas, diplomacia, temporadas, rankings y maravillas. Un segundo motor propietario de esos datos produciría divergencias.

**Decisión:** MVP 2 es una extensión compatible por `feature flags`. `apps/api` y `apps/worker` mantienen autoridad sobre el mundo; `apps/battle-server` controla solamente instancias tácticas efímeras. Nuevas tablas/migraciones aditivas, sin alterar claves existentes ni convertir automáticamente ataques M1.

**Alternativas:** reescribir todo en motor MMO tiempo real (costo y riesgo intolerables); simular batallas en navegador (inseguro); incorporar microservicios generales (prematuro).

**Consecuencias:** un segundo proceso opcional, deuda de integración explícita y dos ritmos de operación. La caída del componente nuevo no debe impedir la partida estratégica.

**Invariantes / pruebas:** suite MVP 1 completa sin dependencias de Colyseus; feature flag apagada; misma batalla antigua mismo resultado; ausencia de mutaciones de tablas M1 desde la cuenta DB del servidor de batalla.

**Revisar si:** los perfiles de carga o límites de transacciones justifican segmentar dominios adicionales.

---


# ADR-0022: Colyseus como servidor de salas tácticas aislado

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** el RTS necesita WebSocket bidireccional, habitaciones, visibilidad, reconexión, netcode y un estado autoritativo. NestJS no proporciona automáticamente todo el ciclo de una sala de videojuegos.

**Decisión:** añadir `apps/battle-server` como proceso Node/TypeScript **Colyseus** separado, pero dentro del mismo monorepo. Empezar con un proceso/instancia, una sala por batalla y SDK cliente en `apps/web`. Compartir DTO y reglas puras; no compartir las conexiones DB con la UI.

**Alternativas:** WebSocket manual en NestJS (más código de red y reconexión); WebRTC P2P (autoridad y conectividad complejas); Photon/servicio administrado (costo y dependencia); Colyseus Cloud de inicio (innecesario).

**Consecuencias:** dependencia nueva justificada, proceso y puerto WSS adicionales, contrato de autenticación entre API y servidor táctico. Aún no es un conjunto de microservicios de negocio.

**Invariantes / pruebas:** caída de Colyseus ⇒ nuevas batallas AUTO; conexión client SDK con token; room no puede autoasignarse tropas ni alterar inventario; métricas de salas/ticks.

**Revisar si:** el RTT p95, saturación por tick o recuperación de salas muestran necesidad real de clustering. Si se escala a varios procesos, evaluar presencia y driver compartidos según documentación oficial.

---


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

---


# ADR-0024: Snapshots inmutables, reservas de tropas y concurrencia

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** dos ataques pueden llegar a la misma ciudad; durante una sala de 5 min siguen ocurriendo reclutamientos, refuerzos y eventos económicos.

**Decisión:** al vencimiento de movimiento, capturar snapshot inmutable (`rulesetVersion`, `seed`, unidades, doctina, tecnología, defensas). Reservar solo tropas comprometidas en tablas M1/tabla de reservas bajo transacción con lock/versión. Serializar asignación de guarnición por orden canónico; nuevos encuentros que no puedan reservar se convierten a AUTO o siguen política explícita. No bloquear toda la ciudad.

**Alternativas:** congelar aldea completa (mala UX); confiar en cantidades client-side (duplicación); colas sin bloqueos DB (carreras).

**Consecuencias:** mayores restricciones y código transaccional, pero coherencia entre mundo y sala.

**Invariantes / pruebas:** suma de tropas libres + reservadas + perdidas/trasladadas se conserva; dos ataques simultáneos; refuerzo a mitad de combate; crash posterior a reserva; reconciliador libera únicamente reservas no comprometidas.

**Revisar si:** las batallas de muchos bandos requieren un modelo de reservas multientidad más elaborado.

---


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

---


# ADR-0026: Autenticación de sala mediante tickets de un uso

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** un enlace WSS público no debe aceptar conexiones que afirmen pertenecer a cualquier mundo/alianza/batalla.

**Decisión:** NestJS autoriza la solicitud y emite ticket firmado de corta vida (TTL 60 s) enlazado a `world_id`, `season_id`, `encounter_id`, `player_id`, `role`, `jti`, vencimiento. Colyseus valida firma o verifica de forma interna la emisión y consume `jti` atómicamente. Autenticar cada operación de room; no exponer token de usuario general ni secreto de servidor al cliente.

**Alternativas:** reutilizar cookie del mundo sin scope (acceso lateral); identificadores públicos como autenticación (trivialmente suplantables); API key estática dentro de web (insegura).

**Consecuencias:** servicio para emitir/consumir tickets, reloj consistente y revocación breve. Configurar reverse proxy WSS y límites de solicitud.

**Invariantes / pruebas:** rechazo de ticket expirado/usado/de otro mundo/otro rol; reasignación imposible; no guardar tickets en logs; contrato autenticado de resultado entre servicios; CI incluye pruebas de autenticación adversarial.

**Revisar si:** esquema de SSO/infraestructura permite delegar a gateway confiable sin relajar alcance.

---


# ADR-0027: Resultado autoritativo con commit idempotente en PostgreSQL

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** una sala puede reenviar resultados y API reiniciarse en cualquier punto; aplicar dos veces bajas o botín corrompe el juego.

**Decisión:** `battle-server` prepara resultado firmado/autenticado y checksum; NestJS lo valida contra snapshot, identidad y versión. Una transacción PostgreSQL inserta `battle_results` con `encounter_id` único, descuenta bajas/libera reservas, aplica botín y publica eventos outbox de rankings/alianzas. Un repetido resultado idéntico retorna estado `APPLIED`; uno diferente es incidente, no sobrescribe.

**Alternativas:** Colyseus escribe directo en tablas M1 (mezcla propiedad de dominio); bus de mensajes como fuente de verdad (complejidad); aplicar resultado sin unicidad (corrupción).

**Consecuencias:** latencia de commit y reconciliación necesaria; propiedad del estado mundial preservada.

**Invariantes / pruebas:** envío duplicado/triple, crash antes/después de commit, dos workers concurrentes, replay de POST, conclusión de temporada durante commit, una sola contabilización de ranking.

**Revisar si:** requisitos de throughput de resultados exceden el diseño transaccional actual.

---


# ADR-0028: Reconexión y fallback ante caída de sala

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** las sesiones de navegador se cortan y los servidores fallan; una guerra persistente debe alcanzar un resultado.

**Decisión:** gestionar reconexión con el flujo oficial de Colyseus para cliente aún vivo y token para reload; plazo de gracia propuesto de 30 s. En ausencia, doctrina militar toma las órdenes. Si falla la sala y hay checkpoint validado, reanudar; de lo contrario aplicar motor AUTO sobre el **snapshot original**, con incidente, sin usar un resultado parcial no confirmado.

**Alternativas:** derrota automática del desconectado (injusta); dejar batalla inconclusa indefinidamente (bloqueo); reiniciar con nuevas tropas (duplicación).

**Consecuencias:** mecanismos watchdog, timeouts, eventos de incidente y reconciliación; política de fallback explícita por versión.

**Invariantes / pruebas:** desconexión 1/2 adversarios, reload, server SIGTERM, kill -9, DB temporalmente caída, reconexión después de expiración, limpieza de reserva; nunca dos resultados aplicados.

**Revisar si:** almacenamiento de checkpoints complejos supera beneficio frente a fallback automático.

---


# ADR-0029: Replays auditables con versiones y control de visibilidad

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** el jugador quiere ver batallas con soldados y animaciones; el motor automático del MVP 1 no produce acciones cuadro a cuadro, y las tácticas pueden revelar información secreta.

**Decisión:** diferenciar `AUTO_REPRESENTATION` de `TACTICAL_EVENT_REPLAY`. Registrar snapshot, seed, versión de motor, lista ordenada de órdenes/eventos, estado final y checksum. Replays se pueden descargar como artefactos comprimidos o reproducir mediante interpolación. El backend autoriza acceso a observadores y aplica retrasos para evitar filtraciones.

**Alternativas:** grabar vídeo por servidor GPU (caro); enviar estado completo cada frame (ancho de banda); permitir espectar cualquier batalla en directo (exposición de tácticas).

**Consecuencias:** almacenamiento y versiones de renderer; hay que desarrollar políticas de conservación y herramientas de diagnóstico.

**Invariantes / pruebas:** resultado del replay coincide con `battle_results`; reproducción no ejecuta mutaciones de dominio; cuentas de otras alianzas/mundos no acceden a replays restringidos.

**Revisar si:** los registros de eventos no bastan para reproducir transiciones visuales creíbles.

---


# ADR-0030: Escenarios 3D con arte final y simulación 2.5D

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** el usuario exige calidad artística comparable a un RTS comercial, pero evitar geometrías/física intensivas en servidor.

**Decisión:** PlayCanvas React ya existente para render. Terreno 3D con materiales PBR, GLB originales, sombras controladas, vegetación instanciada, navmesh 2.5D. IA/Blender produce assets en pipeline **offline** y se aprueban por métricas, capturas y licencias. Culling, LOD, atlas y compresión; no pathfinding por soldado. Tres mapas P0.

**Alternativas:** placeholders cúbicos como producción (incumple visión); Unreal en streaming (costo); simular cada objeto 3D servidor (no necesario).

**Consecuencias:** aumenta inversión en contenido y revisión, ahorra render server y reduce latencia.

**Invariantes / pruebas:** snapshots visuales en dos resoluciones, ausencia de personajes sin animación, colisionadores sin interpenetración y carga incremental de assets. Presupuestos medidos en hardware de referencia.

**Revisar si:** métricas de navegador y calidad requieren cambio de técnicas, no cambio de motor por moda.

---


# ADR-0031: Despliegue económico de servidor táctico en un proceso

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** MVP 1 corre en VPS Linux Docker Compose con PostgreSQL; escalar automáticamente añade gastos de coordinación antes de tener demanda.

**Decisión:** una instancia `battle-server` con puerto interno y reverse proxy WSS; Node aislado del proceso NestJS, límites de CPU/memoria y salud. PostgreSQL sigue como única DB de negocio. No añadir Redis, Valkey, Kafka, K8s o Colyseus Cloud inicialmente. Medir capacidad y coste por sala.

**Alternativas:** desplegar cluster Colyseus con RedisPresence antes de medir (overengineering); correr simulación dentro del proceso API (ruido de CPU afecta economía); servicio SaaS (costo recurrente).

**Consecuencias:** capacidad limitada y punto único de falla del RTS, mitigado por fallback AUTO; VPS puede necesitar upgrade si se incrementan salas.

**Invariantes / pruebas:** saturación activa modo AUTO; `SIGTERM` drena donde se pueda; límites de room; balance económico M1 sano durante stress; evidencia en métricas.

**Revisar si:** exceder capacidad sostenible, necesidad de región múltiple o alta disponibilidad. Entonces revisar presence/driver compartidos conforme documentación Colyseus.

---


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

---


# ADR-0033: Navegación 2.5D terrestre y aplazar RTS naval

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** ya existen ríos, islas, puertos, oasis y barcos de transporte asíncrono en MVP 1. Combate naval en vivo implica otro modelo de formación, rutas, colisión y arte.

**Decisión:** MVP 2 P0 admite terrenos cercanos a costa como escenario visual terrestre. Los viajes y barcos siguen en el sistema asíncrono. No introducir barcos tácticos hasta una prueba técnica de navegación naval y abordaje, planificada como MVP 2.1/MVP 3.

**Alternativas:** añadir combate naval simultáneo a terrestre (doble scope, retraso de lanzamiento); quitar agua/rutas navales (regresión); simular física de olas por barco en servidor (coste alto).

**Consecuencias:** shipping temprano de RTS terrestre y conservación de la identidad náutica de la estrategia de mundo.

**Invariantes / pruebas:** traslado barco+ejército sigue operativo, agua bloquea formaciones terrestres en batallas, sistema de PNA y rutas navales no altera comportamiento previo.

**Revisar si:** terreno/escenas terrestres están estables y hay recursos de arte para navegación naval.

---


# ADR-0034: Contratos de mundo y temporada atraviesan toda sala

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** el producto administra mundos independientes por temporadas con identidades y estados distintos. El modo táctico agrega conexiones efímeras que podrían confundir contextos.

**Decisión:** cada `encounter`, ticket, room, replay y resultado lleva `world_id` y `season_id`. Versionado `rulesetVersion` + `contentVersion`. El cliente jamás propone libremente el mundo de la batalla; se deriva del encuentro autorizado. Los resultados de una temporada cerrada no alteran el mundo salvo reconciliación excepcional y auditada.

**Alternativas:** room ID global como único contexto (riesgo lateral), archivos sin etiqueta de versión (replays rotos), DB nueva por mundo (costo sin necesidad).

**Consecuencias:** DTO más explícitos y validaciones rígidas; migraciones de esquema/contratos.

**Invariantes / pruebas:** fuzzing de `world_id` inválido, cambio de temporada durante la sala, replay antiguo accesible solo según permisos, índices/constraints por mundo.

**Revisar si:** la distribución física de mundos cambia; la semántica no debe romperse.

---


# ADR-0035: Instrumentación y presupuestos medidos antes de escalar

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** el RTS consume CPU y red distintos del backend de mundo. Escalar sin medir puede llevar a infraestructura costosa o mala experiencia.

**Decisión:** establecer baseline p50/p95 de tick, RTT, sesiones, bytes/s, FPS, memoria, reconexiones, commits y fallbacks. Health/metrics del servidor táctico y correlation IDs entre API, worker y rooms. Definir objetivos de laboratorio, no promesas absolutas hasta benchmark externo.

**Alternativas:** CPU como única métrica (ciega a red y UX); instalar stack enorme de observabilidad de inicio (sobrecosto); logs sin correlación (difícil depuración).

**Consecuencias:** tiempo inicial en instrumentación y pruebas, reducción de incertidumbre/costos.

**Invariantes / pruebas:** stress test documentado con hardware, versión del juego y número de rooms; backend estratégico sano durante saturación RTS; rollback medido y ejecutable.

**Revisar si:** la escala o SLO exige monitoreo gestionado o un recolector central.

---


# ADR-0036: Rollout por mundo, fallback y migraciones aditivas

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** una actualización táctica no puede destruir el progreso de una temporada o impedir la victoria de Maravilla.

**Decisión:** flags `TACTICAL_BATTLES_ENABLED`, `TACTICAL_MAX_ROOMS`, `TACTICAL_ELIGIBILITY`, `TACTICAL_INVITE_TIMEOUT`. Publicar primero duelos de entrenamiento, luego un mundo de prueba, después una proporción pequeña de encuentros elegibles en un mundo beta. Migraciones DB aditivas y expand/contract sin borrado inmediato. Rollback desactiva invitaciones nuevas y resuelve pendientes con política AUTO.

**Alternativas:** activación global en todos los mundos (alto riesgo); migraciones destructivas (rollback imposible); degradación con batallas indefinidas (bloqueo).

**Consecuencias:** más fases de despliegue y mantenimiento de compatibilidad, con incidentes acotados y control.

**Invariantes / pruebas:** rollback bajo carga, resultado único en salas que estaban activas, cambios de configuración por mundo persistidos, controles de permisos administrativos.

**Revisar si:** funcionamiento estable y métricas permiten adopción general.

---


# ADR-0037: Entrenamiento RTS sin consecuencias persistentes como primera puerta

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** probar un RTS afectando desde el primer día los ejércitos reales expone recursos y rankings a fallos de red, balance y reglas.

**Decisión:** Gate 1 implementa `TRAINING` con ejércitos/escenarios sintetizados desde catálogos, sin reserva real ni recompensas de poder. Solo después de pruebas de estabilidad y balance se habilita `WORLD_PVP` con consentimiento bilateral.

**Alternativas:** probar únicamente con mocks (no revela problemas de red reales); desplegar PvP persistente sin entrenamiento (riesgo de pérdidas reales).

**Consecuencias:** inversión en una modalidad de bajo riesgo, útil a futuro como tutorial y torneo no puntuable.

**Invariantes / pruebas:** un resultado `TRAINING` jamás puede crear un `resource_ledger` ni modificar `unit_stacks`/rankings, incluso si se reenvía por endpoint interno.

**Revisar si:** modalidad de entrenamiento alcanza usuarios estables y puede expandirse a torneos cosméticos, sin alterar el balance.

---

