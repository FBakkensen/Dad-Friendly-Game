# One time step and a thin store (S1, #414) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game and the lab advance the world through one pure time step, and `createProgressStore` becomes a thin composition of a pure session core and a sync service, with every function it owns under 150 lines and a cognitive complexity of 15.

**Architecture:**

- `src/session-time.ts` (new, pure) owns the time step: `advance(world, input)` moves a mountain and its hazards through live, away or clock-back time. `src/session.ts` (new, pure) owns the session: `step(session, input, now) → { session, effects }` covers everything that changes the session (ticks, away pay, moves, trouble presses, news, dismissals, a new run). Effects are data (`record`, `log`, `remember`, `granted`, `moved`).
- `src/lab/world.ts` calls `advance`, so the lab plays the same order as the game: expeditions settle, the crew accrues, then hazards step.
- The sync service is split by job, each a set of module functions over one shared `StoreContext` (`src/store-context.ts`): running a step and emitting (`src/store-session.ts`), the store's actions (`src/store-actions.ts`), the device's own copies (`src/local-saves.ts`), the cloud write pipeline (`src/cloud-writer.ts`), adopting a copy (`src/save-adopt.ts`), the fresh server read (`src/server-read.ts`), each cloud snapshot (`src/save-load.ts`), the account and the seat (`src/save-watch.ts`), and picking a copy (`src/save-choice.ts`). The cloud writer calls back up (emit, reconcile a refused rev) through the context's `hooks`, so there is no import cycle; every other module imports what it calls.
- `src/progress-store.ts` keeps its public types and API and composes the pieces.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part C, and issue #414, whose "Done when" is binding: the lab uses the shared step; save, emulator and cloud tests pass unchanged; the save line reads the same in the browser.

## Global Constraints

