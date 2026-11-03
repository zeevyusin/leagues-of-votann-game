// Milestone 4 systems: relics, battle oaths, crew commitments, armour, market sections,
// post-game quests, and save migration.
import { describe, expect, it } from 'vitest';
import { applyChoice, buildView } from '../src/engine/game';
import { personalRound, shipRound, startCombat } from '../src/engine/combat';
import { commitCrew, swearBattleOath } from '../src/engine/hearthline';
import { finishEncounter } from '../src/engine/story';
import { equipRelic, unequipRelic } from '../src/engine/relics';
import { marketChoice, marketOptions, MARKET_SECTIONS } from '../src/engine/market';
import { dock, routeFuel, travel } from '../src/engine/travel';
import { startFreeRoam } from '../src/engine/act3';
import { applyEffects, resolveOath } from '../src/engine/effects';
import { generalModifiers, maxHealth, shipPips } from '../src/engine/rules';
import { ScriptedRng } from '../src/engine/rng';
import { SAVE_VERSION, migrateState, type GameState, type PersonalCombat, type ShipCombat } from '../src/engine/types';
import { ctxWith, data, gameFor } from './helpers';

const ctx = (v = 0.5) => ctxWith(new ScriptedRng([v]));
const top = (s: GameState) => s.scenes[s.scenes.length - 1];

function withRelic(key: string, s = gameFor('HERNKYN_PIONEER')) {
  applyEffects(s, ctx(), [{ add_relic: key }]);
  const i = s.relics.findIndex((r) => r.key === key);
  return { s, i };
}

function docked(port: string, s = gameFor('HERNKYN_PIONEER')): GameState {
  s.location = port;
  dock(s, ctx());
  return s;
}

describe('relics', () => {
  it('two slots: a third relic cannot be equipped', () => {
    const s = gameFor('HERNKYN_PIONEER');
    for (const k of ['LODESTONE_OF_KHAZ', 'VOID_COMPASS', 'HEARTHSTONE_OF_DURN']) applyEffects(s, ctx(), [{ add_relic: k }]);
    expect(equipRelic(s, ctx(), 0)).not.toBeNull();
    expect(equipRelic(s, ctx(), 1)).not.toBeNull();
    expect(equipRelic(s, ctx(), 2)).toBeNull();
    unequipRelic(s, ctx(), 0);
    expect(equipRelic(s, ctx(), 2)).not.toBeNull();
  });

  it('only equipped relics have effects: the Lodestone adds Wits outside personal combat', () => {
    const { s, i } = withRelic('LODESTONE_OF_KHAZ');
    const label = (m: { label: string }[]) => m.some((x) => x.label.includes('stone') || x.label.includes('Lodestone'));
    expect(label(generalModifiers(s, data, 'wits', 'story'))).toBe(false);
    equipRelic(s, ctx(), i);
    expect(generalModifiers(s, data, 'wits', 'story').some((m) => m.value === 1)).toBe(true);
    expect(label(generalModifiers(s, data, 'wits', 'personal'))).toBe(false);
  });

  it('unidentified relics work but stay unnamed until identified', () => {
    const { s, i } = withRelic('VOID_COMPASS');
    equipRelic(s, ctx(), i);
    expect(routeFuel(s, ctx(), 3)).toBe(2);
    expect(s.relics[i].identified).toBe(false);
  });

  it('the Ancestor Core adds a reactor pip; the kustom field moves reputation while equipped', () => {
    const core = withRelic('ANCESTOR_CORE');
    const before = shipPips(core.s, data);
    equipRelic(core.s, ctx(), core.i);
    expect(shipPips(core.s, data)).toBe(before + 1);
    expect(core.s.relics[core.i].identified).toBe(true);

    const field = withRelic('GITZBOLT_KUSTOM_FIELD');
    const rep = field.s.reputation.HOLD_DURNVAR;
    equipRelic(field.s, ctx(), field.i);
    expect(field.s.reputation.HOLD_DURNVAR).toBe(rep - 10);
    unequipRelic(field.s, ctx(), field.i);
    expect(field.s.reputation.HOLD_DURNVAR).toBe(rep);
  });

  it('the Hearthstone adds Hearthfire every journey', () => {
    const { s, i } = withRelic('HEARTHSTONE_OF_DURN', docked('KARRAK_STATION'));
    equipRelic(s, ctx(), i);
    s.resources.hearthfire = 50;
    s.resources.supplies = 40;
    travel(s, ctxWith(new ScriptedRng([0.999])), 'CINDER_DRIFT');
    expect(s.resources.hearthfire).toBe(52);
  });

  it('the Oathband doubles Hearthfire lost to a broken oath', () => {
    const plain = gameFor('HERNKYN_PIONEER');
    const band = withRelic('OATHBAND_OF_THE_KAHL').s;
    equipRelic(band, ctx(), band.relics.length - 1);
    for (const s of [plain, band]) {
      s.resources.hearthfire = 50;
      applyEffects(s, ctx(), [{ create_oath: 'DEBT_TOW' }]);
    }
    const lostPlain = 50 - (resolveOath(plain, ctx(), 'DEBT_TOW', 'BROKEN'), plain.resources.hearthfire);
    const lostBand = 50 - (resolveOath(band, ctx(), 'DEBT_TOW', 'BROKEN'), band.resources.hearthfire);
    expect(lostPlain).toBe(5);
    expect(lostBand).toBe(10);
  });

  it('Karrak Station identifies relics for Ore; markets buy relics, but not the Core', () => {
    const { s, i } = withRelic('VOID_COMPASS', docked('KARRAK_STATION'));
    s.resources.ore = 100;
    marketChoice(s, ctx(), `identify:${i}`);
    expect(s.relics[i].identified).toBe(true);
    expect(s.resources.ore).toBe(100 - data.config.RELIC_IDENTIFY_ORE);
    marketChoice(s, ctx(), `sellrelic:${i}`);
    expect(s.relics.some((r) => r.key === 'VOID_COMPASS')).toBe(false);
    applyEffects(s, ctx(), [{ add_relic: 'ANCESTOR_CORE' }]);
    expect(marketChoice(s, ctx(), `sellrelic:${s.relics.length - 1}`)).toBeNull();
  });
});

