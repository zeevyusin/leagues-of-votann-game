# Story Spec: "Grudge into Waaagh!"

Part of the Leagues of Votann text adventure. This document specifies the **main campaign storyline, its structure, and how story content plugs into the existing systems**. It builds on `game-overview.md` (console, oaths, grudges, reputation, events), `character-creation.md` (classes, kin types), and `combat-system.md` (encounters, Resolve, defeat).

> **Conventions**
> - `[TUNABLE]` marks a placeholder number to be balanced later. Keep these in `config.json` or story data files, never hardcoded in logic.
> - `[DECIDED]` marks a resolved design question. Still implement the decision behind a config flag so it can be changed later.
> - All NPC, place, and faction names below are **original placeholders**. Keep display names in data files so they are easy to change.
> - Beats are written as design notes. The final text is authored later in `story_beats.json` (section 10).

---

## 1. Story Pillars

1. **One story, every class.** The player is always a **ship captain in the same prospecting fleet**. Class and subclass explain *which ship* and *what job*, never *whether* the player belongs in the story.
2. **Same goal, different routes.** Every main beat has one goal shared by all players. Each class has a preferred route to it, and every route is open to anyone through stat rolls (section 3).
3. **Personal, then epic.** The story starts as a personal grudge (one raid, one Warboss) and grows into a region-wide Waaagh! that threatens the player's Hold.
4. **Orks are not a monolith.** Different Ork groups want different things. Some can be fought, some bribed, some turned against each other.
5. **The systems are the story.** The main plot is tracked as a grudge and an oath in the Logbook. Reputation, relics, and Hearthfire feed directly into how the ending plays out.

---

## 2. Premise

The player's ship is part of the **Durn Prospect Fleet**, a small expedition from **Hold Durnvar** surveying the **Ashfall Reach**, a frontier region on the edge of League space. On the world **Kethra's Anvil**, the fleet finds a sealed **ancestor vault** holding old Votann technology, including a relic power source called the **Ancestor Core**.

The find attracts Orks. **Big Mek Gitzbolt**, an Ork Mek who has been scavenging Votann tech across the Reach, wants the Core to power his new super-weapon. He brings the warband of **Warboss Skragnak** with him. The raid breaks the fleet, steals the Core, and captures the fleet's leader, **Fleet-Theyn Hrolla Vask**. The player escapes with one damaged ship and a handful of crew.

The Ork raid was only the beginning. With the Core powering Gitzbolt's weapon, Skragnak becomes the strongest boss in the Reach, and Orks start flocking to him. A **Waaagh!** is building, and its path leads toward Hold Durnvar.

The player's arc: **survive the raid -> swear vengeance -> gather strength -> break the Waaagh! and settle the grudge.**

---

## 3. Class-Neutral Design Rules

### 3.1 Same goal, different routes

Every main-story beat defines:
- **One goal** (for example "get past the blockade").
- **Two to four routes**, each tied to a stat, class, subclass, kin type, item, or reputation gate.
- **One always-available fallback route** (usually a hard stat roll or a costly option such as paying Ore or taking damage), so **no beat can ever soft-lock**.

Class routes are **easier and better written**, not exclusive. A Warrior *can* try to talk past an Ork, but the roll is harder and the dialogue is blunter.

Route types per class (authoring guide):

| Class | Typical route | Typical cost |
|---|---|---|
| Warrior | Force, boarding, holding a position, challenging a boss | Health, Hull, Wear |
| Pathfinder | Hidden routes, scouting, ambush, avoiding the fight | Time, Fuel |
| Artificer | Repair, sabotage, Ork-tech hacking, relic use | Supplies, Wear |
| Speaker | Bribes, deals, oaths, turning Orks against each other | Ore, reputation, oaths owed |

### 3.2 Opening hook per subclass

The first Comms message (beat 1.1) has one variant per subclass, explaining the player's role in the fleet. The plot after it is identical.

| Subclass | Role in the Durn Prospect Fleet |
|---|---|
| Hearthkyn Warrior | Escort captain, assigned to guard the fleet's flank |
| Einhyr Hearthguard | Sworn guard of the Fleet-Theyn, commanding her escort ship |
| Cthonian Berserk | Captain of the deep-drill ship, leading the cutting crews |
| Hernkyn Pioneer | The fleet's scout ship, which charted the route to Kethra's Anvil |
| Hernkyn Yaegir | A hunter contracted to track pirate threats in the Reach |
| Brôkhyr Iron-master | Captain of the fleet's repair tender |
| Arkanyst Evaluator | Sent by the Hold to assess the ancestor vault |
| Theyn / Kapitan | A ship captain and the Fleet-Theyn's second in command |
| Prospector-Trader | Shareholder in the prospect, running the fleet's trade hauler |
| Memnyr Strategist | The fleet's planner and keeper of its oaths and records |

The subclass role also gives the player **one personal stake** that echoes later (for example the Hearthguard failed to protect the Fleet-Theyn, the Trader lost their share, the Evaluator lost the vault). Store this as a flag `STAKE_<SUBCLASS>` so Act 2 and 3 dialogue can reference it.

### 3.3 Kin and Ironkin flavor

- **Ironkin:** Orks treat Ironkin as walking loot ("Dat stunty's made of da good bitz!"). Some Ork encounters have Ironkin-only lines and an extra "they want your parts" complication. Machine Link opens extra routes into Gitzbolt's Ork-Votann tech.
- **Kin:** hazard-heavy beats (burning dig site, vented decks, toxic Ork camps) are more dangerous. Hearth-Bonded gives stronger crew and ally scenes.

