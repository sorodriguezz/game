import {
  arenaDef,
  getRuleset,
  getTacticalRuleset,
  unitDef,
  type ArenaDef,
  type Ruleset,
  type TacticalRuleset,
  type UnitType,
} from '@reinos/game-config';
import type {
  FormationPreset,
  TacticalBattleSnapshot,
  TacticalOrder,
  TacticalSide,
} from '@reinos/contracts';
import { hashOf } from './hash.js';
import {
  buildNavGrid,
  costAt,
  distCm,
  findPath,
  isqrt,
  passable,
  CELL_FOREST,
  type NavGrid,
} from './nav.js';

/**
 * Simulación táctica autoritativa por FORMACIÓN con tick fijo (ADR-0025).
 * - Todo el estado es entero (cm, milésimas); orden estable por id.
 * - Sin `Math.random()` ni reloj: PRNG sfc32 con estado serializado.
 * - Las órdenes son intenciones; el servidor valida y decide (PRD-MVP2 §2.2).
 * Mismo snapshot + mismas órdenes por tick ⇒ mismo hash de estado (G1-10).
 */

export type FormationStatus =
  | 'IDLE'
  | 'MOVING'
  | 'ATTACKING'
  | 'HOLDING'
  | 'REFORMING'
  | 'FALLING_BACK'
  | 'ROUTED'
  | 'ESCAPED'
  | 'DESTROYED';

export interface FormationOrderState {
  type: 'NONE' | 'MOVE' | 'ATTACK' | 'HOLD' | 'RETREAT';
  tx: number;
  tz: number;
  targetId: string | null;
}

export interface Formation {
  id: string;
  side: TacticalSide;
  stackId: string;
  unitType: UnitType;
  initialCount: number;
  count: number;
  /** Bajas acumuladas en milésimas de soldado (resto entre ticks). */
  killCarry: number;
  morale: number;
  x: number;
  z: number;
  /** Orientación como vector ×1000. */
  fx: number;
  fz: number;
  preset: FormationPreset;
  reorgTicks: number;
  status: FormationStatus;
  order: FormationOrderState;
  path: Array<[number, number]>;
  repathIn: number;
  targetId: string | null;
  chargeTicks: number;
  movedLastTick: boolean;
  supportCooldown: number;
}

export type SimEvent =
  | { t: number; kind: 'PHASE'; phase: SimPhase }
  | { t: number; kind: 'ORDER_REJECTED'; side: TacticalSide; seq: number; reason: string }
  | { t: number; kind: 'CASUALTIES'; id: string; dead: number }
  | { t: number; kind: 'ROUTED'; id: string }
  | { t: number; kind: 'ESCAPED'; id: string }
  | { t: number; kind: 'DESTROYED'; id: string }
  | { t: number; kind: 'SUPPORT'; id: string; boosted: string[] }
  | { t: number; kind: 'FINISHED'; winner: Winner; reason: EndReason };

export type SimPhase = 'PREPARE' | 'FIGHT' | 'FINISHED';
export type Winner = 'ATTACKER' | 'DEFENDER' | 'DRAW';
export type EndReason = 'ELIMINATION' | 'TIMEOUT' | 'ABANDONED';

export interface SimState {
  encounterId: string;
  tick: number;
  phase: SimPhase;
  prepareTicks: number;
  maxTicks: number;
  prng: [number, number, number, number];
  formations: Formation[];
  winner: Winner | null;
  endReason: EndReason | null;
  eventLogHash: string;
  aiSeq: { ATTACKER: number; DEFENDER: number };
}

export interface SimContext {
  ruleset: Ruleset;
  tactical: TacticalRuleset;
  arena: ArenaDef;
  nav: NavGrid;
}

export interface QueuedOrder {
  side: TacticalSide;
  source: 'PLAYER' | 'DOCTRINE';
  order: TacticalOrder;
}

