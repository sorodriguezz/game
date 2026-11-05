import { Room, ServerError, type Client } from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import {
  tacticalBattleSnapshotSchema,
  tacticalOrderSchema,
  type ReplayInput,
  type TacticalBattleSnapshot,
  type TacticalSide,
  type TrainingResult,
} from '@reinos/contracts';
import {
  abandon,
  buildTrainingResult,
  createContext,
  createInitialState,
  doctrineOrders,
  step,
  toReplayInputs,
  verifySnapshotHash,
  visibleTo,
  type DoctrineId,
  type QueuedOrder,
  type SimContext,
  type SimState,
} from '@reinos/tactical-sim';
import { JtiStore, serviceTokenMatches, verifyTicket } from '@reinos/tactical-sim/tickets';
import type { BattleServerConfig } from './config.js';
import { Metrics, log } from './metrics.js';
import { BattleState, FormationState, type BattleStateT, type FormationStateT } from './state.js';

export interface ResultPayload {
  result: TrainingResult;
  replay: {
    inputs: ReplayInput[];
    abandoned: { tick: number; winner: 'ATTACKER' | 'DEFENDER' | 'DRAW' } | null;
  };
}

export interface RoomDeps {
  config: BattleServerConfig;
  metrics: Metrics;
  jti: JtiStore;
  deliverResult: (encounterId: string, payload: ResultPayload) => Promise<void>;
  nowMs: () => number;
  /** Solo tests: intervalo real entre ticks (la simulación cuenta ticks, el resultado no cambia). */
  tickIntervalMs?: number;
}

let deps: RoomDeps | undefined;
/** Las salas las instancia el matchmaker; las dependencias son únicas por proceso (ADR-0031). */
export function setRoomDeps(d: RoomDeps): void {
  deps = d;
}
function D(): RoomDeps {
  if (!deps) throw new Error('battle-server sin dependencias configuradas');
  return deps;
}

interface ClientAuth {
  playerId: string;
  side: TacticalSide;
}

const SIDES: TacticalSide[] = ['ATTACKER', 'DEFENDER'];

/**
 * Sala táctica autoritativa (ADR-0022/0025/0026/0028). Gate 1: solo TRAINING.
 * La sala NO tiene acceso a la base de datos del mundo: recibe un snapshot
 * firmado (hash) creado por la API y devuelve un resultado por canal interno.
 */
