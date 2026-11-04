# PRD — Reinos de la Frontera — MVP 2.0

**Estado:** Propuesto para implementación, pendiente de aprobar mediante vertical slice · **Fecha:** 2026-11-04 · **Versión:** 2.0.0  
**Producto:** MMORTS medieval web 3D por temporadas · **Idioma inicial:** español · **Nombre:** provisional.  
**Base normativa:** PRD MVP 1.0 y ADR-0001 a ADR-0020. Este PRD **extiende** MVP 1; no lo reemplaza.

> **Aclaración de alcance.** El MVP 1 es una temporada completa jugable con economía, ciudades 3D, civilizaciones, mundo persistente, NPC, transporte naval asíncrono, alianzas, PNA, confederaciones, premios y rankings semanales y victoria por Maravilla nivel 100. MVP 2 añade una experiencia táctica RTS **optativa y justa** sobre ese sistema existente. Los valores de balance, límites de capacidad y objetivos de rendimiento aquí son hipótesis de diseño, no resultados medidos. Toda modificación del resultado persistente debe pasar por el backend autoritativo.

## 1. Resumen ejecutivo

Crear **batallas terrestres tácticas 3D de duración limitada** a las que ambos adversarios pueden optar de manera explícita, manteniendo inalterado el funcionamiento automático de guerras si alguno está desconectado, rechaza, pierde conexión o no es elegible. Los jugadores controlan **formaciones de unidades**, no miles de entidades individuales. El servidor de batalla ejecuta una simulación de pasos de tiempo fijos y valida órdenes; PlayCanvas representa el combate con soldados, caballería, arqueros, animaciones, proyectiles, terrenos y fortificaciones con calidad visual coherente con MVP 1.

Se añaden espectador autorizado, registros reproducibles de órdenes/eventos, resultados idempotentes, interfaz de invitación/aceptación, telemetría y herramientas de QA con agentes. Los sistemas de alianzas, PNA, confederaciones, rankings, recompensas semanales, navegación y Maravillas continúan operativos y solo se integran mediante eventos canónicos.

### Diferenciación
- **Persistencia sin exigencia de conexión:** nunca se necesita estar en línea para defender territorio.
- **Táctica voluntaria:** un encuentro en vivo cambia decisiones tácticas solo cuando ambos bandos aceptan las reglas.
- **Sin héroes, magia ni pay-to-win:** protagonismo de regimientos, logística, hospitales, sacerdotes de apoyo y tecnología.
- **Arte 3D final:** nada de cubos/palitos para contenido publicable; modelos con PBR, rig y LOD auditados.
- **Operación mínima:** un único proceso de Colyseus para las primeras salas, PostgreSQL como fuente de verdad y ningún Redis/Kafka/Kubernetes por defecto.

## 2. Principios no negociables

1. **MVP 1 no se rompe:** economía, colas PostgreSQL, trabajadores, combate automático, rankings, PNA, ciudades NPC, transporte naval y Maravilla continúan incluso si el servidor de batalla está caído.
2. **Servidor autoritativo:** el navegador envía intenciones (`MOVE`, `ATTACK`, `HOLD`, `RETREAT`, `ABILITY`), nunca daño, bajas o recursos concluyentes.
3. **Idempotencia transaccional:** el resultado de una batalla se aplica una sola vez a las tablas del mundo.
4. **Consentimiento bilateral:** nadie obtiene ventaja obligando a un defensor ausente a participar en combate en vivo.
5. **Mismo universo de reglas:** las estadísticas, tipos de unidades, modificadores, facultades de sacerdotes, murallas y tecnologías provienen de `game-config` versionado.
6. **Aislamiento entre mundos:** todas las solicitudes y tickets están ligados a `world_id` y `season_id`.
7. **Operación por capacidad:** número de salas, entidades, ancho de banda, CPU y memoria limitados por configuración y pruebas de carga.

## 3. Objetivos del MVP 2 y medición

