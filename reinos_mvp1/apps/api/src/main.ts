import { createDatabase, requireDatabaseUrl } from '@reinos/db';
import { jsonLogger, systemClock, type CoreContext } from '@reinos/core';
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
const app = await createApp(ctx, {
  production,
  allowedOrigins,
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300),
  authRateLimitPerMinute: 10,
});
await app.listen(port, process.env.HOST ?? '127.0.0.1');
log.info('api.listening', { port, production, allowed_origins: allowedOrigins });

const shutdown = async (signal: string) => {
  log.info('api.shutdown', { signal });
  await app.close();
  await database.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
