# The odometer's point and the gauge's readout (#507) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The odometer's decimal point is big enough to see, the output gauge's readout is 20px, and the needle never hides the multiplier or, at rest, the scale's 0.

**Architecture:** No new module. The point is the same `img` with a 4×4 file. The gauge's counter window becomes a `board-skin` nine-slice of the unchanged `gauge-counter.png` (a new `counter` kind in `src/board-skin.ts`), so it can be 30 art px wide without new art. The multiplier sits on a small plate drawn in CSS above the needle. The marks' places are data in `src/board-gauge.ts`.

**Tech Stack:** TypeScript, Vitest (happy-dom), CSS tokens, the visual check, `npm run play`.

**Spec:** issue #507 (items 5 and 6 of the readability list, parent #504). Flemming approved the list on 2026-11-12 (`/mnt/project-files/readability/1-board-mid.png` shows the point and the readout); there is no separate spec.

## Global Constraints

- No raw px or colour in `board.css` (`npm run tokens`). Art is shown at exactly 2× (the gauge row's `2x` check).
- No PixelLab. `gauge-counter.png` and `gauge-output-sheet.png` do not change. `odo-dot.png` is redrawn by hand, as the issue allows.
- The words do not change: `Stones a second`, the marks `0 5 10 15`, the unit's text, the readout's five characters at most.
- Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test file, `npm run gate -- fast`, the gauge row's visual sections plus `npm run play` on `fresh`, `mid` and `heart`, then `npm run gate -- full` once before the PR.

## Review Focus

- A five-character readout (`12.3K`, `>999T`) at 20px is 54px wide: it must fit the counter's dark window, at the phone and scaled down.
- The counter is in the wedge the needle never enters (135° to 225°): a wider counter must not cover the needle at rest.
- The multiplier's plate must not touch the marks `5` and `10`, with its longest text (`×100T`) and its shortest (`×100`).
- The fallback face is wider than Share Tech Mono: the readout must not be measured before the fonts load.
- The legend one art px lower must still read at 4.5:1 against the face's rim shade.

---

### Task 1: The odometer's point

**Files:**

- Modify: `src/assets/board/odo-dot.png` (4×4, solid `#ece4cc`), `src/board.css` (`.board-odo-dot`)
- Test: `src/style.test.ts`
- Docs: `docs/ART.md` (the asset table)

- [ ] **Step 1: failing test.** `.board-odo-dot` is `calc(var(--art) * 4)` wide and tall, and `odo-dot.png` is a 4×4 PNG (read its IHDR).
- [ ] **Step 2:** run it, see it fail.
- [ ] **Step 3:** redraw the file, set the rule: 4×4 art px, its foot on the figures' baseline (top 23).
- [ ] **Step 4:** `npx vitest run src/style.test.ts`, then `npm run gate -- fast`.
- [ ] **Step 5: see it.** `npm run play -- --save mid` and `--save heart`: the point fills the gap between two drums and reads at arm's length.
- [ ] **Step 6:** commit `The odometer's point is four art pixels (#507)`.

### Task 2: The gauge's readout, multiplier and 0

**Files:**

- Modify: `src/board-skin.ts` (the `counter` kind), `src/board-gauge.ts` (the counter is a skinned span; `MARKS`), `src/board.css` (`.board-gauge-counter`, `.board-gauge-read`, `.board-gauge-unit`, `.board-gauge-legend`), `src/tokens.css` (`--board-gauge-face`, `--board-gauge-rim`)
- Test: `src/board-skin.test.ts`, `src/board-gauge.test.ts`, `src/style.test.ts`, `scripts/visual/gauge-row.mjs`
- Docs: `docs/DESIGN.md` (the output gauge), `docs/ART.md` (the counter's row and the type paragraph), `docs/ARCHITECTURE.md` if it names the counter image, `docs/ui-audit.md` and its shots

**Interfaces (produced):**

- `SkinKind` gains `"counter"`: `gauge-counter.png` 25×11, corners 3 wide, 3 high at the top and 2 at the foot, its middle column and rows repeated; least height 11.
- `GAUGE_MARKS` (exported from `src/board-gauge.ts`): `["0", 29.5, 65.5]`, `["5", 32.5, 32.5]`, `["10", 71.5, 32.5]`, `["15", 72, 65.5]`.
- The counter: `span.board-gauge-counter.board-skinned` at (37, 66), 30×11 art px; the readout at (38, 68), 28×8, `--board-type-20`; the legend at top 78.
- The unit: 22×8 art px centred on (52, 36), `--board-gauge-face` under a one-art-px `--board-gauge-rim` edge.

- [ ] **Step 1: failing tests.** `nineSlicePlan("counter", 30, 11)` stays inside its box and covers every art px once; at 25×11 each blit copies its own place. `skinArtSize("counter", 60, 22)` is 30×11. The gauge's counter is a skinned span with a canvas, not an image. With the hub at (52, 52) and the needle at rest (−135°), the `0` mark's centre is 5 art px or more from the needle's line, on the side the needle rises to; the `15` mark mirrors its height. Style: the readout is `--board-type-20`; the unit has the face token as its background.
- [ ] **Step 2:** run them, see them fail.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the test files, then `npm run gate -- fast`.
- [ ] **Step 5: see it.** A new check in the gauge row's per-save section, after the fonts load: the readout is 20px, and its words and a five-character reading (`12.3K`, `>999T`) fit inside the counter; the unit's plate is clear of the `5` and `10` marks with `×100T`. `VISUAL_ONLY='gauge row' npm run visual`; `npm run play` on `fresh`, `mid` and `heart`.
- [ ] **Step 6:** docs, `npm run audit:ui`, commit `The gauge's readout is 20px and the needle hides no words (#507)`.

## Rulings while building

- The multiplier stays among the marks, on a small cream plate drawn over the needle. Nowhere on the face is clear of the needle's sweep except the wedge under the hub, which holds the counter and the legend; under the counter `×1000` would read as multiplying the readout.
- The `0` (and the `15`, to match) moves up beside its tick, so the needle at rest lies under it, not on it. The needle still passes the `0` between about 50 and 110 stones a second, on the first unit only.
- The counter is 30 art px wide: five characters at 20px need 54px. It is the same art, stretched as the board's other frames are. It sits one art px lower, with the legend, so its corner stays off the resting needle.
