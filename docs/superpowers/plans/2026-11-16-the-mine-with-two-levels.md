# The mine with two levels (#680) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. When the plan is done, use the ship-sitting skill, not `superpowers:finishing-a-development-branch` directly.

**Goal:** The mine on slice 1's frame with two levels, behind part 3's switch.

- He sinks the shaft from the mine.
- Each level has its own drilling and haulage rows on the level, with their workers between − and +, and its two piles under its gallery.
- The shaft is clear, and every cage is seen going down, loading, coming up and unloading.
- Hoisting has one row under the keys, and one strip under it assigns the hoists to the Topsoil, the Granite, or both in turn.
- A machine's key asks which level.
- The workforce lists the mine's jobs by level.

The phone does not change. Part 3 stays off on every page but a dev page with `?part3=1`.

**Architecture:**

- The two-level views are pure and live in a new module, `src/mine-level-view.ts`. `mine-view.ts` is already 516 lines and holds the one-level views. The new module reuses `mine-view`'s `rowParts`, `printedParts` and the row's sum forms (exported for it), and never copies them.
- The rules stay where #673 and #724 put them:
  - `mine-levels`: the shaft and the Granite;
  - `workforce`: `LEVEL_JOBS`, `levelWorks`, `stageMachines(…, level)`;
  - `cages`: `shaftCages`, `cageRates`, `tripSeconds`, `unassignedHoists`;
  - `mine-piles`: `mineWork`, `shaftHolds`, `faceHolds`, the levels' branches.
- The canvas gains a second gallery and the cages (`src/mine-scene.ts`). `src/mine-site.ts` paints the two-level layout and changes the game only through `progress.dispatch`, with moves that exist: `sinkShaft`, `buyTier(s)`, `buyGraniteMachine`, `assignHoist`/`unassignHoist`, and the jobs' place and free.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom for DOM tests), canvas 2D, puppeteer visual check and `npm run play`.

**Spec:**

- `docs/superpowers/specs/2026-11-14-slice-1-design.md`, What he sees:
  - The mine, With two levels (`mine-two-levels.png`, `machine-level-card.png`);
  - The workforce (`workforce-two-levels.png`);
  - What the prototype does not show (the amount key, the lamps);
  - What any screen has to meet.
- Issue #680, as split on planning: #754 takes the card for a level reached, the saws' plate and the trucks' key.
- The prototype is `prototypes/slice-1/proto.src.html`, version 17: `mineDraw`, `mineDOM`, `mineUI`, `crewLine`, `assign`, `hoistSay`, and the machine card in `buyStage`. Its geometry is `W = 212, SURF = 40, LH = 79, TF = LH - 8, TT = TF - 32`.

## Global Constraints

- The ladder in `.claude/rules/dad-friendly-work.md`:
  - the test file;
  - `npm run gate -- fast`;
  - one visual section and `npm run play`;
  - the full gate once on the PR's final commit.
