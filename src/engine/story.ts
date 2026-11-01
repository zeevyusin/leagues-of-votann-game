// The story engine: beats, routes, and how fights feed back into the story. story.md section 10.
import { applyDefeat } from './defeat';
import { applyEffects, grantXp } from './effects';
import { lockedReason } from './conditions';
import { describeRoll, roll, titleCase, type Modifier, type RollResult } from './roll';
import {
  beatOf,
  consoleActionFor,
  encounterOf,
  generalModifiers,
  recordRoll,
  resolveText,
  statLabel,
  type Ctx,
} from './rules';
import type { Route } from './schema';
import type { CombatResult } from './combat';
import { startCombat } from './combat';
import type { CombatState, GameState, Line, Scene, StatKey, Tier } from './types';

export interface RoutePlan {
  stat: StatKey | null;
  statValue: number;
  modifiers: Modifier[];
  difficulty: string | number | null;
  wearCost: number;
}

/** Everything about a roll route that can be known before rolling (for display and odds). */
export function planRoute(state: GameState, ctx: Ctx, route: Route): RoutePlan {
  const c = state.character;
  if (route.console_action) {
    const action = consoleActionFor(ctx.data, c);
    const mods = generalModifiers(state, ctx.data, action.stat, 'story');
    mods.push({ label: action.name, value: ctx.data.config.CONSOLE_ACTION_BONUS });
    return { stat: action.stat, statValue: c.stats[action.stat], modifiers: mods, difficulty: route.console_action.difficulty, wearCost: action.wearCost };
  }
  if (route.roll) {
    const stat = route.roll.stat;
    const mods = generalModifiers(state, ctx.data, stat, 'story');
    const classBonus = route.class_bonus?.[c.base_class];
    if (classBonus) mods.push({ label: `${titleCase(c.base_class)} route`, value: classBonus });
    const subBonus = route.subclass_bonus?.[c.subclass];
    if (subBonus) mods.push({ label: 'Subclass route', value: subBonus });
    return { stat, statValue: c.stats[stat], modifiers: mods, difficulty: route.roll.difficulty, wearCost: 0 };
  }
  return { stat: null, statValue: 0, modifiers: [], difficulty: null, wearCost: 0 };
}

export function routeLock(state: GameState, ctx: Ctx, route: Route): string | undefined {
  return lockedReason(state, ctx.data, route.requirements);
}

function top(state: GameState): Scene {
  return state.scenes[state.scenes.length - 1];
}

function popScene(state: GameState, type: Scene['type']): void {
  if (top(state).type !== type) throw new Error(`Expected a ${type} scene on top, found ${top(state).type}`);
  state.scenes.pop();
}

export function startBeat(state: GameState, ctx: Ctx, key: string): void {
  beatOf(ctx.data, key);
  state.scenes.push({ type: 'beat', key });
}

export function chooseRoute(state: GameState, ctx: Ctx, beatKey: string, routeKey: string): void {
  const beat = beatOf(ctx.data, beatKey);
  const route = beat.routes.find((r) => r.key === routeKey);
  if (!route) throw new Error(`Unknown route ${routeKey}`);
  const lock = routeLock(state, ctx, route);
  if (lock) throw new Error(lock);

  const lines: Line[] = [{ text: route.console_action ? consoleActionFor(ctx.data, state.character).name : route.label, tone: 'heading' }];
  lines.push(...applyEffects(state, ctx, route.effects_always, { nonLethal: true }));

  if (route.encounter) {
    popScene(state, 'beat');
    const combat = startCombat(state, ctx, route.encounter, { beat: beatKey, route: routeKey });
    state.scenes.push({ type: 'combat', combat });
    return;
  }

  let tier: Tier;
  let result: RollResult | null = null;
  const plan = planRoute(state, ctx, route);
  if (route.auto_tier) {
    tier = route.auto_tier;
  } else {
    if (plan.wearCost && state.character.wear !== null)
      lines.push(...applyEffects(state, ctx, [{ wear: plan.wearCost }], { nonLethal: true }));
    result = roll(ctx.rng, ctx.data.config, plan.stat, plan.statValue, plan.modifiers, plan.difficulty!);
    recordRoll(ctx, result, lines[0].text);
    tier = result.tier;
    lines.push({ text: describeRoll(result, plan.stat ? statLabel(ctx.data, plan.stat) : null), tone: tierTone(tier) });
  }

  const outcome = route.outcomes?.[tier] ?? beat.outcomes[tier];
  lines.push({ text: '' }, { text: resolveText(outcome.text, state) });
  lines.push(...applyEffects(state, ctx, outcome.effects, { nonLethal: true }));
  if (tier === 'failure' && result) lines.push(...grantXp(state, ctx, ctx.data.config.XP_FAILED_ROLL));
  if (tier === 'failure' && state.story.waaagh_meter !== null)
    lines.push(...applyEffects(state, ctx, [{ waaagh: ctx.data.config.WAAAGH_PER_FAILED_BEAT }]));

  popScene(state, 'beat');
  completeBeat(state, ctx, beatKey, routeKey, tier, lines);
}

