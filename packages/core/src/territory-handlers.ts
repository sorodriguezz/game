import { and, eq } from 'drizzle-orm';
import { armyMovements, battles, settlementOrders, villages, worldPlayers } from '@reinos/db';
import type { CivilizationId, UnitType } from '@reinos/game-config';
import { addSeconds, iso, newId } from './util.js';
import { initializeVillage, areAllies, movementPath, scheduleInterceptions } from './territory.js';
import {
  loadEconomy,
  loadWorld,
  rulesetOf,
  saveEconomy,
  withRecomputedRates,
} from './village-state.js';
import {
  settle,
  resolveBattle,
  travelSeconds,
  slowestSpeed,
  distanceMilli,
  type BattleSnapshot,
} from '@reinos/game-rules';
import { scheduleEvent, type EventHandler } from './events.js';

export const settlementComplete: EventHandler = async (tx, _ctx, ev) => {
  const [o] = await tx
    .select()
    .from(settlementOrders)
    .where(
      and(
        eq(settlementOrders.id, String(ev.payload.orderId)),
        eq(settlementOrders.worldId, ev.worldId),
      ),
    )
    .for('update');
  if (!o || o.status !== 'IN_PROGRESS') return;
  const world = await loadWorld(tx, ev.worldId),
    r = rulesetOf(world);
  const [origin] = await tx.select().from(villages).where(eq(villages.id, o.originVillageId));
  if (origin?.ownerAccountId !== o.ownerAccountId) {
    await tx
      .update(settlementOrders)
      .set({ status: 'CANCELLED' })
      .where(eq(settlementOrders.id, o.id));
    return;
  }
  await initializeVillage(tx, world, o.ownerAccountId, o.name, o.x, o.y, ev.dueAt);
  await tx
    .update(settlementOrders)
    .set({ status: 'COMPLETED' })
    .where(eq(settlementOrders.id, o.id));
  await saveEconomy(
    tx,
    origin.id,
    await withRecomputedRates(
      tx,
      r,
      origin.id,
      settle(await loadEconomy(tx, origin.id), ev.dueAt.getTime()),
    ),
  );
};

export const fieldEncounter: EventHandler = async (tx, ctx, ev) => {
  const ids = ev.payload.movementIds as string[];
  const marches = [];
  for (const id of ids) {
    const [m] = await tx
      .select()
      .from(armyMovements)
      .where(and(eq(armyMovements.id, id), eq(armyMovements.worldId, ev.worldId)))
      .for('update');
    if (!m || m.status === 'COMPLETED') return;
    marches.push(m);
  }
  if (marches.length !== 2) return;
  const [a, d] = marches as [(typeof marches)[number], (typeof marches)[number]];
  if (await areAllies(tx, ev.worldId, a.ownerAccountId, d.ownerAccountId)) return;
  const paths = await Promise.all([movementPath(tx, a), movementPath(tx, d)]);
  const positions = paths.map((p) => {
    const t = ev.dueAt.getTime();
    if (t <= p.departedAt || t >= p.arrivesAt) return null;
    const u = (t - p.departedAt) / (p.arrivesAt - p.departedAt);
    return { x: p.from.x + (p.to.x - p.from.x) * u, y: p.from.y + (p.to.y - p.from.y) * u };
  });
  if (!positions[0] || !positions[1]) return;
  const rules = rulesetOf(await loadWorld(tx, ev.worldId));
  if (
    Math.hypot(positions[0].x - positions[1].x, positions[0].y - positions[1].y) * 1000 >
    rules.territory!.fieldEncounterRadiusMilli + 0.001
  )
    return;

  const world = await loadWorld(tx, ev.worldId),
    r = rulesetOf(world),
    battleId = newId();
  const civ = async (owner: string) => {
    const [p] = await tx
      .select()
      .from(worldPlayers)
      .where(and(eq(worldPlayers.worldId, ev.worldId), eq(worldPlayers.accountId, owner)));
    return p!.civilization as CivilizationId;
  };
  const units = (m: typeof a) =>
    Object.entries(m.units).map(([unitType, quantity]) => ({
      unitType: unitType as UnitType,
      quantity,
    }));
  const snap: BattleSnapshot = {
    battleId,
    worldId: ev.worldId,
    seed: `field:${ids.join(':')}:${ev.dueAt.getTime()}`,
    rulesetVersion: r.version,
    mission: 'ATTACK',
    location: 'FIELD',
    attacker: { civilization: await civ(a.ownerAccountId), units: units(a) },
    defender: {
      civilization: await civ(d.ownerAccountId),
      units: units(d),
      doctrine: { reservePercent: 0, retreatThresholdPercent: null },
    },
    defenses: { wallLevel: 0, bastionLevel: 0, hospitalLevel: 0 },
    terrain: { kind: 'PLAIN' },
    defenderResources: { wood: 0, stone: 0, iron: 0, food: 0 },
  };
  const result = resolveBattle(r, snap);
  const point = { x: Number(ev.payload.x), y: Number(ev.payload.y) };
  await tx.insert(battles).values({
    id: battleId,
    worldId: ev.worldId,
    movementId: a.id,
    attackerAccountId: a.ownerAccountId,
    defenderAccountId: d.ownerAccountId,
    attackerVillageId: a.originVillageId,
    defenderVillageId: d.originVillageId,
    mission: 'ATTACK',
    outcome: result.outcome,
    occurredAt: ev.dueAt,
    seed: snap.seed,
    rulesetVersion: r.version,
    snapshot: snap,
    result,
    location: 'FIELD',
    encounterKey: `${ids.join(':')}:${ev.dueAt.getTime()}`,
    fieldX: Math.round(point.x * 1000),
    fieldY: Math.round(point.y * 1000),
  });
  for (const [m, survivors] of [
    [a, result.attacker.survivors],
    [d, result.defender.survivors],
  ] as const) {
    const [origin] = await tx.select().from(villages).where(eq(villages.id, m.originVillageId));
    const any = survivors.length > 0;
    const returnsAt = any
      ? addSeconds(
          ev.dueAt,
          travelSeconds(
            distanceMilli(point, origin!),
            slowestSpeed(r, survivors),
            world.speedMultiplier,
          ),
        )
      : null;
    // Actualizar la trayectoria de retorno: se vuelve desde el punto del encuentro.
    await tx
      .update(armyMovements)
      .set({
        status: any ? 'RETURNING' : 'COMPLETED',
        units: Object.fromEntries(survivors.map((s) => [s.unitType, s.quantity])),
        returnsAt,
        battleId,
        loot: null,
      })
      .where(eq(armyMovements.id, m.id));
    if (returnsAt)
      await scheduleEvent(tx, {
        worldId: ev.worldId,
        type: 'MOVEMENT_RETURN',
        villageId: m.originVillageId,
        dueAt: returnsAt,
        dedupeKey: `field-return:${m.id}:${ev.id}`,
        payload: { movementId: m.id },
      });
    await saveEconomy(
      tx,
      m.originVillageId,
      await withRecomputedRates(
        tx,
        r,
        m.originVillageId,
        settle(await loadEconomy(tx, m.originVillageId), ev.dueAt.getTime()),
      ),
    );
  }
  for (const m of marches) await scheduleInterceptions(tx, world, m.id, ev.dueAt);
  ctx.log.info('field.resolved', {
    world_id: ev.worldId,
    battle_id: battleId,
    x: point.x,
    y: point.y,
    at: iso(ev.dueAt),
  });
};
