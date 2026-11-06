# DOCUMENTO MAESTRO DE REQUERIMIENTOS DEL JUEGO

**Versión:** 2.0 — Revisión de jugabilidad, urbanismo y realismo visual  
**Género:** Estrategia, construcción de imperios, economía, diplomacia y guerra  
**Modalidad:** Multijugador online persistente, en tiempo real  
**Plataforma inicial:** Navegador web (desktop y responsive)  
**Inspiración funcional:** Travian: Legends  
**Nombre:** Por definir  
**Estado:** Especificación funcional inicial completa

---

# 1. Visión general

El juego será una plataforma de estrategia multijugador en tiempo real persistente, organizada en mundos independientes con fechas de inicio y finalización.

Los jugadores elegirán una civilización entre Romanos, Galos y Germanos, fundarán su primera aldea, desarrollarán su economía, investigarán tecnologías, construirán edificios, entrenarán ejércitos, explorarán territorios, conquistarán aldeas, formarán alianzas y competirán en guerras.

La victoria principal se conseguirá construyendo una **Maravilla del Mundo hasta el nivel 100**, o alcanzando el mayor nivel de Maravilla cuando finalice el plazo establecido para el mundo.

El diseño tendrá profundidad económica, militar y diplomática similar a Travian, pero contará con una identidad propia, una organización urbana diferente y una representación visual considerablemente más realista.

## 1.1. Características principales

- Mundos independientes, con mapas generados proceduralmente.
- Hasta 25 millones de posiciones teóricas por mundo.
- Tres civilizaciones con unidades, murallas y ventajas propias.
- Ciudades con tres recintos concéntricos protegidos por murallas.
- Campos de recursos ubicados **dentro de la muralla exterior**.
- Distribución urbana orgánica, sin cuadrículas visuales rígidas.
- Construcciones visibles que evolucionan por niveles.
- Producción y consumo de recursos persistentes.
- Comercio entre jugadores y rutas comerciales.
- Entrenamiento, investigación y mejora de unidades.
- Tropas visualmente realistas, con animaciones especializadas.
- Combate automático basado en estadísticas y órdenes estratégicas.
- Saqueos, asedios, espionaje, refuerzos y conquistas.
- Oasis con animales salvajes.
- Bandidos NPC con asentamientos y comportamiento propio.
- Alianzas, confederaciones, pactos y guerras.
- Rankings individuales, colectivos y semanales.
- Misiones económicas, militares y sociales.
- Eventos administrados y automáticos.
- Construcción, defensa y conquista de objetivos monumentales.
- Sistema de resultados históricos y nuevas rondas.

## 1.2. Exclusiones explícitas

**El juego no tendrá héroes ni aventuras individuales.**

Esto significa que se eliminan por completo:

- Personajes heroicos que suben de nivel.
- Atributos individuales de héroe.
- Equipamiento de héroe.
- Inventarios personales de armas y armaduras con bonificaciones de héroe.
- Aventuras automáticas para obtener recompensas.
- Misiones que obliguen a utilizar un héroe.
- Conquista de oasis mediante héroes.
- Revivir héroes o gestionar su salud.
- Casa de subastas especializada en objetos de héroe.

Las actividades de exploración, guerra, captura territorial y progresión serán realizadas por **unidades militares, colonos, administradores y edificios**.

Las misiones del juego estarán relacionadas con acciones estratégicas y no con personajes de rol.

## 1.3. Principios de diseño

1. La estrategia será más importante que la velocidad de interacción.
2. El estado del mundo continuará evolucionando sin jugadores conectados.
3. Las decisiones económicas tendrán consecuencias militares.
4. Las alianzas serán fundamentales para los objetivos globales.
5. Las unidades deberán representar físicamente su función.
6. Las aldeas deberán sentirse habitadas y construidas orgánicamente.
7. La visualización no podrá alterar injustamente el resultado del servidor.
8. El juego debe funcionar correctamente con miles de jugadores.
9. La información económica, militar y diplomática deberá ser clara.
10. Cada mundo debe generar una experiencia competitiva diferente.

---

# 2. Naturaleza del tiempo real

El juego será persistente y en tiempo real, pero no será un RTS de control individual de soldados como Age of Empires.

El jugador tomará decisiones estratégicas y el servidor procesará las acciones.

Por ejemplo:

- Una cantera produce arcilla automáticamente.
- Un edificio tarda cierto tiempo en construirse.
- Un cuartel entrena tropas continuamente mientras tenga órdenes.
- Un ejército se desplaza según su velocidad y distancia.
- Los mercaderes viajan con recursos.
- Las tropas pueden morir de hambre.
- Los enemigos pueden atacar una aldea desconectada.
- Las murallas pueden sufrir daños durante asedios.
- Una Maravilla puede terminar de construirse sin que el jugador esté conectado.

El cliente mostrará animaciones de estos acontecimientos, pero las reglas serán calculadas por el servidor.

Las animaciones militares serán representaciones visuales coherentes de resultados estratégicos y no una simulación física utilizada para determinar vencedores.

---

# 3. Usuarios y perfiles

El sistema tendrá únicamente tres perfiles globales.

| Perfil | Propósito |
|---|---|
| Administrador | Gestión general de la plataforma |
| Moderador | Supervisión y moderación de mundos asignados |
| Jugador | Participación competitiva |

## 3.1. Administrador

Tendrá acceso al panel de administración general.

Podrá:

- Crear, editar y desactivar usuarios.
- Crear moderadores.
- Asignar moderadores a mundos.
- Crear, programar, pausar y finalizar mundos.
- Configurar dimensiones y velocidad.
- Configurar la generación de mapas.
- Consultar mapas generados.
- Administrar eventos globales.
- Crear misiones y recompensas.
- Configurar reglas de balance.
- Consultar estadísticas globales.
- Supervisar recursos y economía agregada.
- Supervisar batallas y movimientos.
- Revisar incidentes y denuncias.
- Suspender o bloquear cuentas.
- Consultar registros de auditoría.
- Administrar anuncios.
- Archivar mundos finalizados.

Toda modificación extraordinaria del estado competitivo deberá quedar auditada.

## 3.2. Moderador

El administrador creará los usuarios moderadores.

Cada moderador tendrá acceso únicamente a los mundos asignados.

Podrá:

- Consultar jugadores y alianzas.
- Revisar denuncias.
- Administrar sanciones autorizadas.
- Supervisar comunicaciones denunciadas.
- Revisar actividad sospechosa.
- Consultar estadísticas generales.
- Publicar comunicados autorizados.
- Escalar incidentes.

No podrá modificar libremente:

- Recursos.
- Tropas.
- Edificios.
- Resultado de batallas.
- Propiedad de aldeas.
- Rankings.
- Condiciones de victoria.
- Configuración fundamental del mundo.

Para evitar conflictos de interés, no podrá competir con una cuenta de jugador en los mundos que modera.

## 3.3. Jugador

Podrá participar en varios mundos simultáneamente, pero tendrá un personaje principal por mundo.

Cada personaje poseerá:

- Civilización.
- Nombre propio dentro del mundo.
- Aldeas.
- Recursos.
- Tropas.
- Investigaciones.
- Economía.
- Alianza.
- Historial militar.
- Rankings.
- Medallas.

Los personajes de mundos diferentes no compartirán recursos, tropas ni territorios.

## 3.4. Cargos de alianza

Los cargos internos de las alianzas no serán perfiles globales.

Existirán mediante permisos dentro de cada alianza, incluyendo líder, oficial, diplomático, reclutador y coordinadores militares.

---

# 4. Sistema de mundos

## 4.1. Concepto

Cada mundo será una instancia independiente del juego con sus propios jugadores, aldeas, mapa, economía, guerras, alianzas, eventos y resultados.

Un mundo no podrá transferir recursos o ejércitos a otro.

## 4.2. Creación de mundos

El administrador definirá:

- Nombre.
- Descripción.
- Fecha y hora de inicio.
- Fecha y hora de término, cuando exista.
- Tamaño.
- Velocidad.
- Protección inicial.
- Configuración de bandidos.
- Generación de oasis.
- Configuración de eventos.
- Calendario de Maravillas.
- Parámetros de balance.

## 4.3. Dimensiones

| Tamaño | Dimensiones | Casillas |
|---|---|---:|
| Pequeño | 1000×1000 | 1.000.000 |
| Mediano | 2000×2000 | 4.000.000 |
| Grande | 5000×5000 | 25.000.000 |

La visualización será fragmentada. No se generarán simultáneamente millones de objetos gráficos ni registros físicos innecesarios.

## 4.4. Velocidades

| Velocidad | Multiplicador |
|---|---|
| 1x | Normal |
| 2x | Doble |
| 3x | Triple |
| 4x | Cuádruple |
| 5x | Quíntuple |

Afectará:

- Producción de recursos.
- Tiempos de construcción.
- Tiempos de investigación.
- Tiempos de entrenamiento.
- Fabricación de máquinas de asedio.
- Recuperación de tropas, cuando corresponda.

**Fórmulas generales:**

`producción = producción_base × velocidad`

`duración = duración_base / velocidad`

La velocidad de desplazamiento militar se configurará independientemente, manteniéndose por defecto igual entre mundos x1 y x5.

