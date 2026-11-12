# Figures lead a line (#506) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the line under a machine and in a drawer row's info line the numbers are bright and bold and the words are quiet, and a Buys row shows its milestone's payoff whole.

**Architecture:** One writer in `src/board-dom.ts` (`writeFigures`) puts each figure of a line in a `b.board-fig`; the bays' fit and a row's info fit measure with it, so a line is measured as it is drawn. A row's info line may take two lines when the row has no need or why line under it (`src/board-row.ts`). `src/milestones.ts` gives a row the next mark's progress and payoff; `src/buys-rows.ts` turns them into fit options. No new module.

**Tech Stack:** TypeScript, Vitest (happy-dom), CSS tokens, the visual check, `npm run play`.

**Spec:** issue #506 (items 3 and 4 of the readability list, parent #504). Flemming approved the list and its before/after sheets on 2026-11-12 (`/mnt/project-files/readability/3-buys.png`); there is no separate spec.

## Global Constraints

- No raw px or colour in `board.css` (`npm run tokens`). A bay stays 62px and a drawer row 76px; a row has three lines at most.
- A line's `textContent` does not change by the figures' markup: tests and labels that read it still hold.
- The milestone goals in `MILESTONES` are Flemming's copy and do not change. The payoff is a goal's own last sentence.
- Hand, worker and per-second wording and locked rows are out of scope (#508, merged).
- Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test file, `npm run gate -- fast`, the visual sections that cover the bays and the drawers plus `npm run play`, then `npm run gate -- full` once before the PR.

## Review Focus

- A line is fitted with the figures' markup in place: bold figures are wider than the words' weight, so a fit measured on plain text could be cut on the page.
- A Buys row with a need line (`Needs 8 workers`) has one info line: the payoff falls back to `2 of 5 · Twice as fast`, then `2 of 5`, never a cut.
- A row whose single info option is too long for two lines (a relic's power in the Ledger) ends in an ellipsis on its second line, not a hard cut.
- A Done hold keeps the row's need and why as they were: the info line's room is read from what the row shows, not from the new view.
- A trouble line (`Cave-in! · Hold to fix`) has no figure and must not go quiet.

---

### Task 1: Figures in a line

**Files:**

- Modify: `src/board-dom.ts` (`figureRuns`, `writeFigures`, `fitFirst` takes a writer, `fitsBox`), `src/board-bays.ts` (`fitSubs`), `src/board-row.ts` (the info line)
- Modify: `src/board.css` (`.board-bay-sub`, `.board-row-info`, `.board-fig`, the trouble lines)
- Test: `src/board-dom.test.ts`, `src/board-bays.test.ts`, `src/board-row.test.ts`, `src/style.test.ts`

**Interfaces (produced):**

- `figureRuns(text: string): readonly { readonly text: string; readonly figure: boolean }[]`: a figure is an optional `+` or `×`, digits with `.`, `,` or `:` between them, an optional `K`, `M`, `B` or `T`, an optional `%` and an optional `/s`.
- `writeFigures(target: HTMLElement, text: string): void`: `write`, with each figure in `b.board-fig`. Writes only when the text or the markup differs.
- `fitFirst(target, options, fits = fitsWidth, put = write)`.
- `fitsBox(box)`: `fitsWidth` and no taller than its box.

- [ ] **Step 1: failing tests.** `figureRuns("+28/s · 1 worker")` is `+28/s`, `·`, `1`, ` worker`; `"Away pay 30% to 37.5%."` keeps the last `.` out of the figure; `"Crew ×2 for 30 min. 1,172/s."`, `"Opens at 574.3M stones"`, `"8:58"`, a line without digits is one run. `writeFigures` keeps `textContent`, makes one `b.board-fig` per figure, and does not touch the DOM when called again. A bay's sub and a row's info hold `b.board-fig`; a row's why and need do not. Style: `.board-fig` is 700 in `--board-ink-bare`; `.board-bay-sub` and `.board-row-info` are `--board-ink-2` with the board's weight; a troubled bay's sub and a trouble row's info keep `--board-ink` and semi-bold.
- [ ] **Step 2:** run them, see them fail.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the test files, then `npm run gate -- fast`.
- [ ] **Step 5: see it.** `VISUAL_ONLY='bays and ready'`, `VISUAL_ONLY='keys and drawers'`, `VISUAL_ONLY='section 2'`; `npm run play` on `mid`, `fleet`, `heart` and each drawer.
- [ ] **Step 6:** commit `Numbers stand out in a line (#506)`.

### Task 2: A Buys row shows its payoff

**Files:**

- Modify: `src/milestones.ts` (`nextMark`), `src/buys-rows.ts` (`milestoneOptions`, `buyFlag`), `src/board-row.ts` (the info line's room), `src/board.css` (`.board-row-info.is-roomy`)
- Test: `src/milestones.test.ts`, `src/buys-rows.test.ts`, `src/board-row.test.ts`, `src/style.test.ts`, the screen tests that pin the old lines, `scripts/visual/drawers.mjs`
- Docs: `docs/DESIGN.md` (the milestone paragraph and the drawer row's lines), `docs/ART.md` (the type paragraph), `docs/ui-audit.md` and its shots

**Interfaces (produced):**

- `nextMark(id, count, format, table = MILESTONES): { readonly progress: string; readonly payoff: string } | undefined`: `5 of 10` and the goal's last sentence; undefined past the last mark and for a tier without marks.
- `MARK_SHORT = "Twice as fast"`.
- A Buys row's info options: `[progress · payoff, progress · Twice as fast, progress]`; past the last mark `[REACHED_LINE]`; a tier without marks as today.
- A Buys row's flag: `Ada +86/s`, then `+86/s`; with the pick `Ready now · Ada +86/s`, then `Ready now`.

- [ ] **Step 1: failing tests.** Every goal in `MILESTONES` has a payoff that says `wice as fast` and is not the whole goal. `nextMark("cart", 5, String)` is `{ progress: "5 of 10", payoff: "Every cart hauls twice as fast." }`; `nextMark("cart", 120, String).payoff` is `Twice as fast again.`; undefined at 200 carts and for the kid. The Buys options and flags above. A row with no need and no why marks its info `is-roomy`; with either it does not; a Done hold keeps the mark of the row as shown; the mark changing fits the line again. Style: `.board-row-info.is-roomy` wraps and clamps at two lines.
- [ ] **Step 2:** run them, see them fail.
- [ ] **Step 3:** implement. `milestoneLine` stays for the bays.
- [ ] **Step 4:** the test files, then `npm run gate -- fast`.
- [ ] **Step 5: see it.** A new check in the drawers' visual section: on the `mid`, `fleet` and `heart` saves no Buys row's info or flag is cut. `npm run play` on `mid`, `fleet`, `heart`, `short` with Buys open, and the Ledger, Workshop, Upgrades and Engineers drawers for the two-line rule.
- [ ] **Step 6:** docs, `npm run audit:ui`, commit `A Buys row shows its milestone's payoff whole (#506)`.

## Rulings while building

- The scene-setting sentence of a goal (`Ten carts on the rails.`) is no longer shown: the approved sheet shows the payoff alone, and a row has no fourth line. The issue said it stays on a milestone card, but there is no such card. Flemming is told in the PR and the merge report.
- The short payoff `Twice as fast` is new wording for a row with a need line; it says what every mark's payoff says.
