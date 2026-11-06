import { areAllies, hostile, scheduleInterceptions } from './territory.js';
import { initializeFortifications } from './fortification-state.js';
import { refreshCulture, assertExpansion } from './culture.js';
import { requirePlayer } from './access.js';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  armyMovements,
  constructionOrders,
  recruitmentOrders,
  resourceAccounts,
  villageBuildings,
  villages,
  worldPlayers,
  worlds,
  villageLayouts,
  wallRepairOrders,
  developmentOrders,
  villageResearch,
  type Tx,
  accounts,
} from '@reinos/db';
import {
  buildRequestSchema,
  doctrineRequestSchema,
  joinWorldRequestSchema,
  recruitRequestSchema,
  sendMovementRequestSchema,
  type BuildRequest,
  type BuildResponse,
  type DoctrineRequest,
  type DoctrineView,
  type JoinWorldRequest,
  type JoinWorldResponse,
  type RecruitRequest,
  type RecruitResponse,
  type SendMovementRequest,
  type SendMovementResponse,
} from '@reinos/contracts';
import { RESOURCE_KEYS, type CivilizationId, type UnitType } from '@reinos/game-config';
import {
  bundleToMilli,
  buildingCost,
  buildingSeconds,
  canAfford,
  capacityMilli,
  computeRates,
  createPrng,
  constructionLane,
  debit,
  distanceMilli,
  isCoastal,
  isSettleable,
  terrainAt,
  isStarving,
  levelOf,
  normalizeStacks,
  populationCapacity,
  populationOf,
  settle,
  slowestSpeed,
  spawnCandidates,
  travelSeconds,
  unitCost,
  unitTrainingSeconds,
  validateConstruction,
  validateRecruitment,
  oasisEligibility,
  type ResourceState,
} from '@reinos/game-rules';
import { DomainError, err, type CoreContext } from './context.js';
import { EventOrderingConflict, processEventsUpTo, scheduleEvent } from './events.js';
import { EVENT_HANDLERS } from './handlers.js';
import { assertIdempotencyKey, runIdempotent } from './idempotency.js';
import { addSeconds, iso, newId, pgConstraint, pgErrorCode } from './util.js';
import {
  assertWorldActive,
  loadAwayTroops,
  loadBuildings,
  loadEconomy,
  loadTrainingTroops,
  loadTroops,
  loadWorld,
  loadWounded,
  lockOwnedVillage,
  negate,
  removeFromStacks,
  rulesetOf,
  saveEconomy,
  stateColumns,
  militarySpeedOf,
  rulesetForVillage,
  writeLedger,
  type VillageRow,
  type WorldRow,
} from './village-state.js';

export interface Actor {
  accountId: string;
}

/**
 * Prepara una aldea para un comando: la bloquea, aplica en orden los eventos
 * vencidos que solo la afectan a ella y liquida la economía hasta `now`.
 * Si hay un evento vencido que involucra otra aldea (p. ej. un combate entrante)
 * se rechaza con EVENTS_PENDING (reintentable): nunca se adelanta el reloj de
 * una aldea por delante de un evento anterior sin aplicar.
 */
export async function prepareVillage(
  tx: Tx,
  ctx: CoreContext,
  actor: Actor,
  worldId: string,
  villageId: string,
): Promise<{ world: WorldRow; village: VillageRow; state: ResourceState; now: Date }> {
  await requirePlayer(tx, actor.accountId, worldId, ctx.clock.now());
  await tx.select().from(worlds).where(eq(worlds.id, worldId)).for('no key update');
  const world = await loadWorld(tx, worldId);
  assertWorldActive(world);
  if (world.endsAt && world.endsAt <= ctx.clock.now())
    throw err.conflict('WORLD_NOT_OPEN', 'La temporada ha terminado');
  const village = await lockOwnedVillage(tx, worldId, villageId, actor.accountId);
  const now = ctx.clock.now();
  try {
    await processEventsUpTo(tx, ctx, EVENT_HANDLERS, new Set([villageId]), { dueAt: now });
  } catch (e) {
    if (e instanceof EventOrderingConflict) {
      throw new DomainError(
        'EVENTS_PENDING',
        409,
        'Hay un evento de combate en resolución; reintenta en unos segundos',
      );
    }
    throw e;
  }
  const state = settle(await loadEconomy(tx, villageId), now.getTime());
  return { world, village, state, now };
}

