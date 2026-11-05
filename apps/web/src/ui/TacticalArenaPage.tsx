import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrainingResult } from '@reinos/contracts';
import {
  DEFAULT_TACTICAL_RULESET_VERSION,
  arenaDef,
  getRuleset,
  getTacticalRuleset,
  unitDef,
  type CivilizationId,
  type UnitType,
} from '@reinos/game-config';
import { formationRadiusCm } from '../battle/geometry.js';
import { useBattleRoom, type FormationSnap } from '../battle/useBattleRoom.js';

const ArenaScene = lazy(() =>
  import('../battle/ArenaScene.js').then((m) => ({ default: m.ArenaScene })),
);
const tactical = getTacticalRuleset(DEFAULT_TACTICAL_RULESET_VERSION);
const ruleset = getRuleset(tactical.baseRulesetVersion);

const STATUS: Record<string, string> = {
  IDLE: 'en espera',
  MOVING: 'marchando',
  ATTACKING: 'combatiendo',
  HOLDING: 'manteniendo',
  REFORMING: 'reorganizando',
  FALLING_BACK: 'en retirada',
  ROUTED: 'en desbandada',
  ESCAPED: 'fuera del campo',
  DESTROYED: 'aniquilada',
};
const PRESET: Record<string, string> = { LINE: 'línea', WEDGE: 'cuña', SKIRMISH: 'escaramuza' };
const REJECT: Record<string, string> = {
  NOT_PASSABLE: 'Terreno intransitable',
  UNREACHABLE: 'No hay ruta',
  OUT_OF_BOUNDS: 'Fuera del campo',
  NOT_VISIBLE: 'Objetivo no visible',
  INVALID_TARGET: 'Objetivo inválido',
  FORMATION_RETREATING: 'La formación se está retirando',
  FORMATION_UNAVAILABLE: 'Formación no disponible',
  RATE_LIMITED: 'Demasiadas órdenes por segundo',
  SEQ_NOT_MONOTONIC: 'Orden duplicada',
  ON_COOLDOWN: 'Apoyo en recarga',
  UNIT_CANNOT_SUPPORT: 'Solo los sacerdotes dan apoyo',
  UNIT_CANNOT_ATTACK: 'Esta unidad no ataca',
  ALREADY_IN_FORMATION: 'Ya está en esa formación',
  NOT_IN_FIGHT: 'Aún no ha empezado el combate',
  BATTLE_FINISHED: 'La batalla ha terminado',
};

function Minimap({
  frames,
  mySide,
}: {
  frames: ReturnType<typeof useBattleRoom>['frames'];
  mySide: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const arena = arenaDef(tactical, 'plain');
  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      if (!c) return;
      const g = c.getContext('2d')!;
      const sx = c.width / arena.widthCm;
      const sz = c.height / arena.depthCm;
      g.fillStyle = '#6c8c43';
      g.fillRect(0, 0, c.width, c.height);
      for (const o of arena.obstacles) {
        g.fillStyle = o.kind === 'water' ? '#2f6d8f' : o.kind === 'rock' ? '#8f8b84' : '#3c6629';
        if (o.shape === 'circle') {
          g.beginPath();
          g.arc(o.x * sx, o.z * sz, o.r * sx, 0, Math.PI * 2);
          g.fill();
        } else g.fillRect(o.x0 * sx, o.z0 * sz, (o.x1 - o.x0) * sx, (o.z1 - o.z0) * sz);
      }
      for (const f of frames.current.curr.values()) {
        if (f.status === 'DESTROYED' || f.status === 'ESCAPED') continue;
        g.fillStyle = f.side === mySide ? '#f2c94c' : '#e05a4a';
        g.beginPath();
        g.arc(f.x * sx, f.z * sz, 3, 0, Math.PI * 2);
        g.fill();
      }
    };
    const t = setInterval(draw, 250);
    draw();
    return () => clearInterval(t);
  }, [frames, mySide, arena]);
  return (
    <canvas
      ref={ref}
      className="minimap"
      width={200}
      height={140}
      aria-label="Minimapa: tus formaciones en dorado, enemigas visibles en rojo"
    />
  );
}

