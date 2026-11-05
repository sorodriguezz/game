import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app.js';
import {
  createHarness,
  fixtureTroops,
  fixtureZeroRates,
  type Harness,
} from '../../../packages/core/test/helpers.js';

const ORIGIN = 'http://localhost:5173';
let h: Harness;
let app: INestApplication;

beforeAll(async () => {
  h = await createHarness();
  app = await createApp(h.ctx, {
    production: false,
    allowedOrigins: [ORIGIN],
    rateLimitPerMinute: 10_000,
    authRateLimitPerMinute: 10,
    tactical: {
      trainingEnabled: false,
      worldPvpEnabled: false,
      serviceToken: '',
      health: async () => ({ ok: false, capacityAvailable: false }),
    },
  });
});
afterAll(async () => {
  await app?.close();
  await h?.close();
});

const idem = () => `k-${randomUUID()}`;

async function player(name: string) {
  const agent = request.agent(app.getHttpServer());
  const reg = await agent
    .post('/api/v1/auth/register')
    .set('origin', ORIGIN)
    .send({ email: `${name}@example.test`, displayName: name, password: 'una-contraseña-larga' })
    .expect(201);
  expect(reg.headers['set-cookie']?.[0]).toMatch(/reinos_session=.*HttpOnly.*SameSite=Lax/i);
  return { agent, csrf: reg.body.csrfToken as string, accountId: reg.body.account.id as string };
}

describe('API HTTP /api/v1', () => {
  it('health sin sesión y cabeceras de seguridad/correlación', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('errores con código estable, mensaje y correlationId', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/worlds').expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(res.body.correlationId).toBe(res.headers['x-request-id']);
    const v = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'no-es-correo', displayName: 'x', password: 'corta' })
      .expect(422);
    expect(v.body.code).toBe('VALIDATION_FAILED');
    expect(v.body.details.issues.length).toBeGreaterThan(0);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nadie@example.test', password: 'x' })
      .expect(401);
  });

  it('flujo completo: alta, unión, construcción con CSRF+idempotencia y ataque offline con informe', async () => {
    const a = await player('Alfa');
    const d = await player('Delta');
    await a.agent.get('/api/v1/auth/me').expect(200);

    const worlds = (await a.agent.get('/api/v1/worlds').expect(200)).body as Array<{
      id: string;
      slug: string;
    }>;
    const worldId = worlds.find((w) => w.slug === 'test-a')!.id;
    const otherWorld = worlds.find((w) => w.slug === 'test-b')!.id;

    // Sin CSRF ⇒ 403; origen ajeno ⇒ 403; sin Idempotency-Key ⇒ 422.
    const body = { civilization: 'imperial_crown', villageName: 'Fortaleza' };
    expect(
      (await a.agent.post(`/api/v1/worlds/${worldId}/join`).send(body).expect(403)).body.code,
    ).toBe('CSRF_MISMATCH');
    expect(
      (
        await a.agent
          .post(`/api/v1/worlds/${worldId}/join`)
          .set('origin', 'https://evil.example')
          .set('x-csrf-token', a.csrf)
          .send(body)
          .expect(403)
      ).body.code,
    ).toBe('ORIGIN_NOT_ALLOWED');
    expect(
      (
        await a.agent
          .post(`/api/v1/worlds/${worldId}/join`)
          .set('x-csrf-token', a.csrf)
          .send(body)
          .expect(422)
      ).body.code,
    ).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const k = idem();
    const j1 = await a.agent
      .post(`/api/v1/worlds/${worldId}/join`)
      .set('x-csrf-token', a.csrf)
      .set('idempotency-key', k)
      .send(body)
      .expect(201);
    const j2 = await a.agent
      .post(`/api/v1/worlds/${worldId}/join`)
      .set('x-csrf-token', a.csrf)
      .set('idempotency-key', k)
      .send(body)
      .expect(201);
    expect(j2.body).toEqual(j1.body);
    const aVillage = j1.body.villageId as string;

    const jd = await d.agent
      .post(`/api/v1/worlds/${worldId}/join`)
      .set('x-csrf-token', d.csrf)
      .set('idempotency-key', idem())
      .send({ civilization: 'sea_league', villageName: 'Bahía' })
      .expect(201);
    const dVillage = jd.body.villageId as string;

    // Vista de aldea propia; la ajena o a través de otro mundo ⇒ 404.
    const view = (await a.agent.get(`/api/v1/worlds/${worldId}/villages/${aVillage}`).expect(200))
      .body;
    expect(view.buildings.length).toBe(6);
    await a.agent.get(`/api/v1/worlds/${worldId}/villages/${dVillage}`).expect(404);
    await a.agent.get(`/api/v1/worlds/${otherWorld}/villages/${aVillage}`).expect(404);
    await a.agent.get(`/api/v1/worlds/${worldId}/villages/no-es-uuid`).expect(404);
    expect((await a.agent.get(`/api/v1/worlds/${otherWorld}/reports`).expect(403)).body.code).toBe(
      'NOT_A_MEMBER',
    );

    // Construcción.
    const build = await a.agent
      .post(`/api/v1/worlds/${worldId}/villages/${aVillage}/buildings`)
      .set('x-csrf-token', a.csrf)
      .set('idempotency-key', idem())
      .send({ plot: 3, buildingType: 'barracks' })
      .expect(201);
    expect(build.body.targetLevel).toBe(1);
    const invalid = await a.agent
      .post(`/api/v1/worlds/${worldId}/villages/${aVillage}/buildings`)
      .set('x-csrf-token', a.csrf)
      .set('idempotency-key', idem())
      .send({ plot: 3, buildingType: 'castillo-inexistente' })
      .expect(422);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');

    // Mapa de la región con ambas aldeas.
    const map = (
      await a.agent
        .get(`/api/v1/worlds/${worldId}/map?x=${view.x}&y=${view.y}&radius=20`)
        .expect(200)
    ).body;
    expect(map.tiles.length).toBe(map.width * map.height);
    expect(map.villages.some((v: { isMine: boolean }) => v.isMine)).toBe(true);

    // Ataque con el defensor desconectado.
    await fixtureTroops(h, worldId, aVillage, 'militia', 120);
    await fixtureZeroRates(h, dVillage);
    const march = await a.agent
      .post(`/api/v1/worlds/${worldId}/villages/${aVillage}/movements`)
      .set('x-csrf-token', a.csrf)
      .set('idempotency-key', idem())
      .send({
        targetVillageId: dVillage,
        mission: 'RAID',
        units: [{ unitType: 'militia', quantity: 100 }],
      })
      .expect(201);
    h.clock.set(new Date(march.body.arrivalAt).getTime() + 1);
    expect((await h.worker().drain()).applied).toBeGreaterThanOrEqual(1);

    const reports = (await d.agent.get(`/api/v1/worlds/${worldId}/reports`).expect(200)).body;
    expect(reports).toHaveLength(1);
    expect(reports[0].role).toBe('DEFENDER');
    const detail = (
      await a.agent.get(`/api/v1/worlds/${worldId}/reports/${reports[0].id}`).expect(200)
    ).body;
    expect(detail.role).toBe('ATTACKER');
    expect(detail.result.milestones.length).toBeGreaterThan(2);

    // Logout revoca la sesión.
    await a.agent.post('/api/v1/auth/logout').set('x-csrf-token', a.csrf).expect(204);
    await a.agent.get('/api/v1/auth/me').expect(401);
  });
});
