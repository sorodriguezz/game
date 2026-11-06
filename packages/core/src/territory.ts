import { EVENT_HANDLERS } from './handlers.js';
import { refreshCulture, assertExpansion } from './culture.js';
import { initializeFortifications } from './fortification-state.js';
import { randomBytes } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  accounts,
  alliances,
  allianceMembers,
  armyMovements,
  battles,
  garrisons,
  settlementOrders,
  resourceAccounts,
  villageBuildings,
  villages,
  worldPlayers,
  worlds,
  type DbOrTx,
  type Tx,
} from '@reinos/db';
import {
  allianceRequestSchema,
  foundVillageRequestSchema,
  type FoundVillageRequest,
  type TerritoryView,
} from '@reinos/contracts';
import type { UnitType } from '@reinos/game-config';
import {
  bundleToMilli,
  capacityMilli,
  computeRates,
  debit,
  canAfford,
  distanceMilli,
  encounterAt,
  isSettleable,
  levelOf,
  settle,
  terrainAt,
  travelSeconds,
} from '@reinos/game-rules';
import { err, type CoreContext } from './context.js';
import { scheduleEvent, processEventsUpTo, EventOrderingConflict } from './events.js';
import { runIdempotent, assertIdempotencyKey } from './idempotency.js';
import { prepareVillage, type Actor } from './commands.js';
import { addSeconds, iso, newId } from './util.js';
import {
  loadBuildings,
  rulesetForVillage,
  loadEconomy,
  loadWorld,
  lockVillages,
  negate,
  removeFromStacks,
  rulesetOf,
  saveEconomy,
  stateColumns,
  militarySpeedOf,
  withRecomputedRates,
  writeLedger,
  type WorldRow,
} from './village-state.js';

