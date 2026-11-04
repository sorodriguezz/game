import { z } from 'zod';

export const RESOURCE_KEYS = ['wood', 'stone', 'iron', 'food'] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export const CIVILIZATION_IDS = ['imperial_crown', 'sea_league'] as const;
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
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const PLOT_KINDS = ['center', 'standard', 'coastal', 'wall'] as const;
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
  ]),
  produces: z.enum(RESOURCE_KEYS).optional(),
  civilization: z.enum(CIVILIZATION_IDS).optional(),
  plotKind: z.enum(PLOT_KINDS),
  requires: z.array(requirementSchema),
});
export type BuildingDef = z.infer<typeof buildingDefSchema>;

export const unitDefSchema = z.object({
  type: z.enum(UNIT_TYPES),
  name: z.string().min(1),
  unitClass: z.enum(['infantry', 'cavalry', 'support']),
  ranged: z.boolean(),
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
});
export type PlotDef = z.infer<typeof plotDefSchema>;

export const rulesetSchema = z.object({
  version: z.string().min(1),
  status: z.enum(['PROPOSAL', 'APPROVED']),
  resources: z.array(z.enum(RESOURCE_KEYS)).length(4),
  economy: z.object({
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
  cityLayout: z.object({ plots: z.array(plotDefSchema) }),
  startingBuildings: z.array(
    z.object({ plot: nonNegInt, type: z.enum(BUILDING_TYPES), level: posInt }),
  ),
});
export type Ruleset = z.infer<typeof rulesetSchema>;
