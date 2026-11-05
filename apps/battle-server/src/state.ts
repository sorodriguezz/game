import { schema, t } from '@colyseus/schema';

/**
 * Estado sincronizado de la sala (@colyseus/schema 5). Solo lo necesario para
 * dibujar: el servidor es la única autoridad. `formations` usa `.view()`:
 * cada cliente recibe sus formaciones y SOLO las enemigas visibles (niebla de
 * guerra, NET-007/NET-014). El destino de las órdenes de movimiento no se
 * sincroniza para no filtrar planes.
 */
export const FormationState = schema(
  {
    id: t.string(),
    side: t.string(),
    unitType: t.string(),
    count: t.uint16(),
    initialCount: t.uint16(),
    morale: t.uint16(),
    x: t.int32(),
    z: t.int32(),
    fx: t.int16(),
    fz: t.int16(),
    preset: t.string(),
    status: t.string(),
    targetId: t.string(),
  },
  'FormationState',
);
export type FormationStateT = InstanceType<typeof FormationState>;

export const BattleState = schema(
  {
    encounterId: t.string(),
    mode: t.string(),
    terrainId: t.string(),
    tacticalRulesetVersion: t.string(),
    phase: t.string(),
    tick: t.uint32(),
    prepareTicks: t.uint32(),
    maxTicks: t.uint32(),
    tickHz: t.uint8(),
    waitingForPlayers: t.boolean(),
    attackerName: t.string(),
    defenderName: t.string(),
    attackerCiv: t.string(),
    defenderCiv: t.string(),
    attackerControl: t.string(),
    defenderControl: t.string(),
    attackerConnected: t.boolean(),
    defenderConnected: t.boolean(),
    winner: t.string(),
    endReason: t.string(),
    resultStatus: t.string(),
    formations: t.map(FormationState).view(),
  },
  'BattleState',
);
export type BattleStateT = InstanceType<typeof BattleState>;
