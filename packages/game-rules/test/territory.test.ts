import { describe, expect, it } from 'vitest';
import { getRuleset, validateRuleset } from '@reinos/game-config';
import { terrainAt, renderRegion } from '../src/map.js';
import { encounterAt } from '../src/territory.js';
import { resolveBattle, type BattleSnapshot } from '../src/battle.js';
import { computeRates } from '../src/economy.js';
import { validateConstruction, validateRecruitment } from '../src/city.js';

describe('frontier-alpha.1', () => {
  it('versiona tres razas, 18 campos y tres murallas sin alterar M1', () => {
    const r = validateRuleset(getRuleset('frontier-alpha.1'));
    expect(r.civilizations).toHaveLength(3);
    expect(r.cityLayout.plots.filter((p) => p.kind === 'field')).toHaveLength(18);
    expect(r.cityLayout.plots.filter((p) => p.kind === 'fortification')).toHaveLength(3);
    expect(getRuleset('mvp1-alpha.0').civilizations).toHaveLength(2);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) expect(terrainAt(777, 64, x, y, 'LAND')).not.toBe('SEA');
    expect(renderRegion(777, 64, 0, 0, 64, 64, 'LAND').tiles).not.toContain('S');
  });
  it('campos repetidos producen por separado y la industria bonifica el recurso correcto', () => {
    const r = getRuleset('frontier-alpha.1');
    const base = computeRates(
      r,
      [
        { type: 'sawmill', level: 1 },
        { type: 'sawmill', level: 2 },
      ],
      0,
    );
    const boosted = computeRates(
      r,
      [
        { type: 'sawmill', level: 1 },
        { type: 'sawmill', level: 2 },
        { type: 'lumber_mill', level: 3 },
      ],
      0,
    );
    expect(boosted.wood).toBe((base.wood * 1150n) / 1000n);
    expect(boosted.food).toBe(base.food);
    const plot = r.cityLayout.plots.find(
      (p) => p.kind === 'field' && p.allowedTypes?.includes('mine'),
    )!;
    expect(
      validateConstruction(r, {
        civilization: 'stone_wardens',
        coastal: false,
        buildings: [],
        plot: plot.id,
        type: 'farm',
      }).ok,
    ).toBe(false);
  });
});
describe('encuentros espacio-temporales', () => {
  const a = { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, departedAt: 0, arrivesAt: 10000 };
  it('dos ejércitos coincidentes se interceptan una sola vez en el instante medio', () => {
    expect(
      encounterAt(
        a,
        { from: { x: 10, y: 0 }, to: { x: 0, y: 0 }, departedAt: 0, arrivesAt: 10000 },
        0,
      ),
    ).toEqual({ at: 5000, x: 5, y: 0 });
  });
  it('dos rutas que cruzan a horas diferentes no combaten', () => {
    expect(
      encounterAt(
        a,
        { from: { x: 5, y: -5 }, to: { x: 5, y: 5 }, departedAt: 8000, arrivesAt: 18000 },
        0,
      ),
    ).toBeNull();
  });
  it('no programa colisiones fuera de los trayectos ni anteriores a now', () => {
    expect(encounterAt(a, { ...a, departedAt: 11000, arrivesAt: 21000 }, 0)).toBeNull();
    expect(
      encounterAt(
        a,
        { from: { x: 10, y: 0 }, to: { x: 0, y: 0 }, departedAt: 0, arrivesAt: 10000 },
        6000,
      ),
    ).toBeNull();
  });
});

it('las trampas conservan tropas y se reproducen desde el snapshot sin mutarlo', () => {
  const r = getRuleset('frontier-alpha.1');
  const snapshot: BattleSnapshot = {
    battleId: 'battle',
    worldId: 'world',
    rulesetVersion: r.version,
    seed: 'traps',
    mission: 'ATTACK',
    attacker: { civilization: 'steppe_clans', units: [{ unitType: 'militia', quantity: 20 }] },
    defender: {
      civilization: 'forest_kin',
      units: [{ unitType: 'spearman', quantity: 5 }],
      doctrine: { reservePercent: 0, retreatThresholdPercent: null },
    },
    defenses: { wallLevel: 0, bastionLevel: 0, hospitalLevel: 0, traps: 6 },
    terrain: { kind: 'PLAIN' },
    defenderResources: { wood: 0, stone: 0, iron: 0, food: 0 },
  };
  const original = structuredClone(snapshot),
    result = resolveBattle(r, snapshot);
  expect(result).toEqual(resolveBattle(r, snapshot));
  expect(snapshot).toEqual(original);
  expect(result.trapsUsed).toBe(6);
  expect(
    result.attacker.lost.reduce((sum, s) => sum + s.quantity, 0) +
      result.attacker.survivors.reduce((sum, s) => sum + s.quantity, 0),
  ).toBe(20);
});

it('el catálogo ampliado no habilita edificios ni tropas en versiones anteriores', () => {
  const old = getRuleset('mvp1-alpha.0');
  expect(
    validateRecruitment(old, {
      civilization: 'imperial_crown',
      buildings: [],
      unitType: 'settler',
    }),
  ).toMatchObject({ ok: false, code: 'UNIT_NOT_AVAILABLE' });
  expect(
    validateConstruction(old, {
      civilization: 'imperial_crown',
      coastal: false,
      buildings: [],
      plot: 0,
      type: 'castle',
    }).ok,
  ).toBe(false);
});
