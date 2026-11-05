import { z } from 'zod';
import { UNIT_TYPES, type UnitType } from './types.js';

/**
 * Reglas tácticas versionadas (MVP 2, ADR-0025, PRD-MVP2 §2.5). Son DATOS:
 * cambiar un valor exige una versión nueva. Las estadísticas base (ataque,
 * defensa, velocidad, población) siguen saliendo del ruleset M1 indicado en
 * `baseRulesetVersion`; aquí solo se añaden parámetros propios del táctico.
 *
 * Unidades espaciales: centímetros enteros. Tiempo: ticks (tickHz por segundo).
 * Multiplicadores: tanto por mil (1000 = sin cambio).
 */

const int = z.number().int();
const nonNeg = int.nonnegative();
const pos = int.positive();
const permille = int.min(0).max(10_000);

export const OBSTACLE_KINDS = ['forest', 'rock', 'water'] as const;
export type ObstacleKind = (typeof OBSTACLE_KINDS)[number];

export const obstacleSchema = z.discriminatedUnion('shape', [
  z.object({ shape: z.literal('circle'), kind: z.enum(OBSTACLE_KINDS), x: int, z: int, r: pos }),
  z.object({
    shape: z.literal('rect'),
    kind: z.enum(OBSTACLE_KINDS),
    x0: int,
    z0: int,
    x1: int,
    z1: int,
  }),
]);
export type Obstacle = z.infer<typeof obstacleSchema>;

export const arenaSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  widthCm: pos,
  depthCm: pos,
  /** Tamaño de celda de la rejilla de navegación 2.5D (precalculada fuera del tick). */
  cellCm: pos,
  obstacles: z.array(obstacleSchema),
  /** Colinas solo visuales (la simulación es 2.5D sobre el plano). */
  hills: z.array(z.object({ x: int, z: int, r: pos, h: pos })),
  /** Franja de despliegue por bando (z mín/máx). El atacante entra por el sur. */
  deploy: z.object({
    ATTACKER: z.object({ zMin: int, zMax: int }),
    DEFENDER: z.object({ zMin: int, zMax: int }),
  }),
  /** Borde de escape (retirada/huida): atacante hacia z = depth, defensor hacia z = 0. */
  escapeMarginCm: pos,
});
export type ArenaDef = z.infer<typeof arenaSchema>;

export const unitTacticalProfileSchema = z.object({
  kind: z.enum(['melee', 'ranged', 'support']),
  rangeCm: nonNeg,
  /** Multiplicador de ataque cuando una unidad a distancia combate cuerpo a cuerpo. */
  meleePenaltyPermille: permille,
  /** Bonificación de carga (caballería) durante `chargeTicks` tras entrar en contacto en movimiento. */
  chargeBonusPermille: permille,
});

export const formationModifierSchema = z.object({
  attackPermille: permille,
  defensePermille: permille,
  speedPermille: permille,
  rangedTakenPermille: permille,
  radiusPermille: permille,
});

export const trainingArmySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Pilas de unidades; `unique` se sustituye por la unidad única de la civilización. */
  stacks: z.array(
    z.object({ unitType: z.union([z.enum(UNIT_TYPES), z.literal('unique')]), count: pos }),
  ),
});

export const tacticalRulesetSchema = z.object({
  version: z.string().min(1),
  status: z.enum(['PROPOSAL', 'APPROVED']),
  baseRulesetVersion: z.string().min(1),
  timing: z.object({
    tickHz: pos,
    prepareSeconds: nonNeg,
    matchMaxSeconds: pos,
    reconnectSeconds: pos,
    inviteSeconds: pos,
    ticketTtlSeconds: pos,
    trainingLobbySeconds: pos,
  }),
  limits: z.object({
    maxFormationsPerSide: pos,
    formationMaxUnits: pos,
    ordersPerSecondPerPlayer: pos,
    maxPendingOrdersPerTick: pos,
  }),
  combat: z.object({
    /** Daño por segundo = unidades × ataque × num/den (en milésimas de vida). */
    damageNum: pos,
    damageDen: pos,
    /** Vida por soldado = defensa (inf./cab. según clase atacante) × hpScale. */
    hpScale: pos,
    meleeContactCm: pos,
    chargeTicks: pos,
    pursuitBonusPermille: permille,
    visionRadiusCm: pos,
    timeoutTieWinner: z.enum(['ATTACKER', 'DEFENDER']),
  }),
  movement: z.object({
    /** cm por tick = velocidad M1 (casillas/hora) × factor / 100. */
    speedFactor: pos,
    forestSpeedPermille: permille,
    retreatSpeedPermille: permille,
    routSpeedPermille: permille,
    reorgTicks: pos,
    repathEveryTicks: pos,
  }),
  morale: z.object({
    initial: pos,
    max: pos,
    /** Pérdida de moral = bajas_del_tick / unidades_iniciales × lossFactorPermille. */
    lossFactorPermille: permille,
    routThreshold: nonNeg,
    recoveryPerTick: nonNeg,
    supportBoost: pos,
    supportRadiusCm: pos,
    supportCooldownTicks: pos,
  }),
  formationGeometry: z.object({ baseRadiusCm: pos, perSqrtUnitCm: pos }),
  formations: z.object({
    LINE: formationModifierSchema,
    WEDGE: formationModifierSchema,
    SKIRMISH: formationModifierSchema,
  }),
  units: z.record(z.enum(UNIT_TYPES), unitTacticalProfileSchema),
  arenas: z.array(arenaSchema).min(1),
  trainingArmies: z.array(trainingArmySchema),
});
export type TacticalRuleset = z.infer<typeof tacticalRulesetSchema>;

