# PRD — Reinos de la Frontera — MVP 1.0

**Estado:** Propuesta para implementación · **Versión:** 1.0 · **Fecha:** 2026-11-03  
**Tipo:** MMORTS web 3D por temporadas · **Idioma:** Español · **Nombre:** provisional  
**Documentos relacionados:** `docs/adr/`, `GUIA_IA_INSTALACION.md`, `BACKLOG_MVP1.md`, `AGENTS.md`.

> Este PRD captura el producto consensuado y explicita decisiones nuevas como **propuestas por defecto** para hacer implementable el MVP. Todo parámetro de balance es configurable/versionado y requiere pruebas. No usar nombres, diseños, modelos ni material protegido de Travian/Age of Empires.

## 1. Resumen ejecutivo

Juego web de estrategia medieval 3D que combina: (1) ciudades vistosas con construcciones y ejércitos animados, (2) mundo persistente con economía y logística offline, (3) guerras terrestres y navales asíncronas, (4) alianzas, pactos de no agresión y confederaciones, (5) rankings globales/internos/por alianza y premios semanales, y (6) final de temporada por conquista, abastecimiento y construcción de una **Maravilla de nivel 100**. No hay héroes.

**MVP 1 no equivale a una demo mínima:** es una **primera temporada completa en alfa** con pocos tipos de assets, dos civilizaciones y combate automático. Las batallas tácticas 3D controlables se reservarán a MVP 2 por riesgos de balance, coste y latencia.

## 2. Visión, promesa y objetivos

### Promesa al jugador
- Construir y evolucionar una ciudad tridimensional atractiva, con edificios reconocibles, habitantes y unidades animadas.
- Competir con otras personas en un mundo persistente aun estando desconectado.
- Elegir una civilización con identidad visual y diferencias estratégicas equilibradas.
- Dominar territorios, oasis, islas, rutas y aldeas NPC; comerciar o combatir con tropas y barcos.
- Hacer política: crear alianzas, declarar guerras, pactar no agresión y formar confederaciones.
- Progresar semanalmente en clasificaciones y buscar la victoria final mediante la Maravilla.

### Objetivos MVP 1
O1. Ejecutar al menos una temporada completa de principio a fin.  
O2. Ofrecer un mundo 3D detallado, sin dependencia de assets placeholder para las funcionalidades publicadas.  
O3. Lograr consistencia transaccional en ataques, construcciones, recursos y recompensas.  
O4. Mantener operación de coste contenido, sin GPU de servidor ni LLM en runtime.  
O5. Tener automatización de arte, código, pruebas y revisión visual con agentes de IA, con puerta de calidad humana.

### No objetivos de MVP 1
- Combates RTS en vivo, manipulación de unidades segundo a segundo, PvP naval en tiempo real.
- Física hidrodinámica continua, recorrido individual de NPC por todo el mundo, ciudad totalmente libre sin reglas de parcelas.
- Cinco civilizaciones desde día uno, héroes, objetos equipables, magia, tienda pay-to-win, matchmaking competitivo táctico.
- Microservicios, Kubernetes, Kafka, Redis/Valkey/BullMQ o múltiples bases sin evidencia de necesidad.
- Generación 3D por IA en producción para cada jugador; se generan y validan assets en desarrollo.

## 3. Público y experiencia
- **Estratega casual:** entra algunas veces al día, desarrolla producción, consulta informes, coopera sin horarios rígidos.
- **Comandante competitivo:** planifica ejércitos, ataques, asedios y ventanas de llegada.
- **Diplomático:** forma pactos, confederaciones, abastece fortalezas y gestiona alianzas.
- **Explorador/comerciante:** coloniza islas, domina oasis y rutas de mar.

**Plataformas:** navegador de escritorio primero, ratón/teclado; móvil inicialmente como visor/gestión simplificada, no promesa de 3D completo en todas las gamas. Idioma español de salida, arquitectura preparada para i18n.

## 4. Alcance funcional y prioridades

Prioridades: **P0** imprescindible para temporada funcional; **P1** necesario para la alfa completa, pero se habilita después del primer vertical slice; **P2** posterior al MVP.

