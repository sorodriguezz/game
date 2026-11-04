# PRD — Reinos de la Frontera — MVP 1.0

**Estado:** Propuesto para implementación · **Versión:** 1.0 · **Fecha:** 2026-11-03  
**Producto:** videojuego MMORTS medieval 3D, web, por mundos/temporadas  
**Nombre:** *Reinos de la Frontera* (provisional; pendiente de comprobación de marca)  
**Normativa de diseño:** este documento especifica MVP 1. Las cifras de balance y capacidad son **hipótesis configurables** sujetas a playtesting, no promesas de producción.

---

## 1. Resumen ejecutivo

Crear un videojuego de estrategia multijugador persistente que combine: desarrollo de ciudades y gestión de recursos, ejércitos y ataques asíncronos, visualización 3D de calidad, territorios con ríos y mares, flotas de transporte, oasis, ciudades NPC, civilizaciones asimétricas, diplomacia entre alianzas y competición semanal. Cada mundo independiente termina cuando una alianza construye, mantiene y valida una **Maravilla de nivel 100** conforme a las reglas del servidor.

El **juego debe funcionar con los usuarios desconectados**: producción, construcciones, desplazamientos, ataques, defensa NPC y premios semanales son procesos autoritativos. No hay héroes individuales. El MVP contiene combate automático + informe/reproducción 3D representativa; el **RTS táctico interactivo se reserva para MVP 2**.

**Tesis de producto:** un RTS estratégico persistente, inmersivo y accesible desde navegador, cuya profundidad depende de ciudades, economía, tropas, logística y colaboración — no de conexión permanente, compras de ventajas ni personajes heroicos.

## 2. Problema, público y propuesta de valor

### 2.1 Público objetivo
- Jugadores de estrategia persistente que buscan partidas de semanas y meses, alianzas y política.
- Jugadores de RTS que disfrutan ciudades y tropas 3D, pero no pueden estar conectados durante cada ataque.
- Grupos de amigos que quieran competir por temporadas y ganar una Maravilla.

### 2.2 Propuesta
- Vista de ciudad, mapa global y repeticiones 3D de calidad, creadas a partir de una biblioteca de assets profesional.
- Persistencia real: ninguna acción crítica depende de un navegador abierto.
- Más decisiones estratégicas que microgestión: batallas automáticas deterministas, doctrina defensiva, rutas marítimas, oasis y logística.
- Diplomacia con PNA, confederaciones, guerras y cooperación para Maravillas.
- Clasificaciones individuales, por alianza e internas, con distinciones semanales sin pay-to-win.

### 2.3 No objetivos de MVP 1
- Batallas 3D de control táctico en tiempo real, matchmaking de salas y Colyseus.
- Combate naval táctico y simulación física de barcos; navegación es estratégica por rutas.
- Simulación individual permanente de cada aldeano o soldado en servidores.
- Más de dos civilizaciones, héroes, magia o artefactos de héroe.
- Mundo único e infinito, clanes entre mundos, intercambio entre temporadas.
- Tienda premium, moneda de pago y ventajas comprables.
- IA generativa en producción para decisiones de NPC.
- Soporte móvil completo; interfaz de escritorio en navegador primero.

## 3. Definición operativa y criterios de éxito

### 3.1 Tamaño del piloto
- Un mundo competitivo visible, más un segundo mundo de prueba que demuestre aislamiento.
- Capacidad objetivo de evaluación inicial: 50–200 cuentas por mundo y decenas de jugadores concurrentes. **No es capacidad certificada**: debe probarse.
- Un mapa inicial basado en cuadrícula lógica de **128 × 128 celdas**, con regiones renderizadas 3D; tamaño configurable por mundo.
- Dos civilizaciones, 8 tipos de edificios básicos compartidos, 2 edificios únicos (uno por civilización), 4 recursos, 4 tipos de unidades terrestres y 1 tipo de barco de transporte.
- Mundo y duración configurables por perfil `test`, `alpha` y `seasonal`. Los tiempos de pruebas aceleradas nunca se mezclan con mundo competitivo.

### 3.2 Criterios de aceptación de MVP 1
1. Dos usuarios crean cuentas y aldeas en un mundo sin acceder a otros mundos por manipulación de API.
2. La aldea 3D contiene assets reconocibles, texturas PBR, cámara y selección de edificios, sin geometría provisional en la versión aceptada.
3. Recursos, colas de construcción y reclutamiento continúan sin sesiones conectadas.
4. Un ejército terrestre o transportado por barco llega en hora programada y se resuelve una única vez aunque los workers fallen y se reintenten.
5. Un defensor desconectado mantiene tropas, murallas y doctrina previamente configurada.
6. Existen oasis controlables, aldeas NPC y dos civilizaciones con ventajas y edificios únicos verificables.
7. Existen alianzas, PNA, confederaciones y restricciones de permisos y cooldowns.
8. Rankings globales, por alianza e internos se consultan y las medallas semanales se conceden una sola vez.
9. Una Maravilla puede progresar de 1 a 100, ser atacada, entrar en validación final y declarar ganadora a una alianza; el mundo se cierra sin nuevos comandos militares.
10. El cliente puede consultar un informe de combate y una representación 3D congruente con el resultado.
11. Backups y restauración se prueban en un ambiente independiente.
12. Pruebas de aislamiento, concurrencia, autorización, idempotencia y flujo de temporada están automatizadas.

