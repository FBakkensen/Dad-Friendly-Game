# Readable figures (#505) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every price plate and every rate or effect line on the board and in the drawers is bigger, bolder and brighter, with no copy, layout or markup change.

**Architecture:** Style only. The rules that already own each line in `src/board.css` change their size, weight, colour and face; two new leads go in `src/tokens.css`. No new module: `board.css` is the one sheet (#376) and `style.test.ts` already pins its rules.

**Tech Stack:** CSS custom properties, Vitest (`src/style.test.ts`), the visual check, `npm run play`.

**Spec:** issue #505 (items 1 and 2 of the readability list, parent #504). Flemming approved the list and its before/after sheets on 2026-11-12; there is no separate spec.

## Global Constraints

- No raw px or colour in `board.css`: sizes and leads are tokens in `src/tokens.css` (`npm run tokens`).
- The phone layout never scrolls, and no row grows: a bay stays 62px (`--bay-h`), a drawer row 76px (`--row-h`).
- Copy, markup and the fit options (`bayLines`, `milestoneOptions`) do not change. A line that no longer fits falls back the way it does today.
- Share Tech Mono stays on the instruments (odometer drums, flaps, gauge, crew count, dial, timers at 15px and up outside a plate). Small figures on a plate or in a row use Barlow Condensed 700 with tabular figures.
- Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test file, `npm run gate -- fast`, the visual sections that cover the bays and the drawers plus `npm run play`, then `npm run gate -- full` once before the PR.

## Review Focus

- A three-flap bay (120 carts, the `fleet` save) has a 100px text column: its line must still fit or fall back to the gain alone, never clip.
- A drawer row with three lines (name, info, why or need) must stay inside the frame's face at 76px.
- A ticking figure on a plate (a running boost's `10:00`, the bench timer) must not change width as it counts: tabular figures.
- The Ready now plate's second line (`+28/s · 5 free workers can run it`) must fit its plate at 15px or fall back as it does today.
- `Locked` and `Owned` on a plate take the same face as a price and must fit the plate.

---

### Task 1: Prices and data lines

**Files:**

- Modify: `src/tokens.css` (the bay and drawer-row token blocks)
- Modify: `src/board.css` (`.board-bay-sub`, `.board-bay-tag`, `.board-ready-why`, `.board-row-info`, `.board-row-need`, `.board-row-gain`, `.board-row-tag`)
- Test: `src/style.test.ts`
- Docs: `docs/ART.md` (the type paragraph), `docs/ui-audit.md` if a row's wording names a size

- [ ] **Step 1: Write the failing tests** in `src/style.test.ts`, in `describe("board.css")`, with a local `rule(selector)` helper like the one in the #455 test:

```ts
it("prints prices in bold 17px Barlow on their plates (#505)", () => {
  for (const tag of [
    ".board-bay-tag,\n.board-bay-tag.board-skinned",
    ".board-row-tag,\n.board-row-tag.board-skinned",
  ]) {
    expect(rule(tag)).toMatch(/font-family:\s*"Barlow Condensed"/);
    expect(rule(tag)).toMatch(/font-size:\s*var\(--board-type-17\)/);
    expect(rule(tag)).toMatch(/font-weight:\s*700/);
    expect(rule(tag)).toMatch(/font-variant-numeric:\s*tabular-nums/);
  }
});

it("sets the rate and effect lines at 15px, semi-bold, in the bright ink (#505)", () => {
  expect(rule(".board-bay-sub")).toMatch(/font-size:\s*var\(--board-type-15\)/);
  expect(rule(".board-bay-sub")).toMatch(/color:\s*var\(--board-ink\)/);
  expect(rule(".board-row-info")).toMatch(/color:\s*var\(--board-ink\)/);
  expect(rule(".board-row-info,\n.board-row-need")).toMatch(
    /font-size:\s*var\(--board-type-15\)/,
  );
  expect(rule(".board-row-info,\n.board-row-need")).toMatch(
    /font-weight:\s*var\(--board-weight-semi\)/,
  );
  expect(rule(".board-ready-why")).toMatch(
    /font-size:\s*var\(--board-type-15\)/,
  );
  expect(rule(".board-ready-why")).toMatch(/font-weight:\s*700/);
  expect(rule(".board-row-gain")).toMatch(/font-family:\s*"Barlow Condensed"/);
  expect(rule(".board-row-gain")).toMatch(/font-weight:\s*700/);
});
```

- [ ] **Step 2:** `npx vitest run src/style.test.ts`. Expected: the two new tests fail.
- [ ] **Step 3: Implement.** Tokens: `--board-bay-sub-lead: 17px` (was 15px), new `--board-row-info-lead: 17px`. Rules: the plate text takes the face on `.board-bay-tag` and `.board-row-tag` (the inner `.board-num` span must not win: give the span rules `font-family: inherit`). `.board-row-why` keeps 13px and `--board-ink-2`, so the flavour line stays quiet. `.board-row-gain` takes `--board-ink-bare`.
- [ ] **Step 4:** `npx vitest run src/style.test.ts`, then `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5: See it.** `VISUAL_ONLY` on the bay, Ready row and drawer-row sections, and `npm run play` on `mid`, `fleet`, `heart`, `workshop`, `tools`, `posts` and `short` with each drawer open. Read the phone shots against the Review Focus list. Fix a check that pinned the old size in this task.
- [ ] **Step 6: Docs and commit.** `docs/ART.md`: Share Tech Mono is for the instruments, Barlow Condensed 700 for figures on a plate or in a row. Commit `Prices and rate lines are bigger, bolder and brighter (#505)`.

## Rulings while building

- A row's gain is 16px bold, not 17px: at 17px the Great Machine's name clipped by 4px in the fallback-font fit check (section 2, tier cards, `+134.4K/s`).
- Ready now's second line stays 13px and turns bold in the plate's full ink. Its reason is worded to fit the 176px plate at 13px; at 15px every reason with a three-digit gain fell back to the gain alone.
- After the review: a troubled three-flap bay keeps its shout at 13px (`Cave-in! · Hold to fix` has no shorter wording and was cut at 15px in the 100px column); the visual check now covers it.
- After the review: a post's sentence on an engineer's page stays 13px and quiet. It is prose about her, not a figure, and at 15px it was cut sooner.
- After the review: a row's gain takes tabular figures, and the no-op `font-family: inherit` on the bay's price text is gone.