La velocidad del mundo no modificará los atributos básicos de combate.

## 4.5. Estados

Los mundos tendrán los siguientes estados:

1. Borrador.
2. Próximamente.
3. Activo.
4. Pausado.
5. Finalizando.
6. Finalizado.
7. Archivado.
8. Cancelado.

## 4.6. Próximamente

Cuando un mundo tenga una fecha futura:

- Aparecerá visible en el lobby.
- Mostrará su nombre y características.
- Mostrará fecha y hora de inicio.
- Mostrará cuenta regresiva.
- No permitirá entrar a jugar.
- No permitirá ejecutar acciones competitivas.

Al cumplirse la fecha, el servidor lo activará automáticamente.

## 4.7. Mundo activo

Cuando esté activo:

- Se permitirá registrar personajes.
- Comenzará la producción de las aldeas existentes.
- Se procesarán eventos.
- Se permitirán construcciones.
- Se habilitarán movimientos militares.
- El mundo evolucionará continuamente.

## 4.8. Finalización

Existirán dos condiciones obligatorias.

**Victoria por Maravilla:** la primera Maravilla que alcance el nivel 100 finalizará el mundo.

**Victoria por fecha:** cuando llegue la fecha final, ganará la Maravilla con el nivel más alto.

En una victoria individual, se registrará el propietario. Si pertenece a una alianza elegible, también se reconocerá a esa alianza.

Para desempates se utilizarán, en orden:

1. Nivel de Maravilla.
2. Progreso válido al siguiente nivel.
3. Fecha en que alcanzó el nivel actual.
4. Empate oficial si las condiciones anteriores no diferencian a los candidatos.

En caso de que ningún participante haya desbloqueado una Maravilla, se registrará un mundo sin vencedor monumental.

## 4.9. Finalización segura

Cuando termine un mundo:

- Se bloquearán nuevas órdenes competitivas.
- Se resolverán los eventos con fecha efectiva anterior o igual al cierre, en orden determinista.
- Se calcularán los resultados.
- Se registrará al vencedor.
- Se congelarán rankings.
- Se generará el resumen de ronda.
- Se archivarán los datos.

No debe haber dos vencedores contradictorios por problemas de concurrencia.

---

# 5. Generación procedural del mapa

## 5.1. Generación automática

Cada mundo se generará con una semilla.

La semilla determinará:

- Terrenos.
- Distribución de recursos.
- Oasis.
- Asentamientos bandidos.
- Puntos especiales.
- Posiciones colonizables.
- Regiones geográficas.
- Características ambientales.
- Ubicaciones monumentales.

La generación será reproducible mediante la misma semilla y versión del generador.

## 5.2. Cuadrantes

El mapa tendrá:

- Noroeste.
- Noreste.
- Suroeste.
- Sureste.

El jugador seleccionará el cuadrante inicial al registrarse.

## 5.3. Tipos de terreno

- Terreno libre colonizable.
- Aldea de jugador.
- Campamento de bandidos.
- Fortaleza de bandidos.
- Oasis.
- Territorio monumental.
- Terreno ambiental no colonizable.
- Posición especial de evento.

## 5.4. Terrenos agrícolas

Las aldeas podrán disponer de distintas distribuciones de recursos.

| Tipo | Madera | Arcilla | Hierro | Cereal |
|---|---:|---:|---:|---:|
| Equilibrado | 4 | 4 | 4 | 6 |
| Agrícola 9c | 3 | 3 | 3 | 9 |
| Agrícola 15c | 1 | 1 | 1 | 15 |

Las posiciones 15c serán escasas y estratégicamente importantes.

## 5.5. Generación equilibrada

El generador deberá garantizar:

- Distribución razonable de terrenos agrícolas.
- Ausencia de superposición de aldeas.
- Acceso a áreas iniciales.
- Distancias adecuadas entre posiciones.
- Oasis distribuidos por los cuadrantes.
- Bandidos de distintas dificultades.
- Ubicaciones monumentales separadas.
- Equilibrio estadístico de oportunidades.

El administrador podrá visualizar un resumen antes de publicar el mundo.

---

# 6. Registro en un mundo

El registro tendrá tres pasos.

## Paso 1 — Civilización

El jugador elegirá:

- Romanos.
- Galos.
- Germanos.

Cada civilización tendrá una descripción con fortalezas y debilidades.

## Paso 2 — Cuadrante

Elegirá una zona:

- Noroeste.
- Noreste.
- Suroeste.
- Sureste.

La posición exacta será asignada automáticamente.

## Paso 3 — Identidad

Ingresará:

- Nombre del personaje en el mundo.
- Nombre de la primera aldea.

Ambos se validarán antes de confirmar.

## 6.1. Creación inicial

El servidor:

1. Verificará que el mundo esté activo.
2. Comprobará que el usuario no tenga otro personaje propio.
3. Reservará una posición inicial libre.
4. Creará el personaje.
5. Creará su primera aldea.
6. Asignará recursos iniciales.
7. Aplicará la protección de principiante.
8. Habilitará el tutorial.
9. Redirigirá a la vista de aldea.

## 6.2. Protección inicial

Durante el período de protección:

- El jugador podrá construir.
- Podrá investigar y entrenar.
- Podrá administrar recursos.
- No podrá ser atacado por jugadores enemigos.
- No podrá atacar a otros jugadores.
- Podrá interactuar con objetivos PvE habilitados.

La duración se configurará por mundo.

---

# 7. Diseño de la aldea y distribución urbana

**Este es uno de los sistemas visuales fundamentales y diferenciadores del proyecto.**

Las aldeas tendrán tres divisiones urbanas, separadas mediante tres murallas.

La distribución no será una cuadrícula organizada con edificios alineados artificialmente.

Debe parecer un asentamiento medieval que ha crecido progresivamente: calles de diferentes anchuras, edificios orientados de distintas maneras, patios, pequeños espacios libres, viviendas auxiliares y zonas de actividad.

El resultado debe parecer orgánico, pero mantener una organización funcional clara.

## 7.1. Estructura de las tres murallas

Desde el centro hacia el exterior:

**Recinto 1 — Núcleo administrativo**

Comprende el área interior de la primera muralla.

**Recinto 2 — Zona urbana y militar**

Comprende el espacio entre la primera y la segunda muralla.

**Recinto 3 — Zona productiva**

Comprende el espacio entre la segunda y la tercera muralla.

**Exterior**

Corresponde al territorio fuera de la tercera muralla.

Toda la aldea, incluidos sus campos productivos, estará dentro de la muralla exterior.

## 7.2. Primera muralla

La primera muralla protegerá el núcleo administrativo.

En su interior estarán:

- Castillo.
- Centro Urbano.
- Plaza de Reuniones.
- Embajada.
- Ayuntamiento.
- Solar Monumental.
- Otras estructuras administrativas autorizadas.

El diseño será similar a una ciudadela o acrópolis medieval.

Esta muralla tendrá:

- Puertas de acceso.
- Torres defensivas.
- Niveles de mejora.
- Resistencia.
- Bonificaciones de defensa.
- Representación de daños.

## 7.3. Segunda muralla

La segunda muralla protegerá la zona militar y económica.

Entre la primera y la segunda estarán:

- Cuartel.
- Herrería.
- Establo.
- Taller de Asedio.
- Academia.
- Mercado.
- Almacenes.
- Graneros.
- Escondites.
- Hospital.
- Oficina de Comercio.
- Otras instalaciones especiales.

Habrá calles y caminos conectando las puertas de la primera y segunda muralla.

## 7.4. Tercera muralla

La tercera muralla será el límite exterior de la aldea.

**Entre la segunda y tercera muralla estarán todos los campos de recursos.**

Esto incluye:

- Granjas y plantaciones de cereal.
- Aserraderos y explotaciones forestales.
- Canteras de arcilla.
- Minas de hierro.
- Pequeños caminos agrícolas.
- Carretas y animales de carga ambientales.
- Depósitos secundarios decorativos.
- Infraestructura de trabajo asociada a cada campo.

Los campos no quedarán fuera de la ciudad.

El asentamiento completo tendrá la apariencia de una ciudad fortificada cuya economía productiva está protegida por la muralla exterior.

## 7.5. Desarrollo visual de las tres murallas

Las tres murallas deben ser estructuras independientes.

Cada una tendrá:

- Nivel.
- Integridad estructural.
- Resistencia.
- Bonificación defensiva.
- Costes de construcción.
- Tiempo de mejora.
- Daño acumulado durante asedios.
- Opciones de reparación.

La muralla exterior protege la zona productiva, la intermedia protege los servicios urbanos y la interior protege el centro administrativo.

**Regla de asedio propuesta:** las murallas se atacarán desde el exterior hacia el interior.

Los arietes podrán debilitar progresivamente las defensas de cada recinto.

El modelo militar no requerirá simular soldados atravesando físicamente cada puerta para decidir el combate; el servidor calculará el efecto defensivo de cada recinto.

El cliente podrá representar visualmente los impactos y brechas.

## 7.6. Murallas por civilización

| Civilización | Material predominante | Diseño |
|---|---|---|
| Romanos | Piedra | Muros de roca, torres cuadradas y fortificaciones organizadas |
| Galos | Madera | Empalizadas, troncos, torres de vigilancia y refuerzos |
| Germanos | Arcilla y tierra compactada | Terraplenes, barro endurecido, defensas de madera y tierra |

