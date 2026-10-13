# Design: The Legendary Relics of Fatherhood

This is the north star for the game. Open GitHub issues stay the plan; this page says what the issues add up to. Keep it short and edit it when a decision changes.

## Vision

Deep inside a mountain of **100,000,000 stones** lie the six Legendary Relics of Fatherhood, left by the great dads of history. You start with your bare hands: one tap, one stone. The mountain is far too big to dig by hand, and that is the point. Scale makes automation necessary, the way it does in _Needle In A Haystack_ and _Cookie Clicker_. Each relic you uncover is a power spike and a virtue of fatherhood.

The tone lifts dads up. It honors them; it does not joke at their expense.

It stays a dad-friendly game (see `AGENTS.md`): two-minute sessions, gentle, never punishing, close is pause, silent until unmuted, phone and PC, one save.

## Core loop

1. **Tap the mountain.** Each tap mines one stone. Stones are the currency.
2. **Hire workers.** Spend stones on workers who mine for you every second. Each worker costs more than the last (escalating cost), so the next one is always just in reach.
3. **Leave.** Workers keep mining while you are away, at a resting pace (30% of their speed, up to 8 hours). Earnings are computed from timestamps on the next open; there is no live server.
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
| 5   | Crown of Wisdom       | Teach           | 70,000,000               | Kid workers: they mine, count as workers, and boost every other worker a little.                                                                                   |
| 6   | Mantle of the Hero    | Become the hero | 100,000,000 (the bottom) | Final relic. You become a Legend; unlocks prestige (pass the mine to your kid) later.                                                                              |

Relics are derived from stones mined (`src/relics.ts`), so the save has no relic field. A relic is celebrated once, in the session where it is uncovered (by tapping, workers, a vein, or away earnings).

M1 shipped the first relic only. The mountain was 1,000,000 stones then; it is now 100,000,000 (save v4). A v3 save's stones mined are scaled ×100, so a dad keeps his place and every relic he found. The Lantern sits at 1% (earlier than the old 2%) so it still lands in the first evening.

## Numbers and tuning

