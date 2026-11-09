# Board interaction model (#410) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one pure module holds every board tap rule (the settle after an opening, the Done hold, the blink, the freeze while a drawer is open, and the thanks after a fix), proven by unit tests on a clock the tests control. It is wired to nothing yet; I2 (#411) moves the screen parts onto it.

**Architecture:**

- `src/board-interaction.ts` is a reducer over timestamped inputs, with no DOM and no clock of its own. Every input carries its own times. The view is derived from the state and a time (`boardView(state, at)`), so a hold or a blink ends by time passing, not by a stored timer.
- **Timers are data.** `nextWake(state, at)` says when the view next changes, and I2's composition root sets one real timer from it.
- **The timing values move here.** The settle (400ms), the hold (1.9s), the blink step (140ms), the thanks (1.6s) and the press-age limit (10s) move into this module from the five places that define them today. Those places import them, so the values have one home from this sliver on.

**Tech Stack:** TypeScript, Vitest (node environment; the module has no DOM).

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part B and named fixes 1 and 2; issue #410.

**Shared modules:** this is a new module, because no existing one is pure and board-wide. The spec suggests the name. The constants move into it from `board-drawer.ts`, `board-ready.ts`, `board-row.ts`, `crew-panel.ts` and `mountain-screen.ts`, which import them back. No rule logic is copied: those modules keep their own copies until I2 deletes them.

## Global Constraints

