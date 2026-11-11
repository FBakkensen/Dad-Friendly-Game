# Strict function limits (#422) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `functions` gate step fails any function in non-test `src` over 150 lines or a cognitive complexity of 15, with no ceiling list and no exceptions.

**Architecture:** The ratchet becomes a plain limit check. `src/function-ratchet.ts` becomes `src/function-limits.ts` and keeps the measuring (`measureFunctions`, `complexityValues`, `isMeasured`, `LINES`, `COMPLEXITY`). The ceiling judge, the list parser and the base reader are replaced by `overLimit` and `overLine`. `complexityLinter()` moves the ESLint setup out of the script, so the script and the test score complexity the same way. `scripts/function-ratchet.mjs` becomes `scripts/function-limits.mjs`, with no lists, no git base and no `--print`.

**Tech Stack:** TypeScript, Node, ESLint with eslint-plugin-sonarjs, Vitest.

**Spec:** issue #422. Its "Done when" is binding: both lists are empty before this PR and deleted by it; a test and an end-to-end proof show the gate failing on a 151-line function and on a complexity-16 function; the full gate is green.

## Global Constraints

- Limits: 150 lines and cognitive complexity 15, as today (`LINES.limit`, `COMPLEXITY.limit`).
- No allow-list, no ceiling file, no environment variable that relaxes the check.
- `src/function-limits.ts` keeps its 100/100/100/100 coverage floor.
- `dad-friendly-work.md` and `docs/ARCHITECTURE.md` drop every mention of ceilings.
- Commit messages are a plain sentence ending ` (#422)`, with the session's trailers.

## Review Focus

1. Two functions with one id (the same name in sibling blocks): reported once, at the higher value.
2. A function at exactly the limit passes; one over fails.
3. A file that is deleted but not committed is skipped, as today.
4. The complexity score comes from the same ESLint setup in the gate and in the test.

---

### Task 1: The strict check

**Files:** rename `src/function-ratchet.ts` → `src/function-limits.ts` and its test, `scripts/function-ratchet.mjs` → `scripts/function-limits.mjs`; modify `src/gate.ts`, `src/gate.test.ts`, `package.json`, `vite.config.ts`; delete `scripts/function-ceilings.json`, `scripts/complexity-ceilings.json`.

- [ ] Tests in `function-limits.test.ts`: `overLimit` lists a 151-line function and passes a 150-line one, measured by `measureFunctions` from generated source; a complexity-16 function fails and a complexity-15 one passes, scored by `complexityLinter().lintText`; a duplicated id is reported once at its higher value; `overLine` words both measures.
- [ ] `overLimit(values: readonly MeasuredValue[], measure: Measure): readonly MeasuredValue[]` (highest value per id, over the limit, sorted by id) and `overLine(over: MeasuredValue, measure: Measure): string` (`"<id> is 151 lines; the limit is 150 lines. Split it."`).
- [ ] The script prints one line per measure, fails on any `overLimit` result, and reads no list.
- [ ] Prove it: the test file, then a real `npm run functions` and `npm run gate -- fast` with a 151-line function and a complexity-16 function in a scratch `src` file (both FAIL lines recorded for the PR), then deleted.

### Task 2: Docs and ship

- [ ] `dad-friendly-work.md` and `docs/ARCHITECTURE.md`: the limits are absolute; no ceilings.
- [ ] `npm run gate -- full`, then ship (ship-sitting).
