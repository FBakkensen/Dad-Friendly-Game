# One set of words on the board (#508)

**Goal:** items 7 to 10 of the readability list (#504): one word for the crew (workers), one way to say per second, plain locked rows, one CREW label, and the welcome-back haul in the board's short figures on one line. Wording only; type sizes and number emphasis are #505 to #507 on another branch.

**Shared modules:** no new module. The bay line stays in `bayLines` (`src/board-bays.ts`, with `workerWords`); the locked line in `src/tier-lock-words.ts` (`lockRateLine`, plus `lockShortLine` for the bay's narrower pattern); the dial in `createBoostDial` (`src/board-stock.ts`); the gauge legend in `src/board-gauge.ts`; the Buys legend in `src/crew-panel.ts`; the welcome words in `src/screen-words.ts` (`awayMinedWords`, `rushHeldWords`) and the one-line rule in `src/board.css`.

## Rulings (agent-run sitting; the wording is the issue's, agreed with the coordinator)

1. **Workers:** the bay line reads `+6/s · 1 worker`. Where it does not fit, the shared pattern falls back to the gain alone, as before.
2. **Per second:** a figure carries `/s`; words say `a second`. The gauge legend is `Stones a second`, the Buys crew legend `Per second`. Sentences that already said "a second" stay.
3. **Locked rows:** `Opens at 10M stones` (bays fall back to `Opens at 10M`); a relic's tier reads `With the Crown at 259.3M`. The tier's own name is already on the row, so the line drops it. The screen reader's line is unchanged.
4. **Pace:** at rest the boost dial's name reads `Pace` (`Pace ×1, rested` to a screen reader). A running boost still shows its own name. CREW is now only the crew plate.
5. **Welcome back:** the haul and the Gold rush line use `formatCompact` (`+947.1K stones`, `474.8K of them wait…`), and the haul's line never wraps. Other cards keep their spelled-out numbers; they were not on the list.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the gauge row, bays, Buys and welcome visual sections, and `npm run play` on the mid save (board and Buys) and the away save.
