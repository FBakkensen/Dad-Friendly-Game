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

The run-grows and run-cap targets are report-only (`RUN_CAP_DAYS` in `src/lab/targets.ts`). The strict run-1 lab stays green at 20 seeds.
