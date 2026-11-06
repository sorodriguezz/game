import { describe, expect, it } from 'vitest';
import { getRuleset } from '@reinos/game-config';
import {
  generateVillageLayout,
  validateVillageLayout,
  resolveBattle,
  distributeGarrison,
  wallRepairQuote,
  type BattleSnapshot,
} from '../src/index.js';

const r = getRuleset('frontier-alpha.2');
const snap = (): BattleSnapshot => ({
  battleId: 'battle',
  worldId: 'world',
  seed: 'seed',
  rulesetVersion: r.version,
  mission: 'ATTACK',
  attacker: {
    civilization: 'steppe_clans',
    units: [
      { unitType: 'militia', quantity: 1000 },
      { unitType: 'ram', quantity: 10 },
    ],
  },
  defender: {
    civilization: 'stone_wardens',
    units: [{ unitType: 'spearman', quantity: 90 }],
    doctrine: { reservePercent: 0, retreatThresholdPercent: null, deployment: 'BALANCED' },
  },
  defenses: { wallLevel: 0, bastionLevel: 0, hospitalLevel: 0 },
  terrain: { kind: 'PLAIN' },
  defenderResources: { wood: 100, stone: 100, iron: 100, food: 100 },
  fortifications: {
    walls: [3, 2, 1].map((precinct) => ({
      precinct: precinct as 1 | 2 | 3,
      level: 5,
      integrity: 1000,
    })),
    buildings: [{ plot: 1, type: 'castle', level: 5, precinct: 1 }],
  },
});

describe('URB-001..013: planos estables y solares reservados', () => {
  it('reproduce geometría, no solapa huellas máximas y encierra campos en cada semilla', () => {
    for (let seed = 0; seed < 100; seed++) {
      const input = {
        worldSeed: seed,
        x: seed + 1,
        y: seed * 3,
        civilization: 'stone_wardens' as const,
      };
      const layout = generateVillageLayout(r, input);
      expect(layout).toEqual(generateVillageLayout(r, input));
      expect(validateVillageLayout(layout)).toEqual([]);
      expect(layout.plots.filter((p) => p.kind === 'field')).toHaveLength(18);
      expect(layout.walls.map((w) => w.precinct)).toEqual([1, 2, 3]);
      expect(JSON.parse(JSON.stringify(layout))).toEqual(layout);
    }
  });
  it('cambia con coordenadas y civilización, conserva todos los identificadores', () => {
    const a = generateVillageLayout(r, { worldSeed: 7, x: 1, y: 2, civilization: 'stone_wardens' });
    const b = generateVillageLayout(r, { worldSeed: 7, x: 2, y: 2, civilization: 'forest_kin' });
    expect(a.plots).not.toEqual(b.plots);
    expect(a.plots.map((p) => p.id)).toEqual(b.plots.map((p) => p.id));
  });
});

describe('FORT-001..015: combate canónico escalonado', () => {
  it('reparte cada soldado exactamente una vez, incluso pilas pequeñas', () => {
    for (let n = 1; n < 100; n++) {
      const groups = distributeGarrison(r, [{ unitType: 'spearman', quantity: n }], 'CORE');
      expect(groups.flatMap((g) => g.units).reduce((s, u) => s + u.quantity, 0)).toBe(n);
      expect(
        groups.find((g) => g.precinct === 1)!.units.reduce((s, u) => s + u.quantity, 0),
      ).toBeGreaterThanOrEqual(Math.floor(n / 2));
    }
  });
  it('resuelve 3 → 2 → 1 una sola vez y conserva bajas/supervivientes', () => {
    const s = snap();
    const before = structuredClone(s);
    const result = resolveBattle(r, s);
    expect(s).toEqual(before);
    expect(result).toEqual(resolveBattle(r, structuredClone(s)));
    expect(result.precincts?.map((p) => p.precinct)).toEqual([3, 2, 1]);
    for (const sent of s.attacker.units) {
      const qty = (xs: { unitType: string; quantity: number }[]) =>
        xs.find((u) => u.unitType === sent.unitType)?.quantity ?? 0;
      expect(qty(result.attacker.lost) + qty(result.attacker.survivors)).toBe(sent.quantity);
    }
    expect(
      result.defender.killed.reduce((s, u) => s + u.quantity, 0) +
        result.defender.wounded.reduce((s, u) => s + u.quantity, 0) +
        result.defender.survivors.reduce((s, u) => s + u.quantity, 0),
    ).toBe(90);
    expect(result.precincts!.some((p) => p.wallDamage > 0)).toBe(true);
  });
  it('detenido fuera: sin botín, conquista ni daño al Castillo', () => {
    const s = snap();
    s.attacker.units = [
      { unitType: 'militia', quantity: 1 },
      { unitType: 'catapult', quantity: 1 },
    ];
    s.defender.units = [{ unitType: 'spearman', quantity: 10000 }];
    s.siegeTargetPlot = 1;
    const result = resolveBattle(r, s);
    expect(result.precincts).toHaveLength(1);
    expect(result.reachedPrecinct).toBe(3);
    expect(result.outcome).toBe('DEFENDER');
    expect(result.buildingDamage).toEqual([]);
    expect(Object.values(result.loot).reduce((s, n) => s + n, 0)).toBe(0);
  });
  it('saquea logística y se detiene antes del núcleo sin dañar fortificaciones', () => {
    const s = snap();
    s.mission = 'RAID';
    const result = resolveBattle(r, s);
    expect(result.precincts?.map((p) => p.precinct)).toEqual([3, 2]);
    expect(result.precincts?.every((p) => p.wallDamage === 0)).toBe(true);
    expect(result.buildingDamage).toEqual([]);
    expect(result.outcome).toBe('ATTACKER');
    expect(result.defender.survivors.length).toBeGreaterThan(0);
  });
  it('integridad cero elimina la bonificación sin borrar el nivel', () => {
    const a = snap();
    const b = structuredClone(a);
    b.fortifications!.walls[0]!.integrity = 0;
    expect(resolveBattle(r, a).precincts![0]!.wallBonusPermille).toBeGreaterThan(
      resolveBattle(r, b).precincts![0]!.wallBonusPermille,
    );
  });
  it('catapultas solo dañan objetivos vencidos y arietes sin escolta no ganan', () => {
    const a = snap();
    a.attacker.units.push({ unitType: 'catapult', quantity: 30 });
    a.siegeTargetPlot = 1;
    expect(resolveBattle(r, a).buildingDamage?.[0]?.plot).toBe(1);
    a.attacker.units = [{ unitType: 'ram', quantity: 10000 }];
    expect(resolveBattle(r, a).outcome).toBe('DEFENDER');
  });
  it('rechaza snapshot sin sus tres defensas y cotiza reparación según daño', () => {
    const s = snap();
    s.fortifications!.walls.pop();
    expect(() => resolveBattle(r, s)).toThrow();
    const q = wallRepairQuote(r, 'wall', 5, 500, 'stone_wardens', 2);
    expect(q.restoreIntegrity).toBe(500);
    expect(q.seconds).toBeGreaterThan(0);
    expect(q.cost.wood).toBeGreaterThan(0);
    expect(() => wallRepairQuote(r, 'wall', 5, 1000, 'stone_wardens', 2)).toThrow();
  });
});
