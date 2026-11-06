# ADR-0058 — Tres perfiles y entrada por función

Encargo explícito del propietario, 2026-11-05. Implementación de FR-001/002/022, ADR-0017 y documento maestro §§3–4. Solo existen ADMIN, MODERATOR y PLAYER. Hay un único acceso por usuario/correo y contraseña: la sesión toma el rol de PostgreSQL y abre automáticamente la vista correspondiente. No existe selector de perfil. Registro público solo PLAYER, moderadores creados por ADMIN y asignación por mundo sin participación competitiva simultánea. No se promueve ninguna cuenta por nombre o por ser la primera registrada.

Cambios previstos: contratos de cuenta/gestión, migración aditiva de roles/asignaciones/auditoría, servicio de administración y rutas API, entrada única y paneles de administración/moderación, lobby de jugador con activos/próximos y entrada directa cuando ya participa en un único mundo activo. Pruebas: escalada de privilegios, sesiones vigentes, autorización mundial, registro en mundo próximo, asignación concurrente y e2e de los tres perfiles. La administración crea mundos; las opciones del jugador dependen del estado publicado.

Rollback: cliente anterior y conservación de tablas/roles; retirar endpoints administrativos. No eliminar usuarios, mundos ni historial. Bootstrap de ADMIN mediante operador local explícito, sin credenciales embebidas ni autoasignación pública.
