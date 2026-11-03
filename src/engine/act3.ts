// Act 3: the muster, the launch into the battle chain, the ending builder, the epilogue, and free-roam.
// story.md sections 6.6, 6.7, 7 and 9.1. The beats themselves are data (story_beats_act3.json);
// this module only starts the chain and turns its flags into an ending.
import { allMet } from './conditions';
import { applyEffects, receiveMessage, resolveOath } from './effects';
import { titleCase } from './roll';
import { dock } from './travel';
import { resolveNext } from './story';
import {
  crewOf,
  hearthfireBand,
  inAct3,
  oathOf,
  resolveText,
  subclassOf,
  systemOf,
  threadOf,
  waaaghBand,
  type Ctx,
} from './rules';
import type { Ending, GameState, Line, Option } from './types';

const flag = (state: GameState, key: string) => state.story.flags[key];

/** Sound the muster is offered at the muster ports once Act 3 is unlocked (story.md 6.7.1). */
export function canMusterHere(state: GameState, ctx: Ctx): boolean {
  const s = state.story;
  return (
    s.act_events_shown.includes('ACT3_UNLOCKED') &&
    !s.flags.ACT3_STARTED &&
    !s.post_game &&
    state.docked &&
    ctx.data.config.ACT3_MUSTER_PORTS.includes(state.location)
  );
}

/** Oaths created by accepting a job: these break when the muster sounds. */
export function jobOathKeys(ctx: Ctx): Set<string> {
  const keys = new Set<string>();
  for (const m of ctx.data.messages) for (const e of m.job?.on_accept ?? []) if (e.create_oath) keys.add(e.create_oath);
  return keys;
}

function openJobOaths(state: GameState, ctx: Ctx) {
  const jobs = jobOathKeys(ctx);
  return state.oaths.filter((o) => o.status === 'ACTIVE' && jobs.has(o.key));
}

/** The point-of-no-return screen. */
export function musterScreen(state: GameState, ctx: Ctx): { body: Line[]; options: Option[] } {
  const cfg = ctx.data.config;
  const body: Line[] = [
    { text: 'Every Kin captain in the Reach is waiting for your word. Once you sound the muster, the fleet gathers at Hold Durnvar to meet the Waaagh!' },
    { text: '' },
    { text: 'WHAT YOU BRING', tone: 'heading' },
  ];
  for (const t of ctx.data.story_threads)
    if (state.story.threads_completed.includes(t.key)) body.push({ text: `${t.title}: ${t.reward_text}`, tone: 'good' });
  if (state.story.story_rewards.includes('ALLIES_URGROT')) body.push({ text: "Boss Urgrot's pact: his ships will turn on Skragnak.", tone: 'good' });
  const band = waaaghBand(cfg, state.story.waaagh_meter);
  body.push({ text: `The Waaagh!: ${state.story.waaagh_meter}/${cfg.WAAAGH_LAUNCH}, ${titleCase(band.band)}.`, tone: 'accent' });
  const jobs = openJobOaths(state, ctx);
  if (jobs.length) {
    body.push({ text: '' }, { text: 'THESE CONTRACTS WILL BREAK', tone: 'heading' });
    for (const o of jobs) body.push({ text: oathOf(ctx.data, o.key).title, tone: 'bad' });
  }
  body.push(
    { text: '' },
    { text: 'This is the point of no return. Act 3 is one long fight: there is no more travel, and no coming back to finish other business first.', tone: 'bad' },
  );
  return {
    body,
    options: [
      { id: 'confirm', label: 'Sound the muster', tone: 'accent' },
      { id: 'back', label: 'Not yet', tone: 'muted' },
    ],
  };
}

/** Starts Act 3: by choice at a muster port, or forced when the Waaagh! launches (story.md 6.6). */
export function startAct3(state: GameState, ctx: Ctx, forced: boolean): Line[] {
  const cfg = ctx.data.config;
  const s = state.story;
  Object.assign(s.flags, { ACT3_STARTED: true, ACT3_FORCED: forced, ACT3_PHASE: 'RALLY' });
  s.act = 3;
  s.deferred_beats = [];
  const lines: Line[] = [];
  for (const o of openJobOaths(state, ctx)) lines.push(...resolveOath(state, ctx, o.key, 'BROKEN'));
  // Wherever the ship is, the fleet gathers at the Hold. The trip takes no time.
  state.location = cfg.ACT3_RALLY_SYSTEM;
  if (!state.discovered_systems.includes(state.location)) state.discovered_systems.push(state.location);
  if (!state.visited_systems.includes(state.location)) state.visited_systems.push(state.location);
  lines.push(...dock(state, ctx));
  const first = resolveNext(state, ctx, cfg.ACT3_FIRST_BEAT);
  if (first) state.scenes.push({ type: 'beat', key: first });
  return lines;
}

export function soundMuster(state: GameState, ctx: Ctx): void {
  if (!canMusterHere(state, ctx)) return;
  state.scenes.pop();
  const lines = startAct3(state, ctx, false);
  state.scenes.push({
    type: 'notice',
    title: 'The muster sounds',
    lines: [{ text: 'Horns blare across the station. Ships light their engines one by one, and every one of them turns toward Hold Durnvar.' }, ...lines],
  });
}

