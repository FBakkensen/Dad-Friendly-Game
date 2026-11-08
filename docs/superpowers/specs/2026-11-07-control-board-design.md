# The control board: design spec (7 Nov 2026)

Status: approved by Flemming on 8 Nov 2026. This spec covers several slivers. It ships on its own PR under the parent issue #368, and each later sitting plans and builds one sliver from it (`.claude/rules/superpowers.md`). The approved mockup is `mockups/control-board/index.html`; open it with any static server. Its screenshots are in `mockups/control-board/shots/`.

## Why

The game plays well, but it looks like a fairground. Flemming plays it in bed on a OnePlus 15, installed and full screen, after the kids are asleep. The look should fit a grown-up engineer: gears, gauges, steel and enamel, in the spirit of Factorio, and not cartoon. Three rounds of "lantern diorama" mockups were rejected as "a child tivoli game".

The approved direction combines two of the rejected mockups: the riveted control board from direction B, with a small window down the shaft showing the living mine from direction A. The board is the instrument panel. The window is the one place where something alive moves, and it is also the dig button.

## Goals

- One riveted control board replaces today's main screen and every sheet's look, on the OnePlus 15 and on the PC.
- A small window into the mine is the tap target. A miner runs a tub between the cage and the face. The machines you own work in it, and a new machine shows up there with a calm beat.
- Every number on screen is a real game number from the rules modules, and reads the same as today.
- It feels calm and mechanical: hard stepped motion (odometer drums, flap counters, a damped needle, an 8-frame sheet slide), with nothing bouncy.

## Non-goals