| ID | Sistema | Prioridad | Condición MVP 1 |
|---|---|---|---|
| FR-001 | Cuenta, sesión y perfil | P0 | Registro/autenticación segura y sesión por mundo |
| FR-002 | Mundos separados por temporadas | P0 | Aislamiento de propiedad, ejército, puntuación, alianzas y recursos |
| FR-003 | Ciudad 3D con parcelas | P0 | Cámara libre restringida, edificios con 3 estados visuales y selección |
| FR-004 | Economía offline | P0 | Producción, consumo, capacidad, precisión fija y liquidación temporal |
| FR-005 | Construcción y reclutamiento | P0 | Colas transaccionales con hora de finalización persistida |
| FR-006 | Ejército y movimiento | P0 | Viajes terrestres con salida, llegada y retorno |
| FR-007 | Combate automático autoritativo | P0 | Ataca y defiende offline; bajas y saqueo reproducibles |
| FR-008 | Informes de batalla | P0 | Reporte de fuerzas, bajas, botín y eventos visualizables |
| FR-009 | Mapa mundial con terreno/agua | P0 | Regiones navegables, mares/ríos/montañas e islas identificables |
| FR-010 | Civilizaciones asimétricas | P0 | Dos civilizaciones con assets, edificio y unidad distintivos |
| FR-011 | Alianzas y roles | P0 | Crear, invitar, expulsar, nombrar cargos, abandonar |
| FR-012 | Oasis | P1 | Conquista, guarnición y bonificación limitada de recursos |
| FR-013 | Puertos y transporte naval | P1 | Rutas válidas, barcos de transporte, carga/descarga |
| FR-014 | Aldeas anárquicas NPC | P1 | Estados y decisiones por reglas, saqueo/conquista/comercio básico |
| FR-015 | Hospitales, templos y sacerdotes | P1 | Heridos recuperables, moral/cultura y apoyo no heroico |
| FR-016 | PNA entre alianzas | P1 | Solicitud, doble aceptación, vigencia, ruptura, auditoría |
| FR-017 | Confederaciones | P1 | Máximo configurable, liderazgo y permisos de cooperación |
| FR-018 | Clasificaciones | P1 | Global por jugador, por alianzas e interna; filtros período/categoría |
| FR-019 | Premios semanales | P1 | Corte UTC determinista, premios únicos y antiabuso |
| FR-020 | Maravillas hasta 100 | P1 | Sedes estratégicas, recursos, contribuciones, asedios y victoria |
| FR-021 | Historial de temporadas | P1 | Cierre inmutable, ganadores, premios y mundo archivado |
| FR-022 | Panel administrador | P1 | Pausar mundo, inspeccionar eventos, moderar y corregir con auditoría |
| FR-023 | Batallas tácticas 3D | P2 | Solo con partida autoritativa y diseño posterior |
| FR-024 | PvP naval táctico | P2 | Fuera del MVP 1 |

## 5. Mundo, temporadas y reglas de victoria

### 5.1 Entidad `World`
Cada mundo tiene `world_id`, semilla de generación, `ruleset_version`, velocidad (1x por defecto), estado (`PLANNED`, `OPEN`, `WONDER_ERA`, `FINALIZING`, `ARCHIVED`), inicio, cierre, política de protección y calendario de premios. Toda entidad de gameplay reside en un mundo. No se transfieren tropas, recursos, ciudades ni progreso entre mundos.

**Mapa MVP:** generado con semilla, regiones con coordenadas enteras, celdas de terreno (`PLAIN`, `FOREST`, `MOUNTAIN`, `RIVER`, `COAST`, `SEA`, `ISLAND`, `OASIS`, `NPC`, `WONDER`); se valida conectividad navegable, distancias y distribución equilibrada de ubicaciones iniciales. El cliente descarga regiones visibles, no el mapa entero con sus assets.

### 5.2 Cronología
1. **Colonización:** fundación, economía, reclutamiento.
2. **Expansión:** oasis, islas, comercio, guerras y diplomacia.
3. **Era de las Maravillas:** se liberan sedes especiales y requisitos de construcción.
4. **Resolución:** nivel 100 activa verificación y ventana final configurable (propuesta inicial 24 h); si la Maravilla se destruye o deja de cumplir condiciones, se suspende/cancela el cierre conforme al ruleset.
5. **Archivo:** se congelan resultados y se muestran ganadores e historial; nuevos mundos comienzan en cero.

