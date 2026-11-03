// The Nav route tree: shortest routes over known systems, the tree, and "toward objective" hints.
import { describe, expect, it } from 'vitest';
import { buildView } from '../src/engine/game';
import { objectivesByFirstHop, pathTo, routeTreeLines, shortestRoutes } from '../src/engine/navmap';
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
