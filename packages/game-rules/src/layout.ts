import type {
  CivilizationId,
  LayoutPoint,
  Precinct,
  Ruleset,
  VillageLayout,
} from '@reinos/game-config';
import { createPrng } from './prng.js';

const round = (n: number) => Math.round(n * 1000) / 1000 || 0;
const distance = (a: LayoutPoint, b: LayoutPoint) => Math.hypot(a.x - b.x, a.z - b.z);
export function distanceToSegment(p: LayoutPoint, a: LayoutPoint, b: LayoutPoint): number {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}

/** Geometría versionada en metros; se persiste una sola vez y nunca decide economía. */
export function generateVillageLayout(
  r: Ruleset,
  input: { worldSeed: number; x: number; y: number; civilization: CivilizationId },
): VillageLayout {
  if (!r.fortifications) throw new Error('Este ruleset no genera planos orgánicos');
  if (r.fortifications.layoutVersion === 'organic-2') return organicTown(r, input);
  const seed = `${input.worldSeed}:${input.x}:${input.y}:${input.civilization}:${r.fortifications.layoutVersion}`;
  const rng = createPrng(seed);
  const jitter = (n: number) => rng.nextIntInclusive(-n, n) / 1000;
  const plots = structuredClone(r.cityLayout.plots);
  // Camino principal norte-sur. La ciudadela se rodea por el este, sin atravesar edificios.
  const roads: VillageLayout['roads'] = [
    {
      id: 'principal',
      width: 3,
      points: [
        { x: 0, z: 112 },
        { x: 0, z: 68 },
        { x: 0, z: 32 },
        { x: 25, z: 22 },
        { x: 25, z: -22 },
        { x: 0, z: -32 },
        { x: 0, z: -68 },
        { x: 0, z: -112 },
      ],
    },
  ];
  for (const p of plots) {
    if (p.kind === 'fortification') continue;
    if (p.kind === 'industry' || p.kind === 'field') {
      const count = p.kind === 'field' ? 18 : 16;
      const i = p.kind === 'field' ? p.id - 22 : p.id - 3;
      const a = ((i + 0.5) * 2 * Math.PI) / count + jitter(700) / 100;
      const radius = (p.kind === 'field' ? 90 : 50) + jitter(p.kind === 'field' ? 1800 : 800);
      p.x = round(Math.sin(a) * radius);
      p.z = round(Math.cos(a) * radius);
      if (p.kind === 'industry' && Math.abs(p.x) < 11) p.x = p.x < 0 ? -11 : 11;
      p.footprintRadius = p.kind === 'field' ? 10 : 8;
      // Acceso tangencial hasta un camino de circunvalación, fuera de la huella máxima.
      const roadRadius = p.kind === 'field' ? 75 : 38;
      roads.push({
        id: `acceso-${p.id}`,
        width: 1.5,
        points: [
          { x: round(Math.sin(a) * roadRadius), z: round(Math.cos(a) * roadRadius) },
          {
            x: round(Math.sin(a) * (radius - p.footprintRadius - 1)),
            z: round(Math.cos(a) * (radius - p.footprintRadius - 1)),
          },
        ],
      });
      p.rotationY = round((a * 180) / Math.PI + 180 + jitter(3000));
    } else {
      const fixed = {
        0: { x: 0, z: -14, r: 13 },
        1: { x: -15, z: 8, r: 10 },
        2: { x: 11, z: 9, r: 7 },
      }[p.id];
      if (fixed) {
        p.x = fixed.x + jitter(500);
        p.z = fixed.z + jitter(500);
        p.footprintRadius = fixed.r;
      }
    }
  }
  // Calles circulares de servicio conectan todos los accesos con las puertas.
  const hall = plots.find((p) => p.id === 0)!,
    rally = plots.find((p) => p.id === 2)!;
  roads.push(
    {
      id: 'acceso-gobierno',
      width: 1.5,
      points: [
        { x: 25, z: hall.z },
        { x: hall.x + 14.5, z: hall.z },
      ],
    },
    {
      id: 'acceso-castillo',
      width: 1.5,
      points: [
        { x: 0, z: 32 },
        { x: -8, z: 20 },
      ],
    },
    {
      id: 'acceso-plaza',
      width: 1.5,
      points: [
        { x: 25, z: rally.z },
        { x: rally.x + 8.5, z: rally.z },
      ],
    },
  );
  for (const radius of [38, 75])
    roads.push({
      id: `circunvalacion-${radius}`,
      width: 2,
      points: Array.from({ length: 73 }, (_, i) => ({
        x: round(Math.sin((i * Math.PI) / 36) * radius),
        z: round(Math.cos((i * Math.PI) / 36) * radius),
      })),
    });
  const walls = ([1, 2, 3] as Precinct[]).map((precinct) => {
    const p = plots.find((p) => p.kind === 'fortification' && p.precinct === precinct)!;
    const radius = p.radius!;
    const perimeter = Array.from({ length: 48 }, (_, i) => {
      const a = (i * 2 * Math.PI) / 48;
      const rad = radius + (i === 0 || i === 24 ? 0 : jitter(800));
      return { x: round(Math.sin(a) * rad), z: round(Math.cos(a) * rad) };
    });
    return { precinct, plot: p.id, radius, perimeter, gate: { x: 0, z: radius } };
  });
  const layout: VillageLayout = {
    version: 'organic-1',
    seed,
    civilization: input.civilization,
    plots,
    walls,
    roads,
  };
  const errors = validateVillageLayout(layout);
  if (errors.length) throw new Error(`Plano inválido: ${errors.join(', ')}`);
  return layout;
}

