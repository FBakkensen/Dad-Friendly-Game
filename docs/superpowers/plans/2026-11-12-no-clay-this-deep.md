# No clay this deep (#492)

**Goal:** a recipe that lacks a material the rest of the run's mountain can no longer give says so ("No clay this deep") instead of promising "Need 4 more clay" from the Granite to the bottom. Its lamp stays dark and it takes no craft tap, as a short row does now.

**Shared modules:** the band rule goes in `src/layers.ts` (`materialLeftToDig`, beside `materialsGained`, from `materialsFromMined`, so it can't drift from what digging grants). The row's action stays in `actionFor` (`src/workshop-sheet.ts`), with a `goneMaterial` check before `craftShortfall`. The words go in `src/screen-words.ts` (`goneMaterialWords`). No new module.

## Rulings (agent-run sitting)

1. **Words:** "No clay this deep" (Flemming, 12 Nov). The same pattern covers a deeper band's material once its band is dug ("No iron this deep" on the Deep Heart), which the issue's out-of-scope line leaves in.
2. **Gone means none left:** the row says it only when the rest of the mountain holds none of that material. A shortfall near the end of the Topsoil, where one or two clay are still to come, keeps "Need 4 more clay".
3. **Gone before short:** a material that is gone is named before the stones a craft still lacks. Bands are dug in the order recipes list their materials, so the first material lacking is the gone one: Sturdy props in the Granite says "No clay this deep".
4. **Same row state:** the action stays `short`, so the dark lamp, the dim tag, the refused tap and the order rank are unchanged.

## Tasks

1. `materialLeftToDig` with Vitest (`src/layers.test.ts`).
2. `goneMaterial` and the action, Vitest in `src/workshop-sheet.test.ts`; the row test's Granite fixture now reads the new words.
3. Visual check's workshop-free line; docs (`DESIGN.md`, `ARCHITECTURE.md`).

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the workshop visual section and `npm run play -- --save heart label:Workshop`.
