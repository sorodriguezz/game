import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, and } from 'drizzle-orm';
import {
  seedWorlds,
  villages,
  villageBuildings,
  worlds,
  scheduledEvents,
  battles,
  armyMovements,
} from '@reinos/db';
import { terrainAt } from '@reinos/game-rules';
import { createHarness, fixtureResources, fixtureTroops, type Harness } from './helpers.js';
import { TerritoryService } from '../src/territory.js';
import { randomUUID } from 'node:crypto';
let h: Harness,
  svc: TerritoryService,
  w: string,
  a: string,
  b: string,
  c: string,
  av: string,
  bv: string,
  cv: string;
const idem = () => randomUUID();
beforeEach(async () => {
  h = await createHarness();
  svc = new TerritoryService(h.ctx);
  await seedWorlds(
    h.database.db,
    [
      {
        slug: 'land-test',
        name: 'Tierra',
        profile: 'test',
        speedMultiplier: 50,
        mapSeed: 777,
        mapSize: 32,
        protectionHours: 0,
        rulesetVersion: 'frontier-alpha.1',
      },
    ],
    h.clock.now(),
  );
  const [world] = await h.database.db.select().from(worlds).where(eq(worlds.slug, 'land-test'));
  w = world!.id;
  const player = async (name: string) => {
    const s = await h.auth.register({
      email: `${name}@test.invalid`,
      displayName: name,
      password: 'contraseña-segura-123',
    });
    const joined = await h.commands.joinWorld(
      { accountId: s.account.id },
      w,
      { civilization: 'stone_wardens', villageName: `Aldea ${name}` },
      idem(),
    );
    return [s.account.id, joined.villageId] as const;
  };
  [a, av] = await player('TerraA');
  [b, bv] = await player('TerraB');
  [c, cv] = await player('TerraC');
});
afterEach(async () => {
  await h?.close();
});
const grant = async (villageId: string) => {
  await fixtureResources(
    h,
    villageId,
    { wood: 100000, stone: 100000, iron: 100000, food: 100000 },
    100000,
  );
};
async function complete(at: string) {
  h.clock.set(new Date(at).getTime() + 1);
  const stats = await h.worker().drain();
  expect(stats.failed).toBe(0);
}
async function freeSpot() {
  const occupied = await h.database.db.select().from(villages).where(eq(villages.worldId, w));
  for (let y = 1; y < 31; y++)
    for (let x = 1; x < 31; x++)
      if (
        terrainAt(777, 32, x, y, 'LAND') === 'PLAIN' &&
        !occupied.some((v) => v.x === x && v.y === y)
      )
        return { x, y };
  throw Error('sin casilla');
}
async function founding() {
  await grant(av);
  await h.database.db
    .update(villageBuildings)
    .set({ level: 5 })
    .where(and(eq(villageBuildings.villageId, av), eq(villageBuildings.type, 'city_hall')));
  await fixtureTroops(h, w, av, 'settler', 3);
  const spot = await freeSpot();
  const req = { ...spot, name: 'Nueva frontera' };
  const key = idem();
  const o = await svc.found({ accountId: a }, w, av, req, key);
  expect(await svc.found({ accountId: a }, w, av, req, key)).toEqual(o);
  await complete(o.arrivesAt);
  return (await svc.view(a, w)).villages.find((v) => v.id !== av)!.id;
}

