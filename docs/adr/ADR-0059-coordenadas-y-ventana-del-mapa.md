# ADR-0059 — Coordenadas cartesianas y ventana de mapa constante

Encargo del propietario 2026-11-05: 0|0 en el centro; NE (+,+), NO (-,+), SE (+,-), SO (-,-). La ventana conserva al menos 2r+1 casillas por lado según zoom, desplazándose al borde en vez de recortarse. El atlas Canvas ocupa el espacio disponible y permite arrastre local fraccionario con inercia. Se descarga todo el terreno una vez; las actualizaciones de aldeas y marchas se consultan por separado.

Se conservan los índices internos 0..size-1 del generador y de la persistencia para no mover terreno, aldeas, distancias ni resultados históricos de mundos existentes. La frontera HTTP traduce índices a coordenadas cartesianas y viceversa, de forma biyectiva; origen público de una región = esquina NO, filas hacia Y decreciente. Ciudad 3D y TRAINING usan sus coordenadas locales y no se convierten.

Archivos previstos: funciones puras de marco/ventana, adaptador de vistas/solicitudes HTTP, mapa web y pruebas de esquinas, ida/vuelta y cuadrantes. Rollback: retirar adaptador junto con cliente anterior. No requiere migración de posiciones ni cambia balance.