export const hostile = (mission: string) => ['ATTACK', 'RAID', 'CONQUER'].includes(mission);
export async function areAllies(
  db: DbOrTx,
  worldId: string,
  a: string,
  b: string | null,
): Promise<boolean> {
  if (!b || a === b) return false;
  const rows = await db
    .select()
    .from(allianceMembers)
    .where(and(eq(allianceMembers.worldId, worldId), inArray(allianceMembers.accountId, [a, b])));
  return rows.length === 2 && rows[0]!.allianceId === rows[1]!.allianceId;
}
export async function initializeVillage(
  tx: Tx,
  world: WorldRow,
  owner: string,
  name: string,
  x: number,
  y: number,
  at: Date,
  isCapital = false,
) {
  const r = rulesetOf(world),
    id = newId();
  await tx.insert(villages).values({
    id,
    worldId: world.id,
    ownerAccountId: owner,
    kind: 'PLAYER',
    name,
    x,
    y,
    coastal: false,
    isCapital,
  });
  const [player] = await tx
    .select()
    .from(worldPlayers)
    .where(and(eq(worldPlayers.worldId, world.id), eq(worldPlayers.accountId, owner)));
  await initializeFortifications(
    tx,
    r,
    world,
    { id, x, y },
    player!.civilization as import('@reinos/game-config').CivilizationId,
  );
  await tx.insert(villageBuildings).values(
    r.startingBuildings.map((b) => ({
      worldId: world.id,
      villageId: id,
      plot: b.plot,
      type: b.type,
      level: b.level,
    })),
  );
  const buildings = r.startingBuildings;
  await tx.insert(resourceAccounts).values({
    worldId: world.id,
    villageId: id,
    ...stateColumns({
      amounts: bundleToMilli(r.economy.startingResources),
      remainders: { wood: 0n, stone: 0n, iron: 0n, food: 0n },
      rates: computeRates(await rulesetForVillage(tx, r, id), buildings, 0, world.speedMultiplier),
      capacity: capacityMilli(r, levelOf(buildings, 'warehouse')),
      ...(r.economy.cropPopulation ? { foodCapacity: capacityMilli(r, 0) } : {}),
      lastSettledAt: at.getTime(),
    }),
  });
  await refreshCulture(tx, world, id, at);
  return id;
}
export class TerritoryService {
  constructor(private readonly ctx: CoreContext) {}
  async view(accountId: string, worldId: string): Promise<TerritoryView> {
    await this.member(accountId, worldId);
    const owned = await this.ctx.db
      .select()
      .from(villages)
      .where(
        and(
          eq(villages.worldId, worldId),
          eq(villages.ownerAccountId, accountId),
          eq(villages.kind, 'PLAYER'),
        ),
      )
      .orderBy(villages.createdAt);
    const settlements = await this.ctx.db
      .select()
      .from(settlementOrders)
      .where(
        and(
          eq(settlementOrders.worldId, worldId),
          eq(settlementOrders.ownerAccountId, accountId),
          eq(settlementOrders.status, 'IN_PROGRESS'),
        ),
      );
    const [membership] = await this.ctx.db
      .select({ a: alliances })
      .from(allianceMembers)
      .innerJoin(
        alliances,
        and(
          eq(alliances.worldId, allianceMembers.worldId),
          eq(alliances.id, allianceMembers.allianceId),
        ),
      )
      .where(and(eq(allianceMembers.worldId, worldId), eq(allianceMembers.accountId, accountId)));
    const members = membership
      ? await this.ctx.db
          .select({ accountId: accounts.id, displayName: accounts.displayName })
          .from(allianceMembers)
          .innerJoin(accounts, eq(accounts.id, allianceMembers.accountId))
          .where(
            and(
              eq(allianceMembers.worldId, worldId),
              eq(allianceMembers.allianceId, membership.a.id),
            ),
          )
      : [];
    const reinforcements = await this.ctx.db
      .select({
        villageId: garrisons.villageId,
        villageName: villages.name,
        originVillageId: garrisons.originVillageId,
        unitType: garrisons.unitType,
        quantity: garrisons.quantity,
      })
      .from(garrisons)
      .innerJoin(
        villages,
        and(eq(villages.id, garrisons.villageId), eq(villages.worldId, garrisons.worldId)),
      )
      .where(
        and(
          eq(garrisons.worldId, worldId),
          eq(garrisons.ownerAccountId, accountId),
          sql`${garrisons.quantity}>0`,
        ),
      );
    return {
      villages: owned.map((v) => ({
        id: v.id,
        name: v.name,
        x: v.x,
        y: v.y,
        isCapital: v.isCapital,
      })),
      settlements: settlements.map((s) => ({
        id: s.id,
        name: s.name,
        x: s.x,
        y: s.y,
        arrivesAt: iso(s.arrivesAt),
      })),
      alliance: membership
        ? {
            id: membership.a.id,
            name: membership.a.name,
            inviteCode: membership.a.leaderAccountId === accountId ? membership.a.inviteCode : null,
            members,
          }
        : null,
      reinforcements: reinforcements.map((g) => ({ ...g, unitType: g.unitType as UnitType })),
    };
  }
  private async member(accountId: string, worldId: string) {
    const [m] = await this.ctx.db
      .select()
      .from(worldPlayers)
      .where(and(eq(worldPlayers.worldId, worldId), eq(worldPlayers.accountId, accountId)));
    if (!m) throw err.forbidden('NOT_A_MEMBER', 'No participas en este mundo');
    return m;
  }
  async found(
    actor: Actor,
    worldId: string,
    originId: string,
    input: FoundVillageRequest,
    key: string | undefined,
  ) {
    const req = foundVillageRequestSchema.parse(input);
    const idem = assertIdempotencyKey(key);
    return this.ctx.db.transaction(async (tx) => {
      const { response } = await runIdempotent(
        tx,
        { accountId: actor.accountId, worldId, command: `found:${originId}`, key: idem },
        req,
        async () => {
          await tx.select().from(worlds).where(eq(worlds.id, worldId)).for('no key update');
          const { world, village, state, now } = await prepareVillage(
            tx,
            this.ctx,
            actor,
            worldId,
            originId,
          );
          const r = rulesetOf(world),
            t = r.territory;
          if (!t)
            throw err.unprocessable('FEATURE_DISABLED', 'La expansión requiere el mundo terrestre');
          if (
            req.x >= world.mapSize ||
            req.y >= world.mapSize ||
            (r.economy.cropPopulation &&
              terrainAt(world.mapSeed, world.mapSize, req.x, req.y, 'LAND') !== 'PLAIN') ||
            !isSettleable(terrainAt(world.mapSeed, world.mapSize, req.x, req.y, 'LAND'))
          )
            throw err.unprocessable('TARGET_INVALID', 'Selecciona una casilla de tierra habitable');
          const [occupied] = await tx
            .select()
            .from(villages)
            .where(
              and(eq(villages.worldId, worldId), eq(villages.x, req.x), eq(villages.y, req.y)),
            );
          const [reserved] = await tx
            .select()
            .from(settlementOrders)
            .where(
              and(
                eq(settlementOrders.worldId, worldId),
                eq(settlementOrders.x, req.x),
                eq(settlementOrders.y, req.y),
                eq(settlementOrders.status, 'IN_PROGRESS'),
              ),
            );
          if (occupied || reserved)
            throw err.conflict('TARGET_INVALID', 'Esta casilla ya está ocupada o reservada');
          const buildings = await loadBuildings(tx, originId);
          if (
            levelOf(buildings, 'city_hall') < t.foundingHallLevel ||
            levelOf(buildings, 'rally_point') < 1
          )
            throw err.unprocessable(
              'REQUIREMENTS_NOT_MET',
              `Necesitas centro urbano ${t.foundingHallLevel} y plaza de reuniones`,
            );
          const cost = bundleToMilli(t.foundingCost);
          await assertExpansion(tx, world, actor.accountId, originId, now);
          if (!canAfford(state, cost))
            throw err.conflict('INSUFFICIENT_RESOURCES', 'Recursos insuficientes');
          await removeFromStacks(tx, originId, [
            { unitType: 'settler', quantity: t.settlersRequired },
          ]);
          const id = newId(),
            arrivesAt = addSeconds(
              now,
              travelSeconds(distanceMilli(village, req), 5, militarySpeedOf(world)),
            );
          await tx.insert(settlementOrders).values({
            id,
            worldId,
            originVillageId: originId,
            ownerAccountId: actor.accountId,
            name: req.name,
            x: req.x,
            y: req.y,
            departedAt: now,
            arrivesAt,
          });
          await writeLedger(tx, {
            worldId,
            villageId: originId,
            reason: 'BUILD',
            refId: id,
            deltaMilli: negate(cost),
            at: now,
          });
          await saveEconomy(
            tx,
            originId,
            await withRecomputedRates(tx, r, originId, debit(state, cost)),
          );
          await scheduleEvent(tx, {
            worldId,
            type: 'SETTLEMENT_COMPLETE',
            villageId: originId,
            dueAt: arrivesAt,
            dedupeKey: `settlement:${id}`,
            payload: { orderId: id },
          });
          return { id, arrivesAt: iso(arrivesAt) };
        },
      );
      return response;
    });
  }
  async alliance(actor: Actor, worldId: string, input: unknown, key: string | undefined) {
    const req = allianceRequestSchema.parse(input),
      idem = assertIdempotencyKey(key);
    await this.member(actor.accountId, worldId);
    return this.ctx.db.transaction(async (tx) => {
      const { response } = await runIdempotent(
        tx,
        { accountId: actor.accountId, worldId, command: 'alliance', key: idem },
        req,
        async () => {
          await tx.select().from(worlds).where(eq(worlds.id, worldId)).for('no key update');
          const [existing] = await tx
            .select()
            .from(allianceMembers)
            .where(
              and(
                eq(allianceMembers.worldId, worldId),
                eq(allianceMembers.accountId, actor.accountId),
              ),
            );
          if (existing) throw err.conflict('TARGET_INVALID', 'Ya perteneces a una alianza');
          let id: string;
          if ('name' in req) {
            id = newId();
            await tx.insert(alliances).values({
              id,
              worldId,
              name: req.name,
              leaderAccountId: actor.accountId,
              inviteCode: randomBytes(9).toString('base64url'),
            });
          } else {
            const [a] = await tx
              .select()
              .from(alliances)
              .where(and(eq(alliances.worldId, worldId), eq(alliances.inviteCode, req.inviteCode)));
            if (!a) throw err.notFound('NOT_FOUND', 'Invitación inválida');
            id = a.id;
            const [countRow] = await tx
              .select({ count: sql<number>`count(*)::int` })
              .from(allianceMembers)
              .where(and(eq(allianceMembers.worldId, worldId), eq(allianceMembers.allianceId, id)));
            if (
              (countRow?.count ?? 0) >=
              rulesetOf(await loadWorld(tx, worldId)).world.allianceMaxMembers
            )
              throw err.conflict('TARGET_INVALID', 'Alianza completa');
          }
          await tx
            .insert(allianceMembers)
            .values({ worldId, accountId: actor.accountId, allianceId: id });
          return { id };
        },
      );
      return response;
    });
  }
  async recall(
    actor: Actor,
    worldId: string,
    targetId: string,
    originId: string,
    key: string | undefined,
  ) {
    const idem = assertIdempotencyKey(key);
    return this.ctx.db
      .transaction(async (tx) => {
        const { response } = await runIdempotent(
          tx,
          {
            accountId: actor.accountId,
            worldId,
            command: `recall:${targetId}:${originId}`,
            key: idem,
          },
          { targetId, originId },
          async () => {
            await tx.select().from(worlds).where(eq(worlds.id, worldId)).for('no key update');
            const locked = await lockVillages(tx, worldId, [targetId, originId]);
            await processEventsUpTo(tx, this.ctx, EVENT_HANDLERS, new Set([targetId, originId]), {
              dueAt: this.ctx.clock.now(),
            });
            let origin = locked.get(originId)!;
            const target = locked.get(targetId)!;
            if (origin.ownerAccountId !== actor.accountId) {
              const [home] = await tx
                .select()
                .from(villages)
                .where(
                  and(
                    eq(villages.worldId, worldId),
                    eq(villages.ownerAccountId, actor.accountId),
                    eq(villages.kind, 'PLAYER'),
                  ),
                )
                .orderBy(villages.id)
                .limit(1);
              if (!home)
                throw err.notFound('VILLAGE_NOT_FOUND', 'No hay aldea propia a la que regresar');
              await lockVillages(tx, worldId, [home.id]);
              await processEventsUpTo(
                tx,
                this.ctx,
                EVENT_HANDLERS,
                new Set([targetId, originId, home.id]),
                { dueAt: this.ctx.clock.now() },
              );
              origin = home;
            }
            const homeId = origin.id;
            const rows = await tx
              .select()
              .from(garrisons)
              .where(
                and(
                  eq(garrisons.worldId, worldId),
                  eq(garrisons.ownerAccountId, actor.accountId),
                  eq(garrisons.villageId, targetId),
                  eq(garrisons.originVillageId, originId),
                  sql`${garrisons.quantity}>0`,
                ),
              );
            if (!rows.length) throw err.notFound('NOT_FOUND', 'Sin refuerzos que retirar');
            const world = await loadWorld(tx, worldId),
              r = rulesetOf(world),
              now = this.ctx.clock.now();
            const speed = Math.min(
              ...rows.map((s) => r.units.find((u) => u.type === s.unitType)!.speedTilesPerHour),
            );
            const returnsAt = addSeconds(
                now,
                travelSeconds(distanceMilli(origin, target), speed, militarySpeedOf(world)),
              ),
              id = newId();
            await tx.insert(armyMovements).values({
              id,
              worldId,
              ownerAccountId: actor.accountId,
              originVillageId: homeId,
              targetVillageId: targetId,
              mission: 'REINFORCE',
              status: 'RETURNING',
              units: Object.fromEntries(rows.map((s) => [s.unitType, s.quantity])),
              departedAt: now,
              arrivesAt: addSeconds(now, 1),
              returnsAt,
            });
            await tx
              .delete(garrisons)
              .where(
                and(
                  eq(garrisons.worldId, worldId),
                  eq(garrisons.ownerAccountId, actor.accountId),
                  eq(garrisons.villageId, targetId),
                  eq(garrisons.originVillageId, originId),
                ),
              );
            await scheduleEvent(tx, {
              worldId,
              type: 'MOVEMENT_RETURN',
              villageId: homeId,
              dueAt: returnsAt,
              dedupeKey: `return:${id}`,
              payload: { movementId: id },
            });
            await saveEconomy(
              tx,
              homeId,
              await withRecomputedRates(
                tx,
                r,
                homeId,
                settle(await loadEconomy(tx, homeId), now.getTime()),
              ),
            );
            await saveEconomy(
              tx,
              targetId,
              await withRecomputedRates(
                tx,
                r,
                targetId,
                settle(await loadEconomy(tx, targetId), now.getTime()),
              ),
            );
            await scheduleInterceptions(tx, world, id, now);
            return { id, arrivesAt: iso(returnsAt) };
          },
        );
        return response;
      })
      .catch((e: unknown) => {
        if (e instanceof EventOrderingConflict)
          throw err.conflict('EVENTS_PENDING', 'Hay un combate anterior pendiente; reintenta');
        throw e;
      });
  }
}

