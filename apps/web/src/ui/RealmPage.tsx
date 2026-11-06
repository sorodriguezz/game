import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { AccountView, TerritoryView, VillageView } from '@reinos/contracts';
import { civilizationDef, getRuleset, RESOURCE_KEYS, type BuildingType } from '@reinos/game-config';
import { validateConstruction } from '@reinos/game-rules';
import { WorldMap } from './WorldAtlasMap.js';
import { ReportsPanel } from './panels.js';
import { ResourceIcon, liveAmount } from './VillagePage.js';
import { api, describeError } from '../api.js';
import { fmt } from '../format.js';
import { useToast } from '../App.js';
import { PlotDialog } from './PlotDialog.js';
import { RealmForces } from './RealmForces.js';
const CityScene = lazy(() =>
  import('../scene/CityScene.js').then((m) => ({ default: m.CityScene })),
);
type Section = 'world' | 'city' | 'reports' | 'alliance';
const LABEL = { wood: 'Madera', stone: 'Barro', iron: 'Hierro', food: 'Cereal' };
export function RealmPage({
  account,
  view,
  now,
  onRefresh,
  onOpenVillage,
  onBack,
  onLogout,
}: {
  account: AccountView;
  view: VillageView;
  now: number;
  onRefresh: () => void;
  onOpenVillage: (id: string) => void;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [section, setSection] = useState<Section>('world'),
    [selectedPlot, setSelectedPlot] = useState<number | null>(null),
    [territory, setTerritory] = useState<TerritoryView | null>(null),
    [allianceName, setAllianceName] = useState(''),
    [invite, setInvite] = useState(''),
    [busy, setBusy] = useState(false);
  const [previewType, setPreviewType] = useState<BuildingType | null>(null);
  const [mapFocus, setMapFocus] = useState<{ x: number; y: number } | undefined>();
  const [villageSearch, setVillageSearch] = useState('');
  const [tradeTarget, setTradeTarget] = useState<{ x: number; y: number } | undefined>();
  const myVillages = territory?.villages ?? [
    { id: view.id, name: view.name, x: view.x, y: view.y, isCapital: !!view.isCapital },
  ];
  const activeIndex = myVillages.findIndex((v) => v.id === view.id);
  const r = getRuleset(view.rulesetVersion),
    civ = civilizationDef(r, view.civilization),
    toast = useToast();
  const refreshTerritory = useCallback(
    () =>
      api
        .territory(view.worldId)
        .then(setTerritory)
        .catch((e) => toast('error', describeError(e))),
    [view.worldId, toast],
  );
  useEffect(() => {
    void refreshTerritory();
    const t = setInterval(() => void refreshTerritory(), 10000);
    return () => clearInterval(t);
  }, [refreshTerritory]);
  const refresh = () => {
    onRefresh();
    void refreshTerritory();
  };
  const formAlliance = async (join: boolean) => {
    setBusy(true);
    try {
      await api.alliance(view.worldId, join ? { inviteCode: invite } : { name: allianceName });
      await refreshTerritory();
      toast(
        'info',
        join ? 'Te has unido a la alianza.' : 'Alianza creada. Comparte el código con tus aliados.',
      );
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="realm-shell">
      <RealmResources view={view} now={now} />
      <RealmForces view={view} now={now} onMap={() => setSection('world')} />
      <header className="realm-topbar">
        <button className="realm-logo" onClick={onBack}>
          <span>♜</span>
          <div>
            REINOS<small>DE LA FRONTERA</small>
          </div>
        </button>
        <div className="realm-season">
          <i /> {view.worldName ?? 'TIERRAS DE LA FRONTERA'} <span>×{view.speedMultiplier}</span>
        </div>
        <div className="realm-account">
          <span className="account-avatar">
            {(view.characterName ?? account.displayName).slice(0, 1)}
          </span>
          <div>
            {view.characterName ?? account.displayName}
            <small>{civ.name}</small>
          </div>
          <button className="ghost small" onClick={onLogout}>
            Salir ↗
          </button>
        </div>
      </header>
      <aside className="realm-sidebar">
        <div className="domain-label">
          TU DOMINIO <span>{territory?.villages.length ?? 1} aldeas</span>
        </div>
        {myVillages.length > 5 && (
          <input
            className="village-search"
            aria-label="Buscar aldea"
            placeholder="Buscar aldea o coordenadas"
            value={villageSearch}
            onChange={(e) => setVillageSearch(e.target.value)}
          />
        )}
        <div className="realm-village-list">
          {myVillages
            .filter((v) =>
              `${v.name} ${v.x}|${v.y}`.toLowerCase().includes(villageSearch.toLowerCase()),
            )
            .map((v) => (
              <div key={v.id} className={`realm-village ${v.id === view.id ? 'active' : ''}`}>
                <button
                  className="village-open"
                  onClick={() => {
                    if (v.id !== view.id) onOpenVillage(v.id);
                  }}
                  aria-current={v.id === view.id ? 'page' : undefined}
                >
                  <span className="village-emblem">♜</span>
                  <span>
                    <strong>{v.name}</strong>
                    <small>
                      {v.isCapital ? 'Capital' : 'Aldea'} · ({v.x}|{v.y})
                    </small>
                  </span>
                </button>
                <button
                  className="village-locate"
                  aria-label={`Localizar ${v.name} en el mapa`}
                  title="Ver en mapa"
                  onClick={() => {
                    setMapFocus({ x: v.x, y: v.y });
                    setSection('world');
                  }}
                >
                  ⌖
                </button>
              </div>
            ))}
        </div>
        <div className="realm-nav-label">ADMINISTRACIÓN</div>
        <nav aria-label="Administración de la aldea">
          {(
            [
              ['world', '⌖', 'Mapa del mundo'],
              ['city', '♜', 'Mi aldea 3D'],
              ['reports', '▤', 'Informes'],
              ['alliance', '♧', 'Alianza'],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              className={`realm-nav-item ${section === id ? 'active' : ''}`}
              onClick={() => setSection(id)}
            >
              <span>{icon}</span>
              {label}
              {section === id && <b>›</b>}
            </button>
          ))}
        </nav>
        <div className="realm-side-note">
          <span className="eyebrow">{civ.name.toUpperCase()}</span>
          <h3>
            {view.civilization === 'stone_wardens'
              ? 'La piedra permanece.'
              : view.civilization === 'steppe_clans'
                ? 'La estepa no espera.'
                : 'El bosque protege.'}
          </h3>
          <p>{civ.tagline}</p>
        </div>
        <div className="realm-side-bottom">
          <span className="live-dot" /> Mundo activo <small>Servidor autoritativo</small>
        </div>
      </aside>
      <div className="realm-workspace">
        <div className="village-switcher">
          <button
            disabled={myVillages.length < 2}
            aria-label="Aldea anterior"
            onClick={() =>
              onOpenVillage(
                myVillages[(activeIndex - 1 + myVillages.length) % myVillages.length]!.id,
              )
            }
          >
            ‹
          </button>
          <label>
            Aldea
            <select
              aria-label="Seleccionar aldea"
              value={view.id}
              onChange={(e) => onOpenVillage(e.target.value)}
            >
              {myVillages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.x}|{v.y}){v.isCapital ? ' · Capital' : ''}
                </option>
              ))}
            </select>
          </label>
          <span>
            {activeIndex + 1} / {myVillages.length}
          </span>
          <button
            disabled={myVillages.length < 2}
            aria-label="Aldea siguiente"
            onClick={() => onOpenVillage(myVillages[(activeIndex + 1) % myVillages.length]!.id)}
          >
            ›
          </button>
          {view.worldStatus && !['OPEN', 'WONDER_ERA'].includes(view.worldStatus) && (
            <strong>
              {view.worldStatus === 'PAUSED' ? 'Mundo pausado' : 'Temporada finalizada'}
            </strong>
          )}
        </div>
        {section === 'world' && (
          <WorldMap
            focus={mapFocus}
            key={view.id}
            view={view}
            now={now}
            onRefresh={refresh}
            onOpenVillage={onOpenVillage}
            onTradeTo={
              r.trade
                ? (point) => {
                    const market = view.buildings.find((b) => b.type === 'market');
                    if (market) {
                      setTradeTarget(point);
                      setSelectedPlot(market.plot);
                      setSection('city');
                    }
                  }
                : undefined
            }
          />
        )}
        {section === 'city' && (
          <div className="realm-city-layout">
            <div className="realm-city">
              <div className="realm-city-canvas">
                <Suspense fallback={<div className="splash">Levantando las murallas…</div>}>
                  <CityScene
                    rulesetVersion={view.rulesetVersion}
                    civilization={view.civilization}
                    coastal={false}
                    buildings={view.buildings}
                    construction={view.construction}
                    constructions={view.constructions}
                    layout={view.layout}
                    walls={view.walls}
                    previewType={
                      previewType &&
                      selectedPlot !== null &&
                      validateConstruction(r, {
                        civilization: view.civilization,
                        coastal: false,
                        buildings: view.buildings,
                        plot: selectedPlot,
                        type: previewType,
                        layout: view.layout,
                        speed: view.speedMultiplier,
                      }).ok
                        ? previewType
                        : null
                    }
                    highlightedPlots={
                      previewType
                        ? (view.layout?.plots ?? [])
                            .filter(
                              (p) =>
                                validateConstruction(r, {
                                  civilization: view.civilization,
                                  coastal: false,
                                  buildings: view.buildings,
                                  plot: p.id,
                                  type: previewType,
                                  layout: view.layout,
                                  speed: view.speedMultiplier,
                                }).ok,
                            )
                            .map((p) => p.id)
                        : []
                    }
                    selectedPlot={selectedPlot}
                    onSelectPlot={(p) => {
                      setSelectedPlot(p);
                      if (
                        previewType &&
                        !validateConstruction(r, {
                          civilization: view.civilization,
                          coastal: false,
                          buildings: view.buildings,
                          plot: p,
                          type: previewType,
                          layout: view.layout,
                          speed: view.speedMultiplier,
                        }).ok
                      )
                        setPreviewType(null);
                    }}
                  />
                </Suspense>
                <div className="city-controls-hint">
                  Arrastra para girar · rueda para acercar · selecciona un edificio
                </div>
              </div>
              <div className="city-ring-legend">
                <span>
                  <b>III</b> Campos de madera, barro, hierro y cereal
                </span>
                <span>
                  <b>II</b> Producción y ejército
                </span>
                <span>
                  <b>I</b> Castillo y gobierno
                </span>
              </div>
            </div>
          </div>
        )}
        {section === 'city' && selectedPlot !== null && (
          <PlotDialog
            key={view.id}
            view={view}
            now={now}
            plot={selectedPlot}
            onSelect={setSelectedPlot}
            onClose={() => {
              setSelectedPlot(null);
              setPreviewType(null);
            }}
            onChanged={refresh}
            previewType={previewType}
            onPreview={setPreviewType}
            tradeTarget={tradeTarget}
          />
        )}
        {section === 'reports' && (
          <div className="realm-content-page">
            <div className="realm-section-heading">
              <div>
                <span className="eyebrow">MEMORIA DEL REINO</span>
                <h1>Informes de batalla</h1>
                <p>Resultados persistentes de combates en aldeas y en campo.</p>
              </div>
            </div>
            <ReportsPanel worldId={view.worldId} />
          </div>
        )}
        {section === 'alliance' && (
          <div className="realm-content-page">
            <div className="realm-section-heading">
              <div>
                <span className="eyebrow">NADIE GOBIERNA SOLO</span>
                <h1>{territory?.alliance?.name ?? 'Forja una alianza'}</h1>
                <p>Los aliados pueden defender tus aldeas con sus propios refuerzos.</p>
              </div>
            </div>
            <div className="alliance-grid">
              {territory?.alliance ? (
                <>
                  <article className="territory-card">
                    <h2>Miembros</h2>
                    {territory.alliance.members.map((m) => (
                      <p key={m.accountId} className="alliance-member">
                        ♙ {m.displayName}
                        {m.accountId === account.id && <small>Tú</small>}
                      </p>
                    ))}
                  </article>
                  {territory.alliance.inviteCode && (
                    <article className="territory-card">
                      <h2>Invita a tus aliados</h2>
                      <p className="muted">
                        Comparte este código con las personas que quieras en tu alianza.
                      </p>
                      <code className="invite-code">{territory.alliance.inviteCode}</code>
                      <button
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(territory.alliance!.inviteCode!)
                            .then(() => toast('info', 'Código copiado.'))
                            .catch(() => toast('error', 'No se pudo copiar. Selecciona el código.'))
                        }
                      >
                        Copiar código
                      </button>
                    </article>
                  )}
                </>
              ) : (
                <>
                  <form
                    className="territory-card"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void formAlliance(false);
                    }}
                  >
                    <h2>Crear alianza</h2>
                    <label className="field-label">
                      Nombre
                      <input
                        required
                        minLength={3}
                        maxLength={32}
                        value={allianceName}
                        onChange={(e) => setAllianceName(e.target.value)}
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Fundar alianza
                    </button>
                  </form>
                  <form
                    className="territory-card"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void formAlliance(true);
                    }}
                  >
                    <h2>Unirme a mis aliados</h2>
                    <label className="field-label">
                      Código de invitación
                      <input required value={invite} onChange={(e) => setInvite(e.target.value)} />
                    </label>
                    <button disabled={busy}>Unirme</button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RealmResources({ view, now }: { view: VillageView; now: number }) {
  return (
    <div className="realm-resourcebar">
      {RESOURCE_KEYS.map((k) => (
        <div
          key={k}
          className={`realm-resource ${k}`}
          title={`Capacidad: ${fmt(Math.floor((k === 'food' ? (view.resources.foodCapacityMilli ?? view.resources.capacityMilli) : view.resources.capacityMilli) / 1000))}`}
        >
          <span className="resource-medallion">
            <ResourceIcon k={k} />
          </span>
          <div>
            <small>{LABEL[k]}</small>
            <strong>{fmt(liveAmount(view, k, now))}</strong>
          </div>
          <em>
            {view.resources.ratesMilliPerHour[k] >= 0 ? '+' : ''}
            {fmt(Math.floor(view.resources.ratesMilliPerHour[k] / 1000))}
            <small>/h</small>
          </em>
        </div>
      ))}
      <div
        className="realm-population"
        title={
          view.population.inhabitants === undefined
            ? undefined
            : `Cereal bruto: ${view.population.grossCropPerHour}/h · Habitantes: −${view.population.buildingConsumption}/h · Tropas: −${view.population.troopConsumption}/h · Cereal libre: ${view.population.freeCropPerHour}/h`
        }
      >
        <span>♙</span>
        <div>
          <small>
            {view.population.inhabitants === undefined
              ? 'Población militar'
              : 'Habitantes · Tropas'}
          </small>
          <strong>
            {view.population.inhabitants ?? view.population.used}
            <em>
              {view.population.inhabitants === undefined
                ? ` / ${view.population.capacity}`
                : ` · ${view.population.used}`}
            </em>
          </strong>
        </div>
      </div>
    </div>
  );
}
