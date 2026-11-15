# Rock waits between stages, and a one-worker start (#703) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every part runs on its own with a pile in front of it. The mine gets a face pile and a shaft pile, the building site's flow uses the same mechanism, and a fresh mine starts with one worker the dad moves between jobs.

**Architecture:** One pure module, `src/piles.ts`, computes a chain of stages with piles between them over a stretch, exactly, in phases where a pile fills or empties. The building site's `stepWork` uses it for transport and the builders. The mine's new `src/mine-piles.ts` uses it for drilling, haulage and hoisting, and `accrue` and `accrueNight` (`mountain`) call it in a fresh mine in place of digging at the line's speed. The piles are saved with the fresh mine's facts. `effectiveRates(...).crewPerSecond` stays the steady line (the slowest stage), which is what orders and the lab read.

**Tech Stack:** TypeScript, Vitest, happy-dom, the lab (`src/lab/`), puppeteer visual check.

**Spec:** issue #703 (the rule as written there) and `docs/superpowers/specs/2026-11-14-slice-1-design.md` (rules 2, 4 and 7, Starting numbers, What he sees: The mine).

## Global Constraints

- Prove each task with the ladder in `.claude/rules/dad-friendly-work.md`: the test file, then `npm run gate -- fast`. A task that changes a screen keeps that screen's visual section green in the same task.
- No function in non-test `src` over 150 lines or cognitive complexity 15.
- Fresh mine only (`freshMineOn()`); today's game is unchanged. Tests switch it on with `withFactors({ [FRESH_OFF]: 0 }, ...)` or `holdFactors`.
- The page shows numbers and names no bottleneck, no limit, no best buy (discovery principle).
- No version bump: the piles add save keys. Part 1's switch-on (#664) resets the save anyway.
- Commit style `M15-28: <sentence>`, ending with the session's Co-Authored-By and Claude-Session lines.

## Rulings (agent-run sitting)

