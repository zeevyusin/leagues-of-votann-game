// Milestone 3 systems: the rest of combat Phase 2 (misleading reads, leverage, injuries, range bands,
// targeting), duels, boarding, the super-weapon, Act 3 modifiers, the muster, and save migration.
import { describe, expect, it } from 'vitest';
import { applyChoice, buildView } from '../src/engine/game';
import {
  gainInjury,
  leverageModifiers,
  negotiationDifficulty,
  newPersonalRound,
  personalRound,
  shipRound,
  startCombat,
  useCounterKey,
} from '../src/engine/combat';
import { finishEncounter, resolveNext } from '../src/engine/story';
import { applyDefeat } from '../src/engine/defeat';
import { marketChoice } from '../src/engine/market';
import { dock } from '../src/engine/travel';
import { generalModifiers } from '../src/engine/rules';
import { ScriptedRng } from '../src/engine/rng';
import { SAVE_VERSION, migrateState, type GameState, type PersonalCombat, type ShipCombat } from '../src/engine/types';
import { ctxWith, data, gameFor } from './helpers';

const ctx = (v = 0.5) => ctxWith(new ScriptedRng([v]));
const top = (s: GameState) => s.scenes[s.scenes.length - 1];

function personal(enc: string, sub = 'HERNKYN_PIONEER', kin: 'KIN' | 'IRONKIN' = 'KIN') {
  const s = gameFor(sub, kin);
  const combat = startCombat(s, ctx(), enc, null) as PersonalCombat;
  return { s, combat };
}

function ship(enc: string, sub = 'HERNKYN_PIONEER') {
  const s = gameFor(sub);
  const combat = startCombat(s, ctx(), enc, null) as ShipCombat;
  return { s, combat };
}

describe('misleading reads', () => {
  it('a deceptive enemy can turn a vague read into a false one', () => {
    const { s, combat } = personal('B2_VAULT_SCAVENGERS', 'HEARTHKYN_WARRIOR');
    // Every die and pick lowest: natural 1 on the read (vague), then the mislead check passes.
    newPersonalRound(s, ctx(0), combat);
    expect(combat.read).toBe('misleading');
    expect(combat.shown_intent).not.toBe(combat.intent);
    const view = buildView({ ...s, scenes: [...s.scenes, { type: 'combat', combat }] }, data);
    expect(view.body.some((l) => l.text.includes('[Read: Clear'))).toBe(true);
  });

  it('an honest enemy never misleads', () => {
    const { s, combat } = personal('A1_DIG_SITE_RAID', 'HEARTHKYN_WARRIOR');
    newPersonalRound(s, ctx(0), combat);
    expect(combat.read).toBe('vague');
  });

  it('after the round, the result says what the enemy really did', () => {
    const { s, combat } = personal('B2_VAULT_SCAVENGERS', 'HEARTHKYN_WARRIOR');
    newPersonalRound(s, ctx(0), combat);
    const out = personalRound(s, ctx(0.5), combat, 'attack');
    expect(out.lines[0].text).toContain('It was a feint!');
  });
});

describe('Negotiate leverage', () => {
  it('each leverage source adds +2 to Negotiate', () => {
    const { s, combat } = personal('EV_PIRATE_BOARDING', 'PROSPECTOR_TRADER');
    expect(leverageModifiers(s, ctx(), combat)).toEqual([]);
    s.reputation.FREEBOOTERS = 10;
    expect(leverageModifiers(s, ctx(), combat)).toEqual([{ label: 'Leverage: Snazrik vouches for you', value: data.config.LEVERAGE_BONUS }]);
  });

  it('leverage is capped at +4', () => {
    const { s, combat } = personal('A3_GUNSHIP_BOARDING', 'PROSPECTOR_TRADER');
    combat.enemy.key = 'BIG_MEK_GITZBOLT';
    s.lore.push('LORE_GITZBOLT_WEAPON');
    s.story.story_rewards.push('TECH_COUNTERKEY');
    const total = leverageModifiers(s, ctx(), combat).reduce((n, m) => n + m.value, 0);
    expect(total).toBe(data.config.LEVERAGE_MAX);
  });

  it('hardened enemies are harder to talk down without leverage', () => {
    const { s, combat } = personal('D2_SLAVE_CAMP', 'PROSPECTOR_TRADER');
    combat.enemy.key = 'SLAVER_NOB';
    const base = data.enemies.find((e) => e.key === 'SLAVER_NOB')!.negotiation_difficulty;
    expect(negotiationDifficulty(s, ctx(), combat)).toBe(base + data.config.HARDENED_NEGOTIATION_PENALTY);
    s.lore.push('LORE_MUSTER');
    expect(negotiationDifficulty(s, ctx(), combat)).toBe(base);
  });
});

