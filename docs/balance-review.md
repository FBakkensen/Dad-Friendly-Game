# Balance review: is the economy fun, and can it be tuned? (Nov 7, 2026)

This is research only. It changes no game code. It was prompted by a phone screenshot taken in the Granite: 2.5M stones, 1,072/s, 32 workers, 13 carts and 11 drills. The best buy, the tunnel borer, cost 7.6M. The buys he could afford were poor value:

| Option       | Price  | Gain   | Stones per stone/s | Payback, live play | Payback, away play |
| ------------ | ------ | ------ | ------------------ | ------------------ | ------------------ |
| Tunnel borer | 7.6M   | +392/s | 19.4K              | 5.4 h              | 18 h               |
| Steam drill  | 1.2M   | +32/s  | 37.5K              | 10.4 h             | 35 h               |
| Mine cart    | 819.2K | +7.9/s | 104K               | 29 h               | 96 h               |

The borer was 5.1M away. At his base crew speed (about 540/s; the 1,072/s on the screen includes a ×2 timer) that is about 2.6 hours of live play, or about 9 hours of away pay at 30%. So the best move was to close the app and come back tomorrow, and the other two buttons were scenery.

## Verdict

- **The screenshot is the normal state of the game, not an edge case.** From day 2 to the end of the run, every simulated player type spends most of their check-ins like this.
- **Retuning numbers alone cannot fix it.** In the sweeps below, retuning only moves the game between two bad states: a few chunky buys with long waits (today), or many buys that barely matter.
- **The economy needs an overhaul. The code does not.** Tiers, rates, milestones, the factor knobs and the strategy lab are all good tools for it. The things to change are the cost curve rule, the tier ladder, how stones turn into depth, and the lab's own guardrails.

## How big the problem is

These numbers come from the strategy lab's own policies, played on main and sampled at the start of every sitting, before the first buy. They are seeds 1–3, tier buys only (the buy sheet). "Payback" is cost ÷ gain on the dad's own schedule, live plus away. "Check-in 4×2" is a new research policy: the design's own two-minute check-in dad, four times a day. The lab has no policy like it today.

| Player                        | Finish day | Buys, whole run | Buys per sitting from day 2 | Sittings with 0 buys from day 2 | Best buy affordable at open   | Payback of the best buy |
| ----------------------------- | ---------- | --------------- | --------------------------- | ------------------------------- | ----------------------------- | ----------------------- |
| Check-in, four 2-min sittings | 5.5        | 91              | 1.4                         | **57%**                         | 41%                           | 19 h                    |
| Checker, six 3-min sittings   | 5.15       | 96              | 1.3                         | **58%**                         | 29% (median wait 54 live-min) | 18 h                    |
| Casual, two 10-min sittings   | 6          | 85              | 3.2                         | 33%                             | 78%                           | 17 h                    |
| Evening, one 20-min sitting   | 7          | 84              | 8.0                         | 17%                             | 83%                           | 13 h                    |
| Optimizer                     | 6          | 106             | 5.2                         | 33%                             | 89%                           | 17 h                    |

What these numbers say:

1. **The whole game is about 90 purchases, and most of them come on day 1.** Casual seed 1 buys 55 / 15 / 2 / 11 / 2 per day. The checker buys 70 on day 1, then 2, 11 and 13.
2. **About 95% of all stones spent go on 7 items.** Casual spends 168M in total: 2 Great Machines take 58% and 4 borers 37%. 53 workers, 12 carts and 14 drills together are about 6%. From day 2 there is only one real thing to save for at a time.
3. **Old tiers die.** Carts stop at 12 and drills at 12–14 for every player type. Carts cost ×2 per unit, so 10 more carts cost 1,024× more. Drills cost ×1.5 per unit, so 10 more cost 58× more. One ×2 milestone at 20 drills cannot catch up with that. From day 2 their payback is 50–100+ hours.
4. **Live play hardly counts.** A 10-minute sitting earns about 3–5% of one night's away pay, and the best machine costs 3–6 hours of live income. From sitting 3 on, the casual dad buys nothing after the first 30 seconds of a sitting. A sitting is "open, spend what came in overnight, close".
5. **The lab already sees it but does not fail on it.** The casual dad's "Value-per-stone stretch" is 11.98 hours: he waits half a day for the best-value buy. `dead-stretch` passes because the target counts only waits where nothing at all can be paid for, and the poor drill or cart still counts as something.

## Why: four root causes

