import type { Ruleset } from '@reinos/game-config';
import type { PlacedBuilding } from './city.js';
const DAY_MS = 86400000n;
export interface CultureState {
  amountMilli: bigint;
  remainder: bigint;
  rateMilliPerDay: bigint;
  settledAt: number;
}
export function settleCulture(s: CultureState, at: number): CultureState {
  if (at < s.settledAt) throw new RangeError('El reloj de cultura no puede retroceder');
  const produced = s.remainder + s.rateMilliPerDay * BigInt(at - s.settledAt);
  return {
    ...s,
    amountMilli: s.amountMilli + produced / DAY_MS,
    remainder: produced % DAY_MS,
    settledAt: at,
  };
}
export function cultureRate(
  r: Ruleset,
  buildings: readonly PlacedBuilding[],
  speed: number,
): bigint {
  if (!r.culture) return 0n;
  return (
    BigInt(
      buildings.reduce(
        (n, b) =>
          n +
          b.level *
            (b.type === 'city_hall' ? 2 : b.type === 'temple' ? 3 : b.type === 'town_hall' ? 4 : 1),
        0,
      ),
    ) *
    BigInt(speed) *
    1000n
  );
}
/** Umbral acumulado para ampliar un dominio de `currentVillages` aldeas. */
export function expansionThreshold(r: Ruleset, currentVillages: number): bigint {
  return BigInt(r.culture?.thresholdBase ?? 0) * BigInt(Math.max(1, currentVillages)) ** 2n * 1000n;
}
export function cultureSlots(r: Ruleset, castleLevel: number): number {
  return r.culture?.castleLevels.filter((n) => castleLevel >= n).length ?? 0;
}
