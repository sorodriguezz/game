import {
  TACTICAL_CONTRACT_VERSION,
  trainingResultSchema,
  type ReplayInput,
  type TacticalBattleSnapshot,
  type TrainingResult,
} from '@reinos/contracts';
import { hashOf } from './hash.js';
import {
  abandon,
  createContext,
  createInitialState,
  stateHash,
  step,
  toReplayInputs,
  type QueuedOrder,
  type SimState,
  type Winner,
} from './simulation.js';

/** Agrega bajas por pila del snapshot (los supervivientes que escapan o huyen cuentan como restantes). */
export function casualtiesOf(snapshot: TacticalBattleSnapshot, s: SimState) {
  return snapshot.participants.flatMap((p) =>
    p.units.map((u) => {
      const fs = s.formations.filter((f) => f.stackId === u.stackId);
      const remaining = fs.reduce((a, f) => a + f.count, 0);
      return {
        side: p.side,
        stackId: u.stackId,
        unitType: u.unitType,
        initial: u.count,
        dead: u.count - remaining,
        remaining,
      };
    }),
  );
}

/**
 * Resultado de ENTRENAMIENTO (tipo distinto del canónico del mundo: no se
 * puede aplicar a tablas M1, ADR-0037). `finishedAt` no entra en el hash para
 * que el replay reproduzca exactamente `resultHash`.
 */
export function buildTrainingResult(
  snapshot: TacticalBattleSnapshot,
  s: SimState,
  finishedAt: string,
): TrainingResult {
  if (snapshot.mode !== 'TRAINING') throw new Error('buildTrainingResult solo para TRAINING');
  if (s.phase !== 'FINISHED' || !s.winner || !s.endReason)
    throw new Error('la batalla no ha terminado');
  const core = {
    schemaVersion: TACTICAL_CONTRACT_VERSION,
    mode: 'TRAINING' as const,
    encounterId: snapshot.encounterId,
    worldId: null,
    seasonId: null,
    rulesetVersion: snapshot.rulesetVersion,
    tacticalRulesetVersion: snapshot.tacticalRulesetVersion,
    seed: snapshot.seed,
    snapshotHash: snapshot.snapshotHash,
    winner: s.winner,
    endReason: s.endReason,
    ticks: s.tick,
    casualties: casualtiesOf(snapshot, s),
    finalStateHash: stateHash(s),
    eventLogHash: s.eventLogHash,
  };
  return trainingResultSchema.parse({ ...core, resultHash: hashOf(core), finishedAt });
}

export interface ReplayLog {
  snapshot: TacticalBattleSnapshot;
  inputs: ReplayInput[];
  /** Cierre por abandono (no es una orden): tick y ganador aplicados por política. */
  abandoned: { tick: number; winner: Winner } | null;
}

export class ReplayDivergence extends Error {}

/**
 * Re-ejecuta la batalla desde el snapshot y las órdenes registradas (ADR-0029).
 * No escribe en ningún sitio. Lanza si una orden registrada ya no es válida.
 */
export function runReplay(log: ReplayLog): { state: SimState; finalStateHash: string } {
  const ctx = createContext(log.snapshot);
  const s = createInitialState(log.snapshot, ctx);
  const byTick = new Map<number, QueuedOrder[]>();
  const byTickRaw = new Map<number, ReplayInput[]>();
  for (const i of log.inputs) {
    const list = byTick.get(i.tick) ?? [];
    list.push({ side: i.side, source: i.source, order: i.order });
    byTick.set(i.tick, list);
    byTickRaw.set(i.tick, [...(byTickRaw.get(i.tick) ?? []), i]);
  }
  let guard = 0;
  while (s.phase !== 'FINISHED' && guard++ < s.maxTicks + 10) {
    if (log.abandoned && s.tick === log.abandoned.tick) {
      abandon(s, log.abandoned.winner);
      break;
    }
    const tick = s.tick;
    const logged = byTickRaw.get(tick) ?? [];
    const out = step(ctx, s, byTick.get(tick) ?? []);
    // Cada orden registrada debe obtener el mismo veredicto (y motivo) que en la partida original.
    const verdict = new Map(
      toReplayInputs(tick, out).map((r) => [`${r.side}|${r.source}|${r.order.seq}`, r]),
    );
    for (const l of logged) {
      const v = verdict.get(`${l.side}|${l.source}|${l.order.seq}`);
      if (!v || v.accepted !== l.accepted || v.reason !== l.reason) {
        throw new ReplayDivergence(
          `divergencia en tick ${tick}: seq ${l.order.seq} esperaba ${l.accepted ? 'aceptada' : l.reason}`,
        );
      }
    }
  }
  return { state: s, finalStateHash: stateHash(s) };
}
