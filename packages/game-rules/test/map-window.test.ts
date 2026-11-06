import { describe, expect, it } from 'vitest';
import { mapWindow, coordinateBounds, toCartesian, toMapIndex } from '../src/index.js';
describe('mapa cartesiano y zoom constante', () => {
  it('conserva la ventana completa en cuatro bordes y todos los niveles de zoom', () => {
    for (const size of [16, 64, 1000, 2000, 5000])
      for (let radius = 4; radius <= 10; radius++)
        for (const x of [0, 1, size / 2, size - 2, size - 1])
          for (const y of [0, size / 2, size - 1]) {
            const w = mapWindow(size, x, y, radius);
            expect(w.width).toBe(Math.min(size, radius * 2 + 1));
            expect(w.height).toBe(w.width);
            expect(w.originX).toBeGreaterThanOrEqual(0);
            expect(w.originY).toBeGreaterThanOrEqual(0);
            expect(w.originX + w.width).toBeLessThanOrEqual(size);
            expect(w.originY + w.height).toBeLessThanOrEqual(size);
          }
  });
  it('centra 0|0, invierte Y hacia el norte y conserva posiciones/distancias', () => {
    for (const size of [64, 1000, 2000, 5000]) {
      const b = coordinateBounds(size);
      expect(b.min).toBe(-size / 2);
      expect(b.max).toBe(size / 2 - 1);
      for (const p of [
        { x: 0, y: 0 },
        { x: 2, y: 7 },
        { x: size - 1, y: size - 1 },
        { x: size / 2, y: size / 2 - 1 },
      ])
        expect(toMapIndex(size, toCartesian(size, p))).toEqual(p);
      expect(toCartesian(size, { x: size / 2, y: size / 2 - 1 })).toEqual({ x: 0, y: 0 });
      expect(toCartesian(size, { x: 0, y: 0 })).toEqual({ x: b.min, y: b.max });
    }
  });
});
