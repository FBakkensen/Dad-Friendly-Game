# One press-feedback mechanism (I2c-3, #432) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every board control's "is down" feedback runs through one shared mechanism, `pressLook`. Each control still paints its own look, and nothing the player sees changes, including while a finger is held.

**Architecture:**

- `pressLook(target, { enabled, lifts, paint })` lives in `src/card-tap.ts`, beside `trackPress` and `pressOnBoard`, the other pointer helpers the board controls share.
- It owns the down state and the element listeners, and calls the control's own `paint(down)`.
- Each control keeps its class name, frames and timing inside that callback.
- `skin()` takes the down state as a getter, so `board-skin.ts` no longer reads `classList.contains("down")`.

**Tech Stack:** TypeScript, Vitest with happy-dom, and the puppeteer visual check.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part B ("press feedback ('is down') is one mechanism"), and issue #432. The issue's "Done when" is binding.

## Global Constraints

- **No visible change.** Every control's pressed look stays the same: class, frame and timing, including while held. Today's differences between the controls are kept as each control's own options:

  | Control           | Primary button only | Lifts on                                                               | Repaints on lift                                 |
  | ----------------- | ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
  | Rows (`buyOnTap`) | yes                 | up, leave, cancel, and a move past the slop                            | —                                                |
  | Keys              | no                  | up, leave, cancel and click                                            | —                                                |
  | Ready plate guard | no                  | leave and cancel only. The host's press notify repaints it on release. | —                                                |
  | Dig button        | no                  | up, leave, cancel                                                      | lift paints rest only when no timed run is going |
  | Plate buttons     | no                  | up, leave, cancel                                                      | —                                                |

  No control gains or loses a class. Today the plate guard and the dig button repaint on leave even when not down. The new `lift` is a no-op when not down; that is the one permitted difference, because both repaints set the frame the control already shows. Task 1's pins show it.

- **Engineers' timed flash** (`engineers-panel.ts:236–250`, `arm`) is the sixth mechanism: `is-pressed` for `PRESS_MS` from pointerdown. Task 4 does what Flemming chose at plan approval (see the end of this plan).
- **Not press feedback, left alone:**
  - the window's `pointerdown` (`board-window.ts:361`), which records where the finger landed;
  - `trouble-tap`'s hold timer;
  - the document `pointerdown` that puts the New sign away;
  - CSS `:active` on the legacy sheets (`style.css` 743–745, 2158–2170, 2368–2370), which the browser handles; B6–B8 replace those sheets.
- **No new listeners outside the elements:**
  - Only element listeners. No document or window listener: `mountain-screen-order.test.ts` pins those.
  - Registration order on each element stays the same. Where a control's own `click` or `pointerdown` handler must run before or after the look's, keep today's order.
- **Ceilings and coverage:**
  - Every function touched stays within its ceiling. `createEngineersPanel` is at exactly 845 lines; if Task 4 touches it, the change must be net zero.
  - No new entry in either ceilings list.
  - Each task runs `npm run functions`, `npx knip`, `npm run cycles`, and the whole-suite coverage measure for `src/card-tap.ts`, then keeps its floor:

    ```
    npx vitest run --coverage.enabled --coverage.include='src/card-tap.ts' --coverage.reporter=text --coverage.thresholds.lines=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.statements=0
    ```
- **Tests:**
  - Do not edit `src/mountain-screen.test.ts`, `src/mountain-screen-crew.test.ts` or `src/mountain-screen-lifecycle.test.ts`; the parallel #428 session owns them.
  - Every other existing test stays unchanged unless a task names it.
- **Workflow:**
  - Commit messages are a plain sentence ending ` (#432)`.
  - Never edit `src` while a full gate or visual check runs.
  - The verification ladder: the test file, `npm run gate -- fast`, then `VISUAL_ONLY` and `npm run play`, then the controller runs the full gate once.

## Review Focus

1. **A finger held on a control:** its pressed look stays until the finger lifts or leaves. Pinned by Task 1's visual section.
2. **A second tap on the Ready plate before its repaint:** the guard shows pressed again. `pointerdown` always sets down, even when the state says it is already down. Pinned in Task 2's `pressLook` tests and Task 1's plate pins.
3. **A plate button that resizes while held** keeps its pressed skin. `skin`'s resize repaint asks the getter, so it does not reset the skin. Pinned in Task 3.
4. **A disabled control:** pressing it shows no down look. Pinned for each control in Task 1.
5. **A right-click or a non-primary press:** rows ignore it. The other controls show a down look today, and they still do. Pinned in Task 1.

---

### Task 1: Pin today's press looks

**Files:**

- Create: `src/press-looks.test.ts` (happy-dom)
- Modify: `scripts/visual-check.mjs`, to add a section `press looks`

**Interfaces:**

- Produces: pins that the later tasks keep green unchanged.

