# The screen's render path and covers from state (I2c-1, #427) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mountMountainScreen` paints the board from one render path. Which card covers what, and when the New sign may show, is decided from state, not from `querySelector`, class or `.hidden` reads.

**Architecture:**

- Cards that open over the board write their shown state through one small module, `src/card-state.ts` (`showCard` and `cardUp`), so the screen asks state rather than the DOM.
- Effect chips record whether they are active in `src/effect-row.ts`.
- The cover and New-sign decisions move into a pure, unit-tested module, `src/screen-cover.ts`. It reads the model's stack through a new `drawerOpen` in `src/board-interaction.ts`.
- Today's `render()` and the 1s tick's separate list become one `paint()`. The store subscription and the tick both call it.

**Tech Stack:** TypeScript, Vitest with happy-dom, and the puppeteer visual check.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part B (the screen), and issue #427. The issue's "Done when" is binding. The code map behind this plan is in the session scratchpad, `i2c-map.md`, and is not committed.

## Global Constraints

- **Ratchet:**
  - Remove `src/mountain-screen.ts#mountMountainScreen>render` from `scripts/complexity-ceilings.json`.
  - Set `src/mountain-screen.ts#mountMountainScreen` in `scripts/function-ceilings.json` to its new exact line count. It must come down from 1077.
  - No new entry in either list.
  - Every function this sliver adds or splits off stays at 150 lines or under and cognitive complexity 15 or under.
  - Check with `node scripts/function-ratchet.mjs --print lines` and `--print complexity`.
- **Exact-ceiling panels:**
  - These functions must stay at net zero lines or fewer: `createWelcomePanel` 178, `createRelicPanels` 363, `createMenuPanel` 292, `createEngineersPanel` 845, `createWorkshopPanel` 550, `createSaveLine` 158, `createMineWindow` 326.
  - A listed function that comes down gets its ceiling lowered to the new exact value in the same commit.
  - Prettier at printWidth 80 can wrap a longer `return { … }` onto several lines. Run `npm run functions` after each panel edit.
- **Listener order, signal and coverage:**
  - Keep the registration order in `mountMountainScreen`: `saveOnLeave` before the vein's visibilitychange and pagehide; the board note and save line before the New sign's pointerdown and Escape; `progress.subscribe` last.
  - Every new document, window, store or host listener takes `listening`. That is `signal === undefined ? {} : { signal }`. Never `{ signal: undefined }`. The real app passes no signal (`main.ts:40`), so everything must still attach without one.
  - Keep the real 1s `setInterval` as the store's time step. S1 (#414) owns the time step.
  - `BUYS_SETTLE_MS`, `showAppUpdate` and `mountMountainScreen` stay exported from `mountain-screen`. No new module imports `mountain-screen` (`npm run cycles`).
  - Each new `src/*.ts` file gets a coverage floor in `vite.config.ts` at its measured value. The pure ones (`card-state`, `screen-cover`, `screen-chips`) get 100/100/100/100.
- **Workflow:**
  - Commit messages are a plain sentence ending ` (#427)`, with the session's trailers.
  - Never edit `src` while a full gate or visual check runs. Vite watches `src`.
  - Verification ladder: the test file, then `npm run gate -- fast`, then `VISUAL_ONLY` plus `npm run play`, then the full gate once, by the controller, before the PR.

## Review Focus

1. **A card up and a drawer open together.** A card that opens by itself (relic reveal, layer, update prompt, save conflict) closes Buys and Upgrades, and puts the board note and the New sign away. The sign shows once more after the card. Pinned by:
   - `mountain-screen.test.ts:2107`;
   - `mountain-screen-crew.test.ts:1978`;
   - Task 4's update-prompt test.
2. **A note or the save drawer on the model's stack.** Only a drawer counts as "a sheet open". A stack holding only `note` or `save` must not hide the board note or hold the sign. Pinned by Task 4's `drawerOpen` tests.
3. **The tick now paints everything.** The open Upgrades drawer must not reorder (crew `:2060`). The other-tab card must not steal focus each second. Welcome and relic cards must not refocus each second. Pinned by:
   - the existing tests;
   - Task 5's "focus once" test.
4. **A save with no crew mining.** A running boost's chip clock moves each second with no store update. This is the red test of Task 5.
5. **A note replaces the Running list or the vein note.** The replaced body goes back to its hidden park, so the Ledger can show it again. Pinned by the existing Running-now tests and Task 3's `onDrop` test.

