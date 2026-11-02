// Combat: personal (stances vs Resolve) and ship (power pips vs Hull). combat-system.md, Phase 1 plus part of Phase 2.
import { roll, describeRoll, type Modifier } from './roll';
import { pick, weightedPick } from './rng';
import { applyEffects } from './effects';
import type { CombatAction, Effect } from './schema';
import { allMet } from './conditions';
import {
  consoleActionFor,
  encounterOf,
  enemyOf,
  enemyShipOf,
  generalModifiers,
  hasPassive,
  injuryName,
  moduleCap,
  reactorPips,
  recordRoll,
  statLabel,
  subclassOf,
  waaaghBand,
  type Ctx,
} from './rules';
import { freshBuffs } from './types';
import type {
  CombatState,
  CombatThen,
  GameState,
  Intent,
  Line,
  PersonalCombat,
  RangeBand,
  ShipAlloc,
  ShipCombat,
  ShipTarget,
  Stance,
  StatKey,
  Tier,
} from './types';

export type CombatResult = 'victory_broken' | 'victory_negotiated' | 'defeat' | 'withdrew';

export interface RoundOutcome {
  lines: Line[];
  result: CombatResult | null;
}

const INTENTS: Intent[] = ['aggressive', 'guarded', 'evasive'];

export const STANCE_STAT: Record<Stance, StatKey> = {
  attack: 'grit',
  defend: 'grit',
  outmaneuver: 'nerve',
  negotiate: 'silver_tongue',
};

const COUNTERS: Record<Exclude<Stance, 'negotiate'>, Intent> = {
  attack: 'evasive',
  defend: 'aggressive',
  outmaneuver: 'guarded',
};

const BAD: Record<Exclude<Stance, 'negotiate'>, Intent> = {
  attack: 'guarded',
  outmaneuver: 'aggressive',
  defend: 'evasive',
};

export function matchupModifier(ctx: Ctx, stance: Stance, intent: Intent): Modifier | null {
  if (stance === 'negotiate') return null;
  const cfg = ctx.data.config;
  if (COUNTERS[stance] === intent) return { label: 'Matched counter', value: cfg.COMBAT_MATCHED_BONUS };
  if (BAD[stance] === intent) return { label: 'Bad matchup', value: cfg.COMBAT_BAD_MATCHUP_PENALTY };
  return { label: 'Neutral', value: 0 };
}

export function startCombat(state: GameState, ctx: Ctx, encounterKey: string, then: CombatThen): PersonalCombat | ShipCombat {
  const enc = encounterOf(ctx.data, encounterKey);
  const buffs = freshBuffs();
  const last: Line[] = [{ text: enc.intro }];
  // Story modifiers: the encounter's own (Act 3 rewards and so on), then any queued by next_fight effects.
  let scale = enc.waaagh_scaling ? waaaghScale(state, ctx) : 1;
  let damage = 0;
  for (const m of enc.modifiers) {
    if (!allMet(state, m.requirements)) continue;
    last.push({ text: m.text, tone: 'teal' });
    if (m.roll_bonus) buffs.mods.push({ label: m.text.replace(/[.!]+$/, ''), value: m.roll_bonus, rolls: null });
    if (m.enemy_scale) scale *= m.enemy_scale;
    if (m.enemy_damage) damage += m.enemy_damage;
  }
  if (scale !== 1 && enc.waaagh_scaling) last.push({ text: scaleText(scale), tone: scale > 1 ? 'bad' : 'good' });
  buffs.mods.push(...state.pending_fight_mods);
  state.pending_fight_mods = [];

  if (enc.mode === 'personal') {
    const enemy = freshEnemy(ctx, enc.enemies[0]);
    enemy.resolve_max = Math.max(1, Math.round(enemy.resolve_max * scale));
    enemy.resolve = Math.max(1, enemy.resolve_max - damage);
    const combat: PersonalCombat = {
      mode: 'personal',
      buffs,
      encounter: enc.key,
      enemy_index: 0,
      enemy,
      round: 0,
      intent: 'aggressive',
      read: 'clear',
      shown_intent: 'aggressive',
      vague_pair: ['aggressive', 'guarded'],
      streak: { stance: null, count: 0 },
      telegraph: '',
      advantage: false,
      enemy_bonus: 0,
      last,
      then,
    };
    newPersonalRound(state, ctx, combat);
    return combat;
  }
  const ship = enemyShipOf(ctx.data, enc.enemies[0]);
  const hullMax = Math.max(1, Math.round(ship.hull * scale));
  const range = enc.start_range ?? 'medium';
  const combat: ShipCombat = {
    mode: 'ship',
    buffs,
    encounter: enc.key,
    enemy: { key: ship.key, hull: Math.max(1, hullMax - damage), hull_max: hullMax },
    round: 0,
    enemy_alloc: { weapons: 0, shields: 0, engines: 0 },
    hint: '',
    pending_weapons: null,
    range,
    range_pref: range,
    target: 'hull',
    knocked: { weapons: 0, shields: 0, engines: 0 },
    last,
    then,
  };
  newShipRound(state, ctx, combat);
  return combat;
}

