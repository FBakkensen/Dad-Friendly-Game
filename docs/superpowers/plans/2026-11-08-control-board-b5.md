# Control Board B5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The key rail and the first two drawers go live (#373). Five steel keys replace the thumb bar: Buys, Workshop, Engineers, Upgrades and Ledger. They show dim locked caps with an unlock line, a lit cap where today's afford glow was, a red dot lamp where today's teach dot was, and the bench and trip timers. Buys and Upgrades open as riveted drawers that slide up in 6 hard steps. Each drawer has a title, a kick, an "i" card, rows that hold for 1.9s after a buy and blink red on a tap he cannot afford, a Back plate and a spare plate. Workshop and Engineers open today's sheets until B6. The Ledger key opens today's ☰ menu until B7.

**Architecture:**

- **Pure rules with unit tests**, in the rules layer:
  - `src/row-view.ts` (types only): one `RowView` for every drawer row.
  - `src/buys-rows.ts`: each Buys row's state, words, lamp and icon key, lifted out of `crew-panel.ts`'s render.
  - `src/upgrade-rows.ts`: the boost, lasting-upgrade and found-tool rows, lifted out of `upgrades-panel.ts`, plus `anyUpgradeAffordable`.
  - `src/key-rail.ts`: each key's cap, sub-line, dot and label.

  None of them imports art. Their tests run before any new art lands.

- **DOM parts**, in the `board-*` pattern:
  - `src/board-dom.ts`: the shared `el`, `write`, `setAttr` and `frameX` helpers, plus `fitFirst`, a measure-once line fitter.
  - `src/board-row.ts`: the row, with its Done hold and red blink.
  - `src/board-drawer.ts`: the drawer shell (head, "i", list, spare plate, Back), the scrim and the 400ms settle.
  - `src/board-how-art.ts`: the How it works art in the drawer skin.
  - `src/board-keys.ts`: the rail.
- **Rebuilt panels.**
  - `crew-panel.ts` keeps the Crew section's logic (sentence, chips, count-up, Grandpa), the hire and buy paths, the guided New row and hold-to-fix. Its cards become `board-row`s in a Buys `BoardSheet`.
  - `upgrades-panel.ts` keeps its logic (New row first, mark all seen on open, the boost chips) and builds an Upgrades `BoardSheet`.
  - `buys-head.ts` is deleted. Its "i" cards move into `crew-panel.ts`.
- **Wiring in `mountain-screen.ts`.**
  - The two drawers and the scrim sit in `.board-sheet-clip` at z 29: under the board note (30) and the save drawer (31).
  - The rail sits at `--rail-top`.
  - `engineers-panel.ts` and `menu-panel.ts` take a `door` (the Engineers and Ledger keys) instead of building their own buttons.
  - The settle that B4 kept for Buys becomes every drawer's own.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom per file), puppeteer-core scripts (`visual-check.mjs`, `ui-audit.mjs`, `play.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-07-control-board-design.md`. This plan uses:

