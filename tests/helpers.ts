import { loadGameData } from '../src/engine/data';
import { newDraft, newGame, type CreationDraft } from '../src/engine/creation';
import type { GameData } from '../src/engine/schema';
import { ScriptedRng, SeededRng, type Rng } from '../src/engine/rng';
import type { Ctx } from '../src/engine/rules';
import type { BaseClass, GameState, Gender, KinType, StatKey } from '../src/engine/types';

export const data: GameData = loadGameData();

export function draftFor(subclass: string, kin: KinType = 'KIN', gender: Gender = 'FEMALE', bonus: Partial<Record<StatKey, number>> = { grit: 1, nerve: 1, wits: 1 }): CreationDraft {
  const sub = data.subclasses.find((s) => s.key === subclass)!;
  const d = newDraft();
  return {
    ...d,
    step: 'confirm',
    name: 'Tester',
    gender,
    kin_type: kin,
    base_class: sub.base_class as BaseClass,
    subclass,
    bonus: { ...d.bonus, ...bonus },
  };
}

export function gameFor(subclass: string, kin: KinType = 'KIN', seed = 1234, gender: Gender = 'FEMALE'): GameState {
  return newGame(data, draftFor(subclass, kin, gender), seed);
}

export function ctxWith(rng: Rng): Ctx {
  return { data, rng };
}

/** Every die rolls 1, every weighted pick takes the first entry. */
export const alwaysLow = () => new ScriptedRng([0]);
/** Every die rolls 20. */
export const alwaysHigh = () => new ScriptedRng([0.999]);
export const seeded = (seed: number) => new SeededRng(seed);
