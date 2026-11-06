import type { VillageView, MovementView } from '@reinos/contracts';
import { getRuleset } from '@reinos/game-config';
import { duration, fmt, localTime } from '../format.js';
const hostile = (m: MovementView) => ['ATTACK', 'RAID', 'CONQUER'].includes(m.mission);
const missions: Record<MovementView['mission'], string> = {
  ATTACK: 'Ataque',
  RAID: 'Saqueo',
  CONQUER: 'Conquista',
  REINFORCE: 'Refuerzo',
  TRANSFER: 'Traslado',
  SETTLE: 'Fundación',
};
export function RealmForces({
  view,
  now,
  onMap,
}: {
  view: VillageView;
  now: number;
  onMap: () => void;
}) {
  const r = getRuleset(view.rulesetVersion),
    orders = view.constructions ?? (view.construction ? [view.construction] : []);
  const groups = [
    [
      'ATTACKS',
      'Ataques entrantes',
      '⚔',
      view.movements.filter((m) => m.direction === 'INCOMING' && hostile(m)),
    ],
    [
      'SUPPORT',
      'Refuerzos entrantes',
      '↙',
      view.movements.filter((m) => m.direction === 'INCOMING' && !hostile(m)),
    ],
    ['OUTGOING', 'Tropas salientes', '↗', view.movements.filter((m) => m.direction === 'OUTGOING')],
    ['RETURNING', 'Regresos', '↩', view.movements.filter((m) => m.direction === 'RETURNING')],
  ] as const;
  return (
    <>
      <aside className="realm-forces" aria-label="Ejército y ataques de la aldea">
        <div className="forces-troops">
          <h3>Tropas en la aldea</h3>
          {view.troops.filter((t) => t.quantity > 0).length ? (
            view.troops
              .filter((t) => t.quantity > 0)
              .map((t) => (
                <p key={t.unitType}>
                  <span>{r.units.find((u) => u.type === t.unitType)?.name}</span>
                  <strong>{fmt(t.quantity)}</strong>
                </p>
              ))
          ) : (
            <p className="muted">Sin tropas</p>
          )}
          {view.garrisons?.some((t) => t.quantity > 0) && (
            <>
              <h3 className="forces-reinforcement-title">Refuerzos alojados</h3>
              {r.units.flatMap((u) => {
                const quantity = view
                  .garrisons!.filter((t) => t.unitType === u.type)
                  .reduce((sum, t) => sum + t.quantity, 0);
                return quantity > 0
                  ? [
                      <p key={u.type}>
                        <span>{u.name}</span>
                        <strong>{fmt(quantity)}</strong>
                      </p>,
                    ]
                  : [];
              })}
            </>
          )}
          {view.wounded.some((t) => t.quantity > 0) && (
            <p title="Consume cereal y se recupera en el Hospital">
              Heridos <strong>{fmt(view.wounded.reduce((sum, t) => sum + t.quantity, 0))}</strong>
            </p>
          )}
        </div>
        <div className="forces-movements">
          {groups.map(([direction, label, icon, marches]) => {
            const sorted = [...marches].sort(
                (a, b) => Date.parse(a.arrivesAt) - Date.parse(b.arrivesAt),
              ),
              first = sorted[0];
            return (
              <details
                key={direction}
                className={`force-group ${direction === 'ATTACKS' && marches.length ? 'under-attack' : ''}`}
              >
                <summary className="force-movement" aria-label={`${label}: ${marches.length}`}>
                  <span aria-hidden>{icon}</span>
                  <span>
                    {label}
                    <small>
                      {first
                        ? duration(Math.max(0, (Date.parse(first.arrivesAt) - now) / 1000))
                        : '—'}
                    </small>
                  </span>
                  <strong>{marches.length}</strong>
                </summary>
                <div className="force-march-list">
                  {!first && <p className="muted">Sin movimientos</p>}
                  {sorted.map((m) => (
                    <div key={m.id} className="force-march">
                      <strong>
                        {m.direction === 'RETURNING' ? 'Regreso' : missions[m.mission]}
                      </strong>
                      <span>
                        {m.direction === 'INCOMING'
                          ? `Desde ${m.originName}`
                          : m.direction === 'RETURNING'
                            ? `Desde ${m.targetName}`
                            : `Hacia ${m.targetName}`}
                      </span>
                      <time dateTime={m.arrivesAt} title={localTime(m.arrivesAt)}>
                        {duration(Math.max(0, (Date.parse(m.arrivesAt) - now) / 1000))}
                      </time>
                      {m.units && (
                        <small>
                          {m.units
                            .filter((u) => u.quantity > 0)
                            .map(
                              (u) =>
                                `${fmt(u.quantity)} ${r.units.find((d) => d.type === u.unitType)?.name ?? u.unitType}`,
                            )
                            .join(' · ')}
                        </small>
                      )}
                    </div>
                  ))}
                  {first && (
                    <button className="ghost small" onClick={onMap}>
                      Ver mapa
                    </button>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </aside>
      {orders.length > 0 && (
        <aside className="realm-construction-status" aria-label="Construcciones en curso">
          {orders.map((o) => {
            const progress = Math.min(
              100,
              Math.max(
                0,
                (100 * (now - Date.parse(o.startedAt))) /
                  Math.max(1, Date.parse(o.completesAt) - Date.parse(o.startedAt)),
              ),
            );
            return (
              <div key={o.id}>
                <span className="construction-hammer" aria-hidden>
                  ⚒
                </span>
                <div>
                  <strong>
                    {r.buildings.find((b) => b.type === o.type)?.name} → {o.targetLevel}
                  </strong>
                  <small>{duration(Math.max(0, (Date.parse(o.completesAt) - now) / 1000))}</small>
                  <progress value={progress} max={100} />
                </div>
              </div>
            );
          })}
        </aside>
      )}
    </>
  );
}
