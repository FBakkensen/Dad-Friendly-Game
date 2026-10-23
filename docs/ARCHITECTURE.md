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
   functions, and values income from that speed, taps, and away pay. A craft's
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
   CI runs it with `--ci` and `LAB_STRICT=1`, posts the report, and fails
   the job on a miss. The crafted-share and idle-material rows are strict
   (#198). The tournament does not read the disk. `tools/sweep` (`npm run lab:sweep`) screens economy
   knobs (Morris, then Sobol) and writes that report. The sweep is
   offline and is not part of `npm run check`. A factor map scales
   prices, growth, output, tending, and rock hardness for the length of one run;
   outside a sweep every factor is 1. The tuned rock lives in `layers`, and
   `layer.<n>.<tier>.hardness` multiplies it (#194, #198).
   `pacing` simulates players on top of them and buys through the catalogue.
   Every number lives here.
2. **Saves:** `persist` (versioned save format and parser; an unknown recipe, bench, or crafted level is written back instead of dropped), `session-save`
   (guest storage), `phone-backup` (signed-in on-phone copy, never deleted),
   `save-progress` (which copy is ahead), `cloud-save` (interface + memory fake),
   `firebase-save` (the SDK adapter; mountain save plus `fieldLogs/{uid}`),
   `firestore.rules` (server-side mirror of the parser and the field log,
   guarded by `rules-drift.test.ts` and the emulator tests).
3. **State:** `progress-store` owns the live mountain: settling time, away
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

## Findings

- **Single source for rates holds.** All speed, tap and away math goes
  through `effectiveRates`; the screen never multiplies on its own.
- **Import cycle (fixed in #104):** `relics` ↔ `mountain` ↔ `rates` broke at
  module init; `MOUNTAIN_STONES` now lives in the leaf module `scale`. `npm run cycles`
  (part of `npm run check`, so CI) now fails on any runtime import cycle; it
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

  Done: `mountain-screen.ts` is now ~460 lines: layout, the mountain and
  vein taps, the guide bar, save status, and wiring the panels.

- **Panel contract:** a panel gets `progress`, `getView`, `now` and a
  `requestRender` callback; it never reads another panel's elements, and it
  owns its open/closed state. The thumb bar uses those gates: Workshop stays
  shut until `workshopUnlocked`, Engineers until a hand is on the crew. Buys
  and Upgrades open from the first screen. The relic shelf is centred in the
  mountain wrap. Buys and Upgrades scroll inside the sheet so the last card
  clears the footer.

## Guards (#118)

- `npm run cycles`: no runtime import cycles in `src`.
- `rules-drift.test.ts`: `firestore.rules` allows exactly the `Mountain` save
  fields (a `Required<Mountain>` sample makes a new field a type error until
  listed), every upgrade id with its max level, and every boost id.
- `knip` (strict): no unused files, exports or dependencies.
- `prettier --check .` covers docs too; coverage floors per critical module.

## M7 sketch

Staffing (#140), the workers' name (#139), the field log (#141–#143), engineers (#144), expeditions (#146), the side-tunnels sheet (#147), lost tools (#148) and hazards (#149) are built.

- **Names:** player text says "worker"; `helpers`, `TierId "helper"` and the rules keep their names (no save migration). All copy comes from `screen-words`. Built (#139).
- `tiers`: worker growth ×1.25; staff cart 1 / drill 3 / borer 8 / Great Machine 25; borer first cost 10M. `crew.staffExisting` grants once more (`staffed: 2`; `true` and `1` are the #89 grant). Built (#140). Great Machine staff stays 25: staff 15 still never runs one in the sim and reopens a 2.5-day gap with no purchase.
- `engineers` (rules layer, pure): `Engineer = { name, rank: 0 | 1 | 2, trips, post: TierId | "tunnel" | "camp" }`; `promote(mountain)`, `station(mountain, i, post)`, `rankOf`, `addTrip`. `promote` takes no `now`: the price does not depend on the clock. Save: `engineers?: Engineer[]` (max 5, names Ada, Nils, Ruth, Otto, Mae). The first engineer arrives with the first borer, already tending it, without spending a worker; `grantFirstEngineer` does that once for an older save. Rules check the first two hands. A later hand, and a duplicate name, are rejected by the parser: checking them beside a full v6 save crosses the 1000-expression budget (#219). Rules + drift guard + emulator tests. Built (#144). Buying a machine does not call `tendBestTier` (#145); the sheet's post sticks. The pacing sim still calls it.
- `expeditions` (rules layer, pure): `TUNNELS` (a side seam, 10 min; the old shaft, 1 h; the deep dark, 4 h, Journeyman+). `send(mountain, engineer, tunnel, now)` stores the find, seeded from `sentAt`, and the post they left (`home`), then moves that engineer to `"tunnel"`. `recall` puts them back at `home` with no trip and no find. `settle(mountain, now)` clamps a future `sentAt` to now (the wait and the find stay, the same idea as a future `lastSeen`) and returns `{ mountain, finds, homecomings }` for every expedition past `returnsAt`, adding a trip and restoring `home`. `homecomings` (who, which tunnel, the settled find) is session news for the welcome card, not a save field. `accrueAway` returns the same list for parties who came home while the game was closed. Save: `expeditions?: { engineer, tunnel, sentAt, returnsAt, home, find }[]` (≤5, `returnsAt > sentAt`, no longer than the deep dark, closed tunnel and find ids, one trip per name) and `finds?: FindId[]` (lost tools and keepsakes, no duplicates). `home` and `find` are stored because `"tunnel"` would forget the machine, and clamping `sentAt` would reroll a find that was only recomputed from it. Rules cap the list at 5 and check the tunnel and `returnsAt > sentAt` on the first two trips. Shelf ids are a closed list. The parser rejects a bad trip, a duplicate shelf id, and anything past those two checks: doing all of that in rules, beside five engineers, crosses the 1000-expression budget. Built (#146). The worn map shortens the next send to three quarters of the tunnel time (`expeditionAwayMs`); a party already out keeps its clock. Built (#148).
- `rates`: `effectiveRates` adds the tending bonus (per tier, the best engineer there; none at camp or in a tunnel) and, while an engineer tends the Great Machine, drops its staff from 25 to 5 (`TENDED_MACHINE_STAFF`). Built (#144). #178 multiplied borer tenths by 1.62. #210 makes that seven quarters, so an apprentice on the borer is +17.5%. Once a Great Machine exists and the best tender is not on it, that post is topped up to 12% of the untended crew. A second running post adds its own floor. `valueOf` prices a find as expected stones over the horizon (`src/economy/finds.ts`); keepsakes and glimmers are 0. Session trouble arrives as an optional third argument and slows that tier only; away pay never passes it. Built (#149). Grandfather's pick strengthens the bare tap (five fourths, rounded up) before Sharper picks doubles it. Built (#148). `accrueAway` splits the paid window at each `returnsAt` after clamping a future `sentAt`, so the tending bonus resumes from the return; a party already home before that window (including during the unpaid part of a capped absence) tends the whole of it. Built (#146). The pacing dad (`tendBestTier`) keeps Ada on the borers until he owns a Great Machine, then moves her onto it. He fixes trouble within 3 seconds. From the first borer, the sim pays the real promotion for Nils (2,000,000 stones and one worker) and he waits at camp. The plain dad reaches the bottom on day 5.5 and a second run on day 4. Upgrade and boost dads stay on day 5.0. The first mountain takes at least 5 days (#163, #171). Nils walks the old shaft at the start of every session and, once a journeyman, the deep dark each night. Finds apply. Days stay 1.5 / 3.5 / 5.5 / 5.0, second run 4.
- `hazards` (rules layer, pure): `nextTrouble(seed, now, mountain)`, `fix`, `pressTrouble`, `slowedSpeed`. One trouble at a time, every 3–6 minutes of live play, only once a borer is owned. Cave-in on carts, flood on drills, jam on borers or the Great Machine. The tier keeps three quarters of its speed at first and eases to half over two minutes. Five taps or a 600ms hold fixes it. An engineer tending that tier fixes it after 30 seconds; a Master fixes it at once. Steel-toe boots double the gap when `wearsSteelToes(mountain)` is true (or the caller passes `boots: true`). Built (#148). Session state lives in `progress-store`, never in the save, and clears on close, reload, and away time. Built (#149).
- `field-log` (rules layer, pure): `snapshot(mountain, rates, now, version)` and `EventRing` (last 200) are built (#141). `progress-store` records tier and upgrade purchases, boosts started, relic found, vein tapped, away report, Start over, pass the mine, and save errors. The ring is not a mountain save field. The menu copies `{ snapshot, events: last 50 }` as pretty JSON, with a read-only sheet when the clipboard is missing. No email or display name. Signed-in games write `fieldLogs/{uid}` = `{ snapshot, events (≤200), updatedAt }` at most every 5 minutes, and immediately on hide, Start over, and passing the mine (#142). Those two resets clear the ring first. Guests write nothing. `shouldWriteFieldLog` is the throttle. Rules: owner-only read/write, snapshot shape, `events` length ≤ 200, the first event's shape, no delete. The rules engine allows 1000 expressions, which is not enough to type-check all 200 events on top of the snapshot, so the client also refuses a document over 50 KB (`fieldLogWithinBudget`). `tools/field-log.ts` (#143) reads those documents with the Firebase Admin SDK: Application Default Credentials (`gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS`), or the Firestore emulator when `FIRESTORE_EMULATOR_HOST` is set. `npm run field-log` lists every log; `--uid` or a positional uid reads one. The default print is a summary with local times; `--json` prints the stored documents. Built (#150): the snapshot lists engineers (`name`, `rank`, `post`) and running expeditions (`engineer`, `tunnel`, ISO `returnsAt`). Rules cap each list at 5 and check that the first item is a map of the expected keys. A closed-name check, beside the snapshot and the first event, crosses the 1000-expression budget. A full relic shelf and a second boost are size-capped only: naming every relic made a late-game field log write fail the same way (#219). The client writes the typed snapshot. The ring adds `engineer.promote`, `engineer.station` (a machine post, or `camp` when called back), `expedition.send`, `expedition.return` (find id in `source`; `quiet` when the tunnel was empty), `expedition.recall`, `trouble.start`, `trouble.fix` (`hand` or `engineer`), `crew.staff` (workers granted by the one-time top-up), `layer.enter` (the band id), `craft.start` (the recipe id), `craft.done` (the recipe id and the new level). A layer card and a craft-done notice are session news, like a relic reveal: the baseline is the loaded save, so a band you already sit in, or a craft already fitted, is not announced again after a reload or another absence. An absence that does break into a band, or finish a craft, folds that line into the welcome card. A compact machine card always shows the gain of one more (`+N · total/s`) and the workers one more needs, from `staffForBuy` (cart 1, drill 3, borer 8, Great Machine 25, or 5 when an engineer would tend it). Short hands read `Needs N workers · M free`. The crew line lists where the workers are, and a tap opens that breakdown when the line does not fit. The Workshop's Quiet/Sound toggle is the only sound control. Trouble stays out of the snapshot: it is never saved. Choosing a post while a party is out records the recall and, when the new post is not the one they left, the station.
- `lost-tools` (rules layer, pure): `hasLostTool`, `tapWithPick`, `glintScale`, `expeditionAwayMs`, `wearsSteelToes`. The old miner's lamp doubles a golden vein's glint (`veinGlintMs`). Keepsake stories live in `screen-words`. No new save field: the shelf is still `finds`. Built (#148).
- `layers` (rules layer, pure): four bands from stones mined. Topsoil from 0, Granite from 10M, Crystal Caves from 45M, Deep Heart from 120M through the bottom. `layerOf` reads `minedOut`. Entering a band includes its first stone, so 10M is the Granite, beside the Shield. Hardness is a per-tier speed in `effectiveRates`, and the sweep factor `layer.<n>.<tier>.hardness` multiplies it. Workers and kids stay at 1. No layer field. Each band drops its material on the tuned gap in `MATERIAL_EVERY` (1,000,000 clay, 1,000,000 iron, 5,000,000 crystal, 10,000,000 heartstone). `accrue`, `accrueAway`, and a hand tap add the units. The remainder stays in the stone total. Built (#194, #195, #198).
- Save v7 adds `rev`, `deviceId`, and `savedAt` beside the workshop. `rev` starts at 1 (a new doc, or the first write of a v6 doc, which counts as rev 0) and the rules accept only `stored + 1`. The compare is before the mountain walk so a stale write stays under the expression cap. `savedAt` must be `request.time`. One cloud write is in flight, at most one a second, and the newest mountain is the next payload. A rev refusal reads the server doc. A later run wins whole. A lower rev is never adopted. One copy fast-forwards when it is at least as far on stones mined, upgrade levels, crafts, recipes, finds, engineer trips, machines (carts, drills, borers, the Great Machine) and crew, and further on one of the progress facts. A lead that is only machines or crew, or a split where each side has something the other lacks, is not blended. The phone keeps its copy. The sheet "Two saves found" asks which to play. The other copy is archived first at `saveArchive/{uid}/copies/{id}` for seven days (owner create and read, no update, no delete). Then the chosen copy is written at the server rev plus one. A failed archive leaves both copies and the sheet. `syncedRev` on the phone backup is the last confirmed rev. `save.conflict` logs the revs, device ids, stones mined, and the choice. Saved copies in the menu restore one the same way and log `save.restore`. A copy from an earlier run is not restored: the current game, the phone backup, and the cloud stay as they are, and nothing new is archived. The field log snapshot includes `deviceId` and `rev`. A newer service worker shows "Update available" and a reload button. Old cached builds cannot write once a rev exists. Coming back reads the server before writing. A cached snapshot (Firestore persistent cache) does not count as that read. One writer tab per device; Play here flushes the phone backup first. Offline writes stay in that cache until the next open, and a stale queued rev is rejected like any other.
- Save v6 keeps `materials`, `bench`, `crafted`, `recipes`, and optional `chargeUntil` on the mountain in memory, and writes them as one `workshop` map beside the mountain. The mountain key list in `firestore.rules` cannot grow, and a full crew is already at the expression budget, so the rules only require that map. The parser checks the four material ints (each capped at that band's width), the bench times, crafted levels, and a whole `chargeUntil`. An unknown shelf id is dropped. An unknown recipe id, a craft level, and a bench this build cannot name are written back, so a newer id cannot lock an older client out of the save. While that bench's clock is still running, the Workshop says "Something is on the bench" and a new craft waits (#202). A v1–v5 save, local or cloud, keeps the stones already mined and is granted the materials those stones would have dug. Recipes are the starting three, plus Reinforce once the Granite is reached, plus Diamond bits and Crystal flare in the Crystal Caves, plus the Heartstone core and Heartstone ember in the Deep Heart. The lamp and the kit are not granted. The bench is empty and nothing is crafted. A v6 document keeps the pocket it stored. Passing the mine keeps the recipes and clears materials, the bench, crafted gear, and a hot charge. Built (#195, #196).
- `workshop` (rules layer, pure): one bench. A recipe this build cannot name still occupies it until its clock ends (`unknownBench`): the sheet counts it down, offers no refund, and a new craft waits. Once that clock has rung, a known craft may take the bench. `startCraft` spends stones and materials when the Granite is open, the recipe is known, and the pocket can pay. `settleBench` fits a craft whose clock has rung, once, including inside `accrue` and `accrueAway`. `cancelCraft` returns lasting gear in full, because its effect has not started, and only the unused share of a live timer (axle grease, a blasting charge, a crystal flare, a heartstone ember). A craft whose clock has already rung is fitted instead. `cancelRefund` and `hotTimers` are what the sheet reads. Rails, bits, the core, and Reinforce (max 5) multiply tier speed in `effectiveRates`. A blasting charge doubles the live crew until `chargeUntil`. Axle grease doubles the live crew until `axleUntil`, including while it is still on the bench. Axle grease, a blasting charge, and Overtime meet in `effectiveRates`, and the crew runs at the strongest of them. A heartstone ember multiplies the Great Machine by 1.25 until `emberUntil`. A crystal flare makes veins 25% more often until `flareUntil`. Crafting a flare, an ember, or another grease refreshes that clock and does not stack. None of those timers change away pay. Sturdy props stretch the trouble gap. The lamp makes golden veins more often for good. The engineer's kit shortens the next expedition. Strength and cost factors (`recipe.<id>.strength`, `recipe.<id>.cost`) default to 1; strength also scales a timed buff's length. Built (#196, #198, #210). The sheet is `workshop-panel` (#199): opened from the menu, a dark "Locked · The Granite" before that, four cards to a page so a short phone does not scroll, real costs and effects, a shake when the pocket is short, materials that float to the bench, a quiet hammer until Sound is on, and a cancel that names the refund. A grease or charge card says "Crew already at ×2" when another crew timer is already that strong. The countdown keeps running while the sheet is shut.
- Panels: `engineers-panel` is the Engineers sheet (#161): one open card and one-line rows, Tend and Send exploring choice lists, a cheer toast, and the walk-home state. A tend choice calls `station(recall(...))`, so a party is never left without its engineer. Call back confirms, then `recall`. Promote confirms, Step up checks the price again, and the cheer waits until that hand is actually on the crew. The button shows the price ("Promote: 2M stones"; a light pocket says "Needs 2M stones"). Tending choices, the open sentence, the cheer, and the lamp show the live stones/sec from `tendingGain`. Keepsakes already on `finds` are listed on the open card at reading size (`Brought home`); a full crew on a short phone keeps that to one line and a toast tells the stories. No new save field. A countdown chip still sits in the mountain's corner (words, not a clock). `progress-store` keeps `homecomings` until the welcome card closes, and writes them under `dad-friendly-homecomings` so a reload after a hidden settle still shows the notice. The card names who came back and what they found, sits above the other sheets, and a live return uses it with no away report. Becoming visible settles at once. The layout check covers the sheet with an expedition out, five engineers plus a keepsake at 360×560, 360×640 and 375×667 (browser and installed PWA), and the welcome card with a find. Trouble is shown on the tier card in `crew-panel`: a warm shout ("Cave-in!"), five taps or a short hold, then "Fixed! The crew cheers." The layout check covers that card at 360×560, including the installed PWA. Built (#149).
- Designed twice: expeditions as a negative-speed tier in `TIERS` was rejected (it leaks into buying, cards and the sim's value function). Separate modules that feed `effectiveRates` keep it the one place multipliers meet.
