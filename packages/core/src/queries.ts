import { areAllies } from './territory.js';
import { requirePlayer } from './access.js';
import { expansionView } from './culture.js';
import { ensureWorldRegions } from './npc.js';
import { aliasedTable, and, asc, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import {
  accounts,
  garrisons,
  settlementOrders,
  armyMovements,
  battles,
  constructionOrders,
  recruitmentOrders,
  villages,
  worldPlayers,
  worlds,
  villageLayouts,
  wallSections,
  wallRepairOrders,
  villageResearch,
  developmentOrders,
} from '@reinos/db';
import type {
  BattleReportDetail,
  BattleReportSummary,
  MapRegionView,
  MapQuery,
  MapAtlasView,
  MovementView,
  VillageView,
  WorldSummary,
} from '@reinos/contracts';
import { mapQuerySchema } from '@reinos/contracts';
import {
  civilizationDef,
  getRuleset,
  type BuildingType,
  type CivilizationId,
  type UnitType,
  type Deployment,
  type Precinct,
} from '@reinos/game-config';
import {
  isStarving,
  levelOf,
  populationCapacity,
  populationOf,
  renderRegion,
  settle,
  toSafeNumber,
  normalizeStacks,
  inhabitantsOf,
  upkeepPerHour,
  mapWindow,
  toCartesian,
  terrainAt,
  TERRAIN_CODE,
  oasisBonuses,
  oasisSlots,
  fieldDistribution,
  type BattleResult,
} from '@reinos/game-rules';
import { err, type CoreContext } from './context.js';
import { iso } from './util.js';
import {
  loadAwayTroops,
  loadBuildings,
  loadEconomy,
  loadTrainingTroops,
  loadTroops,
  loadWorld,
  loadWounded,
  rulesetOf,
  militarySpeedOf,
} from './village-state.js';

interface ReportRow {
  snapshot: import('@reinos/game-rules').BattleSnapshot;
  id: string;
  occurredAt: Date;
  mission: import('@reinos/contracts').MovementMission;
  outcome: 'ATTACKER' | 'DEFENDER';
  attackerAccountId: string;
  rulesetVersion: string;
  seed: string;
  result: unknown;
  attackerVillageName: string;
  defenderVillageName: string;
  attackerName: string;
  defenderName: string | null;
  location: string;
  fieldX: number | null;
  fieldY: number | null;
}

/**
 * Consultas de solo lectura. No aplican eventos: liquidan la economía en
 * memoria hasta `now` para mostrar valores actuales sin escribir.
 */
export class GameQueries {
  constructor(private readonly ctx: CoreContext) {}
  async mapAtlas(accountId: string, worldId: string): Promise<MapAtlasView> {
    await this.requireMembership(accountId, worldId);
    const db = this.ctx.db,
      world = await loadWorld(db, worldId);
    const rows = await db
      .select({
        v: villages,
        ownerName: sql<string>`coalesce(${worldPlayers.characterName},${accounts.displayName})`,
        civilization: worldPlayers.civilization,
      })
      .from(villages)
      .leftJoin(accounts, eq(accounts.id, villages.ownerAccountId))
      .leftJoin(
        worldPlayers,
        and(
          eq(worldPlayers.worldId, villages.worldId),
          eq(worldPlayers.accountId, villages.ownerAccountId),
        ),
      )
      .where(eq(villages.worldId, worldId));
    const { allianceMembers } = await import('@reinos/db');
    const [mine] = await db
      .select()
      .from(allianceMembers)
      .where(and(eq(allianceMembers.worldId, worldId), eq(allianceMembers.accountId, accountId)));
    const allies = new Set(
      mine
        ? (
            await db
              .select()
              .from(allianceMembers)
              .where(
                and(
                  eq(allianceMembers.worldId, worldId),
                  eq(allianceMembers.allianceId, mine.allianceId),
                ),
              )
          ).map((m) => m.accountId)
        : [],
    );
    const own = rows.filter(({ v }) => v.ownerAccountId === accountId).map(({ v }) => v.id),
      byId = new Map(rows.map(({ v }) => [v.id, v]));
    const works = await db
      .select()
      .from(constructionOrders)
      .where(
        and(
          eq(constructionOrders.worldId, worldId),
          eq(constructionOrders.status, 'IN_PROGRESS'),
          inArray(constructionOrders.villageId, own),
        ),
      );
    const marchRows = await db
      .select()
      .from(armyMovements)
      .where(
        and(
          eq(armyMovements.worldId, worldId),
          inArray(armyMovements.status, ['IN_TRANSIT', 'RETURNING']),
          or(
            eq(armyMovements.ownerAccountId, accountId),
            and(
              inArray(armyMovements.targetVillageId, own),
              eq(armyMovements.status, 'IN_TRANSIT'),
              inArray(armyMovements.mission, ['ATTACK', 'RAID', 'CONQUER']),
            ),
          ),
        ),
      );
    const returnBattles = await db
      .select({ id: battles.id, x: battles.fieldX, y: battles.fieldY, at: battles.occurredAt })
      .from(battles)
      .where(
        and(
          eq(battles.worldId, worldId),
          eq(battles.location, 'FIELD'),
          inArray(
            battles.id,
            marchRows.flatMap((m) => (m.status === 'RETURNING' && m.battleId ? [m.battleId] : [])),
          ),
        ),
      );
    const returnByBattle = new Map(returnBattles.map((b) => [b.id, b]));
    const movements: MapAtlasView['movements'] = marchRows.flatMap((m) => {
      const origin = byId.get(m.originVillageId),
        target = byId.get(m.targetVillageId);
      if (!origin || !target) return [];
      const returning = m.status === 'RETURNING',
        field = m.battleId ? returnByBattle.get(m.battleId) : undefined;
      return [
        {
          id: m.id,
          mission: m.mission,
          isMine: m.ownerAccountId === accountId,
          from: toCartesian(
            world.mapSize,
            returning && field
              ? { x: field.x! / 1000, y: field.y! / 1000 }
              : returning
                ? target
                : origin,
          ),
          to: toCartesian(world.mapSize, returning ? origin : target),
          departedAt: iso(returning ? (field?.at ?? m.arrivesAt) : m.departedAt),
          arrivesAt: iso(returning ? m.returnsAt! : m.arrivesAt),
          units:
            m.ownerAccountId === accountId
              ? Object.entries(m.units).map(([unitType, quantity]) => ({
                  unitType: unitType as UnitType,
                  quantity,
                }))
              : null,
        },
      ];
    });
    const founders = await db
      .select()
      .from(settlementOrders)
      .where(
        and(
          eq(settlementOrders.worldId, worldId),
          eq(settlementOrders.ownerAccountId, accountId),
          eq(settlementOrders.status, 'IN_PROGRESS'),
        ),
      );
    for (const order of founders) {
      const origin = byId.get(order.originVillageId);
      if (origin)
        movements.push({
          id: order.id,
          mission: 'SETTLE',
          isMine: true,
          from: toCartesian(world.mapSize, origin),
          to: toCartesian(world.mapSize, order),
          departedAt: iso(order.departedAt),
          arrivesAt: iso(order.arrivesAt),
          units: [
            { unitType: 'settler', quantity: rulesetOf(world).territory?.settlersRequired ?? 3 },
          ],
        });
    }
    return {
      worldId,
      mapSize: world.mapSize,
      mapSeed: world.mapSeed,
      serverTime: iso(
        world.pausedAt ??
          (world.endsAt && world.endsAt < this.ctx.clock.now()
            ? world.endsAt
            : this.ctx.clock.now()),
      ),
      running: ['OPEN', 'WONDER_ERA'].includes(world.status),
      movements,
      villages: rows.map(({ v, ownerName, civilization }) => {
        const orders = works.filter((o) => o.villageId === v.id),
          first = orders[0];
        return {
          id: v.id,
          name: v.name,
          ...toCartesian(world.mapSize, v),
          ownerName: ownerName ?? null,
          civilization: civilization as CivilizationId | null,
          isMine: v.ownerAccountId === accountId,
          isAlly:
            !!v.ownerAccountId && v.ownerAccountId !== accountId && allies.has(v.ownerAccountId),
          kind: v.kind,
          isCapital: v.isCapital,
          loyalty: v.loyalty,
          parentVillageId: v.parentVillageId,
          ...(v.ownerAccountId
            ? { ownerColor: `hsl(${parseInt(v.ownerAccountId.slice(0, 6), 16) % 360} 65% 65%)` }
            : {}),
          ...(v.kind === 'OASIS' ? { oasisBonuses: oasisBonuses(world.mapSeed, v.x, v.y) } : {}),
          ...(first
            ? {
                construction: {
                  count: orders.length,
                  startedAt: iso(first.startedAt),
                  completesAt: iso(first.completesAt),
                },
              }
            : {}),
        };
      }),
    };
  }
  async worldOverview(accountId: string, worldId: string) {
    await requirePlayer(this.ctx.db, accountId);
    const w = await loadWorld(this.ctx.db, worldId);
    if (!['PLANNED', 'OPEN', 'WONDER_ERA', 'PAUSED'].includes(w.status))
      throw err.notFound('WORLD_NOT_FOUND');
    const resolution = 128;
    let tiles = '';
    for (let y = 0; y < resolution; y++)
      for (let x = 0; x < resolution; x++)
        tiles +=
          TERRAIN_CODE[
            terrainAt(
              w.mapSeed,
              w.mapSize,
              Math.min(w.mapSize - 1, Math.floor(((x + 0.5) * w.mapSize) / resolution)),
              Math.min(w.mapSize - 1, Math.floor(((y + 0.5) * w.mapSize) / resolution)),
              rulesetOf(w).territory ? 'LAND' : 'ARCHIPELAGO',
            )
          ];
    return { mapSize: w.mapSize, resolution, tiles };
  }

  async listWorlds(accountId: string): Promise<WorldSummary[]> {
    await requirePlayer(this.ctx.db, accountId);
    const rows = await this.ctx.db
      .select({
        w: worlds,
        playerCount: sql<number>`(select count(*)::int from ${worldPlayers} wp where wp.world_id = ${worlds.id})`,
      })
      .from(worlds)
      .where(inArray(worlds.status, ['PLANNED', 'OPEN', 'WONDER_ERA', 'PAUSED']))
      .orderBy(asc(worlds.createdAt), asc(worlds.slug));
    const memberships = await this.ctx.db
      .select()
      .from(worldPlayers)
      .where(eq(worldPlayers.accountId, accountId));
    const myVillages = await this.ctx.db
      .select({ id: villages.id, worldId: villages.worldId })
      .from(villages)
      .where(and(eq(villages.ownerAccountId, accountId), eq(villages.kind, 'PLAYER')))
      .orderBy(asc(villages.createdAt));
    return rows.map(({ w, playerCount }) => {
      const m = memberships.find((x) => x.worldId === w.id);
      return {
        id: w.id,
        opensAt: iso(w.opensAt),
        endsAt: w.endsAt ? iso(w.endsAt) : null,
        slug: w.slug,
        name: w.name,
        status: w.status,
        profile: w.profile,
        rulesetVersion: w.rulesetVersion,
        speedMultiplier: w.speedMultiplier,
        movementSpeedMultiplier: militarySpeedOf(w),
        mapSize: w.mapSize,
        playerCount,
        membership: m
          ? {
              civilization: m.civilization as CivilizationId,
              villageIds: myVillages.filter((v) => v.worldId === w.id).map((v) => v.id),
              protectionUntil: iso(m.protectionUntil),
            }
          : null,
      };
    });
  }

  async requireMembership(accountId: string, worldId: string) {
    await requirePlayer(this.ctx.db, accountId, worldId, this.ctx.clock.now());
    const [m] = await this.ctx.db
      .select()
      .from(worldPlayers)
      .where(and(eq(worldPlayers.worldId, worldId), eq(worldPlayers.accountId, accountId)));
    if (!m) throw err.forbidden('NOT_A_MEMBER', 'No participas en este mundo');
    return m;
  }

  async villageView(accountId: string, worldId: string, villageId: string): Promise<VillageView> {
    const db = this.ctx.db;
    const [village] = await db
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
    if (!village) throw err.notFound('VILLAGE_NOT_FOUND', 'Aldea no encontrada');
    const world = await loadWorld(db, worldId);
    const r = rulesetOf(world);
    const member = await this.requireMembership(accountId, worldId);
    const wallClock = this.ctx.clock.now();
    const now =
      world.pausedAt ?? (world.endsAt && world.endsAt < wallClock ? world.endsAt : wallClock);
    const state = settle(await loadEconomy(db, villageId), now.getTime());
    const buildings = await loadBuildings(db, villageId);
    const troops = await loadTroops(db, villageId);
    const wounded = await loadWounded(db, villageId);
    const away = await loadAwayTroops(db, villageId);
    const training = await loadTrainingTroops(db, villageId);
    const inhabitants = inhabitantsOf(r, buildings);
    const militaryConsumption = upkeepPerHour(r, [
      ...troops,
      ...away,
      ...(r.economy.starvationIntervalSeconds ? wounded : []),
      ...(await db.select().from(garrisons).where(eq(garrisons.villageId, villageId))).map((g) => ({
        unitType: g.unitType as UnitType,
        quantity: g.quantity,
      })),
    ]);
    const freeCrop = Number(state.rates.food / 1000n) + militaryConsumption;
    const [ownedOases] = r.territory?.oasisConquest
      ? await db
          .select({ n: sql<number>`count(*)::int` })
          .from(villages)
          .where(
            and(
              eq(villages.worldId, worldId),
              eq(villages.parentVillageId, villageId),
              eq(villages.kind, 'OASIS'),
            ),
          )
      : [];

    const constructions = await db
      .select()
      .from(constructionOrders)
      .where(
        and(
          eq(constructionOrders.villageId, villageId),
          eq(constructionOrders.status, 'IN_PROGRESS'),
        ),
      )
      .orderBy(asc(constructionOrders.completesAt));
    const construction = constructions[0];
    const recruitment = await db
      .select()
      .from(recruitmentOrders)
      .where(
        and(
          eq(recruitmentOrders.villageId, villageId),
          eq(recruitmentOrders.status, 'IN_PROGRESS'),
        ),
      )
      .orderBy(asc(recruitmentOrders.completesAt));

    const movements = await this.movementsFor(
      worldId,
      villageId,
      accountId,
      village.name,
      r.territory?.settlersRequired ?? 3,
    );

    const n = (b: bigint) => toSafeNumber(b);
    const [layoutRow] = r.fortifications
      ? await db
          .select()
          .from(villageLayouts)
          .where(and(eq(villageLayouts.worldId, worldId), eq(villageLayouts.villageId, villageId)))
      : [];
    const sections = r.fortifications
      ? await db
          .select()
          .from(wallSections)
          .where(and(eq(wallSections.worldId, worldId), eq(wallSections.villageId, villageId)))
      : [];
    const repairs = r.fortifications
      ? await db
          .select()
          .from(wallRepairOrders)
          .where(
            and(
              eq(wallRepairOrders.worldId, worldId),
              eq(wallRepairOrders.villageId, villageId),
              eq(wallRepairOrders.status, 'IN_PROGRESS'),
            ),
          )
      : [];
    return {
      ...(layoutRow ? { layout: layoutRow.layout } : {}),
      ...(r.culture ? { culture: await expansionView(db, world, accountId, villageId, now) } : {}),
      ...(r.development
        ? {
            research: (
              await db
                .select()
                .from(villageResearch)
                .where(
                  and(
                    eq(villageResearch.worldId, worldId),
                    eq(villageResearch.villageId, villageId),
                  ),
                )
            ).map((s) => ({
              unitType: s.unitType as UnitType,
              kind: s.kind as 'UNLOCK' | 'WEAPON' | 'ARMOR',
              level: s.level,
            })),
            development: (
              await db
                .select()
                .from(developmentOrders)
                .where(
                  and(
                    eq(developmentOrders.worldId, worldId),
                    eq(developmentOrders.villageId, villageId),
                    eq(developmentOrders.status, 'IN_PROGRESS'),
                  ),
                )
            ).map((o) => ({
              id: o.id,
              kind: o.kind as 'UNLOCK' | 'WEAPON' | 'ARMOR' | 'DEMOLISH',
              target: o.target,
              targetLevel: o.targetLevel,
              plot: o.plot,
              startedAt: iso(o.startedAt),
              completesAt: iso(o.completesAt),
            })),
          }
        : {}),
      ...(member.characterName ? { characterName: member.characterName } : {}),
      ...(r.fortifications
        ? {
            walls: sections.map((w) => {
              const precinct = w.precinct as Precinct,
                plot = precinct === 3 ? 19 : precinct === 2 ? 20 : 21;
              const level = buildings.find((b) => b.plot === plot)?.level ?? 0,
                repair = repairs.find((o) => o.precinct === precinct);
              return {
                precinct,
                plot,
                level,
                integrity: w.integrity,
                material: (member.civilization === 'forest_kin'
                  ? 'WOOD'
                  : member.civilization === 'steppe_clans'
                    ? 'EARTH'
                    : 'STONE') as 'STONE' | 'WOOD' | 'EARTH',
                bonusPermille: Math.min(
                  r.fortifications!.maxWallBonusPermille,
                  Math.floor(
                    (civilizationDef(r, member.civilization as CivilizationId).modifiers
                      .wallBonusPermillePerLevel *
                      level *
                      w.integrity) /
                      1000,
                  ),
                ),
                repair: repair
                  ? {
                      id: repair.id,
                      restoreIntegrity: repair.restoreIntegrity,
                      startedAt: iso(repair.startedAt),
                      completesAt: iso(repair.completesAt),
                    }
                  : null,
              };
            }),
          }
        : {}),
      id: village.id,
      worldName: world.name,
      worldId,
      name: village.name,
      x: village.x,
      y: village.y,
      coastal: village.coastal,
      civilization: member.civilization as CivilizationId,
      rulesetVersion: r.version,
      speedMultiplier: world.speedMultiplier,
      movementSpeedMultiplier: militarySpeedOf(world),
      ...(r.fortifications
        ? {
            constructions: constructions.map((o) => ({
              id: o.id,
              plot: o.plot,
              type: o.buildingType as BuildingType,
              targetLevel: o.targetLevel,
              startedAt: iso(o.startedAt),
              completesAt: iso(o.completesAt),
            })),
          }
        : {}),
      serverTime: iso(now),
      ...(r.territory?.oasisConquest
        ? {
            oases: {
              owned: ownedOases?.n ?? 0,
              slots: oasisSlots(r, levelOf(buildings, 'treasury')),
              radius: r.territory.oasisConquest.radius,
            },
          }
        : {}),
      worldStatus: world.status,
      resources: {
        amountsMilli: {
          wood: n(state.amounts.wood),
          stone: n(state.amounts.stone),
          iron: n(state.amounts.iron),
          food: n(state.amounts.food),
        },
        ratesMilliPerHour: {
          wood: n(state.rates.wood),
          stone: n(state.rates.stone),
          iron: n(state.rates.iron),
          food: n(state.rates.food),
        },
        capacityMilli: n(state.capacity),
        ...(state.foodCapacity === undefined ? {} : { foodCapacityMilli: n(state.foodCapacity) }),
        settledAt: iso(new Date(state.lastSettledAt)),
        starving: isStarving(state),
      },
      population: {
        used: populationOf(r, [...troops, ...wounded, ...away, ...training]),
        capacity: populationCapacity(r, levelOf(buildings, 'city_hall')),
        ...(r.economy.cropPopulation
          ? {
              inhabitants,
              buildingConsumption: inhabitants,
              troopConsumption: militaryConsumption,
              freeCropPerHour: Number(freeCrop),
              grossCropPerHour: Number(freeCrop) + inhabitants,
            }
          : {}),
      },
      buildings: buildings.map((b) => ({
        plot: b.plot,
        type: b.type,
        level: b.level,
        ...(r.economy.cropPopulation
          ? {
              inhabitants:
                r.buildings.find((d) => d.type === b.type)?.populationByLevel?.[b.level] ?? 0,
            }
          : {}),
      })),
      construction: construction
        ? {
            id: construction.id,
            plot: construction.plot,
            type: construction.buildingType as BuildingType,
            targetLevel: construction.targetLevel,
            startedAt: iso(construction.startedAt),
            completesAt: iso(construction.completesAt),
          }
        : null,
      recruitment: recruitment.map((o) => ({
        id: o.id,
        unitType: o.unitType as UnitType,
        quantity: o.quantity,
        startedAt: iso(o.startedAt),
        completesAt: iso(o.completesAt),
      })),
      troops,
      wounded,
      doctrine: {
        reservePercent: village.doctrineReservePercent,
        retreatThresholdPercent: village.doctrineRetreatThresholdPercent,
        ...(r.fortifications ? { deployment: village.doctrineDeployment as Deployment } : {}),
      },
      movements,
      protectionUntil: iso(member.protectionUntil),
      isCapital: village.isCapital,
      loyalty: village.loyalty,
      garrisons: (
        await db
          .select()
          .from(garrisons)
          .where(and(eq(garrisons.worldId, worldId), eq(garrisons.villageId, villageId)))
      ).map((g) => ({
        ownerAccountId: g.ownerAccountId,
        originVillageId: g.originVillageId,
        unitType: g.unitType as UnitType,
        quantity: g.quantity,
      })),
    };
  }

  private async movementsFor(
    worldId: string,
    villageId: string,
    accountId: string,
    villageName: string,
    settlers: number,
  ): Promise<MovementView[]> {
    const origin = aliasedTable(villages, 'origin');
    const target = aliasedTable(villages, 'target');
    const rows = await this.ctx.db
      .select({ m: armyMovements, originName: origin.name, targetName: target.name })
      .from(armyMovements)
      .innerJoin(origin, eq(origin.id, armyMovements.originVillageId))
      .innerJoin(target, eq(target.id, armyMovements.targetVillageId))
      .where(
        and(
          eq(armyMovements.worldId, worldId),
          or(
            and(
              eq(armyMovements.originVillageId, villageId),
              inArray(armyMovements.status, ['IN_TRANSIT', 'RETURNING']),
            ),
            and(
              eq(armyMovements.targetVillageId, villageId),
              eq(armyMovements.status, 'IN_TRANSIT'),
            ),
          ),
        ),
      )
      .orderBy(asc(armyMovements.arrivesAt));
    const visible: MovementView[] = rows
      .filter(
        ({ m }) =>
          m.ownerAccountId === accountId ||
          (m.targetVillageId === villageId && m.status === 'IN_TRANSIT'),
      )
      .map(({ m, originName, targetName }) => {
        const mine = m.ownerAccountId === accountId;
        const returning = m.status === 'RETURNING';
        return {
          id: m.id,
          direction: returning
            ? 'RETURNING'
            : m.originVillageId === villageId
              ? 'OUTGOING'
              : 'INCOMING',
          mission: m.mission,
          status: m.status,
          originVillageId: m.originVillageId,
          originName,
          targetVillageId: m.targetVillageId,
          targetName,
          departedAt: iso(m.departedAt),
          arrivesAt: iso(returning && m.returnsAt ? m.returnsAt : m.arrivesAt),
          // El defensor no ve la composición del ataque entrante.
          units: mine
            ? Object.entries(m.units).map(([unitType, quantity]) => ({
                unitType: unitType as UnitType,
                quantity,
              }))
            : null,
          loot:
            mine && m.loot
              ? {
                  wood: m.loot.wood ?? 0,
                  stone: m.loot.stone ?? 0,
                  iron: m.loot.iron ?? 0,
                  food: m.loot.food ?? 0,
                }
              : null,
        };
      });
    const founders = await this.ctx.db
      .select()
      .from(settlementOrders)
      .where(
        and(
          eq(settlementOrders.worldId, worldId),
          eq(settlementOrders.ownerAccountId, accountId),
          eq(settlementOrders.originVillageId, villageId),
          eq(settlementOrders.status, 'IN_PROGRESS'),
        ),
      );
    for (const o of founders)
      visible.push({
        id: o.id,
        direction: 'OUTGOING',
        mission: 'SETTLE',
        status: 'IN_TRANSIT',
        originVillageId: villageId,
        originName: villageName,
        targetVillageId: null,
        targetName: o.name,
        departedAt: iso(o.departedAt),
        arrivesAt: iso(o.arrivesAt),
        units: [{ unitType: 'settler', quantity: settlers }],
        loot: null,
      });
    return visible.sort((a, b) => Date.parse(a.arrivesAt) - Date.parse(b.arrivesAt));
  }

  async mapRegion(accountId: string, worldId: string, query: MapQuery): Promise<MapRegionView> {
    const q = mapQuerySchema.parse(query);
    await this.requireMembership(accountId, worldId);
    const world = await loadWorld(this.ctx.db, worldId);
    if (q.x < 0 || q.y < 0 || q.x >= world.mapSize || q.y >= world.mapSize)
      throw err.unprocessable('TARGET_INVALID', 'Coordenadas fuera del mundo');
    const window = mapWindow(world.mapSize, q.x, q.y, q.radius, q);
    const x0 = window.originX,
      y0 = window.originY,
      x1 = x0 + window.width - 1,
      y1 = y0 + window.height - 1;
    const region = renderRegion(
      world.mapSeed,
      world.mapSize,
      x0,
      y0,
      x1 - x0 + 1,
      y1 - y0 + 1,
      rulesetOf(world).territory ? 'LAND' : 'ARCHIPELAGO',
    );
    await ensureWorldRegions(this.ctx.db, world, x0, y0, x1, y1, this.ctx.clock.now());
    const rows = await this.ctx.db
      .select({
        id: villages.id,
        name: villages.name,
        x: villages.x,
        y: villages.y,
        owner: villages.ownerAccountId,
        parentVillageId: villages.parentVillageId,
        kind: villages.kind,
        isCapital: villages.isCapital,
        loyalty: villages.loyalty,
        ownerName: sql<string>`coalesce(${worldPlayers.characterName},${accounts.displayName})`,
        civilization: worldPlayers.civilization,
      })
      .from(villages)
      .leftJoin(accounts, eq(accounts.id, villages.ownerAccountId))
      .leftJoin(
        worldPlayers,
        and(
          eq(worldPlayers.worldId, villages.worldId),
          eq(worldPlayers.accountId, villages.ownerAccountId),
        ),
      )
      .where(
        and(
          eq(villages.worldId, worldId),
          gte(villages.x, x0),
          lte(villages.x, x1),
          gte(villages.y, y0),
          lte(villages.y, y1),
        ),
      );
    const allVillages = await this.ctx.db
      .select()
      .from(villages)
      .where(eq(villages.worldId, worldId));
    const byId = new Map(allVillages.map((v) => [v.id, v]));
    const myIds = allVillages.filter((v) => v.ownerAccountId === accountId).map((v) => v.id);
    // Filtro autoritativo: ninguna marcha de terceros sale de la API.
    const marchRows = await this.ctx.db
      .select()
      .from(armyMovements)
      .where(
        and(
          eq(armyMovements.worldId, worldId),
          inArray(armyMovements.status, ['IN_TRANSIT', 'RETURNING']),
          or(
            eq(armyMovements.ownerAccountId, accountId),
            and(
              inArray(armyMovements.targetVillageId, myIds),
              eq(armyMovements.status, 'IN_TRANSIT'),
              inArray(armyMovements.mission, ['ATTACK', 'RAID', 'CONQUER']),
            ),
          ),
        ),
      );
    const movements: NonNullable<MapRegionView['movements']> = [];
    for (const m of marchRows) {
      const returning = m.status === 'RETURNING',
        origin = byId.get(m.originVillageId)!,
        target = byId.get(m.targetVillageId)!;
      let from = returning ? { x: target.x, y: target.y } : { x: origin.x, y: origin.y };
      let departedAt = returning ? m.arrivesAt : m.departedAt;
      if (returning && m.battleId) {
        const [b] = await this.ctx.db.select().from(battles).where(eq(battles.id, m.battleId));
        if (b?.location === 'FIELD') {
          from = { x: b.fieldX! / 1000, y: b.fieldY! / 1000 };
          departedAt = b.occurredAt;
        }
      }
      movements.push({
        id: m.id,
        mission: m.mission,
        isMine: m.ownerAccountId === accountId,
        from,
        to: returning ? { x: origin.x, y: origin.y } : { x: target.x, y: target.y },
        departedAt: iso(departedAt),
        arrivesAt: iso(returning ? m.returnsAt! : m.arrivesAt),
        units:
          m.ownerAccountId === accountId
            ? Object.entries(m.units).map(([unitType, quantity]) => ({
                unitType: unitType as UnitType,
                quantity,
              }))
            : null,
      });
    }
    const settling = await this.ctx.db
      .select()
      .from(settlementOrders)
      .where(
        and(
          eq(settlementOrders.worldId, worldId),
          eq(settlementOrders.ownerAccountId, accountId),
          eq(settlementOrders.status, 'IN_PROGRESS'),
        ),
      );
    for (const o of settling) {
      const origin = byId.get(o.originVillageId)!;
      movements.push({
        id: o.id,
        mission: 'SETTLE',
        isMine: true,
        from: { x: origin.x, y: origin.y },
        to: { x: o.x, y: o.y },
        departedAt: iso(o.departedAt),
        arrivesAt: iso(o.arrivesAt),
        units: [{ unitType: 'settler', quantity: rulesetOf(world).territory!.settlersRequired }],
      });
    }
    const allied = new Set<string>();
    for (const v of rows)
      if (v.owner && (await areAllies(this.ctx.db, worldId, accountId, v.owner))) allied.add(v.id);
    return {
      ...region,
      ...(rulesetOf(world).economy.cropPopulation
        ? {
            fieldDistributions: Array.from({ length: region.width * region.height }, (_, i) =>
              fieldDistribution(
                world.mapSeed,
                region.originX + (i % region.width),
                region.originY + Math.floor(i / region.width),
              ),
            ),
          }
        : {}),
      mapSize: world.mapSize,
      serverTime: iso(this.ctx.clock.now()),
      movements,
      villages: await Promise.all(
        rows.map(async (v) => ({
          id: v.id,
          name: v.name,
          x: v.x,
          y: v.y,
          ownerName: v.ownerName ?? null,
          civilization: (v.civilization as CivilizationId | null) ?? null,
          animals:
            (v.kind === 'OASIS' || v.kind === 'NPC') && !v.owner
              ? await loadTroops(this.ctx.db, v.id)
              : undefined,
          parentVillageId: v.parentVillageId,
          ...(v.kind === 'OASIS' && rulesetOf(world).territory?.oasisConquest
            ? { oasisBonuses: oasisBonuses(world.mapSeed, v.x, v.y) }
            : {}),
          ...(v.owner
            ? { ownerColor: `hsl(${parseInt(v.owner.slice(0, 6), 16) % 360} 65% 65%)` }
            : {}),
          isMine: v.owner === accountId,
          kind: v.kind,
          isCapital: v.isCapital,
          loyalty: v.loyalty,
          isAlly: allied.has(v.id),
        })),
      ),
    };
  }

  private async reportRows(
    worldId: string,
    accountId: string,
    battleId?: string,
    limit = 50,
  ): Promise<ReportRow[]> {
    const av = aliasedTable(villages, 'av');
    const dv = aliasedTable(villages, 'dv');
    const aa = aliasedTable(accounts, 'aa');
    const da = aliasedTable(accounts, 'da');
    const rows = await this.ctx.db
      .select({
        id: battles.id,
        occurredAt: battles.occurredAt,
        mission: battles.mission,
        outcome: battles.outcome,
        attackerAccountId: battles.attackerAccountId,
        rulesetVersion: battles.rulesetVersion,
        seed: battles.seed,
        result: battles.result,
        snapshot: battles.snapshot,
        location: battles.location,
        fieldX: battles.fieldX,
        fieldY: battles.fieldY,
        attackerVillageName: av.name,
        defenderVillageName: dv.name,
        attackerName: aa.displayName,
        defenderName: da.displayName,
      })
      .from(battles)
      .innerJoin(av, eq(av.id, battles.attackerVillageId))
      .innerJoin(dv, eq(dv.id, battles.defenderVillageId))
      .innerJoin(aa, eq(aa.id, battles.attackerAccountId))
      .leftJoin(da, eq(da.id, battles.defenderAccountId))
      .where(
        and(
          eq(battles.worldId, worldId),
          or(eq(battles.attackerAccountId, accountId), eq(battles.defenderAccountId, accountId)),
          battleId ? eq(battles.id, battleId) : undefined,
        ),
      )
      .orderBy(desc(battles.occurredAt))
      .limit(limit);
    return rows as ReportRow[];
  }

  private toSummary(accountId: string, row: ReportRow): BattleReportSummary {
    return {
      id: row.id,
      occurredAt: iso(row.occurredAt),
      mission: row.mission,
      role: row.attackerAccountId === accountId ? 'ATTACKER' : 'DEFENDER',
      outcome: row.outcome,
      attackerVillageName: row.attackerVillageName,
      defenderVillageName: row.defenderVillageName,
      attackerName: row.attackerName,
      defenderName: row.defenderName ?? 'Aldea anárquica',
      location: row.location === 'FIELD' ? 'FIELD' : 'VILLAGE',
      fieldPosition:
        row.location === 'FIELD' ? { x: row.fieldX! / 1000, y: row.fieldY! / 1000 } : null,
    };
  }

  async listReports(accountId: string, worldId: string): Promise<BattleReportSummary[]> {
    await this.requireMembership(accountId, worldId);
    const rows = await this.reportRows(worldId, accountId);
    return rows.map((r) => this.toSummary(accountId, r));
  }

  async getReport(
    accountId: string,
    worldId: string,
    battleId: string,
  ): Promise<BattleReportDetail> {
    await this.requireMembership(accountId, worldId);
    if (!/^[0-9a-f-]{36}$/i.test(battleId))
      throw err.notFound('REPORT_NOT_FOUND', 'Informe no encontrado');
    const [row] = await this.reportRows(worldId, accountId, battleId, 1);
    if (!row) throw err.notFound('REPORT_NOT_FOUND', 'Informe no encontrado');
    const limited = row.attackerAccountId === accountId && !!row.snapshot.fortifications;
    const result = structuredClone(row.result as BattleResult);
    const reached = new Set(result.precincts?.map((p) => p.precinct) ?? []);
    let layout = row.snapshot.fortifications?.layout;
    if (limited) {
      const r = getRuleset(row.rulesetVersion);
      for (const phase of result.precincts ?? []) {
        const survivors = phase.defender.engaged
          .map((s) => ({
            ...s,
            quantity: Math.max(
              0,
              s.quantity -
                (phase.defender.killed.find((u) => u.unitType === s.unitType)?.quantity ?? 0) -
                (phase.defender.wounded.find((u) => u.unitType === s.unitType)?.quantity ?? 0),
            ),
          }))
          .filter((s) => s.quantity > 0);
        phase.defender = {
          ...phase.defender,
          present: phase.defender.engaged,
          reserve: [],
          survivors,
        };
      }
      const phases = result.precincts ?? [];
      result.defender = {
        ...result.defender,
        present: normalizeStacks(
          r,
          phases.flatMap((p) => p.defender.present),
        ),
        reserve: [],
        survivors: normalizeStacks(
          r,
          phases.flatMap((p) => p.defender.survivors),
        ),
      };
      if (layout)
        layout = {
          ...layout,
          plots: layout.plots.filter((p) => reached.has(p.precinct!)),
          walls: layout.walls.filter((w) => reached.has(w.precinct)),
        };
    }
    const visualCiv =
      row.snapshot.defender.civilization ??
      row.snapshot.fortifications?.layout?.civilization ??
      'stone_wardens';
    return {
      ...this.toSummary(accountId, row),
      rulesetVersion: row.rulesetVersion,
      seed: row.seed,
      result,
      ...(limited ? { defenderInformationLimited: true } : {}),
      layout,
      ...(row.snapshot.fortifications?.layout && layout
        ? {
            replay: {
              version: 'auto-replay-1' as const,
              visualSeed: `visual:${row.seed}`,
              layout,
              civilization: visualCiv,
              buildings: row.snapshot.fortifications.buildings
                .filter((b) => !limited || reached.has(b.precinct))
                .map((b) => ({
                  plot: b.plot,
                  type: b.type,
                  level: b.level,
                })),
              walls: row.snapshot.fortifications.walls
                .filter((w) => !limited || reached.has(w.precinct))
                .map((w) => ({
                  precinct: w.precinct,
                  plot: w.precinct === 3 ? 19 : w.precinct === 2 ? 20 : 21,
                  level: w.level,
                  integrity: w.integrity,
                  material: (visualCiv === 'forest_kin'
                    ? 'WOOD'
                    : visualCiv === 'steppe_clans'
                      ? 'EARTH'
                      : 'STONE') as 'STONE' | 'WOOD' | 'EARTH',
                  bonusPermille: 0,
                  repair: null,
                })),
            },
          }
        : {}),
    };
  }
}
