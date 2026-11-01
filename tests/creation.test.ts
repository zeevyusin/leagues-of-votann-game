import { describe, expect, it } from 'vitest';
import { creationChoose, finalStats, newDraft, type CreationDraft } from '../src/engine/creation';
import { maxHealth } from '../src/engine/rules';
import { data, draftFor, gameFor } from './helpers';

describe('final stats', () => {
  it('= starting 2 + class bonus + Ironkin grit + bonus points', () => {
    const stats = finalStats(data, draftFor('HERNKYN_PIONEER', 'IRONKIN', 'MALE', { grit: 2, craft: 1 }));
    // Pathfinder: +1 nerve, +1 wits. Ironkin: +1 grit.
    expect(stats).toEqual({ grit: 5, craft: 3, wits: 3, silver_tongue: 2, nerve: 3 });
  });

  it('never exceeds the stat max', () => {
    const d = draftFor('HEARTHKYN_WARRIOR', 'IRONKIN', 'MALE', { grit: 2 });
    expect(finalStats(data, d).grit).toBeLessThanOrEqual(data.config.STAT_MAX);
  });
});

describe('creation flow', () => {
  it('rejects empty and too-long names', () => {
    expect(creationChoose(data, newDraft(), 'name', '   ').draft.error).toBeTruthy();
    expect(creationChoose(data, newDraft(), 'name', 'x'.repeat(25)).draft.error).toBeTruthy();
    expect(creationChoose(data, newDraft(), 'name', '  Brokk  ').draft).toMatchObject({ name: 'Brokk', step: 'gender' });
  });

  it('changing base class resets the subclass and bonus points', () => {
    let d: CreationDraft = { ...draftFor('THEYN_KAPITAN'), step: 'class' };
    d = creationChoose(data, d, 'WARRIOR').draft;
    expect(d.subclass).toBeNull();
    expect(Object.values(d.bonus).every((v) => v === 0)).toBe(true);
  });

  it('caps bonus points per stat and blocks confirming with points left', () => {
    let d: CreationDraft = { ...draftFor('THEYN_KAPITAN', 'KIN', 'MALE', {}), step: 'bonus' };
    for (let i = 0; i < 3; i++) d = creationChoose(data, d, 'add:grit').draft;
    expect(d.bonus.grit).toBe(data.config.BONUS_MAX_PER_STAT);
    const blocked = creationChoose(data, d, 'done');
    expect(blocked.draft.step).toBe('bonus');
    d = creationChoose(data, d, 'add:wits').draft;
    expect(creationChoose(data, d, 'done').draft.step).toBe('confirm');
  });

  it('a subclass must belong to the chosen base class', () => {
    const d = { ...draftFor('THEYN_KAPITAN'), step: 'subclass' as const, subclass: null };
    expect(creationChoose(data, d, 'HERNKYN_PIONEER').draft.subclass).toBeNull();
  });
});

describe('new game', () => {
  it('Ironkin start with Wear 0, Kin have no Wear', () => {
    expect(gameFor('HEARTHKYN_WARRIOR', 'IRONKIN').character.wear).toBe(0);
    expect(gameFor('HEARTHKYN_WARRIOR', 'KIN').character.wear).toBeNull();
  });

  it('applies the base kit plus the subclass bonus', () => {
    const k = data.config.STARTING_KIT;
    const trader = gameFor('PROSPECTOR_TRADER');
    expect(trader.resources.ore).toBe(k.ore + 60);
    expect(trader.ship.cargo_capacity).toBe(k.cargo_capacity + 5);
    expect(gameFor('CTHONIAN_BERSERK').ship.hull_max).toBe(k.hull + 5);
    expect(gameFor('EINHYR_HEARTHGUARD').ship.modules.shields).toBe(2);
    expect(gameFor('ARKANYST_EVALUATOR').relics).toHaveLength(1);
    expect(gameFor('MEMNYR_STRATEGIST').discovered_systems).toContain('SNAZRIK_HAVEN');
    expect(gameFor('THEYN_KAPITAN').reputation.DURN_LEAGUE).toBe(20);
  });

  it('starts at full Health with the opening message unread', () => {
    const s = gameFor('HERNKYN_YAEGIR');
    expect(s.character.health).toBe(maxHealth(data.config, s.character));
    expect(s.inbox[0]).toMatchObject({ key: data.config.FIRST_MESSAGE, read: false });
  });
});
