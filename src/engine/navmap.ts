// The Nav route tree: the shortest way (in days) from here to every known system, drawn as a tree,
// so the player can see which systems lie on the way to a destination.
import { relicSum, systemOf, isPort, type Ctx } from './rules';
import { availableRoutes, routeFuel } from './travel';
import type { GameState, Line, NavMap, NavMapNode } from './types';

export interface RouteStep {
  /** The system before this one on the shortest route from here (null for here). */
  prev: string | null;
  /** Totals from the current location. */
  days: number;
  fuel: number;
  hops: number;
}

/** Fuel for one hop: the next journey gets this journey's discounts; later hops only relic ones. */
function hopFuel(state: GameState, ctx: Ctx, fuel: number, first: boolean): number {
  if (first) return routeFuel(state, ctx, fuel);
  const relic = relicSum(state, ctx.data, 'fuel_per_journey');
  return relic < 0 ? Math.max(1, fuel + relic) : fuel + relic;
}

/** Dijkstra over discovered systems: fewest days, then least Fuel. Only reachable systems appear. */
export function shortestRoutes(state: GameState, ctx: Ctx): Map<string, RouteStep> {
  const best = new Map<string, RouteStep>([[state.location, { prev: null, days: 0, fuel: 0, hops: 0 }]]);
  if (!availableRoutes(state, ctx).length) return best;
  const done = new Set<string>();
  for (;;) {
    let here: string | null = null;
    for (const [k, v] of best)
      if (!done.has(k) && (here === null || better(v, best.get(here)!))) here = k;
    if (here === null) return best;
    done.add(here);
    const cur = best.get(here)!;
    for (const c of systemOf(ctx.data, here).connections) {
      if (!state.discovered_systems.includes(c.to) || done.has(c.to)) continue;
      const next: RouteStep = { prev: here, days: cur.days + c.days, fuel: cur.fuel + hopFuel(state, ctx, c.fuel, cur.hops === 0), hops: cur.hops + 1 };
      const old = best.get(c.to);
      if (!old || better(next, old)) best.set(c.to, next);
    }
  }
}

function better(a: RouteStep, b: RouteStep): boolean {
  return a.days < b.days || (a.days === b.days && a.fuel < b.fuel);
}

/** The systems on the way to a destination, from the first hop to the destination itself. */
export function pathTo(routes: Map<string, RouteStep>, target: string): string[] {
  const path: string[] = [];
  for (let k: string | null = target; k !== null && routes.get(k)?.prev !== null; k = routes.get(k)?.prev ?? null) {
    if (!routes.has(k)) return [];
    path.unshift(k);
  }
  return path;
}

/** Systems with a story beat waiting for the player's arrival. */
export function objectiveSystems(state: GameState, ctx: Ctx): Set<string> {
  const out = new Set<string>();
  for (const key of state.story.active_beats) {
    const beat = ctx.data.story_beats.find((b) => b.key === key);
    if (beat?.trigger === 'arrival' && beat.location) out.add(beat.location);
  }
  return out;
}

/** Words shared by the route tree and the star map. */
function systemTags(state: GameState, ctx: Ctx, key: string, objectives: Set<string>): string[] {
  const tags: string[] = [];
  if (objectives.has(key)) tags.push('objective');
  if (isPort(ctx.data, state, key)) tags.push('port');
  if (!state.visited_systems.includes(key)) tags.push('unvisited');
  return tags;
}

function routeTotal(step: RouteStep): string {
  return `${step.days} day${step.days > 1 ? 's' : ''}, ${step.fuel} Fuel`;
}

/** What the star map says about a system when it is highlighted. */
function mapDetail(state: GameState, ctx: Ctx, key: string, step: RouteStep | undefined, path: string[], objectives: Set<string>): string {
  const name = systemOf(ctx.data, key).display_name;
  if (key === state.location) return `${name}: you are here.`;
  if (!step) return `${name}: no known route yet.`;
  const parts = [`${name}: ${routeTotal(step)}`];
  if (step.fuel > state.resources.fuel) parts.push('more Fuel than you have');
  const via = path.slice(0, -1).map((k) => systemOf(ctx.data, k).display_name);
  if (via.length) parts.push(`via ${via.join(', ')}`);
  const tags = systemTags(state, ctx, key, objectives);
  return `${parts.join(', ')}.${tags.length ? ` [${tags.join(', ')}]` : ''}`;
}

