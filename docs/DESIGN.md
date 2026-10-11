# Design: The Legendary Relics of Fatherhood

This is the north star for the game. Open GitHub issues stay the plan; this page says what the issues add up to. Keep it short and edit it when a decision changes.

## Vision

Deep inside a mountain of **100,000,000 stones** lie the six Legendary Relics of Fatherhood, left by the great dads of history. You start with your bare hands: one tap, one stone. The mountain is far too big to dig by hand, and that is the point. Scale makes automation necessary, the way it does in _Needle In A Haystack_ and _Cookie Clicker_. Each relic you uncover is a power spike and a virtue of fatherhood.

The tone lifts dads up. It honors them; it does not joke at their expense.

It stays a dad-friendly game (see `AGENTS.md`): two-minute sessions, gentle, never punishing, close is pause, silent until unmuted, phone and PC, one save.

## Core loop

1. **Tap the mountain.** Each tap mines one stone. Stones are the currency.
2. **Hire helpers.** Spend stones on helpers who mine for you every second. Each helper costs more than the last (escalating cost), so the next one is always just in reach.
3. **Leave.** Helpers keep mining while you are away, at a resting pace (30% of their speed, up to 8 hours). Earnings are computed from timestamps on the next open; there is no live server.
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
| 4   | Heart of Patience     | Patience        | 45,000,000               | Away earnings grow the longer you are gone (up to ×1.5 after 12 hours). Putting the phone down is rewarded.                                                        |
| 5   | Crown of Wisdom       | Teach           | 70,000,000               | Kid helper miners: a helper tier that also boosts every other helper a little.                                                                                     |
| 6   | Mantle of the Hero    | Become the hero | 100,000,000 (the bottom) | Final relic. You become a Legend; unlocks prestige (pass the mine to your kid) later.                                                                              |

Relics are derived from stones mined (`src/relics.ts`), so the save has no relic field. A relic is celebrated once, in the session where it is uncovered (by tapping, helpers, a vein, or away earnings).

M1 shipped the first relic only. The mountain was 1,000,000 stones then; it is now 100,000,000 (save v4). A v3 save's stones mined are scaled ×100, so a dad keeps his place and every relic he found. The Lantern sits at 1% (earlier than the old 2%) so it still lands in the first evening.

## Numbers and tuning

