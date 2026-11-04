import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq, sql } from 'drizzle-orm';
import { armyMovements, battles, resourceLedger, scheduledEvents, troopStacks } from '@reinos/db';
import { resolveBattle, type BattleResult, type BattleSnapshot } from '@reinos/game-rules';
import {
  createHarness,
  expectDomainError,
  fixtureBuilding,
  fixtureResources,
  fixtureTroops,
  fixtureZeroRates,
  joinedPlayer,
  key,
  ruleset,
  troopsOf,
  wholeResources,
  type Harness,
} from './helpers.js';

let h: Harness;
beforeEach(async () => {
  await h?.close();
  h = await createHarness();
});
afterAll(async () => h?.close());

async function twoPlayers(world = 'test-a') {
  const a = await joinedPlayer(h, 'Atacante', world, 'imperial_crown');
  const d = await joinedPlayer(h, 'Defensor', world, 'sea_league');
  for (const p of [a, d]) await fixtureZeroRates(h, p.villageId);
  await fixtureTroops(h, a.worldId, a.villageId, 'militia', 200);
  await fixtureTroops(h, d.worldId, d.villageId, 'spearman', 20);
  await fixtureResources(h, d.villageId, { wood: 1000, stone: 1000, iron: 1000, food: 1000 });
  await fixtureResources(h, a.villageId, { wood: 0, stone: 0, iron: 0, food: 0 });
  return { a, d };
}