Las diferencias también afectarán al balance defensivo.

**Romanos:** mayor bonificación defensiva, construcción más costosa.

**Galos:** construcción flexible y defensas adaptadas a emboscadas.

**Germanos:** construcción económica y resistencia relativamente alta a ciertos efectos de demolición, con menor bonificación defensiva directa.

Los números exactos serán definidos en la matriz de balance.

## 7.7. Crecimiento físico de la aldea

La aldea comenzará con una versión pequeña de su infraestructura urbana.

Las murallas podrán tener niveles de desarrollo visual.

Al mejorar:

- Se reforzarán estructuras.
- Aparecerán torres.
- Crecerán parapetos.
- Se desarrollarán puertas.
- Aumentará la complejidad visual.
- Se agregarán elementos defensivos.

Los tres recintos deben existir conceptualmente desde el principio, aunque sus murallas puedan comenzar como delimitaciones primitivas y evolucionar hacia fortificaciones completas.

---

# 8. Urbanismo orgánico: desorden dentro del orden

## 8.1. Objetivo visual

Los edificios no deben ubicarse en una cuadrícula rígida ni ordenarse como bloques perfectamente alineados.

La ciudad deberá parecer construida históricamente, con crecimiento gradual.

Debe existir variación:

- Diferentes orientaciones de edificios.
- Distancias irregulares.
- Calles curvas.
- Pequeños callejones.
- Plazas.
- Patios.
- Árboles.
- Muros secundarios.
- Pozos.
- Carretas.
- Barriles.
- Cercos.
- Viviendas decorativas.
- Talleres ambientales.

## 8.2. Orden funcional

El aparente desorden no debe perjudicar la comprensión del jugador.

Cada edificio estará ubicado dentro del recinto que le corresponde.

Los caminos deberán permitir una conexión visual lógica entre puertas y edificios.

Los edificios grandes deberán tener espacio suficiente.

Los edificios no podrán superponerse.

Las máquinas de asedio, establos y talleres deberán tener espacios adecuados a su tamaño.

Los campos agrícolas deberán mostrar surcos, caminos y límites compatibles con su función.

## 8.3. Distribución procedural

Cada aldea podrá recibir una distribución visual generada proceduralmente.

El algoritmo tendrá en cuenta:

- Civilización.
- Tamaño de la aldea.
- Geometría de los tres recintos.
- Caminos principales.
- Puertas de murallas.
- Espacios utilizables.
- Edificios permitidos por sector.
- Tamaño físico de los edificios.
- Orientación.
- Distancia mínima entre objetos.
- Elementos ambientales.

La distribución deberá ser determinista para que la aldea no cambie arbitrariamente al recargar.

## 8.4. Ubicación de edificios

El jugador podrá construir en solares disponibles dentro del recinto correspondiente.

Los solares no estarán organizados visualmente en filas y columnas.

El sistema indicará posiciones válidas manteniendo un aspecto orgánico.

No se podrá colocar un Cuartel en un campo agrícola ni una mina en el centro administrativo.

Cuando se seleccione un edificio, la cámara podrá enfocarlo automáticamente.

## 8.5. Construcción visual

Al construir o mejorar:

1. Aparecerá una representación de obra.
2. Se mostrarán trabajadores o materiales ambientales.
3. El edificio progresará mediante etapas visuales.
4. Se completará su transformación cuando el servidor confirme la mejora.

La animación podrá comprimirse respecto del tiempo real.

No se requerirá ejecutar una animación durante horas: el estado final dependerá de las marcas temporales del servidor.

## 8.6. Elementos ambientales

Los habitantes decorativos podrán:

- Caminar.
- Transportar materiales.
- Trabajar.
- Empujar carretas.
- Entrar o salir de edificios.
- Realizar actividades agrícolas.
- Operar talleres.
- Patrullar murallas.

Estos personajes ambientales no serán unidades militares ni consumirán recursos de manera individual.

Su propósito será dar vida a la aldea.

---

# 9. Edificios

Cada edificio tendrá:

- Identificador.
- Civilización compatible.
- Categoría.
- Recinto permitido.
- Nivel actual.
- Nivel máximo.
- Costes.
- Duración.
- Requisitos.
- Bonificaciones.
- Capacidad.
- Modelo visual.
- Estados de construcción.

## 9.1. Recinto administrativo

| Edificio | Función |
|---|---|
| Castillo | Administración territorial, lealtad, colonos y conquista |
| Centro Urbano | Desarrollo y reducción de tiempos de construcción |
| Plaza de Reuniones | Administración de ejércitos |
| Embajada | Creación y participación en alianzas |
| Ayuntamiento | Cultura y celebraciones |
| Solar Monumental | Reserva del espacio para Maravilla |
| Maravilla del Mundo | Construcción de victoria una vez habilitada |

## 9.2. Recinto militar y económico

| Edificio | Función |
|---|---|
| Escondite | Proteger recursos |
| Almacén | Almacenamiento de madera, arcilla y hierro |
| Granero | Almacenamiento de cereal |
| Cuartel | Entrenamiento de infantería |
| Campo de Arquería | Entrenamiento de arqueros, si se separa del Cuartel |
| Herrería | Mejoras militares |
| Establo | Caballería |
| Taller de Asedio | Arietes y catapultas |
| Academia | Investigaciones |
| Mercado | Comercio |
| Oficina de Comercio | Mejoras mercantiles |
| Hospital | Recuperación de tropas |
| Plaza de Torneos | Bonificaciones de desplazamiento |
| Cuartel Avanzado | Entrenamiento militar adicional |
| Establo Avanzado | Entrenamiento adicional de caballería |
| Edificio de bonificación racial | Ventajas exclusivas |
| Edificios productivos secundarios | Serrería, Ladrillar, Fundición, Molino y Panadería |

## 9.3. Recinto productivo

| Construcción | Función |
|---|---|
| Leñador | Producción de madera |
| Cantera de arcilla | Producción de arcilla |
| Mina de hierro | Producción de hierro |
| Granja de cereal | Producción de cereal |

Estas construcciones ocuparán los campos del tercer recinto, entre la segunda y la tercera muralla.

Su distribución dependerá de la composición de recursos del terreno.

## 9.4. Mejoras

Cada construcción tendrá niveles.

La interfaz mostrará:

- Coste de recursos.
- Tiempo necesario.
- Producción o capacidad actual.
- Mejora esperada.
- Requisitos pendientes.
- Beneficios del siguiente nivel.

## 9.5. Colas

Las colas serán persistentes.

Estados:

- Disponible.
- Bloqueado.
- En espera.
- En construcción.
- Completado.
- Cancelado.

Las mejoras consumirán recursos al confirmar la orden, con reglas de devolución definidas para cancelaciones.

## 9.6. Demolición

Se permitirá demoler determinados edificios.

Las acciones irreversibles requerirán confirmación.

Las estructuras críticas de la aldea tendrán restricciones.

---

# 10. Recursos y economía

## 10.1. Recursos

Los cuatro recursos serán:

- Madera.
- Arcilla.
- Hierro.
- Cereal.

## 10.2. Producción

La producción dependerá de:

- Nivel del campo.
- Tipo de recurso.
- Velocidad del mundo.
- Edificios de producción.
- Oasis.
- Eventos.
- Bonificaciones especiales.

No dependerá de héroes ni de atributos individuales de personajes.

## 10.3. Almacenamiento

Los almacenes guardarán madera, arcilla y hierro.

Los graneros almacenarán cereal.

La producción sobrante se perderá cuando la capacidad esté completa.

## 10.4. Cereal

El cereal alimentará a población y tropas.

**Balance:**

`cereal_neto = producción_de_cereal - consumo_total`

Si la producción neta es negativa, las reservas disminuirán.

Si se agotan, comenzará el proceso de hambre y muerte de tropas según las reglas del servidor.

## 10.5. Edificios de producción secundaria

- Serrería: madera.
- Ladrillar: arcilla.
- Fundición: hierro.
- Molino: cereal.
- Panadería: cereal.

Se localizarán en el recinto urbano, pero beneficiarán a los campos del recinto exterior.

## 10.6. Recursos en tránsito

Los recursos transportados por mercaderes no estarán disponibles en el origen ni en el destino hasta completar las etapas correspondientes.

El servidor deberá garantizar que los recursos no puedan duplicarse mediante envíos concurrentes.

---

# 11. Civilizaciones

Las civilizaciones definirán:

- Arquitectura.
- Murallas.
- Ropa y equipamiento.
- Unidades.
- Bonificaciones.
- Edificios especiales.
- Mercaderes.
- Estrategias recomendadas.

## 11.1. Romanos

Civilización equilibrada, con fortificaciones de piedra y tropas profesionales.

**Ventajas:**

- Construcción simultánea de edificios y campos.
- Infantería de calidad.
- Buenas fortificaciones.
- Caballería pesada.

**Desventajas:**

- Costes militares elevados.
- Progresión ofensiva exigente.

### Unidades romanas