### 3.4 Gender

Gender changes pronouns and dialogue variants only, as specified in `character-creation.md`.

---

## 4. Factions and Key Characters

### 4.1 Votann side

| Key | Name | Role |
|---|---|---|
| `HOLD_DURNVAR` | Hold Durnvar | The player's home Hold. The Waaagh!'s eventual target. |
| `DURN_LEAGUE` | The Durn League | The player's League. Starts friendly, but its council is slow to act. |
| `KHARR_LEAGUE` | The Kharr League | A rival League nearby. Proud and suspicious. A possible ally in Act 2. |
| `KARRAK_STATION` | Karrak Station | Neutral trading port. Act 1 safe harbor and Act 2 hub. |

| NPC key | Name | Role |
|---|---|---|
| `HROLLA_VASK` | Fleet-Theyn Hrolla Vask | Leader of the fleet. Captured in Act 1. Can be rescued in Act 2. |
| `DORRIK` | Old Dorrik | Ironkin engineer, starting crew. Gruff, loyal, remembers older Ork wars. |
| `YLSA` | Ylsa | Young Kin pilot, starting crew. This is her first expedition. |

### 4.2 Ork side

| NPC key | Name | Role | Can negotiate? |
|---|---|---|---|
| `SKRAGNAK` | Warboss Skragnak | Main antagonist. Wants the biggest fight in the Reach. | Only through a duel challenge (section 7.3) |
| `GITZBOLT` | Big Mek Gitzbolt | Sub-villain. Building a super-weapon powered by the Ancestor Core. | Yes, if offered better tech or "more power" |
| `URGROT` | Boss Urgrot | Rival boss who wants Skragnak's place. Can be turned into an ally. | Yes |
| `SNAZRIK` | Kaptin Snazrik | Ork freebooter captain. Fights for whoever pays. | Yes, always, at a price |
| `GRIZZGUT` | Nob Grizzgut | Led the Act 1 raid. The player's **recurring rival** (section 8). | Sometimes |

### 4.3 Ork tone

`[DECIDED]` **The situation is grim and the Orks are funny.** Ork dialogue is loud, crude, and comedic. The danger is real and losses matter. Config flag `ORK_TONE` (`GRIM_FUNNY` default, `GRIM` alternate) selects between dialogue variant sets.

### 4.4 The Ashfall Reach star map

`[DECIDED]` About **12 systems** `[TUNABLE]`. Names are placeholders in `systems.json`; travel days, Fuel costs, and connections are set there.

| Key | System (placeholder) | Used for |
|---|---|---|
| `KETHRAS_ANVIL` | Kethra's Anvil | Act 1 dig site; Thread B beat 2 |
| `KARRAK_STATION` | Karrak Station | Neutral port, Act 2 hub |
| `HOLD_DURNVAR` | Hold Durnvar | Home Hold; Thread C beat 1; Act 3 defense |
| `KHARR_HOLD` | Kharr Hold | Kharr League seat; Thread C beat 2 |
| `CINDER_DRIFT` | Cinder Drift | Ork raider wakes; Thread A beats 1 and 2 |
| `SKRAPFANG_ROCK` | Skrapfang Rock | Ork muster world; Thread A beat 3; Act 3 ambush; Hrolla's prison ship |
| `GITZBOLT_SCRAPFIELD` | The Scrapfield | Wrecked Ork tech; Thread B beats 1 and 3 |
| `GRIMHOLT_BELT` | Grimholt Belt | Kin mining stations under raid; Thread D beat 1 |
| `RUSTMAW` | Rustmaw | Ork slave camp; Thread D beat 2 |
| `DA_PIT` | Da Pit | Ork fighting-pit world; Thread D beat 3 |
| `URGROT_CAMP` | Urgrot's Camp | Secret meeting; Thread C beat 3 |
| `SNAZRIK_HAVEN` | Snazrik's Haven | Freebooter port, black market, rumors, side jobs |

At the start only Kethra's Anvil, Karrak Station, and Hold Durnvar are visible. The rest are revealed by thread messages, scans, and rumors (Memnyr Strategists start with two extra systems revealed).

---

## 5. The Waaagh! Meter

A campaign-level threat clock, tracked in game state and shown on the Logbook screen.

- Range `0` to `100`. Starts at `10` after Act 1 `[TUNABLE]`.
- **Rises** with time spent travelling, failed main beats, Ork victories, broken oaths with allies, and leaving Ork warbands unbroken.
- **Falls** when the player breaks warbands, sabotages Gitzbolt's projects, splits the tribes, or frees prisoners.

| Range `[TUNABLE]` | State | Effect |
|---|---|---|
| 0 to 29 | Scattered | Ork travel events rare. Act 3 enemies weakened. |
| 30 to 59 | Gathering | Normal Ork event rate. |
| 60 to 89 | Rising | More Ork travel events. Some neutral ports close. Ork prices for bribes go up. |
| 90 to 99 | Imminent | Comms warnings every journey. Allies push the player to act. |
| 100 | **Launched** | Act 3 begins immediately (section 6.6). |

The meter is the only story timer. It gives side contracts a real cost without strict deadlines. Expose its rates in config (`WAAAGH_PER_JOURNEY`, `WAAAGH_PER_FAILED_BEAT`, and so on).

