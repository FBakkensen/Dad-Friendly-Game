# Control Board B6a: the Workshop drawer (#374) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Workshop key opens a riveted board drawer, as Buys and Upgrades do (#373). The drawer holds:

- a material plate for each material met (iron, clay, crystal, heartstone);
- the bench as a row, with its clock, its progress bar, and its cancel confirm on the same row;
- the live timers line;
- the recipes as 76px rows, three a page, with Earlier and More to make;
- the sound toggle in the head, beside the "i".

The menu's Workshop row stays a second door into the same drawer until B7. Out of scope: the Engineers drawer (#455), the Ledger and the menu (B7), and the craft-done card (B7, spec "Where everything else goes").

**Architecture:**

- **Pure rules with unit tests.** A new module, `src/workshop-rows.ts`, sits beside `src/workshop-sheet.ts`. `workshop-sheet.ts` stays the Workshop's rules (cards, bench, timers, pages). `workshop-rows.ts` turns those into `RowView`s (`src/row-view.ts`) and plate views, as `buys-rows.ts` and `upgrade-rows.ts` do for B5. It imports no art.
- **Shared drawer pieces, extended.**
  - `board-drawer.ts` gains `BoardSheet.page()`. This is the one way a panel says "a new screen under the finger". `showHow` already does this inside the shell; `page()` exposes it. Each head key also gets a shared class, `board-sheet-key`.
  - `board-how-art.ts` learns the Workshop's and Materials' "i" cards.
