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

**Misleading reads `[DECIDED]` (Milestone 3):**
- Only enemies whose template has `deceptive: true` can mislead (for example Kommandos, Snazrik's freebooters, and Gitzbolt's grots).
- When the read against a deceptive enemy would be **Vague**, there is a `MISLEAD_CHANCE` that the telegraph shows the text of a **wrong** intent instead.
- A **Clear** read is never misleading.
- Long-Range Scan and Strike and Calculate the Odds always show the true intent.
- The only consequence is the bad matchup itself. The modifiers display never reveals that a read was false. After the round, the result text says what the enemy really did, so the player learns which enemies lie.

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

`[DECIDED]` (Milestone 3):
- **Leverage sources.** An enemy template lists them as `leverage: [{ requires, text }]`. `requires` uses the normal condition evaluator, for example:
  - a grudge entry,
  - a story flag or lore entry,
  - reputation of Friendly or better with the enemy's faction,
  - a scan made this fight.
- **Bonus.** Each source the player meets gives +`LEVERAGE_BONUS` (2) to Negotiate, up to +`LEVERAGE_MAX` (4). The modifiers display names each source, for example "Leverage: you know Grizzgut's grudge +2".
- **Hardened enemies.** Templates with `hardened: true` get +`HARDENED_NEGOTIATION_PENALTY` (3) to their `negotiation_difficulty` unless the player has at least one leverage source.

### 3.7 Ironkin and Wear in personal combat

- Taking Health damage adds Wear to Ironkin `[TUNABLE]` (suggested `+2` Wear per point of Health damage).
- Using a class console action adds Wear as already defined in `character-creation.md`.
- Wear penalties (Strained, Failing) apply to Nerve and Craft rolls, which makes Outmaneuver weaker. Critical Wear (100) incapacitates the player (section 7).

### 3.8 Injuries `[DECIDED]` (Milestone 3)

Heavy hits leave lasting marks. Injuries are personal-combat only, and the ship has no equivalent.

- **When.** The player gains an injury when either of these happens:
  - they take `INJURY_HIT_THRESHOLD` (4) or more Health damage in a single round, after reductions, or
  - they are defeated in personal combat.
- **Which.** A random injury from `injuries.json` that the player does not already have.
  - Each injury is a small penalty, for example "Cracked ribs: -1 Grit" or "Ringing skull: -1 Wits".
  - Ironkin get damage-flavored variants of the same penalties, for example "Buckled servo: -1 Nerve".
- **Limit.** At most `INJURY_MAX` (3) injuries at once. Further triggers add nothing.
- **Recovery:**
  - **Kin:** a **Rest** option at any port market costs `INJURY_REST_DAYS` (3) days docked and heals one injury.
  - **Ironkin:** a **Maintenance** option at any port market costs `INJURY_REPAIR_ORE` (20) Ore and repairs one injury at once.
  - Defeat recovery (section 7.1) does **not** clear injuries.
- **Display.** Injuries appear on the status bar, on the Ship and Cargo screen and in the modifiers display. Penalties apply to every roll that uses the stat, not only in combat.
- **Data.** The five injuries live in `data/injuries.json`, one per stat.

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

**Enemy systems matter `[DECIDED]` (Milestone 2):** the enemy's allocation works the same way as yours.
- The enemy's **engine pips add to its `defense_difficulty`** for that round.
- The enemy's **shield pips reduce the damage you deal** (`max(0, damage - enemy_shield_pips)`, applied after the critical multiplier).
- This makes the Scanner hint a real decision: heavy enemy shields favor a defensive round, heavy enemy engines favor putting pips into your own engines. Enemy ship Hull values are lowered to keep fights at 2 to 5 rounds.

### 4.3.1 Range bands `[DECIDED]` (Milestone 3)

- **Choosing a band.** The player sets a preferred range: **Close**, **Medium**, or **Long**. It is a standing order on step 2 of the allocation, and changing it does not use the round.
- **Who gets their band:**
  - If the player's engine pips are higher than the enemy's, the player's band is used.
  - If they are equal, the range does not change.
  - If the enemy's engines are higher, the enemy's `preferred_range` is used. This is a template field: brawlers want Close, gunships want Long.
