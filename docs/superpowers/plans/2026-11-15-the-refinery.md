# The refinery and the stockyard, and the shift report's night bar (#671)

Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "The refinery", "The frame, the same on every site", "What Next and the lamps count", "The cards" and "While a part is the end of the game", as #722 amended them. Picture: `docs/superpowers/specs/slice-1/refinery.png`. Parent #530; after #666 (rules), #667 (lab), #668 and #669 (kiln and brick art), and #723 (the recipe). Off in play: everything here shows only while `partTwoOn()`, which #672 turns on. Agent-run sitting: the calls below are the thread's rulings, recorded here, on the issue and in the PR body. The new lines went to Flemming on 15 Nov 2026 (21:58Z) and nothing ships before his answer.

## Rulings

1. **Part 2 in a dev page.** `?part2=1` (dev builds only, like `?memorySave=1`) holds `part2.off=0` beside `fresh.off=0`, so the visual check and `npm run play` can show part 2 before #672. #672 holds it for everyone and drops the option.
2. **The sites.** `SITES` is the bar's order, `["mine", "refinery", "city"]`. `siteOpen(mountain, site)`: the mine and the city always, the refinery with part 2 and the Light Tower operational (`makersOpen`). A closed site has no tab, no count on Next and is never a target. The refinery's count is a kiln he can afford at ×1 plus a stockyard level he can afford. Its lamp is green with a count and dark otherwise: no amber, because nothing on it is an order (the lamp rule's amber is for an order delivering).
3. **The refinery's numbers** come from the rules, in a new pure module, `refinery-view` (no existing view reads makers or the stockyard; mine-view's `levelPlate` gives the Topsoil's rate and is reused, and its pile words pattern is shared).
   - Hopper: "TOPSOIL" and the rock a second hoisting lifts now (`levelPlate`).
   - Plate: the recipe, what the kilns make now of what they can make (`takeIncome(...).brick` of `kilnRate`), "N kilns: R of N workers" or "No kilns yet", "+ E without a kiln" for workers on the job beyond the kilns, "Rock at the kilns: held of holds", the workers between − and + (`job-steps`, the job `kilns`), and the key "+Kiln 12/s · 15K · 1 to run" (stone icon).
   - Chute: "bypass to stone", the stone a second now (`takeIncome(...).stones`), "1 rock → 1 stone".
   - Stockyard: one bay per stockpile in play (stone and brick in part 2: "Brick 20.8K of 1M"), "full" when full, and "Expand the stockyard" with its brick price, the night forecast and "Expansion: capacity ×3." No key at the last level.
   - Forecast: `accrueAway` over twelve hours from now on a copy, read from its night: "Full now." (under 40 s), "Full after 26 min unattended.", "Holds 12 h unattended." (it never stood), or "No output." (nothing came up). Kept for one second per mountain, as the prototype does.
4. **The top row** shows each stockpile in play: stone, and brick once the stockyard is open in part 2, each with a bar, its room ("of 6M") and "full" in red. Part 1 keeps one stockpile with no room.
5. **The workforce** gets a Refinery group with the kilns' row ("1 of 1 kiln runs") while the refinery is open.
6. **The shift report in part 2.** `NightReport` gains `produced` (each good that reached the stockpiles), so "Produced: 9,720 stone, 1,200 brick." Marks for each stockpile that filled ("Brick full at 3 h 20 min"), "Stockyard full: production stopped." when a full stockyard stood the mine, and a second key, "To the stockyard", which goes to the refinery with the stockyard in view. "Resume" stays.
7. **The Light Tower** says "Opens the refinery." in part 2, on its project card and its operational card, with the prototype's line on what the refinery does.
8. **The scene** is drawn in code on a canvas like the mine's, in art px: a brick wall, the Topsoil's hopper as full as the kilns' pile, the kiln (the game's `mach-kiln` sprite, dim with none), the middle chute with rock falling while stone bypasses, and the stockyard's bays (a stone heap, a stack of `res-brick`) as full as the stockpiles. Loops only while rock moves.

## Tasks

1. `?part2=1`, play saves `refinery` (the Light Tower operational, a kiln with its worker, brick and stone in the stockyard) and `yardfull` (a night that ends with a full stockyard).
2. Sites: `next-view` (`SITES`, `siteOpen`, the refinery's count and lamp), the frame's site bar and Next target, the workforce's Refinery group.
3. `refinery-view`, test first.
4. `refinery-scene`, `refinery-site`, `refinery.css`, mounted in the frame; visual section "refinery" at 424×924 and 424×830.
5. The top row's stockpiles.
6. The shift report in part 2 (`NightReport.produced`, the marks, the stop line, the key).
7. The Light Tower's lines.
8. Docs: ARCHITECTURE, DESIGN, ui-audit, design-intent.

## Proof

The test files, then `npm run gate -- fast`; `VISUAL_ONLY='refinery' npm run visual` and `npm run play -- --save refinery`, `--save yardfull`; the full gate on the final commit.
