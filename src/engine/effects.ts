// Applies data-defined effects to the game state and returns short summary lines.
import type { Effect } from './schema';
import {
  clamp,
  crewOf,
  factionOf,
  grudgeOf,
  hasPassive,
  itemOf,
  loreOf,
  maxHealth,
  oathOf,
  relicOf,
  signed,
  systemOf,
  xpToNext,
  type Ctx,
} from './rules';
import type { GameState, Line } from './types';

export interface EffectOptions {
  /** Story effects never incapacitate: Health and Hull stop at 1, Wear at max - 1. */
  nonLethal?: boolean;
}

const UNBREAKABLE_WORD_MULTIPLIER = 1.5;

export function applyEffects(state: GameState, ctx: Ctx, effects: Effect[], opts: EffectOptions = {}): Line[] {
  const lines: Line[] = [];
  for (const e of effects) lines.push(...applyEffect(state, ctx, e, opts));
  return lines;
}

function applyEffect(state: GameState, ctx: Ctx, e: Effect, opts: EffectOptions): Line[] {
  const cfg = ctx.data.config;
  const out: Line[] = [];
  const note = (text: string, good: boolean) => out.push({ text, tone: good ? 'good' : 'bad' });
  const r = state.resources;

  const resource = (key: 'fuel' | 'ore' | 'supplies', label: string) => {
    const amount = e[key];
    if (amount === undefined || amount === 0) return;
    const before = r[key];
    r[key] = Math.max(0, r[key] + amount);
    const change = r[key] - before;
    if (change !== 0) note(`${signed(change)} ${label}`, change > 0);
  };
  resource('fuel', 'Fuel');
  resource('ore', 'Ore');
  resource('supplies', 'Supplies');

  if (e.hearthfire) {
    const before = r.hearthfire;
    r.hearthfire = clamp(r.hearthfire + e.hearthfire, 0, cfg.HEARTHFIRE_MAX);
    const change = r.hearthfire - before;
    if (change !== 0) note(`${signed(change)} Hearthfire`, change > 0);
  }

  if (e.health) {
    const c = state.character;
    const before = c.health;
    c.health = clamp(c.health + e.health, opts.nonLethal ? 1 : 0, maxHealth(cfg, c));
    if (c.health !== before) note(`${signed(c.health - before)} Health`, c.health > before);
  }

  if (e.hull) {
    const s = state.ship;
    const before = s.hull;
    s.hull = clamp(s.hull + e.hull, opts.nonLethal ? 1 : 0, s.hull_max);
    if (s.hull !== before) note(`${signed(s.hull - before)} Hull`, s.hull > before);
  }

  if (e.wear && state.character.wear !== null) {
    const before = state.character.wear;
    const max = opts.nonLethal ? cfg.WEAR_MAX - 1 : cfg.WEAR_MAX;
    state.character.wear = clamp(before + e.wear, 0, max);
    const change = state.character.wear - before;
    if (change !== 0) note(`${signed(change)} Wear`, change < 0);
  }

  if (e.waaagh && state.story.waaagh_meter !== null) {
    state.story.waaagh_meter = clamp(state.story.waaagh_meter + e.waaagh, 0, cfg.WAAAGH_LAUNCH);
    note(`Waaagh! meter ${signed(e.waaagh)}`, e.waaagh < 0);
  }

  if (e.reputation) {
    for (const [faction, amount] of Object.entries(e.reputation)) {
      state.reputation[faction] = (state.reputation[faction] ?? 0) + amount;
      note(`${signed(amount)} reputation with ${factionOf(ctx.data, faction).display_name}`, amount > 0);
    }
  }

  if (e.create_oath) out.push(...createOath(state, ctx, e.create_oath));
  if (e.keep_oath) out.push(...resolveOath(state, ctx, e.keep_oath, 'KEPT'));
  if (e.break_oath) out.push(...resolveOath(state, ctx, e.break_oath, 'BROKEN'));

  if (e.create_grudge && !state.grudges.some((g) => g.key === e.create_grudge)) {
    state.grudges.push({ key: e.create_grudge, status: 'ACTIVE', created_day: state.day });
    out.push({ text: `Grudge recorded: ${grudgeOf(ctx.data, e.create_grudge).title}`, tone: 'accent' });
  }
  if (e.settle_grudge) {
    const g = state.grudges.find((x) => x.key === e.settle_grudge);
    if (g && g.status === 'ACTIVE') {
      g.status = 'SETTLED';
      out.push({ text: `Grudge settled: ${grudgeOf(ctx.data, g.key).title}`, tone: 'good' });
    }
  }

  if (e.set_flag) Object.assign(state.story.flags, e.set_flag);

  if (e.add_message && !state.inbox.some((m) => m.key === e.add_message)) {
    state.inbox.unshift({ key: e.add_message, read: false, day: state.day });
    out.push({ text: 'New message on Comms.', tone: 'teal' });
  }

  if (e.add_crew && !state.crew.includes(e.add_crew)) {
    state.crew.push(e.add_crew);
    out.push({ text: `${crewOf(ctx.data, e.add_crew).display_name} joins the crew.`, tone: 'good' });
  }
  if (e.remove_crew && state.crew.includes(e.remove_crew)) {
    state.crew = state.crew.filter((k) => k !== e.remove_crew);
    out.push({ text: `${crewOf(ctx.data, e.remove_crew).display_name} leaves the crew.`, tone: 'bad' });
  }

  if (e.add_cargo) {
    const room = cargoSpace(state);
    const qty = Math.min(e.add_cargo.qty, room);
    if (qty > 0) {
      const slot = state.cargo.find((c) => c.key === e.add_cargo!.key);
      if (slot) slot.qty += qty;
      else state.cargo.push({ key: e.add_cargo.key, qty });
      note(`+${qty} ${itemOf(ctx.data, e.add_cargo.key).display_name}`, true);
    }
    if (qty < e.add_cargo.qty) out.push({ text: 'The cargo hold is full; some had to be left behind.', tone: 'muted' });
  }

  if (e.add_relic) {
    state.relics.push({ key: e.add_relic, identified: false });
    out.push({ text: `Found a relic: ${relicOf(ctx.data, e.add_relic).unidentified_name}`, tone: 'accent' });
  }

  if (e.reveal_system && !state.discovered_systems.includes(e.reveal_system)) {
    state.discovered_systems.push(e.reveal_system);
    out.push({ text: `New system on Nav: ${systemOf(ctx.data, e.reveal_system).display_name}`, tone: 'teal' });
  }

  if (e.lore && !state.lore.includes(e.lore)) {
    state.lore.push(e.lore);
    out.push({ text: `Logbook entry: ${loreOf(ctx.data, e.lore).title}`, tone: 'teal' });
    out.push(...grantXp(state, ctx, cfg.XP_DISCOVERY));
  }

  if (e.set_core_status) state.story.core_status = e.set_core_status;
  if (e.set_hrolla_status) state.story.hrolla_status = e.set_hrolla_status;
  if (e.grizzgut) {
    state.story.grizzgut_encounters.push({ beat: state.story.current_beat ?? 'UNKNOWN', outcome: e.grizzgut });
    const grudge = cfg.GRIZZGUT_GRUDGE;
    if (state.story.grizzgut_encounters.length >= cfg.GRIZZGUT_GRUDGE_AFTER && !state.grudges.some((g) => g.key === grudge))
      out.push(...applyEffect(state, ctx, { create_grudge: grudge }, opts));
  }

  if (e.waaagh_start && state.story.waaagh_meter === null) {
    state.story.waaagh_meter = cfg.WAAAGH_START;
    out.push({ text: `The Waaagh! meter appears in your Logbook: ${cfg.WAAAGH_START}/${cfg.WAAAGH_LAUNCH}`, tone: 'accent' });
  }

  if (e.complete_act !== undefined && !state.story.acts_completed.includes(e.complete_act))
    state.story.acts_completed.push(e.complete_act);

  if (e.xp) out.push(...grantXp(state, ctx, e.xp));
  return out;
}

