# DOCUMENTO MAESTRO DE REQUERIMIENTOS FUNCIONALES
## Juego de estrategia multijugador persistente — Versión 2.1

**Estado:** Diseño funcional consolidado  
**Inspiración estratégica:** Travian: Legends  
**Género:** Estrategia, economía, conquista y diplomacia  
**Modalidad:** Multijugador persistente en tiempo real  
**Plataforma:** Navegador web  
**Prioridades de esta versión:** Fortificaciones, urbanismo orgánico y combate visual automático

---

# 1. Visión del producto

El juego permitirá desarrollar un imperio medieval mediante aldeas, construcciones, producción de recursos, entrenamiento de tropas, guerras, comercio, alianzas y diplomacia.

Los jugadores competirán dentro de mundos independientes, cada uno con su propio mapa, velocidad, fechas, recursos, eventos y condiciones de victoria.

El sistema mantendrá la profundidad estratégica de Travian, pero se diferenciará mediante:

1. Aldeas organizadas en tres recintos amurallados.
2. Campos agrícolas y explotaciones de recursos dentro de la muralla exterior.
3. Edificios distribuidos orgánicamente y elegidos mediante solares.
4. Murallas que participan en una defensa escalonada.
5. Tropas, animales y máquinas de asedio visualmente realistas.
6. Representaciones animadas de batallas calculadas automáticamente.
7. Ausencia absoluta de héroes y aventuras individuales.

La profundidad del juego vendrá de las decisiones económicas, la preparación militar, la especialización de aldeas, la conquista territorial y la colaboración entre jugadores.

---

# 2. Reglas fundamentales confirmadas

| Código | Regla | Estado |
|---|---|---|
| CORE-001 | Mundos independientes administrados por la plataforma | Definitiva |
| CORE-002 | Mundos de 1000×1000, 2000×2000 y 5000×5000 | Definitiva |
| CORE-003 | Velocidades 1x, 2x, 3x, 4x y 5x | Definitiva |
| CORE-004 | Romanos, Galos y Germanos | Definitiva |
| CORE-005 | Administrador, Moderador y Jugador | Definitiva |
| CORE-006 | Tres recintos concéntricos por aldea | Definitiva |
| CORE-007 | Tres murallas defensivas escalonadas | Definitiva |
| CORE-008 | Campos de recursos entre la segunda y tercera muralla | Definitiva |
| CORE-009 | Construcción en solares orgánicos elegidos por el jugador | Definitiva |
| CORE-010 | Combate estratégico automático y autoritativo | Definitiva |
| CORE-011 | Recreación visual de batallas | Definitiva |
| CORE-012 | Sin héroes ni aventuras | Definitiva |
| CORE-013 | Victoria por Maravilla de nivel 100 | Definitiva |
| CORE-014 | Victoria por mayor nivel de Maravilla al finalizar el mundo | Definitiva |

Las reglas propuestas en las siguientes secciones detallan cómo implementar estas decisiones sin introducir contradicciones entre ellas.

---

# 3. Estructura general de los mundos

## 3.1. Administración

El Administrador podrá crear mundos mediante un panel.

Configura:

- Nombre y descripción.
- Fecha y hora de inicio.
- Fecha y hora de término, opcional.
- Dimensiones.
- Velocidad.
- Protección de principiantes.
- Dificultad y distribución de bandidos.
- Oasis.
- Eventos.
- Aparición de objetivos monumentales.
- Parámetros de balance.

Los Moderadores serán creados por el Administrador y asignados a mundos concretos.

## 3.2. Dimensiones

| Tipo | Dimensiones |
|---|---|
| Pequeño | 1000×1000 |
| Mediano | 2000×2000 |
| Grande | 5000×5000 |

Los mapas serán generados proceduralmente y no requerirán crear millones de objetos persistentes de forma anticipada.

## 3.3. Velocidades

La velocidad afectará principalmente:

- Producción de recursos.
- Construcciones.
- Investigaciones.
- Entrenamientos.
- Recuperación de tropas.
- Fabricación de máquinas de asedio.

La velocidad militar de desplazamiento se configurará independientemente y permanecerá constante por defecto.

## 3.4. Ciclo de vida

Los mundos tendrán estados:

- Borrador.
- Próximamente.
- Activo.
- Pausado.
- Finalizando.
- Finalizado.
- Archivado.
- Cancelado.

Los mundos Próximamente mostrarán fecha de inicio y cuenta regresiva, pero no permitirán ingresar competitivamente.

## 3.5. Victoria

Un mundo finalizará cuando:

- Una Maravilla alcance el nivel 100.
- Se cumpla la fecha final establecida.

Si termina por fecha, ganará el jugador o alianza con mayor nivel de Maravilla.

Los desempates considerarán progreso del siguiente nivel y antigüedad del nivel alcanzado.

Los resultados quedarán archivados y no podrán modificarse mediante acciones ordinarias.

---

# 4. Registro y civilizaciones

Al ingresar a un mundo activo, el jugador completará:

**Paso 1:** elegir Romanos, Galos o Germanos.

**Paso 2:** seleccionar noroeste, noreste, suroeste o sureste.

**Paso 3:** indicar nombre de personaje y nombre de aldea inicial.

El servidor asignará la primera posición válida en el cuadrante seleccionado.

Cada civilización dispondrá de arquitectura, tropas, murallas, ventajas y limitaciones propias.

## 4.1. Romanos

- Fortificaciones de piedra.
- Infantería profesional.
- Caballería pesada.
- Desarrollo equilibrado.
- Construcción simultánea de campos y edificios como bonificación racial.

## 4.2. Galos

- Empalizadas de madera.
- Unidades defensivas.
- Caballería móvil.
- Protección de recursos.
- Trampas y emboscadas.

## 4.3. Germanos

- Murallas de tierra y arcilla compactada.
- Infantería económica.
- Saqueos eficientes.
- Ejércitos numerosos.
- Bonificaciones de ofensiva.

---

# 5. SISTEMA I — URBANISMO ORGÁNICO Y SOLARES

## 5.1. Objetivo

Cada aldea debe parecer una ciudad medieval que ha evolucionado progresivamente, no un conjunto de edificios alineados sobre una cuadrícula.

El jugador tendrá control estratégico sobre qué construir y en qué solar disponible hacerlo.

Sin embargo, los solares serán generados de manera que la aldea conserve calles, plazas, distancias, accesos y características arquitectónicas coherentes.

**Regla principal:** el jugador decide la ubicación de los edificios dentro de los solares válidos; el generador determina la geometría de la aldea.

## 5.2. Tres recintos

Cada aldea estará organizada así:

| Recinto | Ubicación | Función |
|---|---|---|
| I — Ciudadela | Dentro de la primera muralla | Administración y Maravilla |
| II — Ciudad urbana | Entre la primera y segunda muralla | Economía, comercio y ejército |
| III — Anillo productivo | Entre la segunda y tercera muralla | Granjas, canteras, minas y madera |

Las murallas seguirán perímetros irregulares. No deben ser necesariamente círculos perfectos.

El trazado podrá variar según la civilización, el terreno y la semilla de generación.

### Recinto I: Ciudadela

Tendrá los edificios administrativos y estratégicos.

- Castillo.
- Centro Urbano.
- Plaza de Reuniones.
- Embajada.
- Ayuntamiento.
- Solar Monumental.
- Maravilla del Mundo, cuando se desbloquee.

La ciudadela estará conectada con el recinto urbano mediante una o varias puertas fortificadas.

