# Control Board B6b: the Engineers drawer (#455) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Engineers key opens a riveted board drawer, as Buys, Upgrades, Workshop and the Ledger do. It holds today's tend, explore, recall and promote, and the homecoming inside the drawer (the walk home, the "Brought home" keepsakes, and the recall's cheer). The layout is the one Flemming approved on 11 Nov:

- one 76px row per engineer, with an amber lamp when it is the New one;
- a tap opens that engineer's page inside the drawer (Tend posts, Explore tunnels, Recall), with a way back;
- the Promote row ends the list;
- the promote and recall confirms are a drawer page with two plates.

**Base:** B7b (#464, the board cards) merged into `main`. This plan reads `board-drawer.ts`, `board-row.ts`, `ledger-*`, `drawers.mjs` and `controls.mjs` as they stand at the B7b docs commit (`fb9723b`). It also reads B7b's review fixes, which were still uncommitted when this was written: `cardsFrom` puts the Engineers sheet first, and `style.test.ts` pins that order. Before Task 1, re-read `src/screen-panels.ts#cardsFrom`, the "board cards" block of `src/board.css` and `src/style.test.ts`'s "stacks the cards in the root's order" case on the merged `main`. Task 4 undoes all three (B7b overlaps, below).

**Out of scope:**

- the Workshop drawer (B6a, #374, merged);
- the "Welcome home" card (B7b, #464). Its words and its `engineers-homecoming` audit shot stay as they are;
- the menu (B7a, merged) and the relic cards (B7c, #465);
- the PC desk (B8, #376);
- the expedition chips in the Running now note. They keep today's helper art and words, and only their builder moves.

**Architecture:**

- **Pure rules with unit tests.** A new module, `src/engineer-rows.ts`, follows the `*-rows.ts` pattern (`workshop-rows.ts`, `ledger-rows.ts`). It turns the mountain into `RowView`s, the kick line, the page the drawer shows, and which row is the New one. It imports no art and no DOM. The rules it reads stay where they are:
  - `engineers.ts`: `canPromote`, `promoteCost`, `nextEngineerName`, `MAX_ENGINEERS`;
  - `expeditions.ts`: `TUNNELS`, `KEEPSAKES`;
  - `rates.ts`: `tendingGain`, `moveGain`, `firstTend`, `promotePayoff`;
  - `teach.ts`: `showsDot`;
  - `screen-words.ts`: every word.

  Today's 51-complexity `render` and 23-complexity `paintEngineer` become small pure functions here. That is how the four ceilings go (#422).

- **Shared drawer pieces, extended** (each named in Task 1):
  - `board-drawer.ts` gains `BoardSheet.cheer(text)`, a line that stands in the kick for a while. It extends the kick's thanks (`paintKick`), and replaces the Engineers toast.
  - A new module, `src/board-page.ts`, takes the Ledger's page-that-asks (`pageFrame` and `ledgerPlate` in `ledger-parts.ts`) so that the Ledger and Engineers share one: a titled page with one line and two plates. It is new because the page is a drawer part that two drawers now share. `board-drawer.ts` stays the shell (571 lines), and `ledger-parts.ts` keeps only the Ledger's own parts.
  - `board-row.ts` gains `setIconArt(part)`, which puts the walk-home part into a row's icon cell.
  - `board-how-art.ts` learns the Engineers, Expeditions and Tending "i" cards. It takes `createHowPricer` from `upgrades-panel.ts`, because Engineers needs the same repricing (B6a's plan said this move is B6b's).
- **Engineers-only DOM parts** go in a new module, `src/engineer-parts.ts`: the walk home, the list rows, the engineer page, the tunnels page, the Brought home page, and the expedition chips. It is new because these parts belong to Engineers alone.
- **The panel.** `src/engineers-panel.ts` is rewritten as a thin builder on `createBoardSheet`, `rowsOnBoard` and `showPage`, with every function under 150 lines and a cognitive complexity of 15. Its presses go through the model (`rowsOnBoard.press`, `pressOnBoard`), so the settle, the Done hold and the red blink are B5's. Every page change is `sheet.showPage`, so the second tap of a double tap lands on nothing.
- **Wiring.**
  - The rail key opens the drawer itself: `wireKeys`' record gains `engineers`, and the `id === "engineers"` return goes (`screen-keys.ts`).
  - The drawer joins `drawers` in `mountain-screen.ts`. From there the sheet clip, the scrim (`screen-layout.ts`) and `overlays.drawers` take it.
  - It leaves `cardsFrom` (`screen-panels.ts`).

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom per file), and the puppeteer-core scripts (`scripts/visual-check.mjs` with `scripts/visual/*.mjs`, `scripts/play.mjs`, `scripts/ui-audit.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-07-control-board-design.md`. This plan uses:

- the drawer shell and row anatomy (lines 106–118);
- the Engineers line (line 122): "locked until the first borer … After that it holds today's tend, explore, recall, promote and homecoming, as rows";
- C1 (a full Engineers crew may scroll inside the drawer), C5 (the Engineers key's sub-line shows expeditions), C13 (today's copy), "Rules the board keeps", "Checks", and the B6 row of the sliver table (done when every Engineers state is seen in play at 924).

The mockup's Engineers sheet (`SHEETS.engineers`, `mockups/control-board/index.html` 1394 and 1425–1437) draws only info rows. It has no tend, explore, recall, promote, rank or homecoming UI, so the approved layout on #455 and the Rulings below stand in for it.

Issue #455 is binding.

## Art

Nearly every picture the drawer needs is already in `src/assets/board/`:

| Asset (under `src/assets/board/`)                                       | Art size              | Shown at             | Used by                                                                                                                            |
| ----------------------------------------------------------------------- | --------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `mach-worker.png`                                                       | 32×32                 | 64                   | An engineer's row at home, the camp post row, and the worker steps of the "i" cards (already mapped)                               |
| `mach-cart.png`, `mach-drill.png`, `mach-borer.png`, `mach-machine.png` | 32×32                 | 64                   | The cart, drill, borer and Great Machine post rows. The drill and machine are already mapped for the "i"                           |
| `miner-18f.png`                                                         | 216×21 (12×21 frames) | 24×42 in the 64 cell | The walk home: frames 4–7 (walk east, `haulage.ts`) in hard steps, in an inset tunnel mouth, on an engineer's row while she is out |
| `inset.png`                                                             | skin                  | 2×                   | The tunnel mouth behind the walker                                                                                                 |
| `relic-crown.png`                                                       | 24×24                 | 48                   | The Engineers "i" card's crew-size step (already mapped)                                                                           |
| `lamp.png`                                                              | 80×20                 | 40×40 frames         | Every row's lamp                                                                                                                   |

The tunnel rows, the Promote row and the Brought home row have no icon. The spec lets Engineers rows go without (line 109), and the mockup draws none.

**Art needed (a stop, below).** The Engineers and Expeditions "i" cards use three How it works pictures that have no board version: `worn-map` (two steps), `boot-tile` (one step) and `gold-nugget` (one step). `board-how-art.test.ts` requires every step to be mapped, and the old 32px art is not board style (B5's ruling, `docs/ART.md` line 27). The recommendation is three 16×16 PixelLab board icons, shown at 32: `res-map.png`, `res-boot.png` and `res-nugget.png`. They are made in a separate pixellab session before Task 1's Step 3. No placeholder art is ever committed.

## Global Constraints

- **UI only.** No rule, number, price, save field, log code or lab change. Every action goes through today's moves:
  - `{ kind: "station", index, post }`, where a post chosen while out still calls the party back first;
  - `{ kind: "send", index, tunnel }`;
  - `{ kind: "recall", index }`;
  - `{ kind: "promote", price }`, with the price painted on the row when he tapped it (#367);
  - `{ kind: "markSeen", id: "engineers" }` on open.

  Nothing about saving changes (`.claude/rules/observable-saves.md`).

- **Shared modules** (CLAUDE rule "name the shared module"):
  - settle, hold and blink: `board-interaction.ts`, through `board-host.ts`;
  - presses: `card-tap.ts` (`pressOnBoard`, `forgetAll`, and `rowsOnBoard.tap`);
  - rows and the icon cell: `board-row.ts`;
  - shell, "i", pages, kick, cheer and scrim: `board-drawer.ts`;
  - the page that asks, and the drawer plate: `board-page.ts` (new in Task 1, moved from `ledger-parts.ts`);
  - "i" art and repricing: `board-how-art.ts`;
  - legends and DOM helpers: `board-dom.ts` (`el`, `write`, `hide`, `mark`, `setAttr`, `fitFirst`);
  - skins: `board-skin.ts`;
  - plate buttons: `board-save.ts#plateButton`;
  - the effect chip: `effect-row.ts` (`createEffectChip`, `writeChip`);
  - the words: `screen-words.ts`;
  - the rules: `engineers.ts`, `expeditions.ts`, `rates.ts` and `teach.ts`.

  Nothing in that list is copied into a second home.

- **Motion.** Hard steps only, as B5.
  - A tap he cannot make blinks the lamp red (four 140ms frames): an unaffordable Promote, or a deep dark an Apprentice cannot lead. It does not blink under reduced motion.
  - The walker steps one art px at a time and changes frame in steps, with no tween. Under reduced motion it stands still on frame 4.
  - There is no glow, toast, float or bounce. Today's `is-lit` glow, the toast and the pressed flash (`arm`, `PRESS_MS`) go. The Done hold, the cheer in the kick, and `pressLook` (through the board row and plate) take their place.
- **Sizes at 424×924.**
  - The drawer sits at 178..864 × 8..416. The list is 380 wide and 538 tall (B6a's measure).
  - Rows are 76 tall and 10 apart. Plates are 54 tall, and a pair sits in two columns 8px apart.
  - Targets are at least 48×48 with 8px gaps.
  - Text is at least 13px, and the keepsake stories are 16px. Contrast is at least 4.5:1. Numbers (gains, prices) are in `.board-num`.
  - Every page and the list fit without scrolling, except the one C1 case (Budget).
  - New CSS goes in `src/board.css`, using `calc(var(--art) * N)` or tokens (`npm run tokens`).
- **Copy.** Every player-facing word is today's. None is new (Copy, at the end). Today's words stay:
  - `ENGINEER_SHEET_TITLE` ("Your engineers"), `ENGINEER_SHEET_SUB`, `engineersIntro`, `tendingIntro`, `PROMOTION_INTRO`;
  - `rankLabel`, `rankHint`, `dutyLine`, `dutySentence`, `stonesPerSecond`, `NONE_BUILT`;
  - `TEND_MACHINE`, `SEND_EXPLORING`, `callBackLabel`, `KEEP_EXPLORING`, `CALL_BACK`;
  - `tendTitle`, `tendBenefit`, `stationCheer`;
  - `exploreTitle`, `exploreBenefit`, `exploreAside`, `tunnelLock`, `exploreCheer`, `firstTripWords`;
  - `tripDetail`, `expeditionChip`, `recallConfirm`, `homeCheer`;
  - `PROMOTE_TITLE`, `PROMOTE_WHY`, `PROMOTE_BUTTON`, `promoteNeeds`, `PROMOTE_NEEDS_WORKER`, `PROMOTE_CREW_FULL`, `promotionPayoff`, `promoteOffer` (now the row's label), `promoteConfirm`, `promoteCheer`;
  - `BROUGHT_HOME`, `broughtHomeNames`, `keepsakeWords`;
  - "Not yet" and "Step up". They move from the panel's literals into `screen-words.ts` as `PROMOTE_NOT_YET` and `PROMOTE_STEP_UP`;
  - "Back to your engineers", today's how-card Back. It moves into `screen-words.ts` as `ENGINEERS_BACK` and is also the pages' way back;
  - `HOW_IT_WORKS.engineers`, `.expeditions` and `.tending`, repriced as today.

  The panel's own "Back to the mountain" goes with today's sheet; the shell's Back says "Back to the board". B7b's `BACK_TO_THE_MOUNTAIN` is not used here.

- **The stop (PixelLab).** Before Task 1 is dispatched, the controller asks Flemming one question with three options (pixellab skill):
  1. **three new 16×16 board icons, a map, a boot and a gold nugget**, for the Engineers and Expeditions "i" cards (recommended; three small PixelLab pieces);
  2. existing board icons instead: the compass (`icon-engineers.png`) for both map steps, the pick (`res-pick.png`) for the "lost tools, keepsakes" find step, and the worker (`mach-worker.png`) for "fix trouble on their own";
  3. no new art: the drawer's "i" shows only the Tending card, whose art is all mapped, until the icons exist.

  The build carries on with option 1 while he answers. Only Task 1's art map and its test change between the options.

- **Ceilings (#422).** In Task 4, remove these entries from `scripts/function-ceilings.json`: `src/engineers-panel.ts#createEngineersPanel`, `#createEngineersPanel>buildRow` and `#createEngineersPanel>render`. Remove these from `scripts/complexity-ceilings.json`: `src/engineers-panel.ts#createEngineersPanel>render` and `src/engineers-panel.ts#paintEngineer`. No entry is added. Every new or split function is under 150 lines and a complexity of 15.
- **Coverage floors** (`vite.config.ts`):
  - `src/engineers-panel.ts` keeps 97/91/100/97;
  - `src/engineer-rows.ts` gets 100/100/100/100, and `src/engineer-parts.ts` gets 95/90/95/95;
  - `src/board-page.ts` gets 100/95/100/100. Its lines are moved from `src/ledger-parts.ts`, whose floor (95/90/95/95) holds.

  No floor is lowered.

- **Verification ladder** (`.claude/rules/dad-friendly-work.md`). Each task climbs in this order and stops as soon as a step proves the change:
  1. the touched test files (`npx vitest run <file>`);
  2. `npm run gate -- fast`;
  3. the named `VISUAL_ONLY` sections, and `npm run play` on the named save;
  4. `npm run gate -- full`, once, in Task 5.

  Never run two browser scripts at once. `npx knip` passes at every commit.

- **Commits** are a plain sentence ending ` (#455)`, with the trailers below. Push after each task: `git push origin claude/project-thread-bv4l8j`.

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011RgeWspHUjx1QMk2374KGN
  ```

## Review Focus

1. **A sleepy double tap.**
   - Key, then the engineer row under the finger: no page opens.
   - An engineer row, then the post row under the finger on her page: no station is sent.
   - A tunnel, recall or promote page, then the plate under the finger: nothing is sent, called back or paid.
   - A post that lands holds its row (Done) for 1.9s. A second tap in that time does nothing.
   - A Step up that lands holds the new engineer's row for 1.9s on the list.
2. **The page is always true.** A page whose subject changed under it gives way:
   - an engineer gone (Start over) → the list;
   - a recall page whose engineer came home → her page;
   - a tunnels page whose engineer left → her page;
   - a promote page that can no longer promote → the list, with no cheer;
   - a Brought home page with no keepsakes → the list;
   - no engineers at all → the drawer closes.

   These are one pure function (`settlePage`) with unit tests.

3. **A save that loads again under the open drawer.** Rows go dark and disabled, and the page's plates disable. The page stays. If the save turns out to have no engineers, the drawer closes.
4. **The doors.**
   - The Engineers key is the one door. Back, the scrim and Escape close the drawer from the list or from any page.
   - Opening another drawer closes Engineers, and Engineers closes them.
   - A card that opens by itself (a homecoming's Welcome home) closes the drawer, as it closes every drawer.
   - Back gives focus to the key, or to the Ledger key while the Engineers key is disabled during a re-load.
5. **Numbers and discoveries.** Posts and the Promote row show real numbers (`+78 stones/sec`, the price). Trips and finds stay words: no digit in a trip line, a recall line or a story.

---

### Task 1: The drawer's shared pieces

**Extends:**

- `src/board-drawer.ts`: `cheer`;
- `src/board-row.ts`: `setIconArt`;
- `src/board-how-art.ts`: the art map, the systems, and `createHowPricer`;
- `src/upgrades-panel.ts`: only to import `createHowPricer`;
- `src/ledger-parts.ts`: only to use `board-page.ts`;
- `src/board.css`.

**New:** `src/board-page.ts`, holding the drawer plate and the page that asks, moved out of `ledger-parts.ts`.

**Files:**

- Create: `src/board-page.ts`, `src/board-page.test.ts`. If option 1 of the stop, also `src/assets/board/res-map.png`, `res-boot.png` and `res-nugget.png`, from the pixellab session.
- Modify: `src/board-drawer.ts`, `src/board-drawer.test.ts`, `src/board-row.ts`, `src/board-row.test.ts`, `src/board-how-art.ts`, `src/board-how-art.test.ts`, `src/upgrades-panel.ts`, `src/ledger-parts.ts`, `src/ledger-parts.test.ts`, `src/board.css`, `vite.config.ts` (the `board-page.ts` floor).

**Produces:**

- `BoardSheet.cheer(text: string): void`.
  - The kick line shows `text` with `is-done` for `CHEER_MS = 2_200` (today's `TOAST_MS`), then the resting kick again.
  - A second cheer replaces the first and restarts the time. A fix's thanks (`TROUBLE_FIXED`) still wins while it lasts.
  - `close` drops the cheer. `kick(text)` changes only the resting line, so a cheer under way stays.
  - It is one timer, cleared at close and on `signal` abort. `paintKick` gains the cheer as its middle case.
- `board-page.ts`:
  - `drawerPlate(board, trackers, control: ControlRef, label, act: PlateAct): HTMLButtonElement`. This is `ledgerPlate`, moved, with its layer taken from `control`. It adds the class `${control.layer}-${control.id}`, as `ledgerPlate` does, so every Ledger hook stays.
  - `createAskPage({ board, control: (id) => ControlRef, className, title, line, answers: readonly [Answer, Answer] }): { root; paint(ready: boolean): void; write(title: string, line: string): void; forget(): void }`, where `Answer = { label: string; id: string; act: PlateAct; holdsReady?: boolean }`.
    - It is `pageFrame` plus the two-plate `.ledger-page-answers` row, moved.
    - The first answer takes the focus.
    - `paint(false)` disables each answer with `holdsReady`.
  - `PlateAct` is exported from here.
  - The root's classes are `board-page ${className}`, with `board-page-title`, `board-page-line` and `board-page-answers` inside. The Ledger passes `ledger-page ledger-start-over-page` and adds `ledger-page-title` and `ledger-page-line` as hook classes, so its checks keep their selectors, as B6a kept `.workshop-bar`.
  - The CSS moves from `.ledger-page*` to `.board-page*`. The field log page keeps `.ledger-page`'s look through `board-page`.
- `ledger-parts.ts`: `createStartOverPage` becomes a call to `createAskPage`, and `createFieldLogPage` uses its frame. Its exports and behaviour are unchanged.
- `BoardRow.setIconArt(part: HTMLElement | undefined): void`. It puts `part` in the icon cell in the img's place, and `undefined` puts the img back. It is shown only on rows built with `icon: true`.
- `board-how-art.ts`:
  - `BoardHowSystem` gains `"engineers" | "expeditions" | "tending"`;
  - `BOARD_HOW_ART` gains `"worn-map"`, `"boot-tile"` and `"gold-nugget"`, each `px: 32`, mapped by the stop's answer;
  - `createHowPricer(how: HTMLElement, systems: readonly BoardHowSystem[]): (current: Mountain) => void`, moved from `upgrades-panel.ts` with its `systems` made a parameter. Upgrades passes `["upgrades", "boosts"]`.

- [ ] **Step 1: Write the failing tests.**
  - `board-drawer.test.ts`:
    - `"cheer stands in the kick, then gives way"`: open a sheet, `cheer("Ada heads to the drills!")`. The kick reads it with `is-done`, and at 2,200ms it reads the resting kick.
    - `"a second cheer replaces the first, and close drops it"`.
    - `"kick() under a cheer changes only the resting line"`.
  - `board-page.test.ts`, with happy-dom and `createBoardHost` on a fake clock, as `board-drawer.test.ts` builds it:
    - `"an ask page names itself and puts its first answer first"`: the title, the line, `role=group` with `aria-labelledby` and `aria-describedby`, and two plates in order.
    - `"an answer acts only past the settle"`: a press 100ms after `page()` does nothing, and one at 450ms runs `act` with the plate and `by`.
    - `"paint(false) disables the answers that wait for the save"`.
    - `"write() changes the title and line"`.
    - `"drawerPlate adds its layer-id class"`.
  - `ledger-parts.test.ts`: the Start over page cases pass unchanged.
  - `board-row.test.ts`: `"setIconArt puts a part in the icon cell, and undefined brings the icon back"`.
  - `board-how-art.test.ts`:
    - the `it.each` list gains `engineers`, `expeditions` and `tending`;
    - `boardHowCard("engineers", …)` renders four steps at `64, 48, 32, 32`;
    - `createHowPricer(how, ["engineers"])` rewrites the engineers card's promote price when `stretch` changes, and leaves a card not listed alone.
- [ ] **Step 2:** `npx vitest run src/board-drawer.test.ts src/board-page.test.ts src/ledger-parts.test.ts src/board-row.test.ts src/board-how-art.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `upgrades-panel.ts` imports `createHowPricer`. `ledger-parts.ts` builds on `board-page.ts`.
- [ ] **Step 4:** Run the five test files and `src/upgrades-panel.test.ts` if it exists (else the Upgrades cases in `src/mountain-screen-crew.test.ts`), then `npm run gate -- fast`. Then `VISUAL_ONLY='^keys and drawers \[424,924\] (mid|ledger states)$' npm run visual`. The Ledger's Start over page is unchanged.
- [ ] **Step 5: Commit** `The drawer's kick can cheer, one page that asks serves every drawer, a row's icon cell takes a part, and the "i" art knows the Engineers cards (#455)` and push.

### Task 2: The Engineers' rules

**New:** `src/engineer-rows.ts`. It is pure, with no DOM and no art.

**Files:**

- Create: `src/engineer-rows.ts`, `src/engineer-rows.test.ts`.
- Modify: `src/screen-words.ts` and `src/screen-words.test.ts` (the three moved literals), and `vite.config.ts` (the 100/100/100/100 floor).

**Produces:**

- In `screen-words.ts`: `ENGINEERS_BACK = "Back to your engineers"`, `PROMOTE_NOT_YET = "Not yet"` and `PROMOTE_STEP_UP = "Step up"`.
- In `engineer-rows.ts`:
  - `type EngineerPage`:
    - `{ kind: "list" }`
    - `{ kind: "engineer"; name: EngineerName }`
    - `{ kind: "tunnels"; name: EngineerName }`
    - `{ kind: "recall"; name: EngineerName }`
    - `{ kind: "promote"; price: number }`
    - `{ kind: "brought" }`

    The engineer is named by name, never by index, so a page follows its engineer.

  - `settlePage(page, mountain, ready): EngineerPage`, by the rules in Review Focus 2. A save that is not ready keeps the page.
  - `machinePost(post): Exclude<TendPost, "camp"> | undefined` and `promoteWhyLine(mountain, nameFree, cost)`, both moved from the panel.
  - `postGain(view: EngineerCtx, index, post): string | undefined`. It is today's `gainText`: `undefined` for camp, `NONE_BUILT` for a tier with none built, else `stonesPerSecond(tendingGain(...))`.
  - `EngineerCtx = { mountain; trouble; now; ready }`.
  - `engineerTeach(ctx): EngineerTeach`, where `EngineerTeach` is one of:
    - `{ kind: "trip"; name }`
    - `{ kind: "tend"; name; index; post }`
    - `{ kind: "promote"; name; post; gain }`
    - `{ kind: "none" }`

    It is today's render chain (engineers-panel.ts 819–872) with the open-card conditions gone:
    - `trip` while `showsDot(m, "engineers")` and the first engineer is not out;
    - else `tend` from `firstTend` while `showsDot(m, "tending")`;
    - else `promote` from `promotePayoff` while `showsDot(m, "promotion")` and `canPromote`.

  - `listKick(teach, mountain): string`: `engineersIntro`, `tendingIntro`, `PROMOTION_INTRO`, else `ENGINEER_SHEET_SUB`.
  - `pageKick(page, ctx): string`:
    - her page: `dutySentence(engineer, gain)` at home, `tripDetail(name, left)` while out;
    - the tunnels page: `exploreAside(name, post)`;
    - otherwise the list kick.
  - `engineerRowView(engineer, index, ctx, teach): RowView & { readonly out: boolean }`:
    - name `engineer.name`, badge `rankLabel(rank)`;
    - info `[dutyLine(engineer, trip), dutyLine(engineer)]`, where the trip is the matching expedition's `{ tunnel, leftMs }`;
    - why `rankHint(engineer) ?? ""`;
    - lamp amber with flag `["New"]` when the teach names her; else green while tending or out, and off at camp;
    - state `running` while out, `owned` while tending, `ready` at camp;
    - no verb or price, `can` true, `pick` false;
    - aria: the name, the rank word, then the duty line;
    - `out` is `post === "tunnel"`.
  - `postRowView(engineer, index, post, ctx, teach): RowView`:
    - name `tendTitle(post, here)`;
    - info `[tendBenefit(post, name, gain), tendBenefit(post, name)]`;
    - gain `gain` when it is stones a second, else `""`;
    - lamp green and state `owned` when `here`; amber with flag `["New"]` when the teach's `tend` names this post; else off and `ready`;
    - `can` true.
  - `tunnelRowView(engineer, tunnel, teach): RowView`:
    - name `exploreTitle(tunnel)`, info `[tunnelLock(rank, tunnel) ?? exploreBenefit(tunnel)]`;
    - locked: lamp off, state `locked`, `can` false;
    - else lamp off and `ready`, or amber with flag `["New"]` when the teach is `trip` and this is `TUNNELS[0]`.
  - `promoteRowView(ctx, teach): RowView & { readonly cost: number }`:
    - name `PROMOTE_TITLE`, verb `PROMOTE_BUTTON`;
    - price `formatCompact(cost)`, dim unless promotable;
    - info `[promotionPayoff(...)]` while the teach is `promote`, else `[promoteWhyLine(...)]`;
    - a full crew has no price and no verb, info `[PROMOTE_CREW_FULL]`, state `locked`;
    - lamp green when promotable, else off; amber with flag `["New"]` under the teach;
    - `can` is `ready && canPromote`;
    - aria: `promoteOffer(cost)`, then the info.
  - `broughtRowView(finds): RowView | undefined`: name `BROUGHT_HOME`, info `[broughtHomeNames(ids)]`, lamp off, state `found`, `can` true; `undefined` with no keepsakes.
  - `broughtStories(finds): readonly string[]`: `${name}. ${story}` for each keepsake, in the order they came home (today's toast, one line each).
  - `herPlates(engineer, teach): { left: PlateView; right: PlateView }`, where `PlateView = { id; label: readonly string[]; newCard: boolean }`. Both are by kind:
    - at home: left is `explore`, with `[SEND_EXPLORING]`, or `[firstTripWords(name, TUNNELS[0].awayMs), SEND_EXPLORING]` with `newCard` under the trip teach;
    - out: left is `recall`, with `[callBackLabel(name)]`;
    - right is always `back`, with `[ENGINEERS_BACK]`.

- [ ] **Step 1: Write the failing tests** (`engineer-rows.test.ts`, pure; `screen-words.test.ts`):
  - one case per row kind and state, from the shapes the screen tests use today:
    - `withAda()` from `mountain-screen-depths.test.ts`;
    - `campPostsSave`'s five engineers;
    - `awayTripSave`'s Ada out;
    - a promotable, a light-pocket, a no-free-worker and a full crew (`MAX_ENGINEERS`).
  - teach: a first visit gives `trip`; after a trip, `tend` naming `firstTend`'s post; then `promote` with the payoff; and `none` once taught.
  - kicks: each page's kick, word for word, with no `?` and no digit in a trip line.
  - `settlePage`: each rule in Review Focus 2, and a page kept while not ready.
  - plates: at home, out, and under the trip teach.
  - `postGain`: camp, none built, and a built tier's `+N stones/sec`.
- [ ] **Step 2:** `npx vitest run src/engineer-rows.test.ts src/screen-words.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** it, each function under 40 lines and a complexity of 15. Dispatch on `kind` through `switch` or a `Record`, so no function nests. Coverage is 100%.
- [ ] **Step 4:** `npx vitest run --coverage src/engineer-rows.test.ts`, then `npm run gate -- fast`. Nothing is seen in the browser yet.
- [ ] **Step 5: Commit** `The Engineers' rows, pages, kicks and teach as pure views (#455)` and push.

### Task 3: The Engineers drawer's parts

**New:** `src/engineer-parts.ts`. It holds the Engineers-only controls, built on `createBoardRow`, `rowsOnBoard`, `createAskPage`, `drawerPlate`, `skin` and `createEffectChip`. It is new because no other drawer has engineer rows, post pages or a walker.

**Files:**

- Create: `src/engineer-parts.ts`, `src/engineer-parts.test.ts` (happy-dom, `createBoardHost` on a fake clock with `reduced: () => false`).
- Modify: `src/board.css`, `vite.config.ts` (the 95/90/95/95 floor).

**Produces:**

- `createWalk(): { root: HTMLElement; paint(on: boolean): void }`.
  - `root` is `span.engineer-walk` with the inset skin, 64×56. It holds `i.engineer-walker`, which is `miner-18f.png` at 2× with `background-size` at 2× and frames 4–7.
  - CSS has two step animations: the frame at `steps(4)` per 0.6s, and the left at `steps(32)` over 3.2s, both `infinite`. Under `prefers-reduced-motion` neither runs, and frame 4 stands.
  - `paint(false)` pauses both (`animation-play-state`), for a drawer that is shut.
- `createEngineerRows({ onBoard, onOpen }): { roots: readonly HTMLElement[]; paint(views: readonly (EngineerRowViewOut | undefined)[]): void }`.
  - It holds `MAX_ENGINEERS` rows of `button.board-row.engineer-row[data-engineer]` with `icon: true`, plus one walk for each.
  - `paint` hides a row with no engineer. It sets `data-engineer`, and while `out` it calls `setIconArt(walk.root)`; else `setIcon(workerUrl)`. It then calls `onBoard.paint(\`engineer:${name}\`, row, view)`and marks`teach-new` from the flag.
  - Each tap is `onBoard.tap` → `onBoard.press(id, …, "act")` → `onOpen(name)` on `act`.
- `createPostsPage({ onBoard, onPost, onPlate }): { root; paint(views, plates: HerPlates | undefined): void }`.
  - `root` is `div.board-page.engineer-page`.
  - It holds five `button.board-row.engineer-post[data-post]` rows with `icon: true`. Their art is `POST_ART: Record<TendPost, string>`, mapping cart → `mach-cart.png`, drill → `mach-drill.png`, borer → `mach-borer.png`, machine → `mach-machine.png` and camp → `mach-worker.png`.
  - Under the rows is a two-column `div.engineer-page-plates`:
    - the left plate is `.engineer-explore`, or `.engineer-recall` while out;
    - the right plate is `.engineer-list-back`.

    Each is `drawerPlate` with ids `explore`, `recall` and `back`. The left plate's words are fitted with `fitFirst` to the options given, and its `aria-label` is the first option.

  - `aria-pressed` on a post row follows `here`.
  - `paint(undefined, undefined)` darkens the rows and disables the plates.
- `createTunnelsPage({ onBoard, onTunnel, onPlate })`. `div.board-page.engineer-tunnels-page` holds three `button.board-row.engineer-tunnel-row[data-tunnel]` with `icon: false`, then the plates `.engineer-tend` (`TEND_MACHINE`) and `.engineer-list-back`.
- `createBroughtPage({ board, onBack })`. `div.board-page.engineer-brought-page` holds `h3.board-page-title` (`BROUGHT_HOME`), up to `KEEPSAKES.length` copies of `p.engineer-brought-story` at `--board-type-16`, and the plate `.engineer-list-back`. Its `paint(stories)` writes them.
- `createExpeditionChips(host: HTMLElement, iconUrl: string): { paint(mountain: Mountain, now: number): void }`. It is today's chip block (engineers-panel.ts 153–157 and 885–899), moved as it is.
- **CSS** (`board.css`), tokens only:
  - `.engineer-walk` and `.engineer-walker`, with their two step keyframes and the reduced-motion rule;
  - `.engineer-page-plates`: two equal columns, gap `var(--art) * 4`;
  - `.engineer-brought-story`: `--board-type-16`, `--board-note-lead`, wrapping.

- [ ] **Step 1: Write the failing tests** (`engineer-parts.test.ts`):
  - rows:
    - five views give five shown rows in order with their `data-engineer`;
    - a sixth slot stays hidden;
    - an out row's icon cell holds `.engineer-walk` and no img;
    - a New row has `teach-new` and flag `New`;
    - a tap past the settle calls `onOpen("Ada")`, and one at 100ms does not.
  - posts page:
    - five rows with their machine art from `src/assets/board/mach-*`, the here row `aria-pressed`, and a gain in `.board-row-gain`;
    - the plates read `Send exploring` and `Back to your engineers`, or `Call her back` while out;
    - under the trip teach the left plate reads `Send Ada exploring · 10 min` (or its fit fallback) with `teach-new`;
    - a post press inside the settle sends nothing.
  - tunnels page: the deep dark row is `is-locked` and a press blinks it red (the lamp passes `-120px`); under reduced motion it does not blink.
  - Brought home page: two stories at 16px, and Back calls `onBack` past the settle.
  - walk: `paint(false)` pauses it. The reduced-motion rule is pinned in `style.test.ts` (Task 4).
  - chips: today's chip case (`"Ada1h 0m"`, the aria words) passes on the moved builder.
- [ ] **Step 2:** `npx vitest run src/engineer-parts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The live screen is unchanged.
- [ ] **Step 4:** `npx vitest run src/engineer-parts.test.ts`, then `npm run gate -- fast`.
- [ ] **Step 5: Commit** `The Engineers drawer's rows with the walk home, the posts and tunnels pages, the Brought home page and the expedition chips (#455)` and push.

### Task 4: The Engineers key opens the drawer

This is the swap. The panel, the wiring, the CSS, every unit test and every browser check that names the old sheet all change in this task, so each screen's checks stay green here (`superpowers.md`).

**Extends:**

- `src/engineers-panel.ts`, rewritten;
- `src/screen-keys.ts`, `src/screen-panels.ts`, `src/mountain-screen.ts`, `src/card-tap.ts`;
- `scripts/visual/drawers.mjs` (`DRAWERS`), `scripts/visual/controls.mjs`, `scripts/visual/measure.mjs`;
- `scripts/play.mjs`, `scripts/ui-audit.mjs`.

**Files:**

- Create: `src/engineers-panel.test.ts`.
- Modify (src): `src/engineers-panel.ts`, `src/screen-keys.ts`, `src/screen-panels.ts`, `src/mountain-screen.ts`, `src/card-tap.ts` (drop `.engineers-dialog` from the scroll-container `closest`), `src/screen-words.ts` (drop what knip names), `src/teach-ui.ts` (drop `createInfoButton`, `markNewCard` and `clearNewCard` if knip names them), `src/style.css`, `src/board.css`, `src/mountain-screen.harness.ts`, `vite.config.ts`.
- Modify (tests): `src/mountain-screen-crew.test.ts` (the `"engineers sheet (#145)"` describe, 3846–4430, moves out), `src/mountain-screen-depths.test.ts` (`"side tunnels (#147)"`, and lines 433–450 and 1257), `src/mountain-screen-rail.test.ts` (158–168, 256–259, 639–656, 732–752), `src/mountain-screen.test.ts` (2105–2129), `src/mountain-screen-order.test.ts`, `src/mountain-screen-promote.test.ts`, `src/engineers-teach.test.ts`, `src/promotion-teach.test.ts`, `src/tending-teach.test.ts`, `src/style.test.ts`, and `tools/browser/fixtures.test.ts` if a fixture is added.
- Modify (ceilings): `scripts/function-ceilings.json`, `scripts/complexity-ceilings.json`.
- Modify (browser): `scripts/visual/drawers.mjs`, `scripts/visual/measure.mjs`, `scripts/visual/controls.mjs`, `scripts/visual/engineers-workshop.mjs`, `scripts/visual/main-screen.mjs`, `scripts/visual/running-and-guards.mjs`, `scripts/ui-audit.mjs`, `scripts/play.mjs`.

**Produces:**

- `createEngineersPanel({ dispatch, getView, now, board, overSave, door, fallbackFocus, chipHost, chipIconUrl, signal })` returns `{ sheet: BoardSheet; render(): void; open(from?: HTMLElement): void }`.
  - `open` does nothing unless the save is ready and has an engineer. It dispatches `markSeen("engineers")`, sets the page to the list, then calls `sheet.open(from)`.
- **The sheet:** `createBoardSheet({ name: "engineers", title: ENGINEER_SHEET_TITLE, infoLabel: "Engineers", how: { systems: ["engineers", "expeditions", "tending"], backLabel: ENGINEERS_BACK }, door, fallbackFocus, onForget, … })`. `createHowPricer(sheet.how, ["engineers", "expeditions", "tending"])` runs each render.
- **The list, in order**, all built once and placed with `sheet.place`:
  1. the five engineer rows;
  2. `button.board-row.engineer-brought[data-engineers=brought]`, shown only with keepsakes;
  3. `button.board-row.engineer-promote[data-engineers=promote]`.
- **Pages,** each through `sheet.showPage(root)`, and the list through `showPage(undefined)`:
  - her page (the posts page);
  - the tunnels page;
  - the recall ask (`createAskPage`): class `engineer-recall-page`, title `callBackLabel(name)`, line `recallConfirm(name)`, answers `KEEP_EXPLORING` (`recall-no`) then `CALL_BACK` (`recall-yes`, `holdsReady`);
  - the promote ask: class `engineer-promote-page`, title `PROMOTE_TITLE`, line `promoteConfirm(next)`, answers `PROMOTE_NOT_YET` (`engineer-confirm-no`) then `PROMOTE_STEP_UP` (`engineer-confirm-yes`, `holdsReady`);
  - the Brought home page.
- **Render.**
  - Each render computes `page = settlePage(page, mountain, ready)`. When `page.kind` changes, it shows that page.
  - It sets the kick (`listKick` on the list, else `pageKick`) and paints the list rows or the shown page from the views.
  - The chips are painted from the mountain.
  - With no engineers on a ready save, it closes the drawer (`by: "program"`, `restoreFocus: false`).
  - Before the save is in, every row paints `undefined` and every plate disables.
  - The walk is `paint(sheet.isOpen())`.
- **Taps** (every one on `act` only, re-reading `getView()` first):
  - **An engineer row** → her page.
  - **A post row:**
    - her own post → nothing, and no blink;
    - else `sheet.cheer(stationCheer(name, post, gain))`, then dispatch `station`. On `applied`, record `result(\`post:${post}\`, "applied")` (the Done hold). The page stays, now with the new post here.
  - **Send exploring** → the tunnels page.
  - **The first-trip plate** → `cheer(exploreCheer(name))`, then dispatch `send` to `TUNNELS[0]`, then her page.
  - **A tunnel row:**
    - `can` false → `result(id, "refused")`, which blinks red;
    - else `cheer(exploreCheer(name))`, dispatch `send`, then her page (she is out now).
  - **Tend a machine** (on the tunnels page) → her page.
  - **Call her back** → the recall ask.
    - Keep exploring → her page.
    - Call back → `cheer(homeCheer(name))`, dispatch `recall`, then her page.
  - **Back to your engineers** → the list.
  - **Brought home** → the Brought home page.
  - **Promote:**
    - `can` false → `result("promote", "refused")`, which blinks;
    - else the promote ask, with `quoted = view.cost` from the last paint (#367).
    - Not yet → the list.
    - Step up:
      - if still promotable and `dispatch({ kind: "promote", price: quoted })` is `applied`: the list, `cheer(promoteCheer(newName))`, and `result(\`engineer:${newName}\`, "applied")`;
      - otherwise the list and no cheer.
- **Small functions.** `createEngineersPanel` stays under 150 lines and a complexity of 15. Its helpers are `buildEngineersList`, `buildPages`, `paintList`, `paintPage`, `wireRows`, `wirePlates` and `stepUp`.
- **Wiring.**
  - `screen-keys.ts`:
    - `KeyDrawers` becomes `Record<"buys" | "upgrades" | "workshop" | "engineers" | "ledger", KeyDrawer>`;
    - the `id === "engineers"` return and its comment go;
    - the module and type comments drop "Engineers opens through its own panel until B6b".
  - `screen-panels.ts`:
    - `createEngineersPanel` gets `board`, `overSave`, `door: rail.keys.engineers`, `fallbackFocus: rail.keys.ledger`, `chipHost: runningNow.effectRow` and `chipIconUrl: tierArt.helper`. `badgeUrl`, `iconUrl` and `requestRender` go;
    - `cardsFrom` drops `sheets.engineers.sheet`, and its comment drops the Engineers sentence (a B7b overlap).
  - `mountain-screen.ts`:
    - `drawers` gains `sheets.engineers.sheet`;
    - the `wireKeys` record gains `engineers: sheets.engineers`.
- **Harness** (`src/mountain-screen.harness.ts`). The screen gains `openEngineers()` (clicks the key), `openEngineer(name)` (clicks her row with a keyboard click, which is never early), and `engineersPage()` (the shown page's root, or `undefined` on the list). Tests that open a page use them, which keeps each retarget to one call.
- **Fixtures:** none new. The states are seen through `openMountain` (Ada, first visit), `awayTripSave` (out), `campPostsSave` (five engineers and two keepsakes), `toolHomeSave` (a homecoming while away) and `guardSave` (a Journeyman at camp).
- **Play saves** (`scripts/play.mjs` `SAVES`):
  - `trip`: "Ada out in the old shaft: her row walks home, and Call her back";
  - `posts`: "five engineers at their posts, Otto out, two keepsakes brought home";
  - `home`: "Ada came home while you were away: Welcome home names her find".

- [ ] **Step 1: Write the failing tests.**
  - `engineers-panel.test.ts`, on `mountScreen` with fake timers and an injected `tapClock`, as `ledger-panel.test.ts` does. New cases:
    - `"the Engineers key opens a board drawer"`: `.board-sheet[data-sheet=engineers].is-open` holds Ada's row and the Promote row, in that order. There is no `.engineers-dialog`. The key's `aria-expanded` is true.
    - `"a double tap on the key opens no engineer"`: key click, then a finger click on Ada's row 150ms later, and no page shows. At 500ms her page shows.
    - `"a double tap on an engineer lands on no post"`: her row, then a finger click on the drills row at +100ms, and her post is unchanged. At +500ms she moves, and the row holds Done.
    - `"one drawer at a time"`: opening Buys closes Engineers, and the reverse.
    - `"while the save loads again"`: rows dark and disabled, the page's plates disabled, and the page stays.
    - `"Escape and the scrim close it, on the list and on a page"`.
    - `"a homecoming's welcome closes the drawer"`: Ada due in 5s, the drawer open, the clock past the return. Welcome home shows, and the drawer is shut.
    - `"the walk home pauses in a shut drawer"`.
  - The same file, retargeted from the `"engineers sheet (#145)"` describe in `mountain-screen-crew.test.ts`, with the subjects kept and each name as close as the new surface allows. The describe is deleted from that file.
    - "keeps Engineers on the rail, and opens the drawer once a borer arrives";
    - "calls a party back from the tunnel when a post is chosen";
    - "stations, calls back to camp, and keeps the post through a hire";
    - "calls an engineer home from a tunnel";
    - "confirms a promotion on its page, and Not yet spends nothing";
    - "a promotion shows its spend on the odometer (#409)";
    - "does not cheer when Step up is no longer affordable";
    - "shows the rank word and a near-rank hint instead of a trip count" (the three rank lamps go);
    - "refuses a promotion when no worker is free, or the crew is full";
    - "greys promotion when the pocket is light, and a tap blinks red" (the pressed flash goes);
    - "shows keepsakes an engineer brought home, and its page tells the stories" (the toast goes);
    - "a cheer fades from the kick, and a post she already holds sends nothing".
  - `mountain-screen-depths.test.ts`, `"side tunnels (#147)"`:
    - `openSheet` uses the harness;
    - `.engineer-explore` → her page's `.engineer-explore`, then the tunnels page;
    - `[data-tunnel]` → `.engineer-tunnel-row[data-tunnel]`;
    - `.engineer-trip-title` and `-detail` → her page's kick (`tripDetail`) and her row's info (`Exploring the old shaft · gone about an hour`);
    - `.engineer-toast` → `.board-sheet[data-sheet=engineers] .board-sheet-kick`;
    - `is-lit` → the row's Done hold;
    - `.recall-line`, `.recall-no` and `.recall-yes` → the recall ask's `.board-page-line` and its two plates;
    - `.engineer-doing` → her page's kick;
    - `[data-post=camp]` → `.engineer-post[data-post=camp]`.

    "recalls with a soft confirm" keeps its Escape step: Escape now closes the whole drawer and keeps the trip, so the assertion becomes "the drawer is shut, and Ada is still exploring". Lines 433–450 (the homecoming while the sheet is open) become "Welcome home shows, the drawer is shut, and Continue returns to the board" (a B7b overlap). Line 1257's `.engineers-dialog` → the drawer.

  - `mountain-screen-rail.test.ts`: `.engineers-dialog` → `.board-sheet[data-sheet=engineers]` with `is-open`, and `.engineers-close` → its `.board-sheet-back`. Case 639 keeps its subject: Back while the key is held disabled focuses the Ledger key.
  - `mountain-screen.test.ts` 2105–2129: the same selector swap.
  - `mountain-screen-order.test.ts`: `"engineers-dialog"` leaves the cards' order (a B7b overlap).
  - `mountain-screen-promote.test.ts`: "a price that rose while the confirm sat open steps nobody up, and the row's tag shows the new price".
  - `engineers-teach.test.ts`:
    - "opens from its key under the New sign, and the first trip goes from her page": the key, then Ada's amber New row, then the `Send Ada exploring · 10 min` plate, and a side seam trip is stored;
    - "opens How it works for engineers, expeditions and tending from the i": `[data-how=engineers|expeditions|tending]` in the drawer's "i", with one `Back to your engineers`.
  - `tending-teach.test.ts`: "the New card's one big button tends" becomes "the New post row tends, shows the real gain in its row and the cheer, and the dot goes". "a tend from the menu also counts" → "from any post row".
  - `promotion-teach.test.ts`: "the Promote row is the New card" → "the Promote row is the New row: its payoff line, then its page confirms, then the dot goes". The how-card repricing case (#356) reads the drawer's "i".
  - `style.test.ts`:
    - `REQUIRED_SELECTORS` loses `.engineers-dialog` and `.engineer-tunnel`, and keeps `.expedition-chip`;
    - the overlay list (line 102) and the save-line list (line 443) lose `.engineers-dialog`;
    - `"stacks the cards in the root's order"`: the fixed-overlay regex loses `\.engineers-dialog,\n`, and its comment loses the Engineers sentence (a B7b overlap);
    - `BOARD_SELECTORS` gains `.engineer-walk`, `.engineer-walker`, `.engineer-page-plates`, `.engineer-brought-story` and `.board-page`;
    - a new case: `"the walk home holds still under reduced motion"` reads the `@media (prefers-reduced-motion: reduce)` rule for `.engineer-walker`;
    - a new case: `"keeps no rule for today's Engineers sheet (#455)"`: no `style.css` selector matches `\.(engineers-|engineer-|recall-)`.
- [ ] **Step 2:** `npx vitest run src/engineers-panel.test.ts src/mountain-screen-crew.test.ts src/mountain-screen-depths.test.ts src/mountain-screen-rail.test.ts src/mountain-screen.test.ts src/mountain-screen-order.test.ts src/mountain-screen-promote.test.ts src/engineers-teach.test.ts src/promotion-teach.test.ts src/tending-teach.test.ts src/style.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the panel, the wiring, the harness and the play saves.
  - **`style.css`** removes these, after a `grep` shows nothing else uses them:
    - `.engineers-dialog` from the fixed-overlay list (84–105), and its two later blocks (346–352, 535–600);
    - `.engineers-*`, `.engineer-*` and `.recall-*`, with the old `@keyframes engineer-walk` and the `.engineer-toast` reduced-motion member;
    - the focus-visible list (176–188) loses its Engineers members.

    It keeps `.expedition-chip`.

  - **`board.css`:**
    - `.engineers-dialog` leaves the "stops at the save line" list (930);
    - the "board cards" comment that names the Engineers sheet goes (a B7b overlap);
    - `.board-sign-slot[data-key="engineers"]` stays.
  - **Ceilings:** remove the five entries named in Global Constraints.
  - **`npx knip`:** remove what it names as unused, with their tests. Likely candidates: `tripTitle`, `broughtHomeToast`, `firstTendWords`, `promotionAction`, `createInfoButton`, `markNewCard` and `clearNewCard` (if no other panel uses them), the old `HOW_ART` glob, and `cardUp`/`showCard` imports.
- [ ] **Step 4: The browser checks, in this task.**
  - **`drawers.mjs`:**
    - `DRAWER_SAVES` gains `{ name: "engineers, five", save: () => campPostsSave(Date.now()) }` and `{ name: "engineers, out", save: () => awayTripSave(Date.now()) }`. Check `workshopUnlocked` on both, and add either to `WORKSHOP_LOCKED` if it is locked.
    - `ENGINEERS_LOCKED = new Set(["fresh", "early", "idle", "heir", "workshop", "workshop, free"])`. These are the saves with no borer, so no engineer. Check it on each fixture, and add a comment that says so.
    - `DRAWERS` gains:

      ```js
      {
        name: "engineers",
        when: ({ name }) => !ENGINEERS_LOCKED.has(name),
        mayScroll: ({ facts }) => facts.rows.length >= FULL_ENGINEERS_ROWS,
        mustScroll: ({ facts }) => facts.rows.length >= FULL_ENGINEERS_ROWS,
      }
      ```

      `FULL_ENGINEERS_ROWS = 7` (Budget).

    - The comment on `DRAWERS` drops its B6b sentence.
    - `ROW_LEGENDS` is unchanged: every Engineers word sits in a board row, a plate or the kick.
  - **`measure.mjs` `drawerFacts`:** a row's `id` also reads `row.dataset.engineer`, `row.dataset.engineers`, `row.dataset.post` and `row.dataset.tunnel`.
  - **`engineers-workshop.mjs`:** sections 11 and 12 are deleted. They are replaced by `keys and drawers ${JSON.stringify(viewport)} engineers states`, a flow on held clocks that steps past each settle with `stepTapClock(page, PAST_SETTLE_MS)` before each press. Each check is labelled `${size} engineers …`. The file's top comment says so.
    - **first visit** (`openMountain()`):
      - Ada's row is amber with flag `New`, badge `Apprentice`, and info `Tending the borers`;
      - the kick is `engineersIntro("Ada")`;
      - the Promote row's tag matches `/^[\d.]+[KMBT]?$/` and its verb is `Promote`.

      Shot `engineers-list-${size}`.

    - **her page:** press Ada's row. The page shows five post rows inside the drawer. The borers row reads `The borers · here now` with a green lamp and `aria-pressed`. Every built tier's gain matches `/^\+[\d.,]+[KMBT]? stones\/sec$/`. The plates are the first trip (`teach-new`) and `Back to your engineers`. There is no page scroll. Shot `engineers-her-page-${size}`.
    - **tunnels:** from a save past the first trip, press Send exploring. Three tunnel rows show. The deep dark is `is-locked` with `The deep dark waits for a Journeyman.`. The kick is the aside. Shot `engineers-tunnels-${size}`.
    - **out** (`awayTripSave(now)`):
      - first, s11's chip check, kept as it is: the chip sits in the Running now note with `Ada` and a clock;
      - then the drawer: Ada's row holds `.engineer-walk` in its icon cell (art at 2×), with info `Exploring the old shaft · gone about an hour`;
      - her page's kick has no digit, and its left plate is `Call her back`;
      - press it: the recall ask shows `Call her back` / `Ada comes home empty-handed.` with `Keep exploring` and `Call back`, inside the drawer.

      Shot `engineers-out-${size}` and `engineers-recall-${size}`.

    - **five** (`campPostsSave(now)`, and again with `standalone: true` at `PHONE`, s12's PWA case):
      - five engineer rows, Brought home (`A child's drawing, A pocket watch`), and Promote with `Every named hand is already an engineer.`;
      - the list scrolls inside the drawer and the page does not;
      - every row is 76 tall, and Otto's row walks.

      Then press Brought home: two stories at 16px or more, with no digit, inside the drawer. Shots `engineers-five-${size}` and `engineers-brought-${size}`.

    - **promote:** on `openMountain()` past the first trip (a `taught` override inline), press Promote. The ask reads `/ steps up as engineer\. One worker fewer at the machines\.$/` with `Not yet` and `Step up`, inside the drawer. Shot `engineers-promote-${size}`.
  - **`controls.mjs`:**
    - The "tap under Back" check (283–300): `engineersShown` reads `(await page.$(OPEN_SHEET("engineers"))) !== null`, and the wait is for `OPEN_SHEET("engineers")`.
    - Add one wiring check for the new control family, a row that opens a page, inside `keys and drawers ${vp} taps`, on `openMountain()` with `tapClock: "held"` and a `taught` that skips the first trip:
      - step past the settle, press Ada's row, and wait for `.engineer-page`;
      - press the drills row at once: the stored `engineers[0].post` is still `borer`;
      - `stepTapClock(PAST_SETTLE_MS)` and press it again: the stored post is `drill`.

      Its label: `${label} engineers: past the settle her row opens her page, a tap on a post at once sends nothing, and one past the settle posts her`. The family comment at the top of the file names it. No other Engineers tap is checked in Chrome. The tunnels, recall, promote and Brought home presses are unit tests (H3a).
  - **`main-screen.mjs`:**
    - `engineersSheetFits` is deleted.
    - Section 1 (:418) becomes `check(await openSheet(page, "engineers") && (await noScroll(page)), \`${size} engineers drawer opens by its key with no page scroll\`)`, then `closeSheet`.
    - Section 2 (:623, the 999 crew in DejaVu) becomes: open the drawer, and `drawerFacts` shows every row inside, with no overlap or spill. Label: `${label} engineers drawer rows fit at a 999 crew`.
    - Both changes are named in the commit body.
  - **`running-and-guards.mjs:193`:** `shows: drawer("engineers")`.
  - **`ui-audit.mjs`:**
    - `engineers-promote` and `engineers-expedition` press `KEY("engineers")` and use `openDrawer("engineers")`. Their `expectText` is `/Promote a worker/` and `/Exploring the old shaft/`.
    - Add `engineers-page`: Ada's page on the mid save.
    - The selector lists: `.engineers-card` leaves `:480`; `.engineer-promote` stays a primary (the row keeps that class); `.engineer` → `.engineer-row` at `:562`; `.engineer-badge` leaves `:580`.
    - `engineers-homecoming` is unchanged (B7b's card).
  - **Run:**
    - `VISUAL_ONLY='^keys and drawers \[424,924\] (mid|crew|engineers, five|engineers, out|engineers states|taps)$' npm run visual`;
    - then `VISUAL_ONLY='^keys and drawers' npm run visual` at every size;
    - then `VISUAL_ONLY='^section (1 \(main screen\)|2 \(tier cards\)|24 )' npm run visual`. Section 1 and section 2 hold main-screen's retargeted checks, and section 24 is the no-scroll guards with the `engineers` row.
- [ ] **Step 5: Play** at 424×924, one run each. Look at the phone shots and `log.txt`: no page error, and the save line is `data-kind` local.
  - `npm run play -- --save early` (the Engineers key is locked: `With 1st borer`, and a tap does nothing);
  - `npm run play -- --save mid tap:.board-key[data-key=engineers] wait:.board-sheet[data-sheet=engineers].is-open` (Ada's New row and the intro kick);
  - `npm run play -- --save mid tap:.board-key[data-key=engineers] wait:.board-sheet[data-sheet=engineers].is-open wait:500 tap:.engineer-row wait:500 tap:.engineer-explore` (her page, then the first trip: her row walks, and the kick cheers);
  - `npm run play -- --save trip tap:.board-key[data-key=engineers] wait:.board-sheet[data-sheet=engineers].is-open wait:500 tap:.engineer-row wait:500 tap:.engineer-recall wait:500 tap:.recall-yes` (the walk home, the ask, then `Ada is home, empty-handed.`);
  - `npm run play -- --save posts tap:.board-key[data-key=engineers] wait:.board-sheet[data-sheet=engineers].is-open wait:500 tap:.engineer-brought` (the scroll inside the drawer, then the stories);
  - `npm run play -- --save posts tap:.board-key[data-key=engineers] wait:.board-sheet[data-sheet=engineers].is-open wait:500 tap:.engineer-row[data-engineer=Nils] wait:500 tap:.engineer-post[data-post=drill]` (the cheer with the gain, and the Done hold);
  - `npm run play -- --save mid tap:.board-key[data-key=engineers] wait:.board-sheet[data-sheet=engineers].is-open wait:500 tap:.engineer-promote wait:500 tap:.engineer-confirm-yes` (the ask, then the new engineer's row holding Done, and the odometer's spend);
  - `npm run play -- --save home` (Welcome home names Ada's pick; Continue, then the drawer shows Ada at the borers);
  - `npm run play -- --save mid tap:.board-key[data-key=engineers] wait:.board-sheet[data-sheet=engineers].is-open wait:500 tap:.board-sheet-info` (the three "i" cards).
- [ ] **Step 6:** `npm run gate -- fast` and `npx knip`. Expected: PASS. `npm run functions` shows no `engineers-panel` entry.
- [ ] **Step 7: Commit** `The Engineers key opens a board drawer: a row per engineer with the walk home, her page of posts, the tunnels, Call her back and Promote asking on drawer pages, and Brought home's stories (#455)`. In the body, list the deleted and retargeted tests and checks, and the removed ceiling entries. Push.

### Task 5: Docs and proof

**Files:** `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/ART.md`, `docs/ui-audit.md` (and its shots under `docs/ui-audit/`), and `docs/design-intent.md` only if a line still describes the old sheet (`grep -n -i "engineer" docs/design-intent.md`).

- [ ] **DESIGN.md:**
  - Line 106: "Engineers opens today's sheet until B6b (#455)" becomes: Engineers opens its drawer (#455).
  - Line 107: "Buys, Upgrades, Workshop and the Ledger open as drawers" gains Engineers.
  - Line 322 is rewritten for the drawer:
    - a row per engineer (the rank word, the duty line, the walk home while she is out);
    - her page of five posts with their real gains, Send exploring or Call her back;
    - the tunnels page;
    - the recall and promote asks as drawer pages;
    - Brought home's page of stories;
    - the cheer in the kick;
    - the full crew with keepsakes, which scrolls inside the drawer (C1);
    - the Welcome home card, which closes the drawer;
    - the new art if option 1 of the stop.

    Rank lamps and machine badges are gone from the sheet; a post row shows its machine.
- [ ] **ARCHITECTURE.md:**
  - Lines 325–336: the five drawers. `wireKeys`' record holds Engineers. `engineers-panel` is a drawer whose shell writes its key's `aria-expanded`.
  - Line 394: the Engineers pressed flash is gone; its rows and plates use `pressLook`.
  - Lines 762–766: `engineers-panel` (the drawer), `engineer-rows` (views, pages, teach) and `engineer-parts` (rows, pages, walk, chips); `board-page` (the page that asks, shared with the Ledger); `BoardSheet.cheer`.
  - In the visual-check notes: Engineers is a `DRAWERS` row with a states flow, and its row-opens-a-page wiring is one check in `controls.mjs`. s11, s12 and `engineersSheetFits` are gone.
- [ ] **ART.md:** add a row for `miner-18f.png`'s second use (the walk home), and for the mach-* icons on the post rows. If option 1 of the stop, add rows for `res-map.png`, `res-boot.png` and `res-nugget.png`, marked "Approved B6b".
- [ ] **ui-audit.md:**
  - Rows 38–40 are rewritten for the drawer:
    - promote: the row's tag and verb, and its ask page;
    - expedition: her row walking, with the words-only line;
    - homecoming: the welcome card, with the drawer shut under it.

    Each has its new shot, and an `engineers-page` row is added.

  - Line 114: Engineers is a drawer.
  - Refresh the shots with `npm run audit:ui`.
- [ ] Run `npm run gate -- full` in the background, once. Read `.gate/logs/<step>.log` for any FAIL and fix it. Run the full gate again only after a fix to a step it failed.
- [ ] **Commit** `The docs describe the Engineers drawer (#455)` and push. Then `npm run gate -- signoff`, then the ship-sitting skill. The PR body lists Flemming's answer on the art, the Rulings below, and the places where today's words moved (Copy). The PR says "Closes #455".

## Rulings

Given by the controller and the issue:

- **The layout is Flemming's (11 Nov).** One 76px row per engineer, amber when she is the New one. A tap opens her page in the drawer. Promote ends the list. The confirms are drawer pages with two plates.
- **The Welcome home card is B7b's.** This sliver's homecoming is in the drawer: the walk home on her row, Brought home and its stories, and the recall's cheer.
- **The locked Engineers drawer** (spec 122's "row that opens Buys at the borer") cannot be reached: B5's locked key takes no tap. The key's `With 1st borer` is the locked state, as for the Workshop.

Added by this plan:

- **Three levels, never deeper.**
  - The list: engineers, Brought home and Promote.
  - Her page: five posts and two plates.
  - The tunnels page, or an ask.

  Every level fits 538px (Budget). A page that put her posts and her tunnels together, or added a row about her above the posts, would not fit. Her duty sentence (`Ada is tending the borers: +78 stones/sec.`) is her page's kick, so the page names her without a row.

- **Her page is the Tend list.** Today's Tend button opened the posts. Now the posts are her page, so a move is two taps from the list, as it is today (Tend, then a post). Send exploring opens the tunnels page. While she is out, the left plate is `Call her back`, and every post still calls the party back first, as today.
- **The walk home sits on her row.** While she is out, her row's icon cell is an inset tunnel mouth with the board's miner walking across it in hard steps (`miner-18f.png`, frames 4–7, no new art). Under reduced motion he stands still, and in a shut drawer he waits. The words stay vague: `Exploring the old shaft · gone about an hour` on the row, and today's `tripDetail` as her page's kick. `tripTitle` goes (knip): the duty line says the same.
- **The first trip stays one guided plate.** Under the first-visit teach, her page's left plate is today's `Send Ada exploring · 10 min` (`firstTripWords`). It fits to `Send exploring` if it must, with the full words on its label, and it sends the shortest tunnel at once, as today's big button did. The first tend is the New post row (amber, flag `New`), which shows its real gain in the row. `firstTendWords` goes (knip). The promotion teach is the New Promote row with today's payoff line. `promotionAction` goes (knip).
- **The cheer is the kick's, for 2.2s.** `stationCheer`, `exploreCheer`, `homeCheer` and `promoteCheer` stand in the drawer's kick, which is already a live region, and then give way. This extends the kick's thanks, and the toast goes. The glow goes too: a post that lands, and a new engineer, hold their row's Done for 1.9s, which is the board's one "it worked" look and blocks a sleepy second tap.
- **Brought home is a row, and its stories are a page.** The keepsakes are the mountain's, not one engineer's. So Brought home is one list row (today's names), and its page tells each story at 16px, in place of today's story toast.
- **The rank is a word.** The row's badge is `Apprentice`, `Journeyman` or `Master engineer`, and its why line is `nearly a Journeyman` when today's hint applies. The three rank lamps go: a lamp on the board is a status light, and the row has one. The machine badge on the portrait goes too. The post rows show each machine's art, and her row says where she is.
- **Promote is a buy row.** It shows the price on its tag (`2M`), the verb `Promote`, and today's why line, or the payoff under the teach. An unaffordable tap blinks red, which replaces the greyed button and the pressed flash. Its `aria-label` is today's `Promote: 2M stones`. Step up pays the price that was on the row when he tapped it (#367). A full crew keeps the row with `Every named hand is already an engineer.`, with no tag and no verb.
- **The asks are the Ledger's page that asks, shared.** Recall's title is `Call her back`, its line `Ada comes home empty-handed.`, and its answers `Keep exploring` and `Call back`. Promote's title is `Promote a worker`, its line `promoteConfirm`, and its answers `Not yet` and `Step up`. The safe answer comes first and takes the focus. The yes answer counts only past the page's settle.
- **Back, the scrim and Escape close the whole drawer, from any page.** Today's Escape closed a confirm first. On the board, Escape closes the drawer and changes nothing, so a recall or a promotion is still never made by Escape. This is the Ledger's ruling.
- **A homecoming closes the drawer.** A Welcome home that opens by itself closes an open Engineers drawer, as every self-opening card closes every drawer (`coverFor`). Today's sheet stayed open under the welcome only because it was one of today's cards. After Continue he is on the board, and the key opens the drawer again, showing her at her post.
- **No order freezing.** The list only grows at its end, from a promotion made on a page (the list comes back as a new screen, with its settle) or from a deep-dark find. So it sends no `layout` to the model, as the Ledger sends none. A find that adds a row while the list is open moves Promote down one place. A tap on Promote then only opens a page that asks.
- **A full crew with keepsakes scrolls inside the drawer** (C1, "a full Engineers crew"). It is the one case that does, with seven rows. Everything else fits. DESIGN's "five engineers fit with no scroll" changes to say so.
- **Pages name their engineer, not her index.** A page follows her by name, so a crew that changes under the page never shows another engineer's posts.
- **The "i" shows Engineers, Expeditions and Tending under one `Back to your engineers`,** repriced by stretch as today. The repricing is `board-how-art.ts`'s `createHowPricer`, moved from Upgrades.
- **The expedition chips stay where they are.** They stay in the Running now note with today's helper art, and their builder moves to `engineer-parts.ts`. Reskinning them is the Running now note's job, not this sliver's.
- **Browser checks follow H3a.** Engineers is one `DRAWERS` row plus one states flow, which replaces s11, s12 and `engineersSheetFits`. "A row that opens a page" is the one new control family in `controls.mjs`. The tunnel blink, the asks, the Done holds and Brought home are unit tests.

## Budget

The list is 538px tall, with rows of 76 and gaps of 10, as B6a measured. n rows take 76n + 10(n − 1).

| List                                        | Rows | Height                                  |
| ------------------------------------------- | ---- | --------------------------------------- |
| One engineer + Promote (mid)                | 2    | 162                                     |
| Four engineers + Brought home + Promote     | 6    | 506                                     |
| Five engineers + Promote                    | 6    | 506                                     |
| **Five engineers + Brought home + Promote** | 7    | **592: scrolls inside the drawer (C1)** |

| Page                                                                                    | Height    |
| --------------------------------------------------------------------------------------- | --------- |
| Her page: five post rows (420), a gap, the plate pair (54)                              | 484 / 538 |
| Tunnels: three rows (248), a gap, the plate pair (54)                                   | 312 / 538 |
| An ask: padding 28, title 26, two lines 40, the answers 54, gaps 16                     | 164 / 538 |
| Brought home: title 26, five stories of three 16px lines (5 × 66), Back 54, six gaps 48 | 458 / 538 |

The spare plate fills under every short list and page. At `MAX_ENGINEERS` with keepsakes, the spare is off and the list scrolls, which `DRAWERS`' `mayScroll`/`mustScroll` at seven rows pin.

## Copy

**Copy needing approval: none.** Every word is today's, and the PR lists only the places where today's words moved:

- the duty sentence and `tripDetail` become her page's kick;
- `exploreAside` becomes the tunnels page's kick;
- `callBackLabel` becomes the recall ask's title, and `PROMOTE_TITLE` the promote ask's title;
- `Back to your engineers` becomes the pages' Back too;
- `promoteOffer` becomes the Promote row's label, with the price on the tag;
- the cheers stand in the kick, not a toast;
- the keepsake stories are a page, not a toast.

Removed (knip): `tripTitle`, `broughtHomeToast`, `firstTendWords`, `promotionAction`, and the panel's own "Back to the mountain".

## B7b overlaps

B6b builds after B7b (#464) on the same branch (#455's claim comment), and these points touch B7b's work:

1. **`cardsFrom`'s order.** B7b's review fix puts `sheets.engineers.sheet` first, so a homecoming's welcome paints over today's sheet. A comment in `screen-panels.ts`, one in `board.css`'s "board cards" block, `style.test.ts`'s "stacks the cards in the root's order" (its regex names `.engineers-dialog`), and `mountain-screen-order.test.ts` all pin that. B6b takes the sheet out of `cardsFrom`, and Task 4 rewrites all four.
2. **A homecoming while the sheet is open.** `mountain-screen-depths.test.ts` 433–450 expects the sheet to stay open under Welcome home. In B6b the welcome closes the drawer (Rulings). That test is rewritten in Task 4.
3. **`stackWith`.** B7b's change keeps cards on the stack when a drawer opens. The Engineers drawer inherits it unchanged. No card is ever under an open Engineers drawer, because a card closes it.
4. **The shared `style.css` selector lists** that B7b kept (`.engineers-dialog`, `.engineers-close`) lose their Engineers members here.
5. **`BACK_TO_THE_MOUNTAIN`.** B7b left the panel's own literal for B6b. It goes with the old sheet, because the shell's Back says "Back to the board".
6. **`kit.mjs#coversBoard`** takes absolute overlays since B7b. Its only Engineers user, `engineersSheetFits`, is deleted.
7. **The `engineers-homecoming` audit shot** is B7b's welcome card, and stays. Its `ui-audit.md` row loses "over the Engineers sheet".

If B7b's review fixes change any of these before the merge, Task 4 follows the merged version.

## Risks

- **The "i" may not fit.** Three cards hold ten steps, where Workshop's two cards hold seven. The DRAWERS "i" check measures it at every size. If the cards overflow, the Tending card leaves the "i" (its words are on every post row's gain and benefit), and this is named in the PR. Its art is no reason.
- **The art stop.** Option 1 needs a pixellab session before Task 1's Step 3. Tasks 2 and 3 do not wait on it, so dispatch them while the icons are made.
- **Her page at 484 / 538** leaves 54px. If a PC size runs out of room, the plates drop to 48px (still a target), and this is named in the PR. No line wraps: a long benefit ellipsizes, with the full words on the row's `aria-label`.
- **The first-trip plate's words** (`Send Ada exploring · 10 min`) may not fit a half-width plate at 16px. They fit to `Send exploring`. The play run shows which.
- **The walker in the 2× check.** `boardArtAt2x` must read a stepped sprite as 2×. If it measures the background mid-step, it waits for the frame, as the window's miner does.
- **Test churn.** The `"engineers sheet (#145)"` describe (about 590 lines), `"side tunnels (#147)"`, three teach suites and the rail suite are the largest cost of Task 4. The harness helpers keep most changes to one call.
- **Size.** About 7–8 agent hours: Task 4 is about 3.5, Task 3 about 1.5, and the others about 1 each. This is at the top of one sitting, as B6a and B7a were. The drawer cannot be cut in two without leaving today's sheet half-reworked and its ceilings in place. So the only part that may move to a follow-up, named in the PR, is the ui-audit retarget (not in the gate). If Task 4 runs past about 4 hours, stop and tell the controller rather than splitting further.
