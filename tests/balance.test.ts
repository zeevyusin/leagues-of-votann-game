// The balance-pass targets (combat-system.md Phase 3, item 7, and game-overview.md 8.3), measured
// with the careful test player over 120 seeded campaigns. Seeds are fixed, so the numbers are stable
// until the data changes; when they drift out of range, retune the data rather than the targets.
import { describe, expect, it } from 'vitest';
import { play } from './playthroughPolicy';
import { data, gameFor } from './helpers';
import type { GameState } from '../src/engine/types';

const SEEDS = [99, 5, 42, 7, 13, 2026];

interface Fight {
  enc: string;
  rounds: number;
  result: 'victory' | 'defeat' | 'withdrew';
  act: number;
}

/** Watches the scene stack and records each fight's encounter, length and result. */
function fightRecorder(fights: Fight[]) {
  let current: { enc: string; rounds: number; act: number } | null = null;
  return (s: GameState) => {
    const top = s.scenes[s.scenes.length - 1];
    if (top.type === 'combat') {
      if (current && current.enc !== top.combat.encounter) fights.push({ ...current, result: 'victory' });
      if (!current || current.enc !== top.combat.encounter) current = { enc: top.combat.encounter, rounds: 0, act: s.story.act };
      current.rounds = top.combat.round;
      return;
    }
    if (!current) return;
    const text = top.type === 'notice' ? top.lines.map((l) => l.text).join(' ') : '';
    fights.push({ ...current, result: text.includes('DEFEAT') ? 'defeat' : text.includes('WITHDRAWN') ? 'withdrew' : 'victory' });
    current = null;
  };
}

const share = (n: number, of: number) => n / of;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('balance: a careful player over 120 campaigns', () => {
  const fights: Fight[] = [];
  const levels = { act1: [] as number[], unlock: [] as number[], end: [] as number[] };
  let runs = 0;
  let battlesWon = 0;
  let bossWon = 0;
  for (const seed of SEEDS)
    for (const sub of data.subclasses)
      for (const kin of ['KIN', 'IRONKIN'] as const) {
        const onState = fightRecorder(fights);
        const a1 = play(gameFor(sub.key, kin, seed), { until: (s) => s.story.acts_completed.includes(1), careful: true, onState });
        const unlocked = play(a1, { until: (s) => s.story.act_events_shown.includes('ACT3_UNLOCKED'), careful: true, onState });
        const end = play(unlocked, { until: (s) => s.story.post_game, muster: true, careful: true, onState });
        levels.act1.push(a1.character.level);
        levels.unlock.push(unlocked.character.level);
        levels.end.push(end.character.level);
        runs++;
        if (!end.story.flags.ACT3_BATTLE_LOST) battlesWon++;
        if (!end.story.flags.SKRAGNAK_LOST) bossWon++;
      }

  it('Act 1 and Act 2 fights are lost 10% to 30% of the time', () => {
    const early = fights.filter((f) => f.act <= 2);
    const lost = share(early.filter((f) => f.result === 'defeat').length, early.length);
    expect(lost).toBeGreaterThanOrEqual(0.1);
    expect(lost).toBeLessThanOrEqual(0.3);
  });

  it('the void battle is won 70% to 90% of the time', () => {
    expect(share(battlesWon, runs)).toBeGreaterThanOrEqual(0.7);
    expect(share(battlesWon, runs)).toBeLessThanOrEqual(0.9);
  });

  it('the Warboss fight is won 70% to 90% of the time', () => {
    expect(share(bossWon, runs)).toBeGreaterThanOrEqual(0.7);
    expect(share(bossWon, runs)).toBeLessThanOrEqual(0.9);
  });

  it('fights last 2 to 5 rounds on average, and Skragnak at most 8', () => {
    const avg = mean(fights.map((f) => f.rounds));
    expect(avg).toBeGreaterThanOrEqual(2);
    expect(avg).toBeLessThanOrEqual(5);
    const boss = fights.filter((f) => f.enc.startsWith('A3_SKRAGNAK'));
    expect(Math.max(...boss.map((f) => f.rounds))).toBeLessThanOrEqual(8);
  });

  it('XP pacing: about level 3 after Act 1, 6 to 8 at the Act 3 unlock, 8 to 10 at the epilogue', () => {
    expect(mean(levels.act1)).toBeGreaterThanOrEqual(3);
    expect(mean(levels.act1)).toBeLessThan(4.5);
    expect(Math.min(...levels.unlock)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...levels.unlock)).toBeLessThanOrEqual(8);
    expect(Math.min(...levels.end)).toBeGreaterThanOrEqual(8);
  });
});

describe('balance: an early launch with no threads', () => {
  it('loses the void battle more often than it wins', () => {
    let lost = 0;
    let n = 0;
    for (const seed of [11, 12, 13, 14, 15, 16])
      for (const sub of ['HEARTHKYN_WARRIOR', 'PROSPECTOR_TRADER', 'BROKHYR_IRONMASTER']) {
        const a1 = play(gameFor(sub, 'KIN', seed), { until: (s) => s.story.acts_completed.includes(1), careful: true });
        const launched = play(a1, {
          until: (s) => !!s.story.flags.ACT3_STARTED,
          ignoreThreads: true,
          bounce: ['KARRAK_STATION', 'CINDER_DRIFT'],
          maxSteps: 8000,
          careful: true,
        });
        const end = play(launched, { until: (s) => s.story.post_game, careful: true });
        n++;
        if (end.story.flags.ACT3_BATTLE_LOST) lost++;
      }
    expect(lost).toBeGreaterThan(n / 2);
  });
});
