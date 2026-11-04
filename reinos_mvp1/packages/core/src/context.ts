import type { Db } from '@reinos/db';
import type { ErrorCode } from '@reinos/contracts';

/** Error de dominio con código estable y estado HTTP sugerido. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const err = {
  notFound: (code: ErrorCode, msg = 'No encontrado') => new DomainError(code, 404, msg),
  conflict: (code: ErrorCode, msg: string, details?: Record<string, unknown>) => new DomainError(code, 409, msg, details),
  unprocessable: (code: ErrorCode, msg: string, details?: Record<string, unknown>) =>
    new DomainError(code, 422, msg, details),
  forbidden: (code: ErrorCode, msg: string) => new DomainError(code, 403, msg),
  unauthenticated: (msg = 'Sesión requerida') => new DomainError('UNAUTHENTICATED', 401, msg),
};

/** Reloj inyectable: el servidor fija el tiempo de juego (PRD §20.3). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(Math.floor(Date.now())),
};

/** Reloj controlable para tests deterministas. */
export class FakeClock implements Clock {
  private ms: number;
  constructor(start: Date | number = Date.UTC(2026, 10, 4, 12, 0, 0)) {
    this.ms = typeof start === 'number' ? start : start.getTime();
  }
  now(): Date {
    return new Date(this.ms);
  }
  advance(ms: number): void {
    this.ms += ms;
  }
  set(d: Date | number): void {
    this.ms = typeof d === 'number' ? d : d.getTime();
  }
}

export interface Logger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

/** Logger JSON estructurado (NFR-008): request_id/world_id/event_id como campos. */
export function jsonLogger(base: Record<string, unknown> = {}): Logger {
  const write = (level: string, msg: string, fields?: Record<string, unknown>) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...base, ...fields });
    if (level === 'error') console.error(line);
    else console.log(line);
  };
  return {
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
  };
}

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

/** Ganchos de inyección de fallos SOLO para pruebas de recuperación. */
export interface FaultHooks {
  /** Se invoca dentro de la transacción tras aplicar un evento y antes del COMMIT. */
  afterEventApplied?: (event: { id: string; type: string }) => void | Promise<void>;
}

export interface CoreContext {
  db: Db;
  clock: Clock;
  log: Logger;
  faults?: FaultHooks;
}
