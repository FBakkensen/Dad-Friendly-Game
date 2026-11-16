# The fresh mine is the only rules path (#739) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `FRESH_OFF`, `LINE_OFF`, `freshMineOn` and `lineOn` are deleted, every branch they chose collapses to the fresh mine, and the old rules that only those branches reached go with them. The game plays as it does today.

**Architecture:** The fourth of five deletion slivers under #665 (#729, #737, #738 done; then #740). Every page and the lab already hold `fresh.off=0` (`PLAY_FACTORS`, #737), so the fresh mine is the only game anyone plays. Since a fresh mine turns the line on, `lineOn()` is true there too. This sliver makes both switches constant: each `if (freshMineOn())` and `lineOn() ? a : b` keeps its fresh or line branch, the other branch goes, and what only the other branch reached goes once knip or a search shows nothing kept calls it. `part2.off` and `part3.off` stay, because they are still real switches. Tasks go from the rules out to the screens, so each task leaves the tree compiling. `line-switch.ts` loses its exports only in the last task.

**Tech Stack:** TypeScript, Vitest (`unit` and `sim` projects), knip, puppeteer-core scripts, Playwright journeys.

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "What goes, and what stays". Issue #739, part of #665.

## Global Constraints

- **Flemming (16 Nov 2026):** "Delete everything about the old game."
- **No save reset.** `SAVE_VERSION` stays 10, and `src/save-format.ts`'s game map keeps every key and id it has. A field the old rules wrote but the fresh mine never changes (`remaining`, `engineers`, `expeditions`, `bench`, `upgrades`, `seen` and the like) stays in the save shape, and its reader and writer stay. Ruling: removing a shipped save id needs a version bump (`observable-saves.md`), and that bump is not this sliver's. Depth and the mountain's size (`remaining`, bands, layers' depth) are #740's. Here their fresh branch is kept and their other branch goes, but the depth data stays.
- **No player-visible change.** Every page held `fresh.off=0` already, so what a page shows stays the same. Proof: the visual check, the journeys, and `npm run play -- --save slice-start`.
- **The lab's numbers do not move.** After the build, run `npm run lab:ledger`, then `git diff --exit-code docs/pacing-ledger.md`. An end hash may move only if the mountain's shape changes. It must not change here, so any diff is a bug.
- `PLAY_FACTORS` becomes `{ "part2.off": 0 }`. Ruling: `runPolicy`'s guard (`src/lab/run.ts`, `NOT_FRESH`) now requires `partTwoOn()`, so the lab still plays only the game's mine. `tools/strategy-lab.ts` refuses `--factors fresh.off=…` and `line.off=…` with one message, "`<name>` no longer exists: the fresh mine is the only mine (#739)."
- Tests that wrapped a body in `withFactors({ [FRESH_OFF]: 0, … })` drop that key and keep the rest. A test of the old branch goes with it. A test that relied on the default factors to play today's mountain either plays the fresh mine (if what it tests still exists) or goes with what it tested. Teach rules that read today's rates helpers (tending, promotion, staffing) are rewritten for the fresh mine, or go if nothing kept reaches them.
- Old code goes only when nothing kept reaches it: no kept non-test module calls it, and knip names it, or a `grep` shows only its own tests. A mechanism the fresh mine still uses is kept and never copied.
- Never skip a test. Never lower a coverage floor (only a deleted file's floor line goes). No function over 150 lines or cognitive complexity 15. No new player copy, and never "face", "hands" or "by hand" in new words. Ids in code are free.
- Ladder (`dad-friendly-work.md`): the touched tests, `npm run typecheck`, `npm run knip`, `npm run functions`, `npm run gate -- fast`. After the screens task, run the visual sections for the Ledger, save sheet and saved copies, plus `npm run play -- --save slice-start`. Commit and push each task on `claude/project-thread-tj0lg3` (`git push -u origin claude/project-thread-tj0lg3`).
- If the build runs long, split the rules from the screens (issue body): Tasks 1–3 ship, and Task 4's screens become a new issue. Tell the controller before splitting.

## Review Focus

1. A page's state is unchanged. `createMountain()` under default factors is today's page start: jobs `FRESH_START_JOBS`, `givenFleet()`, and workers on those jobs. A save written before this PR reads back identically, which the save ledger and `save-format.test.ts` cover.
2. `rates` no longer runs the staffing search or the tending floor. `effectiveRates` is `workforceRun` plus `lineOf`, and its cache key loses the line bit. Timing one lab job against `main` (`lab.md`) shows no slowdown.
3. `tierCost` always uses `LINE_MACHINE_COST_GROWTH` and `lineSticker`. "The prices play charges (#738)" in `tiers.test.ts` passes unchanged.
4. Away pay is `accrueNight` only. The old `paidAwayMs` and expedition walk go if nothing else calls them, and `AWAY_PAY_RATE` stays only if a kept screen reads it.
5. Part 2 and part 3 still switch: with `part2.off` unset, a test plays part 1 of the fresh mine. `partTwoOn()` is `factor(PART_TWO_OFF) === 0`.

---

### Task 1: The rules play only the fresh mine

**Files:**

- Modify: `src/scale.ts`, `src/tiers.ts`, `src/upgrades.ts`, `src/layers.ts`, `src/line.ts`, `src/crew.ts`, `src/engineers.ts`, `src/mountain.ts`, `src/rates.ts` (and `src/staffing.ts`, keeping `moreStones` only if it is still used), `src/economy/actions.ts`, `src/part-switch.ts`, `src/workforce.ts` and `src/city.ts` (comments only), plus their tests.

**Interfaces:**

- Produces: every function keeps its name and signature, but has the fresh/line branch only. `partTwoOn(): boolean` is `factor(PART_TWO_OFF) === 0`. `PLAY_FACTORS` is `Object.freeze({ [PART_TWO_OFF]: 0 })`. `freshMineOn` and `lineOn` are still exported from `line-switch.ts`, so the screens and the lab compile until Tasks 3 and 4.

- [ ] **Step 1:** In each listed module, replace every `freshMineOn()` with `true` and every `lineOn()` with `true`, then simplify: delete the dead branch, and inline or delete the helpers only it used (for example `rates.ts`'s `keptStaffing`, `applyTendingFloor` and `tendingStaysPut`; `outputOf` if `lineOf` is the only caller left; `MACHINE_COST_GROWTH`; `PREVIOUS.off`; `LAYER_FAVOURS`; `BAND_SCALE` if `LINE_BAND_SCALE` is the only one read). In `mountain.ts`, `createMountain` always gives the fresh start, `digStones` always adds to stock, and `accrueAway` is `accrueNight`.
- [ ] **Step 2:** Run `npm run typecheck && npm run knip`. Delete each export knip now names, along with its tests, when the export belongs to an old-game rule. If a kept module still calls it, keep it.
- [ ] **Step 3:** Run `npx vitest run` (unit) and `npx vitest run --project sim`. Fix each failure as Global Constraints says: drop the `FRESH_OFF` key, rewrite the test for the fresh mine, or delete a test of a deleted rule. Never change an expected number in a kept fresh-mine test, because a changed number means behaviour moved.
- [ ] **Step 4:** Run `npm run functions`, then `npm run gate -- fast`, then commit "M15-28f: The rules play only the fresh mine (#739)" and push.

### Task 2: The lab and the tools stop naming the switches

**Files:**

- Modify: `src/lab/fresh-view.ts`, `src/lab/run.ts`, `src/lab/world.ts`, `src/lab/line-view.ts`, `src/lab/score.ts`, `tools/strategy-lab.ts`, plus their tests and `tools/journeys/expected.ts` if it names a switch.

**Interfaces:**

- Consumes: Task 1's `partTwoOn`, `PLAY_FACTORS`.
- Produces: `runPolicy` throws `NOT_FRESH` unless `partTwoOn()`, and its message names `PLAY_FACTORS`. `strategy-lab` refuses `fresh.off` and `line.off` as Global Constraints says.

- [ ] **Step 1:** Collapse each site the same way as in Task 1. `lineView` always gives the line, and `score`'s line parts are always on.
- [ ] **Step 2:** Run `npx vitest run src/lab tools`, then `npm run typecheck:tools`.
- [ ] **Step 3:** Run `npm run lab:ledger`, then `git diff --exit-code docs/pacing-ledger.md`. It must print nothing. Time one lab job against `main` (`time npm run lab -- --seeds 1 --policy casual-2x10`). The run must not be slower than `main`'s by more than noise (10%).
- [ ] **Step 4:** Run `npm run gate -- fast`, then commit "M15-28f: The lab stops naming the old switches (#739)" and push.

### Task 3: The screens show only the fresh mine

**Files:**

- Modify: `src/board-drawer.ts`, `src/save-sheet-copy.ts`, `src/save-preview.ts`, `src/saved-copies-panel.ts`, `src/ledger-panel.ts`, `src/ledger-parts.ts`, `src/ledger-rows.ts`, `src/screen-words.ts`, `src/milestones.ts`, `src/how-it-works.ts`, `src/teach.ts` if it reads a removed rates helper, `scripts/play.mjs`'s help example (`wait:.board-sheet.is-open` becomes a selector a slice screen renders), plus their tests.

**Interfaces:**

- Consumes: Tasks 1 and 2.
- Produces: each screen keeps its fresh copy (`CLOSE`, `START_OVER_FRESH_KEEP`, `FRESH_WORDS`, `freshPair`, `MACHINE_WORDS` and so on). Today's copy goes when nothing else reads it.

- [ ] **Step 1:** Collapse each site. Delete today's copy and its helpers (`todaysPair`, `BACK_TO_THE_MOUNTAIN` and `"Back to the board"` if nothing else reads them, and `START_OVER_KEEP`). The Ledger's `systems` is `[]`, and its crew block is always shown.
- [ ] **Step 2:** Run `npx vitest run`, `npm run typecheck`, `npm run knip`, then `npm run gate -- fast`.
- [ ] **Step 3:** Run `VISUAL_ONLY='slice' npm run visual`, which runs every slice section. Then run `npm run play -- --save slice-start` and `npm run play -- --save refinery`. No page error, and the save line writes.
- [ ] **Step 4:** Commit "M15-28f: The screens show only the fresh mine (#739)" and push.

### Task 4: The switches are gone

**Files:**

- Modify: `src/line-switch.ts` (delete `LINE_OFF`, `FRESH_OFF`, `freshMineOn` and `lineOn`; delete the file if nothing is left), `src/part-switch.ts`'s doc comment, every test that still imports them, `scripts/visual/kit.mjs` if it names a switch (its `lineOnTop` is a local and stays), `docs/ARCHITECTURE.md`, `docs/DESIGN.md` and `docs/design-intent.md`, which say what is true now (the switches went in #739; today's mountain's rules are history).

- [ ] **Step 1:** Delete the exports, then run `npm run typecheck && npm run typecheck:tools && npm run knip`, and fix each importer.
- [ ] **Step 2:** Run `grep -rn "freshMineOn\|lineOn\|FRESH_OFF\|LINE_OFF\|fresh\.off\|line\.off" src tools scripts docs/ARCHITECTURE.md docs/DESIGN.md`. Only history lines (with "until #739") and the lab's refusal may stay.
- [ ] **Step 3:** Update the docs. In `docs/ARCHITECTURE.md`, mark the switches and the old staffing and tending as gone in #739, and say that the fresh mine is the rules. `docs/DESIGN.md` gets its history line under the #738 one.
- [ ] **Step 4:** Run coverage once (`npx vitest run --coverage` with both projects, as the gate runs it) and check that every floor holds. Then run `npm run gate -- fast`, commit "M15-28f: fresh.off and line.off are gone (#739)" and push.
