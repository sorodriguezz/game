import {
  civilizationDef,
  RESOURCE_KEYS,
  type BuildingType,
  type CivilizationId,
  type Deployment,
  type Precinct,
  type Ruleset,
} from '@reinos/game-config';
import {
  normalizeStacks,
  resolveSingleBattle,
  RulesetMismatchError,
  type BattleResult,
  type BattleSnapshot,
  type UnitStack,
} from './battle.js';
import { buildingCost, buildingSeconds } from './economy.js';

export interface BattlePhaseResult {
  precinct: Precinct;
  outcome: 'ATTACKER' | 'DEFENDER';
  attacker: BattleResult['attacker'];
  defender: BattleResult['defender'];
  powers: BattleResult['powers'];
  wallLevel: number;
  integrityBefore: number;
  integrityAfter: number;
  wallDamage: number;
  wallBonusPermille: number;
  advanced: boolean;
}
export const wallType = (precinct: Precinct): BuildingType =>
  precinct === 3 ? 'wall' : precinct === 2 ? 'middle_wall' : 'inner_wall';
export function distributeGarrison(
  r: Ruleset,
  stacks: readonly UnitStack[],
  deployment: Deployment,
) {
  const weights = r.fortifications?.deployment[deployment];
  if (!weights || weights.reduce((a, b) => a + b, 0) !== 1000) throw new Error('Doctrina inválida');
  const groups = ([3, 2, 1] as Precinct[]).map((precinct) => ({
    precinct,
    units: [] as UnitStack[],
  }));
  for (const stack of normalizeStacks(r, stacks)) {
    const counts = weights.map((w) => Math.floor((stack.quantity * w) / 1000));
    let rest = stack.quantity - counts.reduce((a, b) => a + b, 0);
    // Mayor resto, con desempate estable por recinto: conserva incluso pilas de 1.
    const order = weights
      .map((w, i) => ({ i, remainder: (stack.quantity * w) % 1000 }))
      .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
    for (const { i } of order) if (rest-- > 0) counts[i]!++;
    groups.forEach((g, i) => {
      if (counts[i]) g.units.push({ ...stack, quantity: counts[i]! });
    });
  }
  return groups;
}

export function wallRepairQuote(
  r: Ruleset,
  type: BuildingType,
  level: number,
  integrity: number,
  civilization: CivilizationId,
  speed: number,
) {
  const c = r.fortifications;
  if (
    !c ||
    !['wall', 'middle_wall', 'inner_wall'].includes(type) ||
    !Number.isInteger(integrity) ||
    integrity < 0 ||
    integrity >= 1000 ||
    level < 1
  )
    throw new RangeError('Muralla no reparable');
  const missing = 1000 - integrity;
  const base = buildingCost(r, type, level, civilization);
  const cost = Object.fromEntries(
    RESOURCE_KEYS.map((k) => [
      k,
      Math.max(1, Math.ceil((base[k] * missing * c.repairCostPermille) / 1_000_000)),
    ]),
  ) as typeof base;
  return {
    cost,
    seconds: Math.max(
      1,
      Math.ceil(
        (buildingSeconds(r, type, level, speed) * missing * c.repairTimePermille) / 1_000_000,
      ),
    ),
    restoreIntegrity: missing,
  };
}

