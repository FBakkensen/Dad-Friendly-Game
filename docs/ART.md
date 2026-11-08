# Art

All game art is PixelLab pixel art (`POST /v2/create-image-pixflux`, transparent background, single color black outline, medium shading, highly detailed, side view), trimmed to its bounding box and padded square. Re-running a prompt with the same seed gives the same image.

| File                            | Size | Seed | Prompt                                                                                                                                                                                                                        |
| ------------------------------- | ---- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/assets/mountain.png`       | 128  | 7    | towering rocky mountain peak at night, warm lantern glow from a small mine entrance at its base, glinting gold ore veins in the rock, heroic and majestic, dark brown and amber palette                                       |
| `src/assets/gold-nugget.png`    | 32   | 17   | shiny gold ore nugget embedded in a small dark rock, sparkling                                                                                                                                                                |
| `src/assets/helper-miner.png`   | 48   | 18   | friendly dwarf miner with helmet lamp and pickaxe, cheerful, full body                                                                                                                                                        |
| `src/assets/mine-cart.png`      | 48   | 21   | wooden mine cart on rails heaped with grey stones and a few gold nuggets, sturdy iron wheels                                                                                                                                  |
| `src/assets/steam-drill.png`    | 48   | 22   | small steam-powered mining drill machine with brass boiler, smoke stack puffing steam and a big spiral drill bit, on wheels                                                                                                   |
| `src/assets/tunnel-borer.png`   | 48   | 23   | heavy tunnel boring machine, big round rotating cutter head with teeth at the front, iron body with rivets and a small lamp, side view                                                                                        |
| `src/assets/great-machine.png`  | 48   | 24   | giant steampunk mining machine, huge brass and iron excavator with gears, pistons, glowing furnace, multiple drill arms and smoke stacks, majestic                                                                            |
| `src/assets/upgrades-icon.png`  | 32   | 31   | icon of a golden upward arrow over a crossed pickaxe and hammer, glowing, game upgrade button icon                                                                                                                            |
| `src/assets/relics/shield.png`  | 64   | 11   | legendary golden knight shield with a glowing heart emblem, ancient heroic relic, warm amber glow                                                                                                                             |
| `src/assets/relics/lantern.png` | 64   | 12   | legendary ornate brass lantern with bright warm golden flame, ancient heroic relic, glowing                                                                                                                                   |
| `src/assets/relics/hammer.png`  | 64   | 13   | legendary builder's war hammer with golden runes on the head, ancient heroic relic, warm glow                                                                                                                                 |
| `src/assets/relics/heart.png`   | 64   | 14   | legendary glowing ruby heart crystal in a golden setting, ancient heroic relic, warm light                                                                                                                                    |
| `src/assets/relics/crown.png`   | 64   | 15   | legendary golden crown with small gemstones, ancient heroic relic of wisdom, warm glow                                                                                                                                        |
| `src/assets/relics/mantle.png`  | 64   | 16   | legendary flowing red hero cape with golden clasp and trim, ancient heroic relic, warm glow                                                                                                                                   |
| `src/assets/grandpa-miner.png`  | 44   | 41   | kind old grandfather dwarf miner with long white beard, worn helmet with a small lamp, leaning on a wooden walking stick, warm smile, retired master engineer, full body (48×48 canvas, `create_image_pixflux` via MCP, #338) |

The mountain picture is the layer card's art (`arrival-panel`); the board's tap target is the mine window (#371), whose band views are below. The relic sprites are used by the relic issues (#52, #53). App icons and the favicon are built from `mountain.png` by `scripts/make-icons.py`.

## The control board (#370)

The board's art is PixelLab art approved with the control-board mockup in B1. It is copied, not moved, from `mockups/control-board/assets/art/ind-board/` (and its `anim/` strips) into `src/assets/board/`, so the mockup still opens. The gauge row (#371) adds eight PixelLab files approved with B3 (marked "Approved B3" below; they are not in the mockup) and copies the rest of the window's and the gauge's art from the mockup, `mine-view.png` as `mine-view-granite.png`. The board shows it at exactly 2× (one art pixel is two CSS pixels, `--art`), `image-rendering: pixelated`, with no CSS filters. Sizes are in art pixels.

| File                                        | Size     | Use                                                                                      |
| ------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `src/assets/board/panel-face.png`           | 224×448  | The enamel face behind the whole board (`#app`).                                         |
| `src/assets/board/frame.png`                | 42×45    | The 9-slice frame skin: relic plate, note, save line, save drawer, crew plate.           |
| `src/assets/board/tag.png`                  | 26×10    | The 9-slice tag skin: "Relics of Fatherhood" and the window's "No. 2 Shaft".             |
| `src/assets/board/key.png`                  | 128×32   | The 9-slice key skin, up and pressed (`keyp`): Relic shelf, Close, Try again.            |
| `src/assets/board/inset.png`                | 48×48    | The 9-slice inset skin, in `board-skin` for later slivers; no part uses it yet.          |
| `src/assets/board/odometer.png`             | 120×40   | The odometer's housing and five drum windows.                                            |
| `src/assets/board/odo-dec-1.png` … `-3.png` | 14–15×25 | The red faces of the drums after the decimal point.                                      |
| `src/assets/board/odo-dot.png`              | 2×2      | The odometer's decimal point.                                                            |
| `src/assets/board/dial-boost-sheet.png`     | 1364×44  | The boost dial's face, one frame per step of the crew timer.                             |
| `src/assets/board/lamp.png`                 | 80×20    | The save lamp and the crew plate's lamp: four 20px frames, off, amber, green, red.       |
| `src/assets/board/relic-socket.png`         | 28×28    | An empty relic socket.                                                                   |
| `src/assets/board/relic-<relic>.png`        | 24×24    | A found relic in its socket: lantern, shield, hammer, heart, crown, mantle.              |
| `src/assets/board/relic-<relic>-dark.png`   | 24×24    | The next relic, dark, in its socket.                                                     |
| `src/assets/board/mine-view-topsoil.png`    | 92×76    | The mine window's view in the Topsoil: headframe, galleries and face. Approved B3.       |
| `src/assets/board/mine-view-granite.png`    | 92×76    | The view in the Granite. Copied from the mockup's `mine-view.png`.                       |
| `src/assets/board/mine-view-crystal.png`    | 92×76    | The view in the Crystal Caves. Approved B3.                                              |
| `src/assets/board/mine-view-heart.png`      | 92×76    | The view in the Deep Heart. Approved B3.                                                 |
| `src/assets/board/window-frame.png`         | 106×90   | The mine window's riveted frame round the view.                                          |
| `src/assets/board/window-glass.png`         | 92×76    | The glass over the view, drawn last.                                                     |
| `src/assets/board/window-vein-4f.png`       | 100×26   | The golden vein's glint: four 25px frames. Approved B3.                                  |
| `src/assets/board/window-cave-in-4f.png`    | 184×24   | A cart trouble's cave-in over the face: four 46px frames, held on the last. Approved B3. |
| `src/assets/board/window-great-machine.png` | 28×26    | The Great Machine on the surface, once one is owned. Approved B3.                        |
| `src/assets/board/window-kid.png`           | 10×14    | A kid by the lower lamp, once there are kids. Approved B3.                               |
| `src/assets/board/legacy-plate.png`         | 104×32   | The 9-slice brass skin of the Legacy plate on the window's lower edge. Approved B3.      |
| `src/assets/board/sheave-4f.png`            | 76×17    | The headframe's sheave wheel: four 19px frames.                                          |
| `src/assets/board/steam-4f.png`             | 44×11    | Steam off the winding house: four 11px frames.                                           |
| `src/assets/board/drill-work-4f.png`        | 92×15    | A drill at the face: four 23px frames.                                                   |
| `src/assets/board/borer-tarp.png`           | 26×15    | The tarp over the borer bay, dragged off when the first borer arrives.                   |
| `src/assets/board/borer-cut-4f.png`         | 112×16   | The borer cutting: four 28px frames.                                                     |
| `src/assets/board/dust-burst-4f.png`        | 64×16    | A dust puff: four 16px frames, for a dig, a tub filling and the borer.                   |
| `src/assets/board/cage.png`                 | 20×25    | The cage in the shaft that carries the tubs up.                                          |
| `src/assets/board/tub-empty.png`            | 14×12    | The haulage tub, empty.                                                                  |
| `src/assets/board/tub-full.png`             | 14×15    | The haulage tub, full.                                                                   |
| `src/assets/board/miner-18f.png`            | 216×21   | The miner who runs the tub: 18 frames of 12px (push and walk each way, two turns).       |
| `src/assets/board/gauge-output-sheet.png`   | 1144×520 | The output gauge's face and needle: 55 frames of 104px, one per 5°.                      |
| `src/assets/board/gauge-counter.png`        | 25×11    | The output gauge's counter window.                                                       |

The board's type is bundled, not loaded from Google: Barlow Condensed 500, 600 and 700 for words and Share Tech Mono 400 for numbers, latin woff2 only, copied from the `@fontsource/barlow-condensed` and `@fontsource/share-tech-mono` packages (5.x) into `src/assets/fonts/`. Both are under the SIL Open Font License; the notices are `src/assets/fonts/OFL-barlow-condensed.txt` and `src/assets/fonts/OFL-share-tech-mono.txt`. `src/board.css` declares them with `font-display: block`.
