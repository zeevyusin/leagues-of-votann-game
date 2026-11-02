// Travel, time, Supplies, recovery, fatigue, travel events, and docking (game-overview.md sections 4 and 7).
import { applyDefeat } from './defeat';
import { allMet } from './conditions';
import { checkOathDeadlines, createOath, grantXp, receiveMessage, resolveOath } from './effects';
import { weightedPick } from './rng';
import { clamp, inAct3, liveWaaagh, maxHealth, oathOf, portOpen, systemOf, waaaghBand, type Ctx } from './rules';
import type { GameState, Line } from './types';

export function routeTo(state: GameState, ctx: Ctx, to: string) {
  return systemOf(ctx.data, state.location).connections.find((c) => c.to === to);
}

/** Systems the player can see a route to from here. */
export function availableRoutes(state: GameState, ctx: Ctx) {
  // Act 3 is one long fight: no travel until the epilogue is over.
  if (inAct3(state)) return [];
  return systemOf(ctx.data, state.location).connections.filter((c) => state.discovered_systems.includes(c.to));
}

/** Fuel a route costs right now (Chart Safe Route saves some). */
export function routeFuel(state: GameState, ctx: Ctx, fuel: number): number {
  return state.safe_route_charted ? Math.max(1, fuel - ctx.data.config.SAFE_ROUTE_FUEL_SAVING) : fuel;
}

export function isStranded(state: GameState, ctx: Ctx): boolean {
  const routes = availableRoutes(state, ctx);
  return routes.length > 0 && routes.every((r) => routeFuel(state, ctx, r.fuel) > state.resources.fuel);
}

export interface TravelResult {
  lines: Line[];
  /** A travel event beat to play on arrival, if one fired. */
  event: string | null;
}

/** Moves the ship, passes the days, maybe fires a travel event, and docks on arrival. */
export function travel(state: GameState, ctx: Ctx, to: string): TravelResult {
  const cfg = ctx.data.config;
  const route = routeTo(state, ctx, to);
  if (!route) throw new Error(`No route from ${state.location} to ${to}`);
  const fuel = routeFuel(state, ctx, route.fuel);
  if (fuel > state.resources.fuel) throw new Error('Not enough fuel');

  const lines: Line[] = [];
  state.resources.fuel -= fuel;
  state.docked = false;
  state.haggle_active = false;
  state.story.deferred_beats = [];
  lines.push({ text: `-${fuel} Fuel${state.safe_route_charted ? ' (safe route charted)' : ''}`, tone: 'muted' });
  for (let i = 0; i < route.days; i++) lines.push(...passDay(state, ctx));

  state.location = to;
  const sys = systemOf(ctx.data, to);
  if (!state.visited_systems.includes(to)) {
    state.visited_systems.push(to);
    lines.push({ text: `First visit to ${sys.display_name}.`, tone: 'teal' });
    lines.push(...grantXp(state, ctx, cfg.XP_DISCOVERY));
  }

  const meter = liveWaaagh(state);
  if (meter !== null) {
    state.story.waaagh_meter = clamp(meter + cfg.WAAAGH_PER_JOURNEY, 0, cfg.WAAAGH_LAUNCH);
    lines.push({ text: `The Waaagh! grows: ${state.story.waaagh_meter}/${cfg.WAAAGH_LAUNCH}`, tone: 'accent' });
    const warning = waaaghBand(cfg, state.story.waaagh_meter).warning;
    if (warning) lines.push({ text: `Comms: ${warning}`, tone: 'bad' });
  }

  const event = pickTravelEvent(state, ctx, sys.danger);
  if (sys.port) lines.push(...dock(state, ctx));

  state.self_maintenance_used = false;
  state.safe_route_charted = false;
  if (state.grace_journeys > 0) state.grace_journeys--;

  // Constant Wear mode can push an Ironkin to Critical Wear during a journey.
  const c = state.character;
  if (c.wear !== null && c.wear >= cfg.WEAR_MAX) {
    lines.push({ text: 'Your frame locks up. Critical Wear: you are incapacitated until repaired.', tone: 'bad' });
    lines.push(...applyDefeat(state, ctx, { cause: 'wear' }));
  }
  return { lines, event };
}

/** Rolls for a travel event at the destination. Returns the event beat key, or null. */
export function pickTravelEvent(state: GameState, ctx: Ctx, danger: 'LOW' | 'MEDIUM' | 'HIGH'): string | null {
  const cfg = ctx.data.config;
  // After the ending, Ork events are remnant warbands, weighted as in the Scattered band.
  const meter = state.story.post_game ? 0 : state.story.waaagh_meter;
  const band = waaaghBand(cfg, meter);
  let chance = cfg.TRAVEL_EVENT_CHANCE[danger] + (meter === null ? 0 : band.event_chance_bonus);
  if (state.safe_route_charted) chance *= cfg.SAFE_ROUTE_EVENT_MULTIPLIER;
  if (ctx.rng.next() >= chance) return null;

  const weights: Record<string, number> = {};
  for (const beat of ctx.data.story_beats) {
    const ev = beat.event;
    if (!ev || !ev.dangers.includes(danger)) continue;
    if (ev.once && state.story.events_seen.includes(beat.key)) continue;
    if (ev.combat && state.grace_journeys > 0) continue;
    if (!allMet(state, ev.requirements)) continue;
    const w = ev.weight * (ev.ork && meter !== null ? band.ork_event_weight : 1);
    if (w > 0) weights[beat.key] = w;
  }
  return Object.keys(weights).length ? weightedPick(ctx.rng, weights) : null;
}

