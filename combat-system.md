# Combat System Spec

Part of the Leagues of Votann text adventure. This document specifies **how combat works and the order to build it in**. It expands section 8.1 of `game-overview.md` and uses the stats, classes, Wear meter, and roll system from `character-creation.md`.

> **Conventions**
> - `[TUNABLE]` marks a placeholder number to balance later. Keep these in `config.json` or the combat data files, never hardcoded in logic.
> - `[DECIDED]` marks a resolved question. Still implement the decision behind a config flag so it can be changed later.
> - **Build in phases.** Phase 1 is the minimum playable combat. Phases 2 and 3 add features on top without rewriting Phase 1. Section 9 has the full plan.
> - Story is still out of scope. Enemies, encounters, and outcomes are authored later as data.

---

## 1. Design Goals

1. **Quick and readable.** A typical fight lasts **2 to 5 rounds** `[TUNABLE]`. Every round the player makes one meaningful choice and reads a short block of text.
2. **Reuse the existing roll system.** Combat uses the single roll resolver (`d20 + stat + modifiers` against a difficulty, giving four outcome tiers by margin, as defined in `game-overview.md` section 5.2). Combat adds no second dice system.
3. **Information is the skill.** The player wins by reading the enemy, not by picking the highest number. Scanning, Wits, and class abilities improve how well the player reads the fight.
4. **No death.** The player can only be **incapacitated** and lose resources. The game never ends from combat (section 7).
5. **Non-violent routes are real.** Negotiating, breaking an enemy's nerve, and withdrawing are valid ways to end a fight.
6. **Data-driven.** Enemies, ships, and encounter outcomes are defined in data files, so story content plugs in later with no code changes.

---

## 2. Combat Overview

There are two combat modes. Both use the same turn structure, the same roll resolver, and the same four outcome tiers.

| Mode | Used for | Player choice each round | Win condition |
|---|---|---|---|
| **Personal / boarding combat** | Fights on foot: ambushes, derelicts, boarding, duels | Pick a **stance**: Attack, Defend, Outmaneuver, Negotiate | Break the enemy's **Resolve** |
| **Ship combat** | Ship-to-ship fights | **Allocate reactor power** between Weapons, Shields, Engines | Reduce the enemy's **Hull** to 0 |

### 2.1 Round structure (both modes)

```
1. Show the situation (enemy telegraph or enemy ship status)
2. Player makes a choice (stance or power allocation)
3. Roll: d20 + stat + modifiers vs difficulty -> one of four tiers
4. Apply results from the tier table (damage dealt and taken, side effects)
5. Check end conditions
6. Print the round result text, then repeat
```

### 2.2 Outcome tiers in combat

Combat uses the same four tiers as every other roll. In general:

| Tier | Meaning in a fight |
|---|---|
| **Critical success** | You land a strong blow and take nothing back. |
| **Success** | You gain the upper hand cleanly. |
| **Partial success** | You both land blows. This should be the most common result. |
| **Failure** | The enemy gets the better of the exchange. |

---

## 3. Personal / Boarding Combat

### 3.1 Two meters

| Meter | Belongs to | Reaching 0 means |
|---|---|---|
| **Health** | Player (and later crew) | Player is **incapacitated** (section 7) |
| **Resolve** | Each enemy | The enemy is **broken**: it flees, surrenders, or yields. This is a victory. |

- Enemies fight until their Resolve breaks, not until they are dead. This keeps the tone non-lethal and makes negotiating feel natural.
- Starting values `[TUNABLE]`: player Health `= 10 + (Grit x 2)`. Enemy Resolve is set per enemy template, usually `4` to `10`.
- Fight length is controlled mainly by enemy Resolve versus the damage values in section 3.4.

### 3.2 Enemy telegraph

At the start of each round the game shows the enemy's **intent** as flavor text. There are three intents:

| Enemy intent | Example telegraph text |
|---|---|
| **Aggressive** | "The ganger sets his shoulder, ready to charge." |
| **Guarded** | "She plants her feet behind a salvaged plate, waiting." |
| **Evasive** | "He's backing toward the cargo stacks, eyes on the exits." |

