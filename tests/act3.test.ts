// Milestone 3: Act 3 from the muster to the epilogue and free roam, for every class and kin type,
// plus every Warboss resolution, Hold fate and Core fate.
import { describe, expect, it } from 'vitest';
import { applyChoice, buildView } from '../src/engine/game';
import { epiloguePages } from '../src/engine/act3';
import type { GameState, KinType } from '../src/engine/types';
import { play } from './playthroughPolicy';
import { alwaysHigh, alwaysLow, ctxWith, data, gameFor } from './helpers';
import { ScriptedRng } from '../src/engine/rng';

const act3Unlocked = (s: GameState) => s.story.act_events_shown.includes('ACT3_UNLOCKED');
const freeRoam = (s: GameState) => s.story.post_game;
const kins: KinType[] = ['KIN', 'IRONKIN'];

/** A save with Act 3 unlocked, made once per class and kin type. */
const unlockedCache = new Map<string, GameState>();
function unlocked(sub: string, kin: KinType = 'KIN', seed = 99): GameState {
  const key = `${sub}:${kin}:${seed}`;
  if (!unlockedCache.has(key)) unlockedCache.set(key, play(gameFor(sub, kin, seed), { until: act3Unlocked }));
  return structuredClone(unlockedCache.get(key)!);
}

/** Prefers the route with this id on the given beat. */
const onBeat = (beat: string, id: string) => (s: GameState, open: string[]) => {
  const top = s.scenes[s.scenes.length - 1];
  return top.type === 'beat' && top.key === beat && open.includes(id) ? id : undefined;
};
const both =
  (...prefs: ((s: GameState, open: string[]) => string | undefined)[]) =>
  (s: GameState, open: string[]) => {
    for (const p of prefs) {
      const id = p(s, open);
      if (id) return id;
    }
    return undefined;
  };

describe('Act 3 playthrough', () => {
  for (const sub of data.subclasses)
    for (const kin of kins) {
      it(`${sub.key} (${kin}) sounds the muster and reaches the epilogue and free roam`, () => {
        const end = play(unlocked(sub.key, kin), { until: freeRoam, muster: true });
        const s = end.story;
        expect(s.ending).not.toBeNull();
        expect(s.acts_completed).toContain(3);
        expect(end.grudges.find((g) => g.key === 'GRUDGE_SKRAGNAK')?.status).toBe('SETTLED');
        expect(end.location).toBe(data.config.POST_GAME_START[s.ending!.hold]);
        expect(end.crew).toContain('DORRIK');
        // The Waaagh! is retired: no longer on the status bar.
        expect(buildView(end, data).status?.some((i) => i.label === 'Waaagh!')).toBe(false);
      });
    }

  it('every roll failing still reaches an ending (the Hold is evacuated)', () => {
    const end = play(unlocked('THEYN_KAPITAN', 'KIN', 7), { until: freeRoam, muster: true, rng: alwaysLow });
    expect(end.story.ending?.hold).toBe('EVACUATED');
    expect(end.story.flags.ACT3_BATTLE_LOST).toBe(true);
    expect(end.story.flags.SKRAGNAK_LOST).toBe(true);
    expect(end.story.ending?.grudge).toBe('GREAT_COST');
    expect(end.location).toBe('KARRAK_STATION');
  });

  it('taking the last routes picks the Last Stand', () => {
    const end = play(unlocked('MEMNYR_STRATEGIST', 'IRONKIN', 3), { until: freeRoam, muster: true, pick: 'last' });
    expect(end.story.ending?.warboss).toBe('LAST_STAND');
  });

  it('an early launch with no threads forces Act 3 and still reaches an ending', () => {
    const afterAct1 = play(gameFor('HEARTHKYN_WARRIOR', 'KIN', 11), { until: (s) => s.story.acts_completed.includes(1) });
    const launched = play(afterAct1, {
      until: (s) => !!s.story.flags.ACT3_STARTED,
      ignoreThreads: true,
      bounce: ['KARRAK_STATION', 'CINDER_DRIFT'],
      maxSteps: 6000,
    });
    expect(launched.story.flags.ACT3_FORCED).toBe(true);
    expect(launched.location).toBe(data.config.ACT3_RALLY_SYSTEM);
    const end = play(launched, { until: freeRoam });
    expect(end.story.ending?.hold).toBe('EVACUATED');
    expect(end.story.completed_beats.some((b) => b.key === 'A3_BREATHER_1')).toBe(false);
  });

  it('free roam keeps going: the player can travel and trade after the ending', () => {
    const end = play(unlocked('PROSPECTOR_TRADER'), { until: freeRoam, muster: true });
    const day = end.day;
    const meter = end.story.waaagh_meter;
    const later = play(end, { until: (s) => s.day > day + 20, bounce: ['KARRAK_STATION', 'HOLD_DURNVAR'], ignoreThreads: true, maxSteps: 2000 });
    expect(later.story.waaagh_meter).toBe(meter);
  });

  it('save and load (JSON round trip) works through Act 3 and the epilogue', () => {
    const kinds = new Set<string>();
    play(unlocked('EINHYR_HEARTHGUARD', 'IRONKIN'), {
      until: freeRoam,
      muster: true,
      onState: (s) => {
        kinds.add(s.scenes[s.scenes.length - 1].type);
        const loaded = JSON.parse(JSON.stringify(s)) as GameState;
        expect(buildView(loaded, data)).toEqual(buildView(s, data));
      },
    });
    expect([...kinds]).toEqual(expect.arrayContaining(['beat', 'combat', 'epilogue', 'muster']));
  });
});

