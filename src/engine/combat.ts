// Phase 1 combat: personal (stances vs Resolve) and ship (power pips vs Hull). combat-system.md.
import { roll, describeRoll, type Modifier } from './roll';
import { pick, weightedPick } from './rng';
import {
  encounterOf,
  enemyOf,
  enemyShipOf,
  generalModifiers,
  hasPassive,
  moduleCap,
  reactorPips,
  recordRoll,
  statLabel,
  type Ctx,
} from './rules';
import type {
  CombatThen,
  GameState,
  Intent,
  Line,
  PersonalCombat,
  ShipAlloc,
  ShipCombat,
  Stance,
  StatKey,
} from './types';

export type CombatResult = 'victory_broken' | 'victory_negotiated' | 'defeat';

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
  combat.read = read.tier === 'critical' || read.tier === 'success' ? 'clear' : 'vague';
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

  const r = roll(ctx.rng, cfg, stat, c.stats[stat], mods, dc);
  recordRoll(ctx, r, `${stance.charAt(0).toUpperCase()}${stance.slice(1)} vs ${enemy.display_name}`);
  let [dealt, taken] = cfg.COMBAT_DAMAGE_TABLE[r.tier];
  const good = r.tier === 'critical' || r.tier === 'success';
  const lines: Line[] = [{ text: describeRoll(r, statLabel(ctx.data, stat)), tone: good ? 'good' : r.tier === 'partial' ? 'accent' : 'bad' }];

  switch (stance) {
    case 'attack':
      if (good) dealt += cfg.COMBAT_ATTACK_DEALT_BONUS;
      else taken += cfg.COMBAT_ATTACK_TAKEN_PENALTY;
      break;
    case 'defend':
      taken = Math.max(0, taken - cfg.COMBAT_DEFEND_REDUCTION);
      dealt = Math.max(0, dealt - cfg.COMBAT_DEFEND_REDUCTION);
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

  if (taken > 0) taken += enemy.damage_bonus;
  const wasHit = taken > 0;
  if (wasHit) {
    if (hasPassive(ctx.data, c, 'PLATED_BULWARK')) {
      taken = Math.max(0, taken - cfg.PLATED_BULWARK_REDUCTION);
      lines.push({ text: `Plated Bulwark absorbs the blow (-${cfg.PLATED_BULWARK_REDUCTION} damage, +${cfg.PLATED_BULWARK_WEAR_PER_HIT} Wear).`, tone: 'teal' });
      c.wear = Math.min(cfg.WEAR_MAX, (c.wear ?? 0) + cfg.PLATED_BULWARK_WEAR_PER_HIT);
    } else if (hasPassive(ctx.data, c, 'HOLD_THE_LINE')) {
      taken = Math.max(0, taken - cfg.HOLD_THE_LINE_REDUCTION);
      lines.push({ text: `You Hold the Line (-${cfg.HOLD_THE_LINE_REDUCTION} damage).`, tone: 'teal' });
    }
  }

  combat.enemy.resolve = Math.max(0, combat.enemy.resolve - dealt);
  c.health = Math.max(0, c.health - taken);
  if (c.wear !== null && taken > 0) c.wear = Math.min(cfg.WEAR_MAX, c.wear + taken * cfg.COMBAT_WEAR_PER_HEALTH_DAMAGE);

  const verb = stance === 'negotiate' ? 'Your words cost' : 'You deal';
  lines.push({ text: `${verb} ${enemy.display_name} ${dealt} Resolve. You take ${taken} damage.`, tone: 'normal' });

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
    return { lines, result: stance === 'negotiate' ? 'victory_negotiated' : 'victory_broken' };
  }
  newPersonalRound(state, ctx, combat);
  return { lines, result: null };
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

  const mods = generalModifiers(state, ctx.data, 'nerve', 'ship');
  if (alloc.engines) mods.push({ label: 'Engines', value: alloc.engines });
  const r = roll(ctx.rng, cfg, 'nerve', state.character.stats.nerve, mods, enemyShip.defense_difficulty);
  recordRoll(ctx, r, `Exchange of fire vs ${enemyShip.display_name}`);
  const incoming = combat.enemy_alloc.weapons;
  let dealt = 0;
  let taken = 0;
  switch (r.tier) {
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
  combat.enemy.hull = Math.max(0, combat.enemy.hull - dealt);
  state.ship.hull = Math.max(0, state.ship.hull - taken);

  const good = r.tier === 'critical' || r.tier === 'success';
  const lines: Line[] = [
    { text: `You set Weapons ${alloc.weapons}, Shields ${alloc.shields}, Engines ${alloc.engines}. They ran Weapons ${combat.enemy_alloc.weapons}, Shields ${combat.enemy_alloc.shields}, Engines ${combat.enemy_alloc.engines}.`, tone: 'muted' },
    { text: describeRoll(r, statLabel(ctx.data, 'nerve')), tone: good ? 'good' : r.tier === 'partial' ? 'accent' : 'bad' },
    { text: `You deal ${dealt} Hull damage. You take ${taken}.` },
  ];
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
