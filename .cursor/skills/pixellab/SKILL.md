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
- Which tool you would call
- Size in pixels
- The prompt you would send
- That it spends PixelLab generations and may take from seconds to a few minutes

Wait for a yes. If they change the prompt, use theirs.

Cap: **one sheet or one loop per sitting**. No "while we are here, generate the cast."

## If MCP is missing

Do not curl the REST API. Do not invent PNGs. Do not draw rectangles.

Tell them to add the PixelLab MCP in Cursor (https://www.pixellab.ai/mcp):

```json
{
  "mcpServers": {
    "pixellab": {
      "url": "https://api.pixellab.ai/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SECRET"
      }
    }
  }
}
```

Token comes from their PixelLab account. Never put the bearer token in git.

Then inspect the server tools and use those. Names may be prefixed.

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

The sliver is not done until TypeScript and tests are green and the agent has opened the app in Cursor's integrated browser and seen the real art on screen.
