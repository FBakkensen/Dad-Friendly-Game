# Drawers and rows on the interaction model (#425) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Buys and Upgrades drawers and their rows take every tap rule from `board-interaction`: the settle, the Done hold, the blink, the freeze and the thanks. Their hand-rolled copies go. A row's Done hold is judged by when the finger came down (named fix 2). Their tap checks move from the browser to unit tests, and six functions come within the strict limits.

**Architecture:**

- **`src/board-host.ts` (new).** It is the impure shell around the pure model: one state, one wake timer set from `nextWake`, `send`, `press`, `view` and `subscribe`. The screen makes one host from its tap clock and `pressAge`, and hands it to both panels. Each panel passes it on to its drawer shell.
- **The parts become painters.**
  - The drawer shell (`board-drawer`) sends `open`, `close` and `page`, and takes every press of Back, the "i" and the how cards' Backs through `host.press`.
  - Rows (`board-row`) paint `held` and `blinking` from the host's view.
  - The panels:
    - send `layout` for the freeze;
    - send `result` after each buy;
    - paint the kick line from `thanks`;
    - read the frozen layout back from the view.
- **The tap tracker (`card-tap`)** stays a DOM behaviour. It keeps pressed feedback and drag or scroll cancels, and it now reports how a press came, not whether it was early.

**Tech Stack:** TypeScript, Vitest (happy-dom for DOM tests), puppeteer for the browser check.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part B and named fix 2; issue #425 (parent #411). The code map is `/tmp/claude-0/-workspace-Dad-Friendly-Game/5abd6efc-a118-5eb9-84c3-d46801b70196/scratchpad/i2a-map.md`. It is scratch, so each task's facts are copied into this plan.

**Shared modules:**

- **The rules:** `src/board-interaction.ts`. Two edge rules there change to match today (Task 3).
- **The DOM helpers:** `src/board-dom.ts`, which gains `hide` and `mark`.
- **The buy-row view:** `src/buys-rows.ts`.
- **The new modules**, each with its reason:
  - `src/board-host.ts`, the one stateful home of the model and its timer;
  - `src/crew-chips.ts`, the crew line's chip layout, out of `createCrewPanel`;
  - `src/crew-rate.ts`, the crew-rate count-up animation;
  - `src/buys-tap.ts`, the pure decision of what a Buys row's tap does.

## Global Constraints

- **No player-visible change except named fix 2.** A row's Done hold holds a press whose finger came down inside the hold, even if it is handled after the hold ends.
- **DOM contracts other scripts read stay:**
  - `.board-sheet.is-open`, `.board-sheet-kick.is-done`, `.board-row.is-held`, `.board-scrim.is-on`, `.crew-posts.is-frozen`;
  - the lamp's `backgroundPositionX` frames;
  - `data-*` attributes;
  - aria labels.
