# The screen becomes a composition root (I2c-2, #431) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mountMountainScreen` (1035 lines today) becomes a composition root of 150 lines or under. It builds the board's parts from small `screen-*` modules and wires them. Nothing the player sees changes.

**Architecture:**

- Each cluster of the function moves, with its code unchanged, into a factory in a new `src/screen-*.ts` module. The factory takes a shared `ScreenCtx` plus the late-bound callbacks it needs, and returns a small handle with a `paint` method or methods.
- The root keeps the build order, the late bindings (arrows that call parts made further down), the one `paint()`, the tick, the store subscription and the fonts re-measure.
- A new characterization test pins today's registration order before anything moves.

**Tech Stack:** TypeScript, Vitest with happy-dom, and the puppeteer visual check.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part B (the screen), and issue #431. The issue's "Done when" is binding.

## Global Constraints

- **No behaviour change:**
  - Bodies move verbatim. Only the names they close over change, and comments travel with their code.
  - No deferred minor from I2c-1 (#433's Rulings) is fixed here.
  - The existing test files stay byte-for-byte unchanged: every `src/*.test.ts` that exists at the plan's commit. New test files are allowed.
- **Order** (pinned by Task 1's test):
  - Registration order: the Buys drawer, the Ready plate, the board note, the save line, the menu, the Upgrades drawer, `saveOnLeave`, the bays, the vein's hide and pagehide, the New sign's pointerdown and Escape, and the store subscription last.
  - The vein's `resumeVein` draws from `random` before anything else does.
  - The chips go into the effect row in this order: boosts, crafts, bench, then the engineers' trips.
  - The root's children keep today's order.
- **Paint order** inside `paint()` stays today's:
  1. stones left;
  2. the dig's `disabled`, the other tab, the dig's aria, the window, the gauge row;
  3. the pick (setting `shownPick`), the bays, the Ready row, `crewPanel.render()`, the vein, the guide, the materials;
  4. the panels, then the Workshop key's `aria-expanded`;
  5. the Running chips and the any-active check;
  6. the relic plate, stock, saved copies, conflict, save line;
  7. teach, `coverDrawers`, `coverNote`, `renderRail`.

  **One permitted reorder:** the other tab's paint may move from between the dig's `disabled` and its aria to just before the dig's `disabled`. Both are synchronous writes to unrelated nodes in one paint.

- **Late bindings stay late.** An arrow that today calls a part made further down stays an arrow that reads the part when called. Today these are:
  - `dispatch` calls the odometer and the gauge;
  - the rail's `onKey` calls `openBuys`, `openWorkshopSheet`, `crewPanel`, `upgrades` and `putSignAway`;
  - `legacy.beforeOpen` calls the menu;
  - `workshop.onClose` calls the Workshop door;
  - `mine.onDig` calls the dig button, and the dig button calls the mine;
  - `tapReady` calls `openBuys`;
  - the panels' `requestRender` calls `paint`.

  No builder may call `paint` or `requestRender` while it builds.

- **One home for each `let`:**

  | `let`                                       | Home                                                                 |
  | ------------------------------------------- | -------------------------------------------------------------------- |
  | `view`                                      | `screen-context` (`ctx.view()`, with `setView` returned to the root) |
  | `veinState`, `hiddenAt`, `veinNoteUntil`    | `screen-vein`                                                        |
  | `windowDrawn`                               | `screen-dig` (gauge row)                                             |
  | `shownPick`                                 | root, read by Buys through `pick: () => shownPick`                   |
  | `otherShown`                                | `screen-prompts`                                                     |
  | `teachShown`                                | `screen-overlays`                                                    |
  | `materialsKey`                              | `screen-ledger`                                                      |
  | `shelfDoor`                                 | `screen-panels`                                                      |
  | `doorKey`, `workshopDoor`, `openingFromKey` | `screen-keys`                                                        |

- **Signal and exports:**
  - Every listener still takes `ctx.listening`, which is `{ signal }` or `{}`, never `{ signal: undefined }`.
  - Panels still get `...(signal === undefined ? {} : { signal })` where they do today.
  - `mountain-screen` keeps exporting `BUYS_SETTLE_MS`, `showAppUpdate` (re-exported from `screen-prompts`) and `mountMountainScreen`. No `screen-*` module imports `mountain-screen` (`npm run cycles`).
- **Ratchet:**
  - Each task sets `src/mountain-screen.ts#mountMountainScreen` in `scripts/function-ceilings.json` to the exact value `node scripts/function-ratchet.mjs --print lines` prints.
  - Task 6 removes the entry.
  - No new entry in either ceilings list: every new function is at 150 lines or under and cognitive complexity 15 or under.
- **Coverage:**
  - Each new `src/screen-*.ts` gets a floor in `vite.config.ts` at its measured whole-suite value, rounded down to whole percent.
  - `src/mountain-screen.ts` keeps 99/87/100/99. If moving code drops it, add tests in a new file; never lower it.
  - Measure with `npx vitest run --coverage.enabled --coverage.include='src/<file>.ts' --coverage.reporter=text --coverage.thresholds.lines=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.statements=0` (whole suite, about 75s).
- **Each task before committing:**
  - `npm run gate -- fast` (exit status checked), `npx knip`, `npm run functions`, `npm run cycles`;
  - the coverage measure for every file it created;
  - `npx vitest run src/mountain-screen*.test.ts src/mountain-screen-order.test.ts`.

  Commit messages are a plain sentence ending ` (#431)`. Never edit `src` while a full gate or visual check runs.

## The target root (sketch; 150 lines or under including its signature)

```ts
export function mountMountainScreen(options: ScreenOptions): void {
  const { ctx, setView } = createScreenCtx(options, {
    paint: () => { paint(); },
    spent: (n) => { stock.spend(n); gaugeRow.kick(SPEND_KICK); },
  });                                                     // ~6
  const ledger = createLedger(ctx);                       // 1
  const runningNow = createRunningNow(ctx);               // 1
  const vein = createVein(ctx, { veinNote: runningNow.veinNote,
    showVein: (spot) => { gaugeRow.mine.showVein(spot); },
    showIn: (body, ms) => { boardNote.show(gaugeRow.mine.root, body, { ms }); } }); // ~5
  const rail = createKeyRail({ board: ctx.board, onKey: (id, key) => { keys.onKey(id, key); } }); // ~4
  let shownPick = readyNow(...);                          // 2
  const crewPanel = createBuysPanel(ctx, { rail, pick: () => shownPick, overSave: () => saveLine.isOpen() }); // ~3
  const panels = createCardPanels(ctx, { … });            // welcome, arrival, legacy, relics… ~6
  const gaugeRow = createGaugeRow(ctx, { … });            // ~4
  const readyRow = createReadyRow(ctx, { … });            // ~4
  const boardNote = createBoardNote(ctx.root, ctx.signal, runningNow.park);       // 1
  const saveLine = createSaveLine({ … });                 // ~7
  // menu and upgrades after the save line; engineers; prompts; overlays
  saveOnLeave(ctx.progress, ctx.listening);               // 1
  const bays = createBays(ctx, { … });                    // ~3
  const keys = wireKeys(ctx, { … });                      // ~4
  layOutBoard(ctx.root, { … });                           // ~6
  const paint = (): void => { … };                        // ~18, the order above
  // tick (5), runBoardLoop (5), vein.listen(), overlays.listen(), subscribe (12), fonts (6)
}
```

The exact grouping of the panels between `screen-panels` factories is the implementer's call in Task 5. It must keep the registration order above, and it must leave the root at 150 lines or under.

---

### Task 1: Pin today's order with a characterization test

**Files:**

- Create: `src/mountain-screen-order.test.ts`

**Interfaces:**

- Consumes: `mountScreen` and `stopScreens` from `src/mountain-screen.harness.ts`, as the other screen tests do.
- Produces: one test file that later tasks must keep green unchanged.

- [ ] **Step 1: Write the tests** (happy-dom) against today's code. Record one interleaved log during a mount:
  - `document.addEventListener` and `window.addEventListener`, as `doc:<type>:<capture>` and `win:<type>:<capture>`, with `capture` read from a boolean third argument or `{ capture }`;
  - the auth controller's `subscribe` as `auth`, by wrapping the `auth` passed to the screen;
  - `progress.subscribe` as `store`, by wrapping the store passed in;
  - `random` calls as `random`, through a `random` that logs and returns a seeded value;
  - `board.subscribe` as `host`, via `vi.mock("./board-host", …)` with `importOriginal`, wrapping the real host's `subscribe`.

  Tests:
  - "the screen registers its listeners in today's order": assert the log equals the literal sequence printed by one run on today's code. Pasting it in is the point: it pins today.
  - "the effect row holds boosts, crafts, bench, then the engineers' trips": read the `effectRow` children's `data-boost`, `data-craft` and class in order, and assert the literal list.
  - "the root's children stand in today's order": assert the literal list of class names of `root.children`.

- [ ] **Step 2:** Run `npx vitest run src/mountain-screen-order.test.ts` and expect PASS on today's code.
- [ ] **Step 3:** Prove the order test bites. Temporarily swap two registrations in `src/mountain-screen.ts`: move the New sign's pointerdown listener above `saveOnLeave`. Expect FAIL, then revert. Record both runs in the report.
- [ ] **Step 4:** Run `npm run gate -- fast` and `npx knip`, then commit "A test pins the screen's registration and build order before the split (#431)".

### Task 2: Context, ledger, Running now and the prompts leave the root

**Files:**

- Create:
  - `src/screen-context.ts`
  - `src/screen-ledger.ts`
  - `src/screen-running.ts`
  - `src/screen-prompts.ts`
  - a test file for any of these whose measured coverage leaves an obvious hole
- Modify: `src/mountain-screen.ts`, `vite.config.ts`, `scripts/function-ceilings.json`

**Interfaces:**

- Produces from `screen-context`:
  - `ScreenOptions`: today's parameter type, field for field, with its comments.
  - `ScreenCtx`:

    ```ts
    {
      readonly root: HTMLElement;
      readonly progress: ProgressStore;
      readonly auth: AuthController;
      readonly dispatch: Dispatch;
      readonly view: () => ProgressSnapshot;
      readonly now: () => number;
      readonly random: () => number;
      readonly board: BoardHost;
      readonly signal: AbortSignal | undefined;
      readonly listening: { readonly signal?: AbortSignal };
      readonly art: Pick<ScreenOptions, "lanternUrl" | "mountainUrl" | "stoneUrl" | "veinUrl" | "tierArt" | "relicArt">;
      readonly veinStorage: ScreenOptions["veinStorage"];
      readonly paint: () => void;
    }
    ```

  - `createScreenCtx(options: ScreenOptions, late: { readonly paint: () => void; readonly spent: (stones: number) => void }): { ctx: ScreenCtx; setView: (next: ProgressSnapshot) => void }`.
    - It holds today's defaults (`auth`, `progress`, `now`, `tapClock`, `random`) and builds the board host.
    - `dispatch` calls `late.spent(result.spent)` where today it rolls the odometer and kicks the needle.
    - Build the host exactly where today's root builds it relative to the vein's `resumeVein`. Task 1's test checks this.
- Produces from `screen-ledger`: `createLedger(ctx: ScreenCtx): { root: HTMLElement; paintStones(): void; paintGuide(): void }`.
  - `paintStones` is the stones-left text and title.
  - `paintGuide` is `renderGuide` then `renderMaterials`, with `materialsKey`.
- Produces from `screen-running`: `createRunningNow(ctx: ScreenCtx): { running: HTMLElement; veinNote: HTMLElement; effectRow: HTMLElement; park: (body: Node) => void; parkRoot: HTMLElement; chipFor: ReadonlyMap<BoostId, HTMLElement>; paint(): void }`.
  - `park` is the board note's `onDrop` body.
  - `paint` is today's `paintRunning`.
- Produces from `screen-prompts`:
  - `createUpdatePrompt(onShown: () => void): HTMLElement`;
  - `createOtherTab(progress: ProgressStore): { root: HTMLElement; paint(elsewhere: boolean): void }`, with `otherShown` inside;
  - `showAppUpdate(root: ParentNode): void`, with `UPDATE_SHOWN`.

- [ ] **Step 1:** Move the four clusters. The root calls them, and `mountain-screen` re-exports `showAppUpdate`.
- [ ] **Step 2:** Run `npx vitest run src/mountain-screen*.test.ts src/mountain-screen-order.test.ts` and expect PASS unchanged. `mountain-screen.test.ts` and `mountain-screen-crew.test.ts` cover `showAppUpdate`.
- [ ] **Step 3:** Measure each new file's coverage and add its floor. Set the screen's exact line ceiling. Run the per-task checks in Global Constraints.
- [ ] **Step 4: Commit** "The screen's context, ledger, Running now list and prompts move to their own modules (#431)".

### Task 3: The vein, the gauge row, the Ready row and the bays leave the root

**Files:**

- Create: `src/screen-vein.ts`, `src/screen-dig.ts`, and test files as coverage needs
- Modify: `src/mountain-screen.ts`, `vite.config.ts`, `scripts/function-ceilings.json`

**Interfaces:**

- Consumes: `ScreenCtx` (Task 2).
- Produces from `screen-vein`:

  ```ts
  createVein(ctx: ScreenCtx, deps: {
    readonly veinNote: HTMLElement;
    readonly showVein: (spot: VeinSpot | undefined) => void; // late: the mine
    readonly showIn: (body: Node, ms: number) => void;       // late: the board note under the mine
  }): {
    tap(): void;
    reset(): void;
    step(): void;
    render(): void;
    showNote(words: string, ms: number): void;
    listen(): void; // registers the hide and pagehide listeners, at today's point
  }
  ```

  `VeinSpot` is `ReturnType<typeof veinSpot>` (`src/mine-window.ts:116`). `QUIET_NOTE_MS` and `VEIN_NOTE_MS` move with the vein. The root's quiet-away one-shot calls `vein.showNote(words, QUIET_NOTE_MS)`, imported.

- Produces from `screen-dig`:
  - `createGaugeRow(ctx, { vein, legacyBadge: HTMLElement, onDug: (mined: number) => void /* late: the dig button */ }): { root; mine; dig(): number; kick(degrees: number): void; paint(): void; tick(dt: number): void }`.
    - `paint` is the dig's disabled and aria, the window draw with `windowDrawn`, and `renderGaugeRow`.
    - `tick` moves the mine and the gauge.
    - `DIG_KICK` and `SPEND_KICK` live here, and `SPEND_KICK` is exported for the root's `spent`.
  - `createReadyRow(ctx, { dig: () => number, mine: { dug(n: number): void }, openBuys: (from?: HTMLElement) => void /* late */ }): { root; digButton; paint(pick: ReadyPick): void }`. It holds `tapReady` and `renderReadyRow`.
  - `createBays(ctx, { note: BoardNote, openBuys: (from?: HTMLElement) => void }): { root; paint(pick: ReadyPick): void; tick(dt: number): void }`. The root builds it where the bays are built today, after `saveOnLeave`.

- [ ] **Step 1:** Move the clusters and wire the late arrows as listed.
- [ ] **Step 2:** Run the screen tests plus `src/mountain-screen-order.test.ts`, and expect PASS unchanged.
- [ ] **Step 3:** Measure coverage. Today's root lines 324, 461, 469 and 472 are uncovered (the dig when not ready, and three `tapReady` branches), and they move here: add focused tests in `src/screen-dig.test.ts` and set the floor. Set the line ceiling, then run the per-task checks.
- [ ] **Step 4: Commit** "The vein, the gauge row, the Ready row and the bays move to their own modules (#431)".

### Task 4: The overlays and the keys leave the root

**Files:**

- Create: `src/screen-overlays.ts`, `src/screen-keys.ts`, and test files as coverage needs
- Modify: `src/mountain-screen.ts`, `vite.config.ts`, `scripts/function-ceilings.json`

**Interfaces:**

- Produces from `screen-overlays`:

  ```ts
  createOverlays(ctx: ScreenCtx, deps: {
    readonly note: BoardNote;
    readonly rail: KeyRail;
    readonly cards: readonly HTMLElement[];
    readonly drawers: readonly { close(o: { restoreFocus: false; by: "program" }): void }[];
  }): {
    readonly sign: BoardSign; // created inside; the root lays out sign.root
    paint(): void;            // renderTeach, coverDrawers, coverNote, renderRail, in that order
    putSignAway(): void;
    listen(): void;           // the sign's pointerdown and Escape, at today's point
  }
  ```

  It holds `cover`, `teachShown` and `renderRail`. Use the rail's and the sign's existing exported types, or `ReturnType<typeof createKeyRail>`. The drawers are the Buys and Upgrades sheets, in that order.

- Produces from `screen-keys`:

  ```ts
  wireKeys(ctx: ScreenCtx, deps: {
    readonly rail: KeyRail;
    readonly crewPanel: …;
    readonly upgrades: …;
    readonly workshop: { readonly openButton: HTMLButtonElement };
    readonly closeBoardPopups: () => void;
    readonly putSignAway: () => void;
  }): {
    onKey(id: KeyId, key: HTMLButtonElement): void;
    openBuys(from?: HTMLElement): void;
    workshopClosed(): void;
  }
  ```

  It holds `doorKey`, `workshopDoor`, `openingFromKey`, `openWorkshopSheet` and the Workshop button's click listener, registered where today's root registers it. `workshopClosed` is today's `onClose` body. Type the panel deps with their creators' `ReturnType`.

- [ ] **Step 1:** Move them. The root's `onKey`, `openBuys` and Workshop `onClose` become late arrows into `keys`. Today's sign listeners become `overlays.listen()`, called at the same point.
- [ ] **Step 2:** Run the screen tests, the order test and `src/screen-cover.test.ts`, and expect PASS unchanged.
- [ ] **Step 3:** Measure coverage and set the floors. Set the line ceiling, then run the per-task checks.
- [ ] **Step 4: Commit** "The New sign, the covers, the rail's paint and the keys move to their own modules (#431)".

### Task 5: The panels leave the root

**Files:**

- Create: `src/screen-panels.ts`, and a test file as coverage needs
- Modify: `src/mountain-screen.ts`, `vite.config.ts`, `scripts/function-ceilings.json`

**Interfaces:**

- Produces: factories in `screen-panels` that build today's panels with today's option objects:
  - Buys (crew);
  - welcome, arrival, legacy and relics with `shelfDoor`;
  - the relic plate, the odometer and the dial, with `renderStock` and `spend`;
  - workshop, saved copies and conflict;
  - menu;
  - Upgrades;
  - Engineers.

  Group them into as few factories as the registration order allows: Buys before the Ready plate; the board note and save line before the menu; the menu before Upgrades. Each factory returns its panels' handles, plus a `paint()` for the panels it owns, in today's `paintPanels` and `paintRest` order.
  - Name the factories by what they hold, e.g. `createBuysPanel`, `createCards`, `createLaterPanels`. Each must be 150 lines or under and complexity 15 or under.
  - The cards list for the overlays is built from these handles in today's root-child order.

- [ ] **Step 1:** Move the panels. Every late binding stays a late arrow.
- [ ] **Step 2:** Run the screen tests and the order test, and expect PASS unchanged.
- [ ] **Step 3:** Measure coverage and set the floor. Set the line ceiling, then run the per-task checks.
- [ ] **Step 4: Commit** "The panels move to their own module (#431)".

### Task 6: Layout, and the root within 150 lines

**Files:**

- Create: `src/screen-layout.ts`
- Modify: `src/mountain-screen.ts`, `vite.config.ts`, `scripts/function-ceilings.json`, `docs/ARCHITECTURE.md`

**Interfaces:**

- Produces: `layOutBoard(root: HTMLElement, parts: { … }): void`. It holds the stock row, board top, the two clips with the scrim and its socket list, and the `replaceChildren`, in today's order.
- [ ] **Step 1:** Move the layout. Then fit the root to the sketch above: `mountMountainScreen(options: ScreenOptions)`, the builders in order, `paint`, the tick, `runBoardLoop`, `vein.listen()`, `overlays.listen()`, the store subscription with the quiet-away one-shot, and the fonts re-measure.
- [ ] **Step 2:** Run `node scripts/function-ratchet.mjs --print lines`. `mountMountainScreen` must be at 150 lines or under. Delete its line from `scripts/function-ceilings.json`, then run `npm run functions` and expect PASS.
- [ ] **Step 3:** Run the whole of `src/mountain-screen*.test.ts`, the order test, `src/*teach*.test.ts`, `src/upgrade-reveal.test.ts`, `src/workshop-panel.test.ts` and `src/menu-panel.test.ts`, and expect PASS unchanged.
- [ ] **Step 4:** Measure the coverage of `src/mountain-screen.ts` and of `screen-layout`. The root keeps 99/87/100/99. Add `screen-layout`'s floor. Then run the per-task checks.
- [ ] **Step 5: Docs.** `docs/ARCHITECTURE.md`'s screen section names the composition root and each `screen-*` module with its one job, and says the registration order is pinned by `mountain-screen-order.test.ts`.
- [ ] **Step 6: Commit** "mountMountainScreen is a composition root within 150 lines (#431)".

### Task 7: Proof in the browser (controller)

- [ ] Run `VISUAL_ONLY='^section 24' npm run visual` (no page scroll), plus `^(section 1 |gauge row|keys and drawers)`, and expect PASS.
- [ ] Run `npm run play` on the early, mid and late saves: Buys, then the Ledger, then a tap away. Read `log.txt` for page errors and the save line.
- [ ] Then the full gate, the final review and the PR, through ship-sitting.
