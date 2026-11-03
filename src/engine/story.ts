// The story engine: beats, routes, and how fights feed back into the story. story.md section 10.
import { applyDefeat } from './defeat';
import { activateBeat, applyEffects, grantXp, receiveMessage } from './effects';
import { allMet, lockedReason } from './conditions';
import { describeRoll, roll, titleCase, type Modifier, type RollResult } from './roll';
import {
  actEventOf,
  beatOf,
  consoleActionFor,
  crewOf,
  crewSafe,
  encounterOf,
  generalModifiers,
  hearthfireBand,
  inAct3,
  recordRoll,
  resolveText,
  statLabel,
  subclassOf,
  threadOf,
  type Ctx,
} from './rules';
import type { Effect, Route } from './schema';
import type { CombatResult } from './combat';
import { gainInjury, startCombat } from './combat';
import { settleBattleOath } from './hearthline';
import { act3Objective, beginEpilogue, musterHint, startAct3 } from './act3';
import type { BeatResult, CombatState, GameState, Line, Scene, StatKey, Tier } from './types';

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

export function canDefer(ctx: Ctx, key: string): boolean {
  const beat = beatOf(ctx.data, key);
  return beat.trigger === 'arrival' && (beat.deferrable ?? beat.act >= 2);
}

/** 'Not now': close the beat; it waits until the player leaves and comes back. */
export function deferBeat(state: GameState, ctx: Ctx, key: string): void {
  if (!canDefer(ctx, key)) return;
  popScene(state, 'beat');
  if (!state.story.deferred_beats.includes(key)) state.story.deferred_beats.push(key);
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
  state.story.playing_beat = beatKey;

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
  // Failing a main story beat feeds the Waaagh!; failing a travel event does not.
  if (tier === 'failure' && state.story.waaagh_meter !== null && beat.trigger !== 'event')
    lines.push(...applyEffects(state, ctx, [{ waaagh: ctx.data.config.WAAAGH_PER_FAILED_BEAT }]));

  popScene(state, 'beat');
  completeBeat(state, ctx, beatKey, routeKey, tier, lines);
}

export function tierTone(tier: Tier) {
  return tier === 'critical' || tier === 'success' ? 'good' : tier === 'partial' ? 'accent' : 'bad';
}

/** Runs after a fight ends: encounter outcome, defeat recovery, XP, then the beat it belonged to. */
export function finishEncounter(state: GameState, ctx: Ctx, combat: CombatState, result: CombatResult, roundLines: Line[]): void {
  popScene(state, 'combat');
  const enc = encounterOf(ctx.data, combat.encounter);
  // A disabled ship that can be boarded waits for the player's choice (combat-system.md Phase 3).
  if (result === 'victory_broken' && combat.mode === 'ship' && enc.boarding) {
    state.scenes.push({ type: 'board', combat, lines: roundLines });
    return;
  }
  settleEncounter(state, ctx, combat, result, roundLines);
}

/** "Board her": the boarding fight replaces the ship fight's victory outcome. */
export function boardShip(state: GameState, ctx: Ctx): void {
  const scene = state.scenes.pop();
  if (scene?.type !== 'board') throw new Error('Nothing to board');
  const ship = encounterOf(ctx.data, scene.combat.encounter);
  const lines = grantXp(state, ctx, ctx.data.config.XP_FIGHT_BROKEN);
  const boarding = startCombat(state, ctx, ship.boarding!, scene.combat.then);
  boarding.buffs.action_used = scene.combat.buffs.action_used;
  boarding.last = [...lines, ...boarding.last];
  state.scenes.push({ type: 'combat', combat: boarding });
}

/** "Leave her": the ship fight ends with its normal victory outcome. */
export function leaveShip(state: GameState, ctx: Ctx): void {
  const scene = state.scenes.pop();
  if (scene?.type !== 'board') throw new Error('Nothing to leave');
  settleEncounter(state, ctx, scene.combat, 'victory_broken', scene.lines);
}

