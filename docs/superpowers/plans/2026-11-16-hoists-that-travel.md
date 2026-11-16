# Hoists that travel, off in play (#724) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. When the plan is done, use the ship-sitting skill, not `superpowers:finishing-a-development-branch` directly.

**Goal:** Slice 1's hoists as cages, behind part 3's switch (`partThreeOn()`), which the page never holds. A cage carries a set load on a trip that takes time, longer to the Granite. Rock is in stock only when a cage unloads at the top. Hoists are assigned to a level by a count. The winch's workers share one cage for both levels. Unattended time counts the cages as rates. The save adds what the cages carry and the counts assigned, with no reset. The phone does not change.

**Architecture:** One new pure module, `cages`, says which cages the shaft has, what each carries a trip, which level each serves, what they lift a second when counted as rates, and how the counts are assigned. A second pure module, `cage-trips`, plays a cage trip by trip: at an instant it arrives, unloads, loads and leaves. A third, `mine-cages`, plays the mine live: between cage instants it hands each level's piles to `piles`' existing `Chain` and `flowWhole`. The pile in front of a waiting cage is the cage itself, so "a cage is full" is a pile reaching its room, a phase boundary like any other. Unattended time stays in `mine-piles` on `Branches`. There, `Branches` loses #673's even split of one hoisting rate and gains each level's own rate plus a share of the cages for both, taken strictly in turn. `piles` stays the one module that moves goods: the instants pour rock with a new `pour`, and everything between instants is a `Chain`. With part 3 off, every path is today's code, so parts 1 and 2 are bit-identical.

**Tech Stack:** TypeScript, Vitest, fast-check, the strategy lab (`src/lab/`, `tools/strategy-lab.ts`), puppeteer visual check, Playwright journeys.

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`: rule 4 (a full stone stockpile: "a cage waits at the top with its load"), rules 5.5 to 5.14, Starting numbers (the rows "A cage's load", "A cage's trip", "The piles the cages use", "The winding engine"), Calls I made 57 to 63, 65, 66, 68, 70 and 71, The save (part 3's row: "The hoists assigned to each level. What the cages carry, for each level"), and Proof. Issue #724 (its Done-when list is the requirement). The prototype `prototypes/slice-1/` version 17 plays it (`staffing`, `cageRate`, `cageStep`, `lifts`), and its README says what the review found.

## Global Constraints

- Prove each task with the ladder in `.claude/rules/dad-friendly-work.md`: first the test file (`npx vitest run <file>`), then `npm run gate -- fast`. Run each command with `export PATH=/opt/node24/bin:$PATH` first. A test that plays the economy for over a second goes in a `*.sim.test.ts` file (`npx vitest run --project sim <file>`). The full gate runs once, on the PR's final commit (Task 10).
- Everything new is behind `partThreeOn()`, and `boot` never holds `part3.off` at 0. With part 3 off, every function this plan adds or changes returns today's result, or the same object. The journeys, the visual check and the pacing ledger's days do not move. `tools/journeys/expected.ts` does not change.
- The end hash in `docs/pacing-ledger.md` moves, and only it: the end world gains the `cages` key on `Mountain` (Task 10 writes the ledger again and shows that only the End hash column changed).
- No version bump and no reset: the save stays version 10 and only adds facts (`observable-saves.md`). The new game key `cages` goes in `src/save-format.ts` and in the ledger `src/save-ledger.test.ts`. `firestore.rules` does not change. The reader refuses a save whose hoists assigned are more than the hoists he owns. `src/save-merge.ts` accounts for the new facts (ruling 14).
- Starting numbers, verbatim from the spec. "A cage's load: what the hoist is rated to lift in one trip to the Topsoil and back: its rating times that trip's time." "The winch's cage: what its workers lift with the tool in that time, up to one hoist's load." "A cage's trip: down and up again: 10 s to the Topsoil and 20 s to the Granite, for every cage." "The piles the cages use: from part 3 the rock at the shaft and a maker's pile hold three loads of the largest cage he owns, and never less than the 300 they hold today ... The drilled rock stays as the lab set it." "The winding engine: a cage whose load follows its own rating, as a hoist's does." These are the lab's first guesses (call 71). #675 sets them.
- Name the shared module (`.claude/rules/superpowers.md`). `piles` moves goods through piles: rock poured at an instant (`pour`) and rock flowing between instants (`Chain`, `flowWhole`, `Branches`). `cages` and `cage-trips` decide where a cage goes and how much it may take. They never move rock themselves. Hoisting's workers stay `workforce`'s `stageWork`, rule 2.5. The mine's piles and rooms stay in `mine-piles`. The live loop is `mine-cages`. None of these copies a mechanism that already exists.
- No player-facing line. The screens are #680, the lab's numbers #675. Log codes are not copy.
- No function in non-test `src` is over 150 lines or a cognitive complexity of 15 (`npm run functions`). No runtime import cycle (`npm run cycles`). `cages` and `cage-trips` import `Mountain` as a type only, and `mine-cages` is imported only by `mountain`. Knip clean: export only what another module or a test imports. Coverage floors stay.
- `lineWork` and `effectiveRates` are the labs' hot path. `lineWork` gains one field that it already computes, and `effectiveRates` does not change. The cages are worked out once per `Rates` in `mine-piles`' existing cache, and only while part 3 is on.
- Commit after each task and push the branch (`git push`). Each message is a plain sentence ending "(#724)", a blank line, then exactly these two lines:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011RgeWuqtnTRfrJx9irL8aB
  ```

  Use `git commit -F -` with a heredoc. Never amend, and never force-push.

## Rulings (agent-run sitting)

These answer the questions a brainstorm would ask. Each goes in the PR body under Rulings.

