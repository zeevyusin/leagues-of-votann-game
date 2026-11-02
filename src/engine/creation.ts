// Character creation (character-creation.md section 2) and building the starting game state.
import type { GameData } from './schema';
import { STAT_KEYS } from './schema';
import {
  baseClassOf,
  kinTypeOf,
  maxHealth,
  statLabel,
  subclassOf,
  consoleActionFor,
  passiveFor,
} from './rules';
import type { BaseClass, Character, GameState, Gender, KinType, ModuleKey, Option, StatKey, View, Line } from './types';
import { SAVE_VERSION } from './types';
import { MODULE_KEYS } from './schema';

export type CreationStep = 'name' | 'gender' | 'kin' | 'class' | 'subclass' | 'bonus' | 'confirm';

export interface CreationDraft {
  step: CreationStep;
  name: string;
  gender: Gender | null;
  kin_type: KinType | null;
  base_class: BaseClass | null;
  subclass: string | null;
  bonus: Record<StatKey, number>;
  error?: string;
}

const STEPS: CreationStep[] = ['name', 'gender', 'kin', 'class', 'subclass', 'bonus', 'confirm'];

const zeroStats = (): Record<StatKey, number> => ({ grit: 0, craft: 0, wits: 0, silver_tongue: 0, nerve: 0 });

export function newDraft(): CreationDraft {
  return { step: 'name', name: '', gender: null, kin_type: null, base_class: null, subclass: null, bonus: zeroStats() };
}

export function bonusRemaining(data: GameData, draft: CreationDraft): number {
  if (!data.config.ALLOW_BONUS_POINTS) return 0;
  return data.config.BONUS_POINTS - Object.values(draft.bonus).reduce((a, b) => a + b, 0);
}

/** starting value + base class bonus + Ironkin Grit + allocated bonus points (checklist item 3). */
export function finalStats(data: GameData, draft: CreationDraft): Record<StatKey, number> {
  const cfg = data.config;
  const stats = zeroStats();
  for (const k of STAT_KEYS) stats[k] = cfg.STARTING_STAT;
  if (draft.base_class) {
    const bonus = baseClassOf(data, draft.base_class).stat_bonus;
    for (const k of STAT_KEYS) stats[k] += bonus[k] ?? 0;
  }
  if (draft.kin_type === 'IRONKIN') stats.grit += cfg.IRONKIN_GRIT_BONUS;
  for (const k of STAT_KEYS) stats[k] = Math.min(cfg.STAT_MAX, stats[k] + draft.bonus[k]);
  return stats;
}

function stepNumber(step: CreationStep): number {
  return STEPS.indexOf(step) + 1;
}

const back: Option = { id: 'back', label: 'Back', tone: 'muted' };

