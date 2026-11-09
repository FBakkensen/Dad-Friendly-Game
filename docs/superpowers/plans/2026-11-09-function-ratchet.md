# Function-length ratchet (#408) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the gate fails when a function in non-test `src` grows past 150 lines without a ceiling, or past its ceiling. Ceilings only go down. The rules ask plans to name a shared module, and reviews to look for copies across the codebase.

**Architecture:**

- A pure module, `src/function-length.ts`, measures every function in a source file with the TypeScript compiler API and judges the measurements against a ceiling list.
- A script, `scripts/function-length.mjs`, feeds it every non-test `src` file, plus the ceilings in `scripts/function-ceilings.json` and the copy of that file on `origin/main`.
- A `functions` step runs the script in both gate tiers.

**Tech Stack:** TypeScript (the `typescript` package already in devDependencies), Vitest, Node.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part F ("It doesn't grow back") and sliver 1 (G).

## Global Constraints

- The limit is 150 lines, counted from a function's first line to its last, inclusive.
- Scope: every `.ts` file under `src/` except `*.test.ts` and `*.harness.ts`. That includes `src/lab/` and `src/economy/`.
- Every function-like node counts, nested ones included: function declarations and expressions, arrow functions, methods, accessors and constructors. Moving code into a nested arrow must not escape the check.
- Ceilings only go down. Against `origin/main`'s ceiling file, a ceiling may not rise and no new id may appear. When `origin/main` has no ceiling file yet (this PR), there's nothing to compare.
- The ceiling list stays exact:
  - a ceiling above a function's length must be lowered to that length;
  - a ceiling for a function that's gone, or now at or under the limit, must be removed.
- `src/function-length.ts` gets a 100% coverage floor in `vite.config.ts`.
- No new dependency.
- Commit messages are plain sentences ending `(#408)`, with the session trailers.

## Review Focus

1. A function that is renamed, or that moves into an anonymous callback, has a new id with no ceiling, so it fails as too long if it's over 150. Task 2 has a test for this.
2. Anonymous functions get stable ids: the same source gives the same ids, and adding an unrelated named function elsewhere doesn't change them. Task 1 has a test for this.
3. A file that doesn't parse cleanly, such as one with a syntax error, still measures what it can and never crashes the script. Task 1 has a test for this.
4. A missing `origin/main` ceiling file reads as no base, while an unreadable or corrupt base fails loudly rather than letting anything through. Task 3 has a test for this.
5. Test files and harnesses are skipped, but a non-test file whose name merely contains "test" is measured. Task 3 has a test for this.

---

### Task 1: Measure every function in a file

**Files:**

- Create: `src/function-length.ts`, `src/function-length.test.ts`
- Modify: `vite.config.ts`, adding a 100% coverage floor for `src/function-length.ts`.

**Interfaces:**

- Produces `FUNCTION_LIMIT = 150`.
- Produces `interface FunctionSpan { readonly id: string; readonly line: number; readonly lines: number }`.
- Produces `measureFunctions(path: string, source: string): readonly FunctionSpan[]`, one span per function-like node, in source order.
  - **id:** `${path}#${chain}`, where `chain` is the names of the enclosing function-like nodes and then its own, joined by `>`.
  - **A node's name:**
    - the declaration's name, if it has one;
    - else the name of the variable, property assignment or class property it's assigned to;
    - else `(anonymous N)`, where N counts anonymous function-like nodes under the same enclosing function, 1-based, in source order.
  - **line:** the 1-based line of its first token. **lines:** last line minus first line, plus 1.

