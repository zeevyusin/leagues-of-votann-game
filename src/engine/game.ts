// The game controller: turns state into a View, and a chosen option into the next state.
// The UI only calls buildView and applyChoice; everything else stays inside the engine.
import type { GameData } from './schema';
import { STAT_KEYS } from './schema';
import { SeededRng, type Rng } from './rng';
import {
  beatOf,
  consoleActionFor,
  crewOf,
  crewSafe,
  encounterOf,
  enemyOf,
  enemyShipOf,
  factionOf,
  generalModifiers,
  grudgeOf,
  hasPassive,
  hearthfireBand,
  inAct3,
  isPort,
  injuryName,
  itemOf,
  liveWaaagh,
  kinTypeOf,
  loreOf,
  maxHealth,
  messageOf,
  oathOf,
  passiveFor,
  shipPips,
  recordRoll,
  relicOf,
  resolveText,
  statLabel,
  subclassOf,
  baseClassOf,
  systemOf,
  threadOf,
  waaaghBand,
  wearBand,
  xpToNext,
  type Ctx,
} from './rules';
import { describeRoll, formatModifiers, resolveDifficulty, roll, tierChances, titleCase, TIER_LABEL, type RollEvent } from './roll';
import { applyEffects, resolveOath } from './effects';
import { availableRoutes, distressCall, isStranded, routeFuel, travel } from './travel';
import {
  arrivalBeat,
  availableQuests,
  boardShip,
  canDefer,
  leaveShip,
  chooseRoute,
  currentObjectives,
  deferBeat,
  finishEncounter,
  planRoute,
  progressChecks,
  routeLock,
  startBeat,
  tierTone,
} from './story';
import {
  canLaunch,
  canMusterHere,
  epiloguePages,
  launchFleet,
  musterScreen,
  rallyLines,
  soundMuster,
  startFreeRoam,
  ylsaWarning,
} from './act3';
import {
  RANGES,
  STANCE_STAT,
  TARGETS,
  apparentIntent,
  buffModifiers,
  combatActionLock,
  counterKeyLock,
  leverageModifiers,
  matchupModifier,
  negotiateLock,
  negotiationDifficulty,
  useCounterKey,
  personalRound,
  personalWithdraw,
  readBonus,
  shipCaps,
  shipRound,
  shipWithdraw,
  useCombatAction,
  validShieldChoices,
  validWeaponChoices,
  withdrawLock,
  type RoundOutcome,
} from './combat';
import { objectiveSystems, objectivesByFirstHop, routeTreeLines } from './navmap';
import { MARKET_SECTIONS, currentMarket, marketChoice, marketOptions, type MarketSection } from './market';
import { commitCrew, commitLock, commitments, oathLock, swearBattleOath } from './hearthline';
import { equipLock, equipRelic, equippedCount, identifyRelic, relicLabel, unequipRelic } from './relics';
import { lockedReason } from './conditions';
import type {
  GameState,
  HubTab,
  Line,
  Option,
  PersonalCombat,
  Scene,
  ShipCombat,
  Stance,
  StatKey,
  StatusItem,
  View,
} from './types';

const TABS: HubTab[] = ['comms', 'nav', 'ship', 'logbook', 'market'];
const STANCES: Stance[] = ['attack', 'defend', 'outmaneuver', 'negotiate'];

function topScene(state: GameState): Scene {
  return state.scenes[state.scenes.length - 1];
}

// ======================= applyChoice =======================

export function applyChoice(prev: GameState, data: GameData, id: string, text?: string, rngOverride?: Rng): GameState {
  return applyChoiceWithRolls(prev, data, id, text, rngOverride).state;
}

/** Same as applyChoice, but also returns the player-facing rolls made, in order, for the dice animation. */
export function applyChoiceWithRolls(
  prev: GameState,
  data: GameData,
  id: string,
  text?: string,
  rngOverride?: Rng,
): { state: GameState; rolls: RollEvent[] } {
  const state: GameState = structuredClone(prev);
  const rng = rngOverride ?? new SeededRng(state.rng);
  const ctx: Ctx = { data, rng, rolls: [] };
  const scene = topScene(state);

  switch (scene.type) {
    case 'hub':
      hubChoice(state, ctx, scene, id);
      break;
    case 'message':
      messageChoice(state, ctx, scene.key, id);
      break;
    case 'beat':
      if (id.startsWith('route:')) chooseRoute(state, ctx, scene.key, id.slice(6));
      else if (id === 'defer') deferBeat(state, ctx, scene.key);
      break;
    case 'combat':
      combatChoice(state, ctx, scene.combat, id);
      break;
    case 'notice':
      if (id === 'continue') state.scenes.pop();
      break;
    case 'name_ship': {
      if (id === 'keep') state.scenes.pop();
      else if (id === 'ship_name') {
        const name = (text ?? '').trim();
        if (name.length < 1 || name.length > data.config.SHIP_NAME_MAX_LENGTH) {
          scene.error = `The name must be 1 to ${data.config.SHIP_NAME_MAX_LENGTH} characters.`;
        } else {
          state.ship.name = name;
          state.scenes.pop();
          state.scenes.push({ type: 'notice', title: 'Ship named', lines: [{ text: `The ${name} is entered into the station registry.`, tone: 'teal' }] });
        }
      }
      break;
    }
    case 'level_up':
      if (id.startsWith('stat:')) levelUpChoice(state, ctx, id.slice(5) as StatKey);
      break;
    case 'mutiny':
      mutinyChoice(state, ctx, id);
      break;
    case 'muster':
      if (id === 'confirm') soundMuster(state, ctx);
      else if (id === 'back') state.scenes.pop();
      break;
    case 'board':
      if (id === 'board') boardShip(state, ctx);
      else if (id === 'leave') leaveShip(state, ctx);
      break;
    case 'epilogue': {
      if (id !== 'continue') break;
      if (scene.page + 1 < epiloguePages(state, ctx).length) scene.page++;
      else {
        state.scenes.pop();
        startFreeRoam(state, ctx);
      }
      break;
    }
  }

  if (!rngOverride) state.rng = rng.state;
  afterChoice(state, ctx);
  return { state, rolls: ctx.rolls ?? [] };
}

/** Checks that run whenever the player lands back on the hub. */
function afterChoice(state: GameState, ctx: Ctx): void {
  const top = topScene(state);
  if (top.type !== 'hub') return;
  // The Market tab only exists while docked at a port with a market.
  if (top.tab === 'market' && !currentMarket(state, ctx)) top.tab = 'ship';
  if (state.character.stat_points > 0) state.scenes.push({ type: 'level_up' });
  else if (state.resources.hearthfire <= 0) state.scenes.push({ type: 'mutiny' });
  else if (progressChecks(state, ctx)) return;
  else if (ylsaWarning(state, ctx)) return;
  else {
    const beat = arrivalBeat(state, ctx);
    if (beat) startBeat(state, ctx, beat);
  }
}

function canAnswer(state: GameState, ctx: Ctx, beatKey: string): boolean {
  return !inAct3(state) && state.story.active_beats.includes(beatKey) && beatOf(ctx.data, beatKey).trigger === 'comms';
}

const jobFlag = (key: string) => `JOB_${key}`;

