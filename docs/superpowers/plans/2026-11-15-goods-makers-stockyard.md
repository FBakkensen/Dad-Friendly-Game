# Goods, makers and the stockyard, off in play (#666)

Slice 1, part 2's rules (spec `docs/superpowers/specs/2026-11-14-slice-1-design.md`, rules 2, 3, 4 and 6, and The save). Off in play: nothing on his phone changes. The lab (#667), the refinery's screen (#671) and part 2's switch-on (#672) build on it.

Agent-run sitting: the design calls below are the thread's rulings, recorded on the issue and in the PR body.

## The switch

A new sweep factor, `part2.off`, in its own leaf (`src/part-switch.ts`). `partTwoOn()` is true only when the fresh mine is on and the factor reads 0. The lab sets it; #672 turns it on in play. With it off, every rule below is inert: the Light Tower opens nothing, there is no stockyard, the eight-hour clock stays, and the Warehouse is not the next building.

## The rules, and the module each goes into

| Rule                                                                                                                           | Module                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brick is a good (rule 3)                                                                                                       | `src/stock.ts`: `brick` joins `GoodId`, `Stock` and the goods table                                                                                  |
| The kiln: bought like a machine (15,000 stone, ×1.219), 12 brick a second, runs with one worker (rule 2.7, rule 3)             | new `src/makers.ts` (a table like the vehicles')                                                                                                     |
| The kilns are a job, open with the Light Tower in part 2                                                                       | `src/workforce.ts`: `kilns` joins `JOB_IDS`; `jobOpen` refuses a move onto a job that is not open                                                    |
| Rock waits at the kilns in their own pile, and what the kilns cannot take bypasses to stone (rule 2, rule 3)                   | `src/piles.ts` gets a spill: a pile that is full passes its overflow to a side pile. `src/mine-piles.ts` builds the mine's chain with it             |
| The stockyard: one level, room for each good, "Expand the stockyard" in brick, the Warehouse doubles the room (rule 4, rule 6) | new `src/stockyard.ts`                                                                                                                               |
| A full stockpile stops production; rock for a full brick stockpile bypasses to stone (rule 4)                                  | the mine's chain: the stone stockpile is the spill, the brick stockpile the kilns' pile                                                              |
| Transport takes from the stockpiles while the mine fills them                                                                  | `src/transport.ts`: `stockDraw`, what transport takes from each stockpile a second, is the chain's drain                                             |
| A night runs at the night shift output until the stockyard is full, with no clock once it is open (rule 4)                     | `src/mountain.ts`'s night: the clock only before the stockyard; the report says when each stockpile was full and that the stockyard stopped the mine |
| The Warehouse: stone and brick, power ×2 room; the next building only in part 2 (rule 6)                                       | `src/city.ts`: a row with a `part`, `nextBuilding` reads the switch                                                                                  |
| The save: makers, the stockyard's level, brick, the kiln job and the kiln pile                                                 | `src/save-format.ts` and the ledger: two new keys; the rest rides on the id lists                                                                    |

## Rulings

1. **The kilns' pile.** Flemming's rule of 15 Nov (every part runs on its own) gives the kilns a pile in front of them: "rock at the kilns", 300 like the mine's piles, for the lab to set (#667). It has room only while he owns a kiln. Hoisting fills it first; when it is full, what it lifts bypasses to the stone stockpile. A kiln with nobody on it is idle and its pile stays full.
2. **The spill is general.** `src/piles.ts` stays the one place that moves goods through piles. A chain may name one pile whose overflow, while it is full, goes to a side pile with a room and a drain. The side pile full stops the stage before at what the next stage and the drain take, as any full pile does.
3. **The stockpiles are piles.** The stone stockpile is the spill, the brick stockpile is the pile after the kilns, each with the stockyard's room (no limit before the stockyard opens). Transport's take on each good during a stretch is its drain, worked out from the order at the start of the stretch. A stretch splits where a pile fills or empties and where a step is built in, as now. What transport actually takes is still `deliver`'s; if it takes less than the drain, the stockpile may end above its room, which the rule calls full: nothing is taken away.
4. **No ownership marks on the kiln yet**, as for the horse wagon: the marks come with the screen that shows them.
5. **The moves (buy a kiln, expand the stockyard) are rules functions here.** Listing them as lab moves and in the Ledger comes with the lab (#667) and the refinery's screen (#671), which own their words.
6. **Words not yet shown.** The name tables that need an entry for a new id get the approved names ("Brick", "Kilns", "The Warehouse") and "Rock at the kilns". None is on screen until #671, which asks him first.
7. **Promotions stay in stone.** The spec moves them to brick; that is a price change on a screen, for #671 or the lab.

## Tests first

- `src/piles.test.ts`: the spill: overflow goes to the side pile while the pile is full, the side pile full caps the stage at the next stage plus the drain, an over-room side pile takes nothing.
- `src/makers.test.ts`, `src/stockyard.test.ts`: prices, room, the Warehouse's power, "never costs more than the brick stockpile holds", what opens when.
- `src/part-two.test.ts`: kilns make brick from the hoisted rock, overflow to stone, full brick bypasses to stone, full stone and brick stop the line; property tests: no rock lost while the stone stockpile has room, nothing taken from a stockpile over its room; the night with no clock once the stockyard is open, ending when it is full; a roof at night that opens the stockyard; the Warehouse ordered with stone and brick and its power.
- Part 2 off: every existing fresh-mine test passes untouched.

## Proof

The test files, then `npm run gate -- fast`. Nothing the player sees changes, so no visual section or play run is needed. The full gate on the final commit, after #664 has merged.
