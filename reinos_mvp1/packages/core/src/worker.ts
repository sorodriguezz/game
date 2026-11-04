import { sql } from 'drizzle-orm';
import type { CoreContext } from './context.js';
import {
  EventOrderingConflict,
  locksetOf,
  processEventsUpTo,
  rowToEvent,
  type GameEvent,
} from './events.js';
import { EVENT_HANDLERS } from './handlers.js';
import { lockVillages } from './village-state.js';

export interface WorkerOptions {
  workerId: string;
  batchSize?: number;
  leaseMs?: number;
  maxAttempts?: number;
  pollMs?: number;
}

export interface TickResult {
  claimed: number;
  applied: number;
  skipped: number;
  deferred: number;
  failed: number;
}

/**
 * Worker de eventos vencidos sobre PostgreSQL (ADR-0003).
 *
 * 1. CLAIM (transacción corta): marca un lote como PROCESSING con lease usando
 *    `FOR UPDATE SKIP LOCKED`; también recupera leases caducados de workers caídos.
 * 2. APPLY (una transacción por evento): bloquea las aldeas del evento, aplica
 *    en orden los eventos previos de esas aldeas y el propio evento, y lo marca
 *    DONE en la misma transacción.
 * 3. Fallo: reintento con backoff exponencial; tras `maxAttempts` → DEAD
 *    (dead-letter auditable, sin pérdida silenciosa).
 */
export class EventWorker {
  private readonly batchSize: number;
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly pollMs: number;

  constructor(
    private readonly ctx: CoreContext,
    private readonly opts: WorkerOptions,
  ) {
    this.batchSize = opts.batchSize ?? 50;
    this.leaseMs = opts.leaseMs ?? 30_000;
    this.maxAttempts = opts.maxAttempts ?? 8;
    this.pollMs = opts.pollMs ?? 500;
  }

  async claim(): Promise<GameEvent[]> {
    const now = this.ctx.clock.now();
    const leaseUntil = new Date(now.getTime() + this.leaseMs);
    const res = await this.ctx.db.execute(sql`
      update scheduled_events e
      set status = 'PROCESSING', lease_owner = ${this.opts.workerId},
          lease_until = ${leaseUntil.toISOString()}::timestamptz, attempts = e.attempts + 1
      where e.id in (
        select id from scheduled_events
        where (status = 'PENDING' and available_at <= ${now.toISOString()}::timestamptz)
           or (status = 'PROCESSING' and lease_until < ${now.toISOString()}::timestamptz)
        order by due_at, priority, id
        limit ${this.batchSize}
        for update skip locked
      )
      returning e.id, e.world_id, e.type, e.village_id, e.secondary_village_id, e.due_at, e.priority, e.payload, e.attempts
    `);
    return (res.rows as never[]).map(rowToEvent).sort(
      (a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.priority - b.priority || (a.id < b.id ? -1 : 1),
    );
  }

  /** Aplica un evento reclamado. Devuelve el desenlace para métricas/tests. */
  async process(ev: GameEvent): Promise<'applied' | 'skipped' | 'deferred' | 'failed'> {
    try {
      const applied = await this.ctx.db.transaction(async (tx) => {
        const lockset = locksetOf(ev);
        await lockVillages(tx, ev.worldId, lockset);
        return processEventsUpTo(tx, this.ctx, EVENT_HANDLERS, new Set(lockset), {
          dueAt: ev.dueAt,
          priority: ev.priority,
          id: ev.id,
        });
      });
      // 0 aplicados ⇒ otro proceso (API o worker) ya lo aplicó: idempotente.
      return applied > 0 ? 'applied' : 'skipped';
    } catch (e) {
      if (e instanceof EventOrderingConflict) {
        await this.release(ev, 250, null, true);
        return 'deferred';
      }
      const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.ctx.log.error('event.failed', { event_id: ev.id, world_id: ev.worldId, type: ev.type, attempts: ev.attempts, error: message });
      await this.release(ev, Math.min(60_000, 1000 * 2 ** Math.max(0, ev.attempts - 1)), message, false);
      return 'failed';
    }
  }

  private async release(ev: GameEvent, delayMs: number, error: string | null, refundAttempt: boolean): Promise<void> {
    const availableAt = new Date(this.ctx.clock.now().getTime() + delayMs);
    await this.ctx.db.execute(sql`
      update scheduled_events
      set status = case when ${!refundAttempt} and attempts >= ${this.maxAttempts} then 'DEAD'::event_status else 'PENDING'::event_status end,
          attempts = case when ${refundAttempt} then greatest(attempts - 1, 0) else attempts end,
          available_at = ${availableAt.toISOString()}::timestamptz,
          lease_owner = null, lease_until = null,
          last_error = coalesce(${error}, last_error)
      where id = ${ev.id} and status = 'PROCESSING' and lease_owner = ${this.opts.workerId}
    `);
  }

  async tick(): Promise<TickResult> {
    const claimed = await this.claim();
    const out: TickResult = { claimed: claimed.length, applied: 0, skipped: 0, deferred: 0, failed: 0 };
    for (const ev of claimed) out[await this.process(ev)]++;
    return out;
  }

  /** Procesa hasta vaciar lo vencido (útil en tests y en arranque). */
  async drain(maxTicks = 100): Promise<TickResult> {
    const total: TickResult = { claimed: 0, applied: 0, skipped: 0, deferred: 0, failed: 0 };
    for (let i = 0; i < maxTicks; i++) {
      const t = await this.tick();
      for (const k of Object.keys(total) as Array<keyof TickResult>) total[k] += t[k];
      if (t.claimed === 0) break;
    }
    return total;
  }

  async run(signal: AbortSignal): Promise<void> {
    this.ctx.log.info('worker.started', { worker_id: this.opts.workerId });
    while (!signal.aborted) {
      let claimed = 0;
      try {
        const t = await this.tick();
        claimed = t.claimed;
        if (t.claimed > 0) this.ctx.log.info('worker.tick', { worker_id: this.opts.workerId, ...t });
      } catch (e) {
        this.ctx.log.error('worker.tick_failed', { error: e instanceof Error ? e.message : String(e) });
      }
      if (claimed === 0) await sleep(this.pollMs, signal);
    }
    this.ctx.log.info('worker.stopped', { worker_id: this.opts.workerId });
  }

  /** Métricas de cola para observabilidad (NFR-008): atraso y dead-letter. */
  async stats(): Promise<{ pending: number; overdue: number; dead: number; maxLagMs: number }> {
    const now = this.ctx.clock.now().toISOString();
    const res = await this.ctx.db.execute(sql`
      select
        count(*) filter (where status in ('PENDING','PROCESSING'))::int as pending,
        count(*) filter (where status in ('PENDING','PROCESSING') and due_at <= ${now}::timestamptz)::int as overdue,
        count(*) filter (where status = 'DEAD')::int as dead,
        coalesce(max(extract(epoch from (${now}::timestamptz - due_at)) * 1000)
          filter (where status in ('PENDING','PROCESSING') and due_at <= ${now}::timestamptz), 0)::bigint as max_lag_ms
      from scheduled_events
    `);
    const r = res.rows[0] as { pending: number; overdue: number; dead: number; max_lag_ms: string | number };
    return { pending: r.pending, overdue: r.overdue, dead: r.dead, maxLagMs: Number(r.max_lag_ms) };
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}
