import { and, eq, sql } from 'drizzle-orm';
import { idempotencyRecords, type Tx } from '@reinos/db';
import { err } from './context.js';
import { sha256, stableStringify } from './util.js';

export interface IdempotencyScope {
  accountId: string;
  worldId: string;
  command: string;
  key: string;
}

const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function assertIdempotencyKey(key: string | undefined): string {
  if (!key) throw err.unprocessable('IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key');
  if (!KEY_RE.test(key)) throw err.unprocessable('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key inválida');
  return key;
}

/**
 * Ejecuta `fn` una sola vez por (cuenta, mundo, comando, clave) (docs/ADR-MVP1 ADR-006).
 * Dentro de la MISMA transacción que el comando:
 * 1. Inserta un registro reservado; un duplicado concurrente espera en el índice
 *    único hasta que la primera transacción confirme o aborte.
 * 2. Si ya existía: misma carga ⇒ devuelve la respuesta guardada; distinta ⇒ error.
 * 3. Si `fn` lanza, la transacción aborta y la clave queda libre para reintentar.
 */
export async function runIdempotent<T>(
  tx: Tx,
  scope: IdempotencyScope,
  requestBody: unknown,
  fn: () => Promise<T>,
): Promise<{ response: T; replayed: boolean }> {
  const requestHash = sha256(stableStringify({ command: scope.command, body: requestBody }));
  const inserted = await tx
    .insert(idempotencyRecords)
    .values({ ...scope, requestHash, response: sql`'null'::jsonb` })
    .onConflictDoNothing()
    .returning({ key: idempotencyRecords.key });
  if (inserted.length === 0) {
    const [existing] = await tx
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.accountId, scope.accountId),
          eq(idempotencyRecords.worldId, scope.worldId),
          eq(idempotencyRecords.command, scope.command),
          eq(idempotencyRecords.key, scope.key),
        ),
      );
    if (!existing || existing.requestHash !== requestHash) {
      throw err.unprocessable('IDEMPOTENCY_KEY_REUSED', 'La Idempotency-Key ya se usó con otra petición');
    }
    return { response: existing.response as T, replayed: true };
  }
  const response = await fn();
  await tx
    .update(idempotencyRecords)
    .set({ response: response as unknown as object })
    .where(
      and(
        eq(idempotencyRecords.accountId, scope.accountId),
        eq(idempotencyRecords.worldId, scope.worldId),
        eq(idempotencyRecords.command, scope.command),
        eq(idempotencyRecords.key, scope.key),
      ),
    );
  return { response, replayed: false };
}
