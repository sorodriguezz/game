import { z } from 'zod';
import { DEFAULT_TACTICAL_RULESET_VERSION, getTacticalRuleset } from '@reinos/game-config';
import { assertSigningKey } from '@reinos/tactical-sim/tickets';

/**
 * Configuración del battle-server validada al arrancar (ADR-0036, PRD-MVP2 §15).
 * Los secretos llegan por entorno/gestor de secretos; nunca por el repositorio.
 */
const envSchema = z.object({
  BATTLE_SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(2567),
  BATTLE_SERVER_HOST: z.string().default('127.0.0.1'),
  BATTLE_TICKET_SIGNING_KEY: z.string().min(32),
  BATTLE_INTERNAL_SERVICE_TOKEN: z.string().min(32),
  BATTLE_INTERNAL_API_URL: z.url().default('http://127.0.0.1:3000'),
  TACTICAL_MAX_ROOMS: z.coerce.number().int().min(1).max(64).default(2),
  TACTICAL_TICK_HZ: z.coerce.number().int().optional(),
  TACTICAL_TRAINING_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export interface BattleServerConfig {
  port: number;
  host: string;
  signingKey: string;
  serviceToken: string;
  internalApiUrl: string;
  maxRooms: number;
  trainingEnabled: boolean;
  tacticalRulesetVersion: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BattleServerConfig {
  const e = envSchema.parse(env);
  const tactical = getTacticalRuleset(DEFAULT_TACTICAL_RULESET_VERSION);
  if (e.TACTICAL_TICK_HZ !== undefined && e.TACTICAL_TICK_HZ !== tactical.timing.tickHz) {
    throw new Error(
      `TACTICAL_TICK_HZ=${e.TACTICAL_TICK_HZ} no coincide con el ruleset ${tactical.version} (${tactical.timing.tickHz} Hz)`,
    );
  }
  return {
    port: e.BATTLE_SERVER_PORT,
    host: e.BATTLE_SERVER_HOST,
    signingKey: assertSigningKey(e.BATTLE_TICKET_SIGNING_KEY),
    serviceToken: e.BATTLE_INTERNAL_SERVICE_TOKEN,
    internalApiUrl: e.BATTLE_INTERNAL_API_URL,
    maxRooms: e.TACTICAL_MAX_ROOMS,
    trainingEnabled: e.TACTICAL_TRAINING_ENABLED,
    tacticalRulesetVersion: tactical.version,
  };
}
