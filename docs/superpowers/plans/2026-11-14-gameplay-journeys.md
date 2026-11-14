# Gameplay journeys: the first two minutes, and back after eight hours (#552)

An agent-run sitting under M16 (#551). The issue carries the design; this records the plan and the rulings made while building it.

## Plan

1. The readouts a journey reads carry their exact number: the odometer's `data-count` (the pocket) and the welcome card's `.welcome-mined-count[data-count]` (the haul). Unit tests first (`board-stock.test.ts`, `mountain-screen.test.ts`).
2. `@playwright/test` pinned to 1.63.0, the version the cloud container already has. The config (`tools/journeys/playwright.config.ts`) launches the harness's Chrome (`chromePath`), so nothing is downloaded, and starts its own Vite.
3. One player driver (`tools/journeys/player.ts`) with every selector: open a named save at 9 pm with the clock paused and `Math.random` seeded, dig, open and shut Buys, buy a row, read the stones and the welcome haul, close the welcome card. Any page error fails the journey.
4. `Expected` (`tools/journeys/expected.ts`): the game's own session (`createSession`, `step`) stepped beside the page on the same clock. A journey compares the board to it, never to a typed number.
5. The two journeys, then the gate's `journeys` step (full tier, heavy lane, after the tests) and `npm run journeys`.
6. The rule "Do not add Playwright unless asked" becomes "Playwright Test is for gameplay journeys"; the ladder, `CLAUDE.md` and `docs/ARCHITECTURE.md` name the journeys.

## Rulings

- **Where the journeys live:** `tools/journeys/`, named `*.journey.ts`, so Vitest never picks them up and the tools typecheck covers them. The tools typecheck now includes `src/vite-env.d.ts`, because the session rules reach `src/build-stamp.ts`.
- **The shared module:** the journeys reuse `tools/browser/fixtures.ts` (saves) and `tools/browser/harness.ts` (`chromePath`, `seedScript`, `SAVE_KEY`) rather than copying them.
- **The clock:** Playwright's `page.clock`, installed and paused at 9 pm. Waits of whole ticks jump one tick at a time (`clock.fastForward`): the game's one-second tick and every due timer run once a tick, which is what the rules see, about thirty times faster than running every frame (60 game seconds: 0.5 s instead of 16.5 s).
- **The player acts on whole ticks.** A Buys row judges what is affordable from the board last painted, while a move settles the crew's work since the last tick first. A tap half a second after a tick can therefore see a worker the board does not yet light: that is how the game works, not a fault, and the journey taps where the board was painted.
- **Rows keep their places while Buys is open** (`createBuysLayout`), so the cart's row appears only when Buys opens again. The journey shuts Buys while saving for the cart, as a player would.
- **The first two minutes' policy:** dig to the first worker, hire to ten workers as each becomes affordable, then save for the cart. With today's numbers the cart lands a little over two minutes in; the journey allows ten minutes, so a retune moves the moment but does not break the journey.
- **Port 4186**, away from the other scripts' Vite ports (4174, and 4175 upward).
