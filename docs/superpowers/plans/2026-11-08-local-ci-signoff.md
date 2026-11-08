# Local CI signoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A green `npm run gate -- full` on a clean commit can be signed off as a `signoff` commit status on GitHub, and `main` deploys only after the full gate passes on the runner (#397).

**Architecture:** The pure decisions (when a full run earns a marker, when a signoff may post, the marker's text) live in `src/signoff.ts` beside `src/gate.ts`. `scripts/gate.mjs` writes the marker after a full run and hands `signoff` to `scripts/signoff.mjs`, which reads git state and posts the status with `gh api` (REST). `deploy-hosting.yml` runs `npm run check` before it builds.

**Tech Stack:** Node scripts (ESM), TypeScript, Vitest, `gh api`, GitHub Actions.

**Spec:** approved in chat (Flemming, 2026-11-08), summarized in #397. Source idea: https://milanjovanovic.tech/blog/i-turned-off-ci-for-pull-requests

## Global Constraints

- Cloud sessions cannot post statuses; the `signoff.yml` relay posts them (Task 0).
- The status context is exactly `signoff` (so `gh signoff install`'s ruleset matches), state `success`.
- No pre-push hook, no `gh signoff` extension in the repo or setup script, no PR trigger in Actions.
- Never force-push. Agents never post `signoff` outside `npm run gate -- signoff`.
- The ruleset is Flemming's, set from his PC after this merges. This PR does not create it.

## Review Focus

- A full run that went green while the tree was dirty (an uncommitted edit, an untracked test) must not earn a marker: the checks did not run on the commit.
- A commit made during a full run (HEAD moved) must not earn a marker for either commit.
- A red full run must remove an older marker, so `signoff` cannot reuse a pass after a later failure on the same commit.
- `signoff` with HEAD not on the remote refuses before calling GitHub, and a GitHub error (403, 422) prints and exits non-zero.
- The marker file being missing, empty, or garbled refuses with "run the full gate first", never throws.

---

### Task 0: Probe that this session may post commit statuses (done)

Result: the cloud proxy refuses `POST /statuses` (403, "Write access to this GitHub API path is not permitted through this proxy"), and lets `POST /actions/workflows/<file>/dispatches` through (GitHub answered 404 for a missing workflow). Flemming picked the relay: `.github/workflows/signoff.yml` (workflow_dispatch, inputs `sha` and `summary`) posts the status with the Actions token. `npm run gate -- signoff` dispatches it on `ref: main` from every machine, so there is one path (ruling), then reads the commit status until `signoff` shows or about 90 s pass. Dispatch only works once the file is on `main`, so this PR's own signoff is proven after the merge.

### Task 1: The pure signoff rules

**Files:**

- Create: `src/signoff.ts`, `src/signoff.test.ts`
- Modify: `src/gate.ts` (`Parsed`, `parseArgs`, `USAGE`), `src/gate.test.ts`

**Interfaces:**

- Produces, in `src/signoff.ts`:
  - `export const MARKER = \`${GATE_DIR}/passed\``(GATE_DIR from`./gate.ts`)
  - `export interface Marker { readonly sha: string; readonly summary: string }`
  - `export function markerText(marker: Marker): string` → `"<sha>\n<summary>\n"`
  - `export function parseMarker(text: string | undefined): Marker | undefined` (first line a 40-hex sha, second line non-empty; anything else undefined)
  - `export interface FullRun { readonly green: boolean; readonly headBefore: string; readonly headAfter: string; readonly cleanBefore: boolean; readonly cleanAfter: boolean; readonly summary: string }`
  - `export type MarkerMove = { readonly kind: "write"; readonly marker: Marker } | { readonly kind: "none"; readonly reason: string }`
  - `export function markerAfterFull(run: FullRun): MarkerMove`
  - `export interface SignoffState { readonly head: string; readonly marker: Marker | undefined; readonly dirty: boolean; readonly pushed: boolean }`
  - `export type Signoff = { readonly kind: "post"; readonly sha: string; readonly description: string } | { readonly kind: "refuse"; readonly message: string }`
  - `export function decideSignoff(state: SignoffState): Signoff`
  - `export function signoffState(statuses: readonly { readonly context: string; readonly state: string }[]): "success" | "pending" | "failure" | "missing"` (the `signoff` entry's state; `error` counts as `failure`)
- Produces, in `src/gate.ts`: `Parsed` gains `{ readonly kind: "signoff" }`; `parseArgs(["signoff"])` returns it.

- [ ] **Step 1: Write the failing tests** in `src/signoff.test.ts`:
  - `markerAfterFull`: green + clean before and after + same HEAD → `write` with `{ sha: headAfter, summary }`; red → `none` reason containing `"red"`; dirty before or after → `none` reason containing `"uncommitted"`; HEAD moved → `none` reason containing `"HEAD moved"`.
  - `parseMarker(markerText(m))` equals `m`; `parseMarker(undefined)`, `parseMarker("")`, `parseMarker("nope\nx")` are undefined.
  - `decideSignoff`: dirty → refuse mentioning `"commit"`; not pushed → refuse mentioning `"push"`; no marker → refuse mentioning `"npm run gate -- full"`; marker sha ≠ head → same refusal; all good → `post` with `sha: head` and `description` equal to the marker summary, cut to at most 140 characters (GitHub's limit). Dirty is checked first, then pushed, then the marker.
  - `signoffState`: no `signoff` entry → `missing`; `{context:"signoff",state:"success"}` beside other contexts → `success`; `error` → `failure`; `pending` → `pending`.
  - In `src/gate.test.ts`: `parseArgs(["signoff"])` is `{ kind: "signoff" }`; `parseArgs(["signoff", "x"])` is invalid; `USAGE` contains `"signoff"`.
- [ ] **Step 2:** `npx vitest run src/signoff.test.ts src/gate.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement. USAGE gains the line `  signoff  post the signoff status on HEAD after a green full run on it`.
- [ ] **Step 4:** Same command → PASS. `npm run gate -- fast` green.
- [ ] **Step 5:** Commit `Signoff rules: when a full run earns a marker, and when signoff may post (#397)`.

### Task 2: The runner writes the marker and posts the status

**Files:**

- Modify: `scripts/gate.mjs`
- Create: `scripts/signoff.mjs`

**Interfaces:**

- Consumes: Task 1's `MARKER`, `markerText`, `parseMarker`, `markerAfterFull`, `decideSignoff`, `parseArgs` kind `signoff`.
- Produces: `npm run gate -- signoff`.

- [ ] **Step 1:** In `scripts/gate.mjs`, `signoff` is handled right after argument parsing: `await import("./signoff.mjs")` runs and exits with its code; no steps run.
- [ ] **Step 2:** For the full tier, record HEAD (`git rev-parse HEAD`) and cleanliness (`git status --porcelain` empty, untracked included) before planning, delete `MARKER` before the steps start, and after the total line apply `markerAfterFull` with `summary` = the total line. On `write`, write `markerText` and print `gate full: signoff ready for <short sha>; run npm run gate -- signoff after the push.`; on `none`, print `gate full: no signoff marker (<reason>).`
- [ ] **Step 3:** `scripts/signoff.mjs`: read `head`, `dirty` as above, `pushed` = `git branch -r --contains HEAD` non-empty, `marker` = `parseMarker` of the file (undefined if missing). On `refuse`, print `gate signoff: <message>` and exit 1. On `post`, run `gh api -X POST repos/{owner}/{repo}/actions/workflows/signoff.yml/dispatches -f ref=main -f inputs[sha]=<sha> -f inputs[summary]=<description>`; a non-zero `gh` exit prints its stderr and exits 1. Then read `gh api repos/{owner}/{repo}/commits/<sha>/status` every 5 s for up to 90 s and apply `signoffState`: `success` prints `gate signoff: signoff is green on <short sha>` and exits 0; anything else after the wait prints what it saw and exits 1.
- [ ] **Step 4:** Check by hand: `npm run gate -- signoff` with no marker → refuses with the full-gate message, exit 1.
- [ ] **Step 5:** `npm run gate -- fast` green. Commit `The full gate leaves a signoff marker, and gate signoff posts the status (#397)`.

### Task 3: Main deploys only after the full gate passes

**Files:**

- Modify: `.github/workflows/deploy-hosting.yml`
- Create: `.github/workflows/signoff.yml`

- [ ] **Step 1:** Between `npm ci` and `npm run build`, add a step `name: Full gate (the backstop for local signoff)`, `run: npm run check`. No other change: a red step stops the job, so nothing deploys.
- [ ] **Step 2:** `signoff.yml`: `on: workflow_dispatch` with required string inputs `sha` and `summary`; `permissions: statuses: write`; one job on `ubuntu-latest`, no checkout. Inputs go in through `env`, never inline in the script. It fails unless `sha` is 40 hex characters, then posts `state=success`, `context=signoff`, `description` = the summary cut to 140 characters, `target_url` = the run's URL, with `gh api` and `GH_TOKEN: ${{ github.token }}`.
- [ ] **Step 3:** Commit `deploy-hosting runs the full gate before it deploys main (#397)`. The run on the first merge is the proof; the PR body says so.

### Task 4: Docs and skills say how a PR is signed off

**Files:**

- Modify: `.claude/skills/ship-sitting/SKILL.md` (The gate; Open the PR; Babysit), `CLAUDE.md` (Commands), `.claude/rules/dad-friendly-work.md` (gate bullet), `README.md:28`, `docs/ARCHITECTURE.md` (the gate paragraph near line 25), `docs/DESIGN.md:188` ("runs in CI" → the full gate)

- [ ] **Step 1:** Ship-sitting: after the full gate is green and the branch is pushed, `npm run gate -- signoff`, before the PR is opened. After any later push (a fix, or `main` merged into the branch), run the full gate again and sign off again. Before merging, the PR head commit has a `success` `signoff` status (read it with `gh api repos/{owner}/{repo}/commits/<sha>/status`). Never post `signoff` any other way. Replace "There are no CI check runs on a PR" with the signoff story, and say `main` is guarded by a ruleset that requires `signoff` and an up-to-date branch.
- [ ] **Step 2:** `CLAUDE.md` Commands and `dad-friendly-work.md`: one sentence each adding `npm run gate -- signoff` after the push, and that agents never post the status by hand. README and ARCHITECTURE: the signoff and the deploy backstop in a sentence or two each.
- [ ] **Step 3:** `npm run gate -- fast` green (prettier formats the markdown in full). Commit `Ship-sitting signs off with the gate, and the docs say how (#397)`.

### Task 5: Prove it

- [ ] `npm run gate -- full` green, prints `signoff ready`. Push. `npm run gate -- signoff` posts. `gh api repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/status` shows `signoff` `success`.
- [ ] Make an edit without committing: `npm run gate -- signoff` refuses.