export function passDay(state: GameState, ctx: Ctx): Line[] {
  const cfg = ctx.data.config;
  const lines: Line[] = [];
  const c = state.character;
  state.day++;

  const mouths = 1 + state.crew.length;
  const need = Math.ceil(mouths * cfg.SUPPLIES_PER_CREW_PER_DAY);
  if (state.resources.supplies >= need) {
    state.resources.supplies -= need;
  } else {
    state.resources.supplies = 0;
    state.resources.hearthfire = clamp(state.resources.hearthfire + cfg.STARVATION_HEARTHFIRE, 0, cfg.HEARTHFIRE_MAX);
    c.health = Math.max(1, c.health + cfg.STARVATION_HEALTH);
    lines.push({ text: `Day ${state.day}: no Supplies left. The crew goes hungry.`, tone: 'bad' });
  }

  const regen = cfg.HEALTH_REGEN_PER_DAY * (c.kin_type === 'KIN' ? cfg.KIN_RECOVERY_MULTIPLIER : 1);
  c.health = Math.min(maxHealth(cfg, c), c.health + Math.floor(regen));

  if (c.wear !== null && cfg.WEAR_MODE === 'CONSTANT') c.wear = Math.min(cfg.WEAR_MAX, c.wear + cfg.WEAR_CONSTANT_PER_DAY);

  c.days_since_dock++;
  if (c.kin_type === 'KIN' && !c.fatigued && c.days_since_dock > cfg.FATIGUE_DAYS) {
    c.fatigued = true;
    lines.push({ text: `Too long without a port. You are Fatigued (${cfg.FATIGUE_PENALTY} to all rolls until you dock).`, tone: 'bad' });
  }
  lines.push(...checkOathDeadlines(state, ctx));
  return lines;
}

export function dock(state: GameState, ctx: Ctx): Line[] {
  const sys = systemOf(ctx.data, state.location);
  if (!portOpen(ctx.data, state, state.location)) {
    state.docked = false;
    return [{ text: `${sys.display_name} has closed its docks to everyone. The Waaagh! has scared them off.`, tone: 'bad' }];
  }
  const c = state.character;
  state.docked = true;
  const healed = maxHealth(ctx.data.config, c) - c.health;
  c.health += healed;
  c.days_since_dock = 0;
  const lines: Line[] = [{ text: `Docked at ${sys.display_name}.`, tone: 'teal' }];
  if (healed > 0) lines.push({ text: `Rest in port restores your Health (+${healed}).`, tone: 'good' });
  if (c.fatigued) {
    c.fatigued = false;
    lines.push({ text: 'You are no longer Fatigued.', tone: 'good' });
  }
  lines.push(...deliverCargo(state, ctx));
  lines.push(...offerJobs(state, ctx));
  return lines;
}

/** Delivery oaths are kept automatically when docking at their destination with the cargo. */
function deliverCargo(state: GameState, ctx: Ctx): Line[] {
  const lines: Line[] = [];
  for (const o of state.oaths) {
    if (o.status !== 'ACTIVE') continue;
    const f = oathOf(ctx.data, o.key).fulfil;
    if (!f || !('deliver' in f) || f.deliver.system !== state.location) continue;
    const slot = state.cargo.find((c) => c.key === f.deliver.item);
    if (!slot || slot.qty < f.deliver.qty) continue;
    slot.qty -= f.deliver.qty;
    state.cargo = state.cargo.filter((c) => c.qty > 0);
    lines.push({ text: 'Cargo delivered.', tone: 'good' }, ...resolveOath(state, ctx, o.key, 'KEPT'));
  }
  return lines;
}

/** Ports post job offers on Comms when the player docks. */
function offerJobs(state: GameState, ctx: Ctx): Line[] {
  const lines: Line[] = [];
  if (inAct3(state)) return lines;
  for (const m of ctx.data.messages) {
    if (!m.job || !m.job.ports.includes(state.location)) continue;
    if (state.inbox.some((x) => x.key === m.key) || !allMet(state, m.job.requirements)) continue;
    lines.push(...receiveMessage(state, ctx, m.key));
  }
  return lines;
}

/** Stranded with no fuel: a passing Hernkyn outrider tows you, for a debt. */
export function distressCall(state: GameState, ctx: Ctx): Line[] {
  const cfg = ctx.data.config;
  state.resources.fuel += cfg.DISTRESS_FUEL;
  return [
    { text: 'A Hernkyn outrider answers your beacon and tops up your tanks.' },
    { text: `+${cfg.DISTRESS_FUEL} Fuel`, tone: 'good' },
    ...createOath(state, ctx, cfg.DISTRESS_OATH),
  ];
}
