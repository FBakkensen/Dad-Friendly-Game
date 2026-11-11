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

The Great Machine opened at the Deep Heart entrance (120M). A once-a-day dad often reached that depth in the middle of a sitting, right after spending on borers, and the next night's away pay dug out the rest. He reached the bottom without buying it. Lowering its price did not help. In kid runs (run 2 on) it opens at 0.9 of its depth (108M in run-1 terms, times k), which gives him a sitting with it in every kid run. Run 1 keeps 120M: opening it at 108M there pushed Checker under day 5 in the strict run-1 lab.

With k = 1 / 1.75 / 2.55 / 3.5 over 20 seeds:

| Player    | Run 1 | Run 2 | Run 3 | Run 4 | Run-length rule | Machine never bought |
| --------- | ----- | ----- | ----- | ----- | --------------- | -------------------- |
| Casual    | 6     | 6.5   | 7     | 7.5   | pass            | none                 |
| Checker   | 5.04  | 5.81  | 6.15  | 6.75  | pass            | none                 |
| Evening   | 7     | 8     | 8     | 9     | pass            | none                 |
| Marathon  | 5     | 5     | 6     | 6.12  | pass            | none                 |
| Optimizer | 6     | 6.5   | 6.51  | 7     | pass            | none                 |

The run-length rules are strict (approved 4 Nov 2026). Twice-a-day types: each run longer than the last, none past 7.5 days. Once-a-day types: each run at least as long as the last, and at most 2 days past their own run 1. Run 1's strict lab is green at 20 seeds: Checker finishes on day 5.04 with an extreme win of 0.160.

## In the game (M13-4)

The stretch now lives in the game, in `src/scale.ts`: `kidStretch(legacy)` (see below) and `KID_MACHINE_OPENS` (0.9). The lab reads the same values, so the strict kid-run lab plays the real game.

- **When it applies.** Passing the mine to the kid sets the new run's `stretch` from the Legacy. A run already under way keeps its numbers. A save without a stretch plays exactly as before (k = 1), so run 1 and every old save are unchanged.
- **Saves.** The stretch is saved in the workshop map beside the mountain, not in the mountain itself. The cloud rules only check that this map is a map, and the mountain's key list cannot grow (#195), so no rules change is needed. A kid run digs fractions of a depth stone; the save rounds `remaining` up to a whole number (at most one stone of depth comes back). The field log rounds the same way and caps its pocket at the rules' limit.
- **Runs 5 and on.** The stretch keeps growing with every generation; there is no last run and no ceiling (see below).
- **Player text.** Prices, lock cards (`joins your crew at 12.2M stones`), stones left, the Legend's stones moved, save cards and how-it-works show this run's stones. The pass-to-kid card says "A bigger mountain for your kid" while the stretch still grows.
- **Workshop recipes.** Stone prices stretch with k (M13-5). Materials stay the same count. Example at Legacy 3 (k ≈ 4.73): Blasting charge 100K → 472.6K stones, still 4 clay; Iron rails 500K → 2.3M stones, still 4 iron.

## Longer every run, forever (M13-4 rework, 4 Nov 2026)

Flemming rejected the 7.5-day ceiling: "the whole idea is they take longer and longer". The rule is now one strict rule for every player type: run N+1 finishes later than run N, every run, with every machine bought. The ceiling and the once-a-day spread are gone.

**Formula** (`src/scale.ts`, the lab reads it): k = bonus × (1 + g·L)², with bonus = 1 + 0.5·L, L = the Legacy of the new run and g = `KID_RUN_GROWTH` = 1/8. The square root fit says a run lasts about run 1 × (1 + g·L); measured runs grow a bit faster than that, about 15% per run early and 11% by run 8. There is no table that ends, so runs keep growing until `MAX_STRETCH` (1M since #366) holds k at about Legacy 240, where the whole mountain is still a safe integer count of stones.

**Why this shape.** Prestige games make each reset a longer climb: Realm Grinder makes each reincarnation cost 1,000× more gems than the last, and players report later reincarnations take longer (a week each by R140) [Realm Grinder wiki, Reincarnation; r/realmgrinder "Does the time between reincarnations get shorter"]. Kittens Game and Pecorella's idle-game talks (GDC 2016) frame the reset as a bigger copy of the last run. A steady percentage step feels like "a bit longer each time" without the runaway of a 1,000× wall.

**Candidates** (g = 1/16, 1/12, 1/8; 3 seeds, runs 1-8, days):

| g       | Casual                                    | Checker     | Evening                             | Marathon                            | Optimizer               | Rule                     |
| ------- | ----------------------------------------- | ----------- | ----------------------------------- | ----------------------------------- | ----------------------- | ------------------------ |
| 1/16    | 6 / 6.5 / 7 / 7.5 / 8 / 8.5 / 9.5 / 10    | 5.15 … 9.13 | 7 / 8 / 8 / 9 / 9.01 / 10 / 11 / 12 | 5 / 5 / 6 / 7 / 7 / 7.05 / 8 / 9.01 | 6 / 6.5 / 6.5 / … / 9.5 | miss (ties)              |
| 1/12    | 6 / 6.5 / 7.5 / 8 / 9 / 9.5 / 10.5 / 11.5 | 5.15 … 10.8 | 7 / 8 / 8 / 9.01 / … / 13           | 5 / 5 / 6 / … / 9.06 / 9.12         | 6 … 11.5                | pass, by hair-thin steps |
| **1/8** | 6 / 7 / 8 / 9.5 / 10.5 / 12 / 13.5 / 15   | 5.15 … 14.5 | 7 … 18                              | 5 / 6 / 7 / 8 / 9.06 / 10 / 12 / 13 | 6 … 16.5                | pass, clear steps        |

1/8 is the smallest that gives every type, including the once-a-day dads, a clear step every run.

**20 seeds, g = 1/8 (days):** see the PR table. CI plays 8 runs at 3 seeds (`KID_RUNS_CI`).

**High generations.** Run 8-12 (k 21-37): stones left read "14.6B", prices stay short (">999T" only for absurd cart counts, as in run 1), whole numbers stay safe, saves round-trip. The field log caps any event's stones at the rules' 240M per event (an away haul in a big kid run can pass it), as it already did the pocket.

## Workshop recipes stretch (M13-5)

Workshop stone costs use the same `k` as machines and upgrades (`recipeCost(id, stretch(mountain))`). Materials do not. Run 1 is unchanged. The generations lab still requires each run longer than the last with every machine bought.
