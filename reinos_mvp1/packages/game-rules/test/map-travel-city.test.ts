import { describe, expect, it } from 'vitest';
import { DEFAULT_RULESET_VERSION, getRuleset } from '@reinos/game-config';
import {
  createPrng,
  distanceMilli,
  isCoastal,
  isSettleable,
  renderRegion,
  slowestSpeed,
  spawnCandidates,
  terrainAt,
  travelSeconds,
  validateConstruction,
  validateRecruitment,
  visualStage,
} from '../src/index.js';

const r = getRuleset(DEFAULT_RULESET_VERSION);
const SEED = 20261103;

describe('PRNG sembrado', () => {
  it('misma semilla ⇒ misma secuencia; semillas distintas ⇒ secuencias distintas', () => {
    const a = createPrng('x');
    const b = createPrng('x');
    const c = createPrng('y');
    const sa = Array.from({ length: 20 }, () => a.nextUint32());
    expect(Array.from({ length: 20 }, () => b.nextUint32())).toEqual(sa);
    expect(Array.from({ length: 20 }, () => c.nextUint32())).not.toEqual(sa);
  });

  it('nextInt está en rango', () => {
    const p = createPrng('rango');
    for (let i = 0; i < 1000; i++) {
      const v = p.nextInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
});

describe('mapa determinista', () => {
  it('genera el mismo terreno para la misma semilla', () => {
    expect(renderRegion(SEED, 128, 10, 10, 30, 30)).toEqual(renderRegion(SEED, 128, 10, 10, 30, 30));
  });

  it('tiene mar, tierra y bordes de mar con proporciones razonables', () => {
    const reg = renderRegion(SEED, 128, 0, 0, 128, 128);
    const sea = [...reg.tiles].filter((c) => c === 'S').length / reg.tiles.length;
    expect(sea).toBeGreaterThan(0.2);
    expect(sea).toBeLessThan(0.75);
    expect(terrainAt(SEED, 128, 0, 0)).toBe('SEA');
    expect(terrainAt(SEED, 128, -1, 5)).toBe('SEA');
    expect(reg.tiles).toMatch(/F/);
    expect(reg.tiles).toMatch(/M/);
  });

  it('las costas son tierra adyacente a mar', () => {
    let found = 0;
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++)
        if (isCoastal(SEED, 128, x, y)) {
          found++;
          expect(terrainAt(SEED, 128, x, y)).not.toBe('SEA');
        }
    expect(found).toBeGreaterThan(20);
  });

  it('los candidatos de aparición son deterministas y habitables', () => {
    const a = spawnCandidates(SEED, 128, 3, 10);
    expect(spawnCandidates(SEED, 128, 3, 10)).toEqual(a);
    expect(a.length).toBe(10);
    for (const p of a) expect(isSettleable(terrainAt(SEED, 128, p.x, p.y))).toBe(true);
  });
});

describe('viaje', () => {
  it('distancia exacta en milésimas y ETA según la unidad más lenta', () => {
    expect(distanceMilli({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5000n);
    const speed = slowestSpeed(r, [
      { unitType: 'cavalry', quantity: 1 },
      { unitType: 'militia', quantity: 1 },
    ]);
    expect(speed).toBe(4);
    // 5 casillas a 4 c/h = 1.25 h = 4500 s; ×10 velocidad ⇒ 450 s
    expect(travelSeconds(5000n, speed, 1)).toBe(4500);
    expect(travelSeconds(5000n, speed, 10)).toBe(450);
  });
});

describe('validación de ciudad (servidor autoritativo)', () => {
  const base = [
    { plot: 0, type: 'city_hall' as const, level: 1 },
    { plot: 2, type: 'warehouse' as const, level: 1 },
  ];

  it('permite mejorar un edificio existente', () => {
    const res = validateConstruction(r, { civilization: 'imperial_crown', coastal: false, buildings: base, plot: 2, type: 'warehouse' });
    expect(res).toEqual({ ok: true, value: { targetLevel: 2 } });
  });

  it('rechaza parcela ocupada por otro tipo, tipo duplicado y tipo de parcela incorrecto', () => {
    expect(validateConstruction(r, { civilization: 'imperial_crown', coastal: false, buildings: base, plot: 2, type: 'farm' })).toMatchObject({ ok: false, code: 'PLOT_OCCUPIED' });
    expect(validateConstruction(r, { civilization: 'imperial_crown', coastal: false, buildings: base, plot: 3, type: 'warehouse' })).toMatchObject({ ok: false, code: 'BUILDING_ALREADY_EXISTS' });
    expect(validateConstruction(r, { civilization: 'imperial_crown', coastal: false, buildings: base, plot: 0, type: 'farm' })).toMatchObject({ ok: false, code: 'PLOT_KIND_MISMATCH' });
    expect(validateConstruction(r, { civilization: 'imperial_crown', coastal: false, buildings: base, plot: 99, type: 'farm' })).toMatchObject({ ok: false, code: 'PLOT_NOT_FOUND' });
  });

  it('puerto solo en aldea costera y edificio único solo para su civilización', () => {
    const lvl2 = [{ plot: 0, type: 'city_hall' as const, level: 5 }, { plot: 1, type: 'port' as const, level: 3 }];
    expect(validateConstruction(r, { civilization: 'sea_league', coastal: false, buildings: lvl2, plot: 12, type: 'port' })).toMatchObject({ ok: false });
    expect(validateConstruction(r, { civilization: 'sea_league', coastal: false, buildings: [{ plot: 0, type: 'city_hall', level: 2 }], plot: 12, type: 'port' })).toMatchObject({ ok: false, code: 'NOT_COASTAL' });
    expect(validateConstruction(r, { civilization: 'imperial_crown', coastal: true, buildings: base, plot: 4, type: 'naval_arsenal' })).toMatchObject({ ok: false, code: 'CIVILIZATION_RESTRICTED' });
  });

  it('respeta requisitos', () => {
    expect(validateConstruction(r, { civilization: 'imperial_crown', coastal: false, buildings: base, plot: 4, type: 'temple' })).toMatchObject({ ok: false, code: 'REQUIREMENTS_NOT_MET' });
  });

  it('reclutamiento exige edificio y requisitos', () => {
    expect(validateRecruitment(r, { civilization: 'imperial_crown', buildings: base, unitType: 'militia' })).toMatchObject({ ok: false, code: 'TRAINING_BUILDING_MISSING' });
    const withBarracks = [...base, { plot: 3, type: 'barracks' as const, level: 1 }];
    expect(validateRecruitment(r, { civilization: 'imperial_crown', buildings: withBarracks, unitType: 'militia' })).toMatchObject({ ok: true });
    expect(validateRecruitment(r, { civilization: 'imperial_crown', buildings: withBarracks, unitType: 'cavalry' })).toMatchObject({ ok: false, code: 'UNIT_NOT_AVAILABLE' });
    expect(validateRecruitment(r, { civilization: 'imperial_crown', buildings: withBarracks, unitType: 'naval_escort' })).toMatchObject({ ok: false, code: 'CIVILIZATION_RESTRICTED' });
  });

  it('etapas visuales 1–3', () => {
    expect([1, 3, 4, 7, 8, 20].map(visualStage)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});
