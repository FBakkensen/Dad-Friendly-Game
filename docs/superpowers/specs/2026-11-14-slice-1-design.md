# Slice 1, the first city: design (14 Nov 2026)

Status: the rules are agreed in principle (Flemming, 14 Nov 2026, 19:30Z) and amended three times since, below. The names are approved. The screens are being settled in the playable prototype, not here, and this spec ships as its own PR once he has said yes to them. Nothing in it is built except the line it stands on (#536 to #539) and the save groundwork (#560, #561). Every number is a starting value for the lab, not a tuned one.

**Amended 14 Nov 2026, 20:30Z.** Flemming: "The golden veins as they were should go, something the player should click as it was, do not fit road to Mars." Golden veins go, and the Gold rush goes with them (a vein's tap starts it). The Beacon (now the Light Tower) had a power about veins, so a new one is proposed below. He also asked for playable prototypes in place of mock pictures: the slice 1 prototype is in `prototypes/slice-1/` on branch `claude/project-thread-eextfa`, and it settles the screens ([What he sees](#what-he-sees)).

**Amended 14 Nov 2026, 20:42Z.** Flemming on the prototype's second version: "This is good, but the red button for the player to mine, do not fit the new road to mars, and some naming needs to change, this an engineering game, one example is gang. That is wrong, there are more." So manual digging goes: there is no dig button and no tap that mines. The player's hands are an engineer's: assign crews, add capacity, order projects and work orders. And the game takes an engineering vocabulary: see [Names](#names-approved-14-nov-2026).

**Amended 14 Nov 2026, 21:03Z.** Flemming on the prototype's third version: "I think the names are right, Yes production should stop when stock is full, but the click to ship to the workshop and city is wrong. The order is by the player, and then do the resources transfer on a speed. Probably something that can be upgraded, like moving from horse to truck, trains maybe, upgraded etc. And the time it takes to build is controlled by the resources not a fixed time". So:

- The names are approved, and this document now uses them throughout.
- A full stockyard stops production. That is rule 4 as it was written, now with his yes.
- No tap delivers goods. He orders a project or a work order, and transport carries the goods there at a speed he can raise, from horse wagons to trucks, and trains later.
- Nothing has a fixed build time. A thing is built when its goods have arrived.

The new rule is [Transport and build time](#7-transport-and-build-time). His four decisions are its first four lines. How slice 1 does them is mine, and is listed under [Calls I made](#calls-i-made).

This design covers many slivers. After his yes it ships as its own PR and is split into sliver issues (`.claude/rules/superpowers.md`). It amends `2026-11-14-line-works-village-design.md` (the line spec): [What it changes in the line spec](#what-it-changes-in-the-line-spec) lists every place.

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

| Stretch                           | What he has                                                                                                                                                               | What is new                                                                                       | The decision                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1. The first evenings             | The Topsoil, workers, carts, hoists, drills, horse wagons. Stone is the only good.                                                                                        | The line (drilling, haulage, hoisting), transport, and the city's first project: the Light Tower. | Capacity at the bottleneck, more transport, or the project on hold for a machine. |
| 2. The Light Tower is operational | Kilns make brick from the Topsoil's rock. The stockyard holds stone and brick.                                                                                            | A made good, and a night shift that fills the stockyard and stops. The Granite has a price.       | Kilns or line machines. The Warehouse first, or the shaft first.                  |
| 3. The shaft is sunk              | Two levels. Saws make cut stone from the Granite's rock. Borers and locomotives cost cut stone. The factory takes work orders. Trucks, once the Warehouse is operational. | Four crews to share between the two levels.                                                       | How many crews on each level, and makers or crews for the good short.             |
| 4. The Foundry's roof             | Three buildings are operational. The winding engine can be built.                                                                                                         | The slice's end card. Play goes on.                                                               | What to do with the stockyard until the next slice.                               |

The loop: the city requires goods, he decides what the mine digs, what it makes and how fast it is carried, and a finished building gives a lasting power and opens the next thing.

## Goals

- He plays the start of the real game on his phone, and it is complete in itself: every part of the loop is there.
- There is a decision in every sitting: the bottleneck, the project or the machines, transport, makers or crews, the stockyard.
- He shares the workforce between levels and sets how many.
- Nothing is started while he is away. A night fills the stockyard he sized and stops there, and transport carries on only with what he ordered. Only his order starts a project or a work order, and only his tap buys or sinks.
- He is an engineer. Nothing is mined by a tap and nothing is delivered by a tap.
- The two-minute sitting stays two minutes.
- Later slices add levels, goods, machines and buildings as rows. Nothing in slice 1 is a closed set.

## Non-goals

- No third level, and no good past cut stone. They are slice 2 and later.
- No second project at a time, no project choice, no market.
- No routes, no map, and no vehicle to dispatch. Transport is one number he raises.
- No slider, and no roster of named workers. A crew is moved one at a time.
- No city to walk around.
- No new engine, tileset or map.

## Anti-goals

- A chore before bed. If moving crews every sitting is the best play, the slice failed.
- A trap. A share of the workforce must never lose rock while the stone stockpile has room: what a maker cannot take bypasses to stone.
- A lock. No state may exist that he cannot leave with a free move or with goods he can still make.

## The rules

### 1. Levels, and no depth

1. The mine is a list of **levels**. Slice 1 has two: the Topsoil and the Granite. A level never runs out and never closes.
2. **Depth goes.** Nothing counts stone mined out of the mountain. There is no bottom, no "stones left" and no mined-out state.
3. **A level is opened by buying it** (#645). "Sink the shaft" is on the level's row, with a real price in goods. The buy is instant and shows the arrival card that a new band shows today.
4. **A building is the door** (the line spec's band doors). The Granite can be sunk once the Light Tower is operational. The level below the Granite waits for the Foundry and for slice 2.
5. What opened at a depth now opens with a level, a building, or a thing he owns:

| Thing                                       | Opens                                       |
| ------------------------------------------- | ------------------------------------------- |
| Mine cart                                   | once he owns twelve workers (the line spec) |
| Hoist                                       | once he owns a cart                         |
| Steam drill                                 | once he owns a hoist                        |
| Horse wagon                                 | from the first evening                      |
| Kilns, the stockyard                        | when the Light Tower is operational         |
| The Granite's price                         | when the Light Tower is operational         |
| Truck                                       | when the Warehouse is operational           |
| Saws, tunnel borer, locomotive, the factory | when the shaft reaches the Granite          |
| Engineers                                   | with the first borer, as today              |
| The winding engine                          | when the Foundry is operational             |

6. Prices that scaled with the band (upgrades, promotions) scale with the deepest level he has opened.

### 2. The line

The line is the line spec's step 1 as #536 to #539 build it: three stages, hands that fill in at the lowest, the stage bays, Buys by stage, engineers and trouble by stage. Slice 1 changes two things.

- **The rock no longer leans on a stage.** The line is the same on every level. "Tough on drills" and "Suits borers" go, and so does the band tag's advice. With the workforce on several levels at once, a lean would give each level its own bottleneck, and the screen could no longer give one answer to "where is the bottleneck". What a level changes is what comes up.
- **The locomotive opens with the Granite**, not with a third level. The paper check shows why: with carts as haulage's only machine, haulage is the bottleneck for 9 to 18 sittings in a row.

### 3. Goods and makers

Three goods. Stone is the everyday good.

| Good      | Comes from                           | Buys                                                                                                               |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Stone     | any level's rock that no maker takes | workers, carts, hoists, drills, kilns, horse wagons, upgrades, the stone part of a work order, projects, the shaft |
| Brick     | kilns, from the Topsoil's rock       | saws, trucks, stockyard levels, projects, the shaft                                                                |
| Cut stone | saws, from the Granite's rock        | borers, locomotives, the winding engine, projects                                                                  |

- **A maker takes one level's rock.** The rock a level's crews dig goes to that level's maker, as fast as the maker can take it. One rock makes one brick or one cut stone. What the maker cannot take bypasses to stone.
- **A maker is bought like a machine** and has ownership marks. It takes no workers, no engineer, no gear and no trouble.
- **A level's good has two limits**: the rock its crews dig there, and its maker. The level's row says which one limits the good ("Limit: kilns").
- **A price is a short list of goods** (#560). In slice 1 only the shaft and the projects require two goods.

### 4. The stockyard and unattended time

As the line spec's step 2, from the day the Light Tower is operational.

- The stockyard has one stockpile for each good. One stockyard level sets the room of all three, and "Expand the stockyard" (brick) raises it. The next stockyard level never costs more than the brick stockpile holds.
- A full stockpile takes no more. Rock for it bypasses to stone. When the stone stockpile is full too, that flow stops. When nothing can flow, the crews idle. (Flemming, 14 Nov 2026: "production should stop when stock is full".)
- There is no dig tap (amended 14 Nov 2026).
- A price above a stockpile's room reads "Needs a bigger stockyard".
- **Unattended**, the mine runs at the night shift output (30%, and 45% once the Light Tower is operational: proposed) until the stockyard is full. Transport keeps delivering to what he ordered (rule 7), so a night with a project open runs longer than one without. The clock cap goes. The shift report says what came in, what was delivered, and what stopped it.
- Before the Light Tower is operational there is no stockyard. The pocket has no limit, transport delivers from it, and unattended time keeps today's rule (30%, eight hours), so the first evening is as simple as now.

### 5. The crews

1. The workforce works in **four crews**. A crew is a quarter of the whole line: the hands and the machines together, not named workers.
2. Each crew works one open level. A level's rock a second is the line's speed times its crews, divided by four.
3. With one level open, all four crews are there and nothing can be moved.
4. When the Granite opens, two crews go there and two stay. He is told once, by a teach note on the Granite's row.
5. He moves one crew at a time from one level to another. A move is free and instant, it is saved at once, and it holds while he is away.
6. The four crews are always placed: no move leaves a crew without a level. How a move is made (a tap, a drag, plus and minus) is the prototype's.
7. The machines are one fleet. A machine bought once works for every crew.
8. **The share holds.** A level whose own stockpile and the stone stockpile are both full can take nothing, so its crews idle. They do not move by themselves to a level that still has room: where they work is his call, and a night ends at his stockyard. That level's row says it ("Crews idle: the stockyard is full"), and the shift report says when it happened.
9. Materials for the factory come from the level a crew digs: clay at the Topsoil, iron at the Granite, at today's rate for the rock dug there, each up to what its band gives in a run today (10 clay, 35 iron), and refilled up to that.

Why crews and not a slider: four steps are enough to match a project, a step is a fat tap, and a number he can say ("three on the Granite") is easier to hold than a percent. More crews can come later as a building's power, which gives a finer share when there are more levels.

### 6. The city

One project at a time. A project is a building, and a building rises in three steps: foundation, structure, roof. With its roof on it is operational: it gives its power and opens the next thing, in the moment a relic's reveal has today.

| Building        | Requires         | Power (the relic's, as approved)                                                           | Opens                                              |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| The Light Tower | stone            | Lights the night: night shift output is 45%, up from 30% (proposed 14 Nov, the veins went) | Kilns, the stockyard, and the Granite's price      |
| The Warehouse   | stone, brick     | The stockyard holds twice as much                                                          | Trucks (proposed)                                  |
| The Foundry     | brick, cut stone | The winding engine can be built                                                            | The level below, in slice 2. The slice's end card. |

- The project is on the screen from the first minute.
- **He orders, and transport delivers** (rule 7). One order covers the whole building: its three steps follow each other with no tap. The next building waits for his order.
- What comes next stays vague: the next building is a hint in the city's words, never a list.
- The Warehouse can be built before or after the shaft is sunk. Both require brick, so which comes first is his call.
- The names are approved (14 Nov 2026). Lines and pictures are his to approve when they are built.

### 7. Transport and build time

Flemming, 14 Nov 2026: "the click to ship to the workshop and city is wrong. The order is by the player, and then do the resources transfer on a speed. Probably something that can be upgraded, like moving from horse to truck, trains maybe, upgraded etc. And the time it takes to build is controlled by the resources not a fixed time".

His decisions:

1. **He gives the order.** A project in the city and a work order in the factory start when he orders them. No tap delivers goods.
2. **Goods move at a speed.** Transport carries what was ordered from the stockyard to where it is needed, in goods a second.
3. **Transport is upgraded in kind**: horse wagons first, then trucks, and trains later.
4. **Nothing has a fixed build time.** A step is done when its goods have arrived. How long that takes is what the mine makes and what transport carries.

How slice 1 does it (mine, under Calls I made):

5. **One fleet, one number.** Transport is a count of vehicles and the goods a second they carry together. A vehicle is bought like a machine and has ownership marks. It takes no workers, no engineer, no gear and no trouble. There are no routes and nothing to dispatch.
6. **Horse wagons from the first evening.** They cost stone. Nothing is dug or carried by hand, so a fresh mine starts with a few workers and one horse wagon. **Trucks** cost brick and open when the Warehouse is operational. Trains wait for a later slice.
7. **A site is where goods go**: the city's project and the factory's work order. Transport carries only what the step in hand still requires, and only what the stockpiles hold. With both sites open each gets half, and what one cannot use goes to the other.
8. **What has arrived stays.** Part deliveries count, and nothing is taken back from a building.
9. **On hold.** He can put a site on hold and resume it. Both are free and instant, are saved at once, and hold while he is away. On hold, nothing leaves the stockyard for that site. This keeps "the project or the machines" a decision now that goods leave by themselves, and it is the free way out when transport takes all the mine makes (the anti-goal's lock).
10. **A site says its limit**, in real numbers, with the time left at this rate: "Limit: transport, 600/s", "Limit: brick, 396/s", "On hold". So he can see whether to buy vehicles, makers or line machines.
11. **Unattended**, transport runs at the night shift output and delivers to what he ordered. The stockyard drains into the site, so the night goes on until the stockyard is full and nothing more is required. A step can finish at night, and the next step of the same building starts. A building whose roof goes on at night becomes operational when he opens the game: the reveal is his to see, and its power counts from then. Nothing new is ordered without him.
12. **The factory.** A work order requires stone and a material. Transport carries the stone, and the material comes from the rock at its own slow rate (rule 5). The work order is done when both are there, so it can wait for the material ("Limit: clay"). Today's fixed craft times (ten minutes, an hour, four hours) go. It is still one station and one work order at a time, and a cancelled work order gives back what arrived, as today. How long gear's effect lasts once it is installed (a blasting charge's twenty minutes) is not a build time and stays.
13. **Buying stays instant.** Machines, makers, vehicles, stockyard levels and the shaft are bought from the stockyard, at the mine, and are there at once. Whether sinking the shaft should be a project with transport is his call. I kept it a purchase, because the goods are already at the mine.

### 8. The end of the slice

When the Foundry's roof is on, a card says the first city is operational and that the road goes on. The winding engine is on sale, so cut stone still has a use. He can play on: nothing stops, and nothing new comes until slice 2. When slice 2 lands, a save keeps its place if the save's shape allows it. If it cannot, the issue, the PR and the chat say "Resets the save" first.

## What he sees

The screens are settled in the playable prototype, not in this document. Flemming asked for prototypes in place of pictures on 14 Nov 2026, after three rounds of mock pictures that he rejected. The prototype is in `prototypes/slice-1/` on branch `claude/project-thread-eextfa`. The rejected mocks stay in `mockups/slice-1/` as a record only. When he has said yes to the prototype, its screens are written in here, and the spec ships.

What stands from his answers: the game has four kinds of work, and each is its own place (his words: "mine, city, refinement, manufacturing").

| Place        | The work      | What he decides                                             | Its pace                                                  | Opens in slice 1              |
| ------------ | ------------- | ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------- |
| The mine     | digging       | how many crews on each level, and which stage gets capacity | every sitting, it never stops                             | part 1                        |
| The refinery | refining      | what the rock becomes, and how much of it                   | set now and then, it runs by itself                       | part 2 (kilns, the stockyard) |
| The factory  | manufacturing | which work order goes on the station next                   | one work order at a time, as fast as its materials arrive | part 3                        |
| The city     | building      | what is built, and how much transport it gets               | a building every day or two, forever                      | part 1                        |

What any screen has to meet, whatever the prototype settles:

- The phone never scrolls. A long list scrolls inside its box.
- The project in hand is in view from the first minute.
- A decision shows real numbers: prices, rooms, each level's rock and goods a second, transport's goods a second, what a site still requires.
- A level, a maker and a site each say their limit in words ("Limit: kilns", "Limit: transport, 600/s").
- No button mines, and no button delivers.
- The lamp rule stays: green for something he can afford, amber for something running, red for trouble, dark for rest.
- No placeholders in the game. A picture that does not exist is asked for first.

**How it reaches Mars.** The mine gets more levels. The refinery gets more makers, and the day a rock has two uses, refining becomes a choice of what the rock goes to. The factory gets more stations and bigger things to make, up to the parts of the rocket. The city gets more plots, and the last place to open is the pad. Transport gets trains. Each of those is a later slice's design, not a rule of slice 1.

**What slice 1 does not have yet.** In slice 1 a level's rock has one maker, so the refinery has one decision: how many makers each good gets. The mine and the city are where slice 1's decisions are. The refinery and the factory are small, real places that later slices fill.

## What goes, and what stays

**Goes:** the dig button and every tap that mines (Flemming, 14 Nov 2026); the Send on a project and the factory's fixed craft times (Flemming, 14 Nov 2026: he orders, transport delivers, and time comes from the resources); golden veins and the Gold rush (Flemming, 14 Nov 2026: a thing to click as it glints does not fit the road to Mars); the relics, their plate, shelf, reveal pictures and Ledger rows; the Lantern's guide bar (the project takes its place); the pass, Legacy, kid runs, Grandpa and the generations lab (#642); depth, the mountain's size and bottom, "stones left", the mined-out state; the band tag's advice and the rock's lean; the away clock once the stockyard is open; relic glimmers from expeditions; kid workers until the building that brings them back.

**Stays:** workers and the six machines of the line; ownership marks; upgrades; the factory and its gear, without its clock (rule 7); engineers, expeditions and trouble; the art, the steel and the lamps; one save for each Google account and everything in `observable-saves.md`.

**Today's board goes** when part 1 is switched on: the odometer, the output gauge, the mine window, the bays and the key rail. The prototype's screens take its place (What he sees).

**Keepsakes** stay as expedition finds. Their page moves from a relic's page to the city.

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

The four places follow his own words of 14 Nov 2026 ("mine, city, refinement, manufacturing"). "Deliver" is what transport does. There is no Deliver button (rule 7).

Words that came after the list he read. They are his to veto:

| Word                          | For                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| the workforce                 | all the workers together. It was "the crew", and a crew is now one of the four.                                         |
| transport, horse wagon, truck | what carries goods to a site. His own words: "horse to truck, trains". Not "haulage", which is the line's second stage. |
| a site                        | where goods are delivered: the city's project and the factory's work order                                              |
| on hold, resume               | a site he has stopped deliveries to, and started again                                                                  |

A train on the surface will need a name that is not "locomotive", which is the pit train. That is for the slice that brings it.

## Starting numbers

All for the lab to set. They are the numbers the paper check played, except transport's, which are first guesses that nothing has played.

| Thing                      | Price                                                                                           | Does                       |
| -------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| Worker, cart, hoist, drill | as #543 set them (60, 600, 6,000, 73,080 stone; ×1.06 and ×1.219)                               | as the line spec           |
| Kiln                       | 15,000 stone, ×1.219                                                                            | 12 brick a second          |
| Saw                        | 25,000 brick, ×1.219                                                                            | 30 cut stone a second      |
| Tunnel borer               | 40,000 cut stone, ×1.219                                                                        | rated 1,071, eight workers |
| Locomotive                 | 60,000 cut stone, ×1.219                                                                        | rated 1,600, eight workers |
| Horse wagon                | 500 stone, ×1.219. The first is given.                                                          | carries 25 goods a second  |
| Truck                      | 150,000 brick, ×1.219                                                                           | carries 400 goods a second |
| The shaft to the Granite   | 10M stone and 1.5M brick                                                                        | opens the Granite          |
| The stockyard              | level 0 holds 3M stone, 500K brick, 250K cut stone; a level triples it and costs 150K brick, ×3 | room for a night           |
| The Light Tower            | 150K, 1.5M, 6M stone                                                                            |                            |
| The Warehouse              | 8M stone and 1M brick; 15M and 4M; 12M brick                                                    |                            |
| The Foundry                | 15M brick and 4M cut stone; 20M and 15M; 30M and 40M                                            |                            |
| The winding engine         | cut stone, set by the lab                                                                       | hoisting's second machine  |
| A work order               | today's recipe, without its time. The lab sizes what each requires again.                       | as today                   |

## Paper check

**Out of date since 21:03Z.** The model delivers by hand and at once. It has no transport, no nights that build, and the Light Tower's old power. Its comparisons still say why the rules are what they are (sharing against one level at a time, the locomotive, nights that end at the stockyard). Its days are not to be quoted. The lab's sliver before part 1 takes its place.

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

| Rule                       | How the slice meets it                                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two minutes                | A sitting is a few buys, a look at what limits the site, and at times a move of crews or a project put on hold. Every choice holds until changed.                                                                     |
| Never punishing            | No rock is lost to a bad share while the stone stockpile has room. A full stockyard idles crews, and the cards say when. A level never closes. What has arrived at a site stays. A move, on hold and resume are free. |
| Close is pause             | Every tap is saved at once. Unattended time is worked out from timestamps: the stockpile-full moments and what transport delivered.                                                                                   |
| Real numbers for decisions | Prices, rooms, each level's rock and goods a second, transport's goods a second, what a project still requires and how long that takes at this rate.                                                                  |
| Vague discoveries          | The next building and the level below are hints.                                                                                                                                                                      |
| The phone never scrolls    | The prototype's screens are held to it. A long list (work orders, plots) scrolls inside its box.                                                                                                                      |
| No placeholders            | The prototype is a throwaway outside the game. In the game, a new picture is asked for before it is made.                                                                                                             |

## Risks

1. **Hoisting sticks.** It has one machine until the Foundry. The lab measures `narrowRun`. The levers are the hoist's marks, a gear for the hoist, or the winding engine one building earlier.
2. **The share is set once and forgotten.** The model's dad hardly moves it. If play shows the same, projects can lean harder on one good, and a full stockpile already makes yesterday's share wrong.
3. **Transport is a tax, not a decision.** If the right play is always "buy vehicles until transport is not the limit", it is one more row to tap. It earns its place only if he sometimes takes a slower build for a faster mine. The lab measures `transportLimit`. The levers are the vehicles' prices and speeds. If it stays a tax, transport is folded into the project's own speed.
4. **The project eats what he was saving.** Goods leave by themselves now. On hold is the answer, and the first evening is the test: a new player who orders the Light Tower in the first minute must still be able to buy workers. The levers are the first wagon's speed and a teach note. The lab measures `starved`.
5. **Nights do more.** A night now builds as well as fills. That suits a game played in check-ins, and it moves every number the paper check gave.
6. **The factory has no clock.** Today's recipes were sized for ten minutes, an hour and four hours. A recipe that requires little is now done almost at once. The lab sizes them again before part 3.
7. **A new screen is a bigger part 1.** Today's board, its browser checks and its journeys are written again for the prototype's screens in the part that switches them on.
8. **The game is short for a while**: it ends at the Foundry until slice 2 is built.
9. **A lot goes at once**: relics, the pass, depth, the dig button, golden veins. They leave play together, when part 1 is switched on, so the game on his phone is whole before and after.
10. **Cut stone has few uses before the Foundry**: borers and locomotives. The lab checks that it never piles up dead.
11. **The paper model is rough, and out of date.** It has no transport, and its dad stops buying line machines when they pay back slower than six hours, so the line's late growth is too flat.

## Calls I made

These are mine, not Flemming's. Any of them can be turned over.

1. Depth goes. A level is a place he buys, and a building is its door (#645).
2. The slice has three goods, two makers, two levels and three buildings. My first sketch had brick alone and two buildings. With the shaft bought, the lower level needs a good of its own, or sharing the workforce is no decision.
3. Saws come with the Granite, not one level later.
4. Four crews, always placed, moved one at a time.
5. Two crews go to the Granite when it opens.
6. The rock's lean goes. This turns over the band table he approved (decision D3), because of the shared workforce.
7. The locomotive opens with the Granite, and the winding engine with the Foundry.
8. Borers and locomotives cost cut stone. Saws, the stockyard and the shaft cost brick.
9. The Light Tower opens the kilns and the stockyard as well as the Granite's price.
10. Withdrawn. It was the screen as four places with a tab bar. The four kinds of work stand, in his words. How they look is the prototype's.
11. Withdrawn. It was the city as a tile for each plot. The prototype's.
12. Withdrawn. It was the three stage plates. The prototype's.
13. Which copy of a save is ahead: a later run stamp (Start over, or a reset), else more rock dug in all, a count that only grows, else the newer `lastSeen`. The run stamp stays the first key, as today. Kid runs are gone, and "more stones mined" becomes "more rock dug in all".
14. The first evenings keep today's eight-hour clock, until the stockyard opens.
15. Kid workers wait for the building that brings them (the School, a later slice).
16. Withdrawn. It was where the stockyard, Upgrades, Engineers, the Ledger and Keepsakes are on the screen. The prototype's.
17. A kind of work opens with its part: the mine and the city in part 1, the refinery in part 2, the factory in part 3.
18. Transport is one fleet with one number, bought like a machine. No routes, and nothing to dispatch (rule 7.5).
19. Horse wagons from the first evening, and a fresh mine starts with a few workers and one wagon. Trucks cost brick and open with the Warehouse. Trains wait for a later slice (rule 7.6).
20. Transport is shared evenly between the city's project and the factory's work order (rule 7.7).
21. A site can be put on hold and resumed, free (rule 7.9).
22. A building is one order with three steps. The next building waits for his order (rule 6).
23. At night transport runs at the night shift output and delivers. A building finished at night becomes operational when he opens the game (rule 7.11).
24. The factory's fixed craft times go with the city's: a work order is done when what it requires has arrived (rule 7.12). His words were about building. I read them as covering the factory too.
25. Machines, makers, vehicles, stockyard levels and the shaft stay instant purchases (rule 7.13).
26. "The workforce", "a site", "on hold" and "resume" are my words (Names).

Not mine, and still open: the Light Tower's power (night shift output at 45%, up from 30%) was proposed with the prototype when the veins went, and waits for his yes.

## What it changes in the line spec

- "The levels and the cage": replaced by rules 1 and 5 here. The cage issues (#545 to #548) are closed as not planned.
- "The rock moves the narrow stage too": the lean goes (call 6). #536 turns the line on with the lean, as #543 tuned it. A slice 1 sliver takes it out, and the lab sets the numbers again.
- Step 2 ("The cage is the lever", "a maker opens one band after its rock") and step 3 ("Six buildings", "Buildings open the bands", "The end of a run"): slice 1 builds its part of each, with the changes above. The rest waits for its slice.
- Step 3's "He delivers" (each good has its own Send): replaced by rule 7. He orders, and transport delivers.
- The Workshop's bench clock (`docs/DESIGN.md`, Milestone 9: 10 min, 1 h, 4 h) goes in slice 1's factory (rule 7). The golden-vein recipes go with the veins.
- The line spec's words give way to [Names](#names-approved-14-nov-2026) as each part is built. Its "crew" is the workforce here.
- Decisions 12 and 19 (the kid inherits the village) go with the pass (#642).
- `observable-saves.md`: "else more stones mined" becomes "else more rock dug in all" (call 13). The later run still comes first.

## How it would be built

After his yes to the prototype's screens, this spec ships as a PR, and slice 1 is split into sliver issues under #530. The line (#536 to #539) and the save groundwork (#560, #561) go on unchanged.

**The slice goes live in three parts, and each part is a game he can play.** A part's rules are built off in play, as the line's were (#532), the lab plays them, and the part's last sliver switches it on. Between switch-ons the game on his phone does not change. So no sliver leaves a hole: nothing that opened at a depth is taken out before the part with its new door is switched on.

| Part | Goes live                                                                                                                                                                       | The game then ends at  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1    | The mine and the city. The fresh mine: the Topsoil, the line, transport by horse wagon, the Light Tower's project. Relics, the pass, depth, the dig button and golden veins go. | the Light Tower's roof |
| 2    | Kilns, brick, the stockyard, a night shift that fills the stockyard, the Warehouse's project.                                                                                   | the Warehouse's roof   |
| 3    | The shaft and the Granite, saws, cut stone, borers, locomotives, the crews, the factory's work orders, trucks, the Foundry, the winding engine.                                 | the Foundry's roof     |

- Until part 3 is live, the Granite's price is not shown, the Light Tower opens only the kilns and the stockyard, and the Warehouse does not open trucks. Each part ends with the end card, in words that say more is being built.
- **Resets the save** when part 1 is switched on. Parts 2 and 3 add facts to the save and should not reset it. If one must, its issue, its PR and the chat say so first.
- Before part 1: one sliver where the lab plays the whole slice, off in play, and sets the starting numbers (as #534 and #543 did for the line). It reports each part's end as well as the slice's.
- The pass, Legacy, kid runs and Grandpa (#642), the relics, the dig button, golden veins and the Gold rush leave play at part 1's switch-on. Their code is deleted by slivers after it.
- The lean of the rock leaves play at part 1's switch-on too: the Topsoil has none, and no other level is in play until part 3.
- The new screens are built beside today's board, to the prototype he said yes to, and take its place at part 1's switch-on. #537 and #538 draw the stages and the buys on today's board and are not started: they are built in the mine instead, as part 1's stage plates and its machines by stage. #539's card for a stage lands there too. #536, the line's rules, goes on unchanged.

A plan keeps each screen's browser checks green in the sliver that changes that screen. `docs/DESIGN.md`, `docs/design-intent.md`, `docs/ARCHITECTURE.md`, `docs/ui-audit.md`, `.claude/rules/observable-saves.md` and the github-issues skill's road section are updated by the slivers that change what they describe.

## Lab

- The strategy lab plays slice 1 from a fresh mine to the Foundry's roof. One player type shares the crews by need. One leaves them at two and two. One moves the whole workforce, to keep the old cage's cost in view. Every type buys vehicles when a site's limit is transport, and puts the project on hold when a machine pays back sooner. One never uses on hold, to show what it is worth.
- Named measures, report-only at first: `sliceDays`, `narrowRun`, `shareMoves` a sitting, `nightFull` (how many long nights end at a full stockyard, and how far into the night), `deadGood` (time a stockpile is full with nothing to spend it on), `transportLimit` (the share of a project's time that transport is its limit), and `starved` (time he cannot afford the cheapest buy while a site takes more than half of what the mine makes).
- The generations lab goes with the pass.
- The finish floor is Flemming's rule of 14 Nov 2026 (#556): a run takes at least five days, with no ceiling. For slice 1 the run ends at the Foundry's roof, so the lab tunes the numbers until every player type needs five days or more. Parts 1 and 2 have no floor of their own.
- Today's other strict rows (regret, the extreme win, the check-in guardrails) carry over, with the Foundry's roof as the finish. The rows about kid runs and relic days go with the pass and the relics. Any other change to a bound in `src/lab/targets.ts` is a stop, and is asked.

## Art (PixelLab, asked for before each)

Nine small pictures, each asked for with its prompt and size before it is made, one a sitting:

- The Light Tower, the Warehouse and the Foundry, for the city and the reveal.
- A kiln and a saw, for Buys.
- A horse wagon and a truck, for Buys and the city.
- A brick and a cut stone, for stockpiles and prices.

Everything else the slice shows exists: the machines, the mine pictures the level rows and the surface are cut from, the steel, and the lamps.
