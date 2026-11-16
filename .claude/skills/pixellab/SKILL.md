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

Flemming approved PixelLab for the project (11 Nov 2026), and since 15 Nov 2026 each new picture's spend is asked first, as a number of generations. His yes to the prompt, the size or the spend is not his look at the finished picture: show it to him, and record his answer in `docs/ART.md`.

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

## PixelLab MCP in Claude Code

The PixelLab server is `pixellab` in `.mcp.json` at the repo root: `"type": "http"`, URL `https://api.pixellab.ai/mcp`, header `Authorization: Bearer ${PIXELLAB_TOKEN:-proxy-injected}`. The human gets a token at https://www.pixellab.ai/mcp. Never put the bearer token in git. Never read it aloud or echo it.

Where the token comes from:

- **Cloud session.** A network secret for `api.pixellab.ai` on the `dad-friendly-game` environment. The proxy overwrites the `proxy-injected` placeholder with the real token and also lets the host through. No env var is set, and none is needed.
- **Local Claude Code.** Export `PIXELLAB_TOKEN` in the shell that starts `claude`. Approve the `pixellab` project server the first time `claude` asks.

Before promising art, check that PixelLab tools are in your tool list (Claude Code names them `mcp__pixellab__<tool>`; they are deferred and connect a few seconds after start, so search for them). Use the names the list gives you. Do not guess.

### A cloud session where the tools never load

A session that starts in the folder above the repo never reads `.mcp.json`, so no `mcp__pixellab__` tool appears, however long you wait. PixelLab is still reachable there, because the proxy injects the token for `api.pixellab.ai`. Speak MCP to the same server over HTTP. This is the MCP endpoint, not the REST API:

- POST JSON-RPC to `https://api.pixellab.ai/mcp` with the headers `Authorization: Bearer proxy-injected` and `Accept: application/json, text/event-stream`: first `initialize`, then `tools/list` and `tools/call`. The answer comes as SSE `data:` lines.
- `wait_for_jobs` is free and saves polling. `get_balance` is free too.
- Download a finished picture from `https://api.pixellab.ai/mcp/images/<job_id>/download` with the same headers.
- The account runs at most 10 jobs at once.

If that endpoint refuses the call too, there are no PixelLab tools:

- Do not curl the REST API.
- Do not invent PNGs.
- Do not draw rectangles.
- Say plainly that PixelLab is unavailable in this session. In a cloud session, ask the human to save the token as a network secret for `api.pixellab.ai` (`request_credential`, never pasted in chat); a fresh session then loads it. Locally, ask them to export `PIXELLAB_TOKEN` and restart `claude`.

## Ceiling

Allowed now: simple loops and stills.

Prefer, in order:

1. `create_image_pixflux` or `create_image_pixen` for a sprite or item (`no_background: true`)
2. `animate_image` for a short idle or action loop (even frame count, 4 for idle)
3. `create_ui_asset` for panels, buttons, bars
4. `create_1_direction_object` for a single-facing prop

Do not use unless the human raises the ceiling: tilesets, isometric maps, `create_8_direction_object`, `create_character` with 4 or 8 directions, path tiles, building kits.

Match style to existing assets in `assets/` (palette, outline, size). Prefer URL references over huge inline base64. PixelLab jobs are async. Poll the matching `get_*` tool. Save the PNG into the repo. Wire the game to the real file.

## What has worked

The prompt, seed and init of every picture in the game are in `docs/ART.md`. Read the section for the nearest picture before a new one. In short:

- **Small icons.** `create_image_pixflux` refuses a canvas under 32×32. For a 16, 20, 24 or 28 square icon use `create_image_pixen` (one generation, no palette or init image). At 16×16 a first try is often hard to read: name the shape and its parts plainly, and try once more. Pixen sometimes leaves stray pixels in the corners: check the alpha and clear them.
- **A flat side view in the board's style.** A plain prompt comes out isometric, even with `view: side`. Pass a strip of the existing pictures' colours as `color_image_base64`, and a rough sketch of the silhouette as `init_image_base64`. The strength that worked ran from 110 (the kiln, the truck) through 140 to 220 (the hoist, the pit train) to 450 (the saw). One polish pass from the best try at strength 300 can help a machine. It made the horse wagon worse.
- **A building.** A tall or square canvas gives a house. A long low canvas, with the goods it holds named in the prompt, gave the Warehouse. A tower came out right from the prompt alone, and a sketch as init at strength 60 to 80 made its lamp room bigger.
- **A vehicle.** The horse wagon was best from the prompt alone: an init made a blob of the horse. The truck took an init at strength 110. PixelLab sometimes draws a strip of ground under a vehicle: clear those rows yourself.
- **After the picture.** Pixen's colours are its own: `scripts/palette-icon.py` snaps them to the palette. `scripts/outline-icon.py` gives every picture the house's black outline. A dim icon is a recolour (`scripts/dim-icon.py`), with no PixelLab call.
- **Tries in parallel.** Start them as background shell jobs, with the `cd` on a line of its own first, or they start in the wrong folder.

## After the file lands

The sliver is not done until TypeScript and tests are green and the app has been opened in a real browser with the real art visible on screen.
