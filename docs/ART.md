# Art

All game art is PixelLab pixel art (`POST /v2/create-image-pixflux`, transparent background, single color black outline, medium shading, highly detailed, side view), trimmed to its bounding box and padded square. Re-running a prompt with the same seed gives the same image.

| File                            | Size | Seed | Prompt                                                                                                                                                                                  |
| ------------------------------- | ---- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/assets/mountain.png`       | 128  | 7    | towering rocky mountain peak at night, warm lantern glow from a small mine entrance at its base, glinting gold ore veins in the rock, heroic and majestic, dark brown and amber palette |
| `src/assets/gold-nugget.png`    | 32   | 17   | shiny gold ore nugget embedded in a small dark rock, sparkling                                                                                                                          |
| `src/assets/helper-miner.png`   | 48   | 18   | friendly dwarf miner with helmet lamp and pickaxe, cheerful, full body                                                                                                                  |
| `src/assets/mine-cart.png`      | 48   | 21   | wooden mine cart on rails heaped with grey stones and a few gold nuggets, sturdy iron wheels                                                                                            |
| `src/assets/steam-drill.png`    | 48   | 22   | small steam-powered mining drill machine with brass boiler, smoke stack puffing steam and a big spiral drill bit, on wheels                                                             |
| `src/assets/tunnel-borer.png`   | 48   | 23   | heavy tunnel boring machine, big round rotating cutter head with teeth at the front, iron body with rivets and a small lamp, side view                                                  |
| `src/assets/great-machine.png`  | 48   | 24   | giant steampunk mining machine, huge brass and iron excavator with gears, pistons, glowing furnace, multiple drill arms and smoke stacks, majestic                                      |
| `src/assets/relics/shield.png`  | 64   | 11   | legendary golden knight shield with a glowing heart emblem, ancient heroic relic, warm amber glow                                                                                       |
| `src/assets/relics/lantern.png` | 64   | 12   | legendary ornate brass lantern with bright warm golden flame, ancient heroic relic, glowing                                                                                             |
| `src/assets/relics/hammer.png`  | 64   | 13   | legendary builder's war hammer with golden runes on the head, ancient heroic relic, warm glow                                                                                           |
| `src/assets/relics/heart.png`   | 64   | 14   | legendary glowing ruby heart crystal in a golden setting, ancient heroic relic, warm light                                                                                              |
| `src/assets/relics/crown.png`   | 64   | 15   | legendary golden crown with small gemstones, ancient heroic relic of wisdom, warm glow                                                                                                  |
| `src/assets/relics/mantle.png`  | 64   | 16   | legendary flowing red hero cape with golden clasp and trim, ancient heroic relic, warm glow                                                                                             |

The relic sprites are used by the relic issues (#52, #53). App icons and the favicon are built from `mountain.png` by `scripts/make-icons.py`.
