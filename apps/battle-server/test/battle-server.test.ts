import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { buildTrainingResult, buildTrainingSnapshot, runReplay } from '@reinos/tactical-sim';
import { signTicket } from '@reinos/tactical-sim/tickets';
import type { BattleJoinTicketClaims, TacticalBattleSnapshot } from '@reinos/contracts';
import { createBattleServer } from '../src/server.js';
import type { ResultPayload } from '../src/TacticalRoom.js';
import type { BattleServerConfig } from '../src/config.js';

const KEY = 'k'.repeat(48);
const SERVICE = 's'.repeat(40);
const PORT = 25_000 + randomInt(2000);
const BASE = `http://127.0.0.1:${PORT}`;
const config: BattleServerConfig = {
  port: PORT,
  host: '127.0.0.1',
  signingKey: KEY,
  serviceToken: SERVICE,
  internalApiUrl: 'http://127.0.0.1:1',
  maxRooms: 3,
  trainingEnabled: true,
  tacticalRulesetVersion: 'tactical-mvp2-alpha.0',
};
const delivered = new Map<string, ResultPayload>();
let srv: ReturnType<typeof createBattleServer>;

beforeAll(async () => {
  srv = createBattleServer(config, {
    deliverResult: async (id, p) => {
      delivered.set(id, p);
    },
    tickIntervalMs: 2,
  });
  await srv.server.listen(PORT, '127.0.0.1');
});
afterAll(async () => {
  await srv.server.gracefullyShutdown(false);
});

function snapshot(opts: { defender?: 'PLAYER' | 'DOCTRINE' } = {}): TacticalBattleSnapshot {
  return buildTrainingSnapshot({
    encounterId: randomUUID(),
    seed: randomUUID(),
    createdAt: new Date().toISOString(),
    terrainId: 'plain',
    attacker: {
      playerId: 'host',
      displayName: 'Anfitrión',
      civilization: 'imperial_crown',
      army: 'balanced',
      controlledBy: 'PLAYER',
    },
    defender: {
      playerId: 'guest',
      displayName: 'Invitado',
      civilization: 'sea_league',
      army: 'balanced',
      controlledBy: opts.defender ?? 'DOCTRINE',
    },
  });
}