## 4. Roles y permisos

| Rol | Facultades principales |
|---|---|
| Visitante | Inicio, descripción y lista pública de mundos |
| Jugador | Participar en mundo, construir, reclutar, comerciar, atacar, controlar sus aldeas |
| Miembro de alianza | Chat/tablón simple, ver ranking interno y relaciones publicadas |
| Oficial militar | Coordinar refuerzos y avisos; sin mover tropas ajenas sin delegación expresa |
| Diplomático | Proponer PNA, confederación y terminación de tratados |
| Líder de alianza | Invitar, expulsar, asignar roles, aprobar tratados y designar Maravilla |
| Moderador/admin del mundo | Suspensiones, auditoría y operación controlada, con registro inmutable de acciones |

Las verificaciones de propiedad, permisos y `world_id` son obligatorias en backend. Nunca se deducen de un botón oculto en UI.

## 5. Reglas de mundos y temporadas (FR-WLD)

- **FR-WLD-01:** Listado, estado, reglas y fecha de inicio de cada mundo: `UPCOMING`, `OPEN`, `WONDER_ERA`, `VICTORY_PENDING`, `ENDED`, `ARCHIVED`.
- **FR-WLD-02:** Identidad persistente global del usuario, pero progresión completamente aislada por mundo (`world_players`).
- **FR-WLD-03:** Mapa por semilla (`seed`), `map_version` y parámetros (`size`, `sea_fraction`, `biomes`, `spawn_rules`). Generación reproducible; el servidor persiste las posiciones y los recursos reales.
- **FR-WLD-04:** Velocidad de mundo `speed_multiplier`; debe aplicarse mediante fórmulas explícitas a tiempos seleccionados y quedar fija en una temporada activa.
- **FR-WLD-05:** El motor usa instantes UTC; la UI presenta fechas en huso horario del usuario.
- **FR-WLD-06:** Un jugador no puede transferir recursos, tropas, medallas competitivas ni tratados entre mundos.
- **FR-WLD-07:** Protección de incorporación inicial configurable (ejemplo de ensayo: 72 h o hasta cierta población); la UI explica exactamente cuándo expira.
- **FR-WLD-08:** No se permiten nuevos comandos que modifiquen el estado competitivo de un mundo `ENDED`; informes y archivos siguen visibles.
- **FR-WLD-09:** Un mundo nuevo no hereda ventajas militares o económicas del anterior.

## 6. Civilizaciones (FR-CIV)

### 6.1 MVP: dos civilizaciones

| Civilización provisional | Tendencia | Edificio único | Unidad única | Contrapartida |
|---|---|---|---|---|
| Imperio de la Corona | Fortaleza y disciplina terrestre | Bastión Imperial | Guardia de la Corona | Menor eficiencia de comercio naval |
| Liga de los Mares | Logística y navegación | Arsenal Naval | Marinero de Escolta (apoyo de transporte) | Fortificaciones terrestres más costosas |

Ambas poseen granjas, aserraderos, canteras, minas, cuarteles, almacenes, hospitales, templos, puertos donde proceda y recursos equivalentes. Los valores iniciales se proponen en `specs/balance-mvp1.example.yaml` y requieren validación mediante simulaciones y playtesting.

- **FR-CIV-01:** Selección de civilización al unirse a un mundo; bloqueada tras la creación de la primera aldea.
- **FR-CIV-02:** Valores de ventajas y contrapartidas configurables y versionados por `ruleset_version`.
- **FR-CIV-03:** Edificios y tropas con modelos 3D y siluetas reconocibles por civilización.
- **FR-CIV-04:** Ninguna habilidad requiere un personaje héroe; todo se vincula a edificios, investigaciones, ejércitos y doctrinas.

## 7. Ciudades y construcción (FR-CITY)

- **FR-CITY-01:** Cada jugador inicia con una aldea y parcelas de construcción; posición y rotación dentro de espacios permitidos (sin construcción libre ilimitada).
- **FR-CITY-02:** La interfaz 3D permite orbitar/zoom, seleccionar, inspeccionar y colocar edificios sobre parcelas válidas.
- **FR-CITY-03:** Cada tipo de edificio define costos, tiempo, nivel máximo, requisitos y producción/efecto.
- **FR-CITY-04:** Cola de construcciones por ciudad: 1 construcción activa en MVP; acciones del servidor con finalización UTC.
- **FR-CITY-05:** Mejorar un edificio modifica estadísticas y su representación 3D; para ahorrar arte se permiten 3 estados visuales (1–3, 4–7, 8+) con variaciones de props.
- **FR-CITY-06:** Murallas y defensas pertenecen a la ciudad; toda defensa visible corresponde a estadísticas canónicas.
- **FR-CITY-07:** Se pueden fundar nuevas aldeas cuando se cumplan requisitos poblacionales, recursos y distancia.
- **FR-CITY-08:** El servidor rechaza parcelas ocupadas y operaciones simultáneas inconsistentes.
- **FR-CITY-09:** El usuario puede ver recursos y tiempos de construcción sin depender de actualizaciones por segundo desde servidor.

### 7.1 Edificios de MVP