| Unidad | Tipo |
|---|---|
| Legionario | Infantería equilibrada |
| Pretoriano | Infantería defensiva |
| Imperano | Infantería ofensiva |
| Arquero romano | Ataque a distancia |
| Explorador | Espionaje |
| Jinete imperial | Caballería ofensiva |
| Jinete pesado | Caballería pesada |
| Ariete | Asedio |
| Catapulta | Asedio |
| Senador | Conquista |
| Colono | Colonización |

## 11.2. Galos

Civilización defensiva, móvil y especializada en supervivencia.

**Ventajas:**

- Buenas unidades defensivas.
- Caballería rápida.
- Trampas.
- Escondites superiores.

**Desventajas:**

- Algunas tropas caras.
- Dependencia de especialización.

### Unidades galas

| Unidad | Tipo |
|---|---|
| Falange | Defensa |
| Espadachín | Ataque |
| Arquero galo | Distancia |
| Explorador | Espionaje |
| Jinete ligero | Caballería rápida |
| Jinete druida | Caballería defensiva |
| Jinete noble | Caballería pesada |
| Ariete | Asedio |
| Catapulta | Asedio |
| Cacique | Conquista |
| Colono | Colonización |

## 11.3. Germanos

Civilización agresiva, orientada a ejércitos numerosos y saqueos.

**Ventajas:**

- Tropas ofensivas económicas.
- Mayor eficiencia en incursiones.
- Entrenamiento masivo.
- Bonificaciones de ataque.

**Desventajas:**

- Debilidad defensiva inicial.
- Dependencia de recursos saqueados.

### Unidades germanas

| Unidad | Tipo |
|---|---|
| Guerrero con porra | Ataque económico |
| Lancero | Defensa contra caballería |
| Guerrero con hacha | Ataque |
| Arquero germano | Distancia |
| Explorador | Espionaje |
| Paladín | Caballería defensiva |
| Caballero germano | Caballería ofensiva |
| Ariete | Asedio |
| Catapulta | Asedio |
| Cabecilla | Conquista |
| Colono | Colonización |

Los arqueros se incorporan explícitamente como una familia militar para las tres civilizaciones, aunque el catálogo final y sus nombres podrán diferenciarse del juego de referencia.

---

# 12. Realismo visual de tropas y personajes

**Todas las tropas, animales, colonos, bandidos y máquinas militares deben representarse mediante modelos y animaciones creíbles.**

No se utilizarán unidades abstractas, fichas planas o personajes que parezcan flotar sobre el terreno.

El estilo visual será medieval de inspiración histórica, con materiales, proporciones y movimientos convincentes.

No se exigirá reproducir exactamente armamento de una fecha histórica específica, ya que las civilizaciones coexistirán dentro de un mundo ficticio.

## 12.1. Infantería

Las unidades tendrán:

- Anatomía humana proporcionada.
- Equipamiento coherente con la civilización.
- Armas físicas.
- Escudos.
- Cascos.
- Armaduras.
- Animaciones de reposo.
- Caminar.
- Correr.
- Atacar.
- Defender.
- Recibir impactos.
- Morir.
- Retirarse.

Los movimientos deberán respetar el peso aparente del equipo.

Un soldado con armadura pesada no deberá moverse como uno ligero.

## 12.2. Arqueros

Los arqueros deberán:

- Portar arco y carcaj.
- Extraer flechas.
- Tensar correctamente la cuerda.
- Apuntar hacia el enemigo.
- Liberar la flecha.
- Mostrar una trayectoria visual plausible.
- Recargar antes del siguiente disparo.

Las flechas deberán representar correctamente el movimiento, sin aparecer mágicamente en el objetivo.

El alcance visual no modificará el sistema matemático del combate.

## 12.3. Caballería montada

**Los soldados montados deberán estar realmente montados sobre caballos animados.**

No se aceptarán unidades de caballería representadas como soldados a pie.

Los caballos tendrán:

- Anatomía proporcionada.
- Cabeza y cuello articulados.
- Movimiento realista de patas.
- Caminata.
- Trote.
- Galope.
- Frenado.
- Giro.
- Reacciones ambientales.
- Animaciones de caída.

Los jinetes deberán:

- Mantener posición coherente sobre la montura.
- Sujetar riendas.
- Utilizar las armas correspondientes.
- Reaccionar al movimiento del caballo.
- Atacar sin separarse visualmente de la montura.

La caballería pesada deberá transmitir mayor masa e inercia.

## 12.4. Arietes

Los arietes serán máquinas de asedio físicas.

Deberán incluir:

- Estructura de madera.
- Vigas.
- Refuerzos metálicos.
- Ruedas o mecanismos de transporte cuando corresponda.
- Personal que los opere.
- Animación de desplazamiento.
- Animación de impacto contra fortificaciones.
- Efectos de daño en murallas.

No podrán mostrarse como una unidad de infantería con un icono de ariete.

El ariete deberá tener escala coherente respecto de los soldados y de las murallas.

## 12.5. Catapultas

Las catapultas serán modelos completos de máquinas de asedio.

Deberán mostrar:

- Estructura.
- Brazos mecánicos.
- Mecanismos de tensión o contrapeso apropiados al diseño.
- Ruedas.
- Proyectiles.
- Operarios.
- Carga.
- Preparación.
- Disparo.
- Retroceso.
- Recuperación.

Los proyectiles describirán trayectorias visibles y producirán impactos representativos sobre edificios o fortificaciones.

No se exigirá una simulación balística para resolver el daño del servidor.

## 12.6. Colonos

Los colonos serán personas civiles.

Deberán contar con:

- Ropa de colonización.
- Mochilas.
- Herramientas.
- Carretas.
- Animales de carga cuando corresponda.
- Animaciones de desplazamiento.

Al fundar una aldea, podrá representarse una breve secuencia de llegada, descarga de materiales e inicio de construcción.

Los colonos no deben verse como soldados de combate.

## 12.7. Senadores, caciques y cabecillas

Estas unidades administrativas tendrán apariencia diferenciada.

**Senador romano:** vestimenta de autoridad, escolta o distintivos políticos romanos.

**Cacique galo:** autoridad tribal, indumentaria ceremonial y símbolos de liderazgo.

**Cabecilla germano:** dirigente militar o tribal con distintivos de mando.

No serán héroes y no tendrán progresión individual de RPG.

Serán unidades especiales de conquista, entrenables mediante edificios y requisitos.

Podrán acompañar ejércitos y reducir la lealtad de aldeas enemigas.

## 12.8. Exploradores

Serán tropas especializadas en reconocimiento.

Podrán representarse con:

- Equipamiento ligero.
- Capas.
- Ropa de camuflaje contextual.
- Animaciones de observación.
- Movimientos discretos.

Sus misiones se resolverán mediante reglas de espionaje y contraespionaje.

## 12.9. Proporciones

Las proporciones visuales deberán ser consistentes.

- Una persona no será más alta que una casa sin justificación.
- Los caballos deberán tener tamaño adecuado.
- Las catapultas deberán ser mayores que los soldados.
- Las murallas deberán ser suficientemente altas para representar fortificaciones.
- Los edificios deberán mantener escala coherente entre sí.

La cámara podrá ajustar tamaños mínimos perceptuales en vistas alejadas, pero sin deformaciones visuales evidentes.

## 12.10. Animaciones

Cada categoría tendrá un conjunto de animaciones base reutilizables.

El sistema deberá soportar:

- Transiciones suaves.
- Mezcla de animaciones.
- Diferentes velocidades.
- Animaciones por civilización.
- Variantes de equipo.
- Eventos de impacto.
- Representación de bajas.

## 12.11. Optimización

El realismo no debe destruir el rendimiento.

Se utilizarán:

- Niveles de detalle (LOD).
- Instanciación de modelos.
- Animación por lotes donde sea viable.
- Reducción de detalles a distancia.
- Limitación de efectos visuales.
- Culling de objetos no visibles.
- Representaciones agregadas de ejércitos enormes.

Una fuerza de 50.000 soldados no requerirá renderizar 50.000 personajes individuales simultáneamente.

La representación visual deberá reflejar el tamaño relativo del ejército mediante una cantidad controlada de modelos, formaciones y marcadores numéricos.

---

# 13. Entrenamiento e investigación militar

## 13.1. Cuartel

Permitirá entrenar:

- Infantería ofensiva.
- Infantería defensiva.
- Arqueros, cuando correspondan al edificio definido.

## 13.2. Establo

Permitirá entrenar:

- Caballería ligera.
- Caballería pesada.
- Unidades de reconocimiento montadas.

## 13.3. Taller de Asedio

Fabricará:

- Arietes.
- Catapultas.

Los tiempos serán mayores y los costes más elevados que los de unidades comunes.

## 13.4. Academia

Permitirá investigar y desbloquear tipos de unidades.

Las investigaciones tendrán:

- Requisitos.
- Recursos.
- Duración.
- Estado.

## 13.5. Herrería

Permitirá mejorar:

- Ataque.
- Defensa.
- Características especiales de unidades, según balance.

Las mejoras se aplicarán según el ámbito establecido para cada investigación.

## 13.6. Colas

Cada instalación militar tendrá colas de producción.

Se deberán descontar los recursos correspondientes y registrar los tiempos exactos.

---

# 14. Sistema de combate

## 14.1. Modelo