export function canLaunch(state: GameState): boolean {
  return inAct3(state) && state.story.flags.ACT3_PHASE === 'RALLY';
}

/** "Lead the fleet out": the market closes and the battle chain begins. */
export function launchFleet(state: GameState, ctx: Ctx): void {
  if (!canLaunch(state)) return;
  state.story.flags.ACT3_PHASE = 'BATTLE';
  state.docked = false;
  const first = resolveNext(state, ctx, ctx.data.config.ACT3_LAUNCH_BEAT);
  if (first) state.scenes.push({ type: 'beat', key: first });
}

/** The hub objective line during Act 3, or the muster hint once Act 3 is unlocked. */
export function act3Objective(state: GameState, ctx: Ctx): string | null {
  if (state.story.post_game) return null;
  if (canLaunch(state))
    return `Make ready at ${systemOf(ctx.data, ctx.data.config.ACT3_RALLY_SYSTEM).display_name}: repair, restock, then lead the fleet out (Nav).`;
  if (inAct3(state)) return 'The Waaagh! is here.';
  return null;
}

export function musterHint(state: GameState, ctx: Ctx): string | null {
  const s = state.story;
  if (!s.act_events_shown.includes('ACT3_UNLOCKED') || s.flags.ACT3_STARTED || s.post_game) return null;
  const ports = ctx.data.config.ACT3_MUSTER_PORTS.map((p) => systemOf(ctx.data, p).display_name).join(' or ');
  return `When you are ready, sound the muster at ${ports} (Nav).`;
}

/** Rally arrival lines: who answered the call (story.md 6.7.2). */
export function rallyLines(state: GameState, ctx: Ctx): Line[] {
  return ctx.data.endings.rally_lines.filter((r) => allMet(state, r.requirements)).map((r) => ({ text: resolveText(r.text, state), tone: 'teal' as const }));
}

/** Ylsa warns the player each time Hearthfire drops into the Low band (story.md 9.1). Returns true if a screen was queued. */
export function ylsaWarning(state: GameState, ctx: Ctx): boolean {
  const low = hearthfireBand(ctx.data.config, state.resources.hearthfire).modifier < 0;
  const s = state.story;
  if (!low) {
    if (s.flags.YLSA_WARNED) s.flags.YLSA_WARNED = false;
    return false;
  }
  if (s.flags.YLSA_WARNED || !s.flags.ACT2_STARTED || s.post_game || !state.crew.includes('YLSA')) return false;
  s.flags.YLSA_WARNED = true;
  state.scenes.push({ type: 'notice', title: 'Ylsa', lines: [{ text: resolveText(ctx.data.endings.ylsa_warning, state), tone: 'accent' }] });
  return true;
}

// ---------- Endings ----------

const HOLD_FATES = ['UNBROKEN', 'SCARRED', 'EVACUATED'] as const;

/** The three results (story.md 7.1) plus the grudge settlement and Grizzgut's fate. */
export function buildEnding(state: GameState, ctx: Ctx): Ending {
  const cfg = ctx.data.config;
  const lostBattle = !!flag(state, 'ACT3_BATTLE_LOST');
  const earlyAndWeak = !!flag(state, 'ACT3_FORCED') && state.story.threads_completed.length < cfg.THREADS_REQUIRED;
  let step = lostBattle || earlyAndWeak ? 2 : (state.story.waaagh_meter ?? 0) < cfg.HOLD_SCARRED_AT ? 0 : 1;
  const drop = flag(state, 'HOLD_FATE_DROP');
  step = Math.min(2, step + (typeof drop === 'number' ? drop : 0));

  const resolution = String(flag(state, 'RESOLUTION') ?? 'LAST_STAND');
  const lost = !!flag(state, 'SKRAGNAK_LOST');
  const fate = lost ? 'EXILED_BY_OTHERS' : String(flag(state, 'SKRAGNAK_FATE') ?? 'EXILED');
  let grudge: string;
  if (lost) grudge = 'GREAT_COST';
  else if (fate === 'EXECUTED' || resolution === 'DUEL') grudge = 'BLOOD';
  else if (resolution === 'USURPER') grudge = 'ORK_HANDS';
  else if (resolution === 'UNPLUGGING' || resolution === 'AMBUSH') grudge = 'CUNNING';
  else grudge = 'GREAT_COST';

  return {
    warboss: resolution,
    skragnak_fate: fate,
    grudge,
    hold: HOLD_FATES[step],
    core: String(flag(state, 'CORE_CHOICE') ?? 'LOST'),
    grizzgut: String(flag(state, 'GRIZZGUT_FINAL') ?? 'BEATEN'),
  };
}

const CORE_STATUS = { RETURNED: 'RECOVERED', KEPT: 'RECOVERED', DESTROYED: 'DESTROYED', LOST: 'LOST' } as const;