function messageChoice(state: GameState, ctx: Ctx, key: string, id: string): void {
  const msg = messageOf(ctx.data, key);
  if (id === 'back') {
    state.scenes.pop();
  } else if (id === 'answer' && msg.beat && canAnswer(state, ctx, msg.beat)) {
    state.scenes.pop();
    startBeat(state, ctx, msg.beat);
  } else if ((id === 'accept' || id === 'decline') && msg.job && !state.story.flags[jobFlag(key)] && !inAct3(state)) {
    state.story.flags[jobFlag(key)] = id === 'accept' ? 'ACCEPTED' : 'DECLINED';
    state.scenes.pop();
    if (id === 'accept') {
      const lines: Line[] = [{ text: `Job accepted: ${msg.subject}` }, ...applyEffects(state, ctx, msg.job.on_accept)];
      state.scenes.push({ type: 'notice', title: 'Contract', lines });
    }
  }
}

function hubChoice(state: GameState, ctx: Ctx, scene: Extract<Scene, { type: 'hub' }>, id: string): void {
  const [kind, arg] = splitId(id);
  switch (kind) {
    case 'tab':
      if (TABS.includes(arg as HubTab) && (arg !== 'market' || currentMarket(state, ctx))) {
        scene.tab = arg as HubTab;
        scene.section = null;
      }
      return;
    case 'mkt': {
      if (arg.startsWith('section:')) {
        const section = arg.slice(8);
        scene.section = (MARKET_SECTIONS as readonly string[]).includes(section) ? section : null;
        return;
      }
      const lines = marketChoice(state, ctx, arg);
      if (lines) state.scenes.push({ type: 'notice', title: 'Market', lines });
      return;
    }
    case 'safe_route': {
      if (state.character.subclass !== ctx.data.config.SAFE_ROUTE_SUBCLASS || state.safe_route_charted) return;
      state.safe_route_charted = true;
      const action = consoleActionFor(ctx.data, state.character);
      const lines: Line[] = [{ text: `${action.name}: your next journey costs less Fuel and runs into trouble less often.`, tone: 'good' }];
      if (action.wearCost) lines.push(...applyEffects(state, ctx, [{ wear: action.wearCost }], { nonLethal: true }));
      state.scenes.push({ type: 'notice', title: action.name, lines });
      return;
    }
    case 'msg': {
      const m = state.inbox.find((x) => x.key === arg);
      if (!m) return;
      m.read = true;
      state.scenes.push({ type: 'message', key: arg });
      return;
    }
    case 'go': {
      const { lines, event } = travel(state, ctx, arg);
      state.scenes.push({ type: 'notice', title: `Arrived: ${systemOf(ctx.data, arg).display_name}`, lines });
      // A travel event plays first, then the arrival log.
      if (event) startBeat(state, ctx, event);
      return;
    }
    case 'distress':
      if (isStranded(state, ctx)) state.scenes.push({ type: 'notice', title: 'Distress call', lines: distressCall(state, ctx) });
      return;
    case 'muster':
      if (canMusterHere(state, ctx)) state.scenes.push({ type: 'muster' });
      return;
    case 'launch':
      launchFleet(state, ctx);
      return;
    case 'repair': {
      const plan = repairPlan(state, ctx);
      if (!plan.points) return;
      state.resources.ore -= plan.points * plan.perPoint;
      state.ship.hull += plan.points;
      state.scenes.push({ type: 'notice', title: 'Repairs', lines: [{ text: `Hull repaired by ${plan.points} for ${plan.points * plan.perPoint} Ore.`, tone: 'good' }] });
      return;
    }
    case 'maint':
      maintenance(state, ctx, arg);
      return;
    case 'evaluate': {
      const relic = state.relics[Number(arg)];
      if (!relic || relic.identified || !canEvaluate(state, ctx)) return;
      const lines = identifyRelic(state, ctx, Number(arg));
      const action = consoleActionFor(ctx.data, state.character);
      if (action.wearCost) lines.push(...applyEffects(state, ctx, [{ wear: action.wearCost }], { nonLethal: true }));
      state.scenes.push({ type: 'notice', title: action.name, lines });
      return;
    }
    case 'equip':
    case 'unequip': {
      const lines = kind === 'equip' ? equipRelic(state, ctx, Number(arg)) : unequipRelic(state, ctx, Number(arg));
      if (lines) state.scenes.push({ type: 'notice', title: 'Relics', lines });
      return;
    }
    case 'pay': {
      const oath = oathOf(ctx.data, arg);
      const entry = state.oaths.find((o) => o.key === arg && o.status === 'ACTIVE');
      const f = oath.fulfil;
      if (!entry || !f || !('ore' in f) || !state.docked || state.resources.ore < f.ore) return;
      state.resources.ore -= f.ore;
      const lines: Line[] = [{ text: `-${f.ore} Ore`, tone: 'bad' }, ...resolveOath(state, ctx, arg, 'KEPT')];
      state.scenes.push({ type: 'notice', title: 'Debt paid', lines });
      return;
    }
  }
}

function splitId(id: string): [string, string] {
  const i = id.indexOf(':');
  return i < 0 ? [id, ''] : [id.slice(0, i), id.slice(i + 1)];
}

function repairPlan(state: GameState, ctx: Ctx) {
  const cfg = ctx.data.config;
  let discount = state.crew.reduce((s, k) => s + crewOf(ctx.data, k).repair_discount, 0);
  if (hasPassive(ctx.data, state.character, 'TINKERS_EYE')) discount += cfg.TINKERS_EYE_REPAIR_DISCOUNT;
  const perPoint = Math.max(1, cfg.HULL_REPAIR_ORE_PER_POINT - discount);
  const missing = state.ship.hull_max - state.ship.hull;
  const points = state.docked ? Math.min(missing, Math.floor(state.resources.ore / perPoint)) : 0;
  return { perPoint, points, missing };
}

function maintenanceSupplyCost(state: GameState, ctx: Ctx): number {
  const cfg = ctx.data.config;
  return Math.max(1, cfg.WEAR_MAINTENANCE_SUPPLIES - (state.ship.modules.workshop - 1) * cfg.WORKSHOP_SUPPLY_DISCOUNT_PER_LEVEL);
}

function canEvaluate(state: GameState, ctx: Ctx): boolean {
  return state.character.subclass === ctx.data.config.RELIC_EVALUATOR_SUBCLASS;
}

function maintenance(state: GameState, ctx: Ctx, kind: string): void {
  const cfg = ctx.data.config;
  const c = state.character;
  if (c.wear === null || c.wear <= 0) return;
  const lines: Line[] = [];
  if (kind === 'supplies') {
    const cost = maintenanceSupplyCost(state, ctx);
    if (state.resources.supplies < cost) return;
    state.resources.supplies -= cost;
    lines.push({ text: `-${cost} Supplies`, tone: 'bad' }, ...applyEffects(state, ctx, [{ wear: -cfg.WEAR_MAINTENANCE_AMOUNT }]));
  } else if (kind === 'self') {
    if (state.self_maintenance_used || !hasPassive(ctx.data, c, 'SELF_MAINTENANCE')) return;
    state.self_maintenance_used = true;
    lines.push({ text: 'Self-Maintenance: you tune your own frame.' }, ...applyEffects(state, ctx, [{ wear: -cfg.WEAR_MAINTENANCE_AMOUNT }]));
  } else if (kind === 'craft') {
    if (state.self_maintenance_used) return;
    state.self_maintenance_used = true;
    const mods = generalModifiers(state, ctx.data, 'craft', 'story');
    const r = roll(ctx.rng, cfg, 'craft', c.stats.craft, mods, cfg.WEAR_MAINTENANCE_DIFFICULTY);
    recordRoll(ctx, r, 'Maintenance');
    lines.push({ text: describeRoll(r, statLabel(ctx.data, 'craft')), tone: tierTone(r.tier) });
    const amount = r.tier === 'critical' || r.tier === 'success' ? cfg.WEAR_MAINTENANCE_AMOUNT : r.tier === 'partial' ? Math.floor(cfg.WEAR_MAINTENANCE_AMOUNT / 2) : 0;
    if (amount) lines.push(...applyEffects(state, ctx, [{ wear: -amount }]));
    else lines.push({ text: 'The fix doesn\'t take. Try again next journey.', tone: 'muted' });
  } else return;
  state.scenes.push({ type: 'notice', title: 'Maintenance', lines });
}

