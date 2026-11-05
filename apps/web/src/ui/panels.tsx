import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BattleReportDetail,
  BattleReportSummary,
  MapRegionView,
  MovementMission,
  VillageView,
} from '@reinos/contracts';
import {
  RESOURCE_KEYS,
  buildingDef,
  getRuleset,
  unitDef,
  type BuildingType,
  type ResourceBundle,
  type Ruleset,
  type UnitType,
} from '@reinos/game-config';
import {
  buildingCost,
  buildingSeconds,
  distanceMilli,
  slowestSpeed,
  travelSeconds,
  unitCost,
  unitTrainingSeconds,
  validateConstruction,
  validateRecruitment,
  type BattleResult,
  type UnitStack,
} from '@reinos/game-rules';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';
import { duration, fmt, localTime } from '../format.js';
import { RESOURCE_LABEL, ResourceIcon, liveAmount } from './VillagePage.js';

const PLOT_KIND_LABEL = {
  field: 'Campo de recursos',
  citadel: 'Ciudadela',
  industry: 'Distrito productivo',
  fortification: 'Muralla',
  center: 'Plaza central',
  standard: 'Parcela',
  coastal: 'Parcela costera',
  wall: 'Muralla',
} as const;

function Cost({ cost, view, now }: { cost: ResourceBundle; view: VillageView; now: number }) {
  return (
    <ul className="cost">
      {RESOURCE_KEYS.map((k) => {
        const lacking = liveAmount(view, k, now) < cost[k];
        return (
          <li key={k} className={lacking ? 'lacking' : ''} title={RESOURCE_LABEL[k]}>
            <ResourceIcon k={k} /> {fmt(cost[k])}
          </li>
        );
      })}
    </ul>
  );
}

function canAffordNow(cost: ResourceBundle, view: VillageView, now: number) {
  return RESOURCE_KEYS.every((k) => liveAmount(view, k, now) >= cost[k]);
}

const REASON: Record<string, string> = {
  PLOT_KIND_MISMATCH: 'No puede ir en esta parcela',
  CIVILIZATION_RESTRICTED: 'Exclusivo de otra civilización',
  NOT_COASTAL: 'Requiere aldea costera',
  BUILDING_ALREADY_EXISTS: 'Ya existe en otra parcela',
  REQUIREMENTS_NOT_MET: 'Requisitos pendientes',
  MAX_LEVEL_REACHED: 'Nivel máximo',
  PLOT_OCCUPIED: 'Parcela ocupada',
};

