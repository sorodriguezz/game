import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { AccountView, TerritoryView, VillageView } from '@reinos/contracts';
import { civilizationDef, getRuleset, RESOURCE_KEYS } from '@reinos/game-config';
import { WorldMap } from './WorldMap.js';
import { ArmyPanel, CityPanel, ReportsPanel } from './panels.js';
import { ResourceIcon, liveAmount, GraphicsSelect } from './VillagePage.js';
import { api, describeError } from '../api.js';
import { duration, fmt } from '../format.js';
import { useToast } from '../App.js';
const CityScene = lazy(() =>
  import('../scene/CityScene.js').then((m) => ({ default: m.CityScene })),
);
type Section = 'world' | 'city' | 'army' | 'reports' | 'alliance';
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
    [selectedPlot, setSelectedPlot] = useState<number | null>(0),
    [territory, setTerritory] = useState<TerritoryView | null>(null),
    [allianceName, setAllianceName] = useState(''),
    [invite, setInvite] = useState(''),
    [busy, setBusy] = useState(false);
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
      <header className="realm-topbar">
        <button className="realm-logo" onClick={onBack}>
          <span>♜</span>
          <div>
            REINOS<small>DE LA FRONTERA</small>
          </div>
        </button>
        <div className="realm-season">
          <i /> REINOS TERRESTRES <span>×{view.speedMultiplier}</span>
        </div>
        <div className="realm-account">
          <span className="account-avatar">{account.displayName.slice(0, 1)}</span>
          <div>
            {account.displayName}
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
        <div className="realm-village-list">
          {(
            territory?.villages ?? [
              { id: view.id, name: view.name, x: view.x, y: view.y, isCapital: !!view.isCapital },
            ]
          ).map((v) => (
            <button
              key={v.id}
              className={`realm-village ${v.id === view.id ? 'active' : ''}`}
              onClick={() => {
                if (v.id !== view.id) onOpenVillage(v.id);
              }}
            >
              <span className="village-emblem">♜</span>
              <span>
                <strong>{v.name}</strong>
                <small>
                  {v.isCapital ? 'Capital' : 'Aldea'} · ({v.x}|{v.y})
                </small>
              </span>
              {v.id === view.id && <i />}
            </button>
          ))}
        </div>
        <div className="realm-nav-label">ADMINISTRACIÓN</div>
        <nav aria-label="Administración de la aldea">
          {(
            [
              ['world', '⌖', 'Mapa del mundo'],
              ['city', '♜', 'Mi aldea 3D'],
              ['army', '⚔', 'Ejército'],
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
        <div className="realm-resourcebar">
          {RESOURCE_KEYS.map((k) => (
            <div
              key={k}
              className={`realm-resource ${k}`}
              title={`Capacidad: ${fmt(Math.floor(view.resources.capacityMilli / 1000))}`}
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
          <div className="realm-population">
            <span>♙</span>
            <div>
              <small>Población militar</small>
              <strong>
                {view.population.used}
                <em> / {view.population.capacity}</em>
              </strong>
            </div>
          </div>
        </div>
        {section === 'world' && (
          <WorldMap
            key={view.id}
            view={view}
            now={now}
            onRefresh={refresh}
            onOpenVillage={onOpenVillage}
          />
        )}
        {section === 'city' && (
          <div className="realm-city-layout">
            <div className="realm-city">
              <div className="realm-section-heading">
                <div>
                  <span className="eyebrow">TRES RECINTOS, UN REINO</span>
                  <h1>{view.name}</h1>
                  <p>Campos exteriores · distrito productivo · ciudadela</p>
                </div>
                <span className="land-chip">
                  ({view.x}|{view.y})
                </span>
                <GraphicsSelect />
              </div>
              <div className="district-tabs">
                {[
                  ['Campos', 22],
                  ['Distrito', 3],
                  ['Ciudadela', 0],
                  ['Murallas', 19],
                ].map(([label, plot]) => (
                  <button key={label} onClick={() => setSelectedPlot(Number(plot))}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="realm-city-canvas">
                <Suspense fallback={<div className="splash">Levantando las murallas…</div>}>
                  <CityScene
                    rulesetVersion={view.rulesetVersion}
                    civilization={view.civilization}
                    coastal={false}
                    buildings={view.buildings}
                    construction={view.construction}
                    selectedPlot={selectedPlot}
                    onSelectPlot={setSelectedPlot}
                  />
                </Suspense>
                <div className="city-controls-hint">
                  Arrastra para girar · rueda para acercar · selecciona un edificio
                </div>
              </div>
              <div className="city-ring-legend">
                <span>
                  <b>01</b> Campos de madera, barro, hierro y cereal
                </span>
                <span>
                  <b>02</b> Producción y ejército
                </span>
                <span>
                  <b>03</b> Castillo y gobierno
                </span>
              </div>
            </div>
            <aside className="territory-detail city-building-panel">
              <CityPanel
                view={view}
                now={now}
                selectedPlot={selectedPlot}
                onSelectPlot={setSelectedPlot}
                onChanged={refresh}
              />
            </aside>
          </div>
        )}
        {section === 'army' && (
          <div className="realm-content-page">
            <div className="realm-section-heading">
              <div>
                <span className="eyebrow">LA FUERZA DE TU REINO</span>
                <h1>Ejército y guarniciones</h1>
                <p>Recluta, distribuye y reúne tropas entre tus aldeas.</p>
              </div>
              <button onClick={() => setSection('world')}>Preparar expedición ↗</button>
            </div>
            <div className="army-page-grid">
              <ArmyPanel view={view} now={now} onChanged={refresh} />
              <aside className="territory-card">
                <span className="eyebrow">BAJO TU MANDO</span>
                <h2>Refuerzos desplegados</h2>
                {!territory?.reinforcements.length && (
                  <p className="muted">No tienes tropas defendiendo aldeas aliadas.</p>
                )}
                {Array.from(
                  new Set(
                    territory?.reinforcements.map((g) => `${g.villageId}:${g.originVillageId}`),
                  ),
                ).map((key) => {
                  const troops = territory!.reinforcements.filter(
                      (g) => `${g.villageId}:${g.originVillageId}` === key,
                    ),
                    first = troops[0]!;
                  return (
                    <div className="reinforcement-card" key={key}>
                      <h4>{first.villageName}</h4>
                      {troops.map((t) => (
                        <p key={t.unitType}>
                          {r.units.find((u) => u.type === t.unitType)?.name}{' '}
                          <strong>{t.quantity}</strong>
                        </p>
                      ))}
                      <button
                        onClick={async () => {
                          try {
                            await api.recall(view.worldId, first.villageId, first.originVillageId);
                            refresh();
                            toast('info', 'Tus refuerzos están regresando.');
                          } catch (e) {
                            toast('error', describeError(e));
                          }
                        }}
                      >
                        Retirar refuerzos
                      </button>
                    </div>
                  );
                })}
                <h3>Aliados en esta aldea</h3>
                {!view.garrisons?.length && <p className="muted small">Sin refuerzos aliados.</p>}
                {view.garrisons
                  ?.filter((g) => g.quantity > 0)
                  .map((g) => (
                    <p key={`${g.originVillageId}:${g.unitType}`}>
                      {r.units.find((u) => u.type === g.unitType)?.name} · {g.quantity}
                    </p>
                  ))}
              </aside>
            </div>
          </div>
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
      {view.construction && (
        <div className="realm-global-queue">
          <span>⚒</span>
          <strong>
            {r.buildings.find((b) => b.type === view.construction!.type)?.name} · nivel{' '}
            {view.construction.targetLevel}
          </strong>
          <time>{duration((new Date(view.construction.completesAt).getTime() - now) / 1000)}</time>
        </div>
      )}
    </div>
  );
}
