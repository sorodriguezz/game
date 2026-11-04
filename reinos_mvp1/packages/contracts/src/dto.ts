import { z } from 'zod';
import { BUILDING_TYPES, CIVILIZATION_IDS, UNIT_TYPES } from '@reinos/game-config';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
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
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export interface AccountView {
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
export const WORLD_STATUSES = ['PLANNED', 'OPEN', 'WONDER_ERA', 'FINALIZING', 'ARCHIVED'] as const;
export type WorldStatus = (typeof WORLD_STATUSES)[number];

export const WORLD_PROFILES = ['test', 'alpha', 'seasonal'] as const;
export type WorldProfile = (typeof WORLD_PROFILES)[number];

export interface WorldSummary {
  id: string;
  slug: string;
  name: string;
  status: WorldStatus;
  profile: WorldProfile;
  rulesetVersion: string;
  speedMultiplier: number;
  mapSize: number;
  playerCount: number;
  membership: null | {
    civilization: (typeof CIVILIZATION_IDS)[number];
    villageIds: string[];
    protectionUntil: string;
  };
}

export const joinWorldRequestSchema = z.object({
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
  settledAt: string;
  starving: boolean;
}

export interface BuildingView {
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

export const MOVEMENT_MISSIONS = ['ATTACK', 'RAID'] as const;
export type MovementMission = (typeof MOVEMENT_MISSIONS)[number];

export interface MovementView {
  id: string;
  direction: 'OUTGOING' | 'RETURNING' | 'INCOMING';
  mission: MovementMission;
  status: 'IN_TRANSIT' | 'RETURNING' | 'COMPLETED';
  originVillageId: string;
  originName: string;
  targetVillageId: string;
  targetName: string;
  departedAt: string;
  arrivesAt: string;
  /** Composición solo visible para el propietario (no para el defensor). */
  units: UnitStackView[] | null;
  loot: Record<'wood' | 'stone' | 'iron' | 'food', number> | null;
}

export interface DoctrineView {
  reservePercent: number;
  retreatThresholdPercent: number | null;
}

export interface VillageView {
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
  population: { used: number; capacity: number };
  buildings: BuildingView[];
  construction: ConstructionOrderView | null;
  recruitment: RecruitmentOrderView[];
  troops: UnitStackView[];
  wounded: UnitStackView[];
  doctrine: DoctrineView;
  movements: MovementView[];
  protectionUntil: string;
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
  reservePercent: z.number().int().min(0).max(100),
  retreatThresholdPercent: z.number().int().min(100).max(10_000).nullable(),
});
export type DoctrineRequest = z.infer<typeof doctrineRequestSchema>;

export const sendMovementRequestSchema = z.object({
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
  x: z.coerce.number().int().min(0).max(4096),
  y: z.coerce.number().int().min(0).max(4096),
  radius: z.coerce.number().int().min(1).max(24).default(12),
});
export type MapQuery = z.infer<typeof mapQuerySchema>;

export interface MapVillageView {
  id: string;
  name: string;
  x: number;
  y: number;
  ownerName: string | null;
  civilization: (typeof CIVILIZATION_IDS)[number] | null;
  isMine: boolean;
}

export interface MapRegionView {
  originX: number;
  originY: number;
  width: number;
  height: number;
  /** Una letra por celda, fila a fila: S=mar, P=llanura, F=bosque, M=montaña, O=oasis. */
  tiles: string;
  /** Una letra por celda: 1 si la celda de tierra toca el mar. */
  coastal: string;
  villages: MapVillageView[];
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
}

export interface BattleReportDetail extends BattleReportSummary {
  rulesetVersion: string;
  seed: string;
  result: unknown;
}
