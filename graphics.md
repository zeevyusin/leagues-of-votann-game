# Votann Command Console: Graphics Plan

> **Status:** all six phases built. Section 10 lists what could come next.
> **Purpose:** the single reference for adding graphics to the game: what we draw, how it looks, how it is made, and how it plugs into the code.
> **Related docs:** `game-overview.md` (console design, theme tokens), `combat-system.md`, `story.md`.
> Decisions are marked `[DECIDED]`. Values that may change after we see them in the game are marked `[TUNABLE]`.

---

## 1. Goals

- Give the console a face: who is calling you, who you are fighting, what you fly, and where you are.
- Keep the game a console. Graphics appear as feeds on the ship's displays. Text, numbered menus and the keyboard stay the way you play.
- Every image is optional. If one is missing or graphics are off, the game plays exactly as it does today.

**Scope of the first pass `[DECIDED]`:** contact portraits, enemy portraits, the player's ship with module lights, enemy ships, and the star map. Everything else is listed in section 10.

---

## 2. Style `[DECIDED]`

**Pixel art with a small fixed palette.** The exception is the star map, which is drawn live as crisp vector graphics in the same colours (section 7).

### 2.1 Sizes

| Asset | Source size | Shown at | Mobile (under 600px) |
|---|---|---|---|
| Contact portrait or crest | 32×32 | ×3 (96px) on the message screen, ×2 (64px) in the inbox | same |
| Enemy portrait | 32×32 | ×4 (128px) | ×3 (96px) |
| Player ship | 96×48 | ×3 (288×144px) | ×3 |
| Enemy ship | 64×32 | ×4 (256×128px) | ×3 (192×96px) |

On screens 340px wide or narrower, the player ship drops to ×2 so it fits. All display scales are `[TUNABLE]`, but they must stay **whole numbers**, and images use CSS `image-rendering: pixelated`. Fractional scales make pixels uneven.

### 2.2 Palette

Art uses only these colours, held in one file, `art/palette.json`. The first group copies the theme tokens in `src/ui/style.css`. Colours are baked into the images, so changing a theme token later means updating this file and rebuilding the art.

| Code | Name | Hex | Use |
|---|---|---|---|
| `.` | transparent | none | background |
| `K` | outline | `#0a1218` | outlines, deepest shadow (`--bg`) |
| `d` | steel dark | `#142a36` | dark armour (`--panel-raised`) |
| `f` | steel low | `#1f4e63` | armour shade (`--frame`) |
| `m` | steel mid | `#6f97a3` | armour, metal (`--muted`) |
| `w` | steel light | `#cfe8ee` | highlights (`--text`) |
| `t` | teal | `#3fc1c9` | Votann lights, visors, screens (`--teal`) |
| `b` | blue | `#4a8fd4` | Kin armour trim (`--blue`) |
| `o` | hearth orange | `#f08a24` | eyes, reactors, hearth glow (`--accent`) |
| `y` | hot yellow | `#ffc46b` | glow centres, sparks, flame |
| `r` | red | `#ef6b5b` | freebooter paint, warning lights (`--bad`) |
| `R` | deep red | `#a8342c` | red shade, blood-dark paint, rust |
| `g` | ork light | `#8fb34a` | Ork skin highlight |
| `G` | ork mid | `#5e8a3c` | Ork skin |
| `h` | ork dark | `#3f6128` | Ork skin shade |
| `H` | ork deep | `#24401c` | Ork skin deepest shade |
| `s` | skin light | `#e0b48a` | Kin skin |
| `S` | skin mid | `#b67f5c` | Kin skin shade |
| `B` | skin dark | `#7a4f3a` | Kin skin deepest shade, leather |
| `p` | bone | `#e6dcc0` | teeth, tusks, beards, trophies |

Exact hex values are `[TUNABLE]` until the first test images are in the game. Add a colour only if a subject truly needs it.

