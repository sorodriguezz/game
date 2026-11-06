import { unitDef, type Ruleset, type UnitType } from '@reinos/game-config';
export type ResearchRecord = { unitType: UnitType; kind: string; level: number };
export type CombatModifiers = Partial<
  Record<UnitType, { attackPermille: number; defensePermille: number }>
>;
export function researchModifiers(r: Ruleset, rows: readonly ResearchRecord[]): CombatModifiers {
  const out: CombatModifiers = {};
  for (const row of rows) {
    if (!['WEAPON', 'ARMOR'].includes(row.kind)) continue;
    const v = out[row.unitType] ?? { attackPermille: 0, defensePermille: 0 };
    if (row.kind === 'WEAPON')
      v.attackPermille = row.level * (r.development?.smithyBonusPermille ?? 0);
    else v.defensePermille = row.level * (r.development?.smithyBonusPermille ?? 0);
    out[row.unitType] = v;
  }
  return out;
}
export function developmentQuote(
  r: Ruleset,
  kind: 'UNLOCK' | 'WEAPON' | 'ARMOR',
  unitType: UnitType,
  level: number,
  speed: number,
) {
  const config = r.development;
  if (
    !config ||
    !Number.isSafeInteger(level) ||
    level < 1 ||
    level > (kind === 'UNLOCK' ? 1 : config.maxSmithyLevel) ||
    !Number.isSafeInteger(speed) ||
    speed < 1
  )
    throw new RangeError('Nivel de investigación inválido');
  const unit = unitDef(r, unitType),
    factor = kind === 'UNLOCK' ? 3 : level + 1;
  return {
    cost: {
      wood: unit.cost.wood * factor,
      stone: unit.cost.stone * factor,
      iron: unit.cost.iron * factor,
      food: unit.cost.food * factor,
    },
    seconds: Math.max(1, Math.ceil((config.researchBaseSeconds * level) / speed)),
  };
}