async function createRoom(snap: unknown, token = SERVICE) {
  const res = await fetch(`${BASE}/internal/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-service-token': token },
    body: JSON.stringify({ snapshot: snap }),
  });
  return { status: res.status, body: (await res.json()) as { roomId?: string; code?: string } };
}

function ticket(snap: TacticalBattleSnapshot, over: Partial<BattleJoinTicketClaims> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signTicket(
    {
      v: 1,
      aud: 'battle-server',
      mode: 'TRAINING',
      worldId: null,
      seasonId: null,
      encounterId: snap.encounterId,
      roomId: snap.encounterId,
      playerId: 'host',
      side: 'ATTACKER',
      role: 'PLAYER',
      jti: randomUUID(),
      iat: now,
      exp: now + 60,
      ...over,
    },
    over.v === undefined ? KEY : KEY,
  );
}

async function expectJoinError(p: Promise<unknown>, pattern: RegExp) {
  await expect(p).rejects.toThrow(pattern);
}

const until = async (cond: () => boolean, ms = 15_000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout esperando condición');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('battle-server Colyseus (Gate 1, TRAINING)', () => {
  it('health y métricas', async () => {
    const h = await (await fetch(`${BASE}/health`)).json();
    expect(h).toMatchObject({ status: 'ok', trainingEnabled: true });
    const m = await (await fetch(`${BASE}/metrics`)).json();
    expect(m).toHaveProperty('battle_tick_duration_ms');
  });

  it('solo la API crea salas: sin token, con snapshot manipulado o desde un cliente ⇒ rechazado', async () => {
    expect((await createRoom(snapshot(), 'x'.repeat(40))).status).toBe(401);
    const tampered = snapshot();
    tampered.participants[0].units[0]!.count = 9999;
    expect((await createRoom(tampered)).status).toBe(400);
    const client = new Client(BASE);
    await expect(client.create('tactical', { snapshot: snapshot() })).rejects.toThrow();
  });

  it('tickets: válido entra; reutilizado, caducado, de otra sala, mal firmado o de bando de la doctrina ⇒ fuera (NET-001..003)', async () => {
    const snap = snapshot();
    const { status, body } = await createRoom(snap);
    expect(status).toBe(201);
    const roomId = body.roomId!;
    const client = new Client(BASE);
    const t = ticket(snap);
    const room = await client.joinById(roomId, { ticket: t });
    expect(room.roomId).toBe(snap.encounterId);
    await expectJoinError(
      new Client(BASE).joinById(roomId, { ticket: t }),
      /TICKET_REUSED|SIDE_TAKEN/,
    );
    const now = Math.floor(Date.now() / 1000);
    await expectJoinError(
      new Client(BASE).joinById(roomId, { ticket: ticket(snap, { exp: now - 1, iat: now - 70 }) }),
      /EXPIRED/,
    );
    await expectJoinError(
      new Client(BASE).joinById(roomId, { ticket: ticket(snap, { roomId: randomUUID() }) }),
      /WRONG_ROOM/,
    );
    await expectJoinError(
      new Client(BASE).joinById(roomId, { ticket: `${t.split('.')[0]}.AAAA` }),
      /BAD_SIGNATURE/,
    );
    await expectJoinError(
      new Client(BASE).joinById(roomId, {
        ticket: ticket(snap, { side: 'DEFENDER', playerId: 'guest' }),
      }),
      /WRONG_SIDE/,
    );
    await room.leave();
  });

  it('niebla de guerra, órdenes adversariales y entrenamiento completo con replay reproducible (NET-005..009, G1-10)', async () => {
    const snap = snapshot();
    const { body } = await createRoom(snap);
    const client = new Client(BASE);
    const room: Room = await client.joinById(body.roomId!, { ticket: ticket(snap) });
    const rejected: Array<{ seq: number; reason: string }> = [];
    room.onMessage('order.rejected', (m: { seq: number; reason: string }) => rejected.push(m));
    room.onMessage('*', () => {});
    await until(
      () => ((room.state as { formations?: { size: number } }).formations?.size ?? 0) > 0,
    );
    const visible = () => [
      ...(room.state as { formations: Map<string, { side: string }> }).formations.values(),
    ];
    // Al inicio solo se ven las formaciones propias (enemigos a ~88 m > 70 m de visión).
    expect(visible().every((f) => f.side === 'ATTACKER')).toBe(true);

    room.send('order', {
      type: 'MOVE',
      formationId: 'A0',
      seq: 1,
      requestedTick: 0,
      targetPosition: { x: Number.NaN, z: 1 },
    });
    room.send('order', {
      type: 'MOVE',
      formationId: 'D0',
      seq: 2,
      requestedTick: 0,
      targetPosition: { x: 1000, z: 1000 },
    });
    room.send('order', { type: 'HOLD', formationId: 'A0', seq: 2, requestedTick: 0 });
    room.send('order', {
      type: 'MOVE',
      formationId: 'A0',
      seq: 3,
      requestedTick: 0,
      targetPosition: { x: 10_000, z: 4_600 },
    });
    room.send('order', { hp: 9999, count: 100000 });
    for (let i = 0; i < 40; i++)
      room.send('order', { type: 'HOLD', formationId: 'A1', seq: 100 + i, requestedTick: 0 });
    await until(() => rejected.length >= 6);
    const reasons = new Set(rejected.map((r) => r.reason));
    for (const r of [
      'MALFORMED',
      'WRONG_SIDE',
      'SEQ_NOT_MONOTONIC',
      'NOT_PASSABLE',
      'RATE_LIMITED',
    ])
      expect(reasons).toContain(r);

    // La IA doctrinal del defensor y el atacante (sin más órdenes) llevan la batalla a término.
    let resultMsg: { recorded: boolean; result: { resultHash: string; mode: string } } | undefined;
    room.onMessage('battle.result.recorded', (m) => (resultMsg = m));
    // Ataque general del jugador cuando haya enemigos visibles.
    await until(() => resultMsg !== undefined, 25_000);
    expect(resultMsg!.recorded).toBe(true);
    expect(resultMsg!.result.mode).toBe('TRAINING');
    const payload = delivered.get(snap.encounterId)!;
    expect(payload.result.resultHash).toBe(resultMsg!.result.resultHash);
    // Replay auditable: el registro entregado reproduce el mismo resultado.
    const replay = runReplay({
      snapshot: snap,
      inputs: payload.replay.inputs,
      abandoned: payload.replay.abandoned,
    });
    expect(buildTrainingResult(snap, replay.state, payload.result.finishedAt).resultHash).toBe(
      payload.result.resultHash,
    );
    // Al terminar se revela todo el campo (llega en el siguiente parche de estado).
    await until(() => visible().some((f) => f.side === 'DEFENDER'));
    await room.leave();
  }, 40_000);

  it('desconexión: la doctrina toma el mando y la reconexión lo devuelve (NET-010/011, ADR-0028)', async () => {
    const snap = snapshot({ defender: 'PLAYER' });
    const { body } = await createRoom(snap);
    const a = await new Client(BASE).joinById(body.roomId!, { ticket: ticket(snap) });
    const d = await new Client(BASE).joinById(body.roomId!, {
      ticket: ticket(snap, { side: 'DEFENDER', playerId: 'guest' }),
    });
    const st = () =>
      a.state as {
        attackerControl: string;
        defenderControl: string;
        waitingForPlayers: boolean;
        tick: number;
      };
    await until(() => st().waitingForPlayers === false && st().defenderControl === 'PLAYER');
    const token = d.reconnectionToken;
    // Corte sin consentimiento (como una caída de red); reconexión manual como tras recargar la página.
    d.reconnection.enabled = false;
    await d.leave(false);
    await until(() => st().defenderControl === 'DOCTRINE');
    const tickAtDrop = st().tick;
    await until(() => st().tick > tickAtDrop + 20); // la simulación sigue sin el cliente
    const d2 = await new Client(BASE).reconnect(token);
    await until(() => st().defenderControl === 'PLAYER');
    await d2.leave();
    await a.leave();
  }, 30_000);

  it('capacidad: al alcanzar TACTICAL_MAX_ROOMS la API recibe 503 ROOM_AT_CAPACITY', async () => {
    const results: number[] = [];
    for (let i = 0; i < 4; i++) results.push((await createRoom(snapshot())).status);
    expect(results).toContain(503);
  });
});
