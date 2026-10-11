"""Builds the PWA icons from the lantern pixel art (nearest-neighbour, no smoothing).

Run: python3 scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BG = (18, 12, 10, 255)  # #120c0a, the app background
lantern = Image.open(ROOT / "src/assets/boot-tile.png").convert("RGBA")


def icon(size: int, art_fraction: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BG)
    scale = max(1, int(size * art_fraction) // lantern.width)
    art = lantern.resize((lantern.width * scale, lantern.height * scale), Image.NEAREST)
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


out = ROOT / "public/icons"
out.mkdir(parents=True, exist_ok=True)
icon(192, 0.85).save(out / "icon-192.png", optimize=True)
icon(512, 0.85).save(out / "icon-512.png", optimize=True)
# Maskable: keep the art inside the 80% safe zone.
icon(512, 0.6).save(out / "icon-maskable-512.png", optimize=True)
icon(180, 0.85).save(out / "apple-touch-icon.png", optimize=True)
icon(48, 1.0).save(ROOT / "public/favicon.png", optimize=True)