---

### Task 1: Cards write their shown state through one module

**Files:**

- Create: `src/card-state.ts`, `src/card-state.test.ts`
- Modify: the show and hide writes of the 17 card roots:
  - `src/welcome-panel.ts`: `welcome`
  - `src/arrival-panel.ts`: `layer`, `notice`
  - `src/relic-panels.ts`: `reveal`, `legend`, `shelf`, `detail`
  - `src/legacy-panel.ts`: `dialog`
  - `src/menu-panel.ts`: `menu`, `confirm`, `fieldLogSheet`
  - `src/engineers-panel.ts`: `sheet`
  - `src/workshop-panel.ts`: `sheet`
  - `src/saved-copies-panel.ts`: `root`
  - `src/save-conflict-panel.ts`: `root`
  - `src/mountain-screen.ts`: `updatePrompt` in `showAppUpdate`, and `otherTab`
- Modify: `vite.config.ts` (the floor for `card-state`), and the ceilings of any listed function that came down.

**Interfaces:**

- Produces:
  - `showCard(card: HTMLElement, up: boolean): void`: sets `card.hidden = !up` and records `up`.
  - `cardUp(card: HTMLElement): boolean`: the last value recorded, `false` for a card never shown.
  - Both are kept in a module `WeakSet<HTMLElement>`.

- [ ] **Step 1: Write the failing test** in `src/card-state.test.ts` (happy-dom):
  - "a card never shown is not up": `cardUp(el)` is `false`.
  - "showCard records and hides": after `showCard(el, true)`, `cardUp(el)` is `true` and `el.hidden` is `false`. After `showCard(el, false)`, it is `false` and `true`.
  - "the record is the card's own": two elements, one shown; the other's `cardUp` is `false`.
- [ ] **Step 2:** Run `npx vitest run src/card-state.test.ts` and expect it to FAIL (module missing).
- [ ] **Step 3:** Implement `src/card-state.ts`, then run the test and expect it to PASS.
- [ ] **Step 4: Route every write through `showCard`.**
  - Replace every runtime write of a listed root's `.hidden` (not the `= true` at creation) with `showCard(root, <shown>)`, where `<shown>` is the negation of today's expression. Example: `welcome.hidden = a && b` becomes `showCard(welcome, !(a && b))`.
  - Where a panel reads its own root's `.hidden` as "was open" (welcome-panel `wasOpen`, relic-panels `detailWasOpen` and the shelf, reveal and legend `wasOpen`), read `cardUp(root)` instead, if that is net zero lines.
  - `showAppUpdate` uses `showCard(prompt, true)`.
  - The screen writes `otherTab` with `showCard`.
  - Find every write with `grep -nE "\b(welcome|layer|notice|reveal|legend|shelf|detail|dialog|menu|confirm|fieldLogSheet|sheet|root|updatePrompt|prompt|otherTab)\.hidden =" src/*.ts`, excluding tests. Only the 17 roots change. `confirm` in `save-conflict-panel` is an inner panel, not a root.
- [ ] **Step 5:** Run `npm run functions`. Every exact-ceiling panel must be at net zero or under. Where a ceiling went down, lower it to the printed value.
- [ ] **Step 6:** Run `npx vitest run src/welcome-panel.test.ts src/menu-panel.test.ts src/workshop-panel.test.ts src/mountain-screen-depths.test.ts src/upgrade-reveal.test.ts src/mountain-screen.test.ts` and expect PASS. Then run `npm run gate -- fast` and expect every line PASS.
- [ ] **Step 7: Commit** "Cards over the board write their shown state through one module (#427)".

### Task 2: The Running list asks the chips, not the DOM

**Files:**

- Modify: `src/effect-row.ts`, `src/effect-row.test.ts` (create it if absent)
- Create: `src/screen-chips.ts`, `src/screen-chips.test.ts`
- Modify: `src/mountain-screen.ts`: the craft and bench chip block and `anyRunning` in `render`; `vite.config.ts` floors

**Interfaces:**

- Produces (effect-row):
  - `writeChip` also records `label.active` in a module `WeakSet`.
  - `anyChipActive(host: ParentNode): boolean`: whether any element child of `host` was last written active.
  - The engineers' trip chips are children of the screen's `effectRow` (the `chipHost`), so `createEngineersPanel` does not change.
