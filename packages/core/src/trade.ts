import { and, eq, or, desc, sql } from 'drizzle-orm';
import {
  tradeOffers,
  tradeTrips,
  tradeRoutes,
  villages,
  worldPlayers,
  worlds,
  accounts,
  outbox,
  type Tx,
  type DbOrTx,
} from '@reinos/db';
import {
  tradeSendSchema,
  tradeOfferSchema,
  tradeAcceptSchema,
  tradeRouteSchema,
  type TradeMarketView,
  type TradeSendRequest,
  type TradeOfferRequest,
  type TradeAcceptRequest,
  type TradeRouteRequest,
  type TradeTripView,
} from '@reinos/contracts';
import { type ResourceBundle, type CivilizationId } from '@reinos/game-config';
import {
  merchantProfile,
  merchantsNeeded,
  levelOf,
  bundleToMilli,
  canAfford,
  debit,
  credit,
  settle,
  distanceMilli,
  travelSeconds,
  type ResourceState,
} from '@reinos/game-rules';
import { requirePlayer } from './access.js';
import { err, DomainError, type CoreContext } from './context.js';
import {
  loadWorld,
  loadBuildings,
  loadEconomy,
  saveEconomy,
  writeLedger,
  rulesetOf,
  militarySpeedOf,
  negate,
  type WorldRow,
  type VillageRow,
} from './village-state.js';
import { newId, iso, addSeconds } from './util.js';
import { scheduleEvent, type EventHandler } from './events.js';
import { runIdempotent, assertIdempotencyKey } from './idempotency.js';
import type { Actor } from './commands.js';
const scale = (cargo: ResourceBundle, n: number): ResourceBundle => ({
  wood: cargo.wood * n,
  stone: cargo.stone * n,
  iron: cargo.iron * n,
  food: cargo.food * n,
});
const empty = (): ResourceBundle => ({ wood: 0, stone: 0, iron: 0, food: 0 });
async function merchantState(db: DbOrTx, world: WorldRow, village: VillageRow) {
  const r = rulesetOf(world);
  if (!r.trade) throw err.conflict('FEATURE_DISABLED', 'Este mundo no usa comercio');
  const [member] = await db
    .select()
    .from(worldPlayers)
    .where(
      and(eq(worldPlayers.worldId, world.id), eq(worldPlayers.accountId, village.ownerAccountId!)),
    );
  if (!member) throw err.conflict('TARGET_INVALID', 'La aldea no tiene un jugador activo');
  const buildings = await loadBuildings(db, village.id),
    profile = merchantProfile(
      r,
      member.civilization as CivilizationId,
      levelOf(buildings, 'market'),
      levelOf(buildings, 'trade_office'),
    );
  const busy = await db.execute(
    sql`select coalesce(sum(merchants),0)::int as n from trade_trips where world_id=${world.id} and origin_village_id=${village.id} and account_id=${village.ownerAccountId} and status<>'COMPLETED'`,
  );
  return { ...profile, available: Math.max(0, profile.total - Number(busy.rows[0]!.n)) };
}
async function destination(
  tx: Tx,
  world: WorldRow,
  originId: string,
  point: { x: number; y: number },
) {
  const [v] = await tx
    .select()
    .from(villages)
    .where(
      and(
        eq(villages.worldId, world.id),
        eq(villages.x, point.x),
        eq(villages.y, point.y),
        eq(villages.kind, 'PLAYER'),
      ),
    );
  if (!v || v.id === originId || !v.ownerAccountId)
    throw err.conflict('TARGET_INVALID', 'Selecciona otra aldea de jugador en este mundo');
  return v;
}
async function dispatch(
  tx: Tx,
  world: WorldRow,
  origin: VillageRow,
  target: VillageRow,
  cargo: ResourceBundle,
  at: Date,
  state: ResourceState,
  escrow = false,
) {
  const profile = await merchantState(tx, world, origin);
  if (!profile.total) throw err.conflict('REQUIREMENTS_NOT_MET', 'Construye un Mercado');
  const merchants = merchantsNeeded(cargo, profile.capacity);
  if (merchants < 1 || merchants > profile.available)
    throw err.conflict('ALREADY_COMMITTED', 'No hay suficientes mercaderes libres', {
      needed: merchants,
      available: profile.available,
    });
  const cost = bundleToMilli(cargo);
  if (!escrow && !canAfford(state, cost))
    throw err.conflict('INSUFFICIENT_RESOURCES', 'Recursos insuficientes');
  const id = newId(),
    seconds = travelSeconds(distanceMilli(origin, target), profile.speed, militarySpeedOf(world)),
    arrivesAt = addSeconds(at, seconds),
    returnsAt = addSeconds(arrivesAt, seconds);
  if (!escrow) {
    await saveEconomy(tx, origin.id, debit(state, cost));
    await writeLedger(tx, {
      worldId: world.id,
      villageId: origin.id,
      reason: 'TRADE_OUT',
      refId: id,
      deltaMilli: negate(cost),
      at,
    });
  }
  await tx.insert(tradeTrips).values({
    id,
    worldId: world.id,
    originVillageId: origin.id,
    targetVillageId: target.id,
    accountId: origin.ownerAccountId!,
    recipientAccountId: target.ownerAccountId!,
    cargo,
    merchants,
    transitSeconds: seconds,
    departedAt: at,
    arrivesAt,
    returnsAt,
  });
  await scheduleEvent(tx, {
    worldId: world.id,
    villageId: target.id,
    secondaryVillageId: origin.id,
    type: 'TRADE_ARRIVAL',
    dueAt: arrivesAt,
    dedupeKey: `trade-arrive:${id}`,
    payload: { tripId: id },
  });
  return { id, arrivesAt: iso(arrivesAt), returnsAt: iso(returnsAt), merchants };
}
async function receive(
  tx: Tx,
  worldId: string,
  villageId: string,
  cargo: ResourceBundle,
  refId: string,
  at: Date,
  reason: 'TRADE_IN' | 'TRADE_REFUND',
) {
  const before = settle(await loadEconomy(tx, villageId), at.getTime()),
    result = credit(before, bundleToMilli(cargo));
  await saveEconomy(tx, villageId, result.state);
  await writeLedger(tx, { worldId, villageId, refId, reason, deltaMilli: result.credited, at });
  const lost = Object.fromEntries(
    Object.entries(bundleToMilli(cargo)).map(([k, v]) => [
      k,
      String(v - result.credited[k as keyof ResourceBundle]),
    ]),
  );
  await tx.insert(outbox).values({
    worldId,
    type: 'TradeReceived',
    payload: {
      villageId,
      refId,
      cargo,
      creditedMilli: Object.fromEntries(
        Object.entries(result.credited).map(([k, v]) => [k, String(v)]),
      ),
      lostMilli: lost,
    },
  });
}
export class TradeService {
  constructor(private readonly ctx: CoreContext) {}
  private async command<T>(
    actor: Actor,
    worldId: string,
    villageId: string,
    name: string,
    key: string | undefined,
    input: unknown,
    run: (
      tx: Tx,
      p: Awaited<ReturnType<(typeof import('./commands.js'))['prepareVillage']>>,
    ) => Promise<T>,
  ): Promise<T> {
    const idem = assertIdempotencyKey(key);
    return this.ctx.db.transaction(
      async (tx) =>
        (
          await runIdempotent(
            tx,
            {
              accountId: actor.accountId,
              worldId,
              command: `trade:${name}:${villageId}`,
              key: idem,
            },
            input,
            async () => {
              await tx.select().from(worlds).where(eq(worlds.id, worldId)).for('no key update');
              const { prepareVillage } = await import('./commands.js'),
                prepared = await prepareVillage(tx, this.ctx, actor, worldId, villageId);
              if (!rulesetOf(prepared.world).trade)
                throw err.conflict('FEATURE_DISABLED', 'Este mundo no usa comercio');
              return run(tx, prepared);
            },
          )
        ).response,
    );
  }
  async view(accountId: string, worldId: string, villageId: string): Promise<TradeMarketView> {
    await requirePlayer(this.ctx.db, accountId, worldId, this.ctx.clock.now());
    const db = this.ctx.db,
      world = await loadWorld(db, worldId),
      [village] = await db
        .select()
        .from(villages)
        .where(
          and(
            eq(villages.worldId, worldId),
            eq(villages.id, villageId),
            eq(villages.ownerAccountId, accountId),
            eq(villages.kind, 'PLAYER'),
          ),
        );
    if (!village) throw err.notFound('VILLAGE_NOT_FOUND');
    const merchants = await merchantState(db, world, village);
    const offers = await db
      .select({
        o: tradeOffers,
        name: sql<string>`coalesce(${worldPlayers.characterName},${accounts.displayName})`,
      })
      .from(tradeOffers)
      .innerJoin(
        villages,
        and(
          eq(villages.worldId, tradeOffers.worldId),
          eq(villages.id, tradeOffers.villageId),
          or(
            eq(villages.ownerAccountId, tradeOffers.accountId),
            eq(tradeOffers.accountId, accountId),
          ),
        ),
      )
      .innerJoin(
        worldPlayers,
        and(
          eq(worldPlayers.worldId, tradeOffers.worldId),
          eq(worldPlayers.accountId, tradeOffers.accountId),
        ),
      )
      .innerJoin(accounts, eq(accounts.id, tradeOffers.accountId))
      .where(and(eq(tradeOffers.worldId, worldId), eq(tradeOffers.status, 'OPEN')))
      .orderBy(
        sql`case when ${tradeOffers.accountId}=${accountId} then 0 else 1 end`,
        desc(tradeOffers.createdAt),
      )
      .limit(200);
    const trips = await db
      .select()
      .from(tradeTrips)
      .where(
        and(
          eq(tradeTrips.worldId, worldId),
          sql`${tradeTrips.status}<>'COMPLETED'`,
          or(
            and(eq(tradeTrips.originVillageId, villageId), eq(tradeTrips.accountId, accountId)),
            and(
              eq(tradeTrips.targetVillageId, villageId),
              eq(tradeTrips.recipientAccountId, accountId),
              eq(tradeTrips.status, 'OUTBOUND'),
            ),
          ),
        ),
      );
    const routes = await db
      .select()
      .from(tradeRoutes)
      .where(
        and(
          eq(tradeRoutes.worldId, worldId),
          eq(tradeRoutes.originVillageId, villageId),
          eq(tradeRoutes.accountId, accountId),
        ),
      );
    const history = await db
      .select()
      .from(tradeTrips)
      .where(
        and(
          eq(tradeTrips.worldId, worldId),
          eq(tradeTrips.status, 'COMPLETED'),
          or(
            and(eq(tradeTrips.originVillageId, villageId), eq(tradeTrips.accountId, accountId)),
            and(
              eq(tradeTrips.targetVillageId, villageId),
              eq(tradeTrips.recipientAccountId, accountId),
            ),
          ),
        ),
      )
      .orderBy(desc(tradeTrips.returnsAt))
      .limit(20);
    const names = await db
        .select({ id: villages.id, name: villages.name })
        .from(villages)
        .where(
          and(
            eq(villages.worldId, worldId),
            sql`${villages.id}=any(${sql.param([...new Set([...[...trips, ...history].flatMap((t) => [t.originVillageId, t.targetVillageId]), ...routes.map((r) => r.targetVillageId)])])}::uuid[])`,
          ),
        ),
      byId = new Map(names.map((v) => [v.id, v.name]));
    const tripView = (t: typeof tradeTrips.$inferSelect, historical = false): TradeTripView => ({
      id: t.id,
      direction: t.originVillageId === villageId ? 'OUTGOING' : 'INCOMING',
      originName: byId.get(t.originVillageId) ?? '',
      targetName: byId.get(t.targetVillageId) ?? '',
      status: t.status as TradeTripView['status'],
      delivery:
        t.returnCargo === null
          ? 'PENDING'
          : Object.values(t.returnCargo).some((n) => n > 0)
            ? 'RETURNED'
            : 'DELIVERED',
      cargo: historical ? t.cargo : (t.returnCargo ?? t.cargo),
      merchants: t.merchants,
      arrivesAt: iso(t.arrivesAt),
      returnsAt: iso(t.returnsAt),
    });
    return {
      merchants,
      offers: offers.map(({ o, name }) => ({
        id: o.id,
        villageId: o.villageId,
        ownerName: name,
        isMine: o.accountId === accountId,
        give: o.give,
        want: o.want,
        lots: o.lotsRemaining,
      })),
      trips: trips.map((t) => tripView(t)),
      history: history.map((t) => tripView(t, true)),
      routes: routes.map((r) => ({
        id: r.id,
        cargo: r.cargo,
        targetName: byId.get(r.targetVillageId) ?? '',
        everySeconds: r.everySeconds,
        nextAt: iso(r.nextAt),
        enabled: r.enabled,
        lastResult: r.lastResult,
      })),
    };
  }
  send(
    actor: Actor,
    worldId: string,
    villageId: string,
    input: TradeSendRequest,
    key: string | undefined,
  ) {
    const req = tradeSendSchema.parse(input);
    return this.command(
      actor,
      worldId,
      villageId,
      'send',
      key,
      req,
      async (tx, { world, village, state, now }) =>
        dispatch(
          tx,
          world,
          village,
          await destination(tx, world, villageId, req),
          req.cargo,
          now,
          state,
        ),
    );
  }
  offer(
    actor: Actor,
    worldId: string,
    villageId: string,
    input: TradeOfferRequest,
    key: string | undefined,
  ) {
    const req = tradeOfferSchema.parse(input);
    return this.command(
      actor,
      worldId,
      villageId,
      'offer',
      key,
      req,
      async (tx, { world, village, state, now }) => {
        const profile = await merchantState(tx, world, village);
        if (!profile.total) throw err.conflict('REQUIREMENTS_NOT_MET', 'Construye un Mercado');
        if (merchantsNeeded(req.give, profile.capacity) > profile.total)
          throw err.conflict('REQUIREMENTS_NOT_MET', 'Un lote supera tu capacidad comercial');
        const [n] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(tradeOffers)
          .where(
            and(
              eq(tradeOffers.worldId, worldId),
              eq(tradeOffers.accountId, actor.accountId),
              eq(tradeOffers.status, 'OPEN'),
            ),
          );
        if (n!.n >= 100)
          throw err.conflict('ALREADY_COMMITTED', 'Máximo de ofertas abiertas alcanzado');
        const id = newId(),
          cost = bundleToMilli(scale(req.give, req.lots));
        if (!canAfford(state, cost))
          throw err.conflict(
            'INSUFFICIENT_RESOURCES',
            'Recursos insuficientes para custodiar todos los lotes',
          );
        await saveEconomy(tx, villageId, debit(state, cost));
        await writeLedger(tx, {
          worldId,
          villageId,
          reason: 'TRADE_ESCROW',
          refId: id,
          deltaMilli: negate(cost),
          at: now,
        });
        await tx.insert(tradeOffers).values({
          id,
          worldId,
          villageId,
          accountId: actor.accountId,
          give: req.give,
          want: req.want,
          lotsRemaining: req.lots,
          createdAt: now,
        });
        return { id };
      },
    );
  }
  accept(
    actor: Actor,
    worldId: string,
    villageId: string,
    input: TradeAcceptRequest,
    key: string | undefined,
  ) {
    const req = tradeAcceptSchema.parse(input);
    return this.command(actor, worldId, villageId, 'accept', key, req, async (tx, buyer) => {
      const [offer] = await tx
        .select()
        .from(tradeOffers)
        .where(and(eq(tradeOffers.worldId, worldId), eq(tradeOffers.id, req.offerId)))
        .for('update');
      if (!offer) throw err.notFound('NOT_FOUND', 'Oferta no encontrada');
      if (offer.status !== 'OPEN' || offer.lotsRemaining < req.lots)
        throw err.conflict('OFFER_EXPIRED', 'Los lotes ya no están disponibles');
      if (offer.accountId === actor.accountId)
        throw err.conflict('TARGET_INVALID', 'No puedes aceptar tu propia oferta');
      const { prepareVillage } = await import('./commands.js'),
        seller = await prepareVillage(
          tx,
          this.ctx,
          { accountId: offer.accountId },
          worldId,
          offer.villageId,
        );
      const a = await dispatch(
          tx,
          buyer.world,
          buyer.village,
          seller.village,
          scale(offer.want, req.lots),
          buyer.now,
          buyer.state,
        ),
        b = await dispatch(
          tx,
          seller.world,
          seller.village,
          buyer.village,
          scale(offer.give, req.lots),
          buyer.now,
          seller.state,
          true,
        );
      const remaining = offer.lotsRemaining - req.lots;
      await tx
        .update(tradeOffers)
        .set({ lotsRemaining: remaining, status: remaining ? 'OPEN' : 'FILLED' })
        .where(eq(tradeOffers.id, offer.id));
      return { sent: a, received: b };
    });
  }
  cancelOffer(
    actor: Actor,
    worldId: string,
    villageId: string,
    offerId: string,
    key: string | undefined,
  ) {
    return this.command(
      actor,
      worldId,
      villageId,
      'cancel-offer',
      key,
      { offerId },
      async (tx, { now }) => {
        const [offer] = await tx
          .select()
          .from(tradeOffers)
          .where(
            and(
              eq(tradeOffers.worldId, worldId),
              eq(tradeOffers.id, offerId),
              eq(tradeOffers.accountId, actor.accountId),
            ),
          )
          .for('update');
        if (!offer) throw err.notFound('NOT_FOUND', 'Oferta no encontrada');
        if (offer.status !== 'OPEN') return { id: offerId, cancelled: false };
        const [origin] = await tx
          .select()
          .from(villages)
          .where(and(eq(villages.worldId, worldId), eq(villages.id, offer.villageId)));
        const home = origin?.ownerAccountId === actor.accountId ? origin.id : villageId;
        const { prepareVillage } = await import('./commands.js');
        await prepareVillage(tx, this.ctx, actor, worldId, home);
        await receive(
          tx,
          worldId,
          home,
          scale(offer.give, offer.lotsRemaining),
          offer.id,
          now,
          'TRADE_REFUND',
        );
        await tx
          .update(tradeOffers)
          .set({ status: 'CANCELLED', lotsRemaining: 0 })
          .where(eq(tradeOffers.id, offer.id));
        return { id: offerId, cancelled: true };
      },
    );
  }
  route(
    actor: Actor,
    worldId: string,
    villageId: string,
    input: TradeRouteRequest,
    key: string | undefined,
  ) {
    const req = tradeRouteSchema.parse(input);
    return this.command(
      actor,
      worldId,
      villageId,
      'route',
      key,
      req,
      async (tx, { world, village, now }) => {
        if (levelOf(await loadBuildings(tx, villageId), 'trade_office') < 1)
          throw err.conflict('REQUIREMENTS_NOT_MET', 'Necesitas Oficina de Comercio 1');
        const target = await destination(tx, world, villageId, req),
          profile = await merchantState(tx, world, village);
        if (
          req.everySeconds < rulesetOf(world).trade!.minRouteSeconds ||
          merchantsNeeded(req.cargo, profile.capacity) > profile.total
        )
          throw err.conflict(
            'REQUIREMENTS_NOT_MET',
            'La frecuencia o carga supera la capacidad del mercado',
          );
        const [n] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(tradeRoutes)
          .where(
            and(
              eq(tradeRoutes.worldId, worldId),
              eq(tradeRoutes.originVillageId, villageId),
              eq(tradeRoutes.enabled, true),
            ),
          );
        if (n!.n >= 20) throw err.conflict('ALREADY_COMMITTED', 'Máximo de 20 rutas activas');
        const id = newId(),
          nextAt = addSeconds(now, req.everySeconds);
        await tx.insert(tradeRoutes).values({
          id,
          worldId,
          originVillageId: villageId,
          targetVillageId: target.id,
          accountId: actor.accountId,
          recipientAccountId: target.ownerAccountId!,
          cargo: req.cargo,
          everySeconds: req.everySeconds,
          nextAt,
        });
        await scheduleEvent(tx, {
          worldId,
          villageId,
          secondaryVillageId: target.id,
          type: 'TRADE_ROUTE',
          dueAt: nextAt,
          dedupeKey: `route:${id}:${nextAt.getTime()}`,
          payload: { routeId: id },
        });
        return { id, nextAt: iso(nextAt) };
      },
    );
  }
  disableRoute(
    actor: Actor,
    worldId: string,
    villageId: string,
    routeId: string,
    key: string | undefined,
  ) {
    return this.command(actor, worldId, villageId, 'stop-route', key, { routeId }, async (tx) => {
      const [route] = await tx
        .select()
        .from(tradeRoutes)
        .where(
          and(
            eq(tradeRoutes.worldId, worldId),
            eq(tradeRoutes.id, routeId),
            eq(tradeRoutes.originVillageId, villageId),
            eq(tradeRoutes.accountId, actor.accountId),
          ),
        );
      if (!route) throw err.notFound('NOT_FOUND', 'Ruta no encontrada');
      await tx
        .update(tradeRoutes)
        .set({ enabled: false, lastResult: 'CANCELLED' })
        .where(eq(tradeRoutes.id, routeId));
      return { id: routeId };
    });
  }
}
export const tradeArrival: EventHandler = async (tx, _ctx, ev) => {
  const [trip] = await tx
    .select()
    .from(tradeTrips)
    .where(and(eq(tradeTrips.worldId, ev.worldId), eq(tradeTrips.id, String(ev.payload.tripId))))
    .for('update');
  if (!trip || trip.status !== 'OUTBOUND') return;
  const [target] = await tx
    .select()
    .from(villages)
    .where(and(eq(villages.worldId, ev.worldId), eq(villages.id, trip.targetVillageId)));
  const deliver = target?.ownerAccountId === trip.recipientAccountId;
  if (deliver) await receive(tx, ev.worldId, target.id, trip.cargo, trip.id, ev.dueAt, 'TRADE_IN');
  await tx
    .update(tradeTrips)
    .set({ status: 'RETURNING', returnCargo: deliver ? empty() : trip.cargo })
    .where(eq(tradeTrips.id, trip.id));
  await scheduleEvent(tx, {
    worldId: ev.worldId,
    villageId: trip.originVillageId,
    type: 'TRADE_RETURN',
    dueAt: trip.returnsAt,
    dedupeKey: `trade-return:${trip.id}`,
    payload: { tripId: trip.id },
  });
};
export const tradeReturn: EventHandler = async (tx, ctx, ev) => {
  const [trip] = await tx
    .select()
    .from(tradeTrips)
    .where(and(eq(tradeTrips.worldId, ev.worldId), eq(tradeTrips.id, String(ev.payload.tripId))))
    .for('update');
  if (!trip || trip.status !== 'RETURNING') return;
  const [home] = await tx
    .select()
    .from(villages)
    .where(and(eq(villages.worldId, ev.worldId), eq(villages.id, trip.originVillageId)));
  if (home?.ownerAccountId !== trip.accountId) {
    const [fallback] = await tx
      .select()
      .from(villages)
      .where(
        and(
          eq(villages.worldId, ev.worldId),
          eq(villages.ownerAccountId, trip.accountId),
          eq(villages.kind, 'PLAYER'),
        ),
      )
      .orderBy(villages.id)
      .limit(1);
    if (fallback) {
      const world = await loadWorld(tx, ev.worldId),
        profile = await merchantState(tx, world, fallback),
        seconds = travelSeconds(
          distanceMilli(home!, fallback),
          profile.speed || 16,
          militarySpeedOf(world),
        ),
        returnsAt = addSeconds(ev.dueAt, seconds);
      await tx
        .update(tradeTrips)
        .set({
          originVillageId: fallback.id,
          arrivesAt: ev.dueAt,
          returnsAt,
          transitSeconds: seconds,
        })
        .where(eq(tradeTrips.id, trip.id));
      await scheduleEvent(tx, {
        worldId: ev.worldId,
        villageId: fallback.id,
        type: 'TRADE_RETURN',
        dueAt: returnsAt,
        dedupeKey: `trade-reroute:${trip.id}:${ev.id}`,
        payload: { tripId: trip.id },
      });
      return;
    }
    await tx.insert(outbox).values({
      worldId: ev.worldId,
      type: 'TradeLost',
      payload: { tripId: trip.id, accountId: trip.accountId, cargo: trip.returnCargo },
    });
  } else if (trip.returnCargo && Object.values(trip.returnCargo).some((n) => n > 0))
    await receive(tx, ev.worldId, home.id, trip.returnCargo, trip.id, ev.dueAt, 'TRADE_REFUND');
  await tx.update(tradeTrips).set({ status: 'COMPLETED' }).where(eq(tradeTrips.id, trip.id));
  ctx.log.info('trade.returned', { world_id: ev.worldId, trip_id: trip.id });
};
export const tradeRouteDue: EventHandler = async (tx, _ctx, ev) => {
  const [route] = await tx
    .select()
    .from(tradeRoutes)
    .where(and(eq(tradeRoutes.worldId, ev.worldId), eq(tradeRoutes.id, String(ev.payload.routeId))))
    .for('update');
  if (!route?.enabled || route.nextAt.getTime() !== ev.dueAt.getTime()) return;
  const [origin] = await tx
      .select()
      .from(villages)
      .where(and(eq(villages.worldId, ev.worldId), eq(villages.id, route.originVillageId))),
    [target] = await tx
      .select()
      .from(villages)
      .where(and(eq(villages.worldId, ev.worldId), eq(villages.id, route.targetVillageId)));
  if (
    origin?.ownerAccountId !== route.accountId ||
    target?.ownerAccountId !== route.recipientAccountId
  ) {
    await tx
      .update(tradeRoutes)
      .set({ enabled: false, lastResult: 'OWNER_CHANGED' })
      .where(eq(tradeRoutes.id, route.id));
    return;
  }
  const world = await loadWorld(tx, ev.worldId),
    state = settle(await loadEconomy(tx, origin.id), ev.dueAt.getTime()),
    profile = await merchantState(tx, world, origin),
    needed = profile.capacity ? merchantsNeeded(route.cargo, profile.capacity) : Infinity;
  try {
    await requirePlayer(tx, route.accountId, ev.worldId, ev.dueAt);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    await tx
      .update(tradeRoutes)
      .set({ enabled: false, lastResult: 'ACCOUNT_RESTRICTED' })
      .where(eq(tradeRoutes.id, route.id));
    return;
  }
  let result = 'SENT';
  if (levelOf(await loadBuildings(tx, origin.id), 'trade_office') < 1) result = 'BUILDING_MISSING';
  else if (needed > profile.available) result = 'MERCHANTS_BUSY';
  else if (!canAfford(state, bundleToMilli(route.cargo))) result = 'INSUFFICIENT_RESOURCES';
  else await dispatch(tx, world, origin, target, route.cargo, ev.dueAt, state);
  const nextAt = addSeconds(ev.dueAt, route.everySeconds);
  await tx
    .update(tradeRoutes)
    .set({ nextAt, lastResult: result })
    .where(eq(tradeRoutes.id, route.id));
  await scheduleEvent(tx, {
    worldId: ev.worldId,
    villageId: origin.id,
    secondaryVillageId: target.id,
    type: 'TRADE_ROUTE',
    dueAt: nextAt,
    dedupeKey: `route:${route.id}:${nextAt.getTime()}`,
    payload: { routeId: route.id },
  });
};