- All game numbers live in one module (`src/mountain.ts`) as named constants. Change a number there, not in the UI.
- Integers only in the save. Live and away mining use the same pure function: `accrue(state, from, to)` turns elapsed whole seconds into stones and returns the time it consumed, so fractions are never lost and offline and online math cannot drift apart.
- Helper cost: `ceil(base × 1.15^owned)` (the Cookie Clicker curve). First helper: 10 stones, 1 stone per second.
- Base away cap: 8 hours; the Shield lifts it to 24 hours (built, #104: `effectiveRates().awayCapMs`). Paying the sim dad's full 11h40 nights made the bottom day 5.0, so the borer's first cost rose 2.5M → 8M (bottom back to day 6 for both sim dads; Lantern 1.5, Hammer 3–3.5).
- Away pay rate: time away (app closed, or sitting in the background with no ticks for over 10 seconds) pays `AWAY_PAY_RATE` = **30%** of the crew's speed; live play pays in full. It is the main pacing lever. The Heart of Patience can raise it later (e.g. toward 60% after long absences), and so can M3's _Steady hands_.
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
| Helper miner  | 20                  | 1                    | from the start                                     |
| Mine cart     | 100                 | 10                   | shown once you own a helper                        |
| Steam drill   | 20,000              | 60                   | shown once you own a cart                          |
| Tunnel borer  | 8,000,000           | 350                  | shown once you own a drill                         |
| Great Machine | 80,000,000          | 3,500                | needs the Hammer of the Builder (25,000,000 mined) |

- Every machine tier uses a steep Cookie Clicker curve: `ceil(firstCost × 2^owned)`, so each one costs twice the last. Helpers grow gently (`1.15^owned`, since #89) because they staff the machines. Each tier is 6–10× faster than the one before, a big visible jump. The Great Machine is the endgame purchase: the pacing dad buys his one near the bottom. These numbers come from the pacing simulation; see Pacing below.
- One table of tiers (`src/tiers.ts`) drives buying, the speed total and the UI. `accrue` sums every tier, so away earnings use the same math automatically.
- Layout: up to three tiers show as roomy two-column cards. From four on, the grid goes three to a row with short names (Helper, Cart, Drill, Borer, Machine), so all five tiers fit in two rows and the screen never scrolls, even at 360x560.
- Save: the mountain gets one whole-number field per tier (`carts`, `drills`, `borers`, `machines`). A missing field reads as 0, so older saves load unchanged. Firestore rules allow those fields.
- UI: a compact two-column grid of tier cards (art, name and count, cost) under one total line ("42 stones a second"). A tier not shown yet takes no space. All primary controls must stay visible at 360x560.
- Pacing target: the mountain takes **days** for a dad who plays two short sessions a day and lets the crew mine the rest (8-hour away cap). Lantern on day 1, Hammer around days 2–3, the bottom around days 5–7.
- **Pacing** (`src/pacing.ts`, pinned by `src/pacing.test.ts`): a deterministic dad plays two 10-minute sessions a day, 12 hours apart, taps 3 stones a second, always buys the most speed per stone, and is paid 30% of crew speed for at most 8 hours of each gap. With the numbers above he finds the Lantern (1M) on day 1 (session 2), the Hammer (25M) on day 3, and the bottom (100M) on day 6, owning about 11 helpers, 12 carts, 7 drills, 3 borers and 1 Great Machine. The milestones hold at 2 or 4 taps a second too. History: the first cut (1.15 growth, full away pay) emptied the mountain in 1.5 days; the next (1.6 growth, full away pay) needed slow tiers (carts 4/s); paying away time at 30% (#91) brought back punchy tiers. Any change to away pay, tiers or relic depths must keep this test green. A second run has the dad also buy Strong arms whenever it's the best stones-a-day per stone (taps count only during sessions); it hits the same days, so tap power rewards active play without breaking the pace.

### M3: Strategy (boosts vs long-term upgrades)

M2 gives the player one choice: which tier to buy next. M3 adds the real idle-game decision: **spend now for a short burst, or invest in something permanent**.

- **Quick boosts** (timed, bought with stones, one of each running at a time, shown with a countdown):
  - _Sharper picks_: taps yield ×2 for 10 minutes.
  - _Overtime_: crew output ×2 for 30 minutes.
  - Boosts run only while the game is open; they never multiply away earnings, so they reward active play without punishing rest.
  - _Built (#79)_: priced from what they boost, unboosted — Sharper picks costs 60 taps' worth (min 100), Overtime 3 minutes of the crew (min 500) — so they scale with progress and always pay for themselves (retuned from 60 s / 600 s of crew, which was break-even at best). `src/boosts.test.ts` proves a 10-minute session at one tap a second earns back ≥5× Sharper picks and ≥3× Overtime at four crew sizes. The sheet keeps simple copy and never shows expected gains. Saved as absolute end times (`mountain.boosts`), so a reload keeps the countdown; the clock keeps running while away, but away pay always uses the unboosted rate (`effectiveRates(mountain)` without `now`). Sharper picks doubles the whole tap yield including Strong arms; Strong arms takes its share of the unboosted crew. Bought in the Upgrades sheet ("Quick boosts"); running boosts show as countdown chips in the mountain's top-left corner (no layout cost). The pacing sim has a boost-buying dad (`buysBoosts`: starts both whenever affordable and idle, every second of play): Lantern 1.5, Hammer 3, bottom 5.0 — inside 5–7, the fastest case; the plain and upgrade dads stay at 5.5.
- **Permanent upgrades** (one-time purchases, Cookie Clicker style, unlocked by owning enough of a tier):
  - _Better boots_: helpers +10% speed (more levels later).
  - _Steady hands_: away earnings +25%.
  - _Built (#80)_: one-time buys in the Upgrades sheet under "Lasting upgrades". Better boots — 15,000 stones, unlocks at 10 helpers, helpers 1 → 1.1/s. Steady hands — 10,000,000 stones, shown from the first cart, away pay 30% → 37.5% (relative +25%; the Heart of Patience can stack on top later). Locked rows show their unlock ("Unlocks at 10 helpers"); bought ones read "Owned". Crew speed is floored to whole stones a second in `effectiveRates`, so the crew line is exactly what gets mined; tier cards and buy floats show the boosted per-unit speed (one decimal while under 10). The welcome-back card reads the live away rate.
  - Pacing: Steady hands is the strong one. Priced at 25,000 it pulled the upgrade-buying dad's bottom to day 5.0 (edge of the window); at 10M it's a mid-game buy and the sim stays Lantern day 1.5, Hammer day 3.5, bottom day 6 — for both the plain dad and the one buying Strong arms, boots and Steady hands (the sim weighs each by stones a day per stone).
- **Crew synergies** (permanent, make mixed crews pay): e.g. each helper adds +1% to cart speed.
  - _Built (#81)_: four one-time buys in "Lasting upgrades", each unlocked by owning enough of the tier it boosts. Every unit of the tier below adds +1% to it:

    | Synergy       | From → to              | Unlocks at | Cost       |
    | ------------- | ---------------------- | ---------- | ---------- |
    | Helping hands | helpers → carts        | 5 carts    | 500,000    |
    | Cart roads    | carts → drills         | 5 drills   | 3,000,000  |
    | Drill crews   | drills → borers        | 3 borers   | 15,000,000 |
    | Borer tracks  | borers → Great Machine | 1 machine  | 30,000,000 |

    Applied in `effectiveRates` (so live, away and the UI agree), stacking with Better boots. The sheet previews the bonus before buying ("Your 12 helpers would make carts 12% faster."). Tier cards show it in the rate line: "+11 ↑12% · 56/s", or just "↑ 1,870/s" on compact cards (the visual check failed "↑120%" there at 360px with the wide CI font). Pacing: Helping hands at 50,000 pulled the upgrade-buying dad's bottom to day 5.5; at 500,000 both dads stay at Lantern 1.5 / Hammer 3.5 / bottom 6.
- **Crew staffing** (Flemming's idea): machines need helpers to run them. A cart needs 1 helper, a drill 2, a borer 4 and the Great Machine 10. A machine without enough helpers sits idle, and the crew line and cards say so ("3 drills idle: need 6 more helpers"). This makes helpers matter all game, gives a real choice between more machines and more hands, and pairs with crew synergies and the Crown of Wisdom's kid helpers (kids count as staff). The staffing check lives in the same rate function, so away earnings respect it, and the pacing simulation must stay green once it's in.
  - _Built (#89)_: `staff` per tier in `src/tiers.ts` (cart 1, drill 2, borer 4, Great Machine 10). `effectiveRates` assigns helpers to the fastest machines first; a machine that can't be fully staffed sits idle (never half-runs). Staffing helpers still mine by hand too, so a helper is never wasted. Rates expose `running` per tier and `helpersShort`. Away pay, taps, veins and boosts all read the staffed speed. The Crown of Wisdom's kid helpers will add to the helper pool (not built yet).
  - UI: a short-staffed crew line reads "135/s · 2 idle, need 2 helpers" (warm orange); idle cards show "2 idle · 10/s" (just "2 idle" on compact cards) and say why in their label; buying a machine nobody can run floats "Needs helpers".
  - Retune: helpers became the bottleneck, so their cost growth dropped from ×2 to ×1.15 (the 50th helper costs ~21.7k, not 2e16). That made the crew cheaper overall, so the borer's first cost rose 1.6M → 2.5M. Pacing (plain dad / upgrade-buying dad): Lantern 1.5 / 1.5, Hammer 3 / 3, bottom 6.5 / 6. The sim weighs a machine together with the helpers it still needs, and a helper by the speed it adds (its own plus any idle machine it starts).
  - Existing saves: on load, a save without the `staffed` mark gets enough free helpers to run every machine it owns, then is marked `staffed: true` so it never repeats (`staffExisting` in `src/crew.ts`, applied in the progress store for guest and cloud loads before away pay). New mountains and Start over begin marked. The welcome card says "Your crew grew: N helpers joined to run your machines." (alone, or under the away report). firestore.rules allow only `staffed == true`.
- **Tap power scaling** (built, #82): _Strong arms_, 10 levels, first 5,000 stones then 5× each level. Each level adds 1% of the crew's speed to every tap (`1 + floor(crew/s × 1% × level)`), so tapping stays meaningful at thousands a second. The tap float shows the real yield. Bought from the Upgrades sheet: a small button beside the pocket (with a glow when something is affordable), opening a sheet so the main screen keeps its no-scroll budget.
- **Prestige: pass the mine to your kid** (design note, #83; built in M6 with the Mantle of the Hero). The ultimate long-term choice.
  - _When_: offered only after the Mantle (the bottom). Never forced; the finished mountain stays as it is until you choose.
  - _Resets_: the mountain (100M stones back), pocket, every tier including helpers and kids, upgrades, boosts, relics found (the shelf starts empty again), golden-vein timer.
  - _Kept_: a **Legacy** count (how many mountains handed down), the account/save itself, settings, and the staffing mark.
  - _Multiplier_: every Legacy makes the whole crew and every tap faster: `legacyBonus = 1 + 0.5 × legacies` (×1.5, ×2, ×2.5, …), applied in `effectiveRates` to crew speed and tap yield (not to away pay, which stays the patience lever). Simple, visible ("Legacy ×2: your kid's crew mines twice as fast"), and linear so it never runs away. The pacing sim gets a second-run target: a ×1.5 run should reach the bottom in roughly 4 days.
  - _Not Start over_: Start over (M2) throws everything away, including Legacy, and gives nothing. Prestige is the reward path; Start over stays tucked in the menu as the clean-slate escape hatch. Both share the same reset plumbing (fresh `startedAt` so stale cloud snapshots can't clobber the new run).
  - _Save_: `legacy: int >= 0` on the save (rules + emulator test), migrated as 0.
  - _Built (#130)_: `legacy` is saved only when > 0 (old saves read as none), capped at 1,000 in the parser and `firestore.rules`. `legacyBonus` multiplies every tier's speed (so cards show it) and the whole tap (its share of the crew is taken before the bonus); the away-pay share is untouched, but away time pays the faster crew. `passTheMine` (`src/legacy.ts`) works only at the bottom with the Mantle, and its new run always starts later than the old one. Pacing sim, upgrade-buying dad: first run bottom day 5.5; second run (×1.5) day 4.0; third (×2) day 3.5.
- **Boosts and time away** (decision, M6): boost timers are absolute end times, so they keep counting down while you're away, and they never pay anything away. Overtime is for play.
- All multipliers live in one pure function over the save (`effectiveRates` in `src/rates.ts`, built in #78), returning tap yield, per-tier speed, crew speed and away pay, so live ticks, away earnings and the UI agree. Boost timers use absolute end times in the save. Away earnings ignore boosts.
- UI: an "Upgrades" sheet behind one compact button. The main screen keeps its no-scroll budget (the browser check runs in CI).

### Later (sketch)

- **M2: Automation.** See above.
- **M4: Patience.** Every relic finally does what its card promises. See below.
- **M5: Maintenance.** See below. Before any new feature.
- **M6: Legacy.** Prestige (pass the mine to your kid), per the #83 note above.

### M5: Maintenance

Four milestones of features landed fast. Before Legacy, pay down the cost. Rules for every PR in this milestone:

- **Behavior-preserving.** No player-visible change unless it fixes a bug found here (then its own PR, with a test that failed first).
- **Tests first.** Before moving code, pin its behavior with characterization tests; the refactor PR must not touch those tests.
- **Coverage never drops** on the critical modules (`mountain`, `rates`, `persist`, `progress-store`, `tiers`, `crew`, `upgrades`, `boosts`, `relics`), measured by `npm run coverage` (added in the test audit) with thresholds in CI.
- Pacing sim, the browser layout check and the Firestore emulator rules tests all stay green. Small PRs, squash-merge on green only.

Issues, in order:

1. **Test audit.** (#114) Add v8 coverage with per-module thresholds; list gaps on the critical modules and fill them with behavior tests; fold redundant/overlapping tests (e.g. screen tests that only re-check rate math already covered in `rates`).
2. **Architecture review** (#115) (pstack how/architect). Module boundaries and import direction (the relics↔mountain↔rates init cycle we hit in #104), and `mountain-screen.ts` (~1,500 lines): split it into per-panel modules (tiers, upgrades sheet, shelf + relic cards, welcome/away, menu) behind the same `mountMountainScreen` API. One panel per PR, characterization tests first.
3. **Bug hunt** (#116) (pstack blast-radius) on save/sync/time math: clock skew and `lastSeen` in the future, background vs away, Start over vs late cloud snapshots, boost end times across reloads, rounding at the bottom of the mountain, the one-time migrations. Each bug found: failing test, then fix.
4. **Simplify / dead code.** (#117) knip strict plus a read for one-use helpers, stale constants and comments, unused CSS.
5. **pstack correct: guards for repeated mistakes.** (#118) Lint/test guards for what bit us twice: rules drift (save fields too, not only upgrade ids), constants exported but unused, prettier on docs, import cycles (`import/no-cycle` or madge in CI).

### M4: Patience (relic powers)

The relics are the spine of the game; by M4 each one changes how you play. All of it lives in `effectiveRates` (or the away accrual it feeds), so live, away and UI agree, and the pacing sim keeps Lantern day 1, Hammer days 2–3, bottom days 5–7.

| Relic                                 | Power (built in M4 unless noted)                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lantern of Guidance (1M)              | Built in M1: lights the way, golden veins 40% more often.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Shield of Protection (10M)            | Away cap 8 h → **24 h**: a whole day away still pays. (Uncapped would let a week away skip the game; 24 h covers sleep + a workday + a busy evening.)                                                                                                                                                                                                                                                                                                     |
| Hammer of the Builder (25M)           | Built in M2: unlocks the Great Machine.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Heart of Patience (45M)               | Built (#101): away pay grows the longer you're gone, from ×1 rising linearly to **×1.5 after 12 h** (`heartBonus` in `src/rates.ts`, over the paid time only; stacks with Steady hands). The welcome card names it ("The Heart of Patience made it ×1.25."). Planned ×2, but ×2 pulled the sim bottom to day 5.0; ×1.5 lands it at 5.5 for both sim dads with Hammer at day 3 and no other retune.                                                        |
| Crown of Wisdom (70M)                 | Built (#102): **Kid helper** tier (`kids` in the save; rules + emulator tests). 1M stones, then the helpers' ×1.15 curve; mines 1/s, counts as staff for machines, and each kid makes every helper and kid 2% faster. Shown (locked) once you own a Great Machine, buyable after the Crown. Kid sprite from PixelLab (`src/assets/kid-helper.png`). Pacing unchanged (bottom day 5.5).                                                                    |
| Mantle of the Hero (100M, the bottom) | Built (#103): closing the Mantle's reveal opens the **Legend finale** ("You became a Legend"): the full shelf of six, "100 million stones moved. Six relics found. A crew of N beside you.", a nod to passing the mine to your kid (M6). Shown once per run (it rides on the one-time Mantle reveal, so no save field). Days on the mountain were dropped: first-run saves carry no start time, and adding one would need a save field for a single line. |

Issues (milestone _M4: Patience_), one PR each, in order: Shield away cap (#104) → Heart away bonus (#101) → Crown kid helpers (#102) → Mantle finale (#103). Each must update the relic's `power` text to match exactly what it does, extend the pacing sim if the power touches it (the Heart and the kids do), and add rules + emulator tests for any save change (kids add a `kids` field).
