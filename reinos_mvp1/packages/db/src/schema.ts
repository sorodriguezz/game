import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Esquema MVP 1 (Gate 1). Reglas de integridad (PRD §20.2, ADR-0002):
 * - Toda entidad de juego lleva `world_id`.
 * - Las referencias entre entidades de juego son FK COMPUESTAS (world_id, id):
 *   la BD rechaza enlazar una aldea/tropa/movimiento de otro mundo aunque
 *   el código tenga un bug de filtrado.
 * - Saldos y cantidades con CHECK >= 0.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 3, mode: 'date' });
const big = (name: string) => bigint(name, { mode: 'bigint' });

export const worldStatus = pgEnum('world_status', ['PLANNED', 'OPEN', 'WONDER_ERA', 'FINALIZING', 'ARCHIVED']);
export const worldProfile = pgEnum('world_profile', ['test', 'alpha', 'seasonal']);
export const villageKind = pgEnum('village_kind', ['PLAYER', 'NPC']);
export const orderStatus = pgEnum('order_status', ['IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const movementMission = pgEnum('movement_mission', ['ATTACK', 'RAID']);
export const movementStatus = pgEnum('movement_status', ['IN_TRANSIT', 'RETURNING', 'COMPLETED']);
export const battleOutcome = pgEnum('battle_outcome', ['ATTACKER', 'DEFENDER']);
export const eventStatus = pgEnum('event_status', ['PENDING', 'PROCESSING', 'DONE', 'DEAD']);

// ---------------------------------------------------------------------------
// Identidad (global, fuera de mundos)
// ---------------------------------------------------------------------------
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('accounts_email_uq').on(t.email),
    uniqueIndex('accounts_display_name_lower_uq').on(sql`lower(${t.displayName})`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** SHA-256 del token opaco; el token en claro solo vive en la cookie. */
    tokenHash: text('token_hash').notNull(),
    csrfToken: text('csrf_token').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_token_hash_uq').on(t.tokenHash), index('sessions_account_idx').on(t.accountId)],
);

// ---------------------------------------------------------------------------
// Mundos y membresías
// ---------------------------------------------------------------------------
export const worlds = pgTable(
  'worlds',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: worldStatus('status').notNull().default('PLANNED'),
    profile: worldProfile('profile').notNull(),
    rulesetVersion: text('ruleset_version').notNull(),
    speedMultiplier: integer('speed_multiplier').notNull().default(1),
    mapSeed: integer('map_seed').notNull(),
    mapSize: integer('map_size').notNull(),
    protectionHours: integer('protection_hours').notNull(),
    opensAt: ts('opens_at').notNull(),
    endsAt: ts('ends_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('worlds_slug_uq').on(t.slug),
    check('worlds_speed_ck', sql`${t.speedMultiplier} between 1 and 1000`),
    check('worlds_map_size_ck', sql`${t.mapSize} between 16 and 1024`),
    check('worlds_protection_ck', sql`${t.protectionHours} >= 0`),
  ],
);

export const worldPlayers = pgTable(
  'world_players',
  {
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    civilization: text('civilization').notNull(),
    joinOrdinal: integer('join_ordinal').notNull(),
    joinedAt: ts('joined_at').notNull(),
    protectionUntil: ts('protection_until').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.accountId] }),
    unique('world_players_ordinal_uq').on(t.worldId, t.joinOrdinal),
  ],
);

