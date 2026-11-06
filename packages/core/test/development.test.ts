import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedWorlds, resourceLedger, villageResearch, developmentOrders } from '@reinos/db';
import { DevelopmentService } from '../src/development.js';
import {
  createHarness,
  joinedPlayer,
  key,
  fixtureBuilding,
  fixtureResources,
  expectDomainError,
  type Harness,
} from './helpers.js';
describe('desarrollo militar y demolición autoritativos', () => {
  let h: Harness, service: DevelopmentService, p: Awaited<ReturnType<typeof joinedPlayer>>;
  beforeAll(async () => {
    h = await createHarness();
    service = new DevelopmentService(h.ctx);
    await seedWorlds(
      h.database.db,
      [
        {
          slug: 'development',
          name: 'Desarrollo',
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
    p = await joinedPlayer(h, 'Investigador', 'development', 'stone_wardens');
    await fixtureBuilding(h, p.worldId, p.villageId, 3, 'academy', 20);
    await fixtureBuilding(h, p.worldId, p.villageId, 4, 'smithy', 20);
    await fixtureBuilding(h, p.worldId, p.villageId, 5, 'barracks', 5);
    await fixtureResources(
      h,
      p.villageId,
      { wood: 10000, stone: 10000, iron: 10000, food: 10000 },
      20000,
    );
  });
  afterAll(async () => h?.close());
  it('concurrente e idempotente: una sola orden y un solo débito', async () => {
    const idem = key(),
      responses = await Promise.all(
        [1, 2].map(() =>
          service.start(
            { accountId: p.accountId },
            p.worldId,
            p.villageId,
            { kind: 'UNLOCK', unitType: 'archer' },
            idem,
          ),
        ),
      );
    expect(responses[0]!.id).toBe(responses[1]!.id);
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.refId, responses[0]!.id)),
    ).toHaveLength(1);
    await expectDomainError(
      service.start(
        { accountId: p.accountId },
        p.worldId,
        p.villageId,
        { kind: 'UNLOCK', unitType: 'cavalry' },
        key(),
      ),
      'CONSTRUCTION_QUEUE_BUSY',
    );
    h.clock.advance(60001);
    await h.worker().drain();
    expect(
      (
        await h.database.db
          .select()
          .from(villageResearch)
          .where(eq(villageResearch.villageId, p.villageId))
      )[0],
    ).toMatchObject({ unitType: 'archer', kind: 'UNLOCK', level: 1 });
  });
  it('la herrería mejora ataque y no permite tocar una aldea de otro mundo', async () => {
    await expectDomainError(
      service.start(
        { accountId: p.accountId },
        await h.worldId('test-b'),
        p.villageId,
        { kind: 'WEAPON', unitType: 'militia' },
        key(),
      ),
      'VILLAGE_NOT_FOUND',
    );
    const o = await service.start(
      { accountId: p.accountId },
      p.worldId,
      p.villageId,
      { kind: 'WEAPON', unitType: 'militia' },
      key(),
    );
    h.clock.advance(Date.parse(o.completesAt) - h.clock.now().getTime() + 1);
    await Promise.all([h.worker('a').drain(), h.worker('b').drain()]);
    expect(
      await h.database.db.select().from(villageResearch).where(eq(villageResearch.kind, 'WEAPON')),
    ).toHaveLength(1);
  });
  it('demolición confirmada, centro protegido y sin restar otro nivel si recibió asedio', async () => {
    await expectDomainError(
      service.start(
        { accountId: p.accountId },
        p.worldId,
        p.villageId,
        { kind: 'DEMOLISH', plot: 0, confirmed: true },
        key(),
      ),
      'NOT_ELIGIBLE',
    );
    await fixtureBuilding(h, p.worldId, p.villageId, 6, 'warehouse', 3);
    const o = await service.start(
      { accountId: p.accountId },
      p.worldId,
      p.villageId,
      { kind: 'DEMOLISH', plot: 6, confirmed: true },
      key(),
    );
    await expectDomainError(
      h.commands.startConstruction(
        { accountId: p.accountId },
        p.worldId,
        p.villageId,
        { plot: 6, buildingType: 'warehouse' },
        key(),
      ),
      'CONSTRUCTION_QUEUE_BUSY',
    );
    await fixtureBuilding(h, p.worldId, p.villageId, 6, 'warehouse', 1);
    h.clock.advance(Date.parse(o.completesAt) - h.clock.now().getTime() + 1);
    await h.worker().drain();
    expect(
      (await h.queries.villageView(p.accountId, p.worldId, p.villageId)).buildings.find(
        (b) => b.plot === 6,
      )?.level,
    ).toBe(1);
    expect(
      (
        await h.database.db.select().from(developmentOrders).where(eq(developmentOrders.id, o.id))
      )[0]?.status,
    ).toBe('COMPLETED');
  });
});