function insufficient(state: ResourceState, cost: ReturnType<typeof bundleToMilli>): DomainError {
  const missing = Object.fromEntries(
    RESOURCE_KEYS.filter((k) => state.amounts[k] < cost[k]).map((k) => [
      k,
      Number((cost[k] - state.amounts[k] + 999n) / 1000n),
    ]),
  );
  return err.conflict('INSUFFICIENT_RESOURCES', 'Recursos insuficientes', { missing });
}

export class GameCommands {
  constructor(private readonly ctx: CoreContext) {}

  // -------------------------------------------------------------------------
  // Unirse a un mundo (FR-001/002, FR-CIV-01)
  // -------------------------------------------------------------------------
  async joinWorld(
    actor: Actor,
    worldId: string,
    input: JoinWorldRequest,
    idemKey: string | undefined,
  ): Promise<JoinWorldResponse> {
    await requirePlayer(this.ctx.db, actor.accountId, worldId, this.ctx.clock.now());
    const req = joinWorldRequestSchema.parse(input);
    const key = assertIdempotencyKey(idemKey);
    await loadWorld(this.ctx.db, worldId); // 404 antes de abrir transacción
    return this.inTx(async (tx) => {
      const { response } = await runIdempotent(
        tx,
        { accountId: actor.accountId, worldId, command: 'join', key },
        req,
        async () => {
          // Serializa altas en el mundo (ordinal y reparto de casillas).
          const [world] = await tx
            .select()
            .from(worlds)
            .where(eq(worlds.id, worldId))
            .for('no key update');
          if (!world) throw err.notFound('WORLD_NOT_FOUND');
          assertWorldActive(world);
          const r = rulesetOf(world);
          if (!r.civilizations.some((c) => c.id === req.civilization))
            throw err.unprocessable(
              'CIVILIZATION_RESTRICTED',
              'Civilización no disponible en este mundo',
            );
          const [existing] = await tx
            .select()
            .from(worldPlayers)
            .where(
              and(eq(worldPlayers.worldId, worldId), eq(worldPlayers.accountId, actor.accountId)),
            );
          if (existing) throw err.conflict('ALREADY_JOINED', 'Ya participas en este mundo');

          const [{ count }] = (await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(worldPlayers)
            .where(eq(worldPlayers.worldId, worldId))) as [{ count: number }];
          const now = this.ctx.clock.now();
          const selectedQuadrant = req.quadrant ?? (['NW', 'NE', 'SW', 'SE'] as const)[count % 4]!;
          const [account] = await tx
            .select({ name: accounts.displayName })
            .from(accounts)
            .where(eq(accounts.id, actor.accountId));
          await tx.insert(worldPlayers).values({
            worldId,
            accountId: actor.accountId,
            civilization: req.civilization,
            characterName: r.fortifications ? (req.characterName ?? account!.name) : null,
            quadrant: r.fortifications ? selectedQuadrant : null,
            joinOrdinal: count,
            joinedAt: now,
            protectionUntil: new Date(now.getTime() + world.protectionHours * 3600_000),
          });

          const spot = await this.findSpawn(tx, world, count, selectedQuadrant);
          const villageId = newId();
          const coastal = !r.territory && isCoastal(world.mapSeed, world.mapSize, spot.x, spot.y);
          await tx.insert(villages).values({
            id: villageId,
            worldId,
            ownerAccountId: actor.accountId,
            kind: 'PLAYER',
            name: req.villageName,
            x: spot.x,
            y: spot.y,
            coastal,
            isCapital: true,
          });
          await tx.insert(villageBuildings).values(
            r.startingBuildings.map((b) => ({
              worldId,
              villageId,
              plot: b.plot,
              type: b.type,
              level: b.level,
            })),
          );
          await initializeFortifications(
            tx,
            r,
            world,
            { id: villageId, ...spot },
            req.civilization,
            true,
          );
          const buildings = r.startingBuildings.map((b) => ({
            plot: b.plot,
            type: b.type,
            level: b.level,
          }));
          const state: ResourceState = {
            amounts: bundleToMilli(r.economy.startingResources),
            remainders: { wood: 0n, stone: 0n, iron: 0n, food: 0n },
            rates: computeRates(
              await rulesetForVillage(tx, r, villageId),
              buildings,
              0,
              world.speedMultiplier,
            ),
            capacity: capacityMilli(r, levelOf(buildings, 'warehouse')),
            ...(r.economy.cropPopulation ? { foodCapacity: capacityMilli(r, 0) } : {}),
            lastSettledAt: now.getTime(),
          };
          await tx.insert(resourceAccounts).values({ worldId, villageId, ...stateColumns(state) });
          await refreshCulture(tx, world, villageId, now);
          this.ctx.log.info('world.joined', {
            world_id: worldId,
            account_id: actor.accountId,
            village_id: villageId,
          });
          return { worldId, villageId, x: spot.x, y: spot.y };
        },
      );
      return response;
    });
  }

