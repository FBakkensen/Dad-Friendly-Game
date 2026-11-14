# Slice 1, the first village: design (14 Nov 2026)

Status: proposed. It waits for Flemming's yes or no. Nothing in it is built except the line it stands on (#536 to #539) and the save groundwork (#560, #561), which are in flight. Every number is a starting value for the lab, not a tuned one.

This design covers many slivers. After his yes it ships as its own PR and is split into sliver issues (`.claude/rules/superpowers.md`). It amends `2026-11-14-line-works-village-design.md` (the line spec): [What it changes in the line spec](#what-it-changes-in-the-line-spec) lists every place.

## Why

On 14 Nov 2026 Flemming saw the mock of the cage (#546) and was confused. It sent the whole crew to one level, it still had relics, and he could not see the plan. He then said three things:

1. "We probably want to dig multiple places at a time and adjust how many" (#648).
2. "We should develop in vertical slices. That way can I play the start of the game without everything is completed. This should be a general principle" (#649).
3. Earlier the same day: the pass to the kid must go (#642), and going deeper should be something he buys (#645). He also said he does not care about the existing version.

The road was built in layers over the whole old game: the line, then goods, then the village. The loop the design is about (the village asks, the works makes, the line feeds the works) was whole only after the third layer. Until then he would play in-between versions. He chose to rebuild the road as slices (#649, answer A).

Slice 1 is the first stretch of the road-to-Mars game with the whole loop in it, small. It is the start of the game, not a demo: every later slice adds to it and takes nothing back.

## Slice 1 in one page

A fresh mine. No relics, no pass to the kid, no bottom, and no depth to count.

| Stretch               | What he has                                                                                    | What is new                                                                        | The decision                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. The first evenings | The Topsoil, workers, carts, hoists, drills. Stones are the only good.                         | The line (the face, the haul, the lift) and the village's first order: the Beacon. | Widen the narrow stage, or send stones to the Beacon.                 |
| 2. The Beacon stands  | Kilns make bricks from the Topsoil's rock. The yard holds stones and bricks.                   | A made good, and time away that fills the yard and stops. The Granite has a price. | Kilns or line machines. The Storehouse first, or the shaft first.     |
| 3. The shaft is sunk  | Two levels. Saws make cut stone from the Granite's rock. Borers and pit trains cost cut stone. | Four gangs to share between the two levels.                                        | How many gangs on each level, and makers or gangs for the good short. |
| 4. The Forge's roof   | Three buildings stand. The Great Machine can be built.                                         | The slice's end card. Play goes on.                                                | What to do with the yard until the next slice.                        |

The loop: the village asks for goods, he decides what the mine digs and makes, and a finished building gives a lasting power and opens the next thing.

## Goals

- He plays the start of the real game on his phone, and it is complete in itself: every part of the loop is there.
- There is a decision in every sitting: the narrow stage, the order or the machines, makers or gangs, the yard.
- He shares the crew between levels and sets how many.
- Nothing moves on while he is away. A night fills the yard he sized and stops there. Only his tap delivers, buys or sinks.
- The two-minute sitting stays two minutes.
- Later slices add levels, goods, machines and buildings as rows. Nothing in slice 1 is a closed set.

## Non-goals

- No third level, and no good past cut stone. They are slice 2 and later.
- No second order at a time, no order choice, no market.
- No slider, and no roster of named workers. The gangs move with plus and minus.
- No village to walk around. The village is a drawer.
- No new engine, tileset or map.

## Anti-goals

- A chore before bed. If moving gangs every sitting is the best play, the slice failed.
- A trap. A share of the crew must never lose rock: what a maker cannot take is stacked as stones.
- A lock. No state may exist that he cannot leave with a free move or with goods he can still make.

## The rules

### 1. Levels, and no depth

1. The mine is a list of **levels**. Slice 1 has two: the Topsoil and the Granite. A level never runs out and never closes.
2. **Depth goes.** Nothing counts stones mined out of the mountain. There is no bottom, no "stones left" and no mined-out state.
3. **A level is opened by buying it** (#645). "Sink the shaft" is on the level card, with a real price in goods. The buy is instant and shows the arrival card that a new band shows today.
4. **A building is the door** (the line spec's band doors). The Granite can be sunk once the Beacon stands. The level below the Granite waits for the Forge and for slice 2.
5. What opened at a depth now opens with a level, a building, or a thing he owns:

| Thing                                       | Opens                                       |
| ------------------------------------------- | ------------------------------------------- |
| Mine cart                                   | once he owns twelve workers (the line spec) |
| Hoist                                       | once he owns a cart                         |
| Steam drill                                 | once he owns a hoist                        |
| Kilns, the yard                             | when the Beacon stands                      |
| The Granite's price                         | when the Beacon stands                      |
| Saws, tunnel borer, pit train, the Workshop | when the shaft reaches the Granite          |
| Engineers                                   | with the first borer, as today              |
| The Great Machine                           | when the Forge stands                       |

6. Prices that scaled with the band (upgrades, promotions) scale with the deepest level he has opened.

### 2. The line

The line is the line spec's step 1 as #536 to #539 build it: three stages, hands that fill in at the lowest, the stage bays, Buys by stage, engineers and trouble by stage. Slice 1 changes two things.

- **The rock no longer leans on a stage.** The line is the same on every level. "Tough on drills" and "Suits borers" go, and so does the band tag's advice. With the crew on several levels at once, a lean would give each level its own narrow stage, and the board could no longer give one answer to "what holds the line". What a level changes is what comes up.
- **The pit train opens with the Granite**, not with a third level. The paper check shows why: with carts as the haul's only machine, the haul holds the line for 9 to 18 sittings in a row.

### 3. Goods and makers

Three goods. Stones are the everyday good.

| Good      | Comes from                           | Buys                                                                                            |
| --------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Stones    | any level's rock that no maker takes | workers, carts, hoists, drills, kilns, upgrades, the stones part of a recipe, orders, the shaft |
| Bricks    | kilns, from the Topsoil's rock       | saws, yard levels, orders, the shaft                                                            |
| Cut stone | saws, from the Granite's rock        | borers, pit trains, the Great Machine, orders                                                   |

- **A maker takes one level's rock.** The rock a level's gangs dig goes to that level's maker, as fast as the maker can take it. One rock makes one brick or one cut stone. What the maker cannot take is stacked as stones.
- **A maker is bought like a machine** and has ownership marks. It takes no workers, no engineer, no gear and no trouble.
- **A level's good has two limits**: the rock its gangs dig there, and its maker. The level card says which one holds the good ("the kilns hold the bricks").
- **A price is a short list of goods** (#560). In slice 1 only the shaft and the orders ask for two goods.

### 4. The yard and time away

As the line spec's step 2, from the day the Beacon stands.

- The yard has one pile for each good. One yard level sets the room of all three, and "Extend the yard" (bricks) raises it. The next yard level never costs more than the brick pile holds.
- A full pile takes no more. Rock for it is stacked as stones. When the stone pile is full too, that flow stops. When nothing can flow, the crew rests.
- Taps, golden veins and the Gold rush always land, also on a full pile.
- A price above a pile's room reads "Needs a bigger yard".
- **Time away** runs at the resting pace (30%) until the yard is full. The clock cap goes. The welcome card says what came in and what stopped it.
- Before the Beacon stands there is no yard. The pocket has no room, and time away keeps today's rule (30%, eight hours), so the first evening is as simple as now.

### 5. The gangs

1. The crew works in **four gangs**. A gang is a quarter of the whole line: the hands and the machines together, not named workers.
2. Each gang works one open level. A level's rock a second is the line's speed times its gangs, divided by four.
3. With one level open, all four gangs are there and nothing can be moved.
4. When the Granite opens, two gangs go there and two stay. He is told once, by a teach note on the level plate.
5. He moves gangs on the level card with plus and minus. A move is free and instant, it is saved at once, and it holds while he is away.
6. The four gangs are always at work. Plus on a level takes a gang from the level that has the most. Minus gives one to the level that has the fewest. So no gang ever rests because of a tap, and with two levels a plus on one is a minus on the other.
7. The machines are one fleet. A machine bought once works for every gang.
8. Materials for the Workshop come from the level a gang digs: clay at the Topsoil, iron at the Granite, at today's rate for the rock dug there, each up to what its band gives in a run today (10 clay, 35 iron), and refilled up to that.

Why gangs and not a slider: four steps are enough to match an order, a step is a fat tap, and a number he can say ("three on the Granite") is easier to hold than a percent. More gangs can come later as a building's power, which gives a finer share when there are more levels.

### 6. The village

One order at a time. A building rises in three orders: footings, walls, roof. Its last order gives its power and opens the next thing, in the moment a relic's reveal has today.

| Building       | Asks for          | Power (the relic's, as approved) | Opens                                              |
| -------------- | ----------------- | -------------------------------- | -------------------------------------------------- |
| The Beacon     | stones            | Golden veins come 40% sooner     | Kilns, the yard, and the Granite's price           |
| The Storehouse | stones, bricks    | The yard holds twice as much     | nothing more                                       |
| The Forge      | bricks, cut stone | The Great Machine can be built   | The level below, in slice 2. The slice's end card. |

- The order is on the board from the first minute: the top plate's tag names it.
- **He delivers.** Each good has its own Send, which sends what the pile holds, up to what the order still needs. Part deliveries count.
- What comes next stays vague: the next building is a hint in the village's words, never a list.
- The Storehouse can be built before or after the shaft is sunk. Both ask for bricks, so which comes first is his call.
- The names are the line spec's suggestions. Names, lines and pictures are his to approve when they are built.

### 7. The end of the slice

When the Forge's roof is on, a card says the first village stands and that the road goes on. The Great Machine is on sale, so cut stone still has a use. He can play on: nothing stops, and nothing new comes until slice 2. When slice 2 lands, a save keeps its place if the save's shape allows it. If it cannot, the issue, the PR and the chat say "Resets the save" first.

## What he sees

The mock is `mockups/slice-1/shots/` (six pictures, the 424×924 phone at 2x). It is drawn on today's board with art that exists. The buildings, the kilns and the saws have no pictures yet, so no picture shows one.

- **`start.png`, the first evening.** The top plate, where the relics were, holds the open order: "The village asks for 150K stones", what is sent, and a bar. Its tag names the order.
- **`shaft.png`, the Beacon stands.** The top plate now holds the yard's two made piles, each with its room. The stone pile's room stands beside the odometer's legend. The level card has the Topsoil's row and the Granite's price with "Sink the shaft".
- **`board.png`, two levels.** The band tag is the level plate: "Topsoil 2 · Granite 2". The gauge reads rock a second. The bays are the approved stage bays.
- **`levels.png`, the level card.** One row for each level: its gangs with minus and plus, its rock a second, its good and what holds it, and its stones. The level below is a hint.
- **`order.png`, the order.** A row for each good the order asks for, with what is sent, a bar and Send.
- **`welcome.png`, a night.** What came in, when each pile filled, and that the rock was stacked as stones after that.

Left to the builder and a later mock: Buys with a group for the works and prices in three goods, the buildings in the drawer and on the reveal, the end card, the Ledger without relics, and where the boost dial's clock goes now that no clock ends a night.

## What goes, and what stays

**Goes:** the relics, their plate, shelf, reveal pictures and Ledger rows; the Lantern's guide bar (the order takes its place); the pass, Legacy, kid runs, Grandpa and the generations lab (#642); depth, the mountain's size and bottom, "stones left", the mined-out state; the band tag's advice and the rock's lean; the away clock once the yard is open; relic glimmers from expeditions; kid workers until the building that brings them back.

**Stays:** taps, golden veins and the Gold rush; workers and the six machines of the line; ownership marks; upgrades; the Workshop and its gear; engineers, expeditions and trouble; the key rail, the drawers and the board's look; one save for each Google account and everything in `observable-saves.md`.

**Keepsakes** stay as expedition finds. Their page moves from a relic's page to the village drawer.

## Starting numbers

All for the lab to set. They are the numbers the paper check played.

| Thing                      | Price                                                                                              | Does                       |
| -------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| Worker, cart, hoist, drill | as #543 set them (60, 600, 6,000, 73,080 stones; ×1.06 and ×1.219)                                 | as the line spec           |
| Kiln                       | 15,000 stones, ×1.219                                                                              | 12 bricks a second         |
| Saw                        | 25,000 bricks, ×1.219                                                                              | 30 cut stone a second      |
| Tunnel borer               | 40,000 cut stone, ×1.219                                                                           | rated 1,071, eight workers |
| Pit train                  | 60,000 cut stone, ×1.219                                                                           | rated 1,600, eight workers |
| The shaft to the Granite   | 10M stones and 1.5M bricks                                                                         | opens the Granite          |
| The yard                   | level 0 holds 3M stones, 500K bricks, 250K cut stone; a level triples it and costs 150K bricks, ×3 | room for a night           |
| The Beacon                 | 150K, 1.5M, 6M stones                                                                              |                            |
| The Storehouse             | 8M stones and 1M bricks; 15M and 4M; 12M bricks                                                    |                            |
| The Forge                  | 15M bricks and 4M cut stone; 20M and 15M; 30M and 40M                                              |                            |
| The Great Machine          | cut stone, set by the lab                                                                          | the lift's second machine  |

## Paper check

A rough model, not the game's lab: `slice-1/slice1-model.py` in the project's shared files. It plays the rules above with these numbers and a plain dad who buys line machines that pay back within six hours, buys makers when they hold their good, extends the yard when a pile is nearly full, and sends the rest to the order.

| Dad                 | Slice ends | The share left at two and two | One level at a time (the old cage) | Three gangs on the Granite | Longest run of sittings on one narrow stage |
| ------------------- | ---------- | ----------------------------- | ---------------------------------- | -------------------------- | ------------------------------------------- |
| Check-in, 4 × 2 min | day 4.8    | day 4.8                       | day 7.0, 20 moves in 29 sittings   | day 5.0                    | 11                                          |
| Casual, 2 × 10 min  | day 5.5    | day 5.5                       | day 10.0, 17 moves in 21 sittings  | day 7.0                    | 6                                           |
| Evening, 1 × 20 min | day 9.0    | day 9.0                       | day 15.0, 14 moves in 16 sittings  | day 12.0                   | 5                                           |

What it shows:

- **The slice takes about five to nine days** with these numbers. The casual dad raises the Beacon on day 1.5, sinks the shaft on day 2.5, and has the Storehouse on day 4 and the Forge on day 5.5.
- **Sharing beats one level at a time.** A dad who moves the whole crew between the levels, as the cage did, needs 45 to 80% more days and moves at most sittings. That is the chore the anti-goal names.
- **The share matters, and it is not a chore.** Three gangs on the Granite cost 4 to 33% more days than two and two. One gang there ends half a day sooner for the check-in dad and a day later for the evening dad. A dad who changes the share only when it brings the next need 15% sooner ends on the same day as two and two. So the share is set a few times in a slice. The decisions of every sitting are the narrow stage, the order or the machines, and makers or gangs.
- **The narrow stage needs the pit train.** Without it the haul holds the line for 9 to 18 sittings in a row. With it the longest run is 5 to 11, and the lift, which has only hoists until the Forge, is the stage that sticks.
- **Nights end at the yard**: about half the long nights, after 16 to 45% of the night. That is too early. The yard's room, or what a level adds, has to grow.
- **A dead end exists and is not a lock.** All four gangs on the Granite with no saws makes no bricks, and saws cost bricks. A free move leaves it. The level card must say it: "No saws yet. The rock is stacked as stones."

What it does not prove: anything about fun, the first hour's pace, the Workshop, engineers, upgrades, or the Great Machine. The lab has to play the slice before any of it is switched on.

## Against the dad-friendly rules

| Rule                       | How the slice meets it                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Two minutes                | A sitting is a few buys, a Send and at times a move of gangs. Every choice holds until changed. |
| Never punishing            | No rock is lost to a bad share. A level never closes. A move is free.                           |
| Close is pause             | Every tap is saved at once. Time away is worked out from timestamps and the pile-full moments.  |
| Real numbers for decisions | Prices, rooms, each level's rock and goods a second, what an order still needs.                 |
| Vague discoveries          | The next building and the level below are hints.                                                |
| The phone never scrolls    | The top plate and the band tag are reused. Cards and drawers scroll inside.                     |
| No placeholders            | The mock uses art that exists. New pictures are asked for before they are made.                 |

## Risks

1. **The lift sticks.** It has one machine until the Forge. The lab measures `narrowRun`. The levers are the hoist's marks, a gear for the hoist, or the Great Machine one building earlier.
2. **The share is set once and forgotten.** The model's dad hardly moves it. If play shows the same, orders can lean harder on one good, and a full pile already makes yesterday's share wrong.
3. **Three goods on a small board.** The top plate holds two piles. A fourth good needs a new answer, in slice 2.
4. **The game is short for a while**: it ends at the Forge until slice 2 is built.
5. **A lot goes at once**: relics, the pass, depth. Each is its own sliver, and the game boots after every one.
6. **Cut stone has few uses before the Forge**: borers and pit trains. The lab checks that it never piles up dead.
7. **The paper model is rough.** Its dad stops buying line machines when they pay back slower than six hours, so the line's late growth is too flat.

## Calls I made

These are mine, not Flemming's. Any of them can be turned over.

1. Depth goes. A level is a place he buys, and a building is its door (#645).
2. The slice has three goods, two makers, two levels and three buildings. My first sketch had bricks alone and two buildings. With the shaft bought, the lower level needs a good of its own, or sharing the crew is no decision.
3. Saws come with the Granite, not one level later.
4. Four gangs. Plus takes from the level with the most, minus gives to the level with the fewest.
5. Two gangs go to the Granite when it opens.
6. The rock's lean goes. This turns over the band table he approved (decision D3), because of the shared crew.
7. The pit train opens with the Granite, and the Great Machine with the Forge.
8. Borers and pit trains cost cut stone. Saws, the yard and the shaft cost bricks.
9. The Beacon opens the kilns and the yard as well as the Granite's price.
10. The top plate holds the order before the yard opens, and the two made piles after it, with the order on its tag.
11. The village is a drawer. No picture of the whole village in this slice.
12. The gauge reads rock a second.
13. Which copy of a save is ahead: the one that has dug more rock in all, a count that only grows, else the newer `lastSeen`. Runs are gone.
14. The first evenings keep today's eight-hour clock, until the yard opens.
15. Kid workers wait for the building that brings them (the School, a later slice).

## What it changes in the line spec

- "The levels and the cage": replaced by rules 1 and 5 here. The cage issues (#545 to #548) are closed as not planned.
- "The rock moves the narrow stage too": the lean goes (call 6). #536 turns the line on with the lean, as #543 tuned it. A slice 1 sliver takes it out, and the lab sets the numbers again.
- Step 2 ("The cage is the lever", "a maker opens one band after its rock") and step 3 ("Six buildings", "Buildings open the bands", "The end of a run"): slice 1 builds its part of each, with the changes above. The rest waits for its slice.
- Decisions 12 and 19 (the kid inherits the village) go with the pass (#642).
- `observable-saves.md`: "a later run, else more stones mined" becomes "more rock dug in all" (call 13).

## How it would be built

After his yes, this spec ships as a PR, and slice 1 is split into sliver issues under #530. The line (#536 to #539) and the save groundwork (#560, #561) go on unchanged. A sketch of the order, each line one sliver or more:

1. The lab plays slice 1's rules, off in play, and sets the numbers (as #534 and #543 did for the line).
2. The pass, Legacy, kid runs and Grandpa go (#642). **Resets the save.**
3. Levels take depth's place: no bottom, the Topsoil alone, and what opened at a depth opens as the table above says. The save counts rock dug in all.
4. The Beacon's orders take the relics' place: the top plate, the order card, the reveal. The relics go in the same sliver, so the story never has a hole.
5. Kilns, bricks and the yard, with time away that fills the yard and the new welcome card.
6. The shaft is bought: the level card, the Granite, saws, cut stone, borers and pit trains in goods.
7. The gangs.
8. The Storehouse and the Forge, the Great Machine at the Forge, and the end card.

A plan keeps each screen's browser checks green in the sliver that changes that screen. `docs/DESIGN.md`, `docs/design-intent.md`, `docs/ARCHITECTURE.md`, `docs/ui-audit.md`, `.claude/rules/observable-saves.md` and the github-issues skill's road section are updated by the slivers that change what they describe.

## Lab

- The strategy lab plays slice 1 from a fresh mine to the Forge's roof. One player type shares the gangs by need. One leaves them at two and two. One moves the whole crew, to keep the old cage's cost in view.
- Named measures, report-only at first: `sliceDays`, `narrowRun`, `shareMoves` a sitting, `nightFull` (how many long nights end at a full yard, and how far into the night), and `deadGood` (time a pile is full with nothing to spend it on).
- The generations lab goes with the pass.
- The finish bounds in `src/lab/targets.ts` are Flemming's. The first number to ask him for: how many days slice 1 should take the casual dad at least.

## Art (PixelLab, asked for before each)

Seven small pictures, each asked for with its prompt and size before it is made, one a sitting:

- The Beacon, the Storehouse and the Forge, for the drawer and the reveal.
- A kiln and a saw, for Buys.
- A brick and a cut stone, for piles and prices.

Everything else the slice shows exists: the machines, the two mine windows, the plates, cards and lamps.
