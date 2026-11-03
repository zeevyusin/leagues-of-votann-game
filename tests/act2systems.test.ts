// Milestone 2 systems: market, travel events, jobs, withdraw, console actions, traits, deferring, migration.
import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/engine/types';
import { applyChoice, buildView } from '../src/engine/game';
import { personalWithdraw, startCombat, useCombatAction, personalRound, shipWithdraw } from '../src/engine/combat';
import { marketChoice, fuelPrice, upgradePrice, sellPrice, currentMarket } from '../src/engine/market';
import { pickTravelEvent, travel, dock } from '../src/engine/travel';
import { migrateState, type GameState, type PersonalCombat, type ShipCombat } from '../src/engine/types';
import { ScriptedRng } from '../src/engine/rng';
import { play } from './playthroughPolicy';
import { ctxWith, data, gameFor } from './helpers';

const ctx = (v = 0.5) => ctxWith(new ScriptedRng([v]));
const afterAct1 = (sub = 'HEARTHKYN_WARRIOR', kin: 'KIN' | 'IRONKIN' = 'KIN') =>
  play(gameFor(sub, kin, 99), { until: (s) => s.story.acts_completed.includes(1) && s.story.flags.ACT2_STARTED === true });

/** Docks the player at a port (for market tests). */
function dockedAt(state: GameState, port: string): GameState {
  const s = structuredClone(state);
  s.location = port;
  dock(s, ctx());
  return s;
}

describe('Act 2 start', () => {
  it('opens all four threads with their first beats active', () => {
    const s = afterAct1();
    expect(s.story.active_beats).toEqual(['A2_A1_COLD_TRAILS', 'A2_B1_SCRAP_AUTOPSY', 'A2_C1_SLOW_COUNCIL', 'A2_D1_BURN_THE_OUTPOSTS']);
    for (const m of data.config.ACT2_THREAD_MESSAGES) expect(s.inbox.some((x) => x.key === m)).toBe(true);
    expect(s.discovered_systems).toEqual(expect.arrayContaining(['CINDER_DRIFT', 'GRIMHOLT_BELT', 'GITZBOLT_SCRAPFIELD']));
  });

  it('an arrival beat can be put off and comes back on the next visit', () => {
    let s = afterAct1();
    s = structuredClone(s);
    s.location = 'KETHRAS_ANVIL';
    s.scenes = [{ type: 'hub', tab: 'nav' }];
    s = applyChoice(s, data, 'go:CINDER_DRIFT', undefined, new ScriptedRng([0.999]));
    while (s.scenes[s.scenes.length - 1].type === 'notice') s = applyChoice(s, data, 'continue');
    expect(s.scenes[s.scenes.length - 1]).toMatchObject({ type: 'beat', key: 'A2_A1_COLD_TRAILS' });
    s = applyChoice(s, data, 'defer');
    expect(s.scenes[s.scenes.length - 1].type).toBe('hub');
    expect(s.story.active_beats).toContain('A2_A1_COLD_TRAILS');
    s = applyChoice(s, data, 'go:KARRAK_STATION', undefined, new ScriptedRng([0.999]));
    while (s.scenes[s.scenes.length - 1].type !== 'hub') s = applyChoice(s, data, 'continue');
    s = applyChoice(s, data, 'go:CINDER_DRIFT', undefined, new ScriptedRng([0.999]));
    while (s.scenes[s.scenes.length - 1].type === 'notice') s = applyChoice(s, data, 'continue');
    expect(s.scenes[s.scenes.length - 1]).toMatchObject({ type: 'beat', key: 'A2_A1_COLD_TRAILS' });
  });

  it('old v1 saves migrate: the pending beat becomes an active beat', () => {
    const s = gameFor('HEARTHKYN_WARRIOR') as unknown as Record<string, unknown> & GameState;
    const legacy = structuredClone(s) as unknown as { version: number; story: Record<string, unknown> };
    legacy.version = 1;
    legacy.story.current_beat = 'A1_B1_THE_SURVEY';
    delete legacy.story.active_beats;
    const migrated = migrateState(legacy as unknown as GameState);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.story.active_beats).toEqual(['A1_B1_THE_SURVEY']);
    expect(migrated.story.deferred_beats).toEqual([]);
  });
});

