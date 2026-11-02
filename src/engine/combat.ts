// Combat: personal (stances vs Resolve) and ship (power pips vs Hull). combat-system.md, Phase 1 plus part of Phase 2.
import { roll, describeRoll, type Modifier } from './roll';
import { pick, weightedPick } from './rng';
import { applyEffects } from './effects';
import type { CombatAction, Effect } from './schema';
import {
  consoleActionFor,
  encounterOf,
  enemyOf,
  enemyShipOf,
  generalModifiers,
  hasPassive,
  moduleCap,
  reactorPips,
  recordRoll,
  statLabel,
  subclassOf,
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
  ShipAlloc,
  ShipCombat,
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
  if (enc.mode === 'personal') {
    const combat: PersonalCombat = {
      mode: 'personal',
      buffs: freshBuffs(),
      encounter: enc.key,
      enemy_index: 0,
      enemy: freshEnemy(ctx, enc.enemies[0]),
      round: 0,
      intent: 'aggressive',
      read: 'clear',
      vague_pair: ['aggressive', 'guarded'],
      telegraph: '',
      advantage: false,
      enemy_bonus: 0,
      last: [{ text: enc.intro }],
      then,
    };
    newPersonalRound(state, ctx, combat);
    return combat;
  }
  const ship = enemyShipOf(ctx.data, enc.enemies[0]);
  const combat: ShipCombat = {
    mode: 'ship',
    buffs: freshBuffs(),
    encounter: enc.key,
    enemy: { key: ship.key, hull: ship.hull, hull_max: ship.hull },
    round: 0,
    enemy_alloc: { weapons: 0, shields: 0, engines: 0 },
    hint: '',
    pending_weapons: null,
    last: [{ text: enc.intro }],
    then,
  };
  newShipRound(state, ctx, combat);
  return combat;
}

function freshEnemy(ctx: Ctx, key: string) {
  const e = enemyOf(ctx.data, key);
  return { key, resolve: e.resolve, resolve_max: e.resolve };
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
  const enemy = enemyOf(ctx.data, combat.enemy.key);
  combat.round++;
  combat.intent = weightedPick(ctx.rng, enemy.intent_weights);
  combat.telegraph = pick(ctx.rng, enemy.telegraphs[combat.intent]);
  const read = roll(ctx.rng, ctx.data.config, 'wits', state.character.stats.wits, [{ label: 'Read bonus', value: readBonus(state, ctx) }], enemy.read_difficulty);
  combat.read = combat.buffs.reveal || read.tier === 'critical' || read.tier === 'success' ? 'clear' : 'vague';
  const other = pick(ctx.rng, INTENTS.filter((i) => i !== combat.intent));
  combat.vague_pair = ctx.rng.next() < 0.5 ? [combat.intent, other] : [other, combat.intent];
}

export function personalRound(state: GameState, ctx: Ctx, combat: PersonalCombat, stance: Stance): RoundOutcome {
  const cfg = ctx.data.config;
  const enemy = enemyOf(ctx.data, combat.enemy.key);
  const c = state.character;
  if (stance === 'negotiate' && !enemy.negotiable) throw new Error('This enemy will not talk');

  const stat = STANCE_STAT[stance];
  const mods: Modifier[] = generalModifiers(state, ctx.data, stat, 'personal');
  const matchup = matchupModifier(ctx, stance, combat.intent);
  if (matchup && matchup.value !== 0) mods.push(matchup);
  if (combat.advantage) {
    mods.push({ label: 'Advantage', value: cfg.COMBAT_ADVANTAGE_BONUS });
    combat.advantage = false;
  }
  const baseDc = stance === 'negotiate' ? enemy.negotiation_difficulty : enemy.defense_difficulty;
  const dc = baseDc + combat.enemy_bonus;
  combat.enemy_bonus = 0;

  mods.push(...buffModifiers(state, ctx, combat));
  if (stance === 'negotiate' && combat.buffs.negotiate_bonus)
    mods.push({ label: 'Negotiating edge', value: combat.buffs.negotiate_bonus });
  const r = roll(ctx.rng, cfg, stat, c.stats[stat], mods, dc);
  recordRoll(ctx, r, `${stance.charAt(0).toUpperCase()}${stance.slice(1)} vs ${enemy.display_name}`);
  let [dealt, taken] = cfg.COMBAT_DAMAGE_TABLE[r.tier];
  const trait = traitCombat(state, ctx);
  const good = r.tier === 'critical' || r.tier === 'success';
  const lines: Line[] = [{ text: describeRoll(r, statLabel(ctx.data, stat)), tone: good ? 'good' : r.tier === 'partial' ? 'accent' : 'bad' }];

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
  if (combat.enemy.hull <= 0) {
    lines.push({ text: `${enemyShipOf(ctx.data, combat.enemy.key).display_name} is disabled.`, tone: 'good' });
    return { lines, result: 'victory_broken' };
  }
  newShipRound(state, ctx, combat);
  return { lines, result: null };
}

