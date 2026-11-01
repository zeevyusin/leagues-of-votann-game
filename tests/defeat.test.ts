import { describe, expect, it } from 'vitest';
import { applyDefeat, nearestRouteFuel } from '../src/engine/defeat';
import { maxHealth } from '../src/engine/rules';
import { ScriptedRng } from '../src/engine/rng';
import { ctxWith, data, gameFor } from './helpers';

const cfg = data.config;

describe('defeat safety rules', () => {
  it('never takes Ore below the floor', () => {
    const state = gameFor('HERNKYN_PIONEER');
    state.resources.ore = 30;
    applyDefeat(state, ctxWith(new ScriptedRng([0.999])), { cause: 'combat' });
    expect(state.resources.ore).toBeGreaterThanOrEqual(Math.min(30, cfg.DEFEAT_ORE_FLOOR));
  });

  it('loses 20-40% of Ore above the floor', () => {
    const state = gameFor('HERNKYN_PIONEER');
    state.resources.ore = 1000;
    applyDefeat(state, ctxWith(new ScriptedRng([0.999])), { cause: 'combat' });
    expect(state.resources.ore).toBeGreaterThanOrEqual(600);
    expect(state.resources.ore).toBeLessThanOrEqual(800);
  });

  it('always leaves enough fuel to reach the nearest system', () => {
    const state = gameFor('HERNKYN_PIONEER');
    state.resources.fuel = 0;
    applyDefeat(state, ctxWith(new ScriptedRng([0.5])), { cause: 'combat' });
    expect(state.resources.fuel).toBeGreaterThanOrEqual(nearestRouteFuel(state, ctxWith(new ScriptedRng([0]))));
  });

  it('never takes mission cargo', () => {
    const state = gameFor('HERNKYN_PIONEER');
    state.cargo.push({ key: 'VAULT_RUBBINGS', qty: 1 });
    applyDefeat(state, ctxWith(new ScriptedRng([0.5])), { cause: 'combat' });
    expect(state.cargo.find((c) => c.key === 'VAULT_RUBBINGS')?.qty).toBe(1);
  });

  it('never removes a protected crew member', () => {
    const state = gameFor('HERNKYN_PIONEER');
    for (let i = 0; i < 20; i++) applyDefeat(state, ctxWith(new ScriptedRng([0])), { cause: 'combat' });
    expect(state.crew).toContain('DORRIK');
  });

  it('restores Health and Hull to half, resets Wear to 50, and grants a grace journey', () => {
    const state = gameFor('HEARTHKYN_WARRIOR', 'IRONKIN');
    state.character.health = 0;
    state.ship.hull = 0;
    state.character.wear = 100;
    applyDefeat(state, ctxWith(new ScriptedRng([0.5])), { cause: 'combat' });
    expect(state.character.health).toBe(Math.ceil(maxHealth(cfg, state.character) / 2));
    expect(state.ship.hull).toBe(Math.ceil(state.ship.hull_max / 2));
    expect(state.character.wear).toBe(cfg.DEFEAT_WEAR_RESET);
    expect(state.grace_journeys).toBe(1);
  });
});
