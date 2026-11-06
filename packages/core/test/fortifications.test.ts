import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  battles,
  seedWorlds,
  villageLayouts,
  wallSections,
  wallRepairOrders,
  resourceLedger,
  villages,
  armyMovements,
  scheduledEvents,
} from '@reinos/db';
import { resolveBattle, type BattleSnapshot } from '@reinos/game-rules';
import { FortificationService } from '../src/index.js';
import {
  createHarness,
  joinedPlayer,
  key,
  fixtureBuilding,
  fixtureResources,
  fixtureTroops,
  expectDomainError,
  type Harness,
} from './helpers.js';

describe('urbanismo y fortificaciones 2.1 — PostgreSQL real', () => {
  let h: Harness;
  let service: FortificationService;
  beforeAll(async () => {
    h = await createHarness();
    service = new FortificationService(h.ctx);
    await seedWorlds(
      h.database.db,
      [
        {
          slug: 'organic',
          name: 'Orgánico',
          profile: 'test',
          speedMultiplier: 50,
          mapSeed: 888,
          mapSize: 64,
          protectionHours: 0,
          rulesetVersion: 'frontier-alpha.2',
        },
      ],
      h.clock.now(),
    );
  });
  afterAll(async () => h?.close());
  it('funda con plano persistido, lectura estable y tres secciones aisladas por mundo', async () => {
    const p = await joinedPlayer(h, 'Urbanista', 'organic', 'stone_wardens');
    const a = await h.queries.villageView(p.accountId, p.worldId, p.villageId),
      b = await h.queries.villageView(p.accountId, p.worldId, p.villageId);
    expect(a.layout).toEqual(b.layout);
    expect(a.walls).toHaveLength(3);
    expect(
      await h.database.db
        .select()
        .from(villageLayouts)
        .where(eq(villageLayouts.villageId, p.villageId)),
    ).toHaveLength(1);
    const other = await h.worldId('test-b');
    await expect(
      h.database.db
        .update(wallSections)
        .set({ worldId: other })
        .where(eq(wallSections.villageId, p.villageId)),
    ).rejects.toThrow();
    await expectDomainError(
      service.repair({ accountId: p.accountId }, other, p.villageId, { precinct: 3 }, key()),
      'VILLAGE_NOT_FOUND',
    );
  });
  it('reparación concurrente/reintento: un gasto y una llegada, sin borrar daño posterior', async () => {
    const p = await joinedPlayer(h, 'Reparadora', 'organic', 'forest_kin');
    await fixtureBuilding(h, p.worldId, p.villageId, 19, 'wall', 3);
    await fixtureResources(h, p.villageId, { wood: 3000, stone: 3000, iron: 3000, food: 3000 });
    await h.database.db
      .update(wallSections)
      .set({ integrity: 400 })
      .where(and(eq(wallSections.villageId, p.villageId), eq(wallSections.precinct, 3)));
    const idem = key();
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        service.repair({ accountId: p.accountId }, p.worldId, p.villageId, { precinct: 3 }, idem),
      ),
    );
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    const competing = await Promise.allSettled(
      [1, 2].map(() =>
        service.repair({ accountId: p.accountId }, p.worldId, p.villageId, { precinct: 3 }, key()),
      ),
    );
    expect(competing.every((x) => x.status === 'rejected')).toBe(true);
    // Un asedio posterior quita otros 200 puntos: reparar 600 no debe devolverla a 1000.
    await h.database.db
      .update(wallSections)
      .set({ integrity: 200 })
      .where(and(eq(wallSections.villageId, p.villageId), eq(wallSections.precinct, 3)));
    h.clock.set(new Date(results[0]!.completesAt));
    await h.worker().drain();
    await h.worker().drain();
    const view = await h.queries.villageView(p.accountId, p.worldId, p.villageId);
    expect(view.walls!.find((w) => w.precinct === 3)!.integrity).toBe(800);
    expect(
      await h.database.db
        .select()
        .from(resourceLedger)
        .where(eq(resourceLedger.refId, results[0]!.orderId)),
    ).toHaveLength(1);
    expect(
      (
        await h.database.db
          .select()
          .from(wallRepairOrders)
          .where(eq(wallRepairOrders.id, results[0]!.orderId))
      )[0]!.status,
    ).toBe('COMPLETED');
  });
  it('rechaza reparación ajena y cambio de doctrina fuera de su versión', async () => {
    const a = await joinedPlayer(h, 'Fortaleza', 'organic', 'stone_wardens'),
      b = await joinedPlayer(h, 'Visitante', 'organic', 'steppe_clans');
    await expectDomainError(
      service.repair({ accountId: b.accountId }, a.worldId, a.villageId, { precinct: 1 }, key()),
      'VILLAGE_NOT_FOUND',
    );
    await h.commands.setDoctrine({ accountId: a.accountId }, a.worldId, a.villageId, {
      reservePercent: 0,
      retreatThresholdPercent: null,
      deployment: 'CORE',
    });
    expect(
      (await h.queries.villageView(a.accountId, a.worldId, a.villageId)).doctrine.deployment,
    ).toBe('CORE');
    const old = await joinedPlayer(h, 'Legado', 'test-a');
    await expectDomainError(
      h.commands.setDoctrine({ accountId: old.accountId }, old.worldId, old.villageId, {
        reservePercent: 0,
        retreatThresholdPercent: null,
        deployment: 'CORE',
      }),
      'FEATURE_DISABLED',
    );
  });
  it('asedio offline guarda fases, aplica daños una vez y conserva replay autoritativo', async () => {
    const a = await joinedPlayer(h, 'Asediante', 'organic', 'steppe_clans'),
      d = await joinedPlayer(h, 'Defensora', 'organic', 'stone_wardens');
    for (const [plot, type] of [
      [19, 'wall'],
      [20, 'middle_wall'],
      [21, 'inner_wall'],
    ] as const)
      await fixtureBuilding(h, d.worldId, d.villageId, plot, type, 3);
    await fixtureBuilding(h, a.worldId, a.villageId, 2, 'rally_point', 3);
    await fixtureTroops(h, a.worldId, a.villageId, 'militia', 1000);
    await fixtureTroops(h, a.worldId, a.villageId, 'ram', 100);
    await fixtureTroops(h, a.worldId, a.villageId, 'catapult', 20);
    const march = await h.commands.sendMovement(
      { accountId: a.accountId },
      a.worldId,
      a.villageId,
      {
        targetVillageId: d.villageId,
        mission: 'ATTACK',
        units: [
          { unitType: 'militia', quantity: 1000 },
          { unitType: 'ram', quantity: 100 },
          { unitType: 'catapult', quantity: 20 },
        ],
        siegeTargetPlot: 1,
      },
      key(),
    );
    h.clock.set(new Date(march.arrivalAt));
    await h.worker().drain();
    await h.worker().drain();
    const rows = await h.database.db
      .select()
      .from(battles)
      .where(eq(battles.movementId, march.movementId));
    expect(rows).toHaveLength(1);
    const snapshot = rows[0]!.snapshot as BattleSnapshot;
    expect(rows[0]!.result).toEqual(
      resolveBattle((await import('@reinos/game-config')).getRuleset('frontier-alpha.2'), snapshot),
    );
    expect((rows[0]!.result as { precincts: unknown[] }).precincts).toHaveLength(3);
    const view = await h.queries.villageView(d.accountId, d.worldId, d.villageId);
    expect(view.walls!.some((w) => w.integrity < 1000)).toBe(true);
    expect(view.buildings.find((b) => b.plot === 1)).toBeUndefined();
    const report = await h.queries.getReport(a.accountId, a.worldId, rows[0]!.id);
    expect(report.layout).toEqual(snapshot.fortifications!.layout);
    await expectDomainError(
      h.queries.getReport(a.accountId, await h.worldId('test-b'), rows[0]!.id),
      'NOT_A_MEMBER',
    );
    // El plano original permanece idéntico aunque cambien las construcciones.
    expect(view.layout).toEqual(snapshot.fortifications!.layout);
    expect(
      (
        await h.database.db
          .select({ n: sql<number>`count(*)::int` })
          .from(villages)
          .where(eq(villages.id, d.villageId))
      )[0]!.n,
    ).toBe(1);
  });
  it('dos asedios y reparación en el mismo instante se serializan con dos workers', async () => {
    const a = await joinedPlayer(h, 'AsedioDoble', 'organic', 'steppe_clans'),
      d = await joinedPlayer(h, 'MuroDoble', 'organic', 'stone_wardens');
    await fixtureBuilding(h, d.worldId, d.villageId, 19, 'wall', 3);
    await fixtureResources(h, d.villageId, { wood: 3000, stone: 3000, iron: 3000, food: 3000 });
    await h.database.db
      .update(wallSections)
      .set({ integrity: 500 })
      .where(and(eq(wallSections.villageId, d.villageId), eq(wallSections.precinct, 3)));
    const repair = await service.repair(
      { accountId: d.accountId },
      d.worldId,
      d.villageId,
      { precinct: 3 },
      key(),
    );
    await fixtureTroops(h, a.worldId, a.villageId, 'militia', 200);
    await fixtureTroops(h, a.worldId, a.villageId, 'ram', 40);
    const marches = [];
    for (let i = 0; i < 2; i++)
      marches.push(
        await h.commands.sendMovement(
          { accountId: a.accountId },
          a.worldId,
          a.villageId,
          {
            targetVillageId: d.villageId,
            mission: 'ATTACK',
            units: [
              { unitType: 'militia', quantity: 100 },
              { unitType: 'ram', quantity: 20 },
            ],
          },
          key(),
        ),
      );
    const at = new Date(repair.completesAt);
    for (const m of marches) {
      await h.database.db
        .update(armyMovements)
        .set({ arrivesAt: at })
        .where(eq(armyMovements.id, m.movementId));
      await h.database.db
        .update(scheduledEvents)
        .set({ dueAt: at, availableAt: at })
        .where(
          and(
            eq(scheduledEvents.worldId, a.worldId),
            eq(scheduledEvents.dedupeKey, `arrival:${m.movementId}`),
          ),
        );
    }
    h.clock.set(at);
    await Promise.all([h.worker('race-a').drain(), h.worker('race-b').drain()]);
    await h.worker().drain();
    const rows = (
      await h.database.db.select().from(battles).where(eq(battles.defenderVillageId, d.villageId))
    ).sort((a, b) => {
      const ai = (a.result as import('@reinos/game-rules').BattleResult).precincts![0]!
        .integrityBefore;
      const bi = (b.result as import('@reinos/game-rules').BattleResult).precincts![0]!
        .integrityBefore;
      return bi - ai;
    });
    expect(rows).toHaveLength(2);
    const first = (rows[0]!.result as import('@reinos/game-rules').BattleResult).precincts![0]!,
      second = (rows[1]!.result as import('@reinos/game-rules').BattleResult).precincts![0]!;
    expect(first.integrityBefore).toBe(1000);
    expect(second.integrityBefore).toBe(first.integrityAfter);
    const view = await h.queries.villageView(d.accountId, d.worldId, d.villageId);
    expect(view.walls!.find((w) => w.precinct === 3)!.integrity).toBe(second.integrityAfter);
    await h.worker().drain();
    expect(
      await h.database.db.select().from(battles).where(eq(battles.defenderVillageId, d.villageId)),
    ).toHaveLength(2);
  });
  it('romanos construyen campo y edificio a la vez; cada cola reserva una sola orden', async () => {
    const p = await joinedPlayer(h, 'DobleCola', 'organic', 'stone_wardens');
    const actor = { accountId: p.accountId };
    const results = await Promise.allSettled([
      h.commands.startConstruction(
        actor,
        p.worldId,
        p.villageId,
        { plot: 22, buildingType: 'sawmill' },
        key(),
      ),
      h.commands.startConstruction(
        actor,
        p.worldId,
        p.villageId,
        { plot: 4, buildingType: 'barracks' },
        key(),
      ),
    ]);
    expect(results.map((r) => (r.status === 'fulfilled' ? 'ok' : String(r.reason)))).toEqual([
      'ok',
      'ok',
    ]);
    await expectDomainError(
      h.commands.startConstruction(
        actor,
        p.worldId,
        p.villageId,
        { plot: 23, buildingType: 'sawmill' },
        key(),
      ),
      'CONSTRUCTION_QUEUE_BUSY',
    );
    const view = await h.queries.villageView(p.accountId, p.worldId, p.villageId);
    expect(view.constructions).toHaveLength(2);
    h.clock.set(Math.max(...view.constructions!.map((o) => Date.parse(o.completesAt))));
    await h.worker().drain();
    const done = await h.queries.villageView(p.accountId, p.worldId, p.villageId);
    expect(done.constructions).toHaveLength(0);
    expect(done.buildings.find((b) => b.plot === 22)!.level).toBe(2);
    const g = await joinedPlayer(h, 'ColaGala', 'organic', 'forest_kin');
    await h.commands.startConstruction(
      { accountId: g.accountId },
      g.worldId,
      g.villageId,
      { plot: 22, buildingType: 'sawmill' },
      key(),
    );
    await expectDomainError(
      h.commands.startConstruction(
        { accountId: g.accountId },
        g.worldId,
        g.villageId,
        { plot: 4, buildingType: 'barracks' },
        key(),
      ),
      'CONSTRUCTION_QUEUE_BUSY',
    );
  });
  it('la producción x50 no acelera el desplazamiento militar independiente', async () => {
    const a = await joinedPlayer(h, 'ViajeLento', 'organic', 'steppe_clans'),
      d = await joinedPlayer(h, 'DestinoLejano', 'organic', 'forest_kin');
    await fixtureTroops(h, a.worldId, a.villageId, 'militia', 2);
    const av = await h.queries.villageView(a.accountId, a.worldId, a.villageId),
      dv = await h.queries.villageView(d.accountId, d.worldId, d.villageId);
    const march = await h.commands.sendMovement(
      { accountId: a.accountId },
      a.worldId,
      a.villageId,
      {
        mission: 'ATTACK',
        targetVillageId: d.villageId,
        units: [{ unitType: 'militia', quantity: 1 }],
      },
      key(),
    );
    const rules = await import('@reinos/game-rules');
    const config = await import('@reinos/game-config');
    const expected = rules.travelSeconds(
      rules.distanceMilli(av, dv),
      rules.slowestSpeed(config.getRuleset('frontier-alpha.2'), [
        { unitType: 'militia', quantity: 1 },
      ]),
      1,
    );
    expect((Date.parse(march.arrivalAt) - Date.parse(march.departureAt)) / 1000).toBe(expected);
    expect(av.movementSpeedMultiplier).toBe(1);
  });
  it('mapa 5000: alta por cuadrante sin materializar millones de casillas', async () => {
    await seedWorlds(
      h.database.db,
      [
        {
          slug: 'large',
          name: 'Grande 5000',
          profile: 'test',
          speedMultiplier: 1,
          mapSeed: 1999,
          mapSize: 5000,
          protectionHours: 0,
          rulesetVersion: 'frontier-alpha.2',
        },
      ],
      h.clock.now(),
    );
    const accountId = await (await import('./helpers.js')).newPlayer(h, 'GranMundo');
    const worldId = await h.worldId('large');
    const joined = await h.commands.joinWorld(
      { accountId },
      worldId,
      {
        civilization: 'stone_wardens',
        villageName: 'Sur Oriental',
        characterName: 'Imperio Grande',
        quadrant: 'SE',
      },
      key(),
    );
    expect(joined.x).toBeGreaterThanOrEqual(2500);
    expect(joined.y).toBeGreaterThanOrEqual(2500);
    const map = await h.queries.mapRegion(accountId, worldId, { x: 4999, y: 4999, radius: 2 });
    expect(map.tiles.length).toBeLessThanOrEqual(25);
    const counts = await h.database.db
      .select({ n: sql<number>`count(*)::int` })
      .from(villages)
      .where(eq(villages.worldId, worldId));
    expect(counts[0]!.n).toBe(1);
  });
  it('el informe atacante oculta guarnición y edificios interiores no observados', async () => {
    const a = await joinedPlayer(h, 'ExploradoraFallida', 'organic', 'steppe_clans'),
      d = await joinedPlayer(h, 'ReservaPrivada', 'organic', 'forest_kin');
    await fixtureTroops(h, a.worldId, a.villageId, 'militia', 1);
    await fixtureTroops(h, d.worldId, d.villageId, 'spearman', 9000);
    await h.commands.setDoctrine({ accountId: d.accountId }, d.worldId, d.villageId, {
      reservePercent: 10,
      retreatThresholdPercent: null,
      deployment: 'CORE',
    });
    const m = await h.commands.sendMovement(
      { accountId: a.accountId },
      a.worldId,
      a.villageId,
      {
        targetVillageId: d.villageId,
        mission: 'ATTACK',
        units: [{ unitType: 'militia', quantity: 1 }],
      },
      key(),
    );
    h.clock.set(Date.parse(m.arrivalAt));
    await h.worker().drain();
    const [battle] = await h.database.db
      .select()
      .from(battles)
      .where(eq(battles.movementId, m.movementId));
    const attacker = await h.queries.getReport(a.accountId, a.worldId, battle!.id),
      defender = await h.queries.getReport(d.accountId, d.worldId, battle!.id);
    const ar = attacker.result as import('@reinos/game-rules').BattleResult,
      dr = defender.result as import('@reinos/game-rules').BattleResult;
    expect(ar.precincts).toHaveLength(1);
    expect(ar.defender.present.reduce((s, u) => s + u.quantity, 0)).toBeLessThan(9000);
    expect(ar.defender.reserve).toEqual([]);
    expect(dr.defender.present.reduce((s, u) => s + u.quantity, 0)).toBe(9000);
    expect(
      attacker.replay!.buildings.every(
        (b) => attacker.layout!.plots.find((p) => p.id === b.plot)?.precinct === 3,
      ),
    ).toBe(true);
    expect(attacker.replay!.buildings.some((b) => b.type === 'castle')).toBe(false);
    expect(defender.replay!.buildings.some((b) => b.type === 'castle')).toBe(true);
    expect((battle!.result as import('@reinos/game-rules').BattleResult).defender.present).toEqual(
      dr.defender.present,
    );
  });
  it('conquista exige derribar el Castillo, llegar al núcleo y conservar administradores', async () => {
    const a = await joinedPlayer(h, 'ConquistaEscalonada', 'organic', 'steppe_clans');
    const [npc] = await h.database.db
      .select()
      .from(villages)
      .where(and(eq(villages.worldId, a.worldId), eq(villages.kind, 'NPC')))
      .limit(1);
    expect(npc).toBeDefined();
    await fixtureBuilding(h, a.worldId, a.villageId, 2, 'rally_point', 3);
    const send = async (mission: 'CONQUER' | 'ATTACK', cats: boolean) => {
      await fixtureTroops(h, a.worldId, a.villageId, 'militia', 2000);
      await fixtureTroops(h, a.worldId, a.villageId, 'chieftain', 3);
      if (cats) await fixtureTroops(h, a.worldId, a.villageId, 'catapult', 20);
      const units = [
        { unitType: 'militia' as const, quantity: 1000 },
        { unitType: 'chieftain' as const, quantity: 3 },
        ...(cats ? [{ unitType: 'catapult' as const, quantity: 20 }] : []),
      ];
      const m = await h.commands.sendMovement(
        { accountId: a.accountId },
        a.worldId,
        a.villageId,
        { mission, targetVillageId: npc!.id, units, ...(cats ? { siegeTargetPlot: 1 } : {}) },
        key(),
      );
      h.clock.set(Date.parse(m.arrivalAt));
      await h.worker().drain();
    };
    await send('CONQUER', false);
    expect(
      (await h.database.db.select().from(villages).where(eq(villages.id, npc!.id)))[0]!
        .ownerAccountId,
    ).toBeNull();
    await send('ATTACK', true);
    await send('CONQUER', false);
    const captured = (
      await h.database.db.select().from(villages).where(eq(villages.id, npc!.id))
    )[0]!;
    expect(captured.ownerAccountId).toBe(a.accountId);
    expect(captured.kind).toBe('PLAYER');
    const view = await h.queries.villageView(a.accountId, a.worldId, npc!.id);
    expect(view.layout).toBeDefined();
    expect(view.buildings.some((b) => b.type === 'castle')).toBe(false);
  });
});
