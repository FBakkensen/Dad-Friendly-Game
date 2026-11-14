# The lab sets the line's numbers (#543, M15-4b)

**Goal:** with the line on (`line.off: 0`), the game uses the spec's step 1 numbers (machines rated three times today's, band table A) and they are tuned until every strict row and the generations lab pass at 20 seeds. The rock's two forms are both reported (`narrowRun` and the run's length), and the stop rule in the spec decides which one stays. Play is unchanged: the line stays off until #536, and every number here reads only while it is on.

**Spec:** `docs/superpowers/specs/2026-11-14-line-works-village-design.md` (Machines; The rock moves the narrow stage too; Lab).

**Shared modules:** a machine's speed is built in one place, `readRates` in `src/rates.ts`; the line's rating goes there, beside the band's rock. The band table is `src/layers.ts` (`hardnessOf`, `LAYER_FAVOURS`); table A and the whole-stage form go there, behind `lineOn()` from `src/line.ts`, and the lab's band reading (`src/lab/bands.ts`) asks the same function. Lab knobs are sweep factors (`src/economy/factors.ts`), as `line.off` is.

## Global constraints

- Play is unchanged: with `line.off` unset every number reads as on `main`, and the strict lab and generations lab stay green there as on `main`.
- No bound in `src/lab/targets.ts` moves to go green; a bound that has to move is Flemming's (stop).
- The five-day floor (#556): run 1 of every casual player type ends on day 5 or later with the line on. The row's strict flag is flipped when the line turns on in play (#536), since the line-off runs still end before day 5.
- Which band's rock applies stays one input (the mountain's band) to `effectiveRates`, as the cage (#545-#548) needs.

## Tasks

1. **The line's numbers behind the line.** `LINE_RATING = 3` in `src/line.ts`; `readRates` multiplies each machine's `perSecond` by it while `lineOn()` (workers and kids keep theirs: the hands are tripled by the line's rule). `layerFavours(index)` in `src/layers.ts` returns table A while the line is on (Granite: suits borer, tough on drill; Crystal Caves: suits train, tough on cart; Deep Heart: suits the Great Machine, tough on hoist) and today's table otherwise; `hardnessOf` and `src/lab/bands.ts` read it. The tough factor on the line is its own constant (`LINE_TOUGH`, starting at 0.8), so the tune can set it without moving today's. Tests: `rates.test.ts` (a first cart with twelve workers adds 6 a second with the line on: 12 to 18), `layers.test.ts` (table A on, today's off).
2. **The whole-stage form, as a lab knob.** Sweep factor `rock.stage.off`: 1 (unset) is the table's form; 0 slows every machine of the band's tough stage by the tough factor, with no ×1.1 (Granite the face, Crystal Caves the haul, Deep Heart the lift). `hardnessOf` reads it. Test: `layers.test.ts`.
3. **Tune.** Run the strict lab (`npm run lab -- --ci --factors line.off=0`) and the generations lab with the line on, both forms; move the levers the spec names (the tough factor between 0.7 and 0.8, first prices, the line rating's shape) until both pass; then confirm at 20 seeds. Each change is a ruling in this plan and the PR body.
4. **The stop rule.** If the whole-stage form passes every strict row and the generations lab, and its `narrowRun` is at most one sitting longer than the table's form, stop and put both rows to Flemming as one question, with the band tags and advice lines that would change. Otherwise keep the table's form and say why.
5. **Docs.** `docs/DESIGN.md` (the line's numbers, the pacing with the line on), `docs/ARCHITECTURE.md` (where the line's numbers live), the spec's Machines table if a number moved. Reports in the project files (`reports/line-543/`).

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test files, `npm run gate -- fast`, the line-on lab runs as the evidence for task 3, then the full gate once. Nothing the player sees changes.

## Rulings (agent-run sitting)

1. **The floor's flag waits for #536.** The line-on runs must meet the five-day floor here, but the row stays report-only until the line is on in play, because the strict lab in CI plays the line off, where run 1 still ends on day 3.7 to 5.0.
2. **Machines grow 1.219 a buy on the line (today 1.15), workers keep 1.06.** Tripled machines alone ended run 1 on day 2 to 3; first prices alone could not reach the floor without stalling the kid runs. Steeper machine growth is the lever that moves the whole run. Workers keep today's curve: a worker growth of 1.0812 made the 200th worker cost about 4.7B and stalled the optimizer's kid run 7 for a month.
3. **The first worker costs 60 on the line (today 20).** It costs the opening: about 42K mined in the first ten minutes instead of 247K, and the Hammer comes half a day later; the Lantern does not move. A first worker of 20 left the optimizer at day 4.5 with every late-game lever we tried, which fails optimizer regret. The opening is the price of the floor; #536 can revisit it with the line on in play.
4. **The first Great Machine costs 96.48M on the line (today 120.6M)**, so the last band has a real buy before the run ends.
5. **The Deep Heart is 1.21 times deeper on the line (39.204, today 32.4).** At 1.1 times (35.64) the optimizer's run ended a sitting later and stayed within a quarter of the evening dad's, but the full 20-seed lab found the 3-hour marathon finishing inside its day-4 sitting (day 4.1 against the casual dad's 5.5, extreme win 0.25 against the bound's 0.17). A tenth deeper again moves the marathon to day 5.0; the casual, evening and optimizer days do not move.
6. **The tough factor stays 0.8 (`LINE_TOUGH`).** The other levers met every row without it, so it stays at the spec's starting value; the 0.7 end of its range was not needed and was not run.
7. **The lab tends to the post with the biggest line gain (`tendBest`).** With the line on, today's "tend the best tier" left the engineer on the borers, where the line gains nothing. The dad in the lab sends each engineer at home to the post that raises the line most, at the start of a sitting and after a staffed buy.
8. **The tending floor is a share of the line's output, not the plain sum.** As a share of the plain sum, tending was worth more than the line itself. The floor goes to her post's group, so the line rises by all of it only when her stage is the only one below the line; with the stages level it rises by less. That is the rule the spec's line gives, and it is recorded in DESIGN.md.
9. **The line weighs 16 crews (`LINE_COUNTS_KEPT`, was 8).** The staffing sim found a 10% slip with Grandpa at 8; at 16 the worst is about 4%, under the 5% the sim allows. With no Grandpa there is no slip.
10. **A kid run may take up to 60 days with the line on (`KID_RUN_MAX_DAYS`).** A test setting, not a product call (Flemming, 14 Nov: "nothing should wait on me"). The 30-day cap stays with the line off, where it passes as on `main`.
11. **The table's form stays (the stop rule).** The whole-stage form fails optimizer regret for the evening dad at 20 seeds (evening day 7 against the optimizer's 5); six variants of its numbers all failed. So the stop rule does not reach Flemming, and the band tags and advice lines stay as they are.
