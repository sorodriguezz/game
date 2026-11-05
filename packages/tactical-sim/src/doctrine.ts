import type { TacticalOrder, TacticalSide } from '@reinos/contracts';
import { distCm, passable } from './nav.js';
import {
  radiusOf,
  visibleTo,
  type Formation,
  type QueuedOrder,
  type SimContext,
  type SimState,
} from './simulation.js';

/**
 * Doctrina militar por reglas (no IA generativa, ADR-0011/0028): controla un
 * bando desconectado o el rival de entrenamiento. Emite órdenes que pasan por
 * la MISMA validación que las del jugador.
 */
export type DoctrineId = 'HOLD_LINE' | 'AGGRESSIVE';
export const DOCTRINE_PERIOD_TICKS = 10;

const fighting = (f: Formation) =>
  f.status !== 'ESCAPED' &&
  f.status !== 'DESTROYED' &&
  f.status !== 'ROUTED' &&
  f.status !== 'FALLING_BACK';

export function doctrineOrders(
  ctx: SimContext,
  s: SimState,
  side: TacticalSide,
  doctrine: DoctrineId,
): QueuedOrder[] {
  if (s.phase === 'FINISHED') return [];
  // Reparte la carga: cada bando decide en un tick distinto del período.
  if (s.tick % DOCTRINE_PERIOD_TICKS !== (side === 'ATTACKER' ? 0 : 5)) return [];
  const visible = visibleTo(ctx, s, side);
  const mine = s.formations.filter((f) => f.side === side && fighting(f));
  const enemies = s.formations.filter((f) => visible.has(f.id));
  const out: QueuedOrder[] = [];
  const push = (order: Omit<TacticalOrder, 'seq' | 'requestedTick'>) => {
    s.aiSeq[side] += 1;
    out.push({
      side,
      source: 'DOCTRINE',
      order: { ...order, seq: s.aiSeq[side], requestedTick: s.tick } as TacticalOrder,
    });
  };
  const nearest = (f: Formation): Formation | undefined => {
    let best: Formation | undefined;
    let bd = Infinity;
    for (const e of enemies) {
      const d = distCm(f.x, f.z, e.x, e.z);
      if (d < bd || (d === bd && best && e.id < best.id)) {
        best = e;
        bd = d;
      }
    }
    return best;
  };
  const enemyBand = ctx.arena.deploy[side === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER'];
  const advanceZ = Math.floor((enemyBand.zMin + enemyBand.zMax) / 2);

  for (const f of mine) {
    const profile = ctx.tactical.units[f.unitType];
    if (f.status === 'REFORMING') continue;
    if (profile.kind === 'support') {
      if (s.phase !== 'FIGHT' || f.supportCooldown > 0) continue;
      const shaken = mine.some(
        (a) =>
          a.id !== f.id &&
          a.morale < 700 &&
          distCm(a.x, a.z, f.x, f.z) <= ctx.tactical.morale.supportRadiusCm,
      );
      if (shaken) push({ type: 'SUPPORT', formationId: f.id });
      continue;
    }
    const target = nearest(f);
    if (doctrine === 'AGGRESSIVE') {
      if (target) {
        if (f.order.type !== 'ATTACK' || f.order.targetId !== target.id)
          push({ type: 'ATTACK', formationId: f.id, targetFormationId: target.id });
      } else if (f.order.type === 'NONE' && f.status === 'IDLE') {
        let x = f.x;
        let guard = 0;
        while (!passable(ctx.nav, x, advanceZ) && guard++ < 50)
          x += x < ctx.arena.widthCm / 2 ? 400 : -400;
        push({ type: 'MOVE', formationId: f.id, targetPosition: { x, z: advanceZ } });
      }
      continue;
    }
    // HOLD_LINE: mantiene posición; responde a amenazas cercanas y dispara a distancia.
    const threatRange =
      profile.kind === 'ranged' ? profile.rangeCm + 1000 : radiusOf(ctx, f) + 2000;
    if (target && distCm(f.x, f.z, target.x, target.z) <= threatRange) {
      if (f.order.type !== 'ATTACK' || f.order.targetId !== target.id)
        push({ type: 'ATTACK', formationId: f.id, targetFormationId: target.id });
    } else if (f.order.type !== 'HOLD' && f.order.type !== 'ATTACK' && f.order.type !== 'MOVE') {
      push({ type: 'HOLD', formationId: f.id });
    }
  }
  return out;
}
