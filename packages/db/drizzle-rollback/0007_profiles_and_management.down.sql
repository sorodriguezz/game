-- Solo copia aislada: no elimina cuentas privilegiadas ni auditoría real.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM accounts WHERE role<>'PLAYER') OR EXISTS(SELECT 1 FROM admin_audit)
 OR EXISTS(SELECT 1 FROM world_moderators) OR EXISTS(SELECT 1 FROM world_complaints)
 OR EXISTS(SELECT 1 FROM world_announcements) OR EXISTS(SELECT 1 FROM world_sanctions)
 OR EXISTS(SELECT 1 FROM worlds WHERE status::text IN ('DRAFT','PAUSED','FINISHED','CANCELLED') OR description<>'' OR paused_at IS NOT NULL OR resume_status IS NOT NULL)
 THEN RAISE EXCEPTION 'Existen roles, gestión o estados nuevos; conservar esquema'; END IF;
END $$;
DROP TABLE world_sanctions,world_complaints,world_announcements,world_moderators,admin_audit;
ALTER TABLE accounts DROP COLUMN role;
DROP TYPE account_role;
ALTER TABLE worlds DROP COLUMN description,DROP COLUMN paused_at,DROP COLUMN resume_status;
ALTER TABLE worlds ALTER COLUMN status DROP DEFAULT;
ALTER TYPE world_status RENAME TO world_status_extended;
CREATE TYPE world_status AS ENUM('PLANNED','OPEN','WONDER_ERA','FINALIZING','ARCHIVED');
ALTER TABLE worlds ALTER COLUMN status TYPE world_status USING status::text::world_status;
ALTER TABLE worlds ALTER COLUMN status SET DEFAULT 'PLANNED';
DROP TYPE world_status_extended;
COMMIT;
