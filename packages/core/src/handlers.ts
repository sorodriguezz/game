import { and, eq } from 'drizzle-orm';
import {
  armyMovements,
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
import { scheduleEvent, type EventHandler, type EventType, type GameEvent } from './events.js';
import { addSeconds, newId } from './util.js';
import {
  addToStacks,
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
  if (!m || m.status !== 'RETURNING') return;
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
  // Tasas sin cambios: las tropas ya contaban para el mantenimiento mientras estaban fuera.
  await saveEconomy(tx, ev.villageId, state);
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

  // Ambas aldeas liquidadas hasta el instante del impacto.
  let targetState = await settledEconomy(tx, target.id, ev);
  let originState = await settledEconomy(tx, origin.id, ev);

  const defenderTroops = await loadTroops(tx, target.id);
  const tBuildings = await loadBuildings(tx, target.id);
  const battleId = newId();
  const seed = `${world.mapSeed}:${movementId}`;
  const snapshot: BattleSnapshot = {
    battleId,
    worldId: ev.worldId,
    seed,
    rulesetVersion: r.version,
    mission: m.mission,
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
      wallLevel: levelOf(tBuildings, 'wall'),
      bastionLevel: levelOf(tBuildings, 'imperial_bastion'),
      hospitalLevel: levelOf(tBuildings, 'hospital'),
    },
    terrain: { kind: 'PLAIN' },
    defenderResources: milliToWholeUnits(targetState.amounts),
  };
  const result = resolveBattle(r, snapshot);

  // --- Defensor: bajas, heridos y botín ------------------------------------
  const dead = [...result.defender.killed, ...result.defender.wounded];
  await removeFromStacks(tx, target.id, dead);
  await addToStacks(tx, woundedStacks, ev.worldId, target.id, result.defender.wounded);
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

  // Mantenimiento: las bajas dejan de consumir desde el instante del combate.
  targetState = await withRecomputedRates(tx, r, target.id, targetState);
  originState = await withRecomputedRates(tx, r, origin.id, originState);
  await saveEconomy(tx, target.id, targetState);
  await saveEconomy(tx, origin.id, originState);

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
};
