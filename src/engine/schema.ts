// Schemas for every data file, plus cross-reference checks.
// Data that fails validation stops the game at load time with a readable error.
import { z } from 'zod';

export const STAT_KEYS = ['grit', 'craft', 'wits', 'silver_tongue', 'nerve'] as const;
export const statKey = z.enum(STAT_KEYS);
export const genderSchema = z.enum(['MALE', 'FEMALE']);
export const kinTypeSchema = z.enum(['KIN', 'IRONKIN']);
export const baseClassSchema = z.enum(['WARRIOR', 'PATHFINDER', 'ARTIFICER', 'SPEAKER']);
export const tierSchema = z.enum(['critical', 'success', 'partial', 'failure']);
export const MODULE_KEYS = ['engine', 'shields', 'weapons', 'reactor', 'cargo_hold', 'scanner', 'workshop'] as const;
export const moduleKey = z.enum(MODULE_KEYS);
const difficulty = z.union([z.string(), z.number()]);
const numRecord = z.record(z.string(), z.number());

/** Plain string, or a default plus variants keyed by subclass, base class, kin type, or gender. */
export const textVariant = z.union([
  z.string(),
  z.strictObject({ default: z.string(), variants: z.record(z.string(), z.string()).optional() }),
]);

export const effectSchema = z.strictObject({
  fuel: z.number().optional(),
  ore: z.number().optional(),
  supplies: z.number().optional(),
  hearthfire: z.number().optional(),
  health: z.number().optional(),
  hull: z.number().optional(),
  wear: z.number().optional(),
  waaagh: z.number().optional(),
  xp: z.number().optional(),
  reputation: numRecord.optional(),
  create_oath: z.string().optional(),
  keep_oath: z.string().optional(),
  break_oath: z.string().optional(),
  create_grudge: z.string().optional(),
  settle_grudge: z.string().optional(),
  set_flag: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  add_message: z.string().optional(),
  add_crew: z.string().optional(),
  remove_crew: z.string().optional(),
  add_cargo: z.strictObject({ key: z.string(), qty: z.number() }).optional(),
  add_relic: z.string().optional(),
  reveal_system: z.string().optional(),
  lore: z.string().optional(),
  set_core_status: z.enum(['IN_VAULT', 'STOLEN', 'RECOVERED', 'DESTROYED', 'LOST']).optional(),
  set_hrolla_status: z.enum(['FREE', 'CAPTIVE', 'RESCUED', 'LOST']).optional(),
  grizzgut: z.string().optional(),
  waaagh_start: z.boolean().optional(),
  complete_act: z.number().optional(),
});
export type Effect = z.infer<typeof effectSchema>;

export const requirementSchema = z.strictObject({
  base_class: baseClassSchema.optional(),
  subclass: z.string().optional(),
  kin_type: kinTypeSchema.optional(),
  stat: z.strictObject({ name: statKey, min: z.number() }).optional(),
  reputation: z.strictObject({ faction: z.string(), min: z.number() }).optional(),
  flag: z.string().optional(),
  location: z.string().optional(),
});
export type Requirement = z.infer<typeof requirementSchema>;

const outcomeSchema = z.strictObject({ text: textVariant, effects: z.array(effectSchema).default([]) });
const tierOutcomes = z.strictObject({
  critical: outcomeSchema,
  success: outcomeSchema,
  partial: outcomeSchema,
  failure: outcomeSchema,
});

const routeSchema = z
  .strictObject({
    key: z.string(),
    label: z.string(),
    requirements: z.array(requirementSchema).default([]),
    roll: z.strictObject({ stat: statKey, difficulty }).optional(),
    encounter: z.string().optional(),
    console_action: z.strictObject({ difficulty }).optional(),
    auto_tier: tierSchema.optional(),
    class_bonus: numRecord.optional(),
    subclass_bonus: numRecord.optional(),
    effects_always: z.array(effectSchema).default([]),
    outcomes: tierOutcomes.partial().optional(),
  })
  .refine((r) => [r.roll, r.encounter, r.console_action, r.auto_tier].filter((x) => x !== undefined).length === 1, {
    message: 'a route needs exactly one of roll, encounter, console_action, auto_tier',
  });
export type Route = z.infer<typeof routeSchema>;

