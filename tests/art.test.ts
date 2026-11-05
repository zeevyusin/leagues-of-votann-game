import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rawGameData } from '../src/engine/data';
import { startCombat } from '../src/engine/combat';
import { buildView } from '../src/engine/game';
import { MODULE_KEYS, validateGameData } from '../src/engine/schema';
import { ctxWith, data, gameFor, seeded } from './helpers';
// @ts-expect-error The art script is plain JavaScript and has no type declarations.
import { encodePng, loadPalette, parseGrid } from '../scripts/build-art.mjs';

const PORTRAIT: [number, number] = [32, 32];

describe('art manifest', () => {
  it('has a PNG for every art ID', () => {
    const ids = [...Object.values(data.art.senders), ...Object.values(data.art.enemies), ...Object.values(data.art.enemy_ships)];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(existsSync(join('public', 'art', `${id}.png`)), id).toBe(true);
  });

  it('has art for every message sender', () => {
    for (const m of data.messages) expect(data.art.senders[m.from], m.from).toBeTruthy();
  });

  it('has art for every enemy and only dims a mapped enemy', () => {
    for (const e of data.enemies) expect(data.art.enemies[e.key], e.key).toBeTruthy();
    for (const k of data.art.dim_enemies) expect(data.art.enemies[k], k).toBeTruthy();
  });

  it('has art for every enemy ship, the player ship and every module', () => {
    for (const s of data.enemy_ships) expect(data.art.enemy_ships[s.key], s.key).toBeTruthy();
    for (const id of ['player_ship', ...MODULE_KEYS.map((m) => `mod_${m}`)]) expect(existsSync(join('public', 'art', `${id}.png`)), id).toBe(true);
  });

  it('rejects entries that match nothing in the game', () => {
    const raw = structuredClone(rawGameData()) as ReturnType<typeof rawGameData>;
    (raw.art.senders as Record<string, string>)['Nobody at all'] = 'dorrik';
    (raw.art.enemies as Record<string, string>).NOT_AN_ENEMY = 'dorrik';
    (raw.art.dim_enemies as string[]).push('ALSO_NOT_AN_ENEMY');
    (raw.art.enemy_ships as Record<string, string>).NOT_A_SHIP = 'ork_raider';
    expect(() => validateGameData(raw)).toThrow(/Nobody at all[\s\S]*NOT_AN_ENEMY[\s\S]*ALSO_NOT_AN_ENEMY[\s\S]*NOT_A_SHIP/);
  });
});

