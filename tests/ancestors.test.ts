// The Ancestors' Eye: the three difficulty levels, how they change rolls, reads, Fatigue and Supplies,
// and how they reach new games and old saves.
import { describe, expect, it } from 'vitest';
import { creationChoose, creationView, newDraft } from '../src/engine/creation';
import { startCombat } from '../src/engine/combat';
import { setAncestorsEye } from '../src/engine/game';
import { generalModifiers } from '../src/engine/rules';
import { ScriptedRng } from '../src/engine/rng';
import { passDay } from '../src/engine/travel';
import { migrateState, type AncestorsEye, type GameState, type PersonalCombat } from '../src/engine/types';
import { ctxWith, data, draftFor, gameFor } from './helpers';

const at = (eye: AncestorsEye): GameState => setAncestorsEye(gameFor('HEARTHKYN_WARRIOR'), eye);
const eyeMod = (s: GameState) => generalModifiers(s, data, 'grit', 'story').find((m) => m.label.startsWith("The Ancestors' Eye"));

describe("The Ancestors' Eye", () => {
  it('starts on Weighed, which changes nothing', () => {
    const s = gameFor('HEARTHKYN_WARRIOR');
    expect(s.ancestors_eye).toBe('WEIGHED');
    expect(eyeMod(s)).toBeUndefined();
  });

  it('gives every roll +2 on Favoured and -2 on Judged, in every context', () => {
    expect(eyeMod(at('FAVOURED'))).toEqual({ label: "The Ancestors' Eye (Favoured)", value: 2 });
    expect(eyeMod(at('JUDGED'))).toEqual({ label: "The Ancestors' Eye (Judged)", value: -2 });
    for (const context of ['story', 'personal', 'ship'] as const)
      expect(generalModifiers(at('JUDGED'), data, 'nerve', context).some((m) => m.value === -2 && m.label.includes('Judged')), context).toBe(true);
  });

  it('makes enemies harder to read on Judged', () => {
    // A die of 11 (0.5 on the scripted dice) with Wits 2 reads a Boyz mob (read difficulty 10) on Weighed, but not on Judged.
    const read = (eye: AncestorsEye) => {
      const s = at(eye);
      s.character.stats.wits = 2;
      return (startCombat(s, ctxWith(new ScriptedRng([0.5])), 'A1_DIG_SITE_RAID', null) as PersonalCombat).read;
    };
    expect(read('WEIGHED')).toBe('clear');
    expect(read('JUDGED')).toBe('vague');
  });

  it('moves Fatigue later on Favoured and sooner on Judged', () => {
    const fatiguedAfter = (eye: AncestorsEye) => {
      const s = at(eye);
      s.character.kin_type = 'KIN';
      s.resources.supplies = 999;
      for (let day = 1; day <= 20; day++) {
        passDay(s, ctxWith(new ScriptedRng([0.5])));
        if (s.character.fatigued) return day;
      }
      return Infinity;
    };
    const base = data.config.FATIGUE_DAYS;
    expect(fatiguedAfter('WEIGHED')).toBe(base + 1);
    expect(fatiguedAfter('FAVOURED')).toBe(base + 1 + data.config.ANCESTORS_EYE.FAVOURED.fatigue_days);
    expect(fatiguedAfter('JUDGED')).toBe(base + 1 + data.config.ANCESTORS_EYE.JUDGED.fatigue_days);
  });

  it('makes the crew eat less on Favoured', () => {
    const eaten = (eye: AncestorsEye) => {
      const s = at(eye);
      s.crew = ['DORRIK', 'YLSA', 'BROKKA'];
      s.resources.supplies = 100;
      passDay(s, ctxWith(new ScriptedRng([0.5])));
      return 100 - s.resources.supplies;
    };
    expect(eaten('FAVOURED')).toBeLessThan(eaten('WEIGHED'));
    expect(eaten('JUDGED')).toBe(eaten('WEIGHED'));
  });

  it('can be changed at any time without touching anything else', () => {
    const s = gameFor('HEARTHKYN_WARRIOR');
    const judged = setAncestorsEye(s, 'JUDGED');
    expect(judged.ancestors_eye).toBe('JUDGED');
    expect(s.ancestors_eye).toBe('WEIGHED');
    expect({ ...judged, ancestors_eye: 'WEIGHED' }).toEqual(s);
  });

  it('is chosen in character creation, after bonus points', () => {
    let d = { ...draftFor('HEARTHKYN_WARRIOR'), step: 'bonus' as const, bonus: { grit: 1, craft: 1, wits: 1, silver_tongue: 0, nerve: 0 } };
    d = creationChoose(data, d, 'done').draft as typeof d;
    expect(d.step).toBe('eye');
    expect(creationView(data, d).options.map((o) => o.id)).toEqual(['FAVOURED', 'WEIGHED', 'JUDGED', 'back']);
    const chosen = creationChoose(data, d, 'JUDGED').draft;
    expect(chosen.step).toBe('confirm');
    expect(chosen.ancestors_eye).toBe('JUDGED');
    expect(newDraft().ancestors_eye).toBe('WEIGHED');
  });

  it('gives saves from before difficulty levels the Weighed level', () => {
    const old = structuredClone(gameFor('HEARTHKYN_WARRIOR')) as Partial<GameState>;
    delete old.ancestors_eye;
    old.version = 4;
    const migrated = migrateState(old as GameState);
    expect(migrated.ancestors_eye).toBe('WEIGHED');
    expect(migrated.version).toBe(5);
  });
});
