# The Ready plate tells the truth with no crew and in the last minute (#517)

**Goal:** on a new mountain the plate stops saying "every hand is busy" when there is no crew, and a buy seconds away stops reading "in 1m".

**Shared module:** the existing `src/ready-now.ts` (the pick) and `src/board-ready.ts` (its words), and `etaShort` in `src/format.ts`. No new module.

## Rulings (agent-run sitting)

1. **The no-crew line:** "your first worker", in the plate's own voice ("your free worker can run it"). It shows only when the mountain has no crew and no idle machine; an idle machine still reads "starts an idle cart" (#490). The pick carries it as `firstWorker: true`, beside `starts`, read from the crew plate's count (`crewCounts`).
2. **The countdown:** under a minute `etaShort` counts whole seconds, rounded up and at least 1 ("in 3s", ticking down with the plate); from 59.001s it reads "1m" as before. Decision D1's wording in `docs/design-intent.md` and `docs/DESIGN.md` follows.
3. **What a screen reader hears (review):** the button was the live region, so a seconds countdown would be read every second. The live words move to a screen-reader-only span beside the button (`.board-ready-live`, on the existing 1px clipped rule in `board.css`). They are the aria words, except a Saving for plate leaves out its countdown, so they change only when the pick does. The button keeps its full aria label, countdown included.
4. **After a pass:** the kid's run starts on a new mountain with no crew, so its first hire reads "your first worker" too. It is this mountain's first.
5. **`firstWorker?: true` beside `starts?`:** a display type, not a save field, following #490's `starts?`; the pick sets at most one of them.

## Tasks

1. Tests first: `ready-now.test.ts` (first worker, an idle cart instead, one on the crew), `board-ready.test.ts` (the line, the seconds), `format.test.ts` (the seconds cases), and the screen test that read one stone short as minutes.
2. The pick, the words and `etaShort`.
3. Docs: `DESIGN.md`, `design-intent.md`.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test files, `npm run gate -- fast`, `npm run play` on `fresh` after 20 taps and on `saving` at 424×830, then the full gate.
