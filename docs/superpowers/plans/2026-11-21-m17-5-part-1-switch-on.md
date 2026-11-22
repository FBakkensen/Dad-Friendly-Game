# M17-5: Slice 2 Part 1 Switch-On & v11 Save Reset (#769)

**Resets the save** (version 11). Approved by Flemming on 21 Nov 2026 (`docs/decisions.md`).

## Scope

1. **Switch on Slice 2 Part 1 in play (`src/part-switch.ts`, `src/boot.ts`, `src/lab/run.ts`):**
   - Add `[SLICE_2_PART_1_OFF]: 0` to `PLAY_FACTORS`; remove dev-only `?slice2Part1=1`; simplify `LAB_FACTORS = PLAY_FACTORS`.
2. **Version 11 save reset (`src/persist.ts`, `src/save-format.ts`, `firestore.rules`):**
   - Bump `SAVE_VERSION` from 10 to 11 (`firestore.rules` `data.version >= 11`, keeping `machineSyn` optional in `isFieldUpgrades` for one release for cached v10 tabs).
   - Move `granite` to `mineLevels: { granite: ... }`; remove retired keys (`clocks`, `bench`, `station`, `marks.recipes`, `run.granite`, `clay`/`iron`/`crystal`/`heartstone`, `machineSyn`).
3. **Retirements:**
   - Delete `src/workshop.ts`, old `src/factory*.ts`, `src/lab/work-orders.ts`, clay/iron/crystal/heartstone trickle (`GoodId = "stones" | "brick" | "cutStone"`), `machineSyn`, `graniteDug`, `clocks`, `bench`/`crafted`/`recipes`/`station`.
   - Keep Factory tab hidden in the site bar until Part 2 opens steady-flow Factory.
   - Align `src/refinery-view.ts` maker buffer and live rate readouts with `makerBuffers` and `slice2LiveSnapshot`.
4. **Tests, Visuals, Journeys, UI Audit & Docs:**
   - Update save/unit/rules tests, browser fixtures (v11 `mineLevels`), visual checks (`scripts/visual/frame.mjs`), Playwright journeys (`player.ts` driving/vehicles via Transport sheet, `first-evening.journey.ts` proving 1 worker cycles `drilling -> haulage -> hoisting -> driving` to earn Stone and hire Worker #2, `kill-and-reopen.journey.ts`, `the-granite.journey.ts`), `scripts/ui-audit.mjs` + `docs/ui-audit/*`, `scripts/play.mjs`, `docs/pacing-ledger.md`, and docs (`docs/DESIGN.md`, `docs/design-intent.md`, `docs/ARCHITECTURE.md`, `docs/ui-audit.md`, `.claude/rules/observable-saves.md`).
