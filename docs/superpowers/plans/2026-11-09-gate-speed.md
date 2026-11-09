# Gate speed (#403) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The gate stops wasting time without checking less. Four changes:

- The fast tier checks formatting.
- The heavy steps never run at the same time.
- A lab step that already passed for the same inputs is reused.
- The verification ladder is written into the rules.

**Architecture:**

- The pure half, `src/gate.ts`, gains three things:
  - a `lane` on each step, which `nextMoves` honours;
  - a `reused` outcome;
  - the reuse key and record helpers.
- The runner, `scripts/gate.mjs`, hashes the lab's inputs, reads and writes the pass records under `.gate/reuse/`, and settles a reused step without spawning it.

**Tech Stack:** Node 24, TypeScript, Vitest, prettier.

**Spec:** the design approved in chat on 2026-11-09 and issue #403. Its points:

1. The fast gate runs `prettier --check` on every file changed since main.
2. The visual check, `lab` and `lab:generations` never overlap, with the visual check first.
3. A lab step is reused when a fingerprint of its inputs matches a stored green run. The inputs are the lab's import closure contents, `package-lock.json`, the Node version, and the step's command, args and env.
   - It prints `reused (same inputs passed on <sha>)`.
   - Signoff counts it as green.
   - CI starts with no records, so it always runs the labs.
4. The verification ladder goes into `.claude/rules/dad-friendly-work.md`, with a pointer in `CLAUDE.md`.

## Global Constraints

- `src/gate.ts` keeps its 100% coverage floor (vite.config.ts), and no floor is lowered.
- `src/gate.ts` stays pure: no `node:` imports. Hashing and file IO live in `scripts/gate.mjs`.
- No step is dropped from either tier, and no check is weakened.
- Commit messages are a plain sentence ending `(#403)`, with the session trailers.

## Review Focus

1. A reused step must never stand in for a step whose inputs changed. Any byte of any closure file, the lock file, the Node version, or the step's args or env changes the key. Owned by Task 3, which has a test per input.
2. A failed or skipped heavy step must not leave the lane blocked: the next heavy step starts, or is skipped, as its dependencies say. Owned by Task 2.
3. A corrupt or missing record file reads as no record, never as a pass. Owned by Task 3.
4. A step that depends on a reused step starts as if it had passed. Owned by Task 3.
5. The fast tier with no changed files of any kind adds no format step, so prettier never gets an empty file list and checks the whole tree. Owned by Task 1.

---

### Task 1: The fast tier checks formatting

**Files:**

- Modify: `src/gate.ts`: add `touchedFiles`, and give `gateSteps` a `touched` option and a `format:changed` step.
- Modify: `scripts/changed.mjs`: add `touchedSinceMain()`.
- Modify: `scripts/gate.mjs`: pass `touched`.
- Test: `src/gate.test.ts`.

**Interfaces:**

- Produces `touchedFiles(paths: readonly string[]): readonly string[]`: every path once, sorted, without build output (the `BUILT` pattern). Unlike `changedCode`, it keeps files of every kind.
- Produces `gateSteps(changed, { economy, touched })`, where `touched: readonly string[]` defaults to `[]`.
- Produces `touchedSinceMain(): readonly string[]` in `scripts/changed.mjs`: the same git sources as `changedSinceMain`, through `touchedFiles`, existing files only.

- [ ] **Step 1:** In `gateSteps`, write the tests:
  - `it("fast tier checks the format of every changed file, docs and styles too")`: with `touched: ["docs/a.md", "src/b.css", "src/c.ts"]`, the fast plan has a step named `format:changed`. Its command is `node_modules/.bin/prettier` and its args are `["--check", "--ignore-unknown", "docs/a.md", "src/b.css", "src/c.ts"]`, tier `fast` only.
  - `it("fast tier has no format step when nothing changed")`: with `touched: []`, there's no `format:changed`.
  - `it("full tier keeps its whole-tree format check and no format:changed")`.

  And `describe("touchedFiles")`: `["src/a.ts", "docs/b.md", "src/a.ts", "dist/x.js", "coverage/y.json"]` gives `["docs/b.md", "src/a.ts"]`.

