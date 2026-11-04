/**
 * Códigos de error de dominio estables (PRD §19.1). El cliente decide UX por
 * `code`, nunca por el texto. Añadir códigos es compatible; renombrarlos no.
 */
export const ERROR_CODES = [
  // genéricos
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CSRF_MISMATCH',
  'ORIGIN_NOT_ALLOWED',
  'RATE_LIMITED',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'CONCURRENT_MODIFICATION',
  // cuentas
  'EMAIL_TAKEN',
  'DISPLAY_NAME_TAKEN',
  'INVALID_CREDENTIALS',
  // mundos
  'WORLD_NOT_FOUND',
  'WORLD_NOT_OPEN',
  'WORLD_MISMATCH',
  'ALREADY_JOINED',
  'NOT_A_MEMBER',
  'CIVILIZATION_INVALID',
  'NO_SPAWN_AVAILABLE',
  // aldeas / economía
  'VILLAGE_NOT_FOUND',
  'INSUFFICIENT_RESOURCES',
  'STARVATION',
  'EVENTS_PENDING',
  // construcción
  'PLOT_NOT_FOUND',
  'PLOT_KIND_MISMATCH',
  'PLOT_OCCUPIED',
  'BUILDING_ALREADY_EXISTS',
  'MAX_LEVEL_REACHED',
  'REQUIREMENTS_NOT_MET',
  'CIVILIZATION_RESTRICTED',
  'NOT_COASTAL',
  'CONSTRUCTION_QUEUE_BUSY',
  // tropas
  'UNIT_NOT_AVAILABLE',
  'TRAINING_BUILDING_MISSING',
  'POPULATION_LIMIT',
  'INSUFFICIENT_TROOPS',
  'ARMY_ALREADY_COMMITTED',
  'NO_UNITS_SELECTED',
  'TARGET_INVALID',
  'TARGET_PROTECTED',
  'PACT_RESTRICTS_ATTACK',
  'REPORT_NOT_FOUND',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  correlationId: string;
  details?: Record<string, unknown>;
}

/** Errores que el cliente puede reintentar automáticamente tras una breve espera. */
export const RETRYABLE_ERROR_CODES: readonly ErrorCode[] = [
  'EVENTS_PENDING',
  'CONCURRENT_MODIFICATION',
];