### 5.3 Maravilla
- Cada mundo ofrece entre 2 y 4 emplazamientos de Maravilla en regiones disputadas (configurable).
- Una alianza controla el emplazamiento y financia la mejora; los aliados pueden donar conforme a reglas de diplomacia.
- `wonder_level` en [0,100]. Cada mejora consume recursos y tiempo; materiales y tiempos crecen por tabla de balance versionada, no fórmula hardcodeada.
- Ataques de asedio pueden causar daño de defensas o reducir niveles si satisfacen requisitos. La regla de reducción se versiona y audita.
- En la ventana final de la victoria, todo debe permanecer determinista ante concurrencia de ataques/llegadas y subidas de nivel.
- La alianza titular recibe la corona del mundo; socios confederados reciben reconocimiento verificable, sin apropiarse automáticamente del triunfo.

**CA-WON-01:** nunca pueden declararse dos ganadores en el mismo mundo.  
**CA-WON-02:** una victoria solamente puede confirmarse mediante transacción serializada del estado del mundo y la Maravilla.  
**CA-WON-03:** resultados, contribuciones y log de auditoría son recuperables tras reiniciar los procesos.

## 6. Civilizaciones, edificios y unidades

### 6.1 Civilizaciones MVP 1 (nombres provisionales)
- **Imperio de la Corona:** arquitectura pétrea, fortificaciones fuertes y Guardia de la Corona. Edificio: Bastión Imperial.
- **Liga de los Mares:** arquitectura portuaria, bonificaciones navales/comerciales y Galera ligera; en MVP la ventaja exclusiva puede ser tiempo/capacidad de transporte, no PvP naval táctico. Edificio: Arsenal Naval.

**Posterior:** Reinos del Norte, Confederación del Bosque y Orden del Sol. Las cinco siguen en la visión de producto, pero las tres últimas no son requisito de primera temporada.

No hay héroes, equipamiento personal ni progresión de personajes protagonistas.

### 6.2 Edificios iniciales
Centro urbano; aserradero; cantera; mina de hierro; granja; almacén; cuartel; hospital; templo; puerto (solo costa); edificio único de civilización; Maravilla (solo emplazamiento permitido). El MVP usa parcelas de construcción válidas y estados visuales por nivel (básico/intermedio/avanzado), sin obligar a tener 100 meshes distintos.

### 6.3 Tropas
Infantería, arqueros, caballería, asedio; **sacerdote** como soporte (no héroe); barco mercante/transporte con capacidad y velocidad. Cada tipo tiene coste, mantenimiento, tiempo de entrenamiento, velocidad, carga, ataque/defensa, clase y multiplicadores de terreno definidos en JSON/YAML validado y versionado.

### 6.4 Hospitales y sacerdotes
El resultado de cada combate distingue supervivientes, heridos recuperables y muertos. El hospital puede sanar hasta su capacidad, con tiempo y consumo. Los sacerdotes aportan bonificaciones colectivas acotadas según nivel de templo y reglas, nunca resurrección automática ni daño mágico. Los jugadores no pueden salvar indefinidamente tropas con reintentos.

## 7. Economía y persistencia

Recursos MVP: **madera, piedra, hierro, alimentos**. Los datos económicos se mantienen en unidades enteras de precisión fija, con restos de producción acumulables. Fórmula conceptual para un tramo sin cambios:

`produced = production_per_hour * elapsed_ms / 3_600_000` (calcular con enteros/racionales, aplicar capacidad y conservar resto).

Cada mutación económica ejecuta: bloqueo de saldos, liquidación hasta timestamp de servidor, validación de stock/capacidad, débito/crédito, registro `resource_ledger` y actualización transaccional. Si cambian tasas de producción, agotar primero tramo anterior. **No ejecutar un tick por segundo en cada aldea**.

**CA-ECO-01:** gasto concurrente no puede crear saldo negativo salvo mecánica explícita (hambruna) distinta.  
**CA-ECO-02:** reintentar una petición con `idempotency_key` produce el mismo resultado lógico.  
**CA-ECO-03:** una construcción termina aunque el dueño esté offline y no termina dos veces.

## 8. Construcción, ciudad 3D y navegación

### 8.1 Ciudad
- Selección de parcelas permitidas; rotación/zoom acotados, UI clara de tiempo, recursos y cola.
- Edificios reconocibles en GLB con PBR, colisión simplificada y al menos tres variantes de avance visual reutilizables.
- Habitantes animados y efectos decorativos solo donde sea rentable; no son simulación autoritativa de IA individual.
- Las mejoras visuales reproducen el estado real del servidor, nunca lo sustituyen.

