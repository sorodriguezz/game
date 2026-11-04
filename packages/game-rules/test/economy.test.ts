import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULESET_VERSION, getRuleset } from '@reinos/game-config';
import {
  MILLI,
  MS_PER_HOUR,
  bundleToMilli,
  buildingCost,
  buildingSeconds,
  capacityMilli,
  computeRates,
  credit,
  debit,
  isStarving,
  mapResources,
  productionMilliPerHour,
  settle,
  type ResourceState,
} from '../src/index.js';

const r = getRuleset(DEFAULT_RULESET_VERSION);

function state(partial: Partial<ResourceState> = {}): ResourceState {
  return {
    amounts: mapResources(() => 100n * MILLI),
    remainders: mapResources(() => 0n),
    rates: mapResources(() => 3600n * MILLI),
    capacity: 1_000_000n * MILLI,
    lastSettledAt: 0,
    ...partial,
  };
}

describe('liquidación económica (ADR-0004)', () => {
  it('produce exactamente tasa × tiempo con enteros', () => {
    // 3600 u/h = 1 u/s ⇒ 90 s = 90 u
    const s = settle(state(), 90_000);
    expect(s.amounts.wood).toBe(190n * MILLI);
    expect(s.remainders.wood).toBe(0n);
  });

  it('acumula restos fraccionarios sin perder producción', () => {
    // 1 milésima por hora: hace falta una hora completa para ganar 1 milésima.
    let s = state({ rates: mapResources(() => 1n) });
    for (let i = 0; i < 3600; i++) s = settle(s, (i + 1) * 1000);
    expect(s.amounts.wood).toBe(100n * MILLI + 1n);
    expect(s.remainders.wood).toBe(0n);
  });

  it('es monótona: no retrocede el reloj', () => {
    const s1 = settle(state(), 10_000);
    expect(settle(s1, 5_000)).toBe(s1);
  });

  it('propiedad: liquidar en tramos == liquidar de una vez (tasas fijas)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 10_000_000 }), { minLength: 1, maxLength: 12 }),
        fc.bigInt({ min: -50_000_000n, max: 50_000_000n }),
        fc.bigInt({ min: 0n, max: 5_000_000n }),
        fc.bigInt({ min: 0n, max: MS_PER_HOUR - 1n }),
        (steps, rate, start, rem) => {
          const base = state({
            amounts: mapResources(() => start),
            remainders: mapResources(() => rem),
            rates: mapResources(() => rate),
            capacity: 3_000_000n,
          });
          const times = [...steps].sort((a, b) => a - b);
          let s = base;
          for (const t of times) s = settle(s, t);
          const once = settle(base, times[times.length - 1]!);
          expect(s.amounts).toEqual(once.amounts);
          expect(s.remainders).toEqual(once.remainders);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('propiedad: nunca saldo negativo ni producción por encima de la capacidad', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e9 }),
        fc.bigInt({ min: -10_000_000n, max: 10_000_000n }),
        (elapsed, rate) => {
          const s = settle(
            state({ rates: mapResources(() => rate), capacity: 500n * MILLI }),
            elapsed,
          );
          for (const v of Object.values(s.amounts)) {
            expect(v >= 0n).toBe(true);
            expect(v <= 500n * MILLI).toBe(true);
          }
        },
      ),
    );
  });

  it('cambio de tasa a mitad del período conserva el recurso exacto (caso PRD §25.11)', () => {
    // 0–30 min a 1000 u/h, 30–90 min a 2500 u/h
    const s0 = state({ amounts: mapResources(() => 0n), rates: mapResources(() => 1000n * MILLI) });
    const s1 = settle(s0, 30 * 60_000);
    const s2 = settle({ ...s1, rates: mapResources(() => 2500n * MILLI) }, 90 * 60_000);
    expect(s2.amounts.iron).toBe((500n + 2500n) * MILLI);
  });

  it('alimentos con consumo neto negativo se agotan en cero y marcan hambruna', () => {
    const s = settle(
      state({
        amounts: mapResources(() => 10n * MILLI),
        rates: { ...mapResources(() => 0n), food: -3600n * MILLI },
      }),
      3_600_000,
    );
    expect(s.amounts.food).toBe(0n);
    expect(isStarving(s)).toBe(true);
  });

  it('débito rechaza saldo insuficiente y crédito respeta la capacidad', () => {
    const s = state({ capacity: 150n * MILLI });
    expect(() =>
      debit(
        s,
        mapResources(() => 101n * MILLI),
      ),
    ).toThrow();
    const after = debit(
      s,
      mapResources(() => 100n * MILLI),
    );
    expect(after.amounts.food).toBe(0n);
    const c = credit(
      s,
      mapResources(() => 80n * MILLI),
    );
    expect(c.state.amounts.wood).toBe(150n * MILLI);
    expect(c.credited.wood).toBe(50n * MILLI);
  });
});

describe('fórmulas del ruleset', () => {
  it('coste por nivel = ceil(base × 1.25^(nivel−1)) exacto', () => {
    expect(buildingCost(r, 'farm', 1, 'imperial_crown')).toEqual({
      wood: 60,
      stone: 30,
      iron: 15,
      food: 0,
    });
    // 60 × 1.25^2 = 93.75 → 94
    expect(buildingCost(r, 'farm', 3, 'imperial_crown').wood).toBe(94);
  });

  it('la muralla de la Liga cuesta más (contrapartida de civilización)', () => {
    const imp = buildingCost(r, 'wall', 1, 'imperial_crown');
    const sea = buildingCost(r, 'wall', 1, 'sea_league');
    expect(sea.stone).toBeGreaterThan(imp.stone);
  });

  it('tiempo de construcción escala con la velocidad del mundo', () => {
    expect(buildingSeconds(r, 'farm', 1, 1)).toBe(180);
    expect(buildingSeconds(r, 'farm', 1, 10)).toBe(18);
  });

  it('producción por nivel crece y la capacidad de almacén también', () => {
    expect(productionMilliPerHour(r, 1)).toBe(40n * MILLI);
    expect(productionMilliPerHour(r, 2) > productionMilliPerHour(r, 1)).toBe(true);
    expect(capacityMilli(r, 0)).toBe(1000n * MILLI);
    expect(capacityMilli(r, 2) > capacityMilli(r, 1)).toBe(true);
  });

  it('tasas: base + edificios productores − mantenimiento en alimentos', () => {
    const rates = computeRates(
      r,
      [
        { type: 'farm', level: 1 },
        { type: 'sawmill', level: 2 },
      ],
      10,
    );
    expect(rates.food).toBe((5n + 40n - 10n) * MILLI);
    expect(rates.wood).toBe(5n * MILLI + productionMilliPerHour(r, 2));
    expect(rates.stone).toBe(5n * MILLI);
  });

  it('bundleToMilli convierte unidades enteras a milésimas', () => {
    expect(bundleToMilli({ wood: 1, stone: 2, iron: 3, food: 4 }).iron).toBe(3000n);
  });
});
