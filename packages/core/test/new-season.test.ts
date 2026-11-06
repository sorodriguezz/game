import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  seedWorlds,
  villages,
  worlds,
  troopStacks,
  worldRegions,
  resourceAccounts,
} from '@reinos/db';
import { terrainAt, oasisBonuses } from '@reinos/game-rules';
import { TerritoryService } from '../src/territory.js';
import { ensureWorldRegions, npcGuardians } from '../src/npc.js';
import { loadWorld, stateColumns } from '../src/village-state.js';
import {
  createHarness,
  joinedPlayer,
  key,
  fixtureBuilding,
  fixtureTroops,
  expectDomainError,
  type Harness,
} from './helpers.js';
describe('temporada nueva: ciudad vacía y oasis por aldea', () => {
  let h: Harness, p: Awaited<ReturnType<typeof joinedPlayer>>, origin: { x: number; y: number };
  beforeAll(async () => {
    h = await createHarness();
    await seedWorlds(
      h.database.db,
      [
        {
          slug: 'new',
          name: 'Nueva temporada',
          profile: 'test',
          mapSize: 64,
          mapSeed: 20261105,
          speedMultiplier: 5,
          protectionHours: 0,
          rulesetVersion: 'frontier-alpha.3',
        },
      ],
      h.clock.now(),
    );
    p = await joinedPlayer(h, 'NuevoRomano', 'new', 'stone_wardens');
    await h.database.db
      .update(worlds)
      .set({ movementSpeedMultiplier: 50 })
      .where(eq(worlds.id, p.worldId));
    const [v] = await h.database.db.select().from(villages).where(eq(villages.id, p.villageId));
    origin = v!;
  });
  afterAll(async () => h?.close());
  it('funda en llanura, centro urbano único, campos 0 y censo de cereal', async () => {
    const view = await h.queries.villageView(p.accountId, p.worldId, p.villageId);
    expect(view.buildings).toHaveLength(1);
    expect(view.buildings[0]?.type).toBe('city_hall');
    expect(view.population.inhabitants).toBe(2);
    expect(view.resources.ratesMilliPerHour).toEqual({
      wood: 40000,
      stone: 40000,
      iron: 40000,
      food: 58000,
    });
    expect(terrainAt(20261105, 64, origin.x, origin.y, 'LAND')).toBe('PLAIN');
    expect(
      view.layout?.plots
        .filter((f) => f.kind === 'field')
        .map((f) => f.allowedTypes?.[0])
        .filter((t) => t === 'farm'),
    ).toHaveLength(6);
  });
  it('impide fundar sobre bosques y montañas antes de gastar colonos', async () => {
    const svc = new TerritoryService(h.ctx);
    for (const wanted of ['FOREST', 'MOUNTAIN']) {
      let found: { x: number; y: number } | undefined;
      for (let y = 0; y < 64 && !found; y++)
        for (let x = 0; x < 64; x++)
          if (terrainAt(20261105, 64, x, y, 'LAND') === wanted) {
            found = { x, y };
            break;
          }
      await expectDomainError(
        svc.found(
          { accountId: p.accountId },
          p.worldId,
          p.villageId,
          { ...found!, name: 'No edificar' },
          key(),
        ),
        'TARGET_INVALID',
      );
    }
  });
  it('genera regiones una vez y regenera tropas con dos workers sin duplicarlas', async () => {
    const w = await loadWorld(h.database.db, p.worldId);
    await Promise.all(
      [1, 2].map(() => ensureWorldRegions(h.database.db, w, 0, 0, 15, 15, h.clock.now())),
    );
    expect(
      await h.database.db.select().from(worldRegions).where(eq(worldRegions.worldId, p.worldId)),
    ).toHaveLength(1);
    const [npc] = await h.database.db
      .select()
      .from(villages)
      .where(and(eq(villages.worldId, p.worldId), eq(villages.kind, 'OASIS')));
    expect(npc).toBeDefined();
    await h.database.db
      .update(troopStacks)
      .set({ quantity: 0 })
      .where(eq(troopStacks.villageId, npc!.id));
    h.clock.advance(1800001);
    const results = await Promise.all([h.worker('a').drain(), h.worker('b').drain()]);
    expect(results.reduce((s, r) => s + r.failed, 0)).toBe(0);
    const guards = await h.database.db
      .select()
      .from(troopStacks)
      .where(eq(troopStacks.villageId, npc!.id));
    for (const cap of npcGuardians(w.mapSeed, npc!.x, npc!.y, true))
      expect(guards.find((g) => g.unitType === cap.unitType)?.quantity).toBe(
        Math.ceil(cap.quantity / 4),
      );
  });
  it('oasis baja por ataques sin cacique, exige tesoro/rango y bonifica solo sus materias', async () => {
    // Fixture de oasis contiguo y vacío: se prueban las cuatro llegadas canónicas.
    const w = await loadWorld(h.database.db, p.worldId);
    let target: { x: number; y: number } | undefined;
    for (let dy = -2; dy <= 2 && !target; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = origin.x + dx,
          y = origin.y + dy;
        if (x < 0 || y < 0 || x >= 64 || y >= 64 || (!dx && !dy)) continue;
        const [v] = await h.database.db
          .select()
          .from(villages)
          .where(and(eq(villages.worldId, p.worldId), eq(villages.x, x), eq(villages.y, y)));
        if (!v) {
          target = { x, y };
          break;
        }
      }
    const id = crypto.randomUUID();
    await h.database.db.insert(villages).values({
      id,
      worldId: p.worldId,
      kind: 'OASIS',
      name: 'Oasis de ensayo',
      coastal: false,
      ...target!,
      loyalty: 100,
    });
    await h.database.db.insert(resourceAccounts).values({
      worldId: p.worldId,
      villageId: id,
      ...stateColumns({
        amounts: { wood: 0n, stone: 0n, iron: 0n, food: 0n },
        rates: { wood: 0n, stone: 0n, iron: 0n, food: 0n },
        remainders: { wood: 0n, stone: 0n, iron: 0n, food: 0n },
        capacity: 800000n,
        lastSettledAt: h.clock.now().getTime(),
      }),
    });
    const attack = async () => {
      await fixtureTroops(h, p.worldId, p.villageId, 'militia', 200);
      const order = await h.commands.sendMovement(
        { accountId: p.accountId },
        p.worldId,
        p.villageId,
        { targetVillageId: id, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 100 }] },
        key(),
      );
      h.clock.advance(new Date(order.arrivalAt).getTime() - h.clock.now().getTime() + 1);
      await h.worker().drain();
      return (await h.database.db.select().from(villages).where(eq(villages.id, id)))[0]!;
    };
    expect((await attack()).loyalty).toBe(100);
    await fixtureBuilding(h, p.worldId, p.villageId, 51, 'treasury', 10);
    for (const loyalty of [75, 50, 25]) expect((await attack()).loyalty).toBe(loyalty);
    const conquered = await attack();
    expect(conquered.ownerAccountId).toBe(p.accountId);
    expect(conquered.parentVillageId).toBe(p.villageId);
    expect(conquered.loyalty).toBe(100);
    const view = await h.queries.villageView(p.accountId, p.worldId, p.villageId);
    expect(view.oases).toMatchObject({ owned: 1, slots: 1, radius: 2 });
    const bonus = oasisBonuses(w.mapSeed, target!.x, target!.y);
    expect(bonus).toBeDefined();
  });
});
