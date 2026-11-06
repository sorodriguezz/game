import { describe, it, expect } from 'vitest';
import { getRuleset } from '@reinos/game-config';
import { cultureRate, settleCulture, expansionThreshold, cultureSlots } from '../src/culture.js';
describe('cultura y expansión versionadas', () => {
  const r = getRuleset('frontier-alpha.4');
  it('conserva las fracciones al liquidar por partes', () => {
    const s = { amountMilli: 0n, remainder: 0n, rateMilliPerDay: 17000n, settledAt: 0 };
    let parts = s;
    for (let i = 1; i <= 137; i++) parts = settleCulture(parts, i * 733);
    expect(parts).toEqual(settleCulture(s, 137 * 733));
    expect(() => settleCulture(parts, 0)).toThrow();
  });
  it('no produce cultura retroactiva al mejorar y admite pausa', () => {
    const before = settleCulture(
      { amountMilli: 0n, remainder: 0n, rateMilliPerDay: 2000n, settledAt: 0 },
      86400000,
    );
    const after = settleCulture({ ...before, rateMilliPerDay: 4000n }, 2 * 86400000);
    expect(after.amountMilli).toBe(6000n);
    expect(settleCulture(after, after.settledAt)).toEqual(after);
  });
  it('tasa por edificio, umbral acumulado y cupos independientes de oasis', () => {
    expect(
      cultureRate(
        r,
        [
          { type: 'city_hall', level: 2, plot: 0 },
          { type: 'temple', level: 3, plot: 1 },
        ],
        5,
      ),
    ).toBe(65000n);
    expect([1, 2, 9].map((n) => expansionThreshold(r, n))).toEqual([500000n, 2000000n, 40500000n]);
    expect([0, 9, 10, 14, 15, 19, 20].map((n) => cultureSlots(r, n))).toEqual([
      0, 0, 1, 1, 2, 2, 3,
    ]);
    expect(getRuleset('frontier-alpha.3').culture).toBeUndefined();
  });
});
