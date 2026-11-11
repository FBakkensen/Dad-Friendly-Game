# Control Board B7c: the relics drawer (#465) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** the relic shelf, a found relic's detail with its keepsakes, the relic reveal and the Legend finale move out of today's four dialogs into one riveted board drawer, the relics drawer, as the spec's "Where everything else goes" table says: "Drawers in the board skin. The reveal opens itself, as today." The five keepsakes get their own PixelLab icons in place of the old gold nugget.

**Split.** #465 also held the Ledger's Saved copies and Pass the mine cards and the last `.start-over*` and `.menu-*` CSS. Those open from B7a's Ledger and want B7b's card shell, so they moved to #466 (blocked by #464 and #465). This part needs neither: it is pages of one drawer on B5's shell, with B7a's `showPage`.

**Spec:** `docs/superpowers/specs/2026-11-07-control-board-design.md`: the relic plate (line 47), Sheets (106–118), the relic shelf row of "Where everything else goes" (137), Art (173–200), and the checks.

## The drawer

One drawer, `relics`, with no key on the rail. It holds one of four screens:

| Screen        | Opens from                                      | Holds                                                                                                                             | Leaves by                                                                                      |
| ------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Shelf (list)  | the Relic shelf key in a socket's note          | six rows: lamp, the relic at 24 art px (lit once found, dark until then), name, today's line, the guided next relic's hint        | Back, the scrim, Escape; a found row opens its detail                                          |
| Detail (page) | a found row                                     | kicker, the relic at 24 art px, name, virtue, power, and the keepsakes brought home, each with its 16 art px icon, name and story | Back to the shelf (the list), or the drawer's Back                                             |
| Reveal (page) | itself, when a relic is found and no card is up | kicker, art, "You found the …", virtue, power, boost, Carry it with pride                                                         | Carry it with pride. Back, the scrim and Escape carry it too. The Mantle's leads to the Legend |
| Legend (page) | itself, once per run, after the Mantle's reveal | kicker, "You became a Legend", the six relics lit, the stats, the cheer, Stand proud and Pass to your kid                         | Stand proud or any close; Pass to your kid closes it and opens today's Pass the mine card      |

## Rulings

1. **Pages, not cards.** The relic family lives in one drawer, as the spec's table reads, and not on B7b's card shell. B7a's plan had put B7c on that shell; the drawer needs no shell of its own, so B7c can ship alongside B7b.
2. **The reveal waits for any card that is up** (welcome back, the conflict, other tab, update, Pass the mine), as it waits for welcome back today. A card that comes up over it closes the drawer by program; that close does not carry the relic, so the reveal comes back once the card goes. The layer arrival and craft done cards already wait for the reveal, as today.
3. **Any close of the reveal carries the relic**, except a program close (rule 2). Closing it is the player saying "seen". A close of the Mantle's reveal opens the Legend.
4. **A not-yet-found row blinks** when tapped, as any drawer row that cannot act does. Today those rows ignored the tap.
5. **The drawer's title is "Relics of Fatherhood"**, the plate tag's words, and its kick "2 of 6 found", the sockets' count words. No new copy. Every other line is today's.
6. **Relic art stays 24 art px (48 CSS px)** on the rows and pages, so the board stays at exactly 2×. Today's reveal showed it at 64 CSS px.
7. **The relic pages have their own layout** (`.relic-page*` in `board.css`). They share the plate button, the skin, `pressOnBoard` and the drawer's page mechanism. The Ledger's `pageFrame` stays the Ledger's: its pages are a title, a line and answers.
8. **`createBoardSheet`'s `onClose` hears how the drawer closed** (`CloseBy`), so the relics panel can tell a player's close from a program close. It is the shell's existing hook, extended.
9. **Opening the relics drawer closes every other drawer**, as a key does: it joins `wireKeys`' drawer record, and the reveal opens through the same `openOnly`.

## Modules

- **New `src/relic-rows.ts`** (pure, no DOM, no art): `shelfRowView(mountain, relic)`, `relicsKick(mountain)`, `legendStats(mountain)`. Unit tests in `src/relic-rows.test.ts`.
- **New `src/relic-pages.ts`** (DOM): the detail, reveal and Legend pages, each `{ root, paint(...), forget() }`, with the keepsake art map. Tests in `src/relic-pages.test.ts`.
- **`src/relic-panels.ts`** is rewritten as a thin builder on `createBoardSheet` and `rowsOnBoard`: the shelf rows, the screen it shows, and the reveal and Legend waits. `createRelicPanels` leaves `scripts/function-ceilings.json`.
- **`src/board-interaction.ts`:** `DrawerId` gains `relics`.
- **`src/board-drawer.ts`:** `onClose(by)` (ruling 8).
- **`src/screen-panels.ts`, `src/screen-keys.ts`, `src/mountain-screen.ts`:** the drawer joins `drawers` and `wireKeys`; the four dialogs leave `cardsFrom`; the panel hears `cardUp` and the legacy card.
- **CSS:** the old `.shelf-*`, `.relic-reveal`, `.reveal-*`, `.legend*` and `.keepsake*` rules leave `src/style.css`; the drawer's go in `src/board.css`.
- **Art:** `src/assets/board/keepsake-{drawing,watch,whistle,pebble,ribbon}.png`, 16×16, PixelLab (approved for #465 by the coordinator under Flemming's standing PixelLab yes).

## Tasks

1. `relic-rows.ts` with its tests (TDD).
2. `DrawerId` and `onClose(by)`, with the drawer shell's test.
3. `relic-pages.ts` with its tests (TDD).
4. The panel, the wiring and the CSS; the screen tests move to the drawer's selectors (`mountain-screen-crew`, `-depths`, `-order`, `style.test.ts`).
5. The visual sections (`scripts/visual/cards.mjs`, `board.mjs`), the UI audit's shots, and `npm run play` on `late`, `tools` and `crystal`.
6. Docs: `docs/ui-audit.md`, `docs/ART.md`, `docs/ARCHITECTURE.md`.

Proof follows the ladder in `.claude/rules/dad-friendly-work.md`.