Su arquitectura será más monumental y defensiva.

### Recinto II: Zona urbana

Contendrá:

- Cuartel.
- Establo.
- Academia.
- Herrería.
- Taller de Asedio.
- Mercado.
- Oficina de Comercio.
- Almacén.
- Granero.
- Escondite.
- Hospital.
- Edificios de bonificación de recursos.
- Construcciones avanzadas.

Las calles podrán rodear edificios de forma irregular.

Deberá haber patios, pequeños espacios abiertos, puestos comerciales y edificios decorativos.

### Recinto III: Producción

Contendrá los campos de recursos.

- Granjas de cereal.
- Zonas de explotación maderera.
- Canteras de arcilla.
- Minas de hierro.

Los campos productivos estarán protegidos por la muralla exterior.

Deberán parecer instalaciones funcionales, no iconos separados de una ciudad.

Por ejemplo, una mina de hierro puede incluir una entrada excavada, andamios, vagones y trabajadores ambientales.

Las granjas mostrarán cultivos, cercos, caminos y construcciones agrícolas pequeñas.

## 5.3. Generación del plano urbano

Cada aldea tendrá una semilla de diseño derivada de:

- Semilla del mundo.
- Coordenadas.
- Civilización.
- Versión del generador urbano.

El algoritmo generará:

1. Geometría general.
2. Perímetro de los tres recintos.
3. Murallas y puertas.
4. Camino principal.
5. Calles secundarias.
6. Plazas y patios.
7. Zonas utilizables.
8. Solares.
9. Zonas ambientales.
10. Vegetación y decoración.

El resultado será reproducible.

Una aldea no deberá cambiar arbitrariamente de distribución después de actualizar el navegador.

## 5.4. Generación de caminos

Los caminos serán generados antes de distribuir los solares.

El sistema deberá crear:

- Un camino principal entre las puertas de los tres recintos.
- Caminos secundarios hacia edificios importantes.
- Accesos a instalaciones militares.
- Accesos al Mercado.
- Accesos a Almacenes y Graneros.
- Caminos agrícolas.
- Caminos de mantenimiento de murallas.

Las calles no necesitan ser perfectamente rectas.

Se permitirán curvas, pequeñas bifurcaciones y cambios de anchura.

No podrán generarse edificios que bloqueen los accesos esenciales.

## 5.5. Tipos de solares

Los solares serán posiciones predeterminadas e irregulares, con identificadores únicos.

| Solar | Dimensión relativa | Construcciones posibles |
|---|---|---|
| Administrativo | Mediano o grande | Edificios de gobierno |
| Monumental | Extra grande | Maravilla |
| Militar | Grande | Cuartel, Establo, Taller |
| Urbano pequeño | Pequeño | Escondite, servicios |
| Urbano mediano | Mediano | Academia, Herrería, Mercado |
| Logístico | Mediano o grande | Almacén, Granero |
| Productivo | Variable | Campos de recursos |

Cada solar incluirá:

- Identificador estable.
- Recinto.
- Geometría.
- Orientación.
- Superficie utilizable.
- Categorías permitidas.
- Ocupación.
- Distancia a caminos.
- Accesibilidad.
- Restricciones especiales.

## 5.6. Selección de solar

Cuando un jugador quiera construir:

1. Seleccionará un solar vacío.
2. El sistema mostrará los edificios compatibles.
3. Elegirá el edificio.
4. Se mostrará una previsualización.
5. Revisará costes y requisitos.
6. Confirmará.
7. Comenzará la construcción.

También podrá iniciar el proceso desde un catálogo de edificios, que resaltará los solares compatibles.

Ambos recorridos deberán funcionar.

## 5.7. Previsualización

La vista previa deberá mostrar:

- Modelo del edificio.
- Orientación propuesta.
- Superficie ocupada.
- Acceso a caminos.
- Nivel inicial.
- Coste.
- Tiempo.
- Requisitos.

La selección resaltará únicamente los solares válidos.

Los incompatibles aparecerán deshabilitados con una explicación contextual.

## 5.8. Reglas de ubicación

El servidor validará:

- Que el solar exista.
- Que pertenezca a la aldea.
- Que no esté ocupado.
- Que admita el edificio.
- Que exista espacio suficiente.
- Que no se bloquee un camino obligatorio.
- Que el edificio cumpla requisitos.
- Que haya recursos.
- Que la aldea esté en un estado válido.

No bastará con que el cliente muestre una posición libre.

## 5.9. Orientación de edificios

Los edificios tendrán una orientación coherente con el solar.

La orientación se calculará considerando:

- Camino más cercano.
- Puerta principal.
- Pendiente y topografía visual.
- Espacios adyacentes.
- Volumen del edificio.

Podrán existir pequeñas variaciones para evitar resultados artificialmente uniformes.

La orientación por defecto será determinada por el generador. No se permitirá rotación libre que cause colisiones.

## 5.10. Crecimiento visual

Al subir de nivel, el edificio podrá:

- Aumentar altura.
- Añadir pisos.
- Incorporar dependencias.
- Mejorar fachadas.
- Agregar detalles defensivos.
- Cambiar materiales.
- Mostrar mayor actividad.

El solar reservará desde el principio el espacio necesario para el nivel visual máximo previsto.

Así se evita que una mejora futura provoque colisiones con construcciones vecinas.

## 5.11. Distribución de campos

Los campos productivos tendrán posiciones propias dentro del tercer recinto.

Su tipo será determinado por la distribución del terreno, por ejemplo 4/4/4/6 o 1/1/1/15.

El jugador podrá mejorar cada campo, pero no convertir arbitrariamente una mina de hierro en una granja.

Los campos productivos tendrán formas irregulares y podrán agruparse visualmente por actividad.

Las granjas podrán compartir caminos, las canteras podrán agruparse en zonas de excavación y las explotaciones de madera podrán aparecer entre bosques administrados.

**Regla importante:** la forma gráfica de los campos no determinará su producción. La producción depende del nivel y de las reglas económicas.

## 5.12. Solares reservados

Algunas ubicaciones estarán reservadas.

Ejemplos:

- Solar Monumental.
- Castillo.
- Plaza de Reuniones, si se considera fija.
- Puertas.
- Torres.
- Accesos principales.

Estos espacios no podrán reemplazarse por edificios comunes.

## 5.13. Edificios múltiples

Se permitirá construir más de un Almacén, Granero u otras estructuras autorizadas cuando se cumplan los requisitos.

Cada instancia ocupará un solar distinto.

La capacidad y bonificaciones se calcularán según las reglas del edificio.

## 5.14. Demolición

La demolición liberará un solar después de completar el proceso correspondiente.

Podrán mostrarse ruinas o restos temporales.

El solar volverá a estar disponible cuando el servidor confirme la liberación.

## 5.15. Crecimiento y límites

No habrá expansión arbitraria e ilimitada del área amurallada dentro de una misma aldea.

Los tres recintos tendrán una capacidad máxima de solares determinada por el plano urbano.

Para impedir bloqueos accidentales de progresión, toda distribución deberá garantizar capacidad para los edificios obligatorios del juego.

El generador debe validar esta condición antes de aceptar el plano.

## 5.16. Estabilidad del diseño

Después de crearse una aldea, se guardarán su versión de distribución y los identificadores de los solares.

Una actualización del algoritmo procedural no podrá modificar automáticamente las aldeas existentes.

Los cambios de diseño requerirán una migración controlada.