export function withdrawLock(ctx: Ctx, combat: CombatState): string | undefined {
  if (combat.buffs.auto_withdraw) return undefined;
  if (!ctx.data.config.WITHDRAW_ENABLED || !encounterOf(ctx.data, combat.encounter).allow_withdraw) return 'No way out of this one';
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
  const alloc: ShipAlloc = { weapons: 0, shields: 0, engines: 0 };
  for (let i = 0; i < ship.reactor_pips; i++) {
    const open = (Object.keys(alloc) as (keyof ShipAlloc)[]).filter((k) => alloc[k] < ship.system_caps[k]);
    if (!open.length) break;
    const weights = Object.fromEntries(open.map((k) => [k, ship.allocation_weights[k]])) as Record<keyof ShipAlloc, number>;
    alloc[weightedPick(ctx.rng, weights)]++;
  }
  combat.enemy_alloc = alloc;
  combat.hint = scannerHint(state.ship.modules.scanner, alloc);
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

  const r = shipExchangeRoll(state, ctx, combat, alloc, `Exchange of fire vs ${enemyShip.display_name}`);
  const { dealt, taken } = shipDamage(state, ctx, combat, alloc, r.tier);
  combat.enemy.hull = Math.max(0, combat.enemy.hull - dealt);
  state.ship.hull = Math.max(0, state.ship.hull - taken);

  const good = r.tier === 'critical' || r.tier === 'success';
  const lines: Line[] = [
    { text: `You set Weapons ${alloc.weapons}, Shields ${alloc.shields}, Engines ${alloc.engines}. They ran Weapons ${combat.enemy_alloc.weapons}, Shields ${combat.enemy_alloc.shields}, Engines ${combat.enemy_alloc.engines}.`, tone: 'muted' },
    { text: describeRoll(r, statLabel(ctx.data, 'nerve')), tone: good ? 'good' : r.tier === 'partial' ? 'accent' : 'bad' },
    { text: `You deal ${dealt} Hull damage. You take ${taken}.` },
  ];
  return afterShipExchange(state, ctx, combat, lines);
}

/** Nerve + your engine pips vs the enemy's defense + their engine pips. */
function shipExchangeRoll(state: GameState, ctx: Ctx, combat: ShipCombat, alloc: ShipAlloc, context: string) {
  const enemyShip = enemyShipOf(ctx.data, combat.enemy.key);
  const mods = [...generalModifiers(state, ctx.data, 'nerve', 'ship'), ...buffModifiers(state, ctx, combat)];
  if (alloc.engines) mods.push({ label: 'Engines', value: alloc.engines });
  const dc = enemyShip.defense_difficulty + combat.enemy_alloc.engines;
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
  return { dealt, taken };
}

function afterShipExchange(state: GameState, ctx: Ctx, combat: ShipCombat, lines: Line[]): RoundOutcome {
  const enemyShip = enemyShipOf(ctx.data, combat.enemy.key);
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
  const r = shipExchangeRoll(state, ctx, combat, alloc, `Withdraw from ${enemyShip.display_name}`);
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
