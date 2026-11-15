# Slice 1, the first city: design (14 Nov 2026)

Status: approved for its PR. Flemming agreed to the rules in principle (14 Nov 2026, 19:30Z), amended them three times the same evening, and said "That is right" to the playable prototype that plays them (21:35Z). The names are approved. It stands on the line (#532 to #535 and #543 are merged, behind their switch) and on the save groundwork (#560 is merged, #561 is open). #536, which would have turned the line on in today's game, is closed as not planned (Flemming, 14 Nov 2026, 21:47Z: nothing more is built on today's version), so the line is turned on with part 1 (#664). The fresh mine's rules are built off in play, behind the `fresh.off` switch (#653). The workers' rules were changed on 15 Nov 2026 (one workforce, below), and he said "This is great" to the screens that show them (09:53Z). Every number is a starting value for the lab, not a tuned one.

**Amended 14 Nov 2026, 20:30Z.** Flemming: "The golden veins as they were should go, something the player should click as it was, do not fit road to Mars." Golden veins go, and the Gold rush goes with them (a vein's tap starts it). The Beacon (now the Light Tower) had a power about veins, so a new one is proposed below. He also asked for playable prototypes in place of mock pictures: the slice 1 prototype is in `prototypes/slice-1/` on branch `claude/project-thread-eextfa`, and it settles the screens ([What he sees](#what-he-sees)).

**Amended 14 Nov 2026, 20:42Z.** Flemming on the prototype's second version: "This is good, but the red button for the player to mine, do not fit the new road to mars, and some naming needs to change, this an engineering game, one example is gang. That is wrong, there are more." So manual digging goes: there is no dig button and no tap that mines. The player's hands are an engineer's: assign crews, add capacity, order projects and work orders. And the game takes an engineering vocabulary: see [Names](#names-approved-14-nov-2026).

**Amended 14 Nov 2026, 21:03Z.** Flemming on the prototype's third version: "I think the names are right, Yes production should stop when stock is full, but the click to ship to the workshop and city is wrong. The order is by the player, and then do the resources transfer on a speed. Probably something that can be upgraded, like moving from horse to truck, trains maybe, upgraded etc. And the time it takes to build is controlled by the resources not a fixed time". So:

- The names are approved, and this document now uses them throughout.
- A full stockyard stops production. That is rule 4 as it was written, now with his yes.
- No tap delivers goods. He orders a project or a work order, and transport carries the goods there at a speed he can raise, from horse wagons to trucks, and trains later.
- Nothing has a fixed build time. A thing is built when its goods have arrived.

The new rule is [Transport and build time](#7-transport-and-build-time). His four decisions are its first four lines. How slice 1 does them is mine, and is listed under [Calls I made](#calls-i-made).

**Approved 14 Nov 2026, 21:35Z.** The prototype's fourth version plays rule 7 from the first evening: he orders a building once, one fleet delivers, the order says its limit and can be put on hold, nights keep delivering, and a work order is done when its materials are there. Flemming: "That is right". With that the screens are settled, and [What he sees](#what-he-sees) is written from that version.

**Decided 15 Nov 2026, 05:12Z.** Two calls were open and were his, and he answered both with "A, a". The workers stay: he hires them, and the mine gets a workforce plate, which he plays in the prototype's next version before it is built. And the five-day rule counts for the whole slice only, not for each part. See [His two calls](#his-two-calls-decided-15-nov-2026).

**Amended 15 Nov 2026, 07:30Z: one workforce, and a page that gives no answers.** He played the workforce plate in the prototype's versions 5 to 9 and changed two things.

- **The page never gives the answer** (05:45Z and 05:47Z, as a principle for the whole game). It does not name the bottleneck, a limit or a best buy. It shows the numbers: how many workers and machines each part has, what each adds, and what each part moves now. The player who works the balance out gets the advantage. He did not understand "hands" or "by hand" (05:32Z and 06:57Z), so neither is used. He also asked to see what is idle (06:22Z): "it should be visible that something is idle, when there is overcapacity in one part, or some internal buffer is full, and the same for transport".
- **The workers are one workforce** (06:57Z): "workers should be a global ressource, that should be used for almost anything, like transport, operating, drillings, building, and they should have a maintainance cost. but could be that the maintainence cost should go later". He played it in version 9 and said "the workers do as expected" (07:30Z).

The new rule is [The workforce](#2-the-line-and-the-workforce), and rules 1, 3 and 7 follow it. What is his and what is mine in it is under [Calls I made](#calls-i-made). The screens followed the same morning (below).

**Approved 15 Nov 2026, 09:53Z.** On the prototype's eleventh version: "This is great, just one thing, hiring of workers is locked to the mining page, that indicates to the player this is only for mining, it should be a global place". So the screens are settled again, with one change: hiring leaves the mine for a global place. Where that place is, is the prototype's (call 43): its twelfth version, which is the eleventh with that change, puts the hire key in the top row of every site, beside the count of workers. He was shown that version in the project chat, with the city's picture, as the change he asked for, and has not answered on the place by name. [What he sees](#what-he-sees) is written from the twelfth version.

**Amended 15 Nov 2026, 13:19Z: every part runs on its own, and the mine starts with one worker** (#703). Flemming, 13:15Z: "the start should be with basicly one worker, the player must then in the start shift him around, this is a good way to get an introduction to the different roles, and also get the satisfaction of buying additional workers that does a difference". Then, on the stages: "each should have internal buffers/stock, that decides how much can me mined before haulage is needed, and the hoist has a limit on how much it can lift, then can that much be haulages to the lift. they should not work in sync." And at 13:19Z: "that is a general rule, not only in the mine, each part is individual, and operates individual". So rock waits in a pile between the line's stages, every part of the game follows the same rule ([Every part runs on its own](#2-the-line-and-the-workforce)), and a fresh mine starts with one worker (rule 2.10).

**Amended 15 Nov 2026, 18:44Z: workers and machines belong to a level, and the hoists travel.** He played the prototype's versions 13 and 14, which play part 2 by the two rules above and drilling as one job on each level, and answered both at 17:42Z: "much is good. but", with six points.

1. "mine: not everything should require the same amount of workers to match, there should possible be most miners, less to haulage and even less to haulage." The last word is read as hoisting.
2. "mine: if there is two levels, should the hoist be able to serve both levels. but only one at a time, so must run down to one level then up, then down to the next."
3. "mine: hoist should only deliver it ressources to the global storage when at the top"
4. "mine: workers for haulage should not be split automatic, these are assigned"
5. "mine: hoist should also be able to be dedicated, but can split as described above, if all hoists are dedicated to one level is the others not served"
6. "refinery: these recipies should probably not be 1:1 and all recipies should adjusted in some balancing, but we can start to show recipies"

Version 15 built the six. On its key that kept a hoist to one level (18:09Z): "it should not be "hoists only here" but just a number that assign no.of hoists to a level". Version 16 has that number. He answered "a" to its question (18:16Z): the hoists he has not assigned serve both levels in turn. Then, on the rules (18:19Z): "yes, but the ui of that part needs an overhaul". Version 17 is that overhaul, and he answered "a" to it (18:44Z): one strip under the Hoisting row assigns the hoists.

So the four crews go. Rule 5 is written again as [The levels and the hoists](#5-the-levels-and-the-hoists), rules 2, 3 and 4 follow it, and the mine with two levels, the refinery's plates and the card for a level are written from version 17 ([What he sees](#what-he-sees)). What is his and what is mine in it is under [Calls I made](#calls-i-made). From here on this document says "crews" only where it tells what was. What is mine in it is calls 54 to 73.

This design covers many slivers. It ships as its own PR and is split into sliver issues (`.claude/rules/superpowers.md`). It amends `2026-11-14-line-works-village-design.md` (the line spec): [What it changes in the line spec](#what-it-changes-in-the-line-spec) lists every place.

## Why

On 14 Nov 2026 Flemming saw the mock of the cage (#546) and was confused. It sent the whole crew to one level, it still had relics, and he could not see the plan. He then said three things:

1. "We probably want to dig multiple places at a time and adjust how many" (#648).
2. "We should develop in vertical slices. That way can I play the start of the game without everything is completed. This should be a general principle" (#649).
3. Earlier the same day: the pass to the kid must go (#642), and going deeper should be something he buys (#645). He also said he does not care about the existing version.

The road was built in layers over the whole old game: the line, then goods, then the village. The loop the design is about (the village asks, the works makes, the line feeds the works) was whole only after the third layer. Until then he would play in-between versions. He chose to rebuild the road as slices (#649, answer A).

Slice 1 is the first stretch of the road-to-Mars game with the whole loop in it, small. It is the start of the game, not a demo: every later slice adds to it and takes nothing back.

This section keeps the words of that day (the village, the works, the crew as all the workers). The rest of the document uses the approved names.

## Slice 1 in one page

A fresh mine. No relics, no pass to the kid, no bottom, no depth to count, and nothing that is mined or delivered by a tap.

| Stretch                           | What he has                                                                                                                                                               | What is new                                                                                       | The decision                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1. The first evenings             | The Topsoil, workers, carts, hoists, drills, horse wagons. Stone is the only good.                                                                                        | The line (drilling, haulage, hoisting), transport, and the city's first project: the Light Tower. | Where the workers work, a worker or a machine, more transport, or the project on hold.                               |
| 2. The Light Tower is operational | Kilns make brick from the Topsoil's rock. The stockyard holds stone and brick.                                                                                            | A made good, and a night shift that fills the stockyard and stops. The Granite has a price.       | Kilns or line machines. The Warehouse first, or the shaft first.                                                     |
| 3. The shaft is sunk              | Two levels. Saws make cut stone from the Granite's rock. Borers and locomotives cost cut stone. The factory takes work orders. Trucks, once the Warehouse is operational. | A second level with its own workers and machines, and hoists that travel between the two.         | How many workers and machines on each level, which level a hoist serves, and makers or more rock for the good short. |
| 4. The Foundry's roof             | Three buildings are operational. The winding engine can be built.                                                                                                         | The slice's end card. Play goes on.                                                               | What to do with the stockyard until the next slice.                                                                  |

The loop: the city requires goods, he decides what the mine digs, what it makes and how fast it is carried, and a finished building gives a lasting power and opens the next thing.

## Goals

- He plays the start of the real game on his phone, and it is complete in itself: every part of the loop is there.
- There is a decision in every sitting: where the workers work, the bottleneck, the project or the machines, transport, makers or more rock, the stockyard.
- The workers are one workforce. He sees how many there are, where they work and how many are free, and he moves them.
- The page shows the numbers and never the answer. Working out the balance is the game.
- He puts workers and machines on each level and sets how many, and he says which level a hoist serves.
- Nothing is started while he is away. A night fills the stockyard he sized and stops there, and transport carries on only with what he ordered. Only his order starts a project or a work order, and only his tap buys or sinks.
- He is an engineer. Nothing is mined by a tap and nothing is delivered by a tap.
- The two-minute sitting stays two minutes.
- Later slices add levels, goods, machines and buildings as rows. Nothing in slice 1 is a closed set.

## Non-goals

- No third level, and no good past cut stone. They are slice 2 and later.
- No second project at a time, no project choice, no market.
- No routes, no map, and no vehicle to dispatch. Transport is one number he raises.
- No slider, and no roster of named workers. Workers are moved and hoists are assigned with a tap: one, or the amount the amount key is set to.
- No machine is moved between levels. It stays on the level it was bought for (call 55).
- No upkeep for workers. He named it as a possible later step (15 Nov 2026), and it is an idea for a later slice.
- No city to walk around.
- No new engine, tileset or map.

## Anti-goals

- A chore before bed. If moving workers or hoists every sitting is the best play, the slice failed.
- An answer on the page. If a plate says which stage to fix or which thing to buy, there is nothing left to work out.
- A trap. Where he puts the workers must never lose rock while the stone stockpile has room: what a maker cannot take bypasses to stone.
- A lock. No state may exist that he cannot leave with a free move or with goods he can still make. A worker can be taken off any job and put on any open job, free.

## The rules

### 1. Levels, and no depth

1. The mine is a list of **levels**. Slice 1 has two: the Topsoil and the Granite. A level never runs out and never closes.
2. **Depth goes.** Nothing counts stone mined out of the mountain. There is no bottom, no "stones left" and no mined-out state.
3. **A level is opened by buying it** (#645). "Sink the shaft" is on the level's row, with a real price in goods. The buy is instant and shows the arrival card that a new band shows today.
4. **A building is the door** (the line spec's band doors). The Granite can be sunk once the Light Tower is operational. The level below the Granite waits for the Foundry and for slice 2.
5. What opened at a depth now opens with a level, a building, or a thing he owns:

| Thing                                       | Opens                               |
| ------------------------------------------- | ----------------------------------- |
| Mine cart, hoist, steam drill               | from the first evening (rule 2.6)   |
| Horse wagon                                 | from the first evening              |
| Kilns, the stockyard                        | when the Light Tower is operational |
| The Granite's price                         | when the Light Tower is operational |
| Truck                                       | when the Warehouse is operational   |
| Saws, tunnel borer, locomotive, the factory | when the shaft reaches the Granite  |
| Engineers                                   | with the first borer, as today      |
| The winding engine                          | when the Foundry is operational     |

6. Prices that scaled with the band (upgrades, promotions) scale with the deepest level he has opened.

### 2. The line and the workforce

The line is the line spec's step 1 (its rules are #532 to #535): three stages, drilling, haulage and hoisting. Over time, once the piles between the stages settle, the slowest stage sets what the line moves. Engineers and trouble belong to a stage. Slice 1 changes five things.

- **The rock no longer leans on a stage.** A machine moves the same on every level. "Tough on drills" and "Suits borers" go, and so does the band tag's advice. The lean went on 14 Nov 2026, when the levels shared one line, so that the line's three numbers were the whole picture. Since 15 Nov 2026 each level has its own drilling and haulage (rule 5), and the lean still stays out (call 67). What a level changes is what comes up and how far the cage travels.
- **The locomotive opens with the Granite**, not with a third level. The paper check shows why: with carts as haulage's only machine, haulage is the bottleneck for 9 to 18 sittings in a row.
- **The workers are one workforce**, below. In the line spec the workers spread themselves to the slowest stage, and the cart waited for twelve workers. Both go.
- **Every part runs on its own**, below. In the line spec the three stages moved in step. Now rock waits in a pile between them (#703).
- **Workers and machines belong to a level, and a hoist is a cage that travels** (rule 5). In the line spec one line worked whichever level the cage was sent to.

**Every part runs on its own.** Flemming, 15 Nov 2026, 13:18Z: "each should have internal buffers/stock, that decides how much can me mined before haulage is needed, and the hoist has a limit on how much it can lift, then can that much be haulages to the lift. they should not work in sync." And at 13:19Z: "that is a general rule, not only in the mine, each part is individual, and operates individual".

Every part of the game is its own unit, with its own rate and a pile in front of it. A part works while there is something in its pile and room in the next one. It stops when its pile is empty or the next pile is full, and it never waits on another part's rhythm. One mechanism serves every chain:

| Chain                  | The parts and the piles between them, in order                                                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The mine               | drilling, then the drilled rock, then haulage, then the rock at the shaft, then hoisting, then the stockpile (the pocket in part 1). Each pile holds a set amount (Starting numbers). With two levels each level has its own drilling, drilled rock, haulage and rock at the shaft, and the hoists serve both (rule 5) |
| Transport and building | the stockpile, then transport, then the building site (rule 7.8), then the builders. It ran this way before #703 (#654, #690)                                                                                                                                                                                          |
| The refinery           | what a cage unloads, then the maker's own pile of rock, then the maker, then its good's stockpile (rule 3)                                                                                                                                                                                                             |
| The factory            | follows the same rule when it is built (part 3)                                                                                                                                                                                                                                                                        |

In the mine, drilling stops when the drilled rock is full. Haulage stops when the drilled rock is empty or the shaft pile is full. Hoisting stops when the shaft pile is empty. Each stage moves at most its own rate (rule 2.5). Once the piles settle, the stockpile grows at the slowest stage's rate, as it did when the stages moved in step: that is the steady line, and an order's numbers and the lab read it. A pile is what lets a stage with nobody on it catch up later, so one worker moved from stage to stage makes stone. A pile that holds more than its room, for any reason, is full: nothing is taken away, and the stage before it waits until it is under its room again. The piles are saved with the fresh mine. Over a night they are worked out exactly, in stretches where a pile fills or empties. From part 3 hoisting is cages, with one level as with two: rock comes up a load at a time and is in stock when the cage is at the top (rule 5).

**The workforce.** Flemming, 15 Nov 2026: "workers should be a global ressource, that should be used for almost anything, like transport, operating, drillings, building". And on the prototype's ninth version, which plays the rules below: "the workers do as expected".

1. **One workforce.** Every worker is in one pool. A worker is on a job, or free.
2. **He hires a worker**, who starts free. The price is in stone and rises with the number of workers he has. It is one price, whatever job the worker goes to.
3. **A job is where workers work.** A job opens with the thing it works on:

| Job                                               | Opens                                                                         | What a worker does there                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Drilling and haulage, one of each for every level | the Topsoil's from the first evening, the Granite's when the shaft reaches it | runs a machine of that stage on that level, or works with a tool there |
| Hoisting                                          | from the first evening                                                        | runs a hoist, or works the winch (rule 5)                              |
| Driving                                           | from the first evening                                                        | drives one vehicle                                                     |
| Building                                          | from the first evening                                                        | builds in what is on the building site (rule 7)                        |
| The kilns                                         | when the Light Tower is operational                                           | runs one kiln                                                          |
| The saws                                          | when the shaft reaches the Granite                                            | runs one saw                                                           |

4. **He moves one worker at a time**: a free worker onto a job, or a worker off a job. A move is free and instant, it is saved at once, and it holds while he is away. Nothing moves a worker for him, at any time. That is how he played it, with a few dozen workers. At the game's numbers a tap hires or moves the amount the amount key is set to (call 49).
5. **A stage's workers run its machines.** A machine takes a set number of workers and is idle until its stage has them. The stage's other workers work with a tool: a pick, a barrow or a winch. A stage moves what its running machines and its workers with tools move together, and the line moves what its slowest stage moves. That is the steady line, once the piles settle: over a stretch each stage moves what its piles let it (Every part runs on its own, above). Which machines run is not his to set: the workers run the machines that together move the most, and stay on their tools where that moves more. So one more machine or one more worker never lowers what a stage moves. In the prototype that is the strongest machines first, which is the same with its numbers. Drilling and haulage are a stage on each level: a level's workers run that level's machines (rule 5).
6. **A machine can be bought before anyone can run it.** Nothing gates a machine but its price and where it opens (rule 1). The cart no longer waits for twelve workers, and the hoist and the drill no longer wait for the machine before them.
7. **A vehicle runs with one driver, and a kiln or a saw with one worker.** The drivers take the trucks first. One with nobody on it is idle.
8. **A machine, a vehicle or a maker that is idle is not lost.** It runs from the moment its job has the workers. This is what keeps a wrong buy from being a punishment, now that no worker moves by himself.
9. **A free worker does no work and costs nothing.** There is no upkeep in slice 1. What counts workers counts all he has, free or not: the worker's price, the worker marks, and a door that opens at a number of workers. Work boots and the worker marks lift a worker with a tool on the three stages. They do not lift a machine, a driver or a builder. Loading crews counts the workers on haulage. A promotion takes a free worker.
10. **A fresh mine starts with one worker, on drilling** (#703). The horse wagon is given, and nobody drives it or builds. Flemming, 15 Nov 2026, 13:15Z: "the start should be with basicly one worker, the player must then in the start shift him around, this is a good way to get an introduction to the different roles, and also get the satisfaction of buying additional workers that does a difference". So the drilled rock fills, and stone comes up only once he moves the worker to haulage and then to hoisting, or hires more. Until #703 a fresh mine started with every worker on a job (in the prototype twelve, and 21 since #655), so it ran before he had touched anything.
11. **Unattended**, the workers stay where he left them, and every job works at the night shift output. Before the Light Tower is operational the eight-hour clock stops drilling only (rule 4).
12. **The factory takes no workers** in slice 1. The station makes a work order from what transport brings (rule 7.13).
13. **Drilling and haulage are jobs on each level**, a machine belongs to a level, and a hoist is assigned to a level or serves both (rule 5). He played it in the prototype's versions 14 to 17 (15 Nov 2026). His words on it are at the top of this document, and what in it is mine is under Calls I made (calls 54 to 73). Until then the levels were shared by four crews.
14. **The jobs do not take the same number of workers.** Flemming, 15 Nov 2026, 17:42Z: "not everything should require the same amount of workers to match, there should possible be most miners, less to haulage and even less to haulage". What a worker with a tool moves, and how many workers a machine takes for what it moves, differ from stage to stage. A line in balance has the most workers on drilling, fewer on haulage and the fewest on hoisting. The numbers are the lab's (Starting numbers).

**Until part 1 is switched on**, the line stays off in play, as it is on `main` behind its switch (#532). It is not turned on in today's game: #536 is closed as not planned, and nothing more is built on today's version (Flemming, 14 Nov 2026, 21:47Z). The line is turned on with part 1 (#664), without the lean. #537 and #538 are not built on today's board, and neither is #539's card: they are built on the new screens (How it would be built). #539's rules, engineers and trouble by stage, are built in part 3. The fresh mine's rules run beside today's game behind their own switch, `fresh.off`, which turns the line on with them (#653).

### 3. Goods and makers

Three goods. Stone is the everyday good.

| Good      | Comes from                           | Buys                                                                                                               |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Stone     | any level's rock that no maker takes | workers, carts, hoists, drills, kilns, horse wagons, upgrades, the stone part of a work order, projects, the shaft |
| Brick     | kilns, from the Topsoil's rock       | saws, trucks, stockyard levels, promotions, projects, the shaft                                                    |
| Cut stone | saws, from the Granite's rock        | borers, locomotives, the winding engine, projects                                                                  |

- **A maker takes one level's rock, from its own pile.** A maker is a part like any other (rule 2, Every part runs on its own): it has a pile of rock in front of it, "Rock at the kilns" or "Rock at the saws". What comes up from a level fills that level's maker's pile first. Rock that finds no room there goes to the stone stockpile: it bypasses to stone. He was asked on version 13 whether the kilns get their rock first or he sets the split, and none of his six points changed it (call 54).
- **A recipe is not one to one, and it is shown.** Flemming, 15 Nov 2026, 17:42Z: "these recipies should probably not be 1:1 and all recipies should adjusted in some balancing, but we can start to show recipies". A maker takes a set number of rock for one of its good. The starting recipes are 2 rock for 1 brick and 3 rock for 1 cut stone, and 1 rock is 1 stone (Starting numbers). They are made up, for the balancing he asked for. A recipe is on the page wherever a good is made.
- **A maker is bought like a machine** and has ownership marks. It runs with one worker on its job (rule 2.7). It takes no engineer, no gear and no trouble.
- **A level's good has two limits**: the rock that comes up from there, and what its running makers can take. The page shows both numbers and does not name the one that limits (the principle of 15 Nov 2026).
- **A price is a short list of goods** (#560). In slice 1 only the shaft and the projects require two goods.

### 4. The stockyard and unattended time

As the line spec's step 2, from the day the Light Tower is operational.

- The stockyard has one stockpile for each good. One stockyard level sets the room of all three, and "Expand the stockyard" (brick) raises it. The next stockyard level never costs more than the brick stockpile holds.
- A full stockpile takes no more. A maker whose good's stockpile is full stops, its pile of rock fills, and the level's rock then goes to stone. When the stone stockpile is full too, hoisting has nowhere to unload and stops (from part 3: a cage waits at the top with its load). Then the rock at the shaft fills and stops haulage, and the drilled rock fills and stops drilling (rule 2, Every part runs on its own). (Flemming, 14 Nov 2026: "production should stop when stock is full".)
- There is no dig tap (amended 14 Nov 2026).
- A price above a stockpile's room reads "Needs a bigger stockyard".
- **Unattended**, the mine runs at the night shift output (30%, and 45% once the Light Tower is operational) until the stockyard is full. Transport keeps delivering to what he ordered (rule 7), so a night with a project open runs longer than one without. The clock cap goes. The shift report says what came in, what was delivered, and what stopped it.
- **Before the Light Tower is operational** there is no stockyard, and the pocket has no limit. Unattended, the mine keeps today's rule: 30%, for at most eight hours. The clock stops drilling only. Haulage and hoisting go on until the drilled rock and the shaft pile are empty (#703), and transport goes on delivering from the pocket until the order has what it requires or the pocket is empty (as the prototype plays it). When the Light Tower's roof goes on, at night or not, the stockyard opens in that moment and the clock goes: the mine runs from then until the stockyard is full.
- When the stockyard opens, or when a stockpile holds more than its room for any other reason, nothing is taken away. The stockpile takes no more until it is under its room again.

### 5. The levels and the hoists

Flemming, 15 Nov 2026, on the prototype's versions 14 to 17. His six points are at the top of this document. On the workers: "workers for haulage should not be split automatic, these are assigned". On the hoists: "if there is two levels, should the hoist be able to serve both levels. but only one at a time, so must run down to one level then up, then down to the next", "hoist should only deliver it ressources to the global storage when at the top", and "hoist should also be able to be dedicated, but can split as described above, if all hoists are dedicated to one level is the others not served". On how a hoist is dedicated: "just a number that assign no.of hoists to a level".

Nothing in the mine is shared between the levels by a rule he cannot see. He puts workers and machines on a level, and he says which level a hoist serves.

1. **Drilling and haulage are jobs on each level.** Every open level has its own drilling, its own drilled rock, its own haulage and its own rock at the shaft. A worker on a level's drilling or haulage works on that level only, and is moved like any worker (rule 2.4).
2. **A machine belongs to a level.** A drill, a borer, a cart or a locomotive is bought for one level and stays there. With one level open the buy asks nothing. With two it asks which level. A level's machines are run by that level's workers of that stage (rule 2.5). Everything else a stage has is still one for both levels: its upgrades, its gear, its engineer and its trouble count on both. A machine's price and its ownership marks count the machines of that kind on both levels together, and Loading crews counts the workers on haulage on both (rule 2.9).
3. **With one level open**, every worker and machine of drilling and haulage is on the Topsoil, as in parts 1 and 2.
4. **When the Granite opens, nobody works there.** No worker and no machine moves by itself. The card for the level says so, and he puts workers there.
5. **Hoisting is one job for the whole shaft, and a hoist is a cage.** A cage goes down to a level, loads the rock at the shaft there, comes up and unloads at the top. A cage carries a set load. A trip takes time, and a deeper level takes longer (Starting numbers). The winding engine is a cage too, and a faster one.
6. **Rock is in stock when the cage is at the top.** What a cage carries is in no stockpile until it unloads. It unloads into the pile of the level's maker first, and what finds no room there goes to the stone stockpile (rule 3). What finds no room at all stays in the cage, and the cage waits at the top (rule 4).
7. **A hoist serves both levels, one at a time.** A hoist he has not assigned goes to the levels strictly in turn: down to one, up, then down to the other. It takes what is at the shaft and goes, also with less than a full load. A level with nobody on haulage and no rock at the shaft is left out of the turn.
8. **He assigns hoists to a level with a number.** Each level has a count of the hoists assigned to it, between − and +. An assigned hoist serves that level only. The hoists he has not assigned are the ones for both levels. If every hoist is assigned to one level, the other is not served: its rock at the shaft fills and its haulage stops. A winding engine counts as a hoist in these counts, and in "the hoists he owns". Which cage takes an assigned place is not his to set in slice 1: the winding engines take the assigned places first, the Topsoil's before the Granite's (call 70). To assign a hoist is free and instant, it is saved at once, and it holds while he is away.
9. **A hoist with one level to serve waits there for a whole load.** It goes up with a part load only when no more rock is coming: nobody is on that level's haulage, or its drilled rock is empty and nothing is drilled. That is an assigned hoist, every hoist while one level is open, and a hoist for both while the other level is left out of the turn.
10. **Hoisting's workers run the hoists.** A hoist takes a set number of workers and stands until hoisting has them (rule 2.5). The workers on hoisting who run no hoist work the winch together: one cage for both levels in turn, which carries a set amount for each of them and never more than a hoist's load. When hoisting has too few workers for every hoist, the hoists that together lift the most run (rule 2.5).
11. **A cage whose workers are taken away finishes its trip.** It comes up, unloads, and then stands. Nothing in a cage is lost.
12. **Where they work holds.** When a level can send up nothing more, because its maker's pile and the stone stockpile are full, its workers, machines and hoists stay where he put them. They do not move by themselves to a level that still has room: where they work is his call, and a night ends at his stockyard. The level's rows show it (a full pile, a stage that moves 0), and the shift report says when it happened.
13. **Materials for the factory** come from a level's rock: clay from the Topsoil's, iron from the Granite's, at today's rate for the rock drilled there, each up to what its band gives in a run today (10 clay, 35 iron), and refilled up to that.
14. **Unattended**, the hoists are counted as rates, not trip by trip. A hoist with one level to serve lifts its load in the time of that level's trip. A hoist for both lifts two loads in the time of both trips, one from each level. The piles the cages load from and unload into hold three loads (Starting numbers), so that the cages as they are played and the night's rates agree: within about 1% in the prototype, with up to six hoists for both levels. With more, cages that reach a level together find three loads between them and lift up to a quarter less than the rates say. The lab sets the piles for the numbers of hoists the game reaches (`cageGap`). What the cages carry is saved, so closing the game loses nothing. Where a cage is in the shaft is not saved.

**What went.** Until 15 Nov 2026 this rule was "The crews": the line worked in four crews, each a quarter of what the line moved, shared between the levels one crew at a time, with the machines as one fleet. With one workforce (rule 2) the crews were a second way to share the same workers. He played drilling as one job on each level in version 14, and asked for the rest in his six points. A crew is no longer a thing in the game.

### 6. The city

One project at a time. A project is a building, and a building rises in three steps: foundation, structure, roof. With its roof on it is operational: it gives its power and opens the next thing, in the moment a relic's reveal has today.

| Building        | Requires         | Power (the relic's, as approved)                                                              | Opens                                              |
| --------------- | ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| The Light Tower | stone            | Lights the night: night shift output is 45%, up from 30% (new on 14 Nov, when the veins went) | Kilns, the stockyard, and the Granite's price      |
| The Warehouse   | stone, brick     | The stockyard holds twice as much                                                             | Trucks                                             |
| The Foundry     | brick, cut stone | The winding engine can be built                                                               | The level below, in slice 2. The slice's end card. |

- The project is on the screen from the first minute.
- **He orders, transport delivers, and the builders build** (rule 7). One order covers the whole building: its three steps follow each other with no tap. The next building waits for his order.
- What comes next stays vague: the next building is a hint in the city's words, never a list.
- The Warehouse can be built before or after the shaft is sunk. Both require brick, so which comes first is his call.
- The names are approved (14 Nov 2026). Lines and pictures are his to approve when they are built.

### 7. Transport and build time

Flemming, 14 Nov 2026: "the click to ship to the workshop and city is wrong. The order is by the player, and then do the resources transfer on a speed. Probably something that can be upgraded, like moving from horse to truck, trains maybe, upgraded etc. And the time it takes to build is controlled by the resources not a fixed time".

His decisions:

1. **He gives the order.** A project in the city and a work order in the factory start when he orders them. No tap delivers goods.
2. **Goods move at a speed.** Transport carries what was ordered from the stockyard to where it is needed, in goods a second.
3. **Transport is upgraded in kind**: horse wagons first, then trucks, and trains later.
4. **Nothing has a fixed build time.** How long a step takes is what the mine makes, what transport carries and, since 15 Nov 2026, what the builders build in.

How slice 1 does it (mine, under Calls I made):

5. **One fleet, one number.** Transport is a count of vehicles and the goods a second they carry together. A vehicle is bought like a machine and has ownership marks. It runs with one driver (rule 2.7). It takes no engineer, no gear and no trouble. There are no routes and nothing to dispatch.
6. **Horse wagons from the first evening.** They cost stone. Nothing reaches an order without a vehicle, so a fresh mine is given one horse wagon. Since #703 nobody drives it at the start: he puts a worker on it (rule 2.10). **Trucks** cost brick and open when the Warehouse is operational. Trains wait for a later slice.
7. **An order is what transport serves**: the city's project and the factory's work order, once he has placed them. Transport carries only what the step in hand still requires, and only what the stockpiles hold. With both open each gets half, and what one cannot use goes to the other.
8. **The building site and the builders.** Transport brings a project's goods to its building site. The site holds a set amount, and transport brings no more until the builders have made room. A builder builds in a set amount a second. A step is done when what it requires is built in, not when it has arrived. His words name building as work for the workers. The site and its numbers are the prototype's, and he has not answered on them by name (call 34).
9. **What has arrived stays.** Part deliveries count, and nothing is taken back from a site or a building.
10. **On hold.** He can put an order on hold and resume it. Both are free and instant, are saved at once, and hold while he is away. On hold, nothing leaves the stockyard for that order. The builders still build in what is on the site. This keeps "the project or the machines" a decision now that goods leave by themselves, and it is the free way out when transport takes all the mine makes (the anti-goal's lock).
11. **An order shows its numbers**: what transport brings a second, what the builders build in a second, what is on the site, what the step still requires, and the time left at this rate. It names no limit (the principle of 15 Nov 2026). How it reads is the prototype's. The rules still work the limit out, for the lab.
12. **Unattended**, the drivers and the builders work at the night shift output, and transport delivers to what he ordered. The stockyard drains into the order, so the night goes on until the stockyard is full and nothing more is required. A full building site stops transport to it, as a full stockyard stops production. A step can finish at night, and the next step of the same building starts. A building whose roof goes on at night is operational from that moment: its power counts for the rest of the night, the shift report says so, and its card is shown after the report. Nothing new is ordered without him.
13. **The factory.** A work order requires stone and a material. The material comes from the rock at its own slow rate (rule 5), and transport carries both to the station: one clay or one iron counts as 500 stone of a load. The station has no building site and no builders: the work order is done when everything it requires has arrived, so it can wait for a material that is short. Today's fixed craft times (ten minutes, an hour, four hours) go. It is still one station and one work order at a time, and a cancelled work order gives back what arrived, as today. How long gear's effect lasts once it is installed (a blasting charge's twenty minutes) is not a build time and stays.
14. **Buying stays instant.** Machines, makers, vehicles, stockyard levels and the shaft are bought from the stockyard, at the mine, and are there at once. Whether sinking the shaft should be a project with transport is his call. I kept it a purchase, because the goods are already at the mine.

### 8. The end of the slice

When the Foundry's roof is on, a card says the first city is operational and that the road goes on. The winding engine is on sale, so cut stone still has a use. He can play on: nothing stops, and nothing new comes until slice 2. When slice 2 lands, a save keeps its place if the save's shape allows it. If it cannot, the issue, the PR and the chat say "Resets the save" first.

## What he sees

The screens were settled in a playable prototype, not in pictures. Flemming rejected three rounds of mock pictures on 14 Nov 2026 and asked for a prototype in their place. He played four versions of it that evening ("That is right" to the fourth, 21:35Z), and thirteen more on 15 Nov 2026, each changed after what he said. To the eleventh (09:53Z): "This is great, just one thing, hiring of workers is locked to the mining page, that indicates to the player this is only for mining, it should be a global place". To the seventeenth (18:44Z): "a", which is yes to how the hoists are assigned.

- The prototype is a throwaway outside the game: `prototypes/slice-1/`. Its numbers are made up and run fast. It is drawn with sprites that exist and shapes made in code. `main` has the versions he has answered, the seventeenth since #716, and `prototypes/slice-1/README.md` says what each version plays and what he said to it.
- What it settles is the layout, the flow and the words. This section writes them down. The frame, the workforce, the mine with one level, the factory, the city and the cards are from the twelfth version (commit `366b890`), which is the eleventh with hiring moved as he asked. The mine with two levels, the refinery's plates and the card for a level are from the seventeenth (commit `ccf3969`). The pictures in `docs/superpowers/specs/slice-1/` are of the twelfth, except `mine-two-levels.png`, `machine-level-card.png`, `level-reached-card.png`, `refinery.png` and `workforce-two-levels.png`, which are of the seventeenth.
- What it does not settle is the art (see Art) and the numbers (the lab).
- Two things in the prototype's head are its own tools and are not in the game: "Skip 8 h" and "Reset".
- The prototype plays the whole slice at once, with a few dozen workers. What a screen says while part 1 or part 2 is the end of the game, what Next and the lamps count, and how he hires and moves a hundred workers are not in it. They are under [What the prototype does not show](#what-the-prototype-does-not-show).

### Four sites

The game has four kinds of work (his words: "mine, city, refinement, manufacturing"), and each is a site with its own scene.

| Site         | The work      | What he decides                                                                                                           | Its pace                                                  | Opens in slice 1              |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------- |
| The mine     | digging       | how many workers each stage gets on each level, a worker or a machine and for which level, and which level a hoist serves | every sitting, it never stops                             | part 1                        |
| The refinery | refining      | what the rock becomes: how many makers, and how many workers on them                                                      | set now and then, it runs by itself                       | part 2 (kilns, the stockyard) |
| The factory  | manufacturing | which work order goes on the station next                                                                                 | one work order at a time, as fast as its materials arrive | part 3                        |
| The city     | building      | what is built, and how many vehicles, drivers and builders it gets                                                        | a building every day or two, forever                      | part 1                        |

### The frame, the same on every site

From top to bottom:

1. **The order strip.** The project in hand, its step and its state ("Foundation · not ordered", "Structure · delivering", "on hold"), what the step requires with its counts ("Stone 23.7K of 60K"), and a pip for each of the three steps. A tap goes to the city.
2. **The stockpiles and the workers.** One stockpile for each good he has met, with a bar for how full it is, and "full" in red. At the end of the row is the count of workers with the free ones under it ("44 · 2 free"), and beside it the key that hires one, with its price ("+Worker · 1,300"). With the amount key on ×10 or Max the key says how many it hires and what they cost together (The amount key, below). A tap on the count opens the workforce (below). With one or two stockpiles a stockpile also says its room ("of 400K"). With three there is no room for that beside the hire key, and the room is read in the refinery's stockyard.
3. **The site's scene**, which fills the middle.
4. **Next.** It points at two things only: gear that is done and waits to be installed, and a building nobody has ordered ("Next · City: Order the Light Tower"). A tap goes there. Otherwise it reads "Affordable now" with a count for each site ("Mine 3 · Refinery 2 · Factory 3 · City 1"), and a tap goes to the next site that has something. Beside it is the count of everything ("9 ready"). With nothing it reads "Nothing affordable yet. Production is running." Next never names a buy: which thing to buy is his to work out. It takes the Ready now plate's place, and "Saving for" goes with it. What is counted is under [What Next and the lamps count](#what-next-and-the-lamps-count).
5. **The site bar.** A tab for each open site, with its lamp: green when something there is affordable, amber when something there is running (an order that is delivering, a work order on the station). A site joins the bar when its work opens: the mine and the city on the first evening, the refinery with the Light Tower once part 2 is live, the factory with the shaft once part 3 is live. A swipe changes site too.

### The workforce (`workforce.png`)

His words, 15 Nov 2026: hiring "should be a global place". The top row of the frame is that place: the hire key is beside the count of workers on every site. The workforce is the list behind the count. It opens on every site, and the game runs on behind it.

- Its head says how many workers he has and how many are free ("44 workers · 2 free"), with a second hire key and its price ("Hire · 1,300"). **Hiring is in the frame and in this list, and nowhere else.** No site has a hire key of its own.
- Under it is every open job, grouped by site: the mine (drilling, haulage, hoisting), the refinery (the kilns, the saws) and the city (transport, building). A job that has not opened is not shown. With two levels the mine is three groups (`workforce-two-levels.png`): the Topsoil (drilling, haulage), the Granite (drilling, haulage) and the shaft (hoisting).
- A job's row has its name, a line on what its workers run now ("3 of 3 drills run, 4 with picks", "4 of 4 kilns run", "3 of 3 vehicles run", "each builds 150/s"), and its count of workers between − and +. A + with no free worker says so: "No free worker. Hire one, or take one off another job."
- The same − and + are on each site beside the thing the workers run, so he can also move a worker where he is looking.

### The mine (`first-evening.png`, `mine-two-levels.png`)

- The mountain cut open: the winding tower on the surface, the shaft down the left side, and a gallery for each level.
- In a gallery each stage has its own part, with its name under it: hoisting at the shaft, haulage on the rail, drilling at the end of the gallery. A stage's workers and machines are drawn in its part.
- **The state is seen in the scene**, as he asked (15 Nov 2026, 06:22Z). Rock lies at the end of the gallery and at the shaft as full as the drilled rock and the shaft pile are (#703): it piles up at the end of the gallery when drilling makes more than haulage takes, and at the shaft when more arrives than is hoisted. Tubs run empty when drilling gives too little, and queue when the shaft cannot take them. The cage waits at the shaft bottom when hoisting has spare capacity. Workers of a stage with spare capacity stand, with a "z" over them, for that share of the time.
- With one level open, the level's plate has its name and its rock a second, which is what hoisting brings up now (#715, Flemming, 15 Nov 2026). It has no line under the name. It said "4 crews · all rock is hoisted as stone" until #715, and there are no crews to count since rule 5 was written again. With two levels the plate gives way to the level's own rows (With two levels, below).
- A level that is not reached says what it waits for ("The shaft can be sunk once the Light Tower is operational"), and then its price. Under the last level: "Deeper strata: not yet surveyed. The city has to grow first." Until part 3 is live the Granite is not named: the Topsoil is the last level, and that line is under it.
- At the foot is a row of keys, one for each stage's next machine: what it is and what it moves ("+Drill · 600/s"), its price, and the workers it takes ("3 to run"). The key buys. There is no key to hire here: the eleventh version had one, and he asked for it to go to a global place (the frame).
- Under the keys are three rows, one for each stage:
  - its name, and what it moves now of what it can move ("2,200 of 2,700/s"), with a band behind the row that shows the same. "Now" is the stage's own rate through the piles: drilling with full drilled rock moves 0 (#703);
  - on drilling's row and on haulage's, the pile after the stage and how much it holds: "Drilled rock: 120 of 300" and "Rock at the shaft: 0 of 300" (#703). Flemming approved them on 15 Nov 2026, 15:13Z, with no "face": "this is an engineering game, not some fancy kids game";
  - who works with what, as a sum that adds up to what the stage can move ("2 hoists: 6 of 6 workers 2,400/s + 2 on winches 200/s"). A kind of machine shows the workers it has of the workers it takes, so a machine that is idle shows why ("1 of 2 hoists: 3 of 6 workers 1,200/s");
  - a third state, which the prototype's numbers never reach: the stage has the workers for a machine, and they stay on their tools because that moves more (rule 2.5). "0 of 12 workers" would send him to add workers, which changes nothing. So the machine's part says it with both numbers ("1 cart stands · 12 workers move 430/s with barrows, 360/s on the cart"), and in the scene that machine stands with nobody asleep beside it. The words are his to approve when the row is built (call 51);
  - the stage's count of workers between − and +.
- Nothing names or lights the stage that limits the line. Once the piles settle the three "moves now" numbers are the same, and the "can move" numbers are what he compares.
- A tap on a row says the same in one sentence, and opens the stage's full list (below). A row has a green lamp while its list holds something he can afford, so the mine's lamp is never green with nothing lit in view.

**With two levels** (`mine-two-levels.png`, `machine-level-card.png`). Three rows under the keys cannot hold a second level, so from the moment the shaft is sunk the rows are where their work is. This is the seventeenth version. His "a" to it (15 Nov 2026, 18:44Z) was to its question, which was the strip that assigns the hoists. The rest of the layout was on the page he answered, and he was not asked about it by name.

- **Each level has its own two rows, on the level**, above its gallery: "TOPSOIL drilling 1,300 of 1,300/s" and "HAULAGE 1,300 of 1,600/s". Each has its sum under it ("2 drills 6/6 1.2K + 1 pick 100", which is the short form where the row is tight, and "2 carts: 4 of 4 workers 1,600/s") and its workers between − and +. They are the stage rows above, one pair for each level.
- **A level's two piles are under its gallery**, each under its heap: "Rock at the shaft: 2,908 of 9,000" at the shaft and "Drilled rock: 0 of 3,000" at the end of the gallery.
- **The shaft is clear.** Nothing is on it but the cages, so every cage is seen going down, loading, coming up and unloading. The count of stone in the top row rises when a cage unloads, and stands while the cages are down.
- **The row of keys** has one key for each stage's next machine, as with one level. A tap on drilling's or haulage's key opens a card: "A drill for which level?", with what the machine takes and moves, "It stays on the level it is bought for", what each level has, one key for each level, and "Not now". The two levels' keys are drawn alike, so neither is the answer.
- **Hoisting has the one row under the keys**: "HOISTING 2,167 of 2,167/s", its sum ("3 hoists: 6 of 6 workers 2,167/s"), and its workers between − and +. "Now" is what the cages lifted on their last trips. "Can" is what the running hoists lift as they are assigned.
- **One strip under that row assigns the hoists**, in the row's own form: a name, a rate, and a number between − and +. It reads "TOPSOIL 1,000/s − 1 hoist +", "GRANITE 500/s − 1 hoist +" and "BOTH IN TURN 667/s 1 hoist". The last has no keys: it is the hoists that are left. The three counts add up to the hoists in the row above, and the three rates to what that row can lift. + is dark when no hoist is left to assign, and − when the level has none. A tap that can move nothing says the three counts and how a hoist goes in one line: "A hoist for one level waits there for a whole load, or until no more rock is coming. A hoist for both takes what is there and goes on to the other."
- Nothing says which level a hoist should serve. A level that is not served shows it: its rock at the shaft is full and its haulage moves 0.

### The refinery (`refinery.png`)

- A flow from top to bottom. Each level's rock falls from its hopper, which says the level and its rock a second ("TOPSOIL 1,333/s") and is as full as the maker's pile, into its maker: the kilns under the Topsoil, the saws under the Granite. Rock that finds no room in a maker's pile joins the middle chute, which says its recipe too ("bypass to stone 271/s", "1 rock → 1 stone").
- A maker's plate reads like a stage's row (the prototype's seventeenth version). Its head is the recipe: "Recipe: 2 rock → 1 brick", "Recipe: 3 rock → 1 cut stone". Then what it makes now of what it can make, in its own good ("KILNS 400 of 400 brick/s", "SAWS 200 of 200 cut stone/s"), the makers that run and the workers they have of the workers they take ("4 kilns: 4 of 4 workers"), its pile ("Rock at the kilns: 6,653 of 9,000"), its workers between − and +, and the key for one more with what it makes, its price and the worker it takes ("+Kiln 100/s · 21K · 1 to run"). It names no limit.
- A worker with no maker to run, or whose maker takes nothing, stands.
- The stockyard is at the foot: the three stockpiles drawn as piles with their counts and rooms, and "Expand the stockyard" with its price, how long a night lasts now ("Full after 26 min unattended") and what the level gives ("capacity ×3").

### The factory (`factory.png`)

- Seen from above: the tools on the wall, a bin for each material with its count and its source ("Clay 8/10 · source: Topsoil"), and the station in the middle.
- An empty station reads "Station idle. Drag a blueprint here. Transport brings the materials." A work order on the station shows its blueprint, what is arriving a second and how far it is.
- The blueprints lie under the station, each with its effect and what it requires. A drag onto the station places the work order.
- What is installed is in the head ("Installed: rails 0/2 · props 0/1").
- The factory takes no workers in slice 1, so it has no − and + (rule 2.12).

### The city (`first-evening-city.png`, `city.png`)

- The transport plate is on top: its drivers ("3 drivers"), what it is doing ("serving the city", or that it has no order), the fleet with the drivers it has of the drivers it takes and what it carries ("3 horse wagons: 3 of 3 drivers 600/s"), the drivers between − and +, and a key for one more wagon with its rate and price. The trucks' key is there from the day the Warehouse is the project in hand, in part 3. Until the Warehouse is operational it reads "Trucks: after the Warehouse". Before that there is no key for trucks: what comes next stays a hint (rule 6).
- A skyline at night with a plot for each building: operational, in hand, or vacant ("Vacant plot · unassigned"). The building in hand has its building site: the goods transport has brought lie there, and the builders work on it. A building rises as it is built in: its own picture is shown from the ground up behind scaffold, a third of its height for each step, and the step in hand rises with what is built in. So a step needs no picture of its own (call 52).
- The wagons drive along the road in front. They run as full as the stockpiles let them, and stand when there is nothing to carry. A vehicle with no driver stands behind the road.
- The project's card is under the skyline: its three steps with a tick on each one done, and a bar for each good the step requires ("Stone 26.7K of 60K").
- The order key is on the card. Before the order it reads "Place order · the whole building"; since #715 (Flemming, 15 Nov 2026) it lists what each step requires instead: "Foundation 25K · Structure 250K · Roof 1M". After, it is the state of the order in numbers: "Delivering · arriving 600/s · building 450/s · 2 min · tap to hold". It names no limit.
- Under the bars are the builders between − and +, what each builds in, and what is on the site of what it holds ("3 builders ×150/s · on site 1,569 of 4,000").
- At the foot of the card: "On completion:" with the building's power, and what it opens in the parts that are live.

### The cards (`first-evening-card.png`, `shift-report.png`)

- **The first evening** (#703): one card on the first view of a session while nothing is ordered and nothing is operational, until its key is pressed. It is not a save fact. His approved words (15 Nov 2026, 15:13Z): the title "The first evening", then "One worker, on drilling. Drilled rock waits until haulage carries it to the shaft, and at the shaft until hoisting lifts it up as stone." and "Move him between the jobs. Every worker you hire moves more.", with the key "Start". Until #703 the card was to say that he starts with 21 workers, every job taking them.
- **The shift report** after unattended time: how long he was away and the night shift output, a bar that shows how much of the night the mine produced and how much it stood, what was produced, what transport delivered to orders, and the steps and buildings that were finished. The bar is about the mine only. Transport and the builders go on after the mine stops, and their work is in its own lines. The report says what happened. It does not say what to buy.
  - **In part 1** the eight-hour clock stops the mine (rule 4), unless a pile ran out first: one worker on hoisting lifts what waits at the shaft and then has nothing to lift (#703). When stone was still coming up as the clock struck, the report says "A night shift runs 8 h. Production stopped after that.", which is the prototype's line. When a pile ran out first, the bar shows how short production was, and no line blames the clock. The bar counts the time stone came up, so the rock the piles still held at the clock, which haulage and hoisting bring up after it (#703), is in it. A night under eight hours has a bar that is all production while every stage stone needs has rock to move, and never the clock's line; a pile that runs out shows as the idle part of the bar.
  - **From part 2** the stockyard stops it. The report says when each stockpile was full, and "Stockyard full: production stopped", with a key that goes to the stockyard beside Close.
  - When a roof goes on in the night, the head says both outputs. Proposed: "Night shift output 30%, and 45% from the Light Tower's roof". The line is new, and his to approve when the report is built (#663).
- **A building is operational**: its power and what it opens in the parts that are live. After the last building of the part that is live it is the end card: the Light Tower's in part 1, the Warehouse's in part 2, and the Foundry's, which is the slice's, in part 3.
- **A level is reached** (`level-reached-card.png`): that it has its own drilling and haulage and nobody works there yet, how the hoists serve it and where a hoist is assigned, what each level's rock makes, and what opened. The prototype's words, which are his to approve when the card is built: "THE GRANITE: REACHED", "A second level, twice as deep, with its own drilling and its own haulage. Nobody works there yet: put workers on it with − and + on the level.", "A hoist serves both levels in turn: down to one, up, then down to the other. A trip to the Granite takes twice as long. Under Hoisting, − and + assign a hoist to one level only.", "Topsoil rock goes to the kilns. Granite rock goes to the saws, which have their own pile of rock.", and what opened.

### What the prototype does not show

These are in the game today and have no place in the prototype. Where they go is mine (call 16), and part 1's plan may move them:

- **A stage's full list.** A stage's row shows its machines and its next one. A tap on the row opens that stage's list: its machines with their ownership marks, its upgrades, its gear, its engineer and its trouble. They are the rows #537 to #539 specify, built here. The worker's own upgrades (Work boots and the like) and marks are in the workforce, under the jobs. They are built with the stage's list (#661), not with the workforce's jobs (#659).
- **Engineers and expeditions** open from the mine, from part 3.
- **The Ledger, the sound switch and Start over** open from one key on the order strip. Keepsakes join them in part 3, when expeditions are back.
- **The save line** stays in view on every site (`observable-saves.md`).

Three more things the prototype cannot show, because it plays the whole slice at once with a few dozen workers. They are mine too (calls 47 to 50).

#### What Next and the lamps count

- **A site's count** is every buy on that site he can afford now: a machine, a maker, a vehicle, a stockyard level, the shaft, and each upgrade in a stage's list. A site's lamp is green when its count is not zero.
- **Hiring is not counted** and lights no lamp (the prototype's twelfth version). The hire key is in view on every site and is lit when he can afford a worker, and a worker is nearly always affordable, so a count with hiring in it would never be zero.
- **The workforce has its own count**, for the worker's upgrades (Work boots and the like). It joins Next's line after the sites ("Mine 3 · City 1 · Workforce 1"), a tap on it opens the workforce, and the count of workers in the frame has a green lamp while it is not zero. In a fresh mine Work boots is one of the biggest single buys, so it must not be out of sight.
- **"Nothing affordable yet. Production is running."** is shown only when it is true. It is about the sites, so a lit hire key beside it is no lie, but the line is to say so. And when a stage has no workers and the line moves nothing, "Production is running" is not shown. Proposed: "Nothing to buy on the sites yet.", then "Production is running." or "The line stands." The words are his to approve when Next is built (#659).

#### The amount key

The prototype has twelve to forty-four workers, and a tap hires or moves one. With the game's numbers part 1 has well over a hundred, and a tap for each to hire and one more to place is the chore before bed (the anti-goal). Today he buys workers ×10 or Max with the amount key (#358), and that stays.

- One amount key, ×1, ×10 and Max, for the whole game, kept on the device as today. It is in the head of the workforce and in the head of a stage's list.
- Every key that follows it shows the amount and the real total: the hire key ("+10 Workers · 14,200"), a machine's key, and a row in a stage's list. ×10 is ten or nothing, and Max is as many as he can afford, as today.
- The − and + of a job follow it too. + moves up to that many free workers onto the job, and − takes up to that many off. With fewer than ten, ×10 moves the ones there are. Max moves all of them.
- The − and + that assign hoists follow it too (call 66). The prototype has three hoists, and a tap assigns one.
- He has not played this. If he turns it over, the rules still move one worker, and the lab's `workerMoves` shows what that costs.

#### While a part is the end of the game

The pictures show the whole slice. A line on a screen never promises a thing that is not live.

| Line or part of a screen                       | In the prototype                                                            | In the game                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| The Light Tower's "On completion" and its card | its power, and "Opens the refinery."                                        | In part 1 the power only. "Opens the refinery" from part 2. The Granite's price from part 3 |
| The Warehouse's "On completion" and its card   | its power, and trucks                                                       | In part 2 the power only. Trucks from part 3                                                |
| The trucks' key                                | "Trucks: after the Warehouse", from the first evening                       | Not shown before part 3, and then only once the Warehouse is the project in hand            |
| The level under the Topsoil                    | "The shaft can be sunk once the Light Tower is operational", then its price | Until part 3: "Deeper strata: not yet surveyed. The city has to grow first."                |
| The site bar                                   | the refinery joins with the Light Tower, the factory with the shaft         | The refinery from part 2 and the factory from part 3                                        |

**After the last roof of the part that is live** there is no building to order. Every player is in this state until the next part is live, so it is a screen of its own:

- The end card says the building is operational and that more is being built.
- The order strip has no project. It names what is operational and says the next is not ready (proposed: "The Light Tower is operational · the city is planning its next building"). Its pips are all done.
- In the city, the project's card says the same in the place of its bars, and has no order key. The plots that are left stay "Vacant plot · unassigned".
- Transport and building are still jobs. Their − and + stay, so he can take the drivers and the builders off and put them in the mine. The plates say that there is no order ("idle: no order", as the prototype has it).
- Next never points at the city. It counts as always.
- The city's lamp is green when a vehicle is affordable, and never amber.
- The lines are his to approve when the city and the cards are built (#662, #663).

### What any screen has to meet

- The phone never scrolls. A long list scrolls inside its box.
- The project in hand is in view from the first minute.
- A decision shows real numbers: prices, rooms, each level's rock and goods a second, transport's goods a second, what an order still requires.
- The page shows the numbers and never the answer. Nothing names the bottleneck, a limit or a best buy (Flemming, 15 Nov 2026).
- What is idle is seen: workers, machines, vehicles, and a buffer that is full (Flemming, 15 Nov 2026).
- How many workers there are, where they work and how many are free is in reach on every site, and so is hiring one. His words are "a global place" (15 Nov 2026). The place is the frame, the same on every site, and no site has a hire key of its own (call 43, the prototype's).
- "Hands" and "by hand" are not used.
- What he assigns is a plain number between − and +, like every other count, never a key with words. His words were about the hoists (15 Nov 2026, 18:09Z), and they are taken for every count he sets (call 73).
- A recipe is shown wherever a good is made. His words were about the refinery (15 Nov 2026, 17:42Z: "we can start to show recipies").
- No line promises a thing that is not live in the part he plays.
- No button mines, and no button delivers.
- The lamp rule stays: green for something he can afford, amber for something running, red for trouble, dark for rest.
- No placeholders in the game. A picture that does not exist is asked for first.

**How it reaches Mars.** The mine gets more levels. The refinery gets more makers, and the day a rock has two uses, refining becomes a choice of what the rock goes to. The factory gets more stations and bigger things to make, up to the parts of the rocket. The city gets more plots, and the last site to open is the pad. Transport gets trains. Each of those is a later slice's design, not a rule of slice 1.

**What slice 1 does not have yet.** In slice 1 a level's rock has one maker, so the refinery has one decision: how many makers each good gets. The mine and the city are where slice 1's decisions are. The refinery and the factory are small, real sites that later slices fill.

## What goes, and what stays

**Goes:** the dig button and every tap that mines (Flemming, 14 Nov 2026); the Send on a project and the factory's fixed craft times (Flemming, 14 Nov 2026: he orders, transport delivers, and time comes from the resources); golden veins and the Gold rush (Flemming, 14 Nov 2026: a thing to click as it glints does not fit the road to Mars); the relics, their plate, shelf, reveal pictures and Ledger rows; the Lantern's guide bar (the project takes its place); the pass, Legacy, kid runs, Grandpa and the generations lab (#642); depth, the mountain's size and bottom, "stones left", the mined-out state; the band tag's advice and the rock's lean; the away clock once the stockyard is open; relic glimmers from expeditions; kid workers until the building that brings them back; workers that spread themselves to the slowest stage, and the cart's wait for twelve workers (Flemming, 15 Nov 2026: one workforce that he moves).

**Stays:** workers and the six machines of the line; ownership marks; upgrades; the factory and its gear, without its clock (rule 7); engineers, expeditions and trouble; the art, the steel and the lamps; one save for each Google account and everything in `observable-saves.md`.

**Where today's parts land.** Part 1's reset fixes the ids of the new save, so each of today's parts is placed here. A part not named stays as it is.

| Today                                                          | In slice 1                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Workers, Work boots                                            | Stay (his call, 15 Nov 2026), as one workforce that he hires into and moves between jobs (rule 2) |
| Machine upgrades, ownership marks                              | Stay, in their stage's list. A price that scaled with the band scales with the deepest level      |
| The amount key (×1, ×10, Max)                                  | Stays, and counts for hiring and moving workers as well as buying (What he sees, The amount key)  |
| Strong arms, Sharper picks, Grandfather's pick                 | Go with the dig button: they only make a tap stronger                                             |
| Old miner's lamp, Crystal flare, Miner's crystal lamp          | Go with the golden veins                                                                          |
| Night foreman                                                  | Goes. The Light Tower has its job, so "night shift output 45%, up from 30%" is true for everyone  |
| The Heart of Patience and the other relic powers               | Go with the relics. A building's power is the one in rule 6                                       |
| Overtime                                                       | Goes. A live boost is made in the factory (blasting charge, axle grease), so it has one home      |
| Iron rails, pit props, Reinforce, blasting charge, axle grease | Stay as work orders, without a clock (rule 7.13)                                                  |
| Engineers, expeditions, trouble                                | Stay, from part 3. A promotion costs brick (the line spec)                                        |
| The Ready now plate                                            | Becomes Next                                                                                      |
| The Ledger, the sound switch, Start over, the save line        | Stay (What the prototype does not show)                                                           |

**Today's board goes** when part 1 is switched on: the odometer, the output gauge, the mine window, the bays and the key rail. The prototype's screens take its place (What he sees).

**Keepsakes** stay as expedition finds, so they are back in part 3. Their page moves from a relic's page to the key on the order strip, beside the Ledger.

**Recipes that need a material no open level gives** (crystal, heartstone) are held back: they are not shown, and an expedition does not bring one home, until the slice that opens their level. The winding engine's heartstone core waits the same way. So an expedition in slice 1 finds a lost tool, a keepsake, an engineer, or a recipe he can make.

**Start over** stays as it is today, and so does the run stamp it sets.

## Names (approved 14 Nov 2026)

Flemming at 20:42Z: "this an engineering game". At 21:03Z, on this list: "I think the names are right". This document and the prototype use them.

| Was                                             | Now                                             |
| ----------------------------------------------- | ----------------------------------------------- |
| gang                                            | crew                                            |
| the line's stages: the face, the haul, the lift | drilling, haulage, hoisting                     |
| holds the line                                  | bottleneck                                      |
| spare                                           | headroom                                        |
| the kilns hold the bricks                       | limit: kilns (bottleneck: kilns)                |
| the gangs rest                                  | crews idle                                      |
| the works                                       | the refinery                                    |
| the workshop                                    | the factory                                     |
| the bench, a job, a drawing, fit                | the station, a work order, a blueprint, install |
| the village                                     | the city                                        |
| the order, asks, send                           | the project, requires, deliver                  |
| footings, walls, roof                           | foundation, structure, roof                     |
| stands                                          | operational                                     |
| a free plot, "the smith asks"                   | a vacant plot, unassigned                       |
| the yard, a pile, extend                        | the stockyard, a stockpile, expand              |
| stacked as stones                               | bypasses to stone                               |
| stones, bricks                                  | stone, brick                                    |
| the Beacon, the Storehouse, the Forge           | the Light Tower, the Warehouse, the Foundry     |
| the Great Machine                               | the winding engine                              |
| pit train, sturdy props                         | locomotive, pit props                           |
| time away, the resting pace                     | unattended, night shift output                  |
| the welcome card                                | the shift report                                |

Since 15 Nov 2026 the page does not name the bottleneck, headroom or a limit. Those words stay for the rules, the lab and this document. Since the same day (18:19Z) there are no crews, so "crew" and "crews idle" are not on the page.

The four sites follow his own words of 14 Nov 2026 ("mine, city, refinement, manufacturing"). "Deliver" is what transport does. There is no Deliver button (rule 7).

Words that came after the list he read. All but the first were in the prototype he said "That is right" to, and each is still his to veto:

| Word                          | For                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| the workforce                 | all the workers together. It was "the crew". The four crews that took that word after it went on 15 Nov 2026 (rule 5).    |
| transport, horse wagon, truck | what carries goods to an order. His own words: "horse to truck, trains". Not "haulage", which is the line's second stage. |
| a site                        | one of the four: the mine, the refinery, the factory, the city                                                            |
| an order, place order         | a project or a work order he has placed                                                                                   |
| on hold, resume               | an order he has stopped deliveries to, and started again                                                                  |

Words of 15 Nov 2026. They were on the page of the prototype's ninth version, where he said "the workers do as expected". That was about how the workers behave, not about the words, and he called the same version's table "still not clear". He said "This is great" to the eleventh version, which has all of these on the page, and none was asked about by name. So each is still his to veto.

| Word                                   | For                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| a job                                  | where workers work: drilling, haulage, hoisting, driving, building, the kilns, the saws                        |
| free                                   | a worker on no job                                                                                             |
| with a pick, with a barrow, on a winch | a stage's worker who runs no machine. Never "hands" or "by hand": he said twice that he does not understand it |
| a driver, a builder                    | a worker on driving, and one on building                                                                       |
| the building site                      | where transport puts a project's goods, and the builders build them in                                         |
| idle                                   | a machine, a vehicle or a maker with nobody to run it                                                          |

Words of 15 Nov 2026, from the prototype's versions 13 to 17. "Assigned", "recipe" and "a level" are his own words. He said "a" to the seventeenth version with all of these on the page, and none was asked about by name, so each is still his to veto.

| Word                                | For                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------- |
| drilled rock, rock at the shaft     | a level's two piles. He approved both on 15 Nov 2026, 15:13Z               |
| rock at the kilns, rock at the saws | a maker's own pile                                                         |
| a recipe                            | what a maker takes for one of its good: "2 rock → 1 brick"                 |
| a cage, a trip                      | what a hoist sends down the shaft, and one way down and up again           |
| assigned                            | a hoist that serves one level only                                         |
| both in turn                        | the hoists he has not assigned, which go to the levels one after the other |
| "A drill for which level?"          | the card for a machine's level                                             |

A train on the surface will need a name that is not "locomotive", which is the pit train. That is for the slice that brings it.

## Starting numbers

All for the lab to set. They are the numbers the paper check played, except transport's and the workforce's, which are first guesses that nothing has played. The line's numbers were tuned for workers that spread themselves (#543), so the lab sets them again for one workforce. The lab's part 1 sliver (#655) set part 1's rows: the workers at the start, the cart's rating, the builder, the horse wagon and the Light Tower. #703 set the start again, at one worker, and the room of the two piles. The Light Tower's night shift output stays 45%: a part 1 run ends at its roof, so the lab plays no night with it lit, and it is weighed when part 2's lab plays past the roof. The rows from "The stages apart" to "Recipes" came with rule 5 on 15 Nov 2026. The prototype's numbers in them are made up and run fast. The game's starting values are first guesses that nothing has played (call 71), and the lab sets them before part 3 is switched on (#675).

| Thing                                   | Price                                                                                           | Does                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Worker, cart, hoist, drill              | as #543 set them (60, 600, 6,000, 73,080 stone; ×1.06 and ×1.219)                               | as the line spec                                                                                                                                                                                                                                                                                                                                                                                                               |
| A worker with a tool                    | none                                                                                            | 3 a second of his stage's work (the line spec's worker put on one job)                                                                                                                                                                                                                                                                                                                                                         |
| Workers to run a machine                | none                                                                                            | the line spec's count for each machine. A worker on a machine does no other work                                                                                                                                                                                                                                                                                                                                               |
| The cart in a fresh mine                | as #543 set it                                                                                  | rated ×10 today's (60 a second), so a cart outruns tools at every mark and with Work boots (#655, risk 15)                                                                                                                                                                                                                                                                                                                     |
| Workers at the start                    | given                                                                                           | one, on drilling. Nobody drives the given horse wagon or builds (#703; 21 from #655 until then)                                                                                                                                                                                                                                                                                                                                |
| The drilled rock, the rock at the shaft | none                                                                                            | hold 300 rock each (#703: the casual dad raises the Light Tower's roof on day 2)                                                                                                                                                                                                                                                                                                                                               |
| The stages apart                        | none                                                                                            | a line in balance has the most workers on drilling and the fewest on hoisting (rule 2.14). In the prototype a worker drills 100 a second with a pick, hauls 200 with a barrow and lifts 900 a trip on the winch; a drill takes 3 workers for 600, a cart 2 for 800, a locomotive 3 for 1,600, a hoist 2 for its load                                                                                                           |
| A cage's load                           | none                                                                                            | what the hoist is rated to lift in one trip to the Topsoil and back: its rating times that trip's time. So a hoist with the Topsoil to serve lifts its rating, and what lifts a hoist's rating (marks, upgrades, gear) lifts its load. The winch's cage: what its workers lift with the tool in that time, up to one hoist's load. In the prototype 3,000, and 900 for each worker on the winch                                |
| A cage's trip                           | none                                                                                            | down and up again: 10 s to the Topsoil and 20 s to the Granite. The winding engine's takes a third of that. In the prototype 3 s and 6 s                                                                                                                                                                                                                                                                                       |
| The piles the cages use                 | none                                                                                            | from part 3 the rock at the shaft and a maker's pile hold three loads of the largest cage he owns, and never less than the 300 the lab set (#703, #666), so a cage that comes in turn finds a load and three cages can unload together (rule 5.14). A pile that grows this way takes nothing away (rule 2). The drilled rock stays as the lab set it. Until part 3 the kilns' pile holds 300. In the prototype 9,000 and 3,000 |
| Recipes                                 | none                                                                                            | 2 rock for 1 brick, 3 rock for 1 cut stone, 1 rock for 1 stone. Made up, for the balancing he asked for (rule 3)                                                                                                                                                                                                                                                                                                               |
| A builder                               | none                                                                                            | builds in 8 goods a second, a little less than a horse wagon carries (#655)                                                                                                                                                                                                                                                                                                                                                    |
| The building site                       | none                                                                                            | holds 500 goods, about a minute of a horse wagon (#655 kept it: the saves cap it)                                                                                                                                                                                                                                                                                                                                              |
| Kiln                                    | 15,000 stone, ×1.219                                                                            | 12 brick a second                                                                                                                                                                                                                                                                                                                                                                                                              |
| Saw                                     | 25,000 brick, ×1.219                                                                            | 30 cut stone a second                                                                                                                                                                                                                                                                                                                                                                                                          |
| Tunnel borer                            | 40,000 cut stone, ×1.219                                                                        | rated 1,071, eight workers                                                                                                                                                                                                                                                                                                                                                                                                     |
| Locomotive                              | 60,000 cut stone, ×1.219                                                                        | rated 1,600, eight workers                                                                                                                                                                                                                                                                                                                                                                                                     |
| Horse wagon                             | 500 stone, ×1.219. The first is given.                                                          | carries 9 goods a second, half of the starting line (#655)                                                                                                                                                                                                                                                                                                                                                                     |
| Truck                                   | 150,000 brick, ×1.219                                                                           | carries 400 goods a second                                                                                                                                                                                                                                                                                                                                                                                                     |
| The shaft to the Granite                | 10M stone and 1.5M brick                                                                        | opens the Granite                                                                                                                                                                                                                                                                                                                                                                                                              |
| The stockyard                           | level 0 holds 3M stone, 500K brick, 250K cut stone; a level triples it and costs 150K brick, ×3 | room for a night                                                                                                                                                                                                                                                                                                                                                                                                               |
| The Light Tower                         | 25K, 250K, 1M stone (#655)                                                                      |                                                                                                                                                                                                                                                                                                                                                                                                                                |
| The Warehouse                           | 8M stone and 1M brick; 15M and 4M; 12M brick                                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                |
| The Foundry                             | 15M brick and 4M cut stone; 20M and 15M; 30M and 40M                                            |                                                                                                                                                                                                                                                                                                                                                                                                                                |
| The winding engine                      | cut stone, set by the lab                                                                       | hoisting's second machine: a cage with a hoist's load that travels three times as fast, with four workers in the prototype                                                                                                                                                                                                                                                                                                     |
| A work order                            | today's recipe, without its time. The lab sizes what each requires again.                       | as today                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Paper check

**Out of date since 21:03Z.** The model delivers by hand and at once. It has no transport, no nights that build, and the Light Tower's old power. Its comparisons still say why the rules are what they are (sharing against one level at a time, the locomotive, nights that end at the stockyard). Its days are not to be quoted. The lab's sliver before part 1 takes its place. It also plays the four crews, which went on 15 Nov 2026 (rule 5): where it says crews, read the workers and machines he puts on a level.

A rough model, not the game's lab: `slice-1/slice1-model.py` in the project's shared files. It plays the rules above with these numbers and a plain dad who buys line machines that pay back within six hours, buys makers when they limit their good, expands the stockyard when a stockpile is nearly full, and sends the rest to the project.

| Dad                 | Slice ends | The share left at two and two | One level at a time (the old cage) | Three crews on the Granite | Longest run of sittings on one bottleneck |
| ------------------- | ---------- | ----------------------------- | ---------------------------------- | -------------------------- | ----------------------------------------- |
| Check-in, 4 × 2 min | day 4.8    | day 4.8                       | day 7.0, 20 moves in 29 sittings   | day 5.0                    | 11                                        |
| Casual, 2 × 10 min  | day 5.5    | day 5.5                       | day 10.0, 17 moves in 21 sittings  | day 7.0                    | 6                                         |
| Evening, 1 × 20 min | day 9.0    | day 9.0                       | day 15.0, 14 moves in 16 sittings  | day 12.0                   | 5                                         |

What it shows:

- **The slice takes about five to nine days** with these numbers. The casual dad raises the Light Tower on day 1.5, sinks the shaft on day 2.5, and has the Warehouse on day 4 and the Foundry on day 5.5.
- **Sharing beats one level at a time.** A dad who moves the whole workforce between the levels, as the cage did, needs 45 to 80% more days and moves at most sittings. That is the chore the anti-goal names.
- **The share matters, and it is not a chore.** Three crews on the Granite cost 4 to 33% more days than two and two. One crew there ends half a day sooner for the check-in dad and a day later for the evening dad. A dad who changes the share only when it brings the next need 15% sooner ends on the same day as two and two. So the share is set a few times in a slice. The decisions of every sitting are the bottleneck, the project or the machines, and makers or crews.
- **The bottleneck needs the locomotive.** Without it haulage is the bottleneck for 9 to 18 sittings in a row. With it the longest run is 5 to 11, and hoisting, which has only hoists until the Foundry, is the stage that sticks.
- **Nights end at the stockyard**: about half the long nights, after 16 to 45% of the night. That is too early. The stockyard's room, or what a level adds, has to grow.
- **A dead end exists and is not a lock.** All four crews on the Granite with no saws makes no brick, and saws cost brick. A free move leaves it. The level's row must say it: "No saws yet. The rock bypasses to stone."

What it does not prove: anything about fun, the first hour's pace, the factory, engineers, upgrades, or the winding engine. The lab has to play the slice before any of it is switched on.

## Against the dad-friendly rules

| Rule                       | How the slice meets it                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two minutes                | A sitting is a few buys, a look at the order's numbers, and at times a move of workers, a hoist assigned, or a project put on hold. Every choice holds until changed.                                                                                                                                                                                   |
| Never punishing            | No rock is lost to where he put the workers while the stone stockpile has room. A full stockyard stops the line, part by part, and the cards say when. Nothing in a cage is lost. A level never closes. What has arrived for an order stays. A machine with nobody to run it is idle, not lost. A move, an assigned hoist, on hold and resume are free. |
| Close is pause             | Every tap is saved at once. Unattended time is worked out from timestamps: the stockpile-full moments and what transport delivered. What the cages carry is saved (rule 5.14).                                                                                                                                                                          |
| Real numbers for decisions | Prices, rooms, each level's rock and goods a second, transport's goods a second, what a project still requires, what transport brings a second, what the builders build in a second and how long that takes at this rate.                                                                                                                               |
| Vague discoveries          | The next building and the level below are hints.                                                                                                                                                                                                                                                                                                        |
| The phone never scrolls    | The prototype's screens are held to it. A long list (work orders, plots) scrolls inside its box.                                                                                                                                                                                                                                                        |
| No placeholders            | The prototype is a throwaway outside the game. In the game, a new picture is asked for before it is made.                                                                                                                                                                                                                                               |

## Risks

1. **Hoisting sticks.** It has one machine until the Foundry. The lab measures `narrowRun`. The levers are the hoist's marks, a gear for the hoist, or the winding engine one building earlier. Since rule 5 a trip to the Granite takes twice as long, so in the prototype a mine that works mostly the Granite takes more workers on hoisting than on haulage until the winding engine. That is against rule 2.14, and the lab sets the trip, the load and the workers a hoist takes so that it holds on both levels (`hoistWorkers`).
2. **Where the workers and the hoists are is set once and forgotten.** The model's dad hardly moved the crews. If play shows the same, projects can lean harder on one good, and a full stockpile already makes yesterday's choice wrong.
3. **Transport is a tax, not a decision.** If the right play is always "buy vehicles until transport is not the limit", it is one more row to tap. It earns its place only if he sometimes takes a slower build for a faster mine. The lab measures `transportLimit`. The levers are the vehicles' prices and speeds. If it stays a tax, transport is folded into the project's own speed.
4. **The project eats what he was saving.** Goods leave by themselves now. On hold is the answer, and the first evening is the test: a new player who orders the Light Tower in the first minute must still be able to buy workers. The levers are the first wagon's speed and a teach note. The lab measures `starved`.
5. **Nights do more.** A night now builds as well as fills. That suits a game played in check-ins, and it moves every number the paper check gave.
6. **The factory has no clock.** Today's recipes were sized for ten minutes, an hour and four hours. A recipe that requires little is now done almost at once. The lab sizes them again before part 3.
7. **A new screen is a bigger part 1.** Today's board, its browser checks and its journeys are written again for the prototype's screens in the part that switches them on.
8. **The game is short for a while**: it ends at the Foundry until slice 2 is built.
9. **A lot goes at once**: relics, the pass, depth, the dig button, golden veins. They leave play together, when part 1 is switched on, so the game on his phone is whole before and after.
10. **Cut stone has few uses before the Foundry**: borers and locomotives. The lab checks that it never piles up dead.
11. **Moving workers becomes the chore.** Drivers and builders have nothing to do between orders, so the best play may be to move them into the mine and back at every order. That is the anti-goal. The lab plays one type that sets the workers once for each building and one that moves them whenever a job has nothing to do, and measures `workerMoves` a sitting. If the mover wins by much, the levers are how few drivers and builders a building takes, and how soon the next building can be ordered.
12. **The builders are a second transport.** If the right play is always "enough builders that the site never fills", they are one more row to tap, like risk 3. The lab measures `siteFull`. If they stay a tax, a step is done when its goods arrive, as before, and building is not a job.
13. **The first minute has more to read**: five jobs and a free count before he has bought anything. A fresh mine starts with one worker, on drilling (#703), and the first evening's card says so: he learns the jobs by moving that worker.
14. **Nothing spreads the workers for him.** A stage with no workers moves nothing: the stage before it stops once the pile between them is full, and the stages after it once the pile in front of them is empty (#703). A fresh mine starts with two stages empty on purpose. It is seen, and a free move ends it, but a new player can do it in the first minute. The first evening's journey plays it.
15. **A machine that is not worth its workers.** With today's numbers a worker with a tool, Work boots and the marks of a hundred workers moves more than his share of a cart. Rule 2.5 keeps that from lowering a stage, but it leaves carts idle. The lab sets the numbers so that a machine is worth the workers it takes, and measures `idleMachines`.
16. **A hundred workers, a tap each.** At the game's numbers part 1 has well over a hundred workers, each hired and each placed. The amount key is the answer (call 49), and he has not played it. The lab counts the taps in `workerMoves`.
17. **A machine on the wrong level stays there.** It is not lost: it runs when that level's stage has the workers (rule 2.8). But he cannot take the buy back, and a level he leaves keeps its machines. The lab measures `strandedMachines`: the share of his machines on a level whose stage has nobody. If it bites, a level gets − and + for a machine too, which he was offered and did not take up (call 55).
18. **Stock comes in loads.** A count that stands and then jumps can read as a mine that has stopped. The cages are in view in the shaft, and the Hoisting row says what they lifted on their last trips. Part 3's journey plays it.
19. **The cages as played and the night's rates drift apart.** A night counts rates (rule 5.14). In the prototype the two were up to a tenth apart, and more, until the piles the cages use held three loads; then about 1%, with up to six hoists for both levels, and up to a quarter less with eight. The lab measures `cageGap` and sets the piles, or sends the cages off the top apart.
20. **The mine with two levels is a full page**: two rows on each level, the keys, Hoisting's row and the strip, on a phone that never scrolls. It fits in the prototype at 390 by 672. A third level does not fit the same way, and is slice 2's to solve.
21. **The paper model is rough, and out of date.** It has no transport, and its dad stops buying line machines when they pay back slower than six hours, so the line's late growth is too flat.

## Calls I made

These are mine, not Flemming's. Any of them can be turned over.

1. Depth goes. A level is something he buys, and a building is its door (#645).
2. The slice has three goods, two makers, two levels and three buildings. My first sketch had brick alone and two buildings. With the shaft bought, the lower level needs a good of its own, or sharing the workforce is no decision.
3. Saws come with the Granite, not one level later.
4. Four crews, always placed, moved one at a time. They went on 15 Nov 2026: he asked for workers who are assigned to a level (rule 5).
5. Two crews go to the Granite when it opens. Gone with the crews: nobody works on the Granite until he puts workers there (call 56).
6. The rock's lean goes, because of the shared workforce. This turns over the band table he approved (decision D3), which is his call. It was put to him on 14 Nov 2026 at 19:30Z ("A level's rock no longer speeds or slows machines ('Suits borers' goes), so one stage holds the line, whatever the levels"), and he answered "In principle agree" at 19:31Z.
7. The locomotive opens with the Granite, and the winding engine with the Foundry.
8. Borers and locomotives cost cut stone. Saws, the stockyard and the shaft cost brick.
9. The Light Tower opens the kilns and the stockyard as well as the Granite's price.
10. Settled by the prototype: four sites with a site bar, and the order strip, the stockpiles and Next on every site (What he sees). Today's board goes.
11. Settled by the prototype: the city is a skyline with a plot for each building.
12. Settled by the prototype: the line is three stage rows with what each moves a second (stage plates until 15 Nov 2026). The gauge and the odometer go.
13. Which copy of a save is ahead: a later run stamp (Start over, or a reset), else more rock dug in all, a count that only grows, else the newer `lastSeen`. The run stamp stays the first key, as today. Kid runs are gone, and "more stones mined" becomes "more rock dug in all".
14. The first evenings keep today's eight-hour clock, until the stockyard opens.
15. Kid workers wait for the building that brings them (the School, a later slice).
16. The stockyard is in the refinery and transport is in the city (the prototype). A stage's full list opens from its row, engineers open from the mine, and the Ledger, the sound switch, Start over and, from part 3, keepsakes open from one key on the order strip (mine: the prototype does not show them).
17. A site opens with its part: the mine and the city in part 1, the refinery in part 2, the factory in part 3.
18. Transport is one fleet with one number, bought like a machine. No routes, and nothing to dispatch (rule 7.5).
19. Horse wagons from the first evening, and a fresh mine starts with one wagon and a driver on it (#703 replaced the driver: nobody drives it at the start). Trucks cost brick and open with the Warehouse. Trains wait for a later slice (rule 7.6).
20. Transport is shared evenly between the city's project and the factory's work order, and a work order's clay and iron ride along (rule 7.7 and 7.13).
21. An order can be put on hold and resumed, free (rule 7.10).
22. A building is one order with three steps. The next building waits for his order (rule 6).
23. At night transport runs at the night shift output and delivers. A building finished at night is operational from that moment (rule 7.12).
24. The factory's fixed craft times go with the city's: a work order is done when what it requires has arrived (rule 7.13). His words were about building. I read them as covering the factory too.
25. Machines, makers, vehicles, stockyard levels and the shaft stay instant purchases (rule 7.14).
26. "The workforce" is my word. "Site", "order", "on hold" and "resume" are the prototype's (Names).
27. The clock before the stockyard stops the mine only, and the stockyard opens the moment the Light Tower's roof goes on (rule 4). It is how the prototype plays.
28. Next points only at gear that is done and at a building nobody has ordered, and otherwise counts what is affordable on each site (What he sees, The frame). It was a pointer in a fixed order of buys until his principle of 15 Nov 2026. What it counts is call 50.
29. Night foreman and Overtime go, with the tap-only and vein-only upgrades (Where today's parts land).
30. The lab plays each part before that part is switched on. The five-day floor is checked when it can play the whole slice (Lab).
31. Workers stay. It was his call, and he said yes to it on 15 Nov 2026 (below), with a workforce plate in the mine. The plate became one workforce the same morning (rule 2), and on the screens it is now the frame's count of workers and the workforce list behind it (call 43). No plate in the mine is built.
32. Nothing gates a machine but its price and where it opens: the cart's twelve workers and the order cart, hoist, drill go (rule 2.6). The prototype's, played in its ninth version.
33. A vehicle takes one driver and a maker one worker, and the drivers take the trucks first (rule 2.7). His words name transport and operating. The counts are the prototype's.
34. Builders build in what transport brings, and the building site holds a set amount (rule 7.8). His words name building. The site and its numbers are the prototype's, and he was asked about builders and did not answer on them by name. If he turns it over, a step is done when its goods arrive, as before, and building is not a job.
35. The factory takes no workers in slice 1 (rule 2.12). The prototype does not play it.
36. No upkeep for workers in slice 1 (rule 2.9). His words: "could be that the maintainence cost should go later". If it comes, it must never make a debt or cost him a worker while he is away, because losing the evening is against the game's rules.
37. A fresh mine starts with every worker on a job (rule 2.10). #703 replaced it: Flemming asked for a start with one worker, on drilling.
38. The four crews stay until he has played drilling as one job for each level. He played it in the prototype's fourteenth version, and they went (rule 5).
39. A worker on a machine does no other work. In the line spec he "still lends his hands". With workers he places himself, one worker in two places is a number nobody can check on the page.
40. A stage's workers run the machines that together move the most (rule 2.5). The prototype runs the strongest first. With machines that take different numbers of workers, that can lower a stage when he buys a machine, and the rule that a buy never lowers the line is tested in a fresh mine since #654.
41. What counts workers counts all he has. Work boots and the worker marks lift only a worker with a tool, Loading crews counts haulage's workers, and a promotion takes a free worker (rule 2.9). The lines of Work boots and Loading crews need new words, and those are his to approve when a stage's list is built (#661). Work boots is shown in the workforce (call 45), and #661 builds it there. The upgrades have engineering names (Flemming, 15 Nov 2026, 15:20Z, #711): Work boots, Night foreman, Loading crews and Haul roads, after "this is an engineering game, not some fancy kids game".
42. The count of workers he owns stays where it is in the game, and the save adds the workers on each job (The save). It keeps today's readers of that count as they are.
43. The global place he asked for is the frame's top row: the hire key is beside the count of workers on every site, and a second one is in the workforce list (What he sees). His words are "a global place". Where exactly is the prototype's twelfth version. He was shown it in the project chat with the city's picture, as the change he asked for, and has not answered on it by name. It is not put to him as a question of its own (the coordinator, 15 Nov 2026, 10:05Z): if he objects, the frame and the workforce (#659) change. Three things came with it that he has not played: hiring no longer lights the mine's lamp or counts in Next, the stockpiles drop their room from the top row when there are three, and the first evening's card says where to hire. That card's words are his to approve when it is built (#663).
44. The − and + for a job are in the workforce and also on the job's own site, as he played them. Only hiring moved.
45. A tap on a stage's row opens the stage's full list, and the worker's own upgrades and marks are in the workforce (What the prototype does not show). The prototype shows neither. Both are built in #661.
46. The shift report keeps "Stockyard full: production stopped" and its key to the stockyard. It says what happened in the night, which he asked to see, and it names no buy.
47. While a part is the end of the game, no line promises a thing that is not live, and the state after that part's last roof is a screen of its own (What he sees, While a part is the end of the game). The lines for that state are proposed here and are his to approve when they are built (#662, #663).
48. Part 1's shift report has the bar, with the eight-hour clock as the one thing that stops the mine, and the prototype's line for it. The head's line for a roof that goes on in the night is new and proposed, and his to approve when the report is built (#663). The stockyard's lines come with part 2 (sliver 13). The bar is about the mine only, because transport and the builders go on after it stops. For the report, the unattended rules give more than what was mined: how long the mine produced and how long it stood, what stopped it, what was delivered, the steps finished and when, and the moment the output changed. The shift report's sliver (#663) adds those to the rules.
49. The amount key stays and counts for hiring and for − and + (What he sees, The amount key). The rules move one worker today (`src/workforce.ts`), and the frame's sliver (#659) gives them a count. He has not played it.
50. What Next and the lamps count: every affordable buy on a site with the upgrades in a stage's list, not hiring, and a count of its own for the worker's upgrades. "Nothing affordable yet. Production is running." is shown only when it is true (What he sees).
51. A stage's row has a third state, for machines that stand because the workers' tools move more (The mine). The lab also sets the numbers so that it is rare (risk 15). The other way was to run a machine whenever its stage has the workers, which lets a buy lower the line, and call 40 ruled that out.
52. A building rises by showing its own picture from the ground up behind scaffold, so the three steps need no art of their own. The scaffold is drawn in code, in the game's steel, and so are the city's sky, ground and road, as the frame is. How the city looks is his call, not mine: this is what the city's sliver (#662) builds first and shows him, and it is his to approve there. If he wants pictures in place of any of it, they are asked for one at a time and join the Art list. If the city's plan finds a part of the scene that would be a box where a picture should be (a vacant plot, the goods on the site), it stops and that picture is asked for first (Art).
53. Keepsakes open from the key on the order strip, not from the city. The document said both.
54. What comes up from a level fills its maker's pile first, and the rest bypasses to stone (rule 3). He was asked on the thirteenth version whether the kilns get their rock first or he sets the split. He answered "much is good. but" with six points, none on this, and the coordinator read that as the first. If he wants to set the split, the maker's pile gets a count of its own.
55. A machine stays on the level it is bought for, and with two levels the buy asks which (rule 5.2). His words are about workers ("these are assigned"). That a machine is assigned by where it is bought, and cannot be moved, is mine. He was offered machines that can be moved (the fifteenth version's question, option B) and did not take it up.
56. Nobody works on the Granite when it opens (rule 5.4). It follows from his "should not be split automatic".
57. A hoist for both levels goes strictly in turn and takes what is there, also a part load (rule 5.7). "One at a time" and "in turn" are his. The other way was to send a cage where the most rock waits, which the fifteenth version played: it left a cage standing at an empty level, and what the page said a hoist could lift was not what it lifted.
58. A level with nobody on haulage and no rock at the shaft is left out of the turn (rule 5.7), so a hoist for both does not travel to a level that has nothing.
59. A hoist with one level to serve waits there for a full load, and goes up with less only when no more rock is coming (rule 5.9).
60. The workers on hoisting who run no hoist share one cage on the winch, which serves both levels in turn and carries no more than a hoist's load (rule 5.10). The winch cannot be assigned.
61. A cage whose workers are taken away finishes its trip and unloads (rule 5.11).
62. The piles the cages use hold three loads (Starting numbers).
63. Unattended time counts the hoists as rates. What the cages carry is saved, and where they are in the shaft is not (rule 5.14). The prototype saves the whole cage, place and all, which the game does not need: a cage that starts again at the top with its load loses nothing.
64. The recipes are 2 rock for 1 brick and 3 for 1 cut stone (rule 3). He asked for recipes that are not 1 to 1 and for balancing later. The numbers are made up.
65. Hoists that travel are for every level count, so part 1's and part 2's hoisting changes too. It changes with part 3's switch-on, not before: between switch-ons the game on his phone does not change (How it would be built).
66. The − and + that assign hoists follow the amount key (What he sees, The amount key). He played it with three hoists and a tap for each.
67. The rock's lean stays out, though each level now has its own drilling and haulage (rule 2). Call 6's reason was the shared line. The reason now is that a level already differs in what comes up and in how far the cage travels.
68. Which hoists run when hoisting is short of workers is rule 2.5's: the ones that together lift the most. The prototype runs the Topsoil's first, then the Granite's, then the ones for both, and its strip shows a lot that lifts 0/s.
69. Part 1's plate for the level has no line of crews to take out: #715 removed "4 crews · all rock is hoisted as stone" the same day.
70. A winding engine counts as a hoist where hoists are assigned, and the engines take the assigned places first, the Topsoil's before the Granite's (rule 5.8). It is how the prototype plays, and its strip calls the engine a hoist. The engine opens with the Foundry's roof, at the slice's end, so a count of its own waits for slice 2.
71. The game's starting values for the cages: a trip of 10 s to the Topsoil and 20 s to the Granite, a load that is the hoist's rating times the Topsoil's trip, and piles of three loads of his largest cage (Starting numbers). Nothing has played them. That a deeper level takes a longer trip follows from his "must run down to one level then up". That the winding engine is a faster cage with the same load is the prototype's.
72. With two levels a stage's upgrades, gear, engineer and trouble count on both, and a machine's price and marks count that kind on both levels (rule 5.2). The prototype plays it so. The other way was a set for each level, which doubles every list in the mine.
73. A plain number between − and + for every count he sets, and a recipe wherever a good is made (What any screen has to meet). His words were about the hoists and the refinery.

Calls 54 to 73 came with his answers of 15 Nov 2026 (17:42Z to 18:44Z). Calls 54 to 62, 64, 70 and 72 are played in the prototype's seventeenth version. His "a" to that version was to the strip that assigns the hoists, not to each of them, so each is still his to turn over. Calls 63, 68 and 71 are not as the prototype plays them. Calls 47 to 53 came from the builder's read of the screens, and none of them is in the prototype. Calls 43 to 46 are from the prototype's eleventh version ("This is great") and its twelfth, which moves hiring. Calls 40 to 42 came from the builder's read of the workforce. Calls 32 to 34 and 37 are played in the prototype's ninth version, and he said "the workers do as expected" to it. The principle that the page gives no answers, and one workforce that he moves, are his and are not on this list.

Calls 18 to 24 are played in the prototype's fourth version, and he said "That is right" to it. So is the Light Tower's new power (night shift output at 45%, up from 30%), which is on its card and in the shift report. They stay on this list so that he can still turn one over.

### His two calls (decided 15 Nov 2026)

Both were put to him in the project chat on 14 Nov 2026 as A or B, with A recommended. He answered "A, a" on 15 Nov 2026 at 05:12Z.

**The workforce: the workers stay.** It was the one place where the prototype he played and the rules he approved disagreed.

- **The rules** (the line spec, approved 14 Nov 2026, built in #532 to #535 and tuned in #543): he hires workers. A worker does every job by hand, the free hands go to the slowest stage, and a machine needs workers to run it. The cart opens at twelve workers.
- **The prototype** has no workers to hire. Each stage has machines only, and all three are on sale in the first minute.

He kept the workers (call 31). The reasons given to him were three. With no dig button, the first minutes need something small to buy often, and a worker at 60 stone is that. The hands that fill in at the slowest stage are what keeps a bad buy from being a punishment. And the line's rules and numbers are built and tuned with them. The cost is one more plate in the mine that he has not played.

The other choice was to drop the workers and buy machines only, as he played, with the line's rules and numbers written again.

**What he then played.** He played the plate in the prototype's fifth to ninth versions the same morning and changed it: the workers are one workforce that he hires into and moves between jobs, and no worker moves by himself (rule 2). So the second and third reasons above no longer hold. An idle machine that runs the moment it gets its workers is what now keeps a wrong buy from being a punishment (rule 2.8), and the lab sets the line's numbers again. He said yes to the table of the three stages on 15 Nov 2026 at 09:53Z, in the eleventh version, and asked for hiring to be in a global place (What he sees, The workforce).

**The five-day floor: the whole slice only.** His rule of 14 Nov 2026 (#556) says a run takes at least five days. Part 1 ends at the Light Tower's roof and part 2 at the Warehouse's roof, and each is the end of the game until the next part is live. He decided that the floor is checked on the whole slice only, from a fresh mine to the Foundry's roof, so parts 1 and 2 stay short and he plays the start soon. The other choice was to stretch each part to five days while it is the end of the game. The bound in `src/lab/targets.ts` is still changed only in its lab sliver, as a stop.

## What it changes in the line spec

- "The levels and the cage": replaced by rules 1 and 5 here. The cage issues (#545 to #548) are closed as not planned.
- "The rock moves the narrow stage too": the lean goes (call 6). The line is turned on with part 1 (#664), and the Topsoil has no lean, so the lean never reaches play. Its code goes with today's bands, and the lab sets the numbers again.
- Step 2 ("The cage is the lever", "a maker opens one band after its rock") and step 3 ("Six buildings", "Buildings open the bands", "The end of a run"): slice 1 builds its part of each, with the changes above. The rest waits for its slice.
- "Hands fill in" (step 1, rule 3) and the cart that opens at twelve workers: replaced by rule 2's workforce. He places every worker, a machine takes its workers from its own stage, and a worker on a machine does no other work. "A machine in a stage that already stands at or above that level adds nothing. Its Buys row says so" goes too: the page shows what each stage moves and gives no advice.
- Step 3's "He delivers" (each good has its own Send): replaced by rule 7. He orders, and transport delivers.
- The Workshop's bench clock (`docs/DESIGN.md`, Milestone 9: 10 min, 1 h, 4 h) goes in slice 1's factory (rule 7). The golden-vein recipes go with the veins.
- The line spec's words give way to [Names](#names-approved-14-nov-2026) as each part is built. Its "crew" is the workforce here.
- Decisions 12 and 19 (the kid inherits the village) go with the pass (#642).
- `observable-saves.md`: "else more stones mined" becomes "else more rock dug in all" (call 13). The later run still comes first.

## How it would be built

This spec ships as a PR, and slice 1 is then split into sliver issues under #530. #536 is closed as not planned and its draft (PR #650) closed unmerged: the line is turned on with part 1 (#664), not in today's game. #539's rules move to part 3, and #561 waits for part 1's clean-up (#665). #537 and #538 are closed as not planned: they are built on the new screens as part 1's stage rows and its list by stage (below).

**The slice goes live in three parts, and each part is a game he can play.** A part's rules are built off in play, as the line's were (#532), the lab plays them, and the part's last sliver switches it on. Between switch-ons the game on his phone does not change. So no sliver leaves a hole: nothing that opened at a depth is taken out before the part with its new door is switched on.

| Part | Goes live                                                                                                                                                                                    | The game then ends at  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1    | The mine and the city. The fresh mine: the Topsoil, the line, transport by horse wagon, the Light Tower's project. Relics, the pass, depth, the dig button and golden veins go.              | the Light Tower's roof |
| 2    | Kilns, brick, the stockyard, a night shift that fills the stockyard, the Warehouse's project.                                                                                                | the Warehouse's roof   |
| 3    | The shaft and the Granite, saws, cut stone, borers, locomotives, workers and machines on each level, hoists that travel, the factory's work orders, trucks, the Foundry, the winding engine. | the Foundry's roof     |

- **Until part 2 is live**, the Light Tower opens nothing. Its power counts: the night shift output is 45%. The eight-hour clock stays and the pocket has no limit, so a night after the Light Tower's roof is today's night at 45%. The stockyard, and the rule that the clock goes when it opens (rule 4), come with part 2.
- **Until part 3 is live**, the Granite's price is not shown, the Light Tower opens only the kilns and the stockyard, and the Warehouse does not open trucks. Each part ends with the end card, in words that say more is being built. What the screens say meanwhile, and after a part's last roof, is under [While a part is the end of the game](#while-a-part-is-the-end-of-the-game).
- **Resets the save** when part 1 is switched on. Parts 2 and 3 add facts to the save and should not reset it. If one must, its issue, its PR and the chat say so first.
- Each part's rules are played by the lab before that part is switched on, and the lab sets that part's numbers (as #534 and #543 did for the line). The lab cannot play the whole slice before part 3's rules exist, so part 1 does not wait for it.
- The pass, Legacy, kid runs and Grandpa (#642), the relics, the dig button, golden veins and the Gold rush leave play at part 1's switch-on. Their code is deleted by slivers after it.
- The lean of the rock leaves play at part 1's switch-on too: the Topsoil has none, and no other level is in play until part 3.
- The new screens are built beside today's board, to What he sees, and take its place at part 1's switch-on. They are built with the game's own parts and art, not from the prototype's code. #537 and #538 draw the stages and the buys on today's board and are not started: they are built in the mine instead, as part 1's stage rows and its machines by stage. #539's card for a stage lands there too. #537 and #538 are closed as not planned, and their work is the mine's stage rows (#660) and a stage's list (#661). #539 moves to part 3.

### The slivers, in order

Each becomes an issue under #530 when this spec is merged. The list is the order, not the final cut: a sliver that grows past one sitting is split when it is planned. A sliver marked "off in play" changes nothing on his phone. It is rules, tests and the lab. Every other one is seen in `npm run play`, and on his phone at its part's switch-on.

Part 1, the first evenings:

1. A fresh mine's rules, off in play: one level, no depth, machines that open by what he owns (rule 1), and what leaves the rules with it.
2. Orders and transport, off in play: the Light Tower's project, the fleet, on hold, and unattended time before the stockyard (rules 4, 6, 7).
   - 2a. One workforce, off in play: hiring into the free workers, the jobs on the three stages and driving, moves, machines and vehicles that are idle without their workers, and no gates on a machine (rule 2).
   - 2b. Builders and the building site, off in play (rule 7.8).
3. The lab plays part 1 and sets its numbers: the starting workers and where they start, the line's numbers for one workforce, the horse wagon, the builder, the site, the Light Tower.
4. Art: the Light Tower and a horse wagon. Asked for first.
   - Beside these, and not a sliver of the game: the prototype played the workforce (the prototype's thread, branch `claude/project-thread-eextfa`, versions 5 to 12), under its own issue (#658). His answer of 15 Nov 2026, 09:53Z, is in What he sees. Slivers 3, 5, 6 and 7 waited for it and are released.
5. The frame and the mine, beside today's board: the order strip, the stockpiles with the count of workers, the workforce with its hire key, Next, the site bar (#659); the mountain with each stage in its own part, the row of keys and the three stage rows (#660); and a stage's list, with the worker's upgrades in the workforce (#661). #660 and #661 are in place of #537 and #538. The amount key reaches hiring and − and + in #659.
6. The city: the transport plate with its drivers, the skyline with the building site and its builders, a building that rises in three steps, the project's card and the order key, and the city after the part's last roof.
7. The shift report and the cards: part 1's night (the bar, and the eight-hour clock as what stops the mine), the facts the unattended rules give the report, the first evening's card, and part 1's end card.
8. Part 1 is switched on. **Resets the save.** Today's board goes, and its journeys and visual sections move to the new screens.
9. What part 1 left behind is deleted: relics, the pass, Legacy and kid runs, the generations lab, golden veins and the Gold rush, the dig button, and the upgrades that went.

Part 2, brick and nights:

10. Goods, makers and the stockyard, off in play, with the Warehouse's project and the kilns as a job (rules 2, 3, 4). It is built (#666), with the kilns' own pile and the bypass to stone. It was built before his answer of 15 Nov 2026, so one rock makes one brick.
    - 10a. The kilns' recipe, off in play (#723, rule 3): two rock make one brick, as a number the lab can sweep. The lab's part 2 rows are played again with it.
11. The lab plays parts 1 and 2.
12. Art: a kiln, a brick and the Warehouse. Asked for first.
13. The refinery and the stockyard, and the shift report's stockyard lines: when each stockpile was full, and "Stockyard full: production stopped". The kilns' plate has its recipe, its pile and its unit (What he sees, The refinery).
14. Part 2 is switched on.

Part 3, two levels:

15. The shaft, the Granite and the levels' jobs, off in play: drilling and haulage as jobs on each level, machines bought for a level, nobody on the Granite when it opens, with saws and their pile, cut stone, borers, locomotives and trucks, and the saws as a job (rules 1, 2, 3, 5, 7). His answer is in (15 Nov 2026). Until 15a, hoisting lifts from both levels by what their piles hold, which never reaches play.
    - 15a. Hoists that travel, off in play (#724): a hoist is a cage with a load and a trip, rock is in stock when the cage is at the top, the winch's cage, hoists assigned to a level by number and the rest for both in turn, a night that counts them as rates, and what the cages carry in the save (rule 5.5 to 5.14).
    - 15b. The stages apart (in #675): the lab's numbers for what a worker with a tool moves and what a machine takes on each stage, so that a line in balance has the most workers on drilling and the fewest on hoisting (rule 2.14). With sliver 17.
16. The factory without a clock, off in play (rule 7.13).
17. The lab plays the whole slice, and the five-day floor is checked.
18. Art: a saw, a cut stone, a truck and the Foundry. Asked for first.
19. The mine with two levels: the galleries with each level's rows and piles, the clear shaft with its cages, Hoisting's row and the strip that assigns the hoists, the card for a machine's level, and the card for a level reached. The workforce's groups by level. Saws in the refinery, and trucks in the city.
20. The factory.
21. Part 3 is switched on, with the slice's end card.

### The save

Part 1's switch-on is a new save version, and it resets the save. Each new fact goes in the game map (`src/save-format.ts`) and the ledger (`src/save-ledger.test.ts`), as `observable-saves.md` asks.

| Fact                                                                                                                                                                                                                                                                                                             | From part                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| The levels he has opened                                                                                                                                                                                                                                                                                         | 1 (one level), 3                   |
| Vehicles owned, by kind                                                                                                                                                                                                                                                                                          | 1                                  |
| The buildings that are operational. The project in hand: its step, and what has arrived of each good                                                                                                                                                                                                             | 1                                  |
| The order's state: not ordered, delivering, or on hold                                                                                                                                                                                                                                                           | 1                                  |
| Rock dug in all (for which copy of a save is ahead, call 13)                                                                                                                                                                                                                                                     | 1                                  |
| The workers on each job. The free workers are the rest of the workers he owns                                                                                                                                                                                                                                    | 1, and a job more in parts 2 and 3 |
| What is on the building site, of each good                                                                                                                                                                                                                                                                       | 1                                  |
| Makers owned, by kind. The stockyard's level. A stock of each good (#560)                                                                                                                                                                                                                                        | 2                                  |
| The workers on the Granite's drilling and haulage (two jobs more). The machines on the Granite, by kind: the Topsoil's are the rest of the machines he owns. The Granite's drilled rock and rock at the shaft, and the rock at the saws. The hoists assigned to each level. What the cages carry, for each level | 3                                  |
| The work order: its blueprint, what has arrived, and its state                                                                                                                                                                                                                                                   | 3                                  |

- Leaves the save at part 1: relics, the pass, Legacy and kid runs, depth and the mountain's size, the Gold rush and its bank, and the upgrades that went.
- An order's state is a discriminated union, not a bag of flags. The hoists assigned to the levels are never more than the hoists he owns, and a level's machines are never more than the machines he owns of that kind: the save reader refuses a save where they are. How many workers he owns stays the count the game has today, which the price, the marks and the doors read. The save adds a count for each job, and the free workers are the rest. The reader refuses a count below zero and a save with more workers on jobs than he owns.
- Parts 2 and 3 add facts and bump no version, unless one of them has to take out an id that part 1 shipped. That would be a reset and is said first.

### Proof

| What                                                                                                             | Its proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The rules (levels, the workforce, goods, makers, the stockyard, the levels' jobs, the hoists, orders, transport) | Unit tests on pure rules modules, written first. Property tests where a sum must hold: the hoists assigned are never more than the hoists he owns, what the cages load, carry and unload is what left the shaft (no rock is lost or made in the shaft), the stone stockpile and the makers' piles do not rise while every cage is down (brick and cut stone do: a maker works from its pile), the cages as played and the night's rates agree within a gap the lab sets, for the numbers of hoists a slice 1 mine reaches, a move never changes how many workers he has, one more machine or one more worker never lowers what a stage moves, no rock lost while the stone stockpile has room, never more delivered than required, never more on a site than it holds |
| Unattended time                                                                                                  | Unit tests from timestamps: the clock before the stockyard, part 1's night after the Light Tower's roof (eight hours at 45%, no stockyard), the stockpile-full moments, a step and a building finished at night, a building site that is full, an order on hold, and what the report says of a night: how long the mine produced, how long it stood and what stopped it                                                                                                                                                                                                                                                                                                                                                                                               |
| The pace and the decisions                                                                                       | The lab's named measures (Lab), and the five-day floor (#556) once the lab can play the whole slice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Each site, the workforce and each card                                                                           | A visual section for each at 424×924 and 424×830, with no page scroll, and `npm run play` from a save for each part's states, with the state after the part's last roof among them. Unit tests on what Next and the lamps count (#659): with only a worker affordable the count is zero and no lamp is green, an affordable Work boots gives "Workforce 1", an affordable upgrade in a stage's list counts for the mine, and a stage with no workers does not show "Production is running". A DOM test that every site has the frame's hire key and no other, and that a + with no free worker shows its line (#659, #660)                                                                                                                                            |
| Each part as a game                                                                                              | A journey for each part: the first evening to the Light Tower's roof; a night that fills the stockyard and one that builds; the shaft, workers put on the Granite, a hoist assigned, and the Foundry's roof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The save                                                                                                         | The ledger and the emulator round trip for each new fact, and the reset at part 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

A plan keeps each screen's browser checks green in the sliver that changes that screen. `docs/DESIGN.md`, `docs/design-intent.md`, `docs/ARCHITECTURE.md`, `docs/ui-audit.md`, `.claude/rules/observable-saves.md` and the github-issues skill's road section are updated by the slivers that change what they describe.

## Lab

- The strategy lab plays slice 1 from a fresh mine, as far as the slice is built: to the Light Tower's roof for part 1, the Warehouse's for part 2, and the Foundry's for part 3. The lab's players do not follow Next. One player type puts workers, machines and hoists on the levels by need. One splits them evenly once and leaves every hoist for both levels. One moves the whole workforce between the levels, to keep the old cage's cost in view. Every type buys vehicles when an order's limit is transport, and puts the project on hold when a machine pays back sooner. One never uses on hold, to show what it is worth. Every type also hires and places workers, since nothing does it for him (rule 2.4). It puts a driver on a vehicle it buys and a worker on a maker it buys, and hires one first when no worker is free. It puts the workers a machine takes on that machine's stage when it buys the machine, and hires a worker for its slowest stage when that pays back sooner than a machine. When the builders, not transport, are an order's limit, it adds a builder where it would have bought a vehicle. The lab's players may read the limits the rules work out, though the page does not show them. Two types differ only in when they move workers: one sets them once for each building and leaves them, and one moves them whenever a job has nothing to do. The gap between those two is what the chore would pay (risk 11).
- Named measures, report-only at first: `sliceDays`, `narrowRun`, `shareMoves` a sitting (workers moved between the levels and hoists assigned), `hoistWorkers` (the share of the line's workers who are on hoisting, by which level is worked most), `cageGap` (how far the cages as played and a night's rates are apart), `strandedMachines` (the share of his machines that are on a level whose stage has nobody), `nightFull` (how many long nights end at a full stockyard, and how far into the night), `deadGood` (time a stockpile is full with nothing to spend it on), `transportLimit` (the share of a project's time that transport is its limit), `starved` (time he cannot afford the cheapest buy while an order takes more than half of what the mine makes), `workerMoves` a sitting (the taps that hire workers and the taps that move them, with the amount key on what serves best), `idleWorkers` (the share of the workers who are free or on a job with nothing to do), `siteFull` (the share of a project's time that its site is full), and `idleMachines` (the share of his machines that the workers leave idle because their tools move more).
- The generations lab goes with the pass (#642, Flemming, 14 Nov 2026: the pass goes).
- The finish floor is Flemming's rule of 14 Nov 2026 (#556): a run takes at least five days, with no ceiling. For slice 1 the run ends at the Foundry's roof. He was told so on 14 Nov 2026 at 19:30Z ("At the Forge's roof the slice ends", "tuned to your rule of at least five") and agreed in principle. So the lab tunes the numbers until every player type needs five days or more to the Foundry's roof.
- The floor does not count for part 1 or for part 2 while each is the end of the game. It is checked on the whole slice (Flemming, 15 Nov 2026: [His two calls](#his-two-calls-decided-15-nov-2026)).
- Today's other strict rows (regret, the extreme win, the check-in guardrails) are proposed to carry over, with the Foundry's roof as the finish. The rows about kid runs and relic days (`KID_RUNS_CI`, `KID_RUN_MAX_DAYS` and the like) are proposed to go with the pass and the relics, which he took out (#642, and the relics in the line spec). Nothing here changes `src/lab/targets.ts`. Every change to a bound in it is a stop, and is asked in the lab sliver that makes it (slivers 3, 11 and 17).

## Art (PixelLab, asked for before each)

Nine small pictures, each asked for with its prompt and size before it is made, one a sitting:

- The Light Tower, the Warehouse and the Foundry, for the city and the reveal.
- A kiln and a saw, for Buys.
- A horse wagon and a truck, for Buys and the city.
- A brick and a cut stone, for stockpiles and prices.

Everything else the mine shows exists: the machines, the mine pictures the level rows and the surface are cut from, the steel, and the lamps. The city has two pictures so far, the Light Tower and the horse wagon. Its scene is meant to need no more: a building rises from its own picture, and the scaffold, the sky, the ground and the road are drawn in code (call 52, which is his to approve when the city is built). If the city's plan finds a part that would be a box where a picture should be, that picture is asked for first and joins this list. The prototype's code-drawn skyline is not carried over.
