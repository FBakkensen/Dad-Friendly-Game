# The layout and overlay checks become tables, with no fixed sleeps (H3b, #442) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**

- The board, the gauge row per save, the no-scroll guard (s24), s19–s23, the cards (s4, s6, s7, s10, s13) and s3 become tables through H3a's `table()` helper.
- `putNoteAway` (a 1.1 s sleep, then Escape up to three times) and `targetsWithVein` (place and measure up to five times) give way to waiting on the save and placing the vein inside the measurement.
- The sleeps in s3, s9 and s24 go.

**Architecture:**

- **`table()` in `scripts/visual/registry.mjs` is reused unchanged.** Every converted section is a `table({ screens, scenarios, rows?, per, section, prefix, open, expect })` call. Expectations run in order on one page, so a later one may act on what an earlier one opened, and measurements that a later check combines are kept on the `at` object the table hands every expectation.
- **Labels stay byte-identical.** Every `section(` label and every `check(` label is unchanged. The ok-label set (digits stripped) of the converted sections equals the baseline's.
- **Waits are state or events.** A replaced wait is `keysDrawn` and `noteAway` (kit, H3a), a `waitForSelector`/`waitForFunction` on what the tap opened, `sheetSettled`, `clickHandled`, or `framesPainted`. Never `setTimeout`.
- **The vein is placed inside the measurement.** `boardTargets(page, { vein })` (measure.mjs) takes an optional spot in window px, shows the vein there and measures in the same synchronous page task, so the screen's 1 s tick cannot hide it in between. The spot comes from the game's own `veinSpot`, imported in the page as today.

**Tech Stack:** Node 24 ESM (`.mjs`), puppeteer-core through `tools/browser/harness.ts`.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part E, and issue #442, whose "Done when" is binding. H3a's plan (`2026-11-11-controls-tables.md`) set the pattern.

## Global Constraints

