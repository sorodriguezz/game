import { randomInt, randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, ne, or } from 'drizzle-orm';
import { accounts, trainingMatches } from '@reinos/db';
import {
  createTrainingMatchRequestSchema,
  joinTrainingMatchRequestSchema,
  trainingResultSchema,
  replayInputSchema,
  type CreateTrainingMatchRequest,
  type JoinTicketResponse,
  type JoinTrainingMatchRequest,
  type TacticalBattleSnapshot,
  type TrainingMatchView,
  type TrainingResult,
} from '@reinos/contracts';
import {
  DEFAULT_TACTICAL_RULESET_VERSION,
  getTacticalRuleset,
  type CivilizationId,
} from '@reinos/game-config';
import {
  buildTrainingResult,
  buildTrainingSnapshot,
  runReplay,
  ReplayDivergence,
} from '@reinos/tactical-sim';
import { signTicket } from '@reinos/tactical-sim/tickets';
import { z } from 'zod';
import { DomainError, err, type CoreContext } from './context.js';
import type { Actor } from './commands.js';
import { iso } from './util.js';

/** Puerta al battle-server (HTTP interno con token de servicio). Inyectable en tests. */
export interface BattleServerGateway {
  createRoom(snapshot: TacticalBattleSnapshot): Promise<{ roomId: string }>;
  health(): Promise<{ ok: boolean; capacityAvailable: boolean }>;
}

export class BattleServerUnavailable extends Error {}

export function httpBattleServerGateway(
  internalUrl: string,
  serviceToken: string,
): BattleServerGateway {
  return {
    async createRoom(snapshot) {
      let res: Response;
      try {
        res = await fetch(`${internalUrl}/internal/rooms`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-service-token': serviceToken },
          body: JSON.stringify({ snapshot }),
          signal: AbortSignal.timeout(4000),
        });
      } catch (e) {
        throw new BattleServerUnavailable(e instanceof Error ? e.message : String(e));
      }
      const body = (await res.json().catch(() => ({}))) as { roomId?: string; code?: string };
      if (res.status === 503 && body.code === 'ROOM_AT_CAPACITY')
        throw err.conflict(
          'ROOM_AT_CAPACITY',
          'No hay salas tácticas libres; reintenta en unos minutos',
        );
      if (!res.ok || !body.roomId)
        throw new BattleServerUnavailable(`battle-server ${res.status} ${body.code ?? ''}`);
      return { roomId: body.roomId };
    },
    async health() {
      try {
        const res = await fetch(`${internalUrl}/health`, { signal: AbortSignal.timeout(1500) });
        if (!res.ok) return { ok: false, capacityAvailable: false };
        const b = (await res.json()) as { capacityAvailable?: boolean };
        return { ok: true, capacityAvailable: b.capacityAvailable === true };
      } catch {
        return { ok: false, capacityAvailable: false };
      }
    },
  };
}

export interface TrainingOptions {
  enabled: boolean;
  signingKey: string;
  /** URL que usa el navegador para conectar con el battle-server (WSS en producción). */
  publicBattleServerUrl: string;
  gateway: BattleServerGateway;
}

type MatchRow = typeof trainingMatches.$inferSelect;

const DOCTRINE_PLAYER = { playerId: 'doctrine', displayName: 'Doctrina (IA de reglas)' };
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const resultPayloadSchema = z.object({
  result: trainingResultSchema,
  replay: z.object({
    inputs: z.array(replayInputSchema).max(200_000),
    abandoned: z
      .object({ tick: z.number().int().min(0), winner: z.enum(['ATTACKER', 'DEFENDER', 'DRAW']) })
      .nullable(),
  }),
});

/**
 * Entrenamiento táctico (Gate 1, ADR-0037). Invariante: este servicio solo
 * lee/escribe `training_matches`. No toca recursos, tropas, batallas,
 * eventos ni rankings del mundo (verificado por test de integración).
 */
export class TrainingService {
  constructor(
    private readonly ctx: CoreContext,
    private readonly opts: TrainingOptions,
  ) {}