---

## 6. Campaign Structure

```
ACT 1  The Raid               linear, tutorial          4 beats
ACT 2  Gathering Strength     open hub, 4 threads       finish any 2 to advance
ACT 3  The Waaagh!            final battle              shaped by Act 2 choices
```

`[DECIDED]` Target length: medium campaign, about **4 to 6 hours** `[TUNABLE]`. Config `CAMPAIGN_LENGTH` can scale the number of beats per Act 2 thread later.

---

### 6.1 Act 1: The Raid

Goal: teach every system through the story, then hand the player the grudge and the oath that drive the rest of the game.

**Beat 1.1: The Survey** (teaches Comms, Nav, class actions)
- Subclass-specific opening message (section 3.2).
- A small fleet job: escort a supply drop, scan the vault entrance, or settle a crew dispute. Each has a class route.
- The vault is opened. The Ancestor Core is found. Comms traffic hints at "strange signals" in the system.

**Beat 1.2: Fire on the Anvil** (teaches personal combat)
- Ork landers hit the dig site, led by **Nob Grizzgut**.
- Goal: get your crew from the dig site back to your ship.
- Routes: fight through (Warrior), find a side tunnel (Pathfinder, or Cthonian Tunnel-Born), seal blast doors behind you (Artificer), convince Grizzgut a "bigger fight" is on the other side of the site (Speaker).
- Grizzgut is **broken, not killed**, whatever happens. He flees and remembers you.
- The player sees Gitzbolt's crew carry the Core out of the vault. Hrolla is dragged onto an Ork ship.

**Beat 1.3: Breaking Orbit** (teaches ship combat)
- An Ork raider blocks the escape.
- Routes: fight it (ship combat), outrun it through a debris field (Nerve, Pathfinder), fake a reactor failure so it ignores you (Artificer), hail Kaptin Snazrik's freebooters and pay them to cover you (Speaker, creates a debt oath).
- Defeat here is safe (as defined in `combat-system.md` section 7): the ship is crippled but drifts free, and Dorrik patches it up at a cost.

**Beat 1.4: Karrak Station** (teaches Logbook, oaths, grudges, reputation)
- The player reaches the neutral port with a damaged ship.
- **Grudge created:** `GRUDGE_SKRAGNAK` ("The raid on Kethra's Anvil"). This is the game's first and most important grudge.
- **Oath sworn:** the player swears the **Oath of the Broken Fleet** to Hold Durnvar: recover the Core, avenge the fleet, protect the Hold. This is the main-quest oath. It cannot fail, but how well it is kept changes the ending.
- News arrives: Orks are flocking to Skragnak. The Waaagh! meter appears at `10`.
- The player names the ship `[DECIDED]`: allowed, with a default name in data (`ALLOW_SHIP_NAMING = true`).
- **Act 1 ends.** The Act 2 hub opens.

---

### 6.2 Act 2: Gathering Strength

Karrak Station becomes the hub. Four story threads open at once as Comms messages. Each thread has **three beats** `[TUNABLE]`, happens in its own systems on the star map, and leans toward one class while staying open to all.

The player must **complete any 2 threads** `[TUNABLE]` to unlock Act 3. Completing more makes Act 3 easier and opens more endings. The Waaagh! meter keeps rising while the player works, so doing all four has a cost.

#### Thread A: The Muster (Intel, leans Pathfinder)
Find where the Waaagh! is gathering.
1. **Cold Trails:** track Ork raider wakes through the Reach (scans, Wits rolls).
2. **The Scout Ship:** catch or ambush an Ork scout ship and pull its navigation data (ship combat, or Yaegir Patient Hunter route).
3. **Skrapfang Rock:** locate and observe the muster world. Unlocks the **Rescue Hrolla** beat (section 6.3).

**Act 3 reward:** `INTEL_MUSTER`: the player chooses where Act 3 begins and gets a first-strike bonus in the opening battle.

#### Thread B: The Mek's Machine (Tech, leans Artificer)
Learn what Gitzbolt is building and how to stop it.
1. **Scrap Autopsy:** study wrecked Ork tech from the raid (Craft, Brôkhyr route).
2. **The Vault's Memory:** return to Kethra's Anvil and recover the vault's records of the Core (Arkanyst Ancestor-Lore route, Ironkin Machine Link route).
3. **The Counter-Key:** build a device that can shut down the Core remotely. Needs Supplies and a Craft roll, or a deal with Gitzbolt's unhappy assistant grot.

**Act 3 reward:** `TECH_COUNTERKEY`: the super-weapon can be disabled in Act 3, and the Core can be recovered intact.

#### Thread C: Oaths and Bargains (Allies, leans Speaker)
Build an alliance big enough to face a Waaagh!.
1. **The Slow Council:** convince Hold Durnvar's council to send ships (reputation and Silver Tongue; Theyn Voice of the Hearth route).
2. **Old Rivals:** win over the Kharr League, which wants a grudge of its own settled first (oath-based side quest).
3. **The Enemy of My Enemy:** meet Boss Urgrot in secret and agree to back his challenge against Skragnak. Optional and risky. Breaking this deal later creates an Ork grudge.

**Act 3 reward:** `ALLIES_LEAGUE` (allied ships in the battle) and optionally `ALLIES_URGROT` (an Ork civil war ending, section 7.2).

