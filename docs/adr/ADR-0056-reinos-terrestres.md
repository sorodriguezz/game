# ADR-0056 — Mundo terrestre con expansión y ejércitos redistribuibles

Fecha: 2026-11-05. Estado: aceptada para implementación por encargo del propietario.

El encargo actual cambia la dirección de la experiencia: mapa fijo totalmente terrestre,
aldeas con tres murallas, campos individuales, tres razas nuevas, conquista y fundación,
traslados entre aldeas propias, refuerzo exclusivamente aliado y encuentros en campo.

Se añade el ruleset `frontier-alpha.1` y el mundo Reinos Terrestres ×50. Para este ruleset,
la navegación naval de ADR-0010 y el plan MVP3 no aplican. No se migra en caliente el
balance de mundos anteriores. El entrenamiento de MVP2 sigue separado del mundo.

Se amplían los contratos y tablas existentes con migración aditiva. PostgreSQL, ledger,
battles y worker siguen siendo canónicos. Los encuentros se programan al detectar
coincidencia simultánea de trayectorias y se aplican una vez, con bloqueo de todas las
aldeas afectadas. Los movimientos se filtran por propietario y destino antes de responder.
Los refuerzos mantienen su propietario y no entran en las pilas desplegables del receptor.

Ventajas: experiencia territorial coherente, aislamiento de reglas anteriores y ninguna
infraestructura adicional. Riesgos: balance todavía propuesto; el número de marchas a
comparar crece con la actividad. Medir antes de escalar o añadir índices espaciales.

Detalle, alternativas de producto, pruebas y rollback:
[`../territory/DESIGN.md`](../territory/DESIGN.md). El alcance no autoriza copiar arte,
textos o tablas de otro juego ni declarar arte aprobado automáticamente.
