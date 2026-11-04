import { sql } from 'drizzle-orm';
import { scheduledEvents, type Tx } from '@reinos/db';
import { DomainError, type CoreContext } from './context.js';
import { newId } from './util.js';

/**
 * Cola durable de eventos de juego en PostgreSQL (ADR-0003, docs/ADR-MVP1 ADR-005).
 *
 * Invariantes:
 * 1. Un evento se aplica SOLO con todas las aldeas de su "lockset" bloqueadas
 *    (FOR UPDATE, orden por id). Ese bloqueo es la exclusión mutua: el lease del
 *    worker es solo una optimización de reparto, no da derecho a aplicar.
 * 2. Por aldea, los eventos se aplican en orden total (due_at, priority, id)
 *    (FR-BAT-06). Si un evento anterior necesita una aldea no bloqueada, se
 *    aborta con `EventOrderingConflict` y se reintenta más tarde.
 * 3. Aplicar el efecto de negocio y marcar DONE ocurre en la MISMA transacción:
 *    un fallo antes del COMMIT no deja efectos; tras el COMMIT, el evento no
 *    vuelve a aplicarse (status DONE).
 */

export const EVENT_TYPES = {
  CONSTRUCTION_COMPLETE: { priority: 10 },
  RECRUITMENT_COMPLETE: { priority: 20 },
  MOVEMENT_RETURN: { priority: 30 },
  MOVEMENT_ARRIVAL: { priority: 40 },
} as const;
export type EventType = keyof typeof EVENT_TYPES;

export interface GameEvent {
  id: string;
  worldId: string;
  type: EventType;
  villageId: string;
  secondaryVillageId: string | null;
  dueAt: Date;
  priority: number;
  payload: Record<string, unknown>;
  attempts: number;
}

export type EventHandler = (tx: Tx, ctx: CoreContext, ev: GameEvent) => Promise<void>;

/** El evento anterior en orden necesita aldeas no bloqueadas: reintentar luego. */
export class EventOrderingConflict extends Error {
  constructor(readonly blockingEventId: string) {
    super(`evento anterior pendiente ${blockingEventId}`);
  }
}

export async function scheduleEvent(
  tx: Tx,
  ev: {
    worldId: string;
    type: EventType;
    villageId: string;
    secondaryVillageId?: string | null;
    dueAt: Date;
    dedupeKey: string;
    payload: Record<string, unknown>;
  },
): Promise<string> {
  const id = newId();
  await tx
    .insert(scheduledEvents)
    .values({
      id,
      worldId: ev.worldId,
      type: ev.type,
      villageId: ev.villageId,
      secondaryVillageId: ev.secondaryVillageId ?? null,
      dueAt: ev.dueAt,
      priority: EVENT_TYPES[ev.type].priority,
      availableAt: ev.dueAt,
      dedupeKey: ev.dedupeKey,
      payload: ev.payload,
    })
    .onConflictDoNothing({ target: [scheduledEvents.worldId, scheduledEvents.dedupeKey] });
  return id;
}

interface RawEventRow {
  id: string;
  world_id: string;
  type: string;
  village_id: string;
  secondary_village_id: string | null;
  due_at: Date | string;
  priority: number;
  payload: Record<string, unknown>;
  attempts: number;
}

export function rowToEvent(r: RawEventRow): GameEvent {
  return {
    id: r.id,
    worldId: r.world_id,
    type: r.type as EventType,
    villageId: r.village_id,
    secondaryVillageId: r.secondary_village_id,
    dueAt: r.due_at instanceof Date ? r.due_at : new Date(r.due_at),
    priority: Number(r.priority),
    payload: r.payload,
    attempts: Number(r.attempts),
  };
}

export function locksetOf(ev: Pick<GameEvent, 'villageId' | 'secondaryVillageId'>): string[] {
  return ev.secondaryVillageId ? [ev.villageId, ev.secondaryVillageId] : [ev.villageId];
}

const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

/**
 * Aplica, en orden total, los eventos pendientes que tocan las aldeas
 * bloqueadas hasta `limit` (incluido). El llamador DEBE tener bloqueadas
 * las aldeas `locked`.
 */
export async function processEventsUpTo(
  tx: Tx,
  ctx: CoreContext,
  handlers: Record<EventType, EventHandler>,
  locked: ReadonlySet<string>,
  limit: { dueAt: Date; priority?: number; id?: string },
): Promise<number> {
  const ids = [...locked];
  const res = await tx.execute(sql`
    select id, world_id, type, village_id, secondary_village_id, due_at, priority, payload, attempts
    from scheduled_events
    where status in ('PENDING', 'PROCESSING')
      and (village_id = any(${sql.param(ids)}::uuid[]) or secondary_village_id = any(${sql.param(ids)}::uuid[]))
      and (due_at, priority, id) <= (${limit.dueAt.toISOString()}::timestamptz, ${limit.priority ?? 32767}::smallint, ${limit.id ?? MAX_UUID}::uuid)
    order by due_at, priority, id
  `);
  let applied = 0;
  for (const row of res.rows as unknown as RawEventRow[]) {
    const ev = rowToEvent(row);
    if (!locksetOf(ev).every((v) => locked.has(v))) throw new EventOrderingConflict(ev.id);
    await handlers[ev.type](tx, ctx, ev);
    await ctx.faults?.afterEventApplied?.({ id: ev.id, type: ev.type });
    const done = await tx.execute(sql`
      update scheduled_events
      set status = 'DONE', processed_at = ${ctx.clock.now().toISOString()}::timestamptz,
          lease_owner = null, lease_until = null, last_error = null
      where id = ${ev.id} and status in ('PENDING', 'PROCESSING')
    `);
    if (done.rowCount !== 1) {
      throw new DomainError('CONCURRENT_MODIFICATION', 409, `evento ${ev.id} cambió de estado durante su aplicación`);
    }
    ctx.log.info('event.applied', {
      event_id: ev.id,
      world_id: ev.worldId,
      type: ev.type,
      lag_ms: ctx.clock.now().getTime() - ev.dueAt.getTime(),
    });
    applied++;
  }
  return applied;
}