function levelUpChoice(state: GameState, ctx: Ctx, stat: StatKey): void {
  const c = state.character;
  if (!STAT_KEYS.includes(stat) || c.stat_points <= 0 || c.stats[stat] >= ctx.data.config.STAT_MAX) return;
  const oldMax = maxHealth(ctx.data.config, c);
  c.stats[stat]++;
  c.stat_points--;
  c.health += maxHealth(ctx.data.config, c) - oldMax;
  if (c.stat_points <= 0) state.scenes.pop();
}

function mutinyChoice(state: GameState, ctx: Ctx, id: string): void {
  const cfg = ctx.data.config;
  const lines: Line[] = [];
  if (id === 'bribe') {
    if (state.resources.ore < cfg.MUTINY_BRIBE_ORE) return;
    state.resources.ore -= cfg.MUTINY_BRIBE_ORE;
    lines.push({ text: `You pay double shares out of your own pocket. -${cfg.MUTINY_BRIBE_ORE} Ore.`, tone: 'bad' });
  } else if (id === 'rally') {
    const mods = generalModifiers(state, ctx.data, 'silver_tongue', 'story').filter((m) => !m.label.startsWith('Hearthfire'));
    const r = roll(ctx.rng, cfg, 'silver_tongue', state.character.stats.silver_tongue, mods, cfg.MUTINY_DIFFICULTY);
    recordRoll(ctx, r, 'Rally the crew');
    lines.push({ text: describeRoll(r, statLabel(ctx.data, 'silver_tongue')), tone: tierTone(r.tier) });
    if (r.tier === 'critical' || r.tier === 'success') lines.push({ text: 'Your words land. The crew grumbles, but stays.' });
    else if (r.tier === 'partial') {
      lines.push({ text: 'They stay, but only after you promise back pay.' });
      lines.push(...applyEffects(state, ctx, [{ ore: -20 }]));
    } else {
      const atRisk = state.crew.filter((k) => !crewSafe(ctx.data, state, k));
      if (atRisk.length) lines.push(...applyEffects(state, ctx, [{ remove_crew: atRisk[atRisk.length - 1] }]));
      else lines.push({ text: 'Nobody leaves, but nobody is happy either.' });
    }
  } else return;
  state.resources.hearthfire = cfg.MUTINY_RESET_HEARTHFIRE;
  lines.push({ text: `Hearthfire steadies at ${cfg.MUTINY_RESET_HEARTHFIRE}.`, tone: 'muted' });
  state.scenes.pop();
  state.scenes.push({ type: 'notice', title: 'Mutiny', lines });
}

function combatChoice(state: GameState, ctx: Ctx, combat: PersonalCombat | ShipCombat, id: string): void {
  const [kind, arg] = splitId(id);
  const settle = (out: RoundOutcome) => {
    if (out.result) finishEncounter(state, ctx, combat, out.result, out.lines);
    else combat.last = out.lines;
  };
  if (kind === 'action') {
    if (!combatActionLock(state, ctx, combat)) settle(useCombatAction(state, ctx, combat));
    return;
  }
  // Battle oaths and crew commitments open a short sub-list and never use the round.
  if (kind === 'menu') {
    combat.menu = arg === 'oath' || arg === 'crew' ? arg : null;
    return;
  }
  if (kind === 'oath') {
    const lines = swearBattleOath(ctx, combat, arg);
    if (lines.length) combat.last = lines;
    return;
  }
  if (kind === 'commit') {
    const lines = commitCrew(state, ctx, combat, arg);
    if (lines.length) combat.last = lines;
    return;
  }
  if (kind === 'withdraw') {
    if (!withdrawLock(ctx, combat))
      settle(combat.mode === 'personal' ? personalWithdraw(state, ctx, combat) : shipWithdraw(state, ctx, combat));
    return;
  }
  if (combat.mode === 'personal') {
    if (kind !== 'stance' || !STANCES.includes(arg as Stance)) return;
    if (arg === 'negotiate' && negotiateLock(ctx, combat)) return;
    settle(personalRound(state, ctx, combat, arg as Stance));
    return;
  }
  // Range and target are standing orders: changing them does not use the round.
  if (kind === 'range') {
    combat.range_pref = RANGES[(RANGES.indexOf(combat.range_pref) + 1) % RANGES.length];
    return;
  }
  if (kind === 'target') {
    combat.target = TARGETS[(TARGETS.indexOf(combat.target) + 1) % TARGETS.length];
    return;
  }
  if (kind === 'counterkey') {
    if (!counterKeyLock(state, ctx, combat)) settle(useCounterKey(state, ctx, combat));
    return;
  }
  if (kind === 'weapons' && combat.pending_weapons === null) {
    const w = Number(arg);
    if (validWeaponChoices(state, ctx).includes(w)) combat.pending_weapons = w;
  } else if (kind === 'back') {
    combat.pending_weapons = null;
  } else if (kind === 'shields' && combat.pending_weapons !== null) {
    const s = Number(arg);
    if (!validShieldChoices(state, ctx, combat.pending_weapons).includes(s)) return;
    const pips = shipPips(state, ctx.data);
    const alloc = { weapons: combat.pending_weapons, shields: s, engines: pips - combat.pending_weapons - s };
    settle(shipRound(state, ctx, combat, alloc));
  }
}

// ======================= buildView =======================

export function buildView(state: GameState, data: GameData): View {
  const ctx: Ctx = { data, rng: new SeededRng(state.rng) };
  const scene = topScene(state);
  const status = statusBar(state, ctx);
  switch (scene.type) {
    case 'hub':
      return {
        ...hubView(state, ctx, scene.tab, scene.section ?? null),
        status,
        tabs: { active: scene.tab, unread: state.inbox.filter((m) => !m.read).length, market: !!currentMarket(state, ctx) },
      };
    case 'message':
      return { ...messageView(state, ctx, scene.key), status };
    case 'beat':
      return { ...beatView(state, ctx, scene.key), status };
    case 'combat':
      return { ...(scene.combat.mode === 'personal' ? personalView(state, ctx, scene.combat) : shipView(state, ctx, scene.combat)), status };
    case 'notice':
      return { kind: 'notice', title: scene.title, status, body: scene.lines, options: [{ id: 'continue', label: 'Continue', tone: 'accent' }] };
    case 'name_ship':
      return {
        kind: 'name_ship',
        title: 'Name your ship',
        status,
        error: scene.error,
        body: [
          { text: 'The station registry clerk needs your ship\'s name for the record. The fleet\'s papers burned on the Anvil, so if you want a new name, now is the time.' },
          { text: `Current name: ${state.ship.name}`, tone: 'muted' },
        ],
        input: { id: 'ship_name', prompt: 'Ship name', maxLength: data.config.SHIP_NAME_MAX_LENGTH, value: state.ship.name },
        options: [{ id: 'keep', label: `Keep "${state.ship.name}"`, tone: 'muted' }],
      };
    case 'level_up':
      return levelUpView(state, ctx, status);
    case 'mutiny':
      return mutinyView(state, ctx, status);
    case 'muster':
      return { kind: 'muster', title: 'Sound the muster', subtitle: 'Act 3: The Waaagh!', status, ...musterScreen(state, ctx) };
    case 'board': {
      const enemy = enemyShipOf(data, scene.combat.enemy.key);
      const boarding = encounterOf(data, encounterOf(data, scene.combat.encounter).boarding!);
      return {
        kind: 'board',
        title: `${enemy.display_name} is disabled`,
        subtitle: 'Ship combat',
        status,
        body: [...scene.lines, { text: '' }, { text: 'She is drifting, dark and open. You could put a boarding party aboard.', tone: 'accent' }],
        options: [
          { id: 'board', label: 'Board her', detail: `Personal combat: ${boarding.enemies.map((e) => enemyOf(data, e).display_name).join(', then ')}`, tone: 'accent' },
          { id: 'leave', label: 'Leave her', tone: 'muted' },
        ],
      };
    }
    case 'epilogue': {
      const pages = epiloguePages(state, ctx);
      const page = pages[Math.min(scene.page, pages.length - 1)];
      const last = scene.page >= pages.length - 1;
      return {
        kind: 'epilogue',
        title: page.title,
        subtitle: `Epilogue, ${scene.page + 1} of ${pages.length}`,
        body: page.lines,
        options: [{ id: 'continue', label: last ? 'Begin free roam' : 'Continue', tone: 'accent' }],
      };
    }
  }
}

