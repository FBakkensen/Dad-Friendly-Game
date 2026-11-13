# A found relic feels like a find (#523)

**Goal:** digging up a relic is the biggest moment of a run, and the reveal should look like it. Today it is the 24px socket icon at 48px in an empty frame, it just appears, and it says the power twice. After this sliver the relic is the gold 64px sprite at 2×, it rises into place with light around it, and one line says what it does. All six relics share the reveal.

**Not in this sliver:** the Legend page, a found relic's detail page and its keepsakes, depths and powers, sound, and anything on the board before the drawer opens (the socket lighting first is its own issue).

**Must not happen:** the phone page scrolls; a blur, glow filter or soft fade (the board is hard pixels and hard steps); a wait he cannot skip; motion with reduced motion on.

## Approaches

- **A. The relic rises and shines (picked, Flemming 13 Nov).** The relic climbs in hard steps and lands; pixel light dashes around it turn a notch at a time; the words step in under it.
- **B. Big and still.** Same page, nothing moves. Cheapest, but it still just appears, which is half of what felt flat.
- **C. The board reacts first.** The socket lights before the drawer opens. The best moment, but it touches the board, the drawer's opening and the away-card order: its own issue.

Art (Flemming 13 Nov): the gold sprites already in `src/assets/relics/`, not the 24px board icons scaled up and not new PixelLab art. No credits spent.

## Design

- **The relic.** `src/assets/relics/<relic>.png` at exactly 2×, centred in a 128px box (the files are 52 to 62px, so 104 to 124px on screen), `image-rendering: pixelated`. Only the reveal uses it; the detail page, the shelf and the Legend keep the 24px icons.
- **The rise.** When the reveal page is shown, the relic comes up from below its place in hard steps (`steps()`, like the cards' rise) and lands. It starts after the drawer's own 0.24s slide and is done within about half a second.
- **The light.** Around the relic, short dashes of art-pixel blocks at the eight compass points, drawn in CSS in a warm amber token (no new art, no filter, no gradient edge). Two frames, near and far, swapped slowly for as long as the page is open.
- **The words.** Kicker, then after the relic lands: "You found the …", "The virtue of ….", and one line (below). They step in whole, not faded.
- **The plate.** Carry it with pride is on the page from the start and is guarded by the drawer's existing settle, nothing new. An early tap carries the relic, which loses nothing: it is on the shelf.
- **Reduced motion.** No rise and no swap: the relic, the dashes (near frame) and the words are simply there.
- **Replays.** Each reveal plays once when its page is shown: the idle repaint does not restart it, and a second relic found right after the first plays its own.

## The one line (copy, for Flemming's approval)

| Relic   | Kept on the reveal                                                                                           | Dropped from the reveal                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Lantern | Your power: Golden veins appear 40% sooner, and it lights the way to the next relic.                         | It lights the way to the next relic, and golden veins glint more often.                                             |
| Shield  | Your power: Your crew keeps mining up to 24 hours while you're away.                                         | Your crew keeps mining for a whole day while you're away, not just 8 hours.                                         |
| Hammer  | Your power: Unlocks the Great Machine.                                                                       | The Great Machine can be built, the mightiest crew of all.                                                          |
| Heart   | Your power: Away pay grows the longer you're gone, up to ×1.5 after 12 hours.                                | The longer you're away, the harder your crew works: up to half again the away pay after 12 hours.                   |
| Crown   | Your power: Kid workers join the crew: they mine, count as workers, and make every worker and kid 2% faster. | The same sentence with "each one makes".                                                                            |
| Mantle  | You reached the bottom of the mountain. Every dad who keeps showing up is a hero.                            | Your power: Ends the run as a Legend. Pass the mine to your kid when you are ready. (The Legend page says it next.) |

No new words: every kept line is in the game today.

## Shared module

- `src/relic-pages.ts#createRevealPage` holds the reveal and keeps doing so. It stops sharing `relicHead`'s art with the detail page; the detail page is not changed.
- The gold art gets one home beside `RELIC_LIT` in `src/board-relics.ts` (`RELIC_GOLD`), imported straight from `src/assets/relics/`.
- `Relic.power` is read only by the reveal. It goes; the Mantle's sentence stays as the reveal's one exception.
- The motion is CSS in `src/board.css`, next to `.relic-page`, with its reduced-motion rule in the board's existing block.

## Left to the builder

Exact step counts and timings inside the bounds above, the dashes' size and colour token, and how the browser checks hold still on a looping page (follow what the engineer walker's loop does).

---

# The relic reveal: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the reveal page shows the gold relic at 2× with pixel light around it, it rises in hard steps, and one line says what it does.

**Architecture:** all of it stays in the relics drawer's reveal page. `relic-pages.ts#createRevealPage` builds a stage (the light and the gold sprite) and one line; `board.css` holds the motion beside `.relic-page`; `relics.ts` loses `power`. No save field, no model state, no new module.

**Tech stack:** TypeScript, Vitest with happy-dom, plain CSS keyframes with `steps()`, puppeteer-core checks (`npm run visual`, `npm run play`, `npm run audit:ui`).

