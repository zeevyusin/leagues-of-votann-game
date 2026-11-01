// Derived values, lookups, and shared modifiers.
import type { GameData, Config } from './schema';
import type { Rng } from './rng';
import { toRollEvent, type Modifier, type RollEvent, type RollResult } from './roll';
import type { Character, GameState, Ship, StatKey } from './types';

export interface Ctx {
  data: GameData;
  rng: Rng;
  /** Player-facing rolls made during this choice, in order (for the UI's dice animation). */
  rolls?: RollEvent[];
}

export function recordRoll(ctx: Ctx, r: RollResult, context: string): void {
  ctx.rolls?.push(toRollEvent(r, context, r.stat ? statLabel(ctx.data, r.stat) : null));
}

type Keyed = { key: string };

export function byKey<T extends Keyed>(list: T[], key: string, kind: string): T {
  const found = list.find((x) => x.key === key);
  if (!found) throw new Error(`Unknown ${kind} "${key}"`);
  return found;
}

export const subclassOf = (d: GameData, key: string) => byKey(d.subclasses, key, 'subclass');
export const baseClassOf = (d: GameData, key: string) => byKey(d.base_classes, key, 'base class');
export const kinTypeOf = (d: GameData, key: string) => byKey(d.kin_types, key, 'kin type');
export const systemOf = (d: GameData, key: string) => byKey(d.systems, key, 'system');
export const factionOf = (d: GameData, key: string) => byKey(d.factions, key, 'faction');
export const crewOf = (d: GameData, key: string) => byKey(d.crew, key, 'crew');
export const oathOf = (d: GameData, key: string) => byKey(d.oaths, key, 'oath');
export const grudgeOf = (d: GameData, key: string) => byKey(d.grudges, key, 'grudge');
export const messageOf = (d: GameData, key: string) => byKey(d.messages, key, 'message');
export const beatOf = (d: GameData, key: string) => byKey(d.story_beats, key, 'beat');
export const encounterOf = (d: GameData, key: string) => byKey(d.combat_encounters, key, 'encounter');
export const enemyOf = (d: GameData, key: string) => byKey(d.enemies, key, 'enemy');
export const enemyShipOf = (d: GameData, key: string) => byKey(d.enemy_ships, key, 'enemy ship');
export const itemOf = (d: GameData, key: string) => byKey(d.items, key, 'item');
export const relicOf = (d: GameData, key: string) => byKey(d.relics, key, 'relic');
export const loreOf = (d: GameData, key: string) => byKey(d.lore, key, 'lore');

export function statLabel(d: GameData, key: StatKey): string {
  return byKey(d.stats, key, 'stat').display_name;
}

export function maxHealth(config: Config, c: Character): number {
  return config.COMBAT_STARTING_HEALTH_BASE + c.stats.grit * config.COMBAT_HEALTH_PER_GRIT;
}

export function hearthfireBand(config: Config, value: number) {
  const bands = [...config.HEARTHFIRE_BANDS].sort((a, b) => b.min - a.min);
  return bands.find((b) => value >= b.min) ?? bands[bands.length - 1];
}

export function wearBand(config: Config, wear: number) {
  const bands = [...config.WEAR_BANDS].sort((a, b) => b.min - a.min);
  return bands.find((b) => wear >= b.min) ?? bands[bands.length - 1];
}

export function moduleCap(config: Config, level: number): number {
  return config.MODULE_CAP_BASE + level;
}

export function reactorPips(config: Config, ship: Ship): number {
  return config.SHIP_BASE_REACTOR_PIPS + (ship.modules.reactor - 1) * config.REACTOR_PIPS_PER_LEVEL;
}

export function xpToNext(config: Config, level: number): number {
  return config.XP_PER_LEVEL_BASE * level;
}

export function passiveFor(d: GameData, c: Character) {
  const base = baseClassOf(d, c.base_class);
  return c.kin_type === 'IRONKIN' ? base.ironkin_passive : base.kin_passive;
}

export function consoleActionFor(d: GameData, c: Character) {
  const sub = subclassOf(d, c.subclass);
  const action = sub.console_action;
  const variant = c.kin_type === 'IRONKIN' ? action.ironkin_variant : undefined;
  return {
    name: action.name,
    description: variant?.description ?? action.description,
    stat: sub.focus_stats[0],
    wearCost: c.kin_type === 'IRONKIN' ? variant?.wear_cost ?? d.config.WEAR_PER_ACTION : 0,
  };
}

export function hasPassive(d: GameData, c: Character, key: string): boolean {
  return passiveFor(d, c).key === key;
}

/** Modifiers that apply to almost every roll: Hearthfire band, fatigue, Wear, and crew traits. */
export function generalModifiers(
  state: GameState,
  d: GameData,
  stat: StatKey | null,
  context: 'story' | 'personal' | 'ship',
): Modifier[] {
  const cfg = d.config;
  const mods: Modifier[] = [];
  const band = hearthfireBand(cfg, state.resources.hearthfire);
  if (band.modifier !== 0) mods.push({ label: `Hearthfire ${titleWord(band.band)}`, value: band.modifier });
  if (state.character.fatigued) mods.push({ label: 'Fatigued', value: cfg.FATIGUE_PENALTY });
  if (state.character.wear !== null && stat && cfg.WEAR_PENALTY_STATS.includes(stat)) {
    const w = wearBand(cfg, state.character.wear);
    if (w.penalty !== 0) mods.push({ label: `Wear ${titleWord(w.state)}`, value: w.penalty });
  }
  if (context !== 'personal' && stat) {
    for (const key of state.crew) {
      const member = crewOf(d, key);
      for (const m of member.roll_modifiers)
        if (m.stat === stat) mods.push({ label: `${member.display_name} (${member.trait.name})`, value: m.value });
    }
  }
  return mods;
}

function titleWord(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

// ---------- Text ----------

export type TextVariant = string | { default: string; variants?: Record<string, string> };

/** Picks the most specific variant: subclass, then base class, then kin type, then gender. */
export function resolveText(text: TextVariant, state: GameState): string {
  const raw = typeof text === 'string' ? text : pickVariant(text, state.character);
  return fillTemplate(raw, state);
}

function pickVariant(text: { default: string; variants?: Record<string, string> }, c: Character): string {
  const v = text.variants ?? {};
  return v[c.subclass] ?? v[c.base_class] ?? v[c.kin_type] ?? v[c.gender] ?? text.default;
}

const PRONOUNS = {
  MALE: { they: 'he', them: 'him', their: 'his' },
  FEMALE: { they: 'she', them: 'her', their: 'her' },
} as const;

export function fillTemplate(raw: string, state: GameState): string {
  const p = PRONOUNS[state.character.gender];
  return raw
    .replaceAll('{name}', state.character.name)
    .replaceAll('{ship}', state.ship.name)
    .replaceAll('{they}', p.they)
    .replaceAll('{them}', p.them)
    .replaceAll('{their}', p.their);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