function statusBar(state: GameState, ctx: Ctx): StatusItem[] {
  const cfg = ctx.data.config;
  const c = state.character;
  const r = state.resources;
  const band = hearthfireBand(cfg, r.hearthfire);
  const items: StatusItem[] = [
    { label: 'Day', value: String(state.day) },
    { label: 'Fuel', value: String(r.fuel), tone: r.fuel <= 2 ? 'bad' : undefined },
    { label: 'Ore', value: String(r.ore) },
    { label: 'Supplies', value: String(r.supplies), tone: r.supplies <= 3 ? 'bad' : undefined },
    { label: 'Hearthfire', value: `${r.hearthfire} ${titleCase(band.band)}`, tone: band.modifier > 0 ? 'good' : band.modifier < 0 ? 'bad' : undefined },
    { label: 'Health', value: `${c.health}/${maxHealth(cfg, c)}`, tone: c.health <= maxHealth(cfg, c) / 3 ? 'bad' : undefined },
    { label: 'Hull', value: `${state.ship.hull}/${state.ship.hull_max}`, tone: state.ship.hull <= state.ship.hull_max / 3 ? 'bad' : undefined },
  ];
  if (c.wear !== null) {
    const w = wearBand(cfg, c.wear);
    items.push({ label: 'Wear', value: `${c.wear} ${titleCase(w.state)}`, tone: w.penalty < 0 ? 'bad' : undefined });
  }
  const meter = liveWaaagh(state);
  if (meter !== null) items.push({ label: 'Waaagh!', value: `${meter}/${cfg.WAAAGH_LAUNCH}`, tone: 'accent' });
  if (c.fatigued) items.push({ label: 'Fatigued', value: String(cfg.FATIGUE_PENALTY), tone: 'bad' });
  if (c.injuries.length) items.push({ label: 'Injuries', value: String(c.injuries.length), tone: 'bad' });
  return items;
}

function hubView(state: GameState, ctx: Ctx, tab: HubTab, section: string | null = null): View {
  const objectives = currentObjectives(state, ctx);
  const head: Line[] = [];
  if (objectives.length === 1) head.push({ text: `Objective: ${objectives[0]}`, tone: 'accent' });
  else if (objectives.length) {
    head.push({ text: 'Objectives:', tone: 'accent' });
    for (const o of objectives) head.push({ text: `  - ${o}`, tone: 'accent' });
  }
  if (head.length) head.push({ text: '' });
  const loc = systemOf(ctx.data, state.location);
  const subtitle = `${loc.display_name}${state.docked ? ' (docked)' : ' (in orbit)'}`;
  switch (tab) {
    case 'comms':
      return commsView(state, ctx, head, subtitle);
    case 'nav':
      return navView(state, ctx, head, subtitle);
    case 'ship':
      return shipScreenView(state, ctx, head, subtitle);
    case 'logbook':
      return logbookView(state, ctx, head, subtitle);
    case 'market': {
      const { body, options } = marketOptions(state, ctx, (section as MarketSection | null) ?? null);
      return { kind: 'market', title: 'Market', subtitle, body: [...head, ...body], options: options.map((o) => ({ ...o, id: `mkt:${o.id}` })) };
    }
  }
}

function commsView(state: GameState, ctx: Ctx, head: Line[], subtitle: string): View {
  const body: Line[] = [...head];
  if (!state.inbox.length) body.push({ text: 'No messages.', tone: 'muted' });
  const options: Option[] = state.inbox.map((m) => {
    const msg = messageOf(ctx.data, m.key);
    const answerable = msg.beat && canAnswer(state, ctx, msg.beat);
    const job = msg.job ? state.story.flags[jobFlag(m.key)] : undefined;
    const jobNote = msg.job ? (job === 'ACCEPTED' ? '. Contract accepted.' : job === 'DECLINED' ? '. Declined.' : '. Job offer.') : '';
    return {
      id: `msg:${m.key}`,
      label: `${m.read ? '' : '[NEW] '}${msg.subject}`,
      detail: `From ${msg.from}, day ${m.day}${answerable ? '. Awaiting your answer.' : ''}${jobNote}`,
      tone: m.read ? 'muted' : 'accent',
    };
  });
  return { kind: 'comms', title: 'Comms', subtitle, body, options };
}

function navView(state: GameState, ctx: Ctx, head: Line[], subtitle: string): View {
  const loc = systemOf(ctx.data, state.location);
  const body: Line[] = [...head, { text: loc.display_name.toUpperCase(), tone: 'heading' }, { text: loc.description }, { text: '' }];
  // The route tree shows which systems lie on the way to each destination.
  if (availableRoutes(state, ctx).length) body.push(...routeTreeLines(state, ctx));
  else {
    body.push({ text: 'Known systems:', tone: 'muted' });
    for (const key of state.discovered_systems) {
      const s = systemOf(ctx.data, key);
      body.push({ text: `  ${s.display_name}${key === state.location ? ' (you are here)' : ''}`, tone: key === state.location ? 'teal' : 'normal' });
    }
  }
  const waiting = objectiveSystems(state, ctx);
  const toward = objectivesByFirstHop(state, ctx);
  const options: Option[] = availableRoutes(state, ctx).map((r) => {
    const s = systemOf(ctx.data, r.to);
    const faction = s.faction === 'NONE' ? 'unclaimed' : factionOf(ctx.data, s.faction).display_name;
    const fuel = routeFuel(state, ctx, r.fuel);
    const via = toward.get(r.to) ?? [];
    const onTheWay = via.length ? ` On the way to ${via.map((k) => systemOf(ctx.data, k).display_name).join(' and ')}.` : '';
    return {
      id: `go:${r.to}`,
      label: `Set course: ${s.display_name}${waiting.has(r.to) ? '  [objective]' : via.length ? '  [toward objective]' : ''}`,
      detail: `${r.days} day${r.days > 1 ? 's' : ''}, ${fuel} Fuel. Danger ${titleCase(s.danger)}. ${faction}${isPort(ctx.data, state, r.to) ? ', port' : ''}.${onTheWay}`,
      locked: fuel > state.resources.fuel ? `Needs ${fuel} Fuel` : undefined,
      tone: waiting.has(r.to) || via.length ? 'accent' : undefined,
    };
  });
  if (canMusterHere(state, ctx))
    options.push({ id: 'muster', label: 'Sound the muster', detail: 'Start Act 3. There is no coming back.', tone: 'accent' });
  if (canLaunch(state)) {
    body.push({ text: '' }, { text: 'The fleet is gathered. No more travel: when you are ready, lead them out.', tone: 'accent' });
    options.push({ id: 'launch', label: 'Lead the fleet out', detail: 'The battle begins. The market closes.', tone: 'accent' });
  }
  if (state.character.subclass === ctx.data.config.SAFE_ROUTE_SUBCLASS && !inAct3(state)) {
    const action = consoleActionFor(ctx.data, state.character);
    options.push({
      id: 'safe_route',
      label: `${action.name} (console action)`,
      detail: `Next journey: -${ctx.data.config.SAFE_ROUTE_FUEL_SAVING} Fuel and fewer travel events${action.wearCost ? `. +${action.wearCost} Wear` : ''}`,
      locked: state.safe_route_charted ? 'Already charted' : undefined,
      tone: 'accent',
    });
  }
  if (isStranded(state, ctx)) options.push({ id: 'distress', label: 'Send a distress call', detail: 'Someone will answer. They will want paying.', tone: 'accent' });
  return { kind: 'nav', title: 'Nav', subtitle, body, options };
}