- Produces (screen-chips):
  - `runningLabels(mountain: Mountain, at: number): { readonly crafts: ReadonlyMap<RecipeId, EffectLabel>; readonly bench: EffectLabel }`.
  - It holds today's craft and bench label logic, `mountain-screen.ts:796–832`. A craft with no hot timer gets the inactive label `{ short: "", full: "", leftMs: 0, active: false }`. The bench is active only when it is a recipe, `at < endsAt`, and it is not also a hot timer.
  - The keys of `crafts` are the ids the screen made chips for: every recipe with a craft chip today.

- [ ] **Step 1: Write the failing tests.**
  - effect-row: "anyChipActive is false until a child chip is written active, and false again once it is written inactive". Also "a chip outside the host does not count".
  - screen-chips:
    - "a hot craft gets its short name, multiplier and time left";
    - "a cold craft is inactive";
    - "the bench shows while it runs and is not a timer";
    - "a bench that is also a hot timer is not shown twice";
    - "a finished bench is inactive".
  - Seed each with `createMountain()` plus the fields, and a fixed `at`.
- [ ] **Step 2:** Run both test files and expect them to FAIL.
- [ ] **Step 3:** Implement both.
- [ ] **Step 4: Wire the screen.**
  - The screen writes its chips from `runningLabels(view.mountain, at)`.
  - Replace `effectRow.querySelector(".effect-chip:not([hidden])") !== null` with `anyChipActive(effectRow)`, still after every chip is written.
