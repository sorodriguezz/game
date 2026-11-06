import { z } from 'zod';
import {
  BUILDING_TYPES,
  CIVILIZATION_IDS,
  UNIT_TYPES,
  type VillageLayout,
  type Precinct,
  type Deployment,
} from '@reinos/game-config';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const ACCOUNT_ROLES = ['ADMIN', 'MODERATOR', 'PLAYER'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];
export const registerRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  displayName: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[\p{L}\p{N}_ .-]+$/u, 'Solo letras, números, espacio, punto, guion y guion bajo'),
  password: z.string().min(10).max(200),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export interface AccountView {
  role: AccountRole;
  id: string;
  email: string;
  displayName: string;
}

export interface MeResponse {
  account: AccountView;
  csrfToken: string;
}

// ---------------------------------------------------------------------------
// Mundos
// ---------------------------------------------------------------------------
export const WORLD_STATUSES = [
  'DRAFT',
  'PLANNED',
  'OPEN',
  'WONDER_ERA',
  'PAUSED',
  'FINALIZING',
  'FINISHED',
  'ARCHIVED',
  'CANCELLED',
] as const;
export type WorldStatus = (typeof WORLD_STATUSES)[number];

export const WORLD_PROFILES = ['test', 'alpha', 'seasonal'] as const;
export type WorldProfile = (typeof WORLD_PROFILES)[number];

export interface WorldSummary {
  opensAt?: string;
  endsAt?: string | null;
  id: string;
  slug: string;
  name: string;
  status: WorldStatus;
  profile: WorldProfile;
  rulesetVersion: string;
  speedMultiplier: number;
  movementSpeedMultiplier?: number;
  mapSize: number;
  playerCount: number;
  membership: null | {
    civilization: (typeof CIVILIZATION_IDS)[number];
    villageIds: string[];
    protectionUntil: string;
  };
}

export const joinWorldRequestSchema = z.object({
  characterName: z.string().trim().min(3).max(24).optional(),
  quadrant: z.enum(['NW', 'NE', 'SW', 'SE']).optional(),
  civilization: z.enum(CIVILIZATION_IDS),
  villageName: z.string().trim().min(3).max(32),
});
export type JoinWorldRequest = z.infer<typeof joinWorldRequestSchema>;

