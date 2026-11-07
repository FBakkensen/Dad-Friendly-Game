# Economy overhaul: design spec (7 Nov 2026)

Status: draft for Flemming. This spec covers several slivers. It ships on its own, and each later sitting plans and builds one sliver from it (`.claude/rules/superpowers.md`). The evidence is in `docs/balance-review.md`. The lab measures that grade it are described in `docs/DESIGN.md`, "Check-in pacing".

## The problem in one paragraph

From day 2 on, a short check-in usually has nothing to buy. The best buy, nearly always the next borer or Great Machine, is several sittings away, and the cheaper buttons are scenery. The lab now measures this. At 3 seeds on main, the two-minute check-in dad buys nothing in 47% of his sittings after day 1, and the checker in 50%. Their median buys per sitting are 0.67 and 0.5. The checker opens with the best buy in reach only 30% of the time, and waits up to 5.7 sittings in a row. Even the casual two-sitting dad buys a median of only two things per sitting. The causes are structural:

- Cost curves are steep: ×2 carts, ×1.5 drills and borers, ×1.19 workers that staff everything.
- The ladder has a hole: the first borer costs 540× the first drill.
- Every stone spent is a stone of depth in a fixed 240M mountain.
- The old 5–7 day run window forced paybacks of 15–20 hours. That window is lifted (Decided, below).

Retuning prices alone only trades long waits for weak buys (the frontier in the review).

## Goals

- **A check-in is a small shopping trip.** After day 1, for every casual player type:
  - at most 20% of sittings buy nothing;
  - the median sitting buys at least 3 things;
  - at least 60% of sittings open with the best buy in reach;
  - the best buy is never out of reach for more than 2 sittings in a row.

  These are the four report-only guardrails in `src/lab/targets.ts`. This overhaul turns them strict.

- **Every machine tier is bought all run**, not just its first dozen, and old tiers stay worth a look.
- **The numbers feel like an idle game.** Income should grow by three or more orders of magnitude over run 1, not about two.
- **Keep what is already promised:**
  - the run is endless: each pass to the kid makes the next run longer and harder (the generations lab, strict). Run 1's length is reported, not graded;
  - extreme win ≤ 0.17 and regret ≤ 1.25 (unless Flemming changes them in decision D5);
  - every kid run longer than the last;
  - the numbers rule (real prices and gains, never payback or "best");
  - two-minute sittings, close is pause, no punishment for being away.

## Non-goals

- No game engine, no new screens beyond the buy-card changes named below, no save rewrite.
- No change to relics, the workshop, engineers, hazards or expeditions, beyond prices that scale with them today.
- No change to away-pay rules in this spec. A live-play lever is a separate, later sliver (S6) with its own decision.

## Design

### A. Gentler curves, workers included

- **Machines.** Cost growth per unit goes from ×2 / ×1.5 / ×1.5 / ×1.4 to the genre band (Cookie Clicker 1.15, AdVenture Capitalist 1.07–1.15). Start with 1.15 for carts, drills and borers, and 1.15 for the Great Machine. A tier may sit lower, for example 1.12, if the lab wants it to stay alive longer.
- **Workers and kids.** Growth goes from 1.1875 to about 1.08. Workers staff every machine, so the worker curve is part of every machine's price. In the probe, a borer at a fifth of its price was still dead while workers stayed at 1.1875: the 85th worker costs about 44M stones, and a borer needs 8.
- **First prices** are re-anchored once A and B are in, by the lab (see Probes). They are not set by hand in this spec.

### B. Depth costs more stones the deeper you go

- **Rule.** A stone dug in band _b_ digs 1/(k × s_b) of a stone of depth. k is the kid-run stretch (`src/scale.ts`, unchanged). s is a new constant per band: s₁ = 1 for the Topsoil, rising for the Granite, Crystal and Deep Heart.
- **Prices do not scale with s.** That is the point: old machines stay cheap while deep stones pour in, and income grows across bands.
- **Depth stays in run-1 units.** Relic depths, layer starts, reveals and materials are all read in depth units, so none of them move. Material counts per band are unchanged.
- **Exactness.**
  - `digStones` must split a haul that crosses a band boundary: the part above pays at the shallow band's s, and the rest at the deep one's.
  - `stonesLeft` becomes the sum, over the bands still to dig, of the depth left in each × k × s_b.
  - Away pay, taps and the field log all go through those two functions, so they cannot drift.
- **Saves.** s is a constant table keyed by band, so there is no new save field and no rules change for the mountain.
  - The field log caps one event's stones at the rules' 240M (`firestore.rules`). A deep-band away haul will pass that, so the cap rises in the same sliver, with the emulator round-trip test.
  - `pocket` is an int with no upper bound, and safe integers hold up to 9e15.