  /**
   * Busca casilla libre: primero costera (puerto y logística naval, FR-NAV),
   * después cualquiera habitable; siempre a distancia mínima de otras aldeas.
   */
  private async findSpawn(
    tx: Tx,
    world: WorldRow,
    ordinal: number,
    quadrant: 'NW' | 'NE' | 'SW' | 'SE' = 'NW',
  ): Promise<{ x: number; y: number }> {
    const r = rulesetOf(world);
    const d = r.world.spawnMinDistance;
    const cands: Array<{ x: number; y: number }> = [];
    for (let round = 0; round < 4; round++)
      cands.push(...spawnCandidates(world.mapSeed, world.mapSize, ordinal + round * 1000, 50));
    if (r.territory) {
      cands.length = 0;
      for (
        let i = 0;
        i < Math.min(world.mapSize * world.mapSize, r.fortifications ? 4096 : 65536);
        i++
      ) {
        const n =
          (i * 97 + ordinal * 173 + Math.abs(world.mapSeed)) % (world.mapSize * world.mapSize);
        const x = n % world.mapSize,
          y = Math.floor(n / world.mapSize);
        if (
          isSettleable(terrainAt(world.mapSeed, world.mapSize, x, y, 'LAND')) &&
          (!r.economy.cropPopulation ||
            terrainAt(world.mapSeed, world.mapSize, x, y, 'LAND') === 'PLAIN')
        )
          cands.push({ x, y });
      }
    }
    if (r.fortifications) {
      const rng = createPrng(`${world.mapSeed}:spawn:${ordinal}:${quadrant}`),
        half = Math.floor(world.mapSize / 2);
      const startX = quadrant.endsWith('E') ? half : 0,
        startY = quadrant.startsWith('S') ? half : 0;
      cands.length = 0;
      for (let i = 0; i < 4096; i++) {
        const x = startX + rng.nextInt(quadrant.endsWith('E') ? world.mapSize - half : half),
          y = startY + rng.nextInt(quadrant.startsWith('S') ? world.mapSize - half : half);
        if (
          isSettleable(terrainAt(world.mapSeed, world.mapSize, x, y, 'LAND')) &&
          (!r.economy.cropPopulation ||
            terrainAt(world.mapSeed, world.mapSize, x, y, 'LAND') === 'PLAIN')
        )
          cands.push({ x, y });
      }
    }
    const coastal = r.territory
      ? []
      : cands.filter((c) => isCoastal(world.mapSeed, world.mapSize, c.x, c.y));
    for (const c of [...coastal, ...cands]) {
      const near = await tx
        .select({ id: villages.id })
        .from(villages)
        .where(
          and(
            eq(villages.worldId, world.id),
            sql`abs(${villages.x} - ${c.x}) < ${d}`,
            sql`abs(${villages.y} - ${c.y}) < ${d}`,
          ),
        )
        .limit(1);
      if (near.length === 0) return c;
    }
    throw err.conflict('NO_SPAWN_AVAILABLE', 'No hay ubicaciones libres en este mundo');
  }