describe('Act 3 endings', () => {
  /** Every thread done, so every resolution is open. */
  const everything = () => {
    const s = unlocked('THEYN_KAPITAN');
    s.story.story_rewards = ['INTEL_MUSTER', 'TECH_COUNTERKEY', 'ALLIES_LEAGUE', 'ALLIES_URGROT', 'STRENGTH_RENOWN'];
    return s;
  };
  const resolutions: [string, string, (s: GameState, open: string[]) => string | undefined][] = [
    ['DUEL', 'DUEL', onBeat('A3_RESOLUTION', 'route:DUEL')],
    ['USURPER', 'USURPER', onBeat('A3_RESOLUTION', 'route:USURPER')],
    ['UNPLUG', 'UNPLUGGING', onBeat('A3_RESOLUTION', 'route:UNPLUG')],
    ['AMBUSH', 'AMBUSH', both(onBeat('A3_WHERE_TO_STRIKE', 'route:STRIKE'), onBeat('A3_RESOLUTION', 'route:AMBUSH'))],
    ['LAST_STAND', 'LAST_STAND', onBeat('A3_RESOLUTION', 'route:LAST_STAND')],
  ];
  for (const [name, warboss, prefer] of resolutions)
    it(`the ${name} resolution can be won`, () => {
      const end = play(everything(), { until: freeRoam, muster: true, rng: alwaysHigh, prefer });
      expect(end.story.ending?.warboss).toBe(warboss);
      expect(end.story.flags.SKRAGNAK_LOST).toBeFalsy();
    });

  it('Usurper keeps the pact with Urgrot; other endings break it', () => {
    const withPact = (s: GameState) => {
      s.oaths.push({ key: 'PACT_URGROT', status: 'ACTIVE', sworn_day: s.day, deadline_day: null });
      return s;
    };
    const kept = play(withPact(everything()), { until: freeRoam, muster: true, rng: alwaysHigh, prefer: onBeat('A3_RESOLUTION', 'route:USURPER') });
    expect(kept.oaths.find((o) => o.key === 'PACT_URGROT')?.status).toBe('KEPT');
    const broken = play(withPact(everything()), { until: freeRoam, muster: true, rng: alwaysHigh, prefer: onBeat('A3_RESOLUTION', 'route:DUEL') });
    expect(broken.oaths.find((o) => o.key === 'PACT_URGROT')?.status).toBe('BROKEN');
    expect(broken.grudges.some((g) => g.key === 'GRUDGE_URGROT')).toBe(true);
  });

  it('Hold fates: Unbroken with a low meter, Scarred with a high one, Evacuated after a lost battle', () => {
    const low = everything();
    low.story.waaagh_meter = 20;
    expect(play(low, { until: freeRoam, muster: true, rng: alwaysHigh }).story.ending?.hold).toBe('UNBROKEN');
    const high = everything();
    high.story.waaagh_meter = 70;
    expect(play(high, { until: freeRoam, muster: true, rng: alwaysHigh }).story.ending?.hold).toBe('SCARRED');
    expect(play(everything(), { until: freeRoam, muster: true, rng: alwaysLow }).story.ending?.hold).toBe('EVACUATED');
  });

  for (const [route, core] of [
    ['route:RETURN', 'RETURNED'],
    ['route:KEEP', 'KEPT'],
    ['route:DESTROY', 'DESTROYED'],
  ] as const)
    it(`the Core can be ${core.toLowerCase()}`, () => {
      const end = play(everything(), { until: freeRoam, muster: true, rng: alwaysHigh, prefer: onBeat('A3_CORE', route) });
      expect(end.story.ending?.core).toBe(core);
    });

  it('without the counter-key, leaving the gunship loses the Core', () => {
    const s = everything();
    s.story.story_rewards = s.story.story_rewards.filter((r) => r !== 'TECH_COUNTERKEY');
    const end = play(s, {
      until: freeRoam,
      muster: true,
      rng: alwaysHigh,
      prefer: (st) => (st.scenes[st.scenes.length - 1].type === 'board' ? 'leave' : undefined),
    });
    expect(end.story.ending?.core).toBe('LOST');
    expect(end.story.core_status).toBe('LOST');
  });

  it('boarding the gunship recovers the Core even without the counter-key', () => {
    const s = everything();
    s.story.story_rewards = s.story.story_rewards.filter((r) => r !== 'TECH_COUNTERKEY');
    const end = play(s, { until: freeRoam, muster: true, rng: alwaysHigh, prefer: onBeat('A3_CORE', 'route:RETURN') });
    expect(end.story.completed_beats.some((b) => b.key === 'A3_CORE')).toBe(true);
    expect(end.story.ending?.core).toBe('RETURNED');
  });

  it('the epilogue has five pages and ends in free roam', () => {
    let first: GameState | null = null;
    play(everything(), {
      until: freeRoam,
      muster: true,
      rng: alwaysHigh,
      onState: (s) => {
        if (!first && s.scenes[s.scenes.length - 1].type === 'epilogue') first = s;
      },
    });
    expect(first).not.toBeNull();
    const pages = epiloguePages(first!, ctxWith(new ScriptedRng([0.5])));
    expect(pages.map((p) => p.title)).toEqual(['How the Warboss fell', 'Hold Durnvar', 'The Ancestor Core', 'After', 'Saga record']);
    let s: GameState = first!;
    for (let i = 0; i < pages.length; i++) {
      expect(s.story.post_game).toBe(false);
      s = applyChoice(s, data, 'continue');
    }
    expect(s.story.post_game).toBe(true);
  });
});

