-- PLANTILLA / REFERENCIA, no ejecutar a ciegas en producción.
-- Alinear tipos/identificadores reales de MVP1: worlds, army_movements,
-- troop_stacks, season_id y battle_results. Usar la migración Drizzle revisada.
-- Solo nuevas tablas; no redefine battle_results ni battle_snapshots de MVP1.
BEGIN;

CREATE TABLE IF NOT EXISTS battle_encounters (
  id UUID PRIMARY KEY,
  world_id UUID NOT NULL REFERENCES worlds(id),
  -- Si MVP1 es 1 mundo = 1 temporada, mapear season_id con regla explícita.
  season_id UUID,
  movement_id UUID NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('AUTO','WORLD_PVP')),
  state TEXT NOT NULL CHECK (state IN (
    'SNAPSHOTTED','OFFERED','AUTO_PENDING','TACTICAL_RESERVED',
    'ROOM_ALLOCATING','LIVE','FALLBACK_PENDING','RESULT_PENDING','APPLIED','CLOSED'
  )),
  ruleset_version TEXT NOT NULL,
  content_version TEXT NOT NULL,
  seed TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  snapshot_json JSONB NOT NULL,
  offer_expires_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (world_id, movement_id),
  UNIQUE (id, world_id)
);

CREATE TABLE IF NOT EXISTS battle_participants (
  encounter_id UUID NOT NULL REFERENCES battle_encounters(id),
  world_id UUID NOT NULL,
  player_id UUID NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('ATTACKER','DEFENDER')),
  accepted_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  PRIMARY KEY (encounter_id, side),
  FOREIGN KEY (encounter_id, world_id)
    REFERENCES battle_encounters(id, world_id)
);
CREATE INDEX IF NOT EXISTS idx_bp_player ON battle_participants(world_id,player_id);

CREATE TABLE IF NOT EXISTS battle_reservations (
  encounter_id UUID NOT NULL,
  world_id UUID NOT NULL,
  stack_id UUID NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  status TEXT NOT NULL CHECK (status IN ('HELD','COMMITTED','RELEASED')),
  PRIMARY KEY (encounter_id, stack_id),
  FOREIGN KEY (encounter_id, world_id)
    REFERENCES battle_encounters(id, world_id)
);
-- NOTA: agregar FK a troop_stacks y constraint de world_id cuando el modelo
-- real MVP1 haya sido inspeccionado. Reservas se protegen en transacciones.

CREATE TABLE IF NOT EXISTS battle_rooms (
  encounter_id UUID PRIMARY KEY REFERENCES battle_encounters(id),
  room_id TEXT UNIQUE,
  server_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('ALLOCATING','LIVE','CLOSED','FAILED')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tactical_results (
  encounter_id UUID PRIMARY KEY REFERENCES battle_encounters(id),
  result_hash TEXT NOT NULL,
  result_json JSONB NOT NULL,
  commit_status TEXT NOT NULL CHECK (commit_status IN ('PENDING','APPLIED','REJECTED')),
  committed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS battle_replays (
  encounter_id UUID PRIMARY KEY REFERENCES battle_encounters(id),
  schema_version INTEGER NOT NULL,
  asset_uri TEXT,
  checksum TEXT,
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  visibility TEXT NOT NULL DEFAULT 'PARTICIPANTS',
  retention_expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS battle_incidents (
  id UUID PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES battle_encounters(id),
  kind TEXT NOT NULL,
  policy_applied TEXT NOT NULL,
  correlation_id UUID,
  details_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_be_state_expire
  ON battle_encounters(state, offer_expires_at);
CREATE INDEX IF NOT EXISTS idx_be_world_state
  ON battle_encounters(world_id, state);
CREATE INDEX IF NOT EXISTS idx_br_heartbeat
  ON battle_rooms(status, last_heartbeat_at);

COMMIT;
