# Design: The Legendary Relics of Fatherhood

This is the north star for the game. Open GitHub issues stay the plan; this page says what the issues add up to. Keep it short and edit it when a decision changes.

## Vision

Deep inside a mountain of **240,000,000 stones** lie the six Legendary Relics of Fatherhood, left by the great dads of history. You start with your bare hands: one tap, one stone. The mountain is far too big to dig by hand, and that is the point. Scale makes automation necessary, the way it does in _Needle In A Haystack_ and _Cookie Clicker_. Each relic you uncover is a power spike and a virtue of fatherhood.

The tone lifts dads up. It honors them; it does not joke at their expense.

It stays a dad-friendly game (see `.claude/rules/dad-friendly-game.md`): two-minute sessions, gentle, never punishing, close is pause, silent until unmuted, phone and PC, one save.

## Core loop

1. **Tap the mountain** through the mine window (#371). Each tap mines one stone. Stones are the currency.
2. **Hire workers.** Spend stones on workers who mine for you every second. Each worker costs more than the last (escalating cost), so the next one is always just in reach.
3. **Leave.** Workers keep mining while you are away, at a resting pace (30% of their speed). A gap pays up to 8 hours. One absence longer than half a day pays up to 16 hours, until the Shield makes it a whole day. Earnings are computed from timestamps on the next open; there is no live server.
4. **Come back.** A "While you were away" screen celebrates what your crew mined.
5. **Hit a relic depth.** Relics sit at fixed depths (stones mined out of the mountain). Reaching one uncovers it and unlocks its power.
6. **Golden veins.** Now and then a glinting vein appears; tap it for a short boost. Missing one costs nothing.

The menu's ledger (the Ledger key opens the menu until B7, #373) shows stones left in the mountain, written readably ("987,654" → "987.7 thousand", "98.7 million"), with the materials and the next-relic goal. After the Lantern, the same goal also sits on the mountain as one thin line (#336).

## Relics

Depths are fractions of the mountain so tuning is one number. Order is the story: guide, protect, build, be patient, teach, become the hero.

| #   | Relic                 | Virtue          | Depth (stones mined)     | Power (first cut)                                                                                                                                                                                         |
| --- | --------------------- | --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lantern of Guidance   | Guide           | 1,000,000                | Shows the next relic and a progress bar toward it; golden veins appear 40% sooner.                                                                                                                        |
| 2   | Shield of Protection  | Protect         | 10,000,000               | Away earnings are no longer capped (base cap is 8 hours). Progress is safe while you live your life.                                                                                                      |
| 3   | Hammer of the Builder | Build           | 25,000,000               | The Great Machine can be built, the biggest automation tier. It goes on sale at 120,000,000 mined, the Deep Heart (#252). Until then its card shows once a borer is owned, marked Locked, Machine · 120M. |
| 4   | Heart of Patience     | Patience        | 45,000,000               | Away earnings grow the longer you are gone (up to ×1.5 after 12 hours). Putting the phone down is rewarded.                                                                                               |
| 5   | Crown of Wisdom       | Teach           | 70,000,000               | Kid workers: they mine, count as workers, and boost every other worker a little.                                                                                                                          |
| 6   | Mantle of the Hero    | Become the hero | 240,000,000 (the bottom) | Final relic. Ends the run as a Legend. Pass the mine to your kid when you are ready (#326).                                                                                                               |

Relics are derived from stones mined (`src/relics.ts`), so the save has no relic field. A relic is celebrated once, in the session where it is uncovered (by tapping, workers, a vein, or away earnings).

M1 shipped the first relic only. The mountain was 1,000,000 stones then, then 100,000,000 (save v4). It is now 240,000,000 (save v5, #177). A v3 save's stones mined are scaled ×100. A v4 save keeps every stone already mined and gains the depth under the old bottom. The Lantern sits at 1% (earlier than the old 2%) so it still lands in the first evening.

## Numbers and tuning

- All game numbers live in one module (`src/mountain.ts`) as named constants. Change a number there, not in the UI.
- Integers only in the save. Live and away mining use the same pure function: `accrue(state, from, to)` turns elapsed whole seconds into stones and returns the time it consumed, so fractions are never lost and offline and online math cannot drift apart.
- Worker cost: the worker curve in [Numbers now](#numbers-now). Kids use the same curve. History: #356 had ×1.08, M7 #140 ×1.25, #89 ×1.15.
- Base away cap: 8 hours; the Shield lifts it to 24 hours (built, #104: `effectiveRates().awayCapMs`). Paying the sim dad's full 11h40 nights made the bottom day 5.0, so the borer's first cost rose 2.5M → 8M (bottom back to day 6 for both sim dads; Lantern 1.5, Hammer 3–3.5).
- Away pay rate: time away (app closed, or sitting in the background with no ticks for over 10 seconds) pays `AWAY_PAY_RATE` = **30%** of the crew's speed; live play pays in full. It is the main pacing lever. The Heart of Patience can raise it later (e.g. toward 60% after long absences), and so can M3's _Steady hands_.
- Big numbers: plain digits under 10,000, then one decimal with a word ("12.3 thousand", "1.2 million"). Tight cards and tending gains use the short form ("12.4K", "2M", "+35 stones/sec").
- **What the player sees (#166).** Decisions and purchases show real numbers: the price of a machine, a worker, an upgrade, a boost, and a promotion, the output of that purchase, and the stones a second an engineer adds by tending (staffed machines only, from `effectiveRates`). Discoveries stay without numbers up front: relic finds and hints, expedition outcomes and finds, hazards, and what comes next. No "?" placeholders.
- Pacing target for M1: first worker within a minute of tapping; first relic after roughly 1–2 evenings of short sessions.

## Numbers now

The one home for the economy's current numbers. Other docs link here instead of repeating them. Each value is read from the code named beside it. A retune changes this section, and the old values move to the history under the milestone that set them.

**Tiers** (`TIERS` in `src/tiers.ts`):

| Tier          | First price (stones) | Stones a second each | Workers to run one (`staff`)        | Unlock                                                                                                                                        |
| ------------- | -------------------- | -------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker        | 20                   | 1                    | 0                                   | from the start                                                                                                                                |
| Mine cart     | 600                  | 6                    | 1                                   | shown once you own a worker                                                                                                                   |
| Steam drill   | 73,080               | 36                   | 1                                   | shown once you own a cart                                                                                                                     |
| Tunnel borer  | 4,940,000            | 357                  | 8                                   | shown once you own a drill; on sale from 10,000,000 mined (the Granite start)                                                                 |
| Great Machine | 120,600,000          | 2,100                | 10, or 5 while an engineer tends it | shown once you own a borer; needs the Hammer, on sale from 120,000,000 mined (run 1; from run 2 on, at `KID_MACHINE_OPENS` 0.9 of that depth) |
| Kid worker    | 250,000              | 25                   | 0                                   | shown once you own a Great Machine; needs the Crown of Wisdom                                                                                 |

The tended Great Machine's 5 is `TENDED_MACHINE_STAFF` in `src/engineers.ts`.

**Growth** (`tierCost` in `src/tiers.ts`): a machine costs `ceil(firstPrice × 1.15^owned)` (`MACHINE_COST_GROWTH`). A worker or a kid costs `ceil(firstPrice × 1.06^owned)` (`HELPER_COST_GROWTH`). So the 2nd cart costs 690 and the 13th 3,211. Machines and workers scale with the kid-run stretch k only, never with the band.

**Bands** (`src/scale.ts`): `BAND_STARTS` is 0 / 10M / 45M / 120M, in run-1 stones of depth (the Topsoil, the Granite, the Crystal Caves, the Deep Heart; 240M in all). `BAND_SCALE` is 1 / 2.625 / 6.3 / 32.4: the stones a band takes per stone of depth, at stretch 1. Upgrades and promotions are priced with `oneOffStretch` = k × the scale of the band the run stands in.

**Milestone marks** (`MILESTONES` in `src/milestones.ts`): owning this many of a tier makes every one of them twice as fast, and marks stack.

- Carts and drills: 10, 25, 50, 100, 150, 200.
- Borers: 5, 10, 25, 50, 100, 150, 200 (the mark at 5 is Flemming's ruling, kept from the old game).
- Great Machine: 2, 3, 5, 10, 25, 50.
- Workers: 25, 50, 100.
- Kids: none.

**Kid runs** (`src/scale.ts`): `KID_RUN_GROWTH` is 3/8, so each run lasts about that share of run 1 longer than the last, with no cap. `MAX_STRETCH` is 100,000,000, the biggest stretch a save may carry (above `kidStretch(1000)`, about 70.8M).

## What happens to the 3×3 grid

The 3×3 dig / place / fuse grid is **replaced**, not extended. It was a sandbox for the save, auth, and idle plumbing, and that plumbing stays: progress store, cloud save, guest save in `localStorage`, a signed-in on-phone backup that is never deleted, structured log, save line. The grid domain (`grid.ts`) and screen (`pocket-grid-screen.ts`) are swapped for a mountain domain and screen. On launch the phone and the cloud are compared: a later run wins, else more stones mined, else a newer `lastSeen`. A tie between two real copies keeps the phone. A phone that has never saved keeps the cloud document. The phone is uploaded only when it is strictly ahead. Coming back to a tab reads the server before it writes again, and the phone keeps recording during that read. One tab on the device plays. The others say "Playing in another tab" until Play here, which waits for the first tab to save. When two devices really diverge, a bottom sheet says "Two saves found": "Both of these kept digging. Pick the one you want to play – the other one is kept safe, nothing is lost." The cards are "This phone" and "Other device", with stones mined and the band ("Granite, 12.4M deep"), stones in the pocket, machines, crew, and last played in local time. "Play this one" then asks "Play this one? The other is saved for 7 days." The menu's "Saved copies" lists up to three of those. A copy from an earlier run stays listed, greyed out, with "From an earlier run – can't be played now" and no way to play it.

Old saves are migrated, not wiped: dug cells count as stones already mined out of the mountain, and every stone or chunk on the grid becomes stones in your pocket (a chunk is worth two). Save format v3 carries the mountain; v1 and v2 still load.

## UI direction

- The mine window is the tap target (#371): a 212×180 window down No. 2 Shaft, at the right of the gauge row. A tap digs exactly tap power and shows "+N" over a dust puff under the finger; a keyboard Enter puffs at the upper face. While a signed-in save loads, the window is only its frame and dark glass, so nothing unearned shows. Fat finger, touch first.
- The game sits on a control board (#370): a 424×924 enamel panel of PixelLab art at exactly 2×, scaled down as a whole to fit a smaller screen or a PC window, inside the phone's safe area. Under the board's top sits the gauge row (#371, 176 to 414px): the output gauge on the left, the mine window at the top right and the crew plate under it. Under it come the machine bays (420 to 636px) and the Ready row (644 to 762px), then the key rail (768 to 860px, #373), ending at least 8px above the save line. Buys and Upgrades open as drawers that cover 178px down to the save line, from 8 to 416px across, so the odometer and the save line stay in view.
- The machine bays (#372) sit under the gauge row, under a band tag on their top edge. The tag reads the layer's name and its short advice, the layer line's words without the full stop ("The Granite · Suits borers", "The Topsoil"). There are three bays (C2): cart, drill and borer until the Great Machine is on sale or owned, then drill, borer and the Great Machine; a mined-out mountain shows the last three. Each bay is one 408×54 button with a lamp, the machine's icon, its name (the short name when the full one does not fit), a sub-line, a flap counter and a price. The sub-line is the next ownership mark, else the gain and hands ("+28/s · 1 hand"), else the gain alone, written the same way on all three bays; a locked bay says where it opens. The flaps show how many he owns, two flaps and a third from 100, held at 999; a changed digit flips in hard steps. The price reads "Next" (or "First" for the first one) over today's compact price, or "Locked" alone. The lamp is amber on the Ready now pick, green on a machine the pocket and the free hands cover, dark otherwise, and red on trouble. The borer waits under its tarp until the first one arrives, and the drill's icon steps while drills run. A tap on a bay opens Buys. A troubled bay never opens Buys: its sub-line reads the shout and "Hold to fix", and five taps or a 600ms hold fix it, as on its Buys row; "Fixed! The crew cheers." then shows in the board note, and taps pass through that note. Trouble on a tier with no bay (a cart in the Great Machine's era) lights the Buys key's red lamp and is fixed on its Buys row (C3).
- The Ready now plate (#372) is the one gold control on the board. It shows the biggest unlocked machine the free hands can run and the pocket covers ("READY NOW · Buy a drill · 96.6K", with its gain and "5 free workers can run it" under it), else, with a hand free and nothing affordable, the cheapest machine he can run to save for ("SAVING FOR · Saving for a cart · in 4m", with its price and gain), else, with no hand free, a worker ("Hire a worker"). The time is the time until the pocket reaches the price at the current speed, rounded up to the minute ("4m", "1h 5m", ">99h"), and at zero speed it is left off (decision D1). The plate never buys by itself; only a tap buys. A tap on Ready now reads the rule again and buys exactly one, the same buy as the Buys row's, then holds "Done" with what the new machine adds for 1.9s, so a sleepy double tap buys one. A tap on Saving for opens Buys and spends nothing. Buys opens over the plate and the bays, so a row pressed within 400ms of Buys opening buys nothing: the second tap of a sleepy double tap on Saving for or a bay lands on the Buys drawer and spends nothing. Mined out, it reads "The mountain is mined out" with its lamp dark.
- The red DIG button stands right of the plate. A tap digs exactly as a window tap does, and the window shows the "+N". Its legend reads "Dig · +N" (tap power), and while digs keep coming, by the button or the window, "By hand · +N" counts them up. Mined out, it rests with no legend. While a save loads, the bays, the plate and the red button show only their frames and art.
- The board's top is the relic plate and the stock row. The relic plate is six sockets: found relics lit, the next one dark, the rest empty. A tap on a socket shows a short note in the shelf's words (the found relic's virtue, or the vague tease and "Next · …" hint), ending in a Relic shelf key that opens the relic shelf. A note with a key stays up until the key is used, a tap lands elsewhere, or Escape. An enamel tag under the sockets reads "Relics of Fatherhood · 2 of 6"; it is a label, not a button.
- The stock row is the odometer and the boost dial. The odometer's five drums show the pocket: the whole number under 100,000 ("41,380"), then four figures and a unit ("412.4K"), rounding down, ">999T" at the top. The drums roll in hard steps. A buy shows a short "−5,868" beside the Stones legend. The boost dial shows the crew timer the crew is running at (Overtime, axle grease or a blasting charge) with its multiplier and time left, or "Crew ×1 rested" when none runs. A tap on the dial shows the Running now note: every countdown running, one per line, or "Nothing running". Stones left in the mountain, the materials, and the next relic live in the menu's ledger, behind the Ledger key.
- The save line is a steel strip at the foot of the board: a lamp and today's save words ("Sign in to save", "Saved on this device", "Loading your save...", "Saved to your account", "Couldn't reach your save"). When the cloud cannot be reached it adds "· Kept on this phone" and "Details". A tap opens the save drawer: the account, the stones on this phone, the last try, Close, and Try again (Sign in when signed out). A tap on the board above it, Escape, or the line again closes it.
- The output gauge reads the crew's stones a second (#371). Its needle sweeps the marks 0, 5, 10 and 15 of a unit printed on the face (`×100`, `×1000`, `×10K` … `×100T`); the unit steps up a power of ten once the rate passes 15 of it (1,501 stones a second reads on `×1000`), so the needle never pegs below the top unit. The needle is damped, never bounces, and moves on 5° frames; a dig or a buy gives it a small kick. The counter under it reads the rate in five characters at most ("14.7K"), with "Stones a sec" below. A NaN rate reads 0, and so does a mined-out mountain: nothing is earned.
- The crew plate under the window counts the whole crew (workers and kids) and the free hands: "Crew 84", a lamp that glows amber while anyone is free, and "18 free". It is the only free count on the board. The crew line itself (its sentence, its chips and Grandpa) is the "Crew" section at the top of the Buys drawer; Buys lays its chips out again when it opens, and a crew line that does not fit splits into even rows.
- The window's view is one picture per band (92×76 art, `mine-view-{topsoil,granite,crystal,heart}.png`), so the band shows in the window, not as a tint. Its loop: once there is a worker, a kid or a cart, a miner runs a tub between the cage and the face and tips it at the cage, while the sheave and the steam work on the headframe. Drills stroke at the face and the borer cuts once the save owns them; the Great Machine stands on the surface once one is owned, and a kid stands by the lower lamp once there are kids. Everything moves one art pixel at a time on hard steps.
- A machine arriving gives one calm beat per tier whose count rose, however far: a cart sends the full tub up the cage and a new empty one down, a drill puffs dust, and the first borer has its tarp dragged off. Nothing beats on the first render, on a fall (Start over, Pass the mine), or under reduced motion, where the window and the needle hold still and a dig's "+N" shows without rising.
- Golden veins glint on the view's rock, inside the window and on top of it; a tap on the vein pays the vein and never also digs. Its payout ("Golden vein! +N stones") and the quiet away line show in a one-line board note under the window. Hazards show in the window too: a cart trouble brings the cave-in down over the face and holds the run, and a drill or borer trouble holds that machine still. The shout and the fix are on the machine's bay (when it has one) and on its row in Buys.
- On a kid's run the Legacy plate, a brass plate across the window's lower edge, reads `Legacy ×1.5` (×2 after the second pass, and so on). It is a label, not a door.
- The relic shelf, opened from a socket note's Relic shelf key, shows six slots: found relics glow, missing ones are dark silhouettes.
- The key rail (#373) holds five steel keys, 64px wide and 16px apart: Buys, Workshop, Engineers, Upgrades and Ledger. Each key is a cap with its icon, and its name under it. A key whose door will not open yet is locked: a dim cap and icon, a quiet name, and an unlock line under it ("With the clay" on Workshop, "With 1st borer" on Engineers); it takes no tap. Workshop waits for the Granite's clay. Engineers wait for the first borer. Buys, Upgrades and Ledger open from the start. A lit cap says there is something to do behind the key, where the old gold glow was: Workshop when a craft can start, Engineers when a promotion is affordable, and Upgrades when one is affordable. Buys never lights; the Ready now plate and the bay lamps say it. A lit cap is a status, not a second gold control. A small red dot lamp in the cap's corner is the teach dot (a system not yet used) and, on Buys, C3's trouble lamp for a tier with no bay. Under Workshop the bench's clock counts down while a craft runs, and under Engineers the soonest trip's. Workshop and Engineers open today's sheets until B6, and the Ledger key opens today's menu until B7. A New teach note shows once a launch as a slim sign over its key, in the band between the Ready plate and the rail; it takes no taps, its words are read on the key's label, and any tap puts it away. The dot stays until he opens the sheet.
- Buys and Upgrades open as drawers (#373): a riveted sheet slides up from under the board's middle in six hard steps (240ms) and away in five (200ms), covering 178px down to the save line, so the odometer and the save line stay in view. Each has its title, a kick under it, an "i" in the corner, a list of rows, the spare plate under a short list, and Back. A tap on the board above the drawer (the scrim) closes it, and a tap there over a relic socket also shows that relic's note. Escape closes it too. Opening one drawer closes the other. For 400ms after a drawer opens, a finger that lands on it (a row, an "i" card or Back) is the second tap of the double tap that opened it and does nothing; a keyboard press is never early. The "i" shows the How it works cards in the list's place, with one Back that brings the list back and starts the 400ms again. While a drawer is open its rows, sections and crew chips keep their places; a row that should appear or go waits for the next open.
- A drawer row is 76px tall, 10px from the next: a lamp, the icon, the name (with a badge such as "Lv 2/10"), an info line, a need, a why and a flag, then the gain, the price tag and the verb at the right. A Buys row is in one of four states. Ready: a green lamp, amber on the Ready now pick (flagged "Ready now", or "Saving for" on the machine he is saving for), and the verb Hire or Buy. Short of workers: "Needs 8 workers" in rust and the verb naming the hands; it still buys, as before. Dear: a dark lamp, a dim tag and the hands or the verb in quiet ink. Locked: "Locked" on a dim tag, the dim icon (the borer under its tarp, the Great Machine under canvas, the kid as a silhouette) and the line that says where it opens. A tap that buys holds "Done" on the row, with a green lamp, for 1.9s, so a sleepy second tap buys nothing. A tap he cannot afford blinks the lamp red, off, red, off (140ms each) and buys nothing; under reduced motion it does not blink. An engineer on the machine adds "Ada tends · +86/s" to the flag. The staffing New row reads "New" and hires a worker. The spare plate fills what a short list leaves: the maker's plate, the strip, or nothing.
- A drawer fits with no scroll in its usual states. Late-game Buys and a full Upgrades are longer than the drawer and scroll inside it (C1): the page never scrolls, the spare plate is off, a drag over a row never buys, and the staffing New row is scrolled into view as Buys opens. Buys ends with a footnote: "Ready now offers the biggest machine your free workers can run and you can afford. It saves for the next one when nothing is affordable, offers a worker only when no hand is free, and never buys for you."
- An unlocked buy, upgrade, or craft always shows its price, what it does, and why, even when the pocket is short. A locked card says Locked and hides those lines. Tapping the card buys it. Dragging the list does not.
- Countdowns live in the boost dial's Running now note, one chip per line: icon, name, multiplier, time left. None are hidden.
- Warm heroic lantern light: deep night browns, amber and gold highlights, soft glow. No harsh flashes, no sound until unmuted.
- Design tokens live in `src/tokens.css`, the same scale as the approved mocks: type 14/16/20/24/32, space 4/8/16/24, the night colours, radii 12 and 20 plus a pill, and a 48px target with 8px between targets. Every tap target is at least 48px (`--target-min`), and the Workshop sheet's controls stand 8px apart (`--target-gap`) (#328). New CSS uses them. Screens already on the mountain keep their look until a later sitting migrates them.
- A short absence (one to five minutes, `QUIET_AWAY_MS`) pays without the card: a small "+N stones while you were away" note under the mine window (#334, #371). Under a minute stays silent, like a reload. Ore brought up while away always opens the card.
- The welcome-back screen is a celebration, not a chore: one big number, one button. After 8 hours or more away (`DREAM_AWAY_MS`), its quote line gives way to one vague "mountain dreams" line about the band you are in ("While you were gone, something hummed below the Granite.", `awayCheerWords`, #337).
- Art comes from PixelLab (ask before generating). No placeholder boxes.

## Milestones

### Ownership marks (#357)

Owning a set number of a machine, or of workers, makes every one of that tier twice as fast. Marks stack (`src/milestones.ts`). The marks are in [Numbers now](#numbers-now). Kids have none. The card shows the next goal as "N of M · line" and never a payback number.

### M1: The Mountain (first playable of the new loop)

- Mountain, counter, hand mining (save v3 and migration from the grid save)
- First worker with escalating cost, live mining
- Away earnings and the welcome-back screen
- Golden veins
- First relic: Lantern of Guidance
- Relic shelf
- UI reskin to the lantern-light look

### M2: Automation

Hand mining can't move a 100-million-stone mountain. Each tier is a visible jump in speed.

The tiers' prices, speeds, staff and growth are in [Numbers now](#numbers-now) (`src/tiers.ts`). The history below keeps the numbers of its time.

- One table of tiers (`src/tiers.ts`) drives buying, the speed total and the UI. `accrue` sums every tier, so away earnings use the same math automatically.
- Layout: up to three tiers show as roomy two-column cards. From four on, the grid goes three to a row with short names (Worker, Cart, Drill, Borer, Machine), so all five tiers fit in two rows and the screen never scrolls on the 424×924 board (#370), on the phone and scaled on the PC (1280×800, 1366×768, 1440×900).
- Save: the mountain gets one whole-number field per tier (`carts`, `drills`, `borers`, `machines`). A missing field reads as 0, so older saves load unchanged. Firestore rules allow those fields.
- UI: a compact two-column grid of tier cards (art, name and count, cost) under one total line ("42 stones a second"). A tier not shown yet takes no space. All primary controls must stay visible on the 424×924 control board (#370), the installed app on the phone at scale 1. Another screen scales the whole board uniformly and never rearranges it; the gate tests the PC at 1280×800, 1366×768 and 1440×900.
- Pacing target: the mountain takes **days** for a dad who plays two short sessions a day and lets the crew mine the rest (8-hour away cap). Lantern on day 1, Hammer around days 2–3, the bottom around days 5–7.
- **Pacing now** (after the milestone retune, #357). Any change to away pay, tiers or relic depths must keep the pacing tests green. Bottom days in the pacing simulation (`src/pacing.sim.test.ts`): upgrade dads 3.5, plain 4.5; the second run on day 3. The 20-seed lab's casual types are listed below (run 1 of the lab's casual types ends on day 3.7 to 5.0). The strict lab and the generations lab pass at 20 seeds. The first mountain is not graded on its length: the run is endless and each kid run is harder (`KID_RUN_GROWTH` and `MAX_STRETCH`, in [Numbers now](#numbers-now)). At 20 seeds run 1 ends on day 4.0 for casual-2x10, 3.7 for the checker, 4.1 for checkin-4x2, 5.0 for the evening dad, and day 4.0 for the optimizer and the marathon dad; run 8 ends on day 20 to 27.6. Every dad hires Nils in the borer's sitting.

#### M2 history (numbers of their time)

Every number in this subsection is history. Today's values are in [Numbers now](#numbers-now).

- **#356** had cart 150, drill 21,000, Great Machine 40.2M, machines ×1.13 and workers ×1.08, and `BAND_SCALE` 1 / 1.5 / 9 / 27. Its casual-2x10 first run bought cart 50, drill 45, borer 16 and Great Machine 19 with income growing about 3,008×, and Nils joining on day 3 of a four-day first run; #357 did not re-measure those. #356 moved the borer's opening from 7M mined to the Granite start, and the hand-written price tables gave way to the growth curves.
- **Just before #356:** carts grew ×2, drills and borers ×1.5, the Great Machine ×1.4, and workers ×1.1875. First prices were cart 100, drill 14,000, borer 7.6M (on sale from 7M mined) and Great Machine 40.2M.
- **Earlier history:** Carts, drills, and the Great Machine used `ceil(firstCost × 2^owned)`. Borers used `ceil(firstCost × 1.5^owned)` (#177) so a second and third stay buyable before the Great Machine. Workers grew by `1.25^owned` (M7 #140; ×1.15 since #89) because they staff the machines. Each tier is still a big jump in speed (about 6× or more). Untended, the Great Machine needed 25 workers (10 since #295). An engineer tending it brings that down to 5, and its first cost is 67M so the pacing dad buys one and still has a night of mountain left (#177; #144 was 50M). These numbers come from the pacing simulation; see Pacing below.
- **Pacing** (`src/pacing.ts`, then pinned by `src/pacing.test.ts`): a deterministic dad plays two 10-minute sessions a day, 12 hours apart, taps 3 stones a second, always buys the most speed per stone, and is paid 30% of crew speed for at most 8 hours of each gap. With the M7 numbers he finds the Lantern (1M) on day 1.5 (session 2) and the Hammer (25M) on day 3.5. He pays 2,000,000 stones and one worker for Nils. Before #177 the upgrade-buying dad and the boost-buying dad reached the bottom (100M) on day 5.0 and bought the Great Machine on day 4.5 (Ada tending it, so it runs on 5 workers), after about a day and a half with no other purchase. The plain dad bought that machine on day 5.0 and reached the bottom on day 5.5. The first mountain took at least 5 days. A second run (Legacy ×1.5, upgrades) bought the machine on day 3.5 and reached the bottom on day 4. History: the first cut (×1.15 growth, full away pay) emptied the mountain in 1.5 days; the next (×1.6 growth, full away pay) needed slow tiers (carts 4/s); paying away time at 30% (#91) brought back punchy tiers; #140 steepened workers to ×1.25, raised machine staff, and moved the borer's first cost 8M → 10M so the bottom stayed on day 5. #144 keeps the untended Great Machine at 25 workers and, while an engineer tends it, at 5; its first cost moves 80M → 50M so the dad can buy it on day 4.5 with stones still in the mountain. #148 seats Nils beside Ada when the first borer arrives. #163 makes the sim pay his promotion (2,000,000 stones and one worker), the same price as the sheet. The plain dad's bottom is day 5.5 and a second run is day 4.5. Upgrade and boost dads stay on day 5.0. The first mountain still takes at least 5 days. #177 (borer 595/s, first price 9M, growth ×1.5, drill 14k, early upgrades and Sharper picks repriced so the borer is a live buy; then the bottom moves 100M → 240M and the Great Machine 50M → 67M so the late game is not a one-night clear): plain, upgrade, and boost dads finish on day 5.5. #178 keeps those prices and that finish. An apprentice on the borers adds 16.2% (the old tenth, times 1.62) so tending is at least 8% of output from the borer on. Once a Great Machine is running and she is not the one tending it, her post is topped up to 12% of the untended crew. A second post adds its own floor. The Upgrades sheet fits a 390×844 phone with no scroll of its own. The boost dad buys a second Great Machine (134M) on day 5. Nils is paid the sitting after the borer. A second run stays on day 4. Ada keeps tending. Nils walks the old shaft every session and, once a journeyman, the deep dark each night. The finds apply. A second run has the dad also buy Strong arms whenever it's the best stones-a-day per stone (taps count only during sessions); tap power rewards active play without breaking the pace.

### M3: Strategy (boosts vs long-term upgrades)

M2 gives the player one choice: which tier to buy next. M3 adds the real idle-game decision: **spend now for a short burst, or invest in something permanent**.

- **Quick boosts** (timed, bought with stones, one of each running at a time, shown with a countdown):
  - _Sharper picks_: taps yield ×2 for 10 minutes.
  - _Overtime_: crew output ×2 for 30 minutes. It shares that crew speed with axle grease and a blasting charge. The strongest one is on.
  - Boosts run only while the game is open; they never multiply away earnings, so they reward active play without punishing rest.
  - _Built (#79)_: priced from what they boost, unboosted — Sharper picks costs 120 taps (min 100; a one-minute crew floor from #178 was dropped in #333, because it made the boost a trap while taps were still 1), Overtime 3 minutes of the crew (min 500) — so they scale with progress and always pay for themselves (retuned from 60 s / 600 s of crew, which was break-even at best). `src/boosts.test.ts` proves a 10-minute session at one tap a second earns back ≥5× Sharper picks and ≥3× Overtime at four crew sizes. The drawer row shows the price and the output in stones ("8 a tap", "800/s") along with the × (#166). Saved as absolute end times (`mountain.boosts`), so a reload keeps the countdown; the clock keeps running while away, but away pay always uses the unboosted rate (`effectiveRates(mountain)` without `now`). Sharper picks doubles the whole tap yield including Strong arms; Strong arms takes its share of the unboosted crew. Bought in the Upgrades drawer ("Quick boosts"); a running boost's row reads Running with its clock on the tag, and the boost dial's Running now note lists it. The pacing sim has a boost-buying dad (`buysBoosts`: starts both whenever affordable and idle, every second of play): Lantern 1.5, Hammer 3, bottom 5.0 — inside 5–7, the fastest case; the plain and upgrade dads also finish on day 5.0 (M7 #140; they were on 5.5 before the staffing retune).
- **Permanent upgrades** (one-time purchases, Cookie Clicker style, unlocked by owning enough of a tier):
  - _Better boots_: each worker goes from 1/s to 2.4/s, 650,000 stones, so a lasting upgrade is the best payback on some samples.
  - _Steady hands_: away earnings +25%.
  - _Built (#80)_: one-time buys in the Upgrades drawer under "Lasting upgrades". Better boots — 650,000 stones (#178 follow-up, was 90,000), unlocks at 10 workers, workers 1 → 2.36/s. Strong arms — each level 1.65% of crew speed, first price 46,000. Steady hands — 10,000,000 stones, shown from the first cart, away pay 30% → 37.5% (relative +25%; the Heart of Patience can stack on top later). Each is a row: its name with a "Lv 2/10" badge where it has levels, the effect line, its why, and on the right the price tag over Buy. A bought one reads "Owned" (a maxed Strong arms reads "Owned" with "Lv 10/10"). Locked rows stay hidden until they are open and nearly affordable. A full Upgrades scrolls inside the drawer (C1); the page never scrolls on the 424×924 board, on the phone or on the PC (1280×800, 1366×768, 1440×900). Crew speed is floored to whole stones a second in `effectiveRates`, so the crew line is exactly what gets mined; Buys rows show the boosted per-unit speed (one decimal while under 10). The welcome-back card reads the live away rate.
  - Pacing: Steady hands is the strong one. Priced at 25,000 it pulled the upgrade-buying dad's bottom to day 5.0 (edge of the window); at 10M it's a mid-game buy and the sim stays Lantern day 1.5, Hammer day 3.5, bottom day 6 — for both the plain dad and the one buying Strong arms, boots and Steady hands (the sim weighs each by stones a day per stone).
- **Crew synergies** (permanent, make mixed crews pay): e.g. each worker adds +1% to cart speed.
  - _Built (#81)_: four one-time buys in "Lasting upgrades", each unlocked by owning enough of the tier it boosts. Every unit of the tier below adds +1% to it:

    | Synergy       | From → to              | Unlocks at | Cost       |
    | ------------- | ---------------------- | ---------- | ---------- |
    | Helping hands | workers → carts        | 5 carts    | 2,000,000  |
    | Cart roads    | carts → drills         | 5 drills   | 3,000,000  |
    | Drill crews   | drills → borers        | 3 borers   | 15,000,000 |
    | Borer tracks  | borers → Great Machine | 1 machine  | 30,000,000 |

    Applied in `effectiveRates` (so live, away and the UI agree), stacking with Better boots. The sheet shows one cart before and after ("Carts 6/s to 6.7/s."; with no workers yet, "Each worker makes carts 1% faster."), the way every upgrade card shows its before and after (#324). An effect line reads "<X> now N" (Strong arms: "Taps now 2,258.") only once every level is bought (#343). The why line under it says what makes the card count: a synergy with none of its source tier yet reads "It counts once you have workers.", and Strong arms on a crew too small to move the number reads "It grows with your crew's speed." (#342). A wide tier card shows the percent in the rate line ("+11 ↑12% · 56/s"). A compact card keeps the gain of one more ("+12 · 166/s"); the percent stays in the label. An arrow alone was hiding that gain (#216). Pacing: Helping hands at 50,000 pulled the upgrade-buying dad's bottom to day 5.5; at 500,000 both dads stay at Lantern 1.5 / Hammer 3.5 / bottom 6.
- **Crew staffing** (Flemming's idea): machines need workers to run them. The workers each machine needs, and the smaller crew of a Great Machine an engineer tends (#144), are in [Numbers now](#numbers-now) (`staff` in `src/tiers.ts`, `TENDED_MACHINE_STAFF`). History: #295 set today's staff; M7 #140 had cart 1, drill 3, borer 8, Great Machine 25, and #89 had 1, 2, 4, 10. A machine without enough workers sits idle, and the crew line and cards say so ("3 drills idle: need 3 more workers"). This makes workers matter all game, gives a real choice between more machines and more hands, and pairs with crew synergies and the Crown of Wisdom's kid workers (kids count as workers). The staffing check lives in the same rate function, so away earnings respect it, and the pacing simulation must stay green once it's in.
  - _Built (#89)_: `staff` per tier in `src/tiers.ts` (cart 1, drill 2, borer 4, Great Machine 10). `effectiveRates` assigns workers to the fastest machines first; a machine that can't be fully staffed sits idle (never half-runs). Staffing workers still mine by hand too, so a worker is never wasted. Rates expose `running` per tier and `helpersShort` (the save still counts `helpers`). Away pay, taps, veins and boosts all read the staffed speed. The Crown of Wisdom's kid workers will add to the worker pool (not built yet).
  - UI: a short-staffed crew line reads "135/s · 2 idle, need 2 workers" (warm orange). Every machine card shows the gain of one more and the total ("+12 · 166/s"), including a compact card with a synergy, and how many workers one more needs. The numbers are the live staff from [Numbers now](#numbers-now), with the tended Great Machine's smaller crew when an engineer would tend it. Enough hands reads "3 workers". Short hands reads "Needs 8 workers · 5 free" (#216). A line under the crew names where the workers are ("28 workers: 13 on carts, 15 on drills, 0 free"). When that line does not fit, it splits into even rows, still naming every post. The label still says "Needs more workers to run". The buy float names the same count.
  - Retune: workers became the bottleneck, so their cost growth dropped from ×2 to ×1.15 (the 50th worker costs ~21.7k, not 2e16). That made the crew cheaper overall, so the borer's first cost rose 1.6M → 2.5M. Pacing (plain dad / upgrade-buying dad): Lantern 1.5 / 1.5, Hammer 3 / 3, bottom 6.5 / 6. The sim weighs a machine together with the workers it still needs, and a worker by the speed it adds (its own plus any idle machine it starts).
  - Existing saves (#89): on load, a save without the `staffed` mark got enough free workers to run every machine it owned, then was marked `staffed: true` so it never repeated. M7 (#140) runs one more top-up: `staffExisting` grants whatever free workers the new staff numbers still need, then marks `staffed: 2`. `true` and `1` are the first grant and get the top-up; a save already at 2 is untouched. Kids already on the crew count. New mountains and Start over begin at 2. The welcome card still says "Your crew grew: N workers joined to run your machines." (alone, or under the away report). firestore.rules accept `staffed` true, 1, or 2, so an old client can still write `true`.
- **Tap power scaling** (built, #82): _Strong arms_, 10 levels, first 40,000 stones then 5× each level (#177, was 5,000). Each level adds 1.65% of the crew's speed to every tap (`1 + floor(crew/s × 1% × level)`), so tapping stays meaningful at thousands a second. The tap float shows the real yield. Bought from the Upgrades drawer, behind the Upgrades key on the rail, whose cap lights when something is affordable (#373).
- **Prestige: pass the mine to your kid** (design note, #83; built in M6 with the Mantle of the Hero). The ultimate long-term choice.
  - _When_: offered only after the Mantle (the bottom). Never forced; the finished mountain stays as it is until you choose.
  - _Resets_: the mountain (100M stones back), pocket, every tier including workers and kids, upgrades, boosts, relics found (the shelf starts empty again), golden-vein timer.
  - _Kept_: a **Legacy** count (how many mountains handed down), the account/save itself, settings, and the staffing mark.
  - _Multiplier_: every Legacy makes the whole crew and every tap faster: `legacyBonus = 1 + 0.5 × legacies` (×1.5, ×2, ×2.5, …), applied in `effectiveRates` to crew speed and tap yield (not to away pay, which stays the patience lever). Simple, visible ("Legacy ×2: your kid's crew mines twice as fast"), and linear so it never runs away. The pacing sim gets a second-run target: a ×1.5 run should reach the bottom in roughly 4 days.
  - _Not Start over_: Start over (M2) throws everything away, including Legacy, and gives nothing. Prestige is the reward path; Start over stays tucked in the menu as the clean-slate escape hatch. Both share the same reset plumbing (fresh `startedAt` so stale cloud snapshots can't clobber the new run).
  - _Save_: `legacy: int >= 0` on the save (rules + emulator test), migrated as 0.
  - _Built (#130)_: `legacy` is saved only when > 0 (old saves read as none), capped at 1,000 in the parser and `firestore.rules`. `legacyBonus` multiplies every tier's speed (so cards show it) and the whole tap (its share of the crew is taken before the bonus); the away-pay share is untouched, but away time pays the faster crew. `passTheMine` (`src/legacy.ts`) works only at the bottom with the Mantle, and its new run always starts later than the old one. Pacing sim, upgrade-buying dad, after M7 (#140): first run bottom day 5.0; second run (×1.5) day 4.0. Paying for Nils (#163) leaves that first run on day 5.0 and moves the second run to day 4.5. The catalogue's exact valuation (#171) moves that second run to day 4. At #130 the first run was day 5.5 and a third run (×2) was day 3.5.
  - _Built (#131)_: offered on the Legend card ("Stand proud" / "Pass to your kid", side by side so the finale fits the supported phone) and as "Pass the mine to your kid" in the menu, only while the finished mountain waits. A gold confirm (not Start over's red): "Your kid starts a fresh mountain with your Legacy: the whole crew and every tap ×1.5, for good…", with "Not yet" / "Pass it on". The new run greets: "Your kid's mine: six relics wait inside, and your Legacy makes it ×1.5." A small "×1.5" badge sat beside the stones left; since #371 it is the Legacy plate on the mine window's lower edge. Saved at once, locally and to the cloud; the new run starts later, so a late snapshot of the finished one can't return.
  - _Grandpa (#338)_: after a pass, the old dad stays on. He only tends, at an apprentice's pace, on the biggest running machine no engineer is tending (`grandpaPost` in `src/engineers.ts`), from the kid's first cart. A machine short of workers never takes him, so a buy never slows the crew. No save field: he is there whenever the Legacy is. He never explores, is never promoted, and does not change a machine's crew bill. A crew chip says where he is ("Grandpa on carts", PixelLab portrait), and the pass confirm says "Grandpa stays on to tend the machines." A master's pace made the second run finish on day 4, so he tends like an apprentice; the bottom stays day 4.5, and Nils is promoted the sitting after the first borer. #356: he tends the running, untended group with the largest running × tier output, and a tie goes to the higher tier, so one new borer no longer pulls him off a big drill group.
- **Boosts and time away** (decision, M6): boost timers are absolute end times, so they keep counting down while you're away, and they never pay anything away. Overtime is for play.
- All multipliers live in one pure function over the save (`effectiveRates` in `src/rates.ts`, built in #78), returning tap yield, per-tier speed, crew speed and away pay, so live ticks, away earnings and the UI agree. Boost timers use absolute end times in the save. Away earnings ignore boosts.
- UI: an "Upgrades" sheet behind one compact button. The main screen keeps its no-scroll budget (the browser check runs in the full gate).

### Later (sketch)

- **M2: Automation.** See above.
- **M4: Patience.** Every relic finally does what its card promises. See below.
- **M5: Maintenance.** See below. Before any new feature.
- **M6: Legacy.** Prestige (pass the mine to your kid), per the #83 note above.
- **M8: Strategy lab.** Decision quality, offline. See Milestone 8 below. M8 is built.
- **M9: Layers and the Workshop.** Four rock bands and a one-bench workshop. See Milestone 9 below. M9 is built.

### M5: Maintenance

Four milestones of features landed fast. Before Legacy, pay down the cost. Rules for every PR in this milestone:

- **Behavior-preserving.** No player-visible change unless it fixes a bug found here (then its own PR, with a test that failed first).
- **Tests first.** Before moving code, pin its behavior with characterization tests; the refactor PR must not touch those tests.
- **Coverage never drops** on the critical modules (`mountain`, `rates`, `persist`, `progress-store`, `tiers`, `crew`, `upgrades`, `boosts`, `relics`), measured by `npm run coverage` (added in the test audit) with thresholds in CI.
- Pacing sim, the browser layout check and the Firestore emulator rules tests all stay green. Small PRs, squash-merge on green only.

Issues, in order:

1. **Test audit.** (#114) Add v8 coverage with per-module thresholds; list gaps on the critical modules and fill them with behavior tests; fold redundant/overlapping tests (e.g. screen tests that only re-check rate math already covered in `rates`).
2. **Architecture review** (#115) (pstack how/architect). Module boundaries and import direction (the relics↔mountain↔rates init cycle we hit in #104), and `mountain-screen.ts` (~1,500 lines): split it into per-panel modules (tiers, upgrades sheet, shelf + relic cards, welcome/away, menu) behind the same `mountMountainScreen` API. One panel per PR, characterization tests first.
3. **Bug hunt** (#116) (pstack blast-radius) on save/sync/time math: clock skew and `lastSeen` in the future, background vs away, Start over vs late cloud snapshots, boost end times across reloads, rounding at the bottom of the mountain, the one-time migrations. Each bug found: failing test, then fix.
4. **Simplify / dead code.** (#117) knip strict plus a read for one-use helpers, stale constants and comments, unused CSS.
5. **pstack correct: guards for repeated mistakes.** (#118) Lint/test guards for what bit us twice: rules drift (save fields too, not only upgrade ids), constants exported but unused, prettier on docs, import cycles (`import/no-cycle` or madge in CI).

### M4: Patience (relic powers)

The relics are the spine of the game; by M4 each one changes how you play. All of it lives in `effectiveRates` (or the away accrual it feeds), so live, away and UI agree, and the pacing sim keeps Lantern day 1, Hammer days 2–3, bottom days 5–7.

| Relic                                 | Power (built in M4 unless noted)                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lantern of Guidance (1M)              | Built in M1: lights the way, golden veins 40% more often.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Shield of Protection (10M)            | Away cap 8 h → **24 h**: a whole day away still pays. (Uncapped would let a week away skip the game; 24 h covers sleep + a workday + a busy evening.)                                                                                                                                                                                                                                                                                                     |
| Hammer of the Builder (25M)           | Built in M2: unlocks the Great Machine (on sale from 120M, #252).                                                                                                                                                                                                                                                                                                                                                                                         |
| Heart of Patience (45M)               | Built (#101): away pay grows the longer you're gone, from ×1 rising linearly to **×1.5 after 12 h** (`heartBonus` in `src/rates.ts`, over the paid time only; stacks with Steady hands). The welcome card names it ("The Heart of Patience made it ×1.25."). Planned ×2, but ×2 pulled the sim bottom to day 5.0; ×1.5 lands it at 5.5 for both sim dads with Hammer at day 3 and no other retune.                                                        |
| Crown of Wisdom (70M)                 | Built (#102): **Kid worker** tier (`kids` in the save; rules + emulator tests). Its price, curve and speed are in [Numbers now](#numbers-now) (#327: was 1M and 1/s, which no lab policy ever bought), counts as workers, and each kid makes every worker and kid 2% faster. Shown (locked) once you own a Great Machine, buyable after the Crown. Kid sprite from PixelLab (`src/assets/kid-helper.png`). Pacing follows the M7 retune (bottom day 5.0). |
| Mantle of the Hero (100M, the bottom) | Built (#103): closing the Mantle's reveal opens the **Legend finale** ("You became a Legend"): the full shelf of six, "100 million stones moved. Six relics found. A crew of N beside you.", a nod to passing the mine to your kid (M6). Shown once per run (it rides on the one-time Mantle reveal, so no save field). Days on the mountain were dropped: first-run saves carry no start time, and adding one would need a save field for a single line. |

Issues (milestone _M4: Patience_), one PR each, in order: Shield away cap (#104) → Heart away bonus (#101) → Crown kid helpers (#102) → Mantle finale (#103). Each must update the relic's `power` text to match exactly what it does, extend the pacing sim if the power touches it (the Heart and the kids do), and add rules + emulator tests for any save change (kids add a `kids` field).

### M7: Into the Deep (workers, engineers, expeditions, hazards, the field log)

**Problem (play-test, Flemming).** From the first borer on, taps are a rounding error and the only decision is "buy the next thing", and that thing is far off. The pacing sim shows the hole: today the upgrade-buying dad buys his first borer on day 2.5 and then **buys nothing until the Great Machine on day 5**. Helpers never constrain him either: he keeps 15–31 spare the whole run (Flemming: 63 owned, 38 needed).

M7 makes staffing a real call all run, gives the hands a job in the middle game (send **engineers** into side tunnels, fix **trouble at the machines**), and adds a **field log** so Flemming and Grok Bot can read a player's real numbers without screenshots.

#### 1. Helpers become workers (player-facing text only)

Every player-facing "helper" becomes **"worker"** (cards, crew line, floats, welcome card, upgrade copy: "Helping hands" stays as a name, its text says workers). **Save fields stay**: `helpers` in the save, `TierId "helper"` and `firestore.rules` are unchanged. Renaming the field would need a parser migration, a rules change accepting both names, and old cached PWAs writing the old name back, all for a word nobody sees. Internal identifiers may be renamed later in a pure refactor; the save never.

#### 2. Staffing as a real choice all run

Analysis: the pacing sim (upgrade-buying dad) logs every machine purchase with the workers he must still hire to run it ("short"), what they cost, and the machine's price.

**Then, before M7 (worker ×1.15; staff cart 1 / drill 2 / borer 4 / machine 10, the #89 numbers):**

| Day | Buys          | Machine price | Spare workers | Workers to hire | Their cost | Share of machine price |
| --- | ------------- | ------------- | ------------- | --------------- | ---------- | ---------------------- |
| 1.0 | 1st drill     | 20k           | 15            | 0               | 0          | 0%                     |
| 2.0 | 7th drill     | 1.28M         | 31            | 0               | 0          | 0%                     |
| 2.5 | 1st borer     | 8M            | 31            | 0               | 0          | 0%                     |
| 5.0 | Great Machine | 80M           | 29            | 0               | 0          | 0%                     |

Workers are never the constraint, and nothing is bought between day 2.5 and day 5.

**Options tried** (bottom day for plain / upgrades / boosts / 2nd run; target 5–7, 2nd run ~4):

| Option                                                        | Staffing pressure                                                                         | Bottom                                                  | Verdict                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| ×1.30 growth, same staff (previous draft)                     | spare 3–7 all run, never short; worker cost 0% of any machine                             | 5.5 / 5.0 / 5.5 / 4.0                                   | Hoarding just stops; still no choice.            |
| ×1.15, heavier staff 1/3/8/25                                 | short only at the Great Machine (7 workers, 1% of its price)                              | 5.5 / 5.5 / 5.0 / 4.0                                   | Cheap workers swallow any staff number.          |
| ×1.20, staff 1/3/8/25                                         | Great Machine short 21 workers = 25% of its price; borer free                             | 5.5 / 5.5 / 5.0 / 4.0                                   | Bites only once, at the very end.                |
| ×1.25, staff 1/3/8/25, borer 8M                               | from day 2.5 every machine needs hires (7%→57%)                                           | 5.0 / 5.0 / **4.5** / 3.5                               | Right feel, too fast.                            |
| **×1.25, staff 1/3/8/25, borer first cost 8M → 10M (chosen)** | see below                                                                                 | **5.0 / 5.0 / 5.0 / 4.0**, Hammer 3.5 / 3.5 / 3.5 / 3.0 | **All 10 pacing tests green**; dead zone filled. |
| Worker price tied to crew speed                               | not simulated: hides the curve, makes buying a machine raise worker prices (feels unfair) | n/a                                                     | Rejected.                                        |

**Chosen, the same run (upgrade-buying dad):**

| Day | Buys      | Machine price | Spare workers | Workers to hire | Their cost | Share of machine price |
| --- | --------- | ------------- | ------------- | --------------- | ---------- | ---------------------- |
| 1.5 | 6th drill | 640k          | 4             | 0               | 0          | 0%                     |
| 2.0 | 7th drill | 1.28M         | 5             | 0               | 0          | 0%                     |
| 3.0 | 1st borer | 10M           | 4             | 4               | 444k       | 4%                     |
| 3.0 | 13th cart | 410k          | 0             | 1               | 188k       | 46%                    |
| 3.5 | 8th drill | 2.56M         | 0             | 3               | 896k       | 35%                    |
| 4.0 | 2nd borer | 20M           | 0             | 8               | 9.1M       | 46%                    |
| 4.5 | 9th drill | 5.12M         | 0             | 3               | 10.4M      | 204%                   |
| 4.5 | 14th cart | 819k          | 0             | 1               | 5.3M       | 650%                   |

So the early game is unchanged (workers cheap, a few spare), and from the borer on **every machine comes with a worker bill** that grows from a small extra to more than the machine itself. Late on, a cheap cart is no longer cheap, and "one more borer or the crew for two drills" is a real question. The sim dad now buys something every half day through the middle (days 3, 3.5, 4, 4.5) instead of nothing for 2.5 days. The bottom moves from day 5.5 to 5.0, the edge of the window. The card for a machine that would sit idle shows its output and "needs workers" before the tap, and the buy float says the same. The label still says "Needs more workers to run".

**Great Machine staff (play-check, #140).** Staff 25: the upgrade-buying dad hits the bottom on day 5.0 with 2 borers and no Great Machine (57 workers, 14 carts, 9 drills). Plain and boost dads match that day and also never run one. Staff 15 was tried: he still never staffs a Great Machine, the dead zone comes back (about 2.5 days with no purchase), the bottom moves to day 5.5, and the second run to day 4.5. Staff 25 keeps every pacing window and a purchase at least every day from the first borer, so 25 stays.

**Existing saves:** counts are kept. The old `staffExisting` is not a second full recount of the #89 numbers. One more one-time grant (`staffed: 2`) tops up workers so every machine owned at load still runs under the new staff, the same pattern as #89, with the welcome note "Your crew grew". A save already at 2 is untouched, including one that later buys a machine it cannot run. `true` and `1` mean the first grant and receive the top-up. Kids already hired count toward the crew. Example: 12 carts, 7 drills and 1 borer needed 30 workers at 1/2/4 and need 41 at 1/3/8, so a dad who had exactly 30 gets 11 more. Rules accept `staffed` true, 1, or 2.

#### 3. Engineers

Veterans return as **engineers**: a few named, experienced hands (never more than five), not a second currency.

- **Getting them.**
  - Your first engineer arrives with the first borer: "Your best worker steps up as engineer." She is **Ada**, posted on the borers, and she does not leave the worker count, so a machine that was running keeps running. An older save that already owns a borer gets her once, on the welcome card. Built (#144). The engineers sheet chooses her post (#145). A later purchase does not move her. The pacing dad still does, through `tendBestTier`: borers, then the Great Machine.
  - **Promote a worker**: a worker leaves the staffing pool and becomes an engineer, for a stones price that doubles each time. The price is 1,000,000 × 2^(engineers already in the crew): 1,000,000 with none, so 2,000,000 once Ada is here, then 4,000,000, 8,000,000 and 16,000,000. The new engineer waits at camp. Promoting is itself a staffing call: one fewer worker. Built as a pure action (#144). The sheet explains it ("A new engineer can tend another machine or explore while the others work."). The button shows the price ("Promote: 2M stones") on at most two lines, with the label on the left. It confirms: "Nils steps up as engineer. One worker fewer at the machines." If he cannot pay, the grey reason is "Needs 2M stones". No free worker, or a full crew, still says why in words (#161, price #166). The pacing sim pays that same price (#163). A cheaper Nils (24,000) kept the old days, and made promotion trivial next to a 10M borer, so the 2,000,000 price stays.
  - The deep dark sometimes brings one home: "Your party found a lost engineer, who joined your crew."
- **Names**, a closed list, one each: Ada, Nils, Ruth, Otto, Mae. Never more than five.
- **Ranks**, not numbers: _Apprentice_ → _Journeyman_ → _Master engineer_, shown as one, two or three small lamps on the engineer's badge. An engineer rises a rank after enough expeditions (3, then 6 more); the UI says "nearly a Journeyman" (or "nearly a Master") when one expedition away, and never a trip count. Built (#145).
- **Sheet (#145, redesigned #161).** From the first engineer, the Engineers key on the rail opens the sheet: the worker portrait over its label. The sheet is one open card (portrait, name, rank lamps and the rank word, one sentence) and, once the crew grows, one-line rows for the rest. Two buttons open the choices: Tend a machine, and Send exploring. Each choice has one line about what it does. Carts get a cave-in, drills a flood, borers and the Great Machine a jam; the Great Machine also runs with far fewer workers. The sentence names the live gain from staffed machines ("Ada is tending the borers: +35 stones/sec"). Each tend choice and the cheer show that same gain ("Ada heads to the drills! +6 stones/sec"), and the tended card wears the lamp with the gain beside it. The number follows buys and staffing. A tap cheers, the card glows. An engineer out exploring walks into a tunnel, with a words-only countdown. Call her back asks first; she comes home empty-handed. Choosing a post while they are away still calls the party back first. Keepsakes the crew has brought home sit on the open card at reading size ("Brought home"), not only in the tiny relic-detail line. On a full crew and a short phone that row stays one line, and a tap tells the stories. Five engineers fit on the 424×924 board with no scroll. No new art.
- **Uses (each engineer does one thing at a time):**
  1. **Lead an expedition**: one engineer per expedition; the deep dark needs a Journeyman or better.
  2. **Tend a machine type**: stationed at carts, drills, borers or the Great Machine, that tier runs a little faster (Apprentice +10%, Journeyman +20%, Master +30%; live and away). On the borer those tenths are seven quarters: an apprentice is +17.5%, a journeyman +35%, a master +52.5% (#210). Two at the same tier do not stack; the higher rank sets the pace. Away on an expedition, or waiting at camp, the bonus stops. Tending the Great Machine also replaces most of its crew: **5 workers instead of 10** (any rank; the speed bonus is separate; #144 had 25). Untended, it still needs 10. Built in `effectiveRates` (#144).
  3. **Fix trouble**: an engineer tending a tier fixes its hazards alone after a short while; a Master fixes them at once.
- **The tradeoff:** expeditions **no longer take workers**. They take an engineer away from tending a machine, so you choose between a steady machine bonus and finds from the tunnels. Workers stay purely the staffing resource above.
- **Pacing (#144, #163).** The sim dad pays the real promotion for Nils (2,000,000 stones and one worker) the second the first borer arrives. Ada tends the borers until he owns a Great Machine, then she tends that. Its first cost is **50M** (was 80M). At 80M every saving dad still reaches the last session a few million short (about 70M, 73M and 76M) and the away pay both crosses the price and empties the mountain, so he never gets to buy. 50M is the highest price where, before he paid for Nils, the plain, upgrade, and boost dads all bought one on day 4.5 and reached the bottom on day 5.0 (Lantern 1.5, Hammer 3.5), with about a day and a half from the first borer and nothing else bought, and a second run bought it on day 3.5 and finished on day 4.0. Paying 2,000,000 (#163) moves the plain dad's machine to day 5.0 and his bottom to day 5.5 (about two days from the first borer). Upgrade and boost dads still buy it on day 4.5 and finish on day 5.0. A second run bought it on day 4.0 and finished on day 4.5 under the rounded scores. Exact valuation (#171) buys it on day 3.5 and finishes on day 4. The first mountain takes at least 5 days. Staff 3 through 15 all landed on the unpaid days; **5** is the crew she replaces it down to. Above about 21 workers the machine stops being his best buy, he never saves for it, and he finishes with none.

#### 4. Expeditions ("Side tunnels")

- **Unlock:** with the first engineer (first borer). The Engineers sheet offers three tunnels, in words ("a quick look down a side seam", "about an hour in the old shaft", "a long night in the deep dark"). The deep dark waits for a Journeyman. No main-screen layout cost. Built (#147).
- **Three tunnels, one expedition per engineer:**

  | Tunnel        | Away for | Leader       | Finds                                   |
  | ------------- | -------- | ------------ | --------------------------------------- |
  | A side seam   | 10 min   | any engineer | one small find                          |
  | The old shaft | 1 h      | any engineer | one find, better odds of a lost tool    |
  | The deep dark | 4 h      | Journeyman+  | a rare find; may bring home an engineer |

- **Away and back:** an expedition stores an absolute return time, so it **completes while the app is closed**. The tending bonus is missing until it returns (away accrual splits at the return time). The welcome card says "Ada came back from the old shaft with …", naming the find in words (no numbers), and lists every engineer who came home. The same card appears in the session if they return while you play, including while the engineers sheet is open and when the phone was locked: it sits above the other sheets, and a return saved while the app was hidden is still announced on the next open. One tap dismisses it. A running trip is a small chip in the mountain's corner ("Ada will be gone about an hour."), with no layout cost. Recall anytime, after a soft confirm: back empty-handed, no penalty. Choosing a post while they are away recalls them first. What the expedition finds is fixed when it leaves (seed = `sentAt`), so reloading can't reroll it. Built (#147).
- **Finds (never stones):**
  - _Relic glimmers_: an evocative line about the next relic ("Down there, something beat like a heart." for the Heart). No depths, no numbers.
  - _Lost tools_: one-time lasting upgrades only found below. Each is found once. The Upgrades drawer lists it under Brought home as "Found" with one warm line, and does not show the ones still below. Built (#148):
    - _Grandfather's pick_: taps are five fourths as strong, rounded up, in `effectiveRates`, before Sharper picks doubles them.
    - _Old miner's lamp_: a golden vein glints twice as long (`veins`).
    - _Worn map_: every expedition sent after it is found takes three quarters of the tunnel's time. A party already out keeps its clock.
    - _Steel-toe boots_: trouble waits twice as long. Hazards reads `wearsSteelToes`.
  - _Keepsakes_: a small collection on the relic shelf's detail sheet (a child's drawing, a pocket watch, a carved whistle …), just for the heart, Needle-in-a-Haystack style. Found ones only, one story each. The gold nugget stands in for art until PixelLab is asked. Built (#148).
- **Pacing:** the sim dad keeps Ada tending and sends Nils on the old shaft each session and the deep dark each night. He pays the same promotion a player would (2,000,000 stones and one worker, #163). Days then (M7, #163): Lantern 1.5, Hammer 3.5, plain dad bottom 5.5, upgrade and boost dads bottom 5.0, second run 4. Today's days are in `src/pacing.sim.test.ts` (#357).
- **Copy:** discoveries stay without numbers and without "?" placeholders: "Ada came back from the old shaft with Grandfather's pick.", "Ada will be gone about an hour." Tending gains and the promotion price are decisions, so they show numbers (#166).
- **Built (#146), domain and save.** Sending stores the find (seeded from `sentAt`) and the post they left, then moves them into the tunnel. Coming home restores that post, adds a trip, and keeps the find: a glimmer line for the next relic, a lost tool, a keepsake, or sometimes an engineer from the deep dark (never a sixth). Away pay splits at each return, so the machine they left speeds up again from that moment. A `sentAt` still in the future shifts to now; the wait and the find stay. Recall comes back empty-handed. The side-tunnels sheet and the welcome-card line are later issues. Lost-tool effects and the pacing sends are #148; the day windows are unchanged.

#### 5. Hazards ("Trouble at the machines")

- **Only while you play.** Never while away, never saved; closing the game clears any trouble. Leaving the game is rest, not risk.
- From the first borer, roughly every 3–6 minutes of live play, one machine tier gets trouble: a **cave-in** (carts), a **flood** (drills), a **jam** (borers, Great Machine). The card shows it, and that tier slows by a quarter at first, easing toward half over two minutes.
- **Fix it with your hands:** five taps on the card or a short hold, then a small thank-you burst and "Fixed! The crew cheers." An engineer tending that tier fixes it for you (see above). At most one trouble at a time. Steel-toe boots double the gap between troubles (`wearsSteelToes`, #148).
- Applied in `effectiveRates` through a session-only `trouble` argument, so the crew line and cards agree. The sim dad fixes within 3 s; a never-fixing dad must land within a day of the target.

#### 6. The field log (telemetry for Flemming and Grok Bot)

- **"Copy field log"** in the menu copies a JSON snapshot (works for guests): app version, time, stones mined/left, pocket, crew counts, engineers with rank and post, crew speed, tap yield, idle machines, relics, upgrades, boosts with end times, running expeditions with return times, legacy, and the last 50 events.
- **Events** (pure ring, last 200, kept by the progress store, each timestamped): purchases (what and new count), promotions, an engineer stationed or called back to camp, relic found, vein tapped, expedition sent, returned (with the find id), or recalled, trouble started and fixed by hand or by an engineer, the one-time staffing top-up, away report, Start over / pass the mine, save errors.
- **Cloud copy for signed-in players:** one document `fieldLogs/{uid}`, overwritten at most every 5 minutes and on hide (≲ 300 writes per playing day, < 50 KB). Rules: owner-only read/write, shape and size checked, no delete. No personal data beyond the uid.
- **Reading it:** `npm run field-log` (Admin SDK script in `tools/`, outside `src`). `npm run field-log -- <uid>` or `--uid <uid>` reads one player; with no uid it lists every `fieldLogs` document. The default print is a short summary with local times; `--json` prints the stored documents. Sign in once with `gcloud auth application-default login`, or set `GOOGLE_APPLICATION_CREDENTIALS`. No key files in the repo. The Firestore emulator needs no credentials. Only household players are read; the doc holds only the latest ring. Start over and passing the mine clear the ring and overwrite the doc at once.

The copy menu and the session ring shipped in #141, the cloud document in #142, and the reader in #143. The snapshot is the mountain as it exists today (stones, crew, speed, taps, idle machines, relics, upgrades, running boosts, legacy, engineers, running expeditions). The ring is not a mountain save field, so old saves load unchanged. Trouble is session-only, so it is events (`trouble.start`, `trouble.fix`) and not a snapshot field. Built (#150).

#### Built (#150)

M7 is built. Pacing then, with the sim paying 2,000,000 stones and one worker for Nils: Lantern day 1.5, Hammer day 3.5, plain dad bottom day 5.5, upgrade and boost dads bottom day 5.0, second run day 4. The first mountain takes at least 5 days. #177 later moves those three first-run dads to day 5.5 on a 240M mountain with a 67M Great Machine. The field log snapshot names each engineer (name, rank, post) and each party still out (who, which tunnel, when they return). The ring records a promotion, a station or a call back to camp, an expedition sent, returned with its find, or recalled, trouble started and fixed by hand or by an engineer, and the staffing top-up.

#### Issues

One PR each, in order; the list with acceptance criteria is in the M7 PR description (#138).

### Milestone 8: Strategy lab

**M8 is built.** The shared clock is `src/lab/world.ts` (#171). Targets and decision measures are in (#173). Player types are one file each under `src/lab/policies/`, loaded by the same registry (#172). The tournament and `npm run lab` are in (#174). The retunes are in (#177, #178, #179). No screen, no save field, no Firestore change. The lab runs offline, next to the pacing sim, so a retune can be judged before it ships. Players never see payback, shares, or these targets. The full gate runs the lab with `LAB_STRICT=1` when economy code changed, so a missed guardrail fails the gate.

#### Pacing

Decision quality comes first. A moment should offer more than one live buy, a dead stretch stays under half a day, and one move should not be the right buy for most of a casual run or the optimizer's. Finish days come second, and since 7 Nov 2026 they are reported, not limits: the game is endless, and each pass to the kid makes the next run harder (the generations lab keeps every kid run longer than the last, strict). `casual-finish` and `thin-habit-finish` stay in the report as report-only rows. Before that, every casual dad had to finish in 5–7 days, and never under 5 (`casual-2x10`, the evening dad, and the checker, the same bound), and five minutes a day within about 14 days.

`tap-only` stays in the report and has no finish target: one stone a tap does not empty the mountain. An extreme may finish later. It may not finish much sooner than the casual dad (at most 15%). The optimizer may finish sooner than a casual dad, and not by more than a quarter. These two comparisons are still strict.

Each tap is one stone until an upgrade says otherwise. A single absence longer than half a day, before the Shield, pays 16 hours instead of 8, so one 20-minute evening stays within a quarter of the optimizer. Two shorter gaps in a day stay on the 8-hour cap. `liveMedian` after the first hour grades casual player types and the optimizer, the same population as single share and dominant share. The payback dead stretch is strict for casual player types. The optimizer's save for the borer and the Great Machine is still about half a day and is reported, not a failing guardrail: a real purchase in that window also moves the pinned pacing days or the casual wait. Workers-only, machines-only, never-workers, and tap-only may finish late: no finish target names them, and extreme win only limits finishing sooner.

#177 closed the casual payback dead stretch (it had been about a day from day 4). The optimizer still saves about half a day for the borer and the Great Machine; that wait is listed in the report and does not fail the build. The value-per-stone stretch is still reported beside it. The retune moved the economy. It did not move these targets to go green.

#### Definitions

- **Payback period (Cookie Monster).** How long until a move pays for itself. `valueOf` in `src/economy/actions.ts` returns `paybackSec` with the Cookie Monster formula `max(cost − pocket, 0) / income + cost / Δincome`: time to afford what is still missing, plus time for the extra income to earn the cost back. Income and the gain both come from `effectiveRates` before and after the move. A machine's staffing cost is part of that cost. The horizon is an argument, not a constant in the economy module. #178 values an expedition find as its expected stones over that horizon (`src/economy/finds.ts`): tools and a free engineer count, keepsakes and glimmers stay at 0 so a discovery is not a price. Sending costs the tending skipped on the trip. Recalling costs the find walked away from, and at least six hours of the post they would tend, so a finished tunnel is not a free button. The optimizer promotes and explores when that payback wins, not the moment the pocket can cover it.
- **Live option.** A move whose payback is at most `LIVE_RATIO` times the best payback on the table. `LIVE_RATIO = 1.5`. Two or more live options is a real decision. One is a moment with nothing to choose.
- **Dead stretch.** A sample is dead when the only live options on the spends this dad weighs need at least one session of saving (`minWaitSec` in `src/lab/targets.ts`): none of them can be paid for, and the best one's wait is at least that long. Free posts and refused buys are not on that table. A zero price pays back at once, and a cheap upgrade the plain dad never buys was keeping the stretch at zero. A few minutes of saving at the end of a sitting does not turn the overnight gap into a dead stretch. The lab scores the longest such run. The length is wall-clock hours from the first dead sample to the next sample that is not dead, or to the last sample if the run ends waiting. On the casual run after #177 the payback stretch is under half a day. The value-per-stone stretch is still about 2 days and is reported beside it. A sample after any buy (crew, a kid, an engineer, an upgrade level) is never dead (`boughtSince`, #335): samples sit on a drifting one-minute grid, so the first sample of a sitting is often already spent down, and counting it made the five-minute dad look stuck for three days (71.98 h) when he bought something at every sitting.
- **singleShare.** The share of samples with at most one live option on this dad's own spend table, the spends he weighs and not every legal move (payback within `LIVE_RATIO` of the best). A run where every sample is in that set is `1`. The same share by value-per-stone, on the plain dad's crew table, is about 42% on today's casual run, which the lab must reproduce within rounding. Payback is reported beside it.
- **dominantShare.** The share of samples where the most common best spend on this dad's own table is the best one, leaving out the first hour. A sample with nothing on his table is skipped.
- **smallRevealSittings.** The most sittings from a small thing showing (an upgrade, a boost, a new system, a material, a recipe) to its first use: one run's worst, then the mean over seeds (`small-reveal-wait`). Reveal watches count a material or recipe as used while the bench runs any craft, since he cannot start a second one.
- **Regret.** `finishDay(policy) / finishDay(optimizer)`, a tournament number. The optimizer is 1. A later finish is higher.

#### Targets

This page names them. `src/lab/targets.ts` is the source of truth, and the only place a lab number lives. No other magic numbers in `src/lab/`.

Approved:

- `LIVE_RATIO = 1.5`. A live option pays back within 1.5× of the best.
- Longest dead stretch at most 0.5 day, for casual player types. The optimizer's wait is reported and does not fail the build.
- `five-min-a-day` finishes within about 14 days. Report only since 7 Nov 2026 (the run length is not a limit). `tap-only` has no finish target.
- `liveMedian` at least 2 after the first hour, for casual player types and the optimizer.

The same file holds the horizon `H` (default 6 hours, passed into `valueOf`), the sample interval (one minute of play, plus the start of each session), the dead-stretch definition, and one typed entry per guardrail: `{ id, measure, scope, op, value, why }`. Each entry has a one-line `why`. `measure` is a registered measure id. `scope` says which runs the bound covers. `op` and `value` are the comparison.

Planned entries, beside the four above. M8-4 writes them into the file. A retune does not change a value to pass. That needs Flemming's OK.

- `singleShare` at most 25%, for casual player types and the optimizer.
- `dominantShare` at most 40%, for casual player types and the optimizer.
- Tending at least 8% of output for an Apprentice from the borer onward, for casual player types and the optimizer. Extremes that hoard or skip the crew are reported and do not fail the build: their mean sits on the floor because of the crew they refuse, not because the post is weak.
- Casual `finishDay` from 5.0 to 7.0 days.
- An extreme's win over casual at most 15%.
- Optimizer versus casual at most 25%.

#### Check-in pacing (balance review, Nov 2026)

The minute samples say what the table looked like. A sitting log (`src/lab/sittings.ts`) says what a check-in felt like. A clock jump is time away; the observation after it is the open, with away pay in and nothing bought yet. Each sitting records its buys (rises in the owned count, as `boughtSince` counts them) and its opening view: the best buy on this dad's Buys sheet by stones a second per stone (crew, machines and the upgrades he weighs; bench timers and boosts stay off it), affordable, waiting, or nothing on the table. A sitting that is only an open, because the run ended after the last gap, is dropped. Each event hangs on the sitting's own first sample, so scopes cut sittings where they start.

Four measures read it: `zeroBuySittings`, `buysPerSitting` (median), `bestOpenShare` and `bestWaitSittings` (the longest run of sittings in a row that open with the best buy out of reach). Their guardrails grade casual player types after day one:

| Guardrail            | Bound |
| -------------------- | ----- |
| `zero-buy-sittings`  | ≤ 0.2 |
| `buys-per-sitting`   | ≥ 3   |
| `best-open-share`    | ≥ 0.6 |
| `best-wait-sittings` | ≤ 2   |

They are strict since #357. At 20 seeds every casual type passes them (zero-buy 0, buys per sitting 8.8 to 63, best-open 0.995 to 1.0, best-wait 0 to 0.05). `single-share` is 0.26 (was 0.25, Flemming): the checker's opening Topsoil and the deep Great Machine stretch are fixed one-buy moments. A report-only row, `every-tier-bought` (`fewestMachineBuys`, at least 5 for casual types), checks that no machine tier sits unbought; it reads 5 to 10.85 (`docs/economy-overhaul.md`). Each sitting's event hangs on its own first sample (the first at or after its open), so a scope that keeps a window of samples keeps exactly the sittings that started in it. History (before #356, at 3 seeds on main): the short check-ins missed all four: the checker reads 0.50 / 0.5 / 0.30 / 5.67 and the check-in dad 0.47 / 0.67 / 0.44 / 2.67. The casual dad (0.12 / 2 / 0.88 / 1) missed only the buys row. The evening dad (0 / 4 / 0.80 / 1) passed: a long sitting after a long gap still shops. `checkin-4x2` is the design's two-minute check-in: four a day, the gap sliding by a tenth, otherwise the plain dad. It is a casual type, so every strict casual guardrail grades it too, and it passed them all then (finish day 5.49). Today its run 1 ends on day 4.1 and it passes at 20 seeds. The full write-up is `docs/balance-review.md`.

#### How to extend

Three moves. Each is one new file, or one entry in `targets.ts`. No other edit.

`src/lab/registry.ts` is the Node-side loader. It discovers every non-test file in a folder, checks the shape, and fails loudly on a duplicate id or on a target that names an unknown measure. The pure engine (`src/lab/world.ts`, `src/lab/tournament.ts`, and the metrics) receives those registries as arguments and never reads the filesystem. knip lists `src/lab/policies/` and `src/lab/measures/` as entries, so a new file needs no knip edit.

1. **Add a player type.** Add `src/lab/policies/<id>.ts`. It default-exports `definePolicy({ id, label, kind: "casual" | "extreme" | "optimizer", params, schedule, decide })` from `src/lab/policy.ts`. The loader picks the file up. `runTournament({ policies, measures, targets, seeds, days })` receives it in `policies`. A duplicate `id` fails the load.
2. **Add a measure.** Add `src/lab/measures/<id>.ts`. It default-exports `defineMeasure({ id, label, unit, why, sample?, aggregate })` from `src/lab/measure.ts`. `sample`, when present, reads one `DecisionSample`: live count, best id, wait-to-afford, crew per second, pocket, and output share by source. `aggregate` turns the samples into the number the report shows. The loader picks the file up. The tournament gains a column. A target whose `measure` is not a registered id fails the load.
3. **Add or change a target.** Add or edit one entry in `src/lab/targets.ts`: `{ id, measure, scope, op, value, why }`. The guardrail test (`src/lab/guardrails.test.ts`) makes one check per entry. It has no threshold constant of its own. The report's pass/fail cells read the same list.

The first policy files are casual `casual-2x10` (today's plain dad: same finish day, same buy list), `evening-1x20`, and `checker-6x3` (`checkin-4x2` joined them with the balance review); extremes `never-workers`, `tap-only`, `machines-only`, `workers-only`, `hoarder`, `five-min-a-day`, `marathon`, `no-engineers`, `all-in-engineers`, `never-fix-trouble`, and `boost-junkie`; and one optimizer (greedy lowest payback, with a one-step "save for X" lookahead over the next session). The lookahead horizon comes from `targets.ts`. The optimizer finishes no later than casual. Built (#172).

The first measure files are `liveMedian`, `liveP10`, `singleShare`, `longestDeadStretch`, `longestValueStretch`, `dominantShare`, `typeEverBest`, `featureShare`, and `finishDay`. `typeEverBest` is the "never best" list (a move kind that was never the right buy). `featureShare` is one named source's output share. Tending uses it. A policy that never owns a borer shows n/a for that share, and the guardrail does not fail it.

`src/lab/world.ts` is the clock they share: `step(world, ms, mode: live | away)` on one seeded clock, wrapping accrue, away pay, hazards, and expedition settle. Built (#171). The pacing sim steps this clock and chooses crew and upgrades with `listActions` / `valueOf`. Policies call `decide` on that world. The world does not read the policy or measure folders.

`npm run lab` (`tools/strategy-lab.ts`) loads the registries and writes `reports/strategy-lab.md` and `.json` (gitignored). Built (#174).

#### How to read the report

One row per player type, one column per registered measure. A cell is a bare number when no guardrail covers that row. When one does, the cell is that guardrail's figure plus pass or fail, coloured green or red. Shares are fractions: 0.25 is 25%.

The header names two finish days. **Optimizer finish day** is `optimizer`. **Casual finish day** is `casual-2x10`, the plain dad. Regret divides a dad's finish day by the optimizer's. Extreme win reads how much sooner an extreme finished than that casual dad. Both numbers are the mean across the seeds in the run (seeds 1 through that count). A local `npm run lab` uses `LOCAL_SEEDS`. CI passes `--ci` and uses `CI_SEEDS`. `--seeds` wins over both, and `--days` overrides `DEFAULT_MAX_DAYS`. `--policy` limits the rows; the columns stay every measure.

Under the table: a per-hour timeline for each casual player type and the optimizer, on the first seed; a section per list measure (never the best buy is the dead-feature list); and dead stretches longer than `REPORT_DEAD_HOURS`, once for payback and once for value per stone (when they start, what the dad is saving for, and how many times slower the next payback is). The suggestions name the miss. They do not change a number. The full gate runs it with `LAB_STRICT=1` when economy code changed, so a miss fails the gate. Without that variable a miss is a warning.

Adding a policy file adds a row. Adding a measure file adds a column. Adding a target adds a pass or fail on the cells it covers. No other edit.

#### Sensitivity sweep

`npm run lab:sweep` (`tools/sweep/cli.ts`) writes `reports/sweep.md` (gitignored). It is not part of `npm run check`. Morris elementary effects run first, over the knobs in `tools/sweep/knobs.ts`. A Saltelli Sobol design then runs on the top knobs: one scrambled Sobol sequence, fixed seed, S1 and ST tables. The default measures are `longestDeadStretch`, `singleShare`, `dominantShare`, and `finishDay` on `casual-2x10`. Any registered numeric measure can be named with `--measure`. Flags: `--seed`, `--morris`, `--sobol`, `--top`, `--days`, `--policy`, `--out`.

A knob is one entry: a factor id the price, growth, output, or tending formula already reads, plus a low and a high multiplier. 1 is today's economy. The sweep multiplies that number for one run and puts it back. Play, the save, and the tournament are unchanged. The tool lives under `tools/` so its sample sizes and direction numbers stay out of `src/lab/targets.ts`.

### Milestone 9: Layers and the Workshop

**M9 is built.** Approved by Flemming (2026-10-14). The layers rules module is in (`src/layers.ts`, #194): four bands from stones mined, and a hardness multiplier per layer and tier. Materials accrue, and the save is v6 (#195). The workshop rules are in (`src/workshop.ts`, #196): one bench, crafts that finish from the clock including time away, a full refund on lasting gear, and only the unused share of a live timer. The strategy lab can craft (#197). M9-7 (#198) tuned the rock and the recipes and made the two approved guardrails strict. The Workshop sheet is in (`src/workshop-panel.ts`, #199): real numbers, a short craft that shakes, a bench countdown that keeps running while the sheet is shut, and one dark sketch for what is still unfound. The layer card, the material line under the pocket, and the craft-done notice are in (#200). A band already reached when a save loads is not announced again. Recipes are found on an expedition and when a layer opens (#201): the line folds into the return and the layer card, and an unknown recipe is written back so an older app does not drop it. A recipe this build cannot name still holds the bench until its clock ends (#202): the sheet says "Something is on the bench" and a new craft waits.

#### The idea

The mountain stops being one grey pile. As you dig, you pass through **four layers**, each its own kind of rock. Each layer gives a little of its own **material**, alongside the stones. At the surface there is a **Workshop** with one workbench. You spend stones plus materials to craft something for the crew: rails for the carts, bits for the drills, props that keep trouble away, a lamp that draws golden veins. A craft takes real time on the bench, so the question each session is what goes on the bench next, and whether it is worth more than another drill.

The workshop is the dad's shed. Crafting is making something good for your crew with your own hands. Copy lifts the dad up ("Your crew will feel this one.").

#### Where the methods come from

These are published methods, not new ones. Each choice below rests on one of them.

- A. Pecorella, _The Math of Idle Games_ Part I, Kongregate (2016), <https://www.kongregate.com/pages/the-math-of-idle-games-part-i>. Several generators with different cost and rate curves make priorities shift over the run, and income-to-cost ratio is how to model the optimal player. Layers change those ratios. That is the shifting-priority lever. The lab's `valueOf` already uses this ratio.
- A. Pecorella, _The Math of Idle Games_ Part III, Kongregate (2017), <https://www.kongregate.com/pages/the-math-of-idle-games-part-iii>. Pacing comes from tuning resets and multipliers against the cost curve. Layers stay inside one run. M6's pass-the-mine stays the only prestige, so we take the pacing discipline without adding a reset.
- Cookie Monster payback, already defined under Milestone 8. Every craft is valued with the same payback formula as every other buy, so live options and dead stretches are measured the same way.
- D. Cook, _Value chains_, Lostgarden (2021), <https://lostgarden.com/2021/12/12/value-chains/>. The structure is source, then transform, then sink, then anchor. Materials are a trickle source, so each needs a repeatable sink or they pile up. Permanent items are fixed sinks. "Match the power of your sinks to your sources." That gives the recipe mix.
- D. Cook, _Designing game content architectures_, Lostgarden (2021), <https://lostgarden.com/2021/01/04/designing-game-content-architectures/>. Build the value anchor first. Crafted items feed crew output, which the lab already measures, so the system can be tested before there is lots of content.
- Butterscotch Shenanigans, _How we unbroke our crafting system_ (Crashlands), Game Developer, <https://www.gamedeveloper.com/design/how-we-unbroke-our-crafting-system>. Do not dump every recipe at once. The bench starts with a few recipes, and the rest are found, here on expeditions and when you reach a new layer. Discovery stays in the loop and the sheet stays small.
- _Crafting the crafting in Ember_, Game Developer, <https://www.gamedeveloper.com/design/crafting-the-crafting-in-ember>. An item's power comes from how rare its ingredients are, and the rarest materials only exist in deep areas. A deeper layer means a rarer material and a stronger item.
- Mason et al., _Crafting in Games_, Digital Humanities Quarterly, <https://dhq-static.digitalhumanities.org/pdf/000339.pdf>. From that vocabulary: well-defined recipes, low fidelity of action (one tap), a fixed outcome (no randomness in a purchase), and a result the other systems fully recognise (it shows up in rates).
- Layered-unlock practice: reveal the next layer when the current one flattens, and give each layer a new verb, not a bigger number. One write-up is <https://teemo.dev/game-design/concepts/prestige-rebirth/systems/layered-meta-prestige/>. Each layer adds one new thing, a material plus a recipe or two, revealed only as you get close.

#### Layers

The layer is derived from **stones mined**, the same way relics are, so the save gets no layer field. `layerOf` in `src/layers.ts` (#194) reads that total. A band starts on its first stone, so 10M is the Granite, beside the Shield. Bands are aligned to relic depths so each relic is also a landmark.

| #   | Layer (player name) | Stones mined              | Material   | Rock (hidden, lab-tuned)                                        |
| --- | ------------------- | ------------------------- | ---------- | --------------------------------------------------------------- |
| 1   | The Topsoil         | 0 to 10M (to the Shield)  | Clay       | soft: every tier ×1                                             |
| 2   | The Granite         | 10M to 45M (to the Heart) | Iron       | suits borers ×1.1, tough on drills ×0.8, the rest ×1            |
| 3   | The Crystal Caves   | 45M to 120M               | Crystal    | suits drills ×1.1, tough on borers ×0.8, the rest ×1            |
| 4   | The Deep Heart      | 120M to 240M              | Heartstone | suits the Great Machine ×1.1, tough on borers ×0.8, the rest ×1 |

- **Depth per band (#356, retuned #357).** Depth stays in run-1 stones (240M in all), but a stone dug in band b takes 1/(k·s_b) of a stone of depth, with s the band's `BAND_SCALE` and k the kid-run stretch (`src/scale.ts`; `BAND_STARTS` and `BAND_SCALE` are in [Numbers now](#numbers-now)). The deeper rock shows far more stones to dig, and the lock lines and stones left show them (the Great Machine's line reads 574.3M stones from the Granite on a first run). Upgrades and promotions are priced with `oneOffStretch` = k × s of the band you stand in; machines and workers scale with k only.
- **Rock hardness** is a per-layer, per-tier speed multiplier in `effectiveRates` (`FAVOURED_SPEED` ×1.1 and `SLOWED_SPEED` ×0.8 in `src/layers.ts`, D3 #246; the #198 tune was ×0.85). The sweep's `layer.<n>.<tier>.hardness` factor multiplies that tuned rock, and it is 1 in play. Workers and kids stay at 1 in every band, so a bare-hand tap stays one stone. It turns "which machine next" into a fresh question in each layer (Pecorella: shifting priorities). The player sees the card's real `+N/s`, which already includes the hardness. A purchase shows real numbers. The hardness itself is never shown as a percentage. The layer card and the band tag on the bays only say, for example, "The Granite suits borers. Tough on drills." and "The Granite · Suits borers".
- **Materials** accrue deterministically inside `accrue`, `accrueAway`, and a hand tap: one unit per `MATERIAL_EVERY` stones mined in that layer. Tuned in #198: one per 1,000,000 stones in the Topsoil (10 clay), one per 1,000,000 in the Granite (35 iron), one per 5,000,000 in the Crystal Caves (15 crystal), and one per 10,000,000 in the Deep Heart (12 heartstone). Clay, crystal, and heartstone stay inside what the fixed recipes can absorb. Iron is the common one, and axle grease spends it. They are integers in the save. There is no randomness, so live and away earnings cannot drift. A remainder waits in the stone total, so small digs add up to the same units as one long dig.
- **Discovery stays vague.** Before you reach a layer you see only a hint on the progress bar ("Below the topsoil, the rock turns hard and grey."). No depth, no name of the material, no recipe list. Once you arrive, the material and its count are real numbers, because they are spent on purchases.

#### The Workshop

- **Unlock:** the first time you enter the Granite (10M, alongside the Shield). The Workshop key sits on the rail, locked until then (a dim cap and "With the clay" under it), and the menu the Ledger key opens shows a dark "Workshop · opens as the clay comes in".
- **One workbench.** Crafting takes time: 10 min / 1 h / 4 h, the same rhythm as expeditions, so a dad sets a long craft at night. You cannot stack crafts. Picking what goes on the bench is the decision. One bench for the whole run. That is decided.
- **Cost:** stones plus materials, always shown as real numbers ("400k stones · 2 iron · 10 min").
- **Effect:** always shown as a real number on the card ("Carts 10/s to 12/s"). A blasting charge or axle grease names the crew the way the header does, in whole stones (`formatCrewSpeed`): "Crew 586/s to 1,172/s for 20 min." (#332)

The recipe list is small on purpose: 11 recipes, 3 known before the workshop opens, Reinforce and Axle grease once the Granite is reached, and the rest found on a layer or an expedition. Costs, times, and effects below are the #198 tune. On the card they read as the resulting rate ("Carts 10/s to 12.5/s" for one level of rails in soft rock).

| Recipe               | Needs                          | Time   | Effect (the card shows the resulting rate)                                         | Sink (Lostgarden)       | How you get the recipe      |
| -------------------- | ------------------------------ | ------ | ---------------------------------------------------------------------------------- | ----------------------- | --------------------------- |
| Iron rails           | 500k stones + 4 iron           | 10 min | carts ×1.25 per level, max 2                                                       | fixed                   | known at unlock             |
| Sturdy props         | 250k stones + 10 clay + 4 iron | 10 min | trouble comes 30% less often                                                       | fixed (1 level)         | known at unlock             |
| Blasting charge      | 100k stones + 4 clay           | 10 min | crew ×2 for 20 min from the bench; live only; strongest crew timer wins            | repeatable (clay)       | known at unlock             |
| Reinforce            | 5 iron                         | 10 min | ×1.05 per level on the next tier, max 5                                            | repeatable until 5      | entering the Granite        |
| Axle grease          | 1 iron                         | 10 min | crew ×2 for 20 min from the bench; live only; refreshes; strongest crew timer wins | repeatable (iron)       | entering the Granite        |
| Diamond bits         | 2M stones + 5 crystal          | 10 min | drills ×1.25 per level, max 3                                                      | fixed                   | reaching the Crystal Caves  |
| Crystal flare        | 200k stones + 4 crystal        | 10 min | veins 25% more often for 1 h from the bench; live only; refreshes                  | repeatable (crystal)    | reaching the Crystal Caves  |
| Miner's crystal lamp | 6 crystal + 4 iron             | 1 h    | golden veins 25% more often                                                        | fixed (1)               | expedition find (old shaft) |
| Engineer's kit       | 4 iron + 4 crystal             | 4 h    | expeditions 20% shorter                                                            | fixed (1)               | expedition find (deep dark) |
| Heartstone core      | 5M stones + 4 heartstone       | 1 h    | Great Machine ×1.1 per level, max 3                                                | fixed                   | reaching the Deep Heart     |
| Heartstone ember     | 500k stones + 2 heartstone     | 10 min | Great Machine ×1.25 for 20 min from the bench; live only; refreshes                | repeatable (heartstone) | reaching the Deep Heart     |

Rules that keep this healthy:

- **Every material has a repeatable sink**, so materials never pile up uselessly. Clay has Blasting charge. Crystal has Crystal flare. Heartstone has the Heartstone ember. Iron has axle grease: the whole crew mines ×2 for 20 minutes while you play, starting when the craft goes on the bench. Another grease refreshes that clock and does not stack, and time away never sees it. Axle grease, a blasting charge, and Overtime each double the live crew. When more than one is hot, the crew runs at the strongest of them, so three ×2 timers stay ×2. A stronger recipe still shows on the crew line. Reinforce still spends iron for one more level of a bonus on the next machine tier after the highest one you already run (carts point at drills, drills at borers, borers at the Great Machine), and it stops at 5. Once a Great Machine is running, those levels stay on it. A blasting charge, a crystal flare, and a heartstone ember start when the craft goes on the bench, so the sitting that starts them is the sitting that feels them. Crafting a flare or an ember again refreshes that clock and does not multiply it, and none of those timers change away pay. `recipe.<id>.strength` scales each effect, and the length of a timed one. `materialIdle` checks the sinks.
- **Recipes are found, not dumped** (Crashlands). The expedition find "a worn recipe" stays vague in the find text ("Ada came back from the old shaft with a sketch folded in a pocket."). The same kind of line joins the layer card and, when the break-in happened away, the welcome card. The recipe card it unlocks has real numbers. An unfound recipe stays one dark silhouette.
- **No randomness in what a craft gives.** A purchase is a promise.
- **Never punishing.** Closing the app does not stop the bench, and a finished craft waits safely. A craft can be cancelled before it finishes. Lasting gear comes back in full, because its effect has not started. A live timer has already started, so the refund is only the unused share of that window, and the effect stops.

#### What you decide

These stay live for the whole run.

1. **Bench or machine.** Stones spent on a craft are not spent on a drill. Both are valued by payback. Crafts should sit inside `LIVE_RATIO` of the best buy for a meaningful share of samples, and they should not dominate.
2. **Which craft.** One bench, and materials are shared. Iron goes into rails, props, and the kit, so you pick a lane.
3. **Which machine, in this layer.** Hardness shifts the best tier as you go deeper. The M8 problem that the same buy is always right (`dominantShare`) gets a structural fix, not a price tweak.
4. **Charge now, or grease, or Overtime.** Blasting charge, axle grease, and Overtime compete for the same crew speed. The strongest one is on.
5. **A long craft at night, or a long expedition.** Both are good overnight moves. Each has its own engineer or its own bench, so the evening gets a small plan.

#### The lab

Every addition is a new file or a new union arm. The two approved targets live in `src/lab/targets.ts`, the only place a lab number lives. M9-6 is the only issue allowed to add the rows. They are ordinary guardrail entries, the same `{ id, measure, scope, op, value, why }` shape, so a later target is still one entry. Existing thresholds are not changed. M9-6 marked both new rows report-only. M9-7 dropped that mark. A miss fails the strict job.

Approved:

- Crafted items are at least 8% of output from the Granite on, for the casual player types and the optimizer. That is the same bar as tending.
- `materialIdle` is at most 0.5 day, for the casual player types.

Every existing guardrail still holds. `skip-crafting`, `crafting-heavy`, and `charge-junkie` must not win (`extremeWin`: at most 15% sooner than casual).

- **Action catalogue** (`src/economy/actions.ts`). New arms `{ kind: "craft"; recipe: RecipeId }` and `{ kind: "cancelCraft" }`. The `never`-check makes typecheck fail until `listActions`, `applyAction`, and `valueOf` handle them (the M8-1 guarantee). `valueOf` for a craft is the Δincome from `effectiveRates` before and after, plus the bench time added to the wait-to-afford part of payback. Blasting charge is valued like a boost over the horizon. Props and the lamp are valued as expected stones over the horizon, the way #178 values expedition finds.
- **World** (`src/lab/world.ts`). The bench settles inside `settle`. Materials accrue inside `accrue` and `accrueAway`. The same seeded clock, so it stays deterministic.
- **Player types**, one file each in `src/lab/policies/`:
  - `crafting-heavy.ts` (extreme): the plain dad, except a free bench is filled before the next hire.
  - `skip-crafting.ts` (extreme): never opens the workshop.
  - `charge-junkie.ts` (extreme): spends every clay on Blasting charges.
  - The three casual types and the optimizer get a craft step in `decide`. The casual dad puts the best-payback craft on the bench when he would otherwise idle. The optimizer simply sees the new actions.
- **Measures**, one file each in `src/lab/measures/`:
  - `craftShare.ts`: the share of output that comes from crafted items, the same pattern as tending's `featureShare`.
  - `materialIdle.ts`: the longest stretch where a material outgrows what the open recipes can still take (cost times levels left). A repeatable timer is unlimited only when that dad uses it. It catches a pile with nowhere to go.
  - `benchIdle.ts`: the share of time the bench is empty once the workshop is unlocked, for casual types. Report only. It is not a target.
- **Pacing.** History (240M mountain, before #357): every casual dad finished in 5 to 7 days, and never under 5. Today `casual-finish` is report-only, and run 1 ends on day 3.7 to 5.0. That bound is one row in `src/lab/targets.ts` covering every casual player type. Hardness below 1 takes speed away, and axle grease gives it back while a dad is at the mountain, so the plain casual dad lands on day 5.5 and the checker stays past day 5. A dad who skips crafting finishes later. That is allowed for an extreme. The pacing sim does not craft, so its plain dad lands on day 6. Hardness and recipe strength are factors. In play the hardness factor is 1 and the tuned rock above is what the crew feels. Recipe strength is 1 on the numbers in the table.
- **Sweep knobs** (`tools/sweep/knobs.ts`): `layer.<n>.<tier>.hardness`, `recipe.<id>.strength`, `recipe.<id>.cost`, `material.every`. Strength and cost default to 1 (#196).

#### Numbers

- **Real numbers:** recipe costs (stones and material counts), craft time, item effects ("Carts 10/s to 12/s"), material counts in your pocket, and the Workshop unlock label.
- **Vague:** what the next layer holds, its name before you arrive, rock hardness, a found recipe before it is found, and the expedition text that brings a recipe. An unfound or locked recipe is a dark silhouette, with no numbers and no "?".

#### Mock before building

Mockups come first (M9-2), using the existing `mockups/` puppeteer flow, at 390×844 and 360×640, with no scroll. Flemming approves them before any UI code. The built screens also hold 360×560 with no scroll (M9-8). Art is PixelLab, and we ask first. No sound until the player unmutes.

1. **Workshop sheet.** Title "Workshop", then a bench row ("On the bench: Iron rails · 38 min left" with a soft progress bar, or "The bench is free"), then up to 4 recipe cards in two columns. Each card has a name, an effect line, a cost line with small material icons, and a fat "Craft · 4.2M" button. Locked or unfound recipes are dark silhouettes with no numbers. One "Back to the mountain" button. Tap feedback: the button presses in, the materials float off the pocket line toward the bench, and a short hammer-tap animation plays.
2. **Layer transition.** A one-time card when you cross a band: the new rock as art, the name ("You broke into the Granite!"), one evocative line, one line of advice ("The Granite suits borers. Tough on drills."), and one button, "Dig on". It is never shown twice. An away return folds it into the welcome-back card.
3. **Material line.** A single row under the pocket showing a material once a unit is in the pocket, or the digging has already earned one (spent down to zero still shows): "Clay 42 · Iron 7", with short-form numbers. A first tap with no unit yet shows nothing. It must not push the cards off screen (today it lives in the menu's ledger, behind the Ledger key).
4. **Craft done.** It shows on the welcome-back card or as a small toast: "Your Iron rails are fitted. Carts now 12/s." One tap.

#### Save

Save **v7**. In memory these sit on the mountain. In the document they are one `workshop` map beside it, because a full crew is already at the Firestore expression budget. The document also carries `rev` (an integer that only increases by one), `deviceId`, and `savedAt` (the server's clock). A v6 document has no rev; the rules treat that as 0 and the next write migrates it to rev 1. Nothing is rewritten ahead of that write. Duplicate names, and the shape of a third engineer onward, stay in the client parser so promoting that hand still writes:

- `materials: { clay, iron, crystal, heartstone }`, integers. Each is capped at that band's width in stones.
- `bench: { recipe, startedAt, endsAt } | null`. A recipe this build has not heard of still holds the bench until that clock ends. The sheet says "Something is on the bench" and counts it down. A new craft waits, and there is no refund, because this build does not know what was spent. After the clock, a known craft may take the bench. Until then the unknown craft is written back.
- `crafted: Record<RecipeId, level>`.
- `recipes: RecipeId[]`, the ones found.
- `chargeUntil`, `flareUntil`, and `emberUntil`, optional epoch ms. A blasting charge, a crystal flare, and a heartstone ember are live until then. Missing means that one is cold. Away pay does not use them.

A v5 save migrates with a **back-grant**. Materials are computed from stones mined in each band (`MATERIAL_EVERY`), exactly what that save would have dug. The bench is empty. Nothing is crafted. Recipes are the starting three (Iron rails, Sturdy props, Blasting charge), plus Reinforce once the Granite is reached, plus the layer-entry recipes for layers already reached (Diamond bits and Crystal flare once the Crystal Caves are reached, Heartstone core and Heartstone ember once the Deep Heart is reached). The expedition recipes (Miner's crystal lamp, Engineer's kit) are not granted by the migration. The layer itself is derived, so nothing is stored for it. Saves from v1 through v5, local and cloud, still load, and the stones already mined stay.

`firestore.rules` accept v6, with shape and integer limits on the new fields. The rules tests live in the save issue (M9-4).

The field log records `craft.start`, `craft.done`, `layer.enter`, and `recipe.found`.

Passing the mine to your kid keeps the recipes, including one this build does not know yet. Crafted gear does not carry over. Materials and the bench reset too. A bench or a crafted level this build does not know is not shown, and the next write puts it back, so opening the save does not lose that craft.

#### Decisions

Flemming, 2026-10-14:

1. **Layers are rock bands** inside one mountain, not prestige layers.
2. **Deep saves get their materials back**, computed from stones mined in each band.
3. **One workbench.**
4. **Passing the mine to your kid:** recipes carry over; crafted gear does not. Materials and the bench reset too.
5. **Lab targets approved:** crafted items are at least 8% of output from the Granite on, for casual player types and the optimizer; idle materials are at most 0.5 day, for casual player types. They are added in `src/lab/targets.ts`, as ordinary entries, so a later target stays one entry.

#### Issues

One PR each, in dependency order. Every issue keeps `npm run check` green, including the strict strategy lab. `src/lab/targets.ts` stays untouched except in M9-6. Copy is in `screen-words`, and the tone lifts the dad up.

1. **M9-1 (#192) DESIGN.md.** This section. Depends on nothing.
2. **M9-2 (#193) Mockups.** Workshop, layer card, material line, and craft done, in `mockups/`, with screenshots at 390×844 and 360×640. No scroll at either size. Labels and tap feedback are described. Flemming approves. Depends on M9-1.
3. **M9-3 (#194) Layers** (`src/layers.ts`). Bands derived from stones mined, `layerOf(mountain)`, and hardness factors wired through `factor()` and defaulting to 1. Behavior-preserving. Pacing pins and the lab report stay unchanged. Unit tests at the band edges. Depends on M9-1. Built.
4. **M9-4 (#195) Materials and save v6.** Materials accrue in `accrue` and `accrueAway`. v5 migrates to v6. Firestore rules and rules tests. Old saves (v1 to v5, local and cloud) load and keep stones mined. Live and away accrual match to the unit. No UI yet. Depends on M9-3. Built.
5. **M9-5 (#196) Workshop rules** (`src/workshop.ts`). Recipe catalogue, bench start, settle, and cancel with a full refund, item effects in `effectiveRates`, recipe and strength factors defaulting to 1. Pure and tested. A finished craft settles once across reload and away. Depends on M9-4. Built.
6. **M9-6 (#197) Lab.** `craft` and `cancelCraft` in the catalogue and `valueOf`, a craft step for the casual types and the optimizer, the three extreme policies, `craftShare`, `materialIdle`, and `benchIdle`, and the new target rows in `targets.ts`. This is the only issue allowed to touch that file. The rows are the ones approved above. Add-one-file tests still pass. The report shows the new rows. No gameplay change. The new rows are report-only until M9-7. Depends on M9-5. Built.
7. **M9-7 (#198) Retune.** Hardness and the recipe numbers are on. The economy moved; the targets did not. The strict lab is green. Depends on M9-6. Follow-up **#210** keeps overlapping crew timers on the strongest one, and gives the thin strict rows about 10% headroom. Targets stay put.
8. **M9-8 (#199) Workshop screen.** Built to the M9-2 mockup, with copy in `screen-words`. The visual check does not scroll at 390×844, 360×640, or 360×560. Purchases show real numbers. Locked recipes show none. Tap feedback matches the mockup. Depends on M9-2 and M9-7. Built.
9. **M9-9 (#200) Layer card, material line, and craft-done notice.** The layer card shows once per layer, including across reload and away. Before the next band, the guide only hints. The material line lists a material once a unit is in the pocket or the digging has earned one, and it does not push the cards off screen. The craft-done notice names what was fitted and the real effect, during play and on the welcome card after time away. The field log records `layer.enter`, `craft.start`, and `craft.done`. Depends on M9-8. Built.
10. **M9-10 (#201) Recipes found on expeditions and on entering a layer.** A new vague find kind `recipe` in `expeditions.ts`. Recipes unlock on layer entry. The find text has no numbers and the recipe card does. The seeded find is deterministic. The lab stays green. Depends on M9-6 and M9-9. Built.
11. **M9-11 (#202) Ship check.** A fresh save and an upgraded v5 save played across the four layers, including crafting, cancel, the craft-done notice, an expedition return, passing the mine, and the cloud save line. The phone does not scroll at 390×844, 360×640, or 360×560. This page says "M9 is built". Depends on all of the above. Built.

M9-2 and M9-3 can both start as soon as M9-1 is in. Mockup sign-off (M9-2) can run alongside M9-4 through M9-7.