export interface JoinWorldResponse {
  worldId: string;
  villageId: string;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Aldea
// ---------------------------------------------------------------------------
export interface ResourceSnapshotView {
  /** Milésimas de unidad, liquidadas hasta `settledAt` por el servidor. */
  amountsMilli: Record<'wood' | 'stone' | 'iron' | 'food', number>;
  ratesMilliPerHour: Record<'wood' | 'stone' | 'iron' | 'food', number>;
  capacityMilli: number;
  foodCapacityMilli?: number;
  settledAt: string;
  starving: boolean;
}

export interface BuildingView {
  inhabitants?: number;
  plot: number;
  type: (typeof BUILDING_TYPES)[number];
  level: number;
}

export interface ConstructionOrderView {
  id: string;
  plot: number;
  type: (typeof BUILDING_TYPES)[number];
  targetLevel: number;
  startedAt: string;
  completesAt: string;
}

export interface RecruitmentOrderView {
  id: string;
  unitType: (typeof UNIT_TYPES)[number];
  quantity: number;
  startedAt: string;
  completesAt: string;
}

export interface UnitStackView {
  unitType: (typeof UNIT_TYPES)[number];
  quantity: number;
}

export const MOVEMENT_MISSIONS = ['ATTACK', 'RAID', 'TRANSFER', 'REINFORCE', 'CONQUER'] as const;
export type MovementMission = (typeof MOVEMENT_MISSIONS)[number];

export interface MovementView {
  id: string;
  direction: 'OUTGOING' | 'RETURNING' | 'INCOMING';
  mission: MovementMission | 'SETTLE';
  status: 'IN_TRANSIT' | 'RETURNING' | 'COMPLETED';
  originVillageId: string;
  originName: string;
  targetVillageId: string | null;
  targetName: string;
  departedAt: string;
  arrivesAt: string;
  /** Composición solo visible para el propietario (no para el defensor). */
  units: UnitStackView[] | null;
  loot: Record<'wood' | 'stone' | 'iron' | 'food', number> | null;
}

export interface DoctrineView {
  deployment?: Deployment;
  reservePercent: number;
  retreatThresholdPercent: number | null;
}

export interface VillageView {
  culture?: import('./culture.js').CultureView;
  research?: import('./development.js').ResearchView[];
  development?: import('./development.js').DevelopmentOrderView[];
  worldName?: string;
  oases?: { owned: number; slots: number; radius: number };
  worldStatus?: (typeof WORLD_STATUSES)[number];
  mapSize?: number;
  characterName?: string;
  movementSpeedMultiplier?: number;
  constructions?: ConstructionOrderView[];
  layout?: VillageLayout;
  walls?: WallSectionView[];
  id: string;
  worldId: string;
  name: string;
  x: number;
  y: number;
  coastal: boolean;
  civilization: (typeof CIVILIZATION_IDS)[number];
  rulesetVersion: string;
  speedMultiplier: number;
  serverTime: string;
  resources: ResourceSnapshotView;
  population: {
    used: number;
    capacity: number;
    inhabitants?: number;
    grossCropPerHour?: number;
    buildingConsumption?: number;
    troopConsumption?: number;
    freeCropPerHour?: number;
  };
  buildings: BuildingView[];
  construction: ConstructionOrderView | null;
  recruitment: RecruitmentOrderView[];
  troops: UnitStackView[];
  wounded: UnitStackView[];
  doctrine: DoctrineView;
  movements: MovementView[];
  protectionUntil: string;
  isCapital?: boolean;
  loyalty?: number;
  garrisons?: Array<{
    ownerAccountId: string;
    originVillageId: string;
    unitType: (typeof UNIT_TYPES)[number];
    quantity: number;
  }>;
}

export const buildRequestSchema = z.object({
  plot: z.number().int().min(0).max(63),
  buildingType: z.enum(BUILDING_TYPES),
});
export type BuildRequest = z.infer<typeof buildRequestSchema>;

export interface BuildResponse {
  orderId: string;
  targetLevel: number;
  startedAt: string;
  completesAt: string;
  serverTime: string;
}

export const recruitRequestSchema = z.object({
  unitType: z.enum(UNIT_TYPES),
  quantity: z.number().int().min(1).max(10_000),
});
export type RecruitRequest = z.infer<typeof recruitRequestSchema>;

export interface RecruitResponse {
  orderId: string;
  startedAt: string;
  completesAt: string;
  serverTime: string;
}

export const doctrineRequestSchema = z.object({
  deployment: z.enum(['BALANCED', 'OUTER', 'CORE']).optional(),
  reservePercent: z.number().int().min(0).max(100),
  retreatThresholdPercent: z.number().int().min(100).max(10_000).nullable(),
});
export type DoctrineRequest = z.infer<typeof doctrineRequestSchema>;

export const sendMovementRequestSchema = z.object({
  siegeTargetPlot: z.number().int().min(0).max(63).optional(),
  targetVillageId: z.uuid(),
  mission: z.enum(MOVEMENT_MISSIONS),
  units: z
    .array(
      z.object({
        unitType: z.enum(UNIT_TYPES),
        quantity: z.number().int().min(1).max(1_000_000),
      }),
    )
    .min(1)
    .max(UNIT_TYPES.length),
});
export type SendMovementRequest = z.infer<typeof sendMovementRequestSchema>;

export interface SendMovementResponse {
  movementId: string;
  status: 'IN_TRANSIT';
  departureAt: string;
  arrivalAt: string;
  serverTime: string;
}

// ---------------------------------------------------------------------------
// Mapa
// ---------------------------------------------------------------------------
export const mapQuerySchema = z.object({
  x: z.coerce.number().int().min(-5000).max(4999),
  y: z.coerce.number().int().min(-5000).max(4999),
  radius: z.coerce.number().int().min(1).max(24).default(12),
  width: z.coerce.number().int().min(1).max(95).optional(),
  height: z.coerce.number().int().min(1).max(95).optional(),
});
export type MapQuery = z.infer<typeof mapQuerySchema>;

export interface MapVillageView {
  construction?: { count: number; startedAt: string; completesAt: string };
  oasisBonuses?: Partial<Record<'wood' | 'stone' | 'iron' | 'food', number>>;
  parentVillageId?: string | null;
  ownerColor?: string;
  id: string;
  name: string;
  x: number;
  y: number;
  ownerName: string | null;
  civilization: (typeof CIVILIZATION_IDS)[number] | null;
  isMine: boolean;
  isAlly?: boolean;
  kind?: 'PLAYER' | 'NPC' | 'OASIS';
  isCapital?: boolean;
  loyalty?: number;
  animals?: UnitStackView[];
}

export interface MapRegionView {
  fieldDistributions?: number[][];
  /** Origen NO; las filas avanzan hacia Y decreciente en coordenadas cartesianas. */
  coordinateSystem?: 'CARTESIAN';
  originX: number;
  originY: number;
  width: number;
  height: number;
  /** Una letra por celda, fila a fila: S=mar, P=llanura, F=bosque, M=montaña, O=oasis. */
  tiles: string;
  /** Una letra por celda: 1 si la celda de tierra toca el mar. */
  coastal: string;
  villages: MapVillageView[];
  mapSize?: number;
  serverTime?: string;
  movements?: MapMovementView[];
}
export interface MapAtlasView {
  worldId: string;
  mapSize: number;
  mapSeed: number;
  serverTime: string;
  running?: boolean;
  villages: MapVillageView[];
  movements: MapMovementView[];
}

// ---------------------------------------------------------------------------
// Informes de batalla
// ---------------------------------------------------------------------------
export interface BattleReportSummary {
  id: string;
  occurredAt: string;
  mission: MovementMission;
  role: 'ATTACKER' | 'DEFENDER';
  outcome: 'ATTACKER' | 'DEFENDER';
  attackerVillageName: string;
  defenderVillageName: string;
  attackerName: string;
  defenderName: string;
  location?: 'VILLAGE' | 'FIELD';
  fieldPosition?: { x: number; y: number } | null;
}

export interface BattleReportDetail extends BattleReportSummary {
  defenderInformationLimited?: boolean;
  layout?: VillageLayout;
  replay?: {
    version: 'auto-replay-1';
    visualSeed: string;
    layout: VillageLayout;
    civilization: (typeof CIVILIZATION_IDS)[number];
    buildings: BuildingView[];
    walls: WallSectionView[];
  };
  rulesetVersion: string;
  seed: string;
  result: unknown;
}

export interface MapMovementView {
  id: string;
  mission: MovementMission | 'SETTLE';
  isMine: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
  departedAt: string;
  arrivesAt: string;
  units: UnitStackView[] | null;
}
export const foundVillageRequestSchema = z.object({
  x: z.number().int().min(-5000).max(4999),
  y: z.number().int().min(-5000).max(4999),
  name: z.string().trim().min(3).max(32),
});
export type FoundVillageRequest = z.infer<typeof foundVillageRequestSchema>;
export interface TerritoryView {
  villages: Array<{ id: string; name: string; x: number; y: number; isCapital: boolean }>;
  settlements: Array<{ id: string; name: string; x: number; y: number; arrivesAt: string }>;
  alliance: null | {
    id: string;
    name: string;
    inviteCode: string | null;
    members: Array<{ accountId: string; displayName: string }>;
  };
  reinforcements: Array<{
    villageId: string;
    villageName: string;
    originVillageId: string;
    unitType: (typeof UNIT_TYPES)[number];
    quantity: number;
  }>;
}
export const allianceRequestSchema = z.union([
  z.object({ name: z.string().trim().min(3).max(32) }),
  z.object({ inviteCode: z.string().trim().min(6).max(32) }),
]);

export interface WallSectionView {
  precinct: Precinct;
  plot: number;
  level: number;
  integrity: number;
  material: 'STONE' | 'WOOD' | 'EARTH';
  bonusPermille: number;
  repair: null | { id: string; restoreIntegrity: number; startedAt: string; completesAt: string };
}
export const repairWallRequestSchema = z.object({
  precinct: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type RepairWallRequest = z.infer<typeof repairWallRequestSchema>;
export interface RepairWallResponse {
  orderId: string;
  completesAt: string;
  restoreIntegrity: number;
}
