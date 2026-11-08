# Control Board B2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The top and bottom of the control board go live (#370): a 424×924 stage fitted to any screen, the relic plate, the stock row (odometer and boost dial, with the Running now note), and the save line with its save drawer. Today's layer line, crew line, rock, teach note and thumb bar stay between them, on the enamel.

**Architecture:**

- `#app` becomes the board stage: exactly 424×924 CSS px, centred, scaled uniformly by `--board-scale` (`src/board-fit.ts`, replacing `src/pc-zoom.ts`). `contain: layout` keeps today's fixed sheets inside it, as it does today.
- The board's top (relic plate and stock row, 176px) and the save line (bottom 56px) are absolutely placed children of `#app`. Today's flex column keeps flowing between them through `#app`'s padding, so its CSS keeps working.
- Pure rules live in their own modules with unit tests: `board-fit.ts`, `odometer.ts`, `crew-boost.ts`, `board-skin.ts` (the 9-slice plan). DOM parts live in `board-*.ts` modules that take `getView` and callbacks, like today's panels. `mountain-screen.ts` keeps its wiring and mounts them.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom for DOM tests), puppeteer-core scripts (`visual-check.mjs`, `ui-audit.mjs`, `play.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-07-control-board-design.md` (the B2 row, "The board, top to bottom" items 1, 2 and 7, "Sheets" for the drawer motion, "Rules the board keeps", "Checks"). Reference mockup: `mockups/control-board/index.html` (its CSS and script are the source for sizes, art offsets, the 9-slice table and the odometer roll).

## Global Constraints

