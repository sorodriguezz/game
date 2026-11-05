import { createHmac, timingSafeEqual } from 'node:crypto';
import { battleJoinTicketClaimsSchema, type BattleJoinTicketClaims } from '@reinos/contracts';

/**
 * Tickets de sala de un uso (ADR-0026): `base64url(claims).base64url(HMAC-SHA256)`.
 * La API firma; el battle-server verifica y consume el `jti` atómicamente.
 * Solo Node (usa node:crypto); el cliente nunca ve la clave.
 */

export type TicketError =
  'BAD_FORMAT' | 'BAD_SIGNATURE' | 'BAD_CLAIMS' | 'EXPIRED' | 'NOT_YET_VALID';

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function mac(key: string, payload: string): Buffer {
  return createHmac('sha256', key).update(payload).digest();
}

export function assertSigningKey(key: string | undefined): string {
  if (!key || key.length < 32)
    throw new Error('BATTLE_TICKET_SIGNING_KEY ausente o demasiado corta (>= 32 caracteres)');
  return key;
}

export function signTicket(claims: BattleJoinTicketClaims, key: string): string {
  const payload = b64(JSON.stringify(battleJoinTicketClaimsSchema.parse(claims)));
  return `${payload}.${b64(mac(key, payload))}`;
}

export function verifyTicket(
  token: unknown,
  key: string,
  nowSeconds: number,
): { ok: true; claims: BattleJoinTicketClaims } | { ok: false; error: TicketError } {
  if (typeof token !== 'string' || token.length > 2048) return { ok: false, error: 'BAD_FORMAT' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'BAD_FORMAT' };
  const expected = mac(key, parts[0]);
  let given: Buffer;
  try {
    given = Buffer.from(parts[1], 'base64url');
  } catch {
    return { ok: false, error: 'BAD_FORMAT' };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return { ok: false, error: 'BAD_SIGNATURE' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'BAD_FORMAT' };
  }
  const claims = battleJoinTicketClaimsSchema.safeParse(parsed);
  if (!claims.success) return { ok: false, error: 'BAD_CLAIMS' };
  if (claims.data.exp <= nowSeconds) return { ok: false, error: 'EXPIRED' };
  if (claims.data.iat > nowSeconds + 30) return { ok: false, error: 'NOT_YET_VALID' };
  return { ok: true, claims: claims.data };
}

/**
 * Registro de `jti` consumidos. Un solo proceso de battle-server (ADR-0031):
 * memoria es suficiente porque el TTL del ticket (60 s) es menor que cualquier
 * reinicio útil; Gate 2 (WORLD_PVP) consumirá el `jti` en PostgreSQL.
 */
export class JtiStore {
  private used = new Map<string, number>();
  consume(jti: string, expSeconds: number, nowSeconds: number): boolean {
    if (this.used.size > 10_000)
      for (const [k, exp] of this.used) if (exp <= nowSeconds) this.used.delete(k);
    if (this.used.has(jti)) return false;
    this.used.set(jti, expSeconds);
    return true;
  }
}

/** Comparación en tiempo constante del token de servicio interno (API ⇄ battle-server). */
export function serviceTokenMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
