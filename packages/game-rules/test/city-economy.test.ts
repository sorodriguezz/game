import { describe, it, expect } from 'vitest';
import { getRuleset, validateRuleset } from '@reinos/game-config';
import {
  generateVillageLayout,
  validateVillageLayout,
  computeRates,
  inhabitantsOf,
  storageCapacity,
  settle,
  credit,
  fieldDistribution,
  fieldTypes,
  oasisBonuses,
  oasisSlots,
  oasisEligibility,
  type ResourceState,
} from '../src/index.js';
describe('partidas nuevas: ciudad orgánica', () => {
  it('solo centro urbano y planos accesibles para todos los solares en 100 semillas', () => {
    const r = validateRuleset(getRuleset('frontier-alpha.3'));
    expect(r.startingBuildings).toEqual([{ plot: 0, type: 'city_hall', level: 1 }]);
    for (let seed = 0; seed < 100; seed++) {
      const input = {
          worldSeed: seed,
          x: seed * 3,
          y: seed * 7,
          civilization: 'stone_wardens' as const,
        },
        a = generateVillageLayout(r, input);
      expect(validateVillageLayout(a)).toEqual([]);
      expect(a).toEqual(generateVillageLayout(r, input));
      expect(a.plots).toHaveLength(52);
      expect(a.roads.some((s) => s.id.startsWith('circunvalacion'))).toBe(false);
    }
  });
});
describe('habitantes, cereal, depósitos y oasis', () => {
  const r = getRuleset('frontier-alpha.3');
  it('campos 0 producen; habitantes y tropas descuentan cereal sin acelerar el consumo', () => {
    const buildings = r.startingBuildings;
    expect(inhabitantsOf(r, buildings)).toBe(2);
    expect(computeRates(r, buildings, 0, 1)).toEqual({
      wood: 8000n,
      stone: 8000n,
      iron: 8000n,
      food: 10000n,
    });
    expect(computeRates(r, buildings, 7, 5).food).toBe(51000n);
    const next = [...buildings, { plot: 22, type: 'sawmill' as const, level: 1 }];
    expect(inhabitantsOf(r, next)).toBe(4);
    expect(computeRates(r, next, 0, 1).food).toBe(8000n);
  });
  it('almacenes múltiples suman sin alterar la capacidad del granero', () => {
    const buildings = [
      { type: 'warehouse' as const, level: 2 },
      { type: 'warehouse' as const, level: 1 },
      { type: 'granary' as const, level: 1 },
    ];
    expect(storageCapacity(r, buildings, 'warehouse')).toBeGreaterThan(
      storageCapacity(r, buildings, 'granary'),
    );
    const s: ResourceState = {
      amounts: { wood: 0n, stone: 0n, iron: 0n, food: 0n },
      rates: { wood: 2000n, stone: 2000n, iron: 2000n, food: 2000n },
      remainders: { wood: 0n, stone: 0n, iron: 0n, food: 0n },
      capacity: 1000n,
      foodCapacity: 500n,
      lastSettledAt: 0,
    };
    expect(settle(s, 3600000).amounts).toEqual({
      wood: 1000n,
      stone: 1000n,
      iron: 1000n,
      food: 500n,
    });
    expect(credit(s, s.rates).credited.food).toBe(500n);
  });
  it('distribuciones válidas, mayoritariamente 4–4–4–6, incluye 9 y 15 cerealeras', () => {
    const variants = new Set<string>();
    let normal = 0;
    for (let n = 0; n < 2000; n++) {
      const d = fieldDistribution(42, n, n * 2);
      expect(fieldTypes(d)).toHaveLength(18);
      variants.add(d.join('-'));
      if (d.join('-') === '4-4-4-6') normal++;
    }
    expect(normal).toBeGreaterThan(1200);
    expect(variants.has('3-3-3-9')).toBe(true);
    expect(variants.has('1-1-1-15')).toBe(true);
    expect(fieldDistribution(1, 7, 8, true)).toEqual([4, 4, 4, 6]);
    expect(() => fieldTypes([3, 4, 5, 7])).toThrow();
  });
  it('Tesoro exacto 10/15/20 y rango inclusivo 5×5 por aldea', () => {
    expect([0, 9, 10, 14, 15, 19, 20].map((n) => oasisSlots(r, n))).toEqual([0, 0, 1, 1, 2, 2, 3]);
    expect(oasisEligibility(r, { x: 0, y: 0 }, { x: -2, y: 2 }, 10, 0)).toBeNull();
    expect(oasisEligibility(r, { x: 0, y: 0 }, { x: 3, y: 0 }, 20, 0)).not.toBeNull();
    expect(oasisEligibility(r, { x: 0, y: 0 }, { x: 0, y: 2 }, 20, 3)).not.toBeNull();
  });
  it('bonus de una o dos materias, 50% exclusivamente en oasis de cereal único', () => {
    const variants = new Set<string>();
    for (let n = 0; n < 200; n++) {
      const b = oasisBonuses(55, n, n + 3),
        pairs = Object.entries(b);
      expect([1, 2]).toContain(pairs.length);
      for (const [resource, value] of pairs) {
        expect([250, 500]).toContain(value);
        if (value === 500) {
          expect(resource).toBe('food');
          expect(pairs).toHaveLength(1);
        }
      }
      variants.add(JSON.stringify(b));
      expect(b).toEqual(oasisBonuses(55, n, n + 3));
    }
    expect(variants.size).toBe(11);
  });
});
