import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  seedWorlds,
  tradeTrips,
  tradeOffers,
  tradeRoutes,
  resourceLedger,
  villages,
  worlds,
  accounts,
} from '@reinos/db';
import { TradeService } from '../src/trade.js';
import { AdministrationService } from '../src/administration.js';
import {
  createHarness,
  joinedPlayer,
  fixtureBuilding,
  fixtureResources,
  key,
  expectDomainError,
  type Harness,
} from './helpers.js';
const cargo = { wood: 300, stone: 0, iron: 0, food: 0 };
describe('comercio durable sin duplicar cargas ni mercaderes', () => {
  let h: Harness,
    svc: TradeService,
    p: Awaited<ReturnType<typeof joinedPlayer>>,
    q: Awaited<ReturnType<typeof joinedPlayer>>,
    third: Awaited<ReturnType<typeof joinedPlayer>>,
    target: { x: number; y: number };
  beforeEach(async () => {
    h = await createHarness();
    svc = new TradeService(h.ctx);
    await seedWorlds(
      h.database.db,
      [
        {
          slug: 'trade',
          name: 'Comercio',
          profile: 'test',
          speedMultiplier: 5,
          mapSeed: 20261105,
          mapSize: 64,
          protectionHours: 0,
          rulesetVersion: 'frontier-alpha.4',
        },
      ],
      h.clock.now(),
    );
    p = await joinedPlayer(h, 'MercaderUno', 'trade', 'stone_wardens');
    q = await joinedPlayer(h, 'MercaderDos', 'trade', 'forest_kin');
    third = await joinedPlayer(h, 'MercaderTres', 'trade', 'steppe_clans');
    await h.database.db
      .update(worlds)
      .set({ movementSpeedMultiplier: 50 })
      .where(eq(worlds.id, p.worldId));
    for (const a of [p, q, third]) {
      await fixtureBuilding(h, a.worldId, a.villageId, 3, 'market', 1);
      await fixtureResources(
        h,
        a.villageId,
        { wood: 5000, stone: 5000, iron: 5000, food: 5000 },
        10000,
      );
    }
    [target] = (await h.database.db
      .select({ x: villages.x, y: villages.y })
      .from(villages)
      .where(eq(villages.id, q.villageId))) as [{ x: number; y: number }];
  });
  afterEach(async () => h?.close());
  const send = (idem = key()) =>
    svc.send({ accountId: p.accountId }, p.worldId, p.villageId, { ...target, cargo }, idem);
  const complete = async (time: string) => {
    h.clock.set(Date.parse(time) + 1);
    expect((await h.worker().drain()).failed).toBe(0);
  };
  it('reserva mercaderes hasta volver; reintento y dos salidas simultáneas no gastan doble', async () => {
    const idem = key(),
      orders = await Promise.all([send(idem), send(idem)]);
    expect(orders[0]).toEqual(orders[1]);
    expect((await svc.view(p.accountId, p.worldId, p.villageId)).merchants.available).toBe(0);
    await expectDomainError(send(), 'ALREADY_COMMITTED');
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.reason, 'TRADE_OUT')),
    ).toHaveLength(1);
    await complete(orders[0]!.arrivesAt);
    expect((await svc.view(p.accountId, p.worldId, p.villageId)).merchants.available).toBe(0);
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.reason, 'TRADE_IN')),
    ).toHaveLength(1);
    await complete(orders[0]!.returnsAt);
    expect((await svc.view(p.accountId, p.worldId, p.villageId)).merchants.available).toBe(1);
    expect((await svc.view(p.accountId, p.worldId, p.villageId)).history[0]).toMatchObject({
      delivery: 'DELIVERED',
      cargo,
    });
  });
  it('dos aceptaciones del último lote crean un solo intercambio de dos viajes', async () => {
    const offer = await svc.offer(
      { accountId: p.accountId },
      p.worldId,
      p.villageId,
      { give: cargo, want: { wood: 0, stone: 200, iron: 0, food: 0 }, lots: 1 },
      key(),
    );
    const accept = () =>
      svc.accept(
        { accountId: q.accountId },
        q.worldId,
        q.villageId,
        { offerId: offer.id, lots: 1 },
        key(),
      );
    const results = await Promise.allSettled([accept(), accept()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await h.database.db.select().from(tradeTrips)).toHaveLength(2);
    expect((await h.database.db.select().from(tradeOffers))[0]).toMatchObject({
      status: 'FILLED',
      lotsRemaining: 0,
    });
    const [success] = results.filter((r) => r.status === 'fulfilled');
    if (success?.status !== 'fulfilled') throw Error('sin intercambio');
    await complete(
      new Date(
        Math.max(
          Date.parse(success.value.sent.returnsAt),
          Date.parse(success.value.received.returnsAt),
        ),
      ).toISOString(),
    );
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.reason, 'TRADE_IN')),
    ).toHaveLength(2);
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.reason, 'TRADE_ESCROW')),
    ).toHaveLength(1);
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.reason, 'TRADE_OUT')),
    ).toHaveLength(1);
  });
  it('dos órdenes distintas compiten por un solo mercader sin doble gasto', async () => {
    const results = await Promise.allSettled([send(), send()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await h.database.db.select().from(tradeTrips)).toHaveLength(1);
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.reason, 'TRADE_OUT')),
    ).toHaveLength(1);
  });
  it('un intercambio fallido revierte el débito y los mercaderes de ambas partes', async () => {
    const offer = await svc.offer(
      { accountId: p.accountId },
      p.worldId,
      p.villageId,
      { give: cargo, want: cargo, lots: 1 },
      key(),
    );
    await send();
    await expectDomainError(
      svc.accept(
        { accountId: q.accountId },
        q.worldId,
        q.villageId,
        { offerId: offer.id, lots: 1 },
        key(),
      ),
      'ALREADY_COMMITTED',
    );
    expect((await svc.view(q.accountId, q.worldId, q.villageId)).merchants.available).toBe(1);
    expect(await h.database.db.select().from(tradeTrips)).toHaveLength(1);
    expect(
      (await h.queries.villageView(q.accountId, q.worldId, q.villageId)).resources.amountsMilli
        .wood,
    ).toBe(5000000);
    expect((await h.database.db.select().from(tradeOffers))[0]?.lotsRemaining).toBe(1);
  });
  it('cancelar devuelve solo la custodia no vendida, una sola vez', async () => {
    const offer = await svc.offer(
      { accountId: p.accountId },
      p.worldId,
      p.villageId,
      { give: cargo, want: cargo, lots: 2 },
      key(),
    );
    await svc.cancelOffer({ accountId: p.accountId }, p.worldId, p.villageId, offer.id, key());
    expect(
      await svc.cancelOffer({ accountId: p.accountId }, p.worldId, p.villageId, offer.id, key()),
    ).toMatchObject({ cancelled: false });
    const refunds = await h.database.db
      .select()
      .from(resourceLedger)
      .where(eq(resourceLedger.reason, 'TRADE_REFUND'));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.wood).toBe(600000n);
    expect(
      (await h.queries.villageView(p.accountId, p.worldId, p.villageId)).resources.amountsMilli
        .wood,
    ).toBe(5000000);
  });
  it('aislamiento, saldo no negativo y ningún gasto al rechazar una oferta', async () => {
    await expectDomainError(
      svc.send({ accountId: q.accountId }, p.worldId, p.villageId, { ...target, cargo }, key()),
      'VILLAGE_NOT_FOUND',
    );
    await expectDomainError(
      svc.send(
        { accountId: p.accountId },
        await h.worldId('test-b'),
        p.villageId,
        { ...target, cargo },
        key(),
      ),
      'VILLAGE_NOT_FOUND',
    );
    await fixtureResources(h, p.villageId, { wood: 5, stone: 5, iron: 5, food: 5 }, 10000);
    await expectDomainError(send(), 'INSUFFICIENT_RESOURCES');
    expect(await h.database.db.select().from(tradeTrips)).toHaveLength(0);
    expect((await svc.view(p.accountId, p.worldId, p.villageId)).merchants.available).toBe(1);
  });
  it('cambio de dueño devuelve el cargamento y dos workers lo entregan una vez', async () => {
    const order = await send();
    await h.database.db
      .update(villages)
      .set({ ownerAccountId: third.accountId })
      .where(eq(villages.id, q.villageId));
    await complete(order.arrivesAt);
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.reason, 'TRADE_IN')),
    ).toHaveLength(0);
    h.clock.set(Date.parse(order.returnsAt) + 1);
    await Promise.all([h.worker('trade-a').drain(), h.worker('trade-b').drain()]);
    expect((await h.database.db.select().from(tradeTrips))[0]?.status).toBe('COMPLETED');
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.reason, 'TRADE_REFUND')),
    ).toHaveLength(1);
  });
  it('rutas idempotentes se pausan con el mundo y se desactivan al cambiar el dueño', async () => {
    await fixtureBuilding(h, p.worldId, p.villageId, 4, 'trade_office', 1);
    const idem = key(),
      req = { ...target, cargo, everySeconds: 3600 },
      route = await svc.route({ accountId: p.accountId }, p.worldId, p.villageId, req, idem);
    expect(await svc.route({ accountId: p.accountId }, p.worldId, p.villageId, req, idem)).toEqual(
      route,
    );
    const admin = await joinedPlayer(h, 'AdminComercio', 'test-a');
    await h.database.db
      .update(accounts)
      .set({ role: 'ADMIN' })
      .where(eq(accounts.id, admin.accountId));
    const management = new AdministrationService(h.ctx);
    await management.worldAction(admin.accountId, p.worldId, 'PAUSE', key());
    h.clock.advance(3600000);
    await management.worldAction(admin.accountId, p.worldId, 'RESUME', key());
    const [shifted] = await h.database.db.select().from(tradeRoutes);
    expect(shifted!.nextAt.getTime()).toBe(Date.parse(route.nextAt) + 3600000);
    await complete(shifted!.nextAt.toISOString());
    expect(await h.database.db.select().from(tradeTrips)).toHaveLength(1);
    const [next] = await h.database.db.select().from(tradeRoutes);
    expect(next!.lastResult).toBe('SENT');
    await h.database.db
      .update(villages)
      .set({ ownerAccountId: third.accountId })
      .where(eq(villages.id, q.villageId));
    await complete(next!.nextAt.toISOString());
    expect((await h.database.db.select().from(tradeRoutes))[0]?.enabled).toBe(false);
  });
  it('si se conquista también el origen, el retorno viaja a otra aldea del remitente', async () => {
    await h.database.db
      .update(villages)
      .set({ ownerAccountId: p.accountId })
      .where(eq(villages.id, third.villageId));
    const order = await send();
    await h.database.db
      .update(villages)
      .set({ ownerAccountId: q.accountId })
      .where(eq(villages.id, p.villageId));
    await h.database.db
      .update(villages)
      .set({ ownerAccountId: third.accountId })
      .where(eq(villages.id, q.villageId));
    await complete(order.returnsAt);
    const [rerouted] = await h.database.db.select().from(tradeTrips);
    expect(rerouted).toMatchObject({ originVillageId: third.villageId, status: 'RETURNING' });
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.reason, 'TRADE_REFUND')),
    ).toHaveLength(0);
    await complete(rerouted!.returnsAt.toISOString());
    const [refund] = await h.database.db
      .select()
      .from(resourceLedger)
      .where(eq(resourceLedger.reason, 'TRADE_REFUND'));
    expect(refund).toMatchObject({ villageId: third.villageId, wood: 300000n });
  });
  it('la entrega respeta la capacidad y contabiliza solo lo que realmente se recibió', async () => {
    await fixtureResources(h, q.villageId, { wood: 499, stone: 0, iron: 0, food: 0 }, 500);
    const order = await send();
    await complete(order.arrivesAt);
    const [delivery] = await h.database.db
      .select()
      .from(resourceLedger)
      .where(eq(resourceLedger.reason, 'TRADE_IN'));
    expect(delivery!.wood).toBeGreaterThanOrEqual(0n);
    expect(delivery!.wood).toBeLessThanOrEqual(1000n);
    expect(
      (await h.queries.villageView(q.accountId, q.worldId, q.villageId)).resources.amountsMilli
        .wood,
    ).toBe(500000);
  });
});
