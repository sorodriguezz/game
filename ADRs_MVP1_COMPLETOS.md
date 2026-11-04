# ADR — Decisiones arquitectónicas completas — MVP 1

Este archivo reúne los ADR individuales de `docs/adr/`.


---

# ADR-0001: Monolito modular de NestJS para MVP 1

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Una temporada completa tiene muchos dominios relacionados y restricciones cruzadas. Separarlos en servicios elevaría latencia, costes operacionales y complejidad de transacciones antes de validar el producto.

## Decisión
Usar `apps/api` como monolito modular NestJS/TypeScript organizado por agregados (`worlds`, `economy`, `armies`, `diplomacy`, `rankings`, `wonders`); ejecutar `apps/worker` como proceso separado del mismo monorepo que importa librerías de dominio compartidas. Contratos explícitos, sin acceso directo desde módulos ajenos a tablas de otros agregados salvo repositorios/servicios aprobados.

## Consecuencias positivas
- Transacciones consistentes dentro de PostgreSQL
- Despliegue simple y bajo consumo
- Posibilidad futura de extraer combates en vivo u otro módulo detrás de contratos

## Consecuencias y riesgos
- Los límites modulares requieren disciplina y tests de arquitectura
- Escalado inicial principalmente por proceso/replicación de API; worker puede escalar aparte

## Alternativas evaluadas
- Microservicios event-driven de inicio: excesiva infraestructura y eventual consistency
- Backend monolítico sin módulos: acoplamiento difícil de mantener

## Señal de revisión
Extraer un servicio solo con presión medida de CPU, latencia, equipo o despliegue; no por anticipación.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0002: Múltiples mundos con aislamiento lógico y temporadas

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Un servidor por mundo encarece; compartir BD sin aislamiento permitiría transferencias ilícitas de recursos o ataques entre mundos.

## Decisión
Una instalación atiende N mundos mediante `world_id` obligatorio en todo agregado de juego. Restricciones UNIQUE/FK compuestas incluyen mundo; todas las consultas se limitan por `world_id`. `world_memberships` y roles pertenecen al mundo. Cada mundo tiene semilla, velocidad, calendario, reglas versionadas y máquina de estados de temporada.

## Consecuencias positivas
- No hace falta duplicar despliegues para cada mundo
- Permite temporadas con reglas y horarios independientes
- Facilita archivo y análisis histórico

## Consecuencias y riesgos
- Necesita pruebas automáticas cross-world para cada operación
- Un error de filtro puede causar fugas si no hay FK compuestas; usar helpers de acceso y políticas

## Alternativas evaluadas
- Una base por mundo desde el inicio: mayor coste/operación
- Columna `world_id` sin integridad adicional: insuficiente

## Señal de revisión
Separar físicos mundos de gran tamaño solo después de medir contención o requisitos de aislamiento.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0003: PostgreSQL como única persistencia y cola durable del MVP

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Las construcciones, ataques, viajes, NPC y premiaciones deben sobrevivir caídas sin duplicar operaciones. No conviene añadir Valkey/BullMQ antes de que haya necesidad real.

## Decisión
Usar PostgreSQL para estado y tabla `game_events` con `due_at`, `status`, `attempts`, `locked_at`, `lease_owner`, `idempotency_key`, `payload`, `world_id`. Workers toman lotes vencidos mediante `FOR UPDATE SKIP LOCKED` en transacción y marcan el resultado de negocio como aplicado en la misma transacción. Outbox transaccional para notificaciones externas. Reconciliación periódica de eventos vencidos y leases caducadas; backoff y dead-letter auditable.

## Consecuencias positivas
- Menos servicios, menos costes, semántica transaccional fuerte
- Fallos recuperables y trazabilidad del estado de los trabajos

## Consecuencias y riesgos
- Una tabla de eventos de alto volumen puede convertirse en cuello de botella
- Requiere diseñar polling, índices, reintentos y aislamiento
- SKIP LOCKED no equivale a entrega exactamente una vez; la operación debe ser idempotente

## Alternativas evaluadas
- Cron in-memory: pierde tareas
- BullMQ + Valkey: opción futura útil pero añadida complejidad
- Kafka: desproporcionado

