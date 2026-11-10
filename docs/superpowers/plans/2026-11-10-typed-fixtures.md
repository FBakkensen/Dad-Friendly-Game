# Typed save fixtures for the browser scripts (H1b, #439) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every save the browser scripts seed comes from one typed module, `tools/browser/fixtures.ts`. That covers `fixtures.mjs`'s 19 exports, the visual check's six inline builders, ui-audit's `late` and `quietCrew`, and play's inline `SAVES`. `scripts/fixtures.mjs` is deleted. Nothing any script seeds or checks changes.

**Architecture:**

- `tools/browser/fixtures.ts` sits beside the harness, under the tools tsconfig, so `typecheck:tools`, lint and knip cover it.
- Plain node can't import most `src` modules at runtime, because their imports have no extensions. The fixtures therefore take **types only** from `src` (`import type`, erased by node).
- The one rule they restate, the first-engineer grant (`withCurrentEngineer` against `grantFirstEngineer` in `src/engineers.ts:132`), is pinned by a Vitest case.
- Seeds are typed as a `SeedSave` union:
  - the legacy v4 and v5 shapes, which have no exported type today, with `Partial<Mountain>`;
  - `MountainSaveV6` and `MountainSaveV7` from `src/persist.ts:51,59`.

**Tech Stack:** Node 24 type stripping, TypeScript under `tools/tsconfig.json`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part E, and issue #439. The issue's "Done when" is binding. The map is in the session scratchpad (`h-map.md` §1c–1d) and is not committed.

## Global Constraints

- **Values must not change.**
  - Every builder returns the same value it returns today, field for field, including the `Date.now()`-relative fields and `CREW`'s import-time `Date.now()`.
  - Move bodies verbatim. Types are added, and logic is not.
  - If a builder's value can't be typed without changing it, type it as the nearest honest shape and record that as a ruling. The value itself never changes.
- **Done-when grep.** No `version: N` save literal is left in `scripts/`: `grep -rnE "version: ?[0-9]" scripts/` finds none that is a save.
- **The first-engineer rule.** Keep `withCurrentEngineer` local to the fixtures. A Vitest case in `tools/browser/fixtures.test.ts` pins it against `grantFirstEngineer` on the inputs the fixtures use. The map notes the two differ on `engineers: []`: the fixtures check `!== undefined`, and src checks `length > 0`. Record which input each fixture actually passes, and pin that the outputs agree on those inputs.
- **Baselines.**
  - The visual check's ok-label set comes from main's last gate run, at `bdcd636`. It is stored in `/tmp/claude-0/-workspace-Dad-Friendly-Game/5abd6efc-a118-5eb9-84c3-d46801b70196/scratchpad/h1b-baseline/visual-ok.txt`: 632 labels and 2,172 ok lines.
  - Compare with `grep '^ok' | sed 's/[0-9]//g; s/(-ms)/(ms)/' | sort -u`. The sign of a measured time is noise.
  - Take `play` and `audit:ui` baselines in Task 1, before any change.
- **Harness rules from H1a stay.**
  - The harness imports no fixtures. The fixtures may import harness constants, such as `SAVE_KEY`.
  - Each script keeps its `openScreen`/`openAuditPage`/`open` call shape.
  - Never run two browser scripts at once.
  - Never edit `scripts/` or `src/` while one runs.
  - `audit:ui` rewrites the tracked PNGs in `docs/ui-audit/`. Restore them with `git checkout -- docs/ui-audit/` after every run.
- **Gate.**
  - Every function stays at 150 lines or under and complexity 15 or under; this applies to `tools/` too, so check with `npm run functions`. No ceiling entry is added.
  - Each task runs `npm run gate -- fast`, `npx knip`, `npm run functions` and `npm run cycles` before committing, and checks their exit status.
- Commit messages are a plain sentence ending ` (#439)`.

## Review Focus

1. **Time-relative fields.** `CREW.boosts` reads `Date.now()` when the module is imported; other builders read it when called. Moving `CREW` must keep it import-time. A visual section that expects running boosts depends on this.
2. **A builder that mutates a shared object.** For example, `withCurrentEngineer` or `workshopSave` might mutate its input. If it does today, the typed version must too.
3. **Legacy v4 and v5 saves** go through the game's migration. A typed shape that silently drops a field would change what the game loads. Compare `JSON.stringify` of every builder before and after (Task 1 Step 2).
4. **Play's inline `SAVES`** are listed by `--help`, and their names and order are user-facing. Both stay.

---

### Task 1: The typed module, with `fixtures.mjs`'s content and a pin of every value

**Files:**

- Create: `tools/browser/fixtures.ts`, `tools/browser/fixtures.test.ts`
- Modify: `scripts/visual-check.mjs`, `scripts/ui-audit.mjs`, `scripts/play.mjs` (imports only)
- Delete: `scripts/fixtures.mjs`

