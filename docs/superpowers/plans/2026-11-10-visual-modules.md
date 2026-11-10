# The visual check splits into per-component modules (H2, #440) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**

- The visual check's 6,884-line `scripts/visual-check.mjs` moves, unchanged, into `scripts/visual/*.mjs`: three shared modules and thirteen component modules.
- `visual-check.mjs` becomes a runner of 150 lines or under.
- No check, label, wait or measure changes.

**Architecture:**

- **Moves, not rewrites.** Every top-level statement of today's file moves verbatim into one module, together with its leading comment. A module's exports go in one trailing `export { … };` list, so no moved declaration's text changes.
- **The shared modules:**
  - `visual/registry.mjs` holds `failures`, `check`, `sections`, `only` and `section`;
  - `visual/kit.mjs` holds the server, Chrome, the sizes, `openScreen`, `press` and every helper that two or more component modules use;
  - `visual/measure.mjs` holds the board's shared measures and `drawerFacts`.
- **The component modules** register their sections when imported. They import from the shared modules, the harness, the fixtures and `src`, and never from each other.
- **The runner** imports the registry and the kit, then the component modules in queue order. It keeps the job queue, the timings, the closing and the exit, verbatim.

**Tech Stack:** Node 24 ESM (`.mjs`), puppeteer-core through `tools/browser/harness.ts`, Prettier and ESLint as in the gate.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part E, and issue #440, whose "Done when" is binding.

## Global Constraints

- **Verbatim.** Imports, export lists, each module's `/* global */` line and its file comment are the only new text, plus the three keys loop wrappers (see the ruling).
  - Each top-level statement keeps its exact text, including its leading comment.
  - No `check(` label, `section(` label, wait, threshold or selector changes.
- **`.mjs`, not `.ts`.** This is the builder's choice the spec leaves open. As `.ts`, the section callbacks (up to about 330 lines each) would fall under the function ratchet, and no ceiling may be added. `.mjs` keeps them out of it, as they are today.
- **Import order is queue order.** The runner imports the component modules in this order:
  main-screen, cards, engineers-workshop, notices-saves, plate-and-sheets, running-and-guards, board, gauge-row, bays-ready, rail, drawers, keys-taps, press-looks.
  - Every component module imports `kit.mjs`, whose top-level `await` starts the server and Chrome. That keeps evaluation, and so registration, in the runner's import order.
  - A component module that didn't import kit could evaluate early and register out of order.
- **Sizes.** `scripts/visual-check.mjs` is 150 lines or under. No `scripts/visual/*.mjs` is over 800 lines.
- **No new dependency.** knip passes: every export is imported somewhere, and nothing is left unused.
- **Browser runs.**
  - Never run two browser scripts at once.
  - Never edit `scripts/` or `src/` while one runs.
  - Every full-run comparison uses `VISUAL_JOBS=6`, with nothing else running.
- **Gate.**
  - Each task runs `npm run gate -- fast`, `npx knip`, `npm run functions` and `npm run cycles`, and checks their exit codes.
  - Commit messages are a plain sentence ending ` (#440)`.

## The module manifest

Every name below is a top-level declaration in today's `visual-check.mjs`, and each moves with its leading comment.

