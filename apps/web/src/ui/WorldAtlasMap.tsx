import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { MapAtlasView, VillageView } from '@reinos/contracts';
import { api, describeError } from '../api.js';
import { AtlasCanvas } from './AtlasCanvas.js';
import { TileActions, type MapSelection } from './WorldMap.js';
const terrainCache = new Map<string, Promise<Uint8Array>>();
function terrainFor(worldId: string) {
  let task = terrainCache.get(worldId);
  // Conservar los mundos recientes sin retener indefinidamente atlas de 25 MB.
  if (task) {
    terrainCache.delete(worldId);
    terrainCache.set(worldId, task);
  }
  if (!task) {
    task = api.atlasTerrain(worldId).catch((e) => {
      terrainCache.delete(worldId);
      throw e;
    });
    terrainCache.set(worldId, task);
    while (terrainCache.size > 3) terrainCache.delete(terrainCache.keys().next().value!);
  }
  return task;
}
export function WorldMap({
  view,
  now,
  onRefresh,
  onOpenVillage,
  focus,
  onTradeTo,
}: {
  view: VillageView;
  now: number;
  onRefresh: () => void;
  onOpenVillage: (id: string) => void;
  focus?: { x: number; y: number };
  onTradeTo?: (point: { x: number; y: number }) => void;
}) {
  const [atlas, setAtlas] = useState<MapAtlasView | null>(null),
    [terrain, setTerrain] = useState<Uint8Array | null>(null),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<MapSelection | null>(null),
    [selecting, setSelecting] = useState(false),
    sequence = useRef(0);
  const load = useCallback(async () => {
    const snapshot = await api.atlas(view.worldId);
    setAtlas(snapshot);
  }, [view.worldId]);
  useEffect(() => {
    let active = true;
    setError('');
    void Promise.all([api.atlas(view.worldId), terrainFor(view.worldId)])
      .then(([snapshot, data]) => {
        if (!active) return;
        if (data.length !== snapshot.mapSize * snapshot.mapSize) throw new Error('Mapa incompleto');
        setAtlas(snapshot);
        setTerrain(data);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'No se pudo cargar el mapa');
      });
    const timer = setInterval(() => {
      void api
        .atlas(view.worldId)
        .then((meta) => {
          if (active) setAtlas(meta);
        })
        .catch(() => {});
    }, 10000);
    return () => {
      active = false;
      sequence.current++;
      clearInterval(timer);
    };
  }, [view.worldId]);
  const choose = async (selection: MapSelection) => {
    const seq = ++sequence.current;
    setSelected(selection);
    setSelecting(true);
    try {
      const region = await api.map(view.worldId, selection.x, selection.y, 1);
      if (sequence.current !== seq) return;
      setSelected({
        ...selection,
        village: region.villages.find((v) => v.x === selection.x && v.y === selection.y) ?? null,
      });
      setAtlas((old) =>
        old
          ? {
              ...old,
              villages: [
                ...old.villages.filter((v) => !region.villages.some((n) => n.id === v.id)),
                ...region.villages,
              ],
            }
          : old,
      );
    } catch (e) {
      if (sequence.current === seq) {
        setError(describeError(e));
        setSelected(null);
      }
    } finally {
      if (sequence.current === seq) setSelecting(false);
    }
  };
  const current = useMemo(() => {
    const orders = view.constructions ?? (view.construction ? [view.construction] : []);
    return atlas
      ? {
          ...atlas,
          villages: atlas.villages.map((v) =>
            v.id === view.id
              ? {
                  ...v,
                  construction: orders[0]
                    ? {
                        count: orders.length,
                        startedAt: orders[0].startedAt,
                        completesAt: orders[0].completesAt,
                      }
                    : undefined,
                }
              : v,
          ),
        }
      : null;
  }, [atlas, view.id, view.constructions, view.construction]);
  return (
    <div className="world-experience atlas-experience">
      <section className="world-map-panel" aria-label="Mapa del mundo">
        <div className="atlas-toolbar">
          <h1>{view.worldName ?? 'Tierras de la Frontera'}</h1>
          <div className="map-legend">
            <span>
              <i className="own" />
              Tus aldeas y oasis
            </span>
            <span>
              <i className="ally" />
              Alianza
            </span>
            <span>R · Romanos</span>
            <span>GA · Galos</span>
            <span>GE · Germanos</span>
            <span>B · Bandidos</span>
            <span>O · Oasis</span>
          </div>
        </div>
        <div className="atlas-viewport">
          {current && terrain ? (
            <AtlasCanvas
              atlas={current}
              terrain={terrain}
              focus={focus}
              initial={{ x: view.x, y: view.y }}
              onSelect={(s) => void choose(s)}
            />
          ) : (
            <div className="atlas-loading" role="status">
              <strong>Cargando el mapa completo…</strong>
              <p>Después podrás recorrerlo sin volver a cargar el terreno.</p>
            </div>
          )}
          {error && (
            <div className="map-load-error" role="alert">
              {error}
              <button
                onClick={() => {
                  setError('');
                  void Promise.all([load(), terrainFor(view.worldId).then(setTerrain)]).catch((e) =>
                    setError(String(e)),
                  );
                }}
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </section>
      {selected && (
        <aside className="territory-detail is-open atlas-selection">
          <button
            className="map-detail-close"
            aria-label="Cerrar casilla"
            onClick={() => {
              sequence.current++;
              setSelected(null);
            }}
          >
            ✕
          </button>
          {selecting && <p role="status">Consultando la casilla…</p>}
          <fieldset disabled={selecting} className="tile-actions-fieldset">
            <TileActions
              key={`${selected.x}:${selected.y}`}
              selection={selected}
              view={view}
              now={now}
              onChanged={() => {
                onRefresh();
                void load();
                void choose(selected);
              }}
              onOpenVillage={onOpenVillage}
              onTradeTo={onTradeTo}
            />
          </fieldset>
        </aside>
      )}
    </div>
  );
}
