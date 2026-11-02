// A simple automated player used by the playthrough tests. It plays through the same
// applyChoice/buildView the UI uses, so anything it can finish, a player can finish.
import { applyChoice, buildView } from '../src/engine/game';
import { beatOf as engineBeatOf, systemOf } from '../src/engine/rules';
import type { Rng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';
import { data } from './helpers';

export const beatOf = (key: string) => engineBeatOf(data, key);

/** Next hop toward a target system (breadth-first over discovered systems). Null if unreachable. */
export function routeToSystem(state: GameState, target: string): string | null {
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
  if (!prev.has(target)) return null;
  let step = target;
  while (prev.get(step) !== state.location) step = prev.get(step)!;
  return step;
}

export interface PlayOptions {
  /** Which story route to take in beats: the first or last unlocked one. */
  pick?: 'first' | 'last';
  /** Forces dice (for "every roll fails" runs). */
  rng?: () => Rng;
  /** Stop when this returns true (checked at the hub). */
  until: (s: GameState) => boolean;
  /** Choose 'Not now' on deferrable thread beats instead of playing them. */
  ignoreThreads?: boolean;
  /** Called before every choice. */
  onState?: (s: GameState) => void;
  maxSteps?: number;
  /** Where to fly when no objective is reachable (ignoreThreads runs bounce between two systems). */
  bounce?: [string, string];
}

export function play(start: GameState, opts: PlayOptions): GameState {
  let state = start;
  let shoppedOnDay = -1;
  const pick = opts.pick ?? 'first';
  const max = opts.maxSteps ?? 3000;
  const step = (id: string, text?: string) => {
    state = applyChoice(state, data, id, text, opts.rng?.());
  };

  for (let i = 0; i < max; i++) {
    const top = state.scenes[state.scenes.length - 1];
    if (top.type === 'hub' && opts.until(state)) return state;
    opts.onState?.(state);
    const view = buildView(state, data);

    if (view.input) {
      step(view.input.id, 'Test Hauler');
      continue;
    }
    if (top.type !== 'hub') {
      const open = view.options.filter((o) => !o.locked);
      if (!open.length) throw new Error(`No open options on ${view.kind}: ${view.title}`);
      if (top.type === 'beat') {
        if (opts.ignoreThreads && open.some((o) => o.id === 'defer')) {
          step('defer');
          continue;
        }
        const routes = open.filter((o) => o.id.startsWith('route:'));
        step((pick === 'last' ? routes[routes.length - 1] : routes[0]).id);
        continue;
      }
      // In fights, never Withdraw or use the console action: plain stances and the first allocation.
      const plain = open.filter((o) => o.id !== 'withdraw' && o.id !== 'action');
      step((plain[0] ?? open[0]).id);
      continue;
    }

    // ---- At the hub ----
    // Restock once per day while docked: fuel, supplies, hull.
    if (state.docked && shoppedOnDay !== state.day) {
      shoppedOnDay = state.day;
      if (view.tabs?.market) {
        step('tab:market');
        for (const id of ['mkt:buy:fuel:fill', 'mkt:buy:supplies:fill']) {
          const opt = buildView(state, data).options.find((o) => o.id === id);
          if (opt && !opt.locked) step(id);
          while (state.scenes[state.scenes.length - 1].type === 'notice') step('continue');
        }
      }
      step('tab:ship');
      const repair = buildView(state, data).options.find((o) => o.id === 'repair');
      if (repair && !repair.locked) step('repair');
      // Broke and low on fuel: work the docks until there is enough to fly on.
      if (view.tabs?.market && state.resources.fuel < 8 && state.resources.ore < 30) {
        step('tab:market');
        step('mkt:work');
        shoppedOnDay = -1;
      }
      continue;
    }

    // Answer a Comms beat if one is waiting.
    const comms = state.story.active_beats.map(beatOf).find((b) => b.trigger === 'comms');
    if (comms) {
      if (top.tab !== 'comms') step('tab:comms');
      else step(`msg:${data.messages.find((m) => m.beat === comms.key)!.key}`);
      continue;
    }

    // Fly toward the first reachable objective (or bounce, when ignoring threads).
    let hop: string | null = null;
    if (!opts.ignoreThreads)
      for (const b of state.story.active_beats.map(beatOf)) {
        if (b.trigger !== 'arrival' || !b.location || b.location === state.location) continue;
        hop = routeToSystem(state, b.location);
        if (hop) break;
      }
    if (!hop && opts.bounce) hop = state.location === opts.bounce[0] ? opts.bounce[1] : opts.bounce[0];
    if (!hop) throw new Error(`Stuck at ${state.location} with beats ${state.story.active_beats.join(', ')}`);

    if (top.tab !== 'nav') {
      step('tab:nav');
      continue;
    }
    const nav = buildView(state, data);
    const go = nav.options.find((o) => o.id === `go:${hop}`);
    const affordable = nav.options.filter((o) => o.id.startsWith('go:') && !o.locked);
    // Short on fuel for the planned hop: head for any reachable port to restock instead.
    const port = affordable.find((o) => systemOf(data, o.id.slice(3)).port);
    if (go && !go.locked) step(go.id);
    else if (nav.options.some((o) => o.id === 'distress')) step('distress');
    else if (port ?? affordable[0]) step((port ?? affordable[0]).id);
    else throw new Error(`Cannot fly from ${state.location} to ${hop} and not stranded`);
  }
  throw new Error(`Did not finish within ${max} choices (day ${state.day}, at ${state.location})`);
}
