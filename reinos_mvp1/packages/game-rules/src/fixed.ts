import type { Growth } from '@reinos/game-config';

/** Milisegundos por hora (denominador de tasas por hora). */
export const MS_PER_HOUR = 3_600_000n;
/** Escala de precisión fija para recursos: 1 unidad = 1000 milésimas. */
export const MILLI = 1000n;
/** Escala para razones de combate (6 decimales exactos). */
export const RATIO_SCALE = 1_000_000n;

/** División entera con redondeo hacia -infinito (BigInt trunca hacia cero). */
export function floorDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new RangeError('división por cero');
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

/** División entera con redondeo hacia +infinito. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  return -floorDiv(-a, b);
}

/** Módulo no negativo coherente con floorDiv. */
export function floorMod(a: bigint, b: bigint): bigint {
  return a - floorDiv(a, b) * b;
}

/** Raíz cuadrada entera exacta (floor) por Newton. Determinista en cualquier motor. */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError('isqrt de negativo');
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

/** base * (num/den)^exp evaluado exactamente; devuelve [numerador, denominador]. */
export function growthFraction(g: Growth, exp: number): [bigint, bigint] {
  if (!Number.isInteger(exp) || exp < 0) throw new RangeError(`exponente inválido ${exp}`);
  return [BigInt(g.num) ** BigInt(exp), BigInt(g.den) ** BigInt(exp)];
}

/** ceil(base * g^exp) */
export function ceilGrowth(base: bigint, g: Growth, exp: number): bigint {
  const [n, d] = growthFraction(g, exp);
  return ceilDiv(base * n, d);
}

/** floor(base * g^exp) */
export function floorGrowth(base: bigint, g: Growth, exp: number): bigint {
  const [n, d] = growthFraction(g, exp);
  return floorDiv(base * n, d);
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function toSafeNumber(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`valor fuera de rango seguro: ${v}`);
  }
  return Number(v);
}
