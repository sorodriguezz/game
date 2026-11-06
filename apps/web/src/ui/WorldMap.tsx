import { useState } from 'react';
import type { MapVillageView, MovementMission, VillageView } from '@reinos/contracts';
import { getRuleset } from '@reinos/game-config';
import {
  distanceMilli,
  slowestSpeed,
  travelSeconds,
  oasisEligibility,
  levelOf,
} from '@reinos/game-rules';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';
import { duration, fmt } from '../format.js';
export interface MapSelection {
  x: number;
  y: number;
  terrain: string;
  village: MapVillageView | null;
  fields?: number[];
}
const TYPES: Record<string, string> = {
  P: 'Pradera fértil',
  F: 'Bosque',
  M: 'Tierras altas',
  O: 'Oasis salvaje',
  S: 'Mar',
};
export function TileActions({
  selection: s,
  view,
  now,
  onChanged,
  onOpenVillage,
  onTradeTo,
}: {
  selection: MapSelection | null;
  view: VillageView;
  now: number;
  onChanged: () => void;
  onOpenVillage: (id: string) => void;
  onTradeTo?: (point: { x: number; y: number }) => void;
}) {
  const r = getRuleset(view.rulesetVersion),
    toast = useToast();
  const [name, setName] = useState('Nueva aldea'),
    [mission, setMission] = useState<MovementMission>(
      s?.village?.isMine ? 'TRANSFER' : s?.village?.isAlly ? 'REINFORCE' : 'ATTACK',
    ),
    [qty, setQty] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState(false);
  const [siegeTarget, setSiegeTarget] = useState('');
  const units = view.troops
    .filter((t) => t.quantity > 0)
    .map((t) => ({
      unitType: t.unitType,
      quantity: Math.min(t.quantity, Math.max(0, Math.floor(qty[t.unitType] ?? 0))),
    }))
    .filter((t) => t.quantity > 0);
  const distance = s ? distanceMilli(view, s) : 0n,
    secs = units.length
      ? travelSeconds(
          distance,
          slowestSpeed(r, units),
          view.movementSpeedMultiplier ?? view.speedMultiplier,
        )
      : 0;
  const run = async () => {
    if (!s) return;
    setBusy(true);
    try {
      if (s.village) {
        const order = await api.march(view.worldId, view.id, {
          targetVillageId: s.village.id,
          mission,
          units,
          ...(r.fortifications && mission === 'ATTACK' && siegeTarget !== ''
            ? { siegeTargetPlot: Number(siegeTarget) }
            : {}),
        });
        toast(
          'info',
          `Expedición en marcha · ${duration((new Date(order.arrivalAt).getTime() - now) / 1000)}`,
        );
      } else {
        await api.found(view.worldId, view.id, { x: s.x, y: s.y, name });
        toast('info', 'Los colonos han partido hacia la nueva aldea.');
      }
      setQty({});
      onChanged();
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };
  if (!s)
    return (
      <div className="territory-card intro-card">
        <span className="eyebrow">EXPLORA Y EXPANDE</span>
        <div className="compass-illustration">✧</div>
        <h2>Tu siguiente conquista</h2>
        <p>
          Selecciona una casilla para descubrir sus habitantes, fundar una aldea o preparar una
          expedición.
        </p>
        <div className="tip-rule" />
        <small>Los oasis guardan recursos. Las aldeas libres esperan un nuevo señor.</small>
      </div>
    );
  const v = s.village;
  return (
    <div className="territory-card">
      <span className="eyebrow">
        {v?.kind === 'OASIS'
          ? 'OASIS'
          : v?.isMine
            ? 'TU DOMINIO'
            : v?.isAlly
              ? 'TERRITORIO ALIADO'
              : v?.kind === 'NPC'
                ? 'ALDEA INDEPENDIENTE'
                : v
                  ? 'OTRO REINO'
                  : 'TIERRA SIN OCUPAR'}
      </span>
      <h2>{v?.name ?? TYPES[s.terrain]}</h2>
      <div className="tile-coordinate">
        ({s.x} | {s.y}) <span>{(Number(distance) / 1000).toFixed(1)} casillas</span>
      </div>
      {v ? (
        <>
          <dl className="territory-facts">
            <dt>Habitante</dt>
            <dd>
              {v.ownerName ?? (v.kind === 'OASIS' ? 'Animales salvajes' : 'Pobladores libres')}
            </dd>
            <dt>Lealtad</dt>
            <dd>{v.loyalty ?? 100} %</dd>
            {v.isCapital && (
              <>
                <dt>Capital</dt>
                <dd>Protegida de conquista</dd>
              </>
            )}
          </dl>
          {onTradeTo && v.kind === 'PLAYER' && v.id !== view.id && (
            <button
              className="wide"
              disabled={!view.buildings.some((b) => b.type === 'market')}
              title="Necesitas un Mercado en esta aldea"
              onClick={() => onTradeTo({ x: s.x, y: s.y })}
            >
              Enviar recursos
            </button>
          )}
          {v.isMine && v.kind === 'PLAYER' && (
            <button className="primary wide" onClick={() => onOpenVillage(v.id)}>
              Entrar a la aldea →
            </button>
          )}
          {(v.kind === 'OASIS' || v.kind === 'NPC') && v.animals?.length ? (
            <div className="guardian-list">
              <h4>{v.kind === 'OASIS' ? 'Guardianes animales' : 'Tropas defensivas'}</h4>
              {v.animals.map((t) => (
                <p key={t.unitType}>
                  {r.units.find((u) => u.type === t.unitType)?.name} <strong>{t.quantity}</strong>
                </p>
              ))}
            </div>
          ) : null}
          {v.kind === 'OASIS' && (
            <div className="oasis-details">
              <h4>Bonus de producción</h4>
              {Object.entries(
                v.oasisBonuses ?? { wood: 250, stone: 250, iron: 250, food: 250 },
              ).map(([resource, bonus]) => (
                <p key={resource}>
                  +{bonus / 10}%{' '}
                  {
                    (
                      { wood: 'Madera', stone: 'Barro', iron: 'Hierro', food: 'Cereal' } as Record<
                        string,
                        string
                      >
                    )[resource]
                  }
                </p>
              ))}
              {v.isMine ? (
                <p>
                  Oasis bajo tu control ·{' '}
                  {v.parentVillageId === view.id
                    ? 'Vinculado a esta aldea'
                    : 'Vinculado a otra de tus aldeas'}
                </p>
              ) : (
                r.territory?.oasisConquest && (
                  <p>
                    {oasisEligibility(
                      r,
                      view,
                      s,
                      levelOf(view.buildings, 'treasury'),
                      view.oases?.owned ?? 0,
                    ) ?? 'Dentro del 5×5 · Cupo disponible'}
                    . Los ataques normales reducen la lealtad al eliminar toda la defensa. Tesoro 10
                    / 15 / 20: 1 / 2 / 3 oasis.
                  </p>
                )
              )}
            </div>
          )}
          {v.id !== view.id && !(v.isMine && v.kind === 'OASIS') && (
            <>
              <label className="field-label">
                Tipo de expedición
                <select
                  value={mission}
                  onChange={(e) => setMission(e.target.value as MovementMission)}
                >
                  {v.isMine ? (
                    <option value="TRANSFER">Trasladar y reunir tropas</option>
                  ) : v.isAlly ? (
                    <option value="REINFORCE">Enviar refuerzos defensivos</option>
                  ) : (
                    <>
                      <option value="ATTACK">Atacar</option>
                      <option value="RAID">Saquear</option>
                      {!v.isCapital && (v.kind !== 'OASIS' || !r.territory?.oasisConquest) && (
                        <option value="CONQUER">Conquistar</option>
                      )}
                    </>
                  )}
                </select>
              </label>
              <h4>Preparar tropas</h4>
              {!view.troops.length && (
                <p className="muted small">Recluta tropas en tu aldea para salir de expedición.</p>
              )}
              {view.troops
                .filter((t) => t.quantity > 0)
                .map((t) => (
                  <label className="troop-picker" key={t.unitType}>
                    <span>
                      {r.units.find((u) => u.type === t.unitType)?.name}
                      <small>{fmt(t.quantity)} disponibles</small>
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={t.quantity}
                      aria-label={`Enviar ${t.unitType}`}
                      value={qty[t.unitType] ?? 0}
                      onChange={(e) =>
                        setQty((q) => ({
                          ...q,
                          [t.unitType]: Math.min(
                            t.quantity,
                            Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          ),
                        }))
                      }
                    />
                  </label>
                ))}
              {units.length > 0 && (
                <p className="eta-line">
                  ⏱ Viaje <strong>{duration(secs)}</strong>
                </p>
              )}
              {r.fortifications &&
                mission === 'ATTACK' &&
                units.some((u) => u.unitType === 'catapult') && (
                  <label className="field-label">
                    Objetivo de catapultas
                    <select value={siegeTarget} onChange={(e) => setSiegeTarget(e.target.value)}>
                      <option value="">Sin objetivo de edificios</option>
                      {r.cityLayout.plots
                        .filter((p) => p.kind !== 'fortification')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label ?? 'Solar urbano'} · {p.id} · recinto {p.precinct}
                          </option>
                        ))}
                    </select>
                    <small>
                      Requiere Plaza de Reuniones {r.fortifications.preciseTargetRallyLevel}. El
                      objetivo solo recibe daño si su recinto es superado.
                    </small>
                  </label>
                )}
              {mission === 'CONQUER' && (
                <p className="muted small">
                  {v.kind === 'OASIS'
                    ? 'Vence a los animales para vincular el oasis a tu aldea.'
                    : 'Los emisarios supervivientes reducen la lealtad. La capital y la última aldea están protegidas.'}
                </p>
              )}
              <button
                className="primary wide"
                disabled={busy || !units.length}
                onClick={() => void run()}
              >
                {busy ? 'Preparando…' : 'Enviar expedición →'}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          {s.terrain === 'P' || (!r.economy.cropPopulation && s.terrain === 'F') ? (
            <>
              <p className="muted">Funda una nueva aldea y amplía tu dominio.</p>
              {s.fields && (
                <p className="muted">
                  Campos {s.fields.join('–')} · Madera / Barro / Hierro / Cereal
                </p>
              )}
              <label className="field-label">
                Nombre de la aldea
                <input
                  value={name}
                  minLength={3}
                  maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="founding-needs">
                <span>⚑ {r.territory?.settlersRequired} colonos</span>
                <span>Centro urbano {r.territory?.foundingHallLevel}</span>
                <span>Plaza de reuniones 1</span>
                {view.culture && (
                  <>
                    <span>
                      Cultura: {Math.floor(view.culture.pointsMilli / 1000)} /{' '}
                      {Math.ceil(view.culture.requiredMilli / 1000)}
                    </span>
                    <span>
                      Cupos libres:{' '}
                      {Math.max(
                        0,
                        view.culture.slots - view.culture.usedSlots - view.culture.pendingSlots,
                      )}
                    </span>
                  </>
                )}
              </div>
              <p className="small muted">
                Coste: {Object.values(r.territory!.foundingCost).join(' / ')}
                <br />
                Madera · barro · hierro · cereal
              </p>
              <button
                className="primary wide"
                disabled={
                  busy ||
                  name.trim().length < 3 ||
                  (!!view.culture &&
                    (view.culture.pointsMilli < view.culture.requiredMilli ||
                      view.culture.usedSlots + view.culture.pendingSlots >= view.culture.slots))
                }
                onClick={() => void run()}
              >
                {busy ? 'Preparando…' : 'Fundar aldea →'}
              </button>
            </>
          ) : (
            <p className="muted">Este terreno no permite fundar una aldea.</p>
          )}
        </>
      )}
    </div>
  );
}