Each enemy template stores a weighted pattern for choosing intents, for example `{aggressive: 5, guarded: 3, evasive: 2}`. Enemies can also have a fixed script for boss or story fights.

**Telegraph clarity** depends on how well the player reads the enemy. Compare the player's Wits (plus scan bonus) to the enemy's `read_difficulty` `[TUNABLE]`:

| Result | What the player sees |
|---|---|
| **Clear** | The true intent, in plain flavor text. |
| **Vague** | Text that fits two of the three intents. |
| **Misleading** | Only on a bad read (Phase 2): text that suggests the wrong intent. |

For Phase 1, only **Clear** and **Vague** exist.

### 3.3 Player stances

| Stance | Stat used | Counters | Core effect |
|---|---|---|---|
| **Attack** | Grit | Evasive enemy (you press them down) | Deal more damage, take more on a bad result. |
| **Defend** | Grit | Aggressive enemy (you absorb the charge) | Take less damage, deal less. |
| **Outmaneuver** | Nerve | Guarded enemy (you flank the guard) | Low damage but grants **Advantage** (+2 to your next roll). |
| **Negotiate** | Silver Tongue | Any enemy that is open to talking | Damages Resolve with words, not blows. See section 3.6. |

**Matchup modifier** `[TUNABLE]` applied to the roll, based on stance versus the enemy's true intent:

| Case | Modifier |
|---|---|
| Matched counter (see table above) | +3 |
| Neutral | 0 |
| Bad matchup (Attack vs Guarded, Outmaneuver vs Aggressive, Defend vs Evasive) | -2 |

Neutral pairings are every other combination. Negotiate ignores the intent matchup and uses the rules in section 3.6.

### 3.4 Round resolution

```
roll = d20 + stance_stat + matchup_modifier + other_modifiers
tier = resolve(roll vs enemy.defense_difficulty)
```

Base damage by tier `[TUNABLE]`:

| Tier | Resolve damage to enemy | Health damage to player |
|---|---|---|
| Critical success | 3 | 0 |
| Success | 2 | 0 |
| Partial success | 1 | 1 |
| Failure | 0 | 2 |

Stance adjustments `[TUNABLE]`:

- **Attack:** +1 damage dealt on Success or better. +1 damage taken on Partial or Failure.
- **Defend:** -1 damage taken (minimum 0). -1 damage dealt (minimum 0).
- **Outmaneuver:** Success or better grants **Advantage** (+2 to your next roll, expires after one round).
- **Negotiate:** see section 3.6.

Enemy strength scales through the enemy template (section 8.1): `defense_difficulty` (how hard the player must roll) and a `damage_bonus` that adds to damage the player takes.

### 3.5 Class passives in Phase 1

Only the base class passives plug in during Phase 1, because they are simple damage modifiers:

| Passive | Combat effect |
|---|---|
| **Hold the Line** (Warrior, Kin) | Reduce damage taken by 1 once per round `[TUNABLE]`. |
| **Plated Bulwark** (Warrior, Ironkin) | Reduce damage taken by 2 once per round `[TUNABLE]`. Each hit taken adds Wear. |
| **Sharp Senses / Sensor Suite** (Pathfinder) | Improve telegraph clarity (counts toward the Wits read). |
| Other passives | No combat effect in Phase 1. |

### 3.6 Negotiate

Negotiate lets Speakers have a real route through combat.

**Phase 1 (basic):**
- Available only when the enemy template has `negotiable: true`.
- Roll Silver Tongue against the enemy's `negotiation_difficulty`.
- Damage to the enemy's Resolve follows the tier table. On Partial or Failure the player takes no Health damage, but the enemy may use the round to reposition, which loses the player a round.
- If the enemy's Resolve reaches 0 through Negotiate, the fight ends with the **negotiated** outcome instead of the **broken** outcome (different authored text and effects, for example no loot but better reputation).

