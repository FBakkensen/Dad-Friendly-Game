# The shaft, the Granite and the levels' jobs, off in play (#673) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. When the plan is done, use the ship-sitting skill, not `superpowers:finishing-a-development-branch` directly.

**Goal:** Slice 1's part 3 rules for the mine, behind a new `part3.off` switch that the page never holds: the shaft is bought, the Granite opens with nobody on it, drilling and haulage are jobs on each level, machines belong to a level, saws make cut stone, borers and locomotives cost cut stone, and trucks open with the Warehouse. The phone does not change.

**Architecture:** Part 3 is layered in the way part 2 was (#666, #723): pure rules in the module that owns each thing, one sweep factor in `part-switch`, lab knobs by id through `economy/factors`, new save facts with no version bump. A new leaf, `mine-levels`, holds the Granite as a discriminated union on `Mountain` and the shaft's buy. `workforce` gains the Granite's two jobs and the saws' job and works each level's stages apart. `piles` gains `Branches`, chains side by side that share one stage's rate (hoisting) and one side pile (the stone stockpile), built on the existing `Chain`, and `mine-piles` runs the two levels through it once the Granite is open. With one level open every rule runs today's code path, so parts 1 and 2 stay bit-identical.

**Tech Stack:** TypeScript, Vitest, fast-check, the strategy lab (`src/lab/`, `tools/strategy-lab.ts`), puppeteer visual check, Playwright journeys.

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`: rules 1, 2, 3, 5 (5.1 to 5.4, 5.12, 5.13) and 7, Starting numbers, Calls I made (54 to 73), His two calls, The save. Issue #673. The prototype `prototypes/slice-1/` version 17 plays it.

## Global Constraints

- Prove each task with the ladder in `.claude/rules/dad-friendly-work.md`: the test file (`npx vitest run <file>`), then `npm run gate -- fast`. The full gate runs once, on the PR's final commit.
- `part3.off` reads 1 outside a sweep. `boot` keeps holding only `fresh.off` and `part2.off` at 0, and `tools/journeys/expected.ts` is not changed. With part 3 off, every rule below is inert.
- Starting numbers, verbatim from the spec: "The shaft to the Granite: 10M stone and 1.5M brick", "Saw: 25,000 brick, ×1.219, 30 cut stone a second", "Tunnel borer: 40,000 cut stone, ×1.219, rated 1,071, eight workers", "Locomotive: 60,000 cut stone, ×1.219, rated 1,600, eight workers", "Truck: 150,000 brick, ×1.219, carries 400 goods a second", "level 0 holds ... 250K cut stone", "Recipes: ... 3 rock for 1 cut stone", "The drilled rock, the rock at the shaft: hold 300 rock each".
- Opens (rule 1's table): the Granite's price when the Light Tower is operational; saws, the tunnel borer and the locomotive when the shaft reaches the Granite; trucks when the Warehouse is operational.
- No version bump, no reset: the save stays version 9 and only adds facts (`observable-saves.md`). New facts go in `src/save-format.ts` and the ledger `src/save-ledger.test.ts`. `firestore.rules` does not change.
- No player-facing line. A complete record over a widened id type (a good's name, a job's name, a vehicle's words) takes the word from the spec's approved Names table, and none of them can show while part 3 is off.
- No function in non-test `src` over 150 lines or cognitive complexity 15 (`npm run functions`). No runtime import cycle (`npm run cycles`). Knip clean. Coverage floors stay.
- The pacing ledger (`docs/pacing-ledger.md`) must not move. The full gate's `lab --ci --ledger check` proves it.
- Commit after each task with a plain sentence ending "(#673)", then the session's `Co-Authored-By` and `Claude-Session` lines, and push the branch (`CLAUDE.md`, cloud sessions).

## Rulings (agent-run sitting)

These answer the design questions a brainstorm would ask. Each goes in the PR body under Rulings.

1. **The switch.** `PART_THREE_OFF = "part3.off"` in `part-switch`, beside part 2's. `partThreeOn()` is `partTwoOn() && factor("part3.off") === 0`: part 3 stands on part 2's stockyard and brick.
2. **The Granite is a union on `Mountain`.** `granite: { kind: "unsunk" } | { kind: "sunk"; machines; piles }`, so machines and piles on a level that is not open cannot be written. Its two jobs and the saws' job are ids in the flat `Jobs` record (`graniteDrilling`, `graniteHaulage`, `saws`), so the existing moves (`placeWorker`, `freeWorker`), `jobOpen`, `workersOnJobs`, the lab's taps and the save's `jobs` map carry them with no second mechanism. The save reader refuses workers on them, or saws owned, while the shaft is not sunk.
3. **What he owns stays the count he owns.** `owned` is every machine of a kind on both levels (rule 5.2, call 42): the price, the ownership marks, the doors and the first engineer read it as today. The Granite stores its own count. The Topsoil's is the rest. A buy with `buyTier` is for the Topsoil, and a new move, `buyGraniteMachine`, buys for the Granite. No move takes a machine off a level (call 55).
4. **Hoisting until #724.** One rate for the whole shaft, shared evenly between the levels' rock at the shaft. What one level cannot take (its shaft pile is empty and its haulage brings less) goes to the other. That is "a hoist for both lifts two loads in the time of both trips, one from each level", as rates (rule 5.14), and a level with nothing to lift is left out (rule 5.7). The stone stockpile both levels bypass to is shared in proportion to what each brings. #724 replaces this with cages.
5. **One mechanism.** `piles` stays the one place that moves goods through piles. `Branches` reuses `Chain`, `chainFlows`, `chainSpill` and the phase loop (refactored into an internal `runChain`, so `flowChain` and the branches share it), and the whole-goods floor (refactored into an internal `wholeOf`). The even split is `stockDraw`'s loop, moved to `piles` as `evenShares` and called by both `stockDraw` and `Branches`.
6. **One level is today's path.** While the Granite is not open, `mine-piles` builds today's single `Chain` and calls today's functions, so parts 1 and 2 are bit-identical. The two-level path runs only once the Granite is open.
7. **The Granite's piles.** Its drilled rock and rock at the shaft hold 300 each, and the rock at the saws holds 300 while he owns a saw (the kilns' rule). "Three loads of the largest cage" comes with the cages (#724).
8. **The locomotive is the `train` row.** "Pit train" became "locomotive" in the approved Names. The id stays `train`, which the save's `owned` map has shipped. Its rating in a fresh mine is 1,600 (`FRESH_RATING.train = 1_600 / 1_067` in `line`). The borer is already rated 1,071 (357 × 3). The row's name and `MACHINE_WORDS` change with the screens (#680), not here.
9. **Borers and locomotives in part 3.** Each is in play with part 3's switch and locked (`later`, `granite`) until the shaft is sunk. Each is priced in cut stone, 40,000 and 60,000 on the line's ×1.219 curve, still moved by `price.<id>` and `growth.machine`. With part 3 off, their price and door are today's.
10. **Cut stone.** A good, `cutStone`, from the saws. Its stockpile's room (250K at level 0, ×3 a level, ×2 with the Warehouse) is in `stockpileRoom` only in part 3. `STOCKPILE_GOODS` stays stone and brick: what the frame's stockpiles, the night's `fullAtMs` and the lab's `deadGood` list is the screens' (#680) and the lab's (#675).
11. **The shaft is a purchase** (rule 7.14, call 25): 10M stone and 1.5M brick at once, both lines scaled by a lab factor `price.shaft`. It is not a project.
12. **Trucks.** A vehicle row: 150,000 brick, ×1.219, 400 goods a second, none given. `vehicleOpen` opens it with the Warehouse in part 3. The drivers already take the best carriers first (`BY_LOAD`).
13. **Loading crews** counts the workers on haulage on both levels (`haulageWorkers`, rule 5.2).
14. **The log.** Sinking logs `shaft.sink` (`{ id: "granite" }`). A machine bought for the Granite logs `granite.buy` (`{ id, count }`, the count on the Granite), since the field log takes at most two data keys. The Ledger skips a code it cannot word, so no line of copy is needed.
15. **Rule 5.13** (clay and iron from the rock) is the factory's (#674). Nothing in this sliver uses a material.
16. **Rule 1.6** (upgrade and promotion prices scale with the deepest level) is not in #673's done-when. It is a pacing lever, so it goes with the lab's part 3 numbers (#675). A fresh mine's layer stays the Topsoil, so the rock's lean cannot come back (call 67).
17. **The lab.** No new knob list. `price.saw`, `recipe.saw` and `price.shaft` come by id, like the kiln's. The new moves have no income in `valueOf` (payback Infinity), as the kiln and the wagon had before their lab. The strategy lab's part 3 is #675.
18. **The steady line with two levels** (`crewPerSecond`, what an order and the lab read) is the lesser of hoisting and the two levels' slowest stages added together. With one level it is today's slowest stage.

No question here is Flemming's: no product call, no line of copy, no art and no guardrail. None is open.

## Review Focus

1. **A part 2 save on the phone today** (no `granite` key) reads as unsunk and writes the same game map as before, with no `granite` key. Test in Task 9.
2. **A save with the shaft sunk, opened with part 3 off** (every page today): it reads, the Topsoil plays exactly as part 2, the Granite's piles are not touched, and it writes back unchanged. Tests in Tasks 8 and 9.
3. **A worker on a job that is closed** (a Granite job with part 3 off): he can always be taken off, free (the anti-goal "a lock"). Test in Task 2.
4. **A full stone stockpile that nothing drains, with both levels bypassing to it:** it never grows, and the rock waits in the piles. Property in Task 7.
5. **A Granite machine he cannot pay for:** refused, nothing changes, neither `owned` nor the Granite's count. Test in Task 10.

---

### Task 1: The switch, the Granite and the shaft

**Files:**

- Modify: `src/part-switch.ts` (add `PART_THREE_OFF`, `partThreeOn`)
- Create: `src/mine-levels.ts`
- Modify: `src/mountain.ts` (`Mountain.granite`, `BARE_MOUNTAIN.granite: UNSUNK`, added after `rockDug` to stay clear of #728's edits)
- Test: `src/mine-levels.test.ts` (create), `src/boot.test.ts`

**Interfaces:**

- Produces (`part-switch`): `PART_THREE_OFF = "part3.off"`; `partThreeOn(): boolean`.
- Produces (`mine-levels`):
  - `MINE_LEVEL_IDS = ["topsoil", "granite"] as const`; `type MineLevelId`.
  - `LEVEL_MACHINE_IDS = ["cart", "drill", "borer", "train"] as const satisfies readonly MachineId[]` (drilling's and haulage's machines, tier order); `type LevelMachineId`; `type LevelMachines = Readonly<Record<LevelMachineId, number>>`; `NO_LEVEL_MACHINES`.
  - `GRANITE_PILE_IDS = ["face", "shaft", "saw"] as const`; `type GranitePileId`; `type GranitePiles = Readonly<Record<GranitePileId, number>>`; `NO_GRANITE_PILES`.
  - `type Granite = { readonly kind: "unsunk" } | { readonly kind: "sunk"; readonly machines: LevelMachines; readonly piles: GranitePiles }`; `UNSUNK: Granite`.
  - `shaftPrice(): Price`: `[{ good: "stones", amount: 10_000_000 }, { good: "brick", amount: 1_500_000 }]`, each `Math.ceil(amount * factor("price.shaft"))`.
  - `shaftOpen(mountain: Pick<Mountain, "operational" | "granite">): boolean`: it can be sunk now: `partThreeOn()`, the Light Tower operational, and unsunk.
  - `graniteOpen(mountain: Pick<Mountain, "granite">): boolean`: `partThreeOn()` and sunk.
  - `sinkShaft(mountain: Mountain): Mountain`: the same object unless `shaftOpen` and `pay` covers `shaftPrice()`; then `granite: { kind: "sunk", machines: NO_LEVEL_MACHINES, piles: NO_GRANITE_PILES }`. Jobs and `owned` are untouched.
  - `levelMachines(mountain: Pick<Mountain, "owned" | "granite">, level: MineLevelId): LevelMachines`: the Granite's own counts while `graniteOpen`, else none; the Topsoil's are `owned[id]` less the Granite's.
- `mine-levels` imports `Mountain` as a type only, and at runtime only `part-switch`, `economy/factors` and `stock`, so nothing that imports it can make a cycle.

- [ ] **Step 1: Write the failing tests** in `src/mine-levels.test.ts`, with `partThree = withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body)` and `partTwo` as in `part-two.test.ts`:

```ts
describe("part 3's switch (#673)", () => {
  it("is off outside a sweep, and on only with fresh.off, part2.off and part3.off at 0", () => {
    expect(partThreeOn()).toBe(false);
    partTwo(() => expect(partThreeOn()).toBe(false));
    partThree(() => expect(partThreeOn()).toBe(true));
    withFactors({ [FRESH_OFF]: 0, [PART_THREE_OFF]: 0 }, () =>
      expect(partThreeOn()).toBe(false),
    );
  });
});

