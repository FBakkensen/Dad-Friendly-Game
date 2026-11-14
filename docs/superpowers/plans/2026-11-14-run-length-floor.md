# A run takes at least five days, with no ceiling (#556)

An agent-run sitting under M16 (#551). Flemming's ruling, 14 Nov 2026: the 3 to 5 day run goes. Not less than five days, likely weeks in the end, and a meaningful decision at all times matters most.

## Plan

1. A failing test first (`src/lab/tournament.test.ts`): the real `casual-finish` target judges three casual dads that finish on day 4, day 30 and never. Day 4 fails, day 30 and unfinished pass, the table prints each verdict beside the finish day, and the suggestions name the miss with the bound "at least 5".
2. `src/lab/targets.ts`: `casual-finish` becomes `gte 5`, and `thin-habit-finish` loses its 14-day ceiling for the same `gte 5`. Both stay report-only. The finish-day measure's question drops "land in the week".
3. The docs say the same: `docs/DESIGN.md` (the pacing target, the relics' pacing line, the targets list and the Pacing note), `docs/economy-overhaul.md` and the line spec's Risks. Days 5 to 7 and 14 days stay only as history.

## Rulings

- **No new report section.** The report's table already prints each judged cell as "value pass/fail", and every casual row has the `casual-finish` judgement on its finish day, so the floor row is the finish-day column itself. A miss is also named under Suggestions. A second section would print the same verdict twice.
- **`thin-habit-finish` keeps a floor of five days** rather than being dropped. Five minutes a day is the slowest player type; the floor still says the run is not shorter than five days for it, and the row stays visible for #543.
- **An unfinished run passes the floor.** The lab plays a fixed number of days; a run that is still going is longer than five days, which is what "no ceiling" means.
- **Today's runs are under the floor.** Run 1 ends on day 3.7 to 5.0, so the report marks those casual rows "fail". That is the known gap the issue names; the retune belongs to the line (#543), which also makes the floor strict. No number in the game moves here.
- **The pacing sim's pins stay.** `src/pacing.sim.test.ts` pins bottom days of 3.5 and 4.5 as regression pins, not limits. They move when #543 retunes.
