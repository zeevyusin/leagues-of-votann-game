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
- **Injuries** `[DECIDED]` (Milestone 3) are lasting penalties from heavy hits. They do not heal with Health. Kin rest at a port for 3 days per injury, and Ironkin pay Ore for maintenance (`combat-system.md` section 3.8).
- All values `[TUNABLE]`.

### 4.4.1 Fatigue `[DECIDED]`
- A Kin player becomes **Fatigued** after more than `FATIGUE_DAYS = 6` days in a row without docking at a port.
- Fatigued: `-1` to all rolls (`FATIGUE_PENALTY`). Docking at any port clears it.
- Ironkin are immune (Tireless, see `character-creation.md`). Crew members are not tracked separately.
- All values `[TUNABLE]`.

### 4.5 Port market `[DECIDED]`
Every port has a **Market** screen (a fifth console tab that appears only while docked). All prices are `[TUNABLE]` and live in `data/markets.json` and `config.json`.

- **Buy:** Fuel, Supplies, and module upgrades. Each module goes from level 1 to 2 to 3; level 2 costs `120` Ore and level 3 costs `250` Ore at base price. Upgrading the cargo hold adds `5` capacity per level.
- **Sell:** trade goods and salvage in the cargo hold. Each item has a base value; each port buys some goods above or below it.
- **Per-port prices:** every port has a price multiplier for buying and selling, and a list of goods it pays more or less for. Not every port sells every upgrade.
- **Reputation:** with the port's faction, reputation 20+ gives 10% off purchases; reputation below 0 adds 20%.
- **Class modifiers:** Haggle (Prospector-Trader console action) gives 15% better prices on buys and sells for the rest of the visit, once per visit (Ironkin pay Wear as usual). Eye for Ore (Prospector-Trader trait) sells goods for 10% more.
- **Waaagh! pressure:** from the Rising band (60+), Fuel and Supplies cost 25% more everywhere, and Ork bribes cost more.
- Prices are rounded to whole Ore and never drop below 1.
- **Market sections `[DECIDED]` (Milestone 4):** the market opens on a short list of sections instead of one long list:
  - **Fuel and Supplies**
  - **Upgrades** (modules, including Armour)
  - **Goods** (buy trade goods)
  - **Sell cargo**
  - **Services** (feast, rest and repairs for injuries, relic identification, rumors, dock work, Haggle)

  Each section lists its own options plus **Back**. Any list that still has more than 10 options pages (section 9.0, Long menus).
- **Armour module `[DECIDED]` (Milestone 4):** a new ship module, `armour`. Each level above 1 adds `ARMOUR_HULL_PER_LEVEL` (5) max Hull, so a fully armoured ship has 30. It is bought like the other modules (`MODULE_UPGRADE_COST`) at Karrak Station, Hold Durnvar and Kharr Hold. Buying a level also repairs the new Hull points.
- **Relic identification `[DECIDED]` (Milestone 4):** Karrak Station and Hold Durnvar identify a relic for `RELIC_IDENTIFY_ORE` (40) Ore. Arkanyst Evaluators still do it for free with their console action.
- **Dock work (safety valve):** every market offers "Take dock work": `2` days pass and the player earns `25` Ore (`DOCK_WORK_DAYS`, `DOCK_WORK_ORE`, `[TUNABLE]`). A broke captain can always earn enough Fuel to reach the next objective, so running out of Ore can never soft-lock the game.

### 4.6 Failure states
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

#### 6.3.1 Equipping relics `[DECIDED]` (Milestone 4)
- **Slots.** Up to `RELIC_SLOTS` (2) relics are equipped at a time, from the Ship and Cargo screen, at any time outside a fight. Equipping or unequipping is free.
- **Effects.** An equipped relic applies both its benefit and its drawback. Unequipped relics do nothing.
- **Unidentified relics** can be equipped. Their effects work, but the screen shows "unknown benefit, unknown drawback" until the relic is identified: by an Arkanyst Evaluator's console action, or for Ore at Karrak Station or Hold Durnvar (section 4.5).
- **Selling.** Ports with a market buy relics for their `value`. Mission relics (the Ancestor Core) cannot be sold.
- **Effect types** (data-driven, on `benefit_effects` and `drawback_effects` in `relics.json`) `[TUNABLE]`:
  - a roll modifier on one stat, optionally only in one context (story, personal combat, ship combat);
  - a modifier on all rolls in personal or ship combat;
  - a Negotiate modifier, or a read bonus for enemy telegraphs;
  - max Health, max Hull, or reactor pips;
  - Fuel cost per journey, travel event chance, or Ork event weight;
  - Hearthfire, Supplies, or Wear per journey;
  - a reputation change with a faction while equipped (applied on equip, removed on unequip).

