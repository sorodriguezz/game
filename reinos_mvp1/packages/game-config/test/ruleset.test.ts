import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULESET_VERSION,
  getRuleset,
  listRulesetVersions,
  validateRuleset,
  UnknownRulesetError,
} from '../src/index.js';

describe('rulesets versionados', () => {
  it('el ruleset por defecto es válido estructural y semánticamente', () => {
    const r = getRuleset(DEFAULT_RULESET_VERSION);
    expect(() => validateRuleset(r)).not.toThrow();
    expect(r.status).toBe('PROPOSAL');
  });

  it('todos los rulesets registrados son válidos', () => {
    for (const v of listRulesetVersions())
      expect(() => validateRuleset(getRuleset(v))).not.toThrow();
  });

  it('rechaza versiones desconocidas', () => {
    expect(() => getRuleset('no-existe')).toThrow(UnknownRulesetError);
  });

  it('los rulesets están congelados (no se mutan en caliente)', () => {
    const r = getRuleset(DEFAULT_RULESET_VERSION);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('detecta un requisito circular/inexistente', () => {
    const r = structuredClone(getRuleset(DEFAULT_RULESET_VERSION));
    r.buildings[0]!.requires.push({ building: r.buildings[0]!.type, level: 1 });
    expect(() => validateRuleset(r)).toThrow(/se requiere a sí mismo/);
  });

  it('cada civilización tiene exactamente su edificio y unidad únicos', () => {
    const r = getRuleset(DEFAULT_RULESET_VERSION);
    expect(r.civilizations).toHaveLength(2);
    for (const c of r.civilizations) {
      expect(r.buildings.filter((b) => b.civilization === c.id).map((b) => b.type)).toEqual([
        c.uniqueBuilding,
      ]);
      expect(r.units.filter((u) => u.civilization === c.id).map((u) => u.type)).toEqual([
        c.uniqueUnit,
      ]);
    }
  });

  it('no existen héroes ni unidades con progresión personal (ADR-0012)', () => {
    const r = getRuleset(DEFAULT_RULESET_VERSION);
    expect(r.units.map((u) => u.type).join(',')).not.toMatch(/hero|heroe|héroe/i);
  });
});