describe('market', () => {
  it('reputation discounts and surcharges prices', () => {
    const s = dockedAt(afterAct1(), 'KARRAK_STATION');
    const m = currentMarket(s, ctx())!;
    s.reputation.KARRAK_STATION = 0;
    const base = fuelPrice(s, ctx(), m)!;
    s.reputation.KARRAK_STATION = 25;
    expect(fuelPrice(s, ctx(), m)).toBeLessThanOrEqual(base);
    s.reputation.KARRAK_STATION = -5;
    expect(fuelPrice(s, ctx(), m)).toBeGreaterThan(base);
  });

  it('upgrades raise module levels and cost more at level 3; Forge-Wise pays less', () => {
    const s = dockedAt(afterAct1(), 'KARRAK_STATION');
    s.resources.ore = 1000;
    const m = currentMarket(s, ctx())!;
    const l2 = upgradePrice(s, ctx(), m, 'weapons')!;
    marketChoice(s, ctx(), 'upgrade:weapons');
    expect(s.ship.modules.weapons).toBe(2);
    expect(upgradePrice(s, ctx(), m, 'weapons')!).toBeGreaterThan(l2);
    const smith = dockedAt(afterAct1('BROKHYR_IRONMASTER'), 'KARRAK_STATION');
    expect(upgradePrice(smith, ctx(), currentMarket(smith, ctx())!, 'weapons')!).toBeLessThan(l2);
  });

  it('the cargo hold upgrade adds capacity', () => {
    const s = dockedAt(afterAct1(), 'KARRAK_STATION');
    s.resources.ore = 1000;
    const before = s.ship.cargo_capacity;
    marketChoice(s, ctx(), 'upgrade:cargo_hold');
    expect(s.ship.cargo_capacity).toBe(before + data.config.CARGO_CAPACITY_PER_HOLD_LEVEL);
  });

  it('mission items cannot be sold; Eye for Ore sells for more', () => {
    const s = dockedAt(afterAct1(), 'KARRAK_STATION');
    const m = currentMarket(s, ctx())!;
    expect(sellPrice(s, ctx(), m, 'VAULT_RUBBINGS')).toBe(0);
    const trader = dockedAt(afterAct1('PROSPECTOR_TRADER'), 'KARRAK_STATION');
    expect(sellPrice(trader, ctx(), m, 'ORK_SCRAP')).toBeGreaterThan(sellPrice(s, ctx(), m, 'ORK_SCRAP'));
  });

  it('Haggle improves prices once per visit', () => {
    const s = dockedAt(afterAct1('PROSPECTOR_TRADER'), 'KARRAK_STATION');
    const m = currentMarket(s, ctx())!;
    const before = fuelPrice(s, ctx(), m)!;
    expect(marketChoice(s, ctx(), 'haggle')).not.toBeNull();
    expect(fuelPrice(s, ctx(), m)!).toBeLessThan(before);
    expect(marketChoice(s, ctx(), 'haggle')).toBeNull();
  });

  it('dock work always earns Ore, so a broke captain can fly on', () => {
    const s = dockedAt(afterAct1(), 'KARRAK_STATION');
    s.resources.ore = 0;
    const day = s.day;
    marketChoice(s, ctx(), 'work');
    expect(s.resources.ore).toBe(data.config.DOCK_WORK_ORE);
    expect(s.day).toBe(day + data.config.DOCK_WORK_DAYS);
  });

  it("Snazrik's Haven closes once the Waaagh! reaches 60", () => {
    const s = afterAct1();
    s.story.waaagh_meter = 60;
    const closed = dockedAt(s, 'SNAZRIK_HAVEN');
    expect(closed.docked).toBe(false);
    expect(currentMarket(closed, ctx())).toBeNull();
  });

  it('the market tab only appears while docked', () => {
    const s = dockedAt(afterAct1(), 'KARRAK_STATION');
    s.scenes = [{ type: 'hub', tab: 'comms' }];
    expect(buildView(s, data).tabs?.market).toBe(true);
    s.docked = false;
    expect(buildView(s, data).tabs?.market).toBe(false);
  });
});

describe('travel events', () => {
  it('never fire combat events during the grace journey', () => {
    const s = afterAct1();
    s.grace_journeys = 1;
    for (let i = 0; i < 30; i++) {
      const key = pickTravelEvent(s, ctxWith(new ScriptedRng([0, i / 30])), 'HIGH');
      if (key) expect(data.story_beats.find((b) => b.key === key)!.event!.combat).toBe(false);
    }
  });

  it('Chart Safe Route saves fuel on the next journey', () => {
    const s = afterAct1('HERNKYN_PIONEER');
    s.scenes = [{ type: 'hub', tab: 'nav' }];
    const fuel = s.resources.fuel;
    let t = applyChoice(s, data, 'safe_route');
    t = applyChoice(t, data, 'continue');
    travel(t, ctx(0.999), 'HOLD_DURNVAR');
    expect(t.resources.fuel).toBe(fuel - (3 - data.config.SAFE_ROUTE_FUEL_SAVING));
  });

  it('only events whose requirements are met can fire', () => {
    const s = afterAct1();
    s.story.waaagh_meter = 0;
    for (let i = 0; i < 40; i++) expect(pickTravelEvent(s, ctxWith(new ScriptedRng([0, i / 40])), 'LOW')).not.toBe('EV_REFUGEES');
  });
});