export function cargoSpace(state: GameState): number {
  return state.ship.cargo_capacity - state.cargo.reduce((s, c) => s + c.qty, 0);
}

export function createOath(state: GameState, ctx: Ctx, key: string): Line[] {
  if (state.oaths.some((o) => o.key === key && o.status === 'ACTIVE')) return [];
  const oath = oathOf(ctx.data, key);
  state.oaths.push({
    key,
    status: 'ACTIVE',
    sworn_day: state.day,
    deadline_day: oath.deadline_days === null ? null : state.day + oath.deadline_days,
  });
  return [{ text: `Oath sworn: ${oath.title}`, tone: 'accent' }];
}

export function resolveOath(state: GameState, ctx: Ctx, key: string, status: 'KEPT' | 'BROKEN'): Line[] {
  const entry = state.oaths.find((o) => o.key === key && o.status === 'ACTIVE');
  if (!entry) return [];
  const oath = oathOf(ctx.data, key);
  if (status === 'BROKEN' && !oath.can_fail) return [];
  entry.status = status;
  const effects = structuredClone(status === 'KEPT' ? oath.on_keep : oath.on_break);
  // Unbreakable Word (Ironkin Speaker): kept oaths are worth more, broken ones cost more.
  if (hasPassive(ctx.data, state.character, 'UNBREAKABLE_WORD')) {
    for (const e of effects)
      for (const f of Object.keys(e.reputation ?? {}))
        e.reputation![f] = Math.round(e.reputation![f] * UNBREAKABLE_WORD_MULTIPLIER);
  }
  const head: Line = {
    text: status === 'KEPT' ? `Oath kept: ${oath.title}` : `Oath broken: ${oath.title}`,
    tone: status === 'KEPT' ? 'good' : 'bad',
  };
  return [head, ...applyEffects(state, ctx, effects)];
}

/** Breaks any failable oath whose deadline has passed. */
export function checkOathDeadlines(state: GameState, ctx: Ctx): Line[] {
  const lines: Line[] = [];
  for (const o of state.oaths)
    if (o.status === 'ACTIVE' && o.deadline_day !== null && state.day > o.deadline_day)
      lines.push(...resolveOath(state, ctx, o.key, 'BROKEN'));
  return lines;
}

export function grantXp(state: GameState, ctx: Ctx, amount: number): Line[] {
  const cfg = ctx.data.config;
  const c = state.character;
  if (amount <= 0 || c.level >= cfg.LEVEL_CAP) return [];
  const lines: Line[] = [{ text: `+${amount} XP`, tone: 'teal' }];
  c.xp += amount;
  while (c.level < cfg.LEVEL_CAP && c.xp >= xpToNext(cfg, c.level)) {
    c.xp -= xpToNext(cfg, c.level);
    c.level++;
    c.stat_points += cfg.STAT_POINTS_PER_LEVEL;
    lines.push({ text: `Level up! You are now level ${c.level}.`, tone: 'accent' });
  }
  if (c.level >= cfg.LEVEL_CAP) c.xp = 0;
  return lines;
}
