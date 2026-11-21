# M17-4: Global Transport Sheet & Updated Frame / City Screens, Off in Play (#768)

**Goal:** Deliver the Slice 2 Part 1 UI gated behind `slice2Part1On()` (off in live play until `#769`, previewable in dev via `?slice2Part1=1`) with phone screenshots (`424×924` and `424×830`) ready for Flemming's copy and layout approval.

## Scope & Files

1. **Dev-only preview hook (`src/boot.ts`, `src/boot.test.ts`):**
   - Support `?slice2Part1=1` in dev mode (`{ ...PLAY_FACTORS, [SLICE_2_PART_1_OFF]: 0 }`), matching `#681`'s `?part3=1` pattern while keeping `PLAY_FACTORS` unchanged in production.
2. **Transport view & sheet (`src/transport-view.ts`, `src/transport-sheet.ts`, `src/transport-view.test.ts`, `src/transport-sheet.test.ts`, `src/frame.css`):**
   - Pure `transportChip(mountain)` for the global top controls button: `driven/owned`, `rate/s`, and status lamp (`amber` when unstaffed vehicles exist, `green` when a vehicle is affordable, else `dark`).
   - Pure `transportSheetView(mountain, amount)` with driver stepper (`jobRow(mountain, "driving")`), fleet summary, vehicle buy keys (`vehicleKeys` + `vehicleHint`), Part 1 even-share rule line, and open physical runs list (`RUN_ORDER` filtered to open runs, live rate via `allocateRunRates`, vehicle share, source readout, destination buffer bar `N of M`, and `no driver` / `on hold` / `dest full` / `src empty` idle markers).
   - `createTransportSheet(state)` mirroring `createWorkforceSheet`: dialog over frame above save line, drivers `−`/`+`, amount key, vehicle buy keys, scrollable runs list inside the sheet, and `Close` button.
3. **Frame, Next & Workforce updates (`src/frame-state.ts`, `src/frame-view.ts`, `src/frame-screen.ts`, `src/frame.css`, `src/next-view.ts`):**
   - Add `openTransport` to `FrameState`, mount `transportSheet` on `FrameScreen`.
   - Under `slice2Part1On()` (`.frame.slice2-part1`): split top chrome into compact Stockpile strip (`Stone`, `Brick`, `Cut stone`) + Global controls strip (`Workforce`, `+Worker`, `Transport` sibling button) while preserving `.frame-scene` height (`>= 604px`) so 2-level Mine fits with zero overlap and zero scroll at `424×924` and `424×830`.
   - Update `src/next-view.ts`: add `transportCount(mountain)`, move affordable vehicle count from `city` to `"transport"` under `slice2Part1On()`, hide `factory` tab under `slice2Part1On()` until Part 2, and route Next taps to `openTransport()` when Transport is the target.
4. **City screen updates (`src/city-site.ts`, `src/city-view.ts`):**
   - Under `slice2Part1On()`: hide in-City `.city-plate` (moved to global Transport), compute `orderKey` and `cityScene` using `slice2OrderRates`, and show per-good `SITE_GOOD_CAP` on-site buffers on project bars instead of the legacy shared `SITE_HOLDS` total.
5. **Hoist pithead-full stall visibility (`src/mine-piles.ts`, `src/mine-view.ts`, `src/mine-level-view.ts`, `src/mine-row.ts`, `src/mine.css`):**
   - Under `slice2Part1On()`: `mineLevelFlows` reads `undergroundPitheadChains` (showing `0/s` when a pithead is full and undrained), and Hoisting's row displays pithead buffer fill & full-pithead stall label naming the exact stalled level.
6. **Shift report truth (`src/shift-report-view.ts`):**
   - Report `fullAtMs` marks for all open stockpile goods (including `cutStone` when saws are open).
7. **Verification & Flemming Stop:**
   - Unit tests for `transport-view`, `transport-sheet`, `next-view`, `city-view`, `mine-view`, `shift-report-view`, `frame-screen`, `boot`.
   - Visual checks (`scripts/visual/frame.mjs`) at `424×924` and `424×830` with `?slice2Part1=1` (zero page scroll, `>= 48px` targets, `>= 8px` gaps) + `npm run play` real-browser phone screenshots shown to Flemming for copy and layout approval before merge.