function shipScreenView(state: GameState, ctx: Ctx, head: Line[], subtitle: string): View {
  const cfg = ctx.data.config;
  const s = state.ship;
  const c = state.character;
  const body: Line[] = [...head, { text: s.name.toUpperCase(), tone: 'heading' }];
  body.push({ text: `Hull ${s.hull}/${s.hull_max}. Reactor ${shipPips(state, ctx.data)} power pips.` });
  body.push({ text: 'Modules:', tone: 'muted' });
  const caps = shipCaps(state, ctx);
  for (const [m, lvl] of Object.entries(s.modules)) {
    const cap = m === 'weapons' ? caps.weapons : m === 'shields' ? caps.shields : m === 'engine' ? caps.engines : null;
    body.push({ text: `  ${titleCase(m).padEnd(11)} level ${lvl}${cap !== null ? `  (max ${cap} pips)` : ''}` });
  }
  const used = state.cargo.reduce((n, x) => n + x.qty, 0);
  body.push({ text: '' }, { text: `Cargo ${used}/${s.cargo_capacity}:`, tone: 'muted' });
  if (!state.cargo.length) body.push({ text: '  (empty)', tone: 'muted' });
  for (const item of state.cargo) body.push({ text: `  ${item.qty} x ${itemOf(ctx.data, item.key).display_name}` });
  if (state.relics.length) {
    body.push({ text: '' }, { text: `Relics (${equippedCount(state)}/${cfg.RELIC_SLOTS} equipped):`, tone: 'muted' });
    for (const r of state.relics) {
      const info = relicOf(ctx.data, r.key);
      const tag = r.equipped ? ' [EQUIPPED]' : '';
      body.push({ text: `  ${relicLabel(ctx, r)}${tag}`, tone: r.equipped ? 'teal' : 'accent' });
      body.push({ text: r.identified ? `    ${info.benefit} Drawback: ${info.drawback}` : '    Unknown benefit, unknown drawback. Identify it at Karrak Station or Hold Durnvar.', tone: 'muted' });
    }
  }
  if (c.injuries.length) {
    body.push({ text: '' }, { text: 'Injuries (treat them at a port market):', tone: 'muted' });
    for (const key of c.injuries) {
      const i = ctx.data.injuries.find((x) => x.key === key)!;
      body.push({ text: `  ${injuryName(ctx.data, c, key)}: ${i.value} ${statLabel(ctx.data, i.stat)}`, tone: 'bad' });
    }
  }
  body.push({ text: '' }, { text: 'Crew:', tone: 'muted' });
  for (const k of state.crew) {
    const m = crewOf(ctx.data, k);
    body.push({ text: `  ${m.display_name}, ${m.role} (${kinTypeOf(ctx.data, m.kin_type).display_name}). ${m.trait.name}: ${m.trait.description}` });
  }

  const options: Option[] = [];
  const repair = repairPlan(state, ctx);
  if (repair.missing > 0)
    options.push({
      id: 'repair',
      label: `Repair hull (+${repair.points || repair.missing})`,
      detail: `${repair.perPoint} Ore per point`,
      locked: !state.docked ? 'Dock at a port first' : repair.points === 0 ? 'Not enough Ore' : undefined,
    });
  if (c.wear !== null && c.wear > 0) {
    const cost = maintenanceSupplyCost(state, ctx);
    options.push({
      id: 'maint:supplies',
      label: `Maintenance: spend ${cost} Supplies (-${cfg.WEAR_MAINTENANCE_AMOUNT} Wear)`,
      locked: state.resources.supplies < cost ? `Needs ${cost} Supplies` : undefined,
    });
    if (hasPassive(ctx.data, c, 'SELF_MAINTENANCE'))
      options.push({ id: 'maint:self', label: `Self-Maintenance (free, -${cfg.WEAR_MAINTENANCE_AMOUNT} Wear)`, locked: state.self_maintenance_used ? 'Once per journey' : undefined });
    options.push({
      id: 'maint:craft',
      label: `Maintenance: Craft check (${titleCase(String(cfg.WEAR_MAINTENANCE_DIFFICULTY))})`,
      detail: 'Free, but only once per journey',
      locked: state.self_maintenance_used ? 'Once per journey' : undefined,
    });
  }
  state.relics.forEach((r, i) => {
    if (r.equipped) options.push({ id: `unequip:${i}`, label: `Unequip: ${relicLabel(ctx, r)}`, tone: 'muted' });
    else options.push({ id: `equip:${i}`, label: `Equip: ${relicLabel(ctx, r)}`, locked: equipLock(state, ctx, i), tone: 'accent' });
  });
  if (canEvaluate(state, ctx))
    state.relics.forEach((r, i) => {
      if (!r.identified) options.push({ id: `evaluate:${i}`, label: `${consoleActionFor(ctx.data, c).name}: ${relicOf(ctx.data, r.key).unidentified_name}`, tone: 'accent' });
    });
  return { kind: 'ship', title: 'Ship and Cargo', subtitle, body, options };
}

