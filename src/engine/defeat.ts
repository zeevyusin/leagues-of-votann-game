// Defeat and incapacitation (combat-system.md section 7). The player never dies.
import { crewOf, itemOf, maxHealth, systemOf, type Ctx } from './rules';
import type { GameState, Line } from './types';

export interface DefeatOptions {
  /** The encounter replaces the default cost table with its own effects. */
  overridesDefaultCosts?: boolean;
  /** 'wear' = Ironkin at critical Wear: costs lean toward Supplies and Ore instead of cargo. */
  cause: 'combat' | 'wear';
  /** Old Guard: defeat does not cost Hearthfire. */
  keepHearthfire?: boolean;
}

/** Cheapest fuel cost from the current system to any neighbour. */
export function nearestRouteFuel(state: GameState, ctx: Ctx): number {
  const routes = systemOf(ctx.data, state.location).connections;
  return routes.length ? Math.min(...routes.map((c) => c.fuel)) : 0;
}

export function applyDefeat(state: GameState, ctx: Ctx, opts: DefeatOptions): Line[] {
  const cfg = ctx.data.config;
  const lines: Line[] = [];
  const r = state.resources;

  if (!opts.overridesDefaultCosts) {
    // Ore: lose a share, but never below the safety floor (or what you had, if less).
    const [lo, hi] = cfg.DEFEAT_ORE_LOSS_RANGE;
    let share = lo + ctx.rng.next() * (hi - lo);
    if (opts.cause === 'wear') share /= 2;
    const floor = Math.min(r.ore, cfg.DEFEAT_ORE_FLOOR);
    const loss = Math.min(Math.floor(r.ore * share), r.ore - floor);
    if (loss > 0) {
      r.ore -= loss;
      lines.push({ text: `-${loss} Ore`, tone: 'bad' });
    }

    if (opts.cause === 'wear') {
      const used = Math.min(r.supplies, cfg.DEFEAT_WEAR_SUPPLIES_COST);
      if (used > 0) {
        r.supplies -= used;
        lines.push({ text: `-${used} Supplies spent on emergency repairs`, tone: 'bad' });
      }
    } else {
      // Cargo: lose part of each non-mission stack. Mission items are never taken by default.
      for (const slot of state.cargo) {
        if (itemOf(ctx.data, slot.key).mission) continue;
        const lost = Math.ceil(slot.qty * cfg.DEFEAT_CARGO_LOSS_FRACTION);
        if (lost > 0) {
          slot.qty -= lost;
          lines.push({ text: `-${lost} ${itemOf(ctx.data, slot.key).display_name}`, tone: 'bad' });
        }
      }
      state.cargo = state.cargo.filter((c) => c.qty > 0);

      // Crew: a small chance that one unprotected crew member leaves.
      const atRisk = state.crew.filter((k) => !crewOf(ctx.data, k).protected);
      if (atRisk.length && ctx.rng.next() < cfg.DEFEAT_CREW_LOSS_CHANCE) {
        const gone = atRisk[ctx.rng.int(0, atRisk.length - 1)];
        state.crew = state.crew.filter((k) => k !== gone);
        lines.push({ text: `${crewOf(ctx.data, gone).display_name} is gone, taken in the chaos.`, tone: 'bad' });
      }
    }

    if (opts.keepHearthfire) {
      lines.push({ text: 'Old Guard: the crew holds firm. No Hearthfire lost.', tone: 'teal' });
    } else {
      const before = r.hearthfire;
      r.hearthfire = Math.max(0, r.hearthfire + cfg.DEFEAT_HEARTHFIRE_LOSS);
      if (r.hearthfire !== before) lines.push({ text: `${r.hearthfire - before} Hearthfire`, tone: 'bad' });
    }
  }

  // Never strand the player: keep enough fuel to reach the nearest system.
  const needed = nearestRouteFuel(state, ctx);
  if (r.fuel < needed) {
    lines.push({ text: `Your rescuers leave you ${needed - r.fuel} Fuel, enough to limp to the nearest system.`, tone: 'good' });
    r.fuel = needed;
  }

  // Recovery: wake up back at the console.
  const c = state.character;
  const hpFloor = Math.ceil(maxHealth(cfg, c) * cfg.DEFEAT_RESTORE_FRACTION);
  if (c.health < hpFloor) c.health = hpFloor;
  const hullFloor = Math.ceil(state.ship.hull_max * cfg.DEFEAT_RESTORE_FRACTION);
  if (state.ship.hull < hullFloor) state.ship.hull = hullFloor;
  if (c.wear !== null && c.wear > cfg.DEFEAT_WEAR_RESET) c.wear = cfg.DEFEAT_WEAR_RESET;

  if (cfg.DEFEAT_GRACE) state.grace_journeys = 1;
  lines.push({ text: 'You recover at the console. Health and Hull are patched up to half.', tone: 'muted' });
  return lines;
}
