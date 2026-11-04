import { aliasedTable, and, asc, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import {
  accounts,
  armyMovements,
  battles,
  constructionOrders,
  recruitmentOrders,
  villages,
  worldPlayers,
  worlds,
} from '@reinos/db';
import type {
  BattleReportDetail,
  BattleReportSummary,
  MapRegionView,
  MapQuery,
  MovementView,
  VillageView,
  WorldSummary,
} from '@reinos/contracts';
import { mapQuerySchema } from '@reinos/contracts';
import type { BuildingType, CivilizationId, UnitType } from '@reinos/game-config';
import {
  isStarving,
  levelOf,
  populationCapacity,
  populationOf,
  renderRegion,
  settle,
  toSafeNumber,
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
} from './village-state.js';

interface ReportRow {
  id: string;
  occurredAt: Date;
  mission: 'ATTACK' | 'RAID';
  outcome: 'ATTACKER' | 'DEFENDER';
  attackerAccountId: string;
  rulesetVersion: string;
  seed: string;
  result: unknown;
  attackerVillageName: string;
  defenderVillageName: string;
  attackerName: string;
  defenderName: string | null;
}

/**
 * Consultas de solo lectura. No aplican eventos: liquidan la economía en
 * memoria hasta `now` para mostrar valores actuales sin escribir.
 */
export class GameQueries {
  constructor(private readonly ctx: CoreContext) {}

  async listWorlds(accountId: string): Promise<WorldSummary[]> {
    const rows = await this.ctx.db
      .select({
        w: worlds,
        playerCount: sql<number>`(select count(*)::int from ${worldPlayers} wp where wp.world_id = ${worlds.id})`,
      })
      .from(worlds)
      .orderBy(asc(worlds.createdAt), asc(worlds.slug));
    const memberships = await this.ctx.db.select().from(worldPlayers).where(eq(worldPlayers.accountId, accountId));
    const myVillages = await this.ctx.db
      .select({ id: villages.id, worldId: villages.worldId })
      .from(villages)
      .where(eq(villages.ownerAccountId, accountId))
      .orderBy(asc(villages.createdAt));
    return rows.map(({ w, playerCount }) => {
      const m = memberships.find((x) => x.worldId === w.id);
      return {
        id: w.id,
        slug: w.slug,
        name: w.name,
        status: w.status,
        profile: w.profile,
        rulesetVersion: w.rulesetVersion,
        speedMultiplier: w.speedMultiplier,
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
      .where(and(eq(villages.worldId, worldId), eq(villages.id, villageId), eq(villages.ownerAccountId, accountId)));
    if (!village) throw err.notFound('VILLAGE_NOT_FOUND', 'Aldea no encontrada');
    const world = await loadWorld(db, worldId);
    const r = rulesetOf(world);
    const member = await this.requireMembership(accountId, worldId);
    const now = this.ctx.clock.now();
    const state = settle(await loadEconomy(db, villageId), now.getTime());
    const buildings = await loadBuildings(db, villageId);
    const troops = await loadTroops(db, villageId);
    const wounded = await loadWounded(db, villageId);
    const away = await loadAwayTroops(db, villageId);
    const training = await loadTrainingTroops(db, villageId);

    const [construction] = await db
      .select()
      .from(constructionOrders)
      .where(and(eq(constructionOrders.villageId, villageId), eq(constructionOrders.status, 'IN_PROGRESS')));
    const recruitment = await db
      .select()
      .from(recruitmentOrders)
      .where(and(eq(recruitmentOrders.villageId, villageId), eq(recruitmentOrders.status, 'IN_PROGRESS')))
      .orderBy(asc(recruitmentOrders.completesAt));

    const movements = await this.movementsFor(worldId, villageId);

    const n = (b: bigint) => toSafeNumber(b);
    return {
      id: village.id,
      worldId,
      name: village.name,
      x: village.x,
      y: village.y,
      coastal: village.coastal,
      civilization: member.civilization as CivilizationId,
      rulesetVersion: r.version,
      speedMultiplier: world.speedMultiplier,
      serverTime: iso(now),
      resources: {
        amountsMilli: { wood: n(state.amounts.wood), stone: n(state.amounts.stone), iron: n(state.amounts.iron), food: n(state.amounts.food) },
        ratesMilliPerHour: { wood: n(state.rates.wood), stone: n(state.rates.stone), iron: n(state.rates.iron), food: n(state.rates.food) },
        capacityMilli: n(state.capacity),
        settledAt: iso(new Date(state.lastSettledAt)),
        starving: isStarving(state),
      },
      population: {
        used: populationOf(r, [...troops, ...wounded, ...away, ...training]),
        capacity: populationCapacity(r, levelOf(buildings, 'city_hall')),
      },
      buildings: buildings.map((b) => ({ plot: b.plot, type: b.type, level: b.level })),
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
      },
      movements,
      protectionUntil: iso(member.protectionUntil),
    };
  }

  private async movementsFor(worldId: string, villageId: string): Promise<MovementView[]> {
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
            and(eq(armyMovements.originVillageId, villageId), inArray(armyMovements.status, ['IN_TRANSIT', 'RETURNING'])),
            and(eq(armyMovements.targetVillageId, villageId), eq(armyMovements.status, 'IN_TRANSIT')),
          ),
        ),
      )
      .orderBy(asc(armyMovements.arrivesAt));
    return rows.map(({ m, originName, targetName }) => {
      const mine = m.originVillageId === villageId;
      const returning = m.status === 'RETURNING';
      return {
        id: m.id,
        direction: mine ? (returning ? 'RETURNING' : 'OUTGOING') : 'INCOMING',
        mission: m.mission,
        status: m.status,
        originVillageId: m.originVillageId,
        originName,
        targetVillageId: m.targetVillageId,
        targetName,
        departedAt: iso(m.departedAt),
        arrivesAt: iso(returning && m.returnsAt ? m.returnsAt : m.arrivesAt),
        // El defensor no ve la composición del ataque entrante.
        units: mine ? Object.entries(m.units).map(([unitType, quantity]) => ({ unitType: unitType as UnitType, quantity })) : null,
        loot: mine && m.loot ? { wood: m.loot.wood ?? 0, stone: m.loot.stone ?? 0, iron: m.loot.iron ?? 0, food: m.loot.food ?? 0 } : null,
      };
    });
  }

  async mapRegion(accountId: string, worldId: string, query: MapQuery): Promise<MapRegionView> {
    const q = mapQuerySchema.parse(query);
    await this.requireMembership(accountId, worldId);
    const world = await loadWorld(this.ctx.db, worldId);
    const x0 = Math.max(0, q.x - q.radius);
    const y0 = Math.max(0, q.y - q.radius);
    const x1 = Math.min(world.mapSize - 1, q.x + q.radius);
    const y1 = Math.min(world.mapSize - 1, q.y + q.radius);
    const region = renderRegion(world.mapSeed, world.mapSize, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    const rows = await this.ctx.db
      .select({
        id: villages.id,
        name: villages.name,
        x: villages.x,
        y: villages.y,
        owner: villages.ownerAccountId,
        ownerName: accounts.displayName,
        civilization: worldPlayers.civilization,
      })
      .from(villages)
      .leftJoin(accounts, eq(accounts.id, villages.ownerAccountId))
      .leftJoin(worldPlayers, and(eq(worldPlayers.worldId, villages.worldId), eq(worldPlayers.accountId, villages.ownerAccountId)))
      .where(and(eq(villages.worldId, worldId), gte(villages.x, x0), lte(villages.x, x1), gte(villages.y, y0), lte(villages.y, y1)));
    return {
      ...region,
      villages: rows.map((v) => ({
        id: v.id,
        name: v.name,
        x: v.x,
        y: v.y,
        ownerName: v.ownerName ?? null,
        civilization: (v.civilization as CivilizationId | null) ?? null,
        isMine: v.owner === accountId,
      })),
    };
  }

  private async reportRows(worldId: string, accountId: string, battleId?: string, limit = 50): Promise<ReportRow[]> {
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
    };
  }

  async listReports(accountId: string, worldId: string): Promise<BattleReportSummary[]> {
    await this.requireMembership(accountId, worldId);
    const rows = await this.reportRows(worldId, accountId);
    return rows.map((r) => this.toSummary(accountId, r));
  }

  async getReport(accountId: string, worldId: string, battleId: string): Promise<BattleReportDetail> {
    await this.requireMembership(accountId, worldId);
    if (!/^[0-9a-f-]{36}$/i.test(battleId)) throw err.notFound('REPORT_NOT_FOUND', 'Informe no encontrado');
    const [row] = await this.reportRows(worldId, accountId, battleId, 1);
    if (!row) throw err.notFound('REPORT_NOT_FOUND', 'Informe no encontrado');
    return { ...this.toSummary(accountId, row), rulesetVersion: row.rulesetVersion, seed: row.seed, result: row.result };
  }
}