- **Strict limits (#422):** remove these entries from `scripts/function-ceilings.json` and `scripts/complexity-ceilings.json`, so each is within 150 lines and cognitive complexity 15:
  - `src/crew-panel.ts#createCrewPanel` (533), and `#createCrewPanel>render` (complexity 20);
  - `src/upgrades-panel.ts#createUpgradesPanel` (310);
  - `src/board-row.ts#createBoardRow` (260);
  - `src/board-drawer.ts#createBoardSheet` (256);
  - `src/buys-rows.ts#buyRowView` (190 lines, complexity 34).

  Every function this sliver adds is within the limits.

- **Ceilings at their exact values,** where every touch must be net ≤ 0 lines (and no added branch for complexity):
  - `src/mountain-screen.ts#mountMountainScreen` (1110) and its `>render` (complexity 20);
  - `src/board-save.ts#createSaveLine` (164);
  - `src/engineers-panel.ts#createEngineersPanel` (845).

  Lower an entry when a function shrinks.

- **Every timer in the drawers and rows is the host's one wake timer.** The count-up animation (`crew-rate`) and `watchFixHold`'s 600ms timer stay, since they are not tap rules.
- **Code comments carry no issue numbers** and no "until I2" (spec part F). `docs/ARCHITECTURE.md` keeps the history.
- **Verification ladder** (`dad-friendly-work.md`): the test file, then `npm run gate -- fast`, then `VISUAL_ONLY` for the drawer sections plus `npm run play`, then the full gate once before the PR, with the source untouched while it runs.
- **Commits:** a plain sentence ending `(#425)`, with the session trailers.

## Review Focus

1. **A lost press must not make a later press early.** A finger dragged off a row or Back, or a cancelled press, leaves a stale finger-down time, and the model has no lower bound on the settle. The tracker forgets a gesture's finger-down time at its click, at `pointercancel`, at a drag cancel, and whenever the shell opens, pages or closes. Task 5 has a test for this.
2. **The touch click that lands on a row under the lift.** That row saw no `pointerdown`, and it is judged by the click's own age. Today's test, mountain-screen.test.ts "row under the lift", stays green.
3. **Escape with the save drawer over a drawer** closes only the save drawer, as today. The shell asks the save line's own state, not the DOM. Task 4 has a test for this.
4. **A reload while a drawer is open.**
   - Buys keeps its freeze, and lays out once as the new save lands.
   - Upgrades keeps its order, because it sends its current order as the layout when it opens while loading.
   - Nothing blinks as gone while loading.

   Tasks 6 and 7 have tests for this.

5. **Tests on fake timers with a fixed `tapClock`.** Vitest 4 fakes `performance`. A test that holds `tapClock` still and advances fake timers would never let a hold or a thanks end under the host's timer. Each such test also moves its clock. The ones known are mountain-screen-crew.test.ts "Done holds" (~419), "blink" (~448) and "Fixed!" (~496–560). Task 5 fixes these.

---

### Task 1: One home for the DOM helpers, the legends and the how cards

**Files:**

- `src/board-dom.ts`;
- `src/board-drawer.ts`, `src/board-row.ts`, `src/crew-panel.ts` and `src/upgrades-panel.ts`;
- `src/board-dom.test.ts`, or a new `src/board-dom.test.ts` if it doesn't exist.

**Interfaces:**

- Produces, in board-dom:
  - `hide(target: HTMLElement, hidden: boolean): void`, which writes only on change;
  - `mark(target: HTMLElement, name: string, on: boolean): void`, a class toggle that writes only on change;
  - `legend(name: string, key: string, column?: string): HTMLElement`, the section legend copied today in crew-panel (`legend` at ~101) and upgrades-panel (~81).
- Produces, in `createBoardSheet`, an option `how: { readonly systems: readonly HowSystem[]; readonly backLabel: string }`. The shell builds the `boardHowCard`s, hides the first card's Back, appends them and opens them from the "i". This replaces the copy at crew-panel ~183–195 and upgrades-panel ~135–147.
- Produces `sheet.place(parts: readonly HTMLElement[])`, which inserts the parts before the spare plate. It replaces crew ~365–370 and upgrades ~251 and ~281–285.

- [ ] **Step 1: Failing tests.** Add `board-dom` tests:
  - "hide and mark write only on change": spy on `classList.toggle` and on the `hidden` setter, call twice with the same value, and expect one write;
  - "legend builds the section legend": name, key, and an optional right-hand column.
- [ ] **Step 2:** `npx vitest run src/board-dom.test.ts`. Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Add the helpers.
  - Replace the seven copies: `hide` in board-drawer (~94), `toggle` and `hide` in board-row (~54, ~60), `hide` and `mark` in crew-panel (~88, ~94), and `hide` and `mark` in upgrades-panel (~68, ~74).
  - Replace both `legend` copies, move the how cards into the shell, and add `place`.
- [ ] **Step 4:** Run the tests for board-dom, board-drawer, board-row, and the drawer parts of mountain-screen-crew. Then `npm run gate -- fast`. Expected: PASS, with lower ceilings for any listed function that shrank.
- [ ] **Step 5:** Commit: `The drawers share board-dom's helpers, one legend and one set of how cards (#425)`.

### Task 2: `buyRowView` splits by what a row shows

**Files:** `src/buys-rows.ts`. `src/buys-rows.test.ts` stays unchanged and is the characterization test.

**Interfaces:** `buyRowView(input): BuyRowView` keeps its signature and its outputs. It splits into:

- `buyFacts(input): BuyFacts`, the facts at ~135–162;
- `tendingOf(...)`;
- one face function per case: `troubleFace`, `guidedFace`, `lockedFace` and `pricedFace`;
- `buyFlag(facts, tending)`;
- `buyAria(facts, tending, synergy)`.

Each is within 150 lines and complexity 15.

- [ ] **Step 1:** Before you move anything, run `npx vitest run src/buys-rows.test.ts` and record the pass count.
- [ ] **Step 2:** Split the function. `buys-rows.test.ts` is unchanged and still passes. Remove `buyRowView`'s entries from both ceiling lists. `node scripts/function-ratchet.mjs` passes.
- [ ] **Step 3:** `npm run gate -- fast`. Expected: PASS. Commit: `A Buys row's view is worked out by one small function per thing it shows (#425)`.

### Task 3: The host, and the model's two blink edges

**Files:** create `src/board-host.ts` and `src/board-host.test.ts`; modify `src/board-interaction.ts` and `src/board-interaction.test.ts`.

**Interfaces:**

- Produces:
  ```ts
  export interface BoardHost {
    send(input: BoardInput): void;
    press(input: {
      control: ControlRef;
      by: "finger" | "keyboard";
      intent: "act" | "trouble";
      downAt: number | undefined;
      event: Event;
    }): PressDecision;
    view(): BoardView;
    subscribe(paint: () => void): () => void;
  }
  export function createBoardHost(options: {
    clock: () => number;
    pressAge?: (event: Event) => number;
    reduced?: () => boolean;
    signal?: AbortSignal;
  }): BoardHost;
  ```
- What the host does:
  - `press` sends `motion` from `reduced()` first. It works out `pressedAt` as `downAt ?? clock() - pressAge(event)`, calls the model's `press`, keeps the new state, re-arms the wake and notifies.
  - `send` steps the model, re-arms the one `setTimeout` from `nextWake(state, clock())`, and notifies only when the state changed by identity.
  - The wake is re-armed before the painters run, so a painter that throws can't strand a hold. At the wake it notifies and re-arms.
  - `signal` clears the timer.
  - `reduced` defaults to `reducedMotion` from `float-text`. `pressAge` defaults to `eventAge`.
- Model rule changes, matching today's `row.done()` and `row.hold()`:
  - a `fixed` result on a drawer control ends that control's running blink;
  - an `applied` result while that control's hold runs leaves its blink as it is.

- [ ] **Step 1: Failing tests.**
  - `board-interaction.test.ts`:
    - "a fix on a drawer row ends its blink";
    - "a buy that lands inside a running hold leaves the blink alone".
  - `board-host.test.ts`, on a fake clock and fake timers:
    - "wakes once at the next change and repaints": a hold ends at 1900 with one repaint, and nothing is pending after;
    - "re-arms before painting, so a painter that throws strands nothing";
    - "judges a press by its finger-down time, else by the event's age";
    - "sends the motion setting before each press";
    - "a send that changes nothing repaints nothing";
    - "aborting the signal clears the timer".
- [ ] **Step 2:** Run both files. Expected: FAIL.
- [ ] **Step 3:** Implement. Remove the comment history from board-interaction's header: "I2 (#411) …", "until then".
- [ ] **Step 4:** Run both files, then `npm run gate -- fast`. Expected: PASS. Keep the module's 100% coverage floor. Give `board-host.ts` a 100% floor as well.
- [ ] **Step 5:** Commit: `The board's model runs in one host with one wake timer (#425)`.

### Task 4: The drawer shell runs on the host

**Files:**

- `src/board-drawer.ts` and `src/board-drawer.test.ts`;
- `src/board-save.ts`: `isOpen` joins the returned object on the same line, net 0;
- `src/crew-panel.ts` and `src/upgrades-panel.ts`: they take `board: BoardHost` and pass it on;
- `src/mountain-screen.ts`, net ≤ 0 in `mountMountainScreen`;
- `src/mountain-screen.harness.ts`.

**Interfaces:**

- `createBoardSheet({ name: DrawerId, board: BoardHost, overSave: () => boolean, ... })`. `clock` and `pressAge` move to the host.
- `open` sends `{kind:"open", overlay:name, at}`.
- `close({ restoreFocus?, by })` sends close `by`:
  - Back by finger is `"finger"`;
  - Back by key and Escape are `"keyboard"`;
  - the scrim is `"tap-through"`;
  - a cover, a key switch or the update prompt is `"program"`.
- `showHow` sends `page`.
- `isOpen()` reads `board.view().stack`.
- Back, the "i" and the how cards' Backs press with control ids `"back"`, `"info"` and `"how-back"` on the drawer's layer, and act only on `act`.
- The kick line shows `TROUBLE_FIXED` with `is-done` while `view.thanks.has(name)`, and the resting kick otherwise. `flash` goes.
- The scrim paints `is-on` from `view.stack`, not from a `MutationObserver`.
- Escape closes the drawer only when `overSave()` is false. The screen passes `() => saveLine.isOpen()`.
- On open, page and close, the shell calls `forget()` on its own trackers. It also calls `onForget?.()`, so the panels forget their rows' trackers.
- `settling` and `flash` leave the `BoardSheet` interface. `settlingFor` stays, for the rows only, until Task 5 moves them onto the model and deletes it. It still uses the shell's own `openedAt`, now updated by the same open and page calls that send to the host.
- The screen makes one `createBoardHost({ clock: tapClock, pressAge, signal })` and passes `board` to both panels. The harness builds it on the test's clock.
- Crew's `thank()` sends `{kind:"result", control:{layer:"buys", id: tier}, at, outcome:"fixed"}`.

- [ ] **Step 1: Failing tests.** Rewrite the settle, Escape, how-card, kick and scrim tests in `board-drawer.test.ts` (~111–712) onto a host on a fake clock. Keep every scenario, and replace `sheet.settling()` reads with outcomes such as "the drawer stays open" and "the cards don't open". Add:
  - "Escape over the save drawer leaves the board drawer open";
  - "a scrim close is a tap-through: the socket's click still acts";
  - "a lost press on Back doesn't make the next opening's Back early".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. Split `createBoardSheet` into `buildSheet`, `wireSheetControls` and `paintKick`, each within the limits, and remove its ceiling entries. In `mountMountainScreen`, pay for the host lines by dropping the two `clock` and `pressAge` spreads, and lower its ceiling if it shrank.
- [ ] **Step 4:** Run board-drawer, mountain-screen-crew, mountain-screen-rail and mountain-screen tests, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5:** Commit: `The drawer shell settles, closes and thanks through the board's model (#425)`.

### Task 5: Rows tap through the model, and paint Done and the blink from its view

**Files:** `src/card-tap.ts`, `src/card-tap.test.ts`, `src/engineers-panel.ts` (signature only), `src/board-row.ts`, `src/board-row.test.ts`, `src/board-drawer.ts`, `src/crew-panel.ts`, `src/upgrades-panel.ts`, and `src/mountain-screen-crew.test.ts`.

**Interfaces:**

- `BoardRow.render(view: RowView | undefined, live: { readonly held: boolean; readonly blink: "red" | "off" | undefined })`. `done`, `hold`, `holding` and `blink` go, along with their timers and board-row's own frames array.
- Each panel subscribes once to the host, and on each paint calls `row.render(view, live)` from `view.held` and `view.blinking` for `buys/<tier>` and `upgrades/<row id>`.
  **The tap tracker (`src/card-tap.ts`, `src/card-tap.test.ts`, and `src/engineers-panel.ts` for its signature only, net ≤ 0 lines):**
- `buyOnTap(card, button, buy: (press: CardPress) => void, options: { clock: () => number; pressAge?: (event: Event) => number }): { forget(): void }`. The `settling` option goes.
- `CardPress` becomes `{ readonly by: "finger" | "keyboard"; readonly downAt: number | undefined }`. `downAt` is this gesture's finger-down time on the host's clock.
- A key press (a click with `detail === 0` that the tracker didn't send at a finger's pointerup) is `by: "keyboard"`.
- `forget()` drops a pending finger-down time. The panels call it on their rows' trackers through the shell's `onForget`.
- Pressed feedback, the 10px slop, the scroller check, `pointercancel` blocking, the `disabled` gate and the click sent at pointerup all stay as they are.
- `settlingFor` and the shell's `openedAt` bookkeeping go: the last copy of the settle judge outside the model.
- `eventAge` returns the raw age, `clock()` minus the stamp, with no clamp. The model's `judgedAt` is the one home of the press-age rule.

**The rows:**

- A row tap is `board.press({control, by, intent, downAt, event})` from the tracker's `CardPress`:
  - `ignore-early` and `ignore-held` do nothing;
  - `blink` already started the blink;
  - `act` runs the panel's action, then sends `result`: `applied` when the dispatch applied, `refused` for a dear tap (today's `!can` blink, which now goes through the model), and `fixed` for a trouble fix.