## Señal de revisión
Revisar Valkey/BullMQ o colas dedicadas si la latencia, tasa de eventos o contención superan objetivos medidos.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0004: Economía por tiempo transcurrido y unidades de precisión fija

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Un tick por segundo por ciudad no escala bien; float introduce errores acumulativos y vulnerabilidades en saldos.

## Decisión
Persistir saldo, tasa por unidad temporal, remanente fraccionario, capacidad y `last_settled_at`. Liquidar hasta hora de servidor bajo bloqueo de la fila antes de cada cambio económico; dividir cálculos por tramos cuando tasa/capacidad cambien; usar enteros de precisión fija y ledger transaccional.

## Consecuencias positivas
- Economía persistente sin procesos continuamente activos
- Concurrencia controlable y cálculos reejecutables

## Consecuencias y riesgos
- Mayor complejidad al manejar múltiples cambios temporales
- Necesidad de pruebas de redondeo, pausas y hambre/consumo

## Alternativas evaluadas
- Tick recurrente en todas las aldeas: coste elevado
- Float y actualización client-side: inconsistencias/exploits

## Señal de revisión
Añadir escenarios de property-based testing que comprueben conservación de recursos.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0005: Motor de combate determinista y servidor autoritativo

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Los defensores pueden estar desconectados y los navegadores no deben decidir resultados.

## Decisión
Crear `packages/game-rules` con un núcleo funcional `resolveBattle(snapshot, seed, version)`. Fijar tropas, doctrinas, terreno, tecnologías y fortificaciones en `BattleSnapshot`. No usar `Math.random()` no sembrado ni estado externo. El worker aplica un resultado una sola vez. La animación 3D solo reproduce el resultado registrado; no tiene autoridad.

## Consecuencias positivas
- Combates offline, auditables y reproducibles
- Tests de miles de escenarios y balance reproducible
- Menos superficie para trampas

## Consecuencias y riesgos
- Requiere definir cuidadosamente resolución de ataques simultáneos
- Las repeticiones automáticas no son movimientos tácticos históricos exactos

## Alternativas evaluadas
- Resolver en cliente: inseguro
- Simular cada batalla visualmente en servidor: prohibitivo para MVP

## Señal de revisión
Modo táctico futuro usará simulación autoritativa de pasos fijos y contrato separado.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0006: Batallas tácticas controlables quedan fuera del MVP 1

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Introducir maniobras en tiempo real en ataques a defensores desconectados crea injusticia, costes y complejidad de reconexión.

## Decisión
MVP 1 usa ataques automáticos con doctrinas defensivas, informes y visualización 3D diferida. MVP 2 agrega partidas tácticas opt-in con aceptación mutua y reglas equivalentes, servidor autoritativo y resolución por IA en desconexión.

## Consecuencias positivas
- Temporada jugable sin bloquear desarrollo por netcode
- Paridad de defensa offline

## Consecuencias y riesgos
- La experiencia de control directo se retrasa
- Debe comunicarse claramente la diferencia entre replay y partida táctica

## Alternativas evaluadas
- RTS forzoso en todos los ataques: no apto para offline
- Táctico client-authoritative: vulnerable

## Señal de revisión
No incluir Colyseus en dependencias del MVP; evaluar cuando MVP 2 esté aprobado.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0007: PlayCanvas React y escenas 3D por contexto

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Se necesita presentación convincente en navegador sin obligar a GPU/servidor de juego para renderizado.

## Decisión
React + TypeScript + `@playcanvas/react` para ciudad, mapa y repeticiones. Arquitectura de tres escenas: mapa mundial por regiones, ciudad por aldea, replay por combate. Cargar assets con manifest y demanda, aplicar LOD, instancing, culling, quality profiles y análisis de draw calls. HTML/React para UI accesible.

## Consecuencias positivas
- 3D en el cliente y CDN compatible
- Stack front-end TypeScript conocido
- Posibilidad de ajustes gráficos

## Consecuencias y riesgos
- El rendimiento depende mucho de assets y GPU del cliente
- No toda feature WebGPU está disponible en todos los navegadores; fallback WebGL2

