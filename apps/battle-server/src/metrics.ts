/**
 * Métricas mínimas del servidor táctico (ADR-0035, PRD-MVP2 §15). En memoria,
 * expuestas en `/metrics` como JSON; sin pila de observabilidad adicional.
 */
export class Metrics {
  roomsActive = 0;
  roomsCreatedTotal = 0;
  ticksTotal = 0;
  invalidOrdersTotal = 0;
  rejectedOrdersTotal: Record<string, number> = {};
  ticketsRejectedTotal: Record<string, number> = {};
  disconnectsTotal = 0;
  reconnectsTotal = 0;
  resultsDeliveredTotal = 0;
  resultsFailedTotal = 0;
  fallbackDoctrineTotal = 0;
  private tickMs: number[] = [];
  private tickIdx = 0;

  observeTick(ms: number): void {
    this.ticksTotal++;
    if (this.tickMs.length < 2048) this.tickMs.push(ms);
    else this.tickMs[this.tickIdx++ % 2048] = ms;
  }

  inc(map: Record<string, number>, key: string): void {
    map[key] = (map[key] ?? 0) + 1;
  }

  snapshot() {
    const sorted = [...this.tickMs].sort((a, b) => a - b);
    const q = (p: number) =>
      sorted.length
        ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! * 1000) /
          1000
        : 0;
    return {
      battle_rooms_active: this.roomsActive,
      battle_rooms_created_total: this.roomsCreatedTotal,
      battle_ticks_total: this.ticksTotal,
      battle_tick_duration_ms: { p50: q(0.5), p95: q(0.95), max: q(1) },
      battle_invalid_orders_total: this.invalidOrdersTotal,
      battle_rejected_orders_total: this.rejectedOrdersTotal,
      battle_tickets_rejected_total: this.ticketsRejectedTotal,
      battle_disconnect_total: this.disconnectsTotal,
      battle_reconnect_total: this.reconnectsTotal,
      battle_results_delivered_total: this.resultsDeliveredTotal,
      battle_results_failed_total: this.resultsFailedTotal,
      battle_fallback_doctrine_total: this.fallbackDoctrineTotal,
      memory_rss_bytes: process.memoryUsage().rss,
    };
  }
}

export function log(
  level: 'info' | 'warn' | 'error',
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    svc: 'battle-server',
    msg,
    ...fields,
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}
