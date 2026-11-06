# Encargo maestro 2.0 / 2.1 — estado verificable

Fecha: 2026-11-06. Fuentes originales conservadas: [versión 2.0](MASTER-2.0.md) y [versión 2.1](MASTER-2.1.md). La 2.1 precisa urbanismo, fortificaciones y combate AUTO. Los seis MVP de estos adjuntos son fases del encargo nuevo; no deben confundirse con el MVP 2 táctico anterior del repositorio.

**El encargo completo sigue en implementación.** Ya incluye perfiles, gestión de mundos, registro por pasos, atlas completo con arrastre, aldea inicial vacía, censo/cereal, hambre, oasis, investigaciones y demolición. Las temporadas nuevas pueden usar `frontier-alpha.4`, que añade cultura, cupos, celebraciones y comercio durable. La matriz distingue lo ejecutado de lo restante. No hay aprobación automática de gates, arte, balance ni lanzamiento.

## Funcionalidad añadida y uso

Con PostgreSQL local activo:

```sh
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abrir http://localhost:5173. Hay un acceso único por usuario/correo y contraseña: el rol almacenado decide la vista. El Administrador local separado usa las credenciales del archivo privado `.env.admin.local`; se genera explícitamente con `pnpm --filter @reinos/api exec tsx --env-file-if-exists=../../.env src/bootstrap-admin.ts`. Los seeds ya no crean mundos públicos. El propietario solicitó reemplazar los cuatro mundos anteriores por uno creado mediante administración: **Tierras de la Frontera**, 1000×1000, economía ×5 y reglas `frontier-alpha.3`. Se verificó un respaldo privado antes de eliminar los mundos antiguos. No se promovió ni eliminó la cuenta `test`.

El mapa completo se descarga una vez como atlas compacto y se conserva al cambiar de sección. El arrastre fraccionario/con inercia no solicita regiones; aldeas y marchas se actualizan por separado. La selección de una casilla consulta su defensa autoritativa y materializa los NPC deterministas que correspondan. Las posiciones públicas son cartesianas, 0|0 central, cuadrícula cuadrada, con más columnas/filas según el espacio disponible. Los recursos/habitantes quedan fijos arriba y las tropas/ataques visibles sin menú Ejército. Las obras tienen animación de estado derivada de la cola.

El panel permanente distingue ataques de refuerzos/traslados, muestra tropas propias y alojadas, heridos, origen/destino y cuenta atrás. Incluye colonos en camino. El atlas dibuja retornos desde el punto real de un encuentro en campo. Conserva como máximo tres atlas completos y una caché acotada de iconos NPC. No vuelve a reiniciar el reloj de marchas al actualizar el HUD.

`frontier-alpha.4` preserva las reglas anteriores y añade Castillo/cultura para expansión, fiestas en el Ayuntamiento y Mercado/Oficina de Comercio funcionales. El Administrador elige las reglas al crear o editar un borrador; publicar fija esa versión. El mundo local existente conserva `frontier-alpha.3`: no se modificó su balance automáticamente. ADR [0061](../adr/ADR-0061-desarrollo-militar-y-demolicion.md), [0062](../adr/ADR-0062-cultura-y-expansion.md) y [0063](../adr/ADR-0063-comercio-durable.md) documentan parámetros y rollback.

- Alta con Romanos, Galos o Germanos, cuadrante y nombre de personaje exclusivo del mundo.
- Plano urbano generado desde semilla/coordenadas/civilización/versión y persistido al fundar. Se conserva tras recargar y conquistar. Las huellas máximas no se solapan ni bloquean caminos. Los 18 campos están entre las murallas urbana y exterior.
- Selección de solar, catálogo con solares compatibles resaltados, previsualización, costes, requisitos y confirmación. El servidor usa el plano persistido para validar.
- Una cola de campos y otra de edificios para Romanos; las otras civilizaciones conservan una. Cada cola tiene restricción única en PostgreSQL. Ambas obras terminan offline.
- Velocidad militar independiente de la económica en esta versión, por defecto ×1. Afecta ida, vuelta, fundación y retirada de refuerzos. Los mundos anteriores preservan su cálculo.
- Nivel e integridad separados para las tres murallas. Reparación propia por recursos/tiempo, idempotente y concurrente con otros recintos. Una reparación restaura la cantidad contratada al estado actual y no borra daños posteriores.
- Tres doctrinas con reparto entero sin duplicación: equilibrada 34/33/33, exterior 60/25/15, núcleo 15/30/55 (orden III/II/I). Son propuestas versionadas de balance.
- Un evento y una fila canónica de combate, fases III → II → I. Cada línea recibe únicamente su bonificación. RAID termina en II; botín requiere superar II. La conquista exige superar I y eliminar la protección del Castillo, además de administradores supervivientes y las restricciones anteriores.
- Arietes con escolta dañan las líneas alcanzadas; máquinas de asedio sin ejército no ganan solas. Catapultas con Plaza de Reuniones 3 pueden seleccionar un solar; solo dañan edificios de un recinto superado. Los daños y cancelación de obras incompatibles se confirman con bajas/botín.
- Informes por fase y visor del plano histórico con daños, pausa, velocidad, avance y salto al resultado. El visor no vuelve a resolver combate. El atacante ve tropas observadas y recintos alcanzados; reservas y edificios interiores no observados quedan fuera del JSON de su informe/recreación. El defensor conserva su informe completo.

## Matriz del alcance total

| Bloque del documento                   | Estado real               | Trabajo restante                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.0 §§1–2; 2.1 CORE-010/012            | Base implementada         | AUTO offline y sin héroes; TRAINING previo sigue separado                                                                                                                                                                                         |
| 2.0 §3; 2.1 §3.1                       | Implementado técnicamente | Login único/rol real, gestión global, moderadores por mundo, sanciones, denuncias, anuncios y auditoría. Falta cerrar los módulos administrativos asociados a historias aún pendientes                                                            |
| Mundos, estados, calendario y victoria | Parcial avanzado          | Borrador/publicación, programación, pausa/reanudación de economía/colas/eventos, cierre por fecha; falta el resultado monumental canónico                                                                                                         |
| Generación del mapa y registro         | Parcial avanzado          | Modal por pasos, atlas 1000/2000/5000, cartesianas/arrastre local, variantes 6/9/15 cerealeras y NPC regionales; faltan balance estadístico de oportunidades y sedes monumentales                                                                 |
| Urbanismo, solares, construcción       | Parcial avanzado          | Plano organic-2, tres recintos, caminos visibles, marcadores por nivel y diálogos compatibles, centro único al comenzar, demolición y solar monumental reservado; faltan funciones de edificios aún pendientes y variantes artísticas definitivas |
| Economía                               | Implementado técnicamente | Precisión/ledger/offline, habitantes y consumo militar, Granero, depósitos múltiples, cereal libre y hambre idempotente. Cultura, cupos y fiestas en nuevas reglas .4; falta playtest y balance competitivo                                       |
| Civilizaciones                         | Parcial                   | Nombres, identidad de reglas previa y doble cola romana; falta catálogo militar completo y arte propio fiel para cada pueblo                                                                                                                      |
| Fortificaciones y combate por recintos | Implementado técnicamente | Determinismo, daño, reparación, doctrina y asedio probado; faltan matriz de materiales/resistencias más amplia y playtest de balance                                                                                                              |
| Entrenamiento e investigación          | Implementado técnicamente | Academia y Herrería persistentes, una cola por instalación y bonus en snapshots; faltan ampliar catálogo militar/arte y playtest de balance                                                                                                       |
| Espionaje                              | Pendiente                 | Exploradores, contraespionaje y visibilidad obtenida por misiones                                                                                                                                                                                 |
| Fundación/conquista                    | Parcial avanzado          | Viaje/reserva, llanuras, defensa/lealtad/núcleo, cancelaciones y cultura/cupos por origen en reglas .4; falta catálogo completo de colonos/administradores y playtest                                                                             |
| Oasis y bandidos                       | Parcial avanzado          | Tesoro 10/15/20, 5×5 por aldea, hasta tres, bonus por materia, conquista por ataques/lealtad, bordes por propietario/alianza y regeneración periódica; faltan patrullas y dificultad/estados NPC completos                                        |
| Comercio                               | Implementado técnicamente | Mercado, custodia/ofertas, aceptación atómica, mercaderes, capacidad por pueblo, Oficina, viajes/retornos, historial y rutas en reglas .4. Pruebas de concurrencia y cambio de dueño ejecutadas; falta playtest y variantes artísticas            |
| Alianzas                               | Parcial previo            | Crear/unirse/reforzar; faltan invitaciones aprobadas, roles, permisos, expulsión, salida, bonificaciones y planes de asedio                                                                                                                       |
| Diplomacia                             | Pendiente                 | PNA de doble firma, ruptura, confederaciones, guerra/paz y auditoría                                                                                                                                                                              |
| Maravilla                              | Pendiente                 | Solar, calendario/planos, contribuciones, 100 niveles, daños, ganador único y desempates                                                                                                                                                          |
| Misiones/eventos                       | Pendiente                 | Tutorial, diarios/semanales, configuración administrativa, progreso/recompensas idempotentes                                                                                                                                                      |
| Rankings/premios                       | Pendiente                 | Eventos de puntuación, ámbitos individual/alianza/interno, snapshots semanales y entregas únicas                                                                                                                                                  |
| Mensajería                             | Pendiente                 | Privados/alianza, anuncios, moderación y notificaciones                                                                                                                                                                                           |
| Combate visual                         | Parcial                   | Informe/visor histórico de aldea y daños; faltan ejércitos animados por tipo, caballos montados, operarios, proyectiles y cámaras cinematográficas                                                                                                |
| Rendimiento/operación                  | Parcial                   | Mediciones locales y regresión; faltan carga prolongada, Firefox/Safari, despliegue público, backups restaurados y pruebas de incidentes                                                                                                          |

## Criterios específicos de aceptación

| IDs 2.1                                                  | Evidencia / limitación                                                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URB-001/003/004/005/006/007/008/009/010/011/012          | Reglas de plano, 100 semillas, contratos, persistencia y e2e de solar/catálogo. La variedad orgánica y huellas se validan con el kit actual; no prueban assets futuros       |
| URB-002/013                                              | Administración y catálogo ampliado presentes; cultura, investigación, demolición y Mercado funcionales. Maravilla y otros módulos siguen pendientes                          |
| URB-014/015                                              | Modelos de campos reutilizados; identidad artística completa pendiente                                                                                                       |
| FORT-001/002/004/005/006/007/008/009/010/011/012/013/014 | Tests puros y PostgreSQL, dos workers, daños en secuencia, reparación, asedio y permisos                                                                                     |
| FORT-003/015                                             | Piedra, madera y arcilla con GLB/materiales diferenciados y capturas de los tres pueblos en Chrome/Edge. Aprobación artística y playtest humano pendientes                   |
| VIS-001/002/003/007/008/010/011/012/015                  | Offline, visor de daños desde snapshot, control de reproducción y privacidad. Compatibilidad con futuros cambios de nombres de assets aún necesita una política de retención |
| VIS-004/005/006/009/013/014                              | Pendientes para el AUTO visual: no hay ejército completo animado ni agregación visual publicada de todas las categorías                                                      |

## Arquitectura, seguridad y rollback

[ADR-0057](../adr/ADR-0057-urbanismo-y-defensa-escalonada.md) amplía FR-003/005/007/008, ADR-0004/0005/0009/0056. No cambia el entrenamiento (FR2-001, ADR-0021/0037, M2-G0-02 y M2-G1-12): la regresión compara también las tres tablas nuevas.

Las migraciones 0004–0013 añaden planos, murallas/reparación, perfiles y moderación, Granero, regiones NPC, desarrollo, hambre, cultura/cupos/celebraciones y comercio. Todas las entidades de mundo tienen FK compuestas. Se reutilizan el ledger económico y el resultado canónico de batalla. Las mutaciones exigen sesión, CSRF, propiedad, mundo activo e idempotencia.

Se corrigió un deadlock expuesto por la doble cola concurrente: los bloqueos de serialización del mundo ahora son `FOR NO KEY UPDATE`, compatibles con el bloqueo de FK de las reservas idempotentes. Se conserva la exclusión entre mutaciones y no se modifican claves del mundo. Referencia: [bloqueos de PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS).

Rollback operativo: cerrar nuevas órdenes y drenar las activas, conservando datos e historiales. Los scripts `drizzle-rollback/0004…0013` son para una copia aislada y rechazan pérdida de progreso. El ensayo automático down/up comprueba columnas, defaults e índices de **39 tablas** en una base vacía temporal; [resultado](evidence/migration-results.json). No equivale a un ensayo de recuperación de un respaldo productivo.

Los tests tácticos anteriores agotaban sus plazos con timers de Windows: se amplió solamente el presupuesto de espera de test, conservando ticks, simulación y aserciones. Prettier conserva finales de línea del checkout con `endOfLine: auto`.

## Verificación ejecutada

- Dominio: [fortifications.test.ts](../../packages/game-rules/test/fortifications.test.ts), determinismo, conservación, accesos, límites y asedio.
- Integración PostgreSQL 17: [fortifications.test.ts](../../packages/core/test/fortifications.test.ts), persistencia, concurrencia real, dos workers, reintentos, aislamiento, doble cola, velocidad, mapa 5000 y privacidad.
- Web: `e2e:season` y `e2e:walls` contra `qa-season.ts`/puertos 3001 y 5174, exclusivamente `reinos_test`. Chrome/Edge, 1600×1050 y 390×844: login/perfiles, modal, atlas/arrastre sin solicitudes, regreso al mapa, diez aldeas, recursos/ejército permanente, construcción y tres materiales de muralla. [Experiencia](evidence/season-browser-results.json), [murallas y métricas](evidence/wall-browser-results.json), [ejército](evidence/chrome-permanent-army.png).
- Arte: **157 entradas** inspeccionadas, 5 APPROVED y 152 PENDING_REVIEW; nueve GLB propios para terraplén/puerta/torre de madera, con licencia/procedencia y PBR del proyecto. [Inspección](assets-run.log). Los edificios nuevos todavía reutilizan familias visuales del kit. Ninguna aprobación humana fue sustituida por una prueba automática.
- Rendimiento local: [atlas 1000/2000/5000](evidence/atlas-benchmark.json), generación de 25 millones de celdas en 2277 ms, 5,44 MB gzip y 5 ms de atraso máximo del event loop en esta muestra. Las métricas WebGL2 cortas figuran en el JSON de murallas; incluyen calentamiento y no constituyen aceptación de capacidad productiva.
- Salidas reales de [tests](test-run.log), [build](build-run.log), [formato](format-run.log), [lint](lint-run.log), [typecheck](typecheck-run.log), [navegadores](browser-run.log).
- `pnpm lint`, `pnpm typecheck` y `pnpm build`: correctos. Suite completa: **186 pruebas en 27 archivos**, incluyendo cultura y comercio. Los logs enlazados registran la ejecución real. La verificación de formato se repite al finalizar cada bloque.

Entorno disponible: Windows, Node 22.14.0, pnpm 10.28.0. Node es inferior al mínimo declarado por el repositorio; no se cambió ese mínimo. Las validaciones que figuran arriba se ejecutaron en ese runtime. No se ejecutaron carga prolongada, Safari/Firefox, despliegue ni revisión humana de arte/balance.

Siguientes bloques: catálogo militar/espionaje y diplomacia/alianzas completas, antes de competición/Maravilla, misiones y mensajería. La matriz mantiene todos los pendientes. `WORLD_PVP` permanece cerrado.
