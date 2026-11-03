// Relic actions: equip, unequip, identify, sell (game-overview.md 6.3.1).
// The effects of equipped relics are read through the relic helpers in rules.ts.
import { applyEffects } from './effects';
import { relicOf, type Ctx } from './rules';
import type { GameState, Line } from './types';

export function equippedCount(state: GameState): number {
  return state.relics.filter((r) => r.equipped).length;
}

export function relicLabel(ctx: Ctx, r: GameState['relics'][number]): string {
  const info = relicOf(ctx.data, r.key);
  return r.identified ? info.display_name : info.unidentified_name;
}

/** Reputation that an equipped relic changes, applied on equip and taken back on unequip. */
function reputationSwing(ctx: Ctx, key: string, sign: 1 | -1) {
  const info = relicOf(ctx.data, key);
  const rep: Record<string, number> = {};
  for (const e of [...info.benefit_effects, ...info.drawback_effects])
    for (const [f, v] of Object.entries(e.reputation ?? {})) rep[f] = (rep[f] ?? 0) + v * sign;
  return Object.keys(rep).length ? [{ reputation: rep }] : [];
}

export function equipLock(state: GameState, ctx: Ctx, index: number): string | undefined {
  const r = state.relics[index];
  if (!r) return 'No such relic';
  if (r.equipped) return 'Already equipped';
  if (equippedCount(state) >= ctx.data.config.RELIC_SLOTS) return `Both relic slots are full`;
  return undefined;
}

export function equipRelic(state: GameState, ctx: Ctx, index: number): Line[] | null {
  if (equipLock(state, ctx, index)) return null;
  const r = state.relics[index];
  r.equipped = true;
  return [{ text: `You equip the ${relicLabel(ctx, r)}.`, tone: 'accent' }, ...applyEffects(state, ctx, reputationSwing(ctx, r.key, 1))];
}

export function unequipRelic(state: GameState, ctx: Ctx, index: number): Line[] | null {
  const r = state.relics[index];
  if (!r?.equipped) return null;
  r.equipped = false;
  return [{ text: `You put away the ${relicLabel(ctx, r)}.`, tone: 'muted' }, ...applyEffects(state, ctx, reputationSwing(ctx, r.key, -1))];
}

/** Reveals a relic's true name, benefit and drawback. */
export function identifyRelic(state: GameState, ctx: Ctx, index: number): Line[] {
  const r = state.relics[index];
  const info = relicOf(ctx.data, r.key);
  r.identified = true;
  return [
    { text: info.display_name, tone: 'heading' },
    { text: `Benefit: ${info.benefit}`, tone: 'good' },
    { text: `Drawback: ${info.drawback}`, tone: 'bad' },
  ];
}

/** Sells a relic for its value (unequipping it first). Mission relics cannot be sold. */
export function sellRelic(state: GameState, ctx: Ctx, index: number): Line[] | null {
  const r = state.relics[index];
  if (!r) return null;
  const info = relicOf(ctx.data, r.key);
  if (info.mission) return null;
  const lines = r.equipped ? (unequipRelic(state, ctx, index) ?? []) : [];
  state.relics.splice(index, 1);
  state.resources.ore += info.value;
  return [...lines, { text: `Sold the ${r.identified ? info.display_name : info.unidentified_name} for ${info.value} Ore.`, tone: 'good' }];
}