## Alternativas evaluadas
- Unreal/Unity Web: peso y ciclo de publicación mayores
- Three.js manual: más sistemas de juego que desarrollar

## Señal de revisión
Revaluar motor si las pruebas muestran limitaciones estructurales, no por preferencia abstracta.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

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


---

# ADR-0009: Sistema de ciudades por parcelas y edificio visual escalable

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
La colocación libre completa presenta problemas de colisiones, caminos y sincronización; posiciones totalmente rígidas reducen creatividad.

## Decisión
Usar parcelas/celdas urbanas con reglas de vecindad, restricciones de ocupación y caminos válidos. Edificios con niveles de gameplay múltiples y 3 etapas visuales (variantes reutilizables). La cuadrícula es estructura de simulación, **no** obliga a gráficos cúbicos. Todos los placements validados en servidor.

## Consecuencias positivas
- Construcción flexible y fácil de serializar
- Mayor control artístico y navegación estable

## Consecuencias y riesgos
- Menos libertad que un editor urbano irrestricto
- Hace falta diseñar espacio portuario/especial para edificio único

## Alternativas evaluadas
- Colocación completamente libre: mayor complejidad
- Slots únicos fijos: sensación de UI Travian clásica

## Señal de revisión
Ampliar reglas de parcelas tras tests de usabilidad.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0010: Navegación naval asíncrona mediante grafo de rutas

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
El agua, las islas y los barcos deben influir estratégicamente sin simular físicamente cada navío 24/7.

## Decisión
Crear grafo de rutas terrestres/navegables/puertos; transporte exige disponibilidad, capacidad, embarque y desembarque válidos. ETA validado en servidor, movimientos en `army_movements`; animación interpolada en mapa visual. No incluir PvP naval táctico ni barcos físicos de servidor en MVP.

## Consecuencias positivas
- Océanos y puertos tienen valor de gameplay
- Costo muy bajo con rutas por evento

## Consecuencias y riesgos
- Requiere tests de conectividad y anti-teletransporte
- El bloqueo naval profundo se pospone o abstrae

## Alternativas evaluadas
- Navmesh global + física continua: costoso
- Mar puramente estético: no satisface visión

## Señal de revisión
Agregar bloqueo naval y batallas navales reales solo tras validar logística.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0011: Aldeas NPC con máquina de estados y reglas deterministas

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
La IA generativa por cada NPC genera latencia, coste, alucinación de acciones y resultados imposibles de auditar.

## Decisión
Estados finitos/behavior rules versionados y timers de baja frecuencia; producción/conquista/ataque validados por el mismo motor económico y bélico que jugadores. IA generativa solo para autores de contenido offline, nunca decisión canónica.

## Consecuencias positivas
- Comportamiento predecible y balanceable
- NPC activos sin usuarios conectados
- Sin gasto de tokens en runtime

## Consecuencias y riesgos
- Menos conversación abierta y espontaneidad
- La variedad debe programarse con arquetipos/semillas

## Alternativas evaluadas
- LLM por pueblo: gasto e impredecibilidad
- NPC inertes: mundo vacío

## Señal de revisión
Añadir eventos narrativos generados offline con revisión de contenido si se desea.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0012: Civilizaciones asimétricas sin héroes

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
La identidad del juego depende de elecciones colectivas y especialización, sin personaje héroe de Travian.

## Decisión
Dos civilizaciones para MVP; cada una con arte, unidad y edificio único y bonificaciones pequeñas parametrizadas. Producción, tropas, templo/hospital y tecnología como sistemas colectivos. Sacerdote = unidad de soporte, jamás héroe con equipo/XP personal.

## Consecuencias positivas
- Identidad diferenciada sin introducir sistemas RPG
- Más sencillo de balancear y probar

## Consecuencias y riesgos
- Menos variedad al lanzamiento inicial
- Variaciones deben evitar civilización dominante

## Alternativas evaluadas
- Cinco civilizaciones iniciales: coste de assets/QA muy alto
- Una sola: no validaría asimetría

