import { beatOf as engineBeatOf, systemOf } from '../src/engine/rules';
import type { GameState } from '../src/engine/types';
import { data } from './helpers';

export const beatOf = (key: string) => engineBeatOf(data, key);

/** Next hop toward a target system (breadth-first over discovered systems). */
export function routeToSystem(state: GameState, target: string): string {
  const prev = new Map<string, string>();
  const queue = [state.location];
  const seen = new Set(queue);
  while (queue.length) {
    const here = queue.shift()!;
    if (here === target) break;
    for (const c of systemOf(data, here).connections) {
      if (seen.has(c.to) || !state.discovered_systems.includes(c.to)) continue;
      seen.add(c.to);
      prev.set(c.to, here);
      queue.push(c.to);
    }
  }
  let step = target;
  while (prev.get(step) && prev.get(step) !== state.location) step = prev.get(step)!;
  return step;
}