/** Act 3 fleet strength (story.md 6.7.3): weaker when the Waaagh! is low, strongest when it launched by itself. */
export function waaaghScale(state: GameState, ctx: Ctx): number {
  const scales = ctx.data.config.ACT3_WAVE_HULL_SCALE;
  if (state.story.flags.ACT3_FORCED) return scales.launched;
  const band = waaaghBand(ctx.data.config, state.story.waaagh_meter).band;
  if (band === 'SCATTERED') return scales.scattered;
  if (band === 'GATHERING') return scales.gathering;
  return band === 'LAUNCHED' ? scales.launched : scales.rising;
}

function scaleText(scale: number): string {
  const pct = Math.round(Math.abs(scale - 1) * 100);
  return scale > 1 ? `The Waaagh! is at full strength: enemy Hull +${pct}%.` : `The Waaagh! is scattered: enemy Hull -${pct}%.`;
}

function freshEnemy(ctx: Ctx, key: string) {
  const e = enemyOf(ctx.data, key);
  return { key, resolve: e.resolve, resolve_max: e.resolve };
}

/** Adds a random injury the player does not have yet (combat-system.md 3.8). */
export function gainInjury(state: GameState, ctx: Ctx, lines: Line[]): void {
  const c = state.character;
  if (c.injuries.length >= ctx.data.config.INJURY_MAX) return;
  const open = ctx.data.injuries.filter((i) => !c.injuries.includes(i.key));
  if (!open.length) return;
  const injury = open[ctx.rng.int(0, open.length - 1)];
  c.injuries.push(injury.key);
  lines.push({ text: `Injury: ${injuryName(ctx.data, c, injury.key)} (${injury.value} ${statLabel(ctx.data, injury.stat)} until treated).`, tone: 'bad' });
}

// ---------- Personal combat ----------

export function readBonus(state: GameState, ctx: Ctx): number {
  const cfg = ctx.data.config;
  if (hasPassive(ctx.data, state.character, 'SENSOR_SUITE')) return cfg.SENSOR_SUITE_READ_BONUS;
  if (hasPassive(ctx.data, state.character, 'SHARP_SENSES')) return cfg.SHARP_SENSES_READ_BONUS;
  return 0;
}

/** Picks the enemy's intent and how clearly the player reads it (Wits + read bonus vs read_difficulty). */
export function newPersonalRound(state: GameState, ctx: Ctx, combat: PersonalCombat): void {
  const cfg = ctx.data.config;
  const enemy = enemyOf(ctx.data, combat.enemy.key);
  const duel = encounterOf(ctx.data, combat.encounter).duel;
  combat.round++;
  const adapting = duel && combat.streak.stance !== null && combat.streak.stance !== 'negotiate' && combat.streak.count >= cfg.DUEL_ADAPT_AFTER;
  if (adapting) combat.intent = BAD[combat.streak.stance as Exclude<Stance, 'negotiate'>];
  else combat.intent = weightedPick(ctx.rng, duel ? habitWeights(state, ctx, enemy.intent_weights) : enemy.intent_weights);
  combat.telegraph = pick(ctx.rng, enemy.telegraphs[combat.intent]);
  if (adapting) combat.telegraph += " He's seen that before.";
  const read = roll(ctx.rng, cfg, 'wits', state.character.stats.wits, [{ label: 'Read bonus', value: readBonus(state, ctx) }], enemy.read_difficulty);
  combat.read = combat.buffs.reveal || read.tier === 'critical' || read.tier === 'success' ? 'clear' : 'vague';
  combat.shown_intent = combat.intent;
  const other = pick(ctx.rng, INTENTS.filter((i) => i !== combat.intent));
  combat.vague_pair = ctx.rng.next() < 0.5 ? [combat.intent, other] : [other, combat.intent];
  // A deceptive enemy can turn a vague read into a false one (combat-system.md 3.2).
  if (combat.read === 'vague' && enemy.deceptive && ctx.rng.next() < cfg.MISLEAD_CHANCE) {
    combat.read = 'misleading';
    combat.shown_intent = other;
    combat.telegraph = pick(ctx.rng, enemy.telegraphs[other]);
  }
}

/** A duelist leans toward the intent that punishes the player's favourite stance. */
function habitWeights(state: GameState, ctx: Ctx, weights: Record<Intent, number>): Record<Intent, number> {
  const counts = state.stance_counts;
  const stances = ['attack', 'defend', 'outmaneuver'] as const;
  const fav = stances.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  if (!counts[fav]) return weights;
  return { ...weights, [BAD[fav]]: weights[BAD[fav]] + ctx.data.config.DUEL_HABIT_WEIGHT };
}

/** Leverage sources the player has against this enemy, capped at LEVERAGE_MAX (combat-system.md 3.6). */
export function leverageModifiers(state: GameState, ctx: Ctx, combat: PersonalCombat): Modifier[] {
  const cfg = ctx.data.config;
  const out: Modifier[] = [];
  let left = cfg.LEVERAGE_MAX;
  for (const l of enemyOf(ctx.data, combat.enemy.key).leverage) {
    if (left <= 0) break;
    if (l.scan && !combat.buffs.reveal) continue;
    if (!allMet(state, l.requirements)) continue;
    const value = Math.min(cfg.LEVERAGE_BONUS, left);
    out.push({ label: `Leverage: ${l.text}`, value });
    left -= value;
  }
  return out;
}