1. Centro urbano (capacidad/administración).
2. Granja (alimentos).
3. Aserradero (madera).
4. Cantera (piedra).
5. Mina (hierro).
6. Almacén / granero (capacidad; componente visual compartido con variantes).
7. Cuartel (reclutamiento).
8. Hospital (recuperación de heridos).
9. Templo (recluta sacerdotes y aporta cultura/moral).
10. Puerto (solo costa/navegación).
11. Muralla/empalizada (fortificación de ciudad).
12. Edificio único de cada civilización.

**Nota de alcance:** son **8 familias básicas principales**, más edificios sistémicos especializados (templo, puerto, muralla) y únicos; el conteo artístico real de prefabs será mayor que ocho. No confundir número de clases de edificio con cantidad de modelos.

## 8. Recursos y economía (FR-ECO)

Recursos de MVP: madera, piedra, hierro y alimentos. El agua es territorio/navegación, **no recurso consumible** en MVP1.

- **FR-ECO-01:** Producción calculada por tiempo transcurrido y tasa versionada; sin tick por segundo.
- **FR-ECO-02:** Almacenes establecen capacidades y se respetan incluso al estar desconectado.
- **FR-ECO-03:** Todos los movimientos que consumen/entregan recursos se auditan en un ledger.
- **FR-ECO-04:** Se usan cantidades enteras en unidad fija (por ejemplo, milésimas internas) para evitar desajustes flotantes.
- **FR-ECO-05:** Producción por recurso: `min(capacidad, almacenado + tasa_por_ms * delta_ms)` con acumulación exacta de residuos; liquidación previa antes de cambios de tasa.
- **FR-ECO-06:** La producción de alimentos y el consumo militar son funciones separadas, liquidadas en orden temporal determinista.
- **FR-ECO-07:** Con alimentos agotados se bloquea reclutamiento y recuperación médica; la penalización militar se limita y debe definirse por balance. No matar tropas automáticamente sin eventos auditados.
- **FR-ECO-08:** Comercio entre ciudades a través de convoyes sujetos a capacidad, recorrido y tiempo, terrestres y marítimos.
- **FR-ECO-09:** Límite de capacidad y validación transaccional evitan gastar más recursos de los existentes con solicitudes simultáneas.

## 9. Mapa: agua, oasis e islas (FR-MAP)

- **FR-MAP-01:** Mapa lógico de celdas con bioma, altitud, costa, navegabilidad, movilidad, ocupación y recursos.
- **FR-MAP-02:** Ríos, mares, lagos, bosques, montañas e islas influyen en rutas y colonización.
- **FR-MAP-03:** Los tiles no renderizados no generan físicas ni instancias 3D en servidor.
- **FR-MAP-04:** Oasis ocupables sin héroe mediante guarniciones/puestos de control; máximo por aldea configurable (propuesta inicial: 2).
- **FR-MAP-05:** Oasis tienen bonificación limitada y disputable; números iniciales sujetos a playtesting.
- **FR-MAP-06:** La navegación naval exige celdas de agua navegable y puertos de embarque/desembarque válidos.
- **FR-MAP-07:** Generador evita islas inaccesibles o asentamientos sin recursos mínimos; evaluación automática de equidad de puntos de aparición.
- **FR-MAP-08:** El mapa presenta iconografía clara de aldeas humanas, NPC, oasis, Maravillas, alianzas y rutas.

## 10. Barcos, puertos y transporte (FR-NAV)

- **FR-NAV-01:** Puerto construible solo en parcela costera válida con acceso a una componente de mar/río navegable.
- **FR-NAV-02:** Una unidad naval de transporte en MVP, con capacidad de carga de tropas/mercaderes, velocidad y costo.
- **FR-NAV-03:** Un ejército embarcado no participa simultáneamente en defensa terrestre ni puede superar capacidad.
- **FR-NAV-04:** Los viajes tienen inicio, destino, ruta verificable y `arrival_at` calculado por servidor; sin teletransporte.
- **FR-NAV-05:** Barcos y carga se reservan transaccionalmente para prevenir duplicación.
- **FR-NAV-06:** El transporte marítimo puede abastecer Maravillas y aliados según permisos.
- **No MVP:** combate naval directo, bloqueos navales avanzados, físicas de agua/simulador de olas en backend.

## 11. Tropas, hospitales y sacerdotes (FR-ARM)

### 11.1 Unidades base
- Milicia: infantería barata.
- Lancero: defensa contra caballería.
- Arquero: apoyo a distancia.
- Caballería: movilidad y ofensiva.
- Sacerdote: unidad no heroica de apoyo, con bonus acotado de moral/recuperación; se entrena en templo.
- Unidades exclusivas de las dos civilizaciones: según capítulo 6.

- **FR-ARM-01:** Reclutamiento por colas y tiempos; reservas de población, recursos y alimento.
- **FR-ARM-02:** Composición de ejército por stacks (`unit_type_id`, cantidad) y órdenes permitidas.
- **FR-ARM-03:** Comandos: defender, reforzar, atacar, saquear, retirar y transportar; el movimiento depende del terreno.
- **FR-ARM-04:** Hospital convierte parte de bajas en heridos recuperables con capacidad, insumos y tiempo; muertos son definitivos.
- **FR-ARM-05:** Sacerdotes ofrecen apoyo estadístico de grupo, nunca resurrección o poderes de héroe.
- **FR-ARM-06:** Doctrina defensiva predefinida: guardar reservas, prioridad de posiciones, política de retirada y asignación a murallas.
- **FR-ARM-07:** Los ejércitos estacionados y en tránsito tienen estados mutuamente excluyentes; jamás son utilizables en dos batallas a la vez.