- [ ] **Step 1: Write the failing tests** in `describe("measureFunctions")`:
  - `it("measures declarations, arrows, methods and constructors with their line counts")`: a source with `function a() {…}` over 3 lines, `const b = () => {…}`, `class C { constructor() {} m() {} get g() { return 1; } }`. Assert the ids `p.ts#a`, `p.ts#b`, `p.ts#C.constructor`… (builder's choice of class-member naming: `C.m`, `C.constructor`, `C.g`) and their line counts.
  - `it("names nested functions by their chain")`: `function outer() { const inner = () => { return () => 1; }; }` gives `p.ts#outer`, `p.ts#outer>inner` and `p.ts#outer>inner>(anonymous 1)`.
  - `it("keeps anonymous ids stable when an unrelated named function is added")`: the same `outer` with an extra top-level `function z() {}` before it gives the same ids for `outer`'s children.
  - `it("names a callback passed as an argument (anonymous N) under its parent")`: `function f() { list.map(() => 1); list.map(() => 2); }` gives `p.ts#f>(anonymous 1)` and `p.ts#f>(anonymous 2)`.
  - `it("measures what it can in a file with a syntax error and never throws")`.
- [ ] **Step 2:** Run `npx vitest run src/function-length.test.ts`. Expected: FAIL, the module is not found.
- [ ] **Step 3:** Implement it with `ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)` and a recursive walk, then add the coverage floor.
- [ ] **Step 4:** Run `npx vitest run src/function-length.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `The ratchet measures every function in a file, nested and anonymous ones included (#408)`.

### Task 2: Judge the measurements against the ceilings

**Files:**

- Modify: `src/function-length.ts`, `src/function-length.test.ts`.

**Interfaces:**

- Consumes `FunctionSpan` and `FUNCTION_LIMIT` (Task 1).
- Produces `type Ceilings = Readonly<Record<string, number>>`.
- Produces `type LengthProblem`, a closed union:
  - `{ kind: "too-long"; id; lines }`: over the limit with no ceiling.
  - `{ kind: "grew"; id; lines; ceiling }`: over its ceiling.
  - `{ kind: "lower"; id; lines; ceiling }`: still over the limit, but its ceiling is above its length.
  - `{ kind: "remove"; id; ceiling }`: the id is gone, or now at or under the limit.
  - `{ kind: "raised"; id; ceiling; was }`: above `base[id]`.
  - `{ kind: "added"; id; ceiling }`: not in `base`, when a base is given.
- Produces `judgeLengths({ spans, ceilings, base }: { spans: readonly FunctionSpan[]; ceilings: Ceilings; base: Ceilings | undefined }): readonly LengthProblem[]`, sorted by id then kind.
- Produces `problemLine(problem: LengthProblem): string`, one line each. For example:
  - `src/a.ts#f is 151 lines; the limit is 150. Split it.`
  - `src/a.ts#f grew to 210 lines; its ceiling is 200. Split it.`
  - `src/a.ts#f is 180 lines; lower its ceiling from 200 to 180.`
  - `src/a.ts#f is gone or under 150 lines; remove its ceiling.`
  - `src/a.ts#f's ceiling rose from 200 to 210; ceilings only go down.`
  - `src/a.ts#f has a new ceiling; new functions stay under 150 lines.`

- [ ] **Step 1: Write the failing tests**, one per kind:
  - one test per problem kind, with its line asserted;
  - `it("passes a function of exactly 150 lines, and one at its ceiling")`;
  - `it("a renamed long function fails as too long, and its old ceiling must go")`, which covers Review Focus 1;
  - `it("with no base, ceilings are not compared")`.
- [ ] **Step 2:** Run `npx vitest run src/function-length.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx vitest run src/function-length.test.ts` and check coverage. Expected: PASS, with 100% coverage of `src/function-length.ts`.
- [ ] **Step 5:** Commit: `The ratchet judges each function against its ceiling, and a ceiling only goes down (#408)`.

### Task 3: The script, the ceiling list, and the gate step

**Files:**

- Create: `scripts/function-length.mjs`, `scripts/function-ceilings.json`.
- Modify: `src/gate.ts` and `src/gate.test.ts`, adding a `functions` step to both tiers. Also `package.json`, adding a `"functions": "node scripts/function-length.mjs"` script.

**Interfaces:**

- Consumes `measureFunctions`, `judgeLengths`, `problemLine` and `FUNCTION_LIMIT`.
- Produces `isMeasured(path: string): boolean` in `src/function-length.ts`: true for `src/**/*.ts` except `*.test.ts` and `*.harness.ts`.
- Produces `parseCeilings(text: string): Ceilings`, which throws on anything but an object of positive integers.
- Script behaviour:
  1. It lists `git ls-files src` filtered by `isMeasured`, measures each file, and reads `scripts/function-ceilings.json`.
  2. It reads the base with `git show <base>:scripts/function-ceilings.json`, where `<base>` is `FUNCTION_BASE` or, by default, `origin/main`. A missing path means no base. Any other git error, or a base that fails `parseCeilings`, fails the script.
  3. It prints one `problemLine` per problem and exits 1, or prints `Function lengths passed (N over 150, all at their ceilings).` and exits 0.
  4. `--print` prints the JSON of every function over the limit, as `{ id: lines }` sorted by id, to seed or check the list, and exits 0.

- [ ] **Step 1: Write the failing tests**:
  - `describe("isMeasured")` covers `src/a.ts`, `src/lab/x.ts`, `src/a.test.ts`, `src/a.sim.test.ts`, `src/mountain-screen.harness.ts`, `src/latest.ts` (measured: "test" inside a name), `scripts/a.mjs` and `docs/a.md`.
  - `describe("parseCeilings")` covers a valid object, `"[]"`, `{"a":0}`, `{"a":1.5}`, `{"a":"2"}` and bad JSON.
  - `gateSteps`: fast and full both contain a `functions` step running `node scripts/function-length.mjs`, with no dependencies.

  Update the existing exact-list tests to include `functions`.

- [ ] **Step 2:** Run `npx vitest run src/function-length.test.ts src/gate.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement them. Seed the list with `node scripts/function-length.mjs --print > scripts/function-ceilings.json`, then check it against the audit: about 14 functions of 200+ lines, plus the 150–199 ones. Add the step to `gateSteps` in both tiers.
- [ ] **Step 4:** Run `npx vitest run src/function-length.test.ts src/gate.test.ts`, `npm run functions` and `npm run gate -- fast`. Expected: all pass, and `npm run functions` prints the passed line.
- [ ] **Step 5:** Prove the ratchet end to end, then revert each change:
  1. A scratch 151-line function in `src/scratch-ratchet.ts` gives `FAIL functions` with the too-long line.
  2. Adding 2 lines inside `createProgressStore` gives the "grew" line.
  3. With the seeded list committed, raising one ceiling in the working copy and running `FUNCTION_BASE=HEAD npm run functions` gives the "raised" line.
- [ ] **Step 6:** Commit: `The gate fails when a function grows past 150 lines or past its ceiling (#408)`.

### Task 4: The rules and the stale docs

**Files:**

- Modify: `.claude/rules/superpowers.md`, `.claude/rules/dad-friendly-work.md`, `.claude/skills/ship-sitting/SKILL.md`, `docs/ARCHITECTURE.md`.

- [ ] **Step 1:** In `superpowers.md` under "Where we differ", add: a plan names the shared module each new behaviour goes into, and says why if it needs a new one; a mechanism that already exists is extended, never copied.
- [ ] **Step 2:** In `dad-friendly-work.md` under "Done means proven", add one line on the ratchet:
  - no function over 150 lines;
  - the large functions listed in `scripts/function-ceilings.json` may only shrink;
  - a PR that shrinks one lowers its ceiling;
  - never raise or add a ceiling.
- [ ] **Step 3:** In `ship-sitting/SKILL.md` under Review, add: the review brief asks the reviewer to search the codebase, not only the diff, for an existing mechanism the change copies or should have used.
- [ ] **Step 4:** In `docs/ARCHITECTURE.md`:
  - add the `functions` step to the gate's list;
  - fix the stale "now ~460 lines" for `mountain-screen.ts`, which is about 1,283 lines with its function at 1,146;
  - break the longest single-line paragraphs into lines, wording unchanged.
- [ ] **Step 5:** Run `npm run gate -- fast`, then commit: `Plans name the shared module, reviews look for copies across the codebase, and the docs match the code (#408)`.

### Task 5: Prove it

- [ ] **Step 1:** `npm run gate -- full`, in the background, once. Expected: every step passes, `functions` included.
- [ ] **Step 2:** In the PR body, note the seeded ceiling count and the largest ceiling.