El combate será automático y autoritativo.

El servidor calculará el resultado según:

- Unidades atacantes.
- Unidades defensoras.
- Estadísticas de cada tipo.
- Cantidades.
- Mejoras.
- Bonificaciones.
- Murallas.
- Tipos de ataque.
- Condiciones del objetivo.

## 14.2. Tipos de operación

- Ataque.
- Asalto.
- Espionaje.
- Refuerzo.
- Conquista.
- Asedio.

## 14.3. Ataque

El atacante seleccionará:

1. Aldea de origen.
2. Objetivo.
3. Tipo de ataque.
4. Tropas.
5. Máquinas de asedio.
6. Objetivos de destrucción, si corresponde.
7. Confirmación.

El servidor calculará duración y llegada.

## 14.4. Asalto

Permitirá obtener recursos.

El botín estará limitado por:

- Capacidad de carga superviviente.
- Recursos disponibles.
- Protección de Escondites.
- Resultado militar.

## 14.5. Espionaje

Las unidades exploradoras podrán obtener información sobre:

- Tropas.
- Recursos.
- Defensas.
- Infraestructura seleccionada.

La información obtenida dependerá del resultado de la misión.

## 14.6. Refuerzos

Se podrán enviar tropas defensivas a:

- Aldeas propias.
- Aliados.
- Miembros de confederaciones, cuando las reglas lo permitan.

## 14.7. Tres murallas en combate

Los tres recintos tendrán efectos defensivos.

Un ataque de asedio podrá dañar murallas en orden exterior-interior.

El cálculo considerará:

- Nivel.
- Integridad.
- Material.
- Resistencia racial.
- Arietes disponibles.
- Bonificaciones militares.

**Regla propuesta de balance:** las tres murallas no sumarán tres veces una bonificación máxima convencional. Su efecto deberá tener límites y rendimientos decrecientes para impedir defensas prácticamente imposibles de superar.

Los arietes producirán daño a fortificaciones.

Las catapultas producirán daño a edificios y campos que sean objetivos válidos.

La capacidad de atacar estructuras interiores podrá depender del estado de las defensas exteriores y de la eficacia del asedio.

## 14.8. Efectos de ataques sobre la aldea

Las animaciones podrán representar:

- Tropas acercándose.
- Flechas.
- Caballería.
- Máquinas de asedio.
- Impactos.
- Incendios localizados.
- Polvo.
- Brechas en murallas.
- Edificios dañados.

Los edificios no deberán desaparecer visualmente por un ataque hasta que el servidor confirme su destrucción o reducción de nivel.

## 14.9. Informes

Cada batalla generará información de:

- Fecha.
- Participantes.
- Tipo.
- Tropas.
- Bajas.
- Botín.
- Daños.
- Resultado.
- Lealtad modificada.
- Edificios afectados.

---

# 15. Fundar y conquistar aldeas

## 15.1. Colonización

Para fundar una aldea se requerirá inicialmente:

- Tres colonos.
- 750 de cada recurso.
- Puntos de cultura suficientes.
- Un espacio de expansión disponible.
- Terreno libre.

## 15.2. Desplazamiento

Los colonos viajarán hasta la ubicación.

Cuando lleguen, se verificará que continúe libre.

La primera colonización válida ocupará la casilla.

## 15.3. Capital

Cada jugador tendrá una capital.

La capital tendrá reglas especiales de desarrollo y no podrá ser conquistada directamente.

## 15.4. Conquista

Las aldeas enemigas podrán conquistarse mediante:

- Senadores romanos.
- Caciques galos.
- Cabecillas germanos.

El proceso requerirá:

1. Eliminar defensas.
2. Reducir la estructura administrativa de protección.
3. Enviar administradores.
4. Reducir la lealtad.
5. Cumplir requisitos de expansión.
6. Alcanzar lealtad cero.

## 15.5. Transferencia de propiedad

Al conquistar una aldea, el servidor determinará:

- Nuevo propietario.
- Recursos.
- Edificios.
- Tropas existentes.
- Lealtad inicial.
- Estado de oasis.
- Investigaciones.
- Bonificaciones.

Los cambios se realizarán transaccionalmente.

---

# 16. Bandidos NPC

## 16.1. Propósito

Los bandidos serán una facción controlada por el servidor.

Ofrecerán actividades militares PvE, botín y objetivos estratégicos.

No reemplazarán la competencia entre jugadores.

## 16.2. Asentamientos

Existirán:

- Campamentos pequeños.
- Campamentos medianos.
- Fortalezas.
- Ciudadelas.

## 16.3. Unidades

Los bandidos tendrán unidades visualmente realistas:

- Saqueadores.
- Espadachines.
- Lanceros.
- Arqueros.
- Jinetes.
- Guardias.
- Exploradores.
- Operadores de asedio.
- Jefes de bandas.

Los jefes de bandas serán unidades NPC ordinarias con funciones militares o de mando, no héroes jugables con progresión individual.

## 16.4. Comportamiento

Podrán:

- Proteger campamentos.
- Recuperar tropas.
- Generar recursos.
- Realizar patrullas estratégicas.
- Reforzar posiciones.
- Responder a ataques.
- Custodiar recursos.
- Defender planos monumentales.

## 16.5. Dificultad

La dificultad dependerá de:

- Tamaño del asentamiento.
- Región.
- Etapa del mundo.
- Tipo de evento.
- Configuración del administrador.

## 16.6. Botín

El botín podrá incluir:

- Madera.
- Arcilla.
- Hierro.
- Cereal.
- Recompensas especiales de eventos.
- Objetos estratégicos no asociados a héroes.
- Acceso a determinados objetivos territoriales.

## 16.7. Apariencia

Los bandidos deberán tener:

- Vestimenta irregular.
- Equipamiento recuperado.
- Armas variadas.
- Animaciones diferenciadas.
- Monturas realistas.
- Campamentos con tiendas, fogatas, empalizadas y materiales.

No deberán verse como copias idénticas de los ejércitos de jugadores.

---

# 17. Oasis y animales salvajes

## 17.1. Oasis

Los oasis serán terrenos especiales con bonificaciones productivas.

Podrán ofrecer:

- Mayor producción de madera.
- Mayor producción de arcilla.
- Mayor producción de hierro.
- Mayor producción de cereal.
- Bonificaciones mixtas.

## 17.2. Fauna

Los oasis tendrán animales salvajes representados mediante modelos realistas.

Ejemplos:

- Jabalíes.
- Lobos.
- Osos.
- Serpientes.
- Arañas.
- Ciervos.
- Grandes felinos en regiones apropiadas.
- Otros animales según el bioma.

Los animales deberán tener:

- Anatomía proporcionada.
- Movimiento propio.
- Caminata.
- Carrera.
- Reposo.
- Ataque.
- Reacción al daño.
- Animación de muerte.

No deberán comportarse como soldados humanos.

## 17.3. Biomas

La distribución de animales tendrá coherencia geográfica.

Ejemplos:

- Bosque: lobos, osos y jabalíes.
- Llanura: ciervos y animales pequeños.
- Zonas cálidas: serpientes y otra fauna apropiada.
- Regiones húmedas: animales adaptados a ese entorno.

## 17.4. Conquista de oasis

Como no existirán héroes, los oasis se conquistarán mediante **unidades militares y puestos de control**.

Procedimiento:

1. Seleccionar un oasis dentro del rango permitido.
2. Enviar tropas para derrotar a los animales o defensores.
3. Cumplir el requisito de la instalación de control territorial.
4. Establecer un destacamento o puesto de control.
5. Vincular el oasis a la aldea correspondiente.

El puesto de control será una capacidad del Castillo o una instalación administrativa especializada.

La vinculación deberá respetar límites de alcance y cantidad.

## 17.5. Oasis enemigos

Los oasis de otros jugadores podrán ser disputados.

El atacante deberá derrotar su guarnición y cumplir las condiciones de transferencia.

## 17.6. Animales y ejércitos

Los animales salvajes no podrán capturarse para transformarlos en tropas mediante objetos de héroe.

Permanecerán asociados a ecosistemas, eventos y defensas naturales.

Se podrán incorporar animales de carga ambientales en las aldeas y rutas comerciales, sin que funcionen como unidades combatientes.

---

# 18. Comercio

## 18.1. Mercado

El Mercado permitirá:

- Enviar recursos.
- Publicar ofertas.
- Aceptar intercambios.
- Consultar mercaderes.
- Revisar movimientos.
- Cancelar ofertas disponibles.

## 18.2. Mercaderes

Cada civilización tendrá mercaderes con capacidades y velocidades propias.

Un mercader podrá realizar un envío a la vez.

## 18.3. Rutas comerciales

Se podrán programar envíos entre aldeas.

Configuración:

- Origen.
- Destino.
- Recursos.
- Cantidad.
- Frecuencia.
- Horario.
- Estado.

## 18.4. Comercio avanzado

Podrá incluir redistribución de recursos mediante un sistema NPC, con tasas y costes definidos.

Este sistema será independiente del mercado entre jugadores.

## 18.5. Seguridad comercial

El servidor impedirá:

- Duplicación de recursos.
- Ofertas aceptadas varias veces.
- Envíos superiores al inventario.
- Utilización simultánea de los mismos mercaderes.
- Transferencias entre mundos.