## Señal de revisión
Ampliar a cinco civilizaciones tras medir tasas de victoria y adquisición de recursos.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0013: Diplomacia formal: PNA, guerras y confederaciones

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
La política debe afectar órdenes y coordinación sin crear vacíos de reglas aprovechables.

## Decisión
Entidad `diplomatic_pacts` con transiciones auditadas; PNA requiere ambas aprobaciones, ventana de activación/ruptura y bloquear nuevas órdenes de ataque cubiertas. Confedera hasta 3 alianzas por defecto configurable, sin fusionar puntuaciones ni propiedad de ciudades. Roles diplomáticos con autorización.

## Consecuencias positivas
- Relaciones duraderas y visibles
- Reglas de ataque consistentes
- Contratos auditables

## Consecuencias y riesgos
- Requiere resolver movimientos iniciados antes del pacto
- Puede generar abusos si no se imponen cooldowns

## Alternativas evaluadas
- Diplomacia solo texto: no produce reglas
- Fusión automática de alianzas: facilita megabloques

## Señal de revisión
Definir controles de abuso en balance del mundo y pruebas adversariales.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0014: Rankings y premiación semanal inmutable

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Premiar dos veces o contar puntajes falsos destruye credibilidad; bonificaciones militares a líderes aumentan la desigualdad.

## Decisión
Eventos de puntuación verificados en PostgreSQL; agregados de ranking por mundo, jugador/alianza/miembro; snapshots al lunes 00:00 UTC, cierre con clave única `(world_id,week,scope,category,rank)` y premios idempotentes mediante `award_grants`. Premio MVP exclusivamente honorífico/cosmético. Historial no editable.

## Consecuencias positivas
- Comparación semanal justa y auditable
- No dependencia de caché para exactitud
- Evita snowball de premios económicos

## Consecuencias y riesgos
- Debemos prevenir manipulación de actividad, multicuentas y cambios de alianza
- Rankings de muchas categorías requieren índices/materialización

## Alternativas evaluadas
- Sumar en cliente: fraude
- Premios de recursos o tropas: desequilibrio

## Señal de revisión
Añadir recompensas funcionales solo tras validar balance y antiabuso.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0015: Maravilla de nivel 100 y cierre de temporada transaccional

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Varios ejércitos pueden llegar junto a mejoras y ruptura de control; un mundo debe tener un único ganador.

## Decisión
Maravillas ubicadas en sedes especiales. Niveles 0-100 consumen tiempo/recursos; primera alianza elegible con nivel 100 inicia período de defensa configurable (propuesta 24h). Transiciones serializadas con lock de mundo/sede y `winner_alliance_id` único; verificación de asedios/propiedad. Archivar puntuaciones y resultados de forma inmutable.

## Consecuencias positivas
- Objetivo colectivo de campaña
- Temporada terminable y premiable
- Reglas transparentes

## Consecuencias y riesgos
- Necesidad de balance de costes/tiempos y ataques
- Riesgo de frustración por remontadas; debe probarse

## Alternativas evaluadas
- Victoria inmediata sin verificación: vulnerable a concurrencia
- Mundo sin fin: no cumple objetivo

## Señal de revisión
Una prueba de concurrencia debe demostrar que dos Maravillas simultáneas nunca generan dos ganadores.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0016: Despliegue de alfa en VPS con Docker Compose y assets estáticos

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Evitar costes y operaciones de Kubernetes o plataformas serverless incompatibles con worker persistente.

## Decisión
Contenedores de API, worker y PostgreSQL en un VPS con Docker Compose. Frontend estático y GLB en hosting/CDN opcional, HTTPS, backups externos, restauración probada, secretos fuera del repositorio y métricas. Carga real decide cuándo separar BD y añadir réplicas. No alojar GPU ni generadores IA en producción.

## Consecuencias positivas
- Coste base bajo y control completo
- Configuración reproducible y depuración simple

## Consecuencias y riesgos
- Un VPS es punto único de fallo; no prometer alta disponibilidad
- Responsabilidad de parches, backups, seguridad y alertas

## Alternativas evaluadas
- AKS/Kubernetes: coste elevado
- Solo serverless: worker persistente y websockets dependen de limitaciones proveedor

