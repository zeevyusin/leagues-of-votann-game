import { describe, expect, it } from 'vitest';
import { resolveDifficulty, roll, tierChances, tierFor } from '../src/engine/roll';
import { ScriptedRng } from '../src/engine/rng';
import { data } from './helpers';

const cfg = data.config;

describe('tier rule (margin-based)', () => {
  it.each([
    [16, 11, 10, 'critical'],
    [15, 11, 10, 'success'],
    [11, 11, 10, 'success'],
    [10, 11, 10, 'partial'],
    [7, 11, 10, 'partial'],
    [6, 11, 10, 'failure'],
  ])('total %i vs %i (die %i) is %s', (total, dc, die, tier) => {
    expect(tierFor(cfg, total, dc, die, 20)).toBe(tier);
  });

  it('natural 20 is always a critical and natural 1 is always a failure', () => {
    expect(tierFor(cfg, 20, 30, 20, 20)).toBe('critical');
    expect(tierFor(cfg, 30, 5, 1, 20)).toBe('failure');
  });

  it('d100 has no natural 20/1 rule', () => {
    expect(tierFor(cfg, 20, 30, 20, 100)).toBe('failure');
  });
});

describe('difficulty ladder', () => {
  it('maps names to numbers', () => {
    expect(resolveDifficulty(cfg, 'EASY')).toBe(8);
    expect(resolveDifficulty(cfg, 'NORMAL')).toBe(11);
    expect(resolveDifficulty(cfg, 'HARD')).toBe(14);
    expect(resolveDifficulty(cfg, 'VERY_HARD')).toBe(17);
    expect(resolveDifficulty(cfg, 'HEROIC')).toBe(20);
    expect(resolveDifficulty(cfg, 13)).toBe(13);
  });

  it('rejects unknown names', () => {
    expect(() => resolveDifficulty(cfg, 'IMPOSSIBLE')).toThrow();
  });
});

describe('roll', () => {
  it('adds die, stat, and modifiers', () => {
    // 0.5 -> die 11 on a d20
    const r = roll(new ScriptedRng([0.5]), cfg, 'grit', 3, [{ label: 'Test', value: 2 }], 'HARD');
    expect(r.die).toBe(11);
    expect(r.total).toBe(16);
    expect(r.difficulty).toBe(14);
    expect(r.tier).toBe('success');
  });

  it('odds always sum to 1', () => {
    for (const bonus of [-5, 0, 5, 15]) {
      const p = tierChances(cfg, bonus, 14);
      expect(p.critical + p.success + p.partial + p.failure).toBeCloseTo(1);
    }
  });
});