- **UI only.** No change to rules, numbers, prices, saves or the lab. Reading a rules module is fine; exporting an existing private helper is fine.
- **Art.** Every graphic is PixelLab art from `mockups/control-board/assets/art/ind-board/`, copied (not moved: the mockup must still open) into `src/assets/board/` and imported as today. Shown at exactly 2× (one art px = two CSS px), `image-rendering: pixelated`, no CSS filters. No placeholder boxes.
- **CSS tokens.** New CSS has no raw px or colours (`npm run tokens`). Raw values live in `src/tokens.css`: `--art: 2px` (one art pixel), board sizes, and the board palette copied from the mockup's `:root` (`--board-ink #d9ddd0`, `--board-ink-2 #b3bcae`, `--board-ink-plate #050607`, `--board-ink-bare #eceee4`, `--board-amber-bare #ffd38c`, `--board-amber #e8ac4c`, `--board-green #9fcf86`, `--board-rust #e39a78`, `--board-night #0b0e0f`, `--board-enamel #1a2421`). Board CSS writes sizes as `calc(var(--art) * N)` with N in art pixels, or names a token. Board CSS goes in a new `src/board.css`, imported in `main.ts` after `style.css`.
- **Fonts.** Barlow Condensed 500/600/700 and Share Tech Mono 400, latin woff2 only, copied from the `@fontsource/barlow-condensed` and `@fontsource/share-tech-mono` npm packages (5.x, OFL) into `src/assets/fonts/` with their `OFL.txt`. Declared with `@font-face` in `board.css`, `font-display: block`. Not a dependency; not loaded from Google.
- **Copy.** Today's words stay. New strings (list them in the PR for Flemming): "Relics of Fatherhood · N of 6", "Stones", "left", "rested", "Crew" (the rested dial legend), "Running now", "Nothing running", "· Kept on this phone", "Details", "Your save", "Account", "On this phone", "Last try", "Not signed in", "Close", "Try again", "Sign in", and the error drawer line "Every stone is kept on this phone and goes up when the cloud answers. Nothing is lost." No "?" in player text.
- **Targets** at least 48×48 CSS px with 8px gaps at 424×924 (each relic socket's button is 56px; the dial button is 88px; the save line is 408×54). **Text** at least 13px. Numbers in Share Tech Mono with tabular figures.
- **Motion.** Hard steps only: drums roll in `steps(4)` over 160ms; drawers slide in `steps(6)` over 240ms. `prefers-reduced-motion: reduce` turns both off. Nothing bounces.
- **Close is pause.** Saving is untouched: no new writes, no swallowed failure. `.save-status` keeps `data-kind` and `data-log` (the scripts read them).
- **Sizes.** The gate's phone is 424×924; its PC sizes are 1280×800, 1366×768 and 1440×900. 412, 440, 375 and 830 go from the visual check, the UI audit and `npm run play`.
- **Commits** are a plain sentence ending `(#370)`, with the session trailers. Push the branch after each task (`git push -u origin claude/beautiful-thompson-t7oje5`).

## Review Focus

1. **Huge and odd pockets.** 0, 99,999, 100,000, 999,999, 1e9 and 1e15+, and a NaN or negative pocket from a bad save. Drums never overflow five faces, round down, and read ">999T" at the top. Pinned in Task 3.
2. **Two crew timers at once.** Overtime ×2 with axle grease running: the dial shows the strongest, a tie goes to the most time left, and its multiplier is the one `effectiveRates` uses. Pinned in Task 4.
3. **The save line in every state, including signed out and the error state at 424px.** "Couldn't reach your save · Kept on this phone · Details" must fit 408px at 13px, and a tap opens the drawer with the sign-in button when unsigned. Pinned in Tasks 6 and 9.
4. **Screens that are not 924 tall.** 424×830 (Chrome with its bar) and a 2560×1440 monitor: the whole board scales, nothing rearranges, the page never scrolls, and the scale never exceeds 1. Pinned in Task 1.
5. **A canvas that cannot draw.** happy-dom and a failed art load have no 2D context: skins must no-op, never throw. Pinned in Task 2.

---

### Task 1: The stage and the fit

**Files:**

- Create: `src/board-fit.ts`, `src/board-fit.test.ts`, `src/board.css`
- Delete: `src/pc-zoom.ts`, `src/pc-zoom.test.ts`
- Modify: `src/main.ts` (call `trackBoardFit()` instead of `trackPcZoom()`, import `./board.css` after `./style.css`), `src/tokens.css` (board tokens), `src/style.css` (the `#app` rule at the "One phone layout everywhere" comment, near line 4699; the `#app` padding rules near lines 35 and 3390), `vite.config.ts` coverage floors (move the `pc-zoom` floor, if any, to `board-fit`)

**Interfaces:**

- Produces: `BOARD_WIDTH = 424`, `BOARD_HEIGHT = 924`, `boardFit(width: number, height: number): { readonly scale: number; readonly desk: boolean }`, `trackBoardFit(win?: Window): void` (sets `--board-scale` on `<html>` and toggles `body.desk`, on load and on resize). CSS: `#app` is the stage; `--board-top: 176px` (where the enamel column starts) and `--save-h: 56px` in `tokens.css`.

- [ ] **Step 1: Write the failing tests** in `src/board-fit.test.ts`:
  - `"the OnePlus 15 gets the board at 1"`: `boardFit(424, 924)` → `{ scale: 1, desk: false }`.
  - `"a shorter phone scales the whole board"`: `boardFit(424, 830).scale` is `830 / 924` rounded down to 3 decimals (0.898); `desk` false.
  - `"a narrow phone scales by width"`: `boardFit(375, 1000).scale` is 0.884.
  - `"PC sizes keep an 8px lip"`: `boardFit(1280, 800)` → `{ scale: 0.848, desk: true }`; `boardFit(1366, 768).scale` 0.813; `boardFit(1440, 900).scale` 0.956.
  - `"never above 1"`: `boardFit(2560, 1440).scale` is 1.
  - `"trackBoardFit sets the scale and the desk class"` (happy-dom): a fake window with `innerWidth` 1280 and `innerHeight` 800 sets `--board-scale` to `"0.848"` and `body.desk`; a resize event to 424×924 sets `"1"` and removes `desk`.
- [ ] **Step 2:** Run `npx vitest run src/board-fit.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `boardFit`.** Desk when `width >= 600` (today's `PC_MIN_WIDTH`). The lip is 8px on each side on a desk, 0 on a phone. `scale = min(1, (width - 2·lip) / 424, (height - 2·lip) / 924)`, floored to 3 decimals so the board never overflows.
- [ ] **Step 4: The stage CSS.** In `board.css`: `#app` is `width: var(--board-w)`, `height: var(--board-h)`, `zoom: var(--board-scale, 1)`, `contain: layout`, `position: relative`, `overflow: hidden`, `background: var(--board-enamel) url(./assets/board/panel-face.png)` at `calc(var(--art) * -6) 0` sized `calc(var(--art) * 224) calc(var(--art) * 448)`, no-repeat; `padding-top: var(--board-top)` and `padding-bottom: var(--save-h)` so today's column fills 176..868. `body` centres it (flex, `align-items: center`, `justify-content: center`, `height: 100%`). Delete the replaced `#app` declarations in `style.css` (`zoom`, `max-width: 27.5rem`, the `100dvh` heights, the old paddings) rather than overriding them. Copy `panel-face.png` into `src/assets/board/`.
- [ ] **Step 5:** Run the tests and `npm run gate -- fast`. Expected: PASS. Then `npm run play -- --save mid` and look at both shots: the old column sits in a 424×924 enamel panel with an empty 176px top band and 56px bottom band, centred on the PC.
- [ ] **Step 6: Commit** `The game sits on a 424×924 board stage that scales to fit the screen (#370)` and push.

### Task 2: Skins, fonts and the board note

**Files:**

- Create: `src/board-skin.ts`, `src/board-skin.test.ts`, `src/board-note.ts`, `src/board-note.test.ts`, `src/assets/board/{frame,tag,key,inset}.png`, `src/assets/fonts/*.woff2`, `src/assets/fonts/OFL.txt`
- Modify: `src/board.css`, `src/tokens.css`

**Interfaces:**

- Produces:
  - `type SkinKind = "frame" | "tag" | "key" | "keyp" | "inset"`; `SKINS: Readonly<Record<SkinKind, SkinSpec>>` with exactly the mockup's `SK` table (index.html line 590; `keyp` is `key` at `ox: 32`).
  - `type Blit = { sx: number; sy: number; w: number; h: number; dx: number; dy: number }` (art px); `nineSlicePlan(kind: SkinKind, width: number, height: number): readonly Blit[]` — the mockup's `compose()` as data: fill tiles, edge strips, evenly pitched rivets (frame only), then four corners.
  - `skin(host: HTMLElement, kind: SkinKind, pressed?: SkinKind): void` — puts one `canvas.board-skin` behind the host's content and paints it at `floor(host size / 2)` art px, shown at 2×. It repaints on `ResizeObserver` (when present) and when the art loads. With no 2D context or no image it leaves the canvas blank and never throws. `pressed` swaps the kind while the host has `.down`.
  - `createBoardNote(stage: HTMLElement): { note: HTMLElement; show(anchor: HTMLElement, body: Node, ms?: number): void; hide(): void }` — the mockup's `#note` (`showNote`, line 1357): a framed card placed under the anchor (above it if it would cover the save line), kept 8px inside the 424px board in board coordinates (divide client rects by the stage's scale), on 2px steps. It hides after `ms` (default 3400) and on any `pointerdown` outside it or its anchor. `role="status"`.