const beatSchema = z.strictObject({
  key: z.string(),
  act: z.number(),
  title: z.string(),
  goal: z.string(),
  objective: z.string(),
  trigger: z.enum(['comms', 'auto', 'arrival']),
  location: z.string().optional(),
  intro_text: textVariant,
  kin_notes: z.record(z.string(), z.string()).optional(),
  routes: z.array(routeSchema).min(1),
  outcomes: tierOutcomes,
  outro_text: textVariant.optional(),
  on_complete: z.array(effectSchema).default([]),
  prompt_ship_name: z.boolean().default(false),
  /** Shown on its own screen when this beat completes an act (via a complete_act effect). */
  act_end_text: textVariant.optional(),
  next: z.string().nullable(),
});
export type Beat = z.infer<typeof beatSchema>;

const passiveSchema = z.strictObject({ key: z.string(), name: z.string(), description: z.string() });

const startingKitSchema = z.strictObject({
  fuel: z.number().optional(),
  ore: z.number().optional(),
  supplies: z.number().optional(),
  hearthfire: z.number().optional(),
  hull: z.number().optional(),
  cargo_capacity: z.number().optional(),
  modules: z.partialRecord(moduleKey, z.number()).optional(),
  reputation: numRecord.optional(),
  relics: z.array(z.string()).optional(),
  reveal_systems: z.array(z.string()).optional(),
});
export type StartingKit = z.infer<typeof startingKitSchema>;

const bandPenalty = z.strictObject({ min: z.number(), state: z.string(), penalty: z.number() });
const hearthBand = z.strictObject({ min: z.number(), band: z.string(), modifier: z.number() });

