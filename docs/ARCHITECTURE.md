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
   is an `Action` or a screen-only move (a dig, a vein tap, a seen mark, or
   Buys' ×10 and Max, `buyTiers`: several card buys in one move, all or
   nothing, logged as one `tier.buy` with the final count, #358), and
   `applyMove` is the one place the UI changes the mountain, and the lab's
   `applyAction` too (#409). The lab's runner and the pacing sim still call some
   rule functions directly (`promote`, `buyBoost`, `send`, `tendBestTier`),
   which R1 (#420) folds in. A lasting upgrade's buy and a promotion carry the
   price the player was shown (`price`), and a different price today refuses
   the move: a band crossed while the tap settles the crew cannot charge more
   (#367). `listActions` quotes today's price. It says `applied` (with what the move took from the
   pocket and put in) or `refused`, and it holds the UI's rules too: a worker bought beside an idle
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
   the drawers (#373, #374) read five more, none of which imports art:
   `row-view` (types only: one `RowView` for every drawer row: its words
   as fit options, lamp, state, and whether a tap acts; every row module
   sets its lamp by the one lamp rule in `docs/DESIGN.md`, #509), `buys-rows`
   (`buyRowView`: each Buys row's state, words, lamp and icon key, lifted
   out of `crew-panel`'s old render), `upgrade-rows` (the boost, lasting
   upgrade and found-tool rows, and `anyUpgradeAffordable` for the
   Upgrades key's lit cap), `workshop-rows` (#374: the Workshop's recipe,
   sketch and bench rows and its material plates, from `workshop-sheet`'s
   cards, bench and pages) and `key-rail` (`keyViews`: each key's cap
   (rest, locked or lit), sub-line (an unlock line, the bench clock or the
   soonest trip), red dot and label).
2. **Saves:** `persist` (the save versions and their migrations), `save-format`
   (#415: the saved shape, `SavedMountain` and `WorkshopSave`, and the one
   place it meets the complete mountain: `savedMountain` and `savedWorkshop`
   leave out what is empty, zero or unset, and `parseMountain` and
   `withWorkshop` fill it back in; an unknown recipe, bench, crafted level or
   teach id is kept in `kept` and written back instead of dropped), `session-save`
   (guest storage), `phone-backup` (signed-in on-phone copy, never deleted),
   `save-progress` (which copy is ahead), `cloud-save` (interface + memory fake),
   `firebase-save` (the SDK adapter; mountain save plus `fieldLogs/{uid}/devices/{deviceId}`),
   `firestore.rules` (server-side mirror of the parser and the field log,
   guarded by `rules-drift.test.ts` and the emulator tests).
3. **State:** `progress-store` composes a pure session core and a sync
   service (#414), and is the store's public surface. The UI changes the game
   only with `dispatch(move)`, which settles the crew, runs `applyMove` with the
   clock and the trouble as that settle left them, and commits, and says
   `applied` (spent, gained) or `refused` (`not-playing` or `no-change`) (#409).
   `applyMove` also returns the move's typed events (`MoveEvent`), and `dispatch`
   records them in the field log; a refused move has none (#413).
   `session` is the core: `step(session, input, now)` returns the next session
   and its effects as data (record, log, remember the homecomings, save a
   band's recipe grant, the move's result). It covers ticks, away pay, moves,
   trouble presses and fixes, the news and a new run. The `Mountain` it holds
   is complete (#415): every field is present, with 0 for a cold clock or a
   boost that never ran, `staffed: 0` for a save never granted its crew, and
   `undefined` only for a free bench. The news is one queue of typed
   `Notice`s (away, quiet, reveal, layer, craft, crew-joined,
   engineer-joined), in arrival order; screens read it with `firstNotice` and
   `noticesOf`, and `dismiss(kind)` closes the oldest of a kind (`"away"`
   closes the whole welcome card). Homecomings stay their own list, since the
   device remembers them across a reload. `session-time`'s `advance` is the
   one time step it and the lab share: live, away (a gap over ten seconds), or
   a clock that went back (`timeInput`). A craft notice keeps the mountain at
   the moment it was fitted, and `card-views` words it. The sync service runs
   the effects through the ports, as functions over one `StoreContext`
   (`store-context`): `store-session` (run a step, emit one snapshot),
   `store-actions` (tick, moves, trouble taps, a new run, hide, dispose),
   `local-saves` (the guest session save, the phone backup, the homecomings
   key), `cloud-writer` (the write pipeline and the field log copy),
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
4. **Screen:** `mountMountainScreen` (`mountain-screen`) is the composition
   root (#431): it builds the parts in order, holds `paint()`, and starts the
   screen running. Each part is a `screen-*` module with one job:
   `screen-context` (the store, the clocks, the board host, `dispatch` and the
   view), `screen-running` (the Running now list, its chips, the vein's note),
   `screen-vein` (the golden vein, and the quick vein after an hour away,
   held while `screen-overlays` says a card or drawer covers the board,
   #468), `screen-dig` (the gauge row, the Ready
   row, the bays and the Ready now pick), `screen-panels` (Buys, the cards,
   the note and save line with the board's top, the sheets), `screen-prompts`
   (the update card and the other-tab card, on `board-card`), `screen-overlays` (the New
   sign, the covers and the rail's paint), `screen-keys` (the key rail and
   what its keys do), `screen-layout` (the board's children and the scrim)
   and `screen-run` (the tick, the frame loop, the vein's and the sign's page
   listeners, the store subscription and the fonts re-measure).
   `mountain-screen-order.test.ts` pins the order the parts register their
   listeners, the effect row's chips and the root's children. Panels are
   their own modules with a `create…Panel` factory returning their elements
   and a `render()` (`upgrades-panel`, `relic-panels`, `welcome-panel`, `ledger-panel`, `crew-panel`, `workshop-panel`, `arrival-panel`). The eight board cards (#464, #466) are built
   on one shell, `board-card`: `welcome-panel` (welcome back), `arrival-panel`
   (the layer card and craft done), `save-conflict-panel` (the save conflict),
   `screen-prompts` (the other tab and the update), `saved-copies-panel`
   (Saved copies: an inset per copy, built once per copy and rewritten line
   by line, in a list that scrolls inside the face) and `legacy-panel` (Pass
   the mine, an alert dialog; Escape is Not yet). What the welcome,
   layer and craft-done cards show comes from `card-views`, pure and with no
   DOM: `welcomeView`, `welcomeNews` (the one rule for when the welcome has
   news, which `arrivalCard` also reads) and `arrivalCard` (the layer card,
   else craft done, else none). The shell is a shaded `div.board-card` with
   today's hook class, title id and `data-card`, a framed face, `cardLine`
   and `cardArt` (2x), big plates (`plate`) and other controls (`press`)
   that press through `pressOnBoard` on the card's own layer, `show(on,
focus)` (`showCard`, the model's open or close, and the focus once as it
   opens) and `page()` (a new screen that settles again: the conflict's
   confirm, and the next band or craft on a card that is already up). A card
   the player opened (Saved copies, Pass the mine, #466) passes `dismiss`,
   which Escape runs, and `from(opener)`: hidden while the focus is on it,
   the card gives the focus back there. `cardLines` rebuilds a box of lines
   only when its words change (the welcome's news, the Legacy's rates). The
   cards stand at one z-index in the root's order
   (`screen-panels#cardsFrom`); only the save conflict stands higher. Every drawer, the relics drawer (#465) too, sits in the drawers'
   clips above the cards: a card that comes up closes any open drawer by
   program (`screen-overlays`), and the relic reveal waits while a card is
   up, so a card is never under a drawer. Shared player-facing wording lives in `screen-words`. The screen's optional `signal` (tests
   pass one; the app never unmounts) takes off everything it hangs outside
   its own elements: the tick, the frame loop, its document and window
   listeners (the note's, the save line's and the drawers' too), and its
   store and account watches.
   The screen has one repaint, `paint()` (#427). The store subscription, every
   panel's `requestRender` and the 1s tick (`progress.tick()`, the vein's
   step, then `paint()`) all call it, so every Running now clock, a boost's
   chip included, ticks each second on every save, crew or none. It paints in
   a fixed order: the board (stones, window, gauge row, bays, Ready row, Buys,
   vein, guide, materials), the panels, the Running now chips, the relic plate
   and the rest, then the overlays (the New sign, the covers and the key rail).
   The panels paint before the New sign, so a card opened in that paint holds
   the sign back. Each paint is safe to repeat: a card takes focus only when
   it opens, and the materials line is rebuilt only when its chips change, and the saved
   copies card builds each copy's inset once and rewrites only the lines that changed.
   Three small modules carry the screen's decisions: `card-state` is the cards'
   shown state (`showCard` writes it, for the board cards through
   `board-card`'s `show`; `cardUp` reads it), `screen-cover`
   decides from the screen's `cards`, the board's drawers and the note whether
   to close the drawers, put the note and sign away, or hold the sign
   (`coverFor`), and which New sign is wanted (`wantedSign`), and
   `screen-chips` gives the Running now labels for the crafts and the bench.
   The control board (#370) is its own set of modules. Pure rules with unit
   tests: `board-fit` (the scale that fits the 424×924 stage inside the
   window and its `env(safe-area-inset-*)`, read back through a hidden
   probe; 1 at 424×924 with no insets, so the art stays at exactly 2×),
   `board-skin` (the 9-slice plan that draws a frame, tag or key skin, or the
   output gauge's counter window, on a canvas behind its element; `skin` is told whether its host is down, so a plate key's press repaints its pressed skin), `odometer` (the five drum faces for a
   pocket) and `crew-boost` (the crew timer the crew is running at, and the
   dial frame; a running Gold rush comes first, #468). DOM parts take `getView` and callbacks like a panel:
   `board-note` (the floating framed note, placed in board coordinates; a
   note that holds a key stays up until the key, an outside pointerdown, or
   Escape; a show with no `ms` and no key has no timer and stays until
   something hides it, and `hideIf(body)` hides only a note still showing
   that body, which is how the bays' thanks ends), `board-stock` (the odometer's drums and spend mark, and the
   boost dial), `board-relics` (the relic plate: six sockets, their notes
   with the Relic shelf key, and the tag) and `board-save` (the save line,
   which keeps `.save-status` with `data-kind` and `data-log`, and its save
   drawer). `main` calls `trackBoardFit`, which keeps `--board-scale` in
   step with the window and its safe area on resize. The game is phone-only
   (#498): a wider window, such as a PC's, gets the same board, scaled to fit
   and centred on the night; the PC desk and housing of #376 are gone. The app's styles
   are `src/tokens.css` and `src/board.css`: `style.css` is gone (#376), and
   the page's base rules (the reset, `html, body` in the board's night and
   ink, the body's font) open `board.css`.
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
   `windowScene(mountain, trouble, now)` (`now` lights the Gold rush's
   sparkle, #468); it calls `onDig` and `onVein` and never
   writes the mountain. Until its first render (a signed-in save still
   loading) the window is its frame and glass on the dark: no view, machine,
   kid or run. `reducedMotion()` in `float-text` holds the window and the
   needle still; it makes one `MediaQueryList` and reads its live `.matches`
   each frame.
   The middle of the board (#372) adds three DOM parts. `board-bays` is the
   band tag and three bay buttons (lamp, icon, name, sub-line, flap counter
   and price); it draws `bayViews` and passes taps on, and keeps each bay's
   element for the board's life; each bay presses through `pressOnBoard`
   as a board control, and its "Fixed!" thanks is painted on the board note
   from the model's `fixed` (#426). `board-ready` is the Ready now plate
   and the red DIG button (its press frames and the By hand tally). The
   plate presses through `pressOnBoard` and paints its Done from the
   model's hold (judged by when the finger came down), so a double tap buys
   one. `trouble-tap` is the 600ms
   hold-to-fix the Buys rows and the bays share. `mountain-screen` computes
   `readyNow(view.mountain, now(), view.trouble)` (`readyPick` in
   `screen-dig`) once per paint and hands
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
   and drops it when fonts settle. `writeFigures` (#506) writes a line with
   each figure in a `b.board-fig`, bold and bright among quiet words; the
   bays' sub-lines and a row's info line are fitted with it, so a line is
   measured as it is drawn. A row's info line takes two lines (`is-roomy`,
   measured with `fitsBox`) when no need and no why is under it, and its
   info and flag are fitted again when the words beside them change. `board-row` is one drawer row (lamp,
   icon, name and badge, info, need, why, flag, gain, price tag and verb),
   built once and reused, writing only what changed; its icon is 64, 48 or
   32px (`iconPx`), and `rowBar` / `paintRowBar` are the one thin bar at a
   row's foot, the Workshop bench's and the Ledger relics row's (#375). It is a painter of the
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
   model `open`, `close`, `page` and `layout` and paints the view.
   `BoardSheet.page()` (#374) is the one way a panel says "a new screen under
   the finger": it starts the settle as the "i" does, so the next finger is
   the second tap of the one that changed the screen. Each head key (Buys'
   amount key, the Ledger's Sound key) carries `board-sheet-key`. Each
   close says what closed it: `finger` (Back, the "i"'s way back),
   `keyboard` (Escape), `tap-through` (the scrim, which hands its tap on) or
   `program` (a timer, a card that covers the drawer). A close that restores focus gives
   it to the key the drawer opened from, or to the shell's `fallbackFocus`
   while that key is disabled; a `restoreFocus: false` close never moves it,
   so a card that covered the drawer keeps its own. Escape listens in the capture
   phase, so with the save drawer over a drawer it closes only the save
   drawer. `board-how-art` draws the How it works cards in the
   drawer skin with the board's icons at 2x (the Workshop's hammer, a
   24-art-px relic, at 48). `board-keys` is
   `createKeyRail`: five keys that draw `keyViews` and pass taps to
   `onKey`. The rail root has one capture-phase `pressOnBoard` listener
   that reads which key a click pressed; the model's decision (a press in
   the settle after Back closed a drawer is ignored, named fix 1) decides
   whether the click goes on to the key. `board-sign` is the slim New sign over a key. `crew-panel`
   builds Buys and `upgrades-panel` builds Upgrades as `BoardSheet`s of
   `board-row`s, each painting from the model. Buys sends its layout (its
   parts in order and its chip rows) as the drawer opens, and the model
   freezes it: rows, sections and chip rows keep their places while the
   drawer is open, a row it no longer sells blinks, and words still change
   in place. Upgrades keeps its row order through a reload: `upgradesOrder`
   (in `upgrades-panel`) works the order out, every part in it shown or not,
   and the panel sends it as the drawer opens. Row visibility can still
   change on a re-load. The Buys parts are small modules:
   `buys-amount` (`createAmountKey`, #358: the head's ×1 / ×10 / Max key,
   pressed through the board's model like the "i" and kept in the device
   storage beside the vein wait, never in the save; the shell places it with
   `createBoardSheet`'s `headKey`), `buys-rows` (each row's view, for the
   amount: the quote's count and total), `buys-tap` (`buysTap`: what a tap on a
   row does once the model lets it act, read again from the store at the
   tap), `crew-chips` (the crew line's chips: laid out in the fewest even
   rows that fit, then frozen with only their words changing) and
   `crew-rate` (`createRateCounter`: the crew line's rate counting up to its
   new value after a buy, 8 steps of 60ms, or at once under reduced motion).
   `workshop-panel` builds the Workshop drawer (#374) the same way, from
   `workshop-rows`' views and `workshop-parts` (the material plates, the bench
   row with its bar and its cancel confirm, the Earlier / More to make pager;
   only the Workshop has them, so `board-row` and
   `board-drawer` stay generic). It sends its order, the recipes as
   `workshopOrder` ranks them, as the board model's `layout` for "workshop",
   frozen as the drawer opens; pages slice that order, three recipes a page.
   A tap on a busy bench arms the cancel and calls `page()`, so only a tap
   past the settle cancels; left alone it disarms after 4s, at once when the
   craft it was armed on (its recipe and start) goes, and when the screen's
   `signal` aborts. The timers line keeps its room when empty (`is-empty`,
   hidden by visibility), so no row moves as a timer starts or ends. Turning a page
   calls `page()` too. Every craft and cancel is today's move (`craft`,
   `cancelCraft`) through `dispatch`. Its one door is the Workshop key (the
   menu's Workshop row went with the menu, #375). Back
   returns focus to the Workshop key, or to the Ledger key (the shell's
   `fallbackFocus`) while a re-load holds the Workshop key disabled. A save that turns out locked
   closes it. `ledger-panel` builds the Ledger drawer (#375) the same way,
   from `ledger-rows`' pure views (`tonightLines`: this run's field log
   since the last Start over or pass, newest three, each code worded by one
   table or skipped; `stonesRowView`, `relicsRowView`, `accountRowView`) and
   `ledger-parts` (the Tonight box, the four plates and the two pages; only
   the Ledger has a log box, a plate grid or a page that asks). Its head key
   is `sound`'s (#491): `soundSetting` reads and keeps this device's choice
   (`dad-friendly-sound`, beside the Buys amount, never in the save; Quiet
   when the store throws), `createSoundKey` turns it through the board's
   model, and `playHammer` is the knock. `screen-panels` makes the one
   setting and hands it to the Ledger and to the Workshop, whose craft
   knock reads it. The Ledger's parts never reorder, so it sends no `layout`. A page goes in the list's place
   through `BoardSheet.showPage(page)` (#375): the head and Back stay, it
   calls `page()` so the settle starts again, and it focuses the page's
   first control; `showPage(undefined)` and `close` bring the list back.
   Start over asks on one page (Keep first, so it takes the focus; Yes calls
   `progress.startOver()`; once the new run has started it calls
   `onStartOver` and closes onto the Ledger key, and if it was refused the
   page says `SAVE_CONFLICT_ERROR` instead, as the Pass the mine card does); the field log shows on the other when `writeClipboard` says no.
   Copy field log's `Copied` is the board model's `result` and hold, as a
   row's Done. Saved copies and Pass the mine close the drawer without
   moving focus and open their board cards (#466), which give the focus
   back to the Ledger key when they close. Tonight
   reads `progress.tonightEvents()` only while the drawer is open: the
   ring's events since its mark. A run's start, a reload, and a copy from
   elsewhere taking the mountain's place (a restore, the cloud's or another
   device's copy) move the mark up, while the field log keeps them all. Another
   account's save loading leaves the drawer open with the mine rows dark and Copy field
   log, Start over and Yes disabled; the account row stays live. When the
   account changes, the Start over page gives the list back; the same
   account reported again leaves it as it was (#481). A clipboard answer that comes after the drawer shut shows
   nothing. The five drawers
   and the scrim sit in `.board-sheet-clip` at z 29, under the board note
   (30) and the save drawer (31). The clip is `overflow: clip`, so nothing
   (not even script) can scroll it. Opening one drawer closes the others
   (`wireKeys` in `screen-keys` closes every other drawer in one record,
   Engineers too since #455). `engineers-panel` takes a `door` (the
   Engineers key) instead of building its own button; it and the Ledger
   are drawers whose shell writes their key's `aria-expanded`, as the
   others' do. `DRAWER_SETTLE_MS` (400ms, from `board-interaction`) is every
   drawer's guard, B4's Buys settle carried into the model, judged for the
   whole drawer. The rows (through `buyOnTap`) and Back, the "i" and the how
   cards' Back (in the shell) each keep their own press with `card-tap`'s one
   `trackPress` (the keys, plate and bays use `pressOnBoard`, which wraps it): a press is judged by when its finger came down, and a
   finger's click (`detail` not 0) with no pointerdown of its own by the
   click's age, since a touch's click lands where the finger lifts, on a row
   that may have slid under it as the drawer rose. So the
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
  `mountMountainScreen` is a composition root within 150 lines.

- **Local spends (#370, #409):** the odometer shows a spend only for the
  player's own moves. `screen-context` hands every panel one `Dispatch`
  wrapper around `progress.dispatch`: a move that applied with `spent >= 1`
  rolls the spend mark and kicks the needle. A cloud copy, a chosen or
  restored copy, Start over or Pass the mine never comes through it, so
  `renderStock` only sets the drums and the dial.

- **Board tap rules (#410, #425, #426):** `board-interaction` is a pure reducer that
  holds the board's tap rules once, run through `board-host`. The Buys,
  Upgrades and Workshop drawers, their shell and their rows, the key rail, the Ready now
  plate and the machine bays are painters of its view: they send it inputs
  and presses and read `boardView`; none holds a settle, a hold, a timer or
  a freeze of its own. Every board control's "is down" look goes through `pressLook` (in `card-tap`), and each part paints its own look; the Engineers rows and plates use it too since #455, so its old timed `is-pressed` flash is gone. `pressOnBoard` (in `card-tap`) is the one board
  press: it tracks a control's finger-down time, sends the model the press
  (the control, who pressed, the finger's `downAt` and the click) and hands
  back its decision. Its `control` is a `ControlRef` or a function of the
  click (the rail root tells its keys apart; a click on none presses
  nothing), and an optional `intent` marks a trouble press. The model:
  - the 400ms settle after a drawer opens or turns a page, and after a
    finger closes a drawer (Back), for what that close shows again (named
    fix 1). The save drawer and the board notes never settle, and a
    tap-through close (the scrim, a tap outside a note) hands its tap on;
  - the 1.9s Done hold: every press judged before it ends is held, judged by
    when the finger came down (named fix 2), so a press handled after the
    hold whose finger came down inside it is held too. The Ready now plate's
    Done is this hold, not a timer of its own;
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
  - the 1.6s thanks after a fix: the bays' "Fixed!" note is painted from the
    model's `fixed`, not from a timer of their own;
  - the overlay stack: a drawer takes the place of every other drawer, the
    save drawer and a note, but keeps the cards up under it; the save drawer
    and a note go on top;
  - the board cards (#464, `CardId`: welcome, layer, craft, conflict,
    other-tab, update): a card's open and close are model events. A card
    settles for `DRAWER_SETTLE_MS` after it opens or pages, as a drawer does,
    goes on top of the stack, and its close takes only its own entry off,
    never what stands above it (conflict and update up together, the
    conflict resolves, the update stays and still settles). A card is not a
    drawer (`drawerOpen` stays false), and a drawer closed under a card
    leaves the card on the stack.

  Inputs carry their own times (`pressedAt` for when the finger came down,
  `at` for when the handler ran), and `boardView(state, at)` derives what is
  open, held, blinking, thanked and frozen. `nextWake` gives the one time to
  read it again, so no timer lives in the rules. The timing values
  (`DRAWER_SETTLE_MS`, `READY_HOLD_MS`, `BLINK_STEP_MS`, `THANKS_MS`,
  `PRESS_AGE_LIMIT_MS`) live here, and the board parts import them. The
  module has one wiring: `board-host` steps it, and the drawers and rows
  paint from it (#425, #426). The screen reads it too: `drawerOpen` says
  whether a drawer is over the board (#427). A seeded random-sequence test (`board-interaction.random.test.ts`) holds its
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
  panels' column flows between them through `#app`'s padding. The relics
  drawer opens from a socket note's Relic shelf key; opening a sheet, the
  relics drawer or another drawer closes the board note and the save drawer. The gauge
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
  words go on the key's label. The Buys, Upgrades, Workshop, Engineers and Ledger drawers
  (`.board-drawer.board-sheet[data-sheet]`, open with `.is-open`) stand
  at `--sheet-top` (178px) down to the save line, so they cover the bays,
  the plate and the rail and leave the odometer in view. The crew line (`crew-panel`'s `section.crew`: sentence, chips and
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
  note, one per line. Every active one stays visible. The Ledger drawer, behind the
  Ledger key, holds the mine: stones left, materials, and the next-relic goal, read from
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
- The visual check (#440): `scripts/visual-check.mjs` is only the runner. It
  imports the section modules in `scripts/visual/` in queue order, then runs
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
  each label built from data. The rail, the drawers per save, the bays per
  save, the board per save, the gauge row per save, the cards, the relic
  plate, the long sheets, the odometer, Running now and the no-scroll guard
  are tables (#442). The rest stay plain sections: the main screen and tier
  cards, the gauge's moving parts, the one-walk flows (the welcome-back
  reveal, the Mantle, passing the mine, the drawer states), and the
  Workshop, Engineers and section 16's arrival-card checks. An expectation that needs a measure
  an earlier one took reads it off the page's `seen`. The no-scroll guard's
  rows each say what their taps open, and wait for it. Page code places the
  golden vein with `__showVein` (set up beside `__board`), and
  `boardTargets(page, { vein })` shows it and measures in one page task, so
  the screen's second tick cannot hide it in between. The drawer list is
  `DRAWERS` in `drawers.mjs`: a new drawer is a row there, with its own
  scroll rule; the Workshop's row (#374) and the Engineers' (#455) skip the
  saves whose key is locked. Engineers' row scrolls only at seven rows (a
  full crew with keepsakes), and its states flow (`engineers states` in
  `engineers-workshop.mjs`) walks the first visit, her page, the tunnels,
  the promote and recall asks, a trip out with the walk home, and the full
  crew (also as the installed PWA) with Brought home's stories. It replaced
  sections 11 and 12 and main-screen's `engineersSheetFits`. The Ledger (#375) is a row that never scrolls, plus one states
  flow (Tonight's lines, the mine rows, the plates and both pages). `controls.mjs` wires each control
  family once in Chrome (the rail key, a row buy, Back and the scrim, the "i"
  cards, the Workshop bench's arm-then-confirm cancel, the Ledger's page that asks (Start over), a row that opens a page (an engineer's row, then a post past the page's settle), Ready now, an open bay, the trouble fix, the red button and a press
  look), on the held tap clock except the red button and the drawer's
  reduced-motion pages. What a tap decides is proven by unit tests, not
  there; a new family gets one wiring check. The six board cards (#464) are the
  `board cards` table in `notices-saves.mjs`: every card at the phone (the
  other tab too, through `openPair`), each checked
  for the shade down to the save line, no scroll, `cardFacts`, fat plates,
  13px text, 2x art, contrast and the focus as it opens. `coversBoard` (in
  `kit.mjs`) takes an overlay that is fixed or absolute in the board. A
  check that taps a card's plate opens on a held tap clock and steps it past
  the settle first (`stepTapClock(page, PAST_SETTLE_MS)`). These modules wait on page
  state, page events or a count of painted frames, never on a fixed sleep.
- Signoff (#397): a green `npm run check` on a clean, committed HEAD writes `.gate/passed`. `npm run gate -- signoff` (`scripts/signoff.mjs`, rules in `src/signoff.ts`) starts `.github/workflows/signoff.yml`, which posts the `signoff` commit status; the ruleset on `main` requires it and an up-to-date branch. The relay exists because cloud sessions may not post statuses. `deploy-hosting` runs `npm run check` on the merged commit before it deploys, so a red `main` deploys nothing.

## M7 sketch

Staffing (#140), the workers' name (#139), the field log (#141–#143), engineers (#144), expeditions (#146), the side-tunnels sheet (#147), lost tools (#148) and hazards (#149) are built.

- **Names:** player text says "worker"; `helpers`, `TierId "helper"` and the rules keep their names (no save migration). All copy comes from `screen-words`. Built (#139).
- `scale` (leaf, #356; retuned #357): `MOUNTAIN_STONES`, the kid-run stretch (`KID_RUN_GROWTH`, `kidStretch`, `MAX_STRETCH`) and the band scales. `BAND_STARTS` and `BAND_SCALE` say how many stones a band takes per stone of depth, times k. Their values are in [Numbers now](DESIGN.md#numbers-now). Depth stays in run-1 units, so `remaining` and the save format do not change. The pure functions `shownStones(depth)`, `stonesLeft`, `depthAfterStones(stones)` and `minedOut` convert between depth and the stones a run shows; `oneOffStretch` = k × the current band's scale prices upgrades and promotions. Machines and workers use k only (`tierCost`).
- `tiers`: each tier's first price, speed, `staff` and opening depth, and the two growth curves (`MACHINE_COST_GROWTH`, `HELPER_COST_GROWTH`) that `tierCost` applies. `tierQuote` (#358) prices ×1, ×10 or Max of a tier as the sum of `tierCost` unit by unit, the price `buyTier` charges for each in turn. The values are in [Numbers now](DESIGN.md#numbers-now). The `milestones` module (#357) doubles a tier's output at owned-count marks, stacking; the marks are in [Numbers now](DESIGN.md#numbers-now) too. `crew.staffExisting` grants once more (`staffed: 2`; `true` and `1` are the #89 grant). Built (#140). History (#140): the Great Machine's staff was 25, as staff 15 never ran one in the sim then and reopened a 2.5-day gap with no purchase.
- `staffing` (#500): `staffMachines` picks how many of each machine the hands run (a `Staffing`, one count per machine): the staffing that mines the most stones a second for given machine speeds, each machine fully staffed or idle. It tries every count of the bigger machines and, for the last one, only the counts where the one-hand machines (carts, drills) run out, so it stays cheap. A tie keeps the bigger machines. `staffWith` fills the one-hand machines around set counts of the big ones, and `biggestFirst` is the old rule. `effectiveRates` (`staffCrew`) weighs each candidate with the real tending (Grandpa and the floor, which move with what runs): the old rule, `staffMachines` on the engineers' tenths, with Grandpa's tenth on each machine, and with each engineer's post kept running. From the best it climbs, one big machine more, fewer or traded at a time, while the crew mines more. It is weighed on steady speed, not live trouble. `rates.test.ts` sweeps saves with Grandpa and engineers and checks one more worker, drill, borer or machine never mines less.
- Grandpa (#338, in `engineers`): `grandpaPost(mountain, running)` is the biggest running machine no engineer tends, once the Legacy is at least 1, read from the `running` that `effectiveRates` staffed. `tendingTenths(mountain, tier, running)` counts him at `GRANDPA_RANK` (apprentice) on that post; `engineerTenths` is the engineers alone. Nothing is saved.
- `engineers` (rules layer, pure): `Engineer = { name, rank: 0 | 1 | 2, trips, post: TierId | "camp" }`. In memory an engineer on a trip keeps the post they left, and `onTrip(mountain, name)` is the one test for "away" (#415). `onDuty` gives the crew as the save and the screens see it, with post `"tunnel"` for the ones away; `promote(mountain)`, `station(mountain, i, post)`, `rankOf`, `addTrip`. `promote` takes no `now`: the price does not depend on the clock. Save: `engineers?: Engineer[]` (max 5, names Ada, Nils, Ruth, Otto, Mae). The first engineer arrives with the first borer, already tending it, without spending a worker; `grantFirstEngineer` does that once for an older save. Rules check the first two hands. A later hand, and a duplicate name, are rejected by the parser: checking them beside a full v6 save crosses the 1000-expression budget (#219). Rules + drift guard + emulator tests. Built (#144). Buying a machine does not call `tendBestTier` (#145); the sheet's post sticks. The pacing sim still calls it.
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
  card (`card-views#arrivalCard` picks which) are session news, like a relic reveal: the baseline is the loaded save,
  so a band you already sit in, or a craft already fitted, is not announced
  again after a reload or another absence. An absence that does break into a
  band, or finish a craft, folds that line into the welcome card. A compact
  machine card always shows the gain of one more (`+N · total/s`) and the
  workers one more needs, from `staffForBuy` (the tier's `staff`, or
  `TENDED_MACHINE_STAFF` when an engineer would tend the Great Machine; values
  in [Numbers now](DESIGN.md#numbers-now)). Short hands read `Needs N workers ·
M free`. The crew line, in the Crew section at the top of Buys, names where
  the workers are in its chips; a line that does not fit splits into even rows,
  and the crew plate on the board is the only free count (#371). The Ledger
  drawer's Quiet/Sound head key is the only sound control (`sound`, #491). Trouble stays out of the
  snapshot: it is never saved. Choosing a post while a party is out records the
  recall and, when the new post is not the one they left, the station.
- `lost-tools` (rules layer, pure): `hasLostTool`, `tapWithPick`, `glintScale`, `expeditionAwayMs`, `wearsSteelToes`. The old miner's lamp doubles a golden vein's glint (`veinGlintMs`). Keepsake stories live in `screen-words`. No new save field: the shelf is still `finds`. Built (#148).
- `layers` (rules layer, pure): four bands from stones mined: the Topsoil, the Granite, the Crystal Caves and the Deep Heart through the bottom, starting at `BAND_STARTS` ([Numbers now](DESIGN.md#numbers-now)). `layerOf` reads `minedOut`. Entering a band includes its first stone, so 10M is the Granite, beside the Shield. Hardness is a per-tier speed in `effectiveRates`, and the sweep factor `layer.<n>.<tier>.hardness` multiplies it. Workers and kids stay at 1. No layer field. Each band drops its material on the tuned gap in `MATERIAL_EVERY` (1,000,000 clay, 1,000,000 iron, 5,000,000 crystal, 10,000,000 heartstone). `accrue`, `accrueAway`, and a hand tap add the units. The remainder stays in the stone total. `materialLeftToDig` counts what the rest of the run's mountain still holds of one material; `workshop-sheet`'s `goneMaterial` uses it to turn a recipe that lacks clay past the Topsoil into "No clay this deep" instead of "Need 4 more clay" (and iron, crystal or heartstone once their band is dug, #492). Built (#194, #195, #198).
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
  copies, opened from the Ledger, restore one the same way and log `save.restore`. A copy
  from an earlier run comes back as a new run (#480): `startedAt` is
  `max(now, playing + 1)`, so `notOlderRun` passes, and `lastSeen` is now, so no
  time away is paid. Each copy stores its `reason` (`conflict`, `restore`,
  `start-over`, `pass`; `firestore.rules` lists the same four). Signed in,
  `startOver` and `passTheMine` go through `keepThenBegin` in `save-choice.ts`:
  the mountain in play is archived, then `beginRun` starts the new run. A copy
  refused or not answered within `archiveWaitMs` (`settle-within.ts`, shared
  with the resume read; 10 s) keeps the mountain in play and logs
  `save.archive` as an error. A second press while one is in flight, a newer
  run arriving meanwhile, or another account, a dispose or a held save by the
  time the copy lands (uid and `hydrateGeneration`, as the resume read checks)
  starts nothing; a restore checks the same. A mountain with no stone mined,
  or a guest's, starts at once with no copy, and a restore keeps no copy of it. The field log
  snapshot includes `deviceId` and `rev`. A newer service worker shows "Update
  available" and a reload button. Old cached builds cannot write once a rev
  exists. Coming back reads the server before writing. A cached snapshot
  (Firestore persistent cache) does not count as that read. One writer tab per
  device; Play here flushes the phone backup first. Offline writes stay in that
  cache until the next open, and a stale queued rev is rejected like any other.
- Save v6 keeps `materials`, `bench`, `crafted`, `recipes`, and the craft
  clocks (`mountain.clocks`, keyed by recipe id; 0 is cold) on the mountain in
  memory, and writes them as one `workshop` map beside the mountain, each hot
  clock under its saved name (`chargeUntil`, `flareUntil`, `emberUntil`,
  `axleUntil`). The mountain key list in `firestore.rules` cannot grow,
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
  still occupies it until its clock ends (`unknownBench`): the drawer counts it
  down, offers no refund, and a new craft waits. Once that clock has rung, a
  known craft may take the bench. `startCraft` spends stones and materials when
  the Granite is open, the recipe is known, and the pocket can pay.
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
  rush adds `rushPerSecond` of those held stones on top of the crew until
  `rushUntil`, both saved in the workshop map beside `axleUntil`. Live `accrue`
  pays them (`payRush`) and digs only the crew's own share from the mountain.
  `resumeRush` runs first on every open: a break under an hour shifts the rush
  later (close is pause), and an hour away or an ended rush lands what is held
  (`releaseRush`), as does a missed glint (the `missQuickVein` move). The store's snapshot reports each settled
  time away as `awayGap` (`ms`, and the `at` that names it), and a long one
  arms the quick vein. `incomePerSecond` reads the crew without the rush
  (`withoutRush`): 90 seconds are not the crew's speed over a schedule. A
  heartstone ember multiplies the Great Machine by 1.25 until `emberUntil`. A
  crystal flare makes veins 25% more often until `flareUntil`. Crafting a flare,
  an ember, or another grease refreshes that clock and does not stack. None of
  those timers change away pay. Sturdy props stretch the trouble gap. The lamp
  makes golden veins more often for good. The engineer's kit shortens the next
  expedition. Strength and cost factors (`recipe.<id>.strength`,
  `recipe.<id>.cost`) default to 1; strength also scales a timed buff's length.
  Built (#196, #198, #210). The Workshop is `workshop-panel` (#199; a board
  drawer since #374, above): opened from the Workshop key on the rail (locked
  until the Granite's clay, #373), its one door. Three recipes a page, so
  the list fits the drawer with no scroll (the #347 measure-then-page went),
  real costs and effects, a red blink when a craft cannot start, a quiet hammer
  until Sound is on, and a cancel on the bench row that names the refund. A
  grease or charge row says "Crew already at ×2" when another crew timer is
  already that strong, and otherwise names the crew in whole stones like the
  header (`formatCrewSpeed`, #332). The countdown keeps running while the drawer
  is shut.
- Panels: `engineers-panel` is the Engineers drawer (#161, a board drawer
  since #455) on `createBoardSheet`: its list (a row per engineer from
  `engineer-parts#createEngineerRows`, with the walk home in her icon cell
  while she is out, Brought home, and Promote as a buy row) and its pages,
  swapped with `showPage` (her page of posts with its two plates, the
  tunnels, Brought home's stories, and the recall and promote asks on
  `board-page`, the page that asks shared with the Ledger). The pure views
  are `engineer-rows`: each row's and page's view, the teach chain
  (`engineerTeach`), the kicks (`listKick`, `pageKick`), `settlePage` (a page
  whose engineer has gone, or a trip that has ended, falls back to her page
  or the list) and the lookups a press reads (`findHer`, `askedPrice`). A
  page names its engineer, never her index. Presses go through the board
  model's `rowsOnBoard` and its settle; a post that lands and a new engineer
  hold their row's Done, and a cheer stands in the drawer's kick for 2.2s
  (`BoardSheet.cheer`). A post calls `station(recall(...))`, so a party is
  never left without its engineer. Step up checks the price again and pays
  only the price the row showed when he tapped it (#367). Back, the scrim and
  Escape close the whole drawer from any page. The gains on posts, the duty
  kick and the cheer show the live stones/sec from `tendingGain`. No new save
  field. The expedition chips (`engineer-parts#createExpeditionChips`) stay
  in the Running now note. `progress-store` keeps `homecomings` until the
  welcome card closes, and writes them under `dad-friendly-homecomings` so a
  reload after a hidden settle still shows the card. The card names who came
  back and what they found, closes any open drawer as every self-opening
  card does (`coverDrawers`), and a live return uses it with no away report.
  Becoming visible settles at once. The layout check covers the drawer's
  states (above) and the welcome card with a find (the
  `board cards` table's `welcome find`). Trouble
  is shown on the machine's bay and on its row in the Buys drawer (`crew-panel`,
  #373): a warm shout ("Cave-in! · Hold to fix"), five taps or a short hold,
  then "Fixed! The crew cheers." in the drawer's kick. A tier with no bay lights
  the Buys key's red lamp. The layout check covers that row at 424×924,
  including the installed PWA. Built (#149).
- Designed twice: expeditions as a negative-speed tier in `TIERS` was rejected (it leaks into buying, cards and the sim's value function). Separate modules that feed `effectiveRates` keep it the one place multipliers meet.