---

# 6. SISTEMA II — TRES MURALLAS Y DEFENSA ESCALONADA

## 6.1. Objetivo

Las murallas serán un sistema estratégico de protección por recintos.

Su función será dificultar ataques y permitir a los defensores aprovechar distintas líneas de fortificación.

Las tres murallas serán independientes en construcción, daño, reparación y bonificaciones.

## 6.2. Estructura defensiva

El orden desde el exterior será:

**Línea 3 — Muralla exterior**

Protege granjas, minas, canteras y explotaciones madereras.

**Línea 2 — Muralla urbana**

Protege Almacenes, Graneros, Cuarteles, Mercado, Academia, Herrería y edificios militares.

**Línea 1 — Muralla interior**

Protege Castillo, administración y Maravilla.

El número indica el recinto urbano; el orden de ataque habitual será 3 → 2 → 1.

## 6.3. Construcción de murallas

Cada recinto tendrá su propia estructura de muralla.

Inicialmente podrán existir como delimitaciones primitivas de nivel cero o defensas básicas, según la configuración del mundo.

La mejora de una muralla exigirá:

- Madera.
- Arcilla.
- Hierro.
- Cereal cuando corresponda.
- Tiempo.

El nivel máximo y las bonificaciones serán configurables por civilización.

## 6.4. Atributos de muralla

Cada muralla tendrá:

| Atributo | Función |
|---|---|
| Nivel | Desarrollo de la fortificación |
| Integridad | Estado de conservación, de 0 % a 100 % |
| Resistencia | Dificultad de dañarla |
| Bonificación defensiva | Ventaja de tropas asignadas al recinto |
| Material | Piedra, madera o tierra/arcilla |
| Coste de reparación | Recursos necesarios |
| Tiempo de reparación | Duración |
| Estado | Intacta, dañada, comprometida o destruida |

La integridad y el nivel serán conceptos distintos.

Una muralla de nivel 15 puede estar dañada, conservando su nivel tecnológico y arquitectónico, pero con menor resistencia efectiva.

## 6.5. Diferencias entre civilizaciones

**Romanos**

- Piedra y torres de mampostería.
- Elevada bonificación defensiva.
- Construcción costosa.
- Apariencia monumental.

**Galos**

- Madera y empalizadas.
- Costes moderados.
- Buenas bonificaciones para determinadas unidades.
- Apariencia de fortificación tribal.

**Germanos**

- Terraplenes y arcilla compactada.
- Construcción económica.
- Resistencia física específica.
- Menor bonificación directa de defensa que los Romanos, compensada con otras propiedades.

Los números se definirán en una matriz de balance.

## 6.6. Guarniciones por recinto

El jugador podrá configurar una **doctrina defensiva** para cada aldea.

Esta doctrina determinará cómo distribuir estratégicamente sus tropas disponibles entre los recintos.

Inicialmente existirán tres doctrinas:

### Defensa equilibrada

Distribuye tropas entre los tres recintos.

Es la configuración predeterminada.

### Defensa exterior

Da prioridad al recinto productivo y a la muralla exterior.

Busca frenar saqueos y proteger la producción.

### Defensa del núcleo

Da prioridad a los recintos urbano e interior.

Busca conservar infraestructura administrativa y una posible Maravilla.

Cada doctrina tendrá porcentajes configurados mediante las reglas de balance.

La distribución se calculará antes del combate y podrá modificarse fuera de una batalla.

**No existirá control táctico de unidades durante el enfrentamiento.**

## 6.7. Asignación de unidades

Las tropas se distribuirán sin duplicarlas.

Un soldado asignado al recinto exterior no podrá defender simultáneamente el recinto interior.

La asignación considerará:

- Cantidad de tropas.
- Tipo.
- Doctrina.
- Bonificaciones.
- Refuerzos presentes.
- Posibles restricciones de unidad.

Los supervivientes de una línea podrán retirarse o continuar a otra únicamente si una regla explícita de combate lo permite.

Ninguna unidad podrá participar repetidamente sin que su estado y bajas sean actualizados.

## 6.8. Desarrollo de un ataque por recintos

Una batalla ofensiva completa se resolverá en fases.

### Fase A — Defensa exterior

El atacante llega a la aldea.

Se enfrenta a la defensa asignada al tercer recinto.

Se consideran:

- Infantería.
- Caballería.
- Arqueros.
- Refuerzos.
- Nivel e integridad de la muralla exterior.
- Arietes.
- Bonificaciones.

Si el atacante no logra superar la defensa, la operación se detiene.

Si logra superarla, las unidades supervivientes avanzan al siguiente recinto cuando la misión lo requiere.

No será obligatorio destruir físicamente toda la muralla para derrotar a sus defensores. Sin embargo, una muralla intacta impondrá mayor dificultad.

### Fase B — Defensa urbana

Se calcula el enfrentamiento contra las defensas del segundo recinto.

La muralla urbana proporciona bonificaciones a su guarnición.

Los atacantes pueden sufrir nuevas bajas.

Si consiguen imponerse, podrán afectar objetivos autorizados del recinto y continuar hacia la ciudadela.

### Fase C — Defensa administrativa

Los atacantes supervivientes se enfrentan a las tropas asignadas al núcleo.

La muralla interior proporciona su propia bonificación.

Este recinto protege especialmente:

- Castillo.
- Centro Urbano.
- Embajada.
- Ayuntamiento.
- Maravilla.

Las operaciones de conquista deberán superar las defensas necesarias para alcanzar el centro administrativo.

## 6.9. Resolución y tiempo

**Las tres fases pertenecen a un único evento de combate en el servidor.**

No existirán tres batallas separadas por minutos de espera.

La secuencia representa capas de resolución matemática.

En el momento de llegada:

1. Se identifica el ejército.
2. Se consulta el estado válido del objetivo.
3. Se aplican refuerzos que hayan llegado previamente.
4. Se determina la distribución defensiva.
5. Se resuelve la fase exterior.
6. Se resuelve la fase urbana si corresponde.
7. Se resuelve la fase interior si corresponde.
8. Se aplican resultados de asedio.
9. Se calcula botín o conquista.
10. Se registran pérdidas y movimientos posteriores.
11. Se genera el informe.
12. Se publica el resultado.

Todo debe ejecutarse como una operación consistente.

## 6.10. Bonificaciones defensivas

Cada muralla afectará a los defensores de su propio recinto.

No se aplicará automáticamente la suma de las tres bonificaciones a todas las tropas.

Fórmula conceptual:

`defensa_efectiva_recinto = defensa_tropas × (1 + bonificación_muralla_efectiva) × otros_modificadores`

La bonificación dependerá de nivel, integridad y características de la civilización.

Deberá existir un límite de balance para impedir defensas invulnerables.

## 6.11. Arietes

Los arietes tendrán la función de debilitar murallas.

Su efectividad dependerá de:

- Cantidad.
- Estadísticas.
- Mejoras.
- Supervivencia de las unidades que los protegen.
- Material de la muralla.
- Integridad.
- Resistencias.

Los arietes actuarán sobre las fortificaciones alcanzadas durante un ataque normal.

Podrán ocasionar daño persistente.

Un ariete sin escolta no deberá comportarse como un ejército ofensivo independiente capaz de derrotar cualquier guarnición.

## 6.12. Catapultas

Las catapultas atacarán edificios o campos autorizados.

Los objetivos dependerán del recinto alcanzado:

