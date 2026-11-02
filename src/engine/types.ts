// Game state and the view model the UI renders.
import type { STAT_KEYS, MODULE_KEYS } from './schema';

export type StatKey = (typeof STAT_KEYS)[number];
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type Gender = 'MALE' | 'FEMALE';
export type KinType = 'KIN' | 'IRONKIN';
export type BaseClass = 'WARRIOR' | 'PATHFINDER' | 'ARTIFICER' | 'SPEAKER';
export type Tier = 'critical' | 'success' | 'partial' | 'failure';
export type Intent = 'aggressive' | 'guarded' | 'evasive';
export type Stance = 'attack' | 'defend' | 'outmaneuver' | 'negotiate';
export type HubTab = 'comms' | 'nav' | 'ship' | 'logbook' | 'market';

export const SAVE_VERSION = 2;

export interface Character {
  name: string;
  gender: Gender;
  kin_type: KinType;
  base_class: BaseClass;
  subclass: string;
  stats: Record<StatKey, number>;
  level: number;
  /** XP toward the next level. */
  xp: number;
  stat_points: number;
  /** Ironkin only; null for Kin. */
  wear: number | null;
  health: number;
  fatigued: boolean;
  days_since_dock: number;
}

export interface Ship {
  name: string;
  hull: number;
  hull_max: number;
  modules: Record<ModuleKey, number>;
  cargo_capacity: number;
}

export interface Resources {
  fuel: number;
  ore: number;
  supplies: number;
  hearthfire: number;
}

export interface OathEntry {
  key: string;
  status: 'ACTIVE' | 'KEPT' | 'BROKEN';
  sworn_day: number;
  deadline_day: number | null;
}

export interface GrudgeEntry {
  key: string;
  status: 'ACTIVE' | 'SETTLED';
  created_day: number;
}

export interface InboxMessage {
  key: string;
  read: boolean;
  day: number;
}

export type BeatResult = Tier | 'victory_broken' | 'victory_negotiated' | 'defeat' | 'withdrew';

export interface StoryState {
  act: number;
  /** Beats waiting to be played: each starts on arrival at its system, or from Comms. */
  active_beats: string[];
  /** The beat being resolved right now (used to tag records such as Grizzgut's). */
  playing_beat: string | null;
  completed_beats: { key: string; route: string; tier: BeatResult }[];
  threads_completed: string[];
  story_rewards: string[];
  events_seen: string[];
  act_events_shown: string[];
  /** Beats the player put off this visit; they wait until the next arrival. */
  deferred_beats: string[];
  waaagh_meter: number | null;
  flags: Record<string, string | number | boolean>;
  core_status: 'IN_VAULT' | 'STOLEN' | 'RECOVERED' | 'DESTROYED' | 'LOST';
  hrolla_status: 'FREE' | 'CAPTIVE' | 'RESCUED' | 'LOST';
  grizzgut_encounters: { beat: string; outcome: string }[];
  acts_completed: number[];
}

/** Temporary effects from console actions used during a fight. */
export interface CombatBuffs {
  action_used: boolean;
  fight_bonus: number;
  next_rolls_bonus: number;
  next_rolls_left: number;
  negotiate_bonus: number;
  reveal: boolean;
  auto_withdraw: boolean;
  victory_hearthfire: number;
  defeat_hearthfire: number;
}

export interface PersonalCombat {
  mode: 'personal';
  buffs: CombatBuffs;
  encounter: string;
  enemy_index: number;
  enemy: { key: string; resolve: number; resolve_max: number };
  round: number;
  intent: Intent;
  read: 'clear' | 'vague';
  /** The two intents a vague read fits (one is the true intent). */
  vague_pair: [Intent, Intent];
  telegraph: string;
  advantage: boolean;
  /** Extra difficulty for the next roll (from a failed negotiation). */
  enemy_bonus: number;
  last: Line[];
  then: CombatThen;
}

