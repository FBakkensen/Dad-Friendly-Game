# Depth and the mountain's size are deleted (#740) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depth goes: the mountain's size, its bottom, "stones left", the depth bands with their hardness and their materials, and `scale.ts`. The game plays as it does today.

**Architecture:** The last of five deletion slivers under #665 (#729, #737, #738 and #739 are done). Since #739 the fresh mine is the only rules path, so `digStones` never lowers `remaining`, `stonesLeft()` is Infinity, and the band never leaves the Topsoil (band 0, scale 1). Every depth read is therefore a constant. This sliver inlines those constants into their readers and deletes the depth machinery. What the fresh mine owns stays: the levels in `mine-levels`, materials from rock drilled (`withMaterials` in `factory`, from `rockDug` and `graniteDug`), and the `LayerId`, `MaterialId` and `Materials` types.

**Tech Stack:** TypeScript, Vitest (`unit` and `sim` projects), knip, the Firestore emulator test (`npm run rules`).

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "What goes, and what stays" (depth, the mountain's size and bottom, "stones left", the mined-out state). Issue #740, part of #665.

## Global Constraints

- **Flemming (16 Nov 2026):** "Delete everything about the old game."
- **No save reset.** `SAVE_VERSION` stays 10. `Mountain.remaining` goes from the mountain. The save's `run.dug` joins `run.generation` and `run.stretch` as a retired key: it is checked as it always was, then ignored, and it is no longer written (ruling on #729, the `RETIRED_RUN_CAPS` pattern in `src/save-format.ts`). A save of today, which has `run.dug: 0`, reads back to the same mountain. The save ledger (`src/save-ledger.test.ts`) and `save-format.test.ts` say so. Every other key stays.
- **No player-visible change.** Every number on screen that read depth read the band-0 or Infinity constant, so the screens show what they show now. Proof: `VISUAL_ONLY='slice' npm run visual`, the journeys, and `npm run play -- --save slice-start`.
- **The lab's numbers do not move.** Run `npm run lab:ledger`, then `git diff --exit-code docs/pacing-ledger.md`. An end hash may move only because `remaining` leaves the mountain's shape. If it moves, say so in the PR body and show that every other column is unchanged.
- `rockDugInAll(mountain)` becomes `mountain.rockDug` (rename it `rockDug` or inline it; the choice is the implementer's), and `.claude/rules/observable-saves.md`'s "ahead" rule says "more rock dug (rock drilling dug in a fresh mine, a count that only grows)". That rule-file line is the only change to `.claude/rules/`.
- The field log (`src/field-log.ts`) loses `mined`, `left` and `legacy`. `firestore.rules` drops them from the snapshot's `hasOnly` list and their checks, and the emulator test (`npm run rules`) passes with a snapshot that has none of them.
- The workshop's and session's depth gates become "closed until part 3", read from `partThreeOn()` / `stationOpen` as the factory already does. Use the existing mechanism; never add a second gate.
- `upgradeCost`'s band stretch (`oneOffStretch`) is 1, so the call drops its `k`. "The prices play charges (#738)" in `src/tiers.test.ts` passes unchanged.
- Never skip a test. Never lower a coverage floor (only a deleted file's floor line goes). No function over 150 lines or cognitive complexity 15. No new player copy, and never "face", "hands" or "by hand" in new words. No guardrail in `src/lab/targets.ts` changes. `TARGETS` stays empty, and a lab measure that read depth goes, or reads a constant.
- Ladder (`dad-friendly-work.md`): the touched tests, `npm run typecheck`, `npm run typecheck:tools`, `npm run knip`, `npm run functions`, `npm run rules`, `npm run gate -- fast`, then the visual and play checks above. Commit and push each task on `claude/project-thread-tj0lg3` with `git push -u origin claude/project-thread-tj0lg3`.

## Review Focus

1. A save of today reads back unchanged except for `remaining`, and a save with `run.dug` above 0, or above its old cap, gets the same verdict as before.
2. `firestore.rules` still refuses an unknown snapshot key, and accepts the new snapshot.
3. The workshop, the factory station and the session's gates open at the same moment as on `main` under `PLAY_FACTORS`, both with and without `part3.off`.
4. Away and live pay are identical: no stretch split, rate or material moved. `withMaterials` still gives clay and iron from rock drilled.
5. knip finds nothing left over from #665.

---

### Task 1: Depth leaves the rules

**Files:**

- Delete: `src/scale.ts` and its tests. Every reader inlines the constant it read (`stonesLeft()` is Infinity, `oneOffStretch` is 1, the band is 0, `minedOut` is 0) and drops what only depth needed.
- Modify:
  - `src/layers.ts` (delete the depth bands, `BAND_STARTS`, hardness, `MATERIAL_EVERY` and depth materials, `layerOf`; keep the `LayerId`, `MaterialId` and `Materials` types and anything the fresh mine reads);
  - `src/mountain.ts` (`remaining`, `minedOut`, `MOUNTAIN_STONES` and `digStones` go; `rockDugInAll` as Global Constraints says);
  - `src/save-format.ts` (`run.dug` is retired, the reader ignores it and the writer stops writing it), `src/save-ledger.test.ts` and `src/save-format.test.ts`;
  - `src/save-merge.ts` and the "ahead" readers;
  - `src/server-read.ts` and `src/save-adopt.ts` (the dead tapped-stones hold);
  - `src/upgrades.ts`, `src/rates.ts`, `src/engineers.ts`, `src/stock.ts`, `src/factory.ts`, `src/workshop.ts`, `src/session.ts` (the depth gates become "closed until part 3"), `src/economy/actions.ts`, `src/screen-words.ts`, `src/ledger-rows.ts` and `src/how-it-works.ts`;
  - `src/lab/*` (`scope`, `work-orders`, `reveal`, `decide`, `measure`, `score`, `targets`);
  - their tests.

- [ ] **Step 1:** Write the save tests first. A save with `run.dug: 0` reads back to a mountain that has no `remaining`. A save with `run.dug` over its old cap is still `newer`. A written save has no `run.dug`. Run them and see them fail.
- [ ] **Step 2:** Make them pass. Then delete `scale.ts` and the depth parts of `layers.ts`, and fix every reader as the Files list says. Run `npm run typecheck && npm run typecheck:tools && npm run knip` until clean.
- [ ] **Step 3:** Run `npx vitest run`. Fix each failure: a test of depth goes with depth, and a test of a kept rule drops its depth fixture. Never change an expected number in a kept fresh-mine test.
- [ ] **Step 4:** Run `npm run lab:ledger` and `git diff --exit-code docs/pacing-ledger.md` (see Global Constraints). Then run `npm run functions` and `npm run gate -- fast`, commit "M15-28g: Depth leaves the rules (#740)", and push.

### Task 2: The field log and the rules follow, and the docs say what is true

**Files:**

- Modify: `src/field-log.ts` and its tests, `firestore.rules`, the emulator test under `firestore` or `tests` (wherever `npm run rules` points), `.claude/rules/observable-saves.md` (the one "ahead" line), `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/design-intent.md`.

- [ ] **Step 1:** In the emulator test, write a snapshot without `mined`, `left` and `legacy`, and expect it to be accepted. Write one that still carries `left`, and expect it to be refused. Run `npm run rules` and see the first case fail.
- [ ] **Step 2:** Drop the three fields from `field-log.ts` and from `firestore.rules`, then run `npm run rules` and the field-log tests.
- [ ] **Step 3:** Update the docs. `ARCHITECTURE.md` marks `scale`, the bands, hardness, depth materials and `remaining` as gone in #740, and its save section names `run.dug` as retired. `DESIGN.md` adds its #740 line under "The deletions", and "Numbers now" loses the band rows, or marks them as history. `design-intent.md` changes only where it says depth exists today. `observable-saves.md` gets its one line.
- [ ] **Step 4:** Run `grep -rn "minedOut\|stonesLeft\|MOUNTAIN_STONES\|BAND_STARTS\|BAND_SCALE\|oneOffStretch\|remaining" src tools scripts`. Only `granite`'s own fields and history lines may remain. Then run coverage once (`npx vitest run --coverage`, both projects) and check every floor. Run `npm run gate -- fast`, then `VISUAL_ONLY='slice' npm run visual`, then `npm run play -- --save slice-start`. Commit "M15-28g: The field log and the docs drop depth (#740)", and push.