| Recinto alcanzado | Objetivos posibles |
|---|---|
| III | Granjas, canteras, minas y campos forestales |
| II | Cuarteles, Mercado, Almacenes, Graneros y edificios especializados |
| I | Castillo, edificios administrativos y Maravilla |

La capacidad de selección precisa de edificios dependerá del nivel de la Plaza de Reuniones.

No se permitirá atacar directamente un edificio del recinto interior cuando el ejército no haya superado las defensas necesarias para llegar a él.

## 6.13. Asaltos

Los asaltos tendrán una finalidad económica.

El jugador podrá saquear recursos almacenados si sus tropas logran alcanzar los objetivos logísticos necesarios.

**Regla propuesta:** los recursos almacenados en Almacenes y Graneros requieren superar las defensas de los recintos exterior y urbano.

El atacante no necesita conquistar la ciudadela para obtener botín.

El asalto evitará continuar al núcleo cuando su objetivo de saqueo ya esté resuelto.

Así los saqueos frecuentes no requieren siempre combatir a toda la guarnición interior.

## 6.14. Ataques completos

Los ataques normales buscarán derrotar al objetivo y podrán alcanzar la ciudadela.

Las máquinas de asedio producirán daños a edificios y fortificaciones según las condiciones del combate.

El atacante podrá elegir objetivos autorizados antes de enviar el ejército.

## 6.15. Conquistas

Las conquistas requerirán superar las defensas hasta el núcleo administrativo.

Los administradores de conquista deberán sobrevivir.

El Castillo o estructura administrativa protectora deberá encontrarse en un estado que permita reducir la lealtad.

Una vez cumplidas las condiciones, los administradores reducirán la lealtad del asentamiento.

Cuando alcance cero, el servidor podrá transferir la propiedad.

Las capitales seguirán protegidas contra conquista.

## 6.16. Refuerzos defensivos

Las tropas de otros jugadores podrán reforzar una aldea.

La doctrina defensiva determinará su asignación inicial a recintos, respetando las restricciones de tropas y las autorizaciones.

Los propietarios de los refuerzos conservarán los derechos correspondientes para retirarlos.

Las bajas se atribuirán correctamente al dueño de cada unidad.

## 6.17. Daño persistente

Las murallas dañadas permanecerán dañadas después del combate.

Se deberá reparar o reconstruir la fortificación.

El daño afectará futuras operaciones.

Una muralla cuya integridad alcance cero no proporcionará su bonificación defensiva ordinaria hasta que sea reparada suficientemente.

## 6.18. Reparaciones

El jugador podrá iniciar reparaciones mediante recursos y tiempo.

Las reparaciones no deberán restaurar automáticamente todas las murallas por mejorar el Castillo.

Cada recinto tendrá su proceso de reparación.

Las operaciones serán persistentes y estarán sujetas a los mismos controles de recursos que las construcciones.

## 6.19. Simultaneidad

Si varias operaciones militares llegan a una misma aldea en tiempos muy próximos, el servidor deberá resolverlas en un orden consistente.

Cuando compartan exactamente el mismo instante de llegada, utilizará una regla estable de ordenación de eventos.

Los refuerzos recibidos antes de un ataque participarán en la defensa.

Los recibidos después no podrán modificar retroactivamente el resultado.

## 6.20. Impacto estratégico

Este sistema permitirá estrategias como:

**Defensa de producción:** priorizar tropas y fortificaciones exteriores para impedir saqueos.

**Defensa urbana:** proteger Almacenes, Graneros y centros militares.

**Defensa monumental:** concentrar fuerza en la ciudadela para sostener una Maravilla.

**Ataque económico:** utilizar fuerzas rápidas para alcanzar recursos.

**Asedio prolongado:** realizar ataques sucesivos para debilitar murallas antes de una ofensiva mayor.

**Conquista:** superar todas las líneas para afectar la administración de la aldea.

---

# 7. SISTEMA III — COMBATE AUTOMÁTICO CON RECREACIÓN VISUAL

## 7.1. Objetivo

Las batallas deberán conservar la profundidad estratégica de Travian, pero contar con una presentación gráfica mucho más elaborada.

El jugador no controlará manualmente a cada soldado.

Podrá:

- Preparar ejércitos.
- Elegir tropas.
- Seleccionar el tipo de ataque.
- Elegir objetivos.
- Configurar defensas.
- Enviar refuerzos.
- Coordinar operaciones.
- Analizar resultados.

El resultado será calculado por el servidor.

La recreación visual mostrará lo que ocurrió de manera coherente con ese resultado.

## 7.2. Dos sistemas independientes

Se separarán completamente:

### Motor de combate

Responsable de determinar:

- Resultado.
- Bajas.
- Supervivientes.
- Daños.
- Botín.
- Conquistas.
- Consecuencias sobre estructuras.

### Motor de representación

Responsable de mostrar:

- Ejércitos.
- Formaciones.
- Caballería.
- Flechas.
- Catapultas.
- Arietes.
- Murallas.
- Impactos.
- Bajas.
- Secuencia visual del enfrentamiento.

El segundo sistema nunca podrá modificar el resultado del primero.

## 7.3. Envío de un ejército

El jugador abrirá la Plaza de Reuniones o seleccionará un objetivo en el mapa.

Definirá:

1. Aldea de origen.
2. Destino.
3. Tipo de misión.
4. Unidades.
5. Cantidades.
6. Máquinas de asedio.
7. Objetivos autorizados.
8. Confirmación.

El juego mostrará:

- Tiempo estimado de viaje.
- Hora de llegada.
- Composición propia.
- Consumo relacionado.
- Capacidad de carga.
- Restricciones aplicables.

No mostrará automáticamente tropas enemigas privadas.

## 7.4. Desplazamiento estratégico

El ejército viajará según:

- Distancia.
- Velocidad de la unidad más lenta.
- Bonificaciones de movilidad.
- Mejoras aplicables.

Las tropas serán retiradas de la disponibilidad de la aldea mientras estén en movimiento.

Los movimientos seguirán activos aunque los jugadores estén desconectados.

## 7.5. Llegada

Al llegar:

1. El servidor verifica el movimiento.
2. Obtiene el estado del objetivo.
3. Determina las tropas participantes.
4. Aplica mejoras y bonificaciones.
5. Ejecuta el cálculo.
6. Registra el resultado.
7. Actualiza el mundo.
8. Genera el informe y los datos para la reproducción.

El jugador podrá consultar inmediatamente el resultado.

**Nunca será obligatorio mirar la animación para completar una batalla.**

## 7.6. Modos de visualización

Se contemplan tres modos.

### Informe inmediato

Visualización de texto, cifras y resultados.

Es la opción más rápida.

### Recreación resumida

Representación animada de los acontecimientos principales.

Ideal para ataques frecuentes.

### Recreación cinematográfica

Presentación más detallada con cámaras, ejércitos y fases del combate.

Ideal para operaciones importantes.

El modo visual será una preferencia del usuario y no afectará a las reglas militares.

## 7.7. Fases de la recreación

Para un ataque completo, la escena podrá representar:

1. Aproximación.
2. Despliegue.
3. Contacto con defensores exteriores.
4. Ataque a la muralla exterior.
5. Avance al recinto urbano, cuando corresponda.
6. Segunda fase defensiva.
7. Entrada a la ciudadela, cuando corresponda.
8. Ataque a objetivos interiores.
9. Retirada o consolidación.
10. Resultado final.