- **Workshop-only DOM parts** go in a new module, `src/workshop-parts.ts`: the plates, the bench row, the pager and the sound key. It is new because these parts belong to the Workshop alone. `board-row.ts` and `board-drawer.ts` stay generic.
- **The panel.** `src/workshop-panel.ts` is rewritten as a thin builder on `createBoardSheet` and `rowsOnBoard`, with every function under 150 lines and complexity 15. Its order and pages ride on the board model's existing `layout` input (`board-interaction.ts`), so rows never move under a finger. Its taps go through the model (`pressOnBoard`, `rowsOnBoard.press`), so the settle, the Done hold and the red blink are B5's.
- **Wiring.**
  - The rail key opens the drawer itself (`screen-keys.ts`).
  - The drawer joins the board's sheet clip and scrim (`screen-layout.ts`) and `overlays.drawers` (`mountain-screen.ts`).
  - It leaves `cardsFrom` (`screen-panels.ts`).

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom per file), puppeteer-core scripts (`scripts/visual-check.mjs` and its `scripts/visual/*.mjs`, `scripts/play.mjs`, `scripts/ui-audit.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-07-control-board-design.md`. This plan uses:

- the drawer shell and row anatomy (lines 106–118);
- the Workshop line: "a plate for each material met (iron, clay, crystal, heartstone), the bench, recipes in pages, the cancel confirm and the sound toggle, as today" (line 121);
- C5 (timers), C13 (today's copy), "Checks", and the B6 row: done when every Workshop state is seen in play at 924.

The mockup is `mockups/control-board/index.html`:

- the Workshop sheet: `SHEETS.workshop`, at 1393;
- the plates: markup at 1416, CSS at 232–236;
- the recipe rows: 735–744.

Issue #374 is binding.

## Art

Every icon the drawer needs exists. Nothing in this plan spends PixelLab credits.

| Asset (under `src/assets/board/`) | Size  | Source                                                                          | Used by                                                  |
| --------------------------------- | ----- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `res-clay.png`                    | 16×16 | Copied in Task 1 from `mockups/control-board/assets/art/ind-board/res-clay.png` | The clay plate, and the "ore-lump" step of the "i" cards |
| `res-iron.png`                    | 16×16 | Copied in Task 3 from `mockups/control-board/assets/art/ind-board/res-iron.png` | The iron plate                                           |
| `res-crystal.png`                 | 16×16 | PixelLab, already on the branch (commit `cefce81`)                              | The crystal plate                                        |
| `res-heart.png`                   | 16×16 | PixelLab, already on the branch (commit `cefce81`)                              | The heartstone plate                                     |
| `relic-hammer.png`                | 24×24 | Already in `src/assets/board/`                                                  | The "relics/hammer" steps of the "i" cards, shown at 48  |

All of them show at exactly 2×. Recipe rows have no icon. No placeholder art is ever committed.

## Global Constraints

- **UI only.** No rule, number, price, save field or lab change. Every craft and every cancel goes through today's moves, `{ kind: "craft", recipe }` and `{ kind: "cancelCraft" }`. Exporting or extending a pure helper is fine; extending `BenchView`, `RecipeCard` and `workshopPages` is named below.
- **Shared modules** (CLAUDE rule "name the shared module"):
  - settle, hold and blink: `board-interaction.ts` through `board-host.ts`;
  - presses: `card-tap.ts` (`pressOnBoard`, `buyOnTap` through `rowsOnBoard.tap`);
  - rows: `board-row.ts`;
  - shell, "i" and scrim: `board-drawer.ts`;
  - "i" art: `board-how-art.ts`;
  - legends and DOM helpers: `board-dom.ts` (`legend`, `el`, `write`, `hide`, `mark`, `setAttr`);
  - skins: `board-skin.ts`;
  - plate buttons: `board-save.ts#plateButton`;
  - the rules: `workshop-sheet.ts` and `workshop-teach.ts`.

  Nothing in that list is copied into a second home.

- **Motion.** Hard steps only, as B5:
  - a short craft or a refused tap blinks the lamp red (four 140ms frames), and not under reduced motion;
  - the bar moves in whole art px with no transition;
  - no bounce, float or shake.
- **Sizes at 424×924.**
  - The drawer sits at 178..864 × 8..416, and the list is 380 wide.
  - Rows are 76 tall, 10 apart.
  - Plates are 48 tall with 8px gaps.
  - Pager plates and the sound key are 48 tall.
  - Targets are at least 48×48 with 8px gaps.
  - Text is at least 13px. Contrast is at least 4.5:1. Numbers (counts, clocks, tags) are in `.board-num`.
  - The list fits without scrolling on every save (budget in Rulings).
  - New CSS lives in `src/board.css` with `calc(var(--art) * N)` or tokens (`npm run tokens`).
- **Copy.** Today's words stay:
  - `BENCH_FREE`, `WORKSHOP_FREE_ASIDE`, `BENCH_BUSY_ASIDE`, `BENCH_UNKNOWN`, `BENCH_UNKNOWN_ASIDE`;
  - `refundBackWords` ("Cancel · 10 clay and 4 iron back"), `WORKSHOP_CANCEL_CONFIRM` ("Tap again to cancel");
  - `needMoreWords` ("Need 4 more iron"), `CRAFT_WORD`, `WORKSHOP_BENCH_BUSY`, `RECIPE_ON_BENCH`;
  - `timerLeftWords`, `craftTimeWords`, `craftLevelWords`, `materialCostWords`, `UNFOUND_HINT`, `UNFOUND_DEEPER`;
  - `WORKSHOP_QUIET`/`WORKSHOP_SOUND` and the sound key's `aria-label`s ("Sound is off"/"Sound is on");
  - `WORKSHOP_EARLIER`, `WORKSHOP_MORE`, `HOW_IT_WORKS.workshop.reveal` (the teach intro), the payoff words, and `workshopMenuWords`/`WORKSHOP_LOCKED` in the menu.

  The new strings, listed in the PR for Flemming:
  - the kick `One bench. Crafts finish while you are away` (the mockup's);
  - the legend `Recipes`;
  - the sketch row's name `Sketch`;
  - the plate words `clay`, `iron`, `crystal`, `heartstone`;
  - the "i" Back `Back to the Workshop` (today's how-card Back, now a plate).

- **Ceilings.** Remove `src/workshop-panel.ts#createWorkshopPanel` from `scripts/function-ceilings.json` and `src/workshop-panel.ts#createWorkshopPanel>render` from `scripts/complexity-ceilings.json` in Task 4. No entry is added. The coverage floors for `src/workshop-panel.ts` in `vite.config.ts` (95/79/86/95) are kept, never lowered.
- **Verification ladder** (`.claude/rules/dad-friendly-work.md`). Each task climbs in this order, and stops as soon as its step proves the change:
  1. the touched test files;
  2. `npm run gate -- fast`;
  3. the named `VISUAL_ONLY` sections and `npm run play` on the named save;
  4. `npm run gate -- full`, once, in Task 5.

  Never run two browser scripts at once. `npx knip` passes at every commit.

- **Commits** are a plain sentence ending ` (#374)`, with the trailers below. Push after each task: `git push origin claude/project-thread-bv4l8j`.

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011RgeWsS7EcGfk9opPt3V2W
  ```

## Review Focus

1. **A sleepy double tap.**
   - Key, then the row under the finger: nothing is crafted.
   - A tap on a busy bench arms the cancel. A second tap inside the settle does nothing. Past the settle it cancels.
   - A pager plate pages once, and the second tap lands on nothing.
   - A craft holds its row for 1.9s ("Done").
2. **Rows never move under a finger.** A craft, a cancel or the tick changes words and lamps, never the order. The order is frozen as the drawer opens. A recipe finished while the drawer is open keeps its place, dark.
3. **A save that loads again under the open drawer.** Rows, plates and bench go dark and disabled, then fill in again. If the save turns out locked (Start over), the drawer closes.
4. **The two doors.**
   - The key and the menu's Workshop row open the same drawer.
   - Back returns focus to the door it came from. If that key is disabled during a re-load, focus goes to the Ledger key.
   - Opening Buys or Upgrades closes Workshop, and Workshop closes them.
   - The scrim and Escape close it.

---

### Task 1: The Workshop's "i" cards and the drawer's shared pieces

**Extends:**

- `src/board-how-art.ts`: the art map and the systems;
- `src/board-drawer.ts`: `page()` and the head key's class;
- `src/board.css`: the 48px step and the head-key grid;
- `src/board-interaction.ts`: only the doc comment on the `page` input.

**Files:**

- Modify: `src/board-how-art.ts`, `src/board-how-art.test.ts`, `src/board-drawer.ts`, `src/board-drawer.test.ts`, `src/board.css`, `src/board-interaction.ts`.
- Create: `src/assets/board/res-clay.png` (copied as it is from the mockup).

- [ ] **Step 1: Write the failing tests.**
  - `board-how-art.test.ts`:
    - `boardHowCard("workshop", "Back to the Workshop", …)` renders four steps. The `relics/hammer` step uses `relic-hammer.png` with `width` 48. The `ore-lump` step uses `res-clay.png` at 32. `mine-cart` is at 64 and `upgrades-icon` at 32.
    - `boardHowCard("materials", …)` renders three steps, with no fallback stone where a real icon is mapped.
    - Extend the existing "draws the board's own art, not today's" case to both systems.
  - `board-drawer.test.ts`:
    - `"page() starts the settle again and forgets the presses"`: open a sheet. Step past `DRAWER_SETTLE_MS` and call `sheet.page()`. A finger press on Back 100ms later is `ignore-early`; one at 450ms acts. `onForget` was called.
    - `"showHow pages through page()"`: the existing "i" settle tests still pass.
    - `"a head key gets board-sheet-key"`: a sheet built with `headKey` has `.board-sheet-head.has-key > .board-sheet-key`.
- [ ] **Step 2:** `npx vitest run src/board-how-art.test.ts src/board-drawer.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `BoardHowArt.px` becomes `32 | 48 | 64`. `BOARD_HOW_ART` gains:
    - `"relics/hammer": { src: relicHammerUrl, px: 48 }`;
    - `"ore-lump": { src: clayUrl, px: 32 }`.
  - `BoardHowSystem` gains `"workshop" | "materials"`.
  - `BoardSheet.page(): void` does exactly what `showHow` does today when `shown`: forget, then `board.send({ kind: "page", overlay: name, at: board.clock() })`. `showHow` calls it.
  - `buildSheet` adds `board-sheet-key` to `headKey`.
  - `board.css`:
    - `.board-sheet .teach-how-steps img[width="48"] { width/height: calc(var(--art) * 24); margin: 0 calc(var(--art) * 4) }`, which centres it in the 64 column;
    - the grid rules of `.board-sheet-head > .buy-amount` move to `.board-sheet-head > .board-sheet-key`. `.buy-amount` keeps only its width and font.
  - In `board-interaction.ts`, the comment on `page` reads: a new screen under the finger (the "i" cards, a Workshop page, an armed cancel), so the settle starts again.
- [ ] **Step 4:** Run the two test files and `npm run gate -- fast`, then `VISUAL_ONLY='^keys and drawers \[424,924\] (early|mid)$' npm run visual`. Buys' amount key still sits in its head.
- [ ] **Step 5: Commit** `The drawer shell can start a new page, and the "i" art knows the Workshop and Materials cards (#374)` and push.

### Task 2: The Workshop rows' rules

**Extends:** `src/workshop-sheet.ts`, which stays the rules. It gains a bench `clock`, a recipe `stonesTag`, and a `workshopPages` that is generic over its item.

**New:** `src/workshop-rows.ts`. It turns the rules into views, the B5 `*-rows.ts` pattern.

**Files:**

- Create: `src/workshop-rows.ts`, `src/workshop-rows.test.ts`.
- Modify: `src/workshop-sheet.ts`, `src/workshop-sheet.test.ts`, `src/screen-words.ts`, `vite.config.ts` (a 100/100/100/100 floor for `src/workshop-rows.ts`).

**Produces:**

- In `workshop-sheet.ts`:
  - `BenchView` `busy` and `unknown` gain `readonly clock: string`: `formatClock(left)`, or `"ready"` when the clock has rung.
  - `RecipeCard` gains `readonly stonesTag: string | undefined`, which is `formatCompact(cost.stones)` when the craft spends stones.
  - `HiddenCard` is exported.
  - `workshopPages<T>(items: readonly T[], size?: number): readonly (readonly T[])[]`. Its default size stays 4 until Task 4.
- In `screen-words.ts`: `WORKSHOP_KICK`, `RECIPES_LEGEND = "Recipes"` and `SKETCH_NAME = "Sketch"`.
- In `workshop-rows.ts`:
  - `type WorkshopPartId = \`recipe:${RecipeId}\` | "sketch"`and`partIdOf(card: WorkshopCard): WorkshopPartId`.
  - `RECIPES_A_PAGE = 3`.
  - `workshopOrder(cards: readonly WorkshopCard[]): readonly WorkshopPartId[]`. It is the list order, and the panel passes `teachFirst(workshopCards(…), teach)`.
  - `recipeRowView(card: RecipeCard, teach: WorkshopTeach): RowView`. It sets `name = card.name`, `badge = card.level ?? ""`, `info = [card.effect]` and `gain = card.time`, then by action:

    | action     | lamp  | state     | verb           | need           | why                  | price (dimTag)    | can |
    | ---------- | ----- | --------- | -------------- | -------------- | -------------------- | ----------------- | --- |
    | `craft`    | green | `ready`   | `Craft`        | —              | the materials, " · " | `stonesTag`       | yes |
    | `short`    | off   | `short`   | `Craft`        | `action.label` | —                    | `stonesTag` (dim) | no  |
    | `waiting`  | off   | `dear`    | `Bench busy`   | —              | the materials        | `stonesTag` (dim) | no  |
    | `on-bench` | amber | `running` | `On the bench` | —              | the materials        | —                 | no  |
    - `flag` is `["New"]` when `teach.newCard === card.id` and the action is `craft`.
    - `flag` is `[teach.payoff.text]` when `teach.payoff?.id === card.id`.
    - Otherwise `flag` is `[]`.
    - `aria` is `${name}. ${effect}. ` followed by the need, or by the verb and the costs.
    - `pick` is false.

  - `sketchRowView(card: HiddenCard): RowView`: name `Sketch`, `info [card.hint]`, lamp off, state `locked`, no verb, no price, `can` false.
  - `benchRowView(bench: BenchView, armed: boolean): BenchRowView`, where `BenchRowView extends RowView` adds `readonly progress: number | undefined` and `readonly canCancel: boolean`:
    - **free:** name `BENCH_FREE`, `info [aside]`, lamp green, state `ready`, no gain, `canCancel` false, `progress` undefined.
    - **busy:** name `recipeById(bench.recipe).name`, `info [bench.cancel, bench.aside]` when `cancel !== ""` (else `[aside]`), `gain = bench.clock`, `why = armed ? WORKSHOP_CANCEL_CONFIRM : ""`, lamp amber, state `running`, `canCancel = bench.cancel !== ""`, `progress`. Its `aria` is the title, then the cancel or the confirm.
    - **unknown:** name `BENCH_UNKNOWN`, `info [aside]`, `gain = clock`, lamp amber, state `running`, `canCancel` false, `progress`.
    - `can` equals `canCancel`.
  - `MaterialPlate { id: MaterialId; count: string; word: string; aria: string }` and `materialPlates(mountain): readonly MaterialPlate[]`.
    - It uses the materials `metMaterialChips` names, in the same order.
    - `count` is `formatCompact(have)`, `word` is the material id, and `aria` is the chip's text ("Clay 10").

- [ ] **Step 1: Write the failing tests** (`workshop-rows.test.ts`, pure, no DOM; `workshop-sheet.test.ts`):
  - one case for each row in the table, from `workshopCards` on the `granite()` shape and on the busy shape that `workshop-panel.test.ts` uses today (`sturdy-props` on the bench);
  - New and payoff from `workshopTeach` on a first-visit save and on a first-charge save;
  - the sketch;
  - the three bench kinds, armed and not; `cancel === ""` once the clock has rung;
  - plates for two, three and four materials; a spent-to-zero material keeps its plate with `0`;
  - `workshopOrder` keeps `teachFirst`'s order, sketch included; `workshopPages(order, RECIPES_A_PAGE)` makes pages of 3;
  - `benchView(...).clock` is `"8:12"` and `"ready"`; `stonesTag` is `"500K"` and undefined.
- [ ] **Step 2:** `npx vitest run src/workshop-rows.test.ts src/workshop-sheet.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** it, with each function under 40 lines. Coverage is 100%.
- [ ] **Step 4:** Run both files with coverage (`npx vitest run --coverage src/workshop-rows.test.ts`), then `npm run gate -- fast`. Nothing is seen in the browser yet.
- [ ] **Step 5: Commit** `The Workshop's recipes, bench and materials as drawer rows and plates, as pure views (#374)` and push.

### Task 3: The Workshop drawer's parts

**New:** `src/workshop-parts.ts`. It holds the Workshop-only controls, built on `createBoardRow`, `plateButton`, `skin`, `pressOnBoard` and `rowsOnBoard`. It is new because no other drawer has plates, a bench or a pager, and the shared row and shell stay generic.

**Files:**

- Create: `src/workshop-parts.ts`, `src/workshop-parts.test.ts` (happy-dom, `createBoardHost` with a fake clock and `reduced: () => false`, as `board-drawer.test.ts` builds it), and `src/assets/board/res-iron.png` (copied).
- Modify: `src/workshop-panel.ts` (only to import `playHammer` from its new home), `src/board.css`, `vite.config.ts` (a floor of 95/90/95/95 for `src/workshop-parts.ts`).

**Produces:**

- `playHammer(soundOn: boolean): void`, moved as it is from `workshop-panel.ts`.
- `createMaterialPlates({ board, onShow }): { root: HTMLElement; paint(plates: readonly MaterialPlate[] | undefined): void }`.
  - `root` is `div.workshop-mats`.
  - Each plate is `button.workshop-mat[data-material]` with the frame skin. It holds:
    - `img.workshop-mat-icon`, with `PLATE_ART: Record<MaterialId, string>` mapping clay → `res-clay.png`, iron → `res-iron.png`, crystal → `res-crystal.png` and heartstone → `res-heart.png`, at 32×32;
    - `span.workshop-mat-count.board-num`;
    - `span.workshop-mat-word`.
  - `aria-label` is the plate's `aria`.
  - With three or four plates the root has `is-packed`: the word hides and the count drops from `--board-type-20` to `--board-type-17` (budget in Rulings).
  - A plate's press is `pressOnBoard(plate, board, { layer: "workshop", id: \`mat:${id}\` })`, and `onShow()`runs on`act`.
  - `paint(undefined)` disables the plates and blanks their counts.
- `createBenchRow({ board, onBoard, page, onCancel, repaint }): BenchRow` with `{ root; paint(view: BenchRowView | undefined): void; armed(): boolean; disarm(): void }`.
  - The row is `createBoardRow({ tag: "button", className: "workshop-bench", data: { bench: "" }, name: BENCH_FREE, icon: false })`.
  - The bar is `i.workshop-bar[role=progressbar]` (`aria-valuemin` 0, `aria-valuemax` 100) at the row's foot, with a `span` whose width is whole art px. It is hidden when `progress` is undefined.
  - Its tap is `onBoard.tap(root, …)` → `onBoard.press("bench", …, "act")`. When the press is `act` and `view.canCancel`:
    - not armed: arm, call `page()`, start a 4,000ms `window.setTimeout` that disarms and calls `repaint()`, then `repaint()`;
    - armed: disarm, then `onCancel()`.
  - Otherwise the tap does nothing. A free or unknown bench never blinks.
  - `disarm()` clears the timer.
- `createPager({ board, onPage }): { root; paint(page: number, pages: number): void }`.
  - `root` is `div.workshop-pager`, a two-column grid holding `plateButton(WORKSHOP_EARLIER)` (`.workshop-earlier`) and `plateButton(WORKSHOP_MORE)` (`.workshop-more`).
  - The whole pager hides when `pages <= 1`.
  - A plate with nowhere to go is `hidden` and keeps its column, so the other never moves.
  - Each press goes through `pressOnBoard` (ids `earlier`, `more`), and `onPage(±1)` runs on `act`.
- `createSoundKey({ board, onToggle }): { root: HTMLButtonElement; paint(on: boolean): void }`.
  - `plateButton(WORKSHOP_QUIET)` with `.workshop-sound`, `aria-pressed`, and an `aria-label` of "Sound is off" or "Sound is on".
  - Its press goes through `pressOnBoard` (id `sound`).
- **CSS** (`board.css`):
  - `.workshop-mats`: flex, gap `var(--art)*4`, height `var(--art)*24`;
  - `.workshop-mat`: flex 1, padding `0 var(--art)*6` (`*2` when packed);
  - `.workshop-mat-icon`: `var(--art)*16`, pixelated;
  - `.workshop-mat-count`: `--board-type-20`;
  - `.workshop-mat-word`: `--board-type-13` in `--board-ink-2`;
  - `.workshop-bench .workshop-bar` and its fill: tokens only, no transition;
  - `.workshop-pager`: two equal columns, gap `var(--art)*4`;
  - `.workshop-sound`: width `var(--art)*36`, `--board-type-16`.

- [ ] **Step 1: Write the failing tests** (`workshop-parts.test.ts`):
  - plates: two plates show clay and iron art, counts and words; four plates are packed, with no word shown, and every `img.src` is from `src/assets/board/res-*`; a tap past the settle calls `onShow`, and one inside it does not; `paint(undefined)` disables them;
  - bench:
    - a busy view shows its name, its clock gain, the refund info and the bar at `aria-valuenow` 10;
    - a tap past the settle arms it: `why` reads `Tap again to cancel`, and `page()` was called;
    - a second click 100ms later does not call `onCancel`, and one at 450ms does;
    - armed with no second tap, it disarms at 4,000ms;
    - a free bench's tap calls nothing and does not blink;
    - an unknown bench shows no cancel;
  - pager: hidden on one page; on page 0 of 2 Earlier is hidden and More shows, both in their places (the same `offsetLeft` as on page 1 in the happy-dom layout stub, else by class); a press inside the settle pages nothing;
  - sound: `aria-pressed` and the label flip on `paint`; a tap past the settle calls `onToggle`; `playHammer(false)` makes no `AudioContext`.
- [ ] **Step 2:** `npx vitest run src/workshop-parts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `workshop-panel.ts`, only the import changes (`playHammer` from `./workshop-parts`). Today's sheet keeps working.
- [ ] **Step 4:** `npx vitest run src/workshop-parts.test.ts src/workshop-panel.test.ts`, then `npm run gate -- fast`. The live screen is unchanged.
- [ ] **Step 5: Commit** `The Workshop drawer's plates, bench row with its cancel confirm, pager and sound key (#374)` and push.

### Task 4: The Workshop key opens the drawer

This is the swap. The panel, the wiring, the CSS, every unit test and every browser check that names the old sheet change in this task, so each screen's checks stay green here (`superpowers.md`).

**Extends:**

- `src/workshop-panel.ts`, rewritten;
- `src/screen-keys.ts`, `src/screen-panels.ts`, `src/screen-layout.ts`, `src/mountain-screen.ts`;
- `src/workshop-sheet.ts` (`WORKSHOP_PAGE`);
- `scripts/visual/drawers.mjs` (`DRAWERS`), `scripts/visual/controls.mjs`, `scripts/visual/measure.mjs`;
- `tools/browser/fixtures.ts`, `scripts/play.mjs`.

**Files:**

- Modify (src): `src/workshop-panel.ts`, `src/workshop-sheet.ts`, `src/screen-keys.ts`, `src/screen-panels.ts`, `src/screen-layout.ts`, `src/mountain-screen.ts`, `src/card-tap.ts` (drop `.workshop-recipes` from the scroll-container list), `src/teach-ui.ts` (drop `setPayoff` if knip says it is unused), `src/sheet-card.ts` (drop the constants knip says are unused), `src/style.css`, `src/board.css` (drop `.workshop-dialog` from the `.engineers-dialog, .workshop-dialog` rule).
- Modify (tests): `src/workshop-panel.test.ts` (rewritten), `src/workshop-sheet.test.ts`, `src/mountain-screen-depths.test.ts` (lines 920–930, 1148–1168, 1219–1228), `src/mountain-screen-rail.test.ts` (145–158), `src/mountain-screen-order.test.ts` (207), `src/style.test.ts`, `tools/browser/fixtures.test.ts`.
- Modify (ceilings): `scripts/function-ceilings.json`, `scripts/complexity-ceilings.json`.
- Modify (browser): `scripts/visual/drawers.mjs`, `scripts/visual/measure.mjs`, `scripts/visual/controls.mjs`, `scripts/visual/engineers-workshop.mjs`, `scripts/visual/plate-and-sheets.mjs`, `scripts/ui-audit.mjs`, `scripts/play.mjs`, `tools/browser/fixtures.ts`.
- Modify (docs): `docs/ART.md`, with rows for `res-clay.png`, `res-iron.png`, `res-crystal.png` and `res-heart.png`.

**Produces:**

- `createWorkshopPanel({ dispatch, getView, now, board, overSave, door, fallbackDoor, hammerUrl, onMenuOpen, signal })` returns `{ sheet: BoardSheet; menuEntry: HTMLElement; render(): void; open(from?: HTMLElement): void }`.
  - `open` does nothing unless the save is ready and `workshopUnlocked`.
  - It dispatches `markSeen("workshop")`, resets the page to 0, disarms the cancel, then calls `sheet.open(from)`.
- **The sheet:** `createBoardSheet({ name: "workshop", title: WORKSHOP_TITLE, infoLabel: "Workshop and materials", how: { systems: ["workshop", "materials"], backLabel: "Back to the Workshop" }, headKey: sound.root, door, onOpen, onClose, onForget, … })`.
  - The kick is `teach.intro ?? WORKSHOP_KICK`.
  - `onClose` disarms the cancel. When `door.disabled`, it focuses `fallbackDoor` (the Ledger key).
- **The list, in order:**
  1. the plates;
  2. the bench row;
  3. `p.workshop-timers` (`timerLines(...).join(" · ")`, hidden when empty);
  4. `legend(RECIPES_LEGEND, "recipes")`;
  5. one `button.board-row.workshop-recipe[data-recipe]` per `RecipeId`, and one `div.board-row.workshop-sketch`;
  6. the pager.

  All rows are built once and placed with `sheet.place`.

- **Order and pages.** Every ready render sends `board.send({ kind: "layout", overlay: "workshop", layout: { parts: workshopOrder(teachFirst(workshopCards(m, at), teach)), chipRows: 0 } })`, and `onOpen` sends it once more. The model freezes it on open.
  - The panel reads `board.view().layouts.get("workshop")` and pages it with `workshopPages(parts, RECIPES_A_PAGE)`.
  - Rows on the shown page are unhidden and placed in that order. Every other row is hidden.
  - A frozen part whose card is gone paints `undefined` (dark, disabled) in its place.
  - A recipe found while the drawer is open shows at the next open.
  - The pager's `onPage` changes the page index (clamped), calls `sheet.page()`, then repaints.
- **Taps.** A recipe row's tap is `onBoard.tap(row.root, …)` → `onBoard.press(partId, …, "act")`. On `act`:
  1. Re-read the card from `getView()`.
  2. If its action is not `craft`, record `onBoard.result(id, "refused")`, which blinks red.
  3. Otherwise dispatch `craft`. On `applied`, record `result(id, "applied")` (the Done hold) and call `playHammer(soundOn)`.

  The bench's `onCancel` dispatches `cancelCraft`. On `applied` it records `result("bench", "applied")`.

- **Small functions.** `createWorkshopPanel` stays under 150 lines and complexity 15, and the floors in `vite.config.ts` hold. Helpers:
  - `createMenuEntry` (today's `menuEntry`, `openButton` and locked silhouette; the click calls `onMenuOpen`, then `open(ledgerKey)`);
  - `buildRecipeRows`;
  - `placeParts`;
  - `paintReady` (plates, bench, timers, rows);
  - `paintLoading`;
  - `arrangePage`.
- `WORKSHOP_PAGE` is gone and `RECIPES_A_PAGE` is the page size. `SHORT_WORKSHOP_PAGE` and the overflow measure (#347) go: a page is always 3.
- **Wiring.**
  - `screen-keys.ts`:
    - `wireKeys` takes `workshop: { open(from?: HTMLElement): void; sheet: BoardSheet }`;
    - `case "workshop"` closes Buys and Upgrades (`by: "program"`), then calls `workshop.open(key)`;
    - `openBuys` and the Upgrades case also close `workshop.sheet`;
    - `doorKey`, `workshopDoor`, `openingFromKey`, the `openButton` listener and `workshopClosed` go.
  - `screen-panels.ts`:
    - passes `board`, `overSave`, `door: rail.keys.workshop`, `fallbackDoor: rail.keys.ledger`, and `onMenuOpen` = `closeMenu` plus close Buys and Upgrades;
    - the `aria-expanded` write on `rail.keys.workshop` in `paintLater` goes, because the shell writes it;
    - `cardsFrom` drops `sheets.workshop.sheet`.
  - `screen-layout.ts`: `crewSheet` and `upgradesSheet` become `drawers: readonly BoardSheet[]`. They are appended to the clip in order, and the same list goes to `createSheetScrim`. This is ready for Engineers (B6b).
  - `mountain-screen.ts`: passes `drawers: [crewPanel.sheet, upgrades.sheet, workshop.sheet]` to both `createOverlays` and `layOutBoard`, and drops the `workshopClosed` relay.
  - A save that becomes locked while the drawer is open closes it in `render` (`by: "program"`, `restoreFocus: false`).
- **Fixtures** (`tools/browser/fixtures.ts`, each pinned in `fixtures.test.ts`'s "pins every builder"):
  - `firstCraftSave(now)`: `workshopSave(now, false)` with clay 10. The charge is craftable, and the Workshop is not taught, so the New row shows.
  - `chargePayoffSave(now)`: `workshopSave(now, false)` with `crafted: { "blasting-charge": 1 }`, `chargeUntil: now + 20 min`, and `seen` and `taught` holding `"workshop"`. This shows the payoff flag.
  - `unknownBenchSave(now)`: `workshopSave(now, false)` with `bench: { recipe: "steam-whistle", startedAt: now - 60_000, endsAt: now + 9 * 60_000 }`. That is a `KeptBench`, as a newer build writes it.
- **Play saves** (`scripts/play.mjs` `SAVES`):
  - `workshop-free` ("a free bench: grease to craft, a short charge, two pages");
  - `first-craft`;
  - `payoff`;
  - `bench-unknown`.

- [ ] **Step 1: Write the failing tests.**
  - `workshop-panel.test.ts`, rewritten on `mountScreen` from `src/mountain-screen.harness.ts` with fake timers and an injected `tapClock`, as `mountain-screen-rail.test.ts` does:
    - `"the Workshop key opens a board drawer"`: `.board-sheet[data-sheet=workshop].is-open`. The list holds plates, the bench row, the legend and recipe rows in order, and there is no `.workshop-dialog`.
    - `"a double tap on the key crafts nothing"`: key click, then a click on the first recipe row 150ms later → `mountain.bench` undefined. At 500ms it crafts, and the row shows Done.
    - `"Done holds the row"`: a second click at 1,800ms does nothing. At 1,950ms the row reads `On the bench`.
    - `"a short craft blinks red"`: the lamp passes `-120px` and no move is dispatched. Under reduced motion it does not blink.
    - `"the bench cancels on the second tap past the settle"`: the busy save. Tap → `Tap again to cancel`. A tap at +100ms leaves the bench busy. At +500ms the bench is free, the refund is in the pocket, and the bench row holds Done. An armed bench left alone disarms at 4,000ms.
    - `"pages of three"`: the `granite()` shape plus `axle-grease` and `reinforce` has two pages. More shows page 2, and a second click inside the settle does not page again. Earlier goes back.
    - `"rows keep their places"`: a craft leaves every row's index unchanged until Back. On the next open the bench recipe leads.
    - `"the plates open the cards"`: a plate tap past the settle shows `[data-how=workshop]` and `[data-how=materials]`, and `Back to the Workshop` restores the list.
    - `"sound"`: `aria-pressed` flips, and a craft with sound on makes one `AudioContext`, as today's case does.
    - Kept and retargeted, with today's subjects:
      - "shows a craft this build cannot name and will not replace it";
      - "stays locked until the Granite, then crafts for real" (the key is disabled, then the drawer crafts);
      - "guides the first craft: New row, How it works, then the payoff";
      - "cancels a running craft for the refund".
    - `"the menu's Workshop row is a second door"`: Ledger key → `.workshop-open` → the drawer opens and the menu closes. Back focuses the Ledger key.
    - `"one drawer at a time"`: opening Buys closes Workshop, and the reverse.
    - `"while the save loads again"`: the rows and bench are disabled and the plates are blank. The drawer stays open.
  - Delete the two `"workshop pages on a short phone (#347)"` cases, whose subject is gone (pages are always 3). Name them in the commit body.
  - `mountain-screen-depths.test.ts`, `mountain-screen-rail.test.ts`: `.workshop-dialog` → `.board-sheet[data-sheet=workshop]` with `is-open`; `.workshop-close` → `.board-sheet[data-sheet=workshop] .board-sheet-back`; `.workshop-card h3` → `.workshop-recipe .board-row-name`. Escape closes the drawer and focus returns to the key.
  - `mountain-screen-order.test.ts`: `workshop-dialog` leaves the cards' order.
  - `style.test.ts`:
    - `.workshop-dialog`, `.workshop-card` and `.workshop-cancel` leave the style.css lists. `.workshop-open` and `.workshop-locked` (the menu's) stay;
    - `BOARD_SELECTORS` gains `.workshop-mats`, `.workshop-mat`, `.workshop-bench`, `.workshop-bar`, `.workshop-timers`, `.workshop-pager` and `.workshop-sound`.
  - `workshop-sheet.test.ts`: `SHORT_WORKSHOP_PAGE` goes, and the default page is 3.
- [ ] **Step 2:** `npx vitest run src/workshop-panel.test.ts src/mountain-screen-depths.test.ts src/mountain-screen-rail.test.ts src/mountain-screen-order.test.ts src/style.test.ts src/workshop-sheet.test.ts tools/browser/fixtures.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the panel, the wiring, the fixtures and the play saves.
  - **`style.css`** removes, after a `grep` shows nothing else uses them:
    - `.workshop-dialog`, `.workshop-sheet`, `.workshop-head*`, the old `.workshop-sound` and `.workshop-materials`;
    - `.workshop-cost`, `.material-bit`, `.mat`/`.mat-*` (keep `.material-line .mat` if `material-line` is still used), `.float-chip`;
    - the old `.workshop-bench*`, `.workshop-timers`, `.workshop-bar`, `.workshop-cancel*`, `.workshop-close`, `.workshop-earlier`, `.workshop-more`, `.workshop-craft*`, `.workshop-hammer`, `.workshop-recipes`, `.workshop-card*`, and the reduced-motion block at 1820–1822.

    It keeps `.workshop-menu`, `.workshop-open` and `.workshop-locked`.

  - **Ceilings:** remove the two entries.
  - **`npx knip`:** remove what it names as unused, such as `setPayoff`, `SHEET_DEAR` and `createInfoButton` (if only the old panel used them), with their tests.
- [ ] **Step 4: The browser checks, in this task.**
  - **`drawers.mjs`:**
    - `DRAWER_SAVES` gains `{ name: "workshop", save: () => workshopSave(Date.now(), true) }` and `{ name: "workshop, free", save: () => workshopSave(Date.now(), false) }`;
    - `DRAWERS` gains `{ name: "workshop", when: ({ name }) => !WORKSHOP_LOCKED.has(name), mayScroll: () => false, mustScroll: () => false }`, with `WORKSHOP_LOCKED = new Set(["fresh", "early", "idle", "heir"])`. These are the DRAWER_SAVES where `workshopUnlocked` is false; it was checked on the fixtures, and a comment says so;
    - the targets filter's regex gains `workshop-mat`;
    - `ROW_LEGENDS` gains `.workshop-mat-count`, `.workshop-mat-word` and `.workshop-timers`;
    - the B6 comment on `DRAWERS` now speaks of Engineers only.
  - **`measure.mjs` `drawerFacts`:** a row's `id` also reads `row.dataset.recipe` and `"bench"` for `[data-bench]`.
  - **`engineers-workshop.mjs`:** section 14 is replaced by `keys and drawers ${JSON.stringify(viewport)} workshop states`, a flow on held clocks with no taps. Each check is labelled with `${size} workshop …`:
    - **busy** (`workshopSave(now, true)`): the bench row is named `Sturdy props`, its gain matches `/^\d+:\d\d$/`, its info starts `Cancel · `, and the bar's `aria-valuenow` is above 0. The sturdy-props row reads `On the bench` with an amber lamp, and the others read `Bench busy`. The timers line starts `Axle grease · `. Reinforce's badge matches `/^Lv \d+\/\d+$/`. Shot `workshop-busy-${size}`.
    - **free** (`workshopSave(now, false)`): the bench is `The bench is free` with a green lamp. Axle grease is `is-ready` with `Craft`. The blasting charge is `is-short`, its need reading `Need 2 more clay`. More to make shows, and page 2 holds the sketch. The kick is the teach intro. Shot `workshop-free-${size}`.
    - **first craft:** the blasting charge row leads, with `teach-new` and flag `New`.
    - **payoff:** the blasting charge's flag ends `/s now` or reads `Your crew feels it now`.
    - **unknown:** the bench is `Something is on the bench` with no `Cancel ·` info, and every recipe reads `Bench busy`.
    - **plates:** on `mid`, clay and iron plates, unpacked, with words; on `heart`, four packed plates with no word, inside the drawer, with no page scroll.

    Section 15 (the menu's locked silhouette) stays as it is.

  - **`controls.mjs`:** add one wiring check for the new control family (arm, then confirm) inside `keys and drawers ${vp} taps`, on `workshopSave(now, true)` with `tapClock: "held"`:
    - step past the settle and press `.workshop-bench`, then wait for `.board-row-why` to read `Tap again to cancel`;
    - press again at once, and the stored `workshop.bench` is still there;
    - `stepTapClock(PAST_SETTLE_MS)` and press, then wait for the stored `workshop.bench` to be undefined.

    Its label: `${label} workshop: past the settle a tap on the busy bench asks "Tap again to cancel", a second tap at once cancels nothing, and one past the settle cancels the craft`. No other Workshop tap is checked in Chrome. The craft row's Done, the blink and the pager settle are unit tests (H3a).

  - **`plate-and-sheets.mjs:464–467`:** `openSheet(page, "workshop")`, the shot `workshop-mix-${size}`, then `closeSheet(page, "workshop")`.
  - **`ui-audit.mjs`:**
    - `openWorkshop` presses `KEY("workshop")` and uses `openDrawer("workshop")`;
    - `showRecipe` reads `${OPEN_SHEET("workshop")} .board-sheet-list` and taps `.workshop-more:not([hidden])`;
    - the cancel capture presses `.workshop-bench`;
    - the selectors at :461, :474, :532 and :554 become `.workshop-recipe`, and `.workshop-timers` / `.workshop-bar`.
  - **Run:**
    - `VISUAL_ONLY='^keys and drawers \[424,924\] (mid|workshop|workshop, free|machine|crew|workshop states|taps)$' npm run visual`;
    - then `VISUAL_ONLY='^keys and drawers' npm run visual` at every size;
    - then `VISUAL_ONLY='^section (15|22|24)' npm run visual`. Section 22 is plate-and-sheets' mix shots, 15 is the menu's silhouette, and 24 is the no-scroll guards, which open Workshop by its key.
- [ ] **Step 5: Play** at 424×924, one run each, looking at the phone shots and `log.txt` (no page error, and the save line is `data-kind` local):
  - `npm run play -- --save fresh` (the Workshop key is locked: `With the clay`, and a tap does nothing);
  - `npm run play -- --save mid tap:.board-key[data-key=workshop] wait:.board-sheet[data-sheet=workshop].is-open wait:500 tap:.workshop-mat` (two plates, then the "i" cards);
  - `npm run play -- --save workshop-free tap:.board-key[data-key=workshop] wait:.board-sheet[data-sheet=workshop].is-open wait:500 tap:.workshop-recipe[data-recipe=blasting-charge] wait:500 tap:.workshop-more` (the red blink frame, then page 2 and the sketch);
  - `npm run play -- --save workshop-free tap:.board-key[data-key=workshop] wait:.board-sheet[data-sheet=workshop].is-open wait:500 tap:.workshop-recipe[data-recipe=axle-grease] wait:2000` (Done, then `On the bench`);
  - `npm run play -- --save workshop tap:.board-key[data-key=workshop] wait:.board-sheet[data-sheet=workshop].is-open wait:500 tap:.workshop-bench wait:500 tap:.workshop-bench` (`Tap again to cancel`, then a free bench);
  - `npm run play -- --save workshop tap:.board-key[data-key=workshop] wait:.board-sheet[data-sheet=workshop].is-open wait:500 tap:.workshop-sound` (`Sound`, pressed);
  - `npm run play -- --save first-craft tap:.board-key[data-key=workshop] wait:.board-sheet[data-sheet=workshop].is-open` (the New row and the intro kick);
  - `npm run play -- --save payoff tap:.board-key[data-key=workshop] wait:.board-sheet[data-sheet=workshop].is-open`;
  - `npm run play -- --save bench-unknown tap:.board-key[data-key=workshop] wait:.board-sheet[data-sheet=workshop].is-open`;
  - `npm run play -- --save crystal tap:.board-key[data-key=workshop] wait:.board-sheet[data-sheet=workshop].is-open` (three packed plates);
  - `npm run play -- --save heart tap:.board-key[data-key=workshop] wait:.board-sheet[data-sheet=workshop].is-open` (four packed plates);
  - `npm run play -- --save mid label:Ledger tap:.workshop-open wait:.board-sheet[data-sheet=workshop].is-open` (the menu door).
- [ ] **Step 6:** `npm run gate -- fast` and `npx knip`. Expected: PASS. `npm run functions` shows no `workshop-panel` entry.
- [ ] **Step 7: Commit** `The Workshop key opens a board drawer: plates, the bench with its cancel confirm, recipes in pages of three, and the sound key (#374)`. In the body, list the deleted tests and the removed ceiling entries. Push.

### Task 5: Docs and proof

**Files:** `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/ui-audit.md` (and its shots under `docs/ui-audit/`), `docs/design-intent.md` (only if a line still describes the old sheet; `grep -n -i "workshop sheet\|bench row" docs/design-intent.md`).

- [ ] **DESIGN.md:**
  - Line 106: "Workshop and Engineers open today's sheets until B6" becomes: Workshop opens its drawer (#374), and Engineers opens today's sheet until B6b (#455).
  - Line 114: the Workshop sheet's 8px note goes to the drawer.
  - Line 461: "a short craft that shakes" becomes "a short craft blinks its lamp red" (#374).
  - Line 501: the menu's dark row stays, and the key is the main door.
  - Line 573 is rewritten for the drawer: plates, the bench row with its clock, bar and cancel confirm on the row, the timers line, `Recipes` rows three a page with no icon, and the sound key. Tap feedback: the Done hold and the red blink, with no bounce, float or hammer animation. The hammer sound stays behind its key.
- [ ] **ARCHITECTURE.md:**
  - Line 126: `workshop-panel` is a board drawer, with `workshop-rows` (views) and `workshop-parts` (plates, bench, pager, sound).
  - Lines 371–395: "Today's Workshop … sheets" → only Engineers.
  - Lines 648–650: the drawer, its two doors, `BoardSheet.page()`, and the order frozen through the model's `layout`.
  - In the visual-check notes: Workshop is a `DRAWERS` row, and its arm-then-confirm wiring is one check in `controls.mjs`.
- [ ] **ui-audit.md:**
  - Rows 31–37 are rewritten for the drawer: bench idle, crafting, cancel confirm on the bench row, reinforce, axle grease on page 2, need more (`Need 4 more iron` on a `.workshop-recipe.is-short` row), and craft done (unchanged, B7).
  - Line 12: "the Workshop page" fits with no scroll.
  - Lines 86 and 90: drop `.workshop-more` and `.workshop-close`, and re-measure the first `Craft` centre.
  - Refresh the shots with `npm run audit:ui`.
- [ ] Run `npm run gate -- full` in the background, once. Read `.gate/logs/<step>.log` for any FAIL and fix it, then run the full gate again only for that.
- [ ] **Commit** `The docs describe the Workshop drawer (#374)` and push. Then `npm run gate -- signoff`, then the ship-sitting skill. The PR body lists the new copy and the Rulings below.

## Rulings

Given by the controller:

- **Nothing bouncy.** The hammer tap animation (`.is-hammer`) and the material float chips (`.workshop-floats`) go (spec line 16). The hammer **sound** stays behind the sound key, and plays on a craft that lands and when sound is turned on.
- **An unaffordable craft blinks red** (spec line 115) instead of shaking.
- **The menu's Workshop row** stays as a second door into the new drawer until B7. Its locked silhouette stays in the menu.
- **Recipe rows have no icon** (mockup; spec line 109).
- **The cancel confirm is on the same plate.** The second tap counts only after the settle (`BoardSheet.page()` on arming), and it disarms after 4s. The copy is unchanged.
- **`Need N more <material>` is kept** (C13 by analogy).
- **The "i" sits in the head, and the sound toggle is a head key.**
- **The kick is the mockup's,** `One bench. Crafts finish while you are away`, and it is new copy. During the first visit the kick is today's teach intro, as Upgrades does.
- **A locked Workshop is B5's:** the key is disabled and reads `With the clay`.
- **The crystal and heartstone art** are already on the branch (`cefce81`), so the plates task uses all four icons and no art step is left.

Added by this plan:

- **The bench is a 76px board row, and it is also the cancel plate.**
  - **Busy:** the name is the recipe, the info is the refund (`Cancel · … back`, then the aside if that does not fit), the gain is the clock, and the lamp is amber.
  - **Armed:** the third line reads `Tap again to cancel`.
  - **Free:** `The bench is free`, a green lamp, and no tap.

  This keeps every state at one height, so a craft or a cancel moves no row, and it is how the list fits (budget below). Today's separate cancel button goes, and so does the old "busy" title as one line. The title stays as the row's `aria-label` and the bar's.

- **The progress bar stays** as a thin bar at the bench row's foot. It moves in whole art px with no transition.
- **Three recipes a page, always.** The fixed board needs no measuring: the list is 538px tall (660 inside the drawer, less a 58 head and a 64 footer).
  - Plates take 58 and the bench 86. The timers line takes 26, the legend about 20, three rows 248 and the pager 58. The total is 496, which leaves the spare plate on short.
  - Four rows plus the pager would be 582, which does not fit.
  - So the #347 measure-then-trip pager and `SHORT_WORKSHOP_PAGE` go.
- **Order through the model.** The page order is the board model's `layout` for "workshop", frozen as the drawer opens. Pages slice it. This is B5's mechanism, used as it is, not a copy of `createUpgradesLayout`.
  - A recipe finished while the drawer is open keeps its place, dark.
  - A recipe found while it is open shows at the next open.
  - The bench recipe leads only on the next open.
- **The pager plates keep their columns.** The one with nowhere to go hides, and the other stays put.
- **A tap on a waiting (`Bench busy`) or `On the bench` row blinks red,** like a running boost in Upgrades: `can` is false. A tap on a free or unknown bench does nothing.
- **What a recipe row shows:**
  - the tag is the stones (`500K`), and it is absent for a materials-only craft;
  - the third line is the materials (`4 iron · 10 clay`). When short, it gives way to `Need …`;
  - the gain column is the craft time (`20 min`);
  - the badge is the level (`Lv 0/2`).

  All of these words exist today. Only their places are new.

- **The New and payoff lines are row flags,** `New` and `+N/s now`, with `teach-new` on the New row, as Buys and Upgrades flag theirs.
- **The unfound sketch** is a `div` row named `Sketch` (new copy), with today's hint as its info.
- **Plates.**
  - With two plates (iron and clay), each shows its icon, count and word, as in the mockup.
  - With three or four, the word goes (it stays in the `aria-label`), and the count is 17px, to fit 89px plates.
  - A plate tap opens the "i" cards.
- **The "i" shows both cards, Workshop then Materials, under one `Back to the Workshop`,** as Buys shows two. A plate opens the same cards, so the shell needs no per-system entry.
- **The "i" art:** `relics/hammer` is `relic-hammer.png` at 48, a new `px`. `ore-lump` is `res-clay.png`. No new art is made.
- **No how-card repricing.** The Workshop and Materials cards name no stone price, so `createHowPricer` stays in `upgrades-panel.ts`. Moving it is B6b's, if Engineers needs it.
- **The timers line stays in the drawer,** under the bench. The Running now note keeps listing every timer too (C5).
- **Head keys share one class,** `board-sheet-key`, so the sound key and Buys' amount key lay out by one rule.
- **Drawers close one another explicitly in `screen-keys.ts`,** as `openBuys` already closes Upgrades. The board model's stack already allows only one.
- **A save that becomes locked closes an open Workshop drawer** (program close).
- **Focus after Back** goes to the door it opened from, or to the Ledger key when the Workshop key is disabled during a re-load. This replaces `workshopClosed` and `doorKey`.
- **Browser checks follow H3a.** The Workshop is one `DRAWERS` row plus one states flow, which replaces section 14 and its dead 390 branch. Arm-then-confirm is the one new control family in `controls.mjs`. The craft Done, the short blink, the pager's settle and the 4s disarm are unit tests.
- **The unknown bench is seen in play** through a `KeptBench` fixture (`unknownBenchSave`), the shape a newer build writes.

## Risks

- **The 538px budget.** The drawer's own fit check proves it on every save at every size. If a long timers line wraps, it is fitted to one line with an ellipsis (`board-row-why` rules), never two.
- **Packed plates at 89px:** the count `>999T` at 17px must fit. The `heart` play run and the drawer's "inside it and apart" checks prove it, and the count ellipsizes.
- **The refund line** (`Cancel · 250K stones, 10 clay, and 4 iron back`) at 13px may not fit 250px. Its fit falls back to the aside, and the confirm line still shows. The row check catches a spill.
- **Test churn** in `workshop-panel.test.ts` (531 lines) and three screen suites is the largest cost of Task 4.
- **Size.** About 6–7 agent hours: Task 4 is about 3, and the others are about 1 each. If Task 4 runs long, the ui-audit retarget (not in the gate) can move to its own small follow-up, named in the PR. No other part may.