**The relics** (about 8; names and numbers `[TUNABLE]`, Claude drafts the text):

| Relic | Found | Benefit | Drawback |
|---|---|---|---|
| Lodestone of Khaz | Arkanyst starting kit | +1 Wits outside personal combat | Ork travel events x1.5 as likely |
| The Ancestor Core | Act 3, if kept | +1 reactor pip, +1 to ship combat rolls | Kin: -2 Hearthfire per journey (the crew is uneasy). Ironkin: +5 Wear per journey |
| Grudgehammer of Varn | Thread D (Fighting Pit, critical success) | +1 to personal combat rolls | -2 to Negotiate |
| Hearthstone of Durn | Hold-fate quest reward | +2 Hearthfire per journey | -1 Nerve (homesick) |
| Void-compass | Travel event: Derelict | -1 Fuel per journey (minimum 1) | +10% travel event chance |
| Oathband of the Kâhl | Thread C (Old Rivals) | Kept oaths give +25% reputation | Broken oaths cost double Hearthfire |
| Memnyr data-slate | Travel event or rumor at Snazrik's Haven | +2 to reading enemy telegraphs | -1 Silver Tongue |
| Gitzbolt's kustom field | Hunt Gitzbolt quest | +1 Shields cap in ship combat | -10 reputation with Hold Durnvar while equipped |

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
- **Pacing target `[DECIDED]` (Milestone 4):** the level cap is reached **around the end of Act 3**, not before. Targets for an average run: about level 3 after Act 1, level 6 to 8 when Act 3 unlocks, level 9 to 10 at the epilogue. The balance pass lowers the XP values below (or steepens the curve) until the automated playthroughs land in these ranges. The post-game has nothing left to level.
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
- **Long menus `[DECIDED]` (Milestone 4):** a list with more than 10 options pages. Each page shows up to 8 options, then **Previous page** (9) and **Next page** (0) where they apply. The market avoids most paging with sections (section 4.5). Paging is handled in the UI from the View's option list, so the engine stays unchanged.
- **System menu additions `[DECIDED]` (Milestone 4):**
  - **How to play:** keys, rolls and outcome tiers, the two combat modes, Hearthfire, Wear, injuries, the Waaagh! meter, oaths and grudges. Short pages, written for a first-time player.
  - **Settings:** text size (small, medium, large), dice animation (normal, fast, off), and reduced motion. Saved per browser in localStorage, never in the save file.
  - **About:** the fan-project disclaimer, the game version, and credits.
- **Release `[DECIDED]` (Milestone 4):** the game is published as a static site on **GitHub Pages**. The repository is pushed to the author's GitHub account, and a GitHub Actions workflow builds and deploys `dist/` on every push to `main`. Saves stay in each player's browser. The version number in `package.json` becomes `1.0.0` at release and is shown on the title screen and the About page.
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
  items.json            # cargo goods; `mission: true` items are never lost on defeat
  oaths.json            # oath templates: terms, deadline, how to fulfil, keep/break effects
  grudges.json          # grudge templates
  lore.json             # Logbook discovery entries
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
- More campaigns and playable factions (possible later updates; the engine and data layout should not assume there will only ever be one campaign)
- A serious-Orks tone option (the `GRIM` tone was dropped in Milestone 4)

## 11. Milestones

### 11.1 Milestone 1: Act 1 Vertical Slice `[DECIDED]`

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

### 11.2 Milestone 2: Act 2 Playable `[DECIDED]`

The second milestone makes **Act 2 playable from the end of Act 1 until Act 3 unlocks** (`story.md` section 6.2 to 6.6). It includes:

