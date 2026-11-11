# Gold rush: a reason to stay the two minutes (#360)

Status: draft, waiting for Flemming's pick. This is sliver S6 of the economy overhaul (`docs/economy-overhaul.md`, #354). It is a short spec for one build sliver.

## Why

A two-minute check-in brings about six hours of away pay (30% of the crew's speed, `AWAY_PAY_RATE`). The two minutes he is actually there add about 2% on top: 120 seconds of crew at full speed, and a golden vein (60 seconds of crew) on about every other check-in, because the vein's 3–6 minute wait counts play time only. With Buys on Max (#358) the shopping takes about 15 seconds. Nothing on the screen rewards the rest of the two minutes.

The lever should reward being there without punishing absence (`.claude/rules/dad-friendly-game.md`): nothing earned is ever taken away, and missing it costs nothing.

## The design

**The quick vein.** When he opens the game after at least an hour away, the first golden vein of that check-in glints within about 20 seconds, not after the usual 3–6 minutes. Later veins in the same check-in keep today's wait. A reopen within the hour gets no quick vein, so closing and reopening the tab is not a way to farm it.

**The Gold rush.** Tapping the quick vein pays the vein as today, and starts a Gold rush: the crew digs ×10 for 90 seconds. The mine window shows the rush and its countdown, and the crew line shows the rushed speed. When it ends, the crew goes back to its speed. If the vein glints out untapped, nothing is lost and the next vein comes on today's wait.

**What it never does.**

- It never multiplies away pay. It runs only while the game is open, like the boosts.
- It is never a cost: no price, no streak, no penalty for skipping it.
- It never asks him to stay: no confirm, no "come back" nag.

**Close is pause.** The rush's time left pauses while the game is hidden, like the vein wait (`pauseVein`), and is carried on the device next to the vein wait, not in the save. Reopening within the hour resumes what was left. Reopening after an hour starts a fresh quick vein instead.

## Numbers (starting values, the lab tunes them)

- Quick vein after at least 60 minutes away; it glints about 20 seconds after the open.
- Gold rush ×10 crew for 90 seconds.

Rough effect, per sitting, from today's rates: the check-in dad (four 2-minute sittings) gains about 12%, the casual dad (two 10-minute sittings) about 9%, and the Marathon (one 3-hour sitting) about 4%. One rush per sitting means the long sitting gains least. The lab tunes the multiplier and length inside ×5–×15 and 60–120 seconds by feel: a check-in should feel the rush, and every strict guardrail stays green.

## The extreme-win call

Today `extreme-win` reads 0 at 3 seeds (the Marathon finishes on day 4, with the casual dad). _Recommended: keep the bound at 0.17._ The lever leans toward short sittings, so it should not move the Marathon ahead.

## Lab

The strategy lab does not model veins today. The build sliver adds the quick vein and the rush to the sim (each sitting after an hour away taps the quick vein, except for a policy that never taps), so `extreme-win`, `optimizer-regret`, the check-in rows and the generations lab grade it. No bound moves to go green.

## Art

The rush needs a short gold sparkle loop on the mine window, from PixelLab (approved for this project, 11 Nov 2026). No placeholder.

## Out of scope

- Any change to away pay, boosts, or the normal vein wait.
- A second rush per sitting, or a rush on the PC that also counts on the phone (the rush is per device, like the vein).

## Build sliver

One issue, one PR: the quick vein, the Gold rush, the sim and lab, the sparkle art, and docs (DESIGN, design-intent, ARCHITECTURE, ui-audit) updated. Done when the strict lab and the generations lab pass at 20 seeds, and `npm run play` shows the quick vein, the rush countdown and the crew line on phone and desktop.
