# One lamp rule (#509)

**Goal:** a row lamp means one thing on the board and in every drawer (Buys, the Workshop, Engineers, Upgrades, the Ledger).

**The rule** (written in `docs/DESIGN.md`, "One lamp rule"):

| Lamp  | Means                                                                |
| ----- | -------------------------------------------------------------------- |
| Green | A tap here spends now, and the pocket (and free hands) cover it      |
| Amber | The board's pick, or something running now                           |
| Red   | Trouble to fix                                                       |
| Dark  | Everything else: not yet, too dear, short of hands, done, a free tap |

**Shared module:** each drawer's row module already sets `RowView.lamp` (`src/row-view.ts`). The rule is applied there, in place; no new module.

## Tasks

1. Map every lamp today. Buys' priced rows, Upgrades' priced rows and the bays (`machine-bays.ts`) already follow the rule.
2. Change the rows that do not:
   - `upgrade-rows.ts`: a found tool, green to dark (done); a running boost, dark to amber.
   - `buys-rows.ts`: the staffing New row, green to amber (the pick).
   - `workshop-rows.ts`: the taught New craft, green to amber (the pick).
   - `workshop-rows.ts`: the free bench, green to dark (nothing to tap; the recipes light).
   - `engineer-rows.ts`: an engineer tending or out, green to amber (running); her own post, green to amber, except Rest at camp (dark).
   - `ledger-rows.ts`: every relic found, green to dark (done); signed in, green to dark (a state, not a spend).
   - `relic-rows.ts`: a found relic on the shelf, green to dark (done; the next relic is the amber one).
3. Update the row tests, the visual check's engineers and workshop lamps, and DESIGN, ui-audit and ARCHITECTURE lines that named the old lamps.
4. Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the row tests, `npm run gate -- fast`, `VISUAL_ONLY='keys and drawers' npm run visual`, `npm run play` in all five drawers, then `npm run gate -- full`.

## Rulings

- Green is a spend. A free tap (move her post, pick a tunnel, open a relic, sign in or out) stays dark, so green always means money he can spend.
- Amber outranks green: when a row fits two, red wins, then amber, then green, then dark. Every teach's New row is amber, in Buys (the staffing Hire), the Workshop (the taught craft) and Engineers alike, even when he can afford it.
- A running boost is amber, as a craft on the bench is. Rest at camp, her own post while she rests, is dark.
- Short of workers stays dark in Buys, as the bays already do: it still buys, but it is not a "do this now".
- Status lights stay outside the row rule: the save line's lamp, the crew plate (amber while anyone is free) and the save conflict's picked side (green).
- Tap feedback stays: a held "Done" flashes green, a refused tap blinks red.
