# Slice 1, the first city: design (14 Nov 2026)

Status: approved for its PR. Flemming agreed to the rules in principle (14 Nov 2026, 19:30Z), amended them three times the same evening, and said "That is right" to the playable prototype that plays them (21:35Z). The names are approved. It stands on the line (#532 to #535 and #543 are merged, behind their switch) and on the save groundwork (#560 is merged, #561 is open). #536, which would have turned the line on in today's game, is closed as not planned (Flemming, 14 Nov 2026, 21:47Z: nothing more is built on today's version), so the line is turned on with part 1 (#664). The fresh mine's rules are built off in play, behind the `fresh.off` switch (#653). The workers' rules were changed on 15 Nov 2026 (one workforce, below), and the screens wait for his yes to a version of the prototype. Every number is a starting value for the lab, not a tuned one.

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

The new rule is [The workforce](#2-the-line-and-the-workforce), and rules 1, 3 and 7 follow it. What is his and what is mine in it is under [Calls I made](#calls-i-made). **The screens do not follow yet.** He has not said yes to the mine's table (he called version 9's "still not clear"), so [What he sees](#what-he-sees) is out of date wherever it names a limit, the bottleneck or a buy, or says "hands". It is rewritten from the version of the prototype he says yes to, and the issues that build the screens wait for that (#658).

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

| Stretch                           | What he has                                                                                                                                                               | What is new                                                                                       | The decision                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. The first evenings             | The Topsoil, workers, carts, hoists, drills, horse wagons. Stone is the only good.                                                                                        | The line (drilling, haulage, hoisting), transport, and the city's first project: the Light Tower. | Where the workers work, a worker or a machine, more transport, or the project on hold. |
| 2. The Light Tower is operational | Kilns make brick from the Topsoil's rock. The stockyard holds stone and brick.                                                                                            | A made good, and a night shift that fills the stockyard and stops. The Granite has a price.       | Kilns or line machines. The Warehouse first, or the shaft first.                       |
| 3. The shaft is sunk              | Two levels. Saws make cut stone from the Granite's rock. Borers and locomotives cost cut stone. The factory takes work orders. Trucks, once the Warehouse is operational. | Four crews to share between the two levels.                                                       | How many crews on each level, and makers or crews for the good short.                  |
| 4. The Foundry's roof             | Three buildings are operational. The winding engine can be built.                                                                                                         | The slice's end card. Play goes on.                                                               | What to do with the stockyard until the next slice.                                    |

The loop: the city requires goods, he decides what the mine digs, what it makes and how fast it is carried, and a finished building gives a lasting power and opens the next thing.

## Goals

- He plays the start of the real game on his phone, and it is complete in itself: every part of the loop is there.
- There is a decision in every sitting: where the workers work, the bottleneck, the project or the machines, transport, makers or crews, the stockyard.
- The workers are one workforce. He sees how many there are, where they work and how many are free, and he moves them.
- The page shows the numbers and never the answer. Working out the balance is the game.
- He shares the workforce between levels and sets how many.
- Nothing is started while he is away. A night fills the stockyard he sized and stops there, and transport carries on only with what he ordered. Only his order starts a project or a work order, and only his tap buys or sinks.
- He is an engineer. Nothing is mined by a tap and nothing is delivered by a tap.
- The two-minute sitting stays two minutes.
- Later slices add levels, goods, machines and buildings as rows. Nothing in slice 1 is a closed set.

## Non-goals

- No third level, and no good past cut stone. They are slice 2 and later.
- No second project at a time, no project choice, no market.
- No routes, no map, and no vehicle to dispatch. Transport is one number he raises.
- No slider, and no roster of named workers. A worker and a crew are moved one at a time.
- No upkeep for workers. He named it as a possible later step (15 Nov 2026), and it is an idea for a later slice.
- No city to walk around.
- No new engine, tileset or map.

## Anti-goals

- A chore before bed. If moving crews or workers every sitting is the best play, the slice failed.
- An answer on the page. If a plate says which stage to fix or which thing to buy, there is nothing left to work out.
- A trap. A share of the workforce must never lose rock while the stone stockpile has room: what a maker cannot take bypasses to stone.
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

The line is the line spec's step 1 (its rules are #532 to #535): three stages, drilling, haulage and hoisting, and the slowest stage sets what the line moves. Engineers and trouble belong to a stage. Slice 1 changes three things.

- **The rock no longer leans on a stage.** The line is the same on every level. "Tough on drills" and "Suits borers" go, and so does the band tag's advice. With the workforce on several levels at once, a lean would give each level its own slowest stage, and the three numbers of the line would no longer be the whole picture. What a level changes is what comes up.
- **The locomotive opens with the Granite**, not with a third level. The paper check shows why: with carts as haulage's only machine, haulage is the bottleneck for 9 to 18 sittings in a row.
- **The workers are one workforce**, below. In the line spec the workers spread themselves to the slowest stage, and the cart waited for twelve workers. Both go.

**The workforce.** Flemming, 15 Nov 2026: "workers should be a global ressource, that should be used for almost anything, like transport, operating, drillings, building". And on the prototype's ninth version, which plays the rules below: "the workers do as expected".

1. **One workforce.** Every worker is in one pool. A worker is on a job, or free.
2. **He hires a worker**, who starts free. The price is in stone and rises with the number of workers he has. It is one price, whatever job the worker goes to.
3. **A job is where workers work.** A job opens with the thing it works on:

| Job                         | Opens                               | What a worker does there                           |
| --------------------------- | ----------------------------------- | -------------------------------------------------- |
| Drilling, haulage, hoisting | from the first evening              | runs a machine of that stage, or works with a tool |
| Driving                     | from the first evening              | drives one vehicle                                 |
| Building                    | from the first evening              | builds in what is on the building site (rule 7)    |
| The kilns                   | when the Light Tower is operational | runs one kiln                                      |
| The saws                    | when the shaft reaches the Granite  | runs one saw                                       |

4. **He moves one worker at a time**: a free worker onto a job, or a worker off a job. A move is free and instant, it is saved at once, and it holds while he is away. Nothing moves a worker for him, at any time.
5. **A stage's workers run its machines.** A machine takes a set number of workers and is idle until its stage has them. The stage's other workers work with a tool: a pick, a barrow or a winch. A stage moves what its running machines and its workers with tools move together, and the line moves what its slowest stage moves. Which machines run is not his to set: the workers run the machines that together move the most, and stay on their tools where that moves more. So one more machine or one more worker never lowers what a stage moves. In the prototype that is the strongest machines first, which is the same with its numbers.
6. **A machine can be bought before anyone can run it.** Nothing gates a machine but its price and where it opens (rule 1). The cart no longer waits for twelve workers, and the hoist and the drill no longer wait for the machine before them.
7. **A vehicle runs with one driver, and a kiln or a saw with one worker.** The drivers take the trucks first. One with nobody on it is idle.
8. **A machine, a vehicle or a maker that is idle is not lost.** It runs from the moment its job has the workers. This is what keeps a wrong buy from being a punishment, now that no worker moves by himself.
9. **A free worker does no work and costs nothing.** There is no upkeep in slice 1. What counts workers counts all he has, free or not: the worker's price, the worker marks, and a door that opens at a number of workers. Better boots and the worker marks lift a worker with a tool on the three stages. They do not lift a machine, a driver or a builder. Helping hands counts the workers on haulage. A promotion takes a free worker.
10. **A fresh mine starts with every worker on a job**, so it runs before he has touched anything. In the prototype that is twelve workers: three on each stage, one driver and two builders, with one horse wagon. The lab sets the count.
11. **Unattended**, the workers stay where he left them, and every job works at the night shift output.
12. **The factory takes no workers** in slice 1. The station makes a work order from what transport brings (rule 7.13).
13. **The levels are still shared by crews** (rule 5), until he has played the other way.

**Until part 1 is switched on**, the line stays off in play, as it is on `main` behind its switch (#532). It is not turned on in today's game: #536 is closed as not planned, and nothing more is built on today's version (Flemming, 14 Nov 2026, 21:47Z). The line is turned on with part 1 (#664), without the lean. #537 and #538 are not built on today's board, and neither is #539's card: they are built on the new screens (How it would be built). #539's rules, engineers and trouble by stage, are built in part 3. The fresh mine's rules run beside today's game behind their own switch, `fresh.off`, which turns the line on with them (#653).

### 3. Goods and makers

Three goods. Stone is the everyday good.

| Good      | Comes from                           | Buys                                                                                                               |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Stone     | any level's rock that no maker takes | workers, carts, hoists, drills, kilns, horse wagons, upgrades, the stone part of a work order, projects, the shaft |
| Brick     | kilns, from the Topsoil's rock       | saws, trucks, stockyard levels, promotions, projects, the shaft                                                    |
| Cut stone | saws, from the Granite's rock        | borers, locomotives, the winding engine, projects                                                                  |

- **A maker takes one level's rock.** The rock a level's crews dig goes to that level's maker, as fast as the maker can take it. One rock makes one brick or one cut stone. What the maker cannot take bypasses to stone.
- **A maker is bought like a machine** and has ownership marks. It runs with one worker on its job (rule 2.7). It takes no engineer, no gear and no trouble.
- **A level's good has two limits**: the rock its crews dig there, and what its running makers can take. The page shows both numbers and does not name the one that limits (the principle of 15 Nov 2026).
- **A price is a short list of goods** (#560). In slice 1 only the shaft and the projects require two goods.

### 4. The stockyard and unattended time

As the line spec's step 2, from the day the Light Tower is operational.

- The stockyard has one stockpile for each good. One stockyard level sets the room of all three, and "Expand the stockyard" (brick) raises it. The next stockyard level never costs more than the brick stockpile holds.
- A full stockpile takes no more. Rock for it bypasses to stone. When the stone stockpile is full too, that flow stops. When nothing can flow, the crews idle. (Flemming, 14 Nov 2026: "production should stop when stock is full".)
- There is no dig tap (amended 14 Nov 2026).
- A price above a stockpile's room reads "Needs a bigger stockyard".
- **Unattended**, the mine runs at the night shift output (30%, and 45% once the Light Tower is operational) until the stockyard is full. Transport keeps delivering to what he ordered (rule 7), so a night with a project open runs longer than one without. The clock cap goes. The shift report says what came in, what was delivered, and what stopped it.
- **Before the Light Tower is operational** there is no stockyard, and the pocket has no limit. Unattended, the mine keeps today's rule: 30%, for at most eight hours. The clock stops the mine only. Transport goes on delivering from the pocket until the order has what it requires or the pocket is empty (as the prototype plays it). When the Light Tower's roof goes on, at night or not, the stockyard opens in that moment and the clock goes: the mine runs from then until the stockyard is full.
- When the stockyard opens, or when a stockpile holds more than its room for any other reason, nothing is taken away. The stockpile takes no more until it is under its room again.

### 5. The crews

1. The line works in **four crews**. A crew is a quarter of what the line moves, not named workers.
2. Each crew works one open level. A level's rock a second is the line's speed times its crews, divided by four.
3. With one level open, all four crews are there and nothing can be moved.
4. When the Granite opens, two crews go there and two stay. He is told once, by a teach note on the Granite's row.
5. He moves one crew at a time from one level to another. A move is free and instant, it is saved at once, and it holds while he is away.
6. The four crews are always placed: no move leaves a crew without a level. How a move is made (a tap, a drag, plus and minus) is the prototype's.
7. The machines are one fleet. A machine bought once works for every crew.
8. **The share holds.** A level whose own stockpile and the stone stockpile are both full can take nothing, so its crews idle. They do not move by themselves to a level that still has room: where they work is his call, and a night ends at his stockyard. That level's row says it ("Crews idle: the stockyard is full"), and the shift report says when it happened.
9. Materials for the factory come from the level a crew digs: clay at the Topsoil, iron at the Granite, at today's rate for the rock dug there, each up to what its band gives in a run today (10 clay, 35 iron), and refilled up to that.

**To be played again.** With one workforce (rule 2), the crews are a second way to share the same workers. The prototype will play drilling as one job for each level, in place of the four crews, and he is asked then. That is settled before part 3's rules are built (#673). Until then this rule stands.

Why crews and not a slider: four steps are enough to match a project, a step is a fat tap, and a number he can say ("three on the Granite") is easier to hold than a percent. More crews can come later as a building's power, which gives a finer share when there are more levels.

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
6. **Horse wagons from the first evening.** They cost stone. Nothing reaches an order without a vehicle, so a fresh mine starts with one horse wagon and a driver on it. **Trucks** cost brick and open when the Warehouse is operational. Trains wait for a later slice.
7. **An order is what transport serves**: the city's project and the factory's work order, once he has placed them. Transport carries only what the step in hand still requires, and only what the stockpiles hold. With both open each gets half, and what one cannot use goes to the other.
8. **The building site and the builders.** Transport brings a project's goods to its building site. The site holds a set amount, and transport brings no more until the builders have made room. A builder builds in a set amount a second. A step is done when what it requires is built in, not when it has arrived. His words name building as work for the workers. The site and its numbers are the prototype's, and he has not answered on them by name (call 34).
9. **What has arrived stays.** Part deliveries count, and nothing is taken back from a site or a building.
10. **On hold.** He can put an order on hold and resume it. Both are free and instant, are saved at once, and hold while he is away. On hold, nothing leaves the stockyard for that order. The builders still build in what is on the site. This keeps "the project or the machines" a decision now that goods leave by themselves, and it is the free way out when transport takes all the mine makes (the anti-goal's lock).
11. **An order shows its numbers**: what transport brings a second, what the builders build in a second, what is on the site, and what the step still requires. It names no limit (the principle of 15 Nov 2026). How it reads is the prototype's. The rules still work the limit out, for the lab.
12. **Unattended**, the drivers and the builders work at the night shift output, and transport delivers to what he ordered. The stockyard drains into the order, so the night goes on until the stockyard is full and nothing more is required. A full building site stops transport to it, as a full stockyard stops production. A step can finish at night, and the next step of the same building starts. A building whose roof goes on at night is operational from that moment: its power counts for the rest of the night, the shift report says so, and its card is shown after the report. Nothing new is ordered without him.
13. **The factory.** A work order requires stone and a material. The material comes from the rock at its own slow rate (rule 5), and transport carries both to the station: one clay or one iron counts as 500 stone of a load. The station has no building site and no builders: the work order is done when everything it requires has arrived, so it can wait for a material that is short. Today's fixed craft times (ten minutes, an hour, four hours) go. It is still one station and one work order at a time, and a cancelled work order gives back what arrived, as today. How long gear's effect lasts once it is installed (a blasting charge's twenty minutes) is not a build time and stays.
14. **Buying stays instant.** Machines, makers, vehicles, stockyard levels and the shaft are bought from the stockyard, at the mine, and are there at once. Whether sinking the shaft should be a project with transport is his call. I kept it a purchase, because the goods are already at the mine.

### 8. The end of the slice

When the Foundry's roof is on, a card says the first city is operational and that the road goes on. The winding engine is on sale, so cut stone still has a use. He can play on: nothing stops, and nothing new comes until slice 2. When slice 2 lands, a save keeps its place if the save's shape allows it. If it cannot, the issue, the PR and the chat say "Resets the save" first.

## What he sees

The screens were settled in a playable prototype, not in pictures. Flemming rejected three rounds of mock pictures on 14 Nov 2026 and asked for a prototype in their place. He played four versions of it that evening: "That has potential", "It works great" (the third), and "That is right" (the fourth, 21:35Z).

- The prototype is a throwaway outside the game: `prototypes/slice-1/` on branch `claude/project-thread-eextfa`, commit `bae1b36`. Its numbers are made up and run fast. It is drawn with sprites that exist and shapes made in code.
- What it settles is the layout, the flow and the words. This section writes them down. The pictures of it are in `docs/superpowers/specs/slice-1/`.
- What it does not settle is the art (see Art) and the numbers (the lab).

**Out of date in part since 15 Nov 2026.** This section is written from the fourth version. He has played versions 5 to 9 since, and the tenth is with him. What changed is in the head of this document: one workforce, and a page that never names the bottleneck, a limit or a best buy. So these lines below no longer hold, and nothing is built from them:

- The frame: Next names no buy. In the versions he played it points only at gear that is done and at a building nobody has ordered, and counts the rest for each site.
- The mine: the stage plates ("bottleneck", "headroom", a lit stage, "Cart: at 12 workers") and the workforce plate with its "hands".
- The refinery: "Bottleneck: kilns".
- The city: the order key's "limit: transport", and a transport plate with no drivers and no builders.
- The cards: a shift report that names what stopped the night with a key to the fix.

What takes their place is in the prototype (`prototypes/slice-1/README.md` lists what each version plays; `main` has the seventh version, and the later ones are on branch `claude/project-thread-eextfa` until its next PR): a count of workers and free workers beside the stockpiles on every site, which opens a list of all the jobs; a row for each stage with what it moves now, who works with what, and − and + for its workers; and the state shown in the scene, with rock that piles up, tubs that run empty, and workers, machines and wagons that stand idle. This section is rewritten from the version he says yes to (#658), as it was from the fourth.

### Four sites

The game has four kinds of work (his words: "mine, city, refinement, manufacturing"), and each is a site with its own scene.

| Site         | The work      | What he decides                                             | Its pace                                                  | Opens in slice 1              |
| ------------ | ------------- | ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------- |
| The mine     | digging       | how many crews on each level, and which stage gets capacity | every sitting, it never stops                             | part 1                        |
| The refinery | refining      | what the rock becomes, and how much of it                   | set now and then, it runs by itself                       | part 2 (kilns, the stockyard) |
| The factory  | manufacturing | which work order goes on the station next                   | one work order at a time, as fast as its materials arrive | part 3                        |
| The city     | building      | what is built, and how much transport it gets               | a building every day or two, forever                      | part 1                        |

### The frame, the same on every site

From top to bottom:

1. **The order strip.** The project in hand, its step and its state ("Foundation · not ordered", "Roof · delivering", "on hold"), what the step requires with its counts, and a pip for each of the three steps.
2. **The stockpiles.** One for each good he has met, with its room once the stockyard is open ("48K of 400K"), and "full" in red.
3. **The site's scene**, which fills the middle.
4. **Next.** One thing that is ready and the site it is on ("Next · City: Order the Light Tower"), with a count of everything he can afford or start now. A tap goes there. With nothing ready it reads "Nothing affordable yet. Production is running." Next is a pointer in a fixed order, not advice on payback: which thing to buy stays his (the line spec). The order is the prototype's: install gear that is done; order the building when none is ordered; sink the shaft; the bottleneck stage's next buy; a maker that is its good's limit; expand the stockyard when a stockpile is nearly full; a vehicle while an order is open; resume an order on hold; a work order; then everything else he can afford. It takes the Ready now plate's place, and "Saving for" goes with it.
5. **The site bar.** A tab for each open site, with its lamp. A site joins the bar when its work opens: the mine and the city on the first evening, the refinery with the Light Tower, the factory with the shaft. A swipe changes site too.

### The mine (`first-evening.png`, `mine.png`)

- The mountain cut open: the winding tower on the surface, the shaft down the left side, and a gallery for each level with its crews at work in it.
- A level's plate has its name, its rock a second, and one line: its crews, its good and its limit ("2 of 4 crews · brick 400/s · limit: kilns"). With one level it reads "4 crews · all rock is hoisted as stone".
- A crew is moved by a tap on an empty spot in a gallery ("assign crew") or by a drag from one level to the other.
- A level that is not reached says what it waits for ("The shaft can be sunk once the Light Tower is operational"), and then its price. Under the last level: "Deeper strata: not yet surveyed. The city has to grow first."
- At the foot are the three stage plates: drilling, haulage, hoisting. Each has its rate, "bottleneck" or its headroom ("+200/s headroom"), and a key for its next machine with the price. The bottleneck is lit. The key buys, as he played it. A machine that is not on sale yet says what it waits for on the key ("Cart: at 12 workers"), and a machine with no free workers to run it says that ("Needs 8 free workers"). A tap on the rest of the plate opens the stage's full list.
- **The workforce plate** is over the stage plates: how many workers there are, where the free hands help ("14 workers · the hands help haulage"), and a key to hire one with its price. It is not in the prototype's fourth version. He chose to keep the workers on 15 Nov 2026, and he plays the plate in the prototype's fifth version before it is built ([His two calls](#his-two-calls-decided-15-nov-2026)).

### The refinery (`refinery.png`)

- A flow from top to bottom. Each level's rock falls from its hopper into its maker: the kilns under the Topsoil, the saws under the Granite. What a maker cannot take joins the middle chute ("bypass to stone 2,060/s").
- A maker's plate has its count, what it can take, what limits it ("Bottleneck: kilns. Running at 400/s."), and the next one with its price and gain ("+1 kiln · 21K stone · +100/s").
- The stockyard is at the foot: the three stockpiles drawn as piles, and "Expand the stockyard" with its price, how long a night lasts now ("Full after 19 min unattended") and what the level gives.

### The factory (`factory.png`)

- Seen from above: the tools on the wall, a bin for each material with its count and its source ("Clay 7/10 · source: Topsoil"), and the station in the middle.
- A work order on the station shows its blueprint, "Materials arriving · 400/s" and how far it is.
- The blueprints lie under the station, each with its effect and what it requires. A drag onto the station places the work order.
- What is installed is in the head ("Installed: rails 0/2 · props 0/1").

### The city (`city.png`)

- A skyline at night with a plot for each building: operational, in hand with its scaffold, or vacant ("Vacant plot · unassigned"). The wagons drive along the road in front.
- The transport plate is on top: the fleet and its goods a second ("2 horse wagons · 800/s"), what it is doing ("serving the city", "idle: no order"), and a key for one more wagon and one more truck. Before trucks open, their key reads "Trucks: after the Warehouse".
- The project's card is under the skyline: its three steps with a tick on each one done, a bar for each good the step requires, and "On completion:" with its power and what it opens.
- The order key is on the card. Before the order it reads "Place order · the whole building". After, it is the state of the order: "Delivering · 800/s · 56 s · limit: transport · tap to hold".

### The cards (`shift-report.png`)

- **The shift report** after unattended time: how long he was away and the night shift output, a bar that shows how much of the night was production and how much was idle, what was produced, what transport delivered to orders, the steps and buildings that were finished, when each stockpile was full, and what stopped the night, with a key to the fix ("To the stockyard").
- **A building is operational**: its power and what it opens. After the Foundry it is the slice's end card.
- **A level is reached**: where the crews went, what each level's rock makes, and what opened.
- **The first evening**: one card that says what there is and what to do first.

### What the prototype does not show

These are in the game today and have no place in the prototype. Where they go is mine (call 16), and part 1's plan may move them:

- **A stage's full list.** A stage plate shows one machine. A tap on the plate opens that stage's list: its workers and machines with ownership marks, its upgrades, its gear, its engineer and its trouble. They are the rows #537 to #539 specify, built here.
- **Engineers and expeditions** open from the mine.
- **The Ledger, keepsakes, the sound switch and Start over** open from one key on the order strip.
- **The save line** stays in view on every site (`observable-saves.md`).

### What any screen has to meet

- The phone never scrolls. A long list scrolls inside its box.
- The project in hand is in view from the first minute.
- A decision shows real numbers: prices, rooms, each level's rock and goods a second, transport's goods a second, what an order still requires.
- The page shows the numbers and never the answer. Nothing names the bottleneck, a limit or a best buy (Flemming, 15 Nov 2026).
- What is idle is seen: workers, machines, vehicles, and a buffer that is full (Flemming, 15 Nov 2026).
- How many workers there are, where they work and how many are free is in reach on every site.
- "Hands" and "by hand" are not used.
- No button mines, and no button delivers.
- The lamp rule stays: green for something he can afford, amber for something running, red for trouble, dark for rest.
- No placeholders in the game. A picture that does not exist is asked for first.

**How it reaches Mars.** The mine gets more levels. The refinery gets more makers, and the day a rock has two uses, refining becomes a choice of what the rock goes to. The factory gets more stations and bigger things to make, up to the parts of the rocket. The city gets more plots, and the last site to open is the pad. Transport gets trains. Each of those is a later slice's design, not a rule of slice 1.

**What slice 1 does not have yet.** In slice 1 a level's rock has one maker, so the refinery has one decision: how many makers each good gets. The mine and the city are where slice 1's decisions are. The refinery and the factory are small, real sites that later slices fill.

## What goes, and what stays

**Goes:** the dig button and every tap that mines (Flemming, 14 Nov 2026); the Send on a project and the factory's fixed craft times (Flemming, 14 Nov 2026: he orders, transport delivers, and time comes from the resources); golden veins and the Gold rush (Flemming, 14 Nov 2026: a thing to click as it glints does not fit the road to Mars); the relics, their plate, shelf, reveal pictures and Ledger rows; the Lantern's guide bar (the project takes its place); the pass, Legacy, kid runs, Grandpa and the generations lab (#642); depth, the mountain's size and bottom, "stones left", the mined-out state; the band tag's advice and the rock's lean; the away clock once the stockyard is open; relic glimmers from expeditions; kid workers until the building that brings them back; workers that spread themselves to the slowest stage, and the cart's wait for twelve workers (Flemming, 15 Nov 2026: one workforce that he moves).

**Stays:** workers and the six machines of the line; ownership marks; upgrades; the factory and its gear, without its clock (rule 7); engineers, expeditions and trouble; the art, the steel and the lamps; one save for each Google account and everything in `observable-saves.md`.

**Where today's parts land.** Part 1's reset fixes the ids of the new save, so each of today's parts is placed here. A part not named stays as it is.

| Today                                                            | In slice 1                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Workers, Better boots                                            | Stay (his call, 15 Nov 2026), as one workforce that he hires into and moves between jobs (rule 2) |
| Machine upgrades, ownership marks, the amount key (×1, ×10, Max) | Stay, in their stage's list. A price that scaled with the band scales with the deepest level      |
| Strong arms, Sharper picks, Grandfather's pick                   | Go with the dig button: they only make a tap stronger                                             |
| Old miner's lamp, Crystal flare, Miner's crystal lamp            | Go with the golden veins                                                                          |
| Steady hands                                                     | Goes. The Light Tower has its job, so "night shift output 45%, up from 30%" is true for everyone  |
| The Heart of Patience and the other relic powers                 | Go with the relics. A building's power is the one in rule 6                                       |
| Overtime                                                         | Goes. A live boost is made in the factory (blasting charge, axle grease), so it has one home      |
| Iron rails, pit props, Reinforce, blasting charge, axle grease   | Stay as work orders, without a clock (rule 7.13)                                                  |
| Engineers, expeditions, trouble                                  | Stay, from part 3. A promotion costs brick (the line spec)                                        |
| The Ready now plate                                              | Becomes Next                                                                                      |
| The Ledger, the sound switch, Start over, the save line          | Stay (What the prototype does not show)                                                           |

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

Since 15 Nov 2026 the page does not name the bottleneck, headroom or a limit. Those words stay for the rules, the lab and this document.

The four sites follow his own words of 14 Nov 2026 ("mine, city, refinement, manufacturing"). "Deliver" is what transport does. There is no Deliver button (rule 7).

Words that came after the list he read. All but the first were in the prototype he said "That is right" to, and each is still his to veto:

| Word                          | For                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| the workforce                 | all the workers together. It was "the crew", and a crew is now one of the four.                                           |
| transport, horse wagon, truck | what carries goods to an order. His own words: "horse to truck, trains". Not "haulage", which is the line's second stage. |
| a site                        | one of the four: the mine, the refinery, the factory, the city                                                            |
| an order, place order         | a project or a work order he has placed                                                                                   |
| on hold, resume               | an order he has stopped deliveries to, and started again                                                                  |

Words of 15 Nov 2026. They were on the page of the prototype's ninth version, where he said "the workers do as expected". That was about how the workers behave, not about the words, and he called the same version's table "still not clear". So none of these is approved: each is his to veto, and the words on the screens are settled with the version of the prototype he says yes to.

| Word                                   | For                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| a job                                  | where workers work: drilling, haulage, hoisting, driving, building, the kilns, the saws                        |
| free                                   | a worker on no job                                                                                             |
| with a pick, with a barrow, on a winch | a stage's worker who runs no machine. Never "hands" or "by hand": he said twice that he does not understand it |
| a driver, a builder                    | a worker on driving, and one on building                                                                       |
| the building site                      | where transport puts a project's goods, and the builders build them in                                         |
| idle                                   | a machine, a vehicle or a maker with nobody to run it, as crews are idle at a full stockyard                   |

A train on the surface will need a name that is not "locomotive", which is the pit train. That is for the slice that brings it.

## Starting numbers

All for the lab to set. They are the numbers the paper check played, except transport's and the workforce's, which are first guesses that nothing has played. The line's numbers were tuned for workers that spread themselves (#543), so the lab sets them again for one workforce.

| Thing                      | Price                                                                                           | Does                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Worker, cart, hoist, drill | as #543 set them (60, 600, 6,000, 73,080 stone; ×1.06 and ×1.219)                               | as the line spec                                                                              |
| A worker with a tool       | none                                                                                            | 3 a second of his stage's work (the line spec's worker put on one job)                        |
| Workers to run a machine   | none                                                                                            | the line spec's count for each machine. A worker on a machine does no other work              |
| Workers at the start       | given                                                                                           | twelve: three on each stage, one driver, two builders (the prototype)                         |
| A builder                  | none                                                                                            | builds in 20 goods a second, a little less than a horse wagon carries (the prototype's ratio) |
| The building site          | none                                                                                            | holds 500 goods, what a horse wagon carries in twenty seconds (the prototype's ratio)         |
| Kiln                       | 15,000 stone, ×1.219                                                                            | 12 brick a second                                                                             |
| Saw                        | 25,000 brick, ×1.219                                                                            | 30 cut stone a second                                                                         |
| Tunnel borer               | 40,000 cut stone, ×1.219                                                                        | rated 1,071, eight workers                                                                    |
| Locomotive                 | 60,000 cut stone, ×1.219                                                                        | rated 1,600, eight workers                                                                    |
| Horse wagon                | 500 stone, ×1.219. The first is given.                                                          | carries 25 goods a second                                                                     |
| Truck                      | 150,000 brick, ×1.219                                                                           | carries 400 goods a second                                                                    |
| The shaft to the Granite   | 10M stone and 1.5M brick                                                                        | opens the Granite                                                                             |
| The stockyard              | level 0 holds 3M stone, 500K brick, 250K cut stone; a level triples it and costs 150K brick, ×3 | room for a night                                                                              |
| The Light Tower            | 150K, 1.5M, 6M stone                                                                            |                                                                                               |
| The Warehouse              | 8M stone and 1M brick; 15M and 4M; 12M brick                                                    |                                                                                               |
| The Foundry                | 15M brick and 4M cut stone; 20M and 15M; 30M and 40M                                            |                                                                                               |
| The winding engine         | cut stone, set by the lab                                                                       | hoisting's second machine                                                                     |
| A work order               | today's recipe, without its time. The lab sizes what each requires again.                       | as today                                                                                      |

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

| Rule                       | How the slice meets it                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two minutes                | A sitting is a few buys, a look at the order's numbers, and at times a move of workers or crews, or a project put on hold. Every choice holds until changed.                                                                                                                |
| Never punishing            | No rock is lost to a bad share while the stone stockpile has room. A full stockyard idles crews, and the cards say when. A level never closes. What has arrived for an order stays. A machine with nobody to run it is idle, not lost. A move, on hold and resume are free. |
| Close is pause             | Every tap is saved at once. Unattended time is worked out from timestamps: the stockpile-full moments and what transport delivered.                                                                                                                                         |
| Real numbers for decisions | Prices, rooms, each level's rock and goods a second, transport's goods a second, what a project still requires, what transport brings a second and what the builders build in a second.                                                                                     |
| Vague discoveries          | The next building and the level below are hints.                                                                                                                                                                                                                            |
| The phone never scrolls    | The prototype's screens are held to it. A long list (work orders, plots) scrolls inside its box.                                                                                                                                                                            |
| No placeholders            | The prototype is a throwaway outside the game. In the game, a new picture is asked for before it is made.                                                                                                                                                                   |

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
11. **Moving workers becomes the chore.** Drivers and builders have nothing to do between orders, so the best play may be to move them into the mine and back at every order. That is the anti-goal. The lab plays one type that sets the workers once for each building and one that moves them whenever a job has nothing to do, and measures `workerMoves` a sitting. If the mover wins by much, the levers are how few drivers and builders a building takes, and how soon the next building can be ordered.
12. **The builders are a second transport.** If the right play is always "enough builders that the site never fills", they are one more row to tap, like risk 3. The lab measures `siteFull`. If they stay a tax, a step is done when its goods arrive, as before, and building is not a job.
13. **The first minute has more to read**: five jobs and a free count before he has bought anything. A fresh mine starts with every worker on a job, and the first evening's card says so.
14. **Nothing spreads the workers for him.** A stage with no workers moves nothing, and the line stops. It is seen, and a free move ends it, but a new player can do it in the first minute. The first evening's journey plays it.
15. **A machine that is not worth its workers.** With today's numbers a worker with a tool, Better boots and the marks of a hundred workers moves more than his share of a cart. Rule 2.5 keeps that from lowering a stage, but it leaves carts idle. The lab sets the numbers so that a machine is worth the workers it takes, and measures `idleMachines`.
16. **The paper model is rough, and out of date.** It has no transport, and its dad stops buying line machines when they pay back slower than six hours, so the line's late growth is too flat.

## Calls I made

These are mine, not Flemming's. Any of them can be turned over.

1. Depth goes. A level is something he buys, and a building is its door (#645).
2. The slice has three goods, two makers, two levels and three buildings. My first sketch had brick alone and two buildings. With the shaft bought, the lower level needs a good of its own, or sharing the workforce is no decision.
3. Saws come with the Granite, not one level later.
4. Four crews, always placed, moved one at a time.
5. Two crews go to the Granite when it opens.
6. The rock's lean goes, because of the shared workforce. This turns over the band table he approved (decision D3), which is his call. It was put to him on 14 Nov 2026 at 19:30Z ("A level's rock no longer speeds or slows machines ('Suits borers' goes), so one stage holds the line, whatever the levels"), and he answered "In principle agree" at 19:31Z.
7. The locomotive opens with the Granite, and the winding engine with the Foundry.
8. Borers and locomotives cost cut stone. Saws, the stockyard and the shaft cost brick.
9. The Light Tower opens the kilns and the stockyard as well as the Granite's price.
10. Settled by the prototype: four sites with a site bar, and the order strip, the stockpiles and Next on every site (What he sees). Today's board goes.
11. Settled by the prototype: the city is a skyline with a plot for each building.
12. Settled by the prototype: the line is three stage plates with rock a second. The gauge and the odometer go.
13. Which copy of a save is ahead: a later run stamp (Start over, or a reset), else more rock dug in all, a count that only grows, else the newer `lastSeen`. The run stamp stays the first key, as today. Kid runs are gone, and "more stones mined" becomes "more rock dug in all".
14. The first evenings keep today's eight-hour clock, until the stockyard opens.
15. Kid workers wait for the building that brings them (the School, a later slice).
16. The stockyard is in the refinery and transport is in the city (the prototype). A stage's full list opens from its plate, engineers open from the mine, and the Ledger, keepsakes, the sound switch and Start over open from one key on the order strip (mine: the prototype does not show them).
17. A site opens with its part: the mine and the city in part 1, the refinery in part 2, the factory in part 3.
18. Transport is one fleet with one number, bought like a machine. No routes, and nothing to dispatch (rule 7.5).
19. Horse wagons from the first evening, and a fresh mine starts with one wagon and a driver on it. Trucks cost brick and open with the Warehouse. Trains wait for a later slice (rule 7.6).
20. Transport is shared evenly between the city's project and the factory's work order, and a work order's clay and iron ride along (rule 7.7 and 7.13).
21. An order can be put on hold and resumed, free (rule 7.10).
22. A building is one order with three steps. The next building waits for his order (rule 6).
23. At night transport runs at the night shift output and delivers. A building finished at night is operational from that moment (rule 7.12).
24. The factory's fixed craft times go with the city's: a work order is done when what it requires has arrived (rule 7.13). His words were about building. I read them as covering the factory too.
25. Machines, makers, vehicles, stockyard levels and the shaft stay instant purchases (rule 7.14).
26. "The workforce" is my word. "Site", "order", "on hold" and "resume" are the prototype's (Names).
27. The clock before the stockyard stops the mine only, and the stockyard opens the moment the Light Tower's roof goes on (rule 4). It is how the prototype plays.
28. Next is a pointer in the prototype's fixed order, not a best buy (What he sees, The frame). Out of date since 15 Nov 2026: Next names no buy. It is written again with the screens.
29. Steady hands and Overtime go, with the tap-only and vein-only upgrades (Where today's parts land).
30. The lab plays each part before that part is switched on. The five-day floor is checked when it can play the whole slice (Lab).
31. Workers stay, with a workforce plate in the mine. It was his call, and he said yes to it on 15 Nov 2026 (below). The plate became one workforce the same morning (rule 2).
32. Nothing gates a machine but its price and where it opens: the cart's twelve workers and the order cart, hoist, drill go (rule 2.6). The prototype's, played in its ninth version.
33. A vehicle takes one driver and a maker one worker, and the drivers take the trucks first (rule 2.7). His words name transport and operating. The counts are the prototype's.
34. Builders build in what transport brings, and the building site holds a set amount (rule 7.8). His words name building. The site and its numbers are the prototype's, and he was asked about builders and did not answer on them by name. If he turns it over, a step is done when its goods arrive, as before, and building is not a job.
35. The factory takes no workers in slice 1 (rule 2.12). The prototype does not play it.
36. No upkeep for workers in slice 1 (rule 2.9). His words: "could be that the maintainence cost should go later". If it comes, it must never make a debt or cost him a worker while he is away, because losing the evening is against the game's rules.
37. A fresh mine starts with every worker on a job (rule 2.10).
38. The four crews stay until he has played drilling as one job for each level (rule 5).
39. A worker on a machine does no other work. In the line spec he "still lends his hands". With workers he places himself, one worker in two places is a number nobody can check on the page.
40. A stage's workers run the machines that together move the most (rule 2.5). The prototype runs the strongest first. With machines that take different numbers of workers, that can lower a stage when he buys a machine, and the rule that a buy never lowers the line is tested in a fresh mine since #654.
41. What counts workers counts all he has. Better boots and the worker marks lift only a worker with a tool, Helping hands counts haulage's workers, and a promotion takes a free worker (rule 2.9). The lines of Better boots and Helping hands need new words, and those are his to approve when a stage's list is built (#661).
42. The count of workers he owns stays where it is in the game, and the save adds the workers on each job (The save). It keeps today's readers of that count as they are.

Calls 40 to 42 came from the builder's read of this amendment. Calls 32 to 34 and 37 are played in the prototype's ninth version, and he said "the workers do as expected" to it. The principle that the page gives no answers, and one workforce that he moves, are his and are not on this list.

Calls 18 to 24 are played in the prototype's fourth version, and he said "That is right" to it. So is the Light Tower's new power (night shift output at 45%, up from 30%), which is on its card and in the shift report. They stay on this list so that he can still turn one over.

### His two calls (decided 15 Nov 2026)

Both were put to him in the project chat on 14 Nov 2026 as A or B, with A recommended. He answered "A, a" on 15 Nov 2026 at 05:12Z.

**The workforce: the workers stay.** It was the one place where the prototype he played and the rules he approved disagreed.

- **The rules** (the line spec, approved 14 Nov 2026, built in #532 to #535 and tuned in #543): he hires workers. A worker does every job by hand, the free hands go to the slowest stage, and a machine needs workers to run it. The cart opens at twelve workers.
- **The prototype** has no workers to hire. Each stage has machines only, and all three are on sale in the first minute.

He kept the workers (call 31). The reasons given to him were three. With no dig button, the first minutes need something small to buy often, and a worker at 60 stone is that. The hands that fill in at the slowest stage are what keeps a bad buy from being a punishment. And the line's rules and numbers are built and tuned with them. The cost is one more plate in the mine that he has not played.

The other choice was to drop the workers and buy machines only, as he played, with the line's rules and numbers written again.

**What he then played.** He played the plate in the prototype's fifth to ninth versions the same morning and changed it: the workers are one workforce that he hires into and moves between jobs, and no worker moves by himself (rule 2). So the second and third reasons above no longer hold. An idle machine that runs the moment it gets its workers is what now keeps a wrong buy from being a punishment (rule 2.8), and the lab sets the line's numbers again. What is left before the mine's foot is built: his yes to the table of the three stages (#658).

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

This spec ships as a PR, and slice 1 is then split into sliver issues under #530. #536 is closed as not planned and its draft (PR #650) closed unmerged: the line is turned on with part 1 (#664), not in today's game. #539's rules move to part 3, and #561 waits for part 1's clean-up (#665). #537 and #538 are closed as not planned: they are built on the new screens as part 1's stage plates and its list by stage (below).

**The slice goes live in three parts, and each part is a game he can play.** A part's rules are built off in play, as the line's were (#532), the lab plays them, and the part's last sliver switches it on. Between switch-ons the game on his phone does not change. So no sliver leaves a hole: nothing that opened at a depth is taken out before the part with its new door is switched on.

| Part | Goes live                                                                                                                                                                       | The game then ends at  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1    | The mine and the city. The fresh mine: the Topsoil, the line, transport by horse wagon, the Light Tower's project. Relics, the pass, depth, the dig button and golden veins go. | the Light Tower's roof |
| 2    | Kilns, brick, the stockyard, a night shift that fills the stockyard, the Warehouse's project.                                                                                   | the Warehouse's roof   |
| 3    | The shaft and the Granite, saws, cut stone, borers, locomotives, the crews, the factory's work orders, trucks, the Foundry, the winding engine.                                 | the Foundry's roof     |

- **Until part 2 is live**, the Light Tower opens nothing. Its power counts: the night shift output is 45%. The eight-hour clock stays and the pocket has no limit, so a night after the Light Tower's roof is today's night at 45%. The stockyard, and the rule that the clock goes when it opens (rule 4), come with part 2.
- **Until part 3 is live**, the Granite's price is not shown, the Light Tower opens only the kilns and the stockyard, and the Warehouse does not open trucks. Each part ends with the end card, in words that say more is being built.
- **Resets the save** when part 1 is switched on. Parts 2 and 3 add facts to the save and should not reset it. If one must, its issue, its PR and the chat say so first.
- Each part's rules are played by the lab before that part is switched on, and the lab sets that part's numbers (as #534 and #543 did for the line). The lab cannot play the whole slice before part 3's rules exist, so part 1 does not wait for it.
- The pass, Legacy, kid runs and Grandpa (#642), the relics, the dig button, golden veins and the Gold rush leave play at part 1's switch-on. Their code is deleted by slivers after it.
- The lean of the rock leaves play at part 1's switch-on too: the Topsoil has none, and no other level is in play until part 3.
- The new screens are built beside today's board, to What he sees, and take its place at part 1's switch-on. They are built with the game's own parts and art, not from the prototype's code. #537 and #538 draw the stages and the buys on today's board and are not started: they are built in the mine instead, as part 1's stage plates and its machines by stage. #539's card for a stage lands there too. #537 and #538 are closed as not planned, and their work is the mine's stage plates (#660) and a stage's list (#661). #539 moves to part 3.

### The slivers, in order

Each becomes an issue under #530 when this spec is merged. The list is the order, not the final cut: a sliver that grows past one sitting is split when it is planned. A sliver marked "off in play" changes nothing on his phone. It is rules, tests and the lab. Every other one is seen in `npm run play`, and on his phone at its part's switch-on.

Part 1, the first evenings:

1. A fresh mine's rules, off in play: one level, no depth, machines that open by what he owns (rule 1), and what leaves the rules with it.
2. Orders and transport, off in play: the Light Tower's project, the fleet, on hold, and unattended time before the stockyard (rules 4, 6, 7).
   - 2a. One workforce, off in play: hiring into the free workers, the jobs on the three stages and driving, moves, machines and vehicles that are idle without their workers, and no gates on a machine (rule 2).
   - 2b. Builders and the building site, off in play (rule 7.8).
3. The lab plays part 1 and sets its numbers: the starting workers and where they start, the line's numbers for one workforce, the horse wagon, the builder, the site, the Light Tower.
4. Art: the Light Tower and a horse wagon. Asked for first.
   - Beside these, and not a sliver of the game: the prototype plays the workforce (the prototype's thread, branch `claude/project-thread-eextfa`, versions 5 to 10 so far), and his answer is recorded here and on sliver 5's issue. It has its own issue under #530 (#658). Slivers 3, 5, 6 and 7 are blocked by it: the lab, because its line rules may still change with his answer, and every screen.
5. The frame and the mine, beside today's board: the order strip, the stockpiles, Next, the site bar, the mountain, the table of the three stages and a stage's list (#660 and #661, in place of #537 and #538), and the count of workers that opens the list of jobs. Waits for his yes to a version of the mine (the step above).
6. The city: the skyline, the transport plate with its drivers, the building site with its builders, the project's card and the order key. Waits for his yes to a version of the prototype, like sliver 5.
7. The shift report and the cards.
8. Part 1 is switched on. **Resets the save.** Today's board goes, and its journeys and visual sections move to the new screens.
9. What part 1 left behind is deleted: relics, the pass, Legacy and kid runs, the generations lab, golden veins and the Gold rush, the dig button, and the upgrades that went.

Part 2, brick and nights:

10. Goods, makers and the stockyard, off in play, with the Warehouse's project and the kilns as a job (rules 2, 3, 4).
11. The lab plays parts 1 and 2.
12. Art: a kiln, a brick and the Warehouse. Asked for first.
13. The refinery and the stockyard, and the shift report's night bar.
14. Part 2 is switched on.

Part 3, two levels:

15. The shaft, the Granite and the crews, off in play, with saws, cut stone, borers, locomotives and trucks, and the saws as a job (rules 1, 2, 3, 5, 7). Waits for his answer on drilling as one job for each level (rule 5).
16. The factory without a clock, off in play (rule 7.13).
17. The lab plays the whole slice, and the five-day floor is checked.
18. Art: a saw, a cut stone, a truck and the Foundry. Asked for first.
19. The mine with two levels: the galleries, moving a crew, and the card for a level reached. Saws in the refinery, and trucks in the city.
20. The factory.
21. Part 3 is switched on, with the slice's end card.

### The save

Part 1's switch-on is a new save version, and it resets the save. Each new fact goes in the game map (`src/save-format.ts`) and the ledger (`src/save-ledger.test.ts`), as `observable-saves.md` asks.

| Fact                                                                                                 | From part                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| The levels he has opened                                                                             | 1 (one level), 3                   |
| Vehicles owned, by kind                                                                              | 1                                  |
| The buildings that are operational. The project in hand: its step, and what has arrived of each good | 1                                  |
| The order's state: not ordered, delivering, or on hold                                               | 1                                  |
| Rock dug in all (for which copy of a save is ahead, call 13)                                         | 1                                  |
| The workers on each job. The free workers are the rest of the workers he owns                        | 1, and a job more in parts 2 and 3 |
| What is on the building site, of each good                                                           | 1                                  |
| Makers owned, by kind. The stockyard's level. A stock of each good (#560)                            | 2                                  |
| The crews on each level                                                                              | 3                                  |
| The work order: its blueprint, what has arrived, and its state                                       | 3                                  |

- Leaves the save at part 1: relics, the pass, Legacy and kid runs, depth and the mountain's size, the Gold rush and its bank, and the upgrades that went.
- An order's state is a discriminated union, not a bag of flags. The crews on the levels always add up to four, and the save reader refuses a save where they do not. How many workers he owns stays the count the game has today, which the price, the marks and the doors read. The save adds a count for each job, and the free workers are the rest. The reader refuses a count below zero and a save with more workers on jobs than he owns.
- Parts 2 and 3 add facts and bump no version, unless one of them has to take out an id that part 1 shipped. That would be a reset and is said first.

### Proof

| What                                                                                      | Its proof                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The rules (levels, the workforce, goods, makers, the stockyard, crews, orders, transport) | Unit tests on pure rules modules, written first. Property tests where a sum must hold: four crews, a move never changes how many workers he has, one more machine or one more worker never lowers what a stage moves, no rock lost while the stone stockpile has room, never more delivered than required, never more on a site than it holds |
| Unattended time                                                                           | Unit tests from timestamps: the clock before the stockyard, part 1's night after the Light Tower's roof (eight hours at 45%, no stockyard), the stockpile-full moments, a step and a building finished at night, a building site that is full, an order on hold                                                                               |
| The pace and the decisions                                                                | The lab's named measures (Lab), and the five-day floor (#556) once the lab can play the whole slice                                                                                                                                                                                                                                           |
| Each site and each card                                                                   | A visual section for each at 424×924 and 424×830, with no page scroll, and `npm run play` from a save for each part's states                                                                                                                                                                                                                  |
| Each part as a game                                                                       | A journey for each part: the first evening to the Light Tower's roof; a night that fills the stockyard and one that builds; the shaft, a crew moved, and the Foundry's roof                                                                                                                                                                   |
| The save                                                                                  | The ledger and the emulator round trip for each new fact, and the reset at part 1                                                                                                                                                                                                                                                             |

A plan keeps each screen's browser checks green in the sliver that changes that screen. `docs/DESIGN.md`, `docs/design-intent.md`, `docs/ARCHITECTURE.md`, `docs/ui-audit.md`, `.claude/rules/observable-saves.md` and the github-issues skill's road section are updated by the slivers that change what they describe.

## Lab

- The strategy lab plays slice 1 from a fresh mine, as far as the slice is built: to the Light Tower's roof for part 1, the Warehouse's for part 2, and the Foundry's for part 3. The lab's players do not follow Next. One player type shares the crews by need. One leaves them at two and two. One moves the whole workforce, to keep the old cage's cost in view. Every type buys vehicles when an order's limit is transport, and puts the project on hold when a machine pays back sooner. One never uses on hold, to show what it is worth. Every type also hires and places workers, since nothing does it for him (rule 2.4). It puts a driver on a vehicle it buys and a worker on a maker it buys, and hires one first when no worker is free. It puts the workers a machine takes on that machine's stage when it buys the machine, and hires a worker for its slowest stage when that pays back sooner than a machine. When the builders, not transport, are an order's limit, it adds a builder where it would have bought a vehicle. The lab's players may read the limits the rules work out, though the page does not show them. Two types differ only in when they move workers: one sets them once for each building and leaves them, and one moves them whenever a job has nothing to do. The gap between those two is what the chore would pay (risk 11).
- Named measures, report-only at first: `sliceDays`, `narrowRun`, `shareMoves` a sitting, `nightFull` (how many long nights end at a full stockyard, and how far into the night), `deadGood` (time a stockpile is full with nothing to spend it on), `transportLimit` (the share of a project's time that transport is its limit), `starved` (time he cannot afford the cheapest buy while an order takes more than half of what the mine makes), `workerMoves` a sitting, `idleWorkers` (the share of the workers who are free or on a job with nothing to do), `siteFull` (the share of a project's time that its site is full), and `idleMachines` (the share of his machines that the workers leave idle because their tools move more).
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

Everything else the slice shows exists: the machines, the mine pictures the level rows and the surface are cut from, the steel, and the lamps.
