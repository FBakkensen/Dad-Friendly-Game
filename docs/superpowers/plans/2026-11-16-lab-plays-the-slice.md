# The lab plays the whole slice (#675) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. When the plan is done, use the ship-sitting skill, not `superpowers:finishing-a-development-branch` directly.

**Goal:** The strategy lab plays slice 1 from a fresh mine to the Foundry's roof, with part 3 on: the shaft, the Granite, saws, borers, locomotives, trucks, hoists assigned to a level, and three player types that place the levels' work differently. It reports `sliceDays`, `shareMoves`, `narrowRun`, `nightFull`, `deadGood`, `transportLimit`, `starved`, `hoistWorkers` and `cageGap`, and the stages are set apart so a line in balance has the most workers on drilling and the fewest on hoisting.

**Architecture:** The Foundry joins the city's buildings behind part 3's switch. `mine-piles`' `steadyIncome` learns the Granite and the cages, so the lab's dad plans on what the two levels and the cages make. The dad (`src/lab/fresh-dad.ts`) keeps parts 1 and 2 as they are, and a new module, `src/lab/fresh-levels.ts`, holds what is new with the shaft: the shaft as a saving target, the levels' raises, the hoists, and the three level habits. The tools of each stage and the workers a machine takes move behind part 3's switch, in `workforce` and `tiers`, as numbers the lab sets.

