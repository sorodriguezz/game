import {
  DEFAULT_TACTICAL_RULESET_VERSION,
  civilizationDef,
  getRuleset,
  getTacticalRuleset,
  resolveTrainingArmy,
  type CivilizationId,
} from '@reinos/game-config';
import {
  TACTICAL_CONTRACT_VERSION,
  tacticalBattleSnapshotSchema,
  type TacticalBattleSnapshot,
  type TacticalSide,
} from '@reinos/contracts';
import { hashOf } from './hash.js';

/** Versión del contenido visual/escenarios con la que se generó el snapshot (ADR-0034). */
export const CONTENT_VERSION = 'content-mvp2-blockout.0';

export interface TrainingSideInput {
  playerId: string;
  displayName: string;
  civilization: CivilizationId;
  army: string;
  controlledBy: 'PLAYER' | 'DOCTRINE';
}

/**
 * Snapshot inmutable de un entrenamiento (ADR-0024/0037): ejércitos
 * sintetizados desde el catálogo, nunca desde tropas reales del mundo.
 * Lo crea y firma (hash) la API; el battle-server solo lo verifica y ejecuta.
 */
export function buildTrainingSnapshot(input: {
  encounterId: string;
  seed: string;
  createdAt: string;
  terrainId: string;
  attacker: TrainingSideInput;
  defender: TrainingSideInput;
  tacticalRulesetVersion?: string;
}): TacticalBattleSnapshot {
  const tactical = getTacticalRuleset(
    input.tacticalRulesetVersion ?? DEFAULT_TACTICAL_RULESET_VERSION,
  );
  const ruleset = getRuleset(tactical.baseRulesetVersion);
  const participant = (side: TacticalSide, p: TrainingSideInput) => {
    const civ = civilizationDef(ruleset, p.civilization);
    const units = resolveTrainingArmy(tactical, p.army, civ.uniqueUnit).map((s, i) => ({
      stackId: `${side === 'ATTACKER' ? 'a' : 'd'}-${i}-${s.unitType}`,
      unitType: s.unitType,
      count: s.count,
    }));
    return {
      playerId: p.playerId,
      displayName: p.displayName,
      side,
      civilizationId: p.civilization,
      doctrineId: side === 'ATTACKER' ? ('AGGRESSIVE' as const) : ('HOLD_LINE' as const),
      units,
      techModifiers: {},
      controlledBy: p.controlledBy,
    };
  };
  const body = {
    schemaVersion: TACTICAL_CONTRACT_VERSION,
    encounterId: input.encounterId,
    worldId: null,
    seasonId: null,
    mode: 'TRAINING' as const,
    rulesetVersion: ruleset.version,
    tacticalRulesetVersion: tactical.version,
    contentVersion: CONTENT_VERSION,
    seed: input.seed,
    terrainId: input.terrainId,
    terrainSeed: `${input.terrainId}:${input.seed}`,
    participants: [
      participant('ATTACKER', input.attacker),
      participant('DEFENDER', input.defender),
    ] as [ReturnType<typeof participant>, ReturnType<typeof participant>],
    createdAt: input.createdAt,
  };
  return tacticalBattleSnapshotSchema.parse({ ...body, snapshotHash: hashOf(body) });
}

/** Comprueba integridad: el hash cubre todo el snapshot salvo el propio hash. */
export function verifySnapshotHash(s: TacticalBattleSnapshot): boolean {
  const { snapshotHash, ...body } = s;
  return hashOf(body) === snapshotHash;
}

/** Sustituye el control de un bando (p. ej. invitado que se une) sin alterar tropas; recalcula el hash. */
export function withParticipant(
  s: TacticalBattleSnapshot,
  side: TacticalSide,
  patch: { playerId: string; displayName: string; controlledBy: 'PLAYER' | 'DOCTRINE' },
): TacticalBattleSnapshot {
  const participants = s.participants.map((p) =>
    p.side === side ? { ...p, ...patch } : p,
  ) as TacticalBattleSnapshot['participants'];
  const { snapshotHash: _old, ...rest } = { ...s, participants };
  return { ...rest, snapshotHash: hashOf(rest) };
}