#### Thread D: Name Them in Fear (Strength, leans Warrior)
Hurt the Waaagh! directly and make the Orks know your name.
1. **Burn the Outposts:** break Ork warbands raiding mining stations (personal combat, each lowers the Waaagh! meter).
2. **The Slave Camp:** free captured Kin miners from an Ork camp (boarding combat; Einhyr Boarding Lead route). Freed miners can join the crew.
3. **The Fighting Pit:** enter an Ork fighting pit and beat Skragnak's champion in front of the warband (Grizzgut returns here, section 8).

**Act 3 reward:** `STRENGTH_RENOWN`: Skragnak accepts a **personal duel challenge** in Act 3 (section 7.3), and the Waaagh! meter drops sharply.

#### 6.2.1 Where each beat happens `[DECIDED]` (Milestone 2)

All four threads open together when Act 1 ends: four Comms messages arrive, each revealing the systems its thread needs. Every thread beat starts automatically when the player arrives at its system (systems from section 4.4). Several beats can be active at once, one per thread. If two are waiting in the same system, they play one after the other.

| Thread | Beat 1 | Beat 2 | Beat 3 |
|---|---|---|---|
| A: The Muster | Cold Trails, Cinder Drift | The Scout Ship, Grimholt Belt | Skrapfang Rock, Skrapfang Rock |
| B: The Mek's Machine | Scrap Autopsy, The Scrapfield | The Vault's Memory, Kethra's Anvil | The Counter-Key, Karrak Station |
| C: Oaths and Bargains | The Slow Council, Hold Durnvar | Old Rivals, Kharr Hold | The Enemy of My Enemy, Urgrot's Camp |
| D: Name Them in Fear | Burn the Outposts, Grimholt Belt | The Slave Camp, Rustmaw | The Fighting Pit, Da Pit |

- **Rescue Hrolla** is at Skrapfang Rock (the prison ship in orbit). It opens after Thread A beat 3, or when the player buys the rumor at Snazrik's Haven.
- Thread C beat 3 is optional and risky: the player can refuse Urgrot's deal and still finish the thread, earning `ALLIES_LEAGUE` without `ALLIES_URGROT`.
- **Act 3 unlock:** when the second thread is finished, an "Act 3 unlocked" screen appears. From then on the player chooses when Act 3 starts (section 6.7.1) and can keep working on the remaining threads first.
- **Early launch:** if the Waaagh! meter reaches 100 first, a "The Waaagh! has launched" screen appears instead, and Act 3 starts at once (section 6.6).

### 6.3 Optional beat: Rescue Hrolla

Unlocked by Thread A beat 3, or by a rumor bought from Kaptin Snazrik.
- A raid on the Ork prison ship holding the Fleet-Theyn.
- Success: Hrolla joins as a **special crew member** (strong Hearthfire bonus, unique dialogue, a large reputation bonus with Hold Durnvar).
- Failure is not final: she can be found in Act 3 if the Orks are beaten, or she escapes on her own in the ending text.
- Einhyr Hearthguard players get a unique redemption scene (`STAKE_EINHYR_HEARTHGUARD`).

### 6.4 Side content during Act 2

Normal Comms jobs, trade, and travel events continue, but many have an Ork angle: Snazrik's freebooters offering work, refugees fleeing raids, Ork scrap salvage, Kin outposts asking for protection. Side content can raise or lower the Waaagh! meter and earn the reputation, Ore, and crew needed for the threads.

### 6.5 Act 2 thread rules

- A thread does not need to be finished in one go. The player can switch threads at any time.
- Every thread beat follows section 3.1: class route, other routes, and a fallback.
- A failed thread beat is **not** a dead end. It moves forward with a cost (the Waaagh! meter rises, an ally is lost, a worse version of the reward).
- Thread state flags: `THREAD_A_STEP`, `THREAD_B_STEP`, and so on (values `0` to `3`).

### 6.6 Early Waaagh! (failure path)

If the Waaagh! meter reaches 100 before the player has finished 2 threads, **Act 3 starts anyway**. Act 3 then runs in its hardest form, and the available endings depend on whatever partial progress the player made. This avoids an endless Act 2 and makes the meter matter.

`[DECIDED]` (Milestone 3) The meter reaching 100 always starts Act 3 at once, whether or not Act 3 was unlocked. Wherever the player is, an emergency Comms message pulls the ship home: travel to the rally point takes no time and no Fuel. The hardest form means:
- the Waaagh! fleet is at full strength (section 6.7.3), and
- there is no breather between the first two waves.

---

### 6.7 Act 3: The Waaagh!

The Waaagh! launches toward Hold Durnvar. Act 3 has three fixed beats, but each one changes based on Act 2 rewards.

#### 6.7.1 Starting Act 3 `[DECIDED]` (Milestone 3)

- After Act 3 unlocks, a **Sound the muster** option appears on the hub whenever the ship is docked at Karrak Station or Hold Durnvar.
- Choosing it opens a confirm screen that shows:
  - the Act 2 rewards earned,
  - the current Waaagh! band, and
  - any open side oaths.
- The confirm screen warns that this is the **point of no return**:
  - Act 3 is a linear run with no star-map travel.
  - Open job oaths (deliveries and bounties) are **broken** when the muster sounds, unless the player fulfils them first.
  - Story oaths stay open and are settled in the epilogue.
- The player can keep doing threads instead. The meter keeps rising, and at 100 Act 3 starts by force (section 6.6).
- Act 3 beats give the normal main-beat XP (`game-overview.md` section 8.3).