const M = 100; // 1 metro = 100 cm

/**
 * `tactical-mvp2-alpha.0` — PROPOSAL. Valores de laboratorio para Gate 1
 * (TRAINING). GDD §8 exige simulaciones AUTO vs táctico antes de WORLD_PVP.
 */
export const tacticalMvp2Alpha0: TacticalRuleset = {
  version: 'tactical-mvp2-alpha.0',
  status: 'PROPOSAL',
  baseRulesetVersion: 'mvp1-alpha.0',
  timing: {
    tickHz: 10,
    prepareSeconds: 8,
    matchMaxSeconds: 300,
    reconnectSeconds: 30,
    inviteSeconds: 20,
    ticketTtlSeconds: 60,
    trainingLobbySeconds: 180,
  },
  limits: {
    maxFormationsPerSide: 12,
    formationMaxUnits: 60,
    ordersPerSecondPerPlayer: 8,
    maxPendingOrdersPerTick: 24,
  },
  combat: {
    damageNum: 1,
    damageDen: 12,
    hpScale: 4,
    meleeContactCm: 3 * M,
    chargeTicks: 20,
    pursuitBonusPermille: 1250,
    visionRadiusCm: 70 * M,
    timeoutTieWinner: 'DEFENDER',
  },
  movement: {
    speedFactor: 750,
    forestSpeedPermille: 600,
    retreatSpeedPermille: 900,
    routSpeedPermille: 1100,
    reorgTicks: 20,
    repathEveryTicks: 10,
  },
  morale: {
    initial: 1000,
    max: 1000,
    lossFactorPermille: 1500,
    routThreshold: 250,
    recoveryPerTick: 2,
    supportBoost: 150,
    supportRadiusCm: 25 * M,
    supportCooldownTicks: 300,
  },
  formationGeometry: { baseRadiusCm: 250, perSqrtUnitCm: 45 },
  formations: {
    LINE: {
      attackPermille: 1000,
      defensePermille: 1100,
      speedPermille: 900,
      rangedTakenPermille: 1000,
      radiusPermille: 1000,
    },
    WEDGE: {
      attackPermille: 1150,
      defensePermille: 900,
      speedPermille: 1000,
      rangedTakenPermille: 1100,
      radiusPermille: 850,
    },
    SKIRMISH: {
      attackPermille: 900,
      defensePermille: 850,
      speedPermille: 1100,
      rangedTakenPermille: 600,
      radiusPermille: 1400,
    },
  },
  units: {
    ...(Object.fromEntries(
      UNIT_TYPES.map((type) => [
        type,
        { kind: 'melee' as const, rangeCm: 0, meleePenaltyPermille: 1000, chargeBonusPermille: 0 },
      ]),
    ) as Record<UnitType, z.infer<typeof unitTacticalProfileSchema>>),
    militia: { kind: 'melee', rangeCm: 0, meleePenaltyPermille: 1000, chargeBonusPermille: 0 },
    spearman: { kind: 'melee', rangeCm: 0, meleePenaltyPermille: 1000, chargeBonusPermille: 0 },
    archer: { kind: 'ranged', rangeCm: 50 * M, meleePenaltyPermille: 400, chargeBonusPermille: 0 },
    cavalry: { kind: 'melee', rangeCm: 0, meleePenaltyPermille: 1000, chargeBonusPermille: 400 },
    priest: { kind: 'support', rangeCm: 0, meleePenaltyPermille: 0, chargeBonusPermille: 0 },
    imperial_guard: {
      kind: 'melee',
      rangeCm: 0,
      meleePenaltyPermille: 1000,
      chargeBonusPermille: 0,
    },
    naval_escort: { kind: 'melee', rangeCm: 0, meleePenaltyPermille: 1000, chargeBonusPermille: 0 },
  },
  arenas: [
    {
      id: 'plain',
      name: 'Llanura del Vado',
      widthCm: 200 * M,
      depthCm: 140 * M,
      cellCm: 4 * M,
      obstacles: [
        { shape: 'rect', kind: 'forest', x0: 0, z0: 30 * M, x1: 24 * M, z1: 110 * M },
        { shape: 'circle', kind: 'forest', x: 175 * M, z: 70 * M, r: 18 * M },
        { shape: 'circle', kind: 'rock', x: 70 * M, z: 72 * M, r: 9 * M },
        { shape: 'circle', kind: 'rock', x: 130 * M, z: 64 * M, r: 7 * M },
        { shape: 'circle', kind: 'water', x: 100 * M, z: 46 * M, r: 12 * M },
      ],
      hills: [
        { x: 50 * M, z: 25 * M, r: 30 * M, h: 4 * M },
        { x: 150 * M, z: 115 * M, r: 30 * M, h: 4 * M },
        { x: 100 * M, z: 95 * M, r: 22 * M, h: 2 * M },
      ],
      deploy: {
        ATTACKER: { zMin: 110 * M, zMax: 132 * M },
        DEFENDER: { zMin: 8 * M, zMax: 30 * M },
      },
      escapeMarginCm: 2 * M,
    },
  ],
  trainingArmies: [
    {
      id: 'balanced',
      name: 'Hueste equilibrada',
      stacks: [
        { unitType: 'militia', count: 120 },
        { unitType: 'spearman', count: 60 },
        { unitType: 'archer', count: 60 },
        { unitType: 'cavalry', count: 40 },
        { unitType: 'unique', count: 30 },
      ],
    },
    {
      id: 'cavalry_raid',
      name: 'Incursión montada',
      stacks: [
        { unitType: 'cavalry', count: 120 },
        { unitType: 'militia', count: 60 },
        { unitType: 'archer', count: 30 },
      ],
    },
    {
      id: 'archer_line',
      name: 'Línea de arqueros',
      stacks: [
        { unitType: 'archer', count: 180 },
        { unitType: 'spearman', count: 120 },
        { unitType: 'priest', count: 20 },
      ],
    },
    {
      id: 'large',
      name: 'Gran ejército (12 formaciones, benchmark)',
      stacks: [
        { unitType: 'militia', count: 240 },
        { unitType: 'spearman', count: 120 },
        { unitType: 'archer', count: 180 },
        { unitType: 'cavalry', count: 120 },
        { unitType: 'priest', count: 20 },
      ],
    },
  ],
};