describe('battle oaths', () => {
  function fight(sub = 'HERNKYN_PIONEER') {
    const s = gameFor(sub);
    const combat = startCombat(s, ctx(), 'A1_DIG_SITE_RAID', null) as PersonalCombat;
    s.scenes.push({ type: 'combat', combat });
    return { s, combat };
  }

  it('can only be sworn before the first round, and adds its bonus', () => {
    const { s, combat } = fight();
    expect(swearBattleOath(ctx(), combat, 'NO_RETREAT').length).toBeGreaterThan(0);
    expect(combat.buffs.mods.some((m) => m.label === 'Oath of No Retreat')).toBe(true);
    const late = fight();
    personalRound(late.s, ctx(), late.combat, 'defend');
    expect(swearBattleOath(ctx(), late.combat, 'NO_RETREAT')).toEqual([]);
    expect(s).toBeDefined();
  });

  it('No Retreat is broken by a defeat; kept on a victory', () => {
    const lost = fight();
    swearBattleOath(ctx(), lost.combat, 'NO_RETREAT');
    lost.s.resources.hearthfire = 50;
    finishEncounter(lost.s, ctx(), lost.combat, 'defeat', []);
    const t = top(lost.s);
    expect(t.type === 'notice' && t.lines.some((l) => l.text.startsWith('Battle oath broken'))).toBe(true);

    const won = fight();
    swearBattleOath(ctx(), won.combat, 'NO_RETREAT');
    finishEncounter(won.s, ctx(), won.combat, 'victory_broken', []);
    const w = top(won.s);
    expect(w.type === 'notice' && w.lines.some((l) => l.text.startsWith('Battle oath kept'))).toBe(true);
  });

  it('Mercy is kept by a negotiated win and broken by a forced one', () => {
    for (const [result, word] of [['victory_negotiated', 'kept'], ['victory_broken', 'broken']] as const) {
      const f = fight('PROSPECTOR_TRADER');
      swearBattleOath(ctx(), f.combat, 'MERCY');
      finishEncounter(f.s, ctx(), f.combat, result, []);
      const t = top(f.s);
      expect(t.type === 'notice' && t.lines.some((l) => l.text.startsWith(`Battle oath ${word}`))).toBe(true);
    }
  });

  it('the Unbowed breaks as soon as Health drops below half', () => {
    const { s, combat } = fight();
    swearBattleOath(ctx(), combat, 'UNBOWED');
    s.character.health = Math.floor(maxHealth(data.config, s.character) / 2);
    const out = personalRound(s, ctx(0), combat, 'attack');
    expect(combat.buffs.oath_broken).toBe(true);
    expect(out.lines.some((l) => l.text.includes('is broken'))).toBe(true);
  });

  it('the oath list opens from the combat screen without using the round', () => {
    let { s } = fight();
    s = applyChoice(s, data, 'menu:oath');
    const view = buildView(s, data);
    expect(view.options.map((o) => o.id)).toEqual(['oath:NO_RETREAT', 'oath:MERCY', 'oath:UNBOWED', 'menu:']);
    s = applyChoice(s, data, 'oath:MERCY');
    const t = top(s);
    expect(t.type === 'combat' && t.combat.round).toBe(1);
    expect(t.type === 'combat' && t.combat.buffs.battle_oath).toBe('MERCY');
  });
});

