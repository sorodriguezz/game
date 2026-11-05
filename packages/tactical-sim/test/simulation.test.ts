import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  battleCanonicalResultSchema,
  type TacticalOrder,
  type TacticalSide,
} from '@reinos/contracts';
import {
  buildNavGrid,
  buildTrainingResult,
  buildTrainingSnapshot,
  createContext,
  createInitialState,
  doctrineOrders,
  findPath,
  passable,
  runReplay,
  sha256Hex,
  stateHash,
  step,
  toReplayInputs,
  verifySnapshotHash,
  withParticipant,
  type QueuedOrder,
  type SimContext,
  type SimState,
} from '../src/index.js';
import type { ReplayInput } from '@reinos/contracts';

function snapshot(seed = 'semilla', attackerArmy = 'balanced', defenderArmy = 'balanced') {
  return buildTrainingSnapshot({
    encounterId: '6f1c2f7e-4d55-4a39-9a4d-0f0d0a3c1b11',
    seed,
    createdAt: '2026-11-05T00:00:00.000Z',
    terrainId: 'plain',
    attacker: {
      playerId: 'p-a',
      displayName: 'Atacante',
      civilization: 'imperial_crown',
      army: attackerArmy,
      controlledBy: 'DOCTRINE',
    },
    defender: {
      playerId: 'p-d',
      displayName: 'Defensor',
      civilization: 'sea_league',
      army: defenderArmy,
      controlledBy: 'DOCTRINE',
    },
  });
}

/** Ejecuta una batalla completa con doctrinas (y órdenes extra opcionales), registrando inputs aceptados. */
function runBattle(
  snap = snapshot(),
  extra: (s: SimState, ctx: SimContext) => QueuedOrder[] = () => [],
) {
  const ctx = createContext(snap);
  const s = createInitialState(snap, ctx);
  const inputs: ReplayInput[] = [];
  let guard = 0;
  while (s.phase !== 'FINISHED' && guard++ < s.maxTicks + 5) {
    const tick = s.tick;
    const orders = [
      ...extra(s, ctx),
      ...doctrineOrders(ctx, s, 'ATTACKER', 'AGGRESSIVE'),
      ...doctrineOrders(ctx, s, 'DEFENDER', 'HOLD_LINE'),
    ];
    const out = step(ctx, s, orders);
    inputs.push(...toReplayInputs(tick, out));
  }
  return { ctx, s, snap, inputs };
}

const order = (
  side: TacticalSide,
  o: Partial<TacticalOrder> & Pick<TacticalOrder, 'type' | 'formationId'>,
): QueuedOrder => ({
  side,
  source: 'PLAYER',
  order: { seq: 1, requestedTick: 0, ...o } as TacticalOrder,
});

describe('hash y snapshot', () => {
  it('SHA-256 puro coincide con node:crypto', () => {
    for (const s of [
      '',
      'abc',
      'á'.repeat(100),
      'x'.repeat(1000),
      JSON.stringify({ a: [1, 2, 3] }),
    ]) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s).digest('hex'));
    }
  });

  it('el snapshot de entrenamiento no pertenece a ningún mundo y detecta manipulaciones', () => {
    const s = snapshot();
    expect(s.mode).toBe('TRAINING');
    expect(s.worldId).toBeNull();
    expect(verifySnapshotHash(s)).toBe(true);
    const tampered = structuredClone(s);
    tampered.participants[0].units[0]!.count += 1000;
    expect(verifySnapshotHash(tampered)).toBe(false);
    const joined = withParticipant(s, 'DEFENDER', {
      playerId: 'p-x',
      displayName: 'Invitado',
      controlledBy: 'PLAYER',
    });
    expect(verifySnapshotHash(joined)).toBe(true);
    expect(joined.snapshotHash).not.toBe(s.snapshotHash);
  });
});

describe('navegación 2.5D', () => {
  const ctx = createContext(snapshot());
  const g = buildNavGrid(ctx.arena);

  it('agua y roca bloquean; el bosque es transitable', () => {
    expect(passable(g, 100 * 100, 46 * 100)).toBe(false); // estanque
    expect(passable(g, 70 * 100, 72 * 100)).toBe(false); // roca
    expect(passable(g, 10 * 100, 60 * 100)).toBe(true); // bosque
  });

  it('rodea el estanque y no permite destino en el agua', () => {
    const path = findPath(g, 100 * 100, 20 * 100, 100 * 100, 70 * 100)!;
    expect(path).not.toBeNull();
    for (const [x, z] of path) expect(passable(g, x, z)).toBe(true);
    expect(findPath(g, 100 * 100, 20 * 100, 100 * 100, 46 * 100)).toBeNull();
    expect(findPath(g, 100 * 100, 20 * 100, 100 * 100, 70 * 100)).toEqual(path); // determinista
  });
});