## 12. Combate automático autoritativo (FR-BAT)

- **FR-BAT-01:** Al finalizar un movimiento hostil se crea/resuelve un combate en backend con snapshots de atacantes, defensores, terreno, fortificación y doctrina.
- **FR-BAT-02:** El motor es determinista para `input + seed + ruleset_version` y registra versión.
- **FR-BAT-03:** Contabiliza bajas, heridos, saqueo, daño a edificios, supervivientes y vuelta del ejército si procede.
- **FR-BAT-04:** No requiere que atacante o defensor estén conectados.
- **FR-BAT-05:** Un combate aplica efectos como máximo una vez a estado canónico; reintentos devuelven resultado previamente almacenado.
- **FR-BAT-06:** En caso de llegada simultánea se aplica un orden total documentado por `due_at`, prioridad de evento y `event_id`.
- **FR-BAT-07:** El servidor persiste un informe y un timeline de hitos que la vista 3D puede representar; no inventa una simulación táctica exacta inexistente.
- **FR-BAT-08:** El usuario consulta historial por aldea y fecha; visibilidad de información enemiga limitada según reglas.
- **FR-BAT-09:** Los ataques contra PNA activos se bloquean hasta terminar el período de salida definido.
- **FR-BAT-10:** Se rechazan ataques fuera de la ventana de protección de nuevos jugadores.

### 12.1 Contrato conceptual

```ts
type BattleInput = {
  battleId: string;
  worldId: string;
  seed: string;
  rulesetVersion: string;
  attacker: ArmySnapshot;
  defender: ArmySnapshot;
  terrain: TerrainSnapshot;
  defenses: DefenseSnapshot;
  doctrine: DefenseDoctrineSnapshot;
};

type BattleResult = {
  battleId: string;
  outcome: 'ATTACKER' | 'DEFENDER' | 'DRAW';
  losses: UnitLoss[];
  wounded: UnitWounded[];
  loot: ResourceBundle;
  buildingDamage: BuildingDamage[];
  milestones: BattleMilestone[];
};
```

Los tipos anteriores son especificaciones a implementar; no se consideran interfaces ya existentes.

## 13. Aldeas anárquicas NPC (FR-NPC)

- **FR-NPC-01:** Aldeas con facción, reservas, población, defensas, tecnología y estado propio.
- **FR-NPC-02:** Estados iniciales: `PEACEFUL`, `GROWING`, `DEFENSIVE`, `HOSTILE`, `RAIDING`, `RECOVERING`.
- **FR-NPC-03:** Decisiones por reglas y eventos, no LLM en ejecución.
- **FR-NPC-04:** Interacciones MVP: explorar, comerciar, saquear y conquistar bajo condiciones explícitas.
- **FR-NPC-05:** Límites de frecuencia y fuerza de incursiones para no destruir jugadores nuevos.
- **FR-NPC-06:** Tras conquista, propietaria, tropas y recursos se transfieren transaccionalmente y se conserva auditoría.
- **FR-NPC-07:** Un NPC sigue produciendo y cambiando estado sin espectadores conectados.

## 14. Alianzas, PNA y confederaciones (FR-DIP)

- **FR-DIP-01:** Crear, invitar, aceptar, abandonar y disolver alianzas dentro de un mundo.
- **FR-DIP-02:** Roles `LEADER`, `DIPLOMAT`, `OFFICER`, `MEMBER`, con permisos explícitos.
- **FR-DIP-03:** PNA requiere solicitud, aceptación y estado `PROPOSED`, `ACTIVE`, `TERMINATING`, `ENDED`/`REJECTED`; aplicable solo a alianzas del mismo mundo.
- **FR-DIP-04:** Mientras PNA esté `ACTIVE` o `TERMINATING`, nuevos ataques entre sus miembros se bloquean; aviso de terminación de ejemplo 12 h configurable por mundo.
- **FR-DIP-05:** No puede activarse un PNA con ataques hostiles pendientes entre las alianzas: deben resolverse o cancelarse antes.
- **FR-DIP-06:** Confederación: relación formal entre alianzas independientes, número máximo configurable (propuesta MVP: 3 alianzas), con permisos de apoyo y salida con cooldown.
- **FR-DIP-07:** Las alianzas conservan ranking, liderazgo, ciudades y recursos independientes dentro de una confederación.
- **FR-DIP-08:** El servidor permite refuerzos y abastecimiento entre miembros de confederación y según reglas con aliados neutrales.
- **FR-DIP-09:** Crear/romper tratados queda auditado, con notificación a líderes y miembros implicados.
- **FR-DIP-10:** No hay federaciones entre mundos.
- **FR-DIP-11:** Declaración de guerra y registro diplomático visibles; en MVP no cambian las reglas normales de ataque salvo el PNA.

## 15. Rankings y premios semanales (FR-RNK)