describe("the shaft (rule 1.3, 1.4, 5.4)", () => {
  // lit(stock) = createMountain() with the Light Tower operational and this stock
  it("can be sunk once the Light Tower is operational, in part 3 only", () => {
    /* shaftOpen: true lit; false unlit; false under partTwo; false once sunk */
  });
  it("costs 10M stone and 1.5M brick, and opens the Granite with nobody and nothing on it", () => {
    partThree(() => {
      const before = lit({ stones: 10_000_005, brick: 1_500_000 });
      const after = sinkShaft(before);
      expect(after.stock.stones).toBe(5);
      expect(after.stock.brick).toBe(0);
      expect(after.granite).toEqual({
        kind: "sunk",
        machines: NO_LEVEL_MACHINES,
        piles: NO_GRANITE_PILES,
      });
      expect(after.jobs).toEqual(before.jobs);
      expect(after.owned).toEqual(before.owned);
    });
  });
  it("refuses with too little of either good, a second time, before the Light Tower, and with part 3 off", () => {
    /* each toBe(same object) */
  });
  it("starts every fresh mine unsunk", () => {
    expect(createMountain().granite).toEqual(UNSUNK);
  });
});

describe("a level's machines (rule 5.2, 5.3)", () => {
  it("puts every machine on the Topsoil while one level is open", () => {
    /* owned cart 3 → topsoil cart 3, granite all 0 */
  });
  it("gives the Topsoil what he owns less the Granite's", () => {
    /* owned borer 3, granite borer 2 → topsoil 1, granite 2 */
  });
  it("reads none on the Granite with part 3 off, whatever the save holds", () => {
    /* sunk granite, partTwo → topsoil = owned */
  });
});
```

In `src/boot.test.ts`, beside "plays part 2 on every boot":

```ts
it("keeps part 3 off on every boot (#673)", async () => {
  for (const devMode of [true, false]) {
    holdFactors({});
    const { progress } = await createAppServices({
      env: {},
      search: "",
      devMode,
    });
    expect(partThreeOn()).toBe(false);
    progress.dispose();
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/mine-levels.test.ts src/boot.test.ts`
Expected: FAIL, `mine-levels` and `partThreeOn` do not exist.

- [ ] **Step 3: Implement** the switch, `mine-levels` and `Mountain.granite` as the Interfaces say. `tsc` lists every literal `Mountain` that now lacks `granite` (test fixtures that spread `createMountain()` or `BARE_MOUNTAIN` need nothing).

- [ ] **Step 4: Run them to see them pass**, then `npm run gate -- fast`.

Run: `npx vitest run src/mine-levels.test.ts src/boot.test.ts && npm run gate -- fast`
Expected: PASS, and every gate line OK.

- [ ] **Step 5: Commit and push**: `git add src/part-switch.ts src/mine-levels.ts src/mine-levels.test.ts src/mountain.ts src/boot.test.ts` and any fixture `tsc` named; message "The shaft and the Granite, off in play behind part 3's switch (#673)".

---

### Task 2: The Granite's two jobs

**Files:**

- Modify: `src/workforce.ts` (`JOB_IDS`, `NO_JOBS`, `jobOpen`, `LEVEL_JOBS`, `haulageWorkers`)
- Modify: `src/mountain.ts` (`FRESH_START_JOBS` gains the zeros)
- Modify: `src/upgrades.ts` (`synergyBonus`), `src/screen-words.ts` (`synergyFed`): Loading crews reads `haulageWorkers`
- Modify: `src/workforce-view.ts` (`JOB_NAMES` gains `graniteDrilling: "Drilling"`, `graniteHaulage: "Haulage"`; `SITE_JOBS` is not changed, so the sheet shows nothing new)
- Test: `src/workforce.test.ts`, and every test `tsc` names for a complete `Jobs` literal

**Interfaces:**

- Consumes: `graniteOpen`, `MineLevelId` (Task 1).
- Produces:
  - `JOB_IDS` = `["drilling", "haulage", "hoisting", "driving", "building", "kilns", "graniteDrilling", "graniteHaulage"]`. `drilling` and `haulage` stay the Topsoil's: they are shipped ids.
  - `type LevelStage = Exclude<Stage, "lift">`.
  - `LEVEL_JOBS: Readonly<Record<MineLevelId, Readonly<Record<LevelStage, JobId>>>>` = `{ topsoil: { face: "drilling", haul: "haulage" }, granite: { face: "graniteDrilling", haul: "graniteHaulage" } }`. `STAGE_JOB` stays as it is (the Topsoil's and hoisting).
  - `jobOpen(mountain: Pick<Mountain, "operational" | "granite">, job: JobId): boolean`: the Granite's two with `graniteOpen`, the kilns as today, the rest from the first evening.
  - `haulageWorkers(mountain: Pick<Mountain, "jobs">): number`: `jobs.haulage + jobs.graniteHaulage`.

- [ ] **Step 1: Write the failing tests** in `src/workforce.test.ts`, with a `partThree` helper and a `sunk(mountain)` helper that sets `granite` to the sunk union:

```ts
it("has the five jobs of part 1, the kilns of part 2 (#666), and the Granite's two (#673)", () => {
  expect(JOB_IDS).toEqual([
    "drilling",
    "haulage",
    "hoisting",
    "driving",
    "building",
    "kilns",
    "graniteDrilling",
    "graniteHaulage",
  ]);
});
it("opens the Granite's drilling and haulage with the shaft, in part 3 only (rule 5.1)", () => {
  // jobOpen(unsunk, "graniteDrilling") false; jobOpen(sunk, ...) true under partThree, false under partTwo
});
it("lists the Granite's moves once the shaft is sunk, and none before", () => {
  // listActions(...).filter(placeWorker) contains { kind: "placeWorker", job: "graniteHaulage", count: 1 } only when sunk
});
it("never changes how many workers he has, with the Granite's jobs too (#673)", () => {
  // the existing property, run under partThree on a sunk crew, jobs drawn from all JOB_IDS
});
it("takes a worker off a Granite job even while it is closed: no lock", () => {
  // partTwo, jobs.graniteDrilling 2: freeWorker(…, "graniteDrilling").jobs.graniteDrilling === 1, and listActions has its freeWorker move
});
it("counts haulage's workers on both levels for Loading crews (rule 5.2)", () => {
  // with Loading crews bought, synergyBonus with haulage 2 + graniteHaulage 3 equals synergyBonus with haulage 5
});
```

- [ ] **Step 2: Run them to see them fail**: `npx vitest run src/workforce.test.ts`. Expected: FAIL on the job list and the new ids.

- [ ] **Step 3: Implement** as the Interfaces say. Add `graniteDrilling: 0, graniteHaulage: 0` to `NO_JOBS`, `FRESH_START_JOBS` and each complete `Jobs` literal `tsc` names (`test-fixtures.ts`, the part tests, `tools/browser/fixtures.ts` if it has one).

- [ ] **Step 4: Run them to see them pass**: `npx vitest run src/workforce.test.ts src/upgrades.test.ts src/screen-words.test.ts src/workforce-view.test.ts && npm run gate -- fast`. Expected: PASS.

- [ ] **Step 5: Commit and push**: "The Granite's drilling and haulage are jobs in the workforce, off in play (#673)".

---

### Task 3: Each level's work

**Files:**

- Modify: `src/workforce.ts` (`stageMachines`, `stageWorks`, new `levelWorks`, `LineWork`, `lineWork`)
- Test: `src/workforce.test.ts`

**Interfaces:**

- Consumes: `levelMachines`, `graniteOpen`, `MineLevelId`, `MINE_LEVEL_IDS` (Task 1); `LEVEL_JOBS`, `LevelStage` (Task 2).
- Produces:
  - `stageMachines(mountain: Pick<Mountain, "owned" | "granite">, speed, stage: Stage, level: MineLevelId = "topsoil"): StageMachine[]`: for drilling and haulage the counts are `levelMachines(mountain, level)`; for hoisting, `owned`.
  - `stageWorks(mountain: Pick<Mountain, "owned" | "jobs" | "granite">, speed)`: as today, the Topsoil's drilling and haulage and the shaft's hoisting.
  - `levelWorks(mountain, speed, level: MineLevelId): Readonly<Record<LevelStage, StageWork>>`: that level's two stages with `LEVEL_JOBS[level]` workers and that level's machines.
  - `type LevelStages = Readonly<Record<LevelStage, number>>`; `LineWork` gains `readonly levels: Readonly<Record<MineLevelId, LevelStages>>`. `stages` keeps the Topsoil's `face` and `haul` and the shaft's `lift`. `running` and `short` add the Granite's machines and tools.
  - `lineWork(...).line`: while the Granite is not open, `Math.min(stages.face, stages.haul, stages.lift)` exactly as today; once open, `Math.min(stages.lift, min(topsoil.face, topsoil.haul) + min(granite.face, granite.haul))` (ruling 18). The Granite's stages are 0 while it is not open.
- `rates`' `workforceRun` needs no change: it reads `line`, `running` and `short`. Upgrades, gear, an engineer and trouble act on the tier speed, which both levels read, so they count on both (rule 5.2).

- [ ] **Step 1: Write the failing tests** in `src/workforce.test.ts`, in a new `describe("each level's work (rule 5.1, 5.2, #673)")`:

```ts
it("runs a level's machines with that level's workers of that stage only", () => {
  // sunk, one drill on the Granite, three on Topsoil drilling, none on Granite drilling:
  // levels.granite.face === 0, levels.topsoil.face === 3 * toolSpeed(speed)
});
it("moves both levels' machines of a kind at the one tier speed", () => {
  // a drill with its workers on each level: levels.topsoil.face === levels.granite.face === speed.drill
});
it("lifts what hoisting lifts or both levels' slowest stages together, whichever is less", () => {
  // line === Math.min(stages.lift, min(T.face, T.haul) + min(G.face, G.haul))
});
it("is part 2's line while the Granite is not open", () => {
  // unsunk under partThree and any mountain under partTwo: line, stages, running, short equal today's; levels.granite is { face: 0, haul: 0 }
});
it("never moves less on a level with one more machine or worker there, and never changes the other level (#673)", () => {
  fc.assert(fc.property(/* workers per level job and hoisting 0..12, level machines 0..3 each */, (setup) => {
    // for each level L and stage s in face/haul:
    //   one more on LEVEL_JOBS[L][s]: levels[L][s] does not fall, the other level's stages are unchanged
    //   one more machine of a kind of s on L (owned + 1, and the Granite's count + 1 for the Granite): the same
    // one more hoisting worker or hoist: stages.lift does not fall
  }));
});
```

- [ ] **Step 2: Run them to see them fail**: `npx vitest run src/workforce.test.ts`. Expected: FAIL, `levels` and `levelWorks` do not exist.

- [ ] **Step 3: Implement** as the Interfaces say. Keep `lineWork` under the function limits: one helper adds a stage work into `running`, one works out `line`.

- [ ] **Step 4: Run them to see them pass**: `npx vitest run src/workforce.test.ts src/rates.test.ts src/mine-view.test.ts src/lab/fresh-dad.test.ts && npm run gate -- fast`. Expected: PASS, every existing test unchanged.

- [ ] **Step 5: Commit and push**: "Drilling and haulage work on each level with that level's workers and machines (#673)".

---

### Task 4: Cut stone and the saws

**Files:**

- Modify: `src/stock.ts` (`GoodId` adds `"cutStone"`, `GOOD_ROWS` adds `{ id: "cutStone", from: "saws" }`, `GoodRow.from` adds `"saws"`, `EMPTY_STOCK`, `addedStock`)
- Modify: `src/frame-view.ts` (`GOOD_NAMES.cutStone = "Cut stone"`), `src/shift-report-view.ts` (`GOOD_WORDS.cutStone = "cut stone"`)
- Modify: `src/stockyard.ts` (cut stone's room in part 3)
- Modify: `src/makers.ts` (the saw row, `job` on each row, `makerOpen`, `runningMakers`, `makerRate`)
- Modify: `src/workforce.ts` (`JOB_IDS` adds `"saws"`, `jobOpen` opens it with `makerOpen(mountain, "saw")`), `src/workforce-view.ts` (`JOB_NAMES.saws = "Saws"`), `src/mountain.ts` (`FRESH_START_JOBS.saws: 0`)
- Modify: `src/economy/actions.ts` (`yardActions` lists each maker by `makerOpen`)
- Test: `src/stock.test.ts`, `src/stockyard.test.ts`, `src/makers.test.ts`, `src/workforce.test.ts`, create `src/part-three-moves.test.ts`; `tsc` names each complete `Stock`, `Jobs` or `makers` literal (`makers: { kiln: N }` gains `saw: 0`)

**Interfaces:**

- Consumes: `graniteOpen` (Task 1).
- Produces:
  - `MakerRow.job: JobId` (`import type`, so no cycle): `kiln` → `"kilns"`, `saw` → `"saws"`.
  - The saw row: `{ id: "saw", name: "Saw", good: "brick", firstCost: 25_000, growth: LINE_MACHINE_COST_GROWTH, makes: 30, output: "cutStone", takes: 3, job: "saws" }`.
  - `makerOpen(mountain: Pick<Mountain, "operational" | "granite">, id: MakerId): boolean`: the kiln by `makersOpen` as today; the saw by `graniteOpen`. `makersOpen` stays (the refinery opens with it).
  - `buyMaker` refuses a maker that is not `makerOpen`.
  - `runningMakers(mountain: Pick<Mountain, "makers" | "jobs">, id: MakerId): number` = `Math.min(makers[id], jobs[row.job])`; `makerRate(mountain, id)` = running × `makerMakes(id)`. `runningKilns` and `kilnRate` stay, as these with `"kiln"`.
  - `stockpileRoom(mountain, "cutStone")`: 250,000 × `room.stockyard` × 3 a level × what the buildings give, only while `partThreeOn()`, Infinity otherwise. A private `PART_THREE_ROOM = { cutStone: 250_000 }` beside `ROOM_AT_ZERO`. `STOCKPILE_GOODS` does not change (ruling 10).
  - `JOB_IDS` ends `..., "graniteDrilling", "graniteHaulage", "saws"`.

- [ ] **Step 1: Write the failing tests:**

```ts
// stock.test.ts: the goods table lists ..., "brick", "cutStone", and cut stone comes from the saws
// stockyard.test.ts
it("holds 250K cut stone at level 0 in part 3, three times as much a level, twice with the Warehouse; none before", () => {
  // partThree, Light Tower: stockpileRoom(m, "cutStone") === 250_000; stockyard 1 → 750_000; Warehouse too → 1_500_000
  // partTwo: Infinity; STOCKPILE_GOODS still ["stones", "brick"]
});
// makers.test.ts, describe("the saws (#673)")
it("prices a saw at 25,000 brick on a machine's curve, ×1.219", () => {
  // makerPrice(makers.saw 0) → [{ good: "brick", amount: 25_000 }]; makers.saw 1 → 30_475
});
it("makes 30 cut stone a second from three rock each", () => {
  /* makerMakes("saw") 30, makerTakes("saw") 3 */
});
it("opens with the Granite in part 3 only; the kilns as before", () => {
  /* makerOpen saw: sunk+partThree true, unsunk false, partTwo false */
});
it("refuses a saw before the shaft, and buys one with the brick once it is sunk", () => {});
it("runs a saw only with a worker on the saws' job (rule 2.7)", () => {
  // makers.saw 3, jobs.saws 2: runningMakers 2, makerRate 60
});
// workforce.test.ts: the JOB_IDS list ends with "saws"; jobOpen(…, "saws") follows makerOpen(…, "saw")
// part-three-moves.test.ts, describe("part 3's buys as moves (#673)")
it("lists a saw beside the kiln once the shaft is sunk, and only the kiln before", () => {
  // yardMoves(sunk) === [KILN, SAW, EXPAND]; yardMoves(unsunk) and yardMoves under partTwo === [KILN, EXPAND]
});
```

- [ ] **Step 2: Run them to see them fail**: `npx vitest run src/stock.test.ts src/stockyard.test.ts src/makers.test.ts src/workforce.test.ts src/part-three-moves.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** as the Interfaces say. `yardActions` becomes `MAKER_IDS.filter((id) => makerOpen(mountain, id))`, which keeps the kiln-then-expand order part 2's snapshot pins.

- [ ] **Step 4: Run them to see them pass**: the same files, then `npm run gate -- fast`. Expected: PASS; `src/economy/__snapshots__/actions.test.ts.snap` does not change.

- [ ] **Step 5: Commit and push**: "Saws make cut stone from three rock each, off in play (#673)".

---

### Task 5: Borers and locomotives for a level

**Files:**

- Modify: `src/tiers.ts` (`tierInPlay`, the part 3 prices, `tierGood`, `tierCost`, `tierPrice`, `tierQuote`)
- Modify: `src/crew.ts` (`freshLock` takes the mountain)
- Modify: `src/line.ts` (`FRESH_RATING.train`)
- Modify: `src/mine-levels.ts` (`withGraniteMachine`)
- Test: `src/tiers.test.ts`, `src/mine-levels.test.ts`

**Interfaces:**

- Consumes: `partThreeOn` (Task 1), `graniteOpen` (Task 1), `cutStone` (Task 4).
- Produces:
  - `tierInPlay(tier)`: in a fresh mine, a door of kind `later` at `"granite"` is in play while `partThreeOn()`. The Foundry's and the School's stay out.
  - `tierLock(mountain, tier)` in a fresh mine (`freshLock(mountain, tier)`): `{ kind: "later", at }` for a `later` door, unless the door is the Granite's and `graniteOpen(mountain)`.
  - A private `PART_THREE_PRICE: Readonly<Partial<Record<TierId, { readonly good: GoodId; readonly first: number }>>>` = `{ borer: { good: "cutStone", first: 40_000 }, train: { good: "cutStone", first: 60_000 } }`.
  - `tierGood(id: TierId): GoodId`: that row's good while `partThreeOn()`, else `"stones"`.
  - `tierCost`: on the line the sticker is the part 3 first price while `partThreeOn()`, else `LINE_FIRST_COST[id] ?? firstCost` as today; growth and factors as today.
  - `tierPrice` (private) prices in `tierGood(id)`; `tierQuote`'s Max reads `mountain.stock[tierGood(tier.id)]`.
  - `FRESH_RATING` = `{ cart: 10, train: 1_600 / 1_067 }`, with the comment: the locomotive is rated 1,600 (Starting numbers).
  - `withGraniteMachine(mountain: Mountain, id: LevelMachineId): Mountain`: one more on the Granite while it is sunk, the same object otherwise. It pays nothing: the move (Task 10) buys first through `buyCrew`.

- [ ] **Step 1: Write the failing tests** in `src/tiers.test.ts`, `describe("part 3's machines (#673)")`:

```ts
it("leaves the borer and the locomotive out of play until part 3, and locks them until the shaft is sunk", () => {
  // partTwo: tierInPlay(borer) false; partThree unsunk: true, tierLock → { kind: "later", at: "granite" }; sunk: undefined
  // the winding engine and kids stay out in part 3
});
it("prices them in cut stone: 40,000 and 60,000, ×1.219", () => {
  // partThree, sunk, cutStone 40_000: buyCrew(m, "borer") owns 1 borer, cutStone 0, stones unchanged
  // tierCost(borer, 1) === 48_760; tierQuote(m with cutStone 100_000, train, "max") → { count: 1, cost: 60_000 }
});
it("rates the borer 1,071 and the locomotive 1,600, each with eight workers", () => {
  // effectiveRates(fresh part 3 mountain).tierSpeed.borer ≈ 1_071, .train ≈ 1_600 (toBeCloseTo); tierById(…).staff === 8
});
it("counts that kind on both levels for its price and marks", () => {
  // owned borer 3 with 2 on the Granite: the next borer's price is tierCost(borer, 3)
});
it("keeps today's price and door with part 3 off", () => {
  /* partTwo: tierCost(borer, 0) unchanged; tierInPlay false */
});
```

In `src/mine-levels.test.ts`:

```ts
it("puts a machine bought for the Granite there, where it stays (rule 5.2, call 55)", () => {
  // sunk, owned borer 1 (the buy): withGraniteMachine → granite borer 1, levelMachines topsoil borer 0
  // unsunk: same object
});
```

- [ ] **Step 2: Run them to see them fail**: `npx vitest run src/tiers.test.ts src/mine-levels.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** as the Interfaces say.

- [ ] **Step 4: Run them to see them pass**: `npx vitest run src/tiers.test.ts src/mine-levels.test.ts src/crew.test.ts src/rates.test.ts src/fresh-mine.test.ts && npm run gate -- fast`. Expected: PASS.

- [ ] **Step 5: Commit and push**: "Borers and locomotives open with the Granite and cost cut stone, off in play (#673)".

---

### Task 6: Trucks

**Files:**

- Modify: `src/transport.ts` (the truck row, `vehicleOpen`, `buyVehicle`)
- Modify: `src/economy/actions.ts` (`orderActions` lists open vehicles only)
- Modify: `src/city-view.ts` (`vehicleKeys`), `src/next-view.ts` (`siteCounts`), `src/lab/fresh-view.ts` (`cheapestBuy`): each reads only open vehicles
- Modify: `src/screen-words.ts` (`VEHICLE_WORDS.truck = ["truck", "trucks"]`, `VEHICLE_KEYS.truck = ["Truck", "Trucks"]`)
- Test: `src/transport.test.ts`, `src/part-three-moves.test.ts`, `src/city-view.test.ts`, `src/lab/fresh-view.test.ts`; `fleet: { horseWagon: N }` literals gain `truck: 0`

**Interfaces:**

- Consumes: `partThreeOn` (Task 1).
- Produces:
  - The truck row: `{ id: "truck", name: "Truck", good: "brick", firstCost: 150_000, growth: 1.219, carries: 400, given: 0 }`.
  - `vehicleOpen(mountain: Pick<Mountain, "operational">, id: VehicleId): boolean`: the horse wagon always; the truck while `partThreeOn()` and the Warehouse is operational.
  - `buyVehicle` refuses a vehicle that is not open.
- `cheapestBuy` must skip a closed truck: without it, a wagon past about the 28th would make the truck the cheapest buy and move the lab's `starved` measure, and with it the ledger.

- [ ] **Step 1: Write the failing tests:**

```ts
// transport.test.ts, describe("trucks (#673)")
it("cost 150,000 brick, ×1.219, carry 400 a second, and none is given", () => {});
it("open with the Warehouse in part 3 only", () => {
  /* vehicleOpen and buyVehicle: refused before; bought for brick after */
});
it("take the drivers first (rule 2.7)", () => {
  /* a truck and a wagon, one driver: fleetRate === 400 */
});
// part-three-moves.test.ts
it("lists a truck once the Warehouse is operational in part 3, and never in part 2", () => {});
// city-view.test.ts
it("shows no truck key with part 3 off, even with the Warehouse operational", () => {
  // partTwo, operational ["lightTower", "warehouse"]: vehicleKeys(…).map(k => k.id) === ["horseWagon"]
});
// lab/fresh-view.test.ts
it("leaves a closed truck out of the cheapest buy", () => {
  /* partTwo, 40 wagons: cheapestBuy is not 150_000 */
});
```

- [ ] **Step 2: Run them to see them fail**: `npx vitest run src/transport.test.ts src/part-three-moves.test.ts src/city-view.test.ts src/lab/fresh-view.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** as the Interfaces say.

- [ ] **Step 4: Run them to see them pass**, then `npm run gate -- fast`.

- [ ] **Step 5: Commit and push**: "Trucks open with the Warehouse, off in play (#673)".

---

### Task 7: Chains side by side (`src/piles.ts`)

**Files:**

- Modify: `src/piles.ts`
- Modify: `src/transport.ts` (`stockDraw` calls `evenShares`)
- Test: `src/piles.test.ts`

**Interfaces:**

- Produces:
  - `evenShares(capacity: number, wants: readonly number[]): number[]`: in the input's order. The indices with a want above 0, sorted by `(a, b) => wants[a] - wants[b]` (the comparator `stockDraw` uses, so its order, Infinity ties included, is unchanged), each take `Math.min(want, left / (count - at))`. That is `stockDraw`'s loop. `stockDraw` keeps its filter, then sets each good's draw from `evenShares(rate, goods.map(gives))`. The arithmetic is the same, so its takes are bit-identical.
  - `type SidePile = Pile & { readonly drain: number }`. `Spill` becomes `SidePile & { readonly from: number }`.
  - `type Branch = Omit<Chain, "spill"> & { readonly spillFrom: number }`.
  - `type Branches = { readonly branches: readonly Branch[]; readonly shared: { readonly stage: number; readonly rate: number }; readonly side: SidePile }`. Each branch's own rate at `shared.stage` is ignored.
  - `branchChains(set: Branches): readonly Chain[]`: the chains as they run until the next change:
    1. Each branch's want is its flow at `shared.stage` (`chainFlows`) with the whole shared rate and the whole side pile.
    2. The shares are `evenShares(shared.rate, wants)`.
    3. Each branch's weight is its `chainSpill` at its share with a side pile of no limit (`{ held: 0, holds: Infinity, drain: 0 }`), over all of them together. With none spilling, each weight is `1 / branches.length`.
    4. Each chain is the branch at its share with `spill: { from: spillFrom, held: side.held * w, holds: side.holds === Infinity ? Infinity : side.holds * w, drain: side.drain * w }`.
       So each chain's part of the side pile fills when the whole one does, and a full side pile's drain is shared by what each brings.
  - `branchesChange(set: Branches): number`: the least `chainChange` of `branchChains(set)`.
  - `branchesSettled(set: Branches, within: number): { readonly set: Branches; readonly after: number }`: as `chainSettled`, phase by phase over `branchChains`.
  - `flowBranchesWhole(set: Branches, seconds: number): readonly ChainFlow[]`: one `ChainFlow` per branch, in order. It is exact in phases: each phase splits again with `branchChains`, steps every chain by the least change through `runChain`, and sets the side pile to the sum of the chains' parts, snapped to its edges. Then each branch is floored by `wholeOf` against the real side pile, with the room the branches before it already took.
  - Internal refactors, with no change in behaviour: `runChain(chain, seconds): { flow: ChainFlow; state: Chain }` is `flowChain`'s phase loop, and `flowChain` returns its `flow`. `wholeOf(chain, exact: ChainFlow): ChainFlow` is `flowWhole`'s floor, and `flowWhole` is `wholeOf(chain, flowChain(chain, seconds))`.
  - The phase bound for a set is `8 * Σ (branch.rates.length + 3)`.

- [ ] **Step 1: Write the failing tests** in `src/piles.test.ts`, `describe("chains side by side (#673)")`. Two branches: `[dig, haul, lift, make, draw]` with piles `[face, shaft, makerPile, stockpile]`, `spillFrom: 2`, `shared.stage: 2`.

```ts
it("shares out evenly: never above a want, never above the capacity, and the rest to the others", () => {
  expect(evenShares(100, [10, Infinity, 0])).toEqual([10, 90, 0]);
  expect(evenShares(100, [80, 80])).toEqual([50, 50]);
  expect(evenShares(0, [5, 5])).toEqual([0, 0]);
});
it("shares the stage's rate evenly, and what one branch cannot use goes to the other", () => {
  // A: shaft empty, haul 100; B: shaft full; rate 600 → lifts [100, 500]
});
it("leaves the whole rate to a branch when the other has nothing to lift", () => {});
it("fills one side pile from both: it is full when their spills together fill it", () => {
  // branchesChange === (holds - held) / (spillA + spillB - drain)
});
it("shares a full side pile's drain by what each branch brings", () => { /* the chains' spills add up to the drain */ });
it("flows one branch as the chain it is", () => {
  // for a few chains: flowBranchesWhole of one branch equals flowWhole of the chain (moved, piles, spilled)
});
it("settles past the changes in its first second, and says when the last came", () => {});
it("in whole goods, makes and loses nothing, lifts no more than the shared rate, and fills no side pile with no drain past its room", () => {
  fc.assert(fc.property(/* two branches: rates, piles held/holds, takes 1..3, side held/holds/drain, seconds 1..3600 */, (set, seconds) => {
    // per branch: piles after === piles before + moved[i] − take[i+1] * moved[i+1], with the spill out of spillFrom
    // Σ moved[shared.stage] <= shared.rate * seconds + 1e-6
    // drain 0 and held <= holds: held + Σ spilled <= holds
  }));
});
```

Also run the existing transport tests unchanged: they pin `stockDraw` through `evenShares`.

- [ ] **Step 2: Run them to see them fail**: `npx vitest run src/piles.test.ts`. Expected: FAIL, `evenShares` and the branch functions do not exist.

- [ ] **Step 3: Implement** as the Interfaces say. First the two internal refactors with the suite green, then `evenShares` and `stockDraw`, then the branches. Keep each function under the limits.

- [ ] **Step 4: Run them to see them pass**: `npx vitest run src/piles.test.ts src/transport.test.ts src/building-site.test.ts src/part-two.test.ts src/part-two-stretches.test.ts && npm run gate -- fast`. Expected: PASS, the existing tests unchanged.

- [ ] **Step 5: Commit and push**: "Chains side by side share hoisting and the stone stockpile, in the one piles module (#673)".

---

### Task 8: The mine with two levels (`src/mine-piles.ts`)

**Files:**

- Modify: `src/mine-piles.ts`
- Modify: `src/mountain.ts` (`accrueMine` calls `mineMakes`; `workStretch` calls `mineSettled`: about six lines)
- Test: create `src/part-three.test.ts`

**Interfaces:**

- Consumes: `Branches`, `branchChains`, `branchesSettled`, `branchesChange`, `flowBranchesWhole`, `chainFlows`, `chainSpill` (Task 7); `lineWork(...).levels` (Task 3); `makerRate`, `makerTakes` (Task 4); `stockpileRoom(…, "cutStone")` (Task 4); `graniteOpen` (Task 1).
- Produces:
  - `GRANITE_PILE_HOLDS: GranitePiles` = `{ face: 300, shaft: 300, saw: 300 }`.
  - `makerHolds(mountain: Pick<Mountain, "makers">, id: MakerId): number`: `PILE_HOLDS.kiln` (300) while he owns one, 0 otherwise. `kilnHolds` is it with `"kiln"`.
  - A private `mineBranches(mountain, pay, drilling, draw: Partial<Stock>): Branches`. The Topsoil's branch is today's chain (`face`, `shaft`, `kiln` piles, the kilns, `draw.brick`). The Granite's branch has `granite.piles.face`, `granite.piles.shaft` and `granite.piles.saw` (holds `makerHolds(…, "saw")`), the saws at `makerRate(…, "saw")`, and the cut stone stockpile (`stockpileRoom(…, "cutStone")`, drained at `draw.cutStone`). Both take their maker's recipe at the maker stage. `shared` is hoisting (stage 2) at `stages.lift * pay`. `side` is the stone stockpile, drained at `draw.stones`. Drilling is 0 on both while `drilling` is false.
  - The cache `stagesOf` keeps `{ stages, levels }` per `Rates`.
  - Each of these reads the two-level path once `graniteOpen(mountain)`, and today's code exactly otherwise:
    - `flowMine(mountain, seconds, pay, drilling)`: the same result shape. `mined` is what hoisting lifted from both levels. `gained` is `{ stones: Σ spilled, brick, cutStone }`. `rockDug` grows by both levels' drilling. The Topsoil's piles go in `piles` and the Granite's in `granite.piles`.
    - `mineChange`, `mineMoves` and `takeIncome`: the same signatures. Two-level income is `{ stones: Σ chainSpill, brick: Topsoil maker flow, cutStone: Granite maker flow }`.
    - `mineMakes(mountain: Mountain, pay: number): boolean`: today's `chainMakes(mineChain(mountain, pay, true))`.
    - `mineSettled(mountain: Mountain, pay: number, drilling: boolean): { readonly income: Partial<Stock>; readonly change: number }`: today's `chainSettled(mineChain(...), 1)`, its `chainIncome`, and `after + chainChange(settled.chain)`.
  - `mineChain` and `steadyIncome` stay one-level (the Topsoil as part 2 has it). The mine's screens read them, and the screens are #680. The lab's planner reads `steadyIncome`, and the lab is #675.

- [ ] **Step 1: Write the failing tests** in `src/part-three.test.ts`, with a `levels(setup)` helper in the style of `part-two.test.ts`'s `works`: the Light Tower operational, the Granite sunk, workers on each level's two jobs and on hoisting, kilns and saws with their workers, and the piles.

```ts
describe("the Granite's rock (rules 3 and 5, #673)", () => {
  it("goes to the saws first, three rock for a cut stone, and the rest bypasses to stone", () => {});
  it("stays where it is with nobody on the Granite, and the Topsoil works as in part 2", () => {
    // the Granite's piles unchanged after an hour; the Topsoil's stone, brick and piles as a one-level part 2 mine with the same workers
  });
  it("lifts from both levels' rock at the shaft, and what one cannot use goes to the other (ruling 4)", () => {});
  it("stops the saws at a full cut stone stockpile, and their rock then bypasses to stone", () => {});
  it("moves no worker and no machine by itself, live or in a night (rule 5.4, 5.12)", () => {
    // jobs and granite.machines are unchanged after accrue for an hour and accrueAway for twelve hours
  });
  it("runs a night until the stockyard is full, with both levels", () => {
    // accrueAway 24 h: the report's stop is "stockyard"
  });
  it("loses no rock while the stone stockpile has room", () => {
    fc.assert(fc.property(/* workers per job 0..8, kilns/saws 0..3, piles 0..300, seconds 1..7200 */, (setup, seconds) => {
      // dug in both levels === Δ(every pile on both levels and both makers) + gained.stones
      //   + makerTakes("kiln") * gained.brick + makerTakes("saw") * gained.cutStone
    }));
  });
});

describe("parts 1 and 2 do not change (#673)", () => {
  it("plays a mine whose shaft is not sunk exactly as part 2, with part 3 on", () => {
    fc.assert(fc.property(/* part-2 mountains: workers, kilns, piles, stock, an order */, (setup) => {
      // partTwo(() => accrue(...)) toEqual partThree(() => accrue(...)), and the same for accrueAway
    }));
  });
  it("leaves a sunk Granite alone with part 3 off: the Topsoil plays as part 2", () => {
    // partTwo: accrue on a sunk mountain; granite unchanged; stock and piles equal the unsunk run's
  });
});
```

- [ ] **Step 2: Run them to see them fail**: `npx vitest run src/part-three.test.ts`. Expected: FAIL on the Granite's flows.

- [ ] **Step 3: Implement** as the Interfaces say. In `mountain.ts`, `accrueMine`'s guard becomes `if (!mineMakes(mountain, pay))`. `workStretch` takes `const settled = mineSettled(mountain, pay, drilling)`, reads `settled.income`, and uses `secondMark(from, settled.change)` in place of the `chainSettled`/`chainChange` pair. Drop the imports that are then unused.

- [ ] **Step 4: Run them to see them pass**: `npx vitest run src/part-three.test.ts src/part-two.test.ts src/part-two-stretches.test.ts src/fresh-night.test.ts src/session-night.test.ts src/mountain.test.ts && npm run gate -- fast`. Expected: PASS.

- [ ] **Step 5: Commit and push**: "Each level has its own drilled rock and rock at the shaft, and the saws their own pile (#673)".

---

### Task 9: The save

**Files:**

- Modify: `src/save-format.ts` (game key `granite`, writer, reader, refusals, `ShippedFacts.granite`)
- Test: `src/save-ledger.test.ts` (the ledger, and part 3's facts), `src/save-format.test.ts` if a test lists `GAME_KEYS`

**Interfaces:**

- Consumes: `Granite`, `LEVEL_MACHINE_IDS`, `GRANITE_PILE_IDS`, `UNSUNK` (Task 1); the new ids from Tasks 2, 4 and 6.
- Produces:
  - `GAME_KEYS` ends `..., "stockyard", "granite"`.
  - `SaveGame.granite?: { readonly machines?: Readonly<Partial<Record<LevelMachineId, number>>>; readonly piles?: Readonly<Partial<Record<GranitePileId, number>>> }`. It is written while the Granite is sunk, as `{}` with nothing on it. It is left out while unsunk, so a part 2 save writes the same map as today.
  - Reading:
    - A missing key reads as `UNSUNK`. Not a record is `bad`. A key other than `machines` and `piles` is `newer`. Ids are read with `readCounts` (an unknown id is `newer`, a part-count or a negative is `bad`), and piles are uncapped (ruling 2 of #703).
    - `bad` when a level machine on the Granite is more than `owned` of it.
    - `bad` when the Granite is unsunk and `jobs.graniteDrilling`, `jobs.graniteHaulage`, `jobs.saws` or `makers.saw` is above 0.
  - `ShippedFacts` gains `granite: { machines: LEVEL_MACHINE_IDS, piles: GRANITE_PILE_IDS }`.
- No version bump: `persist`'s `SAVE_VERSION` stays 9.

- [ ] **Step 1: Write the failing tests.** In `src/save-ledger.test.ts`, the `LEDGER` gains `"granite"` at the end of `gameKeys`, `"cutStone"` in `stock`, `"truck"` in `fleet`, `"graniteDrilling", "graniteHaulage", "saws"` in `jobs`, `"saw"` in `makers`, and `granite: { machines: ["cart", "drill", "borer", "train"], piles: ["face", "shaft", "saw"] }`. The unique-ids test lists `...Object.values(facts.granite)`. Then:

```ts
describe("part 3's facts in the save (#673)", () => {
  it("round-trips the Granite's machines and piles, its two jobs, the saws, their workers, cut stone and a truck", () => {});
  it("saves a sunk Granite with nothing on it as an empty map, and none while unsunk", () => {
    // writeGame(sunk with nothing).granite toEqual {}; writeGame(createMountain()) has no "granite"
  });
  it("writes a part 2 save's game map as before", () => {
    // a part 2 mountain (kilns, stockyard, brick, jobs, an order): Object.keys(writeGame(m)) has no "granite", and the map round-trips equal
  });
  it("refuses more machines on the Granite than he owns", () => {
    expect(
      readGame({ owned: { borer: 1 }, granite: { machines: { borer: 2 } } }, 0)
        .kind,
    ).toBe("bad");
  });
  it("refuses workers on the Granite's jobs or the saws, or a saw, while the shaft is not sunk", () => {});
  it("reads a Granite key or id it does not know as newer, and a part-stone pile as bad", () => {});
  it("reads and writes a sunk Granite back unchanged with part 3 off", () => {});
});
```

- [ ] **Step 2: Run them to see them fail**: `npx vitest run src/save-ledger.test.ts src/save-format.test.ts`. Expected: FAIL on the ledger and the new key.

- [ ] **Step 3: Implement** as the Interfaces say. `readGranite(value, facts, jobs, makers)` stays under the limits by one helper for the type checks and one for the refusals. It joins the `worst([...])` list in `readGame`.

- [ ] **Step 4: Run them to see them pass**: `npx vitest run src/save-ledger.test.ts src/save-format.test.ts src/persist.test.ts src/save-merge.test.ts src/rules-drift.test.ts && npm run gate -- fast`. Expected: PASS.

- [ ] **Step 5: Commit and push**: "The save holds the Granite, its jobs, the saws and cut stone, with no reset (#673)".

---

### Task 10: The moves: sink the shaft, and a machine for the Granite

**Files:**

- Modify: `src/economy/actions.ts` (a `LevelAction` union, `levelActions`, `levelApplied`, the events, `valueOf`)
- Modify: `src/field-log.ts` (`shaft.sink`, `granite.buy`)
- Test: `src/part-three-moves.test.ts`

**Interfaces:**

- Consumes: `shaftOpen`, `sinkShaft`, `shaftPrice`, `graniteOpen`, `withGraniteMachine`, `LEVEL_MACHINE_IDS`, `LevelMachineId` (Tasks 1 and 5); `tierOnSale` (`crew`).
- Produces:
  - `type LevelAction = { readonly kind: "sinkShaft" } | { readonly kind: "buyGraniteMachine"; readonly id: LevelMachineId }`, joined to `Action`.
  - `levelActions(mountain)`: `sinkShaft` while `shaftOpen`; once `graniteOpen`, one `buyGraniteMachine` for each level machine `tierOnSale` (in `LEVEL_MACHINE_IDS` order). It is added at the end of `listActions`' list.
  - Applied: `sinkShaft(mountain)`. A Granite machine is `buyWithTeach(mountain, id)`, then `withGraniteMachine` only if `owned[id]` rose. So a refused buy changes nothing, and the first borer brings the first engineer as on the Topsoil.
  - `MoveEvent` gains `{ kind: "shaftSunk" }` and `{ kind: "graniteMachineBought"; id: LevelMachineId; count: number }` (the count on the Granite). `fieldEntry` maps them to `{ code: "shaft.sink", data: { id: "granite" } }` and `{ code: "granite.buy", data: { id, count } }`.
  - `valueOf`: `sinkShaft` → `{ gainPerSec: 0, cost: priceAmount(shaftPrice(), "stones"), paybackSec: Infinity }`; `buyGraniteMachine` → `{ gainPerSec: 0, cost: 0, paybackSec: Infinity }` (ruling 17).

- [ ] **Step 1: Write the failing tests** in `src/part-three-moves.test.ts`:

```ts
it("lists Sink the shaft once the Light Tower is up in part 3, never in part 2, and not once sunk", () => {});
it("sinks it at once and logs it", () => {
  // applyMove(…, { kind: "sinkShaft" }): granite sunk, spent { stones: 10_000_000, brick: 1_500_000 }, events [{ kind: "shaftSunk" }]
  // fieldEntry({ kind: "shaftSunk" }) → { code: "shaft.sink", data: { id: "granite" } }
});
it("lists a Granite machine for each level machine on sale once the shaft is sunk", () => {
  // sunk: buyGraniteMachine for cart, drill, borer, train; unsunk: none
});
it("buys it for the Granite: what he owns and the Granite's count rise together, and it is logged", () => {
  // cutStone 40_000: owned.borer 1, granite borer 1, levelMachines topsoil borer 0
  // events [{ kind: "graniteMachineBought", id: "borer", count: 1 }]; fieldEntry → { code: "granite.buy", data: { id: "borer", count: 1 } }
});
it("refuses a Granite machine he cannot pay for: nothing changes", () => {
  // the mountain is unchanged: owned and granite.machines alike
});
it("brings the first engineer with the first borer on the Granite, as on the Topsoil", () => {});
it("values neither as income (the lab's, #675)", () => {});
```

- [ ] **Step 2: Run them to see them fail**: `npx vitest run src/part-three-moves.test.ts`. Expected: FAIL, the new kinds do not exist.

- [ ] **Step 3: Implement** as the Interfaces say. Put the new cases after the existing ones in each switch, so #728's edits to the same file stay apart.

- [ ] **Step 4: Run them to see them pass**: `npx vitest run src/part-three-moves.test.ts src/economy/actions.test.ts src/economy/invariants.test.ts src/field-log.test.ts src/ledger-rows.test.ts && npm run gate -- fast`. Expected: PASS; the actions snapshot does not change.

- [ ] **Step 5: Commit and push**: "Sinking the shaft and buying a machine for the Granite are moves, off in play (#673)".

---

### Task 11: Docs, and the proof

**Files:**

- Modify: `docs/ARCHITECTURE.md`

`docs/DESIGN.md`, `docs/design-intent.md`, `docs/ui-audit.md`, `docs/ART.md` and `.claude/rules/observable-saves.md` do not change: nothing the player sees changes, and the save is still version 9.

- [ ] **Step 1: Write the ARCHITECTURE bullet**, after the kilns' recipe (#723): "The shaft, the Granite and the levels' jobs (#673; slice 1 spec, rules 1, 2, 3, 5 and 7, Starting numbers, The save): behind part 3's switch, off in play." In the style of the #666 bullet, it names:
  - `part3.off` and `partThreeOn` in `part-switch`;
  - `mine-levels` (the `Granite` union, `shaftOpen`, `sinkShaft`, `shaftPrice` and `price.shaft`, `levelMachines`, `withGraniteMachine`);
  - `workforce`'s new jobs, `LEVEL_JOBS`, `levelWorks`, `LineWork.levels` and the two-level `line`;
  - `haulageWorkers` for Loading crews;
  - `makers`' saw, `makerOpen`, `runningMakers` and `makerRate`;
  - cut stone's room in `stockyard` (with `STOCKPILE_GOODS` unchanged);
  - `tiers`' part 3 prices (`tierGood`), the Granite's door in `crew` and the locomotive's rating in `line`;
  - the truck and `vehicleOpen` in `transport`;
  - `piles`' `Branches`, `evenShares`, and the shared hoisting and stone stockpile (ruling 4, until #724);
  - `mine-piles`' two-level path (`mineSettled`, `mineMakes`, `GRANITE_PILE_HOLDS`, `makerHolds`);
  - the moves and their log codes;
  - "Save: `granite` in the game map ..., no version bump".

  In "The game map" bullet of the save section, add `granite` (`machines`, `piles`, written only once sunk), and say that `stock`, `fleet`, `jobs` and `makers` gained `cutStone`, `truck`, the three jobs and `saw`.

- [ ] **Step 2:** Run `npm run gate -- fast`. Expected: OK, including prettier on the doc.

- [ ] **Step 3: Check the phone did not change**, rung 3 of the ladder, since `city-view` and `next-view` were touched:
  - `VISUAL_ONLY='done|warehouse|refinery' npm run visual`. Expected: the sections pass.
  - `npm run play -- --save done "tap:.frame-site[data-site=city]"`. Expected: the city shows the wagon's key and no truck key, though the Warehouse is operational.
  - `npm run play -- --save refinery`. Expected: the refinery shows the kilns alone.
  - In both `log.txt`: no page error, and the save line shows the account and its latest log.

- [ ] **Step 4: Commit and push**: "Docs for the shaft, the Granite and the levels' jobs (#673)". Then open the PR (ship-sitting) and start the full gate on the final commit in the background: `npm run gate -- full`. Do not wrap it in `timeout` or poll it. Its `lab --ci --ledger check` proves the pacing ledger did not move, and its visual check and journeys prove the screens and part 1's and part 2's journeys did not change. Then `npm run gate -- signoff` after the push, as ship-sitting says.

## How parts 1 and 2 are proven unchanged

- `part3.off` is never held by the page (Task 1's boot test), and every part 3 rule reads `partThreeOn()` through `graniteOpen`, `makerOpen`, `vehicleOpen`, `tierGood`, `tierInPlay` or `stockpileRoom`.
- With one level open, `mine-piles` runs today's code (ruling 6). Task 8's property shows that a part 2 mine plays the same with part 3 on, before the shaft.
- The existing suite passes with only three lists widened: the `JOB_IDS` test, the goods table test and the save ledger. The actions snapshot does not change.
- The full gate's labs check the pacing ledger (`--ledger check`), and its visual check and journeys run part 1's and part 2's screens.

## What is left for later slivers

- #724 (hoists that travel) replaces ruling 4's shared hoisting with cages, and sets the shaft and maker piles to three loads.
- #675 (the lab plays the whole slice) gives `steadyIncome` and the dad two levels, sets part 3's numbers, and decides rule 1.6.
- #680 (the mine with two levels) reads each level's chain for the rows, words the locomotive, the saws and the truck, adds the Granite's jobs to the workforce sheet, and adds cut stone to `STOCKPILE_GOODS`.
- #674 (the factory) brings rule 5.13's materials.