  // -------------------------------------------------------------------------
  // Construcción (FR-005, FR-CITY)
  // -------------------------------------------------------------------------
  async startConstruction(
    actor: Actor,
    worldId: string,
    villageId: string,
    input: BuildRequest,
    idemKey: string | undefined,
  ): Promise<BuildResponse> {
    const req = buildRequestSchema.parse(input);
    const key = assertIdempotencyKey(idemKey);
    return this.inTx(async (tx) => {
      const { response } = await runIdempotent(
        tx,
        { accountId: actor.accountId, worldId, command: `build:${villageId}`, key },
        req,
        async (): Promise<BuildResponse> => {
          const { world, village, state, now } = await prepareVillage(
            tx,
            this.ctx,
            actor,
            worldId,
            villageId,
          );
          const r = rulesetOf(world);
          const [member] = await tx
            .select()
            .from(worldPlayers)
            .where(
              and(eq(worldPlayers.worldId, worldId), eq(worldPlayers.accountId, actor.accountId)),
            );
          const lane = constructionLane(
            r,
            member!.civilization as CivilizationId,
            req.buildingType,
          );
          const [busy] = await tx
            .select({ id: constructionOrders.id })
            .from(constructionOrders)
            .where(
              and(
                eq(constructionOrders.villageId, villageId),
                eq(constructionOrders.status, 'IN_PROGRESS'),
                eq(constructionOrders.lane, lane),
              ),
            );
          if (busy)
            throw err.conflict('CONSTRUCTION_QUEUE_BUSY', 'Ya hay una construcción en curso');
          const [repair] = await tx
            .select()
            .from(wallRepairOrders)
            .where(
              and(
                eq(wallRepairOrders.worldId, worldId),
                eq(wallRepairOrders.villageId, villageId),
                eq(
                  wallRepairOrders.precinct,
                  req.buildingType === 'wall'
                    ? 3
                    : req.buildingType === 'middle_wall'
                      ? 2
                      : req.buildingType === 'inner_wall'
                        ? 1
                        : 0,
                ),
                eq(wallRepairOrders.status, 'IN_PROGRESS'),
              ),
            );
          if (repair)
            throw err.conflict('CONSTRUCTION_QUEUE_BUSY', 'Esta muralla se está reparando');

          const [player] = await tx
            .select()
            .from(worldPlayers)
            .where(
              and(eq(worldPlayers.worldId, worldId), eq(worldPlayers.accountId, actor.accountId)),
            );
          const civilization = player!.civilization as CivilizationId;
          const buildings = await loadBuildings(tx, villageId);
          const [demolition] = await tx
            .select()
            .from(developmentOrders)
            .where(
              and(
                eq(developmentOrders.worldId, worldId),
                eq(developmentOrders.villageId, villageId),
                eq(developmentOrders.plot, req.plot),
                eq(developmentOrders.status, 'IN_PROGRESS'),
              ),
            );
          if (demolition)
            throw err.conflict('CONSTRUCTION_QUEUE_BUSY', 'El solar se está demoliendo');
          const [layoutRow] = r.fortifications
            ? await tx
                .select()
                .from(villageLayouts)
                .where(
                  and(eq(villageLayouts.worldId, worldId), eq(villageLayouts.villageId, villageId)),
                )
            : [];
          if (r.fortifications && !layoutRow)
            throw err.conflict('CONCURRENT_MODIFICATION', 'Plano de aldea ausente');
          const check = validateConstruction(r, {
            civilization,
            coastal: village.coastal,
            buildings,
            plot: req.plot,
            type: req.buildingType,
            layout: layoutRow?.layout,
            speed: world.speedMultiplier,
            pending: (
              await tx
                .select()
                .from(constructionOrders)
                .where(
                  and(
                    eq(constructionOrders.villageId, villageId),
                    eq(constructionOrders.status, 'IN_PROGRESS'),
                  ),
                )
            ).map((o) => ({
              plot: o.plot,
              type: o.buildingType as import('@reinos/game-config').BuildingType,
              level: o.targetLevel,
            })),
          });
          if (!check.ok)
            throw err.unprocessable(
              check.code,
              `Construcción no permitida: ${check.code}`,
              check.details,
            );

          const targetLevel = check.value.targetLevel;
          const cost = buildingCost(r, req.buildingType, targetLevel, civilization);
          const costMilli = bundleToMilli(cost);
          if (!canAfford(state, costMilli)) throw insufficient(state, costMilli);
          const after = debit(state, costMilli);

          const orderId = newId();
          const completesAt = addSeconds(
            now,
            buildingSeconds(r, req.buildingType, targetLevel, world.speedMultiplier),
          );
          await tx.insert(constructionOrders).values({
            id: orderId,
            worldId,
            villageId,
            plot: req.plot,
            buildingType: req.buildingType,
            lane,
            targetLevel,
            costWood: cost.wood,
            costStone: cost.stone,
            costIron: cost.iron,
            costFood: cost.food,
            startedAt: now,
            completesAt,
          });
          await writeLedger(tx, {
            worldId,
            villageId,
            reason: 'BUILD',
            refId: orderId,
            deltaMilli: negate(costMilli),
            at: now,
          });
          await scheduleEvent(tx, {
            worldId,
            type: 'CONSTRUCTION_COMPLETE',
            villageId,
            dueAt: completesAt,
            dedupeKey: `construction:${orderId}`,
            payload: { orderId },
          });
          await saveEconomy(tx, villageId, after);
          return {
            orderId,
            targetLevel,
            startedAt: iso(now),
            completesAt: iso(completesAt),
            serverTime: iso(now),
          };
        },
      );
      return response;
    });
  }

