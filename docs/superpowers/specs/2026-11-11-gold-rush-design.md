# Gold rush: a reason to stay the two minutes (#360)

Status: approved (Flemming, 11 Nov 2026: the Gold rush vein, of three options). This is sliver S6 of the economy overhaul (`docs/economy-overhaul.md`, #354). It is a short spec for one build sliver.

## Why

A two-minute check-in brings about six hours of away pay (30% of the crew's speed, `AWAY_PAY_RATE`). The two minutes he is actually there add about 2% on top: 120 seconds of crew at full speed, and a golden vein (60 seconds of crew) on about every other check-in, because the vein's 3–6 minute wait counts play time only. With Buys on Max (#358) the shopping takes about 15 seconds. Nothing on the screen rewards the rest of the two minutes.

The lever should reward being there without punishing absence (`.claude/rules/dad-friendly-game.md`): nothing earned is ever taken away, and missing it costs nothing.

## The design

**The quick vein.** When he opens the game after at least an hour away, the first golden vein of that check-in glints within about 20 seconds, not after the usual 3–6 minutes. Later veins in the same check-in keep today's wait. A reopen within the hour gets no quick vein, so closing and reopening the tab is not a way to farm it.

**The Gold rush.** Tapping the quick vein pays the vein as today, and starts a Gold rush: the crew digs ×10 for 90 seconds. The crew line shows the rushed speed, and the boost dial and its Running now note show the rush with its countdown, like every other crew timer. The mine window carries the sparkle only. When it ends, the crew goes back to its speed. If the vein glints out untapped, nothing is lost and the next vein comes on today's wait.

**What it never does.**

- It never multiplies away pay. It runs only while the game is open, like the boosts.
- It is never a cost: no price, no streak, no penalty for skipping it.
- It never asks him to stay: no confirm, no "come back" nag.

**Close is pause.** The rush's time left pauses while the game is hidden, like the vein wait (`pauseVein`), and is kept on the device next to the vein wait, not in the save. Reopening within the hour resumes what was left. Reopening after an hour starts a fresh quick vein instead, and a part-used rush is dropped: losing a minute is fine (`.claude/rules/dad-friendly-game.md`).

## How it fits the code (rulings, 11 Nov 2026)

These follow the review of this spec. Each names the mechanism to extend, so there is no second home for a multiplier or a countdown.

- **Where the rush lives.** It is session state, like `Trouble`: never saved, carried into moves through the same context, and read by `effectiveRates(mountain, now, …)`, so the crew line, the Buys cards, live mining and the lab agree. Only its time left is kept on the device.
- **Stacking.** The rush multiplies the live crew on top of the strongest crew timer (`liveCrewTimer`: Overtime, axle grease, a blasting charge). It does not join the strongest-wins rule, because that would shadow a running Overtime while its clock burns, a hidden cost. A boosted crew in a rush digs ×20. The lab grades it. DESIGN.md's strongest-timer lines name the rush as the one exception.
- **The countdown.** `CrewBoost`'s `source` (`src/crew-boost.ts`) gains the Gold rush, so the dial and Running now show it with no new countdown home. While the rush and another crew timer both run, the dial shows the rush, Running now lists both, and the crew line shows the product.
- **An hour away** is the open's `AwayReport.awayMs`, the same away time that gates the welcome card and the quiet note. It reads the save's `lastSeen`, so an hour on the PC counts as being there for the phone too.
- **Where he can see it.** The quick vein's 20 seconds start once the welcome-back card is closed. While a drawer or sheet covers the mine window, the quick vein's wait and glint hold, and they go on when the board shows again. Shopping first never costs him the rush.
- **Vein effects.** The Lantern, a crystal flare and the crystal lamp do not shorten the 20 seconds. The old miner's lamp's longer glint does apply.
- **Ends.** A rush ends when the mountain bottoms out, and on Pass to your kid or Start over (`vein.reset`).
- **Valuation.** The quick vein is not bought, so it does not enter `valueOf`'s vein gain.

## Paid from the away haul (Flemming, 11 Nov 2026, during the build)

A rush on top of away pay failed the strict lab at every size in the band, and below it. Main has no headroom: `optimizer-regret` already reads exactly 1.25 (the evening dad on day 5, the optimizer on day 4), so any rush that moves the optimizer one sitting earlier breaks it. At ×10 for 90 seconds the Marathon also finished a day sooner (`extreme-win` 0.22). Flemming picked the first of three options:

1. **Pay the rush out of the away haul (picked).** After an hour or more away, the open holds back what the rush digs on top of the crew (`rushBank`: nine crews for 90 seconds, never more than the haul). The welcome card still shows the whole haul, with one line for the held part. Tapping the quick vein pays the held stones over the rush, so the crew digs ×10. A glint that goes by, an hour away, or the mountain bottoming out lands every held stone at once. The total never changes, so no finish day moves.
2. Keep the rush as a true bonus and loosen `optimizer-regret`, `dominant-share` and `extreme-win`.
3. Park it.

These build rulings follow from it, and replace the matching ones above:

- **Where the rush lives.** In the save: `rushUntil` and `rushBank` in the workshop map, beside `axleUntil`. That reuses the timers' save path. A rush paused on the phone goes on on the PC.
- **Stacking.** The rush adds its held stones a second (`rushPerSecond`) on top of the crew in `effectiveRates`, so the crew line, the dial, live mining and the lab agree. It does not multiply Overtime: Overtime and a rush dig ×11, not ×20, because the held stones are a fixed amount.
- **Arming.** The quick vein comes when held stones wait (`rushOwed`), on each settled time away, so a reload in its 20-second wait still brings it.
- **Valuation.** What a buy is worth reads the crew without the rush (`withoutRush`).
- **The lab** plays the rush only. It has always left golden veins out, and the quick vein is a vein come early, so its own pay is not played.

## Numbers (starting values, the lab tunes them)

- Quick vein after at least 60 minutes away; it glints about 20 seconds after the welcome-back card closes.
- Gold rush ×10 crew for 90 seconds.

Rough effect, per sitting, from today's rates: the check-in dad (four 2-minute sittings) gains about 12%, the casual dad (two 10-minute sittings) about 9%, and the Marathon (one 3-hour sitting) about 3%. One rush per sitting means the long sitting gains least. The lab tunes the multiplier and length inside ×5–×15 and 60–120 seconds by feel: a check-in should feel the rush, and every strict guardrail stays green.

## The extreme-win call

**Decided (Flemming, 11 Nov 2026): the bound stays at 0.17.** Today `extreme-win` reads 0 at 3 seeds (the Marathon finishes on day 4, with the casual dad). The lever gives at most one rush per sitting after an hour away, so it leans toward short sittings and should not move any extreme ahead: the Marathon and the five-minute dad get one rush a day, and the boost junkie's ×20 lasts only the rush.

## Options weighed

Flemming picked the first of three. The other two are kept here so a later sitting does not reopen them.

1. **The Gold rush vein (picked).** One tap of play, built on the vein he already knows, over inside two minutes.
2. **A fresh shift, no tap.** After an hour away, the crew digs ×5 for the first two minutes. Simplest, but there is nothing to do: it only rewards leaving the app open.
3. **A shift bell.** One ring per few hours away, up to three held, each ×10 for 90 seconds. A real choice of when, but one more thing to manage, and a long sitting could ring all three at once.

## Lab

No lab policy taps a vein today. The build sliver adds the quick vein and the rush to the sim: every policy taps the quick vein at the start of each sitting after an hour away (a dad who is there sees it). So `extreme-win`, `optimizer-regret`, the check-in rows and the generations lab grade it. No bound moves to go green.

## Art

The rush needs a short gold sparkle loop on the mine window, and an icon for its chip in the boost dial if the dial's existing icons do not fit. Both come from PixelLab (Flemming approved PixelLab for this project, 11 Nov 2026). No placeholder.

## Out of scope

- Any change to away pay, boosts, or the normal vein wait.
- A second rush per sitting. A rush started on the PC does not carry to the phone: its time left is per device, like the vein wait.

## Build sliver

#468, one PR: the quick vein, the Gold rush, the sim and lab, the sparkle art, and docs (DESIGN, design-intent, ARCHITECTURE, ui-audit) updated. Done when the strict lab and the generations lab pass at 20 seeds, and `npm run play` shows the quick vein, the rush countdown and the crew line on phone and desktop.
