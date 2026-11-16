# The factory without a clock, off in play (#674) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. When the plan is done, use the ship-sitting skill, not `superpowers:finishing-a-development-branch` directly.

**Goal:** Slice 1's factory rules behind part 3's switch (`part3.off`, which the page never holds): one station, one work order at a time. He places a work order from a blueprint; transport carries its stone and its materials to the station, shared with the city's order; it is done when everything it requires has arrived, and he installs it. A cancelled work order gives back what arrived. Clay and iron come from the rock drilled on each level (rule 5.13). The lab sizes again what each work order requires. The phone does not change.

**Architecture:** A new leaf, `src/factory.ts`, holds the station (a discriminated union on `Mountain.station`), the work orders' table and their moves. It reuses the workshop's recipes, effects, gear levels and live timers (`src/workshop.ts`): installing a work order fits its gear through the same `fitGear` that the old bench's `settleBench` now calls, so the effects stay "as today" in one home. Transport (`src/transport.ts`) stays the one place that carries goods: a new `orderShares` splits its rate between the city's project and the station (rule 7.7), and `deliver`, `stockDraw`, `drawChange`, `secondsToStep` and the page's numbers read the city's part of it. With the station idle every one of them computes exactly what it computes today. Materials are counted in `src/factory.ts` from the rock drilled on each level, using `rockDug` and a new `graniteDug` on `Mountain` (saved as `run.granite`; `flowMine` counts it where the Granite drills, so the Granite's own type, which #724 changes, is not touched), and are added in the stretch (`mountain.ts`, `workStretch`), the one path a mine with part 3 runs.

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`: rule 5.13, rule 7 (7.7, 7.10, 7.12, 7.13), "Where today's parts land", Starting numbers (A work order), The save. Issue #674. The prototype `prototypes/slice-1/` (the factory, `startJob` and `fitJob`) plays it.

## Global constraints

- The ladder in `.claude/rules/dad-friendly-work.md`: the test file, then `npm run gate -- fast`; the full gate once on the PR's final commit.
- `part3.off` reads 1 outside a sweep. Boot and the journeys do not change. With part 3 off every rule here is inert, and the pacing ledger does not move.
- No version bump, no reset: the save adds facts only (`station` in the game map, `granite` in `run`). `firestore.rules` does not change.
- No player-facing line: the factory's screen is #681.
- Function limits, cycles, knip and coverage floors as always.

## Rulings (agent-run sitting)

1. **A new leaf, `factory`.** The station is a second order transport serves, beside the city's project (`city.ts`). The old bench (`Mountain.bench`, a clock) stays as it is for today's game until #739 deletes it; the station is a separate field so today's save shape and today's bench are untouched. What is shared is not copied: the recipes, their effects, `crafted`, the live timers and their lengths stay in `workshop.ts`, and the old bench's fitting is extracted as `fitGear`, which both call.
2. **The station is a union:** `idle`, `delivering` (a recipe and what has arrived of each good), or `done` (a recipe, waiting to be installed). Saved as `station: { recipe, state, arrived? }`; idle saves nothing.
3. **No on hold for a work order.** The prototype he approved (version 4, "That is right") has none, and the work order's free way out is cancel, which gives back what arrived. Rule 7.10's "on hold" stays the city's.
4. **Install is his tap.** A work order whose goods have all arrived waits as `done` until he installs it (the prototype's "Install it", the spec's Next: "gear that is done and waits to be installed"). Installing raises the gear's level, or starts its live timer from that moment (a blasting charge's twenty minutes, axle grease's), as the old bench did when it finished: a charge still running gets another twenty after it. So a work order finished at night does not spend its timer while he is away. A new work order can be placed only on an idle station.
5. **The blueprints in slice 1** are the recipes whose materials an open level gives: iron rails, sturdy props, blasting charge, reinforce and axle grease. The rest (crystal, heartstone) are held back ("Where today's parts land"). The station opens with the shaft (rule 7's site bar: the factory with the shaft), so the five are open together; a gear at its last level is not placed.
6. **What a work order requires** is a table of its own in `factory.ts`, sized by the lab (ruling 12), with the materials as today's recipe. Today's `recipePrice` keeps today's numbers, so today's game and its ledger do not move. Both scale by `recipe.<id>.cost`.
7. **Transport's split (rule 7.7).** With both orders delivering, each gets half of transport's rate, and what one cannot use goes to the other: the station takes `min(what it can take, rate − min(what the city can take, rate / 2))`, and the city gets the rest. Alone, either gets all of it. A good's load is its goods, and one clay or one iron is 500 (rule 7.13). The station's take is split evenly between the goods it still requires, by load, as the city's is.
8. **One stockpile, two takers.** The station takes first. A dry stockpile gives the city what comes in less what the station took of it.
9. **The station has no site and no builders.** What transport brings is arrived at once; the work order is done when everything has arrived, so it waits for a material that is short.
10. **Clay and iron (rule 5.13).** One clay for each 1M rock drilled on the Topsoil, one iron for each 1M on the Granite (today's `MATERIAL_EVERY`), each up to 10 clay and 35 iron in stock, and refilled up to that. They come from the shaft's sinking on, the moment the factory opens, so nothing new shows on a part 2 mine. The Topsoil's drilled rock is `rockDug` less `graniteDug`, so the remainder carries from stretch to stretch. A material that runs dry at the station is taken again from the next stretch on, not from the second it is drilled.
11. **A cancelled work order** gives back what arrived, in full, even past a stockpile's room (a full stockpile only stops production, rule 4).
12. **The lab sizes them again** (`src/lab/work-orders.ts`): the transport time of each work order at a reference mine, the end of part 2 as the lab's players reach it (about 320 goods a second of horse wagons, half for the station), and the hours its materials take at a reference drilling rate. Lasting gear takes about half an hour of transport, a live timer about five minutes and well under its twenty; reinforce and axle grease stay iron only. The lab's whole-slice replay is #675.
13. **The merge** counts installed gear (`crafted`), as it does today; the work order in hand is not progress, as the old bench was not.
14. **The moves** are `placeWorkOrder`, `cancelWorkOrder` and `installWorkOrder`, listed only while the station is open, logged as `work.place`, `work.cancel` and `work.install`. The lab's players do not take them yet (#675).

## Tasks

1. `fitGear` out of `settleBench` (workshop), with its test.
2. `factory.ts`: the station, the blueprints, the work orders' table, place, cancel, install; tests first.
3. Materials: `graniteDug`, `flowLevels` counts it, `materialsDrilled` in `factory`, added in `workStretch`; tests first.
4. Transport: `orderShares`, `deliver` to the station, `stockDraw`, `drawChange`, `secondsToStep`, the page's numbers; tests first, and a property that no good is lost or made and no work order gets more than it requires.
5. The save: `station` in the game map and `granite` in `run`, the reader's refusals, the ledger.
6. The moves in `economy/actions`, the field log, the lab's switches.
7. The lab's sizing (`src/lab/work-orders.ts`) and its test.
8. Docs: ARCHITECTURE, DESIGN where it names the workshop's clock.
