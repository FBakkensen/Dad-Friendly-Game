# Dad-friendly game

What a dad-friendly game is. Apply to design, UX, persistence, art, audio, and runtime AI.

The player is an adult after lights-out. Kids are asleep in the house. Content may be sharp. Audio must not be.

A dad-friendly game has at least these characteristics:

- can be played in short interrupted sessions
- is relaxing for the brain after a long day when the kids are finally asleep
- can be played on the phone, wherever the dad is
- can survive instant quit and picked up later

## Session

- Built for about two minutes. May stretch if the house stays quiet.
- Gentle loop. A little craft is good. Never punishing. Losing a minute is fine. Losing the evening is not.
- Close is pause. No confirm dialog. Kill the tab or lock the phone. Next open is the same moment, minus at most one in-flight tap.
- Persist on every meaningful mutation, on `visibilitychange` hidden, and on `pagehide`.

## Shape

Turn-based or idle are both in bounds. Real-time twitch play is not.

- Turn-based: a sitting is one turn or a short run of turns. Close mid-turn is still pause.
- Idle: progress may accrue while away. Compute it from timestamps on the next open. Idle is not a live server.

## The road to Mars

- The game is a progression that ends with a rocket the player builds and people sent to Mars (Flemming, 14 Nov 2026). On the way the mine digs more kinds of resource and gets more machines, and buildings and machines cost different resources, some refined or manufactured late in the game.
- Goods, machines, makers, levels, buildings and prices are open lists, never closed sets. A run ends at "the last building", never at one by name. In the end that building is the rocket. The mountain has no bottom.
- A run lasts at least five days, in the end probably weeks. The exact length does not matter. What matters most is a meaningful decision open at all times (14 Nov 2026).

## An engineering game

It is an engineering game, not a kids' game (Flemming, 14 and 15 Nov 2026). What a screen has to meet, line by line, is in the slice 1 spec (`docs/superpowers/specs/2026-11-14-slice-1-design.md`, What any screen has to meet). These are the principles under it.

- **No manual mining.** No button mines, and no button delivers. The player hires, assigns, buys and orders.
- **Plain engineering words.** Drilling, haulage, hoisting, stockpile, stockyard, refinery, factory, city, order. Never "face", "hands" or "by hand", and no cute or mining-romance wording, on a screen or in a question to Flemming. The approved names are the table in that spec (Names). Use them and do not ask again. Ids in code are free.
- **Show the numbers, never the answer** (15 Nov 2026). Nothing names the bottleneck, a limit or the best buy. Show the counts, the rates, what each worker and machine adds, and how the stages and parts depend on each other. The player finds the system, does the maths, and gains by balancing all its parts. That is the game.
- **Every stage has its own buffer** (15 Nov 2026). Chained stages never run in lockstep: each fills a stock with a limit, and the next one takes from it. A full stockyard stops production, also over a night.
- **State is seen.** What is idle shows: workers, machines, vehicles, and a buffer that is full. A count of machines shows the workers it has and the workers it takes. A number that jumps or drops shows why: a change with no reason on screen reads as a bug.
- **The player assigns.** Workers are one workforce he can see, count and move. Nothing is shared between levels or sites by a hidden rule. What he assigns is a plain number between − and +. The game starts with about one worker, and each hire makes a difference he can see.
- **Things are physical.** Stock changes when the thing that carries it arrives. He places an order, and transport carries the goods at a speed he can upgrade in kind (horse wagons, trucks, trains). Nothing has a fixed build time: a thing is built when its goods have arrived. A recipe is shown wherever a good is made.
- **Each kind of work has its own place.** The mine, the refinery, the factory and the city differ on screen at a glance, each with its own question and its own shape (14 Nov 2026).

## Devices

- One web app, phone-only (#498). Touch-first. Fat targets. A PC shows the same phone board, scaled and centred, and is not tested or designed for.
- The phone layout never scrolls (the visual check guards it).
- Same save on every device from day one. Identity is one-tap Google. Backend is a save blob, not a live world. No SpaceTimeDB.

## Numbers and discoveries

- Decisions and purchases show real numbers: prices, output, tending gains.
- Discoveries stay vague: relic depths and hints, expedition finds, hazards, and what comes next. Use the wording already in the UI.

## Senses and art

- Silent until the player unmutes. No autoplay.
- PixelLab pixel art. Simple animation loops. No tileset world, no 8-direction walker, no isometric map until that ceiling is raised on purpose.
- No placeholders. The human cannot abstract from boxes. If art is missing, stop and use the pixellab skill.

## AI in play

- Optional spice. Never required to progress. If the model or network is down, the game still plays.
