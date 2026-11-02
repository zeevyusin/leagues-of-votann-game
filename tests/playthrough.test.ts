// Plays Act 1 and Act 2 through the same applyChoice/buildView the UI uses.
import { describe, expect, it } from 'vitest';
import { buildView } from '../src/engine/game';
import { play } from './playthroughPolicy';
import { alwaysLow, data, gameFor } from './helpers';
import type { GameState, KinType } from '../src/engine/types';

const act1Done = (s: GameState) => s.story.acts_completed.includes(1);
const act3Unlocked = (s: GameState) => s.story.act_events_shown.includes('ACT3_UNLOCKED');
const allThreads = (s: GameState) => s.story.threads_completed.length === data.story_threads.length;
const kins: KinType[] = ['KIN', 'IRONKIN'];

describe('Act 1 playthrough', () => {
  for (const sub of data.subclasses)
    for (const kin of kins) {
      it(`${sub.key} (${kin}) finishes Act 1 taking the first routes`, () => {
        const end = play(gameFor(sub.key, kin, 99), { until: act1Done });
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
    }
});

describe('Act 2 playthrough', () => {
  for (const sub of data.subclasses)
    for (const kin of kins) {
      it(`${sub.key} (${kin}) unlocks Act 3 and can finish all four threads`, () => {
        const unlocked = play(gameFor(sub.key, kin, 99), { until: act3Unlocked });
        expect(unlocked.story.threads_completed.length).toBeGreaterThanOrEqual(data.config.THREADS_REQUIRED);
        const end = play(unlocked, { until: allThreads });
        expect(end.story.story_rewards).toEqual(expect.arrayContaining(['INTEL_MUSTER', 'TECH_COUNTERKEY', 'ALLIES_LEAGUE', 'STRENGTH_RENOWN']));
        expect(end.character.health).toBeGreaterThan(0);
      });

      it(`${sub.key} (${kin}) unlocks Act 3 even when every roll fails`, () => {
        const end = play(gameFor(sub.key, kin, 7), { until: act3Unlocked, rng: alwaysLow });
        expect(end.story.threads_completed.length).toBeGreaterThanOrEqual(data.config.THREADS_REQUIRED);
        expect(end.story.completed_beats.some((b) => b.tier === 'defeat')).toBe(true);
      });

      it(`${sub.key} (${kin}) unlocks Act 3 taking the last routes`, () => {
        const end = play(gameFor(sub.key, kin, 3), { until: act3Unlocked, pick: 'last' });
        expect(end.story.threads_completed.length).toBeGreaterThanOrEqual(data.config.THREADS_REQUIRED);
      });
    }

  it('a run that ignores the threads reaches the early Waaagh! launch without soft-locking', () => {
    const afterAct1 = play(gameFor('HEARTHKYN_WARRIOR', 'KIN', 11), { until: act1Done });
    const end = play(afterAct1, {
      until: (s) => s.story.act_events_shown.includes('WAAAGH_LAUNCHED'),
      ignoreThreads: true,
      bounce: ['KARRAK_STATION', 'CINDER_DRIFT'],
      maxSteps: 6000,
    });
    expect(end.story.waaagh_meter).toBe(data.config.WAAAGH_LAUNCH);
    expect(end.story.threads_completed).toEqual([]);
  });

  it('Rescue Hrolla opens after the muster thread and can be won', () => {
    const end = play(gameFor('EINHYR_HEARTHGUARD', 'KIN', 21), { until: (s) => s.story.hrolla_status === 'RESCUED' || allThreads(s) });
    expect(end.story.completed_beats.some((b) => b.key === 'A2_HROLLA_RESCUE')).toBe(true);
  });

  it('save and load (JSON round trip) works at every step, including mid-combat', () => {
    let sawCombat = false;
    play(gameFor('HEARTHKYN_WARRIOR', 'IRONKIN', 5), {
      until: act3Unlocked,
      onState: (s) => {
        if (s.scenes.some((x) => x.type === 'combat')) sawCombat = true;
        const loaded = JSON.parse(JSON.stringify(s)) as GameState;
        expect(loaded).toEqual(s);
        expect(buildView(loaded, data)).toEqual(buildView(s, data));
      },
    });
    expect(sawCombat).toBe(true);
  });

  it('gender has no mechanical effect', () => {
    const a = play(gameFor('MEMNYR_STRATEGIST', 'KIN', 42, 'MALE'), { until: act3Unlocked });
    const b = play(gameFor('MEMNYR_STRATEGIST', 'KIN', 42, 'FEMALE'), { until: act3Unlocked });
    const strip = (s: GameState) => ({ ...s, character: { ...s.character, gender: null }, scenes: [] });
    expect(strip(a)).toEqual(strip(b));
  });
});
