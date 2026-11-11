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
- **Stacking.** The rush multiplies the live crew on top of the strongest crew timer (`liveCrewTimer`: Overtime, axle grease, a blasting charge). It does not join the strongest-wins rule, because that would shadow a running Overtime while its clock burns, a hidden cost. A boosted crew in a rush digs ×20. The lab grades it.
- **The countdown.** `CrewBoost`'s `source` (`src/crew-boost.ts`) gains the Gold rush, so the dial and Running now show it with no new countdown home.
- **An hour away** is the open's `AwayReport.awayMs`, the same away time that gates the welcome card and the quiet note. It reads the save's `lastSeen`, so an hour on the PC counts as being there for the phone too.
- **Where he can see it.** The quick vein's 20 seconds start once the welcome-back card is closed. While a drawer or sheet covers the mine window, the quick vein's wait and glint hold, and they go on when the board shows again. Shopping first never costs him the rush.
- **Vein effects.** The Lantern, a crystal flare and the crystal lamp do not shorten the 20 seconds. The old miner's lamp's longer glint does apply.
- **Ends.** A rush ends when the mountain bottoms out, and on Pass to your kid or Start over (`vein.reset`).
- **Valuation.** The quick vein is not bought, so it does not enter `valueOf`'s vein gain.

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
