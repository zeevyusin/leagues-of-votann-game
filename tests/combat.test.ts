import { describe, expect, it } from 'vitest';
import {
  personalRound,
  shipRound,
  startCombat,
  validShieldChoices,
  validWeaponChoices,
} from '../src/engine/combat';
import { ScriptedRng } from '../src/engine/rng';
import { reactorPips } from '../src/engine/rules';
import type { PersonalCombat, ShipCombat } from '../src/engine/types';
import { ctxWith, data, gameFor } from './helpers';

const cfg = data.config;
/** Health lost to a failure (natural 1) against the dig-site's first enemy, before stance and passives. */
const digDamage = () => cfg.COMBAT_DAMAGE_TABLE.failure[1] + data.enemies.find((e) => e.key === 'ORK_BOYZ_MOB')!.damage_bonus;

/** Starts the Act 1 dig-site fight, then forces the enemy's intent and a clear read. */
function personalSetup(subclass: string, kin: 'KIN' | 'IRONKIN' = 'KIN') {
  const state = gameFor(subclass, kin);
  const combat = startCombat(state, ctxWith(new ScriptedRng([0.5])), 'A1_DIG_SITE_RAID', null) as PersonalCombat;
  combat.intent = 'aggressive';
  combat.read = 'clear';
  return { state, combat };
}

describe('personal combat', () => {
  it('a failure deals 0 and takes the failure damage (+1 for Attack)', () => {
    const { state, combat } = personalSetup('HERNKYN_PIONEER');
    const hp = state.character.health;
    personalRound(state, ctxWith(new ScriptedRng([0])), combat, 'attack');
    expect(combat.enemy.resolve).toBe(combat.enemy.resolve_max);
    expect(state.character.health).toBe(hp - digDamage() - cfg.COMBAT_ATTACK_TAKEN_PENALTY);
  });

  it('Defend vs Aggressive gets the matched-counter bonus and reduces damage', () => {
    const { state, combat } = personalSetup('HERNKYN_PIONEER');
    // die 1 -> natural 1 failure: failure damage, Defend reduces it
    const hp = state.character.health;
    const out = personalRound(state, ctxWith(new ScriptedRng([0])), combat, 'defend');
    expect(state.character.health).toBe(hp - (digDamage() - cfg.COMBAT_DEFEND_REDUCTION));
    expect(out.lines[0].text).toContain(`Matched counter +${cfg.COMBAT_MATCHED_BONUS}`);
  });

  it('Hold the Line reduces damage by 1 for Kin Warriors', () => {
    const { state, combat } = personalSetup('HEARTHKYN_WARRIOR');
    const hp = state.character.health;
    personalRound(state, ctxWith(new ScriptedRng([0])), combat, 'attack');
    expect(state.character.health).toBe(hp - (digDamage() + cfg.COMBAT_ATTACK_TAKEN_PENALTY - cfg.HOLD_THE_LINE_REDUCTION));
  });

  it('Plated Bulwark reduces by 2 and adds Wear for Ironkin Warriors', () => {
    const { state, combat } = personalSetup('HEARTHKYN_WARRIOR', 'IRONKIN');
    const hp = state.character.health;
    personalRound(state, ctxWith(new ScriptedRng([0])), combat, 'attack');
    // Wear = bulwark wear + Wear per point of Health actually lost
    const taken = digDamage() + cfg.COMBAT_ATTACK_TAKEN_PENALTY - cfg.PLATED_BULWARK_REDUCTION;
    expect(state.character.health).toBe(hp - taken);
    expect(state.character.wear).toBe(cfg.PLATED_BULWARK_WEAR_PER_HIT + taken * cfg.COMBAT_WEAR_PER_HEALTH_DAMAGE);
  });

  it('a critical Attack deals 3 + 1 and takes nothing', () => {
    const { state, combat } = personalSetup('HERNKYN_PIONEER');
    combat.enemy.resolve = combat.enemy.resolve_max = 10;
    const hp = state.character.health;
    personalRound(state, ctxWith(new ScriptedRng([0.999])), combat, 'attack');
    expect(combat.enemy.resolve_max - combat.enemy.resolve).toBe(4);
    expect(state.character.health).toBe(hp);
  });

  it('Outmaneuver success grants Advantage', () => {
    const { state, combat } = personalSetup('HERNKYN_PIONEER');
    combat.intent = 'guarded';
    personalRound(state, ctxWith(new ScriptedRng([0.999])), combat, 'outmaneuver');
    expect(combat.advantage).toBe(true);
  });

  it('Negotiate is refused against an enemy that will not talk', () => {
    const { state, combat } = personalSetup('THEYN_KAPITAN');
    expect(() => personalRound(state, ctxWith(new ScriptedRng([0.5])), combat, 'negotiate')).toThrow();
  });

  it('breaking every enemy ends in victory, and the last stance decides broken vs negotiated', () => {
    const { state, combat } = personalSetup('THEYN_KAPITAN');
    let result = null;
    let guard = 0;
    while (!result && guard++ < 50) {
      const stance = combat.enemy.key === 'NOB_GRIZZGUT_1' ? 'negotiate' : 'attack';
      result = personalRound(state, ctxWith(new ScriptedRng([0.999])), combat, stance).result;
    }
    expect(result).toBe('victory_negotiated');
  });

  it('Health reaching 0 ends in defeat', () => {
    const { state, combat } = personalSetup('HERNKYN_PIONEER');
    state.character.health = 1;
    expect(personalRound(state, ctxWith(new ScriptedRng([0])), combat, 'attack').result).toBe('defeat');
  });
});

