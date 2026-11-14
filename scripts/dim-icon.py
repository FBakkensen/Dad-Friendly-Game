#!/usr/bin/env python3
"""Recolour a board icon into its dim silhouette (#535).

The board allows no CSS filters, so a dim icon is its own file: every pixel
keeps its place and takes one of mach-kid-dim.png's five greys by how bright
it was. This is how mach-hoist-dim, mach-train-dim, mach-cart-dim and
mach-drill-dim were made.

    python3 scripts/dim-icon.py src/assets/board/mach-hoist.png src/assets/board/mach-hoist-dim.png

Needs Pillow 12.1 or later (Image.get_flattened_data).
"""

import sys

from PIL import Image

# (brightness below, grey): Rec. 709 luminance of the lit pixel, 0-255.
STEPS = [
    (40, (0x18, 0x1D, 0x21)),
    (70, (0x20, 0x27, 0x2C)),
    (103, (0x2A, 0x32, 0x38)),
    (165, (0x35, 0x3F, 0x46)),
    (256, (0x45, 0x50, 0x5A)),
]


def dim(pixel: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    r, g, b, a = pixel
    if a == 0:
        return (0, 0, 0, 0)
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    grey = next(colour for below, colour in STEPS if luminance < below)
    return (*grey, 255)


def main() -> None:
    source, target = sys.argv[1], sys.argv[2]
    lit = Image.open(source).convert("RGBA")
    out = Image.new("RGBA", lit.size)
    out.putdata([dim(pixel) for pixel in lit.get_flattened_data()])
    out.save(target)


if __name__ == "__main__":
    main()
