# Reinos terrestres — diseño y cambio de alcance

Fecha: 2026-11-05. Encargo del propietario: mapa fijo exclusivamente terrestre, aldeas 3D con tres murallas, fundación/conquista, tres razas nuevas, redistribución propia, refuerzos aliados, encuentros en campo y oasis/NPC.

## Decisión ADR-T01

Este encargo sustituye el alcance naval de ADR-0010 y el plan de continuación **para los mundos nuevos** con ruleset `frontier-alpha.1`. Se conserva `mvp1-alpha.0` y el entrenamiento táctico. Combate mundial automático y persistente, sin requerir defensor online. No se copian nombres, arte ni tablas de Travian. PostgreSQL, ledger, worker e idempotencia existentes son canónicos.

Archivos previstos: nuevo ruleset, reglas puras de encuentro y parcelas, migración aditiva de expansión/alianzas/refuerzos, comandos y handlers existentes, API de territorio, mapa fijo y aldea 3D. Sin nuevas infraestructuras. Rollback: cerrar mundos `frontier-alpha.1`; volver a cliente anterior y dejar migración aditiva sin borrar datos.

## Reglas de la nueva versión (propuesta parametrizada)

- Recursos: madera, barro (`stone` conservado como identificador interno), hierro y cereal (`food`). 18 campos individuales: 4/4/4/6. Recintos: campos exteriores; industria y ejército; ciudadela con centro urbano, castillo y plaza. Tres murallas mejorables por separado.
- Tres razas: Custodios de Piedra (defensa/torres), Clanes de la Estepa (ataque/saqueo), Guardianes del Bosque (defensa/trampas). Estadísticas propias y versionadas; requieren playtest.
- Procesamiento: serrería, ladrillar, fundición, molino y panadería amplifican producción; mantenimiento de tropas y bonificación de oasis se liquidan por tramos.
- Fundación: centro urbano y plaza, tres colonos, coste configurable y viaje; reserva de casilla transaccional. La nueva aldea aparece al llegar. Sin teletransporte ni duplicación por reintento.
- Conquista: expedición con emisarios supervivientes reduce lealtad; no se conquista capital ni última aldea de otro jugador. Al cambiar dueño se cancelan colas, se conserva economía/edificios, se retiran defensas exclusivas incompatibles y se vuelven a comprobar permisos al llegar.
- Traslado: solo entre aldeas propias. Al llegar la aldea receptora puede redistribuir y reunir tropas. Refuerzo: solo misma alianza; mantiene propietario, no puede usarse para atacar por el receptor. Retirada por el propietario.
- Visibilidad: API solo devuelve marchas propias y ataques entrantes a aldeas propias. Composición enemiga oculta. Refuerzos ajenos y ataques de terceros ausentes del JSON.
- Intercepción: dos marchas enemigas coinciden en posición **y tiempo** durante su trayecto; cruzarse a horas diferentes no cuenta. Evento durable con lockset completo. Combate en campo sin murallas, trampas ni botín. Supervivientes vuelven a su aldea; el ejército que llega sin intercepción combate en el destino.
- NPC y oasis con guardianes animales persistidos. Oasis conquistado se vincula a la aldea de origen y aporta bonificación productiva; no se convierte en ciudad edificable. Sin héroes.

## Aceptación

Regresión M1/M2; mapas deterministas sin mar; parcelas y producción; fundación concurrente/idempotente; conquista; traslados y refuerzos sin cambio de dueño; privacidad entre tres jugadores y mundos; encuentros con tiempo compartido y reintento. Capturas reales del mapa y ciudad con tres anillos, benchmark y checks habituales. No declarar arte final ni gates aprobados automáticamente.

## Referencias de mecánicas

Fuentes oficiales consultadas, con adaptación propia:
- https://support.travian.com/en/articles/214-guide-resources-explained
- https://support.travian.com/en/articles/56-settling-villages
- https://support.travian.com/en/articles/54-conquering-villages
- https://support.travian.com/en/articles/48-oasis
- https://support.travian.com/en/articles/3-the-tribes-and-their-advantages
- https://support.travian.com/en/articles/72-special-servers-forwarding-troops