- **Starting band.** Fights start at Medium, unless the encounter sets `start_range`.

| Band | Effect `[TUNABLE]` |
|---|---|
| Close | +`RANGE_CLOSE_DAMAGE` (1) damage dealt **and** taken, applied after shields. |
| Medium | No change. |
| Long | -`RANGE_LONG_DAMAGE` (1) damage dealt **and** taken (minimum 0). Withdraw rolls get +`RANGE_LONG_WITHDRAW` (3). |

The band for the round is shown before the roll. The enemy's preferred band is part of the Scanner hint at Mid quality or better.

### 4.3.2 Subsystem targeting `[DECIDED]` (Milestone 3)

- **Choosing a target.** The player may aim at an enemy **Weapons**, **Shields**, or **Engines** system instead of the hull. Like the range, it is a standing order on step 2 that stays until changed. The default is the hull, with no change.
- **Cost.** Targeting adds +`TARGET_DIFFICULTY` (3) to the round's difficulty.
- **Effect.** On a hit, damage is dealt as normal, and the targeted system loses pips from the enemy's budget for the **next round**:
  - Success: `TARGET_PIPS_SUCCESS` (1) pip.
  - Critical: `TARGET_PIPS_CRIT` (2) pips.

  The enemy's pattern spends the reduced budget. A system cannot go below 0.
- **No effect on a miss.** Partial and Failure do not knock out any pips.

### 4.4 Ending a ship fight

- **Enemy Hull reaches 0:** the enemy ship is **disabled** and the player picks an authored follow-up: loot it, spare it, tow it, or (Phase 3) board it.
- **Player Hull reaches 0:** the ship is **crippled** and the player is incapacitated (section 7).
- **Withdraw option (Phase 2):** spend a round with maximum Engines to try to flee.

