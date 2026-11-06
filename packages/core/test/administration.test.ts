import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { accounts, worldModerators, adminAudit } from '@reinos/db';
import { AdministrationService } from '../src/administration.js';
import { createHarness, newPlayer, key, expectDomainError, type Harness } from './helpers.js';
describe('tres perfiles y gestión de mundos', () => {
  let h: Harness, svc: AdministrationService, admin: string, mod: string, player: string;
  beforeAll(async () => {
    h = await createHarness();
    svc = new AdministrationService(h.ctx);
    admin = await newPlayer(h, 'AdminPrueba');
    mod = await newPlayer(h, 'ModPrueba');
    player = await newPlayer(h, 'PlayerPrueba');
    await h.database.db.update(accounts).set({ role: 'ADMIN' }).where(eq(accounts.id, admin));
    await h.database.db.update(accounts).set({ role: 'MODERATOR' }).where(eq(accounts.id, mod));
  });
  afterAll(async () => h?.close());
  it('rol real en sesión y registro público sin escalada', async () => {
    const s = await h.auth.register({
      email: 'no-escalada@test.invalid',
      displayName: 'SinEscalada',
      password: 'una-contraseña-segura',
      role: 'ADMIN',
    } as never);
    expect(s.account.role).toBe('PLAYER');
    const logged = await h.auth.login({ email: 'AdminPrueba', password: 'contraseña-segura-123' });
    expect(logged.account.role).toBe('ADMIN');
    expect(
      (
        await h.auth.login({
          email: 'playerprueba@example.test',
          password: 'contraseña-segura-123',
          portal: 'ADMIN',
        } as never)
      ).account.role,
    ).toBe('PLAYER');
  });
  it('solo admin crea usuarios/moderadores y cada operación se audita una vez', async () => {
    await expectDomainError(
      svc.createUser(
        player,
        {
          email: 'denegada@test.invalid',
          displayName: 'Denegada',
          password: 'contraseña-segura-123',
          role: 'MODERATOR',
        },
        key(),
      ),
      'FORBIDDEN',
    );
    const k = key(),
      body = {
        email: 'nueva-mod@test.invalid',
        displayName: 'NuevaModeradora',
        password: 'contraseña-segura-123',
        role: 'MODERATOR' as const,
      };
    const rows = await Promise.all([1, 2].map(() => svc.createUser(admin, body, k)));
    expect(rows[0]!.id).toBe(rows[1]!.id);
    expect(
      await h.database.db.select().from(adminAudit).where(eq(adminAudit.requestKey, k)),
    ).toHaveLength(1);
  });
  it('borrador oculto, próximo visible sin registro y apertura automática', async () => {
    const w = await svc.createWorld(
      admin,
      {
        name: 'Mundo programado',
        mapSize: 1000,
        speedMultiplier: 2,
        mapSeed: 123,
        protectionHours: 24,
        opensAt: new Date(h.clock.now().getTime() + 60000).toISOString(),
        endsAt: null,
      },
      key(),
    );
    expect((await h.queries.listWorlds(player)).some((x) => x.id === w.id)).toBe(false);
    await svc.worldAction(admin, w.id, 'PUBLISH', key());
    expect((await h.queries.listWorlds(player)).find((x) => x.id === w.id)?.status).toBe('PLANNED');
    await expectDomainError(
      h.commands.joinWorld(
        { accountId: player },
        w.id,
        { civilization: 'stone_wardens', villageName: 'Futuro' },
        key(),
      ),
      'WORLD_NOT_OPEN',
    );
    h.clock.advance(60001);
    await svc.advanceWorlds();
    expect((await h.queries.listWorlds(player)).find((x) => x.id === w.id)?.status).toBe('OPEN');
  });
  it('moderador solo asignado y sin mutaciones competitivas', async () => {
    const w = await h.worldId('test-a');
    await svc.assignModerator(admin, w, mod, true, key());
    const home = await svc.overview(mod);
    expect(home.worlds.map((x) => x.id)).toEqual([w]);
    await expectDomainError(svc.worldDetails(mod, await h.worldId('test-b')), 'FORBIDDEN');
    await expectDomainError(svc.worldAction(mod, w, 'PAUSE', key()), 'FORBIDDEN');
    await expectDomainError(
      h.commands.joinWorld(
        { accountId: mod },
        w,
        { civilization: 'imperial_crown', villageName: 'NoCompite' },
        key(),
      ),
      'FORBIDDEN',
    );
    expect(
      await h.database.db.select().from(worldModerators).where(eq(worldModerators.accountId, mod)),
    ).toHaveLength(1);
  });
  it('desactivar una cuenta invalida las sesiones y no puede desactivar último admin', async () => {
    const s = await h.auth.login({
      email: 'playerprueba@example.test',
      password: 'contraseña-segura-123',
    });
    await svc.updateUser(admin, player, { status: 'DISABLED' }, key());
    expect(await h.auth.resolve(s.token)).toBeNull();
    await expectDomainError(
      svc.updateUser(admin, admin, { status: 'DISABLED' }, key()),
      'FORBIDDEN',
    );
  });
  it('pausa congela producción y eventos; reanudar conserva el tiempo pendiente', async () => {
    const p = await newPlayer(h, 'PausaJugador'),
      w = await h.worldId('test-a');
    const joined = await h.commands.joinWorld(
      { accountId: p },
      w,
      { civilization: 'imperial_crown', villageName: 'Aldea Pausada' },
      key(),
    );
    const order = await h.commands.startConstruction(
      { accountId: p },
      w,
      joined.villageId,
      { plot: 11, buildingType: 'farm' },
      key(),
    );
    h.clock.advance(500);
    await svc.worldAction(admin, w, 'PAUSE', key());
    const a = await h.queries.villageView(p, w, joined.villageId);
    h.clock.advance(3600000);
    expect((await h.worker().tick()).claimed).toBe(0);
    const b = await h.queries.villageView(p, w, joined.villageId);
    expect(b.resources.amountsMilli).toEqual(a.resources.amountsMilli);
    expect(b.serverTime).toBe(a.serverTime);
    await expectDomainError(
      h.commands.startConstruction(
        { accountId: p },
        w,
        joined.villageId,
        { plot: 5, buildingType: 'farm' },
        key(),
      ),
      'WORLD_NOT_OPEN',
    );
    await svc.worldAction(admin, w, 'RESUME', key());
    const c = await h.queries.villageView(p, w, joined.villageId);
    expect(c.resources.amountsMilli).toEqual(a.resources.amountsMilli);
    expect(new Date(c.construction!.completesAt).getTime()).toBe(
      new Date(order.completesAt).getTime() + 3600000,
    );
    h.clock.advance(new Date(c.construction!.completesAt).getTime() - h.clock.now().getTime() + 1);
    expect((await h.worker().drain()).applied).toBeGreaterThan(0);
  });
});
