import { and, eq } from 'drizzle-orm';
import {
  villages,
  worlds,
  worldRegions,
  villageBuildings,
  resourceAccounts,
  troopStacks,
  settlementOrders,
  type Db,
  type Tx,
} from '@reinos/db';
import {
  createPrng,
  terrainAt,
  bundleToMilli,
  computeRates,
  capacityMilli,
} from '@reinos/game-rules';
import {
  rulesetOf,
  loadWorld,
  loadTroops,
  addToStacks,
  stateColumns,
  type WorldRow,
} from './village-state.js';
import { initializeFortifications } from './fortification-state.js';
import { scheduleEvent, type EventHandler } from './events.js';
import { newId, addSeconds } from './util.js';

export function npcGuardians(seed: number, x: number, y: number, oasis: boolean) {
  const rng = createPrng(`${seed}:${x}:${y}:guardians-1`);
  return oasis
    ? [
        { unitType: 'wolf' as const, quantity: 3 + rng.nextInt(10) },
        { unitType: 'boar' as const, quantity: 2 + rng.nextInt(6) },
        { unitType: 'bear' as const, quantity: 1 + rng.nextInt(3) },
      ]
    : [
        { unitType: 'militia' as const, quantity: 18 + rng.nextInt(18) },
        { unitType: 'spearman' as const, quantity: 10 + rng.nextInt(12) },
        { unitType: 'archer' as const, quantity: 4 + rng.nextInt(8) },
      ];
}
async function scheduleRegeneration(
  tx: Tx,
  world: WorldRow,
  village: { id: string; kind: string },
  at: Date,
) {
  const config = rulesetOf(world).territory?.npcRegeneration;
  if (!config) return;
  const dueAt = addSeconds(
    at,
    village.kind === 'OASIS' ? config.oasisSeconds : config.villageSeconds,
  );
  await scheduleEvent(tx, {
    worldId: world.id,
    villageId: village.id,
    type: 'NPC_REGENERATE',
    dueAt,
    dedupeKey: `npc:${village.id}:${dueAt.toISOString()}`,
    payload: {},
  });
}
/** Materialización regional determinista y persistente; nunca recorre el mapa completo. */
export async function ensureWorldRegions(
  db: Db,
  world: WorldRow,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  at: Date,
) {
  const r = rulesetOf(world);
  if (!r.territory?.npcRegeneration || !['OPEN', 'WONDER_ERA'].includes(world.status)) return;
  for (let ry = Math.floor(y0 / 16); ry <= Math.floor(y1 / 16); ry++)
    for (let rx = Math.floor(x0 / 16); rx <= Math.floor(x1 / 16); rx++) {
      const [exists] = await db
        .select()
        .from(worldRegions)
        .where(
          and(eq(worldRegions.worldId, world.id), eq(worldRegions.x, rx), eq(worldRegions.y, ry)),
        );
      if (exists) continue;
      await db.transaction(async (tx) => {
        const [fresh] = await tx
          .select()
          .from(worlds)
          .where(eq(worlds.id, world.id))
          .for('no key update');
        if (!fresh || !['OPEN', 'WONDER_ERA'].includes(fresh.status)) return;
        const [again] = await tx
          .select()
          .from(worldRegions)
          .where(
            and(eq(worldRegions.worldId, world.id), eq(worldRegions.x, rx), eq(worldRegions.y, ry)),
          );
        if (again) return;
        for (let y = Math.max(0, ry * 16); y < Math.min(world.mapSize, (ry + 1) * 16); y++)
          for (let x = Math.max(0, rx * 16); x < Math.min(world.mapSize, (rx + 1) * 16); x++) {
            const terrain = terrainAt(world.mapSeed, world.mapSize, x, y, 'LAND'),
              oasis = terrain === 'OASIS',
              free =
                !oasis &&
                terrain === 'PLAIN' &&
                createPrng(`${world.mapSeed}:${x}:${y}:npc-cell-1`).nextInt(100) < 2;
            if (!oasis && !free) continue;
            const [occupied] = await tx
              .select({ id: villages.id })
              .from(villages)
              .where(and(eq(villages.worldId, world.id), eq(villages.x, x), eq(villages.y, y)));
            const [reserved] = await tx
              .select({ id: settlementOrders.id })
              .from(settlementOrders)
              .where(
                and(
                  eq(settlementOrders.worldId, world.id),
                  eq(settlementOrders.x, x),
                  eq(settlementOrders.y, y),
                  eq(settlementOrders.status, 'IN_PROGRESS'),
                ),
              );
            if (occupied || reserved) continue;
            const id = newId(),
              kind = oasis ? ('OASIS' as const) : ('NPC' as const);
            await tx.insert(villages).values({
              id,
              worldId: world.id,
              x,
              y,
              coastal: false,
              name: oasis ? 'Oasis salvaje' : 'Aldea libre',
              kind,
              loyalty: 100,
              createdAt: at,
            });
            if (!oasis) {
              await initializeFortifications(tx, r, world, { id, x, y }, 'stone_wardens');
              await tx
                .insert(villageBuildings)
                .values(
                  r.startingBuildings.map((b) => ({ worldId: world.id, villageId: id, ...b })),
                );
            }
            const buildings = oasis ? [] : r.startingBuildings;
            await tx.insert(resourceAccounts).values({
              worldId: world.id,
              villageId: id,
              ...stateColumns({
                amounts: bundleToMilli({ wood: 600, stone: 600, iron: 600, food: 600 }),
                remainders: { wood: 0n, stone: 0n, iron: 0n, food: 0n },
                rates: computeRates(r, buildings, 0, world.speedMultiplier),
                capacity: capacityMilli(r, 0),
                foodCapacity: capacityMilli(r, 0),
                lastSettledAt: at.getTime(),
              }),
            });
            await tx.insert(troopStacks).values(
              npcGuardians(world.mapSeed, x, y, oasis).map((t) => ({
                worldId: world.id,
                villageId: id,
                ...t,
              })),
            );
            await scheduleRegeneration(tx, world, { id, kind }, at);
          }
        await tx
          .insert(worldRegions)
          .values({ worldId: world.id, x: rx, y: ry, version: 'npc-1', createdAt: at });
      });
    }
}
export const npcRegenerate: EventHandler = async (tx, _ctx, ev) => {
  const [v] = await tx
    .select()
    .from(villages)
    .where(and(eq(villages.worldId, ev.worldId), eq(villages.id, ev.villageId)));
  if (!v || v.ownerAccountId || !['NPC', 'OASIS'].includes(v.kind)) return;
  const world = await loadWorld(tx, ev.worldId);
  if (!rulesetOf(world).territory?.npcRegeneration) return;
  const current = await loadTroops(tx, v.id),
    cap = npcGuardians(world.mapSeed, v.x, v.y, v.kind === 'OASIS');
  const added = cap
    .map((t) => ({
      unitType: t.unitType,
      quantity: Math.max(
        0,
        Math.min(
          Math.max(1, Math.ceil(t.quantity / 4)),
          t.quantity - (current.find((c) => c.unitType === t.unitType)?.quantity ?? 0),
        ),
      ),
    }))
    .filter((t) => t.quantity > 0);
  if (added.length) await addToStacks(tx, troopStacks, ev.worldId, v.id, added);
  await scheduleRegeneration(tx, world, v, ev.dueAt);
};