- `part3.off` reads 1 on every page. `?part3=1` holds it at 0 on a dev page only (#681). Boot, the journeys, the pacing ledger and the save do not change: no reset, save version 10, and no new save fact.
- With part 3 off, or the Granite not sunk while part 3 is off, the mine site paints exactly as today: the same DOM and the same visual shots.
- The phone never scrolls, at 424×924 and at 424×830 (the visual check's `noScroll`). A long list scrolls inside its box.
- Words:
  - Plain engineering words. Never "face", "hands" or "by hand".
  - Nothing names a limit, the bottleneck or which level a hoist should serve.
  - What he assigns is a plain number between − and +.
  - Settled words, used as they are:
    - the strip's names "Topsoil", "Granite" and "Both in turn", and its form `<NAME> <rate>/s − <n> hoist(s) +`;
    - the row form "TOPSOIL drilling 1,300 of 1,300/s" and "HAULAGE 1,300 of 1,600/s";
    - the pile words "Drilled rock", "Rock at the shaft";
    - "Deeper strata: not yet surveyed. The city has to grow first.".
- Every new line on the screen is Flemming's to approve before the merge. It is one question, with phone pictures, sent through the coordinator. The proposed lines are in ruling 10.
- No placeholders. The second gallery, the shaft and the cages use the game's sprites: `cage`, `tub-full`, `tub-empty`, the miner, the drill, and the Granite's earth drawn in code as the prototype draws it.
- Function limits (150 lines, complexity 15), cycles, knip and the coverage floors, as always.

## Rulings (agent-run sitting)

1. **Where it shows.** The two-level layout shows while `partThreeOn()` and `graniteOpen(mountain)` both hold. With part 3 on and the shaft not sunk, the one-level layout shows, with the Granite's plate under the Topsoil (ruling 7). With part 3 off, today's layout shows, untouched.
2. **A level's rows** are `StageRow`s, as the one-level rows are, built from that level's machines (`stageMachines(mountain, speed, stage, level)`) and workers (`mountain.jobs[LEVEL_JOBS[level][stage]]`).
   - "Now" is the level's own flow through its piles, from the two levels' branches (`branchChains` and `chainFlows`).
   - The band's scale is the strongest of all five stages on the mine.
3. **Hoisting's row** with two levels:
   - "Can" is what the running cages lift as they are assigned. That is the strip's three rates plus the winch's rate. A cage for one level lifts load ÷ that level's trip. The cages for both lift 2 × their loads ÷ (the Topsoil's trip + the Granite's trip), one load from each level a round.
   - "Now" is what the branches' shared hoisting moves now through the piles. The spec's "what the cages lifted on their last trips" is not kept anywhere, and the rates are what a night counts (rule 5.14). Ruling: the rates, so the row and the night agree.
   - Its sum is the hoists' and engines' parts (the workers they have, of the workers they take) plus "N on winches", in the existing sum forms.
4. **The strip** has three cells, `topsoil`, `granite` and `both`:
   - **counts:** `cages.assigned.topsoil`, `cages.assigned.granite`, and `unassignedHoists`. The three add up to the hoists and engines he owns.
   - **rates:** the running cages each place serves, as in ruling 3. The three add up to the row's hoist part.
   - **keys:** − is dark at 0, and + is dark when none is left for both. The keys follow the amount key: ×10 moves up to ten, and Max moves all (spec, The amount key, call 66).
   - **a tap that moves nothing:** a tap on a cell's name, or on a dark key, writes one line in the mine's note (ruling 10).
5. **A machine's key with two levels.** A tap on drilling's or haulage's key opens the machine card. Hoisting's key buys at once, as today.
   - The card shows the machine's key (what it moves, its price, the workers it takes), what each level has of that kind ("Topsoil: 2 drills", "Granite: 0 drills"), one key for each level drawn alike, and "Not now".
   - The Topsoil's key dispatches `tierBuyMove(id, count)`. The Granite's dispatches `buyGraniteMachine`.
   - `buyGraniteMachine` gains `count` (`{ kind, id, count }`), priced and paid as `buyTiers` is (`tierQuote` at that amount), and logged `granite.buy` with the count. The lab lists it with count 1. With part 3 off it is never listed, so the actions snapshot does not change.
6. **The price's good.** `machineKey` reads `tierGood(id)`: the borer and the locomotive cost cut stone in part 3 (#673). That good decides `can`, the label's good word, and the price's icon. With part 3 off every machine costs stone, as today.
7. **The Granite before the shaft** (part 3 on, not sunk):
   - Under the Topsoil's gallery, a plate for the Granite reads "Granite · not reached".
   - Until `shaftOpen`, it says "The shaft can be sunk once the Light Tower is operational.".
   - Once open, a Sink key shows its price (`shaftPrice()`, stone and brick, with icons), lit when he can pay. Its tap dispatches `sinkShaft`.
   - "Deeper strata…" moves under the last level shown.
8. **The scene** keeps one level's drawing for one level. With two levels:
   - The shaft runs to the Granite's floor and has nothing on it but the cages.
   - Each cage is drawn at its depth: at the top, on a leg down or up (by seconds left of `legSeconds(level, way)`), or at its level while loading. Each carries a full tub while `carried > 0`, else an empty one.
   - Cages with no trip entry are at the top, and the scene draws at most one of those.
   - Each level draws its own heaps, tubs and workers, as the Topsoil does.
   - Hoisting's workers stand by the shaft on the Topsoil. A "z" goes over the share that is idle, from hoisting's flow against its "can".
9. **The workforce by level.** With the Granite open, the mine's jobs are three groups: "Topsoil" (drilling, haulage), "Granite" (drilling, haulage) and "Shaft" (hoisting). Otherwise it is today's one mine group. The rows' notes count that level's machines.
10. **Proposed new lines**, each Flemming's to approve before the merge (Global Constraints). The prototype's words are kept where it has them.
    - The machine card's title: "A drill for which level?" (or "A cart for which level?", "A borer…", "A locomotive…", by the kind).
    - The machine card: "It stays on the level it is bought for." and "Not now". Each level's line: "Topsoil: 2 drills".
    - The strip's one line on a tap that moves nothing: "A hoist for one level waits there for a whole load, or until no more rock is coming. A hoist for both takes what is there and goes on to the other."
    - The Granite before the shaft: "Granite · not reached", and "The shaft can be sunk once the Light Tower is operational.".
    - The Sink key: "Sink the shaft to the Granite", with the prototype's small line "A second level. Opens saws, the factory, locomotives.".
    - The workforce's group names: "Topsoil", "Granite", "Shaft".
    - The winch summand: "N on winches", the prototype's form.
11. **The lamps.** The mine's count already includes the shaft (`next-view`). It also counts a machine bought for either level, so a lit key's card always has a lit level key. No new lamp.
12. **Out of this sliver:**
    - the card for a level reached, the saws' plate and the trucks' key (#754);
    - the factory (#681, merged);
    - the lab's numbers (#675);
    - a stage's full list (#661) with two levels. It opens the Topsoil's stage as today. Its Granite rows go to #675/#682 if needed, as a ruling in the PR body.

## Review Focus

1. **The strip adds up.** With hoists on both levels and for both, the three counts sum to the hoists and engines he owns, and the three rates sum to the row's hoist part. Pinned in Task 1.
2. **A Max tap on the strip with no hoist left for both** moves nothing and never assigns more than he owns (`assignHoists` clamps). Pinned in Task 1 (view) and Task 4 (site).
3. **Part 3 off paints today's mine exactly.** The site test compares the DOM's text and structure. The visual sections `slice frame` stay unchanged. Pinned in Task 4.
4. **The cut-stone price.** A borer key with part 3 on and enough stone but no cut stone is not lit, and its label names cut stone. Pinned in Task 1.
5. **No scroll at 424×830 with two levels**, also with three summands in a row's sum (the short form). Pinned in Task 5's visual section.

---

### Task 1: The two-level views (pure)

**Files:**

- Create: `src/mine-level-view.ts`, `src/mine-level-view.test.ts`
- Modify: `src/mine-view.ts`. Export the sum forms (`sumForms`) and `rowPile`'s shape for reuse. `machineKey` reads `tierGood` (ruling 6).
- Modify: `src/mine-piles.ts`. Add `mineLevelFlows`.
- Test: `src/mine-view.test.ts` (the cut-stone key)

**Interfaces:**

- Consumes:
  - `stageMachines(mountain, speed, stage, level)`, `LEVEL_JOBS`, `lineWork`, `toolSpeed` (workforce);
  - `mineWork(mountain).cages` and `cageRates`, `tripSeconds`, `unassignedHoists`, `hoistsOwned` (cages);
  - `shaftHolds`, `faceHolds` (mine-piles);
  - `graniteOpen`, `shaftOpen`, `shaftPrice` (mine-levels);
  - `partThreeOn` (part-switch);
  - `rowParts`, `printedParts`, `StageRow`, `RowPile`, `pileWords`, `machineKey` (mine-view);
  - `tierGood` (tiers).
- Produces:
  - `mineLevelFlows(mountain: Mountain, now?: number): { readonly levels: Readonly<Record<MineLevelId, { readonly face: number; readonly haul: number }>>; readonly lift: number }`, in `mine-piles.ts`. It gives each level's drilling and haulage flow, and the shared hoisting's flow, through the piles, at pay 1 with the crew timer. With one level, the Granite's are 0 and the Topsoil's are `mineChain`'s.
  - `type MineLevel = { readonly level: MineLevelId; readonly name: "Topsoil" | "Granite"; readonly rows: readonly [StageRow, StageRow]; readonly piles: { readonly face: RowPile; readonly shaft: RowPile } }`. `rows` holds drilling first, then haulage. Each `StageRow.job` is that level's job.
  - `mineLevels(mountain: Mountain, now?: number): readonly MineLevel[]`. It returns the two levels while ruling 1's two-level layout holds, else `[]`.
  - `hoistingRow(mountain: Mountain, now?: number): StageRow`, per ruling 3.
  - `type StripCell = { readonly place: MineLevelId | "both"; readonly name: string; readonly count: number; readonly unit: "hoist" | "hoists"; readonly rate: string; readonly rateValue: number; readonly canLess: boolean; readonly canMore: boolean }`
  - `hoistStrip(mountain: Mountain): readonly [StripCell, StripCell, StripCell]`, per ruling 4. The both cell's `canLess` and `canMore` are false.
  - `type ShaftGate = { readonly kind: "waits"; readonly words: string } | { readonly kind: "open"; readonly price: readonly { readonly good: Good; readonly amount: number; readonly text: string }[]; readonly can: boolean }`
  - `shaftGate(mountain: Mountain): ShaftGate | undefined`. It is undefined unless part 3 is on and the Granite is unsunk.
  - `HOIST_WAITS_LINE` and the other ruling 10 strings, exported from `mine-level-view.ts` so the site and its tests read one copy.

- [ ] **Step 1: Write the failing tests** in `src/mine-level-view.test.ts`. Use `partThree`, `partTwo` and `levels` from `src/part-three.harness.ts`, and the names below.
  - `"shows no levels while part 3 is off, or the Granite is not sunk"`: `partTwo(() => mineLevels(m))` is `[]`. So is `partThree(() => mineLevels(levels({ sunk: false })))`.
  - `"gives each level its own drilling and haulage rows, on its own workers and machines"`: with `levels({ topsoil: 4, granite: 2, sunk: true })`, the Topsoil's rows' `workers` are `[4, 4]` and the Granite's `[2, 2]`. Each row's `job` is `LEVEL_JOBS[level][stage]`.
  - `"says each level's piles with their rooms"`: the Granite's shaft pile `holds` is `shaftHolds(m)`, and its face pile `holds` is `faceHolds("granite")`. `held` is the Granite's own pile.
  - `"adds the strip's counts up to the hoists he owns, and its rates up to the row's hoists"`: with 3 hoists, `assigned: { topsoil: 1, granite: 1 }` and enough hoisting workers, the counts are `[1, 1, 1]` and their sum is `hoistsOwned(m.owned)`. The rateValues sum to the hoisting row's can minus the winch's part, within 1e-9. The Topsoil cell's `rateValue` is load ÷ 10, the Granite's load ÷ 20, and the both cell's 2 × load ÷ 30.
  - `"darkens − at none and + with none left for both"`: with `assigned: { topsoil: 0, granite: 3 }` and 3 hoists, the Topsoil cell has `canLess` false and `canMore` false.
  - `"tells the shaft's gate: waiting, then a price he can or cannot pay"`: unsunk without the Light Tower gives `kind: "waits"`. With the Light Tower and short of brick, it gives `kind: "open", can: false`, with price goods `["stone", "brick"]`.
- [ ] **Step 2: Add to `src/mine-view.test.ts`** `"prices a borer in cut stone in part 3, lit only by cut stone"`: with part 3 on, an unsunk mine whose borer is on sale, `stock.stones` far above the price and `stock.cutStone` 0, the borer key has `can` false and a label that contains "cut stone".
- [ ] **Step 3: Run them to see them fail:** `npx vitest run src/mine-level-view.test.ts src/mine-view.test.ts`. Expected: FAIL (module missing, cut-stone assertion).
- [ ] **Step 4: Implement** `mineLevelFlows` (mine-piles) and the views (mine-level-view), and change `machineKey` (mine-view). Reuse `rowParts`, `printedParts` and the sum forms; never copy them.
- [ ] **Step 5: Run the tests to pass**, then `npm run gate -- fast`. Expected: PASS, and the gate OK.
- [ ] **Step 6: Commit and push:** "The mine's two levels as views: each level's rows and piles, Hoisting's row, the strip and the shaft's gate, off in play (#680)".

### Task 2: The Granite's machine buys an amount

**Files:**

- Modify: `src/economy/actions.ts`. `buyGraniteMachine` gets `count`.
- Modify: `src/lab/decide.ts`, `src/lab/score.ts`, `src/lab/measure.ts`, but only where the type needs it (inert).
- Test: `src/part-three-moves.test.ts`

**Interfaces:**

- Produces: `{ kind: "buyGraniteMachine"; id: LevelMachineId; count: number }`. `graniteBuyMove(id: LevelMachineId, count: number)` in `actions.ts` builds it, for the site.

- [ ] **Step 1: Write the failing test** `"buys ten drills for the Granite at the ten-drill price"`. With part 3 on, the Granite sunk, and stock for ten, `applyMove(m, { kind: "buyGraniteMachine", id: "drill", count: 10 })` leaves the Granite's drills +10 and `owned.drill` +10. It pays `tierQuote(m, drill, 10).cost` in the drill's good. The log has `granite.buy` with `count` (the Granite's count after).
- [ ] **Step 2: Run it to see it fail:** `npx vitest run src/part-three-moves.test.ts`.
- [ ] **Step 3: Implement it.** Pricing and pay are `buyTiers`' path: reuse it, never copy it. Listed moves keep `count: 1`.
- [ ] **Step 4:** Run the test, then `npm run gate -- fast`. Expected: PASS. The actions snapshot is unchanged.
- [ ] **Step 5: Commit and push:** "The Granite's machine buys at the amount key's count, off in play (#680)".

### Task 3: The workforce by level

**Files:**

- Modify: `src/workforce-view.ts`, `src/workforce-sheet.ts` (only if the groups' rendering needs it)
- Test: `src/workforce-view.test.ts`

**Interfaces:**

- Produces: `jobSites(mountain: Mountain)`. Today it takes no arguments. With two levels, the mine is the three groups of ruling 9, in that order. Callers pass the mountain.

- [ ] **Step 1: Write the failing test** `"lists the mine's jobs by level once the Granite is open"`. With part 3 on and sunk, the groups' names begin `["Topsoil", "Granite", "Shaft", …]` with jobs `[["drilling", "haulage"], ["graniteDrilling", "graniteHaulage"], ["hoisting"]]`. With part 3 off the groups are today's.
- [ ] **Step 2:** Run it to see it fail: `npx vitest run src/workforce-view.test.ts`.
- [ ] **Step 3: Implement it.** The rows' notes ("3 of 3 drills run") count that level's machines, through `stageMachines(…, level)`.
- [ ] **Step 4:** Run the test, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit and push:** "The workforce lists the mine's jobs by level once the Granite is open, off in play (#680)".

### Task 4: The site with two levels, and the machine card

**Files:**

- Modify: `src/mine-site.ts`, `src/mine.css`. Split into `src/mine-levels-site.ts` if `mine-site.ts` passes about 450 lines, or a function passes its limit.
- Modify: the frame's card layer, where the stage's list opens (`src/frame-cards.ts` or `src/board-card.ts`, whichever opens a card over a site today), for the machine card.
- Test: `src/mine-site.test.ts` (happy-dom)

**Interfaces:**

- Consumes: Task 1's views, Task 2's `graniteBuyMove`, `tierBuyMove`, the moves `sinkShaft`, `assignHoist` and `unassignHoist` with `count` from the amount key (`movable`), and `job-steps` for − and + on the level rows.

- [ ] **Step 1: Write the failing tests** in `src/mine-site.test.ts`:
  - `"paints today's mine with part 3 off"`: the site's `textContent` and its rows' `data-stage` list equal a snapshot taken before this task. Write it first and see it pass on the old code, then keep it.
  - `"paints each level's rows on the level and its piles under its gallery"`: with part 3 on and sunk, the DOM has two `.mine-level-rows` with `data-level` `topsoil` and `granite`. Each holds two rows, and the first row's head reads "TOPSOIL drilling …". The pile words "Rock at the shaft: … of …" and "Drilled rock: … of …" show for each level.
  - `"assigns a hoist from the strip"`: a tap on the Granite's + dispatches `{ kind: "assignHoist", level: "granite", count: 1 }` at ×1, and `count: 10` at ×10.
  - `"writes the hoists' line when a tap moves nothing"`: a tap on a dark + (none left for both) shows the note with ruling 10's line, and dispatches nothing.
  - `"asks which level when a drill's key is tapped, and buys for the chosen level"`:
    - the card opens with the title "A drill for which level?", both levels' keys and "Not now";
    - the Granite's key dispatches `graniteBuyMove("drill", 1)`, and the Topsoil's `tierBuyMove("drill", 1)`;
    - "Not now" closes the card and dispatches nothing.
  - `"sinks the shaft from the Granite's plate"`: unsunk with the shaft open, the Sink key dispatches `{ kind: "sinkShaft" }`. Before the Light Tower, the plate shows the waits line and no key.
- [ ] **Step 2:** Run it to see it fail: `npx vitest run src/mine-site.test.ts`.
- [ ] **Step 3: Implement the layout** after the prototype's `mineDOM` and `mineUI`, version 17:
  - the level rows over the canvas at each level's art row;
  - the piles under each gallery;
  - the keys row;
  - Hoisting's row;
  - the strip as one line of three cells;
  - the note.

  The one-level path is untouched.

- [ ] **Step 4:** Run the tests, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit and push:** "The mine paints two levels, the strip that assigns the hoists and the card that asks a machine's level, off in play (#680)".

### Task 5: The scene with two levels and the cages, and the browser proof

**Files:**

- Modify: `src/mine-scene.ts`, `src/mine-view.ts` (`mineScene` keeps one level), `src/mine-level-view.ts` (adds the two-level scene view)
- Modify: `tools/browser/fixtures.ts` (two saves: `granite-unsunk` and `two-levels`, part 3 on a dev page), `scripts/play.mjs` (the saves), `scripts/visual/frame.mjs` (section `slice mine two levels`, at 424×924 and 424×830, with `noScroll`), `scripts/ui-audit.mjs` if the factory's section shows how.
- Test: `src/mine-level-view.test.ts`

**Interfaces:**

- Produces:
  - `type CageSprite = { readonly depth: number; readonly loaded: boolean }`. `depth` is 0 at the top, 1 at the Topsoil's floor and 2 at the Granite's.
  - `type TwoLevelScene = { readonly levels: Readonly<Record<MineLevelId, MineScene["stages"] & { readonly facePile: number; readonly shaftPile: number; readonly load: number; readonly unload: number }>>; readonly cages: readonly CageSprite[]; readonly hoisting: { readonly workers: number; readonly busy: number } }`
  - `twoLevelScene(mountain: Mountain): TwoLevelScene`. `drawMine` takes a `MineScene | TwoLevelScene` (a union on a `levels` field), and the one-level drawing stays as it is.

- [ ] **Step 1: Write the failing test** `"puts each cage at its depth on its trip"`:
  - a cage `{ level: "granite", leg: { kind: "down", left: legSeconds("granite", "down") / 2 } }` has a depth of 1.5;
  - one loading at the Topsoil has a depth of 1, loaded while `carried > 0`;
  - an empty top cage has a depth of 0;
  - with three fresh cages, only one is at the top.
- [ ] **Step 2: Run it to see it fail**, then implement the view and the drawing, after the prototype's `mineDraw`: the shaft to the Granite's floor, the cages with their tubs, the second gallery's earth and lamps, and each level's heaps, tubs and workers.
- [ ] **Step 3:** Run the test, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 4: The phone check.**
  - `VISUAL_ONLY='slice mine two levels' npm run visual`: expected to pass, with no scroll at both sizes.
  - `VISUAL_ONLY='slice frame' npm run visual`: expected to pass unchanged.
  - `npm run play -- --save two-levels`: tap the Granite's drilling +, the strip's Granite +, a drill's key and its Granite key, and "Not now". Expected: no page error, the save line ok, and the cages seen moving in two shots a few seconds apart.
  - `npm run play -- --save granite-unsunk`: tap Sink. Expected: the two-level layout.
- [ ] **Step 5: Commit and push:** "The mine's scene draws both levels and every cage on its trip; dev saves and the visual section for two levels (#680)".

### Task 6: Docs, and the question to Flemming

**Files:**

- Modify: `docs/ARCHITECTURE.md` (a #680 bullet after #724's), `docs/DESIGN.md` (the mine with two levels), `docs/ui-audit.md` (the new section and its shots, `docs/ui-audit/slice-mine-two-levels-424x924.png`)

- [ ] **Step 1:** Write the docs in the style of #681's lines.
- [ ] **Step 2:** `npm run gate -- fast`. Expected: OK.
- [ ] **Step 3: Commit and push:** "Docs for the mine with two levels (#680)".
- [ ] **Step 4 (controller):** Save the phone shots of the two-level mine, the machine card, the unsunk Granite and the workforce under `/mnt/project-files/mine-two-levels/`. Send the coordinator one full question: ruling 10's lines with the pictures attached, three options and one recommended. Swap nothing on the issue until the PR is ready, then `needs-you` if he has not answered.
