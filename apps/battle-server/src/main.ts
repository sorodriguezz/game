import { loadConfig } from './config.js';
import { log } from './metrics.js';
import { createBattleServer } from './server.js';

/**
 * Proceso único de salas tácticas (ADR-0031). Si cae, la API deja de crear
 * entrenamientos (y en Gate 2 las batallas del mundo seguirán en AUTO).
 */
const config = loadConfig();
const { server } = createBattleServer(config);
await server.listen(config.port, config.host);
log('info', 'battle-server.listening', {
  port: config.port,
  host: config.host,
  max_rooms: config.maxRooms,
  training_enabled: config.trainingEnabled,
  ruleset: config.tacticalRulesetVersion,
});
