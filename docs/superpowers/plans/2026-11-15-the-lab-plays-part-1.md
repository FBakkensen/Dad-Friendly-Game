# The lab plays part 1 (#655)

Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "Lab", "Risks" and "Starting numbers". Off in play: only a fresh mine (`fresh.off=0`) reaches it. Parent #530; after the rules on main (#653, #654, #689, #690).

## Rulings (agent-run sitting)

1. **Part 1's types are their own folder.** `src/lab/fresh-policies` holds part 1's player types; the strategy lab plays them, and no others, when `fresh.off=0`, and today's types when it is off. A fresh type is a `Policy` with `FreshHabits` (`moves`, `hold`, `upgrades`); `isPolicy` refuses a malformed one. Nine types: casual, check-in, checker, evening, five-min, marathon and optimizer as today, plus `casual-mover` (moves idle workers) and `casual-no-hold` (never holds), so each risk has a pair that differs in one habit.
2. **The fresh dad lives in `src/lab/fresh-dad.ts`.** Today's `decide` reads a catalogue that knows nothing of jobs, orders or transport, so part 1's dad gets his own planner, not a branch in `decide`. `playSecond` (`lab/run`) hands a fresh type's live second to it. The gap and the sittings stay `run`'s.
3. **What he does, in order:** order the next building; place a free worker (an idle vehicle, a builder, else the slowest stage); for the mover, move idle drivers and builders to the mine and back, and spare stage workers to the slowest stage; buy the order's fix when transport or the builders are its limit and it pays for itself; buy the raise that pays back soonest; hold or resume. A plan is the moves that go together (a machine, the workers it takes, their places), so every buy hires and places its own workers (rule 2.4).
4. **A wagon comes with its driver and the builders to keep pace.** A wagon alone only fills the site when the builders are level with transport, so the lab never saw it as sooner. `vehicleBuy` adds builders until they build at least what the fleet carries.
5. **A fix must pay for itself.** With its price added to the pocket, the building must come sooner by more than the mine takes to make that price. Without it the dad bought about thirty wagons: transport was a tax.
6. **He holds only while the order drains the mine.** He holds while the best raise pays back sooner than the building takes and the order takes more than half of what the mine makes (`STARVED_SHARE`). Without the second half he held forever with a full pocket. The hold is weighed on the mine as it would stand delivering (`asDelivering`), so the mover's moves on hold never undo it (it was trading hold and resume 400 times a second).
7. **A dad who never holds keeps the order from draining the mine.** He refuses a fix that would, or he could never buy again.
8. **`transportLimit` and `siteFull` count the time an order stands** (delivering or on hold). Over all samples, transport was the limit by construction whenever anything was ordered.
9. **`workerMoves` counts taps with the amount key**: for each hire and job, the count over ten on ×10 plus the rest on ×1, from the net change each live second. Max is not counted; moves that undo each other within one second are not either.
10. **The numbers part 1 starts with** (each in its own module):
    - 21 workers: six on each stage, one driver, two builders (`FRESH_START_JOBS`). With twelve the first raise took most of a day.
    - The horse wagon carries 9 a second, half of the starting line of 18: a wagon is a real decision, not a formality, and a dad who never holds still affords his next buy.
    - A builder builds 8 a second, a little less than a wagon carries (the prototype's ratio).
    - The site stays at 500: lowering it would lower a shipped save cap (a version bump), and 180 played the same.
    - The Light Tower is 25K, 250K and 1M stone (a lower step is a lower cap in the save reader, but no shipped save holds a project: `placeOrder` is refused outside a fresh mine): a casual dad raises it in about two days, an evening dad in two, a five-minute dad in four.
    - The cart is rated ×10 in a fresh mine (60 a second, `FRESH_RATING` in `line`). At ×3 (18) a tool with the 100-worker mark (24) beat it and `idleMachines` read 0.3 (risk 15). At 60 it outruns a tool even with Better boots (56.6).
11. **The optimizer stays, though it plays as the mover in part 1.** Better boots costs more than the whole Light Tower, so a worker always pays back sooner and it never buys an upgrade. It is kept so the row moves when parts 2 and 3 bring upgrades worth buying.
12. **Prices come from the game's own helpers**: a hire is `helperBill`, a tier or an upgrade is the lab's `sticker`, so the planner pays what the move charges.
13. **No guardrail on part 1.** The five-day floor is not checked; `src/lab/targets.ts` gains only the planner's guards and `STARVED_SHARE`, `AMOUNT_KEY_TEN`.

## Tasks

1. `FreshHabits` on `Policy`, `freshPolicy`, the nine types, the strategy lab's folder switch.
2. `fresh-dad`: the plans and `playFresh`; `run` routes a fresh second and ends at the roof (`runDone`).
3. `fresh-view` and the six measures; `workerTaps` in the sitting log; `narrowAt` in a fresh mine.
4. Tune the numbers on 3 seeds, confirm on 20.
5. Tests: the dad's plans, the view, the measures, `isPolicy`, `runDone`, a sim test that every type reaches the roof with `idleMachines` near zero; the rules' tests follow the numbers.
6. Docs: the spec's starting numbers, `ARCHITECTURE.md`.

## What the lab found (20 seeds, `npm run lab -- --factors fresh.off=0`)

| Player type    | Roof on day | transportLimit | workerMoves (taps a sitting) | idleWorkers |
| -------------- | ----------- | -------------- | ---------------------------- | ----------- |
| casual-2x10    | 2.50        | 0.52           | 44                           | 0.27        |
| casual-mover   | 2.00        | 0.86           | 145                          | 0.01        |
| casual-no-hold | 2.00        | 1.00           | 37                           | 0.07        |
| checker-6x3    | 1.67        | 0.69           | 31                           | 0.21        |
| checkin-4x2    | 1.75        | 0.86           | 30                           | 0.10        |
| evening-1x20   | 2.00        | 0.65           | 94                           | 0.22        |
| five-min-a-day | 4.00        | 0.62           | 31                           | 0.24        |
| marathon       | 1.09        | 0.87           | 254                          | 0.21        |
| optimizer      | 2.00        | 0.86           | 145                          | 0.01        |

`starved`, `siteFull` and `idleMachines` read 0 for every type.

- **Transport is the order's limit most of the time an order stands** (risk 3): 0.5 to 1.0. A wagon is bought only when it pays for itself, so this is a slower build for a faster mine, not a tax, but it is the limit he lives with.
- **The site never fills** (risk 12): the dad keeps the builders level with transport, so the builders behave like a second transport row. Part 1 gives the site nothing to decide.
- **On hold does not pay in part 1**: the dad who never holds raises the roof on day 2.0, before the casual dad who holds (2.5).
- **The mover wins by half a day** (risk 11): he raises the roof on day 2.0 against the casual dad's 2.5, about 20% sooner, at about three times the taps a sitting (145 against 44). Whether that is "by much" is Flemming's call when part 1's levers are weighed; the dad who never holds is as quick with fewer taps than either.
- **The optimizer never buys an upgrade**: in part 1 a worker or a machine always pays back sooner, so it plays as the mover.