/** Calles primero; solares orientados a la vía más cercana, con accesos transitables. */
function organicTown(
  r: Ruleset,
  input: { worldSeed: number; x: number; y: number; civilization: CivilizationId },
): VillageLayout {
  const seed = `${input.worldSeed}:${input.x}:${input.y}:${input.civilization}:organic-2`,
    rng = createPrng(seed);
  const noise = (n: number) => rng.nextIntInclusive(-n * 100, n * 100) / 100;
  const radii = { 1: 64, 2: 135, 3: 205 },
    plots = structuredClone(r.cityLayout.plots);
  const roads: VillageLayout['roads'] = [];
  const axis = (id: string, horizontal: boolean, offset: number, extent: number, width: number) => {
    const points = Array.from({ length: 9 }, (_, i) => {
      const along = -extent + (i * extent) / 4,
        cross = offset + (i === 0 || i === 8 ? 0 : noise(5));
      return horizontal ? { x: along, z: cross } : { x: cross, z: along };
    });
    roads.push({ id, width, points });
  };
  axis('camino-del-norte', false, 0, 215, 5);
  axis('camino-del-mercado', true, 0, 215, 6);
  axis('calle-de-los-artesanos', false, -92, 156, 3);
  axis('calle-del-granero', false, 95, 157, 3);
  axis('camino-de-los-campos', true, -166, 120, 2);
  axis('sendero-de-cosecha', true, 164, 121, 2);
  const closest = (p: LayoutPoint) => {
    let best = { x: 0, z: 0, d: Infinity };
    for (const road of roads)
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1]!,
          b = road.points[i]!,
          dx = b.x - a.x,
          dz = b.z - a.z,
          t = Math.max(
            0,
            Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
          ),
          x = a.x + t * dx,
          z = a.z + t * dz,
          d = Math.hypot(p.x - x, p.z - z);
        if (d < best.d) best = { x, z, d };
      }
    return best;
  };
  const placed: typeof plots = [];
  for (const p of [...plots]
    .filter((p) => p.kind !== 'fortification')
    .sort(
      (a, b) =>
        (b.id === 42 ? 20 : b.id === 0 ? 13 : b.kind === 'field' ? 10 : 8) -
          (a.id === 42 ? 20 : a.id === 0 ? 13 : a.kind === 'field' ? 10 : 8) || a.id - b.id,
    )) {
    const precinct = p.precinct ?? 1,
      outer = radii[precinct],
      inner = precinct === 1 ? 0 : radii[(precinct - 1) as 1 | 2],
      size = p.id === 42 ? 20 : p.id === 0 ? 13 : p.kind === 'field' ? 10 : 8;
    let success = false;
    for (let trial = 0; trial < 20000; trial++) {
      const x = noise(outer),
        z = noise(outer),
        point = { x, z },
        rad = Math.hypot(x, z);
      if (rad + size >= outer - 4 || (inner && rad - size <= inner + 4)) continue;
      if (placed.some((q) => distance(point, q) < size + (q.footprintRadius ?? 0) + 3)) continue;
      if (
        roads.some((road) =>
          road.points.some(
            (b, i) =>
              i > 0 && distanceToSegment(point, road.points[i - 1]!, b) < size + road.width / 2 + 1,
          ),
        )
      )
        continue;
      const access = closest(point);
      if (access.d > size + 28) continue;
      const ratio = (size + 2) / access.d,
        start = { x: round(x + (access.x - x) * ratio), z: round(z + (access.z - z) * ratio) },
        end = { x: round(access.x), z: round(access.z) };
      if (placed.some((q) => distanceToSegment(q, start, end) < (q.footprintRadius ?? 0) + 1))
        continue;
      Object.assign(p, {
        x: round(x),
        z: round(z),
        footprintRadius: size,
        rotationY: round((Math.atan2(access.x - x, access.z - z) * 180) / Math.PI),
      });
      roads.push({ id: `acceso-${p.id}`, width: 1.5, points: [start, end] });
      placed.push(p);
      success = true;
      break;
    }
    if (!success) throw new Error(`No cabe el solar ${p.id}`);
  }
  const walls = ([1, 2, 3] as const).map((precinct) => {
    const p = plots.find((p) => p.kind === 'fortification' && p.precinct === precinct)!,
      radius = radii[precinct];
    Object.assign(p, { radius, x: 0, z: radius });
    return {
      precinct,
      plot: p.id,
      radius,
      gate: { x: 0, z: radius },
      perimeter: Array.from({ length: 96 }, (_, i) => {
        const a = (i * Math.PI) / 48,
          rad = radius + (i % 24 === 0 ? 0 : noise(1));
        return { x: round(Math.sin(a) * rad), z: round(Math.cos(a) * rad) };
      }),
    };
  });
  const layout: VillageLayout = {
      version: 'organic-2',
      seed,
      civilization: input.civilization,
      plots,
      walls,
      roads,
    },
    errors = validateVillageLayout(layout);
  if (errors.length) throw new Error(`Plano inválido: ${errors.join(', ')}`);
  return layout;
}