- **FR-RNK-01:** Rankings de jugadores por población, ataque, defensa, saqueo, economía, comercio y contribución a Maravilla.
- **FR-RNK-02:** Rankings agregados por alianza, usando miembros y eventos válidos del período.
- **FR-RNK-03:** Ranking interno por alianza: contribución, refuerzos, donaciones y puntuación de guerra.
- **FR-RNK-04:** Filtros `ALL_TIME`, `SEASON` y `WEEK` en categorías aplicables.
- **FR-RNK-05:** Ventana semanal en UTC `[lunes 00:00, lunes siguiente 00:00)`; interfaz convierte al horario local.
- **FR-RNK-06:** Cierre semanal crea snapshot inmutable, determina ganadores y asigna premios de manera idempotente (clave única `world + week + category + scope + rank`).
- **FR-RNK-07:** Premios MVP: títulos, medallas de perfil, distintivos de alianza y decoraciones de estandarte **sin ventaja militar ni producción**.
- **FR-RNK-08:** Los primeros puestos no obtienen recursos premium, tropas gratis ni mayores tasas productivas.
- **FR-RNK-09:** Penalización/moderación de granjas de puntos, transferencias simuladas, ataques entre cuentas vinculadas y rotación oportunista entre alianzas.
- **FR-RNK-10:** Los puntajes de alianza atribuibles a una acción guardan la membresía válida en el instante del evento; no se redistribuyen al cambiarse después.
- **FR-RNK-11:** Premios colectivos exigen antigüedad o contribución mínima, configurable, y se conceden al cierre desde snapshot.

## 16. Maravilla nivel 100 y final de mundo (FR-WON)

- **FR-WON-01:** Cuando el mundo entra en `WONDER_ERA`, determinadas localizaciones especiales habilitan la construcción de Maravillas.
- **FR-WON-02:** La Maravilla pertenece a una alianza de ese mundo; un líder designa la ciudad/emplazamiento elegible.
- **FR-WON-03:** Niveles 1–100 con costos y tiempos crecientes, definidos en configuración de reglas versionada.
- **FR-WON-04:** Recursos y refuerzos pueden aportarse desde ciudades propias, miembros y confederados, sujetos a permisos y rutas.
- **FR-WON-05:** Los ataques pueden dañar defensas, suministros o progreso de Maravilla mediante reglas de asedio establecidas; no existe botón unilateral de destrucción.
- **FR-WON-06:** Al completar 100 se inicia `VICTORY_PENDING`, con validación temporal configurable (ejemplo 24 h); se comprueba propiedad y nivel válido en cada operación.
- **FR-WON-07:** Si la Maravilla pierde el nivel o deja de cumplir condiciones antes de finalizar validación, se cancela esa candidatura de victoria.
- **FR-WON-08:** La primera candidatura válida determinada por tiempo autoritativo gana; empates se ordenan por `completed_at` y `wonder_id`.
- **FR-WON-09:** Se registra la alianza campeona, contribuyentes destacados, fecha, mundo y snapshot final.
- **FR-WON-10:** Tras ganar, el mundo pasa a `ENDED` en una transacción que impide comandos competitivos posteriores.
- **FR-WON-11:** Los confederados reciben reconocimiento de apoyo, pero la alianza propietaria de la Maravilla es la campeona.
- **FR-WON-12:** La duración de la temporada y requisitos de desbloqueo son datos de configuración, no código hardcodeado.

## 17. Presentación 3D y calidad artística (FR-ART)

- **FR-ART-01:** El cliente usa PlayCanvas + React para tres escenas: ciudad, mapa y replay, con activos GLB/glTF.
- **FR-ART-02:** Dirección visual: realismo estilizado medieval, PBR, escala coherente, iluminación consistente, siluetas reconocibles; se prohíben cubos/palitos como assets aceptados de producción.
- **FR-ART-03:** Cada asset debe tener `asset_id`, licencia, autor/fuente, civilización, nivel, escala, pivote, collider, LOD, budget, miniatura y versión.
- **FR-ART-04:** Modelos NPC y soldados con animaciones al menos `idle`, `walk`, `attack`, `death`; barco con `idle`/`sail`, edificio con estados de construcción.
- **FR-ART-05:** Para vista de ciudad: cámara orbitar, zoom, selección raycast, tooltip, colocación válida/invalidación y UI sincronizada con servidor.
- **FR-ART-06:** El mapa carga regiones bajo demanda; instancing, culling, LOD y texturas comprimidas, siempre tras probar visualmente el recurso.
- **FR-ART-07:** El replay de combate automático muestra hitos consistentes con el resultado, no afirma ser registro exacto de cada trayectoria.
- **FR-ART-08:** Se deben producir capturas comparables de referencia y pruebas de regresión visual.
- **FR-ART-09:** La producción de assets con IA es **offline**, fuera de la ejecución del juego, con QA automatizada y aprobación humana para assets de calidad crítica.
- **FR-ART-10:** El navegador nunca descargará assets de mundos o escenas no visitadas por defecto.

### 17.1 Conjunto mínimo de assets aprobados
- 2 kits arquitectónicos coherentes de civilización (materiales, tejados, muros, puertas, decoraciones).
- Modelos para familias de edificios y 3 estados de mejoramiento en edificios principales.
- 4 unidades terrestres base + sacerdote + variantes/únicos de civilización; esqueletos compartidos cuando sea viable.
- 1 barco de transporte, 1 muelle, 1 puerto; agua, costa y río renderizados.
- Bosques, rocas, cultivo, camino, ruina y oasis, con variaciones reutilizables.
- 1 conjunto de aldea NPC y 1 Maravilla con etapas visuales representativas (no 100 modelos distintos).

