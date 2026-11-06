import { and, eq, sql } from 'drizzle-orm';
import {
  cultureStreams,
  celebrations,
  villageExpansions,
  settlementOrders,
  armyMovements,
  villages,
  worlds,
  type DbOrTx,
  type Tx,
} from '@reinos/db';
import {
  cultureRate,
  cultureSlots,
  expansionThreshold,
  levelOf,
  bundleToMilli,
  canAfford,
  debit,
} from '@reinos/game-rules';
import type { CultureView } from '@reinos/contracts';
import {
  loadBuildings,
  rulesetOf,
  saveEconomy,
  writeLedger,
  negate,
  type WorldRow,
} from './village-state.js';
import { err, type CoreContext } from './context.js';
import { newId, iso, addSeconds } from './util.js';
import { scheduleEvent, type EventHandler } from './events.js';
import { runIdempotent, assertIdempotencyKey } from './idempotency.js';
import type { Actor } from './commands.js';

/** Cierra el tramo anterior tras una mutación y abre la tasa/propiedad que resulta. */
export async function refreshCulture(tx: Tx, world: WorldRow, villageId: string, at: Date) {
  const r = rulesetOf(world);
  if (!r.culture) return;
  const [v] = await tx
    .select()
    .from(villages)
    .where(and(eq(villages.worldId, world.id), eq(villages.id, villageId)));
  const rate =
    v?.kind === 'PLAYER' && v.ownerAccountId
      ? cultureRate(r, await loadBuildings(tx, villageId), world.speedMultiplier)
      : 0n;
  const [previous] = await tx
    .select()
    .from(cultureStreams)
    .where(
      and(
        eq(cultureStreams.worldId, world.id),
        eq(cultureStreams.villageId, villageId),
        sql`${cultureStreams.endsAt} is null`,
      ),
    );
  if (previous && previous.accountId === v?.ownerAccountId && previous.rateMilliPerDay === rate)
    return;
  if (previous)
    await tx.update(cultureStreams).set({ endsAt: at }).where(eq(cultureStreams.id, previous.id));
  if (v?.kind === 'PLAYER' && v.ownerAccountId)
    await tx.insert(cultureStreams).values({
      id: newId(),
      worldId: world.id,
      villageId,
      accountId: v.ownerAccountId,
      rateMilliPerDay: rate,
      startsAt: at,
    });
}
export async function pauseCulture(tx: Tx, world: WorldRow, at: Date) {
  if (!rulesetOf(world).culture) return;
  await tx
    .update(cultureStreams)
    .set({ endsAt: at })
    .where(and(eq(cultureStreams.worldId, world.id), sql`${cultureStreams.endsAt} is null`));
}
export async function resumeCulture(tx: Tx, world: WorldRow, at: Date) {
  if (!rulesetOf(world).culture) return;
  const owned = await tx
    .select({ id: villages.id })
    .from(villages)
    .where(and(eq(villages.worldId, world.id), eq(villages.kind, 'PLAYER')));
  for (const v of owned) await refreshCulture(tx, world, v.id, at);
}
export async function culturePoints(
  db: DbOrTx,
  worldId: string,
  accountId: string,
  at: Date,
): Promise<bigint> {
  const time = iso(at);
  const result = await db.execute(
    sql`select coalesce(sum(rate_milli_per_day::numeric*greatest(0,extract(epoch from (least(coalesce(ends_at,${time}::timestamptz),${time}::timestamptz)-starts_at))*1000)),0)::text as ticks from culture_streams where world_id=${worldId} and account_id=${accountId}`,
  );
  const rewards = await db.execute(
    sql`select coalesce(sum(points),0)::text as points from celebrations where world_id=${worldId} and account_id=${accountId} and status='COMPLETED' and completes_at<=${time}::timestamptz`,
  );
  // El formato numeric de PostgreSQL puede contener .000, todos los tiempos son ms enteros.
  return (
    BigInt(String(result.rows[0]!.ticks).split('.')[0]!) / 86400000n +
    BigInt(String(rewards.rows[0]!.points)) * 1000n
  );
}
export async function expansionView(
  db: DbOrTx,
  world: WorldRow,
  accountId: string,
  originId: string,
  at: Date,
  excludeTarget?: string,
): Promise<CultureView> {
  const r = rulesetOf(world);
  const owned = await db
    .select({ id: villages.id })
    .from(villages)
    .where(
      and(
        eq(villages.worldId, world.id),
        eq(villages.ownerAccountId, accountId),
        eq(villages.kind, 'PLAYER'),
      ),
    );
  const own = new Set(owned.map((v) => v.id));
  const found = await db
    .select()
    .from(settlementOrders)
    .where(
      and(
        eq(settlementOrders.worldId, world.id),
        eq(settlementOrders.ownerAccountId, accountId),
        eq(settlementOrders.status, 'IN_PROGRESS'),
      ),
    );
  const conquers = await db
    .select()
    .from(armyMovements)
    .where(
      and(
        eq(armyMovements.worldId, world.id),
        eq(armyMovements.ownerAccountId, accountId),
        eq(armyMovements.mission, 'CONQUER'),
        eq(armyMovements.status, 'IN_TRANSIT'),
      ),
    );
  const targets = new Set(
    conquers
      .filter((m) => m.targetVillageId !== excludeTarget && !own.has(m.targetVillageId))
      .map((m) => m.targetVillageId),
  );
  const originTargets = new Set(
    conquers
      .filter(
        (m) =>
          m.originVillageId === originId &&
          m.targetVillageId !== excludeTarget &&
          !own.has(m.targetVillageId),
      )
      .map((m) => m.targetVillageId),
  );
  const used = await db
    .select()
    .from(villageExpansions)
    .where(
      and(eq(villageExpansions.worldId, world.id), eq(villageExpansions.originVillageId, originId)),
    );
  const active = (
    await db
      .select()
      .from(celebrations)
      .where(
        and(
          eq(celebrations.worldId, world.id),
          eq(celebrations.villageId, originId),
          eq(celebrations.status, 'IN_PROGRESS'),
        ),
      )
  )[0];
  const rate = await db.execute(
    sql`select coalesce(sum(rate_milli_per_day),0)::text as n from culture_streams where world_id=${world.id} and account_id=${accountId} and ends_at is null`,
  );
  const pending = found.length + targets.size;
  return {
    pointsMilli: Number(await culturePoints(db, world.id, accountId, at)),
    perDay: Number(rate.rows[0]!.n) / 1000,
    requiredMilli: Number(expansionThreshold(r, owned.length + pending)),
    ownedVillages: owned.length,
    pendingVillages: pending,
    slots: cultureSlots(r, levelOf(await loadBuildings(db, originId), 'castle')),
    usedSlots: used.length,
    pendingSlots: found.filter((s) => s.originVillageId === originId).length + originTargets.size,
    celebration: active
      ? {
          id: active.id,
          points: active.points,
          startedAt: iso(active.startedAt),
          completesAt: iso(active.completesAt),
        }
      : null,
  };
}
/** El bloqueo del mundo serializa reservas entre todas las aldeas del jugador. */
export async function assertExpansion(
  tx: Tx,
  world: WorldRow,
  accountId: string,
  originId: string,
  at: Date,
  targetId?: string,
) {
  if (!rulesetOf(world).culture) return;
  const overdue = await tx.execute(
    sql`select e.id from scheduled_events e where e.world_id=${world.id} and e.status in ('PENDING','PROCESSING') and e.due_at<=${iso(at)}::timestamptz and exists(select 1 from villages v where v.world_id=e.world_id and v.owner_account_id=${accountId} and (v.id=e.village_id or v.id=e.secondary_village_id)) limit 1`,
  );
  if (overdue.rows.length)
    throw err.conflict(
      'EVENTS_PENDING',
      'Se están actualizando tus aldeas; reintentando expansión',
    );
  const view = await expansionView(tx, world, accountId, originId, at, targetId);
  if (view.usedSlots + view.pendingSlots >= view.slots)
    throw err.conflict('REQUIREMENTS_NOT_MET', 'No hay cupos de expansión libres en el Castillo', {
      slots: view.slots,
      used: view.usedSlots,
      pending: view.pendingSlots,
    });
  if (view.pointsMilli < view.requiredMilli)
    throw err.conflict('REQUIREMENTS_NOT_MET', 'Faltan puntos de cultura para otra aldea', {
      cultureMilli: view.pointsMilli,
      requiredMilli: view.requiredMilli,
    });
}
export async function completeExpansion(
  tx: Tx,
  world: WorldRow,
  originId: string,
  targetId: string,
  at: Date,
) {
  if (!rulesetOf(world).culture) return;
  await tx
    .insert(villageExpansions)
    .values({
      worldId: world.id,
      originVillageId: originId,
      targetVillageId: targetId,
      createdAt: at,
    })
    .onConflictDoUpdate({
      target: [villageExpansions.worldId, villageExpansions.targetVillageId],
      set: { originVillageId: originId, createdAt: at },
    });
}
export class CultureService {
  constructor(private readonly ctx: CoreContext) {}
  async celebrate(actor: Actor, worldId: string, villageId: string, key: string | undefined) {
    const idem = assertIdempotencyKey(key);
    return this.ctx.db.transaction(
      async (tx) =>
        (
          await runIdempotent(
            tx,
            { accountId: actor.accountId, worldId, command: `celebrate:${villageId}`, key: idem },
            {},
            async () => {
              await tx.select().from(worlds).where(eq(worlds.id, worldId)).for('no key update');
              const { prepareVillage } = await import('./commands.js');
              const { world, state, now } = await prepareVillage(
                  tx,
                  this.ctx,
                  actor,
                  worldId,
                  villageId,
                ),
                r = rulesetOf(world),
                c = r.culture;
              if (!c) throw err.conflict('FEATURE_DISABLED', 'Este mundo no usa celebraciones');
              if (levelOf(await loadBuildings(tx, villageId), 'town_hall') < 1)
                throw err.conflict('REQUIREMENTS_NOT_MET', 'Construye un Ayuntamiento');
              if (
                (
                  await tx
                    .select()
                    .from(celebrations)
                    .where(
                      and(
                        eq(celebrations.worldId, worldId),
                        eq(celebrations.villageId, villageId),
                        eq(celebrations.status, 'IN_PROGRESS'),
                      ),
                    )
                ).length
              )
                throw err.conflict('ALREADY_COMMITTED', 'Ya hay una celebración en curso');
              const id = newId(),
                cost = bundleToMilli(c.celebrationCost),
                completesAt = addSeconds(
                  now,
                  Math.max(1, Math.ceil(c.celebrationSeconds / world.speedMultiplier)),
                );
              if (!canAfford(state, cost))
                throw err.conflict('INSUFFICIENT_RESOURCES', 'Recursos insuficientes');
              await saveEconomy(tx, villageId, debit(state, cost));
              await writeLedger(tx, {
                worldId,
                villageId,
                refId: id,
                reason: 'CELEBRATION',
                deltaMilli: negate(cost),
                at: now,
              });
              await tx.insert(celebrations).values({
                id,
                worldId,
                villageId,
                accountId: actor.accountId,
                points: c.celebrationPoints,
                startedAt: now,
                completesAt,
              });
              await scheduleEvent(tx, {
                worldId,
                villageId,
                type: 'CELEBRATION_COMPLETE',
                dueAt: completesAt,
                dedupeKey: `celebration:${id}`,
                payload: { orderId: id },
              });
              return {
                id,
                points: c.celebrationPoints,
                startedAt: iso(now),
                completesAt: iso(completesAt),
              };
            },
          )
        ).response,
    );
  }
}
export const celebrationComplete: EventHandler = async (tx, _ctx, ev) => {
  const [order] = await tx
    .select()
    .from(celebrations)
    .where(
      and(
        eq(celebrations.worldId, ev.worldId),
        eq(celebrations.villageId, ev.villageId),
        eq(celebrations.id, String(ev.payload.orderId)),
      ),
    )
    .for('update');
  if (!order || order.status !== 'IN_PROGRESS') return;
  const [v] = await tx
    .select()
    .from(villages)
    .where(and(eq(villages.worldId, ev.worldId), eq(villages.id, ev.villageId)));
  await tx
    .update(celebrations)
    .set({ status: v?.ownerAccountId === order.accountId ? 'COMPLETED' : 'CANCELLED' })
    .where(eq(celebrations.id, order.id));
};