| ID | Objetivo | Evidencia de aceptación |
|---|---|---|
| O2-01 | Mantener la continuidad completa del MVP 1 | Suite de regresión M1 en verde, ninguna migración destructiva |
| O2-02 | Combate táctico terrestre bilateral | Dos navegadores se conectan, ordenan formaciones y finalizan un encuentro |
| O2-03 | Defensa offline segura | Defensa automática ante rechazo, timeout, servidor inaccesible o ausencia |
| O2-04 | Cero duplicación de bajas/botín | Tests de resultados duplicados, concurrencia, reinicio y reintentos |
| O2-05 | Calidad gráfica coherente | Capturas en PlayCanvas, GLB validados y presupuestos visuales cumplidos |
| O2-06 | Operación económica | Batalla server activable/desactivable sin cambiar el resto del juego |
| O2-07 | Telemetría accionable | Métricas de latencia, tick, ancho de banda, reconexiones y tasa de caída |

**Objetivos iniciales de diseño, por validar:** encuentros de 2 bandos, 1 comandante por bando, máximo 12 formaciones por bando (24 total), ~8–30 personajes visuales por formación, duración táctica máxima 5 minutos, tick lógico 10 Hz (evaluar 20 Hz), render cliente independiente a 30–60 FPS. Los límites son *configuración*, no promesas de rendimiento ni números de capacidad avalados por pruebas.

## 4. Público y recorridos

**Jugador estratégico:** mantiene progreso offline y puede ignorar completamente las batallas tácticas. **Comandante RTS:** acepta invitaciones y usa órdenes de formaciones. **Diplomático/alianza:** puede ver informes, reforzar y coordinar guerras sin invalidar PNA. **Espectador autorizado:** observa la batalla con información limitada. **Administrador del mundo:** consulta incidentes, métricas y resultados sin modificar partidas silenciosamente.

**Recorrido UJ-01 (offline):** A ataca B → llega el ejército → B está desconectado → se ejecuta `AUTO` del MVP 1 → informe y replay representacional → estados coherentes.

**UJ-02 (rechazo):** A solicita opción táctica → B pulsa «Resolver automáticamente» → se ejecuta motor automático, sin penalidad especial para B.

**UJ-03 (aceptación):** A y B reciben invitación elegible → ambos aceptan dentro del plazo → el orquestador asigna un encuentro idempotente → ingresan a la misma sala mediante tickets efímeros → envían órdenes → el servidor decide bajas/ganador → API confirma resultado y cierra evento del mundo.

**UJ-04 (caída temporal):** B se desconecta a mitad del combate → el servidor asume su doctrina defensiva; B puede reconectarse si queda margen → nunca se le concede derrota técnica inmediata por una caída de red.

**UJ-05 (falla fatal):** sala se interrumpe y no hay resultado confirmado → se retoma desde checkpoint si es seguro; si no es viable, se aplica política predefinida de **resolución automática del mismo snapshot original**, una sola vez, con incidente auditable y aviso a ambos jugadores.

## 5. Alcance funcional P0 (imprescindible)

### FR2-001. Compatibilidad del mundo persistente
- Reutilizar sin duplicar tablas/servicios de mundos, temporada, ciudades, recursos, ejército y combate de MVP 1.
- Antes de crear una batalla, verificar `world_id`, temporada activa, propietario del ejército y derechos de la ciudad, PNA/confederación, guarnición y capacidad de la sala.
- Las operaciones económicas y la competición semanal no dependen de Colyseus.
- **Aceptación:** apagar `battle-server` no afecta a ciudades, NPC, premios, producción, viajes, PNA, Maravillas ni batallas automáticas.

### FR2-002. Elegibilidad del encuentro táctico
- Elegibles inicialmente: encuentros terrestres PvP entre jugadores humanos, 1 atacante/1 defensor, en un mundo activo, sin PNA que impida ataque, sin otro enfrentamiento táctico incompatible sobre las mismas tropas/ciudad.
- **No elegibles:** NPC, asaltos multi-alianza complejos, grandes asedios de Maravilla, encuentros cruzados de mundos, conflictos con unidades ya reservadas, naval, eventos sin cupo o con fallo de salud del servidor táctico.
- Configuración por mundo: `TACTICAL_BATTLES_ENABLED`, cupo, ventana de aceptación, tipos habilitados, cooldown y ratios de uso.
- Cuando no es elegible, el combate se resuelve como en MVP 1, sin bloquear el mundo.
- **Aceptación:** matriz de elegibilidad automatizada; 100% de rutas no elegibles preservan camino `AUTO`.