/** What it takes to talk this enemy down: hardened enemies are tougher without leverage. */
export function negotiationDifficulty(state: GameState, ctx: Ctx, combat: PersonalCombat): number {
  const enemy = enemyOf(ctx.data, combat.enemy.key);
  const hard = enemy.hardened && !leverageModifiers(state, ctx, combat).length ? ctx.data.config.HARDENED_NEGOTIATION_PENALTY : 0;
  return enemy.negotiation_difficulty + hard + combat.enemy_bonus;
}

export function negotiateLock(ctx: Ctx, combat: PersonalCombat): string | undefined {
  if (!enemyOf(ctx.data, combat.enemy.key).negotiable) return 'Will not talk';
  if (encounterOf(ctx.data, combat.encounter).duel) return 'No talking in a duel';
  return undefined;
}

/** The intent the player believes: the true one, or the false one on a misleading read. */
export function apparentIntent(combat: PersonalCombat): Intent {
  return combat.read === 'misleading' ? combat.shown_intent : combat.intent;
}

export function personalRound(state: GameState, ctx: Ctx, combat: PersonalCombat, stance: Stance): RoundOutcome {
  const cfg = ctx.data.config;
  const enemy = enemyOf(ctx.data, combat.enemy.key);
  const c = state.character;
  if (stance === 'negotiate') {
    const lock = negotiateLock(ctx, combat);
    if (lock) throw new Error(lock);
  }
  state.stance_counts[stance]++;
  combat.streak = combat.streak.stance === stance ? { stance, count: combat.streak.count + 1 } : { stance, count: 1 };

  const stat = STANCE_STAT[stance];
  const mods: Modifier[] = generalModifiers(state, ctx.data, stat, 'personal');
  const matchup = matchupModifier(ctx, stance, combat.intent);
  if (matchup && matchup.value !== 0) mods.push(matchup);
  if (combat.advantage) {
    mods.push({ label: 'Advantage', value: cfg.COMBAT_ADVANTAGE_BONUS });
    combat.advantage = false;
  }
  const dc = stance === 'negotiate' ? negotiationDifficulty(state, ctx, combat) : enemy.defense_difficulty + combat.enemy_bonus;
  combat.enemy_bonus = 0;

  mods.push(...buffModifiers(state, ctx, combat));
  if (stance === 'negotiate') {
    if (combat.buffs.negotiate_bonus) mods.push({ label: 'Negotiating edge', value: combat.buffs.negotiate_bonus });
    mods.push(...leverageModifiers(state, ctx, combat));
  }
  const r = roll(ctx.rng, cfg, stat, c.stats[stat], mods, dc);
  recordRoll(ctx, r, `${stance.charAt(0).toUpperCase()}${stance.slice(1)} vs ${enemy.display_name}`);
  let [dealt, taken] = cfg.COMBAT_DAMAGE_TABLE[r.tier];
  const trait = traitCombat(state, ctx);
  const good = r.tier === 'critical' || r.tier === 'success';
  const lines: Line[] = [];
  if (combat.read === 'misleading' && stance !== 'negotiate')
    lines.push({ text: `It was a feint! ${enemy.display_name} was really ${combat.intent}.`, tone: 'bad' });
  lines.push({ text: describeRoll(r, statLabel(ctx.data, stat)), tone: good ? 'good' : r.tier === 'partial' ? 'accent' : 'bad' });

  switch (stance) {
    case 'attack':
      if (good) dealt += cfg.COMBAT_ATTACK_DEALT_BONUS;
      else taken += cfg.COMBAT_ATTACK_TAKEN_PENALTY;
      break;
    case 'defend':
      taken = Math.max(0, taken - cfg.COMBAT_DEFEND_REDUCTION - (trait?.defend_reduction ?? 0));
      dealt = Math.max(0, dealt - cfg.COMBAT_DEFEND_REDUCTION);
      if (good && trait?.defend_advantage) {
        combat.advantage = true;
        lines.push({ text: `Patient Hunter: you gain Advantage (+${cfg.COMBAT_ADVANTAGE_BONUS} to your next roll).`, tone: 'teal' });
      }
      break;
    case 'outmaneuver':
      if (good) {
        combat.advantage = true;
        lines.push({ text: `You gain Advantage (+${cfg.COMBAT_ADVANTAGE_BONUS} to your next roll).`, tone: 'teal' });
      }
      break;
    case 'negotiate':
      taken = 0;
      if (r.tier === 'failure') {
        combat.enemy_bonus = cfg.NEGOTIATE_FAILURE_ENEMY_BONUS;
        lines.push({ text: `Your words fall flat. The enemy repositions (+${cfg.NEGOTIATE_FAILURE_ENEMY_BONUS} to their next defense).`, tone: 'muted' });
      }
      break;
  }

  taken = takePersonalDamage(state, ctx, combat, taken, lines);
  combat.enemy.resolve = Math.max(0, combat.enemy.resolve - dealt);
  const verb = stance === 'negotiate' ? 'Your words cost' : 'You deal';
  lines.push({ text: `${verb} ${enemy.display_name} ${dealt} Resolve. You take ${taken} damage.`, tone: 'normal' });
  return afterPersonalExchange(state, ctx, combat, lines, stance === 'negotiate' ? 'victory_negotiated' : 'victory_broken');
}