describe('Act 3 crew fates', () => {
  const lowHearth = (s: GameState) => {
    s.resources.hearthfire = 10;
    s.story.flags.YLSA_WARNED = true;
    return s;
  };

  it('Ylsa is lost when the ship is crippled at Low Hearthfire with her at the helm', () => {
    const end = play(lowHearth(unlocked('HEARTHKYN_WARRIOR')), {
      until: freeRoam,
      muster: true,
      rng: alwaysLow,
      prefer: onBeat('A3_YLSA', 'route:KEEP'),
    });
    expect(end.story.crew_lost).toContain('YLSA');
    expect(end.oaths.find((o) => o.key === 'OATH_DORRIK_VOW')?.status ?? 'BROKEN').toBe('BROKEN');
  });

  it('sending Ylsa away keeps her safe', () => {
    const end = play(lowHearth(unlocked('HEARTHKYN_WARRIOR')), { until: freeRoam, muster: true, rng: alwaysLow, prefer: onBeat('A3_YLSA', 'route:SEND') });
    expect(end.story.crew_lost).not.toContain('YLSA');
    expect(end.story.flags.YLSA_SENT_AWAY).toBe(true);
  });

  it('Ylsa is never lost before Act 3, even when every roll fails', () => {
    const s = play(gameFor('HERNKYN_PIONEER', 'KIN', 7), { until: act3Unlocked, rng: alwaysLow });
    expect(s.crew).toContain('YLSA');
    expect(s.story.crew_lost).toEqual([]);
  });

  it('Dorrik is never lost', () => {
    const end = play(lowHearth(unlocked('CTHONIAN_BERSERK', 'IRONKIN')), { until: freeRoam, muster: true, rng: alwaysLow });
    expect(end.crew).toContain('DORRIK');
  });
});