**Spec:** the design above, in this file.

## Global constraints

- Art at exactly 2× (`--art` is 2 CSS px), `image-rendering: pixelated`, no CSS filter, no blur, no eased or faded motion: `steps()` only.
- The phone page never scrolls, at every viewport the visual check runs.
- `prefers-reduced-motion: reduce`: no rise, no swap, everything in place.
- No new words. The kept lines are the table above, verbatim.
- The detail page, the shelf and the Legend page render exactly as today.
- No function over 150 lines or cognitive complexity 15.
- Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test file, `npm run gate -- fast`, the reveal's visual sections (they are in `scripts/visual/cards.mjs`; run `VISUAL_ONLY` with a regex that matches the labels it prints) and `npm run play -- --save late tap:.board-window`, then one full gate before the PR.
- Commits are plain sentences ending `(#523)`.

## Review focus

1. **Reduced motion:** the relic, the light and the words are all visible at once. Pinned in Task 3 (the reduced-motion rule test in `style.test.ts`).
2. **The longest page on the smallest phone:** the Crown's line is three lines. The reveal fits with no scroll. Pinned in Task 1 by `relicPageFits` in the visual check, which runs the reveal at every viewport; add a Crown reveal to what it opens if no section reveals the Crown.
3. **Two relics back to back:** the second reveal plays its own entrance. Pinned in Task 3 (`paint` restarts the entrance; unit test on the class).
4. **Closing mid-rise:** Back, the scrim or Escape during the entrance still carries the relic. Pinned in Task 3 by one `relic-panels.test.ts` test that closes right after the page is shown.
5. **The small sprite:** the Heart is 52px (104 on screen), the others up to 62. Each is centred in the 128px stage, never stretched. Pinned in Task 1 (the art has no `width` or `height` attribute; it shows at its file size, doubled).

---

### Task 1: The gold relic and its light, standing still

**Files:**

- Modify: `src/board-relics.ts` (add `RELIC_GOLD`)
- Modify: `src/relic-pages.ts` (`createRevealPage`)
- Modify: `src/board.css` (after `.relic-page-boost`)
- Modify: `src/style.test.ts` (the selector list near line 61)
- Test: `src/relic-pages.test.ts`; fix `src/mountain-screen.test.ts:1256,1440` and any other reveal assertion on `.relic-page-art`

**Interfaces:**

- Produces: `export const RELIC_GOLD: Readonly<Record<RelicId, string>>` in `board-relics.ts`, imported from `./assets/relics/<relic>.png`.
- Produces: on the reveal page, `div.relic-reveal-stage` holding `span.relic-reveal-light` (`aria-hidden="true"`) and `img.relic-reveal-art` (`alt=""`, not draggable, no width or height attribute). The reveal has no `.relic-page-art`.

- [ ] **Step 1: the failing test** in `relic-pages.test.ts`, "the reveal page":

```ts
it("shows the gold relic in its stage, with its light", () => {
  const page = createRevealPage({ board, onCarry: vi.fn() });
  page.paint(relic(0));
  const art = find(page.root, ".relic-reveal-stage > img.relic-reveal-art");
  expect(art.getAttribute("src")).toBe(RELIC_GOLD.lantern);
  expect(art.hasAttribute("width")).toBe(false);
  expect(
    find(page.root, ".relic-reveal-stage > .relic-reveal-light").getAttribute(
      "aria-hidden",
    ),
  ).toBe("true");
  expect(page.root.querySelector(".relic-page-art")).toBeNull();
});
```

The detail page's existing test keeps `RELIC_LIT` on `.relic-page-art` and must still pass.

- [ ] **Step 2:** `npx vitest run src/relic-pages.test.ts` fails on the missing stage.
- [ ] **Step 3: build it.** `createRevealPage` stops calling `relicHead`: it appends the stage, the title and the virtue line itself, in the order kicker, stage, title, virtue, (power until Task 2), boost, plate. `relicHead` and `paintHead` stay for the detail page.
- [ ] **Step 4: the CSS.** `.relic-reveal-stage`: `position: relative; flex: none`, a square of `calc(var(--art) * 64)`. `.relic-reveal-art`: centred in the stage at its file size, doubled with `transform: scale(2)`, `image-rendering: pixelated`. `.relic-reveal-light`: a `calc(var(--art) * 2)` square at the stage's centre with a transparent background, whose `box-shadow` list draws eight dashes in `var(--board-amber-bare)`: three blocks each, on the four axes and the four diagonals, starting 36 art px from the centre (clear of a 62px sprite). Add `.relic-reveal-stage`, `.relic-reveal-art` and `.relic-reveal-light` to the list in `style.test.ts`.
- [ ] **Step 5:** the test file passes; the other reveal assertions read `RELIC_GOLD` on `.relic-reveal-art`; `npm run gate -- fast` is green.
- [ ] **Step 6: look at it.** `npm run play -- --save late tap:.board-window` and the reveal's visual sections. Read the phone shot. **Show Flemming the shot before Task 3**: the light is hand-drawn and is his to approve. If it reads wrong after one adjustment, stop: new art is a PixelLab question.
- [ ] **Step 7:** commit, push.

