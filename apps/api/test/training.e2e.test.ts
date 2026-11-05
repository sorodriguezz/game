import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { Client } from '@colyseus/sdk';
import { TrainingService, httpBattleServerGateway } from '@reinos/core';
import { createApp } from '../src/app.js';
import { createBattleServer, httpResultSink } from '../../battle-server/src/server.js';
import type { BattleServerConfig } from '../../battle-server/src/config.js';
import {
  createHarness,
  fixtureTroops,
  joinedPlayer,
  type Harness,
} from '../../../packages/core/test/helpers.js';

const ORIGIN = 'http://localhost:5173';
const KEY = 'k'.repeat(48);
const SERVICE = 's'.repeat(40);
const BATTLE_PORT = 27_000 + randomInt(2000);
const BATTLE_URL = `http://127.0.0.1:${BATTLE_PORT}`;

let h: Harness;
let app: INestApplication;
let apiUrl: string;
let battle: ReturnType<typeof createBattleServer>;

beforeAll(async () => {
  h = await createHarness();
  h.clock.set(Date.now()); // tickets: la API y el battle-server comparten reloj real en esta prueba
  const training = new TrainingService(h.ctx, {
    enabled: true,
    signingKey: KEY,
    publicBattleServerUrl: BATTLE_URL,
    gateway: httpBattleServerGateway(BATTLE_URL, SERVICE),
  });
  app = await createApp(
    h.ctx,
    {
      production: false,
      allowedOrigins: [ORIGIN],
      rateLimitPerMinute: 10_000,
      authRateLimitPerMinute: 10,
      tactical: {
        trainingEnabled: true,
        worldPvpEnabled: false,
        serviceToken: SERVICE,
        health: () => httpBattleServerGateway(BATTLE_URL, SERVICE).health(),
      },
    },
    training,
  );
  await app.listen(0, '127.0.0.1');
  apiUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  const config: BattleServerConfig = {
    port: BATTLE_PORT,
    host: '127.0.0.1',
    signingKey: KEY,
    serviceToken: SERVICE,
    internalApiUrl: apiUrl,
    maxRooms: 4,
    trainingEnabled: true,
    tacticalRulesetVersion: 'tactical-mvp2-alpha.0',
  };
  battle = createBattleServer(config, { deliverResult: httpResultSink(config), tickIntervalMs: 1 });
  await battle.server.listen(BATTLE_PORT, '127.0.0.1');
});

afterAll(async () => {
  await battle?.server.gracefullyShutdown(false);
  await app?.close();
  await h?.close();
});

async function player(name: string) {
  const agent = request.agent(app.getHttpServer());
  const reg = await agent
    .post('/api/v1/auth/register')
    .set('origin', ORIGIN)
    .send({ email: `${name}@example.test`, displayName: name, password: 'una-contraseña-larga' })
    .expect(201);
  return { agent, csrf: reg.body.csrfToken as string, accountId: reg.body.account.id as string };
}

/** Huella de TODAS las tablas del mundo: un entrenamiento no puede cambiarla (ADR-0037, G1-12). */
async function worldFingerprint(): Promise<string> {
  const tables = [
    'alliances',
    'alliance_members',
    'garrisons',
    'settlement_orders',
    'resource_accounts',
    'resource_ledger',
    'troop_stacks',
    'wounded_stacks',
    'village_buildings',
    'construction_orders',
    'recruitment_orders',
    'army_movements',
    'battles',
    'scheduled_events',
    'outbox',
    'world_players',
    'villages',
  ];
  const parts: string[] = [];
  for (const t of tables) {
    const r = await h.database.db.execute(
      sql.raw(
        `select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h, count(*) as n from ${t} x`,
      ),
    );
    parts.push(`${t}:${(r.rows[0] as { n: string }).n}:${(r.rows[0] as { h: string }).h}`);
  }
  return parts.join(';');
}

