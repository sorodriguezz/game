import { z } from 'zod';
import { CIVILIZATION_IDS, UNIT_TYPES } from '@reinos/game-config';

/**
 * Contratos tácticos MVP 2 (M2-G0-04). Derivados de
 * `Reinos_de_la_Frontera_MVP2/contracts/battle-contracts.ts` con validación en
 * runtime (zod). Cambios respecto a la referencia, registrados en
 * docs/mvp2/DESGLOSE-MVP2.md:
 * - `seasonId`: en este repositorio 1 mundo = 1 temporada (ADR-0002), así que
 *   `seasonId === worldId` para WORLD_PVP. En TRAINING ambos son `null` porque
 *   el entrenamiento no pertenece a ningún mundo (ADR-0037, GDD §2).
 * - El resultado de TRAINING es un tipo distinto (`TrainingResult`) que el
 *   commit del mundo no acepta (INT-013).
 */

export const TACTICAL_CONTRACT_VERSION = 1 as const;
export const BATTLE_MODES = ['AUTO', 'TRAINING', 'WORLD_PVP'] as const;
export const BATTLE_SIDES = ['ATTACKER', 'DEFENDER'] as const;
export type TacticalSide = (typeof BATTLE_SIDES)[number];

export const ENCOUNTER_STATES = [
  'SNAPSHOTTED',
  'OFFERED',
  'AUTO_PENDING',
  'TACTICAL_RESERVED',
  'ROOM_ALLOCATING',
  'LIVE',
  'FALLBACK_PENDING',
  'RESULT_PENDING',
  'APPLIED',
  'CLOSED',
] as const;
export type EncounterState = (typeof ENCOUNTER_STATES)[number];

export const ORDER_TYPES = [
  'MOVE',
  'ATTACK',
  'HOLD',
  'RETREAT',
  'SET_FORMATION',
  'SUPPORT',
] as const;
export type TacticalOrderType = (typeof ORDER_TYPES)[number];
export const FORMATION_PRESETS = ['LINE', 'WEDGE', 'SKIRMISH'] as const;
export type FormationPreset = (typeof FORMATION_PRESETS)[number];

const uuid = z.uuid();
const finiteInt = (min: number, max: number) => z.number().int().min(min).max(max);

/** Orden de cliente: intención, nunca daño ni posición final (PRD §2.2). */
export const tacticalOrderSchema = z
  .object({
    type: z.enum(ORDER_TYPES),
    formationId: z.string().regex(/^[AD]\d{1,2}$/),
    seq: finiteInt(0, 2_147_483_647),
    requestedTick: finiteInt(0, 1_000_000),
    /** Centímetros enteros dentro del escenario (validación espacial en servidor). */
    targetPosition: z
      .object({ x: finiteInt(-1_000_000, 1_000_000), z: finiteInt(-1_000_000, 1_000_000) })
      .strict()
      .optional(),
    targetFormationId: z
      .string()
      .regex(/^[AD]\d{1,2}$/)
      .optional(),
    formationPreset: z.enum(FORMATION_PRESETS).optional(),
  })
  .strict()
  .superRefine((o, ctx) => {
    if (o.type === 'MOVE' && !o.targetPosition)
      ctx.addIssue({ code: 'custom', message: 'MOVE requiere targetPosition' });
    if (o.type === 'ATTACK' && !o.targetFormationId)
      ctx.addIssue({ code: 'custom', message: 'ATTACK requiere targetFormationId' });
    if (o.type === 'SET_FORMATION' && !o.formationPreset)
      ctx.addIssue({ code: 'custom', message: 'SET_FORMATION requiere formationPreset' });
  });
export type TacticalOrder = z.infer<typeof tacticalOrderSchema>;

export const unitStackSnapshotSchema = z.object({
  stackId: z.string().min(1).max(64),
  unitType: z.enum(UNIT_TYPES),
  count: finiteInt(0, 1_000_000),
});
export type UnitStackSnapshot = z.infer<typeof unitStackSnapshotSchema>;

