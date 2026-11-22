# M17-6: Crystal Caves Level & 3-Level Hoisting, Off in Play (#770)

**No save reset** (stays version 11; additive optional keys only).
**Player sees:** nothing yet (off in play behind `slice2Part2`).

## Scope

1. **Part 2 feature switch (`src/part-switch.ts`):**
   - Add `SLICE_2_PART_2_OFF = "slice2Part2.off"` and `slice2Part2On()` (`slice2Part1On() && factor(SLICE_2_PART_2_OFF) === 0`), kept off in `PLAY_FACTORS` / `LAB_FACTORS`.
2. **3-level mine state & Crystal Caves sink (`src/mine-levels.ts`, `src/workforce.ts`, `src/economy/actions.ts`):**
   - Extend `MINE_LEVEL_IDS` to `["topsoil", "granite", "crystal"]` and `DEEPER_LEVEL_IDS` to `["granite", "crystal"]`.
   - Add `openDeeperLevel`, `openCrystal`, `crystalOpen`, `crystalShaftPrice` (Brick + Cut stone scaled by `price.crystalShaft`), `crystalShaftOpen` (behind `slice2Part2On()` + Foundry's roof + Granite sunk), and `sinkShaft(mountain, level?)`.
   - Add `"crystalDrilling"` and `"crystalHaulage"` to `JOB_IDS` / `NO_JOBS` / `LEVEL_JOBS`, gated by `crystalOpen`, and generalize `haulageWorkers` and `lineWork` to all open levels.
   - Generalize `levelActions` / `hoistActions` / `levelApplied` in `src/economy/actions.ts` to support `sinkShaft` and machine buys for any open deeper level (off while `slice2Part2` is off).
3. **3-level hoisting & 30 s trips (`src/cages.ts`, `src/cage-trips.ts`, `src/mine-cages.ts`, `src/mine-piles.ts`, `src/slice2-flow.ts`, `src/transport.ts`):**
   - Add `crystal: 30` to `TRIP_BASE`, generalize `shaftCages`, `cageService`, `shortestRound`, `cageRates`, `cageAt`, `carriedBy`, `unassignedHoists`, and `assignHoists` to open lists of levels.
   - Replace `otherLevel` (`src/cage-trips.ts`) with cyclic open-list turn-taking over `MINE_LEVEL_IDS`, and replace `levelPair` (`src/mine-piles.ts`) with open-list branch mapping over `openLevels(mountain)`.
   - Generalize `pithead` and `pitToStockyardStones` (`src/slice2-flow.ts`, `src/transport.ts`) across all open levels.
4. **Save round-trip (v11, no reset) & off-in-play UI/Lab safety (`src/save-format.ts`, `src/mine-view.ts`, `src/mine-level-view.ts`, `src/mine-levels-site.ts`, `src/machine-card.ts`, `src/workforce-view.ts`, `src/lab/*`):**
   - Validate unsunk deeper levels across `mineLevelsFit`, `readPithead`, and `cagesFit` in `src/save-format.ts` with zero version bump and full round-trip tests.
   - Keep Crystal Caves hidden in UI and unvisited in Part 1 lab runs while `slice2Part2` is off (`docs/pacing-ledger.md` byte-for-byte unchanged).