### 2.3 Art rules

- **Framing:** portraits are head and shoulders, facing forward or slightly turned, on a transparent background. The game supplies the dark frame around them.
- **Ships:** side view. The player's ship faces right, enemies face left, so they read as opposing each other.
- **Light:** always from the upper left. One dark outline around each figure, no anti-aliasing, no dithering on portraits.
- **Orange means life.** Save it for eyes, reactors and hearth glow, so it keeps drawing attention. Ironkin eyes are orange or teal lights.
- **Shape language:** Kin are symmetrical, hexagonal, neat and well maintained. Orks are jagged, lopsided and bolted together from scrap. A player should be able to tell friend from foe from the silhouette alone.
- **Readability test:** every image must still be recognisable at ×2.
- **Groups:** mobs are drawn as two or three figures overlapping inside the same 32×32 frame.

### 2.4 Inspired by the setting, not copied `[DECIDED]`

The art should feel like the Leagues of Votann and 40k Orks, so official miniatures and artwork are fair reference for armour shapes, helmets, Ork character, ship silhouettes and overall mood. Imitating that look is encouraged.

`game-overview.md` promises that no official art or assets are used, so every image is drawn for this project. Do not use, trace or reproduce an official image, logo or icon exactly. Faction crests can follow the look of the setting, in the same family as `public/emblem.svg`, but are our own designs.

---

## 3. Asset inventory

44 images in total: 6 faces, 4 crests, 17 enemies, 8 enemy ships, 1 player ship and 8 module overlays. Art IDs below are file names.

### 3.1 Comms contacts

`from` on a message is free text, so section 6.2 maps each exact string to an art ID. There are 13 senders today.

| Sender (`from`) | Art ID | Direction |
|---|---|---|
| Old Dorrik | `dorrik` | Ironkin. Old, dented machine head, metal beard, orange eyes. The reference image for all Kin art. |
| Fleet-Theyn Hrolla Vask | `hrolla` | Kin leader. Scarred, furious, heavy command armour. |
| Hernkyn outrider Vessa | `vessa` | Kin scout. Hood or light helmet, teal visor, weathered. |
| Karrak Station Dockmaster | `dockmaster` | Neutral station worker with a headset, tired and unbothered. |
| Clerk of the Durnvar Council | `clerk` | Kin bureaucrat. Neat beard, eyepiece, tidy robes. |
| Kaptin Snazrik | `snazrik` | Ork freebooter. Red coat, bicorne-style scrap hat, gold tooth. |
| The Council of Hold Durnvar | `crest_durnvar` | Crest, see below. |
| Hold Durnvar, Office of Works | `crest_durnvar` | Shared crest. |
| Hold Durnvar forge-masters | `crest_durnvar` | Shared crest. |
| Karrak Station bounty board | `crest_karrak` | Crest. |
| Karrak Station medicae guild | `crest_karrak` | Shared crest. |
| Grimholt Miners' Guild | `crest_grimholt` | Crest. |
| The refugee fleet | `crest_refugees` | Crest. |

Crests: `crest_durnvar` is a hex hearth with a flame, `crest_karrak` is a hollow asteroid with a docking ring, `crest_grimholt` is crossed mining tools on an asteroid belt, and `crest_refugees` is a patched hex with a small beacon.

### 3.2 Enemies (personal combat)

19 enemy entries share 17 images. A two-enemy encounter shows whichever enemy is currently being fought.

