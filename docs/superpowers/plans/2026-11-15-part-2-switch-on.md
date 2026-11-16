# Part 2 is switched on: brick and nights (#672)

Written while #734 (#671, the refinery screen) waited on Flemming's answer on its lines, and built once it merged. Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "How it would be built" and "Proof".

## What changes for the player

The Light Tower's roof opens the refinery (kilns, brick, the stockyard) for everyone. The night's eight-hour clock goes once the stockyard is open: a night runs until the stockyard is full. The city orders the Warehouse next (stone and brick), and its roof is the end of the game until part 3. **Does not reset the save:** part 2's facts (`makers`, `stockyard`, `brick`, `kilns`, the `kiln` pile) have been in the save's game map since #666 with no version bump. A part 1 save whose Light Tower is already operational opens the refinery on its next open.

## Rulings (the thread's, agent-run)

1. **The switch.** `boot`'s `createAppServices` holds `part2.off=0` beside `fresh.off=0` for every page, as #664 did for the fresh mine. Outside the page the factor still reads 1, so unit tests and labs play what they set. The dev-only `?part2=1` option (#671) goes: `BootOptions.partTwo`, its test, and `PART_TWO` in `scripts/play.mjs`, `scripts/visual/frame.mjs` and `scripts/ui-audit.mjs` become plain `?memorySave=1`.
2. **The journeys' rules mirror** (`tools/journeys/expected.ts`) holds `part2.off=0` beside `fresh.off=0`, so the rules the board is compared to are the page's.
3. **The Warehouse on its plot.** `city-scene`'s `BUILDING_URLS` gains `warehouse` (`src/assets/city/warehouse.png`, 46×39 on the 56-wide second plot), 5 into its plot (`buildingX`), so its scaffold stays inside the plot. The second plot has no room beside it, so the site's yard (`siteYard`: the heap and the builders) is to its left, on the first plot's free ground beside the Light Tower, which is operational by then. The glow is the shared one, at the picture's middle.
   - Found in play: the city card's bars all showed the stone picture. `city-site` now gives each bar its own good's picture (`data-good`), with a DOM test.
4. **Cards.** Already built in #671: in part 2 the Light Tower's roof brings the card that opens the refinery and the end card waits for the Warehouse. Nothing new, but every part 1 check that expects the end card at the Light Tower changes (below).
5. **No new copy expected.** If the Warehouse's site or card turns up a line that is not in #671's answered lines, it goes to Flemming as one question before the merge.

## Tasks (tests first, each screen's checks green in its own task)

1. **Switch on.** `boot.ts`: hold `PART_TWO_OFF: 0` always; drop `partTwo` and its parse; `boot.test` asserts both factors held. `expected.ts` holds both. Run `npx vitest run src/boot.test.ts`.
2. **City: the Warehouse.** `city-scene.test`/`city-view.test` first: the second plot draws the Warehouse rising behind scaffold, and its site's heap and builders stay inside the second plot's span. Then `drawSite`/`drawBuilders` take the span of `scene.sitePlot`. Visual: `slice frame` city checks (`cityFits`) for a save with the Warehouse ordered: add fixture `sliceWarehouseSave` (Light Tower operational, Warehouse delivering, brick in the stockyard) and a `warehouse` entry in `SAVES`, plus a play save.
3. **Part 1's checks become part 2's.**
   - `scripts/visual/frame.mjs`: the `roof` NIGHTS entry now expects the report, then the `opens` card (fold `slice refinery opens` into it), not the end card. Add an end-card check on a Warehouse-roof save (`sliceWarehouseRoofSave`).
   - `first-evening.journey.ts`: after the roof, the card is "The Light Tower: operational" still (same title), then the refinery's tab is in the site bar.
   - `frame-cards.test`: the part 1 end-card tests hold `part2.off=1` explicitly or move to the Warehouse.
   - `ui-audit.mjs`: `slice-card-end` becomes the Warehouse's end card; `slice-card-opens` loses `&part2=1`.
4. **Journeys (done-when).**
   - `stockyard-full.journey.ts`: open `sliceYardFullSave` twelve hours later; the report's words equal `shiftReport` of the rules' night (marks and "Stockyard full: production stopped."), "To the stockyard" opens the refinery, and the top row reads the full stockpiles; the mine goes on as the rules say.
   - `night-builds.journey.ts`: `sliceWarehouseRoofSave` opened twelve hours later; the report's words equal `shiftReport` of the rules' night, the Warehouse's end card comes up behind it, and the order strip reads the planning line, as the rules say.
5. **Docs.** DESIGN ("The game now": part 2 live, the Warehouse's roof is the end), design-intent, ARCHITECTURE (boot holds both switches; the dev option is gone), ui-audit (rows lose "part 2 on the dev page"), ART.md (the Warehouse is drawn).
6. **Prove.** Ladder: test files → `npm run gate -- fast` → `VISUAL_ONLY='slice'` and `npm run play` on `refinery`, `yardfull`, `roof`, the Warehouse saves → `npm run journeys -- stockyard-full night-builds first-evening` → PR → full gate → signoff.

## Open checks before building

- `npm run lab:...` part 2 numbers are #667's; the switch-on does not move the pacing ledger unless the lab's default sweep is changed (it is not).
- Whether the field log or save line needs a part 2 fact (no: nothing new is saved).