export const configSchema = z.strictObject({
  DIE_TYPE: z.enum(['d20', 'd100']),
  DIFFICULTY: numRecord,
  TIER_CRIT_MARGIN: z.number(),
  TIER_PARTIAL_MARGIN: z.number(),
  NAT20_IS_CRIT: z.boolean(),
  NAT1_IS_FAILURE: z.boolean(),
  STARTING_STAT: z.number(),
  STAT_MAX: z.number(),
  ALLOW_BONUS_POINTS: z.boolean(),
  BONUS_POINTS: z.number(),
  BONUS_MAX_PER_STAT: z.number(),
  NAME_MIN_LENGTH: z.number(),
  NAME_MAX_LENGTH: z.number(),
  IRONKIN_GRIT_BONUS: z.number(),
  WEAR_MODE: z.enum(['ON_PUSH', 'CONSTANT']),
  WEAR_START: z.number(),
  WEAR_MAX: z.number(),
  WEAR_PER_ACTION: z.number(),
  WEAR_CONSTANT_PER_DAY: z.number(),
  WEAR_BANDS: z.array(bandPenalty),
  WEAR_PENALTY_STATS: z.array(statKey),
  WEAR_MAINTENANCE_SUPPLIES: z.number(),
  WEAR_MAINTENANCE_AMOUNT: z.number(),
  WEAR_MAINTENANCE_DIFFICULTY: difficulty,
  WORKSHOP_SUPPLY_DISCOUNT_PER_LEVEL: z.number(),
  LEVEL_CAP: z.number(),
  XP_PER_LEVEL_BASE: z.number(),
  STAT_POINTS_PER_LEVEL: z.number(),
  XP_BEAT: z.number(),
  XP_THREAD: z.number(),
  XP_FIGHT_BROKEN: z.number(),
  XP_FIGHT_NEGOTIATED: z.number(),
  XP_DISCOVERY: z.number(),
  XP_FAILED_ROLL: z.number(),
  STARTING_KIT: z.strictObject({
    fuel: z.number(),
    ore: z.number(),
    supplies: z.number(),
    hearthfire: z.number(),
    hull: z.number(),
    cargo_capacity: z.number(),
    module_level: z.number(),
  }),
  STARTING_CARGO: z.array(z.strictObject({ key: z.string(), qty: z.number() })),
  STARTING_CREW: z.array(z.string()),
  HEARTHFIRE_MAX: z.number(),
  HEARTHFIRE_BANDS: z.array(hearthBand),
  SUPPLIES_PER_CREW_PER_DAY: z.number(),
  STARVATION_HEARTHFIRE: z.number(),
  STARVATION_HEALTH: z.number(),
  HEALTH_REGEN_PER_DAY: z.number(),
  KIN_RECOVERY_MULTIPLIER: z.number(),
  HULL_REPAIR_ORE_PER_POINT: z.number(),
  TINKERS_EYE_REPAIR_DISCOUNT: z.number(),
  FATIGUE_DAYS: z.number(),
  FATIGUE_PENALTY: z.number(),
  MUTINY_DIFFICULTY: difficulty,
  MUTINY_BRIBE_ORE: z.number(),
  MUTINY_RESET_HEARTHFIRE: z.number(),
  DISTRESS_FUEL: z.number(),
  DISTRESS_OATH: z.string(),
  CONSOLE_ACTION_BONUS: z.number(),
  RELIC_EVALUATOR_SUBCLASS: z.string(),
  ODDS_SUBCLASS: z.string(),
  GRIZZGUT_GRUDGE: z.string(),
  GRIZZGUT_GRUDGE_AFTER: z.number(),
  COMBAT_STARTING_HEALTH_BASE: z.number(),
  COMBAT_HEALTH_PER_GRIT: z.number(),
  COMBAT_MATCHED_BONUS: z.number(),
  COMBAT_BAD_MATCHUP_PENALTY: z.number(),
  COMBAT_ADVANTAGE_BONUS: z.number(),
  COMBAT_DAMAGE_TABLE: z.strictObject({
    critical: z.tuple([z.number(), z.number()]),
    success: z.tuple([z.number(), z.number()]),
    partial: z.tuple([z.number(), z.number()]),
    failure: z.tuple([z.number(), z.number()]),
  }),
  COMBAT_ATTACK_DEALT_BONUS: z.number(),
  COMBAT_ATTACK_TAKEN_PENALTY: z.number(),
  COMBAT_DEFEND_REDUCTION: z.number(),
  COMBAT_WEAR_PER_HEALTH_DAMAGE: z.number(),
  HOLD_THE_LINE_REDUCTION: z.number(),
  PLATED_BULWARK_REDUCTION: z.number(),
  PLATED_BULWARK_WEAR_PER_HIT: z.number(),
  SHARP_SENSES_READ_BONUS: z.number(),
  SENSOR_SUITE_READ_BONUS: z.number(),
  NEGOTIATE_FAILURE_ENEMY_BONUS: z.number(),
  SHIP_BASE_REACTOR_PIPS: z.number(),
  SHIP_BASE_HULL: z.number(),
  MODULE_CAP_BASE: z.number(),
  REACTOR_PIPS_PER_LEVEL: z.number(),
  MODULE_MAX_LEVEL: z.number(),
  SHIP_CRIT_MULTIPLIER: z.number(),
  SHIP_FAILURE_EXTRA_DAMAGE: z.number(),
  DEFEAT_ORE_LOSS_RANGE: z.tuple([z.number(), z.number()]),
  DEFEAT_ORE_FLOOR: z.number(),
  DEFEAT_HEARTHFIRE_LOSS: z.number(),
  DEFEAT_CREW_LOSS_CHANCE: z.number(),
  DEFEAT_CARGO_LOSS_FRACTION: z.number(),
  DEFEAT_WEAR_SUPPLIES_COST: z.number(),
  DEFEAT_RESTORE_FRACTION: z.number(),
  DEFEAT_WEAR_RESET: z.number(),
  DEFEAT_GRACE: z.boolean(),
  PERMADEATH: z.boolean(),
  WAAAGH_START: z.number(),
  WAAAGH_PER_JOURNEY: z.number(),
  WAAAGH_PER_FAILED_BEAT: z.number(),
  WAAAGH_PER_WARBAND_BROKEN: z.number(),
  WAAAGH_LAUNCH: z.number(),
  THREADS_REQUIRED: z.number(),
  BEATS_PER_THREAD: z.number(),
  ORK_TONE: z.enum(['GRIM_FUNNY', 'GRIM']),
  ALLOW_SHIP_NAMING: z.boolean(),
  DEFAULT_SHIP_NAME: z.string(),
  SHIP_NAME_MAX_LENGTH: z.number(),
  CAMPAIGN_LENGTH: z.enum(['SHORT', 'MEDIUM', 'LONG']),
  ALLOW_POST_GAME: z.boolean(),
  START_SYSTEM: z.string(),
  START_DAY: z.number(),
  FIRST_MESSAGE: z.string(),
  SAVE_SLOTS: z.number(),
});
export type Config = z.infer<typeof configSchema>;

