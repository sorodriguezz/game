import { randomUUID } from 'node:crypto';
import { DEFAULT_RULESET_VERSION, getRuleset } from '@reinos/game-config';
import type { Db } from './client.js';
import { worlds } from './schema.js';

export interface WorldSeed {
  slug: string;
  name: string;
  profile: 'test' | 'alpha' | 'seasonal';
  speedMultiplier: number;
  mapSeed: number;
  mapSize: number;
  protectionHours: number;
}

/** Mundos de desarrollo: uno "alfa" a velocidad 1 y uno de prueba acelerado para demostrar aislamiento. */
export const DEV_WORLDS: WorldSeed[] = [
  {
    slug: 'frontera-1',
    name: 'Frontera I',
    profile: 'alpha',
    speedMultiplier: 1,
    mapSeed: 20261103,
    mapSize: 128,
    protectionHours: getRuleset(DEFAULT_RULESET_VERSION).world.newPlayerProtectionHours,
  },
  {
    slug: 'prueba-rapida',
    name: 'Prueba Rápida ×50',
    profile: 'test',
    speedMultiplier: 50,
    mapSeed: 777,
    mapSize: 64,
    protectionHours: 0,
  },
];

/** Inserta mundos si no existen (idempotente por `slug`). */
export async function seedWorlds(db: Db, seeds: WorldSeed[] = DEV_WORLDS, now = new Date()): Promise<void> {
  for (const s of seeds) {
    await db
      .insert(worlds)
      .values({
        id: randomUUID(),
        slug: s.slug,
        name: s.name,
        status: 'OPEN',
        profile: s.profile,
        rulesetVersion: DEFAULT_RULESET_VERSION,
        speedMultiplier: s.speedMultiplier,
        mapSeed: s.mapSeed,
        mapSize: s.mapSize,
        protectionHours: s.protectionHours,
        opensAt: now,
      })
      .onConflictDoNothing({ target: worlds.slug });
  }
}