Las fases no alcanzadas en el cálculo del servidor no aparecerán como victorias visuales.

Por ejemplo, si un ejército es derrotado en el recinto exterior, la animación no podrá mostrarlo destruyendo el Castillo.

## 7.8. Modelos de tropas

Las tropas utilizarán modelos tridimensionales con anatomía, armamento y equipamiento adecuados.

### Infantería

- Caminar.
- Correr.
- Formarse.
- Atacar.
- Bloquear.
- Recibir impactos.
- Caer.
- Retirarse.

### Arqueros

- Extraer flechas.
- Tensar arco.
- Apuntar.
- Soltar.
- Recargar.
- Defender posiciones.

### Caballería

- Caballos reales en proporción a los jinetes.
- Movimiento de patas y cuerpo.
- Trote.
- Galope.
- Carga.
- Frenado.
- Giro.
- Ataque montado.

### Arietes

- Estructuras de madera.
- Operarios.
- Desplazamiento.
- Impactos.
- Daño visual en puertas y muros.

### Catapultas

- Estructura mecánica.
- Operarios.
- Carga.
- Preparación.
- Disparo.
- Retroceso.
- Proyectiles.
- Impactos.

### Colonos

No participarán en batallas ordinarias.

Serán representados como civiles con herramientas y equipamiento de colonización.

### Senadores, caciques y cabecillas

Serán unidades administrativas especiales que podrán acompañar ejércitos.

Tendrán apariencia de autoridad según la civilización.

Su función será reducir lealtad, no actuar como héroes.

## 7.9. Realismo y coherencia

El realismo se concentrará en:

- Proporciones.
- Equipamiento.
- Movimiento.
- Interacción con armas.
- Animaciones.
- Materiales.
- Escala.
- Comportamiento de máquinas de asedio.

No será necesario usar física compleja para calcular cada flecha o golpe.

La fidelidad visual no debe comprometer la corrección del cálculo estratégico.

## 7.10. Formaciones militares

Las unidades aparecerán organizadas en formaciones apropiadas.

Ejemplos:

- Infantería en líneas.
- Lanceros defensivos.
- Arqueros detrás de infantería.
- Caballería en grupos.
- Arietes protegidos.
- Catapultas en posiciones posteriores.

El sistema de representación podrá elegir formaciones según la composición del ejército.

No será posible modificar estas formaciones durante una batalla para cambiar el resultado.

## 7.11. Escala visual de ejércitos

El juego debe permitir ejércitos de miles o decenas de miles de unidades.

No se renderizará obligatoriamente cada soldado individual.

Por ejemplo, un ejército de 20.000 unidades podrá representarse mediante varios centenares de modelos visibles, manteniendo un indicador claro de la cantidad real.

Los modelos serán una representación proporcional o simbólica de la fuerza registrada.

## 7.12. Bajas visuales

Las bajas deberán ser coherentes con el resultado.

Si el servidor determina que una unidad fue completamente destruida, la representación no podrá mostrarla regresando como superviviente real.

Cuando exista agregación visual, las bajas se representarán proporcionalmente.

No se necesitará mostrar individualmente cada pérdida del ejército.

## 7.13. Animación de asedio

Durante un asedio, la recreación podrá mostrar:

- Avance de los arietes.
- Impactos en puertas.
- Daños sobre fortificaciones.
- Disparos de catapultas.
- Proyectiles alcanzando estructuras.
- Polvo.
- Escombros.
- Incendios localizados.
- Brechas.

Los cambios visuales permanentes dependerán del resultado registrado.

## 7.14. Animación de las tres murallas

Las murallas podrán mostrarse con distintos estados:

- Intactas.
- Daños leves.
- Daños moderados.
- Daños graves.
- Brecha o destrucción.

El estado de cada muralla se derivará de su integridad real.

Los arietes dañarán las fortificaciones correspondientes.

Las catapultas impactarán objetivos válidos para la fase representada.

## 7.15. Cámaras

La recreación tendrá cámaras automáticas.

Podrán utilizar:

- Plano general del ejército.
- Vista de aproximación.
- Vista de murallas.
- Vista de infantería.
- Vista de caballería.
- Vista de máquinas de asedio.
- Vista aérea de la batalla.
- Plano final.

El usuario podrá pausar, acelerar o saltar la reproducción.

## 7.16. Reproducciones históricas

Cada batalla importante podrá consultarse desde su informe.

El servidor almacenará un registro estructurado que permita recrear el enfrentamiento sin guardar un archivo de vídeo completo.

Se recomienda almacenar:

- Identificador del combate.
- Versión de reglas.
- Identificadores de participantes.
- Fecha y hora.
- Composición visible por destinatario.
- Resultado por fase.
- Bajas.
- Daños.
- Objetivos.
- Semilla de animación.
- Versión de recursos visuales.

El cliente reconstruirá la reproducción.

## 7.17. Semillas visuales

Cada batalla tendrá una semilla visual que permita mantener coherencia entre reproducciones.

Esto hará posible que una recreación muestre secuencias similares cada vez que se reproduce.

La semilla visual no intervendrá en el resultado estratégico.

## 7.18. Privacidad militar

La recreación no revelará automáticamente tropas enemigas que el jugador no tenga derecho a conocer.

El motor generará una versión visible del registro para cada participante.

Los defensores, atacantes y aliados autorizados podrán recibir información diferente.

Las reproducciones compartidas respetarán las mismas reglas de visibilidad que los informes.

## 7.19. Rendimiento

Se utilizarán técnicas de optimización:

- Level of Detail.
- GPU instancing.
- Animaciones compartidas.
- Culling.
- Compresión de texturas.
- Reducción de efectos.
- Representación agregada de ejércitos.
- Limitación de personajes activos.

Deberán existir niveles de calidad gráfica.

El usuario podrá desactivar completamente las recreaciones y utilizar solo informes.

---

# 8. Integración de los tres sistemas

Los sistemas de urbanismo, fortificaciones y combate no funcionarán aisladamente.

## 8.1. Urbanismo y fortificación

La distribución de solares tendrá que respetar:

- Recintos.
- Murallas.
- Puertas.
- Accesos.
- Caminos.
- Zonas reservadas.

Una construcción no podrá ocupar una puerta ni interferir con el trazado defensivo.

## 8.2. Urbanismo y batalla

La recreación utilizará una representación de la aldea basada en el diseño existente en el momento del combate.

Si el objetivo posee un Cuartel en determinado solar, ese Cuartel deberá aparecer allí cuando resulte relevante.

Los objetivos de catapulta utilizarán las referencias de edificios reales, no posiciones decorativas inventadas.

## 8.3. Fortificaciones y batalla

Cada fase del combate corresponderá a un recinto defensivo.

El resultado de una fase determinará si se representa la siguiente.

Las animaciones deberán distinguir daños en murallas de daños en edificios.

## 8.4. Destrucción de edificios

Si una catapulta reduce un edificio de nivel 10 a nivel 7:

- El servidor registrará el nuevo nivel.
- El informe mostrará el daño.
- La recreación representará los impactos.
- La vista de aldea mostrará la versión visual correspondiente al nivel y estado resultante.

Si un edificio es destruido completamente, podrá permanecer como ruina visual hasta liberar o reconstruir el solar.

## 8.5. Persistencia gráfica

El estado gráfico se derivará del modelo persistente.

No se guardará el estado de cada objeto decorativo como si fuera una entidad competitiva.

Se guardarán únicamente los datos necesarios para reconstruir el entorno.