/** Un único resultado canónico; cada fase utiliza solo su propia guarnición/muralla. */
export function resolveFortifiedBattle(r: Ruleset, snap: BattleSnapshot): BattleResult {
  if (snap.rulesetVersion !== r.version)
    throw new RulesetMismatchError('Versión de combate incorrecta');
  const c = r.fortifications!,
    f = snap.fortifications;
  if (
    !f ||
    f.walls.length !== 3 ||
    new Set(f.walls.map((w) => w.precinct)).size !== 3 ||
    ![1, 2, 3].every((p) => f.walls.some((w) => w.precinct === p))
  )
    throw new Error('Snapshot requiere tres murallas independientes');
  for (const w of f.walls)
    if (
      !Number.isInteger(w.integrity) ||
      w.integrity < 0 ||
      w.integrity > 1000 ||
      !Number.isInteger(w.level) ||
      w.level < 0
    )
      throw new RangeError('Fortificación inválida');
  const present = normalizeStacks(r, snap.defender.units),
    sent = normalizeStacks(r, snap.attacker.units);
  const groups = distributeGarrison(r, present, snap.defender.doctrine.deployment ?? 'BALANCED');
  const phases: BattlePhaseResult[] = [];
  let attackers = sent;
  const results: BattleResult[] = [];
  const zero = { wood: 0, stone: 0, iron: 0, food: 0 };
  for (const group of groups) {
    const wall = f.walls.find((w) => w.precinct === group.precinct)!;
    const escort = attackers.some(
      (u) =>
        !['ram', 'catapult', 'settler', 'chieftain', 'priest'].includes(u.unitType) &&
        u.quantity > 0,
    );
    const rams =
      escort && snap.mission === 'ATTACK'
        ? (attackers.find((u) => u.unitType === 'ram')?.quantity ?? 0)
        : 0;
    const damage =
      wall.level > 0
        ? Math.min(
            wall.integrity,
            Math.floor((rams * c.ramDamagePerUnit) / (1 + wall.level * c.wallResistancePerLevel)),
          )
        : 0;
    const integrityAfter = wall.integrity - damage;
    const wallRate = snap.defender.civilization
      ? civilizationDef(r, snap.defender.civilization).modifiers.wallBonusPermillePerLevel
      : r.combat.wallBonusPermillePerLevel;
    const bonus = Math.min(
      c.maxWallBonusPermille,
      Math.floor((wallRate * wall.level * integrityAfter) / 1000),
    );
    const phaseSnap: BattleSnapshot = {
      ...snap,
      fortifications: undefined,
      seed: `${snap.seed}:precinct:${group.precinct}`,
      attacker: { ...snap.attacker, units: attackers },
      defender: { ...snap.defender, units: group.units },
      defenses: {
        ...snap.defenses,
        wallLevel: wall.level,
        bastionLevel: 0,
        wallBonusPermille: bonus,
        traps: group.precinct === 3 ? snap.defenses.traps : 0,
      },
      defenderResources:
        group.precinct === (snap.mission === 'RAID' ? 2 : 1) ? snap.defenderResources : zero,
    };
    const result = resolveSingleBattle(r, phaseSnap);
    results.push(result);
    const advanced = result.outcome === 'ATTACKER' && result.attacker.survivors.length > 0;
    phases.push({
      precinct: group.precinct,
      outcome: result.outcome,
      attacker: result.attacker,
      defender: result.defender,
      powers: result.powers,
      wallLevel: wall.level,
      integrityBefore: wall.integrity,
      integrityAfter,
      wallDamage: damage,
      wallBonusPermille: bonus,
      advanced,
    });
    attackers = result.attacker.survivors;
    if (!advanced || (snap.mission === 'RAID' && group.precinct === 2)) break;
  }
  const last = results.at(-1)!;
  const lastPhase = phases.at(-1)!;
  const sum = (xs: UnitStack[][]) => normalizeStacks(r, xs.flat());
  const unvisited = groups
    .filter((g) => !phases.some((p) => p.precinct === g.precinct))
    .flatMap((g) => g.units);
  const result: BattleResult = {
    ...last,
    seed: snap.seed,
    attacker: { sent, lost: sum(results.map((p) => p.attacker.lost)), survivors: attackers },
    defender: {
      present,
      reserve: sum(results.map((p) => p.defender.reserve)),
      engaged: sum(results.map((p) => p.defender.engaged)),
      retreated: results.some((p) => p.defender.retreated),
      killed: sum(results.map((p) => p.defender.killed)),
      wounded: sum(results.map((p) => p.defender.wounded)),
      survivors: sum([...results.map((p) => p.defender.survivors), unvisited]),
    },
    trapsUsed: results.reduce((s, p) => s + (p.trapsUsed ?? 0), 0),
    precincts: phases,
    reachedPrecinct: lastPhase.precinct,
    buildingDamage: [],
    milestones: results.flatMap((p, i) => p.milestones.map((m) => ({ ...m, t: m.t + i * 10 }))),
  };
  if (!phases.some((p) => p.precinct === 2 && p.advanced)) result.loot = { ...zero };
  // Solo objetivos alcanzados y vencidos; no vuelve a ejecutar combate para el replay.
  if (snap.mission === 'ATTACK' && snap.siegeTargetPlot !== undefined) {
    const target = f.buildings.find((b) => b.plot === snap.siegeTargetPlot);
    const targetPhase = target
      ? phases.find((p) => p.precinct === target.precinct && p.advanced)
      : undefined;
    const cats =
      targetPhase?.attacker.survivors.find((u) => u.unitType === 'catapult')?.quantity ?? 0;
    if (
      target &&
      phases.some((p) => p.precinct === target.precinct && p.advanced) &&
      cats >= c.catapultsPerLevel &&
      !['wall', 'middle_wall', 'inner_wall'].includes(target.type)
    ) {
      const levels = Math.floor(cats / c.catapultsPerLevel);
      result.buildingDamage!.push({
        plot: target.plot,
        type: target.type,
        precinct: target.precinct,
        fromLevel: target.level,
        toLevel: Math.max(0, target.level - levels),
      });
    }
  }
  return result;
}
