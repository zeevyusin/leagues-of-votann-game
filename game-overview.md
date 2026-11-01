# Game Overview & Core Mechanics Spec

A text-based adventure game themed on the Leagues of Votann. The player commands a ship from a **spaceship console interface**, receiving and sending messages, choosing destinations, and deciding how to handle encounters. This document describes the **general game design and how the systems work together**. For character creation, kin types, classes, and the Wear meter, see `character-creation.md`.

> **Conventions**
> - `[TUNABLE]` marks a placeholder number to be balanced later. Keep these in a config/data file, never hardcoded in logic.
> - `[DECIDED]` marks a design question that has been resolved. Still implement the decision behind a config flag so it can be changed later.
> - Lore names were written from memory. Keep display names in data files so they are easy to correct.
> - **Audience:** a personal, free, non-commercial fan project. Warhammer 40,000 / Leagues of Votann terms are kept. The title screen shows a short fan-work disclaimer (unofficial, not affiliated with or endorsed by Games Workshop). No official art or assets are used.
> - This spec covers mechanics only. The campaign is specced in `story.md` and combat in `combat-system.md`; narrative content plugs into the systems below as data.

---

## 1. Game Pillars

1. **Console-first.** The entire game is experienced through a ship console. There is no free movement or map exploration outside of console menus.
2. **Choices with consequences.** Most outcomes are text-based, driven by player choices and stat-based rolls. Partial successes ("you succeed, but...") keep the story moving rather than dead-ending.
3. **Kin culture matters.** Oaths, grudges, ancestor relics, and hearth loyalty are first-class mechanics, not flavor.
4. **Class and kin type change what you can do.** Stats, class actions, and Ironkin vs. Kin differences open and close options throughout the game.

---

## 2. The Core Loop

```
Receive message (Comms)
   -> Decide: accept / decline / investigate
   -> Plan travel (Nav): destination, fuel, time
   -> Travel (random events may trigger)
   -> Arrive: resolve encounter (rolls, dialogue, combat)
   -> Outcome: rewards, costs, reputation changes, new messages
   -> Manage ship/crew/cargo, then repeat
```

The player is always at the console between encounters. The console is the hub; encounters are scenes that open from it and return to it.

---

## 3. The Console (Main Interface)

The console has four main screens. The player can switch between them freely whenever no encounter is in progress.

### 3.1 Comms
- Receives messages from NPCs: **jobs, rumors, trade offers, distress calls, threats, and personal messages.**
- The player replies by choosing from a list of options.
- Some reply options are **gated** by class, subclass, kin type, stat threshold, reputation, or inventory. Gated options are shown but locked (with the requirement displayed), so players learn what they could unlock.
- Accepting a job creates an **oath** (see section 6.1).
- Messages can expire if not answered in time `[TUNABLE]`.

### 3.2 Nav (Navigation)
- A **star map of systems** the player can travel to. `[DECIDED]` The campaign map has **about 12 systems** `[TUNABLE]` (see `story.md` section 4.4).
- Each destination shows **travel time (in days) and fuel cost**, plus known danger and faction control where relevant. Typical route: 1 to 3 days, 1 to 3 Fuel `[TUNABLE]`.
- Travel can trigger **random events** (see section 7).
- Unexplored systems may be hidden until discovered through scans, rumors, or class abilities (for example Pathfinder actions).

### 3.3 Ship and Cargo
- **Ship modules** (upgradable): engine, shields, weapons, reactor (sets power pips, see `combat-system.md`), cargo hold, scanner, and a workshop (reduces maintenance cost for Ironkin Wear and repairs).
- **Cargo:** carried trade goods, salvage, relics, and mission items. Limited by cargo hold capacity.
- **Crew:** recruited NPCs with their own traits (section 8.2).
- **Resources:** see section 4.

### 3.4 Logbook
- **Active contracts/oaths:** who, what, deadline, reward, penalty for breaking.
- **Grudges:** wronged NPCs or factions the player may settle later.
- **Faction reputation:** current standing with each faction.
- **Discoveries and notes:** relics found, systems visited, lore entries.

---

## 4. Resources

| Resource | Purpose | Notes |
|---|---|---|
| **Fuel** | Spent on every travel action | Running out strands the ship (see failure states) |
| **Ore** | Primary currency | Used for trade, upgrades, repairs, bribes |
| **Supplies** | Consumed over time and used for maintenance | Ironkin also spend Supplies on Wear maintenance |
| **Hearthfire** | Crew morale meter | Range `0 to 100` `[TUNABLE]` |