const intents = z.strictObject({ aggressive: z.number(), guarded: z.number(), evasive: z.number() });
const systemsAlloc = z.strictObject({ weapons: z.number(), shields: z.number(), engines: z.number() });
const encounterOutcome = z.strictObject({
  text: textVariant,
  effects: z.array(effectSchema).default([]),
  overrides_default_costs: z.boolean().optional(),
});

export const gameDataSchema = z.strictObject({
  config: configSchema,
  stats: z.array(z.strictObject({ key: statKey, display_name: z.string(), governs: z.string() })),
  kin_types: z.array(
    z.strictObject({
      key: kinTypeSchema,
      display_name: z.string(),
      summary: z.string(),
      perks: z.array(z.strictObject({ name: z.string(), description: z.string() })),
      drawbacks: z.array(z.strictObject({ name: z.string(), description: z.string() })),
    }),
  ),
  base_classes: z.array(
    z.strictObject({
      key: baseClassSchema,
      display_name: z.string(),
      theme: z.string(),
      stat_bonus: z.partialRecord(statKey, z.number()),
      kin_passive: passiveSchema,
      ironkin_passive: passiveSchema,
    }),
  ),
  subclasses: z.array(
    z.strictObject({
      key: z.string(),
      display_name: z.string(),
      base_class: baseClassSchema,
      focus_stats: z.array(statKey).min(1),
      console_action: z.strictObject({
        name: z.string(),
        description: z.string(),
        ironkin_variant: z.strictObject({ description: z.string(), wear_cost: z.number().optional() }).optional(),
      }),
      trait: z.strictObject({ name: z.string(), description: z.string() }),
      starting_kit: startingKitSchema.default({}),
    }),
  ),
  systems: z.array(
    z.strictObject({
      key: z.string(),
      display_name: z.string(),
      description: z.string(),
      port: z.boolean(),
      faction: z.string(),
      danger: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      hidden: z.boolean(),
      connections: z.array(z.strictObject({ to: z.string(), days: z.number().min(1), fuel: z.number().min(0) })),
    }),
  ),
  factions: z.array(
    z.strictObject({
      key: z.string(),
      display_name: z.string(),
      starting_reputation: z.number(),
      ironkin_modifier: z.number(),
      tracked: z.boolean(),
    }),
  ),
  crew: z.array(
    z.strictObject({
      key: z.string(),
      display_name: z.string(),
      kin_type: kinTypeSchema,
      role: z.string(),
      bio: z.string(),
      trait: z.strictObject({ name: z.string(), description: z.string() }),
      repair_discount: z.number(),
      roll_modifiers: z.array(z.strictObject({ stat: statKey, value: z.number() })),
      protected: z.boolean(),
    }),
  ),
  items: z.array(z.strictObject({ key: z.string(), display_name: z.string(), mission: z.boolean() })),
  relics: z.array(
    z.strictObject({
      key: z.string(),
      display_name: z.string(),
      unidentified_name: z.string(),
      benefit: z.string(),
      drawback: z.string(),
    }),
  ),
  oaths: z.array(
    z.strictObject({
      key: z.string(),
      title: z.string(),
      giver: z.string(),
      terms: z.string(),
      reward_text: z.string(),
      penalty_text: z.string(),
      can_fail: z.boolean(),
      deadline_days: z.number().nullable(),
      fulfil: z.strictObject({ ore: z.number() }).nullable(),
      on_keep: z.array(effectSchema),
      on_break: z.array(effectSchema),
    }),
  ),
  grudges: z.array(
    z.strictObject({ key: z.string(), title: z.string(), against: z.string(), description: z.string() }),
  ),
  messages: z.array(
    z.strictObject({
      key: z.string(),
      from: z.string(),
      subject: z.string(),
      body: textVariant,
      beat: z.string().optional(),
    }),
  ),
  lore: z.array(z.strictObject({ key: z.string(), title: z.string(), text: z.string() })),
  enemies: z.array(
    z.strictObject({
      key: z.string(),
      display_name: z.string(),
      resolve: z.number().min(1),
      defense_difficulty: z.number(),
      damage_bonus: z.number(),
      read_difficulty: z.number(),
      intent_weights: intents,
      negotiable: z.boolean(),
      negotiation_difficulty: z.number(),
      telegraphs: z.strictObject({
        aggressive: z.array(z.string()).min(1),
        guarded: z.array(z.string()).min(1),
        evasive: z.array(z.string()).min(1),
      }),
    }),
  ),
  enemy_ships: z.array(
    z.strictObject({
      key: z.string(),
      display_name: z.string(),
      hull: z.number().min(1),
      reactor_pips: z.number(),
      allocation_weights: systemsAlloc,
      system_caps: systemsAlloc,
      defense_difficulty: z.number(),
    }),
  ),
  combat_encounters: z.array(
    z.strictObject({
      key: z.string(),
      mode: z.enum(['personal', 'ship']),
      intro: z.string(),
      enemies: z.array(z.string()).min(1),
      outcomes: z.strictObject({
        victory_broken: encounterOutcome,
        victory_negotiated: encounterOutcome.optional(),
        defeat: encounterOutcome,
        withdrew: encounterOutcome.optional(),
      }),
    }),
  ),
  story_beats: z.array(beatSchema),
});
export type GameData = z.infer<typeof gameDataSchema>;