#### 6.7.2 Beat 3.1: The Gathering Storm

The rally happens at **Hold Durnvar**, wherever the muster was sounded. It plays out like this:

- **Allies arrive**, if earned. Each Act 2 reward the player holds gets a short arrival scene. If Hrolla was rescued, she gives the speech.
- **Last port visit.** One final market visit, with repairs, buying and recruiting, at Hold Durnvar's prices. After this beat the market is closed for the rest of Act 3.
- **Dorrik's oath.** Dorrik names the oath he swore in the last Ork war: "I will not leave a Kin behind to the greenskins again." The player can swear to honour it with him, which creates `OATH_DORRIK_VOW`:
  - Kept if nobody on the crew is lost in Act 3.
  - While sworn, Dorrik gives +2 to the boarding fight in beat 3.3.
- **Ylsa's choice.** This scene appears only if Hearthfire is Low. Ylsa admits she is afraid, and the player chooses:
  - Send her to the Hold with the evacuation ships. She is safe, but her pilot bonus is gone for Act 3.
  - Keep her at the helm (see section 9.1).
- **Where to strike.** This choice appears only with `INTEL_MUSTER`:
  - **Defend the Hold:** the battle happens at Hold Durnvar.
  - **Strike the muster:** the battle happens at Skrapfang Rock before the Waaagh! leaves. This opens **The Ambush** resolution and the first-strike bonus.

#### 6.7.3 Beat 3.2: The Void Battle `[DECIDED]` (Milestone 3)

The battle is fought in **three waves**, each one a ship fight. Hull carries over from wave to wave, Withdraw is not allowed, and the defeat grace period does not apply.

| Wave | Enemy | Notes |
|---|---|---|
| 1 | Raider escorts | A fast, light pack. |
| 2 | Gitzbolt's gunship | Carries the super-weapon and the Ancestor Core. |
| 3 | The flagship's guard | Skragnak's Kill Kroozer and its escort. Beating this wave leads straight into the boarding of beat 3.3. |

**Between waves, the player gets one breather choice** `[TUNABLE]`:
- **Patch the hull:** Dorrik restores `ACT3_BREATHER_HULL` Hull, costing Supplies.
- **Rally the crew:** `ACT3_BREATHER_HEARTHFIRE` Hearthfire.
- **Press on:** +2 to the first roll of the next wave.

If the meter launched early (section 6.6), there is no breather between waves 1 and 2.

**Battle modifiers** `[TUNABLE]`:

| Condition | Effect |
|---|---|
| `ALLIES_LEAGUE` | League ships take wave 1. It is narrated, not fought. |
| `INTEL_MUSTER` and Strike the muster | First strike: each wave's enemy starts with `ACT3_FIRST_STRIKE_DAMAGE` Hull damage. |
| `ALLIES_URGROT` | Urgrot's ships turn on Skragnak in wave 3, so the wave 3 enemy starts at half Hull. |
| Waaagh! meter below 30 | Enemy Hull -25%. |
| Waaagh! meter 60 or higher | Enemy Hull +25%. |
| Meter launched early | Enemy Hull +50%, and no first breather. |

**The super-weapon.** In waves 2 and 3, Gitzbolt's weapon fires at the end of every round and deals `SUPERWEAPON_DAMAGE` Hull damage, ignoring shields. There are two ways to stop it:
- **Use the counter-key.** This needs `TECH_COUNTERKEY` and takes the round's choice, with no roll. It shuts the weapon down for the rest of the battle and keeps the Core intact.
- **Disable the gunship in wave 2.** The weapon falls silent, and the player then chooses:
  - **Board the gunship** (a boarding fight, `combat-system.md` Phase 3). Winning recovers the Core.
  - **Let it drift.** Gitzbolt escapes with the Core, and the Core is **Lost**.

**Losing the battle** `[DECIDED]`: if the player's Hull reaches 0 in any wave, the battle is lost.
- The remaining waves are skipped and narrated.
- The player wakes with Hull at `DEFEAT_RESTORE_FRACTION`.
- The Hold's fate becomes **Evacuated** (section 7.4).
- Beat 3.3 still happens, as a desperate strike on the flagship while the Hold empties. The boarding fight gets -2.

#### 6.7.4 Beat 3.3: The Warboss

**1. Boarding.** The player boards Skragnak's flagship and fights through a boarding fight.

**2. Grizzgut stands in the way one last time** (section 8).
- If he was broken through Negotiate at least once before, the player can talk him aside.
- Otherwise he must be fought, using the grudge duel rules (`combat-system.md` Phase 3).

**3. Hrolla.** If Hrolla was not rescued in Act 2, she is found chained aboard the flagship and freed. This counts as rescued for the epilogue.

**4. The resolution.** The player picks a resolution from section 7.2. Locked resolutions stay visible with their requirements. Every resolution except The Unplugging ends in a personal fight with Skragnak:

| Resolution | Fight |
|---|---|
| The Duel | A grudge duel at full strength, witnessed by the warband. |
| The Usurper | Urgrot fights alongside the player. Skragnak's Resolve is lowered, and the fight ends with Urgrot standing over him. |
| The Unplugging | A Craft or Wits route to shut the Core down, with a fallback. Then Skragnak, with lowered Resolve and defense. |
| The Ambush | Skragnak caught unready at the muster, with lowered Resolve. |
| Last Stand | Skragnak at full strength. |

