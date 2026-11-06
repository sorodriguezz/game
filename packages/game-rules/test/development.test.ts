import { describe, it, expect } from 'vitest';
import { getRuleset } from '@reinos/game-config';
import { developmentQuote, researchModifiers } from '../src/development.js';
import { resolveBattle, type BattleSnapshot } from '../src/battle.js';
describe('presupuestos de desarrollo y bonus por aldea', () => {
  const r = getRuleset('frontier-alpha.3');
  it('coste entero, velocidad económica y mejora máxima parametrizada', () => {
    const one = developmentQuote(r, 'WEAPON', 'militia', 1, 1),
      fast = developmentQuote(r, 'WEAPON', 'militia', 1, 5);
    expect(one.seconds).toBe(300);
    expect(fast.seconds).toBe(60);
    expect(fast.cost).toEqual(one.cost);
    expect(Object.values(one.cost).every(Number.isSafeInteger)).toBe(true);
    expect(() => developmentQuote(r, 'ARMOR', 'militia', 21, 1)).toThrow();
  });
  it('solo incorpora las mejoras completadas del tipo correspondiente', () => {
    expect(
      researchModifiers(r, [
        { unitType: 'militia', kind: 'UNLOCK', level: 1 },
        { unitType: 'militia', kind: 'WEAPON', level: 3 },
        { unitType: 'spearman', kind: 'ARMOR', level: 2 },
      ]),
    ).toEqual({
      militia: { attackPermille: 45, defensePermille: 0 },
      spearman: { attackPermille: 0, defensePermille: 30 },
    });
  });
  it('el snapshot conserva bonus y produce el mismo combate en cada ejecución', () => {
    const snapshot: BattleSnapshot = {
      battleId: 'research',
      worldId: 'world',
      seed: 'fixed',
      rulesetVersion: r.version,
      location: 'FIELD',
      mission: 'ATTACK',
      attacker: { civilization: 'stone_wardens', units: [{ unitType: 'militia', quantity: 200 }] },
      defender: {
        civilization: 'forest_kin',
        units: [{ unitType: 'spearman', quantity: 180 }],
        doctrine: { reservePercent: 0, retreatThresholdPercent: null },
      },
      defenses: { wallLevel: 0, bastionLevel: 0, hospitalLevel: 0 },
      terrain: { kind: 'PLAIN' },
      defenderResources: { wood: 0, stone: 0, iron: 0, food: 0 },
    };
    const base = resolveBattle(r, snapshot),
      upgraded = structuredClone(snapshot);
    upgraded.attacker.improvements = { militia: { attackPermille: 150, defensePermille: 0 } };
    const result = resolveBattle(r, upgraded);
    expect(result.powers.attack).toBeGreaterThan(base.powers.attack);
    expect(result).toEqual(resolveBattle(r, structuredClone(upgraded)));
    expect(resolveBattle(r, snapshot)).toEqual(base);
  });
});