| Enemy key | Art ID | Direction |
|---|---|---|
| `ORK_BOYZ_MOB` | `ork_boyz` | Three Boyz, mouths open, choppas up. The baseline Ork. |
| `NOB_GRIZZGUT_1` | `grizzgut_1` | Recurring rival. Big, grinning, one choppa. Must stay recognisable across all three. |
| `NOB_GRIZZGUT_2` | `grizzgut_2` | Same face, larger, wearing new armour. |
| `NOB_GRIZZGUT_3` | `grizzgut_3` | Largest, shield cut from a Votann hull plate with visible Kin markings. |
| `GROT_SCAVENGERS` | `grot_scavengers` | Small, spiky-eared, one holding a stolen cutting torch. |
| `GITZBOLT_GROTS` | `gitzbolt_grots` | Same grots in goggles, with wrenches and sparks. |
| `ORK_JAILERS` | `ork_jailers` | Two Orks, ring of keys, cell bars behind. |
| `JAILER_NOB` | `nob_krugrot` | Fills the frame. Shield-sized ring of keys. |
| `RAID_NOB` | `nob_zogbad` | Mid-roar, mining-rig scrap for shoulder plates. |
| `SLAVER_GUARDS` | `slaver_guards` | Two Orks with crackling shock-prods. |
| `SLAVER_NOB` | `nob_gutrip` | Chain whip, hooks and chains on the armour. |
| `PIT_CHAMPION` | `bonecrusha` | Enormous fists, bare chest, pit trophies. |
| `PIRATE_BOARDER` | `pirate_boarders` | Two freebooter Orks in red paint with a boarding shield. |
| `ARD_BOYZ` | `ard_boyz` | A wall of armoured Orks behind locked shields. |
| `BIG_MEK_GITZBOLT` | `big_mek_gitzbolt` | Goggles, wires, a glowing gun too big for him. Teal stolen Votann glow against Ork green. |
| `SKRAGNAK` | `skragnak` | The final boss. Huge armour, power klaw, trophy banner. Fills the frame edge to edge. |
| `SKRAGNAK_UNPLUGGED` | `skragnak` | Same image, shown with a dark CSS filter so the armour looks powered down. |
| `SKRAGNAK_AMBUSHED` | `skragnak` | Same image `[TUNABLE]`. A half-armoured version can be added later. |
| `SKRAGNAK_GUARD` | `meganobz` | Three huge suits of armour, klaws raised. |

### 3.3 Enemy ships (ship combat)

| Ship key | Art ID | Direction |
|---|---|---|
| `ORK_RAIDER` | `ork_raider` | Da Big Bash. Blunt ram prow, big engines, mismatched plates. |
| `ORK_SCOUT` | `ork_scout` | Speedy Gitz. Small, mostly engine, one fin. |
| `PIRATE_CUTTER` | `pirate_cutter` | Red Tally. Sleek by Ork standards, red paint, tally marks on the hull. |
| `ORK_LOOTA_SHIP` | `ork_loota` | Bristling with mismatched stolen guns. |
| `ORK_ESCORT_PACK` | `ork_escorts` | Three small ships in one image. |
| `GITZBOLT_GUNSHIP` | `gitzbolt_gunship` | Da Big Zappa. One giant coil cannon, teal glow. |
| `GITZBOLT_GUNSHIP_MK2` | `gitzbolt_gunship_mk2` | Da Even Bigga Zappa. The same ship with a bigger cannon and more coils. |
| `KROOZER_GUARD` | `kill_kroozer` | Fills the whole 64×32 frame and looks too large for it. |

### 3.4 Player ship

**Base image:** `player_ship` at 96×48, a stocky Kin prospector with a hexagonal hull, a mining rig under the prow and a clean, repaired look. One ship for all classes. The game text names it `Durn's Resolve` by default, and the player can rename it, so no name appears on the art.

**Module overlays `[DECIDED]`:** 8 transparent 96×48 images layered over the base, one per module in `MODULE_KEYS`.

| Module | Art ID | Where on the ship |
|---|---|---|
| `engine` | `mod_engine` | Rear thrusters |
| `shields` | `mod_shields` | Emitter nodes along the hull |
| `weapons` | `mod_weapons` | Dorsal gun mount |
| `reactor` | `mod_reactor` | Central core |
| `cargo_hold` | `mod_cargo_hold` | Belly hold |
| `scanner` | `mod_scanner` | Prow array |
| `workshop` | `mod_workshop` | Mid-hull bay and tender arm |
| `armour` | `mod_armour` | Extra plating along the top and nose |