- [ ] **Step 1: Failing tests.**
  - `card-tap.test.ts`: the settle tests (~58–118) are replaced by:
    - "reports a finger press with its finger-down time";
    - "reports a key press as keyboard with no finger-down time";
    - "a touch click with no pointerdown on this card reports no finger-down time";
    - "forgets the finger-down time at the click, at pointercancel, at a drag, and on forget()".

    The drag test (~27) and the still-tap test (~39) stay.

  - Rewrite board-row's Done and blink tests (~369–546) as painter tests: `render(view, {held:true})` paints Done and holds the flag; the frames come from `live.blink`.
  - In mountain-screen-crew, add "a row's Done hold holds a press whose finger came down inside it, handled after it ended" (named fix 2), with `pressAge`.
  - Update the clock-trap tests (Review Focus 5) to move their `tapClock` with the fake timers.
- [ ] **Step 2:** Run the files. Expected: the named fix 2 test FAILS, and the rewritten ones fail on the missing `render(view, live)`.
- [ ] **Step 3:** Implement. Split `createBoardRow` into `buildRowParts` and `paintRow`, each within the limits, and remove its ceiling entry.
- [ ] **Step 4:** Run the row, crew, screen and depths tests, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5:** Commit: `Rows paint Done and the blink from the board's model, and a press is held by when its finger came down (#425)`.