export function creationView(data: GameData, draft: CreationDraft): View {
  const total = data.config.ALLOW_BONUS_POINTS ? STEPS.length : STEPS.length - 1;
  const n = Math.min(stepNumber(draft.step), total);
  const base: Omit<View, 'body' | 'options' | 'title'> = {
    kind: 'creation',
    subtitle: `New captain, step ${n} of ${total}`,
    error: draft.error,
  };

  switch (draft.step) {
    case 'name':
      return {
        ...base,
        title: 'Name',
        body: [{ text: 'Every captain of the Durn Prospect Fleet is entered into the Hold\'s records. What name goes in the book?' }],
        options: [],
        input: { id: 'name', prompt: 'Captain\'s name', maxLength: data.config.NAME_MAX_LENGTH, value: draft.name },
      };
    case 'gender':
      return {
        ...base,
        title: 'Gender',
        body: [{ text: 'Used for how others speak about you. It has no effect on any roll or number.', tone: 'muted' }],
        options: [
          { id: 'MALE', label: 'Male' },
          { id: 'FEMALE', label: 'Female' },
          back,
        ],
      };
    case 'kin': {
      const body: Line[] = [];
      for (const k of data.kin_types) {
        body.push({ text: k.display_name.toUpperCase(), tone: 'heading' });
        body.push({ text: k.summary, tone: 'muted' });
        for (const p of k.perks) body.push({ text: `+ ${p.name}: ${p.description}`, tone: 'good' });
        for (const p of k.drawbacks) body.push({ text: `- ${p.name}: ${p.description}`, tone: 'bad' });
        body.push({ text: '' });
      }
      return {
        ...base,
        title: 'Kin type',
        body,
        options: [...data.kin_types.map((k) => ({ id: k.key, label: k.display_name })), back],
      };
    }
    case 'class': {
      const body: Line[] = [];
      for (const b of data.base_classes) {
        const passive = draft.kin_type === 'IRONKIN' ? b.ironkin_passive : b.kin_passive;
        const bonus = Object.entries(b.stat_bonus)
          .map(([k, v]) => `+${v} ${statLabel(data, k as StatKey)}`)
          .join(', ');
        body.push({ text: `${b.display_name.toUpperCase()}  (${bonus})`, tone: 'heading' });
        body.push({ text: b.theme, tone: 'muted' });
        body.push({ text: `Passive: ${passive.name}. ${passive.description}` });
        body.push({ text: '' });
      }
      return {
        ...base,
        title: 'Base class',
        body,
        options: [...data.base_classes.map((b) => ({ id: b.key, label: b.display_name })), back],
      };
    }
    case 'subclass': {
      const subs = data.subclasses.filter((s) => s.base_class === draft.base_class);
      const body: Line[] = [];
      for (const s of subs) {
        const variant = draft.kin_type === 'IRONKIN' ? s.console_action.ironkin_variant : undefined;
        body.push({ text: s.display_name.toUpperCase(), tone: 'heading' });
        body.push({ text: `Console action: ${s.console_action.name}. ${variant?.description ?? s.console_action.description}` });
        body.push({ text: `Trait: ${s.trait.name}. ${s.trait.description}` });
        body.push({ text: `Starting bonus: ${describeKit(data, s.key)}`, tone: 'teal' });
        body.push({ text: '' });
      }
      return {
        ...base,
        title: 'Subclass',
        body,
        options: [...subs.map((s) => ({ id: s.key, label: s.display_name })), back],
      };
    }
    case 'bonus': {
      const remaining = bonusRemaining(data, draft);
      const stats = finalStats(data, draft);
      const body: Line[] = [
        { text: `Distribute ${data.config.BONUS_POINTS} bonus points. No more than +${data.config.BONUS_MAX_PER_STAT} to one stat.` },
        { text: `Points left: ${remaining}`, tone: remaining > 0 ? 'accent' : 'good' },
        { text: '' },
        ...STAT_KEYS.map((k) => ({
          text: `${statLabel(data, k).padEnd(14)} ${stats[k]}${draft.bonus[k] ? `  (+${draft.bonus[k]})` : ''}`,
        })),
      ];
      const options: Option[] = STAT_KEYS.map((k) => ({
        id: `add:${k}`,
        label: `+1 ${statLabel(data, k)}`,
        locked:
          remaining <= 0
            ? 'No points left'
            : draft.bonus[k] >= data.config.BONUS_MAX_PER_STAT
              ? `Max +${data.config.BONUS_MAX_PER_STAT}`
              : stats[k] >= data.config.STAT_MAX
                ? `Stat max ${data.config.STAT_MAX}`
                : undefined,
      }));
      options.push({ id: 'reset', label: 'Reset points', tone: 'muted' });
      options.push({ id: 'done', label: 'Confirm allocation', locked: remaining > 0 ? 'Spend all points first' : undefined, tone: 'accent' });
      options.push(back);
      return { ...base, title: 'Bonus points', body, options };
    }
    case 'confirm':
      return { ...base, title: 'Confirm your captain', body: summaryLines(data, draft), options: [{ id: 'begin', label: 'Begin', tone: 'accent' }, back] };
  }
}

function describeKit(data: GameData, subclass: string): string {
  const kit = subclassOf(data, subclass).starting_kit;
  const parts: string[] = [];
  const add = (v: number | undefined, label: string) => v && parts.push(`+${v} ${label}`);
  add(kit.fuel, 'Fuel');
  add(kit.ore, 'Ore');
  add(kit.supplies, 'Supplies');
  add(kit.hearthfire, 'Hearthfire');
  add(kit.hull, 'Hull');
  add(kit.cargo_capacity, 'cargo capacity');
  for (const [m, lvl] of Object.entries(kit.modules ?? {})) parts.push(`${m.replace('_', ' ')} module level ${lvl}`);
  for (const [f, v] of Object.entries(kit.reputation ?? {}))
    parts.push(`+${v} reputation with ${data.factions.find((x) => x.key === f)?.display_name ?? f}`);
  if (kit.relics?.length) parts.push(`${kit.relics.length} unidentified relic`);
  if (kit.reveal_systems?.length) parts.push(`${kit.reveal_systems.length} extra systems revealed on Nav`);
  return parts.join(', ') || 'none';
}