- All game numbers live in one module (`src/mountain.ts`) as named constants. Change a number there, not in the UI.
- Integers only in the save. Live and away mining use the same pure function: `accrue(state, from, to)` turns elapsed whole seconds into stones and returns the time it consumed, so fractions are never lost and offline and online math cannot drift apart.
- Worker cost: `ceil(base × 1.25^owned)` (the Cookie Clicker curve; M7 #140, was ×1.15). First worker: 20 stones, 1 stone per second. Kids use the same curve.
- Base away cap: 8 hours; the Shield lifts it to 24 hours (built, #104: `effectiveRates().awayCapMs`). Paying the sim dad's full 11h40 nights made the bottom day 5.0, so the borer's first cost rose 2.5M → 8M (bottom back to day 6 for both sim dads; Lantern 1.5, Hammer 3–3.5).
- Away pay rate: time away (app closed, or sitting in the background with no ticks for over 10 seconds) pays `AWAY_PAY_RATE` = **30%** of the crew's speed; live play pays in full. It is the main pacing lever. The Heart of Patience can raise it later (e.g. toward 60% after long absences), and so can M3's _Steady hands_.
- Big numbers: plain digits under 10,000, then one decimal with a word ("12.3 thousand", "1.2 million"). Tight cards and tending gains use the short form ("12.4K", "2M", "+35 stones/sec").
- **What the player sees (#166).** Decisions and purchases show real numbers: the price of a machine, a worker, an upgrade, a boost, and a promotion, the output of that purchase, and the stones a second an engineer adds by tending (staffed machines only, from `effectiveRates`). Discoveries stay without numbers up front: relic finds and hints, expedition outcomes and finds, hazards, and what comes next. No "?" placeholders.
- Pacing target for M1: first worker within a minute of tapping; first relic after roughly 1–2 evenings of short sessions.

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
- First worker with escalating cost, live mining
- Away earnings and the welcome-back screen
- Golden veins
- First relic: Lantern of Guidance
- Relic shelf
- UI reskin to the lantern-light look

### M2: Automation

Hand mining can't move a 100-million-stone mountain. Each tier is a visible jump in speed.

| Tier          | First cost (stones) | Stones a second each | Unlock                                             |
| ------------- | ------------------- | -------------------- | -------------------------------------------------- |
| Worker        | 20                  | 1                    | from the start                                     |
| Mine cart     | 100                 | 10                   | shown once you own a worker                        |
| Steam drill   | 14,000              | 60                   | shown once you own a cart                          |
| Tunnel borer  | 9,000,000           | 595                  | shown once you own a drill                         |
| Great Machine | 50,000,000          | 3,500                | needs the Hammer of the Builder (25,000,000 mined) |

- Carts, drills, and the Great Machine use `ceil(firstCost × 2^owned)`. Borers use `ceil(firstCost × 1.5^owned)` (#177) so a second and third stay buyable before the Great Machine. Workers grow by `1.25^owned` (M7 #140; ×1.15 since #89) because they staff the machines. Each tier is still a big jump in speed (about 6× or more). Untended, the Great Machine still needs 25 workers. An engineer tending it brings that down to 5, and its first cost is 50M so the pacing dad can buy one before the bottom (#144). These numbers come from the pacing simulation; see Pacing below.
- One table of tiers (`src/tiers.ts`) drives buying, the speed total and the UI. `accrue` sums every tier, so away earnings use the same math automatically.
- Layout: up to three tiers show as roomy two-column cards. From four on, the grid goes three to a row with short names (Worker, Cart, Drill, Borer, Machine), so all five tiers fit in two rows and the screen never scrolls, even at 360x560.
- Save: the mountain gets one whole-number field per tier (`carts`, `drills`, `borers`, `machines`). A missing field reads as 0, so older saves load unchanged. Firestore rules allow those fields.
- UI: a compact two-column grid of tier cards (art, name and count, cost) under one total line ("42 stones a second"). A tier not shown yet takes no space. All primary controls must stay visible at 360x560.
- Pacing target: the mountain takes **days** for a dad who plays two short sessions a day and lets the crew mine the rest (8-hour away cap). Lantern on day 1, Hammer around days 2–3, the bottom around days 5–7.
- **Pacing** (`src/pacing.ts`, pinned by `src/pacing.test.ts`): a deterministic dad plays two 10-minute sessions a day, 12 hours apart, taps 3 stones a second, always buys the most speed per stone, and is paid 30% of crew speed for at most 8 hours of each gap. With the M7 numbers he finds the Lantern (1M) on day 1.5 (session 2) and the Hammer (25M) on day 3.5. He pays 2,000,000 stones and one worker for Nils. The upgrade-buying dad and the boost-buying dad reach the bottom (100M) on day 5.0 and buy the Great Machine on day 4.5 (Ada tending it, so it runs on 5 workers), after about a day and a half with no other purchase. The plain dad buys that machine on day 5.0 and reaches the bottom on day 5.5. The first mountain takes at least 5 days. A second run (Legacy ×1.5, upgrades) buys the machine on day 3.5 and reaches the bottom on day 4. History: the first cut (×1.15 growth, full away pay) emptied the mountain in 1.5 days; the next (×1.6 growth, full away pay) needed slow tiers (carts 4/s); paying away time at 30% (#91) brought back punchy tiers; #140 steepened workers to ×1.25, raised machine staff, and moved the borer's first cost 8M → 10M so the bottom stayed on day 5. #144 keeps the untended Great Machine at 25 workers and, while an engineer tends it, at 5; its first cost moves 80M → 50M so the dad can buy it on day 4.5 with stones still in the mountain. #148 seats Nils beside Ada when the first borer arrives. #163 makes the sim pay his promotion (2,000,000 stones and one worker), the same price as the sheet. The plain dad's bottom is day 5.5 and a second run is day 4.5. Upgrade and boost dads stay on day 5.0. The first mountain still takes at least 5 days. #177 (borer 595/s, first price 9M, growth ×1.5, drill 14k, early upgrades and Sharper picks repriced so the borer is a live buy): plain and upgrade dads finish on day 5, the boost dad on day 4.5, Nils is paid the sitting after the borer, and a second run stays on day 4. Ada keeps tending. Nils walks the old shaft every session and, once a journeyman, the deep dark each night. The finds apply. Any change to away pay, tiers or relic depths must keep this test green. A second run has the dad also buy Strong arms whenever it's the best stones-a-day per stone (taps count only during sessions); tap power rewards active play without breaking the pace.

### M3: Strategy (boosts vs long-term upgrades)

M2 gives the player one choice: which tier to buy next. M3 adds the real idle-game decision: **spend now for a short burst, or invest in something permanent**.

- **Quick boosts** (timed, bought with stones, one of each running at a time, shown with a countdown):
  - _Sharper picks_: taps yield ×2 for 10 minutes.
  - _Overtime_: crew output ×2 for 30 minutes.
  - Boosts run only while the game is open; they never multiply away earnings, so they reward active play without punishing rest.
  - _Built (#79)_: priced from what they boost, unboosted — Sharper picks costs 120 taps' worth (min 100), Overtime 3 minutes of the crew (min 500) — so they scale with progress and always pay for themselves (retuned from 60 s / 600 s of crew, which was break-even at best). `src/boosts.test.ts` proves a 10-minute session at one tap a second earns back ≥5× Sharper picks and ≥3× Overtime at four crew sizes. The sheet shows the price and the output in stones ("8 a tap", "800/s") along with the × (#166). Saved as absolute end times (`mountain.boosts`), so a reload keeps the countdown; the clock keeps running while away, but away pay always uses the unboosted rate (`effectiveRates(mountain)` without `now`). Sharper picks doubles the whole tap yield including Strong arms; Strong arms takes its share of the unboosted crew. Bought in the Upgrades sheet ("Quick boosts"); running boosts show as countdown chips in the mountain's top-left corner (no layout cost). The pacing sim has a boost-buying dad (`buysBoosts`: starts both whenever affordable and idle, every second of play): Lantern 1.5, Hammer 3, bottom 5.0 — inside 5–7, the fastest case; the plain and upgrade dads also finish on day 5.0 (M7 #140; they were on 5.5 before the staffing retune).
- **Permanent upgrades** (one-time purchases, Cookie Clicker style, unlocked by owning enough of a tier):
  - _Better boots_: workers +10% speed (more levels later).
  - _Steady hands_: away earnings +25%.
  - _Built (#80)_: one-time buys in the Upgrades sheet under "Lasting upgrades". Better boots — 90,000 stones (#177, was 15,000), unlocks at 10 workers, workers 1 → 1.1/s. Steady hands — 10,000,000 stones, shown from the first cart, away pay 30% → 37.5% (relative +25%; the Heart of Patience can stack on top later). Locked rows show their unlock ("Unlocks at 10 workers"); bought ones read "Owned". Crew speed is floored to whole stones a second in `effectiveRates`, so the crew line is exactly what gets mined; tier cards and buy floats show the boosted per-unit speed (one decimal while under 10). The welcome-back card reads the live away rate.
  - Pacing: Steady hands is the strong one. Priced at 25,000 it pulled the upgrade-buying dad's bottom to day 5.0 (edge of the window); at 10M it's a mid-game buy and the sim stays Lantern day 1.5, Hammer day 3.5, bottom day 6 — for both the plain dad and the one buying Strong arms, boots and Steady hands (the sim weighs each by stones a day per stone).
- **Crew synergies** (permanent, make mixed crews pay): e.g. each worker adds +1% to cart speed.
  - _Built (#81)_: four one-time buys in "Lasting upgrades", each unlocked by owning enough of the tier it boosts. Every unit of the tier below adds +1% to it:

    | Synergy       | From → to              | Unlocks at | Cost       |
    | ------------- | ---------------------- | ---------- | ---------- |
    | Helping hands | workers → carts        | 5 carts    | 2,000,000  |
    | Cart roads    | carts → drills         | 5 drills   | 3,000,000  |
    | Drill crews   | drills → borers        | 3 borers   | 15,000,000 |
    | Borer tracks  | borers → Great Machine | 1 machine  | 30,000,000 |

    Applied in `effectiveRates` (so live, away and the UI agree), stacking with Better boots. The sheet previews the bonus before buying ("Your 12 workers would make carts 12% faster."). Tier cards show it in the rate line: "+11 ↑12% · 56/s", or just "↑ 1,870/s" on compact cards (the visual check failed "↑120%" there at 360px with the wide CI font). Pacing: Helping hands at 50,000 pulled the upgrade-buying dad's bottom to day 5.5; at 500,000 both dads stay at Lantern 1.5 / Hammer 3.5 / bottom 6.
- **Crew staffing** (Flemming's idea): machines need workers to run them. A cart needs 1 worker, a drill 3, a borer 8 and the Great Machine 25 (M7 #140; #89 was 1/2/4/10). An engineer tending the Great Machine brings that crew down to 5 (#144). A machine without enough workers sits idle, and the crew line and cards say so ("3 drills idle: need 6 more workers"). This makes workers matter all game, gives a real choice between more machines and more hands, and pairs with crew synergies and the Crown of Wisdom's kid workers (kids count as workers). The staffing check lives in the same rate function, so away earnings respect it, and the pacing simulation must stay green once it's in.
  - _Built (#89)_: `staff` per tier in `src/tiers.ts` (cart 1, drill 2, borer 4, Great Machine 10). `effectiveRates` assigns workers to the fastest machines first; a machine that can't be fully staffed sits idle (never half-runs). Staffing workers still mine by hand too, so a worker is never wasted. Rates expose `running` per tier and `helpersShort` (the save still counts `helpers`). Away pay, taps, veins and boosts all read the staffed speed. The Crown of Wisdom's kid workers will add to the worker pool (not built yet).
  - UI: a short-staffed crew line reads "135/s · 2 idle, need 2 workers" (warm orange); idle cards show "2 idle · 10/s" (just "2 idle" on compact cards) and say why in their label. When the next machine would sit idle, its card shows the output and the block ("+595/s · needs workers") and the label still says "Needs more workers to run". The buy float says the same output.
  - Retune: workers became the bottleneck, so their cost growth dropped from ×2 to ×1.15 (the 50th worker costs ~21.7k, not 2e16). That made the crew cheaper overall, so the borer's first cost rose 1.6M → 2.5M. Pacing (plain dad / upgrade-buying dad): Lantern 1.5 / 1.5, Hammer 3 / 3, bottom 6.5 / 6. The sim weighs a machine together with the workers it still needs, and a worker by the speed it adds (its own plus any idle machine it starts).
  - Existing saves (#89): on load, a save without the `staffed` mark got enough free workers to run every machine it owned, then was marked `staffed: true` so it never repeated. M7 (#140) runs one more top-up: `staffExisting` grants whatever free workers the new staff numbers still need, then marks `staffed: 2`. `true` and `1` are the first grant and get the top-up; a save already at 2 is untouched. Kids already on the crew count. New mountains and Start over begin at 2. The welcome card still says "Your crew grew: N workers joined to run your machines." (alone, or under the away report). firestore.rules accept `staffed` true, 1, or 2, so an old client can still write `true`.
- **Tap power scaling** (built, #82): _Strong arms_, 10 levels, first 40,000 stones then 5× each level (#177, was 5,000). Each level adds 1% of the crew's speed to every tap (`1 + floor(crew/s × 1% × level)`), so tapping stays meaningful at thousands a second. The tap float shows the real yield. Bought from the Upgrades sheet: a small button beside the pocket (with a glow when something is affordable), opening a sheet so the main screen keeps its no-scroll budget.
- **Prestige: pass the mine to your kid** (design note, #83; built in M6 with the Mantle of the Hero). The ultimate long-term choice.
  - _When_: offered only after the Mantle (the bottom). Never forced; the finished mountain stays as it is until you choose.
  - _Resets_: the mountain (100M stones back), pocket, every tier including workers and kids, upgrades, boosts, relics found (the shelf starts empty again), golden-vein timer.
  - _Kept_: a **Legacy** count (how many mountains handed down), the account/save itself, settings, and the staffing mark.
  - _Multiplier_: every Legacy makes the whole crew and every tap faster: `legacyBonus = 1 + 0.5 × legacies` (×1.5, ×2, ×2.5, …), applied in `effectiveRates` to crew speed and tap yield (not to away pay, which stays the patience lever). Simple, visible ("Legacy ×2: your kid's crew mines twice as fast"), and linear so it never runs away. The pacing sim gets a second-run target: a ×1.5 run should reach the bottom in roughly 4 days.
  - _Not Start over_: Start over (M2) throws everything away, including Legacy, and gives nothing. Prestige is the reward path; Start over stays tucked in the menu as the clean-slate escape hatch. Both share the same reset plumbing (fresh `startedAt` so stale cloud snapshots can't clobber the new run).
  - _Save_: `legacy: int >= 0` on the save (rules + emulator test), migrated as 0.
  - _Built (#130)_: `legacy` is saved only when > 0 (old saves read as none), capped at 1,000 in the parser and `firestore.rules`. `legacyBonus` multiplies every tier's speed (so cards show it) and the whole tap (its share of the crew is taken before the bonus); the away-pay share is untouched, but away time pays the faster crew. `passTheMine` (`src/legacy.ts`) works only at the bottom with the Mantle, and its new run always starts later than the old one. Pacing sim, upgrade-buying dad, after M7 (#140): first run bottom day 5.0; second run (×1.5) day 4.0. Paying for Nils (#163) leaves that first run on day 5.0 and moves the second run to day 4.5. The catalogue's exact valuation (#171) moves that second run to day 4. At #130 the first run was day 5.5 and a third run (×2) was day 3.5.
  - _Built (#131)_: offered on the Legend card ("Stand proud" / "Pass to your kid", side by side so the finale fits a 360×560 phone) and as "Pass the mine to your kid" in the menu, only while the finished mountain waits. A gold confirm (not Start over's red): "Your kid starts a fresh mountain with your Legacy: the whole crew and every tap ×1.5, for good…", with "Not yet" / "Pass it on". The new run greets: "Your kid's mine: six relics wait inside, and your Legacy makes it ×1.5." A small "×1.5" badge sits beside the stones left (layout-checked to stay on one row). Saved at once, locally and to the cloud; the new run starts later, so a late snapshot of the finished one can't return.
- **Boosts and time away** (decision, M6): boost timers are absolute end times, so they keep counting down while you're away, and they never pay anything away. Overtime is for play.
- All multipliers live in one pure function over the save (`effectiveRates` in `src/rates.ts`, built in #78), returning tap yield, per-tier speed, crew speed and away pay, so live ticks, away earnings and the UI agree. Boost timers use absolute end times in the save. Away earnings ignore boosts.
- UI: an "Upgrades" sheet behind one compact button. The main screen keeps its no-scroll budget (the browser check runs in CI).

### Later (sketch)

- **M2: Automation.** See above.
- **M4: Patience.** Every relic finally does what its card promises. See below.
- **M5: Maintenance.** See below. Before any new feature.
- **M6: Legacy.** Prestige (pass the mine to your kid), per the #83 note above.
- **M8: Strategy lab.** Decision quality, offline. See Milestone 8 below. M8 is planned.

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
| Crown of Wisdom (70M)                 | Built (#102): **Kid worker** tier (`kids` in the save; rules + emulator tests). 1M stones, then the workers' ×1.25 curve; mines 1/s, counts as workers, and each kid makes every worker and kid 2% faster. Shown (locked) once you own a Great Machine, buyable after the Crown. Kid sprite from PixelLab (`src/assets/kid-helper.png`). Pacing follows the M7 retune (bottom day 5.0).                                                                   |
| Mantle of the Hero (100M, the bottom) | Built (#103): closing the Mantle's reveal opens the **Legend finale** ("You became a Legend"): the full shelf of six, "100 million stones moved. Six relics found. A crew of N beside you.", a nod to passing the mine to your kid (M6). Shown once per run (it rides on the one-time Mantle reveal, so no save field). Days on the mountain were dropped: first-run saves carry no start time, and adding one would need a save field for a single line. |

Issues (milestone _M4: Patience_), one PR each, in order: Shield away cap (#104) → Heart away bonus (#101) → Crown kid helpers (#102) → Mantle finale (#103). Each must update the relic's `power` text to match exactly what it does, extend the pacing sim if the power touches it (the Heart and the kids do), and add rules + emulator tests for any save change (kids add a `kids` field).

### M7: Into the Deep (workers, engineers, expeditions, hazards, the field log)

**Problem (play-test, Flemming).** From the first borer on, taps are a rounding error and the only decision is "buy the next thing", and that thing is far off. The pacing sim shows the hole: today the upgrade-buying dad buys his first borer on day 2.5 and then **buys nothing until the Great Machine on day 5**. Helpers never constrain him either: he keeps 15–31 spare the whole run (Flemming: 63 owned, 38 needed).

M7 makes staffing a real call all run, gives the hands a job in the middle game (send **engineers** into side tunnels, fix **trouble at the machines**), and adds a **field log** so Flemming and Grok Bot can read a player's real numbers without screenshots.

#### 1. Helpers become workers (player-facing text only)

Every player-facing "helper" becomes **"worker"** (cards, crew line, floats, welcome card, upgrade copy: "Helping hands" stays as a name, its text says workers). **Save fields stay**: `helpers` in the save, `TierId "helper"` and `firestore.rules` are unchanged. Renaming the field would need a parser migration, a rules change accepting both names, and old cached PWAs writing the old name back, all for a word nobody sees. Internal identifiers may be renamed later in a pure refactor; the save never.

#### 2. Staffing as a real choice all run

Analysis: the pacing sim (upgrade-buying dad) logs every machine purchase with the workers he must still hire to run it ("short"), what they cost, and the machine's price.

**Today (worker ×1.15; staff cart 1 / drill 2 / borer 4 / machine 10):**

| Day | Buys          | Machine price | Spare workers | Workers to hire | Their cost | Share of machine price |
| --- | ------------- | ------------- | ------------- | --------------- | ---------- | ---------------------- |
| 1.0 | 1st drill     | 20k           | 15            | 0               | 0          | 0%                     |
| 2.0 | 7th drill     | 1.28M         | 31            | 0               | 0          | 0%                     |
| 2.5 | 1st borer     | 8M            | 31            | 0               | 0          | 0%                     |
| 5.0 | Great Machine | 80M           | 29            | 0               | 0          | 0%                     |

Workers are never the constraint, and nothing is bought between day 2.5 and day 5.

**Options tried** (bottom day for plain / upgrades / boosts / 2nd run; target 5–7, 2nd run ~4):

| Option                                                        | Staffing pressure                                                                         | Bottom                                                  | Verdict                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| ×1.30 growth, same staff (previous draft)                     | spare 3–7 all run, never short; worker cost 0% of any machine                             | 5.5 / 5.0 / 5.5 / 4.0                                   | Hoarding just stops; still no choice.            |
| ×1.15, heavier staff 1/3/8/25                                 | short only at the Great Machine (7 workers, 1% of its price)                              | 5.5 / 5.5 / 5.0 / 4.0                                   | Cheap workers swallow any staff number.          |
| ×1.20, staff 1/3/8/25                                         | Great Machine short 21 workers = 25% of its price; borer free                             | 5.5 / 5.5 / 5.0 / 4.0                                   | Bites only once, at the very end.                |
| ×1.25, staff 1/3/8/25, borer 8M                               | from day 2.5 every machine needs hires (7%→57%)                                           | 5.0 / 5.0 / **4.5** / 3.5                               | Right feel, too fast.                            |
| **×1.25, staff 1/3/8/25, borer first cost 8M → 10M (chosen)** | see below                                                                                 | **5.0 / 5.0 / 5.0 / 4.0**, Hammer 3.5 / 3.5 / 3.5 / 3.0 | **All 10 pacing tests green**; dead zone filled. |
| Worker price tied to crew speed                               | not simulated: hides the curve, makes buying a machine raise worker prices (feels unfair) | n/a                                                     | Rejected.                                        |

**Chosen, the same run (upgrade-buying dad):**

| Day | Buys      | Machine price | Spare workers | Workers to hire | Their cost | Share of machine price |
| --- | --------- | ------------- | ------------- | --------------- | ---------- | ---------------------- |
| 1.5 | 6th drill | 640k          | 4             | 0               | 0          | 0%                     |
| 2.0 | 7th drill | 1.28M         | 5             | 0               | 0          | 0%                     |
| 3.0 | 1st borer | 10M           | 4             | 4               | 444k       | 4%                     |
| 3.0 | 13th cart | 410k          | 0             | 1               | 188k       | 46%                    |
| 3.5 | 8th drill | 2.56M         | 0             | 3               | 896k       | 35%                    |
| 4.0 | 2nd borer | 20M           | 0             | 8               | 9.1M       | 46%                    |
| 4.5 | 9th drill | 5.12M         | 0             | 3               | 10.4M      | 204%                   |
| 4.5 | 14th cart | 819k          | 0             | 1               | 5.3M       | 650%                   |

So the early game is unchanged (workers cheap, a few spare), and from the borer on **every machine comes with a worker bill** that grows from a small extra to more than the machine itself. Late on, a cheap cart is no longer cheap, and "one more borer or the crew for two drills" is a real question. The sim dad now buys something every half day through the middle (days 3, 3.5, 4, 4.5) instead of nothing for 2.5 days. The bottom moves from day 5.5 to 5.0, the edge of the window. The card for a machine that would sit idle shows its output and "needs workers" before the tap, and the buy float says the same. The label still says "Needs more workers to run".

**Great Machine staff (play-check, #140).** Staff 25: the upgrade-buying dad hits the bottom on day 5.0 with 2 borers and no Great Machine (57 workers, 14 carts, 9 drills). Plain and boost dads match that day and also never run one. Staff 15 was tried: he still never staffs a Great Machine, the dead zone comes back (about 2.5 days with no purchase), the bottom moves to day 5.5, and the second run to day 4.5. Staff 25 keeps every pacing window and a purchase at least every day from the first borer, so 25 stays.

**Existing saves:** counts are kept. The old `staffExisting` is not a second full recount of the #89 numbers. One more one-time grant (`staffed: 2`) tops up workers so every machine owned at load still runs under the new staff, the same pattern as #89, with the welcome note "Your crew grew". A save already at 2 is untouched, including one that later buys a machine it cannot run. `true` and `1` mean the first grant and receive the top-up. Kids already hired count toward the crew. Example: 12 carts, 7 drills and 1 borer needed 30 workers at 1/2/4 and need 41 at 1/3/8, so a dad who had exactly 30 gets 11 more. Rules accept `staffed` true, 1, or 2.

#### 3. Engineers

Veterans return as **engineers**: a few named, experienced hands (never more than five), not a second currency.

- **Getting them.**
  - Your first engineer arrives with the first borer: "Your best worker steps up as engineer." She is **Ada**, posted on the borers, and she does not leave the worker count, so a machine that was running keeps running. An older save that already owns a borer gets her once, on the welcome card. Built (#144). The engineers sheet chooses her post (#145). A later purchase does not move her. The pacing dad still does, through `tendBestTier`: borers, then the Great Machine.
  - **Promote a worker**: a worker leaves the staffing pool and becomes an engineer, for a stones price that doubles each time. The price is 1,000,000 × 2^(engineers already in the crew): 1,000,000 with none, so 2,000,000 once Ada is here, then 4,000,000, 8,000,000 and 16,000,000. The new engineer waits at camp. Promoting is itself a staffing call: one fewer worker. Built as a pure action (#144). The sheet explains it ("A new engineer can tend another machine or explore while the others work."). The button shows the price ("Promote a worker: 2M stones"). It confirms: "Nils steps up as engineer. One worker fewer at the machines." If he cannot pay, the grey reason is "Needs 2M stones". No free worker, or a full crew, still says why in words (#161, price #166). The pacing sim pays that same price (#163). A cheaper Nils (24,000) kept the old days, and made promotion trivial next to a 10M borer, so the 2,000,000 price stays.
  - The deep dark sometimes brings one home: "Your party found a lost engineer, who joined your crew."
- **Names**, a closed list, one each: Ada, Nils, Ruth, Otto, Mae. Never more than five.
- **Ranks**, not numbers: _Apprentice_ → _Journeyman_ → _Master engineer_, shown as one, two or three small lamps on the engineer's badge. An engineer rises a rank after enough expeditions (3, then 6 more); the UI says "nearly a Journeyman" (or "nearly a Master") when one expedition away, and never a trip count. Built (#145).
- **Sheet (#145, redesigned #161).** A compact Engineers button sits in the pocket row from the first engineer: the worker portrait with a small lamp, because the word itself does not fit beside a long pocket. The sheet is one open card (portrait, name, rank lamps and the rank word, one sentence) and, once the crew grows, one-line rows for the rest. Two buttons open the choices: Tend a machine, and Send exploring. Each choice has one line about what it does. Carts get a cave-in, drills a flood, borers and the Great Machine a jam; the Great Machine also runs with far fewer workers. The sentence names the live gain from staffed machines ("Ada is tending the borers: +35 stones/sec"). Each tend choice and the cheer show that same gain ("Ada heads to the drills! +6 stones/sec"), and the tended card wears the lamp with the gain beside it. The number follows buys and staffing. A tap cheers, the card glows. An engineer out exploring walks into a tunnel, with a words-only countdown. Call her back asks first; she comes home empty-handed. Choosing a post while they are away still calls the party back first. Keepsakes the crew has brought home sit on the open card at reading size ("Brought home"), not only in the tiny relic-detail line. On a full crew and a short phone that row stays one line, and a tap tells the stories. Five engineers fit at 360×560 with no scroll. No new art.
- **Uses (each engineer does one thing at a time):**
  1. **Lead an expedition**: one engineer per expedition; the deep dark needs a Journeyman or better.
  2. **Tend a machine type**: stationed at carts, drills, borers or the Great Machine, that tier runs a little faster (Apprentice +10%, Journeyman +20%, Master +30%; live and away). Two at the same tier do not stack; the higher rank sets the pace. Away on an expedition, or waiting at camp, the bonus stops. Tending the Great Machine also replaces most of its crew: **5 workers instead of 25** (any rank; the speed bonus is separate). Untended, it still needs 25. Built in `effectiveRates` (#144).
  3. **Fix trouble**: an engineer tending a tier fixes its hazards alone after a short while; a Master fixes them at once.
- **The tradeoff:** expeditions **no longer take workers**. They take an engineer away from tending a machine, so you choose between a steady machine bonus and finds from the tunnels. Workers stay purely the staffing resource above.
- **Pacing (#144, #163).** The sim dad pays the real promotion for Nils (2,000,000 stones and one worker) the second the first borer arrives. Ada tends the borers until he owns a Great Machine, then she tends that. Its first cost is **50M** (was 80M). At 80M every saving dad still reaches the last session a few million short (about 70M, 73M and 76M) and the away pay both crosses the price and empties the mountain, so he never gets to buy. 50M is the highest price where, before he paid for Nils, the plain, upgrade, and boost dads all bought one on day 4.5 and reached the bottom on day 5.0 (Lantern 1.5, Hammer 3.5), with about a day and a half from the first borer and nothing else bought, and a second run bought it on day 3.5 and finished on day 4.0. Paying 2,000,000 (#163) moves the plain dad's machine to day 5.0 and his bottom to day 5.5 (about two days from the first borer). Upgrade and boost dads still buy it on day 4.5 and finish on day 5.0. A second run bought it on day 4.0 and finished on day 4.5 under the rounded scores. Exact valuation (#171) buys it on day 3.5 and finishes on day 4. The first mountain takes at least 5 days. Staff 3 through 15 all landed on the unpaid days; **5** is the crew she replaces it down to. Above about 21 workers the machine stops being his best buy, he never saves for it, and he finishes with none.

#### 4. Expeditions ("Side tunnels")

- **Unlock:** with the first engineer (first borer). The Engineers sheet offers three tunnels, in words ("a quick look down a side seam", "about an hour in the old shaft", "a long night in the deep dark"). The deep dark waits for a Journeyman. No main-screen layout cost. Built (#147).
- **Three tunnels, one expedition per engineer:**

  | Tunnel        | Away for | Leader       | Finds                                   |
  | ------------- | -------- | ------------ | --------------------------------------- |
  | A side seam   | 10 min   | any engineer | one small find                          |
  | The old shaft | 1 h      | any engineer | one find, better odds of a lost tool    |
  | The deep dark | 4 h      | Journeyman+  | a rare find; may bring home an engineer |

- **Away and back:** an expedition stores an absolute return time, so it **completes while the app is closed**. The tending bonus is missing until it returns (away accrual splits at the return time). The welcome card says "Ada came back from the old shaft with …", naming the find in words (no numbers), and lists every engineer who came home. The same card appears in the session if they return while you play, including while the engineers sheet is open and when the phone was locked: it sits above the other sheets, and a return saved while the app was hidden is still announced on the next open. One tap dismisses it. A running trip is a small chip in the mountain's corner ("Ada will be gone about an hour."), with no layout cost. Recall anytime, after a soft confirm: back empty-handed, no penalty. Choosing a post while they are away recalls them first. What the expedition finds is fixed when it leaves (seed = `sentAt`), so reloading can't reroll it. Built (#147).
- **Finds (never stones):**
  - _Relic glimmers_: an evocative line about the next relic ("Down there, something beat like a heart." for the Heart). No depths, no numbers.
  - _Lost tools_: one-time lasting upgrades only found below. Each is found once. The Upgrades sheet lists it as "Found" with one warm line, and does not show the ones still below. Built (#148):
    - _Grandfather's pick_: taps are five fourths as strong, rounded up, in `effectiveRates`, before Sharper picks doubles them.
    - _Old miner's lamp_: a golden vein glints twice as long (`veins`).
    - _Worn map_: every expedition sent after it is found takes three quarters of the tunnel's time. A party already out keeps its clock.
    - _Steel-toe boots_: trouble waits twice as long. Hazards reads `wearsSteelToes`.
  - _Keepsakes_: a small collection on the relic shelf's detail sheet (a child's drawing, a pocket watch, a carved whistle …), just for the heart, Needle-in-a-Haystack style. Found ones only, one story each. The gold nugget stands in for art until PixelLab is asked. Built (#148).
- **Pacing:** the sim dad keeps Ada tending and sends Nils on the old shaft each session and the deep dark each night. He pays the same promotion a player would (2,000,000 stones and one worker, #163). Days: Lantern 1.5, Hammer 3.5, plain dad bottom 5.5, upgrade and boost dads bottom 5.0, second run 4. The first mountain takes at least 5 days.
- **Copy:** discoveries stay without numbers and without "?" placeholders: "Ada came back from the old shaft with Grandfather's pick.", "Ada will be gone about an hour." Tending gains and the promotion price are decisions, so they show numbers (#166).
- **Built (#146), domain and save.** Sending stores the find (seeded from `sentAt`) and the post they left, then moves them into the tunnel. Coming home restores that post, adds a trip, and keeps the find: a glimmer line for the next relic, a lost tool, a keepsake, or sometimes an engineer from the deep dark (never a sixth). Away pay splits at each return, so the machine they left speeds up again from that moment. A `sentAt` still in the future shifts to now; the wait and the find stay. Recall comes back empty-handed. The side-tunnels sheet and the welcome-card line are later issues. Lost-tool effects and the pacing sends are #148; the day windows are unchanged.

#### 5. Hazards ("Trouble at the machines")

- **Only while you play.** Never while away, never saved; closing the game clears any trouble. Leaving the game is rest, not risk.
- From the first borer, roughly every 3–6 minutes of live play, one machine tier gets trouble: a **cave-in** (carts), a **flood** (drills), a **jam** (borers, Great Machine). The card shows it, and that tier slows by a quarter at first, easing toward half over two minutes.
- **Fix it with your hands:** five taps on the card or a short hold, then a small thank-you burst and "Fixed! The crew cheers." An engineer tending that tier fixes it for you (see above). At most one trouble at a time. Steel-toe boots double the gap between troubles (`wearsSteelToes`, #148).
- Applied in `effectiveRates` through a session-only `trouble` argument, so the crew line and cards agree. The sim dad fixes within 3 s; a never-fixing dad must land within a day of the target.

#### 6. The field log (telemetry for Flemming and Grok Bot)

- **"Copy field log"** in the menu copies a JSON snapshot (works for guests): app version, time, stones mined/left, pocket, crew counts, engineers with rank and post, crew speed, tap yield, idle machines, relics, upgrades, boosts with end times, running expeditions with return times, legacy, and the last 50 events.
- **Events** (pure ring, last 200, kept by the progress store, each timestamped): purchases (what and new count), promotions, an engineer stationed or called back to camp, relic found, vein tapped, expedition sent, returned (with the find id), or recalled, trouble started and fixed by hand or by an engineer, the one-time staffing top-up, away report, Start over / pass the mine, save errors.
- **Cloud copy for signed-in players:** one document `fieldLogs/{uid}`, overwritten at most every 5 minutes and on hide (≲ 300 writes per playing day, < 50 KB). Rules: owner-only read/write, shape and size checked, no delete. No personal data beyond the uid.
- **Reading it:** `npm run field-log` (Admin SDK script in `tools/`, outside `src`). `npm run field-log -- <uid>` or `--uid <uid>` reads one player; with no uid it lists every `fieldLogs` document. The default print is a short summary with local times; `--json` prints the stored documents. Sign in once with `gcloud auth application-default login`, or set `GOOGLE_APPLICATION_CREDENTIALS`. No key files in the repo. The Firestore emulator needs no credentials. Only household players are read; the doc holds only the latest ring. Start over and passing the mine clear the ring and overwrite the doc at once.

The copy menu and the session ring shipped in #141, the cloud document in #142, and the reader in #143. The snapshot is the mountain as it exists today (stones, crew, speed, taps, idle machines, relics, upgrades, running boosts, legacy, engineers, running expeditions). The ring is not a mountain save field, so old saves load unchanged. Trouble is session-only, so it is events (`trouble.start`, `trouble.fix`) and not a snapshot field. Built (#150).

#### Built (#150)

M7 is built. Final pacing, with the sim paying 2,000,000 stones and one worker for Nils: Lantern day 1.5, Hammer day 3.5, plain dad bottom day 5.5, upgrade and boost dads bottom day 5.0, second run day 4. The first mountain takes at least 5 days. The field log snapshot names each engineer (name, rank, post) and each party still out (who, which tunnel, when they return). The ring records a promotion, a station or a call back to camp, an expedition sent, returned with its find, or recalled, trouble started and fixed by hand or by an engineer, and the staffing top-up.

#### Issues

One PR each, in order; the list with acceptance criteria is in the M7 PR description (#138).

### Milestone 8: Strategy lab

**M8 is in progress.** The shared clock is `src/lab/world.ts` (#171). Targets and decision measures are in (#173). Player types are one file each under `src/lab/policies/`, loaded by the same registry (#172). The tournament and `npm run lab` are in (#174). No screen, no save field, no Firestore change. The lab runs offline, next to the pacing sim, so a retune can be judged before it ships. Players never see payback, shares, or these targets.

#### Why

Flemming's goal is a real decision at every moment: several options of comparable value, no dead stretch, and no dominant strategy, even for a dad who plays an extreme. Finish days come second. A casual dad still finishes in 5–7 days, and never under 5.

#177 closed the payback dead stretch (about a day from day 4) to under half a day for a casual dad and for the optimizer. The value-per-stone stretch is still reported beside it. The retune moved the economy. It did not move these targets to go green.

#### Definitions

- **Payback period (Cookie Monster).** How long until a move pays for itself. `valueOf` in `src/economy/actions.ts` returns `paybackSec` with the Cookie Monster formula `max(cost − pocket, 0) / income + cost / Δincome`: time to afford what is still missing, plus time for the extra income to earn the cost back. Income and the gain both come from `effectiveRates` before and after the move. A machine's staffing cost is part of that cost. The horizon is an argument, not a constant in the economy module.
- **Live option.** A move whose payback is at most `LIVE_RATIO` times the best payback on the table. `LIVE_RATIO = 1.5`. Two or more live options is a real decision. One is a moment with nothing to choose.
- **Dead stretch.** A sample is dead when the only live options on the spends this dad weighs need at least one session of saving (`minWaitSec` in `src/lab/targets.ts`): none of them can be paid for, and the best one's wait is at least that long. Free posts and refused buys are not on that table. A zero price pays back at once, and a cheap upgrade the plain dad never buys was keeping the stretch at zero. A few minutes of saving at the end of a sitting does not turn the overnight gap into a dead stretch. The lab scores the longest such run. The length is wall-clock hours from the first dead sample to the next sample that is not dead, or to the last sample if the run ends waiting. On the casual run after #177 the payback stretch is under half a day. The value-per-stone stretch is still about 2 days and is reported beside it.
- **singleShare.** The share of samples with at most one live option (payback within `LIVE_RATIO` of the best). A run where every sample is in that set is `1`. The same share by value-per-stone, on the plain dad's crew table, is about 42% on today's casual run, which the lab must reproduce within rounding. Payback is reported beside it.
- **dominantShare.** The share of samples where the most common move is the best one, leaving out the first hour.
- **Regret.** `finishDay(policy) / finishDay(optimizer)`, a tournament number. The optimizer is 1. A later finish is higher.

#### Targets

This page names them. `src/lab/targets.ts` is the source of truth, and the only place a lab number lives. No other magic numbers in `src/lab/`.

Approved:

- `LIVE_RATIO = 1.5`. A live option pays back within 1.5× of the best.
- Longest dead stretch at most 0.5 day, for casual and for the optimizer.
- `tap-only` and `five-min-a-day` finish within about 14 days.

The same file holds the horizon `H` (default 6 hours, passed into `valueOf`), the sample interval (one minute of play, plus the start of each session), the dead-stretch definition, and one typed entry per guardrail: `{ id, measure, scope, op, value, why }`. Each entry has a one-line `why`. `measure` is a registered measure id. `scope` says which runs the bound covers. `op` and `value` are the comparison.

Planned entries, beside the three above. M8-4 writes them into the file. A retune does not change a value to pass. That needs Flemming's OK.

- `singleShare` at most 25%, for casual player types and the optimizer.
- `liveMedian` at least 2 after the first hour.
- `dominantShare` at most 40%, for casual player types and the optimizer.
- Tending at least 8% of output for an Apprentice from the borer onward.
- Casual `finishDay` from 5.0 to 7.0 days.
- An extreme's win over casual at most 15%.
- Optimizer versus casual at most 25%.

#### How to extend

Three moves. Each is one new file, or one entry in `targets.ts`. No other edit.

`src/lab/registry.ts` is the Node-side loader. It discovers every non-test file in a folder, checks the shape, and fails loudly on a duplicate id or on a target that names an unknown measure. The pure engine (`src/lab/world.ts`, `src/lab/tournament.ts`, and the metrics) receives those registries as arguments and never reads the filesystem. knip lists `src/lab/policies/` and `src/lab/measures/` as entries, so a new file needs no knip edit.

1. **Add a player type.** Add `src/lab/policies/<id>.ts`. It default-exports `definePolicy({ id, label, kind: "casual" | "extreme" | "optimizer", params, schedule, decide })` from `src/lab/policy.ts`. The loader picks the file up. `runTournament({ policies, measures, targets, seeds, days })` receives it in `policies`. A duplicate `id` fails the load.
2. **Add a measure.** Add `src/lab/measures/<id>.ts`. It default-exports `defineMeasure({ id, label, unit, why, sample?, aggregate })` from `src/lab/measure.ts`. `sample`, when present, reads one `DecisionSample`: live count, best id, wait-to-afford, crew per second, pocket, and output share by source. `aggregate` turns the samples into the number the report shows. The loader picks the file up. The tournament gains a column. A target whose `measure` is not a registered id fails the load.
3. **Add or change a target.** Add or edit one entry in `src/lab/targets.ts`: `{ id, measure, scope, op, value, why }`. The guardrail test (`src/lab/guardrails.test.ts`) makes one check per entry. It has no threshold constant of its own. The report's pass/fail cells read the same list.

The first policy files are casual `casual-2x10` (today's plain dad: same finish day, same buy list), `evening-1x20`, and `checker-6x3`; extremes `never-workers`, `tap-only`, `machines-only`, `workers-only`, `hoarder`, `five-min-a-day`, `marathon`, `no-engineers`, `all-in-engineers`, `never-fix-trouble`, and `boost-junkie`; and one optimizer (greedy lowest payback, with a one-step "save for X" lookahead over the next session). The lookahead horizon comes from `targets.ts`. The optimizer finishes no later than casual. Built (#172).

The first measure files are `liveMedian`, `liveP10`, `singleShare`, `longestDeadStretch`, `longestValueStretch`, `dominantShare`, `typeEverBest`, `featureShare`, and `finishDay`. `typeEverBest` is the "never best" list (a move kind that was never the right buy). `featureShare` is one named source's output share. Tending uses it. A policy that never owns a borer shows n/a for that share, and the guardrail does not fail it.

`src/lab/world.ts` is the clock they share: `step(world, ms, mode: live | away)` on one seeded clock, wrapping accrue, away pay, hazards, and expedition settle. Built (#171). The pacing sim steps this clock and chooses crew and upgrades with `listActions` / `valueOf`. Policies call `decide` on that world. The world does not read the policy or measure folders.

`npm run lab` (`tools/strategy-lab.ts`) loads the registries and writes `reports/strategy-lab.md` and `.json` (gitignored). Built (#174).

#### How to read the report

One row per player type, one column per registered measure. A cell is a bare number when no guardrail covers that row. When one does, the cell is that guardrail's figure plus pass or fail, coloured green or red. Shares are fractions: 0.25 is 25%.

The header names two finish days. **Optimizer finish day** is `optimizer`. **Casual finish day** is `casual-2x10`, the plain dad. Regret divides a dad's finish day by the optimizer's. Extreme win reads how much sooner an extreme finished than that casual dad. Both numbers are the mean across the seeds in the run (seeds 1 through that count). A local `npm run lab` uses `LOCAL_SEEDS`. CI passes `--ci` and uses `CI_SEEDS`. `--seeds` wins over both, and `--days` overrides `DEFAULT_MAX_DAYS`. `--policy` limits the rows; the columns stay every measure.

Under the table: a per-hour timeline for each casual player type and the optimizer, on the first seed; a section per list measure (never the best buy is the dead-feature list); and dead stretches longer than `REPORT_DEAD_HOURS`, once for payback and once for value per stone (when they start, what the dad is saving for, and how many times slower the next payback is). The suggestions name the miss. They do not change a number. CI posts that report and does not fail the build. `LAB_STRICT=1` is what turns a miss into a failing exit.

Adding a policy file adds a row. Adding a measure file adds a column. Adding a target adds a pass or fail on the cells it covers. No other edit.

#### Sensitivity sweep

`npm run lab:sweep` (`tools/sweep/cli.ts`) writes `reports/sweep.md` (gitignored). It is not part of `npm run check`. Morris elementary effects run first, over the knobs in `tools/sweep/knobs.ts`. A Saltelli Sobol design then runs on the top knobs: one scrambled Sobol sequence, fixed seed, S1 and ST tables. The default measures are `longestDeadStretch`, `singleShare`, `dominantShare`, and `finishDay` on `casual-2x10`. Any registered numeric measure can be named with `--measure`. Flags: `--seed`, `--morris`, `--sobol`, `--top`, `--days`, `--policy`, `--out`.

A knob is one entry: a factor id the price, growth, output, or tending formula already reads, plus a low and a high multiplier. 1 is today's economy. The sweep multiplies that number for one run and puts it back. Play, the save, and the tournament are unchanged. The tool lives under `tools/` so its sample sizes and direction numbers stay out of `src/lab/targets.ts`.