- No player-visible change. No change to the save format, `firestore.rules`, the ring's codes and data, or the logger's codes and details.
- `observable-saves.md` applies unchanged. `src/progress-store.test.ts`'s save, cloud, conflict and tab tests, `src/cloud-save.test.ts`, `src/phone-backup.test.ts`, `src/save-merge.test.ts` and the emulator tests pass without edits to their behaviour.
- The store's public API (`ProgressStore`, `ProgressSnapshot`, `createProgressStore`'s options) keeps its shape, except the two named changes below.
- No screen imports in the store or the sync service: nothing under them imports `screen-words`, `workshop-sheet` or any panel.
- Strict limits (#422) for every function this sliver touches or adds: 150 lines and complexity 15. Remove from `scripts/function-ceilings.json` and `scripts/complexity-ceilings.json`: `createProgressStore`, `createTabWriter`, `createFirebaseCloudSave`, and the complexity entries `applyAuthoritative`, `applyRemote`, `writePhoneBackup`, `applyMerged`, `prepareLocal`, `mergeSaves`. No new entry.
- Coverage: `src/progress-store.ts`'s floor (96/93/98/96) is carried to each new module that takes its code, at the same values or higher.
- If moving the lab onto the game's order moves a guardrail in `src/lab/targets.ts`, stop and ask (a stop, not a ruling).
- Commit messages are a plain sentence ending ` (#414)`, with the session's trailers.
- Verification ladder (`.claude/rules/dad-friendly-work.md`).

## Named changes

1. `CraftNotice` carries data, not words: `{ id, level, mountain, at }`. `card-views` makes the line (`craftFittedWords(name, fittedEffect(mountain, id, at))`), the same words as today.
2. `SaveConflictView.error` is the closed `"archive-failed"`; `save-conflict-panel` shows `SAVE_CONFLICT_ERROR` for it, the same words as today.
3. The preview hooks leave the store's public surface: `ProgressStore.layoutPreview` (`trouble(tier)`, `conflict()`) is a test seam, banned outside `boot.ts` and tests by the same ESLint rule as `applyMutation`. The conflict fixture mountains move to `src/save-preview.ts`.

## Review Focus

1. A cloud write that fails while a newer change waits: the newer mountain still goes after the retry (`flying` with `next: "waiting"`).
2. A hide (`flush`) during a fresh read: the backup is written, the cloud write waits for the read, then goes at once.
3. Losing and regaining the writer seat mid-write: no write from the other seat's tab, and the regained tab reads the server before writing.
4. A clock that goes back during a live session: no pay, departures in the future move to now.
5. A craft that finishes during away time: the notice's words use the mountain at the moment it was fitted.

Each is pinned by an existing test in `src/progress-store.test.ts` (1–4) or a new one in `src/session.test.ts` and `src/card-views.test.ts` (4–5).

---

### Task 1: The four small save modules under the limits

**Files:** `src/tab-writer.ts`, `src/firebase-save.ts`, `src/phone-backup.ts`, `src/save-merge.ts`, both ceiling lists.

- [ ] Split `createTabWriter` and `createFirebaseCloudSave` into module-level functions; simplify `writePhoneBackup` and `mergeSaves`. Exported APIs unchanged.
- [ ] Their test files pass unedited; `node scripts/function-ratchet.mjs` no longer lists them; remove their entries.
- [ ] Commit.

### Task 2: One time step for the game and the lab

**Files:** Create `src/session-time.ts`, `src/session-time.test.ts`. Modify `src/lab/world.ts`.

**Interfaces (produces):**

```ts
export type TimeInput =
  | {
      readonly kind: "live";
      readonly from: number;
      readonly to: number;
      readonly playerFixMs?: number;
    }
  | { readonly kind: "away"; readonly from: number; readonly to: number }
  | { readonly kind: "clock-back"; readonly to: number };
export type Advanced = {
  readonly mountain: Mountain;
  readonly hazards: HazardState;
  readonly settledAt: number;
  readonly mined: number;
  readonly homecomings: readonly Homecoming[];
  readonly away: AwayReport | undefined; // set for "away"
};
export function advance(
  world: { mountain: Mountain; hazards: HazardState },
  input: TimeInput,
): Advanced;
/** Ticks come every second on screen; a gap over ten seconds is away time. */
export function timeInput(lastSeen: number | undefined, now: number): TimeInput;
```

- [ ] Tests: live settles expeditions at `to`, then accrues `from → to` with the trouble, then steps hazards with `liveMs = to - from`; away pays `accrueAway` and closes hazards; clock-back clamps departures to now and pays nothing; `timeInput` picks clock-back for `now < lastSeen`, away for a gap over 10 000 ms, live otherwise.
- [ ] `world.ts`'s `step` calls `advance` (`clock` moves by `ms`, as today).
- [ ] Run `src/lab/*.test.ts`, the tournament snapshot, and `npm run lab:generations -- --ci` in the background. A snapshot that moves by the return-at-the-end-of-a-second difference is updated; a guardrail that moves is a stop.
- [ ] Commit.

### Task 3: The session core

**Files:** `src/session.ts`, `src/session.test.ts`, `src/card-views.ts` (+ tests), `src/save-conflict-panel.ts` (+ tests).

**Interfaces (produces):** `Session`, `SessionInput`, `SessionEffect`, `step(session, input, now)`, `createSession(mountain, seed)`. Inputs: `tick`, `away` (`since`), `move`, `change` (the test seam), `press`, `fix` (the store settles with a `tick` first, unless a fresh read holds time), `recall`, `notice`, `loaded`, `begin`, `dismiss` (`reveal` | `away` | `quiet` | `layer` | `craft`), `preview-trouble`. Effects: `record`, `log`, `remember` (the homecoming news key), `granted` (a layer granted recipes), `moved` (the move's `MoveResult`).

- [ ] Move the store's game-side code into `step`, unchanged in order and in what it records: `settle`, `settleSince`, `noteHazards`, `noteHomecomings`, `noteReveals`, `noteLayers`, `noteCrafts`, `staffLoaded`, `grantEngineer`, `beginRun`'s session part, the trouble presses, the dismissals.
- [ ] The store holds one `Session` and runs every game change through `step`, applying effects through its ports.
- [ ] Named changes 1 and 2.
- [ ] `src/progress-store.test.ts` passes (only the craft line and conflict error assertions change shape).
- [ ] Commit.

### Task 4: The sync service

**Files:** Create `src/store-context.ts`, `src/store-session.ts`, `src/store-actions.ts`, `src/local-saves.ts`, `src/cloud-writer.ts`, `src/save-adopt.ts`, `src/server-read.ts`, `src/save-load.ts`, `src/save-watch.ts`, `src/save-choice.ts`, `src/save-preview.ts`. Modify `src/progress-store.ts`, `src/boot.ts`, `eslint.config.js`, the tests that call the preview hooks, `vite.config.ts`.

**Interfaces (produces):**

```ts
export type CloudWrite =
  | { readonly kind: "clean"; readonly expedite: boolean }
  | { readonly kind: "dirty"; readonly expedite: boolean }
  | {
      readonly kind: "queued";
      readonly expedite: boolean;
      readonly timer: ReturnType<typeof setTimeout>;
    }
  | {
      readonly kind: "flying";
      readonly next: "none" | "waiting";
      readonly expedite: boolean;
    };
export type ServerRead =
  | { readonly kind: "unseen" }
  | { readonly kind: "seen" }
  | { readonly kind: "holding"; readonly wasSeen: boolean };
```

- [ ] Move the closure's sync code into the modules above, turning `cloudFlight`, `cloudDirty`, `expediteNext`, `pendingCloudWrite`, `serverSeen` and `resumeHold` into the two unions. Split `applyAuthoritative`, `applyRemote`, `applyMerged` and `prepareLocal` under complexity 15.
- [ ] `createProgressStore` composes the context, subscribes auth and the seat, and returns the API, in 150 lines or fewer.
- [ ] Named change 3.
- [ ] `npx vitest run src/progress-store.test.ts` and every test that imports the store; `npm run gate -- fast`; remove the ceiling entries.
- [ ] Commit.

### Task 5: Docs and proof

- [ ] `docs/ARCHITECTURE.md`: the State paragraph and the module list describe the session core and the sync service.
- [ ] `VISUAL_ONLY` for the save line and the conflict sheet; `npm run play` on a signed-in save and read the save line in `log.txt`.
- [ ] `npm run gate -- full`, then ship (ship-sitting).
