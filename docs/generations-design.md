# Growing generations: design research (M13-1, #253)

Research only. No game code or tuning changes. Every lab limit below needs Flemming's OK.

## The problem

Today each kid run is shorter than the last, so passing the mine on feels like replaying a smaller game. Each pass adds one Legacy, and each Legacy adds +0.5 to crew and tap speed (`LEGACY_STEP` in `src/rates.ts`: ×1, ×1.5, ×2, ×2.5). The mountain stays at 240M stones (`MOUNTAIN_STONES`), and the four layers start at fixed depths: Topsoil 0, Granite 10M, Crystal Caves 45M, Deep Heart 120M.

### Baseline: today's runs 1-4

Measured on main at `7f23ccd` with the lab's day-by-day dad sim (`simulateDadRun`, legacy 0-3, to the Mantle):

| Dad                 | Run 1 | Run 2 | Run 3 | Run 4 |
| ------------------- | ----- | ----- | ----- | ----- |
| Plain (crew only)   | 6     | 4.5   | 4     | 3.5   |
| Buys upgrades       | 5.5   | 4.5   | 4     | 3.5   |
| Upgrades and boosts | 5.5   | 4.5   | 4     | 3.5   |

The sim plays two sittings a day, so finish days come in half-day steps. These numbers fit a simple curve closely:

`T(B) ≈ 5.5 × (1 / B)^0.5` days, where B is the Legacy bonus.

It predicts 5.5 / 4.5 / 3.9 / 3.5. In other words, stones mined grow roughly with the square of time inside a run, so doubling speed only shortens a run by about 30%.

## What other games do

**Pecorella, Math of Idle Games I-III.**

- Part I: within a run, costs grow exponentially while production grows polynomially. A prestige moves the player further along the cost curve before they stall. https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i
- Part II: generators that produce generators give polynomial growth of t^n/n!. That still loses to exponential costs, which is the behaviour we want. https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii
- Part III: prestige gains are usually a fractional power of earnings, and he lists the formulas below. https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii
  - Cookie Clicker uses a cube root of lifetime earnings, so doubling the prestige currency needs about 8× the earnings.
  - AdVenture Capitalist uses 150·√(lifetime/1e15).
  - Realm Grinder uses a triangular-number square root of max earnings, so doubling needs 4× the earnings.
  - Egg, Inc. uses (run earnings/1e6)^0.14, so doubling needs about 128× the earnings.
  - His takeaway: prestige should give "a huge boost that gives a sense of power and progress" while it also "reins growth back in".
- Pecorella's GDC Europe 2016 talk, "Quest for Progress", gives the same ladder-climbing view. https://media.gdcvault.com/gdceurope2016/presentations/Pecorella_Anthony_Quest%20for%20Progress.pdf