export async function movementPath(
  db: DbOrTx,
  m: typeof armyMovements.$inferSelect,
  positions?: ReadonlyMap<string, { x: number; y: number }>,
) {
  const points =
    positions ??
    new Map(
      (
        await db
          .select()
          .from(villages)
          .where(
            and(
              eq(villages.worldId, m.worldId),
              inArray(villages.id, [m.originVillageId, m.targetVillageId]),
            ),
          )
      ).map((v) => [v.id, v]),
    );
  const origin = points.get(m.originVillageId)!,
    target = points.get(m.targetVillageId)!;
  if (m.status !== 'RETURNING')
    return {
      from: origin,
      to: target,
      departedAt: m.departedAt.getTime(),
      arrivesAt: m.arrivesAt.getTime(),
    };
  let from: { x: number; y: number } = target,
    departedAt =
      m.mission === 'REINFORCE' && !m.battleId ? m.departedAt.getTime() : m.arrivesAt.getTime();
  if (m.battleId) {
    const [battle] = await db
      .select()
      .from(battles)
      .where(and(eq(battles.worldId, m.worldId), eq(battles.id, m.battleId)));
    if (battle?.location === 'FIELD') {
      from = { x: battle.fieldX! / 1000, y: battle.fieldY! / 1000 };
      departedAt = battle.occurredAt.getTime();
    }
  }
  return { from, to: origin, departedAt, arrivesAt: m.returnsAt!.getTime() };
}

