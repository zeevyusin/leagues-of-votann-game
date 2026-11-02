# Votann Command Console

A text adventure played from the console of a Kin prospector's ship. Unofficial, free, non-commercial fan project; not affiliated with Games Workshop.

Design specs: [game-overview.md](game-overview.md), [character-creation.md](character-creation.md), [combat-system.md](combat-system.md), [story.md](story.md).

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
| `npm test` | Runs the engine tests, including automated Act 1 and Act 2 playthroughs for every class and kin type |
| `npm run build` | Type-checks and builds a static site into `dist/` |
| `npm run typecheck` | Type-checks only |

## Where things live

| Path | Contents |
|---|---|
| `data/` | All content and every tunable number. `config.json` holds the `[TUNABLE]` values and `[DECIDED]` flags. |
| `src/engine/` | The game itself, in pure TypeScript with no browser code. `game.ts` is the entry point: `buildView(state)` and `applyChoice(state, id)`. |
| `src/ui/` | The browser console: rendering, keyboard input, theme, and save slots. |
| `tests/` | Vitest tests for the engine. |

Data files are checked when the game loads. A broken reference (for example a beat pointing to a missing encounter) stops the game with a list of problems instead of failing mid-scene.
