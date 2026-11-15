# The frame keeps the save's cards (#707)

Split out of part 1's switch-on (#664): today's board is the only screen that hosts the cards that keep the save safe, so the new frame hosts them before the board can go. Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md` ("What the prototype does not show": the save line stays) and `.claude/rules/observable-saves.md`. Parent #530. Blocks #664. #708 (the order strip's key: the Ledger, Saved copies, the sound switch and Start over) is its own sliver.

## Rulings (agent-run sitting)

1. **Which cards.** The update card (a waiting build, and a save from a later build: play held, nothing written), "Two saves found" with its confirm, and the other-tab card with "Play here". The shift report and the end card are already the frame's (#663). Saved copies opens from the Ledger, so it goes with #708.
2. **One mechanism.** The cards are today's panels: `createUpdatePrompt`, `createOtherTab` and `showAppUpdate` (`screen-prompts`), and `createSaveConflictPanel` (`save-conflict-panel`), on the board card shell (`board-card`). The frame gets a `BoardHost` of its own (`createBoardHost`), so the cards' presses keep the board's settle against a sleepy double tap. A new module, `frame-save-cards`, puts them together for the frame, as `frame-cards` does for the shift report. `frame-screen` mounts it and paints it, and `main.ts` already calls `showAppUpdate(root)` for both screens.
3. **Their order.** The save's cards sit over everything on the frame, the shift report included: a choice of save comes before a report of the night.
4. **A save card in a fresh mine.** `saveCardLines` (`save-sheet-copy`) reads depth, the pocket, the old machines and engineers, none of which a fresh mine has. In a fresh mine it reads the project in the order strip's words (`orderStrip`, `frame-view`), the stone in the stockpile, the machines and horse wagons, and the workers. These are new lines, so they are Flemming's to approve, asked as one question with a picture. Proposed:
   - "The Light Tower · Foundation" (the order strip's name and step; its state, "delivering", does not fit half a card), or "The Light Tower is operational" after its roof;
   - "4,200 stone in the stockpile";
   - "5 drills · 6 carts · 3 hoists" (in the mine's order), or "No machines yet";
   - "30 workers · 2 horse wagons" (the wagons do not fit on the machines' line beside three machines).
     Flemming said A, yes to the lines as shown, on 15 Nov 2026 (15:13Z).
5. **Which side is picked first** stays "more stones mined, the phone on a tie". In a fresh mine nothing is mined from the mountain, so it is the phone until #664 adds the save's "rock dug in all" fact (the spec's call 13). Noted on #664.

## Tasks

1. `saveCardLines` in a fresh mine, with tests.
2. `frame-save-cards` and its DOM tests: the update card on a waiting build and on a later build's save (nothing written), the conflict card from the dev hook with its confirm, the other-tab card with Play here. Mounted in `frame-screen`.
3. The visual check's card table (`notices-saves`) runs the conflict, update, newer-save and other-tab scenarios on the slice preview too, at 424×924 and 424×830. `npm run play` on the slice preview with `?saves=two` and `?update=shown`.
4. The question to Flemming: the four lines, with a picture.
5. Docs: `ARCHITECTURE.md`, `docs/ui-audit.md`.
