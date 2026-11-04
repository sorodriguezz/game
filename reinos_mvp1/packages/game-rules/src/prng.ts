/**
 * PRNG sembrado y determinista (ADR-0005). Solo usa operaciones enteras de 32
 * bits (`Math.imul`, desplazamientos), cuyo resultado es idéntico en cualquier
 * motor JavaScript. Nunca usar `Math.random()` en reglas de juego.
 */

/** Hash de cadena a 4 palabras de 32 bits (cyrb128). */
export function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export interface Prng {
  /** Entero uniforme en [0, 2^32). */
  nextUint32(): number;
  /** Entero uniforme en [0, maxExclusive) sin sesgo (muestreo por rechazo). */
  nextInt(maxExclusive: number): number;
  /** Entero uniforme en [min, max]. */
  nextIntInclusive(min: number, max: number): number;
  /** BigInt uniforme en [0, maxExclusive). */
  nextBigInt(maxExclusive: bigint): bigint;
}

/** sfc32: rápido, período largo y totalmente entero. */
export function createPrng(seed: string): Prng {
  let [a, b, c, d] = hashSeed(seed);
  const nextUint32 = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Descartar primeras salidas para mezclar el estado.
  for (let i = 0; i < 12; i++) nextUint32();

  const nextInt = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
      throw new RangeError(`rango inválido ${maxExclusive}`);
    }
    const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
    for (;;) {
      const v = nextUint32();
      if (v < limit) return v % maxExclusive;
    }
  };

  const nextBigInt = (maxExclusive: bigint): bigint => {
    if (maxExclusive <= 0n) throw new RangeError('rango inválido');
    let bits = 0n;
    while (1n << bits < maxExclusive) bits += 1n;
    const words = Math.max(1, Math.ceil(Number(bits) / 32));
    const range = 1n << BigInt(words * 32);
    const limit = range - (range % maxExclusive);
    for (;;) {
      let v = 0n;
      for (let i = 0; i < words; i++) v = (v << 32n) | BigInt(nextUint32());
      if (v < limit) return v % maxExclusive;
    }
  };

  return {
    nextUint32,
    nextInt,
    nextIntInclusive: (min, max) => min + nextInt(max - min + 1),
    nextBigInt,
  };
}

/** Hash entero estable de coordenadas para generación de mapa. */
export function hash2d(seed: number, x: number, y: number, salt = 0): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ salt;
  h = Math.imul(h ^ Math.imul(x, 0x27d4eb2d), 0xc2b2ae35);
  h = Math.imul(h ^ Math.imul(y, 0x165667b1), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}