- [ ] **Step 1: Write the failing tests** in `src/board-skin.test.ts`:
  - `"a frame plan stays inside its box"`: for `frame` at 204×27 and 208×44, every blit has `dx >= 0`, `dy >= 0`, `dx + w <= width`, `dy + h <= height`, and `w > 0 && h > 0`.
  - `"corners are drawn last at the four corners"`: the last four blits of `nineSlicePlan("tag", 118, 12)` start at (0,0), (109,0), (0,9), (109,9).
  - `"rivets are pitched 22 apart"`: `frame` at 204 wide draws `floor((204 - 16) / 22)` = 8 rivet blits on the top edge (source x 10, width 6).
  - `"keyp reads the pressed half"`: every blit of `keyp` has `sx >= 32`.
  - `"skin never throws without a canvas context"` (happy-dom): `skin(div, "frame")` on a sized div adds one `canvas.board-skin` and does not throw.
- [ ] **Step 2: Write the failing tests** in `src/board-note.test.ts` (happy-dom): `show()` makes the note visible with the body; it hides after 3400ms (fake timers); a `pointerdown` on `document.body` hides it; a `pointerdown` inside the note does not; a second `show()` replaces the body and restarts the timer.
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4: Implement** `board-skin.ts` and `board-note.ts`. Copy the four skin PNGs. In `board.css`: `.board-skin` (absolute, top-left, `z-index: -1`, pointer-events none, pixelated), `.board-skinned` (`isolation: isolate`, `position: relative` unless already placed), `.board-note` from the mockup's `#note` CSS (max width `calc(var(--art) * 150)`, padding, `.board-note-h` amber legend 13px bold uppercase, body 14px, `.board-note-q` quiet line), and the shared type classes `.board-lg` (Barlow Condensed 700, 13px, uppercase, `letter-spacing: .05em`, `--board-ink-2`) and `.board-num` (Share Tech Mono, `font-variant-numeric: tabular-nums`).
- [ ] **Step 5: Fonts.** `npm pack @fontsource/barlow-condensed@5 @fontsource/share-tech-mono@5` in the scratchpad, copy `barlow-condensed-latin-{500,600,700}-normal.woff2`, `share-tech-mono-latin-400-normal.woff2` and the OFL licence into `src/assets/fonts/`. Add the four `@font-face` rules to `board.css`. Do not add the packages to `package.json`.
- [ ] **Step 6:** Run the tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 7: Commit** `Board skins, bundled fonts and the board note (#370)` and push.

