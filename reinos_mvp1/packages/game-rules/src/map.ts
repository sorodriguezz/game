import { createPrng, hash2d } from './prng.js';

/**
 * Generación determinista del mapa lógico por semilla (FR-MAP, PRD §5.1).
 * Ruido de valor entero (sin floats) ⇒ idéntico en servidor y cliente.
 * El mapa no se persiste celda a celda: se recalcula desde (seed, size).
 * Gate 2 añadirá ríos, islas etiquetadas, grafo naval y sedes de Maravilla.
 */

export type TerrainKind = 'SEA' | 'PLAIN' | 'FOREST' | 'MOUNTAIN' | 'OASIS';

export const TERRAIN_CODE: Record<TerrainKind, string> = {
  SEA: 'S',
  PLAIN: 'P',
  FOREST: 'F',
  MOUNTAIN: 'M',
  OASIS: 'O',
};

const ONE = 65536;

function smooth(t: number): number {
  // smoothstep entero: t ∈ [0, ONE) → [0, ONE)
  return Math.floor((t * t * (3 * ONE - 2 * t)) / (ONE * ONE));
}

function lerp(a: number, b: number, t: number): number {
  return a + Math.floor(((b - a) * t) / ONE);
}

function valueNoise(seed: number, x: number, y: number, cell: number, salt: number): number {
  const xi = Math.floor(x / cell);
  const yi = Math.floor(y / cell);
  const tx = smooth(Math.floor(((x - xi * cell) * ONE) / cell));
  const ty = smooth(Math.floor(((y - yi * cell) * ONE) / cell));
  const v = (i: number, j: number) => hash2d(seed, i, j, salt) & 0xffff;
  const top = lerp(v(xi, yi), v(xi + 1, yi), tx);
  const bottom = lerp(v(xi, yi + 1), v(xi + 1, yi + 1), tx);
  return lerp(top, bottom, ty);
}

function fractal(seed: number, x: number, y: number, salt: number): number {
  return Math.floor(
    (4 * valueNoise(seed, x, y, 32, salt) + 2 * valueNoise(seed, x, y, 16, salt + 1) + valueNoise(seed, x, y, 8, salt + 2)) /
      7,
  );
}

export function elevationAt(seed: number, size: number, x: number, y: number): number {
  const half = size / 2;
  const dx = x + 0.5 - half;
  const dy = y + 0.5 - half;
  const falloff = Math.floor(((dx * dx + dy * dy) * ONE) / (half * half));
  return fractal(seed, x, y, 11) - Math.floor((falloff * 30000) / ONE);
}

export const SEA_LEVEL = 17000;
const MOUNTAIN_LEVEL = 42000;
const FOREST_MOISTURE = 37000;

export function terrainAt(seed: number, size: number, x: number, y: number): TerrainKind {
  if (x < 0 || y < 0 || x >= size || y >= size) return 'SEA';
  const e = elevationAt(seed, size, x, y);
  if (e < SEA_LEVEL) return 'SEA';
  if (e > MOUNTAIN_LEVEL) return 'MOUNTAIN';
  const moisture = fractal(seed, x, y, 71);
  if (moisture > FOREST_MOISTURE) return 'FOREST';
  if (hash2d(seed, x, y, 99) % 61 === 0) return 'OASIS';
  return 'PLAIN';
}

export function isLand(t: TerrainKind): boolean {
  return t !== 'SEA';
}

/** Casilla de tierra con alguna vecina (8-conexión) de mar. */
export function isCoastal(seed: number, size: number, x: number, y: number): boolean {
  if (!isLand(terrainAt(seed, size, x, y))) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx !== 0 || dy !== 0) && terrainAt(seed, size, x + dx, y + dy) === 'SEA') return true;
    }
  }
  return false;
}

/** Casilla donde se puede fundar una aldea. */
export function isSettleable(t: TerrainKind): boolean {
  return t === 'PLAIN' || t === 'FOREST';
}

export interface MapRegion {
  originX: number;
  originY: number;
  width: number;
  height: number;
  tiles: string;
  coastal: string;
}

export function renderRegion(seed: number, size: number, x0: number, y0: number, w: number, h: number): MapRegion {
  let tiles = '';
  let coastal = '';
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      tiles += TERRAIN_CODE[terrainAt(seed, size, x, y)];
      coastal += isCoastal(seed, size, x, y) ? '1' : '0';
    }
  }
  return { originX: x0, originY: y0, width: w, height: h, tiles, coastal };
}

/**
 * Candidatos de aparición deterministas para el jugador número `ordinal`.
 * El anillo crece con la población del mundo para repartir a los jugadores.
 * El servidor comprueba distancia mínima y unicidad de celda en BD.
 */
export function spawnCandidates(
  seed: number,
  size: number,
  ordinal: number,
  count: number,
): Array<{ x: number; y: number }> {
  const prng = createPrng(`${seed}:spawn:${ordinal}`);
  const half = Math.floor(size / 2);
  const outer = Math.min(half - 3, 6 + Math.floor(Math.sqrt(ordinal) * 4));
  const inner = Math.max(0, outer - 8);
  const out: Array<{ x: number; y: number }> = [];
  let guard = 0;
  while (out.length < count && guard < count * 200) {
    guard++;
    const x = half + prng.nextIntInclusive(-outer, outer);
    const y = half + prng.nextIntInclusive(-outer, outer);
    const d = Math.max(Math.abs(x - half), Math.abs(y - half));
    if (d < inner) continue;
    if (!isSettleable(terrainAt(seed, size, x, y))) continue;
    out.push({ x, y });
  }
  return out;
}
