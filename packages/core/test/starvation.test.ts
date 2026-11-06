import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { seedWorlds, garrisons, resourceAccounts, troopStacks, outbox } from '@reinos/db';
import { loadEconomy, saveEconomy, withRecomputedRates } from '../src/village-state.js';
import { getRuleset } from '@reinos/game-config';
import { settle } from '@reinos/game-rules';
import { createHarness, joinedPlayer, fixtureTroops, type Harness } from './helpers.js';
describe('hambre offline, prioridad y reintentos', () => {
  let h: Harness,
    p: Awaited<ReturnType<typeof joinedPlayer>>,
    ally: Awaited<ReturnType<typeof joinedPlayer>>;
  beforeAll(async () => {
    h = await createHarness();
    await seedWorlds(
      h.database.db,
      [
        {
          slug: 'hunger',
          name: 'Hambre',
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
    p = await joinedPlayer(h, 'Hungry', 'hunger', 'stone_wardens');
    ally = await joinedPlayer(h, 'Helper', 'hunger', 'forest_kin');
    await fixtureTroops(h, p.worldId, p.villageId, 'militia', 100);
    await h.database.db.insert(garrisons).values({
      worldId: p.worldId,
      villageId: p.villageId,
      originVillageId: ally.villageId,
      ownerAccountId: ally.accountId,
      unitType: 'militia',
      quantity: 4,
    });
    await h.database.db.transaction(async (tx) => {
      const state = await loadEconomy(tx, p.villageId);
      state.amounts.food = 0n;
      await saveEconomy(
        tx,
        p.villageId,
        await withRecomputedRates(tx, getRuleset('frontier-alpha.3'), p.villageId, state),
      );
    });
  });
  afterAll(async () => h?.close());
  it('una acción sin cereal no pospone el evento; dos workers aplican una sola baja', async () => {
    const [initial] = await h.database.db
      .select()
      .from(resourceAccounts)
      .where(eq(resourceAccounts.villageId, p.villageId));
    h.clock.advance(30000);
    await h.database.db.transaction(async (tx) => {
      await saveEconomy(
        tx,
        p.villageId,
        settle(await loadEconomy(tx, p.villageId), h.clock.now().getTime()),
      );
    });
    const [later] = await h.database.db
      .select()
      .from(resourceAccounts)
      .where(eq(resourceAccounts.villageId, p.villageId));
    expect(later?.starvationAt).toEqual(initial?.starvationAt);
    h.clock.advance(30001);
    await Promise.all([h.worker('a').drain(), h.worker('b').drain()]);
    expect(
      (await h.database.db.select().from(garrisons).where(eq(garrisons.villageId, p.villageId)))[0]
        ?.quantity,
    ).toBe(3);
    expect(
      await h.database.db.select().from(outbox).where(eq(outbox.type, 'TroopsStarved')),
    ).toHaveLength(1);
  });
  it('aplica los ciclos creados por un ciclo anterior antes de adelantar el reloj', async () => {
    h.clock.advance(240000);
    await h.commands.setDoctrine({ accountId: p.accountId }, p.worldId, p.villageId, {
      reservePercent: 0,
      retreatThresholdPercent: null,
    });
    expect(
      (await h.database.db.select().from(garrisons).where(eq(garrisons.villageId, p.villageId)))[0]
        ?.quantity,
    ).toBe(0);
    expect(
      (
        await h.database.db
          .select()
          .from(troopStacks)
          .where(and(eq(troopStacks.villageId, p.villageId), eq(troopStacks.unitType, 'militia')))
      )[0]?.quantity,
    ).toBe(99);
    expect(
      await h.database.db.select().from(outbox).where(eq(outbox.type, 'TroopsStarved')),
    ).toHaveLength(5);
  });
  it('una entrega de cereal invalida el evento antiguo sin otra baja', async () => {
    await h.database.db.transaction(async (tx) => {
      const state = settle(await loadEconomy(tx, p.villageId), h.clock.now().getTime());
      state.amounts.food = 500000n;
      await saveEconomy(tx, p.villageId, state);
    });
    h.clock.advance(60000);
    await h.worker().drain();
    expect(
      (
        await h.database.db
          .select()
          .from(troopStacks)
          .where(and(eq(troopStacks.villageId, p.villageId), eq(troopStacks.unitType, 'militia')))
      )[0]?.quantity,
    ).toBe(99);
    expect(
      await h.database.db.select().from(outbox).where(eq(outbox.type, 'TroopsStarved')),
    ).toHaveLength(5);
  });
});