---

# 19. Alianzas

## 19.1. Creación

Se crearán mediante la Embajada.

Cada alianza tendrá:

- Nombre.
- Etiqueta.
- Escudo.
- Descripción.
- Líder.
- Miembros.
- Permisos.
- Diplomacia.
- Estadísticas.
- Bonificaciones.

Se propone un límite inicial de 60 miembros.

## 19.2. Roles internos

- Líder.
- Oficial.
- Reclutador.
- Diplomático.
- Coordinador ofensivo.
- Coordinador defensivo.
- Miembro.

Estos roles podrán combinarse.

## 19.3. Funciones

- Invitar jugadores.
- Gestionar solicitudes.
- Expulsar miembros.
- Delegar permisos.
- Publicar anuncios.
- Gestionar relaciones diplomáticas.
- Coordinar operaciones.
- Consultar estadísticas colectivas.
- Solicitar recursos.
- Solicitar refuerzos.

## 19.4. Bonificaciones

Las alianzas podrán investigar:

- Reclutamiento.
- Metalurgia.
- Comercio.
- Filosofía.

Las mejoras se financiarán mediante donaciones registradas.

## 19.5. Operaciones militares

Podrán organizar:

- Ataques.
- Asaltos.
- Exploraciones.
- Defensas.
- Operaciones de conquista.
- Defensa monumental.
- Logística militar.

El planificador permitirá objetivos, fechas, responsables y estados.

---

# 20. Diplomacia y guerras

## 20.1. Estados diplomáticos

- Neutralidad.
- Pacto de no agresión.
- Confederación.
- Guerra.
- Paz.

## 20.2. Pactos de no agresión

Una alianza podrá enviar una propuesta a otra.

La propuesta deberá aceptarse formalmente.

El pacto tendrá:

- Alianzas.
- Fecha de inicio.
- Vigencia.
- Condiciones.
- Estado.

Mientras esté vigente, las reglas podrán bloquear operaciones ofensivas entre sus integrantes.

La ruptura estará sujeta a un período de enfriamiento configurado para evitar ataques inmediatamente después de cancelar un pacto.

## 20.3. Confederaciones

Podrán reunir hasta tres alianzas según la regla inicial.

Permitirán cooperación militar y logística.

## 20.4. Guerras

Una alianza podrá declarar la guerra a otra.

La guerra registrará:

- Participantes.
- Duración.
- Ataques.
- Defensas.
- Bajas.
- Recursos saqueados.
- Aldeas conquistadas.
- Puntuaciones.

No será obligatorio declarar una guerra para realizar PvP ordinario.

## 20.5. Paz

Las alianzas podrán negociar la finalización de un conflicto.

Los acuerdos y resultados históricos quedarán registrados.

---

# 21. Maravilla del Mundo

## 21.1. Función

La Maravilla será la principal condición de victoria.

Tendrá 100 niveles.

## 21.2. Ubicación urbana

La Maravilla se ubicará en el recinto administrativo, dentro de la primera muralla.

Su espacio estará representado inicialmente por el Solar Monumental.

Solo podrá construirse en aldeas elegibles una vez desbloqueadas las condiciones.

## 21.3. Desbloqueo

Se propone un evento global de apertura monumental.

Este evento habilitará:

- Fortalezas especiales de bandidos.
- Planos de construcción.
- Territorios monumentales.
- Conquista de posiciones estratégicas.
- Construcción de Maravillas.

## 21.4. Planos

Los planos serán requisitos estratégicos.

Podrán obtenerse mediante conquista de fortalezas NPC o de otros jugadores.

Se podrán exigir varios planos para completar niveles superiores.

## 21.5. Construcción

Cada nivel requerirá:

- Recursos.
- Tiempo.
- Planos cuando corresponda.
- Requisitos administrativos.

## 21.6. Representación visual

La Maravilla deberá evolucionar visualmente.

No bastará con mostrar un número.

Su apariencia podrá pasar por etapas:

- Cimientos.
- Primeras estructuras.
- Construcción intermedia.
- Grandes niveles monumentales.
- Estructura casi completada.
- Monumento final.

El aspecto dependerá de la identidad artística del juego.

## 21.7. Defensa

La Maravilla podrá ser atacada.

Las alianzas deberán coordinar:

- Recursos.
- Refuerzos.
- Defensa.
- Contraataques.
- Información militar.
- Control de planos.

## 21.8. Victoria

La primera Maravilla que llegue al nivel 100 provocará la finalización del mundo.

Si la fecha límite ocurre antes, se seleccionará al propietario de la Maravilla mejor posicionada.

---

# 22. Misiones

El juego tendrá misiones, pero ninguna dependerá de héroes o aventuras.

## 22.1. Tutoriales

Ejemplos:

- Mejorar una granja.
- Construir un Almacén.
- Construir un Cuartel.
- Entrenar tropas.
- Explorar el mapa.
- Atacar un campamento bandido.
- Fundar una aldea.
- Crear una ruta comercial.

## 22.2. Misiones diarias

Podrán incluir:

- Producir recursos.
- Completar construcciones.
- Entrenar unidades.
- Derrotar bandidos.
- Realizar exploraciones.
- Comerciar.
- Contribuir a la alianza.

## 22.3. Misiones semanales

Podrán incluir:

- Participar en operaciones.
- Obtener recursos.
- Mejorar infraestructura.
- Completar objetivos PvE.
- Contribuir a bonificaciones colectivas.

## 22.4. Recompensas

Las recompensas podrán incluir:

- Recursos.
- Puntos de cultura.
- Bonificaciones temporales.
- Medallas.
- Títulos.
- Cosméticos.
- Reconocimientos.

No incluirán equipamiento de héroes.

---

# 23. Eventos especiales

El administrador podrá crear eventos propios de cada mundo.

## 23.1. Tipos

**Invasión de bandidos:** aparición de asentamientos hostiles o refuerzos NPC.

**Cosecha abundante:** aumento temporal de producción de cereal.

**Festival comercial:** beneficios temporales de comercio.

**Torneo militar:** recompensas por objetivos de combate.

**Semana de exploración:** objetivos relacionados con reconocimiento territorial.

**Asedio de fortalezas:** bandidos de alto nivel custodian recompensas especiales.

**Era Monumental:** desbloqueo de Maravillas.

## 23.2. Configuración

Cada evento tendrá:

- Nombre.
- Descripción.
- Mundo.
- Fecha de inicio.
- Fecha de término.
- Participantes elegibles.
- Objetivos.
- Recompensas.
- Reglas de repetición.

## 23.3. Procesamiento

Los eventos se activarán automáticamente.

Sus reglas serán procesadas en el servidor.

No dependerán de mantener abierta la interfaz de administración.

---

# 24. Estadísticas y rankings

## 24.1. Rankings individuales

- Población.
- Número de aldeas.
- Puntos ofensivos.
- Puntos defensivos.
- Recursos saqueados.
- Crecimiento.
- Conquistas.
- Rendimiento PvE.
- Desarrollo monumental.

## 24.2. Rankings colectivos

- Alianzas por población.
- Alianzas por ataque.
- Alianzas por defensa.
- Alianzas por saqueos.
- Alianzas por crecimiento.
- Alianzas por conquistas.
- Alianzas por Maravilla.

## 24.3. Rankings internos

Cada alianza podrá consultar estadísticas de sus integrantes.

Se mostrarán contribuciones, crecimiento, participación y rendimiento, respetando permisos de información militar sensible.

## 24.4. Premios semanales

Se entregarán premios individuales y colectivos.

**Individuales:**

- Mejor atacante.
- Mejor defensor.
- Mayor saqueador.
- Mayor crecimiento.
- Mejor rendimiento PvE.

**Colectivos:**

- Mejor alianza ofensiva.
- Mejor alianza defensiva.
- Mayor crecimiento.
- Mayor saqueo.
- Mayor participación en eventos.

Las recompensas serán principalmente honoríficas y cosméticas para no crear diferencias competitivas excesivas.

---

# 25. Interfaz del jugador

## 25.1. Inicio

Al entrar al mundo se mostrará la aldea favorita.

Si no existe, se abrirá la capital o aldea principal.

## 25.2. Navegación

Tendrá accesos a:

- Aldea.
- Mapa.
- Ejército.
- Comercio.
- Alianza.
- Estadísticas.
- Informes.
- Mensajes.
- Misiones.
- Eventos.
- Perfil.

No existirán accesos a héroes, aventuras ni equipamiento de héroe.

## 25.3. Barra superior

Mostrará:

- Mundo.
- Aldea.
- Madera.
- Arcilla.
- Hierro.
- Cereal.
- Producción.
- Consumo.
- Construcciones.
- Entrenamientos.
- Ataques entrantes.
- Notificaciones.

## 25.4. Vista de aldea

La cámara podrá recorrer los tres recintos.

El usuario podrá seleccionar edificios y campos.

Cada recinto tendrá identidad visual propia.

Los caminos, habitantes y detalles ambientales deberán dar sensación de ciudad viva.

## 25.5. Vista de ejército

Mostrará:

- Tropas por aldea.
- Tropas estacionadas.
- Tropas enviadas.
- Refuerzos.
- Entrenamiento.
- Investigaciones.
- Ataques entrantes.
- Movimientos.
- Simulador de combate.

