import { hostname } from 'node:os';
import { createDatabase, requireDatabaseUrl } from '@reinos/db';
import { EventWorker, jsonLogger, systemClock, type CoreContext } from '@reinos/core';

/**
 * Proceso worker (ADR-0003). Puede ejecutarse en varias réplicas: el reparto
 * usa FOR UPDATE SKIP LOCKED + leases, y la aplicación es idempotente.
 */
const workerId = process.env.WORKER_ID ?? `${hostname()}-${process.pid}`;
const log = jsonLogger({ svc: 'worker', worker_id: workerId });
const database = createDatabase(requireDatabaseUrl(), { max: 5, applicationName: 'reinos-worker' });
const ctx: CoreContext = { db: database.db, clock: systemClock, log };
const worker = new EventWorker(ctx, {
  workerId,
  batchSize: Number(process.env.WORKER_BATCH ?? 50),
  pollMs: Number(process.env.WORKER_POLL_MS ?? 500),
  leaseMs: Number(process.env.WORKER_LEASE_MS ?? 30_000),
});

const abort = new AbortController();
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => {
    log.info('worker.signal', { signal: sig });
    abort.abort();
  });
}

// Métrica periódica de atraso de la cola y dead-letter (alertable).
const statsTimer = setInterval(() => {
  worker
    .stats()
    .then((s) => (s.maxLagMs > 10_000 || s.dead > 0 ? log.warn : log.info)('queue.stats', s))
    .catch((e: unknown) => log.error('queue.stats_failed', { error: String(e) }));
}, 30_000);

try {
  await worker.run(abort.signal);
} finally {
  clearInterval(statsTimer);
  await database.close();
}
