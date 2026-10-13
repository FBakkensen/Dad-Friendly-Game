# Architecture

Review for M5 (#115). The game is a small, framework-free TypeScript app. This
page is the map, plus the rules that keep it that way.

## Layers (imports point down only)

1. **Rules of the game (pure, no DOM):** `scale` → `mountain`, `tiers`,
   `relics`, `upgrades`, `boosts`, `veins`, `crew`, `rates` (the one place
   every multiplier is applied: live ticks, away pay, taps, the UI), and
   `field-log` (a JSON snapshot and an event ring). `pacing` simulates
   players on top of them. Every number lives here.
2. **Saves:** `persist` (versioned save format and parser), `session-save`
   (guest storage), `cloud-save` (interface + memory fake), `firebase-save`
   (the SDK adapter; mountain save plus `fieldLogs/{uid}`), `firestore.rules`
   (server-side mirror of the parser and the field log,
   guarded by `rules-drift.test.ts` and the emulator tests).
3. **State:** `progress-store` owns the live mountain: settling time, away
   pay, reveals, migrations, and when/where to save. The screen only calls
   its methods.
4. **Screen:** `mountain-screen` builds the page and wires panels; panels are
   their own modules with a `create…Panel` factory returning their elements
   and a `render()` (`upgrades-panel`, `relic-panels`, `welcome-panel`, `menu-panel`, `crew-panel`). Shared player-facing
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
  owns its open/closed state.

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
- `engineers` (rules layer, pure): `Engineer = { name, rank: 0 | 1 | 2, trips, post: TierId | "tunnel" | "camp" }`; `promote(mountain)`, `station(mountain, i, post)`, `rankOf`, `addTrip`. `promote` takes no `now`: the price does not depend on the clock. Save: `engineers?: Engineer[]` (max 5, names Ada, Nils, Ruth, Otto, Mae). The first engineer arrives with the first borer, already tending it, without spending a worker; `grantFirstEngineer` does that once for an older save. Rules + drift guard + emulator tests. Built (#144). Buying a machine does not call `tendBestTier` (#145); the sheet's post sticks. The pacing sim still calls it.
- `expeditions` (rules layer, pure): `TUNNELS` (a side seam, 10 min; the old shaft, 1 h; the deep dark, 4 h, Journeyman+). `send(mountain, engineer, tunnel, now)` stores the find, seeded from `sentAt`, and the post they left (`home`), then moves that engineer to `"tunnel"`. `recall` puts them back at `home` with no trip and no find. `settle(mountain, now)` clamps a future `sentAt` to now (the wait and the find stay, the same idea as a future `lastSeen`) and returns `{ mountain, finds, homecomings }` for every expedition past `returnsAt`, adding a trip and restoring `home`. `homecomings` (who, which tunnel, the settled find) is session news for the welcome card, not a save field. `accrueAway` returns the same list for parties who came home while the game was closed. Save: `expeditions?: { engineer, tunnel, sentAt, returnsAt, home, find }[]` (≤5, `returnsAt > sentAt`, no longer than the deep dark, closed tunnel and find ids, one trip per name) and `finds?: FindId[]` (lost tools and keepsakes, no duplicates). `home` and `find` are stored because `"tunnel"` would forget the machine, and clamping `sentAt` would reroll a find that was only recomputed from it. Rules cap the list at 5 and check the tunnel and `returnsAt > sentAt` on the first two trips. Shelf ids are a closed list. The parser rejects a bad trip, a duplicate shelf id, and anything past those two checks: doing all of that in rules, beside five engineers, crosses the 1000-expression budget. Built (#146). The worn map shortens the next send to three quarters of the tunnel time (`expeditionAwayMs`); a party already out keeps its clock. Built (#148).
- `rates`: `effectiveRates` adds the tending bonus (per tier, the best engineer there; none at camp or in a tunnel) and, while an engineer tends the Great Machine, drops its staff from 25 to 5 (`TENDED_MACHINE_STAFF`). Built (#144). Session trouble arrives as an optional third argument and slows that tier only; away pay never passes it. Built (#149). Grandfather's pick strengthens the bare tap (five fourths, rounded up) before Sharper picks doubles it. Built (#148). `accrueAway` splits the paid window at each `returnsAt` after clamping a future `sentAt`, so the tending bonus resumes from the return; a party already home before that window (including during the unpaid part of a capped absence) tends the whole of it. Built (#146). The pacing dad (`tendBestTier`) keeps Ada on the borers until he owns a Great Machine, then moves her onto it. He fixes trouble within 3 seconds. From the first borer, the sim pays the real promotion for Nils (2,000,000 stones and one worker) and he waits at camp. The plain dad reaches the bottom on day 5.5 and a second run on day 4.5. Upgrade and boost dads stay on day 5.0. The first mountain takes at least 5 days (#163). Nils walks the old shaft at the start of every session and, once a journeyman, the deep dark each night. Finds apply. Days stay 1.5 / 3.5 / 5.0, second run 4.0.
- `hazards` (rules layer, pure): `nextTrouble(seed, now, mountain)`, `fix`, `pressTrouble`, `slowedSpeed`. One trouble at a time, every 3–6 minutes of live play, only once a borer is owned. Cave-in on carts, flood on drills, jam on borers or the Great Machine. The tier keeps three quarters of its speed at first and eases to half over two minutes. Five taps or a 600ms hold fixes it. An engineer tending that tier fixes it after 30 seconds; a Master fixes it at once. Steel-toe boots double the gap when `wearsSteelToes(mountain)` is true (or the caller passes `boots: true`). Built (#148). Session state lives in `progress-store`, never in the save, and clears on close, reload, and away time. Built (#149).
- `field-log` (rules layer, pure): `snapshot(mountain, rates, now, version)` and `EventRing` (last 200) are built (#141). `progress-store` records tier and upgrade purchases, boosts started, relic found, vein tapped, away report, Start over, pass the mine, and save errors. The ring is not a mountain save field. The menu copies `{ snapshot, events: last 50 }` as pretty JSON, with a read-only sheet when the clipboard is missing. No email or display name. Signed-in games write `fieldLogs/{uid}` = `{ snapshot, events (≤200), updatedAt }` at most every 5 minutes, and immediately on hide, Start over, and passing the mine (#142). Those two resets clear the ring first. Guests write nothing. `shouldWriteFieldLog` is the throttle. Rules: owner-only read/write, snapshot shape, `events` length ≤ 200, the first event's shape, no delete. The rules engine allows 1000 expressions, which is not enough to type-check all 200 events on top of the snapshot, so the client also refuses a document over 50 KB (`fieldLogWithinBudget`). `tools/field-log.ts` (#143) reads those documents with the Firebase Admin SDK: Application Default Credentials (`gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS`), or the Firestore emulator when `FIRESTORE_EMULATOR_HOST` is set. `npm run field-log` lists every log; `--uid` or a positional uid reads one. The default print is a summary with local times; `--json` prints the stored documents. Engineers, expeditions, and hazards join the snapshot and the ring in #150.
- `lost-tools` (rules layer, pure): `hasLostTool`, `tapWithPick`, `glintScale`, `expeditionAwayMs`, `wearsSteelToes`. The old miner's lamp doubles a golden vein's glint (`veinGlintMs`). Keepsake stories live in `screen-words`. No new save field: the shelf is still `finds`. Built (#148).
- Panels: `engineers-panel` is the Engineers sheet (#161): one open card and one-line rows, Tend and Send exploring choice lists, a cheer toast, and the walk-home state. A tend choice calls `station(recall(...))`, so a party is never left without its engineer. Call back confirms, then `recall`. Promote confirms and does not show the price. Keepsakes already on `finds` are listed on the open card at reading size (`Brought home`); a full crew on a short phone keeps that to one line and a toast tells the stories. No new save field. A countdown chip still sits in the mountain's corner (words, not a clock). `progress-store` keeps `homecomings` until the welcome card closes. The card names who came back and what they found; a live return uses that card with no away report. The layout check covers the sheet with an expedition out, five engineers plus a keepsake at 360×560, 360×640 and 375×667 (browser and installed PWA), and the welcome card with a find. Trouble is shown on the tier card in `crew-panel`: a warm shout ("Cave-in!"), five taps or a short hold, then "Fixed! The crew cheers." The layout check covers that card at 360×560, including the installed PWA. Built (#149).
- Designed twice: expeditions as a negative-speed tier in `TIERS` was rejected (it leaks into buying, cards and the sim's value function). Separate modules that feed `effectiveRates` keep it the one place multipliers meet.
