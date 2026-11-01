import { describe, expect, it } from 'vitest';
import { applyChoice, applyChoiceWithRolls } from '../src/engine/game';
import { data, gameFor } from './helpers';
import type { GameState } from '../src/engine/types';

/** Opens the orders and answers them, landing on the first story beat. */
function atFirstBeat(): GameState {
  let s = gameFor('HERNKYN_PIONEER', 'KIN', 11);
  s = applyChoice(s, data, 'continue');
  s = applyChoice(s, data, `msg:${data.config.FIRST_MESSAGE}`);
  return applyChoice(s, data, 'answer');
}

describe('roll reporting for the dice animation', () => {
  it('reports one roll for a rolled story route, matching the result', () => {
    const { state, rolls } = applyChoiceWithRolls(atFirstBeat(), data, 'route:SCAN');
    expect(rolls).toHaveLength(1);
    expect(rolls[0]).toMatchObject({ context: 'Sweep the vault entrance with your scanners', statLabel: 'Wits', sides: 20 });
    expect(rolls[0].die).toBeGreaterThanOrEqual(1);
    expect(state.story.completed_beats[0].tier).toBe(rolls[0].tier);
  });

  it('reports no rolls for choices without dice', () => {
    const s = gameFor('HERNKYN_PIONEER');
    expect(applyChoiceWithRolls(s, data, 'continue').rolls).toEqual([]);
  });

  it('reports a roll for each combat round', () => {
    let s = applyChoice(atFirstBeat(), data, 'route:SCAN');
    while (s.scenes[s.scenes.length - 1].type === 'notice') s = applyChoice(s, data, 'continue');
    s = applyChoice(s, data, 'route:FIGHT');
    const { rolls } = applyChoiceWithRolls(s, data, 'stance:attack');
    expect(rolls).toHaveLength(1);
    expect(rolls[0].context).toContain('Attack vs');
  });

  it('does not change game results', () => {
    const start = atFirstBeat();
    expect(applyChoiceWithRolls(start, data, 'route:SCAN').state).toEqual(applyChoice(start, data, 'route:SCAN'));
  });
});