### 8.2 Mapa marítimo
- No se puede cruzar mar a pie; ejército requiere puerto, transporte y capacidad.
- Ruta calculada en grafo de celdas/corredores navegables, con entrada/salida de costa, bloqueos futuros y ETA autoritativo.
- Navegación MVP: transporte/logística y rutas visibles; sin colisiones reales entre barcos ni PvP naval en tiempo real.
- Ríos son navegables solo en tramos marcados; puentes/estrechos condicionan el grafo terrestre.

### 8.3 Oasis
Captura con tropa/guarnición, límites por ciudad y bonificación económica limitada; al perder control, el sistema reevalúa producción desde ese instante y no reescribe producción histórica.

## 9. Aldeas NPC anárquicas

- Estados: `PEACEFUL`, `GROWING`, `DEFENSIVE`, `HOSTILE`, `RAIDING`, `RECOVERING`.
- Decisiones por árbol de comportamiento o máquina de estados con reglas, temporizadores y semilla reproducible.
- Recursos y tropas reales del mundo; pueden ser saqueadas, negociadas o conquistadas.
- En MVP, periodicidad por evento planificado, con cotas por región y por servidor para evitar miles de jobs innecesarios.
- No usan APIs de LLM para tomar decisiones operativas ni requieren GPU en producción.

**CA-NPC-01:** reiniciar un worker no duplica botines o conquistas.  
**CA-NPC-02:** un NPC no crea ejércitos/recurso por encima de sus reglas/versiones.

## 10. Guerra y combate offline

### 10.1 Orden de ataque
El servidor valida cuenta, mundo, ciudad, propietario, tropas disponibles, objetivo, capacidad de transporte y tiempo de salida. Se crea `army_movement` con `arrives_at` calculado por servidor. Los soldados quedan comprometidos y no pueden gastarse/enviarse dos veces.

### 10.2 Resolución
Al llegar: snapshot inmutable del atacante, defensor, terreno, murallas, doctrina, tecnología, suministros, semilla y `ruleset_version`; un motor de reglas puro calcula bajas, botín y daño; aplicación de resultados en una sola transacción. Devuelve informe persistente. Repetición 3D reconstruida de acontecimientos registrados, sin recalcular el resultado.

### 10.3 Desconexión y justicia
Defensor offline usa su doctrina previamente configurada; defensor online puede modificar la preparación solamente hasta fecha/hora de bloqueo. Ningún jugador necesita abrir el navegador. No hay ventaja automática por estar online en la hora exacta de impacto. Nuevas cuentas tienen protección por tiempo/criterios de desarrollo configurables. Ataques encadenados y órdenes concurrentes deben tener límites antiabuso.

### 10.4 Motor
`resolveBattle(input: BattleSnapshot): BattleResult` debe ser determinista ante igual entrada y versión, con PRNG controlado, sin `Math.random()` no sembrado ni usar hora actual dentro del motor.

## 11. Diplomacia y alianzas

### 11.1 Modelo
Alianza con fundador, líder, diplomático, oficial, miembro, cupo configurable, solicitud/invitación y auditoría. Un jugador pertenece como máximo a una alianza por mundo.

### 11.2 PNA
- Solicitud con emisor, receptor, reglas, vigencia y estados (`PROPOSED`, `ACTIVE`, `TERMINATING`, `EXPIRED`, `CANCELLED`).
- Aprobación por ambas partes y verificaciones de rol.
- **Política MVP propuesta:** bloquear nuevos ataques directos cubiertos por un PNA activo y advertir al cancelar; ataques ya en curso siguen la regla explícita publicada al iniciar, con resolución consistente. Para evitar pactos usados para escapar de ataques, la propuesta requiere un período de activación y una ventana de ruptura configurable.
- Los ataques de terceros y NPC no quedan cubiertos implícitamente.

### 11.3 Confederaciones
- Agrupan alianzas sin fusionarlas, con límite configurable por mundo (propuesta inicial: 3).
- Comparten colaboración diplomática y refuerzos autorizados, no automáticamente una sola propiedad de ciudades ni ranking global de alianza.
- Una alianza solo pertenece a una confederación por mundo; cambios con enfriamiento y auditoría.
- Contribuciones a Maravilla se atribuyen a la alianza propietaria y al donante, de forma independiente.

