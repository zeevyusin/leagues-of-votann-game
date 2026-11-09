// Schemas for every data file, plus cross-reference checks.
// Data that fails validation stops the game at load time with a readable error.
import { z } from 'zod';

export const STAT_KEYS = ['grit', 'craft', 'wits', 'silver_tongue', 'nerve'] as const;
export const statKey = z.enum(STAT_KEYS);
export const genderSchema = z.enum(['MALE', 'FEMALE']);
export const kinTypeSchema = z.enum(['KIN', 'IRONKIN']);
export const baseClassSchema = z.enum(['WARRIOR', 'PATHFINDER', 'ARTIFICER', 'SPEAKER']);
export const tierSchema = z.enum(['critical', 'success', 'partial', 'failure']);
export const MODULE_KEYS = ['engine', 'shields', 'weapons', 'reactor', 'cargo_hold', 'scanner', 'workshop', 'armour'] as const;
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
  /** Makes beats playable (they start on arrival at their system, or from Comms). */
  activate_beat: z.union([z.string(), z.array(z.string())]).optional(),
  deactivate_beat: z.string().optional(),
  remove_cargo: z.strictObject({ key: z.string(), qty: z.number() }).optional(),
  /** Finishes an Act 2 thread: grants its reward and thread XP. */
  complete_thread: z.string().optional(),
  /** Grants an Act 3 story reward directly (for rewards outside a thread's main one). */
  story_reward: z.string().optional(),
  /** Upgrades a ship module by one level (capped). */
  upgrade_module: moduleKey.optional(),
  /** Adds to numeric story flags (missing flags count as 0). */
  inc_flag: numRecord.optional(),
  /** A roll modifier for the next fight: for its first `rolls` rolls, or the whole fight if omitted. */
  next_fight: z.strictObject({ label: z.string(), value: z.number(), rolls: z.number().optional() }).optional(),
  /** Moves the ship to a system at once, with no travel time or Fuel (Act 3 only). */
  move_to: z.string().optional(),
  /** Finishes a post-game quest (story.md 7.7). */
  complete_quest: z.string().optional(),
  /** Makes a system the fleet's home port, with a market (A New Hearth). */
  set_home_port: z.string().optional(),
  set_core_choice: z.enum(['RETURNED', 'KEPT', 'DESTROYED']).optional(),
});
export type Effect = z.infer<typeof effectSchema>;

