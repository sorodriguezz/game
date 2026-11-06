import { lazy, Suspense, useEffect, useState } from 'react';
import type { BattleReportDetail } from '@reinos/contracts';
import type { BattleResult } from '@reinos/game-rules';
import { PRECINCT_NAME } from './WallsPanel.js';
const CityScene = lazy(() =>
  import('../scene/CityScene.js').then((m) => ({ default: m.CityScene })),
);

/** Visor de solo lectura: avanza acontecimientos guardados, jamás ejecuta reglas de daño. */
export function BattleReplay({ report }: { report: BattleReportDetail }) {
  const [open, setOpen] = useState(false),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [speed, setSpeed] = useState(1);
  const res = report.result as BattleResult,
    phases = res.precincts ?? [],
    total = phases.length * 6;
  useEffect(() => {
    if (!playing || !open) return;
    let last = performance.now(),
      frame = 0;
    const update = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      setTime((t) => Math.min(total, t + dt * speed));
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing, open, total, speed]);
  const replay = report.replay;
  if (!replay || !phases.length) return null;
  const index = Math.min(phases.length - 1, Math.floor(time / 6)),
    phase = phases[index]!,
    done = time >= total;
  const walls = replay.walls.map((w) => {
    const p = phases.find((p) => p.precinct === w.precinct),
      i = phases.findIndex((p) => p.precinct === w.precinct);
    const progress = Math.max(0, Math.min(1, (time - i * 6) / 6));
    return {
      ...w,
      integrity: p
        ? Math.round(p.integrityBefore + (p.integrityAfter - p.integrityBefore) * progress)
        : w.integrity,
    };
  });
  const buildings = replay.buildings
    .map((b) => {
      const damage = res.buildingDamage?.find(
        (d) =>
          d.plot === b.plot && time >= (phases.findIndex((p) => p.precinct === d.precinct) + 1) * 6,
      );
      return { ...b, level: damage?.toLevel ?? b.level };
    })
    .filter((b) => b.level > 0);
  return (
    <section className="battle-replay" aria-label="Recreación histórica del asedio">
      <h4>Recreación del asedio</h4>
      <p className="muted small">
        Plano y daños del instante del combate. Puedes cerrar esta vista: el resultado ya está
        aplicado.
      </p>
      <button
        className="ghost"
        onClick={() => {
          setOpen((v) => !v);
          setPlaying(false);
        }}
      >
        {open ? 'Cerrar recreación' : 'Ver recreación'}
      </button>
      {open && (
        <>
          <div className="replay-scene">
            <Suspense fallback={<p>Cargando aldea histórica…</p>}>
              <CityScene
                rulesetVersion={report.rulesetVersion}
                civilization={replay.civilization}
                coastal={false}
                buildings={buildings}
                layout={replay.layout}
                walls={walls}
                construction={null}
                selectedPlot={phase.precinct === 3 ? 19 : phase.precinct === 2 ? 20 : 21}
                onSelectPlot={() => {}}
              />
            </Suspense>
            <div className="replay-caption" aria-live="polite">
              <strong>{PRECINCT_NAME[phase.precinct]}</strong>
              <span>
                {done
                  ? res.outcome === 'ATTACKER'
                    ? 'Victoria atacante'
                    : 'Victoria defensora'
                  : phase.advanced
                    ? 'Asalto a la línea defensiva'
                    : 'La guarnición resiste'}
              </span>
            </div>
          </div>
          <div className="replay-controls">
            <button
              onClick={() => {
                if (done) {
                  setTime(0);
                  setPlaying(true);
                } else setPlaying((v) => !v);
              }}
            >
              {playing && !done ? 'Pausar' : done ? 'Repetir' : 'Reproducir'}
            </button>
            <label>
              Velocidad
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
              </select>
            </label>
            <button
              onClick={() => {
                setTime(total);
                setPlaying(false);
              }}
            >
              Saltar al resultado
            </button>
            <label>
              Avance
              <input
                aria-label="Avance de la recreación"
                type="range"
                min={0}
                max={total}
                step={0.1}
                value={time}
                onChange={(e) => {
                  setTime(Number(e.target.value));
                  setPlaying(false);
                }}
              />
            </label>
          </div>
          <p className="small">
            {phase.attacker.sent.reduce((s, u) => s + u.quantity, 0)} atacantes ·{' '}
            {phase.defender.present.reduce((s, u) => s + u.quantity, 0)} defensores en esta fase ·
            integridad {phase.integrityBefore / 10}% → {phase.integrityAfter / 10}%
          </p>
        </>
      )}
    </section>
  );
}