// ---------------------------------------------------------------------------
// Aldeas
// ---------------------------------------------------------------------------
export const villages = pgTable(
  'villages',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id),
    ownerAccountId: uuid('owner_account_id'),
    kind: villageKind('kind').notNull().default('PLAYER'),
    name: text('name').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    coastal: boolean('coastal').notNull(),
    doctrineReservePercent: integer('doctrine_reserve_percent').notNull().default(0),
    doctrineRetreatThresholdPercent: integer('doctrine_retreat_threshold_percent'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('villages_world_id_uq').on(t.worldId, t.id),
    unique('villages_world_xy_uq').on(t.worldId, t.x, t.y),
    foreignKey({
      name: 'villages_owner_member_fk',
      columns: [t.worldId, t.ownerAccountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    index('villages_owner_idx').on(t.worldId, t.ownerAccountId),
    check('villages_owner_kind_ck', sql`(${t.kind} = 'PLAYER') = (${t.ownerAccountId} is not null)`),
    check('villages_doctrine_reserve_ck', sql`${t.doctrineReservePercent} between 0 and 100`),
    check(
      'villages_doctrine_retreat_ck',
      sql`${t.doctrineRetreatThresholdPercent} is null or ${t.doctrineRetreatThresholdPercent} >= 100`,
    ),
  ],
);

export const villageBuildings = pgTable(
  'village_buildings',
  {
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    plot: integer('plot').notNull(),
    type: text('type').notNull(),
    level: integer('level').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.villageId, t.plot] }),
    unique('village_buildings_type_uq').on(t.villageId, t.type),
    foreignKey({ name: 'village_buildings_village_fk', columns: [t.worldId, t.villageId], foreignColumns: [villages.worldId, villages.id] }),
    check('village_buildings_level_ck', sql`${t.level} >= 1`),
  ],
);

export const resourceAccounts = pgTable(
  'resource_accounts',
  {
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').primaryKey(),
    wood: big('wood_milli').notNull(),
    stone: big('stone_milli').notNull(),
    iron: big('iron_milli').notNull(),
    food: big('food_milli').notNull(),
    woodRem: big('wood_rem').notNull().default(sql`0`),
    stoneRem: big('stone_rem').notNull().default(sql`0`),
    ironRem: big('iron_rem').notNull().default(sql`0`),
    foodRem: big('food_rem').notNull().default(sql`0`),
    woodRate: big('wood_rate_milli_h').notNull(),
    stoneRate: big('stone_rate_milli_h').notNull(),
    ironRate: big('iron_rate_milli_h').notNull(),
    foodRate: big('food_rate_milli_h').notNull(),
    capacity: big('capacity_milli').notNull(),
    lastSettledAt: ts('last_settled_at').notNull(),
    version: integer('version').notNull().default(0),
  },
  (t) => [
    foreignKey({ name: 'resource_accounts_village_fk', columns: [t.worldId, t.villageId], foreignColumns: [villages.worldId, villages.id] }),
    check('resource_accounts_nonneg_ck', sql`${t.wood} >= 0 and ${t.stone} >= 0 and ${t.iron} >= 0 and ${t.food} >= 0`),
    check(
      'resource_accounts_rem_ck',
      sql`${t.woodRem} between 0 and 3599999 and ${t.stoneRem} between 0 and 3599999 and ${t.ironRem} between 0 and 3599999 and ${t.foodRem} between 0 and 3599999`,
    ),
    check('resource_accounts_capacity_ck', sql`${t.capacity} > 0`),
  ],
);

/** Bitácora de débitos/créditos (no de producción continua). Valores en milésimas. */
export const resourceLedger = pgTable(
  'resource_ledger',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    reason: text('reason').notNull(),
    refId: uuid('ref_id').notNull(),
    wood: big('wood_milli').notNull(),
    stone: big('stone_milli').notNull(),
    iron: big('iron_milli').notNull(),
    food: big('food_milli').notNull(),
    occurredAt: ts('occurred_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: 'resource_ledger_village_fk', columns: [t.worldId, t.villageId], foreignColumns: [villages.worldId, villages.id] }),
    index('resource_ledger_village_idx').on(t.worldId, t.villageId, t.occurredAt),
    unique('resource_ledger_ref_uq').on(t.villageId, t.reason, t.refId),
  ],
);

