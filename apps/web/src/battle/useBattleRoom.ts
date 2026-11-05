import { useCallback, useEffect, useReducer } from 'react';
import { Client, type Room } from '@colyseus/sdk';
import type { TacticalOrder } from '@reinos/contracts';
import { api } from '../api.js';

/** Estado de una formación tal como llega del servidor (autoritativo). */
export interface FormationSnap {
  id: string;
  side: 'ATTACKER' | 'DEFENDER';
  unitType: string;
  count: number;
  initialCount: number;
  morale: number;
  x: number;
  z: number;
  fx: number;
  fz: number;
  preset: string;
  status: string;
  targetId: string;
}

export interface BattleHud {
  phase: string;
  tick: number;
  prepareTicks: number;
  maxTicks: number;
  tickHz: number;
  waitingForPlayers: boolean;
  attackerName: string;
  defenderName: string;
  attackerCiv: string;
  defenderCiv: string;
  attackerControl: string;
  defenderControl: string;
  attackerConnected: boolean;
  defenderConnected: boolean;
  winner: string;
  endReason: string;
  resultStatus: string;
}

/** Instantáneas para interpolar en el render (el cliente solo anima, ADR-0025). */
export interface FrameStore {
  prev: Map<string, FormationSnap>;
  curr: Map<string, FormationSnap>;
  receivedAt: number;
  tickMs: number;
}

export type Connection = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'ERROR';

const storage = {
  get(k: string): string | null {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* almacenamiento bloqueado: se sigue sin persistir */
    }
  },
};

function plain(f: Record<string, unknown>): FormationSnap {
  return {
    id: String(f.id),
    side: f.side as FormationSnap['side'],
    unitType: String(f.unitType),
    count: Number(f.count),
    initialCount: Number(f.initialCount),
    morale: Number(f.morale),
    x: Number(f.x),
    z: Number(f.z),
    fx: Number(f.fx),
    fz: Number(f.fz),
    preset: String(f.preset),
    status: String(f.status),
    targetId: String(f.targetId ?? ''),
  };
}

/**
 * Una sesión por partida, compartida y con conteo de referencias: el doble
 * montaje de React (StrictMode) o volver a la pantalla reutiliza la MISMA
 * conexión y el mismo ticket de un uso, en lugar de pedir otro.
 */
class BattleSession {
  connection: Connection = 'CONNECTING';
  error: string | null = null;
  hud: BattleHud | null = null;
  mySide: 'ATTACKER' | 'DEFENDER' | null = null;
  rttMs: number | null = null;
  rejections: Array<{ seq: number; reason: string; at: number }> = [];
  result: { recorded: boolean; result: unknown } | null = null;
  readonly frames: { current: FrameStore } = {
    current: { prev: new Map(), curr: new Map(), receivedAt: 0, tickMs: 100 },
  };
  private room: Room | null = null;
  private listeners = new Set<() => void>();
  private seq: number;
  private ping?: ReturnType<typeof setInterval>;
  refs = 0;
  leaveTimer?: ReturnType<typeof setTimeout>;

