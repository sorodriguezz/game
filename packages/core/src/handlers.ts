import { fieldEncounter, settlementComplete } from './territory-handlers.js';
import { areAllies, scheduleInterceptions } from './territory.js';
import { and, eq, sql } from 'drizzle-orm';
import {
  armyMovements,
  garrisons,
  settlementOrders,
  battles,
  constructionOrders,
  outbox,
  recruitmentOrders,
  troopStacks,
  villageBuildings,
  villages,
  woundedStacks,
  worldPlayers,
  type Tx,
} from '@reinos/db';
import type { CivilizationId, UnitType } from '@reinos/game-config';
import {
  MILLI,
  bundleToMilli,
  credit,
  debit,
  distanceMilli,
  levelOf,
  milliToWholeUnits,
  resolveBattle,
  settle,
  slowestSpeed,
  travelSeconds,
  type BattleSnapshot,
} from '@reinos/game-rules';
import { DomainError } from './context.js';
import {
  scheduleEvent,
  processEventsUpTo,
  locksetOf,
  type EventHandler,
  type EventType,
  type GameEvent,
} from './events.js';
import { addSeconds, newId } from './util.js';
import {
  addToStacks,
  lockVillages,
  loadBuildings,
  loadEconomy,
  loadTroops,
  loadWorld,
  negate,
  removeFromStacks,
  rulesetOf,
  saveEconomy,
  withRecomputedRates,
  writeLedger,
} from './village-state.js';

const at = (ev: GameEvent) => ev.dueAt.getTime();

/** Liquida la economía de la aldea hasta el instante del evento y la devuelve. */
async function settledEconomy(tx: Tx, villageId: string, ev: GameEvent) {
  return settle(await loadEconomy(tx, villageId), at(ev));
}

const constructionComplete: EventHandler = async (tx, ctx, ev) => {
  const orderId = String(ev.payload.orderId);
  const [order] = await tx
    .select()
    .from(constructionOrders)
    .where(eq(constructionOrders.id, orderId));
  if (!order || order.status !== 'IN_PROGRESS') return; // idempotente
  if (order.worldId !== ev.worldId || order.villageId !== ev.villageId) {
    throw new DomainError('WORLD_MISMATCH', 500, 'evento y orden de mundos/aldeas distintos');
  }
  const world = await loadWorld(tx, ev.worldId);
  const r = rulesetOf(world);
  let state = await settledEconomy(tx, ev.villageId, ev);

  const [current] = await tx
    .select()
    .from(villageBuildings)
    .where(
      and(eq(villageBuildings.villageId, ev.villageId), eq(villageBuildings.plot, order.plot)),
    );
  if (current) {
    if (current.type !== order.buildingType || current.level !== order.targetLevel - 1) {
      throw new DomainError(
        'CONCURRENT_MODIFICATION',
        500,
        'estado de parcela inesperado al completar',
      );
    }
    await tx
      .update(villageBuildings)
      .set({ level: order.targetLevel })
      .where(
        and(eq(villageBuildings.villageId, ev.villageId), eq(villageBuildings.plot, order.plot)),
      );
  } else {
    if (order.targetLevel !== 1)
      throw new DomainError('CONCURRENT_MODIFICATION', 500, 'nivel inicial inesperado');
    await tx.insert(villageBuildings).values({
      worldId: ev.worldId,
      villageId: ev.villageId,
      plot: order.plot,
      type: order.buildingType,
      level: 1,
    });
  }
  await tx
    .update(constructionOrders)
    .set({ status: 'COMPLETED', completedAt: ev.dueAt })
    .where(eq(constructionOrders.id, orderId));

  state = await withRecomputedRates(tx, r, ev.villageId, state);
  await saveEconomy(tx, ev.villageId, state);
  await tx.insert(outbox).values({
    worldId: ev.worldId,
    type: 'BuildingCompleted',
    payload: {
      villageId: ev.villageId,
      plot: order.plot,
      type: order.buildingType,
      level: order.targetLevel,
    },
  });
  ctx.log.info('building.completed', {
    world_id: ev.worldId,
    village_id: ev.villageId,
    type: order.buildingType,
  });
};

