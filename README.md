# Votann Command Console

A text adventure played from the console of a Kin prospector's ship, in the Ashfall Reach. Unofficial, free, non-commercial fan project; not affiliated with Games Workshop.

## Playing

**Play it in your browser: https://zeevyusin.github.io/leagues-of-votann-game/** (or run it locally, see [Run it](#run-it) below).

- **Numbered menus.** Press 1 to 9, or 0 for the tenth option, or click. Long lists show 8 options at a time: 9 goes back a page, 0 goes forward.
- **Tab** switches between the console screens: Comms, Nav, Ship, Logbook, and the Market while docked.
- **Esc** opens the System menu: save to one of 3 slots, export or import a save file, How to play, Settings, and About.
- **Saving.** The game autosaves after every choice. Saves live in your browser, so export a save file if you want to move to another browser or computer.
- **How to play** (title screen or System menu) explains rolls, both kinds of combat, Hearthfire, Wear, relics and the Waaagh!.

A full campaign takes about 4 to 6 hours. Every run reaches an ending, and after the epilogue you can keep flying and finish a last quest chain picked by your ending.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Runs the engine tests, including automated playthroughs of all three acts, the epilogue and the post-game quests for every class and kin type, and the balance checks |
| `npm run build` | Type-checks and builds a static site into `dist/` |
| `npm run preview` | Serves the built site locally |
| `npm run typecheck` | Type-checks only |

## Publishing on GitHub Pages

The workflow in `.github/workflows/deploy.yml` tests, builds and publishes the site on every push to `main`. One-time setup:

1. Create an empty repository on GitHub.
2. Push this repository to it.
3. On GitHub, open **Settings > Pages** and set **Source** to **GitHub Actions**.

The site then appears at `https://<your-user>.github.io/<repository>/`.

## Where things live

| Path | Contents |
|---|---|
| `data/` | All content and every tunable number. `config.json` holds the `[TUNABLE]` values and `[DECIDED]` flags. |
| `src/engine/` | The game itself, in pure TypeScript with no browser code. `game.ts` is the entry point: `buildView(state)` and `applyChoice(state, id)`. |
| `src/ui/` | The browser console: rendering, keyboard input, paging, settings, help, the dice animation, and save slots. |
| `tests/` | Vitest tests for the engine, including the automated test player in `playthroughPolicy.ts`. |
| `*.md` | The design specs: [game-overview.md](game-overview.md), [character-creation.md](character-creation.md), [combat-system.md](combat-system.md), [story.md](story.md). |

Data files are checked when the game loads. A broken reference (for example a beat pointing to a missing encounter) stops the game with a list of problems instead of failing mid-scene.
