# Dad-Friendly Game

How the game plays is in `docs/DESIGN.md`. How it is built is in `docs/ARCHITECTURE.md`.

## Strategy lab

`npm run lab` plays every registered player type for `MONTE_CARLO_SEEDS` seeds (see `src/lab/targets.ts`) and writes `reports/strategy-lab.md` and `reports/strategy-lab.json`. Those files are gitignored. The lab is not part of the game the player runs.

The markdown table is one row per player type and one column per measure. A green pass or a red fail means a guardrail in `src/lab/targets.ts` covers that cell. A bare number has no guardrail. The header gives the optimizer's finish day and the plain dad's (`casual-2x10`); regret and extreme win use those two figures.

Below the table: per-hour timelines for the casual player types and the optimizer, move kinds that were never the best buy, and dead stretches longer than two hours (when they start, what the dad is saving for, and the next payback). The suggestions name what missed. They do not change a number in the game.

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