### Task 6: Buys freezes through the model, and `createCrewPanel` comes within the limits

**Files:**

- `src/crew-panel.ts`;
- create `src/crew-chips.ts`, `src/crew-rate.ts` and `src/buys-tap.ts`, with a test for each;
- `src/mountain-screen-crew.test.ts`.

**Interfaces:**

- `buysTap({ snapshot, tier, pick, now, guided }): { kind: "blink" } | { kind: "hire" } | { kind: "trouble"; tier: TroubleTier } | { kind: "buy" }`. It is pure, and is today's pipeline after the model's decision: a stale or dear row blinks, a guided row hires, a troubled row is a trouble press, and anything else buys.
- `createCrewChips(posts, postsWords): { layout(bits, width): number; refresh(bits): void }`. It returns its chip row count, and holds today's chip order and fit rules (~388–472, ~671–690). Its pure helpers are `evenRows(bits, lines)` and `refreshed(shown, latest, rows)`.
- `createRateCounter({ reduced, paint }): { count(from, to): void }`, today's count-up: 8 steps of 60ms, skipped under reduced motion.
- The freeze: Buys sends `{kind:"layout", overlay:"buys", layout:{parts, chipRows}}`. `parts` are the ids of the shown parts, sections and rows, and `chipRows` comes from `createCrewChips`.
  - At open, the drawer opens in the DOM first, then the chips are measured and the foot fitted, then `layout` is sent, then `open`, all in one handler.
  - While open, the painter applies `view.layouts.get("buys")` for what shows. `posts.is-frozen` is painted while that layout is frozen.
  - `wanted`, `frozen`, `place`, `freeze` and `unfreeze` go.
  - The staffing New row is found from `guidedOf(...)` and the row's ref, not from `querySelector(".board-row.teach-new")`.
  - The decision reads at crew-panel ~439 (`posts.hidden`) and ~480 (`!foot.hidden`) go.