describe('simulación por formaciones (ADR-0025)', () => {
  it('despliega formaciones válidas dentro de su franja y dentro del límite por bando', () => {
    const snap = snapshot('s', 'large', 'large');
    const ctx = createContext(snap);
    const s = createInitialState(snap, ctx);
    expect(s.formations.filter((f) => f.side === 'ATTACKER')).toHaveLength(12);
    expect(s.formations.filter((f) => f.side === 'DEFENDER')).toHaveLength(12);
    for (const f of s.formations) {
      expect(passable(ctx.nav, f.x, f.z)).toBe(true);
      const band = ctx.arena.deploy[f.side];
      expect(f.z).toBeGreaterThanOrEqual(band.zMin - 3000);
      expect(f.z).toBeLessThanOrEqual(band.zMax + 3000);
    }
  });

  it('determinismo: mismo snapshot + mismas órdenes ⇒ mismo hash de estado y resultado', () => {
    const a = runBattle();
    const b = runBattle();
    expect(a.s.phase).toBe('FINISHED');
    expect(stateHash(a.s)).toBe(stateHash(b.s));
    const ra = buildTrainingResult(a.snap, a.s, '2026-11-05T00:10:00.000Z');
    const rb = buildTrainingResult(b.snap, b.s, '2026-11-05T09:59:00.000Z');
    expect(ra.resultHash).toBe(rb.resultHash);
    expect(ra.casualties).toEqual(rb.casualties);
  });

  it('otra semilla puede dar otro desarrollo, pero siempre termina dentro del límite', () => {
    const r = runBattle(snapshot('otra-semilla'));
    expect(r.s.phase).toBe('FINISHED');
    expect(r.s.tick).toBeLessThanOrEqual(r.s.maxTicks);
  });

  it('replay: re-ejecutar snapshot + órdenes registradas reproduce el estado final (G1-10, NFR2-009)', () => {
    const r = runBattle(snapshot('replay'), (s) =>
      s.tick === 3
        ? [
            order('ATTACKER', {
              type: 'SET_FORMATION',
              formationId: 'A4',
              formationPreset: 'WEDGE',
              seq: 1,
            }),
          ]
        : [],
    );
    const replay = runReplay({ snapshot: r.snap, inputs: r.inputs, abandoned: null });
    expect(replay.finalStateHash).toBe(stateHash(r.s));
    expect(r.inputs.some((i) => !i.accepted)).toBe(true); // la orden SET_FORMATION repetida queda registrada como rechazada
    expect(buildTrainingResult(r.snap, replay.state, '2026-11-05T00:00:00.000Z').resultHash).toBe(
      buildTrainingResult(r.snap, r.s, '2026-11-05T00:00:00.000Z').resultHash,
    );
  });

  it('replay manipulado (orden inventada) se detecta como divergencia', () => {
    const r = runBattle(snapshot('replay-tamper'));
    const forged = [
      ...r.inputs,
      {
        tick: 200,
        side: 'ATTACKER' as const,
        source: 'PLAYER' as const,
        accepted: true,
        reason: null,
        order: {
          type: 'MOVE' as const,
          formationId: 'A0',
          seq: 5,
          requestedTick: 200,
          targetPosition: { x: 10_000, z: 4_600 },
        },
      },
    ];
    expect(() => runReplay({ snapshot: r.snap, inputs: forged, abandoned: null })).toThrow(
      /divergencia/,
    );
  });

  it('propiedad: conservación de tropas, moral acotada y posiciones transitables', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.constantFrom('balanced', 'cavalry_raid', 'archer_line'),
        (seed, army) => {
          const r = runBattle(snapshot(seed, army, 'balanced'));
          for (const f of r.s.formations) {
            expect(f.count).toBeGreaterThanOrEqual(0);
            expect(f.count).toBeLessThanOrEqual(f.initialCount);
            expect(f.morale).toBeGreaterThanOrEqual(0);
            expect(f.morale).toBeLessThanOrEqual(1000);
            expect(passable(r.ctx.nav, f.x, f.z)).toBe(true);
          }
          const res = buildTrainingResult(r.snap, r.s, '2026-11-05T00:00:00.000Z');
          for (const c of res.casualties) expect(c.dead + c.remaining).toBe(c.initial);
        },
      ),
      { numRuns: 12 },
    );
  });

  it('un resultado TRAINING no es un resultado canónico aplicable al mundo (INT-013)', () => {
    const r = runBattle();
    const res = buildTrainingResult(r.snap, r.s, '2026-11-05T00:00:00.000Z');
    expect(res.mode).toBe('TRAINING');
    expect(battleCanonicalResultSchema.safeParse(res).success).toBe(false);
  });
});

