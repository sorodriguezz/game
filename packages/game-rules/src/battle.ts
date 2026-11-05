import {
  RESOURCE_KEYS,
  civilizationDef,
  unitDef,
  type CivilizationId,
  type ResourceBundle,
  type Ruleset,
  type UnitType,
} from '@reinos/game-config';
import { RATIO_SCALE, isqrt, minBig } from './fixed.js';
import { createPrng, type Prng } from './prng.js';
import type { TerrainKind } from './map.js';

/**
 * Motor de combate automático, puro y determinista (ADR-0005, PRD §10.4).
 * Misma `BattleSnapshot` + misma versión de reglas ⇒ mismo `BattleResult`,
 * en cualquier motor JS: solo aritmética BigInt y un PRNG sembrado.
 * No lee la hora, ni BD, ni `Math.random()`.
 */

export interface UnitStack {
  unitType: UnitType;
  quantity: number;
}

export interface DefenseDoctrine {
  /** % de cada pila que se reserva y no combate (0–maxReservePercent). */
  reservePercent: number;
  /** Retirada si ataque esperado ≥ defensa × umbral/100. `null` = nunca. */
  retreatThresholdPercent: number | null;
}

export type BattleMission = 'ATTACK' | 'RAID';

export interface BattleSnapshot {
  battleId: string;
  worldId: string;
  seed: string;
  rulesetVersion: string;
  mission: BattleMission;
  location?: 'VILLAGE' | 'FIELD';
  attacker: { civilization: CivilizationId; units: UnitStack[] };
  defender: {
    civilization: CivilizationId | null;
    units: UnitStack[];
    doctrine: DefenseDoctrine;
  };
  defenses: { wallLevel: number; bastionLevel: number; hospitalLevel: number; traps?: number };
  terrain: { kind: TerrainKind };
  /** Recursos (unidades enteras) del defensor liquidados al instante del combate. */
  defenderResources: ResourceBundle;
}

export type BattleSide = 'ATTACKER' | 'DEFENDER';
export type BattlePhase = 'VOLLEY' | 'CHARGE' | 'MELEE';

export type BattleMilestone =
  | { t: number; kind: 'ENGAGE'; attackPower: number; defensePower: number }
  | { t: number; kind: 'RETREAT'; side: 'DEFENDER' }
  | {
      t: number;
      kind: 'PHASE';
      phase: BattlePhase;
      losses: Array<{ side: BattleSide; unitType: UnitType; count: number }>;
    }
  | { t: number; kind: 'OUTCOME'; winner: BattleSide }
  | { t: number; kind: 'LOOT'; loot: ResourceBundle };

export interface BattleResult {
  battleId: string;
  worldId: string;
  rulesetVersion: string;
  seed: string;
  mission: BattleMission;
  outcome: BattleSide;
  powers: {
    attack: number;
    defense: number;
    luckPermille: number;
    attackerMoralePermille: number;
    defenderMoralePermille: number;
    wallPermille: number;
  };
  attacker: { sent: UnitStack[]; lost: UnitStack[]; survivors: UnitStack[] };
  defender: {
    present: UnitStack[];
    reserve: UnitStack[];
    engaged: UnitStack[];
    retreated: boolean;
    killed: UnitStack[];
    wounded: UnitStack[];
    survivors: UnitStack[];
  };
  trapsUsed?: number;
  carryCapacity: number;
  loot: ResourceBundle;
  milestones: BattleMilestone[];
}

export class RulesetMismatchError extends Error {}

const S = RATIO_SCALE;

/** x^1.5 con x en escala S (x ∈ [0,S]). */
function pow15(x: bigint): bigint {
  return (x * isqrt(x * S)) / S;
}