## 25.6. Vista de comercio

Mostrará:

- Ofertas disponibles.
- Ofertas propias.
- Envíos.
- Mercaderes.
- Historial.
- Rutas recurrentes.

## 25.7. Vista de alianzas

Mostrará:

- Perfil de alianza.
- Miembros.
- Roles.
- Diplomacia.
- Guerras.
- Bonificaciones.
- Operaciones.
- Contribuciones.
- Rankings.

---

# 26. Vista de mapa

## 26.1. Funciones

- Zoom.
- Desplazamiento.
- Búsqueda por coordenadas.
- Centrar aldea.
- Selección de terreno.
- Información contextual.
- Marcadores.
- Capas de visualización.

## 26.2. Representación de aldeas

Las aldeas deberán ser identificables por civilización.

Las miniaturas o modelos de mapa mostrarán:

- Estilo arquitectónico.
- Tipo de muralla.
- Tamaño aparente según progreso.
- Bandera o estandarte.
- Estado especial cuando corresponda.

El mapa no tendrá que representar todos los edificios internos individualmente a cualquier distancia.

## 26.3. Capas

- Aldeas propias.
- Aliados.
- Enemigos.
- Bandidos.
- Oasis.
- Terrenos agrícolas.
- Maravillas.
- Movimientos conocidos.
- Marcadores.

## 26.4. Movimientos militares

Se distinguirán:

- Ataques.
- Asaltos.
- Espionajes.
- Refuerzos.
- Regresos.

El jugador podrá ver sus propias operaciones y los movimientos entrantes para los que tenga visibilidad.

No se revelará automáticamente la composición de ejércitos enemigos.

## 26.5. Rendimiento

El mapa se cargará por regiones o fragmentos.

Solo se renderizarán los elementos necesarios para la cámara actual.

Las aldeas lejanas utilizarán representaciones simplificadas.

---

# 27. Vista de informes

## 27.1. Categorías

- Ataques.
- Asaltos.
- Defensas.
- Espionaje.
- Comercio.
- Conquistas.
- Colonización.
- Oasis.
- Bandidos.
- Eventos.
- Sistema.

## 27.2. Funciones

- Consultar.
- Filtrar.
- Buscar.
- Marcar como leído.
- Guardar.
- Eliminar de la bandeja.
- Compartir informes autorizados.

## 27.3. Detalle de combate

Los informes podrán mostrar:

- Participantes.
- Tropas.
- Bajas.
- Botín.
- Edificios dañados.
- Murallas afectadas.
- Resultado.

También podrán incorporar una visualización simplificada o recreación estética de la batalla, sin reinterpretar sus resultados.

---

# 28. Vista de mensajes

## 28.1. Mensajes privados

Permitirá:

- Enviar mensajes.
- Responder.
- Consultar conversaciones.
- Bloquear usuarios.
- Denunciar.
- Archivar.

## 28.2. Comunicaciones de alianza

Secciones:

- General.
- Anuncios.
- Ofensivas.
- Defensas.
- Comercio.
- Diplomacia.

## 28.3. Anuncios de mundo

Los administradores y moderadores autorizados podrán publicar comunicados.

## 28.4. Notificaciones

El jugador podrá recibir avisos de:

- Ataques.
- Construcciones terminadas.
- Tropas entrenadas.
- Investigaciones.
- Mercaderes.
- Cereal insuficiente.
- Recursos completos.
- Mensajes.
- Alianzas.
- Guerras.
- Eventos.
- Maravillas.

---

# 29. Vista de estadísticas

Existirán tres perspectivas.

## 29.1. Personaje

- Aldeas.
- Población.
- Recursos.
- Producción.
- Tropas.
- Combates.
- Conquistas.
- Clasificación.

## 29.2. Imperio

- Producción total.
- Producción por aldea.
- Consumo.
- Almacenamiento.
- Tropas por tipo.
- Recursos en tránsito.
- Desarrollo de infraestructura.

## 29.3. Alianza

- Población.
- Crecimiento.
- Miembros.
- Guerra.
- Defensa.
- Saqueos.
- Objetivos.
- Progreso monumental.

Los datos privados no podrán consultarse mediante manipulación del cliente.

---

# 30. Sistema de progresión sin héroes

La progresión se concentrará en el desarrollo estratégico.

Existirán cinco ejes principales:

**Económico:** campos, almacenamiento, producción y comercio.

**Tecnológico:** investigación de tropas, mejoras de herrería y edificios especiales.

**Militar:** composición, tamaño, movilidad y calidad de ejércitos.

**Territorial:** nuevas aldeas, oasis, conquistas y control de posiciones.

**Social:** alianzas, diplomacia, bonificaciones colectivas y operaciones.

No existirá progresión personal de personajes heroicos.

La motivación continuará mediante construcción, guerras, territorios, clasificaciones, eventos y objetivos de alianza.

---

# 31. Modelo técnico de simulación

## 31.1. Autoridad

El servidor será la única fuente válida de:

- Recursos.
- Construcciones.
- Tropas.
- Combates.
- Movimientos.
- Propiedad territorial.
- Comercio.
- Resultados.

## 31.2. Persistencia temporal

El servidor almacenará:

- Hora de inicio.
- Hora de finalización.
- Estado.
- Costes.
- Referencias de origen y destino.
- Reglas aplicadas.

Esto permitirá reconstruir operaciones después de reinicios.

## 31.3. Procesamiento de eventos

Se registrarán eventos como:

- Construcción iniciada.
- Construcción terminada.
- Tropas entrenadas.
- Ejército enviado.
- Ejército llegado.
- Batalla resuelta.
- Mercader llegado.
- Aldea fundada.
- Aldea conquistada.
- Oasis ocupado.
- Muralla dañada.
- Maravilla mejorada.
- Mundo terminado.

## 31.4. Concurrencia

No podrá ocurrir:

- Duplicación de recursos.
- Entrenamiento gratuito.
- Colonización doble de una posición.
- Resolución doble de una batalla.
- Comercio aceptado dos veces.
- Recompensa duplicada.
- Dos vencedores incompatibles.

Se aplicarán transacciones y operaciones idempotentes.

## 31.5. Reconexión

Cuando el jugador se reconecte:

- Se recuperará el estado actual.
- Se calcularán recursos acumulados.
- Se consultarán eventos finalizados.
- Se actualizarán movimientos.
- Se mostrarán notificaciones pendientes.

## 31.6. Tiempo real

Las actualizaciones de interfaz podrán enviarse mediante WebSockets.

Los temporizadores visuales serán proyecciones del estado del servidor.

La simulación no dependerá de que un WebSocket esté conectado.

---

# 32. Arquitectura gráfica

## 32.1. Objetivo

El juego deberá permitir un mapa grande y aldeas detalladas sin exigir hardware de gama alta.

## 32.2. Representación

Se recomienda separar tres escalas:

**Mapa estratégico:** vista amplia de coordenadas, territorios, oasis y aldeas.

**Vista de aldea:** escena detallada de tres recintos con edificios y campos productivos.

**Visualizaciones militares:** representaciones de tropas, movimientos y combates con un número controlado de modelos.

## 32.3. Realismo visual

El estándar artístico contemplará:

- Materiales PBR.
- Iluminación ambiental coherente.
- Sombras.
- Texturas de piedra, madera, metal, barro y tela.
- Terrenos con relieve visual.
- Vegetación creíble.
- Agua cuando corresponda.
- Polvo y efectos atmosféricos moderados.
- Modelos humanos proporcionados.
- Animales correctamente animados.

## 32.4. Animación

Se utilizarán sistemas de esqueletos y animaciones reutilizables.

Los personajes deberán contar con estados de movimiento y acciones apropiadas a su función.

## 32.5. Rendimiento

Obligatorio:

- LOD.
- Instancing.
- Culling.
- Carga progresiva.
- Compresión de modelos y texturas.
- Gestión del presupuesto de polígonos.
- Opciones de calidad gráfica.
- Límites de unidades simultáneamente visibles.

## 32.6. Fidelidad del estado

Los gráficos no podrán representar información privada no autorizada.

Las animaciones deberán reflejar el estado confirmado de la partida.

---

# 33. Administración y observabilidad

## 33.1. Dashboard

Mostrará:

- Mundos.
- Jugadores.
- Conexiones.
- Operaciones pendientes.
- Batallas procesadas.
- Eventos.
- Estado de servicios.
- Incidentes.

## 33.2. Gestión de mundos

Permitirá:

- Crear.
- Configurar.
- Previsualizar.
- Publicar.
- Programar.
- Pausar excepcionalmente.
- Reanudar.
- Finalizar.
- Archivar.

## 33.3. Administración de contenido

Permitirá configurar:

- Edificios.
- Unidades.
- Costes.
- Bonificaciones.
- Eventos.
- Misiones.
- Recompensas.
- NPC.
- Parámetros de balance.

Las reglas competitivas de una ronda activa deberán mantenerse versionadas.

## 33.4. Auditoría

Se registrarán acciones administrativas y operaciones extraordinarias.

No se permitirá modificar resultados históricos sin trazabilidad.

---

# 34. Seguridad y juego limpio

