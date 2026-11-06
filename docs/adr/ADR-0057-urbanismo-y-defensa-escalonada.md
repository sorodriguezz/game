# ADR-0057 — Plano persistente y combate AUTO por recintos

Fecha: 2026-11-05. Estado: aceptada para implementación por el encargo de las especificaciones 2.0/2.1.

Los documentos del propietario se conservan en `docs/requirements/`. La versión 2.1 precisa la 2.0. Amplía ADR-0005/0009/0056, sin habilitar RTS persistente ni infraestructura adicional. `TRAINING` sigue separado (FR2-001, ADR-0021/0037, M2-G0-02 y M2-G1-12).

Se introduce `frontier-alpha.2`: Romanos, Galos y Germanos con los identificadores internos existentes de los tres pueblos terrestres. Los mundos anteriores mantienen su catálogo, distribución y motor. El balance nuevo es una propuesta versionada, nunca una actualización de un mundo abierto.

También se añade doble cola de campos/edificios para Romanos, velocidad militar independiente en `worlds.movement_speed_multiplier`, identidad por mundo y elección de cuadrante. La búsqueda de aparición está acotada; se habilitan dimensiones hasta 5000 sin materializar casillas ni escanear el mapa completo al registrar. El sandbox de QA permanece en 64×64; el poblado de NPC de mapas grandes requiere una historia regional adicional.

Archivos/contratos previstos: `game-config` (reglas), `game-rules` (VillageLayout, BattlePhaseResult y reparación), `contracts` (vista de plano, murallas y doctrina), migración aditiva en `db`, comandos/worker/consultas en `core`, endpoints API y gestión web. El plano se crea en la transacción de fundación y queda persistido con semilla, versión y civilización original; una conquista no lo reorganiza.

La resolución 3 → 2 → 1 pertenece a un único evento y registro canónico `battles`. Las guarniciones se reparten sin duplicarlas; cada muralla aplica únicamente a su recinto. RAID termina en 2. Botín exige vencer 2; conquista exige vencer 1 y administradores supervivientes. Arietes dañan la muralla alcanzada; catapultas solo afectan un solar de un recinto vencido. Los daños se aplican junto con las bajas, economía e informe. Una reparación suma la cantidad contratada al estado actual, con tope, por lo que no borra daños posteriores a su inicio.

Pruebas antes de implementar: geometría y accesos para múltiples semillas, estabilidad tras recarga, determinismo/conservación de tropas, detención y objetivos interiores inaccesibles, RAID, integridad, ataques/reparaciones concurrentes, idempotencia, mundo/propietario incorrecto y regresión M1/TRAINING. Verificación visual y métricas reales para el cliente; no se aprueba arte automáticamente.

Rollback: impedir nuevas altas al mundo sandbox `frontier-alpha.2`, volver al cliente/API anterior y conservar datos. No cambiar `ruleset_version` de mundos vivos. La migración inversa es exclusivamente para una copia aislada vacía de partidas nuevas; no borrar historiales ni mundos del usuario.
