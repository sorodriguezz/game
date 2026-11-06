import type { BuildingType } from '@reinos/game-config';
import { createPrng } from './prng.js';
/** Distribuciones de 18 campos; ponderación de generación propuesta y versionada. */
export const FIELD_DISTRIBUTIONS = [
  [4, 4, 4, 6],
  [3, 4, 5, 6],
  [4, 5, 3, 6],
  [5, 3, 4, 6],
  [3, 5, 4, 6],
  [5, 4, 3, 6],
  [4, 3, 5, 6],
  [3, 3, 3, 9],
  [1, 1, 1, 15],
] as const;
export function fieldDistribution(seed: number, x: number, y: number, balanced = false): number[] {
  const n = createPrng(`${seed}:${x}:${y}:fields-1`).nextInt(1000);
  return [
    ...FIELD_DISTRIBUTIONS[
      balanced || n < 700 ? 0 : n < 940 ? 1 + ((n - 700) % 6) : n < 990 ? 7 : 8
    ]!,
  ];
}
export function fieldTypes(distribution: readonly number[]): BuildingType[] {
  if (
    distribution.length !== 4 ||
    distribution.some((n) => !Number.isInteger(n) || n < 0) ||
    distribution.reduce((a, b) => a + b, 0) !== 18
  )
    throw new RangeError('La distribución debe tener 18 campos');
  return (['sawmill', 'quarry', 'mine', 'farm'] as const).flatMap((t, i) =>
    Array.from({ length: distribution[i]! }, () => t),
  );
}