1. **Cost curves are 15–250× steeper than the genre.** Cookie Clicker and Kittens Game use 1.15 per unit. AdVenture Capitalist uses 1.07–1.15, and Clicker Heroes 1.07. Here carts are ×2, drills and borers ×1.5, and the Great Machine ×1.4. With steep curves, each tier gives only about 12–15 buys before it is dead.
2. **The tier ladder has a hole exactly where the screenshot is.** The first drill costs 14K and the first borer 7.6M: a **540×** price jump for 10× the output. A fresh borer is 55× worse value than a fresh drill. It becomes the "best buy" only after drills have climbed 86× up their curve. So the game makes the borer moment by pricing everything else out, and the result is a long save with nothing in between.
3. **Stones are both the currency and the depth.** Every stone spent was dug out of a fixed 240M mountain, so the whole run's shopping budget is about 240M. With 5 tiers and steep curves, that budget comes out at roughly Σ log(budget/first price)/log(growth): about 88 buys. The game buys 85–106. The purchase count is set by the maths, not by any one price.
4. **The run-length targets force long paybacks.** If everything spent goes into income, income grows by about e^(run time / payback). A 5–7 day run with about 100× income growth (95/s → 12K/s) leaves only about 4–5 e-folds. Paybacks of 15–20 hours follow from that. Several guardrails also pull this way: `casual-finish` (days 5–7), `extreme-win` ≤ 0.17 (a 3-hour Marathon may not finish much sooner) and `optimizer-regret` ≤ 1.25. Together they almost require live play and choices to matter very little.

## Can it be tuned? The sweep

The test used a temporary lab-only knob to set each machine tier's cost growth directly, then scaled output to bring the finish day back. The knob is reverted. "Payback" here is for the best tier buy.

| Variant                                      | Casual finish | Checker finish | Buys    | Checker 0-buy sittings | Check-in 0-buy sittings | Best payback (checker) | What breaks                                                                    |
| -------------------------------------------- | ------------- | -------------- | ------- | ---------------------- | ----------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| Today                                        | 6             | 5.15           | 85–106  | 58%                    | 57%                     | 18 h                   | Long waits, dead tiers                                                         |
| Growth 1.15, nothing else                    | 3             | 2.5            | 135–185 | 28%                    | 28%                     | 7 h                    | The run is half as long                                                        |
| Growth 1.15, prices ×3                       | 4             | 3.2            | ~140    | 35%                    | 30%                     | 33 h                   | Shorter run and longer paybacks                                                |
| Growth 1.15, output ×0.35                    | 5             | 4.65           | ~147    | 32%                    | 21%                     | 36 h                   | Each buy matters less                                                          |
| Growth 1.10, output ×0.25 (finish days kept) | 5.5           | 5.15           | 170–250 | **5%**                 | **7%**                  | **151 h**              | 81% of spend goes on drills; borers and the Great Machine are **never bought** |

Two things are clear:

- **Buy count follows the cost-growth rate, not the prices.** At growth 1.15 every variant lands near 140 buys, whatever the price or output scale.
- **With the mountain and run length fixed, there is a frontier.** One end is few meaningful buys with long waits (today). The other end is many frequent buys that barely move the needle (payback of 150 hours, close to the whole run), and those also kill the top tiers. No number tweak gets to "many meaningful buys". That needs a wider range of numbers over the run, which is a structural change.

## What good idle games do

A summary of the research. Sources are listed at the end.

- **Gentle cost growth (1.07–1.15) and many units per tier.** A tier stays worth buying for hundreds of units (Pecorella, Math of Idle Games I).
- **Older tiers are kept alive structurally**, by:
  - count milestones on every tier (AdVenture Capitalist at 25 / 50 / 100…, plus "25 of everything doubles all");
  - 15 cheap ×2 upgrades per building, unlocked at 1 / 5 / 25 / 50 / 100… owned (Cookie Clicker);
  - synergies where a low tier boosts a high one;
  - generators that feed lower generators (Antimatter Dimensions);
  - bottleneck chains where every station must keep pace (Idle Miner Tycoon).
- **Three horizons at once:** the next unit (seconds), the next milestone or unlock (a sitting or a day) and prestige (the run). Pacing is relative: each goal takes about the same share of time as the numbers explode.
- **The return payoff is a shopping moment.** A check-in should buy _several_ things, plus one medium goal reached or in sight (Egg Inc silos and contracts, AFK Arena's chest, Idle Miner Tycoon's upgrade bursts). A bank that cannot buy even one good thing makes the check-in feel empty. That is our 57–58%.
- **Live play gets its own lever and absence is never punished.** Golden-cookie Frenzy gives ×7 for 77 s, Egg Inc has tap-to-collect drones, and Clicker Heroes has separate idle and active builds. Offline rates in the genre run from about 50% to full, with caps of 8–24 hours. Our 30% is at the stingy end, which is why live play feels like nothing.
- **Steepness is tuning; relevance and variety are structural.** A wall with no new idea behind it is the worst pacing pattern.

## Recommendation: a scoped economy overhaul

None of this needs a new engine or a save rewrite. The tier, rate, milestone, upgrade and stretch code already holds every knob.

