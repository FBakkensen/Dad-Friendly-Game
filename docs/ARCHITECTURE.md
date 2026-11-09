# Architecture

Review for M5 (#115). The game is a small, framework-free TypeScript app. This
page is the map, plus the rules that keep it that way.

## Layers (imports point down only)

1. **Rules of the game (pure, no DOM):** `scale` → `mountain`, `tiers`,
   `relics`, `layers`, `upgrades`, `boosts`, `veins`, `crew`, `rates` (the one place
   every multiplier is applied: live ticks, away pay, taps, the UI), and
   `field-log` (a JSON snapshot and an event ring). `rates.exactCrewPerSecond`
   is the crew speed before the whole-stone floor. `economy/actions` lists
   every legal move, including a craft and a cancel, applies the existing
   functions, and values income from that speed, taps, and away pay. A `Move`
   is an `Action` or a screen-only move (a dig, a vein tap, a seen mark), and
   `applyMove` is the one place the UI changes the mountain, and the lab's
   `applyAction` too (#409). The lab's runner and the pacing sim still call some
   rule functions directly (`promote`, `buyBoost`, `send`, `tendBestTier`),
   which R1 (#420) folds in. It says `applied` (with what the move took from the
   pocket and put in) or `refused`, and it holds the UI's rules too: a worker bought beside an idle
   machine marks staffing taught, a real station marks tending taught and first
   calls a party back, and a recall with no expedition sends the hand to camp. A craft's
   payback adds the bench time. `lab/world` steps one seeded clock (live
   accrue, away pay, hazards, expedition settle) for the pacing sim and the
   strategy lab. `lab/targets` is the only place a lab threshold lives.
   `lab/measures` is one file per decision measure. `lab/policies` is one
   file per player type. `lab/registry` discovers both folders; the world
   never reads the filesystem. `lab/run` plays a policy on that clock.
   `lab/tournament` runs every policy it is given across the seeds it is
   given and scores every measure. `lab/guardrails` turns `targets.ts` into
   one check per entry. `tools/strategy-lab.ts` (`npm run lab`) loads the
   registries, writes the report, and warns on a miss unless `LAB_STRICT=1`.
   The full gate (`npm run check`, run before a PR is opened) runs it and
   `lab:generations` with `--ci` and `LAB_STRICT=1` when the branch changes
   a file the lab imports, and a miss fails the gate. `tools/generations-lab.ts`
   plays each policy and seed in its own child process, one per core
   (`LAB_JOBS` sets the count, `tools/lab-pool.ts`); the runs of one seed stay
   in order, and the report is assembled in policy and seed order (#314). The crafted-share and idle-material rows are strict
   (#198). The tournament does not read the disk. `tools/sweep` (`npm run lab:sweep`) screens economy
   knobs (Morris, then Sobol) and writes that report. The sweep is
   offline and is not part of `npm run check`. A factor map scales
   prices, growth, output, tending, and rock hardness for the length of one run;
   outside a sweep every factor is 1, and an empty map counts as no sweep. The tuned rock lives in `layers`, and
   `layer.<n>.<tier>.hardness` multiplies it (#194, #198).
   `pacing` simulates players on top of them and buys through the catalogue.
   Every number lives here. Two display rules read these and never write
   the mountain (#372): `ready-now` (`readyNow`, the Ready now plate's pick:
   the biggest unlocked machine the free hands can run and the pocket
   covers, else the cheapest one to save for with its time at the current
   speed, else a worker, or mined out) and `machine-bays` (C2's three bay
   tiers, each bay's view and lamp, and the flap digits). The key rail and
   the drawers (#373) read four more, none of which imports art:
   `row-view` (types only: one `RowView` for every drawer row: its words
   as fit options, lamp, state, and whether a tap acts), `buys-rows`
   (`buyRowView`: each Buys row's state, words, lamp and icon key, lifted
   out of `crew-panel`'s old render), `upgrade-rows` (the boost, lasting
   upgrade and found-tool rows, and `anyUpgradeAffordable` for the
   Upgrades key's lit cap) and `key-rail` (`keyViews`: each key's cap
   (rest, locked or lit), sub-line (an unlock line, the bench clock or the
   soonest trip), red dot and label).
2. **Saves:** `persist` (versioned save format and parser; an unknown recipe, bench, or crafted level is written back instead of dropped), `session-save`
   (guest storage), `phone-backup` (signed-in on-phone copy, never deleted),
   `save-progress` (which copy is ahead), `cloud-save` (interface + memory fake),
   `firebase-save` (the SDK adapter; mountain save plus `fieldLogs/{uid}`),
   `firestore.rules` (server-side mirror of the parser and the field log,
   guarded by `rules-drift.test.ts` and the emulator tests).
3. **State:** `progress-store` owns the live mountain, and the UI changes it
   only with `dispatch(move)`, which settles the crew, runs `applyMove` with the
   clock and the trouble as that settle left them, and commits, and says
   `applied` (spent, gained) or `refused` (`not-playing` or `no-change`) (#409).
   A trouble press or fix is still a store method (S1, #414). `applyMutation` is a test seam: ESLint
   (`no-restricted-properties`) bans it in non-test `src`. The store owns settling time, away
   pay, reveals, migrations, and when/where to save. A rejected cloud write
   keeps that mountain, shows the save error, retries once, and records the
   server error on `save.error`. A snapshot is adopted only when it is strictly
   ahead (#219, #222). Ahead means a later run (`startedAt`, missing counts as 0),
   else more stones mined, else a newer `lastSeen`. A tie between two real copies
   keeps the phone and does not upload. A phone that has never saved is not a
   copy, so the cloud document is kept. The phone backup is the full save, written when the mountain
   changes and synchronously on hide and pagehide, and it is never deleted.
   Launch keeps whichever of the phone and the cloud is ahead, and uploads when
   the phone was ahead. A snapshot of our own write is ignored. A listener error
   restarts the watch with backoff (1s, then double, cap 30s) and does not stop
   saving. Becoming visible reads the server (`getDocFromServer`) before the
   next cloud write. The read gives up after 5s, logs `save.resume` timeout,
   and lets the crew settle; the next server snapshot (or the same backoff
   as a listener retry) releases the held write. The phone backup still
   records during that read, and a tap in the gap is dug back onto the merged
   mountain. One tab holds the writer seat (Web Locks, or a localStorage
   lease and a BroadcastChannel). Pagehide, including Reload, flushes the
   save and then clears that lease and the lock. A back/forward-cache
   restore (`pageshow` with `persisted`) claims the seat again. A tab that
   found the seat taken re-checks every half lease; an expired lease, or a
   Web Lock it actually holds, makes it the writer without Play here. A
   stale lease does not override a held lock.
   The others show "Playing in another tab" and do not write. Play here asks
   the writer to flush, then takes the seat. Firestore's `persistentLocalCache`
   with `persistentMultipleTabManager` is a second copy of the server doc in
   IndexedDB, not a second save: a cached or pending snapshot does not move
   `rev`, and a fresh read still asks the server. The screen only calls its methods.
4. **Screen:** `mountain-screen` builds the page and wires panels; panels are
   their own modules with a `create…Panel` factory returning their elements
   and a `render()` (`upgrades-panel`, `relic-panels`, `welcome-panel`, `menu-panel`, `crew-panel`, `workshop-panel`, `arrival-panel`). Shared player-facing
   wording lives in `screen-words`.
   The control board (#370) is its own set of modules. Pure rules with unit
   tests: `board-fit` (the scale that fits the 424×924 stage inside the
   window and its `env(safe-area-inset-*)`, read back through a hidden
   probe; 1 at 424×924 with no insets, so the art stays at exactly 2×),
   `board-skin` (the 9-slice plan that draws a frame, tag or key skin on a
   canvas behind its element), `odometer` (the five drum faces for a
   pocket) and `crew-boost` (the crew timer the crew is running at, and the
   dial frame). DOM parts take `getView` and callbacks like a panel:
   `board-note` (the floating framed note, placed in board coordinates; a
   note that holds a key stays up until the key, an outside pointerdown, or
   Escape), `board-stock` (the odometer's drums and spend mark, and the
   boost dial), `board-relics` (the relic plate: six sockets, their notes
   with the Relic shelf key, and the tag) and `board-save` (the save line,
   which keeps `.save-status` with `data-kind` and `data-log`, and its save
   drawer). `main` calls `trackBoardFit`, which keeps `--board-scale` on the
   root and re-fits on resize.
   The gauge row (#371) adds three more. Pure rules: `output-gauge` (the
   unit step for a rate, the needle's angle, its damped spring on 5° frames
   and the five-character counter), `crew-count` (the crew plate's numbers:
   the whole crew and its free hands, from `effectiveRates`), `haulage` (the
   miner's tub run between the cage and the face, a reducer on the mockup's
   timers) and `mine-window` (the view per band, `windowScene`, the beats
   when a tier's count rises, the vein's and the dig puff's places, and the
   machines' timers). DOM parts: `board-gauge` (the output gauge and the
   crew plate) and `board-window` (the window: the view, its machines and
   the run on hard steps, the dig's puff and "+N", the vein over the view,
   and the Legacy plate; `runBoardLoop` steps it and the needle once a frame,
   capped at 0.1s; the bays' drill icon steps on it too). The window's only input is a `WindowScene` built by
   `windowScene(mountain, trouble)`; it calls `onDig` and `onVein` and never
   writes the mountain. Until its first render (a signed-in save still
   loading) the window is its frame and glass on the dark: no view, machine,
   kid or run. `reducedMotion()` in `float-text` holds the window and the
   needle still; it makes one `MediaQueryList` and reads its live `.matches`
   each frame.
   The middle of the board (#372) adds three DOM parts. `board-bays` is the
   band tag and three bay buttons (lamp, icon, name, sub-line, flap counter
   and price); it draws `bayViews` and passes taps on, and keeps each bay's
   element for the board's life. `board-ready` is the Ready now plate (its
   1.9s Done hold, so a double tap buys one) and the red DIG button (its
   press frames and the By hand tally). `trouble-tap` is the 600ms
   hold-to-fix the Buys rows and the bays share. `mountain-screen` computes
   `readyNow(view.mountain, now(), view.trouble)` once per render and hands
   it to the plate and the bays; a tap on the plate reads the rule again
   from the store's snapshot, never the painted pick, and buys through
   `buyWithTeach` (in `crew-panel`), the Buys row's mutation, so a buy from
   the plate is the same buy as one from Buys. A Saving for tap opens Buys.
   A drawer's opening is the board model's (#425): the model stamps when it
   opened from shut on the host's clock (`performance.now` by default, not the
   game clock a gate run stops), and a row pressed within `DRAWER_SETTLE_MS`
   (400ms) of the opening hires and buys nothing, so the second tap of a
   double tap on the plate or a bay never spends.
   The key rail and the drawers (#373) add six more DOM parts.
   `board-dom` holds the shared `el`, `write`, `setAttr` and `frameX`
   helpers, `scrollIntoList` (brings a row into its list's view by
   scrolling the list alone, never the board's clip) and `fitFirst`, a
   measure-once line fitter: it writes the first
   fit option that fits, keeps the fit only once measured on a laid-out box,
   and drops it when fonts settle. `board-row` is one drawer row (lamp,
   icon, name and badge, info, need, why, flag, gain, price tag and verb),
   built once and reused, writing only what changed. It is a painter of the
   board model's view (#425): `rowsOnBoard(board, layer)` takes a drawer's
   rows on a `BoardHost`, subscribes once for all of them, and paints "Done"
   and the red blink frames from the view. It sends the model each press with
   when the finger came down, and tells it the result (`applied`, `refused`
   or `fixed`), and the model decides whether the press acts. `forget()`
   drops every row's finger-down time when the drawer moves on.
   `board-host` is the one place the model meets the clock: it keeps the
   model's state, steps it on every input and press, and holds the single
   timer that wakes the painters when the view next changes (a hold ending,
   a blink frame, a thanks going). `eventAge` reads how long an event waited
   before its handler ran, so a busy phone's late handler still judges by
   when the finger came down. `board-drawer` is
   `createBoardSheet` (the shell: head with the "i", the list, the spare
   plate, Back, the slide, Escape and the thanks) and `createSheetScrim`
   (the board above the drawers: a tap closes them, and over a relic socket
   also shows its note). The shell holds no timer and no judge: it sends the
   model `open`, `close`, `page` and `layout` and paints the view. Each
   close says what closed it: `finger` (Back, the "i"'s way back),
   `keyboard` (Escape), `tap-through` (the scrim, which hands its tap on) or
   `program` (a timer, the update prompt). Escape listens in the capture
   phase, so with the save drawer over a drawer it closes only the save
   drawer. `board-how-art` draws the How it works cards in the
   drawer skin with the board's icons at 2x. `board-keys` is
   `createKeyRail`: five keys that draw `keyViews` and pass taps to
   `onKey`. `board-sign` is the slim New sign over a key. `crew-panel`
   builds Buys and `upgrades-panel` builds Upgrades as `BoardSheet`s of
   `board-row`s, each painting from the model. Buys sends its layout (its
   parts in order and its chip rows) as the drawer opens, and the model
   freezes it: rows, sections and chip rows keep their places while the
   drawer is open, a row it no longer sells blinks, and words still change
   in place. Upgrades keeps its row order through a reload: `upgradesOrder`
   (in `upgrades-panel`) works the order out, every part in it shown or not,
   and the panel sends it as the drawer opens. Row visibility can still
   change on a re-load. The Buys parts are small modules:
   `buys-rows` (each row's view), `buys-tap` (`buysTap`: what a tap on a
   row does once the model lets it act, read again from the store at the
   tap), `crew-chips` (the crew line's chips: laid out in the fewest even
   rows that fit, then frozen with only their words changing) and
   `crew-rate` (`createRateCounter`: the crew line's rate counting up to its
   new value after a buy, 8 steps of 60ms, or at once under reduced motion).
   The two drawers
   and the scrim sit in `.board-sheet-clip` at z 29, under the board note
   (30) and the save drawer (31). The clip is `overflow: clip`, so nothing
   (not even script) can scroll it. `engineers-panel` and `menu-panel` take
   a `door` (the Engineers and Ledger keys) instead of building their own
   buttons. `DRAWER_SETTLE_MS` (400ms, from `board-interaction`) is every
   drawer's guard, B4's Buys settle carried into the model, judged for the
   whole drawer: rows ask the model through `buyOnTap`, and Back and the "i"
   ask it in the shell, each at a finger's pointerdown and again at its
   click (`detail` not 0), since a touch's click lands where the finger
   lifts, on a row that may have slid under it as the drawer rose. So the
   second tap of a double tap on a key, a bay or Saving for never buys or
   closes. A keyboard press (`detail` 0) is never early. Buys' footnote
   stands in the drawer's footer, over Back, and steps aside on an opening
   whose list it would push into a scroll.
   The red button calls the same `dig()` as the window, and the window shows
   the "+N". Until the save is in (a second load after sign-in or a user
   switch included) the bays, the plate and the red button show only their
   frames and art.

## Findings

- **Single source for rates holds.** All speed, tap and away math goes
  through `effectiveRates`; the screen never multiplies on its own.
- **Import cycle (fixed in #104):** `relics` ↔ `mountain` ↔ `rates` broke at
  module init; `MOUNTAIN_STONES` now lives in the leaf module `scale`. `npm run cycles`
  (part of `npm run check`, the gate) now fails on any runtime import cycle; it
  found one more (`relics` → `mountain` for `minedOut`), fixed by moving
  `minedOut` to `scale` (#118).
- **`mountain-screen.ts` was ~1,500 lines** doing layout, ten dialogs and
  their copy. Split plan, one panel per PR, the screen tests unchanged by each
  move (they are the characterization tests, 97% line coverage):
  1. Upgrades sheet + boost chips' text → `upgrades-panel` (#121).
  2. Shelf, relic detail, relic reveal and Legend finale → `relic-panels`
     (#122, #123).
  3. Welcome-back card → `welcome-panel` (#124).
  4. Menu, account and Start over confirm → `menu-panel` (#125).
  5. Tier grid and crew line → `crew-panel`; the purchase float moved to
     `float-text` (#126).

  That split brought `mountain-screen.ts` to about 460 lines: layout, the dig
  and vein taps, the guide bar, save status, and wiring the panels. It has since
  regrown to about 1,240 lines, with `mountMountainScreen` at 1,112 (its ceiling
  in `scripts/function-ceilings.json`). #411 moves its interaction rules out.

- **Local spends (#370, #409):** the odometer shows a spend only for the
  player's own moves. `mountain-screen` hands every panel one `Dispatch`
  wrapper around `progress.dispatch`: a move that applied with `spent >= 1`
  rolls the spend mark and kicks the needle. A cloud copy, a chosen or
  restored copy, Start over or Pass the mine never comes through it, so
  `renderStock` only sets the drums and the dial.

- **Board tap rules (#410, #425):** `board-interaction` is a pure reducer that
  holds the board's tap rules once, run through `board-host`. The Buys and
  Upgrades drawers, their shell and their rows are painters of its view:
  they send it inputs and presses and read `boardView`; none holds a settle,
  a hold, a timer or a freeze of its own. The model:
  - the 400ms settle after a drawer opens or turns a page, and after a
    finger closes a drawer (Back), for what that close shows again (named
    fix 1). The save drawer and the board notes never settle, and a
    tap-through close (the scrim, a tap outside a note) hands its tap on;
  - the 1.9s Done hold: every press judged before it ends is held, judged by
    when the finger came down (named fix 2), so a press handled after the
    hold whose finger came down inside it is held too;
  - the red, off, red, off blink on a tap that cannot act;
  - the freeze of an open drawer's layout, its parts in order and its chip
    rows, and the blink on a part it holds but no longer sells. A drawer
    whose rows show or hide in place (Upgrades) lists every row, hidden ones
    too. A save loading again keeps an open drawer's freeze but forgets the
    latest layouts, so a drawer opened then freezes the first layout it is
    given: Buys gives the new save's as it lands, and Upgrades, which keeps
    its order through a reload, gives that order as it opens. The screen
    sends `unloaded` once per ready to not-ready edge (a save loading
    again), which also ends every Done hold, as a reload always has;
  - the 1.6s thanks after a fix;
  - the overlay stack: a drawer stands alone, and the save drawer and a
    note go on top.

  Inputs carry their own times (`pressedAt` for when the finger came down,
  `at` for when the handler ran), and `boardView(state, at)` derives what is
  open, held, blinking, thanked and frozen. `nextWake` gives the one time to
  read it again, so no timer lives in the rules. The timing values
  (`DRAWER_SETTLE_MS`, `READY_HOLD_MS`, `BLINK_STEP_MS`, `THANKS_MS`,
  `PRESS_AGE_LIMIT_MS`) live here, and the board parts import them. The
  module has one wiring: `board-host` steps it, and the drawers and rows
  paint from it (#425). The keys, plate and bays move onto it in I2b (#426),
  and the screen's own reads in I2c (#427); until then they keep their own
  copies. A
  seeded random-sequence test (`board-interaction.random.test.ts`) holds its
  invariants: no act inside a settle or a hold, and no open drawer's rows
  move. It has a 100% coverage floor.

- **Panel contract:** a panel gets `dispatch` (its only way to change the
  game), `getView`, `now` and a `requestRender` callback, and `progress` only
  where it still reads the store or presses trouble. The Buys and Upgrades
  panels also get `board`, the `BoardHost` they share with the screen, the
  one place taps are judged (`overSave` tells them the save drawer is over
  them, `door` is their key, `signal` ends their listeners); it never reads another panel's elements, and it
  owns its open/closed state. The key rail uses those gates: the Workshop
  key stays locked until `workshopUnlocked`, Engineers until the first
  borer. Buys, Upgrades and Ledger open from the first screen. The board's parts sit round the
  panels: `#app` is the 424×924 stage, the board's top (relic plate and
  stock row) and the save line are absolute children of it, and the
  panels' column flows between them through `#app`'s padding. The relic
  shelf opens from a socket note's Relic shelf key; opening a sheet, the
  shelf or the menu closes the board note and the save drawer. The gauge
  row (`.board-gauge-row`, `--gauge-row-h`, 176 to 414px) is another
  absolute child, under the board's top: the output gauge, the mine window
  (`.board-mine`, its `.board-window` button and the `.golden-vein`) and
  the crew plate (`.board-crew`). The bays (`.board-bays` at `--bays-top`,
  430px; their band tag rises to 420) and the Ready row
  (`.board-ready-row` at `--ready-top`, 644px: the plate and the red
  button) are absolute children too. The key rail (`nav.board-rail` at
  `--rail-top`, 768px, #373) is another, between the Ready row and the
  sheet clip: five `button.board-key[data-key]`, each with `aria-expanded`
  and `aria-haspopup`, ending at least 8px above the save line. The column
  starts at `--column-top`, which is `--rail-top`. The New teach note is a
  slim sign (`board-sign`) over its key, with `pointer-events: none`; its
  words go on the key's label. The Buys and Upgrades drawers
  (`.board-drawer.board-sheet[data-sheet]`, open with `.is-open`) stand
  at `--sheet-top` (178px) down to the save line, so they cover the bays,
  the plate and the rail and leave the odometer in view. Today's Workshop,
  Engineers and menu sheets keep B2's `--board-top` (176px) until B6 and
  B7. The crew line (`crew-panel`'s `section.crew`: sentence, chips and
  Grandpa) is the "Crew" section at the top of the Buys drawer; Buys calls
  `layoutChips()` as it opens, so its chips are measured at the drawer's
  width, and while it is open the chip rows never wrap. A drawer's list
  scrolls inside itself only when it is longer than the drawer (C1:
  late-game Buys, a full Upgrades), with the spare plate off; the page
  never scrolls. A crew line that does not fit splits into even rows. An
  unlocked row keeps its price, effect, and why when the pocket is short.
  A locked row says Locked. Tapping the row buys. A drag that scrolls the
  list does not. Boost, expedition, craft, and bench countdowns
  share the effect row, which is the body of the boost dial's Running now
  note, one per line. Every active one stays visible. The menu, behind the
  Ledger key until B7, holds the ledger: stones left, materials, and the next-relic goal, read from
  `relicGoal()` in `relics` (#336). The band shows in the mine window's
  view (`mineView(band)`); there is no tint module (`mountain-tint` went
  with the rock in #371), and no `tap-float`: a dig's "+N" is the window's
  own.

## Guards (#118)

- `npm run cycles`: no runtime import cycles in `src`.
- `rules-drift.test.ts`: `firestore.rules` allows exactly the `Mountain` save
  fields (a `Required<Mountain>` sample makes a new field a type error until
  listed), every upgrade id with its max level, and every boost id.
- `knip` (strict): no unused files, exports or dependencies.
- `prettier --check .` covers docs too; coverage floors per critical module. The fast tier runs `prettier --check` on every file changed since `origin/main` (`format:changed`).
- Scheduling (#403): independent steps run in parallel, but the heavy lane (`visual`, `lab`, `lab:generations`, each filling every core) runs one at a time, visual first, so the timing checks never run under the labs' load. The labs are seeded, so a green run records the sha256 of its inputs (the lab's import closure, `package-lock.json`, the Node version, and the step's command, args and env) in `.gate/reuse/<step>.json`. A later run with the same inputs prints `reused (same inputs passed on <sha>)` instead of running, and counts as green for signoff. A red run deletes its record, and CI starts with none.
- `scripts/function-ratchet.mjs` (`npm run functions`, both gate tiers, #408,
  #418): every function in non-test `src` is held to two measures, 150 lines and
  a cognitive complexity of 15 (`sonarjs/cognitive-complexity` from
  `eslint-plugin-sonarjs`, run through the ESLint Node API without type
  information and mapped to functions by their heads). A function over a limit
  needs a ceiling in `scripts/function-ceilings.json` or
  `scripts/complexity-ceilings.json`, and may not rise past it. Each list must
  be exact (a function that comes down lowers its ceiling; a gone one loses it),
  against `origin/main` a ceiling may not rise and none may be added, and no
  ceiling may sit on an anonymous function. Rules in `src/function-ratchet.ts`;
  every function-like node counts, nested and anonymous ones included.
- `scripts/token-check.mjs` (part of `npm run check`): CSS added since `origin/main` uses `src/tokens.css`. A raw colour, a raw px size, or a tap target under 48px fails. CSS already on main is the allow-list. Mockups are not part of the check.
- Signoff (#397): a green `npm run check` on a clean, committed HEAD writes `.gate/passed`. `npm run gate -- signoff` (`scripts/signoff.mjs`, rules in `src/signoff.ts`) starts `.github/workflows/signoff.yml`, which posts the `signoff` commit status; the ruleset on `main` requires it and an up-to-date branch. The relay exists because cloud sessions may not post statuses. `deploy-hosting` runs `npm run check` on the merged commit before it deploys, so a red `main` deploys nothing.

## M7 sketch

Staffing (#140), the workers' name (#139), the field log (#141–#143), engineers (#144), expeditions (#146), the side-tunnels sheet (#147), lost tools (#148) and hazards (#149) are built.

- **Names:** player text says "worker"; `helpers`, `TierId "helper"` and the rules keep their names (no save migration). All copy comes from `screen-words`. Built (#139).
- `scale` (leaf, #356; retuned #357): `MOUNTAIN_STONES`, the kid-run stretch (`KID_RUN_GROWTH`, `kidStretch`, `MAX_STRETCH`) and the band scales. `BAND_STARTS` and `BAND_SCALE` say how many stones a band takes per stone of depth, times k. Their values are in [Numbers now](DESIGN.md#numbers-now). Depth stays in run-1 units, so `remaining` and the save format do not change. The pure functions `shownStones(depth)`, `stonesLeft`, `depthAfterStones(stones)` and `minedOut` convert between depth and the stones a run shows; `oneOffStretch` = k × the current band's scale prices upgrades and promotions. Machines and workers use k only (`tierCost`).
- `tiers`: each tier's first price, speed, `staff` and opening depth, and the two growth curves (`MACHINE_COST_GROWTH`, `HELPER_COST_GROWTH`) that `tierCost` applies. The values are in [Numbers now](DESIGN.md#numbers-now). The `milestones` module (#357) doubles a tier's output at owned-count marks, stacking; the marks are in [Numbers now](DESIGN.md#numbers-now) too. `crew.staffExisting` grants once more (`staffed: 2`; `true` and `1` are the #89 grant). Built (#140). History (#140): the Great Machine's staff was 25, as staff 15 never ran one in the sim then and reopened a 2.5-day gap with no purchase.
- Grandpa (#338, in `engineers`): `grandpaPost(mountain)` is the biggest running machine no engineer tends, once the Legacy is at least 1, staffed the same way `effectiveRates` staffs. `tendingTenths` counts him at `GRANDPA_RANK` (apprentice) on that post. Nothing is saved.
- `engineers` (rules layer, pure): `Engineer = { name, rank: 0 | 1 | 2, trips, post: TierId | "tunnel" | "camp" }`; `promote(mountain)`, `station(mountain, i, post)`, `rankOf`, `addTrip`. `promote` takes no `now`: the price does not depend on the clock. Save: `engineers?: Engineer[]` (max 5, names Ada, Nils, Ruth, Otto, Mae). The first engineer arrives with the first borer, already tending it, without spending a worker; `grantFirstEngineer` does that once for an older save. Rules check the first two hands. A later hand, and a duplicate name, are rejected by the parser: checking them beside a full v6 save crosses the 1000-expression budget (#219). Rules + drift guard + emulator tests. Built (#144). Buying a machine does not call `tendBestTier` (#145); the sheet's post sticks. The pacing sim still calls it.
- `expeditions` (rules layer, pure): `TUNNELS` (a side seam, 10 min; the old
  shaft, 1 h; the deep dark, 4 h, Journeyman+). `send(mountain, engineer,
tunnel, now)` stores the find, seeded from `sentAt`, and the post they left
  (`home`), then moves that engineer to `"tunnel"`. `recall` puts them back at
  `home` with no trip and no find. `settle(mountain, now)` clamps a future
  `sentAt` to now (the wait and the find stay, the same idea as a future
  `lastSeen`) and returns `{ mountain, finds, homecomings }` for every
  expedition past `returnsAt`, adding a trip and restoring `home`. `homecomings`
  (who, which tunnel, the settled find) is session news for the welcome card,
  not a save field. `accrueAway` returns the same list for parties who came home
  while the game was closed. Save: `expeditions?: { engineer, tunnel, sentAt,
returnsAt, home, find }[]` (≤5, `returnsAt > sentAt`, no longer than the deep
  dark, closed tunnel and find ids, one trip per name) and `finds?: FindId[]`
  (lost tools and keepsakes, no duplicates). `home` and `find` are stored
  because `"tunnel"` would forget the machine, and clamping `sentAt` would
  reroll a find that was only recomputed from it. Rules cap the list at 5 and
  check the tunnel and `returnsAt > sentAt` on the first two trips. Shelf ids
  are a closed list. The parser rejects a bad trip, a duplicate shelf id, and
  anything past those two checks: doing all of that in rules, beside five
  engineers, crosses the 1000-expression budget. Built (#146). The worn map
  shortens the next send to three quarters of the tunnel time
  (`expeditionAwayMs`); a party already out keeps its clock. Built (#148).
- `rates`: `effectiveRates` with no clock and no trouble is kept per mountain
  object (a `WeakMap`) and per sweep factor map: a mountain is never changed in
  place, and scoring one decision reads the same mountain many times. A call
  with a clock always reads again (#314). `effectiveRates` adds the tending
  bonus (per tier, the best engineer there; none at camp or in a tunnel) and,
  while an engineer tends the Great Machine, drops its staff to
  `TENDED_MACHINE_STAFF` (both in [Numbers now](DESIGN.md#numbers-now)). Built
  (#144). #178 multiplied borer tenths by 1.62. #210 makes that seven quarters,
  so an apprentice on the borer is +17.5%. Once a Great Machine exists and the
  best tender is not on it, that post is topped up to 12% of the untended crew.
  A second running post adds its own floor. `valueOf` prices a find as expected
  stones over the horizon (`src/economy/finds.ts`); keepsakes and glimmers are 0. Session trouble arrives as an optional third argument and slows that tier
  only; away pay never passes it. Built (#149). Grandfather's pick strengthens
  the bare tap (five fourths, rounded up) before Sharper picks doubles it. Built
  (#148). `accrueAway` splits the paid window at each `returnsAt` after clamping
  a future `sentAt`, so the tending bonus resumes from the return; a party
  already home before that window (including during the unpaid part of a capped
  absence) tends the whole of it. Built (#146). The pacing dad (`tendBestTier`)
  keeps Ada on the borers until he owns a Great Machine, then moves her onto it.
  He fixes trouble within 3 seconds. From the first borer, the sim pays the real
  promotion for Nils (2,000,000 stones and one worker) and he waits at camp.
  Pacing days now live in `src/pacing.sim.test.ts` (#357: plain dad 4.5, upgrade
  dads 3.5, second run 3). History (#163, #171): the plain dad reached the
  bottom on day 5.5, upgrade and boost dads on day 5.0, a second run on day 4.
  Nils walks the old shaft at the start of every session and, once a journeyman,
  the deep dark each night. Finds apply.
- `hazards` (rules layer, pure): `nextTrouble(seed, now, mountain)`, `fix`, `pressTrouble`, `slowedSpeed`. One trouble at a time, every 3–6 minutes of live play, only once a borer is owned. Cave-in on carts, flood on drills, jam on borers or the Great Machine. The tier keeps three quarters of its speed at first and eases to half over two minutes. Five taps or a 600ms hold fixes it. An engineer tending that tier fixes it after 30 seconds; a Master fixes it at once. Steel-toe boots double the gap when `wearsSteelToes(mountain)` is true (or the caller passes `boots: true`). Built (#148). Session state lives in `progress-store`, never in the save, and clears on close, reload, and away time. Built (#149).
- `field-log` (rules layer, pure): `snapshot(mountain, rates, now, version)` and
  `EventRing` (last 200) are built (#141). `progress-store` records tier and
  upgrade purchases, boosts started, relic found, vein tapped, away report,
  Start over, pass the mine, and save errors. The ring is not a mountain save
  field. The menu copies `{ snapshot, events: last 50 }` as pretty JSON, with a
  read-only sheet when the clipboard is missing. No email or display name.
  Signed-in games write `fieldLogs/{uid}` = `{ snapshot, events (≤200),
updatedAt }` at most every 5 minutes, and immediately on hide, Start over, and
  passing the mine (#142). Those two resets clear the ring first. Guests write
  nothing. `shouldWriteFieldLog` is the throttle. Rules: owner-only read/write,
  snapshot shape, `events` length ≤ 200, the first event's shape, no delete. The
  rules engine allows 1000 expressions, which is not enough to type-check all
  200 events on top of the snapshot, so the client also refuses a document over
  50 KB (`fieldLogWithinBudget`). `tools/field-log.ts` (#143) reads those
  documents with the Firebase Admin SDK: Application Default Credentials
  (`gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS`),
  or the Firestore emulator when `FIRESTORE_EMULATOR_HOST` is set. `npm run
field-log` lists every log; `--uid` or a positional uid reads one. The default
  print is a summary with local times; `--json` prints the stored documents.
  Built (#150): the snapshot lists engineers (`name`, `rank`, `post`) and
  running expeditions (`engineer`, `tunnel`, ISO `returnsAt`). Rules cap each
  list at 5 and check that the first item is a map of the expected keys. A
  closed-name check, beside the snapshot and the first event, crosses the
  1000-expression budget. A full relic shelf and a second boost are size-capped
  only: naming every relic made a late-game field log write fail the same way
  (#219). The client writes the typed snapshot. The ring adds
  `engineer.promote`, `engineer.station` (a machine post, or `camp` when called
  back), `expedition.send`, `expedition.return` (find id in `source`; `quiet`
  when the tunnel was empty), `expedition.recall`, `trouble.start`,
  `trouble.fix` (`hand` or `engineer`), `crew.staff` (workers granted by the
  one-time top-up), `layer.enter` (the band id), `craft.start` (the recipe id),
  `craft.done` (the recipe id and the new level). A layer card and a craft-done
  notice are session news, like a relic reveal: the baseline is the loaded save,
  so a band you already sit in, or a craft already fitted, is not announced
  again after a reload or another absence. An absence that does break into a
  band, or finish a craft, folds that line into the welcome card. A compact
  machine card always shows the gain of one more (`+N · total/s`) and the
  workers one more needs, from `staffForBuy` (the tier's `staff`, or
  `TENDED_MACHINE_STAFF` when an engineer would tend the Great Machine; values
  in [Numbers now](DESIGN.md#numbers-now)). Short hands read `Needs N workers ·
M free`. The crew line, in the Crew section at the top of Buys, names where
  the workers are in its chips; a line that does not fit splits into even rows,
  and the crew plate on the board is the only free count (#371). The Workshop's
  Quiet/Sound toggle is the only sound control. Trouble stays out of the
  snapshot: it is never saved. Choosing a post while a party is out records the
  recall and, when the new post is not the one they left, the station.
- `lost-tools` (rules layer, pure): `hasLostTool`, `tapWithPick`, `glintScale`, `expeditionAwayMs`, `wearsSteelToes`. The old miner's lamp doubles a golden vein's glint (`veinGlintMs`). Keepsake stories live in `screen-words`. No new save field: the shelf is still `finds`. Built (#148).
- `layers` (rules layer, pure): four bands from stones mined: the Topsoil, the Granite, the Crystal Caves and the Deep Heart through the bottom, starting at `BAND_STARTS` ([Numbers now](DESIGN.md#numbers-now)). `layerOf` reads `minedOut`. Entering a band includes its first stone, so 10M is the Granite, beside the Shield. Hardness is a per-tier speed in `effectiveRates`, and the sweep factor `layer.<n>.<tier>.hardness` multiplies it. Workers and kids stay at 1. No layer field. Each band drops its material on the tuned gap in `MATERIAL_EVERY` (1,000,000 clay, 1,000,000 iron, 5,000,000 crystal, 10,000,000 heartstone). `accrue`, `accrueAway`, and a hand tap add the units. The remainder stays in the stone total. Built (#194, #195, #198).
- Save v7 adds `rev`, `deviceId`, and `savedAt` beside the workshop. `rev`
  starts at 1 (a new doc, or the first write of a v6 doc, which counts as rev 0)
  and the rules accept only `stored + 1`. The compare is before the mountain
  walk so a stale write stays under the expression cap. `savedAt` must be
  `request.time`. One cloud write is in flight, at most one a second, and the
  newest mountain is the next payload. A rev refusal reads the server doc. A
  later run wins whole. A lower rev is never adopted. One copy fast-forwards
  when it is at least as far on stones mined, upgrade levels, crafts, recipes,
  finds, engineer trips, machines (carts, drills, borers, the Great Machine) and
  crew, and further on one of the progress facts. A lead that is only machines
  or crew, or a split where each side has something the other lacks, is not
  blended. The phone keeps its copy. The sheet "Two saves found" asks which to
  play. The other copy is archived first at `saveArchive/{uid}/copies/{id}` for
  seven days (owner create and read, no update, no delete). Then the chosen copy
  is written at the server rev plus one. A failed archive leaves both copies and
  the sheet. `syncedRev` on the phone backup is the last confirmed rev.
  `save.conflict` logs the revs, device ids, stones mined, and the choice. Saved
  copies in the menu restore one the same way and log `save.restore`. A copy
  from an earlier run is not restored: the current game, the phone backup, and
  the cloud stay as they are, and nothing new is archived. The field log
  snapshot includes `deviceId` and `rev`. A newer service worker shows "Update
  available" and a reload button. Old cached builds cannot write once a rev
  exists. Coming back reads the server before writing. A cached snapshot
  (Firestore persistent cache) does not count as that read. One writer tab per
  device; Play here flushes the phone backup first. Offline writes stay in that
  cache until the next open, and a stale queued rev is rejected like any other.
- Save v6 keeps `materials`, `bench`, `crafted`, `recipes`, and optional
  `chargeUntil` on the mountain in memory, and writes them as one `workshop` map
  beside the mountain. The mountain key list in `firestore.rules` cannot grow,
  and a full crew is already at the expression budget, so the rules only require
  that map. The parser checks the four material ints (each capped at that band's
  width), the bench times, crafted levels, and a whole `chargeUntil`. An unknown
  shelf id is dropped. An unknown recipe id, a craft level, and a bench this
  build cannot name are written back, so a newer id cannot lock an older client
  out of the save. While that bench's clock is still running, the Workshop says
  "Something is on the bench" and a new craft waits (#202). A v1–v5 save, local
  or cloud, keeps the stones already mined and is granted the materials those
  stones would have dug. Recipes are the starting three, plus Reinforce once the
  Granite is reached, plus Diamond bits and Crystal flare in the Crystal Caves,
  plus the Heartstone core and Heartstone ember in the Deep Heart. The lamp and
  the kit are not granted. The bench is empty and nothing is crafted. A v6
  document keeps the pocket it stored. Passing the mine keeps the recipes and
  clears materials, the bench, crafted gear, and a hot charge. Built (#195,
  #196).
- `workshop` (rules layer, pure): one bench. A recipe this build cannot name
  still occupies it until its clock ends (`unknownBench`): the sheet counts it
  down, offers no refund, and a new craft waits. Once that clock has rung, a
  known craft may take the bench. `startCraft` spends stones and materials when
  the Granite is open, the recipe is known, and the pocket can pay.
  `settleBench` fits a craft whose clock has rung, once, including inside
  `accrue` and `accrueAway`. `cancelCraft` returns lasting gear in full, because
  its effect has not started, and only the unused share of a live timer (axle
  grease, a blasting charge, a crystal flare, a heartstone ember). A craft whose
  clock has already rung is fitted instead. `cancelRefund` and `hotTimers` are
  what the sheet reads. Rails, bits, the core, and Reinforce (max 5) multiply
  tier speed in `effectiveRates`. A blasting charge doubles the live crew until
  `chargeUntil`. Axle grease doubles the live crew until `axleUntil`, including
  while it is still on the bench. Axle grease, a blasting charge, and Overtime
  meet in `effectiveRates`, and the crew runs at the strongest of them. A
  heartstone ember multiplies the Great Machine by 1.25 until `emberUntil`. A
  crystal flare makes veins 25% more often until `flareUntil`. Crafting a flare,
  an ember, or another grease refreshes that clock and does not stack. None of
  those timers change away pay. Sturdy props stretch the trouble gap. The lamp
  makes golden veins more often for good. The engineer's kit shortens the next
  expedition. Strength and cost factors (`recipe.<id>.strength`,
  `recipe.<id>.cost`) default to 1; strength also scales a timed buff's length.
  Built (#196, #198, #210). The sheet is `workshop-panel` (#199): opened from
  the Workshop key on the rail (locked until the Granite's clay, #373) or the
  menu the Ledger key opens, which shows "Workshop · opens as the clay comes in"
  before that, four cards to a page so a short phone does not scroll, real costs
  and effects, a shake when the pocket is short, materials that float to the
  bench, a quiet hammer until Sound is on, and a cancel that names the refund. A
  grease or charge card says "Crew already at ×2" when another crew timer is
  already that strong, and otherwise names the crew in whole stones like the
  header (`formatCrewSpeed`, #332). The countdown keeps running while the sheet
  is shut.
- Panels: `engineers-panel` is the Engineers sheet (#161): one open card and
  one-line rows, Tend and Send exploring choice lists, a cheer toast, and the
  walk-home state. A tend choice calls `station(recall(...))`, so a party is
  never left without its engineer. Call back confirms, then `recall`. Promote
  confirms, Step up checks the price again, and the cheer waits until that hand
  is actually on the crew. The button shows the price ("Promote: 2M stones"; a
  light pocket says "Needs 2M stones"). Tending choices, the open sentence, the
  cheer, and the lamp show the live stones/sec from `tendingGain`. Keepsakes
  already on `finds` are listed on the open card at reading size (`Brought
home`); a full crew on a short phone keeps that to one line and a toast tells
  the stories. No new save field. A countdown chip still sits in the mountain's
  corner (words, not a clock). `progress-store` keeps `homecomings` until the
  welcome card closes, and writes them under `dad-friendly-homecomings` so a
  reload after a hidden settle still shows the notice. The card names who came
  back and what they found, sits above the other sheets, and a live return uses
  it with no away report. Becoming visible settles at once. The layout check
  covers the sheet with an expedition out, five engineers plus a keepsake at
  424×924 (browser and installed PWA), and the welcome card with a find. Trouble
  is shown on the machine's bay and on its row in the Buys drawer (`crew-panel`,
  #373): a warm shout ("Cave-in! · Hold to fix"), five taps or a short hold,
  then "Fixed! The crew cheers." in the drawer's kick. A tier with no bay lights
  the Buys key's red lamp. The layout check covers that row at 424×924,
  including the installed PWA. Built (#149).
- Designed twice: expeditions as a negative-speed tier in `TIERS` was rejected (it leaks into buying, cards and the sim's value function). Separate modules that feed `effectiveRates` keep it the one place multipliers meet.