export class TacticalRoom extends Room<{
  state: BattleStateT;
  client: Client<{ auth: ClientAuth }>;
}> {
  override maxClients = 2;
  override autoDispose = false;

  private snapshot!: TacticalBattleSnapshot;
  private ctx!: SimContext;
  private sim!: SimState;
  private pending: QueuedOrder[] = [];
  private replayLog: ReplayInput[] = [];
  private control: Record<TacticalSide, 'PLAYER' | 'DOCTRINE'> = {
    ATTACKER: 'DOCTRINE',
    DEFENDER: 'DOCTRINE',
  };
  private clientsBySide: Partial<Record<TacticalSide, Client>> = {};
  private seqBySide: Record<TacticalSide, number> = { ATTACKER: -1, DEFENDER: -1 };
  private tokens: Record<TacticalSide, number> = { ATTACKER: 0, DEFENDER: 0 };
  private schemaById = new Map<string, FormationStateT>();
  private waitingForPlayers = true;
  private lobbyDeadlineMs = 0;
  private emptySinceMs: number | null = null;
  private abandoned: ResultPayload['replay']['abandoned'] = null;
  private finishing = false;

  override onCreate(options: { snapshot?: unknown; internalToken?: unknown }): void {
    const d = D();
    // Solo la API (con token de servicio) puede crear salas; un cliente no.
    if (!serviceTokenMatches(options?.internalToken, d.config.serviceToken)) {
      throw new ServerError(403, 'creación de sala no autorizada');
    }
    const snap = tacticalBattleSnapshotSchema.parse(options.snapshot);
    if (!verifySnapshotHash(snap)) throw new ServerError(400, 'snapshot con hash inválido');
    if (snap.mode !== 'TRAINING')
      throw new ServerError(400, 'WORLD_PVP no habilitado hasta Gate 2 (ADR-0037)');
    this.snapshot = snap;
    this.roomId = snap.encounterId;
    this.ctx = createContext(snap);
    this.sim = createInitialState(snap, this.ctx);
    const timing = this.ctx.tactical.timing;
    this.lobbyDeadlineMs = d.nowMs() + timing.trainingLobbySeconds * 1000;

    const [att, def] = snap.participants;
    const st = new BattleState();
    st.encounterId = snap.encounterId;
    st.mode = snap.mode;
    st.terrainId = snap.terrainId;
    st.tacticalRulesetVersion = snap.tacticalRulesetVersion;
    st.phase = this.sim.phase;
    st.tick = 0;
    st.prepareTicks = this.sim.prepareTicks;
    st.maxTicks = this.sim.maxTicks;
    st.tickHz = timing.tickHz;
    st.waitingForPlayers = true;
    st.attackerName = att.displayName;
    st.defenderName = def.displayName;
    st.attackerCiv = att.civilizationId;
    st.defenderCiv = def.civilizationId;
    st.attackerControl = 'DOCTRINE';
    st.defenderControl = 'DOCTRINE';
    st.attackerConnected = false;
    st.defenderConnected = false;
    st.winner = '';
    st.endReason = '';
    st.resultStatus = '';
    for (const f of this.sim.formations) {
      const fs = new FormationState();
      fs.id = f.id;
      fs.side = f.side;
      fs.unitType = f.unitType;
      fs.initialCount = f.initialCount;
      this.schemaById.set(f.id, fs);
      st.formations.set(f.id, fs);
    }
    this.setState(st);
    this.syncState();
    this.setPatchRate(1000 / timing.tickHz);
    this.setSimulationInterval(() => this.tick(), d.tickIntervalMs ?? 1000 / timing.tickHz);
    this.onMessage('order', (client, msg) => this.onOrder(client, msg));
    this.onMessage('ping', (client, msg) => client.send('pong', typeof msg === 'number' ? msg : 0));
    d.metrics.roomsActive++;
    d.metrics.roomsCreatedTotal++;
    log('info', 'room.created', {
      encounter_id: snap.encounterId,
      mode: snap.mode,
      formations: this.sim.formations.length,
    });
  }

  override onAuth(_client: Client, options: { ticket?: unknown }): ClientAuth {
    const d = D();
    const v = verifyTicket(options?.ticket, d.config.signingKey, Math.floor(d.nowMs() / 1000));
    const deny = (reason: string, code = 401): never => {
      d.metrics.inc(d.metrics.ticketsRejectedTotal, reason);
      log('warn', 'ticket.rejected', { encounter_id: this.roomId, reason });
      throw new ServerError(code, reason);
    };
    if (!v.ok) return deny(v.error);
    const c = v.claims;
    if (c.roomId !== this.roomId || c.encounterId !== this.snapshot.encounterId)
      return deny('WRONG_ROOM', 403);
    if (c.mode !== this.snapshot.mode || c.worldId !== this.snapshot.worldId)
      return deny('WRONG_SCOPE', 403);
    if (c.role !== 'PLAYER') return deny('ROLE_NOT_ALLOWED', 403);
    const participant = this.snapshot.participants.find((p) => p.side === c.side)!;
    if (participant.playerId !== c.playerId || participant.controlledBy !== 'PLAYER')
      return deny('WRONG_SIDE', 403);
    if (this.clientsBySide[c.side]) return deny('SIDE_TAKEN', 409);
    if (!d.jti.consume(c.jti, c.exp, Math.floor(d.nowMs() / 1000))) return deny('TICKET_REUSED');
    return { playerId: c.playerId, side: c.side };
  }

  override onJoin(client: Client<{ auth: ClientAuth }>): void {
    const side = client.auth!.side;
    this.attach(client, side);
    log('info', 'player.joined', { encounter_id: this.roomId, side });
  }

  override onDrop(client: Client<{ auth: ClientAuth }>): void {
    const d = D();
    const side = client.auth!.side;
    d.metrics.disconnectsTotal++;
    this.detach(side);
    log('warn', 'player.dropped', { encounter_id: this.roomId, side });
    // La doctrina toma el mando; el jugador puede volver dentro de la ventana (PRD-MVP2 §8.2).
    this.allowReconnection(client, this.ctx.tactical.timing.reconnectSeconds);
  }

  override onReconnect(client: Client<{ auth: ClientAuth }>): void {
    D().metrics.reconnectsTotal++;
    this.attach(client, client.auth!.side);
    log('info', 'player.reconnected', { encounter_id: this.roomId, side: client.auth!.side });
  }

  override onLeave(client: Client<{ auth: ClientAuth }>): void {
    const side = client.auth?.side;
    if (side && this.clientsBySide[side] === client) this.detach(side);
  }

  override onDispose(): void {
    D().metrics.roomsActive--;
    log('info', 'room.disposed', { encounter_id: this.roomId });
  }

  private attach(client: Client, side: TacticalSide): void {
    this.clientsBySide[side] = client;
    this.control[side] = 'PLAYER';
    this.emptySinceMs = null;
    if (side === 'ATTACKER') {
      this.state.attackerControl = 'PLAYER';
      this.state.attackerConnected = true;
    } else {
      this.state.defenderControl = 'PLAYER';
      this.state.defenderConnected = true;
    }
    client.view = new StateView();
    this.refreshView(client, side);
  }

  private detach(side: TacticalSide): void {
    delete this.clientsBySide[side];
    this.control[side] = 'DOCTRINE';
    D().metrics.fallbackDoctrineTotal++;
    if (side === 'ATTACKER') {
      this.state.attackerControl = 'DOCTRINE';
      this.state.attackerConnected = false;
    } else {
      this.state.defenderControl = 'DOCTRINE';
      this.state.defenderConnected = false;
    }
  }

  private reject(client: Client, side: TacticalSide, seq: number, reason: string): void {
    const d = D();
    d.metrics.inc(d.metrics.rejectedOrdersTotal, reason);
    client.send('order.rejected', { seq, reason });
    void side;
  }

  /** Validación de transporte (NET-005/006/008); la semántica la valida el motor en el tick. */
  private onOrder(client: Client, raw: unknown): void {
    const auth = (client as Client<{ auth: ClientAuth }>).auth;
    if (!auth) return;
    const side = auth.side;
    const seq =
      typeof (raw as { seq?: unknown })?.seq === 'number' ? (raw as { seq: number }).seq : -1;
    const parsed = tacticalOrderSchema.safeParse(raw);
    if (!parsed.success) {
      D().metrics.invalidOrdersTotal++;
      return this.reject(client, side, seq, 'MALFORMED');
    }
    const o = parsed.data;
    if (this.sim.phase === 'FINISHED') return this.reject(client, side, o.seq, 'BATTLE_FINISHED');
    if (this.control[side] !== 'PLAYER' || this.clientsBySide[side] !== client)
      return this.reject(client, side, o.seq, 'NOT_IN_CONTROL');
    if (o.seq <= this.seqBySide[side]) return this.reject(client, side, o.seq, 'SEQ_NOT_MONOTONIC');
    this.seqBySide[side] = o.seq;
    if (this.tokens[side] < 1) return this.reject(client, side, o.seq, 'RATE_LIMITED');
    if (this.pending.length >= this.ctx.tactical.limits.maxPendingOrdersPerTick)
      return this.reject(client, side, o.seq, 'QUEUE_FULL');
    if (!o.formationId.startsWith(side === 'ATTACKER' ? 'A' : 'D'))
      return this.reject(client, side, o.seq, 'WRONG_SIDE');
    this.tokens[side] -= 1;
    this.pending.push({ side, source: 'PLAYER', order: o });
  }

  private refreshView(client: Client, side: TacticalSide): void {
    const view = client.view;
    if (!view) return;
    const visible = visibleTo(this.ctx, this.sim, side);
    const revealAll = this.sim.phase === 'FINISHED';
    for (const f of this.sim.formations) {
      const fs = this.schemaById.get(f.id)!;
      const shouldSee = revealAll || f.side === side || visible.has(f.id);
      if (shouldSee && !view.has(fs)) view.add(fs);
      else if (!shouldSee && view.has(fs)) view.remove(fs);
    }
  }

  private syncState(): void {
    const st = this.state;
    st.phase = this.sim.phase;
    st.tick = this.sim.tick;
    st.waitingForPlayers = this.waitingForPlayers;
    for (const f of this.sim.formations) {
      const fs = this.schemaById.get(f.id)!;
      if (fs.count !== f.count) fs.count = f.count;
      if (fs.morale !== f.morale) fs.morale = f.morale;
      if (fs.x !== f.x) fs.x = f.x;
      if (fs.z !== f.z) fs.z = f.z;
      if (fs.fx !== f.fx) fs.fx = f.fx;
      if (fs.fz !== f.fz) fs.fz = f.fz;
      if (fs.preset !== f.preset) fs.preset = f.preset;
      if (fs.status !== f.status) fs.status = f.status;
      const target = f.targetId ?? '';
      if (fs.targetId !== target) fs.targetId = target;
    }
  }

  private tick(): void {
    const d = D();
    if (this.finishing) return;
    const t0 = performance.now();
    const timing = this.ctx.tactical.timing;
    const now = d.nowMs();

    // Recarga del cubo de órdenes por bando (límite de frecuencia por jugador).
    const perTick = this.ctx.tactical.limits.ordersPerSecondPerPlayer / timing.tickHz;
    for (const s of SIDES)
      this.tokens[s] = Math.min(
        this.ctx.tactical.limits.ordersPerSecondPerPlayer,
        this.tokens[s] + perTick,
      );

    const humans = this.snapshot.participants
      .filter((p) => p.controlledBy === 'PLAYER')
      .map((p) => p.side);
    if (this.waitingForPlayers) {
      if (humans.every((s) => this.clientsBySide[s])) {
        this.waitingForPlayers = false;
        this.state.waitingForPlayers = false;
        log('info', 'room.started', { encounter_id: this.roomId });
      } else if (now > this.lobbyDeadlineMs) {
        this.abandonBattle('DRAW', 'lobby_timeout');
        return;
      } else {
        return; // reloj detenido: nada avanza sin los jugadores (sin ventaja por llegar antes)
      }
    }

    // Todos los humanos fuera más allá de la ventana de reconexión ⇒ cierre por abandono (TRAINING sin efectos).
    const anyConnected = humans.some((s) => this.clientsBySide[s]);
    if (!anyConnected) {
      this.emptySinceMs ??= now;
      if (now - this.emptySinceMs > timing.reconnectSeconds * 1000) {
        this.abandonBattle('DRAW', 'all_players_gone');
        return;
      }
    }

    const orders: QueuedOrder[] = this.pending.splice(0);
    for (const s of SIDES) {
      if (this.control[s] === 'DOCTRINE') {
        const doctrine = this.snapshot.participants.find((p) => p.side === s)!
          .doctrineId as DoctrineId;
        orders.push(...doctrineOrders(this.ctx, this.sim, s, doctrine));
      }
    }
    const tick = this.sim.tick;
    const out = step(this.ctx, this.sim, orders);
    this.replayLog.push(...toReplayInputs(tick, out));
    for (const r of out.rejected) {
      if (r.source !== 'PLAYER') continue;
      const c = this.clientsBySide[r.side];
      if (c) this.reject(c, r.side, r.order.seq, r.reason);
    }
    for (const e of out.events) {
      if (e.kind === 'PHASE' || e.kind === 'FINISHED') this.broadcast('battle.phase', e);
    }
    this.syncState();
    for (const s of SIDES) {
      const c = this.clientsBySide[s];
      if (c) this.refreshView(c, s);
    }
    d.metrics.observeTick(performance.now() - t0);
    if (this.sim.phase === 'FINISHED') void this.finish();
  }

  private abandonBattle(winner: 'ATTACKER' | 'DEFENDER' | 'DRAW', reason: string): void {
    log('warn', 'room.abandoned', { encounter_id: this.roomId, reason });
    this.abandoned = { tick: this.sim.tick, winner };
    abandon(this.sim, winner);
    this.syncState();
    void this.finish();
  }

  private async finish(): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    const d = D();
    const result = buildTrainingResult(this.snapshot, this.sim, new Date(d.nowMs()).toISOString());
    this.state.winner = result.winner;
    this.state.endReason = result.endReason;
    this.state.resultStatus = 'PENDING';
    for (const s of SIDES) {
      const c = this.clientsBySide[s];
      if (c) this.refreshView(c, s);
    }
    this.broadcast('battle.result.pending', { winner: result.winner });
    const payload: ResultPayload = {
      result,
      replay: { inputs: this.replayLog, abandoned: this.abandoned },
    };
    let delivered = false;
    for (let attempt = 0; attempt < 5 && !delivered; attempt++) {
      try {
        await d.deliverResult(this.snapshot.encounterId, payload);
        delivered = true;
      } catch (e) {
        log('warn', 'result.delivery_failed', {
          encounter_id: this.roomId,
          attempt,
          error: e instanceof Error ? e.message : String(e),
        });
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      }
    }
    if (delivered) d.metrics.resultsDeliveredTotal++;
    else d.metrics.resultsFailedTotal++;
    // TRAINING: si no se pudo registrar, se informa; no hay efectos persistentes que reconciliar.
    this.state.resultStatus = delivered ? 'RECORDED' : 'NOT_RECORDED';
    this.broadcast('battle.result.recorded', { recorded: delivered, result });
    log('info', 'room.finished', {
      encounter_id: this.roomId,
      winner: result.winner,
      reason: result.endReason,
      ticks: result.ticks,
      result_hash: result.resultHash,
      delivered,
    });
    this.clock.setTimeout(() => void this.disconnect(), 60_000);
  }
}