/** Serializar creación de marchas por mundo permite descubrir todas las colisiones, incluso envíos concurrentes. */
export async function scheduleInterceptions(
  tx: Tx,
  world: WorldRow,
  movementId: string,
  now: Date,
) {
  const r = rulesetOf(world);
  if (!r.territory) return;
  const [march] = await tx.select().from(armyMovements).where(eq(armyMovements.id, movementId));
  if (!march || march.status === 'COMPLETED') return;
  const villageRows = await tx.select().from(villages).where(eq(villages.worldId, world.id));
  const byId = new Map(villageRows.map((v) => [v.id, v]));
  const others = await tx
    .select()
    .from(armyMovements)
    .where(
      and(
        eq(armyMovements.worldId, world.id),
        inArray(armyMovements.status, ['IN_TRANSIT', 'RETURNING']),
        sql`${armyMovements.id}<>${movementId}`,
        sql`${armyMovements.ownerAccountId}<>${march.ownerAccountId}`,
      ),
    );
  for (const other of others) {
    if (await areAllies(tx, world.id, march.ownerAccountId, other.ownerAccountId)) continue;
    const meet = encounterAt(
      await movementPath(tx, march, byId),
      await movementPath(tx, other, byId),
      now.getTime(),
      r.territory.fieldEncounterRadiusMilli,
    );
    if (!meet) continue;
    const ids = [march.id, other.id].sort();
    const lockVillageIds = [
      ...new Set([
        march.originVillageId,
        march.targetVillageId,
        other.originVillageId,
        other.targetVillageId,
      ]),
    ];
    await scheduleEvent(tx, {
      worldId: world.id,
      type: 'FIELD_ENCOUNTER',
      villageId: march.originVillageId,
      secondaryVillageId: other.originVillageId,
      dueAt: new Date(meet.at),
      dedupeKey: `field:${ids.join(':')}:${meet.at}`,
      payload: { movementIds: ids, lockVillageIds, x: meet.x, y: meet.y },
    });
  }
}