function rivalControl(
  h: { attackerControl: string; defenderControl: string },
  mySide: 'ATTACKER' | 'DEFENDER',
) {
  return mySide === 'ATTACKER' ? h.defenderControl : h.attackerControl;
}

export function TacticalArenaPage({ matchId, onExit }: { matchId: string; onExit: () => void }) {
  const room = useBattleRoom(matchId);
  const arena = arenaDef(tactical, 'plain');
  const selected = useRef<Set<string>>(new Set());
  const [selection, setSelection] = useState<string[]>([]);
  const [, force] = useState(0);
  const [stats, setStats] = useState<{ soldiers: number; drawParts: number; fps: number }>({
    soldiers: 0,
    drawParts: 0,
    fps: 0,
  });
  const statsRef = useRef({ soldiers: 0, drawParts: 0, frames: 0, last: performance.now() });

  // Refresca el HUD de formaciones a 4 Hz (el lienzo va a su propio ritmo).
  useEffect(() => {
    const t = setInterval(() => {
      const s = statsRef.current;
      const now = performance.now();
      // FPS medido sobre ventanas de ≥1 s para que un render lento no lea 0. Una ventana de >3 s
      // significa que el hilo principal estuvo bloqueado (pestaña oculta, captura): se descarta.
      if (now - s.last > 3000) {
        s.frames = 0;
        s.last = now;
      } else if (now - s.last >= 1000) {
        const fps = (s.frames * 1000) / (now - s.last);
        s.frames = 0;
        s.last = now;
        setStats({ soldiers: s.soldiers, drawParts: s.drawParts, fps: Math.round(fps * 10) / 10 });
      } else {
        setStats((prev) => ({ ...prev, soldiers: s.soldiers, drawParts: s.drawParts }));
      }
      force((x) => x + 1);
    }, 250);
    return () => clearInterval(t);
  }, []);

  const hud = room.hud;
  const civs = hud
    ? { a: hud.attackerCiv as CivilizationId, d: hud.defenderCiv as CivilizationId }
    : null;

  const mine = useMemo(
    () =>
      [...room.frames.current.curr.values()]
        .filter((f) => f.side === room.mySide)
        .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))),
    [hud?.tick, room.mySide, room.frames],
  );

  const setSel = useCallback((ids: string[]) => {
    selected.current = new Set(ids);
    setSelection(ids);
  }, []);

  const formationAt = (p: { x: number; z: number }): FormationSnap | undefined => {
    let best: FormationSnap | undefined;
    let bd = Infinity;
    for (const f of room.frames.current.curr.values()) {
      if (f.status === 'DESTROYED' || f.status === 'ESCAPED') continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d <= formationRadiusCm(tactical, f) + 250 && d < bd) {
        best = f;
        bd = d;
      }
    }
    return best;
  };

  const command = (type: 'HOLD' | 'RETREAT' | 'SUPPORT') => {
    for (const id of selected.current) room.send({ type, formationId: id });
  };
  const setFormation = (preset: 'LINE' | 'WEDGE' | 'SKIRMISH') => {
    for (const id of selected.current)
      room.send({ type: 'SET_FORMATION', formationId: id, formationPreset: preset });
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'h' || e.key === 'H') command('HOLD');
      else if (e.key === 'r' || e.key === 'R') command('RETREAT');
      else if (e.key === 'f' || e.key === 'F') command('SUPPORT');
      else if (e.key === '1') setFormation('LINE');
      else if (e.key === '2') setFormation('WEDGE');
      else if (e.key === '3') setFormation('SKIRMISH');
      else if (e.key === 'Escape') setSel([]);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const onLeft = (p: { x: number; z: number }, shift: boolean) => {
    const f = formationAt(p);
    if (!f || f.side !== room.mySide) {
      if (!shift) setSel([]);
      return;
    }
    setSel(shift ? [...new Set([...selected.current, f.id])] : [f.id]);
  };
  const onRight = (p: { x: number; z: number }) => {
    if (selected.current.size === 0) return;
    const f = formationAt(p);
    if (f && f.side !== room.mySide) {
      for (const id of selected.current)
        room.send({ type: 'ATTACK', formationId: id, targetFormationId: f.id });
      return;
    }
    const ids = [...selected.current];
    ids.forEach((id, i) => {
      // Desplaza destinos para que varias formaciones no vayan al mismo punto.
      const off = (i - (ids.length - 1) / 2) * 1600;
      room.send({
        type: 'MOVE',
        formationId: id,
        targetPosition: { x: Math.max(100, Math.min(arena.widthCm - 100, p.x + off)), z: p.z },
      });
    });
  };

  const timeLeft = hud
    ? hud.phase === 'PREPARE'
      ? Math.max(0, (hud.prepareTicks - hud.tick) / hud.tickHz)
      : Math.max(0, (hud.maxTicks - hud.tick) / hud.tickHz)
    : 0;
  const lastReject = room.rejections.at(-1);
  const result = (room.result?.result as TrainingResult | undefined) ?? null;

  return (
    <div className="village-layout">
      <header className="topbar">
        <button className="ghost" onClick={onExit}>
          ← Salir del campo
        </button>
        <div className="brand">Entrenamiento táctico</div>
        {hud && (
          <div className="resources">
            <span className="res">
              ⚔ {hud.attackerName} {hud.attackerControl === 'DOCTRINE' ? '(doctrina)' : ''}
            </span>
            <span className="res">
              🛡 {hud.defenderName} {hud.defenderControl === 'DOCTRINE' ? '(doctrina)' : ''}
            </span>
            <span className="res">
              {hud.waitingForPlayers
                ? 'Esperando jugadores'
                : hud.phase === 'PREPARE'
                  ? `Despliegue ${Math.ceil(timeLeft)} s`
                  : hud.phase === 'FIGHT'
                    ? `Combate ${Math.floor(timeLeft / 60)}:${String(Math.floor(timeLeft % 60)).padStart(2, '0')}`
                    : 'Terminada'}
            </span>
          </div>
        )}
        <div className="spacer" />
        <span
          className={`badge ${room.connection === 'CONNECTED' ? 'badge-ok' : 'badge-danger'}`}
          title="Conexión con el servidor táctico"
        >
          {room.connection === 'CONNECTED'
            ? `● ${room.rttMs ?? '…'} ms`
            : room.connection === 'RECONNECTING'
              ? 'Reconectando…'
              : room.connection}
        </span>
      </header>
      <main className="village-main">
        <section className="scene-wrap" aria-label="Campo de batalla 3D">
          {room.error && <div className="splash">No se pudo entrar en la sala: {room.error}</div>}
          {room.mySide && civs && (
            <Suspense fallback={<div className="splash">Cargando campo de batalla…</div>}>
              <ArenaScene
                arena={arena}
                tactical={tactical}
                frames={room.frames}
                mySide={room.mySide}
                attackerCiv={civs.a}
                defenderCiv={civs.d}
                selected={selected}
                onLeftClick={onLeft}
                onRightClick={onRight}
                onStats={(s) => {
                  statsRef.current.soldiers = s.soldiers;
                  statsRef.current.drawParts = s.drawParts;
                  statsRef.current.frames++;
                }}
              />
            </Suspense>
          )}
          <div
            className="scene-badge"
            title="Modelos procedurales; el arte final requiere GLB aprobados (ADR-0030)"
          >
            Arte 3D: blockout (no final) · {stats.soldiers} soldados · {stats.drawParts} lotes
            instanciados · {stats.fps < 10 ? stats.fps.toFixed(1) : Math.round(stats.fps)} FPS
          </div>
          {lastReject && Date.now() - lastReject.at < 3000 && (
            <div className="scene-queue reject">
              ✖ {REJECT[lastReject.reason] ?? lastReject.reason}
            </div>
          )}
          {hud &&
            hud.phase !== 'FINISHED' &&
            !hud.waitingForPlayers &&
            room.mySide &&
            rivalControl(hud, room.mySide) === 'DOCTRINE' && (
              <div className="scene-hint">
                El rival está controlado por la doctrina (IA de reglas, no generativa).
              </div>
            )}
          <Minimap frames={room.frames} mySide={room.mySide ?? 'ATTACKER'} />
          {hud?.phase === 'FINISHED' && (
            <div className="result-overlay" role="dialog" aria-label="Resultado de la batalla">
              <h2>
                {hud.winner === 'DRAW'
                  ? 'Empate'
                  : hud.winner === room.mySide
                    ? 'Victoria'
                    : 'Derrota'}
              </h2>
              <p className="muted">
                {hud.endReason === 'TIMEOUT'
                  ? 'Fin por tiempo'
                  : hud.endReason === 'ABANDONED'
                    ? 'Batalla abandonada'
                    : 'Eliminación o desbandada del rival'}
                {' · '}
                {hud.resultStatus === 'RECORDED'
                  ? 'resultado registrado y verificado por replay'
                  : hud.resultStatus === 'PENDING'
                    ? 'resultado pendiente de confirmar'
                    : 'resultado no registrado'}
              </p>
              {result && (
                <table className="units">
                  <thead>
                    <tr>
                      <th>Bando</th>
                      <th>Unidad</th>
                      <th>Inicial</th>
                      <th>Bajas</th>
                      <th>Quedan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.casualties.map((c) => (
                      <tr key={c.stackId}>
                        <td>{c.side === 'ATTACKER' ? '⚔' : '🛡'}</td>
                        <td>{unitDef(ruleset, c.unitType as UnitType).name}</td>
                        <td>{c.initial}</td>
                        <td>{c.dead}</td>
                        <td>{c.remaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="muted small">Entrenamiento: sin efectos en ningún mundo.</p>
              <button className="primary" onClick={onExit}>
                Volver al campo de entrenamiento
              </button>
            </div>
          )}
        </section>
        <aside className="side">
          <div className="side-body">
            <h3>Órdenes</h3>
            <p className="muted small">
              Clic: seleccionar (Mayús. para añadir) · clic derecho: mover / atacar · WASD o
              flechas: mover cámara · Q/E: girar · rueda: zoom
            </p>
            <div className="row wrap">
              <button
                className="ghost small"
                disabled={selection.length === 0}
                onClick={() => command('HOLD')}
              >
                Mantener (H)
              </button>
              <button
                className="ghost small"
                disabled={selection.length === 0}
                onClick={() => command('RETREAT')}
              >
                Retirada (R)
              </button>
              <button
                className="ghost small"
                disabled={selection.length === 0}
                onClick={() => command('SUPPORT')}
              >
                Apoyo (F)
              </button>
            </div>
            <div className="row wrap">
              <button
                className="ghost small"
                disabled={selection.length === 0}
                onClick={() => setFormation('LINE')}
              >
                Línea (1)
              </button>
              <button
                className="ghost small"
                disabled={selection.length === 0}
                onClick={() => setFormation('WEDGE')}
              >
                Cuña (2)
              </button>
              <button
                className="ghost small"
                disabled={selection.length === 0}
                onClick={() => setFormation('SKIRMISH')}
              >
                Escaramuza (3)
              </button>
            </div>
            <h4>Tus formaciones</h4>
            <ul className="list formations">
              {mine.map((f) => {
                const sel = selection.includes(f.id);
                return (
                  <li key={f.id} className={sel ? 'selected' : ''}>
                    <button
                      className="link"
                      onClick={(e) =>
                        setSel(e.shiftKey ? [...new Set([...selection, f.id])] : [f.id])
                      }
                      aria-pressed={sel}
                    >
                      {f.id} · {unitDef(ruleset, f.unitType as UnitType).name}
                    </button>
                    <span className="small">
                      {f.count}/{f.initialCount} · {PRESET[f.preset] ?? f.preset} ·{' '}
                      {STATUS[f.status] ?? f.status}
                    </span>
                    <span className="morale" title={`Moral ${Math.round(f.morale / 10)} %`}>
                      <span style={{ width: `${f.morale / 10}%` }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
