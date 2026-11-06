import { and, eq, inArray, sql } from 'drizzle-orm';
import { refreshCulture } from './culture.js';
import {
  developmentOrders,
  villageResearch,
  villageBuildings,
  villages,
  constructionOrders,
  recruitmentOrders,
  wallRepairOrders,
  type DbOrTx,
} from '@reinos/db';
import {
  developmentRequestSchema,
  type DevelopmentRequest,
  type DevelopmentOrderView,
  type ResearchView,
} from '@reinos/contracts';
import { unitDef, type UnitType } from '@reinos/game-config';
import {
  developmentQuote,
  bundleToMilli,
  canAfford,
  debit,
  levelOf,
  settle,
  researchModifiers,
  type CombatModifiers,
} from '@reinos/game-rules';
import type { Actor } from './commands.js';
import { err, type CoreContext } from './context.js';
import { requirePlayer } from './access.js';
import { runIdempotent, assertIdempotencyKey } from './idempotency.js';
import { scheduleEvent, type EventHandler } from './events.js';
import { newId, iso, addSeconds } from './util.js';
import {
  loadBuildings,
  loadEconomy,
  loadWorld,
  rulesetOf,
  saveEconomy,
  withRecomputedRates,
  writeLedger,
  negate,
} from './village-state.js';
export async function researchOf(
  db: DbOrTx,
  worldId: string,
  villageId: string,
): Promise<ResearchView[]> {
  return (
    await db
      .select()
      .from(villageResearch)
      .where(and(eq(villageResearch.worldId, worldId), eq(villageResearch.villageId, villageId)))
  ).map((row) => ({
    unitType: row.unitType as UnitType,
    kind: row.kind as ResearchView['kind'],
    level: row.level,
  }));
}
export async function combatResearch(
  db: DbOrTx,
  worldId: string,
  villageId: string,
): Promise<CombatModifiers> {
  return researchModifiers(
    rulesetOf(await loadWorld(db, worldId)),
    await researchOf(db, worldId, villageId),
  );
}
export async function defendingResearch(
  db: DbOrTx,
  worldId: string,
  villageId: string,
  home: readonly { unitType: UnitType; quantity: number }[],
  guests: readonly { unitType: string; quantity: number; originVillageId: string }[],
): Promise<CombatModifiers> {
  const r = rulesetOf(await loadWorld(db, worldId));
  if (!r.development) return {};
  const origins = [villageId, ...new Set(guests.map((g) => g.originVillageId))],
    rows = await db
      .select()
      .from(villageResearch)
      .where(
        and(eq(villageResearch.worldId, worldId), inArray(villageResearch.villageId, origins)),
      ),
    byOrigin = new Map(
      origins.map((id) => [
        id,
        researchModifiers(
          r,
          rows
            .filter((row) => row.villageId === id)
            .map((row) => ({ ...row, unitType: row.unitType as UnitType })),
        ),
      ]),
    );
  const total = new Map<UnitType, { quantity: number; attack: number; defense: number }>();
  for (const source of [...home.map((t) => ({ ...t, originVillageId: villageId })), ...guests]) {
    const type = source.unitType as UnitType,
      current = total.get(type) ?? { quantity: 0, attack: 0, defense: 0 },
      boost = byOrigin.get(source.originVillageId)?.[type];
    current.quantity += source.quantity;
    current.attack += source.quantity * (boost?.attackPermille ?? 0);
    current.defense += source.quantity * (boost?.defensePermille ?? 0);
    total.set(type, current);
  }
  return Object.fromEntries(
    [...total]
      .filter(([, v]) => v.quantity > 0)
      .map(([type, v]) => [
        type,
        {
          attackPermille: Math.floor(v.attack / v.quantity),
          defensePermille: Math.floor(v.defense / v.quantity),
        },
      ]),
  );
}
export class DevelopmentService {
  constructor(private readonly ctx: CoreContext) {}
  async start(
    actor: Actor,
    worldId: string,
    villageId: string,
    input: DevelopmentRequest,
    key: string | undefined,
  ): Promise<DevelopmentOrderView> {
    const req = developmentRequestSchema.parse(input);
    await requirePlayer(this.ctx.db, actor.accountId, worldId, this.ctx.clock.now());
    return this.ctx.db.transaction(
      async (tx) =>
        (
          await runIdempotent(
            tx,
            {
              accountId: actor.accountId,
              worldId,
              command: 'development',
              key: assertIdempotencyKey(key),
            },
            req,
            async () => {
              const { prepareVillage } = await import('./commands.js');
              const { world, state, now } = await prepareVillage(
                  tx,
                  this.ctx,
                  actor,
                  worldId,
                  villageId,
                ),
                r = rulesetOf(world),
                config = r.development;
              if (!config)
                throw err.unprocessable(
                  'FEATURE_DISABLED',
                  'Desarrollo no disponible en este mundo',
                );
              const buildings = await loadBuildings(tx, villageId),
                lane =
                  req.kind === 'DEMOLISH'
                    ? 'DEMOLITION'
                    : req.kind === 'UNLOCK'
                      ? 'ACADEMY'
                      : 'SMITHY';
              const [pending] = await tx
                .select()
                .from(developmentOrders)
                .where(
                  and(
                    eq(developmentOrders.worldId, worldId),
                    eq(developmentOrders.villageId, villageId),
                    eq(developmentOrders.lane, lane),
                    eq(developmentOrders.status, 'IN_PROGRESS'),
                  ),
                );
              if (pending)
                throw err.conflict(
                  'CONSTRUCTION_QUEUE_BUSY',
                  'La instalación ya tiene una orden en curso',
                );
              let target: string,
                targetLevel: number,
                plot: number | null = null,
                seconds: number,
                cost = { wood: 0, stone: 0, iron: 0, food: 0 };
              if (req.kind === 'DEMOLISH') {
                const existing = buildings.find((b) => b.plot === req.plot);
                if (!existing) throw err.notFound('PLOT_NOT_FOUND');
                if (['city_hall', 'wonder'].includes(existing.type))
                  throw err.conflict('NOT_ELIGIBLE', 'Esta estructura no se puede demoler');
                const [build] = await tx
                    .select()
                    .from(constructionOrders)
                    .where(
                      and(
                        eq(constructionOrders.villageId, villageId),
                        eq(constructionOrders.plot, req.plot),
                        eq(constructionOrders.status, 'IN_PROGRESS'),
                      ),
                    ),
                  [recruit] = await tx
                    .select()
                    .from(recruitmentOrders)
                    .where(
                      and(
                        eq(recruitmentOrders.villageId, villageId),
                        eq(recruitmentOrders.trainedAt, existing.type),
                        eq(recruitmentOrders.status, 'IN_PROGRESS'),
                      ),
                    ),
                  [repair] = await tx
                    .select()
                    .from(wallRepairOrders)
                    .where(
                      and(
                        eq(wallRepairOrders.villageId, villageId),
                        eq(wallRepairOrders.status, 'IN_PROGRESS'),
                      ),
                    );
                const activeResearch = await tx
                  .select()
                  .from(developmentOrders)
                  .where(
                    and(
                      eq(developmentOrders.villageId, villageId),
                      eq(developmentOrders.status, 'IN_PROGRESS'),
                    ),
                  );
                if (
                  build ||
                  recruit ||
                  (repair && existing.type.includes('wall')) ||
                  activeResearch.some(
                    (o) =>
                      o.lane ===
                      (existing.type === 'academy'
                        ? 'ACADEMY'
                        : existing.type === 'smithy'
                          ? 'SMITHY'
                          : '!'),
                  )
                )
                  throw err.conflict(
                    'CONSTRUCTION_QUEUE_BUSY',
                    'La estructura tiene órdenes pendientes',
                  );
                target = existing.type;
                targetLevel = existing.level - 1;
                plot = req.plot;
                seconds = Math.max(
                  1,
                  Math.ceil(
                    (config.demolitionBaseSeconds * existing.level) / world.speedMultiplier,
                  ),
                );
              } else {
                const def = unitDef(r, req.unitType),
                  [member] = await tx
                    .execute(
                      sql`select civilization from world_players where world_id=${worldId} and account_id=${actor.accountId}`,
                    )
                    .then((result) => result.rows as { civilization: string }[]);
                if (def.npcOnly || (def.civilization && def.civilization !== member?.civilization))
                  throw err.unprocessable('UNIT_NOT_AVAILABLE', 'Unidad de otra civilización');
                const completed = await researchOf(tx, worldId, villageId),
                  current =
                    completed.find((s) => s.unitType === req.unitType && s.kind === req.kind)
                      ?.level ?? 0;
                targetLevel = current + 1;
                target = req.unitType;
                if (req.kind === 'UNLOCK' && (!def.researchRequired || current > 0))
                  throw err.conflict('NOT_ELIGIBLE', 'La unidad ya está disponible');
                if (
                  req.kind !== 'UNLOCK' &&
                  def.researchRequired &&
                  !completed.some((s) => s.unitType === req.unitType && s.kind === 'UNLOCK')
                )
                  throw err.conflict(
                    'REQUIREMENTS_NOT_MET',
                    'Investiga primero la unidad en la Academia',
                  );
                const building = req.kind === 'UNLOCK' ? 'academy' : 'smithy';
                if (
                  levelOf(buildings, building) < (req.kind === 'UNLOCK' ? 1 : targetLevel) ||
                  def.requires.some((q) => levelOf(buildings, q.building) < q.level)
                )
                  throw err.conflict(
                    'REQUIREMENTS_NOT_MET',
                    'Faltan edificios o nivel de la instalación',
                  );
                if (targetLevel > config.maxSmithyLevel)
                  throw err.conflict('MAX_LEVEL_REACHED', 'Mejora máxima alcanzada');
                ({ cost, seconds } = developmentQuote(
                  r,
                  req.kind,
                  req.unitType,
                  targetLevel,
                  world.speedMultiplier,
                ));
              }
              const id = newId(),
                costMilli = bundleToMilli(cost);
              if (!canAfford(state, costMilli))
                throw err.conflict('INSUFFICIENT_RESOURCES', 'Recursos insuficientes');
              await saveEconomy(tx, villageId, debit(state, costMilli));
              if (Object.values(cost).some((n) => n > 0))
                await writeLedger(tx, {
                  worldId,
                  villageId,
                  reason: 'DEVELOPMENT',
                  refId: id,
                  deltaMilli: negate(costMilli),
                  at: now,
                });
              const completesAt = addSeconds(now, seconds);
              await tx.insert(developmentOrders).values({
                id,
                worldId,
                villageId,
                accountId: actor.accountId,
                kind: req.kind,
                lane,
                target,
                targetLevel,
                plot,
                startedAt: now,
                completesAt,
              });
              await scheduleEvent(tx, {
                worldId,
                villageId,
                type: 'DEVELOPMENT_COMPLETE',
                dueAt: completesAt,
                dedupeKey: `development:${id}`,
                payload: { orderId: id },
              });
              return {
                id,
                kind: req.kind,
                target,
                targetLevel,
                plot,
                startedAt: iso(now),
                completesAt: iso(completesAt),
              };
            },
          )
        ).response,
    );
  }
}
export const developmentComplete: EventHandler = async (tx, _ctx, ev) => {
  const [order] = await tx
    .select()
    .from(developmentOrders)
    .where(
      and(
        eq(developmentOrders.id, String(ev.payload.orderId)),
        eq(developmentOrders.worldId, ev.worldId),
        eq(developmentOrders.villageId, ev.villageId),
      ),
    )
    .for('update');
  if (!order || order.status !== 'IN_PROGRESS') return;
  const [v] = await tx
    .select()
    .from(villages)
    .where(and(eq(villages.worldId, ev.worldId), eq(villages.id, ev.villageId)));
  if (v?.ownerAccountId !== order.accountId) {
    await tx
      .update(developmentOrders)
      .set({ status: 'CANCELLED' })
      .where(eq(developmentOrders.id, order.id));
    return;
  }
  if (order.kind === 'DEMOLISH') {
    const state = settle(await loadEconomy(tx, v.id), ev.dueAt.getTime()),
      [building] = await tx
        .select()
        .from(villageBuildings)
        .where(and(eq(villageBuildings.villageId, v.id), eq(villageBuildings.plot, order.plot!)));
    if (building?.type === order.target && building.level > order.targetLevel) {
      if (order.targetLevel === 0)
        await tx
          .delete(villageBuildings)
          .where(and(eq(villageBuildings.villageId, v.id), eq(villageBuildings.plot, order.plot!)));
      else
        await tx
          .update(villageBuildings)
          .set({ level: order.targetLevel })
          .where(and(eq(villageBuildings.villageId, v.id), eq(villageBuildings.plot, order.plot!)));
    }
    await saveEconomy(
      tx,
      v.id,
      await withRecomputedRates(tx, rulesetOf(await loadWorld(tx, ev.worldId)), v.id, state),
    );
    await refreshCulture(tx, await loadWorld(tx, ev.worldId), v.id, ev.dueAt);
  } else
    await tx
      .insert(villageResearch)
      .values({
        worldId: ev.worldId,
        villageId: ev.villageId,
        unitType: order.target,
        kind: order.kind,
        level: order.targetLevel,
      })
      .onConflictDoUpdate({
        target: [
          villageResearch.worldId,
          villageResearch.villageId,
          villageResearch.unitType,
          villageResearch.kind,
        ],
        set: { level: sql`greatest(${villageResearch.level},${order.targetLevel})` },
      });
  await tx
    .update(developmentOrders)
    .set({ status: 'COMPLETED', completedAt: ev.dueAt })
    .where(eq(developmentOrders.id, order.id));
};