**CA-DIP-01:** acciones diplomáticas requieren permisos, trazabilidad y validación del mismo mundo.  
**CA-DIP-02:** revocar un PNA no reescribe resultados de batallas anteriores.  
**CA-DIP-03:** no existen confederaciones cíclicas/solapadas que eludan límites.

## 12. Clasificaciones y recompensas

### 12.1 Rankings
Tres ámbitos: **global por jugador**, **global por alianzas**, **interno por alianza**. Vistas: acumulado de temporada y semana cerrada/en curso. Categorías: población, ataque, defensa, saqueo, crecimiento económico, comercio, naval, conquistas, contribución a Maravilla. Un ranking interno puede añadir refuerzos, suministros y participación.

Puntuaciones provienen de un ledger verificable y snapshots derivados; no se agregan exclusivamente desde contadores del cliente. Registrar reglas de puntuación por `ruleset_version`.

### 12.2 Premiación semanal
Cierre **lunes 00:00 UTC** por defecto; UI traduce a hora local. Snapshot congelado por `world_id + week_key + category + scope`. Se entregan premios **una vez por semana** tanto a jugadores como a alianzas: medallas, títulos, estandartes y galería histórica. MVP evita recompensas militares/económicas que agranden brechas.

Antifraude: mínimo de participación, cambios de alianza con enfriamiento, detección de intercambios de ataques entre cuentas, trazabilidad y revisión administrativa. Las operaciones de premio deben ser idempotentes y recuperables.

**CA-RNK-01:** el mismo evento de combate no aporta dos veces puntos.  
**CA-RNK-02:** cerrar una semana dos veces no duplica premio ni cambia el resultado congelado.  
**CA-RNK-03:** cambiar de alianza cerca del cierre no permite duplicar aportaciones.

## 13. Requisitos no funcionales

| ID | Requisito | Criterio inicial de aceptación |
|---|---|---|
| NFR-001 | Disponibilidad | Reanudación sin pérdida lógica de eventos; recuperación probada en ensayo |
| NFR-002 | Consistencia | Cero duplicaciones de recursos, tropas, recompensas y victoria en pruebas de concurrencia |
| NFR-003 | Rendimiento API | p95 < 300 ms en endpoints CRUD simples a carga de alfa definida; medición documentada |
| NFR-004 | Renderizado | Objetivo 45–60 FPS a 1080p/calidad media en hardware de prueba documentado; degradación configurable |
| NFR-005 | Uso de red | Carga por región/escena; asset manifest con caché, tamaños y presupuesto por tipo |
| NFR-006 | Seguridad | TLS, contraseñas hasheadas, sesión protegida, rate limiting, control de permisos y entradas validadas |
| NFR-007 | Aislamiento | Tests negativos de acceso cruzado entre mundos para cada agregado crítico |
| NFR-008 | Observabilidad | Logs con `request_id`, `world_id`, `event_id`; métricas y alertas de worker atrasado |
| NFR-009 | Operación | Copias de PostgreSQL + ensayo documentado de restauración + retención definida |
| NFR-010 | Costos | Infraestructura MVP sin GPU y sin facturación de LLM en runtime normal |
| NFR-011 | Accesibilidad | UI legible, escala, contraste, navegación teclado de menús críticos |
| NFR-012 | Privacidad | Mínimos datos personales, política de retención y eliminación conforme a normativa aplicable |

Los objetivos de latencia/FPS son **hipótesis iniciales**; se validan con benchmarks y se revisan tras el vertical slice.

## 14. Seguridad y anti-cheat

- Servidor autoritativo en economía, tiempos, tropas, ETA, combate, recompensas y estado del mundo.
- Cliente nunca envía saldos definitivos, daños confirmados ni resultados de batalla.
- IDs públicos no reemplazan comprobaciones de autorización; validar pertenencia a `world_id` y permisos en cada comando.
- Argon2id o proveedor de identidad confiable; sesión en cookie segura/HttpOnly/SameSite o esquema revisado para clientes específicos.
- CSRF si se autentica por cookies; rate limits, validación de payload y tamaño, política CORS y CSP.
- Idempotencia de mutaciones y bitácora de operaciones económicas/diplomáticas.
- Detección de bots/multicuentas según términos y política publicada, sin exponer reglas internas explotables.
- MCP/IA de arte son herramientas locales de desarrollo, no endpoints accesibles por jugadores.

