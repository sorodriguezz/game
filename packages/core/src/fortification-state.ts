import { and, eq, sql } from 'drizzle-orm';
import { villageLayouts, wallSections, wallRepairOrders, type Tx } from '@reinos/db';
import type { CivilizationId, Ruleset } from '@reinos/game-config';
import { generateVillageLayout, fieldDistribution, fieldTypes } from '@reinos/game-rules';
import type { EventHandler } from './events.js';
import { DomainError } from './context.js';

export async function initializeFortifications(
  tx: Tx,
  r: Ruleset,
  world: { id: string; mapSeed: number },
  village: { id: string; x: number; y: number },
  civilization: CivilizationId,
  balanced = false,
) {
  if (!r.fortifications) return;
  const layout = generateVillageLayout(r, {
    worldSeed: world.mapSeed,
    x: village.x,
    y: village.y,
    civilization,
  });
  if (r.economy.cropPopulation) {
    const types = fieldTypes(fieldDistribution(world.mapSeed, village.x, village.y, balanced));
    layout.plots
      .filter((p) => p.kind === 'field')
      .sort((a, b) => a.id - b.id)
      .forEach((p, i) => {
        p.allowedTypes = [types[i]!];
        p.label = r.buildings.find((b) => b.type === types[i])!.name;
      });
  }
  await tx.insert(villageLayouts).values({
    worldId: world.id,
    villageId: village.id,
    version: layout.version,
    seed: layout.seed,
    layout,
  });
  await tx.insert(wallSections).values(
    ([1, 2, 3] as const).map((precinct) => ({
      worldId: world.id,
      villageId: village.id,
      precinct,
      integrity: 1000,
    })),
  );
}

export const wallRepairComplete: EventHandler = async (tx, _ctx, ev) => {
  const [order] = await tx
    .select()
    .from(wallRepairOrders)
    .where(
      and(
        eq(wallRepairOrders.id, String(ev.payload.orderId)),
        eq(wallRepairOrders.worldId, ev.worldId),
      ),
    )
    .for('update');
  if (!order || order.status !== 'IN_PROGRESS') return;
  if (order.villageId !== ev.villageId)
    throw new DomainError('WORLD_MISMATCH', 500, 'Reparación de otra aldea');
  await tx
    .update(wallSections)
    .set({ integrity: sql`least(1000,${wallSections.integrity}+${order.restoreIntegrity})` })
    .where(
      and(
        eq(wallSections.worldId, ev.worldId),
        eq(wallSections.villageId, ev.villageId),
        eq(wallSections.precinct, order.precinct),
      ),
    );
  await tx
    .update(wallRepairOrders)
    .set({ status: 'COMPLETED' })
    .where(eq(wallRepairOrders.id, order.id));
};