- **Pure:** no DOM, no `Date.now`, no `performance.now`, no timers. Every time is a number in ms on the caller's clock.
- **Values copied verbatim** from today:
  - `DRAWER_SETTLE_MS = 400`;
  - `READY_HOLD_MS = 1900` (the row's Done hold is the same value);
  - `BLINK_STEP_MS = 140`, with the frames red, off, red, off;
  - `THANKS_MS = 1600`;
  - `PRESS_AGE_LIMIT_MS = 10_000`.
- **No player-visible change in this sliver.** The only edits outside the new module and its tests are the constant moves.
- **Closed unions** for every vocabulary: overlay ids, inputs, decisions and outcomes. The state is readonly, and every step returns a new state.
- **Strict function limits:** every function in the module stays within 150 lines and a cognitive complexity of 15, with no ceiling entry. Split by input kind.
- **Coverage:** `src/board-interaction.ts` gets a 100% floor on all four measures in `vite.config.ts`.
- **No new dependency.** The random test's generator is hand-written: mulberry32, seeded.
- **Verification ladder** (`dad-friendly-work.md`): the test file, then `npm run gate -- fast`, then the full gate once before the PR. There is no visual step, because nothing the player sees changes.
- **Commits:** a plain sentence ending `(#410)`, with the session trailers.

## Review Focus

1. **A press handled after its hold has ended**, whose finger came down inside the hold, is still held (named fix 2). Task 2 has a test for this.
2. **A double tap on Back under load:** the second finger came down before the close was handled. It is early on what lies underneath (named fix 1). Task 1 has a test for this.
3. **A press stamp from the future** (`pressedAt > at`) is judged at `at`. A press older than the press-age limit can't be told apart from a stamp gone wrong, so it is judged at `at` too, as `eventAge` does today. Task 1 has a test for this.
4. **A second open of a drawer that is already open** (a tap on its key) doesn't restart its settle. Task 1 has a test for this.
5. **A save that loads again while a drawer is open** ends the holds and the blinks but keeps the freeze, as the Buys drawer does today. Task 3 has a test for this.

## The model's interface

All of it is in `src/board-interaction.ts`. Tasks 1 to 3 fill it in.

```ts
export const DRAWER_SETTLE_MS = 400;
export const READY_HOLD_MS = 1900;
export const BLINK_STEP_MS = 140;
export const THANKS_MS = 1600;
export const PRESS_AGE_LIMIT_MS = 10_000;

/** Drawers replace one another. The save drawer and a board note open on top. */
export type DrawerId = "buys" | "upgrades" | "workshop" | "engineers" | "ledger";
export type OverlayId = DrawerId | "save" | "note";
/** Where a control sits: on an overlay, or on the board under them all. */
export type Layer = OverlayId | "board";
export interface ControlRef { readonly layer: Layer; readonly id: string }
export type Pointer = "finger" | "keyboard";
/** What an open drawer shows, in order: its rows and sections, and how many chip rows its crew line wraps to. */
export interface Layout { readonly parts: readonly string[]; readonly chipRows: number }

export type BoardInput =
  | { readonly kind: "open"; readonly overlay: OverlayId; readonly at: number }
  | { readonly kind: "close"; readonly overlay: OverlayId; readonly at: number; readonly by: Pointer }
  /** The "i" cards in or out: a new screen under the finger, so the settle starts again. */
  | { readonly kind: "page"; readonly overlay: OverlayId; readonly at: number }
  | { readonly kind: "layout"; readonly overlay: DrawerId; readonly layout: Layout }
  | { readonly kind: "result"; readonly control: ControlRef; readonly at: number; readonly outcome: "applied" | "refused" | "fixed" }
  | { readonly kind: "motion"; readonly reduced: boolean }
  /** The save is loading again: holds and blinks speak of a save that may not land. */
  | { readonly kind: "unloaded" };

export interface Press {
  readonly control: ControlRef;
  /** When the finger came down (the handler's time less the event's age). */
  readonly pressedAt: number;
  /** When the handler ran. */
  readonly at: number;
  readonly by: Pointer;
  /** A trouble press is not a spend: neither the settle nor a hold stops it. */
  readonly intent: "act" | "trouble";
}
export type PressDecision = "act" | "ignore-early" | "ignore-held" | "blink";

export type BoardState; // readonly; fields are the implementer's choice
export function initialBoard(): BoardState;
export function step(state: BoardState, input: BoardInput): BoardState;
export function press(state: BoardState, input: Press): { readonly state: BoardState; readonly decision: PressDecision };
export function controlKey(control: ControlRef): string; // `${layer}/${id}`

export interface BoardView {
  /** Open overlays, bottom first; empty means the board alone. */
  readonly stack: readonly OverlayId[];
  /** controlKey of each control holding Done. */
  readonly held: ReadonlySet<string>;
  /** controlKey to the blink frame it shows now. */
  readonly blinking: ReadonlyMap<string, "red" | "off">;
  /** Thanks hosts: a drawer's id for its kick line, or a board control's key (a bay). */
  readonly thanks: ReadonlySet<string>;
  /** What each drawer shows: frozen while it is open, the latest while it is shut. */
  readonly layouts: ReadonlyMap<DrawerId, Layout>;
}
export function boardView(state: BoardState, at: number): BoardView;
/** The next time after `at` that boardView changes, or undefined when nothing is pending. */
export function nextWake(state: BoardState, at: number): number | undefined;
```

## The rules (each is one test, or more)

A press's judged time is `pressedAt`, except that a `pressedAt` after `at` or more than `PRESS_AGE_LIMIT_MS` before `at` is judged at `at`. In order:

1. **Early:** a finger press (not a trouble press) is `ignore-early` when either:
   - its layer is an open overlay and the judged time is under `DRAWER_SETTLE_MS` after that overlay's last `open` or `page`; or
   - its layer is the one a finger's `close` revealed (the new top layer, or `"board"`), and the judged time is under `DRAWER_SETTLE_MS` after that close.

   A keyboard press is never early. Any `open` clears the revealed settle.
2. **Held:** a press (not a trouble press, from a finger or the keyboard) on a control holding Done is `ignore-held` when its judged time is at or after the acting press's `pressedAt` and before the hold's end.
   - `applied` starts a hold, from the acting press's `pressedAt` (the latest act on that control, or the result's own `at` when none was recorded) to `at + READY_HOLD_MS`. An `applied` while a hold runs doesn't stretch it.
   - `fixed` on a control in a drawer starts the hold again, from the fixing press to `at + READY_HOLD_MS`, the way `row.hold()` does today. On a board control (a bay) it starts no hold.