## 15. Diseño técnico: módulos y contratos

### 15.1 Arquitectura lógica
`apps/web` (React, Vite, PlayCanvas) consume API HTTP de `apps/api` (NestJS modular). `apps/worker` (mismo monorepo y librerías) toma eventos vencidos desde PostgreSQL. `packages/game-rules` contiene lógica pura; `packages/contracts` DTO/esquemas; `packages/asset-pipeline` valida y empaqueta GLB. WebSocket opcional únicamente para notificaciones visibles en MVP; polling HTTP como fallback. Assets estáticos en almacenamiento/CDN cuando sea necesario.

### 15.2 Módulos de dominio
`auth`, `worlds`, `map`, `civilizations`, `villages`, `economy`, `buildings`, `training`, `armies`, `movements`, `battles`, `npc`, `naval`, `alliances`, `diplomacy`, `rankings`, `awards`, `wonders`, `admin`, `game-events`.

### 15.3 Contratos API propuestos (no implementados)
- `POST /api/v1/worlds/:worldId/join`
- `GET /api/v1/worlds/:worldId/map?region=...`
- `GET /api/v1/worlds/:worldId/villages/:villageId`
- `POST /api/v1/worlds/:worldId/villages/:villageId/buildings`
- `POST /api/v1/worlds/:worldId/villages/:villageId/train`
- `POST /api/v1/worlds/:worldId/armies/:armyId/movements`
- `GET /api/v1/worlds/:worldId/battles/:battleId/report`
- `POST /api/v1/worlds/:worldId/alliances`
- `POST /api/v1/worlds/:worldId/diplomacy/pacts`
- `GET /api/v1/worlds/:worldId/rankings?scope=...&category=...&period=...`
- `GET /api/v1/worlds/:worldId/wonders`

Para mutaciones sensibles, recibir `Idempotency-Key`. Errores usan códigos de dominio (`INSUFFICIENT_RESOURCES`, `WORLD_MISMATCH`, `ARMY_ALREADY_COMMITTED`, `PACT_RESTRICTS_ATTACK`, etc.).

### 15.4 Tablas principales
`users`, `worlds`, `world_memberships`, `world_tiles`, `villages`, `village_plots`, `village_buildings`, `resource_balances`, `resource_ledger`, `training_queues`, `troop_stacks`, `armies`, `army_movements`, `battle_snapshots`, `battle_results`, `battle_events`, `npc_villages`, `oasis_ownership`, `naval_vessels`, `alliances`, `alliance_memberships`, `confederations`, `confederation_memberships`, `diplomatic_pacts`, `score_events`, `ranking_snapshots`, `award_grants`, `wonder_sites`, `wonder_levels`, `wonder_contributions`, `game_events`, `outbox_events`, `admin_audit`.

Las claves únicas y FK compuestas deben incluir `world_id` cuando se relacionen agregados de gameplay. `world_id` aislado en una columna **no** garantiza integridad por sí solo.

## 16. Rendimiento y estrategia de assets

Arte 3D realista estilizado (no cubos/palitos), PBR, glTF/GLB, atlas/compresión, texturas de tamaño restringido por categoría, geometría con LOD, pivotes y escalas consistentes, instancing para assets repetidos, animaciones compartidas. Los agentes IA generan fuera de producción. Cada asset necesita licencia/procedencia, manifest, validación automática y captura visual aceptada. Aceptación de asset: reconocible, sin geometría rota/partes flotantes, con colisión, materiales correctos y presupuesto de rendimiento. Medir draw calls/memoria, no fiarse solo del número de polígonos.

## 17. Instrumentación

Métricas de producto: D1/D7 de retención, duración de sesión, progreso de primera ciudad, nº ataques, nº alianzas, nº PNA/confederaciones, premiaciones, avance de Maravillas.  
Métricas de plataforma: latencia p95 HTTP, retraso del worker, eventos reintentados/dead-letter, transacciones fallidas, conexiones, tamaño de assets, FPS/memoria de escenas.  
Seguridad: operaciones denegadas, movimientos anómalos, intentos cross-world y duplicaciones bloqueadas.

