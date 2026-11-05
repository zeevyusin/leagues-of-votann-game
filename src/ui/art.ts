// Turns the engine's art IDs into images (graphics.md 6). A missing image hides itself, and the screen carries on.
import type { Visual } from '../engine/types';

/** An art ID as an <img>. CSS sets the size, so the layout never jumps while it loads. */
export function artImage(art: string, alt: string, className: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = `${import.meta.env.BASE_URL}art/${art}.png`;
  img.alt = alt;
  img.className = className;
  img.addEventListener('error', () => img.remove());
  return img;
}

/** How strongly each module level lights its overlay (graphics.md 3.4). Level 1 is the plain ship. */
const MODULE_GLOW: Record<number, number> = { 2: 0.6, 3: 1 };

/** The player's ship, with one overlay for each upgraded module. */
function playerShip(visual: Extract<Visual, { kind: 'player_ship' }>): HTMLElement {
  const stack = document.createElement('div');
  stack.className = 'feed-stack';
  stack.append(artImage('player_ship', visual.alt, 'feed-image'));
  for (const [module, level] of Object.entries(visual.modules)) {
    const glow = MODULE_GLOW[level];
    if (!glow) continue;
    const overlay = artImage(`mod_${module}`, '', 'feed-image');
    overlay.style.opacity = String(glow);
    stack.append(overlay);
  }
  return stack;
}

/** A display feed: a framed panel holding a portrait or a ship. */
export function renderVisual(visual: Exclude<Visual, { kind: 'map' }>): HTMLElement {
  const feed = document.createElement('figure');
  const dim = 'dim' in visual && visual.dim;
  feed.className = `feed feed--${visual.kind}${dim ? ' feed--dim' : ''}`;
  const content = visual.kind === 'player_ship' ? playerShip(visual) : artImage(visual.art, visual.alt, 'feed-image');
  feed.append(content);
  // Without its main image the panel would be an empty frame.
  const main = content instanceof HTMLImageElement ? content : content.querySelector('img');
  main?.addEventListener('error', () => feed.remove());
  return feed;
}
