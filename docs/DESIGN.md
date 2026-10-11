# Design: The Legendary Relics of Fatherhood

This is the north star for the game. Open GitHub issues stay the plan; this page says what the issues add up to. Keep it short and edit it when a decision changes.

## Vision

Deep inside a mountain of **100,000,000 stones** lie the six Legendary Relics of Fatherhood, left by the great dads of history. You start with your bare hands: one tap, one stone. The mountain is far too big to dig by hand, and that is the point. Scale makes automation necessary, the way it does in _Needle In A Haystack_ and _Cookie Clicker_. Each relic you uncover is a power spike and a virtue of fatherhood.

The tone lifts dads up. It honors them; it does not joke at their expense.

It stays a dad-friendly game (see `AGENTS.md`): two-minute sessions, gentle, never punishing, close is pause, silent until unmuted, phone and PC, one save.

## Core loop

1. **Tap the mountain.** Each tap mines one stone. Stones are the currency.
2. **Hire helpers.** Spend stones on helpers who mine for you every second. Each helper costs more than the last (escalating cost), so the next one is always just in reach.
3. **Leave.** Helpers keep mining while you are away. Earnings are computed from timestamps on the next open; there is no live server.
4. **Come back.** A "While you were away" screen celebrates what your crew mined.
5. **Hit a relic depth.** Relics sit at fixed depths (stones mined out of the mountain). Reaching one uncovers it and unlocks its power.
6. **Golden veins.** Now and then a glinting vein appears; tap it for a short boost. Missing one costs nothing.

The always-visible counter shows stones left in the mountain, written readably ("987,654" → "987.7 thousand", "98.7 million").

## Relics

Depths are fractions of the mountain so tuning is one number. Order is the story: guide, protect, build, be patient, teach, become the hero.

| #   | Relic                 | Virtue          | Depth (stones mined)     | Power (first cut)                                                                                                                                                  |
| --- | --------------------- | --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Lantern of Guidance   | Guide           | 1,000,000                | Shows the next relic and a progress bar toward it; golden veins appear 40% sooner.                                                                                 |
| 2   | Shield of Protection  | Protect         | 10,000,000               | Away earnings are no longer capped (base cap is 8 hours). Progress is safe while you live your life.                                                               |
| 3   | Hammer of the Builder | Build           | 25,000,000               | Unlocks the Great Machine, the biggest automation tier. Before it, the Machine card shows once a borer is owned, as a dark silhouette marked Locked, Hammer · 25M. |
| 4   | Heart of Patience     | Patience        | 45,000,000               | Away earnings grow the longer you are gone (bonus up to ×2 after 12 hours). Putting the phone down is rewarded.                                                    |
| 5   | Crown of Wisdom       | Teach           | 70,000,000               | Kid helper miners: a helper tier that also boosts every other helper a little.                                                                                     |
| 6   | Mantle of the Hero    | Become the hero | 100,000,000 (the bottom) | Final relic. You become a Legend; unlocks prestige (pass the mine to your kid) later.                                                                              |

Relics are derived from stones mined (`src/relics.ts`), so the save has no relic field. A relic is celebrated once, in the session where it is uncovered (by tapping, helpers, a vein, or away earnings).

M1 shipped the first relic only. The mountain was 1,000,000 stones then; it is now 100,000,000 (save v4). A v3 save's stones mined are scaled ×100, so a dad keeps his place and every relic he found. The Lantern sits at 1% (earlier than the old 2%) so it still lands in the first evening.

## Numbers and tuning

- All game numbers live in one module (`src/mountain.ts`) as named constants. Change a number there, not in the UI.
- Integers only in the save. Live and away mining use the same pure function: `accrue(state, from, to)` turns elapsed whole seconds into stones and returns the time it consumed, so fractions are never lost and offline and online math cannot drift apart.
- Helper cost: `ceil(base × 1.15^owned)` (the Cookie Clicker curve). First helper: 10 stones, 1 stone per second.
- Base away cap: 8 hours, lifted by the Shield.
- Big numbers: plain digits under 10,000, then one decimal with a word ("12.3 thousand", "1.2 million").
- Pacing target for M1: first helper within a minute of tapping; first relic after roughly 1–2 evenings of short sessions.

## What happens to the 3×3 grid

The 3×3 dig / place / fuse grid is **replaced**, not extended. It was a sandbox for the save, auth, and idle plumbing, and that plumbing stays: progress store, cloud save, guest save in `localStorage`, structured log, save line. The grid domain (`grid.ts`) and screen (`pocket-grid-screen.ts`) are swapped for a mountain domain and screen.