1. **The switch.** Cages play wherever `partThreeOn()` is true, with one level open as well as two (call 65). With the Topsoil alone, every cage has one level to serve. With part 3 off, hoisting is today's `stages.lift` rate, and none of this plan's code changes a result.
2. **Which cages.** Every hoist and every winding engine (the tier `machine`) he owns is a cage, and the winch is one more cage (rule 5.10). Their order is fixed: the engines, then the hoists, then the winch (call 70). Each cage has a stable key: `machine:0`, `hoist:2`, `winch`. Buying another hoist adds a cage and leaves the others' trips alone. Which cages run is decided by hoisting's `stageWork` (rule 2.5, call 68): the first `running[id]` of each kind. The winch runs while hoisting has workers on tools. The winding engine stays out of play in part 3 (`tierInPlay`, the Granite plan's Task 5), so the cages count one only where `owned.machine` is set, as tests do.
3. **Trips and loads.** A trip is a whole number of seconds: `Math.max(2, Math.round(base × factor("trip.<level>")))`, with base 10 for the Topsoil and 20 for the Granite. It is the same for every cage. The way down is half the trip, floored, and the way up is the rest. A cage's load is its tier speed × the Topsoil's trip × pay: what it is rated to lift in one trip to the Topsoil and back. The winch's load is `Math.min(tools × toolSpeed(speed), speed.hoist)` × the Topsoil's trip × pay, so it never carries more than a hoist would. The issue's "the winding engine is a faster cage" is read through the spec's Starting numbers and call 71: the engine's load follows its own, higher rating, and its trip is every cage's.
4. **Assigned places.** The cages are walked in order. The first `assigned.topsoil` serve the Topsoil, the next `assigned.granite` serve the Granite, and the rest serve both in turn. So the engines take the assigned places first, the Topsoil's before the Granite's (call 70). The winch always serves both. While one level is open, every cage serves the Topsoil. A cage that does not run still holds its place, as in the prototype.
5. **Assigning.** `Mountain.cages.assigned` holds a count for each level. Together the counts never exceed the hoists he owns: `owned.hoist + owned.machine`. `assignHoists` adds up to `count`, clipped to what is unassigned, and works only while the Granite is open. `unassignHoists` takes off up to `count`, clipped to the level's count, at any time: there is no lock. Assigning is free and instant.
6. **Rates for unattended time** (rule 5.14). A cage that serves one level lifts `load / trip` from it. The cages for both lift `loads` together, the sum of their loads, once per round of the levels in the turn. Each level in the turn gets `loads / Σ trips of the levels in the turn`. A level is in the turn while it has a rate at haulage or rock at the shaft (rule 5.7). In `piles` this is `Branches.shared.turn`, and each branch's own rate at the shared stage is its assigned cages. It replaces #673's even split (that plan's ruling 4, "until #724"). What a level in the turn cannot use is not handed to the other level, because the cage still makes its trip (strictly in turn, call 57). With one level open, the mine is today's single `Chain` at `own.topsoil`.
7. **The piles.** In part 3, the rock at the shaft on both levels and the kilns' and saws' piles each hold `Math.max(300, Math.ceil(3 × factor("piles.loads") × largestLoad))`. `largestLoad` is the largest load of a hoist or engine he owns, and 0 with none. A maker's pile still has no room until he owns that maker. The drilled rock stays 300. A room that shrinks (gear runs out) leaves a pile over its room. That pile is full (#703 ruling 2) and nothing is taken away. The screens' `PILE_HOLDS` reads stay as they are (#680).
8. **Live plays cages, and away counts rates.** `accrue({ live: true })` (the session's tick and the lab's live step) plays cages trip by trip. `accrueAway` counts rates. A caller that accrues without `live` gets rates, as today.
9. **The live state.** `Mountain.cages` is `{ assigned, trips }`. `trips` holds, by key, a cage that is not fresh: `{ level, carried, leg }`, where `leg` is `top`, `down` (seconds left), `loading` or `up` (seconds left). A cage with no entry is empty at the top. It last served the Granite if its place in the order is even, and the Topsoil if odd. So the cages for both start on alternate levels, like the prototype's stagger: without it, six cages for both would reach the Topsoil together and find three loads between them.
10. **An instant** (`cageInstant`). An instant happens at every whole second where something happens, and the cages are taken in order. A leg whose time is up arrives. At the top, a cage pours its load into its level's maker pile, then into the stone stockpile, and waits with what finds no room (rule 5.6). Once empty, it goes down: to its own level; or, for a cage for both, to the other level if that level is in the turn, else to the same level if it is in the turn; else it stands. At a level, it pours the rock at the shaft into itself. Then it goes up unless it waits. It waits while it runs, has one level to serve there, carries less than its load, and either rock is coming or it is empty (rule 5.9). It has one level to serve there when it is assigned to that level, when the mine has one level, or when it serves both and the other level is out of the turn. Rock is coming while the level has a rate at haulage and either drilled rock or a rate at drilling. A cage at a level it no longer serves takes what is there and goes up. A cage that does not run finishes its trip (rule 5.11). On the way down it turns back, by the way it came. At a level it goes up with what it carries. At the top it unloads, then stands.
11. **Between instants.** `piles` moves the rock. Below the shaft, each level is a `Chain`: drilling, haulage and the loading of the first waiting cage at that level, with that cage as the last pile (its carried rock, and its load as the room). It loads at haulage's rate: once the cage has poured in what was waiting, the rock at the shaft is empty, so it loads what haulage brings, and the shaft pile fills only while no cage waits. At the top, each maker's `Chain` runs from its pile into its stockpile, drained at transport's take. The stone stockpile and the maker piles take rock only when a cage unloads. A step ends at the soonest of: the next leg's end; the next change in a chain below the shaft (a cage full, a pile filled or emptied), rounded up to a whole second; and one second while a cage waits at the top with a load, so it tries again each second as transport makes room. Every step is in whole goods (`flowWhole`), as the mine is today.
12. **The save holds what the cages carry, not where they are** (call 63). The game map gains `cages: { assigned?, carried? }`, each by level, and each left out when it is all zero, so a part 2 save writes the same map. A read puts each level's carried rock in a cage at the top: the Topsoil's in the first cage in order, the Granite's in the second. The first live step unloads it. The reader refuses: assigned counts that together exceed the hoists he owns; any assigned count, or rock carried from the Granite, while the shaft is unsunk; and rock carried from both levels when he owns no hoist and no engine, since only the winch's cage could hold it. Any key or id it does not know is `newer`.
13. **A night lands the cages first.** `accrueNight` brings every cage to the top before its first stretch. Each unloads what it can, into the maker pile and then the stone stockpile, in order. What finds no room waits in its cage at the top until play resumes. What landed counts in the night's report as produced. The rest of the night counts the cages as rates.
14. **The merge.** Neither fact is progress or coverage. An assignment is free and instant, like a worker's job. Rock carried is rock already counted in rock dug. Two copies that differ only there are settled the same way as two copies that differ only in jobs. `save-merge` needs no code change, and a test pins it.
15. **The moves.** `assignHoist` and `unassignHoist` take `{ level, count }`. Once the Granite is open they are listed with count 1 (the amount key is the screens', #680): assign while a hoist is unassigned, unassign while the level has one. They log `hoist.assign` and `hoist.unassign` with `{ id: level, count }`, the count being that level's after the move. The lab gives them no income (`{ gainPerSec: 0, cost: 0, paybackSec: Infinity }`, #675).
16. **The line's figure.** `LineWork.line` and `stages.lift` stay what hoisting's workers move, uncapped. `lineWork` gains only `hoisting`, the stage work it already computes, and the cages read it. What the line, `steadyIncome` and `mineChain`'s screens say about part 3 belongs to the lab (#675) and the screens (#680).
17. **The gap.** The property plays one hour live, trip by trip, and counts the same hour as rates, from the same start, at pay 1, with room in the stockyard. It allows up to six hoists in all and up to six cages for both levels, the winch among them: the numbers the prototype measured, and what a slice 1 mine reaches before the winding engine. The measure is rock lifted: drilled, less what still waits in the drilled rock and at the shaft. The two must agree within `CAGE_GAP_GUESS = 0.02` of the rates, plus one rock. The prototype measured about 1%. #675 names the lab's measure `cageGap` and sets its bound and the piles. This is not a guardrail in `src/lab/targets.ts`.
18. **Pay.** In live play the cages carry `load × pay` and their trips do not scale. Live pay is 1.
19. **Nothing here is Flemming's.** There is no product call, no line of copy, no art and no guardrail. Each choice here is a ruling under the levers the spec agreed.

## Review Focus

1. **A save written mid-trip** (a cage at the Granite's bottom with a part load) and opened on the other phone: the rock is in a cage at the top and unloads on the first second. Nothing is lost, and rock dug is unchanged. Test in Task 8.
2. **He takes the last hoist off a level** while a cage assigned there waits at its bottom with a part load. The cage now serves both levels, so at the next instant it takes what is there and goes up. No cage stays waiting at a level it no longer serves. Test in Task 5.
3. **Every hoist assigned to the Topsoil, with nobody on the winch.** Nothing is lifted from the Granite. Its rock at the shaft fills and its haulage stops, and no rock is lost. Test in Task 6.
4. **The stone stockpile and the maker's pile are full when a cage comes up.** The cage waits at the top with its load, and the shaft fills behind it. Once transport takes stone, it unloads that much the next second. Test in Task 6.
5. **A night straight after live play, with cages in the shaft.** The night lands them first: their rock goes into stock, or waits in the cage. Then it counts rates, and the report counts what landed. Test in Task 6.

---

### Task 1: The shaft's cages (`src/cages.ts`)

**Files:**

- Create: `src/cages.ts`, `src/cages.test.ts`
- Modify: `src/workforce.ts` (`LineWork.hoisting`)
- Test: `src/workforce.test.ts`

**Interfaces:**

- Consumes: `StageWork`, `toolSpeed`, `lineWork` (`workforce`); `MineLevelId`, `MINE_LEVEL_IDS` (`mine-levels`); `TierId` (`tiers`); `factor`.
- Produces (`workforce`): `LineWork.hoisting: StageWork`, which is `works.lift`, the object `lineWork` already builds.
- Produces (`cages`):
  - `tripSeconds(level: MineLevelId): number` (ruling 3); `legSeconds(level: MineLevelId, way: "down" | "up"): number`.
  - `type CageKey = \`machine:${number}\` | \`hoist:${number}\` | "winch"`; `cageKeys(owned: Readonly<Record<TierId, number>>): readonly CageKey[]`, which lists the engines, then the hoists, then `"winch"`.
  - `hoistsOwned(owned: Readonly<Record<TierId, number>>): number` = `owned.hoist + owned.machine`.
  - `type HoistsAssigned = Readonly<Record<MineLevelId, number>>`; `NO_HOISTS_ASSIGNED`.
  - `type CageService = MineLevelId | "both"`; `type ShaftCage = { readonly key: CageKey; readonly load: number; readonly runs: boolean; readonly serves: CageService }`.
  - `shaftCages(input: { readonly owned: Readonly<Record<TierId, number>>; readonly hoisting: StageWork; readonly speed: Readonly<Record<TierId, number>>; readonly assigned: HoistsAssigned; readonly twoLevels: boolean; readonly pay: number }): readonly ShaftCage[]`, in `cageKeys` order (rulings 2 to 4).
  - `largestLoad(cages: readonly ShaftCage[]): number`: the largest load of a hoist or engine, 0 with none. The winch is never counted.
  - `cagePileRoom(base: number, largest: number): number` (ruling 7).
  - `type CageRates = { readonly own: Readonly<Record<MineLevelId, number>>; readonly loads: number }`; `cageRates(cages: readonly ShaftCage[]): CageRates`. `own[level]` is Σ `load / tripSeconds(level)` over the running cages that serve that level. `loads` is Σ `load` over the running cages for both.

- [ ] **Step 1: Write the failing tests.** Add to `src/workforce.test.ts`:

```ts
it("names hoisting's work: the hoists that run and the winch's workers (#724)", () => {
  // owned.hoist 2, jobs.hoisting 3 (a hoist takes 1): lineWork(...).hoisting.running.hoist === 2, .tools === 1
  // lineWork(...).hoisting.moves === lineWork(...).stages.lift
});
```

In `src/cages.test.ts`, with `speed = effectiveRates(createMountain()).tierSpeed` under `partThree`, and a `work(running, tools)` helper that builds a `StageWork`:

```ts
describe("the cages' trips (Starting numbers, call 71)", () => {
  it("takes 10 s to the Topsoil and back and 20 s to the Granite, for every cage", () => {
    expect(tripSeconds("topsoil")).toBe(10);
    expect(tripSeconds("granite")).toBe(20);
    expect([
      legSeconds("topsoil", "down"),
      legSeconds("topsoil", "up"),
    ]).toEqual([5, 5]);
  });
  it("scales a trip by its knob, in whole seconds, never under 2", () => {
    withFactors({ "trip.granite": 0.55 }, () => {
      expect(tripSeconds("granite")).toBe(11);
      expect([
        legSeconds("granite", "down"),
        legSeconds("granite", "up"),
      ]).toEqual([5, 6]);
    });
    withFactors({ "trip.topsoil": 0 }, () =>
      expect(tripSeconds("topsoil")).toBe(2),
    );
  });
});

describe("which cages the shaft has (rules 5.5, 5.8, 5.10, call 70)", () => {
  it("is every engine, then every hoist, then the winch, keyed so a new hoist moves no other", () => {
    expect(cageKeys({ ...tierRecord(0), hoist: 2, machine: 1 })).toEqual([
      "machine:0",
      "hoist:0",
      "hoist:1",
      "winch",
    ]);
    expect(cageKeys(tierRecord(0))).toEqual(["winch"]);
  });
  it("loads a hoist with its rating times the Topsoil's trip", () => {
    expect(speed.hoist).toBe(60);
    // one hoist running, no winch workers: [{ key: "hoist:0", load: 600, runs: true, serves: "topsoil" }, { key: "winch", load: 0, runs: false, serves: "topsoil" }]
  });
  it("loads an engine by its own rating (call 71)", () => {
    // owned.machine 1, running.machine 1: load === speed.machine * 10
  });
  it("loads the winch with its workers' tools, never more than a hoist's load", () => {
    // tools 2: load === 2 * toolSpeed(speed) * 10; tools 40: load === speed.hoist * 10, with no hoist owned too
  });
  it("runs the first of each kind that hoisting's workers run", () => {
    // owned.hoist 3, running.hoist 1: runs === [true, false, false] for hoist:0..2
  });
  it("gives the engines the assigned places first, the Topsoil's before the Granite's", () => {
    // owned machine 1, hoist 2; assigned { topsoil: 1, granite: 1 }, twoLevels:
    // serves === { "machine:0": "topsoil", "hoist:0": "granite", "hoist:1": "both", winch: "both" }
  });
  it("serves the Topsoil with every cage while one level is open, whatever is assigned", () => {});
  it("scales every load by pay", () => {});
});

describe("the cages as rates (rule 5.14)", () => {
  it("lifts a load in one level's trip for a cage with one level, and two loads in both trips for one for both", () => {
    // hoist:0 for the Granite, hoist:1 for both, both running at load 600:
    // cageRates → { own: { topsoil: 0, granite: 30 }, loads: 600 }
  });
  it("is the hoists' ratings with the Topsoil alone", () => {
    // two hoists running, one level: own.topsoil === 2 * speed.hoist, loads 0
  });
  it("counts no cage that does not run", () => {});
});

describe("the piles the cages use (Starting numbers)", () => {
  it("hold three loads of the largest hoist or engine he owns, never less than 300", () => {
    expect(cagePileRoom(300, 0)).toBe(300);
    expect(cagePileRoom(300, 600)).toBe(1_800);
    withFactors({ "piles.loads": 0.5 }, () =>
      expect(cagePileRoom(300, 600)).toBe(900),
    );
    // largestLoad leaves the winch out: a winch at 600 alone → 0
  });
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run src/cages.test.ts src/workforce.test.ts`. Expected: FAIL, because `cages` and `LineWork.hoisting` do not exist.

- [ ] **Step 3: Implement** what the Interfaces say. In `shaftCages`, walk `cageKeys(owned)`: a kind's index below `hoisting.running[id] ?? 0` runs, and the winch runs while `hoisting.tools > 0`. Then hand out the places as ruling 4 says.

- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run src/cages.test.ts src/workforce.test.ts src/rates.test.ts && npm run gate -- fast`. Expected: PASS, and every gate line OK.

- [ ] **Step 5: Commit and push** with the message "The shaft's cages: their loads, trips, places and rates, off in play (#724)".

---

### Task 2: The cages on the mountain, and assigning hoists

**Files:**

- Modify: `src/cages.ts` (the live state's types, `NO_CAGES`, `carriedBy`, `restoredTrips`, `unassignedHoists`, `assignHoists`, `unassignHoists`)
- Modify: `src/mountain.ts` (`Mountain.cages`, `BARE_MOUNTAIN.cages: NO_CAGES`, added after `granite`)
- Test: `src/cages.test.ts`, and every fixture `tsc` names for a complete `Mountain` literal

**Interfaces:**

- Consumes: `CageKey`, `HoistsAssigned`, `hoistsOwned`, `cageKeys` (Task 1); `graniteOpen` (`mine-levels`).
- Produces:
  - `type CageLeg = { readonly kind: "top" } | { readonly kind: "down"; readonly left: number } | { readonly kind: "loading" } | { readonly kind: "up"; readonly left: number }`.
  - `type Cage = { readonly level: MineLevelId; readonly carried: number; readonly leg: CageLeg }`; `type CageTrips = Readonly<Partial<Record<CageKey, Cage>>>`.
  - `type Cages = { readonly assigned: HoistsAssigned; readonly trips: CageTrips }`; `NO_CAGES: Cages = { assigned: { topsoil: 0, granite: 0 }, trips: {} }`.
  - `cageAt(trips: CageTrips, key: CageKey, place: number): Cage`: the entry, or a fresh cage at the top, empty, whose `level` is the Granite for an even `place` and the Topsoil for an odd one (ruling 9).
  - `carriedBy(trips: CageTrips): Readonly<Record<MineLevelId, number>>`.
  - `restoredTrips(carried: Readonly<Record<MineLevelId, number>>, keys: readonly CageKey[]): CageTrips` (ruling 12): each level with rock gets the next key, at the top. It throws if there are more such levels than keys, since the reader refuses that save first.
  - `unassignedHoists(mountain: Pick<Mountain, "owned" | "cages">): number`.
  - `assignHoists<M extends Pick<Mountain, "owned" | "cages" | "granite">>(mountain: M, level: MineLevelId, count?: number): M` and `unassignHoists<M extends Pick<Mountain, "cages">>(mountain: M, level: MineLevelId, count?: number): M` (ruling 5). A count is read as `workforce`'s `movable` reads one: whole, NaN none, Infinity all. A move that changes nothing returns the same object.

- [ ] **Step 1: Write the failing tests** in `src/cages.test.ts`, with `sunk(mountain)` as in `part-three-moves.test.ts`:

```ts
describe("hoists assigned to a level (rule 5.8)", () => {
  it("assigns up to the hoists he owns that are not assigned, free and at once", () => {
    // sunk, owned.hoist 2: assignHoists(m, "granite", 5).cages.assigned → { topsoil: 0, granite: 2 }; stock unchanged
  });
  it("counts a winding engine as a hoist (call 70)", () => {
    // owned.hoist 1, machine 1: unassignedHoists === 2
  });
  it("assigns nothing while the Granite is shut, and takes off at any time: no lock", () => {
    // unsunk: same object; partTwo with a sunk save holding granite 1: unassignHoists(m, "granite").cages.assigned.granite === 0
  });
  it("never assigns more than he owns, whatever the moves (property)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            level: fc.constantFrom(...MINE_LEVEL_IDS),
            count: fc.integer({ min: -2, max: 4 }),
            on: fc.boolean(),
          }),
        ),
        fc.integer({ min: 0, max: 6 }),
        (moves, hoists) => {
          // apply assign (on) / unassign (!on) in turn: Σ assigned <= hoistsOwned(owned) and each >= 0 after every move
        },
      ),
    );
  });
});

