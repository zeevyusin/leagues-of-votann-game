# Character Creation & Classes Spec

Text-based adventure game themed on the Leagues of Votann. The player's interface is a spaceship console. This document specifies **character creation, kin types, base classes, subclasses, and the Wear meter**. Story, combat details, and ship systems are out of scope here.

> **Conventions**
> - Anything marked `[TUNABLE]` is a placeholder number to be balanced later. Put these in a config/data file, never hardcode them in logic.
> - Anything marked `[DECIDED]` is a resolved design question. Still implement the decision behind a config flag so it can be changed later.
> - Lore names (Hearthkyn, Einhyr, Brôkhyr, etc.) were written from memory. Keep display names in a data file so they are easy to correct.

---

## 1. Core Data Model

### 1.1 Stats

Five stats. Every character has all five.

| Stat key | Display name | Governs |
|---|---|---|
| `grit` | Grit | Combat, endurance, resisting damage |
| `craft` | Craft | Repair, engineering, salvage |
| `wits` | Wits | Scanning, lore, analysis |
| `silver_tongue` | Silver Tongue | Trade, diplomacy, oaths |
| `nerve` | Nerve | Piloting, risk-taking, initiative |

Starting value for every stat: `2` `[TUNABLE]`.

### 1.2 Enums

```
Gender      = MALE | FEMALE
KinType     = KIN | IRONKIN
BaseClass   = WARRIOR | PATHFINDER | ARTIFICER | SPEAKER
Subclass    = see section 4 (10 total)
```

### 1.3 Character object

```json
{
  "name": "string",
  "gender": "MALE | FEMALE",
  "kin_type": "KIN | IRONKIN",
  "base_class": "WARRIOR | PATHFINDER | ARTIFICER | SPEAKER",
  "subclass": "string (must belong to base_class)",
  "stats": { "grit": 0, "craft": 0, "wits": 0, "silver_tongue": 0, "nerve": 0 },
  "bonus_points_remaining": 0,
  "passives": ["string"],
  "console_action": "string",
  "subclass_trait": "string",
  "wear": 0,
  "hearthfire_modifiers": {}
}
```

- `wear` exists **only** for `IRONKIN`. For `KIN` it is `null`/absent.
- Gender is **cosmetic and dialogue flavor only**. It must have **no mechanical effect**. Use it for pronouns and dialogue variants.

---

## 2. Character Creation Flow

Linear, six steps. Each step validates before advancing. The player may go back and change earlier choices; changing an earlier choice must re-validate or reset later steps (for example, changing base class resets subclass).

| Step | Prompt | Input | Validation |
|---|---|---|---|
| 1 | Name | free text | 1 to 24 chars, non-empty, trimmed `[TUNABLE]` |
| 2 | Gender | `MALE` or `FEMALE` | must be one of the two |
| 3 | Kin type | `KIN` or `IRONKIN` | show perks and drawbacks (section 3) before confirming |
| 4 | Base class | one of 4 | show stat bonuses and the passive **for the chosen kin type** (section 4) |
| 5 | Subclass | one of the subclasses under the chosen base class | must belong to chosen base class |
| 6 | Bonus points (see below) then Confirmation | allocation, then confirm | all points spent; show full summary |

**Class and subclass are both chosen at creation.** There is no later unlock.

**Ironkin can choose any base class and any subclass**, same as Kin. Ironkin differ only through the modifiers in section 3 and the passive/subclass variants in section 4.

### Confirmation screen must show
- Name, gender, kin type
- Base class, subclass
- Final stats
- Passive (kin or ironkin version), console action, subclass trait
- Starting Wear (Ironkin only) and starting Hearthfire modifiers

### `[DECIDED]` Bonus stat points
After class selection the player distributes **3** bonus points `[TUNABLE]` across the five stats (max +2 to any single stat from this pool `[TUNABLE]`).
Alternate (kept behind the flag, not used): fixed starting stats per class, no allocation.
Implement behind a config flag `ALLOW_BONUS_POINTS` (default `true`).

---

## 3. Kin Type Rules

### 3.1 Regular Kin

**Perks**
- **Quick Recovery:** regenerates Health 1.5x faster while travelling (`[TUNABLE]` multiplier; see `game-overview.md` section 4.4).
- **Hearth-Bonded:** better dialogue options, larger reputation gains from social actions, and stronger Hearthfire bonuses from social actions and rest.

**Drawbacks**
- **Vulnerable:** takes full effect from environmental hazards (vacuum, radiation, toxins, extreme temperature) and is more susceptible to injuries.

### 3.2 Ironkin

**Perks**
- **Reinforced Frame:** +1 Grit. Immune or strongly resistant to vacuum, radiation, toxins, extreme heat and cold. Hazard events that harm Kin are routine for Ironkin.
- **Tireless:** immune to **fatigue** (see `game-overview.md` section 4.4.1), so long stretches without docking cost Ironkin nothing.
- **Machine Link:** extra console options when interfacing with ship systems, ancient machinery, and Votann tech (for example "Jack in to the derelict's core").