describe('injuries', () => {
  it('a hit of 4 or more Health causes an injury that penalises its stat', () => {
    const { s, combat } = personal('A3_SKRAGNAK_LAST');
    combat.enemy.key = 'SKRAGNAK';
    combat.intent = 'aggressive';
    personalRound(s, ctx(0), combat, 'attack');
    expect(s.character.injuries.length).toBe(1);
    const injury = data.injuries.find((i) => i.key === s.character.injuries[0])!;
    expect(generalModifiers(s, data, injury.stat, 'story')).toContainEqual({ label: injury.name, value: injury.value });
  });

  it('no more than INJURY_MAX at once', () => {
    const s = gameFor('HERNKYN_PIONEER');
    for (let i = 0; i < 10; i++) gainInjury(s, ctx(i / 10), []);
    expect(s.character.injuries.length).toBe(data.config.INJURY_MAX);
    expect(new Set(s.character.injuries).size).toBe(s.character.injuries.length);
  });

  it('Kin rest in port for days; Ironkin pay Ore for repairs', () => {
    const kin = gameFor('HERNKYN_PIONEER');
    kin.location = 'KARRAK_STATION';
    dock(kin, ctx());
    kin.character.injuries = ['CRACKED_RIBS'];
    const day = kin.day;
    marketChoice(kin, ctx(), 'rest');
    expect(kin.character.injuries).toEqual([]);
    expect(kin.day).toBe(day + data.config.INJURY_REST_DAYS);

    const iron = gameFor('HERNKYN_PIONEER', 'IRONKIN');
    iron.location = 'KARRAK_STATION';
    dock(iron, ctx());
    iron.character.injuries = ['CRACKED_RIBS'];
    iron.resources.ore = 50;
    expect(marketChoice(iron, ctx(), 'rest')).toBeNull();
    marketChoice(iron, ctx(), 'repair_injury');
    expect(iron.character.injuries).toEqual([]);
    expect(iron.resources.ore).toBe(50 - data.config.INJURY_REPAIR_ORE);
  });

  it('defeat in personal combat causes an injury, and defeat recovery does not clear it', () => {
    const s = gameFor('HERNKYN_PIONEER');
    const combat = startCombat(s, ctx(), 'A1_DIG_SITE_RAID', null);
    s.scenes.push({ type: 'combat', combat });
    finishEncounter(s, ctx(0), combat, 'defeat', []);
    expect(s.character.injuries.length).toBe(1);
  });
});