3. **Gone:** a press on a part an open drawer shows frozen, but whose latest layout no longer has it, gets `blink` and starts a blink. That is "a row the open drawer holds in place for a tier no longer shown sells nothing".
4. Otherwise the press gets `act`, and the press is recorded as its control's acting press.

**Blink:**
- `refused`, or a `blink` decision, starts a blink at `at`, unless motion is reduced or that control's blink is still running. A running blink is not restarted.
- The frames are red, off, red, off, one every `BLINK_STEP_MS`, and the blink is gone at `4 × BLINK_STEP_MS`.
- `applied` ends a running blink.
- `motion` reduced stops new blinks only. A blink already running plays out, as today.

**Thanks:** `fixed` shows thanks on its host until `at + THANKS_MS`. A new `fixed` starts the thanks again. The host is the control's drawer, or for a board control its own key.

**Overlays:**
- `open` of a drawer closes everything and stands alone. `save` and `note` open on top; a note replaces a note on top.
- Opening an overlay that is already open changes nothing, and its settle doesn't restart.
- `close` removes the overlay and everything above it, and a closed overlay's close changes nothing. Only a finger close starts the revealed settle.

**Freeze:**
- `layout` always records the drawer's latest layout.
- `open` of a drawer freezes the latest layout, if there is one. The frozen `Layout` object is kept as it is, never copied, so a painter can compare by identity.
- A `layout` for an open drawer with nothing frozen yet freezes that layout. That covers a drawer opened before the save was in, which lays out once, as the save lands.
- `close` drops the freeze.
- `unloaded` ends the holds and the blinks but keeps the freezes.

**Ticks:** there is no tick input. `boardView` reads the time it is given, and `nextWake` says when to ask again.

**Bounded state:** every input with an `at` drops holds, blinks and thanks that ended more than `PRESS_AGE_LIMIT_MS` before it. Nothing is dropped sooner, so a late press is still judged against them.

---

### Task 1: The module, the constants, overlays and the settle

**Files:**
- Create: `src/board-interaction.ts` and `src/board-interaction.test.ts`.
- Modify, constants only:
  - `src/board-drawer.ts`: `DRAWER_SETTLE_MS` and `PRESS_AGE_LIMIT_MS` are imported, and `DRAWER_SETTLE_MS` is re-exported, so its importers are unchanged;
  - `src/board-ready.ts`: `READY_HOLD_MS` is imported and re-exported;
  - `src/board-row.ts`: `BLINK_STEP_MS` is imported and re-exported, and `ROW_HOLD_MS = READY_HOLD_MS` comes from the model;
  - `src/crew-panel.ts` and `src/mountain-screen.ts`: their local `THANKS_MS` goes, and each imports it.

**Interfaces:**
- Produces: the whole interface block above, with `press` deciding `act` or `ignore-early` and `boardView(...).stack`.
- `held`, `blinking`, `thanks` and `layouts` are empty until Tasks 2 and 3. `nextWake` returns `undefined` until Task 2.

