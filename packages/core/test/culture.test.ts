import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  accounts,
  seedWorlds,
  cultureStreams,
  villageExpansions,
  celebrations,
  resourceLedger,
  villages,
} from '@reinos/db';
import { terrainAt } from '@reinos/game-rules';
import { CultureService, culturePoints, refreshCulture, expansionView } from '../src/culture.js';
import { AdministrationService } from '../src/administration.js';
import { TerritoryService } from '../src/territory.js';
import { loadWorld } from '../src/village-state.js';
import {
  createHarness,
  joinedPlayer,
  fixtureBuilding,
  fixtureResources,
  fixtureTroops,
  key,
  expectDomainError,
  type Harness,
} from './helpers.js';
const DAY = 86400000;
describe('cultura, cupos y celebraciones de una temporada nueva', () => {
  let h: Harness,
    p: Awaited<ReturnType<typeof joinedPlayer>>,
    q: Awaited<ReturnType<typeof joinedPlayer>>,
    service: CultureService;
  beforeEach(async () => {
    h = await createHarness();
    service = new CultureService(h.ctx);
    await seedWorlds(
      h.database.db,
      [
        {
          slug: 'culture',
          name: 'Cultura',
          profile: 'test',
          mapSize: 64,
          mapSeed: 20261105,
          speedMultiplier: 5,
          protectionHours: 0,
          rulesetVersion: 'frontier-alpha.4',
        },
      ],
      h.clock.now(),
    );
    p = await joinedPlayer(h, 'CultorUno', 'culture', 'stone_wardens');
    q = await joinedPlayer(h, 'CultorDos', 'culture', 'forest_kin');
  });
  afterEach(async () => h?.close());
  const points = () => culturePoints(h.database.db, p.worldId, p.accountId, h.clock.now());
  it('producción offline exacta y la mejora no genera cultura retroactiva', async () => {
    h.clock.advance(DAY);
    expect(await points()).toBe(10000n);
    const order = await h.commands.startConstruction(
      { accountId: p.accountId },
      p.worldId,
      p.villageId,
      { plot: 22, buildingType: 'sawmill' },
      key(),
    );
    h.clock.set(Date.parse(order.completesAt) + 1);
    expect((await h.worker().drain()).failed).toBe(0);
    const completion = Date.parse(order.completesAt),
      [row] = await h.database.db
        .select()
        .from(cultureStreams)
        .where(
          and(
            eq(cultureStreams.villageId, p.villageId),
            eq(cultureStreams.rateMilliPerDay, 10000n),
          ),
        );
    const start = row!.startsAt.getTime();
    h.clock.advance(DAY);
    expect(await points()).toBe((BigInt(completion - start) * 10000n) / BigInt(DAY) + 15000n);
    expect((await h.queries.villageView(p.accountId, p.worldId, p.villageId)).culture?.perDay).toBe(
      15,
    );
  });
  it('bloquea expansión sin cultura y reserva un único cupo ante fundaciones concurrentes', async () => {
    const svc = new TerritoryService(h.ctx),
      world = await loadWorld(h.database.db, p.worldId);
    await fixtureBuilding(h, p.worldId, p.villageId, 0, 'city_hall', 5);
    await fixtureBuilding(h, p.worldId, p.villageId, 1, 'rally_point', 1);
    await fixtureBuilding(h, p.worldId, p.villageId, 2, 'castle', 10);
    await fixtureResources(
      h,
      p.villageId,
      { wood: 5000, stone: 5000, iron: 5000, food: 5000 },
      10000,
    );
    await fixtureTroops(h, p.worldId, p.villageId, 'settler', 6);
    const occupied = await h.database.db
        .select()
        .from(villages)
        .where(eq(villages.worldId, p.worldId)),
      spots = [];
    for (let y = 0; y < 64 && spots.length < 2; y++)
      for (let x = 0; x < 64 && spots.length < 2; x++)
        if (
          terrainAt(world.mapSeed, 64, x, y, 'LAND') === 'PLAIN' &&
          !occupied.some((v) => v.x === x && v.y === y)
        )
          spots.push({ x, y });
    await expectDomainError(
      svc.found(
        { accountId: p.accountId },
        p.worldId,
        p.villageId,
        { ...spots[0]!, name: 'Colonia bloqueada' },
        key(),
      ),
      'REQUIREMENTS_NOT_MET',
    );
    // Cultura previa concedida solo mediante fixture en reinos_test.
    await h.database.db
      .update(cultureStreams)
      .set({ rateMilliPerDay: 100000000n, startsAt: new Date(h.clock.now().getTime() - DAY) })
      .where(eq(cultureStreams.villageId, p.villageId));
    const k = key(),
      body = { ...spots[0]!, name: 'Colonia cultural' };
    const results = await Promise.allSettled([
      svc.found({ accountId: p.accountId }, p.worldId, p.villageId, body, k),
      svc.found(
        { accountId: p.accountId },
        p.worldId,
        p.villageId,
        { ...spots[1]!, name: 'Otra colonia' },
        key(),
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const success = results.find((r) => r.status === 'fulfilled')!;
    if (success.status !== 'fulfilled') throw Error('sin orden');
    const stats = await expansionView(
      h.database.db,
      world,
      p.accountId,
      p.villageId,
      h.clock.now(),
    );
    expect(stats.pendingSlots).toBe(1);
    h.clock.set(Date.parse(success.value.arrivesAt) + 1);
    expect((await h.worker().drain()).failed).toBe(0);
    expect(
      await h.database.db
        .select()
        .from(villageExpansions)
        .where(eq(villageExpansions.worldId, p.worldId)),
    ).toHaveLength(1);
    expect(
      (await expansionView(h.database.db, world, p.accountId, p.villageId, h.clock.now()))
        .usedSlots,
    ).toBe(1);
  });
  it('dos workers y reintento entregan una fiesta y un débito, sin escalada de permisos', async () => {
    await fixtureBuilding(h, p.worldId, p.villageId, 41, 'town_hall', 1);
    await fixtureResources(
      h,
      p.villageId,
      { wood: 10000, stone: 10000, iron: 10000, food: 10000 },
      20000,
    );
    const idem = key(),
      orders = await Promise.all(
        [1, 2].map(() =>
          service.celebrate({ accountId: p.accountId }, p.worldId, p.villageId, idem),
        ),
      );
    expect(orders[0]).toEqual(orders[1]);
    await expectDomainError(
      service.celebrate({ accountId: q.accountId }, p.worldId, p.villageId, key()),
      'VILLAGE_NOT_FOUND',
    );
    await expectDomainError(
      service.celebrate({ accountId: p.accountId }, await h.worldId('test-a'), p.villageId, key()),
      'VILLAGE_NOT_FOUND',
    );
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.refId, orders[0]!.id)),
    ).toHaveLength(1);
    h.clock.set(Date.parse(orders[0]!.completesAt) + 1);
    await Promise.all([h.worker('culture-a').drain(), h.worker('culture-b').drain()]);
    expect((await h.database.db.select().from(celebrations))[0]?.status).toBe('COMPLETED');
    expect(await points()).toBeGreaterThanOrEqual(500000n);
    expect(await points()).toBeLessThan(503000n);
  });
  it('una conquista conserva la cultura anterior y hereda los cupos del origen', async () => {
    const world = await loadWorld(h.database.db, p.worldId);
    h.clock.advance(DAY);
    await h.database.db.transaction(async (tx) => {
      await tx.insert(villageExpansions).values({
        worldId: p.worldId,
        originVillageId: p.villageId,
        targetVillageId: q.villageId,
        createdAt: h.clock.now(),
      });
      await tx
        .update(villages)
        .set({ ownerAccountId: q.accountId })
        .where(eq(villages.id, p.villageId));
      await refreshCulture(tx, world, p.villageId, h.clock.now());
    });
    expect(await points()).toBe(10000n);
    h.clock.advance(DAY);
    expect(await points()).toBe(10000n);
    expect(await culturePoints(h.database.db, q.worldId, q.accountId, h.clock.now())).toBe(30000n);
    expect(
      (await expansionView(h.database.db, world, q.accountId, p.villageId, h.clock.now()))
        .usedSlots,
    ).toBe(1);
  });
  it('la pausa no produce cultura ni adelanta celebraciones', async () => {
    const admin = await joinedPlayer(h, 'AdminCultura', 'test-a');
    await h.database.db
      .update(accounts)
      .set({ role: 'ADMIN' })
      .where(eq(accounts.id, admin.accountId));
    const management = new AdministrationService(h.ctx);
    h.clock.advance(DAY);
    await management.worldAction(admin.accountId, p.worldId, 'PAUSE', key());
    h.clock.advance(DAY);
    expect(await points()).toBe(10000n);
    await management.worldAction(admin.accountId, p.worldId, 'RESUME', key());
    h.clock.advance(DAY);
    expect(await points()).toBe(20000n);
  });
});