  // -------------------------------------------------------------------------
  // Reclutamiento (FR-ARM-01)
  // -------------------------------------------------------------------------
  async recruit(
    actor: Actor,
    worldId: string,
    villageId: string,
    input: RecruitRequest,
    idemKey: string | undefined,
  ): Promise<RecruitResponse> {
    const req = recruitRequestSchema.parse(input);
    const key = assertIdempotencyKey(idemKey);
    return this.inTx(async (tx) => {
      const { response } = await runIdempotent(
        tx,
        { accountId: actor.accountId, worldId, command: `recruit:${villageId}`, key },
        req,
        async (): Promise<RecruitResponse> => {
          const { world, state, now } = await prepareVillage(
            tx,
            this.ctx,
            actor,
            worldId,
            villageId,
          );
          const r = rulesetOf(world);
          if (isStarving(state))
            throw err.conflict('STARVATION', 'Sin alimentos: el reclutamiento está bloqueado');
          const [player] = await tx
            .select()
            .from(worldPlayers)
            .where(
              and(eq(worldPlayers.worldId, worldId), eq(worldPlayers.accountId, actor.accountId)),
            );
          const buildings = await loadBuildings(tx, villageId);
          const check = validateRecruitment(r, {
            civilization: player!.civilization as CivilizationId,
            buildings,
            unitType: req.unitType,
            research: (
              await tx
                .select()
                .from(villageResearch)
                .where(
                  and(
                    eq(villageResearch.worldId, worldId),
                    eq(villageResearch.villageId, villageId),
                  ),
                )
            ).map((s) => ({ unitType: s.unitType as UnitType, kind: s.kind, level: s.level })),
          });
          if (!check.ok)
            throw err.unprocessable(
              check.code,
              `Reclutamiento no permitido: ${check.code}`,
              check.details,
            );

          const used = populationOf(r, [
            ...(await loadTroops(tx, villageId)),
            ...(await loadAwayTroops(tx, villageId)),
            ...(await loadTrainingTroops(tx, villageId)),
            ...(await loadWounded(tx, villageId)),
          ]);
          const [removing] = await tx
            .select()
            .from(developmentOrders)
            .where(
              and(
                eq(developmentOrders.villageId, villageId),
                eq(developmentOrders.kind, 'DEMOLISH'),
                eq(developmentOrders.target, check.value.trainedAt),
                eq(developmentOrders.status, 'IN_PROGRESS'),
              ),
            );
          if (removing)
            throw err.conflict(
              'CONSTRUCTION_QUEUE_BUSY',
              'El edificio de entrenamiento se está demoliendo',
            );
          const capacity = populationCapacity(r, levelOf(buildings, 'city_hall'));
          const needed = populationOf(r, [{ unitType: req.unitType, quantity: req.quantity }]);
          if (!r.economy.cropPopulation && used + needed > capacity) {
            throw err.conflict('POPULATION_LIMIT', 'Población insuficiente', {
              used,
              capacity,
              needed,
            });
          }

          const cost = unitCost(r, req.unitType, req.quantity);
          const costMilli = bundleToMilli(cost);
          if (!canAfford(state, costMilli)) throw insufficient(state, costMilli);
          const after = debit(state, costMilli);

          // Cola secuencial por edificio de entrenamiento.
          const [last] = await tx
            .select({ completesAt: recruitmentOrders.completesAt })
            .from(recruitmentOrders)
            .where(
              and(
                eq(recruitmentOrders.villageId, villageId),
                eq(recruitmentOrders.trainedAt, check.value.trainedAt),
                eq(recruitmentOrders.status, 'IN_PROGRESS'),
              ),
            )
            .orderBy(desc(recruitmentOrders.completesAt))
            .limit(1);
          const startedAt = last && last.completesAt > now ? last.completesAt : now;
          const completesAt = addSeconds(
            startedAt,
            unitTrainingSeconds(r, req.unitType, world.speedMultiplier) * req.quantity,
          );
          const orderId = newId();
          await tx.insert(recruitmentOrders).values({
            id: orderId,
            worldId,
            villageId,
            trainedAt: check.value.trainedAt,
            unitType: req.unitType,
            quantity: req.quantity,
            costWood: cost.wood,
            costStone: cost.stone,
            costIron: cost.iron,
            costFood: cost.food,
            startedAt,
            completesAt,
          });
          await writeLedger(tx, {
            worldId,
            villageId,
            reason: 'TRAIN',
            refId: orderId,
            deltaMilli: negate(costMilli),
            at: now,
          });
          await scheduleEvent(tx, {
            worldId,
            type: 'RECRUITMENT_COMPLETE',
            villageId,
            dueAt: completesAt,
            dedupeKey: `recruitment:${orderId}`,
            payload: { orderId },
          });
          await saveEconomy(tx, villageId, after);
          return {
            orderId,
            startedAt: iso(startedAt),
            completesAt: iso(completesAt),
            serverTime: iso(now),
          };
        },
      );
      return response;
    });
  }

