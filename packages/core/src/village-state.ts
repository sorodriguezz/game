import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  armyMovements,
  garrisons,
  recruitmentOrders,
  resourceAccounts,
  resourceLedger,
  troopStacks,
  villageBuildings,
  villages,
  woundedStacks,
  worlds,
  villageLayouts,
  type DbOrTx,
  type Tx,
} from '@reinos/db';
import {
  getRuleset,
  type BuildingType,
  type ResourceKey,
  type Ruleset,
  type UnitType,
} from '@reinos/game-config';
import {
  computeRates,
  mapResources,
  upkeepPerHour,
  storageCapacity,
  inhabitantsOf,
  oasisBonuses,
  starvationDueAt,
  type PlacedBuilding,
  type ResourceMap,
  type ResourceState,
} from '@reinos/game-rules';
import { DomainError, err } from './context.js';
import { scheduleEvent } from './events.js';

export type WorldRow = typeof worlds.$inferSelect;
export type VillageRow = typeof villages.$inferSelect;

export async function loadWorld(db: DbOrTx, worldId: string): Promise<WorldRow> {
  const [w] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!w) throw err.notFound('WORLD_NOT_FOUND', 'Mundo no encontrado');
  return w;
}

export function assertWorldActive(w: WorldRow): void {
  if (w.status !== 'OPEN' && w.status !== 'WONDER_ERA') {
    throw err.conflict('WORLD_NOT_OPEN', `El mundo está en estado ${w.status}`);
  }
}

export function rulesetOf(w: WorldRow): Ruleset {
  return getRuleset(w.rulesetVersion);
}

/**
 * Bloquea (FOR UPDATE) las aldeas indicadas en orden estable de id para evitar
 * interbloqueos. Todas deben pertenecer a `worldId`.
 */
export async function lockVillages(
  tx: Tx,
  worldId: string,
  ids: readonly string[],
): Promise<Map<string, VillageRow>> {
  const unique = [...new Set(ids)].sort();
  const rows = await tx
    .select()
    .from(villages)
    .where(and(eq(villages.worldId, worldId), inArray(villages.id, unique)))
    .orderBy(villages.id)
    .for('update');
  if (rows.length !== unique.length) throw err.notFound('VILLAGE_NOT_FOUND', 'Aldea no encontrada');
  return new Map(rows.map((r) => [r.id, r]));
}

/** Bloquea una aldea comprobando propiedad y mundo; 404 si no es del actor (no revela existencia). */
export async function lockOwnedVillage(
  tx: Tx,
  worldId: string,
  villageId: string,
  accountId: string,
): Promise<VillageRow> {
  const rows = await tx
    .select()
    .from(villages)
    .where(
      and(
        eq(villages.worldId, worldId),
        eq(villages.id, villageId),
        eq(villages.ownerAccountId, accountId),
        eq(villages.kind, 'PLAYER'),
      ),
    )
    .for('update');
  const v = rows[0];
  if (!v) throw err.notFound('VILLAGE_NOT_FOUND', 'Aldea no encontrada');
  return v;
}

export async function loadBuildings(db: DbOrTx, villageId: string): Promise<PlacedBuilding[]> {
  const rows = await db
    .select()
    .from(villageBuildings)
    .where(eq(villageBuildings.villageId, villageId));
  return rows.map((b) => ({ plot: b.plot, type: b.type as BuildingType, level: b.level }));
}

export async function loadTroops(
  db: DbOrTx,
  villageId: string,
): Promise<Array<{ unitType: UnitType; quantity: number }>> {
  const rows = await db.select().from(troopStacks).where(eq(troopStacks.villageId, villageId));
  return rows
    .filter((r) => r.quantity > 0)
    .map((r) => ({ unitType: r.unitType as UnitType, quantity: r.quantity }));
}

export async function loadWounded(
  db: DbOrTx,
  villageId: string,
): Promise<Array<{ unitType: UnitType; quantity: number }>> {
  const rows = await db.select().from(woundedStacks).where(eq(woundedStacks.villageId, villageId));
  return rows
    .filter((r) => r.quantity > 0)
    .map((r) => ({ unitType: r.unitType as UnitType, quantity: r.quantity }));
}

/** Tropas propiedad de la aldea fuera de casa (en marcha o regresando). */
export async function loadAwayTroops(
  db: DbOrTx,
  villageId: string,
): Promise<Array<{ unitType: UnitType; quantity: number }>> {
  const rows = await db
    .select({ units: armyMovements.units })
    .from(armyMovements)
    .where(
      and(
        eq(armyMovements.originVillageId, villageId),
        sql`${armyMovements.ownerAccountId}=(select owner_account_id from villages where id=${villageId})`,
        inArray(armyMovements.status, ['IN_TRANSIT', 'RETURNING']),
      ),
    );
  const out: Array<{ unitType: UnitType; quantity: number }> = [];
  for (const r of rows) {
    for (const [unitType, quantity] of Object.entries(r.units))
      out.push({ unitType: unitType as UnitType, quantity });
  }
  return out;
}