describe('ship combat', () => {
  it('the starting 6 pips can always be fully spent within level-1 caps', () => {
    const state = gameFor('HERNKYN_PIONEER');
    const pips = reactorPips(cfg, state.ship);
    expect(pips).toBe(6);
    const ctx = ctxWith(new ScriptedRng([0.5]));
    for (const w of validWeaponChoices(state, ctx)) {
      const shields = validShieldChoices(state, ctx, w);
      expect(shields.length).toBeGreaterThan(0);
      for (const s of shields) expect(pips - w - s).toBeLessThanOrEqual(3);
    }
  });

  it('reactor upgrades add a pip per level', () => {
    const state = gameFor('HERNKYN_PIONEER');
    state.ship.modules.reactor = 3;
    expect(reactorPips(cfg, state.ship)).toBe(8);
  });

  it('a failure deals nothing and takes incoming - shields + 1', () => {
    const state = gameFor('HERNKYN_PIONEER');
    const ctx = ctxWith(new ScriptedRng([0]));
    const combat = startCombat(state, ctx, 'A1_RAIDER_ESCAPE', null) as ShipCombat;
    combat.enemy_alloc = { weapons: 4, shields: 1, engines: 1 };
    const hull = state.ship.hull;
    shipRound(state, ctx, combat, { weapons: 3, shields: 2, engines: 1 });
    expect(combat.enemy.hull).toBe(combat.enemy.hull_max);
    expect(state.ship.hull).toBe(hull - 3);
  });

  it('a critical deals double weapons, minus enemy shields, and takes nothing', () => {
    const state = gameFor('HERNKYN_PIONEER');
    const combat = startCombat(state, ctxWith(new ScriptedRng([0.5])), 'A1_RAIDER_ESCAPE', null) as ShipCombat;
    // Equal engines (0 vs 0): the range stays Medium, so no range modifier.
    combat.enemy_alloc = { weapons: 4, shields: 1, engines: 0 };
    const hull = state.ship.hull;
    shipRound(state, ctxWith(new ScriptedRng([0.999])), combat, { weapons: 3, shields: 3, engines: 0 });
    expect(combat.enemy.hull_max - combat.enemy.hull).toBe(3 * 2 - 1);
    expect(state.ship.hull).toBe(hull);
  });

  it("enemy engines raise the difficulty to hit them", () => {
    const state = gameFor('HERNKYN_PIONEER');
    const ctx = ctxWith(new ScriptedRng([0.5]));
    const combat = startCombat(state, ctx, 'A1_RAIDER_ESCAPE', null) as ShipCombat;
    combat.enemy_alloc = { weapons: 1, shields: 0, engines: 5 };
    const rolls: unknown[] = [];
    shipRound(state, { ...ctxWith(new ScriptedRng([0.5])), rolls: rolls as never[] }, combat, { weapons: 3, shields: 0, engines: 3 });
    const raider = data.enemy_ships.find((x) => x.key === 'ORK_RAIDER')!;
    expect((rolls[0] as { difficulty: number }).difficulty).toBe(raider.defense_difficulty + 5);
  });

  it('rejects allocations that leave pips unspent or break a cap', () => {
    const state = gameFor('HERNKYN_PIONEER');
    const ctx = ctxWith(new ScriptedRng([0.5]));
    const combat = startCombat(state, ctx, 'A1_RAIDER_ESCAPE', null) as ShipCombat;
    expect(() => shipRound(state, ctx, combat, { weapons: 3, shields: 2, engines: 0 })).toThrow();
    expect(() => shipRound(state, ctx, combat, { weapons: 4, shields: 2, engines: 0 })).toThrow();
  });
});
