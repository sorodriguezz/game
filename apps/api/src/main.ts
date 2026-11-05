import { createDatabase, requireDatabaseUrl } from '@reinos/db';
import {
  TrainingService,
  httpBattleServerGateway,
  jsonLogger,
  systemClock,
  type CoreContext,
} from '@reinos/core';
import { createApp } from './app.js';

const log = jsonLogger({ svc: 'api' });
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);
const allowedOrigins = (process.env.APP_BASE_URL ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const database = createDatabase(requireDatabaseUrl(), { max: 20, applicationName: 'reinos-api' });
const ctx: CoreContext = { db: database.db, clock: systemClock, log };
// MVP 2 — flags por entorno (ADR-0036). Sin claves, el entrenamiento queda desactivado.
const signingKey = process.env.BATTLE_TICKET_SIGNING_KEY ?? '';
const serviceToken = process.env.BATTLE_INTERNAL_SERVICE_TOKEN ?? '';
const tacticalConfigured = signingKey.length >= 32 && serviceToken.length >= 32;
const trainingEnabled =
  tacticalConfigured && (process.env.TACTICAL_TRAINING_ENABLED ?? 'true') === 'true';
const gateway = httpBattleServerGateway(
  process.env.BATTLE_SERVER_INTERNAL_URL ?? 'http://127.0.0.1:2567',
  serviceToken,
);
const training = new TrainingService(ctx, {
  enabled: trainingEnabled,
  signingKey: tacticalConfigured ? signingKey : 'x'.repeat(32),
  publicBattleServerUrl: process.env.BATTLE_SERVER_PUBLIC_URL ?? '/battle',
  gateway,
});
const app = await createApp(
  ctx,
  {
    production,
    allowedOrigins,
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300),
    authRateLimitPerMinute: 10,
    tactical: {
      trainingEnabled,
      // WORLD_PVP no existe hasta Gate 2: el flag se publica pero no puede activarse aún.
      worldPvpEnabled: false,
      serviceToken: tacticalConfigured ? serviceToken : '',
      health: () => gateway.health(),
    },
  },
  training,
);
await app.listen(port, process.env.HOST ?? '127.0.0.1');
log.info('api.listening', {
  port,
  production,
  allowed_origins: allowedOrigins,
  training_enabled: trainingEnabled,
});

const shutdown = async (signal: string) => {
  log.info('api.shutdown', { signal });
  await app.close();
  await database.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