/** Applies incoming damage with the enemy's bonus and the player's passives. Returns damage actually taken. */
function takePersonalDamage(state: GameState, ctx: Ctx, combat: PersonalCombat, raw: number, lines: Line[]): number {
  const cfg = ctx.data.config;
  const c = state.character;
  const enemy = enemyOf(ctx.data, combat.enemy.key);
  let taken = raw;
  if (taken > 0) taken += enemy.damage_bonus;
  if (taken > 0) {
    if (hasPassive(ctx.data, c, 'PLATED_BULWARK')) {
      taken = Math.max(0, taken - cfg.PLATED_BULWARK_REDUCTION);
      lines.push({ text: `Plated Bulwark absorbs the blow (-${cfg.PLATED_BULWARK_REDUCTION} damage, +${cfg.PLATED_BULWARK_WEAR_PER_HIT} Wear).`, tone: 'teal' });
      c.wear = Math.min(cfg.WEAR_MAX, (c.wear ?? 0) + cfg.PLATED_BULWARK_WEAR_PER_HIT);
    } else if (hasPassive(ctx.data, c, 'HOLD_THE_LINE')) {
      taken = Math.max(0, taken - cfg.HOLD_THE_LINE_REDUCTION);
      lines.push({ text: `You Hold the Line (-${cfg.HOLD_THE_LINE_REDUCTION} damage).`, tone: 'teal' });
    }
  }
  c.health = Math.max(0, c.health - taken);
  if (c.wear !== null && taken > 0) c.wear = Math.min(cfg.WEAR_MAX, c.wear + taken * cfg.COMBAT_WEAR_PER_HEALTH_DAMAGE);
  if (taken >= cfg.INJURY_HIT_THRESHOLD && c.health > 0) gainInjury(state, ctx, lines);
  return taken;
}

/** Checks for defeat, a broken enemy, or the next enemy stepping up; otherwise starts the next round. */
function afterPersonalExchange(
  state: GameState,
  ctx: Ctx,
  combat: PersonalCombat,
  lines: Line[],
  victory: 'victory_broken' | 'victory_negotiated',
): RoundOutcome {
  const cfg = ctx.data.config;
  const c = state.character;
  const enemy = enemyOf(ctx.data, combat.enemy.key);
  if (c.health <= 0) {
    lines.push({ text: 'You go down.', tone: 'bad' });
    return { lines, result: 'defeat' };
  }
  if (c.wear !== null && c.wear >= cfg.WEAR_MAX) {
    lines.push({ text: 'Critical Wear. Your frame seizes and you collapse.', tone: 'bad' });
    return { lines, result: 'defeat' };
  }
  if (combat.enemy.resolve <= 0) {
    const enc = encounterOf(ctx.data, combat.encounter);
    if (combat.enemy_index + 1 < enc.enemies.length) {
      lines.push({ text: `${enemy.display_name} breaks and runs!`, tone: 'good' });
      combat.enemy_index++;
      combat.enemy = freshEnemy(ctx, enc.enemies[combat.enemy_index]);
      lines.push({ text: `${enemyOf(ctx.data, combat.enemy.key).display_name} steps up.`, tone: 'accent' });
      combat.advantage = false;
      combat.round = 0;
      newPersonalRound(state, ctx, combat);
      return { lines, result: null };
    }
    return { lines, result: victory };
  }
  newPersonalRound(state, ctx, combat);
  return { lines, result: null };
}

// ---------- Phase 2: buffs, console actions, traits, withdraw ----------

export function traitCombat(state: GameState, ctx: Ctx) {
  return subclassOf(ctx.data, state.character.subclass).trait.combat;
}

/** Roll modifiers from console-action buffs and encounter-tag traits. Consumes one "next rolls" charge unless peeking. */
export function buffModifiers(state: GameState, ctx: Ctx, combat: CombatState, peek = false): Modifier[] {
  const mods: Modifier[] = [];
  const b = combat.buffs;
  const action = consoleActionFor(ctx.data, state.character).name;
  if (b.fight_bonus) mods.push({ label: action, value: b.fight_bonus });
  if (b.next_rolls_left > 0) {
    mods.push({ label: action, value: b.next_rolls_bonus });
    if (!peek) b.next_rolls_left--;
  }
  for (const m of b.mods) if (m.rolls === null || m.rolls > 0) mods.push({ label: m.label, value: m.value });
  if (!peek) {
    for (const m of b.mods) if (m.rolls !== null) m.rolls--;
    b.mods = b.mods.filter((m) => m.rolls === null || m.rolls > 0);
  }
  mods.push(...tagModifiers(state, ctx, combat));
  return mods;
}

export function tagModifiers(state: GameState, ctx: Ctx, combat: CombatState): Modifier[] {
  const sub = subclassOf(ctx.data, state.character.subclass);
  const tags = encounterOf(ctx.data, combat.encounter).tags;
  const out: Modifier[] = [];
  for (const [tag, value] of Object.entries(sub.trait.combat?.tag_bonus ?? {}))
    if (tags.includes(tag)) out.push({ label: sub.trait.name, value });
  return out;
}

