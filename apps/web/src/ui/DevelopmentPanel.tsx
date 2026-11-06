import { useState } from 'react';
import type { VillageView } from '@reinos/contracts';
import { getRuleset, type UnitType } from '@reinos/game-config';
import { developmentQuote, levelOf } from '@reinos/game-rules';
import { api, describeError } from '../api.js';
import { duration } from '../format.js';
import { useToast } from '../App.js';
import { liveAmount } from './VillagePage.js';
export function DevelopmentPanel({
  view,
  now,
  building,
  onChanged,
}: {
  view: VillageView;
  now: number;
  building: 'academy' | 'smithy';
  onChanged: () => void;
}) {
  const r = getRuleset(view.rulesetVersion),
    toast = useToast(),
    [kind, setKind] = useState<'WEAPON' | 'ARMOR'>('WEAPON'),
    [busy, setBusy] = useState(false);
  if (!r.development) return null;
  const research = view.research ?? [],
    orders = view.development ?? [],
    lane = building === 'academy' ? 'UNLOCK' : kind,
    queue = orders.filter((o) =>
      building === 'academy' ? o.kind === 'UNLOCK' : ['WEAPON', 'ARMOR'].includes(o.kind),
    );
  const start = async (unitType: UnitType) => {
    setBusy(true);
    try {
      await api.develop(view.worldId, view.id, { kind: lane, unitType });
      toast('info', 'Investigación iniciada');
      onChanged();
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="development-panel">
      <h3>{building === 'academy' ? 'Investigar unidades' : 'Mejoras de la Herrería'}</h3>
      <p className="muted small">Las investigaciones y mejoras corresponden a esta aldea.</p>
      {building === 'smithy' && (
        <label>
          Especialidad
          <select value={kind} onChange={(e) => setKind(e.target.value as 'WEAPON' | 'ARMOR')}>
            <option value="WEAPON">Ataque</option>
            <option value="ARMOR">Defensa</option>
          </select>
        </label>
      )}
      {queue.map((o) => (
        <div className="queue-item" key={o.id}>
          <strong>
            {r.units.find((u) => u.type === o.target)?.name} → {o.targetLevel}
          </strong>
          <p>{duration(Math.max(0, (Date.parse(o.completesAt) - now) / 1000))}</p>
          <progress
            max={100}
            value={Math.min(
              100,
              (100 * (now - Date.parse(o.startedAt))) /
                Math.max(1, Date.parse(o.completesAt) - Date.parse(o.startedAt)),
            )}
          />
        </div>
      ))}
      {r.units
        .filter(
          (u) =>
            !u.npcOnly &&
            (!u.civilization || u.civilization === view.civilization) &&
            (building !== 'academy' || u.researchRequired),
        )
        .map((u) => {
          const level = research.find((s) => s.unitType === u.type && s.kind === lane)?.level ?? 0,
            max = building === 'academy' ? 1 : r.development!.maxSmithyLevel,
            quote =
              level < max
                ? developmentQuote(r, lane, u.type, level + 1, view.speedMultiplier)
                : null,
            unlocked =
              !u.researchRequired ||
              research.some((s) => s.unitType === u.type && s.kind === 'UNLOCK'),
            requirements =
              levelOf(view.buildings, building) >= (building === 'academy' ? 1 : level + 1) &&
              u.requires.every((q) => levelOf(view.buildings, q.building) >= q.level),
            afford =
              quote &&
              Object.entries(quote.cost).every(
                ([resource, cost]) =>
                  liveAmount(view, resource as 'wood' | 'stone' | 'iron' | 'food', now) >= cost,
              );
          return (
            <article className="option" key={u.type}>
              <strong>
                {u.name} {building === 'smithy' ? `· Nivel ${level}` : level ? '· Investigada' : ''}
              </strong>
              {quote ? (
                <>
                  <p className="small">
                    Madera {quote.cost.wood} · Barro {quote.cost.stone} · Hierro {quote.cost.iron} ·
                    Cereal {quote.cost.food}
                  </p>
                  <p className="muted small">
                    {duration(quote.seconds)}
                    {building === 'smithy'
                      ? ` · Bonus ${((level + 1) * r.development!.smithyBonusPermille) / 10}%`
                      : ''}
                  </p>
                  {!requirements && (
                    <p className="warn small">
                      Requiere {building === 'academy' ? 'Academia 1' : `Herrería ${level + 1}`}
                      {u.requires.length
                        ? ` y ${u.requires.map((q) => `${r.buildings.find((b) => b.type === q.building)?.name} ${q.level}`).join(', ')}`
                        : ''}
                    </p>
                  )}
                  {building === 'smithy' && !unlocked && (
                    <p className="warn small">Desbloquea la unidad en la Academia.</p>
                  )}
                  <button
                    disabled={
                      busy ||
                      queue.length > 0 ||
                      !requirements ||
                      !afford ||
                      (building === 'smithy' && !unlocked)
                    }
                    onClick={() => void start(u.type)}
                  >
                    {building === 'academy' ? 'Investigar' : `Mejorar a nivel ${level + 1}`}
                  </button>
                </>
              ) : (
                <p className="muted small">
                  {building === 'academy' ? 'Unidad disponible' : 'Nivel máximo'}
                </p>
              )}
            </article>
          );
        })}
    </section>
  );
}