### Task 3: The odometer

**Files:**

- Create: `src/odometer.ts`, `src/odometer.test.ts`, `src/board-stock.ts`, `src/board-stock.test.ts`, `src/assets/board/{odometer,odo-dec-1,odo-dec-2,odo-dec-3,odo-dot}.png`
- Modify: `src/board.css`

**Interfaces:**

- Produces:
  - `type OdometerFace = { readonly drums: readonly [string, string, string, string, string]; readonly point: -1 | 0 | 1 | 2 | 3; readonly words: string }`; `odometerFace(pocket: number): OdometerFace`. `point` is the drum the decimal point follows; drums after it (up to drum 3) have red faces.
  - `createOdometer(): { root: HTMLElement; set(pocket: number): void; spend(amount: number): void }` in `board-stock.ts`. `root` is `.board-odo`, `role="img"`, `aria-label` = `Stones ${words}`.
- [ ] **Step 1: Write the failing tests** in `src/odometer.test.ts`:
  - `"whole numbers under 100,000, padded like a real odometer"`: `odometerFace(41_380)` → drums `["4","1","3","8","0"]`, point -1, words `"41,380"`; `odometerFace(7)` → drums `["0","0","0","0","7"]`, words `"7"`; `odometerFace(99_999.9)` → `"99999"`, words `"99,999"`.
  - `"four figures and a unit from 100K"`: 100,000 → `["1","0","0","0","K"]`, point 2, words `"100.0K"`; 412,489 → `["4","1","2","4","K"]`, point 2, words `"412.4K"`; 1,234,567 → `["1","2","3","4","M"]`, point 0, `"1.234M"`; 99,999,999 → `["9","9","9","9","M"]`, point 1, `"99.99M"`; 2.5e9 → `"2.500B"`; 7.25e12 → `"7.250T"`; 999,999,999,999,999 → `"999.9T"`.
  - `"rounds down"`: 999,999 → `"999.9K"`, never `"1000K"`.
  - `">999T" from 1,000T`: 1e15 and 5e20 → drums `[">","9","9","9","T"]`, point -1, words `">999T"`.
  - `"bad pockets"`: `NaN` and -5 → drums `"00000"`, words `"0"`; `Infinity` → `">999T"`.
