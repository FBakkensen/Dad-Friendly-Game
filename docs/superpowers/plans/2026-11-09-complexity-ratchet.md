# Cognitive-complexity ratchet (#418) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the gate fails when a function in non-test `src` has a cognitive complexity over 15 without a ceiling, or rises past its ceiling, using the same ratchet as function length (#408).

**Architecture:**

- `src/function-length.ts` becomes `src/function-ratchet.ts`. Its judge is generalized over a measure (lines, or complexity), and each measured function also carries its head: the span from its first token to its body.
- A new pure function maps ESLint reports to function ids by those heads. The score comes from `eslint-plugin-sonarjs`'s `sonarjs/cognitive-complexity` rule, run through the ESLint Node API with no type information.
- `scripts/function-length.mjs` becomes `scripts/function-ratchet.mjs` and checks both measures, against `scripts/function-ceilings.json` and a new `scripts/complexity-ceilings.json`.

**Tech Stack:** TypeScript compiler API, ESLint 10 Node API, `eslint-plugin-sonarjs` ^4.2.2 (approved by Flemming on 9 Nov), Vitest.

**Spec:** issue #418, and part F of `docs/superpowers/specs/2026-11-09-architecture-design.md`.

**Shared module:** this extends `src/function-length.ts` (renamed) and its script, the existing ratchet. Nothing is copied.

## Global Constraints

- **Limit:** a cognitive complexity of 15, the plugin's default. The length limit stays at 150.
- **Same rules as lengths:** the same scope (`isMeasured`), the same ids, exact ceilings, no rise and no new ceiling against `origin/main`, and no anonymous ceilings.
- **Path:** `scripts/function-ceilings.json` keeps its name, so the length base comparison still works in this PR. The new complexity list has no base on `origin/main` yet, so it's seeded here.
- **Mapping:** a report must map to exactly one measured function. A report that maps to none, or a message the score can't be read from, fails the script loudly.
- **Coverage:** `src/function-ratchet.ts` keeps its 100% floor, now under its new name.
- **The gate step** stays named `functions`, in both tiers, now running `scripts/function-ratchet.mjs`.
- **Commits:** a plain sentence ending `(#418)`, with the session trailers.

## Review Focus

1. A nested function's report maps to the nested function, never to its parent, including an arrow whose head spans several lines. Task 2 has a test for this.
2. A plugin update that changes the report message must fail the check, not silently score 0. Task 2 has a test for this.
3. The length check's messages and behaviour are unchanged, apart from their wording, which now names the unit. Task 1 updates and keeps every length test.
4. A function over both limits gets two independent ceilings, and shrinking one doesn't touch the other. Task 3 has a test for this.
5. A complexity ceiling on an anonymous function is refused, as it is for lengths. Task 1 covers this through the shared judge.

---

### Task 1: Generalize the ratchet over a measure

**Files:**

- Rename: `src/function-length.ts` to `src/function-ratchet.ts`, and `src/function-length.test.ts` to `src/function-ratchet.test.ts`. Use `git mv`, and update the coverage floor key in `vite.config.ts`.
- Rename: `scripts/function-length.mjs` to `scripts/function-ratchet.mjs`, and update its import, the `package.json` `functions` script, and the `gateSteps` args and their test.

**Interfaces:**

- Produces `interface Measure { readonly limit: number; readonly unit: (value: number) => string; readonly fix: string }`.
  - `LINES: Measure = { limit: 150, unit: (n) => `${n} lines`, fix: "Split it." }`.
  - `COMPLEXITY: Measure = { limit: 15, unit: (n) => `complexity ${n}`, fix: "Simplify it." }`.
- Produces `judgeCeilings({ values, ceilings, base, measure }: { values: readonly { id: string; value: number }[]; ceilings: Ceilings; base: Ceilings | undefined; measure: Measure }): readonly CeilingProblem[]`. This replaces `judgeLengths`, with the same kinds and rules. The `lines` fields become `value`, and the `too-long` kind becomes `over`.
- Produces `problemLine(problem: CeilingProblem, measure: Measure): string`:
  - `X is 151 lines; the limit is 150 lines. Split it.`
  - `X grew to 210 lines; its ceiling is 200 lines. Split it.`
  - `X is 180 lines; lower its ceiling from 200 to 180.`
  - `X is gone or within the limit; remove its ceiling.`
  - `X's ceiling rose from 200 to 210; ceilings only go down.`
  - `X has a new ceiling; new functions stay within the limit.`
  - `X has no name to hold a ceiling; name it, or bring it within the limit.`
- `FunctionSpan` gains `head: { line, column, endLine, endColumn }`, 1-based like ESLint, running from the function's first token to the start of its body.
- `FUNCTION_LIMIT` is replaced by `LINES.limit`.

- [ ] **Step 1:** Rename the files, then rewrite the judge tests in terms of `judgeCeilings(…, measure: LINES)` with the new lines above. Add:
  - one test that runs the same judge with `COMPLEXITY`, checking the line `X is complexity 20; the limit is complexity 15. Simplify it.`;
  - one test that `measureFunctions` gives each function's head, for a declaration, a multi-line arrow, and a method.