export const participantSnapshotSchema = z.object({
  playerId: z.string().min(1).max(64),
  displayName: z.string().max(64),
  side: z.enum(BATTLE_SIDES),
  civilizationId: z.enum(CIVILIZATION_IDS),
  doctrineId: z.enum(['HOLD_LINE', 'AGGRESSIVE']),
  units: z.array(unitStackSnapshotSchema).min(1).max(12),
  techModifiers: z.record(z.string(), z.number()),
  /** Bando controlado por la doctrina (bot de entrenamiento). */
  controlledBy: z.enum(['PLAYER', 'DOCTRINE']),
});
export type ParticipantSnapshot = z.infer<typeof participantSnapshotSchema>;

export const tacticalBattleSnapshotSchema = z
  .object({
    schemaVersion: z.literal(TACTICAL_CONTRACT_VERSION),
    encounterId: uuid,
    worldId: uuid.nullable(),
    seasonId: uuid.nullable(),
    mode: z.enum(['WORLD_PVP', 'TRAINING']),
    rulesetVersion: z.string().min(1),
    tacticalRulesetVersion: z.string().min(1),
    contentVersion: z.string().min(1),
    seed: z.string().min(1).max(128),
    terrainId: z.string().min(1),
    terrainSeed: z.string().min(1),
    participants: z.tuple([participantSnapshotSchema, participantSnapshotSchema]),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: z.iso.datetime(),
  })
  .superRefine((s, ctx) => {
    if (s.mode === 'TRAINING' && (s.worldId !== null || s.seasonId !== null))
      ctx.addIssue({ code: 'custom', message: 'TRAINING no pertenece a ningún mundo' });
    if (s.mode === 'WORLD_PVP' && (!s.worldId || s.seasonId !== s.worldId))
      ctx.addIssue({
        code: 'custom',
        message: 'WORLD_PVP exige worldId y seasonId = worldId (1 mundo = 1 temporada)',
      });
    if (s.participants[0].side !== 'ATTACKER' || s.participants[1].side !== 'DEFENDER')
      ctx.addIssue({ code: 'custom', message: 'participants = [ATTACKER, DEFENDER]' });
  });
export type TacticalBattleSnapshot = z.infer<typeof tacticalBattleSnapshotSchema>;

/** Claims del ticket de sala de un uso (ADR-0026). */
export const battleJoinTicketClaimsSchema = z.object({
  v: z.literal(1),
  aud: z.literal('battle-server'),
  mode: z.enum(['TRAINING', 'WORLD_PVP']),
  worldId: uuid.nullable(),
  seasonId: uuid.nullable(),
  encounterId: uuid,
  roomId: z.string().min(1).max(64),
  playerId: z.string().min(1).max(64),
  side: z.enum(BATTLE_SIDES),
  role: z.enum(['PLAYER', 'SPECTATOR']),
  jti: uuid,
  iat: z.number().int(),
  exp: z.number().int(),
});
export type BattleJoinTicketClaims = z.infer<typeof battleJoinTicketClaimsSchema>;

const casualtySchema = z.object({
  stackId: z.string(),
  unitType: z.enum(UNIT_TYPES),
  initial: finiteInt(0, 1_000_000),
  dead: finiteInt(0, 1_000_000),
  remaining: finiteInt(0, 1_000_000),
});

const resultCore = {
  schemaVersion: z.literal(TACTICAL_CONTRACT_VERSION),
  encounterId: uuid,
  rulesetVersion: z.string(),
  tacticalRulesetVersion: z.string(),
  seed: z.string(),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
  winner: z.enum(['ATTACKER', 'DEFENDER', 'DRAW']),
  endReason: z.enum(['ELIMINATION', 'TIMEOUT', 'ABANDONED']),
  ticks: finiteInt(0, 10_000_000),
  casualties: z.array(casualtySchema.extend({ side: z.enum(BATTLE_SIDES) })),
  finalStateHash: z.string().regex(/^[0-9a-f]{64}$/),
  eventLogHash: z.string().regex(/^[0-9a-f]{64}$/),
  resultHash: z.string().regex(/^[0-9a-f]{64}$/),
  finishedAt: z.iso.datetime(),
};