No recolectar contenido o datos personales más allá de lo necesario.

## 18. Criterios generales de aceptación / definición de terminado

**Escenario integral de alfa**
1. Dos personas se registran y se unen al mismo mundo, eligiendo civilizaciones distintas; una tercera entra a otro mundo.
2. Cada una funda una ciudad con edificios 3D aprobados y producción real.
3. Cierran sus navegadores; horas después edificios y recursos se han actualizado correctamente.
4. Reclutan tropas, navegan hacia una isla con transporte, conquistan un oasis y atacan una aldea NPC.
5. Un jugador ataca la ciudad del otro mientras su defensa está offline; se registran bajas, heridos, botín y un informe coherente.
6. Crean alianzas; pactan PNA, después lo terminan según reglas; forman confederación.
7. Los rankings globales y de alianza muestran actividad real; la semana se cierra una sola vez y se emiten premios sin duplicados.
8. Una alianza abastece una Maravilla, llega al nivel 100, supera la condición final, gana y el mundo queda archivado.
9. Se demuestra que ninguna transacción ni ataque de un mundo afecta a otro.
10. Se reinicia API/worker deliberadamente durante procesos y la plataforma se recupera sin duplicaciones.

**Definition of Done por historia:** tests de dominio y API, pruebas visuales si aplica, permisos/cross-world, idempotencia, logging, documentación y revisión de assets/licencias. No declarar una funcionalidad terminada solo porque la IA generó código o una captura vistosa.

## 19. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Alcance muy amplio para "MVP" | Entregas verticales; primera temporada solo al pasar gates |
| Calidad inconsistente del arte IA | Style guide, assets ancla, validación, revisión y reutilización modular |
| Exploits de recursos y concurrencia | Ledger, invariantes, row locks, idempotencia y tests de estrés |
| Desbalance por recompensas | Premios cosméticos e históricos en MVP |
| Alianzas dominantes/confederaciones gigantes | Límites/cooldowns y métricas de concentración |
| Ganador doble por ataques simultáneos | Serialización transaccional y estado terminal único |
| Conexión marítima incorrecta | Grafo validado y tests de rutas imposibles |
| Sobrecarga 3D en navegador | LOD, instancing, culling, lazy loading y quality profiles |
| Proveedor IA cambia precio/licencia | Pipeline con herramientas sustituibles y registro de procedencia |

## 20. Fases / hitos sugeridos

- **Gate 0 — Arte representativo:** ciudad costera realista estilizada con castillo, granja, puerto, barco y soldados animados; todas las validaciones de assets.
- **Gate 1 — Vertical slice persistente:** dos jugadores/dos ciudades, economía offline, reclutamiento, ataque con desconexión, informe sin duplicados.
- **Gate 2 — Primera guerra:** mapa de regiones, NPC, oasis, barcos de transporte y rutas.
- **Gate 3 — Sociedad:** dos civilizaciones, alianzas, PNA, confederaciones, rankings y premios.
- **Gate 4 — Temporada completa:** Maravilla 100, cierre/archive y test de carga/recuperación.

Cada gate requiere demo, pruebas y mediciones antes de abrir el siguiente.

## 21. Preguntas abiertas (NO bloquean inicio)

- Límite definitivo de jugadores por mundo (medir antes de publicitar cifras).
- Máximo final de miembros por alianza y confederación (semillas iniciales configurables).
- Tiempo exacto de protección a nuevos jugadores, balance de heridos y naval.
- Duración objetivo por temporada y fecha de apertura de Maravillas.
- Política de reconexión durante futuras batallas tácticas MVP 2.

Las preguntas se resuelven mediante ADR o configuración de mundo, no por supuestos ocultos en código.

## 22. Fuentes técnicas consultadas

- PlayCanvas React: https://developer.playcanvas.com/user-manual/react/getting-started/installation/
- PlayCanvas Skills: https://developer.playcanvas.com/user-manual/getting-started/use-playcanvas-skills/
- PlayCanvas MCP: https://developer.playcanvas.com/user-manual/editor/mcp-server/
- PostgreSQL locking: https://www.postgresql.org/docs/current/sql-select.html
- NestJS: https://docs.nestjs.com/first-steps
- glTF Transform: https://github.com/donmccurdy/glTF-Transform
- Playwright: https://playwright.dev/docs/intro
