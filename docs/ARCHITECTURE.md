# Architecture

Review for M5 (#115). The game is a small, framework-free TypeScript app. This
page is the map, plus the rules that keep it that way.

## Layers (imports point down only)

1. **Rules of the game (pure, no DOM):** `scale` → `mountain`, `tiers`,
   `relics`, `layers`, `stock`, `upgrades`, `boosts`, `veins`, `crew`, `line`, `workforce`, `piles`, `mine-piles`, `city`, `building-site`, `transport`, `rates` (the one place
   every multiplier is applied: live ticks, away pay, taps, the UI), and
   `field-log` (a JSON snapshot and an event ring). `stock` (#560) is the
   goods table (stones, then each band's material, with where it comes from),
   the mountain's one `stock` record of them, and the `Price` every buy asks: a
   short list of goods and amounts. It is the one module that pays (`pay`,
   which refuses unless every line is covered), adds (`add`), refunds and
   takes back; the rules modules quote a `Price` (`tierPrice`, `upgradePrice`,
   `boostPrice`, `promotePrice`, `recipePrice`) and never subtract a good
   themselves. `rates.exactCrewPerSecond`
   is the crew speed before the whole-stone floor. `economy/actions` lists
   every legal move, including a craft and a cancel, applies the existing
   functions, and values income from that speed, taps, and away pay. A `Move`
   is an `Action` or a screen-only move (a dig, a vein tap, a seen mark, or
   Buys' ×10 and Max, `buyTiers`: several card buys in one move, all or
   nothing, logged as one `tier.buy` with the final count, #358), and
   `applyMove` is the one place the UI changes the mountain, and the lab's
   `applyAction` too (#409). The lab's runner and the pacing sim still call some
   rule functions directly (`promote`, `buyBoost`, `send`, `tendBestTier`),
   which R1 (#420) folds in. A lasting upgrade's buy and a promotion carry the
   price the player was shown (`price`), and a different price today refuses
   the move: a band crossed while the tap settles the crew cannot charge more
   (#367). Both prices are a `Price`, and every good must match (`samePrice`).
   `listActions` quotes today's price. It says `applied` (with what the move spent and
   gained, good by good, as two stock records, #560) or `refused`, and it holds the UI's rules too: a worker bought beside an idle
   machine marks staffing taught, a real station marks tending taught and first
   calls a party back, and a recall with no expedition sends the hand to camp. A craft's
   payback adds the bench time. `lab/world` steps one seeded clock for the
   pacing sim and the strategy lab through the game's own time step
   (`session-time`'s `advance`: parties due come home, the crew is paid, then
   the hazards step; away time pays the capped gap and clears trouble), so the
   lab and the game advance the world identically (#414). `lab/targets` is the only place a lab threshold lives.
   `lab/measures` is one file per decision measure. `lab/policies` is one
   file per player type. `lab/registry` discovers both folders; the world
   never reads the filesystem. `lab/run` plays a policy on that clock.
   `lab/tournament` runs every policy it is given across the seeds it is
   given and scores every measure. `lab/guardrails` turns `targets.ts` into
   one check per entry. `tools/strategy-lab.ts` (`npm run lab`) loads the
   registries, writes the report, and warns on a miss unless `LAB_STRICT=1`.
   `lab/ledger` keeps each run's pacing ledger row (#554); `--ledger check`
   compares the run with the committed `docs/pacing-ledger.md` and fails on a
   difference, and `--ledger write` (`npm run lab:ledger`) writes it. The
   ledger is one of the lab's inputs (`LAB_ENTRIES`), so a changed ledger
   runs the lab again. `economy/invariants.test.ts` (#555, fast-check, in the
   `unit` project) plays random legal moves, live waits, trouble and time away
   from a save in each band and in a fresh mine (#654: orders, wagons and deliveries), and checks after each step that counts stay whole
   and finite, lifetime figures never fall, an upgrade or a promotion spends
   its shown price and a machine or boost spends some stones, a buy of a
   machine, upgrade, boost or craft never slows the crew, and the save
   round-trips. It also checks, in every band, that time away inside the
   full-pay length pays the same however it is sliced, once each stretch's
   Heart of Patience bonus is divided out (a long absence earns more, by
   design), and that an absence into a new band pays what the same absence
   split at the crossing pays (#592). Its known gap (part-stone) is listed at
   its top, pinned by its own test.
   The full gate (`npm run check`, run on the PR's final commit before the merge) runs the strategy lab and
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
   Every number lives here. The drawers read two display rules, none of
   which imports art: `row-view` (types only: one `RowView` for every drawer
   row: its words as fit options, lamp, state, and whether a tap acts; every
   row module sets its lamp by the one lamp rule in `docs/DESIGN.md`, #509)
   and `upgrade-rows` (a lasting upgrade's row, which the stage list reads).
   The board's display rules (`ready-now`, `machine-bays`, `buys-rows`,
   `workshop-rows`, `workshop-sheet`, `key-rail`, and the boost and
   found-tool rows) went with the board (#727).
2. **Saves:** `persist` (the version 9 envelope and `readSave`'s four
   answers, #558), `save-format` (the game map: the one place the saved shape
   meets the complete mountain; `writeGame` leaves out what is zero or empty,
   `readGame` fills it back in, and `shippedFacts` is the ledger of what has
   shipped), `session-save` (guest storage), `phone-backup` (signed-in on-phone
   copy, never deleted), `save-progress` (which copy is ahead), `cloud-save`
   (interface + memory fake), `firebase-save` (the SDK adapter: `games/{uid}`,
   `gameArchive/{uid}/copies` and `fieldLogs/{uid}/devices/{deviceId}`),
   `firestore.rules` (the envelope and the field log, guarded by
   `rules-drift.test.ts` and the emulator tests). See [The save](#the-save-558).
3. **State:** `progress-store` composes a pure session core and a sync
   service (#414), and is the store's public surface. The UI changes the game
   only with `dispatch(move)`, which settles the crew, runs `applyMove` with the
   clock and the trouble as that settle left them, and commits, and says
   `applied` (spent and gained, each a stock record) or `refused` (`not-playing` or `no-change`) (#409).
   `applyMove` also returns the move's typed events (`MoveEvent`), and `dispatch`
   records them in the field log; a refused move has none (#413).
   `session` is the core: `step(session, input, now)` returns the next session
   and its effects as data (record, log, remember the homecomings, save a
   band's recipe grant, the move's result). It covers ticks, away pay, moves,
   trouble presses and fixes, the news and a new run. The `Mountain` it holds
   is complete (#415): every field is present, with 0 for a cold clock or a
   boost that never ran, and `undefined` only for a free bench. A loaded save
   is played as it was: no grant is added on load (#558). The news is one
   queue of typed `Notice`s (away, quiet, reveal, layer, craft), in arrival
   order; screens read it with `firstNotice` and
   `noticesOf`, and `dismiss(kind)` closes the oldest of a kind (`"away"`
   closes the whole welcome card). Homecomings stay their own list, since the
   device remembers them across a reload. `session-time`'s `advance` is the
   one time step it and the lab share: live, away (a gap over ten seconds), or
   a clock that went back (`timeInput`). A craft notice keeps the mountain at
   the moment it was fitted. The sync service runs
   the effects through the ports, as functions over one `StoreContext`
   (`store-context`): `store-session` (run a step, emit one snapshot),
   `store-actions` (tick, moves, trouble taps, a new run, hide, dispose),
   `local-saves` (the guest session save and the phone backup, both written on
   each move and kept current on each tick, the guest's only once a guest save
   exists; the homecomings key), `cloud-writer` (the write pipeline and the field log copy),
   `save-adopt` (fast-forward or open the conflict sheet, recover a refused
   rev), `server-read` (the fresh read on resume), `save-load` (each cloud
   snapshot as it arrives), `save-watch` (the account and the writer seat) and
   `save-choice` (choose a side, restore a copy). The cloud write state is one
   union, `CloudWrite` (`clean`, `dirty`, `queued` to wait out the gap,
   `flying` with a newer change `waiting` or not), and what the device knows
   of the server is another, `ServerRead` (`unseen`, `seen`, or `holding`
   for a fresh read). None of them imports a screen module.
   `applyMutation` and `layoutPreview` (the layout check's trouble and conflict
   sheet, `?trouble=cave-in` and `?saves=two`, with the sheet's mountains in
   `save-preview`) are test seams: ESLint (`no-restricted-properties`) bans
   them in non-test `src`, except `layoutPreview` in `boot`. The store owns settling time, away
   pay, reveals, setting an older save aside, and when/where to save. A rejected cloud write
   keeps that mountain, shows the save error, retries once, and records the
   server error on `save.error`. A snapshot is adopted only when it is strictly
   ahead (#219, #222). Ahead means a later run (`startedAt`, missing counts as 0),
   else more rock dug in all (`rockDugInAll`: stones mined from the mountain plus
   `rockDug`, the rock drilling dug in a fresh mine, saved as `run.rock`), else a
   newer `lastSeen`. A tie between two real copies
   keeps the phone and does not upload. A phone that has never saved is not a
   copy, so the cloud document is kept: a new fresh mine's worker and horse
   wagon are its start, not progress (`anyProgress` counts past the start's,
   #664). The phone backup is the full save, written when the mountain
   changes and synchronously on hide and pagehide, and it is never deleted.
   Launch keeps whichever of the phone and the cloud is ahead, and uploads when
   the phone was ahead. A snapshot of our own write is ignored. A listener error
   restarts the watch with backoff (1s, then double, cap 30s) and does not stop
   saving. Becoming visible reads the server (`getDocFromServer`) before the
   next cloud write. The read gives up after 5s, logs `save.resume` timeout,
   and lets the crew settle; the next server snapshot (or the same backoff
   as a listener retry) releases the held write. The phone backup still
   records during that read, and a tap in the gap is dug back onto the merged
   mountain. The same account reported again (a token refresh) changes
   nothing. A real account change ends the old watch's held read, its give-up
   timer and retry, and any write still in flight, so the new account loads
   and saves; their late answers are dropped (#481). One tab holds the writer seat (Web Locks, or a localStorage
   lease and a BroadcastChannel). Pagehide, including Reload, flushes the
   save and then clears that lease and the lock. A back/forward-cache
   restore (`pageshow` with `persisted`) claims the seat again. A tab that
   found the seat taken re-checks every half lease; an expired lease, or a
   Web Lock it actually holds, makes it the writer without Play here. A
   stale lease does not override a held lock.
   The others show the other-tab board card, "Playing in another tab", and do not write. Play here asks
   the writer to flush, then takes the seat. Firestore's `persistentLocalCache`
   with `persistentMultipleTabManager` is a second copy of the server doc in
   IndexedDB, not a second save: a cached or pending snapshot does not move
   `rev`, and a fresh read still asks the server. The screen only calls its methods.
4. **Screen:** since part 1 was switched on (#664), `main` mounts the frame
   (`mountFrameScreen`, `frame-screen`, see Slice 1's frame below) for
   everyone, and `createAppServices` holds the fresh mine's switch on for the
   page. Today's board, its composition root (`mountain-screen` and its
   `screen-*` parts) and the panels only it used (the key rail, the bays,
   Buys, the gauge row, the Ready row, the crew, Engineers, Workshop, relic,
   welcome and arrival panels) are deleted (#727). What the frame still
   shares with it:
   - **The board's model.** `board-host` is the one place the model
     (`board-interaction`) meets the clock: it keeps the model's state, steps
     it on every input and press, and holds the single timer that wakes the
     painters when the view next changes (a hold ending, a blink frame, a
     thanks going). Its clock is `performance.now` by default, not the game
     clock a gate run stops. `eventAge` reads how long an event waited before
     its handler ran, so a busy phone's late handler still judges by when the
     finger came down. Every press keeps `card-tap`'s one `trackPress`
     (`pressOnBoard` wraps it for a control on the board's layer): a press is
     judged by when its finger came down, and a finger's click (`detail` not 0) with no pointerdown of its own by the click's age. A keyboard press
     (`detail` 0) is never early. `DRAWER_SETTLE_MS` (400ms) is every
     drawer's and card's guard: a press within it of an opening, or of a
     `page()`, does nothing, so the second tap of a double tap never acts.
   - **Drawers.** `board-drawer` is `createBoardSheet` (the shell: head with
     the "i", the list, the spare plate, Back, the slide, Escape and the
     thanks) and `createSheetScrim` (a tap closes the drawer). The shell
     holds no timer and no judge: it sends the model `open`, `close`, `page`
     and `layout` and paints the view. `BoardSheet.page()` says "a new screen
     under the finger" and starts the settle again; `showPage(page)` puts a
     page in the list's place (the head and Back stay) and focuses its first
     control. Each close says what closed it (`finger`, `keyboard`,
     `tap-through` or `program`); one that restores focus gives it to the key
     the drawer opened from, or to `fallbackFocus` while that key is
     disabled. Escape listens in the capture phase, so with the save drawer
     over a drawer it closes only the save drawer. `board-how-art` draws the
     How it works cards in the drawer skin. `board-row` is one drawer row
     (lamp, icon, name and badge, info, need, why, flag, gain, price tag and
     verb), built once and reused, writing only what changed, and painting
     "Done" and the red blink from the model (`rowsOnBoard`). `row-view` is
     its view type (the one lamp rule in `docs/DESIGN.md`, #509).
     `board-dom` holds the shared `el`, `write`, `setAttr`, `scrollIntoList`,
     `fitFirst` (a measure-once line fitter) and `writeFigures` (#506: each
     figure bold and bright among quiet words) helpers.
   - **Cards.** The board cards (#464, #466) are built on one shell,
     `board-card`: `save-conflict-panel` (the save conflict),
     `screen-prompts` (the other tab and the update, mounted by
     `frame-save-cards`) and `saved-copies-panel` (Saved copies: an inset per
     copy, built once per copy and rewritten line by line, in a list that
     scrolls inside the face). The shell is a shaded `div.board-card` with
     its hook class, title id and `data-card`, a framed face, `cardLine` and
     `cardArt` (2x), big plates (`plate`) and other controls (`press`) that
     press through `pressOnBoard` on the card's own layer, `show(on, focus)`
     (`showCard`, which writes `card-state`, and the focus once as it
     opens) and `page()` (a new screen that settles again). A card the
     player opened passes `dismiss`, which Escape runs, and `from(opener)`:
     the card gives the focus back there. `legacy-panel` keeps the Pass the
     mine card, which nothing mounts in a fresh mine; it goes with the pass
     and Legacy (#729).
   - **The Ledger.** `ledger-panel` builds the Ledger drawer (#375) on the
     shell, from `ledger-rows`' pure views (`tonightLines`: this run's field
     log since the last Start over, newest three, each code worded by one
     table or skipped; the mine's rows, the account row) and `ledger-parts`
     (the Tonight box, the plates and the two pages, on `board-page`). Its
     head key is `sound`'s (#491): `soundSetting` reads and keeps this
     device's choice (`dad-friendly-sound`, never in the save; Quiet when the
     store throws), `createSoundKey` turns it through the board's model, and
     `playHammer` is the knock. Start over asks on one page (Keep first, so
     it takes the focus; Yes calls `progress.startOver()`, then closes onto
     the key, and if it was refused the page says `SAVE_CONFLICT_ERROR`
     instead); the field log shows on the other when `writeClipboard` says
     no. Copy field log's `Copied` is the board model's `result` and hold, as
     a row's Done. Saved copies closes the drawer without moving focus and
     opens its card, which gives the focus back to the key. Tonight reads
     `progress.tonightEvents()` only while the drawer is open: a run's start,
     a reload, and a copy from elsewhere taking the mountain's place move its
     mark up, while the field log keeps them all. Another account's save
     loading leaves the drawer open with the mine rows dark and Copy field
     log, Start over and Yes disabled; the same account reported again leaves
     it as it was (#481). A clipboard answer that comes after the drawer shut
     shows nothing. `frame-ledger` mounts it on the frame (below), and
     `ledger-panel.test.ts` plays it there.
   - **The rest.** `board-save` is the save line (it keeps `.save-status`
     with `data-kind` and `data-log`) and its save drawer. `board-fit` is the
     scale that fits the 424×924 stage inside the window and its
     `env(safe-area-inset-*)` (1 at 424×924 with no insets, so the art stays
     at exactly 2×); `main` calls `trackBoardFit`, which keeps
     `--board-scale` in step with the window. The game is phone-only (#498):
     a wider window gets the same board, scaled and centred. `board-skin` is
     the 9-slice plan that draws a frame, tag or key skin on a canvas behind
     its element. `board-relics` is the relic art, which the How it works cards
     and the Ledger still read. `board-window` is the frame clock
     (`runBoardLoop`) that `scene-paint` runs, and `float-text` says whether
     the device asks for reduced motion. The board's mine window, its
     machines, the relic plate and its note went with the board (#727). `buys-amount`
     is the device's one amount (`deviceAmount`, `paintAmountKey`), kept in
     device storage, never in the save. `upgrade-rows` is the upgrade rows'
     view the stage list reads. Shared player-facing wording lives in
     `screen-words`. The app's styles are `src/tokens.css` and
     `src/board.css`.

## The save (#558)

One shape everywhere: the guest save (`dad-friendly-game` in localStorage),
the phone backup (`dad-friendly-game-backup:{uid}`), the cloud document
(`games/{uid}`) and Saved copies (`gameArchive/{uid}/copies`). The keys and
paths from before version 8 are never read or written again; the old cloud
paths are read-only.

- **The envelope** (`persist.ts`): `version` (9 since #664, the switch to
  the fresh mine; 8 was today's game), `lastSeen`, `startedAt`
  (left out at 0), `rev` and `deviceId` (both or neither), `deviceLabel`, and
  `game`. The rules check only this: `version >= 9` and never lower than the
  stored one, `rev` one past the stored one, `startedAt` never lower,
  `savedAt == request.time`, the device id and label sizes, `game` a map, and
  no other key. A new game fact never needs a rules change.
- **The game map** (`save-format.ts`): `owned` (by tier id), `stock` (stones
  and the four materials), `levels` (upgrade and recipe levels), `clocks`
  (boost ends, craft timers and the Gold rush), `marks` (`seen`, `taught`,
  `recipes`, `finds`, `operational`), `run` (`generation`, `stretch`, `dug`, `rushBank`, `rock`: rock dug in all, #664),
  `engineers` (post `"tunnel"` while away), `expeditions` (each with the
  `home` post), `bench`, `fleet` (by vehicle id, #654), `jobs` (workers by job,
  #689), `piles` (the drilled rock, the rock at the shaft and the rock at the
  kilns, whole and with no upper bound, #703, #666), `makers` (by maker id,
  #666), `stockyard` (its level, a whole number up to the ledger's `stockyard` cap, #666) and `project` (the
  building, `state` `delivering` or `onHold`, `step` 0 to 2, the goods
  `arrived` and what of them is `onSite`, not yet built in (#690); left out
  while nothing is ordered), with `operational` buildings in `marks`. A
  project for a building that already stands or is not the next one, a step
  past the roof, more on the site than arrived or than it holds, or a step
  whose goods are all built in reads `bad`.
  Zero and empty are left out; a missing key reads
  as its default, so a new fact needs no version bump. `dug` is the stones
  mined, rounded so the stones left round up.
- **Four answers** (`readSave`): `ok` plays. `newer` came from a later build:
  a version above 9, or a right-typed value this build refuses (an unknown id,
  key or named value, a count past its cap). The store then holds play
  (`playBlock` `"newer"`), records and logs `save.newer`, shows the update
  card once, and writes nothing to the cloud, the phone or the archive
  (`canWrite`). `older` came before version 9: it is set aside (below).
  `bad` is nonsense (a wrong type, a negative, a broken number, a missing
  envelope field) and reads like no save. `bad` wins over `newer`.
- **The ledger** (`save-ledger.test.ts`): every id, named value and cap that
  has shipped. Adding a line is fine. Removing one or lowering a cap needs a
  version bump, or an older save would read `newer` on a build that should
  play it.
- **Every writer reads back what it sends** (`save-shape`): a save that
  would not read `ok` goes to neither the cloud, the phone backup nor the
  guest key; `save.shape` is logged once as an error and the save line shows
  the error.
- **A reset sets the old save aside.** An `older` guest save or phone backup
  moves byte for byte to `{key}:v{version}`. An `older` cloud copy holds the
  board while it goes to Saved copies as it was stored (`archiveRaw`, reason
  `reset`, within the archive wait); a copy that does not land keeps the hold
  and logs `save.archive`. A move on the phone that fails (a full phone)
  holds that key: nothing writes or clears it, and the next open tries again.
  Then `resetFresh` keeps a played copy of this version in play, or else puts
  a fresh mountain in play, stamped with the latest of the old runs, so it is
  never an earlier run than the one it replaced, and the cloud gets it at the
  old rev plus one.
  `save.set-aside` starts Tonight again. While nothing is played on it, the
  fresh mountain is not a copy (`blankReset`): a device that played the same
  run is ahead, and a cloud copy that ties it is kept.
- A sliver that resets the save says "Resets the save" in its issue and PR
  body first (`dad-friendly-work.md`).

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
     (#122, #123); since #465 one board drawer, `relics`, with its words in
     `relic-rows` and its detail, reveal and Legend pages in `relic-pages`.
     It has no key: the Relic shelf key in a socket's note opens the shelf,
     and the reveal and the Legend open it themselves once no card is up. A
     player's close of the reveal carries the relic; a program close (a card
     came up over it) does not, so it comes back after the card.
  3. Welcome-back card → `welcome-panel` (#124); on `board-card` since #464,
     with its views in `card-views`.
  4. Menu, account and Start over confirm → `menu-panel` (#125); since #375
     the Ledger drawer, `ledger-panel`.
  5. Tier grid and crew line → `crew-panel`; the purchase float moved to
     `float-text` (#126).

  That split brought `mountain-screen.ts` to about 460 lines: layout, the dig
  and vein taps, the guide bar, save status, and wiring the panels. It has since
  regrown to about 1,240 lines, with `mountMountainScreen` at 1,112. #411 moves
  its interaction rules out. #431 split the rest into `screen-*` modules:
  `mountMountainScreen` is a composition root within 150 lines. The board,
  `mountain-screen` and its parts were deleted in #727.

- **Board tap rules (#410, #425, #426):** `board-interaction` is a pure reducer that
  holds the board's tap rules once, run through `board-host`. The Ledger
  drawer, its shell and rows, the frame's sheets and the board cards are
  painters of its view (the Buys, Upgrades, Workshop and Engineers drawers,
  the key rail, the Ready now plate and the machine bays were too, until
  #727): they send it inputs and presses and read `boardView`; none holds a
  settle, a hold, a timer or a freeze of its own. Every board control's "is
  down" look goes through `pressLook` (in `card-tap`), and each part paints
  its own look. `pressOnBoard` (in `card-tap`) is the one board press: it
  tracks a control's finger-down time, sends the model the press (the
  control, who pressed, the finger's `downAt` and the click) and hands back
  its decision. Its `control` is a `ControlRef` or a function of the click
  (a click on none presses nothing), and an optional `intent` marks a
  trouble press. The model:
  - the 400ms settle after a drawer opens or turns a page, and after a
    finger closes a drawer (Back), for what that close shows again (named
    fix 1). The save drawer and the board notes never settle, and a
    tap-through close (the scrim, a tap outside a note) hands its tap on;
  - the 1.9s Done hold: every press judged before it ends is held, judged by
    when the finger came down (named fix 2), so a press handled after the
    hold whose finger came down inside it is held too. A row's Done, and the
    Ledger's Copied, are this hold, not a timer of their own;
  - the red, off, red, off blink on a tap that cannot act;
  - the freeze of an open drawer's layout, its parts in order and its chip
    rows, and the blink on a part it holds but no longer sells. A drawer
    whose rows show or hide in place lists every row, hidden ones too. The
    `unloaded` input (a save loading again) keeps an open drawer's freeze,
    forgets the latest layouts and ends every Done hold. The old screen sent
    it on each ready to not-ready edge; nothing sends it since #727;
  - the 1.6s thanks after a fix (`fixed`), which the board's bays painted
    until #727;
  - the overlay stack: a drawer takes the place of every other drawer, the
    save drawer and a note, but keeps the cards up under it; the save drawer
    and a note go on top;
  - the board cards (#464, `CardId`): a card's open and close are model
    events. A card settles for `DRAWER_SETTLE_MS` after it opens or pages,
    as a drawer does, goes on top of the stack, and its close takes only its
    own entry off, never what stands above it (conflict and update up
    together, the conflict resolves, the update stays and still settles). A
    card is not a drawer, and a drawer closed under a card leaves the card
    on the stack.

  Inputs carry their own times (`pressedAt` for when the finger came down,
  `at` for when the handler ran), and `boardView(state, at)` derives what is
  open, held, blinking, thanked and frozen. `nextWake` gives the one time to
  read it again, so no timer lives in the rules. The timing values
  (`DRAWER_SETTLE_MS`, `READY_HOLD_MS`, `BLINK_STEP_MS`, `THANKS_MS`,
  `PRESS_AGE_LIMIT_MS`) live here, and the board parts import them. The
  module has one wiring: `board-host` steps it, and the drawers and rows
  paint from it (#425, #426). A seeded random-sequence test
  (`board-interaction.random.test.ts`) holds its invariants: no act inside a
  settle or a hold, and no open drawer's rows move. It has a 100% coverage
  floor.

- **Panel contract (gone with the board, #727):** the board's panels got
  `dispatch`, `getView`, `now` and `requestRender`, and laid out round the
  board's absolute children (the top, the gauge row, the bays, the Ready row,
  the key rail). The frame's sheets paint pure views instead (Slice 1's
  frame, below); the Ledger drawer keeps the panel shape.

## Guards (#118)

- `npm run cycles`: no runtime import cycles in `src`.
- `rules-drift.test.ts`: `firestore.rules` allows exactly the `Mountain` save
  fields (a `Required<Mountain>` sample makes a new field a type error until
  listed), every upgrade id with its max level, and every boost id.
- `knip` (strict): no unused files, exports or dependencies.
- `prettier --check .` covers docs too; coverage floors per critical module. The fast tier runs `prettier --check` on every file changed since `origin/main` (`format:changed`).
- Scheduling (#403): independent steps run in parallel, but the heavy lane (`visual`, `journeys`, `lab`, `lab:generations`, each filling every core) runs one at a time, visual first, so the timing checks never run under the labs' load. The labs are seeded, so a green run records the sha256 of its inputs (the lab's import closure, `package-lock.json`, the Node version, and the step's command, args and env) in `.gate/reuse/<step>.json`. A later run with the same inputs prints `reused (same inputs passed on <sha>)` instead of running, and counts as green for signoff. A red run deletes its record, and CI starts with none.
- `scripts/function-limits.mjs` (`npm run functions`, both gate tiers, #408,
  #418, #422): every function in non-test `src` is held to two measures, 150
  lines and a cognitive complexity of 15 (`sonarjs/cognitive-complexity` from
  `eslint-plugin-sonarjs`, run through the ESLint Node API without type
  information by `complexityLinter`, and mapped to functions by their heads).
  Any function over a limit fails the step. There is no allow-list. Rules in
  `src/function-limits.ts`; every function-like node counts, nested and
  anonymous ones included.
- `scripts/token-check.mjs` (part of `npm run check`): CSS added since `origin/main` uses `src/tokens.css`. A raw colour, a raw px size, or a tap target under 48px fails. CSS already on main is the allow-list. Mockups are not part of the check.
- The browser harness (#438): `tools/browser/harness.ts` is the one home for
  driving Chrome. It starts the Vite server (`startServer`, skipped when a URL
  is given), finds and launches Chrome (`chromePath`, `launchChrome`), and
  opens pages (`open`, `openPair` for two tabs, `newWindow` for a bare page).
  It also seeds a save and controls the page clocks, and presses and holds a
  control as a phone tap (`press`, `holdThrough`,
  `stepTapClock`). Each script chooses its own options: the visual check seeds
  once a tab and can stop `Date.now` and hold the tap clock, the UI audit
  seeds on every load, `play` seeds once, and the mockup check seeds nothing.
  `play -- --tabs 2` opens the save with `openPair` and plays the second
  tab, which shows the other-tab card (#464). `play`, the UI audit and the
  visual check open the phone only (#498). The dev-only boot hooks
  (`parseBootOptions` in `boot`) let the scripts see what a save cannot
  hold: `?saves=two` (the save conflict), `?trouble=cave-in`,
  `?save=loading` or `error`, `?copies=shelf`, `?memorySave=1`, and
  `?update=shown` (the update card, as a newer service worker opens it).
  Outside dev they are ignored.
  `visual-check`, `ui-audit`, `play`, `mockup-check` and `env-report` all use
  it. The saves they seed come from `tools/browser/fixtures.ts` (#439), typed
  as `SeedSave`; no script writes a versioned save literal, and
  `fixtures.test.ts` pins every save's value.
- Gameplay journeys (#552, on the frame since #664): Playwright Test
  (`@playwright/test`, pinned) drives a phone-sized Chrome (424×924, touch)
  through stored player journeys, `tools/journeys/*.journey.ts`: the first
  evening (a fresh mine with one worker, from the first evening's card to the
  Light Tower's roof and the end card, the spec's journey for part 1), back
  after eight hours (a busy fresh mine: the shift report, then what the rules
  pay), kill the tab and reopen (#553: the renderer crashes through CDP
  `Page.crash`, so no pagehide or unload handler runs, and a new tab opens the
  same moment), and the tab left open all night (the clock jumps eight hours
  at once on an open tab, and the frame pays what a cold open of the same save
  pays on a second phone, `otherPhone()`). A kill while the mine works with no
  move since also reopens the same moment: once a guest save exists, each tick
  writes it quietly, as each tick writes the signed-in phone backup (#573).
  `npm run journeys` runs them, and the full gate's `journeys` step (heavy
  lane) does too; a failure keeps a trace in `.gate/journeys/`. The config
  (`tools/journeys/playwright.config.ts`) starts its own Vite on port 4186 and
  launches the same Chrome as the harness (`chromePath`), so no browser is
  downloaded. One player driver, `tools/journeys/player.ts`, holds every
  selector: it seeds a save from `tools/browser/fixtures.ts` (a fresh mine's
  document as a guest's, `asGuest`), puts in a seeded `Math.random` (the
  sweep's `createRng`), and installs Playwright's clock paused at 9 pm, all
  before the page boots; it closes the frame's cards, and makes a move the way
  a dad does (`act`): the hire key, a stage's machine key in the mine, a job's
  − or + on its stage row or the city's plates, the order key and the wagon
  key. Whole-tick waits jump the clock a tick at a time (`clock.fastForward`),
  so the game's one-second tick runs as it would; `jump` moves it at once,
  and the tick then folds the whole stretch in. A journey never types an
  expected number: `Expected` (`tools/journeys/expected.ts`) holds the fresh
  mine's switch as the page does, and steps the game's own session
  (`createSession` and `step` in `src/session.ts`, opened step for step as
  `openSession`) beside the page on the same clock, so a retune moves both;
  its `plan` is the lab's part 1 dad (`freshPlan` in `lab/fresh-dad`, never
  holding, no upgrades), so the first evening plays what the lab plays. A
  journey turns red when the page does not follow the rules (the store, the
  screen, its timers and wiring); a wrong rule is the unit tests' and the
  labs' to catch. The readouts a journey reads carry their exact number as a
  data attribute: the stockpile's `.frame-pile-count` `data-count` is the
  stone in the stock. There is no debug object on `window`. The visual check
  and `npm run play` stay on puppeteer-core.
- The visual check (#440): `scripts/visual-check.mjs` is only the runner.
  Since #664 its sections are the frame's (`frame.mjs`: each site on each
  play save, the cards, the Ledger and the start) and the save's (`saves.mjs`:
  the save line in each of its words with its drawer, and the save's cards in
  the `board cards` table: two saves, the update, a later build's save and the
  other tab, at 424×924 and 424×830); today's board's modules went with the
  board. It imports the section modules in `scripts/visual/` in queue order, then runs
  the queue `VISUAL_JOBS` at a time and sets the exit code. Three modules are
  shared: `registry.mjs` (`section`, `check` and the failures), `kit.mjs` (the
  browser plumbing: the server, Chrome, the sizes, `openScreen`, `press`, the
  drawer and shelf openers, and the waits) and `measure.mjs` (the board's
  targets, type, contrast, 2x art, drawer facts, `cardFacts`, a board
  card's face box, inner scroll, plates and focus). A fact the sections read
  off the page goes in `measure.mjs`, even when two modules share it. Each
  other module checks one part of the board or one group of screens, registers
  its sections when imported, and imports no other section module. Every
  section module imports `kit.mjs`, even when it uses no kit name: kit's
  top-level await is what keeps the sections registering in the runner's
  import order. A new check goes in the module of the part it checks.
- Tables and controls (#441): `registry.mjs` also has `table()`, which turns
  screens × scenarios × rows × expectations into sections and checks, with
  each label built from data. The save's cards are a table (`board cards` in
  `saves.mjs`), each card checked for the shade down to the save line, no
  scroll, `cardFacts`, fat plates, 13px text, 2x art, contrast and the focus as
  it opens. `coversBoard` (in `kit.mjs`) takes an overlay that is fixed or
  absolute in the board. These modules wait on page
  state, page events or a count of painted frames, never on a fixed sleep.
- Signoff (#397): a green `npm run check` on a clean, committed HEAD writes `.gate/passed`. `npm run gate -- signoff` (`scripts/signoff.mjs`, rules in `src/signoff.ts`) starts `.github/workflows/signoff.yml`, which posts the `signoff` commit status on the head; the ruleset on `main` requires it, but not an up-to-date branch (#617). The relay exists because cloud sessions may not post statuses. `deploy-hosting` runs `npm run check` on the merged commit before it deploys, so a red `main` deploys nothing.
- Merge check (#617): "Require branches to be up to date" made every merge send every other open PR back for a merge of `main`, a new head and a new 10-14 minute full gate, so PRs merged one at a time (GitHub's merge queue is offered only to organisation-owned repos). Instead, `.github/workflows/merge-check.yml` merges each open PR into the current `main` and runs `npm run gate -- merge` (the `merge` tier: both typechecks, function limits, lint, cycles, format, knip, tokens and `vitest run --project unit`, about 1.5 minutes), on every PR push and for every open PR whenever `main` moves. Its `targets` job lists the PRs and sets the `merge-check` status pending on each head; a `check` job per PR (read-only token, since it runs the PR's code) merges and runs the tier, and keeps its answer as an artifact; `report` (statuses only, runs no PR code) posts green or red on each head, naming the `main` commit tested, unless `main` has moved since, when the newer run posts; if `main` moves while it posts, it sets them pending again. A newer push to a PR cancels that PR's older run, and a newer `main` cancels the older `main` run (a run for a PR push is not cancelled by a new `main`, hence the re-check after posting). A failed `npm ci` on the merged tree (two lock file edits that merge cleanly) counts as a break. The slow checks of a combination run only in `deploy-hosting`, so `main` can still go red there: `merge-check` also runs when a `deploy-hosting` run finishes and main's colour changed, and while the newest finished deploy gate on `main` failed, `targets` posts "main is red" (failure) on every open PR but those labelled `fixes-main`, which are checked as usual so the fix can merge, until a green deploy turns them back; `report` reads the deploy colour again before it posts, so a slower run never covers a red with a green. A finished deploy's run has its own concurrency group, so it never cancels a `main` run mid-check, and a label other than `fixes-main` runs nothing and cancels nothing. Only PRs against `main` are checked; forks and drafts are not. The ruleset requires `merge-check` in place of the up-to-date rule, so a PR's head, and with it `signoff` and `claude-review`, stand when another PR merges. The browsers, the emulator and the labs of the combination run in `deploy-hosting`'s full gate before anything ships.
- Claude review (#572): `.github/workflows/claude-review.yml` reviews a PR when it is opened, reopened or marked ready for review. After each push it re-checks (#585, `tools/review/recheck.ts`): every posted review carries a hidden marker with the commit it covered; when the PR's own change is the same as at that commit (only `main` merged in, compared with blob ids and hunk positions dropped), the review stands with no model call; otherwise the reviewer is told to judge only `review-git diff --since-last` and gets the review threads and their replies as data, and posts new findings only. A PR opens after the fast gate, so this runs while the full gate does; the full gate and signoff run once on the final commit. The job also sets the commit status `claude-review` on the head (#587): pending from its first step, and in an `always()` last step green once the review posted, was kept, or was skipped (art only, credit used up, no secret), red when it failed or was stopped. It is a required check on `main` (the `signoff` ruleset, source GitHub Actions, since 14 Nov 2026), so a merge cannot race the review, while an empty credit never blocks one. The `main-protection` ruleset also requires every review thread to be resolved. It runs `claude -p --bare` (Opus 5.5, `--max-budget-usd 2`) with the `ANTHROPIC_API_KEY` secret from the Console organization linked to Flemming's plan, whose monthly API credit pays for it; the official `claude-code-action` is not used because that credit does not cover its runs. Claude gets only Read (inside the checkout) and a shell that runs one program, `review-git` (`tools/review/git.ts`, #583), and answers in a fixed shape (`--json-schema`): a summary, and findings with a severity, path, line, title and body. That wrapper takes fixed subcommands (diff, log, show, grep, ls-files) with a few options of its own and builds git's arguments itself, with the pattern after `-e`, revisions after `--end-of-options` and paths after `--`, because git's own options can start a program (`grep -O`) or write a file (`--output`) and a prefix rule in `--allowedTools` cannot keep them out. Like the prompt, it comes from the base commit. Its prompt is built by `tools/review/prompt.ts` (#582): the workflow lists the changed paths (renames as a delete and an add, so a moved file keeps its lens), and `lensesFor` picks the lenses, most important first: guards (`.github/`, `.claude/`, `CLAUDE.md`, the review job, the gate, signoff, function-limit, token, visual and rules-test scripts, lint, TypeScript, Vitest and coverage config, `src/lab/targets.ts` and `guardrails.ts`, the journeys, every `*.test.ts` and snapshot), save (save, persist, backup and cloud files, the progress store, server read, tab writer and lease, the log, the store actions and session, boot, `main.ts` and the mountain screen that register the hide saves, `firestore.rules`, `firebase.json`, `public/sw.js`, `rules-test/`), code (other `src/`, `tools/`, `scripts/` files, and any text file no other lens takes), game (`src/economy/`, `src/lab/`, the tier, rate, scale, milestone, line, engineer, upgrade, workshop, hazard, vein, mountain, gold rush, crew rate, pacing, legacy, relic and haulage modules, the `*words.ts` copy) and spec (`docs/`, `mockups/`, `README.md`). The lens texts are `.github/review/<lens>.md`, joined into `.github/review/prompt.md`, and the PR's title, body and the body of each issue it closes are added at the end inside `<pr-intent>`, as data. A PR of art and other binary files only gets no model call, just a note that it was not reviewed. The prompt and lenses come from the PR's base commit (#576), so an older branch still has them and a PR cannot edit the review it gets; a base without them fails the job, with a note on the PR. The next step turns the answer into one PR review with `tools/review/findings.ts` (#584), also from the base: the body carries the lenses, the reviewed commit, the summary, the counts and the run's cost, and each finding is a review thread on its line, or on its file when the line is outside the diff's hunks (GitHub refuses those). A finding in a file the PR does not touch is listed in the body. If GitHub refuses the review, every finding goes in one PR comment instead. The thread that wrote the PR answers and resolves every thread before it merges (ship-sitting). With no secret it posts nothing and sets the status green; with the credit used up it says so and nothing is charged. `signoff` is unchanged. The job can also be started by hand (#586, `workflow_dispatch` with a PR number) to replay the review of a merged PR: it reviews that PR's base and head with the tools on the branch it was started from, posts nothing and sets no status, and keeps the prompt, the answer and what it would have posted in the run summary and as the run's `replay-pr-<n>` artifact for 30 days. The repo is public, so nothing is kept when the text holds the key or a token, and a fork's PR is not replayed; a failed review fails the run. The first replay, of eight merged PRs, is in `docs/review-replay.md`. `node tools/review/tally.ts [--since <date>]` counts, over the merged PRs, the reviews, the findings, the threads fixed (a reply that names the fixing commit), answered and kept, or left with no answer (whether a thread was resolved is not read), the findings that never became a thread, and what the reviews cost.
- Dependabot (#605): alerts and security updates are on in the repo settings, and `.github/dependabot.yml` asks for npm and GitHub Actions updates once a month, minor and patch grouped into one PR per ecosystem; a major's PR is turned into an issue and closed, never merged. A thread runs the full gate and signoff on a bot PR and merges it (ship-sitting, Bot PRs). CodeQL default setup scans every PR, and `main` requires its results (no new High or worse security alert, no new error). The `security-report` workflow (#616) lists the open code scanning and Dependabot alerts every morning at 05:40 UTC into a one-day artifact, because a session cannot read them, and the daily triage files a `fast-lane` issue for each (github-issues, Triage). Dependabot alerts need the read-only `DEPENDABOT_READ_TOKEN` secret; without it the report says they were not read.

## M7 sketch

Staffing (#140), the workers' name (#139), the field log (#141–#143), engineers (#144), expeditions (#146), the side-tunnels sheet (#147), lost tools (#148) and hazards (#149) are built.

- **Names:** player text says "worker"; the id stays `"helper"`. All copy comes from `screen-words`. Built (#139).
- **Counts by id (#559):** the game state holds every tier's count in one record, `Mountain.owned` (`Record<TierId, number>`), the same shape the save's `owned` has. The table in `tiers` (`TIER_ROWS`, `as const`) makes `TierId`, and each machine row carries its line `stage`, so `line`'s `MACHINE_STAGE` and `stageOf` read the rows. `tierRecord(value)` and `machineRecord(value)` build the records keyed by every tier or machine, `owned(mountain, tier)` reads a count and `setOwned(mountain, id, count)` writes one, keeping the rest. A new tier is one row in the table: the game state, the save's `owned` and the field log's rules carry it without a new field. `lineOn` lives in its own leaf, `line-switch`, so `tiers` reads it without importing `line`.
- `scale` (leaf, #356; retuned #357): `MOUNTAIN_STONES`, the kid-run stretch (`KID_RUN_GROWTH`, `kidStretch`, `MAX_STRETCH`) and the band scales. `BAND_STARTS` and `BAND_SCALE` say how many stones a band takes per stone of depth, times k. Their values are in [Numbers now](DESIGN.md#numbers-now). Depth stays in run-1 units, so `remaining` and the save format do not change. The pure functions `shownStones(depth)`, `stonesLeft`, `depthAfterStones(stones)` and `minedOut` convert between depth and the stones a run shows; `oneOffStretch` = k × the current band's scale prices upgrades and promotions. Machines and workers use k only (`tierCost`).
- `tiers`: each tier's first price, speed, `staff` and opening depth, and the two growth curves (`MACHINE_COST_GROWTH`, `HELPER_COST_GROWTH`) that `tierCost` applies. `tierQuote` (#358) prices ×1, ×10 or Max of a tier as the sum of `tierCost` unit by unit, the price `buyTier` charges for each in turn. The values are in [Numbers now](DESIGN.md#numbers-now). The `milestones` module (#357) doubles a tier's output at owned-count marks, stacking; the marks are in [Numbers now](DESIGN.md#numbers-now) too. Built (#140). The one-time staffing grants for older saves (#89, #140) went with the fresh save (#558). History (#140): the Great Machine's staff was 25, as staff 15 never ran one in the sim then and reopened a 2.5-day gap with no purchase.
- The line's machines (#533): the hoist (`hoist`) and the pit train (`train`) are tiers with `line: true`. `tierInPlay(tier)` in `tiers` is false for them while `lineOn()` is false, and every place that offers or runs a machine reads it: `tierShown` (so the drill follows the cart, and with the line on the hoist), `buyCrew`, `staffSlots` (no hands), the lab's staffing pad in `economy/actions`, and `machinesInPlay()`, the machines the lab measures and reports. `MACHINE_IDS` keeps all six. The screens are typed on `ShownTierId` / `ShownMachineId` (every tier but the line's), so no row, bay or art map can show them by accident; #537 and #538 widen them. Save: `hoist` and `train` in the game map's `owned`, left out at 0 (#558). The field log counts them with every other tier (#559). Marks: the hoist takes the cart's, the pit train the borer's.
- The lab plays the line (#534): `npm run lab -- --factors line.off=0` (or any sweep factors, `id=value` pairs) runs the strategy lab with the line on; the run and the report sit inside `withFactors`, and the report names the factors under its title. With the line on, `staffCrew` in `rates` also weighs `staffWith(..., lineHands)` (`fillLine` in `staffing`) for every staffing it tries: the big machines as the search left them, then the one-hand machines picked to lift the line as high as the hands allow (halving on the level, exact for those big counts), and spare hands on the lowest stage that has an idle machine, once with and once without stages already above the line. Because the line is flat while a stage is empty, `staffForLine` also tries every count of the big machines the hands can staff while there are at most 512 (above that, #500's climb alone), and hands the 16 that move the line most to the weighing (8 until #543, when Grandpa's tenth hid a better crew), where the tending can reorder them. `outputShare` in `lab/score` scales the machines' parts to what the line moves, so the tending and crafted deltas stay in the same units. Four report-only measures read it, NaN with the line off: `narrowRun` and `narrowShare` from the narrow stage each sitting opens on (`SittingEvent.narrow`), `handsCarry` from each sample's `line` view (`lineView` in `line`), and `zeroGainBuys`, machines bought that the line did not need, each kind weighed alone against the same moment without it (`SittingEvent.zeroGainBuys`, `lab/line-view`). Which band's rock applies stays one input: `effectiveRates` reads it from the mountain's band, and the line's table A is built in since #543 (`layerFavours`); the `layer.<i>.<tier>.hardness` factors still scale it for a sweep.
- The line's numbers (#543, labs only until slice 1's part 1 is switched on, #664) read `lineOn()` where each number already lives: `readRates` multiplies each machine's speed by `LINE_RATING` (3, `lineRating` in `line`), or in a fresh mine by `FRESH_RATING` where it names one (the cart ×10, 60 a second, so a cart outruns tools at every worker mark and with Work boots, #655, risk 15); `layerFavours` in `layers` is band table A (`hardnessOf` and the lab's `bands` read it), tough at `LINE_TOUGH`, with the whole-stage form behind the lab knob `rock.stage.off` (`ROCK_STAGE_OFF`, 0 slows every machine of the band's tough stage and suits none); `tierCost` in `tiers` climbs `LINE_MACHINE_COST_GROWTH` and starts from `LINE_FIRST_COST` (the first worker and Great Machine); `bandScale` in `scale` reads `LINE_BAND_SCALE` (the Deep Heart). The tending floor in `rates` is a share of `crewOutput`, the line when it is on. `bandSuits` names the suited machine, none in the whole-stage form, for the lab's favoured-machine rows. The lab's best-tending dad (`tendBest` in `lab/run`) sends each engineer at home to the post where the line gains most as he sits down and after a staffed buy; off the line it is `tendBestTier`, as before. The generations lab plays each kid run for up to `KID_RUN_MAX_DAYS` (60) in `lab/targets`.
- `staffing` (#500): `staffMachines` picks how many of each machine the hands run (a `Staffing`, one count per machine): the staffing that mines the most stones a second for given machine speeds, each machine fully staffed or idle. It tries every count of the bigger machines and, for the last one, only the counts where the one-hand machines (carts, drills) run out, so it stays cheap. A tie keeps the bigger machines. `staffWith` fills the one-hand machines around set counts of the big ones, and `biggestFirst` is the old rule. `effectiveRates` (`staffCrew`) weighs each candidate with the real tending (Grandpa and the floor, which move with what runs): the old rule, `staffMachines` on the engineers' tenths, with Grandpa's tenth on each machine, and with each engineer's post kept running. From the best it climbs, one big machine more, fewer or traded at a time, while the crew mines more. It is weighed on steady speed, not live trouble. With no Grandpa and at most one post that no floor tops up, `staffMachines` alone is exact and the search is skipped. Each answer is kept in a small table keyed by what can change it (hands, Legacy, tending gain, steady speeds, machines owned, engineers at home), since the labs ask about the same crew on many mountains. `rates.test.ts` sweeps saves with Grandpa and engineers and checks one more worker, drill, borer or machine never mines less there; a local search, it can still miss in rare crews with engineers on carts or drills.
- `line` (#532; spec `docs/superpowers/specs/2026-11-14-line-works-village-design.md`, step 1): the face, the haul and the lift. `MACHINE_STAGE`, read from each machine row's `stage` in `tiers` (#559), puts each machine in one stage (carts and pit trains haul, drills and borers work the face, hoists and the Great Machine lift). `stageSpeeds(speed, running)` sums each stage's running machines, `handsSpeed` is every worker and kid (those on a machine still lend their hands), and `lineSpeed(stages, hands)` is the largest T with Σ max(0, T − stage) ≤ 3 × hands: the hands fill the lowest stage up to the next, then both. More hands or a faster stage never lower it (`line.test.ts`). It is off in play: the sweep factor `line.off` reads 1 outside a sweep, and a lab run sets it to 0 (`lineOn()`, in the leaf `line-switch` since #559). With it on, `effectiveRates` and `handsGain` read the crew as `lineSpeed` of its parts; staffing weighs the line too (#534), and the tending floor tops her post up by a share of the untended line (#543), so the line rises by all of it only when her stage is the only one below it (engineers by stage are #539).
- The fresh mine (#653; spec `docs/superpowers/specs/2026-11-14-slice-1-design.md`, rules 1 and 2): slice 1's part 1, in play since #664 (the boot holds the switch). The sweep factor `fresh.off` beside `line.off` in `line-switch` reads 1 outside a sweep, and a lab run sets it to 0 (`freshMineOn()`); it turns the line on too. With it on, each rule stays in the module that owns it: `digStones` (`mountain`) puts what is dug in the stock and leaves the mountain full, so there is no depth (`stonesLeft` and `stonesToNextBand` in `scale` are Infinity), and what hung on depth (relics, the pass, band arrivals and materials, the workshop's door, the rock's lean) never comes. `createMountain` starts with one worker, on drilling, the horse wagon given and nobody driving or building (`FRESH_START_JOBS`, #703; it was 21 workers on every job from #655 until then). The doors are `FRESH_DOORS` in `tiers` (rule 1's table: `freshDoor`): the cart, the hoist and the drill are for sale from the first evening (kind `start`), and a tier whose door is a later part's (the borer, the pit train, the Great Machine, kids) is not in play (`tierInPlay`) and is locked with kind `later`, so a reader of `tierLock` alone (Ready now, the bays) never takes it for one on sale. `tapYield` (`rates`) and `veinReward` (`veins`) are 0, so a dig and a vein tap are refused, and `holdForRush` (`gold-rush`) holds nothing. Strong arms and Night foreman (`upgradeInPlay`, `upgrades`) and both boosts (`boostInPlay`, `boosts`) are out of play, and a promotion waits for the first borer and a free worker (`promotionOpen`, `engineers`). The save gained the fresh mine's own facts with #654 (below); there is no version bump until part 1's switch-on (#664).
- Orders and transport (#654; same spec, rules 4, 6 and 7): `city` holds the buildings (`BUILDING_ROWS`: the Light Tower, three steps of stone, 25,000, 250,000 and 1M, #655) and the one project (`Project`: `unordered`, `delivering` or `onHold`, each with a `Site` of building, step and what has `arrived`). He orders the next building once (`placeOrder`, the first in `nextBuilding` that is not `operational`) and it rises step after step; `holdOrder` and `resumeOrder` are free. `receive` lays goods on the step in hand's site, and `buildIn` starts the next step when one is built in, and with the roof's marks the building `operational` and leaves the city `unordered` (#690, below). `transport` holds the fleet (`VEHICLE_ROWS`: the horse wagon, 500 stone ×1.219 past the one a fresh mine is given, 9 goods a second each, #655; `fleetRate`, `vehiclePrice`, `buyVehicle`). `deliver(mountain, seconds, share)` carries from the pocket to the step, at most what the step still requires, split evenly between goods with what one cannot use going to the others. `orderLimit` says what holds the order back (transport, or a good the pocket runs out of) for the order line, and `secondsToFinish` is when the roof goes on. Live, `accrue` delivers after each dig under fresh. Unattended under fresh, `accrueAway` runs `accrueNight`: drilling works at the night shift output for the first `NIGHT_CLOCK_MS` (eight hours, no stockyard yet), haulage and hoisting go on until the mine's piles are empty (#703, below), and transport carries at that same share for the whole night, which splits where the roof goes on, since the Light Tower's power (`nightShiftShare`, read by `effectiveRates` as `awayPay`) lights the rest at 45% instead of 30%. The moves are `placeOrder`, `holdOrder`, `resumeOrder` and `buyVehicle` in `economy/actions`, listed only in a fresh mine and refused outside it; `valueOf` gives them no income gain (payback Infinity): today's catalogue dad never weighs them, and the lab's part 1 dad orders, holds and buys vehicles through his own planner (`lab/fresh-dad`, #655, below).
- Grandpa (#338, in `engineers`): `grandpaPost(mountain, running)` is the biggest running machine no engineer tends, once the Legacy is at least 1, read from the `running` that `effectiveRates` staffed. `tendingTenths(mountain, tier, running)` counts him at `GRANDPA_RANK` (apprentice) on that post; `engineerTenths` is the engineers alone. Nothing is saved.
- The building site and the builders (#690; same spec, rule 7.8 to 7.12, call 34): `building-site` holds the site's numbers, kept in one place in case Flemming turns them over: the site holds `SITE_HOLDS` (500 goods) and a builder builds in 8 a second (`BUILDER_BUILDS`, #655; `buildRate`, the workers on `building`; nothing lifts a builder). A `Site` keeps what has `arrived` for the step and what of it is still `onSite`; what is built in is the rest. `receive` (`city`) lays what transport brings on the site, and `buildIn` takes what the builders built in from it and, once what the step requires is built in (`stepDone`, `stillToBuild`), starts the next step in the same state, or with the roof makes the building operational. `stepWork` is the step in hand over a stretch: it finishes the step at the longer of what the builders and transport take, or else runs transport and the builders as a chain through the site with `flowWhole` (`piles`, #703, below), so transport brings no more than the site has room for as the builders make it and the builders build in no more than is on it. `deliver` (`transport`) runs it step by step, live and unattended; on hold, transport brings nothing and the builders still build. `orderNumbers` is what the page shows (what transport brings and the builders build in a second, what is on the site, what the step still requires built in), `orderLimit` adds `builders` as a limit for the lab, and `secondsToFinish` counts each step at the longer of its two times, so a roof built in on hold at night lights the rest of it.
- One workforce (#689; same spec, rule 2): `workforce` holds the jobs (`JOB_IDS`: drilling, haulage and hoisting, one for each stage of the line, driving and building) and `Mountain.jobs`. Every worker he owns (`owned.helper`) is on one job or free (`freeWorkers`); a hire is the worker's `buyTier` and starts free, and `placeWorker` / `freeWorker` move up to a count, for free: the free workers there are, or the ones on the job (#659, the amount key). A vehicle takes one driver, so transport takes no more drivers than he has vehicles (`jobRoom`, `placeable`, #715); a save that holds more is read as it is. The moves are `placeWorker` and `freeWorker` in `economy/actions`, each with its `count`, listed only in a fresh mine and with a count of one for the lab; nothing moves a worker for him, unattended or live. `lineWork` is the line under fresh, read by `effectiveRates`: each stage's workers run the machines that together move the most (`stageWork`, exact, so one more worker or machine never lowers a stage) and the rest work with a tool at three times a worker's speed; a machine takes `staff` workers from its tier row and stands idle without them (`helpersShort`), and the line is its slowest stage, with no spreading. That is the steady line (`crewPerSecond`), which an order's numbers and the lab read; what moves in a stretch goes through the mine's piles (#703, below). Work boots and the worker marks lift only the tools. Free workers count toward the marks. Loading crews counts the workers on haulage (`synergyBonus`, `upgrades`). `fleetRate` (`transport`) counts only the vehicles with a driver, the ones that carry most first. Save: `jobs` in the game map, left out at 0; more on jobs than he owns reads `bad`.
- Slice 1's frame, the game since #664 (#659; slice 1 spec, "The frame, the same on every site", "The workforce", "What Next and the lamps count"): the composition root `frame-screen`, which `main` mounts for everyone. Every boot (`createAppServices`) holds the fresh mine's switch on for the page (`holdFactors`, beside `withFactors` in `economy/factors`); outside the page the factor reads 1, so the unit tests and the labs play today's game unless they set it. While a signed-in save loads (the snapshot is not `ready`), the frame carries `data-loading` and shows its ground alone, since the store holds a new mine until the save is in. The frame's play saves (`start`, `ordered`, `stands`, `structure`, `done`, `busy`, `list`, `night`, `roof`) seed the dev account's phone backup (`dev-dad`, `DEV_BACKUP_KEY`, `seedKey` in the browser harness) and open with `?memorySave=1`. What it shows is worked out in pure views with unit tests: `frame-view` (the order strip: the building in hand, its step and state, and what the step requires with what is built in, or after the part's last roof what is operational; the stockpile, with no room until the stockyard; the workers and the free ones; the hire key, priced by `tierQuote` at the amount), `next-view` (each site's count of what he can afford now: the mine's machines of the line and the upgrades shown in its stages, the city's vehicles; the workforce's own count for the worker's upgrades; hiring is never counted; Next points at a building nobody has ordered, else counts, else says nothing is affordable on the sites and whether the line runs; a site's lamp) and `workforce-view` (every open job, grouped by site, with what its workers run and its count). `frame-screen` and `workforce-sheet` only paint them and dispatch moves: the hire key (`buyTier`, or `buyTiers` at ×10 and Max) in the top row of every site and in the sheet's head, and each job's − and + (`placeWorker` / `freeWorker` with the amount key's count). The amount key is Buys' own: `deviceAmount` and `paintAmountKey` (`buys-amount`) are the one amount on the device, and the hire key dispatches `tierBuyMove` (`economy/actions`), as Buys does. The frame shares `save-on-leave` and `createSaveLine` with the board. The scenes come with their own slivers (#660, #662); until then the middle is the site's dark ground.
- The mine on slice 1's frame (#660; slice 1 spec, "The mine"): `mine-site` fills the frame's middle on the mine's site. Its pure view, `mine-view`, has the Topsoil's plate (`levelPlate`: what the lift brings up now, hoisting's own `now` from `movingNow`, #715; part 1 has no line under it), a key for each stage's strongest machine in play and open (`machineKeys`, priced by `tierQuote` at the amount key's amount and bought with `tierBuyMove`), a row for each stage (`stageRows`: what the stage itself moves now through the piles, from `chainFlows(mineChain(...))` since #703, the pile after drilling and haulage (`pile`), what the stage can move, and who works with what as summands from `rowParts`, which reads `stageWork`; `printedParts` prints them so they add up to the printed total, and `crewTimer` in `rates` scales them under a crew timer) and the scene's state (`mineScene`: where rock piles, the share of tubs that leave full and the time they can unload, each stage's busy share and its machines that run or stand). A machine the stage has the workers for, left standing because tools move more, is the row's third state (`stands`). `mine-scene` draws the scene on a canvas in art px, on the board's `runBoardLoop`: the ground once a height, then the hoists on the surface (lit while they run, dim while they stand), the cage, the workers (those who wait take the slots away from their stage's machines), the tubs with the carts that do not run parked at the shaft end, the piles and the drill, about ten times a second, with the game's sprites. A key and Next's count share `tierOnSale` (`crew`), the rows read `stageMachines` (`workforce`), and the word tables (`plural`, `TOOL_WORDS`, `MACHINE_WORDS`) are in `screen-words`. The − and + on a row are the workforce sheet's own (`job-steps`: `stepper`, `paintSteps` and `listenSteps`, with the no-free-worker note).
- A stage's list on slice 1's frame (#661; slice 1 spec, "What the prototype does not show", "What Next and the lamps count"): a tap on a stage's row in the mine (its words are a button; its − and + stay keys of their own) opens `stage-sheet`, a sheet in the workforce's form. Its pure view, `stage-list-view`, has what the stage moves of what it can move and a line for each part of who works with what (from `stageRows`' parts and their printed moves, `StageRow.printed`; the row in one sentence for a screen reader), each kind of machine of the stage in play with what he owns, its next ownership mark or the reached line (`markLine` in `milestones`), and its key (`machineKey` in `mine-view` and `buildMachineKey` / `paintMachineKey` in `mine-site`, the ones the mine's keys use, at the amount key's amount), and the upgrades shown (`upgradeShown`) whose synergy lifts a machine of the stage (`upgradeStage` in `upgrades`), each read from today's `upgradeRowView` (`upgrade-rows`; its name is `upgrade.name`, the engineering names from #711 (Work boots, Night foreman, Loading crews and Haul roads); its effect and second lines come from `screen-words`, which has a fresh mine's words: Work boots lifts a worker with a tool, and Loading crews counts the workers on haulage) with a key that buys it at the price on the key (`buyUpgrade`) or "Owned". `workersList` is the workers' own part, which `workforce-sheet` shows under the jobs: the workers with their next mark, and Work boots. A stage's row has a lamp, green while `stageCount` (`next-view`) is not zero: its machines at ×1 and its upgrades he can afford. The mine's count on Next and the site bar is the sum of its stages' counts, so the mine's lamp is never green with no row lit. The play save `list` opens the lists' upgrades and Work boots.
- The city on slice 1's frame (#662; slice 1 spec, "The city", "While a part is the end of the game"): `city-site` fills the frame's middle on the city's site. Its pure view, `city-view`, has the transport plate (`transportPlate`: the drivers, what transport is doing, the fleet with the drivers it has of the drivers it takes and what those carry, and the drivers' − and +), a key for wagons at the amount key's amount (`vehicleKeys`, priced by `vehicleQuote` and bought with `vehicleBuyMove`: `buyVehicle`, or `buyVehicles` at ×10 and Max, all or none, #715), the skyline's three plots (`plots`: the Light Tower's, and two vacant), the project's card (`projectCard`: its steps, a bar for each good with what is built in, read from the order strip's `requirements` in `frame-view`; the order key, which lists what each step requires before the order (`Foundation 25K`, `Structure 250K`, `Roof 1M`, from the building's row, #715) and places, holds and resumes the order with what `orderNumbers` brings and builds and the step's time from `orderLimit`; the builders with what each builds in and what is on the site; the building's power; after the part's last roof the strip's line and no order key) and the scene's state (`cityScene`). `city-scene` draws the night skyline on a canvas in art px: the building in hand rises from its own picture, cut at (step + built in) ÷ 3 of its height behind code-drawn scaffold, and stands whole with its lamp lit once operational; a vacant plot has stakes and a rope; what is on the site lies beside it as a heap, the builders work there or wait with a "z", and the wagons drive to it as full as transport brings (the picture's heap of stones cut to that share), stand with a "z" with nothing to carry, or stand empty behind the road with no driver. `scene-paint` holds what both scenes draw with (the noise, rects, lines, glows, the night sky, sprite frames, the "z", heaps, the pictures' loader) and their canvas loop, `runScene`, on the board's `runBoardLoop`. The drivers' and builders' − and + are `job-steps`. The play saves `slice-structure` (the structure rising, a wagon with no driver) and `slice-done` (after the roof) show the city's other states.
- The night report and the frame's cards (#663; slice 1 spec, "The cards", "While a part is the end of the game", rule 4, rule 7.12): in a fresh mine `accrueNight` (`mountain`) adds `night` to the `AwayReport`, a `NightReport` of the night's facts from timestamps: how long the mine produced, whether the eight-hour clock stopped it, what transport delivered, each step built in (`NightStep`, the night split at every step's end with `transport`'s `secondsToStep`) and the night shift output at its start and end. The session greets a fresh night where anything happened (mined, delivered or a step built in) with its `away` notice, never the quiet note, and on a live return too (a tab left open overnight), where today's board pays a live gap silently. `shift-report-view` turns it into the report's words, pure: the head, the night bar and its labels, the lines, `Resume`. `frame-cards` is the frame's one card overlay, one card at a time above the save line: the shift report while the session holds an `away` notice with `night` (its key closes the notice with `progress.dismiss("away")`, as the board's welcome card does), then the end card while the session holds an `operational` notice for the Light Tower (its key closes it with `progress.dismiss("operational")`). That notice is the session's news like a band or a craft: `noteOperational` announces each building that joined `operational` since the `operational` baseline, which `primeArrivals` sets before away pay, so a roof put on in a night or in a short break is told and a save already running it is not. Closing the report leaves the end card. Neither is a save fact. The cards paint only views whose save has loaded (`ready`), and a card coming up closes the workforce sheet. The report's times are `shiftDuration` (`format`) and its shares `percent` (`screen-words`). The end card's words are in `frame-cards-words`, its shares read from the rules (`AWAY_PAY_RATE`, the Light Tower's `power.nightShift`). The play saves `slice-night` and `slice-roof` open on them.

- The save's cards on slice 1's frame (#707; `observable-saves.md`): `frame-save-cards` mounts today's board cards on the frame, over everything else on it, the shift report included: the update card (`createUpdatePrompt`, opened by `showAppUpdate` for a waiting build and once for a save from a later build, which holds play and writes nothing), "Two saves found" (`createSaveConflictPanel`, its confirm a new page) and the other-tab card (`createOtherTab`, Play here). They are the board's panels on the board card shell, on a `BoardHost` of the frame's own (`createBoardHost`), so their presses keep the settle against a double tap. In a fresh mine a save card (`saveCardLines` in `save-sheet-copy`) has no depth, pocket or engineers: it reads the building in hand and its step (`orderStrip`'s name and pips, `STEP_NAMES`), the stone in the stockpile, the machines in the mine's order, and the workers with the horse wagons. The `?saves=two` preview (`save-preview`) holds two fresh mines on the slice preview, so the writer can read them back. The visual check's card table runs the four cards on the slice preview at both phone heights.
- The order strip's key on slice 1's frame (#708; slice 1 spec, "What the prototype does not show"): `frame-ledger` puts one key at the order strip's end (the order's pips move under its step) and mounts today's Ledger drawer (`createLedgerPanel`) in today's sheet clip and scrim (`createSheetScrim`), with Saved copies (`createSavedCopiesPanel`) as a board card over the frame. The sound switch is the Ledger head's `createSoundKey` on `soundSetting`, one choice per device. The frame's `BoardHost` now lives in `frame-screen` and is shared by the Ledger, Saved copies and the save's cards, so one settle covers them all; a card coming up closes the Ledger with the frame's sheets. In a fresh mine the Ledger has two rows from the save card's fresh lines (`freshLedgerRows` in `ledger-rows`, over `freshMineLines` in `save-sheet-copy`): the stone in the stockpile with the project in hand, and the workers with their wagons over the machines. It has no relics row, no Pass the mine and no "i" cards, Start over speaks of the mine (`START_OVER_FRESH_DETAIL`, `Keep my mine`), and the drawer's and Saved copies' way back is `Close`. Tonight words a horse wagon bought (`vehicle.buy`).
- The lab plays part 1 (#655; same spec, Lab): with `fresh.off=0` the strategy lab (`tools/strategy-lab.ts`) plays the player types in `lab/fresh-policies` instead of `lab/policies`, to the last building built so far (`runDone` in `lab/run`: the Light Tower's roof in part 1), and judges no guardrail. A fresh type is a plain dad (`freshPolicy` in `lab/plain`) with `FreshHabits` on its `Policy`: when he moves workers (`once` per building, or `idle`: whenever a job has nothing to do), whether he holds (`on-value` or `never`) and whether he weighs upgrades. `playSecond` hands a fresh type's live second to `playFresh` in `lab/fresh-dad`, which applies his plans until one changes nothing (at most `PLANS_A_SECOND`). `freshPlan`, in order: order the next building; place a free worker (an idle vehicle, a builder once an order is in, else the stage after the fuller pile, #703); for the mover, send drivers and builders with nothing to do to the mine and back, and a stage's spare worker to the slowest; buy the order's fix (`orderLimit`: a wagon with its driver and the builders to keep pace, or a builder) when it pays for itself, saving for it unless the order drains the mine; buy the raise that pays back soonest (`lineRaise`: the slowest stage's best buy per stone, with its workers hired onto it, until the line rises; upgrades too for the optimizer); and hold while that raise pays back sooner than the building takes and the order takes more than half of what the mine makes (`drainsTheMine`, `STARVED_SHARE`), weighed on the mine as it would stand delivering so the mover's moves never undo it. `lab/fresh-view` reads each sample (`FreshView`: the order's limit, a full site, `starved`, the idle workers and the machines tools beat) and the taps that hire and move workers (`workerTaps`, with the amount key on ×10 then ×1), which the sitting log adds up. The report-only measures are `transportLimit`, `siteFull` (both over the samples with an order standing), `starved`, `idleWorkers`, `idleMachines` and `workerMoves`; `narrowRun` reads the placed workers' stages (`narrowAt` in `lab/line-view`).
- Every part runs on its own (#703; slice 1 spec, rule 2 "Every part runs on its own", rules 2.10 and 4, "The mine", "The cards"): `piles` is the one mechanism that moves goods through a chain of stages with a pile between each pair. A `Chain` is a `source` (Infinity for drilled rock, or what the pocket holds), each stage's rate and the `Pile`s (`held`, `holds`). `chainFlows` is each stage's rate now: a stage whose pile in front is empty moves at most the stage before it, and one whose pile after it is full moves at most the stage after it, so a pile of room 0 runs the stages in step, as the line did. `chainChange` is the seconds until a pile fills or empties, or the source runs out. `flowChain` is exact over a stretch, in phases of `chainChange`, and `flowWhole` floors each stage's total and recomputes the piles from them, so nothing is made or lost. A pile over its room is full and is never emptied by a lower room, so the room is the lab's to change. The building site's `stepWork` uses it for transport and the builders, and keeps its own split between goods (`shareOut`). `mine-piles` is the mine's chain: `MinePiles` (the `face` and `shaft` piles, whole stones, on `Mountain.piles`, empty on `BARE_MOUNTAIN`), `PILE_HOLDS` (300 each, set by the lab), `mineChain` (drilling, haulage and hoisting from `lineWork`, times the pay, drilling at 0 when it does not drill), `mineChange`, `mineMoves` (whether any stage moves rock now, which Next reads for "Production is running.") and `flowMine`, which lifts what hoisting brings up through `digStones`. In a fresh mine `accrue` runs `flowMine` over the whole seconds in place of digging at the line's speed, and `accrueNight` ends each `nightStretch` where a pile fills or empties too, stops drilling at the clock and lets haulage and hoisting drain the piles after it; the report's `producing` is whether stone came up, and its `stop` is `"clock"` only when stone still came up as the clock struck, not when a pile ran out first. Save: `piles` in the game map, no version bump. The lab's dad (`lab/fresh-dad`) moves a worker whose stage stands to `pileStage` (`pileMove` in `rebalance`: hoisting when the shaft pile holds rock and is at least as full as the drilled rock, else haulage when the drilled rock holds rock, else drilling), places a free worker there, and hires the order's driver and builder once the line moves (`orderCrew`); the mover takes a worker off a stage only while the line still moves rock without him (`spares`). `mine-view`'s `stageRows` gives each stage's own `now` and a `pile` line ("Drilled rock", "Rock at the shaft", held of holds), which `mine-site` prints inside the row (`pileWords`), and `mineScene` draws the piles as full as they are and stands a stage that waits on a pile. `frame-cards` has a third card, `first`: the first evening's (`FIRST_EVENING` in `frame-cards-words`), on a session's first ready view while the mine is as it started (nothing ordered, nothing operational, and one worker, on drilling, #715), until Start; it is not a save fact. Flemming approved its words and the two pile labels on 15 Nov 2026. The play save `slice-start` opens on it.
- Goods, makers and the stockyard (#666; slice 1 spec, rules 2, 3, 4 and 6, The save): slice 1's part 2, off in play. The sweep factor `part2.off` in its own leaf, `part-switch`, reads 1 outside a sweep; `partTwoOn()` is true only in a fresh mine with it at 0, which the lab sets and #672 turns on. With it off, every rule below is inert. `stock` has a sixth good, `brick` (from `kilns` in the goods table). `makers` holds the makers (`MAKER_ROWS`: the kiln, 15,000 stone on a machine's curve, ×1.219 and the `growth.machine` and `price.kiln` factors, 12 brick a second; `makerPrice`, `buyMaker`), open with the Light Tower (`makersOpen`), each running with one worker on the `kilns` job (`runningKilns`, `kilnRate`); `workforce`'s `jobOpen` keeps that job shut before then, and `economy/actions` neither lists nor applies a worker onto a job that is not open. `stockyard` holds the stockyard: open with the Light Tower (`stockyardOpen`), each good's room (`stockpileRoom`: 6M stone and 1M brick at level 0, as the lab set them in #667, and the lab knob `room.stockyard`, ×3 a level, times what the operational buildings give, `stockyardTimes` in `city`), `expandPrice` (150K brick ×3 a level, never above the brick room) and `expandStockyard`, up to `MAX_STOCKYARD_LEVEL` (18, where every room and price is still a safe integer), `priceFits` for "Needs a bigger stockyard" and `stockpileFull`; before it every room is Infinity. `city` has the Warehouse (part 2: stone and brick, `power.stockyard` 2), and `nextBuilding` skips a building whose `part` is not in play. `piles` gained a spill: a `Chain` may name one pile whose overflow, while it is full, goes to a side pile with a room and a `drain`; a full side pile holds the stage before at the next stage plus the drain, one over its room takes nothing, and `flowWhole` gives the whole goods that spilled (`spilled`) so the pile stays within its room. `mine-piles`' `mineChain` carries the line on: hoisting fills the rock at the kilns (`PILE_HOLDS.kiln`, 300, with room only while he owns a kiln) and spills to the stone stockpile, the kilns make brick into the brick stockpile, and each stockpile's room is the stockyard's, drained by what transport takes from it now (`stockDraw` in `transport`, worked out only once the stockyard is open: split evenly between the goods still required, with a dry stockpile giving only what the mine brings it a second and the rest going to the others, as `deliver` shares out; what comes in is `takeIncome`, the chain with transport taking all it carries from every full stockpile, so a full brick stockpile leaves the kilns all the rock they can make into brick and stone only the rest). So a full brick stockpile sends rock to stone, and with both full the line stands (`mineMoves`). `flowMine` returns what reached the stockpiles (`gained`) beside the rock lifted (`mined`), and `chainIncome` is each good a second for `secondsToStep`, which takes an income by good. Unattended, `accrueNight` drops the clock once the stockyard is open (also when the Light Tower's roof goes on in the night), so the mine runs until the stockyard is full; the report's `stop` is `"stockyard"` when the mine stood at the end with its stone stockpile full, and `fullAtMs` says when each stockpile was first full. Its `deadMs` (#667) is how long a stockpile sat full while nothing took its good (`deadStockpiles`), added up stretch by stretch. With the stockyard open, live play runs in the same stretches as a night (`accrueStretches` and `workStretch` in `mountain`), and a stretch also ends where transport's take changes (`drawChange` in `transport`, from the same take and what really comes in: a good's need met, its stockpile dry, a dry stockpile starting to fill, or the site full; a dry stockpile taken at what comes in holds steady, so a long night with transport faster than the mine is a handful of stretches; and a pile that fills or empties within a stretch's first second is taken as filled or empty for it, `chainSettled` in `piles`, so a stockpile a few goods short of its room does not cut the stretch to a second), so the take holds for each stretch and a full stockpile is topped up by what transport took; what it actually takes is still `deliver`'s, and a stockpile that ends a little above its room is full and loses nothing. Save: `makers` and `stockyard` in the game map, `brick`, `kilns` and the `kiln` pile on their maps; no version bump. The moves (`buyMaker` and `expandStockyard` in `economy/actions`, listed only while open and below the last level, logged as `maker.buy` and `stockyard.expand`) came with the lab (#667), and the words come with the refinery's screen (#671).
- The lab plays parts 1 and 2 (#667; same spec, Lab and Starting numbers): with `fresh.off=0,part2.off=0` the strategy lab plays the same fresh types to the Warehouse's roof (`runDone` still reads `nextBuilding`). `lab/fresh-dad` reads what the mine brings of each good (`goodsIncome`: the running kilns take their rock first, the rest is stone), and `orderLimit`, `orderNumbers` and `secondsToFinish` in `transport` take that income by good (`Dug`). The order's fix is now the best of two by building-seconds saved per stone, each only when it pays for itself (`savedSeconds`): the answer to the order's limit (`limitFix`: a wagon with its driver and builders, or a builder), and a kiln with a worker hired onto it while a step still to build requires brick (`brickFix`, `kilnBuy`), weighed on the whole building, since the roof's brick is made from the first day. He expands the stockyard (`yardPlan`) when a stockpile holds `YARD_NEARLY_FULL` (90%) of its room or the raise he wants costs more than the stone room, if the brick covers it with his hoard; he raises no line into a nearly full stone stockpile; and he moves no worker while hoisting stands with rock to lift (the stockyard is full: `pileMove`). The lab's `World` carries a fresh night's report (`night`, from `step` in away mode), `lab/nights` turns a gap of `NIGHT_MIN_MS` (six hours) or more with the stockyard open into a `NightRecord` (how long, and when the stone stockpile first filled), and the tournament hangs those on the next sample (`DecisionSample.nights`). The report-only measures `nightFull` (the share of those nights a full stone stockpile ended), `nightFullAt` (the median share of the night when it filled) and `deadGood` (`FreshView.deadGood`: a stockpile full while no order delivering takes its good, weighed by time: a minute for each sample with the stockyard open, and each long night's `deadMs`, which the night log adds up stretch by stretch by the same rule (`deadStockpiles` in `stockyard`), `deadGoodShare` in `lab/nights`) join part 1's.
- `engineers` (rules layer, pure): `Engineer = { name, rank: 0 | 1 | 2, trips, post: TierId | "camp" }`. In memory an engineer on a trip keeps the post they left, and `onTrip(mountain, name)` is the one test for "away" (#415). `onDuty` gives the crew as the save and the screens see it, with post `"tunnel"` for the ones away; `promote(mountain)`, `station(mountain, i, post)`, `rankOf`, `addTrip`. `promote` takes no `now`: the price does not depend on the clock. Save: `engineers?: Engineer[]` (max 5, names Ada, Nils, Ruth, Otto, Mae). The first engineer arrives with the first borer, already tending it, without spending a worker. The save reader refuses an unknown name, a duplicate, a sixth hand or a post it does not know as `newer` (#558); the rules leave the game map to it. Built (#144). Buying a machine does not call `tendBestTier` (#145); the sheet's post sticks. The pacing sim still calls it.
- `expeditions` (rules layer, pure): `TUNNELS` (a side seam, 10 min; the old
  shaft, 1 h; the deep dark, 4 h, Journeyman+). `send(mountain, engineer,
tunnel, now)` stores the trip and its find, seeded from `sentAt`. The engineer
  keeps their post, so the trip is what makes them away. `recall` drops the
  trip and its find. The save writes the away engineer at post `"tunnel"` and
  the trip's `home` (the post they left), and a load reads them back; a saved
  `"tunnel"` with no trip loads at camp. `settle(mountain, now)` clamps a future
  `sentAt` to now (the wait and the find stay, the same idea as a future
  `lastSeen`) and returns `{ mountain, finds, homecomings }` for every
  expedition past `returnsAt`, adding a trip. `homecomings`
  (who, which tunnel, the settled find) is session news for the welcome card,
  not a save field. `accrueAway` returns the same list for parties who came home
  while the game was closed. Save: `expeditions?: { engineer, tunnel, sentAt,
returnsAt, home, find }[]` (≤5, `returnsAt > sentAt`, no longer than the deep
  dark, closed tunnel and find ids, one trip per name) and `finds?: FindId[]`
  (lost tools and keepsakes, no duplicates). `home` and `find` are stored
  because `"tunnel"` would forget the machine, and clamping `sentAt` would
  reroll a find that was only recomputed from it. Shelf ids
  are a closed list. The save reader refuses a trip, tunnel or shelf id it
  does not know as `newer`, and a broken one as `bad` (#558). Built (#146). The worn map
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
- `hazards` (rules layer, pure): `nextTrouble(seed, now, mountain)`, `fix`, `pressTrouble`, `slowedSpeed`. One trouble at a time, every 3–6 minutes of live play, only once a borer is owned. Cave-in on carts, flood on drills, jam on borers or the Great Machine. The tier keeps three quarters of its speed at first and eases to half over two minutes. Five taps or a 600ms hold fixes it. An engineer tending that tier fixes it after 30 seconds; a Master fixes it at once. Steel-toe boots double the gap when `wearsSteelToes(mountain)` is true (or the caller passes `boots: true`). Built (#148). Session state lives in the store's session (`session`), never in the save, and clears on close, reload, and away time. Built (#149).
- `field-log` (rules layer, pure): `snapshot(mountain, rates, now, version)` and
  `EventRing` (last 200) are built (#141). The ring's move entries (tier and
  upgrade purchases, boosts started, vein tapped, craft started, promotions,
  posts, sends, and recalls) come from the events a dispatched move returns,
  through `fieldEntry`; nothing diffs the mountain (#413). The session core also
  records relic found, away report, Start over, pass the mine, and save errors. The ring is not a mountain save
  field. The device keeps a copy per account (`field-ring`, key `dad-friendly-field-log:<uid>` or
  `:guest`, #479): `local-saves` restores it when the account is known or changes, and keeps it on
  the cloud copy's throttle (`shouldWriteFieldLog`) with a 10 s gap, and at once on hide, a new
  run and a refused one. An event the field-log rules would refuse is dropped on the way back in. Each write folds in what another tab kept, so tabs never overwrite each other. A
  Start over or a pass the store refuses records `run.refused` (`start-over` or `pass`, and why:
  `loading`, `other-tab` or `conflict`), and a signed-in save still loading after 30 s records
  `save.stuck` (the server read's state), then `save.loaded` when it lands; both reach the save line. The Ledger's Copy field log plate copies `{ snapshot, events: last 50 }` as pretty JSON, with a
  read-only page of the drawer when the clipboard is missing. No email or display name.
  Signed-in games write their device's `fieldLogs/{uid}/devices/{deviceId}`
  (#485; the account-wide `fieldLogs/{uid}` of older builds stays) = `{ snapshot, events (≤200),
updatedAt }` at most every 5 minutes, and immediately on hide, Start over, and
  passing the mine (#142). Those two keep the old run's events (#479). The events
  uploaded are the writer tab's ring folded with this device's kept copy, and a
  refusal is kept on the device at once, so a Start over refused in another tab
  reaches the cloud at the writer's next upload (#484). Guests write
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
  The snapshot's `crew` is every tier's count and `idle` every machine's
  idle count, both by id, the line's machines included; the rules hold each
  to a map of at most 16 entries and name no id (#559).
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
  `trouble.fix` (`hand` or `engineer`), `layer.enter` (the band id), `craft.start` (the recipe id),
  `craft.done` (the recipe id and the new level). The board's layer,
  craft-done and welcome cards, its machine cards and its crew line went with
  the board (#727). The Ledger
  drawer's Quiet/Sound head key is the only sound control (`sound`, #491). Trouble stays out of the
  snapshot: it is never saved. Choosing a post while a party is out records the
  recall and, when the new post is not the one they left, the station.
- `lost-tools` (rules layer, pure): `hasLostTool`, `tapWithPick`, `glintScale`, `expeditionAwayMs`, `wearsSteelToes`. The old miner's lamp doubles a golden vein's glint (`veinGlintMs`). Keepsake stories live in `screen-words`. No new save field: the shelf is still `finds`. Built (#148).
- `layers` (rules layer, pure): four bands from stones mined: the Topsoil, the Granite, the Crystal Caves and the Deep Heart through the bottom, starting at `BAND_STARTS` ([Numbers now](DESIGN.md#numbers-now)). `layerOf` reads `minedOut`. Entering a band includes its first stone, so 10M is the Granite, beside the Shield. Hardness is a per-tier speed in `effectiveRates`, and the sweep factor `layer.<n>.<tier>.hardness` multiplies it. `accrue` (live ticks and time away alike) splits a stretch at the whole second the crew digs past a band's start (`stonesToNextBand`) and reads the new band's speed from there, as live play does a second at a time (#592). Workers and kids stay at 1. No layer field. Each band drops its material on the tuned gap in `MATERIAL_EVERY` (1,000,000 clay, 1,000,000 iron, 5,000,000 crystal, 10,000,000 heartstone). `accrue`, `accrueAway`, and a hand tap add the units. The remainder stays in the stone total. `materialLeftToDig` counts what the rest of the run's mountain still holds of one material; `workshop-sheet`'s `goneMaterial` uses it to turn a recipe that lacks clay past the Topsoil into "No clay this deep" instead of "Need 4 more clay" (and iron, crystal or heartstone once their band is dug, #492). Built (#194, #195, #198).
- The envelope carries `rev`, `deviceId`, and `savedAt` (first in v7). `rev`
  starts at 1 on a new doc and the rules accept only `stored + 1`. `savedAt`
  must be `request.time`. One cloud write is in flight, at most one a second, and the
  newest mountain is the next payload. A rev refusal reads the server doc. A
  later run wins whole. A lower rev is never adopted. One copy fast-forwards
  when it is at least as far on rock dug in all, upgrade levels, crafts,
  recipes, finds, engineer trips, the city (the buildings operational, the
  steps built and what has arrived for the step in hand), the stockyard's
  level, every tier owned (workers, kids, machines), every vehicle and every
  maker, and further on one of the progress facts (all but tiers, vehicles
  and makers; #664 added the city, hoists and vehicles, #666 the stockyard
  and the kilns). A lead that is only machines, makers, crew or vehicles, or a split where
  each side has something the other lacks, is not
  blended. The phone keeps its copy. The sheet "Two saves found" asks which to
  play. The other copy is archived first at `gameArchive/{uid}/copies/{id}` for
  seven days (owner create and read, no update, no delete). Then the chosen copy
  is written at the server rev plus one. A failed archive leaves both copies and
  the sheet. `syncedRev` on the phone backup is the last confirmed rev.
  `save.conflict` logs the revs, device ids, rock dug in all, and the choice. Saved
  copies, opened from the Ledger, restore one the same way and log `save.restore`. A copy
  from an earlier run comes back as a new run (#480): `startedAt` is
  `max(now, playing + 1)`, so the rules' run check passes, and `lastSeen` is now, so no
  time away is paid. Each copy stores its `reason` (`conflict`, `restore`,
  `start-over`, `pass`, and `reset` for a copy from before the current
  version; `firestore.rules` lists the same five). Signed in,
  `startOver` and `passTheMine` go through `keepThenBegin` in `save-choice.ts`:
  the mountain in play is archived, then `beginRun` starts the new run. A copy
  refused or not answered within `archiveWaitMs` (`settle-within.ts`, shared
  with the resume read; 10 s) keeps the mountain in play and logs
  `save.archive` as an error. A second press while one is in flight, a newer
  run arriving meanwhile, or another account, a dispose or a held save by the
  time the copy lands (uid and `hydrateGeneration`, as the resume read checks)
  starts nothing; a restore checks the same. A mountain not played since it
  was new (`playedSinceNew` in `save-progress`, the same check that says a new
  phone is not a copy, #664), or a guest's, starts at once with no copy, and a
  restore keeps no copy of it. The field log
  snapshot includes `deviceId` and `rev`, and its `version` is the build's
  short commit (`dev` outside `vite build`). A newer service worker shows "Update
  available" and a reload button. `vite build` writes the same commit into
  `sw.js` (`src/build-stamp.ts`, #516), so every deploy ships a worker with new
  bytes: an open page's update check on visible installs it, and the card
  opens. The cache name stays, so an old page keeps its hashed assets. A build from before version 8 cannot write
  at all: its path is read-only (#558). Coming back reads the server before writing. A cached snapshot
  (Firestore persistent cache) does not count as that read. One writer tab per
  device; Play here flushes the phone backup first. Offline writes stay in that
  cache until the next open, and a stale queued rev is rejected like any other.
- The workshop's state lives on the mountain in memory: the materials in `stock`, `bench`,
  `crafted`, `recipes`, and the craft clocks (`mountain.clocks`, keyed by
  recipe id; 0 is cold). The save keeps them in the game map: the materials in
  `stock`, crafted levels in `levels`, the clocks in `clocks`, the recipes in
  `marks.recipes`, and the bench as it is (#558). Passing the mine keeps the
  recipes and clears materials, the bench, crafted gear, and a hot charge.
  Built (#195, #196).
- `workshop` (rules layer, pure): one bench. A recipe this build cannot name
  makes the whole save `newer`, so the bench always holds a known craft (#558).
  `startCraft` pays the recipe's price (`recipePrice`: stones and materials as
  one `Price`, #560) when the Granite is open, the recipe is known, and the
  stock covers every line. A cancel refunds a `Price` the same way.
  `settleBench` fits a craft whose clock has rung, once, including inside
  `accrue` and `accrueAway`. `cancelCraft` returns lasting gear in full, because
  its effect has not started, and only the unused share of a live timer (axle
  grease, a blasting charge, a crystal flare, a heartstone ember). A craft whose
  clock has already rung is fitted instead. `cancelRefund` and `hotTimers` are
  what the drawer reads. Rails, bits, the core, and Reinforce (max 5) multiply
  tier speed in `effectiveRates`. A blasting charge doubles the live crew until
  `chargeUntil`. Axle grease doubles the live crew until `axleUntil`, including
  while it is still on the bench. Axle grease, a blasting charge, and Overtime
  meet in `effectiveRates`, and the crew runs at the strongest of them. A Gold
  rush (`src/gold-rush.ts`, #468) is paid out of the away haul: after an hour
  away `accrueAway` holds part of it back (`holdForRush`, `rushBank`), and the
  rush pays `rushPerSecond` of those held stones beside the crew until
  `rushUntil`, both saved in the game map (`clocks` and `run`). Live `accrue`
  pays them (`payRush`) beside the crew's own digging. `effectiveRates` never
  counts them (#525), so every rate reads the crew alone.
  `resumeRush` runs first on every open: a break under an hour shifts the rush
  later (close is pause), and an hour away or an ended rush lands what is held
  (`releaseRush`), as does a missed glint (the `missQuickVein` move). The store's snapshot reports each settled
  time away as `awayGap` (`ms`, and the `at` that names it), and a long one
  arms the quick vein. A
  heartstone ember multiplies the Great Machine by 1.25 until `emberUntil`. A
  crystal flare makes veins 25% more often until `flareUntil`. Crafting a flare,
  an ember, or another grease refreshes that clock and does not stack. None of
  those timers change away pay. Sturdy props stretch the trouble gap. The lamp
  makes golden veins more often for good. The engineer's kit shortens the next
  expedition. Strength and cost factors (`recipe.<id>.strength`,
  `recipe.<id>.cost`) default to 1; strength also scales a timed buff's length.
  Built (#196, #198, #210). Its drawer, `workshop-panel`, went with the
  board (#727); a craft's countdown runs on the mountain's clock.
- Panels: the Engineers drawer (`engineers-panel`, #161), its rows and
  pages, the welcome card's homecomings and trouble's shout on the bays and
  Buys rows went with the board (#727). The rules stay in the model until
  #665's later slivers: a post calls `station(recall(...))`, so a party is
  never left without its engineer, and trouble is fixed by five taps or a hold
  (`hazards`, the store's `fixTrouble`). Built (#149, #161).
- Designed twice: expeditions as a negative-speed tier in `TIERS` was rejected (it leaks into buying, cards and the sim's value function). Separate modules that feed `effectiveRates` keep it the one place multipliers meet.
