# The lab plays parts 1 and 2 (#667)

Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "Lab", "Starting numbers", rules 3, 4 and 6. Off in play: only a lab run with `fresh.off=0,part2.off=0` reaches part 2. Parent #530; after the rules (#666, PR #717). Agent-run sitting: the calls below are the thread's rulings, recorded on the issue and in the PR body.

**Goal:** the strategy lab plays a fresh mine to the Warehouse's roof, sets part 2's numbers, and reports `nightFull` and `deadGood`.

## Global constraints

- No bound in `src/lab/targets.ts` changes (a stop). Only planner guards are added there.
- The five-day floor is not checked on part 2 (Flemming, 15 Nov 2026).
- Nothing on his phone changes, except a part 1 number the lab moves (it is said in the PR body).
- Engineering words only; no new player-facing copy.

## The modules

| What | Module |
| --- | --- |
| "Buy a kiln" and "Expand the stockyard" as moves: listed while open, applied, logged | `src/economy/actions.ts` (the catalogue every planner and the Ledger read), `src/lab/measure.ts` move order |
| The away report's night on the lab's world, so a measure can read how a night ended | `src/lab/world.ts` (`World.night`), set by `step` in away mode |
| A night record per long gap, hung on the next sample | `src/lab/tournament.ts`, `DecisionSample.nights` in `src/lab/measure.ts` |
| `nightFull` (share of long nights a full stockyard ends) and `nightFullAt` (how far into those nights it ended, median) | `src/lab/measures/` |
| `deadGood`: a stockpile full while no order delivering takes that good | `FreshView.deadGood` in `src/lab/fresh-view.ts`, measure in `src/lab/measures/` |
| Part 2's dad: goods income (stone and brick), a kiln with its worker when brick is the order's limit and it pays for itself, an expansion when a buy he wants does not fit the stockyard or a stockpile is nearly full, prices in any good | `src/lab/fresh-dad.ts` |
| `secondsToFinish` takes each good's income | `src/transport.ts` (the walk already does) |
| Part 2's numbers | `src/makers.ts`, `src/stockyard.ts`, `src/city.ts`, `src/mine-piles.ts` (the kilns' pile) |

## Rulings

1. **The run ends at the last building in play**: the Warehouse's roof with part 2 on (`runDone` already reads `nextBuilding`).
2. **A night is a gap of six hours or more.** Shorter gaps are breaks in a day. `nightFull` counts only nights that start with the stockyard open.
3. **A kiln is bought for brick the order needs.** When the order's limit is brick, he buys a kiln and puts a worker on it (hired when none is free), if it brings the building sooner by more than the mine takes to make its price, as a vehicle must (#655 ruling 5).
4. **He expands the stockyard** when the buy he wants costs more than a stockpile's room, or when a stockpile holds 90% of its room or more and the brick covers it. Expanding is never weighed against the order: brick spent on room is brick the Warehouse waits for, and the lab shows that cost in the finish day.
5. **Prices in any good.** A plan carries a price as a list of goods; he covers it good by good with the hoard factor.

## Tasks

1. The two moves in the catalogue, with tests (listed only while open and under the last level; applied; events).
2. `World.night`, the night records and the three measures, with tests.
3. Part 2's dad, with tests on each plan (kiln when brick limits, expand when a price does not fit, expand when nearly full, a closed stockyard buys nothing).
4. Tune on 3 seeds, confirm on 20: the kiln, the kilns' pile, the stockyard's room and levels, the Warehouse's steps; weigh the Light Tower's 45% and part 1's playtest notes.
5. A sim test: every player type reaches the Warehouse's roof with part 2 on.
6. Docs: the spec's starting numbers and Lab, `ARCHITECTURE.md`, this plan's findings.

## Proof

The test files, then `npm run gate -- fast`. Nothing the player sees changes unless a part 1 number moves; then the part 1 journey and the play saves that show it. The full gate on the final commit.
