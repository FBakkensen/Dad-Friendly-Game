# Today's pace tools, seed saves and old-board mockups are deleted (#738) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tools that still measure today's mountain (the pacing sim, the price pins, the line's staffing sim), today's mountain's seed saves, the UI audit's selectors for the old board, and the old board's mockups with their check are deleted. The game, its saves and the strategy lab's numbers do not move.

**Architecture:** The third of five deletion slivers under #665 (#729 and #737 done; then #739, #740). Nothing here is played: `src/pacing.ts` is read only by its own tests and one lab test, today's seed saves are read by no kept browser script or journey (every one plays a `slice*` save), and the mockups are a separate preview page with their own gate step. Deleting them takes no new module. What a kept test still needs moves into that test.

**Tech Stack:** TypeScript, Vitest (`unit` and `sim` projects), puppeteer-core scripts, knip.

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "What goes, and what stays". Issue #738, part of #665.

## Global Constraints

- **Flemming (16 Nov 2026):** "Delete everything about the old game."
- **No save reset, no player-visible change.** `SAVE_VERSION` stays. The game boots and plays as before.
- **The lab's numbers do not move.** After the build, `npm run lab:ledger` then `git diff --exit-code docs/pacing-ledger.md`.
- Out of scope: the `fresh.off` and `line.off` switches and the old rules in `src` (#739); depth, `remaining` and `scale.ts`'s depth parts (#740). Old-game code that a deletion leaves used only by its own tests stays for #739, unless knip names it.
- Kept: `seedJson`, `newerSave`, `asGuest`, `DEV_UID`, `DEV_BACKUP_KEY`, every `slice*` save; `mockups/city`, `mockups/line`, `mockups/refinery` (slice 1's art sources).
- A PNG under `src/assets` goes only when no kept file names its basename (code, template strings, CSS, scripts, `docs/ART.md` beyond its own row). When a PNG goes, its `docs/ART.md` row goes.
- Never skip a test. Never lower a coverage floor (only a deleted file's floor line goes). No function over 150 lines or cognitive complexity 15. No new player copy. Never "face", "hands" or "by hand" in new words.
- Ladder (`dad-friendly-work.md`): the touched tests, `npx vitest run --project sim`, coverage once, `npm run typecheck`, `npm run knip`, `npm run functions`, `npm run gate -- fast`, the visual section for a changed fixture, `npm run play` on `start`. Commit and push each task on `claude/project-thread-tj0lg3`.

## Review Focus

1. No kept browser check lost a save: `scripts/play.mjs`, `scripts/visual/*.mjs`, `scripts/ui-audit.mjs` and `tools/journeys/*` import only kept exports from `tools/browser/fixtures.ts`.
2. `fixtures.test.ts` reads every `slice*` save back as the game plays it (`PLAY_FACTORS`), so a slice save the game cannot read fails a unit test, not a browser run.
3. `src/lab/score.test.ts` scores on the same schedule as before (two ten-minute sittings, twelve hours apart), now a constant in the test.
4. The ledger check is clean: the lab never read anything deleted.
5. Each deleted PNG is named by no kept file. The token test still pins the control board palette, now as a table in the test.
6. The full gate no longer has a `mockups` step; the heavy lane is `visual`, `journeys`, `lab`.

---

### Task 1: Today's pace tools and seed saves are deleted

**Files:**

- Delete: `src/pacing.ts`, `src/pacing.test.ts`, `src/pacing.sim.test.ts`, `src/tuning.test.ts`, `src/line-staffing.sim.test.ts`, and `src/pacing.ts`'s coverage floor in `vite.config.ts`.
- Modify: `src/lab/score.test.ts` (its `DAD_SCHEDULE` becomes a local `ValueContext` of the same values); `tools/browser/fixtures.ts` (only `SAVE_KEY`, `SeedSave`, `seedJson`, `newerSave`, `DEV_UID`, `DEV_BACKUP_KEY`, `asGuest` and the `slice*` saves stay; `SeedSave` becomes the one stored-as-is type); `tools/browser/fixtures.test.ts` (keeps the save key, `seedJson`/`newerSave`, the dev backup key, every slice save read under `PLAY_FACTORS`, and `asGuest`); `scripts/ui-audit.mjs` (selectors no kept `src` file renders: the Buys tier and recipe keys, `.sheet`, `.workshop-*`, `.layer-dig`, `.craft-*`, `.engineer-*`, `.expedition-chip`, `.welcome-*`, `.layer-arrival`, and the empty chip and timer groups); comments that name a deleted file (`tiers.ts`, `rates.ts`, `crew.ts`, `engineers.ts`, `lab/world.ts`, tests that pointed at `tuning.test.ts`); `freeHelpers` in `economy/actions.ts` stops being exported if knip names it.

- [ ] Delete and port. Run the touched tests, `npm run typecheck`, `npm run knip`.
- [ ] Commit "Today's pace tools and seed saves are deleted (#738)".

### Task 2: The old board's mockups and their check are deleted

**Files:**

- Delete: `mockups/control-board/`, `mockups/directions.*`, `mockups/token-screens.*`, `mockups/components.*`, `mockups/teach.*`, `mockups/page.ts`, `mockups/page.test.ts`, `mockups/control-board.test.ts`, `mockups/preview.html`, `mockups/mock.css`, `mockups/tokens.css`, `mockups/shots/` (ignored output), `scripts/mockup-check.mjs`; the `mockups` step in `src/gate.ts` and `src/gate.test.ts`; `npm run mockups`; the `mockups/preview.html` knip entry, the `mockups` tsconfig include, and the ignore lines for the deleted folders; `newWindow` in `tools/browser/harness.ts` (only the mockup check used it); exports knip names unused once the mockups go; each `src/assets` PNG no kept file names, with its `docs/ART.md` row.
- Modify: `src/token-check.test.ts` (the two cases that read the deleted mock files pin the values they compared); `tools/review/prompt.ts` and its test (no `mockup-check` or `pacing` in the path lists); docs: `docs/DESIGN.md` (a "#738" deletions note; the pacing entries say the sim is gone), `docs/ARCHITECTURE.md` (the harness, fixtures and the pacing sim), `docs/ART.md`.

- [ ] Delete and port. Run the touched tests, `npx vitest run --project sim`, coverage once, `npm run typecheck`, `npm run knip`, `npm run functions`, `npm run gate -- fast`.
- [ ] `npm run lab:ledger`, then `git diff --exit-code docs/pacing-ledger.md`.
- [ ] `npm run play -- start`: no page error in `log.txt`.
- [ ] Commit "The old board's mockups and their check are deleted (#738)".