1. **One mechanism.** `piles.ts` is the only place that moves goods through piles. The site's flow and the mine's flow both build a `Chain` and call it. The site keeps its own split between goods (`shareOut`); the chain moves totals.
2. **A pile over its room is full**, never emptied by a lower limit (as the stockyard's rule 4). So the limits are the lab's to change with no version bump, and the reader takes any whole number.
3. **A pile of room 0 is today's line**: the stages run in step. A test pins this.
4. **Whole goods.** The chain is exact in real numbers; `flowWhole` floors each stage's total and recomputes the piles from them, so nothing is made or lost. As today, a part-good per call is dropped.
5. **Unattended**, the eight-hour clock stops drilling only. Haulage and hoisting go on until the piles are empty, and transport goes on from the pocket. `producedMs` counts the time stone came up to the pocket.
6. **The steady line** (`crewPerSecond`, `exactCrewPerSecond`, the order's numbers) is still the slowest stage. Only what actually moves in a stretch goes through the piles.
7. **The start**: one worker, on drilling; one horse wagon given; nobody driving or building. The lab sets the two piles' room, and may lower the Light Tower's night shift output (Flemming, 15 Nov: "the benefits it gives seems quite big, but that is a part of a balancing").
8. **Words that wait for Flemming**: the first evening's card and the piles' two labels on the mine are asked as one question before the merge. Proposed words are in Task 5.

## Review Focus

- A stage with nobody on it while its pile is full: the stage before stops, nothing goes negative or over room. (Task 1 test: "stops drilling at a full face pile".)
- A night where the clock stops drilling with rock still in the piles: haulage and hoisting drain them after the clock. (Task 3 test: "drains the piles after the clock".)
- Moving the lone worker mid-second (a move between two live ticks): the next tick uses the new jobs and the piles carry over. (Task 3 test: "a move between ticks keeps the piles".)
- A saved pile over the room the build allows: it reads, and the stage before waits until it is under. (Task 3 test in the save ledger and Task 1 test "a pile over its room".)
- The building site's numbers do not move for an existing order: the transport and building-site tests stay green unchanged, or a changed number is shown exact by hand in the commit message. (Task 2.)

---

### Task 1: The shared chain (`src/piles.ts`)

**Files:**

- Create: `src/piles.ts`
- Test: `src/piles.test.ts`

**Interfaces:**

- Produces:
  - `type Pile = { readonly held: number; readonly holds: number }`
  - `type Chain = { readonly source: number; readonly rates: readonly number[]; readonly piles: readonly Pile[] }`. There is one pile between each pair of stages (`piles.length === rates.length - 1`). `source` is what the first stage can take: `Infinity` for rock at the face, or what the pocket holds for transport. The last stage's output has no limit.
  - `chainFlows(chain: Chain): readonly number[]`: each stage's rate now. It starts from `rates`, with stage 0 at 0 when `source <= 0`. Repeat until stable: going forward, a stage whose pile in front is empty moves at most the stage before it; going backward, a stage whose pile after it is full (`held >= holds`) moves at most the stage after it.
  - `chainChange(chain: Chain): number`: seconds until a flow changes (a pile fills or empties, or the source runs out), or `Infinity`.
  - `flowChain(chain: Chain, seconds: number): { readonly moved: readonly number[]; readonly piles: readonly number[]; readonly source: number }`: exact, in phases of `chainChange`, with a bounded loop.
  - `flowWhole(chain: Chain, seconds: number)`: the same shape. Each `moved[i]` is `Math.floor(x + 1e-9)`; each pile is `held + moved[i] - moved[i+1]`; `source` is what is left.

- [ ] **Step 1: Write the failing tests** in `src/piles.test.ts`:
  - "moves the slowest stage's rate once the piles settle": rates `[9, 3, 6]`, piles `{0, 500}` and `{0, 500}`, source `Infinity`, 1,000 s. Then `moved[2]` is 3,000, the face pile is 500 (full), and the shaft pile is 0.
  - "stops drilling at a full face pile": rates `[3, 0, 0]`, face pile holds 500. Over 1,000 s, `moved[0]` is 500 and `chainChange` at the start is 500/3.
  - "a lone hauler empties the face pile into the shaft pile": rates `[0, 3, 0]`, face held 300. Over 200 s, `moved[1]` is 300 and the piles are `[0, 300]`.
  - "piles of room 0 run in step, as today's line": rates `[9, 3, 6]`, both piles hold 0. Then `chainFlows` is `[3, 3, 3]`.
  - "a pile over its room is full, and nothing is taken away": face held 800, holds 500, rates `[3, 0, 0]`. Then `moved[0]` is 0 and the pile stays 800.
  - "a finite source runs out": source 100, rates `[10, 4]`, pile holds 50, 100 s. Then `moved[0]` is 100, `moved[1]` is 100, and `source` is 0.
  - "nothing is made or lost": for a table of chains and seconds (include the cases above), `source used + sum(initial piles) === moved[last] + sum(piles after)`, within 1e-6 for `flowChain` and exactly for `flowWhole`.
- [ ] **Step 2:** `npx vitest run src/piles.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `src/piles.ts`** to the interfaces above. The doc comment states the general rule from #703, quoted from the issue.
- [ ] **Step 4:** `npx vitest run src/piles.test.ts`. Expected: PASS. Then `npm run gate -- fast`.
- [ ] **Step 5: Commit** `M15-28: One chain of stages and piles, for every part`.

### Task 2: The building site uses the chain

**Files:**

- Modify: `src/building-site.ts` (`stepWork`'s branch where the step is not done)
- Test: `src/building-site.test.ts` (or the existing test that covers `stepWork`; find it with `grep -rln stepWork src/*.test.ts`), `src/transport.test.ts`

**Interfaces:**

- Consumes: `flowWhole` and `Chain` from Task 1.
- Produces: no new exports. `stepWork`'s contract is unchanged.

- [ ] **Step 1: Write the failing test** "the site's flow is the shared chain": for three cases (builders faster than transport; transport faster and the site fills mid-stretch; the site starts full), `stepWork(...).delivered` and `.built` totals equal `flowWhole({ source: can, rates: [carry, build], piles: [{ held, holds: SITE_HOLDS }] }, seconds).moved`. It may already pass where the closed form agrees; one case should differ (the site fills mid-stretch while the builders were idle at the start). If none differs, keep the test as the pin and say so in the commit.
- [ ] **Step 2:** Run it. Expected: FAIL on at least one case, or PASS with the pin recorded.
- [ ] **Step 3:** Replace `room`/`brought`/`builds` in `stepWork` with `flowWhole`. Keep `finishSeconds` (the done branch is closed-form and exact) and `shareOut`.
- [ ] **Step 4:** `npx vitest run src/building-site.test.ts src/transport.test.ts src/fresh-night.test.ts src/fresh-orders.test.ts`. Expected: PASS. A changed expected number is checked by hand and named in the commit message. Then `npm run gate -- fast`.
- [ ] **Step 5: Commit** `M15-28: The building site's flow goes through the same chain`.

### Task 3: The mine's two piles, live and unattended, saved

**Files:**

- Create: `src/mine-piles.ts`
- Modify: `src/mountain.ts` (`Mountain.piles`, `BARE_MOUNTAIN`, `accrue` in a fresh mine, `nightStretch`, `accrueNight`), `src/save-format.ts` (game key `piles`), `src/save-ledger.test.ts`
- Test: `src/mine-piles.test.ts`, `src/fresh-night.test.ts`, `src/fresh-mine.test.ts`

**Interfaces:**

- Consumes: Task 1.
- Produces:
  - `type MinePiles = { readonly face: number; readonly shaft: number }`, held as whole stones. `Mountain.piles: MinePiles`, and `BARE_MOUNTAIN.piles = { face: 0, shaft: 0 }`.
  - `PILE_HOLDS: MinePiles` in `mine-piles.ts`, first guess `{ face: 500, shaft: 500 }` (the lab sets them in Task 4).
  - `mineChain(mountain: Mountain, pay: number, drilling: boolean): Chain`. Its rates are `lineWork(mountain, effectiveRates(mountain).tierSpeed).stages` face, haul and lift, each times `pay`; the face rate is 0 when `!drilling`. Its source is `Infinity`.
  - `flowMine(mountain: Mountain, seconds: number, pay: number, drilling: boolean): { readonly mountain: Mountain; readonly mined: number }`. `mined` is the stone lifted to the stock; it goes through `digStones` and the piles are updated.
  - `mineChange(mountain: Mountain, pay: number, drilling: boolean): number`: `chainChange` of `mineChain`.
  - The save's game map has a `piles` key, `{ face?: number; shaft?: number }`, positives only, whole numbers ≥ 0, with no upper bound (ruling 2).

- [ ] **Step 1: Write the failing tests:**
  - `mine-piles.test.ts`, "one worker on drilling fills the face pile and no stone comes up": the start of Task 4's shape, done by hand: `jobs.drilling = 1`, 1,000 s at pay 1. Then `mined` is 0 and `piles.face` is 500.
  - "moved to haulage, then hoisting, he brings the face pile up": three `flowMine` calls with the jobs moved in between. Stone reaches the stock, and nothing is made or lost.
  - "a move between ticks keeps the piles": 1 s, move the worker, 1 s. The piles carry over.
  - `fresh-night.test.ts`, "drains the piles after the clock": three on each stage, piles 400 and 400, 12 h away. Haulage and hoisting work past 8 h. `mined` equals what 8 h of the steady line plus the piles bring. `stop` is `"clock"`.
  - `fresh-night.test.ts`: the existing tests keep their numbers where the piles start empty and the line is steady, except for the rock the face and shaft piles keep when the night ends (state it in the test).
  - `save-ledger.test.ts`: a mountain with `piles: { face: 120, shaft: 7 }` round-trips, and `piles: { face: 9000 }` reads (ruling 2).
- [ ] **Step 2:** Run the three files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `accrue`, a fresh mine does `flowMine(..., pay, true)` over the whole seconds in place of `accrueCrew`. The Gold rush and the bench stay as they are (a fresh mine has neither).
  - `nightStretch` ends a stretch at the soonest of the step's end, `mineChange`, the clock, and the night's end, so the pocket's income is constant within it. `secondsToStep` takes that income.
  - After the clock, a stretch runs `flowMine(..., drilling = false)` and then `deliver`.
  - `producing` is "stone came up this stretch".
  - The save map reads and writes `piles`.
- [ ] **Step 4:** Run the files, then `npx vitest run src/fresh-*.test.ts src/session-night.test.ts src/frame-cards.test.ts src/shift-report-view.test.ts`, then `npm run gate -- fast`. Fix any fresh-mine test whose number moved only because rock now waits in a pile, and say which ones in the commit.
- [ ] **Step 5: Commit** `M15-28: Rock waits at the face and at the shaft`.

### Task 4: One worker at the start, and the lab plays it

**Files:**

- Modify: `src/mountain.ts` (`FRESH_START_JOBS`, `createMountain`), `src/lab/fresh-dad.ts`, `src/lab/targets.ts` if a target moves, `src/mine-piles.ts` (`PILE_HOLDS`), `src/city.ts` or wherever the Light Tower's `power.nightShift` lives (only if the lab lowers it), the lab's tests and sims (`src/lab/fresh-dad.test.ts`, `src/lab/fresh.sim.test.ts`, `src/lab/fresh-view.test.ts`), and the fresh-mine tests that read the start
- Test: as listed

**Interfaces:**

- Consumes: Task 3.
- Produces: `FRESH_START_JOBS = { drilling: 1, haulage: 0, hoisting: 0, driving: 0, building: 0 }`; `createMountain()` in a fresh mine has `owned.helper = 1` and one horse wagon.

- [ ] **Step 1: Write the failing tests:**
  - `fresh-mine.test.ts`, "starts with one worker on drilling, a horse wagon and nobody driving or building".
  - `fresh-dad.test.ts`, "moves the lone worker to the stage whose pile lets him move rock". Cases: the face pile is full and the shaft pile is empty, so the worker goes to haulage. The shaft pile is full, so he goes to hoisting. Both piles are empty, so he goes to drilling.
  - `fresh-dad.test.ts`, "places a hire where a pile waits": a hire goes to the stage after the fullest pile, else drilling. A driver and a builder are placed once an order is in.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement** the start and the dad's moves, extending the existing `placeFree`, `rebalance` and `moverPlan` rather than adding a second mover. The moves count in `workerMoves`.
- [ ] **Step 4: Tune with the lab.** Run `npm run lab:generations -- --ci` in the background and the fresh sim (`npx vitest run --project sim src/lab/fresh.sim.test.ts`). Then:
  - Set `PILE_HOLDS`, and the Light Tower's night output if needed, so casual reaches the roof around day 2 to 2.5 (#655's mark) and no player type stalls.
  - Record each value and the measures that set it as rulings in the plan's ledger (append below), and write them on #703 as a comment.
  - If a guardrail in `src/lab/targets.ts` is crossed, stop: that is one of the three stops.
  - Rewrite the pacing ledger with `npm run lab:ledger` if it moved.
- [ ] **Step 5:** `npm run gate -- fast`. Commit `M15-28: One worker at the start, moved between the jobs`.

### Task 5: What he sees: the piles on the mine, and the first evening's card

**Files:**

- Modify: `src/mine-view.ts` (each stage row: what the stage moves now, from `chainFlows(mineChain(mountain, 1, true))`, and the pile after it), `src/mine-site.ts` (its painter), `src/frame-cards.ts`, `src/frame-cards-words.ts` (`FIRST_EVENING`), `tools/browser/fixtures.ts` (`sliceStartSave`), `scripts/play.mjs` (`slice-start`), `scripts/visual/frame.mjs` (the start and the first card)
- Test: `src/mine-view.test.ts`, `src/frame-cards.test.ts`

**Interfaces:**

- Consumes: Tasks 3 and 4.
- Produces:
  - `StageRow.now` is the stage's own rate now, not the line's.
  - `StageRow.pile`, for drilling and haulage, is `{ label: string; held: number; holds: number }`.
  - `FrameCard` gains `{ kind: "first" }`. It shows on the first ready view of a session while nothing is ordered and nothing is operational, until its key is pressed. It is not a save fact.

- [ ] **Step 1: Write the failing tests.**
  - `mine-view.test.ts`, "each stage says what it moves now, and the pile after it": one worker on drilling, face pile 200. Drilling's `now` is "3/s", and the others are "0/s". Drilling's pile reads `{ label: "Rock at the face", held: 200, holds: 500 }`.
  - `frame-cards.test.ts`, "greets the first evening once": a fresh start shows `first`, its key closes it, and a repaint does not bring it back. A save with an order does not show it.
  - Every new line is checked against the no-advice words test.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** These are the proposed words, which are Flemming's to approve before the merge:
  - Piles: "Rock at the face" (after drilling) and "Rock at the shaft" (after haulage), each as "{held} of {holds}".
  - First card: title "The first evening". Lines: "One worker, on drilling. Rock waits at the face until haulage carries it to the shaft, and at the shaft until hoisting lifts it up as stone." and "Move him between the jobs. Every worker you hire moves more." Key "Start".
- [ ] **Step 4:** `npx vitest run` on both files, then `VISUAL_ONLY='slice frame' npm run visual`, then `npm run play -- --save slice-start`. Read the phone shots. Then `npm run gate -- fast`.
- [ ] **Step 5: Commit** `M15-28: The mine shows its piles, and the first evening has its card`. Save the start shot and the mine shot to `/mnt/project-files/slice-1/build/703-*.png` for the question to Flemming.

### Task 6: The spec's general rule and the docs

**Files:**

- Modify: `docs/superpowers/specs/2026-11-14-slice-1-design.md`:
  - rule 2's opening and 2.5: "the slowest stage sets what the line moves" becomes "over time"; add the general rule as written in #703;
  - rule 2.10 and the Starting numbers: the start, the piles' room, and the night output if changed;
  - What he sees: The mine: the piles;
  - rule 4: the clock stops drilling.
- Modify: `docs/ARCHITECTURE.md` (`piles`, `mine-piles`, the save key), `docs/DESIGN.md` if it carries the fresh mine's numbers, `docs/ui-audit.md` and its shots.

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 3: Commit** `M15-28: The spec says every part runs on its own`.

## Ledger (filled in while building)
