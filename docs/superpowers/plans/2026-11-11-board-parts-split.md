# R2: split the board parts (#421)

**Goal:** the four board functions #421 lists come under the function limits (150 lines, complexity 15), with behaviour and look unchanged, and their entries leave both ceiling lists.

**Approach (as R1, #420):** split each into named steps in its own module. No new module: every helper stays in the file it came from. Prove "unchanged" with a throwaway old-against-new harness (not committed) that drives `origin/main`'s copy and this branch's copy with the same seeded inputs and compares the DOM after every step, then the existing tests, the visual sections and `npm run play`.

## Tasks

1. **`src/board-relics.ts#createRelicPlate>render` (complexity 19).** Move the per-socket work into a module function `paintSocket(socket, relic, state)`, with the art pick in `socketArt` and the spoken state in `socketWords`. Same DOM writes in the same order.
2. **`src/board-save.ts#createSaveLine` (158 lines).** Build the line and the drawer in two module functions, `buildStatus()` and `buildDrawer()`, that return their handles. The state, render and listeners stay in `createSaveLine`.
3. **`src/how-it-works.ts#howItWorks` (286 lines).** The record is built from five group functions in `HOW_SYSTEMS` order (`crewCards`, `spendCards`, `engineerCards`, `depthCards`, `endCards`); the three with prices on them take the run's price formatters. The spread keeps the key order.
4. **`src/board-window.ts#createMineWindow` (326 lines).** `buildParts(legacyBadge)` (with `buildView` for the view) makes the DOM in today's order and returns the parts. The old `paint` body becomes `paintMachines` and `paintRun` (which takes and returns whether the tub is drawn full), and `paint` stays as a small wrapper. The puff and "+N" steps (`startPuff`, `stepPuff`, `stepRise`), the pointer spot (`pointIn`) and the vein's place (`placeVein`) become module functions. `VeinSpot` moves to `mine-window.ts`, beside `veinSpot`, and `screen-vein.ts` imports it. `createMineWindow` keeps the state, the listeners, `render`, `showVein`, `tick`, `dug` and `loading`.
5. **Ceilings and proof.** Remove the four entries from `scripts/function-ceilings.json` and `scripts/complexity-ceilings.json`. Run the harness, the four test files, `npm run gate -- fast`, the visual sections for the mine window, the save line, the relic plate and the "i" cards, `npm run play` on the mid and machine saves, then `npm run gate -- full`.

## Verification ladder

As `.claude/rules/dad-friendly-work.md`: the test file, `npm run gate -- fast`, the visual sections and `npm run play`, the full gate once before the PR.
