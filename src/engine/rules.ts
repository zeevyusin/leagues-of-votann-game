// Derived values, lookups, and shared modifiers.
import type { GameData, Config, RelicEffect } from './schema';
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
export const threadOf = (d: GameData, key: string) => byKey(d.story_threads, key, 'thread');
export const actEventOf = (d: GameData, key: string) => byKey(d.act_events, key, 'act event');

export function marketOf(d: GameData, port: string) {
  return d.markets.find((m) => m.port === port) ?? null;
}

export function waaaghBand(config: Config, meter: number | null) {
  const bands = [...config.WAAAGH_BANDS].sort((a, b) => b.min - a.min);
  return bands.find((b) => (meter ?? 0) >= b.min) ?? bands[bands.length - 1];
}

export const injuryOf = (d: GameData, key: string) => byKey(d.injuries, key, 'injury');

export function injuryName(d: GameData, c: Character, key: string): string {
  const i = injuryOf(d, key);
  return c.kin_type === 'IRONKIN' ? i.ironkin_name : i.name;
}

/** A system has a port if the map says so, or if the fleet made it home (A New Hearth). */
export function isPort(d: GameData, state: GameState, system: string): boolean {
  return systemOf(d, system).port || state.story.home_port === system;
}

/** A port is closed once the Waaagh! meter passes its limit. After the ending, an evacuated Hold stays closed. */
export function portOpen(d: GameData, state: GameState, system: string): boolean {
  const s = systemOf(d, system);
  if (!isPort(d, state, system)) return false;
  if (state.story.post_game) return !(state.story.ending?.hold === 'EVACUATED' && system === d.config.ACT3_RALLY_SYSTEM);
  return s.closes_at_waaagh === undefined || (state.story.waaagh_meter ?? 0) < s.closes_at_waaagh;
}

/** The Waaagh! meter as the rest of the game sees it: hidden once the campaign is over. */
export function liveWaaagh(state: GameState): number | null {
  return state.story.post_game ? null : state.story.waaagh_meter;
}

/** Act 3 has started and the epilogue has not finished. */
export function inAct3(state: GameState): boolean {
  return !!state.story.flags.ACT3_STARTED && !state.story.post_game;
}

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

/** Crew who cannot be lost right now: always protected, or only at risk in Act 3. */
export function crewSafe(d: GameData, state: GameState, key: string): boolean {
  const m = crewOf(d, key);
  return m.protected || (m.act3_risk && !inAct3(state));
}

export function hasPassive(d: GameData, c: Character, key: string): boolean {
  return passiveFor(d, c).key === key;
}

/** The current difficulty level's numbers. */
export function eyeLevel(d: GameData, state: GameState) {
  return d.config.ANCESTORS_EYE[state.ancestors_eye ?? d.config.DEFAULT_ANCESTORS_EYE];
}

/** The difficulty's modifier, if it has one. Every player roll gets it. */
export function eyeModifiers(d: GameData, state: GameState, value = eyeLevel(d, state).roll): Modifier[] {
  return value ? [{ label: `The Ancestors' Eye (${eyeLevel(d, state).name})`, value }] : [];
}