// ---------------------------------------------------------------------------
// Ciudad
// ---------------------------------------------------------------------------
export function CityPanel({
  view,
  now,
  selectedPlot,
  onSelectPlot,
  onChanged,
}: {
  view: VillageView;
  now: number;
  selectedPlot: number | null;
  onSelectPlot: (p: number) => void;
  onChanged: () => void;
}) {
  const r = getRuleset(view.rulesetVersion);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const plot = r.cityLayout.plots.find((p) => p.id === selectedPlot);
  const existing = view.buildings.find((b) => b.plot === selectedPlot);

  const build = async (type: BuildingType) => {
    if (selectedPlot === null) return;
    setBusy(true);
    try {
      const res = await api.build(view.worldId, view.id, {
        plot: selectedPlot,
        buildingType: type,
      });
      toast('info', `Obra iniciada: nivel ${res.targetLevel}`);
      onChanged();
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const options: BuildingType[] = existing
    ? [existing.type]
    : plot
      ? r.buildings
          .filter(
            (b) =>
              b.plotKind === plot.kind &&
              (!plot.allowedTypes || plot.allowedTypes.includes(b.type)) &&
              (!b.civilization || b.civilization === view.civilization),
          )
          .map((b) => b.type)
      : [];

  return (
    <div className="panel">
      {view.construction ? (
        <div className="queue-item">
          <strong>
            🏗 {buildingDef(r, view.construction.type).name} → nivel {view.construction.targetLevel}
          </strong>
          <Progress
            start={view.construction.startedAt}
            end={view.construction.completesAt}
            now={now}
          />
        </div>
      ) : (
        <p className="muted">Sin construcción en curso. Selecciona una parcela en la vista 3D.</p>
      )}

      {plot ? (
        <>
          <h3>
            {existing
              ? `${buildingDef(r, existing.type).name} · nivel ${existing.level}`
              : PLOT_KIND_LABEL[plot.kind]}
            <small> (parcela {plot.id})</small>
          </h3>
          {existing && <p className="muted">{buildingDef(r, existing.type).description}</p>}
          {plot.kind === 'coastal' && !view.coastal && (
            <p className="warn">Tu aldea no es costera: aquí no puede haber puerto.</p>
          )}
          {options.map((type) => {
            const check = validateConstruction(r, {
              civilization: view.civilization,
              coastal: view.coastal,
              buildings: view.buildings,
              plot: plot.id,
              type,
            });
            const level = (existing?.level ?? 0) + 1;
            const def = buildingDef(r, type);
            const maxed = level > def.maxLevel;
            const cost = maxed ? null : buildingCost(r, type, level, view.civilization);
            const secs = maxed ? 0 : buildingSeconds(r, type, level, view.speedMultiplier);
            return (
              <div key={type} className="option">
                <div className="option-head">
                  <strong>{existing ? `Mejorar a nivel ${level}` : def.name}</strong>
                  {!maxed && <span className="muted">⏱ {duration(secs)}</span>}
                </div>
                {!existing && <p className="muted small">{def.description}</p>}
                {cost && <Cost cost={cost} view={view} now={now} />}
                {!check.ok && (
                  <p className="warn small">
                    {REASON[check.code] ?? check.code}
                    {check.code === 'REQUIREMENTS_NOT_MET' &&
                      `: ${def.requires.map((q) => `${buildingDef(r, q.building).name} ${q.level}`).join(', ')}`}
                  </p>
                )}
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !check.ok ||
                    !!view.construction ||
                    !cost ||
                    !canAffordNow(cost, view, now)
                  }
                  onClick={() => build(type)}
                >
                  {existing ? 'Mejorar' : 'Construir'}
                </button>
              </div>
            );
          })}
        </>
      ) : (
        <p className="muted">Ninguna parcela seleccionada.</p>
      )}

      <h4>Edificios</h4>
      <ul className="list">
        {[...view.buildings]
          .sort((a, b) => a.plot - b.plot)
          .map((b) => (
            <li key={b.plot}>
              <button className="link" onClick={() => onSelectPlot(b.plot)}>
                {buildingDef(r, b.type).name}
              </button>
              <span>nivel {b.level}</span>
            </li>
          ))}
      </ul>
      <h4>Parcelas libres</h4>
      <ul className="list">
        {r.cityLayout.plots
          .filter(
            (p) =>
              !view.buildings.some((b) => b.plot === p.id) &&
              (p.kind !== 'coastal' || view.coastal),
          )
          .map((p) => (
            <li key={p.id}>
              <button className="link" onClick={() => onSelectPlot(p.id)}>
                {PLOT_KIND_LABEL[p.kind]} {p.id}
              </button>
              <span className="muted">libre</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

function Progress({ start, end, now }: { start: string; end: string; now: number }) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const pct = Math.min(100, Math.max(0, ((now - s) / Math.max(1, e - s)) * 100));
  const left = (e - now) / 1000;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="bar" style={{ width: `${pct}%` }} />
      <span>{left > 0 ? duration(left) : 'finalizando…'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ejército
// ---------------------------------------------------------------------------
export function ArmyPanel({
  view,
  now,
  onChanged,
}: {
  view: VillageView;
  now: number;
  onChanged: () => void;
}) {
  const r = getRuleset(view.rulesetVersion);
  const toast = useToast();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reserve, setReserve] = useState(view.doctrine.reservePercent);
  const [retreat, setRetreat] = useState<number | null>(view.doctrine.retreatThresholdPercent);
  const [busy, setBusy] = useState(false);

  const recruit = async (unitType: UnitType) => {
    const quantity = qty[unitType] ?? 0;
    if (quantity <= 0) return;
    setBusy(true);
    try {
      await api.recruit(view.worldId, view.id, { unitType, quantity });
      toast('info', `Reclutando ${quantity} × ${unitDef(r, unitType).name}`);
      setQty((q) => ({ ...q, [unitType]: 0 }));
      onChanged();
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveDoctrine = async () => {
    setBusy(true);
    try {
      await api.doctrine(view.worldId, view.id, {
        reservePercent: reserve,
        retreatThresholdPercent: retreat,
      });
      toast('info', 'Doctrina defensiva guardada');
      onChanged();
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const units = r.units.filter(
    (u) => !u.npcOnly && (!u.civilization || u.civilization === view.civilization),
  );
  return (
    <div className="panel">
      <h3>Guarnición</h3>
      <UnitTable r={r} stacks={view.troops} empty="Sin tropas en la ciudad." />
      {view.wounded.length > 0 && (
        <>
          <h4>Heridos (hospital)</h4>
          <UnitTable r={r} stacks={view.wounded} empty="" />
        </>
      )}
      {view.recruitment.length > 0 && (
        <>
          <h4>Cola de reclutamiento</h4>
          {view.recruitment.map((o) => (
            <div key={o.id} className="queue-item">
              {o.quantity} × {unitDef(r, o.unitType).name}
              <Progress start={o.startedAt} end={o.completesAt} now={now} />
            </div>
          ))}
        </>
      )}
      <h3>Reclutar</h3>
      {units.map((u) => {
        const check = validateRecruitment(r, {
          civilization: view.civilization,
          buildings: view.buildings,
          unitType: u.type,
        });
        const n = qty[u.type] ?? 0;
        const cost = unitCost(r, u.type, Math.max(1, n));
        return (
          <div key={u.type} className="option">
            <div className="option-head">
              <strong>{u.name}</strong>
              <span className="muted small">
                ⚔ {u.attack} · 🛡 {u.infantryDefense}/{u.cavalryDefense} · 🎒 {u.carry} · ⏱{' '}
                {duration(unitTrainingSeconds(r, u.type, view.speedMultiplier))}
              </span>
            </div>
            <Cost cost={cost} view={view} now={now} />
            {check.ok ? (
              <div className="row">
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={n}
                  aria-label={`Cantidad de ${u.name}`}
                  onChange={(e) =>
                    setQty((q) => ({ ...q, [u.type]: Math.max(0, Number(e.target.value) || 0) }))
                  }
                />
                <button
                  className="primary"
                  disabled={busy || n <= 0 || !canAffordNow(cost, view, now)}
                  onClick={() => recruit(u.type)}
                >
                  Reclutar
                </button>
              </div>
            ) : (
              <p className="warn small">
                {check.code === 'TRAINING_BUILDING_MISSING'
                  ? `Necesitas ${buildingDef(r, u.trainedAt).name}`
                  : `Requiere ${u.requires.map((q) => `${buildingDef(r, q.building).name} ${q.level}`).join(', ')}`}
              </p>
            )}
          </div>
        );
      })}
      <h3>Doctrina defensiva</h3>
      <p className="muted small">
        Se aplica automáticamente aunque estés desconectado (combate offline justo).
      </p>
      <label>
        Reserva que no combate: <strong>{reserve}%</strong>
        <input
          type="range"
          min={0}
          max={r.combat.maxReservePercent}
          value={reserve}
          onChange={(e) => setReserve(Number(e.target.value))}
        />
      </label>
      <label className="inline">
        <input
          type="checkbox"
          checked={retreat !== null}
          onChange={(e) => setRetreat(e.target.checked ? 200 : null)}
        />{' '}
        Retirarse si el ataque supera
      </label>
      {retreat !== null && (
        <label>
          <strong>{(retreat / 100).toFixed(1)}×</strong> la defensa
          <input
            type="range"
            min={100}
            max={r.combat.maxRetreatThresholdPercent}
            step={25}
            value={retreat}
            onChange={(e) => setRetreat(Number(e.target.value))}
          />
        </label>
      )}
      <button className="primary" disabled={busy} onClick={saveDoctrine}>
        Guardar doctrina
      </button>
    </div>
  );
}

function UnitTable({
  r,
  stacks,
  empty,
}: {
  r: Ruleset;
  stacks: Array<{ unitType: UnitType; quantity: number }>;
  empty: string;
}) {
  if (stacks.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="list">
      {stacks.map((s) => (
        <li key={s.unitType}>
          <span>{unitDef(r, s.unitType).name}</span>
          <strong>{fmt(s.quantity)}</strong>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Campaña: mapa + envío de tropas
// ---------------------------------------------------------------------------
const TILE_COLORS: Record<string, string> = {
  S: '#2f6d8f',
  P: '#8fae5a',
  F: '#4f7a3a',
  M: '#8d877d',
  O: '#d9c26a',
};

function MapCanvas({
  region,
  selected,
  onSelect,
}: {
  region: MapRegionView;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cell = Math.floor(330 / Math.max(region.width, region.height));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    for (let y = 0; y < region.height; y++)
      for (let x = 0; x < region.width; x++) {
        const t = region.tiles[y * region.width + x]!;
        g.fillStyle = TILE_COLORS[t] ?? '#000';
        g.fillRect(x * cell, y * cell, cell, cell);
        if (region.coastal[y * region.width + x] === '1') {
          g.fillStyle = 'rgba(232,214,160,0.35)';
          g.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    for (const v of region.villages) {
      const cx = (v.x - region.originX) * cell + cell / 2;
      const cy = (v.y - region.originY) * cell + cell / 2;
      g.beginPath();
      g.arc(cx, cy, cell * 0.55, 0, Math.PI * 2);
      g.fillStyle = v.isMine ? '#f2c94c' : v.civilization === 'sea_league' ? '#3d8fd1' : '#c0392b';
      g.fill();
      g.lineWidth = v.id === selected ? 3 : 1.5;
      g.strokeStyle = v.id === selected ? '#fff' : '#1b1410';
      g.stroke();
    }
  }, [region, cell, selected]);
  return (
    <canvas
      ref={ref}
      className="map"
      width={region.width * cell}
      height={region.height * cell}
      aria-label="Mapa del mundo: haz clic en una aldea para seleccionarla como objetivo"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x =
          Math.floor(((e.clientX - rect.left) / rect.width) * region.width) + region.originX;
        const y =
          Math.floor(((e.clientY - rect.top) / rect.height) * region.height) + region.originY;
        const hit = region.villages.find(
          (v) => Math.abs(v.x - x) <= 1 && Math.abs(v.y - y) <= 1 && !v.isMine,
        );
        if (hit) onSelect(hit.id);
      }}
    />
  );
}

export function CampaignPanel({
  view,
  now,
  onChanged,
}: {
  view: VillageView;
  now: number;
  onChanged: () => void;
}) {
  const r = getRuleset(view.rulesetVersion);
  const toast = useToast();
  const [region, setRegion] = useState<MapRegionView | null>(null);
  const [center, setCenter] = useState({ x: view.x, y: view.y });
  const [goto, setGoto] = useState({ x: String(view.x), y: String(view.y) });
  const [target, setTarget] = useState<string | null>(null);
  const [mission, setMission] = useState<MovementMission>('RAID');
  const [send, setSend] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .map(view.worldId, center.x, center.y, 16)
      .then(setRegion)
      .catch((e) => toast('error', describeError(e)));
  }, [view.worldId, center.x, center.y, toast]);

  const pan = (dx: number, dy: number) =>
    setCenter((c) => ({ x: Math.max(0, c.x + dx), y: Math.max(0, c.y + dy) }));

  const targetVillage = region?.villages.find((v) => v.id === target);
  const chosen: UnitStack[] = view.troops
    .map((t) => ({ unitType: t.unitType, quantity: Math.min(t.quantity, send[t.unitType] ?? 0) }))
    .filter((s) => s.quantity > 0);
  const eta = useMemo(() => {
    if (!targetVillage || chosen.length === 0) return null;
    return travelSeconds(
      distanceMilli(view, targetVillage),
      slowestSpeed(r, chosen),
      view.speedMultiplier,
    );
  }, [targetVillage, chosen, view, r]);

  const march = async () => {
    if (!target || chosen.length === 0) return;
    setBusy(true);
    try {
      const res = await api.march(view.worldId, view.id, {
        targetVillageId: target,
        mission,
        units: chosen,
      });
      toast('info', `Tropas en marcha. Llegada: ${localTime(res.arrivalAt)}`);
      setSend({});
      onChanged();
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>
        Mapa de la región{' '}
        <small>
          centro ({center.x}|{center.y})
        </small>
      </h3>
      {region ? (
        <MapCanvas region={region} selected={target} onSelect={setTarget} />
      ) : (
        <p>Cargando mapa…</p>
      )}
      <div className="row map-nav">
        <button
          className="ghost small"
          aria-label="Desplazar mapa al oeste"
          onClick={() => pan(-10, 0)}
        >
          ◀
        </button>
        <button
          className="ghost small"
          aria-label="Desplazar mapa al norte"
          onClick={() => pan(0, -10)}
        >
          ▲
        </button>
        <button
          className="ghost small"
          aria-label="Desplazar mapa al sur"
          onClick={() => pan(0, 10)}
        >
          ▼
        </button>
        <button
          className="ghost small"
          aria-label="Desplazar mapa al este"
          onClick={() => pan(10, 0)}
        >
          ▶
        </button>
        <button className="ghost small" onClick={() => setCenter({ x: view.x, y: view.y })}>
          Mi aldea
        </button>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const x = Number(goto.x);
          const y = Number(goto.y);
          if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0) setCenter({ x, y });
        }}
      >
        <input
          type="number"
          min={0}
          aria-label="Coordenada X"
          value={goto.x}
          onChange={(e) => setGoto((g) => ({ ...g, x: e.target.value }))}
        />
        <input
          type="number"
          min={0}
          aria-label="Coordenada Y"
          value={goto.y}
          onChange={(e) => setGoto((g) => ({ ...g, y: e.target.value }))}
        />
        <button className="ghost small">Ir a coordenadas</button>
      </form>
      <p className="muted small">
        ● propia · <span style={{ color: '#c0392b' }}>●</span> Imperio ·{' '}
        <span style={{ color: '#3d8fd1' }}>●</span> Liga — mapa 2D provisional (el mapa 3D por
        regiones es Gate 2).
      </p>
      <h3>Enviar tropas</h3>
      {targetVillage ? (
        <p>
          Objetivo: <strong>{targetVillage.name}</strong> de {targetVillage.ownerName ?? 'nadie'} (
          {targetVillage.x}|{targetVillage.y})
        </p>
      ) : (
        <p className="muted">Selecciona una aldea enemiga en el mapa.</p>
      )}
      <div className="row">
        <label className="inline">
          <input type="radio" checked={mission === 'RAID'} onChange={() => setMission('RAID')} />{' '}
          Saqueo
        </label>
        <label className="inline">
          <input
            type="radio"
            checked={mission === 'ATTACK'}
            onChange={() => setMission('ATTACK')}
          />{' '}
          Ataque total
        </label>
      </div>
      {view.troops.length === 0 && <p className="muted">No hay tropas disponibles.</p>}
      {view.troops.map((t) => (
        <div key={t.unitType} className="row">
          <span className="grow">
            {unitDef(r, t.unitType).name} <small>({t.quantity})</small>
          </span>
          <input
            type="number"
            min={0}
            max={t.quantity}
            value={send[t.unitType] ?? 0}
            aria-label={`Enviar ${unitDef(r, t.unitType).name}`}
            onChange={(e) =>
              setSend((s) => ({
                ...s,
                [t.unitType]: Math.max(0, Math.min(t.quantity, Number(e.target.value) || 0)),
              }))
            }
          />
          <button
            className="ghost small"
            onClick={() => setSend((s) => ({ ...s, [t.unitType]: t.quantity }))}
          >
            todas
          </button>
        </div>
      ))}
      {eta !== null && (
        <p>
          Tiempo de viaje estimado: <strong>{duration(eta)}</strong> (el servidor fija la hora
          definitiva)
        </p>
      )}
      <button className="danger" disabled={busy || !target || chosen.length === 0} onClick={march}>
        {mission === 'RAID' ? 'Enviar saqueo' : 'Enviar ataque'}
      </button>

      <h3>Movimientos</h3>
      {view.movements.length === 0 && <p className="muted">Sin movimientos.</p>}
      {view.movements.map((m) => (
        <div key={m.id} className={`queue-item mv-${m.direction.toLowerCase()}`}>
          <strong>
            {m.direction === 'INCOMING'
              ? '⚠ Ataque entrante de ' + m.originName
              : m.direction === 'RETURNING'
                ? '↩ Regreso desde ' + m.targetName
                : '→ ' + (m.mission === 'RAID' ? 'Saqueo a ' : 'Ataque a ') + m.targetName}
          </strong>
          <div className="muted small">
            {m.units
              ? m.units.map((u) => `${u.quantity} ${unitDef(r, u.unitType).name}`).join(', ')
              : 'Composición desconocida'}
            {m.loot && ` · botín ${RESOURCE_KEYS.map((k) => fmt(m.loot![k])).join('/')}`}
          </div>
          <Progress start={m.departedAt} end={m.arrivesAt} now={now} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Informes
// ---------------------------------------------------------------------------
export function ReportsPanel({ worldId }: { worldId: string }) {
  const toast = useToast();
  const [list, setList] = useState<BattleReportSummary[] | null>(null);
  const [detail, setDetail] = useState<BattleReportDetail | null>(null);
  useEffect(() => {
    api
      .reports(worldId)
      .then(setList)
      .catch((e) => toast('error', describeError(e)));
  }, [worldId, toast]);

  if (detail) return <ReportDetail report={detail} onBack={() => setDetail(null)} />;
  return (
    <div className="panel">
      <h3>Informes de batalla</h3>
      {!list && <p>Cargando…</p>}
      {list?.length === 0 && <p className="muted">Todavía no hay combates.</p>}
      <ul className="list reports">
        {list?.map((b) => {
          const won = b.role === b.outcome;
          return (
            <li key={b.id}>
              <button
                className="link"
                onClick={() =>
                  api
                    .report(worldId, b.id)
                    .then(setDetail)
                    .catch((e) => toast('error', describeError(e)))
                }
              >
                <span className={`badge ${won ? 'badge-ok' : 'badge-danger'}`}>
                  {won ? 'Victoria' : 'Derrota'}
                </span>{' '}
                {b.location === 'FIELD' ? '⚔ Campo abierto · ' : ''}
                {b.attackerVillageName} → {b.defenderVillageName}
              </button>
              <small className="muted">{localTime(b.occurredAt)}</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReportDetail({ report, onBack }: { report: BattleReportDetail; onBack: () => void }) {
  const r = getRuleset(report.rulesetVersion);
  const res = report.result as BattleResult;
  const name = (t: UnitType) => unitDef(r, t).name;
  const q = (s: UnitStack[], t: UnitType) => s.find((x) => x.unitType === t)?.quantity ?? 0;
  return (
    <div className="panel">
      <button className="ghost" onClick={onBack}>
        ← Informes
      </button>
      <h3>
        {report.location === 'FIELD'
          ? 'Encuentro en campo'
          : report.mission === 'CONQUER'
            ? 'Conquista'
            : report.mission === 'RAID'
              ? 'Saqueo'
              : 'Ataque'}
        : {report.attackerVillageName} → {report.defenderVillageName}
      </h3>
      <p className="muted small">
        {localTime(report.occurredAt)} · reglas {report.rulesetVersion} · semilla{' '}
        <code>{report.seed}</code>
      </p>
      <p>
        Vencedor:{' '}
        <strong>{res.outcome === 'ATTACKER' ? report.attackerName : report.defenderName}</strong> ·
        fuerza ⚔ {fmt(res.powers.attack)} vs 🛡 {fmt(res.powers.defense)} · suerte{' '}
        {res.powers.luckPermille / 10}% · muralla +{res.powers.wallPermille / 10}%
      </p>
      {report.location === 'FIELD' && report.fieldPosition && (
        <p className="muted small">
          Campo abierto ({report.fieldPosition.x}|{report.fieldPosition.y}) · Sin murallas ni botín
        </p>
      )}
      {res.trapsUsed ? <p className="muted small">Trampas utilizadas: {res.trapsUsed}</p> : null}
      <h4>Atacante — {report.attackerName}</h4>
      <table className="units">
        <thead>
          <tr>
            <th>Unidad</th>
            <th>Enviadas</th>
            <th>Bajas</th>
            <th>Vuelven</th>
          </tr>
        </thead>
        <tbody>
          {res.attacker.sent.map((s) => (
            <tr key={s.unitType}>
              <td>{name(s.unitType)}</td>
              <td>{fmt(s.quantity)}</td>
              <td>{fmt(q(res.attacker.lost, s.unitType))}</td>
              <td>{fmt(q(res.attacker.survivors, s.unitType))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Defensor — {report.defenderName}</h4>
      {res.defender.retreated && <p className="warn">El defensor se retiró según su doctrina.</p>}
      {res.defender.present.length === 0 ? (
        <p className="muted">Sin tropas defensoras.</p>
      ) : (
        <table className="units">
          <thead>
            <tr>
              <th>Unidad</th>
              <th>Presentes</th>
              <th>Muertos</th>
              <th>Heridos</th>
              <th>Quedan</th>
            </tr>
          </thead>
          <tbody>
            {res.defender.present.map((s) => (
              <tr key={s.unitType}>
                <td>{name(s.unitType)}</td>
                <td>{fmt(s.quantity)}</td>
                <td>{fmt(q(res.defender.killed, s.unitType))}</td>
                <td>{fmt(q(res.defender.wounded, s.unitType))}</td>
                <td>{fmt(q(res.defender.survivors, s.unitType))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h4>Botín</h4>
      <ul className="cost">
        {RESOURCE_KEYS.map((k) => (
          <li key={k}>
            <ResourceIcon k={k} /> {fmt(res.loot[k])}
          </li>
        ))}
      </ul>
      <h4>Desarrollo del combate</h4>
      <ol className="timeline">
        {res.milestones.map((m) => (
          <li key={m.t}>
            {m.kind === 'ENGAGE' && 'Los ejércitos se encuentran.'}
            {m.kind === 'RETREAT' && 'El defensor se retira.'}
            {m.kind === 'PHASE' &&
              `${m.phase === 'VOLLEY' ? 'Andanada de flechas' : m.phase === 'CHARGE' ? 'Carga de caballería' : 'Cuerpo a cuerpo'}: ${
                m.losses.length === 0
                  ? 'sin bajas'
                  : m.losses
                      .map(
                        (l) =>
                          `${l.count} ${name(l.unitType)} (${l.side === 'ATTACKER' ? 'atac.' : 'def.'})`,
                      )
                      .join(', ')
              }`}
            {m.kind === 'OUTCOME' &&
              `Vence el ${m.winner === 'ATTACKER' ? 'atacante' : 'defensor'}.`}
            {m.kind === 'LOOT' &&
              `Se llevan ${RESOURCE_KEYS.map((k) => fmt(m.loot[k])).join(' / ')}.`}
          </li>
        ))}
      </ol>
      <p className="muted small">
        La repetición 3D (Gate 2) dramatizará estos hitos sin recalcular el resultado.
      </p>
    </div>
  );
}