## 18. UX / Pantallas (FR-UX)

1. Inicio / mundo / estado / temporada.
2. Registro/inicio de sesión y selector de mundo.
3. Alta de civilización y aldea.
4. Ciudad 3D: HUD de recursos, edificios, construcción, reclutamiento y hospitales/templos.
5. Mapa global: filtros de biomas, aldeas NPC, oasis, flotas, ciudad objetivo, rutas.
6. Panel de ejército: composición, tiempos, ataque/saqueo/refuerzo/transporte.
7. Informes de combate y replay.
8. Alianzas: creación, miembros, roles, invitaciones, PNA, confederaciones, bitácora diplomática.
9. Rankings: global, alianzas, interno, categorías y premio semanal.
10. Maravilla: nivel 1–100, costos, contribuyentes, suministros, amenazas, contador de victoria.
11. Perfil: medallas, resultados y estadísticas históricas.
12. Panel mínimo de operador: configurar mundos, inspeccionar eventos fallidos, suspender usuarios y consultar auditoría.

Principios UX: tiempos expresados inequívocamente; acciones irreversibles con confirmación; iconos con etiquetas; diferencia visible entre información exacta y estimada; accesibilidad de texto/controles incluso cuando la vista 3D no soporte navegación completa por teclado.

## 19. API y contratos de aplicación

### 19.1 Convenciones
- Prefijo `/api/v1`.
- Toda acción de juego incluye `worldId` en la ruta o contexto validado.
- `Idempotency-Key` obligatorio en comandos de gasto, construcción, reclutamiento, viajes y diplomacia sensible.
- Fechas ISO-8601 UTC. Recursos en enteros de unidad fija. Identificadores UUID o ULID homogéneos.
- Errores con `code`, `message`, `correlationId`, `details` seguros.

### 19.2 Rutas MVP (orientativas, sujetas a contratos OpenAPI)

```http
GET    /api/v1/worlds
POST   /api/v1/worlds/{worldId}/join
GET    /api/v1/worlds/{worldId}/map/regions?x=0&y=0
GET    /api/v1/worlds/{worldId}/villages/{villageId}
POST   /api/v1/worlds/{worldId}/villages/{villageId}/buildings
POST   /api/v1/worlds/{worldId}/villages/{villageId}/recruitments
GET    /api/v1/worlds/{worldId}/armies
POST   /api/v1/worlds/{worldId}/armies/{armyId}/marches
POST   /api/v1/worlds/{worldId}/armies/{armyId}/naval-transport
GET    /api/v1/worlds/{worldId}/reports/battles
GET    /api/v1/worlds/{worldId}/alliances
POST   /api/v1/worlds/{worldId}/alliances
POST   /api/v1/worlds/{worldId}/treaties
POST   /api/v1/worlds/{worldId}/treaties/{treatyId}/accept
POST   /api/v1/worlds/{worldId}/treaties/{treatyId}/terminate
GET    /api/v1/worlds/{worldId}/rankings?scope=players&period=week
GET    /api/v1/worlds/{worldId}/awards?period=week
GET    /api/v1/worlds/{worldId}/wonders
POST   /api/v1/worlds/{worldId}/wonders/{wonderId}/contributions
GET    /api/v1/worlds/{worldId}/season/result
```

### 19.3 Ejemplo de comando

```json
{
  "targetVillageId": "target_uuid",
  "mission": "ATTACK",
  "units": [{ "unitType": "MILITIA", "quantity": 120 }],
  "departureFrom": "source_village_uuid"
}
```

Respuesta prevista: `movementId`, `status`, `departureAt`, `arrivalAt`, `serverTime`, `version`. Ninguna propiedad de daño, posición final o tiempo arbitrario enviada por cliente es autoritativa.

### 19.4 Eventos canónicos
- `BuildingQueued`, `BuildingCompleted`, `ResourcesSettled`.
- `RecruitmentQueued`, `RecruitmentCompleted`, `ArmyDeparted`, `ArmyArrived`.
- `BattleResolved`, `VillageConquered`, `OasisClaimed`, `NpcActionPlanned`.
- `TreatyProposed`, `TreatyActivated`, `TreatyTerminationStarted`, `TreatyEnded`.
- `WeeklyRankingFinalized`, `AwardGranted`.
- `WonderLevelCompleted`, `WonderVictoryPending`, `WorldVictoryConfirmed`.

## 20. Persistencia y modelo de datos

### 20.1 Tablas iniciales

| Grupo | Tablas principales |
|---|---|
| Identidad | `accounts`, `sessions`, `world_players` |
| Mundo | `worlds`, `world_regions`, `world_tiles`, `spawn_allocations` |
| Civilización | `civilization_catalog`, `building_catalog`, `unit_catalog`, `rulesets` |
| Ciudad | `villages`, `building_instances`, `construction_orders`, `resource_accounts`, `resource_ledger` |
| Tropas | `garrisons`, `army_stacks`, `army_movements`, `recruitment_orders`, `wounded_stacks`, `defense_doctrines` |
| Naval | `ships`, `ship_cargo`, `ports` |
| Combate | `battles`, `battle_participants`, `battle_results`, `battle_milestones` |
| NPC y oasis | `npc_villages`, `npc_events`, `oases`, `oasis_control` |
| Diplomacia | `alliances`, `alliance_members`, `confederations`, `confederation_members`, `treaties`, `diplomatic_events` |
| Ranking | `score_events`, `ranking_aggregates`, `weekly_snapshots`, `awards`, `award_grants` |
| Maravillas | `wonder_sites`, `wonders`, `wonder_levels`, `wonder_contributions`, `world_winners` |
| Operación | `scheduled_events`, `outbox`, `idempotency_records`, `audit_log` |

