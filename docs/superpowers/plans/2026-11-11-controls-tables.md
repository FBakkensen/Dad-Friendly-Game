# The controls and drawers checks become tables, with no fixed sleeps (H3a, #441) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**

- The rail, the drawers per save and the bays per save become tables of scenario × screen size × expectation, registered by one `table()` helper.
- The drawer list is data (`DRAWERS`), so B6 (#374) adds Workshop and Engineers as two rows.
- One `controls.mjs` holds one wiring check per control family. `keys-taps.mjs` and `press-looks.mjs` fold into it, with the bays taps.
- The browser checks that unit tests already prove are deleted, each cited in the PR.
- No fixed sleep or real-time frame wait is left in rail, drawers, bays-ready, controls or gauge-row. `framesSpanning` leaves the kit.

**Architecture:**

- **`table()` lives in `visual/registry.mjs`**, beside `section`. It only turns data into `section(label, run)` and `check(ok, label)` calls, and needs nothing from Chrome. `kit.mjs` imports the registry and has a top-level `await`, so the registry never imports the kit: the page opener is passed in.
- **Labels stay byte-identical.** Every kept `check(` label and every kept `section(` label is unchanged. The only new section labels are the bays' `mined out`, `loading` and `reduced motion` scenarios, which leave the `taps` section (`^bays and ready` still matches them).
- **Waits are state or events.** A replaced wait is the held tap clock, a `waitForFunction` on DOM or stored state, a page event (a capture listener), or a frame count through `framesPainted`. Never `setTimeout`.

**Tech Stack:** Node 24 ESM (`.mjs`), puppeteer-core through `tools/browser/harness.ts`, Vitest for the `table()` unit test.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part E, and issue #441, whose "Done when" is binding. The fact map behind this plan is summarised in the Rulings below; line numbers are against `9b3affe`.

## Global Constraints

- **Labels.** No kept `check(` or `section(` label text changes. Before Task 1, record the baseline: `VISUAL_ONLY='^(keys and drawers|bays and ready|press looks|gauge row)' VISUAL_TIMINGS=1 npm run visual`, and save the section list and the `ok` label set (digits stripped) to the scratchpad. Each task compares against it. The only differences allowed are the deleted labels (Task 5) and the three new bays section labels (Task 4).
- **Queue order** follows the runner's imports. `controls.mjs` replaces `keys-taps.mjs` and `press-looks.mjs` at the end of the import list. The bays taps now register after the drawers instead of after each screen's bays saves. That is a ruling.
- **Sizes.** No `scripts/visual/*.mjs` is over 800 lines. `registry.mjs` stays under 100.
- **Browser runs.** Never run two browser scripts at once. Never edit `scripts/` or `src/` while one runs.
- **No `src` change.** Every replacement uses what the page already exposes.
- **Gate.** Each task climbs the ladder in `.claude/rules/dad-friendly-work.md`: the test file, `npm run gate -- fast`, then the task's `VISUAL_ONLY` sections. `npx knip` passes at every commit. Commit messages are a plain sentence ending ` (#441)`.

## Tasks

### Task 1: `table()` in the registry

**Files:** modify `scripts/visual/registry.mjs`; create `scripts/visual/registry.test.mjs`.

- [ ] Write the failing tests first. With `section` and `check` captured (export a `sections` reset or read `sections` after the call):
  - `per: "scenario"` registers one section per screen × scenario, labelled by `section(viewport, scenario)`, in screen-major order;
  - `per: "screen"` registers one section per screen that runs every scenario in order;
  - each expectation's `run(at)` returns `[[ok, tail], …]`, recorded as `check(ok, \`${prefix} ${tail}\`)`;
  - a row or expectation with `when` returning false is skipped;
  - `rows` defaults to one empty row; each row's `enter` runs before its expectations and `leave` after;
  - the page's `close` runs even when an expectation throws;
  - `after(viewport)` runs after each screen's sections are registered, so a flow registered there keeps today's queue order.
- [ ] Implement `table({ screens, scenarios, rows, per, section, prefix, open, expect, after })` (sketch in the Rulings). Export it.
- [ ] `npx vitest run scripts/visual/registry.test.mjs`, then `npm run gate -- fast`. Commit.

### Task 2: the rail as a table

**Files:** modify `scripts/visual/rail.mjs`.

- [ ] `RAIL_SAVES` becomes scenarios with flags: `fresh` (locked), `early`, `mid` (open, lit), `heart` (open), `workshop` (bench).
- [ ] One `table({ per: "screen", … })` keeps `keys and drawers ${vp} rail` and the prefix `${size} key rail, ${name}:`. The ten expectations of `rail.mjs:134-218` become expectation entries, with `when` for the four save-only checks (fresh: locked keys; mid and heart: every key open; mid: Upgrades lit; workshop: the bench clock).
- [ ] `VISUAL_ONLY='^keys and drawers .* rail$' npm run visual`. The `ok` set equals the baseline's. Gate fast. Commit.

### Task 3: the drawers as a table, the drawer list as data

**Files:** modify `scripts/visual/drawers.mjs`.

- [ ] Export `DRAWERS`, one row per drawer, carrying its own scroll rule:
  - `buys`: may and must scroll when `LONG_BUYS` has the save;
  - `upgrades`: may scroll at `FULL_UPGRADES_ROWS` rows or more, never must.
- [ ] The hard-coded `["buys", "upgrades"]` loop (`:139`) and the name test in the scroll rule (`:169-173`) go. The row's `enter` opens the sheet and waits for its images; `leave` closes it. The eleven expectations of `:151-328` become entries, unchanged in what they measure.
- [ ] Section label `keys and drawers ${vp} ${save}` and prefix `${size} ${drawer} drawer, ${save}:` are unchanged. The `states` section stays a flow, registered through `after(viewport)` so the order holds.
- [ ] A comment on `DRAWERS` says what B6 adds: a row each for Workshop and Engineers, a `when` that skips saves where the key is locked (`openSheet` waits 30 s on a disabled key), and a `how: false` flag if a drawer has no "i".
- [ ] `VISUAL_ONLY='^keys and drawers'` (rail, saves and states). Labels as the baseline. Gate fast. Commit.

### Task 4: the bays as a table, with the three scenarios out of the taps

**Files:** modify `scripts/visual/bays-ready.mjs`; modify `scripts/visual/kit.mjs`.

- [ ] The per-save section (`:185-308`) becomes `table()` over `BAY_SAVES`, `bays and ready ${vp} ${name}`, prefix `${size} bays and ready, ${name}:`. `fleet` carries the three-flap check; the 2x art check is PHONE only, as today.
- [ ] **mined out** (`:674-710`) and **loading** (`:712-786`) become their own sections, `bays and ready ${vp} mined out` and `bays and ready ${vp} loading`, with their check labels unchanged.
- [ ] **reduced motion** (`:609-672`) becomes `bays and ready ${vp} reduced motion`, a flow beside the table. `framesSpanning(page, 720)` becomes `framesPainted(page, 44)`: 44 frames is at least 733 ms at 60 Hz, and a loaded page only paints slower. Its control run ("without reduced motion the drill bay's icon steps") stays as it is.
- [ ] The taps section (`:310-608`) moves to `controls.mjs` in Task 5. Until then it stays here, untouched.
- [ ] `framesSpanning` leaves `kit.mjs` once press-looks no longer uses it (Task 5). knip will say so.
- [ ] `VISUAL_ONLY='^bays and ready'`. Check labels as the baseline. Gate fast. Commit.

### Task 5: one controls module

**Files:** create `scripts/visual/controls.mjs`; delete `scripts/visual/keys-taps.mjs` and `scripts/visual/press-looks.mjs`; modify `scripts/visual/bays-ready.mjs`, `scripts/visual/kit.mjs`, `scripts/visual-check.mjs`.

- [ ] Move the keys taps, the bays taps and the press looks into `controls.mjs`, with their helpers (`PAST_SETTLE_MS`, `tapBoard`, `listBoxes`, `textOf`, `cartFlaps`, `KEY_CAP`, `frameOf`, `hasClass`). `LAMP_RED_X` goes; use the kit's `LAMP_X.red`. The section labels `keys and drawers ${vp} taps`, `bays and ready ${vp} taps` and `press looks ${vp}` stay.
- [ ] **Delete** these checks (each cell is the label; every size):

  | Check                                                                                               | Proven by                                                                                                                           |
  | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
  | `saving: a tap on a dear row spends nothing and its lamp reads red within 200ms`                    | `src/buys-tap.test.ts:41` "a row too dear blinks"; `src/board-interaction.test.ts:357` "blinks red, off, red, off on a refused buy" |
  | `a scrim tap closes the drawer`                                                                     | `src/board-drawer.test.ts:919` "a tap elsewhere only closes"; `src/mountain-screen-rail.test.ts:767`                                |
  | `Escape closes the drawer`                                                                          | `src/board-drawer.test.ts:554` "closes an open sheet and leaves a shut one shut"; `src/mountain-screen-rail.test.ts:599`            |
  | `Saving for reads "…", and a tap opens Buys with the pocket and odometer unchanged`                 | `src/mountain-screen.test.ts:2775` "Saving for shows the time and opens Buys"; `:2899`                                              |
  | `a hold fixes the troubled bay with Buys shut`                                                      | `src/trouble-tap.test.ts:27`; `src/board-bays.test.ts:687`; `src/mountain-screen.test.ts:1990`                                      |
  | `a held rail key's cap is on its down frame (…), not its rest (…)`                                  | `src/press-looks.test.ts:137` "shows the down cap while held"                                                                       |
  | `a held plate button shows down with its own pixels, and its released pixels return after the lift` | `src/press-looks.test.ts:181`; `src/board-skin.test.ts:57`, `:65`, `:116`                                                           |
  | `a held Ready plate shows the guard's pressed frame …`                                              | `src/press-looks.test.ts:263`; `src/board-ready.test.ts:439`                                                                        |
  | `a held dig button shows the down frame (-112px), then rest …`                                      | `src/press-looks.test.ts:405`; `src/board-ready.test.ts:679`                                                                        |
  | `a held Buys row shows is-pressed, and none after the lift`                                         | `src/press-looks.test.ts:502`                                                                                                       |

  Before deleting each, open the cited test and confirm its `it(...)` title still matches.

- [ ] **Keep one wiring check per family**, labels unchanged:
  - rail key: "a finger tap at once where Buys' Back was opens nothing; past the settle it opens the key under it";
  - drawer row buy: "early: a finger tap on the cart row after the settle buys one cart and shows Done", with "the buy moves no row in the drawer" on the same page;
  - Back, scrim and Escape: "a scrim tap on a socket closes the drawer and shows the relic's note";
  - the "i" cards: "early: the "i" shows the how cards, and their Back restores the list" (the only finger press on the "i" and on the cards' Back);
  - Ready now: "a tap on Ready now buys exactly one cart for one price …";
  - open bay: "a tap on an open bay opens Buys and spends nothing";
  - trouble fix: "five taps fix the troubled bay with Buys shut", with its red-lamp precondition and the thanks-note reach check on the same page;
  - red dig button: "the red button digs the tap's …";
  - press look: "a held rail key shows …, and is back to its rest frame … after the lift".
  - The drawer's two reduced-motion first-frame checks stay as they are.
- [ ] **Replace the waits:**
  - the rail key's `afterLift` becomes `waitForFunction` until the key loses `is-down` (2 s timeout), then the cap frame is read;
  - the tap under Back proves the tap was handled before it checks that nothing opened. A kit helper `clickHandled(page)` arms a capture `click` listener on `window` before the tap and resolves on the next frame after it; the check awaits it in place of `framesPainted(page, 2)`;
  - the red button waits for the stored pocket to change before reading it, as Ready now does.
- [ ] `framesSpanning` leaves `kit.mjs`. The runner imports `controls.mjs` where `keys-taps.mjs` and `press-looks.mjs` were.
- [ ] `VISUAL_ONLY='^((keys and drawers|bays and ready) \[[^\]]+\] taps|press looks)'`. The `ok` set is the baseline's minus the deleted labels. Gate fast. Commit.

### Task 6: the gauge's moving parts

**Files:** modify `scripts/visual/gauge-row.mjs`.

- [ ] "while the save loads the window is its frame and glass…": the 300 ms sleep becomes `framesPainted(page, 3)` after the loading line.
- [ ] "under reduced motion the window and the needle hold still": open with `stopClock: true`, so the 1 s tick cannot change the vein or the plate between shots. Before shot 1, wait for the band, the fonts, every gauge-row image decoded, every skin canvas painted and the gauge's `aria-label` starting `Output:`. The two sleeps become `framesPainted(page, 2)` and then `framesPainted(page, 36)` between the shots.
- [ ] "under reduced motion a tap shows +N without rising": the 250 ms sleep becomes `framesPainted(page, 6)`. Six frames are at least 70 ms (one rise step) at 60 Hz, and at most 0.6 s of capped frame time, under the 0.7 s hide.
- [ ] The three window taps wait for the stored pocket to change before reading it.
- [ ] `setTimeout` leaves the `/* global */` header.
- [ ] `VISUAL_ONLY='^gauge row .* moving parts$'`. Labels as the baseline. Gate fast. Commit.

### Task 7: docs and proof

**Files:** modify `docs/ARCHITECTURE.md`.

- [ ] ARCHITECTURE: the module list (controls replaces keys-taps and press-looks), `table()` in the registry, and where a new check goes: a new drawer is a `DRAWERS` row, a new control family is one wiring check in `controls.mjs`.
- [ ] The done-grep: `grep -nE "setTimeout|waitForTimeout|sleep\(|framesSpanning" scripts/visual/{rail,drawers,bays-ready,controls,gauge-row}.mjs` prints nothing.
- [ ] Load proof, nothing else running except as stated:
  - 5 green runs of `VISUAL_ONLY='^(keys and drawers|bays and ready|press looks|gauge row)'` at `VISUAL_JOBS=12`;
  - 3 green runs of the timing sections (`taps`, `press looks`, `reduced motion`, `moving parts`) at `VISUAL_JOBS=16`, with `npm run lab:generations -- --ci` running in the background.
  - Record each run's wall time and `FAIL` count for the PR.
- [ ] `npm run gate -- full` in the background. Then ship-sitting.

## Rulings

- **The "i" check stays.** The old map listed it for deletion, but it is the only finger press on the "i" and on the cards' Back, so it is that family's wiring check.
- **The dear-row 200 ms check is deleted.** Its 200 ms is wall-clock paint latency that no harness clock reaches, the #403 pattern. The row-buy wiring covers the path, and the units cover the red blink.
- **Mined out, loading and reduced motion leave the bays taps section** as their own sections. They are scenarios, not controls, and it keeps `controls.mjs` near 610 lines instead of about 785 against the 800 cap. Their check labels are unchanged.
- **The gauge per-save section and its `targetsWithVein` retry are not in H3a.** Neither #441 nor #442 names them. This plan leaves them as they are and proposes adding them to H3b (#442).
- **The drawers `states` section stays a flow.** Each visit's expectation is bespoke, so a table buys nothing.
- **`table()` sketch:**

  ```js
  const table = ({
    screens,
    scenarios,
    rows = [{}],
    per = "scenario",
    section: name,
    prefix,
    open,
    expect,
    after,
  }) => {
    for (const viewport of screens) {
      const size = `${String(viewport[0])}x${String(viewport[1])}`;
      const runOne = async (scenario) => {
        const opened = await open(viewport, scenario);
        try {
          for (const row of rows.filter(
            (r) => r.when?.(scenario, viewport) ?? true,
          )) {
            const at = {
              ...opened,
              viewport,
              size,
              scenario,
              row,
              label: prefix({ size, scenario, row }),
            };
            await row.enter?.(at);
            for (const e of expect)
              if (e.when?.(at) ?? true)
                for (const [ok, tail] of await e.run(at))
                  check(ok, `${at.label} ${tail}`);
            await row.leave?.(at);
          }
        } finally {
          await opened.close();
        }
      };
      if (per === "screen")
        section(name(viewport), async () => {
          for (const s of scenarios) await runOne(s);
        });
      else
        for (const s of scenarios) section(name(viewport, s), () => runOne(s));
      after?.(viewport);
    }
  };
  ```

## Risks

- The gauge's two-shot stillness check and the "+N" check rest on frame counts that assume Chrome paints at 60 Hz or less. Headless Chrome does; the load runs in Task 7 prove it here.
- The tap under Back is a negative check; without the click listener it could pass on a tap that never landed.
- The bays taps run later in the queue than today. The load runs and the full gate cover the change.
