import type { Ruleset } from '../types.js';
import { rulesetFrontierAlpha1 } from './frontier-alpha.1.js';

const r = structuredClone(rulesetFrontierAlpha1);
/** Propuesta 2.1: solo mundos nuevos. Identificadores internos compatibles con el arte terrestre. */
export const rulesetFrontierAlpha2: Ruleset = {
  ...r,
  version: 'frontier-alpha.2',
  fortifications: {
    layoutVersion: 'organic-1',
    deployment: { BALANCED: [340, 330, 330], OUTER: [600, 250, 150], CORE: [150, 300, 550] },
    maxWallBonusPermille: 1500,
    ramDamagePerUnit: 35,
    wallResistancePerLevel: 3,
    catapultsPerLevel: 12,
    preciseTargetRallyLevel: 3,
    repairCostPermille: 500,
    repairTimePermille: 500,
  },
  civilizations: r.civilizations.map((c) => ({
    ...c,
    modifiers: { ...c.modifiers, parallelFieldConstruction: c.id === 'stone_wardens' },
    name: c.id === 'stone_wardens' ? 'Romanos' : c.id === 'forest_kin' ? 'Galos' : 'Germanos',
    tagline:
      c.id === 'stone_wardens'
        ? 'Fortificaciones de piedra e infantería profesional.'
        : c.id === 'forest_kin'
          ? 'Empalizadas, defensa y movilidad.'
          : 'Terraplenes, incursiones y ejércitos numerosos.',
  })),
  cityLayout: {
    plots: r.cityLayout.plots.map((p) => {
      const precinct =
        p.id === 19
          ? 3
          : p.id === 20
            ? 2
            : p.id === 21
              ? 1
              : p.kind === 'field'
                ? 3
                : p.kind === 'industry'
                  ? 2
                  : 1;
      const radius =
        p.kind === 'fortification' ? ({ 1: 32, 2: 68, 3: 112 } as const)[precinct] : undefined;
      return { ...p, precinct, ...(radius ? { radius, x: 0, z: radius } : {}) };
    }),
  },
  units: r.units.map((u) =>
    u.type === 'ram' || u.type === 'catapult' ? { ...u, attack: 0, carry: 0 } : u,
  ),
};