### 20.2 Restricciones indispensables
- Todas las entidades competitivas contienen `world_id`; únicas compuestas por mundo y referencia entre entidades del mismo mundo.
- `UNIQUE(world_id, coordinate_x, coordinate_y)` para ocupación de celda.
- `UNIQUE(world_id, external_event_key)` o equivalente para idempotencia.
- Los balances nunca quedan por debajo de cero por carrera entre transacciones.
- `award_grants` único por `world_id, week_start, category, scope, rank, recipient_id` y política para evitar múltiples concesiones por posición.
- Una alianza no pertenece a múltiples confederaciones activas del mismo mundo.
- Índices para eventos vencidos por `(status, due_at, world_id)` y movimiento por `(world_id, destination_id, arrival_at)`.

### 20.3 Reloj, transacciones e idempotencia
- El tiempo relevante lo fija el servidor; los usuarios no pueden enviar `arrivalAt`.
- Eventos vencidos se reclaman mediante transacción PostgreSQL, `FOR UPDATE SKIP LOCKED` o método equivalente validado.
- La cola PostgreSQL es fuente de verdad: ningún evento crítico existe solamente en memoria/caché.
- Se implementa **transactional outbox** para notificaciones externas y una reconciliación de eventos atrasados.
- Al reiniciar un worker no deben producirse pérdidas ni efectos duplicados.

## 21. Seguridad, privacidad y antiabuso

- Autenticación con sesiones opacas en cookie `HttpOnly`, `Secure`, `SameSite` apropiada; contraseña cifrada con Argon2id; rotación/revocación.
- CSRF mitigado para comandos autenticados mediante cookie; validación de origen, token cuando corresponda.
- Validación de entrada tipada, rate limits, límites de tamaño y protección de enumeración de cuentas.
- Autorización por actor, mundo, propiedad y rol — jamás confiar en ID de cliente.
- Auditoría de transferencias, ataques, tratados, premios, cambio de datos de mundo y acciones admin.
- Señales anti-multicuenta, abuso de rankings y automatización desleal; revisión de falsos positivos.
- Prohibido exponer cadenas de conexión, claves API, archivos `.env` o tokens a agentes MCP no confiables.
- Dependencias fijadas mediante lockfile y revisiones regulares de seguridad.
- Política de contenido, reportes/denuncias, moderación y términos preparados antes de beta pública.

## 22. Requisitos no funcionales (NFR)

| ID | Objetivo de aceptación del piloto |
|---|---|
| NFR-01 Disponibilidad | El juego recupera transacciones y eventos tras reiniciar API/worker sin corrupción; objetivo operativo beta a definir tras métricas |
| NFR-02 Latencia API | p95 menor a 300 ms en consultas y comandos simples bajo carga de piloto, excluyendo archivos pesados; validación con prueba de carga |
| NFR-03 Mundo | Abrir un segundo mundo no requiere desplegar otra instancia de API ni de PostgreSQL |
| NFR-04 Seguridad | Cero acceso cross-world probado en API, DAL y transacciones |
| NFR-05 Integridad | Cero duplicación de recursos, unidades, premios o victoria en tests de reintento y concurrencia |
| NFR-06 Visual | Objetivo inicial de 60 FPS en escena urbana acotada en equipo de referencia; degradación configurable |
| NFR-07 Descarga | Carga diferida por región/escena y perfiles de assets; presupuesto final derivado de medición real |
| NFR-08 Restauración | Backup automático y prueba documentada de restauración al menos antes de alfa pública |
| NFR-09 Observabilidad | Logs estructurados, métricas de eventos atrasados, fallos, latencia y uso de recursos |
| NFR-10 Accesibilidad | UI operable con teclado para gestión; contraste y textos legibles; acciones críticas no dependen solo del color |
| NFR-11 Determinismo | Misma semilla + snapshots + versión de reglas produce igual resultado de combate |
| NFR-12 Costo | MVP sin GPU en producción, Kubernetes ni servicios de IA obligatorios |

## 23. Métricas de producto

- Activación: % de registros que construyen primer edificio y reclutan primera unidad.
- Primer valor: tiempo hasta completar primera misión de construcción.
- Retención: D1, D7, participación en alianzas y retorno semanal.
- Social: % en alianza, tratados activos, contribuciones a Maravilla.
- Economía: gasto efectivo, recursos inactivos en capacidad máxima, desbalances.
- Guerra: ataques, bajas por civilización, victorias defensivas offline, repetición consultada.
- Operación: vencimientos procesados a tiempo, backlog de eventos, reinicios y resultados de reconciliación.
- Competición: concentración del poder, porcentaje de jugadores con premios y distribución de ganadores entre alianzas.

## 24. Epics, dependencia y criterios de salida