- [ ] **Step 2:** Run `npx vitest run src/function-ratchet.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it. The head ends at `node.body.getStart()`; a function with no body (an overload) gets no head.
- [ ] **Step 4:** Run `npx vitest run src/function-ratchet.test.ts src/gate.test.ts` and `npm run functions`. Expected: PASS, and the length check still passes on today's list.
- [ ] **Step 5:** Commit: `The ratchet judges any measure, not only length, and knows each function's head (#418)`.

### Task 2: Map complexity reports to functions

**Files:**

- Modify: `src/function-ratchet.ts`, `src/function-ratchet.test.ts`.

**Interfaces:**

- Produces `interface Report { readonly line: number; readonly column: number; readonly message: string }`.
- Produces `complexityValues(spans: readonly FunctionSpan[], reports: readonly Report[]): readonly { id: string; value: number }[]`.
  - Each report maps to the span whose head contains its position. The score is read from the message with `/Cognitive Complexity from (\d+) to/`.
  - It throws when a report matches no head, or when a message doesn't carry a score.

- [ ] **Step 1: Write the failing tests:**
  - `it("gives each report to the function whose head holds it, nested ones included")`. Use real `measureFunctions` spans from a source with a declaration, a multi-line arrow, and an arrow nested in it. The reports sit at the name and at each `=>`, at the positions the plugin uses (probed: the name of a declaration or method, and the `=>` of an arrow).
  - `it("throws on a report outside every head, or a message with no score")`.
- [ ] **Step 2:** Run `npx vitest run src/function-ratchet.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx vitest run src/function-ratchet.test.ts`. Expected: PASS, with 100% coverage.
- [ ] **Step 5:** Commit: `Complexity reports map to the function whose head they name (#418)`.

### Task 3: Check both measures in the script, and seed the complexity list

**Files:**

- Modify: `scripts/function-ratchet.mjs`.
- Create: `scripts/complexity-ceilings.json`.
- Already done: `package.json` and the lock file have `eslint-plugin-sonarjs` as a devDependency.

**Interfaces:**

- The script runs `new ESLint({ overrideConfigFile: true, overrideConfig: [{ files: ["**/*.ts"], languageOptions: { parser: tseslint.parser }, plugins: { sonarjs }, rules: { "sonarjs/cognitive-complexity": ["error", 0] } }] })` over the measured files, and passes each file's messages to `complexityValues`.
- It judges lengths against `scripts/function-ceilings.json` with `LINES`, and complexity against `scripts/complexity-ceilings.json` with `COMPLEXITY`. Each has its own base, read from `origin/main` (or `FUNCTION_BASE`) through `baseFromShow`.
- It prints every problem from both checks, then exits 1. When both pass, it prints one line each:
  - `Function lengths passed (N over 150 lines, all at their ceilings).`
  - `Function complexity passed (M over complexity 15, all at their ceilings).`
- `--print lines` and `--print complexity` print each check's seed JSON.

- [ ] **Step 1: Write the failing test.** Add `it("judges a function over both limits by two ceilings that move apart")` in the test file: a function at 160 lines and complexity 20 passes with both ceilings. Shrinking it to complexity 18 asks only for the complexity ceiling to come down.
- [ ] **Step 2:** Run it. Expected: FAIL, unless Task 1's generic judge already covers it. In that case, write it as a passing guard and note that in the ledger.
- [ ] **Step 3:** Implement the script, seed `scripts/complexity-ceilings.json` with `node scripts/function-ratchet.mjs --print complexity`, and check the result against the probe. The expected count is in the dozens; any ceiling on an anonymous id must be resolved by naming that function before the seed is committed (as with `buildRow` in #408).
- [ ] **Step 4:** Run `npm run functions` and `npm run gate -- fast`. Expected: both pass. Run `node scripts/knip-strict.js`. Expected: clean.
- [ ] **Step 5:** Prove each failure end to end, then revert:
  1. A new function with complexity 16 gives the "is complexity 16" line.
  2. One extra nested `if` in a ceilinged function gives the "grew" line.
  3. A raised complexity ceiling, with `FUNCTION_BASE=HEAD` after the seed is committed, gives the "rose" line.
- [ ] **Step 6:** Commit: `The gate fails when a function's cognitive complexity passes 15 or its ceiling (#418)`.

### Task 4: Docs and the spec

- [ ] **Step 1:** In `.claude/rules/dad-friendly-work.md`, extend the ratchet line: no cognitive complexity over 15 either, and `scripts/complexity-ceilings.json` only shrinks.
- [ ] **Step 2:** In `docs/ARCHITECTURE.md`, update the ratchet bullet: the renamed files, both measures, and the plugin.
- [ ] **Step 3:** In the spec's slivers list, add G2 (#418) after G, with A1 now blocked by it.
- [ ] **Step 4:** Run `npm run gate -- fast`, then commit: `The docs and the spec describe the complexity ratchet (#418)`.

### Task 5: Prove it

- [ ] **Step 1:** Run `npm run gate -- full` once, in the background. Expected: every step passes.
- [ ] **Step 2:** In the PR body, give the seeded count, the highest ceiling, and the added time on the `functions` step.
