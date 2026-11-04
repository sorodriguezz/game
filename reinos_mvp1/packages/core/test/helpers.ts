import { and, eq, sql } from 'drizzle-orm';
import {
  createDatabase,
  resourceAccounts,
  runMigrations,
  seedWorlds,
  troopStacks,
  villageBuildings,
  worlds,
  type Database,
  type WorldSeed,
} from '@reinos/db';
import type { BuildingType, CivilizationId, UnitType } from '@reinos/game-config';
import { getRuleset, DEFAULT_RULESET_VERSION } from '@reinos/game-config';
import { MILLI, settle } from '@reinos/game-rules';
import {
  AuthService,
  EventWorker,
  FakeClock,
  GameCommands,
  GameQueries,
  loadEconomy,
  silentLogger,
  type CoreContext,
} from '../src/index.js';
import { randomUUID } from 'node:crypto';

export const ruleset = getRuleset(DEFAULT_RULESET_VERSION);

export const TEST_WORLDS: WorldSeed[] = [
  { slug: 'test-a', name: 'Test A', profile: 'test', speedMultiplier: 10, mapSeed: 777, mapSize: 64, protectionHours: 0 },
  { slug: 'test-b', name: 'Test B', profile: 'test', speedMultiplier: 10, mapSeed: 778, mapSize: 64, protectionHours: 0 },
  { slug: 'test-protected', name: 'Test P', profile: 'alpha', speedMultiplier: 1, mapSeed: 779, mapSize: 64, protectionHours: 72 },
];

export interface Harness {
  database: Database;
  clock: FakeClock;
  ctx: CoreContext;
  auth: AuthService;
  commands: GameCommands;
  queries: GameQueries;
  worker: (id?: string, opts?: { leaseMs?: number }) => EventWorker;
  worldId: (slug: string) => Promise<string>;
  close: () => Promise<void>;
}

let migrated = false;

export async function createHarness(): Promise<Harness> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL requerida para tests de integración');
  const database = createDatabase(url, { max: 12, applicationName: 'reinos-test' });
  if (!migrated) {
    await runMigrations(database.db);
    migrated = true;
  }
  await database.db.execute(sql`truncate table worlds, accounts restart identity cascade`);
  const clock = new FakeClock();
  await seedWorlds(database.db, TEST_WORLDS, clock.now());
  const ctx: CoreContext = { db: database.db, clock, log: silentLogger, faults: {} };
  return {
    database,
    clock,
    ctx,
    auth: new AuthService(ctx),
    commands: new GameCommands(ctx),
    queries: new GameQueries(ctx),
    worker: (id = 'w1', opts = {}) => new EventWorker(ctx, { workerId: id, pollMs: 1, ...opts }),
    worldId: async (slug) => {
      const [w] = await database.db.select({ id: worlds.id }).from(worlds).where(eq(worlds.slug, slug));
      return w!.id;
    },
    close: () => database.close(),
  };
}

export const key = () => randomUUID();

export async function newPlayer(h: Harness, name: string): Promise<string> {
  const s = await h.auth.register({ email: `${name.toLowerCase()}@example.test`, displayName: name, password: 'contraseña-segura-123' });
  return s.account.id;
}

export async function joinedPlayer(
  h: Harness,
  name: string,
  worldSlug: string,
  civilization: CivilizationId = 'imperial_crown',
): Promise<{ accountId: string; worldId: string; villageId: string }> {
  const accountId = await newPlayer(h, name);
  const worldId = await h.worldId(worldSlug);
  const res = await h.commands.joinWorld({ accountId }, worldId, { civilization, villageName: `Aldea ${name}` }, key());
  return { accountId, worldId, villageId: res.villageId };
}

// ---- Fixtures directas en BD (solo tests: preparan escenarios sin esperar colas) ----

export async function fixtureBuilding(h: Harness, worldId: string, villageId: string, plot: number, type: BuildingType, level: number) {
  await h.database.db
    .insert(villageBuildings)
    .values({ worldId, villageId, plot, type, level })
    .onConflictDoUpdate({ target: [villageBuildings.villageId, villageBuildings.plot], set: { type, level } });
}

export async function fixtureTroops(h: Harness, worldId: string, villageId: string, unitType: UnitType, quantity: number) {
  await h.database.db
    .insert(troopStacks)
    .values({ worldId, villageId, unitType, quantity })
    .onConflictDoUpdate({ target: [troopStacks.villageId, troopStacks.unitType], set: { quantity } });
}

/** Fija recursos (unidades enteras) liquidando primero hasta ahora. */
export async function fixtureResources(h: Harness, villageId: string, units: { wood: number; stone: number; iron: number; food: number }, capacity?: number) {
  const s = settle(await loadEconomy(h.database.db, villageId), h.clock.now().getTime());
  await h.database.db
    .update(resourceAccounts)
    .set({
      wood: BigInt(units.wood) * MILLI,
      stone: BigInt(units.stone) * MILLI,
      iron: BigInt(units.iron) * MILLI,
      food: BigInt(units.food) * MILLI,
      woodRem: 0n,
      stoneRem: 0n,
      ironRem: 0n,
      foodRem: 0n,
      ...(capacity !== undefined ? { capacity: BigInt(capacity) * MILLI } : {}),
      lastSettledAt: new Date(s.lastSettledAt),
    })
    .where(eq(resourceAccounts.villageId, villageId));
}

/** Pone a cero todas las tasas (para aislar efectos en los tests de saldo). */
export async function fixtureZeroRates(h: Harness, villageId: string) {
  await h.database.db
    .update(resourceAccounts)
    .set({ woodRate: 0n, stoneRate: 0n, ironRate: 0n, foodRate: 0n })
    .where(and(eq(resourceAccounts.villageId, villageId)));
}

export async function wholeResources(h: Harness, villageId: string) {
  const s = settle(await loadEconomy(h.database.db, villageId), h.clock.now().getTime());
  return {
    wood: Number(s.amounts.wood / MILLI),
    stone: Number(s.amounts.stone / MILLI),
    iron: Number(s.amounts.iron / MILLI),
    food: Number(s.amounts.food / MILLI),
  };
}

export async function troopsOf(h: Harness, villageId: string): Promise<Record<string, number>> {
  const rows = await h.database.db.select().from(troopStacks).where(eq(troopStacks.villageId, villageId));
  return Object.fromEntries(rows.filter((r) => r.quantity > 0).map((r) => [r.unitType, r.quantity]));
}

export async function expectDomainError(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c !== code) throw new Error(`Se esperaba ${code} y llegó ${c ?? String(e)}`);
    return;
  }
  throw new Error(`Se esperaba error ${code} y la operación tuvo éxito`);
}