describe('Hearthline crew commitments', () => {
  it("Ylsa's evasive burn adds +3 to this round's roll only, once per fight", () => {
    const s = gameFor('HERNKYN_PIONEER');
    const combat = startCombat(s, ctx(), 'A1_RAIDER_ESCAPE', null) as ShipCombat;
    combat.enemy.hull = combat.enemy.hull_max = 99;
    commitCrew(s, ctx(), combat, 'YLSA');
    expect(commitCrew(s, ctx(), combat, 'YLSA')).toEqual([]);
    const rolls: { modifierTotal: number }[] = [];
    shipRound(s, { ...ctx(0.5), rolls: rolls as never[] }, combat, { weapons: 3, shields: 2, engines: 1 });
    shipRound(s, { ...ctx(0.5), rolls: rolls as never[] }, combat, { weapons: 3, shields: 2, engines: 1 });
    expect(rolls[0].modifierTotal - rolls[1].modifierTotal).toBe(3);
  });

  it("Dorrik's emergency patch restores Hull; he has no personal-combat commitment", () => {
    const s = gameFor('HERNKYN_PIONEER');
    s.ship.hull = 10;
    const ship = startCombat(s, ctx(), 'A1_RAIDER_ESCAPE', null) as ShipCombat;
    commitCrew(s, ctx(), ship, 'DORRIK');
    expect(s.ship.hull).toBe(13);
    const personal = startCombat(s, ctx(), 'A1_DIG_SITE_RAID', null) as PersonalCombat;
    expect(commitCrew(s, ctx(), personal, 'DORRIK')).toEqual([]);
  });

  it("Brokka's hammer blow adds Resolve damage on a successful hit", () => {
    const s = gameFor('HERNKYN_PIONEER');
    s.crew.push('BROKKA');
    const combat = startCombat(s, ctx(), 'A1_DIG_SITE_RAID', null) as PersonalCombat;
    combat.enemy.resolve = combat.enemy.resolve_max = 20;
    combat.intent = 'evasive';
    commitCrew(s, ctx(), combat, 'BROKKA');
    personalRound(s, ctx(0.999), combat, 'attack');
    // critical 3 + Attack 1 + hammer blow 2
    expect(20 - combat.enemy.resolve).toBe(data.config.COMBAT_DAMAGE_TABLE.critical[0] + data.config.COMBAT_ATTACK_DEALT_BONUS + 2);
  });
});

describe('armour and the market', () => {
  it('an armour level adds 5 max Hull and the new plates', () => {
    const s = docked('KARRAK_STATION');
    s.resources.ore = 500;
    const { hull, hull_max } = s.ship;
    marketChoice(s, ctx(), 'upgrade:armour');
    expect(s.ship.modules.armour).toBe(2);
    expect(s.ship.hull_max).toBe(hull_max + data.config.ARMOUR_HULL_PER_LEVEL);
    expect(s.ship.hull).toBe(hull + data.config.ARMOUR_HULL_PER_LEVEL);
  });

  it('the market opens on sections, each with a way back', () => {
    const s = docked('KARRAK_STATION');
    expect(marketOptions(s, ctx()).options.map((o) => o.id)).toEqual(MARKET_SECTIONS.map((k) => `section:${k}`));
    for (const k of MARKET_SECTIONS) {
      const ids = marketOptions(s, ctx(), k).options.map((o) => o.id);
      expect(ids[ids.length - 1]).toBe('section:');
    }
  });

  it('the hub remembers the open section until the tab changes', () => {
    let s = docked('KARRAK_STATION');
    s.scenes = [{ type: 'hub', tab: 'market' }];
    s = applyChoice(s, data, 'mkt:section:upgrades');
    expect(buildView(s, data).options.some((o) => o.id === 'mkt:upgrade:armour')).toBe(true);
    s = applyChoice(s, data, 'tab:ship');
    s = applyChoice(s, data, 'tab:market');
    expect(buildView(s, data).options[0].id).toBe('mkt:section:fuel');
  });
});

