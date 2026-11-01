// Travel, time, Supplies, recovery, and fatigue (game-overview.md section 4).
import { applyDefeat } from './defeat';
import { checkOathDeadlines, createOath, grantXp } from './effects';
import { clamp, maxHealth, systemOf, type Ctx } from './rules';
import type { GameState, Line } from './types';

export function routeTo(state: GameState, ctx: Ctx, to: string) {
  return systemOf(ctx.data, state.location).connections.find((c) => c.to === to);
}

/** Systems the player can see a route to from here. */
export function availableRoutes(state: GameState, ctx: Ctx) {
  return systemOf(ctx.data, state.location).connections.filter((c) => state.discovered_systems.includes(c.to));
}

export function isStranded(state: GameState, ctx: Ctx): boolean {
  const routes = availableRoutes(state, ctx);
  return routes.length > 0 && routes.every((r) => r.fuel > state.resources.fuel);
}

/** Moves the ship, passes the days, and docks on arrival. Returns a travel log. */
export function travel(state: GameState, ctx: Ctx, to: string): Line[] {
  const cfg = ctx.data.config;
  const route = routeTo(state, ctx, to);
  if (!route) throw new Error(`No route from ${state.location} to ${to}`);
  if (route.fuel > state.resources.fuel) throw new Error('Not enough fuel');

  const lines: Line[] = [];
  state.resources.fuel -= route.fuel;
  state.docked = false;
  lines.push({ text: `-${route.fuel} Fuel`, tone: 'muted' });
  for (let i = 0; i < route.days; i++) lines.push(...passDay(state, ctx));

  state.location = to;
  const sys = systemOf(ctx.data, to);
  if (!state.visited_systems.includes(to)) {
    state.visited_systems.push(to);
    lines.push({ text: `First visit to ${sys.display_name}.`, tone: 'teal' });
    lines.push(...grantXp(state, ctx, cfg.XP_DISCOVERY));
  }
  if (sys.port) lines.push(...dock(state, ctx));

  state.self_maintenance_used = false;
  if (state.grace_journeys > 0) state.grace_journeys--;
  if (state.story.waaagh_meter !== null) {
    state.story.waaagh_meter = clamp(state.story.waaagh_meter + cfg.WAAAGH_PER_JOURNEY, 0, cfg.WAAAGH_LAUNCH);
    lines.push({ text: `The Waaagh! grows: ${state.story.waaagh_meter}/${cfg.WAAAGH_LAUNCH}`, tone: 'accent' });
  }

  // Constant Wear mode can push an Ironkin to Critical Wear during a journey.
  const c = state.character;
  if (c.wear !== null && c.wear >= cfg.WEAR_MAX) {
    lines.push({ text: 'Your frame locks up. Critical Wear: you are incapacitated until repaired.', tone: 'bad' });
    lines.push(...applyDefeat(state, ctx, { cause: 'wear' }));
  }
  return lines;
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
  const c = state.character;
  state.docked = true;
  const healed = maxHealth(ctx.data.config, c) - c.health;
  c.health += healed;
  c.days_since_dock = 0;
  const lines: Line[] = [{ text: `Docked at ${systemOf(ctx.data, state.location).display_name}.`, tone: 'teal' }];
  if (healed > 0) lines.push({ text: `Rest in port restores your Health (+${healed}).`, tone: 'good' });
  if (c.fatigued) {
    c.fatigued = false;
    lines.push({ text: 'You are no longer Fatigued.', tone: 'good' });
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