describe('art build script', () => {
  const palette = loadPalette();

  it('every grid matches its committed PNG', () => {
    const sizes: Record<string, [number, number]> = { portraits: PORTRAIT, crests: PORTRAIT, enemies: PORTRAIT, ships: [64, 32], player: [96, 48] };
    let checked = 0;
    for (const [folder, size] of Object.entries(sizes)) {
      const dir = join('art', folder);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir).filter((n) => n.endsWith('.txt'))) {
        const rows = parseGrid(readFileSync(join(dir, name), 'utf8'), size, palette, name);
        expect(encodePng(rows, palette).equals(readFileSync(join('public', 'art', name.replace('.txt', '.png')))), name).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('names the exact problem in a bad grid', () => {
    const good = `${'.'.repeat(32)}\n`.repeat(32);
    expect(parseGrid(good, PORTRAIT, palette, 'x')).toHaveLength(32);
    expect(() => parseGrid(good.replace('.', ''), PORTRAIT, palette, 'x')).toThrow(/line 1 is 31/);
    expect(() => parseGrid(good.replace('.', '?'), PORTRAIT, palette, 'x')).toThrow(/column 1: unknown colour "\?"/);
    expect(() => parseGrid(`${'.'.repeat(32)}\n`, PORTRAIT, palette, 'x')).toThrow(/expected 32 rows/);
  });
});

describe('views with art', () => {
  const fromDorrik = data.messages.find((m) => m.from === 'Old Dorrik')!;
  const fromOther = data.messages.find((m) => m.from !== 'Old Dorrik')!;
  /** The same game with only Dorrik's art, for screens that must cope with missing art. */
  const onlyDorrik = { ...data, art: { ...data.art, senders: { 'Old Dorrik': 'dorrik' } } };
  const withMail = () => {
    const s = gameFor('HEARTHKYN_WARRIOR');
    s.inbox = [fromDorrik, fromOther].map((m) => ({ key: m.key, read: false, day: 1 }));
    return s;
  };

  it('shows a thumbnail only for senders with art', () => {
    const s = withMail();
    s.scenes = [{ type: 'hub', tab: 'comms' }] as typeof s.scenes;
    const options = buildView(s, onlyDorrik).options;
    expect(options.find((o) => o.id === `msg:${fromDorrik.key}`)?.art).toBe('dorrik');
    expect(options.find((o) => o.id === `msg:${fromOther.key}`)?.art).toBeUndefined();
  });

  it('shows the portrait on the message screen, and nothing for senders without art', () => {
    const open = (key: string) => {
      const s = withMail();
      s.scenes = [{ type: 'message', key }] as typeof s.scenes;
      return buildView(s, onlyDorrik).visual;
    };
    expect(open(fromDorrik.key)).toEqual({ kind: 'portrait', art: 'dorrik', alt: 'Old Dorrik' });
    expect(open(fromOther.key)).toBeUndefined();
  });

  it('shows the current enemy in personal combat, and powers down the unplugged Warboss', () => {
    const fight = (encounter: string) => {
      const s = gameFor('HEARTHKYN_WARRIOR');
      const combat = startCombat(s, ctxWith(seeded(1)), encounter, null);
      s.scenes = [{ type: 'combat', combat }] as typeof s.scenes;
      return buildView(s, data).visual;
    };
    expect(fight('A1_DIG_SITE_RAID')).toEqual({ kind: 'enemy', art: 'ork_boyz', alt: 'Mob of Ork Boyz', dim: false });
    expect(fight('A3_SKRAGNAK_DUEL')).toMatchObject({ art: 'skragnak', dim: false });
    expect(fight('A3_SKRAGNAK_UNPLUGGED')).toMatchObject({ art: 'skragnak', dim: true });
  });

  it('shows the player ship with its module levels on the Ship tab', () => {
    const s = gameFor('HEARTHKYN_WARRIOR');
    s.ship.modules.engine = 3;
    s.scenes = [{ type: 'hub', tab: 'ship' }] as typeof s.scenes;
    expect(buildView(s, data).visual).toMatchObject({ kind: 'player_ship', alt: s.ship.name, modules: { engine: 3, reactor: 1 } });
  });

  it('dims the enemy ship on the boarding screen', () => {
    const s = gameFor('HEARTHKYN_WARRIOR');
    const combat = startCombat(s, ctxWith(seeded(1)), 'A3_WAVE_GUNSHIP', null);
    s.scenes = [{ type: 'board', combat, lines: [] }] as typeof s.scenes;
    expect(buildView(s, data).visual).toEqual({ kind: 'enemy_ship', art: 'gitzbolt_gunship', alt: expect.any(String), dim: true });
  });

  it('shows an image with a PNG in every fight in the game', () => {
    for (const enc of data.combat_encounters) {
      const s = gameFor('HEARTHKYN_WARRIOR');
      const combat = startCombat(s, ctxWith(seeded(1)), enc.key, null);
      s.scenes = [{ type: 'combat', combat }] as typeof s.scenes;
      const visual = buildView(s, data).visual;
      expect(visual?.kind, enc.key).toBe(enc.mode === 'ship' ? 'enemy_ship' : 'enemy');
      if (visual && 'art' in visual) expect(existsSync(join('public', 'art', `${visual.art}.png`)), enc.key).toBe(true);
    }
  });

  it('shows the enemy ship in ship combat', () => {
    const s = gameFor('HEARTHKYN_WARRIOR');
    const combat = startCombat(s, ctxWith(seeded(1)), 'A1_RAIDER_ESCAPE', null);
    s.scenes = [{ type: 'combat', combat }] as typeof s.scenes;
    expect(buildView(s, data).visual).toMatchObject({ kind: 'enemy_ship', art: 'ork_raider' });
  });
});
