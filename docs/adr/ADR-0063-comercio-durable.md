# ADR-0063 — Mercado, mercaderes y rutas durables

Fecha: 2026-11-06. Documento maestro 2.0 §18; FR-004/006 y ADR-0002/0003/0004. Se habilita en las reglas nuevas `frontier-alpha.4`, sin modificar automáticamente mundos anteriores.

PostgreSQL conserva ofertas, viajes y rutas. Los recursos enviados se descuentan al salir y se acreditan al llegar; el mismo ledger de recursos registra gastos, custodia de ofertas, intercambios, devoluciones y entregas. Un mercader permanece ocupado hasta el retorno. Bloquear el mundo y las aldeas implicadas serializa el gasto, la aceptación del último lote y el uso de mercaderes. Reintento de comando y evento no duplica recursos.

Las ofertas mantienen sus recursos en custodia, fuera del saldo utilizable. Aceptar compromete los mercaderes de ambas partes y crea dos viajes. Cancelar devuelve solamente lotes disponibles, una vez. Los recursos que excedan la capacidad del destino se pierden y se informan como excedente. Si el destinatario cambia de dueño durante el viaje, el cargamento regresa; si el origen ya no pertenece al remitente, se devuelve a su primera aldea disponible. Si el remitente no conserva aldeas, se registra la pérdida. No se usa el saldo de otra cuenta.

Las rutas recurrentes registran carga, destino y próxima salida. Son gratuitas como función del juego, exigen Oficina de Comercio 1 y una frecuencia mínima de una hora. Si faltan saldo o mercaderes se omite esa salida y se programa la siguiente; si cambia la propiedad de un extremo se desactiva. Cada salida tiene una clave única derivada de ruta/fecha. La pausa desplaza relojes de viajes, ofertas y rutas activas.

Propuesta de balance parametrizada: un mercader por nivel de Mercado, capacidad base romana 500, gala 750, germana 1000; velocidades 16/24/12 casillas/hora, respectivamente. Oficina de Comercio aumenta capacidad un 10% por nivel. La velocidad militar del mundo se aplica a viajes comerciales. Son valores revisables antes de publicar una temporada competitiva.

Archivos previstos: contratos/DTO, cotización pura y pruebas primero; tablas/migración con FK compuestas; servicio core, eventos de llegada/retorno/salida, controlador API y funciones del edificio Mercado. Verificar concurrencia, reintento, saldo no negativo, aislamiento y cambio de dueño durante viaje. Rollback: cerrar nuevas ofertas/rutas y drenar viajes; la migración inversa rechaza borrar cargas, ofertas o historial existentes.
