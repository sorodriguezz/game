import { and, eq } from 'drizzle-orm';
import {
  terrainAt,
  computeRates,
  capacityMilli,
  levelOf,
  generateVillageLayout,
} from '@reinos/game-rules';
import { randomUUID } from 'node:crypto';
import { DEFAULT_RULESET_VERSION, getRuleset } from '@reinos/game-config';
import type { Db } from './client.js';
import {
  worlds,
  villages,
  villageBuildings,
  resourceAccounts,
  troopStacks,
  villageLayouts,
  wallSections,
} from './schema.js';

export interface WorldSeed {
  slug: string;
  name: string;
  profile: 'test' | 'alpha' | 'seasonal';
  speedMultiplier: number;
  mapSeed: number;
  mapSize: number;
  protectionHours: number;
  rulesetVersion?: string;
}

/** Los mundos visibles los crea un Administrador. Los tests suministran sus propias semillas. */
export const DEV_WORLDS: WorldSeed[] = [];

/** Inserta mundos si no existen (idempotente por `slug`). */
export async function seedWorlds(
  db: Db,
  seeds: WorldSeed[] = DEV_WORLDS,
  now = new Date(),
): Promise<void> {
  for (const s of seeds) {
    await db
      .insert(worlds)
      .values({
        id: randomUUID(),
        slug: s.slug,
        name: s.name,
        status: 'OPEN',
        profile: s.profile,
        rulesetVersion: s.rulesetVersion ?? DEFAULT_RULESET_VERSION,
        speedMultiplier: s.speedMultiplier,
        mapSeed: s.mapSeed,
        mapSize: s.mapSize,
        protectionHours: s.protectionHours,
        opensAt: now,
      })
      .onConflictDoNothing({ target: worlds.slug });
    if (
      s.rulesetVersion &&
      getRuleset(s.rulesetVersion).territory &&
      !getRuleset(s.rulesetVersion).territory?.npcRegeneration &&
      s.mapSize <= 128
    ) {
      await db.transaction(async (tx) => {
        const [w] = await tx.select().from(worlds).where(eq(worlds.slug, s.slug)).for('update');
        if (!w) return;
        const r = getRuleset(w.rulesetVersion);
        for (let y = 1; y < w.mapSize - 1; y++)
          for (let x = 1; x < w.mapSize - 1; x++) {
            const terrain = terrainAt(w.mapSeed, w.mapSize, x, y, 'LAND');
            const oasis = terrain === 'OASIS',
              npc = !oasis && x % 8 === 4 && y % 8 === 4 && terrain !== 'MOUNTAIN';
            if (!oasis && !npc) continue;
            const [exists] = await tx
              .select()
              .from(villages)
              .where(and(eq(villages.worldId, w.id), eq(villages.x, x), eq(villages.y, y)));
            if (exists) continue;
            const id = randomUUID();
            await tx.insert(villages).values({
              id,
              worldId: w.id,
              kind: oasis ? 'OASIS' : 'NPC',
              name: oasis ? `Oasis salvaje ${x}·${y}` : `Aldea libre ${x}·${y}`,
              x,
              y,
              coastal: false,
              loyalty: npc ? 70 : 100,
            });
            if (r.fortifications && !oasis) {
              const layout = generateVillageLayout(r, {
                worldSeed: w.mapSeed,
                x,
                y,
                civilization: 'stone_wardens',
              });
              await tx.insert(villageLayouts).values({
                worldId: w.id,
                villageId: id,
                version: layout.version,
                seed: layout.seed,
                layout,
              });
              await tx.insert(wallSections).values(
                ([1, 2, 3] as const).map((precinct) => ({
                  worldId: w.id,
                  villageId: id,
                  precinct,
                  integrity: 1000,
                })),
              );
            }
            const buildings = oasis ? [] : r.startingBuildings;
            if (buildings.length)
              await tx.insert(villageBuildings).values(
                buildings.map((b) => ({
                  worldId: w.id,
                  villageId: id,
                  plot: b.plot,
                  type: b.type,
                  level: b.level,
                })),
              );
            const rates = computeRates(r, buildings, 0, w.speedMultiplier);
            await tx.insert(resourceAccounts).values({
              worldId: w.id,
              villageId: id,
              wood: 600000n,
              stone: 600000n,
              iron: 600000n,
              food: 600000n,
              woodRate: rates.wood,
              stoneRate: rates.stone,
              ironRate: rates.iron,
              foodRate: rates.food,
              capacity: capacityMilli(r, levelOf(buildings, 'warehouse')),
              lastSettledAt: now,
            });
            await tx.insert(troopStacks).values(
              oasis
                ? [
                    { worldId: w.id, villageId: id, unitType: 'wolf', quantity: 2 + ((x + y) % 5) },
                    { worldId: w.id, villageId: id, unitType: 'boar', quantity: 1 + (x % 3) },
                    { worldId: w.id, villageId: id, unitType: 'bear', quantity: y % 3 },
                  ]
                : [
                    {
                      worldId: w.id,
                      villageId: id,
                      unitType: 'militia',
                      quantity: 12 + ((x + y) % 10),
                    },
                    { worldId: w.id, villageId: id, unitType: 'spearman', quantity: 6 },
                  ],
            );
          }
      });
    }
  }
}