export const requirementSchema = z.strictObject({
  base_class: baseClassSchema.optional(),
  subclass: z.string().optional(),
  kin_type: kinTypeSchema.optional(),
  stat: z.strictObject({ name: statKey, min: z.number() }).optional(),
  reputation: z.strictObject({ faction: z.string(), min: z.number() }).optional(),
  flag: z.string().optional(),
  not_flag: z.string().optional(),
  location: z.string().optional(),
  has_cargo: z.string().optional(),
  ore: z.number().optional(),
  supplies: z.number().optional(),
  crew: z.string().optional(),
  story_reward: z.string().optional(),
  hrolla_status: z.enum(['FREE', 'CAPTIVE', 'RESCUED', 'LOST']).optional(),
  waaagh_min: z.number().optional(),
  not_story_reward: z.string().optional(),
  /** A story flag with an exact value. */
  flag_is: z.strictObject({ key: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }).optional(),
  hearthfire_max: z.number().optional(),
  /** A grudge in the Logbook (active or settled). */
  grudge: z.string().optional(),
  lore: z.string().optional(),
  /** The Hold's fate from the ending (post-game only). */
  hold_fate: z.enum(['UNBROKEN', 'SCARRED', 'EVACUATED']).optional(),
  core_status: z.enum(['IN_VAULT', 'STOLEN', 'RECOVERED', 'DESTROYED', 'LOST']).optional(),
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
    /** Overrides the beat's `next` when this route is taken. */
    next: z.string().optional(),
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
  /** 'event' beats are travel events: picked at random on arrival, never part of the main story. */
  trigger: z.enum(['comms', 'auto', 'arrival', 'event']),
  location: z.string().optional(),
  /** Act 2 thread this beat belongs to (A to D). */
  thread: z.string().optional(),
  /** Travel event settings (trigger 'event' only). */
  event: z
    .strictObject({
      weight: z.number().min(0),
      dangers: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH'])).min(1),
      requirements: z.array(requirementSchema).default([]),
      /** Combat events are skipped during the post-defeat grace journey. */
      combat: z.boolean().default(false),
      /** Ork events get more likely as the Waaagh! grows. */
      ork: z.boolean().default(false),
      once: z.boolean().default(false),
    })
    .optional(),
  intro_text: textVariant,
  kin_notes: z.record(z.string(), z.string()).optional(),
  routes: z.array(routeSchema).min(1),
  outcomes: tierOutcomes,
  outro_text: textVariant.optional(),
  on_complete: z.array(effectSchema).default([]),
  prompt_ship_name: z.boolean().default(false),
  /** Arrival beats from Act 2 on can be put off until the next visit unless this is false. */
  deferrable: z.boolean().optional(),
  /** Shown on its own screen when this beat completes an act (via a complete_act effect). */
  act_end_text: textVariant.optional(),
  /** The beat is skipped (the story moves to its `next`) unless these are met. */
  only_if: z.array(requirementSchema).default([]),
  /** XP for completing the beat; defaults to XP_BEAT. */
  xp: z.number().optional(),
  /** Post-game quest this beat belongs to (story.md 7.7). */
  quest: z.string().optional(),
  /** A lost or escaped fight leaves the beat waiting, to be tried again on the next visit. */
  retry_on_defeat: z.boolean().default(false),
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

/** What an equipped relic does (game-overview.md 6.3.1). Fields add up across equipped relics. */
const relicEffectSchema = z.strictObject({
  /** Only for this kin type. */
  kin_type: kinTypeSchema.optional(),
  /** A roll modifier: on one stat (or every roll), in some contexts (or all). */
  roll: z.number().optional(),
  stat: statKey.optional(),
  contexts: z.array(z.enum(['story', 'personal', 'ship'])).optional(),
  negotiate: z.number().optional(),
  read: z.number().optional(),
  reactor_pips: z.number().optional(),
  shields_cap: z.number().optional(),
  fuel_per_journey: z.number().optional(),
  event_chance: z.number().optional(),
  /** Multiplies the weight of Ork travel events. */
  ork_event_weight: z.number().optional(),
  hearthfire_per_journey: z.number().optional(),
  wear_per_journey: z.number().optional(),
  /** Applied on equip and taken back on unequip. */
  reputation: numRecord.optional(),
  /** Extra share of reputation from kept oaths (0.25 = +25%). */
  oath_reputation_bonus: z.number().optional(),
  /** Multiplies Hearthfire lost when an oath is broken. */
  broken_oath_hearthfire_multiplier: z.number().optional(),
});
export type RelicEffect = z.infer<typeof relicEffectSchema>;

/** How a console action works inside a fight (combat-system.md, Phase 2). */
const combatActionSchema = z.strictObject({
  modes: z.array(z.enum(['personal', 'ship'])),
  fight_bonus: z.number().optional(),
  next_rolls_bonus: z.number().optional(),
  next_rolls_count: z.number().optional(),
  negotiate_bonus: z.number().optional(),
  reveal: z.boolean().optional(),
  instant_damage: z.number().optional(),
  heal_hull: z.number().optional(),
  health_cost: z.number().optional(),
  hearthfire: z.number().optional(),
  wear: z.number().optional(),
  auto_withdraw: z.boolean().optional(),
  victory_hearthfire: z.number().optional(),
  defeat_hearthfire: z.number().optional(),
});
export type CombatAction = z.infer<typeof combatActionSchema>;

const traitCombatSchema = z.strictObject({
  defend_reduction: z.number().optional(),
  no_defeat_hearthfire: z.boolean().optional(),
  tag_bonus: numRecord.optional(),
  defend_advantage: z.boolean().optional(),
  ship_damage_reduction: z.number().optional(),
  victory_ore_multiplier: z.number().optional(),
});

const bandPenalty = z.strictObject({ min: z.number(), state: z.string(), penalty: z.number() });
const hearthBand = z.strictObject({ min: z.number(), band: z.string(), modifier: z.number() });

/** One level of The Ancestors' Eye, the difficulty setting. */
const eyeLevelSchema = z.strictObject({
  name: z.string(),
  summary: z.string(),
  /** Added to every roll the player makes. */
  roll: z.number(),
  /** Added to reading an enemy in personal combat, on top of roll. */
  read: z.number(),
  /** Added to FATIGUE_DAYS. */
  fatigue_days: z.number(),
  /** Multiplies the Supplies the crew eats each day. */
  supplies_multiplier: z.number().positive(),
});
export const ancestorsEyeSchema = z.enum(['FAVOURED', 'WEIGHED', 'JUDGED']);

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
  ANCESTORS_EYE: z.strictObject({ FAVOURED: eyeLevelSchema, WEIGHED: eyeLevelSchema, JUDGED: eyeLevelSchema }),
  DEFAULT_ANCESTORS_EYE: ancestorsEyeSchema,
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
  ALLOW_SHIP_NAMING: z.boolean(),
  DEFAULT_SHIP_NAME: z.string(),
  SHIP_NAME_MAX_LENGTH: z.number(),
  CAMPAIGN_LENGTH: z.enum(['SHORT', 'MEDIUM', 'LONG']),
  ALLOW_POST_GAME: z.boolean(),
  START_SYSTEM: z.string(),
  START_DAY: z.number(),
  FIRST_MESSAGE: z.string(),
  SAVE_SLOTS: z.number(),

  XP_EVENT: z.number(),
  FUEL_MAX: z.number(),
  SUPPLIES_MAX: z.number(),
  WAAAGH_BANDS: z.array(
    z.strictObject({
      min: z.number(),
      band: z.string(),
      ork_event_weight: z.number(),
      event_chance_bonus: z.number(),
      price_multiplier: z.number(),
      warning: z.string().optional(),
    }),
  ),
  TRAVEL_EVENT_CHANCE: z.strictObject({ LOW: z.number(), MEDIUM: z.number(), HIGH: z.number() }),
  SAFE_ROUTE_EVENT_MULTIPLIER: z.number(),
  SAFE_ROUTE_FUEL_SAVING: z.number(),
  SAFE_ROUTE_SUBCLASS: z.string(),
  MODULE_UPGRADE_COST: z.record(z.string(), z.number()),
  CARGO_CAPACITY_PER_HOLD_LEVEL: z.number(),
  RELIC_SLOTS: z.number(),
  RELIC_IDENTIFY_ORE: z.number(),
  ARMOUR_HULL_PER_LEVEL: z.number(),
  REPUTATION_DISCOUNT_AT: z.number(),
  REPUTATION_DISCOUNT: z.number(),
  REPUTATION_SURCHARGE_BELOW: z.number(),
  REPUTATION_SURCHARGE: z.number(),
  FEAST_COST: z.number(),
  FEAST_HEARTHFIRE: z.number(),
  FEAST_HEARTHFIRE_IRONKIN: z.number(),
  WITHDRAW_ENABLED: z.boolean(),
  MISLEAD_CHANCE: z.number(),
  LEVERAGE_BONUS: z.number(),
  LEVERAGE_MAX: z.number(),
  HARDENED_NEGOTIATION_PENALTY: z.number(),
  INJURY_HIT_THRESHOLD: z.number(),
  INJURY_MAX: z.number(),
  INJURY_REST_DAYS: z.number(),
  INJURY_REPAIR_ORE: z.number(),
  RANGE_CLOSE_DAMAGE: z.number(),
  RANGE_LONG_DAMAGE: z.number(),
  RANGE_LONG_WITHDRAW: z.number(),
  TARGET_DIFFICULTY: z.number(),
  TARGET_PIPS_SUCCESS: z.number(),
  TARGET_PIPS_CRIT: z.number(),
  DUEL_HABIT_WEIGHT: z.number(),
  DUEL_ADAPT_AFTER: z.number(),
  DUEL_WITNESS_HEARTHFIRE: z.number(),
  DUEL_WITNESS_REPUTATION: z.number(),
  BATTLE_OATH_KEPT_HEARTHFIRE: z.number(),
  BATTLE_OATH_BROKEN_HEARTHFIRE: z.number(),
  BATTLE_OATH_KEPT_REPUTATION: z.number(),
  BATTLE_OATH_BROKEN_REPUTATION: z.number(),
  BATTLE_OATH_FACTION: z.string(),
  HOLD_SCARRED_AT: z.number(),
  ACT3_MUSTER_PORTS: z.array(z.string()).min(1),
  ACT3_RALLY_SYSTEM: z.string(),
  ACT3_FIRST_BEAT: z.string(),
  ACT3_LAUNCH_BEAT: z.string(),
  ACT3_WAVE_HULL_SCALE: z.strictObject({ scattered: z.number(), gathering: z.number(), rising: z.number(), launched: z.number() }),
  SUPERWEAPON_DAMAGE: z.number(),
  POST_GAME_START: z.strictObject({ UNBROKEN: z.string(), SCARRED: z.string(), EVACUATED: z.string() }),
  DOCK_WORK_DAYS: z.number(),
  DOCK_WORK_ORE: z.number(),
  ACT2_THREAD_MESSAGES: z.array(z.string()),
});
export type Config = z.infer<typeof configSchema>;

