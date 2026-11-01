// Plays Act 1 start to finish through the same applyChoice/buildView the UI uses.
import { describe, expect, it } from 'vitest';
import { applyChoice, buildView } from '../src/engine/game';
import { beatOf, routeToSystem } from './playthroughPolicy';
import { alwaysLow, data, gameFor } from './helpers';
import type { Rng } from '../src/engine/rng';
import type { GameState, KinType } from '../src/engine/types';

type Pick = 'first' | 'last';

/** A simple player: answers orders, flies to the objective, and picks routes and stances. */
function play(start: GameState, pick: Pick, rng?: () => Rng, onState?: (s: GameState) => void): GameState {
  let state = start;
  for (let step = 0; step < 400; step++) {
    if (state.story.acts_completed.includes(1) && state.scenes.length === 1) return state;
    onState?.(state);
    const view = buildView(state, data);
    const top = state.scenes[state.scenes.length - 1];
    let id: string;
    let text: string | undefined;

    if (view.input) {
      id = view.input.id;
      text = 'Test Hauler';
    } else if (top.type === 'hub') {
      const beat = state.story.current_beat ? beatOf(state.story.current_beat) : null;
      if (beat?.trigger === 'comms') {
        id = top.tab === 'comms' ? `msg:${data.messages.find((m) => m.beat === beat.key)!.key}` : 'tab:comms';
      } else if (beat?.trigger === 'arrival') {
        id = top.tab === 'nav' ? `go:${routeToSystem(state, beat.location!)}` : 'tab:nav';
      } else throw new Error(`Stuck at hub with beat ${state.story.current_beat}`);
    } else {
      const open = view.options.filter((o) => !o.locked);
      if (!open.length) throw new Error(`No open options on ${view.kind}: ${view.title}`);
      // "last" only changes which story route is taken; everywhere else, take the first option.
      id = (pick === 'last' && top.type === 'beat' ? open[open.length - 1] : open[0]).id;
    }
    state = applyChoice(state, data, id, text, rng?.());
  }
  throw new Error('Act 1 did not finish within 400 choices');
}

const kins: KinType[] = ['KIN', 'IRONKIN'];

describe('Act 1 playthrough', () => {
  for (const sub of data.subclasses)
    for (const kin of kins) {
      it(`${sub.key} (${kin}) finishes Act 1 taking the first routes`, () => {
        const end = play(gameFor(sub.key, kin, 99), 'first');
        expect(end.story.completed_beats.map((b) => b.key)).toEqual([
          'A1_B1_THE_SURVEY',
          'A1_B2_FIRE_ON_THE_ANVIL',
          'A1_B3_BREAKING_ORBIT',
          'A1_B4_KARRAK_STATION',
        ]);
        expect(end.grudges.map((g) => g.key)).toContain('GRUDGE_SKRAGNAK');
        expect(end.oaths.map((o) => o.key)).toContain('OATH_BROKEN_FLEET');
        expect(end.story.waaagh_meter).not.toBeNull();
        expect(end.ship.name).toBe('Test Hauler');
      });

      it(`${sub.key} (${kin}) finishes Act 1 even when every roll fails`, () => {
        const end = play(gameFor(sub.key, kin, 7), 'first', alwaysLow);
        expect(end.story.acts_completed).toContain(1);
        expect(end.character.health).toBeGreaterThan(0);
        expect(end.story.completed_beats.some((b) => b.tier === 'defeat')).toBe(true);
      });

      it(`${sub.key} (${kin}) finishes Act 1 taking the last routes`, () => {
        const end = play(gameFor(sub.key, kin, 3), 'last');
        expect(end.story.acts_completed).toContain(1);
      });
    }

  it('save and load (JSON round trip) works at every step, including mid-combat', () => {
    let sawCombat = false;
    play(gameFor('HEARTHKYN_WARRIOR', 'IRONKIN', 5), 'first', undefined, (s) => {
      if (s.scenes.some((x) => x.type === 'combat')) sawCombat = true;
      const loaded = JSON.parse(JSON.stringify(s)) as GameState;
      expect(loaded).toEqual(s);
      expect(buildView(loaded, data)).toEqual(buildView(s, data));
    });
    expect(sawCombat).toBe(true);
  });

  it('gender has no mechanical effect', () => {
    const a = play(gameFor('MEMNYR_STRATEGIST', 'KIN', 42, 'MALE'), 'first');
    const b = play(gameFor('MEMNYR_STRATEGIST', 'KIN', 42, 'FEMALE'), 'first');
    const strip = (s: GameState) => ({ ...s, character: { ...s.character, gender: null }, scenes: [] });
    expect(strip(a)).toEqual(strip(b));
  });
});