/** Validates raw JSON and checks every cross-file reference. Throws one error listing all problems. */
export function validateGameData(raw: unknown): GameData {
  const parsed = gameDataSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Game data failed validation:\n${lines.join('\n')}`);
  }
  const data = parsed.data;
  const errors = crossReferenceErrors(data);
  if (errors.length) throw new Error(`Game data has broken references:\n${errors.join('\n')}`);
  return data;
}

export function crossReferenceErrors(d: GameData): string[] {
  const errors: string[] = [];
  const keys = (list: { key: string }[]) => new Set(list.map((x) => x.key));
  const sets = {
    subclass: keys(d.subclasses),
    system: keys(d.systems),
    faction: keys(d.factions),
    crew: keys(d.crew),
    item: keys(d.items),
    relic: keys(d.relics),
    oath: keys(d.oaths),
    grudge: keys(d.grudges),
    message: keys(d.messages),
    lore: keys(d.lore),
    enemy: keys(d.enemies),
    ship: keys(d.enemy_ships),
    encounter: keys(d.combat_encounters),
    beat: keys(d.story_beats),
  };
  const need = (set: Set<string>, key: string | undefined, where: string, kind: string) => {
    if (key !== undefined && !set.has(key)) errors.push(`${where}: unknown ${kind} "${key}"`);
  };
  const diff = (value: string | number, where: string) => {
    if (typeof value === 'string' && d.config.DIFFICULTY[value] === undefined)
      errors.push(`${where}: unknown difficulty name "${value}"`);
  };
  const checkEffects = (effects: Effect[], where: string) => {
    for (const e of effects) {
      for (const f of Object.keys(e.reputation ?? {})) need(sets.faction, f, where, 'faction');
      need(sets.oath, e.create_oath, where, 'oath');
      need(sets.oath, e.keep_oath, where, 'oath');
      need(sets.oath, e.break_oath, where, 'oath');
      need(sets.grudge, e.create_grudge, where, 'grudge');
      need(sets.grudge, e.settle_grudge, where, 'grudge');
      need(sets.message, e.add_message, where, 'message');
      need(sets.crew, e.add_crew, where, 'crew');
      need(sets.crew, e.remove_crew, where, 'crew');
      need(sets.item, e.add_cargo?.key, where, 'item');
      need(sets.relic, e.add_relic, where, 'relic');
      need(sets.system, e.reveal_system, where, 'system');
      need(sets.lore, e.lore, where, 'lore');
    }
  };

  // Difficulty names must cover the ladder used by the roll resolver.
  diff(d.config.WEAR_MAINTENANCE_DIFFICULTY, 'config.WEAR_MAINTENANCE_DIFFICULTY');
  diff(d.config.MUTINY_DIFFICULTY, 'config.MUTINY_DIFFICULTY');
  need(sets.system, d.config.START_SYSTEM, 'config.START_SYSTEM', 'system');
  need(sets.message, d.config.FIRST_MESSAGE, 'config.FIRST_MESSAGE', 'message');
  for (const c of d.config.STARTING_CARGO) need(sets.item, c.key, 'config.STARTING_CARGO', 'item');
  for (const c of d.config.STARTING_CREW) need(sets.crew, c, 'config.STARTING_CREW', 'crew');
  need(sets.oath, d.config.DISTRESS_OATH, 'config.DISTRESS_OATH', 'oath');
  need(sets.subclass, d.config.RELIC_EVALUATOR_SUBCLASS, 'config.RELIC_EVALUATOR_SUBCLASS', 'subclass');
  need(sets.subclass, d.config.ODDS_SUBCLASS, 'config.ODDS_SUBCLASS', 'subclass');
  need(sets.grudge, d.config.GRIZZGUT_GRUDGE, 'config.GRIZZGUT_GRUDGE', 'grudge');

  for (const s of d.subclasses) {
    if (!d.base_classes.some((b) => b.key === s.base_class))
      errors.push(`subclass ${s.key}: unknown base class "${s.base_class}"`);
    for (const r of s.starting_kit.relics ?? []) need(sets.relic, r, `subclass ${s.key}`, 'relic');
    for (const r of s.starting_kit.reveal_systems ?? []) need(sets.system, r, `subclass ${s.key}`, 'system');
    for (const f of Object.keys(s.starting_kit.reputation ?? {})) need(sets.faction, f, `subclass ${s.key}`, 'faction');
  }

  for (const s of d.systems) {
    need(sets.faction, s.faction, `system ${s.key}`, 'faction');
    for (const c of s.connections) {
      need(sets.system, c.to, `system ${s.key}`, 'system');
      const back = d.systems.find((o) => o.key === c.to)?.connections.find((o) => o.to === s.key);
      if (!back) errors.push(`system ${s.key}: connection to ${c.to} has no return route`);
    }
  }

  // Ship power must always be spendable: total caps at level 1 >= base reactor pips.
  const capAtLevel1 = 3 * (d.config.MODULE_CAP_BASE + 1);
  if (capAtLevel1 < d.config.SHIP_BASE_REACTOR_PIPS)
    errors.push('config: module caps at level 1 cannot hold the base reactor pips');
  const maxPips = d.config.SHIP_BASE_REACTOR_PIPS + (d.config.MODULE_MAX_LEVEL - 1) * d.config.REACTOR_PIPS_PER_LEVEL;
  if (capAtLevel1 < maxPips) errors.push('config: module caps at level 1 cannot hold the max reactor pips');
  for (const s of d.enemy_ships) {
    const caps = s.system_caps.weapons + s.system_caps.shields + s.system_caps.engines;
    if (caps < s.reactor_pips) errors.push(`enemy ship ${s.key}: caps cannot hold its reactor pips`);
  }

  for (const o of d.oaths) {
    checkEffects(o.on_keep, `oath ${o.key}.on_keep`);
    checkEffects(o.on_break, `oath ${o.key}.on_break`);
  }
  for (const m of d.messages) need(sets.beat, m.beat, `message ${m.key}`, 'beat');

  for (const enc of d.combat_encounters) {
    for (const e of enc.enemies) need(enc.mode === 'personal' ? sets.enemy : sets.ship, e, `encounter ${enc.key}`, 'enemy');
    for (const [name, o] of Object.entries(enc.outcomes)) if (o) checkEffects(o.effects, `encounter ${enc.key}.${name}`);
    const negotiable = enc.mode === 'personal' && enc.enemies.some((e) => d.enemies.find((x) => x.key === e)?.negotiable);
    if (negotiable && !enc.outcomes.victory_negotiated)
      errors.push(`encounter ${enc.key}: has a negotiable enemy but no victory_negotiated outcome`);
  }

  for (const b of d.story_beats) {
    const where = `beat ${b.key}`;
    if (b.next !== null) need(sets.beat, b.next, where, 'beat');
    need(sets.system, b.location, where, 'system');
    if (b.trigger === 'arrival' && !b.location) errors.push(`${where}: arrival beats need a location`);
    if (!b.routes.some((r) => r.requirements.length === 0))
      errors.push(`${where}: needs at least one route with no requirements (the fallback)`);
    checkEffects(b.on_complete, `${where}.on_complete`);
    for (const t of tierSchema.options) checkEffects(b.outcomes[t].effects, `${where}.outcomes.${t}`);
    for (const r of b.routes) {
      const rw = `${where}.${r.key}`;
      need(sets.encounter, r.encounter, rw, 'encounter');
      if (r.roll) diff(r.roll.difficulty, rw);
      if (r.console_action) diff(r.console_action.difficulty, rw);
      checkEffects(r.effects_always, rw);
      for (const req of r.requirements) {
        need(sets.subclass, req.subclass, rw, 'subclass');
        need(sets.faction, req.reputation?.faction, rw, 'faction');
        need(sets.system, req.location, rw, 'system');
      }
    }
  }
  return errors;
}
