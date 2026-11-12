# A hired worker shows what he really adds (#490)

**Goal:** when a worker (or a kid) joins while machines stand idle, the Ready now plate, its Done line and the Buys rows show his real gain: his own hands plus the machine he starts, not only his own speed.

**Shared module:** `src/rates.ts`. `firstIdleTier` there already reads the rates with one more worker to find the machine he starts. The new `handsGain` and `startedTier` go beside it, and `firstIdleTier` is rebuilt on `startedTier` rather than copying it. `readyNow` (`src/ready-now.ts`) and `buyRowView` (`src/buys-rows.ts`) call them.

## Rulings (agent-run sitting)

1. **The gain is the crew's own rise.** `handsGain(mountain, tier, count)` is the crew's speed with `count` more workers (or kids) less its speed now, both before crew timers and the Gold rush (the rows never counted those). It counts the machines they start, the tending floor and a worker mark (25, 50, 100) they reach, so the number is what the crew line will gain. A worker with nothing idle reads his own speed, plus what Helping hands or a mark adds through him. It never reads below zero: staffing fills the biggest machine first, so an eighth hand can move seven off faster drills onto a borer and slow the crew; that order is its own question, filed apart.
2. **Only the hands' rows change.** Machine rows keep "speed × count" (#358). A ×10 of carts that crosses a mark still shows ten carts' speed; that is left as it is and named in the PR body.
3. **The plate says what he starts.** A hire that starts an idle machine reads "+24/s · starts an idle cart" ("drill", "borer", "Great Machine"); otherwise "every hand is busy", as today. The Done line keeps "Worker 61 is on the crew" with the new gain.
4. **No save field, no lab change.** Display only.

## Tasks

1. `rates.ts`: `startedTier`, `handsGain`; `firstIdleTier` on `startedTier`. Tests in `rates.test.ts`.
2. `ready-now.ts`: the helper pick's gain from `handsGain`, and `starts` on the pick. `board-ready.ts`: the reason words. Tests in `ready-now.test.ts` and `board-ready.test.ts`.
3. `buys-rows.ts`: the worker and kid rows' gain from `handsGain`. Tests in `buys-rows.test.ts`.
4. Docs: `DESIGN.md` (the Ready now plate and the Buys row), `ui-audit.md` if it quotes the plate.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test files, `npm run gate -- fast`, the board visual section and `npm run play` on the `heart` and `idle` saves, then the full gate.