- [ ] **Step 2:** Run `npx vitest run src/gate.test.ts` and see them fail.
- [ ] **Step 3:** Implement them, and wire `touched: touchedSinceMain()` into `scripts/gate.mjs` for both tiers.
- [ ] **Step 4:** Run `npx vitest run src/gate.test.ts` and see it pass. Prove it end to end:
  1. Add a misformatted line to a scratch copy of `docs/DESIGN.md`.
  2. Run `npm run gate -- fast` and see `FAIL  format:changed`.
  3. Revert, and see it pass.
- [ ] **Step 5:** Commit: `The fast gate checks the format of every changed file (#403)`.

### Task 2: The heavy steps take turns

**Files:**

- Modify: `src/gate.ts`: add `Step.lane`, set it for visual and the labs, and update `nextMoves`.
- Test: `src/gate.test.ts`, whose `step` helper gains `lane: "shared"`.

**Interfaces:**

- Produces `Step.lane: "shared" | "heavy"`. In `gateSteps`, `visual`, `lab` and `lab:generations` are `"heavy"`; every other step is `"shared"`.
- Produces `nextMoves`: a ready heavy step starts only when no heavy step is running and none has started in the same move. Shared steps are unaffected. Table order picks the first heavy step, so `visual` comes before the labs.

- [ ] **Step 1:** Write the tests:
  - `describe("nextMoves")`: `it("runs one heavy step at a time, in table order")`. Given `h1`, `h2` (heavy) and `s` (shared) with no dependencies, the first move starts `h1` and `s`. With `h1` running, `h2` doesn't start. With `h1` passed, `h2` starts.
  - `it("a failed heavy step frees the lane")`: with `h1` failed, `h2` starts.
  - `describe("gateSteps")`: `it("puts the visual check and both labs in the heavy lane, visual first")`. In the full plan with `economy: true`, the heavy names in table order are `["visual", "lab", "lab:generations"]`.
- [ ] **Step 2:** Run `npx vitest run src/gate.test.ts` and see them fail.
- [ ] **Step 3:** Implement it. `running` holds names, so `nextMoves` looks up the running steps by name in `steps`.
- [ ] **Step 4:** Run `npx vitest run src/gate.test.ts` and see it pass.
- [ ] **Step 5:** Commit: `The visual check and the labs take turns in the full gate, so the timing checks never run under the labs' load (#403)`.

### Task 3: A lab run that passed for the same inputs is reused

**Files:**

- Modify: `src/gate.ts`: add `Step.reusable`, the `reused` outcome, `reuseInputs`, `parsePass`, `reusedOutcome`, and update `summaryLine`, `totalLine`, `exitCode` and `nextMoves`.
- Modify: `scripts/gate.mjs`: hash the inputs, read and write `.gate/reuse/<step>.json`, and settle reused steps.
- Test: `src/gate.test.ts`.

**Interfaces:**

- Produces `Step.reusable: boolean`, true for `lab` and `lab:generations` only.
- Produces the outcome `{ readonly kind: "reused"; readonly sha: string }`.
- Produces `reuseInputs({ step, files, lock, node }: { step: Step; files: readonly (readonly [path: string, content: string])[]; lock: string; node: string }): string`. It returns a canonical text: JSON of the step's command, args and env, the files sorted by path, the lock and the node version. `scripts/gate.mjs` hashes it with sha256 into the key.
- Produces `PassRecord = { readonly key: string; readonly sha: string }`, and `parsePass(text: string | undefined): PassRecord | undefined`. It returns undefined for missing text, bad JSON, or missing or non-string fields.
- Produces `reusedOutcome(step: Step, key: string, record: PassRecord | undefined): Outcome | undefined`: `{ kind: "reused", sha: record.sha }` when `step.reusable` and `record?.key === key`, else undefined.
- Changes to the existing functions:
  - `summaryLine` for reused prints `ok    lab        reused (same inputs passed on abc1234)`, with the sha cut to 7.
  - `exitCode` treats reused as a pass.
  - `totalLine` counts reused among the passed: `gate full: 14 passed (2 reused) in 640.3s`. With no reused steps, the line is unchanged.
  - `nextMoves` treats a reused dependency as passed.