### Task 2: One line

**Files:**

- Modify: `src/relics.ts` (drop `power` from the type and the six relics)
- Modify: `src/relic-pages.ts`
- Test: `src/relic-pages.test.ts`, `src/mountain-screen-crew.test.ts:3760`, and any other test that reads `power`

**Interfaces:**

- Produces: `export function revealLine(relic: Relic): string` in `relic-pages.ts`. The Mantle's is `You reached the bottom of the mountain. Every dad who keeps showing up is a hero.` Every other relic's is `Your power: ` followed by its `boost`.
- The reveal page has one `p.relic-page-boost` holding it and no `.relic-page-power`. (The Legend page keeps its own `.relic-page-power` cheer.)

- [ ] **Step 1: failing tests.** In "the reveal page": for the Shield, `.relic-page-boost` is `Your power: Your crew keeps mining up to 24 hours while you're away.` and `page.root.querySelector(".relic-page-power")` is null. For the Mantle, `.relic-page-boost` is the hero sentence above, exactly. `RELICS.map(revealLine)` equals the six kept lines of the design's table, written out in the test.
- [ ] **Step 2:** run, see them fail.
- [ ] **Step 3:** implement; delete `power` and its doc comment; the Crown test at `mountain-screen-crew.test.ts:3760` reads `.relic-page-boost`.
- [ ] **Step 4:** tests and `npm run gate -- fast` green (the typecheck proves no reader of `power` is left).
- [ ] **Step 5:** commit, push.

### Task 3: The rise, the swap, and the checks that wait for them

**Files:**

- Modify: `src/board.css` (keyframes beside the reveal's rules; the reduced-motion block near line 795)
- Modify: `src/relic-pages.ts` (`paint` restarts the entrance)
- Modify: `scripts/visual/kit.mjs` and `scripts/ui-audit.mjs` (the reveal's waits)
- Modify: `docs/ART.md`, `docs/ui-audit.md` (the Relic reveal row and its shot, via `npm run audit:ui`), `docs/DESIGN.md` where it describes the reveal
- Test: `src/relic-pages.test.ts`, `src/relic-panels.test.ts`, `src/style.test.ts`

**Interfaces:**

- Consumes: Task 1's stage and Task 2's single line.
- Produces: `paint(relic)` puts `is-entering` on the reveal root afresh each call (remove it, read `offsetWidth` to force a reflow, add it), so the CSS entrance replays.

- [ ] **Step 1: failing tests.** After `paint`, and after a second `paint`, the root has `is-entering`. In `relic-panels.test.ts`: Escape right after the reveal is shown (inside `DRAWER_SETTLE_MS`) dismisses the reveal notice. In `style.test.ts`: the reduced-motion block gives `.relic-reveal-art`, `.relic-reveal-light` and the reveal's stepped-in words `animation: none`.
- [ ] **Step 2:** run, see them fail.
- [ ] **Step 3: the motion,** all `steps()`, the entrance under `.relic-reveal-page.is-entering` with `animation-fill-mode: backwards`:
  - `relic-reveal-rise` on the art: from 40 art px below its place to its place (keeping `scale(2)` in both frames), `0.4s steps(8)`, delay `0.24s` (the drawer's own slide).
  - `relic-reveal-in` on the light, the title, the virtue line and the boost line: from `visibility: hidden`, `0.01s steps(1)`, delays `0.64s`, `0.7s`, `0.76s` and `0.82s`. The plate has no animation.
  - `relic-reveal-shine` on the light, not gated by `is-entering`: two frames, the near `box-shadow` list and the same list 4 art px further out, `3.2s steps(1) infinite`, starting on the near frame.
  - In the reduced-motion block: `animation: none` for all of them.
- [ ] **Step 4: the checks hold still.** In `kit.mjs` and `ui-audit.mjs`, once the reveal page is up, wait until every animation under it that is not infinite has finished (`getAnimations({ subtree: true })`, `effect.getComputedTiming().iterations === Infinity` or `playState === "finished"`). One helper per file, used wherever the reveal page is waited for.
- [ ] **Step 5:** tests, `npm run gate -- fast`, the reveal's visual sections, and play: `npm run play -- --save late tap:.board-window wait:300 wait:1200` (one shot mid-rise, one landed). Read both phone shots and `log.txt`. If `play` has no way to emulate reduced motion, say so in the PR body; do not add one.
- [ ] **Step 6: docs.** `ART.md`: the `src/assets/relics/` sprites are the reveal's art at 2×. `ui-audit.md`: the row says the gold relic at 2× with its light, its virtue, one power line and the plate; regenerate its shot with `npm run audit:ui`. `DESIGN.md`: one sentence where the reveal is described.
- [ ] **Step 7:** commit, push. Then `npm run gate -- full` in the background, once, and the ship-sitting skill.