- [ ] **Step 5:** Run `npx vitest run src/effect-row.test.ts src/screen-chips.test.ts src/mountain-screen.test.ts src/engineers-panel.test.ts` and expect PASS. Then run `npm run gate -- fast` and `npm run functions` (the screen's line count must not rise).
- [ ] **Step 6: Commit** "The Running list asks the chips whether anything runs (#427)".

### Task 3: The screen's small reads come from state

**Files:**

- Modify: `src/board-note.ts`, `src/board-note.test.ts`, `src/board-keys.ts`, `src/board-keys.test.ts`, `src/workshop-panel.ts`, `src/mountain-screen.ts`

**Interfaces:**

- Produces:
  - `BoardNote.isOn(): boolean`, from a closure `on` flag that `show` sets and `hide` clears. board-note's own Escape check (`board-note.ts:78`) uses it.
  - `createBoardNote(stage, signal?, onDrop?: (body: Node) => void)`: when `show` replaces a body with a different one, it calls `onDrop(old)` after the replace. It never calls it on `hide`, which keeps the body.
  - The key rail's return gains `locked(id: KeyId): boolean`, the `disabled` it last painted for that key.
  - `createWorkshopPanel` returns `openButton: HTMLButtonElement` too, net zero lines.

- [ ] **Step 1: Write the failing tests.**
  - board-note:
    - "isOn follows show, hide, the timer and Escape";
    - "showing another body hands the old one to onDrop";
    - "showing the same body again does not drop it";
    - "hide drops nothing".
  - rail: "locked reads the last painted lock: held until ready, then from the view".
- [ ] **Step 2:** Run them and expect them to FAIL.
- [ ] **Step 3:** Implement them.
- [ ] **Step 4: In `mountain-screen.ts`:**
  - `!mine.dig.disabled` (in `renderReadyRow`) becomes `view.playing`. At that point the view is ready with stones left, and the dig is disabled only when `!view.playing || left === 0`.
  - `workshopDoor.disabled` becomes `rail.locked(<that key's id>)`. Keep `workshopDoor` as the button and track its `KeyId` beside it.
  - `workshop.menuEntry.querySelector(".workshop-open")` becomes `workshop.openButton`.
  - `!openWorkshop.hidden` becomes `view.ready && workshopUnlocked(view.mountain)`, the guard of its own click handler (`workshop-panel.ts:189–191`).
  - Delete the two `parentNode === null` re-park blocks. Pass `onDrop: (body) => { if (body === running || body === veinNote) runningPark.append(body); }` to `createBoardNote`.
  - `boardNote.note.classList.contains("on")` (two places) becomes `boardNote.isOn()`.
- [ ] **Step 5:** Run `npx vitest run src/board-note.test.ts src/mountain-screen.test.ts src/mountain-screen-rail.test.ts src/workshop-panel.test.ts src/mountain-screen-board.test.ts` and expect PASS. Then run `npm run gate -- fast` and `npm run functions`.
- [ ] **Step 6: Commit** "The screen reads the note, the keys, the dig and the Workshop from state (#427)".

### Task 4: Covers and the New sign are decided by one pure module

**Files:**

- Modify: `src/board-interaction.ts`, `src/board-interaction.test.ts`
- Create: `src/screen-cover.ts`, `src/screen-cover.test.ts`
- Modify: `src/mountain-screen.ts` (`OPEN_CARD`, `OPEN_SHEET`, `coverDrawers`, `coverNote`, `renderTeach`, and the `UPDATE_SHOWN` handler), `src/mountain-screen.test.ts`, `vite.config.ts`

**Interfaces:**

- Consumes: `cardUp` (Task 1) and `BoardNote.isOn` (Task 3).
- Produces (board-interaction):
  - `drawerOpen(view: BoardView): boolean`: whether a `DrawerId` is on `view.stack`.
  - `note` and `save` do not count. Use the existing `isDrawer`.
  - Use `BoardView`, which `board.view()` returns.
- Produces (screen-cover):

  ```ts
  export interface CoverState {
    readonly cardUp: boolean; // a card open over the board
    readonly drawerOpen: boolean; // the model's stack holds a drawer
    readonly noteOn: boolean; // the board note shows
  }
  export interface Cover {
    readonly closeDrawers: boolean; // cardUp
    readonly putAway: boolean; // cardUp || drawerOpen: the note and the sign go
    readonly holdSign: boolean; // noteOn || cardUp || drawerOpen
  }
  export function coverFor(state: CoverState): Cover;

  export interface SignWant {
    readonly id: string;
    readonly key: KeyId;
    readonly words: string;
  }
  /** The New sign the save asks for: today's renderTeach choice, from noteFor, WORKSHOP_NOTE and engineersNote. */
  export function wantedSign(view: ProgressSnapshot): SignWant | undefined;
  ```

- [ ] **Step 1: Write the failing tests.**
  - board-interaction `drawerOpen`:
    - an empty stack is `false`;
    - `["note"]` is `false`;
    - `["save"]` is `false`;
    - `["buys"]` is `true`;
    - `["upgrades", "note"]` is `true`.
    - Drive the stack with `step` from `initialBoard()`, as the existing tests do.
  - screen-cover `coverFor`: the eight combinations in one `it.each`, asserting all three fields.
  - screen-cover `wantedSign`:
    - not ready gives `undefined`;
    - a save where `noteFor` is `"workshop"` gives `{ id: "workshop", key: "workshop", words: WORKSHOP_NOTE }`;
    - `"engineers"` with a first engineer gives `engineersNote(name)`;
    - `"engineers"` with no engineer gives `undefined`.
  - mountain-screen: "the update prompt puts the board note and the New sign away at once". Show a note, call `showAppUpdate(root)`, and expect `boardNote.isOn()` false with no timer advance. Read it through the DOM as the other tests do: `.board-note.on` absent.
- [ ] **Step 2:** Run them and expect them to FAIL.
- [ ] **Step 3:** Implement `drawerOpen` and `src/screen-cover.ts`.
- [ ] **Step 4: Rewire the screen.**
  - Hold `const cards = [welcome, arrival.layer, …]`: the 17 roots, in `root.replaceChildren` order. Spread it into `replaceChildren` so the list is written once.
  - `const cover = () => coverFor({ cardUp: cards.some(cardUp), drawerOpen: drawerOpen(board.view()), noteOn: boardNote.isOn() })`. Read it once per use, because `coverDrawers` changes the stack.
  - `coverDrawers`, `coverNote` and `renderTeach` keep their order and effects, but decide from `cover()` and `wantedSign(view)`.
  - Delete `OPEN_CARD` and `OPEN_SHEET`.
  - The `UPDATE_SHOWN` handler runs `coverDrawers(); coverNote(); renderRail();`. **Ruling:** the update prompt now hides the note and the sign at once, not at the next tick.
- [ ] **Step 5:** Run `npx vitest run src/board-interaction.test.ts src/screen-cover.test.ts src/mountain-screen.test.ts src/mountain-screen-rail.test.ts src/mountain-screen-crew.test.ts src/mountain-screen-depths.test.ts` and expect PASS. Then run `npm run gate -- fast` and `npm run functions`.
- [ ] **Step 6: Commit** "Covers and the New sign are decided from the model and the cards' state (#427)".

### Task 5: One render path

**Files:**

- Modify: `src/mountain-screen.ts`, `src/mountain-screen.test.ts`, `scripts/complexity-ceilings.json`, `scripts/function-ceilings.json`, `docs/ARCHITECTURE.md` (the screen section, about line 310), and `docs/ui-audit.md` if it describes the Running-now clocks.

**Interfaces:**

- Consumes: Tasks 1–4.
- Produces:
  - `paint()`, a closure in `mountMountainScreen`, the only repaint. It is split into closures, each at cognitive complexity 15 or under, keeping today's order:
    1. **board:** stones, dig, the other tab, window, gauge row, pick, bays, ready row, crew panel, vein, guide, materials;
    2. **panels:** welcome through workshop, and the Workshop key's `aria-expanded`;
    3. **chips and Running:** the chips before the any-running check;
    4. **the rest:** relic plate, stock, saved copies, conflict, save line;
    5. **overlays:** teach, `coverDrawers`, `coverNote`, `renderRail`.
  - The panels render before teach, so a card opened in this paint already holds the sign back.

- [ ] **Step 1: Write the failing tests** in `src/mountain-screen.test.ts`:
  - "a running boost's chip counts down each second on a save with no crew mining":
    - fake timers;
    - a seeded save with no helpers, carts or drills, and `boosts: { overtime: <now + 90_000> }`;
    - `now: () => Date.now()`;
    - read the overtime chip's `.effect-time` text, advance `1_000`, and expect the text to change.
  - "the other-tab card takes focus once, not each second": make the view `elsewhere`, expect `document.activeElement` to be Play here, move focus to the body, advance `3_000`, and expect the focus not to return.
- [ ] **Step 2:** Run `npx vitest run src/mountain-screen.test.ts -t "chip counts down"` and expect it to FAIL. The clock is frozen today.
- [ ] **Step 3: Implement.**
  - Rename `render` to `paint`, split as above, and point every caller at `paint`: the panels' `requestRender` and the store subscription.
  - The quietAway note (today at the top of `render`) moves to the store subscription, before `paint()`, with its microtask dismiss unchanged.
  - The other-tab focus stays in the paint, guarded by a closure `otherShown` flag instead of `dataset.shown`, and focuses after the card is shown.
  - The tick becomes `progress.tick(); stepVein(); paint();`. **Ruling:** a tick whose store update already painted paints once more, as today's tick did, partly.
  - `renderMaterials` rebuilds its DOM only when the joined chip texts changed, since it now runs every second on every save.
- [ ] **Step 4:** Run `npx vitest run src/mountain-screen-crew.test.ts -t "the tick never moves a row"` first and expect PASS. Then run the whole of `src/mountain-screen*.test.ts`, `src/*teach*.test.ts`, `src/upgrade-reveal.test.ts`, `src/workshop-panel.test.ts`, `src/engineers-panel.test.ts` and `src/menu-panel.test.ts`, and expect PASS.
- [ ] **Step 5: Ratchet.**
  - Delete the `mountMountainScreen>render` line from `scripts/complexity-ceilings.json`.
  - Set the `mountMountainScreen` line ceiling to the value `node scripts/function-ratchet.mjs --print lines` prints. It must be under 1077.
  - Run `npm run functions` and expect PASS, with no `paint` closure over 15.
- [ ] **Step 6: Docs.**
  - In `docs/ARCHITECTURE.md`, describe the screen's one `paint()`, called by the store subscription, the panels' `requestRender` and the 1s tick.
  - Describe `card-state` as the cards' shown state, and `screen-cover` as the cover and sign decision.
  - Note that Running-now clocks tick each second on every save.
- [ ] **Step 7:** Run `npm run gate -- fast` and expect every line PASS.
- [ ] **Step 8: Commit** "The screen paints the board from one render path (#427)".

### Task 6: Proof in the browser (controller)

- [ ] Run `VISUAL_ONLY='^(section 1 |section 5|section 18|section 23|gauge row|keys and drawers)' npm run visual` and expect every check to PASS.
- [ ] Run `npm run play` on the early, mid and late saves. Open Buys, open a card over it (the menu), and close both. Look at the phone and desktop shots, and read `log.txt` for page errors and the save line.
- [ ] Check that the issue's done-when holds: `grep -nE "querySelector|classList\.contains|\.hidden \?|!\w+\.hidden|dataset\[\"shown\"\]|parentNode" src/mountain-screen.ts` shows only the wiring reads. Those are the plate's `.board-socket` list for the scrim and `showAppUpdate`'s `.update-prompt` lookup.
- [ ] Then the full gate, the final review and the PR, through ship-sitting.
