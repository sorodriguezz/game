import type { ResourceKey, Ruleset } from '@reinos/game-config';
import { createPrng } from './prng.js';
export function oasisBonuses(
  seed: number,
  x: number,
  y: number,
): Partial<Record<ResourceKey, number>> {
  const types: Partial<Record<ResourceKey, number>>[] = [
    { wood: 250 },
    { stone: 250 },
    { iron: 250 },
    { food: 250 },
    { wood: 250, food: 250 },
    { stone: 250, food: 250 },
    { iron: 250, food: 250 },
    { wood: 250, stone: 250 },
    { wood: 250, iron: 250 },
    { stone: 250, iron: 250 },
    { food: 500 },
  ];
  return { ...types[createPrng(`${seed}:${x}:${y}:oasis-1`).nextInt(types.length)]! };
}
export function oasisSlots(r: Ruleset, treasuryLevel: number): number {
  return r.territory?.oasisConquest
    ? r.territory.oasisConquest.treasuryLevels.filter((n) => treasuryLevel >= n).length
    : (r.territory?.maxOasesPerVillage ?? 0);
}
export function oasisEligibility(
  r: Ruleset,
  origin: { x: number; y: number },
  target: { x: number; y: number },
  treasuryLevel: number,
  owned: number,
): string | null {
  const config = r.territory?.oasisConquest;
  if (
    config &&
    Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y)) > config.radius
  )
    return 'El oasis debe estar dentro del 5×5 de esta aldea';
  const slots = oasisSlots(r, treasuryLevel);
  if (owned >= slots)
    return config
      ? `Tesoro insuficiente o cupos ocupados: niveles 10, 15 y 20 permiten 1, 2 y 3 oasis (${owned}/${slots})`
      : 'Límite de oasis alcanzado';
  return null;
}
