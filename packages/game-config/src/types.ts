import { z } from 'zod';

export const RESOURCE_KEYS = ['wood', 'stone', 'iron', 'food'] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export const CIVILIZATION_IDS = [
  'imperial_crown',
  'sea_league',
  'stone_wardens',
  'steppe_clans',
  'forest_kin',
] as const;
export type CivilizationId = (typeof CIVILIZATION_IDS)[number];

export const BUILDING_TYPES = [
  'city_hall',
  'farm',
  'sawmill',
  'quarry',
  'mine',
  'warehouse',
  'barracks',
  'hospital',
  'temple',
  'port',
  'wall',
  'imperial_bastion',
  'naval_arsenal',
  'lumber_mill',
  'brickyard',
  'iron_foundry',
  'grain_mill',
  'bakery',
  'castle',
  'rally_point',
  'middle_wall',
  'inner_wall',
  'watchtower',
  'war_camp',
  'trapper',
  'stable',
  'workshop',
  'granary',
  'market',
  'trade_office',
  'academy',
  'smithy',
  'embassy',
  'town_hall',
  'hideout',
  'wonder',
  'tournament_square',
  'treasury',
] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

export const UNIT_TYPES = [
  'militia',
  'spearman',
  'archer',
  'cavalry',
  'priest',
  'imperial_guard',
  'naval_escort',
  'settler',
  'chieftain',
  'ward_guard',
  'raider',
  'forest_archer',
  'ram',
  'catapult',
  'wolf',
  'boar',
  'bear',
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const PLOT_KINDS = [
  'center',
  'standard',
  'coastal',
  'wall',
  'field',
  'citadel',
  'industry',
  'fortification',
] as const;
export type PlotKind = (typeof PLOT_KINDS)[number];

const nonNegInt = z.number().int().nonnegative();
const posInt = z.number().int().positive();

/** Cantidades enteras de recursos (unidades completas, no milésimas). */
export const resourceBundleSchema = z.object({
  wood: nonNegInt,
  stone: nonNegInt,
  iron: nonNegInt,
  food: nonNegInt,
});
export type ResourceBundle = z.infer<typeof resourceBundleSchema>;

/**
 * Factor de crecimiento racional exacto (num/den). Se evalúa con BigInt para
 * que costes y tiempos sean idénticos en cualquier motor JS (ADR-0004/0005).
 */
export const growthSchema = z.object({ num: posInt, den: posInt });
export type Growth = z.infer<typeof growthSchema>;

const requirementSchema = z.object({
  building: z.enum(BUILDING_TYPES),
  level: posInt,
});

export const buildingDefSchema = z.object({
  type: z.enum(BUILDING_TYPES),
  name: z.string().min(1),
  description: z.string().min(1),
  maxLevel: posInt,
  populationByLevel: z.array(nonNegInt).optional(),
  baseCost: resourceBundleSchema,
  baseSeconds: posInt,
  effect: z.enum([
    'production',
    'capacity',
    'recruit',
    'defense',
    'population',
    'wound_recovery',
    'priest_recruitment',
    'naval_transport',
    'naval_capacity',
    'processing',
    'administration',
    'traps',
  ]),
  produces: z.enum(RESOURCE_KEYS).optional(),
  bonusPerLevelPermille: nonNegInt.optional(),
  repeatable: z.boolean().optional(),
  civilization: z.enum(CIVILIZATION_IDS).optional(),
  plotKind: z.enum(PLOT_KINDS),
  requires: z.array(requirementSchema),
});
export type BuildingDef = z.infer<typeof buildingDefSchema>;

export const unitDefSchema = z.object({
  researchRequired: z.boolean().optional(),
  type: z.enum(UNIT_TYPES),
  name: z.string().min(1),
  unitClass: z.enum(['infantry', 'cavalry', 'support']),
  ranged: z.boolean(),
  npcOnly: z.boolean().optional(),
  cost: resourceBundleSchema,
  trainingSeconds: posInt,
  attack: nonNegInt,
  infantryDefense: nonNegInt,
  cavalryDefense: nonNegInt,
  speedTilesPerHour: posInt,
  foodUpkeepPerHour: nonNegInt,
  population: posInt,
  carry: nonNegInt,
  trainedAt: z.enum(BUILDING_TYPES),
  civilization: z.enum(CIVILIZATION_IDS).optional(),
  requires: z.array(requirementSchema),
  support: z
    .object({
      moraleBonusPercent: nonNegInt,
      maximumArmyBonusPercent: nonNegInt,
    })
    .optional(),
});
export type UnitDef = z.infer<typeof unitDefSchema>;

export const civilizationDefSchema = z.object({
  id: z.enum(CIVILIZATION_IDS),
  name: z.string(),
  tagline: z.string(),
  uniqueBuilding: z.enum(BUILDING_TYPES),
  uniqueUnit: z.enum(UNIT_TYPES),
  /** Multiplicadores en tanto por mil (1000 = sin cambio). */
  modifiers: z.object({
    parallelFieldConstruction: z.boolean().optional(),
    wallBonusPermillePerLevel: nonNegInt,
    wallCostPermille: posInt,
    carryPermille: posInt,
    navalTransportSpeedPermille: posInt,
  }),
});
export type CivilizationDef = z.infer<typeof civilizationDefSchema>;

export const plotDefSchema = z.object({
  id: nonNegInt,
  kind: z.enum(PLOT_KINDS),
  /** Posición en metros dentro de la escena de ciudad (cliente) y orden lógico (servidor). */
  x: z.number(),
  z: z.number(),
  rotationY: z.number(),
  allowedTypes: z.array(z.enum(BUILDING_TYPES)).optional(),
  label: z.string().optional(),
  radius: z.number().optional(),
  precinct: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  footprintRadius: z.number().positive().optional(),
});
export type PlotDef = z.infer<typeof plotDefSchema>;

export const rulesetSchema = z.object({
  trade: z
    .object({
      version: z.literal('trade-1'),
      officeCapacityPermillePerLevel: nonNegInt,
      minRouteSeconds: posInt,
      merchants: z.object({
        romans: z.object({ capacity: posInt, speed: posInt }),
        gauls: z.object({ capacity: posInt, speed: posInt }),
        teutons: z.object({ capacity: posInt, speed: posInt }),
      }),
    })
    .optional(),
  culture: z
    .object({
      version: z.literal('culture-1'),
      thresholdBase: posInt,
      castleLevels: z.tuple([posInt, posInt, posInt]),
      celebrationPoints: posInt,
      celebrationSeconds: posInt,
      celebrationCost: resourceBundleSchema,
    })
    .optional(),
  development: z
    .object({
      version: z.literal('development-1'),
      researchBaseSeconds: posInt,
      smithyBonusPermille: nonNegInt,
      maxSmithyLevel: posInt,
      demolitionBaseSeconds: posInt,
    })
    .optional(),
  version: z.string().min(1),
  status: z.enum(['PROPOSAL', 'APPROVED']),
  resources: z.array(z.enum(RESOURCE_KEYS)).length(4),
  economy: z.object({
    fieldProductionByLevel: z.array(nonNegInt).optional(),
    cropPopulation: z.boolean().optional(),
    starvationIntervalSeconds: posInt.optional(),
    startingResources: resourceBundleSchema,
    /** Producción base por hora de un edificio productor nivel 1. */
    baseProductionPerHour: posInt,
    /** Producción plana de cada aldea aunque no tenga edificio productor. */
    villageBaseProductionPerHour: nonNegInt,
    productionGrowth: growthSchema,
    buildingCostGrowth: growthSchema,
    buildingTimeGrowth: growthSchema,
    baseCapacity: posInt,
    warehouseCapacityBase: posInt,
    warehouseCapacityGrowth: growthSchema,
    /** Reembolso al cancelar (no usado aún) en tanto por mil. */
    cancelRefundPermille: nonNegInt,
  }),
  population: z.object({
    cityHallBase: posInt,
    cityHallGrowth: growthSchema,
  }),
  combat: z.object({
    luckPermille: nonNegInt,
    wallBonusPermillePerLevel: nonNegInt,
    bastionBonusPermillePerLevel: nonNegInt,
    baseVillageDefense: nonNegInt,
    lootProtectedPermille: nonNegInt,
    hospitalWoundedBasePermille: nonNegInt,
    hospitalWoundedPermillePerLevel: nonNegInt,
    hospitalWoundedMaxPermille: nonNegInt,
    maxRetreatThresholdPercent: posInt,
    maxReservePercent: nonNegInt,
  }),
  world: z.object({
    defaultMapSize: posInt,
    newPlayerProtectionHours: nonNegInt,
    spawnMinDistance: posInt,
    allianceMaxMembers: posInt,
    confederationMaxAlliances: posInt,
    wonderSites: posInt,
    wonderMaxLevel: posInt,
  }),
  civilizations: z.array(civilizationDefSchema),
  buildings: z.array(buildingDefSchema),
  units: z.array(unitDefSchema),
  territory: z
    .object({
      mapMode: z.literal('LAND'),
      settlersRequired: posInt,
      foundingCost: resourceBundleSchema,
      foundingHallLevel: posInt,
      loyaltyPerChief: posInt,
      oasisBonusPermille: nonNegInt,
      maxOasesPerVillage: posInt,
      oasisConquest: z
        .object({ radius: posInt, treasuryLevels: z.tuple([posInt, posInt, posInt]) })
        .optional(),
      npcRegeneration: z
        .object({ oasisSeconds: posInt, villageSeconds: posInt, oasisLoyaltyPerAttack: posInt })
        .optional(),
      trapsPerLevel: posInt,
      fieldEncounterRadiusMilli: posInt,
    })
    .optional(),
  fortifications: z
    .object({
      layoutVersion: z.enum(['organic-1', 'organic-2']),
      deployment: z.object({
        BALANCED: z.tuple([nonNegInt, nonNegInt, nonNegInt]),
        OUTER: z.tuple([nonNegInt, nonNegInt, nonNegInt]),
        CORE: z.tuple([nonNegInt, nonNegInt, nonNegInt]),
      }),
      maxWallBonusPermille: nonNegInt,
      ramDamagePerUnit: posInt,
      wallResistancePerLevel: posInt,
      catapultsPerLevel: posInt,
      preciseTargetRallyLevel: posInt,
      repairCostPermille: posInt,
      repairTimePermille: posInt,
    })
    .optional(),
  cityLayout: z.object({ plots: z.array(plotDefSchema) }),
  startingBuildings: z.array(
    z.object({ plot: nonNegInt, type: z.enum(BUILDING_TYPES), level: posInt }),
  ),
});
export type Ruleset = z.infer<typeof rulesetSchema>;

export type Precinct = 1 | 2 | 3;
export type Deployment = 'BALANCED' | 'OUTER' | 'CORE';
export interface LayoutPoint {
  x: number;
  z: number;
}
export interface VillageLayout {
  version: 'organic-1' | 'organic-2';
  seed: string;
  civilization: CivilizationId;
  plots: PlotDef[];
  walls: Array<{
    precinct: Precinct;
    plot: number;
    radius: number;
    perimeter: LayoutPoint[];
    gate: LayoutPoint;
  }>;
  roads: Array<{ id: string; width: number; points: LayoutPoint[] }>;
}