const intents = z.strictObject({ aggressive: z.number(), guarded: z.number(), evasive: z.number() });
const systemsAlloc = z.strictObject({ weapons: z.number(), shields: z.number(), engines: z.number() });
const encounterOutcome = z.strictObject({
  text: textVariant,
  effects: z.array(effectSchema).default([]),
  overrides_default_costs: z.boolean().optional(),
});

const priceList = z.record(z.string(), z.number());
const rangeBand = z.enum(['close', 'medium', 'long']);

/** Ending pieces (story.md section 7): one text per result, picked by the ending builder. */
const endingsSchema = z.strictObject({
  warboss: z.record(z.string(), textVariant),
  skragnak_fate: z.record(z.string(), textVariant),
  grudge: z.record(z.string(), textVariant),
  hold: z.record(z.string(), textVariant),
  core: z.record(z.string(), textVariant),
  grizzgut: z.record(z.string(), textVariant),
  /** Per crew member: text when they are aboard, lost in Act 3, or sent away. */
  crew: z.record(z.string(), z.strictObject({ aboard: textVariant, lost: textVariant.optional(), sent_away: textVariant.optional() })),
  /** One line per subclass. */
  stakes: z.record(z.string(), textVariant),
  /** Story oaths settled by the epilogue: kept when the requirements are met, broken otherwise. */
  oaths: z.array(z.strictObject({ oath: z.string(), keep_if: z.array(requirementSchema).default([]) })),
  rally_lines: z.array(z.strictObject({ requirements: z.array(requirementSchema), text: textVariant })),
  /** Shown once every post-game quest open to this run is done. */
  saga_complete: textVariant,
  ylsa_warning: textVariant,
  free_roam: textVariant,
});
export type Endings = z.infer<typeof endingsSchema>;