/** Huellas circulares incluyen el volumen máximo de todos los niveles visuales. */
export function validateVillageLayout(layout: VillageLayout): string[] {
  const errors: string[] = [];
  const plots = layout.plots.filter((p) => p.kind !== 'fortification');
  if (new Set(layout.plots.map((p) => p.id)).size !== layout.plots.length)
    errors.push('identificadores duplicados');
  for (const p of plots) {
    const size = p.footprintRadius ?? 0;
    const outer = layout.walls.find((w) => w.precinct === p.precinct);
    const inner = layout.walls.find((w) => w.precinct === (p.precinct ?? 1) - 1);
    const rad = Math.hypot(p.x, p.z);
    if (!outer || rad + size >= outer.radius - 2 || (inner && rad - size <= inner.radius + 2))
      errors.push(`recinto ${p.id}`);
    for (const q of plots)
      if (p.id < q.id && distance(p, q) < size + (q.footprintRadius ?? 0) + 1)
        errors.push(`solapamiento ${p.id}/${q.id}`);
    for (const road of layout.roads)
      for (let i = 1; i < road.points.length; i++)
        if (distanceToSegment(p, road.points[i - 1]!, road.points[i]!) < size + road.width / 2)
          errors.push(`camino ${p.id}/${road.id}`);
  }
  return errors;
}