describe('validación de órdenes (G1-11, NET-006/007/009)', () => {
  function fresh() {
    const snap = snapshot('ordenes');
    const ctx = createContext(snap);
    const s = createInitialState(snap, ctx);
    return { ctx, s };
  }

  it('órdenes inválidas se rechazan sin cambiar las formaciones', () => {
    const { ctx, s } = fresh();
    const before = JSON.stringify(s.formations);
    const out = step(ctx, s, [
      order('ATTACKER', { type: 'MOVE', formationId: 'D0', targetPosition: { x: 1000, z: 1000 } }), // bando ajeno
      order('ATTACKER', { type: 'MOVE', formationId: 'A99', targetPosition: { x: 1000, z: 1000 } }), // inexistente
      order('ATTACKER', { type: 'MOVE', formationId: 'A0', targetPosition: { x: -5, z: 1000 } }), // fuera de mapa
      order('ATTACKER', {
        type: 'MOVE',
        formationId: 'A0',
        targetPosition: { x: 10_000, z: 4_600 },
      }), // agua
      order('ATTACKER', { type: 'ATTACK', formationId: 'A0', targetFormationId: 'A1' }), // aliado
      order('ATTACKER', { type: 'ATTACK', formationId: 'A0', targetFormationId: 'D0' }), // no visible (niebla)
      order('ATTACKER', { type: 'SUPPORT', formationId: 'A0' }), // no es sacerdote
      order('ATTACKER', { type: 'SET_FORMATION', formationId: 'A0', formationPreset: 'LINE' }), // ya en línea
    ]);
    expect(out.accepted).toHaveLength(0);
    expect(out.rejected.map((r) => r.reason)).toEqual([
      'WRONG_SIDE',
      'UNKNOWN_FORMATION',
      'OUT_OF_BOUNDS',
      'NOT_PASSABLE',
      'INVALID_TARGET',
      'NOT_VISIBLE',
      'UNIT_CANNOT_SUPPORT',
      'ALREADY_IN_FORMATION',
    ]);
    expect(JSON.stringify(s.formations)).toBe(before);
  });

  it('una orden válida se acepta y mueve la formación solo cuando empieza el combate', () => {
    const { ctx, s } = fresh();
    const a0 = s.formations.find((f) => f.id === 'A0')!;
    const start = [a0.x, a0.z];
    const out = step(ctx, s, [
      order('ATTACKER', {
        type: 'MOVE',
        formationId: 'A0',
        targetPosition: { x: a0.x, z: a0.z - 3000 },
      }),
    ]);
    expect(out.accepted).toHaveLength(1);
    expect([a0.x, a0.z]).toEqual(start); // PREPARE: sin movimiento
    while (s.phase === 'PREPARE') step(ctx, s, []);
    for (let i = 0; i < 5; i++) step(ctx, s, []);
    expect(a0.z).toBeLessThan(start[1]!);
  });

  it('la retirada es definitiva: una formación en retirada no acepta más órdenes', () => {
    const { ctx, s } = fresh();
    step(ctx, s, [order('ATTACKER', { type: 'RETREAT', formationId: 'A0' })]);
    const out = step(ctx, s, [order('ATTACKER', { type: 'HOLD', formationId: 'A0', seq: 2 })]);
    expect(out.rejected[0]!.reason).toBe('FORMATION_RETREATING');
  });
});

describe('rendimiento del tick (G0-06/M2-G4-01, referencia de laboratorio)', () => {
  it('24 formaciones: mide ms por tick del motor puro', () => {
    const snap = snapshot('bench', 'large', 'large');
    const ctx = createContext(snap);
    const s = createInitialState(snap, ctx);
    const times: number[] = [];
    while (s.phase !== 'FINISHED') {
      const orders = [
        ...doctrineOrders(ctx, s, 'ATTACKER', 'AGGRESSIVE'),
        ...doctrineOrders(ctx, s, 'DEFENDER', 'AGGRESSIVE'),
      ];
      const t0 = performance.now();
      step(ctx, s, orders);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    const p50 = times[Math.floor(times.length * 0.5)]!;
    console.log(
      `[bench] 24 formaciones, ${times.length} ticks: p50=${p50.toFixed(3)} ms p95=${p95.toFixed(3)} ms máx=${times.at(-1)!.toFixed(3)} ms`,
    );
    // Presupuesto a 10 Hz = 100 ms por tick; exigimos holgura amplia para varias salas.
    expect(p95).toBeLessThan(20);
  });
});