- **Labels.** Before Task 1, record the baseline: `VISUAL_ONLY='^(board |gauge row \[[^]]+\] (early|mid|crystal|heart)$|section (3|4|6|7|9|10|13|19|20|21|22|23|24) )' VISUAL_TIMINGS=1 npm run visual`, and save the section list and the ok-label set (digits stripped). Each task compares against it. No difference is allowed.
- **Out of scope:** s11, s12, s14, s15 (B6 replaces them), s1, s2, s5, s8, s16–s18 (not named by #442), and H3a's modules.
- **Sizes.** No `scripts/visual/*.mjs` is over 800 lines.
- **Browser runs.** Never two at once. Never edit `scripts/` or `src/` while one runs.
- **No `src` change.**
- **Gate.** Each task climbs the ladder in `.claude/rules/dad-friendly-work.md`: `npm run gate -- fast`, then the task's `VISUAL_ONLY` sections. Commit messages are a plain sentence ending ` (#442)`.

## Review Focus

- A tap that never landed: a check that now waits on what the tap opened must still fail, not hang, when it never opens (every wait has a timeout and turns into `false`).
- The save error board: `keysDrawn` must hold when the save line shows error words, not only "Signed in".
- The vein measured at its four corners must still be found by `boardTargets` when the 1 s tick lands mid-check.
- The legacy guard row (three taps): each tap waits for the next target, the last for the confirm.
- Queue order: a converted section registers where the old loop did, so `VISUAL_JOBS` parallelism is unchanged.

## Tasks

### Task 1: the board as a table, `putNoteAway` gone

**Files:** modify `scripts/visual/board.mjs`.

- [ ] `BOARD_SAVES` becomes `{ name, save, search }` scenarios. One `table({ per: "scenario" })`, section `board ${vp} ${name}`, prefix `${size} board, ${name}:`.
- [ ] `open` opens the screen, waits for `.board-relics` and the fonts, then `keysDrawn` and `noteAway` in place of `putNoteAway`. The expectations are today's checks in today's order: no page scroll (before the note is put away, as today, so it is read in `open` and returned by the first expectation), contrast, the shelf key, the Running now note, the save drawer, no scroll with the drawer open, targets, text, 2x art (PHONE only). Measurements later checks combine (`rest`, `keyTargets`, `keyText`, `keyArt`, `noteText`, `noteArt`) go on `at`.
- [ ] `setTimeout` leaves the `/* global */` header. `VISUAL_ONLY='^board '`. Labels as the baseline. Gate fast. Commit.

### Task 2: the gauge row per save, `targetsWithVein` gone

**Files:** modify `scripts/visual/measure.mjs`, `scripts/visual/gauge-row.mjs`.

- [ ] `boardTargets(page, { vein } = {})`: when `vein` is `{ left, top }` (window px, as `.golden-vein`'s style), the page sets the vein's `left`/`top` and `hidden = false` and then measures, in one `evaluate`.
- [ ] `veinSpots(page)` in gauge-row returns the four corners' spots, from the page's `veinSpot` (one `evaluate`, `MINE_WINDOW_RULES`). `placeVein` stays for the 2x art shot.
- [ ] `GAUGE_SAVES` becomes `{ name, save, band }`; one `table({ per: "scenario" })`, section `gauge row ${vp} ${name}`, prefix `${size} gauge row, ${name}:`. The moving-parts section is untouched.
- [ ] `VISUAL_ONLY='^gauge row \[[^]]+\] (early|mid|crystal|heart)$'`. Labels as the baseline. Gate fast. Commit.

### Task 3: the cards as tables, s9's sleep gone

**Files:** modify `scripts/visual/cards.mjs`.

- [ ] s4, s6, s10 and s13: `screens: [PHONE]`, scenarios `{ standalone: false }`, `{ standalone: true }`, section `section N (line L) ${standalone}`, prefix `424x924` or `424x924 standalone`.
- [ ] s7: `screens: [PHONE]`, one scenario, prefix `${size}`.
- [ ] s9 stays a flow. Its 1.5 s sleep becomes a `waitForFunction` until `.board-dig-plus` is hidden (the tap's "+N"), 2 s timeout. s5 and s8 are unchanged.
- [ ] `VISUAL_ONLY='^section (4|6|7|9|10|13) '`. Labels as the baseline. Gate fast. Commit.

### Task 4: the plate and sheets as tables

**Files:** modify `scripts/visual/plate-and-sheets.mjs`.

- [ ] s19: `per: "screen"`, scenarios `fresh` and `relics`, expectations with `when` per scenario.
- [ ] s20: `per: "screen"`, one scenario, rows `buys` and `upgrades` whose `enter` opens and `leave` closes the drawer; the closing "no scroll after the sheets" check is a last row.
- [ ] s21: `per: "screen"`, scenarios the three pockets.
- [ ] s22: one scenario, its two checks as two expectations.
- [ ] `VISUAL_ONLY='^section (19|20|21|22) '`. Labels as the baseline. Gate fast. Commit.

### Task 5: Running now and the no-scroll guard, s24's sleep gone

**Files:** modify `scripts/visual/running-and-guards.mjs`.

- [ ] s23: `per: "screen"`, scenarios the four counts.
- [ ] s24: `per: "scenario"`, each `GUARD_SCREENS` row `{ name, save, taps, shows }`. Each tap waits for its target as today; after the last tap the check waits for `shows`: the open drawer settled (`sheetSettled`) for buys, upgrades and bays; `.workshop-dialog`, `.engineers-dialog`, `.shelf-dialog`, `.game-menu`, `.legacy-dialog` shown; the save drawer open with no animation running; for Ready now, `clickHandled`. A `shows` that never comes fails the check.
- [ ] `setTimeout` leaves the header. `VISUAL_ONLY='^section (23|24) '`. Labels as the baseline. Gate fast. Commit.

### Task 6: s3, docs and proof

**Files:** modify `scripts/visual/main-screen.mjs`, `docs/ARCHITECTURE.md`.

- [ ] s3: one `table()` row on `[PHONE]`; the 1.1 s sleep becomes `keysDrawn`. Its vein checks are unchanged.
- [ ] ARCHITECTURE: which sections are tables now, and `boardTargets`' `vein`.
- [ ] Done-grep: `grep -nE "setTimeout|waitForTimeout|sleep\(|tries" scripts/visual/{board,gauge-row,cards,plate-and-sheets,running-and-guards}.mjs scripts/visual/main-screen.mjs` prints nothing for a converted section.
- [ ] Load proof: 3 green runs of the baseline filter at `VISUAL_JOBS=12`, wall time and FAIL count recorded for the PR.
- [ ] `npm run gate -- full` in the background. Then ship-sitting.

## Rulings

- **The gauge's per-save section is in.** #442 names it (added 11 Nov), and its `targetsWithVein` is the retry the issue names.
- **s5, s8 and s9 stay flows.** Each is one bespoke walk through several overlays on one save; a table buys nothing. s9 loses its sleep as #442 asks.
- **s24 is stricter.** It now waits for the screen each tap opens, so a door that never opens fails rather than passing on a still page.
- **Placing the vein inside the measurement** replaces the retry rather than stopping the clock: the 1 s tick is a `setInterval`, which a stopped `Date.now` does not stop.
