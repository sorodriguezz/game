import {
  RESOURCE_KEYS,
  buildingDef,
  civilizationDef,
  type BuildingType,
  type CivilizationId,
  type ResourceBundle,
  type ResourceKey,
  type Ruleset,
  type UnitType,
  unitDef,
} from '@reinos/game-config';
import { MILLI, MS_PER_HOUR, ceilDiv, ceilGrowth, floorDiv, floorGrowth } from './fixed.js';

export type ResourceMap<T> = Record<ResourceKey, T>;

/**
 * Estado económico de una aldea (ADR-0004). Todo entero:
 * - `amounts`: milésimas de unidad.
 * - `remainders`: resto de producción en "milésimas·ms", en [0, MS_PER_HOUR).
 * - `rates`: milésimas por hora (el alimento puede ser negativo por mantenimiento).
 * - `capacity`: milésimas por recurso.
 */
export interface ResourceState {
  amounts: ResourceMap<bigint>;
  remainders: ResourceMap<bigint>;
  rates: ResourceMap<bigint>;
  capacity: bigint;
  foodCapacity?: bigint;
  lastSettledAt: number;
}

export function mapResources<T>(fn: (k: ResourceKey) => T): ResourceMap<T> {
  return { wood: fn('wood'), stone: fn('stone'), iron: fn('iron'), food: fn('food') };
}

export function bundleToMilli(b: ResourceBundle): ResourceMap<bigint> {
  return mapResources((k) => BigInt(b[k]) * MILLI);
}

export function milliToWholeUnits(m: ResourceMap<bigint>): ResourceBundle {
  return mapResources((k) => Number(floorDiv(m[k], MILLI)));
}

/**
 * Liquida la producción hasta `atMs`. Monótona: si `atMs` no es posterior a
 * `lastSettledAt`, devuelve el estado sin cambios (nunca retrocede el reloj).
 * Propiedad: settle(settle(s,t1),t2) == settle(s,t2) para t1 <= t2 con tasas fijas.
 */
export function settle(state: ResourceState, atMs: number): ResourceState {
  if (!Number.isInteger(atMs)) throw new RangeError('timestamp no entero');
  if (atMs <= state.lastSettledAt) return state;
  const elapsed = BigInt(atMs - state.lastSettledAt);
  const amounts = { ...state.amounts };
  const remainders = { ...state.remainders };
  for (const k of RESOURCE_KEYS) {
    const capacity = k === 'food' ? (state.foodCapacity ?? state.capacity) : state.capacity;
    const total = state.rates[k] * elapsed + state.remainders[k];
    const gained = floorDiv(total, MS_PER_HOUR);
    let rem = total - gained * MS_PER_HOUR;
    let amount = state.amounts[k] + gained;
    if (state.rates[k] >= 0n && amount >= capacity) {
      // En capacidad no se acumula producción (ni resto fraccionario); si ya
      // estaba por encima (p. ej. capacidad reducida) no se recorta.
      amount = state.amounts[k] > capacity ? state.amounts[k] : capacity;
      rem = 0n;
    }
    if (amount < 0n) {
      amount = 0n;
      rem = 0n;
    }
    amounts[k] = amount;
    remainders[k] = rem;
  }
  return { ...state, amounts, remainders, lastSettledAt: atMs };
}

/** Hambruna: sin alimentos y consumo neto negativo (FR-ECO-07). */
export function isStarving(state: ResourceState): boolean {
  return state.amounts.food === 0n && state.rates.food < 0n;
}

export function canAfford(state: ResourceState, costMilli: ResourceMap<bigint>): boolean {
  return RESOURCE_KEYS.every((k) => state.amounts[k] >= costMilli[k]);
}

/** Débito sobre un estado ya liquidado. Lanza si dejaría saldo negativo. */
export function debit(state: ResourceState, costMilli: ResourceMap<bigint>): ResourceState {
  if (!canAfford(state, costMilli)) throw new RangeError('saldo insuficiente');
  return { ...state, amounts: mapResources((k) => state.amounts[k] - costMilli[k]) };
}

/** Crédito limitado por capacidad; devuelve el estado y lo realmente acreditado. */
export function credit(
  state: ResourceState,
  amountMilli: ResourceMap<bigint>,
): { state: ResourceState; credited: ResourceMap<bigint> } {
  const credited = mapResources((k) => {
    const room =
      (k === 'food' ? (state.foodCapacity ?? state.capacity) : state.capacity) - state.amounts[k];
    const add = amountMilli[k];
    if (add <= 0n) return 0n;
    return room <= 0n ? 0n : add < room ? add : room;
  });
  return {
    state: { ...state, amounts: mapResources((k) => state.amounts[k] + credited[k]) },
    credited,
  };
}

// ---------------------------------------------------------------------------
// Tasas, capacidad, costes y tiempos
// ---------------------------------------------------------------------------

export interface BuildingLevel {
  plot?: number;
  type: BuildingType;
  level: number;
}

export function levelOf(buildings: readonly BuildingLevel[], type: BuildingType): number {
  return Math.max(0, ...buildings.filter((b) => b.type === type).map((b) => b.level));
}

/** Producción por hora (milésimas) de un edificio productor de nivel `level`. */
export function productionMilliPerHour(r: Ruleset, level: number): bigint {
  if (r.economy.fieldProductionByLevel)
    return BigInt(r.economy.fieldProductionByLevel[Math.max(0, level)] ?? 0) * MILLI;
  if (level <= 0) return 0n;
  const base = BigInt(r.economy.baseProductionPerHour) * BigInt(level) * MILLI;
  return floorGrowth(base, r.economy.productionGrowth, level - 1);
}

