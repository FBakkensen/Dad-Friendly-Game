# Slice 1 prototype (throwaway)

A playable phone prototype of slice 1: the mine, the refinery, the factory and the city, from the first evening to the Foundry. It is the reference the slice 1 design points to for how the screens look and play (`docs/superpowers/specs/2026-11-14-slice-1-design.md`, "What he sees"). It is not the game's code and nothing in `src/` uses it. The numbers are made up and run fast; the taps are real.

- `proto.src.html` is the whole prototype: styles, scenes drawn on canvas, and the fake economy.
- `node prototypes/slice-1/build.mjs` inlines the game's sprites and fonts and writes `page.html` (the bare page, for a host that adds its own document shell) and `index.html` (standalone, opens from a file or any static host). Both are git-ignored.

What Flemming played and settled in it (14 and 15 Nov 2026):

- Each site has its own scene and its own gesture. The mine is the mountain cut open (drag a crew between levels). The refinery is rock falling through kilns and saws into the stockyard (tap a maker to add one). The factory is a station seen from above (drag a blueprint onto it). The city is a skyline that grows.
- No tap mines, and no tap ships goods. He orders a building once, one transport fleet (horse wagons, then trucks) carries the materials at its own rate, and a step is done when its materials have arrived. A factory work order is done the same way, with no fixed timer.
- Unattended time runs at the night shift output until the stockyard is full, and transport keeps delivering to what he ordered. The shift report says what came in and what stopped it.
- It starts on the first evening: one level, stone, the mine and the city. The Light Tower opens the refinery and the stockyard. The shaft opens the Granite, saws and the factory.
- Version 5 adds the workforce plate in the mine: he hires workers, the free hands go to the slowest stage, and a machine takes workers to run it. He has not played this one yet.
