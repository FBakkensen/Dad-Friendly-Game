# The pass, Legacy, kid runs, Grandpa and the generations lab are deleted (#729) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the pass, Legacy, kid runs (the stretch), Grandpa and the generations lab from the model, save writer, screens, labs, gate and docs, with no save reset.

**Architecture:** A deletion sliver, the first of five under #665 (then #737, #738, #739, #740). Today's mountain (`fresh.off=1`, tests and labs only) loses its run-to-run layer: every run is run 1, stretch 1, Legacy 0. The live frame (the fresh mine) already wires `legacy: NO_PASS` and never reaches the bottom, so it shows nothing new.

**Tech Stack:** TypeScript, Vitest, Firestore rules (emulator test), the strategy lab.

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "What goes, and what stays" ("the pass, Legacy, kid runs, Grandpa and the generations lab (#642)"). Issue #729, part of #665.

## Global Constraints

- **No save reset** (ruling on #729): `SAVE_VERSION` stays 10. `run.generation` (cap 1000) and `run.stretch` (cap 1,000,000) stay readable as retired keys. The reader accepts them at their caps and ignores them, the writer never writes them, and `save-ledger.test.ts` lists them as retired. The archive reason `"pass"` stays readable in `ARCHIVE_REASONS`, and `firestore.rules` stops accepting it on create.
- The field-log snapshot drops `legacy`, and `firestore.rules` and its emulator test follow in the same commit.
- Out of scope (later issues): the strategy lab's today's-mountain policies and `TARGETS` (#737), `pacing.ts`, sweep, seed saves and mockups beyond Legacy's own parts (#738), the `fresh.off` switch (#739), and depth, `remaining` and `scale.ts`'s depth parts (#740).
- Today's mountain keeps playing in tests and labs as a single run: `stretch()` and `oneOffStretch()` become 1, or are deleted with their callers using 1. `KID_MACHINE_OPENS` goes.
- The Kid worker tier (`owned.kid`) stays: the spec brings kid workers back with a building.
- Never lower a coverage floor (only a deleted file's floor line goes). Never skip a test. No function over 150 lines or cognitive complexity 15. No new player copy. Never "face", "hands" or "by hand".
- Ladder: touched tests, then `npm run typecheck`, `npm run test:rules` when rules change, `npm run knip`, and `npm run gate -- fast` at the end of each task. Commit and push each task on `claude/project-thread-tj0lg3`.
- The four report-only rows from #728 stay report-only. `RUN_LENGTH_RULE` goes with the generations lab. No guardrail limit changes. If a strict guardrail fails, stop and report it.

## Review Focus

1. A v10 save holding `run.generation: 0` and `run.stretch: 1` (what a v10 writer may have written) still reads `ok` and plays (`save-format.test.ts`, `persist.test.ts`).
2. A stored field-log document from #728's build (with `legacy`) is replaced by a write from this build, and the rules accept the smaller snapshot (emulator test).
3. An older Saved copy with archive reason `"pass"` still lists and restores (`saved-copies` / `cloud-save` tests).
4. The frame boots, plays and saves with no page error (`npm run play` on `start` and `night`).
5. Today's mountain reaches the bottom in the labs and ends the run, with no pass offered and no NaN (`pacing.sim.test.ts`, the strategy lab).

---

### Task 1: Model, save, screens and tests

**Files:**

- Delete: `src/legacy.ts`, `src/legacy-panel.ts`, `src/legacy.test.ts`, `src/legacy-panel.test.ts`, `src/grandpa.test.ts`, `src/welcome-legacy-teach.test.ts`.
- Modify:
  - Rules: `rates.ts` (`LEGACY_STEP`, `legacyBonus`, Grandpa's tenth in `slotGuesses`, the Legacy key in staffing and `tendingStaysPut`), `engineers.ts` (`GRANDPA_RANK`, `grandpaPost`, Grandpa's half of `tendingTenths`), `scale.ts` (`KID_RUN_GROWTH`, `MAX_STRETCH`, `kidStretch`, `KID_MACHINE_OPENS`; `stretch`/`oneOffStretch` collapse to 1 or go), `crew.ts` (`kidOpens`), `mountain.ts` (`legacy`, `stretch`, `MAX_LEGACY`).
  - Save: `save-format.ts` (retired keys), `save-progress.ts`, `progress-store.ts` (`passTheMine`), `save-choice.ts` and `store-actions.ts` (`run.pass`), `cloud-save.ts`.
  - Screens: `ledger-parts.ts` (Pass plate, `passOffered`), `ledger-panel.ts`, `frame-ledger.ts` (`NO_PASS`), `how-it-works.ts` (the Legacy card), `screen-words.ts` (Grandpa words, `PASS_*`), `board-interaction.ts` (`"legacy"` control), `board.css` `.legacy-*` and their `style.test.ts` pins. `legacy-plate.png` stays (`board-skin.ts` uses it). `grandpa-miner.png` goes if nothing imports it.
  - Field log and rules: `field-log.ts` (snapshot `legacy`), `tools/field-log.ts` and its tests, `firestore.rules` (`'legacy'` in `hasOnly`, the legacy check, `'pass'` on create), `rules-test/firestore.rules.test.ts`.
  - `tools/browser/fixtures.ts` (`generation`, the kid-run save) and `fixtures.test.ts`. `mockups/teach.ts`, `teach.css` and `page.test.ts` (the Legacy card), and `scripts/mockup-check.mjs` (its `legacy` rows), `scripts/ui-audit.mjs` `.legacy-*`.
  - Tests named in the survey: `scale`, `rates`, `engineers`, `screen-words`, `progress-store`, `progress-store-new-run-copy`, `ledger-parts`, `ledger-panel`, `field-log`, `persist`, `save-format`, `economy/invariants`, `board-card`.

- [ ] Tests first: in `save-format.test.ts`, "a v10 save with run.generation 0 and run.stretch 1 reads ok, and the writer writes neither"; in `save-ledger.test.ts`, the two retired keys; and in the rules test, "a field-log write without legacy is accepted, a create with archive reason pass is refused". Delete tests that only proved the pass, Legacy, kid runs or Grandpa.
- [ ] Remove the code. Where `stretch` or `legacy` fed a price or a rate, use 1 or 0 and delete the parameter when nothing else varies it.
- [ ] Run `npm run typecheck`, the touched tests, `npm run test:rules`, `npm run knip` and `npm run gate -- fast`. Commit "The pass, Legacy, kid runs and Grandpa are deleted (#729)".

### Task 2: The generations lab, the gate step, pacing, and docs

**Files:**

- Delete: `src/lab/generations.ts`, `generations.test.ts`, `generations.sim.test.ts`, `tools/generations-lab.ts`, `docs/generations-design.md`.
- Modify: `src/gate.ts` (`LAB_ENTRIES`, the `lab:generations` step, `REUSABLE`) and `gate.test.ts`; `package.json` (`lab:generations`); `src/lab/targets.ts` (`KID_RUNS_CI`, `RUN_LENGTH_RULE`, `KID_RUN_MAX_DAYS`, and the generations part of the report-only comment); `pacing.ts` (the `legacy` option) and `pacing.sim.test.ts`; `line-staffing.sim.test.ts`; `CLAUDE.md` (the `lab:generations` line), `README.md`, `docs/DESIGN.md` (a short "#729" history note; Legacy, the pass, kid runs and Grandpa marked gone), `docs/ARCHITECTURE.md`, `docs/design-intent.md`, `docs/economy-overhaul.md`, `docs/balance-review.md`, `docs/ui-audit.md` and `docs/ART.md`.

- [ ] Remove the code, the step and the script.
- [ ] Run `npx vitest run --project sim` and re-pin only values the deletions moved, with each old→new value and its reason in the report. Run the strategy lab the way the gate does (`LAB_STRICT=1 node --import ./tools/lab-register.mjs tools/strategy-lab.ts --ci --ledger check`) in the background. A strict guardrail FAIL is a stop. If only the ledger differs, run `npm run lab:ledger`.
- [ ] Run coverage with both projects once. Every floor must hold.
- [ ] Run `npm run gate -- fast`, then `npm run play` on `start` and `night`. Commit "The generations lab is deleted, and the docs after #729".
