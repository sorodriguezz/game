import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { AccountView, VillageView } from '@reinos/contracts';
import { RESOURCE_KEYS, type ResourceKey } from '@reinos/game-config';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';
import { duration, fmt, useServerNow } from '../format.js';
import { ArmyPanel, CampaignPanel, CityPanel, ReportsPanel } from './panels.js';

export const RESOURCE_LABEL: Record<ResourceKey, string> = {
  wood: 'Madera',
  stone: 'Piedra',
  iron: 'Hierro',
  food: 'Alimentos',
};

export function ResourceIcon({ k }: { k: ResourceKey }) {
  const paths: Record<ResourceKey, React.ReactNode> = {
    wood: <path d="M3 15l9-9 3 3-9 9H3v-3zm11-11l2-2 3 3-2 2-3-3z" />,
    stone: <path d="M4 16l2-8 6-4 6 4 2 8-8 3z" />,
    iron: <path d="M3 10l7-6 7 6-7 6zM10 13v6" />,
    food: <path d="M10 3c4 0 6 4 6 8s-3 7-6 7-6-3-6-7 2-8 6-8zm0-2v3" />,
  };
  return (
    <svg className={`ri ri-${k}`} viewBox="0 0 20 20" aria-hidden>
      {paths[k]}
    </svg>
  );
}

/** Interpola recursos en el cliente a partir de la última liquidación del servidor (solo visual). */
export function liveAmount(v: VillageView, k: ResourceKey, now: number): number {
  const r = v.resources;
  const elapsed = now - new Date(r.settledAt).getTime();
  const raw = r.amountsMilli[k] + (r.ratesMilliPerHour[k] * elapsed) / 3_600_000;
  const capped =
    r.ratesMilliPerHour[k] >= 0
      ? Math.min(Math.max(r.capacityMilli, r.amountsMilli[k]), raw)
      : Math.max(0, raw);
  return Math.floor(capped / 1000);
}

type Tab = 'city' | 'army' | 'campaign' | 'reports';

// El motor 3D se descarga solo al entrar en una ciudad (FR-ART-10, NFR-005).
const CityScene = lazy(() =>
  import('../scene/CityScene.js').then((m) => ({ default: m.CityScene })),
);

export function VillagePage({
  account,
  worldId,
  villageId,
  onBack,
  onLogout,
}: {
  account: AccountView;
  worldId: string;
  villageId: string;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [view, setView] = useState<VillageView | null>(null);
  const [tab, setTab] = useState<Tab>('city');
  const [selectedPlot, setSelectedPlot] = useState<number | null>(0);
  const toast = useToast();
  const loading = useRef(false);

  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      setView(await api.village(worldId, villageId));
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      loading.current = false;
    }
  }, [worldId, villageId, toast]);

  useEffect(() => {
    void refresh();
    // ADR-018 (docs/ADR-MVP1): sondeo periódico; los comandos refrescan al instante.
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const now = useServerNow(view?.serverTime);

  // Refresca poco después de cada vencimiento conocido (construcción, tropas, llegadas).
  useEffect(() => {
    if (!view) return;
    const dues = [
      view.construction?.completesAt,
      ...view.recruitment.map((r) => r.completesAt),
      ...view.movements.map((m) => m.arrivesAt),
    ]
      .filter((x): x is string => !!x)
      .map((x) => new Date(x).getTime() - now)
      .filter((ms) => ms > 0 && ms < 600_000);
    if (dues.length === 0) return;
    const t = setTimeout(() => void refresh(), Math.min(...dues) + 1500);
    return () => clearTimeout(t);
  }, [view, refresh]);

  if (!view) return <div className="splash">Cargando ciudad…</div>;

  const incoming = view.movements.filter((m) => m.direction === 'INCOMING');

  return (
    <div className="village-layout">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label="Volver a mundos">
          ← Mundos
        </button>
        <div className="brand">
          {view.name}{' '}
          <small>
            ({view.x}|{view.y})
          </small>
        </div>
        <div className="resources" aria-label="Recursos">
          {RESOURCE_KEYS.map((k) => {
            const amount = liveAmount(view, k, now);
            const cap = Math.floor(view.resources.capacityMilli / 1000);
            const rate = Math.round(view.resources.ratesMilliPerHour[k] / 1000);
            return (
              <div
                key={k}
                className={`res ${amount >= cap ? 'full' : ''}`}
                title={`${RESOURCE_LABEL[k]}: ${rate >= 0 ? '+' : ''}${rate}/h · capacidad ${fmt(cap)}`}
              >
                <ResourceIcon k={k} />
                <span className="amount">{fmt(amount)}</span>
                <span className={`rate ${rate < 0 ? 'neg' : ''}`}>
                  {rate >= 0 ? '+' : ''}
                  {fmt(rate)}/h
                </span>
              </div>
            );
          })}
          <div className="res" title="Población usada / capacidad">
            <span className="pop">👥</span>
            <span className="amount">
              {view.population.used}/{view.population.capacity}
            </span>
          </div>
        </div>
        <div className="spacer" />
        {view.resources.starving && <span className="badge badge-danger">Hambruna</span>}
        {incoming.length > 0 && (
          <span className="badge badge-danger" title="Ataques entrantes">
            ⚔ {incoming.length} entrante ·{' '}
            {duration((new Date(incoming[0]!.arrivesAt).getTime() - now) / 1000)}
          </span>
        )}
        <span className="who">{account.displayName}</span>
        <button className="ghost" onClick={onLogout}>
          Salir
        </button>
      </header>
      <main className="village-main">
        <section className="scene-wrap" aria-label="Vista 3D de la ciudad">
          <Suspense fallback={<div className="splash">Cargando escena 3D…</div>}>
            <CityScene
              rulesetVersion={view.rulesetVersion}
              civilization={view.civilization}
              coastal={view.coastal}
              buildings={view.buildings}
              construction={view.construction}
              selectedPlot={selectedPlot}
              onSelectPlot={(p) => {
                setSelectedPlot(p);
                setTab('city');
              }}
            />
          </Suspense>
          <div
            className="scene-badge"
            title="Modelos procedurales de validación; el arte final requiere GLB aprobados (ADR-0008)"
          >
            Arte 3D: blockout (no final)
          </div>
          {view.construction && (
            <div className="scene-queue">
              🏗 Construyendo nivel {view.construction.targetLevel} ·{' '}
              {duration((new Date(view.construction.completesAt).getTime() - now) / 1000)}
            </div>
          )}
        </section>
        <aside className="side">
          <nav className="tabs" role="tablist">
            {(
              [
                ['city', 'Ciudad'],
                ['army', 'Ejército'],
                ['campaign', 'Campaña'],
                ['reports', 'Informes'],
              ] as Array<[Tab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="side-body">
            {tab === 'city' && (
              <CityPanel
                view={view}
                now={now}
                selectedPlot={selectedPlot}
                onSelectPlot={setSelectedPlot}
                onChanged={refresh}
              />
            )}
            {tab === 'army' && <ArmyPanel view={view} now={now} onChanged={refresh} />}
            {tab === 'campaign' && <CampaignPanel view={view} now={now} onChanged={refresh} />}
            {tab === 'reports' && <ReportsPanel worldId={worldId} />}
          </div>
        </aside>
      </main>
    </div>
  );
}
