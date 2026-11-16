# Saws, trucks and the Granite's card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish #680's last pieces (#754), off in play behind part 3's switch: the saws' plate in the refinery, the trucks' key in the city, and the card that says the Granite is reached.

**Architecture:** The rules are already built (#673: the saw, `graniteBranch`, the truck, `vehicleOpen`). This sliver is views and screens. The refinery's kiln-only view becomes one plate per open maker and one hopper per level. The city paints every vehicle key, plus the trucks' hint. The level card is a new notice, raised as the `operational` notice is, and painted by the frame's card layer.

**Tech Stack:** TypeScript, Vite, Vitest (+ fast-check, happy-dom), puppeteer visual check, `npm run play`.

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`: "3. Goods and makers", "The refinery", "The city", "The cards" (A level is reached), "What Next and the lamps count", "While a part is the end of the game". Pictures: `docs/superpowers/specs/slice-1/refinery.png` and `level-reached-card.png`.

## Global Constraints

- Everything new shows only while `partThreeOn()` (`src/part-switch.ts`). With part 3 off the game plays and paints exactly as on `main`. `VISUAL_ONLY='slice frame' npm run visual` and the existing refinery and city sections stay green and unchanged.
- No save change: the save stays version 10 with no new fact. A notice is not a save fact.
- Plain engineering words. Never "face", "hands" or "by hand" on a screen. Nothing names a limit, the bottleneck or a best buy (the 15 Nov principle).
- The phone never scrolls at 424×924 or 424×830. Keys are at least 48 px, with 8 px between them (`--target-gap`).
- No placeholder art. Use only what exists: `src/assets/board/mach-saw.png`, `mach-saw-dim.png`, `res-cut-stone.png`, `src/assets/city/truck.png`.
- Every new line of copy is Flemming's to approve before the merge (ruling 9 lists them).
- No function in non-test `src` over 150 lines or cognitive complexity 15. No cycles, and knip clean.
- Extend the existing mechanism; never copy it: `kilnPlate` becomes the maker plate, `vehicleKeys` is the one key builder, the level notice follows the `operational` notice, and `priceIcon` gives every icon.
- The verification ladder (`.claude/rules/dad-friendly-work.md`): the test file, then `npm run gate -- fast`, then the visual section and `npm run play`. Never the full gate in a task.

## Rulings

1. **A plate for each open maker.** The kilns' plate whenever the refinery is open (as today). The saws' plate too once `makerOpen(m, "saw")` (the Granite sunk, part 3). `kilnPlate` generalises to `makerPlate(mountain, id)`. Kiln words stay byte for byte.
2. **A hopper for each level.** "TOPSOIL 1,333/s" over the kilns, as now. With the Granite open there is a second, "GRANITE 778/s", over the saws, reading the Granite's own lift: `mineLevelFlows`' per-level lift (#680) through `levelPlate`'s sibling. The bypass chute is both levels' stone together.
3. **Saw words**, in the kilns' form: "Recipe: 3 rock → 1 cut stone", "SAWS 200 of 200 cut stone/s", "2 saws: 2 of 2 workers", "No saws yet", "+ 1 without a saw", "Rock at the saws: N of M", the key "+Saw · 30/s" with its price in brick and "1 to run", and its aria-label "Buy a saw for 25K brick. It makes 30 cut stone a second and takes 1 to run." The kiln's aria-label already names its good ("stone"). The saw's names brick.
4. **The refinery's count** (Next and the lamp) counts a saw he can afford, as it counts a kiln.
5. **The workforce's refinery group** lists "Saws" after "Kilns" once the saws are open. Its note is the kilns' form: "1 of 2 saws run" or "No saws yet".
6. **The trucks' key** (spec, The city, and the table "While a part is the end of the game"):
   - Part 3 off, or the Light Tower in hand: no trucks' key.
   - Part 3 on, the Warehouse the project in hand (ordered or next, not operational): a dark key reading "Trucks: after the Warehouse". It buys nothing.
   - The Warehouse operational: the real key "+Truck · 400/s", its price with the brick icon, "1 to run", and an aria-label that says brick.
   - The wagon key keeps its place. The truck key or hint sits beside it, in the same row.
7. **The Warehouse's "On completion:"** line adds " Opens trucks." with part 3 on, as the Light Tower's adds " Opens the refinery." from part 2. Its end card is #682's.
8. **The level card**:
   - A notice kind `level` with `level: "granite"`, raised once when the mountain goes from unsunk to sunk since the session's baseline. A loaded save that is already sunk, or a copy adopted from another device, does not raise it, as with `operational`.
   - It shows after a night's report and before an `operational` card. Its key "Continue" dismisses it.
   - The words, from the prototype (`level-reached-card.png`):
     - the title "The Granite: reached";
     - "A second level, twice as deep, with its own drilling and its own haulage. Nobody works there yet: put workers on it with − and + on the level.";
     - "A hoist serves both levels in turn: down to one, up, then down to the other. A trip to the Granite takes twice as long. Under Hoisting, − and + assign a hoist to one level only.";
     - "Topsoil rock goes to the kilns. Granite rock goes to the saws, which have their own pile of rock.";
     - "Opened: saws in the refinery, the factory, and locomotives for haulage."
   - The card's title is drawn in capitals by CSS, as the other cards' are.
9. **New copy for Flemming:** rulings 3, 5, 6 ("Trucks: after the Warehouse" and the truck key), 7 and 8, and the Granite hopper. Ask him once, with phone pictures, before the merge.
10. **Out of this sliver:** the Light Tower's "the Granite's price" line, the Warehouse's and the Foundry's cards in part 3, and the switch-on are #682's. Prices and rates are the spec's starting numbers, which #675 tunes.

## Review Focus

1. A save already sunk when it loads must not show the level card again, and a sink while away must show it after the night's report. Test both in Task 4.
2. The trucks' hint must not show before part 3, or with the Light Tower still in hand. Test both in Task 3.
3. The refinery with the Granite open and no saws must still pass all Granite rock to stone: no saw plate pile, and a bypass that counts both levels. Test in Task 1.
4. Two plates side by side with 48 px keys must fit 412 px without scrolling at 424×830. The visual section checks it in Task 2.
5. The city's row of − + wagon truck must keep the 8 px key gap. The visual section checks it in Task 3.

---

### Task 1: The refinery's views for two makers

**Files:**

- Modify: `src/refinery-view.ts`, `src/mine-piles.ts` (`graniteChain`), `src/mine-view.ts` (`PILE_LABELS.saw`, the Granite's hopper), `src/next-view.ts` (`refineryCount`), `src/workforce-view.ts` (the saws' row and note)
- Test: `src/refinery-view.test.ts`, `src/next-view.test.ts`, `src/workforce-view.test.ts`

**Interfaces:**

- Produces:
  - `type MakerPlate`. It is today's `KilnPlate` with `id: MakerId`, `name: "Kilns" | "Saws"`, `unit: "brick/s" | "cut stone/s"`, `job: "kilns" | "saws"`, and a key whose `good: GoodId` the site reads for its icon.
  - `RefineryView.plates: readonly MakerPlate[]`, replacing `plate`.
  - `RefineryView.hoppers: readonly { level: MineLevelId; name: string; rate: string; lifted: number }[]`, replacing `hopper`.
  - `RefineryScene` gains `saws?: { hopper: number; saws: number; running: number; making: boolean }`, set only with the saws open.
  - `graniteChain(mountain: Mountain): Chain | undefined` in `mine-piles`. It is the second of `levelChains`, and undefined with one level.

- [ ] **Step 1: Write the failing tests.**
  - `refinery-view.test.ts` "shows the saws' plate once the Granite is sunk". Use `partThree` from `src/part-three.harness.ts` and `levels({ … })` with the Granite sunk, 2 saws and 2 on saws. Check:
    - `plates.map(p => p.name)` equals `["Kilns", "Saws"]`;
    - the saws' `recipe` is `"Recipe: 3 rock → 1 cut stone"`;
    - its `unit` is `"cut stone/s"`;
    - its `machines` is `"2 saws: 2 of 2 workers"`;
    - its `pile` starts `"Rock at the saws: "`;
    - its key's `face` is `"+Saw · 30/s"` and its `good` is `"brick"`;
    - `hoppers.map(h => h.name)` equals `["Topsoil", "Granite"]`.
  - "keeps one plate and one hopper with the Granite shut, and with part 3 off". Check `plates.length === 1` and `hoppers.length === 1`, with the kilns' words unchanged (literal strings).
  - "passes all the Granite's rock to stone with no saw". With the Granite sunk, 0 saws and workers on the Granite's lines, check that the saws' `pile` is undefined and its `machines` is `"No saws yet"`. Check that `bypass.rate` equals the formatted sum of both levels' `chainSpill` (both chains' stone).
  - `next-view.test.ts` "counts a saw he can afford in the refinery". `siteCounts(m).refinery` goes up by 1 once brick covers `makerPrice(m, "saw")`.
  - `workforce-view.test.ts` "lists the saws in the refinery once the Granite is sunk". The refinery group's jobs are `["kilns", "saws"]` with note `"No saws yet"`. With part 3 off they are `["kilns"]`.
- [ ] **Step 2:** Run `npx vitest run src/refinery-view.test.ts src/next-view.test.ts src/workforce-view.test.ts` and see them fail.
- [ ] **Step 3: Implement it.**
  - `makerPlate(mountain, id, made, timer)` is `kilnPlate` taking the maker's id. Its words come from `makerTakes`, `makerMakes`, `makerOutput` and `MAKER_WORDS`-style plurals in `screen-words`, one table for both makers.
  - The income: the kilns read `topsoilChain`, and the saws read `graniteChain`'s `MAKER` flow.
  - The Granite's hopper reads its lift from `mineLevelFlows`. Reuse it; never recompute.
  - `refineryCount` loops over the open makers.
  - The saws' note reuses `kilnsNote`'s form, through one `makersNote(mountain, id)`.
- [ ] **Step 4:** Run the three test files, then `npm run gate -- fast`. Expect PASS.
- [ ] **Step 5: Commit and push:** "The refinery's views read a plate for each open maker and a hopper for each level, the saws with the Granite, off in play (#754)".

### Task 2: The refinery's screen and scene with the saws

**Files:**

- Modify: `src/refinery-site.ts`, `src/refinery-scene.ts`, `src/refinery.css`
- Modify: `tools/browser/fixtures.ts` (the `two-levels` save opens the refinery with saws: give it 2 saws and 2 workers on saws), `scripts/visual/frame.mjs` (section `slice refinery two levels`, at 424×924 and 424×830, with `noScroll`, key sizes and gaps)
- Test: `src/refinery-site.test.ts` (happy-dom; create it if there is none, modelled on `src/mine-site.test.ts`)

**Interfaces:**

- Consumes: Task 1's `RefineryView.plates`, `hoppers` and `scene.saws`.

- [ ] **Step 1: Write the failing test.** "paints a plate for each maker, and the saws' + places a worker". Mount with the Granite sunk and part 3 on (as `mine-site.test.ts` does). Check:
  - two `.refinery-plate` elements, the second's name "Saws";
  - the saw key's price icon is `priceIcon("brick")`;
  - a tap on the saws' + puts a worker on `saws`;
  - with part 3 off there is one plate.
- [ ] **Step 2:** Run it and see it fail.
- [ ] **Step 3: Implement it.**
  - The site builds one plate's parts per plate, keyed by maker id, and rebuilds when the plates' ids change, as the workforce sheet rebuilds its groups.
  - The plates sit side by side when there are two, as in `refinery.png`. One plate keeps today's layout.
  - The scene draws the Granite's hopper and the saw (`mach-saw.png`, dim when not running) on the right, with the bypass chute between, after the prototype's seventeenth version. With one maker, today's drawing is unchanged.
- [ ] **Step 4:** Run:
  - the test, then `npm run gate -- fast`;
  - `VISUAL_ONLY='slice refinery' npm run visual` (unchanged) and `VISUAL_ONLY='slice refinery two levels' npm run visual` (passes at both sizes);
  - `npm run play -- --save two-levels`: go to the refinery, then tap the saws' + and the saw key. Expect no page error and the save line ok.

  Save a shot to `/mnt/project-files/saws-trucks-card/refinery-two-levels.png`. It is a network mount: use a trailing slash, and re-check after ten seconds.

- [ ] **Step 5: Commit and push:** "The refinery paints the saws' plate and draws the Granite's hopper and saw, off in play (#754)".

### Task 3: The trucks' key in the city

**Files:**

- Modify: `src/city-view.ts` (`vehicleKeys` and the truck's hint, `completion`), `src/city-site.ts` (every key, plus the hint), `src/city.css`, `src/price-icons.ts` only if it lacks a vehicle's good
- Modify: `tools/browser/fixtures.ts` (a save `warehouse-trucks`: part 3 on, the Warehouse operational, brick for a truck; and the existing part 2 Warehouse save opened with `?part3=1` for the hint), `scripts/visual/frame.mjs` (section `slice city trucks`, both sizes, key sizes and gaps)
- Test: `src/city-view.test.ts`, `src/city-site.test.ts`

**Interfaces:**

- Produces:
  - `VehicleKey` gains `good: GoodId`.
  - `vehicleHint(mountain: Mountain): string | undefined`: `"Trucks: after the Warehouse"` while ruling 6's middle case holds, else undefined.

- [ ] **Step 1: Write the failing tests** in `city-view.test.ts`:
  - "says trucks come after the Warehouse while it is the project in hand, in part 3". Part 3 on with the Light Tower operational and the Warehouse ordered: `vehicleHint` is `"Trucks: after the Warehouse"`. With the Light Tower still in hand, or part 3 off, it is undefined.
  - "words the truck's price in brick". With the Warehouse operational and part 3 on, `vehicleKeys(m, "one")[1]` has `id: "truck"`, `good: "brick"` and `face: "+Truck · 400/s"`, and its `label` contains `"brick"`. The wagon's label still says `"stone"`.
  - "says the Warehouse opens trucks in part 3". The Warehouse's `On completion:` line ends `" Opens trucks."` with part 3 on, and not with part 3 off.

  In `city-site.test.ts`, "paints the truck key beside the wagon's, and the hint before it": a `[data-vehicle="truck"]` key, a tap on it buying a truck, and the hint's element text.

- [ ] **Step 2:** Run them and see them fail.
- [ ] **Step 3: Implement it.**
  - `vehicleKeys` reads each vehicle's good for `can` (it already does), its label's good word (the `GOOD_NAMES` table, lower case) and `good`.
  - The site keeps one key's parts per vehicle id, and its icon comes from `priceIcon(key.good)`.
  - The hint is a dark, non-button cell in the key's place, so it takes no tap.
  - `completion` adds the trucks the way it adds the refinery.
- [ ] **Step 4:** Run the tests, `npm run gate -- fast`, `VISUAL_ONLY='slice city' npm run visual` (unchanged) and `VISUAL_ONLY='slice city trucks' npm run visual`. Then run `npm run play -- --save warehouse-trucks` and buy a truck: expect no page error and the save line ok. Save shots of the key and of the hint to `/mnt/project-files/saws-trucks-card/`.
- [ ] **Step 5: Commit and push:** "The city sells trucks for brick once the Warehouse is operational, and says they come after it while it is in hand, off in play (#754)".

### Task 4: The card that says the Granite is reached

**Files:**

- Modify: `src/session.ts` (the `level` notice and its baseline), `src/frame-cards.ts` and `src/frame-cards-words.ts` (`LEVEL_REACHED`), `src/progress-store.ts` (the `DismissTarget`), the card CSS if needed
- Modify: `tools/browser/fixtures.ts` only if `granite-unsunk` cannot afford the Sink, and `scripts/visual/frame.mjs` (section `slice card granite`, both sizes)
- Test: `src/session.test.ts` (or the file that tests `operational` notices), `src/frame-cards.test.ts`

**Interfaces:**

- Produces:
  - `Notice` gains `{ readonly kind: "level"; readonly level: "granite" }`.
  - `LEVEL_REACHED: CardWords` in `frame-cards-words`, with ruling 8's words.

- [ ] **Step 1: Write the failing tests.**
  - In the session test, "announces the Granite once when the shaft is sunk": a session at the unsunk baseline, then a `sinkShaft` move, gives one `level` notice. A second step gives no new notice.
  - "does not announce a Granite already sunk at load, or on an adopted copy": mirror the `operational` tests.
  - In `frame-cards.test.ts`, "shows the Granite's card after a night's report and before a building's", plus "its Continue dismisses it". The title is `"The Granite: reached"` and the paragraphs are ruling 8's four, as literal strings.
- [ ] **Step 2:** Run them and see them fail.
- [ ] **Step 3: Implement it.** Raise and drop the notice beside `operational` (`session.ts` ~611–623 and ~252/711), with a `granite` baseline. `frameCard` returns `{ kind: "level" }` after the report check and before the `operational` one. `dismiss("level")` drops it.
- [ ] **Step 4:** Run the tests and `npm run gate -- fast`. Then `npm run play -- --save granite-unsunk`, tap Sink, and expect the card. Tap Continue and expect the two-level mine, with no page error and the save line ok. Run `VISUAL_ONLY='slice card granite' npm run visual`. Save the card's shot to `/mnt/project-files/saws-trucks-card/granite-card.png`.
- [ ] **Step 5: Commit and push:** "A card says the Granite is reached when the shaft is sunk, off in play (#754)".

### Task 5: Docs, and the question to Flemming

**Files:**

- Modify: `docs/ARCHITECTURE.md` (a #754 bullet after #680's), `docs/DESIGN.md` (the refinery with saws, the trucks' key, the level card), `docs/ui-audit.md` (the new sections and their shots: capture only the new shots, and revert any old one the audit run rewrites)

- [ ] **Step 1:** Write the docs in the style of #680's lines.
- [ ] **Step 2:** `npm run gate -- fast`. Expect OK.
- [ ] **Step 3: Commit and push:** "Docs for the saws, the trucks and the Granite's card (#754)".
- [ ] **Step 4 (controller):** Send the coordinator one full question with ruling 9's lines and the shots attached, three options and one recommended. Record his answer in `docs/decisions.md` in this PR.