- [ ] **Step 1:** Write the tests:
  - `describe("reuseInputs")`: `it("changes when any input changes")`. Start from one base input. Varying each of the following gives a different text: one file's content, a file's path, an added file, the lock, the node version, the step's args, the step's env. File order doesn't change the text.
  - `describe("parsePass")`: a valid record round-trips; `undefined`, `"not json"`, `"{}"` and `{"key":1,"sha":"x"}` give undefined.
  - `describe("reusedOutcome")`:
    - a matching record on a reusable step gives reused with the record's sha;
    - a different key, no record, or a non-reusable step gives undefined.
  - `summaryLine` prints the reused line above.
  - `totalLine` prints `gate full: 3 passed (1 reused) in 3.0s` for two passed and one reused. `exitCode` is 0 for passed plus reused.
  - `nextMoves`: `it("starts a step behind a reused one")`.
  - `gateSteps`: only `lab` and `lab:generations` are reusable.
- [ ] **Step 2:** Run `npx vitest run src/gate.test.ts` and see them fail.
- [ ] **Step 3:** Implement the pure half. Then wire up `scripts/gate.mjs`:
  - `touchesEconomy` keeps the closure it builds.
  - Before spawning a reusable step, compute `key = sha256(reuseInputs(...))` over that closure's files and `package-lock.json`, with `process.version`. Read `.gate/reuse/<step name with non-word characters as _>.json` through `parsePass`. A `reusedOutcome` settles the step without spawning it.
  - When a reusable step passes, write `{ key, sha: <HEAD at the gate's start> }` to that file.
  - When a reusable step fails, delete its record.
- [ ] **Step 4:** Run `npx vitest run src/gate.test.ts` and `npm run gate -- fast`, and see them pass.
- [ ] **Step 5:** Commit: `A lab step that passed for the same inputs is reused, not run again (#403)`.

### Task 4: The verification ladder, and the gate docs

**Files:**

- Modify: `.claude/rules/dad-friendly-work.md`, under "Done means proven".
- Modify: `CLAUDE.md`, under Commands.
- Modify: `docs/ARCHITECTURE.md`: the gate section, if it describes the steps or scheduling.

- [ ] **Step 1:** In `dad-friendly-work.md`, add the ladder as one short list: prove a change with the cheapest check that covers it, and climb only as far as needed.
  1. The test file you touched (`npx vitest run <file>`).
  2. `npm run gate -- fast`.
  3. For anything the player sees: the one `VISUAL_ONLY='<section>'` section that covers it, plus `npm run play` on its save.
  4. `npm run gate -- full`, once, before the PR, and again only after a fix to a step it failed.

  Then add, one line each:
  - A plan keeps each screen's browser checks green in the task that changes the screen.
  - A full gate takes about 10–14 minutes. Start it in the background and wait for it to finish; never wrap it in `timeout`, and never poll it in a sleep loop.
  - Briefs and plans quote this ladder rather than setting their own tiers.

- [ ] **Step 2:** In `CLAUDE.md`, the first Commands bullet points at the ladder in `dad-friendly-work.md`. Add one line saying that the full gate runs the visual check and the labs one at a time, and reuses a lab run whose inputs passed before.
- [ ] **Step 3:** Update `docs/ARCHITECTURE.md`'s gate description to match: lanes, reuse, and `format:changed`.
- [ ] **Step 4:** Commit: `The verification ladder is in the rules, and the docs describe the gate's lanes and reuse (#403)`.

### Task 5: Prove it

- [ ] **Step 1:** Add a temporary comment to `src/tiers.ts`, so the lab's inputs differ from main and the labs run. Then run `npm run gate -- full` in the background.
  - Expected: every step passes; `visual`, `lab` and `lab:generations` don't overlap (their times add up rather than stretch); `.gate/reuse/lab.json` and `.gate/reuse/lab_generations.json` exist.
- [ ] **Step 2:** With the comment still there, run `npm run gate -- full` again.
  - Expected: `lab` and `lab:generations` print `reused (same inputs passed on …)`, and the total line reads `(2 reused)`.
- [ ] **Step 3:** Remove the comment, so the tree matches the commits, and run the pre-PR `npm run gate -- full`.
  - Expected: 14 or 12 steps pass, with the labs skipped (no economy change against main), and a signoff marker.
- [ ] **Step 4:** Note the three gate times in the PR body.
