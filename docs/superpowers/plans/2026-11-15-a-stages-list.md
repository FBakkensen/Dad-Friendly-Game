# A stage's list, and the worker's upgrades in the workforce (#661)

Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md`: "The mine" (a tap on a row), "What the prototype does not show" (a stage's full list), "What Next and the lamps count", "The amount key", "Where today's parts land", and rule 2.9. Parent #530. Built inside the frame (#659), beside the mine (#660). It holds what #537 (the bays) and #538 (Buys by stage) specified for today's board, on the new screens.

## Rulings (agent-run sitting)

1. **Where it lives.** A stage's list is a sheet over the frame, in the workforce's form (`frame-sheet`), opened by a tap on a stage's row in the mine. The game runs on behind it, and Close shuts it. The row's words are a button for the tap; its − and + stay keys of their own. `stage-list-view` (new: it is a new screen) holds the pure view, and `stage-sheet` the DOM. It changes the game only through `progress.dispatch`.
2. **Its head** has the stage's name and the amount key, then what the stage moves of what it can move over the row's band ("Moves 210/s of 378/s"), and a line for each part of who works with what, its moves at the right ("6 carts · 6 of 6 workers · 360/s", "3 with barrows · 18/s"), adding up to what it can move. Flemming asked for this in place of one line of text (15 Nov 2026, 14:10Z). A screen reader hears the row in one sentence.
3. **Its machines.** Each kind of machine of the stage in play (one each in part 1: the drill, the cart, the hoist): its name with the count he owns ("Mine carts · 4 owned"), its next ownership mark with its progress ("4 of 10 · Every cart hauls twice as fast."), or "Twice as fast now." past the last, and a key in the mine keys' form ("+Cart · 60/s", its price, "1 to run") that follows the amount key. One key mechanism: `machineKey` (`mine-view`), which the mine's keys use too.
4. **Its upgrades.** Each upgrade the game shows (`upgradeShown`) whose synergy lifts a machine of the stage: Helping hands on haulage, Cart roads on drilling. A row has its name, what it does in numbers (`upgradeEffectLine`), its second line (`upgradeWhyLine`), and a key with its price, green when he can pay; once bought it reads "Owned". An upgrade that has not opened is not shown, as today.
5. **No gear, engineer or trouble in part 1.** Gear is made in the factory (part 3), and engineers and trouble by stage are #539 (part 3). The list shows nothing for them.
6. **The worker's upgrades are in the workforce**, under the jobs, as "The workers": Better boots in the upgrades' form, and the worker marks' line ("21 of 25 · Every worker digs twice as fast."). The amount key does not reach an upgrade: each has one level.
7. **The lamps.** A stage's row has a lamp, green while its list holds something he can afford: a machine of the stage at ×1, or an upgrade shown in its list. The mine's count on Next and the site bar is the sum of its three stages, so the mine's lamp is never green with no row lit. One mechanism: `stageCount` (`next-view`). The workforce's count and the lamp on the count of workers stay as #659 built them.
8. **The words.** Better boots lifts only a worker with a tool (rule 2.9), and Helping hands counts the workers on haulage, so both need new words in a fresh mine (the spec's call 41). No screen says "hands", so Helping hands needs a new name too. Proposed:
   - Better boots: "Workers with a tool 3/s to 7.1/s." and "Picks, barrows and winches go faster. Machines, drivers and builders do not."
   - Helping hands becomes "Cart helpers": "Carts 60/s to 63/s." and "Each worker on haulage makes carts 1% faster."
   - The hoist's marks, worded as the cart's ("Ten hoists at the shaft. Every hoist lifts twice as fast."), shown for the first time.
   - The workers' first mark: "Every worker with a tool works twice as fast." (it was "Every worker digs twice as fast.").
     Flemming said A, yes to all four as shown, on 15 Nov 2026 (14:11Z).
9. **One of each mechanism.** The upgrade row is today's `upgradeRowView` (`upgrade-rows`), which now takes its name from `upgradeName`; the effect and why lines are `screen-words`' (a fresh mine's words beside today's); the mark line is `markLine` (`milestones`); the machine key is `machineKey` (`mine-view`) and its DOM `buildMachineKey` / `paintMachineKey` (`mine-site`); the buy is `tierBuyMove` and `buyUpgrade` at the price on the key (#367); the sheet is the workforce's CSS.
10. **The lamps count at ×1** (review, Minor). At ×10 a row can be lit while its "+10" key is dark. Next's count is "every buy he can afford now", and the amount key is in the list's head, so a lit row always has a buy one tap away.

## Tasks

1. `machineKey` out of `machineKeys` (no change to the mine's keys); `stageCount` in `next-view`, and the mine's count as their sum.
2. The fresh mine's words for Better boots and Helping hands (`screen-words`), with tests.
3. `stage-list-view` and its tests: the head, the machines with their marks and keys, the upgrades (shown, bought, not open), the workers' section.
4. `stage-sheet`, the row's tap and lamp in `mine-site`, the workers' section in `workforce-sheet`, CSS; DOM tests: a tap opens the list, a machine key buys with the amount key, an upgrade buys and then reads Owned, the lamp, Better boots in the workforce, nothing says "hands" or names a limit.
5. The visual section's list and workforce checks at 424×924 and 424×830; `npm run play`.
6. The question to Flemming: the three lines, with pictures.
7. Docs: `ARCHITECTURE.md`, `docs/ui-audit.md`.
