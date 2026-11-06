export function coordinateBounds(size: number) {
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError('Tamaño de mapa inválido');
  const min = -Math.floor(size / 2);
  return { min, max: min + size - 1 };
}
export function toCartesian(size: number, p: { x: number; y: number }) {
  const b = coordinateBounds(size);
  return { x: p.x + b.min, y: b.max - p.y };
}
export function toMapIndex(size: number, p: { x: number; y: number }) {
  const b = coordinateBounds(size);
  return { x: p.x - b.min, y: b.max - p.y };
}
/** Reencuadra en el borde sin reducir la cantidad de casillas del zoom. */
export function mapWindow(
  size: number,
  x: number,
  y: number,
  radius: number,
  viewport?: { width?: number; height?: number },
) {
  const width = Math.min(size, Math.max(radius * 2 + 1, viewport?.width ?? 0)),
    height = Math.min(size, Math.max(radius * 2 + 1, viewport?.height ?? 0));
  return {
    originX: Math.max(0, Math.min(size - width, Math.floor(x) - Math.floor(width / 2))),
    originY: Math.max(0, Math.min(size - height, Math.floor(y) - Math.floor(height / 2))),
    width,
    height,
  };
}