| Module                          | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visual/registry.mjs`           | `failures`, `check`, `sections`, `only` and its `if (only !== undefined)` warning, `section`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `visual/kit.mjs`                | `server`, `BASE`, `PHONE`, `PCS`, `SCREENS`, `isDesk`, `browser`, `desks`, `press`, `KEY`, `SHEET`, `OPEN_SHEET`, `SHEET_BACK`, `sheetSettled`, `openSheet`, `closeSheet`, `SHELF_KEY`, `openShelf`, `STANDALONE_INSETS`, `boardProbe`, `openScreen`, `coversBoard`, `noScroll`, `MINE_WINDOW_RULES`, `SHOTS` with its `if (SHOTS)` mkdir, `shot`, `keyState`, `keyOpen`, `baysDrawn`, `railFoot`, `storedMountain`, `holdThrough`, `framesPainted`, `framesSpanning`, `noteAway`, `buysOpen`, `LAMP_X`, `keysDrawn`, `odometer` |
| `visual/measure.mjs`            | `DRAWER_UI`, `drawerFacts`, `BOARD_TARGETS`, `NEIGHBOURS`, `BAY_LEGENDS`, `BOARD_LEGENDS`, `BOARD_PARTS`, `BOARD_ART`, `boardTargets`, `veinOnWindow`, `boardGaps`, `boardTextSizes`, `boardArtAt2x`, `boardContrast`, `boardFontsLoaded`                                                                                                                                                                                                                                                                                        |
| `visual/main-screen.mjs`        | `engineersSheetFits`, `veinInView`, sections 1–3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `visual/cards.mjs`              | `foundSheetsFit`, sections 4–10 and 13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `visual/engineers-workshop.mjs` | sections 11 and 12, `WORKSHOP_SIZES`, sections 14 and 15                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `visual/notices-saves.mjs`      | `NOTICE_SIZES`, `fitOf`, sections 16–18                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `visual/plate-and-sheets.mjs`   | `SHELF_VIEWS`, `PHONE_SHOTS`, `shelfCentre`, `scrollSheet`, `sheetEdges`, `SHEET_SHOTS`, `PILL_VIEWS`, `pillClear`, `crewRowsBalanced`, sections 19–22                                                                                                                                                                                                                                                                                                                                                                           |
| `visual/running-and-guards.mjs` | `EFFECT_VIEWS`, section 23, `GUARD_SIZES`, `GUARD_SCREENS`, section 24                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `visual/board.mjs`              | `BOARD_SAVES`, `LEGENDS_AT_REST`, `DRAWER_MS`, `notePainted`, `putNoteAway`, the `board …` sections                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `visual/gauge-row.mjs`          | `GAUGE_SAVES`, `VEIN_CORNERS`, `placeVein`, `targetsWithVein`, `crewPlateWords`, the `gauge row …` sections                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `visual/bays-ready.mjs`         | `BAYS_UI`, `EARLY_TIERS`, `MACHINE_TIERS`, `BAY_SAVES`, `BAYS_AND_READY`, `LAMP_RED_X`, `baysLayout`, `textOf`, the `bays and ready …` sections                                                                                                                                                                                                                                                                                                                                                                                  |
| `visual/rail.mjs`               | `KEY_IDS`, `KEY_RULES`, `SAVE_RULES`, `CAP_X`, `RAIL_SAVES`, `railFacts`, the `keys and drawers … rail` section                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `visual/drawers.mjs`            | `DRAWER_SAVES`, `LONG_BUYS`, `FULL_UPGRADES_ROWS`, `ROW_LEGENDS`, `howFacts`, the `keys and drawers … <save>` and `… states` sections                                                                                                                                                                                                                                                                                                                                                                                            |
| `visual/keys-taps.mjs`          | `PAST_SETTLE_MS`, `tapBoard`, `listBoxes`, the `keys and drawers … taps` section                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `visual/press-looks.mjs`        | `PRESS_SIZES`, `KEY_CAP`, `DIG_SPRITE`, `GUARD`, `BACK_PLATE`, `BACK_SKIN`, `BUYS_ROW`, `frameOf`, `hasClass`, `afterLift`, the `press looks …` sections                                                                                                                                                                                                                                                                                                                                                                         |

The rule behind the table:

- a helper that one component module uses lives in that module;
- a helper that two or more use lives in `kit`, or in `measure` if it is one of the board's measures.

The controller worked it out from every statement's references, following them through helpers. If the implementer's reference analysis disagrees with a row, the rule wins: move the name to the module the rule gives, and record it in the report.

## Rulings

- **The registry.** Issue #440 says the runner "owns `section`, the failures and the queue". The component modules must import `section` and `check`, and the runner imports the component modules. Keeping those in the runner would make an import cycle, so they live in `visual/registry.mjs`. The runner keeps the queue, the timings and the exit. If this is wrong, it costs one file's rename.
- **The keys loop splits in three.**
  - Today one `for (const viewport of SCREENS) {` loop, 899 lines long, registers rail, then one section per drawer save, then states, then taps, for each size.
  - It becomes three loops with the same header: rail in `rail.mjs`, the per-save and states sections in `drawers.mjs`, and taps in `keys-taps.mjs`.
  - Each inner `section(…)` statement is byte-identical, at the same indentation.
  - The queue order changes from rail, saves, states, taps for each size to all rails, all drawers, then all taps.
  - Evidence that the new order holds under load is in Task 1. If it fails there, keep today's order: each of the three modules exports `registerRail(viewport)`, `registerDrawers(viewport)` and `registerTaps(viewport)`, and the runner keeps one loop that calls them.
- **Other order changes.**
  - Sections 11 and 12 now run after section 13, because the Engineers and Workshop sections share a module, which B6 replaces.
  - Neither the label set nor any check changes.

## Review Focus

1. **Text that changed in a move.** A section body that differs from today's by one character is a silent check change. The move-check (Task 2, Step 3) must list nothing but the allowed residue.
2. **Evaluation order.** A component module that skips the kit import, or a runner import that is out of order, changes when sections register. Compare the order of `VISUAL_TIMINGS` labels in a single-job run with the manifest's order.
3. **Shared mutable state.** `failures`, `sections`, `desks` and `browser` must be the same object everywhere. A copied `const` in a second module would split them. Each is declared once.
4. **Browser globals.** Each module's `/* global */` line must list what its page callbacks use, such as `document` and `getComputedStyle`. Lint's `no-undef` catches one that is missing.
5. **The `SHOTS` mkdir and other top-level side effects** run once, in `kit`, at import.

---

### Task 1: Baselines and the order test (controller, before any change)

- [ ] **Step 1:** On main (dbe99e0), run with `VISUAL_JOBS=6`:
  ```bash
  VISUAL_ONLY='keys and drawers .* taps|press looks' node scripts/visual-check.mjs
  ```
  Run it three times. This puts the six heaviest tap sections together, as the split order does. All three runs must be green for the split-loop ruling to stand.
- [ ] **Step 2:** Run three full `VISUAL_JOBS=6 VISUAL_TIMINGS=1 node scripts/visual-check.mjs` runs. Store each log and its wall time under the scratchpad `h2-baseline/`.
- [ ] **Step 3:** From those logs, derive:
  - the `VISUAL_TIMINGS` label set;
  - the ok-label set, with `sed 's/[0-9]//g; s/(-ms)/(ms)/' | sort -u`;
  - the median wall time.

### Task 2: The modules and the runner

**Files:**

- Create: `scripts/visual/{registry,kit,measure,main-screen,cards,engineers-workshop,notices-saves,plate-and-sheets,running-and-guards,board,gauge-row,bays-ready,rail,drawers,keys-taps,press-looks}.mjs`
- Modify: `scripts/visual-check.mjs`, which becomes the runner

**Interfaces:**

- Each component module has no exports. Importing it registers its sections.
- `registry.mjs` exports `failures`, `check`, `section`, `sections` and `only`.
- `kit.mjs` and `measure.mjs` export exactly the names other modules import.
- The runner:
  - imports `{ failures, only, sections }` from the registry and `{ browser, server }` from the kit;
  - imports the thirteen component modules in the order in Global Constraints;
  - then keeps today's lines 6835–6884 verbatim: the empty-match exit, `jobs`, `timings`, the queue, `VISUAL_TIMINGS`, closing, and the exit;
  - keeps the file comment, saying that the sections live in `scripts/visual/`.

- [ ] **Step 1: A generator, kept in the scratchpad and not committed.**
  - It reads today's file and splits it by top-level statement, each with its leading comment. Get the ranges from TypeScript's parser: from inside the repo, `createRequire(<repo>/package.json)("typescript")`, with `getFullStart` taken for the leading comments.
  - It writes each statement to its module, as the manifest says.
  - It works out each module's imports from the identifiers each module references against the names each module declares, and writes the trailing `export { … };` lists.
  - It writes each module's `/* global */` line: today's names that the module's text uses.
  - It splits the keys loop into its three wrappers.
  - Then run `npx prettier --write scripts/visual scripts/visual-check.mjs`.
- [ ] **Step 2:** Run `npx eslint scripts/visual scripts/visual-check.mjs`, `npx knip`, `wc -l scripts/visual-check.mjs scripts/visual/*.mjs` (runner ≤ 150, each module ≤ 800) and `npm run gate -- fast`. Every exit code must be 0.
- [ ] **Step 3: The move-check, in the scratchpad.**
  - Sort the lines of today's file, and separately the concatenated lines of the runner and every module. Compare the two multisets in both directions.
  - The old-only lines may be only today's import lines and the `/* global */` header line.
  - The new-only lines may be only:
    - import lines;
    - `export { … }` lists;
    - `/* global */` lines;
    - file comments;
    - the two extra `for (const viewport of SCREENS) {` lines and their closing braces.
  - Any other line on either side fails. Write the residue to the report.
- [ ] **Step 4:** Run three full `VISUAL_JOBS=6 VISUAL_TIMINGS=1 node scripts/visual-check.mjs` runs, then compare each with Task 1:
  - the label set must be equal;
  - the ok-label set must be equal;
  - every run must be green;
  - the median wall time must be within ±10%. If the baseline's own spread is over 10%, report it rather than rerunning until it fits.
- [ ] **Step 5:** Run one `VISUAL_ONLY` spot check, `VISUAL_ONLY='^(section 1 |section 23|board |keys and drawers)' node scripts/visual-check.mjs`. Its "The N section(s) … matched" count must equal the number of baseline timing labels that the same regex matches.
- [ ] **Step 6: Commit** "The visual check's sections move, unchanged, into per-component modules, and visual-check.mjs is their runner (#440)".

### Task 3: Docs and proof (controller)

- [ ] Add a line to the browser-harness bullet in `docs/ARCHITECTURE.md`: the visual check is a runner over `scripts/visual/`, with the three shared modules and one module per board part or card. Check the README and the `.claude/skills` for any section line numbers or file paths that this move makes stale, and fix them.
- [ ] Run the full gate, then the final review and the PR, through ship-sitting. The PR shows:
  - the move-check residue;
  - the label set and the ok-label set compared with the baseline;
  - the wall-time medians;
  - the `wc -l` table.