- `createCrewPanel` and its `render` come within the limits, and their entries are removed.

- [ ] **Step 1: Failing tests.**
  - `buys-tap.test.ts`: one test per decision.
  - `crew-chips.test.ts`: `evenRows` and `refreshed` cases from today's behaviour.
  - `crew-rate.test.ts`: the steps, and reduced motion.
  - mountain-screen-crew: "a drawer opened while the save loads lays out once as it lands", and "a reload while open keeps the rows in place and blinks nothing while loading".
  - Keep the existing freeze tests (~833–1036) green.
- [ ] **Step 2:** Run them. Expected: the new modules FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the crew tests, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5:** Commit: `Buys holds its rows in place through the board's model, and its panel splits into small parts (#425)`.

### Task 7: Upgrades keeps its order through the model, and `createUpgradesPanel` comes within the limits

**Files:** `src/upgrades-panel.ts` and the Upgrades part of `src/mountain-screen-crew.test.ts`.

**Interfaces:**

- `upgradesOrder(newId: RevealRowId | undefined): readonly string[]` is pure. The ids are the row ids, `sec:boosts`, `sec:lasting`, `sec:found`, `tool:<id>` and `foot`. Today's rule: the New row leads its section, and its section leads.
- Upgrades sends `layout` with every row in that order, hidden ones too (the `Layout` contract), while shut and as it opens.
  - Opened while loading, it sends its current DOM order as the layout.
  - The painter arranges the DOM by `view.layouts.get("upgrades")` and leaves row visibility live, as today.
