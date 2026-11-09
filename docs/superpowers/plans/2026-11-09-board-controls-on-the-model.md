# Keys, Back, the Ready plate and the bays on the interaction model (#426) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the key rail, the Ready plate and the machine bays take their tap rules from `board-interaction` through the board host, as I2a did for the drawers.

- **Named fix 1:** a double tap on a drawer's Back no longer opens the key under it.
- **Named fix 2:** the plate's Done hold is judged by when the finger came down.
- **Tests:** their tap checks move from the browser to unit tests.
- **Limits:** `createMachineBays` and `createReadyPlate` come within the strict limits.

**Architecture:**

- **One host.** The screen's one host (`board-host`) is created before the rail, and the rail, the plate and the bays take it.
- **One press path.** A board-layer control presses through one shared helper, `pressOnBoard`, moved from the drawer shell into `card-tap`, the home of `trackPress`. The model's `revealed` settle (a finger's close of a drawer) then covers whatever lies under Back.
- **The plate.** Its Done hold becomes the model's hold. It keeps its Done words itself, because the model knows only `held`.
- **The bays.** Their thanks after a fix becomes the model's `fixed` result. It is painted onto the board note when the thanks starts and ends.

**Tech Stack:** TypeScript, Vitest (happy-dom), puppeteer for the browser check.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md` part B, named fixes 1 and 2; issue #426 (parent #411). The code map is `/tmp/claude-0/-workspace-Dad-Friendly-Game/5abd6efc-a118-5eb9-84c3-d46801b70196/scratchpad/i2b-map.md`. It is scratch, so each task copies the facts it needs.

**Shared modules:**

- `src/board-interaction.ts` and `src/board-host.ts` are unchanged.
- `src/card-tap.ts` gains `pressOnBoard`, the shell's helper made shared (it is private in `board-drawer.ts` today).
- `src/board-dom.ts` replaces the helper copies in `board-keys`, `board-ready` and `board-bays`.
- `src/board-note.ts` gains a show with no timer and a guarded hide, for the bay thanks.

No new module.

## Global Constraints

- **No player-visible change except named fixes 1 and 2.**
  - **Named fix 1:** after a finger closes a drawer (Back), a finger press within 400ms on a key, the plate or a bay is ignored.
  - **Named fix 2:** a press whose finger came down inside the plate's Done hold is held, even if it is handled after the hold ends.
- **What stays off the host:** the dig window, the red button, the relic sockets and the save line, so a tap on them is never judged early (map §3). Their behaviour is unchanged.
- **Today's behaviours that stay:**
  - A 6th tap after a 5-tap bay fix opens Buys, because a board control has no hold after a fix.
  - The thanks note lets taps through (`.board-thanks` in the note body).
  - A refused plate buy does nothing and starts no blink.
  - A held Enter on the plate buys once.
- **DOM contracts stay:**
  - `.board-key` with `is-down`, `is-locked`, `aria-expanded` and `data-key`;
  - the plate's `is-done` and `is-saving`, and its aria labels;
  - the bays' `data-trouble` and `is-three`;
  - `.board-note.on` with the `.board-thanks` body;
  - the lamp, cap and guard frames.
- **Strict limits (#422):**
  - Remove `src/board-bays.ts#createMachineBays` (261) and `src/board-ready.ts#createReadyPlate` (171) from `scripts/function-ceilings.json`, so each is within 150 lines and complexity 15.
  - Every function this sliver adds is within the limits.
  - `createDigButton` is 144 lines and has no ceiling, so it must stay at 150 or under.
- **Exact ceilings:**
  - `src/mountain-screen.ts#mountMountainScreen` (1110) and its `>render` (complexity 20) may not grow. This sliver should shrink both, and then their entries are lowered to the measured values.
  - `src/board-save.ts#createSaveLine` (164) and `src/engineers-panel.ts#createEngineersPanel` (845) must not grow either.
- **`src/mountain-screen-crew.test.ts` is at its test worker's heap limit (#428).** New screen tests go in `src/mountain-screen-rail.test.ts` or a new `src/mountain-screen-board.test.ts`.
- **Comments:** no code comment carries an issue number or "until".
- **Verification ladder:**
  1. the test file;
  2. `npm run gate -- fast`;
  3. `VISUAL_ONLY` for the touched sections, plus `npm run play`;
  4. the full gate once before the PR, with the source untouched while it runs.