export async function loadTrainingTroops(
  db: DbOrTx,
  villageId: string,
): Promise<Array<{ unitType: UnitType; quantity: number }>> {
  const rows = await db
    .select({ unitType: recruitmentOrders.unitType, quantity: recruitmentOrders.quantity })
    .from(recruitmentOrders)
    .where(
      and(eq(recruitmentOrders.villageId, villageId), eq(recruitmentOrders.status, 'IN_PROGRESS')),
    );
  return rows.map((r) => ({ unitType: r.unitType as UnitType, quantity: r.quantity }));
}

// ---------------------------------------------------------------------------
// Cuenta de recursos
// ---------------------------------------------------------------------------
type AccountRow = typeof resourceAccounts.$inferSelect;

function rowToState(a: AccountRow): ResourceState {
  return {
    amounts: { wood: a.wood, stone: a.stone, iron: a.iron, food: a.food },
    remainders: { wood: a.woodRem, stone: a.stoneRem, iron: a.ironRem, food: a.foodRem },
    rates: { wood: a.woodRate, stone: a.stoneRate, iron: a.ironRate, food: a.foodRate },
    capacity: a.capacity,
    ...(a.foodCapacity === null ? {} : { foodCapacity: a.foodCapacity }),
    lastSettledAt: a.lastSettledAt.getTime(),
  };
}

export async function loadEconomy(db: DbOrTx, villageId: string): Promise<ResourceState> {
  const [a] = await db
    .select()
    .from(resourceAccounts)
    .where(eq(resourceAccounts.villageId, villageId));
  if (!a) throw new DomainError('INTERNAL_ERROR', 500, `Aldea ${villageId} sin cuenta de recursos`);
  return rowToState(a);
}

export function stateColumns(s: ResourceState) {
  return {
    wood: s.amounts.wood,
    stone: s.amounts.stone,
    iron: s.amounts.iron,
    food: s.amounts.food,
    woodRem: s.remainders.wood,
    stoneRem: s.remainders.stone,
    ironRem: s.remainders.iron,
    foodRem: s.remainders.food,
    woodRate: s.rates.wood,
    stoneRate: s.rates.stone,
    ironRate: s.rates.iron,
    foodRate: s.rates.food,
    capacity: s.capacity,
    foodCapacity: s.foodCapacity ?? null,
    lastSettledAt: new Date(s.lastSettledAt),
  };
}

/** Persiste el estado económico (la aldea ya debe estar bloqueada por el llamador). */
export async function saveEconomy(tx: Tx, villageId: string, s: ResourceState): Promise<void> {
  const [details] = await tx
    .select({ world: worlds, village: villages, previous: resourceAccounts.starvationAt })
    .from(villages)
    .innerJoin(worlds, eq(worlds.id, villages.worldId))
    .innerJoin(
      resourceAccounts,
      and(
        eq(resourceAccounts.villageId, villages.id),
        eq(resourceAccounts.worldId, villages.worldId),
      ),
    )
    .where(eq(villages.id, villageId));
  const interval = details && rulesetOf(details.world).economy.starvationIntervalSeconds;
  let next: number | null = null;
  if (interval && details?.village.kind === 'PLAYER' && s.rates.food < 0n) {
    const existence = await tx.execute(
      sql`select exists(select 1 from troop_stacks where village_id=${villageId} and quantity>0) or exists(select 1 from wounded_stacks where village_id=${villageId} and quantity>0) or exists(select 1 from garrisons where village_id=${villageId} and quantity>0) or exists(select 1 from army_movements where origin_village_id=${villageId} and owner_account_id=${details.village.ownerAccountId} and status in ('IN_TRANSIT','RETURNING') and units<>'{}'::jsonb) as present`,
    );
    next = starvationDueAt(
      s,
      details.previous?.getTime() ?? null,
      interval,
      Boolean(existence.rows[0]?.present),
    );
  }
  await tx
    .update(resourceAccounts)
    .set({
      ...stateColumns(s),
      starvationAt: next === null ? null : new Date(next),
      version: sql`${resourceAccounts.version} + 1`,
    })
    .where(eq(resourceAccounts.villageId, villageId));
  if (next !== null && details)
    await scheduleEvent(tx, {
      worldId: details.world.id,
      villageId,
      type: 'STARVATION',
      dueAt: new Date(next),
      dedupeKey: `starve:${villageId}:${next}`,
      payload: {},
    });
}

/**
 * Recalcula tasas y capacidad tras un cambio (edificios o tropas). El estado
 * DEBE estar liquidado hasta el instante del cambio (ADR-0004: agotar el tramo anterior).
 */