function logbookView(state: GameState, ctx: Ctx, head: Line[], subtitle: string): View {
  const cfg = ctx.data.config;
  const c = state.character;
  const sub = subclassOf(ctx.data, c.subclass);
  const passive = passiveFor(ctx.data, c);
  const action = consoleActionFor(ctx.data, c);
  const body: Line[] = [...head, { text: 'CAPTAIN', tone: 'heading' }];
  body.push({ text: `${c.name}, ${kinTypeOf(ctx.data, c.kin_type).display_name} ${baseClassOf(ctx.data, c.base_class).display_name} / ${sub.display_name}` });
  body.push({ text: c.level >= cfg.LEVEL_CAP ? `Level ${c.level} (max)` : `Level ${c.level}, XP ${c.xp}/${xpToNext(cfg, c.level)}` });
  body.push({ text: STAT_KEYS.map((k) => `${statLabel(ctx.data, k)} ${c.stats[k]}`).join('   ') });
  body.push({ text: `Passive: ${passive.name}. ${passive.description}`, tone: 'muted' });
  body.push({ text: `Console action: ${action.name}. ${action.description}`, tone: 'muted' });
  body.push({ text: `Trait: ${sub.trait.name}. ${sub.trait.description}`, tone: 'muted' });
  if (c.wear !== null) body.push({ text: `Wear ${c.wear}: ${titleCase(wearBand(cfg, c.wear).state)}`, tone: 'muted' });

  body.push({ text: '' }, { text: 'OATHS', tone: 'heading' });
  if (!state.oaths.length) body.push({ text: 'None sworn.', tone: 'muted' });
  for (const o of state.oaths) {
    const info = oathOf(ctx.data, o.key);
    const deadline = o.deadline_day !== null && o.status === 'ACTIVE' ? `, due day ${o.deadline_day}` : '';
    body.push({ text: `${info.title} [${titleCase(o.status)}${deadline}]`, tone: o.status === 'ACTIVE' ? 'accent' : o.status === 'KEPT' ? 'good' : 'bad' });
    body.push({ text: `  ${info.giver}: ${info.terms}`, tone: 'muted' });
    if (o.status === 'ACTIVE') body.push({ text: `  ${info.can_fail ? 'If broken: ' : ''}${info.penalty_text}`, tone: 'muted' });
  }

  body.push({ text: '' }, { text: 'GRUDGES', tone: 'heading' });
  if (!state.grudges.length) body.push({ text: 'None recorded.', tone: 'muted' });
  for (const g of state.grudges) {
    const info = grudgeOf(ctx.data, g.key);
    body.push({ text: `${info.title}: ${info.against} [${titleCase(g.status)}]`, tone: g.status === 'ACTIVE' ? 'bad' : 'good' });
    body.push({ text: `  ${info.description}`, tone: 'muted' });
  }

  const meter = liveWaaagh(state);
  if (meter !== null) {
    body.push({ text: '' }, { text: 'THE WAAAGH!', tone: 'heading' });
    const band = waaaghBand(cfg, meter);
    body.push({ text: `${meter}/${cfg.WAAAGH_LAUNCH}: ${titleCase(band.band)}. It grows with every journey.`, tone: 'accent' });
  }
  const end = state.story.ending;
  if (end && state.story.post_game) {
    body.push({ text: '' }, { text: 'THE SAGA', tone: 'heading' });
    body.push({ text: `Skragnak: ${titleCase(end.warboss)}, ${titleCase(end.skragnak_fate)}. Hold Durnvar: ${titleCase(end.hold)}. The Core: ${titleCase(end.core)}.`, tone: 'accent' });
  }

  if (state.story.flags.ACT2_STARTED) {
    body.push({ text: '' }, { text: 'THREADS', tone: 'heading' });
    body.push({ text: `Finish ${cfg.THREADS_REQUIRED} to unlock Act 3. Done: ${state.story.threads_completed.length}.`, tone: 'muted' });
    for (const t of ctx.data.story_threads) {
      const done = t.beats.filter((b) => state.story.completed_beats.some((x) => x.key === b)).length;
      const finished = state.story.threads_completed.includes(t.key);
      body.push({ text: `${t.title}: ${done}/${t.beats.length}${finished ? ' (complete)' : ''}`, tone: finished ? 'good' : 'normal' });
      if (finished) body.push({ text: `  ${t.reward_text}`, tone: 'muted' });
    }
  }

  const quests = availableQuests(state, ctx);
  if (state.story.post_game && quests.length) {
    body.push({ text: '' }, { text: 'AFTER THE WAAAGH!', tone: 'heading' });
    for (const q of quests) {
      const done = q.beats.filter((b) => state.story.completed_beats.some((x) => x.key === b)).length;
      const finished = state.story.post_quests_completed.includes(q.key);
      body.push({ text: `${q.title}: ${done}/${q.beats.length}${finished ? ' (complete)' : ''}`, tone: finished ? 'good' : 'normal' });
    }
  }

  body.push({ text: '' }, { text: 'REPUTATION', tone: 'heading' });
  for (const f of ctx.data.factions.filter((x) => x.tracked)) body.push({ text: `${f.display_name.padEnd(24)} ${state.reputation[f.key] ?? 0}` });

  body.push({ text: '' }, { text: 'DISCOVERIES', tone: 'heading' });
  body.push({ text: `Systems visited: ${state.visited_systems.map((k) => systemOf(ctx.data, k).display_name).join(', ')}` });
  for (const k of state.lore) {
    const l = loreOf(ctx.data, k);
    body.push({ text: `${l.title}: ${l.text}`, tone: 'muted' });
  }

  const options: Option[] = [];
  for (const o of state.oaths) {
    const info = oathOf(ctx.data, o.key);
    const f = info.fulfil;
    if (o.status !== 'ACTIVE' || !f || !('ore' in f)) continue;
    options.push({
      id: `pay:${o.key}`,
      label: `Pay: ${info.title} (${f.ore} Ore)`,
      locked: !state.docked ? 'Dock at a port first' : state.resources.ore < f.ore ? `Needs ${f.ore} Ore` : undefined,
    });
  }
  return { kind: 'logbook', title: 'Logbook', subtitle, body, options };
}

function messageView(state: GameState, ctx: Ctx, key: string): View {
  const msg = messageOf(ctx.data, key);
  const options: Option[] = [];
  const body: Line[] = [{ text: resolveText(msg.body, state) }];
  if (msg.beat && canAnswer(state, ctx, msg.beat)) options.push({ id: 'answer', label: `Answer: ${beatOf(ctx.data, msg.beat).title}`, tone: 'accent' });
  if (msg.job) {
    body.push({ text: '' }, { text: `Pay: ${msg.job.reward_text}`, tone: 'teal' });
    const decided = state.story.flags[jobFlag(key)];
    if (decided) body.push({ text: decided === 'ACCEPTED' ? 'You accepted this contract.' : 'You turned this job down.', tone: 'muted' });
    else {
      options.push({
        id: 'accept',
        label: 'Accept the contract',
        tone: 'accent',
        locked: inAct3(state) ? 'No time: the Waaagh! is here' : lockedReason(state, ctx.data, msg.job.requirements),
      });
      options.push({ id: 'decline', label: 'Turn it down' });
    }
  }
  options.push({ id: 'back', label: 'Back to Comms', tone: 'muted' });
  return { kind: 'message', title: msg.subject, subtitle: `From ${msg.from}`, body, options };
}

function beatView(state: GameState, ctx: Ctx, key: string): View {
  const beat = beatOf(ctx.data, key);
  const c = state.character;
  const body: Line[] = [{ text: resolveText(beat.intro_text, state) }];
  if (key === ctx.data.config.ACT3_FIRST_BEAT) {
    const allies = rallyLines(state, ctx);
    if (allies.length) body.push({ text: '' }, ...allies);
  }
  const note = beat.kin_notes?.[c.kin_type];
  if (note) body.push({ text: '' }, { text: note, tone: 'teal' });
  body.push({ text: '' }, { text: `Goal: ${beat.goal}`, tone: 'accent' });

  const showOdds = c.subclass === ctx.data.config.ODDS_SUBCLASS;
  const options: Option[] = beat.routes.map((route) => {
    const lock = routeLock(state, ctx, route);
    let label = route.label;
    let detail = '';
    if (route.encounter) {
      const enc = encounterOf(ctx.data, route.encounter);
      const names = enc.enemies.map((e) => (enc.mode === 'personal' ? enemyOf(ctx.data, e) : enemyShipOf(ctx.data, e)).display_name);
      detail = `${enc.mode === 'ship' ? 'Ship combat' : 'Combat'} vs ${names.join(', then ')}`;
    } else if (route.auto_tier) {
      detail = `No roll. ${TIER_LABEL[route.auto_tier]}.`;
    } else {
      const plan = planRoute(state, ctx, route);
      if (route.console_action) label = `${consoleActionFor(ctx.data, c).name} (console action)`;
      const dc = resolveDifficulty(ctx.data.config, plan.difficulty!);
      const mods = formatModifiers(plan.modifiers);
      detail = `${statLabel(ctx.data, plan.stat!)} ${plan.statValue}${mods ? `, ${mods}` : ''} vs ${titleCase(String(plan.difficulty))} ${dc}`;
      if (plan.wearCost && c.wear !== null) detail += `. +${plan.wearCost} Wear`;
      if (showOdds) detail += `. ${oddsText(ctx, plan.statValue + plan.modifiers.reduce((s, m) => s + m.value, 0), dc, c.kin_type === 'IRONKIN')}`;
    }
    return { id: `route:${route.key}`, label, detail, locked: lock };
  });
  if (canDefer(ctx, key)) options.push({ id: 'defer', label: 'Not now', detail: 'Come back on a later visit.', tone: 'muted' });
  const subtitle =
    beat.trigger === 'event'
      ? 'Travel event'
      : beat.thread
        ? `Act ${beat.act}: ${threadOf(ctx.data, beat.thread).title}`
        : beat.quest
          ? `After the Waaagh!: ${ctx.data.post_quests.find((q) => q.key === beat.quest)!.title}`
          : beat.act === 3
            ? 'Act 3: The Waaagh!'
            : `Act ${beat.act}`;
  return { kind: 'beat', title: beat.title, subtitle, body, options };
}