Overlays use the same `.` transparency and show the module's lit parts. Modules run from level 1 to 3 (`MODULE_MAX_LEVEL`):

| Level | Display |
|---|---|
| 1 | Overlay hidden. The base ship shows the standard part. |
| 2 | Overlay at 60% opacity `[TUNABLE]`. |
| 3 | Overlay at full opacity. |

---

## 4. Where images appear

| Screen (`View.kind`) | Image | Placement |
|---|---|---|
| `comms` | Portrait or crest, ×2 | Left of each inbox option |
| `message` | Portrait or crest, ×3 | Beside the sender line, text wraps to its right |
| `combat` (personal) | Enemy portrait, ×4 | Left of the round status. Changes when the next enemy steps up. |
| `combat` (ship) | Enemy ship, ×4 | Above the round status |
| `board` | Enemy ship, ×4 | Same as ship combat, on the "disabled, board her?" screen. A dimmed version would suit it. |
| `ship` | Player ship and overlays, ×3 | Top of the screen, above the module list |
| `nav` | Star map | Top of the screen, in place of the route tree (section 7) |

A portrait or ship sits in a small "feed" panel: `--bg` background, 1px `--frame` border, and the console's existing scanlines passing over it. At under 600px wide, side-by-side panels stack above the text.

---

## 5. How the art is made `[DECIDED]`

### 5.1 Source files

Each image is a plain text grid, one character per pixel, using the palette codes from section 2.2. Text grids can be written and reviewed in the repository, and they show up in git diffs.

```text
art/
  palette.json            # code -> hex
  portraits/dorrik.txt    # 32 lines of 32 characters
  crests/crest_durnvar.txt
  enemies/ork_boyz.txt
  ships/ork_raider.txt
  player/player_ship.txt
  player/mod_engine.txt
```

### 5.2 Build script

`scripts/build-art.mjs` reads the grids and writes PNGs to `public/art/`, using only Node's built-in `node:zlib`, so no new dependencies are needed. It adds an `npm run art` command and stops with a clear error if a grid has the wrong size or an unknown colour code.

The PNGs are committed, so `npm run build` and the GitHub Pages workflow do not need to run the art step. Vite copies `public/` as it already does for `emblem.svg`, and paths use `import.meta.env.BASE_URL` so they work on GitHub Pages.

### 5.3 Workflow for each image

1. Write the grid.
2. Run `npm run art`.
3. Look at it in the running game at its real size, and at ×2 for portraits.
4. Revise until it passes the art rules in section 2.3.

### 5.4 Replacing art later

A PNG in `public/art/` is all the game needs. A PNG made in Aseprite, Piskel or any other tool can replace a generated one, as long as it keeps the same file name and size. Delete the matching `.txt` so the script does not overwrite it. Keep to the palette if possible, so that it still matches the rest.

---

## 6. Code integration

### 6.1 Keep the engine pure `[DECIDED]`

The engine has no browser code and must stay that way. It names what should be shown, using art IDs. Only `src/ui/` turns an ID into an image.

New optional fields in `src/engine/types.ts` (exact shape can change during the build):

```ts
export type Visual =
  | { kind: 'portrait'; art: string; alt: string }
  | { kind: 'enemy' | 'enemy_ship'; art: string; alt: string; dim: boolean }
  | { kind: 'player_ship'; alt: string; modules: Record<ModuleKey, number> }
  | { kind: 'map'; map: NavMap; list: Line[] };

export interface Option {
  // existing fields...
  art?: string; // inbox thumbnail
}

export interface View {
  // existing fields...
  visual?: Visual;
}
```