1. **Story engine upgrade:** several beats can be active at once (one per thread), each tied to a system or a Comms message. Thread progress, thread rewards, the 2-of-4 unlock check, and the early-Waaagh! failure path.
2. **All four Act 2 threads** (A to D, three beats each) and the optional **Rescue Hrolla** beat, with class routes, fallbacks, Kin/Ironkin notes, and subclass stake lines where they fit.
3. **Waaagh! meter effects:** band effects on travel events, bribe prices, port access, and Comms warnings (`story.md` section 5).
4. **Travel events** (section 7): a weighted pool written in the same format as story beats.
5. **Side jobs** at ports: delivery and bounty contracts that create oaths.
6. **Port market** with per-port prices (section 4.5).
7. **Combat Phase 2, partial** (`combat-system.md` section 9): console actions and subclass traits in combat, Withdraw, and enemy shields and engines mattering in ship fights. Injuries, leverage, misleading reads, range bands and subsystem targeting stay for later.
8. **Act 3 is not built.** Unlocking it (or an early Waaagh! launch) shows an "Act 3 unlocked" screen and the game continues in free play.
9. **Writing:** Claude drafts all Act 2 text into the data files; the author reviews and edits it later.

**Done when:**
- Every class and kin type can unlock Act 3 from a finished Act 1, including a run where every roll fails.
- A run that ignores the threads and only travels reaches the early Waaagh! launch without soft-locking.
- Prices, events, and jobs come from data files; nothing new is hardcoded.
- Tests cover the thread unlock, the market, travel events, withdraw, and the new combat modifiers.

### 11.3 Milestone 3: Act 3, Endings, and Post-game `[DECIDED]`

The third milestone finishes the campaign: from a save with Act 3 unlocked (or an early Waaagh! launch) to the epilogue and free-roam. It includes:

1. **Starting Act 3** (`story.md` 6.6, 6.7.1):
   - the Sound the muster option at Karrak Station and Hold Durnvar, with a point-of-no-return confirm screen;
   - open job oaths break when the muster sounds;
   - Waaagh! 100 forces the start, including the early-launch hardest form.
2. **Beat 3.1, The Gathering Storm** (6.7.2): ally arrivals, the last port visit, Dorrik's vow, Ylsa's choice, and the Defend or Strike choice with `INTEL_MUSTER`.
3. **Beat 3.2, The Void Battle** (6.7.3):
   - three ship-fight waves with Hull carried over and breathers between them;
   - Act 2 reward and Waaagh!-band modifiers;
   - the super-weapon and the counter-key;
   - boarding the gunship for the Core;
   - a lost battle continuing to the Evacuated outcome.
4. **Beat 3.3, The Warboss** (6.7.4):
   - boarding the flagship and Grizzgut's third appearance;
   - freeing Hrolla if she is still captive;
   - the five resolutions, Skragnak's fate, and the Core choice;
   - "story continues worse" on defeat.
5. **Endings and epilogue** (`story.md` 7, 6.7.5): the ending builder from three results, the grudge settlement, crew fates, and the Saga record screen.
6. **Crew fates** (`story.md` 9.1): Ylsa can be lost in Act 3 only, at Low Hearthfire, with Comms warnings from Act 2 on. Dorrik's vow.
7. **Post-game free-roam** (`story.md` 7.6): Waaagh! retired, remnant-warband event variants, and the start location by ending. Existing content only.
8. **Combat Phase 2, the rest** (`combat-system.md`):
   - Negotiate leverage (3.6);
   - misleading reads (3.2);
   - injuries, with Rest and Maintenance at port markets (3.8);
   - range bands (4.3.1);
   - subsystem targeting (4.3.2).
9. **Combat Phase 3, part:** grudge duels and the boarding handoff.
10. **Writing:** Claude drafts all Act 3, epilogue and remnant text into the data files; the author reviews it later.

**Not in Milestone 3:**
- relic equipping and relic effects in combat;
- the `GRIM` Ork tone variant set;
- paged menus for screens with more than 10 options;
- Hearthline commitments, objective-based fights, and battle oaths (combat Phase 3 items 1, 4, 5, 6);
- a full XP and balance pass.

