import { toCartesian, toMapIndex, coordinateBounds } from '@reinos/game-rules';
import type { DbOrTx } from '@reinos/db';
import {
  mapQuerySchema,
  foundVillageRequestSchema,
  type MapQuery,
  type FoundVillageRequest,
  type VillageView,
  type MapRegionView,
  type TerritoryView,
  type JoinWorldResponse,
  type BattleReportDetail,
  type BattleReportSummary,
} from '@reinos/contracts';
import { loadWorld } from './village-state.js';
import { err } from './context.js';
export async function publicPoint(db: DbOrTx, w: string, p: { x: number; y: number }) {
  return toCartesian((await loadWorld(db, w)).mapSize, p);
}
async function indexPoint(db: DbOrTx, w: string, p: { x: number; y: number }) {
  const size = (await loadWorld(db, w)).mapSize,
    b = coordinateBounds(size);
  if (p.x < b.min || p.y < b.min || p.x > b.max || p.y > b.max)
    throw err.unprocessable('TARGET_INVALID', 'Coordenadas fuera del mundo');
  return toMapIndex(size, p);
}
export async function indexedMapQuery(db: DbOrTx, w: string, input: unknown): Promise<MapQuery> {
  const q = mapQuerySchema.parse(input);
  return { ...q, ...(await indexPoint(db, w, q)) };
}
export async function indexedFoundRequest(
  db: DbOrTx,
  w: string,
  input: unknown,
): Promise<FoundVillageRequest> {
  const q = foundVillageRequestSchema.parse(input);
  return { ...q, ...(await indexPoint(db, w, q)) };
}
export async function publicVillage(
  db: DbOrTx,
  w: string,
  promise: Promise<VillageView>,
): Promise<VillageView> {
  const v = await promise,
    size = (await loadWorld(db, w)).mapSize;
  return { ...v, ...toCartesian(size, v), mapSize: size };
}
export async function publicJoin(db: DbOrTx, w: string, promise: Promise<JoinWorldResponse>) {
  const v = await promise;
  return { ...v, ...(await publicPoint(db, w, v)) };
}
export async function publicRegion(
  db: DbOrTx,
  w: string,
  promise: Promise<MapRegionView>,
): Promise<MapRegionView> {
  const r = await promise,
    size = (await loadWorld(db, w)).mapSize,
    origin = toCartesian(size, { x: r.originX, y: r.originY });
  return {
    ...r,
    originX: origin.x,
    originY: origin.y,
    coordinateSystem: 'CARTESIAN',
    villages: r.villages.map((v) => ({ ...v, ...toCartesian(size, v) })),
    movements: r.movements?.map((m) => ({
      ...m,
      from: toCartesian(size, m.from),
      to: toCartesian(size, m.to),
    })),
  };
}
export async function publicTerritory(db: DbOrTx, w: string, promise: Promise<TerritoryView>) {
  const r = await promise,
    size = (await loadWorld(db, w)).mapSize;
  return {
    ...r,
    villages: r.villages.map((v) => ({ ...v, ...toCartesian(size, v) })),
    settlements: r.settlements.map((v) => ({ ...v, ...toCartesian(size, v) })),
  };
}
export async function publicReport<T extends BattleReportSummary>(
  db: DbOrTx,
  w: string,
  promise: Promise<T>,
): Promise<T> {
  const r = await promise;
  return {
    ...r,
    ...(r.fieldPosition ? { fieldPosition: await publicPoint(db, w, r.fieldPosition) } : {}),
  };
}
export async function publicReports(
  db: DbOrTx,
  w: string,
  promise: Promise<BattleReportSummary[]>,
) {
  return Promise.all((await promise).map((r) => publicReport(db, w, Promise.resolve(r))));
}
export type PublicReport = BattleReportDetail;