/** Agrega por tipo, elimina ceros y ordena según el catálogo (orden estable). */
export function normalizeStacks(r: Ruleset, stacks: readonly UnitStack[]): UnitStack[] {
  const totals = new Map<UnitType, number>();
  for (const s of stacks) {
    if (!Number.isSafeInteger(s.quantity) || s.quantity < 0) {
      throw new RangeError(`cantidad inválida para ${s.unitType}: ${s.quantity}`);
    }
    unitDef(r, s.unitType); // valida tipo
    totals.set(s.unitType, (totals.get(s.unitType) ?? 0) + s.quantity);
  }
  return r.units
    .map((u) => ({ unitType: u.type, quantity: totals.get(u.type) ?? 0 }))
    .filter((s) => s.quantity > 0);
}

function moralePermille(r: Ruleset, stacks: readonly UnitStack[]): number {
  let priests = 0;
  let others = 0;
  let support: { moraleBonusPercent: number; maximumArmyBonusPercent: number } | undefined;
  for (const s of stacks) {
    const d = unitDef(r, s.unitType);
    if (d.support) {
      priests += s.quantity;
      support = d.support;
    } else {
      others += s.quantity;
    }
  }
  if (!support || others === 0 || priests === 0) return 0;
  const per100 = Math.floor((priests * 100) / others);
  return Math.min(support.maximumArmyBonusPercent, support.moraleBonusPercent * per100) * 10;
}

function lossCount(prng: Prng, quantity: number, ratio: bigint): number {
  const exact = BigInt(quantity) * ratio;
  const whole = exact / S;
  const frac = exact % S;
  // Redondeo estocástico determinista: siempre consume una extracción del PRNG.
  const extra = prng.nextBigInt(S) < frac ? 1n : 0n;
  return Number(minBig(whole + extra, BigInt(quantity)));
}

function sub(a: readonly UnitStack[], b: readonly UnitStack[]): UnitStack[] {
  return a.map((s) => ({
    unitType: s.unitType,
    quantity: s.quantity - (b.find((x) => x.unitType === s.unitType)?.quantity ?? 0),
  }));
}

function nonZero(stacks: UnitStack[]): UnitStack[] {
  return stacks.filter((s) => s.quantity > 0);
}