function summaryLines(data: GameData, draft: CreationDraft): Line[] {
  const stats = finalStats(data, draft);
  const sub = subclassOf(data, draft.subclass!);
  const preview = previewCharacter(data, draft);
  const passive = passiveFor(data, preview);
  const action = consoleActionFor(data, preview);
  const lines: Line[] = [
    { text: draft.name, tone: 'heading' },
    { text: `${draft.gender === 'MALE' ? 'Male' : 'Female'} ${kinTypeOf(data, draft.kin_type!).display_name}` },
    { text: `${baseClassOf(data, draft.base_class!).display_name} / ${sub.display_name}` },
    { text: '' },
    ...STAT_KEYS.map((k) => ({ text: `${statLabel(data, k).padEnd(14)} ${stats[k]}` })),
    { text: '' },
    { text: `Health: ${maxHealth(data.config, preview)}` },
    { text: `Passive: ${passive.name}. ${passive.description}` },
    { text: `Console action: ${action.name}. ${action.description}${action.wearCost ? ` (+${action.wearCost} Wear per use)` : ''}` },
    { text: `Trait: ${sub.trait.name}. ${sub.trait.description}` },
    { text: `Starting bonus: ${describeKit(data, sub.key)}`, tone: 'teal' },
  ];
  if (draft.kin_type === 'IRONKIN') lines.push({ text: `Starting Wear: ${data.config.WEAR_START}` });
  lines.push({ text: `Starting Hearthfire: ${data.config.STARTING_KIT.hearthfire + (sub.starting_kit.hearthfire ?? 0)}` });
  return lines;
}

function previewCharacter(data: GameData, draft: CreationDraft): Character {
  const c: Character = {
    name: draft.name,
    gender: draft.gender!,
    kin_type: draft.kin_type!,
    base_class: draft.base_class!,
    subclass: draft.subclass!,
    stats: finalStats(data, draft),
    level: 1,
    xp: 0,
    stat_points: 0,
    wear: draft.kin_type === 'IRONKIN' ? data.config.WEAR_START : null,
    health: 0,
    fatigued: false,
    days_since_dock: 0,
    injuries: [],
  };
  c.health = maxHealth(data.config, c);
  return c;
}

/** Applies one choice. Returns the updated draft; `done` means the player pressed Begin. */
export function creationChoose(
  data: GameData,
  draft: CreationDraft,
  id: string,
  text?: string,
): { draft: CreationDraft; done: boolean } {
  const d: CreationDraft = structuredClone(draft);
  d.error = undefined;
  const go = (step: CreationStep) => {
    d.step = step;
    return { draft: d, done: false };
  };
  if (id === 'back') {
    const i = STEPS.indexOf(d.step);
    let prev = STEPS[Math.max(0, i - 1)];
    if (prev === 'bonus' && !data.config.ALLOW_BONUS_POINTS) prev = 'subclass';
    return go(prev);
  }

  switch (d.step) {
    case 'name': {
      const name = (text ?? '').trim();
      if (name.length < data.config.NAME_MIN_LENGTH || name.length > data.config.NAME_MAX_LENGTH) {
        d.name = text ?? '';
        d.error = `The name must be ${data.config.NAME_MIN_LENGTH} to ${data.config.NAME_MAX_LENGTH} characters.`;
        return { draft: d, done: false };
      }
      d.name = name;
      return go('gender');
    }
    case 'gender':
      if (id !== 'MALE' && id !== 'FEMALE') return { draft: d, done: false };
      d.gender = id;
      return go('kin');
    case 'kin':
      if (id !== 'KIN' && id !== 'IRONKIN') return { draft: d, done: false };
      d.kin_type = id;
      return go('class');
    case 'class': {
      const b = data.base_classes.find((x) => x.key === id);
      if (!b) return { draft: d, done: false };
      // Changing base class resets the subclass and bonus points.
      if (d.base_class !== b.key) {
        d.subclass = null;
        d.bonus = zeroStats();
      }
      d.base_class = b.key;
      return go('subclass');
    }
    case 'subclass': {
      const s = data.subclasses.find((x) => x.key === id && x.base_class === d.base_class);
      if (!s) return { draft: d, done: false };
      d.subclass = s.key;
      return go(data.config.ALLOW_BONUS_POINTS ? 'bonus' : 'confirm');
    }
    case 'bonus': {
      if (id === 'reset') {
        d.bonus = zeroStats();
        return { draft: d, done: false };
      }
      if (id === 'done') {
        if (bonusRemaining(data, d) > 0) {
          d.error = 'Spend all bonus points first.';
          return { draft: d, done: false };
        }
        return go('confirm');
      }
      if (id.startsWith('add:')) {
        const k = id.slice(4) as StatKey;
        if (!STAT_KEYS.includes(k)) return { draft: d, done: false };
        const stats = finalStats(data, d);
        if (bonusRemaining(data, d) > 0 && d.bonus[k] < data.config.BONUS_MAX_PER_STAT && stats[k] < data.config.STAT_MAX)
          d.bonus[k]++;
      }
      return { draft: d, done: false };
    }
    case 'confirm':
      return { draft: d, done: id === 'begin' };
  }
}