---

# 9. Interfaz de usuario

## 9.1. Vista de aldea

Al ingresar se abrirá la aldea favorita.

La interfaz permitirá:

- Zoom.
- Desplazamiento de cámara.
- Selección de edificios.
- Selección de campos.
- Cambio de recinto.
- Consulta de murallas.
- Inicio de construcciones.
- Consulta de tropas.
- Acceso a las otras vistas.

## 9.2. Gestión de solares

Al activar el modo Construcción:

- Los solares válidos se resaltarán.
- Los ocupados se distinguirán.
- Los bloqueados tendrán una explicación.
- El jugador podrá seleccionar uno.
- Aparecerá el catálogo compatible.
- Se mostrará una previsualización.
- Se podrá confirmar o cancelar.

El modo Construcción no deberá dificultar el uso ordinario de la aldea.

## 9.3. Gestión de murallas

Cada muralla tendrá un panel independiente con:

- Nivel.
- Material.
- Integridad.
- Bonificación defensiva.
- Recursos de mejora.
- Duración.
- Coste de reparación.
- Estado.
- Próxima mejora.

También existirá una vista general de las tres líneas defensivas.

## 9.4. Doctrina defensiva

Desde la Plaza de Reuniones se podrá elegir:

- Equilibrada.
- Defender producción.
- Defender núcleo.

El sistema mostrará una distribución estimada de tropas.

La configuración será persistente y se aplicará en futuras batallas.

## 9.5. Vista militar

Mostrará:

- Tropas propias.
- Tropas estacionadas.
- Refuerzos.
- Entrenamientos.
- Investigaciones.
- Ataques enviados.
- Ataques entrantes.
- Movimientos de regreso.
- Simulador de combate.

## 9.6. Informes de batalla

El informe estará dividido en:

1. Resumen.
2. Participantes.
3. Tropas.
4. Desarrollo por recintos.
5. Bajas.
6. Daño.
7. Botín.
8. Consecuencias.
9. Recreación visual.

## 9.7. Vista del mapa

Las aldeas mostrarán características visuales de su civilización.

A diferentes niveles de zoom podrán mostrarse:

- Iconos simplificados.
- Siluetas de murallas.
- Volumen general del asentamiento.
- Modelo detallado de la aldea en distancias cercanas.

No será necesario dibujar todos los edificios en el mapa estratégico.

---

# 10. Economía y construcciones

Se mantienen los cuatro recursos:

- Madera.
- Arcilla.
- Hierro.
- Cereal.

Los campos estarán ubicados en el tercer recinto.

Cada campo tendrá nivel, producción, coste y tiempo de mejora.

Los edificios de transformación se ubicarán principalmente en el segundo recinto.

Los Almacenes y Graneros también se ubicarán en el segundo recinto.

La producción, el consumo de cereal, las colas y el almacenamiento continuarán funcionando cuando el usuario esté desconectado.

Las construcciones y recursos serán calculados por el servidor.

---

# 11. Tropas y civilizaciones

Se mantienen las tres civilizaciones.

Cada una tendrá infantería, arqueros, caballería, exploradores, máquinas de asedio, colonos y unidades administrativas.

Todas las unidades tendrán:

- Ataque.
- Defensa contra infantería.
- Defensa contra caballería.
- Estadísticas adicionales cuando su categoría lo requiera.
- Velocidad.
- Capacidad de carga.
- Coste.
- Tiempo de entrenamiento.
- Consumo de cereal.
- Requisitos.
- Modelo gráfico.
- Animaciones.

Las mejoras de la Herrería afectarán a las unidades correspondientes.

La Academia desbloqueará tipos de tropas.

Ninguna civilización tendrá héroes.

---

# 12. Expansión territorial

El jugador podrá fundar aldeas mediante tres colonos, recursos y puntos de cultura.

Las aldeas no capitales podrán ser conquistadas mediante administradores.

- Romanos: Senadores.
- Galos: Caciques.
- Germanos: Cabecillas.

La conquista exigirá alcanzar el núcleo administrativo y cumplir las condiciones de lealtad.

Los nuevos asentamientos también utilizarán el sistema de tres recintos y solares orgánicos.

Su apariencia dependerá de la civilización y la semilla urbana.

---

# 13. Oasis y bandidos

## 13.1. Oasis

Los oasis tendrán animales salvajes y bonificaciones económicas.

No requerirán héroes.

Su conquista se realizará mediante tropas y mecanismos de control territorial asociados a la administración de la aldea.

## 13.2. Animales

Los animales tendrán modelos y animaciones propias.

Se utilizarán especies apropiadas para sus biomas.

No actuarán como soldados humanos ni serán capturados mediante objetos de héroe.

## 13.3. Bandidos

Los bandidos ocuparán campamentos, fortalezas y ciudadelas.

Podrán tener:

- Infantería.
- Arqueros.
- Caballería.
- Exploradores.
- Máquinas de asedio.
- Fortificaciones.
- Recursos.

Las fortalezas bandidas podrán utilizar versiones simplificadas de la defensa escalonada.

Los NPC podrán defender posiciones, recuperar guarniciones y participar en eventos.

---

# 14. Comercio y logística

Se mantienen:

- Mercado.
- Ofertas de intercambio.
- Mercaderes.
- Envíos de recursos.
- Rutas comerciales.
- Comercio avanzado.
- Capacidades propias de cada civilización.

Los mercaderes podrán representarse mediante carretas, animales de carga y personajes ambientales.

Los transportes seguirán siendo órdenes logísticas calculadas por el servidor.

---

# 15. Alianzas, diplomacia y guerras

Se mantienen:

- Creación de alianzas.
- Solicitudes de ingreso.
- Cargos internos.
- Permisos.
- Bonificaciones colectivas.
- Pactos de no agresión.
- Confederaciones.
- Declaraciones de guerra.
- Acuerdos de paz.
- Operaciones militares coordinadas.
- Rankings colectivos.

## 15.1. Aplicación a las tres murallas

Las alianzas podrán organizar:

- Defensa del recinto productivo.
- Refuerzos a guarniciones.
- Protección del núcleo.
- Suministro de cereal.
- Ataques de desgaste a fortificaciones.
- Operaciones de conquista.
- Defensa de Maravillas.

## 15.2. Planificación de asedios

Los coordinadores militares podrán crear planes con:

- Objetivo.
- Fase.
- Hora de llegada.
- Participantes.
- Tropas comprometidas.
- Recinto objetivo.
- Edificio objetivo.
- Estado.

La planificación no deberá emitir órdenes automáticamente sin autorización de los propietarios de las tropas.

---

# 16. Maravillas del Mundo

La Maravilla estará ubicada en el primer recinto.

Se construirá sobre el Solar Monumental de una aldea elegible.

Su construcción estará condicionada por el calendario del mundo y el cumplimiento de requisitos monumentales.

Los planos y posiciones especiales podrán estar protegidos por bandidos.

La Maravilla tendrá 100 niveles.

## 16.1. Defensa monumental

La Maravilla estará protegida por el sistema de tres murallas.

Su propietario deberá coordinar:

- Producción.
- Comercio.
- Refuerzos.
- Defensa exterior.
- Defensa urbana.
- Defensa del núcleo.
- Reparaciones.
- Suministro de cereal.

## 16.2. Asedio monumental

Los enemigos podrán atacar las líneas defensivas, debilitar murallas y alcanzar la Maravilla mediante operaciones de asedio exitosas.