/** Builds the ending, settles the grudge and the story oaths, and opens the epilogue. */
export function beginEpilogue(state: GameState, ctx: Ctx): void {
  const s = state.story;
  const ending = buildEnding(state, ctx);
  s.ending = ending;
  s.core_status = CORE_STATUS[ending.core as keyof typeof CORE_STATUS] ?? 'LOST';
  if (s.hrolla_status !== 'RESCUED') s.hrolla_status = 'RESCUED';
  applyEffects(state, ctx, [{ settle_grudge: 'GRUDGE_SKRAGNAK' }]);
  for (const rule of ctx.data.endings.oaths) {
    if (!state.oaths.some((o) => o.key === rule.oath && o.status === 'ACTIVE')) continue;
    resolveOath(state, ctx, rule.oath, allMet(state, rule.keep_if) ? 'KEPT' : 'BROKEN');
  }
  state.scenes.push({ type: 'epilogue', page: 0 });
}

export interface EpiloguePage {
  title: string;
  lines: Line[];
}

export function epiloguePages(state: GameState, ctx: Ctx): EpiloguePage[] {
  const e = ctx.data.endings;
  const end = state.story.ending;
  if (!end) return [];
  const t = (text: Parameters<typeof resolveText>[0] | undefined): Line[] => (text ? [{ text: resolveText(text, state) }] : []);
  const pages: EpiloguePage[] = [];

  pages.push({
    title: 'How the Warboss fell',
    lines: [
      ...t(e.warboss[end.warboss]),
      ...(state.story.flags.SKRAGNAK_LOST ? t(e.warboss.LOST) : []),
      { text: '' },
      ...t(e.skragnak_fate[end.skragnak_fate]),
      { text: '' },
      ...t(e.grudge[end.grudge]).map((l) => ({ ...l, tone: 'accent' as const })),
    ],
  });
  pages.push({ title: 'Hold Durnvar', lines: t(e.hold[end.hold]) });
  pages.push({ title: 'The Ancestor Core', lines: t(e.core[end.core]) });

  const after: Line[] = [];
  for (const [key, texts] of Object.entries(e.crew)) {
    let text;
    if (state.story.crew_lost.includes(key)) text = texts.lost;
    else if (state.story.flags[`${key}_SENT_AWAY`]) text = texts.sent_away;
    else if (state.crew.includes(key)) text = texts.aboard;
    if (text) after.push({ text: `${crewOf(ctx.data, key).display_name}: ${resolveText(text, state)}` });
  }
  after.push({ text: `Nob Grizzgut: ${resolveText(e.grizzgut[end.grizzgut], state)}` });
  const settled = state.oaths.filter((o) => o.status !== 'ACTIVE');
  if (settled.length) {
    after.push({ text: '' }, { text: 'OATHS', tone: 'heading' });
    for (const o of settled)
      after.push({ text: `${oathOf(ctx.data, o.key).title}: ${o.status === 'KEPT' ? 'kept' : 'broken'}`, tone: o.status === 'KEPT' ? 'good' : 'bad' });
  }
  after.push({ text: '' }, ...t(e.stakes[state.character.subclass]).map((l) => ({ ...l, tone: 'teal' as const })));
  pages.push({ title: 'After', lines: after });

  const c = state.character;
  const threads = state.story.threads_completed.map((k) => threadOf(ctx.data, k).title);
  pages.push({
    title: 'Saga record',
    lines: [
      { text: `${c.name}, ${subclassOf(ctx.data, c.subclass).display_name}, captain of the ${state.ship.name}`, tone: 'heading' },
      { text: `Days in the Reach: ${state.day}` },
      { text: `Level: ${c.level}` },
      { text: `The Waaagh! stood at ${state.story.waaagh_meter ?? 0} when the fleet sailed.` },
      { text: `Threads completed: ${threads.length ? threads.join(', ') : 'none'}` },
      { text: `How the grudge was settled: ${GRUDGE_NAMES[end.grudge] ?? end.grudge}`, tone: 'accent' },
      { text: `Hold Durnvar: ${titleCase(end.hold)}` },
    ],
  });
  return pages;
}

const GRUDGE_NAMES: Record<string, string> = {
  BLOOD: 'in blood',
  CUNNING: 'in cunning',
  ORK_HANDS: 'by Ork hands',
  GREAT_COST: 'at great cost',
};

/** The last epilogue page: the Waaagh! is retired and the Reach is open again (story.md 7.6). */
export function startFreeRoam(state: GameState, ctx: Ctx): void {
  const cfg = ctx.data.config;
  const s = state.story;
  const end = s.ending!;
  s.post_game = true;
  if (!s.acts_completed.includes(3)) s.acts_completed.push(3);
  s.flags.ACT3_PHASE = 'DONE';
  state.location = cfg.POST_GAME_START[end.hold];
  const lines: Line[] = [{ text: resolveText(ctx.data.endings.free_roam, state) }, { text: '' }];
  lines.push(...dock(state, ctx));
  for (const q of ctx.data.post_quests) if (allMet(state, q.requirements)) lines.push(...receiveMessage(state, ctx, q.message));
  if (!cfg.ALLOW_POST_GAME) lines.push({ text: 'The saga is complete.', tone: 'muted' });
  state.scenes.push({ type: 'notice', title: 'Free roam', lines });
}