function settleEncounter(state: GameState, ctx: Ctx, combat: CombatState, result: CombatResult, roundLines: Line[]): void {
  const cfg = ctx.data.config;
  const enc = encounterOf(ctx.data, combat.encounter);
  const outcome =
    result === 'victory_negotiated'
      ? enc.outcomes.victory_negotiated ?? enc.outcomes.victory_broken
      : result === 'withdrew'
        ? enc.outcomes.withdrew ?? enc.outcomes.victory_broken
        : enc.outcomes[result];
  const traitCombat = subclassOf(ctx.data, state.character.subclass).trait.combat;

  const lines: Line[] = [...roundLines, { text: '' }];
  const banner = result === 'defeat' ? 'DEFEAT' : result === 'withdrew' ? 'WITHDRAWN' : 'VICTORY';
  lines.push({ text: banner, tone: result === 'defeat' ? 'bad' : result === 'withdrew' ? 'accent' : 'good' });
  lines.push({ text: resolveText(outcome.text, state) });
  if (result === 'defeat') {
    lines.push(
      ...applyDefeat(state, ctx, {
        cause: 'combat',
        overridesDefaultCosts: enc.outcomes.defeat.overrides_default_costs,
        keepHearthfire: traitCombat?.no_defeat_hearthfire,
      }),
    );
    if (combat.buffs.defeat_hearthfire) lines.push(...applyEffects(state, ctx, [{ hearthfire: combat.buffs.defeat_hearthfire }]));
    if (combat.mode === 'personal') gainInjury(state, ctx, lines);
    if (enc.duel) lines.push({ text: 'The witnesses saw you fall.', tone: 'bad' }, ...applyEffects(state, ctx, [{ hearthfire: -cfg.DUEL_WITNESS_HEARTHFIRE }]));
    if (enc.crew_risk) lines.push(...crewAtRisk(state, ctx, enc.crew_risk));
  } else if (result !== 'withdrew') {
    lines.push(...grantXp(state, ctx, result === 'victory_negotiated' ? cfg.XP_FIGHT_NEGOTIATED : cfg.XP_FIGHT_BROKEN));
    if (combat.buffs.victory_hearthfire) lines.push(...applyEffects(state, ctx, [{ hearthfire: combat.buffs.victory_hearthfire }]));
    if (enc.duel) {
      const witnessed: Effect = { hearthfire: cfg.DUEL_WITNESS_HEARTHFIRE };
      if (enc.witness_faction) witnessed.reputation = { [enc.witness_faction]: cfg.DUEL_WITNESS_REPUTATION };
      lines.push({ text: 'The witnesses roar. Everyone saw it.', tone: 'good' }, ...applyEffects(state, ctx, [witnessed]));
    }
  }
  // Eye for Ore: victory Ore rewards are worth more.
  const effects = structuredClone(outcome.effects);
  const oreMult = result.startsWith('victory') ? traitCombat?.victory_ore_multiplier : undefined;
  if (oreMult) for (const e of effects) if (e.ore && e.ore > 0) e.ore = Math.round(e.ore * oreMult);
  lines.push(...applyEffects(state, ctx, effects, { nonLethal: true }));

  lines.push(...settleBattleOath(state, ctx, combat, result));

  if (combat.then) completeBeat(state, ctx, combat.then.beat, combat.then.route, result, lines);
  else state.scenes.push({ type: 'notice', title: banner.charAt(0) + banner.slice(1).toLowerCase(), lines });
}