// ---------------------------------------------------------------------------
// Colas de construcción y reclutamiento
// ---------------------------------------------------------------------------
export const constructionOrders = pgTable(
  'construction_orders',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    plot: integer('plot').notNull(),
    buildingType: text('building_type').notNull(),
    targetLevel: integer('target_level').notNull(),
    costWood: integer('cost_wood').notNull(),
    costStone: integer('cost_stone').notNull(),
    costIron: integer('cost_iron').notNull(),
    costFood: integer('cost_food').notNull(),
    status: orderStatus('status').notNull().default('IN_PROGRESS'),
    startedAt: ts('started_at').notNull(),
    completesAt: ts('completes_at').notNull(),
    completedAt: ts('completed_at'),
  },
  (t) => [
    foreignKey({ name: 'construction_orders_village_fk', columns: [t.worldId, t.villageId], foreignColumns: [villages.worldId, villages.id] }),
    // FR-CITY-04: una construcción activa por aldea, garantizado por la BD.
    uniqueIndex('construction_orders_one_active_uq').on(t.villageId).where(sql`${t.status} = 'IN_PROGRESS'`),
    check('construction_orders_time_ck', sql`${t.completesAt} > ${t.startedAt}`),
  ],
);

export const recruitmentOrders = pgTable(
  'recruitment_orders',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    trainedAt: text('trained_at').notNull(),
    unitType: text('unit_type').notNull(),
    quantity: integer('quantity').notNull(),
    costWood: integer('cost_wood').notNull(),
    costStone: integer('cost_stone').notNull(),
    costIron: integer('cost_iron').notNull(),
    costFood: integer('cost_food').notNull(),
    status: orderStatus('status').notNull().default('IN_PROGRESS'),
    startedAt: ts('started_at').notNull(),
    completesAt: ts('completes_at').notNull(),
    completedAt: ts('completed_at'),
  },
  (t) => [
    foreignKey({ name: 'recruitment_orders_village_fk', columns: [t.worldId, t.villageId], foreignColumns: [villages.worldId, villages.id] }),
    index('recruitment_orders_queue_idx').on(t.villageId, t.trainedAt, t.status, t.completesAt),
    check('recruitment_orders_qty_ck', sql`${t.quantity} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Tropas y movimientos
// ---------------------------------------------------------------------------
export const troopStacks = pgTable(
  'troop_stacks',
  {
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    unitType: text('unit_type').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.villageId, t.unitType] }),
    foreignKey({ name: 'troop_stacks_village_fk', columns: [t.worldId, t.villageId], foreignColumns: [villages.worldId, villages.id] }),
    check('troop_stacks_qty_ck', sql`${t.quantity} >= 0`),
  ],
);

export const woundedStacks = pgTable(
  'wounded_stacks',
  {
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    unitType: text('unit_type').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.villageId, t.unitType] }),
    foreignKey({ name: 'wounded_stacks_village_fk', columns: [t.worldId, t.villageId], foreignColumns: [villages.worldId, villages.id] }),
    check('wounded_stacks_qty_ck', sql`${t.quantity} >= 0`),
  ],
);

export const armyMovements = pgTable(
  'army_movements',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    ownerAccountId: uuid('owner_account_id').notNull(),
    originVillageId: uuid('origin_village_id').notNull(),
    targetVillageId: uuid('target_village_id').notNull(),
    mission: movementMission('mission').notNull(),
    status: movementStatus('status').notNull(),
    /** Unidades comprometidas: { unitType: cantidad }. Tras la batalla, supervivientes. */
    units: jsonb('units').$type<Record<string, number>>().notNull(),
    /** Botín transportado en unidades enteras. */
    loot: jsonb('loot').$type<Record<string, number>>(),
    departedAt: ts('departed_at').notNull(),
    arrivesAt: ts('arrives_at').notNull(),
    returnsAt: ts('returns_at'),
    battleId: uuid('battle_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('army_movements_world_id_uq').on(t.worldId, t.id),
    foreignKey({ name: 'army_movements_origin_fk', columns: [t.worldId, t.originVillageId], foreignColumns: [villages.worldId, villages.id] }),
    foreignKey({ name: 'army_movements_target_fk', columns: [t.worldId, t.targetVillageId], foreignColumns: [villages.worldId, villages.id] }),
    foreignKey({
      name: 'army_movements_owner_fk',
      columns: [t.worldId, t.ownerAccountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    check('army_movements_distinct_ck', sql`${t.originVillageId} <> ${t.targetVillageId}`),
    check('army_movements_time_ck', sql`${t.arrivesAt} > ${t.departedAt}`),
    index('army_movements_target_idx').on(t.worldId, t.targetVillageId, t.arrivesAt),
    index('army_movements_origin_idx').on(t.originVillageId, t.status),
  ],
);

export const battles = pgTable(
  'battles',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    movementId: uuid('movement_id').notNull(),
    attackerAccountId: uuid('attacker_account_id').notNull(),
    defenderAccountId: uuid('defender_account_id'),
    attackerVillageId: uuid('attacker_village_id').notNull(),
    defenderVillageId: uuid('defender_village_id').notNull(),
    mission: movementMission('mission').notNull(),
    outcome: battleOutcome('outcome').notNull(),
    occurredAt: ts('occurred_at').notNull(),
    seed: text('seed').notNull(),
    rulesetVersion: text('ruleset_version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    result: jsonb('result').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    // Un movimiento produce como máximo una batalla (idempotencia, FR-BAT-05).
    uniqueIndex('battles_movement_uq').on(t.movementId),
    foreignKey({ name: 'battles_movement_fk', columns: [t.worldId, t.movementId], foreignColumns: [armyMovements.worldId, armyMovements.id] }),
    foreignKey({ name: 'battles_attacker_village_fk', columns: [t.worldId, t.attackerVillageId], foreignColumns: [villages.worldId, villages.id] }),
    foreignKey({ name: 'battles_defender_village_fk', columns: [t.worldId, t.defenderVillageId], foreignColumns: [villages.worldId, villages.id] }),
    index('battles_attacker_idx').on(t.worldId, t.attackerAccountId, t.occurredAt),
    index('battles_defender_idx').on(t.worldId, t.defenderAccountId, t.occurredAt),
  ],
);

// ---------------------------------------------------------------------------
// Operación: cola durable, idempotencia y outbox (ADR-0003, ADR-006)
// ---------------------------------------------------------------------------
export const scheduledEvents = pgTable(
  'scheduled_events',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id),
    type: text('type').notNull(),
    /** Aldea que se bloquea para aplicar el evento. */
    villageId: uuid('village_id').notNull(),
    /** Segunda aldea afectada (p. ej. origen del atacante); se bloquea en orden estable. */
    secondaryVillageId: uuid('secondary_village_id'),
    dueAt: ts('due_at').notNull(),
    /** Desempate a igual `due_at` (FR-BAT-06): menor primero, luego `id`. */
    priority: smallint('priority').notNull(),
    status: eventStatus('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: ts('available_at').notNull(),
    leaseOwner: text('lease_owner'),
    leaseUntil: ts('lease_until'),
    dedupeKey: text('dedupe_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    lastError: text('last_error'),
    createdAt: ts('created_at').notNull().defaultNow(),
    processedAt: ts('processed_at'),
  },
  (t) => [
    uniqueIndex('scheduled_events_dedupe_uq').on(t.worldId, t.dedupeKey),
    foreignKey({ name: 'scheduled_events_village_fk', columns: [t.worldId, t.villageId], foreignColumns: [villages.worldId, villages.id] }),
    foreignKey({
      name: 'scheduled_events_secondary_village_fk',
      columns: [t.worldId, t.secondaryVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    index('scheduled_events_claim_idx').on(t.status, t.availableAt).where(sql`${t.status} in ('PENDING','PROCESSING')`),
    index('scheduled_events_village_idx').on(t.villageId, t.dueAt).where(sql`${t.status} in ('PENDING','PROCESSING')`),
    index('scheduled_events_secondary_idx')
      .on(t.secondaryVillageId, t.dueAt)
      .where(sql`${t.status} in ('PENDING','PROCESSING')`),
  ],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id),
    command: text('command').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.worldId, t.command, t.key] })],
);

export const outbox = pgTable(
  'outbox',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    publishedAt: ts('published_at'),
  },
  (t) => [index('outbox_unpublished_idx').on(t.id).where(sql`${t.publishedAt} is null`)],
);
