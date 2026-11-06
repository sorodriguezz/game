import {
  plotDef,
  civilizationDef,
  type BuildingType,
  type CivilizationId,
  type Ruleset,
  type UnitType,
  type VillageLayout,
} from '@reinos/game-config';
import type { ErrorCode } from '@reinos/contracts';
import { levelOf, computeRates } from './economy.js';

export interface PlacedBuilding {
  plot: number;
  type: BuildingType;
  level: number;
}

export function constructionLane(
  r: Ruleset,
  civilization: CivilizationId,
  type: BuildingType,
): 'GENERAL' | 'FIELD' {
  return civilizationDef(r, civilization).modifiers.parallelFieldConstruction &&
    r.buildings.find((b) => b.type === type)?.plotKind === 'field'
    ? 'FIELD'
    : 'GENERAL';
}

export type RuleCheck<T> =
  { ok: true; value: T } | { ok: false; code: ErrorCode; details?: Record<string, unknown> };

/**
 * Valida construir/mejorar `type` en `plot` (FR-CITY-01/03/08, ADR-0009).
 * El servidor es quien la ejecuta; el cliente la usa solo para UX.
 */
export function validateConstruction(
  r: Ruleset,
  input: {
    civilization: CivilizationId;
    coastal: boolean;
    buildings: readonly PlacedBuilding[];
    plot: number;
    type: BuildingType;
    layout?: VillageLayout;
    speed?: number;
    pending?: readonly PlacedBuilding[];
  },
): RuleCheck<{ targetLevel: number }> {
  const plot = input.layout
    ? input.layout.plots.find((p) => p.id === input.plot)
    : plotDef(r, input.plot);
  if (!plot) return { ok: false, code: 'PLOT_NOT_FOUND' };
  const def = r.buildings.find((b) => b.type === input.type);
  if (!def) return { ok: false, code: 'VALIDATION_FAILED' };
  if (plot.allowedTypes && !plot.allowedTypes.includes(input.type))
    return { ok: false, code: 'PLOT_KIND_MISMATCH' };
  if (plot.kind !== def.plotKind)
    return { ok: false, code: 'PLOT_KIND_MISMATCH', details: { expected: def.plotKind } };
  if (def.civilization && def.civilization !== input.civilization) {
    return { ok: false, code: 'CIVILIZATION_RESTRICTED' };
  }
  if (plot.kind === 'coastal' && !input.coastal) return { ok: false, code: 'NOT_COASTAL' };

  const onPlot = input.buildings.find((b) => b.plot === input.plot);
  if (onPlot && onPlot.type !== input.type) return { ok: false, code: 'PLOT_OCCUPIED' };
  const sameType = input.buildings.find((b) => b.type === input.type);
  if (!def.repeatable && sameType && sameType.plot !== input.plot) {
    return { ok: false, code: 'BUILDING_ALREADY_EXISTS', details: { plot: sameType.plot } };
  }
  const current = onPlot?.level ?? 0;
  if (current >= def.maxLevel) return { ok: false, code: 'MAX_LEVEL_REACHED' };

  const missing = def.requires.filter((req) => levelOf(input.buildings, req.building) < req.level);
  if (missing.length > 0) return { ok: false, code: 'REQUIREMENTS_NOT_MET', details: { missing } };
  if (r.economy.cropPopulation && !['farm', 'grain_mill', 'bakery'].includes(input.type)) {
    const projected = [...input.buildings];
    for (const b of [
      ...(input.pending ?? []),
      { plot: input.plot, type: input.type, level: current + 1 },
    ]) {
      const index = projected.findIndex((p) => p.plot === b.plot);
      if (index >= 0) projected[index] = b;
      else projected.push(b);
    }
    const local = input.layout ? { ...r, cityLayout: { plots: input.layout.plots } } : r;
    if (computeRates(local, projected, 0, input.speed ?? 1).food < 1000n)
      return { ok: false, code: 'REQUIREMENTS_NOT_MET', details: { freeCrop: true } };
  }

  return { ok: true, value: { targetLevel: current + 1 } };
}

/** Valida que la aldea pueda reclutar `unitType` (FR-ARM-01). */
export function validateRecruitment(
  r: Ruleset,
  input: {
    civilization: CivilizationId;
    buildings: readonly PlacedBuilding[];
    unitType: UnitType;
    research?: ReadonlyArray<{ unitType: UnitType; kind: string; level: number }>;
  },
): RuleCheck<{ trainedAt: BuildingType }> {
  const def = r.units.find((u) => u.type === input.unitType);
  if (!def) return { ok: false, code: 'UNIT_NOT_AVAILABLE' };
  if (def.npcOnly) return { ok: false, code: 'UNIT_NOT_AVAILABLE' };
  if (
    def.researchRequired &&
    !input.research?.some(
      (s) => s.unitType === input.unitType && s.kind === 'UNLOCK' && s.level >= 1,
    )
  )
    return { ok: false, code: 'UNIT_NOT_AVAILABLE', details: { researchRequired: true } };
  if (def.civilization && def.civilization !== input.civilization) {
    return { ok: false, code: 'CIVILIZATION_RESTRICTED' };
  }
  if (levelOf(input.buildings, def.trainedAt) < 1) {
    return { ok: false, code: 'TRAINING_BUILDING_MISSING', details: { building: def.trainedAt } };
  }
  const missing = def.requires.filter((req) => levelOf(input.buildings, req.building) < req.level);
  if (missing.length > 0) return { ok: false, code: 'UNIT_NOT_AVAILABLE', details: { missing } };
  return { ok: true, value: { trainedAt: def.trainedAt } };
}

/** Etapa visual (1–3) para un nivel de edificio (FR-CITY-05: 1–3, 4–7, 8+). */
export function visualStage(level: number): 1 | 2 | 3 {
  if (level >= 8) return 3;
  if (level >= 4) return 2;
  return 1;
}