/** Mantenimiento de alimentos por hora (unidades) de un conjunto de tropas. */
export function upkeepPerHour(
  r: Ruleset,
  troops: ReadonlyArray<{ unitType: UnitType; quantity: number }>,
): number {
  return troops.reduce((acc, t) => acc + unitDef(r, t.unitType).foodUpkeepPerHour * t.quantity, 0);
}

/** Tasas netas por hora (milésimas). `upkeep` en unidades/hora. */
export function computeRates(
  r: Ruleset,
  buildings: readonly BuildingLevel[],
  upkeep: number,
  speed = 1,
): ResourceMap<bigint> {
  const base = BigInt(r.economy.villageBaseProductionPerHour) * MILLI;
  const rates = mapResources(() => base);
  if (r.economy.fieldProductionByLevel) {
    for (const plot of r.cityLayout.plots.filter((p) => p.kind === 'field')) {
      const building = buildings.find((b) => b.plot === plot.id),
        type = building?.type ?? plot.allowedTypes?.[0];
      const def = r.buildings.find((b) => b.type === type);
      if (def?.produces) rates[def.produces] += productionMilliPerHour(r, building?.level ?? 0);
    }
  }
  for (const b of buildings) {
    const def = buildingDef(r, b.type);
    if (!r.economy.fieldProductionByLevel && def.effect === 'production' && def.produces) {
      rates[def.produces] += productionMilliPerHour(r, b.level);
    }
  }
  for (const k of RESOURCE_KEYS) {
    const bonus = buildings.reduce((sum, b) => {
      const d = buildingDef(r, b.type);
      return (
        sum +
        (d.effect === 'processing' && d.produces === k
          ? (d.bonusPerLevelPermille ?? 0) * b.level
          : 0)
      );
    }, 0);
    rates[k] = (rates[k] * BigInt(1000 + bonus)) / 1000n;
  }
  if (r.territory) for (const k of RESOURCE_KEYS) rates[k] *= BigInt(speed);
  rates.food -=
    BigInt(upkeep + (r.economy.cropPopulation ? inhabitantsOf(r, buildings) : 0)) * MILLI;
  return rates;
}

/** Capacidad por recurso en milésimas según el nivel de almacén. */
export function inhabitantsOf(r: Ruleset, buildings: readonly BuildingLevel[]): number {
  return buildings.reduce(
    (sum, b) => sum + (buildingDef(r, b.type).populationByLevel?.[b.level] ?? 0),
    0,
  );
}
export function storageCapacity(
  r: Ruleset,
  buildings: readonly BuildingLevel[],
  type: 'warehouse' | 'granary',
): bigint {
  if (!r.economy.cropPopulation) return capacityMilli(r, levelOf(buildings, 'warehouse'));
  const stores = buildings.filter((b) => b.type === type && b.level > 0);
  return stores.length
    ? stores.reduce((sum, b) => sum + capacityMilli(r, b.level), 0n)
    : capacityMilli(r, 0);
}

export function capacityMilli(r: Ruleset, warehouseLevel: number): bigint {
  if (warehouseLevel <= 0) return BigInt(r.economy.baseCapacity) * MILLI;
  return (
    floorGrowth(
      BigInt(r.economy.warehouseCapacityBase),
      r.economy.warehouseCapacityGrowth,
      warehouseLevel - 1,
    ) * MILLI
  );
}

export function populationCapacity(r: Ruleset, cityHallLevel: number): number {
  if (cityHallLevel <= 0) return 0;
  return Number(
    floorGrowth(BigInt(r.population.cityHallBase), r.population.cityHallGrowth, cityHallLevel - 1),
  );
}

/** Coste (unidades enteras) de subir `type` a `level`. */
export function buildingCost(
  r: Ruleset,
  type: BuildingType,
  level: number,
  civ: CivilizationId,
): ResourceBundle {
  const def = buildingDef(r, type);
  const modifier = type === 'wall' ? civilizationDef(r, civ).modifiers.wallCostPermille : 1000;
  return mapResources((k) => {
    const raw = ceilGrowth(BigInt(def.baseCost[k]), r.economy.buildingCostGrowth, level - 1);
    return Number(ceilDiv(raw * BigInt(modifier), 1000n));
  });
}

/** Duración en segundos de subir `type` a `level` con la velocidad del mundo. */
export function buildingSeconds(
  r: Ruleset,
  type: BuildingType,
  level: number,
  speed: number,
): number {
  const def = buildingDef(r, type);
  const raw = ceilGrowth(BigInt(def.baseSeconds), r.economy.buildingTimeGrowth, level - 1);
  return Math.max(1, Number(ceilDiv(raw, BigInt(speed))));
}

export function unitCost(r: Ruleset, unitType: UnitType, quantity: number): ResourceBundle {
  const def = unitDef(r, unitType);
  return mapResources((k) => def.cost[k] * quantity);
}

export function unitTrainingSeconds(r: Ruleset, unitType: UnitType, speed: number): number {
  return Math.max(1, Math.ceil(unitDef(r, unitType).trainingSeconds / speed));
}

export function populationOf(
  r: Ruleset,
  troops: ReadonlyArray<{ unitType: UnitType; quantity: number }>,
): number {
  return troops.reduce((acc, t) => acc + unitDef(r, t.unitType).population * t.quantity, 0);
}