const recruitmentComplete: EventHandler = async (tx, _ctx, ev) => {
  const orderId = String(ev.payload.orderId);
  const [order] = await tx
    .select()
    .from(recruitmentOrders)
    .where(eq(recruitmentOrders.id, orderId));
  if (!order || order.status !== 'IN_PROGRESS') return;
  const world = await loadWorld(tx, ev.worldId);
  const r = rulesetOf(world);
  let state = await settledEconomy(tx, ev.villageId, ev);
  await addToStacks(tx, troopStacks, ev.worldId, ev.villageId, [
    { unitType: order.unitType, quantity: order.quantity },
  ]);
  await tx
    .update(recruitmentOrders)
    .set({ status: 'COMPLETED', completedAt: ev.dueAt })
    .where(eq(recruitmentOrders.id, orderId));
  // El mantenimiento de las nuevas tropas empieza ahora (tras liquidar el tramo previo).
  state = await withRecomputedRates(tx, r, ev.villageId, state);
  await saveEconomy(tx, ev.villageId, state);
  await tx.insert(outbox).values({
    worldId: ev.worldId,
    type: 'RecruitmentCompleted',
    payload: { villageId: ev.villageId, unitType: order.unitType, quantity: order.quantity },
  });
};

const movementReturn: EventHandler = async (tx, _ctx, ev) => {
  const movementId = String(ev.payload.movementId);
  const [m] = await tx
    .select()
    .from(armyMovements)
    .where(eq(armyMovements.id, movementId))
    .for('update');
  if (!m || m.status !== 'RETURNING' || (m.returnsAt && m.returnsAt > ev.dueAt)) return;
  if (m.originVillageId !== ev.villageId)
    throw new DomainError('WORLD_MISMATCH', 500, 'retorno a aldea distinta');
  let state = await settledEconomy(tx, ev.villageId, ev);
  await addToStacks(
    tx,
    troopStacks,
    ev.worldId,
    ev.villageId,
    Object.entries(m.units).map(([unitType, quantity]) => ({ unitType, quantity })),
  );
  const [home] = await tx.select().from(villages).where(eq(villages.id, ev.villageId));
  if (home?.ownerAccountId !== m.ownerAccountId) {
    // Nunca entregar un ejército al conquistador de su antigua aldea.
    await removeFromStacks(
      tx,
      ev.villageId,
      Object.entries(m.units).map(([unitType, quantity]) => ({ unitType, quantity })),
    );
    const [fallback] = await tx
      .select()
      .from(villages)
      .where(
        and(
          eq(villages.worldId, ev.worldId),
          eq(villages.ownerAccountId, m.ownerAccountId),
          eq(villages.kind, 'PLAYER'),
        ),
      )
      .orderBy(villages.id)
      .limit(1);
    if (fallback) {
      await lockVillages(tx, ev.worldId, [fallback.id]);
      await processEventsUpTo(
        tx,
        _ctx,
        EVENT_HANDLERS,
        new Set([...locksetOf(ev), fallback.id]),
        { dueAt: ev.dueAt, priority: ev.priority, id: ev.id },
        ev.id,
      );
      const fallbackState = settle(await loadEconomy(tx, fallback.id), ev.dueAt.getTime());
      const world = await loadWorld(tx, ev.worldId),
        r = rulesetOf(world);
      const returnsAt = addSeconds(
        ev.dueAt,
        travelSeconds(
          distanceMilli(home!, fallback),
          slowestSpeed(
            r,
            Object.entries(m.units).map(([unitType, quantity]) => ({
              unitType: unitType as UnitType,
              quantity,
            })),
          ),
          world.speedMultiplier,
        ),
      );
      await tx
        .update(armyMovements)
        .set({
          originVillageId: fallback.id,
          targetVillageId: home!.id,
          departedAt: ev.dueAt,
          arrivesAt: addSeconds(ev.dueAt, 1),
          returnsAt,
          battleId: null,
        })
        .where(eq(armyMovements.id, m.id));
      await scheduleEvent(tx, {
        worldId: ev.worldId,
        type: 'MOVEMENT_RETURN',
        villageId: fallback.id,
        dueAt: returnsAt,
        dedupeKey: `reroute:${m.id}:${ev.id}`,
        payload: { movementId: m.id },
      });
      await scheduleInterceptions(tx, world, m.id, ev.dueAt);
      await saveEconomy(
        tx,
        fallback.id,
        await withRecomputedRates(tx, r, fallback.id, fallbackState),
      );
    } else
      await tx
        .update(armyMovements)
        .set({ status: 'COMPLETED', units: {} })
        .where(eq(armyMovements.id, m.id));
    return;
  }
  const loot = m.loot ?? { wood: 0, stone: 0, iron: 0, food: 0 };
  const lootMilli = bundleToMilli({
    wood: loot.wood ?? 0,
    stone: loot.stone ?? 0,
    iron: loot.iron ?? 0,
    food: loot.food ?? 0,
  });
  const c = credit(state, lootMilli);
  state = c.state;
  await writeLedger(tx, {
    worldId: ev.worldId,
    villageId: ev.villageId,
    reason: 'LOOT_IN',
    refId: movementId,
    deltaMilli: c.credited,
    at: ev.dueAt,
  });
  await tx
    .update(armyMovements)
    .set({ status: 'COMPLETED' })
    .where(eq(armyMovements.id, movementId));
  // Recalcular también si la aldea de origen fue reasignada tras una conquista.
  const world = await loadWorld(tx, ev.worldId);
  await saveEconomy(
    tx,
    ev.villageId,
    await withRecomputedRates(tx, rulesetOf(world), ev.villageId, state),
  );
  await tx.insert(outbox).values({
    worldId: ev.worldId,
    type: 'ArmyReturned',
    payload: { movementId, villageId: ev.villageId, loot: milliToWholeUnits(c.credited) },
  });
};