**Cookie Clicker.** Heavenly chips are a cube root of cookies baked over all time (`HowMuchPrestige` in https://orteil.dashnet.org/cookieclicker/main.js). Each run needs far more cookies for the same step, so the reward grows slower than the challenge.

**Realm Grinder.** Each Reincarnation costs 1,000× more gems than the last. Every Reincarnation adds +50% production and unlocks new perks at fixed counts: R2, R4, R5, R10, R20, and later. The challenge grows exponentially, the reward linearly, and new mechanics arrive per generation. https://realm-grinder.fandom.com/wiki/Reincarnation, https://musicfamily.org/realm/Reincarnation/

**Kittens Game challenges.** Each challenge has a base reward and an "Increasing Challenge" and "Increasing Reward" per completion. For example, Winter Has Come makes cold winters 2% harsher and 5% more frequent each run, while the reward grows 5% per run with a cap and diminishing returns. This is the closest match to "each kid run harder and better rewarded". https://wiki.kittensgame.com/en/game-tabs/challenges

**Egg, Inc.** It uses a very flat prestige curve. Pecorella reads this as a way to limit how much idle time drives progress (Part III). We do the opposite: our away pay is generous by design (#278).

**Common pattern.** The reward per generation is real but sub-linear: a root or linear rate. The challenge grows faster, either exponentially (Realm Grinder) or as a rising requirement (Kittens). New content arrives at fixed generation counts.

## Proposal: each run a bigger copy of the last

Keep the Legacy bonus as it is (B_N = 1 + 0.5·(N−1)). Scale run N's mountain and every price by one factor k_N:

- Mountain: 240M × k_N.
- Layer starts: 10M, 45M, 120M × k_N. Reveals stay at fixed depths within each layer, at the same share of the mountain.
- Machine, upgrade, promotion and recipe prices: × k_N.
- Output: the Legacy bonus B_N, as today. Taps scale with it, as today.

If prices and the mountain both scale by k and speed scales by B, run N plays as a copy of run 1 with time stretched by k/B. Every price-to-income ratio, and so "every machine stays worth buying", is the same as in the tuned run 1. The M12 lab guardrails then still hold run for run, and that is the main reason to pick this shape over growing only the mountain.

Pick the run length T_N, then set k_N = B_N × T_N / T_1.

### Example numbers (target: +0.5 day per run, T_1 = 5.5)

| Run | Legacy bonus | Today: days | Proposed: days | k (size and prices) | Mountain |
| --- | ------------ | ----------- | -------------- | ------------------- | -------- |
| 1   | ×1           | 5.5         | 5.5            | 1                   | 240M     |
| 2   | ×1.5         | 4.5         | 6              | 1.64                | 393M     |
| 3   | ×2           | 4           | 6.5            | 2.36                | 567M     |
| 4   | ×2.5         | 3.5         | 7              | 3.18                | 764M     |

k grows faster than B, as in Realm Grinder and Kittens Game, but gently: about ×1.3-1.6 per run, not ×1,000. The kid still feels stronger, because the opening layers go by much faster at ×1.5 and above. The bigger numbers are real numbers on the buy rows, so the numbers rule holds.

### Alternatives

| Shape                                 | What grows                   | Run 2-4 days       | Machines worth buying                    | Notes                             |
| ------------------------------------- | ---------------------------- | ------------------ | ---------------------------------------- | --------------------------------- |
| Today                                 | bonus only                   | 4.5 / 4 / 3.5      | yes                                      | shorter each run                  |
| Bigger mountain only, prices fixed    | mountain                     | unknown, longer    | no: late machines become trivially cheap | breaks M12 bands                  |
| Scaled copy (recommended)             | mountain and prices × k      | 6 / 6.5 / 7        | yes, same ratios as run 1                | predictable, testable             |
| Scaled copy + 10% per run             | k from T_N = 5.5 × 1.1^(N−1) | 6.05 / 6.66 / 7.32 | yes                                      | longer runs sooner                |
| Smaller bonus (+0.25) + light scaling | both                         | depends            | yes                                      | a weaker kid feels less rewarding |

Cap the run length: from the run where T_N would pass 7.5 days, keep T at 7.5 days. A week-plus run is about as much as a dad will commit to.

## New things per generation (options)

Inspired by Realm Grinder's perks unlocked at fixed counts. One new thing per generation, revealed at a fixed depth with the M11 teach pattern:

- Run 2: a fifth layer at the bottom (working name "The Old Roots"), with its own favoured machine (M12 rule). It sits inside the scaled mountain, so k covers it.
- Run 3: the kid's first worker starts as a Journeyman, carried as a family trait. It speeds the opening without touching the price ratios.
- Run 4: a Kittens-style family challenge the dad can choose, such as "no boosts this run", with a lasting reward like +5% away pay per completion, capped.

Each still needs its own design issue. None is part of M13-1.

## Lab plan

1. Multi-run sim: `simulateGenerations(runs)` chains `passTheMine` (keeping recipes and taught state) and plays each run with the lab's policies (casual, checker, evening, marathon, optimizer) at 20 seeds. It reports finish days per run.
2. Scale knob: a lab factor `generation.k` for mountain, layer starts and prices, read through `factor()` like the existing `price.*` factors, so shapes can be probed before game code changes.
3. New targets. Each needs Flemming's OK before it becomes strict:
   - `run-grows`: for each player type, run N+1 finishes later than run N. The proposal: at least +0.25 day and at most +1 day.
   - `run-cap`: no run past 7.5 days for the casual dad.
   - Every existing strict target (finish window, extreme win ≤ 0.17, dead stretch, favoured machine in band, regret) is checked per run, not only run 1.
4. Probe +0.5 day/run, +10%/run and +0.25 day/run at 3 seeds. Confirm the pick at 20 seeds.

## Game rules kept

- Two-minute sittings: the run is longer but each sitting is unchanged.
- Dad tone. The pass-to-kid card talks about a bigger mountain for a stronger kid, never about extra time.
- No payback hints.
- Reveals at fixed depths, scaled with the mountain.
- Every machine stays worth buying, because price ratios are unchanged.

## Decisions for Flemming

1. Shape: a scaled copy (mountain and prices × k), or something else.
2. Growth target: +0.5 day per run, +10% per run, or another rate, and the cap (7.5 days proposed).
3. Whether to make `run-grows` and `run-cap` strict lab targets.
4. Whether to add one new thing per generation, and which (fifth layer, family trait, family challenge).
5. Existing saves: apply scaling from the next pass onward only. Proposed: yes.

## Lab results (M13-2)

`npm run lab:generations -- --ks 1,1.75,2.55,3.5 --seeds 20` uses a lab-only stretch, `generation.k`. Each stone dug takes 1/k of a stone of depth, so the mountain, layer starts and relic depths are k times deeper. Stone prices for workers, machines, upgrades, boost floors and promotions are k times higher. Unset, it is 1, so the game itself does not change.

Measured mean finish day over 20 seeds, with k = 1 / 1.75 / 2.55 / 3.5:

| Player    | Run 1 | Run 2 | Run 3 | Run 4 | Longer each run | No run past 7.5 | Machine never bought |
| --------- | ----- | ----- | ----- | ----- | --------------- | --------------- | -------------------- |
| Casual    | 6     | 6.5   | 7     | 7.5   | yes             | yes             | none                 |
| Checker   | 5.15  | 5.94  | 6.25  | 6.84  | yes             | yes             | none                 |
| Evening   | 7     | 8     | 8     | 9     | no              | no              | Great Machine, run 3 |
| Marathon  | 5     | 5     | 6     | 6.03  | no              | yes             | Great Machine, run 2 |
| Optimizer | 6     | 6.5   | 7     | 7     | no              | yes             | none                 |

Today, with k = 1 every run, runs get shorter: casual 6 / 4.5 / 4 / 3.5, and the Great Machine goes unbought in some kid runs for Evening and Marathon too.

The claim that a run stretches by k/bonus only holds exactly at k = bonus, where every run equals run 1. For k above the bonus the run grows more slowly than k/bonus. Casual measured about (k/bonus)^0.66, and the square-root fit predicts 6.5 / 6.8 / 7.1, so the doc's k values were too small.

The run-grows and run-cap targets are strict (approved 4 Nov 2026) (`RUN_CAP_DAYS` in `src/lab/targets.ts`). The strict run-1 lab stays green at 20 seeds.

### Great Machine gap (M13-3)

The Great Machine opened at the Deep Heart entrance (120M). A once-a-day dad often reached that depth in the middle of a sitting, right after spending on borers, and the next night's away pay dug out the rest. He reached the bottom without buying it. Lowering its price did not help. Opening it 12M sooner (108M, the last stretch of the Crystal Caves) gives him a sitting with it in every kid run.

With k = 1 / 1.75 / 2.55 / 3.5 over 20 seeds:

| Player    | Run 1 | Run 2 | Run 3 | Run 4 | Run-length rule | Machine never bought |
| --------- | ----- | ----- | ----- | ----- | --------------- | -------------------- |
| Casual    | 6     | 6.5   | 7     | 7.5   | pass            | none                 |
| Checker   | 5.04  | 5.81  | 6.15  | 6.75  | pass            | none                 |
| Evening   | 7     | 8     | 8     | 9     | pass            | none                 |
| Marathon  | 5     | 5     | 6     | 6.12  | pass            | none                 |
| Optimizer | 6     | 6.5   | 6.51  | 7     | pass            | none                 |

The run-length rules are strict (approved 4 Nov 2026). Twice-a-day types: each run longer than the last, none past 7.5 days. Once-a-day types: each run at least as long as the last, and at most 2 days past their own run 1. Run 1's strict lab is green at 20 seeds: Checker finishes on day 5.04 with an extreme win of 0.160.
