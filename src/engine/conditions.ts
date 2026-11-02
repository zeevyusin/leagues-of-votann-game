// The condition evaluator: gates on routes, replies, and options.
import type { GameData, Requirement } from './schema';
import { baseClassOf, crewOf, factionOf, itemOf, statLabel, subclassOf, systemOf } from './rules';
import type { GameState } from './types';

export function requirementMet(state: GameState, req: Requirement): boolean {
  const c = state.character;
  if (req.base_class && c.base_class !== req.base_class) return false;
  if (req.subclass && c.subclass !== req.subclass) return false;
  if (req.kin_type && c.kin_type !== req.kin_type) return false;
  if (req.stat && c.stats[req.stat.name] < req.stat.min) return false;
  if (req.reputation && (state.reputation[req.reputation.faction] ?? 0) < req.reputation.min) return false;
  if (req.flag && !state.story.flags[req.flag]) return false;
  if (req.not_flag && state.story.flags[req.not_flag]) return false;
  if (req.location && state.location !== req.location) return false;
  if (req.has_cargo && !state.cargo.some((x) => x.key === req.has_cargo && x.qty > 0)) return false;
  if (req.ore !== undefined && state.resources.ore < req.ore) return false;
  if (req.supplies !== undefined && state.resources.supplies < req.supplies) return false;
  if (req.crew && !state.crew.includes(req.crew)) return false;
  if (req.story_reward && !state.story.story_rewards.includes(req.story_reward)) return false;
  if (req.hrolla_status && state.story.hrolla_status !== req.hrolla_status) return false;
  if (req.waaagh_min !== undefined && (state.story.waaagh_meter ?? 0) < req.waaagh_min) return false;
  return true;
}

export function requirementText(data: GameData, req: Requirement): string {
  const parts: string[] = [];
  if (req.base_class) parts.push(baseClassOf(data, req.base_class).display_name);
  if (req.subclass) parts.push(subclassOf(data, req.subclass).display_name);
  if (req.kin_type) parts.push(req.kin_type === 'IRONKIN' ? 'Ironkin' : 'Kin');
  if (req.stat) parts.push(`${statLabel(data, req.stat.name)} ${req.stat.min}+`);
  if (req.reputation) parts.push(`${factionOf(data, req.reputation.faction).display_name} reputation ${req.reputation.min}+`);
  if (req.flag) parts.push(req.flag);
  if (req.not_flag) parts.push(`not ${req.not_flag}`);
  if (req.location) parts.push(`at ${systemOf(data, req.location).display_name}`);
  if (req.has_cargo) parts.push(itemOf(data, req.has_cargo).display_name);
  if (req.ore !== undefined) parts.push(`${req.ore} Ore`);
  if (req.supplies !== undefined) parts.push(`${req.supplies} Supplies`);
  if (req.crew) parts.push(`${crewOf(data, req.crew).display_name} in the crew`);
  if (req.story_reward) parts.push(req.story_reward);
  if (req.hrolla_status) parts.push(`Hrolla ${req.hrolla_status.toLowerCase()}`);
  if (req.waaagh_min !== undefined) parts.push(`Waaagh! ${req.waaagh_min}+`);
  return parts.join(', ');
}

/** Undefined when every requirement is met; otherwise "Requires ..." for the first unmet one. */
export function lockedReason(state: GameState, data: GameData, reqs: Requirement[]): string | undefined {
  const unmet = reqs.find((r) => !requirementMet(state, r));
  return unmet ? `Requires ${requirementText(data, unmet)}` : undefined;
}

export function allMet(state: GameState, reqs: Requirement[]): boolean {
  return reqs.every((r) => requirementMet(state, r));
}