**Done when:**
- Every class and kin type can reach the epilogue and free-roam from a save with Act 3 unlocked, including:
  - a run where every roll fails,
  - an early-launch run with fewer than 2 threads, and
  - runs with 2, 3, and 4 threads finished.
- Tests reach every Warboss resolution, every Hold fate, and every Core fate.
- Ylsa is never lost outside the conditions in `story.md` 9.1. Dorrik is never lost.
- Save and load work in every Act 3 beat, between void battle waves, mid-boarding, and in the epilogue. Milestone 2 saves load through `migrateState`.
- Free-roam after the ending has no soft-locks: the automated player can keep travelling, trading and finishing threads.
- Tests cover leverage, misleading reads, injuries and recovery, range bands, targeting, duels, and boarding.
- No new number or display name is hardcoded in engine logic.

### 11.4 Milestone 4: Polish and Release `[DECIDED]`

The fourth milestone makes the game **complete with one campaign**. It adds little new story and mostly polishes mechanics, balance and the interface. After it, the game is published as version 1.0.0.

1. **Post-game quests** (`story.md` 7.7):
   - one quest chain for the Hold's fate: **The Council Seat** (Unbroken), **Rebuild the Outer Holdings** (Scarred), or **A New Hearth** (Evacuated);
   - **Hunt Gitzbolt**, only if the Core was lost.
2. **Relics** (section 6.3.1): two equip slots, about 8 relics with real effects, identification for Ore at two ports, selling.
3. **Combat Phase 3, more** (`combat-system.md` Phase 3):
   - **battle oaths** (item 1);
   - **Hearthline crew commitments** (item 4);
   - **relic effects in combat** (item 6, through section 6.3.1);
   - the **balance pass** (item 7).
4. **Armour module** for max Hull (section 4.5).
5. **Balance pass** to the "fair but tense" target (`combat-system.md` Phase 3, item 7), including the XP pacing target (section 8.3).
6. **Interface:**
   - market sections and paging for long lists (sections 4.5 and 9.0);
   - How to play, Settings and About in the System menu (section 9.0).
7. **Clean-up:**
   - drop the `GRIM` Ork tone (`story.md` 4.3);
   - bring stale spec sections up to date;
   - a player-facing README.
8. **Release** on GitHub Pages as version 1.0.0 (section 9.0).
9. **Writing:** Claude drafts the quest, relic, help and About text; the author reviews it.

**Not in Milestone 4:** objective-based fights (combat Phase 3 item 5), extra campaigns or factions, difficulty modes, audio.

**Done when:**
- Every class and kin type can play from a new game to the epilogue, then finish their post-game quest chain, with no soft-lock. This includes runs where every roll fails.
- Every Hold fate opens its own quest chain, and Hunt Gitzbolt appears only when the Core was lost.
- The automated playthroughs land inside the XP pacing targets (section 8.3) and the difficulty targets (`combat-system.md` Phase 3, item 7).
- No screen offers more than 10 options at once.
- Relics, battle oaths and crew commitments have unit tests, and their effects show in the modifiers display.
- Milestone 3 saves load through `migrateState`.
- The site builds and deploys from GitHub Actions, and the public link plays from a fresh browser.

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
| First milestone | Act 1 vertical slice (section 11.1) |
| Second milestone | Act 2 playable, with travel events, side jobs, a port market, and part of combat Phase 2 (section 11.2) |
| Economy | Port market with per-port prices, reputation and class modifiers (section 4.5) |
| Act 2 writing | Claude drafts, author reviews |
| Third milestone | Act 3, endings, epilogue and post-game, plus the rest of combat Phase 2 and the grudge duel and boarding parts of Phase 3 (section 11.3) |
| Act 3 writing | Claude drafts, author reviews |
| Fourth milestone | Polish and release: post-game quests, relics, battle oaths, crew commitments, armour, balance, menus, help and settings, GitHub Pages (section 11.4) |
| Post-game quests | One chain per Hold fate, plus Hunt Gitzbolt if the Core was lost |
| Relic slots | 2 equipped at a time, about 8 relics |
| Long menus | Market sections, plus paging (8 per page) for anything still over 10 |
| XP pacing | Level cap reached around the end of Act 3 |
| Difficulty | One mode, "fair but tense" |
| Release | Static site on GitHub Pages, version 1.0.0 |
