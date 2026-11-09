# Actions and dispatch (#409) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every move the player makes is a typed `Move`, applied by one function shared with the lab and dispatched through the store. The result says whether it applied. The UI's 18 `applyMutation` sites, the Proxy and the four count diffs go, and the UI and the lab play the same rules.

**Architecture:**

- In `src/economy/actions.ts`, `Move = Action | ScreenMove`, where the screen moves are dig, vein tap and seen marks. `applyMove(mountain, move, now, { trouble })` returns `{ kind: "applied"; mountain; spent; mined } | { kind: "refused" }`.
- `applyAction` (used by the lab) becomes a thin call to `applyMove`.
- The store's `dispatch(move)` replaces `applyMutation` for production code. The screen passes panels a `dispatch` that shows spends on the odometer.

**Tech Stack:** TypeScript, Vitest (happy-dom for panel tests).

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part A and named fix 3; issue #409.

**Shared modules:** the rules move into `src/economy/actions.ts` (the existing action module), `src/expeditions.ts` (`recall`) and `src/teach.ts`. Dispatch goes into the existing store, `src/progress-store.ts`. No new module.

## Global Constraints

- No player-visible change except named fix 3: the UI's rules for recall, staffing teach marks and tending teach marks become the rules for everyone. The layer recipe grant stays in the store's time step until S1 (#414) moves it; `grantDepthRecipe` in the craft move stays, and is a no-op in the game.
- Lab guardrails (`src/lab/targets.ts`) and the strict lab must give the same results. A guardrail that moves is a stop for Flemming.
- Strict limits for reworked code (#422): `src/economy/actions.ts#listActions` (complexity 36) comes down to 15 or less, and its ceiling entry is removed. Every function this sliver adds or touches stays within 150 lines and complexity 15, with no new ceiling.
- `applyMutation` stays on the store for tests only. ESLint's `no-restricted-properties` bans `.applyMutation` in non-test `src` (`*.test.ts` and `*.harness.ts` are exempt).
- **Verification ladder** (`dad-friendly-work.md`): the test file, then `gate fast`, then the affected visual section and `npm run play`, then the full gate once before the PR.
- **Commits:** a plain sentence ending `(#409)`, with the session trailers.

## Review Focus

1. A buy that the store refuses (the session isn't playing, or the price rose) must not show Done, a crew-rate count, or an odometer spend. Task 4 has a test for this.
2. The Upgrades buy marks as seen the rows that were shown before the buy, exactly as today. It must not mark rows the buy itself reveals. Task 4 has a test for this.
3. A recall of a tunnel post with no expedition goes to camp, the same in the UI and the lab. Task 1 has a test for this.
4. Dig and vein taps still respect trouble (a cave-in) and the not-playing state. Task 3 has a test for this.
5. The odometer shows a spend for every local buy (Ready plate, Buys rows, Upgrades, Engineers promote, Workshop craft), and none for crew income. Task 4 has a test for this.

---

### Task 1: One move union, one apply, the same rules for the UI and the lab

**Files:** `src/economy/actions.ts`, `src/expeditions.ts`, `src/teach.ts` (if a helper moves), and their tests (`src/economy/actions.test.ts`, `src/expeditions.test.ts`).

**Interfaces:**

- Produces `ScreenMove`:
  - `{ kind: "dig" }`;
  - `{ kind: "tapVein" }`;
  - `{ kind: "markSeen"; id: string }`;
  - `{ kind: "markAllSeen"; ids: readonly string[] }`;

  and `type Move = Action | ScreenMove`.

- Produces `type MoveResult = { kind: "applied"; mountain: Mountain; spent: number; mined: number } | { kind: "refused" }`:
  - refused when the move leaves the mountain unchanged (the same object);
  - `spent` is the pocket the move took, at least 0, and `mined` is the stones it added, at least 0.
- Produces `applyMove(mountain: Mountain, move: Move, now: number, context: { readonly trouble: Trouble | undefined }): MoveResult`:
  - `buyTier` is today's `buyWithTeach` (it moves here from `crew-panel.ts` and keeps its name);
  - `station` marks "tending" taught, as the UI's tend buttons do today;
  - `dig` is `mineByHand(mountain, now, trouble)`, and `tapVein` is `mineVein(mountain)`;
  - `markSeen` and `markAllSeen` call `teach.ts`.
- `applyAction(mountain, action, now)` keeps its signature for the lab. It returns `applyMove(mountain, action, now, { trouble: undefined })`'s mountain, or the input when refused.
- `recall` in `src/expeditions.ts`: an engineer whose post is "tunnel" with no expedition goes to camp. This is the UI's rule today (`engineers-panel.ts:738-746`), now in the rule itself.

- [ ] **Step 1: Write the failing tests:**
  - `applyMove` gives `applied` with `spent` for a cart buy, and `refused` for one the pocket can't cover;
  - a helper buy with an idle machine marks staffing taught;
  - `station` marks tending taught;
  - `dig` gives `applied` with `mined`, and a cave-in still lets a hand dig as today;
  - `tapVein`, `markSeen` and `markAllSeen` each apply;
  - `applyAction` equals `applyMove`'s mountain for every `Action` kind in a fixture;
  - `recall` of a tunnel post with no trip stations at camp.
- [ ] **Step 2:** Run `npx vitest run src/economy/actions.test.ts src/expeditions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it, keeping every function within 150 lines and complexity 15.
- [ ] **Step 4:** Run the same tests and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5:** Commit: `Every move is one Move, applied by one function the lab shares, with the UI's rules for recall and teach marks (#409)`.

### Task 2: `listActions` within complexity 15

**Files:** `src/economy/actions.ts`, `src/economy/actions.test.ts`, `scripts/complexity-ceilings.json`.

- [ ] **Step 1: Characterize first.** Write a test that records `listActions` for a set of fixture mountains: fresh, early, mid, crystal, heart, a crafting bench, and with and without trouble. Pin it with inline snapshots taken from today's code, and see it pass before any change.
- [ ] **Step 2:** Split `listActions` into one helper per action family: tiers, upgrades, boosts, engineers, expeditions, crafts and trouble. `listActions` concatenates them in today's order.
- [ ] **Step 3:** Remove `src/economy/actions.ts#listActions` from `scripts/complexity-ceilings.json`. Run `npx vitest run src/economy/actions.test.ts` and `npm run functions`. Expected: the snapshots are unchanged, and `functions` passes.
- [ ] **Step 4:** Commit: `listActions splits by action family and comes within complexity 15 (#409)`.

### Task 3: The store dispatches moves

**Files:** `src/progress-store.ts`, `src/progress-store.test.ts`, `eslint.config.js`.

**Interfaces:**

- Produces `ProgressStore.dispatch(move: Move): DispatchResult`, where `DispatchResult = { kind: "applied"; spent: number; mined: number } | { kind: "refused"; reason: "not-playing" | "no-change" }`.
- Today's `applyMutation` flow runs with `applyMove(mountain, move, now(), { trouble })` as the update:
  - settle first;
  - `recordFirstUse`;
  - `noteChanges` and `noteCrew` (until A2);
  - the `vein.tap` log entry for `tapVein`;
  - the persist calls;
  - emit.
- `applyMutation` stays, documented as a test seam.
- ESLint: `no-restricted-properties` on `applyMutation`, with the message "Change the game with dispatch(move) (#409)", for `src/**/*.ts` except `*.test.ts` and `*.harness.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `dispatch` of a cart buy applies, persists (phone backup written) and emits;
  - when the session isn't playing, it gives `refused` / `not-playing`, with nothing written;
  - an unaffordable buy gives `refused` / `no-change`;
  - `tapVein` records `vein.tap` with the stones;
  - `dig` respects the current trouble.
- [ ] **Step 2:** Run `npx vitest run src/progress-store.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it, sharing one inner commit path with `applyMutation`, not copying it.
- [ ] **Step 4:** Run the tests and `npm run gate -- fast`. Expected: PASS. The lint rule fires on today's UI call sites, which Task 4 removes.
- [ ] **Step 5:** Commit: `The store dispatches moves and says whether each applied (#409)`.

### Task 4: The UI dispatches moves; the Proxy and the count diffs go

**Files:** `src/crew-panel.ts`, `src/upgrades-panel.ts`, `src/engineers-panel.ts`, `src/workshop-panel.ts`, `src/mountain-screen.ts`, and their tests.

**Interfaces:**

- Each panel takes `dispatch: (move: Move) => DispatchResult` in its options. The screen builds it once: it calls `progress.dispatch`, and on `applied` with `spent >= 1` it calls `odometer.spend(spent)` and `gauge.kick(SPEND_KICK)`.
- The Proxy and `localChange` go. `renderStock` only sets the odometer and the dial.
- **Sites:**
  - crew rows and the worker row dispatch `buyTier`, and show Done and the crew-rate count only on `applied`;
  - Upgrades rows dispatch `buyUpgrade` or `buyBoost`, then `markAllSeen` with the ids shown before the buy, and show Done on `applied`. Opening the drawer dispatches `markAllSeen`;
  - the Ready plate dispatches `buyTier`, and gives `bought` only on `applied`;
  - Engineers dispatch `markSeen("engineers")`, `send`, `station` (twice), `recall`, and `promote`, and `recall` relies on the Task 1 rule;
  - Workshop dispatches `markSeen("workshop")`, `cancelCraft` and `craft`;
  - the screen dispatches `dig`, `tapVein` and `markSeen("workshop")`.

- [ ] **Step 1: Write the failing tests:**
  - a refused crew buy shows no Done and no spend;
  - the Upgrades buy marks only the rows shown before it;
  - the odometer shows a spend for a Ready plate buy, an Upgrades buy and a promote, and none for income over a tick;
  - a dig still kicks the gauge.

  Keep every existing panel and screen test passing, since they pin today's behaviour.

- [ ] **Step 2:** Run the touched test files. Expected: the new ones FAIL.
- [ ] **Step 3:** Migrate every site. Check that `grep -n "applyMutation" src/*.ts` shows only tests, harnesses and the store's own definition.
- [ ] **Step 4:** Run the touched test files and `npm run gate -- fast`. Expected: PASS.
- [ ] **Step 5:** Run the browser checks for what the player sees, one section each:
  - `VISUAL_ONLY='^(bays and ready|keys and drawers) \[424,924\] taps$' npm run visual`;
  - `npm run play -- --save early label:Buys wait:900 tap:.board-row[data-tier=cart]`;
  - `npm run play -- --save mid label:Upgrades wait:900`.

  Expected: all pass, and the shots show the buy and the odometer spend.

- [ ] **Step 6:** Commit: `The panels and the screen change the game only through dispatch; the Proxy and the count diffs are gone (#409)`.

### Task 5: The lab, the docs and the rules

- [ ] **Step 1:** Run `LAB_STRICT=1 node --import ./tools/lab-register.mjs tools/strategy-lab.ts --ci` and `npm run lab:generations -- --ci` in the background. Compare against `main`: the guardrail checks pass and the report numbers are unchanged. Any guardrail moving is a stop for Flemming.
- [ ] **Step 2:** Docs:
  - `docs/ARCHITECTURE.md`: moves and dispatch, `applyMutation` as a test seam, and the Proxy note removed;
  - `.claude/rules/dad-friendly-work.md`: add a line saying a sliver that reworks a function removes its ceiling entries, so the check is strict for that code (#422);
  - the spec's slivers list: add R1 (#420), R2 (#421) and V (#422).
- [ ] **Step 3:** Run `npm run gate -- fast`, then commit: `The docs describe moves and dispatch, and the rules hold reworked code to the strict limits (#409)`.

### Task 6: Prove it

- [ ] **Step 1:** Run `npm run gate -- full` once, in the background. Expected: every step passes, the strict lab included, because the economy closure changed.
- [ ] **Step 2:** Final whole-branch review, then the PR.