/** The console action's combat effect for this character (Ironkin overrides merged in), or null if none. */
export function combatActionFor(state: GameState, ctx: Ctx): CombatAction | null {
  const action = subclassOf(ctx.data, state.character.subclass).console_action;
  if (!action.combat) return null;
  return state.character.kin_type === 'IRONKIN' ? { ...action.combat, ...action.combat_ironkin } : action.combat;
}

export function combatActionLock(state: GameState, ctx: Ctx, combat: CombatState): string | undefined {
  const effect = combatActionFor(state, ctx);
  if (!effect) return 'No use in combat';
  if (!effect.modes.includes(combat.mode)) return combat.mode === 'ship' ? 'Not in ship combat' : 'Only in ship combat';
  if (combat.buffs.action_used) return 'Once per fight';
  if (effect.auto_withdraw && encounterOf(ctx.data, combat.encounter).inescapable) return 'There is no way out of this fight';
  return undefined;
}

/** Uses the console action instead of this round's stance or allocation. */
export function useCombatAction(state: GameState, ctx: Ctx, combat: CombatState): RoundOutcome {
  const lock = combatActionLock(state, ctx, combat);
  if (lock) throw new Error(lock);
  const effect = combatActionFor(state, ctx)!;
  const action = consoleActionFor(ctx.data, state.character);
  const b = combat.buffs;
  const c = state.character;
  b.action_used = true;
  const lines: Line[] = [{ text: `${action.name}!`, tone: 'accent' }];

  if (effect.fight_bonus) {
    b.fight_bonus += effect.fight_bonus;
    lines.push({ text: `+${effect.fight_bonus} to all your rolls for the rest of the fight.`, tone: 'teal' });
  }
  if (effect.next_rolls_bonus) {
    b.next_rolls_bonus = effect.next_rolls_bonus;
    b.next_rolls_left = effect.next_rolls_count ?? 1;
    lines.push({ text: `+${effect.next_rolls_bonus} to your next ${b.next_rolls_left} roll${b.next_rolls_left > 1 ? 's' : ''}.`, tone: 'teal' });
  }
  if (effect.negotiate_bonus) {
    b.negotiate_bonus += effect.negotiate_bonus;
    lines.push({ text: `+${effect.negotiate_bonus} to Negotiate for the rest of the fight.`, tone: 'teal' });
  }
  if (effect.reveal) {
    b.reveal = true;
    lines.push({ text: 'You can read every move they make for the rest of the fight.', tone: 'teal' });
  }
  if (effect.auto_withdraw) {
    b.auto_withdraw = true;
    lines.push({ text: 'Escape route plotted. Your next Withdraw will succeed.', tone: 'teal' });
  }
  if (effect.victory_hearthfire) b.victory_hearthfire += effect.victory_hearthfire;
  if (effect.defeat_hearthfire) b.defeat_hearthfire += effect.defeat_hearthfire;
  if (effect.health_cost) {
    c.health = Math.max(1, c.health - effect.health_cost);
    lines.push({ text: `-${effect.health_cost} Health`, tone: 'bad' });
  }
  const resources: Effect = {};
  if (effect.hearthfire) resources.hearthfire = effect.hearthfire;
  if (c.wear !== null) {
    const wear = action.wearCost + (effect.wear ?? 0);
    if (wear) resources.wear = wear;
  }
  if (effect.heal_hull && combat.mode === 'ship') resources.hull = effect.heal_hull;
  lines.push(...applyEffects(state, ctx, [resources], { nonLethal: true }));

  if (effect.instant_damage) {
    if (combat.mode === 'personal') combat.enemy.resolve = Math.max(0, combat.enemy.resolve - effect.instant_damage);
    else combat.enemy.hull = Math.max(0, combat.enemy.hull - effect.instant_damage);
    lines.push({ text: `You strike first: ${effect.instant_damage} damage.`, tone: 'good' });
  }

  if (combat.mode === 'personal') return afterPersonalExchange(state, ctx, combat, lines, 'victory_broken');
  return afterShipExchange(state, ctx, combat, lines);
}

export function withdrawLock(ctx: Ctx, combat: CombatState): string | undefined {
  const enc = encounterOf(ctx.data, combat.encounter);
  if (enc.inescapable) return 'No way out of this one';
  if (combat.buffs.auto_withdraw) return undefined;
  if (!ctx.data.config.WITHDRAW_ENABLED || !enc.allow_withdraw) return 'No way out of this one';
  return undefined;
}

