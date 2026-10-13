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
   (the SDK adapter), `firestore.rules` (server-side mirror of the parser,
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

Staffing retune is built (#140). The rest below is design, not built.

- **Names:** player text says "worker"; `helpers`, `TierId "helper"` and the rules keep their names (no save migration). All copy comes from `screen-words`. Built (#139).
- `tiers`: worker growth ×1.25; staff cart 1 / drill 3 / borer 8 / Great Machine 25; borer first cost 10M. `crew.staffExisting` grants once more (`staffed: 2`; `true` and `1` are the #89 grant). Built (#140). Great Machine staff stays 25: staff 15 still never runs one in the sim and reopens a 2.5-day gap with no purchase.
- `engineers` (rules layer, pure): `Engineer = { name, rank: 0 | 1 | 2, trips, post: TierId | "tunnel" | "camp" }`; `promote(mountain, now)`, `station(mountain, i, tier)`, `rankOf`. Save: `engineers?: Engineer[]` (max 5, names from a closed list). Rules + drift guard + emulator tests.
- `expeditions` (rules layer, pure): `TUNNELS`; `send(mountain, engineer, tunnel, now)`, `recall`, `settle(mountain, now) → { mountain, finds }`. Save: `expeditions?: { engineer, tunnel, sentAt, returnsAt }[]`, `finds?: FindId[]` (closed list). Rules check `returnsAt > sentAt` and caps.
- `rates`: `effectiveRates` adds the tending bonus (per tier, skipped while that engineer is in a tunnel) and lost-tool effects; hazards arrive as an optional session-only `trouble` argument. `accrueAway` splits at each `returnsAt`, so away and live agree.
- `hazards` (rules layer, pure): `nextTrouble(seed, now)`, `fix`, slowdown curve, auto-fix by a tending engineer. Session state in `progress-store`, never saved.
- `field-log` (rules layer, pure): `snapshot(mountain, rates, now, version)` and `EventRing` (last 200) are built (#141). `progress-store` records tier and upgrade purchases, boosts started, relic found, vein tapped, away report, Start over, pass the mine, and save errors. The ring is session memory (no save field). The menu copies `{ snapshot, events: last 50 }` as pretty JSON, with a read-only sheet when the clipboard is missing. No email or display name. Cloud `fieldLogs/{uid}` (#142) and `tools/field-log.ts` (#143) are not built. Engineers, expeditions, and hazards join the snapshot and the ring in #150.
- Panels: `engineers-panel` (side tunnels + engineer posts, one sheet); trouble shown in `crew-panel`. The layout check covers the sheet button and a trouble card at 360×560.
- Designed twice: expeditions as a negative-speed tier in `TIERS` was rejected (it leaks into buying, cards and the sim's value function). Separate modules that feed `effectiveRates` keep it the one place multipliers meet.
