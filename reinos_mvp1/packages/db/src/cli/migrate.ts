import { createDatabase, requireDatabaseUrl, runMigrations } from '../client.js';

const database = createDatabase(requireDatabaseUrl(), {
  max: 1,
  applicationName: 'reinos-migrate',
});
try {
  await runMigrations(database.db);
  console.log('Migraciones aplicadas.');
} finally {
  await database.close();
}