Ship stats that are not resources: **Hull** (ship's health in ship combat), **cargo capacity** (units), and **module levels** (engine, shields, weapons, cargo hold, scanner, workshop, reactor).

### 4.1 Time `[DECIDED]`
- The unit of in-game time is the **day**. Travel costs days; Supplies, deadlines, message expiry, and recovery all count in days.
- Supplies drain per day: `SUPPLIES_PER_CREW_PER_DAY = 0.5` `[TUNABLE]`, counting the player and every crew member, rounded up per day.
- **Starvation** (Supplies at 0): each day costs `-10` Hearthfire and `-1` Health `[TUNABLE]` until resupplied.
- The Waaagh! meter (see `story.md`) still rises **per journey**, not per day.

### 4.2 Starting kit `[DECIDED]`
Every captain starts with a **base kit**, then a small **subclass bonus** that fits their role in the fleet. All values `[TUNABLE]`, stored in `subclasses.json` as `starting_kit`.

Base kit: **Fuel 10, Ore 100, Supplies 20, Hearthfire 50, Hull 20, cargo capacity 10**, all ship modules (including the reactor) at **level 1**.

| Subclass | Bonus on top of the base kit |
|---|---|
| Hearthkyn Warrior | +10 Hearthfire |
| Einhyr Hearthguard | Shields module level 2 |
| Cthonian Berserk | +5 Hull (heavy deep-drill ship) |
| Hernkyn Pioneer | +4 Fuel |
| Hernkyn Yaegir | Scanner module level 2 |
| Brôkhyr Iron-master | Workshop module level 2 |
| Arkanyst Evaluator | One unidentified relic |
| Theyn / Kapitan | +10 reputation with the Durn League |
| Prospector-Trader | +60 Ore, +5 cargo capacity |
| Memnyr Strategist | +10 Supplies, two extra systems revealed on Nav |

### 4.3 Hearthfire (morale)
- Rises through feasts, kept oaths, shared victories, and class actions like Muster the Hearth.
- Falls through broken oaths, crew losses, starvation, and defeats.
- **Effects by band `[DECIDED]`, values `[TUNABLE]`:**

| Band | Range | Effect |
|---|---|---|
| High | 70 to 100 | +1 to all rolls |
| Mid | 30 to 69 | No effect |
| Low | 1 to 29 | -1 to all rolls; crew may refuse orders |
| Zero | 0 | **Mutiny** event. Crew members may leave or turn on the player. |

- Kin and Ironkin gain Hearthfire differently (see `character-creation.md`).

### 4.4 Health and Hull recovery `[DECIDED]`
- **Docked at a port:** Health restores fully for free. Hull repairs cost Ore (`HULL_REPAIR_ORE_PER_POINT = 5`) or Supplies.
- **Travelling:** Health regenerates `2` per day (`HEALTH_REGEN_PER_DAY`); Kin multiply this by **1.5** (Quick Recovery). Hull does not regenerate in travel.
- **Ironkin:** Health regenerates as above, but Wear never falls on its own. It needs maintenance (Supplies or a Craft check, see `character-creation.md`).
- All values `[TUNABLE]`.

### 4.4.1 Fatigue `[DECIDED]`
- A Kin player becomes **Fatigued** after more than `FATIGUE_DAYS = 6` days in a row without docking at a port.
- Fatigued: `-1` to all rolls (`FATIGUE_PENALTY`). Docking at any port clears it.
- Ironkin are immune (Tireless, see `character-creation.md`). Crew members are not tracked separately.
- All values `[TUNABLE]`.

### 4.5 Failure states
- **Out of fuel:** ship is stranded. Options: call for help (costly, may create a debt oath), salvage nearby, or wait. Not an instant game over.
- **Mutiny:** triggers a special event. Player may quell it with a Speaker action or high Hearthfire recovery, otherwise crew leaves.
- **Ship destroyed / player incapacitated:** see section 5.4.

---

## 5. Action Resolution

### 5.1 Rolls
When the outcome of an action is uncertain, the game rolls:

```
roll = die + relevant_stat + modifiers
compare roll to difficulty
```

`[DECIDED]` Die type: **d20**. Implement behind a config flag `DIE_TYPE` (default `d20`, `d100` kept as an alternate). All difficulty numbers must be defined relative to the chosen die.

**Difficulty ladder `[DECIDED]`** (authors use these names in data, for example `"difficulty": "HARD"`; the engine maps them to numbers from config; enemy templates in `combat-system.md` may use raw numbers for fine tuning; values `[TUNABLE]`):

| Name | Difficulty |
|---|---|
| Easy | 8 |
| Normal | 11 |
| Hard | 14 |
| Very Hard | 17 |
| Heroic | 20 |

There is **one balanced difficulty mode** `[DECIDED]`. No player-selectable difficulty setting in the first release.

### 5.2 Outcome tiers
Every roll resolves to one of four outcomes, each with its own authored text:

| Tier | Meaning | Rule `[DECIDED]` (margin = roll - difficulty) |
|---|---|---|
| **Critical success** | Best outcome, bonus reward or effect | margin **+5 or more**, or a natural 20 |
| **Success** | Goal achieved cleanly | margin **0 to +4** |
| **Partial success** | Goal achieved with a cost or complication | margin **-1 to -4** |
| **Failure** | Goal not achieved, with a consequence | margin **-5 or less**, or a natural 1 |

Config: `TIER_CRIT_MARGIN = 5`, `TIER_PARTIAL_MARGIN = 4`, `NAT20_IS_CRIT = true`, `NAT1_IS_FAILURE = true` (all `[TUNABLE]`). The natural 20/1 rules apply only with `DIE_TYPE = d20`.

Encounters should author text and effects for **all four tiers** where a roll is used. Partial success is the default "interesting" result and should be common.

### 5.3 Modifiers
Sources of modifiers: Hearthfire band, Wear state (Ironkin), ship modules, crew traits, relics, subclass traits, and situational bonuses. Show the player the active modifiers when relevant (a simple "+2 from Scanner module" line is enough).

### 5.4 Death and incapacitation
`[DECIDED]` A defeat does not end the game outright. The player is **incapacitated**, suffers a cost (lost cargo, Ore, crew, or a grudge), and is rescued or recovers. A true game over occurs only in narrow authored cases. Implement behind a flag `PERMADEATH` (default `false`).

---

## 6. Signature Kin Mechanics

### 6.1 Oaths
- Accepting a job, making a promise, or swearing loyalty creates an **oath** entry in the Logbook.
- An oath has: giver, terms, deadline (optional), reward, and penalty for breaking.
- **Keeping an oath:** reward, reputation gain with the relevant faction, Hearthfire boost.
- **Breaking an oath:** reputation loss, Hearthfire loss, and the wronged party may become a **grudge**.
- Class interactions: Speaker actions like Swear an Oath improve terms; the Ironkin Speaker passive makes kept oaths worth more and broken ones cost more.

### 6.2 Grudges
- A grudge is created when the player wrongs an NPC or faction, or is wronged by one.
- Grudges persist and can be **settled later**: through combat, restitution, a negotiated settlement, or by outliving the grievance (some fade).
- Settling a grudge should always be a meaningful choice with rewards and consequences, not just a checkbox.
- Memnyr Strategists track grudges and oaths more easily (UI helper, not a mechanical shortcut).

### 6.3 Ancestor relics
- Rare finds with **powerful effects and trade-offs.** Each relic has a benefit and a drawback.
- Unidentified relics show only vague information. Arkanyst Evaluators can reveal the true effects before the player commits.
- Relics can be equipped, sold, or traded. Some factions covet particular relics, which ties into reputation.

### 6.4 Faction reputation
- Each Kin faction/League and each outsider faction tracks its **own** standing.
- Reputation changes from oaths, trades, combat choices, and dialogue.
- Reputation gates content: jobs, prices, dialogue options, and safe passage.
- Ironkin social friction is modeled as a per-faction reputation modifier (see `character-creation.md`).

---

## 7. Travel Events

- Travelling between systems can trigger a **random event** from a weighted pool.
- Event types: encounter (ship, creature, pirate), hazard (radiation storm, asteroid field), discovery (derelict, relic signal), distress call, trade opportunity, crew event.
- Event weights depend on the route's danger, the faction controlling the system, and the player's modifiers (for example Pathfinder abilities reduce risk).
- Many events call for a roll or a choice, and use the four outcome tiers.
- Ironkin treat environmental hazard events as routine. Kin suffer their full effect.

---

## 8. Combat, Crew, and Progression

### 8.1 Combat (abstract)
Combat is deliberately abstract and text-driven. Detailed rules will be specced separately; the high-level shape is:

- **Personal/boarding combat:** each round the player chooses an approach: **attack, defend, outmaneuver, or negotiate.** Outcomes resolve with the roll system above.
- **Ship combat:** the player **allocates power between weapons, shields, and engines** each round. Modules and crew modify the result.
- Negotiating is always a legitimate option when the enemy can be reasoned with, so Speakers have a real route through combat encounters.
- Class passives and console actions plug in as round modifiers (for example Hold the Line reduces damage; Boarding Lead boosts boarding rolls).

### 8.2 Crew
- Recruitable NPCs with **their own traits**, loyalties, and possible grudges or oaths.
- Crew affect rolls, ship function, and Hearthfire.
- Crew can leave (low Hearthfire, broken oaths) or be lost in events.

### 8.3 Progression
- **Skill points per level** to improve stats. `[DECIDED]` **1 stat point per level-up** (`STAT_POINTS_PER_LEVEL = 1`), and no stat can exceed **8** (`STAT_MAX = 8`). Both `[TUNABLE]`.
- **XP sources `[DECIDED]`: milestones plus deeds.** Suggested values `[TUNABLE]`, tuned so the player reaches about level 10 near the end of the campaign:

| Source | XP |
|---|---|
| Main story beat completed (any outcome) | 200 |
| Act 2 thread completed (bonus) | 300 |
| Contract / oath kept | 75 to 150 (set per contract) |
| Fight won (broken) | 25 |
| Fight won (negotiated) | 35 |
| Discovery (new system, relic, lore entry) | 20 |
| Failed roll (failure still moves the story) | 5 |
- **Ship upgrades** (modules) purchased or salvaged.
- **Crew recruitment** and relic acquisition expand options.
- Class and subclass are fixed at creation. There is no later subclass unlock. Progression adds depth within the chosen build rather than changing it.
- `[DECIDED]` **Level cap 10** `[TUNABLE]`, sized for the 4 to 6 hour campaign. Gentle XP curve: XP needed to reach the next level = `100 × current level` `[TUNABLE]`. Keep `LEVEL_CAP` and `XP_PER_LEVEL_BASE` in `config.json`.

---

## 9. Architecture

Keep the engine data-driven so story content can be added later without code changes.

### 9.0 Tech stack and platform `[DECIDED]`
- **TypeScript web app**, built with **Vite**, runs in the browser.
- The **engine is a pure TypeScript module with no DOM access** (game state, roll resolver, condition evaluator, effect applier, combat, story engine). The UI layer only renders state and sends player choices. This keeps the engine unit-testable.
- **Tests:** Vitest. The random number generator is **seedable**, so tests and bug reports can replay exact rolls.
- **Data:** JSON files under `data/`, validated against schemas at load time (fail loudly on a bad reference, for example a subclass pointing to a missing base class).
- **Input:** **numbered menus only.** Every prompt is a numbered list; the player picks by number key or click. Locked options are shown with their requirement and cannot be picked. No text parser.
- **Saving:** **autosave + 3 manual slots.** Autosave whenever the player returns to the console hub and after each story beat. Manual saves to 3 slots from the console. Saves live in browser storage (localStorage or IndexedDB), carry a `save_version` for migrations, and can be exported/imported as a JSON file. The state model still supports mid-combat saves (used by autosave on tab close).
- **Visual style:** a dark ship console in **Leagues of Votann colors**: dark background, **shades of blue and teal** for panels, text, and frames, with **orange** as the accent for highlights, warnings, and important prompts. Monospace font for console text. Keep colors as theme tokens (CSS variables) so they are easy to adjust. Starting palette `[TUNABLE]`:

| Token | Use | Value |
|---|---|---|
| `--bg` | page background | `#0a1218` |
| `--panel` | panel fill | `#10202a` |
| `--frame` | panel borders | `#1f4e63` |
| `--text` | body text | `#cfe8ee` |
| `--muted` | secondary text, locked options | `#6f97a3` |
| `--teal` | headings, active selection | `#3fc1c9` |
| `--blue` | links, system names | `#4a8fd4` |
| `--accent` | highlights, warnings, crits | `#f08a24` |

```
data/
  stats.json            # see character-creation.md
  kin_types.json
  base_classes.json
  subclasses.json
  config.json           # all [TUNABLE] values and [DECIDED] flags
  systems.json          # star map: systems, factions, danger, connections
  factions.json         # factions and starting reputation
  messages.json         # Comms messages and reply trees, with gating conditions
  events.json           # travel/encounter events with four-tier outcomes
  relics.json
  ship_modules.json
  crew.json
```

### Core engine modules
1. **Character module:** creation flow and stats (per `character-creation.md`).
2. **State manager:** a single serializable game state (character, resources, ship, crew, cargo, oaths, grudges, reputation, current location, active messages). Must support save and load.
3. **Roll resolver:** one function that takes stat, modifiers, difficulty, and returns a tier. Everything uses this.
4. **Condition evaluator:** evaluates gates on options (class, kin type, stat, reputation, inventory, flags). Used by Comms, events, and dialogue.
5. **Effect applier:** applies outcomes (resource changes, reputation changes, new oaths, new messages, flags) from data definitions.
6. **Console UI:** the four screens plus an encounter view. Text in, text out.
7. **Event scheduler:** triggers travel events and delivers timed messages.

### Content authoring format (guideline)
Each choice or event should be definable as data with:
- `text`
- `requirements` (conditions)
- `roll` (stat, difficulty) or none
- `outcomes` for each tier, each with `text` and `effects`

This keeps story authoring separate from engine code.

---

## 10. Out of Scope (for now)

- Story, setting details, named NPCs, and campaign structure (now specced in `story.md`)
- Full combat rules and balance (now specced in `combat-system.md`)
- Detailed economy and pricing (trade goods, module upgrade costs, relic prices)
- Final balancing of level curve and XP values (cap, curve shape, and XP sources are decided in section 8.3)
- Art and audio (the console's color theme is decided in section 9.0)
- Player-selectable difficulty modes, localization (English only)

## 11. Milestone 1: Act 1 Vertical Slice `[DECIDED]`

The first development milestone is a **playable Act 1, start to finish**. It includes:

1. Project setup: Vite + TypeScript, Vitest, data loading with schema validation, seedable RNG, theme tokens.
2. Character creation (all of `character-creation.md`), including the per-subclass starting kit.
3. The console hub with all four screens (Comms, Nav, Ship and Cargo, Logbook), numbered-menu input.
4. Roll resolver with the tier rule and difficulty ladder (section 5), modifiers display.
5. Time, Fuel, Supplies, Hearthfire bands, Health/Hull recovery (section 4).
6. Phase 1 combat, both modes (`combat-system.md` section 9).
7. Story engine and all four Act 1 beats with every route and the 10 subclass opening variants (`story.md` section 6.1).
8. Oaths, grudges, and reputation as far as Act 1 uses them (Oath of the Broken Fleet, `GRUDGE_SKRAGNAK`, debt oath to Snazrik).
9. XP and level-up (section 8.3).
10. Autosave + 3 manual slots, export/import.
11. Title screen with the fan-work disclaimer.

**Done when:**
- Every class and kin type can finish Act 1, including a run where every roll fails.
- Save and load work at the hub, between beats, and mid-combat.
- No number or display name is hardcoded in engine logic.
- Engine unit tests cover the roll resolver, character creation math, combat round resolution, and defeat safety rules.

## 12. Design Decisions Summary

| Question | Decision |
|---|---|
| Die type: d20 or d100 | `d20` |
| Death: permadeath or recoverable defeat | Recoverable (`PERMADEATH = false`) |
| Level cap and XP curve | Cap 10, XP to next level = `100 × level` |
| Wear pressure model (see `character-creation.md`) | `ON_PUSH` |
| Bonus stat points at creation (see `character-creation.md`) | Enabled, 3 points, max +2 per stat |
| Roll tiers | Margin-based: crit +5 or nat 20, success 0 to +4, partial -1 to -4, failure -5 or nat 1 |
| Difficulty ladder | Easy 8, Normal 11, Hard 14, Very Hard 17, Heroic 20 |
| Player difficulty modes | None, one balanced mode |
| Time unit | Days |
| Starting resources | Base kit + per-subclass bonus (section 4.2) |
| Hearthfire bands | High 70+ (+1), Mid 30 to 69, Low 1 to 29 (-1), 0 mutiny |
| Health/Hull recovery | Full Health when docked, 2/day in travel (Kin ×1.5); Hull repairs cost Ore |
| Level-ups | 1 stat point per level, stat max 8 |
| XP sources | Milestones + deeds (section 8.3) |
| Star map size | About 12 systems |
| Tech stack | TypeScript + Vite web app, pure-TS engine, Vitest |
| Input | Numbered menus only |
| Saving | Autosave + 3 manual slots, JSON export/import |
| Visual style | Dark background, blue/teal panels, orange accents |
| Audience | Personal, free, non-commercial fan project with a disclaimer |
| First milestone | Act 1 vertical slice (section 11) |