const movementArrival: EventHandler = async (tx, ctx, ev) => {
  const movementId = String(ev.payload.movementId);
  const [m] = await tx
    .select()
    .from(armyMovements)
    .where(eq(armyMovements.id, movementId))
    .for('update');
  if (!m || m.status !== 'IN_TRANSIT') return;
  if (
    m.targetVillageId !== ev.villageId ||
    m.originVillageId !== ev.secondaryVillageId ||
    m.worldId !== ev.worldId
  ) {
    throw new DomainError(
      'WORLD_MISMATCH',
      500,
      'evento de llegada inconsistente con el movimiento',
    );
  }
  const world = await loadWorld(tx, ev.worldId);
  const r = rulesetOf(world);

  const [target] = await tx.select().from(villages).where(eq(villages.id, m.targetVillageId));
  const [origin] = await tx.select().from(villages).where(eq(villages.id, m.originVillageId));
  if (!target || !origin)
    throw new DomainError('VILLAGE_NOT_FOUND', 500, 'aldea del combate inexistente');

  if (m.mission === 'TRANSFER' || m.mission === 'REINFORCE') {
    const valid =
      m.mission === 'TRANSFER'
        ? target.ownerAccountId === m.ownerAccountId
        : await areAllies(tx, ev.worldId, m.ownerAccountId, target.ownerAccountId);
    if (valid) {
      let targetState = await settledEconomy(tx, target.id, ev);
      let originState = await settledEconomy(tx, origin.id, ev);
      if (m.mission === 'TRANSFER')
        await addToStacks(
          tx,
          troopStacks,
          ev.worldId,
          target.id,
          Object.entries(m.units).map(([unitType, quantity]) => ({ unitType, quantity })),
        );
      else
        for (const [unitType, quantity] of Object.entries(m.units))
          await tx
            .insert(garrisons)
            .values({
              worldId: ev.worldId,
              villageId: target.id,
              originVillageId: origin.id,
              ownerAccountId: m.ownerAccountId,
              unitType,
              quantity,
            })
            .onConflictDoUpdate({
              target: [garrisons.villageId, garrisons.originVillageId, garrisons.unitType],
              set: { quantity: sql`${garrisons.quantity}+${quantity}` },
            });
      await tx.update(armyMovements).set({ status: 'COMPLETED' }).where(eq(armyMovements.id, m.id));
      targetState = await withRecomputedRates(tx, r, target.id, targetState);
      originState = await withRecomputedRates(tx, r, origin.id, originState);
      await saveEconomy(tx, target.id, targetState);
      await saveEconomy(tx, origin.id, originState);
      return;
    }
    const returnsAt = addSeconds(
      ev.dueAt,
      travelSeconds(
        distanceMilli(origin, target),
        slowestSpeed(
          r,
          Object.entries(m.units).map(([unitType, quantity]) => ({
            unitType: unitType as UnitType,
            quantity,
          })),
        ),
        world.speedMultiplier,
      ),
    );
    await tx
      .update(armyMovements)
      .set({ status: 'RETURNING', returnsAt })
      .where(eq(armyMovements.id, m.id));
    await scheduleEvent(tx, {
      worldId: ev.worldId,
      type: 'MOVEMENT_RETURN',
      villageId: origin.id,
      dueAt: returnsAt,
      dedupeKey: `return:${m.id}`,
      payload: { movementId: m.id },
    });
    await scheduleInterceptions(tx, world, m.id, ev.dueAt);
    return;
  }
  // Un destino propio o aliado al llegar ya no es un blanco hostil.
  if (
    target.ownerAccountId === m.ownerAccountId ||
    (await areAllies(tx, ev.worldId, m.ownerAccountId, target.ownerAccountId))
  ) {
    const returnsAt = addSeconds(
      ev.dueAt,
      travelSeconds(
        distanceMilli(origin, target),
        slowestSpeed(
          r,
          Object.entries(m.units).map(([unitType, quantity]) => ({
            unitType: unitType as UnitType,
            quantity,
          })),
        ),
        world.speedMultiplier,
      ),
    );
    await tx
      .update(armyMovements)
      .set({ status: 'RETURNING', returnsAt })
      .where(eq(armyMovements.id, m.id));
    await scheduleEvent(tx, {
      worldId: ev.worldId,
      type: 'MOVEMENT_RETURN',
      villageId: origin.id,
      dueAt: returnsAt,
      dedupeKey: `return:${m.id}`,
      payload: { movementId: m.id },
    });
    await scheduleInterceptions(tx, world, m.id, ev.dueAt);
    return;
  }

  const civOf = async (accountId: string | null): Promise<CivilizationId | null> => {
    if (!accountId) return null;
    const [p] = await tx
      .select({ civ: worldPlayers.civilization })
      .from(worldPlayers)
      .where(and(eq(worldPlayers.worldId, ev.worldId), eq(worldPlayers.accountId, accountId)));
    return (p?.civ as CivilizationId | undefined) ?? null;
  };
  const attackerCiv = await civOf(m.ownerAccountId);
  if (!attackerCiv) throw new DomainError('NOT_A_MEMBER', 500, 'atacante sin membresía');
  const defenderCiv = await civOf(target.ownerAccountId);

  const affectedParents = new Set<string>();
  if (m.mission === 'CONQUER' && target.parentVillageId && target.parentVillageId !== origin.id) {
    await lockVillages(tx, ev.worldId, [target.parentVillageId]);
    await processEventsUpTo(
      tx,
      ctx,
      EVENT_HANDLERS,
      new Set([...locksetOf(ev), target.parentVillageId]),
      { dueAt: ev.dueAt, priority: ev.priority, id: ev.id },
      ev.id,
    );
    affectedParents.add(target.parentVillageId);
  }
  // Ambas aldeas liquidadas hasta el instante del impacto.
  let targetState = await settledEconomy(tx, target.id, ev);
  let originState = await settledEconomy(tx, origin.id, ev);

  const ownDefenders = await loadTroops(tx, target.id);
  const guests = await tx
    .select()
    .from(garrisons)
    .where(and(eq(garrisons.worldId, ev.worldId), eq(garrisons.villageId, target.id)))
    .orderBy(garrisons.originVillageId, garrisons.unitType);
  const defenderTroops = [
    ...ownDefenders,
    ...guests.map((g) => ({ unitType: g.unitType as UnitType, quantity: g.quantity })),
  ];
  const tBuildings = await loadBuildings(tx, target.id);
  const battleId = newId();
  const seed = `${world.mapSeed}:${movementId}`;
  const snapshot: BattleSnapshot = {
    battleId,
    worldId: ev.worldId,
    seed,
    rulesetVersion: r.version,
    mission: m.mission === 'RAID' ? 'RAID' : 'ATTACK',
    attacker: {
      civilization: attackerCiv,
      units: Object.entries(m.units).map(([unitType, quantity]) => ({
        unitType: unitType as UnitType,
        quantity,
      })),
    },
    defender: {
      civilization: defenderCiv,
      units: defenderTroops,
      doctrine: {
        reservePercent: target.doctrineReservePercent,
        retreatThresholdPercent: target.doctrineRetreatThresholdPercent,
      },
    },
    defenses: {
      wallLevel:
        levelOf(tBuildings, 'wall') +
        levelOf(tBuildings, 'middle_wall') +
        levelOf(tBuildings, 'inner_wall'),
      bastionLevel: levelOf(tBuildings, 'imperial_bastion') + levelOf(tBuildings, 'watchtower'),
      hospitalLevel: guests.length ? 0 : levelOf(tBuildings, 'hospital'),
    },
    terrain: { kind: 'PLAIN' },
    defenderResources: milliToWholeUnits(targetState.amounts),
  };
  if (r.territory)
    snapshot.defenses.traps = Math.max(
      0,
      levelOf(tBuildings, 'trapper') * r.territory.trapsPerLevel - target.trapsUsed,
    );
  const result = resolveBattle(r, snapshot);
  if (result.trapsUsed)
    await tx
      .update(villages)
      .set({ trapsUsed: target.trapsUsed + result.trapsUsed })
      .where(eq(villages.id, target.id));

  // --- Defensor: bajas, heridos y botín ------------------------------------
  const dead = new Map<UnitType, number>();
  for (const loss of [...result.defender.killed, ...result.defender.wounded])
    dead.set(loss.unitType, (dead.get(loss.unitType) ?? 0) + loss.quantity);
  const ownWounded: Array<{ unitType: UnitType; quantity: number }> = [];
  for (const [unitType, totalLoss] of dead) {
    const own = ownDefenders.find((s) => s.unitType === unitType)?.quantity ?? 0;
    const matching = guests.filter((g) => g.unitType === unitType);
    const total = own + matching.reduce((sum, g) => sum + g.quantity, 0);
    const portions = [
      { own: true, quantity: own },
      ...matching.map((g) => ({ own: false, quantity: g.quantity })),
    ];
    const losses = portions.map((p) => Math.floor((totalLoss * p.quantity) / Math.max(1, total)));
    let remaining = totalLoss - losses.reduce((sum, n) => sum + n, 0);
    for (let i = 0; remaining > 0 && i < portions.length; i++)
      if (losses[i]! < portions[i]!.quantity) {
        losses[i]!++;
        remaining--;
      }
    if (losses[0]) await removeFromStacks(tx, target.id, [{ unitType, quantity: losses[0] }]);
    for (const [i, g] of matching.entries())
      if (losses[i + 1])
        await tx
          .update(garrisons)
          .set({ quantity: sql`${garrisons.quantity}-${losses[i + 1]}` })
          .where(
            and(
              eq(garrisons.villageId, g.villageId),
              eq(garrisons.originVillageId, g.originVillageId),
              eq(garrisons.unitType, unitType),
            ),
          );
    const wounded = result.defender.wounded.find((w) => w.unitType === unitType)?.quantity ?? 0;
    ownWounded.push({
      unitType,
      quantity: Math.min(losses[0] ?? 0, Math.floor((wounded * own) / Math.max(1, total))),
    });
  }
  await addToStacks(tx, woundedStacks, ev.worldId, target.id, ownWounded);
  const lootMilli = bundleToMilli(result.loot);
  if (lootMilli.wood + lootMilli.stone + lootMilli.iron + lootMilli.food > 0n) {
    targetState = debit(targetState, lootMilli);
    await writeLedger(tx, {
      worldId: ev.worldId,
      villageId: target.id,
      reason: 'LOOT_OUT',
      refId: movementId,
      deltaMilli: negate(lootMilli),
      at: ev.dueAt,
    });
  }

  if (m.mission === 'CONQUER' && r.territory && result.outcome === 'ATTACKER') {
    const chiefs = result.attacker.survivors.find((s) => s.unitType === 'chieftain')?.quantity ?? 0;
    const loyalty =
      target.kind === 'OASIS'
        ? 0
        : Math.max(0, target.loyalty - chiefs * r.territory.loyaltyPerChief);
    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(villages)
      .where(
        and(
          eq(villages.worldId, ev.worldId),
          eq(
            villages.ownerAccountId,
            target.ownerAccountId ?? '00000000-0000-0000-0000-000000000000',
          ),
          eq(villages.kind, 'PLAYER'),
        ),
      );
    const noDefenders = result.defender.survivors.length === 0;
    if (
      !target.isCapital &&
      (target.kind === 'OASIS' || chiefs > 0) &&
      (!target.ownerAccountId || target.kind === 'OASIS' || (countRow?.count ?? 0) > 1)
    ) {
      await tx.update(villages).set({ loyalty }).where(eq(villages.id, target.id));
      if (loyalty === 0 && noDefenders) {
        if (target.kind === 'OASIS') {
          const [oasisCountRow] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(villages)
            .where(
              and(
                eq(villages.worldId, ev.worldId),
                eq(villages.kind, 'OASIS'),
                eq(villages.parentVillageId, origin.id),
              ),
            );
          if ((oasisCountRow?.count ?? 0) < r.territory.maxOasesPerVillage)
            await tx
              .update(villages)
              .set({ ownerAccountId: m.ownerAccountId, parentVillageId: origin.id, loyalty: 100 })
              .where(eq(villages.id, target.id));
        } else {
          await tx
            .update(villages)
            .set({ ownerAccountId: m.ownerAccountId, kind: 'PLAYER', loyalty: 100, trapsUsed: 0 })
            .where(eq(villages.id, target.id));
          await tx
            .update(villages)
            .set({ ownerAccountId: m.ownerAccountId })
            .where(
              and(
                eq(villages.worldId, ev.worldId),
                eq(villages.parentVillageId, target.id),
                eq(villages.kind, 'OASIS'),
              ),
            );
          await tx
            .update(constructionOrders)
            .set({ status: 'CANCELLED' })
            .where(
              and(
                eq(constructionOrders.villageId, target.id),
                eq(constructionOrders.status, 'IN_PROGRESS'),
              ),
            );
          await tx
            .update(recruitmentOrders)
            .set({ status: 'CANCELLED' })
            .where(
              and(
                eq(recruitmentOrders.villageId, target.id),
                eq(recruitmentOrders.status, 'IN_PROGRESS'),
              ),
            );
          await tx
            .update(settlementOrders)
            .set({ status: 'CANCELLED' })
            .where(
              and(
                eq(settlementOrders.originVillageId, target.id),
                eq(settlementOrders.status, 'IN_PROGRESS'),
              ),
            );
          for (const b of tBuildings) {
            const def = r.buildings.find((d) => d.type === b.type);
            if (def?.civilization && def.civilization !== attackerCiv)
              await tx
                .delete(villageBuildings)
                .where(
                  and(eq(villageBuildings.villageId, target.id), eq(villageBuildings.plot, b.plot)),
                );
          }
        }
      }
    }
  }
  // --- Atacante: supervivientes regresan con el botín ----------------------
  const survivors = Object.fromEntries(
    result.attacker.survivors.map((s) => [s.unitType, s.quantity]),
  );
  const anySurvivor = result.attacker.survivors.length > 0;
  let returnsAt: Date | null = null;
  if (anySurvivor) {
    const secs = travelSeconds(
      distanceMilli(origin, target),
      slowestSpeed(r, result.attacker.survivors),
      world.speedMultiplier,
    );
    returnsAt = addSeconds(ev.dueAt, secs);
  }
  await tx
    .update(armyMovements)
    .set({
      status: anySurvivor ? 'RETURNING' : 'COMPLETED',
      units: survivors,
      loot: anySurvivor ? result.loot : null,
      returnsAt,
      battleId,
    })
    .where(eq(armyMovements.id, movementId));

  await tx.insert(battles).values({
    id: battleId,
    worldId: ev.worldId,
    movementId,
    attackerAccountId: m.ownerAccountId,
    defenderAccountId: target.ownerAccountId,
    attackerVillageId: origin.id,
    defenderVillageId: target.id,
    mission: m.mission,
    outcome: result.outcome,
    occurredAt: ev.dueAt,
    seed,
    rulesetVersion: r.version,
    snapshot,
    result,
  });

  if (anySurvivor && returnsAt) {
    await scheduleEvent(tx, {
      worldId: ev.worldId,
      type: 'MOVEMENT_RETURN',
      villageId: origin.id,
      dueAt: returnsAt,
      dedupeKey: `return:${movementId}`,
      payload: { movementId },
    });
  }

  await scheduleInterceptions(tx, world, m.id, ev.dueAt);
  // Mantenimiento: las bajas dejan de consumir desde el instante del combate.
  targetState = await withRecomputedRates(tx, r, target.id, targetState);
  originState = await withRecomputedRates(tx, r, origin.id, originState);
  await saveEconomy(tx, target.id, targetState);
  await saveEconomy(tx, origin.id, originState);
  for (const parent of affectedParents)
    await saveEconomy(
      tx,
      parent,
      await withRecomputedRates(tx, r, parent, await settledEconomy(tx, parent, ev)),
    );

  await tx.insert(outbox).values({
    worldId: ev.worldId,
    type: 'BattleResolved',
    payload: { battleId, movementId, outcome: result.outcome },
  });
  ctx.log.info('battle.resolved', {
    world_id: ev.worldId,
    battle_id: battleId,
    movement_id: movementId,
    outcome: result.outcome,
    loot_total: Number(
      (lootMilli.wood + lootMilli.stone + lootMilli.iron + lootMilli.food) / MILLI,
    ),
  });
};

export const EVENT_HANDLERS: Record<EventType, EventHandler> = {
  CONSTRUCTION_COMPLETE: constructionComplete,
  RECRUITMENT_COMPLETE: recruitmentComplete,
  MOVEMENT_RETURN: movementReturn,
  MOVEMENT_ARRIVAL: movementArrival,
  SETTLEMENT_COMPLETE: settlementComplete,
  FIELD_ENCOUNTER: fieldEncounter,
};
