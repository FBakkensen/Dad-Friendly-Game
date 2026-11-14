# The hoist and the pit train exist in the save (#533, M15-3)

**Goal:** two new machines from the spec (`docs/superpowers/specs/2026-11-14-line-works-village-design.md`, "Step 1: the line", "Machines"), the hoist (the lift) and the pit train (the haul), are full tiers that a save can hold and the lab can buy. In play they are not on sale and count for nothing, so play reads as on `main`.

**Shared modules:** `src/tiers.ts` holds every tier, and the two join `TIERS` there. The save fields go in the workshop map (`src/save-format.ts`), where #195 puts every later field because the mountain map is at the rules' expression budget. One new flag on a tier, `line: true`, and one test, `tierInPlay(tier)` in `src/tiers.ts`, read `lineOn()` from `src/line.ts` (#532). Every place that offers or runs a machine already goes through `tierShown`, `tierLocked`, `MACHINE_IDS` or `staffSlots`, so the gate goes into those, not into each screen. `MACHINE_STAGE` in `src/line.ts` gets the two stages. `src/mountain.ts` gets the two counts.

## Rulings (agent-run sitting)

1. **Ids and names.** Tier ids `hoist` and `train`; save fields `hoists` and `trains`; names "Hoist" and "Pit train", short names "Hoist" and "Train". The names are the spec's and are Flemming's to change when the Buys rows show them (#538).
2. **Numbers in today's units.** The spec rates every machine at three times today's speed (rule 3), and #534 moves all of them together. So here the hoist is 20 a second (60 / 3) and the pit train 1,067 (3,200 / 3, rounded, as the borer's 357 is 1,071 / 3). First prices are the spec's: 6,000 and 30,000,000. Staff: 1 and 8. They climb on the machine curve like their neighbours.
3. **Where they open.** The hoist opens once a cart is owned, the pit train at the Crystal Caves (`BAND_STARTS[2]`). The hoist uses `tierShown`'s "previous tier owned" rule, since it sits after the cart in price order. The drill's "once he owns a hoist" comes for free with the line on, because the drill's previous tier is then the hoist. With the line off the hoist is skipped, so the drill still shows after a cart.
4. **Order.** `TIERS` stays cheapest first: worker, cart, hoist, drill, borer, pit train, Great Machine, kid.
5. **Off in play.** `tierInPlay(tier)` is false for a `line` tier while `lineOn()` is false. Such a tier is never shown (`tierShown`), is locked (`buyCrew` refuses it), is left out of `MACHINE_IDS`-based offers in play (Ready now), takes no hands (`staffSlots`) and moves nothing. `MACHINE_IDS` itself keeps all six so the lab's tables have a column for them.
6. **Marks like their neighbours.** The hoist takes the cart's marks (10, 25, 50, 100, 150, 200), the pit train the borer's (5, 10, …, 200). Their goal lines are plain and are not shown until #538, where Flemming approves them.
7. **No band favours them yet.** `hardnessOf` gives them 1 everywhere. The band table is waiting on Flemming and on the new resource design, so nothing here hard-codes it.
8. **No engineer post, gear, synergy or trouble** for the two. Engineers by stage are #539.
9. **Old saves load unchanged:** a missing `hoists` or `trains` reads 0.
10. **The workshop map, not the mountain map.** Two more checks in the mountain map crossed the rules' 1000-expression budget on the maximal save (the rules test caught it). The workshop map holds them, the rules comment lists them, and the client parser rejects a bad count, as for the clocks and the stretch.
11. **The field log keeps to the shown tiers.** Its rules hold a closed crew list at the budget too; the line's machines join it when the line turns on (#536).

## Tasks

1. `src/tiers.ts`, `src/line.ts`, `src/milestones.ts`, `src/mountain.ts`: the two tiers, the flag, `tierInPlay`, the stages, the marks and the fields. Fix every exhaustive record `tsc` names. Tests in `tiers.test.ts`, `line.test.ts`, `milestones.test.ts`: price, speed, staff, stage, marks, and `tierShown` with the line off and on.
2. The gate: `tierShown`, `tierLock`/`buyCrew`, `staffSlots`, Ready now. Tests: with the line off a save holding hoists and trains mines what it mines without them and offers neither; with it on, they run and count in their stages, and the lab's actions offer them.
3. The save: `src/save-format.ts` parse and write in the workshop map, the `firestore.rules` comment, the rules test with the emulator (round trip, and the maximal save with both under the budget). Tests: a round trip with both, an old save without them loads unchanged (local and cloud) and writes no new keys, and a bad count is rejected by the parser.
4. Docs: `ARCHITECTURE.md` (the tiers and the save fields), `DESIGN.md` only if it lists the tiers' numbers.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test files, `npm run gate -- fast`, then the full gate (it runs the rules emulator, play, the pacing pins and both labs). Nothing the player sees changes.