describe('territorio persistente', () => {
  it('funda al llegar, consume colonos una vez y permite redistribuir desde la aldea receptora', async () => {
    const next = await founding();
    expect((await svc.view(a, w)).villages).toHaveLength(2);
    await fixtureTroops(h, w, av, 'militia', 20);
    const order = await h.commands.sendMovement(
      { accountId: a },
      w,
      av,
      {
        targetVillageId: next,
        mission: 'TRANSFER',
        units: [{ unitType: 'militia', quantity: 12 }],
      },
      idem(),
    );
    await complete(order.arrivalAt);
    expect(
      (await h.queries.villageView(a, w, next)).troops.find((t) => t.unitType === 'militia')
        ?.quantity,
    ).toBe(12);
    const back = await h.commands.sendMovement(
      { accountId: a },
      w,
      next,
      { targetVillageId: av, mission: 'TRANSFER', units: [{ unitType: 'militia', quantity: 5 }] },
      idem(),
    );
    await complete(back.arrivalAt);
    expect(
      (await h.queries.villageView(a, w, av)).troops.find((t) => t.unitType === 'militia')
        ?.quantity,
    ).toBe(13);
  });
  it('una casilla no acepta dos fundaciones concurrentes y nunca gasta dos veces las tropas', async () => {
    await grant(av);
    await h.database.db
      .update(villageBuildings)
      .set({ level: 5 })
      .where(and(eq(villageBuildings.villageId, av), eq(villageBuildings.type, 'city_hall')));
    await fixtureTroops(h, w, av, 'settler', 6);
    const spot = await freeSpot();
    const results = await Promise.allSettled([
      svc.found({ accountId: a }, w, av, { ...spot, name: 'Colonia uno' }, idem()),
      svc.found({ accountId: a }, w, av, { ...spot, name: 'Colonia dos' }, idem()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await h.queries.villageView(a, w, av)).troops.find((t) => t.unitType === 'settler')
        ?.quantity,
    ).toBe(3);
  });
  it('refuerza solo a aliados, conserva dueño y no deja al receptor usar tropas prestadas', async () => {
    await fixtureTroops(h, w, av, 'militia', 20);
    await expect(
      h.commands.sendMovement(
        { accountId: a },
        w,
        av,
        {
          targetVillageId: bv,
          mission: 'REINFORCE',
          units: [{ unitType: 'militia', quantity: 10 }],
        },
        idem(),
      ),
    ).rejects.toMatchObject({ code: 'TARGET_INVALID' });
    await svc.alliance({ accountId: a }, w, { name: 'Liga del Roble' }, idem());
    const alliance = (await svc.view(a, w)).alliance!;
    await svc.alliance({ accountId: b }, w, { inviteCode: alliance.inviteCode! }, idem());
    const march = await h.commands.sendMovement(
      { accountId: a },
      w,
      av,
      { targetVillageId: bv, mission: 'REINFORCE', units: [{ unitType: 'militia', quantity: 10 }] },
      idem(),
    );
    await complete(march.arrivalAt);
    expect((await svc.view(a, w)).reinforcements[0]?.quantity).toBe(10);
    expect((await h.queries.villageView(b, w, bv)).troops).toHaveLength(0);
    await expect(
      h.commands.sendMovement(
        { accountId: b },
        w,
        bv,
        { targetVillageId: cv, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 10 }] },
        idem(),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_TROOPS' });
    const recall = await svc.recall({ accountId: a }, w, bv, av, idem());
    expect((await h.queries.villageView(a, w, av)).resources.ratesMilliPerHour.food).toBe(
      7450000 - 20000,
    );
    await complete(recall.arrivesAt);
    expect((await h.queries.villageView(a, w, av)).resources.ratesMilliPerHour.food).toBe(
      7450000 - 20000,
    );
    expect(
      (await h.queries.villageView(a, w, av)).troops.find((t) => t.unitType === 'militia')
        ?.quantity,
    ).toBe(20);
  });
  it('el mapa no expone marchas de terceros ni composición de un ataque entrante', async () => {
    await fixtureTroops(h, w, av, 'militia', 30);
    await fixtureTroops(h, w, bv, 'militia', 30);
    const toB = await h.commands.sendMovement(
      { accountId: a },
      w,
      av,
      { targetVillageId: bv, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 10 }] },
      idem(),
    );
    const toC = await h.commands.sendMovement(
      { accountId: b },
      w,
      bv,
      { targetVillageId: cv, mission: 'RAID', units: [{ unitType: 'militia', quantity: 10 }] },
      idem(),
    );
    const mapA = await h.queries.mapRegion(a, w, { x: 16, y: 16, radius: 16 });
    expect(mapA.tiles).not.toContain('S');
    expect(mapA.movements?.map((m) => m.id)).toEqual([toB.movementId]);
    const mapC = await h.queries.mapRegion(c, w, { x: 16, y: 16, radius: 16 });
    expect(mapC.movements?.map((m) => m.id)).toEqual([toC.movementId]);
    expect(mapC.movements?.[0]?.units).toBeNull();
    const old = await h.worldId('test-a');
    await expect(svc.view(a, old)).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });
  it('conquista NPC con emisarios supervivientes y bloquea capitales', async () => {
    const [npc] = await h.database.db
      .select()
      .from(villages)
      .where(and(eq(villages.worldId, w), eq(villages.kind, 'NPC')))
      .limit(1);
    await fixtureTroops(h, w, av, 'militia', 5000);
    await fixtureTroops(h, w, av, 'chieftain', 3);
    const march = await h.commands.sendMovement(
      { accountId: a },
      w,
      av,
      {
        targetVillageId: npc!.id,
        mission: 'CONQUER',
        units: [
          { unitType: 'militia', quantity: 5000 },
          { unitType: 'chieftain', quantity: 3 },
        ],
      },
      idem(),
    );
    await complete(march.arrivalAt);
    const [captured] = await h.database.db.select().from(villages).where(eq(villages.id, npc!.id));
    expect(captured!.ownerAccountId).toBe(a);
    await expect(
      h.commands.sendMovement(
        { accountId: a },
        w,
        av,
        {
          targetVillageId: bv,
          mission: 'CONQUER',
          units: [
            { unitType: 'militia', quantity: 1 },
            { unitType: 'chieftain', quantity: 1 },
          ],
        },
        idem(),
      ),
    ).rejects.toMatchObject({ code: 'TARGET_PROTECTED' });
  });
  it('el guardián de oasis se conserva en BD y la captura vincula el oasis sin crear ciudad', async () => {
    const [oasis] = await h.database.db
      .select()
      .from(villages)
      .where(and(eq(villages.worldId, w), eq(villages.kind, 'OASIS')))
      .limit(1);
    await fixtureTroops(h, w, av, 'militia', 5000);
    const march = await h.commands.sendMovement(
      { accountId: a },
      w,
      av,
      {
        targetVillageId: oasis!.id,
        mission: 'CONQUER',
        units: [{ unitType: 'militia', quantity: 5000 }],
      },
      idem(),
    );
    await complete(march.arrivalAt);
    const [claimed] = await h.database.db.select().from(villages).where(eq(villages.id, oasis!.id));
    expect(claimed!.ownerAccountId).toBe(a);
    expect(claimed!.parentVillageId).toBe(av);
    expect((await svc.view(a, w)).villages).toHaveLength(1);
    await expect(
      h.commands.startConstruction(
        { accountId: a },
        w,
        oasis!.id,
        { plot: 0, buildingType: 'city_hall' },
        idem(),
      ),
    ).rejects.toMatchObject({ code: 'VILLAGE_NOT_FOUND' });
  });
  it('resuelve un choque en campo una sola vez y devuelve supervivientes sin combatir de nuevo en destino', async () => {
    await h.database.db.update(villages).set({ x: 2, y: 2 }).where(eq(villages.id, av));
    await h.database.db.update(villages).set({ x: 12, y: 2 }).where(eq(villages.id, bv));
    await fixtureTroops(h, w, av, 'militia', 100);
    await fixtureTroops(h, w, bv, 'militia', 30);
    const first = await h.commands.sendMovement(
      { accountId: a },
      w,
      av,
      { targetVillageId: bv, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 100 }] },
      idem(),
    );
    await h.commands.sendMovement(
      { accountId: b },
      w,
      bv,
      { targetVillageId: av, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 30 }] },
      idem(),
    );
    const [event] = await h.database.db
      .select()
      .from(scheduledEvents)
      .where(and(eq(scheduledEvents.worldId, w), eq(scheduledEvents.type, 'FIELD_ENCOUNTER')));
    expect(event).toBeDefined();
    await complete(event!.dueAt.toISOString());
    let reports = await h.database.db.select().from(battles).where(eq(battles.worldId, w));
    expect(reports).toHaveLength(1);
    expect(reports[0]!.location).toBe('FIELD');
    expect((await h.queries.listReports(a, w))[0]?.location).toBe('FIELD');
    await complete(new Date(new Date(first.arrivalAt).getTime() + 10000).toISOString());
    reports = await h.database.db.select().from(battles).where(eq(battles.worldId, w));
    expect(reports).toHaveLength(1);
    const marches = await h.database.db
      .select()
      .from(armyMovements)
      .where(eq(armyMovements.worldId, w));
    expect(marches.every((m) => m.status === 'COMPLETED')).toBe(true);
  });
  it('al perder un oasis el antiguo padre pierde su bonificación en el instante de captura', async () => {
    const [oasis] = await h.database.db
      .select()
      .from(villages)
      .where(and(eq(villages.worldId, w), eq(villages.kind, 'OASIS')))
      .limit(1);
    await fixtureTroops(h, w, av, 'militia', 20000);
    let march = await h.commands.sendMovement(
      { accountId: a },
      w,
      av,
      {
        targetVillageId: oasis!.id,
        mission: 'CONQUER',
        units: [{ unitType: 'militia', quantity: 10000 }],
      },
      idem(),
    );
    await complete(march.arrivalAt);
    const boosted = (await h.queries.villageView(a, w, av)).resources.ratesMilliPerHour.wood;
    await fixtureTroops(h, w, bv, 'militia', 10000);
    march = await h.commands.sendMovement(
      { accountId: b },
      w,
      bv,
      {
        targetVillageId: oasis!.id,
        mission: 'CONQUER',
        units: [{ unitType: 'militia', quantity: 10000 }],
      },
      idem(),
    );
    await complete(march.arrivalAt);
    expect((await h.queries.villageView(a, w, av)).resources.ratesMilliPerHour.wood).toBeLessThan(
      boosted,
    );
    const [captured] = await h.database.db
      .select()
      .from(villages)
      .where(eq(villages.id, oasis!.id));
    expect(captured!.parentVillageId).toBe(bv);
  });
  it('también intercepta ejércitos enemigos durante el regreso', async () => {
    await h.database.db.update(villages).set({ x: 2, y: 2 }).where(eq(villages.id, av));
    await h.database.db.update(villages).set({ x: 12, y: 2 }).where(eq(villages.id, bv));
    const id = idem(),
      now = h.clock.now();
    await h.database.db.insert(armyMovements).values({
      id,
      worldId: w,
      ownerAccountId: a,
      originVillageId: av,
      targetVillageId: bv,
      mission: 'RAID',
      status: 'RETURNING',
      units: { militia: 100 },
      departedAt: new Date(now.getTime() - 180000),
      arrivesAt: now,
      returnsAt: new Date(now.getTime() + 180000),
    });
    await fixtureTroops(h, w, bv, 'militia', 60);
    await h.commands.sendMovement(
      { accountId: b },
      w,
      bv,
      { targetVillageId: av, mission: 'ATTACK', units: [{ unitType: 'militia', quantity: 60 }] },
      idem(),
    );
    const [event] = await h.database.db
      .select()
      .from(scheduledEvents)
      .where(and(eq(scheduledEvents.worldId, w), eq(scheduledEvents.type, 'FIELD_ENCOUNTER')));
    expect(event).toBeDefined();
    await complete(event!.dueAt.toISOString());
    const reports = await h.database.db.select().from(battles).where(eq(battles.worldId, w));
    expect(reports).toHaveLength(1);
    expect(reports[0]!.location).toBe('FIELD');
  });
});
