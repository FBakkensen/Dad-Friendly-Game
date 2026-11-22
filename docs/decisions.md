# Decisions

Flemming's decisions, each with the date he made it (times are UTC) and where its detail lives. Read this page before you ask him something: he may have answered already. A settled choice is not reopened.

The standing rules that follow from these decisions are in `.claude/rules/`. This page keeps the decision and its reason. An agent's own rulings are not here: they are on the issue and in the PR body. It does not keep the state of the work: open issues are the plan. A PR that carries out a new decision of his adds its line here.

Until 16 Nov 2026 these lived only in the memory of the claude.ai project the game is built from. He asked for them to live in the repo instead (#745).

## The direction

- **12 Nov 2026: phone only.** "we should drop pc support, it is never played there" (#498). No PC sizes, mouse paths or desktop layouts in new work or checks. Cloud save and a field log per device stay.
- **14 Nov 2026: the game ends on Mars.** The long game is a progression that ends with a rocket the player builds and people sent to Mars. The mine digs more kinds of resource and gets more machines per stage. Buildings and machines cost different resources, some refined or manufactured late in the game. The last building of a run moves as the game is developed, and in the end it is the rocket. The mountain has no bottom. The city's buildings are not capped at six.
- **14 Nov 2026, 09:25: no save backwards compatibility.** "we don't need backwards compatibility, we start fresh", since "i am the only player at the moment anyway". No migration, old-save grant or old-save fixture. Claude's call from that, his to overrule: a later sliver may reset the save again, announced as "Resets the save", until there is a second player. Spec: `docs/superpowers/specs/2026-11-14-fresh-save-content-rows-design.md` (#557).
- **14 Nov 2026, 09:25: run length.** The old finish target of three to five days is gone. A run takes at least five days, in the end probably weeks, and the exact length is not important. A meaningful decision at all times matters most (#556).
- **14 Nov 2026, 18:46: vertical slices.** "we should develop in vertical slices", so that he can play the start of the game before everything is completed. "This should be a general principle." At 18:55 he chose to rebuild the road (#563) as slices (#649).
- **14 Nov 2026, 21:47: no more building on the old game.** "Why are we still building on the current version." All new building comes from slice 1. The line on the old board (#536 to #538) was closed as not planned, and PR #650 was closed unmerged. Do not restart them.
- **16 Nov 2026: "Delete everything about the old game."** The old board, the relics, the veins, the Gold rush, the dig, the pass, Legacy, kid runs and Grandpa are deleted (#727, #728, #729), and the rest goes under #665. Until #729 the old game's four guardrails were report-only (his A, 05:25). At 07:51 he agreed ("agree", to option A) that the old game's guardrails are deleted with its lab code, and the fresh mine gets new guardrails once they are designed (#737).

## What the game is

These are rules now (`.claude/rules/dad-friendly-game.md`, An engineering game). The dates are kept here.

- **14 Nov 2026, 20:30: golden veins and the Gold rush go.**
- **14 Nov 2026, 20:42: an engineering game with no manual mining.** No dig button, and an engineer's vocabulary.
- **14 Nov 2026, 21:03: the names, the stockyard and transport.** The engineering names are approved (the slice 1 spec, Names). A full stockyard stops production. No tap delivers: the player places the order, and transport carries the goods at a speed that can be upgraded in kind, "like moving from horse to truck, trains maybe". "the time it takes to build is controlled by the resources not a fixed time". This is rule 7 of the slice 1 spec.
- **15 Nov 2026, 05:47: the discovery principle.** Never tell the player the answer. Show the numbers so he finds the system himself and gains by balancing all its parts.
- **15 Nov 2026, 13:18: stage buffers, not in sync.** Every chained stage has its own buffer with a limit. The game starts with about one worker he moves between jobs, and each hire must feel like a difference (#703).
- **15 Nov 2026, 15:13: no "face".** "this is an engineering game, not some fancy kids game". Never "face" where he reads it. The piles are "Drilled rock" and "Rock at the shaft". The stage id `face` in code is fine.
- **15 Nov 2026 (#658), on the prototype.** Never "hands" or "by hand" for workers. State must be seen: something idle shows where there is spare capacity or a full buffer. Workers are one global resource he can see, count and move. A count of machines or workers shows the workers it has and takes. Nothing that belongs to all sites sits on one site's page.
- **13 Nov 2026: a number that changes shows why.** A rate fell when a boost ended. The maths was right and nothing on screen said why, and that is the bug (#525, #527). The lesson outlived the boost.

## What left, and what waits

- **The relics** became buildings (14 Nov 2026), and #728 deleted them. The relic-door work was stopped for good the same day: do not propose it again.
- **The pass to the kid, Legacy, kid runs and Grandpa go** (#642, 14 Nov 2026, 16:58: "agree"). Kid workers from the School stay.
- **Expeditions, trouble and engineers are out of the game** (16 Nov 2026, 17:26 and 17:29). The spec had kept them from the old game "from part 3". He had not agreed to them: "We have not agreed on expeditions caves, floods etc.", and "You suggest things that do not fit this game". They are not deferred to a later slice, and the keepsakes and finds that came with expeditions go with them. Trouble means the cave-ins, floods and jams at the machines. Sturdy props, the gear that made trouble rarer, is not ordered in the factory. Do not propose them again.
- **The winding engine is out of the game** (16 Nov 2026, 17:33). It was the old game's Great Machine under its engineering name, which the spec kept as a bigger, faster hoist cage on sale after the Foundry's roof. He had approved the name, never the machine. Asked whether to drop it and switch part 3 on: "Yes". It is not deferred. Do not propose it again.
- **Separate mines** are not for the Earth game. Mars is the second mine, after the rocket (14 Nov 2026). One mountain with levels, and each good comes from one level's rock.
- **A deeper level is bought** (#645, 14 Nov 2026). It is rule 1 of the slice 1 spec: "Sink the shaft" on the level's row.
- **Workers cost upkeep** (#693, 15 Nov 2026; he said himself that it could come later): later, weighed when slice 2 is designed at the earliest. It must never make a debt or cost a worker while he is away.
- **More resources, refined goods, more machines per stage, the rocket, mines for Mars** (#565 to #569): later, under the road (#563).
- **Why the old game went** (14 Nov 2026). He finished run 1 with the last relics found while he was away, and called it dissatisfying. Every goal was a mark on stones mined, so time away played the story for him, buying only added speed, and the surplus had no use. The road to Mars is the answer.

## Slice 1, the first city

The design is `docs/superpowers/specs/2026-11-14-slice-1-design.md`. Its "Calls I made" lists what is Claude's call and his to overrule. The prototype he answered is `prototypes/slice-1/`.

- **14 Nov 2026, 21:35: prototype version 4.** "That is right": one order for the whole building, one fleet, on hold, nights that deliver, no factory clock.
- **15 Nov 2026, 05:12: his two calls.** The workers stay and he hires them, with a workforce plate. The five-day rule counts for the whole slice, to the Foundry's roof, not for part 1 or part 2.
- **15 Nov 2026: approved prototype versions.** Version 9 (one workforce, − and + per job), version 11 (the mine's table: "This is great"), version 12 (the hire key in the top row of every site).
- **15 Nov 2026, 17:42: the levels, in six points.** Jobs need not take the same number of workers: most on drilling, fewest on hoisting. A hoist serves two levels one at a time, and travel takes time. It delivers to the stock only at the top. Haulage workers are never split between levels for him. A hoist can be dedicated to a level. Recipes are not one to one, and are shown from now on.
- **15 Nov 2026, 18:09 to 18:44: assigning hoists.** Not a key with words, but a plain number of hoists for each level. Hoists not assigned serve both levels in turn (his A, 18:16). One strip under the Hoisting row assigns them (his A, 18:44). These are rule 5 of the spec (#722).
- **15 Nov 2026: approved lines.** Next's empty lines (11:54). The stage row's third-state words (12:30). The shift report and end card (13:33). The workers' upgrade lines, the hoist marks and "Every worker with a tool works twice as fast." (14:11; two of the names became Work boots and Loading crews in #711). "Drilled rock: N of 300", "Rock at the shaft: N of 300", the first evening card and the fresh save card's lines (15:13). The Ledger's words: Tonight "Bought cart 3.", Start over "Keep my mine", the way back "Close" (15:45).
- **15 Nov 2026, 17:48: three copy calls from the part 1 playtest** (#715). The "4 crews" line is not shown in part 1. The order key reads "Foundation 25K · Structure 250K · Roof 1M". The workforce list says "3 hired".
- **16 Nov 2026, 05:25: the refinery screen's 17 lines** (#671): his A.
- **16 Nov 2026, 09:55: the factory screen's ten lines** (#681): "i think this is fine for now", his A. He added that it "feels more like research than a factory work": that went to the idea pipeline, not to #681.
- **16 Nov 2026, 12:49: the mine with two levels' lines** (#680): his A to all five, as shown. They are: the level card ("A borer for which level?", "It stays on the level it is bought for.", "Topsoil: 0 borers", "Not now"); the hoist strip's cells and its line; "Granite · not reached", with its Light Tower line and the Sink key; the workforce groups Topsoil, Granite and Shaft; and "2 on winches".
- **16 Nov 2026, 14:22: the lines for the saws, the trucks and the Granite's card** (#754): his A to all four, as shown. They are: the refinery with the Granite open (the hoppers named TOPSOIL and GRANITE with their rates; the saws' plate, "Recipe: 3 rock → 1 cut stone", "SAWS 30 of 30 cut stone/s", "1 of 2 saws: 1 of 2 workers", "Rock at the saws: N of M", "+Saw · 30/s", "No saws yet", "+ 1 without a saw"; a bypass that counts both levels; cut stone as the third stockpile and stockyard bay); the workforce's "Saws" row; the city's "Trucks: after the Warehouse", "Opens trucks." and "+Truck · 400/s"; and the card "The Granite: reached" with its four lines and "Continue".
- **16 Nov 2026, 14:22: the five-day floor is a guardrail** (#675): his A. The lab's first fresh-mine guardrail: every player type needs five days or more to the Foundry's roof, with no ceiling (`slice-five-days` in `src/lab/targets.ts`).
- **16 Nov 2026, 16:06: part 3 is switched on** (#682). "do one last step to switch on part 3": the whole of slice 1, to the Foundry's roof, is the game on his phone. Then nothing new is started (his stop of 08:25).
- **For every screen sliver.** A new line of copy or a new look is his to approve first, asked as one question with pictures. No line promises what is not live.

## Slice 2, the Crystal Caves

The design is `docs/superpowers/specs/2026-11-19-slice-2-design.md` (#763, #764). The answered prototype is `prototypes/slice-2/proto.src.html`.

- **17 Nov 2026, 09:43: physical transport runs in two parts** (#762). Every inter-site movement goes by transport, one good type per vehicle. Both parts land in Slice 2: visible even-share across active runs first, then manual `−` / `+` assignment per run in a later part of the same slice, with the save reserving room for fixed assignments from the first part so the second resets nothing.
- **19 Nov 2026: Slice 2 scope** (#763, Option 1). Slice 2 combines physical transport runs (#762), the Research vs. steady-flow Factory split (#751), and the Crystal Caves level with its next City buildings. Slice 1 Part 3's economy kinks (#757) fold into Slice 2's lab tuning; worker upkeep (#693) waits for Slice 3.
- **19 Nov 2026: Transport and Research on the phone** (Option 1). Transport moves out of the City page to a global sheet (sibling to Workforce), keeping the bottom site bar at 4 tabs (`Mine · Refinery · Factory · City`). Research opens from its City building (**The Research Lab**).
- **19 Nov 2026: uniform multi-input production chain** (Option 1 + multi-input rule). Retire the small-cap clay/iron trickle bins so all five goods (`Stone`, `Brick`, `Cut stone`, `Glass`, `Parts`) share one stockyard and transport network. Both Refinery makers (starting with Glassworks) and, more prominently, Factory lines take multiple inputs with separate input buffers.
- **19 Nov 2026: Slice 2 City buildings & prototype** (Option 1 + "Continue"). The Foundry opens Crystal Caves, Glassworks, and the steady-flow Factory; Building 4 (**The Research Lab**) opens Research as the single home for all lasting upgrades and gear; Building 5 (**The Rail Depot**) opens Trains and ends Slice 2. Answered the tappable Slice 2 prototype (`prototypes/slice-2/proto.src.html`) with "Continue".
- **20 Nov 2026: physical `Mine → Stockyard` Stone run, no bypass** (PR `#765`, Option 1). Raw rock lifted from a mine level lands strictly in its pithead buffer and travels to the Stone stockpile via its own physical transport run (`pitToStockyardStones`) from Evening 1—keeping `#762` ("every movement between sites goes by transport") completely consistent with zero bypass exceptions.
- **21 Nov 2026, 12:02: Slice 2 Part 1 screen copy, phone layouts & v11 save reset** (`#768`, PR `#789`, `#769`): approved ("go") with `424×924` and `424×830` screenshots. Covers the top strip Transport chip (`N/M`, `X/s`, `"Transport: N of M vehicles running, X/s."`, amber/green/dark lamp), global Transport sheet (`TRANSPORT`, `"Staffed vehicles share evenly across active runs."`, `OPEN RUNS`, routes/goods, `Pithead N` / `Stock N`, `N of M`, `N.N veh` / `<0.1 veh`, `no driver` / `on hold` / `dest full` / `src empty`), Hoisting pithead lines (`Pithead rock`, `Topsoil pithead`, `Granite pithead`, `Both pitheads`, `(full)`), City per-good `N/500 on site` bars with the legacy in-City transport plate hidden, `Next` counting vehicles under `Transport` with the Factory tab hidden until Part 2, shift report `Cut stone full at X h`, and shipping `#769` with the v11 save reset ("Resets the save"; Parts 2 and 3 reset nothing).
- **22 Nov 2026, 12:19: Slice 2 Part 1 copy updates for cards, Sink key, and Refinery chute** (`#769`, PR `#790`): approved ("yes") updating 5 Slice 1 strings that named the retired Stone bypass or the Factory (hidden until Part 2): `FIRST_EVENING` (`"One worker, on drilling. Drilled rock waits until haulage carries it to the shaft, hoisting lifts it to the pithead, and driving hauls it to the stockyard as stone."`), `refineryOpens` (`"New site: the refinery. A kiln makes 1 brick from 2 rock. Transport carries rock from the pithead to the kilns, and stone to the stockyard. The stockyard holds a set amount of each good."`), `LEVEL_REACHED` (`"Opened: saws in the refinery and locomotives for haulage."`), `SINK_LINE` (`"A second level. Opens saws and locomotives."`), and the Refinery stone chute label (`"to stone"`).

## Art

- **11 Nov 2026: PixelLab is approved.** Since 15 Nov 2026 each new picture's spend is asked first, as a number of generations (the pixellab skill).
- **The Light Tower and the horse wagon** (#656, #657). His yes on 15 Nov 2026 covered the prompt, the size and the tool. His look at the two finished pictures was asked for the same day, and `docs/ART.md` records where that stands. They landed with the house's black outline.
- **The kiln, the brick and the Warehouse** (#668 to #670): approved 15 Nov 2026, 16:41.
- **The saw, the cut stone, the truck and the Foundry** (#676 to #679): approved 16 Nov 2026, 07:51.
- **Three rounds of screen mocks were rejected** (14 Nov 2026, 19:30 to 20:03). They looked almost the same: only the arrangement of boxes changed. "there should be some real difference depending on whether the work is mine, city, refinement, manufacturing". And: "We are wasting the time on generating images, we should do prototypes instead."

## How we work

These are rules now (`.claude/rules/working-with-flemming.md`, the github-issues and ship-sitting skills).

- **11 Nov 2026: Claude owns reviews and merges.** "we should change the rules here, you are responsible for reviews and merges".
- **11 Nov 2026: triage.** The labels `ready-for-agent`, `needs-you` and `agent-working`, a daily triage pass, and agents that build every ready issue (#454). With three sittings merging at once, each PR's gate ran again and again, so about two run at a time.
- **14 Nov 2026: the idea pipeline.** Every idea is recorded at once and answered honestly, and nothing is built because it was said. "i want you to push back, and tell me how we get this done right, so we don't end making shortcuts". Bugs he hit and small safe polish take the fast lane (#564).
- **14 Nov 2026: "nothing should wait on me".** A lab's day cap was a test setting, not a product call.
- **14 Nov 2026, 11:40: PR reviews** (#581). Build the review by lens. "all review comments should be resolved before a merge, this is all done by the implementation agent", and "opus for everything". He picked a workflow of our own (#572) over the official action and the managed service.
- **14 Nov 2026, 16:04: parallel merges.** He switched the ruleset himself: a branch need not be up to date, and `merge-check` is required beside `signoff` and `claude-review` (#617).
- **14 Nov 2026: dependencies.** Dependabot is on. A major bump goes through an issue first (#605).
- **14 Nov 2026: verification.** Gameplay journeys with Playwright Test: "agree". The pacing ledger, the economy invariants and the fresh save followed (#551).
- **16 Nov 2026: the rules and the memory live in the repo** (#745).
