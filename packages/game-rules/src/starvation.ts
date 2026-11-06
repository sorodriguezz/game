import type { ResourceState } from './economy.js';
import { MS_PER_HOUR } from './fixed.js';
/** Primer intervalo de hambre tras agotarse la reserva con la precisión del ledger. */
export function starvationDueAt(
  state: ResourceState,
  previous: number | null,
  intervalSeconds: number,
  hasTroops: boolean,
): number | null {
  if (state.rates.food >= 0n || !hasTroops) return null;
  if (state.amounts.food === 0n)
    return previous !== null && previous > state.lastSettledAt
      ? previous
      : state.lastSettledAt + intervalSeconds * 1000;
  const delta =
    ((state.amounts.food - 1n) * MS_PER_HOUR + state.remainders.food) / -state.rates.food + 1n;
  return state.lastSettledAt + Number(delta) + intervalSeconds * 1000;
}
export function starvationBudget(foodRate: bigint, intervalSeconds: number): number {
  if (foodRate >= 0n) return 0;
  const numerator = -foodRate * BigInt(intervalSeconds),
    denominator = 3600000n;
  return Math.max(1, Number((numerator + denominator - 1n) / denominator));
}
