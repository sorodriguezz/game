export interface MarchPath {
  from: { x: number; y: number };
  to: { x: number; y: number };
  departedAt: number;
  arrivesAt: number;
}
/** Closest simultaneous approach along two linear marches. Times and quantized positions are reproducible. */
export function encounterAt(
  a: MarchPath,
  b: MarchPath,
  now: number,
  radiusMilli = 0,
): { at: number; x: number; y: number } | null {
  const start = Math.max(a.departedAt, b.departedAt, now + 1),
    end = Math.min(a.arrivesAt, b.arrivesAt) - 1;
  if (end < start) return null;
  const pos = (m: MarchPath, t: number) => ({
    x: m.from.x + ((m.to.x - m.from.x) * (t - m.departedAt)) / (m.arrivesAt - m.departedAt),
    y: m.from.y + ((m.to.y - m.from.y) * (t - m.departedAt)) / (m.arrivesAt - m.departedAt),
  });
  const ap = pos(a, start),
    bp = pos(b, start);
  const vx =
    (a.to.x - a.from.x) / (a.arrivesAt - a.departedAt) -
    (b.to.x - b.from.x) / (b.arrivesAt - b.departedAt);
  const vy =
    (a.to.y - a.from.y) / (a.arrivesAt - a.departedAt) -
    (b.to.y - b.from.y) / (b.arrivesAt - b.departedAt);
  const speed = vx * vx + vy * vy;
  if (speed === 0)
    return Math.hypot(ap.x - bp.x, ap.y - bp.y) * 1000 <= radiusMilli + 0.001
      ? {
          at: start,
          x: Math.round((ap.x + bp.x) * 500) / 1000,
          y: Math.round((ap.y + bp.y) * 500) / 1000,
        }
      : null;
  const delta = -((ap.x - bp.x) * vx + (ap.y - bp.y) * vy) / speed;
  const at = Math.round(start + delta);
  if (at < start || at > end) return null;
  const p = pos(a, at),
    q = pos(b, at);
  if (Math.hypot(p.x - q.x, p.y - q.y) * 1000 > radiusMilli + 0.001) return null;
  return { at, x: Math.round((p.x + q.x) * 500) / 1000, y: Math.round((p.y + q.y) * 500) / 1000 };
}