### 4.4.1 Withdraw `[DECIDED]` (Milestone 2)
Only encounters with `allow_withdraw: true` offer it (story-critical fights usually don't).
- **Personal:** roll Nerve vs the enemy's `defense_difficulty`. Success or better: you escape. Partial: you escape but take the Partial damage. Failure: you take Failure damage and the fight goes on.
- **Ship:** the round's allocation is forced to maximum Engines (the rest into Shields). Roll Nerve + engine pips vs the enemy's `defense_difficulty` + enemy engine pips, with the same results.
- Escaping uses the encounter's `withdrew` outcome: no loot, no defeat costs, no XP. If the fight belonged to a story beat, the beat still completes, with the `withdrew` result.

### 4.5 Phase 1 ship scope

Phase 1 ship combat is only: reactor, three-way allocation, the roll, the tier table, the Scanner hint, and victory/defeat. No range bands, no subsystem targeting, no boarding handoff, and no crew bonuses (all Phase 2 and later). Range bands, targeting and boarding arrive in Milestone 3 (sections 4.3.1, 4.3.2 and Phase 3).

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
# Milestone 3
MISLEAD_CHANCE = 0.33
LEVERAGE_BONUS = 2
LEVERAGE_MAX = 4
HARDENED_NEGOTIATION_PENALTY = 3
INJURY_HIT_THRESHOLD = 4
INJURY_MAX = 3
INJURY_REST_DAYS = 3
INJURY_REPAIR_ORE = 20
RANGE_CLOSE_DAMAGE = 1
RANGE_LONG_DAMAGE = 1
RANGE_LONG_WITHDRAW = 3
TARGET_DIFFICULTY = 3
TARGET_PIPS_SUCCESS = 1
TARGET_PIPS_CRIT = 2
DUEL_HABIT_WEIGHT = 3
DUEL_ADAPT_AFTER = 2
DUEL_WITNESS_HEARTHFIRE = 10
DUEL_WITNESS_REPUTATION = 5
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

`[DECIDED]` Milestone 2 builds items 1, 2, 7, and enemy shields/engines (section 4.3). Milestone 3 builds items 3, 4, 5, and 8 (sections 3.6, 3.2, 3.8, 4.3.1 and 4.3.2). Item 6 (crew as roll modifiers) already exists through crew traits.

**Console actions in combat (Milestone 2):** once per fight, the player may use their subclass console action instead of picking a stance or allocation. It takes the round's choice but no roll is made against the player that round. Ironkin pay the action's Wear cost. Effects `[TUNABLE]`, stored as `combat` on each subclass's `console_action`:

| Console action | Combat effect |
|---|---|
| Muster the Hearth | +2 to all your rolls for the rest of the fight, +5 Hearthfire. Ironkin: also -10 Wear. |
| Boarding Lead | +3 to your next two personal-combat rolls. Personal combat only. |
| Blood-Rage | +4 to all rolls for the rest of the fight, costs 2 Health. Ironkin: +8 instead, +25 Wear. |
| Chart Safe Route | Ship only: your next Withdraw succeeds automatically, even if the encounter does not normally allow it. |
| Long-Range Scan and Strike | Reveals every enemy intent for the rest of the fight and deals 2 damage at once. |
| Jury-Rig | Ship only: restore 4 Hull. Ironkin: also -15 Wear. |
| Evaluate Relic | No combat use. |
| Swear an Oath | +2 to all rolls for the rest of the fight; +10 Hearthfire on victory, -10 on defeat. |
| Haggle | +3 to Negotiate for the rest of the fight. Personal combat only. |
| Calculate the Odds | Reveals every enemy intent for the rest of the fight and shows your odds on each option. |

**Subclass traits in combat (Milestone 2)** `[TUNABLE]`, stored as `combat` on each subclass's `trait`:

| Trait | Combat effect |
|---|---|
| Shield-Oath | Defend reduces damage by 1 more. |
| Old Guard | Defeat does not cost Hearthfire. |
| Tunnel-Born | +2 to all rolls in encounters tagged `cramped`. |
| Lay of the Land | +2 to all rolls in encounters tagged `surface`. |
| Patient Hunter | A successful Defend also grants Advantage. |
| Forge-Wise | No combat effect. Module upgrades cost 20% less at port markets (`game-overview.md` section 4.5). |
| Eye for Ore | +25% Ore from encounter victory effects. |
| Others | No combat effect. |

1. **Console actions in combat:** Muster the Hearth, Boarding Lead, Blood-Rage (with the Ironkin variants and Wear costs), Long-Range Scan and Strike, Calculate the Odds, Jury-Rig, and the rest, as round modifiers.
2. **Subclass traits** that affect combat (Shield-Oath, Tunnel-Born, Patient Hunter, and so on).
3. **Negotiate with leverage** tied to the Logbook (grudges, faction ties, scan knowledge).
4. **Misleading telegraphs** and bad-read consequences.
5. **Injuries:** persistent penalties from heavy hits (for example "Cracked ribs: -1 Grit until rested"). Kin recover through rest, Ironkin through Wear and maintenance.
6. **Crew as modifiers:** crew traits give passive bonuses to rolls.
7. **Withdraw action** for both modes.
8. **Ship combat depth:** range bands (Close, Medium, Long) and subsystem targeting (engines, weapons, shields, cargo).

### Phase 3: Kin identity and connected systems

`[DECIDED]` Milestone 3 builds items 2 and 3, because Act 3 depends on them. Milestone 4 builds items 1, 4, 6 and 7. Item 5 (objective-based fights) stays for a later update.

**Battle oaths (Milestone 4).**
- **When.** In round 1 of any fight, before the first choice, the player may swear one battle oath. Swearing does not use the round.
- **The oaths** `[TUNABLE]`, in `data/battle_oaths.json`:

| Oath | Bonus for the fight | Broken if |
|---|---|---|
| Oath of No Retreat | +1 to all rolls | you Withdraw or are defeated |
| Oath of Mercy | +2 to Negotiate | the fight ends with the enemy broken by force (victory_broken) |
| Oath of the Unbowed | +1 to all rolls, and +1 Resolve damage on a critical | your Health (or Hull) drops below half |

- **Kept:** +`BATTLE_OATH_KEPT_HEARTHFIRE` (5) Hearthfire and +2 reputation with Hold Durnvar.
- **Broken:** -`BATTLE_OATH_BROKEN_HEARTHFIRE` (10) Hearthfire and -5 reputation with Hold Durnvar. Unbreakable Word (Ironkin Speaker) and the Oathband of the Kâhl apply as for other oaths.
- Battle oaths are not Logbook oaths: they last one fight and leave a single result line.

**Hearthline crew commitments (Milestone 4).**
- **The rule.** Each crew member with a commitment can be committed **once per fight**. Committing is a free action that changes **the current round** only, and is chosen before the stance or allocation.
- **The commitments** `[TUNABLE]`, stored as `commitment` on each crew member in `crew.json`:

| Crew | Mode | Effect this round |
|---|---|---|
| Old Dorrik | Ship | Emergency patch: restore 3 Hull |
| Ylsa | Ship | Evasive burn: +3 to the roll |
| Fleet-Theyn Hrolla Vask | Both | Fleet-Theyn's command: +2 to the roll; +5 Hearthfire if the fight is won |
| Brokka | Personal | Hammer blow: +2 Resolve damage if the round's roll succeeds |

- Crew lost or sent away cannot be committed. New crew added later only need a `commitment` entry.

**Relic effects in combat (Milestone 4).** Equipped relics (`game-overview.md` 6.3.1) add their combat modifiers to every fight and show in the modifiers display under the relic's name.

**Balance pass (Milestone 4)** `[DECIDED]`: one mode, "fair but tense". The pass tunes enemy numbers, module prices, the void battle waves and XP using the automated playthroughs. A **careful** test player (balanced allocation, uses the counter-key and crew commitments, repairs and treats injuries) must hit these targets, measured over at least 60 seeded runs:

| Measure | Target |
|---|---|
| Act 1 and Act 2 fights lost | 15% to 30% |
| Void battle won (2 threads, no early launch) | 70% to 90% |
| Warboss fight won | 70% to 90% |
| Fight length | 2 to 5 rounds on average (8 at most for Skragnak) |
| Early launch with fewer than 2 threads | the battle is lost more often than won |

The existing simple test player must still finish every run.

**Grudge duel (Milestone 3).** An encounter with `duel: true` is a one-on-one personal fight in front of witnesses:
- **No Withdraw and no Negotiate.** Not even Chart Safe Route opens a way out (encounter flag `inescapable`).
- **The enemy knows your habits.** The game counts the stances the player uses across the whole campaign (`stance_counts`). A duelist's intent weights are shifted by `DUEL_HABIT_WEIGHT` toward the intent that makes the player's favorite stance a bad matchup.
- **The enemy adapts.** If the player uses the same stance `DUEL_ADAPT_AFTER` (2) rounds in a row, the duelist's next intent is the one that counters it, and the telegraph hints at it: "He's seen that before."
- **Witnessed.**
  - Winning a duel gives `DUEL_WITNESS_HEARTHFIRE` Hearthfire, plus `DUEL_WITNESS_REPUTATION` reputation with the watching faction if the encounter names one (`witness_faction`).
  - Losing one costs that Hearthfire.
- **Used by:** Skragnak (The Duel resolution) and Grizzgut's third appearance (story.md section 8).

**Boarding handoff (Milestone 3).**
- **The offer.** A ship encounter can name a personal encounter in `boarding`. When the enemy ship is disabled, the follow-up list adds **Board her**, which starts that personal fight at once.
- **Carried over.** The player's Health, injuries and console-action use carry over from the ship fight.
- **Outcomes.** The boarding fight's outcome replaces the ship fight's loot outcome:
  - victory gives the boarding loot,
  - defeat uses the boarding fight's defeat outcome, and
  - the ship counts as disabled either way.
- **Used by:** the void battle's gunship (to recover the Core) and the flagship (beat 3.3). Any Act 2 ship encounter can also use it through data.

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
| Injuries | From a 4+ Health hit or a personal defeat; Kin rest 3 days at port, Ironkin pay Ore; max 3 (section 3.8) |
| Range bands and targeting | Light version: three bands decided by engine pips, +3 difficulty to knock out enemy pips next round (sections 4.3.1, 4.3.2) |
| Misleading reads | Only `deceptive` enemies, only when the read would be Vague (section 3.2) |
| Phase 3 in Milestone 3 | Grudge duel and boarding handoff only |
| Phase 3 in Milestone 4 | Battle oaths, Hearthline crew commitments, relic effects, balance pass. Objective fights later. |
| Difficulty target | Fair but tense (balance pass targets in Phase 3) |
