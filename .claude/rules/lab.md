---
paths:
  - "src/lab/**"
  - "src/rates.ts"
  - "tools/strategy-lab.ts"
  - "tools/sweep/**"
  - "docs/pacing-ledger.md"
---

# Tuning in the strategy lab

This rule loads when a lab file is read. Each line here cost a rerun once.

- **Confirm with every player type.** While iterating with `--policy` filters, include `marathon` and any other extreme type that has a strict row. Do the confirming run with no `--policy` filter. Run ends are counted at sitting starts, so a small speed-up can pull a long-sitting player a whole day earlier (#543: the marathon broke its bound after five other types had passed, and the retune cost another long run).
- **`effectiveRates` (`src/rates.ts`) is the lab's hot path.** It runs hundreds of thousands of times in one lab job, so a few microseconds a call become minutes in the full gate. After a change to rates or staffing, time one lab job against `main` before the full gate, and profile with `node --cpu-prof` (#500: a smarter staffing search made a lab six times slower until it got an exact fast path and a cache).
- **An ad hoc reading is a throwaway probe**, not a new lab scope. Write a `tools/probe-*.ts` that loads the player types with `discover(..., parsePolicyExport)`, builds its measures inline with `defineMeasure` (the `why` must contain a space), and calls `runTournament`. Run it with `node --import ./tools/lab-register.mjs tools/probe-<name>.ts`, and delete it before the commit.
- **Lab settings are the agent's call. Guardrail limits are not.** Horizons, day caps, tolerances and sweep grids are rulings: decide, and record them on the issue and in the PR body (`working-with-flemming.md`). A guardrail limit in `src/lab/targets.ts` is a stop (`superpowers.md`). Changing or deleting one needs Flemming's own words, quoted in the PR body. Another agent's summary of them is not enough.
- **Do not tune toward a finish day.** A run takes at least five days and has no ceiling (#556).
- **A surprise in his real play is replayed before it is explained.** Read his save and field log (`CLAUDE.md`, Claude Code cloud sessions) and run the numbers on that save, before guessing at a cause.