**Phase 2 (leverage):**
- Negotiating gains bonuses from **leverage**: knowledge learned about the enemy (a grudge, a faction tie, a weakness from a scan, an oath they owe). Without leverage, negotiation against hardened enemies is harder.
- The Logbook feeds this: if the player knows the enemy's grudge, that is leverage.

### 3.7 Ironkin and Wear in personal combat

- Taking Health damage adds Wear to Ironkin `[TUNABLE]` (suggested `+2` Wear per point of Health damage).
- Using a class console action adds Wear as already defined in `character-creation.md`.
- Wear penalties (Strained, Failing) apply to Nerve and Craft rolls, which makes Outmaneuver weaker. Critical Wear (100) incapacitates the player (section 7).

---

## 4. Ship Combat

### 4.1 The reactor and power pips

The ship has a reactor with a number of **power pips** `[TUNABLE]`, suggested base `6`. Each round the player distributes pips across three systems:

| System | What pips do | Capped by |
|---|---|---|
| **Weapons** | Set the damage your ship deals when it hits | Weapons module level |
| **Shields** | Absorb that many points of incoming damage this round | Shields module level |
| **Engines** | Add to the round's roll (initiative and evasion) | Engine module level |

Rules:
- All pips must be spent each round, but can be spent on any combination within module caps.
- Module levels come from the Ship screen (engine, shields, and so on). Upgrading a module raises its cap, and upgrading the reactor raises total pips above `SHIP_BASE_REACTOR_PIPS` `[DECIDED]`.
- **Module cap** `[DECIDED]`: a system can take at most `2 + module level` pips (`MODULE_CAP_BASE = 2`). At level 1 that is 3 per system, 9 in total, so the starting 6 pips can always be spent.
- **Reactor pips** `[DECIDED]`: `SHIP_BASE_REACTOR_PIPS + (reactor level - 1) × REACTOR_PIPS_PER_LEVEL`, with `REACTOR_PIPS_PER_LEVEL = 1`. Level 1: 6 pips, level 3: 8 pips.
- **Max module level** is `3` (`MODULE_MAX_LEVEL`). At max reactor (8 pips) the caps still allow it to be spent (minimum caps 3 + 3 + 3 = 9).
- **Rule to keep:** total cap across the three systems must always be at least the reactor's pips. Validate this when loading data.
- All values `[TUNABLE]`.
- Pips are re-allocated freely every round. There is no carry-over.

### 4.2 Enemy ship

An enemy ship has:
- **Hull** (like Health).
- A fixed pip budget and a **weighted allocation pattern**, for example "mostly weapons".
- A `defense_difficulty` for the round roll.

At the start of each round the console shows an **enemy allocation hint** based on the player's Scanner module:

| Scanner quality | Hint shown |
|---|---|
| Basic | Vague: "Their reactor is running hot." |
| Mid | Band: "Heavy on weapons." |
| High | Exact pips: "Weapons 4, Shields 1, Engines 1." |

This mirrors the personal-combat telegraph and keeps the information game consistent across both modes.

### 4.3 Round resolution

```
roll = d20 + Nerve + engine_pips + other_modifiers
tier = resolve(roll vs enemy.defense_difficulty)
incoming_base = enemy.weapon_pips
```

| Tier | Damage to enemy Hull | Damage to your Hull |
|---|---|---|
| Critical success | `weapon_pips x 2` | 0 (you outmaneuvered their fire) |
| Success | `weapon_pips` | `max(0, incoming_base / 2 - shield_pips)` (rounded down) |
| Partial success | `weapon_pips` | `max(0, incoming_base - shield_pips)` |
| Failure | 0 | `max(0, incoming_base - shield_pips) + 1` |

All values `[TUNABLE]`. The key idea: **engines decide the exchange, weapons decide what you deal, shields decide what you absorb.** Every point in one system is a point not in another, so the allocation matters.

### 4.4 Ending a ship fight

