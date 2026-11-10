# The sweep sim test fits its budget (#447) Plan

A small change: short design, plan and build in one sitting (`.claude/rules/superpowers.md`). Approved by Flemming (option 1).

**Goal:** `tools/sweep/cli.sim.test.ts` stays the same end-to-end check of the sweep command and fits its 120 s budget in the deploy's coverage step with a wide margin.

**Out of scope:** what the sweep or the test asserts, and the sweep command's own behaviour.

## Why it happens

`KNOBS` (`tools/sweep/knobs.ts`) has one hardness knob for each layer and tier, so it grew to 56 knobs. Morris runs `knobs + 1` sims per trajectory, so the test's `--morris 1` meant 57 sims a sweep, plus 6 for Sobol, twice: about 126 one-day sims at 35–450 ms each. That came to 23.5 s alone and 47.9 s under `--coverage.enabled` on an idle 4-core machine, and past 120 s on the loaded CI runner. Each new layer or tier made it slower.

## Design

- `executeSweep`'s existing second argument (the test overrides for the policy and measure folders) also takes `knobs`. It defaults to `KNOBS`, so `npm run lab:sweep` is unchanged. This is the existing override in `tools/sweep/cli.ts`, not a new module.
- The sim test sweeps three real knobs: the first price, output and hardness knob. That is 4 Morris runs and 6 Sobol runs a sweep. It still parses the arguments, discovers the policy and measure, runs Morris and Sobol, renders, writes `sweep.md`, and checks two runs are identical. It also checks that the report's knob table holds the three knobs and not a knob it left out, so the override is proven to reach the report.
- The 120 s budget stays. `knobs.test.ts` already checks every knob.

## Proof

| Run                                                  | Before | After |
| ---------------------------------------------------- | ------ | ----- |
| `npx vitest run tools/sweep/cli.sim.test.ts` (tests) | 23.5 s | 1.1 s |
| same, `--coverage.enabled` (tests)                   | 47.9 s | 2.1 s |

Then `npm run gate -- fast`, `npm run gate -- full`, and `npm run gate -- signoff` after the push.