describe("what the cages carry (call 63)", () => {
  it("adds what every cage carries, level by level", () => {});
  it("puts each level's carried rock in a cage at the top, the Topsoil's first", () => {
    expect(
      restoredTrips({ topsoil: 400, granite: 120 }, ["hoist:0", "winch"]),
    ).toEqual({
      "hoist:0": { level: "topsoil", carried: 400, leg: { kind: "top" } },
      winch: { level: "granite", carried: 120, leg: { kind: "top" } },
    });
    expect(restoredTrips({ topsoil: 0, granite: 0 }, ["winch"])).toEqual({});
  });
  it("starts a fresh cage empty at the top, on alternate levels by its place", () => {
    expect(cageAt({}, "hoist:0", 0)).toEqual({
      level: "granite",
      carried: 0,
      leg: { kind: "top" },
    });
    expect(cageAt({}, "hoist:1", 1).level).toBe("topsoil");
  });
  it("starts every fresh mine with none assigned and nothing carried", () => {
    expect(createMountain().cages).toEqual(NO_CAGES);
  });
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run src/cages.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** what the Interfaces say. `tsc` lists every complete `Mountain` literal that now lacks `cages`. Fixtures that spread `createMountain()` or `BARE_MOUNTAIN` need nothing.

- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run src/cages.test.ts src/mountain.test.ts && npm run gate -- fast`. Expected: PASS.

- [ ] **Step 5: Commit and push** with the message "The mountain holds the cages and the hoists assigned to each level, off in play (#724)".

---

### Task 3: Pouring, and the turn, in `src/piles.ts`

**Files:**

- Modify: `src/piles.ts` (export `Pile`; add `pour`; `Branches.shared` becomes `{ stage, turn }`; `branchChains` and `flowBranchesWhole` read the turn)
- Modify: `src/mine-piles.ts`. Until Task 4, `mineBranches` builds the new `shared` as `turn: { loads: stages.lift * pay, trips: [1, 1] }`, with each branch's own LIFT rate 0. That is #673's split, apart from what a level in the turn cannot use.
- Test: `src/piles.test.ts` (the `chains side by side` block), `src/part-three.test.ts` (delete "lifts from both levels' rock at the shaft, and what one cannot use goes to the other (ruling 4)", the one test of the split that goes)

**Interfaces:**

- Produces:
  - `export type Pile = { readonly held: number; readonly holds: number }`.
  - `pour(load: number, piles: readonly Pile[]): { readonly into: readonly number[]; readonly left: number }`: a whole load into each pile in order. Each pile takes up to its room, `Math.floor(holds − held + EDGE)` (Infinity stays Infinity), and none if it is at or over its room. What is left is the rest.
  - `Branches.shared: { readonly stage: number; readonly turn: { readonly loads: number; readonly trips: readonly number[] } }`. Branch `i` is in the turn while `rates[stage − 1] > 0` or `piles[stage − 1].held > 0`. Its rate at `stage` is its own `rates[stage]` plus, in the turn, `turn.loads / Σ trips[j]` over the branches `j` in the turn. `evenShares` stays for `stockDraw` alone.
  - `flowBranchesWhole` floors each branch with its own rate at `stage` (the one `branchChains` gave it in the first phase). `wholeOf` reads only the piles and the spill, so any rate gives the same floor.

- [ ] **Step 1: Write the failing tests.** In `src/piles.test.ts`, `shaft(branches, rate)` becomes `shaft(branches, loads, trips = [10, 20])`, and `level({ lift })` sets the branch's own rate at stage 2. Replace #673's two even-split tests ("shares the stage's rate evenly…" and "leaves the whole rate to a branch…") with:

```ts
describe("pouring a load (rule 5.6)", () => {
  it("fills each pile in order up to its room, and keeps what finds none", () => {
    expect(
      pour(600, [
        { held: 1_500, holds: 1_800 },
        { held: 0, holds: Infinity },
      ]),
    ).toEqual({ into: [300, 300], left: 0 });
    expect(
      pour(600, [
        { held: 1_800, holds: 1_800 },
        { held: 99, holds: 100 },
      ]),
    ).toEqual({ into: [0, 1], left: 599 });
    expect(pour(50, [{ held: 2_000, holds: 1_800 }])).toEqual({
      into: [0],
      left: 50,
    });
  });
});

it("lifts each branch's own rate, and the turn's loads in the time of the trips of those in the turn", () => {
  // own 30 on the Granite; loads 600, both in turn: lifts [600/30, 30 + 600/30] when both have rock waiting
});
it("leaves a branch with no rate at haulage and nothing at the shaft out of the turn: the other takes the loads in its own trip", () => {
  // Topsoil: haul 0, shaft empty; Granite in turn: Granite's turn share 600/20
});
it("gives a branch in the turn that cannot use its share none of it to the other (strictly in turn)", () => {
  // Topsoil: shaft empty, haul 5 a second → lifts 5; Granite still 600/30
});
it("lifts none for both when no branch is in the turn", () => {});
```

Change the last property to "in whole goods, makes and loses nothing, lifts no more than each branch's own rate and its turn share, and fills no side pile with no drain past its room". The other branch tests keep their cases, with `rate` written as the turn.

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run src/piles.test.ts`. Expected: FAIL, because `pour` and `shared.turn` do not exist.

- [ ] **Step 3: Implement** what the Interfaces say. Make `branchAt`'s rate the branch's own rate plus its turn share, both computed in `branchChains`. Move the old `wants`/`evenShares` step out of `branchChains`.

- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run src/piles.test.ts src/transport.test.ts src/part-three.test.ts src/part-two.test.ts && npm run gate -- fast`. Expected: PASS, with the stockDraw tests unchanged.

- [ ] **Step 5: Commit and push** with the message "Piles pour a load at once, and chains side by side take a turn's loads strictly in turn (#724)".

---

### Task 4: The cages as rates, and their piles, in `src/mine-piles.ts`

**Files:**

- Modify: `src/mine-piles.ts`
- Test: `src/part-three.test.ts`

**Interfaces:**

- Consumes: `shaftCages`, `cageRates`, `largestLoad`, `cagePileRoom`, `tripSeconds`, `ShaftCage`, `CageRates` (Task 1); `Mountain.cages` (Task 2); `Branches.shared.turn` (Task 3); `LineWork.hoisting` (Task 1).
- Produces:
  - `export type MineWork = { readonly stages: StageSpeeds; readonly levels: LineWork["levels"]; readonly cages: readonly ShaftCage[]; readonly lift: CageRates | undefined }`, and `mineWork(mountain: Mountain): MineWork`, the existing `stagesOf` cache made public. `cages` is `[]` and `lift` is `undefined` while part 3 is off, and nothing about cages is worked out then.
  - `shaftHolds(mountain: Mountain): number`: 300 with part 3 off, else `cagePileRoom(300, largestLoad(...))`. It is the room of the rock at the shaft on both levels.
  - `makerHolds(mountain: Mountain, id: MakerId): number` (exported): 0 until he owns one; `PILE_HOLDS.kiln` with part 3 off; else `cagePileRoom(PILE_HOLDS.kiln, largestLoad(...))`. `kilnHolds` keeps its signature.
  - The Topsoil's LIFT rate in `topsoilBranch` is `(lift?.own.topsoil ?? stages.lift) * pay`. With the Granite open, it is `lift.own.topsoil * pay`, and the Granite's is `lift.own.granite * pay`. `mineBranches`' `shared` is `{ stage: LIFT, turn: { loads: lift.loads * pay, trips: [tripSeconds("topsoil"), tripSeconds("granite")] } }`.
  - `export type MineFlow` (today's private type).
  - `mineDraw(mountain: Mountain, pay: number, drilling: boolean): Partial<Stock>`: what transport takes a second from each stockpile, the `stockDraw(...)` expression that `mineChain` and `levelsSet` already use. It is `{}` while the stockyard is shut.

- [ ] **Step 1: Write the failing tests** in `src/part-three.test.ts`, under `describe("the cages as rates, unattended (rule 5.14, #724)")`. The `levels` helper gains `hoists` (owned and running) and `assigned`:

```ts
it("lifts a hoist's rating from the Topsoil alone", () => {
  // unsunk, 1 hoist, 1 on hoisting, Topsoil haul plenty: an hour's night lifts 60 a second × awayPay
});
it("lifts a load in 20 s from the Granite for a hoist assigned there", () => {});
it("lifts two loads in 30 s for a hoist for both, one from each level", () => {});
it("gives a hoist for both to the Granite alone while the Topsoil has nobody on haulage and nothing at the shaft (rule 5.7)", () => {});
it("caps the winch's cage at a hoist's load", () => {
  // 40 on hoisting, no hoist, Topsoil alone: lifts speed.hoist a second, not 40 × the tool
});
it("lifts nothing from a level that no hoist serves when nobody is on the winch (rule 5.8)", () => {
  // 1 hoist assigned to the Topsoil, 1 on hoisting: the Granite's rock at the shaft fills and stays (Review Focus 3, the rates half)
});
it("makes the rock at the shaft and the makers' piles hold three loads of his largest cage, never less than 300", () => {
  // 1 hoist: shaftHolds 1_800, makerHolds(kiln owned) 1_800, makerHolds(saw not owned) 0; no hoist: 300; partTwo: 300 whatever he owns
});
```

Rewrite the existing tests in this file whose numbers came from #673's one shared hoist, so that they state the cage rates in their comments. Those are "goes to the saws first…", "settles both levels…", "counts a mine where only the Granite works…" and "stops the saws at a full cut stone stockpile…". Give their set-ups a hoist assigned to the Granite where they need a steady lift. The `parts 1 and 2 do not change` block stays as it is and must pass unchanged.

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run src/part-three.test.ts`. Expected: FAIL on the new rates and rooms.

- [ ] **Step 3: Implement** what the Interfaces say. `stagesOf` becomes `mineWork`. It builds `cages` with `shaftCages({ owned, hoisting, speed: rates.tierSpeed, assigned: mountain.cages.assigned, twoLevels: graniteOpen(mountain), pay: 1 })` only under `partThreeOn()`, and builds `lift` from it. Pay is applied where each rate is used. `GRANITE_PILE_HOLDS.shaft` gives way to `shaftHolds`, and `face` stays.

- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run src/part-three.test.ts src/part-two.test.ts src/part-two-stretches.test.ts src/fresh-night.test.ts src/mine-view.test.ts src/refinery-view.test.ts && npm run gate -- fast`. Expected: PASS, with the part 2 tests unchanged.

- [ ] **Step 5: Commit and push** with the message "Unattended time counts the cages as rates, and their piles hold three loads, off in play (#724)".

---

### Task 5: A cage, trip by trip (`src/cage-trips.ts`)

**Files:**

- Create: `src/cage-trips.ts`, `src/cage-trips.test.ts`

**Interfaces:**

- Consumes: `ShaftCage`, `legSeconds`, `CageTrips`, `Cage`, `cageAt` (Tasks 1 and 2); `pour`, `Pile` (Task 3).
- Produces:
  - `type LevelScene = { readonly shaft: Pile; readonly maker: Pile; readonly coming: boolean; readonly inTurn: boolean }`.
  - `type ShaftScene = { readonly levels: Readonly<Partial<Record<MineLevelId, LevelScene>>>; readonly stone: Pile }`, with only the open levels in it.
  - `type Instant = { readonly trips: CageTrips; readonly scene: ShaftScene; readonly toMaker: Readonly<Partial<Record<MineLevelId, number>>>; readonly toStone: number; readonly changed: boolean }`.
  - `cageInstant(cages: readonly ShaftCage[], trips: CageTrips, scene: ShaftScene): Instant` (ruling 10). It is idempotent: a second call on its own result changes nothing.
  - `landCages(cages: readonly ShaftCage[], trips: CageTrips, scene: ShaftScene): Instant`: every cage at the top, unloaded as at an instant (ruling 13).
  - `cagesAfter(trips: CageTrips, seconds: number): CageTrips`: every leg's `left` less `seconds`, and never below 0.
  - `nextLegEnd(trips: CageTrips): number`: the least `left` of a leg, or Infinity.
  - `waitingCage(cages: readonly ShaftCage[], trips: CageTrips, level: MineLevelId): { readonly key: CageKey; readonly pile: Pile } | undefined`: the first cage in order loading at `level` with room (`{ held: carried, holds: load }`).
  - `withCarried(trips: CageTrips, key: CageKey, carried: number): CageTrips`.
  - `topWaits(trips: CageTrips): boolean`: some cage at the top still carries rock.
- Each cage's step is its own helper (`arrived`, `atTop`, `atLevel`, `nextLevel`, `waits`), so that `cageInstant` stays under the limits.

- [ ] **Step 1: Write the failing tests** in `src/cage-trips.test.ts`. The cages are literal `ShaftCage`s (`hoist = (serves, runs = true): ShaftCage => ({ key: "hoist:0", load: 600, runs, serves })`), and `scene({ topsoil, granite, stone })` builds piles with room to spare by default:

```ts
describe("at the top (rule 5.6)", () => {
  it("unloads into its level's maker pile first, then the stone stockpile, then goes down", () => {
    // up 600 from the Topsoil arrives: maker 1_500/1_800 → toMaker.topsoil 300, toStone 300, the cage's leg is down 5 s
  });
  it("waits at the top with what finds no room", () => {
    // maker full, stone 99/100 → toStone 1, carried 599, leg top; topWaits true
  });
  it("unloads without its workers, then stands (rule 5.11)", () => {});
});

describe("at a level (rules 5.7, 5.9)", () => {
  it("takes the rock at the shaft and goes up full", () => {
    // shaft 1_800: carried 600, shaft 1_200, leg up 5 s
  });
  it("waits for a whole load at its one level while rock is coming", () => {
    // shaft 100, coming: carried 100, leg loading; waitingCage → pile { held: 100, holds: 600 }
  });
  it("goes up with a part load when no more rock is coming, and an empty one waits", () => {});
  it("takes what is there and goes on, for both levels in turn, even empty", () => {});
  it("waits as a cage with one level when the other level is out of the turn", () => {});
  it("takes what is there and goes up from a level it no longer serves (Review Focus 2)", () => {
    // was assigned to the Granite, now serves "both", waiting there with 100: leaves up with 100 + what is at the shaft
  });
});

describe("going down (rules 5.7, 5.8)", () => {
  it("goes to the other level strictly in turn, and to the same while the other is out of the turn", () => {});
  it("stands at the top when no level is in the turn, or when it does not run", () => {});
  it("goes only to its own level once assigned, also with nothing there", () => {});
  it("turns back on its way down when its workers are taken away, by the way it came (rule 5.11)", () => {
    // down to the Granite with 4 of 10 s left: up with 6 s left
  });
});

describe("trip by trip", () => {
  it("is the same instant twice", () => {
    fc.assert(fc.property(/* cages 1..7, trips, scenes */, (input) => {
      // const once = cageInstant(...); cageInstant(cages, once.trips, once.scene) changes nothing (changed false, equal trips and scene)
    }));
  });
  it("loses and makes no rock at an instant", () => {
    // property: Σ shaft + Σ carried + Σ maker + stone is the same before and after
  });
  it("counts the legs down and says when the next one ends", () => {});
  it("lands every cage at the top and unloads it, keeping what finds no room (ruling 13)", () => {});
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run src/cage-trips.test.ts`. Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement** what the Interfaces say. A cage with no entry in `trips` is `cageAt(trips, key, place)`. A cage that ends empty and fresh-like keeps its entry, so its level alternates.

- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run src/cage-trips.test.ts && npm run gate -- fast`. Expected: PASS.

- [ ] **Step 5: Commit and push** with the message "A cage goes down, loads, comes up and unloads, trip by trip, off in play (#724)".

---

### Task 6: The mine played live with cages (`src/mine-cages.ts`)

**Files:**

- Create: `src/mine-cages.ts`, `src/mine-cages.test.ts`
- Modify: `src/mountain.ts` (`accrue` passes `live` to `accrueStretches`, `accrueMine` and `workStretch`; `accrueNight` lands the cages first)
- Test: `src/mine-cages.test.ts`

**Interfaces:**

- Consumes: `mineWork`, `MineFlow`, `flowMine`, `mineDraw`, `shaftHolds`, `makerHolds`, `PILE_HOLDS` (Task 4); `cageInstant`, `landCages`, `cagesAfter`, `nextLegEnd`, `waitingCage`, `withCarried`, `topWaits` (Task 5); `flowWhole`, `chainChange`, `Chain` (`piles`); `makerRate`, `makerTakes` (`makers`); `stockpileRoom` (`stockyard`); `openGranite` (`mine-levels`).
- Produces:
  - `flowMineLive(mountain: Mountain, seconds: number, pay: number, drilling: boolean): MineFlow`. It is `flowMine(...)` exactly while part 3 is off. Otherwise it plays `mineWork(mountain).cages`, each load × pay (ruling 18), and runs a loop of steps (ruling 11), each beginning with `cageInstant`, plus one instant at the end. For each open level, the chain below the shaft is `{ source: Infinity, rates: [drilling ? face × pay : 0, haul × pay, waiting ? haul × pay : 0, 0], piles: [face, shaft (holds shaftHolds), waiting?.pile ?? { held: 0, holds: 0 }] }`. Each maker's chain is `{ source: 0, rates: [0, makerRate × pay, draw[good]], piles: [maker pile, its stockpile], takes: [1, makerTakes, 1] }`, with the kilns on the Topsoil and the saws on the Granite. Both run through `flowWhole`. `mined` is what the cages unloaded at the top. `gained` is the stone unloaded plus what the makers made. `rockDug` grows by what was drilled. The piles go back where `flowMine` puts them, and `cages.trips` takes the cages' state. A mine where no rock moves and no cage changes comes back as the same object.
  - `landedMine(mountain: Mountain): MineFlow`: `landCages` on the mountain's piles. It is the same object while part 3 is off or no cage carries rock.
- In `mountain.ts`:
  - `accrueStretches(mountain, from, to, pay, live)` and `workStretch(mountain, span, pay, drilling, live)`. Within them the flow is `live ? flowMineLive(...) : flowMine(...)`. `nightStretch` passes `false`.
  - `accrueMine(mountain, from, to, pay, live)`. Its guard `!mineMakes(...)` is skipped when `live && partThreeOn()`, because a cage can be travelling while no pile moves.
  - `accrueNight` starts from `landedMine(mountain)`. Its `gained` goes into the log and its `mined` into the night's `mined`.
- The loop's step is `Math.min(left, whole(nextLegEnd), whole(least chainChange below), topWaits ? 1 : Infinity)`, where `whole(x) = Math.max(1, Math.ceil(x - 1e-9))` and Infinity stays Infinity. It runs at most `seconds` steps.

- [ ] **Step 1: Write the failing tests** in `src/mine-cages.test.ts`. A `mine(setup)` helper is `part-three.test.ts`'s `levels` with `hoists`, `assigned`, `trips` and `operational` added. `play = (m, s) => accrue({ mountain: m, from: 0, to: s * 1000, live: true })`.

```ts
describe("rock is in stock when a cage unloads at the top (rules 5.5, 5.6)", () => {
  it("brings the first load to stone after one trip to the Topsoil, and none before", () => {
    // Topsoil alone, 1 hoist, 1 on hoisting, shaft 1_800, no kiln: play 9 s → stones 0, carried 600; play 10 s → stones 600
  });
  it("fills the kilns' pile before stone", () => {
    // 1 kiln, nobody on the kilns: three trips → kiln pile 1_800, stones 0; the fourth → stones 600
  });
  it("waits at the top with its load while the stone stockpile and the maker's pile are full, and the shaft fills behind it (Review Focus 4)", () => {
    // stones at their room: after 30 s the cage carries 600 at the top, the shaft pile has grown; drop the stone stock by 200 → the next second unloads 200
  });
});

describe("the hoists on their levels (rules 5.7 to 5.10)", () => {
  it("lets a hoist for both go strictly in turn: Topsoil, Granite, Topsoil", () => {
    // both shafts full: stone at 10 s is 600 from the Topsoil, at 30 s 1_200 with the Granite's, and the Granite's shaft is down by 600
  });
  it("waits at the Granite for a whole load for a hoist assigned there", () => {});
  it("leaves the Topsoil out of the turn with nobody on its haulage and nothing at its shaft", () => {});
  it("sends the winch's cage to a level that no hoist serves", () => {
    // 1 hoist assigned to the Topsoil, 2 on hoisting: the Granite's rock comes up in the winch's cage (load 1 × toolSpeed × 10)
  });
  it("lifts nothing from the Granite with every hoist on the Topsoil and nobody on the winch: its shaft fills and its haulage stops (Review Focus 3)", () => {});
  it("lets a cage whose workers are taken away finish its trip, unload, and stand (rule 5.11)", () => {
    // a cage going up with 600 and jobs.hoisting 0: after 5 s stones += 600; after 60 s more nothing changes
  });
  it("adds a cage for a hoist bought in play, at the top, and leaves the others' trips alone", () => {});
});

describe("a night after play (ruling 13)", () => {
  it("lands the cages first, then counts rates, and the report counts what landed (Review Focus 5)", () => {
    // a cage up with 600 from the Granite, a saw: accrueAway lands it into the saws' pile; the report's produced and the stock add up
  });
});

describe("parts 1 and 2 do not change (#724)", () => {
  it("plays live exactly as before with part 3 off", () => {
    fc.assert(fc.property(/* part-2 mountains as in part-three.test.ts */, (setup) => {
      // partTwo: accrue({ live: true }) toEqual accrue({ live: false }), mountain, mined and settledAt alike
    }));
  });
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run src/mine-cages.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** what the Interfaces say. Keep each function under the limits. Use one helper to build the scene from the state, one to run the chains of a step, one for a level's chain below the shaft, one for a maker's chain, and one to write the state back onto the mountain. The scene's `coming` for a level is `haul > 0 && (face > 0 || (drilling && face rate > 0))`, and its `inTurn` is `haul > 0 || shaft > 0`, both read from `mineWork(...).levels` at pay.

- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run src/mine-cages.test.ts src/part-three.test.ts src/part-two.test.ts src/part-two-stretches.test.ts src/fresh-night.test.ts src/session-night.test.ts src/session-time.test.ts src/mountain.test.ts && npm run gate -- fast`. Expected: PASS.

- [ ] **Step 5: Commit and push** with the message "Live play runs the cages trip by trip, and a night lands them first, off in play (#724)".

---

### Task 7: The cages' properties (rule 5.14, Proof)

**Files:**

- Modify: `src/mine-cages.test.ts` (the short properties)
- Create: `src/cages.sim.test.ts` (the hour)

**Interfaces:**

- Consumes: `flowMineLive` (Task 6); `flowMine` (Task 4); `carriedBy` (Task 2).
- Produces: `CAGE_GAP_GUESS = 0.02`, a constant in `src/cages.sim.test.ts` with the comment: the lab's `cageGap` (#675) replaces it.

- [ ] **Step 1: Write the failing tests.** They should fail only where Task 6 has a bug. If one passes at once, check that it fails with the bug it pins put in by hand, then take the bug out again. Add to `src/mine-cages.test.ts`:

```ts
describe("what the shaft holds (Proof)", () => {
  it("makes and loses no rock in the shaft", () => {
    fc.assert(fc.property(/* workers per level job 0..8, hoists 0..4, assigned within them, hoisting 0..8, kilns/saws 0..2 with workers, piles, trips at random legs, seconds 1..120 */, (setup, seconds) => {
      // dug === Δ(face + shaft + maker piles, both levels) + Δ Σ carriedBy(trips)
      //   + gained.stones + makerTakes("kiln") * gained.brick + makerTakes("saw") * gained.cutStone
    }), { numRuns: 60 });
  });
  it("raises neither the stone stockpile nor a maker's pile while every cage is down, but brick and cut stone may rise", () => {
    fc.assert(fc.property(/* as above, with every cage loading or going down, seconds 1..4 (no cage can reach the top) */, (setup, seconds) => {
      // after.stock.stones === before.stock.stones; each maker pile <= before; brick and cutStone >= before
    }));
  });
});
```

In `src/cages.sim.test.ts`:

```ts
describe("the cages as played and a night's rates (rule 5.14, ruling 17)", () => {
  it("agree on the rock lifted in an hour within the gap, up to six hoists and six cages for both", () => {
    fc.assert(fc.property(/* both levels open; hoists 0..6; assigned so that hoists for both + the winch <= 6; workers on each level's jobs 0..20; hoisting 0..12; makers optional; the stockyard with room for the hour */, (setup) => {
      // lifted(m, after) = after.rockDug - m.rockDug - Δ(face + shaft piles, both levels)
      // const live = lifted(m, flowMineLive(m, 3600, 1, true).mountain); const rates = lifted(m, flowMine(m, 3600, 1, true).mountain)
      // expect(Math.abs(live - rates)).toBeLessThanOrEqual(CAGE_GAP_GUESS * rates + 1)
    }), { numRuns: 40 });
  });
  it("agree with the Topsoil alone", () => { /* the same with the shaft unsunk */ });
});
```

- [ ] **Step 2: Run them.** Run `npx vitest run src/mine-cages.test.ts && npx vitest run --project sim src/cages.sim.test.ts`. Expected: PASS. A counterexample inside the stated set-ups is a bug: use `superpowers:systematic-debugging` on the shrunk case. If the model is right and the gap is real for a set-up the slice reaches, record a ruling in the PR body (the set-up, the gap found, and why), and leave the bound to #675. Never widen the set-ups' guard to hide it.

- [ ] **Step 3:** Run `npm run gate -- fast`. Expected: OK.

- [ ] **Step 4: Commit and push** with the message "The cages lose no rock, stock rises only at the top, and play agrees with a night's rates (#724)".

---

### Task 8: The save

**Files:**

- Modify: `src/save-format.ts` (`GAME_KEYS` adds `"cages"`; `SaveGame.cages`; `savedCages`; `readCages`; `ShippedFacts.cages`)
- Test: `src/save-ledger.test.ts`, `src/save-merge.test.ts`

**Interfaces:**

- Consumes: `NO_CAGES`, `Cages`, `carriedBy`, `restoredTrips`, `cageKeys`, `hoistsOwned` (Tasks 1 and 2); `MINE_LEVEL_IDS`.
- Produces:
  - `GAME_KEYS` ends with `..., "stockyard", "granite", "cages"`. `CAGE_KEYS = ["assigned", "carried"] as const`.
  - `SaveGame.cages?: { readonly assigned?: Readonly<Partial<Record<MineLevelId, number>>>; readonly carried?: Readonly<Partial<Record<MineLevelId, number>>> }`. Each part is written only when it has a positive entry, and the key is left out when both parts are empty.
  - `readCages(value: unknown, facts: Part<Facts>, granite: Part<Granite>): Part<Cages>` (ruling 12). A missing key reads as `NO_CAGES`. A value that is not a record is `bad`. An unknown key is `newer`. Counts are read with `readCounts(…, MINE_LEVEL_IDS, UNCAPPED)`. Then the refusals. The read's `trips` are `restoredTrips(carried, cageKeys(facts.owned))`. It joins `readGame`'s `worst([...])` list, and the mountain gets `cages`.
  - `ShippedFacts.cages: { assigned: MINE_LEVEL_IDS, carried: MINE_LEVEL_IDS }`.
- No version bump: `SAVE_VERSION` stays 10.

- [ ] **Step 1: Write the failing tests.** In `src/save-ledger.test.ts`, the `LEDGER` gains `"cages"` at the end of `gameKeys`, and `cages: { assigned: ["topsoil", "granite"], carried: ["topsoil", "granite"] }`. Then:

```ts
describe("the cages in the save (#724)", () => {
  it("round-trips the hoists assigned and what the cages carry, level by level", () => {});
  it("saves where no cage is: a cage mid-trip reads back at the top with its load (call 63, Review Focus 1)", () => {
    // trips { "hoist:0": { level: "granite", carried: 250, leg: { kind: "loading" } } } → read → trips { "hoist:0": { level: "granite", carried: 250, leg: { kind: "top" } } }
    // and one live second under partThree unloads it: the saws' pile or stone + 250, rockDug unchanged
  });
  it("writes a part 2 save's game map as before: no cages key", () => {
    expect(Object.keys(writeGame(createMountain()))).not.toContain("cages");
  });
  it("refuses more hoists assigned than he owns, an engine counted", () => {
    expect(
      readGame(
        {
          owned: { hoist: 1 },
          granite: {},
          cages: { assigned: { granite: 2 } },
        },
        0,
      ).kind,
    ).toBe("bad");
    expect(
      readGame(
        {
          owned: { hoist: 1, machine: 1 },
          granite: {},
          cages: { assigned: { granite: 2 } },
        },
        0,
      ).kind,
    ).toBe("ok");
  });
  it("refuses hoists assigned, or rock carried from the Granite, while the shaft is not sunk", () => {});
  it("refuses rock carried from both levels with only the winch's cage", () => {});
  it("reads a cages key or level it does not know as newer, and a part-rock or a negative as bad", () => {});
  it("refuses a save whose hoists assigned are more than he owns, whatever the counts (property)", () => {
    fc.assert(
      fc.property(
        fc.nat(6),
        fc.nat(6),
        fc.nat(6),
        (hoists, topsoil, granite) => {
          // readGame(…).kind === "bad" exactly when topsoil + granite > hoists
        },
      ),
    );
  });
});
```

In `src/save-merge.test.ts`:

```ts
it("settles copies that differ only in hoists assigned or rock carried as copies that differ only in jobs (#724)", () => {
  // for a pair differing in cages.assigned, and a pair differing in carried: mergeSaves(...).kind equals the kind for the same pair differing in jobs.haulage
  // and a copy further on rock dug fast-forwards whatever it assigned
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run src/save-ledger.test.ts src/save-merge.test.ts`. Expected: FAIL on the ledger and the new key.

- [ ] **Step 3: Implement** what the Interfaces say. Use one helper for the maps and one for the refusals (`cagesFit`), the way `readGranite` uses `readGraniteMaps` and `graniteFits`.

- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run src/save-ledger.test.ts src/save-format.test.ts src/save-merge.test.ts src/persist.test.ts src/rules-drift.test.ts && npm run gate -- fast`. Expected: PASS.

- [ ] **Step 5: Commit and push** with the message "The save holds the hoists assigned and what the cages carry, with no reset (#724)".

---

### Task 9: Assigning a hoist is a move

**Files:**

- Modify: `src/economy/actions.ts` (`LevelAction` gains two kinds; `levelActions`, `levelApplied`, the events, `valueOf`)
- Modify: `src/field-log.ts` (`hoist.assign`, `hoist.unassign`)
- Modify: `src/lab/score.ts`, `src/lab/measure.ts` (`MOVE_KIND_ORDER`), `src/lab/decide.ts`: the new kinds in each exhaustive switch
- Test: `src/part-three-moves.test.ts`

**Interfaces:**

- Consumes: `assignHoists`, `unassignHoists`, `unassignedHoists` (Task 2); `graniteOpen`.
- Produces:
  - `LevelAction` gains `{ readonly kind: "assignHoist"; readonly level: MineLevelId; readonly count: number }` and `{ readonly kind: "unassignHoist"; readonly level: MineLevelId; readonly count: number }`.
  - `levelActions` lists, after the Granite's machines and once the Granite is open, for each level in `MINE_LEVEL_IDS` order: `assignHoist` with count 1 while `unassignedHoists > 0`, then `unassignHoist` with count 1 while that level's count is above 0. An `unassignHoist` for a level whose count is above 0 is also listed while the Granite is shut, so a count can always be taken off.
  - `MoveEvent` gains `{ kind: "hoistAssigned" | "hoistUnassigned"; level: MineLevelId; count: number }`, the count being that level's after the move. `fieldEntry` maps them to `{ code: "hoist.assign" | "hoist.unassign", data: { id: level, count } }`.
  - `valueOf`: `{ gainPerSec: 0, cost: 0, paybackSec: Infinity }` (ruling 15). `score.ts` keys them `${kind}:${level}`. `decide.ts` gives them a cost of 0 and no tier.

- [ ] **Step 1: Write the failing tests** in `src/part-three-moves.test.ts`:

```ts
it("lists assigning a hoist to each level once the Granite is open and a hoist is unassigned, and none before (#724)", () => {});
it("assigns at once, free, and logs it", () => {
  // applyMove(m, { kind: "assignHoist", level: "granite", count: 1 }): cages.assigned.granite 1, spent {}, events [{ kind: "hoistAssigned", level: "granite", count: 1 }]
  // fieldEntry → { code: "hoist.assign", data: { id: "granite", count: 1 } }
});
it("refuses an assign with every hoist assigned: nothing changes", () => {});
it("lists taking a hoist off a level while it has one, also with the Granite shut", () => {});
it("values neither as income (the lab's, #675)", () => {});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run src/part-three-moves.test.ts`. Expected: FAIL, because the new kinds do not exist.

- [ ] **Step 3: Implement** what the Interfaces say. Put each new case after the existing ones in each switch.

- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run src/part-three-moves.test.ts src/economy/actions.test.ts src/economy/invariants.test.ts src/field-log.test.ts src/ledger-rows.test.ts src/lab/score.test.ts && npm run gate -- fast`. Expected: PASS. `src/economy/__snapshots__/actions.test.ts.snap` does not change.

- [ ] **Step 5: Commit and push** with the message "Assigning a hoist to a level, or taking one off, is a move, off in play (#724)".

---

### Task 10: Docs, the ledger's end hashes, and the proof

**Files:**

- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/pacing-ledger.md` (written by `npm run lab:ledger`)

`docs/DESIGN.md`, `docs/design-intent.md`, `docs/ui-audit.md`, `docs/ART.md` and `.claude/rules/observable-saves.md` do not change: nothing the player sees changes, and the save is still version 10.

- [ ] **Step 1: Write the ARCHITECTURE bullet** after the #673 bullet: "Hoists that travel (#724; slice 1 spec, rules 5.5 to 5.14, Starting numbers, The save): behind part 3's switch, off in play." In the style of the #673 bullet, it names:
  - `cages` (the cages and their keys, `tripSeconds`, the loads and the winch's cap, the assigned places, `cageRates`, `cagePileRoom`, assigning, and the knobs `trip.topsoil`, `trip.granite` and `piles.loads`);
  - `cage-trips` (`cageInstant`, `landCages`);
  - `mine-cages` (`flowMineLive`, `landedMine`), and how `accrue` chooses: cages for `live`, rates away;
  - `piles`' `pour` and `Branches.shared.turn`, which replaces #673's even split;
  - `mine-piles`' `mineWork`, `shaftHolds`, `makerHolds`;
  - `LineWork.hoisting`;
  - the moves and their log codes;
  - "Save: `cages` in the game map (`assigned`, `carried`), no version bump."

  In "The game map" bullet of the save section, add `cages`: what the cages carry, by level, and not where they are; and the hoists assigned, never more than he owns.

- [ ] **Step 2: Write the ledger again.** Run `npm run lab:ledger` in the background and wait for it to finish. Then run `git diff --word-diff=porcelain docs/pacing-ledger.md | grep -E '^[-+][^-+]'`. Expected: every changed word is an End hash, and no day moved. If a day moved, part 3 leaked into play: stop, find the leak with `superpowers:systematic-debugging`, and fix it before going on.

- [ ] **Step 3:** Run `npm run gate -- fast`. Expected: OK, including prettier on both docs.

- [ ] **Step 4: Check that the phone did not change** (rung 3 of the ladder). The live tick now passes `live` down into the mine:
  - Run `VISUAL_ONLY='slice refinery' npm run visual`. Expected: the sections pass.
  - Run `npm run play -- --save refinery`. Expected: the refinery plays as before. Its `log.txt` shows no page error, and the save line shows the account and its latest log.

- [ ] **Step 5: Commit and push** twice. First the ledger: "The pacing ledger's end hashes take the cages' new key; the pace is unchanged (#724)". Then the doc: "Docs for hoists that travel (#724)". Then open the PR (ship-sitting) and start the full gate on the final commit in the background: `npm run gate -- full`. Do not wrap it in `timeout` or poll it. Its `lab --ci --ledger check` proves that the pace did not move. Its visual check and journeys prove that part 1's and part 2's screens and journeys did not change, and its `sim` project runs Task 7's hour. Then run `npm run gate -- signoff` after the push, as ship-sitting says.

## How parts 1 and 2 are proven unchanged

- `part3.off` is never held by the page (#673's boot test). Every new path reads `partThreeOn()`, through `mineWork(...).lift`, `shaftHolds`, `makerHolds`, `flowMineLive`, `landedMine` or `graniteOpen`.
- With part 3 off, `flowMineLive` is `flowMine`, `landedMine` returns the same object, the lift is `stages.lift`, and the rooms are today's. Task 6's property shows that live and unattended accrue match with part 3 off. The `parts 1 and 2 do not change` block in `part-three.test.ts` still passes.
- The existing suite passes, with only these widened: the save ledger, `piles`' `Branches` tests (the turn replaces #673's even split, which only part 3 reads), and `part-three.test.ts`'s hoisting numbers. The actions snapshot does not change.
- The full gate's labs check the pacing ledger (`--ledger check`). Only the end hashes moved (Task 10). Its visual check and journeys run part 1's and part 2's screens.

## What is left for later slivers

- #675 (the lab plays the whole slice) names the lab's measure `cageGap`, sets its bound and the piles' loads, sets the trips and the winding engine's numbers, and gives the hoist moves and `steadyIncome` the cages.
- #680 (the mine with two levels) draws the cages where they are (`mine-scene`'s `drawCage` reads `cages.trips`), adds the strip under Hoisting with − and + for each level (the amount key), says what the cages lift now, and reads the cages' piles' rooms in place of `PILE_HOLDS`.
- Slice 2 gives the winding engine a count of its own (call 70).