describe('ataque offline (Gate 1, PRD §18.5)', () => {
  it('resuelve una sola vez con defensor desconectado, botín conservado y retorno', async () => {
    const { a, d } = await twoPlayers();
    const send = await h.commands.sendMovement(
      { accountId: a.accountId },
      a.worldId,
      a.villageId,
      { targetVillageId: d.villageId, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 150 }] },
      key(),
    );
    expect(await troopsOf(h, a.villageId)).toEqual({ militia: 50 });
    // Tropas comprometidas: no se pueden enviar dos veces.
    await expectDomainError(
      h.commands.sendMovement({ accountId: a.accountId }, a.worldId, a.villageId, { targetVillageId: d.villageId, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 51 }] }, key()),
      'INSUFFICIENT_TROOPS',
    );
    // El defensor ve el ataque entrante, sin composición.
    const dView = await h.queries.villageView(d.accountId, d.worldId, d.villageId);
    expect(dView.movements).toHaveLength(1);
    expect(dView.movements[0]!.direction).toBe('INCOMING');
    expect(dView.movements[0]!.units).toBeNull();

    h.clock.set(new Date(send.arrivalAt).getTime() + 5_000);
    const w = h.worker();
    expect((await w.drain()).applied).toBe(1);

    const [battle] = await h.database.db.select().from(battles).where(eq(battles.worldId, a.worldId));
    expect(battle).toBeDefined();
    const result = battle!.result as BattleResult;
    expect(result.outcome).toBe('ATTACKER');
    // Reproducible: mismo snapshot + semilla + versión ⇒ mismo resultado (NFR-11).
    expect(resolveBattle(ruleset, battle!.snapshot as BattleSnapshot)).toEqual(result);

    // Defensor: bajas y botín descontados, con ledger.
    expect(await troopsOf(h, d.villageId)).toEqual({});
    const dRes = await wholeResources(h, d.villageId);
    expect(dRes.wood).toBe(1000 - result.loot.wood);
    const out = await h.database.db.select().from(resourceLedger).where(eq(resourceLedger.reason, 'LOOT_OUT'));
    expect(out).toHaveLength(1);

    // Regreso: supervivientes + botín llegan a la aldea atacante.
    const [m] = await h.database.db.select().from(armyMovements).where(eq(armyMovements.id, send.movementId));
    expect(m!.status).toBe('RETURNING');
    h.clock.set(m!.returnsAt!.getTime() + 1);
    expect((await w.drain()).applied).toBe(1);
    const survivors = result.attacker.survivors.find((s) => s.unitType === 'militia')!.quantity;
    expect(await troopsOf(h, a.villageId)).toEqual({ militia: 50 + survivors });
    // Conservación: lo acreditado al atacante es exactamente lo debitado al defensor
    // (capacidad suficiente). El saldo final incluye además su producción/mantenimiento.
    const [lootIn] = await h.database.db.select().from(resourceLedger).where(eq(resourceLedger.reason, 'LOOT_IN'));
    for (const k of ['wood', 'stone', 'iron', 'food'] as const) {
      expect(lootIn![k]).toBe(BigInt(result.loot[k]) * 1000n);
      expect(out[0]![k]).toBe(-BigInt(result.loot[k]) * 1000n);
    }
    expect((await wholeResources(h, a.villageId)).wood).toBeGreaterThanOrEqual(result.loot.wood);
    expect((await h.queries.listReports(d.accountId, d.worldId))[0]!.role).toBe('DEFENDER');
    expect((await h.queries.getReport(a.accountId, a.worldId, battle!.id)).role).toBe('ATTACKER');
  });

  it('caso §25.2: el worker cae tras resolver la batalla y antes de confirmar ⇒ sin duplicados', async () => {
    const { a, d } = await twoPlayers();
    const send = await h.commands.sendMovement({ accountId: a.accountId }, a.worldId, a.villageId, { targetVillageId: d.villageId, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 150 }] }, key());
    h.clock.set(new Date(send.arrivalAt).getTime());
    let crashes = 0;
    h.ctx.faults!.afterEventApplied = () => {
      if (crashes++ === 0) throw new Error('caída simulada antes del COMMIT');
    };
    const w = h.worker();
    const first = await w.tick();
    expect(first.failed).toBe(1);
    expect(await h.database.db.select().from(battles)).toHaveLength(0); // rollback total
    expect(await troopsOf(h, d.villageId)).toEqual({ spearman: 20 });
    const [ev] = await h.database.db.select().from(scheduledEvents).where(eq(scheduledEvents.type, 'MOVEMENT_ARRIVAL'));
    expect(ev!.status).toBe('PENDING');
    expect(ev!.lastError).toMatch(/caída simulada/);

    h.clock.advance(5_000); // tras backoff
    expect((await w.drain()).applied).toBe(1);
    expect((await w.drain()).claimed).toBe(0);
    expect(await h.database.db.select().from(battles)).toHaveLength(1);
    expect(await h.database.db.select().from(resourceLedger).where(eq(resourceLedger.reason, 'LOOT_OUT'))).toHaveLength(1);
  });

  it('lease caducado: dos workers reclaman el mismo evento y se aplica una sola vez', async () => {
    const { a, d } = await twoPlayers();
    const send = await h.commands.sendMovement({ accountId: a.accountId }, a.worldId, a.villageId, { targetVillageId: d.villageId, mission: 'RAID', units: [{ unitType: 'militia', quantity: 100 }] }, key());
    h.clock.set(new Date(send.arrivalAt).getTime());
    const w1 = h.worker('w1', { leaseMs: 1_000 });
    const w2 = h.worker('w2', { leaseMs: 1_000 });
    const [stale] = await w1.claim();
    expect(stale).toBeDefined();
    h.clock.advance(2_000); // w1 "se cuelga"; su lease caduca
    const t2 = await w2.tick();
    expect(t2.applied).toBe(1);
    expect(await w1.process(stale!)).toBe('skipped');
    expect(await h.database.db.select().from(battles)).toHaveLength(1);
  });

  it('caso §25.3: llegadas simultáneas se aplican en orden estable (due_at, prioridad, id)', async () => {
    const { a, d } = await twoPlayers();
    const c = await joinedPlayer(h, 'Tercero', 'test-a', 'sea_league');
    await fixtureZeroRates(h, c.villageId);
    await fixtureTroops(h, c.worldId, c.villageId, 'militia', 200);
    const s1 = await h.commands.sendMovement({ accountId: a.accountId }, a.worldId, a.villageId, { targetVillageId: d.villageId, mission: 'RAID', units: [{ unitType: 'militia', quantity: 30 }] }, key());
    const s2 = await h.commands.sendMovement({ accountId: c.accountId }, c.worldId, c.villageId, { targetVillageId: d.villageId, mission: 'RAID', units: [{ unitType: 'militia', quantity: 30 }] }, key());
    // Forzar el mismo instante de llegada para ambos.
    const same = new Date(Math.max(new Date(s1.arrivalAt).getTime(), new Date(s2.arrivalAt).getTime()) + 1000);
    await h.database.db.update(scheduledEvents).set({ dueAt: same, availableAt: same }).where(eq(scheduledEvents.type, 'MOVEMENT_ARRIVAL'));
    await h.database.db.update(armyMovements).set({ arrivesAt: same });
    h.clock.set(same.getTime());
    await h.worker().drain();
    const evs = await h.database.db.select().from(scheduledEvents).where(eq(scheduledEvents.type, 'MOVEMENT_ARRIVAL')).orderBy(asc(scheduledEvents.id));
    const bs = await h.database.db.select().from(battles).orderBy(asc(battles.createdAt));
    expect(bs).toHaveLength(2);
    // La primera batalla aplicada corresponde al evento de menor id.
    const firstMovement = (evs[0]!.payload as { movementId: string }).movementId;
    expect(bs[0]!.movementId).toBe(firstMovement);
    // La segunda ve al defensor ya mermado por la primera.
    const r1 = bs[0]!.result as BattleResult;
    const snap2 = bs[1]!.snapshot as BattleSnapshot;
    const after1 = r1.defender.survivors.find((s) => s.unitType === 'spearman')?.quantity ?? 0;
    expect(snap2.defender.units.find((s) => s.unitType === 'spearman')?.quantity ?? 0).toBe(after1);
  });

  it('EVENTS_PENDING: el defensor no puede alterar su aldea con un combate vencido sin resolver', async () => {
    const { a, d } = await twoPlayers();
    const send = await h.commands.sendMovement({ accountId: a.accountId }, a.worldId, a.villageId, { targetVillageId: d.villageId, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 150 }] }, key());
    h.clock.set(new Date(send.arrivalAt).getTime() + 1);
    await expectDomainError(
      h.commands.setDoctrine({ accountId: d.accountId }, d.worldId, d.villageId, { reservePercent: 50, retreatThresholdPercent: null }),
      'EVENTS_PENDING',
    );
    await h.worker().drain();
    await h.commands.setDoctrine({ accountId: d.accountId }, d.worldId, d.villageId, { reservePercent: 50, retreatThresholdPercent: null });
  });

  it('doctrina offline: la reserva configurada sobrevive aunque el defensor pierda', async () => {
    const { a, d } = await twoPlayers();
    await h.commands.setDoctrine({ accountId: d.accountId }, d.worldId, d.villageId, { reservePercent: 50, retreatThresholdPercent: null });
    const send = await h.commands.sendMovement({ accountId: a.accountId }, a.worldId, a.villageId, { targetVillageId: d.villageId, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 200 }] }, key());
    h.clock.set(new Date(send.arrivalAt).getTime());
    await h.worker().drain();
    expect(await troopsOf(h, d.villageId)).toEqual({ spearman: 10 });
  });

  it('hospital: parte de las bajas defensivas pasan a heridos', async () => {
    const { a, d } = await twoPlayers();
    await fixtureBuilding(h, d.worldId, d.villageId, 4, 'hospital', 5);
    const send = await h.commands.sendMovement({ accountId: a.accountId }, a.worldId, a.villageId, { targetVillageId: d.villageId, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 200 }] }, key());
    h.clock.set(new Date(send.arrivalAt).getTime());
    await h.worker().drain();
    const view = await h.queries.villageView(d.accountId, d.worldId, d.villageId);
    expect(view.wounded.find((w) => w.unitType === 'spearman')!.quantity).toBeGreaterThan(0);
  });
});

