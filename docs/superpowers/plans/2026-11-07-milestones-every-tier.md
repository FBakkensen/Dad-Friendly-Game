# Milestones on Every Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every staffed tier and the workers get owned-count ×2 marks (#357, spec section C). The lab then holds the four check-in rows strict, and a new report row checks that every machine tier is bought at least 5 times.

**Architecture:**

- The marks are data in `src/milestones.ts`. `rates.ts` already multiplies each tier's output by `milestoneMultiplier`, and the crew card already shows `milestoneLine` for every tier. So the game change is the table and its copy.
- The lab change is one new report measure, plus four target rows flipped from report-only to strict.
- If the extra output breaks a strict row, the plan retunes prices and band scales only, never a bound.

**Tech Stack:** TypeScript, Vitest, the strategy lab (`npm run lab`, `npm run lab:generations`), `npm run play`.

**Spec:** `docs/economy-overhaul.md`: section C (milestones), section F (guardrails) and "Decided". Issue #357.

## Global Constraints

- **Engine only (Flemming, 7 Nov 2026).**
  - Another session is rewriting the UI.
  - Do not touch any `*-panel.ts`, `*-screen.ts`, CSS, `index.html` or layout code.
  - The card shows the new lines through the existing `milestoneLine`.
  - Test files that pin card text may be updated.
- **Marks, copied from the spec:**
  - carts and drills at 10, 25, 50, 100, 150, 200; borers at 5, 10, 25, 50, 100, 150, 200 (the 5 mark kept from today's game: Flemming's ruling after the Task 3 stop, 7 Nov 2026);
  - the Great Machine at 2, 3, 5, 10, 25, 50;
  - workers (`helper`) at 25, 50, 100.
  - Each mark is ×2, and the marks stack.
- **No save field.** Marks are count-based.
- **Copy.** The goal lines are the ones in Task 1, which Flemming approves in the PR (decision D4). Keep the numbers rule: real numbers, never payback or "best".
- **Bounds.** No bound in `src/lab/targets.ts` changes to go green; a bound change is Flemming's call. The four check-in rows become strict with their current values: `zero-buy-sittings` ≤ 0.2, `buys-per-sitting` ≥ 3, `best-open-share` ≥ 0.6, `best-wait-sittings` ≤ 2.
- **Must stay strict and green:** every existing row in `TARGETS`, the generations lab (each kid run longer than the last, every machine bought), and the pacing tests (regression pins may be re-pinned, with the reason in a comment).
- **Kids are not workers here.** The `kid` tier gets no marks; the spec names workers only.
- **Commits** are a plain sentence ending `(#357)`, with the session trailers. **No push** until ship-sitting.

## Review Focus

1. **Card line length on a phone.** Six marks mean long goal lines on a 390-px card. Every goal line must be at most 80 characters, no longer than today's longest (77). Pinned in Task 1.
2. **Counts past the last mark** (200 carts, 50 Great Machines, 100 workers). The card shows "Twice as fast now." and nothing else, and the multiplier stops growing (×64 for six marks, ×8 for three). Pinned in Task 1.
3. **A save that already owns many machines.** Opening a mid-run save with, for example, 30 drills must apply ×4 at once, with no new field and no crash. That follows from count-based marks; pinned in Task 1 with a rates test.
4. **The worker card.** Workers now get a goal line. The worker card is rendered by the same `crew-panel.ts` loop, so check it in `npm run play` (Task 4) rather than by changing panel code.
5. **Away pay.** Marks reached while away apply only from the moment they are reached, because purchases happen in sittings. Away pay reads `effectiveRates`, so no new code is needed. Task 3's sim re-pins cover it.

---

### Task 1: The milestone table on every tier

**Files:**

- Modify: `src/milestones.ts` (`MILESTONES`)
- Test: `src/milestones.test.ts`, `src/rates.test.ts`
- Modify (test pins only): `src/mountain-screen-depths.test.ts:880` (pins `of 20 · Twenty drills`), `src/economy/actions.test.ts` if a pin moves

**Interfaces:**

- Consumes: `milestonesReached`, `milestoneMultiplier` and `milestoneLine` (unchanged signatures).
- Produces: `MILESTONES` with entries for `cart`, `drill`, `borer`, `machine` and `helper`.

- [ ] **Step 1: Write the failing tests** in `src/milestones.test.ts`:
  - `"every staffed tier has the spec marks"`:
    - `MILESTONES.cart/drill/borer` map to `at` `[10, 25, 50, 100, 150, 200]`;
    - `machine` to `[2, 3, 5, 10, 25, 50]`;
    - `helper` to `[25, 50, 100]`;
    - `kid` is `undefined`.
  - `"marks stack to ×64 and stop"`:
    - `milestoneMultiplier("cart", 9)` is 1, `(… 10)` is 2, `(… 199)` is 32, `(… 200)` is 64, `(… 5000)` is 64;
    - `milestoneMultiplier("helper", 100)` is 8, `(… 1000)` is 8;
    - `milestoneMultiplier("machine", 50)` is 64.
  - `"goal lines fit a phone card"`: every `goal` in `MILESTONES` has `length <= 80` and ends with `.`.
  - `"past the last mark the card says twice as fast now"`: `milestoneLine("cart", 200, String)` is `"Twice as fast now."`.
  - Update the existing assertions that pin the old table (drill 20/30, borer 5/10).
  - Rates test `"an old save with 30 drills mines ×4 at once"`: build a mountain with 30 staffed drills through the existing test helpers. `effectiveRates(m).tierSpeed.drill` equals 4 × the same mountain's speed with `MILESTONES` emptied, or compare against `milestoneMultiplier("drill", 30)`, whichever the existing helpers support.