`alt` carries the display name, so images have text for screen readers. Enemies listed in `dim_enemies` in `data/art.json`, currently only `SKRAGNAK_UNPLUGGED`, show their portrait powered down.

### 6.2 Art manifest

New file `data/art.json`, loaded and checked with the other data files:

```json
{
  "senders": { "Old Dorrik": "dorrik", "The Council of Hold Durnvar": "crest_durnvar" },
  "enemies": { "ORK_BOYZ_MOB": "ork_boyz", "SKRAGNAK_UNPLUGGED": "skragnak" },
  "dim_enemies": ["SKRAGNAK_UNPLUGGED"],
  "enemy_ships": { "ORK_RAIDER": "ork_raider" }
}
```

One manifest keeps art out of the content files, and the sender strings need a lookup anyway because `from` is free text.

### 6.3 UI changes

- `src/ui/app.ts`: `render()` draws `view.visual` between the screen head and the body. `renderOptions()` adds thumbnails.
- `src/ui/art.ts` (new): turns a `Visual` into DOM elements.
- `src/ui/map.ts` (new): draws the star map as inline SVG.
- `src/ui/style.css`: feed panel styles, using existing theme tokens.
- `src/ui/settings.ts`: a new **Graphics: On/Off** setting, saved per browser with the other settings, shown in the Settings panel. Off hides all `visual` content and thumbnails, and Nav shows the text route tree.

`render()` rebuilds the DOM after every choice, so images must be cached by the browser and have fixed width and height, or the layout will jump. A broken image hides itself and the screen carries on.

### 6.4 Tests

- Every enemy, enemy ship and message sender in `data/` has an entry in `art.json`. This catches a new sender or enemy added without art, and any `from` string that drifts out of sync.
- Every art ID in `art.json` has a PNG in `public/art/`.
- Every system has map coordinates.
- Every grid in `art/` matches its committed PNG, so a forgotten `npm run art` fails the tests.
- Every fight in `combat_encounters.json` shows an image whose PNG exists.
- `buildView` tests confirm the expected `visual` for comms, combat, boarding, ship and nav.
- No two routes on the star map cross.

---

## 7. Star map

The map is drawn live by code as inline SVG, not as an image, because it changes constantly and its labels must stay sharp at every text size.

### 7.1 Data

`data/systems.json` has no positions, so each of the 12 systems gets a `map` field, added to the schema as required:

```json
{ "key": "KARRAK_STATION", "map": { "x": 232, "y": 118 } }
```

Coordinates are in a 650×240 space. The sample layout below has no crossing routes, with home space on the left and Ork space on the right. All values are `[TUNABLE]`.

| System | x | y | System | x | y |
|---|---|---|---|---|---|
| Hold Durnvar | 52 | 108 | Skrapfang Rock | 408 | 34 |
| Kharr Hold | 104 | 200 | Da Pit | 516 | 50 |
| Kethra's Anvil | 150 | 38 | Urgrot's Camp | 596 | 122 |
| Karrak Station | 232 | 118 | Snazrik's Haven | 416 | 118 |
| Cinder Drift | 296 | 46 | The Scrapfield | 440 | 204 |
| Grimholt Belt | 304 | 204 | Rustmaw | 566 | 204 |

### 7.2 What the map shows

Only systems in `state.discovered_systems` appear, along with the routes between them. Hidden systems stay hidden.

| Element | Display |
|---|---|
| Current location | Teal ring around the node |
| Port | Square node (other systems are round) |
| Ork-held system | Red node |
| Other system | Blue node |
| Objective | Orange node, overriding the colours above |
| Not yet visited | Dimmed node and label |
| Route to the nearest objective | Dashed orange line |
| Other routes | Thin `--frame` line |

Colour never carries meaning alone: every node has a name label, and the destination list repeats objective, port and danger in text.

### 7.3 Interaction

