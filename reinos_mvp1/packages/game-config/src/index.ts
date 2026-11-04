import { rulesetMvp1Alpha0 } from './rulesets/mvp1-alpha.0.js';
import {
  rulesetSchema,
  type BuildingDef,
  type BuildingType,
  type CivilizationDef,
  type CivilizationId,
  type PlotDef,
  type Ruleset,
  type UnitDef,
  type UnitType,
} from './types.js';

export * from './types.js';

const REGISTRY: ReadonlyMap<string, Ruleset> = new Map(
  [rulesetMvp1Alpha0].map((r) => [r.version, Object.freeze(r)]),
);

export const DEFAULT_RULESET_VERSION = rulesetMvp1Alpha0.version;

export class UnknownRulesetError extends Error {
  constructor(version: string) {
    super(`Ruleset desconocido: ${version}`);
  }
}

/** Devuelve el ruleset versionado. Un mundo siempre usa el de su `ruleset_version`. */
export function getRuleset(version: string): Ruleset {
  const r = REGISTRY.get(version);
  if (!r) throw new UnknownRulesetError(version);
  return r;
}

export function listRulesetVersions(): string[] {
  return [...REGISTRY.keys()];
}

/** Valida estructura e invariantes semánticos de un ruleset. Lanza si es inválido. */
export function validateRuleset(input: unknown): Ruleset {
  const r = rulesetSchema.parse(input);
  const problems: string[] = [];
  const bTypes = new Set(r.buildings.map((b) => b.type));
  const uTypes = new Set(r.units.map((u) => u.type));
  if (bTypes.size !== r.buildings.length) problems.push('edificios duplicados');
  if (uTypes.size !== r.units.length) problems.push('unidades duplicadas');
  for (const b of r.buildings) {
    for (const req of b.requires) {
      if (!bTypes.has(req.building)) problems.push(`${b.type} requiere ${req.building} inexistente`);
      if (req.building === b.type) problems.push(`${b.type} se requiere a sí mismo`);
    }
    if (b.effect === 'production' && !b.produces) problems.push(`${b.type} sin recurso producido`);
  }
  for (const u of r.units) {
    if (!bTypes.has(u.trainedAt)) problems.push(`${u.type} se entrena en ${u.trainedAt} inexistente`);
  }
  for (const c of r.civilizations) {
    const ub = r.buildings.find((b) => b.type === c.uniqueBuilding);
    const uu = r.units.find((u) => u.type === c.uniqueUnit);
    if (!ub || ub.civilization !== c.id) problems.push(`${c.id}: edificio único inválido`);
    if (!uu || uu.civilization !== c.id) problems.push(`${c.id}: unidad única inválida`);
  }
  const plotIds = new Set(r.cityLayout.plots.map((p) => p.id));
  if (plotIds.size !== r.cityLayout.plots.length) problems.push('parcelas duplicadas');
  for (const kind of ['center', 'coastal', 'wall'] as const) {
    if (r.cityLayout.plots.filter((p) => p.kind === kind).length !== 1)
      problems.push(`debe existir exactamente una parcela ${kind}`);
  }
  for (const sb of r.startingBuildings) {
    const plot = r.cityLayout.plots.find((p) => p.id === sb.plot);
    const def = r.buildings.find((b) => b.type === sb.type);
    if (!plot || !def || plot.kind !== def.plotKind)
      problems.push(`edificio inicial ${sb.type} en parcela ${sb.plot} inválido`);
  }
  if (problems.length > 0) throw new Error(`Ruleset ${r.version} inválido: ${problems.join('; ')}`);
  return r;
}

export function buildingDef(r: Ruleset, type: BuildingType): BuildingDef {
  const d = r.buildings.find((b) => b.type === type);
  if (!d) throw new Error(`Edificio desconocido ${type}`);
  return d;
}

export function unitDef(r: Ruleset, type: UnitType): UnitDef {
  const d = r.units.find((u) => u.type === type);
  if (!d) throw new Error(`Unidad desconocida ${type}`);
  return d;
}

export function civilizationDef(r: Ruleset, id: CivilizationId): CivilizationDef {
  const d = r.civilizations.find((c) => c.id === id);
  if (!d) throw new Error(`Civilización desconocida ${id}`);
  return d;
}

export function plotDef(r: Ruleset, id: number): PlotDef | undefined {
  return r.cityLayout.plots.find((p) => p.id === id);
}

export function isBuildingType(v: string): v is BuildingType {
  return (rulesetMvp1Alpha0.buildings as BuildingDef[]).some((b) => b.type === v);
}