describe('range bands and targeting', () => {
  it('more engine pips than the enemy gets your preferred range, and Close adds damage', () => {
    const { s, combat } = ship('A1_RAIDER_ESCAPE');
    combat.range_pref = 'close';
    combat.enemy_alloc = { weapons: 4, shields: 1, engines: 1 };
    shipRound(s, ctx(0.999), combat, { weapons: 3, shields: 0, engines: 3 });
    expect(combat.range).toBe('close');
    expect(combat.enemy.hull_max - combat.enemy.hull).toBe(3 * 2 - 1 + data.config.RANGE_CLOSE_DAMAGE);
  });

  it('fewer engine pips hands the enemy its preferred range', () => {
    const { s, combat } = ship('A2_SCOUT_FIGHT');
    combat.range_pref = 'close';
    combat.enemy_alloc = { weapons: 2, shields: 1, engines: 3 };
    shipRound(s, ctx(0.999), combat, { weapons: 3, shields: 3, engines: 0 });
    expect(combat.range).toBe('long');
  });

  it('a hit on a targeted system knocks out its pips next round', () => {
    const { s, combat } = ship('A1_RAIDER_ESCAPE');
    combat.target = 'weapons';
    combat.enemy_alloc = { weapons: 4, shields: 1, engines: 1 };
    combat.enemy.hull = combat.enemy.hull_max = 99;
    shipRound(s, ctx(0.999), combat, { weapons: 3, shields: 0, engines: 3 });
    const raider = data.enemy_ships.find((x) => x.key === 'ORK_RAIDER')!;
    expect(combat.enemy_alloc.weapons).toBeLessThanOrEqual(raider.system_caps.weapons - data.config.TARGET_PIPS_CRIT);
    const total = combat.enemy_alloc.weapons + combat.enemy_alloc.shields + combat.enemy_alloc.engines;
    expect(total).toBe(raider.reactor_pips - data.config.TARGET_PIPS_CRIT);
  });

  it('targeting makes the shot harder', () => {
    const { s, combat } = ship('A1_RAIDER_ESCAPE');
    combat.target = 'engines';
    combat.enemy_alloc = { weapons: 4, shields: 1, engines: 1 };
    const rolls: { difficulty: number }[] = [];
    shipRound(s, { ...ctx(0.5), rolls: rolls as never[] }, combat, { weapons: 3, shields: 2, engines: 1 });
    const raider = data.enemy_ships.find((x) => x.key === 'ORK_RAIDER')!;
    expect(rolls[0].difficulty).toBe(raider.defense_difficulty + 1 + data.config.TARGET_DIFFICULTY);
  });
});

describe('duels', () => {
  it('a duelist adapts to a stance used twice in a row', () => {
    const { s, combat } = personal('A3_GRIZZGUT_DUEL');
    personalRound(s, ctx(0.5), combat, 'attack');
    personalRound(s, ctx(0.5), combat, 'attack');
    expect(combat.intent).toBe('guarded');
    expect(combat.telegraph).toContain("He's seen that before.");
  });

  it('no talking and no escape in a duel', () => {
    const { s, combat } = personal('A3_GRIZZGUT_DUEL', 'PROSPECTOR_TRADER');
    combat.enemy.key = 'NOB_GRIZZGUT_2';
    const view = buildView({ ...s, scenes: [...s.scenes, { type: 'combat', combat }] }, data);
    expect(view.options.find((o) => o.id === 'stance:negotiate')?.locked).toBe('No talking in a duel');
    expect(view.options.some((o) => o.id === 'withdraw')).toBe(false);
  });

  it('stances are counted across the campaign', () => {
    const { s, combat } = personal('A1_DIG_SITE_RAID');
    personalRound(s, ctx(0.5), combat, 'defend');
    expect(s.stance_counts.defend).toBe(1);
  });
});

describe('boarding and the super-weapon', () => {
  it('a disabled ship with a boarding encounter offers "Board her", which starts the boarding fight', () => {
    let s = gameFor('HERNKYN_PIONEER');
    const combat = startCombat(s, ctx(), 'A3_WAVE_GUNSHIP', null);
    s.scenes.push({ type: 'combat', combat });
    finishEncounter(s, ctx(), combat, 'victory_broken', []);
    expect(top(s).type).toBe('board');
    s = applyChoice(s, data, 'board');
    const t = top(s);
    expect(t.type === 'combat' && t.combat.encounter).toBe('A3_GUNSHIP_BOARDING');
  });

  it('"Leave her" ends the ship fight with its normal victory', () => {
    let s = gameFor('HERNKYN_PIONEER');
    const combat = startCombat(s, ctx(), 'A3_WAVE_GUNSHIP', null);
    s.scenes.push({ type: 'combat', combat });
    finishEncounter(s, ctx(), combat, 'victory_broken', []);
    s = applyChoice(s, data, 'leave');
    expect(top(s).type).toBe('notice');
    expect(s.story.flags.SUPERWEAPON_DOWN).toBe(true);
  });

  it('the super-weapon hits through shields every round until the counter-key shuts it down', () => {
    const { s, combat } = ship('A3_WAVE_GUNSHIP');
    combat.enemy.hull = combat.enemy.hull_max = 99;
    const hull = s.ship.hull;
    shipRound(s, ctx(0.999), combat, { weapons: 3, shields: 3, engines: 0 });
    expect(s.ship.hull).toBe(hull - data.config.SUPERWEAPON_DAMAGE);
    expect(() => useCounterKey(s, ctx(), combat)).toThrow();
    s.story.story_rewards.push('TECH_COUNTERKEY');
    useCounterKey(s, ctx(), combat);
    expect(s.story.flags.CORE_RECOVERABLE).toBe(true);
    shipRound(s, ctx(0.999), combat, { weapons: 3, shields: 3, engines: 0 });
    expect(s.ship.hull).toBe(hull - data.config.SUPERWEAPON_DAMAGE);
  });
});