export function resolveBattle(r: Ruleset, snap: BattleSnapshot): BattleResult {
  if (snap.rulesetVersion !== r.version) {
    throw new RulesetMismatchError(`snapshot ${snap.rulesetVersion} ≠ ruleset ${r.version}`);
  }
  const prng = createPrng(`${snap.seed}|${snap.battleId}|${snap.rulesetVersion}`);
  const c = r.combat;

  const originalSent = normalizeStacks(r, snap.attacker.units);
  const trapCapacity =
    snap.location === 'FIELD' ? 0 : Math.max(0, Math.floor(snap.defenses.traps ?? 0));
  let remainingTraps = trapCapacity;
  const trapped = originalSent.map((stack) => {
    const quantity = Math.min(stack.quantity, remainingTraps);
    remainingTraps -= quantity;
    return { unitType: stack.unitType, quantity };
  });
  const sent = sub(originalSent, trapped);
  const present = normalizeStacks(r, snap.defender.units);

  // --- Ataque -------------------------------------------------------------
  let attInf = 0n;
  let attCav = 0n;
  for (const s of sent) {
    const d = unitDef(r, s.unitType);
    const p = BigInt(d.attack) * BigInt(s.quantity);
    if (d.unitClass === 'cavalry') attCav += p;
    else attInf += p;
  }
  const attRaw = attInf + attCav;
  const attMorale = moralePermille(r, sent);
  const luck = prng.nextIntInclusive(-c.luckPermille, c.luckPermille);
  const expectedAttack = (attRaw * BigInt(1000 + attMorale)) / 1000n;
  const attack = (expectedAttack * BigInt(1000 + luck)) / 1000n;

  // --- Defensa --------------------------------------------------------------
  const reservePct = Math.max(
    0,
    Math.min(snap.defender.doctrine.reservePercent, c.maxReservePercent),
  );
  const reserve = present.map((s) => ({
    unitType: s.unitType,
    quantity: Math.floor((s.quantity * reservePct) / 100),
  }));
  let engaged = sub(present, reserve);

  const wallPerLevel = snap.defender.civilization
    ? civilizationDef(r, snap.defender.civilization).modifiers.wallBonusPermillePerLevel
    : c.wallBonusPermillePerLevel;
  const wallPermille =
    wallPerLevel * snap.defenses.wallLevel +
    c.bastionBonusPermillePerLevel * snap.defenses.bastionLevel;

  const defenseOf = (units: readonly UnitStack[]): { power: bigint; morale: number } => {
    let inf = 0n;
    let cav = 0n;
    for (const s of units) {
      const d = unitDef(r, s.unitType);
      inf += BigInt(d.infantryDefense) * BigInt(s.quantity);
      cav += BigInt(d.cavalryDefense) * BigInt(s.quantity);
    }
    const unitsPower = attRaw > 0n ? (inf * attInf + cav * attCav) / attRaw : inf;
    const morale = moralePermille(r, units);
    const power =
      ((unitsPower + BigInt(snap.location === 'FIELD' ? 0 : c.baseVillageDefense)) *
        BigInt(1000 + wallPermille) *
        BigInt(1000 + morale)) /
      1_000_000n;
    return { power, morale };
  };

  let def = defenseOf(engaged);
  let retreated = false;
  const threshold = snap.defender.doctrine.retreatThresholdPercent;
  if (
    threshold !== null &&
    engaged.some((s) => s.quantity > 0) &&
    expectedAttack * 100n >= def.power * BigInt(threshold)
  ) {
    retreated = true;
    engaged = engaged.map((s) => ({ unitType: s.unitType, quantity: 0 }));
    def = defenseOf([]);
  }
  const defense = def.power;

  const outcome: BattleSide = attack > defense ? 'ATTACKER' : 'DEFENDER';

  // --- Razones de pérdidas (escala S) --------------------------------------
  let attLoss: bigint;
  let defLoss: bigint;
  if (snap.mission === 'ATTACK') {
    if (outcome === 'ATTACKER') {
      attLoss = attack === 0n ? 0n : pow15((defense * S) / attack);
      defLoss = S;
    } else {
      defLoss = defense === 0n ? 0n : pow15((attack * S) / defense);
      attLoss = S;
    }
  } else {
    const winner = outcome === 'ATTACKER' ? attack : defense;
    const loser = outcome === 'ATTACKER' ? defense : attack;
    const x = winner === 0n ? 0n : pow15((loser * S) / winner);
    const winnerLoss = (x * S) / (S + x);
    const loserLoss = (S * S) / (S + x);
    attLoss = outcome === 'ATTACKER' ? winnerLoss : loserLoss;
    defLoss = outcome === 'ATTACKER' ? loserLoss : winnerLoss;
  }

  const lost = sent.map((s) => ({
    unitType: s.unitType,
    quantity: lossCount(prng, s.quantity, attLoss),
  }));
  const allLost = normalizeStacks(r, [...lost, ...trapped]);
  const dead = engaged.map((s) => ({
    unitType: s.unitType,
    quantity: lossCount(prng, s.quantity, defLoss),
  }));

  const hospital = snap.defenses.hospitalLevel;
  const woundedPermille =
    hospital > 0
      ? Math.min(
          c.hospitalWoundedMaxPermille,
          c.hospitalWoundedBasePermille + c.hospitalWoundedPermillePerLevel * hospital,
        )
      : 0;
  const wounded = dead.map((s) => ({
    unitType: s.unitType,
    quantity: Math.floor((s.quantity * woundedPermille) / 1000),
  }));
  const killed = sub(dead, wounded);
  const survivorsAtt = sub(sent, lost);
  const survivorsDef = sub(present, dead);

  // --- Botín -----------------------------------------------------------------
  const carryPermille = civilizationDef(r, snap.attacker.civilization).modifiers.carryPermille;
  const carryRaw = survivorsAtt.reduce(
    (acc, s) => acc + unitDef(r, s.unitType).carry * s.quantity,
    0,
  );
  const carryCapacity = Math.floor((carryRaw * carryPermille) / 1000);
  const loot: ResourceBundle = { wood: 0, stone: 0, iron: 0, food: 0 };
  if (outcome === 'ATTACKER' && carryCapacity > 0) {
    const avail: ResourceBundle = { wood: 0, stone: 0, iron: 0, food: 0 };
    for (const k of RESOURCE_KEYS) {
      const have = Math.max(0, snap.defenderResources[k]);
      avail[k] = have - Math.floor((have * c.lootProtectedPermille) / 1000);
    }
    const total = RESOURCE_KEYS.reduce((a, k) => a + avail[k], 0);
    if (total <= carryCapacity) {
      for (const k of RESOURCE_KEYS) loot[k] = avail[k];
    } else if (total > 0) {
      let assigned = 0;
      for (const k of RESOURCE_KEYS) {
        loot[k] = Number((BigInt(carryCapacity) * BigInt(avail[k])) / BigInt(total));
        assigned += loot[k];
      }
      let leftover = carryCapacity - assigned;
      while (leftover > 0) {
        for (const k of RESOURCE_KEYS) {
          if (leftover > 0 && loot[k] < avail[k]) {
            loot[k] += 1;
            leftover -= 1;
          }
        }
      }
    }
  }

  // --- Hitos para la repetición 3D (dramatización del resultado) -----------
  const milestones: BattleMilestone[] = [
    { t: 0, kind: 'ENGAGE', attackPower: Number(attack), defensePower: Number(defense) },
  ];
  let t = 1;
  if (retreated) milestones.push({ t: t++, kind: 'RETREAT', side: 'DEFENDER' });
  const phases: BattlePhase[] = [];
  const anyRanged = [...sent, ...engaged].some(
    (s) => s.quantity > 0 && unitDef(r, s.unitType).ranged,
  );
  const anyCav = sent.some((s) => s.quantity > 0 && unitDef(r, s.unitType).unitClass === 'cavalry');
  if (anyRanged) phases.push('VOLLEY');
  if (anyCav) phases.push('CHARGE');
  phases.push('MELEE');
  const split = (n: number, i: number): number => {
    const base = Math.floor(n / phases.length);
    return i === phases.length - 1 ? n - base * (phases.length - 1) : base;
  };
  phases.forEach((phase, i) => {
    const losses: Array<{ side: BattleSide; unitType: UnitType; count: number }> = [];
    for (const s of allLost) {
      const count = split(s.quantity, i);
      if (count > 0) losses.push({ side: 'ATTACKER', unitType: s.unitType, count });
    }
    for (const s of dead) {
      const count = split(s.quantity, i);
      if (count > 0) losses.push({ side: 'DEFENDER', unitType: s.unitType, count });
    }
    milestones.push({ t: t++, kind: 'PHASE', phase, losses });
  });
  milestones.push({ t: t++, kind: 'OUTCOME', winner: outcome });
  if (RESOURCE_KEYS.some((k) => loot[k] > 0)) milestones.push({ t: t++, kind: 'LOOT', loot });

  return {
    battleId: snap.battleId,
    worldId: snap.worldId,
    rulesetVersion: snap.rulesetVersion,
    seed: snap.seed,
    mission: snap.mission,
    outcome,
    powers: {
      attack: Number(attack),
      defense: Number(defense),
      luckPermille: luck,
      attackerMoralePermille: attMorale,
      defenderMoralePermille: def.morale,
      wallPermille,
    },
    attacker: { sent: originalSent, lost: allLost, survivors: nonZero(survivorsAtt) },
    ...(trapCapacity > 0 ? { trapsUsed: trapCapacity - remainingTraps } : {}),
    defender: {
      present,
      reserve: nonZero(reserve),
      engaged: nonZero(engaged),
      retreated,
      killed: nonZero(killed),
      wounded: nonZero(wounded),
      survivors: nonZero(survivorsDef),
    },
    carryCapacity,
    loot,
    milestones,
  };
}
