// The Nav route tree: shortest routes over known systems, the tree, and "toward objective" hints.
import { describe, expect, it } from 'vitest';
import { buildView } from '../src/engine/game';
import { navMap, objectivesByFirstHop, pathTo, routeTreeLines, shortestRoutes } from '../src/engine/navmap';
import { ScriptedRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';
import { ctxWith, data, gameFor } from './helpers';

const ctx = () => ctxWith(new ScriptedRng([0.5]));

/** At Karrak Station with every system known, nav tab open. */
function atKarrak(): GameState {
  const s = gameFor('HERNKYN_YAEGIR');
  s.location = 'KARRAK_STATION';
  s.discovered_systems = data.systems.map((x) => x.key);
  s.story.active_beats = [];
  s.scenes = [{ type: 'hub', tab: 'nav' }];
  return s;
}

describe('route tree', () => {
  it('finds the fewest-days route and the systems on the way', () => {
    const routes = shortestRoutes(atKarrak(), ctx());
    // Karrak -> Cinder Drift (1 day) -> Skrapfang Rock (3 days)
    expect(pathTo(routes, 'SKRAPFANG_ROCK')).toEqual(['CINDER_DRIFT', 'SKRAPFANG_ROCK']);
    expect(routes.get('SKRAPFANG_ROCK')).toMatchObject({ days: 4, fuel: 4, hops: 2 });
    expect(pathTo(routes, 'DA_PIT')).toEqual(['CINDER_DRIFT', 'SKRAPFANG_ROCK', 'DA_PIT']);
  });

  it('only uses known systems', () => {
    const s = atKarrak();
    s.discovered_systems = ['KARRAK_STATION', 'KETHRAS_ANVIL', 'HOLD_DURNVAR'];
    const routes = shortestRoutes(s, ctx());
    expect([...routes.keys()].sort()).toEqual(['HOLD_DURNVAR', 'KARRAK_STATION', 'KETHRAS_ANVIL']);
  });

  it('draws a tree with totals, and marks objectives', () => {
    const s = atKarrak();
    s.story.active_beats = ['A2_D3_FIGHTING_PIT'];
    const lines = routeTreeLines(s, ctx()).map((l) => l.text);
    expect(lines[0]).toBe('ROUTES FROM HERE');
    expect(lines).toContain('Karrak Station (you are here)');
    const pit = lines.find((l) => l.includes('Da Pit'))!;
    expect(pit).toMatch(/^│? *[│ ]*[└├]─ Da Pit {2}\(5 days, 5 Fuel\)  \[objective/);
    // Da Pit is drawn under Skrapfang Rock, which is under Cinder Drift.
    const order = ['Cinder Drift', 'Skrapfang Rock', 'Da Pit'].map((n) => lines.findIndex((l) => l.includes(n)));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('flags destinations that need more Fuel than the ship has', () => {
    const s = atKarrak();
    s.resources.fuel = 2;
    const pit = routeTreeLines(s, ctx()).find((l) => l.text.includes('Da Pit'))!;
    expect(pit.text).toContain('more Fuel than you have');
  });

  it('the first hop of a longer route is marked "toward objective" on Nav', () => {
    const s = atKarrak();
    s.story.active_beats = ['A2_D3_FIGHTING_PIT'];
    expect(objectivesByFirstHop(s, ctx()).get('CINDER_DRIFT')).toEqual(['DA_PIT']);
    const opt = buildView(s, data).options.find((o) => o.id === 'go:CINDER_DRIFT')!;
    expect(opt.label).toContain('[toward objective]');
    expect(opt.detail).toContain('On the way to Da Pit.');
  });
});

describe('star map', () => {
  /** True if two routes cross, not counting a shared end point. */
  function crosses(a: number[][], b: number[][]): boolean {
    const side = (p: number[], q: number[], r: number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    if (a.some((p) => b.some((q) => p[0] === q[0] && p[1] === q[1]))) return false;
    return side(a[0], a[1], b[0]) !== side(a[0], a[1], b[1]) && side(b[0], b[1], a[0]) !== side(b[0], b[1], a[1]);
  }

  it('lays every system out inside the map, with no two routes crossing', () => {
    const pos = (key: string) => {
      const m = data.systems.find((x) => x.key === key)!.map;
      return [m.x, m.y];
    };
    const edges = navMap(atKarrak(), ctx()).edges;
    expect(edges).toHaveLength(16);
    for (const s of data.systems) {
      expect(s.map.x, s.key).toBeGreaterThanOrEqual(0);
      expect(s.map.x, s.key).toBeLessThanOrEqual(650);
      expect(s.map.y, s.key).toBeGreaterThanOrEqual(0);
      expect(s.map.y, s.key).toBeLessThanOrEqual(240);
    }
    for (const [i, [a, b]] of edges.entries())
      for (const [c, d] of edges.slice(i + 1)) expect(crosses([pos(a), pos(b)], [pos(c), pos(d)]), `${a}-${b} and ${c}-${d}`).toBe(false);
  });

  it('only shows discovered systems and the routes between them', () => {
    const s = atKarrak();
    s.discovered_systems = ['KARRAK_STATION', 'CINDER_DRIFT', 'DA_PIT'];
    const map = navMap(s, ctx());
    expect(map.nodes.map((n) => n.key).sort()).toEqual(['CINDER_DRIFT', 'DA_PIT', 'KARRAK_STATION']);
    expect(map.edges).toEqual([['KARRAK_STATION', 'CINDER_DRIFT']]);
    const pit = map.nodes.find((n) => n.key === 'DA_PIT')!;
    expect(pit.route).toEqual([]);
    expect(pit.detail).toBe('Da Pit: no known route yet.');
  });

  it('gives each system its route, totals and tags, and marks where you are', () => {
    const s = atKarrak();
    s.visited_systems = ['KARRAK_STATION'];
    const map = navMap(s, ctx());
    const pit = map.nodes.find((n) => n.key === 'DA_PIT')!;
    expect(pit.route).toEqual(['KARRAK_STATION', ...pathTo(shortestRoutes(s, ctx()), 'DA_PIT')]);
    expect(pit.ork).toBe(true);
    expect(pit.detail).toMatch(/^Da Pit: \d+ days, \d+ Fuel.*via .*\[unvisited\]$/);
    expect(map.nodes.find((n) => n.here)?.key).toBe('KARRAK_STATION');
    expect(map.nodes.find((n) => n.key === 'SNAZRIK_HAVEN')?.port).toBe(true);
  });

  it('lets you click only neighbours you have the Fuel to reach', () => {
    const s = atKarrak();
    s.resources.fuel = 2;
    const go = (key: string) => navMap(s, ctx()).nodes.find((n) => n.key === key)?.go;
    expect(go('CINDER_DRIFT')).toBe('go:CINDER_DRIFT');
    expect(go('HOLD_DURNVAR')).toBeUndefined(); // a neighbour, but 3 Fuel away
    expect(go('DA_PIT')).toBeUndefined(); // not a neighbour
    expect(go('KARRAK_STATION')).toBeUndefined(); // here
  });

  it('shows the way to the nearest objective', () => {
    const s = atKarrak();
    const beats = data.story_beats.filter((b) => b.trigger === 'arrival' && (b.location === 'DA_PIT' || b.location === 'CINDER_DRIFT'));
    s.story.active_beats = beats.filter((b) => b.location === 'DA_PIT').slice(0, 1).map((b) => b.key);
    const map = navMap(s, ctx());
    expect(map.objective_route.at(-1)).toBe('DA_PIT');
    expect(map.nodes.find((n) => n.key === 'DA_PIT')?.objective).toBe(true);
    s.story.active_beats = [];
    expect(navMap(s, ctx()).objective_route).toEqual([]);
  });

  it('puts the map and route list on the Nav screen, and leaves them off when there is no travel', () => {
    const s = atKarrak();
    const visual = buildView(s, data).visual;
    expect(visual?.kind).toBe('map');
    if (visual?.kind === 'map') expect(visual.list[0].text).toBe('ROUTES FROM HERE');
    s.story.flags.ACT3_STARTED = true;
    s.discovered_systems = ['KARRAK_STATION'];
    expect(buildView(s, data).visual).toBeUndefined();
  });
});