/** The star map for the Nav screen: known systems, the routes between them, and the way to the nearest objective. */
export function navMap(state: GameState, ctx: Ctx): NavMap {
  const routes = shortestRoutes(state, ctx);
  const objectives = objectiveSystems(state, ctx);
  const reachable = new Map(availableRoutes(state, ctx).map((r) => [r.to, routeFuel(state, ctx, r.fuel) <= state.resources.fuel]));
  const known = new Set(state.discovered_systems);

  const nodes: NavMapNode[] = state.discovered_systems.map((key) => {
    const sys = systemOf(ctx.data, key);
    const step = routes.get(key);
    const path = step ? pathTo(routes, key) : [];
    return {
      key,
      name: sys.display_name,
      x: sys.map.x,
      y: sys.map.y,
      here: key === state.location,
      port: isPort(ctx.data, state, key),
      ork: sys.faction === 'ORKS',
      objective: objectives.has(key),
      visited: state.visited_systems.includes(key),
      route: step ? [state.location, ...path] : [],
      detail: mapDetail(state, ctx, key, step, path, objectives),
      go: reachable.get(key) ? `go:${key}` : undefined,
    };
  });

  const edges: [string, string][] = [];
  for (const key of known)
    for (const c of systemOf(ctx.data, key).connections)
      if (known.has(c.to) && !edges.some(([a, b]) => a === c.to && b === key)) edges.push([key, c.to]);

  let nearest: NavMapNode | undefined;
  for (const n of nodes) {
    if (!n.objective || n.here || !n.route.length) continue;
    if (!nearest || routes.get(n.key)!.days < routes.get(nearest.key)!.days) nearest = n;
  }
  return { nodes, edges, objective_route: nearest?.route ?? [] };
}

/** The route tree for the Nav screen. */
export function routeTreeLines(state: GameState, ctx: Ctx): Line[] {
  const routes = shortestRoutes(state, ctx);
  const objectives = objectiveSystems(state, ctx);
  const children = new Map<string, string[]>();
  for (const [k, v] of routes) if (v.prev) children.set(v.prev, [...(children.get(v.prev) ?? []), k]);
  for (const list of children.values()) list.sort((a, b) => routes.get(a)!.days - routes.get(b)!.days || a.localeCompare(b));

  const here = systemOf(ctx.data, state.location);
  const lines: Line[] = [{ text: 'ROUTES FROM HERE', tone: 'heading' }];
  lines.push({ text: `${here.display_name} (you are here)`, tone: 'teal' });

  const walk = (key: string, prefix: string) => {
    const kids = children.get(key) ?? [];
    kids.forEach((k, i) => {
      const last = i === kids.length - 1;
      const step = routes.get(k)!;
      const sys = systemOf(ctx.data, k);
      const tags = systemTags(state, ctx, k, objectives);
      const short = step.fuel > state.resources.fuel ? ', more Fuel than you have' : '';
      const total = routeTotal(step) + short;
      lines.push({
        text: `${prefix}${last ? '└─ ' : '├─ '}${sys.display_name}  (${total})${tags.length ? `  [${tags.join(', ')}]` : ''}`,
        tone: objectives.has(k) ? 'accent' : short ? 'muted' : 'normal',
      });
      walk(k, `${prefix}${last ? '   ' : '│  '}`);
    });
  };
  walk(state.location, '');

  const unreachable = state.discovered_systems.filter((k) => !routes.has(k));
  if (unreachable.length)
    lines.push({ text: `No known route yet: ${unreachable.map((k) => systemOf(ctx.data, k).display_name).join(', ')}`, tone: 'muted' });
  lines.push({ text: 'Days and Fuel are totals from here, along the shortest route.', tone: 'muted' });
  return lines;
}

/** For each neighbouring system, the objectives whose shortest route starts with that hop. */
export function objectivesByFirstHop(state: GameState, ctx: Ctx): Map<string, string[]> {
  const routes = shortestRoutes(state, ctx);
  const out = new Map<string, string[]>();
  for (const target of objectiveSystems(state, ctx)) {
    if (target === state.location) continue;
    const path = pathTo(routes, target);
    if (path.length < 2) continue; // a direct hop is already marked as the objective itself
    out.set(path[0], [...(out.get(path[0]) ?? []), target]);
  }
  return out;
}
