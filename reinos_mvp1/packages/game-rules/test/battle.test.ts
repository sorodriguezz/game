import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULESET_VERSION,
  UNIT_TYPES,
  getRuleset,
  type UnitType,
} from '@reinos/game-config';
import {
  RulesetMismatchError,
  resolveBattle,
  type BattleSnapshot,
  type UnitStack,
} from '../src/index.js';

const r = getRuleset(DEFAULT_RULESET_VERSION);

function snapshot(over: Partial<BattleSnapshot> = {}): BattleSnapshot {
  return {
    battleId: 'b-1',
    worldId: 'w-1',
    seed: 'seed-1',
    rulesetVersion: r.version,
    mission: 'ATTACK',
    attacker: { civilization: 'imperial_crown', units: [{ unitType: 'militia', quantity: 100 }] },
    defender: {
      civilization: 'sea_league',
      units: [{ unitType: 'spearman', quantity: 30 }],
      doctrine: { reservePercent: 0, retreatThresholdPercent: null },
    },
    defenses: { wallLevel: 0, bastionLevel: 0, hospitalLevel: 0 },
    terrain: { kind: 'PLAIN' },
    defenderResources: { wood: 1000, stone: 1000, iron: 1000, food: 1000 },
    ...over,
  };
}

const total = (s: UnitStack[]) => s.reduce((a, x) => a + x.quantity, 0);
const qty = (s: UnitStack[], t: UnitType) => s.find((x) => x.unitType === t)?.quantity ?? 0;

describe('resolveBattle — determinismo (NFR-11, ADR-0005)', () => {
  it('misma entrada + semilla + versión ⇒ resultado idéntico', () => {
    const a = resolveBattle(r, snapshot());
    const b = resolveBattle(r, structuredClone(snapshot()));
    expect(b).toEqual(a);
    // Serializable y estable para auditoría.
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('el resultado es una instantánea conocida (detecta cambios de reglas no versionados)', () => {
    const res = resolveBattle(r, snapshot());
    expect({
      outcome: res.outcome,
      powers: res.powers,
      lost: res.attacker.lost,
      killed: res.defender.killed,
      loot: res.loot,
    }).toMatchInlineSnapshot(`
      {
        "killed": [
          {
            "quantity": 30,
            "unitType": "spearman",
          },
        ],
        "loot": {
          "food": 710,
          "iron": 710,
          "stone": 710,
          "wood": 710,
        },
        "lost": [
          {
            "quantity": 29,
            "unitType": "militia",
          },
        ],
        "outcome": "ATTACKER",
        "powers": {
          "attack": 2048,
          "attackerMoralePermille": 0,
          "defenderMoralePermille": 0,
          "defense": 910,
          "luckPermille": 24,
          "wallPermille": 0,
        },
      }
    `);
  });

  it('rechaza ejecutar con un ruleset distinto al del snapshot', () => {
    expect(() => resolveBattle(r, snapshot({ rulesetVersion: 'otra' }))).toThrow(
      RulesetMismatchError,
    );
  });

  it('propiedad: conservación de tropas y botín acotado', () => {
    const stack = fc.record({
      unitType: fc.constantFrom(...UNIT_TYPES),
      quantity: fc.integer({ min: 0, max: 5000 }),
    });
    fc.assert(
      fc.property(
        fc.array(stack, { maxLength: 6 }),
        fc.array(stack, { maxLength: 6 }),
        fc.string(),
        fc.constantFrom('ATTACK' as const, 'RAID' as const),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 50 }),
        fc.option(fc.integer({ min: 100, max: 1000 }), { nil: null }),
        (att, def, seed, mission, wall, hospital, reserve, retreat) => {
          const snap = snapshot({
            seed,
            mission,
            attacker: { civilization: 'imperial_crown', units: att },
            defender: {
              civilization: 'sea_league',
              units: def,
              doctrine: { reservePercent: reserve, retreatThresholdPercent: retreat },
            },
            defenses: { wallLevel: wall, bastionLevel: 0, hospitalLevel: hospital },
          });
          const res = resolveBattle(r, snap);
          expect(resolveBattle(r, snap)).toEqual(res);
          for (const t of UNIT_TYPES) {
            const sent = qty(res.attacker.sent, t);
            expect(qty(res.attacker.lost, t) + qty(res.attacker.survivors, t)).toBe(sent);
            const present = qty(res.defender.present, t);
            expect(
              qty(res.defender.killed, t) +
                qty(res.defender.wounded, t) +
                qty(res.defender.survivors, t),
            ).toBe(present);
            expect(qty(res.defender.survivors, t)).toBeGreaterThanOrEqual(
              qty(res.defender.reserve, t),
            );
          }
          const lootTotal = res.loot.wood + res.loot.stone + res.loot.iron + res.loot.food;
          expect(lootTotal).toBeLessThanOrEqual(res.carryCapacity);
          for (const k of ['wood', 'stone', 'iron', 'food'] as const) {
            expect(res.loot[k]).toBeLessThanOrEqual(snap.defenderResources[k]);
            expect(res.loot[k]).toBeGreaterThanOrEqual(0);
          }
          if (res.outcome === 'DEFENDER') expect(lootTotal).toBe(0);
          // Los hitos reparten exactamente las bajas registradas.
          const phaseLosses = res.milestones
            .filter((m) => m.kind === 'PHASE')
            .flatMap((m) => (m.kind === 'PHASE' ? m.losses : []));
          const attPhase = phaseLosses
            .filter((l) => l.side === 'ATTACKER')
            .reduce((a, l) => a + l.count, 0);
          expect(attPhase).toBe(total(res.attacker.lost));
        },
      ),
      { numRuns: 250 },
    );
  });
});