/** Modifiers that apply to almost every roll: difficulty, Hearthfire band, fatigue, Wear, and crew traits. */
export function generalModifiers(
  state: GameState,
  d: GameData,
  stat: StatKey | null,
  context: 'story' | 'personal' | 'ship',
): Modifier[] {
  const cfg = d.config;
  const mods: Modifier[] = [...eyeModifiers(d, state)];
  const band = hearthfireBand(cfg, state.resources.hearthfire);
  if (band.modifier !== 0) mods.push({ label: `Hearthfire ${titleWord(band.band)}`, value: band.modifier });
  if (state.character.fatigued) mods.push({ label: 'Fatigued', value: cfg.FATIGUE_PENALTY });
  if (state.character.wear !== null && stat && cfg.WEAR_PENALTY_STATS.includes(stat)) {
    const w = wearBand(cfg, state.character.wear);
    if (w.penalty !== 0) mods.push({ label: `Wear ${titleWord(w.state)}`, value: w.penalty });
  }
  for (const key of state.character.injuries) {
    const injury = injuryOf(d, key);
    if (stat && injury.stat === stat) mods.push({ label: injuryName(d, state.character, key), value: injury.value });
  }
  mods.push(...relicRollModifiers(state, d, stat, context));
  if (context !== 'personal' && stat) {
    for (const key of state.crew) {
      const member = crewOf(d, key);
      for (const m of member.roll_modifiers)
        if (m.stat === stat) mods.push({ label: `${member.display_name} (${member.trait.name})`, value: m.value });
    }
  }
  return mods;
}

// ---------- Relics (game-overview.md 6.3.1) ----------

/** Every effect of every equipped relic that applies to this character, labelled with the relic's name. */
export function relicEffects(state: GameState, d: GameData): { name: string; effect: RelicEffect }[] {
  const out: { name: string; effect: RelicEffect }[] = [];
  for (const r of state.relics) {
    if (!r.equipped) continue;
    const info = relicOf(d, r.key);
    const name = r.identified ? info.display_name : info.unidentified_name;
    for (const effect of [...info.benefit_effects, ...info.drawback_effects])
      if (!effect.kin_type || effect.kin_type === state.character.kin_type) out.push({ name, effect });
  }
  return out;
}

/** Sum of one numeric relic field across equipped relics. */
export function relicSum(state: GameState, d: GameData, field: Exclude<keyof RelicEffect, 'kin_type' | 'stat' | 'contexts' | 'reputation'>): number {
  return relicEffects(state, d).reduce((n, x) => n + (x.effect[field] ?? 0), 0);
}

/** Product of a multiplier field across equipped relics (1 when none). */
export function relicProduct(state: GameState, d: GameData, field: 'ork_event_weight' | 'broken_oath_hearthfire_multiplier'): number {
  return relicEffects(state, d).reduce((n, x) => n * (x.effect[field] ?? 1), 1);
}

function relicRollModifiers(state: GameState, d: GameData, stat: StatKey | null, context: 'story' | 'personal' | 'ship'): Modifier[] {
  const mods: Modifier[] = [];
  for (const { name, effect } of relicEffects(state, d)) {
    if (!effect.roll) continue;
    if (effect.stat && effect.stat !== stat) continue;
    if (effect.contexts && !effect.contexts.includes(context)) continue;
    mods.push({ label: name, value: effect.roll });
  }
  return mods;
}

/** Labelled relic modifiers for Negotiate or telegraph reads. */
export function relicFieldModifiers(state: GameState, d: GameData, field: 'negotiate' | 'read'): Modifier[] {
  return relicEffects(state, d)
    .filter((x) => x.effect[field])
    .map((x) => ({ label: x.name, value: x.effect[field]! }));
}

/** Reactor pips including relic bonuses. */
export function shipPips(state: GameState, d: GameData): number {
  return reactorPips(d.config, state.ship) + relicSum(state, d, 'reactor_pips');
}

function titleWord(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

// ---------- Text ----------

export type TextVariant = string | { default: string; variants?: Record<string, string> };

/** Picks the most specific variant: POST_GAME (after the ending), then subclass, base class, kin type, gender. */
export function resolveText(text: TextVariant, state: GameState): string {
  const raw = typeof text === 'string' ? text : pickVariant(text, state);
  return fillTemplate(raw, state);
}

function pickVariant(text: { default: string; variants?: Record<string, string> }, state: GameState): string {
  const v = text.variants ?? {};
  const c = state.character;
  const post = state.story.post_game ? v.POST_GAME : undefined;
  return post ?? v[c.subclass] ?? v[c.base_class] ?? v[c.kin_type] ?? v[c.gender] ?? text.default;
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
