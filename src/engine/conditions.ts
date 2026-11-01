// The condition evaluator: gates on routes, replies, and options.
import type { GameData, Requirement } from './schema';
import { baseClassOf, factionOf, statLabel, subclassOf, systemOf } from './rules';
import type { GameState } from './types';

export function requirementMet(state: GameState, req: Requirement): boolean {
  const c = state.character;
  if (req.base_class && c.base_class !== req.base_class) return false;
  if (req.subclass && c.subclass !== req.subclass) return false;
  if (req.kin_type && c.kin_type !== req.kin_type) return false;
  if (req.stat && c.stats[req.stat.name] < req.stat.min) return false;
  if (req.reputation && (state.reputation[req.reputation.faction] ?? 0) < req.reputation.min) return false;
  if (req.flag && !state.story.flags[req.flag]) return false;
  if (req.location && state.location !== req.location) return false;
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
  if (req.location) parts.push(`at ${systemOf(data, req.location).display_name}`);
  return parts.join(', ');
}

/** Undefined when every requirement is met; otherwise "Requires ..." for the first unmet one. */
export function lockedReason(state: GameState, data: GameData, reqs: Requirement[]): string | undefined {
  const unmet = reqs.find((r) => !requirementMet(state, r));
  return unmet ? `Requires ${requirementText(data, unmet)}` : undefined;
}