const TACTICAL_REGISTRY: ReadonlyMap<string, TacticalRuleset> = new Map(
  [tacticalMvp2Alpha0].map((r) => [r.version, Object.freeze(r)]),
);

export const DEFAULT_TACTICAL_RULESET_VERSION = tacticalMvp2Alpha0.version;

export function getTacticalRuleset(version: string): TacticalRuleset {
  const r = TACTICAL_REGISTRY.get(version);
  if (!r) throw new Error(`Ruleset táctico desconocido: ${version}`);
  return r;
}

export function arenaDef(r: TacticalRuleset, id: string): ArenaDef {
  const a = r.arenas.find((x) => x.id === id);
  if (!a) throw new Error(`Escenario desconocido: ${id}`);
  return a;
}

export function validateTacticalRuleset(input: unknown): TacticalRuleset {
  const r = tacticalRulesetSchema.parse(input);
  const problems: string[] = [];
  for (const a of r.arenas) {
    if (a.widthCm % a.cellCm !== 0 || a.depthCm % a.cellCm !== 0)
      problems.push(`${a.id}: dimensiones no múltiplo de celda`);
    if (a.deploy.ATTACKER.zMin <= a.deploy.DEFENDER.zMax)
      problems.push(`${a.id}: franjas de despliegue solapadas`);
  }
  for (const army of r.trainingArmies) {
    const formations = army.stacks.reduce(
      (acc, s) => acc + Math.ceil(s.count / r.limits.formationMaxUnits),
      0,
    );
    if (formations > r.limits.maxFormationsPerSide)
      problems.push(`${army.id}: ${formations} formaciones > máximo`);
  }
  if (problems.length > 0)
    throw new Error(`Ruleset táctico ${r.version} inválido: ${problems.join('; ')}`);
  return r;
}

/** Resuelve `unique` a la unidad única de la civilización. */
export function resolveTrainingArmy(
  r: TacticalRuleset,
  armyId: string,
  uniqueUnit: UnitType,
): Array<{ unitType: UnitType; count: number }> {
  const army = r.trainingArmies.find((a) => a.id === armyId);
  if (!army) throw new Error(`Ejército de entrenamiento desconocido: ${armyId}`);
  return army.stacks.map((s) => ({
    unitType: s.unitType === 'unique' ? uniqueUnit : s.unitType,
    count: s.count,
  }));
}
