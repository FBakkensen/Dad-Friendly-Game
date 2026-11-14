# Random play never breaks the rules (#555)

The fourth check under #551. fast-check plays random legal moves through `listActions`, `applyMove` and `advance`, with live waits and time away between them, from a save in each band. It checks the rules a dad should never see broken. A failure shrinks to a few steps and prints its seed. It runs in the `unit` project in under two seconds.

## Plan

1. Add `fast-check` (pinned, dev only).
2. `src/economy/invariants.test.ts`, random play, 1000 runs of up to 40 steps. After every step:
   - every number in the save is finite, not negative and within the safe integers, and every count (crew, upgrades, crafts, ranks, trips, legacy) is whole;
   - nothing a run only gains goes down: depth mined, legacy, recipes, finds, taught, upgrades, crafts;
   - a buy that adds to the crew never slows it;
   - an upgrade or a promotion spends exactly its shown price, and every other buy spends some stones;
   - the save round-trips through JSON and `parseSaveValue`.
3. Time away pays the same however it is sliced: one absence against the same absence in two parts (300 runs), and up to 30 minutes against one second at a time (40 runs). Each stretch is settled from where the last one settled, as the game keeps `lastSeen`.
4. Each known gap is a named test that pins it, listed at the top of the file, so a fix turns its test red and takes it off the list.
5. Prove it turns red: a free `buyTier` (the pocket kept as it was) fails random play with a shrunk case.

## Rulings

- **Band starts are made, not loaded.** Each band's save is the fresh mountain moved a little way into that band, with a pocket of a tenth of the depth spent by buying the first thing that can be bought until nothing more can be. It is a crew a dad could own, without a save fixture to keep current.
- **The slicing checks skip the Heart of Patience.** With the Heart a longer absence pays more an hour, by design, so splitting it pays less. It has its own test that says so.
- **Absences in the slicing check stay inside the full-pay length** (6 hours, or 24 with the Shield). Past it an hour pays less, by design, so one long absence pays less than two short ones.
- **One stone a stretch is the stated tolerance,** plus a millionth of the haul for floating-point dust. It is the part-stone gap's size.
- **The save rounds depth up, by design.** The round-trip compares against the mountain with `remaining` rounded up, as `save-format.ts` says.
- **Gaps are pinned, not fixed.** The issue asks for the rules as they are today. The band-crossing fix moves the pace, so it is its own issue.

## Findings

- **part-stone.** Each stretch away pays whole stones and drops the part stone. 23 helpers away pay 6.9 a second, so one 3 s stretch pays 20 and three 1 s stretches pay 18. At most one stone a stretch.
- **band-crossing.** `accrueAway` reads the crew's speed once, where the absence starts, and pays the whole stretch at it. A crew of 30 helpers, 10 carts, 10 hoists and 20 drills, one hour above the Granite, away 6 hours: 10,497,600 stones in one stretch, 8,942,400 when the same time is split where it crosses (17% over, since Granite slows drills). The same crew with 20 borers: 28,615,680 against 30,926,880 (7.5% under, since Granite suits borers).
