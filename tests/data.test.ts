import { describe, expect, it } from 'vitest';
import { loadGameData, rawGameData } from '../src/engine/data';
import { validateGameData } from '../src/engine/schema';

describe('game data', () => {
  it('loads and passes every schema and reference check', () => {
    expect(() => loadGameData()).not.toThrow();
  });

  it('has 4 base classes and 10 subclasses', () => {
    const data = loadGameData();
    expect(data.base_classes).toHaveLength(4);
    expect(data.subclasses).toHaveLength(10);
  });

  it('has an opening variant for every subclass', () => {
    const data = loadGameData();
    const opening = data.messages.find((m) => m.key === data.config.FIRST_MESSAGE)!;
    const variants = typeof opening.body === 'string' ? {} : opening.body.variants ?? {};
    for (const s of data.subclasses) expect(variants[s.key], s.key).toBeTruthy();
  });

  it('rejects a subclass that points to a missing base class', () => {
    const raw = structuredClone(rawGameData()) as ReturnType<typeof rawGameData>;
    (raw.subclasses[0] as { base_class: string }).base_class = 'BARD';
    expect(() => validateGameData(raw)).toThrow();
  });

  it('rejects a beat without a fallback route', () => {
    const raw = structuredClone(rawGameData()) as ReturnType<typeof rawGameData>;
    const beat = raw.story_beats[0] as { routes: { requirements?: unknown[] }[] };
    for (const r of beat.routes) r.requirements = [{ base_class: 'WARRIOR' }];
    expect(() => validateGameData(raw)).toThrow(/fallback/);
  });
});