describe('resolveBattle — reglas', () => {
  it('ataque sobre aldea vacía: gana el atacante sin bajas relevantes y saquea', () => {
    const res = resolveBattle(
      r,
      snapshot({
        defender: {
          civilization: 'sea_league',
          units: [],
          doctrine: { reservePercent: 0, retreatThresholdPercent: null },
        },
      }),
    );
    expect(res.outcome).toBe('ATTACKER');
    expect(total(res.attacker.lost)).toBeLessThan(10);
    // 10 % protegido del botín
    expect(res.loot.wood).toBe(900);
  });

  it('la muralla aumenta la defensa', () => {
    const noWall = resolveBattle(r, snapshot());
    const wall = resolveBattle(
      r,
      snapshot({ defenses: { wallLevel: 10, bastionLevel: 0, hospitalLevel: 0 } }),
    );
    expect(wall.powers.defense).toBeGreaterThan(noWall.powers.defense);
  });

  it('los lanceros defienden mejor contra caballería que contra infantería', () => {
    const vsInf = resolveBattle(
      r,
      snapshot({
        attacker: {
          civilization: 'imperial_crown',
          units: [{ unitType: 'militia', quantity: 100 }],
        },
      }),
    );
    const vsCav = resolveBattle(
      r,
      snapshot({
        attacker: {
          civilization: 'imperial_crown',
          units: [{ unitType: 'cavalry', quantity: 27 }],
        },
      }),
    );
    expect(vsCav.powers.defense).toBeGreaterThan(vsInf.powers.defense);
  });

  it('defensor gana cuando el ataque es inferior y el atacante pierde todo (ATTACK)', () => {
    const res = resolveBattle(
      r,
      snapshot({
        attacker: { civilization: 'imperial_crown', units: [{ unitType: 'militia', quantity: 5 }] },
        defender: {
          civilization: 'sea_league',
          units: [{ unitType: 'spearman', quantity: 100 }],
          doctrine: { reservePercent: 0, retreatThresholdPercent: null },
        },
      }),
    );
    expect(res.outcome).toBe('DEFENDER');
    expect(total(res.attacker.survivors)).toBe(0);
    expect(res.loot).toEqual({ wood: 0, stone: 0, iron: 0, food: 0 });
  });

  it('en saqueo (RAID) el atacante derrotado puede sobrevivir parcialmente', () => {
    const res = resolveBattle(
      r,
      snapshot({
        mission: 'RAID',
        attacker: {
          civilization: 'imperial_crown',
          units: [{ unitType: 'militia', quantity: 60 }],
        },
        defender: {
          civilization: 'sea_league',
          units: [{ unitType: 'spearman', quantity: 60 }],
          doctrine: { reservePercent: 0, retreatThresholdPercent: null },
        },
      }),
    );
    expect(total(res.attacker.survivors)).toBeGreaterThan(0);
  });

  it('doctrina: la reserva no combate y sobrevive íntegra', () => {
    const res = resolveBattle(
      r,
      snapshot({
        attacker: {
          civilization: 'imperial_crown',
          units: [{ unitType: 'cavalry', quantity: 500 }],
        },
        defender: {
          civilization: 'sea_league',
          units: [{ unitType: 'spearman', quantity: 100 }],
          doctrine: { reservePercent: 40, retreatThresholdPercent: null },
        },
      }),
    );
    expect(res.outcome).toBe('ATTACKER');
    expect(qty(res.defender.reserve, 'spearman')).toBe(40);
    expect(qty(res.defender.survivors, 'spearman')).toBe(40);
  });

  it('doctrina: retirada ante fuerza abrumadora preserva las tropas', () => {
    const res = resolveBattle(
      r,
      snapshot({
        attacker: {
          civilization: 'imperial_crown',
          units: [{ unitType: 'cavalry', quantity: 1000 }],
        },
        defender: {
          civilization: 'sea_league',
          units: [{ unitType: 'militia', quantity: 50 }],
          doctrine: { reservePercent: 0, retreatThresholdPercent: 300 },
        },
      }),
    );
    expect(res.defender.retreated).toBe(true);
    expect(qty(res.defender.survivors, 'militia')).toBe(50);
    expect(res.milestones.some((m) => m.kind === 'RETREAT')).toBe(true);
  });

  it('hospital convierte parte de las bajas defensivas en heridos; sin hospital no hay heridos', () => {
    const big = {
      civilization: 'imperial_crown' as const,
      units: [{ unitType: 'cavalry' as const, quantity: 400 }],
    };
    const without = resolveBattle(r, snapshot({ attacker: big }));
    const withH = resolveBattle(
      r,
      snapshot({ attacker: big, defenses: { wallLevel: 0, bastionLevel: 0, hospitalLevel: 5 } }),
    );
    expect(total(without.defender.wounded)).toBe(0);
    expect(total(withH.defender.wounded)).toBeGreaterThan(0);
  });

  it('sacerdotes aportan bonificación acotada (máx. 6 %)', () => {
    const res = resolveBattle(
      r,
      snapshot({
        attacker: {
          civilization: 'imperial_crown',
          units: [
            { unitType: 'militia', quantity: 100 },
            { unitType: 'priest', quantity: 50 },
          ],
        },
      }),
    );
    expect(res.powers.attackerMoralePermille).toBe(60);
  });
});