**Interfaces:**

- Produces in `fixtures.ts`:
  - every export of today's `fixtures.mjs`, with the same names and signatures: `CREW`, `seedJson`, `workshopSave`, `freshMountain` … `machinePickMountain`, and the `SAVE_KEY` re-export;
  - the types `LegacySeed` (the v4/v5 shapes the fixtures use) and `SeedSave = LegacySeed | MountainSaveV6 | MountainSaveV7`.
- [ ] **Step 1: Baselines, before any change.** Save each under the scratchpad, at `…/h1b-baseline/`:
  - run `npm run play` on every save that `--help` lists, then restore nothing;
  - run `npm run audit:ui`, then `git checkout -- docs/ui-audit/`.
- [ ] **Step 2: Write the value pin first.**
  - Write a one-off script that imports today's `scripts/fixtures.mjs` and writes `JSON.stringify` of every export to the scratchpad. Call each function with the arguments its callers use, and freeze `Date.now` to a fixed value while it runs.
  - In `tools/browser/fixtures.test.ts`, add a test with `vi.setSystemTime(<that value>)` that builds the same values from `fixtures.ts` and compares them with the stored JSON, inlined as a literal.
  - Add the first-engineer pin.
  - Run the test and expect it to FAIL, because the module is missing.
- [ ] **Step 3:** Move the content verbatim into `fixtures.ts`, typed. Point the three scripts' imports at `../tools/browser/fixtures.ts` and delete `scripts/fixtures.mjs`. Run the test and expect it to PASS.
- [ ] **Step 4:** Run `VISUAL_ONLY='^(section 1 |section 23|board |keys and drawers)' npm run visual`, `npm run play` on three saves (early, mid and crew) and the per-task checks.
- [ ] **Step 5: Commit** "The browser scripts' saves come from one typed fixtures module (#439)".

### Task 2: The visual check's six builders join the fixtures

**Files:**

- Modify: `tools/browser/fixtures.ts`, `tools/browser/fixtures.test.ts`, `scripts/visual-check.mjs`

**Interfaces:**

- Produces: these six builders, verbatim and typed, with their exact signatures: `noticeSave`, `crewSave`, `effectSave`, `guardSave`, `overtimeSave`, `borerPickMountain`. They are at visual-check about lines 2310, 3162, 3397, 3569, 3663 and 5878; find them by name. Also move any other inline `mountain: {` or `version: N` save literal in visual-check, so the done-when grep is clean for visual.
- [ ] **Step 1:** Extend the value pin to the six builders, called with the arguments their call sites use. Freeze the clock and store their JSON from today's code. Expect FAIL.
- [ ] **Step 2:** Move them and import them in visual. Expect PASS.
- [ ] **Step 3:** Run the full `npm run visual` and compare the ok-label set with the baseline. Expect it to be equal. Then run the per-task checks.
- [ ] **Step 4: Commit** "The visual check's own save builders move into the typed fixtures (#439)".

### Task 3: ui-audit's and play's inline saves join the fixtures

**Files:**

- Modify: `tools/browser/fixtures.ts`, `tools/browser/fixtures.test.ts`, `scripts/ui-audit.mjs`, `scripts/play.mjs`, `.claude/skills/hill-climb/SKILL.md` (it names `scripts/fixtures.mjs`), `tools/browser/harness.ts`'s `SAVE_KEY` comment

**Interfaces:**

- Produces:
  - ui-audit's `late()` and `quietCrew()`;
  - play's inline save values. play's `SAVES` table keeps its names, order and `--help` text in `play.mjs`, and its values come from the fixtures.
- [ ] **Step 1:** Extend the value pin to these, with the clock frozen and their JSON stored from today's code. Expect FAIL.
- [ ] **Step 2:** Move them. Expect PASS.
- [ ] **Step 3:** Run the done-when grep: `grep -rnE "version: ?[0-9]" scripts/` finds no save literal.
- [ ] **Step 4:** Run `npm run play` on every save and compare against the Task 1 baselines (exit codes, page errors, and the save line apart from time-moving numbers). Run `npm run audit:ui`, compare its log, then `git checkout -- docs/ui-audit/`. Then run the per-task checks.
- [ ] **Step 5: Commit** "The UI audit's and play's saves come from the typed fixtures, and fixtures.mjs is gone (#439)".

### Task 4: Docs and proof (controller)

- [ ] Add one clause to the browser-harness bullet in `docs/ARCHITECTURE.md`: the saves come from `tools/browser/fixtures.ts`, typed as `SeedSave`.
- [ ] Run `npm run mockups`, then the full gate, the final review and the PR, through ship-sitting.