El sistema deberá contemplar:

- Autenticación segura.
- Autorización por perfil.
- Permisos por mundo.
- Permisos de alianza.
- Prevención de solicitudes fraudulentas.
- Protección contra duplicación de recursos.
- Control de abusos y bots no autorizados.
- Protección de mensajes.
- Prevención de spam.
- Auditoría.
- Recuperación ante incidentes.
- Copias de seguridad.
- Monitoreo.

Los cálculos críticos serán realizados en el servidor.

---

# 35. Roadmap de desarrollo

## MVP 1 — Núcleo económico y visual

- Autenticación.
- Administración.
- Mundos.
- Lobby.
- Registro.
- Generación procedural.
- Mapa inicial.
- Aldea con tres recintos.
- Tres murallas.
- Distribución urbana orgánica.
- Campos dentro de la muralla exterior.
- Construcciones.
- Producción.
- Almacenamiento.

**Resultado:** un mundo persistente donde las aldeas puedan crecer.

## MVP 2 — Ejército y combate

- Tres civilizaciones.
- Unidades.
- Modelos militares.
- Infantería.
- Arqueros.
- Caballería montada.
- Exploradores.
- Arietes.
- Catapultas.
- Investigaciones.
- Entrenamientos.
- Movimientos.
- Combates.
- Asedios.
- Informes.

**Resultado:** guerras entre aldeas y visualización militar convincente.

## MVP 3 — Expansión y PvE

- Colonos.
- Puntos de cultura.
- Nuevas aldeas.
- Conquista.
- Senadores, caciques y cabecillas.
- Bandidos.
- Animales.
- Oasis.
- Control territorial.
- Recompensas PvE.

**Resultado:** expansión y competencia territorial.

## MVP 4 — Economía social

- Mercado.
- Mercaderes.
- Rutas.
- Alianzas.
- Cargos internos.
- Diplomacia.
- Confederaciones.
- Guerras.
- Mensajes.
- Rankings.
- Estadísticas.

**Resultado:** experiencia estratégica multijugador organizada.

## MVP 5 — Contenido y victoria

- Misiones.
- Eventos.
- Premios semanales.
- Fortalezas monumentales.
- Planos.
- Maravillas.
- Defensa monumental.
- Finalización de mundos.
- Rankings finales.
- Historial.

**Resultado:** ciclo competitivo completo.

## MVP 6 — Pulido y lanzamiento

- Realismo visual avanzado.
- Optimización de animaciones.
- Rendimiento del mapa.
- Balance económico.
- Balance militar.
- Pruebas de carga.
- Seguridad.
- Accesibilidad.
- Observabilidad.
- Recuperación ante fallos.
- Experiencia móvil.

**Resultado:** versión preparada para operación pública.

---

# 36. Casos de aceptación críticos

**CA-01:** un mundo Próximamente no permite participar antes de su fecha de inicio.

**CA-02:** un mundo se activa automáticamente.

**CA-03:** los personajes de distintos mundos tienen recursos independientes.

**CA-04:** la primera aldea aparece dentro del cuadrante seleccionado.

**CA-05:** la aldea tiene tres recintos concéntricos y tres murallas identificables.

**CA-06:** los campos de recursos están entre la segunda y tercera muralla.

**CA-07:** los edificios aparecen distribuidos de forma orgánica, sin colisiones ni cuadrículas visuales rígidas.

**CA-08:** cada civilización tiene el material de muralla correspondiente.

**CA-09:** las construcciones se completan aunque el usuario esté desconectado.

**CA-10:** el cereal se produce y consume correctamente.

**CA-11:** la caballería aparece realmente montada sobre caballos.

**CA-12:** los arqueros utilizan animaciones coherentes con arcos y flechas.

**CA-13:** catapultas y arietes son máquinas físicas con modelos y animaciones.

**CA-14:** colonos y administradores de conquista tienen apariencia funcional diferenciada.

**CA-15:** los animales y bandidos tienen modelos y comportamientos visuales adecuados.

**CA-16:** no existen héroes, aventuras ni mecánicas dependientes de ellos.

**CA-17:** los oasis pueden ocuparse mediante las nuevas reglas militares y territoriales.

**CA-18:** los movimientos, combates y asedios se resuelven por el servidor.

**CA-19:** el jugador puede consultar ataques y refuerzos entrantes con la visibilidad correspondiente.

**CA-20:** una aldea no puede ser conquistada sin cumplir requisitos.

**CA-21:** las alianzas pueden gestionar miembros, pactos y guerras.

**CA-22:** los rankings individuales y colectivos reflejan datos reales.

**CA-23:** las misiones no entregan recompensas repetidas indebidamente.

**CA-24:** la Maravilla se construye únicamente en aldeas elegibles.

**CA-25:** la primera Maravilla que alcanza el nivel 100 finaliza correctamente el mundo.

**CA-26:** cuando vence la fecha límite, gana la Maravilla más desarrollada según las reglas.

**CA-27:** los mundos terminados pueden consultarse sin permitir modificaciones competitivas.

**CA-28:** los mapas grandes cargan por fragmentos sin representar millones de objetos simultáneamente.

**CA-29:** ninguna visualización revela información militar privada no autorizada.

**CA-30:** una reconexión reconstruye el estado correcto de la partida.

---

# 37. Matriz de balance pendiente

Antes de implementar el motor definitivo se deberán especificar los datos numéricos.

## Economía

- Producción por nivel de campo.
- Costes de cada mejora.
- Tiempos de construcción.
- Capacidad de Almacenes y Graneros.
- Consumo de cereal.
- Bonificaciones de producción.

## Ejército

- Costes por unidad.
- Tiempo de entrenamiento.
- Ataque.
- Defensa contra infantería.
- Defensa contra caballería.
- Velocidad.
- Capacidad de carga.
- Consumo.
- Mejoras militares.

## Asedio

- Daño de arietes.
- Daño de catapultas.
- Resistencia de las tres murallas.
- Bonificaciones defensivas.
- Requisitos para atacar recintos interiores.

## Expansión

- Puntos de cultura.
- Costes de colonos.
- Límites de aldeas.
- Valores de lealtad.
- Efecto de senadores, caciques y cabecillas.

## PvE

- Tropas de bandidos.
- Recuperación de campamentos.
- Botín.
- Estadísticas de animales.
- Bonificaciones de oasis.

## Competición

- Requisitos monumentales.
- Costes de Maravillas.
- Tiempos de construcción.
- Frecuencia de eventos.
- Recompensas.
- Criterios de rankings.

Los valores deberán ser configurables y estar versionados por reglas del mundo.

---

# 38. Definición de producto terminado

El juego se considerará funcionalmente completo cuando sea posible:

1. Crear una cuenta.
2. Seleccionar un mundo.
3. Registrar una civilización y cuadrante.
4. Crear la aldea inicial.
5. Recorrer visualmente sus tres recintos amurallados.
6. Construir edificios distribuidos orgánicamente.
7. Mejorar los campos de recursos protegidos por la tercera muralla.
8. Producir, almacenar y consumir recursos.
9. Investigar tropas.
10. Entrenar infantería, arqueros y caballería.
11. Fabricar arietes y catapultas.
12. Enviar ataques, asaltos, espías y refuerzos.
13. Visualizar movimientos e informes.
14. Combatir contra bandidos.
15. Conquistar oasis.
16. Fundar nuevas aldeas.
17. Conquistar aldeas enemigas.
18. Comerciar.
19. Formar alianzas.
20. Negociar pactos y confederaciones.
21. Participar en guerras.
22. Completar misiones y eventos.
23. Obtener medallas y competir en rankings.
24. Conseguir planos monumentales.
25. Construir y defender una Maravilla.
26. Ganar o perder un mundo.
27. Consultar el historial final.
28. Comenzar una nueva ronda.

---

# 39. Objetivo final del proyecto

El juego deberá combinar la profundidad estratégica de los grandes juegos persistentes de navegador con una representación visual más elaborada.

Las aldeas deberán parecer asentamientos medievales reales, con tres recintos fortificados, caminos irregulares, actividad económica y edificios distribuidos orgánicamente.

Los campos de recursos estarán dentro de la muralla exterior.

Los ejércitos estarán representados por tropas humanas, caballería montada, arqueros y máquinas de asedio visualmente convincentes.

La progresión dependerá de la economía, las investigaciones, la expansión, las tropas y las alianzas, no de héroes o aventuras individuales.

La experiencia deberá ser profundamente estratégica, multijugador, persistente y competitiva.

**El resultado buscado es un juego en el que el jugador no solo administre números y temporizadores, sino que vea crecer un imperio medieval vivo, donde sus decisiones económicas, militares y diplomáticas transformen el mundo y determinen el resultado de cada ronda.**

---

**Fin del documento — Versión 2.0**

**Referencias de inspiración funcional:**

- https://support.travian.com/
- https://support.travian.com/es/collections/66-jugabilidad-basica
- https://support.travian.com/es/collections/73-juego-avanzado
- https://support.travian.com/es/collections/85-guias-del-juego

Estas referencias sirven para estudiar las mecánicas generales. La identidad visual, los modelos, los gráficos, la narrativa y los recursos artísticos del juego deberán desarrollarse de forma original.