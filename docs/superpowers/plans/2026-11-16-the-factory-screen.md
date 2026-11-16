# The factory's screen (#681) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. When the plan is done, use the ship-sitting skill, not `superpowers:finishing-a-development-branch` directly.

**Goal:** The factory as a site on slice 1's frame, behind part 3's switch: the tools on the wall, a bin for each material with its count and its source, the station in the middle, and the blueprints under it. He drags a blueprint onto the station (or taps it), sees its goods arrive, installs what is done, or cancels it. The site joins the bar with the shaft, and Next points at a work order waiting to be installed. The phone does not change: part 3 stays off on every page but a dev page with `?part3=1`.

**Architecture:** The refinery's shape (#671): a pure view (`src/factory-view.ts`) read from the mountain, a canvas scene (`src/factory-scene.ts`) with the wood, the tool rail, the bins' contents, the station's plate and the gear drawn as it arrives, and the DOM site (`src/factory-site.ts`, `src/factory.css`) that paints the view and changes the game only through `progress.dispatch` with the factory's three moves (#674). The rules stay in `src/factory.ts`; the transport's split stays in `src/transport.ts` (`orderShares`), which the view reads for what arrives a second. The site bar, the lamps and Next stay in `src/next-view.ts`; the transport plate's state stays in `src/city-view.ts`.

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`: The factory (`factory.png`), The frame (Next, the site bar), rule 7.7 and 7.13, Names (the station, a work order, a blueprint, install). Issue #681. The prototype `prototypes/slice-1/` (`shopDOM`, `shopUI`, `shopDraw`) plays it.

## Global constraints

- The ladder in `.claude/rules/dad-friendly-work.md`: the test file, then `npm run gate -- fast`; one visual section and `npm run play`; the full gate once on the PR's final commit.
- `part3.off` reads 1 on every page; `?part3=1` holds it at 0 on a dev page only (as `?part2=1` did for #671). Boot, the journeys and the save do not change. No reset.
- Every new line on the screen is Flemming's to approve before the merge (one question, with phone pictures).
- No placeholders: the clay and iron are their sprites (`res-clay.png`, `res-iron.png`); the wood, the tools, the station's plate and the blueprints' drawings are drawn in code, as the prototype draws them (the spec's Art section asks for no factory picture).
- Function limits, cycles, knip and coverage floors as always.

## Rulings (agent-run sitting)

1. **Five blueprints, one strip.** The five work orders #674 opened (iron rails, sturdy props, blasting charge, reinforce, axle grease) lie in one row under the station that scrolls sideways inside its box (the spec's "A long list (work orders, plots) scrolls inside its box"); three and a part are in view, so the strip is seen to go on.
2. **Drag or tap.** A drag up onto the station places the work order, as the spec says; a tap places it too, as the prototype's does. The strip scrolls sideways (`touch-action: pan-x`), so a sideways swipe never places one. A placed work order costs nothing and cancel gives back what arrived, so a stray tap loses nothing.
3. **What the station shows.** Idle: the prototype's two lines. Delivering: the blueprint, what arrives a second, how far it is in all, and each good's count of what it requires ("Stone 105K of 250K", "Clay 3 of 10"). It names no limit: a material that is short shows as its bin's count and its own line, not as a "waiting for" line (the prototype's "Waiting: no clay in stock." goes, after the principle of 15 Nov 2026). Done: "<name>: complete", its effect, and Install.
4. **Install and Cancel.** Install is the one verb (Names: fit is install), also for a blasting charge (the prototype's "Detonate" goes). Cancel is on the station while a work order is on it, and says that what arrived goes back. A done work order whose gear reached its last level meanwhile shows no Install, only Cancel.
5. **The effect lines say the rules' numbers**: rails "Carts +25%" a level, props "Trouble 30% rarer", a charge and axle grease "Throughput ×2 for 20 min" (the crew timer, `crewTimer`, speeds every stage and the kilns), reinforce "+5%" on the machine it lifts now (`reinforceTier`). Each card shows how many are installed of its last level ("0/2"), and "Fully installed" once there.
6. **The head** says what is installed of the lasting gear ("Installed: rails 0/2 · props 0/1 · reinforce 0/5"), and a live timer while one runs ("Throughput ×2: 14 min").
7. **The lamps and Next.** The factory's count is 0: a work order costs nothing, so it is not a buy (spec, What Next and the lamps count). Its lamp is amber while a work order is delivering, and green while one is done and waits to be installed. Next points at a done work order ("Next · Factory", "Install iron rails"), after a building nobody has ordered.
8. **The transport plate** says who it serves: "serving the city", "serving the factory", or "shared: city, factory" (the prototype's words), and "idle: no order" only when neither is delivering.
9. **The site's place.** The factory's tab sits between the refinery and the city (the spec's order: mine, refinery, factory, city), with the Workshop key's tools icon (`icon-workshop.png`). Its ground is the wood's dark seam colour.

## Tasks

1. `factory-view.ts` and its test: the bins, the station's three states, the blueprints, the head; tests first.
2. `next-view.ts`: the factory site, its lamp, Next's install line; `city-view.ts`: the plate's state; tests first.
3. `factory-scene.ts`, `factory-site.ts`, `factory.css`; the frame mounts it; a frame test.
4. `?part3=1` on a dev page; play saves and the visual section `slice factory`.
5. Docs: ARCHITECTURE, DESIGN, ui-audit.