const until = async (cond: () => boolean | Promise<boolean>, ms = 30_000) => {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('entrenamiento táctico de punta a punta (Gate 1)', () => {
  it('rechaza razas de otro ruleset antes de crear un entrenamiento', async () => {
    const p = await player('TrainingRaceCheck');
    const res = await p.agent
      .post('/api/v1/training')
      .set('x-csrf-token', p.csrf)
      .send({
        opponent: 'DOCTRINE',
        civilization: 'stone_wardens',
        army: 'balanced',
        terrainId: 'plain',
      })
      .expect(422);
    expect(res.body.code).toBe('CIVILIZATION_INVALID');
  });

  it('battle-config publica flags y salud', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/battle-config').expect(200);
    expect(res.body).toMatchObject({
      trainingEnabled: true,
      worldPvpEnabled: false,
      battleServerHealthy: true,
      tickHz: 10,
    });
  });

  it('contra la doctrina: ticket de un uso, combate real por WebSocket, resultado verificado y CERO escrituras en el mundo', async () => {
    const p = await player('Estratega');
    // El jugador también tiene una aldea y tropas reales en un mundo.
    const w = await joinedPlayer(h, 'Mundano', 'test-a');
    await fixtureTroops(h, w.worldId, w.villageId, 'militia', 50);
    const before = await worldFingerprint();

    const created = await p.agent
      .post('/api/v1/training')
      .set('x-csrf-token', p.csrf)
      .send({ opponent: 'DOCTRINE', civilization: 'imperial_crown', army: 'cavalry_raid' })
      .expect(201);
    expect(created.body).toMatchObject({
      status: 'LIVE',
      mySide: 'ATTACKER',
      opponent: 'DOCTRINE',
    });
    const id = created.body.id as string;

    const t = (
      await p.agent
        .post(`/api/v1/training/${id}/join-ticket`)
        .set('x-csrf-token', p.csrf)
        .expect(200)
    ).body;
    expect(t.ticket).toMatch(/^[\w-]+\.[\w-]+$/);
    const room = await new Client(t.battleServerUrl).joinById(t.roomId, { ticket: t.ticket });
    room.onMessage('*', () => {});
    let recorded = false;
    room.onMessage('battle.result.recorded', (m: { recorded: boolean }) => (recorded = m.recorded));
    await until(() => recorded, 40_000);

    const view = (await p.agent.get(`/api/v1/training/${id}`).expect(200)).body;
    expect(view.status).toBe('FINISHED');
    expect(view.result.mode).toBe('TRAINING');
    expect(view.result.worldId).toBeNull();
    // Ticket consumido no sirve para otra conexión.
    await expect(
      new Client(t.battleServerUrl).joinById(t.roomId, { ticket: t.ticket }),
    ).rejects.toThrow();
    await room.leave();

    expect(await worldFingerprint()).toBe(before);

    // Canal interno: sin token ⇒ 401; reenvío idéntico ⇒ idempotente; resultado distinto ⇒ 409.
    const stored = await h.database.db.execute(
      sql`select result, replay from training_matches where id = ${id}`,
    );
    const { result, replay } = stored.rows[0] as {
      result: Record<string, unknown>;
      replay: unknown;
    };
    const post = (body: unknown, token?: string) =>
      fetch(`${apiUrl}/api/v1/internal/training/${id}/result`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-service-token': token } : {}),
        },
        body: JSON.stringify(body),
      });
    expect((await post({ result, replay })).status).toBe(401);
    expect((await post({ result, replay }, 'x'.repeat(40))).status).toBe(401);
    const again = await post({ result, replay }, SERVICE);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ status: 'ALREADY_RECORDED' });
    const forged = {
      ...result,
      winner: result.winner === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER',
      resultHash: 'f'.repeat(64),
    };
    expect((await post({ result: forged, replay }, SERVICE)).status).toBe(409);
    expect(await worldFingerprint()).toBe(before);

    // Una partida terminada no emite más tickets.
    expect(
      (
        await p.agent
          .post(`/api/v1/training/${id}/join-ticket`)
          .set('x-csrf-token', p.csrf)
          .expect(409)
      ).body.code,
    ).toBe('MATCH_NOT_JOINABLE');
  }, 60_000);

  it('PvP de entrenamiento: invitación por código, un solo invitado y aislamiento entre cuentas', async () => {
    const host = await player('Anfitriona');
    const guest = await player('Invitada');
    const intruder = await player('Intrusa');
    const created = (
      await host.agent
        .post('/api/v1/training')
        .set('x-csrf-token', host.csrf)
        .send({ opponent: 'PLAYER', civilization: 'sea_league', army: 'balanced' })
        .expect(201)
    ).body;
    expect(created.status).toBe('WAITING_OPPONENT');
    // El anfitrión no puede unirse a su propia partida ni pedir ticket antes de tiempo.
    await host.agent
      .post(`/api/v1/training/join/${created.inviteCode}`)
      .set('x-csrf-token', host.csrf)
      .send({ civilization: 'sea_league', army: 'balanced' })
      .expect(409);
    const joined = (
      await guest.agent
        .post(`/api/v1/training/join/${created.inviteCode}`)
        .set('x-csrf-token', guest.csrf)
        .send({ civilization: 'imperial_crown', army: 'archer_line' })
        .expect(200)
    ).body;
    expect(joined).toMatchObject({ status: 'LIVE', mySide: 'DEFENDER' });
    await intruder.agent
      .post(`/api/v1/training/join/${created.inviteCode}`)
      .set('x-csrf-token', intruder.csrf)
      .send({ civilization: 'imperial_crown', army: 'balanced' })
      .expect(409);
    await intruder.agent.get(`/api/v1/training/${created.id}`).expect(404);
    await intruder.agent
      .post(`/api/v1/training/${created.id}/join-ticket`)
      .set('x-csrf-token', intruder.csrf)
      .expect(404);
    const tg = (
      await guest.agent
        .post(`/api/v1/training/${created.id}/join-ticket`)
        .set('x-csrf-token', guest.csrf)
        .expect(200)
    ).body;
    expect(tg.side).toBe('DEFENDER');
  });

  it('battle-server caído: el entrenamiento falla limpio (503) sin tocar el mundo (NFR2-008)', async () => {
    const before = await worldFingerprint();
    const p = await player('SinServidor');
    const svc = new TrainingService(h.ctx, {
      enabled: true,
      signingKey: KEY,
      publicBattleServerUrl: 'http://127.0.0.1:1',
      gateway: httpBattleServerGateway('http://127.0.0.1:1', SERVICE),
    });
    await expect(
      svc.create(
        { accountId: p.accountId },
        { opponent: 'DOCTRINE', civilization: 'imperial_crown', army: 'balanced' },
      ),
    ).rejects.toMatchObject({
      code: 'BATTLE_SERVER_UNAVAILABLE',
    });
    const disabled = new TrainingService(h.ctx, {
      enabled: false,
      signingKey: KEY,
      publicBattleServerUrl: '',
      gateway: httpBattleServerGateway(BATTLE_URL, SERVICE),
    });
    await expect(
      disabled.create(
        { accountId: p.accountId },
        { opponent: 'DOCTRINE', civilization: 'imperial_crown', army: 'balanced' },
      ),
    ).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    expect(await worldFingerprint()).toBe(before);
  });
});
