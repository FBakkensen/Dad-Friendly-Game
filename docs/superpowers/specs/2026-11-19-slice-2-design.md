# Slice 2, the Crystal Caves: design (19 Nov 2026)

Status: approved for its spec PR (#764, parent #763). Flemming made five calls that set this design:

- **17 Nov 2026, 09:43Z (#762):** Every movement between sites goes by transport, one kind of good per vehicle, and vehicles share themselves evenly and visibly first, with manual `−` / `+` vehicle assignment per run in a later part of Slice 2 (the save reserves room for fixed assignments from part 1 so the later part resets nothing).
- **19 Nov 2026 (Scope, Option 1):** Slice 2 includes physical transport runs (#762, in two parts), the Research vs. steady-flow Factory split (#751), and the Crystal Caves level with the next City buildings. Slice 1 Part 3's economy kinks (#757) are folded into Slice 2's lab pass. Worker upkeep (#693) waits for Slice 3.
- **19 Nov 2026 (Phone UI, Option 1):** Transport moves out of the City page to a **global sheet** (sibling to Workforce), keeping the bottom site bar at 4 spacious tabs (`Mine · Refinery · Factory · City`). Research lives behind a City building (**The Research Lab**).
- **19 Nov 2026 (Production chain, Option 1 + multi-input rule):** Retire the old clay/iron trickle bins so every good uses the same stockyard and transport rules (5 stockpiles: Stone, Brick, Cut stone, Glass, Parts). Both Refinery recipes (starting with Glassworks) and, more prominently, Factory lines take **multiple inputs**, each with its own finite input buffer.
- **19 Nov 2026 (City buildings & prototype, Option 1 + "Continue"):** The Foundry opens Crystal Caves, Glassworks, and the steady-flow Factory; Building 4 (**The Research Lab**) opens Research as the single home for all lasting upgrades and gear; Building 5 (**The Rail Depot**) opens Trains and ends Slice 2. Flemming answered the tappable phone prototype (`prototypes/slice-2/proto.src.html`) with "Continue".
- **20 Nov 2026 (PR #765, Option 1):** Raw rock becoming **Stone** travels on its own physical `Mine → Stockyard` transport run (`pitToStockyardStones`) with zero bypass—keeping `#762` completely consistent across every inter-site movement from Evening 1.

This design covers many slivers across three playable parts. It ships as its own PR (#764) and is split into sliver issues under #763 (`.claude/rules/superpowers.md`). It extends `docs/superpowers/specs/2026-11-14-slice-1-design.md` and carries out #751 and #762. Every number in this document is a starting value for the strategy lab, not a tuned one.

---

## Why

Slice 1 (#530, live through Part 3 in #682) proved the core loop to the Foundry's roof, and left four concrete gaps observed in play and in the lab:

1. **Rock teleported into makers.** In Slice 1, rock hoisted from Topsoil and Granite fell straight into the kilns and saws for free, while transport served only City and Factory orders. Making every inter-site movement physical (#762) turns Transport into the real logistics network joining all four sites.
2. **The Factory felt like Research, not manufacturing.** One-off blueprint gear installed permanently on a single station is research, not steady-flow factory production (#751), and its tiny-cap clay (10) / iron (35) trickle ran beside the real stockyard as a second incompatible resource system.
3. **The Foundry's roof had no payoff, and Crystal Caves had no job.** Cut stone and locomotives moved into Slice 1 Part 3, leaving the Foundry without a power and Crystal Caves without a refined good or downstream consumer.
4. **Part 3's economy needed retuning (#757).** Borers and locomotives went unbought (all cut stone went to the Foundry), trucks (400/s) outpaced builders (8/s) by 50:1, and workers priced purely in stone stalled as makers consumed rock. Putting all movements on physical transport reshapes the entire economy from evening 1, so #757 is retuned cleanly inside Slice 2 Part 1's lab pass rather than twice.

---

## Slice 2 in one page

| Stretch                                                                                       | What he has                                                                                                                                                                                                                                                       | What is new                                                                                                                                                                                              | The decision                                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Physical transport & rebalanced Slice 1 (Part 1, to the Foundry's roof)                    | Topsoil & Granite, global Workforce, global **Transport** sheet (even-share runs), Kilns & Saws, Stockyard, Light Tower, Warehouse, Foundry.                                                                                                                      | Every inter-site movement is a physical single-good transport run (pithead rock → Kilns/Saws, Stockyard → City). Clay/iron trickle and old one-off blueprints are retired; `#757` economy is rebalanced. | Fleet size & drivers vs. mine/refinery/builder workers; balancing Trucks, Builders, Borers, and Locomotives.                                                         |
| 2. Crystal Caves, steady-flow Factory & The Research Lab (Part 2, to the Research Lab's roof) | **Foundry's roof** opens **Crystal Caves** (3rd level), multi-input **Glassworks** (Crystal rock + Stone → Glass), and the steady-flow multi-input **Factory** (`Parts Press`: 2 inputs; `Precision Assembly`: 3 inputs), plus Building 4 (**The Research Lab**). | Multi-input Refinery & 2-/3-input Factory lines feeding `Parts`; **Research** inside the City as the single home for all lasting upgrades & gear, delivered physically by Transport.                     | Splitting hoists across 3 levels; keeping Stone flowing to Glassworks and Brick/Cut stone/Glass flowing to Factory lines; choosing which Research project runs next. |
| 3. Manual transport assignment & Trains (Part 3, to the Rail Depot's roof)                    | **Manual `−`/`+` run assignment** in Transport (unassigned staffed vehicles still share evenly), Building 5 (**The Rail Depot**), **Trains** (3rd transport tier).                                                                                                | Dedicated vehicles per run; Trains (high-capacity carriers priced in Cut stone + Glass); Slice 2 end card at the Rail Depot's roof.                                                                      | Which starved runs deserve dedicated vehicles vs. staying in the shared pool; investing in Trains vs. finishing the Rail Depot.                                      |

---

## Goals

- **Every inter-site movement is physical (#762).** Stock moves only when vehicles carry it on a single-good run from a source stockpile/pithead to a destination buffer.
- **Discovery stays untouched.** Multi-input Refinery makers and Factory lines show each input's separate buffer (`N of M`), their live rate vs. max rate, and a standing/idle state—never naming the bottleneck, a starved run, or the best buy.
- **One uniform resource system.** Retire the clay/iron trickle bins. All five goods (`stones`, `brick`, `cutStone`, `glass`, `parts`) live in the stockyard, share the same `Price` lists (`src/stock.ts`), and travel on the same Transport network.
- **Factory makes goods; Research holds lasting gains (#751).** Factory lines run continuously into the `parts` stockpile. All lasting upgrades and gear live in one place (**The Research Lab**), chosen one at a time by the player and never auto-started while away.
- **Zero phone page scroll.** The bottom site bar stays 4 generous tabs (`Mine · Refinery · Factory · City`), Transport is a global sheet sibling to Workforce, and all screens fit `424×924` and `424×830` with no page scroll.
- **Every part is playable on his phone.** Parts 1, 2, and 3 each ship live; only Part 1 resets the save (v11), and Parts 2 and 3 add facts with defaults without resetting.
- **Open lists to Mars.** Levels, goods, multi-input makers/lines, transport runs, research projects, vehicles, and buildings remain data tables, never closed sets.

## Non-goals

- **No worker upkeep (#693).** Deferred to Slice 3. Free workers cost nothing and never cause debt or leave while away.
- **No Factory-made timed consumables.** Blasting charges and axle grease are retired with the old one-off blueprints; Factory produces steady-flow `parts` only in Slice 2.
- **No Deep Heart (4th level) or Rocket.** Those remain Slice 3 and Later (#563).
- **No expeditions, trouble/hazards, engineers, relics, golden veins, kid-pass, or winding engine.** Permanently out of the game (`docs/decisions.md`).
- **No per-vehicle routing map or manual vehicle dispatch.** In Part 3 he sets an integer count of vehicles dedicated to a run with `−`/`+`; the game never asks him to click vehicles on a map.
- **No separate mines.** One mountain with levels; Mars is the second mine after the rocket (#569).

## Anti-goals

- **A transport lock.** Brick buys trucks, and rock reaches both the Stone stockpile and Refinery makers by transport—so the game must guarantee he can never lock out of Stone or Brick:
  - Horse wagons cost Stone, and a fresh mine starts with **1 worker** (on `drilling`, `FRESH_START_JOBS` in `src/mountain.ts`) and **1 given horse wagon** (`givenFleet` in `src/transport.ts`). Before hiring Worker #2, the player moves that single worker through the four jobs in turn (`drilling` → `haulage` → `hoisting` → `driving`, running `pitToStockyardStones`), earning Stone before any purchase and teaching all four stages on Evening 1 (matching Slice 1's one-worker start). **4 workers** (one each on drilling, haulage, hoisting, and driving) is the minimum steady-state crew for continuous Stone flow.
  - Every worker can be moved off any job and onto driving (or any open job) for free, without losing run assignments (rule 2.5).
- **A silent stall.** If a multi-input maker or Factory line stops because one input buffer is empty or the output buffer/stockpile is full, or if a hoist stalls at the top because a level's pithead buffer is full, the stalled state and the exact level and empty/full buffer or stockpile are visible on screen.
- **A chore in Part 1 or Part 3.** Even-share transport (Part 1) must be playable without babysitting; manual `−`/`+` run assignment (Part 3) must reward thoughtful prioritization without forcing changes every two-minute check-in.

---

## The rules

Each rule names the existing `src/` module it extends (or why a new module is needed).

### 1. Levels & Pithead Rock (`src/mine-levels.ts`, `src/mine-cages.ts`, `src/cage-trips.ts`, `src/cages.ts`, `src/mine-piles.ts`, `src/layers.ts`)

1. **Generalized per-level mine map (ships in Part 1's v11 save; Crystal Caves added in Part 2).**
   - In Part 1 (v11), generalize `src/mine-levels.ts` from a Granite-only field to a per-level map `mineLevels` keyed by deeper `MineLevelId` (`granite` in Part 1; `crystal` added in Part 2). Topsoil remains always open and keeps its machines derived as `owned[m] - sum(deeper)` (preserving Slice 1's invariant).
   - In Part 2, extend `MINE_LEVEL_IDS` to `["topsoil", "granite", "crystal"]`, replacing two-level helpers `otherLevel` (`src/cage-trips.ts`) and `levelPair` (`src/mine-piles.ts`) with open-list iteration over `openLevels(mountain)`.
2. **Crystal Caves opens behind the Foundry (Part 2).** Once `foundry` is operational (Part 2), Crystal Caves appears under Granite as `Crystal Caves · not reached` with its Sink key (starting price: Brick + Cut stone, scaled by `price.crystalShaft`). Sinking opens it with `0` workers and `0` machines on it, showing an arrival card (`The Crystal Caves: reached`, copy open for Flemming's approval).
3. **Hoist trips across three levels (`src/cages.ts`, `src/cage-trips.ts`).** Round-trip times: Topsoil `10 s`, Granite `20 s`, Crystal Caves `30 s` (starting value for lab). The hoisting strip under Hoisting has one `−`/`+` cell per open level plus `All in turn` (generalizing Slice 1's `Both in turn`). Unassigned hoists cycle strictly through open levels that have rock at the shaft or active haulage.
4. **Pithead rock buffers — no bypass (`src/mine-cages.ts`, `src/mine-piles.ts`, `src/cages.ts`).**
   - Every open level has a pithead rock buffer (`pithead[level]`) from the moment it opens (including Topsoil on Evening 1). Its room uses **`cagePileRoom`** (`src/cages.ts`, `max(3, cages.length) * largestLoad`, or `MIN_PITHEAD_ROOM = 300` while only winches run before Hoist #1) so live cages never fall behind offline rates past 3 cages (`#724`).
   - Rock unloaded at the top lands strictly in `pithead[level]` (zero bypass without transport; Flemming, 20 Nov 2026). From `pithead[level]`, physical transport carries rock either to that level's Refinery maker (`pitTopsoilToKilns`, `pitGraniteToSaws`, `pitCrystalToGlassworks`) or to the Stone stockpile (`pitToStockyardStones`).
   - If `pithead[level]` is full, the cage waits at the top and hoisting stalls visibly on screen (naming the level and full pithead buffer).
5. **Level machines.** Drills, borers, carts, and locomotives (`owned.train` in `src/tiers.ts`, distinct from surface `fleet.train`) stay per-level (`src/mine-levels.ts`). Buying a level machine when 2+ levels are open asks which open level it is bought for (`A drill for which level?`, generalized to any number of open levels).

### 2. Physical Transport Network (`src/transport.ts`, `src/workforce.ts`, `src/building-site.ts`)

1. **One global fleet, staffed best-first.** `VEHICLES` in `src/transport.ts` adds a third row in Part 3 (`fleet.train`, distinct from underground locomotive `owned.train` in `src/tiers.ts`):
   - `horseWagon`: priced in `stones`, 1 given at start (starting capacity: lab-tuned from Slice 1's `9/s`).
   - `truck`: priced in `brick`, opens when `warehouse` is operational (starting capacity: lab-tuned alongside builders for `#757`).
   - `train` (Part 3): priced in `cutStone` + `glass`, opens when `railDepot` is operational (starting capacity: `4×` truck).
   - Drivers (`jobs.driving` in `src/workforce.ts`) staff vehicles in `BY_LOAD` order: Trains first, then Trucks, then Horse Wagons. Unstaffed vehicles sit visibly idle.
2. **Typed single-good runs (`RunId`) and deterministic `RUN_ORDER`.** Every inter-site movement is an explicit run carrying **one good** from one source to one destination buffer, listed in the exact deterministic `RUN_ORDER` used by Part 3 vehicle allocation. A run into or out of a maker or Factory line is **closed** while `owned === 0` (its buffer cap is `0`, so Transport never drains stockpiles into unbuilt lines):
   1. **Mine → Stockyard (Stone, open from Evening 1):**
      - `pitToStockyardStones` (`pithead[*]` → `stock.stones`) — always open. Carries raw pithead rock from open levels into the Stone stockpile; when multiple open levels hold pithead rock, pulls proportionally to each pithead's available rock via `shareOut` (`src/building-site.ts`).
   2. **Mine → Refinery:**
      - `pitTopsoilToKilns` (`pithead.topsoil` → Kilns' `topsoilRock` buffer) — open when `makers.kiln > 0`
      - `pitGraniteToSaws` (`pithead.granite` → Saws' `graniteRock` buffer) — open when `makers.saw > 0`
      - `pitCrystalToGlassworks` (`pithead.crystal` → Glassworks' `crystalRock` buffer) — open when `makers.glassworks > 0` (Part 2)
   3. **Stockyard → Refinery (multi-input secondary feeds):**
      - `stockToGlassworksStones` (`stock.stones` → Glassworks' `stones` buffer) — open when `makers.glassworks > 0` (Part 2)
   4. **Stockyard → Factory (one run per input good, Part 2):**
      - `stockToFactoryBrick` (`stock.brick` → Factory `brick` buffers) — open when any Factory line using `brick` has `owned > 0`
      - `stockToFactoryCutStone` (`stock.cutStone` → Factory `cutStone` buffers) — open when any Factory line using `cutStone` has `owned > 0`
      - `stockToFactoryGlass` (`stock.glass` → Factory `glass` buffer) — open when `precisionAssembly` has `owned > 0`
      - When multiple owned Factory lines share one input run (e.g., `brick` feeding both Parts Press and Precision Assembly), delivered units go to the line whose buffer for that good has the lowest fill fraction, splitting ties evenly with `shareOut` (`src/building-site.ts`).
   5. **Factory → Stockyard (Part 2):**
      - `factoryToStockyardParts` (`factoryOutput.parts` buffer → `stock.parts`) — open when any Factory line has `owned > 0`. Factory lines produce into `factoryOutput.parts` (room `0` at `0` owned, scaling to `>= 60 s` of combined Factory output once owned), and Transport physically carries `parts` to the stockyard in the Refinery.
   6. **Stockyard → City (one run per good required by the active step, in `GOOD_IDS` order):**
      - `stockToCity:<good>` while `project.kind === "delivering"` and `stillRequired(site, good) > 0` and `site.onSite[good] < SITE_GOOD_CAP`.
   7. **Stockyard → Research Lab (one run per good required by active research, in `GOOD_IDS` order, Part 2):**
      - `stockToResearch:<good>` while `research.active` is set and `arrived[good] < required[good]`.
3. **Active run rule & source contention.**
   - A run is **active** during a step iff it is open, `source > 0`, and `destinationRoom > 0`.
   - When multiple active runs draw from the **same scarce source stockpile** `g` (e.g., `stock.brick` feeding both `stockToFactoryBrick` and `stockToCity:brick`) and `stock[g] < sum(runCap_r * dt)`, available `stock[g]` is divided proportionally to their allocated capacities using integer `shareOut` (`src/building-site.ts`)—order-independent and matching displayed live rates.
4. **Part 1 & Part 2 allocation (visible even-share with water-filling redistribution).** With manual assignment off (Parts 1 and 2), every active run starts with an equal share of `fleetRate(mountain)`. When any active run is capped by its available source or destination room below its share over the stretch, the unused capacity is redistributed iteratively across the remaining uncapped active runs (water-filling), rounded to whole units with `shareOut` (`src/building-site.ts`, zero fractional drift). The Transport sheet displays each run's live vehicle share and goods/s.
5. **Part 3 allocation (dedicated `−`/`+` + shared remainder, monotonic on every buy).**
   - Each run holds an integer `assignedRuns[runId] >= 0` in the save (reserved from Part 1's v11 schema). Validation enforces `sum(assignedRuns) <= fleetSize(mountain)` (`fleetSize` in `src/transport.ts`, validating against total owned vehicles just as hoist assignment validates against total owned hoists rather than staffed ones)—never clamping against `jobs.driving`, so moving a driver off Driving is always free and never silently erases assignments.
   - **Staffed vehicle assignment (`BY_LOAD`, Call 1):** Staffed vehicles (`drivenFleet`, ordered strongest-first: Trains → Trucks → Wagons) are handed out in deterministic `RUN_ORDER` (Rule 2.2) to satisfy `assignedRuns[runId]` across **all open runs** (active or inactive).
     - Dedicated vehicles on an **inactive** run (empty source, full destination, or `onHold` City order) stand visibly idle on that run and are **not** returned to the shared pool.
     - Remaining unassigned staffed vehicles (`max(0, drivenCount - sum(dedicatedOnAllOpenRuns))`) have their combined capacity split evenly (with water-filling redistribution) across active runs with `assignedRuns[runId] === 0` (or across all active runs if every active run has dedicated vehicles and unassigned staffed vehicles remain).
     - _Monotonicity:_ Buying and staffing a weaker vehicle (e.g., Horse Wagon #11) never reduces the capacity of any already-dedicated run, because dedicated runs keep their existing strongest vehicles and the new vehicle adds strictly non-negative capacity.
   - **Ephemeral run cleanup:** When a City step or building finishes, or a Research project installs or cancels, its closed `stockToCity:*` / `stockToResearch:*` `assignedRuns` entries are zeroed immediately (returning those slots to the unassigned pool). Putting a City project `onHold` keeps its `assignedRuns` entries intact (vehicles stand visibly idle until resumed).

### 3. Multi-Input Refinery & Steady-Flow Factory (`src/makers.ts`, `src/factory.ts`, `src/stock.ts`, `src/stockyard.ts`, `src/workforce.ts`)

1. **Five stockpile goods (`src/stock.ts`, `src/stockyard.ts`).**
   - Unify `STOCKPILE_GOODS` in `src/stockyard.ts` (replacing the split between `STOCKPILE_GOODS` and `PART_THREE_ROOM`) into one table covering `["stones", "brick", "cutStone", "glass", "parts"]`, each with a `ROOM_AT_ZERO` starting capacity (`stones`: 6M, `brick`: 1M, `cutStone`: 250K, `glass`: 150K, `parts`: 100K—starting values for lab) scaling together on `stockyardLevel` and doubled by `warehouse`.
   - Update `deadStockpiles` (`src/stockyard.ts`) to count Glassworks, Factory, and Research demand.
   - Retire the small-cap trickle materials (`clay`, `iron`, `crystal`, `heartstone`) and `withMaterials` at Part 1 switch-on (v11 save).
2. **Uniform multi-input recipe & buffer model (`src/makers.ts`).**
   - Replace single-integer `takes` on `MakerRow` with:
     - `inputs: readonly { readonly id: InputId; readonly amount: number }[]`
     - `output: { readonly good: GoodId; readonly amount: number }`
     - `workersPerUnit: number`, `outputPerSecond: number`
     - `price: MultiGoodCurve` (supports 1- or 2-good prices; generalize `quoteRun` in `src/tiers.ts`, `makerPrice` in `src/makers.ts`, and `vehicleQuote` in `src/transport.ts` so `×10`/`Max` buys are bounded by the minimum affordable count across every price line).
   - **Multi-worker staffing:** Update `runningMakers` (`src/makers.ts`) to `Math.min(owned, Math.floor(workers / workersPerUnit))`, showing surplus workers visibly idle (matching machines), with `jobRoom = Infinity` (`src/workforce.ts`) so workers can be placed freely.
   - **Input buffer room:** Each input buffer has room `0` while `owned === 0`; once `owned >= 1`, room scales with capacity (`max(BASE_INPUT_BUF, ceil(owned * inputRatePerSec * 60))`, holding at least 60 s of full-speed consumption, starting value for lab) so high machine counts never starve between ticks.
   - **Exact whole-cycle execution with persisted integer micro-cycles (`cycleMicros`):** Each maker and Factory line stores its sub-cycle progress in the save as a whole integer `cycleMicros` in `[0, 999_999]` (`0` omitted on write, validated `Number.isInteger(v) && v >= 0 && v <= 999_999` in `src/save-format.ts`), keeping `SaveGame` strictly integer-only (`docs/DESIGN.md`) while losing zero output across reloads and keeping per-step rounding error under `1e-6` cycles/step (`< 0.01%` over 8 hours even at 1 part per 60 s). Over step `dt` seconds:
     `wantMicros = cycleMicros + Math.trunc((staffedOutputRate * dt * 1_000_000) / output.amount)`
     `maxCycles = Math.min(Math.floor(outputRoom / output.amount), ...inputs.map(i => Math.floor(buffer[i.id] / i.amount)))`
     `cycles = Math.min(Math.floor(wantMicros / 1_000_000), maxCycles)`
     When `maxCycles >= 1`, `cycleMicros = Math.min(999_999, wantMicros - cycles * 1_000_000)`; when `maxCycles === 0`, `cycleMicros = 0`. Consumes `cycles * i.amount` from each input buffer and adds `cycles * output.amount` to its output destination (`stock[output.good]` for Refinery makers sitting in the Refinery alongside the stockyard; `factoryOutput.parts` for Factory lines, carried to the stockyard by `factoryToStockyardParts` in Rule 2.2). A maker/line displays a **standing** state iff `staffed > 0 && maxCycles === 0` (empty input buffer or full output buffer/stockpile)—never merely because a slow line's cycle takes longer than 1 s.
3. **Refinery makers (`src/makers.ts`).**
   - **Kiln (`kiln`, Part 1):** `2 Topsoil rock → 1 brick` (1 input; 1 worker/kiln; priced in `stones`; opens with Light Tower).
   - **Saw (`saw`, Part 1):** `3 Granite rock → 1 cutStone` (1 input; 1 worker/saw; priced in `brick`; opens with Granite).
   - **Glassworks (`glassworks`, Part 2):** **`3 Crystal rock + 2 stones → 1 glass`** (**2 input buffers**: `crystalRock` and `stones`; 2 workers/furnace; priced in `brick` + `cutStone`; opens with Crystal Caves).
4. **Steady-flow Factory lines (`src/factory.ts`, replaces one-off blueprints).**
   - At Part 1 switch-on, old `Station` (`idle | delivering | done`), `BLUEPRINT_IDS`, `ORDER_IDS`, and `src/workshop.ts` bench crafts/timers are deleted; the Factory tab stays hidden until Part 2 switches on (since The Foundry opens the steady-flow Factory and nothing promises unshipped features).
   - In Part 2, **The Foundry's roof** opens the steady-flow Factory, using the exact same multi-input engine as Refinery makers and writing into **`factoryOutput.parts`** (carried to `stock.parts` by `factoryToStockyardParts` in Rule 2.2):
     - **Parts Press (`partsPress`):** **`2 brick + 2 cutStone → 1 parts`** (**2 input buffers**; 2 workers/press; priced in `brick` + `cutStone`; opens when `foundry` is operational).
     - **Precision Assembly (`precisionAssembly`):** **`2 brick + 2 cutStone + 2 glass → 3 parts`** (**3 input buffers**; 3 workers/line; priced in `cutStone` + `glass`; opens when `crystal` is sunk).
   - Factory jobs (`partsPress`, `precisionAssembly`) are standard jobs in `src/workforce.ts`, assigned with `−`/`+`.

### 4. City Buildings & The Research Lab (`src/city.ts`, `src/building-site.ts`, `src/research.ts`)

1. **Five City buildings in `BUILDINGS` (`src/city.ts`):**
   - **1. The Light Tower** (Stone): Night shift 45%, opens Refinery & Granite price. _(unchanged)_
   - **2. The Warehouse** (Stone + Brick): Stockyard ×2, opens Trucks. _(unchanged)_
   - **3. The Foundry** (Brick + Cut stone): Ends Part 1; in Part 2 its roof **opens Crystal Caves, Glassworks, and the steady-flow Factory (`Parts Press`, and `Precision Assembly` once Crystal Caves is sunk)**.
   - **4. The Research Lab** (Part 2; requires Brick + Cut stone + Parts across 3 steps): **Opens Research inside the City** as the single home for all lasting upgrades and gear; ends Part 2.
   - **5. The Rail Depot** (Part 3; requires Cut stone + Glass + Parts across 3 steps): **Opens Trains** (`fleet.train`) and triggers **Slice 2's end card** (`The Rail Depot: operational`, copy open for Flemming's approval).
2. **Builders & per-good site cap (`src/building-site.ts`, #757).**
   - Replace the single shared total cap `SITE_HOLDS` with a **per-good cap `SITE_GOOD_CAP`** (updated in `src/building-site.ts` and `src/save-format.ts`) so one delivered good can never choke site room for another good.
   - Builders split `buildRate` across goods present on site via `shareOut` (`src/building-site.ts`); putting a project `onHold` pauses `stockToCity:*` runs while builders finish building in goods already on site.
   - Builder rate per worker and `SITE_GOOD_CAP` are retuned in Part 1's lab sliver alongside Trucks so Trucks and Trains never require 50 builders per vehicle (`#757`).
3. **Research (`src/research.ts`, new pure rules module; consolidates `src/upgrades.ts`).**
   - _Why a new module:_ `src/upgrades.ts` modeled instant stone-paid buys scattered across Workforce and Stage lists. Research is a stateful project delivered physically by Transport (`{ active?: { id, arrived }, done: ResearchId[] }`) with cancel/refund and install transitions.
   - **Part 1 → Part 2 continuity (no save reset, no double-stacking):**
     - `machineSyn` (Great Machine) and `reinforce` (old Factory blueprint) are retired at Part 1's v11 reset.
     - During Part 1 (before Research Lab exists), `boots`, `cartSyn`, `drillSyn`, and `borerSyn` remain buyable in `src/upgrades.ts` as in Slice 1.
     - When Part 2 switches on Research Lab, the old instant-buy upgrade rows are removed from Workforce/Stage UI. Any already-bought Part 1 upgrade in `SaveGame.levels` remains honored as equivalent to its matching Research project (`workBoots`, `loadingCrews`, `haulRoads`, `drillCrews`)—with identical effect magnitudes so no live v11 player loses speed or double-stacks bonuses—with no save migration and no v12 reset.
   - **Rules:**
     - One active research project at a time. Starting a project costs nothing up front, skips `priceFits` (like City orders, since Transport delivers gradually), and opens its `stockToResearch:<good>` run(s).
     - **Cancel** reuses Slice 1's `cancelWorkOrder` rule (`src/factory.ts`): it always refunds 100% of arrived goods to `stock`, even past stockyard cap (an over-cap stockpile simply stops new production until drained—never locking cancel and never losing goods).
     - When every required good has arrived, `Next` and the Research Lab lamp light green; tapping **Install** completes the project and applies its permanent effect immediately.
     - Time away **never** starts or installs a research project; it only finishes delivering to an already-active project.
   - **Initial Research table (starting set for lab; names/copy open for Flemming's approval):**
     1. `workBoots` (replaces `boots`) — Matches `BOOTS_SPEED_PER_LEVEL = 1.36` in `src/upgrades.ts` ("Workers go from 1/s to 2.4/s", +136%) (`parts` + `stones`)
     2. `loadingCrews` (replaces `cartSyn`) — `+1%` cart speed per haulage worker across all open levels, including `crystalHaulage` (`parts` + `brick`)
     3. `haulRoads` (replaces `drillSyn`) — `+1%` drill speed per cart owned (`parts` + `brick`)
     4. `drillCrews` (replaces `borerSyn`) — `+1%` borer speed per drill owned (`parts` + `cutStone`)
     5. `ironRails` (from old Factory blueprint) — Carts & locomotives +35% speed (`parts` + `brick`)
     6. `highDraftKilns` — Kilns & saws +35% output (`parts` + `cutStone`)
     7. `opticalGauges` — Glassworks & Factory lines +40% output (`parts` + `glass`)
     8. `heavyCouplings` — Wagons, trucks & trains +40% capacity (`parts` + `glass`)

### 5. Whole-Chain Simulation & Unattended Time (`src/mountain.ts`, `src/session-time.ts`, `src/shift-report-view.ts`)

1. **Simulation owner (`src/mountain.ts`).** `src/mountain.ts` (`accrue`, `accrueAway`, `workStretch`) remains the single simulation engine shared by live play, offline accrual, and the strategy lab (`src/session-time.ts` stays its thin clock wrapper).
2. **Pre-Light-Tower night clock preserved.** Before the Light Tower opens the Refinery, `NIGHT_CLOCK_MS` (8-hour clock at 30%) stays unchanged. After the Light Tower is operational, nights run at 45% until open stockpiles fill or buffers block all flow.
3. **Coupled buffer stepping model (live, offline, and lab agreement).**
   - Because Transport couples Pithead → Stockyard/Refinery → Stockyard → Factory → Stockyard and City/Research (with cyclic feedback via `stones`, `brick`, `cutStone`, `glass`, `parts`), Slice 1's single-pass acyclic `Chain` is replaced by a **deterministic coupled-stretch solver** in `src/mountain.ts`:
     - **Live play (`accrue`, 1 s / cage-instant boundaries in `src/mine-cages.ts`):** Executes in fixed phase order per step: (a) Mine drilling, haulage & hoisting → pithead (no bypass), (b) Transport runs (`shareOut` on shared source contention, water-filling on capped runs) → Stockyard (`pitToStockyardStones`, `factoryToStockyardParts`) / input buffers / City / Research, (c) Multi-input Refinery & Factory whole-cycle production with `cycleMicros` → Stockyard / `factoryOutput.parts`, (d) City builders (`shareOut`) → built-in.
     - **Offline & lab (`accrueAway`):** Advances in **exact event-driven stretches**: computes instantaneous rates of every stage/run/maker/builder, finds the minimum time `dt` to the next state change (any pile/buffer hitting empty or full, any stockpile hitting full, any City step or Research delivery completing, or remaining away time), applies whole units with `cycleMicros` over `dt`, and repeats (with a 1 s minimum step floor for tight cyclic equilibria so an 8h night completes in tens of stretches rather than 28,800 ticks, keeping `npm run lab` fast per `.claude/rules/lab.md`).
   - **Agreement tolerance:** Live 1 s ticking and event-driven `accrueAway` must agree within **`<= 1%`** on produced goods over an 8-hour stretch across representative Slice 2 states (matching Slice 1's cage tolerance, including states that hit the 1 s minimum stretch floor and slow lines down to 1 part per 60 s), verified in `src/mountain.test.ts`.
4. **Shift report truth (`src/shift-report-view.ts`).** Reports produced amounts for each open stockpile good, what was delivered/built on active City/Research orders, and when each stockpile filled (or stopped), never naming a recommended fix.

---

## What he sees

Reference prototype answered by Flemming (19 Nov 2026): `prototypes/slice-2/proto.src.html` (`prototypes/slice-2/README.md`). Every screen must meet `docs/superpowers/specs/2026-11-14-slice-1-design.md` ("What any screen has to meet") and zero page scroll at `424×924` and `424×830`. Every UI sliver before its part's switch-on is gated **off in play** behind its Slice 2 switch in `src/part-switch.ts`, and unshipped-part items (`Parts`, `Glass`, Factory tab in Part 1, Research Lab, Rail Depot, `+Train`) stay **hidden** (never dimmed/locked) until their part switches on (`docs/decisions.md`: _"No line promises what is not live"_).

- **Frame top (`src/frame-screen.ts`, `src/frame-view.ts`, `src/next-view.ts`):**
  - **Order strip:** Active City building, step & state, required goods built-in of needed, 3 pips, Ledger key.
  - **Stockpile strip:** Compact bays for open goods (`Stone`, `Brick`, `Cut` in Part 1; adds `Parts` & `Glass` in Part 2) with fill bars turning red when full.
  - **Global controls strip:** `Workforce (N · X free)` button, `+Worker` hire key, and **`Transport (X/Y veh · Z/s)`** button (sibling to Workforce, with status lamp: amber when unstaffed vehicles exist or a dedicated run stands idle; green when an open vehicle is affordable; dark otherwise). `Next` (`src/next-view.ts`) counts affordable vehicles under Transport rather than City.
- **Bottom site bar:** Stays **4 tabs** (`Mine · Refinery · Factory · City`; Factory opens in Part 2 at the Foundry's roof).
- **Global Transport sheet (`src/transport-sheet.ts` + `src/transport-view.ts`, new modules mirroring `src/workforce-sheet.ts` / `src/workforce-view.ts`):**
  - Top plate: Drivers (`−`/`+`), running vehicle counts, buy keys (`+Wagon`, `+Truck`, and `+Train` in Part 3 once Rail Depot is operational; 2-good prices render 2 icons via extended `buildKeyFace`), and one plain line stating the active rule (Part 1–2: even share across active runs; Part 3: dedicated + shared remainder).
  - Runs list: One row per open single-good run showing `From → To`, good name, source count, destination buffer bar (`N of M`), live rate (`X/s`), vehicle share (`N.N veh`), and idle markers (`dest full` / `src empty`). Part 3 adds `−`/`+` dedicated vehicle steppers per run (respecting the `src/buys-amount.ts` amount key).
- **Mine (`src/mine-levels-site.ts`, `src/mine-level-view.ts`, `src/mine-site.ts`, `src/mine-view.ts`):** Generalized to 3 levels (`Topsoil`, `Granite`, `Crystal Caves` in Part 2), pithead rock readout, and 4-cell Hoisting strip (`Topsoil`, `Granite`, `Crystal`, `All in turn`).
- **Refinery (`src/refinery-site.ts`, `src/refinery-view.ts`):** Kilns, Saws, and (Part 2) multi-input **Glassworks** showing both `Crystal rock` and `Stone` input buffers separately, standing badge when starved/full, plus Stockyard expand plate.
- **Factory (`src/factory-site.ts`, `src/factory-view.ts`, Part 2):** Animated conveyor floor plus **Parts Press** (2 input buffers) and **Precision Assembly** (3 input buffers), workers `−`/`+`, `+Press`/`+Line` keys (2-good prices), live output `now of max /s`, standing badge when starved/full.
- **City (`src/city-site.ts`, `src/city-view.ts`, `src/research-sheet.ts`, `src/research-view.ts`, `src/frame-cards-words.ts`):** 5-building skyline (Light Tower, Warehouse, Foundry, Research Lab in Part 2, Rail Depot in Part 3), active project plate with per-good on-site buffers and Builders `−`/`+`, and (Part 2) the **Research Lab door** button opening the **Research sheet** once operational.

---

## Whose call (open vs. approved)

| Item                                                                                                                                                  | Status                               | Notes                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slice 2 scope (`#762`, `#751`, Crystal Caves; `#693` deferred to Slice 3)                                                                             | **Approved** (Flemming, 19 Nov 2026) | Option 1                                                                                                                                                        |
| Two-part `#762` rollout (even-share first, then `−`/`+` per run)                                                                                      | **Approved** (Flemming, 17 Nov 2026) | Recorded on `#762`                                                                                                                                              |
| Physical `Mine → Stockyard` Stone run (`pitToStockyardStones`, no bypass)                                                                             | **Approved** (Flemming, 20 Nov 2026) | Option 1 on PR `#765`                                                                                                                                           |
| Transport as global sheet + Research behind City building (4-tab bar)                                                                                 | **Approved** (Flemming, 19 Nov 2026) | Option 1                                                                                                                                                        |
| Retire clay/iron trickle; 5-good stockyard; multi-input Refinery & Factory                                                                            | **Approved** (Flemming, 19 Nov 2026) | Option 1 + multi-input call                                                                                                                                     |
| City sequence: Foundry → Research Lab → Rail Depot (Trains)                                                                                           | **Approved** (Flemming, 19 Nov 2026) | Option 1                                                                                                                                                        |
| Playable phone prototype (`prototypes/slice-2/proto.src.html`)                                                                                        | **Approved** (Flemming, 19 Nov 2026) | "Continue"                                                                                                                                                      |
| Ownership milestone marks (`src/milestones.ts`)                                                                                                       | **Unchanged** (no new marks)         | Existing marks stay as approved; any new or changed mark is Flemming's call                                                                                     |
| New screen copy (Transport sheet lines, Crystal Caves card, Glassworks & Factory lines, Research Lab & project lines, Rail Depot end card)            | **Open — Flemming's call**           | Approved with pictures in each screen sliver before switch-on                                                                                                   |
| PixelLab art (8 assets, 1 issue/sitting each: `parts`, `partsPress`, `glass`, `glassworks`, `precisionAssembly`, `researchLab`, `railDepot`, `train`) | **Open — Flemming's call**           | Spend & prompts asked first, one asset/sheet per sitting (`pixellab` skill)                                                                                     |
| Strategy lab guardrails in `src/lab/targets.ts`                                                                                                       | **Open — Flemming's call**           | Five-day floor stays (`slice-five-days`, currently naming Foundry's roof); updating its end building or adding bounds is a stop for Flemming in the lab slivers |

## Calls I made (agent rulings, Flemming's to overrule)

1. **`BY_LOAD` vehicle allocation for Part 3 dedicated runs.** Dedicated slots take staffed vehicles strongest-first (Trains → Trucks → Wagons) in deterministic `RUN_ORDER`, and remaining unassigned staffed vehicles share evenly across unassigned active runs. Keeps assignment to one `−`/`+` per run on a phone while guaranteeing buying/staffing a new Horse Wagon never lowers dedicated runs' throughput.
2. **Pithead buffer sizing (`cagePileRoom`, `MIN_PITHEAD_ROOM = 300`).** Every open level holds pithead rock in `cagePileRoom` (`src/cages.ts`, or 300 while only winches run before Hoist #1) so live cages stay aligned with offline rates past 3 cages while `pitToStockyardStones` pulls proportionally across open pitheads via `shareOut`.
3. **Part 1 keeps existing upgrades; Part 2 folds them into Research with no save reset.** `machineSyn` and `reinforce` retire at Part 1's v11 reset. `boots`, `cartSyn`, `drillSyn`, `borerSyn` stay buyable in Part 1 and are honored without double-stacking once Part 2 moves all lasting upgrades into **The Research Lab** (`workBoots`, `loadingCrews`, `haulRoads`, `drillCrews`).
4. **Research Cancel reuses `cancelWorkOrder` (`src/factory.ts`).** Always refunds 100% of arrived goods to `stock` even past stockyard cap, preventing any cancel-lock and never dropping goods.
5. **Part 1 switch-on bumps save version to v11 (Resets the save); Parts 2 and 3 reset nothing.** Introducing `mineLevels`, `pithead`, `makerBuffers`, `cycleMicros`, per-good `SITE_GOOD_CAP`, and reserving `assignedRuns` in v11 ensures Parts 2 and 3 add only optional defaulted keys.
6. **Starting numbers (30 s Crystal hoist trip, 60 s input buffers, recipe ratios, building/research costs, train speed).** All are starting values for the strategy lab slivers to tune against `slice-five-days` and `#757`'s criteria (borers, locomotives, trucks, builders, and trains all worth buying).

---

## Parts & slivers, in order

Built in **three playable parts**, each going live on Flemming's phone. Every sliver becomes its own GitHub issue under `#763` once this spec PR merges, with truthful `blocked-by` links. Every art asset is its own issue/sitting (respecting the 1-asset/sheet cap in the `pixellab` skill).

### Part 1: Physical transport (even share) + `#757` rebalance (to the Foundry's roof)

1. **Generalized `mineLevels`, pithead buffers, physical transport runs (even share) & v11 save shape, off in play (`src/mine-levels.ts`, `src/mine-cages.ts`, `src/mine-piles.ts`, `src/transport.ts`, `src/building-site.ts`, `src/mountain.ts`, `src/save-format.ts`).** Add `mineLevels`, `pithead` (`cagePileRoom`, no bypass), single-good runs (`pitToStockyardStones`, `Mine → Kilns/Saws`, `Stockyard → City`), per-good `SITE_GOOD_CAP`, `cycleMicros` persistence, coupled-stretch stepping in `src/mountain.ts`, and reserve `assignedRuns` in v11 behind `slice2Part1` in `src/part-switch.ts`.
2. **Part 1 lab & `#757` economy rebalance (`src/lab/`).** Update fresh-dad policies for physical transport runs (including `pitToStockyardStones` from Evening 1) and rebalanced builders; retune Part 1–3 economy so borers and locomotives are bought and trucks vs. builders balance cleanly (`#757`); update `docs/pacing-ledger.md`.
3. **Global Transport sheet & updated Frame / City screens, off in play (`src/transport-sheet.ts`, `src/transport-view.ts`, `src/frame-screen.ts`, `src/frame-view.ts`, `src/next-view.ts`, `src/city-site.ts`, `src/city-view.ts`, `src/shift-report-view.ts`).** Move Transport out of City to the global top strip + sheet (Part 1 even-share view), gated behind `slice2Part1`. Copy approved with pictures.
4. **Part 1 switch-on (`src/part-switch.ts`, `src/persist.ts`).** **Resets the save (version 11).** Switches on physical transport (even share) and `#757` balance; retires clay/iron trickle, `src/workshop.ts` bench/blueprints (`reinforce`, `blasting-charge`, `axle-grease`), `machineSyn`, `clocks`, `marks.recipes`, and `run.granite`; hides Factory tab until Part 2; updates journeys, visual sections, and docs.

### Part 2: Crystal Caves, multi-input Refinery & Factory, and The Research Lab

5. **Crystal Caves level & 3-level hoisting, off in play (`src/mine-levels.ts`, `src/mine-cages.ts`, `src/cage-trips.ts`, `src/cages.ts`, `src/mine-piles.ts`, `src/workforce.ts`, `src/job-steps.ts`).** Extend `MINE_LEVEL_IDS` to 3 levels, add Crystal Caves sink price behind Foundry's roof, 30 s hoist trips, and 3-level hoist assignment behind `slice2Part2`.
6. **Multi-input makers, steady-flow Factory & Research rules, off in play (`src/makers.ts`, `src/factory.ts`, `src/research.ts`, `src/stock.ts`, `src/stockyard.ts`, `src/tiers.ts`, `src/city.ts`, `src/transport.ts`, `src/mountain.ts`, `src/save-format.ts`).** Multi-input recipe engine with persisted `cycleMicros`, multi-good price quoting, multi-worker maker staffing, `glass` & `parts` stockpiles, `glassworks` (`3 Crystal rock + 2 stones → 1 glass`), `partsPress` (`2 brick + 2 cutStone → 1 parts`), `precisionAssembly` (`2 brick + 2 cutStone + 2 glass → 3 parts`), `factoryOutput.parts` buffer + `factoryToStockyardParts` run, Building 4 (`researchLab`), and `src/research.ts` (one active project delivered by Transport, lossless cancel-refund, install; honors existing v11 upgrades without double-stacking).
7. **Part 2 lab (`src/lab/`).** Extend lab policies for 3 levels, Glassworks, Parts Press, Precision Assembly, and Research Lab; tune to the Research Lab's roof and check `slice-five-days` (ask Flemming before changing any `targets.ts` bound/text); update `docs/pacing-ledger.md`.
8. **Part 2 art — 6 separate issues, 1 asset per sitting (PixelLab, asked first):**
   - `8a`: `parts` good icon
   - `8b`: `partsPress` machine icon
   - `8c`: `glass` good icon
   - `8d`: `glassworks` furnace icon
   - `8e`: `precisionAssembly` line icon
   - `8f`: **The Research Lab** City building
9. **Mine 3-level UI, multi-input Refinery & Factory UI, and City Research Lab + Research sheet, off in play (`src/mine-levels-site.ts`, `src/mine-level-view.ts`, `src/refinery-site.ts`, `src/refinery-view.ts`, `src/factory-site.ts`, `src/factory-view.ts`, `src/city-site.ts`, `src/city-view.ts`, `src/research-sheet.ts`, `src/research-view.ts`, `src/frame-cards-words.ts`, `src/mine-site.ts`).** 2-good buy keys, 3-level mine + 4-cell hoisting strip, Glassworks 2-buffer plate, Factory 2-/3-buffer lines + output buffer, Research Lab door & sheet, gated behind `slice2Part2`. Copy approved with pictures.
10. **Part 2 switch-on.** No save reset. Switches on Crystal Caves, Glassworks, steady-flow Factory, and The Research Lab; removes old instant-buy upgrade rows from Workforce/Stage UI; updates journeys, visuals, and docs.

### Part 3: Manual transport assignment & The Rail Depot (Trains)

11. **Manual transport assignment (`−`/`+`) & Rail Depot / Trains rules, off in play (`src/transport.ts`, `src/city.ts`, `src/mountain.ts`, `src/save-format.ts`).** Activate `assignedRuns` (`BY_LOAD` dedication + shared remainder + ephemeral run cleanup), Building 5 (`railDepot`), and `fleet.train` (`cutStone` + `glass`) behind `slice2Part3`.
12. **Part 3 lab (`src/lab/`).** Add a lab policy using `assignedRuns` on starved runs vs. even-share, proving manual assignment pays without becoming a chore; tune Rail Depot & Trains; check `slice-five-days` guardrail; update `docs/pacing-ledger.md`.
13. **Part 3 art — 2 separate issues, 1 asset per sitting (PixelLab, asked first):**
    - `13a`: **The Rail Depot** City building
    - `13b`: **Train** transport vehicle
14. **Transport Part 2 `−`/`+` UI, Rail Depot skyline & Slice 2 end card, off in play (`src/transport-sheet.ts`, `src/transport-view.ts`, `src/buys-amount.ts`, `src/city-site.ts`, `src/city-view.ts`, `src/frame-cards.ts`, `src/frame-cards-words.ts`).** Copy approved with pictures.
15. **Part 3 switch-on.** No save reset. Whole Slice 2 live to the Rail Depot's roof; updates journeys, visuals, and docs; `#751`, `#762`, and `#763` close once Flemming plays Slice 2 on his phone.

---

## Save impact (`src/save-format.ts`, `src/save-ledger.test.ts`, `src/persist.ts`)

| Fact                                                                         | Introduced in                                      | Notes                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save version `11` (**Resets the save**)                                      | Part 1 switch-on                                   | Retires `clay`, `iron`, `crystal`, `heartstone` trickle counts, `station` blueprints, `bench`/`crafted` workshop records, `machineSyn`, `clocks`, `marks.recipes`, and `run.granite` (`graniteDug`). Keeps `levels` readable for Part 1 `UpgradeId`s (`boots`, `cartSyn`, `drillSyn`, `borerSyn`). |
| `mineLevels: Partial<Record<MineLevelId, { machines, piles }>>`              | Part 1                                             | Replaces top-level `granite` without colliding with `SaveGame.levels`; Topsoil machines remain derived (`owned - sum(deeper)`). Part 2 adds `"crystal"` with no save reset.                                                                                                                        |
| `pithead: Partial<Record<MineLevelId, number>>`                              | Part 1                                             | Pithead rock waiting for transport per open level; zero omitted on write.                                                                                                                                                                                                                          |
| `makerBuffers` & `factoryBuffers` (keyed by maker/line id and input id)      | Part 1 (`makerBuffers`), Part 2 (`factoryBuffers`) | Separate finite input buffer per recipe input; zero omitted on write.                                                                                                                                                                                                                              |
| `cycleMicros: Partial<Record<MakerId \| FactoryLineId, number>>`             | Part 1 (`MakerId`), Part 2 (`FactoryLineId`)       | Persisted whole-integer micro-cycle progress (`0..999_999`, `0` omitted on write) so slow makers/lines lose zero output across reloads and stay within `< 0.01%` drift; round-tripped in `src/save-ledger.test.ts`.                                                                                |
| `factoryOutput` (output buffer per manufactured good, starting with `parts`) | Part 2                                             | Manufactured goods awaiting `factoryToStockyardParts` transport to the stockyard; zero omitted on write; no save reset.                                                                                                                                                                            |
| Per-good `site.onSite[good] <= SITE_GOOD_CAP`                                | Part 1                                             | Replaces total `SITE_HOLDS` check in `src/save-format.ts`.                                                                                                                                                                                                                                         |
| `assignedRuns: Partial<Record<RunId, number>>`                               | Part 1 (reserved), Part 3 (active)                 | Validated `>= 0` and `sum <= fleetSize(mountain)`; reserving in v11 guarantees Part 3 resets nothing.                                                                                                                                                                                              |
| `stock.glass`, `stock.parts`, `factoryOwned`, Crystal & Factory worker jobs  | Part 2                                             | Standard keys in existing maps with zero defaults; no save reset.                                                                                                                                                                                                                                  |
| `research: { active?: { id, arrived }, done: ResearchId[] }`                 | Part 2                                             | Added with defaults; validated against `RESEARCH_IDS` and required amounts; no save reset.                                                                                                                                                                                                         |
| `fleet.train` & `operational` (`researchLab`, `railDepot`)                   | Part 2 / Part 3                                    | Standard keys in existing maps; no save reset.                                                                                                                                                                                                                                                     |

Every save fact gets a round-trip test in `src/save-ledger.test.ts` and Firestore rules emulator verification (`npm run test:rules`).

---

## Proof

| Requirement                                            | Proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Physical transport, monotonicity & no-lock invariant   | Unit tests in `src/transport.test.ts`; fast-check property tests in `src/economy/invariants.test.ts` proving rock/goods conservation across pithead → transport → input buffers → stockpiles, `sum(assignedRuns) <= fleetSize(mountain)`, buy monotonicity (buying a wagon never lowers throughput), and Stone earnable from every reachable state; `tools/journeys/first-evening.journey.ts` proves the 1 starting worker cycles through `drilling` → `haulage` → `hoisting` → `driving` (`pitToStockyardStones`) to earn Stone and hire Worker #2 before any purchase. |
| Multi-input makers & Factory lines                     | Unit tests in `src/makers.test.ts` and `src/factory.test.ts` proving whole-cycle consumption with `cycleMicros` (including slow 1-per-60-s lines), zeroed secondary input halting production without draining other inputs, and `bufferCap === 0` at `owned === 0`.                                                                                                                                                                                                                                                                                                      |
| Research delivery, cancel refund & Part 1 continuity   | Unit tests in `src/research.test.ts` proving 100% lossless cancel refund (even over stockyard cap), no offline auto-start/install, and v11 Part 1 upgrades honored without double-stacking.                                                                                                                                                                                                                                                                                                                                                                              |
| Coupled live/offline/lab agreement & `#757` resolution | Unit tests in `src/mountain.test.ts` checking `<= 1%` live vs. event-driven offline agreement over 8 hours (including 1-per-60-s lines and the 1 s stretch floor); Strategy lab (`npm run lab -- --ci` with `LAB_STRICT=1`), `docs/pacing-ledger.md` diff, `slice-five-days` guardrail green, and non-zero adoption of borers, locomotives, trucks, and trains across player types.                                                                                                                                                                                      |
| Phone UI & zero scroll                                 | Visual sections (`npm run visual`) at `424×924` and `424×830` for Mine (3 levels), Refinery (Glassworks), Factory (multi-input lines), City (Research Lab & Rail Depot), Transport sheet (Part 1 & Part 3), and Research sheet, plus `npm run play` shots + logs.                                                                                                                                                                                                                                                                                                        |
| End-to-end play over time                              | Playwright journeys (`npm run journeys`) covering `first-evening.journey.ts` (1 starting worker cycling 4 jobs to Stone & Worker #2), Part 1 even-share transport to Foundry, Part 2 Crystal Caves + multi-input Factory + Research Lab delivery/install, Part 3 manual run assignment + Rail Depot/Trains, and an 8-hour night filling buffers/stockpiles cleanly.                                                                                                                                                                                                      |