- [ ] **Step 2: Run** `npx vitest run src/milestones.test.ts`. Expected: FAIL on the table and the multiplier.

- [ ] **Step 3: Replace `MILESTONES`** in `src/milestones.ts` with this exact copy:

| Tier    | at  | goal                                                                       |
| ------- | --- | -------------------------------------------------------------------------- |
| cart    | 10  | Ten carts on the rails. Every cart hauls twice as fast.                    |
| cart    | 25  | Twenty-five carts in a long, rattling line. Twice as fast again.           |
| cart    | 50  | Fifty carts and the rails never rest. Twice as fast again.                 |
| cart    | 100 | A hundred carts, a river of rock. Twice as fast again.                     |
| cart    | 150 | A hundred and fifty carts. The tracks hum all night. Twice as fast again.  |
| cart    | 200 | Two hundred carts. The old mine was never this busy. Twice as fast again.  |
| drill   | 10  | Ten drills and the crew finds its rhythm. Every drill mines twice as fast. |
| drill   | 25  | Twenty-five drills humming together. Twice as fast again.                  |
| drill   | 50  | Fifty drills in step, like one long breath. Twice as fast again.           |
| drill   | 100 | A hundred drills. The whole hill thrums. Twice as fast again.              |
| drill   | 150 | A hundred and fifty drills, and nobody has to shout. Twice as fast again.  |
| drill   | 200 | Two hundred drills. The rock just gives way. Twice as fast again.          |
| borer   | 5   | Five borers side by side. They clear the tunnels twice as fast.            |
| borer   | 10  | Ten borers in step. Twice as fast again.                                   |
| borer   | 25  | Twenty-five borers in step. Twice as fast again.                           |
| borer   | 50  | Fifty borers, a slow and steady thunder. Twice as fast again.              |
| borer   | 100 | A hundred borers. New tunnels open by the hour. Twice as fast again.       |
| borer   | 150 | A hundred and fifty borers working the deep dark. Twice as fast again.     |
| borer   | 200 | Two hundred borers. The mountain rings like a bell. Twice as fast again.   |
| machine | 2   | Two Great Machines working as one. Both run twice as fast.                 |
| machine | 3   | Three Great Machines in step. Twice as fast again.                         |
| machine | 5   | Five Great Machines. The ground hums under your feet. Twice as fast again. |
| machine | 10  | Ten Great Machines, a little town of iron. Twice as fast again.            |
| machine | 25  | Twenty-five Great Machines turning in the dark. Twice as fast again.       |
| machine | 50  | Fifty Great Machines. The mountain has met its match. Twice as fast again. |
| helper  | 25  | Twenty-five workers who know the songs. Every worker digs twice as fast.   |
| helper  | 50  | Fifty workers around one long lunch table. Twice as fast again.            |
| helper  | 100 | A hundred workers. The camp is a little village now. Twice as fast again.  |

Update the file's doc comment: marks are on every staffed tier and the workers (#357, spec C); kids have none.

If the length test flags any line, shorten it in the same voice and say so in the report.

- [ ] **Step 4: Run** `npx vitest run src/milestones.test.ts` and `npm run gate -- fast`. Expected: PASS.
  - Re-pin `src/mountain-screen-depths.test.ts:880` to the new first drill line (`of 10 · Ten drills`), and any other text pin the fast gate shows.
  - Pacing and lab sims are not in the fast tier; Task 3 owns them.

- [ ] **Step 5: Commit:** `Every machine tier and the workers dig twice as fast at owned-count marks (#357)`.

### Task 2: Report row: every machine tier bought at least 5 times

**Files:**

- Create: `src/lab/measures/fewestMachineBuys.ts`
- Modify: `src/lab/bands.ts` (add the pure helper), `src/lab/targets.ts` (one row), the measure registry wherever `zeroBuySittings` is registered
- Test: `src/lab/measures.test.ts` (or `src/lab/bands.test.ts`, beside the other band helpers)

**Interfaces:**

- Consumes: `DecisionSample.bands` (`BandEvent`, `kind: "bought"`, `tier: MachineId`, `count`).
- Produces: `fewestMachineBuys(samples: readonly DecisionSample[]): number`. It returns the smallest total `count` of `"bought"` events over every `MachineId` (cart, drill, borer, machine) in one run; a machine never bought counts 0.

