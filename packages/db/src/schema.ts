import { sql } from 'drizzle-orm';
import type { VillageLayout, ResourceBundle } from '@reinos/game-config';
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

export const worldStatus = pgEnum('world_status', [
  'DRAFT',
  'PAUSED',
  'FINISHED',
  'CANCELLED',
  'PLANNED',
  'OPEN',
  'WONDER_ERA',
  'FINALIZING',
  'ARCHIVED',
]);
export const worldProfile = pgEnum('world_profile', ['test', 'alpha', 'seasonal']);
export const villageKind = pgEnum('village_kind', ['PLAYER', 'NPC', 'OASIS']);
export const orderStatus = pgEnum('order_status', ['IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const movementMission = pgEnum('movement_mission', [
  'ATTACK',
  'RAID',
  'TRANSFER',
  'REINFORCE',
  'CONQUER',
]);
export const movementStatus = pgEnum('movement_status', ['IN_TRANSIT', 'RETURNING', 'COMPLETED']);
export const battleOutcome = pgEnum('battle_outcome', ['ATTACKER', 'DEFENDER']);
export const eventStatus = pgEnum('event_status', ['PENDING', 'PROCESSING', 'DONE', 'DEAD']);
export const accountRole = pgEnum('account_role', ['ADMIN', 'MODERATOR', 'PLAYER']);

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
    role: accountRole('role').notNull().default('PLAYER'),
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
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_account_idx').on(t.accountId),
  ],
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
    description: text('description').notNull().default(''),
    status: worldStatus('status').notNull().default('PLANNED'),
    profile: worldProfile('profile').notNull(),
    rulesetVersion: text('ruleset_version').notNull(),
    speedMultiplier: integer('speed_multiplier').notNull().default(1),
    movementSpeedMultiplier: integer('movement_speed_multiplier').notNull().default(1),
    mapSeed: integer('map_seed').notNull(),
    mapSize: integer('map_size').notNull(),
    protectionHours: integer('protection_hours').notNull(),
    opensAt: ts('opens_at').notNull(),
    endsAt: ts('ends_at'),
    pausedAt: ts('paused_at'),
    resumeStatus: text('resume_status'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('worlds_slug_uq').on(t.slug),
    check('worlds_speed_ck', sql`${t.speedMultiplier} between 1 and 1000`),
    check('worlds_movement_speed_ck', sql`${t.movementSpeedMultiplier} between 1 and 1000`),
    check('worlds_map_size_ck', sql`${t.mapSize} between 16 and 5000`),
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
    characterName: text('character_name'),
    quadrant: text('quadrant'),
    joinOrdinal: integer('join_ordinal').notNull(),
    joinedAt: ts('joined_at').notNull(),
    protectionUntil: ts('protection_until').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.accountId] }),
    unique('world_players_ordinal_uq').on(t.worldId, t.joinOrdinal),
    uniqueIndex('world_players_character_uq')
      .on(t.worldId, sql`lower(${t.characterName})`)
      .where(sql`${t.characterName} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Aldeas
// ---------------------------------------------------------------------------
export const worldModerators = pgTable(
  'world_moderators',
  {
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => accounts.id),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.accountId] })],
);
export const adminAudit = pgTable(
  'admin_audit',
  {
    id: uuid('id').primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => accounts.id),
    worldId: uuid('world_id').references(() => worlds.id),
    action: text('action').notNull(),
    requestKey: text('request_key').notNull(),
    requestHash: text('request_hash').notNull(),
    details: jsonb('details').notNull(),
    response: jsonb('response').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [uniqueIndex('admin_audit_request_uq').on(t.actorId, t.requestKey)],
);
export const worldComplaints = pgTable(
  'world_complaints',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id),
    reporterId: uuid('reporter_id').notNull(),
    targetAccountId: uuid('target_account_id'),
    category: text('category').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('OPEN'),
    note: text('note'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.worldId, t.reporterId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    foreignKey({
      columns: [t.worldId, t.targetAccountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    unique('world_complaints_scope_uq').on(t.worldId, t.id),
  ],
);
export const worldAnnouncements = pgTable('world_announcements', {
  id: uuid('id').primaryKey(),
  worldId: uuid('world_id')
    .notNull()
    .references(() => worlds.id),
  authorId: uuid('author_id')
    .notNull()
    .references(() => accounts.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: ts('created_at').notNull(),
});
export const worldSanctions = pgTable(
  'world_sanctions',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id),
    accountId: uuid('account_id').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => accounts.id),
    kind: text('kind').notNull(),
    reason: text('reason').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.worldId, t.accountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
  ],
);

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
    isCapital: boolean('is_capital').notNull().default(false),
    loyalty: integer('loyalty').notNull().default(100),
    parentVillageId: uuid('parent_village_id'),
    trapsUsed: integer('traps_used').notNull().default(0),
    doctrineReservePercent: integer('doctrine_reserve_percent').notNull().default(0),
    doctrineDeployment: text('doctrine_deployment').notNull().default('BALANCED'),
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
    foreignKey({
      name: 'villages_parent_fk',
      columns: [t.worldId, t.parentVillageId],
      foreignColumns: [t.worldId, t.id],
    }),
    check('villages_loyalty_check', sql`${t.loyalty} between 0 and 100`),
    check('villages_traps_used_check', sql`${t.trapsUsed}>=0`),
    index('villages_owner_idx').on(t.worldId, t.ownerAccountId),
    check(
      'villages_owner_kind_ck',
      sql`(${t.kind} <> 'PLAYER' or ${t.ownerAccountId} is not null) and (${t.kind} <> 'NPC' or ${t.ownerAccountId} is null)`,
    ),
    check('villages_doctrine_reserve_ck', sql`${t.doctrineReservePercent} between 0 and 100`),
    check('villages_deployment_ck', sql`${t.doctrineDeployment} in ('BALANCED','OUTER','CORE')`),
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
    index('village_buildings_type_idx').on(t.villageId, t.type),
    foreignKey({
      name: 'village_buildings_village_fk',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    check('village_buildings_level_ck', sql`${t.level} >= 1`),
  ],
);

export const villageLayouts = pgTable(
  'village_layouts',
  {
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').primaryKey(),
    version: text('version').notNull(),
    seed: text('seed').notNull(),
    layout: jsonb('layout').$type<VillageLayout>().notNull(),
  },
  (t) => [
    foreignKey({
      name: 'village_layouts_village_fk',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
  ],
);

export const worldRegions = pgTable(
  'world_regions',
  {
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    version: text('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.x, t.y] })],
);

export const wallSections = pgTable(
  'wall_sections',
  {
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    precinct: integer('precinct').notNull(),
    integrity: integer('integrity').notNull().default(1000),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.villageId, t.precinct] }),
    foreignKey({
      name: 'wall_sections_village_fk',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    check('wall_sections_precinct_ck', sql`${t.precinct} between 1 and 3`),
    check('wall_sections_integrity_ck', sql`${t.integrity} between 0 and 1000`),
  ],
);

export const wallRepairOrders = pgTable(
  'wall_repair_orders',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    precinct: integer('precinct').notNull(),
    restoreIntegrity: integer('restore_integrity').notNull(),
    status: orderStatus('status').notNull().default('IN_PROGRESS'),
    startedAt: ts('started_at').notNull(),
    completesAt: ts('completes_at').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'wall_repair_orders_section_fk',
      columns: [t.worldId, t.villageId, t.precinct],
      foreignColumns: [wallSections.worldId, wallSections.villageId, wallSections.precinct],
    }),
    uniqueIndex('wall_repair_orders_one_active_uq')
      .on(t.worldId, t.villageId, t.precinct)
      .where(sql`${t.status}='IN_PROGRESS'`),
    check('wall_repair_orders_amount_ck', sql`${t.restoreIntegrity} between 1 and 1000`),
    check('wall_repair_orders_time_ck', sql`${t.completesAt}>${t.startedAt}`),
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
    woodRem: big('wood_rem')
      .notNull()
      .default(sql`0`),
    stoneRem: big('stone_rem')
      .notNull()
      .default(sql`0`),
    ironRem: big('iron_rem')
      .notNull()
      .default(sql`0`),
    foodRem: big('food_rem')
      .notNull()
      .default(sql`0`),
    woodRate: big('wood_rate_milli_h').notNull(),
    stoneRate: big('stone_rate_milli_h').notNull(),
    ironRate: big('iron_rate_milli_h').notNull(),
    foodRate: big('food_rate_milli_h').notNull(),
    capacity: big('capacity_milli').notNull(),
    foodCapacity: big('food_capacity_milli'),
    starvationAt: ts('starvation_at'),
    lastSettledAt: ts('last_settled_at').notNull(),
    version: integer('version').notNull().default(0),
  },
  (t) => [
    foreignKey({
      name: 'resource_accounts_village_fk',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    check(
      'resource_accounts_nonneg_ck',
      sql`${t.wood} >= 0 and ${t.stone} >= 0 and ${t.iron} >= 0 and ${t.food} >= 0`,
    ),
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
    foreignKey({
      name: 'resource_ledger_village_fk',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
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
    lane: text('lane').notNull().default('GENERAL'),
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
    foreignKey({
      name: 'construction_orders_village_fk',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    // FR-CITY-04: una construcción activa por aldea, garantizado por la BD.
    uniqueIndex('construction_orders_one_active_uq')
      .on(t.villageId, t.lane)
      .where(sql`${t.status} = 'IN_PROGRESS'`),
    check('construction_orders_lane_ck', sql`${t.lane} in ('GENERAL','FIELD')`),
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
    foreignKey({
      name: 'recruitment_orders_village_fk',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    index('recruitment_orders_queue_idx').on(t.villageId, t.trainedAt, t.status, t.completesAt),
    check('recruitment_orders_qty_ck', sql`${t.quantity} > 0`),
  ],
);

export const villageResearch = pgTable(
  'village_research',
  {
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    unitType: text('unit_type').notNull(),
    kind: text('kind').notNull(),
    level: integer('level').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.villageId, t.unitType, t.kind] }),
    foreignKey({
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    check('village_research_kind_ck', sql`${t.kind} in ('UNLOCK','WEAPON','ARMOR')`),
    check('village_research_level_ck', sql`${t.level} between 1 and 20`),
  ],
);
export const developmentOrders = pgTable(
  'development_orders',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    accountId: uuid('account_id').notNull(),
    kind: text('kind').notNull(),
    lane: text('lane').notNull(),
    target: text('target').notNull(),
    targetLevel: integer('target_level').notNull(),
    plot: integer('plot'),
    status: orderStatus('status').notNull().default('IN_PROGRESS'),
    startedAt: ts('started_at').notNull(),
    completesAt: ts('completes_at').notNull(),
    completedAt: ts('completed_at'),
  },
  (t) => [
    foreignKey({
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      columns: [t.worldId, t.accountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    uniqueIndex('development_orders_lane_uq')
      .on(t.villageId, t.lane)
      .where(sql`${t.status}='IN_PROGRESS'`),
    check('development_orders_kind_ck', sql`${t.kind} in ('UNLOCK','WEAPON','ARMOR','DEMOLISH')`),
    check('development_orders_level_ck', sql`${t.targetLevel} between 0 and 20`),
    check('development_orders_time_ck', sql`${t.completesAt}>${t.startedAt}`),
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
    foreignKey({
      name: 'troop_stacks_village_fk',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
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
    foreignKey({
      name: 'wounded_stacks_village_fk',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
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
    siegeTargetPlot: integer('siege_target_plot'),
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
    foreignKey({
      name: 'army_movements_origin_fk',
      columns: [t.worldId, t.originVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      name: 'army_movements_target_fk',
      columns: [t.worldId, t.targetVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
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
    location: text('location').notNull().default('VILLAGE'),
    encounterKey: text('encounter_key'),
    fieldX: integer('field_x_milli'),
    fieldY: integer('field_y_milli'),
    snapshot: jsonb('snapshot').notNull(),
    result: jsonb('result').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    // Un movimiento produce como máximo una batalla (idempotencia, FR-BAT-05).
    uniqueIndex('battles_encounter_uq').on(t.worldId, t.encounterKey),
    index('battles_movement_idx').on(t.movementId),
    foreignKey({
      name: 'battles_movement_fk',
      columns: [t.worldId, t.movementId],
      foreignColumns: [armyMovements.worldId, armyMovements.id],
    }),
    foreignKey({
      name: 'battles_attacker_village_fk',
      columns: [t.worldId, t.attackerVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      name: 'battles_defender_village_fk',
      columns: [t.worldId, t.defenderVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
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
    foreignKey({
      name: 'scheduled_events_village_fk',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      name: 'scheduled_events_secondary_village_fk',
      columns: [t.worldId, t.secondaryVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    index('scheduled_events_claim_idx')
      .on(t.status, t.availableAt)
      .where(sql`${t.status} in ('PENDING','PROCESSING')`),
    index('scheduled_events_village_idx')
      .on(t.villageId, t.dueAt)
      .where(sql`${t.status} in ('PENDING','PROCESSING')`),
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
  (t) => [
    index('outbox_unpublished_idx')
      .on(t.id)
      .where(sql`${t.publishedAt} is null`),
  ],
);

// ---------------------------------------------------------------------------
// MVP 2 — Entrenamiento táctico (ADR-0037). Migración ADITIVA: no referencia
// ninguna tabla de mundo (sin world_id): un entrenamiento nunca toca recursos,
// tropas, rankings ni eventos del mundo.
// ---------------------------------------------------------------------------
export const trainingOpponent = pgEnum('training_opponent', ['DOCTRINE', 'PLAYER']);
export const trainingStatus = pgEnum('training_status', [
  'WAITING_OPPONENT',
  'LIVE',
  'FINISHED',
  'EXPIRED',
  'FAILED',
]);

export const trainingMatches = pgTable(
  'training_matches',
  {
    id: uuid('id').primaryKey(),
    inviteCode: text('invite_code').notNull(),
    hostAccountId: uuid('host_account_id')
      .notNull()
      .references(() => accounts.id),
    guestAccountId: uuid('guest_account_id').references(() => accounts.id),
    opponent: trainingOpponent('opponent').notNull(),
    status: trainingStatus('status').notNull(),
    terrainId: text('terrain_id').notNull(),
    hostCivilization: text('host_civilization').notNull(),
    hostArmy: text('host_army').notNull(),
    guestCivilization: text('guest_civilization'),
    guestArmy: text('guest_army'),
    tacticalRulesetVersion: text('tactical_ruleset_version').notNull(),
    seed: text('seed').notNull(),
    snapshot: jsonb('snapshot'),
    snapshotHash: text('snapshot_hash'),
    roomId: text('room_id'),
    result: jsonb('result'),
    resultHash: text('result_hash'),
    replay: jsonb('replay'),
    createdAt: ts('created_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
    finishedAt: ts('finished_at'),
  },
  (t) => [
    uniqueIndex('training_matches_invite_uq').on(t.inviteCode),
    index('training_matches_host_idx').on(t.hostAccountId, t.createdAt),
    index('training_matches_guest_idx').on(t.guestAccountId, t.createdAt),
    check(
      'training_matches_guest_ck',
      sql`${t.guestAccountId} is null or ${t.guestAccountId} <> ${t.hostAccountId}`,
    ),
    check(
      'training_matches_result_ck',
      sql`(${t.status} = 'FINISHED') = (${t.result} is not null)`,
    ),
  ],
);

export const alliances = pgTable(
  'alliances',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    name: text('name').notNull(),
    inviteCode: text('invite_code').notNull(),
    leaderAccountId: uuid('leader_account_id').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'alliances_world_id_fkey',
      columns: [t.worldId],
      foreignColumns: [worlds.id],
    }),
    unique('alliances_world_id_id_key').on(t.worldId, t.id),
    unique('alliances_world_id_invite_code_key').on(t.worldId, t.inviteCode),
    foreignKey({
      name: 'alliances_world_id_leader_account_id_fkey',
      columns: [t.worldId, t.leaderAccountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
  ],
);
export const allianceMembers = pgTable(
  'alliance_members',
  {
    worldId: uuid('world_id').notNull(),
    accountId: uuid('account_id').notNull(),
    allianceId: uuid('alliance_id').notNull(),
  },
  (t) => [
    primaryKey({ name: 'alliance_members_pkey', columns: [t.worldId, t.accountId] }),
    foreignKey({
      name: 'alliance_members_world_id_account_id_fkey',
      columns: [t.worldId, t.accountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    foreignKey({
      name: 'alliance_members_world_id_alliance_id_fkey',
      columns: [t.worldId, t.allianceId],
      foreignColumns: [alliances.worldId, alliances.id],
    }),
  ],
);
export const garrisons = pgTable(
  'garrisons',
  {
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    originVillageId: uuid('origin_village_id').notNull(),
    ownerAccountId: uuid('owner_account_id').notNull(),
    unitType: text('unit_type').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (t) => [
    primaryKey({ name: 'garrisons_pkey', columns: [t.villageId, t.originVillageId, t.unitType] }),
    check('garrisons_quantity_check', sql`${t.quantity}>=0`),
    foreignKey({
      name: 'garrisons_world_id_village_id_fkey',
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      name: 'garrisons_world_id_origin_village_id_fkey',
      columns: [t.worldId, t.originVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      name: 'garrisons_world_id_owner_account_id_fkey',
      columns: [t.worldId, t.ownerAccountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
  ],
);
export const settlementOrders = pgTable(
  'settlement_orders',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    originVillageId: uuid('origin_village_id').notNull(),
    ownerAccountId: uuid('owner_account_id').notNull(),
    name: text('name').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    departedAt: ts('departed_at').notNull(),
    arrivesAt: ts('arrives_at').notNull(),
    status: orderStatus('status').notNull().default('IN_PROGRESS'),
  },
  (t) => [
    uniqueIndex('settlement_spot_uq')
      .on(t.worldId, t.x, t.y)
      .where(sql`${t.status}='IN_PROGRESS'`),
    foreignKey({
      name: 'settlement_orders_world_id_origin_village_id_fkey',
      columns: [t.worldId, t.originVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      name: 'settlement_orders_world_id_owner_account_id_fkey',
      columns: [t.worldId, t.ownerAccountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
  ],
);

/** Tramos históricos: la cultura generada sigue perteneciendo a quien la produjo. */
export const cultureStreams = pgTable(
  'culture_streams',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    accountId: uuid('account_id').notNull(),
    rateMilliPerDay: bigint('rate_milli_per_day', { mode: 'bigint' }).notNull(),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at'),
  },
  (t) => [
    foreignKey({
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      columns: [t.worldId, t.accountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    check('culture_streams_rate_ck', sql`${t.rateMilliPerDay}>=0`),
    check('culture_streams_time_ck', sql`${t.endsAt} is null or ${t.endsAt}>=${t.startsAt}`),
    uniqueIndex('culture_streams_open_uq')
      .on(t.villageId)
      .where(sql`${t.endsAt} is null`),
    index('culture_streams_owner_idx').on(t.worldId, t.accountId),
  ],
);
export const villageExpansions = pgTable(
  'village_expansions',
  {
    worldId: uuid('world_id').notNull(),
    originVillageId: uuid('origin_village_id').notNull(),
    targetVillageId: uuid('target_village_id').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.targetVillageId] }),
    foreignKey({
      columns: [t.worldId, t.originVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      columns: [t.worldId, t.targetVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    check('village_expansions_distinct_ck', sql`${t.originVillageId}<>${t.targetVillageId}`),
    index('village_expansions_origin_idx').on(t.worldId, t.originVillageId),
  ],
);
export const celebrations = pgTable(
  'celebrations',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    accountId: uuid('account_id').notNull(),
    points: integer('points').notNull(),
    status: orderStatus('status').notNull().default('IN_PROGRESS'),
    startedAt: ts('started_at').notNull(),
    completesAt: ts('completes_at').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      columns: [t.worldId, t.accountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    uniqueIndex('celebrations_one_active_uq')
      .on(t.villageId)
      .where(sql`${t.status}='IN_PROGRESS'`),
    check('celebrations_points_ck', sql`${t.points}>0`),
    check('celebrations_time_ck', sql`${t.completesAt}>${t.startedAt}`),
  ],
);

export const tradeOffers = pgTable(
  'trade_offers',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    villageId: uuid('village_id').notNull(),
    accountId: uuid('account_id').notNull(),
    give: jsonb('give').$type<ResourceBundle>().notNull(),
    want: jsonb('want').$type<ResourceBundle>().notNull(),
    lotsRemaining: integer('lots_remaining').notNull(),
    status: text('status').notNull().default('OPEN'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.worldId, t.villageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      columns: [t.worldId, t.accountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    check('trade_offers_lots_ck', sql`${t.lotsRemaining} between 0 and 100`),
    check('trade_offers_status_ck', sql`${t.status} in ('OPEN','FILLED','CANCELLED')`),
    index('trade_offers_world_status_idx').on(t.worldId, t.status, t.createdAt),
  ],
);
export const tradeTrips = pgTable(
  'trade_trips',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    originVillageId: uuid('origin_village_id').notNull(),
    targetVillageId: uuid('target_village_id').notNull(),
    accountId: uuid('account_id').notNull(),
    recipientAccountId: uuid('recipient_account_id').notNull(),
    cargo: jsonb('cargo').$type<ResourceBundle>().notNull(),
    returnCargo: jsonb('return_cargo').$type<ResourceBundle>(),
    merchants: integer('merchants').notNull(),
    status: text('status').notNull().default('OUTBOUND'),
    transitSeconds: integer('transit_seconds').notNull(),
    departedAt: ts('departed_at').notNull(),
    arrivesAt: ts('arrives_at').notNull(),
    returnsAt: ts('returns_at').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.worldId, t.originVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      columns: [t.worldId, t.targetVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      columns: [t.worldId, t.accountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    foreignKey({
      columns: [t.worldId, t.recipientAccountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    check('trade_trips_merchants_ck', sql`${t.merchants}>0 and ${t.transitSeconds}>0`),
    check('trade_trips_status_ck', sql`${t.status} in ('OUTBOUND','RETURNING','COMPLETED')`),
    check(
      'trade_trips_time_ck',
      sql`${t.departedAt}<${t.arrivesAt} and ${t.arrivesAt}<${t.returnsAt}`,
    ),
    index('trade_trips_origin_status_idx').on(t.worldId, t.originVillageId, t.status),
    index('trade_trips_recipient_status_idx').on(t.worldId, t.targetVillageId, t.status),
  ],
);
export const tradeRoutes = pgTable(
  'trade_routes',
  {
    id: uuid('id').primaryKey(),
    worldId: uuid('world_id').notNull(),
    originVillageId: uuid('origin_village_id').notNull(),
    targetVillageId: uuid('target_village_id').notNull(),
    accountId: uuid('account_id').notNull(),
    recipientAccountId: uuid('recipient_account_id').notNull(),
    cargo: jsonb('cargo').$type<ResourceBundle>().notNull(),
    everySeconds: integer('every_seconds').notNull(),
    nextAt: ts('next_at').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    lastResult: text('last_result'),
  },
  (t) => [
    foreignKey({
      columns: [t.worldId, t.originVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      columns: [t.worldId, t.targetVillageId],
      foreignColumns: [villages.worldId, villages.id],
    }),
    foreignKey({
      columns: [t.worldId, t.accountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    foreignKey({
      columns: [t.worldId, t.recipientAccountId],
      foreignColumns: [worldPlayers.worldId, worldPlayers.accountId],
    }),
    check('trade_routes_period_ck', sql`${t.everySeconds} between 3600 and 604800`),
    index('trade_routes_origin_idx').on(t.worldId, t.originVillageId),
  ],
);