- [ ] **Step 2: Write the failing tests** in `src/board-stock.test.ts` (happy-dom): `set(412_489)` puts `4,1,2,4,K` in the five `.board-drum` faces, shows `.board-odo-dot` at drum 2's slot, marks drum 3 `.is-decimal` and shows `odo-dec-3`; `set(41_380)` hides the dot and every decimal face; `spend(5_868)` shows `−5,868` in `.board-spend` (the minus is U+2212; amounts from 10,000 use `formatCompact`) and clears it after 1900ms.
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4: Implement.** `odometerFace`: below 100,000 the floor, padded to five; else pick K (1e3), M (1e6), B (1e9), T (1e12) by size, `v = n / unit`, integer digits `il`, keep `4 - il` decimals by flooring (`Math.floor(v * 10 ** d) / 10 ** d`), then the unit drum. The DOM follows the mockup's `.odo` markup and CSS (index.html lines 64–76 and 338–355): drum left offsets 26, 64, 104, 144, 184 and widths 30/30/32/30/30 CSS px (as art: 13, 32, 52, 72, 92 and 15/15/16/15/15), the dot at 56, 96, 136, 176 by point, the STONES legend and spend mark under it. A change rolls the old face up and the new one in with the Web Animations API (`steps(4)`, 160ms); with reduced motion, or when `Element.prototype.animate` is missing (happy-dom), it swaps the text.
- [ ] **Step 5:** Run the tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 6: Commit** `The odometer reads the pocket on five drums (#370)` and push.

### Task 4: The crew boost and its dial

**Files:**

- Create: `src/crew-boost.ts`, `src/crew-boost.test.ts`, `src/assets/board/dial-boost-sheet.png`
- Modify: `src/workshop.ts` (export `timerDurationMs(id)`, the existing private `timerDuration`), `src/rates.ts` (export `liveCrewTimer` if the test below needs it), `src/board-stock.ts`, `src/board-stock.test.ts`, `src/board.css`

**Interfaces:**

- Consumes: `boostLeft`, `boostById` (`boosts.ts`); `hotTimers`, `axleCrewMultiplier`, `chargeCrewMultiplier`, `timerDurationMs` (`workshop.ts`); `chipTime` (`format.ts`).
- Produces:
  - `type CrewBoost = { readonly kind: "rested" } | { readonly kind: "running"; readonly source: "overtime" | "axle-grease" | "blasting-charge"; readonly name: string; readonly multiplier: number; readonly leftMs: number; readonly fullMs: number }`; `liveCrewBoost(mountain: Mountain, now: number): CrewBoost`.
  - `dialFrame(boost: CrewBoost): number` — 0 when rested, else `clamp(ceil(leftMs / fullMs * 30), 1, 30)`.
  - `createBoostDial({ onOpen }: { onOpen: () => void }): { root: HTMLButtonElement; set(boost: CrewBoost): void }` in `board-stock.ts`.
- [ ] **Step 1: Write the failing tests** in `src/crew-boost.test.ts`:
  - `"rested with nothing running"` → `{ kind: "rested" }`.
  - `"Overtime alone"`: a mountain with Overtime started 1 minute ago → source `"overtime"`, name `"Overtime"`, multiplier 2, `leftMs` 29 min, `fullMs` 30 min.
  - `"the strongest wins"`: Overtime and a blasting charge both running → the one with the bigger multiplier (read both multipliers from `boostById` and `chargeCrewMultiplier`, do not hard-code).
  - `"a tie goes to the most time left"`: two sources with equal multipliers (build the mountain so axle grease and Overtime tie, or stub through the exported helpers) → the longer `leftMs`.
  - `"the dial multiplier is the one the crew runs at"`: for each case above, `multiplier` equals `effectiveRates(m, now).crewPerSecond / effectiveRates(m).crewPerSecond` when the crew is non-zero.
  - `"dialFrame"`: rested 0; 29 of 30 minutes → 29; 1 second of 30 minutes → 1; full → 30.
- [ ] **Step 2: Write the failing tests** in `src/board-stock.test.ts`: a running Overtime with 7:08 left writes legend `Overtime`, `×2`, `7:08`, `left`, the sprite at frame 8 (`background-position-x: -704px`, 88 CSS px per frame) and `aria-label` `"Overtime, crew ×2, 7:08 left"`; rested writes `Crew`, `×1`, `rested`, no `left`, frame 0, `aria-label` `"Crew ×1, rested"`; a click calls `onOpen`.
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4: Implement.** `liveCrewBoost` looks at Overtime (`boostLeft`), axle grease and the blasting charge (`hotTimers` for `until`, `timerDurationMs` for the full length, their multiplier functions for strength), keeps those with multiplier > 1, and picks the largest multiplier, then the most time left. `name` is the boost's or recipe's `name`. The dial markup and CSS follow the mockup's `.boost` (index.html lines 77–84 and 356–371): legend text right-aligned beside an 88×88 dial sprite from `dial-boost-sheet.png` (31 frames). The multiplier prints like the effect chips (`×2`, `×1.5`).
- [ ] **Step 5:** Run the tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 6: Commit** `The boost dial shows the crew timer the crew is running at (#370)` and push.