## Señal de revisión
Migrar servicios gradualmente si concurrencia, uptime y operación lo justifican.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0017: Control de acceso, autenticación y protección antifraude

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Mundos compartidos y activos de usuarios requieren defensa contra ataque cliente, acciones fuera de mundo y manipulación de rankings.

## Decisión
Credenciales con Argon2id (o IdP), sesión segura en cookie HttpOnly/SameSite con CSRF cuando corresponda, límites de tasa, DTO validados, autorización por rol/propiedad/mundo, bitácora de economía y diplomacia. No confiar en coordenadas, tiempos ni saldo enviados por cliente. Admin con permisos elevados y auditoría.

## Consecuencias positivas
- Menor exposición a exploits comunes
- Acciones reconstruibles ante disputas

## Consecuencias y riesgos
- Aumenta trabajo inicial de test y flujos de sesión
- La detección de bots/multicuentas requiere políticas y monitoreo continuo

## Alternativas evaluadas
- JWT sin gestión de sesión/rotación: insuficiente
- Solo comprobación UI: insegura

## Señal de revisión
Ejecutar pruebas negativas de autorización y cross-world antes de cada release.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0018: Pruebas automatizadas, carga y puertas de calidad para agentes

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Un agente puede escribir código plausible que no cumple el producto o degradar la base sin advertirlo.

## Decisión
Vitest para reglas, tests API/integración con PostgreSQL real, Playwright para flujos web y capturas, tests de propiedad para economía/batallas, tests de carrera bajo carga, linters/typecheck, check de licencias y validación GLB. CI bloquea merges sin criterios de aceptación; cada cambio IA llega por PR y se revisa.

## Consecuencias positivas
- Menos regresiones y posibilidad de iterar con IA
- Evidencia objetiva en lugar de demos aisladas

## Consecuencias y riesgos
- Tiempo de diseño de fixtures y ambientes
- Capturas visuales requieren revisión para no validar resultados erróneos

## Alternativas evaluadas
- Verificar solo build: no basta
- QA manual exclusivamente: lento/repetitivo

## Señal de revisión
Medir porcentajes de cobertura sobre módulos críticos pero priorizar invariantes y escenarios.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0019: Acceso a datos tipado con Drizzle y SQL explícito

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
El proyecto requiere TypeScript, migraciones y manejo fino de locks, índices y transacciones; añadir un ORM muy abstracto puede ocultar semántica.

## Decisión
Usar Drizzle ORM para esquema/migraciones y queries tipadas; SQL explícito para `FOR UPDATE SKIP LOCKED`, constraints, cierres de semana y casos críticos. Repositorios por agregado. No permitir writes directos desde controladores.

## Consecuencias positivas
- Tipado end-to-end y control de SQL
- Migraciones versionadas y revisables

## Consecuencias y riesgos
- Equipo debe comprender PostgreSQL e índices
- No todas las consultas complejas son idiomáticas en el ORM

## Alternativas evaluadas
- Prisma: válido, pero preferimos controlar operaciones SQL críticas
- SQL a mano en todos los módulos: aumenta boilerplate

## Señal de revisión
Revisar mantenibilidad y rendimiento tras el primer vertical slice.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.


---

# ADR-0020: No monetización pay-to-win en MVP 1

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
El éxito competitivo y los premios semanales pierden valor si puede comprarse superioridad militar.

## Decisión
MVP 1 no vende recursos, tropas, aceleradores de Maravilla ni ventajas exclusivas. Diseñar solo espacio futuro para cosméticos, estilos de estandartes y personalización no competitiva, sujeto a evaluación posterior.

## Consecuencias positivas
- Integridad competitiva y facilidad de balance
- Menor complejidad de pagos y legales en alfa

## Consecuencias y riesgos
- Sin ingresos directos durante alfa
- Los costos de infraestructura y soporte se financian externamente

## Alternativas evaluadas
- Tienda pay-to-win inicial: daña la propuesta de valor
- Anuncios invasivos: afectan inmersión

## Señal de revisión
Reevaluar monetización después de una temporada con métricas reales.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.