export interface ShipAlloc {
  weapons: number;
  shields: number;
  engines: number;
}

export interface ShipCombat {
  mode: 'ship';
  buffs: CombatBuffs;
  encounter: string;
  enemy: { key: string; hull: number; hull_max: number };
  round: number;
  enemy_alloc: ShipAlloc;
  hint: string;
  /** Weapons pips chosen this round, while the player is still choosing shields. */
  pending_weapons: number | null;
  last: Line[];
  then: CombatThen;
}

export type CombatState = PersonalCombat | ShipCombat;
export type CombatThen = { beat: string; route: string } | null;

export type Scene =
  | { type: 'hub'; tab: HubTab }
  | { type: 'message'; key: string }
  | { type: 'beat'; key: string }
  | { type: 'combat'; combat: CombatState }
  | { type: 'notice'; title: string; lines: Line[] }
  | { type: 'name_ship'; error?: string }
  | { type: 'level_up' }
  | { type: 'mutiny' };

export interface GameState {
  version: number;
  rng: number;
  day: number;
  location: string;
  docked: boolean;
  character: Character;
  ship: Ship;
  resources: Resources;
  cargo: { key: string; qty: number }[];
  relics: { key: string; identified: boolean }[];
  crew: string[];
  oaths: OathEntry[];
  grudges: GrudgeEntry[];
  reputation: Record<string, number>;
  discovered_systems: string[];
  visited_systems: string[];
  lore: string[];
  inbox: InboxMessage[];
  story: StoryState;
  grace_journeys: number;
  self_maintenance_used: boolean;
  /** Haggle was used during this port visit (resets on travel). */
  haggle_active: boolean;
  /** Chart Safe Route was used for the next journey. */
  safe_route_charted: boolean;
  /** Scene stack; the last entry is on screen. The hub is always at the bottom. */
  scenes: Scene[];
}

/** Upgrades an older save to the current shape. Add a step here whenever SAVE_VERSION goes up. */
export function migrateState(raw: GameState): GameState {
  const s = raw as GameState & { story: StoryState & { current_beat?: string | null } };
  if (s.version > SAVE_VERSION) throw new Error('This save was made by a newer version of the game.');
  if (s.version < 2) {
    const legacy = s.story.current_beat;
    s.story.active_beats = legacy ? [legacy] : [];
    delete s.story.current_beat;
    s.story.playing_beat = null;
    s.story.threads_completed = [];
    s.story.story_rewards = [];
    s.story.events_seen = [];
    s.story.act_events_shown = [];
    s.story.deferred_beats = [];
    s.haggle_active = false;
    s.safe_route_charted = false;
    for (const scene of s.scenes)
      if (scene.type === 'combat' && !scene.combat.buffs) scene.combat.buffs = freshBuffs();
    s.version = 2;
  }
  return s;
}

export function freshBuffs(): CombatBuffs {
  return {
    action_used: false,
    fight_bonus: 0,
    next_rolls_bonus: 0,
    next_rolls_left: 0,
    negotiate_bonus: 0,
    reveal: false,
    auto_withdraw: false,
    victory_hearthfire: 0,
    defeat_hearthfire: 0,
  };
}

// ---------- View model ----------

export type Tone = 'normal' | 'muted' | 'teal' | 'blue' | 'accent' | 'good' | 'bad' | 'heading';

export interface Line {
  text: string;
  tone?: Tone;
}

export interface Option {
  id: string;
  label: string;
  detail?: string;
  /** If set, the option is shown but cannot be chosen; the text says what is needed. */
  locked?: string;
  tone?: Tone;
}

export interface StatusItem {
  label: string;
  value: string;
  tone?: Tone;
}

export interface View {
  kind: string;
  title: string;
  subtitle?: string;
  status?: StatusItem[];
  tabs?: { active: HubTab; unread: number; market: boolean };
  body: Line[];
  options: Option[];
  input?: { id: string; prompt: string; maxLength: number; value?: string };
  error?: string;
}