### Task 5: The relic plate

**Files:**

- Create: `src/board-relics.ts`, `src/board-relics.test.ts`, `src/assets/board/relic-socket.png`, `src/assets/board/relic-{lantern,shield,hammer,heart,crown,mantle}{,-dark}.png`
- Modify: `src/relic-panels.ts` (export `relicNote`; add `openShelf()` to its return; the shelf rows use `relicNote`), `src/board.css`

**Interfaces:**

- Produces:
  - `relicNote(mountain: Mountain, relic: Relic): { readonly title: string; readonly line: string; readonly hint: string | undefined }` in `relic-panels.ts` — exactly the shelf row's words today: title `relic.name`; line `The virtue of ${virtue}. Your power: ${boost}` when found, else `relic.tease`; hint `Next · ${depthHint}` only for the guided next relic.
  - `createRelicPlate({ getView, note, onShelf }: { getView: () => ProgressSnapshot; note: BoardNote; onShelf: () => void }): { root: HTMLElement; render(): void }` — `root` is `section.board-relics`, framed.
- [ ] **Step 1: Write the failing tests** in `src/board-relics.test.ts` (happy-dom, a mountain with the lantern and shield found):
  - six `button.board-socket`s in `RELICS` order at left `15 + i·66` CSS px;
  - the lantern and shield sockets hold the lit art, the hammer (next) holds `relic-hammer-dark`, the last three hold no relic image;
  - the tag reads `Relics of Fatherhood · 2 of 6` and a click calls `onShelf`;
  - a click on the shield socket shows a note with `Shield of Protection` and its virtue line; on the hammer socket, its tease and `Next · …` hint; on the crown socket, the crown's name and tease;
  - each socket's `aria-label` starts with the relic name and ends with `2 of 6 found`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.** Markup and CSS from the mockup's relic plate (index.html lines 49–56 and 323–327): a framed 416×64 row at left 4px, 56×56 sockets at top 4px with the 48px relic inset 4px, and the tag (`tag` skin) at left 100px, top 56px, 216×20. Lit art for found relics, the dark art for the next one, nothing for the rest. Keep `relic-panels.ts`'s shelf behaviour; `openShelf()` does what the old `shelfButton` click did.