**Drawbacks**
- **Wear meter** (section 3.3).
- **Low Hearthfire influence:** Ironkin do not gain morale from rest and feasts the way Kin do. They gain it from other sources: completing oaths, crew-bonding events.
- **Social friction:** some NPC factions are wary or prejudiced, which means locked or harder dialogue options. Other factions (for example Brôkhyr or Arkanyst-aligned NPCs) are more respectful. Model this as a **per-faction reputation modifier**, not a flat penalty.

### 3.3 Wear meter (Ironkin only)

- Range: `0` to `100`. Starts at `0` `[TUNABLE]`.
- **Increases when:** taking damage or using the class console action. (Passive rise from going too long without maintenance applies only in `CONSTANT` mode, see below.)
- **Maintenance:** spend Supplies, or pass a Craft check. A ship workshop module reduces the cost.

| Wear range `[TUNABLE]` | State | Effect |
|---|---|---|
| 0 to 39 | Nominal | No effect |
| 40 to 69 | Strained | Penalty to Nerve and Craft rolls |
| 70 to 99 | Failing | Larger penalty; risk of malfunction events |
| 100 | Critical | Incapacitated until repaired |

**`[DECIDED]` Wear pressure model: `ON_PUSH`**
- `ON_PUSH` (chosen): Wear only rises from damage and using abilities. Lighter on the player.
- `CONSTANT` (alternate, kept behind the flag): Wear also rises passively over time (travel, days elapsed). Ironkin feel distinct but need steady upkeep.
Implement behind a config flag `WEAR_MODE` (default `ON_PUSH`).

---

## 4. Base Classes and Subclasses

Each base class gives:
- A **stat bonus** applied at creation (`[TUNABLE]` values; suggested `+1` per listed stat).
- A **passive**, with a **Kin version** and an **Ironkin version**.

Each subclass gives:
- One **console action** (usable from the ship console; Ironkin may get a modified version).
- One **trait** (passive effect).
- `focus_stats` (informational, used for UI hints and future AI/NPC logic; no mechanical effect at creation).

### 4.1 Base class table

| Base class | Theme | Stat bonus | Kin passive | Ironkin passive |
|---|---|---|---|---|
| `WARRIOR` | The Hearth's shield. Solves problems with force. | +1 Grit | **Hold the Line:** small damage reduction in combat | **Plated Bulwark:** larger damage reduction, but each hit adds a little Wear |
| `PATHFINDER` | The frontier eyes. Solves problems with information and positioning. | +1 Nerve, +1 Wits | **Sharp Senses:** reveals extra detail on scans and travel events | **Sensor Suite:** scans reveal even more detail, but cost Wear when pushed |
| `ARTIFICER` | The Ancestors' hands. Solves problems with tech and relics. | +1 Craft, +1 Wits | **Tinker's Eye:** salvage bonus and cheaper repairs | **Self-Maintenance:** repair own Wear for free once per journey |
| `SPEAKER` | The voice of the Kin. Solves problems with oaths and deals. | +1 Silver Tongue | **Oath-Weight:** NPCs take your promises more seriously | **Unbreakable Word:** oaths you keep give extra reputation, but broken oaths hurt more |

Ironkin also get +1 Grit from Reinforced Frame (section 3.2), applied on top of the base class bonus.

### 4.2 Subclass table (10 total)

#### WARRIOR (3 subclasses)

| Subclass key | Display name | focus_stats | Console action | Trait |
|---|---|---|---|---|
| `HEARTHKYN_WARRIOR` | Hearthkyn Warrior | grit, nerve | **Muster the Hearth:** boosts crew morale and combat rolls for the next encounter | **Shield-Oath:** reduces damage when defending crew or cargo |
| `EINHYR_HEARTHGUARD` | Einhyr Hearthguard | grit, craft | **Boarding Lead:** strong advantage in boarding and ship-to-ship melee | **Old Guard:** resists morale loss |
| `CTHONIAN_BERSERK` | Cthonian Berserk | grit, nerve | **Blood-Rage:** huge combat bonus with a morale or injury cost | **Tunnel-Born:** excels in cramped derelicts and cave sites |

#### PATHFINDER (2 subclasses)

| Subclass key | Display name | focus_stats | Console action | Trait |
|---|---|---|---|---|
| `HERNKYN_PIONEER` | Hernkyn Pioneer | nerve, wits | **Chart Safe Route:** reduces travel event risk and fuel cost | **Lay of the Land:** bonuses on planetary surfaces |
| `HERNKYN_YAEGIR` | Hernkyn Yaegir | wits, nerve | **Long-Range Scan and Strike:** first-strike bonus and spots ambushes early | **Patient Hunter:** advantage when you choose to wait or observe |

