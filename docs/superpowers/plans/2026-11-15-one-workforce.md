# One workforce, off in play (#689, M15-48)

**Goal:** slice 1's workforce (spec `docs/superpowers/specs/2026-11-14-slice-1-design.md`, rule 2 items 1 to 7 and 9 to 11, calls 39 to 42, rule 1's table, The save, Proof; prototype version 9). In a fresh mine (`fresh.off: 0`) every worker is in one pool, on a job or free. He hires a worker, who starts free, and moves one at a time onto a job or off it, for free. A stage's workers run its machines and the rest work with a tool; the line moves what its slowest stage moves, and no worker spreads to it. A vehicle runs with one driver. Play is unchanged. Builders and the building site are #690; the lab's numbers and players are #655; the screens come later.

**Shared modules:** one new rules module, `src/workforce.ts`, because nothing today owns jobs: the job table, free workers, the two moves, a stage's work and the line's work. Everything else extends what owns it: the game state is `Mountain.jobs` and `createMountain` (`src/mountain.ts`); the crew's speed is `readRates` in `src/rates.ts` (a fresh branch, `workforceRun`, beside today's staffing search); the drivers are `fleetRate` in `src/transport.ts`; the doors are `FRESH_DOORS` in `src/tiers.ts` with `freshLock` in `src/crew.ts`; Helping hands is `synergyBonus` in `src/upgrades.ts`; a promotion is `promotionOpen` in `src/engineers.ts`; the moves are `Action`s in `src/economy/actions.ts`; the save is `src/save-format.ts` and its ledger.

## Rulings (agent-run sitting)

1. **The jobs of part 1** are drilling, haulage, hoisting and driving. Building comes with the building site (#690); the kilns and the saws with parts 2 and 3. `Mountain.jobs` counts the workers on each. The free workers are the rest of `owned.helper`, which stays the count of workers he owns, so the price, the worker marks and every reader of it are unchanged (call 42).
2. **Hiring is buying a worker** (`buyTier` of `helper`), on today's price curve. The new worker is free.
3. **The moves** are two actions, `placeWorker` and `freeWorker`, each for one job, listed only in a fresh mine and refused outside it. They are free and instant, and logged as `worker.place` and `worker.free` with the job and its new count.
4. **A stage's work is exact.** Its workers run the machines that together move the most and stay on their tools where that moves more: every count of each machine but the last is tried, and the last runs all it can when one beats the workers it takes on tools. So one more machine or one more worker never lowers what a stage moves (property-tested). A worker on a machine does no other work (call 39).
5. **A worker with a tool** moves three times a worker's speed on his stage (the line spec's worker on one job): 3 a second, with Better boots and the worker marks in it. A machine moves its line rating, as on `main`. The line is the slowest stage; there is no spreading.
6. **A machine takes its row's `staff`**: one for the cart, the hoist and the drill (eight, eight and ten for the borer, the locomotive and the winding engine, which are later parts). The tended winding engine's smaller crew waits for engineers in part 3.
7. **Nothing gates a machine but its price** (rule 2.6): the cart, the hoist and the drill are for sale from the first evening. The `owns` door and its words ("At 12 workers", "After a cart") are gone; only a later part's door remains.
8. **A vehicle runs with one driver**, the best carriers first, and transport carries only what the driven vehicles carry. An idle vehicle is not lost.
9. **A fresh mine starts with ten workers, all on jobs**: three on each stage and one driver on the given horse wagon. The prototype's two builders come with #690, which makes the prototype's twelve. The lab sets the count (#655).
10. **Better boots and the worker marks** lift only a worker with a tool, because they are in a worker's own speed and a machine's speed does not read it. **Helping hands** counts the workers on haulage in a fresh mine (call 41). Their words wait for the stage's list (#661).
11. **A promotion takes a free worker**: in a fresh mine it needs one (and the first borer, as before).
12. **Engineers' tenths** still apply to the machines the workforce runs, without the tending floor; engineers by stage are part 3 (#539).
13. **`helpersShort`** in a fresh mine is the workers its idle machines would take.
14. **The save gains `jobs`** in the game map (counts by job id), written only when not empty, so today's save is unchanged and there is no version bump. The reader refuses more workers on jobs than he owns and a negative count as `bad`, and a job it does not know as `newer`. The ledger gains the job ids.
15. **The lab values a move** at what the line gains, at no cost. The lab's players do not move workers yet: teaching them is #655.
16. **Unattended**, the workers stay where he left them, and the whole line and transport work at the night shift output (rule 2.11), as `accrueAway` already does.

## Tasks

1. `src/workforce.ts` and `src/workforce.test.ts`: jobs, free workers, the moves, a stage's work, the line's work; the property tests.
2. The state and the crew: `Mountain.jobs`, `createMountain`, `readRates`' fresh branch, the drivers in `fleetRate`, the doors, Helping hands, the promotion.
3. The moves: `Action`, `listActions`, apply, events, values, the lab's switches and `MOVE_KINDS`, the field log.
4. The save: the game map and the ledger.
5. Tests that the change moves: the fresh mine's doors and start, orders and transport (now with drivers and placed workers), the invariants' fresh run (free workers never below zero, a move never changes how many he has).
6. Docs: `ARCHITECTURE.md`. `DESIGN.md` is unchanged: play does not change.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test files, `npm run gate -- fast`, then the full gate on the PR's final commit.
