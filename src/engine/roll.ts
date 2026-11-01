// The single roll resolver every system uses (game-overview.md section 5).
import type { Config } from './schema';
import type { Rng } from './rng';
import type { StatKey, Tier } from './types';

export interface Modifier {
  label: string;
  value: number;
}

export interface RollResult {
  stat: StatKey | null;
  statValue: number;
  die: number;
  sides: number;
  modifiers: Modifier[];
  total: number;
  difficulty: number;
  difficultyName: string | null;
  margin: number;
  tier: Tier;
  natural: 'crit' | 'fumble' | null;
}

/** A player-facing roll, reported to the UI so it can animate the die. */
export interface RollEvent {
  /** What the roll was for, e.g. a route label or a combat stance. */
  context: string;
  statLabel: string | null;
  statValue: number;
  modifierTotal: number;
  die: number;
  sides: number;
  total: number;
  difficulty: number;
  difficultyName: string | null;
  tier: Tier;
  natural: 'crit' | 'fumble' | null;
}

export function toRollEvent(r: RollResult, context: string, statLabel: string | null): RollEvent {
  return {
    context,
    statLabel,
    statValue: r.statValue,
    modifierTotal: r.modifiers.reduce((s, m) => s + m.value, 0),
    die: r.die,
    sides: r.sides,
    total: r.total,
    difficulty: r.difficulty,
    difficultyName: r.difficultyName,
    tier: r.tier,
    natural: r.natural,
  };
}

export const TIER_LABEL: Record<Tier, string> = {
  critical: 'Critical success',
  success: 'Success',
  partial: 'Partial success',
  failure: 'Failure',
};

export function dieSides(config: Config): number {
  return config.DIE_TYPE === 'd100' ? 100 : 20;
}

/** Accepts a difficulty name ("HARD") or a raw number. */
export function resolveDifficulty(config: Config, value: string | number): number {
  if (typeof value === 'number') return value;
  const n = config.DIFFICULTY[value];
  if (n === undefined) throw new Error(`Unknown difficulty "${value}"`);
  return n;
}

export function difficultyName(config: Config, value: string | number): string | null {
  if (typeof value === 'string') return value;
  const found = Object.entries(config.DIFFICULTY).find(([, n]) => n === value);
  return found ? found[0] : null;
}

export function tierFor(config: Config, total: number, difficulty: number, die: number, sides: number): Tier {
  if (sides === 20) {
    if (die === 20 && config.NAT20_IS_CRIT) return 'critical';
    if (die === 1 && config.NAT1_IS_FAILURE) return 'failure';
  }
  const margin = total - difficulty;
  if (margin >= config.TIER_CRIT_MARGIN) return 'critical';
  if (margin >= 0) return 'success';
  if (margin >= -config.TIER_PARTIAL_MARGIN) return 'partial';
  return 'failure';
}

export function roll(
  rng: Rng,
  config: Config,
  stat: StatKey | null,
  statValue: number,
  modifiers: Modifier[],
  difficulty: string | number,
): RollResult {
  const sides = dieSides(config);
  const die = rng.int(1, sides);
  const dc = resolveDifficulty(config, difficulty);
  const total = die + statValue + modifiers.reduce((s, m) => s + m.value, 0);
  const tier = tierFor(config, total, dc, die, sides);
  const natural = sides === 20 && die === 20 ? 'crit' : sides === 20 && die === 1 ? 'fumble' : null;
  return {
    stat,
    statValue,
    die,
    sides,
    modifiers,
    total,
    difficulty: dc,
    difficultyName: difficultyName(config, difficulty),
    margin: total - dc,
    tier,
    natural,
  };
}

/** Exact chance of each tier, given the flat bonus (stat + modifiers). Used by Calculate the Odds. */
export function tierChances(config: Config, bonus: number, difficulty: number): Record<Tier, number> {
  const sides = dieSides(config);
  const counts: Record<Tier, number> = { critical: 0, success: 0, partial: 0, failure: 0 };
  for (let die = 1; die <= sides; die++) counts[tierFor(config, die + bonus, difficulty, die, sides)]++;
  return {
    critical: counts.critical / sides,
    success: counts.success / sides,
    partial: counts.partial / sides,
    failure: counts.failure / sides,
  };
}

export function formatModifiers(mods: Modifier[]): string {
  return mods
    .filter((m) => m.value !== 0)
    .map((m) => `${m.label} ${m.value > 0 ? '+' : ''}${m.value}`)
    .join(', ');
}

/** One-line summary: "Nerve 3 + d20 (14) + Pathfinder +3 = 20 vs Hard 14 -> Critical success". */
export function describeRoll(r: RollResult, statLabel: string | null): string {
  const parts = [`d${r.sides} rolled ${r.die}`];
  if (statLabel) parts.push(`${statLabel} ${r.statValue}`);
  const mods = formatModifiers(r.modifiers);
  if (mods) parts.push(mods);
  const name = r.difficultyName ? `${titleCase(r.difficultyName)} ` : '';
  return `${parts.join(' + ')} = ${r.total} vs ${name}${r.difficulty}: ${TIER_LABEL[r.tier]}`;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