- **Enemy Hull reaches 0:** the enemy ship is **disabled** and the player picks an authored follow-up: loot it, spare it, tow it, or (Phase 3) board it.
- **Player Hull reaches 0:** the ship is **crippled** and the player is incapacitated (section 7).
- **Withdraw option (Phase 2):** spend a round with maximum Engines to try to flee.

### 4.5 Phase 1 ship scope

Phase 1 ship combat is only: reactor, three-way allocation, the roll, the tier table, the Scanner hint, and victory/defeat. No range bands, no subsystem targeting, no boarding handoff, and no crew bonuses (all Phase 2 and later).

---

## 5. Modifiers Display

Follow the existing rule from `game-overview.md` section 5.3: show active modifiers at the point of choice. Example:

```
ROUND 2          Your Health: 8/12     Enemy Resolve: 5/8

The ganger sets his shoulder, ready to charge.   [Read: Clear]

  1. Attack       (Grit)          Bad matchup -2
  2. Defend       (Grit)          Matched counter +3
  3. Outmaneuver  (Nerve)         Neutral
  4. Negotiate    (Silver Tongue) Locked: enemy will not talk

Active modifiers: Hold the Line (-1 damage taken), Hearthfire High (+1)
```

Result text after the roll should always include the tier, the damage dealt and taken, and any modifier that changed the outcome, in one or two short lines.

---

## 6. Resources and Combat

| Resource | How combat affects it |
|---|---|
| **Health / Hull** | Lost in fights. Health restores fully when docked and regenerates 2 per day in travel (Kin ×1.5). Hull only recovers through paid repairs (`game-overview.md` section 4.4). |
| **Wear** (Ironkin) | Rises from damage and from using abilities. |
| **Supplies** | Spent on repairs after a fight. |
| **Ore** | Lost on defeat, gained on victory loot. |
| **Hearthfire** | Rises on shared victories, falls on defeats and crew losses. |
| **Cargo / Fuel** | Can be lost on defeat (see section 7). |

Phase 1 only needs Health/Hull, Wear, Ore, cargo, and Hearthfire.

---

## 7. Defeat and Incapacitation (No Death)

The player never dies and combat never ends the game. When Health (or Hull) reaches 0, or Ironkin Wear reaches 100, the player is **incapacitated**.

### 7.1 Resolution flow

```
1. Show the encounter's authored "defeat" text
2. Apply the encounter's defeat costs (default table below)
3. Rescue / recovery: player wakes up back at the console, safe
4. Restore Health and Hull to half of max (DEFEAT_RESTORE_FRACTION = 0.5),
   and set Ironkin Wear to 50 (DEFEAT_WEAR_RESET) if it was higher
5. Return to the console hub
```

This is the `PERMADEATH = false` default from `game-overview.md` section 5.4. Keep the flag so permadeath could be added later, but combat should never depend on it.

### 7.2 Default defeat costs `[TUNABLE]`

Each encounter can override these in data. The default is a roll on the following table or a fixed set, whichever the encounter specifies:

| Cost | Default |
|---|---|
| **Ore** | Lose 20-40% of current Ore |
| **Cargo** | Lose some trade goods or salvage (never mission-critical items unless the encounter says so) |
| **Crew** | Small chance a crew member leaves or is captured |
| **Hearthfire** | Drops by a set amount |
| **Grudge** | The winning side may become a grudge entry in the Logbook |
| **Debt oath** | The rescuer may demand an oath as repayment (reuses the oath system) |
| **Ship damage** | Modules damaged and need repair |

### 7.3 Safety rules (avoid soft-locks and death spirals)

- **Never take everything.** Defeat cannot reduce fuel below the amount needed to reach the nearest system, and cannot remove all Ore if the player would then be unable to afford repairs. A guaranteed minimum `[TUNABLE]` is preserved.
- **Rescue is guaranteed.** After incapacitation, the player always recovers. An authored rescue event or a generic fallback must exist.
- **No repeat spiral.** After a defeat, the next travel event with combat is suppressed or weakened `[DECIDED]`: a short grace period of one journey, behind a config flag `DEFEAT_GRACE` (default `true`).
- **Defeat is content.** Failing a fight should move the story somewhere interesting: a captured ship, a ransom, a debt, a rescued-by-a-stranger event. Authors should treat the defeat outcome as a full branch.

