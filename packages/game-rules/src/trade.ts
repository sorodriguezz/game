import type { Ruleset, CivilizationId, ResourceBundle } from '@reinos/game-config';
export function merchantProfile(
  r: Ruleset,
  civ: CivilizationId,
  marketLevel: number,
  officeLevel: number,
) {
  if (!r.trade) return { total: 0, capacity: 0, speed: 0 };
  const key = civ === 'forest_kin' ? 'gauls' : civ === 'steppe_clans' ? 'teutons' : 'romans',
    base = r.trade.merchants[key];
  return {
    total: marketLevel,
    capacity: Math.floor(
      (base.capacity * (1000 + officeLevel * r.trade.officeCapacityPermillePerLevel)) / 1000,
    ),
    speed: base.speed,
  };
}
export function merchantsNeeded(cargo: ResourceBundle, capacity: number): number {
  const quantities = Object.values(cargo);
  if (quantities.some((n) => !Number.isSafeInteger(n) || n < 0))
    throw new RangeError('Carga comercial inválida');
  const total = quantities.reduce((s, n) => s + n, 0);
  if (!total) return 0;
  if (!Number.isSafeInteger(capacity) || capacity <= 0)
    throw new RangeError('Capacidad comercial inválida');
  return Math.ceil(total / capacity);
}
