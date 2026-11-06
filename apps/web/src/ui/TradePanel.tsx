import { useCallback, useEffect, useState } from 'react';
import type { VillageView, TradeMarketView } from '@reinos/contracts';
import { getRuleset, RESOURCE_KEYS, type ResourceBundle } from '@reinos/game-config';
import { merchantsNeeded, levelOf, coordinateBounds } from '@reinos/game-rules';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';
import { duration, fmt, localTime } from '../format.js';
const labels = { wood: 'Madera', stone: 'Barro', iron: 'Hierro', food: 'Cereal' };
const empty = (): ResourceBundle => ({ wood: 0, stone: 0, iron: 0, food: 0 });
const bundle = (c: ResourceBundle) =>
  RESOURCE_KEYS.filter((k) => c[k] > 0)
    .map((k) => `${fmt(c[k])} ${labels[k].toLowerCase()}`)
    .join(' · ');
function CargoInputs({
  value,
  onChange,
  label,
}: {
  value: ResourceBundle;
  onChange: (c: ResourceBundle) => void;
  label: string;
}) {
  return (
    <fieldset className="trade-cargo">
      <legend>{label}</legend>
      <div className="trade-resources">
        {RESOURCE_KEYS.map((k) => (
          <label key={k}>
            {labels[k]}
            <input
              type="number"
              min={0}
              max={100000000}
              step={1}
              aria-label={`${label}: ${labels[k]}`}
              value={value[k]}
              onChange={(e) =>
                onChange({ ...value, [k]: Math.max(0, Math.floor(e.target.valueAsNumber || 0)) })
              }
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function TradePanel({
  view,
  now,
  target,
  onChanged,
}: {
  view: VillageView;
  now: number;
  target?: { x: number; y: number };
  onChanged: () => void;
}) {
  const [market, setMarket] = useState<TradeMarketView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<'SEND' | 'OFFERS' | 'ROUTES'>('SEND');
  const [cargo, setCargo] = useState(empty),
    [want, setWant] = useState(empty),
    [lots, setLots] = useState(1),
    [acceptLots, setAcceptLots] = useState<Record<string, number>>({}),
    [x, setX] = useState(target?.x ?? view.x),
    [y, setY] = useState(target?.y ?? view.y),
    [every, setEvery] = useState(3600);
  const toast = useToast(),
    r = getRuleset(view.rulesetVersion),
    load = useCallback(
      () => api.market(view.worldId, view.id).then(setMarket),
      [view.worldId, view.id],
    );
  useEffect(() => {
    if (!r.trade) return;
    let active = true;
    void api
      .market(view.worldId, view.id)
      .then((m) => {
        if (active) setMarket(m);
      })
      .catch((e) => {
        if (active) setError(describeError(e));
      });
    const t = setInterval(
      () =>
        void api
          .market(view.worldId, view.id)
          .then((m) => {
            if (active) setMarket(m);
          })
          .catch(() => {}),
      10000,
    );
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [view.worldId, view.id, r.trade]);
  if (!r.trade) return null;
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
      toast('info', 'Operación comercial completada');
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };
  if (!market) return <p role={error ? 'alert' : 'status'}>{error || 'Cargando mercado…'}</p>;
  const bounds = coordinateBounds(view.mapSize ?? 1000),
    needed = market.merchants.capacity ? merchantsNeeded(cargo, market.merchants.capacity) : 0,
    hasCargo = Object.values(cargo).some((n) => n > 0),
    hasWant = Object.values(want).some((n) => n > 0),
    hasOffice = levelOf(view.buildings, 'trade_office') >= 1;
  const lack = RESOURCE_KEYS.some((k) => cargo[k] * 1000 > view.resources.amountsMilli[k]);
  return (
    <section className="trade-panel" aria-label="Mercado y mercaderes">
      <h3>Mercado</h3>
      <p>
        <strong>
          {market.merchants.available}/{market.merchants.total}
        </strong>{' '}
        mercaderes libres · {fmt(market.merchants.capacity)} recursos por mercader ·{' '}
        {market.merchants.speed} casillas/h
      </p>
      <nav className="trade-tabs" aria-label="Funciones del Mercado">
        {(
          [
            ['SEND', 'Enviar recursos'],
            ['OFFERS', 'Ofertas'],
            ['ROUTES', 'Rutas'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'primary' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab !== 'OFFERS' && (
        <>
          <div className="trade-coordinates">
            <label>
              Destino X
              <input
                type="number"
                min={bounds.min}
                max={bounds.max}
                value={x}
                onChange={(e) => setX(e.target.valueAsNumber || 0)}
              />
            </label>
            <span>|</span>
            <label>
              Destino Y
              <input
                type="number"
                min={bounds.min}
                max={bounds.max}
                value={y}
                onChange={(e) => setY(e.target.valueAsNumber || 0)}
              />
            </label>
          </div>
          <CargoInputs label="Carga" value={cargo} onChange={setCargo} />
          <p>{needed} mercaderes necesarios</p>
          {tab === 'SEND' ? (
            <button
              className="primary"
              disabled={busy || !hasCargo || lack || needed > market.merchants.available}
              onClick={() =>
                void action(() => api.tradeSend(view.worldId, view.id, { x, y, cargo }))
              }
            >
              Enviar recursos
            </button>
          ) : (
            <>
              <label>
                Frecuencia
                <select value={every} onChange={(e) => setEvery(+e.target.value)}>
                  {[1, 2, 4, 6, 12, 24].map((hours) => (
                    <option key={hours} value={hours * 3600}>
                      Cada {hours} h
                    </option>
                  ))}
                </select>
              </label>
              {!hasOffice && <p>Construye Oficina de Comercio 1 para programar rutas.</p>}
              <button
                className="primary"
                disabled={busy || !hasCargo || !hasOffice || needed > market.merchants.total}
                onClick={() =>
                  void action(() =>
                    api.tradeRoute(view.worldId, view.id, { x, y, cargo, everySeconds: every }),
                  )
                }
              >
                Programar ruta
              </button>
              <div className="trade-items">
                {market.routes.map((route) => (
                  <article key={route.id}>
                    <strong>
                      {route.targetName} · cada {route.everySeconds / 3600} h
                    </strong>
                    <p>{bundle(route.cargo)}</p>
                    <small>
                      {route.enabled ? `Próxima: ${localTime(route.nextAt)}` : 'Ruta desactivada'}
                    </small>
                    {route.lastResult && (
                      <p>
                        {{
                          SENT: 'Último envío realizado',
                          MERCHANTS_BUSY: 'Último envío omitido: mercaderes ocupados',
                          INSUFFICIENT_RESOURCES: 'Último envío omitido: recursos insuficientes',
                          OWNER_CHANGED: 'La propiedad de una aldea cambió',
                          CANCELLED: 'Cancelada',
                          BUILDING_MISSING: 'Falta Oficina de Comercio',
                          ACCOUNT_RESTRICTED: 'Cuenta sin permiso para comerciar',
                        }[route.lastResult] ?? ''}
                      </p>
                    )}
                    {route.enabled && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(() => api.tradeStopRoute(view.worldId, view.id, route.id))
                        }
                      >
                        Desactivar ruta
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {tab === 'OFFERS' && (
        <>
          <h4>Publicar oferta</h4>
          <CargoInputs label="Ofreces por lote" value={cargo} onChange={setCargo} />
          <CargoInputs label="Pides por lote" value={want} onChange={setWant} />
          <label>
            Lotes
            <input
              type="number"
              min={1}
              max={100}
              value={lots}
              onChange={(e) =>
                setLots(Math.max(1, Math.min(100, Math.floor(e.target.valueAsNumber || 1))))
              }
            />
          </label>
          <p>Los recursos ofrecidos quedan reservados hasta vender o cancelar la oferta.</p>
          <button
            className="primary"
            disabled={
              busy ||
              !hasCargo ||
              !hasWant ||
              RESOURCE_KEYS.some((k) => cargo[k] * lots * 1000 > view.resources.amountsMilli[k]) ||
              needed > market.merchants.total
            }
            onClick={() =>
              void action(() => api.tradeOffer(view.worldId, view.id, { give: cargo, want, lots }))
            }
          >
            Publicar oferta
          </button>
          <h4>Ofertas disponibles</h4>
          {!market.offers.length && <p>No hay ofertas disponibles.</p>}
          <div className="trade-items">
            {market.offers.map((o) => (
              <article key={o.id}>
                <strong>
                  {o.isMine ? 'Tu oferta' : o.ownerName} · {o.lots} lotes
                </strong>
                <p>
                  {o.isMine ? 'Ofreces' : 'Recibes'} {bundle(o.give)}
                </p>
                <p>
                  {o.isMine ? 'Pides' : 'Entregas'} {bundle(o.want)}
                </p>
                {o.isMine ? (
                  <button
                    disabled={busy}
                    onClick={() => void action(() => api.tradeCancel(view.worldId, view.id, o.id))}
                  >
                    Cancelar oferta
                  </button>
                ) : (
                  <div>
                    <label>
                      Lotes de {o.ownerName}
                      <input
                        type="number"
                        min={1}
                        max={o.lots}
                        value={acceptLots[o.id] ?? 1}
                        onChange={(e) =>
                          setAcceptLots({
                            ...acceptLots,
                            [o.id]: Math.max(
                              1,
                              Math.min(o.lots, Math.floor(e.target.valueAsNumber || 1)),
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          api.tradeAccept(view.worldId, view.id, o.id, acceptLots[o.id] ?? 1),
                        )
                      }
                    >
                      Aceptar intercambio
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      <h4>Envíos y regresos</h4>
      {!market.trips.length && <p>No hay mercaderes en camino.</p>}
      <div className="trade-items">
        {market.trips.map((trip) => (
          <article key={trip.id}>
            <strong>
              {trip.status === 'RETURNING'
                ? 'Regresando'
                : trip.direction === 'INCOMING'
                  ? 'Llegada'
                  : 'Envío'}{' '}
              · {trip.status === 'RETURNING' ? trip.targetName : trip.originName} →{' '}
              {trip.status === 'RETURNING' ? trip.originName : trip.targetName}
            </strong>
            <p>
              {bundle(trip.cargo) || 'Sin cargamento'} · {trip.merchants} mercaderes
            </p>
            <time dateTime={trip.status === 'RETURNING' ? trip.returnsAt : trip.arrivesAt}>
              {duration(
                Math.max(
                  0,
                  (Date.parse(trip.status === 'RETURNING' ? trip.returnsAt : trip.arrivesAt) -
                    now) /
                    1000,
                ),
              )}
            </time>
          </article>
        ))}
      </div>
      <details className="trade-history">
        <summary>Historial de envíos</summary>
        <div className="trade-items">
          {market.history.map((trip) => (
            <article key={trip.id}>
              <strong>
                {trip.originName} → {trip.targetName}
              </strong>
              <p>
                {bundle(trip.cargo)} ·{' '}
                {trip.delivery === 'DELIVERED' ? 'Entregado' : 'Devuelto al remitente'}
              </p>
              <small>{localTime(trip.arrivesAt)}</small>
            </article>
          ))}
          {!market.history.length && <p>Todavía no hay envíos completados.</p>}
        </div>
      </details>
    </section>
  );
}