/** Personal Withdraw: Nerve vs the enemy's defense. */
export function personalWithdraw(state: GameState, ctx: Ctx, combat: PersonalCombat): RoundOutcome {
  const lock = withdrawLock(ctx, combat);
  if (lock) throw new Error(lock);
  const lines: Line[] = [];
  if (combat.buffs.auto_withdraw) {
    lines.push({ text: 'You take the route you planned and are gone before they notice.', tone: 'good' });
    return { lines, result: 'withdrew' };
  }
  const cfg = ctx.data.config;
  const enemy = enemyOf(ctx.data, combat.enemy.key);
  const mods = [...generalModifiers(state, ctx.data, 'nerve', 'personal'), ...buffModifiers(state, ctx, combat)];
  const r = roll(ctx.rng, cfg, 'nerve', state.character.stats.nerve, mods, enemy.defense_difficulty + combat.enemy_bonus);
  recordRoll(ctx, r, `Withdraw from ${enemy.display_name}`);
  lines.push({ text: describeRoll(r, statLabel(ctx.data, 'nerve')), tone: r.tier === 'failure' ? 'bad' : 'good' });
  if (r.tier === 'critical' || r.tier === 'success') {
    lines.push({ text: 'You break away clean.', tone: 'good' });
    return { lines, result: 'withdrew' };
  }
  const taken = takePersonalDamage(state, ctx, combat, cfg.COMBAT_DAMAGE_TABLE[r.tier][1], lines);
  if (r.tier === 'partial') {
    lines.push({ text: `You get away, but take ${taken} damage on the way out.`, tone: 'accent' });
    if (state.character.health <= 0) return afterPersonalExchange(state, ctx, combat, lines, 'victory_broken');
    return { lines, result: 'withdrew' };
  }
  lines.push({ text: `They cut off your escape. You take ${taken} damage.`, tone: 'bad' });
  return afterPersonalExchange(state, ctx, combat, lines, 'victory_broken');
}

// ---------- Ship combat ----------

export function shipCaps(state: GameState, ctx: Ctx): ShipAlloc {
  const cfg = ctx.data.config;
  return {
    weapons: moduleCap(cfg, state.ship.modules.weapons),
    shields: moduleCap(cfg, state.ship.modules.shields),
    engines: moduleCap(cfg, state.ship.modules.engine),
  };
}

/** Weapons values that still leave a legal split for shields and engines. */
export function validWeaponChoices(state: GameState, ctx: Ctx): number[] {
  const pips = reactorPips(ctx.data.config, state.ship);
  const caps = shipCaps(state, ctx);
  const out: number[] = [];
  for (let w = 0; w <= Math.min(caps.weapons, pips); w++) if (pips - w <= caps.shields + caps.engines) out.push(w);
  return out;
}

export function validShieldChoices(state: GameState, ctx: Ctx, weapons: number): number[] {
  const pips = reactorPips(ctx.data.config, state.ship);
  const caps = shipCaps(state, ctx);
  const out: number[] = [];
  for (let s = 0; s <= Math.min(caps.shields, pips - weapons); s++) if (pips - weapons - s <= caps.engines) out.push(s);
  return out;
}

export function newShipRound(state: GameState, ctx: Ctx, combat: ShipCombat): void {
  const ship = enemyShipOf(ctx.data, combat.enemy.key);
  combat.round++;
  combat.pending_weapons = null;
  // Subsystem hits from last round cut that system's cap and the enemy's budget for this round.
  const k = combat.knocked;
  const caps: ShipAlloc = {
    weapons: Math.max(0, ship.system_caps.weapons - k.weapons),
    shields: Math.max(0, ship.system_caps.shields - k.shields),
    engines: Math.max(0, ship.system_caps.engines - k.engines),
  };
  const budget = Math.max(0, ship.reactor_pips - k.weapons - k.shields - k.engines);
  const knockedOut = (Object.keys(k) as (keyof ShipAlloc)[]).filter((s) => k[s] > 0);
  combat.knocked = { weapons: 0, shields: 0, engines: 0 };
  const alloc: ShipAlloc = { weapons: 0, shields: 0, engines: 0 };
  for (let i = 0; i < budget; i++) {
    const open = (Object.keys(alloc) as (keyof ShipAlloc)[]).filter((s) => alloc[s] < caps[s]);
    if (!open.length) break;
    const weights = Object.fromEntries(open.map((s) => [s, ship.allocation_weights[s]])) as Record<keyof ShipAlloc, number>;
    alloc[weightedPick(ctx.rng, weights)]++;
  }
  combat.enemy_alloc = alloc;
  combat.hint = scannerHint(state.ship.modules.scanner, alloc);
  if (knockedOut.length) combat.hint += ` Their ${knockedOut.map((s) => SYSTEM_NAMES[s]).join(' and ')} are still knocked out.`;
  if (state.ship.modules.scanner >= 2) combat.hint += ` They want to fight at ${ship.preferred_range} range.`;
}

export const RANGES: RangeBand[] = ['close', 'medium', 'long'];
export const TARGETS: ShipTarget[] = ['hull', 'weapons', 'shields', 'engines'];

/** Whoever puts more pips into engines gets the range they want (combat-system.md 4.3.1). */
export function resolveRange(ctx: Ctx, combat: ShipCombat, alloc: ShipAlloc): RangeBand {
  if (alloc.engines > combat.enemy_alloc.engines) return combat.range_pref;
  if (alloc.engines < combat.enemy_alloc.engines) return enemyShipOf(ctx.data, combat.enemy.key).preferred_range;
  return combat.range;
}

/** Fires Gitzbolt's weapon if it is still running. */
function superweaponFires(state: GameState, ctx: Ctx, combat: ShipCombat, lines: Line[]): void {
  if (!encounterOf(ctx.data, combat.encounter).superweapon || state.story.flags.SUPERWEAPON_DOWN) return;
  const dmg = ctx.data.config.SUPERWEAPON_DAMAGE;
  state.ship.hull = Math.max(0, state.ship.hull - dmg);
  lines.push({ text: `Gitzbolt's weapon fires! A beam of stolen ancestor-light rakes the fleet. You take ${dmg} Hull damage.`, tone: 'bad' });
}