- [ ] **Step 4:** Run the tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The relic plate: six sockets, notes, and the tag that opens the shelf (#370)` and push.

### Task 6: The save line and the save drawer

**Files:**

- Create: `src/board-save.ts`, `src/board-save.test.ts`, `src/assets/board/lamp.png`
- Modify: `src/board.css`

**Interfaces:**

- Consumes: `ProgressStore` (`flush`, `resume`), `AuthController` (`getState`, `signIn`, `subscribe`), `formatCompact`.
- Produces: `createSaveLine({ progress, auth, getView, now }): { line: HTMLElement; drawer: HTMLElement; render(): void; close(): void }`. `line` is `div.board-saveline` holding `button.save-status` (the scripts' selector) with `data-kind` and `data-log` exactly as `renderSave()` sets them today. `drawer` is `section.board-drawer.board-save-drawer`, `role="dialog"`.
- [ ] **Step 1: Write the failing tests** in `src/board-save.test.ts` (happy-dom, a stub progress and auth):
  - the five kinds read today's words: `Sign in to save`, `Saved on this device`, `Loading your save...`, `Saved to your account`, `Couldn't reach your save`; `data-kind` matches; `data-log` follows `view.log` and is removed when it is undefined;
  - only `error` adds `· Kept on this phone` and `Details`;
  - the lamp frame (background x, 40 CSS px per frame) is red (3) for error, green (2) for account, amber (1) for session and loading, off (0) for unsigned, and loading blinks (`.is-trying`);
  - a click opens the drawer (`.is-open`) and a second click closes it; Escape closes it;
  - signed in: Account shows the user's label, On this phone shows `formatCompact(pocket)`, the buttons are `Close` and `Try again`, and `Try again` calls `progress.flush()` then `progress.resume()`;
  - signed out: Account shows `Not signed in` and the second button is `Sign in`, which calls `auth.signIn()`;
  - Last try shows the `HH:MM` (24h, local) of `now()` at the last render where `view.log` changed, and `—` before any;
  - the error state adds the line `Every stone is kept on this phone and goes up when the cloud answers. Nothing is lost.`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.** Markup and CSS from the mockup's save line and save panel (index.html lines 405–413, 429–441, CSS lines 220–231 and 287–300): a framed 408×54 strip at left 8px, top 868px, with the 40px lamp, words in 13px/600, and the underlined `Details` pushed right; the drawer sits above the save line (bottom `calc(var(--save-h) + 4px)`), framed, slides in on `steps(6)`, and its buttons are `key` skins (`keyp` while pressed). On a narrow fit the words shorten in the mockup's order (`· Kept on this phone ·`, `· On this phone ·`, `·`) only if they overflow.
- [ ] **Step 4:** Run the tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The save line and the save drawer (#370)` and push.

### Task 7: The board goes live in the screen

**Files:**

- Modify: `src/mountain-screen.ts`, `src/style.css`, `src/board.css`, `src/mountain-screen.test.ts`, `src/mountain-screen-crew.test.ts`, `src/mountain-screen-depths.test.ts`, `src/style.test.ts`, `src/relic-panels.ts` (drop `shelfButton`)

**Interfaces:**

- Consumes: everything Tasks 2–6 produce.
- Produces: the screen's DOM. The board top is `div.board-top` (relic plate at top 6px, stock row at top 86px, 88px tall; both from the mockup's `LAY["924"]`), and `.board-saveline` at top 868px, both absolute children of `#app`. The Running now note is the board note with the effect row inside it.

- [ ] **Step 1: Write the failing tests** in `src/mountain-screen.test.ts`:
  - `"the board shows the pocket on the odometer"`: a 41,380-stone pocket → `.board-odo` `aria-label` `Stones 41,380`; there is no `.pocket` and no `.pocket-rate`.
  - `"a buy shows the spend on the odometer"`: buying a worker shows `−` and its price in `.board-spend`.
  - `"the dial opens Running now"`: with Overtime running, a click on the dial shows the board note headed `Running now` holding the Overtime chip with its clock; with nothing running, it reads `Nothing running`.
  - `"the relic plate replaces the goal line and the shelf button"`: no `.relic-goal`, no `.relic-shelf`; the tag opens `.shelf-dialog`.
  - `"the save line is the board's"`: `.save-status` is inside `.board-saveline` and reads the save words.
  - The menu button (☰) is still on the screen and opens the menu.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Wire it.** In `mountMountainScreen`: create the board note, odometer, dial, relic plate and save line; call their `render`/`set` from `render()` (the odometer from `view.mountain.pocket`, the dial from `liveCrewBoost(view.mountain, now())`, a spend when the pocket fell and `mined` did not); also refresh the odometer and dial in the 1-second tick. Remove from the DOM and the code: `pocketStack`/`pocketRow`/`pocket`/`pocketRate`, `relicLine` and its bar, the shelf button, `saveStatus` and `renderSave` (the save line owns them). The effect row element is no longer in the column: it is the body of the Running now note (its chips keep updating, since `render()` still writes them, and the engineers' and upgrades' chips still land in it). The `header.top-bar` with the ☰ button stays, as the first item of the column, aligned right; the layer line sits beside it. Opening a sheet or the shelf closes the save drawer and the note.
- [ ] **Step 4: CSS.** Remove from `style.css` every rule that only styled what was removed (`.pocket*`, `.relic-goal*`, `.relic-shelf`/`.shelf-slot` on the screen, `.save-status`, `.effect-row` placement on the screen; keep `.effect-chip` rules the note reuses). Add the board top, the stock row and the Running now list (chips one per line, 14px) to `board.css`. Today's column must still fit 176..868 at 424×924 with no scroll: the rock shrinks first.
- [ ] **Step 5: Fix the pinned tests** in `mountain-screen-crew.test.ts`, `mountain-screen-depths.test.ts` and `style.test.ts` that read removed elements: point them at the board parts that now carry the same fact, or delete a test whose element is gone and whose fact is covered by Tasks 3–6. Never delete a test to hide a behaviour change.
- [ ] **Step 6:** Run `npm run gate -- fast`. Expected: PASS. Then `npm run play -- --save mid` and `npm run play -- --save workshop label:Overtime` (or tap the dial) and look at the shots: the board top and save line are there with real numbers, nothing scrolls, the PC shows the same board scaled.
- [ ] **Step 7: Commit** `The board's top and save line replace the pocket, the goal line, the effect row and the save words (#370)` and push.

### Task 8: The gate checks the board at 424×924 and on the PC

**Files:**

- Modify: `scripts/visual-check.mjs`, `scripts/ui-audit.mjs`, `scripts/play.mjs`, `src/play-plan.ts` and its test (if it holds the viewport list), `docs/ui-audit.md`

**Interfaces:**

- Consumes: the board's selectors from Tasks 3–7 (`.board-odo`, `.board-dial`, `.board-relics`, `.board-socket`, `.board-tag`, `.board-saveline`, `.save-status`, `.board-save-drawer`, `.board-note`).

- [ ] **Step 1: Sizes.** Phone sizes become `[424, 924]` only; add the PC sizes `[1280, 800]`, `[1366, 768]`, `[1440, 900]` where a section checks the main screen or a sheet fit. Remove 412, 440, 375 and 830 from `visual-check.mjs`, `ui-audit.mjs` and `play.mjs` (and its `--help`). A section that existed only for the 830 URL-bar case goes.
- [ ] **Step 2: Retarget.** Sections that read the removed pill, goal line, shelf button, effect row on the screen or the old save words now read the board parts that replaced them, or go when the board check below covers them.
- [ ] **Step 3: Add a board section** (fresh, mid and a save with Overtime running) at 424×924 and the three PC sizes: no page scroll; the board's own controls (sockets, tag, dial, save line, drawer buttons) at least 48×48 with 8px gaps, measured in board px (client size ÷ `--board-scale`) and the rendered size printed on the PC; board text at least 13px; at 424×924 every `img` and sprite in `.board-top` and `.board-saveline` drawn at exactly twice its natural size; contrast at least 4.5:1 for the odometer legend, the dial legend, the tag and the save words, measured from screenshot pixels (text colour against the darkest and lightest background pixel in the element's box); opening the save drawer leaves the save line visible; opening the Running now note keeps it inside the board.
- [ ] **Step 4:** Run `npm run visual` and `npm run audit:ui`. Expected: both PASS. Read the failures' logs in `.gate/logs/` if run through the gate.
- [ ] **Step 5: Docs.** `docs/ui-audit.md` says the phone size is 424×924, names the board top and save line where it named the pill, the goal line and the save words, and keeps the free-workers point (the crew line still counts them until B3).
- [ ] **Step 6: Commit** `The gate checks the board at 424×924 and three PC sizes (#370)` and push.

### Task 9: Prove it

**Files:** none new (fixes only).

- [ ] **Step 1:** `npm run gate -- full`. Expected: every step PASS. Fix any FAIL first (read `.gate/logs/<step>.log`).
- [ ] **Step 2:** `npm run play` on `fresh`, `early`, `mid`, `workshop`, `late` and `edge`, phone and desktop. Each run's `log.txt` has no page error and a save line. Look at every shot: real numbers on the odometer and the dial, the relic plate right for the save, no scroll at 424×924, the same board scaled on the PC.
- [ ] **Step 3:** With `npm run play -- --save workshop label:Overtime` (the dial) and a relic socket tap and `tap:.save-status`, the note, the Running now list and the save drawer are seen and fit.
- [ ] **Step 4: Commit** any fixes as `B2 fixes from play (#370)` and push.