- [ ] **Step 1: Write the failing tests:**
  - `"fewest machine buys is the smallest per-tier total"`: samples whose band events buy cart 50, drill 45, borer 16, machine 19, spread across two samples and two bands. Expected 16.
  - `"a machine never bought makes it 0"`: no machine events. Expected 0.
  - The target exists: `TARGETS` has `id: "every-tier-bought"`, `measure: "fewestMachineBuys"`, `scope: { kind: "policyKinds", kinds: ["casual"] }`, `op: "gte"`, `value: 5`, `reportOnly: true`.

- [ ] **Step 2: Run** the test file. Expected: FAIL (not defined).

- [ ] **Step 3: Implement the helper.** Add `fewestMachineBuys` in `src/lab/bands.ts` and the measure file, following `favouredBuyShare.ts`: `id: "fewestMachineBuys"`, `label: "Fewest buys of one machine"`, `unit: "machines"`, `why: "Every machine tier should stay worth buying all run, not just its first few."`. Add the target row after `best-wait-sittings`, with `why: "Every machine tier is bought at least five times in a run."`.

- [ ] **Step 4: Run** the test file and `npm run gate -- fast`. Expected: PASS.

- [ ] **Step 5: Commit:** `Lab reports the fewest buys of any machine tier in a run (#357)`.

### Task 3: The check-in rows go strict, then tune and re-pin

**Files:**

- Modify: `src/lab/targets.ts` (drop `reportOnly` from the four check-in rows and update their comment)
- Modify only if the lab needs it:
  - `src/tiers.ts` (first prices and growth);
  - `src/scale.ts` (`BAND_SCALE`, and `KID_RUN_GROWTH`, upward only).
- Modify: `src/pacing.test.ts`, `src/pacing.sim.test.ts`, `src/lab/casual-run.sim.test.ts`, `src/lab/generations.sim.test.ts`, and any other pinned day, buy or price the full gate shows.

**Interfaces:**

- Consumes: Task 1's table and Task 2's row.
- Produces: tuned constants (if any) and green pins.

- [ ] **Step 1: Write the failing test.** In the test that lists report-only rows, the four check-in ids are no longer report-only. That test is `src/lab/guardrails.test.ts`, which already checks `reportOnly` flags. Expect the report-only set to be today's set minus those four ids, plus `every-tier-bought`.

- [ ] **Step 2: Flip the four rows to strict.** Remove `reportOnly: true` from `zero-buy-sittings`, `buys-per-sitting`, `best-open-share` and `best-wait-sittings`. Rewrite their comment: strict since the milestones sliver (#357).

- [ ] **Step 3: Baseline.** Run `LAB_STRICT=1 npm run lab -- --ci` and `npm run lab:generations -- --ci` (in the background; about 3 minutes each). Record every strict miss and the new report row's value per casual type, at 3 seeds, then 20.

- [ ] **Step 4: Tune only if a strict row misses.**
  - Levers, in this order:
    1. first prices;
    2. machine growth (1.10–1.15) and worker growth (1.06–1.10);
    3. `BAND_SCALE` for bands 2–4;
    4. `KID_RUN_GROWTH`, upward only.
  - Never move a bound in `TARGETS` and never change a milestone mark.
  - Use `withFactors` probes, and keep a probe table (factors, misses, finish days) in the task report.
  - **Stop rule:** after about 40 probes with no setting that passes every strict row at 20 seeds, stop. Report the best two candidates and their misses for Flemming.

- [ ] **Step 5: Re-pin** every pacing and sim pin the full gate shows. Each re-pin uses the measured value, with a one-line comment giving the reason (for example "#357 marks: the drill doubles at 10").
  - A test whose meaning changes, for example a tier now bought more, keeps an assertion that would catch a regression. Never weaken it to a bare floor.

- [ ] **Step 6: Verify.** `LAB_STRICT=1 npm run lab -- --ci` and `npm run lab:generations -- --ci` pass at 20 seeds. Report the `every-tier-bought` value per casual type. Then run `npm run gate -- full`: all steps pass.

- [ ] **Step 7: Commit:**
  - `The check-in rows are strict now that every tier has marks (#357)`.
  - If prices moved, a separate commit: `Retune prices for the milestone marks (#357)`.

### Task 4: Docs follow the marks, and a browser check

**Files:**

- Modify: `docs/DESIGN.md` (milestones section, the guardrail list and the check-in rows now strict), `docs/ARCHITECTURE.md` (`milestones` module line), `docs/design-intent.md` (why marks exist: old tiers stay worth a look), `docs/economy-overhaul.md` (mark S3 built, with the measured check-in numbers and the tune, if any).
- No code change.

- [ ] **Step 1: Browser check.** `npm run play -- --save crew` (every tier so far), then open the crew cards. Look at the phone and desktop shots:
  - the cart, drill and worker cards show `N of 10 · …` / `N of 25 · …` lines;
  - no card overflows;
  - the phone layout does not scroll.

  In `log.txt`: no page error, and the save line reads normally. Repeat with `--save mid` for the borer card.

- [ ] **Step 2: Update the docs** listed above. Take the numbers from Task 3's lab run, not from memory.
- [ ] **Step 3:** `npm run gate -- full` passes.
- [ ] **Step 4: Commit:** `Docs follow the milestone marks (#357)`.
