import { describe, it, expect } from 'vitest';
import { starvationDueAt, starvationBudget, settle, type ResourceState } from '../src/index.js';
describe('hambre por tiempo autoritativo', () => {
  const state: ResourceState = {
    amounts: { wood: 0n, stone: 0n, iron: 0n, food: 1000n },
    rates: { wood: 0n, stone: 0n, iron: 0n, food: -1000n },
    remainders: { wood: 0n, stone: 0n, iron: 0n, food: 0n },
    capacity: 800000n,
    lastSettledAt: 0,
  };
  it('misma fecha al liquidar por tramos, sin posponer por acciones con cereal agotado', () => {
    const due = starvationDueAt(state, null, 60, true)!;
    expect(starvationDueAt(settle(state, 120000), due, 60, true)).toBe(due);
    expect(settle(state, due - 60001).amounts.food).toBe(1n);
    expect(settle(state, due - 60000).amounts.food).toBe(0n);
    const empty = settle(state, due - 30000);
    expect(starvationDueAt(empty, due, 60, true)).toBe(due);
    expect(starvationDueAt(settle(state, due), due, 60, true)).toBe(due + 60000);
  });
  it('no agenda hambre sin consumo o tropas y el lote crece con el déficit', () => {
    expect(starvationDueAt(state, null, 60, false)).toBeNull();
    expect(
      starvationDueAt({ ...state, rates: { ...state.rates, food: 1n } }, null, 60, true),
    ).toBeNull();
    expect(starvationBudget(-6000000n, 60)).toBe(100);
    expect(starvationBudget(-1n, 60)).toBe(1);
  });
});