- [ ] **Step 1: Write the happy-dom pins against today's code.** For each control, dispatch `pointerdown` (button 0), `pointermove` past 10px (rows only), `pointerup`, `pointerleave`, `pointercancel` and `click`. After each event, record the state:

  | Control                                                | What to record                                                                                                                     |
  | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
  | Key, from `createKeyRail`                              | `is-down`, and the cap's `backgroundPosition`                                                                                      |
  | Plate button, from `plateButton`                       | the `down` class                                                                                                                   |
  | Ready plate, from `createReadyPlate` with a ready pick | the guard's `backgroundPosition`. Also: a second `pointerdown` after an `up` with no repaint, and a press while a Done hold is up. |
  | Dig button, from `createDigButton`                     | the sprite's `backgroundPosition`, with fake timers for the click's timed run                                                      |
  | Row, from `buyOnTap` on a card and button              | `is-pressed`                                                                                                                       |

  Add these cases:
  - each control while disabled;
  - each control with `button: 2`.

  Assert literal values from one run on today's code. Use the helpers the existing tests use for each part, such as `board-keys.test.ts` and `board-ready.test.ts`. Read those files first.

- [ ] **Step 2: Add a visual-check section `press looks`.** It uses `holdThrough` (`scripts/visual-check.mjs:5159`) on the mid save at 424x924. While held, it checks:
  - a rail key shows `is-down` and its cap's down frame;
  - a plate button (the save drawer's Try again, or the Relic shelf key) shows `down`, and its canvas pixels differ from its released canvas;
  - the Ready plate's guard shows the pressed frame;
  - the dig sprite shows the down frame;
  - a Buys row shows `is-pressed`.

  After the lift, each control is back to its rest look. Follow the file's existing section and `check` style.

- [ ] **Step 3:** Run `npx vitest run src/press-looks.test.ts` and `VISUAL_ONLY='^press looks' npm run visual`. Expect both to pass on today's code.
- [ ] **Step 4:** Run `npm run gate -- fast` and `npx knip`, then commit "Pins every board control's press look before they share one mechanism (#432)".

### Task 2: `pressLook`, and the keys and rows on it

**Files:**

- Modify: `src/card-tap.ts`, `src/card-tap.test.ts`, `src/board-keys.ts`

**Interfaces:**

- Produces in `card-tap`:

  ```ts
  export type PressLift =
    "pointerup" | "pointerleave" | "pointercancel" | "click";
  export function pressLook(
    target: HTMLElement,
    options: {
      /** Whether this pointerdown shows the down look; rows also check the primary button here. */
      readonly enabled: (event: PointerEvent) => boolean;
      /** The events that lift the look, registered in this order. */
      readonly lifts: readonly PressLift[];
      /** The control paints its own look. */
      readonly paint: (down: boolean) => void;
    },
  ): { readonly isDown: () => boolean; readonly lift: () => void };
  ```

  - `pointerdown`, when `enabled(event)` holds, sets down and calls `paint(true)`. It does this even when the state is already down.
  - `lift()` and each lift event do nothing when not down. Otherwise they clear down and call `paint(false)`.

- [ ] **Step 1: Write failing tests** in `src/card-tap.test.ts`:
  - "an enabled press paints down, and each lift event paints up once";
  - "a press that is not enabled paints nothing";
  - "a lift when not down paints nothing";
  - "a second press while down paints down again";
  - "lift() lifts from code, as the rows' slop does";
  - "only the listed events lift".
- [ ] **Step 2:** Run them and expect them to FAIL. Implement `pressLook`, then run them and expect them to PASS.
- [ ] **Step 3: Move the keys onto `pressLook`.** In `board-keys.ts`, the key's `down`, `up` and `pointerdown` code becomes:

  ```ts
  pressLook(key, {
    enabled: () => !disabled,
    lifts: ["pointerup", "pointerleave", "pointercancel"],
    paint: (down) => {
      /* is-down and the cap frame */
    },
  });
  ```

  The key's own `click` listener calls `look.lift()` before `onKey`, as `up()` does today. `render` reads `look.isDown()` where it read `down`.

- [ ] **Step 4: Move the rows onto `pressLook`.** In `buyOnTap`, the `is-pressed` add and remove become:

  ```ts
  pressLook(card, {
    enabled: (event) => event.button === 0 && !button.disabled,
    lifts: ["pointercancel", "pointerleave", "pointerup"],
    paint: (down) => card.classList.toggle("is-pressed", down),
  });
  ```

  The slop branch calls `look.lift()`. Keep the existing `pointerdown`, `pointerup` and `pointercancel` handlers for arming and judging, and the order in which each element's listeners are registered. If a lift has to run before the judging `pointerup`, register the look first.

- [ ] **Step 5:** Run `npx vitest run src/card-tap.test.ts src/press-looks.test.ts src/board-keys.test.ts src/board-row.test.ts src/workshop-panel.test.ts` and expect PASS, with the pins unchanged. Then run the per-task checks.
- [ ] **Step 6: Commit** "The keys and the rows show their press through one shared pressLook (#432)".

### Task 3: Plate buttons, the skin, the Ready plate and the dig button

**Files:**

- Modify: `src/board-save.ts` (`plateButton`), `src/board-skin.ts` (`skin`), `src/board-ready.ts`, and their test files if a new test belongs there

**Interfaces:**

- Changes: `skin(host: HTMLElement, kind: SkinKind, pressed?: { readonly kind: SkinKind; readonly down: () => boolean }): () => void`.
  - `paint` picks `pressed.kind` when `pressed.down()` is true.
  - Its resize observer's repaint asks the getter too.
  - `plateButton` is the only caller.
- [ ] **Step 1: Write a failing test** in `src/board-skin.test.ts`, or create it if absent: "a pressed skin asks its getter on every paint, the resize repaint included". Stub `ResizeObserver` and count the getter's calls. Run it and expect it to FAIL.
- [ ] **Step 2: Implement the skin change.**
  - Use `pressLook(b, { enabled: () => true, lifts: ["pointerup", "pointerleave", "pointercancel"], paint: (down) => { b.classList.toggle("down", down); repaint(); } })`.
  - Pass `skin(b, "key", { kind: "keyp", down: () => look.isDown() })`, a late arrow.
  - Delete the `classList.contains("down")` read in `board-skin.ts` and its comment's ".down" contract.
- [ ] **Step 3: The Ready plate's guard.**
  - Use `pressLook(button, { enabled: () => holding() === undefined && !button.disabled && pick?.kind === "ready", lifts: ["pointerleave", "pointercancel"], paint: (down) => { if (down) frameX(guard, GUARD_FRAME.pressed, GUARD_PX); else paint(); } })`.
  - Register it where today's `pointerdown`, `pointerleave` and `pointercancel` listeners sit, so it comes after `wirePlatePress`.
- [ ] **Step 4: The dig button.**
  - Use `pressLook(button, { enabled: () => !button.disabled, lifts: ["pointerup", "pointercancel", "pointerleave"], paint: (down) => { if (down) run(DIG_DOWN, []); else if (pressTimer === undefined) frame(DIG_REST); } })`.
  - The `click` handler and `echo` stay as they are, and the `click` listener stays after the look's listeners.
- [ ] **Step 5:** Run `npx vitest run src/press-looks.test.ts src/board-skin.test.ts src/board-ready.test.ts src/board-save.test.ts src/board-relics.test.ts src/board-drawer.test.ts` and `VISUAL_ONLY='^(press looks|bays and ready|keys and drawers)' npm run visual`, and expect PASS, with the pins unchanged. Then run the per-task checks.
- [ ] **Step 6: Commit** "The plate buttons, the Ready plate and the red button show their press through pressLook, and the skin is told whether it is down (#432)".

### Task 4: Engineers' flash and the docs

**Files:**

- Modify: `src/engineers-panel.ts` (only with Flemming's option A), `docs/ARCHITECTURE.md`

- [ ] **Step 1 (option A only): Route `arm` through `pressLook`.**
  - Use `pressLook(target, { enabled: () => !target.disabled, lifts: [], paint: (down) => { if (down) { /* today's pressedKey, requestRender and PRESS_MS timer */ } } })`.
  - The flash keeps its `PRESS_MS` timing and its `is-pressed` render. `createEngineersPanel` must stay at 845 lines or under (`npm run functions`); lower its ceiling if it comes down.
  - Run `npx vitest run src/engineers-panel.test.ts src/mountain-screen-crew.test.ts -t "press"`, and expect PASS unchanged. That runs the crew file without editing it.
- [ ] **Step 2: Docs.** In `docs/ARCHITECTURE.md`'s board section, say:
  - every board control's "is down" look goes through `pressLook` in `card-tap`, and each part paints its own look;
  - `skin` is told whether its host is down;
  - with option B, Engineers' timed flash stays until B6.
- [ ] **Step 3:** Run the per-task checks and `npm run gate -- fast`, then commit "The docs name pressLook as the board's one press mechanism (#432)". Name the Engineers flash in the message if it moved.

### Task 5: Proof (controller)

- [ ] Run `VISUAL_ONLY='^(press looks|section 1 |bays and ready|keys and drawers)' npm run visual`.
- [ ] Run `npm run play` on the early, mid and late saves: Buys, hold-free taps on a key, the plate and the dig button.
- [ ] Then the full gate, the final review and the PR, through ship-sitting.

---

**Flemming's choice at plan approval:** Engineers' timed `is-pressed` flash.

- **A:** route it through `pressLook` in Task 4. Then #432's "one mechanism" holds literally.
- **B:** leave it for B6 (#374), which rebuilds Engineers on the shared rows, and amend #432's body to say so.
