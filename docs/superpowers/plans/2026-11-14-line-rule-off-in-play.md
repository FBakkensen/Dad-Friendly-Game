# The line's rule, off in play (#532, M15-2)

**Goal:** the lab can play step 1's rule from the spec (`docs/superpowers/specs/2026-11-14-line-works-village-design.md`, "Step 1: the line", "The rule"). Rock goes through the face, the haul and the lift, the hands fill in at the lowest stage, and the crew moves what the line moves. In play nothing changes.

**Shared module:** a new `src/line.ts` holds the stages, which stage each machine belongs to, and the hands rule. It is a leaf (it imports only `tiers` types and `economy/factors`). `effectiveRates` in `src/rates.ts`, the one home for every speed, reads it in the one place where it sums the crew, and `handsGain` reads the same sum, so a hired hand's gain is the line's gain when the line is on. Staffing (`staffCrew`, `tendedOutput`), the tending floor and every screen are left as they are.

## Rulings (agent-run sitting)

1. **The switch is a sweep factor, `line.off`.** A factor reads 1 when no sweep runs, so the id names the off state: 1 (play) keeps today's sum, and a lab run sets `{ "line.off": 0 }` to turn the line on. `lineOn()` in `src/line.ts` is the one test. #536 turns it on in play.
2. **Stages.** Carts haul. Drills and borers work the face. The Great Machine lifts. `MACHINE_STAGE: Record<MachineId, Stage>`, so a new machine id fails to compile until it has a stage.
3. **What a stage moves** is the sum over its machines of running × speed, with the speeds `effectiveRates` already worked out (marks, gear, engineer, band rock, Legacy, trouble). **The hands' stones a second** are running workers × the worker's speed plus kids × the kid's speed. Workers who run machines still lend their hands (spec rule 3).
4. **The rule.** `lineSpeed(stages, hands)` is the largest T with Σ max(0, T − stage) ≤ 3 × hands, found by filling the lowest stage up to the next, then both, and so on. Three is `STAGES.length`: a worker who moves 1 a second through the whole line does 3 a second of one job.
5. **No number moves.** Machine ratings stay today's (×3 is #534's), so with the line on today's machines move less than they mine today. That is expected and is the lab's to tune.
6. **Rates gains no field.** The lab reads `lineSpeed`, `stageSpeeds` and `handsSpeed` from `src/line.ts` when it needs the parts (#534).

## Tasks

1. `src/line.ts` and `src/line.test.ts`: `Stage`, `STAGES`, `MACHINE_STAGE`, `lineOn()`, `stageSpeeds(speed, running)`, `handsSpeed(speed, running)`, `lineSpeed(stages, hands)`. Tests: every machine has a stage, as the spec says; no machines moves the hands' speed; the spec's worked numbers (twelve workers at 1/s: a cart rated 18 makes 18; a hoist rated 60 after it makes 27; a drill rated 108 after that makes 54; a second cart rated 18 with no hoist stays 18); a random sweep that more hands, or a faster stage, never slows the line; no hands is the lowest stage.
2. `src/rates.ts`: the crew's sum is `lineSpeed` when `lineOn()`, else today's sum; `handsGain`'s base output reads the same. Tests in `rates.test.ts`: with the factor on and no machines the crew is today's; with the factor on and machines the crew is `lineSpeed` of the parts; with the factor off a mid-game save reads as before; `handsGain` with the factor on is the line's rise.
3. Docs: `ARCHITECTURE.md` (the `line` module and the factor). `DESIGN.md` is unchanged, since play is.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the two test files, `npm run gate -- fast`, then the full gate (play, the pacing pins and both labs must read as on `main`). Nothing the player sees changes, so no visual section or `npm run play` run is owed beyond the full gate's.
