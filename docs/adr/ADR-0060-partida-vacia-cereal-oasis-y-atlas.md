# ADR-0060 — Partida inicial, cereal, oasis y navegación completa

Fecha: 2026-11-05. Alcance: documento maestro 2.0 §§5–10, 13–15, 2.1 URB/FORT y correcciones explícitas del propietario. Complementa ADR-0004/0009/0011/0057–0059. TRAINING sigue separado y no aparece en el acceso del jugador.

## Reglas y datos

`frontier-alpha.3` identifica las partidas nuevas. Solo comienza Centro Urbano 1; los 18 campos empiezan en nivel 0. Se conservan 750 unidades de cada recurso como reserva inicial para poder construir. Los campos 0 producen una base pequeña, sin representar un edificio ya construido. Las aldeas iniciales son 4–4–4–6 y las fundadas usan una distribución determinista de 18 campos; se incluyen 9 y 15 cerealeras. 3–4–5–7 no se usa porque suma 19.

Cada nivel añade habitantes y consumo de cereal; las tropas consumen por unidad. La producción escala con la velocidad económica y el mantenimiento es horario. Granero independiente para cereal y suma de almacenes/graneros repetidos. No se usa el límite militar artificial del Centro Urbano en esta versión. Las tablas numéricas del catálogo, costes y población son propuestas versionadas de balance; no se declara equivalencia numérica completa con Travian. Referencias funcionales primarias: [recursos](https://support.travian.com/en/articles/214-guide-resources-explained), [cereal y población](https://support.travian.com/en/articles/75-problems-with-crop), [hambre](https://support.travian.com/en/articles/83-starvation-mechanics). Las instrucciones del propietario prevalecen sobre variantes del juego de referencia y excluyen héroes.

Tesoro 10/15/20 permite 1/2/3 oasis por aldea en un 5×5 centrado en ella (distancia de Chebyshev ≤2). Los ataques normales, sin héroe ni cacique, reducen lealtad únicamente si eliminan toda la defensa y la aldea cumple rango/Tesoro/cupo. Propuesta parametrizada: −25 por ataque. Al conquistar, lealtad vuelve a 100 y el vínculo pertenece a esa aldea. Bonus sembrado: 25% de una o dos materias; 50% solo para cereal en un oasis de una materia. Las aldeas libres necesitan administradores supervivientes y defensa eliminada antes de reducir lealtad.

Regeneración propuesta: oasis cada 30 minutos, aldeas libres cada hora, hasta su plantilla sembrada, recuperando como máximo un cuarto por ciclo. Se procesa mediante eventos PostgreSQL idempotentes. Las regiones 16×16 se materializan bajo bloqueo de mundo; una reserva de fundación tiene prioridad sobre la generación posterior. Bosques, montañas y oasis no admiten nuevas aldeas. No se reemplaza el ledger ni la tabla canónica de combate.

## Presentación y atlas

El registro es un modal de tres pasos: pueblo, mapa completo/cuadrante e identidad. El mapa de campaña es una cuadrícula cuadrada con X este y Y norte, origen 0|0 central. El terreno completo se transfiere una sola vez, un byte por casilla y gzip: máximo 25 millones de bytes descomprimidos para 5000×5000. Generación cooperativa por lotes de filas, caché en memoria del proceso con límite de ocho entradas y autorización antes de servirlo. No se introduce infraestructura adicional.

El cliente conserva ese atlas al cambiar de sección y dibuja solo el área visible en canvas. Arrastrar modifica la cámara local, con movimiento fraccionario e inercia; no solicita regiones al desplazarse. Las posiciones públicas y las marchas autorizadas se actualizan aparte. Los NPC sin materializar se representan mediante las mismas reglas deterministas y se consultan/materializan al seleccionar una casilla, antes de permitir órdenes. La información de tropas de terceros sigue filtrada en servidor. El mantenimiento de terreno completo en memoria no equivale a precargar millones de entidades DOM o filas PostgreSQL.

Recursos/habitantes en cabecera fija, tropas/ataques/regresos visibles sin menú Ejército, y obras animadas desde la cola autoritativa. Cada marcador de nivel abre un diálogo compatible con el solar/recinto. La aldea utiliza `organic-2`: calles primero y solares sin solapamiento, orientados hacia sus accesos. Murallas 0 no dibujan una empalizada; piedra para Romanos, madera para Galos y arcilla para Germanos. Los nuevos GLB propios conservan estado PENDING_REVIEW hasta revisión humana.

## Archivos, aceptación y rollback

Contratos, reglas puras, servicios core/API, migraciones aditivas 0007–0009, vistas web y pruebas de permisos, pausa, coordenadas, cereal, depósitos, generación concurrente, conquista de oasis y navegadores. El atlas se verifica también con 1000/2000/5000 y muestras descomprimidas. No se declaran aprobados gates de arte, balance, carga o lanzamiento.

Rollback: volver al cliente anterior junto con su API, conservar roles/planos/historial y cerrar altas nuevas. No convertir aldeas existentes ni borrar progreso para aplicar la regla inicial. El reinicio local solicitado del 2026-11-05 eliminó solo los cuatro mundos antiguos tras exportar y verificar las 30 tablas en `.local/backups/before-world-reset-1793919413739.json`; usuarios y sesiones se conservaron. Se creó un único mundo mediante el servicio administrativo y auditoría. Los seeds ya no reintroducen esos mundos. Ese respaldo contiene datos privados, está ignorado por Git y no se publica como evidencia.
