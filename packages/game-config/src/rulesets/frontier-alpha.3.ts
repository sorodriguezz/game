import { rulesetFrontierAlpha2 as old } from './frontier-alpha.2.js';
import type { Ruleset, BuildingDef } from '../types.js';
const b = (
  type: BuildingDef['type'],
  name: string,
  effect: BuildingDef['effect'],
  extra: Partial<BuildingDef> = {},
): BuildingDef => ({
  type,
  name,
  description: name,
  maxLevel: 20,
  baseCost: { wood: 80, stone: 70, iron: 60, food: 30 },
  baseSeconds: 300,
  plotKind: 'industry',
  effect,
  requires: [],
  ...extra,
});
const population = (type: string, max: number) =>
  Array.from({ length: max + 1 }, (_, level) =>
    level === 0
      ? 0
      : type === 'farm'
        ? Math.max(0, level - 1)
        : Math.ceil((type === 'city_hall' ? 2 : 2) * level * (1 + Math.floor(level / 5) * 0.25)),
  );
/** Nueva partida: únicamente Centro Urbano; campos nivel 0 y economía por cereal. */
export const rulesetFrontierAlpha3: Ruleset = {
  ...structuredClone(old),
  version: 'frontier-alpha.3',
  fortifications: { ...old.fortifications!, layoutVersion: 'organic-2' },
  development: {
    version: 'development-1',
    researchBaseSeconds: 300,
    smithyBonusPermille: 15,
    maxSmithyLevel: 20,
    demolitionBaseSeconds: 120,
  },
  units: old.units.map((u) => ({
    ...u,
    researchRequired: !u.npcOnly && !['militia', 'spearman', 'settler'].includes(u.type),
  })),
  territory: {
    ...old.territory!,
    oasisConquest: { radius: 2, treasuryLevels: [10, 15, 20] },
    npcRegeneration: { oasisSeconds: 1800, villageSeconds: 3600, oasisLoyaltyPerAttack: 25 },
  },
  economy: {
    ...old.economy,
    startingResources: { wood: 750, stone: 750, iron: 750, food: 750 },
    baseCapacity: 800,
    villageBaseProductionPerHour: 0,
    cropPopulation: true,
    starvationIntervalSeconds: 60,
    fieldProductionByLevel: [
      2, 5, 9, 15, 22, 33, 50, 70, 100, 145, 200, 280, 375, 495, 635, 800, 1000, 1300, 1600, 2000,
      2450,
    ],
  },
  startingBuildings: [{ plot: 0, type: 'city_hall', level: 1 }],
  buildings: [
    ...old.buildings,
    b('treasury', 'Tesoro', 'administration', {
      plotKind: 'citadel',
      description: 'Desbloquea 1, 2 y 3 oasis de esta aldea a niveles 10, 15 y 20.',
    }),
    b('granary', 'Granero', 'capacity', { repeatable: true }),
    b('market', 'Mercado', 'administration'),
    b('trade_office', 'Oficina de Comercio', 'administration', {
      requires: [{ building: 'market', level: 5 }],
    }),
    b('academy', 'Academia', 'administration', { requires: [{ building: 'barracks', level: 3 }] }),
    b('smithy', 'Herrería', 'administration', { requires: [{ building: 'academy', level: 1 }] }),
    b('embassy', 'Embajada', 'administration', { plotKind: 'citadel' }),
    b('town_hall', 'Ayuntamiento', 'administration', {
      plotKind: 'citadel',
      requires: [{ building: 'city_hall', level: 5 }],
    }),
    b('hideout', 'Escondite', 'administration', { repeatable: true }),
    b('wonder', 'Maravilla del Mundo', 'administration', { plotKind: 'citadel', maxLevel: 100 }),
    b('tournament_square', 'Plaza de Torneos', 'administration', {
      requires: [{ building: 'rally_point', level: 5 }],
    }),
  ].map((d) => ({
    ...d,
    repeatable: d.type === 'warehouse' ? true : d.repeatable,
    populationByLevel: population(d.type, d.maxLevel),
  })),
  cityLayout: {
    plots: [
      ...old.cityLayout.plots,
      {
        id: 40,
        kind: 'citadel',
        x: 0,
        z: 0,
        rotationY: 0,
        precinct: 1,
        allowedTypes: ['embassy'],
        label: 'Embajada',
      },
      {
        id: 41,
        kind: 'citadel',
        x: 0,
        z: 0,
        rotationY: 0,
        precinct: 1,
        allowedTypes: ['town_hall'],
        label: 'Ayuntamiento',
      },
      {
        id: 42,
        kind: 'citadel',
        x: 0,
        z: 0,
        rotationY: 0,
        precinct: 1,
        allowedTypes: ['wonder'],
        label: 'Solar monumental',
      },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: 43 + i,
        kind: 'industry' as const,
        x: 0,
        z: 0,
        rotationY: 0,
        precinct: 2 as const,
        label: 'Solar urbano',
      })),
      {
        id: 51,
        kind: 'citadel',
        x: 0,
        z: 0,
        rotationY: 0,
        precinct: 1,
        allowedTypes: ['treasury'],
        label: 'Tesoro',
      },
    ],
  },
};
