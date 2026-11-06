import { useEffect, useRef, useState } from 'react';
import type { VillageView } from '@reinos/contracts';
import { getRuleset, buildingDef, type BuildingType, type UnitType } from '@reinos/game-config';
import { validateRecruitment, unitCost } from '@reinos/game-rules';
import { CityPanel, ArmyPanel } from './panels.js';
import { WallsPanel } from './WallsPanel.js';
import { DevelopmentPanel } from './DevelopmentPanel.js';
import { CulturePanel } from './CulturePanel.js';
import { TradePanel } from './TradePanel.js';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';

export function PlotDialog({
  view,
  now,
  plot,
  onSelect,
  onClose,
  onChanged,
  previewType,
  onPreview,
  tradeTarget,
}: {
  view: VillageView;
  now: number;
  plot: number;
  onSelect: (n: number) => void;
  onClose: () => void;
  onChanged: () => void;
  previewType: BuildingType | null;
  onPreview: (t: BuildingType | null) => void;
  tradeTarget?: { x: number; y: number };
}) {
  const ref = useRef<HTMLDialogElement>(null),
    r = getRuleset(view.rulesetVersion),
    p = (view.layout?.plots ?? r.cityLayout.plots).find((p) => p.id === plot),
    b = view.buildings.find((b) => b.plot === plot);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => {
      d?.close();
    };
  }, []);
  return (
    <dialog
      className="plot-dialog"
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="plot-title"
    >
      <header>
        <div>
          <small>
            {p?.precinct === 3
              ? 'Campos protegidos'
              : p?.precinct === 2
                ? 'Distrito urbano'
                : 'Ciudadela'}{' '}
            · Solar {plot}
          </small>
          <h2 id="plot-title">
            {b
              ? `${buildingDef(r, b.type).name} · nivel ${b.level}`
              : p?.kind === 'field'
                ? `${p.label} · nivel 0`
                : 'Solar sin construir'}
          </h2>
        </div>
        <button autoFocus aria-label="Cerrar edificio" onClick={onClose}>
          ✕
        </button>
      </header>
      {p?.kind === 'fortification' && (
        <WallsPanel
          view={{ ...view, walls: view.walls?.filter((w) => w.plot === plot) }}
          now={now}
          onChanged={onChanged}
          onSelectPlot={onSelect}
        />
      )}
      {b && (
        <BuildingFunctions
          view={view}
          now={now}
          type={b.type}
          onChanged={onChanged}
          tradeTarget={tradeTarget}
        />
      )}
      <CityPanel
        compact
        view={view}
        now={now}
        selectedPlot={plot}
        onSelectPlot={onSelect}
        onChanged={onChanged}
        previewType={previewType}
        onPreview={onPreview}
      />
    </dialog>
  );
}
function BuildingFunctions({
  view,
  now,
  type,
  onChanged,
  tradeTarget,
}: {
  view: VillageView;
  now: number;
  type: BuildingType;
  onChanged: () => void;
  tradeTarget?: { x: number; y: number };
}) {
  const r = getRuleset(view.rulesetVersion),
    toast = useToast(),
    [qty, setQty] = useState(1),
    [busy, setBusy] = useState(false);
  const units = r.units.filter(
    (u) =>
      u.trainedAt === type &&
      !u.npcOnly &&
      (!u.civilization || u.civilization === view.civilization),
  );
  const recruit = async (unitType: UnitType) => {
    setBusy(true);
    try {
      await api.recruit(view.worldId, view.id, { unitType, quantity: qty });
      onChanged();
      toast('info', 'Reclutamiento iniciado');
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="building-functions">
      {(type === 'market' || type === 'trade_office') && (
        <TradePanel view={view} now={now} target={tradeTarget} onChanged={onChanged} />
      )}
      {['city_hall', 'castle', 'town_hall', 'temple'].includes(type) && (
        <CulturePanel
          view={view}
          now={now}
          celebrate={type === 'town_hall'}
          onChanged={onChanged}
        />
      )}
      {(type === 'academy' || type === 'smithy') && (
        <DevelopmentPanel view={view} now={now} building={type} onChanged={onChanged} />
      )}
      {type === 'rally_point' && <ArmyPanel view={view} now={now} onChanged={onChanged} />}
      {view.population.inhabitants !== undefined && (
        <p>
          Habitantes de la aldea: <strong>{view.population.inhabitants}</strong> · Cereal libre:{' '}
          <strong>{view.population.freeCropPerHour}/h</strong> · Consumo militar:{' '}
          <strong>{view.population.troopConsumption}/h</strong>
        </p>
      )}
      {(type === 'warehouse' || type === 'granary') && (
        <p>
          Capacidad actual:{' '}
          {Math.floor(
            (type === 'granary'
              ? (view.resources.foodCapacityMilli ?? view.resources.capacityMilli)
              : view.resources.capacityMilli) / 1000,
          )}{' '}
          de {type === 'granary' ? 'cereal' : 'madera, barro y hierro'}. Cada almacén o granero
          construido suma su capacidad.
        </p>
      )}
      {units.length > 0 && (
        <>
          <h3>Entrenamiento</h3>
          <label>
            Cantidad
            <input
              type="number"
              min={1}
              max={10000}
              value={qty}
              onChange={(e) => setQty(+e.target.value)}
            />
          </label>
          {units.map((u) => {
            const check = validateRecruitment(r, {
                civilization: view.civilization,
                buildings: view.buildings,
                unitType: u.type,
                research: view.research,
              }),
              cost = unitCost(r, u.type, Math.max(1, qty));
            return (
              <div className="option" key={u.type}>
                <strong>{u.name}</strong>
                <p>
                  Madera {cost.wood} · Barro {cost.stone} · Hierro {cost.iron} · Cereal {cost.food}
                </p>
                <p>Consumo: {u.foodUpkeepPerHour} cereal/h por unidad</p>
                <button
                  disabled={busy || !check.ok || !Number.isInteger(qty) || qty < 1}
                  onClick={() => void recruit(u.type)}
                >
                  {check.ok ? 'Reclutar' : 'Requisitos pendientes'}
                </button>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
