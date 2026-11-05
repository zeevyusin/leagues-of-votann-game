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
export type RangeBand = 'close' | 'medium' | 'long';
export type ShipTarget = 'hull' | 'weapons' | 'shields' | 'engines';

export const SAVE_VERSION = 4;

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
  /** Injury keys (combat-system.md 3.8). */
  injuries: string[];
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
  /** Crew members lost in Act 3. */
  crew_lost: string[];
  /** Built when the epilogue starts (story.md 7.1). */
  ending: Ending | null;
  /** Free-roam after the epilogue: the Waaagh! is retired. */
  post_game: boolean;
  /** Post-game quests finished (story.md 7.7). */
  post_quests_completed: string[];
  /** A system that became the fleet's home port (A New Hearth). */
  home_port: string | null;
}

export interface Ending {
  warboss: string;
  skragnak_fate: string;
  grudge: string;
  hold: 'UNBROKEN' | 'SCARRED' | 'EVACUATED';
  core: string;
  grizzgut: string;
}

/** A roll modifier that lasts the whole fight (rolls null) or a number of rolls. */
export interface FightMod {
  label: string;
  value: number;
  rolls: number | null;
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
  /** Modifiers from the encounter and the story (Act 3 rewards, Press on, and so on). */
  mods: FightMod[];
  /** The battle oath sworn this fight, and whether it has already broken. */
  battle_oath: string | null;
  oath_broken: boolean;
  /** Crew already committed this fight (Hearthline). */
  committed: string[];
  /** Extra Resolve damage if this round's roll succeeds (Brokka's commitment). */
  hit_resolve_bonus: number;
}

/** A sub-list open on the combat screen: battle oaths or crew commitments. */
export type CombatMenu = 'oath' | 'crew' | null;

export interface PersonalCombat {
  mode: 'personal';
  buffs: CombatBuffs;
  menu: CombatMenu;
  encounter: string;
  enemy_index: number;
  enemy: { key: string; resolve: number; resolve_max: number };
  round: number;
  intent: Intent;
  /** 'misleading' looks like a clear read of shown_intent, which is false. */
  read: 'clear' | 'vague' | 'misleading';
  /** The intent the telegraph shows (differs from intent only on a misleading read). */
  shown_intent: Intent;
  /** The two intents a vague read fits (one is the true intent). */
  vague_pair: [Intent, Intent];
  /** The stance used in a row, for duelists who adapt. */
  streak: { stance: Stance | null; count: number };
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
  menu: CombatMenu;
  encounter: string;
  enemy: { key: string; hull: number; hull_max: number };
  round: number;
  enemy_alloc: ShipAlloc;
  hint: string;
  /** Weapons pips chosen this round, while the player is still choosing shields. */
  pending_weapons: number | null;
  range: RangeBand;
  range_pref: RangeBand;
  target: ShipTarget;
  /** Enemy pips knocked out for the next round by subsystem hits. */
  knocked: ShipAlloc;
  last: Line[];
  then: CombatThen;
}

export type CombatState = PersonalCombat | ShipCombat;
export type CombatThen = { beat: string; route: string } | null;

export type Scene =
  /** section: the open market section, if any (game-overview.md 4.5). */
  | { type: 'hub'; tab: HubTab; section?: string | null }
  | { type: 'message'; key: string }
  | { type: 'beat'; key: string }
  | { type: 'combat'; combat: CombatState }
  | { type: 'notice'; title: string; lines: Line[] }
  | { type: 'name_ship'; error?: string }
  | { type: 'level_up' }
  | { type: 'mutiny' }
  | { type: 'muster' }
  /** A disabled ship that can be boarded (combat-system.md Phase 3). */
  | { type: 'board'; combat: ShipCombat; lines: Line[] }
  | { type: 'epilogue'; page: number };

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
  relics: { key: string; identified: boolean; equipped: boolean }[];
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
  /** Stances used across the whole campaign: duelists learn your habits. */
  stance_counts: Record<Stance, number>;
  /** Modifiers waiting for the next fight (from next_fight effects). */
  pending_fight_mods: FightMod[];
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
  if (s.version < 3) {
    s.character.injuries = [];
    s.story.crew_lost = [];
    s.story.ending = null;
    s.story.post_game = false;
    s.stance_counts = { attack: 0, defend: 0, outmaneuver: 0, negotiate: 0 };
    s.pending_fight_mods = [];
    for (const scene of s.scenes) {
      if (scene.type !== 'combat') continue;
      const c = scene.combat;
      c.buffs.mods ??= [];
      if (c.mode === 'personal') {
        c.shown_intent ??= c.intent;
        c.streak ??= { stance: null, count: 0 };
      } else {
        c.range ??= 'medium';
        c.range_pref ??= 'medium';
        c.target ??= 'hull';
        c.knocked ??= { weapons: 0, shields: 0, engines: 0 };
      }
    }
    s.version = 3;
  }
  if (s.version < 4) {
    s.ship.modules.armour ??= 1;
    for (const r of s.relics) r.equipped ??= false;
    s.story.post_quests_completed ??= [];
    s.story.home_port ??= null;
    for (const scene of s.scenes) {
      if (scene.type !== 'combat' && scene.type !== 'board') continue;
      const c = scene.combat;
      c.menu ??= null;
      c.buffs.battle_oath ??= null;
      c.buffs.oath_broken ??= false;
      c.buffs.committed ??= [];
      c.buffs.hit_resolve_bonus ??= 0;
    }
    s.version = 4;
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
    mods: [],
    battle_oath: null,
    oath_broken: false,
    committed: [],
    hit_resolve_bonus: 0,
  };
}

// ---------- View model ----------

export type Tone = 'normal' | 'muted' | 'teal' | 'blue' | 'accent' | 'good' | 'bad' | 'heading';

export interface Line {
  text: string;
  tone?: Tone;
}

/** A picture for the UI to draw. The engine only names art IDs; src/ui/art.ts turns them into images. */
export type Visual =
  | { kind: 'portrait'; art: string; alt: string }
  | { kind: 'enemy' | 'enemy_ship'; art: string; alt: string; dim: boolean }
  | { kind: 'player_ship'; alt: string; modules: Record<ModuleKey, number> }
  | { kind: 'map'; map: NavMap; list: Line[] };

/** A known system on the star map. */
export interface NavMapNode {
  key: string;
  name: string;
  x: number;
  y: number;
  here: boolean;
  port: boolean;
  ork: boolean;
  objective: boolean;
  visited: boolean;
  /** Systems on the shortest route, starting here. Empty if there is no known route. */
  route: string[];
  /** Totals and tags, shown when this system is highlighted. */
  detail: string;
  /** The option that travels here, for a neighbour the ship can reach right now. */
  go?: string;
}

/** What the star map shows: the engine decides it, the UI only draws it (graphics.md 7). */
export interface NavMap {
  nodes: NavMapNode[];
  edges: [string, string][];
  /** The shortest route to the nearest objective, shown when nothing is highlighted. */
  objective_route: string[];
}

export interface Option {
  id: string;
  label: string;
  detail?: string;
  /** Art ID of a thumbnail shown beside the option. */
  art?: string;
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
  /** Drawn above the body. Screens work the same without it. */
  visual?: Visual;
  body: Line[];
  options: Option[];
  input?: { id: string; prompt: string; maxLength: number; value?: string };
  error?: string;
}