Las catapultas solo podrán dañar la Maravilla cuando se cumplan los requisitos de acceso militar al recinto interior.

## 16.3. Final

La primera Maravilla en nivel 100 ganará.

Si el mundo termina por fecha, ganará la Maravilla con mayor nivel.

---

# 17. Eventos, misiones y rankings

El juego mantendrá:

- Misiones tutoriales.
- Misiones diarias.
- Misiones semanales.
- Eventos globales.
- Eventos PvE.
- Misiones económicas.
- Misiones militares.
- Objetivos de alianza.
- Premios semanales individuales.
- Premios semanales colectivos.
- Rankings de jugadores.
- Rankings de alianzas.
- Rankings internos de alianza.

Las recompensas estarán relacionadas con recursos, progreso económico, cultura y reconocimientos.

No incluirán aventuras de héroes.

---

# 18. Contratos funcionales de los nuevos sistemas

## 18.1. Plano urbano

Entidad conceptual: `VillageLayout`

Datos mínimos:

- Identificador de aldea.
- Semilla.
- Versión de diseño.
- Civilización.
- Geometría de recintos.
- Solares.
- Caminos.
- Puertas.
- Elementos reservados.

## 18.2. Solar

Entidad conceptual: `BuildingPlot`

Datos mínimos:

- Identificador.
- Aldea.
- Recinto.
- Tipo.
- Geometría.
- Orientación.
- Categorías permitidas.
- Edificio ocupante.
- Estado.

## 18.3. Muralla

Entidad conceptual: `WallSection`

Datos mínimos:

- Identificador.
- Aldea.
- Recinto.
- Civilización.
- Nivel.
- Integridad.
- Bonificaciones.
- Resistencia.
- Estado.
- Reparación en curso.

## 18.4. Doctrina defensiva

Entidad conceptual: `DefensiveDoctrine`

Datos mínimos:

- Aldea.
- Tipo de doctrina.
- Versión de configuración.
- Distribución de guarnición.
- Fecha de modificación.

## 18.5. Resultado por recinto

Entidad conceptual: `BattlePhaseResult`

Datos mínimos:

- Combate.
- Recinto.
- Tropas participantes.
- Resultado.
- Bajas.
- Supervivientes.
- Daño a muralla.
- Objetivos afectados.
- Posibilidad de avance.

## 18.6. Registro de combate

Entidad conceptual: `BattleRecord`

Datos mínimos:

- Identificador.
- Versión de reglas.
- Atacante.
- Defensor.
- Origen.
- Destino.
- Momento.
- Tipo de operación.
- Composición.
- Fases.
- Bajas.
- Botín.
- Daños.
- Conquista.
- Resultado.
- Permisos de visibilidad.

## 18.7. Recreación visual

Entidad conceptual: `BattleReplay`

Datos mínimos:

- Identificador de combate.
- Versión de representación.
- Semilla visual.
- Secuencia de fases.
- Referencias de modelos.
- Eventos de animación.
- Niveles de daño.
- Política de visibilidad.

El registro de combate será la fuente autoritativa. La recreación dependerá de él.

---

# 19. Requisitos de concurrencia y consistencia

## 19.1. Construcción simultánea

Dos solicitudes concurrentes no podrán ocupar el mismo solar.

La reserva y construcción del solar deberán confirmarse transaccionalmente.

## 19.2. Integridad de murallas

Dos ataques concurrentes deberán aplicar daño mediante un orden consistente, sin sobreescribir reparaciones ni resultados anteriores.

## 19.3. Combate

Un movimiento militar no podrá resolverse dos veces.

Las tropas no podrán participar simultáneamente en operaciones incompatibles.

## 19.4. Instantáneas del estado

Cada batalla utilizará una instantánea válida de:

- Tropas.
- Fortificaciones.
- Bonificaciones.
- Edificios.
- Mejoras.
- Propietarios.
- Diplomacia aplicable.

El resultado deberá quedar vinculado a la versión de reglas utilizada.

## 19.5. Reproducciones

Una reproducción no podrá volver a ejecutar la batalla ni modificar su resultado.

Deberá poder reproducirse aunque el mundo haya terminado.

## 19.6. Actualizaciones del juego

Cambios futuros en edificios, modelos y algoritmos no deberán alterar los resultados históricos.

Las recreaciones antiguas podrán conservar referencias versionadas a sus recursos gráficos o utilizar un modo de compatibilidad.

---

# 20. Rendimiento y escalabilidad

## 20.1. Generación de aldeas

Los planos urbanos deberán generarse una vez y reconstruirse sin cálculos costosos en cada visita.

## 20.2. Representación de solares

Los solares serán elementos de interacción, no necesariamente objetos gráficos visibles permanentemente.

Se mostrarán cuando corresponda.

## 20.3. Grandes ejércitos

La representación visual utilizará agregación.

No se requerirá dibujar cada soldado de un ejército numeroso.

## 20.4. Reproducciones

Las batallas se reconstruirán desde registros estructurados.

No será obligatorio almacenar vídeos completos.

## 20.5. Dispositivos

Se ofrecerán niveles de calidad:

- Bajo.
- Medio.
- Alto.
- Ultra, cuando el dispositivo lo permita.

Las opciones podrán controlar sombras, animaciones, vegetación, efectos y cantidad de unidades visibles.

## 20.6. Accesibilidad

Se permitirá:

- Reducir movimiento.
- Desactivar recreaciones.
- Saltar animaciones.
- Consultar informes accesibles.
- Navegar mediante controles alternativos.
- Ajustar calidad gráfica.

---

# 21. Criterios de aceptación — Urbanismo

**URB-001:** cada aldea tiene tres recintos identificables.

**URB-002:** la ciudadela contiene edificios administrativos.

**URB-003:** los edificios urbanos y militares están entre la primera y segunda muralla.

**URB-004:** los campos de recursos están entre la segunda y tercera muralla.

**URB-005:** los solares se distribuyen orgánicamente.

**URB-006:** los solares no se superponen.

**URB-007:** existe conectividad visual entre puertas y edificios esenciales.

**URB-008:** el jugador puede elegir un solar válido.

**URB-009:** los edificios incompatibles no pueden construirse.

**URB-010:** los edificios de nivel superior no colisionan con edificios vecinos.

**URB-011:** la distribución se mantiene después de recargar.

**URB-012:** una actualización del generador no reorganiza aldeas existentes.

**URB-013:** la distribución permite construir todos los edificios esenciales.

**URB-014:** los campos muestran modelos apropiados a su tipo.

**URB-015:** las aldeas mantienen identidad visual según su civilización.

---

# 22. Criterios de aceptación — Fortificaciones

**FORT-001:** cada aldea tiene tres líneas defensivas independientes.

**FORT-002:** el nivel y la integridad de cada muralla se almacenan por separado.

**FORT-003:** las murallas tienen materiales según civilización.

**FORT-004:** una muralla dañada pierde efectividad según las reglas de balance.

**FORT-005:** una muralla puede repararse.

**FORT-006:** los arietes afectan la resistencia o integridad de fortificaciones alcanzadas.

**FORT-007:** los ataques completos se resuelven desde el recinto exterior hacia el interior.

**FORT-008:** las tropas no se duplican entre recintos.

**FORT-009:** las doctrinas defensivas modifican la distribución estratégica de guarniciones.

**FORT-010:** la bonificación de una muralla se aplica únicamente donde corresponda.

**FORT-011:** un ataque detenido en el exterior no puede destruir objetivos administrativos interiores.