| Epic | ID | Resultado | Predecesora |
|---|---|---|---|
| Contratos / dominio | E-01 | Reglas, catálogos, esquemas y tests de motor | — |
| Pipeline artístico | E-02 | Kit visual 3D de calidad verificable | — |
| Infra local / cuentas | E-03 | Dev stack, sesiones y mundo | E-01 |
| Ciudad 3D | E-04 | Gestión visual de parcelas y construcciones | E-02, E-03 |
| Economía offline | E-05 | Recursos y construcciones deterministas | E-03 |
| Mapa / NPC / oasis | E-06 | Mundo navegable y actividad autónoma | E-03 |
| Tropas / combate | E-07 | Ataque offline consistente, hospital/templo | E-05, E-06 |
| Naval MVP | E-08 | Transporte entre puertos y logística | E-06, E-07 |
| Diplomacia | E-09 | Alianzas, PNA y confederación | E-03 |
| Rankings / premios | E-10 | Scores auditables y cierre semanal | E-07, E-09 |
| Maravilla | E-11 | Niveles 1–100 y campeón | E-08, E-09, E-10 |
| Alfa / operaciones | E-12 | QA, cargas, backups, administración | Todas |

**Hito 1 (vertical slice):** dos ciudades 3D, economía offline, envío y resolución de un ataque, un informe y un asset aprobado.  
**Hito 2 (alfa funcional):** mundo con dos civilizaciones, NPC, oasis, marina simple, tratados y rankings.  
**Hito 3 (temporada completa):** apertura de Maravillas, victoria, archivo y reinicio de mundo.

## 25. Casos de prueba obligatorios

1. Dos solicitudes simultáneas gastan la última unidad de hierro: exactamente una prospera.
2. Worker cae después de resolver batalla pero antes de reconocer evento: no se duplica daño/saqueo.
3. Dos ejércitos llegan en el mismo instante: orden estable y reproducible.
4. Usuario de mundo A pide aldea, rankings o cuenta de mundo B: denegado.
5. PNA aceptado con ataque entrante: rechazo de activación hasta resolver el conflicto.
6. PNA en terminación: nuevos ataques bloqueados durante cooldown.
7. Cambios de alianza antes del cierre semanal: puntuación atribuida con reglas temporales correctas.
8. Dos ejecuciones del cierre semanal: un snapshot y una concesión por premio.
9. Dos Maravillas alcanzan 100 casi a la vez: una sola victoria tras validación.
10. Barco con capacidad llena no acepta tropas adicionales; al volver a procesar orden no las duplica.
11. Producción offline con cambio de tasa a mitad del período conserva el recurso exacto.
12. Hospital sin alimentos no cura por encima de capacidad; muertos no regresan.
13. NPC recibe dos órdenes contradictorias: transición idempotente y válida.
14. Recuperación desde backup no genera un segundo cierre semanal o victoria.
15. Test visual de escena con GLB real; fallos de assets muestran fallback en desarrollo, no modelo de cubos en producción.
16. Prueba con tiempo acelerado `test` completa una temporada de Maravilla 1–100 sin manipular tablas manualmente.

## 26. Criterios de lanzamiento y límites de responsabilidad

### DoD de cualquier historia
- Tests unitarios e integración; nuevas reglas versionadas; endpoints documentados; permisos y multiworld probados; métricas/logs; capturas para cambios visuales; actualización de documentación; revisión humana.

### Puerta previa a alfa pública
- Backups, restauración, antiabuso, moderación, mínimos legales/privacidad, carga medida, calidad visual revisada, controles de costos y panel operativo.

### Riesgos abiertos
- Duración real de una temporada y velocidad de los niveles de Maravilla.
- Equilibrio de dos civilizaciones y facilidad de acceso a puertos/oasis.
- Efecto de PNA/confederación sobre dominación de mapas.
- Coste real de generar y corregir assets 3D con IA.
- Experiencia 3D en portátiles y navegadores de gama media.

Estos riesgos no bloquean crear el vertical slice; **sí bloquean declarar un balance definitivo o una capacidad comercial**.

## 27. Parámetros iniciales para evitar decisiones arbitrarias

El archivo `specs/balance-mvp1.example.yaml` incorpora hipótesis numéricas de unidades, tiempos de entrenamiento, costos, fórmulas por nivel, producción, hospitales, oasis, puntuación semanal y Maravilla. No constituye balance aprobado: cada parámetro debe probarse frente a estrategias de expansión, jugadores ocasionales y alianzas grandes. `specs/world-rules.example.yaml` define el mapa, número de civilizaciones, protección, calendarios y diplomacia. Los archivos son configuración de diseño, no código listo para producción.

## 28. Fuentes de tecnología

- PlayCanvas React: https://developer.playcanvas.com/user-manual/react/getting-started/installation/
- PlayCanvas Skills: https://github.com/playcanvas/skills
- PlayCanvas Editor MCP: https://developer.playcanvas.com/user-manual/editor/mcp-server/
- PostgreSQL: https://www.postgresql.org/docs/
- Drizzle: https://orm.drizzle.team/docs/kit-overview
- NestJS: https://docs.nestjs.com/
- Blender MCP: https://github.com/ahujasid/mcp-for-blender
- glTF Transform: https://gltf-transform.dev/cli
- Playwright MCP: https://playwright.dev/mcp/installation

**Nota de originalidad:** Inspiración de mecánicas de juegos de estrategia, sin reutilizar nombres, marcas, código, imágenes, sonidos o assets protegidos por otros titulares.
