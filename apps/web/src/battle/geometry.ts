import type { TacticalRuleset } from '@reinos/game-config';
import type { FormationSnap } from './useBattleRoom.js';

/** Radio de la formación con el mismo criterio que el servidor (solo para dibujar y seleccionar). */
export function formationRadiusCm(
  t: TacticalRuleset,
  f: Pick<FormationSnap, 'count' | 'preset'>,
): number {
  const g = t.formationGeometry;
  const base = g.baseRadiusCm + g.perSqrtUnitCm * Math.floor(Math.sqrt(Math.max(1, f.count)));
  const preset = (t.formations as Record<string, { radiusPermille: number }>)[f.preset] ?? {
    radiusPermille: 1000,
  };
  return Math.floor((base * preset.radiusPermille) / 1000);
}

/**
 * Posiciones locales (derecha, frente) en metros de los soldados visuales,
 * ajustadas para quedar dentro del radio de la formación que usa el servidor.
 */
export function soldierLayout(
  preset: string,
  n: number,
  radius: number,
  cavalry: boolean,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const pref = (preset === 'SKIRMISH' ? 2.4 : 1.1) * (cavalry ? 1.6 : 1);
  if (preset === 'WEDGE') {
    let rows = 1;
    while ((rows * (rows + 1)) / 2 < n) rows++;
    const spacing = Math.min(pref, (1.6 * radius) / Math.max(1, rows - 1));
    for (let i = 0; i < n; i++) {
      const row = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2);
      const idx = i - (row * (row + 1)) / 2;
      out.push([(idx - row / 2) * spacing, ((rows - 1) / 2 - row) * spacing]);
    }
    return out;
  }
  const rows =
    preset === 'SKIRMISH' ? Math.max(1, Math.round(Math.sqrt(n))) : n <= 6 ? 1 : n <= 12 ? 2 : 3;
  const cols = Math.ceil(n / rows);
  const spacing = Math.min(
    pref,
    (1.7 * radius) / Math.max(1, cols - 1),
    (1.4 * radius) / Math.max(1, rows - 1),
  );
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const col = i % cols;
    let x = (col - (inRow - 1) / 2) * spacing;
    let y = ((rows - 1) / 2 - row) * spacing;
    if (preset === 'SKIRMISH') {
      // Orden abierto: desplazamiento estable por soldado (determinista, sin azar).
      x += Math.sin(i * 12.9898) * spacing * 0.25;
      y += Math.cos(i * 78.233) * spacing * 0.25;
    }
    out.push([x, y]);
  }
  return out;
}
