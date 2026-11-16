# Architecture

Review for M5 (#115). The game is a small, framework-free TypeScript app. This
page is the map, plus the rules that keep it that way.

## Layers (imports point down only)

1. **Rules of the game (pure, no DOM):** `mountain`, `tiers`,
   `layers`, `stock`, `upgrades`, `crew`, `line`, `workforce`, `piles`, `mine-piles`, `city`, `building-site`, `transport`, `rates` (the one place
   every multiplier is applied: live ticks, away pay, the UI), and
   `field-log` (a JSON snapshot and an event ring). `stock` (#560) is the
   goods table (stones, then each layer's material, with where it comes from),
   the mountain's one `stock` record of them, and the `Price` every buy asks: a
   short list of goods and amounts. It is the one module that pays (`pay`,
   which refuses unless every line is covered), adds (`add`), refunds and
   takes back; the rules modules quote a `Price` (`tierPrice`, `upgradePrice`,
   `promotePrice`, `recipePrice`) and never subtract a good
   themselves. `rates.exactCrewPerSecond`
   is the crew speed before the whole-stone floor. `economy/actions` lists
   every legal move, including a cancel of a save's craft (the craft move
   went in #740: the old bench never opens), applies the existing
   functions, and values income from that speed and away pay. A `Move`
   is an `Action` or a screen-only move (a seen mark, or
   Buys' ×10 and Max, `buyTiers`: several card buys in one move, all or
   nothing, logged as one `tier.buy` with the final count, #358), and
   `applyMove` is the one place the UI changes the mountain, and the lab's
   `applyAction` too (#409). Until #738 the pacing sim still called some
   rule functions directly (`promote`, `send`, `tendBestTier`). A lasting upgrade's buy and a promotion carry the
   price the player was shown (`price`), and a different price today refuses
   the move: a price that moved while the tap settles the crew cannot charge
   more (#367). Both prices are a `Price`, and every good must match (`samePrice`).
   `listActions` quotes today's price. It says `applied` (with what the move spent and
   gained, good by good, as two stock records, #560) or `refused`, and it holds the UI's rules too: a worker bought beside an idle
   machine marks staffing taught, a real station marks tending taught and first
   calls a party back, and a recall with no expedition sends the hand to camp. `lab/world` steps one seeded clock for the
   strategy lab through the game's own time step
   (`session-time`'s `advance`: parties due come home, the crew is paid, then
   the hazards step; away time pays the capped gap and clears trouble), so the
   lab and the game advance the world identically (#414). `lab/targets` is the only place a lab threshold lives.
   `lab/measures` is one file per decision measure. `lab/fresh-policies` is one
   file per player type (`freshPolicy` in `lab/plain`). `lab/registry` discovers both folders; the world
   never reads the filesystem. `lab/run` plays a player type on that clock:
   each live second is the mine's, then `playFresh` (`lab/fresh-dad`), and the
   run ends when the last building in play is operational (`runDone`).
   `lab/tournament` runs every policy it is given across the seeds it is
   given and scores every measure. `lab/guardrails` turns `targets.ts` into
   one check per entry. `tools/strategy-lab.ts` (`npm run lab`) loads the
   registries, writes the report, and warns on a miss unless `LAB_STRICT=1`.
   Since #737 it plays only the mine the live game plays: the fresh mine with
   part 2 (`PLAY_FACTORS` in `part-switch`, the map boot holds). Since #739
   the fresh mine is the rules, so it refuses `fresh.off` and `line.off` by
   name. `TARGETS` is empty until the fresh mine's
   own guardrails are designed (Flemming, 16 Nov 2026), so nothing is judged
   yet. Today's mountain's player types (`lab/policies`), their `decide`, the
   band report and the sensitivity sweep went in #737.
   `lab/ledger` keeps each run's pacing ledger row (#554); `--ledger check`
   compares the run with the committed `docs/pacing-ledger.md` and fails on a
   difference, and `--ledger write` (`npm run lab:ledger`) writes it. The
   ledger is one of the lab's inputs (`LAB_ENTRIES`), so a changed ledger
   runs the lab again. `economy/invariants.test.ts` (#555, fast-check, in the
   `unit` project) plays random legal moves, live waits, trouble and time away
   from saves with a crew bought from a small to a large pocket and in a fresh mine (#654: orders, wagons and deliveries), and checks after each step that counts stay whole
   and finite, lifetime figures never fall, an upgrade or a promotion spends
   its shown price and a machine spends some stones, a buy of a
   machine, upgrade or craft never slows the crew, and the save
   round-trips. It also checks, from every start, that time away inside the
   full-pay length pays the same however it is sliced. The band-crossing
   check (#592) went with depth in #740. Its known gap (part-stone) is listed
   at its top, pinned by its own test.
   The full gate (`npm run check`, run on the PR's final commit before the merge) runs the strategy lab
   with `--ci` and `LAB_STRICT=1` when the branch changes
   a file the lab imports, and a miss fails the gate (a report-only row is
   printed, not failed). The generations lab, which played each kid run in
   order (#314), went with kid runs in #729. The tournament does not read the disk. A factor map (`--factors` on the lab) scales
   prices, growth, output and tending for the length of one run;
   outside a sweep every factor is 1, and an empty map counts as no sweep. The
   rock's hardness and its `layer.<n>.<tier>.hardness` factor (#194, #198) went
   with depth in #740.
   Until #738, `pacing` simulated players on top of them and bought through the catalogue.
   Every number lives here. The drawers read two display rules, none of
   which imports art: `row-view` (types only: one `RowView` for every drawer
   row: its words as fit options, lamp, state, and whether a tap acts; every
   row module sets its lamp by the one lamp rule in `docs/DESIGN.md`, #509)
   and `upgrade-rows` (a lasting upgrade's row, which the stage list reads).
   The board's display rules (`ready-now`, `machine-bays`, `buys-rows`,
   `workshop-rows`, `workshop-sheet`, `key-rail`, and the boost and
   found-tool rows) went with the board (#727).
2. **Saves:** `persist` (the version 10 envelope and `readSave`'s four
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
   and its effects as data (record, log, remember the homecomings, the move's
   result; a band's recipe grant and its save went with depth in #740). It covers ticks, away pay, moves,
   trouble presses and fixes, the news and a new run. The `Mountain` it holds
   is complete (#415): every field is present, with 0 for a cold clock, and
   `undefined` only for a free bench. A loaded save
   is played as it was: no grant is added on load (#558). The news is one
   queue of typed `Notice`s (away, craft, operational, level), in arrival
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
   else more rock dug (`rockDug`, the rock drilling dug in a fresh mine, a
   count that only grows, saved as `run.rock`; `rockDugInAll` added the stones
   mined from the old mountain until #740), else a newer `lastSeen`. A tie between two real copies
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
   records during that read, and the merge keeps the copy that is ahead. Until
   #739 a tap in the gap was dug back onto the merged mountain; the fresh mine
   has no taps (#728). The same account reported again (a token refresh) changes
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
     the card gives the focus back there. The Pass the mine card
     (`legacy-panel`) went with the pass and Legacy (#729).
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
     its element. `board-window` is the frame clock
     (`runBoardLoop`) that `scene-paint` runs, and `float-text` says whether
     the device asks for reduced motion. The board's mine window, its
     machines, the relic plate and its note went with the board (#727), and
     the relic art with the relics (#728). `buys-amount`
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

- **The envelope** (`persist.ts`): `version` (10 since #728, the removal of the
  relics, veins and rush taps; 9 was the fresh mine), `lastSeen`, `startedAt`
  (left out at 0), `rev` and `deviceId` (both or neither), `deviceLabel`, and
  `game`. The rules check only this: `version >= 10` and never lower than the
  stored one, `rev` one past the stored one, `startedAt` never lower,
  `savedAt == request.time`, the device id and label sizes, `game` a map, and
  no other key. A new game fact never needs a rules change.
- **The game map** (`save-format.ts`): `owned` (by tier id), `stock` (stones
  and the four materials), `levels` (upgrade and recipe levels), `clocks`
  (the live craft timers), `marks` (`seen`, `taught`,
  `recipes`, `finds`, `operational`), `run` (`rock`: rock dug, #664; `granite`: the part of it drilled on the Granite, for its iron, refused past `rock` or while the shaft is unsunk, #674; `generation` and `stretch` (#729) and `dug` (#740, the stones mined from the old mountain) are retired keys, read at their caps and never written),
  `engineers` (post `"tunnel"` while away), `expeditions` (each with the
  `home` post), `bench`, `fleet` (by vehicle id, #654), `jobs` (workers by job,
  #689), `piles` (the drilled rock, the rock at the shaft and the rock at the
  kilns, whole and with no upper bound, #703, #666), `makers` (by maker id,
  #666), `stockyard` (its level, a whole number up to the ledger's `stockyard` cap, #666), `granite` (`machines` and `piles`, the Granite's share of each level machine and its three piles; written only once the shaft is sunk, `{}` with nothing on it, #673), `cages` (`assigned`, the hoists assigned to each level, never more than he owns together, and `carried`, what the cages carry by level and not where they are; each left out while all zero, #724) and `project` (the
  building, `state` `delivering` or `onHold`, `step` 0 to 2, the goods
  `arrived` and what of them is `onSite`, not yet built in (#690); left out
  while nothing is ordered), with `operational` buildings in `marks`. A
  project for a building that already stands or is not the next one, a step
  past the roof, more on the site than arrived or than it holds, or a step
  whose goods are all built in reads `bad`. With part 3 (#673), `stock`
  gained `cutStone`, `fleet` the `truck`, `jobs` `graniteDrilling`,
  `graniteHaulage` and `saws`, and `makers` the `saw`. `station` (#674) is
  the factory's work order: its `blueprint`, `state` `delivering` or `done`,
  and for a delivering one what has `arrived` of each good in loads (a clay
  or an iron is 500); left out while the station is idle. A blueprint, state
  or key this build does not know reads `newer`; more arrived than it
  requires, a delivering one already all in, a done one with goods, or a
  work order while the shaft is unsunk reads `bad`.
  Zero and empty are left out; a missing key reads
  as its default, so a new fact needs no version bump. The mountain has no
  `remaining` since #740: depth went, so a save of today reads back the same
  without it.
- **Four answers** (`readSave`): `ok` plays. `newer` came from a later build:
  a version above 10, or a right-typed value this build refuses (an unknown id,
  key or named value, a count past its cap). The store then holds play
  (`playBlock` `"newer"`), records and logs `save.newer`, shows the update
  card once, and writes nothing to the cloud, the phone or the archive
  (`canWrite`). `older` came before version 10: it is set aside (below).
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

- **Single source for rates holds.** All speed and away math goes
  through `effectiveRates`; the screen never multiplies on its own.
- **Import cycle (fixed in #104):** `relics` ↔ `mountain` ↔ `rates` broke at
  module init; `MOUNTAIN_STONES` then lived in the leaf module `scale` (gone with depth in #740). `npm run cycles`
  (part of `npm run check`, the gate) now fails on any runtime import cycle; it
  found one more (`relics` → `mountain` for `minedOut`), fixed by moving
  `minedOut` to `scale` (#118; both went in #740).
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
  `mountain-screen` and its parts were deleted in #727, and the relic
  drawer's modules (`relics`, `relic-rows`, `relic-pages`) with the relics in
  #728.

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
- `rules-drift.test.ts`: `firestore.rules` takes the envelope this version
  writes and the field log (#558); the game map is the client's to read.
- `knip` (strict): no unused files, exports or dependencies.
- `prettier --check .` covers docs too; coverage floors per critical module. The fast tier runs `prettier --check` on every file changed since `origin/main` (`format:changed`).
- Scheduling (#403): independent steps run in parallel, but the heavy lane (`visual`, `journeys` and `lab`, each filling every core) runs one at a time, visual first, so the timing checks never run under the lab's load. The lab is seeded, so a green run records the sha256 of its inputs (the lab's import closure, `package-lock.json`, the Node version, and the step's command, args and env) in `.gate/reuse/<step>.json`. A later run with the same inputs prints `reused (same inputs passed on <sha>)` instead of running, and counts as green for signoff. A red run deletes its record, and CI starts with none.
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
  opens pages (`open`, and `openPair` for two tabs).
  It also seeds a save and controls the page clocks, and presses and holds a
  control as a phone tap (`press`, `holdThrough`,
  `stepTapClock`). Each script chooses its own options: the visual check seeds
  once a tab and can stop `Date.now` and hold the tap clock, the UI audit
  seeds on every load, and `play` seeds once.
  `play -- --tabs 2` opens the save with `openPair` and plays the second
  tab, which shows the other-tab card (#464). `play`, the UI audit and the
  visual check open the phone only (#498). The dev-only boot hooks
  (`parseBootOptions` in `boot`) let the scripts see what a save cannot
  hold: `?saves=two` (the save conflict), `?trouble=cave-in`,
  `?save=loading` or `error`, `?copies=shelf`, `?memorySave=1`, and
  `?update=shown` (the update card, as a newer service worker opens it).
  Outside dev they are ignored.
  `visual-check`, `ui-audit`, `play` and `env-report` all use
  it. The saves they seed come from `tools/browser/fixtures.ts` (#439), typed
  as `SeedSave`: slice 1's saves, each the dev account's phone backup, and a
  later build's save. No script writes a versioned save literal, and
  `fixtures.test.ts` reads every slice save back as the game plays it.
  Today's mountain's seeds went in #738.
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
  document as a guest's, `asGuest`), puts in a seeded `Math.random`
  (`createRng` in `tools/journeys/random.ts`), and installs Playwright's clock paused at 9 pm, all
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
- Claude review (#572): `.github/workflows/claude-review.yml` reviews a PR when it is opened, reopened or marked ready for review. After each push it re-checks (#585, `tools/review/recheck.ts`): every posted review carries a hidden marker with the commit it covered; when the PR's own change is the same as at that commit (only `main` merged in, compared with blob ids and hunk positions dropped), the review stands with no model call; otherwise the reviewer is told to judge only `review-git diff --since-last` and gets the review threads and their replies as data, and posts new findings only. A PR opens after the fast gate, so this runs while the full gate does; the full gate and signoff run once on the final commit. The job also sets the commit status `claude-review` on the head (#587): pending from its first step, and in an `always()` last step green once the review posted, was kept, or was skipped (art only, credit used up, no secret), red when it failed or was stopped. It is a required check on `main` (the `signoff` ruleset, source GitHub Actions, since 14 Nov 2026), so a merge cannot race the review, while an empty credit never blocks one. The `main-protection` ruleset also requires every review thread to be resolved. It runs `claude -p --bare` (Haiku 5.5 at high effort since #744, after Opus 5.5 ran out the credit in about a week; `--max-budget-usd 1`) with the `ANTHROPIC_API_KEY` secret from the Console organization linked to Flemming's plan, whose monthly API credit pays for it; the official `claude-code-action` is not used because that credit does not cover its runs. Claude gets only Read (inside the checkout) and a shell that runs one program, `review-git` (`tools/review/git.ts`, #583), and answers in a fixed shape (`--json-schema`): a summary, and findings with a severity, path, line, title and body. That wrapper takes fixed subcommands (diff, log, show, grep, ls-files) with a few options of its own and builds git's arguments itself, with the pattern after `-e`, revisions after `--end-of-options` and paths after `--`, because git's own options can start a program (`grep -O`) or write a file (`--output`) and a prefix rule in `--allowedTools` cannot keep them out. Like the prompt, it comes from the base commit. Its prompt is built by `tools/review/prompt.ts` (#582): the workflow lists the changed paths (renames as a delete and an add, so a moved file keeps its lens), and `lensesFor` picks the lenses, most important first: guards (`.github/`, `.claude/`, `CLAUDE.md`, the review job, the gate, signoff, function-limit, token, visual and rules-test scripts, lint, TypeScript, Vitest and coverage config, `src/lab/targets.ts` and `guardrails.ts`, the journeys, every `*.test.ts` and snapshot), save (save, persist, backup and cloud files, the progress store, server read, tab writer and lease, the log, the store actions and session, boot, `main.ts`, and `save-on-leave`, which the frame uses to register the hide saves, `firestore.rules`, `firebase.json`, `public/sw.js`, `rules-test/`), code (other `src/`, `tools/`, `scripts/` files, and any text file no other lens takes), game (`src/economy/`, `src/lab/`, the tier, rate, scale, milestone, line, expedition, engineer, upgrade, workshop, hazard, and mountain modules, the `*words.ts` copy) and spec (`docs/`, `mockups/`, `README.md`). The lens texts are `.github/review/<lens>.md`, joined into `.github/review/prompt.md`, which tells the reviewer to read only the part of a long file it needs (#744: every turn re-reads all it has read, and Haiku's price goes up fivefold past 100K tokens of context), and the PR's title, body and the body of each issue it closes are added at the end inside `<pr-intent>`, as data. A PR of art and other binary files only gets no model call, just a note that it was not reviewed. The prompt and lenses come from the PR's base commit (#576), so an older branch still has them and a PR cannot edit the review it gets; a base without them fails the job, with a note on the PR. The next step turns the answer into one PR review with `tools/review/findings.ts` (#584), also from the base: the body carries the lenses, the reviewed commit, the summary, the counts, the model and the run's cost, and each finding is a review thread on its line, or on its file when the line is outside the diff's hunks (GitHub refuses those). A finding in a file the PR does not touch is listed in the body. If GitHub refuses the review, every finding goes in one PR comment instead. The thread that wrote the PR answers and resolves every thread before it merges (ship-sitting). With no secret it posts nothing and sets the status green; with the credit used up it says so and nothing is charged. `signoff` is unchanged. The job can also be started by hand (#586, `workflow_dispatch` with a PR number) to replay the review of a merged PR: it reviews that PR's base and head with the tools on the branch it was started from, on the model and at the effort it is given (#744; empty is what PRs get), posts nothing and sets no status, and keeps the prompt, the answer and what it would have posted in the run summary and as the run's `replay-pr-<n>` artifact for 30 days. The repo is public, so nothing is kept when the text holds the key or a token, and a fork's PR is not replayed; a failed review fails the run. The first replay, of eight merged PRs, is in `docs/review-replay.md`. `node tools/review/tally.ts [--since <date>]` counts, over the merged PRs, the reviews, the findings, the threads fixed (a reply that names the fixing commit), answered and kept, or left with no answer (whether a thread was resolved is not read), the findings that never became a thread, and what the reviews cost.
- Dependabot (#605): alerts and security updates are on in the repo settings, and `.github/dependabot.yml` asks for npm and GitHub Actions updates once a month, minor and patch grouped into one PR per ecosystem; a major's PR is turned into an issue and closed, never merged. A thread runs the full gate and signoff on a bot PR and merges it (ship-sitting, Bot PRs). CodeQL default setup scans every PR, and `main` requires its results (no new High or worse security alert, no new error). The `security-report` workflow (#616) lists the open code scanning and Dependabot alerts every morning at 05:40 UTC into a one-day artifact, because a session cannot read them, and the daily triage files a `fast-lane` issue for each (github-issues, Triage). Dependabot alerts need the read-only `DEPENDABOT_READ_TOKEN` secret; without it the report says they were not read.

## M7 sketch

Staffing (#140), the workers' name (#139), the field log (#141–#143), engineers (#144), expeditions (#146), the side-tunnels sheet (#147), lost tools (#148) and hazards (#149) are built.

- **Names:** player text says "worker"; the id stays `"helper"`. All copy comes from `screen-words`. Built (#139).
- **Counts by id (#559):** the game state holds every tier's count in one record, `Mountain.owned` (`Record<TierId, number>`), the same shape the save's `owned` has. The table in `tiers` (`TIER_ROWS`, `as const`) makes `TierId`, and each machine row carries its line `stage`, so `line`'s `MACHINE_STAGE` and `stageOf` read the rows. `tierRecord(value)` and `machineRecord(value)` build the records keyed by every tier or machine, `owned(mountain, tier)` reads a count and `setOwned(mountain, id, count)` writes one, keeping the rest. A new tier is one row in the table: the game state, the save's `owned` and the field log's rules carry it without a new field. Until #739 `lineOn` lived in its own leaf, `line-switch`, so `tiers` read it without importing `line`; the line is always on now, and the leaf is gone.
- `scale` (leaf, #356; retuned #357; gone in #740): `MOUNTAIN_STONES`, the band scales `BAND_STARTS` and `BAND_SCALE`, and the depth conversions (`shownStones`, `stonesLeft`, `depthAfterStones`, `minedOut`, and `oneOffStretch`, which priced upgrades and promotions) went with depth in #740; the kid-run stretch went in #729. Upgrades and promotions are priced on their own curves, and machines and workers never scaled (`tierCost`).
- `tiers`: each tier's first price, speed, `staff` and door (`FRESH_DOORS`; no tier opens at a depth since #740), and the two growth curves (`MACHINE_COST_GROWTH`, `HELPER_COST_GROWTH`) that `tierCost` applies. `tierQuote` (#358) prices ×1, ×10 or Max of a tier as the sum of `tierCost` unit by unit, the price `buyTier` charges for each in turn. The values are in [Numbers now](DESIGN.md#numbers-now). The `milestones` module (#357) doubles a tier's output at owned-count marks, stacking; the marks are in [Numbers now](DESIGN.md#numbers-now) too. Built (#140). The one-time staffing grants for older saves (#89, #140) went with the fresh save (#558). History (#140): the Great Machine's staff was 25, as staff 15 never ran one in the sim then and reopened a 2.5-day gap with no purchase.
- The line's machines (#533): the hoist (`hoist`) and the locomotive (`train`, the pit train until #680 named it as the slice 1 spec does) are tiers in the line's stages (they carried `line: true` until #739). `tierInPlay(tier)` in `tiers` reads the fresh mine's doors (until #739 it was false for them while `lineOn()` was false, and `tierShown` held the old reveal order), and every place that offers or runs a machine reads it: `buyCrew` and `machinesInPlay()`, the machines the lab measures and reports. `MACHINE_IDS` keeps all six. The screens are typed on `ShownMachineId` (`ShownTierId` went in #738) (every tier but the line's), so no row, bay or art map can show them by accident; #537 and #538 widen them. Save: `hoist` and `train` in the game map's `owned`, left out at 0 (#558). The field log counts them with every other tier (#559). Marks: the hoist takes the cart's, the locomotive the borer's.
- The lab plays the line (#534): the strategy lab plays only the fresh mine (#737), and since #739 the line is the only rule, so every run has the line on. `npm run lab -- --factors id=value,...` adds factors on top (it refuses `fresh.off` and `line.off` by name); the run and the report sit inside `withFactors`, and the report names the factors under its title. History, until #739 (the fresh mine's player places every worker, so none of it is reached): `staffCrew` in `rates` also weighed `staffWith(..., lineHands)` (`fillLine` in `staffing`) for every staffing it tries: the big machines as the search left them, then the one-hand machines picked to lift the line as high as the hands allow (halving on the level, exact for those big counts), and spare hands on the lowest stage that has an idle machine, once with and once without stages already above the line. Because the line is flat while a stage is empty, `staffForLine` also tries every count of the big machines the hands can staff while there are at most 512 (above that, #500's climb alone), and hands the 16 that move the line most to the weighing (8 until #543, when Grandpa's tenth hid a better crew), where the tending can reorder them. `outputShare` in `lab/score` scales the machines' parts to what the line moves, so the tending and crafted deltas stay in the same units. Four report-only measures read it: `narrowRun` and `narrowShare` from the narrow stage each sitting opens on (`SittingEvent.narrow`), `handsCarry` from each sample's `line` view (`lineView` in `line`), and `zeroGainBuys`, machines bought that the line did not need, each kind weighed alone against the same moment without it (`SittingEvent.zeroGainBuys`, `lab/line-view`). Which band's rock applied was one input until #740: `effectiveRates` read it from the mountain's band, with the line's table A (`layerFavours`, #543) and the `layer.<i>.<tier>.hardness` sweep factors; depth went in #740, so no band's rock scales a machine.
- The line's numbers (#543, labs only until slice 1's part 1 is switched on, #664; until #739 they read `lineOn()`, and since then they are the only numbers) live where each number already lived: `readRates` multiplies each machine's speed by `LINE_RATING` (3, `lineRating` in `line`), or in a fresh mine by `FRESH_RATING` where it names one (the cart ×10, 60 a second, so a cart outruns tools at every worker mark and with Work boots, #655, risk 15); until #740 `layerFavours` in `layers` was band table A (`hardnessOf` and the lab's `bands` read it), tough at `LINE_TOUGH`, with the whole-stage form behind the lab knob `rock.stage.off`; `tierCost` in `tiers` climbs `LINE_MACHINE_COST_GROWTH` and starts from `LINE_FIRST_COST` (the first worker and Great Machine); `BAND_SCALE` in `scale` was the line's (the Deep Heart 39.204; `LINE_BAND_SCALE` until #739) until `scale` went in #740. The tending floor in `rates` (a share of `crewOutput`) went in #739: a tended machine gains its engineer's tenths and nothing tops a post up. `bandSuits` named the suited machine for the lab's favoured-machine rows until #740. Until #737 the lab's best-tending dad (`tendBest` in `lab/run`) sent each engineer at home to the post where the line gained most. Until #729 the generations lab played each kid run for up to `KID_RUN_MAX_DAYS` (60).
- `staffing` (#500, gone in #739 but for `moreStones`, the lab's float-safe comparison): `staffMachines` picked how many of each machine the hands ran, the staffing that mined the most stones a second, and `effectiveRates` (`staffCrew`) weighed each candidate with the tending floor and climbed from the best, keeping each answer in a small table. In the fresh mine the player places every worker (`workforce`), so `effectiveRates` is `workforceRun` plus `lineOf`, with no search and no cache key for the line.
- `line` (#532; spec `docs/superpowers/specs/2026-11-14-line-works-village-design.md`, step 1): the face, the haul and the lift. `MACHINE_STAGE`, read from each machine row's `stage` in `tiers` (#559), puts each machine in one stage (carts and locomotives haul, drills and borers work the face, hoists and the Great Machine lift). `stageSpeeds(speed, running)` sums each stage's running machines, `handsSpeed` is every worker and kid (those on a machine still lend their hands), and `lineSpeed(stages, hands)` is the largest T with Σ max(0, T − stage) ≤ 3 × hands: the hands fill the lowest stage up to the next, then both. More hands or a faster stage never lower it (`line.test.ts`). It is always on since #739 (until then the sweep factor `line.off` switched it, `lineOn()` in the leaf `line-switch`, and the fresh mine turned it on): `effectiveRates` reads the crew as `lineSpeed` of its parts (`lineOf`).
- The fresh mine (#653; spec `docs/superpowers/specs/2026-11-14-slice-1-design.md`, rules 1 and 2): slice 1's part 1, in play since #664 (the boot held the switch until #739). Since #739 it is the only rules path: the sweep factor `fresh.off` (`freshMineOn()` in `line-switch`, which also turned the line on) is gone with today's mountain's rules, and each fresh rule stays in the module that owns it: what is dug goes in the stock and the mountain has no depth (`digStones`, `stonesLeft` and the mountain's `remaining` went in #740; `stonesToNextBand` in #739), and what hung on depth (relics, the pass, band arrivals and materials, the rock's lean) never comes. The old workshop's bench never opens (`workshopUnlocked` is false, #740). `createMountain` starts with one worker, on drilling, the horse wagon given and nobody driving or building (`FRESH_START_JOBS`, #703; it was 21 workers on every job from #655 until then). The doors are `FRESH_DOORS` in `tiers` (rule 1's table: `freshDoor`): the cart, the hoist and the drill are for sale from the first evening (kind `start`), and a tier whose door is a later part's (the borer, the locomotive, the Great Machine, kids) is not in play (`tierInPlay`) and is locked with kind `later`, so a reader of `tierLock` alone (Ready now, the bays) never takes it for one on sale. The dig, the vein tap, the Gold rush, Strong arms, Night foreman and the boosts this paragraph once held out of play are gone since #728, with their modules and switches. A promotion waits for the first borer and a free worker (`promotionOpen`, `engineers`). The save gained the fresh mine's own facts with #654 (below); there is no version bump until part 1's switch-on (#664).
- Orders and transport (#654; same spec, rules 4, 6 and 7): `city` holds the buildings (`BUILDING_ROWS`: the Light Tower, three steps of stone, 25,000, 250,000 and 1M, #655) and the one project (`Project`: `unordered`, `delivering` or `onHold`, each with a `Site` of building, step and what has `arrived`). He orders the next building once (`placeOrder`, the first in `nextBuilding` that is not `operational`) and it rises step after step; `holdOrder` and `resumeOrder` are free. `receive` lays goods on the step in hand's site, and `buildIn` starts the next step when one is built in, and with the roof's marks the building `operational` and leaves the city `unordered` (#690, below). `transport` holds the fleet (`VEHICLE_ROWS`: the horse wagon, 500 stone ×1.219 past the one a fresh mine is given, 9 goods a second each, #655; `fleetRate`, `vehiclePrice`, `buyVehicle`). `deliver(mountain, seconds, share)` carries from the pocket to the step, at most what the step still requires, split evenly between goods with what one cannot use going to the others. `orderLimit` says what holds the order back (transport, or a good the pocket runs out of) for the order line, and `secondsToFinish` is when the roof goes on. Live, `accrue` delivers after each dig under fresh. Unattended under fresh, `accrueAway` runs `accrueNight`: drilling works at the night shift output for the first `NIGHT_CLOCK_MS` (eight hours, no stockyard yet), haulage and hoisting go on until the mine's piles are empty (#703, below), and transport carries at that same share for the whole night, which splits where the roof goes on, since the Light Tower's power (`nightShiftShare`, read by `effectiveRates` as `awayPay`) lights the rest at 45% instead of 30%. The moves are `placeOrder`, `holdOrder`, `resumeOrder` and `buyVehicle` in `economy/actions`, listed only in a fresh mine and refused outside it; `valueOf` gives them no income gain (payback Infinity): today's catalogue dad never weighs them, and the lab's part 1 dad orders, holds and buys vehicles through his own planner (`lab/fresh-dad`, #655, below).
- Grandpa (#338, gone since #729): `grandpaPost` put the old dad, at an apprentice's rank, on the biggest running machine no engineer tended, once the Legacy was at least 1. `engineerTenths` in `engineers` counts the engineers' tending alone.
- The building site and the builders (#690; same spec, rule 7.8 to 7.12, call 34): `building-site` holds the site's numbers, kept in one place in case Flemming turns them over: the site holds `SITE_HOLDS` (500 goods) and a builder builds in 8 a second (`BUILDER_BUILDS`, #655; `buildRate`, the workers on `building`; nothing lifts a builder). A `Site` keeps what has `arrived` for the step and what of it is still `onSite`; what is built in is the rest. `receive` (`city`) lays what transport brings on the site, and `buildIn` takes what the builders built in from it and, once what the step requires is built in (`stepDone`, `stillToBuild`), starts the next step in the same state, or with the roof makes the building operational. `stepWork` is the step in hand over a stretch: it finishes the step at the longer of what the builders and transport take, or else runs transport and the builders as a chain through the site with `flowWhole` (`piles`, #703, below), so transport brings no more than the site has room for as the builders make it and the builders build in no more than is on it. `deliver` (`transport`) runs it step by step, live and unattended; on hold, transport brings nothing and the builders still build. `orderNumbers` is what the page shows (what transport brings and the builders build in a second, what is on the site, what the step still requires built in), `orderLimit` adds `builders` as a limit for the lab, and `secondsToFinish` counts each step at the longer of its two times, so a roof built in on hold at night lights the rest of it.
- One workforce (#689; same spec, rule 2): `workforce` holds the jobs (`JOB_IDS`: drilling, haulage and hoisting, one for each stage of the line, driving and building) and `Mountain.jobs`. Every worker he owns (`owned.helper`) is on one job or free (`freeWorkers`); a hire is the worker's `buyTier` and starts free, and `placeWorker` / `freeWorker` move up to a count, for free: the free workers there are, or the ones on the job (#659, the amount key). A vehicle takes one driver, so transport takes no more drivers than he has vehicles (`jobRoom`, `placeable`, #715); a save that holds more is read as it is. The moves are `placeWorker` and `freeWorker` in `economy/actions`, each with its `count`, listed only in a fresh mine and with a count of one for the lab; nothing moves a worker for him, unattended or live. `lineWork` is the line under fresh, read by `effectiveRates`: each stage's workers run the machines that together move the most (`stageWork`, exact, so one more worker or machine never lowers a stage) and the rest work with a tool at three times a worker's speed; a machine takes `staff` workers from its tier row and stands idle without them (`helpersShort`), and the line is its slowest stage, with no spreading. That is the steady line (`crewPerSecond`), which an order's numbers and the lab read; what moves in a stretch goes through the mine's piles (#703, below). Work boots and the worker marks lift only the tools. Free workers count toward the marks. Loading crews counts the workers on haulage (`synergyBonus`, `upgrades`). `fleetRate` (`transport`) counts only the vehicles with a driver, the ones that carry most first. Save: `jobs` in the game map, left out at 0; more on jobs than he owns reads `bad`.
- Slice 1's frame, the game since #664 (#659; slice 1 spec, "The frame, the same on every site", "The workforce", "What Next and the lamps count"): the composition root `frame-screen`, which `main` mounts for everyone. Every boot (`createAppServices`) holds the fresh mine's switch on for the page (`holdFactors`, beside `withFactors` in `economy/factors`); outside the page the factor reads 1, so the unit tests and the labs play today's game unless they set it. While a signed-in save loads (the snapshot is not `ready`), the frame carries `data-loading` and shows its ground alone, since the store holds a new mine until the save is in. The frame's play saves (`start`, `ordered`, `stands`, `structure`, `done`, `busy`, `list`, `night`, `roof`) seed the dev account's phone backup (`dev-dad`, `DEV_BACKUP_KEY`, `seedKey` in the browser harness) and open with `?memorySave=1`. What it shows is worked out in pure views with unit tests: `frame-view` (the order strip: the building in hand, its step and state, and what the step requires with what is built in, or after the part's last roof what is operational; the stockpile, with no room until the stockyard; the workers and the free ones; the hire key, priced by `tierQuote` at the amount), `next-view` (each site's count of what he can afford now: the mine's machines of the line and the upgrades shown in its stages, the city's vehicles; the workforce's own count for the worker's upgrades; hiring is never counted; Next points at a building nobody has ordered, else counts, else says nothing is affordable on the sites and whether the line runs; a site's lamp) and `workforce-view` (every open job, grouped by site, with what its workers run and its count). `frame-screen` and `workforce-sheet` only paint them and dispatch moves: the hire key (`buyTier`, or `buyTiers` at ×10 and Max) in the top row of every site and in the sheet's head, and each job's − and + (`placeWorker` / `freeWorker` with the amount key's count). The amount key is Buys' own: `deviceAmount` and `paintAmountKey` (`buys-amount`) are the one amount on the device, and the hire key dispatches `tierBuyMove` (`economy/actions`), as Buys does. The frame shares `save-on-leave` and `createSaveLine` with the board. The scenes come with their own slivers (#660, #662); until then the middle is the site's dark ground.
- The mine on slice 1's frame (#660; slice 1 spec, "The mine"): `mine-site` fills the frame's middle on the mine's site. Its pure view, `mine-view`, has the Topsoil's plate (`levelPlate`: what the lift brings up now, hoisting's own `now` from `movingNow`, #715; part 1 has no line under it), a key for each stage's strongest machine in play and open (`machineKeys`, priced by `tierQuote` at the amount key's amount and bought with `tierBuyMove`), a row for each stage (`stageRows`: what the stage itself moves now through the piles, from `chainFlows(mineChain(...))` since #703, the pile after drilling and haulage (`pile`), what the stage can move, and who works with what as summands from `rowParts`, which reads `stageWork`; `printedParts` prints them so they add up to the printed total, and `crewTimer` in `rates` scales them under a crew timer) and the scene's state (`mineScene`: where rock piles, the share of tubs that leave full and the time they can unload, each stage's busy share and its machines that run or stand). A machine the stage has the workers for, left standing because tools move more, is the row's third state (`stands`). `mine-scene` draws the scene on a canvas in art px, on the board's `runBoardLoop`: the ground once a height, then the hoists on the surface (lit while they run, dim while they stand), the cage, the workers (those who wait take the slots away from their stage's machines), the tubs with the carts that do not run parked at the shaft end, the piles and the drill, about ten times a second, with the game's sprites. A key and Next's count share `tierOnSale` (`crew`), the rows read `stageMachines` (`workforce`), and the word tables (`plural`, `TOOL_WORDS`, `MACHINE_WORDS`) are in `screen-words`. The − and + on a row are the workforce sheet's own (`job-steps`: `stepper`, `paintSteps` and `listenSteps`, with the no-free-worker note).
- A stage's list on slice 1's frame (#661; slice 1 spec, "What the prototype does not show", "What Next and the lamps count"): a tap on a stage's row in the mine (its words are a button; its − and + stay keys of their own) opens `stage-sheet`, a sheet in the workforce's form. Its pure view, `stage-list-view`, has what the stage moves of what it can move and a line for each part of who works with what (from `stageRows`' parts and their printed moves, `StageRow.printed`; the row in one sentence for a screen reader), each kind of machine of the stage in play with what he owns, its next ownership mark or the reached line (`markLine` in `milestones`), and its key (`machineKey` in `mine-view` and `buildMachineKey` / `paintMachineKey` in `mine-site`, the ones the mine's keys use, at the amount key's amount), and the upgrades shown (`upgradeShown`) whose synergy lifts a machine of the stage (`upgradeStage` in `upgrades`), each read from today's `upgradeRowView` (`upgrade-rows`; its name is `upgrade.name`, the engineering names from #711 (Work boots, Night foreman (gone since #728), Loading crews and Haul roads); its effect and second lines come from `screen-words`, which has a fresh mine's words: Work boots lifts a worker with a tool, and Loading crews counts the workers on haulage) with a key that buys it at the price on the key (`buyUpgrade`) or "Owned". `workersList` is the workers' own part, which `workforce-sheet` shows under the jobs: the workers with their next mark, and Work boots. A stage's row has a lamp, green while `stageCount` (`next-view`) is not zero: its machines at ×1 and its upgrades he can afford. The mine's count on Next and the site bar is the sum of its stages' counts, so the mine's lamp is never green with no row lit. The play save `list` opens the lists' upgrades and Work boots.
- The city on slice 1's frame (#662; slice 1 spec, "The city", "While a part is the end of the game"): `city-site` fills the frame's middle on the city's site. Its pure view, `city-view`, has the transport plate (`transportPlate`: the drivers, what transport is doing, the fleet with the drivers it has of the drivers it takes and what those carry, and the drivers' − and +), a key for wagons at the amount key's amount (`vehicleKeys`, priced by `vehicleQuote` and bought with `vehicleBuyMove`: `buyVehicle`, or `buyVehicles` at ×10 and Max, all or none, #715), the skyline's three plots (`plots`: the Light Tower's, and two vacant), the project's card (`projectCard`: its steps, a bar for each good with what is built in, read from the order strip's `requirements` in `frame-view`; the order key, which lists what each step requires before the order (`Foundation 25K`, `Structure 250K`, `Roof 1M`, from the building's row, #715) and places, holds and resumes the order with what `orderNumbers` brings and builds and the step's time from `orderLimit`; the builders with what each builds in and what is on the site; the building's power; after the part's last roof the strip's line and no order key) and the scene's state (`cityScene`). `city-scene` draws the night skyline on a canvas in art px: the building in hand rises from its own picture, cut at (step + built in) ÷ 3 of its height behind code-drawn scaffold, and stands whole with its lamp lit once operational; a vacant plot has stakes and a rope; what is on the site lies beside it as a heap, the builders work there or wait with a "z", and the wagons drive to it as full as transport brings (the picture's heap of stones cut to that share), stand with a "z" with nothing to carry, or stand empty behind the road with no driver. `scene-paint` holds what both scenes draw with (the noise, rects, lines, glows, the night sky, sprite frames, the "z", heaps, the pictures' loader) and their canvas loop, `runScene`, on the board's `runBoardLoop`. The drivers' and builders' − and + are `job-steps`. The play saves `slice-structure` (the structure rising, a wagon with no driver) and `slice-done` (after the roof) show the city's other states.
- The night report and the frame's cards (#663; slice 1 spec, "The cards", "While a part is the end of the game", rule 4, rule 7.12): `accrueAway` (`mountain`, `accrueNight` until #739) puts `night` on every `AwayReport` (optional until #739), a `NightReport` of the night's facts from timestamps: how long the mine produced, whether the eight-hour clock stopped it, what transport delivered, each step built in (`NightStep`, the night split at every step's end with `transport`'s `secondsToStep`) and the night shift output at its start and end. The session greets a fresh night where anything happened (mined, delivered or a step built in) with its `away` notice, and on a live return too (a tab left open overnight). The quiet note and the `welcomed` flag that held a second greeting back went in #739. `shift-report-view` turns it into the report's words, pure: the head, the night bar and its labels, the lines, `Resume`. `frame-cards` is the frame's one card overlay, one card at a time above the save line: the shift report while the session holds an `away` notice with `night` (its key closes the notice with `progress.dismiss("away")`, as the board's welcome card does), then the end card while the session holds an `operational` notice for the Light Tower (its key closes it with `progress.dismiss("operational")`). That notice is the session's news like a craft: `noteOperational` announces each building that joined `operational` since the `operational` baseline, which `primeArrivals` sets before away pay, so a roof put on in a night or in a short break is told and a save already running it is not. Closing the report leaves the end card. Neither is a save fact. The cards paint only views whose save has loaded (`ready`), and a card coming up closes the workforce sheet. The report's times are `shiftDuration` (`format`) and its shares `percent` (`screen-words`). The end card's words are in `frame-cards-words`, its shares read from the rules (`AWAY_PAY_RATE`, the Light Tower's `power.nightShift`). The play saves `slice-night` and `slice-roof` open on them.

- The save's cards on slice 1's frame (#707; `observable-saves.md`): `frame-save-cards` mounts today's board cards on the frame, over everything else on it, the shift report included: the update card (`createUpdatePrompt`, opened by `showAppUpdate` for a waiting build and once for a save from a later build, which holds play and writes nothing), "Two saves found" (`createSaveConflictPanel`, its confirm a new page) and the other-tab card (`createOtherTab`, Play here). They are the board's panels on the board card shell, on a `BoardHost` of the frame's own (`createBoardHost`), so their presses keep the settle against a double tap. In a fresh mine a save card (`saveCardLines` in `save-sheet-copy`) has no depth, pocket or engineers: it reads the building in hand and its step (`orderStrip`'s name and pips, `STEP_NAMES`), the stone in the stockpile, the machines in the mine's order, and the workers with the horse wagons. The `?saves=two` preview (`save-preview`) holds two fresh mines on the slice preview, so the writer can read them back. The visual check's card table runs the four cards on the slice preview at both phone heights.
- The order strip's key on slice 1's frame (#708; slice 1 spec, "What the prototype does not show"): `frame-ledger` puts one key at the order strip's end (the order's pips move under its step) and mounts today's Ledger drawer (`createLedgerPanel`) in today's sheet clip and scrim (`createSheetScrim`), with Saved copies (`createSavedCopiesPanel`) as a board card over the frame. The sound switch is the Ledger head's `createSoundKey` on `soundSetting`, one choice per device. The frame's `BoardHost` now lives in `frame-screen` and is shared by the Ledger, Saved copies and the save's cards, so one settle covers them all; a card coming up closes the Ledger with the frame's sheets. In a fresh mine the Ledger has two rows from the save card's fresh lines (`freshLedgerRows` in `ledger-rows`, over `freshMineLines` in `save-sheet-copy`): the stone in the stockpile with the project in hand, and the workers with their wagons over the machines. It has no relics row, no Pass the mine and no "i" cards, Start over speaks of the mine (`START_OVER_FRESH_DETAIL`, `Keep my mine`), and the drawer's and Saved copies' way back is `Close`. Tonight words a horse wagon bought (`vehicle.buy`).
- The lab plays part 1 (#655; same spec, Lab), and since #737 it plays nothing else: the strategy lab (`tools/strategy-lab.ts`) plays the player types in `lab/fresh-policies`, to the last building built so far (`runDone` in `lab/run`: the Light Tower's roof in part 1, the Warehouse's with part 2), and judges no guardrail. A fresh type is a plain dad (`freshPolicy` in `lab/plain`) with `FreshHabits` on its `Policy`: when he moves workers (`once` per building, or `idle`: whenever a job has nothing to do), whether he holds (`on-value` or `never`) and whether he weighs upgrades. `playSecond` gives each live second to `playFresh` in `lab/fresh-dad`, which applies his plans until one changes nothing (at most `PLANS_A_SECOND`). `freshPlan`, in order: order the next building; place a free worker (an idle vehicle, a builder once an order is in, else the stage after the fuller pile, #703); for the mover, send drivers and builders with nothing to do to the mine and back, and a stage's spare worker to the slowest; buy the order's fix (`orderLimit`: a wagon with its driver and the builders to keep pace, or a builder) when it pays for itself, saving for it unless the order drains the mine; buy the raise that pays back soonest (`lineRaise`: the slowest stage's best buy per stone, with its workers hired onto it, until the line rises; upgrades too for the optimizer); and hold while that raise pays back sooner than the building takes and the order takes more than half of what the mine makes (`drainsTheMine`, `STARVED_SHARE`), weighed on the mine as it would stand delivering so the mover's moves never undo it. `lab/fresh-view` reads each sample (`FreshView`: the order's limit, a full site, `starved`, the idle workers and the machines tools beat) and the taps that hire and move workers (`workerTaps`, with the amount key on ×10 then ×1), which the sitting log adds up. `lab/sittings` also holds the sample clock (`isSampleSecond`, `dayNumber`, `withFinish`), the sitting clock the reveal log stamps (`createSittingClock`), the machine-buy log `fewestMachineBuys` reads (`createMachineBuyLog`), and the reveal waits `machineRevealSittings` and `smallRevealSittings` read (moved there from the band report and `lab/casual` in #737). The lab's spend table (`actionsOnTable` in `lab/decide`) is every crew, machine and craft buy; `sticker` prices a move. The report-only measures are `transportLimit`, `siteFull` (both over the samples with an order standing), `starved`, `idleWorkers`, `idleMachines` and `workerMoves`; `narrowRun` reads the placed workers' stages (`narrowAt` in `lab/line-view`).
- Every part runs on its own (#703; slice 1 spec, rule 2 "Every part runs on its own", rules 2.10 and 4, "The mine", "The cards"): `piles` is the one mechanism that moves goods through a chain of stages with a pile between each pair. A `Chain` is a `source` (Infinity for drilled rock, or what the pocket holds), each stage's rate and the `Pile`s (`held`, `holds`). `chainFlows` is each stage's rate now: a stage whose pile in front is empty moves at most the stage before it, and one whose pile after it is full moves at most the stage after it, so a pile of room 0 runs the stages in step, as the line did. `chainChange` is the seconds until a pile fills or empties, or the source runs out. `flowChain` is exact over a stretch, in phases of `chainChange`, and `flowWhole` floors each stage's total and recomputes the piles from them, so nothing is made or lost. A pile over its room is full and is never emptied by a lower room, so the room is the lab's to change. The building site's `stepWork` uses it for transport and the builders, and keeps its own split between goods (`shareOut`). `mine-piles` is the mine's chain: `MinePiles` (the `face` and `shaft` piles, whole stones, on `Mountain.piles`, empty on `BARE_MOUNTAIN`), `PILE_HOLDS` (300 each, set by the lab), `mineChain` (drilling, haulage and hoisting from `lineWork`, times the pay, drilling at 0 when it does not drill), `mineChange`, `mineMoves` (whether any stage moves rock now, which Next reads for "Production is running.") and `flowMine`, which adds what hoisting brings up to the stock (`addedStock`; through `digStones` until #740). In a fresh mine `accrue` runs `flowMine` over the whole seconds in place of digging at the line's speed, and `accrueNight` ends each `nightStretch` where a pile fills or empties too, stops drilling at the clock and lets haulage and hoisting drain the piles after it; the report's `producing` is whether stone came up, and its `stop` is `"clock"` only when stone still came up as the clock struck, not when a pile ran out first. Save: `piles` in the game map, no version bump. The lab's dad (`lab/fresh-dad`) moves a worker whose stage stands to `pileStage` (`pileMove` in `rebalance`: hoisting when the shaft pile holds rock and is at least as full as the drilled rock, else haulage when the drilled rock holds rock, else drilling), places a free worker there, and hires the order's driver and builder once the line moves (`orderCrew`); the mover takes a worker off a stage only while the line still moves rock without him (`spares`). `mine-view`'s `stageRows` gives each stage's own `now` and a `pile` line ("Drilled rock", "Rock at the shaft", held of holds), which `mine-site` prints inside the row (`pileWords`), and `mineScene` draws the piles as full as they are and stands a stage that waits on a pile. `frame-cards` has a third card, `first`: the first evening's (`FIRST_EVENING` in `frame-cards-words`), on a session's first ready view while the mine is as it started (nothing ordered, nothing operational, and one worker, on drilling, #715), until Start; it is not a save fact. Flemming approved its words and the two pile labels on 15 Nov 2026. The play save `slice-start` opens on it.
- Goods, makers and the stockyard (#666; slice 1 spec, rules 2, 3, 4 and 6, The save): slice 1's part 2, on in play since #672. The sweep factor `part2.off` in its own leaf, `part-switch`, reads 1 outside a sweep; `partTwoOn()` is true with it at 0 (until #739 only in a fresh mine), which the lab sets and every page holds (#672). With it off, every rule below is inert. `stock` has a sixth good, `brick` (from `kilns` in the goods table). `makers` holds the makers (`MAKER_ROWS`: the kiln, 15,000 stone on a machine's curve, ×1.219 and the `growth.machine` and `price.kiln` factors, 12 brick a second; `makerPrice`, `buyMaker`), open with the Light Tower (`makersOpen`), each running with one worker on the `kilns` job (`runningKilns`, `kilnRate`); `workforce`'s `jobOpen` keeps that job shut before then, and `economy/actions` neither lists nor applies a worker onto a job that is not open. `stockyard` holds the stockyard: open with the Light Tower (`stockyardOpen`), each good's room (`stockpileRoom`: 6M stone and 1M brick at level 0, as the lab set them in #667, and the lab knob `room.stockyard`, ×3 a level, times what the operational buildings give, `stockyardTimes` in `city`), `expandPrice` (150K brick ×3 a level, never above the brick room) and `expandStockyard`, up to `MAX_STOCKYARD_LEVEL` (18, where every room and price is still a safe integer), `priceFits` for "Needs a bigger stockyard" and `stockpileFull`; before it every room is Infinity. `city` has the Warehouse (part 2: stone and brick, `power.stockyard` 2), and `nextBuilding` skips a building whose `part` is not in play. `piles` gained a spill: a `Chain` may name one pile whose overflow, while it is full, goes to a side pile with a room and a `drain`; a full side pile holds the stage before at the next stage plus the drain, one over its room takes nothing, and `flowWhole` gives the whole goods that spilled (`spilled`) so the pile stays within its room. `mine-piles`' `mineChain` carries the line on: hoisting fills the rock at the kilns (`PILE_HOLDS.kiln`, 300, with room only while he owns a kiln) and spills to the stone stockpile, the kilns make brick into the brick stockpile, and each stockpile's room is the stockyard's, drained by what transport takes from it now (`stockDraw` in `transport`, worked out only once the stockyard is open: split evenly between the goods still required, with a dry stockpile giving only what the mine brings it a second and the rest going to the others, as `deliver` shares out; what comes in is `takeIncome`, the chain with transport taking all it carries from every full stockpile, so a full brick stockpile leaves the kilns all the rock they can make into brick and stone only the rest). So a full brick stockpile sends rock to stone, and with both full the line stands (`mineMoves`). `flowMine` returns what reached the stockpiles (`gained`) beside the rock lifted (`mined`), and `chainIncome` is each good a second for `secondsToStep`, which takes an income by good. Unattended, `accrueNight` drops the clock once the stockyard is open (also when the Light Tower's roof goes on in the night), so the mine runs until the stockyard is full; the report's `stop` is `"stockyard"` when the mine stood at the end with its stone stockpile full, and `fullAtMs` says when each stockpile was first full. Its `deadMs` (#667) is how long a stockpile sat full while nothing took its good (`deadStockpiles`), added up stretch by stretch. With the stockyard open, live play runs in the same stretches as a night (`accrueStretches` and `workStretch` in `mountain`), and a stretch also ends where transport's take changes (`drawChange` in `transport`, from the same take and what really comes in: a good's need met, its stockpile dry, a dry stockpile starting to fill, or the site full; a dry stockpile taken at what comes in holds steady, so a long night with transport faster than the mine is a handful of stretches; and a pile that fills or empties within a stretch's first second is taken as filled or empty for it, `chainSettled` in `piles`, so a stockpile a few goods short of its room does not cut the stretch to a second), so the take holds for each stretch and a full stockpile is topped up by what transport took; what it actually takes is still `deliver`'s, and a stockpile that ends a little above its room is full and loses nothing. Save: `makers` and `stockyard` in the game map, `brick`, `kilns` and the `kiln` pile on their maps; no version bump. The moves (`buyMaker` and `expandStockyard` in `economy/actions`, listed only while open and below the last level, logged as `maker.buy` and `stockyard.expand`) came with the lab (#667), and the words come with the refinery's screen (#671).
- The lab plays parts 1 and 2 (#667; same spec, Lab and Starting numbers): with `part2.off=0` (and `fresh.off=0` until #739) the strategy lab plays the same fresh types to the Warehouse's roof (`runDone` still reads `nextBuilding`). `lab/fresh-dad` reads what the mine brings of each good (`goodsIncome`: the running kilns take their rock first, the rest is stone), and `orderLimit`, `orderNumbers` and `secondsToFinish` in `transport` take that income by good (`Dug`). The order's fix is now the best of two by building-seconds saved per stone, each only when it pays for itself (`savedSeconds`): the answer to the order's limit (`limitFix`: a wagon with its driver and builders, or a builder), and a kiln with a worker hired onto it while a step still to build requires brick (`brickFix`, `kilnBuy`), weighed on the whole building, since the roof's brick is made from the first day. He expands the stockyard (`yardPlan`) when a stockpile holds `YARD_NEARLY_FULL` (90%) of its room or the raise he wants costs more than the stone room, if the brick covers it with his hoard; he raises no line into a nearly full stone stockpile; and he moves no worker while hoisting stands with rock to lift (the stockyard is full: `pileMove`). The lab's `World` carries a fresh night's report (`night`, from `step` in away mode), `lab/nights` turns a gap of `NIGHT_MIN_MS` (six hours) or more with the stockyard open into a `NightRecord` (how long, and when the stone stockpile first filled), and the tournament hangs those on the next sample (`DecisionSample.nights`). The report-only measures `nightFull` (the share of those nights a full stone stockpile ended), `nightFullAt` (the median share of the night when it filled) and `deadGood` (`FreshView.deadGood`: a stockpile full while no order delivering takes its good, weighed by time: a minute for each sample with the stockyard open, and each long night's `deadMs`, which the night log adds up stretch by stretch by the same rule (`deadStockpiles` in `stockyard`), `deadGoodShare` in `lab/nights`) join part 1's.
- The refinery's screen (#671; slice 1 spec, The refinery, The cards): part 2 on the frame (play saves `refinery` and `yardfull`). `next-view`'s `siteOpen` and `openSites` open the refinery with the makers (`partTwoOn` and the Light Tower); the site bar hides a closed site's tab, Next and the lamps count open sites only (the refinery's count: a kiln, and an expansion he can afford), and `workforce-view` groups its `kilns` job under it. Its pure view is `refinery-view`: the kilns' plate (the recipe from `makerTakes`, what the kilns make now of what they can, who runs which kiln and who has none, the rock at the kilns, and the key for one more kiln with its price and the worker it takes), the Topsoil's rate into the hopper and the bypass to stone (`BYPASS_RECIPE`), the stockyard's bays (brick, then stone, each with its room and full), its expansion (`EXPAND_GIVES`), and `nightForecast`, which plays twelve hours on a copy with `accrueAway` and says when the stockyard fills. `refinery-scene` draws the flow on a brick wall (the hopper as full as the kilns' pile, the kiln sprites lit while they run, falling rock, brick and stone) and the stockyard's strip; `refinery-site` paints them and dispatches `buyMaker` and `expandStockyard`, with the kilns' − and + from `job-steps`. `frame-view`'s `stockpiles` give the top row both goods with their room once the stockyard is open. The night's facts gained `produced` (each good that reached the stockpiles), so `shift-report-view` says what each good made, `Stockyard full: production stopped.` when the stockyard stopped it early, and `marks` for when each stockpile filled; `frame-cards` shows the marks and a second key, `To the stockyard` (`toStockyard`), which closes the night and takes the frame to the refinery. The city's completion line says what a building adds (`powerWords` in `frame-cards-words`: `On completion: night shift output 45%, up from 30%.`, ` Opens the refinery.` in part 2, and the Warehouse's `stockyard capacity ×2.`). In part 2 the Light Tower's roof brings `refineryOpens()` (its power and what the new site does, its recipe read from `makerTakes`) in place of the end card, which waits for the Warehouse's roof (`endCard(building)`, the building's power words and the line that more is being built). The kiln's key is the mine's own (`buildKeyFace` and `paintMachineKey` in `mine-site`), the kilns' pile line is the mine's (`PILE_LABELS`, `pileWords` in `mine-view`), and the bays read the top row's `stockpiles` in `BAY_ORDER` (brick, then stone), the order the report's marks keep too. The visual check's `slice refinery` sections run the site and the stockyard's report at both phone heights.
- The factory's screen (#681; slice 1 spec, The factory): part 3 on the frame, on a dev page with `?part3=1` (`boot`, devMode only) until #682 switches part 3 on; play saves `factory`, `factoryorder` and `factorydone`. `next-view`'s `SITES` gain `factory` between the refinery and the city, open with the shaft (`stationOpen`); its count is 0, since a work order costs nothing to place, and its lamp is amber while a work order is delivering and green while one is done. Next points at a done work order (`kind: "install"`, "Next · Factory", "Install iron rails") after a building nobody has ordered, and a tap on it goes to the factory. `workforce-view` gives the factory no group (it takes no workers in slice 1). Its pure view is `factory-view`: the head (`installed`, the live timers from `hotTimers`), the bins (`MATERIAL_HOLDS`), the station (idle; delivering with what arrives a second from `orderShares`' station share, each good's count of what it requires, and how far it is in loads; done with its effect, Install while `installable`, and Cancel), and the blueprints (`BLUEPRINT_IDS`, each with `effectWords` from the recipe's effect and its strength factor, its level of its last, what `workOrderPrice` requires and whether the stockyard holds less, and open, busy or installed). `factory-scene` draws the bench in code (planks, the tool rail, the bins, the station's plate) with the clay and iron sprites, and the work order's gear dim and lit from the left as far as its goods have arrived; the five gears' drawings (`drawGear`) are its own, in colour on the station and in line on a blueprint. `factory-site` paints it and dispatches `placeWorkOrder` (a tap on a blueprint, or a drag up onto the station: the strip scrolls sideways with `touch-action: pan-x`, and a copy of the card follows the finger), `installWorkOrder` and `cancelWorkOrder`. `city-view`'s transport plate says "serving the factory" or "shared: city, factory" while a work order is delivering, and the wagons drive while they carry it. The visual check's `slice factory` sections run idle, delivering and done at both phone heights, the strip's far end, and a drag onto the station.
- Part 2 is switched on (#672; slice 1 spec, How it would be built, Proof): `boot`'s `createAppServices` holds `part2.off` at 0 (beside `fresh.off` until #739) on every page, dev or build, as #664 did for the fresh mine; outside the page the factor still reads 1, so unit tests and labs play what they set, and the journeys' rules (`tools/journeys/expected.ts`) hold both as the page does. No save change: part 2's facts were in the game map since #666, so a part 1 save whose Light Tower is operational opens the refinery on its next open. That save never saw the refinery's card, so `frame-cards` greets a session with it, as it greets the first evening (one `GREETINGS` table, decided on the session's first ready view, not a save fact), while the refinery is open and untouched: no kiln, the stockyard as it opened, nothing more ordered. Unlike the first evening's card it also waits behind a night's report. The play save `partonedone` and the journey `part-one-save` open on it. `city-scene` draws the Warehouse on the second plot (`BUILDING_URLS`, `buildingX`: 5 into the 56-wide plot) and lays the building in hand's yard out per plot (`siteYard`: the heap and the builders on the first plot's free ground beside the Light Tower, since the second plot has no room beside the Warehouse); `city-site` gives each of the card's bars its own good's picture. The visual check's `slice roof` night now brings the refinery's card behind the report, and `slice warehouse roof` (`sliceWarehouseRoofSave`) the end card; the `warehouse` save runs the Warehouse's site. The journeys `stockyard-full` (a night the stockyard stops, its report and marks, `To the stockyard`, both stockpiles full) and `night-builds` (the Warehouse's roof built in a night, then its end card and the planning strip) are part 2's, and `first-evening` ends on the refinery's card.
- The kilns' recipe (#723; slice 1 spec, rule 3 and Starting numbers, as amended in #722): behind part 2's switch, on in play since #672. A maker's row in `makers` has `takes`, the rock it takes for one of its good: 2 rock for 1 brick at the kiln. `makerTakes` reads it, and a lab sweep of `recipe.<id>` scales it, rounded to whole rock and never under one, so whole goods stay whole. `kilnRate` is the brick a second the running kilns make; the chain takes the recipe's rock for each. `piles` gained recipes for this: a `Chain` may give each stage a whole-number `takes` (1 when left out), what it takes from the pile in front of it for each it makes. A stage's rate and total stay what it makes; its pile goes down by its take times that, a stage with an empty pile in front (for a recipe, one holding less than one take, so a part-brick's rock never counts as a kiln at work) makes at most what the stage before brings over its take, a full pile after a stage holds it at what the stage after takes, and the spill is what comes in beyond that take. `flowWhole` recomputes the piles from the floored totals times the takes, so the rock that leaves the kilns' pile is the brick made times the recipe. The rock of a part-brick stays in the kilns' pile, or bypasses to stone while the stone stockpile has room or transport drains it; a full stone stockpile that nothing drains never grows, and the rock waits in the kilns' pile over its room (by less than one recipe), which holds hoisting until the kilns take it. `mine-piles`' `mineChain` gives the kilns `makerTakes("kiln")`; a rock that bypasses is still 1 stone. No save field.
- The shaft, the Granite and the levels' jobs (#673; slice 1 spec, rules 1, 2, 3, 5 and 7, Starting numbers, The save): behind part 3's switch, off in play. The sweep factor `part3.off` sits beside `part2.off` in `part-switch`; `partThreeOn()` is true only while part 2 plays and it is at 0. Boot never sets it, so every page reads it as 1 and every rule below is inert until a later sliver switches it on; the labs and tests set it. `mine-levels` holds the mine's levels (`MINE_LEVEL_IDS`: the Topsoil and the Granite) and `Mountain.granite`, the `Granite` union: `unsunk`, or `sunk` with its own `machines` (the cart, drill, borer and locomotive, `LEVEL_MACHINE_IDS`) and `piles` (drilled rock, rock at the shaft and rock at the saws), so a machine or a pile on a level that is not open cannot be written. `shaftOpen` is part 3 with the Light Tower operational and the shaft not yet sunk; `sinkShaft` pays `shaftPrice` (10M stone and 1.5M brick at once, scaled by the lab knob `price.shaft`) and leaves the Granite sunk and empty. `openGranite` is the sunk Granite while part 3 plays, else nothing (it reads the save before the switch, so a mine without the shaft asks no factor), and `graniteOpen` whether it is open. `levelMachines` is a level's machines: the Granite's own counts while it is open, the Topsoil's what he owns less those (what he owns, uncopied, while it is shut). `withGraniteMachine` adds one machine to the Granite and pays nothing, since the move buys first. `workforce` has three new jobs, `graniteDrilling`, `graniteHaulage` and `saws`, shut by `jobOpen` until the shaft is sunk (the saws' with the saw, `makerOpen`). `LEVEL_JOBS` maps each level's drilling and haulage to its job, and `drilling` and `haulage` stay the Topsoil's shipped ids. `levelWorks` runs a level's workers on that level's own machines; hoisting keeps every hoist he owns for the one shaft. `LineWork.levels` gives each level's drilling and haulage (the Granite's 0 while shut), and with the Granite open the `line` is hoisting or both levels' slowest stages added, whichever is less. `haulageWorkers` counts haulage on both levels while the Granite is open, and the Topsoil's alone while it is shut, which Loading crews reads (`synergyBonus`, and its words in `screen-words`). `makers` has the saw (25,000 brick on a machine's curve, 30 cut stone a second, 3 rock for one, run from the `saws` job); each row names its job, `makerOpen` opens the kiln with the kilns and the saw with the Granite, and `runningMakers` and `makerRate` are what `runningKilns` and `kilnRate` now read. `stock` has a seventh good, `cutStone` (from `saws` in the goods table). `stockyard` gives cut stone a room only while part 3 plays (250,000 at level 0, on the same levels and powers as the others); it stays out of `ROOM_AT_ZERO` and `STOCKPILE_GOODS`, so the frame's stockpiles and the night's full times do not change. `tiers` prices the borer and the locomotive in cut stone in part 3 (40,000 and 60,000 on the line's curve, `tierGood`, read by `tierQuote` and the price a buy pays), and `tierInPlay` lets the Granite's door through while part 3 plays; `crew`'s fresh lock opens that door once the shaft is sunk. `line` rates the locomotive at 1,600 (`FRESH_RATING`). `transport` has the truck (150,000 brick ×1.219, 400 goods a second, none given), for sale only while part 3 plays and the Warehouse is operational (`vehicleOpen`, which `buyVehicle`, the moves, the city's keys and Next's lamps read). `piles` gained chains side by side: `Branches` holds one `Branch` per level, sharing one rate at a stage (hoisting) and one side pile (the stone stockpile). `evenShares` splits a rate between wants as `deliver` does, and `stockDraw` now uses it; `branchChains`, `branchesChange`, `branchesSettled` and `flowBranchesWhole` are `chainFlows`, `chainChange`, `chainSettled` and `flowWhole` for a set. Until #724 (ruling 4), the hoist's lift is shared evenly between the levels and both levels' rock bypasses to the one stone stockpile. `mine-piles` runs the Topsoil alone as before while the Granite is shut (ruling 6), and both levels side by side once it is open: the Granite's branch is its drilling and haulage, its own drilled rock and rock at the shaft (an internal `GRANITE_PILE_HOLDS`, 300 each), the saws' pile (room from the makers' rule, the internal `makerHolds`, the same room as the kilns' pile and none until he owns a saw), the saws and the cut stone stockpile. `mineSettled` and `mineMakes` give `mountain` the settled income and whether either level works, `mineChange`, `takeIncome` and `flowMine` read both levels, and `flowMine` writes the Granite's piles on `granite.piles` and cut stone on the stock. `mineChain` stays the Topsoil's, which the screens read until #680. The moves are `sinkShaft` and `buyGraniteMachine` in `economy/actions` (`LevelAction`), listed by `levelActions` only while the shaft can be sunk, and then for each level machine on sale once the Granite is open; `levelApplied` buys a Granite machine through `buyWithTeach` and places it on the Granite only when he owns one more, so a refused buy changes nothing. They are logged as `shaft.sink` and `granite.buy`, and `valueOf` gives them no income gain. Save: `granite` in the game map (`machines` and `piles`, written only once sunk, `{}` when sunk with nothing on it), `cutStone` in `stock`, `truck` in `fleet`, the three jobs in `jobs` and `saw` in `makers`; the reader refuses more Granite machines than he owns, and workers on the Granite's jobs or the saws, or a saw, while it is unsunk. No version bump.
- The factory without a clock (#674; slice 1 spec, rules 5.13, 7.7 and 7.13, Where today's parts land, The save): behind part 3's switch, off in play; the plan's rulings are in `docs/superpowers/plans/2026-11-16-the-factory.md`. `factory` holds `Mountain.station`, the `Station` union: `idle`, `delivering` (a blueprint and what has `arrived` of each good, in loads, so a clay can be part carried) or `done` (waiting to be installed). `stationOpen` is the Granite open (the factory opens with the shaft). `BLUEPRINT_IDS` are the five recipes whose materials an open level gives (iron rails, sturdy props, blasting charge, reinforce, axle grease); `workOrderPrice` is what each requires, stone as the lab sized it and the materials as today's recipe, scaled by `recipe.<id>.cost` (today's `recipePrice` keeps today's numbers for the old bench). `loadOf` counts a clay or an iron as 500 stone of a load. `placeWorkOrder` (free, an idle station, a gear below its last level), `cancelWorkOrder` (what left the stockyard comes back in full, a done one all it required) and `installWorkOrder` (`fitGear`, from the moment of the tap) are the moves; `loadStation` carries whole loads split evenly between the goods it can take (`loadable`), takes a good from its stockpile whole when its first load goes, and makes the work order `done` when everything has arrived. `withMaterials` gives one clay for each 1M rock drilled on the Topsoil (`rockDug` less `graniteDug`) and one iron for each 1M on the Granite (`graniteDug`, counted in `flowMine` where the Granite drills), up to `MATERIAL_HOLDS` (10 clay, 35 iron), only while the station is open; `workStretch` adds them after the mine flows. `workshop` keeps the recipes, their effects and the live timers; `fitGear` is the old bench's fitting from a moment, which `settleBench` and the station share. `transport`'s `orderShares` splits the fleet's rate (rule 7.7): with both orders delivering each gets half, and what one cannot use (a full site, a material it waits for) goes to the other; alone, an order gets it all, and with the station idle the city's part is the whole rate, so every path is as before. `deliver` loads the station first (`toStation`) and gives the city the rest; `stockDraw` adds the station's take to the city's, and a dry stockpile gives the city what comes in less the station's take; `drawChange` also splits a stretch where the work order's need is met or its stockpile runs dry; `secondsToStep`, `orderLimit` and `orderNumbers` read the city's part. The moves are `placeWorkOrder`, `cancelWorkOrder` and `installWorkOrder` (`FactoryAction` in `economy/actions`), listed only while the station is open, logged as `work.place`, `work.cancel` and `work.install` (the gear's level), with no income in `valueOf`. `lab/work-orders` times each work order against `PART_THREE_START` in `lab/targets` (the lab's players at the Warehouse's roof: 320 goods a second, half for the work order) for its sizing; #675 replays the whole slice. Save: `station` in the game map and `granite` in `run`. No version bump.
- Hoists that travel (#724; slice 1 spec, rules 5.5 to 5.14, Starting numbers, The save): behind part 3's switch, off in play; the plan's rulings are in `docs/superpowers/plans/2026-11-16-hoists-that-travel.md`. From part 3 hoisting is cages, with one level open as with two. `cages` holds the cages and never moves rock: `cageKeys` gives every winding engine, then every hoist he owns, then the winch, each with a stable key (`machine:0`, `hoist:2`, `winch`), so a new hoist moves no other. `tripSeconds` is a trip down and up again, the same for every cage: 10 s to the Topsoil and 20 s to the Granite, whole seconds, never under 2, scaled by the lab knobs `trip.topsoil` and `trip.granite`; `legSeconds` halves it, down floored. `shaftCages` gives each cage its load (its rating times the Topsoil's trip times pay; the winch's is its workers' tools, capped at one hoist's rating), whether hoisting's `stageWork` runs it (the first `running` of each kind, the winch while hoisting has workers on tools), and what it serves: walked in order, the first `assigned.topsoil` the Topsoil, the next `assigned.granite` the Granite, the rest and the winch both in turn, and all the Topsoil while one level is open. `cageRates` counts them as rates (rule 5.14): a cage for one level lifts its load in that level's trip, and the cages for both add their loads as `loads`, lifted once a round of the levels in the turn. `cagePileRoom` is the room of the rock at the shaft on both levels and of a maker's pile: max(300, ceil(max(3, cages) × `piles.loads` × `largestLoad`)), at least three loads and one for each cage past three. `largestLoad` counts the winch's cage too, so the room follows hoisting's workers and can shrink when workers leave hoisting; a pile over its room is full and loses nothing (#703 ruling 2), which #680 reads in place of `PILE_HOLDS`. The drilled rock stays 300. `Mountain.cages` is `Cages`, the hoists assigned by level and the `trips` of the cages that are not fresh (`Cage`: its level, what it carries, and its leg, `top`, `down`, `loading` or `up`); a fresh cage is empty at the top, last at the Granite for an even place and the Topsoil for an odd one, so the cages for both start staggered (`cageAt`). `assignHoists` puts up to a count of unassigned hoists on a level, free and at once, only while the Granite is open; `unassignHoists` takes them off at any time; `unassignedHoists` is what is left of `hoistsOwned` (hoists and engines). `cage-trips` plays an instant: `cageInstant` takes each cage in order through arriving, unloading at the top into its level's maker pile then the stone stockpile (waiting with what finds no room), going down (a cage for both to the other level if it is in the turn), loading the rock at the shaft and waiting for a full load while it has one level to serve and rock is coming (rule 5.9); a cage whose workers are taken finishes its trip and stands (rule 5.11). `landCages` brings every cage to the top and unloads it. Rock moves only through `piles`: `pour` pours a whole load into piles in order, each up to its room, and `Branches.shared.turn` (the loads of the cages for both and each branch's trip) replaces #673's even split, so each level in the turn takes `loads / Σ trips` strictly in turn and what one cannot use is not handed to the other. `mine-piles`' `mineWork` keeps the stages, the levels, the cages at pay 1 and their `lift` (`cageRates`, undefined with part 3 off) once per answer of `effectiveRates`; `shaftHolds` and `makerHolds` are the cages' rooms from part 3 and 300 before it. `lineWork` gains `LineWork.hoisting`, the stage work it already computed; `line` and `stages.lift` are unchanged. `mine-cages` is the live loop: `flowMineLive` plays the mine trip by trip, an instant at each whole second where something happens and `piles`' chains between, with the first waiting cage at a level as that level's last pile; `landedMine` lands the cages before a night (ruling 13), what lands counting as produced. `accrue` chooses: with `live` and part 3 on, cages (`flowMineLive`); away and unattended, rates (`flowMine`), and `accrueNight` lands the cages first. With part 3 off, `flowMineLive` is `flowMine`, `landedMine` returns the same mountain and every room is as before. The moves are `assignHoist` and `unassignHoist` (`{ level, count }`, in `economy/actions`), listed with count 1 only once the Granite is open, logged as `hoist.assign` and `hoist.unassign` with the level and its count after the move, and given no income by the lab (#675). Save: `cages` in the game map (`assigned`, `carried`), no version bump. A read puts each level's carried rock in the next cage in order at the top, the Topsoil first, and refuses more hoists assigned than he owns, any assigned or Granite rock while the shaft is unsunk, and rock from both levels with no hoist or engine; `save-merge` settles the cages as it settles jobs.
- The mine with two levels (#680; slice 1 spec, The mine, rules 5.1 to 5.4 and 8; plan `docs/superpowers/plans/2026-11-16-the-mine-with-two-levels.md`, whose rulings are the plan's own): behind part 3's switch, off in play; with part 3 off the mine paints and plays as before (a snapshot test pins its DOM). The two-level layout shows while `partThreeOn()` and `graniteOpen` both hold (ruling 1); with part 3 on and the shaft not sunk, the one-level layout shows with the Granite's plate under the Topsoil. The views are pure, in `mine-level-view.ts`: `levelsView` reads the mine with two levels once a paint (`levelsWork`) and gives the levels, Hoisting's row and the strip together, which the site paints and the scene draws (`twoLevelScene(mountain, view)`); `mineLevels`, `hoistingRow` and `hoistStrip` read it. `mineLevels` gives each level's two `StageRow`s (built from `stageMachines(mountain, speed, stage, level)` and that level's jobs, its "now" from `mineLevelFlows`, the level's flow through the piles at pay 1) and its two piles (`levelPile` in `mine-view`, the one rule the one-level rows use too: the drilled rock's room is `faceHolds`, the rock at the shaft's `shaftHolds`, the cages' room once part 3 plays, so with the Granite unsunk the one-level row and scene read the cages' room as well); `hoistingRow` is Hoisting's one row, whose "can" is what the running cages lift as assigned (`cageRates`) and whose "now" is the shared hoisting's flow, so the row and a night agree; with one level it is the one-level hoisting row; `hoistStrip` is the three cells `topsoil`, `granite` and `both` (counts `cages.assigned` and `unassignedHoists`, rates of the cages each serves; it throws with one level) and `shaftGate` is the plate before the shaft and the Sink key's price (`shaftPrice`). `HOIST_WAITS_LINE` and the other new lines are exported from there, one copy for the site and its tests. `twoLevelScene` is the scene's view: each level's `levelScene` (in `mine-view`, the rule `mineScene` uses for the one level: each stage's crew with the share of its rate it moves now, `StageRow.busy`, its piles' shares of their rooms, tubs that leave empty off a bare pile and queue at a full one), hoisting's crew, and every cage from `mineWork(m).cages` and `cageAt` as a `CageSprite` with its depth (0 at the top, the level's depth while loading, linear in the seconds left of `legSeconds` on a leg, a full tub while `carried > 0`); cages at the top collapse into one sprite. `mine-site.ts` paints either layout and builds the Granite's parts lazily; `mine-levels-site.ts` holds the two-level parts (each level's rows on its gallery with that level's piles under it, Hoisting's row, the strip) and the Granite's gate; `mine-row.ts` is the row both layouts share. A tap on a strip key dispatches `assignHoist` or `unassignHoist` by the amount key's count (`moveCount`: 1, 10 or all there are), and a tap that moves nothing (a dark key, a cell's name, the both cell) writes `HOIST_WAITS_LINE` in the mine's note (`flashNote` and `dropNote`, one timer per note). With two levels, a tap on a drilling or haulage machine's key, the mine's or one in a stage's list (`buildMachineKey` in `mine-site`), opens `machine-card.ts` (`openMachine(id)` on `FrameState`, shown and closed as a stage's list is) and buys nothing by itself: the machine's key (`machineKey` on the paint's clock, so the card's rate is the key's), each level's count of that kind, one key per level, and `Not now`. The Topsoil's key dispatches `tierBuyMove`, the Granite's `graniteBuyMove`; `buyGraniteMachine` takes a `count` (`{ kind, id, count }`, priced as `buyTiers` is, logged `granite.buy` with it), and the lab lists it with count 1 only while part 3 is on, so part 3 off lists the same actions. `machineKey` reads `tierGood(id)`: the borer and the locomotive cost cut stone (`price-icons.ts` gives the price its icon), and with part 3 off every machine costs stone. The workforce's mine group splits once the Granite is open: `jobSites` returns Topsoil (drilling, haulage), Granite (the Granite's drilling and haulage) and Shaft (hoisting), each group with a key, and the sheet rebuilds its groups when that key changes; a level row's note counts that level's machines, and its − and + name the level (`JobRow.title`, "Put a worker on granite drilling"). A tap on a level's row opens that level's list (`openStage(stage, level)`; `stageList(..., level)`): its title is the row's ("Granite drilling", `levelStageTitle`), its numbers the level's row, and each machine's count the level's (`stageMachines(..., level)`), while its next mark counts every one he owns. Hoisting's list reads `hoistingRow`, so it says what Hoisting's row says. The scene (`mine-scene.ts`): `LEVELS` is the two-level geometry (height, gallery, floor, piles line), the shaft runs to the Granite's floor, each level draws its own crews, tubs, heaps and drill, and each cage hangs at its depth. The trips step once a second, so drawn depths ride toward them at 1.25 times a cage's speed, matched shallowest first, and snap on a new count or a gap over half a level. Hoisting's workers stand by the shaft on the Topsoil, with a "z" over the idle share. Nothing new is saved (version 10). Dev saves `granite-unsunk` and `two-levels` (`tools/browser/fixtures.ts`, `?part3=1`); the visual check has `slice mine two levels` and `slice mine two levels from the Sink`; the audit shot is `slice-mine-two-levels`. The pit train is the locomotive on screen (`tiers`, `MACHINE_WORDS`; the slice 1 spec's Names), its id still `train`. Out of this sliver: the card for a level reached, the saws' plate and the trucks' key (#754), and the lab's numbers (#675).
- Saws, trucks and the Granite's card (#754; slice 1 spec, 3. Goods and makers, The refinery, The city, The cards, What Next and the lamps count; plan `docs/superpowers/plans/2026-11-16-saws-trucks-and-the-granite-card.md`, whose rulings are the plan's own): behind part 3's switch, off in play; with part 3 off the refinery, the city and the cards paint and play as before. The refinery's pure view reads a plate for each open maker and a hopper for each level. `makers`' `refineryMakers` is the kilns, and the saw too once `makerOpen` (the Granite sunk); the plates, the refinery's count in Next and the lamps (a maker he can afford) and the workforce's refinery jobs (`refineryJobs`, Kilns then Saws, each note from `makersNote`, `1 of 2 saws run` or `No saws yet`) all read it, so the refinery's jobs have one home and `SITE_JOBS` holds the other sites'. `refinery-view`'s `KilnPlate` became `MakerPlate` (`makerPlate`: its name from `JOB_NAMES`, its unit from `GOOD_WORDS`, its recipe from `makerTakes`, its plurals from `MAKER_WORDS`, and a key whose `good` the site reads for its icon); the kilns' words are as before, and the saws' read `Recipe: 3 rock → 1 cut stone`, `SAWS 30 of 30 cut stone/s`, `1 of 2 saws: 1 of 2 workers`, `Rock at the saws: N of M` (`PILE_LABELS.saw`) and `+Saw · 30/s` with its brick price and `1 to run`. `RefineryView.plates` and `hoppers` replace `plate` and `hopper`: `mine-view`'s `levelHoppers` reads `mineLevelFlows` once for each of `openLevels` (moved to `mine-levels`, which `mine-cages` reads too) and gives each level's name and lift, which the plates' income and the scene read. `mine-piles`' `graniteChain` is the second of the level chains (undefined with one level) and `chainMade` a chain's maker flow; the kilns read `topsoilChain` and the saws `graniteChain`. The bypass to stone is both levels' spill added, read steady: `steadySpill` gives, while a maker's pile is within one load of the largest cage (`largestLoad`) of full, what the chain spills with that pile full, so the number holds between the cages' unloads; with part 3 off there are no cages, the load is 0 and it is the old instant spill. With no saw, the Granite's rock all bypasses. `frame-view`'s `stockpiles` and `bayOrder` add cut stone after stone and brick once the saws open (`withSaws`), with its room from `stockpileRoom`; `STOCKPILE_GOODS` and `BAY_ORDER` are unchanged, so the night's report and the lab still read two goods. The top row has a third pile (`data-good="cutStone"`, `res-cut-stone`), hidden while there is no such stockpile. `refinery-site` builds one plate's parts per maker id and builds them again when the ids change (`buildPlates`), sets `.two` on the site while the saws are open (the plates side by side, each with its words over its − and +, and the level names in plain letters at the hoppers' edges, `.refinery-in-topsoil` and `.refinery-in-granite`), and each plate's key is the mine's (`refinery-maker-key`, `refinery-<id>-key`). `refinery-scene` takes a layout: with the saws, `paintWall` adds the Granite's hopper on the right and moves the bypass chute to the middle, `drawMakers` draws the kilns and up to two saws (`mach-saw.png`, `mach-saw-dim.png` while not running, dust and cut stone falling while they make), and the stockyard's strip splits into thirds (`baySpan`, `postsX`) with cut stone stacked as brick is. The city: `VehicleKey` has `good`, its label's good word from `GOOD_WORDS`, so the truck's key reads `+Truck · 400/s` with `150K` and the brick icon (`priceIcon`), its aria-label `Buy a truck for 150K brick. …`. `city-site` builds each vehicle's key with mine-site's `buildKeyFace` and paints it with `paintMachineKey`, one per `VEHICLE_IDS` entry (`data-vehicle`), shown while `vehicleKeys` offers it, beside the wagon's in the same row. `vehicleHint` is `Trucks: after the Warehouse` while part 3 plays and the building in hand (ordered, on hold or next) is the Warehouse, painted as a dark cell that is not a button (`.city-hint`); with the Light Tower in hand, the Warehouse operational, or part 3 off, there is none. `completion` reads `opens(id)`: the Light Tower's ` Opens the refinery.` from part 2, and the Warehouse's ` Opens trucks.` in part 3. `CityScene.driven` and `undriven` are counts by vehicle (`Record<VehicleId, number>`, from `drivenFleet`, which gives the drivers to the trucks first); `city-scene`'s `roadVehicles` lists the kinds to draw, the best carriers first, as many as fit as before, and `drawVehicle` draws each from its own picture (`truck.png` for a truck, its bed from `BEDS`), so a wagons-only fleet paints as before. The card: `Notice` gains `level` (`level: "granite"`). `Baselines.granite` is whether the Granite was open (`graniteOpen`, so part 3 off never raises it), primed with the others in `primeArrivals`; `noteGranite` raises the notice once when it opens past the baseline, then moves it. A save already sunk when it loads, or a copy that comes into play rebased (a guest resume, a restore from Saved copies), primes it true and is not news; a cloud copy taken over while the game is open keeps the baselines, so a shaft sunk on another device is told here, as the end card is. `ARRIVAL_KINDS` is the one list of arrival notices that a fresh open and a new run drop. `frame-cards` shows `{ kind: "level" }` after a night's report and before a building's card, in `LEVEL_REACHED`'s words (`frame-cards-words`: `The Granite: reached`, four paragraphs, `Continue`), and `noticeOf` gives each card the notice its key dismisses. Neither the notice nor the baseline is a save fact, so a kill between the Sink and `Continue` loses the card, as it loses the end card. Nothing new is saved (version 10). Dev saves `warehouse-trucks` (new, the Warehouse operational with the brick for a truck) and `two-levels` (now two saws, one staffed, and the kilns' and the saws' piles full), both on `?part3=1`; the hint is `warehouse` with `--search '?memorySave=1&part3=1'`. The visual check has `slice refinery two levels`, `slice city trucks` and `slice card granite` at both phone heights, and `slice mine two levels from the Sink` closes the card before its checks; the audit shots are `slice-refinery-two-levels`, `slice-city-trucks`, `slice-city-trucks-hint` and `slice-card-granite`. Out of this sliver: the Light Tower's line for the Granite's price, the Warehouse's and the Foundry's cards in part 3, and the switch-on (#682), and the numbers (#675).
- `engineers` (rules layer, pure): `Engineer = { name, rank: 0 | 1 | 2, trips, post: TierId | "camp" }`. In memory an engineer on a trip keeps the post they left, and `onTrip(mountain, name)` is the one test for "away" (#415). `onDuty` gives the crew as the save and the screens see it, with post `"tunnel"` for the ones away; `promote(mountain)`, `station(mountain, i, post)`, `rankOf`, `addTrip`. `promote` takes no `now`: the price does not depend on the clock. Save: `engineers?: Engineer[]` (max 5, names Ada, Nils, Ruth, Otto, Mae). The first engineer arrives with the first borer, already tending it, without spending a worker. The save reader refuses an unknown name, a duplicate, a sixth hand or a post it does not know as `newer` (#558); the rules leave the game map to it. Built (#144). Buying a machine does not call `tendBestTier` (#145); the sheet's post sticks. Until #738 the pacing sim called it; now only the lab and the tests do.
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
  so an apprentice on the borer is +17.5%. Until #739, once a Great Machine
  existed and the best tender was not on it, that post was topped up to 12% of
  the untended crew; that floor went with today's mountain's rules. `valueOf` prices a find as expected
  stones over the horizon (`src/economy/finds.ts`); keepsakes and quiet trips are 0. Session trouble arrives as an optional third argument and slows that tier
  only; away pay never passes it. Built (#149). `accrueAway` splits the paid window at each `returnsAt` after clamping
  a future `sentAt`, so the tending bonus resumes from the return; a party
  already home before that window (including during the unpaid part of a capped
  absence) tends the whole of it. Built (#146). The pacing dad (`tendBestTier`)
  keeps Ada on the borers until he owns a Great Machine, then moves her onto it.
  He fixes trouble within 3 seconds. From the first borer, the sim pays the real
  promotion for Nils (2,000,000 stones and one worker) and he waits at camp.
  Pacing days lived in `src/pacing.sim.test.ts` until #738 deleted it. History (#163, #171): the plain dad reached the
  bottom on day 5.5, upgrade and boost dads on day 5.0, a second run on day 4.
  Nils walks the old shaft at the start of every session and, once a journeyman,
  the deep dark each night. Finds apply.
- `hazards` (rules layer, pure): `nextTrouble(seed, now, mountain)`, `fix`, `pressTrouble`, `slowedSpeed`. One trouble at a time, every 3–6 minutes of live play, only once a borer is owned. Cave-in on carts, flood on drills, jam on borers or the Great Machine. The tier keeps three quarters of its speed at first and eases to half over two minutes. Five taps or a 600ms hold fixes it. An engineer tending that tier fixes it after 30 seconds; a Master fixes it at once. Steel-toe boots double the gap when `wearsSteelToes(mountain)` is true (or the caller passes `boots: true`). Built (#148). Session state lives in the store's session (`session`), never in the save, and clears on close, reload, and away time. Built (#149).
- `field-log` (rules layer, pure): `snapshot(mountain, rates, now, version)` and
  `EventRing` (last 200) are built (#141). The ring's move entries (tier and
  upgrade purchases, promotions (a craft started too, until #740),
  posts, sends, and recalls) come from the events a dispatched move returns,
  through `fieldEntry`; nothing diffs the mountain (#413). The session core also
  records away report, Start over (and the pass until #729), and save errors. The ring is not a mountain save
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
  1000-expression budget. Until #728 a full relic shelf and a second boost
  were size-capped only: naming every relic made a late-game field log write
  fail the same way (#219). The client writes the typed snapshot. The ring adds
  `engineer.promote`, `engineer.station` (a machine post, or `camp` when called
  back), `expedition.send`, `expedition.return` (find id in `source`; `quiet`
  when the tunnel was empty), `expedition.recall`, `trouble.start`,
  `trouble.fix` (`hand` or `engineer`), `layer.enter` (the band id; not logged since #740), `craft.start` (the recipe id; not logged since #740),
  `craft.done` (the recipe id and the new level). The board's layer,
  craft-done and welcome cards, its machine cards and its crew line went with
  the board (#727). The Ledger
  drawer's Quiet/Sound head key is the only sound control (`sound`, #491). Trouble stays out of the
  snapshot: it is never saved. Choosing a post while a party is out records the
  recall and, when the new post is not the one they left, the station.
- `lost-tools` (rules layer, pure): `hasLostTool`, `expeditionAwayMs`, `wearsSteelToes`, for the two tools left, the worn map and the steel-toe boots (Grandfather's pick and the Old miner's lamp went with the tap and the veins, #728). Keepsake stories live in `screen-words`. No new save field: the shelf is still `finds`. Built (#148).
- `layers` (rules layer, pure, #740): the ids and types only: `LayerId` and `LAYER_IDS` (the Topsoil, the Granite, the Crystal Caves and the Deep Heart, the names the mine's levels and the goods table use), and `MaterialId`, `MATERIAL_IDS`, `Materials` and `EMPTY_MATERIALS`. Until #740 it held four bands from stones mined (`BAND_STARTS`, `layerOf` reading `minedOut`), a per-tier hardness in `effectiveRates` with its `layer.<n>.<tier>.hardness` sweep factors, and each band's material on the gap in `MATERIAL_EVERY`; the fresh mine never dug past the Topsoil's first stone, so all of it went with depth. The rock a unit of clay or iron takes is `ROCK_PER_UNIT` in `factory` (#740). Built (#194, #195, #198).
- The envelope carries `rev`, `deviceId`, and `savedAt` (first in v7). `rev`
  starts at 1 on a new doc and the rules accept only `stored + 1`. `savedAt`
  must be `request.time`. One cloud write is in flight, at most one a second, and the
  newest mountain is the next payload. A rev refusal reads the server doc. A
  later run wins whole. A lower rev is never adopted. One copy fast-forwards
  when it is at least as far on rock dug, upgrade levels, crafts,
  recipes, finds, engineer trips, the city (the buildings operational, the
  steps built and what has arrived for the step in hand), the stockyard's
  level, the sunk shaft, every tier owned (workers, kids, machines, with a
  level's machines counted on the Topsoil and on the Granite apart), every
  vehicle and every maker, and further on one of the progress facts (all but
  tiers, vehicles and makers; #664 added the city, hoists and vehicles, #666
  the stockyard and the kilns, #673 the shaft and the Granite's machines). A lead that is only machines, makers, crew or vehicles, or a split where
  each side has something the other lacks, is not
  blended. The phone keeps its copy. The sheet "Two saves found" asks which to
  play. The other copy is archived first at `gameArchive/{uid}/copies/{id}` for
  seven days (owner create and read, no update, no delete). Then the chosen copy
  is written at the server rev plus one. A failed archive leaves both copies and
  the sheet. `syncedRev` on the phone backup is the last confirmed rev.
  `save.conflict` logs the revs, device ids, rock dug, and the choice. Saved
  copies, opened from the Ledger, restore one the same way and log `save.restore`. A copy
  from an earlier run comes back as a new run (#480): `startedAt` is
  `max(now, playing + 1)`, so the rules' run check passes, and `lastSeen` is now, so no
  time away is paid. Each copy stores its `reason` (`conflict`, `restore`,
  `start-over`, and `reset` for a copy from before the current
  version; `firestore.rules` takes the same four on create, `ARCHIVE_WRITE_REASONS`).
  A `pass` copy left before #729 still reads, lists and restores. Signed in,
  `startOver` goes through `keepThenBegin` in `save-choice.ts`:
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
  The bench never opens since #740 (`workshopUnlocked` is false): it opened by
  depth, and the factory's station took its place (#674, rule 7). `startCraft`,
  the craft move and its value went with it. A save's bench still settles and
  cancels, and a cancel refunds its `Price` (`recipePrice`: stones and
  materials as one `Price`, #560).
  `settleBench` fits a craft whose clock has rung, once, including inside
  `accrue` and `accrueAway`. `cancelCraft` returns lasting gear in full, because
  its effect has not started, and only the unused share of a live timer (axle
  grease, a blasting charge, a heartstone ember). A craft whose
  clock has already rung is fitted instead. `cancelRefund` and `hotTimers` are
  what the drawer reads. Rails, bits, the core, and Reinforce (max 5) multiply
  tier speed in `effectiveRates`. A blasting charge doubles the live crew until
  `chargeUntil`. Axle grease doubles the live crew until `axleUntil`, including
  while it is still on the bench. Axle grease and a blasting charge meet in
  `effectiveRates`, and the crew runs at the stronger of them. A
  heartstone ember multiplies the Great Machine by 1.25 until `emberUntil`.
  Crafting an ember or another grease refreshes that clock and does not
  stack. None of those timers change away pay. Sturdy props stretch the
  trouble gap. The engineer's kit shortens the next
  expedition. Strength and cost factors (`recipe.<id>.strength`,
  `recipe.<id>.cost`) default to 1; strength also scales a timed buff's length.
  Built (#196, #198, #210). Overtime, Crystal flare, the Miner's crystal lamp
  and the Gold rush (#468) went in #728. Its drawer, `workshop-panel`, went with the
  board (#727); a craft's countdown runs on the mountain's clock.
- Panels: the Engineers drawer (`engineers-panel`, #161), its rows and
  pages, the welcome card's homecomings and trouble's shout on the bays and
  Buys rows went with the board (#727). The rules stay in the model until
  #665's later slivers: a post calls `station(recall(...))`, so a party is
  never left without its engineer, and trouble is fixed by five taps (`FIX_TAPS`,
  `hazards`); the store's `fixTrouble`, the old board's hold, is still there,
  though nothing sends it since #727. Built (#149, #161).
- Designed twice: expeditions as a negative-speed tier in `TIERS` was rejected (it leaks into buying, cards and the sim's value function). Separate modules that feed `effectiveRates` keep it the one place multipliers meet.
