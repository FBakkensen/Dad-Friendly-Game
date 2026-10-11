# Design: The Legendary Relics of Fatherhood

This is the north star for the game. Open GitHub issues stay the plan; this page says what the issues add up to. Keep it short and edit it when a decision changes.

## Vision

Deep inside a mountain of about **1,000,000 stones** lie the six Legendary Relics of Fatherhood, left by the great dads of history. You start with your bare hands: one tap, one stone. The mountain is far too big to dig by hand, and that is the point. Scale makes automation necessary, the way it does in _Needle In A Haystack_ and _Cookie Clicker_. Each relic you uncover is a power spike and a virtue of fatherhood.

The tone lifts dads up. It honors them; it does not joke at their expense.

It stays a dad-friendly game (see `AGENTS.md`): two-minute sessions, gentle, never punishing, close is pause, silent until unmuted, phone and PC, one save.

## Core loop

1. **Tap the mountain.** Each tap mines one stone. Stones are the currency.
2. **Hire helpers.** Spend stones on helpers who mine for you every second. Each helper costs more than the last (escalating cost), so the next one is always just in reach.
3. **Leave.** Helpers keep mining while you are away. Earnings are computed from timestamps on the next open; there is no live server.
4. **Come back.** A "While you were away" screen celebrates what your crew mined.
5. **Hit a relic depth.** Relics sit at fixed depths (stones mined out of the mountain). Reaching one uncovers it and unlocks its power.
6. **Golden veins.** Now and then a glinting vein appears; tap it for a short boost. Missing one costs nothing.

The always-visible counter shows stones left in the mountain, written readably ("987,654" → "987.7 thousand", "1.2 million").

## Relics

Depths are fractions of the mountain so tuning is one number. Order is the story: guide, protect, build, be patient, teach, become the hero.

| #   | Relic                 | Virtue          | Depth (stones mined)   | Power (first cut)                                                                                               |
| --- | --------------------- | --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Lantern of Guidance   | Guide           | 20,000                 | Shows the next relic and a progress bar toward it; golden veins appear 40% sooner.                              |
| 2   | Shield of Protection  | Protect         | 100,000                | Away earnings are no longer capped (base cap is 8 hours). Progress is safe while you live your life.            |
| 3   | Hammer of the Builder | Build           | 250,000                | Unlocks the second, bigger helper tier (×10 output per helper class).                                           |
| 4   | Heart of Patience     | Patience        | 450,000                | Away earnings grow the longer you are gone (bonus up to ×2 after 12 hours). Putting the phone down is rewarded. |
| 5   | Crown of Wisdom       | Teach           | 700,000                | Kid helper miners: a helper tier that also boosts every other helper a little.                                  |
| 6   | Mantle of the Hero    | Become the hero | 1,000,000 (the bottom) | Final relic. You become a Legend; unlocks prestige (pass the mine to your kid) later.                           |

Relics are derived from stones mined (`src/relics.ts`), so the save has no relic field. A relic is celebrated once, in the session where it is uncovered (by tapping, helpers, a vein, or away earnings).

M1 ships the first relic only (Lantern of Guidance, 20,000 stones), reachable in the first evening or two with a few helpers.

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

### Later (sketch)

- **M2: The Crew.** More helper tiers, Hammer of the Builder, Shield of Protection.
- **M3: Patience.** Heart of Patience, richer away screen, gentle daily rhythm.
- **M4: Legacy.** Crown of Wisdom, Mantle of the Hero, prestige (pass the mine to your kid).