export interface StepOutcome {
  accepted: QueuedOrder[];
  rejected: Array<QueuedOrder & { reason: string }>;
  events: SimEvent[];
}

const ZERO_HASH = '0'.repeat(64);

/** Convierte el desenlace de un paso en filas de registro para replay/auditoría. */
export function toReplayInputs(
  tick: number,
  out: StepOutcome,
): import('@reinos/contracts').ReplayInput[] {
  return [
    ...out.accepted.map((q) => ({
      tick,
      side: q.side,
      source: q.source,
      order: q.order,
      accepted: true,
      reason: null,
    })),
    ...out.rejected.map((q) => ({
      tick,
      side: q.side,
      source: q.source,
      order: q.order,
      accepted: false,
      reason: q.reason,
    })),
  ];
}
const ON_FIELD = (f: Formation) => f.status !== 'ESCAPED' && f.status !== 'DESTROYED';
const CAN_FIGHT = (f: Formation) =>
  ON_FIELD(f) && f.status !== 'ROUTED' && f.status !== 'FALLING_BACK';

// ---------------------------------------------------------------------------
// PRNG sfc32 con estado explícito (serializable en el estado y el hash)
// ---------------------------------------------------------------------------
function seedState(seed: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function nextU32(s: SimState): number {
  let [a, b, c, d] = s.prng;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s.prng = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
  return t >>> 0;
}

// ---------------------------------------------------------------------------
// Construcción del estado inicial desde el snapshot autorizado
// ---------------------------------------------------------------------------
export function createContext(
  snapshot: Pick<TacticalBattleSnapshot, 'rulesetVersion' | 'tacticalRulesetVersion' | 'terrainId'>,
): SimContext {
  const tactical = getTacticalRuleset(snapshot.tacticalRulesetVersion);
  if (tactical.baseRulesetVersion !== snapshot.rulesetVersion) {
    throw new Error(
      `ruleset táctico ${tactical.version} requiere ${tactical.baseRulesetVersion}, no ${snapshot.rulesetVersion}`,
    );
  }
  const arena = arenaDef(tactical, snapshot.terrainId);
  return {
    ruleset: getRuleset(snapshot.rulesetVersion),
    tactical,
    arena,
    nav: buildNavGrid(arena),
  };
}

function defaultPreset(ctx: SimContext, unitType: UnitType): FormationPreset {
  const kind = ctx.tactical.units[unitType].kind;
  if (kind === 'ranged') return 'SKIRMISH';
  return unitDef(ctx.ruleset, unitType).unitClass === 'cavalry' ? 'WEDGE' : 'LINE';
}

/** Despliegue determinista: infantería al frente, arqueros detrás, caballería en flancos, apoyo atrás. */
export function createInitialState(snapshot: TacticalBattleSnapshot, ctx: SimContext): SimState {
  const { tactical, arena } = ctx;
  const formations: Formation[] = [];
  for (const p of snapshot.participants) {
    const prefix = p.side === 'ATTACKER' ? 'A' : 'D';
    const band = arena.deploy[p.side];
    const toward = p.side === 'ATTACKER' ? -1 : 1; // dirección hacia el enemigo en z
    const front = p.side === 'ATTACKER' ? band.zMin + 400 : band.zMax - 400;
    const rows: Record<'front' | 'second' | 'flank' | 'back', Formation[]> = {
      front: [],
      second: [],
      flank: [],
      back: [],
    };
    let n = 0;
    for (const stack of p.units) {
      let remaining = stack.count;
      while (remaining > 0) {
        const count = Math.min(remaining, tactical.limits.formationMaxUnits);
        remaining -= count;
        if (
          formations.length + 1 > tactical.limits.maxFormationsPerSide * 2 ||
          n >= tactical.limits.maxFormationsPerSide
        ) {
          throw new Error(`demasiadas formaciones para ${p.side}`);
        }
        const kind = tactical.units[stack.unitType].kind;
        const cls = unitDef(ctx.ruleset, stack.unitType).unitClass;
        const f: Formation = {
          id: `${prefix}${n++}`,
          side: p.side,
          stackId: stack.stackId,
          unitType: stack.unitType,
          initialCount: count,
          count,
          killCarry: 0,
          morale: tactical.morale.initial,
          x: 0,
          z: 0,
          fx: 0,
          fz: toward * 1000,
          preset: defaultPreset(ctx, stack.unitType),
          reorgTicks: 0,
          status: 'IDLE',
          order: { type: 'NONE', tx: 0, tz: 0, targetId: null },
          path: [],
          repathIn: 0,
          targetId: null,
          chargeTicks: 0,
          movedLastTick: false,
          supportCooldown: 0,
        };
        const row =
          kind === 'support'
            ? 'back'
            : kind === 'ranged'
              ? 'second'
              : cls === 'cavalry'
                ? 'flank'
                : 'front';
        rows[row].push(f);
        formations.push(f);
      }
    }
    const spacing = 1400;
    const centerX = arena.widthCm / 2;
    const place = (list: Formation[], depthOffset: number, xs?: number[]) => {
      const z = front - toward * depthOffset;
      list.forEach((f, i) => {
        const x = xs?.[i] ?? centerX + Math.round((i - (list.length - 1) / 2) * spacing);
        f.x = x;
        f.z = z;
      });
    };
    place(rows.front, 0);
    place(rows.second, 900);
    place(rows.back, 1700);
    const halfFront = Math.max(rows.front.length, rows.second.length, 2) * spacing * 0.5 + 1600;
    place(
      rows.flank,
      600,
      rows.flank.map((_, i) =>
        i % 2 === 0
          ? centerX - halfFront - Math.floor(i / 2) * spacing
          : centerX + halfFront + Math.floor(i / 2) * spacing,
      ),
    );
    // Garantiza celdas transitables dentro del escenario (desplaza hacia el centro si hace falta).
    for (const f of formations.filter((x) => x.side === p.side)) {
      f.x = Math.min(arena.widthCm - 600, Math.max(600, f.x));
      let guard = 0;
      while (!passable(ctx.nav, f.x, f.z) && guard++ < 200) f.x += f.x < centerX ? 400 : -400;
    }
  }
  formations.sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    encounterId: snapshot.encounterId,
    tick: 0,
    phase: 'PREPARE',
    prepareTicks: tactical.timing.prepareSeconds * tactical.timing.tickHz,
    maxTicks:
      (tactical.timing.prepareSeconds + tactical.timing.matchMaxSeconds) * tactical.timing.tickHz,
    prng: seedState(`${snapshot.seed}|${snapshot.snapshotHash}`),
    formations,
    winner: null,
    endReason: null,
    eventLogHash: ZERO_HASH,
    aiSeq: { ATTACKER: 1_000_000_000, DEFENDER: 1_000_000_000 },
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function radiusOf(ctx: SimContext, f: Formation): number {
  const g = ctx.tactical.formationGeometry;
  const base = g.baseRadiusCm + g.perSqrtUnitCm * isqrt(Math.max(1, f.count));
  return Math.floor((base * ctx.tactical.formations[f.preset].radiusPermille) / 1000);
}

function byId(s: SimState, id: string | null): Formation | undefined {
  return id ? s.formations.find((f) => f.id === id) : undefined;
}

/** Formaciones enemigas visibles para un bando (niebla de guerra simple, PRD-MVP2 §11). */
export function visibleTo(ctx: SimContext, s: SimState, side: TacticalSide): Set<string> {
  const r = ctx.tactical.combat.visionRadiusCm;
  const mine = s.formations.filter((f) => f.side === side && ON_FIELD(f));
  const out = new Set<string>();
  for (const e of s.formations) {
    if (e.side === side || !ON_FIELD(e)) continue;
    if (mine.some((m) => distCm(m.x, m.z, e.x, e.z) <= r)) out.add(e.id);
  }
  return out;
}

function speedOf(ctx: SimContext, f: Formation): number {
  const base = Math.floor(
    (unitDef(ctx.ruleset, f.unitType).speedTilesPerHour * ctx.tactical.movement.speedFactor) / 100,
  );
  let v = Math.floor((base * ctx.tactical.formations[f.preset].speedPermille) / 1000);
  if (f.status === 'FALLING_BACK')
    v = Math.floor((v * ctx.tactical.movement.retreatSpeedPermille) / 1000);
  if (f.status === 'ROUTED') v = Math.floor((v * ctx.tactical.movement.routSpeedPermille) / 1000);
  if (costAt(ctx.nav, f.x, f.z) === CELL_FOREST)
    v = Math.floor((v * ctx.tactical.movement.forestSpeedPermille) / 1000);
  return Math.max(1, v);
}

function escapeTarget(ctx: SimContext, f: Formation): [number, number] {
  const z =
    f.side === 'ATTACKER'
      ? ctx.arena.depthCm - ctx.arena.escapeMarginCm / 2
      : ctx.arena.escapeMarginCm / 2;
  // Busca un punto transitable del borde propio lo más recto posible.
  for (let d = 0; d < ctx.arena.widthCm; d += ctx.arena.cellCm) {
    for (const x of [f.x - d, f.x + d]) {
      if (x > 0 && x < ctx.arena.widthCm && passable(ctx.nav, x, z)) return [x, z];
    }
  }
  return [f.x, z];
}

function setPath(ctx: SimContext, f: Formation, tx: number, tz: number): boolean {
  const p = findPath(ctx.nav, f.x, f.z, tx, tz);
  if (!p) return false;
  f.path = p;
  return true;
}

// ---------------------------------------------------------------------------
// Validación y aplicación de órdenes
// ---------------------------------------------------------------------------
function applyOrder(
  ctx: SimContext,
  s: SimState,
  q: QueuedOrder,
  visible: Set<string>,
  events: SimEvent[],
): string | null {
  const o = q.order;
  const f = byId(s, o.formationId);
  if (!f) return 'UNKNOWN_FORMATION';
  if (f.side !== q.side) return 'WRONG_SIDE';
  if (!ON_FIELD(f) || f.status === 'ROUTED') return 'FORMATION_UNAVAILABLE';
  if (f.status === 'FALLING_BACK') return 'FORMATION_RETREATING';
  const kind = ctx.tactical.units[f.unitType].kind;
  switch (o.type) {
    case 'MOVE': {
      const t = o.targetPosition!;
      if (t.x < 0 || t.z < 0 || t.x >= ctx.arena.widthCm || t.z >= ctx.arena.depthCm)
        return 'OUT_OF_BOUNDS';
      if (!passable(ctx.nav, t.x, t.z)) return 'NOT_PASSABLE';
      if (!setPath(ctx, f, t.x, t.z)) return 'UNREACHABLE';
      f.order = { type: 'MOVE', tx: t.x, tz: t.z, targetId: null };
      f.targetId = null;
      if (f.status !== 'REFORMING') f.status = s.phase === 'FIGHT' ? 'MOVING' : 'IDLE';
      return null;
    }
    case 'ATTACK': {
      if (kind === 'support') return 'UNIT_CANNOT_ATTACK';
      const t = byId(s, o.targetFormationId ?? null);
      if (!t || t.side === f.side) return 'INVALID_TARGET';
      if (!ON_FIELD(t)) return 'INVALID_TARGET';
      if (!visible.has(t.id)) return 'NOT_VISIBLE';
      f.order = { type: 'ATTACK', tx: t.x, tz: t.z, targetId: t.id };
      f.targetId = t.id;
      f.path = [];
      f.repathIn = 0;
      return null;
    }
    case 'HOLD':
      f.order = { type: 'HOLD', tx: f.x, tz: f.z, targetId: null };
      f.path = [];
      if (f.status !== 'REFORMING') f.status = 'HOLDING';
      return null;
    case 'RETREAT': {
      const [ex, ez] = escapeTarget(ctx, f);
      if (!setPath(ctx, f, ex, ez)) return 'UNREACHABLE';
      f.order = { type: 'RETREAT', tx: ex, tz: ez, targetId: null };
      f.status = 'FALLING_BACK';
      f.targetId = null;
      return null;
    }
    case 'SET_FORMATION': {
      if (o.formationPreset === f.preset) return 'ALREADY_IN_FORMATION';
      f.preset = o.formationPreset!;
      f.reorgTicks = ctx.tactical.movement.reorgTicks;
      f.status = 'REFORMING';
      return null;
    }
    case 'SUPPORT': {
      if (kind !== 'support') return 'UNIT_CANNOT_SUPPORT';
      if (s.phase !== 'FIGHT') return 'NOT_IN_FIGHT';
      if (f.supportCooldown > 0) return 'ON_COOLDOWN';
      const m = ctx.tactical.morale;
      const boosted: string[] = [];
      for (const ally of s.formations) {
        if (ally.side !== f.side || !CAN_FIGHT(ally) || ally.id === f.id) continue;
        if (distCm(ally.x, ally.z, f.x, f.z) > m.supportRadiusCm) continue;
        ally.morale = Math.min(m.max, ally.morale + m.supportBoost);
        boosted.push(ally.id);
      }
      f.supportCooldown = m.supportCooldownTicks;
      events.push({ t: s.tick, kind: 'SUPPORT', id: f.id, boosted });
      return null;
    }
  }
  return 'UNKNOWN_ORDER';
}

// ---------------------------------------------------------------------------
// Paso de simulación
// ---------------------------------------------------------------------------
export function step(ctx: SimContext, s: SimState, orders: readonly QueuedOrder[]): StepOutcome {
  const out: StepOutcome = { accepted: [], rejected: [], events: [] };
  if (s.phase === 'FINISHED') return out;
  const pendingEvents: SimEvent[] = [];

  // 1. Órdenes en orden estable: bando, origen, secuencia.
  const sorted = [...orders].sort(
    (a, b) =>
      (a.side === b.side ? 0 : a.side === 'ATTACKER' ? -1 : 1) ||
      (a.source === b.source ? 0 : a.source === 'PLAYER' ? -1 : 1) ||
      a.order.seq - b.order.seq,
  );
  const vis = { ATTACKER: visibleTo(ctx, s, 'ATTACKER'), DEFENDER: visibleTo(ctx, s, 'DEFENDER') };
  for (const q of sorted) {
    const reason = applyOrder(ctx, s, q, vis[q.side], pendingEvents);
    if (reason) {
      out.rejected.push({ ...q, reason });
      pendingEvents.push({
        t: s.tick,
        kind: 'ORDER_REJECTED',
        side: q.side,
        seq: q.order.seq,
        reason,
      });
    } else out.accepted.push(q);
  }

  if (s.phase === 'PREPARE') {
    s.tick++;
    if (s.tick >= s.prepareTicks) {
      s.phase = 'FIGHT';
      pendingEvents.push({ t: s.tick, kind: 'PHASE', phase: 'FIGHT' });
      for (const f of s.formations)
        if (f.order.type === 'MOVE' && f.status === 'IDLE') f.status = 'MOVING';
    }
    return finishStep(s, out, pendingEvents);
  }

  const c = ctx.tactical.combat;
  // 2. Objetivos de combate.
  for (const f of s.formations) {
    f.targetId = null;
    if (!CAN_FIGHT(f) || ctx.tactical.units[f.unitType].kind === 'support') continue;
    const rf = radiusOf(ctx, f);
    const ordered = byId(s, f.order.type === 'ATTACK' ? f.order.targetId : null);
    if (ordered && ON_FIELD(ordered)) {
      f.targetId = ordered.id;
      continue;
    }
    if (f.order.type === 'ATTACK') f.order = { type: 'NONE', tx: 0, tz: 0, targetId: null };
    let best: Formation | undefined;
    let bestD = Infinity;
    const range =
      ctx.tactical.units[f.unitType].kind === 'ranged' ? ctx.tactical.units[f.unitType].rangeCm : 0;
    for (const e of s.formations) {
      if (e.side === f.side || !ON_FIELD(e)) continue;
      const d = distCm(f.x, f.z, e.x, e.z);
      const reach = Math.max(range, rf + radiusOf(ctx, e) + c.meleeContactCm);
      if (d <= reach && (d < bestD || (d === bestD && best && e.id < best.id))) {
        best = e;
        bestD = d;
      }
    }
    if (
      best &&
      (f.status !== 'MOVING' || range > 0 || bestD <= rf + radiusOf(ctx, best) + c.meleeContactCm)
    )
      f.targetId = best.id;
  }

  // 3. Movimiento (orden por id).
  for (const f of s.formations) {
    f.movedLastTick = false;
    if (!ON_FIELD(f)) continue;
    if (f.reorgTicks > 0) {
      f.reorgTicks--;
      if (f.reorgTicks === 0)
        f.status =
          f.order.type === 'MOVE' ? 'MOVING' : f.order.type === 'HOLD' ? 'HOLDING' : 'IDLE';
      continue;
    }
    const rf = radiusOf(ctx, f);
    const fleeing = f.status === 'FALLING_BACK' || f.status === 'ROUTED';
    if (!fleeing) {
      const t = byId(s, f.targetId);
      if (t) {
        const range =
          ctx.tactical.units[f.unitType].kind === 'ranged'
            ? ctx.tactical.units[f.unitType].rangeCm
            : 0;
        const reach = Math.max(range, rf + radiusOf(ctx, t) + c.meleeContactCm);
        if (distCm(f.x, f.z, t.x, t.z) <= reach) {
          f.status = 'ATTACKING';
          face(f, t.x - f.x, t.z - f.z);
          continue;
        }
        if (f.order.type === 'ATTACK') {
          if (f.repathIn <= 0 || f.path.length === 0) {
            if (!setPath(ctx, f, t.x, t.z)) f.path = [];
            f.repathIn = ctx.tactical.movement.repathEveryTicks;
          } else f.repathIn--;
          f.status = 'MOVING';
        } else {
          f.status = 'ATTACKING';
          continue;
        }
      } else if (f.order.type === 'MOVE' && f.path.length > 0) f.status = 'MOVING';
      else {
        f.status = f.order.type === 'HOLD' ? 'HOLDING' : 'IDLE';
        continue;
      }
    }
    if (f.path.length === 0) {
      if (fleeing) {
        const [ex, ez] = escapeTarget(ctx, f);
        if (!setPath(ctx, f, ex, ez)) continue;
      } else continue;
    }
    const before: [number, number] = [f.x, f.z];
    let budget = speedOf(ctx, f);
    while (budget > 0 && f.path.length > 0) {
      const [wx, wz] = f.path[0]!;
      const d = distCm(f.x, f.z, wx, wz);
      if (d <= budget) {
        f.x = wx;
        f.z = wz;
        budget -= Math.max(1, d);
        f.path.shift();
      } else {
        f.x += Math.trunc(((wx - f.x) * budget) / d);
        f.z += Math.trunc(((wz - f.z) * budget) / d);
        budget = 0;
      }
    }
    // Colisión con enemigos (no se atraviesan); quien huye puede alejarse.
    const blocked = s.formations.some(
      (e) =>
        e.side !== f.side &&
        ON_FIELD(e) &&
        distCm(f.x, f.z, e.x, e.z) < rf + radiusOf(ctx, e) &&
        distCm(f.x, f.z, e.x, e.z) < distCm(before[0], before[1], e.x, e.z),
    );
    if (blocked || !passable(ctx.nav, f.x, f.z)) {
      f.x = before[0];
      f.z = before[1];
    }
    if (f.x !== before[0] || f.z !== before[1]) {
      f.movedLastTick = true;
      face(f, f.x - before[0], f.z - before[1]);
    }
    if (f.order.type === 'MOVE' && f.path.length === 0 && !fleeing) {
      f.order = { type: 'NONE', tx: 0, tz: 0, targetId: null };
      f.status = 'IDLE';
    }
    if (fleeing) {
      const edge = f.side === 'ATTACKER' ? ctx.arena.depthCm - f.z : f.z;
      if (edge <= ctx.arena.escapeMarginCm) {
        f.status = 'ESCAPED';
        f.path = [];
        pendingEvents.push({ t: s.tick, kind: 'ESCAPED', id: f.id });
      }
    }
  }

  // 4. Combate: se calcula todo y luego se aplica (independiente del orden).
  const incoming = new Map<string, number>();
  for (const f of s.formations) {
    const t = byId(s, f.targetId);
    if (!t || !CAN_FIGHT(f) || !ON_FIELD(t) || f.count === 0) continue;
    const profile = ctx.tactical.units[f.unitType];
    const def = unitDef(ctx.ruleset, f.unitType);
    const dist = distCm(f.x, f.z, t.x, t.z);
    const meleeReach = radiusOf(ctx, f) + radiusOf(ctx, t) + c.meleeContactCm;
    const inMelee = dist <= meleeReach;
    const ranged = profile.kind === 'ranged' && !inMelee;
    if (!inMelee && !(profile.kind === 'ranged' && dist <= profile.rangeCm)) continue;
    // milésimas de vida por tick
    let dmg = Math.floor(
      (f.count * def.attack * c.damageNum * 1000) / (c.damageDen * ctx.tactical.timing.tickHz),
    );
    dmg = Math.floor((dmg * ctx.tactical.formations[f.preset].attackPermille) / 1000);
    if (profile.kind === 'ranged' && inMelee)
      dmg = Math.floor((dmg * profile.meleePenaltyPermille) / 1000);
    if (f.chargeTicks > 0) dmg = Math.floor((dmg * (1000 + profile.chargeBonusPermille)) / 1000);
    if (t.status === 'FALLING_BACK' || t.status === 'ROUTED')
      dmg = Math.floor((dmg * c.pursuitBonusPermille) / 1000);
    if (ranged)
      dmg = Math.floor((dmg * ctx.tactical.formations[t.preset].rangedTakenPermille) / 1000);
    dmg = Math.floor((dmg * 1000) / ctx.tactical.formations[t.preset].defensePermille);
    dmg = Math.floor((dmg * (950 + (nextU32(s) % 101))) / 1000); // variación ±5 % sembrada
    const tDef = unitDef(ctx.ruleset, t.unitType);
    const defense = def.unitClass === 'cavalry' ? tDef.cavalryDefense : tDef.infantryDefense;
    const hp = Math.max(1000, defense * c.hpScale * 1000);
    const milliKills = Math.floor((dmg * 1000) / hp);
    incoming.set(t.id, (incoming.get(t.id) ?? 0) + milliKills);
    if (inMelee && f.movedLastTick && f.chargeTicks === 0 && profile.chargeBonusPermille > 0)
      f.chargeTicks = c.chargeTicks;
  }
  const m = ctx.tactical.morale;
  for (const f of s.formations) {
    if (!ON_FIELD(f)) continue;
    const add = incoming.get(f.id) ?? 0;
    if (add > 0) {
      f.killCarry += add;
      const dead = Math.min(f.count, Math.floor(f.killCarry / 1000));
      f.killCarry -= dead * 1000;
      if (dead > 0) {
        f.count -= dead;
        f.morale = Math.max(
          0,
          f.morale - Math.floor((dead * m.lossFactorPermille) / f.initialCount),
        );
        pendingEvents.push({ t: s.tick, kind: 'CASUALTIES', id: f.id, dead });
      }
      if (f.count === 0) {
        f.status = 'DESTROYED';
        f.path = [];
        f.killCarry = 0;
        pendingEvents.push({ t: s.tick, kind: 'DESTROYED', id: f.id });
        continue;
      }
      if (f.morale <= m.routThreshold && f.status !== 'ROUTED') {
        f.status = 'ROUTED';
        f.order = { type: 'NONE', tx: 0, tz: 0, targetId: null };
        f.path = [];
        pendingEvents.push({ t: s.tick, kind: 'ROUTED', id: f.id });
      }
    } else if (f.status !== 'ROUTED') {
      f.morale = Math.min(m.max, f.morale + m.recoveryPerTick);
    }
    if (f.chargeTicks > 0) f.chargeTicks--;
    if (f.supportCooldown > 0) f.supportCooldown--;
  }

  // 5. Fin de la batalla.
  s.tick++;
  const alive = (side: TacticalSide) =>
    s.formations.some(
      (f) =>
        f.side === side &&
        CAN_FIGHT(f) &&
        f.count > 0 &&
        ctx.tactical.units[f.unitType].kind !== 'support',
    );
  const a = alive('ATTACKER');
  const d = alive('DEFENDER');
  if (!a || !d)
    end(s, !a && !d ? 'DRAW' : a ? 'ATTACKER' : 'DEFENDER', 'ELIMINATION', pendingEvents);
  else if (s.tick >= s.maxTicks) {
    const strength = (side: TacticalSide) =>
      s.formations
        .filter((f) => f.side === side && CAN_FIGHT(f))
        .reduce((acc, f) => acc + f.count * unitDef(ctx.ruleset, f.unitType).attack, 0);
    const sa = strength('ATTACKER');
    const sd = strength('DEFENDER');
    end(
      s,
      sa > sd ? 'ATTACKER' : sd > sa ? 'DEFENDER' : c.timeoutTieWinner,
      'TIMEOUT',
      pendingEvents,
    );
  }
  return finishStep(s, out, pendingEvents);
}

function face(f: Formation, dx: number, dz: number) {
  const len = isqrt(dx * dx + dz * dz);
  if (len === 0) return;
  f.fx = Math.trunc((dx * 1000) / len);
  f.fz = Math.trunc((dz * 1000) / len);
}

function end(s: SimState, winner: Winner, reason: EndReason, events: SimEvent[]) {
  s.phase = 'FINISHED';
  s.winner = winner;
  s.endReason = reason;
  events.push({ t: s.tick, kind: 'FINISHED', winner, reason });
}

/** Cierre por abandono/fallo (p. ej. sala vacía demasiado tiempo): política explícita. */
export function abandon(s: SimState, winner: Winner): SimEvent[] {
  if (s.phase === 'FINISHED') return [];
  const events: SimEvent[] = [];
  end(s, winner, 'ABANDONED', events);
  s.eventLogHash = hashOf({ prev: s.eventLogHash, events });
  return events;
}

function finishStep(s: SimState, out: StepOutcome, events: SimEvent[]): StepOutcome {
  out.events = events;
  if (events.length > 0) s.eventLogHash = hashOf({ prev: s.eventLogHash, events });
  return out;
}

/** Hash canónico del estado de simulación (checkpoint/replay). */
export function stateHash(s: SimState): string {
  return hashOf({
    tick: s.tick,
    phase: s.phase,
    prng: s.prng,
    winner: s.winner,
    formations: s.formations.map((f) => [
      f.id,
      f.count,
      f.killCarry,
      f.morale,
      f.x,
      f.z,
      f.fx,
      f.fz,
      f.preset,
      f.reorgTicks,
      f.status,
      f.order.type,
      f.order.targetId,
      f.chargeTicks,
      f.supportCooldown,
      f.path.length,
    ]),
  });
}