/** Resultado de entrenamiento: NUNCA se aplica al mundo (ADR-0037, INT-013). */
export const trainingResultSchema = z.object({
  ...resultCore,
  mode: z.literal('TRAINING'),
  worldId: z.null(),
  seasonId: z.null(),
});
export type TrainingResult = z.infer<typeof trainingResultSchema>;

/** Resultado canónico aplicable al mundo (Gate 2; aún sin endpoint de commit). */
export const battleCanonicalResultSchema = z.object({
  ...resultCore,
  mode: z.enum(['AUTO', 'WORLD_PVP']),
  worldId: uuid,
  seasonId: uuid,
  loot: z.array(
    z.object({
      resource: z.enum(['wood', 'stone', 'iron', 'food']),
      amountFixed: z.string().regex(/^\d+$/),
    }),
  ),
  fortificationDamage: z.array(
    z.object({ buildingId: z.string(), amount: finiteInt(0, 1_000_000) }),
  ),
});
export type BattleCanonicalResult = z.infer<typeof battleCanonicalResultSchema>;

/** Registro de órdenes aplicadas: base del replay auditable (ADR-0029). */
export const replayInputSchema = z.object({
  tick: finiteInt(0, 10_000_000),
  side: z.enum(BATTLE_SIDES),
  source: z.enum(['PLAYER', 'DOCTRINE']),
  order: tacticalOrderSchema,
  /** Como en `battle_inputs` del PRD: también se registran las rechazadas y su motivo. */
  accepted: z.boolean(),
  reason: z.string().max(64).nullable(),
});
export type ReplayInput = z.infer<typeof replayInputSchema>;

// ---------------------------------------------------------------------------
// Entrenamiento (Gate 1) — API REST
// ---------------------------------------------------------------------------
export const TRAINING_ARMY_PRESETS = ['balanced', 'cavalry_raid', 'archer_line', 'large'] as const;

export const createTrainingMatchRequestSchema = z.object({
  opponent: z.enum(['DOCTRINE', 'PLAYER']),
  civilization: z.enum(CIVILIZATION_IDS),
  army: z.enum(TRAINING_ARMY_PRESETS),
  opponentArmy: z.enum(TRAINING_ARMY_PRESETS).default('balanced'),
  opponentCivilization: z.enum(CIVILIZATION_IDS).default('sea_league'),
  terrainId: z.literal('plain').default('plain'),
});
export type CreateTrainingMatchRequest = z.input<typeof createTrainingMatchRequestSchema>;

export const joinTrainingMatchRequestSchema = z.object({
  civilization: z.enum(CIVILIZATION_IDS),
  army: z.enum(TRAINING_ARMY_PRESETS),
});
export type JoinTrainingMatchRequest = z.infer<typeof joinTrainingMatchRequestSchema>;

export interface TrainingMatchView {
  id: string;
  inviteCode: string;
  status: 'WAITING_OPPONENT' | 'LIVE' | 'FINISHED' | 'EXPIRED' | 'FAILED';
  opponent: 'DOCTRINE' | 'PLAYER';
  terrainId: string;
  mySide: TacticalSide;
  hostName: string;
  guestName: string | null;
  createdAt: string;
  expiresAt: string;
  result: TrainingResult | null;
}

export interface JoinTicketResponse {
  roomId: string;
  ticket: string;
  side: TacticalSide;
  battleServerUrl: string;
  expiresAt: string;
}

export interface BattleConfigView {
  trainingEnabled: boolean;
  worldPvpEnabled: boolean;
  battleServerHealthy: boolean;
  tacticalRulesetVersion: string;
  tickHz: number;
  maxRooms: number;
  maxFormationsPerSide: number;
  inviteTimeoutSeconds: number;
  reconnectSeconds: number;
  matchMaxSeconds: number;
}
