# Dad-Friendly Game

How the game plays is in `docs/DESIGN.md`. How it is built is in `docs/ARCHITECTURE.md`.

## Play-test in a browser

`npm run play` opens the game in Chrome (puppeteer-core, on its own Vite dev server) on a phone screen and a desktop screen. It starts from a named save, runs a short list of taps, and keeps a shot after each step. It is how an agent proves a sliver in a real browser.

```bash
npm run play -- tap:.mountain*5 label:Buys
npm run play -- --save mid --screen phone label:Engineers
npm run play -- --help
```

The saves are `fresh` (nothing saved), `early`, `mid`, `workshop`, `crew`, and `late` (one stone left, so a tap finds the legend). They come from the visual check's fixtures in `scripts/fixtures.mjs`. The actions are `tap:<css>`, `label:<accessible name>`, `wait:<ms>`, and `wait:<css>`. A tap takes `*N` to repeat. Shots and `log.txt` (console, page errors, failed requests, and the save line) go to `play-shots/`, which is gitignored and cleared on each run. `--out` picks another folder and `--url` drives an app that is already running. Any page error, or an action that cannot run, exits non-zero.

## The gate

```bash
npm run gate -- fast
npm run gate -- full
```

`fast` is the edit-and-test loop. It runs the typecheck (incremental, so a warm run is quick), plus ESLint and `vitest related --project unit` on the code files changed since `origin/main`, including staged, unstaged, and untracked ones. No browser, no emulator, no economy sims. `npm run check:fast` is the same.

`full` runs every check before a PR is opened: the toolchain report, typecheck, lint, import cycles, formatting, knip, CSS tokens, unit and sim tests with coverage, then the Firestore rules in the emulator and the two browser checks once the static checks pass. When the branch changes code the strategy lab runs (anything in the import closure of `tools/strategy-lab.ts`, `tools/generations-lab.ts`, and the lab's policies and measures), the strict lab runs too, beside the browser checks, once the tests pass. Independent steps run in parallel. On 4 cores the full tier takes about 3.5 minutes, or about 7 minutes when the lab runs (`lab:generations` plays each policy and seed in its own process; about 3 minutes alone, #314). `npm run check` is the same.

No checks run on GitHub for a pull request. The gate is run by hand: `fast` where superpowers says to verify, and `full` before the PR is opened. Red means no PR. A green `full` on a clean, committed HEAD can be signed off once it is pushed:

```bash
npm run gate -- signoff
```

It starts the `signoff` workflow, which only posts the `signoff` commit status. The ruleset on `main` requires that status on an up-to-date branch, so a PR merges only after the full gate passed on its last commit. Never post `signoff` any other way. On push to `main`, `deploy-hosting` runs `npm run check` again on a clean runner and deploys only if it passes (#397).

Each step prints one line, such as `ok    typecheck  4.1s` or `FAIL  lint  2.3s  exit 1`. Every full log goes to `.gate/logs/<step>.log` (gitignored). A failed step also prints the last 40 lines of its log. A step behind a failed one is skipped. The steps, their tiers, and their order are a table in `src/gate.ts`.

## Tests

Vitest has two projects (`vite.config.ts`). `unit` is every test file except `*.sim.test.ts`, and runs in about 20 s. `sim` is the `*.sim.test.ts` files: long economy runs, anything that plays the economy for over a second, whether in a test or at collect time in a `describe` body. `npx vitest run --project unit` runs one project; the full tier's coverage run takes both, and the coverage floors are measured over both together.

Tests run in plain `node`. A test file that needs the DOM opens with `// @vitest-environment happy-dom`. A test that mounts the mountain screen stops it afterwards (`stopScreens` in `src/mountain-screen.harness.ts`), so its one-second tick does not run on into later tests.

## Strategy lab

`npm run lab` plays every registered player type and writes `reports/strategy-lab.md` and `reports/strategy-lab.json`. Those files are gitignored. Locally the seed count is `LOCAL_SEEDS`. `--ci` uses `CI_SEEDS` (see `src/lab/targets.ts`). `--seeds` overrides either. The lab is not part of the game the player runs. The full gate runs it with `--ci` and `LAB_STRICT=1` when economy code changed, so a missed guardrail fails the gate. Without that variable a miss is a warning.

The markdown table is one row per player type and one column per measure. A green pass or a red fail means a guardrail in `src/lab/targets.ts` covers that cell. A bare number has no guardrail. The header gives the optimizer's finish day and the plain dad's (`casual-2x10`); regret and extreme win use those two figures.

Below the table: per-hour timelines for the casual player types and the optimizer, move kinds that were never the best buy, and dead stretches longer than two hours, for payback and for value per stone (when they start, what the dad is saving for, and the next payback). The suggestions name what missed. They do not change a number in the game. A policy that never owns a borer shows n/a for tending share.

```bash
npm run lab
npm run lab -- --policy casual-2x10 --seeds 1 --days 7
```

A new file in `src/lab/policies/` adds a row. A new file in `src/lab/measures/` adds a column. A new entry in `src/lab/targets.ts` adds a pass or fail. Nothing else has to change.

`npm run lab:sweep` asks which economy knobs move the measures. Morris screening runs first, then Sobol (S1 and ST) on the top knobs. The report is `reports/sweep.md`, also gitignored. It is not part of `npm run check`. The default run is the casual dad and `longestDeadStretch`, `singleShare`, `dominantShare`, and `finishDay`. Knobs are one entry each in `tools/sweep/knobs.ts`.

```bash
npm run lab:sweep -- --morris 4 --sobol 16 --top 4 --days 30
```

## Field log reader

Signed-in games copy a snapshot and the latest event ring to `fieldLogs/{uid}`.
`tools/field-log.ts` reads those documents with the Firebase Admin SDK. It is
not part of the game the player runs, and it is not bundled into the app.

### One-time sign-in

On the machine that reads logs:

```bash
gcloud auth application-default login
```

That writes Application Default Credentials. A service-account JSON file works
too, when `GOOGLE_APPLICATION_CREDENTIALS` points at it. Do not commit either
credential.

The Firestore emulator needs no credentials. When `FIRESTORE_EMULATOR_HOST` is
set (as `firebase emulators:exec` does), the script talks to that host.

### Usage

```bash
npm run field-log -- --uid <uid>
npm run field-log -- <uid>
npm run field-log
npm run field-log -- --uid <uid> --json
```

With no uid, every `fieldLogs` document is listed. The default print is a short
summary with times in this machine's local zone. `--json` prints the stored
documents (ISO times, `updatedAt` as epoch milliseconds) with the uid, which
lives in the document id.

### Privacy

Only household players are read. The document holds the uid, the latest
snapshot, and the latest event ring: stones, crew, relics, and recent events.
No email and no display name. Start over and passing the mine clear the ring
and overwrite the document. The Admin SDK bypasses the game's security rules,
so keep these credentials on a machine you trust.
