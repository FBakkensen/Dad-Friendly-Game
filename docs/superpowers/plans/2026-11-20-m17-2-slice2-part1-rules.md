# M17-2 (#766): Slice 2 Part 1 Rules & v11 Save Shape (Off in Play)

Spec: `docs/superpowers/specs/2026-11-19-slice-2-design.md` (Part 1, sliver 1).
Issue: `#766` (parent `#763`).
Player sees: nothing yet (gated off in play behind `SLICE_2_PART_1_OFF` / `slice2Part1On()` in `src/part-switch.ts`; `SAVE_VERSION` stays `10` until `#769`).

## Module Map

- `src/part-switch.ts` — Add `SLICE_2_PART_1_OFF = "slice2Part1.off"` and `slice2Part1On()` (off in `PLAY_FACTORS`).
- `src/mine-levels.ts` — Generalize `granite: Granite` to `mineLevels: MineLevels` (`DEEPER_LEVEL_IDS`, `SunkLevel`, `MineLevels`, `NO_MINE_LEVELS`, `Pithead`, `EMPTY_PITHEAD`, `openLevel`, `levelSunk`, `withLevelMachine`, `withLevelPiles`). Keep `openGranite`, `graniteOpen`, `openLevels`, `levelMachines`, `withGraniteMachine`, `sinkShaft`.
- `src/makers.ts` — Add `MAKER_INPUT_IDS`, `MakerInputId`, `MakerBuffers`, `EMPTY_MAKER_BUFFERS`, `MAX_CYCLE_MICROS = 999_999`, `CycleMicros`, `EMPTY_CYCLE_MICROS`, `BASE_INPUT_BUF = 300`, `makerInputRoom`, `makerBuffer`, `makerPrimaryInput`, and whole-cycle `stepMakerCycle` / `stepMakers`.
- `src/building-site.ts` — Add `SITE_GOOD_CAP = 500`, `siteGoodRoom`, generic integer water-filling `shareOutKeys` (extending `shareOut`), proportional integer allocator `shareProportional`, and per-good City delivery+build `applyCityWork` guaranteeing `0 <= onSite[g] <= SITE_GOOD_CAP`.
- `src/cage-trips.ts`, `src/mine-cages.ts`, `src/mine-piles.ts` — Add `MIN_PITHEAD_ROOM = 300` and `pitheadRoom(mountain)` (`cagePileRoom`); in Slice 2 mode cages unload strictly into `pithead[level]` with zero Stone/maker bypass (`ShaftScene.stone === undefined`), and underground chains feed `pithead[level]` directly.
- `src/transport.ts` — Add `CITY_RUN_GOODS`, `RUN_ORDER`, `RunId`, `AssignedRuns`, `NO_ASSIGNED_RUNS`, `openRunStates`, `allocateRunRates` (even-share water-filling + shared dry-source contention), `stepTransportRuns` (live 1 s discrete transfer with water-filling and `shareProportional` source contention), and `movePitheadRuns`.
- `src/slice2-flow.ts` (new pure module imported only by `src/mountain.ts`, mirroring `src/mine-cages.ts`) — Coupled-stretch live 4-phase stepping (`accrueSlice2Live`) and event-driven offline/lab stepping (`accrueSlice2Away`, `stretchSlice2`) using `coupledRates` and 1 s stretch floor.
- `src/mountain.ts` — Add `mineLevels`, `pithead`, `makerBuffers`, `cycleMicros`, `assignedRuns` to `Mountain` / `BARE_MOUNTAIN`; dispatch `accrue` and `accrueAway` to `src/slice2-flow.ts` when `slice2Part1On()` is true.
- `src/save-format.ts` & `src/save-ledger.test.ts` — Add `mineLevels`, `pithead`, `makerBuffers`, `cycleMicros`, `assignedRuns` (validated `sum <= fleetSize`), and per-good `SITE_GOOD_CAP` check in `fitsStep`. Keep legacy `granite` readable in v10 (`readGame` accepts `granite` or `mineLevels`, never both) so live v10 saves load seamlessly until `#769` resets to v11.

## Rulings

1. **Additive v10 save compatibility in `#766`:** `SAVE_VERSION` stays `10` until `#769` switches Part 1 on and resets saves to v11. `writeGame` writes `mineLevels` (omitted when empty) and new v11 keys (omitted when zero/empty), while `readGame` continues reading legacy `granite` into `mineLevels.granite` (rejecting saves containing both `granite` and `mineLevels` as `"bad"`). `shippedFacts()` keeps all v10 facts and adds the new keys/caps.
2. **Per-good `SITE_GOOD_CAP = 500`:** Starting value matching `SITE_HOLDS = 500` so every v10 save passes and Part 1's lab (`#767`) can tune it before v11 ships.
3. **`src/slice2-flow.ts` leaf helper for `src/mountain.ts`:** Keeps `src/mountain.ts` concise and every function within the 150-line / 15-complexity gate limits without circular imports.

## Tasks & Verification Ladder

1. **Task 1:** Part switch + generalize `mineLevels` across `src/` and tests (`npx vitest run src/mine-levels.test.ts`).
2. **Task 2:** `makers.ts` buffers/`cycleMicros` + `building-site.ts` `SITE_GOOD_CAP`/`shareOutKeys`/`shareProportional`/`applyCityWork` (`npx vitest run src/makers.test.ts src/building-site.test.ts`).
3. **Task 3:** Pithead buffers & zero Stone bypass in `cage-trips.ts`, `mine-cages.ts`, `mine-piles.ts` (`npx vitest run src/cage-trips.test.ts src/mine-cages.test.ts src/mine-piles.test.ts`).
4. **Task 4:** Physical single-good transport runs, water-filling, `shareProportional` source contention in `transport.ts` (`npx vitest run src/transport.test.ts`).
5. **Task 5:** Coupled-stretch live & event-driven offline simulation in `slice2-flow.ts` & `mountain.ts`, 8h `<= 1%` agreement tests, and Slice 2 property invariants (`npx vitest run src/mountain.test.ts src/slice2-flow.sim.test.ts src/economy/invariants.test.ts`).
6. **Task 6:** v11 save format, reserved `assignedRuns`, ledger tests, Firestore rules emulator (`npx vitest run src/save-format.test.ts src/save-ledger.test.ts && npm run test:rules`).
7. **Task 7:** `npm run gate -- fast`, fresh subagent code review against `.github/review/` lenses, push & PR (`Fixes #766`), `npm run gate -- full`, handle `claude-review` & `merge-check`, `npm run gate -- signoff`, squash-merge, triage `#767` & `#768`.