export async function withRecomputedRates(
  db: DbOrTx,
  r: Ruleset,
  villageId: string,
  state: ResourceState,
): Promise<ResourceState> {
  const buildings = await loadBuildings(db, villageId);
  const home = await loadTroops(db, villageId);
  const away = await loadAwayTroops(db, villageId);
  const guests = await db.select().from(garrisons).where(eq(garrisons.villageId, villageId));
  const upkeep = upkeepPerHour(r, [
    ...home,
    ...away,
    ...(r.economy.starvationIntervalSeconds ? await loadWounded(db, villageId) : []),
    ...guests.map((g) => ({ unitType: g.unitType as UnitType, quantity: g.quantity })),
  ]);
  const [village] = await db.select().from(villages).where(eq(villages.id, villageId));
  const world = await loadWorld(db, village!.worldId);
  const localRules = await rulesetForVillage(db, r, villageId);
  const production = computeRates(localRules, buildings, 0, world.speedMultiplier);
  const rates = { ...production };
  const inhabitants = r.economy.cropPopulation ? inhabitantsOf(r, buildings) : 0;
  rates.food += BigInt(inhabitants) * 1000n;
  if (r.territory) {
    const oases = await db
      .select()
      .from(villages)
      .where(and(eq(villages.parentVillageId, villageId), eq(villages.kind, 'OASIS')));
    for (const k of ['wood', 'stone', 'iron', 'food'] as const) {
      const bonus = r.territory.oasisConquest
        ? oases.reduce((sum, o) => sum + (oasisBonuses(world.mapSeed, o.x, o.y)[k] ?? 0), 0)
        : oases.length * r.territory.oasisBonusPermille;
      rates[k] = (rates[k] * BigInt(1000 + bonus)) / 1000n;
    }
  }
  rates.food -= BigInt(upkeep + inhabitants) * 1000n;
  return {
    ...state,
    rates,
    capacity: storageCapacity(r, buildings, 'warehouse'),
    ...(r.economy.cropPopulation ? { foodCapacity: storageCapacity(r, buildings, 'granary') } : {}),
  };
}

export async function rulesetForVillage(
  db: DbOrTx,
  r: Ruleset,
  villageId: string,
): Promise<Ruleset> {
  if (!r.economy.fieldProductionByLevel) return r;
  const [row] = await db
    .select()
    .from(villageLayouts)
    .where(eq(villageLayouts.villageId, villageId));
  return row ? { ...r, cityLayout: { plots: row.layout.plots } } : r;
}

export async function writeLedger(
  tx: Tx,
  entry: {
    worldId: string;
    villageId: string;
    reason:
      | 'BUILD'
      | 'TRAIN'
      | 'LOOT_OUT'
      | 'LOOT_IN'
      | 'WALL_REPAIR'
      | 'DEVELOPMENT'
      | 'CELEBRATION'
      | 'TRADE_OUT'
      | 'TRADE_IN'
      | 'TRADE_ESCROW'
      | 'TRADE_REFUND';
    refId: string;
    deltaMilli: ResourceMap<bigint>;
    at: Date;
  },
): Promise<void> {
  await tx.insert(resourceLedger).values({
    worldId: entry.worldId,
    villageId: entry.villageId,
    reason: entry.reason,
    refId: entry.refId,
    wood: entry.deltaMilli.wood,
    stone: entry.deltaMilli.stone,
    iron: entry.deltaMilli.iron,
    food: entry.deltaMilli.food,
    occurredAt: entry.at,
  });
}

export function negate(m: ResourceMap<bigint>): ResourceMap<bigint> {
  return mapResources((k: ResourceKey) => -m[k]);
}

/** Suma (upsert) cantidades a una pila de tropas o heridos. */
export async function addToStacks(
  tx: Tx,
  table: typeof troopStacks | typeof woundedStacks,
  worldId: string,
  villageId: string,
  stacks: ReadonlyArray<{ unitType: string; quantity: number }>,
): Promise<void> {
  for (const s of stacks) {
    if (s.quantity === 0) continue;
    await tx
      .insert(table)
      .values({ worldId, villageId, unitType: s.unitType, quantity: s.quantity })
      .onConflictDoUpdate({
        target: [table.villageId, table.unitType],
        set: { quantity: sql`${table.quantity} + ${s.quantity}` },
      });
  }
}

/** Resta tropas; lanza INSUFFICIENT_TROOPS si alguna pila no alcanza (nunca negativas). */
export async function removeFromStacks(
  tx: Tx,
  villageId: string,
  stacks: ReadonlyArray<{ unitType: string; quantity: number }>,
): Promise<void> {
  for (const s of stacks) {
    if (s.quantity === 0) continue;
    const res = await tx
      .update(troopStacks)
      .set({ quantity: sql`${troopStacks.quantity} - ${s.quantity}` })
      .where(
        and(
          eq(troopStacks.villageId, villageId),
          eq(troopStacks.unitType, s.unitType),
          sql`${troopStacks.quantity} >= ${s.quantity}`,
        ),
      )
      .returning({ q: troopStacks.quantity });
    if (res.length !== 1) {
      throw err.conflict('INSUFFICIENT_TROOPS', `Tropas insuficientes de ${s.unitType}`, {
        unitType: s.unitType,
      });
    }
  }
}
/** El cambio se activa exclusivamente en el ruleset nuevo, preservando viajes antiguos. */
export function militarySpeedOf(world: WorldRow): number {
  return rulesetOf(world).fortifications ? world.movementSpeedMultiplier : world.speedMultiplier;
}
