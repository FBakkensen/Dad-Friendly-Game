# The lab plays the line (#534, M15-4)

**Goal:** the band-free half of #534. With the line on in a lab run (`line.off: 0`), the hands staff the machines to lift the line, the lab reads the line through four report-only measures, and `npm run lab` takes sweep factors, so the report can show `narrowRun` for today's band table and the spec's table A. The tuning is #543. Play is unchanged.

**Shared modules:** staffing stays in `src/staffing.ts` (`staffWith` gains the line's fill) and `staffCrew` in `src/rates.ts` (the one search, #500). What the lab reads off the line is `lineView` and `narrowStage` in `src/line.ts`. The sitting log (`src/lab/sittings.ts`) carries the narrow stage and the zero-gain buys; the decision sample (`src/lab/measure.ts`) carries the line view. The measures are one file each in `src/lab/measures`, their arithmetic in `src/lab/line-view.ts`. `tools/strategy-lab.ts` takes `--factors` like `tools/generations-lab.ts`.

## Rulings (agent-run sitting)

1. **Staffing follows the line by one more candidate, not a new search.** `staffCrew` weighs each staffing it already tries twice: as the hands fill it today (fastest first) and as the line fills it (`fillLine`). `fillLine` keeps the big machines and picks the one-hand machines to reach the highest level the hands allow, halving on the level, then puts spare hands on the lowest stage that still has an idle machine. It is not the exact best split; the issue allows that.
2. **Grandpa's slip is listed, not chased.** Without Grandpa, one more worker or machine never slows the line in the swept crews. With him it can slip by up to about 4%, because his tenth goes to the biggest running group, not the narrow stage. Filling the line once per tending guess cut the slips from 20 to 8 but made a lab job 2.5 times slower, with the same worst slip, so it was dropped. The engineers by stage (#539) end the slip. `docs/DESIGN.md` lists it.
3. **The sweep is a sim test.** It weighs 7,488 crews and seven more of each (about 9 seconds), so it lives in `src/line-staffing.sim.test.ts` (the full tier).
4. **Measures by sitting.** `narrowRun` is the longest run of sittings that open on one narrow stage; `narrowShare` is the largest share of sittings one stage opens as narrow (sittings, not minutes, because a sitting is what the dad sees). `handsCarry` is the median, over samples, of the share of the line the hands carry on the narrow stage. `zeroGainBuys` counts machines bought over a run that left the line where it was, weighed at the same moment before and after the second they were bought. All four are NaN with the line off, and none has a bound: bounds are Flemming's.
5. **The narrow stage on a tie** is the first in rock order (face, haul, lift).
6. **`outputShare` in the line's units.** With the line on, the machines' and hands' parts are scaled so they sum to what the line moves, so the tending and crafted deltas (already line deltas) share their units (the hand-off on #534).
7. **The band table as factors.** Table A is today's table times `layer.3.drill.hardness=1/1.1`, `layer.3.borer.hardness=1.25`, `layer.3.train.hardness=1.1`, `layer.3.cart.hardness=0.8`, `layer.4.borer.hardness=1.25`, `layer.4.hoist.hardness=0.8`. No table is hard-coded here; which band's rock applies stays one input (the mountain's band) to `effectiveRates`, as the cage will need.
8. **The report names its factors** under its title; the JSON keeps its shape.

## Tasks

1. Staffing by the line: `fillLine`, `picksFor`, `coversFor`, `spareToLowest` in `src/staffing.ts`; `staffCrew` weighs both fills; `tendedOutput` reads the line. Test: the sweep (`src/line-staffing.sim.test.ts`).
2. The readings: `lineOf`, `narrowStage`, `lineView` (`src/line.ts`); `line` on the sample, `narrow` and `zeroGainBuys` on the sitting; the four measures; `outputShare`'s units. Tests in `line.test.ts`, `lab/line-view.test.ts`, `lab/sittings.test.ts`, `lab/score.test.ts`, `lab/measures.test.ts`.
3. `--factors` in `tools/strategy-lab.ts`. Tests in `tools/strategy-lab.test.ts`.
4. Runs: the strict lab at `--ci` with the line on, under today's table and under table A; one lab job timed against `main`. The rows go in the PR body.
5. Docs: `ARCHITECTURE.md` (the lab plays the line), `DESIGN.md` (the staffing and Grandpa's slip).

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test files, `npm run gate -- fast`, then the full gate. Nothing the player sees changes.