/** An art ID is the file name of a PNG in public/art/. */
const artId = z.string().regex(/^[a-z0-9_]+$/);

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
        combat: combatActionSchema.optional(),
        /** Ironkin overrides for the combat effect (merged over `combat`). */
        combat_ironkin: combatActionSchema.partial().optional(),
        /** Market use: price improvement for the rest of the visit, once per visit. */
        market_haggle: z.number().optional(),
      }),
      trait: z.strictObject({
        name: z.string(),
        description: z.string(),
        combat: traitCombatSchema.optional(),
        market_sell_bonus: z.number().optional(),
        market_upgrade_discount: z.number().optional(),
      }),
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
      /** Position on the Nav star map, in a 650 by 240 space (graphics.md 7.1). */
      map: z.strictObject({ x: z.number(), y: z.number() }),
      /** The port refuses to dock ships once the Waaagh! meter reaches this value. */
      closes_at_waaagh: z.number().optional(),
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
      /** Safe from every loss until Act 3 (Ylsa, story.md 9.1). */
      act3_risk: z.boolean().default(false),
      /** Hearthline commitment: once per fight, changes the current round (combat-system.md Phase 3). */
      commitment: z
        .strictObject({
          name: z.string(),
          description: z.string(),
          modes: z.array(z.enum(['personal', 'ship'])).min(1),
          roll: z.number().optional(),
          heal_hull: z.number().optional(),
          resolve_on_hit: z.number().optional(),
          victory_hearthfire: z.number().optional(),
        })
        .optional(),
    }),
  ),
  /** Sworn in round 1 of a fight for a bonus (combat-system.md Phase 3). */
  battle_oaths: z.array(
    z.strictObject({
      key: z.string(),
      name: z.string(),
      description: z.string(),
      all_rolls: z.number().default(0),
      negotiate: z.number().default(0),
      crit_resolve: z.number().default(0),
      breaks_on: z.enum(['withdraw_or_defeat', 'forced_victory', 'below_half']),
    }),
  ),
  items: z.array(
    z.strictObject({ key: z.string(), display_name: z.string(), mission: z.boolean(), value: z.number().min(0) }),
  ),
  relics: z.array(
    z.strictObject({
      key: z.string(),
      display_name: z.string(),
      unidentified_name: z.string(),
      benefit: z.string(),
      drawback: z.string(),
      /** What a market pays for it. */
      value: z.number().min(0),
      /** Mission relics cannot be sold. */
      mission: z.boolean().default(false),
      /** Known relics arrive already identified. */
      known: z.boolean().default(false),
      benefit_effects: z.array(relicEffectSchema).default([]),
      drawback_effects: z.array(relicEffectSchema).default([]),
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
      /** ore: pay at any port. deliver: kept automatically when docking at `system` with the cargo. */
      fulfil: z
        .union([
          z.strictObject({ ore: z.number() }),
          z.strictObject({ deliver: z.strictObject({ item: z.string(), qty: z.number(), system: z.string() }) }),
        ])
        .nullable(),
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
      /** Applied once, when the message arrives in the inbox. */
      on_receive: z.array(effectSchema).default([]),
      /** A job offer: accepting runs `on_accept` (usually creating an oath and activating a beat). */
      job: z
        .strictObject({
          ports: z.array(z.string()).min(1),
          requirements: z.array(requirementSchema).default([]),
          on_accept: z.array(effectSchema),
          reward_text: z.string(),
        })
        .optional(),
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
      /** Can show a false intent on a vague read (combat-system.md 3.2). */
      deceptive: z.boolean().default(false),
      /** Harder to negotiate with unless the player has leverage (combat-system.md 3.6). */
      hardened: z.boolean().default(false),
      leverage: z
        .array(z.strictObject({ text: z.string(), requirements: z.array(requirementSchema).default([]), scan: z.boolean().optional() }))
        .default([]),
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
      preferred_range: rangeBand.default('medium'),
    }),
  ),
  combat_encounters: z.array(
    z.strictObject({
      key: z.string(),
      mode: z.enum(['personal', 'ship']),
      intro: z.string(),
      enemies: z.array(z.string()).min(1),
      /** e.g. 'cramped', 'surface', 'boarding': trait bonuses key off these. */
      tags: z.array(z.string()).default([]),
      allow_withdraw: z.boolean().default(false),
      /** No escape at all, not even a charted one (Act 3, duels). */
      inescapable: z.boolean().default(false),
      /** A witnessed one-on-one duel (combat-system.md Phase 3). */
      duel: z.boolean().default(false),
      witness_faction: z.string().optional(),
      /** Ship fights: a personal encounter offered as "Board her" once the enemy is disabled. */
      boarding: z.string().optional(),
      /** Gitzbolt's weapon fires every round until disabled. */
      superweapon: z.boolean().default(false),
      /** Enemy Hull scales with the Waaagh! band (ACT3_WAVE_HULL_SCALE). */
      waaagh_scaling: z.boolean().default(false),
      start_range: rangeBand.optional(),
      /** On defeat at Low Hearthfire, this crew member (or any unprotected one, for "ANY") is lost. */
      crew_risk: z.string().optional(),
      /** Applied at the start of the fight when their requirements are met. */
      modifiers: z
        .array(
          z.strictObject({
            requirements: z.array(requirementSchema),
            text: z.string(),
            roll_bonus: z.number().optional(),
            enemy_damage: z.number().optional(),
            enemy_scale: z.number().optional(),
          }),
        )
        .default([]),
      outcomes: z.strictObject({
        victory_broken: encounterOutcome,
        victory_negotiated: encounterOutcome.optional(),
        defeat: encounterOutcome,
        withdrew: encounterOutcome.optional(),
      }),
    }),
  ),
  story_beats: z.array(beatSchema),
  story_threads: z.array(
    z.strictObject({
      key: z.string(),
      title: z.string(),
      reward: z.string(),
      reward_text: z.string(),
      beats: z.array(z.string()).min(1),
    }),
  ),
  /** One-off story screens such as "Act 3 unlocked". */
  act_events: z.array(z.strictObject({ key: z.string(), title: z.string(), text: textVariant })),
  injuries: z.array(
    z.strictObject({ key: z.string(), name: z.string(), ironkin_name: z.string(), stat: statKey, value: z.number() }),
  ),
  endings: endingsSchema,
  /** Post-game quest chains (story.md 7.7): offered at free roam when their requirements are met. */
  post_quests: z.array(
    z.strictObject({
      key: z.string(),
      title: z.string(),
      requirements: z.array(requirementSchema).default([]),
      /** Comms message sent when free roam starts. */
      message: z.string(),
      beats: z.array(z.string()).min(1),
      reward_text: z.string(),
    }),
  ),
  markets: z.array(
    z.strictObject({
      port: z.string(),
      buy_multiplier: z.number(),
      sell_multiplier: z.number(),
      fuel_price: z.number().nullable(),
      supplies_price: z.number().nullable(),
      upgrades: z.array(moduleKey),
      /** Goods this port sells, with its base price. */
      sells: priceList,
      /** Per-item multiplier on what this port pays (missing = 1). */
      buys: priceList,
      feast: z.boolean(),
      /** The port identifies relics for RELIC_IDENTIFY_ORE. */
      identify_relics: z.boolean().default(false),
      rumors: z.array(
        z.strictObject({
          key: z.string(),
          label: z.string(),
          price: z.number(),
          requirements: z.array(requirementSchema).default([]),
          effects: z.array(effectSchema),
          text: z.string(),
        }),
      ),
    }),
  ),
  /** Art IDs for each message sender, enemy and enemy ship (graphics.md 6.2). Anything left out shows no image. */
  art: z.strictObject({
    senders: z.record(z.string(), artId),
    enemies: z.record(z.string(), artId),
    /** Enemies whose portrait is shown powered down. */
    dim_enemies: z.array(z.string()),
    enemy_ships: z.record(z.string(), artId),
  }),
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
    thread: keys(d.story_threads),
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
      for (const b of [e.activate_beat ?? []].flat()) need(sets.beat, b, where, 'beat');
      need(sets.beat, e.deactivate_beat, where, 'beat');
      need(sets.item, e.remove_cargo?.key, where, 'item');
      need(sets.thread, e.complete_thread, where, 'thread');
      need(sets.system, e.move_to, where, 'system');
      need(sets.system, e.set_home_port, where, 'system');
      if (e.complete_quest && !d.post_quests.some((q) => q.key === e.complete_quest)) errors.push(`${where}: unknown quest "${e.complete_quest}"`);
    }
  };
  const checkReqs = (reqs: Requirement[], where: string) => {
    for (const req of reqs) {
      need(sets.subclass, req.subclass, where, 'subclass');
      need(sets.faction, req.reputation?.faction, where, 'faction');
      need(sets.system, req.location, where, 'system');
      need(sets.item, req.has_cargo, where, 'item');
      need(sets.crew, req.crew, where, 'crew');
      need(sets.grudge, req.grudge, where, 'grudge');
      need(sets.lore, req.lore, where, 'lore');
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
  need(sets.subclass, d.config.SAFE_ROUTE_SUBCLASS, 'config.SAFE_ROUTE_SUBCLASS', 'subclass');
  for (const m of d.config.ACT2_THREAD_MESSAGES) need(sets.message, m, 'config.ACT2_THREAD_MESSAGES', 'message');
  for (const p of d.config.ACT3_MUSTER_PORTS) need(sets.system, p, 'config.ACT3_MUSTER_PORTS', 'system');
  need(sets.system, d.config.ACT3_RALLY_SYSTEM, 'config.ACT3_RALLY_SYSTEM', 'system');
  need(sets.faction, d.config.BATTLE_OATH_FACTION, 'config.BATTLE_OATH_FACTION', 'faction');
  for (const q of d.post_quests) {
    need(sets.message, q.message, `quest ${q.key}`, 'message');
    checkReqs(q.requirements, `quest ${q.key}`);
    for (const b of q.beats) {
      need(sets.beat, b, `quest ${q.key}`, 'beat');
      const beat = d.story_beats.find((x) => x.key === b);
      if (beat && beat.quest !== q.key) errors.push(`quest ${q.key}: beat ${b} is not marked quest "${q.key}"`);
    }
  }
  need(sets.beat, d.config.ACT3_FIRST_BEAT, 'config.ACT3_FIRST_BEAT', 'beat');
  need(sets.beat, d.config.ACT3_LAUNCH_BEAT, 'config.ACT3_LAUNCH_BEAT', 'beat');
  for (const p of Object.values(d.config.POST_GAME_START)) need(sets.system, p, 'config.POST_GAME_START', 'system');
  for (const o of d.endings.oaths) {
    need(sets.oath, o.oath, 'endings.oaths', 'oath');
    checkReqs(o.keep_if, `endings.oaths ${o.oath}`);
  }
  for (const r of d.endings.rally_lines) checkReqs(r.requirements, 'endings.rally_lines');
  for (const k of Object.keys(d.endings.crew)) need(sets.crew, k, 'endings.crew', 'crew');
  for (const k of Object.keys(d.endings.stakes)) need(sets.subclass, k, 'endings.stakes', 'subclass');
  for (const s of d.subclasses) if (!d.endings.stakes[s.key]) errors.push(`endings.stakes: missing ${s.key}`);
  for (const e of d.enemies) for (const l of e.leverage) checkReqs(l.requirements, `enemy ${e.key}.leverage`);
  for (const lvl of ['2', '3'])
    if (d.config.MODULE_UPGRADE_COST[lvl] === undefined) errors.push(`config.MODULE_UPGRADE_COST: missing level ${lvl}`);
  for (const key of ['ACT2_STARTED', 'ACT3_UNLOCKED', 'WAAAGH_LAUNCHED'])
    if (!d.act_events.some((a) => a.key === key)) errors.push(`act_events: missing "${key}"`);

  for (const t of d.story_threads) {
    for (const b of t.beats) {
      need(sets.beat, b, `thread ${t.key}`, 'beat');
      const beat = d.story_beats.find((x) => x.key === b);
      if (beat && beat.thread !== t.key) errors.push(`thread ${t.key}: beat ${b} is not marked thread "${t.key}"`);
    }
  }

  for (const m of d.markets) {
    const sys = d.systems.find((s) => s.key === m.port);
    if (!sys) errors.push(`market: unknown port "${m.port}"`);
    else if (!sys.port) errors.push(`market ${m.port}: system is not a port`);
    for (const k of [...Object.keys(m.sells), ...Object.keys(m.buys)]) need(sets.item, k, `market ${m.port}`, 'item');
    for (const r of m.rumors) {
      checkEffects(r.effects, `market ${m.port}.rumor ${r.key}`);
      checkReqs(r.requirements, `market ${m.port}.rumor ${r.key}`);
    }
  }

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
    if (o.fulfil && 'deliver' in o.fulfil) {
      need(sets.item, o.fulfil.deliver.item, `oath ${o.key}`, 'item');
      need(sets.system, o.fulfil.deliver.system, `oath ${o.key}`, 'system');
    }
  }
  for (const m of d.messages) {
    need(sets.beat, m.beat, `message ${m.key}`, 'beat');
    checkEffects(m.on_receive, `message ${m.key}.on_receive`);
    if (m.job) {
      for (const p of m.job.ports) need(sets.system, p, `message ${m.key}`, 'system');
      checkEffects(m.job.on_accept, `message ${m.key}.job`);
      checkReqs(m.job.requirements, `message ${m.key}.job`);
    }
  }

  for (const enc of d.combat_encounters) {
    for (const e of enc.enemies) need(enc.mode === 'personal' ? sets.enemy : sets.ship, e, `encounter ${enc.key}`, 'enemy');
    need(sets.encounter, enc.boarding, `encounter ${enc.key}.boarding`, 'encounter');
    if (enc.boarding && (enc.mode !== 'ship' || d.combat_encounters.find((x) => x.key === enc.boarding)?.mode !== 'personal'))
      errors.push(`encounter ${enc.key}: boarding goes from a ship fight to a personal fight`);
    need(sets.faction, enc.witness_faction, `encounter ${enc.key}`, 'faction');
    if (enc.crew_risk && enc.crew_risk !== 'ANY') need(sets.crew, enc.crew_risk, `encounter ${enc.key}`, 'crew');
    for (const m of enc.modifiers) checkReqs(m.requirements, `encounter ${enc.key}.modifiers`);
    for (const [name, o] of Object.entries(enc.outcomes)) if (o) checkEffects(o.effects, `encounter ${enc.key}.${name}`);
    const negotiable = enc.mode === 'personal' && enc.enemies.some((e) => d.enemies.find((x) => x.key === e)?.negotiable);
    if (negotiable && !enc.outcomes.victory_negotiated)
      errors.push(`encounter ${enc.key}: has a negotiable enemy but no victory_negotiated outcome`);
    if (!enc.outcomes.withdrew)
      errors.push(`encounter ${enc.key}: needs a withdrew outcome (Withdraw and Chart Safe Route can end any fight)`);
  }

  for (const b of d.story_beats) {
    const where = `beat ${b.key}`;
    if (b.next !== null) need(sets.beat, b.next, where, 'beat');
    need(sets.system, b.location, where, 'system');
    if (b.trigger === 'arrival' && !b.location) errors.push(`${where}: arrival beats need a location`);
    if ((b.trigger === 'event') !== (b.event !== undefined)) errors.push(`${where}: event settings go only on trigger "event" beats`);
    if (b.thread) need(sets.thread, b.thread, where, 'thread');
    if (b.event) checkReqs(b.event.requirements, where);
    checkReqs(b.only_if, `${where}.only_if`);
    if (!b.routes.some((r) => r.requirements.length === 0))
      errors.push(`${where}: needs at least one route with no requirements (the fallback)`);
    checkEffects(b.on_complete, `${where}.on_complete`);
    for (const t of tierSchema.options) checkEffects(b.outcomes[t].effects, `${where}.outcomes.${t}`);
    for (const r of b.routes) {
      const rw = `${where}.${r.key}`;
      need(sets.encounter, r.encounter, rw, 'encounter');
      need(sets.beat, r.next, rw, 'beat');
      if (r.roll) diff(r.roll.difficulty, rw);
      if (r.console_action) diff(r.console_action.difficulty, rw);
      checkEffects(r.effects_always, rw);
      checkReqs(r.requirements, rw);
      for (const t of tierSchema.options) if (r.outcomes?.[t]) checkEffects(r.outcomes[t]!.effects, `${rw}.outcomes.${t}`);
    }
  }
  const senders = new Set(d.messages.map((m) => m.from));
  for (const from of Object.keys(d.art.senders)) if (!senders.has(from)) errors.push(`art.senders: no message is from "${from}"`);
  for (const k of [...Object.keys(d.art.enemies), ...d.art.dim_enemies]) need(sets.enemy, k, 'art.enemies', 'enemy');
  for (const k of Object.keys(d.art.enemy_ships)) need(sets.ship, k, 'art.enemy_ships', 'ship');
  return errors;
}
