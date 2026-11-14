# Slice 1 prototype (throwaway)

A playable phone prototype of slice 1's four places: the mine, the works, the workshop and the village. It is not the game's code and nothing in `src/` uses it. The numbers are made up and run fast; the taps are real.

- `proto.src.html` is the whole prototype: styles, scenes drawn on canvas, and the fake economy.
- `node prototypes/slice-1/build.mjs` inlines the game's sprites and fonts and writes `page.html` (the bare page, for a host that adds its own document shell) and `index.html` (standalone, opens from a file or any static host).

Each place has its own scene and its own gesture: the mine is the mountain cut open (send or drag a gang between levels), the works is rock falling through the kilns and saws into the yard (tap a maker to add one), the workshop is a bench seen from above (drag a drawing onto it), and the village is a skyline that grows (Send, and the building rises).