- **Commits:** a plain sentence ending `(#426)`, with the session trailers.

## Review Focus

1. **A key press stopped by named fix 1 must stop every listener on that key.** The Engineers and Ledger keys open through their panels' own click listeners (`engineers-panel.ts` ~155, `menu-panel.ts` ~50), which are registered after the rail's. So the decision lives in one capture listener on the rail root. Task 2 has a test for this.
2. **Only a finger's close of a drawer settles.** Back by keyboard, Escape, the scrim (tap-through), a key switch, a cover and the update prompt (program) leave a key tap acting at once. Task 2 has a test for this.
3. **A save reload during the plate's Done hold ends it.** The screen's `unloaded` does this now, not `render(undefined)`. Task 3 has a test for this.
4. **The bay thanks painter acts only when the thanks starts or ends.**
   - A note put away by a tap is not shown again on a later repaint.
   - A vein note that replaced the thanks is not hidden when the thanks ends.

   Task 4 has a test for this.

5. **Screen tests that close a drawer by finger, then press a key, the plate or a bay without stepping the clock,** now see the press ignored. Each such test moves its clock past 400ms. Most close with a keyboard click; the audit in Task 2 records each one it finds.

---

### Task 1: One shared board press, and board-dom's helpers in the three parts

**Files:**

- `src/card-tap.ts` and `src/card-tap.test.ts`;
- `src/board-drawer.ts`, which imports `pressOnBoard` instead of defining it;
- `src/board-keys.ts`, `src/board-ready.ts` and `src/board-bays.ts`, for the helper swaps;
- `src/board-dom.ts`, only if a helper is missing;
- their tests.

**Interfaces:**

- Produces `pressOnBoard(target: HTMLElement, board: BoardHost, control: ControlRef, act: (by: Pointer) => void, options?: { capture?: boolean }): { forget(): void }` in `card-tap.ts`, exported. It is the shell's existing helper moved, with its behaviour unchanged.
- The helper copies go:
  - in board-keys: `toggle` becomes `mark`, and `show` becomes `hide(target, !on)`;
  - in board-ready: `strip`, `span` and `words` become `frameX`, `el` and `write`; `defaultFits` becomes `fitsWidth`; the private `fit` becomes `fitFirst` plus `refitAll`; `show`'s class read becomes `mark`; the `aria-label` reads become `setAttr`;
  - in board-bays: `is-three` becomes `mark`, the `.hidden` reads become `hide`, and `defaultFits` becomes `fitsWidth`.
- The `is-down` class read and the `key.disabled` read in `board-keys` become closure state.

- [ ] **Step 1:** Add `pressOnBoard` tests to `card-tap.test.ts`. They cover the shell's existing cases: a finger press is judged by its finger-down time, a key press is never early, a capture listener stops a non-act click, and `forget()`. Run them. Expected: FAIL, because `pressOnBoard` isn't exported yet.
- [ ] **Step 2:** Move `pressOnBoard`, and make the helper and state-read swaps. Every existing test stays green. `createDigButton` stays at 150 lines or under.
- [ ] **Step 3:** Run the touched test files, then `npm run gate -- fast`. Expected: PASS, with lower ceilings for any listed function that shrank.
- [ ] **Step 4:** Commit: `The board's controls share one press helper and board-dom's helpers (#426)`.

### Task 2: The keys press through the host, which is named fix 1

**Files:**

- `src/board-keys.ts` and `src/board-keys.test.ts`;
- `src/mountain-screen.ts`: the host moves above the rail, net 0 lines;
- `src/mountain-screen-rail.test.ts`.

**Interfaces:**