  private assertEnabled(): void {
    if (!this.opts.enabled)
      throw new DomainError('FEATURE_DISABLED', 503, 'El entrenamiento táctico está desactivado');
  }

  private async displayName(accountId: string): Promise<string> {
    const [a] = await this.ctx.db
      .select({ n: accounts.displayName })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    return a?.n ?? 'Jugador';
  }

  private newInviteCode(): string {
    return Array.from({ length: 6 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join(
      '',
    );
  }

  private snapshotFor(
    m: MatchRow,
    hostName: string,
    guestName: string | null,
  ): TacticalBattleSnapshot {
    return buildTrainingSnapshot({
      encounterId: m.id,
      seed: m.seed,
      createdAt: iso(this.ctx.clock.now()),
      terrainId: m.terrainId,
      tacticalRulesetVersion: m.tacticalRulesetVersion,
      attacker: {
        playerId: m.hostAccountId,
        displayName: hostName,
        civilization: m.hostCivilization as CivilizationId,
        army: m.hostArmy,
        controlledBy: 'PLAYER',
      },
      defender:
        m.opponent === 'DOCTRINE'
          ? {
              ...DOCTRINE_PLAYER,
              civilization: m.guestCivilization as CivilizationId,
              army: m.guestArmy!,
              controlledBy: 'DOCTRINE',
            }
          : {
              playerId: m.guestAccountId!,
              displayName: guestName ?? 'Invitado',
              civilization: m.guestCivilization as CivilizationId,
              army: m.guestArmy!,
              controlledBy: 'PLAYER',
            },
    });
  }

  /** Crea la sala en el battle-server; si no está disponible, la partida queda FAILED (sin efectos). */
  private async startRoom(m: MatchRow, snapshot: TacticalBattleSnapshot): Promise<void> {
    try {
      const { roomId } = await this.opts.gateway.createRoom(snapshot);
      await this.ctx.db
        .update(trainingMatches)
        .set({ status: 'LIVE', snapshot, snapshotHash: snapshot.snapshotHash, roomId })
        .where(eq(trainingMatches.id, m.id));
    } catch (e) {
      await this.ctx.db
        .update(trainingMatches)
        .set({ status: 'FAILED' })
        .where(eq(trainingMatches.id, m.id));
      if (e instanceof DomainError) throw e;
      this.ctx.log.warn('training.battle_server_unavailable', {
        match_id: m.id,
        error: e instanceof Error ? e.message : String(e),
      });
      throw new DomainError(
        'BATTLE_SERVER_UNAVAILABLE',
        503,
        'El servidor táctico no está disponible',
      );
    }
  }

  async create(actor: Actor, input: CreateTrainingMatchRequest): Promise<TrainingMatchView> {
    this.assertEnabled();
    const req = createTrainingMatchRequestSchema.parse(input);
    const tactical = getTacticalRuleset(DEFAULT_TACTICAL_RULESET_VERSION);
    const now = this.ctx.clock.now();
    const id = randomUUID();
    const [m] = await this.ctx.db
      .insert(trainingMatches)
      .values({
        id,
        inviteCode: this.newInviteCode(),
        hostAccountId: actor.accountId,
        opponent: req.opponent,
        status: 'WAITING_OPPONENT',
        terrainId: req.terrainId,
        hostCivilization: req.civilization,
        hostArmy: req.army,
        guestCivilization: req.opponent === 'DOCTRINE' ? req.opponentCivilization : null,
        guestArmy: req.opponent === 'DOCTRINE' ? req.opponentArmy : null,
        tacticalRulesetVersion: tactical.version,
        seed: randomUUID(),
        createdAt: now,
        expiresAt: new Date(now.getTime() + tactical.timing.trainingLobbySeconds * 1000),
      })
      .returning();
    if (req.opponent === 'DOCTRINE') {
      const hostName = await this.displayName(actor.accountId);
      await this.startRoom(m!, this.snapshotFor(m!, hostName, null));
    }
    this.ctx.log.info('training.created', { match_id: id, opponent: req.opponent });
    return this.view(actor, id);
  }

  async join(
    actor: Actor,
    inviteCode: string,
    input: JoinTrainingMatchRequest,
  ): Promise<TrainingMatchView> {
    this.assertEnabled();
    const req = joinTrainingMatchRequestSchema.parse(input);
    const code = inviteCode.trim().toUpperCase();
    const now = this.ctx.clock.now();
    // Reserva atómica del puesto de invitado: dos invitados simultáneos nunca entran ambos.
    const [m] = await this.ctx.db
      .update(trainingMatches)
      .set({
        guestAccountId: actor.accountId,
        guestCivilization: req.civilization,
        guestArmy: req.army,
      })
      .where(
        and(
          eq(trainingMatches.inviteCode, code),
          eq(trainingMatches.status, 'WAITING_OPPONENT'),
          eq(trainingMatches.opponent, 'PLAYER'),
          ne(trainingMatches.hostAccountId, actor.accountId),
          or(
            isNull(trainingMatches.guestAccountId),
            eq(trainingMatches.guestAccountId, actor.accountId),
          ),
        ),
      )
      .returning();
    if (!m)
      throw err.conflict(
        'MATCH_NOT_JOINABLE',
        'Código de invitación no válido o partida ya ocupada',
      );
    if (m.expiresAt <= now) {
      await this.ctx.db
        .update(trainingMatches)
        .set({ status: 'EXPIRED' })
        .where(eq(trainingMatches.id, m.id));
      throw err.conflict('MATCH_NOT_JOINABLE', 'La invitación ha caducado');
    }
    const [hostName, guestName] = await Promise.all([
      this.displayName(m.hostAccountId),
      this.displayName(actor.accountId),
    ]);
    await this.startRoom(m, this.snapshotFor(m, hostName, guestName));
    return this.view(actor, m.id);
  }

  private async row(actor: Actor, id: string): Promise<MatchRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw err.notFound('BATTLE_NOT_FOUND', 'Entrenamiento no encontrado');
    const [m] = await this.ctx.db.select().from(trainingMatches).where(eq(trainingMatches.id, id));
    if (!m || (m.hostAccountId !== actor.accountId && m.guestAccountId !== actor.accountId)) {
      throw err.notFound('BATTLE_NOT_FOUND', 'Entrenamiento no encontrado');
    }
    return m;
  }

  async view(actor: Actor, id: string): Promise<TrainingMatchView> {
    const m = await this.row(actor, id);
    const [hostName, guestName] = await Promise.all([
      this.displayName(m.hostAccountId),
      m.guestAccountId
        ? this.displayName(m.guestAccountId)
        : Promise.resolve(m.opponent === 'DOCTRINE' ? DOCTRINE_PLAYER.displayName : null),
    ]);
    return {
      id: m.id,
      inviteCode: m.inviteCode,
      status: m.status,
      opponent: m.opponent,
      terrainId: m.terrainId,
      mySide: m.hostAccountId === actor.accountId ? 'ATTACKER' : 'DEFENDER',
      hostName,
      guestName,
      createdAt: iso(m.createdAt),
      expiresAt: iso(m.expiresAt),
      result: (m.result as TrainingResult | null) ?? null,
    };
  }

  async listMine(actor: Actor): Promise<TrainingMatchView[]> {
    const rows = await this.ctx.db
      .select({ id: trainingMatches.id })
      .from(trainingMatches)
      .where(
        or(
          eq(trainingMatches.hostAccountId, actor.accountId),
          eq(trainingMatches.guestAccountId, actor.accountId),
        ),
      )
      .orderBy(desc(trainingMatches.createdAt))
      .limit(20);
    return Promise.all(rows.map((r) => this.view(actor, r.id)));
  }

  /** Ticket de un uso (ADR-0026): sala, bando, jugador y caducidad corta. */
  async issueTicket(actor: Actor, id: string): Promise<JoinTicketResponse> {
    this.assertEnabled();
    const m = await this.row(actor, id);
    if (m.status !== 'LIVE' || !m.roomId)
      throw err.conflict('MATCH_NOT_JOINABLE', 'La partida no está en curso');
    const side = m.hostAccountId === actor.accountId ? 'ATTACKER' : 'DEFENDER';
    const ttl = getTacticalRuleset(m.tacticalRulesetVersion).timing.ticketTtlSeconds;
    const nowS = Math.floor(this.ctx.clock.now().getTime() / 1000);
    const ticket = signTicket(
      {
        v: 1,
        aud: 'battle-server',
        mode: 'TRAINING',
        worldId: null,
        seasonId: null,
        encounterId: m.id,
        roomId: m.roomId,
        playerId: actor.accountId,
        side,
        role: 'PLAYER',
        jti: randomUUID(),
        iat: nowS,
        exp: nowS + ttl,
      },
      this.opts.signingKey,
    );
    return {
      roomId: m.roomId,
      ticket,
      side,
      battleServerUrl: this.opts.publicBattleServerUrl,
      expiresAt: new Date((nowS + ttl) * 1000).toISOString(),
    };
  }

  /**
   * Registro del resultado enviado por el battle-server (canal interno). Valida
   * procedencia y coherencia re-ejecutando el replay (ADR-0027/0029). Idempotente:
   * mismo resultado ⇒ OK; distinto ⇒ incidente 409 sin sobrescribir.
   */
  async recordResult(
    encounterId: string,
    rawPayload: unknown,
  ): Promise<{ status: 'RECORDED' | 'ALREADY_RECORDED' }> {
    const payload = resultPayloadSchema.parse(rawPayload);
    const r = payload.result;
    if (r.encounterId !== encounterId)
      throw err.unprocessable('VALIDATION_FAILED', 'encounterId no coincide');
    const [m] = await this.ctx.db
      .select()
      .from(trainingMatches)
      .where(eq(trainingMatches.id, encounterId));
    if (!m) throw err.notFound('BATTLE_NOT_FOUND', 'Entrenamiento no encontrado');
    if (m.status === 'FINISHED') {
      if (m.resultHash === r.resultHash) return { status: 'ALREADY_RECORDED' };
      this.ctx.log.error('training.result_conflict', {
        match_id: m.id,
        stored: m.resultHash,
        received: r.resultHash,
      });
      throw err.conflict('ALREADY_COMMITTED', 'Ya existe otro resultado para este encuentro');
    }
    if (m.status !== 'LIVE' || !m.snapshot || r.snapshotHash !== m.snapshotHash) {
      throw err.conflict('VERSION_CONFLICT', 'El resultado no corresponde al snapshot autorizado');
    }
    const snapshot = m.snapshot as TacticalBattleSnapshot;
    let replayed: TrainingResult;
    try {
      const rep = runReplay({
        snapshot,
        inputs: payload.replay.inputs,
        abandoned: payload.replay.abandoned,
      });
      replayed = buildTrainingResult(snapshot, rep.state, r.finishedAt);
    } catch (e) {
      if (e instanceof ReplayDivergence)
        throw err.unprocessable('VALIDATION_FAILED', `replay no reproducible: ${e.message}`);
      throw e;
    }
    if (replayed.resultHash !== r.resultHash) {
      this.ctx.log.error('training.result_mismatch', { match_id: m.id });
      throw err.unprocessable('VALIDATION_FAILED', 'El replay no reproduce el resultado declarado');
    }
    const updated = await this.ctx.db
      .update(trainingMatches)
      .set({
        status: 'FINISHED',
        result: r,
        resultHash: r.resultHash,
        replay: payload.replay,
        finishedAt: new Date(r.finishedAt),
      })
      .where(and(eq(trainingMatches.id, m.id), eq(trainingMatches.status, 'LIVE')))
      .returning({ id: trainingMatches.id });
    if (updated.length === 0) return this.recordResult(encounterId, rawPayload);
    this.ctx.log.info('training.result_recorded', {
      match_id: m.id,
      winner: r.winner,
      reason: r.endReason,
    });
    return { status: 'RECORDED' };
  }
}
