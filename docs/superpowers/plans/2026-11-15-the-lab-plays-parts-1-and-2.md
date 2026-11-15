# The lab plays parts 1 and 2 (#667)

Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "Lab", "Starting numbers", rules 3, 4 and 6. Off in play: only a lab run with `fresh.off=0,part2.off=0` reaches part 2. Parent #530; after the rules (#666, PR #717). Agent-run sitting: the calls below are the thread's rulings, recorded on the issue and in the PR body.

**Goal:** the strategy lab plays a fresh mine to the Warehouse's roof, sets part 2's numbers, and reports `nightFull` and `deadGood`.

## Global constraints

- No bound in `src/lab/targets.ts` changes (a stop). Only planner guards are added there.
- The five-day floor is not checked on part 2 (Flemming, 15 Nov 2026).
- Nothing on his phone changes, except a part 1 number the lab moves (it is said in the PR body).
- Engineering words only; no new player-facing copy.

## The modules

| What                                                                                                                                                                                                                                       | Module                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| "Buy a kiln" and "Expand the stockyard" as moves: listed while open, applied, logged                                                                                                                                                       | `src/economy/actions.ts` (the catalogue every planner and the Ledger read), `src/lab/measure.ts` move order |
| The away report's night on the lab's world, so a measure can read how a night ended                                                                                                                                                        | `src/lab/world.ts` (`World.night`), set by `step` in away mode                                              |
| A night record per long gap, hung on the next sample                                                                                                                                                                                       | `src/lab/tournament.ts`, `DecisionSample.nights` in `src/lab/measure.ts`                                    |
| `nightFull` (share of long nights that end with a full stone stockpile standing the mine) and `nightFullAt` (how far into those nights it filled, median)                                                                                  | `src/lab/measures/`                                                                                         |
| `deadGood`: a stockpile full while no order delivering takes that good                                                                                                                                                                     | `FreshView.deadGood` in `src/lab/fresh-view.ts`, measure in `src/lab/measures/`                             |
| Part 2's dad: goods income (stone and brick), a kiln with its worker when brick is the order's limit and it pays for itself, an expansion when a buy he wants does not fit the stockyard or a stockpile is nearly full, prices in any good | `src/lab/fresh-dad.ts`                                                                                      |
| `secondsToFinish` takes each good's income                                                                                                                                                                                                 | `src/transport.ts` (the walk already does)                                                                  |
| Part 2's numbers                                                                                                                                                                                                                           | `src/makers.ts`, `src/stockyard.ts`, `src/city.ts`, `src/mine-piles.ts` (the kilns' pile)                   |

## Rulings

