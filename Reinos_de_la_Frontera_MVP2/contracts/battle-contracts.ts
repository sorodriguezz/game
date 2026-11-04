/**
 * Reinos de la Frontera · MVP 2 · CONTRATOS DE REFERENCIA
 * No es implementación lista para producción; los adaptadores deben validar
 * en runtime (Zod/JSON Schema/class-validator) antes de confiar en datos.
 */
export type UUID = string;
export type BattleMode = 'AUTO' | 'TRAINING' | 'WORLD_PVP';
export type BattleSide = 'ATTACKER' | 'DEFENDER';
export type EncounterState =
  | 'SNAPSHOTTED' | 'OFFERED' | 'AUTO_PENDING'
  | 'TACTICAL_RESERVED' | 'ROOM_ALLOCATING' | 'LIVE'
  | 'FALLBACK_PENDING' | 'RESULT_PENDING' | 'APPLIED' | 'CLOSED';
export type FormationOrderType =
  | 'MOVE' | 'ATTACK' | 'HOLD' | 'RETREAT'
  | 'SET_FORMATION' | 'SUPPORT';

export interface UnitStackSnapshot {
  stackId: UUID;
  unitType: string;
  count: number; // entero >= 0; no confiar en cliente
  rulesetVersion: string;
}

export interface ParticipantSnapshot {
  playerId: UUID;
  side: BattleSide;
  civilizationId: string;
  doctrineId: string;
  units: readonly UnitStackSnapshot[];
  techModifiers: Readonly<Record<string, number>>;
}

export interface TacticalBattleSnapshot {
  schemaVersion: 1;
  encounterId: UUID;
  worldId: UUID;
  seasonId: UUID | null; // usar la temporada real de MVP1 o mapping explícito
  mode: 'WORLD_PVP' | 'TRAINING'; // TRAINING sin efecto persistente
  rulesetVersion: string;
  contentVersion: string;
  seed: string;
  terrainId: string;
  terrainSeed: string;
  participants: readonly [ParticipantSnapshot, ParticipantSnapshot];
  snapshotHash: string; // hash canónico calculado por el servidor
  createdAt: string;
}

export interface BattleOffer {
  encounterId: UUID;
  worldId: UUID;
  state: 'OFFERED';
  expiresAt: string; // UTC emitido por servidor
  availableModes: readonly ('AUTO' | 'WORLD_PVP')[];
  myDecision: 'PENDING' | 'ACCEPT' | 'REJECT';
}

export interface BattleDecisionRequest {
  decision: 'ACCEPT' | 'REJECT';
  expectedStateVersion: number;
  idempotencyKey: UUID;
}

export interface BattleJoinTicketClaims {
  worldId: UUID;
  seasonId: UUID | null;
  encounterId: UUID;
  playerId: UUID;
  side: BattleSide;
  role: 'PLAYER' | 'SPECTATOR';
  jti: UUID;
  iat: number; // Unix seconds
  exp: number;
}

export interface TacticalOrder {
  type: FormationOrderType;
  formationId: UUID;
  seq: number; // estrictamente monótono por jugador/sala
  requestedTick: number;
  targetPosition?: { x: number; z: number };
  targetFormationId?: UUID;
  formationPreset?: 'LINE' | 'WEDGE' | 'SKIRMISH';
}

export interface FormationState {
  formationId: UUID;
  ownerSide: BattleSide;
  unitType: string;
  unitCount: number;
  hpTotal: number;
  morale: number;
  x: number;
  z: number;
  facingRadians: number;
  status: 'IDLE' | 'MOVING' | 'ATTACKING' | 'FALLING_BACK' | 'ROUTED';
}

export interface BattleTickState {
  encounterId: UUID;
  tick: number;
  phase: 'PREPARE' | 'FIGHT' | 'FINISHED';
  timeRemainingMs: number;
  formations: readonly FormationState[];
}

export interface BattleCanonicalResult {
  schemaVersion: 1;
  encounterId: UUID;
  worldId: UUID;
  seasonId: UUID | null;
  mode: 'AUTO' | 'WORLD_PVP'; // TRAINING jamás se persiste al mundo
  rulesetVersion: string;
  seed: string;
  snapshotHash: string;
  winner: 'ATTACKER' | 'DEFENDER' | 'DRAW';
  casualties: readonly {
    stackId: UUID;
    dead: number;
    wounded: number;
    remaining: number;
  }[];
  loot: readonly { resource: string; amountFixed: string }[];
  fortificationDamage: readonly { buildingId: UUID; amount: number }[];
  eventLogHash: string;
  resultHash: string;
  finishedAt: string;
}

export interface ApiError {
  code:
    | 'WORLD_MISMATCH' | 'SEASON_CLOSED' | 'PACT_RESTRICTS_ATTACK'
    | 'NOT_ELIGIBLE' | 'BATTLE_NOT_FOUND' | 'OFFER_EXPIRED'
    | 'ALREADY_COMMITTED' | 'INVALID_TICKET' | 'ROOM_AT_CAPACITY'
    | 'INVALID_ORDER' | 'WRONG_SIDE' | 'VERSION_CONFLICT';
  message: string;
  correlationId: UUID;
}