describe('Act 3 fight modifiers', () => {
  it('enemy Hull scales with the Waaagh! band, and first strike starts them damaged', () => {
    const s = gameFor('HERNKYN_PIONEER');
    const hull = data.enemy_ships.find((x) => x.key === 'ORK_ESCORT_PACK')!.hull;
    s.story.waaagh_meter = 10;
    expect((startCombat(s, ctx(), 'A3_WAVE_ESCORTS', null) as ShipCombat).enemy.hull_max).toBe(Math.round(hull * 0.75));
    s.story.waaagh_meter = 70;
    expect((startCombat(s, ctx(), 'A3_WAVE_ESCORTS', null) as ShipCombat).enemy.hull_max).toBe(Math.round(hull * 1.25));
    s.story.flags.ACT3_FORCED = true;
    const forced = startCombat(s, ctx(), 'A3_WAVE_ESCORTS', null) as ShipCombat;
    expect(forced.enemy.hull_max).toBe(Math.round(hull * 1.5));
    s.story.flags.ACT3_STRIKE_MUSTER = true;
    const struck = startCombat(s, ctx(), 'A3_WAVE_ESCORTS', null) as ShipCombat;
    expect(struck.enemy.hull).toBe(struck.enemy.hull_max - 3);
  });

  it('Urgrot halves the flagship guard', () => {
    const s = gameFor('HERNKYN_PIONEER');
    s.story.waaagh_meter = 40;
    const full = (startCombat(s, ctx(), 'A3_WAVE_FLAGSHIP_GUARD', null) as ShipCombat).enemy.hull_max;
    s.story.story_rewards.push('ALLIES_URGROT');
    expect((startCombat(s, ctx(), 'A3_WAVE_FLAGSHIP_GUARD', null) as ShipCombat).enemy.hull_max).toBe(Math.round(full * 0.5));
  });

  it('Press on gives +2 to the first roll of the next fight only', () => {
    const s = gameFor('HERNKYN_PIONEER');
    s.pending_fight_mods = [{ label: 'Pressing on', value: 2, rolls: 1 }];
    const combat = startCombat(s, ctx(), 'A1_DIG_SITE_RAID', null) as PersonalCombat;
    expect(s.pending_fight_mods).toEqual([]);
    // Same dice both rounds, so the same intent and matchup: only Press on differs.
    const rolls: { modifierTotal: number }[] = [];
    personalRound(s, { ...ctx(0.5), rolls: rolls as never[] }, combat, 'defend');
    personalRound(s, { ...ctx(0.5), rolls: rolls as never[] }, combat, 'defend');
    expect(rolls[0].modifierTotal - rolls[1].modifierTotal).toBe(2);
  });

  it('skipped beats are passed over when the story moves on', () => {
    const s = gameFor('HERNKYN_PIONEER');
    // No Ylsa crisis (Hearthfire is not Low) and no muster intel: straight to the first wave.
    expect(resolveNext(s, ctx(), 'A3_YLSA')).toBe('A3_WAVE_1');
    s.story.story_rewards.push('ALLIES_LEAGUE');
    expect(resolveNext(s, ctx(), 'A3_YLSA')).toBe('A3_WAVE_1_LEAGUE');
  });
});

