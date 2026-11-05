import type { Request } from 'express';
import type { ResolvedSession } from '@reinos/core';

/** Tokens DI explícitos: el código se ejecuta con esbuild/tsx (sin emitDecoratorMetadata). */
export const CORE_CONTEXT = Symbol('CORE_CONTEXT');
export const AUTH_SERVICE = Symbol('AUTH_SERVICE');
export const GAME_COMMANDS = Symbol('GAME_COMMANDS');
export const GAME_QUERIES = Symbol('GAME_QUERIES');
export const API_CONFIG = Symbol('API_CONFIG');
export const TRAINING_SERVICE = Symbol('TRAINING_SERVICE');

export interface ApiConfig {
  production: boolean;
  allowedOrigins: string[];
  /** Límite global de peticiones por minuto e IP. */
  rateLimitPerMinute: number;
  authRateLimitPerMinute: number;
  /** MVP 2 — flags y canal interno con el battle-server (ADR-0026/0036). */
  tactical: {
    trainingEnabled: boolean;
    worldPvpEnabled: boolean;
    serviceToken: string;
    health: () => Promise<{ ok: boolean; capacityAvailable: boolean }>;
  };
}

export interface GameRequest extends Request {
  requestId: string;
  session?: ResolvedSession;
}
