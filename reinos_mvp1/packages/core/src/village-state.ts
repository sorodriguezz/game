import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  armyMovements,
  recruitmentOrders,
  resourceAccounts,
  resourceLedger,
  troopStacks,
  villageBuildings,
  villages,
  woundedStacks,
  worlds,
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
  capacityMilli,
  computeRates,
  levelOf,
  mapResources,
  upkeepPerHour,
  type PlacedBuilding,
  type ResourceMap,
  type ResourceState,
} from '@reinos/game-rules';
import { DomainError, err } from './context.js';

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
    lastSettledAt: new Date(s.lastSettledAt),
  };
}

/** Persiste el estado económico (la aldea ya debe estar bloqueada por el llamador). */
export async function saveEconomy(tx: Tx, villageId: string, s: ResourceState): Promise<void> {
  await tx
    .update(resourceAccounts)
    .set({ ...stateColumns(s), version: sql`${resourceAccounts.version} + 1` })
    .where(eq(resourceAccounts.villageId, villageId));
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
  const upkeep = upkeepPerHour(r, [...home, ...away]);
  return {
    ...state,
    rates: computeRates(r, buildings, upkeep),
    capacity: capacityMilli(r, levelOf(buildings, 'warehouse')),
  };
}

export async function writeLedger(
  tx: Tx,
  entry: {
    worldId: string;
    villageId: string;
    reason: 'BUILD' | 'TRAIN' | 'LOOT_OUT' | 'LOOT_IN';
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