1. **Re-curve every machine tier to growth 1.07–1.15** (workers stay near 1.19). Pair it with a **×2 milestone every 10 or 25 owned on every tier**, carts and workers included, and cheap per-tier ×2 upgrades. That gives many units per tier, and each one stays worth buying.
2. **Fill the ladder.** Add one or two machines between the drill (14K) and the borer (7.6M), and one between the borer and the Great Machine. Keep each step at about 5–20× the price for 4–8× the output, so there is always an affordable buy within about 2× of the best value. Each new machine needs PixelLab art, so ask first.
3. **Widen the number range by letting depth cost more stones the deeper you go.** The game already does this for kid runs: `stretch` k makes each stone dig 1/k of a stone of depth. Make k grow per band, for example ×1, ×10, ×100, ×1,000, with prices and output scaling in step. Income could then grow 10⁴–10⁶× over a run instead of 100×. That leaves room for hundreds of buys that each add +3–10%, which is the genre's "numbers explode" feeling, while the run length stays where Flemming wants it. This is the one truly structural change, and it would come with its own spec.
4. **Size a check-in, not a run.** Design targets to adopt:
   - at least 3 buys on a typical return;
   - the best buy costs at most about one night's pay;
   - a new machine or milestone comes within 1–2 sittings.
5. **Give the live minutes a reason**, without punishing absence. Golden veins and boosts already exist; make them a strong short ×N on live income (Frenzy-like). Possibly raise away pay toward 40–50%. This collides with `extreme-win` ≤ 0.17, and that guardrail needs Flemming's decision.
6. **Teach the lab what fun means.** Add the two-minute check-in policy, and new guardrails:
   - zero-buy check-ins ≤ 20%;
   - median buys per check-in ≥ 3;
   - the best tier buy affordable at open in at least 60% of check-ins;
   - every tier bought in every band;
   - make the existing value-per-stone stretch strict (≤ 1 sitting).

   Then rerun `extreme-win`, `regret` and the finish window against them. The current guardrails are met, and the game is still dull between days 2 and 5.

Suggested order:

1. Lab metrics and the check-in policy, so the problem fails a build (one sitting).
2. Spec for items 1–3 (brainstorm, one PR).
3. Re-curve and milestones.
4. The ladder machines, with art.
5. Per-band depth scaling.

Steps 3 and 4 alone should fix the screenshot case. Step 5 is what makes the whole run feel like a real idle game.

## How this was measured

A throwaway probe (not committed; it was a script on top of `runPolicy` with an `observe` hook) played each registered lab policy. It records every sitting's opening state, with every tier and upgrade option's cost, gain, value per stone and affordability, and every buy by sitting and second. The sweep wrapper sets `PROBE_FACTORS` (a JSON map of factor ids). The growth experiments used a temporary research knob, `growthset.<tier>`, which set a tier's absolute cost growth in `tierCost`; it was reverted afterwards. The baseline lab report (3 seeds) matched the probe: casual finishes day 6, checker day 5.15, casual value-per-stone stretch 11.98 h.

## Sources

- Anthony Pecorella, The Math of Idle Games, [I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i), [II](https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii), [III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii); GDC EU 2016 [Quest for Progress](https://media.gdcvault.com/gdceurope2016/presentations/Pecorella_Anthony_Quest%20for%20Progress.pdf)
- Cookie Clicker wiki, [Buildings](https://cookieclicker.wiki.gg/wiki/Buildings) (1.15 growth, tiered ×2 upgrades, synergies); [CookieMonster](https://github.com/domoddball/CookieMonster) (payback period)
- [AdVenture Capitalist businesses](https://adventure-capitalist.fandom.com/wiki/Businesses) (1.07–1.15); [Clicker Heroes heroes](https://clickerheroes.fandom.com/wiki/Heroes) (1.07) and [builds](https://clickerheroes.fandom.com/wiki/Builds)
- [Antimatter Dimensions](https://antimatterdimensions.wiki.gg/wiki/Dimensions); [Egg Inc silos](https://egg-inc.fandom.com/wiki/Grain_Silo); [AFK Arena rewards](https://www.appgamer.com/afk-arena/strategy-guide/afk-rewards); [Idle Miner Tycoon tips](https://www.bluestacks.com/blog/game-guides/idle-miner-tycoon/idt-tips-tricks-en.html)
- Alharthi et al., [Playing to Wait (CHI 2018)](https://par.nsf.gov/servlets/purl/10061230); [Machinations on idle games](https://machinations.io/articles/idle-games-and-how-to-design-them); [bugnet idle design guide](https://bugnet.io/blog/how-to-design-an-idle-or-incremental-game)
- The Game Developer and Kongregate pages were checked through search excerpts only (not on this session's network allowlist). Some milestone ladders (AdCap 50 / 100 / 200…) and Cookie Clicker's offline rate are unverified.
