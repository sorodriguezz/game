import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { constructionOrders, resourceLedger, scheduledEvents, villageBuildings } from '@reinos/db';
import { buildingCost, buildingSeconds, productionMilliPerHour } from '@reinos/game-rules';
import {
  createHarness,
  expectDomainError,
  fixtureBuilding,
  fixtureResources,
  fixtureZeroRates,
  joinedPlayer,
  key,
  ruleset,
  wholeResources,
  type Harness,
} from './helpers.js';

let h: Harness;
beforeEach(async () => {
  await h?.close();
  h = await createHarness();
});
afterAll(async () => h?.close());

describe('alta en mundo (FR-001/002)', () => {
  it('crea aldea con edificios iniciales, recursos y es idempotente', async () => {
    const p = await joinedPlayer(h, 'Ana', 'test-a');
    const view = await h.queries.villageView(p.accountId, p.worldId, p.villageId);
    expect(view.buildings.map((b) => b.type).sort()).toEqual(['city_hall', 'farm', 'mine', 'quarry', 'sawmill', 'warehouse']);
    expect(view.resources.amountsMilli.wood).toBe(750_000);
    expect(view.civilization).toBe('imperial_crown');

    const k = key();
    const worldB = await h.worldId('test-b');
    const r1 = await h.commands.joinWorld({ accountId: p.accountId }, worldB, { civilization: 'sea_league', villageName: 'Puerto' }, k);
    const r2 = await h.commands.joinWorld({ accountId: p.accountId }, worldB, { civilization: 'sea_league', villageName: 'Puerto' }, k);
    expect(r2).toEqual(r1);
    await expectDomainError(
      h.commands.joinWorld({ accountId: p.accountId }, worldB, { civilization: 'sea_league', villageName: 'Otra' }, key()),
      'ALREADY_JOINED',
    );
  });

  it('los jugadores no comparten casilla y respetan distancia mínima', async () => {
    const ps = [];
    for (const n of ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco']) ps.push(await joinedPlayer(h, n, 'test-a'));
    const coords = await Promise.all(ps.map((p) => h.queries.villageView(p.accountId, p.worldId, p.villageId)));
    for (let i = 0; i < coords.length; i++)
      for (let j = i + 1; j < coords.length; j++) {
        const d = Math.max(Math.abs(coords[i]!.x - coords[j]!.x), Math.abs(coords[i]!.y - coords[j]!.y));
        expect(d).toBeGreaterThanOrEqual(ruleset.world.spawnMinDistance);
      }
  });
});

describe('economía offline (FR-004, CA-ECO)', () => {
  it('produce exactamente durante la desconexión', async () => {
    const p = await joinedPlayer(h, 'Ana', 'test-a');
    const before = await h.queries.villageView(p.accountId, p.worldId, p.villageId);
    h.clock.advance(3 * 3600_000); // 3 h sin conexión
    const after = await h.queries.villageView(p.accountId, p.worldId, p.villageId);
    const rate = before.resources.ratesMilliPerHour.wood;
    expect(after.resources.amountsMilli.wood - before.resources.amountsMilli.wood).toBe(rate * 3);
  });

  it('construcción: débito + ledger, finaliza offline vía worker, una sola vez, y cambia la tasa en el instante exacto', async () => {
    const p = await joinedPlayer(h, 'Ana', 'test-a');
    const t0 = h.clock.now().getTime();
    const res = await h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, { plot: 6, buildingType: 'sawmill' }, key());
    expect(res.targetLevel).toBe(2);
    const cost = buildingCost(ruleset, 'sawmill', 2, 'imperial_crown');
    const secs = buildingSeconds(ruleset, 'sawmill', 2, 10);
    expect(new Date(res.completesAt).getTime() - t0).toBe(secs * 1000);

    const ledger = await h.database.db.select().from(resourceLedger).where(eq(resourceLedger.villageId, p.villageId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.wood).toBe(BigInt(-cost.wood) * 1000n);

    // El dueño se desconecta; el worker procesa al vencer, aunque llegue tarde.
    h.clock.advance(secs * 1000 + 3600_000);
    const w = h.worker();
    const t = await w.drain();
    expect(t.applied).toBe(1);
    expect((await w.drain()).claimed).toBe(0); // no termina dos veces

    const [b] = await h.database.db.select().from(villageBuildings).where(sql`${villageBuildings.villageId} = ${p.villageId} and ${villageBuildings.plot} = 6`);
    expect(b!.level).toBe(2);

    // Madera exacta: tramo 1 a tasa nivel 1 hasta la finalización, tramo 2 a tasa nivel 2.
    const base = 5n * 1000n;
    const r1 = base + productionMilliPerHour(ruleset, 1);
    const r2 = base + productionMilliPerHour(ruleset, 2);
    const ms1 = BigInt(secs * 1000);
    const ms2 = 3600_000n;
    const expectedMilli = 750_000n - BigInt(cost.wood) * 1000n + (r1 * ms1) / 3600_000n + (r2 * ms2 + ((r1 * ms1) % 3600_000n)) / 3600_000n;
    const view = await h.queries.villageView(p.accountId, p.worldId, p.villageId);
    expect(BigInt(view.resources.amountsMilli.wood)).toBe(expectedMilli);
  });

  it('una sola construcción activa por aldea (FR-CITY-04)', async () => {
    const p = await joinedPlayer(h, 'Ana', 'test-a');
    await h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, { plot: 6, buildingType: 'sawmill' }, key());
    await expectDomainError(
      h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, { plot: 7, buildingType: 'quarry' }, key()),
      'CONSTRUCTION_QUEUE_BUSY',
    );
  });

  it('caso §25.1: dos peticiones simultáneas por el último recurso ⇒ exactamente una prospera', async () => {
    const p = await joinedPlayer(h, 'Ana', 'test-a');
    await fixtureBuilding(h, p.worldId, p.villageId, 3, 'barracks', 1);
    await fixtureZeroRates(h, p.villageId);
    // Exactamente para 10 milicias (30/0/20/25 cada una).
    await fixtureResources(h, p.villageId, { wood: 300, stone: 0, iron: 200, food: 250 });
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        h.commands.recruit({ accountId: p.accountId }, p.worldId, p.villageId, { unitType: 'militia', quantity: 10 }, key()),
      ),
    );
    const ok = attempts.filter((a) => a.status === 'fulfilled');
    const failed = attempts.filter((a) => a.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed.every((f) => (f.reason as { code: string }).code === 'INSUFFICIENT_RESOURCES')).toBe(true);
    expect(await wholeResources(h, p.villageId)).toEqual({ wood: 0, stone: 0, iron: 0, food: 0 });
  });

  it('CA-ECO-02: reintentar con la misma Idempotency-Key no duplica el gasto (también en paralelo)', async () => {
    const p = await joinedPlayer(h, 'Ana', 'test-a');
    await fixtureZeroRates(h, p.villageId);
    const k = key();
    const body = { plot: 6, buildingType: 'sawmill' as const };
    const [a, b, c] = await Promise.all([
      h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, body, k),
      h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, body, k),
      h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, body, k),
    ]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    const orders = await h.database.db.select().from(constructionOrders).where(eq(constructionOrders.villageId, p.villageId));
    expect(orders).toHaveLength(1);
    const cost = buildingCost(ruleset, 'sawmill', 2, 'imperial_crown');
    expect((await wholeResources(h, p.villageId)).wood).toBe(750 - cost.wood);
    await expectDomainError(
      h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, { plot: 7, buildingType: 'quarry' }, k),
      'IDEMPOTENCY_KEY_REUSED',
    );
    await expectDomainError(
      h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, body, undefined),
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  });

  it('el comando posterior aplica en línea eventos vencidos aunque el worker esté parado', async () => {
    const p = await joinedPlayer(h, 'Ana', 'test-a');
    const res = await h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, { plot: 6, buildingType: 'sawmill' }, key());
    h.clock.set(new Date(res.completesAt).getTime() + 1000);
    // Sin worker: la siguiente orden completa la anterior en orden y luego encola.
    const res2 = await h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, { plot: 6, buildingType: 'sawmill' }, key());
    expect(res2.targetLevel).toBe(3);
    const pending = await h.database.db.select().from(scheduledEvents).where(eq(scheduledEvents.status, 'DONE'));
    expect(pending).toHaveLength(1);
  });

  it('valida reglas de ciudad en servidor', async () => {
    const p = await joinedPlayer(h, 'Ana', 'test-a');
    await expectDomainError(
      h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, { plot: 4, buildingType: 'naval_arsenal' }, key()),
      'CIVILIZATION_RESTRICTED',
    );
    await expectDomainError(
      h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, { plot: 2, buildingType: 'farm' }, key()),
      'PLOT_OCCUPIED',
    );
    await fixtureResources(h, p.villageId, { wood: 1, stone: 1, iron: 1, food: 1 });
    await expectDomainError(
      h.commands.startConstruction({ accountId: p.accountId }, p.worldId, p.villageId, { plot: 3, buildingType: 'barracks' }, key()),
      'INSUFFICIENT_RESOURCES',
    );
  });
});
