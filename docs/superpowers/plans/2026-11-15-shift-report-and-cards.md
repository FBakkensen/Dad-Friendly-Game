# The shift report and the cards (#663)

Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "The cards", "While a part is the end of the game", calls 47 and 48, rules 4 and 7.12. Built inside the frame (#659, `src/frame-screen.ts`). Off in play: only the dev build's `?slice=1` frame and a fresh mine reach it.

## Rulings (agent-run sitting)

1. **The night's facts are rules, in `mountain`'s `accrueNight`.** `AwayReport` gains `night?: NightReport`, present only in a fresh mine: `producedMs` (time the mine dug with a line above 0), `stop` (`"clock"` when the eight-hour clock stopped a mine that was producing, else `"none"`), `delivered` (a `Stock`: what transport took from the pocket to orders), `steps` (each step finished: building, step index, `atMs` from the start of the night; the roof's step is the building going operational), `payFrom` and `payTo` (the night shift output at the start and the end, 0.3 and 0.45), and `litAtMs` (when the output changed, or undefined).
2. **The night splits at every step's end, not only the roof's.** `transport` gains `secondsToStep` beside `secondsToFinish` (one walk over the steps, so no second copy), and `nightStretch` stops at the next step's end, so each step's time is exact.
3. **The report is a pure view**, `src/shift-report-view.ts`, of `AwayReport` with `night`: the prototype's lines (`proto.src.html`, `away`). Head: "Unattended 9 h. Night shift output: 30%." or, when a roof went on, "Unattended 9 h. Night shift output 30%, and 45% from the Light Tower's roof." (his to approve). The bar: production share and its two labels ("production 8 h", "idle 1 h", or "production, no downtime"). "Produced: 34,560 stone." or "No output." "Transport delivered to orders: 9,720 stone." A line for each step: "The Light Tower: foundation complete." and, for the roof, "The Light Tower: operational. Night shift output 45%, up from 30%." "A night shift runs 8 h. Production stopped after that." only when `stop` is `"clock"`. Its key is "Resume". It names no reason when the mine stood for another reason, and says "full" nowhere in part 1.
4. **The frame shows the report** as a card over the frame after unattended time (the session's `away` notice, dismissed through the store as the board's welcome card is). In a fresh mine the session greets a night where anything happened (mined, delivered, or a step finished), not only one where stones were mined, and never the board's "quiet" note.
5. **The first evening's card moves to #703.** Flemming changed the start to one worker he shifts between roles (15 Nov 2026), so the first card's words depend on #703's start. This sliver builds the report and the end card only.
6. **The end card** ("The Light Tower: operational") shows when the Light Tower's roof goes on: live, when the frame sees `operational` gain it; after a night, behind the report, when the report's steps hold the roof. Its words are his to approve.
7. **Copy waits for his yes.** The PR stays open until he answers; any change to the proposed lines lands before the merge.
8. **Durations follow the prototype's `dur`**: "45 s" under 90 s, "12 min" under 90 min, then "9 h" or "1 h 30 min". So the plan's "idle 1 h" example reads "idle 60 min".

## Tasks

1. Rules: `secondsToStep`, the night split at steps, `NightReport` in `accrueNight`, with unit tests from timestamps (`src/fresh-night.test.ts`).
2. Session: greet a fresh night by its facts (`session.ts`, `welcome`), tests.
3. `shift-report-view`: the lines, tests.
4. Frame: the card overlay (`frame-cards.ts` or inside `frame-screen`), the report, the end card; `frame.css`; tests (happy-dom).
5. Visual section (`scripts/visual/frame.mjs`: the report and the end card; no scroll at 424×924 and 424×830) and `npm run play` saves (`slice-night`, `slice-roof`).
6. Docs: `ARCHITECTURE.md`, `docs/ui-audit.md` and its shots.
