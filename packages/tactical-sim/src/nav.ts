import type { ArenaDef, Obstacle } from '@reinos/game-config';

/**
 * Rejilla de navegación 2.5D (ADR-0025/0033, PRD-MVP2 §8.4). Se precalcula
 * una vez por escenario, fuera del tick. Las formaciones navegan por su centro;
 * los soldados visuales solo interpolan en el cliente.
 */

/** Raíz entera exacta (floor) para enteros seguros. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

export function distCm(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return isqrt(dx * dx + dz * dz);
}

export const CELL_BLOCKED = 0;
export const CELL_OPEN = 10;
export const CELL_FOREST = 17;

export interface NavGrid {
  arenaId: string;
  cols: number;
  rows: number;
  cellCm: number;
  widthCm: number;
  depthCm: number;
  cost: Uint8Array;
}

function inside(o: Obstacle, x: number, z: number): boolean {
  if (o.shape === 'circle') {
    const dx = x - o.x;
    const dz = z - o.z;
    return dx * dx + dz * dz <= o.r * o.r;
  }
  return x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1;
}

const GRID_CACHE = new Map<string, NavGrid>();

export function buildNavGrid(arena: ArenaDef): NavGrid {
  const cached = GRID_CACHE.get(arena.id);
  if (cached) return cached;
  const cols = arena.widthCm / arena.cellCm;
  const rows = arena.depthCm / arena.cellCm;
  const cost = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * arena.cellCm + arena.cellCm / 2;
      const z = r * arena.cellCm + arena.cellCm / 2;
      let v = CELL_OPEN;
      for (const o of arena.obstacles) {
        if (!inside(o, x, z)) continue;
        if (o.kind === 'water' || o.kind === 'rock') v = CELL_BLOCKED;
        else if (v !== CELL_BLOCKED) v = CELL_FOREST;
      }
      cost[r * cols + c] = v;
    }
  }
  const grid: NavGrid = {
    arenaId: arena.id,
    cols,
    rows,
    cellCm: arena.cellCm,
    widthCm: arena.widthCm,
    depthCm: arena.depthCm,
    cost,
  };
  GRID_CACHE.set(arena.id, grid);
  return grid;
}

export function inBounds(g: NavGrid, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < g.widthCm && z < g.depthCm;
}

export function cellIndex(g: NavGrid, x: number, z: number): number {
  const c = Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cellCm)));
  const r = Math.min(g.rows - 1, Math.max(0, Math.floor(z / g.cellCm)));
  return r * g.cols + c;
}

export function cellCenter(g: NavGrid, idx: number): [number, number] {
  const c = idx % g.cols;
  const r = Math.floor(idx / g.cols);
  return [c * g.cellCm + g.cellCm / 2, r * g.cellCm + g.cellCm / 2];
}

export function costAt(g: NavGrid, x: number, z: number): number {
  if (!inBounds(g, x, z)) return CELL_BLOCKED;
  return g.cost[cellIndex(g, x, z)]!;
}

export function passable(g: NavGrid, x: number, z: number): boolean {
  return costAt(g, x, z) !== CELL_BLOCKED;
}

/** Montículo binario mínimo con desempate estable (f, h, índice). */
class Heap {
  private items: Array<[number, number, number]> = [];
  get size() {
    return this.items.length;
  }
  private less(a: [number, number, number], b: [number, number, number]) {
    return a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];
  }
  push(v: [number, number, number]) {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): [number, number, number] | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l]!, a[m]!)) m = l;
        if (r < a.length && this.less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

const DIRS: Array<[number, number, number]> = [
  [1, 0, 10],
  [-1, 0, 10],
  [0, 1, 10],
  [0, -1, 10],
  [1, 1, 14],
  [1, -1, 14],
  [-1, 1, 14],
  [-1, -1, 14],
];

/**
 * A* determinista sobre la rejilla (8 vecinos, sin cortar esquinas). Devuelve
 * puntos de paso en cm (solo en cambios de dirección) terminando en el destino
 * exacto, o `null` si no hay ruta.
 */
export function findPath(
  g: NavGrid,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  maxExpanded = 4000,
): Array<[number, number]> | null {
  if (!passable(g, toX, toZ)) return null;
  const start = cellIndex(g, fromX, fromZ);
  const goal = cellIndex(g, toX, toZ);
  if (start === goal) return [[toX, toZ]];
  const gc = goal % g.cols;
  const gr = Math.floor(goal / g.cols);
  const h = (idx: number) => {
    const dc = Math.abs((idx % g.cols) - gc);
    const dr = Math.abs(Math.floor(idx / g.cols) - gr);
    return 10 * Math.max(dc, dr) + 4 * Math.min(dc, dr);
  };
  const gScore = new Int32Array(g.cols * g.rows).fill(-1);
  const came = new Int32Array(g.cols * g.rows).fill(-1);
  const open = new Heap();
  gScore[start] = 0;
  open.push([h(start), h(start), start]);
  let expanded = 0;
  while (open.size > 0) {
    const [, , cur] = open.pop()!;
    if (cur === goal) break;
    if (++expanded > maxExpanded) return null;
    const cc = cur % g.cols;
    const cr = Math.floor(cur / g.cols);
    for (const [dc, dr, base] of DIRS) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const n = nr * g.cols + nc;
      const cellCost = g.cost[n]!;
      if (cellCost === CELL_BLOCKED) continue;
      if (dc !== 0 && dr !== 0) {
        if (g.cost[cr * g.cols + nc] === CELL_BLOCKED || g.cost[nr * g.cols + cc] === CELL_BLOCKED)
          continue;
      }
      const tentative = gScore[cur]! + Math.floor((base * cellCost) / CELL_OPEN);
      if (gScore[n] === -1 || tentative < gScore[n]!) {
        gScore[n] = tentative;
        came[n] = cur;
        const hn = h(n);
        open.push([tentative + hn, hn, n]);
      }
    }
  }
  if (gScore[goal] === -1) return null;
  const cells: number[] = [];
  for (let c = goal; c !== -1 && c !== start; c = came[c]!) cells.push(c);
  cells.reverse();
  // Simplificación: conservar celdas donde cambia la dirección.
  const pts: Array<[number, number]> = [];
  let prevDir = '';
  let prev = start;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    const dir = `${(c % g.cols) - (prev % g.cols)},${Math.floor(c / g.cols) - Math.floor(prev / g.cols)}`;
    if (i > 0 && dir !== prevDir) pts.push(cellCenter(g, prev));
    prevDir = dir;
    prev = c;
  }
  pts.push([toX, toZ]);
  return pts;
}
