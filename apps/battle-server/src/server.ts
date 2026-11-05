import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { JtiStore, serviceTokenMatches } from '@reinos/tactical-sim/tickets';
import type { BattleServerConfig } from './config.js';
import { Metrics, log } from './metrics.js';
import { TacticalRoom, setRoomDeps, type ResultPayload } from './TacticalRoom.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Entrega por defecto del resultado: endpoint interno autenticado de la API (ADR-0027). */
export function httpResultSink(config: BattleServerConfig) {
  return async (encounterId: string, payload: ResultPayload): Promise<void> => {
    const res = await fetch(
      `${config.internalApiUrl}/api/v1/internal/training/${encounterId}/result`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-service-token': config.serviceToken },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok && res.status !== 409) throw new Error(`API respondió ${res.status}`);
  };
}

export function createBattleServer(
  config: BattleServerConfig,
  opts: {
    deliverResult?: (encounterId: string, p: ResultPayload) => Promise<void>;
    nowMs?: () => number;
    tickIntervalMs?: number;
  } = {},
) {
  const metrics = new Metrics();
  setRoomDeps({
    config,
    metrics,
    jti: new JtiStore(),
    deliverResult: opts.deliverResult ?? httpResultSink(config),
    nowMs: opts.nowMs ?? (() => Date.now()),
    tickIntervalMs: opts.tickIntervalMs,
  });

  const health = createEndpoint('/health', { method: 'GET' }, async () =>
    json(200, {
      status: 'ok',
      trainingEnabled: config.trainingEnabled,
      roomsActive: metrics.roomsActive,
      maxRooms: config.maxRooms,
      capacityAvailable: metrics.roomsActive < config.maxRooms,
      tacticalRulesetVersion: config.tacticalRulesetVersion,
    }),
  );
  const metricsEndpoint = createEndpoint('/metrics', { method: 'GET' }, async () =>
    json(200, metrics.snapshot()),
  );
  /** Creación de sala SOLO para la API (token de servicio). El navegador no puede crear salas. */
  const createRoom = createEndpoint('/internal/rooms', { method: 'POST' }, async (ctx) => {
    if (!serviceTokenMatches(ctx.request?.headers.get('x-service-token'), config.serviceToken)) {
      return json(401, { code: 'UNAUTHENTICATED' });
    }
    if (!config.trainingEnabled) return json(503, { code: 'FEATURE_DISABLED' });
    if (metrics.roomsActive >= config.maxRooms) return json(503, { code: 'ROOM_AT_CAPACITY' });
    try {
      const body = ctx.body as { snapshot?: unknown };
      const room = await matchMaker.createRoom('tactical', {
        snapshot: body?.snapshot,
        internalToken: config.serviceToken,
      });
      return json(201, { roomId: room.roomId });
    } catch (e) {
      log('warn', 'room.create_failed', { error: e instanceof Error ? e.message : String(e) });
      return json(400, { code: 'INVALID_SNAPSHOT' });
    }
  });

  const server = defineServer({
    rooms: { tactical: defineRoom(TacticalRoom) },
    routes: createRouter({ health, metricsEndpoint, createRoom }, { openapi: { disabled: true } }),
    transport: new WebSocketTransport({ maxPayload: 4 * 1024 }),
    greet: false,
  });
  return { server, metrics };
}