- The numbered destination menu stays. It remains the main way to travel, and it already shows days, Fuel, danger and objective tags for each neighbour.
- Act 3 has no travel, so Nav keeps its plain list of known systems there and shows no map.
- Hovering or focusing a menu option or a map node highlights the shortest route to that system, and a line under the map shows total days and Fuel, plus tags. Both come from the existing `shortestRoutes` and `pathTo` in `src/engine/navmap.ts`.
- **R**, or the button under the map, opens the text route list on wide screens. Tab switches screens in this game, so this is how keyboard players read totals for distant systems.
- Clicking a neighbouring system picks the same `go:<KEY>` option as the menu, following the same locked rules. Clicking a distant system only highlights the route.
- With reduced motion on, the dashed line does not animate.

### 7.4 Replacing the route tree `[DECIDED]`

The tree currently shows totals and tags for distant systems, so section 7.3 has to carry that information before the tree goes away. `routeTreeLines` stays in the engine and is shown instead of the map when:

- Graphics are off.
- The screen is under 600px wide, where the map's labels would be too small to read.

It also opens beside the map with **R**, and serves as the screen-reader text for the map. `tests/navmap.test.ts` keeps working unchanged.

The engine builds a `NavMap` (nodes with flags, edges, the objective route) in `navmap.ts`, so the rules stay testable and the UI only draws.

---

## 8. Build order

Each push to `main` publishes the game, so every phase must leave it fully playable. Missing art simply shows nothing.

| Phase | Work | Done when |
|---|---|---|
| 1. Pipeline | `art/palette.json`, `npm run art`, `Visual` types, feed panel, Graphics setting, `art.json`, one test portrait (`dorrik`) and one test ship (`ork_raider`) | Both show correctly in the game, and the style and palette are approved. **Stop here for review before drawing the rest.** |
| 2. Comms | 5 remaining faces and 4 crests, inbox thumbnails | Every sender has art and the coverage test passes |
| 3. Enemies | 17 enemy portraits, Grizzgut first because he has to work across three stages | Every personal fight shows the right portrait |
| 4. Ships | Remaining 7 enemy ships, `player_ship`, 8 module overlays | Ship tab reflects module levels, and every ship fight shows its enemy |
| 5. Map | Coordinates, `NavMap`, `src/ui/map.ts`, route highlighting | Map and text fallback both work, with all tests passing |
| 6. Finish | Accessibility pass, mobile check, doc updates (section 9) | `npm test` and `npm run build` pass, and a full run looks right |

Phases 2 to 5 do not depend on each other, so they can be reordered.

---

## 9. Docs to update during the build

- `game-overview.md`, principle 1 (section 1): it says there is no map exploration outside console menus. The map only displays information and shortens a menu choice, so reword rather than remove.
- `game-overview.md`, route tree `[DECIDED]`: now the fallback for the star map.
- `game-overview.md`, Visual style: add a pointer to this document.
- `README.md`: mention `npm run art`, `art/`, and this document in the tables.
- `game-overview.md`, Settings (section 9.0): add the Graphics setting to the list.

---

## 10. Later, not in the first pass

- **Crew portraits:** `ylsa` and `brokka` do not send Comms messages, so they are not needed yet. Dorrik and Hrolla already get portraits. Crew could appear on the Ship screen. Note that Ylsa's low-Hearthfire warning is called a Comms line in `story.md`, but it is a `notice` screen in the code.
- **Player portrait:** one each for Kin and Ironkin, or more for classes and gender. The character sheet and personal combat are the natural places.
- **System images:** a small scene for each of the 12 systems on arrival.
- **Damage states:** the ships showing Hull damage.
- **Player ship variants:** a heavier ship for the Cthonian Berserk, whose kit describes a heavy deep-drill ship.
- **Both ships in ship combat:** the player's ship facing the enemy's, with hit flashes.
- **Half-armoured Skragnak** for `SKRAGNAK_AMBUSHED`.
- **Title screen and ending art.**