export function counterKeyLock(state: GameState, ctx: Ctx, combat: ShipCombat): string | undefined {
  if (!encounterOf(ctx.data, combat.encounter).superweapon) return 'No super-weapon here';
  if (state.story.flags.SUPERWEAPON_DOWN) return 'The weapon is already silent';
  if (!state.story.story_rewards.includes('TECH_COUNTERKEY')) return 'Requires the counter-key (Thread B)';
  return undefined;
}

/** Uses the counter-key instead of this round's allocation: no roll, and the weapon stays down. */
export function useCounterKey(state: GameState, ctx: Ctx, combat: ShipCombat): RoundOutcome {
  const lock = counterKeyLock(state, ctx, combat);
  if (lock) throw new Error(lock);
  Object.assign(state.story.flags, { SUPERWEAPON_DOWN: true, COUNTERKEY_USED: true, CORE_RECOVERABLE: true });
  const lines: Line[] = [
    { text: 'You key the counter-signal.', tone: 'accent' },
    { text: "Across the void, Gitzbolt's gunship flickers and goes dark. The super-weapon is silent, and the Core inside it sleeps, unharmed.", tone: 'good' },
  ];
  newShipRound(state, ctx, combat);
  return { lines, result: null };
}

const SYSTEM_NAMES: Record<keyof ShipAlloc, string> = { weapons: 'weapons', shields: 'shields', engines: 'engines' };
const VAGUE_HINTS: Record<keyof ShipAlloc, string> = {
  weapons: 'Their gun decks are glowing hot.',
  shields: 'Their void shields are thickening.',
  engines: 'Their engines are flaring.',
};

export function scannerHint(scannerLevel: number, alloc: ShipAlloc): string {
  const top = (Object.keys(alloc) as (keyof ShipAlloc)[]).reduce((a, b) => (alloc[b] > alloc[a] ? b : a));
  if (scannerLevel >= 3) return `Scanner: Weapons ${alloc.weapons}, Shields ${alloc.shields}, Engines ${alloc.engines}.`;
  if (scannerLevel === 2) return `Scanner: heavy on ${SYSTEM_NAMES[top]}.`;
  return `Scanner: ${VAGUE_HINTS[top]}`;
}

export function shipRound(state: GameState, ctx: Ctx, combat: ShipCombat, alloc: ShipAlloc): RoundOutcome {
  const cfg = ctx.data.config;
  const enemyShip = enemyShipOf(ctx.data, combat.enemy.key);
  const caps = shipCaps(state, ctx);
  const pips = reactorPips(cfg, state.ship);
  if (alloc.weapons + alloc.shields + alloc.engines !== pips) throw new Error('All pips must be spent');
  if (alloc.weapons > caps.weapons || alloc.shields > caps.shields || alloc.engines > caps.engines)
    throw new Error('Allocation exceeds module caps');

  const lines: Line[] = [
    { text: `You set Weapons ${alloc.weapons}, Shields ${alloc.shields}, Engines ${alloc.engines}. They ran Weapons ${combat.enemy_alloc.weapons}, Shields ${combat.enemy_alloc.shields}, Engines ${combat.enemy_alloc.engines}.`, tone: 'muted' },
  ];
  const range = resolveRange(ctx, combat, alloc);
  if (range !== combat.range) lines.push({ text: `The range changes to ${range}.`, tone: 'teal' });
  combat.range = range;

  const target = combat.target;
  const r = shipExchangeRoll(state, ctx, combat, alloc, `Exchange of fire vs ${enemyShip.display_name}`, target !== 'hull' ? cfg.TARGET_DIFFICULTY : 0);
  const { dealt, taken } = shipDamage(state, ctx, combat, alloc, r.tier);
  combat.enemy.hull = Math.max(0, combat.enemy.hull - dealt);
  state.ship.hull = Math.max(0, state.ship.hull - taken);

  const good = r.tier === 'critical' || r.tier === 'success';
  lines.push(
    { text: describeRoll(r, statLabel(ctx.data, 'nerve')), tone: good ? 'good' : r.tier === 'partial' ? 'accent' : 'bad' },
    { text: `You deal ${dealt} Hull damage. You take ${taken}.` },
  );
  if (target !== 'hull' && good) {
    const pips = r.tier === 'critical' ? cfg.TARGET_PIPS_CRIT : cfg.TARGET_PIPS_SUCCESS;
    combat.knocked[target] += pips;
    lines.push({ text: `Direct hit on their ${SYSTEM_NAMES[target]}: -${pips} pip${pips > 1 ? 's' : ''} there next round.`, tone: 'good' });
  }
  return afterShipExchange(state, ctx, combat, lines);
}

/** Nerve + your engine pips vs the enemy's defense + their engine pips (+ targeting difficulty). */
function shipExchangeRoll(state: GameState, ctx: Ctx, combat: ShipCombat, alloc: ShipAlloc, context: string, extraDc = 0, extraMods: Modifier[] = []) {
  const enemyShip = enemyShipOf(ctx.data, combat.enemy.key);
  const mods = [...generalModifiers(state, ctx.data, 'nerve', 'ship'), ...buffModifiers(state, ctx, combat), ...extraMods];
  if (alloc.engines) mods.push({ label: 'Engines', value: alloc.engines });
  const dc = enemyShip.defense_difficulty + combat.enemy_alloc.engines + extraDc;
  const r = roll(ctx.rng, ctx.data.config, 'nerve', state.character.stats.nerve, mods, dc);
  recordRoll(ctx, r, context);
  return r;
}