### 7.4 Ironkin at critical Wear

An Ironkin at Wear 100 is incapacitated until repaired, even if Health is above 0. Resolve this with the same defeat flow, but the cost leans toward Supplies and Ore for repairs instead of cargo loss.

---

## 8. Data Model

Keep combat content in data files.

```
data/
  config.json            # add combat [TUNABLE] values and flags (see 8.4)
  enemies.json           # personal-combat enemy templates
  enemy_ships.json       # ship-combat templates
  combat_encounters.json # encounters: which enemy, outcomes for every end state
```

### 8.1 Enemy template (personal combat)

```json
{
  "key": "PIRATE_BOARDER",
  "display_name": "Pirate Boarder",
  "resolve": 6,
  "defense_difficulty": 11,
  "damage_bonus": 0,
  "read_difficulty": 8,
  "intent_weights": { "aggressive": 5, "guarded": 3, "evasive": 2 },
  "negotiable": true,
  "negotiation_difficulty": 13,
  "telegraphs": {
    "aggressive": ["The boarder lowers his shoulder and charges."],
    "guarded": ["She braces behind a bulkhead door."],
    "evasive": ["He edges toward the airlock, eyes darting."]
  }
}
```

### 8.2 Enemy ship template

```json
{
  "key": "RAIDER_SKIFF",
  "display_name": "Raider Skiff",
  "hull": 10,
  "reactor_pips": 6,
  "allocation_weights": { "weapons": 4, "shields": 1, "engines": 1 },
  "defense_difficulty": 12
}
```

### 8.3 Encounter definition

```json
{
  "key": "DERELICT_AMBUSH",
  "mode": "personal",
  "enemies": ["PIRATE_BOARDER"],
  "outcomes": {
    "victory_broken": { "text": "...", "effects": [] },
    "victory_negotiated": { "text": "...", "effects": [] },
    "defeat": { "text": "...", "effects": [], "overrides_default_costs": false },
    "withdrew": { "text": "...", "effects": [] }
  }
}
```

Every encounter must define `victory_broken`, `defeat`, and, if negotiable, `victory_negotiated`. The `effects` use the existing effect applier (resource changes, reputation, flags, new messages, new oaths).

### 8.4 New config values

All `[TUNABLE]` unless noted.

```
COMBAT_STARTING_HEALTH_BASE = 10
COMBAT_HEALTH_PER_GRIT = 2
COMBAT_MATCHED_BONUS = 3
COMBAT_BAD_MATCHUP_PENALTY = -2
COMBAT_ADVANTAGE_BONUS = 2
COMBAT_DAMAGE_TABLE = { crit: [3,0], success: [2,0], partial: [1,1], failure: [0,2] }
COMBAT_WEAR_PER_HEALTH_DAMAGE = 2
SHIP_BASE_REACTOR_PIPS = 6
SHIP_BASE_HULL = 20      # base starting kit, see game-overview.md section 4.2
MODULE_CAP_BASE = 2      # system cap = MODULE_CAP_BASE + module level
REACTOR_PIPS_PER_LEVEL = 1
MODULE_MAX_LEVEL = 3
DEFEAT_RESTORE_FRACTION = 0.5   # Health and Hull after incapacitation
DEFEAT_WEAR_RESET = 50          # Ironkin Wear after incapacitation
DEFEAT_ORE_LOSS_RANGE = [0.2, 0.4]
DEFEAT_GRACE = true      # [DECIDED] flag
PERMADEATH = false       # already in game-overview.md
```

---

## 9. Implementation Plan

### Phase 1: Minimum playable combat (build this first)

Goal: both combat modes work end to end with simple data, and defeat leads to a safe recovery.

