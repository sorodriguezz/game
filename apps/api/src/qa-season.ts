/** Servidor efímero de QA; rechaza cualquier base que no sea reinos_test. */
import { createDatabase, runMigrations, accounts } from '@reinos/db';
import {
  AuthService,
  AdministrationService,
  EventWorker,
  systemClock,
  silentLogger,
} from '@reinos/core';
import { eq, sql } from 'drizzle-orm';
import { createApp } from './app.js';
const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://reinos_dev:reinos_dev_change_me@127.0.0.1:5432/reinos_test',
  parsed = new URL(url);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/reinos_test')
  throw new Error('QA solo reinos_test local');
const database = createDatabase(url, { max: 12 }),
  identity = await database.db.execute(sql`select current_database() as name`);
if (identity.rows[0]?.name !== 'reinos_test') throw new Error('Base incorrecta');
await runMigrations(database.db);
await database.db.execute(sql`truncate table worlds,accounts restart identity cascade`);
const ctx = { db: database.db, clock: systemClock, log: silentLogger },
  auth = new AuthService(ctx),
  management = new AdministrationService(ctx);
for (const [name, role] of [
  ['QAAdministrador', 'ADMIN'],
  ['QAModerador', 'MODERATOR'],
] as const) {
  const user = await auth.register({
    email: `${name.toLowerCase()}@example.test`,
    displayName: name,
    password: 'qa-local-password-12345',
  });
  await database.db.update(accounts).set({ role }).where(eq(accounts.id, user.account.id));
}
const [admin] = await database.db
    .select()
    .from(accounts)
    .where(eq(accounts.displayName, 'QAAdministrador')),
  [mod] = await database.db.select().from(accounts).where(eq(accounts.displayName, 'QAModerador'));
const world = await management.createWorld(
  admin!.id,
  {
    name: 'Tierras de la Frontera',
    mapSize: 1000,
    mapSeed: 20261105,
    speedMultiplier: 5,
    movementSpeedMultiplier: 1,
    protectionHours: 0,
    opensAt: new Date().toISOString(),
    endsAt: null,
  },
  crypto.randomUUID(),
);
await management.worldAction(admin!.id, world.id, 'PUBLISH', crypto.randomUUID());
await management.assignModerator(admin!.id, world.id, mod!.id, true, crypto.randomUUID());
const app = await createApp(ctx, {
  production: false,
  allowedOrigins: ['http://127.0.0.1:5174'],
  rateLimitPerMinute: 100000,
  authRateLimitPerMinute: 100000,
  tactical: {
    trainingEnabled: false,
    worldPvpEnabled: false,
    serviceToken: '',
    health: async () => ({ ok: false, capacityAvailable: false }),
  },
});
await app.listen(3001, '127.0.0.1');
const abort = new AbortController(),
  worker = new EventWorker(ctx, { workerId: 'qa-season' });
void worker.run(abort.signal);
console.log('QA listo en 3001, exclusivamente reinos_test');
const stop = () => {
  abort.abort();
  void app.close().then(() => database.close());
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
