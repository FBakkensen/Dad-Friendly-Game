#!/usr/bin/env python3
"""Move a picture's colours onto a palette (#669).

PixelLab's pixen draws the 16x16 icons and takes no colour image, so its
colours are its own. Every opaque pixel takes the nearest colour of the
palette picture, by a weighted distance in red, green and blue. Nothing
else moves. This is how res-brick.png got the board's colours, before
scripts/outline-icon.py gave it the house outline.

    python3 scripts/palette-icon.py mockups/refinery/art/res-brick-pixellab.png mockups/city/art/palette.png mockups/refinery/art/res-brick-drawn.png

Needs Pillow 12.1 or later (Image.get_flattened_data).
"""

import sys

from PIL import Image

# How much a step of red, green and blue counts, about as the eye weighs them:
# green most, blue least. So a dark purple goes to a dark red, not a mid red.
WEIGHTS = (3, 6, 1)


def main() -> None:
    source, palette_file, target = sys.argv[1], sys.argv[2], sys.argv[3]
    palette = sorted(set(Image.open(palette_file).convert("RGB").get_flattened_data()))

    def nearest(colour: tuple[int, int, int]) -> tuple[int, int, int]:
        return min(
            palette,
            key=lambda p: sum(w * (a - b) ** 2 for w, a, b in zip(WEIGHTS, p, colour)),
        )

    out = Image.open(source).convert("RGBA")
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a != 0:
                pixels[x, y] = (*nearest((r, g, b)), 255)
    out.save(target, optimize=True)


if __name__ == "__main__":
    main()
