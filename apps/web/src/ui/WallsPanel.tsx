import { useState } from 'react';
import type { VillageView } from '@reinos/contracts';
import { getRuleset, type Precinct } from '@reinos/game-config';
import { wallRepairQuote, wallType } from '@reinos/game-rules';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';
import { duration, fmt } from '../format.js';

export const PRECINCT_NAME = {
  1: 'I · Ciudadela',
  2: 'II · Distrito urbano',
  3: 'III · Recinto productivo',
} as const;
export function WallsPanel({
  view,
  now,
  onChanged,
  onSelectPlot,
}: {
  view: VillageView;
  now: number;
  onChanged: () => void;
  onSelectPlot: (p: number) => void;
}) {
  const [busy, setBusy] = useState(false),
    toast = useToast(),
    r = getRuleset(view.rulesetVersion);
  const repair = async (precinct: Precinct) => {
    setBusy(true);
    try {
      await api.repairWall(view.worldId, view.id, { precinct });
      toast('info', 'Reparación iniciada');
      onChanged();
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="wall-overview" aria-label="Tres líneas defensivas">
      <h3>Fortificaciones</h3>
      {[...(view.walls ?? [])]
        .sort((a, b) => b.precinct - a.precinct)
        .map((w) => {
          const quote =
            w.level > 0 && w.integrity < 1000
              ? wallRepairQuote(
                  r,
                  wallType(w.precinct),
                  w.level,
                  w.integrity,
                  view.civilization,
                  view.speedMultiplier,
                )
              : null;
          return (
            <article className="wall-card" key={w.precinct}>
              <button className="link" onClick={() => onSelectPlot(w.plot)}>
                {PRECINCT_NAME[w.precinct]}
              </button>
              <div className="wall-stats">
                <span>
                  Nivel <strong>{w.level}</strong>
                </span>
                <span>
                  {{ STONE: 'Piedra', WOOD: 'Madera', EARTH: 'Tierra y arcilla' }[w.material]}
                </span>
                <span>Defensa +{w.bonusPermille / 10}%</span>
              </div>
              <progress
                aria-label={`Integridad de ${PRECINCT_NAME[w.precinct]}`}
                max={1000}
                value={w.integrity}
              />
              <small>
                Integridad {w.integrity / 10}% ·{' '}
                {w.level === 0
                  ? 'Sin construir'
                  : w.integrity === 0
                    ? 'Destruida'
                    : w.integrity < 350
                      ? 'Comprometida'
                      : w.integrity < 1000
                        ? 'Dañada'
                        : 'Intacta'}
              </small>
              {w.repair ? (
                <p className="warn small">
                  Reparando +{w.repair.restoreIntegrity / 10}% ·{' '}
                  {duration((new Date(w.repair.completesAt).getTime() - now) / 1000)}
                </p>
              ) : (
                quote && (
                  <>
                    <p className="small">
                      Reparar: {fmt(quote.cost.wood)} madera · {fmt(quote.cost.stone)} arcilla ·{' '}
                      {fmt(quote.cost.iron)} hierro · {fmt(quote.cost.food)} cereal ·{' '}
                      {duration(quote.seconds)}
                    </p>
                    <button
                      className="ghost small"
                      disabled={busy || view.construction?.plot === w.plot}
                      onClick={() => void repair(w.precinct)}
                    >
                      Reparar muralla
                    </button>
                  </>
                )
              )}
            </article>
          );
        })}
    </section>
  );
}