describe('jobs', () => {
  it('a delivery contract is kept automatically on docking with the cargo', () => {
    let s = dockedAt(afterAct1(), 'KARRAK_STATION');
    expect(s.inbox.some((m) => m.key === 'JOBMSG_MEDICAE')).toBe(true);
    s.scenes = [{ type: 'hub', tab: 'comms' }];
    s = applyChoice(s, data, 'msg:JOBMSG_MEDICAE');
    s = applyChoice(s, data, 'accept');
    expect(s.oaths.find((o) => o.key === 'JOB_MEDICAE')?.status).toBe('ACTIVE');
    expect(s.cargo.find((c) => c.key === 'JOB_MEDICAE_CRATES')?.qty).toBe(2);
    const ore = s.resources.ore;
    const there = dockedAt(s, 'HOLD_DURNVAR');
    expect(there.oaths.find((o) => o.key === 'JOB_MEDICAE')?.status).toBe('KEPT');
    expect(there.resources.ore).toBe(ore + 60);
  });
});

describe('combat phase 2', () => {
  const fight = (sub: string, kin: 'KIN' | 'IRONKIN' = 'KIN', enc = 'D1_WARBAND') => {
    const s = gameFor(sub, kin);
    const combat = startCombat(s, ctx(), enc, null) as PersonalCombat;
    combat.enemy.resolve = combat.enemy.resolve_max = 20;
    return { s, combat };
  };

  it('a console action can be used once per fight', () => {
    const { s, combat } = fight('HEARTHKYN_WARRIOR');
    useCombatAction(s, ctx(), combat);
    expect(combat.buffs.fight_bonus).toBe(2);
    expect(() => useCombatAction(s, ctx(), combat)).toThrow();
  });

  it('Blood-Rage costs Health for Kin and Wear for Ironkin (with a doubled bonus)', () => {
    const kin = fight('CTHONIAN_BERSERK', 'KIN');
    const hp = kin.s.character.health;
    useCombatAction(kin.s, ctx(), kin.combat);
    expect(kin.s.character.health).toBe(hp - 2);
    expect(kin.combat.buffs.fight_bonus).toBe(4);
    const iron = fight('CTHONIAN_BERSERK', 'IRONKIN');
    useCombatAction(iron.s, ctx(), iron.combat);
    expect(iron.combat.buffs.fight_bonus).toBe(8);
    expect(iron.s.character.wear).toBe(25);
  });

  it('Evaluate Relic has no combat use', () => {
    const { s, combat } = fight('ARKANYST_EVALUATOR');
    expect(() => useCombatAction(s, ctx(), combat)).toThrow();
  });

  it('Long-Range Scan reveals intent and strikes first', () => {
    const { s, combat } = fight('HERNKYN_YAEGIR');
    useCombatAction(s, ctx(), combat);
    expect(combat.read).toBe('clear');
    expect(combat.enemy.resolve).toBe(18);
  });

  it('Tunnel-Born adds +2 in cramped encounters', () => {
    const { s, combat } = fight('CTHONIAN_BERSERK', 'KIN', 'D2_SLAVE_CAMP');
    const rolls: { total: number; die: number; statValue: number }[] = [];
    combat.intent = 'evasive';
    personalRound(s, { ...ctx(), rolls: rolls as never[] }, combat, 'attack');
    // die 11 + Grit + matched counter + Tunnel-Born +2
    expect(rolls[0].total).toBe(11 + rolls[0].statValue + data.config.COMBAT_MATCHED_BONUS + 2);
  });

  it('Withdraw is refused where the encounter does not allow it', () => {
    const { s, combat } = fight('HEARTHKYN_WARRIOR', 'KIN', 'D3_PIT');
    expect(() => personalWithdraw(s, ctx(), combat)).toThrow();
  });

  it('a successful Withdraw ends the fight with "withdrew"', () => {
    const { s, combat } = fight('HEARTHKYN_WARRIOR');
    expect(personalWithdraw(s, ctx(0.999), combat).result).toBe('withdrew');
  });

  it('Chart Safe Route makes the next ship Withdraw automatic', () => {
    const s = gameFor('HERNKYN_PIONEER');
    const combat = startCombat(s, ctx(), 'A2_SCOUT_FIGHT', null) as ShipCombat;
    useCombatAction(s, ctx(), combat);
    expect(shipWithdraw(s, ctx(0), combat).result).toBe('withdrew');
  });

  it('Old Guard keeps Hearthfire on defeat', () => {
    let s = gameFor('EINHYR_HEARTHGUARD');
    const combat = startCombat(s, ctx(), 'D1_WARBAND', null);
    s.scenes.push({ type: 'combat', combat });
    s.character.health = 1;
    const hf = s.resources.hearthfire;
    s = applyChoice(s, data, 'stance:attack', undefined, new ScriptedRng([0]));
    expect(s.resources.hearthfire).toBe(hf);
  });
});