**5. Skragnak's fate.** Once he is broken, the player chooses execute, exile, or humiliate (section 7.2).

**6. The Core.** If the Core is aboard and recoverable, the player chooses:
- return it to the Hold,
- keep it as a relic, or
- destroy it (section 7.5).

The Core is recoverable if the counter-key was used, or if the gunship was boarded and won.

**Losing to Skragnak** `[DECIDED]` (no retry, the story continues worse):
- Hrolla (or the allied boarders, if Hrolla was not freed) breaks him while the player lies wounded.
- Skragnak is **exiled** by default, and the fate choice is taken from the player.
- The grudge is **settled at great cost**.
- The Hold's fate drops one step: Unbroken becomes Scarred, and Scarred becomes Evacuated.
- If Hearthfire is Low, one crew member other than Dorrik is lost.

Losing the boarding fight or the Grizzgut fight works the same way. The player still reaches the resolution step, but with -2 to the fight and the Hold's fate one step lower.

#### 6.7.5 Epilogue `[DECIDED]` (Milestone 3)

The epilogue is a sequence of text screens built from the three results in section 7.1:
1. How the Warboss fell.
2. The fate of Hold Durnvar.
3. The Core.
4. One screen of short lines:
   - each crew member's fate (Dorrik, Ylsa, Hrolla, recruited crew),
   - Grizzgut's fate,
   - kept and broken oaths, including `OATH_DORRIK_VOW`,
   - the subclass stake.

A final **Saga record** screen shows the days taken, the player's level, the final Waaagh! meter, the threads completed, and the grudge settlement. Free-roam starts after it (section 7.6).

---

## 7. Endings

### 7.1 How the ending is chosen

The ending is built from **three independent results**, each authored separately, so the number of combinations stays manageable:

| Result | Determined by |
|---|---|
| **How the Warboss falls** (section 7.2) | The resolution the player picks in beat 3.3 |
| **The fate of Hold Durnvar** (section 7.4) | Final Waaagh! meter, allies, and the outcome of the void battle |
| **The Core** (section 7.5) | `TECH_COUNTERKEY` and choices in 3.3 |

The epilogue also adds short lines for crew fates, Hrolla, Grizzgut, kept or broken oaths, and the subclass stake.

### 7.2 Warboss resolutions

Each resolution needs a specific Act 2 reward. A **Last Stand** fallback is always available.

| Resolution | Requires | What happens |
|---|---|---|
| **The Duel** | `STRENGTH_RENOWN` | Skragnak accepts a witnessed challenge. Beating him breaks the warband's will. Uses the grudge duel rules (`combat-system.md` Phase 3). |
| **The Usurper** | `ALLIES_URGROT` | Urgrot challenges Skragnak mid-battle. The player tips the fight. The Waaagh! collapses into an Ork civil war. Urgrot becomes the new, smaller threat in the epilogue. |
| **The Unplugging** | `TECH_COUNTERKEY` | The player shuts down the Core. Gitzbolt's weapon and half the Ork fleet's power fail. Skragnak is left without his big gun, and his Orks start to doubt him. |
| **The Ambush** | `INTEL_MUSTER` | The player hits the muster before the Waaagh! launches. Skragnak is caught off guard, and the Orks scatter before reaching the Hold. |
| **Last Stand** | Always available | A hard, straight fight with heavy costs. Winning is possible but expensive. |

In line with the non-lethal combat design, Skragnak is **broken** by default, not killed. `[DECIDED]` The player chooses his fate after he breaks: execute him, exile him, or leave him humiliated (Orks who lose this badly rarely lead again). Each choice changes the epilogue and how the grudge is marked as settled.

### 7.3 Settling the grudge

`GRUDGE_SKRAGNAK` is settled in every ending, but **how** it is settled is recorded and changes the epilogue text and the player's standing with Hold Durnvar:
- **Settled in blood** (duel or execution): Warriors and Theyns get extra honor.
- **Settled in cunning** (unplugging or ambush).
- **Settled by Ork hands** (the usurper ending).
- **Settled at great cost** (last stand).

### 7.4 Fate of Hold Durnvar

| Condition `[TUNABLE]` | Result |
|---|---|
| Void battle won and Waaagh! meter below 60 | **Unbroken:** the Hold is untouched. Feasts, honors, and a seat on the council. |
| Void battle won, meter 60 or higher | **Scarred:** the Hold is saved but outer settlements burned. Bittersweet. |
| Void battle lost or meter reached 100 early with fewer than 2 threads | **Evacuated:** the Hold falls, but its people escape on the player's fleet. The grudge passes to the next generation. A darker but complete ending. |

### 7.5 The Ancestor Core

- **Recovered:** returned to the Hold (large reputation reward), or kept as a powerful relic for a post-game or sequel.
- **Destroyed:** shut down for good to keep it from the Orks forever. Arkanyst players get a unique reaction.
- **Lost:** taken by the fleeing Gitzbolt. A sequel hook.

### 7.6 Post-game