## Estado entregado y evidencia

Implementado en `frontier-alpha.1`: mapa fijo isométrico SVG con casillas de tierra;
aldea PlayCanvas 3D con tres recintos; 18 campos independientes; cinco procesadores de
recursos; castillo/plaza; tres razas, unidades exclusivas, colonos y emisarios; fundación
con reserva y llegada; conquista por lealtad; traslados propios y refuerzos de alianza con
retirada; filtro de marchas en servidor; encuentros en campo, también de regreso; torres,
trampas consumibles; NPC defensores y oasis con animales persistentes y bonificación.

La curación no está implementada: si hay refuerzos, el combate no genera heridos de hospital
para evitar transferir heridos ajenos al receptor. Los oasis vinculados a una aldea pasan
con ella al conquistador. Las colas de una aldea conquistada se cancelan; sus marchas
conservan dueño y regresan a otra aldea propia si hace falta. El combate en campo descarta
el botín transportado y hace regresar a los supervivientes; no genera botín nuevo.

Validación ejecutada el 2026-11-05:

| Comprobación | Resultado |
| --- | --- |
| `pnpm typecheck` | 11 paquetes sin errores |
| `pnpm lint` y `pnpm format:check` | Sin errores |
| `pnpm test` | 118 tests, 13 archivos, PostgreSQL 17 real separado de desarrollo |
| `pnpm build` | Web y bundles API/worker/battle-server correctos |
| `pnpm assets:validate` | 148 entradas válidas; 39 GLB nuevos con 3 etapas y 3 LOD, todos PENDING_REVIEW |
| Migraciones 0002/0003 | Aplicadas; snapshots de Drizzle encadenados y nombres de restricciones alineados con PostgreSQL |
| Navegador integrado y Chrome | Registro/login, mundo terrestre, mapa y ciudad 3D; Chrome sin errores de consola en la prueba |
| Flujo manual integrado | Cuartel con coste y 12 s de construcción; reclutamiento de 12 milicias; expedición a oasis con guardianes persistidos, ruta y cuenta regresiva; resultado aplicado por worker |
| Diseño móvil | 390 px: ancho de documento 390 px, navegación de cinco secciones y mapa presentes; barra de recursos con desplazamiento propio |

Pruebas nuevas: fundación idempotente/concurrente, colonia redistribuible, refuerzo aliado
sin autoridad ofensiva del receptor, retirada y mantenimiento al regresar, privacidad
entre tres cuentas y mundos, conquista NPC/capital protegida, oasis sin construcción,
pérdida de bonus al cambiar de dueño, encuentros únicos en ida/regreso, conservación y
replay determinista de trampas, y rechazo de catálogos/razas fuera de su versión. El test
TRAINING ahora compara también alianzas, miembros, refuerzos y fundaciones.

Muestra real de render, navegador integrado en este equipo, WebGL2, calidad media:
1200 frames, 59,8 FPS, frame medio 16,7 ms, p95 18,8 ms, CPU p95 3,2 ms, 628 draw calls
medias, 207116 triángulos, VRAM estimada 74,3 MiB, primer frame 90 ms. Es una medición
local, no un benchmark de dispositivos ni una aprobación del gate de arte/rendimiento.

Límites de esta entrega: balance propuesto pendiente de playtest; NPC defensivos sin
patrullas autónomas; animales sin regeneración; curación y asedio dirigido sin implementar;
no se reproduce todo el catálogo ni las tablas de Travian; arte nuevo pendiente de
aprobación humana. No se ejecutaron pruebas de carga, Safari/Firefox ni despliegue público.

Las capturas reales de mapa, ciudad y móvil se entregan en los outputs del chat. Para
volver a ejecutarlo, Docker/PostgreSQL activo y `pnpm dev`; el nuevo mundo se llama
**Reinos Terrestres ×50**. Los comandos de migración y seed son idempotentes.