Old saves are migrated, not wiped: dug cells count as stones already mined out of the mountain, and every stone or chunk on the grid becomes stones in your pocket (a chunk is worth two). Save format v3 carries the mountain; v1 and v2 still load.

## UI direction

- A towering mountain fills the screen and is the tap target. Fat finger, touch first.
- The stones-left counter is always visible at the top. Your pocket of stones sits under it.
- A relic shelf shows six slots: found relics glow, missing ones are dark silhouettes.
- Warm heroic lantern light: deep night browns, amber and gold highlights, soft glow. No harsh flashes, no sound until unmuted.
- The welcome-back screen is a celebration, not a chore: one big number, one button.
- Art comes from PixelLab (ask before generating). No placeholder boxes.

## Milestones

### M1: The Mountain (first playable of the new loop)

- Mountain, counter, hand mining (save v3 and migration from the grid save)
- First helper with escalating cost, live mining
- Away earnings and the welcome-back screen
- Golden veins
- First relic: Lantern of Guidance
- Relic shelf
- UI reskin to the lantern-light look

### M2: Automation

Hand mining can't move a 100-million-stone mountain. Each tier is a visible jump in speed.

| Tier          | First cost (stones) | Stones a second each | Unlock                                             |
| ------------- | ------------------- | -------------------- | -------------------------------------------------- |
| Helper miner  | 10                  | 1                    | from the start                                     |
| Mine cart     | 150                 | 8                    | shown once you own a helper                        |
| Steam drill   | 2,500               | 60                   | shown once you own a cart                          |
| Tunnel borer  | 40,000              | 450                  | shown once you own a drill                         |
| Great Machine | 600,000             | 3,500                | needs the Hammer of the Builder (25,000,000 mined) |

- Every tier uses the Cookie Clicker curve: `ceil(firstCost × 1.15^owned)`. Each tier costs about 15× and is about 7.5× faster than the one before. So the newest tier is the best deal for a while, then the older tiers catch up.
- One table of tiers (`src/tiers.ts`) drives buying, the speed total and the UI. `accrue` sums every tier, so away earnings use the same math automatically.
- Layout: up to three tiers show as roomy two-column cards. From four on, the grid goes three to a row with short names (Helper, Cart, Drill, Borer, Machine), so all five tiers fit in two rows and the screen never scrolls, even at 360x560.
- Save: the mountain gets one whole-number field per tier (`carts`, `drills`, `borers`, `machines`). A missing field reads as 0, so older saves load unchanged. Firestore rules allow those fields.
- UI: a compact two-column grid of tier cards (art, name and count, cost) under one total line ("42 stones a second"). A tier not shown yet takes no space. All primary controls must stay visible at 360x560.
- Pacing target: the mountain takes **days** for a dad who plays two short sessions a day and lets the crew mine the rest (8-hour away cap). Lantern on day 1, Hammer around days 2–3, the bottom around days 5–7. A pacing simulation test pins this, so tuning can't silently turn it into minutes. The numbers above are the first cut and that test tunes them.

### M3: Strategy (boosts vs long-term upgrades)

M2 gives the player one choice: which tier to buy next. M3 adds the real idle-game decision: **spend now for a short burst, or invest in something permanent**.

- **Quick boosts** (timed, bought with stones, one of each running at a time, shown with a countdown):
  - _Sharper picks_: taps yield ×2 for 10 minutes.
  - _Overtime_: crew output ×2 for 30 minutes.
  - Boosts run only while the game is open; they never multiply away earnings, so they reward active play without punishing rest.
- **Permanent upgrades** (one-time purchases, Cookie Clicker style, unlocked by owning enough of a tier):
  - _Better boots_: helpers +10% speed (more levels later).
  - _Steady hands_: away earnings +25%.
- **Crew synergies** (permanent, make mixed crews pay): e.g. each helper adds +1% to cart speed.
- **Tap power scaling**: upgrades that make a tap yield a share of the crew rate (e.g. +1% of crew/s per tap), so tapping stays meaningful at a million stones a second instead of being +1.
- **Prestige: pass the mine to your kid** (later, with the Mantle of the Hero): reset the mountain for a permanent multiplier. This is the ultimate long-term choice.
- All multipliers live in one pure function over the save (`effectiveRates`), so live ticks, away earnings and the UI agree. Boost timers use absolute end times in the save. Away earnings ignore boosts.
- UI: an "Upgrades" sheet behind one compact button. The main screen keeps its no-scroll budget (the browser check runs in CI).

### Later (sketch)

- **M2: Automation.** See above.
- **M4: Patience.** Heart of Patience, richer away screen, gentle daily rhythm.
- **M5: Legacy.** Crown of Wisdom, Mantle of the Hero, prestige (pass the mine to your kid).