describe('the muster', () => {
  function readyToMuster(): GameState {
    const s = gameFor('THEYN_KAPITAN');
    s.story.flags.ACT2_STARTED = true;
    s.story.act_events_shown.push('ACT2_STARTED', 'ACT3_UNLOCKED');
    s.story.acts_completed.push(1);
    s.story.waaagh_meter = 40;
    s.location = 'KARRAK_STATION';
    dock(s, ctx());
    s.scenes = [{ type: 'hub', tab: 'nav' }];
    s.oaths.push({ key: 'JOB_SCRAP', status: 'ACTIVE', sworn_day: s.day, deadline_day: s.day + 30 });
    return s;
  }

  it('is offered on Nav at a muster port, warns about broken contracts, and breaks them', () => {
    let s = readyToMuster();
    expect(buildView(s, data).options.some((o) => o.id === 'muster')).toBe(true);
    s = applyChoice(s, data, 'muster');
    expect(buildView(s, data).body.some((l) => l.text.includes('Contract: Ork scrap'))).toBe(true);
    s = applyChoice(s, data, 'confirm');
    expect(s.oaths.find((o) => o.key === 'JOB_SCRAP')?.status).toBe('BROKEN');
    expect(s.location).toBe('HOLD_DURNVAR');
    expect(s.story.act).toBe(3);
    expect(s.scenes.some((x) => x.type === 'beat' && x.key === 'A3_RALLY')).toBe(true);
  });

  it('"Not yet" changes nothing', () => {
    let s = readyToMuster();
    s = applyChoice(applyChoice(s, data, 'muster'), data, 'back');
    expect(s.story.flags.ACT3_STARTED).toBeFalsy();
    expect(top(s).type).toBe('hub');
  });

  it('during the rally there is no travel, only "Lead the fleet out"', () => {
    let s = applyChoice(applyChoice(readyToMuster(), data, 'muster'), data, 'confirm');
    const answer = { beat: 'route:MAKE_READY', level_up: 'stat:grit', notice: 'continue' } as Record<string, string>;
    for (let i = 0; i < 20 && top(s).type !== 'hub'; i++) s = applyChoice(s, data, answer[top(s).type]);
    expect(top(s).type).toBe('hub');
    s = applyChoice(s, data, 'tab:nav');
    const ids = buildView(s, data).options.map((o) => o.id);
    expect(ids.some((id) => id.startsWith('go:'))).toBe(false);
    expect(ids).toContain('launch');
    expect(s.ship.hull).toBe(s.ship.hull_max);
    s = applyChoice(s, data, 'launch');
    expect(s.docked).toBe(false);
    expect(top(s).type).toBe('beat');
  });

  it('the Waaagh! reaching 100 forces Act 3 wherever the player is', () => {
    let s = readyToMuster();
    s.story.act_events_shown = s.story.act_events_shown.filter((k) => k !== 'ACT3_UNLOCKED');
    s.location = 'CINDER_DRIFT';
    s.docked = false;
    s.story.waaagh_meter = 100;
    s = applyChoice(s, data, 'tab:comms');
    expect(s.story.flags.ACT3_FORCED).toBe(true);
    expect(s.location).toBe('HOLD_DURNVAR');
    expect(top(s)).toMatchObject({ type: 'notice', title: 'The Waaagh! has launched' });
  });
});

describe('crew safety and saves', () => {
  it('Ylsa cannot be lost to a defeat before Act 3; other crew can', () => {
    const s = gameFor('HERNKYN_PIONEER');
    s.crew = ['DORRIK', 'YLSA'];
    applyDefeat(s, ctx(0), { cause: 'combat' });
    expect(s.crew).toEqual(['DORRIK', 'YLSA']);
    s.crew = ['DORRIK', 'YLSA', 'BROKKA'];
    applyDefeat(s, ctx(0), { cause: 'combat' });
    expect(s.crew).toEqual(['DORRIK', 'YLSA']);
  });

  it('Milestone 2 saves load: new fields are filled in', () => {
    const s = gameFor('HERNKYN_PIONEER');
    const combat = startCombat(s, ctx(), 'A1_RAIDER_ESCAPE', null);
    s.scenes.push({ type: 'combat', combat });
    const old = JSON.parse(JSON.stringify(s));
    old.version = 2;
    delete old.character.injuries;
    delete old.story.crew_lost;
    delete old.story.ending;
    delete old.story.post_game;
    delete old.stance_counts;
    delete old.pending_fight_mods;
    const c = old.scenes[old.scenes.length - 1].combat;
    delete c.range;
    delete c.range_pref;
    delete c.target;
    delete c.knocked;
    delete c.buffs.mods;
    const m = migrateState(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.character.injuries).toEqual([]);
    expect(m.story.post_game).toBe(false);
    expect(m.stance_counts.attack).toBe(0);
    expect(buildView(m, data).kind).toBe('combat');
  });
});
