# Control Board B3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board's gauge row goes live (#371): the output gauge, the crew plate, and the mine window down No. 2 Shaft. A tap on the window digs, a miner runs the haulage loop, new machines arrive with a calm beat, each band has its own view, and the golden vein, hazards and the Legacy plate show in the window. It replaces the rock, the crew line and the Legacy badge.

**Architecture:**

- The gauge row is an absolutely placed child of `#app` at `top: var(--board-top)` (176px), 238px tall (the mockup's `#rGauge` at `LAY["924"].gauge`). Today's column (layer line and ☰ menu, teach note, thumb bar) now starts at a new `--column-top` (422px). The sheets still stop under the stock row (`--board-top`), so they cover the gauge row, as they covered the rock.
- Pure rules live in their own modules with unit tests: `output-gauge.ts` (unit steps, needle angle, the damped needle, the counter reading), `crew-count.ts` (crew and free hands), `haulage.ts` (the tub, miner and cage loop) and `mine-window.ts` (band to view, the scene the window draws, machine beats, the vein's spot, and the machine animations). DOM parts follow B2's `board-*` shape: `board-gauge.ts` (gauge and crew plate) and `board-window.ts` (the window and the board's animation loop).
- The window is driven by the view the screen already renders from. `windowScene(view.mountain, view.trouble)` reads counts, band and trouble; the window never writes the mountain. A tap calls the screen's `onDig`, which runs today's `mineByHand` mutation, so a tap digs exactly tap power, the same as today's rock. A vein tap calls `onVein`, which runs today's `mineVein`.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom per file), puppeteer-core scripts (`visual-check.mjs`, `ui-audit.mjs`, `play.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-07-control-board-design.md` (the B3 row; "The board, top to bottom" item 3; "The mine window"; "Where everything else goes" for the rock, crew line, golden vein and Legacy badge rows; C8, C9; "Art"; "Checks"). Reference mockup: `mockups/control-board/index.html`: gauge-row CSS lines 86–130, markup lines 312–345, window script lines 876–1330 (`paintGauge`, `RUN`, `tubTick`, `roundTick`, `hoistTick`, `drillTick`, `borerTick`, `tarpTick`, `windowBeat`, `puff`, `fxTick`, `windowTick`, `windowRest`, the window's click handler) and `LAY` at line 1588. B4 and later stay out: bays, the band tag, Ready now, the red button, the key rail, drawers.

## Global Constraints

- **UI only.** No change to rules, numbers, prices, saves or the lab. Reading a rules module is fine; exporting an existing private helper is fine. The window reads a `WindowScene` and calls `onDig` and `onVein`; it never writes the mountain.
- **Art.** Every graphic is PixelLab art. The art approved today is already in `src/assets/board/` (`mine-view-{topsoil,crystal,heart}.png`, `window-vein-4f.png`, `window-cave-in-4f.png`, `window-great-machine.png`, `window-kid.png`, `legacy-plate.png`). The rest is copied (not moved: the mockup must still open) from `mockups/control-board/assets/art/ind-board/` into `src/assets/board/`, flat, keeping names, except `mine-view.png`, which is copied as `mine-view-granite.png`. Shown at exactly 2× (one art px = two CSS px), `image-rendering: pixelated`, no CSS filters. No placeholder boxes. No new PixelLab art in B3.
- **CSS tokens.** New CSS has no raw px or colours (`npm run tokens`). Raw values live in `src/tokens.css`: `--art: 2px` and the B2 board palette (`--board-ink #d9ddd0`, `--board-ink-2 #b3bcae`, `--board-ink-plate #050607`, `--board-ink-bare #eceee4`, `--board-amber-bare #ffd38c`, `--board-amber #e8ac4c`, `--board-green #9fcf86`, `--board-rust #e39a78`, `--board-night #0b0e0f`, `--board-enamel #1a2421`). B3 adds `--gauge-row-h: 238px`, `--column-top: calc(var(--board-top) + var(--gauge-row-h) + var(--art) * 4)` (422px), `--board-gauge-ink: #0b0b09` (the mockup's gauge face ink), `--board-view-night: #0a0c0e` (the view's backdrop and the "+N" outline), `--board-hair: 1px` (the outline's offset) and `--board-type-20: 20px`, `--board-type-26: 26px`. Board CSS writes sizes as `calc(var(--art) * N)` with N in art pixels, or names a token. Board CSS goes in `src/board.css`. Inline frame and position styles set from TypeScript are CSS px (art × 2), as B2's save lamp does.
- **Fonts.** The bundled Barlow Condensed and Share Tech Mono from B2. No new font.
- **Copy.** Today's words stay: `+N` on a dig (`formatCount`), `Golden vein! +N stones`, the quiet away line, `Legacy ×2`, `The mountain is mined out`, the crew line's sentences and chips, every trouble word. New strings (list them in the PR for Flemming): `No. 2 Shaft`, `Stones a sec`, the gauge marks `0`, `5`, `10`, `15` and units `×100`, `×1000`, `×10K` … `×100T`, `Crew` (the crew plate's legend and the heading of the Crew section in Buys), `N free` on the crew plate, and the labels `Mine window: tap to mine N stones`, `Output: N stones a second`, `Crew: N workers, M free`. Removed: the `+N crew` float and the ` · N free` on the crew chip. No `?` in player text.
- **Targets** at least 48×48 CSS px with 8px gaps at 424×924: the window is 212×180, the vein 50×52 (it sits on the window as today's vein sat on the rock, so it is exempt from the gap to the window only). **Text** at least 13px. Numbers in Share Tech Mono with tabular figures. Contrast at least 4.5:1 from screenshot pixels.
- **Motion.** Hard steps only: sprite strips change whole frames, everything in the window moves one art pixel at a time on the mockup's timers, the needle moves on 5° frames. `prefers-reduced-motion: reduce` (`reducedMotion()` in `float-text.ts`) holds the window and the needle still and skips the beats to their end state; digs still show `+N`, without rising. Nothing bounces: the needle is damped.
- **Phone layout.** Never scrolls at 424×924. Gauge row 176..414. Until B4 and B5 replace them, the layer line and ☰ menu sit at the column's top (422), where B4's band tag goes, and the teach note and thumb bar sit at the column's foot, ending 8px above the save line (860).
- **Close is pause.** Saving is untouched: digs and vein taps persist through `applyMutation` as today. `.save-status` keeps `data-kind` and `data-log`.
- **Commits** are a plain sentence ending `(#371)`, with these trailers. Push the branch after each task (`git push -u origin claude/beautiful-thompson-t7oje5`); never force-push.

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011RgeWsS7EcGfk9opPt3V2W
  ```

## Review Focus

1. **Rates and crews at the edges.** A rate of 0, exactly 1,500 and 1,501 (the unit step), 1e15 and more, NaN from a bad save; a crew of 1,998 with 1,998 free (the `late` save). The needle never pegs below the top unit, the counter never passes five characters, and the crew plate's words never leave the plate. Pinned in Tasks 1, 2 and 8.
2. **A tap that must not dig, and one that must dig once.** While the save loads, once mined out, or on the vein: no stones and no `+N` from the window. Three taps add exactly three times tap power; a keyboard Enter digs and puffs at the default spot. Pinned in Tasks 5 and 6.
3. **Counts and time that jump.** The first render, Start over, Pass the mine, and a cloud copy with 25 more carts: no beat on the first render or a fall, one beat per tier per rise, the tarp back after Start over. A tab back from hours hidden: one capped 0.1s step, no skipped face or cage. Pinned in Tasks 3, 4 and 6.
4. **Reduced motion.** The window and needle hold still, the first borer's tarp is simply gone, `+N` shows without rising and goes after 0.7s. Pinned in Tasks 2 and 5.
5. **The vein at the ends of its range.** A glint at x 0.35/0.65 and y 0.4/0.8 stays inside the view, on top of the window, and a tap on it pays the vein and never also digs. Pinned in Tasks 4, 5 and 8.

---

### Task 1: The output gauge's rules

**Files:**

- Create: `src/output-gauge.ts`, `src/output-gauge.test.ts`

**Interfaces:**

- Produces:
  - `GAUGE_FULL = 1500` (0–15 of the ×100 unit), `GAUGE_MAX_K = 12` (the ×100T unit), `GAUGE_FRAMES = 55`.
  - `gaugeRange(rate: number): number` — the smallest `k` in `0..GAUGE_MAX_K` with `rate <= GAUGE_FULL * 10 ** k`; `GAUGE_MAX_K` above that; 0 for NaN or a negative rate.
  - `gaugeUnitText(k: number): string` — `"×" + u` for `u = 100 * 10 ** k` below 10,000, else `"×" + formatCompact(u)`.
  - `gaugeAngle(rate: number, k: number): number` — `-135 + 270 * min(1, max(0, rate) / (GAUGE_FULL * 10 ** k))`; NaN reads 0.
  - `type Needle = { readonly angle: number; readonly velocity: number }`; `NEEDLE_REST: Needle = { angle: -135, velocity: 0 }`; `needleStep(needle: Needle, target: number, dt: number): Needle` — the mockup's spring (`paintGauge`, index.html line 876): `a = 46 * (target - angle) - 8.2 * velocity`, then velocity and angle by `dt`; above 138° it stops at 138 with `velocity = -abs(velocity) * 0.3`; below -135 it stops at -135 with velocity 0. `needleKick(needle: Needle, by: number): Needle` adds `by` to the velocity.
  - `needleFrame(angle: number): number` — `round((angle + 135) / 5)` clamped to `0..54`. Frame `f` is column `f % 11`, row `floor(f / 11)` of `gauge-output-sheet.png`.
  - `gaugeReading(rate: number): string` — the counter's five characters, rounding down: below 1,000 the whole number; then K, M, B, T: one decimal under 100 of the unit (".0" dropped), whole from 100; `">999T"` from 1e15 and for Infinity; `"0"` for NaN or a negative rate.

- [ ] **Step 1: Write the failing tests** in `src/output-gauge.test.ts`:
  - `"the unit steps up so the needle never pegs"`: `gaugeRange` of 0, 1,500, 1,501, 15,000, 15,001, 1.5e15, 1e20, NaN and -5 → 0, 0, 1, 1, 2, 12, 12, 0, 0.
  - `"unit marks"`: `gaugeUnitText` of 0, 1, 2, 3, 4, 7, 10, 12 → `"×100"`, `"×1000"`, `"×10K"`, `"×100K"`, `"×1M"`, `"×1B"`, `"×1T"`, `"×100T"`.
  - `"the needle's angle"`: `gaugeAngle(0, 0)` -135; `(750, 0)` 0; `(1500, 0)` 135; `(974, 0)` ≈ 40.32; `(1e20, 12)` 135; `(NaN, 0)` -135.
  - `"5° frames"`: `needleFrame` of -135, 0, 135, 138, 2.4, 2.6 → 0, 27, 54, 54, 27, 28.
  - `"a damped needle settles"`: from `NEEDLE_REST` toward 0 in 1/60s steps, the angle overshoots 0 at most 20° within the first second and is within 1° of 0 after 3 seconds; every angle stays in -135..138.
  - `"a kick swings and returns"`: at rest on 0, `needleKick(…, 150)` then 3s of steps ends within 1° of 0, and the largest angle reached is above 5.
  - `"the counter reading"`: 0 `"0"`, 974.9 `"974"`, 1,000 `"1K"`, 1,950 `"1.9K"`, 12,345 `"12.3K"`, 99,999 `"99.9K"`, 412,489 `"412K"`, 1,234,567 `"1.2M"`, 7.25e12 `"7.2T"`, 999.9e12 `"999T"`, 1e15 `">999T"`, Infinity `">999T"`, NaN `"0"`, -3 `"0"`; and every reading of 2,000 random rates up to 1e16 is at most 5 characters.
- [ ] **Step 2:** Run `npx vitest run src/output-gauge.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/output-gauge.ts` with the signatures above.
- [ ] **Step 4:** Run the test and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The output gauge's rules: unit steps, a damped needle on 5° frames and a five-figure counter (#371)` and push.

### Task 2: The gauge and the crew plate

**Files:**

- Create: `src/crew-count.ts`, `src/crew-count.test.ts`, `src/board-gauge.ts`, `src/board-gauge.test.ts`, `src/assets/board/gauge-output-sheet.png`, `src/assets/board/gauge-counter.png` (copied from the mockup)
- Modify: `src/crew-panel.ts` (its `spare` comes from `crewCounts`), `src/board.css`, `src/tokens.css`

**Interfaces:**

- Consumes: Task 1; `effectiveRates` (`rates.ts`), `staffNeeded` (`engineers.ts`), `TIERS` (`tiers.ts`), `formatCompact`, `formatCount` (`format.ts`), `workerWords` (`screen-words.ts`), `reducedMotion` (`float-text.ts`).
- Produces:
  - `type CrewCounts = { readonly crew: number; readonly spare: number; readonly free: number }`; `crewCounts(mountain: Mountain, now: number, trouble?: Trouble): CrewCounts` — `crew = helpers + kids`; `spare = crew − Σ running[tier] × staffNeeded(mountain, tier)`, exactly crew-panel's sum today; `free = max(0, floor(spare))`.
  - `createOutputGauge(): { root: HTMLElement; set(rate: number): void; kick(by: number): void; tick(dt: number): void }` — `root` is `div.board-gauge`, `role="img"`, `aria-label` `Output: ${formatCount(rate)} stones a second`. Children: `.board-gauge-face` (the sheet sprite), the four marks `.board-gauge-mark`, `.board-gauge-unit`, the counter `img.board-gauge-counter`, `.board-gauge-read`, and `.board-gauge-legend` reading `Stones a sec`. `tick` steps the needle (or, under reduced motion, puts it straight on the target) and sets the face's `background-position` to `-(col × 208)px -(row × 208)px`.
  - `createCrewPlate(): { root: HTMLElement; set(counts: CrewCounts): void }` — `root` is `div.board-crew`, `role="img"`, framed (`skin(root, "frame")`), with `.board-crew-legend` (`Crew`), `.board-crew-n` (`formatCompact(crew)`), an `i.board-lamp` and `.board-crew-free` (`${formatCompact(free)} free`). `aria-label` `Crew: ${formatCount(crew)} ${workerWords(crew)}, ${formatCount(free)} free`.
- [ ] **Step 1: Write the failing tests** in `src/crew-count.test.ts`: a fresh mountain → `{ crew: 0, spare: 0, free: 0 }`; 18 helpers and 6 carts → crew 18, free 12; 18 helpers, 13 carts and 5 drills → free 0 (the crew test's `0 free`, `mountain-screen-crew.test.ts` line 836); 3 kids count as crew; a mountain short of workers has a negative `spare` and `free` 0.
- [ ] **Step 2: Write the failing tests** in `src/board-gauge.test.ts` (happy-dom; stub `window.matchMedia` to report reduced motion where a test says so):
  - `set(974)` writes `.board-gauge-read` `974`, `.board-gauge-unit` `×100`, `aria-label` `Output: 974 stones a second`; with reduced motion `tick(0.016)` puts the face on frame 35: `background-position` `-416px -624px`.
  - `set(12_345)` reads `12.3K` and `×1000`; `set(15_001)` reads `×10K`.
  - without reduced motion, after `set(750)` and 3s of `tick(1/60)` the face is on frame 27 (`-1040px -416px`); a `kick(150)` then `tick(0.05)` moves it off frame 27, and 3s more brings it back.
  - the marks read `0`, `5`, `10`, `15` and the legend `Stones a sec`.
  - crew plate: `set({ crew: 56, spare: 1, free: 1 })` → `.board-crew-n` `56`, `.board-crew-free` `1 free`, lamp `background-position-x` `-40px` (amber), no `.is-none`, `aria-label` `Crew: 56 workers, 1 free`; `free: 0` → lamp `0px`, `.is-none`; `crew: 1_998` gives `.board-crew-n` the class `is-long` (4–5 characters) and `crew: 123_456` (`123.4K`) the class `is-longer` (6); 3 characters or fewer has neither.
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4: Implement** both modules. Change crew-panel's inline `spare` to `crewCounts(current, now(), trouble).spare` (its behaviour and tests stay the same). Copy the two PNGs. CSS from the mockup (index.html lines 88–96 and 120–127, markup 315–325 and 339–345), CSS px written as `calc(var(--art) * px/2)`: `.board-gauge` 104×104 art, the face sprite with `background-size` `calc(var(--art) * 1144) calc(var(--art) * 520)`; marks and unit 13px Share Tech Mono in `--board-gauge-ink`, centred on their points with `translate(-50%, -50%)`; counter at (39, 65) 25×11 art, reading at (41, 67) 22×8 art, 16px, `--board-drum-dec-ink`; legend 13px Barlow 700 at top 77 art, `--board-gauge-ink`. `.board-crew` 106×24 art; legend and figure in `--board-ink-bare`, the figure 26px (`--board-type-26`), 20px with `.is-long`, 16px with `.is-longer`; lamp at left 60 art, top 2; free count in `--board-amber-bare`, `--board-ink-2` with `.is-none`. Lay the plate out as a flex row so the mockup's positions hold at rest and long counts push, never overlap. If a legend reads under 4.5:1 in Task 8's check, use the bare ink, as B2 did for Stones.
- [ ] **Step 5:** Run the tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 6: Commit** `The output gauge and the crew plate (#371)` and push.

### Task 3: The haulage loop

**Files:**

- Create: `src/haulage.ts`, `src/haulage.test.ts`

**Interfaces:**

- Produces (all positions in whole art px inside the run box, which is the view's rows 28..49):
  - `type Haulage` (opaque state); `haulageRest(): Haulage` — the mockup's `windowRest` for the run: tub empty at the cage (x 14), the miner facing the face, hands on it.
  - `haulageNewCart(h: Haulage): Haulage` — a new cart waits for the tub's next cage visit (the mockup's `W.nw`).
  - `type HaulageEvent = { readonly kind: "fill"; readonly x: number; readonly y: number } | { readonly kind: "sheave"; readonly seconds: number }` (fill `x`, `y` are view art px, for a dust puff).
  - `haulageStep(h: Haulage, dt: number, hold: boolean): { readonly next: Haulage; readonly events: readonly HaulageEvent[] }` — while `hold` (a cave-in) the state does not change.
  - `type HaulagePose = { readonly tubX: number; readonly tubY: number; readonly full: boolean; readonly minerX: number; readonly minerY: number; readonly minerFrame: number; readonly minerBehind: boolean; readonly cageX: number; readonly cageY: number }`; `haulagePose(h: Haulage): HaulagePose`.
- [ ] **Step 1: Write the failing tests** in `src/haulage.test.ts`, stepping `dt = 0.1` unless said:
  - `"rests at the cage"`: `haulagePose(haulageRest())` → tub x 14, y 8, empty; miner x 4, y -1, frame 0, not behind; cage x 11, y -3.
  - `"pushes out one art px every 0.2s"`: the tub reaches x 58 between 8.7s and 8.9s, and no step moves it more than 1px.
  - `"heaped at the face"`: the tub turns full between 10.1s and 10.4s, with exactly one `fill` event at `{ x: 66, y: 29 }`.
  - `"tips at the cage"`: back at the cage, it turns empty between 22.0s and 22.6s, with one `fill` at `{ x: 10, y: 30 }`.
  - `"a new cart rides the cage"`: with `haulageNewCart` at 0s, the next cage visit sends one `sheave` event of 3 seconds, the cage reaches y -25 (22px up) and comes back to -3, the tub comes down empty, and no `fill` comes at that visit; the run then goes out again.
  - `"hold freezes the run"`: 5s of `hold` leaves the pose unchanged.
  - `"whole pixels, real frames"`: over 120s of 1/60s steps and of 0.1s steps, every pose field is an integer and `minerFrame` is in 0..17.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** `src/haulage.ts` by porting the mockup's run (index.html lines 904–1018: `RUN`, `W.tub`, `pushX`, `tubTop`, `tubTick`, `roundTick`, `hoistTick`, and `paintRun`'s pose arithmetic) with the same constants and timings: `fillPuff` becomes a `fill` event, the hoist's `W.sheave.fast = max(…, 3)` a `sheave` event, `W.nw` the pending cart. Clone the state each step; never mutate the argument.
- [ ] **Step 4:** Run the test and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The haulage loop: the miner runs the tub between the cage and the face (#371)` and push.

### Task 4: The window's scene, beats and machines

**Files:**

- Create: `src/mine-window.ts`, `src/mine-window.test.ts`, `src/assets/board/mine-view-granite.png` (the mockup's `mine-view.png`)

**Interfaces:**

- Consumes: `layerOf`, `LayerId` (`layers.ts`), `Trouble`, `TroubleTier` (`hazards.ts`), Task 3's `Haulage` functions.
- Produces:
  - `MINE_VIEWS: Readonly<Record<LayerId, string>>` (the four view URLs) and `mineView(band: LayerId): string`.
  - `type WindowScene = { readonly band: LayerId; readonly run: boolean; readonly drill: boolean; readonly borer: boolean; readonly machine: boolean; readonly kid: boolean; readonly carts: number; readonly drills: number; readonly borers: number; readonly trouble: TroubleTier | undefined; readonly legacy: boolean }`; `windowScene(mountain: Mountain, trouble: Trouble | undefined): WindowScene` — `run` once there is a worker, a kid or a cart; `drill`, `borer`, `machine`, `kid` once one is owned; `legacy` when `(mountain.legacy ?? 0) > 0`.
  - `type WindowBeat = "cart" | "drill" | "first-borer"`; `windowBeats(before: WindowScene | undefined, after: WindowScene): readonly WindowBeat[]` — in that order, one per tier whose count rose; `"first-borer"` only for 0 → more; nothing for `before` undefined or a fall.
  - `veinSpot(x: number, y: number): { readonly left: number; readonly top: number }` — today's vein place (`x` 0.35..0.65, `y` 0.4..0.8, clamped) mapped linearly onto the galleries' rock: `left` 8..64, `top` 26..48 view art px (the glint is 25×26).
  - `puffSpot(point: { readonly x: number; readonly y: number } | undefined): { readonly x: number; readonly y: number }` — the mockup's window click: `undefined` (a keyboard click) → (67, 30); else `(round(x) − 8, round(y) − 8)` clamped to x −2..78, y −2..62.
  - `plusSpot(puff: { readonly x: number; readonly y: number }, width: number): { readonly x: number; readonly y: number }` — the mockup's `puff()`: x `clamp(1, 91 − width, puff.x + 8 − round(width / 2))`, y `clamp(1, 67, puff.y − 2)`.
  - `type Machines` (opaque); `machinesRest(): Machines`; `machinesBeat(m: Machines, beat: WindowBeat): Machines`; `machinesStep(m: Machines, dt: number, scene: WindowScene, random: () => number): { readonly next: Machines; readonly events: readonly HaulageEvent[] }` (it steps the haulage inside, holding it during a cart trouble); `type MachinesView = { readonly sheave: number; readonly steam: number; readonly drill: number; readonly borer: number; readonly borerDust: number | undefined; readonly tarp: { readonly x: number; readonly y: number } | undefined; readonly caveIn: number | undefined; readonly vein: number; readonly run: HaulagePose }`; `machinesView(m: Machines, scene: WindowScene): MachinesView`.
- [ ] **Step 1: Write the failing tests** in `src/mine-window.test.ts`:
  - `"each band has its own view"`: the four URLs differ and contain `mine-view-topsoil`, `mine-view-granite`, `mine-view-crystal`, `mine-view-heart`.
  - `"the scene reads counts, band and trouble"`: a fresh mountain → topsoil, nothing shown, no trouble, no legacy; 18 helpers and 6 carts → `run`; 25M mined → granite; 60M → crystal; 130M with 1 machine, 2 kids and `legacy: 1` → heart, `machine`, `kid`, `legacy`; a cart trouble → `trouble: "cart"`. A frozen mountain comes back deep-equal (it never writes).
  - `"beats"`: `undefined` → `[]`; carts 5 → 6 `["cart"]`; 5 → 30 `["cart"]`; drills 2 → 3 `["drill"]`; borers 0 → 1 `["first-borer"]`; 1 → 2 `[]`; carts 6 → 0 (Start over) `[]`; all three rising `["cart", "drill", "first-borer"]`.
  - `"the vein's spot"`: (0.35, 0.4) → (8, 26); (0.65, 0.8) → (64, 48); (0.5, 0.6) → (36, 37); (0, 2) clamps to (8, 48); every spot keeps `left + 25 <= 92` and `top + 26 <= 76`.
  - `"the dig puff"`: `puffSpot(undefined)` (67, 30); (50, 40) → (42, 32); (0, 0) → (−2, −2); (200, 200) → (78, 62); `plusSpot({ x: 67, y: 30 }, 10)` → (70, 28); `plusSpot({ x: 90, y: 0 }, 20)` → (71, 1).
  - `"the sheave and steam"`: the sheave advances a frame every 0.2s (4 frames) and three times as fast for 1.6s after a `"cart"` beat; the steam every 0.32s.
  - `"a drill strokes six times, nine after a new one"`: with a drill, frames go 0,1,2,1 at 0.14s; after 6 strokes (3.36s) it rests on frame 0 for 2s; after a `"drill"` beat it runs 9 strokes (5.04s). No drill: frame 0.
  - `"trouble stops its machine"`: `trouble: "drill"` (a flood) holds the drill on frame 0; `"borer"` (a jam) holds the borer on frame 0 with no `borerDust`; `"cart"` (a cave-in) holds the run and shows `caveIn` frames 0, 1, 2, 3 at 0.12s, then 3 until the trouble ends, then `undefined`.
  - `"the tarp comes off the first borer"`: without a borer `tarp` is (7, 55); after `"first-borer"` it lifts to y 54 after 0.3s and to 53 after 0.12s more, then moves left 1px every 0.06s and is `undefined` once x reaches −27; the borer then cuts (frames at 0.16s), with its first dust after 3.4s and then every `3 + random()` seconds.
  - `"the vein glints"`: `vein` cycles 0..3 every 0.18s.
  - `"time that jumps"`: one `machinesStep` of 0.1s after rest never moves the run more than 1px.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** `src/mine-window.ts`: the scene and beats as specified; `machinesStep` ports the mockup's `windowTick`, `drillTick`, `borerTick`, `tarpTick` and the cart and drill halves of `windowBeat` (index.html lines 1020–1129), with the cave-in and vein glint added on the same pattern. The drill beat's dust puff (mockup `puff(69, 53)`) comes out as a `fill` event at (69, 53). Copy `mine-view.png` as `mine-view-granite.png`.
- [ ] **Step 4:** Run the test and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The mine window's rules: a view per band, the scene, machine beats and the vein's place (#371)` and push.

### Task 5: The mine window and the Legacy plate

**Files:**

- Create: `src/board-window.ts`, `src/board-window.test.ts`, and in `src/assets/board/` copies of `window-frame.png`, `window-glass.png`, `cage.png`, `tub-empty.png`, `tub-full.png`, `borer-tarp.png` and, from `anim/`, `sheave-4f.png`, `steam-4f.png`, `drill-work-4f.png`, `borer-cut-4f.png`, `dust-burst-4f.png`, `miner-18f.png`
- Modify: `src/board-skin.ts`, `src/board-skin.test.ts` (the `brass` skin), `src/board.css`, `src/tokens.css`

**Interfaces:**

- Consumes: Task 4; `skin` (`board-skin.ts`); `formatCount`; `reducedMotion`.
- Produces:
  - In `board-skin.ts`: `SkinKind` gains `"brass"`: `legacy-plate.png` with `ox: 3, sw: 98, sh: 32, l: 8, t: 8, r: 9, b: 8, col: 37, row: 16, fill: [37, 8, 32, 16]` (the plate's rivets sit in its 8px corners, so a 64×16 plate keeps all four).
  - `createMineWindow({ onDig, onVein, legacyBadge, random }: { onDig: () => number; onVein: () => void; legacyBadge: HTMLElement; random: () => number }): MineWindow` with `interface MineWindow { readonly root: HTMLElement; readonly dig: HTMLButtonElement; readonly vein: HTMLButtonElement; render(scene: WindowScene): void; showVein(spot: { readonly left: number; readonly top: number } | undefined): void; tick(dt: number): void }`.
    - `root` is `div.board-mine` with `data-band`. `dig` is `button.board-window` holding `.board-window-view` (layers in the spec's order: view `img.board-window-art`, sheave, steam, the Great Machine, drill, tarp or borer, borer dust, the kid, the run box `.board-window-run` with tub, miner and cage, the cave-in, the fill puff, the dig puff `.board-dig-dust`, `.board-dig-plus`, the glass), then the frame and the `No. 2 Shaft` tag (`tag` skin). `vein` is `button.golden-vein` (today's class and `aria-label`), a sibling over the view, holding the glint sprite. `span.board-legacy` (`brass` skin, 64×16 art, `pointer-events: none`) holds `legacyBadge`.
    - A click on `dig` calls `onDig()` once; if it returns more than 0, the dust puff plays at `puffSpot` of the last pointerdown (in view art px: client offset ÷ (view width ÷ 184) ÷ 2) and `.board-dig-plus` shows `+${formatCount(mined)}` at `plusSpot`, rising 1 art px every 70ms for 12 steps. A click on `vein` calls `onVein()` only.
    - `render(scene)` swaps the view art when the band changes, shows each machine per the scene, the plate when `scene.legacy`, and applies `windowBeats(previous, scene)` through `machinesBeat` (skipped under reduced motion).
    - `tick(dt)` runs `machinesStep` and paints `machinesView`, plays fill puffs from its events, and steps the dig puff and `+N`. Under reduced motion it only steps the puff (one frame, 240ms) and holds `+N` still for 700ms.
  - `runBoardLoop(step: (dt: number) => void, signal?: AbortSignal): void` — `requestAnimationFrame` when present (else nothing), `dt` in seconds capped at 0.1, stopped by `signal`.
- [ ] **Step 1: Write the failing tests** in `src/board-skin.test.ts`: `"the brass plate keeps its four rivets"`: `nineSlicePlan("brass", 64, 16)` stays inside 64×16, every blit has `sx >= 3`, and its last four blits start at (0, 0), (55, 0), (0, 8), (55, 8).
- [ ] **Step 2: Write the failing tests** in `src/board-window.test.ts` (happy-dom; `matchMedia` stubbed per test):
  - the structure: `.board-mine > button.board-window .board-window-view img.board-window-art`, the frame, the tag reading `No. 2 Shaft`, a `button.golden-vein` that is not inside `button.board-window`, and `.board-legacy` holding the badge.
  - `render` of a crystal scene sets `data-band="crystal"` and the art `src` to `mineView("crystal")`; a later granite scene swaps it.
  - the drill and borer show only when owned, the tarp only without a borer, the Great Machine and the kid only once owned, the cave-in only under a cart trouble, the plate only with `legacy`.
  - a click (`detail: 0`) with `onDig` returning 20 calls it once and shows `+20` in `.board-dig-plus` at `left: 150px; top: 56px` (`plusSpot((67, 30), 0)` is (75, 28) art px; happy-dom has no text width); after `tick(0.07)` its `top` is 54px; after 12 more steps it is hidden. `onDig` returning 0 shows nothing.
  - reduced motion: `+20` shows, stays at 56px through `tick(0.5)`, and is hidden after `tick(0.3)` more; five seconds of `tick` leave the sheave and miner as they were; a `"first-borer"` render shows the borer and no tarp at once.
  - `showVein({ left: 64, top: 48 })` shows the vein at `left: 142px; top: 110px` (view offset 7 art px); `showVein(undefined)` hides it; a vein click calls `onVein` and not `onDig`.
  - a beat: `render` with 5 carts then 6, then `tick(0.2)`, moves the sheave three frames.
  - `runBoardLoop` with a fake `requestAnimationFrame` calls `step` with dt 0.016 for a 16ms frame and 0.1 for a 5s gap, and stops after `abort()`.
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4: Implement.** Positions from the mockup (index.html lines 98–118 and 327–337), in art px inside the view: sheave (7, 0) 19×17; steam (64, −3) 11×11; drill (57, 55) 23×15; tarp (7, 55) 26×15; borer (7, 54) 28×16; borer dust (2, 55) 16×16; run box (0, 28) 92×22, `overflow: hidden`; glass (0, 0) 92×76. New art: the Great Machine on the surface between the headframe and the engine house at (23, 0) 28×26, in front of the rope; the kid in the lower gallery by the lamp at (36, 57) 10×14; the cave-in over the run's face end at (44, 24), 4 frames of 46×24; the vein glint 4 frames of 25×26. In the window: view at (7, 7) 92×76 on `--board-view-night`; frame (0, 0) 106×90; tag (23, 1) 44×10; the plate at (21, 76), straddling the frame's lower edge. `.board-mine` is 106×90 art. `+N` is 14px Share Tech Mono in `--board-amber-bare` with a `--board-hair` outline in `--board-view-night`. The plate's words are the badge (13px Barlow 700, uppercase, `--board-ink-bare`: 5.4:1 on the brass). Frames are inline `background-position-x` in CSS px; positions inline `left`/`top` in CSS px. If Task 9's shots show the Great Machine or the kid covering the cage, the lamp or a machine, move it by whole art px and record the ruling for the PR.
- [ ] **Step 5:** Run the tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 6: Commit** `The mine window down No. 2 Shaft, with the vein, the hazards and the Legacy plate (#371)` and push.

### Task 6: The window and gauge replace the rock and the Legacy badge

**Files:**

- Modify: `src/mountain-screen.ts`, `src/mountain-screen.harness.ts` (the `mountain` field becomes `dig`, found by `.board-window`), `src/legacy-panel.ts` (doc comment only: the badge sits on the window's plate), `src/board.css`, `src/style.css`, `src/tokens.css`, `src/mountain-screen.test.ts`, `src/mountain-screen-crew.test.ts`, `src/mountain-screen-depths.test.ts`, `src/style.test.ts`
- Delete: `src/tap-float.ts`, `src/tap-float.test.ts`, `src/mountain-tint.ts`, `src/mountain-tint.test.ts`

**Interfaces:**

- Consumes: Tasks 1, 2, 4 and 5.
- Produces: the screen's DOM. `div.board-gauge-row` (absolute at `top: var(--board-top)`, 424 × `--gauge-row-h`) holds the gauge at (0, 0) and `.board-mine` at (103, 3) art; the crew plate's slot at (103, 95) stays empty until Task 7. `#app`'s column starts at `--column-top`.
- [ ] **Step 1: Write the failing tests** in `src/mountain-screen.test.ts` (in the board describe, as B2 did):
  - `"the window digs exactly tap power"`: three clicks on `.board-window` add `3 × effectiveRates(m, now).tapYield` to the pocket, and `.board-dig-plus` reads `+` and that yield; there is no `.mountain`, `.mountain-stage` or `.tap-float`.
  - `"no dig while loading or mined out"`: the existing "does not mine until the cloud save has loaded" and "disables the mountain once it is mined out" tests, pointed at `screen.dig`: disabled, no stones, no `+N`, label `The mountain is mined out`; while playing the label is `Mine window: tap to mine ${tapWords(yield)}`.
  - `"the window shows the band's view"`: a seeded save at 60M mined has `.board-mine[data-band="crystal"]`; at 500K, `topsoil`.
  - `"the gauge reads the crew's rate"`: 3 helpers and a cart → `.board-gauge` `aria-label` `Output: ${formatCount(stonesPerSecond(m, now))} stones a second`, inside `.board-gauge-row`.
  - `"the vein glints in the window and pays today's vein"`: the existing golden-vein tests keep their selectors; the glinting vein is inside `.board-mine`, a click pays `veinReward` and does not dig, and `.board-note.on` holds `.vein-note` reading `Golden vein! +50 stones`.
  - `"a short absence leaves its note under the window"`: the existing #334 test reads the quiet line in `.board-note.on .vein-note`.
  - `"the Legacy plate sits on the window"`: a save with `legacy: 1` shows `.board-mine .board-legacy` with `.legacy-badge` reading `Legacy ×1.5`; `legacy: 0` hides the plate.
  - `"Start over brings the tarp back"`: after Start over on a save with a borer, the window shows the tarp and no borer.
  - The existing abort test also checks that no animation frame is requested after `abort()`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Wire it.** In `mountMountainScreen`: create the gauge and the window (`legacyBadge: legacy.badge`, `random`); `onDig` runs today's rock handler (`view.ready` check, `mineByHand(current, now(), progress.getSnapshot().trouble)`, return the stones dug) and kicks the gauge by 150 when it dug; `onVein` runs today's vein handler, then writes `veinNote` and shows it with `boardNote.show(mine.root, veinNote, { ms: 4000 })`. The quiet away line shows the same way for `QUIET_NOTE_MS`. `veinNote` stays a `p.vein-note` with `aria-live`, cleared by `render()` after its time as today. `renderVein` calls `mine.showVein(glinting ? veinSpot(state.x, state.y) : undefined)`. `render()` sets `mine.dig.disabled` and its `aria-label` as the rock's were, calls `mine.render(windowScene(view.mountain, view.trouble))` and `gauge.set(stonesPerSecond(view.mountain, now(), view.trouble))`; the 1s tick also sets the gauge; a local spend in `renderStock` kicks it by 120. `runBoardLoop((dt) => { mine.tick(dt); gauge.tick(dt); }, signal)`. Remove the rock (`mountain`, `peak`, `band`, `mountainStage`, `mountainWrap`, the old vein button and its art), the tint, the `+N crew` float and the badge's old mount. Root order: `boardTop`, the gauge row, `header`, `crew` (until Task 7), the teach note, the thumb bar, then the rest as today.
- [ ] **Step 4: CSS.** `tokens.css` gains the B3 tokens (Global Constraints). In `board.css`: `#app` `padding-top: var(--column-top)`; `.board-gauge-row`; `#app > .top-bar { margin-bottom: auto }` so the teach note and thumb bar sit at the column's foot; drop `#app > .mountain-wrap` and the ☰ button's `margin-top` (the column top already stands 8px under the gauge row); `.golden-vein` and `.vein-note` restyled for the window and the note. Remove from `style.css` every rule that only styled what went: `.mountain*`, `.mountain-band`, `.mountain-art`, `.mountain-stage`, `.mountain-wrap`, the old `.golden-vein` and `.vein-note`, `.tap-float`, `.crew-float` and their keyframes and reduced-motion lines, `.legacy-badge`. Keep `--board-top` at 176px: Buys and Upgrades still stop under the stock row.
- [ ] **Step 5: Fix the pinned tests**: `screen.mountain` becomes `screen.dig` everywhere; the rock's aria words in `mountain-screen-crew.test.ts` (lines 283, 358) become `Mine window: tap to mine …`; in `style.test.ts` move `.golden-vein` and `.vein-note` from `REQUIRED_SELECTORS` to `BOARD_SELECTORS`, drop `.mountain-wrap` and `.mountain-stage`, and add `.board-gauge-row`, `.board-gauge`, `.board-mine`, `.board-window`, `.board-legacy`. The board's reduced-motion test must still pass. Never delete a test to hide a behaviour change.
- [ ] **Step 6:** Run `npm run gate -- fast`. Expected: PASS. Then `npm run play -- --save mid tap:.board-window*3` and `npm run play -- --save heir`: the gauge and window sit under the stock row, three taps show `+N` in the window and on the odometer, the Legacy plate is on the window's lower edge, nothing scrolls, the PC shows the same board scaled.
- [ ] **Step 7: Commit** `The mine window and the output gauge replace the rock, its tint, the crew float and the Legacy badge (#371)` and push.

### Task 7: The crew plate replaces the crew line

**Files:**

- Modify: `src/crew-panel.ts`, `src/mountain-screen.ts`, `src/board.css`, `src/style.css`, `src/mountain-screen.test.ts`, `src/mountain-screen-crew.test.ts`, `src/staffing-teach.test.ts`, `src/style.test.ts`

**Interfaces:**

- Consumes: Task 2's `createCrewPlate`, `crewCounts`; crew-panel's `crew` section.
- Produces: `.board-crew` in the gauge row at (103, 95) art. Today's `section.crew` (the crew sentence, the posts chips with Grandpa, the breakdown) moves to the top of the Buys sheet under an `h3.buys-crew-title` reading `Crew`: `buysCard` order is head, intro, how card, crew, tier grid, thanks, close, and `createBuysHead`'s `body` gains the crew section so the "i" card hides it too.
- [ ] **Step 1: Write the failing tests**:
  - `mountain-screen.test.ts` `"the crew plate counts the crew and the free hands"`: 18 helpers and 6 carts → `.board-gauge-row .board-crew` `aria-label` `Crew: 18 workers, 12 free`, `.board-crew-free` `12 free`; no `.crew` is a child of `#app`.
  - `"the crew line moves into Buys"`: `.buys-card .crew .crew-status` reads `Your crew mines … stones a second` (this replaces "reads the crew's rate on the main screen"), and the `Crew` title stands above it.
  - `mountain-screen-crew.test.ts`: the first chip reads `${pool} workers` with no `free` (line 882's pattern becomes `/^\d+ workers$/`); the chip line's `aria-label` keeps `crewPostsWords` (line 836 stays).
  - `staffing-teach.test.ts` line 150: the free count is on the crew plate (`.board-crew-free` contains `free`), not on the card and not on any `.crew-bit`, and no element has `teach-point`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Mount the plate and call `crewPlate.set(crewCounts(view.mountain, now(), view.trouble))` in `render()` and the 1s tick. In crew-panel, the first chip drops ` · N free` and the guided-card `teach-point` toggle goes (the plate is now the only free count, `docs/ui-audit.md` point 9). Move the `crew` section into `buysCard`.
- [ ] **Step 4: CSS.** Remove `.crew-bit.teach-point` and the column placement rules for `.crew` (`style.css` near lines 3360–3372 and the `#app`-level crew rules); keep the chip and row styles, scoped so they still read in the Buys sheet. Remove the `style.test.ts` test `"keeps the crew's rate line on the main screen until B3's gauge"` and add `.board-crew` to `BOARD_SELECTORS`.
- [ ] **Step 5:** Run `npm run gate -- fast`. Expected: PASS. Then `npm run play -- --save early label:Buys` and `npm run play -- --save heir label:Buys`: the plate reads the crew and free hands, Buys opens with the Crew section (Grandpa on the heir save) above the cards, and nothing scrolls.
- [ ] **Step 6: Commit** `The crew plate counts the crew and the free hands; the crew line moves to the top of Buys (#371)` and push.

### Task 8: The gate checks the gauge row; saves and docs

**Files:**

- Modify: `scripts/visual-check.mjs`, `scripts/ui-audit.mjs`, `scripts/play.mjs`, `scripts/fixtures.mjs`, `src/play-plan.ts`, `src/play-plan.test.ts`, `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/ART.md`, `docs/ui-audit.md`, `docs/design-intent.md`, and the shots `npm run audit:ui` rewrites in `docs/ui-audit/`

**Interfaces:**

- Consumes: the selectors from Tasks 2–7 (`.board-gauge-row`, `.board-gauge`, `.board-gauge-read`, `.board-crew`, `.board-mine[data-band]`, `.board-window`, `.golden-vein`, `.board-legacy`, `.board-dig-plus`, `.vein-note`).
- Produces: `--search <query>` for `npm run play` (`PlayPlan.search: string`, default `""`, appended to the page URL); fixtures `crystalMountain()` (180M remaining, 3M pocket, 30 helpers, 10 carts, 6 drills, 2 borers) and `heartMountain()` (110M remaining, 40M pocket, 60 helpers, 3 kids, 20 carts, 10 drills, 4 borers, 1 machine, `legacy: 1`); play saves `crystal` and `heart`.
- [ ] **Step 1: Write the failing tests** in `src/play-plan.test.ts`: `--search ?trouble=cave-in` sets `search`; `--search` without a value is an error; the default is `""`; the usage text names `--search` and its examples use `tap:.board-window`.
- [ ] **Step 2:** Run it. Expected: FAIL. Implement it in `play-plan.ts` and `play.mjs`, add the two fixtures and saves, and correct the `crew` save's note (it is in the Deep Heart, not the Topsoil). Run it again. Expected: PASS.
- [ ] **Step 3: Retarget** `visual-check.mjs` and `ui-audit.mjs`: every `.mountain` tap becomes `.board-window` (sections 8, 9, 16 and 18, the guard screens, the audit's `press` calls and its `waitForSelector`); section 1's "vein inside the mountain" places the vein at `veinSpot`'s far corner and checks it inside `.board-window-view` and on top; section 3's vein note is read in `.board-note.on .vein-note`; section 9's badge fits inside `.board-mine` and above the crew plate; the crew line checks (section 2's `crewLineFits`, section 16's posts and breakdown, `pillClear`'s chip rows in section 21) open Buys first and read the Crew section there; `shelfCentre`'s rock centre (section 19) is replaced by the gauge row spanning the board; the `+N crew` wait in section 1 goes. The audit's `mountain-hazard` shot shows the board with the cave-in in the window, and a new `buys-hazard` shot keeps today's Buys card check.
- [ ] **Step 4: Add a gauge-row section** to `visual-check.mjs` at 424×924 and the three PC sizes, on `early` (Topsoil), `mid` (Granite), `crystal` and `heart`: `data-band` reads the save's band and the view art is that band's; on `heart` the Great Machine, the kid and the Legacy plate show; with `?trouble=cave-in` the cave-in shows; a tap on the window raises the odometer by the tap yield; under emulated reduced motion two shots of the view 600ms apart are pixel-equal and a tap still shows `+N`. Add to the board section: `.board-window` and the vein to the targets (the vein exempt from its gap to the window), the gauge texts, the crew plate, the tag and the plate to the 13px check, every `img` and sprite in `.board-gauge-row` to the exact-2× check, and `Stones a sec`, `Crew`, the crew figure, the free count, `No. 2 Shaft` and the Legacy plate's words to the contrast check. On the `late` save the crew plate's words stay inside it.
- [ ] **Step 5:** Run `npm run visual` and `npm run audit:ui`. Expected: both PASS.
- [ ] **Step 6: Docs.** `DESIGN.md` UI direction: the mine window is the tap target; the gauge row (gauge, window, crew plate) under the board's top; the window's loop, beats, band views, vein, hazards and Legacy plate; the crew line's place in Buys; drop the tint bullet and "the rock grows into the height left over". `ARCHITECTURE.md`: the new modules in the board paragraph, the gauge row and `--column-top` in the panel contract, `windowScene` as the window's only input, no `mountain-tint` or `tap-float`. `ART.md`: a row for each new and copied file in `src/assets/board/` with its size and use (the four views, the vein, cave-in, Great Machine, kid, brass plate, frame, glass, sheave, steam, drill, tarp, borer, dust, cage, tubs, miner, gauge sheet, counter); the tint paragraph goes. `ui-audit.md`: the rows for the mountain at rest, the vein, the hazard, crew needs workers and the Legacy badge; the 0-tap row of the IA table; point 9 says the crew plate is the only free count; the "rock stands 8px below the crew chips" line goes. `design-intent.md`: "Tap the rock" and the band row's "its picture changes colour" become the mine window and its view per band.
- [ ] **Step 7: Commit** `The gate checks the gauge row and the window in every band (#371)` and push.

### Task 9: Prove it

**Files:** none new (fixes only).

- [ ] **Step 1:** `npm run gate -- full`. Expected: every step PASS, with no coverage floor lowered. Fix any FAIL first (read `.gate/logs/<step>.log`).
- [ ] **Step 2:** `npm run play` on `fresh`, `early` (Topsoil), `mid` (Granite), `crystal` (Crystal Caves), `heart` (Deep Heart), `late` and `edge`, phone and desktop, each with `tap:.board-window*3`. Each `log.txt` has no page error and a save line. Look at every shot: the band's own view, the miner on the run, the needle and counter, the crew plate, `+N` in the window, no scroll at 424×924, the same board scaled on the PC. All four bands are seen.
- [ ] **Step 3:** `npm run play -- --save heart --search ?trouble=cave-in`: the cave-in is in the window and the run stands still; `npm run play -- --save edge tap:.board-window*5`: the view turns from the Topsoil to the Granite as the taps cross the band; `npm run play -- --save mid label:Buys` and buy a cart and a drill: the sheave spins, the next cage visit swaps the tub, the drill runs nine strokes.
- [ ] **Step 4: Commit** any fixes as `B3 fixes from play (#371)` and push.

## Notes

- **Art.** No gap blocks B3. The approved Legacy plate is 104×32 art, too tall for the frame's lower edge at 2×, so it is drawn as a `brass` 9-slice at 64×16 (all four rivets kept, nothing stretched). The mockup's `gauge-output.png` and `gauge-output-needle.png` are the sources of the composed `gauge-output-sheet.png` and are not copied. A flood has no art of its own (the drill stands still), and a jammed Great Machine shows no change in the window (its art is still); its trouble shows in Buys, and on its bay from B4.
- **Later slivers.** The red button's press frames on a window tap come with the button in B4, as do the bays where trouble is fixed; until then a hazard is fixed on its Buys card, as today.
- **Rulings made here** (for the PR body): the haulage run shows from the first worker, kid or cart; beats fire on any count rise, a cloud copy included; the vein and quiet away notes use the board note under the window, over the crew plate for their few seconds; the crew line's sentence, chips and Grandpa move to a Crew section at the top of today's Buys sheet (C8), the chip loses its free count and the staffing teach point retires; the `+N crew` float retires (its number is the gauge's counter); `+N` now shows under reduced motion, without rising, as the spec says.