- `orderedFor` stays as the painter's note of which New row the order it sent was for. It only decides the kick line ("Right on top"), which keeps today's wording.
- `renderChips` (the Running now chips) moves out of `createUpgradesPanel` into its own function in the same file.
- `createUpgradesPanel` comes within the limits, and its entry is removed.

- [ ] **Step 1: Failing tests.**
  - `upgradesOrder` cases: no New row, a New boost, and a New upgrade (its section leads).
  - mountain-screen-crew: "Upgrades opened while the save reloads keeps its order".
  - Keep the existing Upgrades tests (~1195–2211) green.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the Upgrades tests, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5:** Commit: `Upgrades keeps its order through the board's model, and its panel splits into small parts (#425)`.

### Task 8: The drawer browser checks lose their sleeps

**Files:** `scripts/visual-check.mjs`, and the screen test files that take over the tap-rule checks.

**Interfaces:**

- `open()` in the visual check takes `tapClock: "held"`. That runs `evaluateOnNewDocument`, which sets `performance.now = () => globalThis.__tapNow`, and the check steps `__tapNow` past 400 or 1900 instead of sleeping. Only the tap clock reads `performance.now` in `src`.
- Presses that only need to be past the settle become keyboard clicks (`closeSheet`'s way).

- [ ] **Step 1: Move the tap-rule checks to screen-level unit tests on the host,** if they aren't already covered. Cover these four:
  - a key's double tap neither closes nor buys (~6787);
  - a second tap within 1.9s buys nothing (~6913);
  - a buy moves no row (~6918);
  - reduced motion paints no red (~7138).

  Delete them from the browser.

- [ ] **Step 2: In the drawer sections, remove every fixed sleep and retry:**
  - `keys and drawers … <save>`: 450 at ~6443;
  - `keys and drawers … taps`: the retry loop at ~6755–6771, and the sleeps at ~6770, ~6799, ~6818, ~6840, ~6869, ~6894, ~6897, ~6899, ~6935, ~6972, ~7028, ~7040, ~7061 and ~7114;
  - the retry loop at ~6881–6908;
  - `SETTLE_TRIES`, if no other section uses it.

  Keep one wiring check per family, with no sleep:
  - a finger tap after the settle buys and paints Done;
  - a dear tap paints red (its rAF watcher stays);
  - the scrim, the scrim on a socket, and Escape;
  - the "i" and its Back.

  The layout and visual checks stay as they are.

- [ ] **Step 3: Run the drawer sections**, then `npm run play`:
  - `VISUAL_ONLY='^keys and drawers' npm run visual`;
  - `npm run play -- --save early label:Buys wait:900 tap:.board-row[data-tier=cart]`;
  - `npm run play -- --save mid label:Upgrades wait:900`.

  Expected: all pass, and the shots show the buy, Done and the odometer spend. `grep -nE "setTimeout|sleep|waitForTimeout" scripts/visual-check.mjs` shows none in the drawer sections.

- [ ] **Step 4:** Commit: `The drawer browser checks wire each control once, with no sleeps or retries (#425)`.

### Task 9: Docs, and prove it

- [ ] **Step 1: Docs.**
  - `docs/ARCHITECTURE.md`:
    - the "Board tap rules" entry says the drawers and rows run on it, through `board-host`;
    - the drawer and row entries describe them as painters;
    - add the new modules.
  - `docs/ui-audit.md`, only if a selector changed.
  - The spec's slivers list: I2 splits into I2a (#425), I2b (#426) and I2c (#427).
- [ ] **Step 2:** `grep` shows one settle judge, one hold and one freeze for the drawers in non-test `src`: the model's. There is no `settlingFor`, no `holdTimer` and no `wanted`/`frozen` map left. Record the grep in the ledger.
- [ ] **Step 3:** `npm run gate -- full` once, in the background, with the source untouched while it runs. Expected: every step passes.
- [ ] **Step 4:** The ship-sitting skill: a final whole-branch review on the most capable model, then the PR `Fixes #425`.