describe('post-game quests', () => {
  function atEnding(hold: 'UNBROKEN' | 'SCARRED' | 'EVACUATED', core: 'RECOVERED' | 'LOST' = 'RECOVERED') {
    const s = gameFor('THEYN_KAPITAN');
    s.story.ending = { warboss: 'DUEL', skragnak_fate: 'EXILED', grudge: 'BLOOD', hold, core: core === 'LOST' ? 'LOST' : 'RETURNED', grizzgut: 'BEATEN' };
    s.story.core_status = core;
    s.story.flags.ACT3_STARTED = true;
    s.story.active_beats = [];
    s.scenes = [{ type: 'hub', tab: 'comms' }];
    startFreeRoam(s, ctx());
    return s;
  }

  it('each Hold fate gets its own quest; Hunt Gitzbolt only when the Core was lost', () => {
    const msgs = (s: GameState) => s.inbox.map((m) => m.key).filter((k) => k.startsWith('PQ_'));
    expect(msgs(atEnding('UNBROKEN'))).toEqual(['PQ_COUNCIL']);
    expect(msgs(atEnding('SCARRED'))).toEqual(['PQ_REBUILD']);
    expect(msgs(atEnding('EVACUATED'))).toEqual(['PQ_NEW_HEARTH']);
    expect(msgs(atEnding('UNBROKEN', 'LOST')).sort()).toEqual(['PQ_COUNCIL', 'PQ_GITZBOLT']);
  });

  it('a lost quest fight leaves the beat waiting for another try', () => {
    const s = atEnding('UNBROKEN');
    s.story.active_beats = ['PQ_C2_LAST_WARBAND'];
    const combat = startCombat(s, ctx(), 'PQ_LAST_WARBAND', { beat: 'PQ_C2_LAST_WARBAND', route: 'FIGHT' });
    s.scenes.push({ type: 'combat', combat });
    finishEncounter(s, ctx(), combat, 'defeat', []);
    expect(s.story.active_beats).toContain('PQ_C2_LAST_WARBAND');
    expect(s.story.completed_beats.some((b) => b.key === 'PQ_C2_LAST_WARBAND')).toBe(false);
    expect(s.story.deferred_beats).toContain('PQ_C2_LAST_WARBAND');
  });

  it('A New Hearth makes the chosen system a port with a market', () => {
    const s = atEnding('EVACUATED');
    applyEffects(s, ctx(), [{ set_home_port: 'KETHRAS_ANVIL' }]);
    s.location = 'KETHRAS_ANVIL';
    dock(s, ctx());
    expect(s.docked).toBe(true);
    expect(marketOptions(s, ctx()).options.length).toBe(MARKET_SECTIONS.length);
  });

  it('finishing every open quest completes the saga', () => {
    let s = atEnding('UNBROKEN');
    for (let i = 0; i < 10 && top(s).type !== 'hub'; i++) s = applyChoice(s, data, top(s).type === 'beat' ? 'defer' : 'continue');
    expect(top(s).type).toBe('hub');
    applyEffects(s, ctx(), [{ complete_quest: 'Q_COUNCIL' }]);
    s.character.stat_points = 0;
    s = applyChoice(s, data, 'tab:logbook');
    expect(top(s)).toMatchObject({ type: 'notice', title: 'The saga is complete' });
  });
});

describe('saves', () => {
  it('Milestone 3 saves load: armour, relic slots, quests and combat fields are filled in', () => {
    const s = gameFor('ARKANYST_EVALUATOR');
    const combat = startCombat(s, ctx(), 'A1_RAIDER_ESCAPE', null);
    s.scenes.push({ type: 'combat', combat });
    const old = JSON.parse(JSON.stringify(s));
    old.version = 3;
    delete old.ship.modules.armour;
    for (const r of old.relics) delete r.equipped;
    delete old.story.post_quests_completed;
    delete old.story.home_port;
    const c = old.scenes[old.scenes.length - 1].combat;
    delete c.menu;
    for (const k of ['battle_oath', 'oath_broken', 'committed', 'hit_resolve_bonus']) delete c.buffs[k];
    const m = migrateState(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.ship.modules.armour).toBe(1);
    expect(m.relics.every((r) => r.equipped === false)).toBe(true);
    expect(m.story.post_quests_completed).toEqual([]);
    expect(buildView(m, data).kind).toBe('combat');
  });
});