1. **The run ends at the last building in play**: the Warehouse's roof with part 2 on (`runDone` already reads `nextBuilding`).
2. **A night is a gap of six hours or more** (`NIGHT_MIN_MS`). Shorter gaps are breaks in a day. `nightFull` counts the nights with the stockyard open at their end, and a night is full when it ends with the mine standing at a full stone stockpile (the night report's `stop`): a full stone stockpile stops the line, a full brick one only sends rock to stone. A night where the stockpile filled and transport then drained it into the order is not full, since the mine kept going.
3. **`deadGood` is a stockpile full while no order delivering takes its good**, weighed by time, one rule for live minutes and nights (`deadStockpiles` in `stockyard`): a minute for each live sample, and for each long night the night report's `deadMs`, which the night log adds up stretch by stretch, each on its start's terms (PR review: counted on samples alone, the hours away never showed; read at morning, a step's need that ran out in the night was wrong). What he could buy with it is his call; the lab asks only whether the yard sits full.
4. **A kiln is weighed on the whole building.** The order's fix is the better of the answer to its limit (a wagon with its driver and builders, or a builder) and a kiln with a worker hired onto it while a step still to build requires brick, by building-seconds saved per stone, each only when it brings the building sooner by more than the mine takes to make its price (#655 ruling 5). Weighed on the step in hand, a kiln was never bought while the foundation was transport's: the casual dad finished on day 12 with two kilns.
5. **He expands the stockyard** when a stockpile holds 90% of its room or more (`YARD_NEARLY_FULL`), or the raise he wants costs more than the stone room, and the brick covers it with his hoard. It is not weighed against the order.
6. **No raise into a full stockyard.** With the stone stockpile nearly full he raises no line: a faster line only stands sooner. Without it the casual dad raised the line to 4,900 a second against 108 of transport.
7. **No worker moves at a full stockyard.** While hoisting stands with rock to lift, the stockyard is full and no move of his makes room, so `pileMove` moves nobody. Without it the evening dad moved every worker to hoisting one by one and stood the line for a day.
8. **The numbers.**
   - The stockyard holds 6M stone and 1M brick at level 0, twice the spec's guess (`ROOM_AT_ZERO`; the lab knob `room.stockyard` scales it). A level still triples it for 150K brick ×3. Transport drains the stockpiles into the order through the night, so few nights end full at either room; at 3M the ones that do fill earlier (the casual dad at 0.46 of the night, the five-minute dad at 0.43), and the long-gap types sit dead far longer (`deadGood`, weighed by time with the nights: 0.39 against 0.14 for five minutes a day, 0.35 against 0.12 for the marathon, 0.28 against 0.19 for the evening dad, 0.09 against 0.05 for the casual dad; only the optimizer reads lower at 3M, 0.02 against 0.03). At 12M the casual types finished on the same days.
   - The kiln (15,000 stone ×1.219, 12 brick a second), the kilns' pile (300) and the Warehouse's steps (8M stone and 1M brick, 15M and 4M, 12M brick) stay. The kiln's numbers move again with its recipe, two rock for one brick (#723), so they were not tuned here.
   - The Light Tower's night shift output stays 45%. At 40% the casual types' Warehouse comes about half a day later, with the night measures about the same; 45% is the approved line on the card.
9. **Part 1's playtest notes (15 Nov).** Each is weighed, none moves a number here:
   - Work boots at 1.6M: the optimizer, the one type that weighs upgrades, does not buy it in part 1 even at 150K (seed 1: it adds about 24 a second of line at 100 workers, where a machine pays back about ten times sooner). In part 2 the optimizer buys it on day 3. It stays; that it shows from 10 workers is the workforce screen's to decide.
   - The tool marks at 25 and 50 workers: a line on the workforce screen, not a number. Flemming approved "Every worker with a tool works twice as fast." for it.
   - Piles of 300 stop mattering after ten minutes: a rule for the prototype (pile room that grows).

## Tasks

1. The two moves in the catalogue, with tests (listed only while open and under the last level; applied; events).
2. `World.night`, the night records and the three measures, with tests.
3. Part 2's dad, with tests on each plan (kiln when brick limits, expand when a price does not fit, expand when nearly full, a closed stockyard buys nothing).
4. Tune on 3 seeds, confirm on 20: the kiln, the kilns' pile, the stockyard's room and levels, the Warehouse's steps; weigh the Light Tower's 45% and part 1's playtest notes.
5. A sim test: every player type reaches the Warehouse's roof with part 2 on.
6. Docs: the spec's starting numbers and Lab, `ARCHITECTURE.md`, this plan's findings.

## Proof

The test files, then `npm run gate -- fast`. Nothing the player sees changes unless a part 1 number moves; then the part 1 journey and the play saves that show it. The full gate on the final commit.

## What the lab found (20 seeds, `npm run lab -- --factors fresh.off=0,part2.off=0`)

Part 1 (`fresh.off=0` alone) reads as #655 and #703 left it: the Light Tower's roof on day 2 for the casual types, 3 for the evening dad, 4 for five minutes a day, 1.1 for the marathon.

| Player type    | Warehouse's roof on day | nightFull | nightFullAt | deadGood | transportLimit | workerMoves | idleWorkers |
| -------------- | ----------------------- | --------- | ----------- | -------- | -------------- | ----------- | ----------- |
| casual-2x10    | 6.0                     | 0.11      | 0.94        | 0.05     | 0.85           | 25          | 0.25        |
| casual-mover   | 5.5                     | 0         | n/a         | 0        | 0.74           | 32          | 0.08        |
| casual-no-hold | 5.5                     | 0         | n/a         | 0.05     | 1.00           | 28          | 0.14        |
| checker-6x3    | 5.3                     | no nights | n/a         | 0        | 0.73           | 11          | 0.20        |
| checkin-4x2    | 5.7                     | 0.20      | 0.65        | 0.03     | 0.82           | 14          | 0.25        |
| evening-1x20   | 7.0                     | 0.20      | 0.27        | 0.19     | 0.74           | 41          | 0.20        |
| five-min-a-day | 9.0                     | 0.33      | 0.62        | 0.14     | 0.76           | 26          | 0.30        |
| marathon       | 4.1                     | 0         | n/a         | 0.12     | 0.81           | 97          | 0.16        |
| optimizer      | 5.5                     | 0         | n/a         | 0.03     | 0.85           | 30          | 0.08        |

`starved` and `siteFull` read 0 for every type.

- **Part 2 takes the casual types three and a half to four days** after the Light Tower, longer than the paper check's two and a half. The Warehouse is not made smaller: the marathon already has it on day 4.1, and the whole slice must take every type five days or more (#556).
- **Transport is still the order's limit most of the time** (0.7 to 1.0). Wagons cost ×1.219 each, so the fleet stops near forty and about 350 a second; trucks come with the Warehouse. That is what part 2's pace is.
- **Few nights end at a full stockyard** (0 to 0.33): once the stone stockpile fills, transport draining it into the order keeps the mine going, so a night ends full only when the order needs no more of the good. Those that do end full fill late for the casual dad (0.94 of the night) and early for the evening dad (0.27 of a day-long gap): room for a night is not room for a day.
- **`deadGood`, weighed by time, is highest for the long gaps** (0.19 for the evening dad, 0.14 for five minutes a day, 0.12 for the marathon, whose day-long gap follows a sitting that outruns its order): the nights that end with a stockpile nothing takes sit dead to morning. The other types read 0.05 or less.
- **The checker has no long nights**: six sittings a day leave no gap of six hours.