### FR2-003. Propuesta y consentimiento
- La invitación se emite al vencer un movimiento cuyo ataque es elegible; la solicitud táctica no es una orden irreversible ni garantiza cupo.
- Plazo propuesto de respuesta: 20 segundos. Solo si ambos aceptan antes del vencimiento se crea/activa la sala.
- Rechazo, silencio, vencimiento o falta de cupo ⇒ `AUTO` con el snapshot capturado.
- Desconectar o cambiar pestaña antes de aceptar no se interpreta como aceptación.
- **Aceptación:** el mismo `encounter_id` no puede aceptar y resolver automáticamente a la vez; invitaciones duplicadas no producen dobles salas.

### FR2-004. Reserva transaccional (escrow) de tropas
- Al llegar el ataque, el motor del mundo crea un snapshot inmutable de tropas, defensas, tecnologías, doctrinas, terreno y versión de reglas.
- Al aceptar ambos jugadores, reserva/compromete los grupos participantes sin bloquear la economía completa de la ciudad. Las tropas reservadas no pueden salir simultáneamente a otra misión ni participar en una segunda batalla.
- Ataques concurrentes a la misma ciudad se serializan por orden canónico o siguen ruta `AUTO` conforme a política. No congelar una ciudad por varios minutos.
- **Aceptación:** pruebas de dos llegadas simultáneas, refuerzos, reclutamiento y reintentos sin duplicar unidades.

### FR2-005. Sala RTS 3D
- Un campo de batalla local y separado de la vista mundial, generado desde plantillas de alta calidad con semilla y metadatos de terreno.
- Cámara RTS con pan, zoom, selección múltiple, indicadores de formaciones, minimapa y lectura accesible de órdenes.
- Las unidades visibles pueden renderizar cientos de soldados, pero las decisiones y colisiones de juego se calculan por **formaciones/escuadrones**, no por cada soldado visual.
- Comandos iniciales: mover, atacar objetivo, mantener, defender posición, cambiar formación, retirarse dentro de reglas, activar facultad colectiva limitada de sacerdote si aplica.
- Permitir soldados, arqueros, caballería y asedio ligero, más murallas de campo según escenario. No NPC individuales inteligentes por soldado.
- **Aceptación:** una sesión real entre dos clientes, terreno 3D no placeholder y feedback claro ante comando inválido.

### FR2-006. Simulación autoritativa
- El servidor Colyseus mantiene el reloj lógico, posiciones de formaciones, órdenes, objetivos, moral, fatiga, vidas agregadas y fase del encuentro.
- Inputs numerados, validados y limitados; rutas sobre grafo/navmesh 2.5D precalculado del escenario. Sin teletransportes ni daño definido por clientes.
- Simulación de tick fijo, ordenación estable de entradas y cuantización donde corresponda; se registran inputs/semillas y eventos suficientes para auditoría. No prometer identidad binaria entre plataformas sin comprobarla.
- **Aceptación:** paquetes repetidos, desordenados, fuera de límites, de otra facción o demasiado rápidos son rechazados sin afectar al estado.

### FR2-007. Reconexión y conducta offline
- Reconexión controlada por el servidor con ventana de gracia (p. ej. 30 s, configurable).
- Desconexión: doctrina preconfigurada pasa a manejar la formación y el combate continúa; reconectar permite recuperar control a partir del próximo tick válido.
- Si ambos dejan la sala, el servidor sigue o concluye según límites y timeout; jamás depende de tab abierto.
- **Aceptación:** pruebas con caída/reconexión, reload, baja de red, expiración y token caducado.

### FR2-008. Resultado único y reconciliación
- `battle-server` no modifica directamente `resource_balances`, `unit_stacks` ni `wonder_levels`.
- Emite resultado tipado con `encounter_id`, versión, checksum, bajas, botín y eventos; API NestJS valida procedencia y reglas de persistencia antes de confirmar.
- PostgreSQL aplica cambios y `world_event` en una transacción idempotente; resultado de Colyseus puede reintentarse sin repetir bajas ni botín.
- Si falla la confirmación, el encuentro queda `RESULT_PENDING` y se reintenta; el mundo detecta y recupera pendientes.
- **Aceptación:** reiniciar API, DB o battle server en medio del commit no altera el principio exactly-once **observable** para efectos del juego.