/** Builds the full starting game state from a finished draft. */
export function newGame(data: GameData, draft: CreationDraft, seed: number): GameState {
  const cfg = data.config;
  const sub = subclassOf(data, draft.subclass!);
  const kit = sub.starting_kit;
  const character = previewCharacter(data, draft);

  const modules = Object.fromEntries(MODULE_KEYS.map((m) => [m, cfg.STARTING_KIT.module_level])) as Record<ModuleKey, number>;
  for (const [m, lvl] of Object.entries(kit.modules ?? {})) modules[m as ModuleKey] = Math.min(cfg.MODULE_MAX_LEVEL, lvl);

  const reputation: Record<string, number> = {};
  for (const f of data.factions)
    reputation[f.key] = f.starting_reputation + (character.kin_type === 'IRONKIN' ? f.ironkin_modifier : 0);
  for (const [f, v] of Object.entries(kit.reputation ?? {})) reputation[f] = (reputation[f] ?? 0) + v;

  const hullMax = cfg.STARTING_KIT.hull + (kit.hull ?? 0);
  const discovered = data.systems.filter((s) => !s.hidden).map((s) => s.key);
  for (const s of kit.reveal_systems ?? []) if (!discovered.includes(s)) discovered.push(s);

  return {
    version: SAVE_VERSION,
    rng: seed >>> 0,
    day: cfg.START_DAY,
    location: cfg.START_SYSTEM,
    docked: data.systems.find((s) => s.key === cfg.START_SYSTEM)!.port,
    character,
    ship: { name: cfg.DEFAULT_SHIP_NAME, hull: hullMax, hull_max: hullMax, modules, cargo_capacity: cfg.STARTING_KIT.cargo_capacity + (kit.cargo_capacity ?? 0) },
    resources: {
      fuel: cfg.STARTING_KIT.fuel + (kit.fuel ?? 0),
      ore: cfg.STARTING_KIT.ore + (kit.ore ?? 0),
      supplies: cfg.STARTING_KIT.supplies + (kit.supplies ?? 0),
      hearthfire: Math.min(cfg.HEARTHFIRE_MAX, cfg.STARTING_KIT.hearthfire + (kit.hearthfire ?? 0)),
    },
    cargo: structuredClone(cfg.STARTING_CARGO),
    relics: (kit.relics ?? []).map((key) => ({ key, identified: false })),
    crew: [...cfg.STARTING_CREW],
    oaths: [],
    grudges: [],
    reputation,
    discovered_systems: discovered,
    visited_systems: [cfg.START_SYSTEM],
    lore: [],
    inbox: [{ key: cfg.FIRST_MESSAGE, read: false, day: cfg.START_DAY }],
    story: {
      act: 1,
      active_beats: [data.messages.find((m) => m.key === cfg.FIRST_MESSAGE)?.beat].filter((b): b is string => !!b),
      playing_beat: null,
      completed_beats: [],
      threads_completed: [],
      story_rewards: [],
      events_seen: [],
      act_events_shown: [],
      deferred_beats: [],
      waaagh_meter: null,
      flags: { [`STAKE_${sub.key}`]: true },
      core_status: 'IN_VAULT',
      hrolla_status: 'FREE',
      grizzgut_encounters: [],
      acts_completed: [],
      crew_lost: [],
      ending: null,
      post_game: false,
    },
    grace_journeys: 0,
    self_maintenance_used: false,
    haggle_active: false,
    safe_route_charted: false,
    stance_counts: { attack: 0, defend: 0, outmaneuver: 0, negotiate: 0 },
    pending_fight_mods: [],
    scenes: [
      { type: 'hub', tab: 'comms' },
      {
        type: 'notice',
        title: 'Kethra\'s Anvil',
        lines: [
          { text: `You are ${character.name}, captain of the ${cfg.DEFAULT_SHIP_NAME}, one of the ships of the Durn Prospect Fleet.` },
          { text: 'The fleet has spent months surveying the Ashfall Reach. Today it opens an ancestor vault on Kethra\'s Anvil.' },
          { text: '' },
          { text: 'Your console has four screens: Comms, Nav, Ship, and Logbook. Switch between them with the tabs (or the Tab key). Pick options with the number keys.', tone: 'muted' },
          { text: 'You have new orders waiting on Comms.', tone: 'teal' },
        ],
      },
    ],
  };
}
