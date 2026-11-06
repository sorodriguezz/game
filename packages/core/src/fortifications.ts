import { and, eq } from 'drizzle-orm';
import { constructionOrders, wallRepairOrders, wallSections } from '@reinos/db';
import {
  repairWallRequestSchema,
  type RepairWallRequest,
  type RepairWallResponse,
} from '@reinos/contracts';
import type { CivilizationId } from '@reinos/game-config';
import {
  bundleToMilli,
  canAfford,
  debit,
  levelOf,
  wallRepairQuote,
  wallType,
} from '@reinos/game-rules';
import { prepareVillage, type Actor } from './commands.js';
import { err, type CoreContext } from './context.js';
import { assertIdempotencyKey, runIdempotent } from './idempotency.js';
import { scheduleEvent } from './events.js';
import { loadBuildings, negate, rulesetOf, saveEconomy, writeLedger } from './village-state.js';
import { addSeconds, iso, newId } from './util.js';
import { worldPlayers } from '@reinos/db';

export class FortificationService {
  constructor(private readonly ctx: CoreContext) {}
  async repair(
    actor: Actor,
    worldId: string,
    villageId: string,
    input: RepairWallRequest,
    idemKey: string | undefined,
  ): Promise<RepairWallResponse> {
    const req = repairWallRequestSchema.parse(input),
      key = assertIdempotencyKey(idemKey);
    return this.ctx.db.transaction(async (tx) => {
      const { response } = await runIdempotent(
        tx,
        { accountId: actor.accountId, worldId, command: `repair:${villageId}`, key },
        req,
        async () => {
          const { world, state, now } = await prepareVillage(
            tx,
            this.ctx,
            actor,
            worldId,
            villageId,
          );
          const r = rulesetOf(world);
          if (!r.fortifications)
            throw err.unprocessable(
              'FEATURE_DISABLED',
              'Este mundo no usa reparaciones por recinto',
            );
          const [wall] = await tx
            .select()
            .from(wallSections)
            .where(
              and(
                eq(wallSections.worldId, worldId),
                eq(wallSections.villageId, villageId),
                eq(wallSections.precinct, req.precinct),
              ),
            );
          const [busy] = await tx
            .select()
            .from(wallRepairOrders)
            .where(
              and(
                eq(wallRepairOrders.worldId, worldId),
                eq(wallRepairOrders.villageId, villageId),
                eq(wallRepairOrders.precinct, req.precinct),
                eq(wallRepairOrders.status, 'IN_PROGRESS'),
              ),
            );
          const type = wallType(req.precinct);
          const [building] = await tx
            .select()
            .from(constructionOrders)
            .where(
              and(
                eq(constructionOrders.villageId, villageId),
                eq(constructionOrders.buildingType, type),
                eq(constructionOrders.status, 'IN_PROGRESS'),
              ),
            );
          if (busy || building)
            throw err.conflict('CONSTRUCTION_QUEUE_BUSY', 'Esta muralla ya tiene una obra');
          const level = levelOf(await loadBuildings(tx, villageId), type);
          if (!wall || !level || wall.integrity === 1000)
            throw err.unprocessable(
              'REQUIREMENTS_NOT_MET',
              'La muralla debe existir y estar dañada',
            );
          const [player] = await tx
            .select()
            .from(worldPlayers)
            .where(
              and(eq(worldPlayers.worldId, worldId), eq(worldPlayers.accountId, actor.accountId)),
            );
          const quote = wallRepairQuote(
            r,
            type,
            level,
            wall.integrity,
            player!.civilization as CivilizationId,
            world.speedMultiplier,
          );
          const cost = bundleToMilli(quote.cost);
          if (!canAfford(state, cost))
            throw err.conflict('INSUFFICIENT_RESOURCES', 'Recursos insuficientes');
          const id = newId(),
            completesAt = addSeconds(now, quote.seconds);
          await tx.insert(wallRepairOrders).values({
            id,
            worldId,
            villageId,
            precinct: req.precinct,
            restoreIntegrity: quote.restoreIntegrity,
            startedAt: now,
            completesAt,
          });
          await saveEconomy(tx, villageId, debit(state, cost));
          await writeLedger(tx, {
            worldId,
            villageId,
            reason: 'WALL_REPAIR',
            refId: id,
            deltaMilli: negate(cost),
            at: now,
          });
          await scheduleEvent(tx, {
            worldId,
            type: 'WALL_REPAIR_COMPLETE',
            villageId,
            dueAt: completesAt,
            dedupeKey: `wall-repair:${id}`,
            payload: { orderId: id },
          });
          return {
            orderId: id,
            completesAt: iso(completesAt),
            restoreIntegrity: quote.restoreIntegrity,
          };
        },
      );
      return response;
    });
  }
}
