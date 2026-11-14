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