/** Damage table (combat-system.md 4.3): enemy shields soak what you deal, your shields soak what you take. */
export function shipDamage(state: GameState, ctx: Ctx, combat: ShipCombat, alloc: ShipAlloc, tier: Tier) {
  const cfg = ctx.data.config;
  const incoming = combat.enemy_alloc.weapons;
  const soak = combat.enemy_alloc.shields;
  let dealt = 0;
  let taken = 0;
  switch (tier) {
    case 'critical':
      dealt = alloc.weapons * cfg.SHIP_CRIT_MULTIPLIER;
      break;
    case 'success':
      dealt = alloc.weapons;
      taken = Math.max(0, Math.floor(incoming / 2) - alloc.shields);
      break;
    case 'partial':
      dealt = alloc.weapons;
      taken = Math.max(0, incoming - alloc.shields);
      break;
    case 'failure':
      taken = Math.max(0, incoming - alloc.shields) + cfg.SHIP_FAILURE_EXTRA_DAMAGE;
      break;
  }
  dealt = Math.max(0, dealt - soak);
  taken = Math.max(0, taken - (traitCombat(state, ctx)?.ship_damage_reduction ?? 0));
  // Range bands (combat-system.md 4.3.1) only change real hits: a miss stays a miss.
  const shift = combat.range === 'close' ? cfg.RANGE_CLOSE_DAMAGE : combat.range === 'long' ? -cfg.RANGE_LONG_DAMAGE : 0;
  if (dealt > 0) dealt = Math.max(0, dealt + shift);
  if (taken > 0) taken = Math.max(0, taken + shift);
  return { dealt, taken };
}

function afterShipExchange(state: GameState, ctx: Ctx, combat: ShipCombat, lines: Line[]): RoundOutcome {
  const enemyShip = enemyShipOf(ctx.data, combat.enemy.key);
  if (combat.enemy.hull > 0) superweaponFires(state, ctx, combat, lines);
  if (state.ship.hull <= 0) {
    lines.push({ text: 'Your ship is crippled.', tone: 'bad' });
    return { lines, result: 'defeat' };
  }
  if (combat.enemy.hull <= 0) {
    lines.push({ text: `${enemyShip.display_name} is disabled.`, tone: 'good' });
    return { lines, result: 'victory_broken' };
  }
  newShipRound(state, ctx, combat);
  return { lines, result: null };
}

/** The forced allocation for a ship Withdraw: everything into Engines, the rest into Shields, then Weapons. */
export function withdrawAllocation(state: GameState, ctx: Ctx): ShipAlloc {
  const pips = reactorPips(ctx.data.config, state.ship);
  const caps = shipCaps(state, ctx);
  const engines = Math.min(caps.engines, pips);
  const shields = Math.min(caps.shields, pips - engines);
  return { weapons: pips - engines - shields, shields, engines };
}

/** Ship Withdraw: max Engines, Nerve + engines vs their defense + their engines. */
export function shipWithdraw(state: GameState, ctx: Ctx, combat: ShipCombat): RoundOutcome {
  const lock = withdrawLock(ctx, combat);
  if (lock) throw new Error(lock);
  const lines: Line[] = [];
  if (combat.buffs.auto_withdraw) {
    lines.push({ text: 'You follow your charted escape vector and jump clear.', tone: 'good' });
    return { lines, result: 'withdrew' };
  }
  const alloc = withdrawAllocation(state, ctx);
  const enemyShip = enemyShipOf(ctx.data, combat.enemy.key);
  const longRange = combat.range === 'long' ? [{ label: 'Long range', value: ctx.data.config.RANGE_LONG_WITHDRAW }] : [];
  const r = shipExchangeRoll(state, ctx, combat, alloc, `Withdraw from ${enemyShip.display_name}`, 0, longRange);
  lines.push({ text: `All power to engines: Engines ${alloc.engines}, Shields ${alloc.shields}.`, tone: 'muted' });
  lines.push({ text: describeRoll(r, statLabel(ctx.data, 'nerve')), tone: r.tier === 'failure' ? 'bad' : 'good' });
  if (r.tier === 'critical' || r.tier === 'success') {
    lines.push({ text: 'You burn hard and leave them behind.', tone: 'good' });
    return { lines, result: 'withdrew' };
  }
  const { taken } = shipDamage(state, ctx, combat, { ...alloc, weapons: 0 }, r.tier);
  state.ship.hull = Math.max(0, state.ship.hull - taken);
  if (r.tier === 'partial' && state.ship.hull > 0) {
    lines.push({ text: `You get clear, but take ${taken} Hull damage on the way out.`, tone: 'accent' });
    return { lines, result: 'withdrew' };
  }
  lines.push({ text: `They keep pace and rake your hull. You take ${taken}.`, tone: 'bad' });
  return afterShipExchange(state, ctx, combat, lines);
}
