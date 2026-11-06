import { and, eq } from 'drizzle-orm';
import {
  villages,
  resourceAccounts,
  garrisons,
  troopStacks,
  woundedStacks,
  armyMovements,
  outbox,
} from '@reinos/db';
import { unitDef, type UnitType } from '@reinos/game-config';
import { settle, isStarving, starvationBudget } from '@reinos/game-rules';
import {
  loadWorld,
  rulesetOf,
  loadEconomy,
  saveEconomy,
  withRecomputedRates,
} from './village-state.js';
import type { EventHandler } from './events.js';
export const applyStarvation: EventHandler = async (tx, _ctx, ev) => {
  const [account] = await tx
    .select()
    .from(resourceAccounts)
    .where(
      and(eq(resourceAccounts.worldId, ev.worldId), eq(resourceAccounts.villageId, ev.villageId)),
    );
  if (account?.starvationAt?.getTime() !== ev.dueAt.getTime()) return;
  const [village] = await tx
    .select()
    .from(villages)
    .where(and(eq(villages.worldId, ev.worldId), eq(villages.id, ev.villageId)));
  if (!village || village.kind !== 'PLAYER') return;
  const world = await loadWorld(tx, ev.worldId),
    r = rulesetOf(world),
    interval = r.economy.starvationIntervalSeconds;
  if (!interval) return;
  const state = settle(await loadEconomy(tx, ev.villageId), ev.dueAt.getTime());
  const losses: Array<{ owner: string | null; unitType: string; quantity: number }> = [];
  let budget = isStarving(state) ? starvationBudget(state.rates.food, interval) : 0;
  const take = (unitType: string, quantity: number, owner: string | null) => {
    const upkeep = unitDef(r, unitType as UnitType).foodUpkeepPerHour;
    if (budget <= 0 || quantity <= 0 || upkeep === 0) return 0;
    const lost = Math.min(quantity, Math.ceil(budget / upkeep));
    budget = Math.max(0, budget - lost * upkeep);
    losses.push({ owner, unitType, quantity: lost });
    return lost;
  };
  const guests = await tx
    .select()
    .from(garrisons)
    .where(and(eq(garrisons.worldId, ev.worldId), eq(garrisons.villageId, village.id)))
    .orderBy(garrisons.ownerAccountId, garrisons.originVillageId, garrisons.unitType);
  for (const g of guests) {
    const lost = take(g.unitType, g.quantity, g.ownerAccountId);
    if (lost)
      await tx
        .update(garrisons)
        .set({ quantity: g.quantity - lost })
        .where(
          and(
            eq(garrisons.worldId, ev.worldId),
            eq(garrisons.villageId, village.id),
            eq(garrisons.originVillageId, g.originVillageId),
            eq(garrisons.unitType, g.unitType),
          ),
        );
  }
  for (const table of [troopStacks, woundedStacks]) {
    const rows = await tx
      .select()
      .from(table)
      .where(and(eq(table.worldId, ev.worldId), eq(table.villageId, village.id)))
      .orderBy(table.unitType);
    for (const row of rows) {
      const lost = take(row.unitType, row.quantity, village.ownerAccountId);
      if (lost)
        await tx
          .update(table)
          .set({ quantity: row.quantity - lost })
          .where(
            and(
              eq(table.worldId, ev.worldId),
              eq(table.villageId, village.id),
              eq(table.unitType, row.unitType),
            ),
          );
    }
  }
  const away = await tx
    .select()
    .from(armyMovements)
    .where(
      and(
        eq(armyMovements.worldId, ev.worldId),
        eq(armyMovements.originVillageId, village.id),
        eq(armyMovements.ownerAccountId, village.ownerAccountId!),
      ),
    )
    .orderBy(armyMovements.id);
  for (const m of away) {
    if (!['IN_TRANSIT', 'RETURNING'].includes(m.status) || budget <= 0) continue;
    const units = { ...m.units };
    for (const type of Object.keys(units).sort()) {
      units[type] = units[type]! - take(type, units[type]!, m.ownerAccountId);
      if (units[type] === 0) delete units[type];
    }
    await tx
      .update(armyMovements)
      .set({ units, ...(Object.keys(units).length ? {} : { status: 'COMPLETED' as const }) })
      .where(and(eq(armyMovements.worldId, ev.worldId), eq(armyMovements.id, m.id)));
  }
  await saveEconomy(tx, village.id, await withRecomputedRates(tx, r, village.id, state));
  if (losses.length)
    await tx.insert(outbox).values({
      worldId: ev.worldId,
      type: 'TroopsStarved',
      payload: { eventId: ev.id, villageId: village.id, at: ev.dueAt.toISOString(), losses },
    });
};
