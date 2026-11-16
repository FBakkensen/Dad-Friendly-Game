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
- **16 Nov 2026: "Delete everything about the old game."** The old board, the relics, the veins, the Gold rush, the dig, the pass, Legacy, kid runs and Grandpa are deleted (#727, #728, #729), and the rest goes under #665. Until #729 the old game's four guardrails were report-only (his A, 05:25).

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
- **For every screen sliver.** A new line of copy or a new look is his to approve first, asked as one question with pictures. No line promises what is not live.

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
