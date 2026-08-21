---
name: pixellab
description: Generates PixelLab pixel-art assets through MCP after asking the human first. Use when adding sprites, UI chrome, animation loops, or any game art, or when the user mentions PixelLab, pixel art, or generating assets.
---

# PixelLab

No placeholders. The human cannot abstract from boxes. Ask first, then generate.

Tool list: https://api.pixellab.ai/mcp/docs

## Ask first

Before any create/edit/animate call, send one short ask:

- What asset (idle loop, button, item, scene)
- With an init PNG or without
- Which tool you would call
- Size in pixels
- The prompt you would send
- That it spends PixelLab generations and may take from seconds to a few minutes

Wait for a yes. If they change the prompt, use theirs.

Cap: **one sheet or one loop per sitting**. No "while we are here, generate the cast."

## With an image or without

Ask which. Both are valid.

**With init.** `create_image_pixflux` with `init_image_base64` or `init_image_url`. `init_image_strength` is how much of the input is kept: 500 barely moves, 300 is a tint, 150 is a real edit, ~50 keeps the silhouette. Use this when the new sprite is the next rung of an existing item (ore-lump → denser chunk).

**Without init.** Text prompt only. Optional `color_image_base64` / `color_image_url` to steal a palette without copying the drawing (lantern → first ore). Pixen has no init image.

Do not use `edit_image` for one 32×32 still. It bills 20–40 generations.

### Init image through MCP (what actually worked)

MCP often truncates large base64 in tool args. PixelLab then reports "Could not decode image" or "broken data stream". That happened with the repo's `ore-lump.png` (692 bytes, palette-alpha) sent as `init_image_base64`, and again as a `data:` URL on `init_image_url`.

Before calling PixelLab, re-encode the init PNG to vanilla 8-bit RGBA so the file shrinks and decodes reliably:

```bash
magick src/assets/ore-lump.png -depth 8 rgba:/tmp/ore.rgba
python3 - <<'PY'
from pathlib import Path
import struct, zlib, base64
rgba = Path("/tmp/ore.rgba").read_bytes()
w = h = 32
def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
raw = b"".join(b"\x00" + rgba[y * w * 4 : (y + 1) * w * 4] for y in range(h))
ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
Path("/tmp/ore-init.png").write_bytes(png)
print(base64.b64encode(png).decode("ascii"))
PY
```

For a 32×32, that landed around 380 bytes and ~512 base64 chars. Pass that string to `init_image_base64` (not both base64 and url).

Then call `create_image_pixflux` with the text prompt, `init_image_strength: 150`, `no_background: true`, and style hints (`view`, `outline`, `shading`). Poll `get_image(job_id)`. Download the PNG from the job's download URL into `src/assets/`.

If decode still fails, the init was probably truncated again. Re-encode smaller or quantize further before retrying once.

## MCP bridge in Pi

Pi has no built-in MCP client. This project uses the **pi-mcp-adapter** package (one lazy `mcp` proxy tool instead of every tool definition). The PixelLab server is configured in `.mcp.json` at the repo root:

- URL: `https://api.pixellab.ai/mcp`, auth `bearer`, token read from the `PIXELLAB_TOKEN` env var.
- The human gets a token at https://www.pixellab.ai/mcp and exports `PIXELLAB_TOKEN=<token>` before starting pi. Never put the bearer token in git. Never read it aloud or echo it.

Before promising art, check whether the `mcp` tool exists in your available tools. If it does, discover the server with `mcp({ search: "pixflux" })` (or similar) and call tools through `mcp({ tool: "<name>", args: {...} })`. Tool names are prefixed (for example `pixellab_create_image_pixflux`) — use whatever search returns, do not guess.

If there is no `mcp` tool, or search finds no PixelLab server:

- Do not curl the REST API.
- Do not invent PNGs.
- Do not draw rectangles.
- Say plainly that PixelLab is unavailable in this session and ask the human to install the bridge (`pi install npm:pi-mcp-adapter`, then restart pi) or set `PIXELLAB_TOKEN`.

## Ceiling

Allowed now: simple loops and stills.

Prefer, in order:

1. `create_image_pixflux` or `create_image_pixen` for a sprite or item (`no_background: true`)
2. `animate_image` for a short idle or action loop (even frame count, 4 for idle)
3. `create_ui_asset` for panels, buttons, bars
4. `create_1_direction_object` for a single-facing prop

Do not use unless the human raises the ceiling: tilesets, isometric maps, `create_8_direction_object`, `create_character` with 4 or 8 directions, path tiles, building kits.

Match style to existing assets in `assets/` (palette, outline, size). Prefer URL references over huge inline base64. PixelLab jobs are async. Poll the matching `get_*` tool. Save the PNG into the repo. Wire the game to the real file.

## After the file lands

The sliver is not done until TypeScript and tests are green and the app has been opened in a real browser with the real art visible on screen.