/** Records the beat, applies its outro, and queues what comes next. */
function completeBeat(state: GameState, ctx: Ctx, beatKey: string, routeKey: string, tier: BeatResult, lines: Line[]): void {
  const cfg = ctx.data.config;
  const beat = beatOf(ctx.data, beatKey);
  state.story.playing_beat = beatKey;
  if (beat.outro_text) lines.push({ text: '' }, { text: resolveText(beat.outro_text, state) });

  if (beat.trigger === 'event') {
    // Travel events are side scenes: they never move the story pointer.
    if (!state.story.events_seen.includes(beatKey)) state.story.events_seen.push(beatKey);
    lines.push(...applyEffects(state, ctx, beat.on_complete, { nonLethal: true }));
    lines.push(...grantXp(state, ctx, cfg.XP_EVENT));
    state.story.playing_beat = null;
    state.scenes.push({ type: 'notice', title: beat.title, lines });
    return;
  }

  // A lost fight in a retryable beat leaves it waiting for the next visit.
  if (beat.retry_on_defeat && (tier === 'defeat' || tier === 'withdrew')) {
    state.story.playing_beat = null;
    if (!state.story.deferred_beats.includes(beatKey)) state.story.deferred_beats.push(beatKey);
    lines.push({ text: '' }, { text: 'This is not over. You can try again on your next visit.', tone: 'accent' });
    state.scenes.push({ type: 'notice', title: beat.title, lines });
    return;
  }
  state.story.active_beats = state.story.active_beats.filter((k) => k !== beatKey);
  state.story.completed_beats.push({ key: beatKey, route: routeKey, tier });
  const actsBefore = state.story.acts_completed.length;
  lines.push(...applyEffects(state, ctx, beat.on_complete, { nonLethal: true }));
  lines.push(...grantXp(state, ctx, beat.xp ?? cfg.XP_BEAT));
  state.story.playing_beat = null;

  const route = beat.routes.find((r) => r.key === routeKey);
  const nextKey = resolveNext(state, ctx, route?.next ?? beat.next);
  const next = nextKey ? beatOf(ctx.data, nextKey) : null;
  if (next) activateBeat(state, next.key);

  // Pushed in reverse display order: the last push is shown first.
  // Arrival beats at the current system start from afterChoice once the player is back at the console.
  if (next?.trigger === 'auto') state.scenes.push({ type: 'beat', key: next.key });
  // The end of the Act 3 chain starts the epilogue.
  if (!next && beat.act === 3 && inAct3(state) && state.story.flags.ACT3_PHASE === 'BATTLE') beginEpilogue(state, ctx);
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

/** Follows `next` past beats whose only_if is not met. Null when the chain ends. */
export function resolveNext(state: GameState, ctx: Ctx, key: string | null | undefined): string | null {
  let k = key ?? null;
  for (let guard = 0; k && guard < 100; guard++) {
    const beat = beatOf(ctx.data, k);
    if (allMet(state, beat.only_if)) return k;
    k = beat.next;
  }
  return k;
}

/** On defeat at Low Hearthfire, a crew member is lost (story.md 9.1). */
function crewAtRisk(state: GameState, ctx: Ctx, who: string): Line[] {
  if (hearthfireBand(ctx.data.config, state.resources.hearthfire).modifier >= 0) return [];
  const candidates = who === 'ANY' ? state.crew.filter((k) => !crewSafe(ctx.data, state, k)) : state.crew.filter((k) => k === who);
  const lost = candidates.includes('YLSA') ? 'YLSA' : candidates[0];
  if (!lost) return [];
  state.story.crew_lost.push(lost);
  state.story.flags.CREW_LOST = true;
  state.crew = state.crew.filter((k) => k !== lost);
  return [{ text: `${crewOf(ctx.data, lost).display_name} does not make it back.`, tone: 'bad' }];
}

/** The first active beat waiting at the current location, if any (for arrival triggers). */
export function arrivalBeat(state: GameState, ctx: Ctx): string | null {
  if (inAct3(state)) return null;
  for (const key of state.story.active_beats) {
    if (state.story.deferred_beats.includes(key)) continue;
    const beat = beatOf(ctx.data, key);
    if (beat.trigger === 'arrival' && beat.location === state.location) return key;
  }
  return null;
}

/** One line per active beat. Thread beats are prefixed with the thread title. */
export function currentObjectives(state: GameState, ctx: Ctx): string[] {
  const act3 = act3Objective(state, ctx);
  if (act3) return [act3];
  const out: string[] = [];
  for (const key of state.story.active_beats) {
    const beat = beatOf(ctx.data, key);
    const thread = beat.thread
      ? threadOf(ctx.data, beat.thread).title
      : beat.quest
        ? ctx.data.post_quests.find((q) => q.key === beat.quest)!.title
        : null;
    out.push(thread ? `${thread}: ${beat.objective}` : beat.objective);
  }
  const hint = musterHint(state, ctx);
  if (hint) out.push(hint);
  if (!out.length && state.story.acts_completed.length) out.push('Free play. Fly where you like.');
  return out;
}

/** Story milestones checked whenever the player is back at the console. Returns true if a screen was queued. */
export function progressChecks(state: GameState, ctx: Ctx): boolean {
  const cfg = ctx.data.config;
  const s = state.story;
  if (s.acts_completed.includes(1) && !s.flags.ACT2_STARTED) {
    s.flags.ACT2_STARTED = true;
    const lines: Line[] = [];
    for (const m of cfg.ACT2_THREAD_MESSAGES) lines.push(...receiveMessage(state, ctx, m));
    return showActEvent(state, ctx, 'ACT2_STARTED', lines);
  }
  if (s.post_game) return sagaComplete(state, ctx);
  if (s.flags.ACT3_STARTED) return false;
  // The meter reaching 100 starts Act 3 at once, ready or not (story.md 6.6).
  if ((s.waaagh_meter ?? 0) >= cfg.WAAAGH_LAUNCH) {
    startAct3(state, ctx, true);
    return showActEvent(state, ctx, 'WAAAGH_LAUNCHED');
  }
  if (s.threads_completed.length >= cfg.THREADS_REQUIRED && !s.act_events_shown.includes('ACT3_UNLOCKED'))
    return showActEvent(state, ctx, 'ACT3_UNLOCKED');
  return false;
}

/** Post-game quests open to this run (story.md 7.7). */
export function availableQuests(state: GameState, ctx: Ctx) {
  return ctx.data.post_quests.filter((q) => allMet(state, q.requirements));
}

/** Once every quest open to this run is done, the saga is complete (free roam goes on). */
function sagaComplete(state: GameState, ctx: Ctx): boolean {
  const s = state.story;
  if (s.flags.SAGA_COMPLETE) return false;
  const open = availableQuests(state, ctx);
  if (!open.length || !open.every((q) => s.post_quests_completed.includes(q.key))) return false;
  s.flags.SAGA_COMPLETE = true;
  state.scenes.push({ type: 'notice', title: 'The saga is complete', lines: [{ text: resolveText(ctx.data.endings.saga_complete, state) }] });
  return true;
}

function showActEvent(state: GameState, ctx: Ctx, key: string, extra: Line[] = []): boolean {
  state.story.act_events_shown.push(key);
  const ev = actEventOf(ctx.data, key);
  state.scenes.push({ type: 'notice', title: ev.title, lines: [{ text: resolveText(ev.text, state) }, ...(extra.length ? [{ text: '' }, ...extra] : [])] });
  return true;
}
