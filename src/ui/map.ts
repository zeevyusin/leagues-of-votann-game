// The star map (graphics.md 7): drawn live as SVG from the NavMap the engine builds.
import type { NavMap, NavMapNode } from '../engine/types';

const SVG = 'http://www.w3.org/2000/svg';
const NOTHING_HIGHLIGHTED = 'Point at a system to see its route.';

export interface MapHandle {
  el: HTMLElement;
  /** Lights up the route to a system. Null goes back to the nearest objective. */
  highlight(key: string | null): void;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, className?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (className) node.setAttribute('class', className);
  return node;
}

function nodeClass(n: NavMapNode): string {
  const names = ['map-node'];
  if (n.here) names.push('is-here');
  if (n.ork) names.push('is-ork');
  if (n.objective) names.push('is-objective');
  if (!n.visited) names.push('is-unvisited');
  if (n.go) names.push('can-go');
  return names.join(' ');
}

export function renderMap(map: NavMap, list: HTMLElement[], listOpen: boolean, pick: (id: string) => void, toggleList: () => void): MapHandle {
  const root = svg('svg', { viewBox: '0 0 650 240', role: 'img', 'aria-label': 'Star map of the known systems. Press R for the route list.' }, 'map-svg');
  const byKey = new Map(map.nodes.map((n) => [n.key, n]));

  const edges = map.edges.map(([a, b]) => {
    const [from, to] = [byKey.get(a)!, byKey.get(b)!];
    const line = svg('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y }, 'map-edge');
    root.append(line);
    return { a, b, line };
  });

  const info = document.createElement('p');
  info.className = 'map-info';

  const highlight = (key: string | null) => {
    const node = key ? byKey.get(key) : undefined;
    const route = node?.route.length ? node.route : map.objective_route;
    const hops = new Set(route.slice(1).flatMap((k, i) => [`${route[i]}|${k}`, `${k}|${route[i]}`]));
    for (const e of edges) e.line.classList.toggle('is-route', hops.has(`${e.a}|${e.b}`));
    const shown = node ?? byKey.get(route.at(-1) ?? '');
    info.textContent = shown?.detail ?? NOTHING_HIGHLIGHTED;
  };

  for (const n of map.nodes) {
    const g = svg('g', {}, nodeClass(n));
    if (n.port) g.append(svg('rect', { x: n.x - 5, y: n.y - 5, width: 10, height: 10 }, 'map-shape'));
    else g.append(svg('circle', { cx: n.x, cy: n.y, r: 5 }, 'map-shape'));
    if (n.here) g.append(svg('circle', { cx: n.x, cy: n.y, r: 11 }, 'map-ring'));
    g.append(svg('circle', { cx: n.x, cy: n.y, r: 15 }, 'map-hit'));
    const label = svg('text', { x: n.x, y: n.y + (n.y > 180 ? -13 : 22) }, 'map-label');
    label.textContent = n.name;
    g.append(label);
    g.addEventListener('mouseenter', () => highlight(n.key));
    g.addEventListener('click', () => {
      if (n.go) pick(n.go);
      else highlight(n.key);
    });
    root.append(g);
  }
  root.addEventListener('mouseleave', () => highlight(null));

  const el = document.createElement('div');
  el.className = 'map';
  const feed = document.createElement('figure');
  feed.className = 'feed feed--map';
  feed.append(root);
  const legend = document.createElement('p');
  legend.className = 'map-legend';
  legend.textContent = 'Square: port. Red: Ork space. Orange: objective. Dim: not yet visited. Click a neighbouring system to set course.';
  const toggle = document.createElement('button');
  toggle.className = 'map-toggle';
  toggle.textContent = `${listOpen ? 'Hide' : 'Show'} route list [R]`;
  toggle.setAttribute('aria-expanded', String(listOpen));
  toggle.addEventListener('click', toggleList);
  const text = document.createElement('div');
  text.className = `map-list${listOpen ? ' is-open' : ''}`;
  text.append(...list);
  el.append(feed, info, legend, toggle, text);

  highlight(null);
  return { el, highlight };
}
