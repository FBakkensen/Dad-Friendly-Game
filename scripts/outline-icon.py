#!/usr/bin/env python3
"""Give a picture the house outline (#656).

PixelLab drew the city's pictures with a soft dark blue-grey edge, not the
single colour black outline the art has (docs/ART.md). So every opaque pixel
that touches a transparent one, or the picture's own edge, takes the outline
colour of the machine icons. Nothing else moves. This is how the city's
light-tower.png, horse-wagon.png (#657) and warehouse.png (#670), and the
board's mach-kiln.png (#668) and res-brick.png (#669), were made from the
pictures PixelLab drew.

    python3 scripts/outline-icon.py mockups/city/art/light-tower-drawn.png src/assets/city/light-tower.png
    python3 scripts/outline-icon.py mockups/city/art/horse-wagon-drawn.png src/assets/city/horse-wagon.png
    python3 scripts/outline-icon.py mockups/city/art/warehouse-drawn.png src/assets/city/warehouse.png
    python3 scripts/outline-icon.py mockups/refinery/art/mach-kiln-drawn.png src/assets/board/mach-kiln.png
    python3 scripts/outline-icon.py mockups/refinery/art/res-brick-drawn.png src/assets/board/res-brick.png
"""

import sys

from PIL import Image

# The outline of mach-hoist.png and the other machine icons.
OUTLINE = (10, 12, 14, 255)

SIDES = ((1, 0), (-1, 0), (0, 1), (0, -1))


def main() -> None:
    source, target = sys.argv[1], sys.argv[2]
    drawn = Image.open(source).convert("RGBA")
    width, height = drawn.size
    before = drawn.load()

    def clear(x: int, y: int) -> bool:
        outside = x < 0 or y < 0 or x >= width or y >= height
        return outside or before[x, y][3] == 0

    out = drawn.copy()
    after = out.load()
    for y in range(height):
        for x in range(width):
            if clear(x, y):
                continue
            if any(clear(x + dx, y + dy) for dx, dy in SIDES):
                after[x, y] = OUTLINE
    out.save(target, optimize=True)


if __name__ == "__main__":
    main()