`[DECIDED]` After the epilogue the player keeps playing in **free-roam**. The star map, Comms, trade, and travel events stay active. Unfinished Act 2 threads and side content remain available, and story state (Core fate, Skragnak's fate, Urgrot, crew, reputation) carries over and gates post-game content. The Waaagh! meter is retired. In the **Evacuated** ending, free-roam starts from the fleet instead of the Hold. Config flag `ALLOW_POST_GAME` (default `true`).

`[DECIDED]` (Milestone 3) Post-game uses **existing content only**. No new story is added.
- The Waaagh! meter is hidden and no longer changes.
- Ork travel events become **remnant warband** events: the same events with a `remnant` text variant, weighted as in the Scattered band.
- Threads that were not finished can still be played for XP, reputation and loot. Their Act 3 rewards no longer have an effect.
- **Evacuated:** the player starts at Karrak Station with the refugee fleet, and Hold Durnvar's port stays closed.
- **Unbroken or Scarred:** the player starts docked at Hold Durnvar.
- Snazrik's Haven reopens if it closed during Act 2.

---

## 8. The Recurring Rival: Nob Grizzgut

Grizzgut shows how the Resolve system turns defeated enemies into story. Every time the player breaks him, he comes back **bigger and with a new trick**.

| Appearance | Where | What changed |
|---|---|---|
| 1 | Beat 1.2, Fire on the Anvil | Standard Nob. Teaches personal combat. |
| 2 | Act 2, random encounter or Thread D beat 3 | New armor, higher Resolve. Remembers the player's favorite stance and starts guarded against it. |
| 3 | Beat 3.3, the flagship | Upgraded by Gitzbolt with looted Votann parts. Can be **turned**: if broken through Negotiate at least once before, he may stand aside or switch sides. Otherwise he is fought as a grudge duel (`combat-system.md` Phase 3). |

Grizzgut gets his own grudge entry (`GRUDGE_GRIZZGUT`) after the second meeting. Track his record in a flag `GRIZZGUT_ENCOUNTERS` with how each fight ended.

---

## 9. Starting Crew

Two crew members survive the raid with the player. Both use the existing crew system (`game-overview.md` section 8.2).

| NPC | Kin type | Trait (suggested) | Story role |
|---|---|---|---|
| **Old Dorrik** | Ironkin | Workshop veteran: cheaper repairs | Remembers an older Ork war. Gives lore and warnings. Has a personal oath about Orks that comes up in Act 3. |
| **Ylsa** | Kin | Steady hands: piloting bonus | Her first expedition. Grows from scared to confident depending on Hearthfire and how the player treats her. Can die or leave if things go badly. |

Both react to the player's choices, which gives a class-neutral "voice" in every scene.

### 9.1 Crew fates `[DECIDED]` (Milestone 3)

- **Ylsa can be lost only in Act 3**, and only in these cases:
  - Her Hull reaches 0 in a void battle wave while Hearthfire is Low and she is at the helm.
  - The player loses to Skragnak while Hearthfire is Low (section 6.7.4).

  If Hull reaches 0 at Mid or High Hearthfire, she is hurt but survives.
- **Warnings.** From Act 2 on, Ylsa sends a worried Comms line each time Hearthfire enters the Low band, so the risk is never a surprise. The rally beat (6.7.2) gives a last chance to send her to safety.
- **Dorrik never dies.** His vow (`OATH_DORRIK_VOW`, section 6.7.2) is kept if no crew member is lost in Act 3, and broken otherwise. Either way it gets an epilogue line.
- **Recruited crew**, such as the freed miners and Brokka, get one epilogue line each. A crew member lost in Act 3 is named in the epilogue.

---

## 10. Data Model

Story content uses the existing condition evaluator and effect applier. New files:

```
data/
  story_beats.json      # every main beat, its routes and outcomes
  story_threads.json    # Act 2 threads, beat order, rewards
  npcs.json             # named NPCs (story and crew)
  endings.json          # ending pieces and the conditions that pick them
  config.json           # add story [TUNABLE] values and flags (section 10.3)
```

### 10.1 Story beat example

```json
{
  "key": "A1_B3_BREAKING_ORBIT",
  "act": 1,
  "goal": "Escape Kethra's Anvil",
  "intro_text": { "default": "...", "variants": { "IRONKIN": "..." } },
  "routes": [
    {
      "key": "FIGHT",
      "label": "Bring the guns to bear",
      "requirements": [],
      "encounter": "ORK_RAIDER_ESCAPE"
    },
    {
      "key": "DEBRIS_RUN",
      "label": "Dive into the debris field",
      "requirements": [],
      "roll": { "stat": "nerve", "difficulty": "HARD" },
      "class_bonus": { "PATHFINDER": 3 }
    },
    {
      "key": "FAKE_FAILURE",
      "label": "Fake a reactor breach",
      "requirements": [{ "base_class": "ARTIFICER" }],
      "roll": { "stat": "craft", "difficulty": "NORMAL" }
    },
    {
      "key": "HAIL_SNAZRIK",
      "label": "Hail the freebooters and pay them to cover you",
      "requirements": [{ "base_class": "SPEAKER" }],
      "roll": { "stat": "silver_tongue", "difficulty": "NORMAL" },
      "effects_always": [{ "create_oath": "DEBT_SNAZRIK" }]
    }
  ],
  "outcomes": {
    "critical": { "text": "...", "effects": [] },
    "success": { "text": "...", "effects": [] },
    "partial": { "text": "...", "effects": [{ "hull": -3 }] },
    "failure": { "text": "...", "effects": [{ "hull": -6 }, { "waaagh": 2 }] }
  },
  "next": "A1_B4_KARRAK_STATION"
}
```

Rules:
- Every beat must have at least one route with an empty `requirements` list (the fallback, section 3.1).
- Route-specific outcomes may override the beat's shared `outcomes`.
- `class_bonus` adds to the roll for that class instead of locking the route.

### 10.2 New state and flags

```
waaagh_meter          int 0..100
act                   1 | 2 | 3
thread_progress       { A: 0..3, B: 0..3, C: 0..3, D: 0..3 }
story_rewards         [INTEL_MUSTER, TECH_COUNTERKEY, ALLIES_LEAGUE, ALLIES_URGROT, STRENGTH_RENOWN]
stake_flag            STAKE_<SUBCLASS>
hrolla_status         CAPTIVE | RESCUED | LOST
grizzgut_encounters   list of { beat, outcome }
core_status           STOLEN | RECOVERED | DESTROYED | LOST
ship_name             string
act3_site             HOLD_DURNVAR | SKRAPFANG_ROCK          # Milestone 3
void_battle           { wave: 1..3, result: WON | LOST }     # Milestone 3
warboss_resolution    DUEL | USURPER | UNPLUGGING | AMBUSH | LAST_STAND
skragnak_fate         EXECUTED | EXILED | HUMILIATED
grudge_settlement     BLOOD | CUNNING | ORK_HANDS | GREAT_COST
hold_fate             UNBROKEN | SCARRED | EVACUATED
crew_lost             list of crew keys lost in Act 3
post_game             boolean
```

### 10.3 New config values

All `[TUNABLE]` unless noted.

```
WAAAGH_START = 10
WAAAGH_PER_JOURNEY = 1
WAAAGH_PER_FAILED_BEAT = 5
WAAAGH_PER_WARBAND_BROKEN = -5
WAAAGH_LAUNCH = 100
THREADS_REQUIRED = 2
BEATS_PER_THREAD = 3
ORK_TONE = "GRIM_FUNNY"     # [DECIDED] flag
ALLOW_SHIP_NAMING = true    # [DECIDED] flag
CAMPAIGN_LENGTH = "MEDIUM"  # [DECIDED] flag
ALLOW_POST_GAME = true      # [DECIDED] flag
ACT3_BREATHER_HULL = 6          # Milestone 3
ACT3_BREATHER_SUPPLIES = 2
ACT3_BREATHER_HEARTHFIRE = 10
ACT3_FIRST_STRIKE_DAMAGE = 3
ACT3_WAVE_HULL_SCALE = { scattered: 0.75, gathering: 1.0, rising: 1.25, launched: 1.5 }
SUPERWEAPON_DAMAGE = 3
ACT3_DESPERATE_PENALTY = -2     # boarding after a lost battle, or after losing a 3.3 fight
```

---

## 11. Implementation Plan

1. **Story engine:** load `story_beats.json`, show routes with gating (locked routes visible with their requirements), resolve routes through the existing roll resolver or combat encounters, apply effects, and advance to `next`.
2. **Waaagh! meter:** state, config rates, Logbook display, band effects on travel event weights, and the early-launch trigger.
3. **Act 1 content:** all four beats with every route, the 10 subclass opening variants, the main grudge and oath. This is the first playable slice.
4. **Act 2 hub:** thread messages, thread progress, the 2-of-4 unlock check, and the Hrolla rescue beat.
5. **Act 3 and endings:** the muster, the three beats, the void battle waves, reward-based modifiers, the ending builder (section 7.1), the epilogue and post-game (sections 6.7 and 7.6). Built in Milestone 3.
6. **Grizzgut** recurring-rival logic.
7. **Writing pass:** Kin/Ironkin and gender variants, and tone variants if `ORK_TONE` is kept.

**Acceptance checks:**
- Every beat can be finished by every class and kin type (there is always a fallback route).
- Each of the 10 subclasses has an opening variant and at least one easier route in every act.
- The game can reach Act 3 and an ending even if the player fails every roll.
- The Waaagh! meter launching early never soft-locks the game.
- All names and numbers live in data and config files.

---

## 12. Design Decisions

| Question | Decision |
|---|---|
| Ork tone | Grim situation, funny Orks (`ORK_TONE = GRIM_FUNNY`) |
| Campaign length | Medium, about 4 to 6 hours |
| Threads required for Act 3 | 2 of 4 |
| Skragnak's fate after being broken | Player chooses: execute, exile, or humiliate |
| Can the player name their ship | Yes (`ALLOW_SHIP_NAMING = true`) |
| Post-game after the ending | Free-roam after the epilogue (`ALLOW_POST_GAME = true`, section 7.6). The Core's fate and Urgrot remain sequel hooks. |
| Can Ylsa or Dorrik permanently die | Ylsa yes in bad outcomes. Dorrik no (needed for lore). |
| Size of the campaign map | About 12 systems (section 4.4) |
| First playable milestone | Act 1, all four beats (see `game-overview.md` section 11) |
| How Act 3 starts | The player sounds the muster at Karrak Station or Hold Durnvar once 2 threads are done; Waaagh! 100 forces it (section 6.7.1) |
| Void battle shape | Three ship-fight waves with Hull carried over and a breather between waves (section 6.7.3) |
| Defeat in Act 3 | No retry. The story continues worse and every run reaches an ending (sections 6.7.3 and 6.7.4) |
| When Ylsa can be lost | Act 3 only, at Low Hearthfire, with warnings beforehand (section 9.1) |
| Post-game content | Existing content only; Ork events become remnant-warband events (section 7.6) |