- No change to rules, numbers, prices, saves or the lab. This is UI and UX only.
- No sound beyond today's Workshop hammer and its toggle.
- No new game systems. Buy ×10 / Max (#358) and milestones on every tier (#357) are economy slivers. This spec only keeps room for them (see "Room for #357 and #358").
- No support for small phones. The target devices are the OnePlus 15 (424 CSS px wide) and a PC. Other screens scale the board uniformly and are not tested.

## Anti-goals

These would make it a failure even if it works:

- Chibi, candy colours, bounce easing, confetti, or a fairground glow.
- A page that scrolls on the OnePlus 15. A drawer fits without scrolling in its usual states; only a list longer than the drawer scrolls inside it, as long lists do today (call C1).
- A placeholder box anywhere. All art is PixelLab art (`.claude/rules/dad-friendly-game.md`).
- A number that does the reasoning for him (the numbers rule, `docs/design-intent.md`). The one exception is the Saving for time (decision D1).
- A save failure that hides. The save line stays on the board at all times (`.claude/rules/observable-saves.md`).

## Devices

- **Phone:** one layout, the OnePlus 15 installed app at 424×924 (decision D2). The repo measured that height on the device (`docs/ui-audit.md`).
  - A taller screen centres the board. A shorter or narrower one, such as Chrome with its address bar at 424×830, scales the whole board down uniformly and never rearranges it. There the art is no longer an exact 2×. These screens are not tested.
- **PC (width 600px or more, today's `PC_MIN_WIDTH`):** the same 424×924 board, scaled uniformly to fit. It sits in a steel housing on a dark desk, with one dim pool of lamplight under it. Tested at 1280×800, 1366×768 and 1440×900.
- **Gate sizes change in B2:** the visual check, the UI audit and `npm run play` test 424×924 and the PC sizes above. The old 412, 440, 375 and 830 sizes are dropped.
- The mockup also has a 424×868 layout. It is not built.

## The board, top to bottom

All art is drawn at exactly 2× (one art pixel is two CSS pixels), nearest neighbour, with no CSS filters. Panels and buttons are 9-slice skins composed on a canvas from PixelLab sources (frame, tag, key, inset), so a resize never stretches a rivet. The pixel top of each row is in the mockup's `LAY` table, under 924.

1. **Relic plate.** Six sockets with the found relics lit and the next one dark. A tap shows a short note in today's words (the found relic's virtue, or the vague hint for the next one). An enamel tag reads "Relics of Fatherhood · 2 of 6". The tag opens the relic shelf (today's shelf dialog, reskinned).
2. **Stock row.**
   - **Odometer:** five drums show the pocket. Under 100,000 it shows the whole number ("41,380"). From 100K up it shows four figures and a unit drum (K, M, B, T), and the drums after the point have red faces ("412.4K"). Unlike today's compact numbers, which switch to K at 10,000, it keeps whole numbers up to 100,000, because five drums have room. It rounds down, like today's formatters, and from 1,000T it reads ">999T". Drums roll in hard steps.
   - **STONES legend** on the enamel under it. A spend shows a short "−5,868" on the same line for 1.9s.
   - **Boost dial** on the right: "OVERTIME ×2 · 7:08 LEFT" and a 30-minute dial face. It shows the crew timer the crew is actually running at: the strongest of Overtime, axle grease and a blasting charge (`liveCrewTimer` in `src/rates.ts`), with a tie going to the most time left. It is named on its legend, and the face spans that timer's full length. With none running it reads "×1 · rested". See "Where everything else goes" for the other timers.
3. **Gauge row.**
   - **Output gauge:** a damped needle on 5° frames reads stones a second. Its face reads 0–15 of a unit (×100, ×1000, ×10K…). The unit steps up whenever output outgrows the dial, so the needle never pegs. A counter in the face shows the exact rate ("1.9K"). It kicks gently on a dig or a buy.
   - **Mine window:** 212×180, view 184×152 (see "The mine window").
   - **Crew plate** under the window: "CREW 56", an amber lamp and "1 FREE". This is the only place free workers are counted (`docs/ui-audit.md`, point 9).
4. **Machine bays.** A band tag on the frame names the layer and its favoured machine ("The Granite · Suits borers"), in today's layer-card words. Three bays follow, one per machine. Each bay has:
   - a lamp: amber for the Ready now machine, green if affordable and staffable, dark otherwise;
   - the machine icon;
   - the name, and "+12/s · 1 hand" (what one more adds, and its staff);
   - a two-digit flap counter for the number owned;
   - the next price on a tag ("NEXT 5,868", or "FIRST" before the first one).

   **Which tiers (call C2):** until the Great Machine is on sale or owned, the bays are cart, drill and borer. From then on they are drill, borer and Great Machine; the cart stays in Buys. A tier not on sale yet still has its bay: a dark lamp, the dim icon (the borer under its tarp), "Locked" and today's lock words, and no price. Workers and kids are crew, not machines; they live on the crew plate and in Buys.

   **Taps:** a tap on the bays opens Buys. On a bay in trouble, a tap counts toward the fix instead (today's 5 taps or a 600ms hold), and the bay reads "Cave-in! · Hold to fix" (call C3). Trouble on a tier with no bay shows a red lamp on the Buys key and is fixed on its Buys row.

5. **Ready now plate and the red button.**
   - **Ready now:** a guarded lamp button with a name plate: "READY NOW · Buy a cart · 5,868 · +12/s · your free worker can run it". The rule:
     1. the biggest machine your free workers can run and you can afford;
     2. else, if a worker is free but nothing is affordable, the plate reads "SAVING FOR · Saving for a cart · in 4m" with the price and gain under it: the cheapest machine he can run, and the time until the pocket reaches its price at the current speed, rounded up to the next minute and written like the timer chips ("4m", "1h 5m") (decision D1). At zero speed, as on a new mountain, the time is left off and the plate shows the price only (call C11);
     3. else a worker, offered only when no hand is free. If the worker is not affordable either, the plate reads "Saving for a worker", with the price, gain and time as in step 2;
     4. it never buys by itself.

     One tap buys exactly one. The plate then shows "Done · +12/s · Cart 31 is rolling" and ignores taps for 1.9s, so a sleepy double tap buys one. A tap while it reads "Saving for" opens Buys and spends nothing. This is the one gold control on the board (`docs/ui-audit.md`, point 6).

   - **Red button:** a big push button, "DIG · +20" (tap power). It digs exactly tap power, the same as a tap on the window. While he taps it counts up "BY HAND · +60", then settles back.
6. **Key rail.** Five steel keys with icons: Buys, Workshop, Engineers, Upgrades, Ledger. A locked key is dimmed, with its unlock line under it ("With 1st borer"). The Upgrades key lights its cap when an upgrade is affordable, and replaces today's afford glow. A red dot lamp on a key cap replaces today's teach dot.
7. **Save line.** A 54px steel strip at the bottom with a lamp and today's five save states and words: "Sign in to save", "Saved on this device", "Loading your save...", "Saved to your account" and "Couldn't reach your save". In the last state the strip adds "· Kept on this phone" and a "Details" label on the right (new copy, call C12). `data-log` stays on it. A tap opens the save drawer: account, the stones on this phone, the last try, Close and Try again. When the save is unsigned, it offers sign in.

The rows fill 424×924 with the mockup's gaps. Nothing scrolls.

## The mine window

A riveted steel frame with an enamel tag, "No. 2 Shaft". Behind the glass is a side cutaway:

- the surface: headframe, turning sheave wheel, engine house with steam;
- the upper gallery: rails, the cage landing and the haulage run;
- the lower gallery: lit by a caged lamp, with the drill, the borer and an ore chute.

Layers, back to front: view, sheave, steam, drill, borer or tarp, dust, the haulage run (tub, miner, cage), dig puff, "+N", glass dust overlay, frame and tag.

**Behaviour:**

- **Tap to dig.** A tap anywhere in the window digs exactly tap power, the same as the red button and today's rock. A dust puff and "+20" rise where the finger was, inside the glass. The red button plays its press frames with it.
- **The haulage loop.** The miner (12×21 art, 18 frames) pushes the tub out to the face. He walks round behind it while it is loaded, pushes it back, and tips it at the cage, turning through two three-quarter frames at each end. Everything moves one art pixel at a time.
- **A new cart.** At the tub's next cage visit, the full tub rides the cage up behind the deck beam and a new empty one comes down. The sheave spins fast for 1.6s at once.
- **A new drill.** It runs nine strokes instead of six.
- **The first borer.** The tarp lifts two pixels and is dragged off to the left, then the borer starts cutting. Engineers unlocks with it.
- **Bands.** The view changes with the layer, as the rock's tint does today. Each band gets its own view art: Topsoil, Granite, Crystal Caves, Deep Heart. The Great Machine and kids appear in the window once owned.
- **Golden vein.** It glints in the rock face inside the window, at today's random places and times. A tap on it pays today's vein. Its note shows under the window as a short board note.
- **Hazards.** A cave-in, flood or jam shows on its machine's bay (see Machine bays) and in the window: dust over a cave-in, a stopped drill in a flood, a still borer in a jam.
- **Reduced motion.** The window holds still: no loop, no sheave, no needle swing, and drums and flaps change without rolling. Digs still show "+N" without rising.

## Sheets (drawers)

- A key opens its sheet as a riveted drawer. It slides up in 6 hard steps and covers the board from just below the stock row down to the save line. The odometer and the save line stay visible.
- A tap on the board above the drawer (a scrim) closes it. A tap on a relic socket through the scrim closes the drawer and shows that relic's note. Escape also closes it.
- Each sheet has a title, a one-line kick, its rows, and "Back to the board" at the bottom (54px).
- **Rows:** a lamp, a 64px icon where the row has one (Upgrades, Workshop and Engineers rows may go without, as in the mockup), the name, an info line, a rust "Needs …" line, the gain ("+2/s"), the price on a tag, and the verb (HIRE, BUY, 1 WORKER, 8 WORKERS). The lamp follows the four card states (`docs/ui-audit.md`, point 3):
  - ready: green, or amber when it is the Ready now pick;
  - short of workers: today's "Needs 8 workers", with the free count only on the crew plate;
  - too dear: the price only, in the dim tag;
  - locked: the word Locked and no price.

  A tap buys one, then holds that row for 1.9s ("Done"). A tap on a row he cannot afford blinks its lamp red twice, unless motion is reduced.

- **Spare space.** A sheet shorter than its drawer ends in a recessed backplate with a steel maker's plate (tall space) or a stamped strip (short space). It is never bare frame.
- **The "i" button** sits in the same corner of every sheet head and opens today's How-it-works card in the drawer skin.
- **Buys:** Crew (workers, kids) and Machines (cart, drill, borer, Great Machine), with today's lock lines, milestone line and the tending engineer's mark. It has the footnote explaining Ready now.
- **Upgrades:** Quick boosts, Lasting (with today's before/after effect lines, #324), and Brought home (lost tools).
- **Workshop:** a plate for each material met (iron, clay, crystal, heartstone), the bench, recipes in pages, the cancel confirm and the sound toggle, as today.
- **Engineers:** locked until the first borer, with a row that opens Buys at the borer. After that it holds today's tend, explore, recall, promote and homecoming, as rows.
- **Ledger:** see "Where everything else goes".

## Where everything else goes

The mockup does not show everything the game has. Each piece keeps its rules and words and moves as follows:

| Today                                                                                                | On the board                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pocket pill and rate                                                                                 | Odometer and output gauge                                                                                                                                                                                                                         |
| Layer line                                                                                           | Band tag on the bays                                                                                                                                                                                                                              |
| Rock and taps                                                                                        | Mine window and red button                                                                                                                                                                                                                        |
| Crew line and chips                                                                                  | Crew plate. Grandpa and posts move to a "Crew" section at the top of Buys                                                                                                                                                                         |
| Effect row (boosts, crafts, bench, expeditions)                                                      | The boost dial shows the crew boost. A tap on the dial opens a "Running now" note listing every timer with its real time left. The Workshop key's sub-line shows the bench timer, and the Engineers key's shows expeditions                       |
| Relic goal line                                                                                      | The relic tag, and a tap on the dark next socket                                                                                                                                                                                                  |
| Relic shelf, detail, reveal, Legend, keepsakes                                                       | Drawers in the board skin. The reveal opens itself, as today                                                                                                                                                                                      |
| Golden vein and its note                                                                             | In the window, as above                                                                                                                                                                                                                           |
| Legacy badge                                                                                         | A stamped "LEGACY ×2" plate on the window frame's lower edge                                                                                                                                                                                      |
| Thumb bar                                                                                            | Key rail                                                                                                                                                                                                                                          |
| Teach dot, New note, guided first use                                                                | Red dot lamp on the key cap; the New note as a board note above the rail                                                                                                                                                                          |
| ☰ menu: ledger, sign in and out, workshop entry, pass the mine, saved copies, field log, Start over | The Ledger sheet: "Tonight" (the field log's latest lines), "The mine" (stones left, materials, the goal and the next-layer hint, the relic count), then rows for Account (sign in or out), Saved copies, Field log, Pass the mine and Start over |
| Welcome back, layer arrival, craft done                                                              | A drawer card that opens itself on launch or arrival, with one big button                                                                                                                                                                         |
| Save conflict, other tab, update available                                                           | Drawer cards in the board skin, same words and buttons                                                                                                                                                                                            |

## Rules the board keeps

- **Numbers:** real prices, gains, staff and free workers. Discoveries stay vague. No "?" in player text, except the existing "Start over?". Copy comes from `src/screen-words.ts` and today's words. New strings, such as "Saving for", "Done", "By hand", "No. 2 Shaft", "Back to the board", "Try again", the bay line "+12/s · 1 hand" and the plate's "your free worker can run it", are listed in each sliver's PR for Flemming.
- **Targets:** at least 48×48 CSS px with 8px gaps at 424×924. On a PC they are measured in board pixels before the fit scale, and the rendered size is reported, not gated (call C4). The mockup uses 54px for strips and drawer buttons, 64px keys, and 10px gaps.
- **Text and contrast:** at least 13px at 424×924. Contrast is at least 4.5:1, measured from screenshot pixels. Numbers use a monospaced, tabular face.
- **Fonts:** Barlow Condensed for legends and Share Tech Mono for numbers, both OFL licensed. They are bundled with the app so it works offline, not loaded from Google Fonts.
- **Silent** until he unmutes. There is no new sound.
- **Close is pause:** nothing here changes saving. Buys and digs still persist on every mutation, on hide and on pagehide.
- **One gold control:** the Ready now plate. A lamp is a status light, not a second gold control.
- **Two session depths:** a two-minute check-in is the board plus one tap on Ready now. A longer sitting is one key tap to a drawer that fits.

## Room for #357 and #358

- **Milestones (#357):** the bay sub-line and the Buys row info line carry today's `milestoneLine()` ("12 of 25 · …"). The bay sub-line falls back to "+12/s" when it does not fit.
- **Buy ×10 / Max (#358):** the Buys row's right column has room for a 48px toggle under the price tag. That makes the row 80px. Early and mid game, Buys still fits with no scroll. Late game, with six tiers and the Crew section, the list scrolls inside the drawer (call C1). The toggle itself, and its count and total price, are #358's sliver.

## How it is built

- **Code:**
  - `mountain-screen.ts` keeps its wiring. The layout becomes a board module: rows, the `layout()` fit, and the 9-slice skins.
  - Each panel keeps its logic and moves into the drawer skin.
  - The window is its own module, driven by the view the screen already renders from. It reads counts and band, and never writes the mountain.
  - The Ready now rule is a pure function in the rules layer, with unit tests. It is display only and never buys.
- **The art moves** from `mockups/control-board/assets/art/ind-board/` into `src/assets/board/`, imported as today. New art goes through the pixellab skill, which asks first. Flemming has said there is no cap on art or quality.
- **CSS:** new board tokens, palette and pixel sizes in `src/tokens.css`, with the token check kept. Each sliver removes the CSS of the part it replaces.
- **Straight to live (decision D3):** there is no flag. Each sliver replaces its part of today's screen for real, so from B2 until both B6 and B7 have shipped, the game mixes the board and today's look. Each sitting still ships a game that plays and never scrolls at 424×924.

## Art

**Already made (in the mockup):**

- board, frame, tag, key and inset skins;
- odometer, red decimal drums and point;
- boost dial, output gauge, gauge counter;
- window frame, glass, and the Granite view;
- sheave, steam, drill, borer, tarp, cage, tub empty and full, and the miner;
- dust;
- the four machine icons and their dim states;
- the five key icons and their dim states;
- relic sockets and the relics, dark and found;
- iron, clay and stone;
- the ready guard and name plate;
- the red button, lamps, flap counter;
- maker's plate and strip, desk and desk pool.

**Still needed, all through the pixellab skill:**

- window views for the Topsoil, Crystal Caves and Deep Heart;
- the Great Machine and a kid for the window, and the Great Machine and kid icons for bays and rows;
- the golden vein glint in the window;
- a cave-in in the window;
- the Legacy plate;
- the Running now and Account icons;
- crystal and heartstone material icons;
- the steel housing art for the PC, if the 9-slice frame does not suffice.

## Checks

- **Gate:** `npm run gate -- full` stays green in every sliver. Coverage floors are kept.
- **Unit tests:** the Ready now rule, the odometer format, the gauge unit steps, the band to view mapping, the bay tier pick, and the board fit at 424×924, 424×830 and the PC sizes.
- **Visual check:** at 424×924 and the three PC sizes, from B2 on, it checks:
  - no page scroll, and each drawer fits in its usual states;
  - targets at least 48px with 8px gaps (board pixels on the PC);
  - text at least 13px at 424×924;
  - contrast at least 4.5:1;
  - every image of the board at an exact 2× scale at 424×924.

- **Play:** `npm run play` on the named saves (early, mid, late, edge) shows the phone at 424×924 and the PC. It reads the save line, and a tap on the window and on Ready now behave as above.
- **Docs:** `docs/ui-audit.md`, `docs/ART.md`, `docs/ARCHITECTURE.md` and `docs/design-intent.md` are updated in the sliver that changes them.

## Slivers

Each sliver is one issue under the parent, #368, one sitting and one PR, in this order.

| #         | Sliver                                                                                                                                                                                                                                                                                                                                                                | Depends on | Done when                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| B1 (#369) | This spec and the reference mockup                                                                                                                                                                                                                                                                                                                                    | (none)     | Approved and merged                                                                          |
| B2 (#370) | The board frame and its top: stage, 924 fit, skins, bundled fonts, relic plate (replaces the goal line and shelf button), stock row with odometer, boost dial and Running now note (replaces the pocket pill and effect row), save line and save drawer. Today's layer line, crew line, rock and thumb bar stay below, on the enamel. Gate phone size becomes 424×924 | B1         | Plays with real numbers and no scroll at 424×924. Gate green, play shots at 924 and PC       |
| B3 (#371) | The gauge row: output gauge, crew plate, and the mine window with tap to dig, the haulage loop, machine beats, a view for each band, the golden vein, hazards and the Legacy plate (replaces the rock, crew line and Legacy badge)                                                                                                                                    | B2         | All four bands seen in play. New art approved                                                |
| B4 (#372) | Machine bays with the band tag (replaces the layer line), the Ready now plate and the red button. The numbers-rule exception goes into `docs/design-intent.md`                                                                                                                                                                                                        | B3         | The rule's unit tests pass, a double tap buys one in play, and a troubled bay fixes as today |
| B5 (#373) | Key rail (replaces the thumb bar) and the Buys and Upgrades drawers, with the "i" cards, teach dots and spare plates. The Workshop and Engineers keys open today's sheets until B6                                                                                                                                                                                    | B4         | Every Buys and Upgrades state seen in play at 924                                            |
| B6 (#374) | Workshop and Engineers drawers                                                                                                                                                                                                                                                                                                                                        | B5         | Every Workshop and Engineers state seen in play at 924                                       |
| B7 (#375) | The Ledger key takes the ☰ menu. Relic shelf, welcome back, arrival, craft done, conflict, other tab and update cards in the board skin                                                                                                                                                                                                                              | B5         | Every overlay seen in play. The ☰ button is gone                                            |
| B8 (#376) | The PC desk and housing, the last of the old CSS, and the docs                                                                                                                                                                                                                                                                                                        | B6, B7     | Gate green. `docs/ui-audit.md`, `docs/ART.md` and `docs/ARCHITECTURE.md` describe the board  |

## Decisions for Flemming

Answered on 7 Nov 2026:

- **D1, the Saving for time:** keep it. The plate reads "Saving for a cart · in 4m". This is the one written exception to "never show time-to-afford" in `docs/design-intent.md`, and B4 adds it there. It is the time at the current speed, rounded up, and it shows only on this plate.
- **D2, heights:** one phone layout, 424×924, the installed app. Shorter screens scale the board and are not tested.
- **D3, rollout:** straight to live. Each sliver replaces its part of today's screen, with no flag, and the game mixes the two looks until both B6 and B7 have shipped. B8 then adds the PC desk and the docs, and removes any CSS nothing uses any more.

Earlier in this session, Flemming also ruled:

- the direction (B's board with A's mine in a window);
- big phones only;
- PixelLab art with no cap on quantity or quality;
- the Ready now rule as written above, including "Saving for".

## Calls made while writing this spec

Flemming can overrule any of these while reading.

- **C1, long drawers:** the page never scrolls, and a drawer fits in its usual states. A list longer than the drawer scrolls inside it, as long lists do today: late-game Buys, a full Upgrades, a full Engineers crew. Locked and owned rows stay one line, as today.
- **C2, bay tiers:** cart, drill and borer until the Great Machine is on sale or owned, then drill, borer and machine. A tier not on sale yet shows its dim, locked bay with no price.
- **C3, trouble on a bay:** a tap counts toward the fix (5 taps or a hold), not open Buys. Trouble on a tier with no bay lights the Buys key red and is fixed on its row.
- **C4, PC targets:** measured in board pixels before the fit scale. The rendered size is reported. At 1366×768 the board scales to about 0.81.
- **C5, timers:** the boost dial shows the crew boost. Its "Running now" note lists every timer. The bench and expedition timers also show on their keys' sub-lines.
- **C6, the menu:** the Ledger key takes everything in the ☰ menu, and the ☰ button goes.
- **C7, fonts:** Barlow Condensed and Share Tech Mono, bundled (OFL), so the app works offline.
- **C8, Grandpa and posts:** a "Crew" section at the top of Buys. The crew plate stays "CREW 56 · 1 FREE".
- **C9, Legacy:** a stamped plate on the window frame's lower edge.
- **C10, the reference mockup:** committed under `mockups/control-board/` with its art, and left out of Prettier. Its art moves into `src/assets/board/` as each sliver needs it.
- **C11, Ready now with nothing to work with:** with no free hand and no affordable worker, the plate saves for a worker. At zero speed it shows the price and no time. The mockup's `eta()` caps minutes at 59 and can round an hour down; do not copy it.
- **C12, save line copy:** the five states keep today's words. The extra "· Kept on this phone" and "Details" are new and listed in B2's PR. "Details" replaces the mockup's "Why?", since player text has no "?".
- **C13, row copy:** rows keep today's "Needs N workers" and the price-only dear state (`docs/ui-audit.md`, points 3 and 9). The mockup's "Needs 7 more workers" and "Needs 4,052 more" are not built.