export function tierTone(tier: Tier) {
  return tier === 'critical' || tier === 'success' ? 'good' : tier === 'partial' ? 'accent' : 'bad';
}

/** Runs after a fight ends: encounter outcome, defeat recovery, XP, then the beat it belonged to. */
export function finishEncounter(state: GameState, ctx: Ctx, combat: CombatState, result: CombatResult, roundLines: Line[]): void {
  const cfg = ctx.data.config;
  popScene(state, 'combat');
  const enc = encounterOf(ctx.data, combat.encounter);
  const outcome =
    result === 'victory_negotiated' ? enc.outcomes.victory_negotiated ?? enc.outcomes.victory_broken : enc.outcomes[result];

  const lines: Line[] = [...roundLines, { text: '' }];
  lines.push({ text: result === 'defeat' ? 'DEFEAT' : 'VICTORY', tone: result === 'defeat' ? 'bad' : 'good' });
  lines.push({ text: resolveText(outcome.text, state) });
  if (result === 'defeat') {
    lines.push(...applyDefeat(state, ctx, { cause: 'combat', overridesDefaultCosts: enc.outcomes.defeat.overrides_default_costs }));
  } else {
    lines.push(...grantXp(state, ctx, result === 'victory_negotiated' ? cfg.XP_FIGHT_NEGOTIATED : cfg.XP_FIGHT_BROKEN));
  }
  lines.push(...applyEffects(state, ctx, outcome.effects, { nonLethal: true }));

  if (combat.then) completeBeat(state, ctx, combat.then.beat, combat.then.route, result, lines);
  else state.scenes.push({ type: 'notice', title: result === 'defeat' ? 'Defeat' : 'Victory', lines });
}

/** Records the beat, applies its outro, and queues what comes next. */
function completeBeat(
  state: GameState,
  ctx: Ctx,
  beatKey: string,
  routeKey: string,
  tier: GameState['story']['completed_beats'][number]['tier'],
  lines: Line[],
): void {
  const cfg = ctx.data.config;
  const beat = beatOf(ctx.data, beatKey);
  state.story.completed_beats.push({ key: beatKey, route: routeKey, tier });
  if (beat.outro_text) lines.push({ text: '' }, { text: resolveText(beat.outro_text, state) });
  const actsBefore = state.story.acts_completed.length;
  lines.push(...applyEffects(state, ctx, beat.on_complete, { nonLethal: true }));
  lines.push(...grantXp(state, ctx, cfg.XP_BEAT));

  state.story.current_beat = beat.next;
  const next = beat.next ? beatOf(ctx.data, beat.next) : null;

  // Pushed in reverse display order: the last push is shown first.
  if (next && (next.trigger === 'auto' || (next.trigger === 'arrival' && next.location === state.location)))
    state.scenes.push({ type: 'beat', key: next.key });
  const newAct = state.story.acts_completed.length > actsBefore ? state.story.acts_completed[state.story.acts_completed.length - 1] : null;
  if (newAct !== null) {
    state.story.act = newAct + 1;
    const end: Line[] = [{ text: `ACT ${newAct} COMPLETE`, tone: 'heading' }];
    if (beat.act_end_text) end.push({ text: resolveText(beat.act_end_text, state) });
    state.scenes.push({ type: 'notice', title: `Act ${newAct} complete`, lines: end });
  }
  if (beat.prompt_ship_name && cfg.ALLOW_SHIP_NAMING) state.scenes.push({ type: 'name_ship' });
  state.scenes.push({ type: 'notice', title: beat.title, lines });
}

/** The beat waiting at the current location, if any (for arrival triggers). */
export function arrivalBeat(state: GameState, ctx: Ctx): string | null {
  const key = state.story.current_beat;
  if (!key) return null;
  const beat = beatOf(ctx.data, key);
  return beat.trigger === 'arrival' && beat.location === state.location ? key : null;
}

export function currentObjective(state: GameState, ctx: Ctx): string {
  const key = state.story.current_beat;
  if (key) return beatOf(ctx.data, key).objective;
  if (state.story.acts_completed.length) return 'Act 1 complete. Act 2 is not built yet.';
  return '';
}