1. **Combat state object** held inside the single serializable game state, so save and load work mid-fight.
2. **Personal combat loop:**
   - Health and Resolve meters.
   - Enemy intent selection from weights.
   - Telegraph text with Clear and Vague clarity.
   - Four stances, with Negotiate limited to basic behavior (section 3.6, Phase 1).
   - Matchup modifier, roll through the existing roll resolver, tier damage table, stance adjustments.
   - Advantage token from Outmaneuver.
3. **Class passives:** Hold the Line, Plated Bulwark (with Wear), Pathfinder telegraph bonus.
4. **Ironkin Wear on damage taken.**
5. **Ship combat loop:** reactor pips, three-way allocation, module caps, enemy ship with weighted allocation, Scanner hint tiers, round roll, tier table, victory/defeat.
6. **Outcomes:** victory (broken or negotiated), defeat/incapacitation with the default cost table and safety rules (section 7), recovery back to the console.
7. **Console UI:** round screen showing meters, telegraph/hint, options with matchup modifiers, active modifiers, and result text.
8. **Data files:** `enemies.json`, `enemy_ships.json`, `combat_encounters.json`, combat values in `config.json`.
9. **Test content:** at least 2 personal enemies and 1 ship enemy, one negotiable and one not, to exercise every path.

**Phase 1 acceptance checks:**
- A fight ends in 2 to 5 rounds on average with default numbers.
- Every outcome (broken, negotiated, defeat) returns the player to the console with valid state.
- Defeat can never reduce resources below the safety floor and never ends the game.
- Save and load works mid-combat.
- Gender has no mechanical effect.
- All numbers come from config or data, none hardcoded.

### Phase 2: Depth and class identity

1. **Console actions in combat:** Muster the Hearth, Boarding Lead, Blood-Rage (with the Ironkin variants and Wear costs), Long-Range Scan and Strike, Calculate the Odds, Jury-Rig, and the rest, as round modifiers.
2. **Subclass traits** that affect combat (Shield-Oath, Tunnel-Born, Patient Hunter, and so on).
3. **Negotiate with leverage** tied to the Logbook (grudges, faction ties, scan knowledge).
4. **Misleading telegraphs** and bad-read consequences.
5. **Injuries:** persistent penalties from heavy hits (for example "Cracked ribs: -1 Grit until rested"). Kin recover through rest, Ironkin through Wear and maintenance.
6. **Crew as modifiers:** crew traits give passive bonuses to rolls.
7. **Withdraw action** for both modes.
8. **Ship combat depth:** range bands (Close, Medium, Long) and subsystem targeting (engines, weapons, shields, cargo).

### Phase 3: Kin identity and connected systems

1. **Oaths in combat:** swearing a battle oath for a bonus, with Hearthfire and reputation penalties if broken.
2. **Grudge duels:** settling a grudge opens a special fight with its own rules (witnessed duel, an enemy who knows your habits).
3. **Boarding handoff:** disabling a ship leads into a personal-combat boarding scene.
4. **Hearthline crew commitments:** commit one crew trait per round, once per fight each.
5. **Objective-based fights:** protect the cargo, hold the airlock for N rounds, capture the captain alive, reach the reactor.
6. **Relic effects in combat:** relic benefits and drawbacks as combat modifiers.
7. **Balance pass** across enemies, modules, and classes, using real playtest data.

---

## 10. Design Decisions

| Question | Decision |
|---|---|
| Fight length target | 2 to 5 rounds |
| Death | Not possible. Only incapacitation (`PERMADEATH = false`). |
| Crew in fights | Modifiers only in Phase 2. Hearthline commitments in Phase 3. |
| Reactor pips: fixed or upgradeable | Upgradeable via the reactor module `[DECIDED]` |
| Grace period after defeat | Enabled (`DEFEAT_GRACE = true`) |
| Can the player buy or craft healing items mid-fight | Not in Phase 1 |
| Enemy attack rolls: separate from player roll | No. One roll per round decides the whole exchange (keeps rounds fast). |