describe('aislamiento entre mundos (ADR-0002, NFR-007, caso §25.4)', () => {
  it('no se puede leer, mandar ni atacar a través de mundos', async () => {
    const a = await joinedPlayer(h, 'MundoA', 'test-a');
    const b = await joinedPlayer(h, 'MundoB', 'test-b');
    await fixtureTroops(h, a.worldId, a.villageId, 'militia', 10);
    // Aldea propia pedida bajo otro mundo ⇒ 404.
    await expectDomainError(h.queries.villageView(a.accountId, b.worldId, a.villageId), 'VILLAGE_NOT_FOUND');
    await expectDomainError(
      h.commands.startConstruction({ accountId: a.accountId }, b.worldId, a.villageId, { plot: 6, buildingType: 'sawmill' }, key()),
      'VILLAGE_NOT_FOUND',
    );
    // Aldea de otro jugador en otro mundo como objetivo ⇒ inválido.
    await expectDomainError(
      h.commands.sendMovement({ accountId: a.accountId }, a.worldId, a.villageId, { targetVillageId: b.villageId, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 5 }] }, key()),
      'TARGET_INVALID',
    );
    // Mapa e informes de un mundo ajeno ⇒ no miembro.
    await expectDomainError(h.queries.mapRegion(a.accountId, b.worldId, { x: 10, y: 10, radius: 5 }), 'NOT_A_MEMBER');
    await expectDomainError(h.queries.listReports(a.accountId, b.worldId), 'NOT_A_MEMBER');
    // Aldea ajena del mismo mundo tampoco es visible como propia.
    const a2 = await joinedPlayer(h, 'Vecino', 'test-a');
    await expectDomainError(h.queries.villageView(a.accountId, a.worldId, a2.villageId), 'VILLAGE_NOT_FOUND');
    expect(await troopsOf(h, a.villageId)).toEqual({ militia: 10 });
  });

  it('la BD rechaza referencias cruzadas aunque el código fallara (FK compuesta)', async () => {
    const a = await joinedPlayer(h, 'MundoA', 'test-a');
    const b = await joinedPlayer(h, 'MundoB', 'test-b');
    await expect(
      h.database.db.insert(troopStacks).values({ worldId: b.worldId, villageId: a.villageId, unitType: 'militia', quantity: 1 }),
    ).rejects.toThrow();
    await expect(
      h.database.db.execute(sql`insert into army_movements (id, world_id, owner_account_id, origin_village_id, target_village_id, mission, status, units, departed_at, arrives_at)
        values (gen_random_uuid(), ${a.worldId}, ${a.accountId}, ${a.villageId}, ${b.villageId}, 'ATTACK', 'IN_TRANSIT', '{}'::jsonb, now(), now() + interval '1 hour')`),
    ).rejects.toThrow();
  });

  it('protección de principiante bloquea ataques (FR-BAT-10)', async () => {
    const a = await joinedPlayer(h, 'Novato1', 'test-protected');
    const d = await joinedPlayer(h, 'Novato2', 'test-protected');
    await fixtureTroops(h, a.worldId, a.villageId, 'militia', 10);
    await expectDomainError(
      h.commands.sendMovement({ accountId: a.accountId }, a.worldId, a.villageId, { targetVillageId: d.villageId, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 5 }] }, key()),
      'TARGET_PROTECTED',
    );
  });
});
