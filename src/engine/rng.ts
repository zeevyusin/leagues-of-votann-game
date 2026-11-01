// Seedable random numbers. The generator's state lives in the game state,
// so a saved game replays the same rolls after loading.

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  state: number;
}

/** mulberry32: small, fast, good enough for dice. */
export class SeededRng implements Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

/** Test helper: returns the given floats in order, repeating the last one. */
export class ScriptedRng implements Rng {
  state = 0;
  private i = 0;

  constructor(private values: number[]) {}

  next(): number {
    const v = this.values[Math.min(this.i, this.values.length - 1)];
    this.i++;
    return v;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[rng.int(0, list.length - 1)];
}

export function weightedPick<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  let r = rng.next() * total;
  for (const [key, w] of entries) {
    r -= Math.max(0, w);
    if (r < 0) return key;
  }
  return entries[entries.length - 1][0];
}

export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
