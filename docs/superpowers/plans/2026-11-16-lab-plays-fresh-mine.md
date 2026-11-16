# The strategy lab plays only the fresh mine (#737) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The gate's `lab` step plays the fresh mine the live game plays (`fresh.off=0`, `part2.off=0`), and today's mountain's lab code, its guardrail rows and the measures only they needed are deleted.

**Architecture:** The second of five deletion slivers under #665 (#729 done; then #738, #739, #740). The lab already plays the fresh mine under `--factors fresh.off=0,part2.off=0` (`src/lab/fresh-policies`, `src/lab/fresh-dad.ts`). This sliver makes that the only run. The live mine's switch values move into one shared constant that boot and the lab both read. The guardrail engine (`Target`, `guardrails.ts`, `scope.ts`, `LAB_STRICT`) stays for the fresh mine's own guardrails later. Its rows go.

**Tech Stack:** TypeScript, Vitest (`unit` and `sim` projects), the strategy lab (`tools/strategy-lab.ts`), knip.

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "What goes, and what stays". Issue #737, part of #665.

## Global Constraints

- **Flemming's answer (16 Nov 2026, 07:51Z, "agree" to option A):** delete the `TARGETS` rows that judge only today's mountain (all 22 rows). The fresh mine has no strict guardrail until new ones are designed. No other limit changes.
- **No save reset, no player-visible change.** Only the lab, its gate step, the pacing ledger and docs change. `boot.ts` holds the same factors as before.
- **The proof is the fresh run's numbers.** A baseline of the fresh-mine lab run from before this sliver is at `/tmp/claude-0/-workspace/7dd8b2c4-6a27-5270-8427-0ac17387de14/scratchpad/baseline-737/` (`strategy-lab.json`, `pacing-ledger.md`), from `node --import ./tools/lab-register.mjs tools/strategy-lab.ts --ci --factors fresh.off=0,part2.off=0`. After each task, the gate's run (`--ci`, no factors) must give the same machine days, finish days and end hashes for every player type and seed, and the same value for every measure that stays. A difference is a stop, not a re-pin.
- Out of scope: `src/pacing.ts`, its sims, `tuning.test.ts`, `line-staffing.sim.test.ts`, seed saves, `ui-audit` and old-board mockups (#738); the `fresh.off`/`line.off` switches and the old game's rules in `src` outside `src/lab` (#739); depth, layers and `remaining` (#740).
- **Exception moved from #738 (ruling):** `tools/sweep` runs today's player types (`src/lab/policies`), so it is deleted here with them. #738's body is updated to say so.
- Never lower a coverage floor (only a deleted file's floor line goes). Never skip a test. No function over 150 lines or cognitive complexity 15. No new player copy. Never "face", "hands" or "by hand" in new words.
- Name the shared module: `PLAY_FACTORS` goes in `src/part-switch.ts` (it already owns `PART_TWO_OFF` and reads `freshMineOn`). The sample-clock helpers kept from `casual.ts` and the sitting helpers kept from `bands.ts` move into `src/lab/sittings.ts`. No new lab module.
- Ladder: the touched tests, `npm run typecheck`, `npm run knip`, then `npm run gate -- fast` at the end of each task. Commit and push each task on `claude/project-thread-tj0lg3`.

## Review Focus

1. The gate's lab run (`--ci --ledger check`, no factors) plays the fresh mine with part 2 on: every player type reaches the Warehouse's roof (finish days 4.06 to 9.00, as in the baseline), not part 1's day 2.
2. `npm run lab -- --factors fresh.off=1` is refused with a clear message, not silently played on today's mountain.
3. `npm run lab -- --factors part2.off=1` still runs (part 1 only), and the ledger check refuses it as not the gate's run.
4. Every measure that stays keeps its baseline value. A deleted helper must not change a kept measure's number.
5. `boot.ts` still holds `fresh.off=0` and `part2.off=0` (its test still passes), now through `PLAY_FACTORS`.

---

### Task 1: The gate's lab plays the fresh mine, with no old guardrails

**Files:**

- Modify: `src/part-switch.ts` (`PLAY_FACTORS`), `src/boot.ts` (holds `PLAY_FACTORS`), `tools/strategy-lab.ts` (plays under `PLAY_FACTORS`, always `src/lab/fresh-policies`, refuses `fresh.off` other than 0, help text), `tools/strategy-lab.test.ts`, `src/lab/ledger.ts` and `ledger.test.ts` (building columns), `src/lab/targets.ts` (`TARGETS` empty; constants only the rows read go), `src/lab/guardrails.test.ts` and any test that read a `TARGETS` row, `docs/pacing-ledger.md` (written with `npm run lab:ledger`).
- Delete: the measures that read only today's mountain and are null or the same on every fresh row of the baseline: `benchIdle`, `craftShare`, `favouredBuyShare`, `featureShare`, `materialIdle`, `scopedRule3Misses`, and their cases in `measures.test.ts`. Keep anything another measure or `score.ts` still imports, moved next to its user.

**Interfaces:**

- Produces: `export const PLAY_FACTORS: Readonly<Record<string, 0>>` in `src/part-switch.ts`, equal to `{ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }`.
- Produces: `LedgerEntry.buildings: Readonly<Partial<Record<BuildingId, number>>>` (the day each building in play is first in `mountain.operational`) in place of `bands`. Columns: Policy, Seed, each building in play by name, each machine in play, Finish, End hash. The header line says "the day each building's roof is on" in place of "the day each band is reached".

- [ ] Tests first:
  - `part-switch.test.ts`: "PLAY_FACTORS holds the fresh mine with part 2", and `boot` still holds them.
  - `strategy-lab.test.ts`: "the gate's run plays the fresh mine with part 2: casual-2x10 seed 1 finishes on day 6.5"; "--factors fresh.off=1 is refused"; "--factors part2.off=1 runs and --ledger check refuses it".
  - `ledger.test.ts`: "a building's day is the day it is first operational", and "the ledger's columns are the buildings in play, the machines in play, Finish and End hash".
- [ ] Make them pass. Delete the `TARGETS` rows and the six measures. Run `npm run lab:ledger` and compare with the baseline. The machine days, Finish and End hash cells must match the baseline's ledger, row for row. Compare the report JSON's kept measures with the baseline the same way.
- [ ] Run the touched tests, `npm run typecheck`, `npm run knip` and `npm run gate -- fast`. Commit "The strategy lab plays the fresh mine, with no old guardrails (#737)".

### Task 2: Today's lab code is deleted

**Files:**

- Delete: `src/lab/policies/`, `policies.test.ts`, `policies.sim.test.ts`, `casual-run.test.ts`, `casual-run.sim.test.ts`, `tools/sweep/` (and `lab:sweep` in `package.json`), `src/lab/fixtures` cases that only today's path needs, and any `__snapshots__` entry only a deleted test wrote.
- Modify:
  - `plain.ts`: `plainPolicy` goes. `freshPolicy` stays.
  - `policy.ts`: `decide` goes from `Policy` and `fresh` becomes required. `PolicyParams` keeps only what the fresh path, the schedule and the sampling read (`sessionsPerDay`, `minutesPerSession`, `gapJitter`, `hoardK`, `trouble`, and anything `actionsOnTable`/`scoreDecision`/`valueContext` still read). Their validators follow.
  - `decide.ts`: today's half goes (`parameterisedDecide`, `optimizerDecide`, `bestPurchase`, the craft and send choices, and helpers only they use). `sticker` and what the sampling uses stay.
  - `run.ts`: today's path goes (`tendBest`, `promoteAsap`, `buyWhileAffordable`, `sendExplorers`, `remember`, the explorers in the gap, and the `freshMineOn` branch: every run is a fresh run). `runDone` reads `nextBuilding` only. `PolicyRun.promotions` goes if nothing reads it.
  - `tournament.ts`: today's path goes (the band log and band summary, `ownedCount`'s engineers, the `freshMineOn` checks).
  - `bands.ts`: band events, `runBands`, `summarizeBands` and the report's band section go. `createSittingClock`, `fewestMachineBuys`, `machineRevealSittings` and `smallRevealSittings` move to `sittings.ts`, then `bands.ts` and `bands.test.ts` go. `report.ts` and `report-bands.test.ts` follow.
  - `casual.ts`: `sampleCasualRun` and `diagnosisOf` go. `dayNumber`, `isSampleSecond` and `withFinish` move to `sittings.ts`, then `casual.ts` goes.
  - `reveal.ts` and `line-view.ts` stay, because kept measures read the fresh mine through them (`revealToUse`, `narrowRun`, `zeroGainBuys` vary on fresh rows). Today-only parts inside them go only if knip names them unused.
  - `tools/journeys/expected.ts` and `src/gate.ts` (`LAB_INPUTS` list) follow the moves.
  - Tests: `run.test.ts`, `tournament.test.ts` (and its snapshot), `registry.test.ts`, `measures.test.ts`, `world.test.ts`, `score.test.ts`, `sittings.test.ts`, `gate.test.ts` keep only fresh-mine cases. A case that proved today's path goes. A case that proved a kept helper moves to `sittings.test.ts`.
  - Docs: `docs/DESIGN.md` (a short "#737" history note: the lab plays the fresh mine; the old guardrails are gone), `docs/ARCHITECTURE.md` (the lab section), `docs/design-intent.md` (the lab and guardrails, where it says how they judge), `docs/pacing-ledger.md`'s header via `npm run lab:ledger`, `CLAUDE.md` and `.claude/rules/*.md` only if they name a deleted command, and the GitHub body of #738 (sweep moved here).

- [ ] Delete and move. Keep the fresh path's behaviour as it is.
- [ ] Run `npm run lab:ledger`. `docs/pacing-ledger.md` must not change from Task 1's. Compare the report JSON's kept measures with the baseline again.
- [ ] Run `npx vitest run --project sim`, coverage with both projects once (every floor holds; only a deleted file's floor line goes), `npm run knip`, `npm run gate -- fast`. Commit "Today's lab code is deleted (#737)".
