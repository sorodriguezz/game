import { describe, it, expect } from 'vitest';
import { getRuleset } from '@reinos/game-config';
import { merchantProfile, merchantsNeeded } from '../src/trade.js';
describe('mercaderes enteros y capacidad por civilización', () => {
  const r = getRuleset('frontier-alpha.4');
  it('mercado por niveles y oficina de comercio sin redondear mercaderes hacia abajo', () => {
    expect(merchantProfile(r, 'stone_wardens', 4, 2)).toEqual({
      total: 4,
      capacity: 600,
      speed: 16,
    });
    expect(merchantProfile(r, 'forest_kin', 3, 0)).toEqual({ total: 3, capacity: 750, speed: 24 });
    expect(merchantProfile(r, 'steppe_clans', 1, 0)).toEqual({
      total: 1,
      capacity: 1000,
      speed: 12,
    });
    expect(merchantsNeeded({ wood: 500, stone: 0, iron: 1, food: 0 }, 500)).toBe(2);
    expect(merchantsNeeded({ wood: 0, stone: 0, iron: 0, food: 0 }, 500)).toBe(0);
  });
  it('las reglas históricas no habilitan comercio y no admite carga negativa', () => {
    expect(merchantProfile(getRuleset('frontier-alpha.3'), 'stone_wardens', 20, 0)).toEqual({
      total: 0,
      capacity: 0,
      speed: 0,
    });
    expect(() => merchantsNeeded({ wood: -1, stone: 0, iron: 0, food: 0 }, 500)).toThrow();
  });
});