### FR2-009. Replay táctico y observación
- Durante el encuentro, espectador de alianza opcional con permisos y reglas anti-inteligencia: por defecto, ver solo al acabar; no revelar posiciones ocultas.
- Registrar metadata, snapshot, seed, cambios relevantes, órdenes y resultado. Compresión, retención, versión de simulador y checksum.
- Si la reproducción exacta no es garantizable, ofrecer replay basado en estados confirmados/eventos con etiqueta explícita, no inventar un resultado alternativo.
- Replays existentes del MVP 1 continúan marcados como representaciones de combates automáticos.
- **Aceptación:** resultado mostrado coincide exactamente con el registro persistente.

### FR2-010. Integración UX mundo/alianzas
- Tarjeta de elegibilidad e invitación de combate, tiempo restante, selección de «Táctica» o «Automática» y aviso del riesgo de entrar a una sala en vivo.
- Integración con reportes de guerra de alianzas, ranking ofensivo/defensivo y contribución semanal; usar el **mismo evento canónico** de bajas y resultados, no puntuar dos veces por jugar en táctico.
- PNA/confederaciones se verifican antes de emitir invitación y de aplicar daño; no modificar automáticamente diplomacia por participar en táctica.
- Batallas de Maravilla continúan automáticamente salvo una ADR futura que habilite un subtipo controlado.

### FR2-011. Arte y escenas 3D
- Assets comerciales originales/permitidos, escala coherente, texturas PBR y materiales compartibles.
- Nuevas animaciones: caminar, correr, ataque cuerpo a cuerpo, disparo, impacto, muerte, formación y retirada; rig reutilizable cuando sea compatible.
- Sangre y violencia gráfica moderada según clasificación objetivo; ajustes para reducir efectos y flashes.
- LOD, instancing, batching, culling, compresión glTF, límites de draw calls y texturas.
- **Aceptación:** inspección de geometría y animaciones, capturas en runtime, revisión visual de dos resoluciones, pruebas de rendimiento bajo carga controlada.

### FR2-012. Observabilidad, operación y seguridad
- Dashboard: salas activas, cola de invitaciones, duración por tick, desviación de tick, latencia RTT, envíos/s, desconexiones, recuperación, CPU/RAM, fallbacks, fallos de commit y batallas inconclusas.
- Feature flags por mundo y global; interruptor de emergencia que enruta nuevas batallas a `AUTO` sin borrar salas activas.
- WSS/HTTPS, tickets efímeros y de un uso, validación de procedencia, autorización por mundo, límites por usuario/IP, límites por tamaño de mensaje.
- **Aceptación:** pruebas de carga y chaos, logs sin credenciales ni tokens completos, respuesta documentada a incidentes.

## 6. Alcance P1 (deseable después de P0 estable)

- FR2-101: partidas de entrenamiento sin efecto sobre recursos/tropas del mundo, con IA doctrinal.
- FR2-102: replay descargable/compartible entre miembros autorizados de la alianza.
- FR2-103: formaciones avanzadas (línea, cuña, escaramuza, protección de arqueros), varias doctrinas por civilización.
- FR2-104: fortificaciones tácticas con puertas, puntos de cobertura y destrucción visual autorizativa.
- FR2-105: mejoras de agua y puertos **visuales** en batallas costeras; los viajes navales asíncronos siguen vigentes.
- FR2-106: configuración de accesibilidad (teclas remapeables, daltónicos, efectos, indicadores de selección).

## 7. Fuera de alcance para MVP 2