#### ARTIFICER (2 subclasses)

| Subclass key | Display name | focus_stats | Console action | Trait |
|---|---|---|---|---|
| `BROKHYR_IRONMASTER` | Brôkhyr Iron-master | craft, wits | **Jury-Rig:** emergency repair on any ship module | **Forge-Wise:** cheaper upgrades and better salvage |
| `ARKANYST_EVALUATOR` | Arkanyst Evaluator | wits, craft | **Evaluate Relic:** reveals a relic's true effects and drawbacks before you commit | **Ancestor-Lore:** unlocks special dialogue and discoveries |

#### SPEAKER (3 subclasses)

| Subclass key | Display name | focus_stats | Console action | Trait |
|---|---|---|---|---|
| `THEYN_KAPITAN` | Theyn / Kapitan | silver_tongue, grit | **Swear an Oath:** better job terms, plus a morale bonus when you keep the oath | **Voice of the Hearth:** bonuses with your own League |
| `PROSPECTOR_TRADER` | Prospector-Trader | silver_tongue, wits | **Haggle:** better prices and unlocks black-market contacts | **Eye for Ore:** spots valuable cargo and contracts |
| `MEMNYR_STRATEGIST` | Memnyr Strategist | wits, silver_tongue | **Calculate the Odds:** previews outcome chances before a risky choice | **Long Memory:** makes grudges and oaths easier to track and resolve |

Total: 3 + 2 + 2 + 3 = **10 subclasses**.

### 4.3 Ironkin console action modifiers

Console actions have an optional `ironkin_variant`. If an Ironkin picks a subclass with a variant, use it instead of the base version. General pattern: **stronger effect, adds Wear.** Subclasses not listed here use the standard action, which still adds a small amount of Wear when used by Ironkin (`WEAR_PER_ACTION`, `[TUNABLE]`, suggested 5).

| Subclass | Ironkin variant |
|---|---|
| `HEARTHKYN_WARRIOR` | Muster the Hearth also restores a bit of Wear for the crew's Ironkin |
| `CTHONIAN_BERSERK` | Blood-Rage bonus is doubled, but adds a large amount of Wear |
| `BROKHYR_IRONMASTER` | Jury-Rig can also be used to repair the Iron-master's own Wear |
| `MEMNYR_STRATEGIST` | Calculate the Odds shows exact percentages instead of descriptive hints |

---

## 5. Suggested Data Layout

Keep all content in data files so numbers and lore names can be edited without touching logic.

```
data/
  stats.json          # the 5 stats
  kin_types.json      # KIN and IRONKIN perks/drawbacks, wear thresholds
  base_classes.json   # 4 base classes: stat_bonus, kin_passive, ironkin_passive
  subclasses.json     # 10 subclasses: base_class, console_action, trait, ironkin_variant, focus_stats
  config.json         # ALLOW_BONUS_POINTS, WEAR_MODE, all [TUNABLE] values
```

Example `subclasses.json` entry:

```json
{
  "key": "CTHONIAN_BERSERK",
  "display_name": "Cthonian Berserk",
  "base_class": "WARRIOR",
  "focus_stats": ["grit", "nerve"],
  "console_action": {
    "name": "Blood-Rage",
    "description": "Huge combat bonus with a morale or injury cost.",
    "ironkin_variant": {
      "description": "Bonus is doubled, but adds a large amount of Wear.",
      "wear_cost": 25
    }
  },
  "trait": {
    "name": "Tunnel-Born",
    "description": "Excels in cramped derelicts and cave sites."
  },
  "starting_kit": { "hull": 5 }
}
```

---

## 6. Implementation Checklist

1. Load all data files and validate that every subclass references an existing base class.
2. Build the six-step creation flow with per-step validation and backward navigation (changing base class resets subclass; changing kin type refreshes the displayed passive).
3. Compute final stats: `starting (2 each) + base class bonus + (Ironkin: +1 Grit) + allocated bonus points`.
4. Assign the correct passive version (Kin or Ironkin) based on `kin_type`.
5. Initialize `wear = 0` for Ironkin only; leave absent for Kin.
5a. Apply the base starting kit plus the subclass bonus from `starting_kit` (see `game-overview.md` section 4.2).
5b. Enforce `STAT_MAX = 8` on every stat (not reachable at creation with default values, but validate anyway).
6. Render the confirmation screen, then write the finished character object.
7. Ensure gender never affects any numeric or mechanical outcome.
8. Expose `ALLOW_BONUS_POINTS` and `WEAR_MODE` as config flags.

## 7. Related specs

This file covers characters and classes only. The rest is specced elsewhere:
- Story and narrative: `story.md`
- Combat rules: `combat-system.md`
- Ship modules, travel, resources, oaths, grudges, reputation, relics and level progression: `game-overview.md`