- **Player text.** "Stones left" shows stones at band scales, so the number jumps when a deeper band opens. There is no ratio and no payback. The new curve (#356) ships with no copy change (Flemming, 7 Nov 2026). If the jump reads like a bug in play, a one-line layer-card note becomes its own issue.
- **Existing saves.** The new numbers apply to the run in progress (Decided, below). The save holds only counts, depth and pocket, so nothing migrates: the next load reads the new tables.

### C. Ownership milestones on every tier

- **Every staffed tier gets ×2 marks** in the AdVenture Capitalist and Cookie Clicker style: carts, drills and borers at 10, 25, 50, 100, 150 and 200, and the Great Machine at 2, 3, 5, 10, 25 and 50.
- **Workers get marks too:** at 25, 50 and 100, all workers dig ×2.
- **The existing card line carries the next mark** ("12 of 25 · …"), so there is no new screen. Marks are count-based, so there is no save field.
- Copy for each mark needs Flemming's OK (decision D4).
- Milestones are what keep a cheap old tier worth buying once its curve is gentle. Without them, a 1.15 tier still fades; it just fades later.

### D. Buy several at once

- **Problem.** With A–C, the probe's check-in dad buys a median of 17 things per two-minute sitting. Tapping 17 buttons is a chore, not a shopping trip.
- **Fix.** Each buy card gets a fat "×10" or "Max" toggle that shows the real count and total price (allowed by the numbers rule). A lab measure, `buysPerSitting`, keeps an upper report line, so the lab can see when a toggle is needed.

### E. Fill the ladder, only if the lab still shows a hole

- The 540× gap between the first drill and the first borer may close on its own once workers are cheaper. In the probe, borers went from 3 to 11–16 per run.
- After A–C, if a band still lacks a mid-price option (`bestOpenShare` < 0.6 in one band, or one tier is the best buy in more than 40% of a band's samples), add one machine there.
- **A new tier cannot be a mountain key.** The rules pin the mountain's key list, and a full crew is already at the expression budget (#195). Its count lives in the workshop map, which the client parses, like the run stretch.
- New machine art comes from PixelLab, and Flemming is asked first (pixellab skill).

### F. Guardrails

- **Flip to strict** when S2 and S3 land: `zero-buy-sittings`, `buys-per-sitting`, `best-open-share` and `best-wait-sittings`.
- **Add a report row:** every machine tier bought at least 5 times in every run, for casual types.
- **Must stay strict and green:**
  - every existing row in `TARGETS`;
  - the generations lab (each kid run longer than the last, every machine bought);
  - the pacing tests.
- **No bound moves to go green.** A bound change is a decision for Flemming.

## Probes so far

These came from a research-only lab probe at 3 seeds, with temporary factor knobs that were reverted. Band crossings in a haul were charged at the shallower band's scale, an approximation that sliver S2 must make exact. "Best affordable" is the share of sittings opening with the best tier buy in reach. The probe counted tier buys only and gives a mean per sitting, so its "Main" row differs from the lab numbers in the problem paragraph, which use the Buys sheet and a median.

| Variant (3 seeds)                           | Finish (check-in / checker / casual) | Buys    | 0-buy sittings (check-in / checker) | Buys per sitting (check-in / checker) | Best affordable (check-in / checker) | Notes                                                                  |
| ------------------------------------------- | ------------------------------------ | ------- | ----------------------------------- | ------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| Main                                        | 5.49 / 5.15 / 6                      | 85–106  | 57% / 58%                           | 1.4 / 1.3                             | 41% / 29%                            | Borer waits, dead tiers                                                |
| Machines 1.15 + s = 1/3/9/27                | 5.74 / 5.54 / 5.5                    | 207–275 | 6% / 4%                             | 6.0 / 3.7                             | 85% / 66%                            | Borer dies (3 per run); the Great Machine takes 77% of spend           |
| Machines 1.15 + s = 1/3/9/27 + workers 1.08 | 4.25 / 3.87 / 4.5                    | 294–368 | 10% / 8%                            | 16.9 / 11.7                           | 100% / 97%                           | Every tier bought (11–16 borers, 44–54 drills); income ~100/s → 184K/s |

The third row is the shape to build from. Its run 1 ends after about 4–4.5 days, and that is fine: the run length is not a limit. S2 therefore tunes s and the first prices by feel, not by finish day: the four check-in rows, every tier bought, income growing by three or more orders of magnitude, and each kid run longer than the last. Its buys per sitting are too many to tap, hence D.

## Slivers

Each sliver is one issue (under #354), one sitting and one PR, in this order:

| #         | Sliver                                                                              | Depends on | Done when                                                                                                                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 (#355) | Lab check-in measures and the two-minute check-in dad                               | (none)     | **Built** with this spec: four report-only guardrails, `checkin-4x2`, and the sitting log                                                                                                                                                                                        |
| S2 (#356) | The new curve: A and B together, with first prices re-anchored by the lab           | S1         | The four check-in rows pass at 20 seeds for every casual type. Every existing strict row and the generations lab pass. Run 1's finish day is reported, not graded. The field log cap is raised and the rules test passes. Docs (DESIGN, ARCHITECTURE, design-intent) are updated |
| S3 (#357) | Milestones on every tier (C), then the check-in rows go strict                      | S2         | The four rows are strict and green. Every machine tier is bought at least 5 times per run (report row). Copy is approved                                                                                                                                                         |
| S4 (#358) | Buy ×10 / Max on buy cards (D)                                                      | S2         | A two-minute check-in needs at most about 5 taps to spend a normal return. The phone layout still never scrolls. Verified with `npm run play`                                                                                                                                    |
| S5 (#359) | Ladder machine, only if E's trigger fires after S3                                  | S3         | The trigger measure passes in every band. Art is from PixelLab after asking. The count is stored in the workshop map                                                                                                                                                             |
| S6 (#360) | A live-play lever (a strong short boost, Frenzy-style) and the extreme-win decision | S3         | Its own short spec. It is out of scope here                                                                                                                                                                                                                                      |

S2 is the big one. A alone still misses the check-in rows (28% of check-ins buy nothing) and keeps income within about two orders of magnitude, because a fixed mountain caps the whole run's spending. B alone does nothing for dead tiers. So they ship together, and the probes show they work together.

## Decided

- **The run length is not a limit (Flemming, 7 Nov 2026).** "The run is endless, with each pass to the kid being harder." `casual-finish` (days 5–7) and `thin-habit-finish` (14 days) are report-only rows from now on. The kid-run rule stays strict: every run finishes later than the one before, with every machine bought. The pacing tests that pin a finish day are regression pins: S2 re-pins them and does not treat them as limits.

- **The new numbers apply to the run in progress (Flemming, 7 Nov 2026).** No "new runs only" flag. The rest of today's run gets more stones per stretch in the deeper bands and cheaper machines. Kid runs keep their stretch k on top.

- **Fix two rules inside S2, then retune (Flemming, 7 Nov 2026).** The first tuning pass found two causes that prices cannot reach. (1) Grandpa (#338) sat on the highest running tier, so in a kid run one new borer pulled his tending off a big drill group and lowered income; no kid run then bought a borer or Great Machine. He now tends the group with the most base output. (2) Upgrades and promotions had fixed prices, tiny against the new income, so one of them was the best move for long stretches. They now scale with k × s of the band you stand in. Machine and worker prices still never scale with s.

- **The lab judges each dad's own table (Flemming, 7 Nov 2026).** After the second tuning pass, `dominant-share` and `single-share` are scored on the spends each player type weighs, not on moves it never takes (promote, Cart roads). `small-reveal-wait` counts a material or recipe as used while the bench runs any craft. Bounds are unchanged. Kid-run growth may rise (1/8 → 1/4 in the probe) so each kid run stays longer than the last.

## Open decisions for Flemming

Each decision has a recommendation. D3 (the run in progress) is decided above.

1. **D1: the curve band.** Machines at about 1.15 and workers at about 1.08, with the exact values picked by the lab. _Recommended: yes._ The alternative is stepped prices like Antimatter Dimensions (a jump every 10 units, each with ×2 output), which suits few units per tier but is a bigger UI change.
2. **D2: depth scale per band.** Start from the probe's s = 1/3/9/27 and let the lab settle it by feel. _Recommended: yes._ The alternative is a bigger mountain with every price scaled up, which keeps today's flat ratios and so keeps the problem.
3. **D4: milestone copy and marks.** The marks above, with lines in the existing voice ("Twenty-five drills and the crew finds its rhythm."). _Recommended: approve the marks; copy goes in the S3 PR body._
4. **D5: the guardrails.** Turn the four check-in rows strict after S3, and keep every existing bound as it is. _Recommended: yes._ If S2 cannot meet extreme win ≤ 0.17 with live play this weak, report it and decide then; do not loosen it in advance.
5. **D6: buy ×10 / Max.** _Recommended: yes, as S4._ Without it the check-in turns into a tapping chore.