- `createKeyRail({ board, onKey })`. Each key presses as `{ layer: "board", id: "key:<id>" }` through `pressOnBoard`, with one capture listener on the rail root.
- On `act`, the click goes on: `onKey` and the panels' own listeners. On any other decision, the click stops before it reaches any listener on the key.
- A keyboard key press always acts.
- The press frame (`is-down`, the cap's down frame) stays as it is today.

- [ ] **Step 1: Failing tests.**
  - `board-keys.test.ts`:
    - "a finger press on a key right after a finger closed a drawer reaches no listener";
    - "a keyboard press acts at once";
    - "past the settle, the key acts".
  - `mountain-screen-rail.test.ts`, named fix 1 on the screen:
    1. Finger-tap the Buys key, step the clock 500ms, and finger-tap Back.
    2. Step 150ms and finger-tap the Engineers key: `.engineers-dialog` stays hidden. A finger-tap on the Upgrades key leaves Upgrades shut.
    3. Step 400ms: the key opens.
  - Also on the screen:
    - "Back by keyboard, then a key tap opens at once";
    - "the scrim's close leaves a key tap acting".
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Create the screen's host before the rail, net 0 lines.
  - Audit the screen test files (`mountain-screen*.test.ts`) for a finger close of a drawer followed by a finger press on a key without a clock step. Fix each one by stepping the clock, and list them in the report.
- [ ] **Step 4:** Run the rail and keys tests, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5:** Commit: `A double tap on a drawer's Back no longer opens the key under it (#426)`.

### Task 3: The Ready plate holds Done through the model, which is named fix 2

**Files:**

- `src/board-ready.ts` and `src/board-ready.test.ts`;
- `src/mountain-screen.ts`: `createReadyPlate({ board, onTap })`, net ≤ 0;
- a new or rail screen test file.

**Interfaces:**

- `createReadyPlate({ board, onTap })`. The plate presses as `{ layer: "board", id: "ready" }` through `pressOnBoard`, and calls `onTap` only on `act`.
- **On `bought`:** set `done = { tier, count, gain }` first, then send `{ kind: "result", control, at: board.clock(), outcome: "applied" }`.
- **On `opened` or `nothing`:** no result, so no hold. A throw sends nothing either.
- **While the view holds `board/ready` and `done` is set,** paint Done. Otherwise paint the latest pick.
- **Ruling:** while held, `disabled` keeps the value it had when the hold began, as today. The latest pick paints when the hold ends.
- **The hold's timer is the host's.** `holding` and `holdTimer` go.
- **A save reload ends the hold through the screen's `unloaded`.** `render(undefined)` no longer does.
- **`createReadyPlate` comes within the limits.** It splits into `buildPlate`, `paintPlate` and `wirePlatePress`. Remove its ceiling entry.

- [ ] **Step 1: Failing tests.** In `board-ready.test.ts`, rewrite the hold tests (~232, 266, 290, 304, 316, 364) onto a host with a fake clock: the double tap, a key repeat, a throw, a render during a tap, a reload (send `unloaded`), and the guard frame not while held. Add:
  - "a press whose finger came down inside the Done hold is held, even if handled after it";
  - "a finger press on the plate right after a finger closed a drawer is ignored".
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the ready tests and the plate parts of `mountain-screen.test.ts` (~2603–2995), then `npm run gate -- fast`. Expected: PASS. "A held Enter buys one" stays green.
- [ ] **Step 5:** Commit: `The Ready plate holds Done through the board's model, judged by when the finger came down (#426)`.

### Task 4: The bays press and thank through the model

**Files:**

- `src/board-bays.ts` and `src/board-bays.test.ts`;
- `src/board-note.ts` and its test;
- `src/mountain-screen.ts`: `thankFix` and `bayThanks` go; lower the ceilings;
- a new or rail screen test file.

**Interfaces:**

- `createMachineBays({ board, note, onOpen, onTrouble })`.
- `onTrouble: (tier: TroubleTier, how: "press" | "hold") => boolean` returns whether the trouble is gone.
- Each bay presses as `{ layer: "board", id: "bay:<index>" }`:
  - a troubled bay is `intent: "trouble"` and always acts;
  - otherwise it is `intent: "act"`, which opens Buys.
- When the trouble is gone, the bay sends `{ kind: "result", control, at, outcome: "fixed" }`. The model thanks a board control with no hold.
- `watchFixHold` stays, and its fix goes the same way with `how: "hold"`.
- **Ruling:** today's `before?.tier === tier` guard in `thankFix` goes, as in `crew-panel`'s fix.
- **The bays subscribe to the host and paint the thanks on changes only.**
  - When `view.thanks` gains `board/bay:<i>`, show the board note at that bay with the `.board-thanks` body and no timer.
  - When it loses it, hide the note only if it still shows that body.
- `board-note` gains `show(anchor, body, { ms?: number })`, where no `ms` means no timer, and `hideIf(body)`.
- `createMachineBays` comes within the limits through `buildBay`, `wireBayTaps`, `paintBay`/`paintLoading`, `createBayFit` and `createDrill`. Remove its ceiling entry.
- **The screen's budget:** `createMachineBays({ board, note: boardNote, onOpen: openBuys, onTrouble })` replaces `thankFix` and `bayThanks`, and the parked-note loop in `render` becomes one parked note. Lower `mountMountainScreen` and `>render` to the measured values.

- [ ] **Step 1: Failing tests.**
  - `board-bays.test.ts`:
    - "a fix shows the thanks on the bay and it goes after 1.6s";
    - "a note put away by a tap is not shown again on a later repaint";
    - "a vein note that replaced the thanks is not hidden when the thanks ends";
    - "an open-Buys tap right after a finger closed a drawer opens nothing";
    - "a 6th tap after a 5-tap fix opens Buys".
  - The board-note tests: a show with no timer, and `hideIf`.
  - The screen test "a troubled bay fixes and thanks" (~1903) stays green.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the bays, board-note and screen tests, then `npm run gate -- fast`. Expected: PASS, with the screen's ceilings lowered.
- [ ] **Step 5:** Commit: `The bays press and thank through the board's model, and their parts split small (#426)`.

### Task 5: The rail, plate and bay browser checks lose their sleeps

**Files:** `scripts/visual-check.mjs`.

- [ ] **Step 1: Drop the tap-rule checks that the unit tests now cover, with their sleeps and retries:**
  - the plate's double tap (sleep ~5456);
  - waiting out the hold (2,100ms, ~5487);
  - the Saving for double tap retry (~5502–5552);
  - the bay double tap retry (~5559–5603, with `putNoteAway`);
  - `doubleTap` and `SETTLE_TRIES`, if nothing else uses them.

  Keep one wiring check per family with the held tap clock (`tapClock: "held"`, `stepTapClock`) and `noteAway`:
  - a plate tap buys and paints Done;
  - a Saving for tap opens Buys and spends nothing;
  - a bay tap opens Buys;
  - five trouble taps fix a bay, and the thanks note lets taps through.

- [ ] **Step 2: Replace the remaining fixed sleeps with page conditions:**
  - the 5-tap gap (~5639);
  - the hold-to-fix 700 and 300ms (~5698, ~5699): press down, wait for `data-trouble` to clear, release;
  - the drill frames (~5776, ~5780): wait for the icon's `backgroundPositionX` to change;
  - "Loading your save" (~5850);
  - the rail's 1,100ms (~6162): wait for its images and fonts.

  `putNoteAway` stays only where an out-of-scope section uses it.

- [ ] **Step 3: Add one named fix 1 browser check.**
  1. With the held clock, open Buys, step past the settle, and finger-press its Back.
  2. Without a step, press at Back's centre point: no sheet or panel opens.
  3. Step past the settle and press again: the key opens.
- [ ] **Step 4:** Run `VISUAL_ONLY` for the bays and ready, the rail, and the keys and drawers sections. Then run `npm run play -- --save early label:Ready wait:900 tap:.board-ready-plate` (or the plate's selector) and a bays play. A grep shows no fixed sleep or retry left in those sections. Expected: all pass.
- [ ] **Step 5:** Commit: `The rail, plate and bay browser checks wire each control once, with no sleeps or retries (#426)`.

### Task 6: Docs, and prove it

- [ ] **Step 1: Docs.**
  - `docs/ARCHITECTURE.md`: the keys, the plate and the bays as painters of the model, `pressOnBoard` as the one board press, and named fix 1. Drop the "until I2b they keep their own copies" lines.
  - `docs/DESIGN.md`: one sentence for named fix 1, near the settle (~107).
- [ ] **Step 2:** A grep shows one settle judge, one hold and one thanks in non-test `src`: the model's. `holdTimer` remains only in `trouble-tap`'s 600ms hold-to-fix. Record the grep in the ledger.
- [ ] **Step 3:** `npm run gate -- full` once, in the background, with the source untouched while it runs. Expected: every step passes.
- [ ] **Step 4:** The ship-sitting skill: a final whole-branch review on the most capable model, then the PR `Fixes #426`.
