# Control Board B7b: the board cards (#464) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six cards open in the board skin, all on one shared board card shell:

- the three that open themselves: welcome back, layer arrival and craft done;
- the three that open when something happens: the save conflict, the other tab and the update.

Each is a riveted frame card that rises from the save line into the drawer's box, over a dimmed board. Each has today's words and today's buttons, as board plates. Their presses go through the board's model. So the second tap of a tap that was meant for the board, landing just as a card opens under the finger, does nothing.

**Base:** B7a (#375, the Ledger drawer) merged into `main`. This plan reads B7a's `board-drawer.ts`, `ledger-*` and `drawers.mjs` as they stand on `f5d3898`.

**Out of scope:**

- the Ledger drawer (B7a);
- the relic shelf, detail, reveal, Legend, keepsakes, Saved copies and Pass the mine (B7c, #465), which reuse this shell;
- the Engineers drawer and its homecoming sheet (B6b, #455);
- the PC desk (B8, #376).

**Architecture:**

- **The model learns cards.** `board-interaction.ts` (pure) gains `CardId` (`"welcome" | "layer" | "craft" | "conflict" | "other-tab" | "update"`), so `OverlayId` = `DrawerId | CardId | "save" | "note"`.
  - A card settles for `DRAWER_SETTLE_MS` after it opens, as a drawer does.
  - A card's close takes only its own entry off the stack, never what stands above it.
  - Nothing else changes: drawers still stand alone, and a finger's close still settles only under a drawer.
- **One new shell module, `src/board-card.ts`.** It is new rather than an option on `createBoardSheet` because a card is not a drawer:
  - it has no rail key, no "i", no list, no spare plate, no "Back to the board", no scrim close and no Escape;
  - it opens by itself from the store's view, not from a press;
  - it sits on top of whatever is open, where a drawer replaces the others;
  - it takes its height from its content.

  Putting those switches into `board-drawer.ts` would bend a 571-line shell that five drawers share. The card shell reuses the drawer's parts rather than copying them:
  - `board-dom.ts`: `el`, `write`, `hide`, `mark`;
  - `board-skin.ts`: `skin(face, "frame")`, `skin(side, "inset")`;
  - `board-save.ts`: `plateButton`;
  - `card-tap.ts`: `pressOnBoard`, `forgetAll`;
  - `card-state.ts`: `showCard` and `cardUp`, so `cardsFrom`, `screen-overlays.ts` and `screen-cover.ts` keep working unchanged;
  - `board-row.ts`: the lamp frames (`LAMP_FRAME` and `LAMP_PX`, exported);
  - `board-dom.ts#frameX`.

- **Pure views, one new module, `src/card-views.ts`.** No DOM and no art.
  - It turns the snapshot into what the welcome card shows (`welcomeView`).
  - It answers whether the welcome card has news (`welcomeNews`), which today is computed twice: in `welcome-panel.ts` and in `arrival-panel.ts`'s `waiting`.
  - It picks the arrival card (`arrivalCard`): the layer card, else craft done, else none.

  This is what lets `createWelcomePanel` drop to under 150 lines and `renderWelcome` to under complexity 15 (#422). There is no existing pure home for card views. `screen-words.ts` holds words and word functions, not views made from the snapshot. `save-sheet-copy.ts` keeps the conflict's side lines.

- **The panels keep their files and their APIs,** rebuilt on the shell:
  - `welcome-panel.ts` returns `{ welcome, render }`;
  - `arrival-panel.ts` returns `{ layer, notice, render }`;
  - `save-conflict-panel.ts` returns `{ root, render }`;
  - `screen-prompts.ts` keeps `createUpdatePrompt`, `createOtherTab` and `showAppUpdate`.

  Each gains `board`, from `ctx.board`. `cardsFrom` and the cards' order in the root are unchanged.

- **Hooks stay put.** Each card's root keeps today's class (`.welcome-back`, `.layer-arrival`, `.craft-notice`, `.save-conflict`, `.other-tab`, `.update-prompt`), its title id, its line classes (`.welcome-mined`, `.welcome-return`, `.layer-sketch` and the rest), and its button classes (`.welcome-continue`, `.layer-dig`, `.craft-accept`, `.save-conflict-play`, `.save-conflict-commit`, `.save-card`, `.other-tab-play`, `.update-reload`). These sit as extra classes on the board parts, as B6a kept `.workshop-bar`. About 170 unit-test references and every play command keep working. Only the inner card faces (`.welcome-card`, `.layer-card`, `.notice-card`, `.update-card`, `.other-tab-card`, `.save-conflict-sheet`) give way to `.board-card-face`.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom per file), puppeteer-core scripts (`scripts/visual-check.mjs` and `scripts/visual/*.mjs`, `scripts/play.mjs`, `scripts/ui-audit.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-07-control-board-design.md`. This plan uses:

- "Where everything else goes", lines 143–144:
  - "Welcome back, layer arrival, craft done: a drawer card that opens itself on launch or arrival, with one big button";
  - "Save conflict, other tab, update available: drawer cards in the board skin, same words and buttons";
- the drawer shell (lines 106–110) for the box, the frame, the 6 hard steps and the save line staying visible;
- "Rules the board keeps" (lines 147–158), "Checks" (lines 200–214), D3 (straight to live), and the B7 row of the sliver table (line 228).

The mockup has no card, so these rulings stand in for it: the box, the rise, the shade and the art (Rulings).

## Art

Every picture the cards need is already in `src/assets/board/`. Nothing in this plan spends PixelLab credits.

| Card                       | Asset (under `src/assets/board/`)                                                                                                                                         | Art size | Shown at |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| Layer arrival              | The new band's mine view, through `mine-window.ts#mineView(id)` (`mine-view-granite.png`, `-crystal`, `-heart`)                                                           | 92×76    | 184×152  |
| Craft done                 | `mach-cart.png` (iron rails), `mach-drill.png` (diamond bits), `mach-machine.png` (heartstone core and ember), `mach-worker.png` (engineer's kit)                         | 32×32    | 64       |
| Craft done                 | `relic-lantern.png` (crystal lamp and flare)                                                                                                                              | 24×24    | 48       |
| Craft done                 | `res-stone.png` (sturdy props, blasting charge, reinforce, axle grease)                                                                                                   | 16×16    | 32       |
| Welcome, the material line | The first material the haul brought, in `MATERIALS` order, from `workshop-parts.ts`'s `PLATE_ART` (exported as `MATERIAL_ART`; `res-clay`, `-iron`, `-crystal`, `-heart`) | 16×16    | 32       |
| Every card                 | `frame.png` (the face) and `inset.png` (the conflict's two sides), through `board-skin.ts`; `key.png` for the plates; `lamp.png` for the conflict's selected side         | —        | 2×       |

All of them show at exactly 2×.

Today's card art leaves the screen: `mountain.png` on the layer card, `ore-lump.png` on the welcome line and the notice, `boot-tile.png` as the lantern, and the old tier sprites on the notice. `ScreenArt` loses `lanternUrl`, `mountainUrl` and `stoneUrl` if knip says nothing else reads them. The files stay where `scripts/make-icons.py`, `index.html` or another import still use them: `grep -rn` each name before removing any file. No placeholder art is ever committed.

**Art needing PixelLab:** none.

## Copy

Every word on the six cards is today's. New strings: **none.** The words leave their inline literals and join `screen-words.ts`, so each lives in one place:

- `WELCOME_AWAY_TITLE` (`While you were away`);
- `CREW_GREW_TITLE` (`Your crew grew`);
- `WELCOME_HOME_TITLE` (`Welcome home`);
- `crewGrewWords(joined, alone)` (`Your crew grew: N workers joined to run your machines.`, without `Your crew grew: ` when alone);
- `awayMinedWords(mined)` (`+1.2M stones`, `+1 stone`);
- `awayGoneWords(report)` (`You were gone 9h. … The Heart of Patience made it ×1.25.`);
- `UPDATE_TITLE` (`Update available`);
- `UPDATE_RELOAD` (`Reload`).
- `fieldLogClose` (`Back to the mountain`) has no field log since B7a. It is renamed `BACK_TO_THE_MOUNTAIN` with its test references, and the welcome card reads it. `engineers-panel.ts`, `relic-panels.ts` and `saved-copies-panel.ts` keep their own literal until B6b and B7c take theirs.

Already in `screen-words.ts`: `AWAY_CHEER`, `AWAY_MATERIALS_USE`, `ENGINEER_WELCOME`, `awayMaterialsWords`, `awayCheerWords`, `awayStretchWords`, `cameBack`, `layerWelcomeWords`, `layerCardWords`, `LAYER_DIG`, `CRAFT_DONE_BUTTON`, `craftFittedWords`, `SAVE_CONFLICT_*`, `OTHER_TAB_*`.

**Copy needing approval:** none. If a reviewer asks for a kicker or a legend on the cards (as the save drawer's `Account` kicker), that is new copy and a stop. This plan adds none.

## Global Constraints

- **UI only.** No rule, number, price, save field, log code or lab change. The buttons still call what they call today:
  - `progress.dismissAway()`, `progress.dismissLayer()`, `progress.dismissCraft()`;
  - `progress.chooseSave(selected)`, after today's two-step confirm;
  - `progress.playHere()`;
  - `globalThis.location.reload()`.

  Nothing about saving changes (`.claude/rules/observable-saves.md`): no write is added, skipped or swallowed, and the save line is never covered.

- **Shared modules** (CLAUDE rule "name the shared module"):
  - settle and stack: `board-interaction.ts`, through `board-host.ts`;
  - presses: `card-tap.ts#pressOnBoard`;
  - the card shell: `board-card.ts` (new, Task 1);
  - the cards' views: `card-views.ts` (new, Task 2);
  - shown state: `card-state.ts`;
  - cover and the drawers: `screen-cover.ts` and `screen-overlays.ts`, unchanged;
  - plates: `board-save.ts#plateButton`;
  - skins: `board-skin.ts`;
  - DOM helpers: `board-dom.ts`;
  - lamp frames: `board-row.ts` (`LAMP_FRAME`, `LAMP_PX`, exported);
  - band views: `mine-window.ts#mineView`;
  - material art: `workshop-parts.ts` (`MATERIAL_ART`, exported);
  - the side lines: `save-sheet-copy.ts#saveCardLines`;
  - the words: `screen-words.ts`;
  - the dev hooks: `boot.ts#parseBootOptions`.

  Nothing in that list is copied into a second home.

- **Motion.** The face rises in 6 hard steps (`steps(6)`, 0.24s, as the drawer). Under reduced motion it does not move. There is no float, bounce or glow. Today's radial amber gradient and `box-shadow` glow go.
- **Sizes at 424×924.**
  - The card covers the board from 0 to the save line's top, as a shade.
  - The face is anchored 4px above the save line, 8..416 wide, and never taller than the drawer's box (top no higher than `--sheet-top`, 178).
  - Padding is the sheet's (7 art px).
  - The plates are 54px tall and full width, or two columns 8px apart (the conflict's sides).
  - Targets are at least 48×48 with 8px gaps.
  - Text is at least 13px, and contrast is at least 4.5:1. Numbers (the haul, times, stones) are in `.board-num`.
  - The face never scrolls inside, and the page never scrolls (budget in Rulings).
  - New CSS lives in `src/board.css`, written with `calc(var(--art) * N)` or tokens (`npm run tokens`). One new token, `--board-type-40`, is for the haul's big number. One new colour token, `--board-shade`, is for the dim.
- **Ceilings** (#422), in Task 3:
  - remove `src/welcome-panel.ts#createWelcomePanel` from `scripts/function-ceilings.json`;
  - remove `src/welcome-panel.ts#createWelcomePanel>renderWelcome` from `scripts/complexity-ceilings.json`.

  No entry is added. Every new or rebuilt function is under 150 lines and complexity 15 (`npm run functions`).

- **Coverage floors** (`vite.config.ts`). The existing floors stay: `welcome-panel.ts` 100/96/100/100, `screen-prompts.ts` 100/100/100/100, `board-interaction.ts` 100/100/100/100, `card-state.ts` and `screen-panels.ts` as they are. New floors:
  - `src/board-card.ts` 100/95/100/100;
  - `src/card-views.ts` 100/100/100/100;
  - `src/arrival-panel.ts` and `src/save-conflict-panel.ts` 100/95/100/100, if a run shows they reach it. Otherwise set them at the measured value rounded down, and name them in the PR.

  No floor is lowered.

- **Verification ladder** (`.claude/rules/dad-friendly-work.md`). Each task climbs in this order, and stops as soon as its step proves the change:
  1. the touched test files (`npx vitest run <file>`);
  2. `npm run gate -- fast`;
  3. the named `VISUAL_ONLY` sections and `npm run play` on the named save;
  4. `npm run gate -- full`, once, in Task 5.

  Never run two browser scripts at once. `npx knip` passes at every commit.

- **Commits** are a plain sentence ending ` (#464)`, with the trailers below. Push after each task to the sitting's branch.

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011RgeWspHUjx1QMk2374KGN
  ```

## Review Focus

1. **A sleepy double tap.**
   - A card that opens under a finger (a dig that breaks into the Granite, a craft that lands as he taps a key, the welcome on launch): a finger press on its plate in the first 400ms does nothing, and one past it acts.
   - Welcome, then layer arrival: the second tap of `Back to the mountain` does not take `Dig on`. Each card opens with its own settle.
   - The conflict's `Play this one`, then the confirm: the confirm is a new screen (`card.page()`), so a double tap never commits a save choice. Today it can.
   - A keyboard press is never early.
2. **Nothing a card did changes.** Every button calls today's store method. The conflict keeps its pre-selection (the side with more stones mined), its selection, its error line and its two steps. Play here still waits for the first tab's save.
3. **The stack.** A card opens on top of what is open, and closes only itself. Conflict and update up together, then the conflict resolves: the update stays on the model's stack and still settles. An open drawer still closes when a card comes up (`coverDrawers`, unchanged). The save line and its drawer still open over any card.
4. **The order the self-opening cards keep.** First the welcome, then the relic reveal (B7c's, unchanged), then the layer card, then craft done, one at a time. `welcomeNews` is the one rule that the welcome and arrival panels read.
5. **Focus.** Each card focuses its first plate once as it opens, without scrolling: welcome `Back to the mountain`, `Dig on`, `The crew feels it`, `Play this one`, `Play here`, `Reload`. A repaint never steals focus back.
6. **The board stays the board.** The face sits in the drawer's box, at 2× art. Nothing scrolls, and the save line stays on top (`coversBoard`).

---

### Task 1: The model learns cards, and the card shell

**Extends:**

- `src/board-interaction.ts`: `CardId`, the settle for cards, and a card's close;
- `src/board-row.ts`: export `LAMP_FRAME` and `LAMP_PX`;
- `src/workshop-parts.ts`: export `PLATE_ART` as `MATERIAL_ART`;
- `src/board.css`, `src/tokens.css`.

**New:** `src/board-card.ts`, `src/board-card.test.ts`.

**Files:**

- Modify: the four above, `src/board-interaction.test.ts`, `src/style.test.ts`, `src/token-check.test.ts` (only if the new tokens need listing).

**Produces:**

- `board-interaction.ts`:
  - `export type CardId = "welcome" | "layer" | "craft" | "conflict" | "other-tab" | "update"`, and `OverlayId = DrawerId | CardId | "save" | "note"`;
  - `isCard(layer)`;
  - `early()` settles a layer that `isDrawer(layer) || isCard(layer)`;
  - `closed()` takes off only the card's own entry for a card (`stack.filter`), and keeps `slice(0, index)` for everything else;
  - `stackWith` is unchanged: a card goes on top;
  - `drawerOpen` is unchanged: a card is not a drawer.
- `board-card.ts`:

  ```ts
  export interface BoardCardOptions {
    readonly name: CardId;
    /** Today's root class, kept as the card's hook: "welcome-back", "layer-arrival", … */
    readonly hook: string;
    /** Today's title id, kept: "welcome-back-title", "craft-notice-line", … */
    readonly titleId: string;
    readonly board: BoardHost;
  }
  export interface BoardCard {
    /** div.board-card.<hook>[data-card=name]: the shade over the board, role dialog, aria-modal. */
    readonly root: HTMLElement;
    /** section.board-card-face, frame skin: the title, the body, then the foot. */
    readonly face: HTMLElement;
    readonly title: HTMLElement; // h2.board-card-title#<titleId>
    readonly body: HTMLElement; // div.board-card-body
    readonly foot: HTMLElement; // div.board-card-foot
    /** A big plate in the foot (or `into`), pressed through the board on this card's layer. */
    plate(
      label: string,
      id: string,
      hook: string,
      act: () => void,
      into?: HTMLElement,
    ): HTMLButtonElement;
    /** Shows or hides: showCard, the model's open/close, and focus on `focus` once as it opens. */
    show(on: boolean, focus?: HTMLElement): void;
    /** A new screen on the card (the conflict's confirm): forgets presses, settles again. */
    page(): void;
    isUp(): boolean;
  }
  export function createBoardCard(options: BoardCardOptions): BoardCard;
  /** A line on a card: p.board-card-line.<hook>, written only when it changes. */
  export function cardLine(hook: string): HTMLElement;
  /** Art on a card at exactly 2x: img.board-card-art, alt "", not draggable. */
  export function cardArt(px: 32 | 48 | 64 | 152): HTMLImageElement;
  ```

  - `show(true)` from hidden calls `showCard(root, true)`, `board.send({ kind: "open", overlay: name, at: board.clock() })`, `forgetAll(trackers)()` and `focus?.focus({ preventScroll: true })`.
  - `show(false)` from shown calls `showCard(root, false)`, `board.send({ kind: "close", overlay: name, at, by: "program" })` and forgets the presses.
  - A repeated `show(true)` sends nothing and moves no focus.
  - `plate` calls `plateButton(label)`, adds `board-card-plate` and `hook`, and calls `pressOnBoard(button, board, { layer: name, id }, (decision) => decision === "act" && act())`.
  - `page()` calls `board.send({ kind: "page", overlay: name, at })` and forgets the presses.

- **CSS** (`board.css`):
  - `.board-card`: `position: absolute; top: 0; left: 0; width: var(--board-w); height: calc(var(--board-h) - var(--save-h)); z-index: 10; background: var(--board-shade); pointer-events: auto`. It sits under `.board-sheet-clip` (29) and `.board-drawer-clip` (31), as today's cards sit under the clips.
  - `.board-card[hidden] { display: none }`.
  - `.board-card-face`: `position: absolute; left/right: calc(var(--art) * 4); bottom: calc(var(--art) * 2); max-height: calc(var(--board-h) - var(--save-h) - var(--sheet-top) - var(--art) * 2)`, a flex column with gap `calc(var(--art) * 4)`, padding 7 art px, the Barlow face, and `overflow: hidden`.
  - The rise: `animation: board-card-rise 0.24s steps(6)` from `translateY(calc(100% + var(--art) * 2))`, off under `prefers-reduced-motion`. The reduced-motion test in `style.test.ts` already lists every board animation.
  - `.board-card-title` (`--board-type-22`, `--board-ink`, uppercase as the sheet title); `.board-card-line` (`--board-type-14`, `--board-ink`, wraps); `.board-card-line.is-quiet` (`--board-ink-2`); `.board-card-big` (`--board-type-40`, `--board-amber`, `.board-num`'s face); `.board-card-art` (`image-rendering: pixelated`, centred); `.board-card-foot` (column, gap 8px); `.board-card-pair` (two columns, 8px); `.board-card-plate` (`width: 100%`).
- **Tokens** (`tokens.css`): `--board-type-40: 40px`; `--board-shade: rgba(5, 6, 7, 0.62)` (the plate ink at 62%).

- [ ] **Step 1: Write the failing tests.**
  - `board-interaction.test.ts`, in `describe("the settle")` and `describe("the stack")`:
    - `"settles a card for 400ms after it opens"`: open `welcome` at 1000. A finger press on `{ layer: "welcome", id: "go" }` with `pressedAt` 1100 is `ignore-early`, and one at 1450 is `act`. A keyboard press at 1100 is `act`.
    - `"a card opens on top and closes only itself"`: open `buys`, then `conflict`, then `update`, then close `conflict` (`by: "program"`). The stack is `["buys", "update"]`, and the update still settles from its own open.
    - `"a card's page settles it again"`.
    - `"a card is not a drawer"`: `drawerOpen` is false with only cards up.
    - `"a finger's close of a card reveals nothing"`: `revealed` is undefined.
  - `board-card.test.ts` (`// @vitest-environment happy-dom`, a real `createBoardHost` with an injected clock, as `board-drawer.test.ts` does):
    - `"builds a shaded dialog with a framed face"`: `div.board-card.welcome-back[data-card=welcome]`, `role=dialog`, `aria-modal=true`, `aria-labelledby` = the title id, hidden; the face carries the frame skin.
    - `"show tells the model and focuses once"`: `show(true, plate)` puts `welcome` on `board.view().stack` and focuses the plate. A second `show(true)` neither sends nor refocuses. `show(false)` takes it off and hides it, and `cardUp(root)` follows.
    - `"a plate acts only past the settle"`: a finger click 100ms after `show(true)` does not call `act`; one at 450ms does. A keyboard click (detail 0) at 100ms does.
    - `"page starts the settle again"`.
    - `"cardLine writes only when the words change"` (a `MutationObserver` sees one change for two equal writes).
    - `"cardArt draws at the asked size"`: `width` and `height` are 152 for 152.
  - `style.test.ts`:
    - `BOARD_SELECTORS` gains `.board-card`, `.board-card-face`, `.board-card-title`, `.board-card-line`, `.board-card-big`, `.board-card-foot` and `.board-card-plate`;
    - a new case, `"stops a board card at the save line"`: the `.board-card` rule's height is `calc(var(--board-h) - var(--save-h))`;
    - `"keeps the save line and its drawer above every overlay"` also reads `.board-card`'s z-index (10).
- [ ] **Step 2:** `npx vitest run src/board-interaction.test.ts src/board-card.test.ts src/style.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The live screen is unchanged: no panel uses the shell yet. knip may flag the shell's exports as unused until Task 3. If it does, land Task 1 and Task 3 in one push (Risks). Do not add a knip ignore.
- [ ] **Step 4:** Run the three test files, then `npm run gate -- fast`.
- [ ] **Step 5: Commit** `The board's model settles cards and closes each on its own, and one board card shell: a shaded dialog with a framed face and big plates (#464)` and push.

### Task 2: The cards' views

**New:** `src/card-views.ts`, pure, with no DOM and no art. `src/card-views.test.ts`.

**Extends:** `src/screen-words.ts` (the words in Copy, moved from their literals), `src/screen-words.test.ts`.

**Produces:**

```ts
/** The welcome card has news: an away haul, the crew grew, an engineer stepped up, or someone came home. */
export function welcomeNews(view: ProgressSnapshot): boolean;

export interface WelcomeView {
  readonly title: string;
  /** The away haul, when there was one. */
  readonly away:
    | {
        readonly mined: string; // "+1.2M stones"
        readonly gone: string; // "You were gone 9h. … ×1.25."
        readonly cheer: string; // awayCheerWords(awayMs, band)
        readonly materials:
          { readonly words: string; readonly first: MaterialId } | undefined;
      }
    | undefined;
  readonly crew: string | undefined; // crewGrewWords
  readonly engineer: string | undefined; // ENGINEER_WELCOME, only under an away or crew line
  readonly returns: readonly string[]; // cameBack(...)
  readonly layers: readonly string[]; // layerWelcomeWords, skipping undefined
  readonly crafts: readonly string[]; // fitted.line
  readonly homecoming: boolean; // returns.length > 0
}
/** What the welcome card shows now, or undefined while it has nothing to say. */
export function welcomeView(view: ProgressSnapshot): WelcomeView | undefined;

export type ArrivalCard =
  | {
      readonly kind: "layer";
      readonly band: LayerId;
      readonly words: LayerCardWords;
    }
  | {
      readonly kind: "craft";
      readonly recipe: RecipeId;
      readonly line: string;
    };
/** The layer card, else craft done; neither while the welcome has news or a relic is revealed. */
export function arrivalCard(view: ProgressSnapshot): ArrivalCard | undefined;
```

`welcomeView`'s title follows today's chain exactly: away, else crew, else the engineer, else `Welcome home` for returns, else the away title. The engineer line, the crew prefix and the heart sentence follow today's conditions, line for line (`welcome-panel.ts` 96–186). `materials.first` is the first `MATERIALS` id with a positive count in `report.materials`, so the line's icon names the first material its words name. Check this against `awayMaterialsWords`' order.

- [ ] **Step 1: Write the failing tests** (`card-views.test.ts`, on `ProgressSnapshot` fixtures from `src/test-fixtures.ts`):
  - `welcomeNews`: false on a plain snapshot; true for each of away, crew, engineer and a homecoming.
  - `welcomeView`:
    - undefined with no news;
    - the four titles;
    - `+1 stone` and `+1.2M stones`;
    - the gone line with and without the heart (`×1.25`, `×1.5`);
    - the crew line alone and under an away (`Your crew grew: ` prefix);
    - the engineer line only under an away or crew;
    - two returns in order;
    - a layer with no welcome words skipped;
    - two crafts;
    - `materials` undefined with no materials, and `first` is `iron` for `{ clay: 0, iron: 3 }`.
  - `arrivalCard`:
    - undefined while the welcome has news or `revealed` is set;
    - the first arrived layer's words;
    - craft done only with no layer;
    - undefined when neither.
  - `screen-words.test.ts`: `crewGrewWords(1, true)` is `1 worker joined to run your machines.`; `crewGrewWords(3, false)` starts `Your crew grew: `; `awayMinedWords` and `awayGoneWords` as above.
- [ ] **Step 2:** `npx vitest run src/card-views.test.ts src/screen-words.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The live panels still compute their own until Task 3.
- [ ] **Step 4:** Run both files, then `npm run gate -- fast`.
- [ ] **Step 5: Commit** `What the welcome, layer and craft-done cards show, as pure views, with one rule for when the welcome has news (#464)` and push.

### Task 3: Welcome back, layer arrival and craft done open on the board

This is the first swap. The three panels, their CSS, every unit test and every browser check that reads these three cards change in this task, so each screen's checks stay green here (`superpowers.md`).

**Extends:**

- `src/welcome-panel.ts`, `src/arrival-panel.ts`: rebuilt on `createBoardCard`;
- `src/screen-panels.ts` (`createEarlyCards` passes `ctx.board` and drops the old art);
- `src/screen-context.ts`, `src/main.ts`, `src/mountain-screen.harness.ts` (`lanternUrl`, `mountainUrl` and `stoneUrl` go if knip says so);
- `scripts/visual/kit.mjs` (`coversBoard`), `scripts/visual/measure.mjs` (the board lists, and `cardFacts`).

**Files:**

- Modify (src): `src/welcome-panel.ts`, `src/arrival-panel.ts`, `src/screen-panels.ts`, `src/screen-context.ts`, `src/main.ts`, `src/style.css`, `src/board.css`, `src/screen-words.ts` (`fieldLogClose` → `BACK_TO_THE_MOUNTAIN`), `src/mountain-screen.harness.ts`, `vite.config.ts`.
- Modify (tests): `src/mountain-screen.test.ts`, `src/mountain-screen-depths.test.ts`, `src/mountain-screen-crew.test.ts`, `src/welcome-legacy-teach.test.ts`, `src/engineers-teach.test.ts`, `src/style.test.ts`, `src/token-check.test.ts` (its `#craft-notice-line` sample, if it reads style.css).
- Modify (ceilings): `scripts/function-ceilings.json`, `scripts/complexity-ceilings.json`.
- Modify (browser): `scripts/visual/kit.mjs`, `scripts/visual/measure.mjs`, `scripts/visual/cards.mjs`, `scripts/visual/notices-saves.mjs`, `scripts/visual/running-and-guards.mjs`, `scripts/ui-audit.mjs`, `scripts/play.mjs`, `tools/browser/fixtures.ts`, `tools/browser/fixtures.test.ts`.

**Produces:**

- **`createWelcomePanel({ progress, getView, board })`** returns `{ welcome, render }`.
  - The card is `createBoardCard({ name: "welcome", hook: "welcome-back", titleId: "welcome-back-title", board })`.
  - Its body, built once, in today's order:
    - `p.board-card-big.welcome-mined`;
    - `cardLine("welcome-detail")`;
    - `div.welcome-ore` (`cardArt(32)` and `span.welcome-ore-text` with `.welcome-ore-line` and `.welcome-ore-use`);
    - `cardLine("welcome-cheer is-quiet")`;
    - `cardLine("welcome-crew")`;
    - `cardLine("welcome-engineer")`;
    - `div.welcome-returns`, `div.welcome-layers`, `div.welcome-crafts` (lines `p.board-card-line.welcome-return`, `.welcome-layer`, `.welcome-craft`).
  - Its plate is `card.plate(BACK_TO_THE_MOUNTAIN, "go", "welcome-continue", () => progress.dismissAway())`.
  - `render` is `paint(card, parts, welcomeView(getView()))`: a few small painters (`paintAway`, `paintLines`, `paintNews`), each under complexity 15. Then `card.show(view !== undefined, plate)`.
  - `root` keeps `is-homecoming` (`mark`).
  - `createWelcomePanel` is about 70 lines.
- **`createArrivalPanel({ progress, getView, board })`** returns `{ layer, notice, render }`.
  - Two cards: `layer` (`hook: "layer-arrival"`, `titleId: "layer-arrival-title"`) and `craft` (`hook: "craft-notice"`, `titleId: "craft-notice-line"`; the fitted line is its title, as today's dialog is labelled by it).
  - The layer card:
    - art `cardArt(152)` with `mineView(band)`;
    - `cardLine("layer-evocative")`, `cardLine("layer-advice")`, `cardLine("layer-sketch is-quiet")`;
    - plate `LAYER_DIG` (`layer-dig`), calling `dismissLayer`.
  - The craft card:
    - art from `craftArt(recipe)`, which replaces `noticeArtFor`. It is an exhaustive `switch`, as today's, over the board art in the Art table, and returns `{ src, px }`;
    - plate `CRAFT_DONE_BUTTON` (`craft-accept`), calling `dismissCraft`.
  - `render` reads `arrivalCard(getView())` and shows one card or neither. `tierArt`, `mountainUrl`, `oreUrl` and `lanternUrl` leave its options.
- **`createEarlyCards`** passes `board: ctx.board`, and no art.
- **CSS.**
  - `style.css` removes `.welcome-back`, `.layer-arrival` and `.craft-notice` from the fixed-overlay, `[hidden]` and card-face lists. It removes every rule that names only `.welcome-*`, `.layer-card`, `.layer-art`, `.layer-evocative`, `.layer-advice`, `.layer-sketch`, `.notice-card`, `.notice-art`, `#craft-notice-line`, `.craft-accept`, `.layer-dig` or `.welcome-continue`, after a `grep` shows nothing else uses them. It keeps the shared selectors' other members (`.relic-reveal`, `.shelf-dialog`, `.start-over`, `.engineers-dialog`, `.saved-copies`, `.reveal-*`, `.shelf-close`, `.menu-close`, `.engineers-close`).
  - `board.css`: the three leave the "stops at the save line" list. Their board rules go under `/* ---------- the board cards (#464) ---------- */`: `.welcome-ore` (a row: icon, then the two spans), `.welcome-returns` / `.welcome-layers` / `.welcome-crafts` (columns, gap 2 art px), and `.board-card[data-card=layer] .board-card-art` (184×152).
- **Ceilings:** remove the two `welcome-panel` entries (Global Constraints).
- **Floors:** `vite.config.ts` gains `src/card-views.ts`, `src/board-card.ts` and `src/arrival-panel.ts`, as Global Constraints says.

- [ ] **Step 1: Write the failing tests.**
  - `mountain-screen.test.ts`, `-depths`, `-crew`, `welcome-legacy-teach.test.ts`, `engineers-teach.test.ts`:
    - the selectors they read stay. Only `.welcome-card` → `.welcome-back .board-card-face`, and `.layer-card` → `.layer-arrival .board-card-face`;
    - their `.welcome-continue` / `.layer-dig` / `.craft-accept` clicks are happy-dom `click()`s, detail 0, so keyboard presses, never early. Any that dispatch a pointer event first move past the settle with the harness's tap clock.
  - New cases in `mountain-screen.test.ts` (on the harness, with fake timers and an injected `tapClock`):
    - `"the welcome card is a board card"`: `.board-card.welcome-back[data-card=welcome]` with a `.board-card-face`, and `board.view().stack` holds `welcome`.
    - `"a finger on Back to the mountain in the first 400ms does nothing"`: a `pointerdown` and a click 100ms after the card shows leave `view.away` set. At 450ms it clears.
    - `"welcome, then the layer card, each with its own settle"`: dismiss the welcome by keyboard. A finger press on `.layer-dig` 100ms later keeps the layer card up.
    - `"the layer card shows the band's view"`: `.layer-arrival .board-card-art`'s `src` is `mineView("granite")`, at 184×152.
    - `"craft done shows the board art for the recipe"`: `iron-rails` → `mach-cart.png` at 64; `crystal-lamp` → `relic-lantern.png` at 48; `axle-grease` → `res-stone.png` at 32.
    - `"an open drawer closes when the layer card opens"`: Buys open, a dig breaks into the Granite, Buys is shut and the stack is `["layer"]`.
  - `style.test.ts`: `.welcome-back`, `.layer-arrival` and `.craft-notice` leave `OVERLAYS`, `REQUIRED_SELECTORS` and the "lays over the game" list, and so do `.welcome-return` and `.welcome-card`. A new case: `"keeps no rule for today's welcome, layer and craft cards: they are board cards now (#464)"`. It follows the Workshop's (#374) pattern on `/\.(welcome-card|layer-card|layer-art|notice-card|notice-art)\b|#craft-notice-line/`. `BOARD_SELECTORS` gains `.welcome-ore`, `.welcome-returns`, `.welcome-layers` and `.welcome-crafts`.
- [ ] **Step 2:** `npx vitest run src/mountain-screen.test.ts src/mountain-screen-depths.test.ts src/mountain-screen-crew.test.ts src/welcome-legacy-teach.test.ts src/engineers-teach.test.ts src/style.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the panels, the wiring, the CSS, the ceilings and the floors. `npx knip` removes what it names (likely `ScreenArt`'s three URLs, `fieldLogClose`'s old name and `noticeArtFor`).
- [ ] **Step 4: The browser checks, in this task.**
  - **`kit.mjs#coversBoard`:** it accepts a `position` of `fixed` or `absolute`. Its point is that the overlay covers the board from its top to the save line, with the line on top. Today's other cards stay fixed, and both still pass.
  - **`measure.mjs`:**
    - `BOARD_TARGETS` gains `.board-card:not([hidden]) .board-card-plate` and `.board-card:not([hidden]) .save-card`;
    - `BOARD_PARTS` and `BOARD_ART` gain `.board-card:not([hidden])`;
    - `BOARD_LEGENDS` gains `.board-card-title`, `.board-card-line`, `.board-card-big`, `.welcome-ore-line`, `.welcome-ore-use` and `.board-platebtn-text` under `.board-card`;
    - a new `cardFacts(page, name)` reads the open `.board-card[data-card=name]`:
      - the face's box in board px (top ≥ 178, bottom = save top − 4, left 8, right 416, at 424 wide);
      - `face.scrollHeight <= face.clientHeight + 1`;
      - each plate's box (≥ 48 tall, inside the face);
      - the title and the body's text;
      - the focused element's class.
  - **A table** in `notices-saves.mjs` named `board cards ${JSON.stringify(viewport)} ${scenario.name}`, at `PHONE` and the three `PCS`, `per: "scenario"`. Its scenarios in this task:
    - `welcome` (`playAwaySave()`);
    - `welcome fold` (section 16's fold save);
    - `welcome find` (`toolHomeSave`);
    - `layer` (section 16's Granite save, through the reveal);
    - `craft` (section 16's craft save).

    For each scenario it checks:
    - `coversBoard`, `noScroll` and `cardFacts`' box and no-scroll;
    - `boardTargets`, filtered to the card;
    - `boardTextSizes(page, ".board-card:not([hidden])")`;
    - `boardArtAt2x(page, ".board-card:not([hidden])", ".board-card:not([hidden])")`;
    - `boardContrast(page, <the card's legends>)`;
    - the focus on the card's plate.

    Shots: `card-${name}-${size}`.

  - **Sections retargeted, labels kept:**
    - `cards.mjs` sections 4, 5 and 13 keep their words checks and `coversBoard`. Their `page.tap(".welcome-continue")` waits past the settle first (`await new Promise((r) => setTimeout(r, 500))` on real clocks, as the drawer checks do with `PAST_SETTLE_MS`). `welcomeCard`'s close box asks for 48 tall, not 44.
    - `notices-saves.mjs` section 16: `fitOf(page, ".layer-card", …)` → `fitOf(page, ".layer-arrival .board-card-face", …)`, and the same for the welcome and the notice. `fitOf`'s type floor is the board's 13px, not 14.4. Its boxes floor is 48. The words checks are unchanged.
    - `running-and-guards.mjs` section 24 `welcome`: unchanged (`shown(".welcome-back")`).
    - `drawers.mjs` ledger states: unchanged (a keyboard click on `.welcome-continue`).
  - **`ui-audit.mjs`:**
    - the dialog roots at :479 gain `.board-card-face`, and lose `.save-conflict-sheet` in Task 4;
    - the card roots at :553–571 read `.board-card-face` for the welcome, layer and notice;
    - the targets list at :493–496 is unchanged (the hooks stay);
    - the `welcome-back`, `layer-arrival`, `workshop-craft-done` and `engineers-homecoming` captures wait for `.board-card[data-card=…]:not([hidden])`.
  - **A play save for craft done.** Add `playCraftSave()` to `tools/browser/fixtures.ts`: section 16's craft save, with the bench ending 3s after `lastSeen`. Pin it in `fixtures.test.ts`'s `EXPECTED_AUDIT` and `calls()`. Add `crafted: { note: "a craft finishing three seconds after opening: the craft-done card", save: playCraftSave }` to `SAVES` in `scripts/play.mjs`.
  - **Run:**
    - `VISUAL_ONLY='^board cards \[424,924\]' npm run visual`;
    - then `VISUAL_ONLY='^board cards' npm run visual` at every size;
    - then `VISUAL_ONLY='^section (4 |5 |13 |16 |24 )' npm run visual`;
    - then `VISUAL_ONLY='^keys and drawers \[424,924\] ledger states$' npm run visual` (the away click).
- [ ] **Step 5: Play** at 424×924, one run each, looking at the phone shots and `log.txt` (no page error; the save line is `data-kind` local):
  - `npm run play -- --save away wait:.board-card[data-card=welcome] wait:500 tap:.welcome-continue` (the haul, the cheer, then the board);
  - `npm run play -- --save crew wait:.board-card[data-card=welcome]` (`Your crew grew` on a v4 save, if `crewV4Save` brings it; otherwise read section 4's shot and say so);
  - `npm run play -- --save edge tap:.board-window*4 wait:.board-card[data-card=layer] wait:500 tap:.layer-dig` (`You broke into the Granite!`, the Granite view at 184×152, `Dig on`);
  - `npm run play -- --save crafted wait:.board-card[data-card=craft] wait:500 tap:.craft-accept` (the fitted line, the cart at 64);
  - `npm run play -- --save edge tap:.board-window*4 wait:.board-card[data-card=layer] tap:.layer-dig` (the same tap at once does nothing: the card stays);
  - `npm run play -- --save mid tap:.board-key[data-key=buys] wait:.board-sheet[data-sheet=buys].is-open` (no card: the drawers are unchanged).
- [ ] **Step 6:** `npm run gate -- fast`, `npx knip` and `npm run functions`. Expected: PASS, with no `welcome-panel` entry in either ceilings file.
- [ ] **Step 7: Commit** `Welcome back, the layer card and craft done open as board cards, each settling under the finger, and the welcome panel comes under the function limits (#464)`. In the body, list the removed ceiling entries and every check whose floor moved (44 → 48 px, 14.4 → 13 px). Push.

### Task 4: The save conflict, the other tab and the update open on the board

The second swap. The three panels, their CSS, their tests, their checks, and the two play hooks that let each be seen in play, all change in this task.

**Extends:**

- `src/save-conflict-panel.ts`, `src/screen-prompts.ts`: rebuilt on `createBoardCard`;
- `src/mountain-screen.ts` and `src/screen-panels.ts`: pass `board`;
- `src/boot.ts` (`parseBootOptions().previewUpdate`) and `src/main.ts` (the dev-only call);
- `src/play-plan.ts` (`--tabs`) and `scripts/play.mjs`.

**Files:**

- Modify (src): `src/save-conflict-panel.ts`, `src/screen-prompts.ts`, `src/mountain-screen.ts`, `src/screen-panels.ts`, `src/boot.ts`, `src/main.ts`, `src/play-plan.ts`, `src/screen-words.ts` (`UPDATE_TITLE`, `UPDATE_RELOAD`), `src/style.css`, `src/board.css`, `vite.config.ts`.
- Modify (tests): `src/mountain-screen.test.ts`, `src/mountain-screen-crew.test.ts`, `src/progress-store.test.ts` (only if it reads a selector), `src/boot.test.ts`, `src/play-plan.test.ts`, `src/style.test.ts`.
- Modify (browser): `scripts/visual/notices-saves.mjs`, `scripts/ui-audit.mjs`, `scripts/play.mjs`.

**Produces:**

- **`createSaveConflictPanel({ progress, now, board, requestRender })`** returns `{ root, render }`.
  - The card: `name: "conflict"`, `hook: "save-conflict"`, `titleId: "save-conflict-title"`.
  - The body: `cardLine("save-conflict-body")` (`SAVE_CONFLICT_BODY`).
  - Then `div.board-card-pair.save-pair` with two sides. Each side is `button.save-card` in the inset skin, with:
    - an `i.board-lamp`, painted `green` when selected and `off` otherwise, through `frameX(lamp, LAMP_FRAME[…], LAMP_PX)`;
    - `span.board-card-line.title` (`SAVE_CONFLICT_PHONE` / `SAVE_CONFLICT_OTHER`);
    - six `span.board-card-line` (device, depth, pocket, machines, crew, played), from `saveCardLines`;
    - `aria-pressed`.
  - Then `cardLine("save-conflict-error")`.
  - The foot:
    - `card.plate(SAVE_CONFLICT_PLAY, "play", "save-conflict-play", …)`, which shows the confirm and calls `card.page()`;
    - `div.save-conflict-confirm`, holding `cardLine` (`SAVE_CONFLICT_CONFIRM`) and `card.plate(SAVE_CONFLICT_PLAY, "commit", "save-conflict-commit", () => void progress.chooseSave(selected))`.
  - The sides press through `pressOnBoard` on layer `conflict` (ids `phone`, `other`), so a double tap on a side never reaches `Play this one`.
  - `render(conflict, elsewhere)` keeps today's `seen` key, pre-selection, `confirming` reset and error line. `card.show(conflict !== undefined && !elsewhere, play)`.
  - `.scrim`, `.sheet`, `.card`, `.label` and `.go` leave this panel. They stay in style.css for Saved copies (B7c).
- **`createUpdatePrompt(board, onShown)`** returns the card's root (`name: "update"`, `hook: "update-prompt"`, `titleId: "update-prompt-title"`). It has `UPDATE_TITLE` and one plate, `card.plate(UPDATE_RELOAD, "reload", "update-reload", () => globalThis.location.reload())`. Its `UPDATE_SHOWN` listener calls `card.show(true, reload)`, then `onShown()`. `showAppUpdate(root)` only dispatches the event, so `showCard` happens in one place.
- **`createOtherTab(progress, board)`** returns `{ root, paint }` (`name: "other-tab"`, `hook: "other-tab"`, `titleId: "other-tab-title"`). It has `OTHER_TAB_TITLE`, `cardLine("other-tab-body")` and `card.plate(OTHER_TAB_PLAY, "play", "other-tab-play", () => void progress.playHere())`. `paint(elsewhere)` is `card.show(elsewhere, play)`.
- **Dev hooks**, so all six cards can be seen in play:
  - `parseBootOptions` gains `previewUpdate: params.get("update") === "shown"`.
  - `main.ts`, after `mountMountainScreen`: `if (import.meta.env.DEV && parseBootOptions(window.location.search).previewUpdate) showAppUpdate(root);`. It is ignored outside dev, as every other hook is.
  - `play-plan.ts` gains `--tabs <1|2>` (default 1). With 2, `scripts/play.mjs` opens the save with `openPair` (`tools/browser/harness.ts`) and runs the actions and shots on the second page, which shows the other-tab card. `PLAY_USAGE` names it.
- **CSS.**
  - `style.css` removes `.update-prompt`, `.other-tab` and `.save-conflict` from the overlay lists, and every rule that names only `.other-tab-*`, `.update-card`, `.update-reload`, `.save-conflict-*` or `.save-pair`, after a `grep`. `.save-card` stays only if Saved copies uses it (`grep -n "save-card" src/saved-copies-panel.ts`). Otherwise it goes too.
  - `board.css`: the three leave the save-line list. New rules: `.save-card` (inset skin, a column, lamp top-left, padding 4 art px, `--board-type-13` lines, ellipsis), `.save-conflict-confirm` (column, gap 8px) and `.save-conflict-error` (`--board-rust`).
- **Floors:** `src/save-conflict-panel.ts` (Global Constraints). `screen-prompts.ts` stays 100/100/100/100.

- [ ] **Step 1: Write the failing tests.**
  - `mountain-screen.test.ts` / `-crew` (the conflict, other tab and update cases):
    - selectors unchanged except `.save-conflict-sheet` → `.save-conflict .board-card-face`;
    - `"the conflict card is a board card and pre-selects the side with more stones"`;
    - `"a double tap on Play this one never commits"`: `Play this one` by finger past the settle, then a finger on `.save-conflict-commit` 100ms later, and `chooseSave` is not called. At 450ms it is.
    - `"a tap on a side selects it and lights its lamp"`;
    - `"the other-tab card plays here past the settle"`;
    - `"showAppUpdate opens the update card on top, and closes an open drawer"`: Buys open, `showAppUpdate(root)`, Buys shut, the stack is `["update"]`, and focus is on `.update-reload`;
    - `"conflict and update up together, the conflict resolves, the update stays"`.
  - `boot.test.ts`: `parseBootOptions("?update=shown").previewUpdate` is true, and false otherwise.
  - `play-plan.test.ts`: `--tabs 2` parses; `--tabs 3` is an error that names `1 or 2`; the default is 1; `PLAY_USAGE` lists it.
  - `style.test.ts`: the three leave `OVERLAYS`, `REQUIRED_SELECTORS` (with `.update-reload`, `.other-tab-play` and `.save-conflict-play`) and the "lays over the game" list. A new case: `"keeps no rule for today's conflict, other tab and update cards (#464)"` on `/\.(update-card|other-tab-card|save-conflict-sheet|save-pair)\b/`. `BOARD_SELECTORS` gains `.save-card`, `.save-conflict-confirm` and `.save-conflict-error`.
- [ ] **Step 2:** `npx vitest run src/mountain-screen.test.ts src/mountain-screen-crew.test.ts src/boot.test.ts src/play-plan.test.ts src/style.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the panels, the wiring, the hooks, play and the CSS. `npx knip`.
- [ ] **Step 4: The browser checks, in this task.**
  - **The `board cards` table** gains three scenarios:
    - `conflict` (`search: "?saves=two"`);
    - `update` (`search: "?update=shown"`);
    - `other tab`, at the phone only, through `openPair` on the second page, as section 17.

    They have the same expectations as Task 3's. The conflict also checks that both sides sit inside the face, 8px apart, each ≥ 48 tall, with no side line spilling (`scrollWidth <= clientWidth`).

  - **Section 17** (the other tab): its words checks, `coversBoard`, `noScroll` and the Play here round trip are unchanged. The button height check is ≥ 48, as today. Its `second.tap(".other-tab-play")` waits past the settle first.
  - **Section 18** (the conflict): `sheetFits` reads `.save-conflict .board-card-face` (`scrollHeight <= clientHeight + 1`). `page.click(".save-conflict-play")` waits past the settle first. The confirm check is unchanged. Add: a click on `.save-conflict-commit` at once after the confirm shows leaves `.save-conflict` up (the page's settle).
  - **`ui-audit.mjs`:**
    - `save-conflict-rest` and `-selected` wait for `.board-card[data-card=conflict]:not([hidden])`;
    - `other-tab-playing` waits for `[data-card=other-tab]`;
    - `update-available` opens `?update=shown`, instead of writing `hidden = false` by hand;
    - the dialog roots at :479 drop `.save-conflict-sheet`.
  - **Run:**
    - `VISUAL_ONLY='^board cards \[424,924\] (conflict|update|other tab)$' npm run visual`;
    - then `VISUAL_ONLY='^board cards' npm run visual`;
    - then `VISUAL_ONLY='^section (17|18) ' npm run visual`.
- [ ] **Step 5: Play** at 424×924, one run each, looking at the phone shots and `log.txt`:
  - `npm run play -- --search ?saves=two wait:.board-card[data-card=conflict]` (both sides, `This phone` lit);
  - `npm run play -- --search ?saves=two wait:.board-card[data-card=conflict] wait:500 tap:.save-card[data-side=other] wait:500 tap:.save-conflict-play` (the other side lit, then the confirm with `saved for 7 days`);
  - `npm run play -- --tabs 2 --save mid wait:.board-card[data-card=other-tab]` (`Playing in another tab`, `Play here`);
  - `npm run play -- --tabs 2 --save mid wait:.board-card[data-card=other-tab] wait:500 tap:.other-tab-play` (the card goes, and the board plays here);
  - `npm run play -- --search ?update=shown --save mid wait:.board-card[data-card=update]` (`Update available`, `Reload`);
  - `npm run play -- --search ?update=shown --save mid wait:.board-card[data-card=update] wait:500 tap:.update-reload` (the page reloads with no page error; the dev hook shows the card again after the reload, which is expected).
- [ ] **Step 6:** `npm run gate -- fast`, `npx knip` and `npm run functions`. Expected: PASS.
- [ ] **Step 7: Commit** `The save conflict, the other tab and the update open as board cards, and play can show each (#464)` and push.

### Task 5: Docs and proof

**Files:** `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/ART.md`, `docs/ui-audit.md` (and its shots under `docs/ui-audit/`), `docs/design-intent.md` (only if a line still describes a card's look: `grep -n -i "card" docs/design-intent.md`).

- [ ] **DESIGN.md:**
  - Line 85: the "bottom sheet" for two saves becomes a board card with the two sides as inset plates, the selected one lit.
  - Line 118: drop "The welcome-back, craft-done and save cards still open on their own as today's cards until B7b (#464)".
  - Lines 125, 336, 583 and 585: the same words, now on a board card. The layer card's art is the new band's window view.
  - A new paragraph under the board: the six cards, and the shell they share:
    - the shade, the face rising from the save line into the drawer's box, the 6 hard steps;
    - each card's settle, and the conflict's confirm settling again;
    - the order the self-opening cards keep;
    - that a card closes an open drawer and never covers the save line.
- [ ] **ARCHITECTURE.md:**
  - Lines 106 and 119: the other tab and update cards are board cards (`screen-prompts` on `board-card`).
  - Line 127: the panels list notes `welcome-panel` and `arrival-panel` on the shell.
  - Line 144: `card-state` is written by `board-card`'s `show`.
  - Line 242: a card's open and close are model events, and a card closes only itself.
  - Lines 306–307: drop "the welcome-back, craft-done and save cards are still today's until B7b (#464)".
  - Line 356: welcome-back → `welcome-panel` on `board-card`, with its views in `card-views`.
  - Lines 634–638: the layer card and craft done are picked by `card-views#arrivalCard`.
  - Line 745: the welcome checks are the `board cards` table.
  - In the visual-check notes: the `board cards` table, `cardFacts`, and that `coversBoard` takes absolute board overlays.
  - The dev hooks list: `?update=shown`. Play: `--tabs 2`.
- [ ] **ART.md** line 23: the layer card's art is the band's mine view (`mine-window.ts#mineView`). `mountain.png` is the app icon's source only, if that is now so (`grep -rn "mountain.png" src scripts index.html`).
- [ ] **ui-audit.md:**
  - Rows 37 (craft done: drop "Unchanged until B7"), 40, 47, 48, 59, 60, 62 and 63 are rewritten for the board cards, with the new shots.
  - Row 62 drops "Own card and `.other-tab-play`, not the shared `.go` button".
  - Row 63 drops "Own `.update-card`".
  - Rows 111 and 121 are unchanged in meaning.
  - Refresh the shots with `npm run audit:ui`.
- [ ] Run `npm run gate -- full` in the background, once, and wait for it. Read `.gate/logs/<step>.log` for any FAIL and fix it, then run the full gate again only for that.
- [ ] **Commit** `The docs describe the board cards (#464)` and push. Then `npm run gate -- signoff`, then the ship-sitting skill.
  - The PR body lists: the Rulings below; "new copy: none"; "art: none"; the removed ceiling entries; and the checks whose floors moved to the board's (13px, 48px).
  - The PR says "Closes #464" and "Part of #375".
  - The github-issues skill keeps B7c (#465) blocked-by #464 until the merge.

## Rulings

Given by the issue and the controller:

- **Six cards, one shell, in this one sliver.** The Ledger (B7a), the relic cards, Saved copies and Pass the mine (B7c), and the PC desk (B8) are out.
- **The two welcome ceilings go in this PR** (#422).

Added by this plan:

- **A card is not a drawer, so it has its own small shell** (`board-card.ts`), reusing the drawer's parts. Reasons are under Architecture. B7c's relic reveal, detail, Legend, Saved copies and Pass the mine take the same shell, so it is shaped for a title, art, lines, and one or more plates.
- **Cards press through the board's model.** A card that opens by itself lands under a finger that was aimed at the board: a dig crossing a band, a craft finishing on a tick, the launch. Its big plate sits where the rail keys are. Today the second tap of such a tap can dismiss a card unseen. The conflict's confirm can even be committed by a double tap on `Play this one`. The settle is B4's rule, applied to six more layers. The model change is three lines plus tests: `CardId`, `isCard` in `early()`, and an own-entry close.
- **A card closes only itself.** The stack's `slice` rule is right for a save drawer or note over a drawer. It is wrong for two independent cards (conflict and update).
- **Hooks stay.** Root classes, title ids, line classes and button classes keep today's names, so the unit tests, play commands, the audit and B7a's ledger check keep working. Only the inner card faces go. This keeps Task 3's and Task 4's test churn to the face selector, and to the floors that become the board's.
- **The box.** The face rises from 4px above the save line and takes its height from its content. Its top never rises above the drawer's (`--sheet-top`, 178 at 424×924), and it is never taller than the drawer's box (686 board px). A short card (update, other tab) is short and sits by the thumb. A tall one (the welcome fold) reaches the drawer's top. No spare plate: the face is never taller than its content, so it is never bare frame.
- **The shade.** The board above the face dims at 62% of the plate ink (`--board-shade`). This stands in for today's amber radial gradient, which has no place in the board skin. The shade takes every tap, as today's full-screen card did. A tap on the shade does nothing (no scrim close), as today. The save line stays above it.
- **No Escape and no scrim close.** Today's six cards close only by their buttons. That stays.
- **The rise is the drawer's 6 hard steps,** as a keyframe animation, since a card goes from `display: none`. There is none under reduced motion.
- **The big number.** "One big number, one button" (DESIGN line 125): the haul is `--board-type-40` amber in the mono face. It is a new type token, the only new size.
- **Art.**
  - The layer card shows the new band's own window view at 2× (184×152). DESIGN line 583 asks for "the new rock as art", and the board already has the four views.
  - Craft done shows the board's machine, lantern or stone icon for what was fitted. This is today's choice of picture, in board art.
  - The welcome's material line shows the first material's icon.
  - Today's non-board art leaves these cards. No PixelLab piece is needed.
- **The craft card keeps no title of its own.** Its fitted line is its heading, as today's dialog is labelled by it.
- **The conflict's sides are inset plates with a lamp,** green when selected. They replace today's gold border. They are not drawer rows: seven lines do not fit a 76px row.
- **Each check's floors become the board's.** Text ≥ 13px (was 14.4 in `fitOf`), targets ≥ 48 (was 44 in `welcomeCard`), contrast 4.5:1, art at 2×. The board cards join the board's own measured lists, so any board section with a card up measures it too.
- **Seen in play.** Today play cannot reach the other tab or the update. Two small hooks fix that, each built on what exists: `--tabs 2` on `openPair`, and `?update=shown` on `parseBootOptions`, dev only. Craft done gets a `crafted` play save.
- **`fieldLogClose` becomes `BACK_TO_THE_MOUNTAIN`.** It lost its field log in B7a, and the welcome card needs the same words. The other three literals of it wait for B6b and B7c.
- **Relic reveal order is untouched.** `relic-panels.ts` waits on `away` only. B7c may move it onto `welcomeNews`, which is a behaviour change, and so not here.

## Budget

At 424×924 the face may be 686 board px tall: from 178 to 864, less 4px over the save line. Inner width 380, padding 14 top and bottom, gaps 8.

| Welcome, worst case (away + crew + engineer + two returns + a layer + a craft) | Height        |
| ------------------------------------------------------------------------------ | ------------- |
| Padding                                                                        | 28            |
| Title (22px)                                                                   | 28            |
| Big number (40px)                                                              | 48            |
| Gone line (two lines, 14px)                                                    | 38            |
| Material line (32px icon)                                                      | 32            |
| Cheer (two lines)                                                              | 38            |
| Crew line (two lines)                                                          | 38            |
| Engineer line                                                                  | 19            |
| Two returns (two lines each)                                                   | 76            |
| Layer line (two lines)                                                         | 38            |
| Craft line (two lines)                                                         | 38            |
| Plate                                                                          | 54            |
| Eleven gaps                                                                    | 88            |
| **Total**                                                                      | **563 / 686** |

| Conflict                                   | Height        |
| ------------------------------------------ | ------------- |
| Padding, title, body (three lines)         | 28 + 28 + 57  |
| Two sides (seven 13px lines + padding)     | 150           |
| Error (two lines, when shown)              | 38            |
| Play this one, or the confirm line + plate | 54 or 92      |
| Gaps                                       | 40            |
| **Total**                                  | **433 / 686** |

The layer card is padding 28, art 152, title 28, three lines of two (114), plate 54 and five gaps (40), so 416. Craft done, other tab and update are each under 250.

## Risks

- **knip between Task 1 and Task 3.** The shell's exports have no user until Task 3. If knip fails Task 1's commit, land Tasks 1–3 as one push (three commits, one `gate -- fast` at the end). Never add an ignore.
- **Settle timing in the browser checks.** Every check and play run that taps a card's plate right after it appears must wait past 400ms first. On real clocks, a check that forgets fails as "card stays up". That failure is the settle working, not a bug. The table and the retargeted sections all wait. Unit tests click with detail 0 (keyboard), which is never early.
- **`coversBoard` on absolute overlays.** The relic cards (B7c) and Engineers (B6b) stay fixed until their slivers. The helper accepts both, so neither breaks. Pin the change with one `registry.test.mjs`-style unit case if the kit has one, else note it in the PR.
- **The PC sizes.** The face is in board px, so it scales with the board. `boardTargets` reports rendered sizes on a PC, as C4 says, and does not gate them.
- **The conflict sides at 186px.** `Granite, 16.3M deep` and a long device label must fit at 13px. They ellipsize, with the full text on the button's `aria-label`. Section 18 reads the words from `textContent`, so it still passes.
- **Size.** About 6–7 agent hours, like B7a: Task 1 about 1, Task 2 about 1, Task 3 about 2.5, Task 4 about 2, Task 5 about 0.5. If it runs long, split at the Task 3 / Task 4 line:
  - **B7b-1** ships the shell, the views and the three self-opening cards, with both ceilings removed;
  - **B7b-2**, a new issue under #375, blocked by B7b-1, ships the conflict, other tab and update cards with the two play hooks.

  The split is named in the PR, and #464's "Done when" then closes with B7b-2. No other part may split off.
