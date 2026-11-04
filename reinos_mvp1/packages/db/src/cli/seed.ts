import { createDatabase, requireDatabaseUrl } from '../client.js';
import { DEV_WORLDS, seedWorlds } from '../seed.js';

const database = createDatabase(requireDatabaseUrl(), { max: 1, applicationName: 'reinos-seed' });
try {
  await seedWorlds(database.db);
  console.log(`Mundos de desarrollo asegurados: ${DEV_WORLDS.map((w) => w.slug).join(', ')}`);
} finally {
  await database.close();
}
