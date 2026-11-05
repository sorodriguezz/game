import type {
  BuildingDef,
  BuildingType,
  CivilizationId,
  Ruleset,
  UnitDef,
  UnitType,
} from '../types.js';
import { rulesetMvp1Alpha0 as old } from './mvp1-alpha.0.js';
const cost = (w: number, s: number, i: number, f: number) => ({
  wood: w,
  stone: s,
  iron: i,
  food: f,
});
const b = (
  type: BuildingType,
  name: string,
  plotKind: BuildingDef['plotKind'],
  effect: BuildingDef['effect'],
  extra: Partial<BuildingDef> = {},
): BuildingDef => ({
  type,
  name,
  description: name,
  maxLevel: 20,
  baseCost: cost(90, 80, 65, 30),
  baseSeconds: 300,
  effect,
  plotKind,
  requires: [{ building: 'city_hall', level: 1 }],
  ...extra,
});
const u = (type: UnitType, name: string, extra: Partial<UnitDef> = {}): UnitDef => ({
  type,
  name,
  unitClass: 'infantry',
  ranged: false,
  cost: cost(90, 60, 80, 40),
  trainingSeconds: 180,
  attack: 45,
  infantryDefense: 40,
  cavalryDefense: 35,
  speedTilesPerHour: 6,
  foodUpkeepPerHour: 1,
  population: 1,
  carry: 45,
  trainedAt: 'barracks',
  requires: [],
  ...extra,
});
const unique = (
  id: CivilizationId,
  name: string,
  tagline: string,
  uniqueBuilding: BuildingType,
  uniqueUnit: UnitType,
  wall: number,
  carry: number,
) => ({
  id,
  name,
  tagline,
  uniqueBuilding,
  uniqueUnit,
  modifiers: {
    wallBonusPermillePerLevel: wall,
    wallCostPermille: 1000,
    carryPermille: carry,
    navalTransportSpeedPermille: 1000,
  },
});
const plots: Ruleset['cityLayout']['plots'] = [
  {
    id: 0,
    kind: 'center',
    x: 0,
    z: -8,
    rotationY: 0,
    allowedTypes: ['city_hall'],
    label: 'Centro urbano',
  },
  {
    id: 1,
    kind: 'citadel',
    x: -11,
    z: 5,
    rotationY: 90,
    allowedTypes: ['castle'],
    label: 'Castillo',
  },
  {
    id: 2,
    kind: 'citadel',
    x: 11,
    z: 5,
    rotationY: -90,
    allowedTypes: ['rally_point'],
    label: 'Plaza de reuniones',
  },
  ...Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8;
    return {
      id: i + 3,
      kind: 'industry' as const,
      x: Math.sin(a) * 33,
      z: Math.cos(a) * 33,
      rotationY: (a * 180) / Math.PI + 180,
      label: 'Distrito productivo y militar',
    };
  }),
  ...(['wall', 'middle_wall', 'inner_wall'] as const).map((type, i) => ({
    id: 19 + i,
    kind: 'fortification' as const,
    x: 0,
    z: [65, 45, 22][i]!,
    rotationY: 0,
    radius: [65, 45, 22][i]!,
    allowedTypes: [type],
    label: ['Muralla exterior', 'Muralla del distrito', 'Muralla de la ciudadela'][i],
  })),
  ...Array.from({ length: 18 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 18;
    const type: BuildingType = i < 4 ? 'sawmill' : i < 8 ? 'quarry' : i < 12 ? 'mine' : 'farm';
    return {
      id: 22 + i,
      kind: 'field' as const,
      x: Math.sin(a) * 83,
      z: Math.cos(a) * 83,
      rotationY: (a * 180) / Math.PI + 180,
      allowedTypes: [type],
      label: {
        sawmill: 'Bosque maderero',
        quarry: 'Pozo de barro',
        mine: 'Mina de hierro',
        farm: 'Campo de cereal',
      }[type],
    };
  }),
];
export const rulesetFrontierAlpha1: Ruleset = {
  ...structuredClone(old),
  version: 'frontier-alpha.1',
  status: 'PROPOSAL',
  economy: {
    ...old.economy,
    startingResources: cost(1800, 1800, 1800, 1800),
    baseCapacity: 3000,
    warehouseCapacityBase: 4000,
    baseProductionPerHour: 24,
  },
  territory: {
    mapMode: 'LAND',
    settlersRequired: 3,
    foundingCost: cost(750, 750, 750, 750),
    foundingHallLevel: 5,
    loyaltyPerChief: 35,
    oasisBonusPermille: 250,
    maxOasesPerVillage: 3,
    trapsPerLevel: 3,
    fieldEncounterRadiusMilli: 150,
  },
  civilizations: [
    unique(
      'stone_wardens',
      'Custodios de Piedra',
      'Murallas resistentes, torres y guardianes de élite.',
      'watchtower',
      'ward_guard',
      35,
      1000,
    ),
    unique(
      'steppe_clans',
      'Clanes de la Estepa',
      'Incursiones rápidas, mayor carga y guerreros ofensivos.',
      'war_camp',
      'raider',
      15,
      1250,
    ),
    unique(
      'forest_kin',
      'Guardianes del Bosque',
      'Arqueros defensivos y trampas que desgastan al invasor.',
      'trapper',
      'forest_archer',
      22,
      1050,
    ),
  ],
  buildings: [
    ...old.buildings
      .filter((x) =>
        [
          'city_hall',
          'farm',
          'sawmill',
          'quarry',
          'mine',
          'warehouse',
          'barracks',
          'hospital',
          'temple',
          'wall',
        ].includes(x.type),
      )
      .map((x) => ({
        ...x,
        name:
          x.type === 'sawmill'
            ? 'Bosque maderero'
            : x.type === 'quarry'
              ? 'Pozo de barro'
              : x.type === 'farm'
                ? 'Campo de cereal'
                : x.name,
        plotKind: (['farm', 'sawmill', 'quarry', 'mine'].includes(x.type)
          ? 'field'
          : x.type === 'wall'
            ? 'fortification'
            : x.type === 'city_hall'
              ? 'center'
              : 'industry') as BuildingDef['plotKind'],
        repeatable: ['farm', 'sawmill', 'quarry', 'mine'].includes(x.type),
      })),
    b('castle', 'Castillo', 'citadel', 'administration', {
      requires: [{ building: 'city_hall', level: 3 }],
      baseCost: cost(280, 300, 180, 100),
      description: 'Protege la capital, forma colonos y emisarios para expandir tu reino.',
    }),
    b('rally_point', 'Plaza de reuniones', 'citadel', 'administration', {
      requires: [],
      description: 'Organiza expediciones, traslados y refuerzos.',
    }),
    b('middle_wall', 'Muralla del distrito', 'fortification', 'defense'),
    b('inner_wall', 'Muralla de la ciudadela', 'fortification', 'defense'),
    ...(
      [
        ['lumber_mill', 'Serrería', 'wood', 'sawmill'],
        ['brickyard', 'Ladrillar', 'stone', 'quarry'],
        ['iron_foundry', 'Fundición de hierro', 'iron', 'mine'],
        ['grain_mill', 'Molino', 'food', 'farm'],
        ['bakery', 'Panadería', 'food', 'farm'],
      ] as const
    ).map(([type, name, produces, req]) =>
      b(type, name, 'industry', 'processing', {
        maxLevel: 5,
        produces,
        bonusPerLevelPermille: 50,
        requires: [{ building: req, level: 3 }],
        description: `Aumenta un 5 % por nivel la producción de ${produces === 'wood' ? 'madera' : produces === 'stone' ? 'barro' : produces === 'iron' ? 'hierro' : 'cereal'}.`,
      }),
    ),
    b('stable', 'Establo', 'industry', 'recruit', {
      requires: [{ building: 'barracks', level: 3 }],
    }),
    b('workshop', 'Taller de asedio', 'industry', 'recruit', {
      requires: [{ building: 'barracks', level: 5 }],
    }),
    b('watchtower', 'Torre de vigilancia', 'industry', 'defense', {
      civilization: 'stone_wardens',
      description: 'Añade defensa al recinto y desbloquea guardianes.',
    }),
    b('war_camp', 'Campamento de guerra', 'industry', 'recruit', {
      civilization: 'steppe_clans',
      description: 'Entrena saqueadores de la estepa.',
    }),
    b('trapper', 'Taller de trampas', 'industry', 'traps', {
      civilization: 'forest_kin',
      description: 'Coloca tres trampas por nivel, consumidas al defender la aldea.',
    }),
  ],
  units: [
    ...old.units
      .filter((x) => !x.civilization)
      .map((x) => ({ ...x, trainedAt: x.type === 'cavalry' ? ('stable' as const) : x.trainedAt })),
    u('settler', 'Colono', {
      attack: 0,
      infantryDefense: 10,
      cavalryDefense: 10,
      carry: 0,
      trainingSeconds: 900,
      cost: cost(220, 250, 180, 200),
      trainedAt: 'castle',
      requires: [
        { building: 'city_hall', level: 5 },
        { building: 'rally_point', level: 1 },
      ],
    }),
    u('chieftain', 'Emisario', {
      attack: 20,
      carry: 0,
      population: 3,
      trainingSeconds: 1800,
      cost: cost(650, 600, 500, 400),
      trainedAt: 'castle',
      requires: [{ building: 'castle', level: 5 }],
    }),
    u('ward_guard', 'Guardián de Piedra', {
      civilization: 'stone_wardens',
      attack: 45,
      infantryDefense: 100,
      cavalryDefense: 85,
      cost: cost(140, 130, 180, 70),
      requires: [{ building: 'watchtower', level: 1 }],
    }),
    u('raider', 'Saqueador de la Estepa', {
      civilization: 'steppe_clans',
      trainedAt: 'war_camp',
      attack: 75,
      infantryDefense: 30,
      cavalryDefense: 25,
      carry: 90,
      speedTilesPerHour: 8,
      cost: cost(75, 45, 65, 45),
    }),
    u('forest_archer', 'Arquero del Bosque', {
      civilization: 'forest_kin',
      ranged: true,
      attack: 55,
      infantryDefense: 80,
      cavalryDefense: 45,
      speedTilesPerHour: 8,
      requires: [{ building: 'trapper', level: 1 }],
    }),
    u('ram', 'Ariete', {
      trainedAt: 'workshop',
      attack: 65,
      speedTilesPerHour: 3,
      population: 3,
      foodUpkeepPerHour: 3,
      cost: cost(250, 180, 120, 80),
    }),
    u('catapult', 'Catapulta', {
      trainedAt: 'workshop',
      ranged: true,
      attack: 90,
      speedTilesPerHour: 3,
      population: 4,
      foodUpkeepPerHour: 4,
      cost: cost(320, 280, 200, 120),
      requires: [{ building: 'workshop', level: 3 }],
    }),
    ...(
      [
        ['wolf', 'Lobo', 35, 30],
        ['boar', 'Jabalí', 45, 50],
        ['bear', 'Oso', 85, 110],
      ] as const
    ).map(([type, name, attack, def]) =>
      u(type, name, {
        npcOnly: true,
        attack,
        infantryDefense: def,
        cavalryDefense: def,
        foodUpkeepPerHour: 0,
        cost: cost(0, 0, 0, 0),
      }),
    ),
  ],
  cityLayout: { plots },
  startingBuildings: [
    { plot: 0, type: 'city_hall', level: 1 },
    { plot: 1, type: 'castle', level: 1 },
    { plot: 2, type: 'rally_point', level: 1 },
    { plot: 3, type: 'warehouse', level: 1 },
    ...plots
      .filter((p) => p.kind === 'field')
      .map((p) => ({ plot: p.id, type: p.allowedTypes![0]!, level: 1 })),
  ],
};
