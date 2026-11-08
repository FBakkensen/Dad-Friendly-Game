# Control Board B4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board's middle goes live (#372): the machine bays under a band tag (replacing the layer line), the Ready now plate, the one gold control on the board, and the red DIG button. A tap on a bay opens Buys, and on a troubled bay it fixes the trouble as today. One tap on Ready now buys exactly one, a sleepy double tap included. Saving for shows the time and opens Buys. The red button digs exactly like a window tap.

**Architecture:**

- Two absolutely placed rows join `#app`, at the mockup's `LAY["924"]` tops: `.board-bays` at `--bays-top` (430px; its band tag rises to 420) and `.board-ready-row` at `--ready-top` (644px). The column (the thumb bar, with the ☰ menu moved to its right end) now starts at `--rail-top` (768px), which is where B5's key rail goes. It ends 8px above the save line (860). The teach note leaves the column and shows in the board note above its thumb. The sheets still stop under the stock row (`--board-top`), so they cover the bays and the plate.
- Pure rules with unit tests: `src/ready-now.ts`, the Ready now rule (`readyNow`: display only, it never buys), and `src/machine-bays.ts` (the C2 tier pick, each bay's state and lamp, the flap digits). `etaShort` joins `src/format.ts`. The DOM parts follow the `board-*` pattern: `src/board-bays.ts` (the band tag, three bay buttons, the flap counters and the drill icon) and `src/board-ready.ts` (the plate with its 1.9s guard, and the red button with its press frames and By hand tally). `src/trouble-tap.ts` is today's 600ms hold-to-fix, lifted out of `crew-panel.ts` so the Buys cards and the bays share it.
- `mountain-screen.ts` keeps the wiring. Each render it computes `readyNow(view.mountain, now(), view.trouble)` once and passes it to the plate and the bays. A Ready tap re-reads the rule from the store's snapshot and buys through `buyWithTeach`, the Buys card's mutation, so a buy from the plate is the same buy as one from Buys. The red button calls the same `dig()` the window does, then `mine.dug(mined)` puffs in the window.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom per file), puppeteer-core scripts (`visual-check.mjs`, `ui-audit.mjs`, `play.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-07-control-board-design.md`. This plan uses the B4 row; "The board, top to bottom" items 4 and 5; decision D1; calls C2, C3 and C11; "Where everything else goes" (the layer line row); "Room for #357" (the bay sub-line); "Art"; "Checks". Reference mockup: `mockups/control-board/index.html`. The bays are CSS lines 133–154, markup 355–382, `placeBayIcons`, `paintBays` and `paintBayLamps` at 1138–1192, and `setFlip` at 850. The plate and the red button are CSS 156–178, markup 384–399, `suggest()` 763, `rdContent`, `paintReady` and the plate's click 1234–1275, and the dig handlers 1300–1335. `LAY` is at 1588. These belong to B5 and stay out: the key rail, the drawers, the Buys key's red lamp, teach dot lamps, and the Buys footnote about Ready now.

## Art needed

PixelLab spend needs Flemming's OK (the pixellab skill asks first). The controller generates this piece before it dispatches Task 5, and it lands at the named path.

| Asset                                                           | Size                       | Init image                                                                                                                           | Prompt                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/assets/board/mach-machine.png`, the Great Machine bay icon | 32×32 art px (64×64 shown) | Yes: `src/assets/board/window-great-machine.png` (28×26, the window's approved Great Machine), centred on a 32×32 transparent canvas | "The same steam-driven Great Machine as the init image, as a bay icon: dark riveted steel with brass bands and a tall stack, three-quarter side view, sitting on rails, muted Factorio palette matching the cart, drill and borer icons, transparent background, no glow" |

Why only this piece: C2 gives the Great Machine a bay from the moment it is on sale, and the spec's Art section lists "the Great Machine … icons for bays and rows" as still to make. The machine bay is never locked, because it only appears once the machine is on sale or owned, so it needs no dim state. Kids are crew, not machines: they never get a bay, so a kid icon is B5's, for its Buys rows. Everything else B4 shows is in the mockup folder or already in `src/assets/board/` (see Global Constraints).

## Global Constraints

- **UI only.** No change to rules, numbers, prices, saves or the lab. `readyNow` is the one new rule. It is display only: it reads the mountain and never buys, and only a tap buys. `buyWithTeach` is today's card mutation, moved and not changed. Exporting an existing private helper is fine.
- **Art.** Every graphic is PixelLab art, shown at exactly 2× (one art px is two CSS px), with `image-rendering: pixelated` and no CSS filters. There are no placeholder boxes.
  - Copied (not moved, so the mockup still opens) from `mockups/control-board/assets/art/ind-board/` into `src/assets/board/`, flat, with their names kept: `ready-guard.png` (5 frames of 40×40: lit, dim, pressed, done, off), `plate.png` (104×32), `dig-button.png` (3 frames of 56×56: rest, down, up), `flip-counter.png` (32×24), `mach-cart.png`, `mach-borer.png` and `mach-borer-tarp.png` (32×32 each), and `drill-run.png` (4 frames of 32×32).
  - Already in `src/assets/board/` and reused: `lamp.png` (4 frames of 20×20: off, amber, green, red), `tag.png` and `frame.png` (skins).
  - New, from "Art needed": `mach-machine.png`.
- **CSS tokens.** New CSS has no raw px or colours (`npm run tokens`). Board CSS writes sizes as `calc(var(--art) * N)` or names a token, and lives in `src/board.css`. Inline styles set from TypeScript are CSS px, as B3's are. `tokens.css` gains:
  - row tops: `--bays-top: 430px`, `--ready-top: 644px`, `--rail-top: 768px`, `--bay-h: 62px`;
  - `--column-top: var(--rail-top)`;
  - mockup colours: `--board-ink-flap: #e4dcc6`, `--board-ink-plate-2: #0b0e10`, `--board-plate-shine: rgba(255, 255, 255, 0.22)`;
  - type: `--board-type-18: 18px`, `--board-type-24: 24px`;
  - any lead or letter-spacing that is not whole art px (for example the bay name's 17px lead).
- **Fonts.** The bundled Barlow Condensed and Share Tech Mono. Numbers are in Share Tech Mono with tabular figures.
- **Copy.** Today's words stay: the tier names, `lockRateLine`, `lockAria`, `troubleShout`, `troubleAria`, `TROUBLE_FIXED` ("Fixed! The crew cheers."), `milestoneLine`, `formatCompact` prices, `formatSpeed` gains, `tapWords`, "The mountain is mined out", and the layer names and lines. The band tag reads `${layer.name}`, plus ` · ${line}` without its full stop where the layer has a line ("The Granite · Suits borers", "The Topsoil").
  - New strings, listed in the PR for Flemming:
    - the plate's kicks: `Ready now`, `Saving for`, `Done`;
    - its buy lines: `Buy a cart`, `Buy a drill`, `Buy a borer`, `Buy a Great Machine` and `Hire a worker`, each with ` · price`;
    - its saving lines: `Saving for a …`, `For a …`, ` · in 4m`;
    - the time forms: `4m`, `1h 5m`, `>99h`;
    - the plate's reasons: `your free worker can run it`, `N free workers can run it`, `every hand is busy`;
    - the Done lines: `Done · +N/s`, `Cart N is rolling`, `Drill N is drilling`, `Borer N is boring in`, `Great Machine N is running`, `Worker N is on the crew`;
    - the red button: `Dig · +N`, `By hand · +N`;
    - the bays: `Next`, `First`, `Locked`, `+N/s · 1 hand` / `N hands`, `· Hold to fix`;
    - aria labels: `Ready now: …`, `… Opens Buys`, `Done. …`, `Dig: tap to mine …`, and the bay labels in Task 5.
  - No "?" in player text.
- **Targets** must be at least 48×48 CSS px with 8px gaps at 424×924: each bay button is 408×54 and bays stand 8px apart, the plate is 288×96, the red button is 112×104, and the plate stands 10px from the red button. **Text** is at least 13px. Contrast is at least 4.5:1 from screenshot pixels; a legend that reads under it uses the bare ink, as B2 and B3 did.
- **Motion.** Hard steps only. A flap flips in `steps(3)` over 180ms, the drill icon steps a frame every 0.18s, the guard and the red button change whole frames, and the plate's Done hold lasts 1.9s. `prefers-reduced-motion: reduce` (`reducedMotion()` in `float-text.ts`) stops the flips and the drill icon, and skips the red button's echo of a window tap. A press's own frames and the Done state stay. Nothing bounces.
- **Phone layout.** It never scrolls at 424×924. The gauge row is 176..414, the bays 420..636 (tag) and the Ready row 644..762. The rail slot is 768..860; until B5 it holds the thumb bar with the ☰ menu as its fifth cell, at the right end where B7's Ledger key goes. The teach note shows in the board note above its thumb.
- **Close is pause.** Saving is untouched: a Ready buy, a red-button dig and a bay fix go through `applyMutation`, `pressTrouble` and `fixTrouble` as today. `.save-status` keeps `data-kind` and `data-log`.
- **Commits** are a plain sentence ending `(#372)`, with these trailers. Push the branch after each task (`git push -u origin claude/beautiful-thompson-t7oje5`). Never force-push.

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011RgeWsS7EcGfk9opPt3V2W
  ```

## Review Focus

1. **A sleepy double tap, and a tap the board did not expect.**
   - Two clicks in one frame, a third at 1.8s, and a held Enter key that repeats all buy exactly one.
   - A click at 1.95s buys again.
   - The pocket can fall between the render and the tap (a cloud copy, or a buy in Buys). The tap re-reads the rule from the store and never trusts the painted plate, so it never buys what is no longer affordable, and a Saving for tap spends nothing. Ten seconds of ticks with a ready pick buy nothing.
   - Pinned in Tasks 4 and 7.
2. **The Saving for time at its edges.** These cases must hold:
   - zero speed (a new mountain) and a NaN or Infinity rate show no time;
   - 1 second short reads `1m`;
   - exactly 4 minutes reads `4m`;
   - 59m01s reads `1h 0m`;
   - 100 hours or more reads `>99h`.

   The time is at the current speed, so it shortens while a boost runs. Pinned in Task 1.

3. **Trouble on and off the bays.**
   - A troubled bay never opens Buys. Five taps fix it, or a 600ms hold. The click that ends a hold neither counts again nor opens Buys.
   - When an engineer fixes it first, the next tap opens Buys.
   - A cart trouble in the Great Machine era has no bay and is fixed on its Buys card as today.
   - Pinned in Tasks 3, 5 and 6.
4. **Counts and prices that outgrow a bay.**
   - Counts of 0, 9, 10, 99, 100, 250, and NaN or 5,000 from a bad save: two flaps, then three, and the display clamps at 999. A price stops near 200 owned, so a save never gets close.
   - Prices up to `>999T`.
   - The longest name next to three flaps, and the Deep Heart tag, all at 13px or more, with nothing overlapping.
   - Pinned in Tasks 2, 5 and 8.
5. **The bays switching tiers (C2), and saves that jump.**
   - When the Great Machine goes on sale mid-session, the bays become drill, borer and machine, with no flap flips for the swap.
   - Start over brings back cart, drill and borer, with the borer under its tarp.
   - A kid's run opens the machine at 0.9 of its depth.
   - No flap flips on the first render after the save loads.
   - Pinned in Tasks 2 and 5.

---

### Task 1: The Ready now rule

**Files:**

- Create: `src/ready-now.ts`, `src/ready-now.test.ts`
- Modify: `src/format.ts`, `src/format.test.ts`, `vite.config.ts` (a 100% floor for `src/ready-now.ts`; `format.ts` keeps its 100%)

**Interfaces:**

- Consumes:
  - `MACHINE_IDS`, `TIERS`, `tierById`, `owned`, `tierCost`, `MachineId` (`tiers.ts`);
  - `tierLocked` (`crew.ts`);
  - `staffForBuy` (`engineers.ts`);
  - `crewCounts` (`crew-count.ts`);
  - `effectiveRates` (`rates.ts`);
  - `stonesPerSecond` (`mountain.ts`);
  - `stretch` (`scale.ts`);
  - `Trouble` (`hazards.ts`).
- Produces:
  - `type ReadyTier = MachineId | "helper"`.
  - `type ReadyPick`:
    - `{ readonly kind: "ready"; readonly tier: ReadyTier; readonly price: number; readonly gain: number; readonly free: number }`
    - `{ readonly kind: "saving"; readonly tier: ReadyTier; readonly price: number; readonly gain: number; readonly free: number; readonly etaMs: number | undefined }`
    - `{ readonly kind: "mined-out" }`
  - `readyNow(mountain: Mountain, now: number, trouble?: Trouble): ReadyPick`. The fields read:
    - `price` is `tierCost(tier, owned, stretch(mountain))`;
    - `gain` is `effectiveRates(mountain, now, trouble).tierSpeed[tier]`, what one more adds, as the Buys card shows it;
    - `free` is `crewCounts(…).free`;
    - `etaMs` is `(price − pocket) / stonesPerSecond(…) × 1000`, or `undefined` when that speed is 0 or the result is not finite.
  - `etaShort(ms: number): string` in `format.ts`. It rounds up to whole minutes, with at least 1. Under 60 minutes it reads `${m}m`. From 60 it reads `${h}h ${m % 60}m`. From 100 hours it reads `>99h`.

- [ ] **Step 1: Write the failing tests** in `src/format.test.ts`, under `"etaShort"`:
  - 1 → `"1m"`, 60,000 → `"1m"`, 60,001 → `"2m"` and 240,000 → `"4m"`;
  - 3,541,000 (59m01s) → `"1h 0m"` and 3,900,000 → `"1h 5m"`;
  - 359,940,000 (99h59m) → `"99h 59m"`, and 359,941,000 → `">99h"` (it rounds up to 100h);
  - 360,000,000 → `">99h"`.
- [ ] **Step 2: Write the failing tests** in `src/ready-now.test.ts`. Build every mountain with `createMountain()` plus fields, `now` fixed, and expected prices from `tierCost` (never literals):
  - `"the biggest machine he can run and afford"`: 24 helpers, 6 carts, 2 drills and 1 borer, so 8 are free. With the pocket at the borer's price → `ready` borer. With the pocket at the drill's price → `ready` drill. `free` is 8.
  - `"exactly enough"`: the pocket equal to the price is affordable, and free equal to the staff can run it.
  - `"a machine he can afford but not staff is passed over"`: the pocket covers a borer but only 3 are free → `ready` drill.
  - `"a free hand saves for a machine, never a worker"`: 1 free, with the pocket under the cart's price but over the worker's → `saving` cart.
  - `"saving for the cheapest machine a free hand can run"`: 18 helpers, 6 carts, pocket 100 → `saving` cart, with `etaMs` = `(price − 100) / stonesPerSecond(m, now) * 1000`.
  - `"a tie on price goes to the lower tier"`: inside `withFactors({ "price.cart": 1.218, "price.drill": 0.01 }, …)` both first prices are 731. With 2 helpers, 0 carts and 0 drills, pocket 700 → `saving` cart, and pocket 731 → `ready` drill (the bigger of the two affordable).
  - `"a worker only when no hand is free"`:
    - 6 helpers and 6 carts (0 free) with the pocket over the cart and worker prices → `ready` helper, `gain` = `tierSpeed.helper`;
    - the same with the pocket under the worker's price → `saving` helper with its time.
  - `"zero speed shows no time"`: a fresh mountain → `saving` helper, price 20, `etaMs` undefined.
  - `"locked tiers and kids are never offered"`:
    - in the Topsoil, with 40 free and the pocket over the borer's first price → `ready` drill, since the borer is locked by depth;
    - with no Hammer, a machine-priced pocket never picks `machine`;
    - with the Crown, the pick is never `kid`.
  - `"the Great Machine's tended bill"`: on sale, with an engineer out of the tunnel, 5 free and the pocket over its price → `ready` machine (`staffForBuy` 5, not 10).
  - `"a troubled machine stays in the pick, at its troubled gain"`: a cart trouble with the cart as the pick → `ready` cart, `gain` = `effectiveRates(m, now, trouble).tierSpeed.cart`.
  - `"mined out"`: `remaining: 0` → `{ kind: "mined-out" }`.
  - `"display only"`: a frozen mountain comes back deep-equal after `readyNow`.
  - `"a boost shortens the time"`: with Overtime running, `etaMs` equals `(price − pocket) / stonesPerSecond(m, now) × 1000` at the boosted speed, and is shorter than at a `now` after Overtime ends.
- [ ] **Step 3:** Run `npx vitest run src/ready-now.test.ts src/format.test.ts`. Expected: FAIL (`etaShort` and the module are missing).
- [ ] **Step 4: Implement** `etaShort` and `readyNow`:
  1. Walk the unlocked `MACHINE_IDS` from the biggest down. Return the first with `free >= staffForBuy` and `pocket >= price`.
  2. Otherwise, with `free > 0`, take the runnable machines by ascending price. A stable sort keeps tier order on a tie.
  3. Otherwise take the worker.

  Add the coverage floor.

- [ ] **Step 5:** Run the tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 6: Commit** `The Ready now rule: the biggest machine he can run and afford, else what he saves for, with the time (#372)` and push.

### Task 2: The bays' rules

**Files:**

- Create: `src/machine-bays.ts`, `src/machine-bays.test.ts`
- Modify: `vite.config.ts` (a 100% floor for `src/machine-bays.ts`)

**Interfaces:**

- Consumes:
  - Task 1's `ReadyPick`;
  - `tierLock`, `TierLock` (`crew.ts`);
  - `TroubleKind` (`hazards.ts`);
  - and Task 1's sources for price, gain, staff and free.
- Produces:
  - `bayTiers(mountain: Mountain): readonly [MachineId, MachineId, MachineId]` (C2). It returns `["cart", "drill", "borer"]` until the Great Machine is on sale (`tierLock` undefined) or owned, then `["drill", "borer", "machine"]`.
  - `type BayLamp = "off" | "amber" | "green" | "red"`.
  - `type BayView`:
    - `{ readonly kind: "locked"; readonly tier: MachineId; readonly count: number; readonly lock: TierLock }`
    - `{ readonly kind: "open"; readonly tier: MachineId; readonly count: number; readonly price: number; readonly gain: number; readonly staff: number; readonly lamp: "off" | "amber" | "green" }`
    - `{ readonly kind: "trouble"; readonly tier: MachineId; readonly count: number; readonly price: number; readonly gain: number; readonly staff: number; readonly trouble: TroubleKind }`
  - `bayViews(mountain: Mountain, now: number, trouble: Trouble | undefined, pick: ReadyPick): readonly [BayView, BayView, BayView]`. Trouble on the bay's tier wins over a lock.
  - `bayLamp(view: BayView): BayLamp`. Its states:
    - trouble → red;
    - locked → off;
    - open → its lamp: amber when `pick.kind === "ready"` and `pick.tier` is this tier, green when `pocket >= price` and `free >= staff`, off otherwise.
  - `flapDigits(count: number): string`. A count under 10 gets a leading space, 10–99 reads as two digits, and 100–999 as three. Above 999 it reads `"999"`. NaN or negative reads `" 0"`.
- [ ] **Step 1: Write the failing tests** in `src/machine-bays.test.ts`:
  - `"cart, drill and borer until the Great Machine is on sale"`, testing `bayTiers` against these saves:
    - a fresh mountain;
    - one at 119M mined;
    - one at 125M without the Hammer;
    - one at 125M with the Hammer → `["drill", "borer", "machine"]`;
    - one owning a machine at 30M (a cloud copy) → drill, borer, machine;
    - a kid's run (`stretch` set) with the Hammer at 109M mined (at least 0.9 × 120M) → drill, borer, machine, and at 107M → cart, drill, borer.
  - `"each bay's state"`, from the early save (18 helpers, 6 carts, pocket 6,854):
    - the cart bay is open, lamp amber (the Ready pick), count 6, `staff` 1;
    - the drill bay is open, lamp off (too dear);
    - the borer bay is locked with a depth lock.
  - `"green is ready but not the pick"`: with the pocket over both the cart and drill prices and 12 free, the drill is amber and the cart green.
  - `"short of hands is dark"`: the pocket over the cart's price but 0 free → the cart is off.
  - `"trouble shows on its bay"`: a cart trouble → the cart bay is `trouble` with kind `cave-in` and lamp red. A borer trouble during a lock is impossible, but forced in the test, trouble wins.
  - `"flap digits"`: 0, 7, 9, 10, 42, 99, 100, 250, 999, 1,000, 5,000, NaN and −3 → `" 0"`, `" 7"`, `" 9"`, `"10"`, `"42"`, `"99"`, `"100"`, `"250"`, `"999"`, `"999"`, `"999"`, `" 0"` and `" 0"`.
  - `"display only"`: a frozen mountain comes back deep-equal.
- [ ] **Step 2:** Run `npx vitest run src/machine-bays.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/machine-bays.ts` with the signatures above, and add the floor.
- [ ] **Step 4:** Run the test and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The bays' rules: which three tiers, each bay's state and lamp, and the flap digits (#372)` and push.

### Task 3: One hold-to-fix and one buy path, shared

**Files:**

- Create: `src/trouble-tap.ts`, `src/trouble-tap.test.ts`
- Modify: `src/crew-panel.ts`, `src/staffing-teach.test.ts`

**Interfaces:**

- Consumes: `FIX_HOLD_MS` (`hazards.ts`); `buyCrew` (`crew.ts`); `markTaught` and `showsDot` (`teach.ts`).
- Produces:
  - `watchFixHold(el: HTMLElement, { tier, fix }: { readonly tier: () => TroubleTier | undefined; readonly fix: (tier: TroubleTier) => void }): { readonly heldFix: () => boolean }`.
    - On a primary-button `pointerdown` with `tier()` defined, it starts a `FIX_HOLD_MS` timer that calls `fix(tier)`.
    - `pointerup`, `pointercancel` and `pointerleave` clear the timer.
    - `heldFix()` is true once, for the click that follows a hold that fixed. The caller ignores that click.
  - `buyWithTeach(mountain: Mountain, id: TierId): Mountain`, exported from `crew-panel.ts`: today's card mutation, `buyCrew`. A worker hired while `showsDot(mountain, "staffing")` also gets `markTaught(…, "staffing")`.
- [ ] **Step 1: Write the failing tests** in `src/trouble-tap.test.ts` (happy-dom, fake timers):
  - a pointerdown with a tier, then 600ms, calls `fix` once with that tier, and `heldFix()` is true and then false;
  - a pointerup at 599ms calls nothing;
  - a right-button pointerdown, or a `tier()` of undefined, starts nothing;
  - `pointerleave` and `pointercancel` clear the timer.

  In `src/staffing-teach.test.ts`, under `"buyWithTeach"`: a worker bought while a machine stands idle marks staffing taught; a cart does not; an unaffordable tier returns the same mountain.

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** both. In `crew-panel.ts`:
  - the card's `holdTimer` and `suppressClick` become `watchFixHold(card, { tier: () => trouble on this card's tier, fix: (t) => { progress.fixTrouble(t); thank if fixed } })`;
  - the click handler starts `if (hold.heldFix()) return;`;
  - both `applyMutation` buys call `buyWithTeach`.

  Nothing else changes.

- [ ] **Step 4:** Run `npx vitest run src/trouble-tap.test.ts src/mountain-screen-crew.test.ts src/staffing-teach.test.ts` and `npm run gate -- fast`. Expected: PASS, with every existing card trouble and staffing test unchanged.
- [ ] **Step 5: Commit** `The Buys cards' hold-to-fix and buy move into shared helpers for the bays (#372)` and push.

### Task 4: The Ready now plate and the red button

**Files:**

- Create: `src/board-ready.ts`, `src/board-ready.test.ts`, and copies in `src/assets/board/` of `ready-guard.png`, `plate.png` and `dig-button.png`
- Modify: `src/board.css`, `src/tokens.css`

**Interfaces:**

- Consumes:
  - Task 1's `ReadyPick`, `ReadyTier` and `etaShort`;
  - `tierById`;
  - `formatCompact`, `formatCount`, `formatSpeed` and `tapWords`;
  - `reducedMotion`.
- Produces:
  - `READY_HOLD_MS = 1900` and `BY_HAND_MS = 1500`.
  - `type ReadyWords = { readonly kick: string; readonly main: readonly string[]; readonly why: readonly string[]; readonly aria: string; readonly guard: "lit" | "dim" | "done" | "off" }`. `main` and `why` are fit options, longest first.
  - `readyWords(pick: ReadyPick): ReadyWords`. Let `n` be the tier's article phrase: `a cart`, `a drill`, `a borer`, `a Great Machine`, `a worker`. Let `g` be `+${formatSpeed(gain)}/s` and `p` be `formatCompact(price)`.
    - **ready:**
      - kick `Ready now`;
      - main `[`${verb} · ${p}`, verb]`, where the verb is `Buy ${n}` or `Hire a worker`;
      - why `[`${g} · ${reason}`, g]`, where the reason is `your free worker can run it` (free 1), `${free} free workers can run it` (more), or `every hand is busy` (a worker);
      - aria `Ready now: ${main[0]}, ${why[0]}`;
      - guard `lit`.
    - **saving:**
      - kick `Saving for`;
      - main `[`Saving for ${n} · in ${etaShort(etaMs)}`, `For ${n} · in ${…}`, `Saving for ${n}`]`, or `[`Saving for ${n}`, `For ${n}`]` when `etaMs` is undefined;
      - why `[`${p} · ${g}`]`;
      - aria `${main[0]}. ${why[0]}. Opens Buys`;
      - guard `dim`.
    - **mined-out:**
      - kick `""`;
      - main `["The mountain is mined out"]`;
      - why `[""]`;
      - aria the same sentence;
      - guard `off`.
  - `doneWords(tier: ReadyTier, count: number, gain: number): ReadyWords`:
    - kick `Done`;
    - main `[`Done · ${g}`, "Done"]`;
    - why `[`Cart ${count} is rolling`]` (`Drill … is drilling`, `Borer … is boring in`, `Great Machine … is running`, `Worker … is on the crew`);
    - aria `Done. ${why[0]}, ${g}`;
    - guard `done`.
  - `type ReadyTap = { readonly kind: "bought"; readonly tier: ReadyTier; readonly count: number; readonly gain: number } | { readonly kind: "opened" } | { readonly kind: "nothing" }`.
  - `createReadyPlate({ onTap, fits }: { onTap: () => ReadyTap; fits?: (el: HTMLElement) => boolean }): ReadyPlate` with `interface ReadyPlate { readonly root: HTMLElement; readonly button: HTMLButtonElement; render(pick: ReadyPick | undefined, enabled: boolean): void }`.
    - `root` is `div.board-ready-row`. `button` is `button.board-ready`, with `aria-live="polite"`. It holds `.board-ready-kick` (`board-lg`), `i.board-ready-guard` (the sprite), `.board-ready-plate` (`img` plate.png), `.board-ready-main` and `.board-ready-why`.
    - `render(undefined, …)` means the save is not in: guard `off`, no words, disabled.
    - A click while holding does nothing. Otherwise it sets holding first, then calls `onTap()`:
      - `bought` shows `doneWords` and holds for `READY_HOLD_MS`, ignoring both clicks and renders, then paints the last rendered pick;
      - any other result releases the hold at once.
    - `pointerdown` shows the guard's `pressed` frame when the shown pick is `ready` and not holding.
    - `fits` (default `el.scrollWidth <= el.clientWidth + 1`) picks the first fit option for main and why.
    - The guard frame is inline `background-position-x` at −80px per frame: lit 0, dim 1, pressed 2, done 3, off 4.
  - `createDigButton({ onPress }: { onPress: () => void }): DigButton` with `interface DigButton { readonly root: HTMLElement; readonly button: HTMLButtonElement; set(tapYield: number, enabled: boolean, label: string): void; dug(mined: number): void; echo(): void }`.
    - `root` is `div.board-dig`, holding `button.board-dig-button` (its `i.board-dig-sprite` with frames at −112px) and `.board-dig-lg` (`board-lg`, the count in a `b`).
    - A click calls `onPress()`.
    - `set` writes `Dig · +${formatCompact(tapYield)}` unless a tally runs, along with `disabled` and the `aria-label`.
    - `dug(mined)` adds to the tally, shows `By hand · +${formatCompact(tally)}` with `.is-hit`, and settles back after `BY_HAND_MS`.
    - The press frames: `pointerdown` shows frame 1; a click shows frame 2 for 70ms, then 0; `pointerup`, `pointercancel` and `pointerleave` show 0 unless a timer runs.
    - `echo()` shows frame 1, then 2 after 80ms, then 0 after 60ms more. It does nothing under reduced motion.
- [ ] **Step 1: Write the failing tests** in `src/board-ready.test.ts` (happy-dom, fake timers, `matchMedia` stubbed per test, `fits` injected as `(el) => (el.textContent ?? "").length <= 26`):
  - `readyWords` for:
    - a ready cart with 1 free at 5,868 and +12 → `Ready now`, `Buy a cart · 5,868`, `+12/s · your free worker can run it`, guard `lit`;
    - 3 free → `3 free workers can run it`;
    - a ready worker → `Hire a worker · 20` and `+1/s · every hand is busy`;
    - a ready machine → `Buy a Great Machine · 120.6M`;
    - saving a cart in 4 minutes → `Saving for a cart · in 4m` and `5,868 · +12/s`, aria ending `Opens Buys`, guard `dim`;
    - saving with no time → `Saving for a worker`;
    - mined out → `The mountain is mined out`, guard `off`.
  - `doneWords("cart", 31, 12)` → `Done`, `Done · +12/s`, `Cart 31 is rolling`. Also check the other four tiers' lines.
  - The plate:
    - `render(ready cart, true)` shows the kick and the fitted lines, and the guard is at `0px`;
    - two clicks call `onTap` once (it returns `bought`) and show `Done · +12/s`;
    - a render during the hold leaves Done;
    - a click at 1,800ms calls nothing;
    - after 1,900ms the last pick shows and a click calls `onTap` again;
    - `onTap` returning `opened` or `nothing` releases the hold at once (a second click calls it again);
    - `render(undefined, false)` is disabled with the guard at `-320px`;
    - a pointerdown on a ready pick shows `-160px`.
  - The red button:
    - `set(20, true, …)` reads `Dig · +20`;
    - a click calls `onPress` once;
    - three `dug(20)` read `By hand · +60` with `.is-hit`, and read `Dig · +20` again 1,500ms after the last;
    - pointerdown puts the sprite at `-112px`, and a click at `-224px` and then `0px` after 70ms;
    - `echo()` runs −112, −224, 0 over 140ms, and does nothing under reduced motion;
    - `set(20, false, "The mountain is mined out")` disables it with that label.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** the module and copy the three PNGs. The CSS comes from the mockup (lines 156–178), in art px, inside the 424 × 59-art row:
  - the plate button at (3, 0), 144×48;
  - the kick at (50, 3), `--board-amber-bare`, `--board-ink-bare` when `.is-saving`, `--board-green` when `.is-done`;
  - the guard at (0, 8), 40×40, with `background-size` `calc(var(--art) * 200) calc(var(--art) * 40)`;
  - the plate image at (40, 12), 104×32;
  - the text box at (48, 17), 88×22: main 18px bold in `--board-ink-plate`, why 13px semi-bold in `--board-ink-plate-2`, both with a `0 var(--board-hair) 0 var(--board-plate-shine)` text-shadow;
  - `.board-dig` at (152, 0), 56×59, with the button 56×52 and its sprite 56×56 at (0, 0), `background-size` `calc(var(--art) * 168) calc(var(--art) * 56)`, `overflow: visible`;
  - the label centred at top 50, with the `b` in `--board-ink`, `--board-amber` under `.is-hit`.

  Add the Global Constraints tokens this needs.

- [ ] **Step 4:** Run the tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The Ready now plate with its double-tap guard, and the red DIG button with its press frames (#372)` and push.

### Task 5: The machine bays

Needs `src/assets/board/mach-machine.png` (Art needed) before it starts.

**Files:**

- Create: `src/board-bays.ts`, `src/board-bays.test.ts`, and copies in `src/assets/board/` of `flip-counter.png`, `mach-cart.png`, `drill-run.png`, `mach-borer.png` and `mach-borer-tarp.png`
- Modify: `src/board.css`, `src/tokens.css`

**Interfaces:**

- Consumes:
  - Task 2's `BayView`, `bayLamp` and `flapDigits`;
  - Task 3's `watchFixHold`;
  - `skin` (`board-skin.ts`);
  - `layerOf` and `layerCardWords`;
  - `tierById`, `lockRateLine`, `lockAria`, `troubleShout`, `troubleAria`, `milestoneLine`, `formatCompact`, `formatCount`, `formatSpeed` and `workerWords`;
  - `reducedMotion`.
- Produces:
  - `bandWords(mountain: { readonly remaining: number }): string`. It returns `layer.name` plus ` · ${line}` with the trailing `.` dropped, when `layerCardWords` has a line.
  - `bayLines(view: BayView): readonly string[]`, the sub-line's fit options, longest first:
    - open: always three, so the patterns line up across bays. First `milestoneLine(tier, count, formatCompact)`, or the second line when that is undefined. Then `+${formatSpeed(gain)}/s · ${staff} hand` (or `hands`). Then `+${formatSpeed(gain)}/s`;
    - locked: `[lockRateLine(tier, lock)]`;
    - trouble: `[`${troubleShout(kind)} · Hold to fix`]`.
  - `sharedPattern(options: readonly (readonly string[])[], fits: (bay: number, text: string) => boolean): readonly string[]`. It returns the first index `i` at which every bay's `options[b][min(i, len − 1)]` fits, else the last. All three bays read the same pattern, as in the mockup.
  - `createMachineBays({ onOpen, onPress, onFix, fits }: { onOpen: () => void; onPress: (tier: TroubleTier, bay: HTMLElement) => void; onFix: (tier: TroubleTier, bay: HTMLElement) => void; fits?: (el: HTMLElement) => boolean }): MachineBays` with `interface MachineBays { readonly root: HTMLElement; readonly bays: readonly HTMLButtonElement[]; render(views: readonly BayView[] | undefined, band: string): void; tick(dt: number): void }`.
    - `root` is `section.board-bays` (frame skin) holding `.board-band` (tag skin, `.board-lg` words) and three `button.board-bay`. Each bay holds:
      - `i.board-lamp`;
      - `.board-bay-icon` (an `img`, or for the drill a sprite);
      - `.board-bay-name` and `.board-bay-sub`;
      - `.board-flap` (its slices `.board-flap-l`, `.board-flap-m` × (n − 1) and `.board-flap-r`, then n `.board-flap-d`);
      - `.board-bay-price` (`.board-bay-price-lg` reading `Next`, `First` or `Locked`, and a `.board-bay-tag` with tag skin and the price, hidden when locked).
    - Each bay has `data-tier`, and `data-trouble` while troubled.
    - `render(undefined, "")` (the save is not in) shows the frames, icons and dark lamps only, with no words or numbers, and disables the bays.
    - `render(views, band)`:
      - sets each bay's tier, icon, lamp frame (`background-position-x` −40px × [off 0, amber 1, green 2, red 3]), name, sub-line and price;
      - sets the `aria-label`: `troubleAria` when troubled; `${lockAria} Opens Buys` when locked; otherwise `${tier.name}: ${formatCount(count)} owned. Next ${formatCount(price)} stones, +${formatSpeed(gain)} stones a second, needs ${staff} ${workerWords(staff)}. Opens Buys`;
      - flips the changed flap digits (`.is-flipping`), but only when the same tier was in that bay before. A first render, a tier swap and reduced motion never flip.
    - The name is `tier.name`, falling back to `tier.shortName` when it does not fit. The sub-lines go through `sharedPattern` with `fits`.
    - A click on a troubled bay calls `onPress(tier, bay)`. A hold calls `onFix` through `watchFixHold`, and the click after it does nothing. Any other click calls `onOpen()`.
    - `tick(dt)` steps the drill icon one frame (−64px each) every 0.18s while drills are owned and the drill is not troubled, and holds still under reduced motion.
- [ ] **Step 1: Write the failing tests** in `src/board-bays.test.ts` (happy-dom, fake timers, `matchMedia` stubbed; `fits` injected as `(el) => (el.textContent ?? "").length <= 16`):
  - `bandWords` at 500K reads `The Topsoil`, at 25M `The Granite · Suits borers`, at 60M `The Crystal Caves · Suits drills`, and at 130M `The Deep Heart · Suits the Great Machine`.
  - `bayLines` of an open cart at count 12 with +12 and 1 staff starts with the milestone line, then `+12/s · 1 hand`, then `+12/s`. A borer with 8 staff reads `+357/s · 8 hands`. Locked reads `["Borer · 10M"]`. A cave-in reads `["Cave-in! · Hold to fix"]`.
  - `sharedPattern`, with `fits` meaning at most 16 characters:
    - `[["aaaaaaaaaaaaaaaaaaaa", "+12/s · 1 hand", "+12/s"], ["Borer · 10M"], ["+2.4K/s · 8 hands", "+2.4K/s · 8 hands", "+2.4K/s"]]` → `["+12/s", "Borer · 10M", "+2.4K/s"]`. Index 0 fails on the first bay and index 1 on the third;
    - with the third bay's line at `+357/s · 8 hands` → `["+12/s · 1 hand", "Borer · 10M", "+357/s · 8 hands"]`.
  - The structure:
    - three `button.board-bay` in `.board-bays`, with `data-tier` cart, drill, borer;
    - `.board-band` holds the band words;
    - a locked borer shows `mach-borer-tarp`, `Locked`, no visible tag, and a dark lamp;
    - an owned borer shows `mach-borer`, `Next` and the price;
    - a borer with count 0 that is unlocked shows `First`;
    - a machine bay shows `mach-machine`.
  - The lamps for amber, green, off and red: `-40px`, `-80px`, `0px` and `-120px`.
  - The flaps:
    - count 6 shows two digit spans `""` and `6`, with one `.board-flap-m`;
    - count 120 shows three digits and two `.board-flap-m`;
    - a re-render from 6 to 7 puts `.is-flipping` on the second digit only;
    - the first render, a swap from cart to drill in the first bay, and reduced motion add none.
  - Taps:
    - a click on an open bay calls `onOpen` once;
    - a troubled bay's click calls `onPress("cart", bay)` and not `onOpen`;
    - a pointerdown and 600ms call `onFix("cart", bay)`, and the following click calls nothing;
    - once a render shows the same bay without trouble (an engineer fixed it), its click calls `onOpen`;
    - `render(undefined, "")` disables every bay and writes no digits.
  - Ticks:
    - with drills, `tick(0.18)` moves the drill icon to `-64px`;
    - with a drill trouble, or under reduced motion, it stays at `0px`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** it and copy the five PNGs. The positions come from the mockup (lines 133–154 and `placeBayIcons` at h 62), in CSS px written as art:
  - `.board-bays` at left 2 art and `top: var(--bays-top)`, 208×103 art;
  - the band row at top −5 art, 12 art tall, full width, centring the tag (`min-width` 118 art, `padding` 0 7 art, so the Deep Heart's longer words widen it);
  - the bay area at (2, 6) art, 204×93;
  - bay `i` at top `i × 31 + 2` art, 204×27, so 8px apart, with `overflow: visible`.
  - Inside a bay, relative to its 31-art row (the button sits 2 art down, so subtract 2 from each top):
    - the lamp at (3, 6) art, 20×20;
    - the icon at left 25 art, 32×32, with tops cart 0, drill 2 and borer 0 art. The machine icon's visible pixels are centred in the row, on whole art px;
    - the name and sub at (60, 6) art, 61 wide: the name 16px bold uppercase in `--board-ink`, the sub 13px in `--board-ink-2`;
    - the flap with its right edge at 154 art, top 4, 24 tall. It is 32 art wide with two digits and 42 with three, and the slices are `flip-counter.png` columns 0–5, 6–15 (repeated) and 16–31. Digits are 24px Share Tech Mono in `--board-ink-flap`, in windows at art x 6 + 10·k, 9 wide. The flip is a `scaleY` keyframe in `steps(3)` over 180ms;
    - the price column at (157, 4) art, 42×24: the legend at top 0 and the tag at top 10, 42×10, with the price 14px in `--board-ink-plate`.
  - With three flaps the name's box shrinks to end 2 art before the flap.
- [ ] **Step 4:** Run the tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The machine bays: the band tag, three bays with lamps, flap counters and prices, and hold-to-fix (#372)` and push.

### Task 6: The bays replace the layer line

**Files:**

- Modify: `src/mountain-screen.ts`, `src/board.css`, `src/style.css`, `src/tokens.css`, `src/mountain-screen.test.ts`, `src/mountain-screen-depths.test.ts`, `src/mountain-screen-crew.test.ts`, `src/engineers-teach.test.ts`, `src/workshop-panel.test.ts`, `src/style.test.ts`

**Interfaces:**

- Consumes: Tasks 1, 2, 3 and 5; `createBoardNote`'s `key` option.
- Produces:
  - the screen's DOM: `.board-bays` is a child of `#app` after the gauge row; the column starts at `--rail-top`; `.thumb-bar` holds the Buys, Workshop, Engineers and Upgrades thumbs and `.menu-button`, in that order; `header.top-bar` and `.layer-line` are gone.
  - an `openBuys()` function in the screen, which both the Buys thumb and the bays use.
  - `const pick = …` computed once in `render()` and once in the 1s tick, as `readyNow(view.mountain, now(), view.trouble)`.
- [ ] **Step 1: Write the failing tests** in `src/mountain-screen.test.ts`, in the board describe:
  - `"the band tag replaces the layer line"`: there is no `.layer-line` or `.top-bar`. A save at 25M mined reads `.board-band` as `The Granite · Suits borers`. This replaces `mountain-screen-depths.test.ts` line 836.
  - `"the bays show cart, drill and borer, then the Great Machine's"`: the early save's `data-tier`s are cart, drill, borer. A 125M save with the Hammer reads drill, borer, machine.
  - `"a tap on a bay opens Buys"`: `.buys-dialog` shows and the pocket is unchanged.
  - `"a troubled bay fixes as today"`, on a save with 6 carts and a borer, after `progress.previewTrouble("cart")`:
    - the cart bay has `data-trouble="cave-in"` and reads `Cave-in! · Hold to fix`;
    - four clicks leave the trouble, and the fifth clears it;
    - Buys stays shut throughout;
    - `.board-note.on` reads `Fixed! The crew cheers.`.

    Then again with a pointerdown and `vi.advanceTimersByTime(600)`: it fixes, and the click that follows opens nothing.

  - `"trouble on a tier with no bay is fixed in Buys"`: a 125M save with the Hammer, a machine and carts, with a cart trouble. No bay has `data-trouble`, and the Buys card `.tier[data-tier="cart"]` has `tier-trouble`. Five card clicks fix it, as `mountain-screen-crew.test.ts` already does.
  - `"the ☰ menu sits at the end of the thumb bar"`: `.thumb-bar > .menu-button` is the last child, and a click opens `.game-menu`. This retargets lines 1257 and 1773 (`.top-bar .menu-button`).
  - `"the New note shows once, in a board note above its thumb"`:
    - on the engineers-teach save, `.board-note.on .teach-note` reads the note, and a click on it opens the Engineers sheet;
    - a pointerdown on the window hides it, and the next 1s tick does not bring it back;
    - `engineers-teach.test.ts` line 124 and `workshop-panel.test.ts` line 391 find the note in `.board-note`.
  - `"until the save is in"`: on a loading store, the bays are disabled with no flap digits.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Wire it.**
  - Create the bays (`onOpen: openBuys`).
  - `onPress` and `onFix` call `progress.pressTrouble` and `progress.fixTrouble`, then show `TROUBLE_FIXED` with `boardNote.show(bay, thanks, { ms: 1600 })` when the snapshot's trouble is gone. `thanks` is a `p.board-thanks` kept in `runningPark`.
  - `render()` and the tick call `bays.render(view.ready ? bayViews(view.mountain, now(), view.trouble, pick) : undefined, view.ready ? bandWords(view.mountain) : "")`, and `runBoardLoop` also calls `bays.tick(dt)`.
  - Remove the layer line, `header`, and its words in `render()`. Move `menuButton` to the end of `thumbBar`.
  - The teach note waits in `runningPark`. When `noteFor(view.mountain)` changes to a note, call `boardNote.show(thumb, teachNote.note, { key: teachNote.note })`, anchored on the Workshop thumb or the Engineers button. When it changes to none and the board note holds the teach note, hide it. Track the last id shown, so a render never shows it again.
  - Like the Running list and the vein note, the teach note and `.board-thanks` go back to `runningPark` whenever another note has detached them.
  - The root order is `boardTop`, the gauge row, `bays.root`, `thumbBar`, then the rest as today.
- [ ] **Step 4: CSS.**
  - `tokens.css`: the row tokens, with `--column-top: var(--rail-top)`.
  - `board.css`:
    - `#app > .thumb-bar { margin-top: auto }`;
    - the thumb bar's grid becomes `repeat(5, minmax(0, 1fr))`;
    - `.thumb-bar .menu-button` fills its cell like the thumbs;
    - `.board-note .teach-note` drops today's card border and background for the note's ink, keeping 48px;
    - remove `#app > .top-bar`.
  - `style.css`: remove the `.top-bar`, `.top-bar .layer-line`, `.layer-line` and `.layer-name` rules and the `#app > .teach-note` margin.
  - `style.test.ts`: add `.board-bays`, `.board-bay`, `.board-band` and `.board-flap` to `BOARD_SELECTORS`.
- [ ] **Step 5:** Run `npm run gate -- fast`. Expected: PASS. Then run these and check them:
  - `npm run play -- --save early` and `npm run play -- --save heart`: the bays under the gauge row with the band tag, cart, drill and locked borer on early, drill, borer and machine on heart, the thumb bar with ☰ at the foot, and no scroll;
  - `npm run play -- --save mid --search ?trouble=cave-in tap:.board-bay[data-tier=cart]*5`: the red lamp, then fixed.
- [ ] **Step 6: Commit** `The machine bays and the band tag replace the layer line; the ☰ menu joins the thumb bar and the New note goes in the board note (#372)` and push.

### Task 7: Ready now and the red button go live

**Files:**

- Modify: `src/mountain-screen.ts`, `src/board-window.ts`, `src/board-window.test.ts`, `src/mountain-screen.test.ts`, `src/style.test.ts`

**Interfaces:**

- Consumes: Tasks 1, 3, 4 and 6; B3's `dig()` and `createMineWindow`.
- Produces:
  - `MineWindow` gains `dug(mined: number): void`. It plays the dig puff and `+N` at the upper face (`puffSpot(undefined)`), as a keyboard click does.
  - `.board-ready-row` is a child of `#app` at `top: var(--ready-top)`, after `.board-bays`.
- [ ] **Step 1: Write the failing tests**:
  - In `board-window.test.ts`: `dug(20)` shows `+20` in `.board-dig-plus` at `left: 150px; top: 56px`, and does not call `onDig`.
  - In `mountain-screen.test.ts`, with fake timers and a fixed `now`:
    - `"Ready now buys exactly one on a double tap"`: on the early save, `.board-ready-main` reads `Buy a cart · ${formatCompact(price)}`. Two clicks give carts 7 and a pocket lower by exactly that price. The plate reads `Done · +${formatSpeed(gain)}/s` and `Cart 7 is rolling`, and the odometer shows its spend. A click at 1,800ms buys nothing. After 1,900ms a click buys the 8th.
    - `"a held Enter buys one"`: three `click` events dispatched as `detail: 0` within the hold give one cart.
    - `"Saving for shows the time and opens Buys"`: with 18 helpers, 6 carts and pocket 100, the plate reads `Saving for a cart · in ${etaShort(etaMs)}`. A click opens `.buys-dialog`, and the pocket and the carts are unchanged.
    - `"Saving for a worker when no hand is free"`: 6 helpers, 6 carts and a pocket under the worker's price → `Saving for a worker · in …`.
    - `"a new mountain saves with no time"`: fresh → `Saving for a worker` and `20 · +1/s`.
    - `"Ready now never buys by itself"`: on the early save, 10 seconds of the 1s tick with a ready pick leave the carts at 6.
    - `"a tap after a spend elsewhere"`: buy carts on the Buys cards until the pocket is under the next cart's price, close Buys, then tap the plate. No cart is bought, and Buys opens again, because the plate now reads Saving for.
    - `"the bay lamp follows the pick"`: the early save's cart bay lamp is amber.
    - `"mined out"`: the plate is disabled and reads `The mountain is mined out`, and `.board-dig-button` is disabled with that label.
    - `"while the save loads"`: the plate and the red button are disabled.
    - `"the red button digs exactly tap power"`: three clicks add `3 × effectiveRates(m, now).tapYield` to the pocket; `.board-dig-lg` reads `By hand · +${3 × yield}`; `.board-dig-plus` shows `+${yield}`; after 1,500ms it reads `Dig · +${yield}`.
    - `"a window tap counts by hand and presses the button"`: a click on `.board-window` makes `.board-dig-lg` read `By hand · +${yield}`, and the button's sprite runs its echo.
    - The abort test also checks that the plate's and the red button's timers stop.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Wire it.**
  - The plate's `onTap` re-reads `readyNow(progress.getSnapshot().mountain, now(), progress.getSnapshot().trouble)` when the view is ready and playing:
    - `ready` takes `before = owned(…)` and runs `progress.applyMutation((m) => buyWithTeach(m, tier))`. It returns `bought` with the new count and the pick's gain when the count rose, else `nothing`;
    - `saving` calls `openBuys()` and returns `opened`;
    - anything else returns `nothing`.
  - `render()` and the tick call `plate.render(view.ready ? pick : undefined, view.playing && view.ready)`.
  - The red button's `onPress` runs `const mined = dig(); if (mined > 0) { mine.dug(mined); digButton.dug(mined); }`.
  - The window's `onDig` becomes `() => { const mined = dig(); if (mined > 0) { digButton.dug(mined); digButton.echo(); } return mined; }`.
  - `render()` calls `digButton.set(yield, !mine.dig.disabled, label)`, with `yield` as `effectiveRates(view.mountain, now()).tapYield`. The label is "The mountain is mined out" once nothing is left, and `Dig: tap to mine ${tapWords(yield)}` while playing.
  - Add `.board-ready-row`, `.board-ready` and `.board-dig-button` to `BOARD_SELECTORS`.
- [ ] **Step 4:** Run `npm run gate -- fast`. Expected: PASS. Then run these and look at every shot:
  - `npm run play -- --save early tap:.board-ready*2 wait:2000 tap:.board-dig-button*3`: Done after the double tap, the cart flap from 06 to 07, then `By hand` and `+N` in the window;
  - `npm run play -- --save fresh tap:.board-ready`: `Saving for a worker`, and Buys opens.
- [ ] **Step 5: Commit** `Ready now buys exactly one, Saving for opens Buys, and the red button digs like the window (#372)` and push.

### Task 8: The gate checks the bays and Ready now; saves and docs

**Files:**

- Modify:
  - scripts: `scripts/visual-check.mjs`, `scripts/ui-audit.mjs`, `scripts/play.mjs`, `scripts/fixtures.mjs`;
  - docs: `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/ART.md`, `docs/ui-audit.md`, `docs/design-intent.md`;
  - the shots `npm run audit:ui` rewrites in `docs/ui-audit/`.

**Interfaces:**

- Consumes the selectors from Tasks 4–7:
  - `.board-bays`, `.board-band`, `.board-bay[data-tier]`, `[data-trouble]` and `.board-flap-d`;
  - `.board-ready`, `.board-ready-kick`, `.board-ready-main` and `.board-ready-why`;
  - `.board-dig-button` and `.board-dig-lg`;
  - `.thumb-bar .menu-button`.
- Produces two fixtures, each with a play save of the same name:
  - `savingMountain()`: Granite, 25M mined, pocket 100, 18 helpers, 6 carts, 1 borer and its engineer. A hand is free and nothing is affordable.
  - `fleetMountain()`: Granite, 30M mined, pocket 50M, 170 helpers, 120 carts, 30 drills, 2 borers. Three flaps on the cart bay.
- [ ] **Step 1: Retarget.** Only the trouble wait moves to the bay; the card checks stay.
  - In `visual-check.mjs`: `fitOf`'s exclusion list gains `.board-bays, .board-ready-row`.
  - Section 24's `GUARD_SCREENS` gains `["bays", …, [".board-bay"]]` (it opens Buys) and `["ready", …, [".board-ready"]]`.
  - Every `.menu-button` press still works where it now sits.
  - In `ui-audit.mjs`: the `mountain-hazard` shot shows the cart bay's red lamp and `Hold to fix`, and its `[data-trouble="cave-in"]` wait now finds the bay before opening Buys for the `buys-hazard` card shot.
- [ ] **Step 2: The board section.**
  - `BOARD_TARGETS` gains `.board-bay`, `.board-ready` and `.board-dig-button`.
  - `BOARD_PARTS` and `BOARD_ART` gain `.board-bays` and `.board-ready-row`.
  - `BOARD_LEGENDS` gains `.board-band .board-lg`, `.board-bay-name`, `.board-bay-sub`, `.board-bay-price-lg`, `.board-ready-kick`, `.board-ready-main`, `.board-ready-why` and `.board-dig-lg`. The contrast floor rises from 9 to the new legend count shown at rest.
- [ ] **Step 3: Add a `bays and ready` section** to `visual-check.mjs`, at 424×924 and the three PC sizes:
  - **Band and tiers:** on `early` (Topsoil: cart, drill, locked borer), `mid` (Granite), `crystal` and `heart` (drill, borer, machine), the tag reads `bandWords`' text and the `data-tier`s match C2.
  - **Fit:** every bay's name, sub-line, flaps and price lie inside its button and do not overlap, and the tag lies inside `.board-bays`. Check this on `fleet` too (three flaps).
  - **Double tap:** on `early`, two taps on `.board-ready` 120ms apart raise the cart flap by exactly 1 and show `Done`. After 2.1s the plate reads `Ready now` or `Saving for`.
  - **Saving for:** on `saving`, the plate reads `Saving for a cart · in`, and a tap opens Buys with the odometer unchanged.
  - **Trouble:** on `mid` with `?trouble=cave-in`, the cart bay's lamp is red. Five taps clear `data-trouble` with Buys shut. On a fresh page, a 700ms hold clears it too.
  - **Red button:** a tap on `.board-dig-button` raises the odometer by the tap yield and shows `By hand` and `+N` in the window.
  - **Reduced motion:** with it emulated, two shots of `.board-bays` 600ms apart are pixel-equal.
  - **Room:** on every save the page does not scroll, and the thumb bar ends 8px above the save line.
- [ ] **Step 4: Saves.** Add the two fixtures and their play saves with notes: `saving` ("a free hand and nothing affordable: Saving for a cart") and `fleet` ("120 carts: three flaps on the cart bay").
- [ ] **Step 5:** Run `npm run visual` and `npm run audit:ui`. Expected: both PASS.
- [ ] **Step 6: Docs.**
  - `DESIGN.md`, UI direction:
    - the bays under the gauge row with their band tag (the layer line's words), the C2 tiers, lamps, flaps and prices;
    - a bay tap opens Buys, and a troubled bay fixes with 5 taps or a hold;
    - the Ready now rule as built, with its Saving for time, the 1.9s Done hold, and its never buying by itself;
    - the red button and its By hand count;
    - the thumb bar with ☰ in the rail slot until B5;
    - the New note in the board note;
    - and the band line in "Rock hardness" becomes the band tag.
  - `ARCHITECTURE.md`:
    - `ready-now` and `machine-bays` in the rules layer;
    - `board-bays`, `board-ready` and `trouble-tap` in the board paragraph;
    - `--bays-top`, `--ready-top` and `--rail-top` in the panel contract;
    - `readyNow` computed once per render and re-read on the tap;
    - `buyWithTeach` as the one buy path from the plate and the cards.
  - `ART.md`: a row for each copied file and `mach-machine.png`, with its size and use.
  - `ui-audit.md`:
    - the "Mountain at rest" row, the hazard row (the bay first), the IA table's 0-tap row (bays, Ready now, the red button) and point 6 (Ready now is the one gold control);
    - the design note's "☰ menu 60px below the window" line becomes the rail-slot placement.
  - `design-intent.md`, under the Numbers rule: "One written exception (decision D1, #372): the Ready now plate's Saving for time, "in 4m", is the time until the pocket reaches the price at the current speed, rounded up to the minute. It shows only on that plate, and never at zero speed."
- [ ] **Step 7: Commit** `The gate checks the bays, Ready now and the red button in every band (#372)` and push.

### Task 9: Prove it

**Files:** none new (fixes only).

- [ ] **Step 1:** Run `npm run gate -- full`. Expected: every step PASS, with no coverage floor lowered. Fix any FAIL first (read `.gate/logs/<step>.log`).
- [ ] **Step 2:** Run `npm run play -- --save early tap:.board-ready*2 wait:2000`. On the phone and the desktop, one cart is bought: the flap reads 06 and then 07, the plate shows `Done · +N/s · Cart 7 is rolling`, and the odometer's spend is one price. `log.txt` has no page error and a save line.
- [ ] **Step 3:** Run `npm run play -- --save mid --search ?trouble=cave-in tap:.board-bay[data-tier=cart]*5`. The red lamp and `Cave-in! · Hold to fix` show, then after five taps it is fixed with the board note, and Buys never opens.
- [ ] **Step 4:** Run `npm run play -- --save mid tap:.board-dig-button*3`. The odometer rises by three taps, `By hand · +N` shows, and `+N` puffs in the window. Run `npm run play -- --save saving tap:.board-ready`: `Saving for a cart · in Nm`, and Buys opens.
- [ ] **Step 5:** Run `npm run play` on `fresh`, `early`, `mid`, `crystal`, `heart`, `fleet` and `late`, phone and desktop. Look at every shot:
  - the band tag in each band;
  - C2's tiers;
  - three flaps on `fleet`;
  - the borer's tarp until the first borer;
  - the machine bay on `heart`;
  - nothing scrolls at 424×924;
  - the same board scaled on the PC.
- [ ] **Step 6: Commit** any fixes as `B4 fixes from play (#372)` and push.

## Notes

- **Spec calls this plan makes** (for the PR body's Rulings):
  - the bays are three buttons, 54px tall and 8px apart, not the mockup's one button, so the troubled bay is its own target and the gaps hold;
  - a troubled bay's lamp is red;
  - the fix shows today's "Fixed! The crew cheers." in the board note, without today's burst;
  - trouble on a tier with no bay is fixed on its Buys card, and the Buys key's red lamp comes with B5's key;
  - the bay names are today's tier names, falling back to the short name;
  - the band tag drops the layer line's full stop and widens for the Deep Heart;
  - counts from 100 get a third flap, composed from the counter's own slices, and the display clamps at 999;
  - trouble leaves the Ready pick as written, and the gain reads the slowed speed;
  - an equal price goes to the lower tier;
  - the time rounds up to whole minutes (at least `1m`), reads `1h 0m` at the hour and `>99h` from 100 hours, and does not copy the mockup's seconds or its capped minutes;
  - a Ready buy is the Buys card's buy, so hiring a worker teaches staffing as a card does;
  - mined out, the plate reads "The mountain is mined out" with its guard dark;
  - until the save is in, the bays and the plate show frames and art only;
  - the By hand count covers window taps too, and the red button echoes a window tap except under reduced motion;
  - until B5 the ☰ menu is the thumb bar's fifth cell, and the New note shows once per launch in the board note above its thumb, put away by any outside tap, with the dot staying.
- **Later slivers:** the key rail and its red lamps, the Buys drawer and its Ready now footnote, and the teach dot lamps are B5's. The ☰ button goes in B7.
