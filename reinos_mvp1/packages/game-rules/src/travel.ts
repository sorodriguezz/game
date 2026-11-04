import { type Ruleset, type UnitType, unitDef } from '@reinos/game-config';
import { ceilDiv, isqrt } from './fixed.js';

export interface Coord {
  x: number;
  y: number;
}

/** Distancia euclídea en milésimas de casilla (entera, exacta por isqrt). */
export function distanceMilli(a: Coord, b: Coord): bigint {
  const dx = BigInt(a.x - b.x);
  const dy = BigInt(a.y - b.y);
  return isqrt((dx * dx + dy * dy) * 1_000_000n);
}

export function slowestSpeed(
  r: Ruleset,
  units: ReadonlyArray<{ unitType: UnitType; quantity: number }>,
): number {
  const speeds = units.filter((u) => u.quantity > 0).map((u) => unitDef(r, u.unitType).speedTilesPerHour);
  if (speeds.length === 0) throw new RangeError('ejército vacío');
  return Math.min(...speeds);
}

/**
 * Segundos de viaje terrestre: ceil(dist / velocidad_más_lenta * 3600 / velocidad_mundo).
 * Gate 2 sustituirá la distancia directa por el grafo de rutas (ADR-0010).
 */
export function travelSeconds(distMilli: bigint, slowestTilesPerHour: number, worldSpeed: number): number {
  const secs = ceilDiv(distMilli * 3600n, BigInt(slowestTilesPerHour) * 1000n * BigInt(worldSpeed));
  return Math.max(1, Number(secs));
}
