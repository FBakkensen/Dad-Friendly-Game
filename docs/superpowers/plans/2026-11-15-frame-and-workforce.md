# The frame and the workforce, beside today's board (#659)

Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "The frame, the same on every site", "The workforce", "What the prototype does not show" and "What any screen has to meet"; prototype v12 (`366b890`), pictures in `docs/superpowers/specs/slice-1/`. Parent #530.

## Rulings (agent-run sitting)

1. **Where it lives.** The new screens are a second composition root beside today's board: `frame-screen` mounts them, and `main` picks it only in a dev build with `?slice=1`. That boot holds the fresh mine's switch on for the page (`holdFactors`, beside `withFactors` in `economy/factors`) and plays a memory save, so no real save is touched. `npm run play -- --save slice` opens it. Today's board, its journeys and its visual sections are untouched.
2. **Pure views first.** What the frame shows is worked out in pure modules with unit tests: `frame-view` (the order strip, the stockpiles, the workers and the hire key), `next-view` (what Next and the lamps count) and `workforce-view` (the workforce's head and its jobs). The DOM modules (`frame-screen`, `workforce-sheet`) only paint them and dispatch moves.
3. **The order strip** names the building in hand, its step (Foundation, Structure, Roof) and its state (not ordered, delivering, on hold), and what the step requires with what is built in of it ("Stone 1,200 of 150K"): a step is done when it is built in (#690). With nothing to order after the part's last roof it names what is operational and says the city is planning its next building, the spec's proposed line, with all pips done. A tap goes to the city.
4. **The stockpiles.** Part 1 has one good, stone, and no stockyard, so the pocket has no room: the stockpile shows its count and no bar or room until the stockyard opens (part 2).
5. **The workers and the hire key** are in the top row on every site: the count he owns with the free ones under it, and the hire key with its price. The amount key's ×10 and Max reach it: "+10 Workers" and their total, from `tierQuote`. A tap hires through `buyTier`/`buyTiers`, as Buys does today. The count has a green lamp while the workforce's own count is not zero.
6. **One amount key for the device.** The new screens read and keep the same amount as Buys (`buys-amount`'s device store, now exported), and the workforce's head has the key.
7. **Moving workers counts.** `placeWorker` and `freeWorker` take a count, and their moves carry one: ×1 moves one, ×10 up to ten, Max all there are (free ones, or the job's). The lab lists a count of one.
8. **The workforce** is a sheet over the frame. Its head says the workers and the free ones and has the second hire key and the amount key. Its jobs are grouped by site, the mine (drilling, haulage, hoisting) and the city (transport, building); a job that has not opened is not shown. A row says what its workers run ("2 of 3 carts run, 1 with barrows"; "1 of 1 vehicles run"; "each builds 20/s") and its count between − and +. A + with no free worker says "No free worker. Hire one, or take one off another job." in the sheet.
9. **What Next and the lamps count.** A site's count is every buy there he can afford now: on the mine, each machine of the line (in play, not locked) and each machine upgrade shown; in the city, each vehicle. Hiring is not counted. The workforce has its own count, for the worker's upgrades (Better boots). Next points at a building nobody has ordered ("Next · City", "Order the Light Tower"), else reads "Affordable now" with each site's count and the workforce's, else the spec's proposed "Nothing to buy on the sites yet." with "Production is running." or, when the line moves nothing, "The line stands." Those two lines are Flemming's to approve, asked as one question before the screens are shown.
10. **The site bar** has the mine and the city, each with its lamp: green when its count is not zero, and the city amber while an order is delivering. A tap changes site. The scenes are their own slivers (#660, #662), so the middle is the site's dark ground for now, in a dev build only.
11. **The save line** stays in view, under the site bar, as today's `createSaveLine`.

## Tasks

1. Counted worker moves (`workforce`, `economy/actions`, lab), tests first.
2. `frame-view`, `next-view`, `workforce-view`, tests first.
3. `holdFactors`, the `?slice=1` boot and `main`.
4. `frame-screen`, `workforce-sheet`, `frame.css`; DOM tests: one hire key on every site and no other, a + with no free worker shows its line.
5. The `slice` play save, a visual section at 424×924 and 424×830, `npm run play`.
6. Docs: `ARCHITECTURE.md`, `docs/ui-audit.md`.