- [ ] **Step 1: Write the failing tests** in `src/board-interaction.test.ts`, with no DOM environment line. Use a helper `finger(layer, id, pressedAt, at = pressedAt)` that builds a `Press` with `intent: "act"`.
  - **"settles a drawer for 400ms after it opens, judged by when the finger came down":**
    - after `open buys at 1000`, a finger press on `{layer: "buys", id: "cart"}` at `pressedAt` 1399 gets `ignore-early`;
    - at 1400 it gets `act`;
    - pressed at 1399 but handled at 2500, it still gets `ignore-early`.
  - **"never settles a keyboard press":** the same press `by: "keyboard"` at 1100 gets `act`.
  - **"lets a trouble press through the settle":** `intent: "trouble"` at 1100 gets `act`.
  - **"starts the settle again when the i cards come in or go":** after `open at 1000` and `page at 1500`, 1899 gets `ignore-early` and 1900 gets `act`.
  - **"does not restart the settle on a second open":** `open at 1000`, then `open at 1300` again; 1400 gets `act`.
  - **"settles what a finger's close reveals" (named fix 1):** after `open buys at 0` and a finger `close at 1000`, a finger press on `{layer: "board", id: "key:upgrades"}` gets `ignore-early` at `pressedAt` 1399, and also at 990 handled at 1200 (the double tap's second finger came down before the close was handled). It gets `act` at 1400.
  - **"does not settle after a keyboard close":** with `close ... by: "keyboard"` at 1000, a board press at 1100 gets `act`.
  - **"settles the drawer under the save drawer when the save drawer closes":** `open buys at 0`, `open save at 5000`, then a finger close of save at 6000; a press on buys at 6100 gets `ignore-early`.
  - **"stacks the save drawer and notes on a drawer, and a drawer replaces them all":** check `boardView(...).stack`:
    - `open buys`, then `save`, gives `["buys", "save"]`;
    - `open note` gives `["buys", "save", "note"]`;
    - another `open note` gives the same;
    - `open upgrades` gives `["upgrades"]`;
    - `close upgrades` gives `[]`;
    - `close buys`, when buys isn't open, changes nothing;
    - closing `buys` under `["buys", "save"]` gives `[]`.
  - **"judges a future or a too-old stamp at the handler's time":**
    - after `open buys at 1000`, `pressedAt` 5000 handled at 1100 gets `ignore-early` (judged at 1100);
    - after `open buys at 20_000`, `pressedAt` 1 handled at 20_500 is judged at 20_500 and gets `act`.
  - **"moves today's timing values here":** `DRAWER_SETTLE_MS` is 400, `READY_HOLD_MS` is 1900, `BLINK_STEP_MS` is 140, `THANKS_MS` is 1600 and `PRESS_AGE_LIMIT_MS` is 10_000. `board-drawer.ts`'s `DRAWER_SETTLE_MS` and `board-row.ts`'s `ROW_HOLD_MS` are the same values (imported).
- [ ] **Step 2:** `npx vitest run src/board-interaction.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `initialBoard`, `step` (`open`, `close` and `page`; the rest pass through), `press` (early, then act), `controlKey` and `boardView` (stack; the other fields empty), plus the constant moves. Keep one small function per input kind.
- [ ] **Step 4:** Run the test file, then `npm run gate -- fast`. Expected: PASS. The constant moves keep `board-drawer`, `board-row`, `board-ready`, `crew-panel` and the screen tests green, untouched.
- [ ] **Step 5:** Commit: `The board's tap rules get a pure home: overlays and the settle, on the caller's clock (#410)`.

### Task 2: Holds, the blink, the thanks and the wake time

**Files:** `src/board-interaction.ts` and `src/board-interaction.test.ts`.

**Interfaces:**
- Consumes: Task 1's types and `press`.
- Produces: `result`, `motion` and `unloaded` in `step`; `ignore-held`; `held`, `blinking` and `thanks` in `boardView`; `nextWake`.

- [ ] **Step 1: Write the failing tests.** All of them run on the board layer (`{layer: "board", id: "plate"}`), with no drawer open, unless they say otherwise.
  - **"holds Done for 1.9s after a buy, so a double tap buys one":**
    - a press at 1000 gets `act`, and `result applied at 1000` follows;
    - a press at 1200 gets `ignore-held`;
    - `boardView(s, 2899).held` has the plate;
    - at 2900 it doesn't, and a press at 2900 gets `act`.
  - **"judges the hold by when the finger came down" (named fix 2):**
    - after the act at 1000 and the result at 1000, a press with `pressedAt` 2800 handled at 3500 gets `ignore-held`;
    - a press with `pressedAt` 900 handled at 1100 (it came down before the acting press) gets `act`.
  - **"holds against the key's repeat":** a keyboard press at 1500 inside the hold gets `ignore-held`.
  - **"does not stretch a hold with a second applied":** a second `result applied at 2000` inside the hold leaves the end at 2900.
  - **"holds no control that did not act":**
    - a `refused` result starts no hold;
    - a hold on `board/plate` doesn't hold `board/bay:0`.
  - **"blinks red, off, red, off on a refused buy":**
    - after `result refused at 0`, `blinking` gives the plate's frame: `red` at 0, `off` at 140, `red` at 280 and `off` at 420;
    - at 560 the plate is not in `blinking`;
    - a second `refused at 200` doesn't restart the blink, so the frame at 560 is still gone.
  - **"does not blink under reduced motion, and lets a running blink play out":**
    - with `motion reduced` first, `refused` gives no frames;
    - with `refused at 0` and then `motion reduced`, the frame at 300 is `red`.
  - **"ends a blink when a buy lands":** `refused at 0`, then `applied at 100`, gives no frame at 150.
  - **"thanks for 1.6s after a fix, on the drawer or on the bay":**
    - `fixed` on `{layer: "buys", id: "drill"}` at 0 puts `"buys"` in `thanks` until 1599, and it is gone at 1600;
    - a second `fixed at 1000` keeps it until 2599;
    - `fixed` on `{layer: "board", id: "bay:1"}` puts `"board/bay:1"` in `thanks`.
  - **"holds a drawer row after its fix, and no bay":**
    - on a buys row, a trouble press at 0 gets `act`, then `fixed at 0`; an `act` press at 500 gets `ignore-held`;
    - inside a running hold, `fixed` at 1500 starts the hold again, so it ends at 3400;
    - on a bay, `fixed` starts no hold, so a press at 500 gets `act`.
  - **"lets a trouble press through a hold":** a trouble press inside a hold gets `act`.
  - **"lets go of holds and blinks when the save loads again":** `unloaded` empties `held` and `blinking`, and the next press acts.
  - **"keeps a hold long enough to judge a late press":** a hold that ended at 2900 still judges a press with `pressedAt` 2800 handled at 12_000. An input at 13_000 or later drops it.
  - **"wakes at the next change":** `nextWake` gives:
    - `undefined` on an idle board;
    - 2900 after the hold at 1000;
    - 140, 280, 420 and then 560 through a blink from 0;
    - the earliest of a hold, a blink and a thanks running together;
    - `undefined` once all have ended.
- [ ] **Step 2:** Run the test file. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the hold, blink, thanks, motion and unloaded rules as written in **The rules**, plus the bounded-state drop. Each rule is its own small function.
- [ ] **Step 4:** Run the test file, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5:** Commit: `The model holds Done by when the finger came down, blinks a dear tap and thanks a fix (#410)`.

### Task 3: The freeze while a drawer is open

**Files:** `src/board-interaction.ts` and `src/board-interaction.test.ts`.

**Interfaces:**
- Consumes: Task 1's `open`, `close` and stack, and Task 2's blink.
- Produces: `layout` in `step`; `layouts` in `boardView`; the `blink` decision.

- [ ] **Step 1: Write the failing tests.** Take `L1 = {parts: ["crew", "helper", "cart"], chipRows: 1}` and `L2 = {parts: ["crew", "helper", "drill"], chipRows: 2}`.
  - **"shows the latest layout while shut, and freezes it as the drawer opens":**
    - after `layout buys L1`, `layouts.get("buys")` is L1;
    - after `open buys` and then `layout buys L2`, it is still L1;
    - after `close buys`, it is L2.
  - **"lays out once as the save lands, for a drawer opened before it":** `open buys` with no layout, then `layout L1`, then `layout L2`, gives L1.
  - **"opens on the newest layout":** after `layout L1`, `layout L2` and then `open`, the layout is L2.
  - **"blinks a press on a part the open drawer holds but no longer shows":**
    - opened on L1 and then given `layout L2`, a press on `{layer: "buys", id: "cart"}` gets `blink`, and `blinking` has `buys/cart`;
    - a press on `buys/drill` gets `act`.
  - **"keeps the freeze when the save loads again":** opened on L1, then `unloaded`, then `layout L2`, gives L1.
  - **"freezes each drawer on its own":** opening upgrades closes buys and drops its freeze. Buys then shows its latest layout, while upgrades shows its own frozen one.
- [ ] **Step 2:** Run the test file. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the freeze as written in **The rules**, with the gone check placed after the hold check in `press`.
- [ ] **Step 4:** Run the test file, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5:** Commit: `An open drawer's rows hold their places in the model, and a row it no longer sells blinks (#410)`.

### Task 4: The random-sequence invariants, the coverage floor and the docs

**Files:**
- Create: `src/board-interaction.random.test.ts`.
- Modify: `vite.config.ts` (add the floor), `docs/ARCHITECTURE.md` and `docs/superpowers/specs/2026-11-09-architecture-design.md` (only if its part B names something this plan renamed).

**Interfaces:** consumes the whole interface.

- [ ] **Step 1: Write the random test.**
  - **The generator:** `mulberry32(seed)` is a hand-written 32-bit generator returning `[0, 1)`. It builds 300 seeded sequences of 80 inputs each, over two drawers (buys, upgrades), the save drawer and the board, and three controls per layer.
  - **The clock:** each step adds 0 to 700ms, so taps fall both inside and outside the 400ms and 1.9s windows. `pressedAt` is `at` minus 0 to 300ms.
  - **The input mix:** open, close (finger or keyboard), page, layout (random parts and chip rows), press (mostly act, some trouble, finger or keyboard), and unloaded.
  - **The results:** after every `act` decision on an act press, the test feeds `result applied` with the same `at`. A tenth of acts are fed `refused` instead.
  - **A shadow:** the test keeps its own record of each overlay's last open or page, each finger close, each control's last applied act and hold end, and each open drawer's first frozen layout. `unloaded` and a close reset the matching parts. The shadow comes from the rules, never from the module.
  - **Assertions for every seed:**
    - **at most one buy per double tap:** no `act` on a control whose last applied act's `pressedAt` is at or before this press's judged time, while that time is before the hold's end;
    - **nothing acts inside a settle:** no finger act press gets `act` inside its layer's settle or the revealed settle;
    - **nothing acts inside a hold;**
    - **no row moves while its drawer is open:** from the first freeze to the close, `boardView(...).layouts.get(drawer)` is the same object.

    A failing assertion prints the seed and the step index.
- [ ] **Step 2:** Run it. Expected: PASS on Tasks 1–3's code. Then break each rule once by hand (the settle bound, the hold's start, the freeze), check that each makes the random test fail, and restore. Record that in the ledger.
- [ ] **Step 3:** Add `"src/board-interaction.ts": { statements: 100, branches: 100, functions: 100, lines: 100 }` to the thresholds in `vite.config.ts`. Run `npx vitest run --coverage src/board-interaction` and check that the file shows 100% on all four measures.
- [ ] **Step 4: Docs.**
  - `docs/ARCHITECTURE.md`: a short entry for `board-interaction`: the pure tap rules (settle, hold, blink, freeze, thanks, overlay stack), its inputs and outputs, `nextWake` as the one timer, and that I2 (#411) wires it. The settle's line also names the module as the values' home.
  - The spec: no change unless a name differs from part B's suggestions.
- [ ] **Step 5:** `npm run gate -- fast`. Expected: PASS. Commit: `A seeded random-sequence test holds the board model's invariants, and the module keeps a 100% floor (#410)`.

### Task 5: Prove it

- [ ] **Step 1:** Run `npm run gate -- full` once, in the background. Expected: every step passes (no economy code changed, so no strict lab).
- [ ] **Step 2:** The ship-sitting skill: a final whole-branch review on the most capable model, then the PR `Fixes #410`.