- Combate naval RTS vivo de flotas: **fase posterior MVP 2.1 / MVP 3**, dependiente de prueba técnica específica.
- MMO de mundo entero en tiempo real con miles de jugadores sobre la misma escena; cada batalla es una instancia aislada.
- 1.000 unidades con IA independiente por jugador, pathfinding 3D individual por cada soldado, física balística por proyectil visual.
- Héroes, unidades con inventario personal, resurrección mágica, hechizos o clases heroicas.
- Microservicios generalizados, Kafka, Kubernetes, Redis como requisito inicial, GPU de inferencia en runtime, bots con LLM a cada tick.
- Batallas no consentidas que obliguen a los defensores a estar conectados.
- Transferencia de tropas entre mundos o ventajas persistentes entre temporadas.

## 8. Reglas detalladas de batalla

### 8.1 Máquina de estados

`ARRIVED → SNAPSHOTTED → OFFERED → (AUTO_PENDING | TACTICAL_RESERVED) → (AUTO_RESOLVING | ROOM_ALLOCATING) → (AUTO_RESULT_PENDING | LIVE | FALLBACK_PENDING) → RESULT_PENDING → APPLIED → CLOSED`.

El rechazo/timer pasa a `AUTO_PENDING`. Los nodos `APPLIED/CLOSED` son terminales. Se admiten reintentos de trabajo y eventos outbox, no cambios arbitrarios de estado. Prohibir `LIVE` → `AUTO_PENDING` sin pasar por la política de fallo versionada.

### 8.2 Temporización de referencia

- Ventana de invitación bilateral: **20 s** desde emisión.
- Tiempo para conectar a sala después de asignación: **15 s**.
- Tiempo de combate táctico: **hasta 300 s**.
- Ventana de reconexión: **30 s** desde desconexión involuntaria.
- Expiración de ticket: **60 s**, una sola vez.
- Tick lógico: **10 Hz** por defecto y benchmark hacia 20 Hz.

Son defaults configurables por mundo y no deben alterarse durante un encuentro ya iniciado.

### 8.3 Victoria y bajas

- Derrota por eliminación/incapacidad de formaciones, objetivo militar cumplido o agotamiento del tiempo con resolución definida por `rulesetVersion` (no por azar del cliente).
- Retirada limitada, con pérdidas y botín definidos en reglas; no se permite escape gratuito.
- Hospitales y sacerdotes siguen siendo sistemas agregados; la cantidad de heridos recuperables se calcula al cerrar el encuentro en PostgreSQL, no con llamadas a IA.
- Bonificaciones de civilización desde `game-config`; al iniciar se congela el snapshot con investigación, moral y doctrina.
- El modo táctico no añade por sí mismo puntos extra en rankings: puntuación canónica por daño, defensa y contribución, con controles contra farming.

### 8.4 Colisiones y navegación

- Representación 2.5D del terreno de batalla, rutas por navmesh o malla de navegación generada/validada **fuera del tick**.
- Navegación por centro de formación; soldados individuales interpolan posiciones visuales, sin resolver pathfinding por individuo.
- Colisiones y alcance relevantes en servidor; proyectiles puramente visuales en cliente solo si ya existe evento de disparo/impacto confirmado.

## 9. Integración con los sistemas heredados

| Sistema MVP 1 | Comportamiento en MVP 2 |
|---|---|
| Mundos y temporadas | Misma tabla/configuración; `world_id` obligatorio en sala/ticket/resultado |
| Economía/producción | No cambia; las batallas no bloquean recursos de ciudades por minutos |
| Hospitales/sacerdotes | Reglas aplicadas al snapshot y resultados después del commit |
| Civilizaciones y edificios únicos | Mismos tipos, assets; ampliación de animaciones/skills militares |
| NPC anárquicos | Continúan combate AUTO; táctico de entrenamiento sin persistencia opcional P1 |
| Oasis/ríos/lagos | Determinan terreno o modificadores, no motor 3D mundial continuo |
| Transporte naval/puertos | Sigue asíncrono y autoritativo; combate naval RTS posterior |
| PNA y confederaciones | Validación antes de encuentro y antes de cierre; aliados no violan PNA por bug de UI |
| Rankings globales/internos/alianzas | Se actualizan con único evento canónico; no doble score |
| Premios semanales | Mismo cierre inmutable, sin recompensas extra solo por aceptar táctica |
| Maravilla 100 | La victoria y sus asedios complejos siguen en motor AUTO de MVP 1 |