/** Calculate the Odds: Kin get a hint, Ironkin get exact percentages. */
function oddsText(ctx: Ctx, bonus: number, dc: number, exact: boolean): string {
  const p = tierChances(ctx.data.config, bonus, dc);
  if (exact)
    return `Odds: crit ${pct(p.critical)}, success ${pct(p.success)}, partial ${pct(p.partial)}, fail ${pct(p.failure)}`;
  const good = p.critical + p.success;
  const hint = good >= 0.75 ? 'very likely' : good >= 0.5 ? 'likely' : good >= 0.3 ? 'a gamble' : 'unlikely';
  return `Odds: clean success is ${hint}`;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function personalView(state: GameState, ctx: Ctx, combat: PersonalCombat): View {
  const cfg = ctx.data.config;
  const c = state.character;
  const enemy = enemyOf(ctx.data, combat.enemy.key);
  const body: Line[] = [...combat.last, { text: '' }];
  body.push({
    text: `ROUND ${combat.round}    Your Health ${c.health}/${maxHealth(cfg, c)}${c.wear !== null ? `    Wear ${c.wear}` : ''}    ${enemy.display_name} Resolve ${combat.enemy.resolve}/${combat.enemy.resolve_max}`,
    tone: 'heading',
  });
  // A misleading read looks exactly like a clear one (combat-system.md 3.2).
  const seen = apparentIntent(combat);
  if (combat.read !== 'vague') body.push({ text: `${combat.telegraph}   [Read: Clear, ${titleCase(seen)}]`, tone: 'teal' });
  else body.push({ text: `Hard to read. ${enemy.display_name} looks either ${combat.vague_pair[0]} or ${combat.vague_pair[1]}.   [Read: Vague]`, tone: 'muted' });
  if (encounterOf(ctx.data, combat.encounter).duel) body.push({ text: 'A witnessed duel. They know how you fight, and they adapt.', tone: 'muted' });

  const active = generalModifiers(state, ctx.data, null, 'personal').map((m) => `${m.label} ${m.value > 0 ? '+' : ''}${m.value}`);
  const passive = passiveFor(ctx.data, c);
  if (['HOLD_THE_LINE', 'PLATED_BULWARK'].includes(passive.key)) active.push(passive.name);
  if (readBonus(state, ctx)) active.push(`${passive.name} (+${readBonus(state, ctx)} read)`);
  if (combat.advantage) active.push(`Advantage +${cfg.COMBAT_ADVANTAGE_BONUS}`);
  if (combat.enemy_bonus) active.push(`Enemy repositioned (+${combat.enemy_bonus} to their defense)`);
  const buffs = buffModifiers(state, ctx, combat, true);
  for (const m of buffs) active.push(`${m.label} ${m.value > 0 ? '+' : ''}${m.value}`);
  if (active.length) body.push({ text: `Active modifiers: ${active.join(', ')}`, tone: 'muted' });

  // Calculate the Odds, once used, shows the chances on every stance.
  const showOdds = combat.buffs.reveal && c.subclass === cfg.ODDS_SUBCLASS;
  const options: Option[] = STANCES.map((stance) => {
    const stat = STANCE_STAT[stance];
    let detail = `${statLabel(ctx.data, stat)} ${c.stats[stat]}`;
    const base = c.stats[stat] + sumMods(generalModifiers(state, ctx.data, stat, 'personal')) + sumMods(buffs) + (combat.advantage ? cfg.COMBAT_ADVANTAGE_BONUS : 0);
    const talkLock = stance === 'negotiate' ? negotiateLock(ctx, combat) : undefined;
    if (stance === 'negotiate') {
      if (!talkLock) {
        const dc = negotiationDifficulty(state, ctx, combat);
        const leverage = leverageModifiers(state, ctx, combat);
        const lev = sumMods(leverage);
        detail += `${lev ? ` +${lev} leverage` : ''} vs ${dc}. No damage taken.`;
        if (enemy.hardened && !leverage.length) detail += ' Hardened: no leverage, so it is harder.';
        if (showOdds) detail += ` ${oddsText(ctx, base + combat.buffs.negotiate_bonus + lev, dc, true)}`;
      }
    } else {
      const m = matchupModifier(ctx, stance, seen)!;
      detail += ` vs ${enemy.defense_difficulty + combat.enemy_bonus}. ${combat.read !== 'vague' ? `${m.label}${m.value ? ` ${m.value > 0 ? '+' : ''}${m.value}` : ''}` : 'Matchup unclear'}`;
      if (showOdds) detail += `. ${oddsText(ctx, base + m.value, enemy.defense_difficulty + combat.enemy_bonus, true)}`;
    }
    return { id: `stance:${stance}`, label: titleCase(stance), detail, locked: talkLock };
  });
  options.push(...combatExtraOptions(state, ctx, combat));
  const subtitle = encounterOf(ctx.data, combat.encounter).mode === 'personal' ? 'Personal combat' : 'Ship combat';
  return { kind: 'combat', title: `Combat: ${enemy.display_name}`, subtitle, body, options: combatMenuView(state, ctx, combat) ?? options };
}

function shipView(state: GameState, ctx: Ctx, combat: ShipCombat): View {
  const cfg = ctx.data.config;
  const enemy = enemyShipOf(ctx.data, combat.enemy.key);
  const pips = shipPips(state, ctx.data);
  const caps = shipCaps(state, ctx);
  const body: Line[] = [...combat.last, { text: '' }];
  body.push({ text: `ROUND ${combat.round}    ${state.ship.name} Hull ${state.ship.hull}/${state.ship.hull_max}    ${enemy.display_name} Hull ${combat.enemy.hull}/${combat.enemy.hull_max}`, tone: 'heading' });
  body.push({ text: combat.hint, tone: 'teal' });
  body.push({ text: `Reactor: ${pips} pips to spend. Caps: Weapons ${caps.weapons}, Shields ${caps.shields}, Engines ${caps.engines}.`, tone: 'muted' });
  body.push({ text: 'Weapons set the damage you deal. Shields absorb damage. Engines add to your roll.', tone: 'muted' });
  body.push({ text: 'Their shields soak your damage; their engines make them harder to hit.', tone: 'muted' });
  body.push({
    text: `Range: ${titleCase(combat.range)}. You want ${combat.range_pref}; more engine pips than them gets you there. Close: +${cfg.RANGE_CLOSE_DAMAGE} damage both ways. Long: -${cfg.RANGE_LONG_DAMAGE} both ways, easier to Withdraw.`,
    tone: 'muted',
  });
  if (combat.target !== 'hull') body.push({ text: `Target: their ${combat.target} (+${cfg.TARGET_DIFFICULTY} difficulty; a hit knocks out pips there next round).`, tone: 'muted' });
  const enc = encounterOf(ctx.data, combat.encounter);
  if (enc.superweapon && !state.story.flags.SUPERWEAPON_DOWN)
    body.push({ text: `Gitzbolt's super-weapon is charged: ${cfg.SUPERWEAPON_DAMAGE} Hull damage to you every round, through shields.`, tone: 'bad' });
  const mods = formatModifiers([...generalModifiers(state, ctx.data, 'nerve', 'ship'), ...buffModifiers(state, ctx, combat, true)]);
  if (mods) body.push({ text: `Active modifiers: ${mods}`, tone: 'muted' });

  let options: Option[];
  if (combat.pending_weapons === null) {
    body.push({ text: '', tone: 'normal' }, { text: 'Step 1 of 2: set Weapons power.', tone: 'accent' });
    options = validWeaponChoices(state, ctx).map((w) => ({ id: `weapons:${w}`, label: `Weapons ${w}`, detail: `${w} damage on a hit` }));
    if (enc.superweapon)
      options.push({
        id: 'counterkey',
        label: 'Use the counter-key',
        detail: 'Shuts down the super-weapon for the rest of the battle. Uses this round, no roll.',
        locked: counterKeyLock(state, ctx, combat),
        tone: 'accent',
      });
    options.push(...combatExtraOptions(state, ctx, combat));
  } else {
    const w = combat.pending_weapons;
    const extraDc = combat.target !== 'hull' ? cfg.TARGET_DIFFICULTY : 0;
    body.push({ text: '' }, { text: `Weapons ${w}. Step 2 of 2: set Shields power. Engines get the rest.`, tone: 'accent' });
    options = validShieldChoices(state, ctx, w).map((s) => ({
      id: `shields:${s}`,
      label: `Shields ${s}, Engines ${pips - w - s}`,
      detail: `Nerve ${state.character.stats.nerve} + ${pips - w - s} engines vs ${enemy.defense_difficulty + extraDc} + their engines`,
    }));
    options.push({ id: 'range', label: `Preferred range: ${titleCase(combat.range_pref)}`, detail: 'Press to change. Does not use the round.', tone: 'muted' });
    options.push({ id: 'target', label: `Target: ${titleCase(combat.target)}`, detail: 'Press to change. Does not use the round.', tone: 'muted' });
    options.push({ id: 'back', label: 'Change weapons', tone: 'muted' });
  }
  return { kind: 'combat', title: `Ship combat: ${enemy.display_name}`, subtitle: 'Ship combat', body, options: combatMenuView(state, ctx, combat) ?? options };
}

function sumMods(mods: { value: number }[]): number {
  return mods.reduce((s, m) => s + m.value, 0);
}

/** The battle oath or crew sub-list, when one is open. Null when the normal options show. */
function combatMenuView(state: GameState, ctx: Ctx, combat: PersonalCombat | ShipCombat): Option[] | null {
  if (combat.menu === 'oath')
    return [
      ...ctx.data.battle_oaths.map((o) => ({ id: `oath:${o.key}`, label: o.name, detail: o.description, tone: 'accent' as const })),
      { id: 'menu:', label: 'Back', tone: 'muted' as const },
    ];
  if (combat.menu === 'crew')
    return [
      ...commitments(state, ctx, combat).map(({ key, member }) => ({
        id: `commit:${key}`,
        label: `${member.display_name}: ${member.commitment!.name}`,
        detail: `${member.commitment!.description} Once per fight; this round only.`,
        locked: commitLock(state, ctx, combat, key),
        tone: 'accent' as const,
      })),
      { id: 'menu:', label: 'Back', tone: 'muted' as const },
    ];
  return null;
}

/** Battle oath, crew, console action and Withdraw, offered alongside the stances or the weapons step. */
function combatExtraOptions(state: GameState, ctx: Ctx, combat: PersonalCombat | ShipCombat): Option[] {
  const action = consoleActionFor(ctx.data, state.character);
  const effect = subclassOf(ctx.data, state.character.subclass).console_action.combat;
  const wear = state.character.wear !== null && action.wearCost ? ` +${action.wearCost} Wear.` : '';
  const extras: Option[] = [];
  if (!oathLock(combat)) extras.push({ id: 'menu:oath', label: 'Swear a battle oath', detail: 'Before the first round only. A bonus for the fight, if you keep it.', tone: 'accent' });
  const crew = commitments(state, ctx, combat);
  if (crew.length)
    extras.push({
      id: 'menu:crew',
      label: 'Hearthline: commit a crew member',
      detail: 'Free action: changes this round only.',
      locked: crew.every(({ key }) => combat.buffs.committed.includes(key)) ? 'Everyone has been committed this fight' : undefined,
      tone: 'accent',
    });
  // Fights with no way out at all don't list Withdraw.
  const inescapable = encounterOf(ctx.data, combat.encounter).inescapable;
  return [
    ...extras,
    {
      id: 'action',
      label: `${action.name} (console action)`,
      detail: effect ? `Once per fight, uses this round.${wear}` : undefined,
      locked: combatActionLock(state, ctx, combat),
      tone: 'accent',
    },
    ...(inescapable
      ? []
      : [
          {
            id: 'withdraw',
            label: 'Withdraw',
            detail: combat.buffs.auto_withdraw ? 'Your escape route is ready.' : combat.mode === 'ship' ? 'All power to engines and run.' : 'Nerve check to break away.',
            locked: withdrawLock(ctx, combat),
            tone: 'muted' as const,
          },
        ]),
  ];
}

function levelUpView(state: GameState, ctx: Ctx, status: StatusItem[]): View {
  const cfg = ctx.data.config;
  const c = state.character;
  return {
    kind: 'level_up',
    title: `Level ${c.level}`,
    status,
    body: [
      { text: `You have ${c.stat_points} stat point${c.stat_points > 1 ? 's' : ''} to spend. Choose a stat to raise by 1.`, tone: 'accent' },
      { text: `No stat can go above ${cfg.STAT_MAX}.`, tone: 'muted' },
    ],
    options: STAT_KEYS.map((k) => ({
      id: `stat:${k}`,
      label: `${statLabel(ctx.data, k)} ${c.stats[k]} -> ${c.stats[k] + 1}`,
      detail: ctx.data.stats.find((s) => s.key === k)!.governs,
      locked: c.stats[k] >= cfg.STAT_MAX ? `Max ${cfg.STAT_MAX}` : undefined,
    })),
  };
}

function mutinyView(state: GameState, ctx: Ctx, status: StatusItem[]): View {
  const cfg = ctx.data.config;
  const dc = resolveDifficulty(cfg, cfg.MUTINY_DIFFICULTY);
  return {
    kind: 'mutiny',
    title: 'Mutiny',
    status,
    body: [
      { text: 'The Hearthfire has gone out. The crew gathers on the bridge, and nobody is smiling.', tone: 'bad' },
      { text: 'If you can\'t win them back, someone will walk.' },
    ],
    options: [
      { id: 'rally', label: 'Rally the crew', detail: `Silver Tongue ${state.character.stats.silver_tongue} vs ${dc}` },
      {
        id: 'bribe',
        label: `Pay double shares (${cfg.MUTINY_BRIBE_ORE} Ore)`,
        detail: 'Always works.',
        locked: state.resources.ore < cfg.MUTINY_BRIBE_ORE ? `Needs ${cfg.MUTINY_BRIBE_ORE} Ore` : undefined,
      },
    ],
  };
}