- the B5 row;
- "The board, top to bottom" item 6 (the key rail);
- "Sheets (drawers)" up to and including Upgrades;
- "Where everything else goes": the effect row (the key sub-lines), the thumb bar, the teach dot and the ☰ menu rows;
- C1, C3 (the Buys key's red lamp), C5, C8 and C13;
- "Room for #357 and #358";
- "Art" and "Checks".

The reference mockup is `mockups/control-board/index.html`:

- the rail: CSS 178–188 and markup 397–404;
- the drawer: CSS 201–249 and markup 419–425;
- `rowHTML`, `openSheet` and the spare: 1398–1464;
- the scrim and Escape: 1466–1482;
- `paintRows`, `HOLD` and `tryBuy`: 1483–1546;
- the key handlers: 1340–1353;
- `paintEng` and the Upgrades key's lit cap: 1192–1231;
- `LAY["924"].keys`: 768.

Out of scope: the Workshop and Engineers drawers (B6); the Ledger drawer, the menu's rows and the overlay cards (B7); and the Buy ×10 / Max toggle (#358).

## Art needed

PixelLab spend needs Flemming's OK (the pixellab skill asks first). The controller makes these before it dispatches the task named in "For". Each lands at its path.

| Asset (under `src/assets/board/`) | Size                    | Init image                                                                 | Prompt                                                                                                                                                                                                                                   | Why                                                                                                                                                                      | For    |
| --------------------------------- | ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `res-pick.png`                    | 16×16 art (32×32 shown) | Yes: `mockups/control-board/assets/art/ind-board/icon-workshop.png`        | "A single miner's pick, head up and to the right, in the same dark outline, steel greys and one warm highlight as the init key icon, transparent background, no glow"                                                                    | The "pick" steps of the Upgrades and Boosts How it works cards. Today's `pick.png` is 32×32 art in the old style and cannot show at an exact 2× in the drawer skin       | Task 6 |
| `res-mountain.png`                | 16×16 art (32×32 shown) | Yes: `mockups/control-board/assets/art/ind-board/res-stone.png`            | "A small rock mountain peak with a timbered mine mouth at its foot, same outline and muted palette as the init stone icon, transparent background, no glow"                                                                              | The first step of the Layers How it works card ("The mountain has 4 layers"). Today's `mountain.png` is 114×114 old art                                                  | Task 6 |
| `mach-kid.png`                    | 32×32 art (64×64 shown) | Yes: `mockups/control-board/assets/art/ind-board/mach-worker.png`          | "A kid miner in the same style and pose as the init worker: smaller build, oversized helmet with a lamp, a short pick over the shoulder, dark work clothes, muted Factorio palette, three-quarter view, transparent background, no glow" | The Kid worker row in Buys' Crew section. The spec's "Still needed" list names "kid icons for … rows"                                                                    | Task 7 |
| `mach-kid-dim.png`                | 32×32 art               | Yes: `mach-kid.png`                                                        | "The same kid miner as a dark locked silhouette in the board's dim steel greys, outline kept, no face or lamp light, like the init drawn dim the way the locked key icons are, transparent background"                                   | The Kid worker row is shown and locked until the Crown. Today's card darkens it with `filter: brightness(0)`, and the board allows no CSS filters                        | Task 7 |
| `mach-machine-dim.png`            | 32×32 art               | Yes: `src/assets/board/mach-machine.png`                                   | "The same Great Machine as the init, covered by a grey canvas tarp roped down at the base like the borer's tarp icon, only the top of its stack showing, muted palette, transparent background, no glow"                                 | The Great Machine row is shown and locked from the first borer until 120M and the Hammer. The borer's locked row already shows it under its tarp (`mach-borer-tarp.png`) | Task 7 |
| `key-dot.png`                     | 10×10 art (20×20 shown) | Yes: `src/assets/board/lamp.png`, frame 3 (the red lamp, x 60–79), cropped | "The same red indicator lamp as the init, as a tiny jewel lamp with a dark steel bezel, lit red, for the corner of a key cap, transparent background" (pixelart_workbench, which is free, may suit a piece this small)                   | The red dot lamp on a key cap: the teach dot, and C3's Buys-key trouble lamp. `lamp.png` shows 18 art px (36px) and would cover the 32px key icon                        | Task 8 |

What the spec's "Still needed" list leaves to other slivers:

- The Running now icon is B2's dial note, which shipped with words only.
- The Account icon is the Ledger's (B7).
- The crystal and heartstone material icons are for the Workshop plates (B6) and the Ledger (B7).
- No Buys or Upgrades row shows a material.
- Upgrades rows go without icons, as in the mockup.
- The Great Machine icon (`mach-machine.png`) exists from B4.

## Global Constraints

- **UI only.** No change to rules, numbers, prices, saves or the lab.
  - Every buy goes through today's mutations, moved and not changed: `buyWithTeach`, the guided hire, `buyBoost` and `buyUpgrade` wrapped in `markAllSeen`, `pressTrouble` and `fixTrouble`.
  - A short-of-workers row still buys, as today's card does.
  - Exporting or moving an existing helper is fine: `canPromote` and `nextEngineerName` move to `engineers.ts`, and `REACHED_LINE` is exported from `milestones.ts`.
- **Art.** Every graphic is PixelLab art at exactly 2× (one art px is two CSS px), `image-rendering: pixelated`, with no CSS filters and no placeholder boxes.
  - **Copied (not moved)** from `mockups/control-board/assets/art/ind-board/` into `src/assets/board/`, flat, with their names kept:
    - `icon-buys.png`, `icon-workshop.png`, `icon-workshop-dim.png`, `icon-engineers.png`, `icon-engineers-dim.png`, `icon-upgrades.png`, `icon-ledger.png` (16×16 each);
    - `mach-worker.png` and `mach-drill.png` (32×32);
    - `makers-plate-l.png` (96×48) and `makers-strip.png` (96×20);
    - `res-stone.png` (16×16).
  - **Already in `src/assets/board/` and reused:**
    - `key.png`: 4 cells of 32×32 (rest, down, off, lit). It is the cap sprite and the `key`/`keyp` skins;
    - `lamp.png` (off, amber, green, red);
    - the `frame`, `tag` and `inset` skins;
    - `mach-cart.png`, `mach-borer.png`, `mach-borer-tarp.png` and `mach-machine.png`.
  - **New:** the six pieces in "Art needed".
- **CSS tokens.** New CSS has no raw px or colours (`npm run tokens`). Board CSS writes sizes as `calc(var(--art) * N)` or names a token, and lives in `src/board.css`. `tokens.css` gains:
  - `--sheet-top: 178px`. This is the drawer's top, the mockup's stock top plus 92. B2's `--board-top` (176) stays for today's Workshop, Engineers and menu sheets;
  - `--row-h: 76px`;
  - `--board-ink-quiet: #c9cec1`, the locked key's label;
  - `--board-type-15: 15px` and `--board-type-17: 17px`;
  - the leads `--board-row-name-lead: 19px`, `--board-row-line-lead: 15px`, `--board-row-gain-lead: 17px`, `--board-sheet-title-lead: 26px` and `--board-kick-lead: 16px`.
- **Fonts.** The bundled Barlow Condensed and Share Tech Mono. Gains, prices, timers and counts are in Share Tech Mono with tabular figures (`.board-num`).
- **Motion.** Hard steps only.
  - A drawer slides up in `steps(6)` over 240ms and away in `steps(5)` over 200ms (B2's `.board-drawer`).
  - A key cap changes whole frames.
  - A row's red blink is four 140ms frames (red, off, red, off).
  - The Done hold is `READY_HOLD_MS` (1,900ms).
  - Under `prefers-reduced-motion: reduce` (`reducedMotion()`) a drawer appears and goes at once and a row does not blink. The press frames and the Done hold stay. Nothing bounces.
- **Targets** are at least 48×48 CSS px with 8px gaps at 424×924:
  - a key is 64×76 (90 with a sub-line), 16px apart;
  - a row is 408−28 = 380 by 76, 10px apart;
  - Back is 54 tall;
  - the "i" is 48×48.

  **Text** is at least 13px. Contrast is at least 4.5:1, from screenshot pixels.

- **Phone layout.** It never scrolls at 424×924.
  - The rail stands at 768..858 (keys 76, 90 with a sub-line), 10px above the save line (868).
  - A drawer covers 178..864, from 8 to 416. The odometer and the save line stay in view.
  - A drawer's list scrolls inside itself only when it is longer than the drawer (C1): late-game Buys.
  - An "i" card never scrolls (`docs/design-intent.md`, the reveal pattern's point 4: "one screen … no scroll"). While it is open, the drawer shows only the how cards, with their own titles and one Back plate.
- **Data.**
  - Until the save is in (`view.ready`), and during a re-load, nothing from it shows. The rail draws caps and icons with no dot, lit cap, sub-line or lock. The rows show names and icons only, dark and disabled.
  - Every render writes only what changed.
  - Line fits are kept only once measured on a laid-out box (`measurable`) and are dropped when fonts settle (`onFontsSettled`).
  - Rows, keys and drawers are built once and reused.
- **Close is pause.** Saving is untouched. `.save-status` keeps `data-kind` and `data-log`.
- **Copy.** Today's words stay:
  - the tier names, `milestoneLine`, `lockBodyLine`, `lockRateLine`, `lockAria`, `troubleShout`, `troubleAria`, `TROUBLE_FIXED`, `staffBillWords` ("Needs 8 workers"), `staffingLine`, `STAFFING_INTRO`, `UPGRADES_INTRO`, `UPGRADES_MORE`, `BROUGHT_HOME`, `FOUND_LABEL`, `boostOutcome`, `upgradeEffectLine`, `upgradeWhyLine`, `lostToolWords`, `formatClock`, the How it works words, "Quick boosts", "Lasting upgrades", "Back to Buys", "Back to Upgrades", "Owned", "Locked", "Ready now", "Saving for", "Done" and "Cave-in! · Hold to fix";
  - the aria labels of today's cards: the buy, guided, trouble and locked sentences in `crew-panel.ts`, and "Upgrades, one is affordable".

  New strings, listed in the PR for Flemming:

  - the kicks: `Crew and machines that mine while you rest` and `Boosts for tonight, gear for good`;
  - the section legends: `Crew`, `Machines`, `per sec`;
  - the Buys footnote: `Ready now offers the biggest machine your free workers can run and you can afford. It saves for the next one when nothing is affordable, offers a worker only when no hand is free, and never buys for you.`;
  - the verbs: `Hire`, `Buy`, `1 worker` / `N workers`, `Running`;
  - the flags: `New`, and `Ada tends · +N/s`;
  - the info line: `N owned`, with `· ` and today's quiet tier line where a tier has no milestone line;
  - the key names: `Buys`, `Workshop`, `Engineers`, `Upgrades`, `Ledger`;
  - the unlock lines: `With the clay` and `With 1st borer`;
  - the aria labels:
    - `Workshop, locked. Opens as the clay comes in`;
    - `Engineers, locked until the first tunnel borer`;
    - `Workshop, a craft can start`;
    - `Engineers, a promotion is affordable`;
    - `…, back in 12:03` and `…, bench 4:12 left`;
    - `Buys. ` + `troubleAria`;
    - the Upgrades rows' `Name. Effect. Buy for N stones` and `… Running, 4:12 left`.

  There is no "?" in player text.

- **Commits** are a plain sentence ending `(#373)`, with these trailers. Push after each task (`git push -u origin claude/beautiful-thompson-t7oje5`). Never force-push.

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011RgeWsS7EcGfk9opPt3V2W
  ```

## Review Focus

1. **A sleepy double tap that opens a drawer.**
   - **What it opens from:** a key, a bay, or Saving for.
   - **Where the second tap lands:** on whatever row, how card or Back plate is now under the finger, 100–300ms later. It buys nothing and closes nothing.
   - **Exceptions:**
     - a troubled row still counts the press toward its fix (B4's rule);
     - a keyboard Enter is never early.
   - **Within a row's 1.9s Done hold:** two taps buy one, a tap at 1.8s buys nothing, and a tap at 1.95s buys again.
   - Pinned in Tasks 4, 5, 7 and 8.
2. **A drag on a long list.** Late-game Buys scrolls inside the drawer (C1).
   - A finger that scrolls the list over a row never buys, and a hold-to-fix that turns into a scroll does not fix.
   - The page itself never scrolls. The spare plate is off.
   - The staffing New row is scrolled into view on open.
   - Pinned in Tasks 5, 7 and 9.
3. **A save that loads again under an open drawer** (a sign-in, another account, a cloud copy).
   - The open drawer stays open.
   - Its rows go dark, disabled and without numbers, then fill in again.
   - The keys drop their dots, lit caps, locks and timers until the save is in.
   - A pocket that fell under a row's price between paint and tap buys nothing: the tap re-reads the store.
   - Pinned in Tasks 6, 7 and 8.
4. **Ways out of a drawer, and what stands over it.**
   - The scrim closes it. A scrim tap over a relic socket closes it and shows that relic's note.
   - Escape closes it.
   - The save line still opens the save drawer above it.
   - A teach note never shows over an open drawer. It shows after the drawer closes, anchored on its key.
   - Opening one drawer closes the other.
   - Pinned in Tasks 5 and 8.
5. **Words that outgrow a row or a key** at 13px:
   - the longest milestone line;
   - `lockBodyLine` for the Great Machine;
   - `Ready now · Ada tends · +1.2K/s`;
   - a `>999T` price;
   - `Running` with `59:59`;
   - `Needs 25 workers`;
   - a key's `With 1st borer` beside its neighbour.

   Each falls back through its fit options and ends with an ellipsis, inside its row, and nothing overlaps. Fonts that load late refit. Pinned in Tasks 4, 8 and 9.

---

### Task 1: The Buys rows' rules

**Files:**

- Create: `src/row-view.ts`, `src/buys-rows.ts`, `src/buys-rows.test.ts`
- Modify: `src/milestones.ts` (export `REACHED_LINE`), `vite.config.ts` (100% floor for `src/buys-rows.ts`)

**Interfaces:**

- Consumes:
  - `ReadyPick` (`ready-now.ts`);
  - `TIERS`, `tierById`, `owned`, `tierCost`, `tierShown`, `TierId` (`tiers.ts`);
  - `tierLock` (`crew.ts`);
  - `staffForBuy`, `staffNeeded` (`engineers.ts`);
  - `crewCounts` (`crew-count.ts`);
  - `effectiveRates`, `tendingGain` (`rates.ts`);
  - `milestoneLine`, `REACHED_LINE`;
  - `lockBodyLine`, `lockRateLine`, `lockAria`;
  - the screen words listed in Global Constraints;
  - `formatCompact`, `formatCount`, `formatSpeed`;
  - `stretch`;
  - `Trouble`.
- Produces:
  - In `row-view.ts` (types only):
    - `type RowLamp = "off" | "amber" | "green" | "red"`;
    - `type RowState = "ready" | "short" | "dear" | "locked" | "trouble" | "running" | "owned" | "found"`;
    - `interface RowView { readonly name: string; readonly badge: string; readonly info: readonly string[]; readonly need: string; readonly why: string; readonly flag: readonly string[]; readonly gain: string; readonly price: string; readonly dimTag: boolean; readonly verb: string; readonly lamp: RowLamp; readonly state: RowState; readonly pick: boolean; readonly can: boolean; readonly aria: string }`.

      `info` and `flag` are fit options, longest first; `[]` shows nothing. An empty string hides `badge`, `need`, `why`, `gain`, `price` or `verb`. `can` means a tap acts now. Otherwise the row blinks.
  - In `buys-rows.ts`:
    - `type BuyIcon = "worker" | "kid" | "kid-dim" | "cart" | "drill" | "borer" | "tarp" | "machine" | "machine-dim"`;
    - `interface BuyRowView extends RowView { readonly tier: TierId; readonly shown: boolean; readonly icon: BuyIcon; readonly guided: boolean }`;
    - `BUY_SECTIONS = { crew: ["helper", "kid"], machines: ["cart", "drill", "borer", "machine"] } as const`;
    - `buyRowView({ mountain, now, trouble, tier, pick, guided }: { mountain: Mountain; now: number; trouble: Trouble | undefined; tier: TierId; pick: ReadyPick; guided: TierId | undefined }): BuyRowView`.

    It reads exactly what `crew-panel.ts`'s render reads today:
    - `count`;
    - `price = tierCost(tier, count, stretch)`;
    - `lock`;
    - the tier's trouble;
    - `staff = staffForBuy`;
    - `spare` from `crewCounts`;
    - `needsMore = !locked && staff > 0 && spare < staff`;
    - `dear = !locked && !troubled && pocket < price`.

    Then:

    | State   | When                                                                                                     | info                                      | need                           | price (dimTag)               | verb                                          | lamp                                                  | can             |
    | ------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------ | ---------------------------- | --------------------------------------------- | ----------------------------------------------------- | --------------- |
    | trouble | the trouble is on this tier                                                                              | `[`${troubleShout(kind)} · Hold to fix`]` | —                              | —                            | —                                             | red                                                   | yes             |
    | guided  | `guided === tier` and no trouble (state `ready`, or `dear` while the pocket is under the worker's price) | `[staffingLine(staffNeeded, idle)]`       | —                              | worker price (dim when dear) | `Hire`                                        | green, or off when dear                               | when affordable |
    | locked  | `lock`                                                                                                   | `[lockBodyLine, lockRateLine]`            | —                              | `Locked` (dim)               | —                                             | off                                                   | no              |
    | dear    | `dear`                                                                                                   | milestone options                         | —                              | price (dim)                  | `N workers` when staff > 0, else `Hire`/`Buy` | off                                                   | no              |
    | short   | `needsMore`                                                                                              | milestone options                         | `staffBillWords(staff, spare)` | price                        | `N workers`                                   | off                                                   | yes             |
    | ready   | otherwise                                                                                                | milestone options                         | —                              | price                        | `Hire` (helper, kid) or `Buy`                 | amber if the pick is `ready` on this tier, else green | yes             |

    Further rules:
    - **Milestone options:** `[line, line without "${REACHED_LINE} "]` when `milestoneLine(tier, count, formatCompact)` is defined. Otherwise `[`${formatCompact(count)} owned · ${TIER_WHY[tier]}`, `${formatCompact(count)} owned`]`. `TIER_WHY` moves here from `crew-panel.ts`.
    - **gain:** `+${formatSpeed(tierSpeed[tier])}/s`, or `""` when locked or troubled.
    - **flag:** joins the pick word and the tending word:
      - the pick word is `Ready now` or `Saving for` when `pick.tier === tier`;
      - the tending word is `${who.name} tends · +${formatSpeed(gain)}/s`, from `tendingEngineer` and `tendingGain`, for a machine;
      - it gives `[both joined with " · ", the first alone]`, or `["New"]` when guided.
    - **pick:** `pick.kind === "ready" && pick.tier === tier`.
    - **icon:**
      - helper → `worker`;
      - kid → `kid`, or `kid-dim` when locked;
      - cart and drill → their own;
      - borer → `tarp` while its count is 0, else `borer`;
      - machine → `machine-dim` when locked, else `machine`.
    - **aria:** today's four sentences, word for word: guided, trouble, locked (with `tends`) and buy (with synergy, idle and `NEEDS_MORE_WORKERS`).
    - **shown:** `tierShown`.
- [ ] **Step 1: Write the failing tests** in `src/buys-rows.test.ts`. Build every mountain with `createMountain()` plus fields, fix `now`, and take every price from `tierCost` (never literals):
  - `"the four card states"`, on the early save's shape (18 helpers, 6 carts, pocket 6,854):
    - the cart is `ready` with `lamp` amber, `pick` true, flag `["Ready now"]`, verb `Buy` and `can` true;
    - the drill is `dear` with `dimTag` true, verb `1 worker`, lamp off, `can` false and no need;
    - the borer is `locked` with price `Locked`, info `[lockBodyLine(…), lockRateLine(…)]`, no gain and icon `tarp`.
  - `"short of workers says the bill, never the free count"`: the pocket over a borer's price with 3 free gives `short`, need `Needs 8 workers`, verb `8 workers`, `can` true and lamp off. No string contains `free`.
  - `"green is ready but not the pick"`: the pocket covers a cart and a drill with 12 free. The drill is amber and the cart green.
  - `"Saving for flags the row, dark"`: with pick `saving` cart, the cart's flag is `["Saving for"]`, `pick` false and the lamp is not amber.
  - `"the milestone line, then without its lead"`: carts at a count past the first mark give `[`${REACHED_LINE} 12 of 25 · …`, `12 of 25 · …`]`. A tier with no marks gives `["3 owned · Hauls what the crew already cut.", "3 owned"]`-shaped options.
  - `"trouble"`: a cart cave-in gives state `trouble`, info `["Cave-in! · Hold to fix"]`, lamp red, `can` true and the `troubleAria` sentence. This holds even when the pocket is 0.
  - `"the guided New row hires"`: with staffing teaching and carts idle, `guided` `cart` gives:
    - flag `["New"]`;
    - price `formatCompact(workerPrice)`;
    - verb `Hire`;
    - info `[staffingLine(1, idle)]`;
    - the guided aria.

    With the pocket under the worker's price it is `dear` and `can` is false.

  - `"the tending mark"`: an engineer on the borers, with the borer as the pick, gives flag `[`Ready now · Ada tends · +${…}/s`, "Ready now"]`.
  - `"icons"`:
    - kid locked → `kid-dim`;
    - machine locked (borer owned, 30M) → `machine-dim`;
    - machine owned → `machine`;
    - borer 0 and unlocked → `tarp`.
  - `"the aria sentences are today's"`: the buy sentence for a ready cart equals the one `crew-panel.ts` builds today. Copy it from `mountain-screen-crew.test.ts`'s existing aria assertion.
  - `"display only"`: a frozen mountain comes back deep-equal.
- [ ] **Step 2:** Run `npx vitest run src/buys-rows.test.ts`. Expected: FAIL (the module is missing).
- [ ] **Step 3: Implement** `row-view.ts` and `buys-rows.ts`, export `REACHED_LINE`, and add the floor.
- [ ] **Step 4:** Run the test and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The Buys rows' rules: each tier's state, words, lamp and icon, from today's card (#373)` and push.

### Task 2: The Upgrades rows' rules

**Files:**

- Create: `src/upgrade-rows.ts`, `src/upgrade-rows.test.ts`
- Modify: `vite.config.ts` (100% floor for `src/upgrade-rows.ts`)

**Interfaces:**

- Consumes:
  - Task 1's `RowView`;
  - `BOOSTS`, `boostCost`, `boostLeft` (`boosts.ts`);
  - `UPGRADES`, `upgradeCost`, `upgradeLevel` (`upgrades.ts`);
  - `boostShown`, `upgradeShown`, `boostRowId`, `upgradeRowId` (`upgrade-reveal.ts`);
  - `hasLostTool`, `LostToolId`;
  - `effectiveRates`, `stretch`, `oneOffStretch`;
  - `boostOutcome`, `upgradeEffectLine`, `upgradeWhyLine`, `lostToolWords`, `FOUND_LABEL`, `formatClock`, `formatCompact`, `formatCount`.
- Produces:
  - `boostRowView(mountain: Mountain, now: number, boost: Boost, isNew: boolean): RowView & { readonly shown: boolean }`.
    - info `[boostOutcome(…)]`, with today's Overtime rule: the crew you would actually have, the strongest timer.
    - Running (`left > 0`): state `running`, price `formatClock(left)`, verb `Running`, lamp off, `can` false.
    - Otherwise: price `formatCompact(cost)`, verb `Buy`, state `ready` or `dear` (`dimTag`), lamp green or off, and `can` true only when affordable.
    - flag `["New"]` when `isNew`.
    - aria `${name}. ${info}. Buy for ${formatCount(cost)} stones`, or `… Running, ${clock} left`.
  - `upgradeRowView(mountain: Mountain, now: number, upgrade: Upgrade, isNew: boolean): RowView & { readonly shown: boolean }`.
    - badge `Lv ${level}/${max}` when `maxLevel > 1`, else `""`.
    - info `[upgradeEffectLine(…)]` (#324's before and after).
    - why `upgradeWhyLine(…)`.
    - cost undefined: state `owned`, price `Owned` (dim), verb `""`, lamp off.
    - Otherwise as a boost.
    - gain `""`: the effect line is the gain.
  - `toolRowView(mountain: Mountain, id: LostToolId): RowView & { readonly shown: boolean }`. It reads name and line from `lostToolWords`, price `FOUND_LABEL`, state `found`, lamp green, `can` false, and `shown = hasLostTool`.
  - `newRowId(mountain: Mountain, now: number): RevealRowId | undefined`: today's rule, moved from `upgrades-panel.ts`. It is the first row with a dot that he can afford, else the first with a dot.
  - `anyUpgradeAffordable(mountain: Mountain, now: number): boolean`: any shown, idle boost, or any shown upgrade with a cost the pocket covers.
- [ ] **Step 1: Write the failing tests** in `src/upgrade-rows.test.ts`:
  - `"a boost ready, dear and running"`:
    - Sharper picks with the pocket over its cost → `ready`, green, `Buy`, price `formatCompact(cost)`;
    - under its cost → `dear`, dim;
    - running at 4:12 → `running`, price `4:12`, verb `Running`, `can` false.
  - `"Overtime names the crew it would really have"`: with axle grease at ×2 the info equals `boostOutcome` on the strongest timer, as `upgrades-panel.ts` computes it today.
  - `"a lasting upgrade"`:
    - Strong arms at level 2 → badge `Lv 2/10`, info `upgradeEffectLine`, why `upgradeWhyLine`;
    - Better boots bought → `owned`, price `Owned`, verb `""`.
  - `"found tools"`: a found pick → `found`, `Found`, green, shown. Not found → not shown.
  - `"the New row"`: `newRowId` picks an affordable dotted row over an earlier unaffordable one, and the first dotted row when none is affordable. The view's flag is `["New"]`.
  - `"anything affordable"`: true with the pocket over Sharper picks, false at 0, and false while the only affordable boost is running.
  - `"display only"`: a frozen mountain comes back deep-equal.
- [ ] **Step 2:** Run `npx vitest run src/upgrade-rows.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** and add the floor.
- [ ] **Step 4:** Run the test and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The Upgrades rows' rules: boosts, lasting upgrades and found tools, and the New row (#373)` and push.

### Task 3: The key rail's rules

**Files:**

- Create: `src/key-rail.ts`, `src/key-rail.test.ts`
- Modify:
  - `src/engineers.ts`: `canPromote(mountain: Mountain): boolean` and `nextEngineerName` move here from `engineers-panel.ts`. The panel imports them, and its `view.ready` check stays in the panel;
  - `vite.config.ts`: 100% floor for `src/key-rail.ts`.

**Interfaces:**

- Consumes:
  - `showsDot`;
  - `workshopUnlocked`;
  - `canCraftNow` (`afford-glow.ts`);
  - `canPromote`;
  - `bayTiers` (`machine-bays.ts`);
  - Task 2's `anyUpgradeAffordable`, `boostRowId` and `upgradeRowId`;
  - `troubleAria`, `tierById`, `formatClock`.
- Produces:
  - `type KeyId = "buys" | "workshop" | "engineers" | "upgrades" | "ledger"`, and `KEY_IDS` in that order;
  - `type KeyCap = "rest" | "locked" | "lit"`;
  - `interface KeyView { readonly cap: KeyCap; readonly sub: string; readonly dot: boolean; readonly aria: string }`;
  - `keyViews(mountain: Mountain, now: number, trouble: Trouble | undefined): Readonly<Record<KeyId, KeyView>>`:
    - **buys:**
      - cap `rest`;
      - sub `""`;
      - dot when `showsDot(…, "staffing")`, or when the trouble's tier is not in `bayTiers` (C3);
      - aria `Buys`, or `Buys. ${troubleAria(kind, tier)}` for that trouble.
    - **workshop:**
      - `locked` with sub `With the clay` and aria `Workshop, locked. Opens as the clay comes in` until `workshopUnlocked`;
      - then `lit` when `canCraftNow`, else `rest`;
      - sub is `formatClock(bench.endsAt − now)` while the bench runs, else `""`;
      - dot `showsDot(…, "workshop")`;
      - aria `Workshop`, plus `, bench ${sub} left` and `, a craft can start`.
    - **engineers:**
      - `locked` with sub `With 1st borer` and aria `Engineers, locked until the first tunnel borer` while `engineers` is empty;
      - then `lit` when `canPromote`;
      - sub is the soonest `formatClock(returnsAt − now)` among trips still out;
      - dot when `showsDot` of `engineers`, `tending` or `promotion`;
      - aria `Engineers`, plus `, back in ${sub}` and `, a promotion is affordable`.
    - **upgrades:**
      - `lit` when `anyUpgradeAffordable`;
      - dot when any boost or upgrade row id `showsDot`;
      - aria `Upgrades, one is affordable` or `Upgrades`.
    - **ledger:**
      - `rest`, `""`, no dot;
      - aria `Ledger`.
- [ ] **Step 1: Write the failing tests** in `src/key-rail.test.ts`:
  - `"a fresh mountain"`: Workshop and Engineers are `locked` with their unlock lines, Buys and Ledger `rest`, and no dots.
  - `"lit caps take today's afford glow, except Buys"`:
    - the pocket over Sharper picks → Upgrades `lit`;
    - a craft that can start → Workshop `lit`;
    - a promotion affordable → Engineers `lit`;
    - Buys is never `lit`, even with every tier affordable.
  - `"red dot lamps"`:
    - staffing teaching → Buys dot;
    - the Workshop note unseen → Workshop dot;
    - tending or promotion → Engineers dot;
    - an unbought upgrade row → Upgrades dot.
  - `"trouble on a tier with no bay lights Buys"`:
    - in the Great Machine era, a cart cave-in → Buys dot and aria `Buys. ${troubleAria(…)}`;
    - a drill flood (a bay tier) → no Buys dot.
  - `"timers"`:
    - a bench ending in 4:12 → Workshop sub `4:12`;
    - two trips back in 12:03 and 30:00 → Engineers sub `12:03`;
    - a bench that ended → `""`.
  - `"display only"`.
- [ ] **Step 2:** Run `npx vitest run src/key-rail.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, moving `canPromote` and `nextEngineerName`. Add the floor.
- [ ] **Step 4:** Run the test, `npx vitest run src/engineers.test.ts src/promotion-teach.test.ts` and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The key rail's rules: locks, lit caps, red dot lamps and timers (#373)` and push.

### Task 4: The drawer row

**Files:**

- Create: `src/board-dom.ts`, `src/board-dom.test.ts`, `src/board-row.ts`, `src/board-row.test.ts`
- Modify:
  - `src/board-bays.ts`: its private `el`, `write`, `setAttr` and `frameX` move to `board-dom.ts`, and it imports them;
  - `src/board.css`, `src/tokens.css`.

**Interfaces:**

- Consumes:
  - Task 1's `RowView`;
  - `skin`;
  - `measurable`, `onFontsSettled`;
  - `reducedMotion`;
  - `READY_HOLD_MS`.
- Produces:
  - `board-dom.ts`:
    - `el(tag, className, text?)`, `write(target, text)`, `setAttr(target, name, value | undefined)` and `frameX(target, n, framePx)`, as in `board-bays.ts`;
    - `fitFirst(target: HTMLElement, options: readonly string[], fits?: (el: HTMLElement) => boolean): void`. It writes the first option that fits (default `scrollWidth <= clientWidth + 1`), else the last. It keeps the key `options.join("\n")` on the element once `measurable`, and skips the work when the key repeats.
    - `refitAll(root: HTMLElement): void` drops every kept key under `root`.
  - `board-row.ts`:
    - `ROW_HOLD_MS = READY_HOLD_MS` and `BLINK_STEP_MS = 140`.
    - `interface BoardRow { readonly root: HTMLElement; setIcon(url: string | undefined): void; render(view: RowView | undefined): void; done(): void; holding(): boolean; blink(): void }`.
    - `createBoardRow({ tag, className, data, name, icon }: { tag: "button" | "div"; className: string; data: Readonly<Record<string, string>>; name: string; icon: boolean }): BoardRow`. The root is `${tag}.board-row.${className}`, with the `data-*` set and a frame skin. It holds:
      - `i.board-lamp`;
      - `img.board-row-icon` (64×64), when `icon`;
      - `.board-row-mid`: `.board-row-name` (with `.board-row-badge`), `.board-row-info`, `.board-row-need`, `.board-row-why` and `.board-row-flag.board-lg`;
      - `.board-row-rt`: `.board-row-gain.board-num`, `.board-row-tag` (tag skin) holding `.board-row-price.board-num`, and `.board-row-verb`.
    - `render(view)` writes only what changed. It:
      - fits `info` and `flag` with `fitFirst` and hides empty parts;
      - sets the lamp with `frameX(lamp, [off 0, amber 1, green 2, red 3], 40)`;
      - toggles the classes `is-${state}`, `is-pick`, `is-can` and `is-dim-tag`;
      - sets the `aria-label`;
      - disables a button row only for `render(undefined)`. That means the save is not in: name and icon only, lamp off, every other part empty.
    - `done()` holds the row for `ROW_HOLD_MS`:
      - flag and verb read `Done`;
      - the lamp is green;
      - the class is `is-held`;
      - the aria is `${name}. Done`.

      Renders during the hold update only info and gain, as in the mockup. Then the last view paints.

    - `holding()` is true while held.
    - `blink()` runs red, off, red, off at `BLINK_STEP_MS` and then repaints the last view. Under reduced motion it does nothing. A blink already running is not restarted.
- [ ] **Step 1: Write the failing tests** (happy-dom, fake timers, `matchMedia` stubbed per test):
  - `board-dom.test.ts`:
    - `fitFirst` picks the first option that fits under an injected `fits`;
    - a repeat with the same options on a measurable box measures nothing (spy on `fits`);
    - an unmeasured box is fitted again next time;
    - `refitAll` drops the keys.
  - `board-row.test.ts`:
    - **structure:** a button row has every part above, `data-tier="cart"` and a frame skin canvas. A `div` row is not focusable.
    - **render:** a ready view shows the name, the first fitting info option, gain, price and verb, with lamp at `-80px` (green) and `is-ready is-can`. An amber pick shows `-40px` and `is-pick`. Trouble shows `-120px`. Empty `need`, `why`, `badge` and `price` are hidden.
    - **writes only what changed:** a second identical render leaves every text node identical (`===`), checked with a `MutationObserver` that records none.
    - **until the save is in:** `render(undefined)` disables the button, keeps the name, and empties gain, price, verb and info.
    - **Done:** `done()` shows `Done` in the flag and the verb, the lamp at `-80px`, `holding()` true and `is-held`. A render at 1,000ms with a new gain updates the gain and keeps Done. At 1,900ms the last view paints and `holding()` is false.
    - **blink:** `blink()` puts the lamp at `-120px`, `0px`, `-120px` and `0px` at 0, 140, 280 and 420ms, then the view's frame. A second `blink()` mid-run does not restart it. Under reduced motion the lamp never leaves its frame.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** The CSS comes from the mockup (lines 210–231), in tokens:
  - `.board-row` is `height: var(--row-h)`, a grid of `calc(var(--art) * 20) calc(var(--art) * 32) 1fr auto` with a 3-art column gap and padding `0 6 art 0 5 art`. `.board-row.no-icon` drops the icon column;
  - the name is 17px bold in `--board-ink` on `--board-row-name-lead`;
  - info and why are 13px in `--board-ink-2` (info ellipsis), and need is 13px in `--board-rust`, all on `--board-row-line-lead`;
  - the flag is `.board-lg` in `--board-amber`, and `--board-green` while held;
  - the right column is a flex column, end-aligned, with a 1-art gap;
  - the gain is 15px Share Tech Mono in `--board-ink`;
  - the tag is 20px tall with `min-width` 34 art and padding 0 6.5 art, with the price 14px in `--board-ink-plate`. `.is-dim-tag` uses the tag at its quieter ink;
  - the verb is 13px bold uppercase, letter-spacing 0.05em, in `--board-ink-2`. It is `--board-green` under `.is-can`, `--board-amber` under `.is-pick`, and `--board-green` held;
  - the icon is 64×64, pixelated.

  The right column stays a flex column, so #358's 48px toggle can join under the tag and the row can grow to 80px without changing this structure.

- [ ] **Step 4:** Run the tests, `npx vitest run src/board-bays.test.ts` and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The drawer row: lamp, icon, name, info, needs, gain, price tag and verb, with the Done hold and the red blink (#373)` and push.

### Task 5: The drawer shell, the spare plate and the scrim

**Files:**

- Create: `src/board-drawer.ts`, `src/board-drawer.test.ts`, `src/card-tap.test.ts`, and copies in `src/assets/board/` of `makers-plate-l.png` and `makers-strip.png`
- Modify: `src/card-tap.ts` (the scroller list gains `.board-sheet-list`), `src/board.css`, `src/tokens.css`

**Interfaces:**

- Consumes: `skin`, `plateButton` (`board-save.ts`), `el`, `write` and `refitAll` (Task 4), and `reducedMotion`.
- Produces:
  - `DRAWER_SETTLE_MS = 400`.
  - `type SpareTier = "tall" | "mid" | "short" | "off"`, and `spareTier(heightPx: number): SpareTier`: tall from 144px, mid from 84, short from 48, else off.
  - `interface BoardSheet { readonly root: HTMLElement; readonly list: HTMLElement; readonly how: HTMLElement; readonly info: HTMLButtonElement; readonly back: HTMLButtonElement; isOpen(): boolean; settling(): boolean; open(from?: HTMLElement): void; close(): void; kick(text: string): void; flash(text: string, ms: number): void; showHow(on: boolean): void; fitSpare(): void }`.
  - `createBoardSheet({ name, title, infoLabel, clock, onOpen, onClose }: { name: "buys" | "upgrades"; title: string; infoLabel: string; clock: () => number; onOpen?: () => void; onClose?: () => void }): BoardSheet`. The root is `section.board-drawer.board-sheet[data-sheet=name]`, with `role="dialog"`, `aria-labelledby` its title and a frame skin. It holds:
    - `header.board-sheet-head`:
      - `h2.board-sheet-title` with `tabindex="-1"`;
      - `p.board-sheet-kick` with `aria-live="polite"`;
      - `button.board-sheet-info.teach-info`: a 48×48 plate button reading `i`, labelled `How it works: ${infoLabel}`;
    - `div.board-sheet-how`, hidden until `showHow(true)`;
    - `div.board-sheet-list`: the scroller. It ends in `div.board-spare` (`aria-hidden`, inset skin, `img.board-spare-plate` from makers-plate-l and `img.board-spare-strip` from makers-strip);
    - `footer` with `button.board-sheet-back`: a plate button reading `Back to the board`.

    Behaviour:
    - **`open(from)`** does nothing while open. Otherwise it:
      - records `openedAt = clock()`;
      - adds `is-open`;
      - scrolls the list to the top;
      - focuses the title;
      - calls `onOpen`;
      - calls `refitAll(root)`;
      - calls `fitSpare()` now and on the next animation frame.

      It remembers `from`.

    - **`close()`** removes `is-open`, calls `showHow(false)` and `onClose`, and focuses `from` if it is still connected.
    - **`settling()`** is `isOpen() && clock() − openedAt < DRAWER_SETTLE_MS`.
    - **Back:** a pointer press that starts while settling does nothing. Its click is ignored. A keyboard click always closes.
    - **Escape** (a document `keydown`) closes an open sheet.
    - **`kick(text)`** sets the resting kick. **`flash(text, ms)`** shows `text` with `is-done` for `ms`, then the resting kick.
    - **`showHow(on)`** shows the how host and hides the head, the list and the footer. The how cards carry their own titles and one Back plate (`Back to Buys` or `Back to Upgrades`), so the pair fits the drawer's 660px inside with no scroll. `showHow(false)` restores them and focuses the "i".
    - **`fitSpare()`** reads the spare's `offsetHeight` and puts `is-tall`, `is-mid`, `is-short` or `is-off` on it, writing only on change:
      - tall shows the inset and the maker's plate (192×96);
      - mid shows the inset and the strip (192×40);
      - short shows the strip alone;
      - off shows nothing.

  - `createSheetScrim({ sheets, sockets }: { sheets: readonly BoardSheet[]; sockets: () => readonly HTMLElement[] }): HTMLElement`.
    - It is a `div.board-scrim` over the board above the drawers (0..`--sheet-top`).
    - It carries `is-on` while any sheet has `is-open`. A `MutationObserver` on each sheet root's `class` keeps that in step, so the panels need not know the scrim.
    - A click closes every open sheet. When the click's point lies inside a socket's rect, it then calls that socket's `click()`, which shows its note.
- [ ] **Step 1: Write the failing tests** in `src/board-drawer.test.ts` (happy-dom, fake timers, an injected `clock`):
  - `spareTier`: 0 → off, 47 → off, 48 → short, 83 → short, 84 → mid, 143 → mid, 144 → tall.
  - The structure: the parts above in order, the `i` labelled `How it works: Buys`, Back reading `Back to the board`, and `role="dialog"`.
  - `open` and `close`:
    - `open(key)` adds `is-open` and focuses the title;
    - a second `open` keeps `openedAt`;
    - `close()` removes it and focuses `key`;
    - `onOpen` and `onClose` run once each.
  - The settle:
    - `settling()` is true at 399ms and false at 400;
    - a pointerdown on Back at 100ms followed by its click leaves it open;
    - the same at 500ms closes it;
    - a `click()` with no pointer (a keyboard press) at 100ms closes it.
  - Escape closes an open sheet and leaves a shut one shut.
  - `showHow(true)` hides the head, the list and the footer and shows the how host. `showHow(false)` restores them and focuses the "i". `close()` while the how host shows restores them too.
  - `flash("Fixed! The crew cheers.", 1600)` shows with `is-done`, and the resting kick returns at 1,600ms.
  - `fitSpare` with the spare's `offsetHeight` stubbed at 150, 90, 50 and 20 gives `is-tall`, `is-mid`, `is-short` and `is-off`, and a repeat writes nothing.
  - A drag never buys (in a new `src/card-tap.test.ts`): a row inside `.board-sheet-list`, with a pointerdown, the list's `scrollTop` moved by 10, and a pointerup, does not call `buy`.
  - The scrim:
    - `is-on` follows any open sheet (await a microtask for the observer);
    - a click at a point inside a stub socket's rect closes the sheet and clicks the socket once;
    - a click elsewhere only closes.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** and copy the two PNGs. The CSS comes from the mockup (201–249), on B2's `.board-drawer` base:
  - `.board-sheet-clip` has top 0, height `calc(var(--board-h) - var(--save-h))`, `overflow: hidden`, `pointer-events: none` and z-index 29;
  - `.board-sheet` has `top: var(--sheet-top)`, `bottom: calc(var(--art) * 2)`, padding 7/7/6 art and `pointer-events: auto`. Shut, it is `translateY(calc(100% + var(--art) * 2))`, as `.board-save-drawer` is;
  - the title is 24px bold uppercase, letter-spacing 0.08em, `--board-ink`, on `--board-sheet-title-lead`;
  - the kick is 13px `--board-ink-2` on `--board-kick-lead`, and `--board-green` under `.is-done`;
  - the list is a flex column with a 5-art gap, `overflow-y: auto` and the scrollbar hidden;
  - `.board-sec` is the section legend row (`.board-lg`, space-between, 1-art top padding, a −3-art bottom margin);
  - `.board-sheet-foot` is 13px `--board-ink-2`;
  - the spare is `flex: 1 1 0; min-height: 0`, centred, with `pointer-events: none`. `.is-short` hides its skin canvas;
  - the footer's Back is 54px tall, with a 5-art top padding;
  - the scrim is `display: none` and `display: block` under `.is-on`, with `pointer-events: auto`.

  Add `--sheet-top` and `--row-h`.

- [ ] **Step 4:** Run `npx vitest run src/board-drawer.test.ts src/card-tap.test.ts src/mountain-screen-crew.test.ts` and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: Commit** `The drawer shell: head with its "i", the list, the spare plate, Back with the settle, Escape and the scrim (#373)` and push.

### Task 6: The "i" cards in the drawer skin, and the Upgrades drawer

Needs `res-pick.png` and `res-mountain.png` (Art needed) before it starts.

**Files:**

- Create: `src/board-how-art.ts`, `src/board-how-art.test.ts`, and a copy in `src/assets/board/` of `res-stone.png`
- Modify:
  - `src/teach-ui.ts`: `createHowCard`'s step tuple gains an optional third member, the icon's CSS px (default 32);
  - `src/how-it-works.ts`: export `type HowArt`;
  - `src/upgrades-panel.ts`, `src/mountain-screen.ts`, `src/board.css`, `src/style.css`;
  - tests: `src/upgrade-reveal.test.ts`, `src/mountain-screen-crew.test.ts`, `src/mountain-screen-depths.test.ts`, `src/style.test.ts`.

**Interfaces:**

- Consumes: Tasks 2, 4 and 5; `HOW_IT_WORKS`, `howItWorks`, `setHowSteps`.
- Produces:
  - `BOARD_HOW_ART: Readonly<Partial<Record<HowArt, { readonly src: string; readonly px: 32 | 64 }>>>`:

    | `HowArt`      | Board art     | px  |
    | ------------- | ------------- | --- |
    | mine-cart     | mach-cart     | 64  |
    | great-machine | mach-machine  | 64  |
    | tunnel-borer  | mach-borer    | 64  |
    | steam-drill   | mach-drill    | 64  |
    | helper-miner  | mach-worker   | 64  |
    | stone         | res-stone     | 32  |
    | upgrades-icon | icon-upgrades | 32  |
    | pick          | res-pick      | 32  |
    | mountain      | res-mountain  | 32  |

  - `boardHowCard(system: "staffing" | "layers" | "upgrades" | "boosts", back: string, onBack: () => void): HTMLElement`. It is `createHowCard` with mapped art and `data-how=system`.
  - `createUpgradesPanel({ progress, getView, now, chipFor, clock })` returns `{ sheet: BoardSheet; render(): void; open(from?: HTMLElement): void }`. The button, `upgradesUrl`, the afford glow, the teach dot and `requestRender` on open go away: the rail owns them from Task 8. `open` runs `markAllSeen(current, shownRows(current))` through `applyMutation`, then `sheet.open(from)`.
  - The drawer's list holds, in today's order logic:
    - `.board-sec` `Quick boosts`, then two rows `.board-row.upgrade.boost[data-boost]`;
    - `.board-sec` `Lasting upgrades`, then `.board-row.upgrade[data-upgrade]` (`no-icon`);
    - `.board-sec` `Brought home`, then `div.board-row.found-tool[data-tool]`;
    - `p.board-sheet-foot` reading `UPGRADES_MORE` while `anyHiddenRow`.

    When the New row is an upgrade, Lasting goes before Quick boosts. The New row goes first in its section.

  - The kick is `UPGRADES_INTRO` while a New row exists, else `Boosts for tonight, gear for good`.
  - The "i" shows the `upgrades` and `boosts` cards (one `Back to Upgrades`, under the last).
  - The today-only pocket line `You have N stones.` goes: the odometer shows the pocket above the drawer.
- [ ] **Step 1: Write the failing tests.**
  - `board-how-art.test.ts`:
    - every step of `staffing`, `layers`, `upgrades` and `boosts` has a `BOARD_HOW_ART` entry;
    - `boardHowCard("staffing", …)` renders four images whose `width` attributes are 64, 64, 64 and 64;
    - `boosts` renders 32, 64 and 32.
  - `mountain-screen-crew.test.ts`, in an Upgrades describe that opens the drawer through `upgrades.open()` (until Task 8, `.upgrades-button` still calls it):
    - `"the drawer opens with its rows"`: `.board-sheet[data-sheet="upgrades"].is-open` holds Sharper picks and Overtime rows. A row's `.board-row-price` reads `formatCompact(cost)`.
    - `"a tap buys one and holds Done"`: on a save that affords Sharper picks, two clicks 100ms apart (past the settle) buy it once (`boosts.sharper` set once). The row reads `Done` and then `Running` after 1,900ms, with its tag at the clock.
    - `"a dear tap blinks and spends nothing"`: the pocket is unchanged and the lamp passes `-120px`.
    - `"the settle"`: a pointerdown and click on an affordable row 100ms after open buy nothing.
    - `"lasting rows"`: Strong arms at level 2 shows `Lv 2/10` and today's effect and why lines. Bought boots read `Owned`.
    - `"found tools"`: a found pick shows under `Brought home` with `Found`.
    - `"the New row leads"`: retarget `upgrade-reveal.test.ts`'s New-card tests to the flag `New` on the first row of its section, and its intro test to the kick.
    - `"opening marks every shown row seen"`: as today.
    - `"the i card"`: a click on `.board-sheet-info` hides the head, the list and Back, and shows two `.teach-how` cards with board art. `Back to Upgrades` restores them.
    - `"until the save is in"`: on a loading store, every row is disabled with no price.
  - Retarget every Upgrades selector in `upgrade-reveal.test.ts`, `mountain-screen-crew.test.ts`, `mountain-screen-depths.test.ts` and `style.test.ts` by the mapping in Notes. The asserted words stay the same.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Rebuild `upgrades-panel.ts` on `createBoardSheet({ name: "upgrades", title: "Upgrades", infoLabel: "Upgrades and boosts", clock })` and `createBoardRow`. Each row's buy uses `buyOnTap(row.root, row.root, (press) => …, { settling: sheet.settling })`. The handler:
    1. returns if `row.holding()`, `press.early` or the view is not ready;
    2. re-reads the row's view from `progress.getSnapshot()`, and blinks and returns unless `can`;
    3. runs today's mutation;
    4. calls `row.done()` when the boost's end time or the upgrade's level rose.
  - `render()` paints every row from Task 2's views (`undefined` while not ready), keeps `writeChip` for the boost chips as today, and calls `sheet.fitSpare()` when open.
  - In `mountain-screen.ts`:
    - add `.board-sheet-clip` (the Upgrades drawer and the scrim, with `sockets` as `relicPlate.root.querySelectorAll(".board-socket")`) before `drawerClip`;
    - the Upgrades thumb becomes a plain button in the thumb bar, with today's icon and label, whose click calls `closeBoardPopups(); upgrades.open(thumb)`;
    - until Task 8, `render()` keeps its glow and dot with `setAffordGlow(thumb, view.ready && keyViews(…).upgrades.cap === "lit")` and `setTeachDot(thumb, view.ready && keyViews(…).upgrades.dot)`;
    - `OPEN_SHEET` also matches `.board-sheet.is-open`, so `coverNote` and the teach note wait for an open drawer.
  - `board.css` styles the how card inside `.board-sheet` in board ink, with its `Back to Upgrades` as a plate button.
  - `style.css` removes the `.upgrades-dialog`, `.upgrades-card`, `.upgrade*`, `.upgrades-*` and `.boost-list` rules. Delete `OVERLAYS`' `.upgrades-dialog` entry in `style.test.ts`, and add `.board-sheet`, `.board-row` and `.board-scrim` to `BOARD_SELECTORS`.
- [ ] **Step 4:** Run `npx vitest run src/upgrade-reveal.test.ts src/mountain-screen-crew.test.ts src/board-how-art.test.ts` and `npm run gate -- fast`. Expected: PASS. Then run `npm run play -- --save early label:Upgrades` and look at the phone shot: the drawer from under the odometer to the save line, rows, the spare plate and Back.
- [ ] **Step 5: Commit** `Upgrades opens as a riveted drawer with its rows, the Done hold, the "i" card and a spare plate (#373)` and push.

### Task 7: The Buys drawer

Needs `mach-kid.png`, `mach-kid-dim.png` and `mach-machine-dim.png` (Art needed) before it starts.

**Files:**

- Create: copies in `src/assets/board/` of `mach-worker.png` and `mach-drill.png`
- Delete: `src/buys-head.ts`
- Modify:
  - `src/crew-panel.ts`, `src/mountain-screen.ts`, `src/board.css`, `src/style.css`;
  - tests: `src/mountain-screen-crew.test.ts`, `src/mountain-screen.test.ts`, `src/mountain-screen-depths.test.ts`, `src/staffing-teach.test.ts`, `src/style.test.ts`, `src/hazards.test.ts` (if it reads cards).

**Interfaces:**

- Consumes:
  - Tasks 1, 4, 5 and 6 (`boardHowCard`);
  - `watchFixHold`, `buyOnTap`, `buyWithTeach`;
  - B4's `readyNow`.
- Produces:
  - `createCrewPanel({ progress, getView, now, pick, clock }): { sheet: BoardSheet; render(): void; open(from?: HTMLElement): void }`:
    - `pick` is `() => ReadyPick`. `tierArt`, `stoneUrl` and `settling` go: the sheet owns the settle;
    - `open(from)` calls `sheet.open(from)` and `layoutChips()`. Then it scrolls `.board-row.teach-new` into view with `{ block: "nearest" }`, guarded as today.
  - The Buys list:
    1. `.board-sec` (`Crew` and `per sec`);
    2. `section.crew` (`aria-label` `Your crew`), holding `p.crew-status` (today's sentence and count-up) and `p.crew-posts` (`aria-label` the full sentence). The posts were a button with no action; they are now text. Their chips are `span.crew-bit` text on the tag skin, without faces, in today's fewest-even-rows layout;
    3. `button.board-row.tier[data-tier]` for helper and kid;
    4. `.board-sec` `Machines`;
    5. the cart, drill, borer and machine rows;
    6. `p.board-sheet-foot` with the Ready now footnote.

    Hidden tiers (`!shown`) are `hidden`. Each row's icon is `BUY_ICON[view.icon]`:
    - worker → mach-worker;
    - kid → mach-kid, kid-dim → mach-kid-dim;
    - cart → mach-cart;
    - drill → mach-drill;
    - borer → mach-borer, tarp → mach-borer-tarp;
    - machine → mach-machine, machine-dim → mach-machine-dim.

    A troubled row has `data-trouble`. The guided row has `teach-new`.

  - The kick is `STAFFING_INTRO` while staffing teaches, else `Crew and machines that mine while you rest`. The "i" shows `staffing` and `layers` (one `Back to Buys`).
  - A fix flashes `TROUBLE_FIXED` in the kick for 1,600ms. Today's burst and the buy floats go: the Done hold, the odometer's spend and the needle's kick say it.
- [ ] **Step 1: Write the failing tests** (`mountain-screen-crew.test.ts` and `mountain-screen.test.ts`, fake timers, `tapClock` injected):
  - `"Buys opens as a drawer"`: a bay tap opens `.board-sheet[data-sheet="buys"].is-open`. The Crew section, the worker row and the machine rows are present, in order, with the footnote.
  - `"the four row states at once"`, on the early save:
    - the cart row has `is-ready is-pick`, lamp `-40px` and `Ready now`;
    - the drill row has `is-dear`;
    - the borer row has `is-locked` with `Locked`;
    - on the short fixture (Task 9's `shortMountain`), the borer row has `is-short` with `Needs 8 workers`.
  - `"a double tap on a bay buys nothing"`: B4's existing settle tests move to the drawer. A bay click, then within 400ms a pointerdown and click on the cart row: carts unchanged. Then 500ms later a click buys one, and Done shows.
  - `"Done holds the row"`: two clicks buy one cart. A click at 1,800ms buys nothing. At 1,950ms a click buys again.
  - `"a dear tap blinks"`: the pocket is unchanged and the lamp passes `-120px`.
  - `"a short row still buys"`: as today; the machine stands idle.
  - `"trouble on a row"`, in the Great Machine era with a cart cave-in:
    - the cart row has `data-trouble` and reads `Cave-in! · Hold to fix`;
    - an early press still counts;
    - five clicks fix it and the kick flashes `Fixed! The crew cheers.`;
    - a 600ms hold fixes it and its click does nothing.
  - `"the staffing New row"`: today's staffing tests in `staffing-teach.test.ts` read the row. It has `teach-new`, flag `New`, verb `Hire`, a tap hires a worker and teaches staffing, and it scrolls into view on open.
  - `"the Crew section"`: today's crew tests keep their words through the retarget. Grandpa's chip shows on the `heir` shape. Chips lay out on open. The posts element is not a button.
  - `"kids"`: a save with the Crown and a machine shows the Kid worker row with `mach-kid`. Without the Crown it shows `mach-kid-dim` and `Locked`.
  - `"the i card"`: two `.teach-how` cards (Staffing and Layers) with 64px board art and no scroll in the how host. `Back to Buys` restores the list.
  - `"a pocket that fell"`: paint a ready cart, set the pocket to 0 through the store, then click: nothing is bought and the lamp blinks.
  - `"while the save loads again"`: with Buys open, a re-load disables every row and empties prices. The drawer stays open.
  - Retarget every Buys selector in the files above by the mapping in Notes. Delete only the tests whose subject is gone, and list them in the commit body:
    - the count badge;
    - the compact three-to-a-row grid;
    - the buy float text;
    - the burst.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`crew-panel.ts`:** build the sheet and rows. Keep `guidedTier`, `hire`, `countCrewRate`, `renderCrew`'s sentence, the posts and Grandpa, and `layoutChips`. Each row's tap goes through `buyOnTap(row.root, row.root, …, { settling: sheet.settling })` and `watchFixHold`, in today's order:
    1. `hold.heldFix()` → return;
    2. not ready → return;
    3. `press.early` and not troubled → return;
    4. holding → return;
    5. re-read the view from the store; not `can` → `blink()`, return;
    6. guided → `hire`;
    7. troubled → `pressTrouble` and thank;
    8. else `buyWithTeach`, and `row.done()` when the count rose.

    `render()` paints `buyRowView` per tier with `pick()`, or `undefined` while not ready, and calls `sheet.fitSpare()` when open.

  - **`mountain-screen.ts`:**
    - `openBuys(from?)` = `closeBoardPopups(); upgrades.sheet.close(); crewPanel.open(from)`;
    - `export const BUYS_SETTLE_MS = DRAWER_SETTLE_MS`;
    - remove `buysDialog`, `buysCard`, `buysClose`, `buysHead` and `buysOpenedAt`;
    - the Buys thumb calls `openBuys(thumb)` until Task 8;
    - the Buys drawer joins `.board-sheet-clip` and the scrim's sheets;
    - `render()` and the tick pass the same `pick` they compute for the plate. The tick re-renders the crew panel only while Buys is open, as the row timers need.
  - **`style.css`:** remove the `.buys-*`, `.tier*`, `.tier-grid*`, `.crew-*` (moved to `board.css` as needed), `.engineer-mark`, `.engineer-gain`, `.trouble-thanks` and `.trouble-burst` rules.
  - **`style.test.ts`:** drop `.buys-dialog` from `OVERLAYS`. The crew-section tests move to `board.css`.
- [ ] **Step 4:** Run `npx vitest run src/mountain-screen-crew.test.ts src/mountain-screen.test.ts src/staffing-teach.test.ts src/style.test.ts` and `npm run gate -- fast`. Expected: PASS. Then run `npm run play -- --save early tap:.board-bay[data-tier=cart] wait:.board-sheet.is-open`. Look at the phone shot: the Crew section, rows with icons at 2×, the amber pick, the footnote and the spare.
- [ ] **Step 5: Commit** `Buys opens as a riveted drawer: the Crew section, rows in four states, the per-row Done hold, the settle and the "i" card (#373)` and push.

### Task 8: The key rail replaces the thumb bar

Needs `key-dot.png` (Art needed) before it starts.

**Files:**

- Create: `src/board-keys.ts`, `src/board-keys.test.ts`, and copies in `src/assets/board/` of the seven `icon-*.png` named in Global Constraints
- Modify:
  - `src/mountain-screen.ts`, `src/engineers-panel.ts`, `src/menu-panel.ts`, `src/afford-glow.ts`, `src/board.css`, `src/style.css`, `src/tokens.css`;
  - tests: `src/mountain-screen.test.ts`, `src/mountain-screen-depths.test.ts`, `src/mountain-screen-crew.test.ts`, `src/engineers-teach.test.ts`, `src/promotion-teach.test.ts`, `src/tending-teach.test.ts`, `src/workshop-panel.test.ts`, `src/upgrade-reveal.test.ts`, `src/afford-glow.test.ts`, `src/style.test.ts`, `src/token-check.test.ts` (only if it reads `.menu-button`).

**Interfaces:**

- Consumes:
  - Task 3's `KeyId`, `KEY_IDS`, `KeyView` and `keyViews`;
  - `frameX`, `write`, `setAttr`.
- Produces:
  - `createKeyRail({ onKey }: { onKey: (id: KeyId, key: HTMLButtonElement) => void }): KeyRail` with `interface KeyRail { readonly root: HTMLElement; readonly keys: Readonly<Record<KeyId, HTMLButtonElement>>; render(views: Readonly<Record<KeyId, KeyView>> | undefined): void }`.
    - `root` is `nav.board-rail` (`aria-label` `Actions`).
    - Each key is `button.board-key[data-key]` holding:
      - `i.board-key-cap` (the key.png sprite, `background-size` 128×32 art). The cap holds `img.board-key-icon` (16×16 art at (8, 7.5) art) and `img.board-key-dot` (key-dot.png, top right, hidden);
      - `.board-key-name.board-lg`;
      - `.board-key-sub`.
    - The cap frame is `frameX(cap, n, 64)`: rest 0, down 1 while pressed, locked 2, lit 3. The pointerdown, pointerup, pointerleave and pointercancel handlers follow the mockup's `upk`, and the icon drops 1 art while down.
    - **locked:** the `-dim` icon (buys and upgrades are never locked; ledger has no dim), the button `disabled`, `.is-locked` and `--board-ink-quiet` on the name.
    - **lit:** frame 3 and `.is-lit`.
    - The sub shows only when non-empty. The key is then 90px tall instead of 76.
    - `render(undefined)` (the save is not in) shows rest caps, bright icons, no dot and no sub, and leaves every key enabled except Workshop and Engineers. Those stay disabled until a view says otherwise.
    - The click calls `onKey(id, key)`.
  - `createEngineersPanel({ …, door })` and `createMenuPanel({ …, door })` take `door: HTMLButtonElement`. The panel listens to its click, focuses it on close, and writes only `aria-expanded` on it. It builds no button and appends nothing to it. It no longer sets the door's `hidden`, `disabled` or afford glow. `menuButton` and `engineers.button` in their return values are the door.
  - `afford-glow.ts` keeps `canCraftNow`. `setAffordGlow` and `canBuyAnyTier` go, since nothing uses them; so does `afford-glow.test.ts`'s glow case.
- [ ] **Step 1: Write the failing tests.**
  - `board-keys.test.ts` (happy-dom):
    - five keys in `KEY_IDS` order with `aria-label`s from the views;
    - a locked Engineers key is disabled, with the `-dim` icon, cap at `-128px`, `With 1st borer` shown and the key's class `is-locked`;
    - a lit Upgrades cap is at `-192px`;
    - a pointerdown shows `-64px`, and pointerup returns to the view's frame;
    - a dot shows `.board-key-dot` and no dot hides it;
    - `render(undefined)` shows no dot or sub;
    - a click calls `onKey("buys", key)`;
    - a repeat render writes nothing (`MutationObserver`).
  - `mountain-screen.test.ts`:
    - `"the key rail replaces the thumb bar"`: there is no `.thumb-bar` or `.menu-button`. `.board-rail` is a child of `#app` with five keys.
    - `"each key opens its door"`:
      - Buys and Upgrades open their drawers;
      - Workshop opens `.workshop-dialog` on an unlocked save;
      - Engineers opens `.engineers-dialog` on a save with an engineer;
      - Ledger opens `.game-menu`, and closing it puts focus back on the Ledger key.
    - `"a double tap on a key"`: two clicks on the Buys key 150ms apart, the second dispatched as pointerdown and click on `.board-sheet-back`: the drawer stays open and nothing is bought. The same holds for Upgrades with the second tap on its first row.
    - `"locked keys"`: on a fresh save, Workshop and Engineers are disabled with their sub-lines.
    - `"red lamps"`:
      - staffing teaching shows the Buys key's dot;
      - in the Great Machine era, a cart cave-in shows the Buys key's dot and `Buys. …`, and fixing it on the row clears the dot.
    - `"timers on keys"`: the `workshop` fixture shape shows the bench clock under Workshop, and it ticks down on the 1s tick.
    - `"the New note stands above its key"`: `engineers-teach.test.ts` and `workshop-panel.test.ts` anchor on `.board-key[data-key=…]`. With Buys open, the note does not show. After close, it shows on the next tick.
    - `"opening one drawer closes the other"`.
    - `"the save line over a drawer"`: with Buys open, a click on `.save-status` opens `.board-save-drawer.is-open`, and Buys stays open under it.
    - `"until the save is in"`: on a loading store, no key has a dot, lit cap or sub-line.
  - Retarget the rest by the mapping in Notes.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement and wire.**
  - Create the rail. `onKey` runs `closeBoardPopups()` and then:
    - buys → `openBuys(key)`;
    - workshop → `openWorkshopSheet()`;
    - engineers → the engineers door's own click handler opens the sheet;
    - upgrades → `crewPanel.sheet.close(); upgrades.open(key)`;
    - ledger → the menu's door handler opens the menu.
  - Pass `door: rail.keys.engineers` and `door: rail.keys.ledger`. The Workshop panel's `onClose` focuses `rail.keys.workshop`.
  - `render()` and the tick call `rail.render(view.ready ? keyViews(view.mountain, now(), view.trouble) : undefined)`.
  - Remove:
    - `thumbBar`, `thumbIcon`, `thumbLabel`, `buysButton` and `workshopThumb`;
    - the temporary Upgrades and Buys thumbs from Tasks 6–7;
    - every `setAffordGlow` and `setTeachDot` call;
    - the engineers panel's `setAffordGlow`.

    The teach note anchors on `rail.keys.workshop` and `rail.keys.engineers`. The engineers note's action clicks `rail.keys.engineers`. The root order puts `rail.root` where `thumbBar` was.

  - **CSS:**
    - `.board-rail` is at `top: var(--rail-top)`, 424×92;
    - `.board-key:nth-child(n)` is at `left: calc(var(--art) * (8 + 40 * (n − 1)))`, 64 wide, a flex column, centred;
    - the cap is 64×64;
    - the name is 13px bold uppercase with a −1-art top margin, in `--board-ink` (`--board-ink-quiet` when locked), engraved;
    - the sub is 13px on 13px in `--board-ink-bare`, `.board-num` when it is a clock;
    - the dot is 20×20 at `right: var(--art)`, `top: var(--art)` inside the cap.

    Remove `#app > .thumb-bar` and `.thumb-bar .menu-button` from `board.css`. Remove the `.thumb-bar*`, `.buys-button`, `.thumb-workshop`, `.thumb-label`, `.upgrades-button`, `.engineers-button`, `.menu-button`, `.afford-glow` and `.teach-dot` rules from `style.css`. The `.teach-dot` CSS goes only if no Workshop or Engineers sheet part still uses `setTeachDot` (`grep` first).

  - **`style.test.ts`:** `BOARD_SELECTORS` gains `.board-rail`, `.board-key`, `.board-key-cap` and `.board-key-dot`.
- [ ] **Step 4:** Run `npm run gate -- fast`. Expected: PASS. Then run `npm run play -- --save fresh` and `npm run play -- --save mid label:Ledger`. Look at the phone shots: five keys with Workshop and Engineers dim on fresh, every key bright on mid, and the menu opened from the Ledger key.
- [ ] **Step 5: Commit** `The key rail replaces the thumb bar: five keys with locks, lit caps, red dot lamps and timers; the Ledger key opens the menu until B7 (#373)` and push.

### Task 9: The gate checks the rail and the drawers; saves and docs

**Files:**

- Modify:
  - scripts: `scripts/visual-check.mjs`, `scripts/ui-audit.mjs`, `scripts/play.mjs`, `scripts/fixtures.mjs`, `src/play-plan.ts` and `src/play-plan.test.ts` (the `wait:` example);
  - docs: `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/ART.md`, `docs/ui-audit.md`, `docs/design-intent.md`;
  - the shots that `npm run audit:ui` rewrites in `docs/ui-audit/`.

**Interfaces:**

- Consumes: every selector from Tasks 4–8.
- Produces four fixtures, each with a play save of the same name:
  - `shortMountain()`: Granite at 25M. The pocket covers the next borer. `helpers` is set so that exactly 3 hands are free with 6 carts, 4 drills and 1 borer, so the borer row is short of workers.
  - `idleMountain()`: Topsoil, 6 carts and 3 helpers, with `taught` lacking `staffing`, so carts stand idle and the staffing New row shows.
  - `toolsMountain()`: the `mid` save with Better boots bought, Strong arms at level 2, and the lost pick and lamp found.
  - `machineMountain()`: past the Hammer and 120M with one Great Machine, no kids, and short of the Crown's depth (read `RELICS`), so the Kid worker row is locked. Pass `?trouble=cave-in` on the cart for C3.
- [ ] **Step 1: Retarget** every selector in the three scripts by the mapping in Notes:
  - `press(page, ".menu-button")` becomes the Ledger key, and `.engineers-button` the Engineers key;
  - the old sheets' `:not([hidden])` waits become `.board-sheet[data-sheet=…].is-open`;
  - section 1's Upgrades fit check reads rows;
  - section 20 (long sheets) scrolls `.board-sheet-list`;
  - section 22's affordable, dear and locked check reads `is-ready`, `is-dear` and `is-locked`;
  - section 24's `GUARD_SCREENS` open each door by its key;
  - the bays section's "thumb bar ends 8px above the save line" becomes "the rail ends at least 8px above the save line";
  - in `ui-audit.mjs`:
    - `buys-hazard` waits for `.board-row[data-trouble]`;
    - `crew-needs-workers` finds `.tier.is-dear` instead of `.tier:disabled`;
    - `upgrades-boosts-timer` expects `Running` and a `\d+:\d\d` tag.
- [ ] **Step 2: The board section.**
  - `BOARD_TARGETS` gains:
    - `.board-key:not(:disabled)`;
    - `.board-sheet.is-open button.board-row:not([hidden])`;
    - `.board-sheet.is-open .board-platebtn`;
    - `.board-sheet.is-open .board-sheet-info`.
  - `BOARD_PARTS` and `BOARD_ART` gain `.board-rail` and `.board-sheet.is-open`.
  - `BOARD_LEGENDS` gains `.board-key-name` and `.board-key-sub`.
- [ ] **Step 3: Add a `keys and drawers` section**, at 424×924 and the three PC sizes:
  - **Rail:** on `fresh`, `early`, `mid` and `heart`:
    - five keys at the mockup's x (16 + 80i) and top 768;
    - every icon, cap and dot at exactly 2×;
    - names and subs at 13px or more, at 4.5:1;
    - Workshop and Engineers locked on `fresh` and open on `mid`;
    - the rail's foot at least 8px above the save line.
  - **Drawers:** open Buys and Upgrades by their keys on `fresh`, `early`, `mid`, `short`, `idle`, `tools`, `machine`, `heir` and `crew`. For each:
    - the drawer box is 178..864 by 8..416;
    - the odometer and the save line are not covered;
    - the page does not scroll;
    - the list does not scroll except on `crew` and `machine` Buys (C1), where it scrolls and the spare is `is-off`;
    - rows are 76 tall and 10 apart;
    - targets are at least 48 with 8px gaps;
    - text is at least 13px;
    - row and how-card art is at an exact 2×;
    - row legends are at 4.5:1;
    - the spare's tier class matches `spareTier` of its measured height;
    - every row's name, info, need, flag, gain, tag and verb lie inside the row and do not overlap. This includes `machine` (the Great Machine's `lockBodyLine`) and `mid` with Ada on the borers when the borer is the pick (`Ready now · Ada tends · …`);
    - each "i" card pair fits its drawer with no scroll.
  - **States** (one assertion each):
    - `early` Buys has amber `is-pick` cart, `is-dear` drill and `is-locked` borer;
    - `short` has `is-short` borer with `Needs 8 workers`;
    - `saving` has the flag `Saving for` on the cart row;
    - `idle` has `teach-new` with `New`, scrolled into view;
    - `machine` has a locked kid row with `mach-kid-dim`, and with `?trouble=cave-in` the Buys key's dot shows and the cart row has `data-trouble`;
    - `heir` shows Grandpa's chip;
    - `tools` Upgrades shows `Lv 2/10`, `Owned` and `Found`;
    - `crew` Upgrades has both boosts `Running`.
  - **Taps:**
    - `early`:
      - a double tap on the Buys key 150ms apart leaves Buys open and the odometer unchanged;
      - a tap on the cart row after 600ms raises the count by one and shows `Done`;
      - a second tap within 1.9s changes nothing;
    - `saving`: a tap on a dear row leaves the odometer unchanged and the lamp reads red within 200ms;
    - a scrim tap closes the drawer;
    - a scrim tap on a socket closes it and shows `.board-note.on`;
    - Escape closes it;
    - the "i" shows `.teach-how` cards, and their Back restores the list.
  - **Reduced motion:** with it emulated, a drawer is fully open in the first frame after the tap, and a dear tap never paints red.
- [ ] **Step 4: Saves.** Add the four fixtures and their play saves with notes:
  - `short`: "a borer he can afford but not staff: Needs 8 workers";
  - `idle`: "carts standing idle: the staffing New row in Buys";
  - `tools`: "upgrades owned and levelled, and found tools under Brought home";
  - `machine`: "the Great Machine with the Kid row locked; add ?trouble=cave-in for the Buys key's red lamp".

  Add audit shots `key-rail`, `buys-drawer`, `buys-how` and `upgrades-drawer`.

- [ ] **Step 5:** Run `npm run visual` and `npm run audit:ui`. Expected: both PASS.
- [ ] **Step 6: Docs.**
  - `DESIGN.md`, UI direction:
    - the rail replaces the bottom bar (line 106). Describe the keys, their dim caps and unlock lines, the lit caps, the red dot lamps (teach and C3), the bench and trip timers, and the Ledger key opening the menu until B7;
    - Buys and Upgrades as drawers: the slide, the scrim, Escape, the "i", the rows' four states, the Done hold, the red blink, the spare plates, C1's scroll and the footnote;
    - lines 92, 162, 166, 184 and 498 lose the bottom bar, the glow and the old sheet wording.
  - `ARCHITECTURE.md`:
    - `row-view`, `buys-rows`, `upgrade-rows` and `key-rail` in the rules layer;
    - `board-dom`, `board-row`, `board-drawer`, `board-how-art` and `board-keys` in the board paragraph;
    - the sheet clip at z 29;
    - the panels' `door`;
    - `DRAWER_SETTLE_MS` as every drawer's guard;
    - lines 173 and 189–193 updated.
  - `ART.md`: a row for each copied file and each new piece, with its size and use.
  - `ui-audit.md`:
    - the IA table's rows for Buys, Upgrades and the bar;
    - point 3: "on the key rail", and the card states as the rows' lamps, `Needs N workers` and the dim tag;
    - point 6: a lit cap is a status, not a second gold control;
    - the screen list gains the four new shots.
  - `design-intent.md`: under the teach dot, the dot is now the red lamp on a key cap. Change nothing else unless it names the bar or the glow (`grep` first).
- [ ] **Step 7: Commit** `The gate checks the key rail and the Buys and Upgrades drawers in every state (#373)` and push.

### Task 10: Prove it

**Files:** none new (fixes only).

- [ ] **Step 1:** Run `npm run gate -- full`. Expected: every step PASS, with no coverage floor lowered. Fix any FAIL first (read `.gate/logs/<step>.log`).
- [ ] **Step 2:** Run each of these and look at every phone shot (424×924) and desktop shot. Each must show its state, and `log.txt` must have no page error and a save line:

  | Save and actions                                                                                    | State to see                                                                                                                                                |
  | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `--save fresh`                                                                                      | Workshop and Engineers keys dim with `With the clay` and `With 1st borer`                                                                                   |
  | `--save fresh label:Buys`                                                                           | Buys with Crew, worker and cart rows, the footnote, and the tall maker's plate                                                                              |
  | `--save early label:Buys`                                                                           | amber `Ready now` cart, dear drill, locked borer under its tarp                                                                                             |
  | `--save early label:Buys wait:.board-sheet.is-open tap:.board-row[data-tier=cart]*2`                | one cart bought, the row reads `Done`, the odometer shows one spend                                                                                         |
  | `--save short label:Buys`                                                                           | `Needs 8 workers` on the borer row, verb `8 workers`                                                                                                        |
  | `--save saving label:Buys tap:.board-row[data-tier=drill]`                                          | `Saving for` on the cart row; the drill's lamp blinks red and nothing is spent                                                                              |
  | `--save idle label:Buys`                                                                            | the `New` staffing row, `Hire`, and the Buys key's red dot before opening                                                                                   |
  | `--save machine --search ?trouble=cave-in label:Buys` (the first shot shows the key before the tap) | the Buys key's red lamp, the cart row's `Cave-in! · Hold to fix`, the Kid row locked (`mach-kid-dim`), the Great Machine row, and the list scrolling inside |
  | `--save heir label:Buys`                                                                            | Grandpa's chip in the Crew section                                                                                                                          |
  | `--save crew label:Buys`                                                                            | the long list scrolling inside the drawer, with no page scroll                                                                                              |
  | `--save mid label:Buys label:How` (the `i`)                                                         | the Staffing and Layers cards with board art                                                                                                                |
  | `--save early label:Upgrades`                                                                       | boost rows ready or dear, the `New` row first, the lit Upgrades cap before opening, and `More open up as your crew grows.`                                  |
  | `--save crew label:Upgrades`                                                                        | both boosts `Running` with their clocks                                                                                                                     |
  | `--save tools label:Upgrades`                                                                       | `Lv 2/10`, `Owned`, and `Found` under `Brought home`                                                                                                        |
  | `--save mid label:Upgrades label:How`                                                               | the Upgrades and Boosts cards                                                                                                                               |
  | `--save workshop`                                                                                   | the bench clock under the Workshop key, and its lit cap                                                                                                     |
  | `--save mid label:Ledger`                                                                           | today's menu, opened from the Ledger key                                                                                                                    |

  For each, note in the PR which spare tier showed (tall, mid, short or off). Nothing scrolls at 424×924 except a drawer's list on `machine` and `crew` (C1).

- [ ] **Step 3:** Commit any fixes as `B5 fixes from play (#373)` and push.

## Notes

- **Selector mapping** (Tasks 6–9 retarget tests and scripts by it; the words asserted stay the same):

  | Today                                                                                                                                                                                            | B5                                                                                                                               |
  | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
  | `.buys-button`, `.thumb-workshop`, `.engineers-button`, `.upgrades-button`, `.menu-button`                                                                                                       | `.board-key[data-key="buys"]`, `[data-key="workshop"]`, `[data-key="engineers"]`, `[data-key="upgrades"]`, `[data-key="ledger"]` |
  | `.thumb-bar`                                                                                                                                                                                     | `.board-rail`                                                                                                                    |
  | `.buys-dialog:not([hidden])`, `.upgrades-dialog:not([hidden])`                                                                                                                                   | `.board-sheet[data-sheet="buys"].is-open`, `[data-sheet="upgrades"].is-open`                                                     |
  | `.buys-close`, `.upgrades-close`                                                                                                                                                                 | `.board-sheet[data-sheet=…] .board-sheet-back`                                                                                   |
  | `.tier[data-tier]`, `[data-trouble]`, `.upgrade[data-upgrade]`, `.upgrade.boost[data-boost]`, `.found-tool[data-tool]`, `.teach-new`, `.teach-info`, `.teach-how`, `.crew-status`, `.crew-posts` | kept on the new elements                                                                                                         |
  | `.tier-name`, `.upgrade-name`                                                                                                                                                                    | `.board-row-name`                                                                                                                |
  | `.tier-cost`, `.upgrade-buy` text                                                                                                                                                                | `.board-row-price`. The click goes to the row itself                                                                             |
  | `.tier-rate`, `.tier-gain`, `.tier-why`, `.tier-preview`, `.upgrade-effect`                                                                                                                      | `.board-row-info` and `.board-row-gain`                                                                                          |
  | `.tier-needs`                                                                                                                                                                                    | `.board-row-need`                                                                                                                |
  | `.upgrade-why`                                                                                                                                                                                   | `.board-row-why`                                                                                                                 |
  | `.sheet-level`                                                                                                                                                                                   | `.board-row-badge`                                                                                                               |
  | `.engineer-mark`, `.engineer-gain`                                                                                                                                                               | `.board-row-flag` (`… tends · +N/s`)                                                                                             |
  | `.teach-tag`                                                                                                                                                                                     | `.board-row-flag` reading `New`                                                                                                  |
  | `.teach-dot` on a bar button                                                                                                                                                                     | `.board-key-dot:not([hidden])`                                                                                                   |
  | `.afford-glow`                                                                                                                                                                                   | `.board-key.is-lit`                                                                                                              |
  | `.tier-ready`, `.tier-short`, `.tier-dear`, `.tier-locked`, `.tier-trouble`, `.is-ready`, `.is-dear`                                                                                             | `.is-ready`, `.is-short`, `.is-dear`, `.is-locked`, `.is-trouble` on `.board-row`                                                |
  | `.tier:disabled` (dear)                                                                                                                                                                          | `.tier.is-dear`                                                                                                                  |
  | `.buys-intro`, `.upgrades-intro`                                                                                                                                                                 | `.board-sheet-kick`                                                                                                              |
  | `.trouble-thanks`                                                                                                                                                                                | `.board-sheet-kick.is-done`                                                                                                      |
  | `.float-gain`, `.tier-count`, `.trouble-burst`, `.upgrades-pocket`                                                                                                                               | gone                                                                                                                             |

- **Spec calls this plan makes** (for the PR body's Rulings):
  - The Ledger key opens today's ☰ menu until B7, so ☰ leaves the board in B5. The menu already holds the ledger lines.
  - Lit caps carry today's afford glow on Workshop (a craft can start), Engineers (a promotion is affordable) and Upgrades. Buys never lights: the Ready now plate and the bay lamps say it.
  - One red dot lamp per key, shared by the teach dot and C3's trouble lamp. It is new art at 10×10, since `lamp.png` is too big for a cap.
  - The key sub-lines (C5) ship here, as clocks: the bench under Workshop and the soonest trip under Engineers.
  - The locked unlock lines are `With the clay` (today's words, cut short) and `With 1st borer` (the mockup's).
  - A locked key is disabled until B6 gives Engineers its locked drawer.
  - Rows:
    - a short-of-workers row still buys, as today;
    - a dear or locked row blinks red and buys nothing;
    - a troubled row counts the fix even inside the settle.
  - The settle covers every drawer and its Back plate, so a double tap on a key never closes or buys. A keyboard press is never early.
  - The flag line shows `Ready now` or `Saving for` and the tending mark together, falling back to the first. Guided rows read `New`.
  - A tier with no milestone line reads `N owned · ` and today's quiet line.
  - Upgrades rows have no icons. Their effect line is the gain. `All levels bought` becomes the `Lv 10/10` badge with `Owned`. The pocket line goes, since the odometer stays in view.
  - The Crew section's chips lose their faces (today's art is not 2×), and the posts stop being a button with no action.
  - A fix flashes `Fixed! The crew cheers.` in the kick. The burst and the buy floats go.
  - While an "i" card is open, the drawer shows only the cards (their titles and one Back), so Buys' Staffing and Layers pair fits one screen, as `docs/design-intent.md` asks.
  - How it works art maps to the board's icons, plus two new 16×16 icons.
  - Rows are 76px. The right column is a flex column, so #358's toggle and its 80px row need no restructure.
  - Drawers stop at 178 (the mockup's) and old sheets keep 176.
- **Follow-up for Flemming, not filed:** the How it works lines "Free workers show on the crew line", "The line under your stones names the layer" and "Its timer shows on top while it runs" describe today's screen. Their words are a copy change outside B5.
- **Later slivers:** the Workshop and Engineers drawers, and Engineers' locked drawer with its row to the borer (B6); the Ledger drawer and the overlay cards (B7); the PC desk, and the last old CSS such as `.sheet-card`, which Workshop still uses (B8).