## 10. Modelo de datos: extensiones no destructivas

Se propone añadir:

- `battle_encounters`: `id`, `world_id`, `season_id`, `movement_id`, `mode`, `state`, `ruleset_version`, `seed`, `snapshot_hash`, `snapshot_json`, `offer_expires_at`, `version`, `created_at`, `updated_at`. Unicidad por movimiento/evento elegible.
- `battle_participants`: `encounter_id`, `world_id`, `player_id`, `side`, `accepted_at`, `connected_at`, `last_seen_at`, `disconnect_state`. Unicidad por `(encounter_id,side)`.
- `battle_reservations`: `encounter_id`, `world_id`, `army_id`, `unit_stack_id`, `qty`, `status`; comprobaciones de reserva / no duplicación.
- `battle_rooms`: `encounter_id`, `room_id`, `server_id`, `status`, `started_at`, `ended_at`, `last_heartbeat_at`.
- `battle_inputs`: `encounter_id`, `tick`, `side`, `sequence`, `payload`, `accepted`, `reason` (opcional almacenar por segmentos para controlar volumen).
- `tactical_results`: `encounter_id` PK, `result_hash`, `result_json`, `commit_status`, `committed_at`. **No sustituye** la tabla `battle_results` canónica del MVP 1; la aplicación transaccional desemboca en la tabla y eventos existentes.
- `battle_replays`: `encounter_id`, `schema_version`, `asset_uri`, `checksum`, `size_bytes`, `visibility`, `retention_expires_at`.
- `battle_incidents`: `encounter_id`, `kind`, `policy_applied`, `correlation_id`, `details_redacted`, `resolved_at`.

**Restricciones esenciales:** FK de mundo en las referencias pertinentes; `UNIQUE(world_id, movement_id)`; `UNIQUE(encounter_id)` en `tactical_results`; resultados no aplicables en otro mundo/temporada; `CHECK qty > 0`; índices por `state`, expiración y `world_id`. Ejecutar migraciones aditivas, sin destruir tablas M1.

## 11. Contratos y API

