import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MapRegionView,
  MapVillageView,
  MovementMission,
  VillageView,
} from '@reinos/contracts';
import { getRuleset } from '@reinos/game-config';
import { distanceMilli, slowestSpeed, travelSeconds } from '@reinos/game-rules';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';
import { duration, fmt } from '../format.js';

export interface MapSelection {
  x: number;
  y: number;
  terrain: string;
  village: MapVillageView | null;
}
const TYPES: Record<string, string> = {
  P: 'Pradera fértil',
  F: 'Bosque',
  M: 'Tierras altas',
  O: 'Oasis salvaje',
  S: 'Mar',
};
const project = (x: number, y: number, w: number, h: number) => ({
  x: 550 + (x - y) * 29,
  y: 85 + (x + y) * 14 + (15 - (w + h) / 2) * 14,
});
export function WorldMap({
  view,
  now,
  onRefresh,
  onOpenVillage,
}: {
  view: VillageView;
  now: number;
  onRefresh: () => void;
  onOpenVillage: (id: string) => void;
}) {
  const [center, setCenter] = useState({ x: view.x, y: view.y });
  const [radius, setRadius] = useState(7);
  const [region, setRegion] = useState<MapRegionView | null>(null);
  const [selected, setSelected] = useState<MapSelection | null>(null);
  const [error, setError] = useState('');
  const request = useRef(0);
  const load = useCallback(async () => {
    const seq = ++request.current;
    try {
      const r = await api.map(view.worldId, center.x, center.y, radius);
      if (seq === request.current) {
        setRegion(r);
        setError('');
        setSelected((previous) =>
          previous &&
          previous.x >= r.originX &&
          previous.x < r.originX + r.width &&
          previous.y >= r.originY &&
          previous.y < r.originY + r.height
            ? {
                ...previous,
                village: r.villages.find((v) => v.x === previous.x && v.y === previous.y) ?? null,
              }
            : null,
        );
      }
    } catch (e) {
      if (seq === request.current) setError(describeError(e));
    }
  }, [view.worldId, center.x, center.y, radius]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);
  const size = region?.mapSize ?? 64;
  const shift = (dx: number, dy: number) =>
    setCenter((c) => ({
      x: Math.max(0, Math.min(size - 1, c.x + dx)),
      y: Math.max(0, Math.min(size - 1, c.y + dy)),
    }));
  return (
    <div className="world-experience">
      <section className="world-map-panel" aria-label="Mapa fijo del territorio">
        <div className="world-map-heading">
          <div>
            <span className="eyebrow">EL MUNDO PERSISTENTE</span>
            <h1>Tierras de la Frontera</h1>
            <p>Cada aldea, una historia. Cada camino, una decisión.</p>
          </div>
          <span className="land-chip">
            <i /> Territorio terrestre
          </span>
        </div>
        <div className="map-tool-row">
          <div className="map-legend">
            <span>
              <i className="own" />
              Tus aldeas
            </span>
            <span>
              <i className="ally" />
              Aliados
            </span>
            <span>
              <i className="npc" />
              Aldeas libres
            </span>
            <span>
              <i className="oasis" />
              Oasis
            </span>
          </div>
          <button
            className="ghost small"
            onClick={() => {
              setCenter({ x: view.x, y: view.y });
              setSelected(null);
            }}
          >
            ⌖ Mi aldea
          </button>
        </div>
        {error && (
          <p role="alert" className="warn">
            {error}
            <button onClick={() => void load()}>Reintentar</button>
          </p>
        )}
        <div className="map-board">
          {!region ? (
            <div className="splash">Explorando el territorio…</div>
          ) : (
            <svg
              className="isometric-world"
              viewBox="80 5 940 720"
              aria-label={`Mapa centrado en ${center.x}, ${center.y}`}
            >
              <defs>
                <linearGradient id="land-side" x2="0" y2="1">
                  <stop stopColor="#76804a" />
                  <stop offset="1" stopColor="#414a29" />
                </linearGradient>
                <filter id="village-shadow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="2" />
                </filter>
                <symbol id="map-tree" viewBox="-12 -26 24 30">
                  <ellipse cy="1" rx="10" ry="3" fill="#334e2c" opacity=".25" />
                  <path d="M-1 2v-15h3V2" fill="#695039" />
                  <path d="M0-26L-9-12h4l-7 10h24L5-12h4Z" fill="#3e6740" />
                  <path d="M0-26v24h12L5-12h4Z" fill="#315538" />
                  <path d="M-1-22l-5 9h3l-6 9" stroke="#6f8a4e" strokeWidth="1" fill="none" />
                </symbol>
                <symbol id="map-village" viewBox="-24 -42 48 55">
                  <ellipse cy="6" rx="24" ry="7" fill="#26331e" opacity=".22" />
                  <path d="M-20-1L0-12 22-1 2 11Z" fill="#a0986a" />
                  <path d="M-15-4v-14L-4-24 8-18V-4L-4 3Z" fill="#d6c9a3" />
                  <path d="M-4-24v27L8-4v-14Z" fill="#ab9e7e" />
                  <path d="M-19-18L-5-34 12-19-3-12Z" fill="currentColor" />
                  <path d="M-5-34L12-19-3-12Z" fill="currentColor" opacity=".7" />
                  <path d="M-7 1v-9l5-3v9M2-16v5l3-2v-5" fill="#695641" />
                  <path d="M10-3v-10l8-4 7 5v11l-8 4Z" fill="#c8ba91" />
                  <path d="M8-13l9-11 11 12-10 5Z" fill="currentColor" />
                  <path d="M-14-17v-6M-9-14v-5" stroke="#f0ddb5" strokeWidth="2" />
                  <path d="M-2-32v-12" stroke="#66523b" />
                  <path d="M-2-44l12 3-12 4Z" fill="currentColor" />
                </symbol>
                <symbol id="map-oasis" viewBox="-25 -35 50 50">
                  <ellipse cy="3" rx="21" ry="10" fill="#a3ad68" />
                  <ellipse cy="3" rx="10" ry="5" fill="#c3bb7d" />
                  <path d="M-10 2q-5-15 0-27" stroke="#806340" strokeWidth="3" fill="none" />
                  <path
                    d="M-10-24q-13-10-17 1 9-4 17-1M-10-24q12-12 17-2-11-2-17 2M-10-24q4-15-3-12-3 5 3 12"
                    fill="#4d7140"
                  />
                  <path d="M7 4l6-2 5 2v4h-2V6H9v3H7ZM17 1l3-4 1 5" fill="#7f6342" />
                </symbol>
              </defs>
              <g opacity=".5">
                <path
                  d="M125 335L550 125 975 335 550 545Z"
                  fill="#1c291d"
                  transform="translate(0,32)"
                  filter="url(#village-shadow)"
                />
              </g>
              {Array.from({ length: region.width + region.height - 1 }, (_, sum) =>
                Array.from({ length: region.width }, (_, x) => ({ x, y: sum - x }))
                  .filter((p) => p.y >= 0 && p.y < region.height)
                  .map(({ x, y }) => {
                    const wx = region.originX + x,
                      wy = region.originY + y,
                      t = region.tiles[y * region.width + x]!,
                      p = project(x, y, region.width, region.height),
                      v = region.villages.find((v) => v.x === wx && v.y === wy),
                      active = selected?.x === wx && selected?.y === wy;
                    const green = ['#95a76b', '#9eaf72', '#a6b47c', '#8fa367'][
                      (wx * 7 + wy * 3) % 4
                    ];
                    return (
                      <g
                        key={`${x}:${y}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${v?.name ?? TYPES[t]} (${wx}|${wy})`}
                        onClick={() =>
                          setSelected({ x: wx, y: wy, terrain: t, village: v ?? null })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelected({ x: wx, y: wy, terrain: t, village: v ?? null });
                          }
                        }}
                        className={`world-tile ${active ? 'selected' : ''}`}
                      >
                        <title>
                          {v?.name ?? TYPES[t]} · ({wx}|{wy})
                        </title>
                        <path
                          d={`M${p.x - 29} ${p.y}l29 14 29-14v5l-29 14-29-14Z`}
                          fill="url(#land-side)"
                        />
                        <path
                          className="tile-top"
                          d={`M${p.x} ${p.y - 14}l29 14-29 14-29-14Z`}
                          fill={
                            t === 'M'
                              ? '#a9ac8b'
                              : t === 'F'
                                ? '#85995f'
                                : t === 'O'
                                  ? '#acb979'
                                  : green
                          }
                          stroke={active ? '#ffe4a0' : '#748b54'}
                          strokeWidth={active ? 2.5 : 0.5}
                        />
                        {!v && t === 'F' && (
                          <>
                            <use
                              href="#map-tree"
                              x={p.x - 19}
                              y={p.y - 24}
                              width="18"
                              height="27"
                            />
                            <use href="#map-tree" x={p.x - 2} y={p.y - 30} width="21" height="31" />
                            <use href="#map-tree" x={p.x - 9} y={p.y - 18} width="16" height="23" />
                          </>
                        )}
                        {!v && t === 'M' && (
                          <>
                            <path d={`M${p.x - 18} ${p.y + 3}l15-25 22 25-17 7Z`} fill="#8e927b" />
                            <path d={`M${p.x - 3} ${p.y - 22}l22 25-17 7Z`} fill="#747d69" />
                            <path d={`M${p.x - 8} ${p.y - 14}l5-8 7 8-6-2Z`} fill="#e1dfbc" />
                          </>
                        )}
                        {v?.kind === 'OASIS' && (
                          <use href="#map-oasis" x={p.x - 24} y={p.y - 34} width="48" height="48" />
                        )}
                        {v && v.kind !== 'OASIS' && (
                          <use
                            href="#map-village"
                            x={p.x - 24}
                            y={p.y - 39}
                            width="48"
                            height="55"
                            style={{
                              color: v.isMine
                                ? '#3c7398'
                                : v.isAlly
                                  ? '#557b54'
                                  : v.kind === 'NPC'
                                    ? '#9b7752'
                                    : '#9d4c3c',
                            }}
                          />
                        )}
                        {v?.isMine && (
                          <>
                            <circle cx={p.x} cy={p.y + 13} r="3" fill="#c9e3f0" />
                            <text x={p.x} y={p.y + 26} textAnchor="middle" className="map-name">
                              {v.name.slice(0, 16)}
                            </text>
                          </>
                        )}
                        {active && (
                          <path
                            d={`M${p.x} ${p.y - 18}l34 18-34 18-34-18Z`}
                            fill="none"
                            stroke="#ffe2a0"
                            strokeWidth="1.5"
                            pointerEvents="none"
                          />
                        )}
                      </g>
                    );
                  }),
              )}
              {region.movements?.map((m) => {
                const f = project(
                    m.from.x - region.originX,
                    m.from.y - region.originY,
                    region.width,
                    region.height,
                  ),
                  t = project(
                    m.to.x - region.originX,
                    m.to.y - region.originY,
                    region.width,
                    region.height,
                  ),
                  start = new Date(m.departedAt).getTime(),
                  end = new Date(m.arrivesAt).getTime(),
                  progress = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start))),
                  x = f.x + (t.x - f.x) * progress,
                  y = f.y + (t.y - f.y) * progress;
                if (x < 100 || x > 1000 || y < 30 || y > 690) return null;
                return (
                  <g key={m.id} className={m.isMine ? 'own-march' : 'hostile-march'}>
                    <path
                      d={`M${f.x} ${f.y}L${t.x} ${t.y}`}
                      fill="none"
                      stroke={m.isMine ? '#f6e1a0' : '#a8342a'}
                      strokeWidth="2"
                      strokeDasharray="4 5"
                      opacity=".8"
                    />
                    <circle
                      cx={x}
                      cy={y - 5}
                      r="9"
                      fill={m.isMine ? '#f1d28a' : '#a8342a'}
                      stroke="#fff0c5"
                      strokeWidth="1.5"
                    />
                    <text x={x} y={y - 1} textAnchor="middle" fill="#2d3420" fontSize="11">
                      {m.mission === 'SETTLE' ? '⚑' : '⚔'}
                    </text>
                  </g>
                );
              })}
              <text x="545" y="675" textAnchor="middle" className="map-compass">
                N ↗ · MAPA {size} × {size}
              </text>
            </svg>
          )}
          <div className="map-pan-controls" aria-label="Desplazar mapa">
            <button aria-label="Mapa norte" onClick={() => shift(0, -5)}>
              ↑
            </button>
            <div>
              <button aria-label="Mapa oeste" onClick={() => shift(-5, 0)}>
                ←
              </button>
              <span>
                {center.x} | {center.y}
              </span>
              <button aria-label="Mapa este" onClick={() => shift(5, 0)}>
                →
              </button>
            </div>
            <button aria-label="Mapa sur" onClick={() => shift(0, 5)}>
              ↓
            </button>
          </div>
          <div className="map-zoom-controls">
            <button
              aria-label="Acercar mapa"
              disabled={radius <= 4}
              onClick={() => setRadius((r) => r - 1)}
            >
              +
            </button>
            <button
              aria-label="Alejar mapa"
              disabled={radius >= 10}
              onClick={() => setRadius((r) => r + 1)}
            >
              −
            </button>
          </div>
        </div>
        <div className="map-bottom-line">
          <span>⌖ {selected ? `${selected.x} | ${selected.y}` : `${center.x} | ${center.y}`}</span>
          <span>Solo ves tus marchas y los ataques hacia tus aldeas.</span>
          <span>Perspectiva fija</span>
        </div>
      </section>
      <aside className="territory-detail">
        <TileActions
          key={selected ? `${selected.x}:${selected.y}` : 'empty'}
          selection={selected}
          view={view}
          now={now}
          onChanged={() => {
            onRefresh();
            void load();
          }}
          onOpenVillage={onOpenVillage}
        />
        <div className="march-list">
          <span className="eyebrow">EN EL TERRITORIO</span>
          <h3>
            Movimientos visibles <small>{region?.movements?.length ?? 0}</small>
          </h3>
          {!region?.movements?.length && (
            <p className="muted small">
              Tus caminos están en calma. Las expediciones aparecerán aquí al salir.
            </p>
          )}
          {region?.movements?.map((m) => (
            <div key={m.id} className={`march-card ${m.isMine ? '' : 'enemy'}`}>
              <span>{m.isMine ? '⚑' : '⚔'}</span>
              <div>
                <strong>
                  {m.isMine
                    ? {
                        ATTACK: 'Ataque',
                        RAID: 'Saqueo',
                        TRANSFER: 'Traslado',
                        REINFORCE: 'Refuerzo',
                        CONQUER: 'Conquista',
                        SETTLE: 'Fundación',
                      }[m.mission]
                    : 'Ataque entrante'}
                </strong>
                <small>
                  ({m.from.x}|{m.from.y}) → ({m.to.x}|{m.to.y})
                </small>
              </div>
              <time>{duration((new Date(m.arrivesAt).getTime() - now) / 1000)}</time>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
function TileActions({
  selection: s,
  view,
  now,
  onChanged,
  onOpenVillage,
}: {
  selection: MapSelection | null;
  view: VillageView;
  now: number;
  onChanged: () => void;
  onOpenVillage: (id: string) => void;
}) {
  const r = getRuleset(view.rulesetVersion),
    toast = useToast();
  const [name, setName] = useState('Nueva aldea'),
    [mission, setMission] = useState<MovementMission>(
      s?.village?.isMine ? 'TRANSFER' : s?.village?.isAlly ? 'REINFORCE' : 'ATTACK',
    ),
    [qty, setQty] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState(false);
  const units = view.troops
    .filter((t) => t.quantity > 0)
    .map((t) => ({
      unitType: t.unitType,
      quantity: Math.min(t.quantity, Math.max(0, Math.floor(qty[t.unitType] ?? 0))),
    }))
    .filter((t) => t.quantity > 0);
  const distance = s ? distanceMilli(view, s) : 0n,
    secs = units.length ? travelSeconds(distance, slowestSpeed(r, units), view.speedMultiplier) : 0;
  const run = async () => {
    if (!s) return;
    setBusy(true);
    try {
      if (s.village) {
        const order = await api.march(view.worldId, view.id, {
          targetVillageId: s.village.id,
          mission,
          units,
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
          {v.isMine && v.kind === 'PLAYER' && (
            <button className="primary wide" onClick={() => onOpenVillage(v.id)}>
              Entrar a la aldea →
            </button>
          )}
          {v.kind === 'OASIS' && v.animals?.length ? (
            <div className="guardian-list">
              <h4>Guardianes animales</h4>
              {v.animals.map((t) => (
                <p key={t.unitType}>
                  {r.units.find((u) => u.type === t.unitType)?.name} <strong>{t.quantity}</strong>
                </p>
              ))}
            </div>
          ) : null}
          {v.isMine && v.kind === 'OASIS' && (
            <p className="muted">
              Oasis bajo tu control. Aporta +{(r.territory?.oasisBonusPermille ?? 0) / 10} % a la
              producción de su aldea.
            </p>
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
                      {!v.isCapital && <option value="CONQUER">Conquistar</option>}
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
          {s.terrain === 'P' || s.terrain === 'F' ? (
            <>
              <p className="muted">Funda una nueva aldea y amplía tu dominio.</p>
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
              </div>
              <p className="small muted">
                Coste: {Object.values(r.territory!.foundingCost).join(' / ')}
                <br />
                Madera · barro · hierro · cereal
              </p>
              <button
                className="primary wide"
                disabled={busy || name.trim().length < 3}
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