  // -------------------------------------------------------------------------
  // Doctrina defensiva (FR-ARM-06, PRD §10.3)
  // -------------------------------------------------------------------------
  async setDoctrine(
    actor: Actor,
    worldId: string,
    villageId: string,
    input: DoctrineRequest,
  ): Promise<DoctrineView> {
    const req = doctrineRequestSchema.parse(input);
    return this.inTx(async (tx) => {
      const { world } = await prepareVillage(tx, this.ctx, actor, worldId, villageId);
      const r = rulesetOf(world);
      if (req.deployment && !r.fortifications)
        throw err.unprocessable('FEATURE_DISABLED', 'Este mundo no usa guarniciones por recinto');
      if (req.reservePercent > r.combat.maxReservePercent) {
        throw err.unprocessable(
          'VALIDATION_FAILED',
          `Reserva máxima ${r.combat.maxReservePercent}%`,
        );
      }
      if (
        req.retreatThresholdPercent !== null &&
        req.retreatThresholdPercent > r.combat.maxRetreatThresholdPercent
      ) {
        throw err.unprocessable(
          'VALIDATION_FAILED',
          `Umbral máximo ${r.combat.maxRetreatThresholdPercent}%`,
        );
      }
      await tx
        .update(villages)
        .set({
          doctrineReservePercent: req.reservePercent,
          doctrineRetreatThresholdPercent: req.retreatThresholdPercent,
          ...(req.deployment ? { doctrineDeployment: req.deployment } : {}),
        })
        .where(and(eq(villages.worldId, worldId), eq(villages.id, villageId)));
      return req;
    });
  }

