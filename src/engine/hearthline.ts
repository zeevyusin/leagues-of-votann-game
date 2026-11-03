// Battle oaths and Hearthline crew commitments (combat-system.md Phase 3, items 1 and 4).
// Both are free actions in a fight: they change the fight without using the round.
import { applyEffects, scaleOathEffects } from './effects';
import { byKey, crewOf, maxHealth, type Ctx } from './rules';
import type { CombatResult } from './combat';
import type { CombatState, GameState, Line } from './types';

export const battleOathOf = (ctx: Ctx, key: string) => byKey(ctx.data.battle_oaths, key, 'battle oath');

/** Battle oaths are sworn in round 1, before the first choice. */
export function oathLock(combat: CombatState): string | undefined {
  if (combat.buffs.battle_oath) return 'Already sworn';
  if (combat.round > 1 || combat.buffs.action_used) return 'Only before the first round';
  return undefined;
}

export function swearBattleOath(ctx: Ctx, combat: CombatState, key: string): Line[] {
  if (oathLock(combat)) return [];
  const oath = battleOathOf(ctx, key);
  const b = combat.buffs;
  b.battle_oath = key;
  combat.menu = null;
  if (oath.all_rolls) b.mods.push({ label: oath.name, value: oath.all_rolls, rolls: null });
  if (oath.negotiate) b.negotiate_bonus += oath.negotiate;
  return [{ text: `You swear the ${oath.name}. ${oath.description}`, tone: 'accent' }];
}

/** Oath of the Unbowed breaks the moment Health (or Hull) drops below half. Called after every exchange. */
export function checkOathMidFight(state: GameState, ctx: Ctx, combat: CombatState, lines: Line[]): void {
  const b = combat.buffs;
  if (!b.battle_oath || b.oath_broken) return;
  if (battleOathOf(ctx, b.battle_oath).breaks_on !== 'below_half') return;
  const low =
    combat.mode === 'personal'
      ? state.character.health < maxHealth(ctx.data.config, state.character) / 2
      : state.ship.hull < state.ship.hull_max / 2;
  if (!low) return;
  b.oath_broken = true;
  lines.push({ text: `You are bowed. The ${battleOathOf(ctx, b.battle_oath).name} is broken.`, tone: 'bad' });
}

/** At the end of a fight: was the oath kept? Applies the result and returns its lines. */
export function settleBattleOath(state: GameState, ctx: Ctx, combat: CombatState, result: CombatResult): Line[] {
  const b = combat.buffs;
  if (!b.battle_oath) return [];
  const cfg = ctx.data.config;
  const oath = battleOathOf(ctx, b.battle_oath);
  const broken =
    b.oath_broken ||
    (oath.breaks_on === 'withdraw_or_defeat' && (result === 'withdrew' || result === 'defeat')) ||
    (oath.breaks_on === 'forced_victory' && result === 'victory_broken');
  const status = broken ? 'BROKEN' : 'KEPT';
  const base = broken
    ? [{ hearthfire: -cfg.BATTLE_OATH_BROKEN_HEARTHFIRE, reputation: { [cfg.BATTLE_OATH_FACTION]: -cfg.BATTLE_OATH_BROKEN_REPUTATION } }]
    : [{ hearthfire: cfg.BATTLE_OATH_KEPT_HEARTHFIRE, reputation: { [cfg.BATTLE_OATH_FACTION]: cfg.BATTLE_OATH_KEPT_REPUTATION } }];
  return [
    { text: broken ? `Battle oath broken: ${oath.name}` : `Battle oath kept: ${oath.name}`, tone: broken ? 'bad' : 'good' },
    ...applyEffects(state, ctx, scaleOathEffects(state, ctx, status, base)),
  ];
}

/** Crew who can still be committed in this fight. */
export function commitments(state: GameState, ctx: Ctx, combat: CombatState) {
  return state.crew
    .map((key) => ({ key, member: crewOf(ctx.data, key) }))
    .filter(({ member }) => member.commitment?.modes.includes(combat.mode));
}

export function commitLock(state: GameState, ctx: Ctx, combat: CombatState, key: string): string | undefined {
  if (!state.crew.includes(key)) return 'Not in the crew';
  const c = crewOf(ctx.data, key).commitment;
  if (!c || !c.modes.includes(combat.mode)) return combat.mode === 'ship' ? 'Not in ship combat' : 'Only in ship combat';
  if (combat.buffs.committed.includes(key)) return 'Once per fight';
  return undefined;
}

/** Commits a crew member: changes this round only, and does not use it. */
export function commitCrew(state: GameState, ctx: Ctx, combat: CombatState, key: string): Line[] {
  if (commitLock(state, ctx, combat, key)) return [];
  const member = crewOf(ctx.data, key);
  const c = member.commitment!;
  const b = combat.buffs;
  b.committed.push(key);
  combat.menu = null;
  const lines: Line[] = [{ text: `${member.display_name}: ${c.name}! ${c.description}`, tone: 'accent' }];
  if (c.roll) b.mods.push({ label: `${member.display_name} (${c.name})`, value: c.roll, rolls: 1 });
  if (c.resolve_on_hit) b.hit_resolve_bonus += c.resolve_on_hit;
  if (c.victory_hearthfire) b.victory_hearthfire += c.victory_hearthfire;
  if (c.heal_hull && combat.mode === 'ship') lines.push(...applyEffects(state, ctx, [{ hull: c.heal_hull }], { nonLethal: true }));
  return lines;
}
