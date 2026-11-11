# Control Board B7d: the Ledger's Saved copies and Pass the mine cards (#466)

**Goal:** The two cards the Ledger opens, Saved copies and Pass the mine, move to the board card shell that B7b built (#464). The last `.start-over*`, `.menu-*`, `.saved-cop*` and `.legacy-*` card CSS leaves `style.css`.

**Base:** `main` at 2be9a72, with B7a (#375, PR #467), B7b (#464, PR #471) and B7c (#465, PR #470) merged.

**Out of scope:**

- the relics drawer (B7c);
- the other cards (B7b);
- the PC desk (B8, #376).

**Spec:** `docs/superpowers/specs/2026-11-07-control-board-design.md`, "Where everything else goes", which says the ☰ menu's saved copies and pass the mine become the Ledger. B7a's plan put their cards on the card shell.

## Rulings

1. **Cards, not Ledger pages.** Both stay cards on `board-card.ts`, as the issue says. The Ledger closes first, as it does today (`handOff`). `CardId` gains `copies` and `legacy`, so both press and settle through the board's model.
2. **Hooks stay put**, as B7b kept them:
   - `.saved-copies`, `#saved-copies-title`, `.saved-copy`, `.is-earlier-run`, `.earlier-run`, and `.save-conflict-play` and `.save-conflict-error` inside it;
   - `.legacy-dialog`, `#legacy-title`, `#legacy-detail`, `.legacy-lead`, `.legacy-rates`, `.legacy-keeps`, `.legacy-fresh`, `.legacy-legend`, `.legacy-cancel` and `.legacy-confirm`.

   Saved copies' close plate is renamed from `.menu-close` to `.saved-copies-close`, so no `.menu-*` name is left.

3. **Pass the mine stays an alert dialog**, described by its body.
   - Not yet has the focus.
   - Not yet and Escape close it and give the focus back to what opened it.
   - Pass it on presses through the board, so the second tap of the tap that opened the card never passes the mine.
4. **Saved copies gets Escape too**, as Pass the mine has, and it gives the focus back to the Ledger key. A card that the player opened closes the way a dialog does. The cards that open by themselves still have no Escape.
5. **Each copy is an inset**, as the conflict's sides are. Its lines sit clear of the inset's edges: 11 art px top and left, 9 right and bottom.
   - Each inset is built once per copy (and per earlier-run state), then rewritten line by line. A tick never rebuilds a plate, the focus stays put, and the presses do not pile up.
   - Each copy's Play this one is its own control (`play-<id>`).
   - A second press while a restore is running does nothing.
6. **The list scrolls inside the face** when the copies outgrow it. This is the one card body that may shrink (`.saved-copies .board-card-body`). Every other card body still never shrinks, so an overflow shows in the face.
7. **Words move to `screen-words.ts`:** `PASS_TITLE`, `PASS_NOT_YET`, `PASS_IT_ON`, `SAVED_COPIES_EMPTY` and `SAVED_COPY_GONE`. They are today's words, with no new copy.

## Modules

- `src/board-interaction.ts`: `CardId` gains `copies` and `legacy`.
- `src/legacy-panel.ts`: the confirm moves onto `createBoardCard`. Its API stays (`badge`, `dialog`, `open`, `offered`, `render`) and gains `board`.
- `src/saved-copies-panel.ts`: the list moves onto `createBoardCard`. `open(from?)` gives the focus back to `from`, and the panel gains `board`.
- `src/screen-panels.ts` and `src/ledger-panel.ts`: pass `board` in, and the Ledger key as the opener.
- CSS: the old rules leave `style.css`, and the two cards' rules go in `board.css` after the conflict's.
- Tests: new `legacy-panel.test.ts` and `saved-copies-panel.test.ts`; `style.test.ts`, `mountain-screen-order.test.ts` and `mountain-screen-depths.test.ts` follow.
- Checks: two rows join the board cards table in `scripts/visual/notices-saves.mjs`; section 9 in `cards.mjs` reads the card face; the UI audit shoots both cards risen.

Proof follows the ladder in `.claude/rules/dad-friendly-work.md`.
