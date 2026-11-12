# The Ready plate tells the truth with no crew and in the last minute (#517)

**Goal:** on a new mountain the plate stops saying "every hand is busy" when there is no crew, and a buy seconds away stops reading "in 1m".

**Shared module:** the existing `src/ready-now.ts` (the pick) and `src/board-ready.ts` (its words), and `etaShort` in `src/format.ts`. No new module.

## Rulings (agent-run sitting)

1. **The no-crew line:** "your first worker", in the plate's own voice ("your free worker can run it"). It shows only when the mountain has no crew and no idle machine; an idle machine still reads "starts an idle cart" (#490). The pick carries it as `firstWorker: true`, beside `starts`, read from the crew plate's count (`crewCounts`).
2. **The countdown:** under a minute `etaShort` counts whole seconds, rounded up and at least 1 ("in 3s", ticking down with the plate); from 59.001s it reads "1m" as before. Decision D1's wording in `docs/design-intent.md` and `docs/DESIGN.md` follows.

## Tasks

1. Tests first: `ready-now.test.ts` (first worker, an idle cart instead, one on the crew), `board-ready.test.ts` (the line, the seconds), `format.test.ts` (the seconds cases), and the screen test that read one stone short as minutes.
2. The pick, the words and `etaShort`.
3. Docs: `DESIGN.md`, `design-intent.md`.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test files, `npm run gate -- fast`, `npm run play` on `fresh` after 20 taps and on `saving` at 424×830, then the full gate.
