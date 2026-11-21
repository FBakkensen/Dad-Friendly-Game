# M17-3: Part 1 lab & #757 economy rebalance

**Issue:** #767 (parent #763, resolves #757)
**Spec:** `docs/superpowers/specs/2026-11-19-slice-2-design.md` (Part 1 sliver 2)

## Architecture

- `PLAY_FACTORS` stays unchanged (`slice2Part1.off` absent -> 1 / off in live play); `LAB_FACTORS` adds `[SLICE_2_PART_1_OFF]: 0` (matching #675's pre-switch-on pattern).
- All `#757` economy retuning (builder rate, vehicle carries/growth, worker growth, borer/locomotive pricing, and Foundry steps if needed) is gated on `slice2Part1On()` so live play is unaffected until `#769`.
- `src/slice2-flow.ts` exposes `slice2SteadyIncome` and `slice2OrderRates` built on `allocateRunRates` so the lab's planner reads physical transport sharing across pithead -> stockyard (`pitToStockyardStones`), pithead -> makers (`pitTopsoilToKilns`, `pitGraniteToSaws`), and stockyard -> City (`stockToCity:*`).
- `src/lab/fresh-dad.ts`, `src/lab/fresh-levels.ts`, `src/lab/fresh-kit.ts`, and `src/lab/fresh-view.ts` handle the Evening 1 4-job cycle (`drilling -> haulage -> hoisting -> driving`), keep drivers staffed while pitheads run, stop bundling 50 builders onto every truck buy, and report Slice 2 `siteFull` and `idleWorkers` accurately.

## Verification

1. Sweep and tune Slice 2 Part 1 economy in `npm run lab -- --ci` until:
   - Every player type reaches the Foundry's roof in `>= 5` days (`slice-five-days` green, no guardrail edits in `src/lab/targets.ts`).
   - Borers and locomotives are bought across runs.
   - Builders, trucks, wagons, and workers balance cleanly with no single fix dominating for days.
2. Refresh `docs/pacing-ledger.md` with `npm run lab:ledger`.
3. Add unit tests for Slice 2 Part 1 lab planner & view behavior; verify `src/lab/fresh.sim.test.ts` (Part 1, Part 2, and Slice 2 Part 1) and full gate + signoff.