  // -------------------------------------------------------------------------
  // Movimiento hostil (FR-006, PRD §10.1)
  // -------------------------------------------------------------------------
  async sendMovement(
    actor: Actor,
    worldId: string,
    originVillageId: string,
    input: SendMovementRequest,
    idemKey: string | undefined,
  ): Promise<SendMovementResponse> {
    const req = sendMovementRequestSchema.parse(input);
    const key = assertIdempotencyKey(idemKey);
    return this.inTx(async (tx) => {
      const { response } = await runIdempotent(
        tx,
        { accountId: actor.accountId, worldId, command: `march:${originVillageId}`, key },
        req,
        async (): Promise<SendMovementResponse> => {
          await tx.select().from(worlds).where(eq(worlds.id, worldId)).for('no key update');
          const {
            world,
            village: origin,
            now,
          } = await prepareVillage(tx, this.ctx, actor, worldId, originVillageId);
          const r = rulesetOf(world);
          if (!r.territory && !hostile(req.mission))
            throw err.unprocessable('FEATURE_DISABLED', 'Traslado disponible en mundos terrestres');
          // El objetivo se busca SIEMPRE dentro del mismo mundo (aislamiento ADR-0002).
          const [target] = await tx
            .select()
            .from(villages)
            .where(and(eq(villages.worldId, worldId), eq(villages.id, req.targetVillageId)));
          if (!target || target.id === origin.id)
            throw err.unprocessable('TARGET_INVALID', 'Objetivo inválido');
          const friendly = !hostile(req.mission);
          const allied = await areAllies(tx, worldId, actor.accountId, target.ownerAccountId);
          if (req.mission === 'TRANSFER' && target.ownerAccountId !== actor.accountId)
            throw err.unprocessable(
              'TARGET_INVALID',
              'Solo puedes trasladar tropas a aldeas propias',
            );
          if (req.mission === 'REINFORCE' && !allied)
            throw err.unprocessable('TARGET_INVALID', 'Solo puedes reforzar a tu alianza');
          if (friendly && target.kind !== 'PLAYER')
            throw err.unprocessable('TARGET_INVALID', 'El destino debe ser una aldea');
          if (!friendly && allied)
            throw err.conflict('PACT_RESTRICTS_ATTACK', 'No puedes atacar a un aliado');
          if (req.mission === 'CONQUER' && !r.territory)
            throw err.unprocessable(
              'FEATURE_DISABLED',
              'Conquista disponible en mundos terrestres',
            );
          if (req.mission === 'CONQUER' && target.isCapital)
            throw err.conflict('TARGET_PROTECTED', 'Las capitales no se pueden conquistar');
          if (!friendly && target.ownerAccountId === actor.accountId) {
            throw err.unprocessable('TARGET_INVALID', 'No puedes atacar tus propias aldeas');
          }
          if (!friendly && target.ownerAccountId) {
            const [defender] = await tx
              .select({ protectionUntil: worldPlayers.protectionUntil })
              .from(worldPlayers)
              .where(
                and(
                  eq(worldPlayers.worldId, worldId),
                  eq(worldPlayers.accountId, target.ownerAccountId),
                ),
              );
            if (defender && defender.protectionUntil > now) {
              throw err.conflict(
                'TARGET_PROTECTED',
                'El objetivo está bajo protección de principiante',
                {
                  until: iso(defender.protectionUntil),
                },
              );
            }
          }
          // Gate 3: aquí se validarán PNA/confederaciones (PACT_RESTRICTS_ATTACK).

          if (req.units.some((s) => !r.units.some((u) => u.type === s.unitType)))
            throw err.unprocessable('UNIT_NOT_AVAILABLE', 'Unidad no disponible en este mundo');
          const units = normalizeStacks(
            r,
            req.units as Array<{ unitType: UnitType; quantity: number }>,
          );
          if (req.siegeTargetPlot !== undefined) {
            if (!r.fortifications || req.mission !== 'ATTACK')
              throw err.unprocessable(
                'FEATURE_DISABLED',
                'Objetivos de asedio solo en ataque normal de versión 2.1',
              );
            const ownBuildings = await loadBuildings(tx, origin.id);
            if (
              levelOf(ownBuildings, 'rally_point') < r.fortifications.preciseTargetRallyLevel ||
              !units.some((u) => u.unitType === 'catapult')
            )
              throw err.unprocessable(
                'REQUIREMENTS_NOT_MET',
                'Requiere catapultas y Plaza de Reuniones mejorada',
              );
            const [targetLayout] = await tx
              .select()
              .from(villageLayouts)
              .where(
                and(eq(villageLayouts.worldId, worldId), eq(villageLayouts.villageId, target.id)),
              );
            if (
              !targetLayout?.layout.plots.some(
                (p) => p.id === req.siegeTargetPlot && p.kind !== 'fortification',
              )
            )
              throw err.unprocessable('TARGET_INVALID', 'Solar de asedio inválido');
          }
          if (units.length === 0)
            throw err.unprocessable('NO_UNITS_SELECTED', 'Selecciona al menos una unidad');
          if (
            req.mission === 'CONQUER' &&
            target.kind !== 'OASIS' &&
            !units.some((u) => u.unitType === 'chieftain')
          )
            throw err.unprocessable('REQUIREMENTS_NOT_MET', 'La conquista requiere emisarios');
          if (req.mission === 'CONQUER' && target.kind === 'OASIS' && r.territory?.oasisConquest) {
            throw err.unprocessable(
              'TARGET_INVALID',
              'Los oasis se conquistan mediante ataques normales, reduciendo su lealtad a 0',
            );
          }
          if (req.mission === 'CONQUER' && target.kind === 'OASIS' && !r.territory?.oasisConquest) {
            const owned = await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(villages)
              .where(
                and(
                  eq(villages.worldId, worldId),
                  eq(villages.parentVillageId, origin.id),
                  eq(villages.kind, 'OASIS'),
                ),
              );
            const reason = oasisEligibility(
              r,
              origin,
              target,
              levelOf(await loadBuildings(tx, origin.id), 'treasury'),
              owned[0]?.n ?? 0,
            );
            if (reason) throw err.unprocessable('REQUIREMENTS_NOT_MET', reason);
          }
          if (req.mission === 'CONQUER' && target.kind !== 'OASIS')
            await assertExpansion(tx, world, actor.accountId, origin.id, now, target.id);
          // Compromete tropas: UPDATE condicional + CHECK >= 0 ⇒ nunca doble gasto.
          await removeFromStacks(tx, origin.id, units);

          const secs = travelSeconds(
            distanceMilli(origin, target),
            slowestSpeed(r, units),
            militarySpeedOf(world),
          );
          const arrivesAt = addSeconds(now, secs);
          const movementId = newId();
          await tx.insert(armyMovements).values({
            id: movementId,
            worldId,
            ownerAccountId: actor.accountId,
            originVillageId: origin.id,
            targetVillageId: target.id,
            mission: req.mission,
            status: 'IN_TRANSIT',
            units: Object.fromEntries(units.map((u) => [u.unitType, u.quantity])),
            siegeTargetPlot: req.siegeTargetPlot,
            departedAt: now,
            arrivesAt,
          });
          await scheduleEvent(tx, {
            worldId,
            type: 'MOVEMENT_ARRIVAL',
            villageId: target.id,
            secondaryVillageId: origin.id,
            dueAt: arrivesAt,
            dedupeKey: `arrival:${movementId}`,
            payload: { movementId },
          });
          await scheduleInterceptions(tx, world, movementId, now);
          // Atacar termina la protección propia de principiante.
          if (!friendly)
            await tx
              .update(worldPlayers)
              .set({ protectionUntil: now })
              .where(
                and(
                  eq(worldPlayers.worldId, worldId),
                  eq(worldPlayers.accountId, actor.accountId),
                  sql`${worldPlayers.protectionUntil} > ${iso(now)}::timestamptz`,
                ),
              );
          this.ctx.log.info('army.departed', {
            world_id: worldId,
            movement_id: movementId,
            arrives_at: iso(arrivesAt),
          });
          return {
            movementId,
            status: 'IN_TRANSIT',
            departureAt: iso(now),
            arrivalAt: iso(arrivesAt),
            serverTime: iso(now),
          };
        },
      );
      return response;
    });
  }

  /** Transacción con traducción de violaciones de restricciones a errores de dominio. */
  private async inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.ctx.db.transaction(fn);
    } catch (e) {
      const code = pgErrorCode(e);
      if (code === '23505' && pgConstraint(e) === 'construction_orders_one_active_uq') {
        throw err.conflict('CONSTRUCTION_QUEUE_BUSY', 'Ya hay una construcción en curso');
      }
      if (code === '23505' && pgConstraint(e) === 'world_players_character_uq')
        throw err.conflict('DISPLAY_NAME_TAKEN', 'Este nombre de personaje ya existe en el mundo');
      if (code === '23514' && pgConstraint(e) === 'troop_stacks_qty_ck') {
        throw err.conflict('INSUFFICIENT_TROOPS', 'Tropas insuficientes');
      }
      if (code === '40P01' || code === '40001') {
        throw err.conflict('CONCURRENT_MODIFICATION', 'Conflicto concurrente; reintenta');
      }
      throw e;
    }
  }
}