  constructor(readonly matchId: string) {
    const stored = Number(storage.get(`reinos.battle.seq.${matchId}`) ?? 0);
    this.seq = Math.max(stored, Math.floor(Date.now() / 1000) - 1_700_000_000);
    void this.connect();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private async connect() {
    try {
      const ticket = await api.trainingTicket(this.matchId);
      const client = new Client(new URL(ticket.battleServerUrl, window.location.origin).toString());
      const tokenKey = `reinos.battle.reconnect.${this.matchId}`;
      const token = storage.get(tokenKey);
      // Tras recargar la página: reingreso con el token de reconexión si sigue vigente (NET-011).
      let room: Room | null = token ? await client.reconnect(token).catch(() => null) : null;
      room ??= await client.joinById(ticket.roomId, { ticket: ticket.ticket });
      this.room = room;
      this.mySide = ticket.side;
      storage.set(tokenKey, room.reconnectionToken);
      this.connection = 'CONNECTED';
      this.bind(room);
      if (this.refs === 0) this.dispose();
    } catch (e) {
      this.connection = 'ERROR';
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.emit();
  }

  private bind(room: Room) {
    room.onStateChange((state: Record<string, unknown>) => {
      const f = this.frames.current;
      f.prev = f.curr;
      const next = new Map<string, FormationSnap>();
      (state.formations as Map<string, Record<string, unknown>> | undefined)?.forEach((v, k) =>
        next.set(k, plain(v)),
      );
      f.curr = next;
      f.receivedAt = performance.now();
      f.tickMs = 1000 / (Number(state.tickHz) || 10);
      this.hud = {
        phase: String(state.phase),
        tick: Number(state.tick),
        prepareTicks: Number(state.prepareTicks),
        maxTicks: Number(state.maxTicks),
        tickHz: Number(state.tickHz),
        waitingForPlayers: Boolean(state.waitingForPlayers),
        attackerName: String(state.attackerName),
        defenderName: String(state.defenderName),
        attackerCiv: String(state.attackerCiv),
        defenderCiv: String(state.defenderCiv),
        attackerControl: String(state.attackerControl),
        defenderControl: String(state.defenderControl),
        attackerConnected: Boolean(state.attackerConnected),
        defenderConnected: Boolean(state.defenderConnected),
        winner: String(state.winner ?? ''),
        endReason: String(state.endReason ?? ''),
        resultStatus: String(state.resultStatus ?? ''),
      };
      this.emit();
    });
    room.onMessage('order.rejected', (m: { seq: number; reason: string }) => {
      this.rejections = [...this.rejections.slice(-4), { ...m, at: Date.now() }];
      this.emit();
    });
    room.onMessage('pong', (t: number) => {
      this.rttMs = Math.round(performance.now() - t);
    });
    room.onMessage('battle.result.recorded', (m: { recorded: boolean; result: unknown }) => {
      this.result = m;
      this.emit();
    });
    room.onMessage('*', () => {});
    room.onDrop(() => {
      this.connection = 'RECONNECTING';
      this.emit();
    });
    room.onReconnect(() => {
      this.connection = 'CONNECTED';
      this.emit();
    });
    room.onLeave(() => {
      this.connection = 'DISCONNECTED';
      this.emit();
    });
    this.ping = setInterval(() => room.send('ping', performance.now()), 2000);
  }

  send(order: Omit<TacticalOrder, 'seq' | 'requestedTick'>) {
    if (!this.room) return;
    this.seq += 1;
    storage.set(`reinos.battle.seq.${this.matchId}`, String(this.seq));
    this.room.send('order', { ...order, seq: this.seq, requestedTick: this.hud?.tick ?? 0 });
  }

  dispose() {
    if (this.ping) clearInterval(this.ping);
    void this.room?.leave();
    this.room = null;
    sessions.delete(this.matchId);
  }
}

const sessions = new Map<string, BattleSession>();

function acquire(matchId: string): BattleSession {
  let s = sessions.get(matchId);
  if (!s) {
    s = new BattleSession(matchId);
    sessions.set(matchId, s);
  }
  if (s.leaveTimer) clearTimeout(s.leaveTimer);
  s.refs++;
  return s;
}

function release(s: BattleSession) {
  s.refs--;
  if (s.refs <= 0) s.leaveTimer = setTimeout(() => s.dispose(), 400);
}

const EMPTY_FRAMES: { current: FrameStore } = {
  current: { prev: new Map(), curr: new Map(), receivedAt: 0, tickMs: 100 },
};

export function useBattleRoom(matchId: string) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const s = acquire(matchId);
    const unsub = s.subscribe(rerender);
    rerender();
    return () => {
      unsub();
      release(s);
    };
  }, [matchId]);
  const send = useCallback(
    (o: Omit<TacticalOrder, 'seq' | 'requestedTick'>) => sessions.get(matchId)?.send(o),
    [matchId],
  );
  const session = sessions.get(matchId);
  return {
    connection: session?.connection ?? ('CONNECTING' as Connection),
    error: session?.error ?? null,
    hud: session?.hud ?? null,
    mySide: session?.mySide ?? null,
    rttMs: session?.rttMs ?? null,
    rejections: session?.rejections ?? [],
    result: session?.result ?? null,
    frames: session?.frames ?? EMPTY_FRAMES,
    send,
  };
}