**FORT-012:** una conquista requiere alcanzar el núcleo y cumplir las condiciones de lealtad.

**FORT-013:** los daños persisten después de la batalla.

**FORT-014:** ataques y reparaciones concurrentes generan resultados consistentes.

**FORT-015:** el balance permite que ejércitos preparados superen defensas fuertes sin que las tres murallas resulten invulnerables.

---

# 23. Criterios de aceptación — Combate visual

**VIS-001:** el servidor resuelve la batalla sin requerir el cliente conectado.

**VIS-002:** las recreaciones no modifican resultados.

**VIS-003:** el informe aparece aunque el jugador no mire la animación.

**VIS-004:** los ejércitos incluyen infantería y arqueros representados correctamente.

**VIS-005:** la caballería se representa montada sobre caballos.

**VIS-006:** los arietes y catapultas son máquinas de asedio con modelos adecuados.

**VIS-007:** los ataques representan solamente los recintos alcanzados.

**VIS-008:** los daños visuales corresponden a los daños registrados.

**VIS-009:** las bajas visibles son coherentes con el resultado, considerando representación agregada.

**VIS-010:** la reproducción puede pausarse, acelerarse y omitirse.

**VIS-011:** pueden reproducirse combates históricos.

**VIS-012:** una recreación no revela información militar oculta.

**VIS-013:** el sistema puede representar ejércitos numerosos sin renderizar todos los soldados.

**VIS-014:** las animaciones respetan diferencias entre infantería, arqueros, caballería, colonos y máquinas.

**VIS-015:** los gráficos pueden reducirse sin afectar el juego estratégico.

---

# 24. Roadmap actualizado

## MVP 1 — Mundo, economía y plano urbano

- Autenticación.
- Lobby.
- Administración de mundos.
- Generador procedural.
- Registro por civilización y cuadrante.
- Vista de aldea.
- Tres recintos.
- Solares orgánicos.
- Construcción de edificios.
- Campos productivos.
- Producción y almacenamiento.
- Vista del mapa.

**Objetivo:** disponer de aldeas persistentes, funcionales y visualmente diferenciadas.

## MVP 2 — Fortificaciones y ejército

- Tres murallas independientes.
- Mejoras y reparaciones.
- Doctrinas defensivas.
- Infantería.
- Arqueros.
- Caballería.
- Exploradores.
- Arietes.
- Catapultas.
- Entrenamientos.
- Investigaciones.
- Movimientos.
- Combate escalonado.

**Objetivo:** completar el sistema militar estratégico.

## MVP 3 — Expansión, NPC y combate visual

- Colonos.
- Puntos de cultura.
- Fundación.
- Conquista.
- Bandidos.
- Oasis.
- Animales.
- Control territorial.
- Recreaciones visuales.
- Formaciones.
- Animaciones de asedio.
- Informes por recinto.

**Objetivo:** permitir conflictos completos y visualizar sus resultados de manera convincente.

## MVP 4 — Sociedad y economía avanzada

- Mercado.
- Mercaderes.
- Rutas comerciales.
- Alianzas.
- Diplomacia.
- Confederaciones.
- Guerras.
- Mensajería.
- Estadísticas.
- Rankings.

**Objetivo:** completar la interacción social y cooperativa.

## MVP 5 — Competición y victoria

- Misiones.
- Eventos.
- Premios semanales.
- Fortalezas especiales.
- Planos monumentales.
- Maravillas.
- Asedios monumentales.
- Finalización automática.
- Resultados históricos.

**Objetivo:** cerrar el ciclo competitivo de los mundos.

## MVP 6 — Optimización y lanzamiento

- Balance económico.
- Balance militar.
- Pruebas de concurrencia.
- Seguridad.
- Optimización gráfica.
- Pruebas de carga.
- Mejoras de experiencia de usuario.
- Accesibilidad.
- Monitoreo.
- Recuperación ante incidentes.

**Objetivo:** operar el juego públicamente con seguridad y estabilidad.

---

# 25. Ejemplo funcional de un asedio completo

Para demostrar cómo deben trabajar juntos los tres sistemas, consideremos el siguiente escenario.

Un jugador romano posee una aldea con:

- Muralla exterior nivel 12.
- Muralla urbana nivel 10.
- Muralla interior nivel 15.
- Campos productivos desarrollados.
- Almacenes y Graneros.
- Castillo.
- Tropas de infantería.
- Arqueros.
- Caballería defensiva.

La doctrina activa es **Defender núcleo**.

Un jugador germano decide atacarla.

## Preparación

El atacante reúne:

- Infantería ofensiva.
- Caballería.
- Arqueros.
- Arietes.
- Catapultas.

Configura un ataque normal y selecciona como objetivo final el Castillo.

El servidor calcula el tiempo de llegada.

## Llegada

Al cumplirse el tiempo:

1. Se consulta el estado de la aldea.
2. Se distribuyen defensores según la doctrina.
3. Se resuelve el combate en el recinto exterior.
4. Los arietes aplican los efectos correspondientes.
5. Se actualizan las bajas.
6. Si el atacante conserva fuerza suficiente, continúa al recinto urbano.
7. Se resuelve la segunda línea.
8. Si consigue superarla, avanza al núcleo.
9. Se enfrenta a la defensa interior.
10. Se determina si las catapultas pueden afectar el Castillo.
11. Se registran los daños.
12. Se genera el informe.

## Resultado hipotético

Supongamos que el ejército:

- Supera la muralla exterior.
- Sufre pérdidas importantes en la zona urbana.
- Llega al núcleo con fuerza reducida.
- No consigue superar a los defensores interiores.

El servidor registra que:

- La muralla exterior sufrió daños.
- Hubo bajas en ambos bandos.
- El recinto urbano resistió parcialmente, pero fue superado.
- El Castillo no fue destruido.
- La aldea continúa en manos del defensor.

## Recreación

El atacante abre el informe.

Selecciona **Ver batalla**.

La reproducción muestra:

- El ejército acercándose.
- La infantería avanzando.
- La caballería montada.
- Los arqueros disparando.
- Los arietes golpeando la muralla exterior.
- El primer enfrentamiento.
- El avance hacia la muralla urbana.
- Las bajas.
- La resistencia de la ciudadela.
- La retirada o destrucción de los supervivientes según el resultado.

El jugador puede observar el desarrollo visual, pero no modificarlo.

Después de cerrar la reproducción, los daños y bajas ya están reflejados en el mundo.

---

# 26. Criterio final de diseño

La experiencia debe combinar tres características:

**Libertad estratégica:** el jugador administra economía, construcción, tropas, defensa, diplomacia y expansión.

**Coherencia espacial:** la aldea se desarrolla dentro de tres recintos, con edificios orgánicamente distribuidos y murallas que tienen sentido funcional.

**Realismo representativo:** los ejércitos, animales, edificios y máquinas de asedio se visualizan de manera creíble, pero el resultado pertenece al motor estratégico.

El objetivo no es transformar Travian en un juego de combate táctico individual.

El objetivo es construir un juego de estrategia persistente con mayor profundidad defensiva, más control urbanístico y una representación visual atractiva.

**La versión 2.1 establece que la ciudad, sus fortificaciones y sus ejércitos forman un sistema integrado: lo que el jugador construye determina qué debe defender, lo que decide defender condiciona las batallas y el resultado militar transforma físicamente su aldea.**

---

**Fin del documento maestro — Versión 2.1**