### REST NestJS

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/worlds/:worldId/battles/:id` | Estado visible y permisos |
| `POST` | `/worlds/:worldId/battles/:id/respond` | Aceptar/rechazar, idempotencia y versión |
| `POST` | `/worlds/:worldId/battles/:id/join-ticket` | Ticket corto, de un uso y por rol |
| `GET` | `/worlds/:worldId/battles/:id/result` | Resultado canónico, no cálculo cliente |
| `GET` | `/worlds/:worldId/battles/:id/replay` | Manifest autorizado del replay |
| `GET` | `/worlds/:worldId/battle-config` | Elegibilidad, límites y versión publicada |

Los endpoints de commit entre servidores son **internos** autenticados; el navegador no puede usarlos. Cada comando mutador incluye idempotency key y versión esperada o precondición.

### WebSocket Colyseus (esquema de referencia)

- Cliente → servidor: `order.move`, `order.attack`, `order.hold`, `order.retreat`, `order.formation`, `control.ping` con secuencia y tick solicitado.
- Servidor → cliente: estado sincronizado por `@colyseus/schema`, `order.rejected`, `battle.phase`, `battle.event`, `battle.result.pending`, `battle.result.committed`.
- Snapshot mínimo: encuentro/versión, tick, fase, formaciones visibles, transformaciones cuantizadas, moral, objetivos y tiempo restante. No incluir información secreta de enemigos no descubiertos.
- Un ticket autoriza **un encuentro/rol/jugador/mundo**, caduca y se consume una vez; no es token genérico de sesión.

Ver [`contracts/battle-contracts.ts`](contracts/battle-contracts.ts) y [`contracts/battle.schema.json`](contracts/battle.schema.json) para contratos propuestos.

## 12. Arte, animación y UX

### Escenarios iniciales P0
1. **Llanura:** hierba, cultivos marginales, colinas suaves, bosques como bordes escénicos.
2. **Paso montañoso:** pendientes, rocas, cobertura y restricciones de camino.
3. **Defensa fortificada:** muros/puerta, patio y coberturas de madera/piedra.

### Paquete visual mínimo
- Dos civilizaciones visuales del MVP 1; modelos compatibles para infante, arquero, caballería y asedio ligero.
- Rig compartido cuando encaje; animaciones `idle`, `move`, `attack`, `hit`, `death`, `retreat`; efectos de impactos y selección.
- Terrenos y materiales PBR, decals ligeros, vegetación, iluminación ambiental coherente, proyectiles visuales sincronizados.
- Audio: órdenes, armas, ambiente y confirmaciones; controles de volumen.
- IA crea arte/conceptos/variantes durante desarrollo; **cada asset** debe pasar control de licencia, escala, geometría, UV, animación, compresión y revisión visual.

### Interfaz táctica
- Pantalla de oferta con opciones igual de claras «Participar» / «Resolver automáticamente».
- Temporizador sin manipulación desde navegador, indicador de conexión/latencia y fallback.
- Controles ratón: click seleccionar, shift selección, click derecho mover/atacar; teclado remapeable.
- Paleta accesible para seleccionar amigo/enemigo y estados de salud, no depender solo del color.
- UI adaptada a desktop; móvil conserva modo estratégico de M1, pero no promete RTS táctico completo.

## 13. Requisitos no funcionales y SLO iniciales

| ID | Requisito | Umbral inicial de laboratorio (a validar) |
|---|---|---|
| NFR2-001 | Frame rate cliente | 30 FPS p95 en equipo objetivo medio; 60 FPS deseable |
| NFR2-002 | Simulación | Tick lógico 10 Hz sin acumulación sostenida de backlog en la carga de prueba |
| NFR2-003 | Input | Rechazo de input no autorizado; secuencias monótonas por participante |
| NFR2-004 | Red | Mediciones RTT, bytes/s y pérdida; adaptar frecuencia de difusión a pruebas |
| NFR2-005 | Robustez | Reintento y recuperación sin duplicar bajas, botín o puntaje |
| NFR2-006 | Seguridad | WSS, tickets caducables, validación por mundo/rol, rate-limit |
| NFR2-007 | Compatibilidad | Chrome/Firefox/Edge actuales en escritorio; degradación gráfica probada |
| NFR2-008 | Operación | `battle-server` apagado -> todas las batallas AUTO sin degradar core |
| NFR2-009 | Replays | Mismo ganador, bajas y botín que fuente canónica |
| NFR2-010 | Assets | Manifest de licencias/LOD/rig/clip/checksum por asset |

**No prometer miles de jugadores simultáneos sobre una sola sala.** La capacidad real se determina por número de salas simultáneas, CPU por tick, tráfico y memoria; se dimensiona antes de apertura pública.

## 14. Seguridad y abuso

Amenazas: edición de paquetes de órdenes, speedhack (cliente no controla tick), manipulación de fog-of-war, repetición de tickets, movimientos imposibles, desincronización, doble reserva de tropas, falsificación de resultado, abuso de invitaciones, farming de ranking, abuso de replays y filtración de posiciones de Maravilla.

Controles: validación server-side; límites de órdenes/s, tamaño de payload y geometría; ticket un uso + TTL + `jti`; mTLS o credenciales rotadas entre servidores; commit por backend con verificación de `encounter_id`, `world_id` y versión; logs redactados; historial auditable; privacidad de replays y permisos de confederación.

La IA agente no debe ejecutar scripts arbitrarios descargados sin revisión ni registrar secretos en repositorios. Los servidores MCP con ejecución Python local deben permanecer en `localhost`.

## 15. Observabilidad y runbooks

Métricas mínimas:
- `battle_rooms_active`, `battle_offer_timeouts_total`, `battle_fallback_total{reason}`, `battle_commit_retries_total`, `battle_tick_duration_ms`, `battle_rtt_ms`, `battle_room_memory_bytes`, `battle_disconnect_total`, `battle_invalid_orders_total`, `battle_snapshots_bytes`.
- Correlación `world_id`, `encounter_id` y `correlation_id` (sin datos personales de contenido libre).
- Alarmas iniciales por cuartos de salud: fallas consecutivas de tick, rooms sin heartbeat, resultado pendiente excesivo, tasa de fallback anómala.
- Runbooks: caída Colyseus, no carga de sala, incidente de doble commit, replay corrupto, ataque simultáneo a Maravilla, pérdida de conectividad general.

## 16. Entrega por puertas (gates)

**Gate 0 — Congelar compatibilidad y benchmark:** contratos de M1, pruebas de regresión, matriz de datos, benchmark de un mapa/24 formaciones renderizadas con arte final.

**Gate 1 — Duelo aislado sin persistencia:** Colyseus en 1 proceso, 2 clientes, órdenes, movimiento, batalla de entrenamiento, reconexión, test de paquetes manipulados; sin afectar M1.

**Gate 2 — Encuentros del mundo:** eligibilidad/invitaciones, snapshots, reservas, tickets, commits únicos, fallback; 2 jugadores con ciudades reales.

**Gate 3 — Producto y QA:** tres escenarios, UI final, informe/replay, integración con PNA, rankings, premios, hospitales/sacerdotes, assets aprobados.

**Gate 4 — Alfa controlada:** pruebas de carga, simulación de fallos, feature flag por mundo, monitoreo y rollback. Publicar solo si todos los gates anteriores se cumplen.

Detalle ejecutable: [`BACKLOG_MVP2.md`](BACKLOG_MVP2.md).

## 17. Definition of Done transversal

Una historia no está terminada solo porque compile: debe tener prueba de contrato, test positivo y adversarial, medición de recursos o justificación, captura real en PlayCanvas si tiene 3D, compatibilidad MVP 1, logs/metricas útiles, documentación y ningún secreto/asset sin licencia.

## 18. Riesgos y mitigación

| Riesgo | Estrategia |
|---|---|
| Jugador offline en desventaja | Consentimiento bilateral, AUTO por defecto, IA doctrinal en desconexión |
| Doble recompensa/bajas | Resultados `UNIQUE`, versión y commit PostgreSQL idempotente |
| Sala cae y deja tropas bloqueadas | `lease`/heartbeat y reconciliación con política AUTO desde snapshot |
| CPU explode por soldados | Simulación por formación; render instanced; límites configurables |
| Mala latencia desde Chile | Región cercana al público objetivo; evaluar RTT antes de invitar |
| Diferencias AUTO vs táctico desequilibradas | Simulaciones estadísticas, telemetría y límites de elegibilidad |
| Assets IA inconsistentes | Guía artística, calibración, rig común, QA visual, procedencia |
| Alteración de estadísticas de ranking | Misma fuente de eventos canónicos y reglas antifarming M1 |
| Replays filtran información | Visibilidad por rol, fecha de publicación y autorización backend |
| Complejidad operativa | Un proceso Colyseus, flags, fallbacks, mantener PostgreSQL |

## 19. Decisiones abiertas (no bloquean Gate 0)

- Definir tras playtesting si PvP táctico persiste para todos los ataques elegibles o solo duelos pactados (el valor inicial más seguro es consentimiento bilateral para enfrentamientos básicos).
- Capacidad de formaciones por sala en hardware objetivo.
- Ventaja máxima del jugador táctico respecto del AUTO, a medir con simulaciones y feedback.
- Política exacta de colisión de ataques simultáneos; debe fijarse en ADR específica y testearse.
- Retención de replays por mundo, costo de almacenamiento y permisos de alianzas.
- Clasificación etaria objetivo y nivel de violencia de animaciones.

## 20. Referencias técnicas oficiales (consultadas 2026-11-04)

- Colyseus — Getting Started / skill: https://docs.colyseus.io/getting-started
- Colyseus — Crear servidor: https://docs.colyseus.io/getting-started/server
- Colyseus — State synchronization: https://docs.colyseus.io/state
- Colyseus — Reconexión: https://docs.colyseus.io/room/reconnection
- Colyseus — Despliegue: https://docs.colyseus.io/deployment
- PlayCanvas — Skills: https://github.com/playcanvas/skills
- PlayCanvas — Editor MCP: https://developer.playcanvas.com/user-manual/editor/mcp-server/
- Blender MCP comunitario: https://github.com/ahujasid/mcp-for-blender

**No implementado:** este documento es especificación, no prueba de que las funcionalidades existan en el repositorio.
