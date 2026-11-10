# Crew test cleanup (#428) Plan

A small change: short design, plan and build in one sitting (`.claude/rules/superpowers.md`).

**Goal:** finish what #430 left of #428. Put the reduced-motion "no red" test back beside the blink tests, restore the store spies, drop the fake clocks that never move, and split the crew file only if a file still sits near its worker's heap limit.

**Out of scope:** what any test checks. No assertion changes.

## Design

- **The "no red" test.** It sits in `src/mountain-screen-rail.test.ts` ("under reduced motion a dear tap in a drawer spends nothing and never paints its lamp red"). It moves into the Buys drawer block of `src/mountain-screen-crew.test.ts`, right after "a dear tap blinks". It uses that block's helpers (`seededWith`, `rowOf`, `lampOf`, `fingerTap`), with the same events, clock steps and assertions.
- **Spies.** Each of the three screen test files has one `afterEach` that stops the screens and then calls `vi.restoreAllMocks()`. One place per file, not a `mockRestore()` per spy, so a later spy can't be forgotten. Stopping runs first, so a spy still in place sees the same teardown it saw before.
- **Fake clocks.** A `vi.useFakeTimers()` block that never moves the clock (no `advanceTimersByTime`, `runAllTimers` or the like) is removed, with its `useRealTimers()` and any `try`/`finally` left empty. That's eight in the crew file and one in `src/mountain-screen.test.ts`. Blocks that move the clock stay.
- **Split.** Measure first (below). Split only if a file is near the 2240 MB worker heap.

## Measuring

The issue measured heap per test. Here, a scratch Vitest config outside the repo (`--expose-gc`) adds a setup file that, after each test's own teardown, runs `gc()` twice and records:

- `heapUsed` after each test (first, last, peak, and growth per test);
- how many mounted screens are still alive (a `WeakRef` on each `mountScreen` root, through a `vi.mock` wrapper around the harness).

Each file runs alone, before and after the change.

## Tasks

1. Move the "no red" test into the crew file, and remove it from the rail file.
2. Add the restoring `afterEach` to the crew, lifecycle and main screen test files.
3. Remove the nine fake clocks that never move.
4. Measure, then decide on the split.
5. Prove it on the ladder: the four test files, `npm run gate -- fast`, then `npm run gate -- full` once before the PR.
