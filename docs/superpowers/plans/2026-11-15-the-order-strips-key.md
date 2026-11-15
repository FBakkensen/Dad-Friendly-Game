# The order strip's key (#708)

Slice 1's frame gets one key at the end of the order strip. It opens today's Ledger drawer, which holds the sound switch, Saved copies and Start over (spec, "What the prototype does not show"). Still behind the dev-only `?slice=1` preview. Part of #664's split, after #707.

## Shared modules

- **The Ledger** is `createLedgerPanel` (ledger-panel.ts), on today's board sheet shell (`createBoardSheet`) in a `.board-sheet-clip` with today's scrim (`createSheetScrim`). It learns a fresh mine: two quiet rows from the save card's fresh lines (save-sheet-copy.ts `freshMineLines`, exported), no relics row and no bar, no Pass the mine, and no "i" (its cards are today's relics and time away).
- **Saved copies** is `createSavedCopiesPanel`. Its lines are already the fresh card's (#707).
- **The sound switch** is the Ledger head's `createSoundKey`, on `soundSetting(storage)`: one choice per device, shared with today's board.
- **Start over** is the Ledger's page (`createStartOverPage`, ledger-parts.ts) and `progress.startOver`, which already makes a fresh mine under `freshMineOn()`. Its words follow the mine.
- **The board host** moves from frame-save-cards.ts to mountFrameScreen, so the Ledger, Saved copies and the save's cards share one settle.
- **Tonight** (ledger-rows.ts `tonightText`) words a horse wagon bought (`vehicle.buy`), as it words a machine bought.

## Tasks

1. Words and rows, pure, tests first: the fresh rows, the vehicle line, the fresh Start over words, "Back to the mine".
2. The Ledger panel in a fresh mine: rows, hidden relics, hidden "i", Start over words. Saved copies' back plate.
3. The frame: the key on the order strip, the shared board host, the Ledger and Saved copies laid over the frame, a save card closing the Ledger.
4. The visual section at 424×924 and 424×830, `npm run play`, docs (ARCHITECTURE, ui-audit).

## Rulings

1. **The rows' words** are the save card's fresh lines, which Flemming approved on 15 Nov 2026 (#707): the stone in the stockpile with the project line under it, and the workers with their wagons, the machines under them. They are asked again as the Ledger's rows (issue: asked before they are shown).
2. **No relics row, no Pass the mine, no "i"** in a fresh mine: relics and expeditions are part 3, passing to the kids is step 2, and the "i" cards are today's (a line never promises what is not live).
3. **Orders stay out of Tonight**: `order.place` carries the building, not the step, so a line would not say which step was ordered.
4. **The key** is a frame-style 48px key with today's Ledger icon, at the strip's right end; the pips move left of it. The strip's tap to the city stays on the rest of the strip.
5. **The Ledger is today's skinned drawer** on the frame, as the save's cards are today's skinned cards (#707). Its top is today's `--sheet-top`, under the frame's top row.