**Tech Stack:** TypeScript, Vitest, the strategy lab (`src/lab/`, `tools/strategy-lab.ts`).

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`: rule 2.14, rules 5 and 7, "Starting numbers", "His two calls", "Lab", as amended in #722.

## Global Constraints

- Off in play: everything new is behind `partThreeOn()`, which boot never holds on. With part 3 off, every rule this plan changes returns today's result. The journeys and the visual check do not move.
- No save change and no reset: the Foundry is a new id in a list (`operational`), which must not reset the save (`dad-friendly-work.md`).
- The lab plays the whole slice: `npm run lab` plays under the game's factors with `part3.off=0` on top. `--factors part3.off=1` plays parts 1 and 2 as the game does now.
- No bound in `src/lab/targets.ts` changes without Flemming's own words (a stop, `superpowers.md`). The new measures are report-only.
- `effectiveRates` and `lineWork` are the lab's hot path (`lab.md`): time one lab job against `main` after a change to either.
- No function over 150 lines or a cognitive complexity of 15. Knip clean. Coverage floors stay.
- Prove each task with the ladder in `.claude/rules/dad-friendly-work.md`. A test that plays the economy over a second is a `*.sim.test.ts`.
- Commits: a plain sentence ending "(#675)", with the session's two trailer lines.

## Rulings (agent-run sitting)

1. **The Foundry is a building of part 3** (`part: 3` in `src/city.ts`), with the spec's steps: 15M brick and 4M cut stone; 20M brick and 15M cut stone; 30M brick and 40M cut stone. No issue owned its project, and the lab's finish line needs it. Its power is none in slice 1, and the slice ends at its roof. The winding engine it would open waits for a later slice.
2. **The lab plays part 3.** `LAB_FACTORS` (`src/lab/run.ts`) is the game's factors with `part3.off=0`. The lab's run is then the game after part 3's switch-on (#682), which is the point of setting part 3's numbers first.
3. **The next building waits for its levels.** The dad orders the next building at once, as before, unless it requires a good that no open level can make (cut stone before the shaft). Then he saves for the shaft first. While he saves, he buys a raise only if it pays back before he would have the shaft's stone. Holding the Foundry's order for the shaft would leave the dad who never holds stuck, because the order takes every brick the kilns make.
4. **Makers for every good the building requires.** Part 2's kiln fix becomes a maker fix: a kiln while a step still to build requires brick, a saw while one requires cut stone, each with a worker on it.
5. **A buy is weighed in the good it costs.** A plan carries its price as a list of goods. It pays for itself when it brings the building sooner by more than the mine takes to make its price, good by good. That is part 2's rule (`savedSeconds`) with goods. Borers and locomotives cost cut stone, saws and trucks brick.
6. **Vehicles.** When transport is the order's limit, the dad weighs each open vehicle (a horse wagon, a truck) with its driver, and takes the one that brings the building soonest for its price.
7. **The levels' raises** (`fresh-levels.ts`, once the Granite is open). For each level he may build on, a chain like part 1's `lineRaise`: the level's slowest stage (its drilling, its haulage, or what the cages lift from it), the best buy for that stage per second of income it costs, until the level moves more. The chains are weighed by how much sooner the building is up, per second of income they cost (ruling 5). A hoist is a buy for hoisting; the dad who assigns weighs it assigned to the level too.
8. **Three level habits** (`FreshHabits.levels`):
   - `need`: builds on both levels by need, assigns and frees hoists one at a time when that brings the building sooner, and moves one worker of a stage between the levels when that does. Every player type of today plays `need`.
   - `even` (new type `casual-even`): when the Granite opens he moves half of each of the Topsoil's drilling and haulage workers to the Granite, once. Then he builds on both levels by need, never moves a worker between the levels again, and never assigns a hoist.
   - `whole` (new type `casual-whole`): every worker on drilling and haulage is on one level. He works a level until its good for the step in hand is in the stockyard (brick from the Topsoil, cut stone from the Granite), then moves them all to the other level. He builds only on the level he works and never assigns a hoist, so the other level's machines stand: the old cage's cost in view.
     As built: he moves them all when the other level's good is short by more than `WHOLE_MOVE_MARGIN` (2) times this level's, and at once when he works a level whose maker he cannot buy while the level that makes its price has nobody (`makerStranded`), so he is never stuck. Moving on "its good is in the stockyard" alone sent him back and forth every second while the cages still emptied.
9. **The factory is left alone.** The lab's dad places no work orders in this sliver. A work order's gear is time-limited, and its materials are slow by design. "Shows up, never used" reports it.
10. **The measures.** `sliceDays`: the finish day, when the run ends at the Foundry's roof. `shareMoves`: taps a sitting that move workers onto or off the Granite's jobs and hoists onto or off a level, with the amount key on ×10 and ×1. `hoistWorkers`: the mean share of the mine's workers on hoisting while the Granite is open (as built, one share for the whole mine; the line in balance on each level is pinned by `workforce.test.ts`). `cageGap`: at each sitting's start with part 3 on, ten minutes of the mine played live and counted as rates from the same mountain; the largest gap as a share of the rates' rock.
11. **The stages apart** (rule 2.14). Behind part 3's switch a worker with a tool moves a share of today's tool that is set per stage, and a machine takes a number of workers set per machine, each a knob (`tool.face`, `tool.haul`, `tool.lift`, `staff.<id>`). Their values are the lab's (Task 6).
12. **The values** (Task 6). A worker with a tool moves today's tool times 1 on drilling, 2 on haulage and 3 on hoisting (3, 6 and 9 a second); a drill takes 3 workers; a hoist is rated 480 a second, a load of 4,800 to the Topsoil, so the Granite's trip, twice as long, still lifts more for its one worker than a locomotive hauls for each of its eight. With them a line in balance has the most workers on drilling and the fewest on hoisting on both levels (`workforce.test.ts`, "the stages apart"). The tests that pin #724's cages and piles play `partThreeAsBuilt`, which sets the old numbers through the knobs.
13. **The need dad weighs moves, not values.** A move between the levels is taken only when it brings the Foundry sooner by more than `SOONER_SHARE`, so no move is undone by the next. His answer is kept for `WEIGH_AGAIN_CALLS` calls while the mine's machines and stock are unchanged, and the steady rates are cached per mountain: the lab would take minutes per run otherwise.
14. **The shaft waits for its price.** As built, before the Foundry is ordered the dad waits for the shaft and sinks it once the pocket holds its price (`waitsForShaft`), and raises the line meanwhile as part 2 does.
15. **The lab is slower, and that is the slice.** The `--ci` lab takes about 5 minutes against main's 1m15s: the slice plays two to three times more days, and the levels' moves are weighed each second. Recorded, not tuned away.
16. **The economy is not tuned here.** The slice ends in 14.5 to 21.5 days on seed 1, every type over five. The borer and the locomotive are never bought. Worker and wagon growth, builders against trucks and the Foundry's size are a follow-up sliver; this one sets only the stages apart.
17. **The five-day floor.** The row (`sliceDays`, every player type, at least 5) is a guardrail in `src/lab/targets.ts`, which only Flemming's own words may add. It is asked once with the numbers, and the PR waits for his answer only at the merge.

## Review Focus

- A dad who never holds must still reach the Foundry's roof (ruling 3): the sim test plays `casual-no-hold` to the end.
- A level with nobody on it must not make the dad divide by zero: a level whose line is 0 has a chain or none, never NaN.
- A free move (a hoist assigned, a worker between the levels) must strictly bring the building sooner, so two moves never undo each other second after second.
- The whole-workforce dad must not flip levels every second: he moves only when the good of the level he works is in the stockyard.
- Part 1 and part 2 rules with part 3 off must read as today: the existing lab tests and the journeys stay green.

---

### Task 1: The Foundry in the city, and the lab under part 3

**Files:** Modify `src/city.ts`, `src/lab/run.ts`, `tools/strategy-lab.ts`. Test `src/city.test.ts`, `src/lab/run.test.ts`.

**Interfaces:** Produces `BuildingId` with `"foundry"`; `LAB_FACTORS: Readonly<Record<string, 0>>` in `src/lab/run.ts`.

- [ ] Test: with parts 2 and 3 on, `buildingsInPlay()` ids are `["lightTower", "warehouse", "foundry"]` and the Foundry's steps are the spec's; with part 3 off they are the first two.
- [ ] Implement: `BuildingRow.part: 1 | 2 | 3`; `buildingInPlay` reads `partThreeOn()` for part 3. Fix every `Record<BuildingId, …>` the type checker names.
- [ ] `LAB_FACTORS` = `{ ...PLAY_FACTORS, [PART_THREE_OFF]: 0 }`; `tools/strategy-lab.ts` plays under it.
- [ ] `npx vitest run src/city.test.ts src/lab/run.test.ts`, commit.

### Task 2: The mine's steady income on two levels

**Files:** Modify `src/mine-piles.ts`. Test `src/mine-piles.test.ts`.

**Interfaces:** Produces `steadyIncome(mountain): Partial<Stock>` with `cutStone` once the Granite is open, and `steadyLevels(mountain): Readonly<Record<MineLevelId, Readonly<Record<Stage, number>>>>`: each level's stage rates as the branches run them steady (hoisting is the level's own cages and its share of the turn).

- [ ] Tests: with part 3 off, `steadyIncome` is today's. With part 3 on and one level, hoisting is the cages' rate. With the Granite open, Granite rock makes cut stone at the saws' rate and the rest is stone, and a level with nobody on haulage takes no share of the turn.
- [ ] Implement: build the same branches as `mineBranches`, with every pile in step and no stockpile full, and read `branchesIncome` and the branch chains' first three rates.
- [ ] Run the test file, commit.

### Task 3: The dad sinks the shaft, buys saws, and weighs buys in their goods

**Files:** Modify `src/lab/fresh-dad.ts`. Create `src/lab/fresh-levels.ts`. Test `src/lab/fresh-levels.test.ts`, `src/lab/fresh-dad-part-two.test.ts` stays green.

**Interfaces:** `Priced` gains `price: Price` (cost stays the stone part for part 1's line). `levelsPlan(mountain, habits, hoardK): Plan | undefined` from `fresh-levels.ts`: undefined while part 3's rules are not in play, so `freshPlan` goes on as before.

- [ ] Tests: a mine at the Warehouse's roof with part 3 on does not order the Foundry and saves for the shaft, then sinks it when it holds the price; with the shaft sunk he orders the Foundry and buys a saw with a worker; a truck is chosen over a horse wagon when it brings the building sooner for its price.
- [ ] Implement rulings 3 to 6.
- [ ] Run the test files, commit.

### Task 4: The levels' raises and the three habits

**Files:** Modify `src/lab/fresh-levels.ts`, `src/lab/policy.ts`, `src/lab/plain.ts`. Create `src/lab/fresh-policies/casual-even.ts`, `casual-whole.ts`. Test `src/lab/fresh-levels.test.ts`, `src/lab/fresh.sim.test.ts`.

**Interfaces:** `FreshHabits.levels: "need" | "even" | "whole"`, `need` by default in `freshPolicy`.

- [ ] Tests: the even dad splits once and never moves a worker between the levels after; the whole dad has every level worker on one level after every plan, and moves them only when that level's good for the step is in the stockyard; the need dad assigns a hoist only when it brings the building sooner; no free move is undone by the next plan.
- [ ] Sim test: every player type reaches the Foundry's roof on seed 1, with the shaft sunk and a saw running.
- [ ] Implement rulings 7 and 8. Time one lab job against `main`.
- [ ] Commit.

### Task 5: The new measures

**Files:** Create `src/lab/measures/sliceDays.ts`, `shareMoves.ts`, `hoistWorkers.ts`, `cageGap.ts`. Modify `src/lab/fresh-view.ts`, `src/lab/sittings.ts`, `src/lab/tournament.ts`. Test `src/lab/measures.test.ts`, `src/lab/sittings.test.ts`.

- [ ] Tests for each measure's reading on hand-made samples (ruling 10).
- [ ] Implement, register, run the lab once, commit.

### Task 6: The stages apart, and the numbers

**Files:** Modify `src/workforce.ts`, `src/tiers.ts` (or `src/rates.ts`), numbers in `src/cages.ts`, `src/stockyard.ts`, `src/makers.ts`, `src/transport.ts` as the lab finds. Test `src/workforce.test.ts`.

- [ ] Tests: with part 3 on, a worker's tool on drilling moves less than on haulage, and on haulage less than on hoisting; each machine takes its set workers; with part 3 off both are today's.
- [ ] Sweep with `--factors` until a line in balance has the most workers on drilling and the fewest on hoisting on both levels, and every player type needs five days or more to the Foundry's roof. Record each number and its reason under Rulings in the PR body.
- [ ] Write the pacing ledger again (`npm run lab:ledger`), update `docs/DESIGN.md`, `docs/design-intent.md` and the spec's Starting numbers with what the lab set, commit.
