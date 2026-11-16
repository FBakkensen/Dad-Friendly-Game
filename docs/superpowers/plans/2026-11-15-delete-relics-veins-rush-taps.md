# Relics, golden veins, the Gold rush, the dig and the upgrades that went are deleted (#728) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the model, save ids, lab rows, policies, measures and art wiring of the relics, golden veins, the Gold rush, the dig's taps and the eight upgrades that went, and bump the save to version 10.

**Architecture:** A deletion sliver. The save version goes first, so every later task may drop a save id without a reader for the old one. Then each feature leaves in its own task, model to labs, keeping today's mountain (`fresh.off=1`, unit tests and labs only) playing everything that stays. The frame (the live game) shows nothing new.

**Tech Stack:** TypeScript, Vitest, Firestore rules (emulator test), the strategy lab.

**Spec:** `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "What goes, and what stays" (the table "Where today's parts land"). Issue #728, part of #665.

## Global Constraints

- **Resets the save.** `SAVE_VERSION` 9 → 10 (`src/persist.ts`); `firestore.rules` `data.version >= 10`. A v9 save is set aside, never converted (`.claude/rules/observable-saves.md`).
- Out of scope: the pass, Legacy, kid runs, Grandpa and the generations lab (#729). They keep working in today's mountain. Anything still in play stays.
- Stays: `map` and `boots` (lost tools), every other recipe, keepsakes, engineers, expeditions, trouble, the `tapsPerSitting` measure and `taps-per-sitting` target (they count buy taps, not digs).
- Never lower a coverage floor (`vite.config.ts`); never skip a test. A test that only proved a deleted feature is deleted with it.
- No function over 150 lines or cognitive complexity 15 (`npm run functions`).
- knip (strict and `--production`) finds nothing this sliver leaves behind.
- No new player-facing copy. Never "face", "hands" or "by hand".
- Ladder: the test files touched, then `npm run gate -- fast` at the end of each task. Commit and push each task on `claude/project-thread-tj0lg3` (`git push -u origin claude/project-thread-tj0lg3`).
- A guardrail in `src/lab/targets.ts` that fails is a stop: do not change its limit; report it.

## Rulings (agent-run sitting)

1. **Relic gates become depths, so Legacy and kid runs keep their pace.** The Kid worker's `needs: "crown"` becomes `opensAt: 70_000_000` (the Crown's depth). The Great Machine drops `needs: "hammer"`: its `opensAt` of 120M is already deeper than the Hammer's 25M. Legacy's `hasRelic(mountain, "mantle")` goes: the Mantle's depth is the whole mountain, which `remaining > 0` already checks. `lab/casual.ts` uses `MOUNTAIN_STONES` for the mantle depth. `TierLock` loses its `relic` kind and `Tier` its `needs`.
2. **Relic powers go** (spec table): the Shield's 24-hour away cap (`SHIELD_AWAY_CAP_MS`), the Heart's away bonus (`heartBonus`, `AwayReport.heart`), the Lantern's vein gap. Today's away pay uses the base cap only.
3. **The boosts empty out.** `sharper` and `overtime` are the only boosts, so `src/boosts.ts`, `Mountain.boosts`, the `boost:*` teach ids, `boostShown`, `crewTimer`'s Overtime part and the `boost-junkie` policy all go. `mine-view.ts` stops reading `crewTimer` if nothing else is left in it.
4. **Today's labs change pace.** The pacing ledger is written again with `npm run lab:ledger`; its relic columns go. The PR body says why (taps, boosts, veins and relic powers left today's mountain).
5. **The field log's snapshot** drops `tapYield`, `relics`, `boosts` and `upgrades.tap`/`upgrades.steady`; `firestore.rules` and its emulator test follow. Log codes `relic.found`, `vein.tap` and `rush.land` go with their events.

## Review Focus

1. A v9 save on the phone or in the cloud at boot: set aside at `{key}:v9` / Saved copies, a fresh v10 mountain starts with the old run stamp (`save-reset.test.ts`, `persist.test.ts`).
2. A stored v9 Firestore document is replaced, and a v9 write refused (`rules-test/firestore.rules.test.ts`, as #664 added for v8).
3. A field-log write from this build passes `firestore.rules` with the smaller snapshot (emulator test and `rules-drift.test.ts`).
4. Today's Kid worker and Great Machine still open at the same depth, and Legacy still opens only at the bottom (`crew.test.ts`, `legacy.test.ts`).
5. The frame boots, plays and saves on `?memorySave=1` with no page error (`npm run play` on `start` and `night`).

---

### Task 1: The save is version 10

**Files:** `src/persist.ts`, `firestore.rules`, `src/save-ledger.test.ts`, `rules-test/firestore.rules.test.ts`, the version-literal tests (`persist.test.ts`, `firebase-save.test.ts`, `save-newer.test.ts`, `phone-backup.test.ts`, `save-reset.test.ts`, `session-save.test.ts`, `frame-save-cards.test.ts`), `tools/browser/fixtures.ts`, `tools/browser/fixtures.test.ts`, `docs/ARCHITECTURE.md` (The save), `.claude/rules/observable-saves.md`.

Follow the version hunks of commit 64f56f3 (#664's bump 8 → 9).

- [ ] Shift every "newer" literal 10 → 11, "current" 9 → 10, "older" 8 → 9 in the tests; add the rules test "a stored v9 save is replaced and a v9 write refused" next to #664's v8 one.
- [ ] Run them; they fail. Set `SAVE_VERSION = 10`, `firestore.rules` `>= 10` (and its comment), the fixtures' version, the docs' "version 9" lines.
- [ ] Run the touched tests and `npm run test:rules` (the emulator; java is installed); then `npm run gate -- fast`. Commit "The save is version 10 (#728)".

### Task 2: The relics are deleted

**Files:** delete `src/relics.ts`, `src/relic-rows.ts`, `src/board-relics.ts`, their tests and the relic PNGs nothing else imports (`src/assets/board/relic-*.png`; check `docs/ART.md` and any asset manifest). Modify `tiers.ts`, `crew.ts`, `legacy.ts`, `rates.ts`, `mountain.ts`, `expeditions.ts` (glimmer finds, `TRIP_FIND_IDS.glimmer`, the find odds that named them), `session.ts`/`store-session.ts` (the reveal notice, `relic.found`), `field-log.ts`, `ledger-rows.ts`, `ledger-panel.ts`, `ledger-parts.ts`, `board-how-art.ts`, `how-it-works.ts` (the `relics` system and `relics/*` art keys), `screen-words.ts`, `economy/finds.ts`, `scale.ts`, `layers.ts`, `save-choice.ts`, `board-*.ts` readers, `lab/ledger.ts` (relic columns), `lab/casual.ts`, `lab/bands.ts`, `lab/reveal.ts`, `save-format.ts` (trip find ids), `save-ledger.test.ts`, `tools/field-log.ts`, `tools/review/prompt.ts`.

**Interfaces:** Produces `Tier` without `needs`; `TierLock` = `depth | later`; `AwayReport` without `heart`; `paidAwayMs(mountain, gone)` with the base cap only.

- [ ] Tests first: `crew.test.ts` "the Kid worker opens at 70M mined" and "the Great Machine opens at 120M mined" (today's mountain); `legacy.test.ts` keeps its bottom-only test. Delete tests that only proved relics or their powers.
- [ ] Apply Rulings 1 and 2. A How card or other card that used a `relics/*` art key loses that picture only if it is reachable from the frame; otherwise the card goes with its dead caller (check `frame-ledger.ts`/`ledger-panel.ts` reach before deleting). No placeholder art.
- [ ] `npm run typecheck`, the touched tests, `npm run gate -- fast`. Commit "The relics are deleted (#728)".

### Task 3: Golden veins and the Gold rush are deleted

**Files:** delete `src/veins.ts`, `src/gold-rush.ts` and their tests. Modify `economy/actions.ts` (`mineVein`, `veinReward`, `veinOftenScale`, the moves `tapVein`, `tapQuickVein`, `missQuickVein`, `veinGain`), `mountain.ts` (`rushUntil`, `rushBank`, `heldForRush`), `store-context.ts` and `session.ts` (`awayGap`), `workshop.ts` (vein effects), `lost-tools.ts` (`glintScale` goes in Task 5 with the lamp; here only its vein caller), `field-log.ts` (`vein.tap`, `rush.land`), `ledger-rows.ts`, `screen-words.ts` (`veinGaveLine`, `veinWords`, `rushHeldWords`), `how-it-works.ts` (veins system), `lab/run.ts`, `pacing.ts`, `save-format.ts` (clock `gold-rush`, run `rushBank`), `save-ledger.test.ts`, `rules-test/firestore.rules.test.ts` (rush lines), dead board DOM in `scripts/visual/measure.mjs`, `kit.mjs`, `mockup-check.mjs`, `scripts/ui-audit.mjs` only where it names veins.

- [ ] Delete the vein and rush tests; adjust mixed tests (`actions.test.ts`, `mountain.test.ts`, `session.test.ts`, `field-log.test.ts`, `save-format.test.ts`) so they no longer build rush or vein state.
- [ ] Remove the code. `npm run typecheck`, touched tests, `npm run gate -- fast`. Commit "Golden veins and the Gold rush are deleted (#728)".

### Task 4: The dig is deleted

**Files:** `mountain.ts` (`mineByHand`), `rates.ts` (`Rates.tapYield`), `upgrades.ts` (`TAP_SHARE_PER_LEVEL`), `economy/actions.ts` (the `dig` move, `tapsPerSecond`, `oneTap`, `incomePerSecond` if only taps feed it), `lab/run.ts`, `lab/score.ts` (the `tap` part), `lab/policy.ts`, `lab/plain.ts`, `lab/targets.ts` (`TAPS_PER_SECOND` only; no target limit changes), delete `lab/policies/tap-only.ts`, `field-log.ts` (`tapYield`), `screen-words.ts`, `how-it-works.ts` (the `tapping` system; Legacy's "crew and taps" line becomes "crew"), `tools/browser/fixtures.ts`, `scripts/play.mjs` actions that dig, if any.

- [ ] Adjust tests (`actions.test.ts`, `rates.test.ts`, `lab/policies.test.ts`, `lab/run.test.ts`, `play-plan.test.ts`, `screen-words.test.ts`). Keep `tapsPerSitting`.
- [ ] Remove the code. `npm run typecheck`, touched tests, `npm run gate -- fast`. Commit "The dig is deleted (#728)".

### Task 5: The upgrades that went are deleted

**Files:**

- Upgrades `tap` (Strong arms) and `steady` (Night foreman): `upgrades.ts` (rows, `STEADY_AWAY_PER_LEVEL`, `GONE_IN_A_FRESH_MINE` entries), `rates.ts`.
- Boosts `sharper` and `overtime` (Ruling 3): delete `boosts.ts` and its test; `mountain.ts` (`boosts`), `upgrade-reveal.ts` (boost parts), `teach.ts` (`boost:*`), `economy/actions.ts` (`boostActions`, `buyEveryBoost`), `rates.ts` (`crewTimer`), `mine-view.ts`, `lab/decide.ts`, `lab/score.ts`, `lab/run.ts`, `lab/policy.ts` (`BoostRule`, spend weight `boost`), `lab/plain.ts`, delete `lab/policies/boost-junkie.ts`, `field-log.ts` (`boosts`), `how-it-works.ts` (boosts system).
- Recipes `crystal-flare` and `crystal-lamp`: `workshop.ts` (rows, `TIMER_IDS`, `COLD_CLOCKS`, effects), `expeditions.ts` (the old shaft's `crystal-lamp`), `economy/actions.ts`, `lab/measures/materialIdle.ts`.
- Lost tools `pick` and `lamp`: `lost-tools.ts` (`tapWithPick`, `glintScale`), `expeditions.ts` (`FIND_IDS`, `TRIP_FIND_IDS.tool`), `economy/finds.ts`, `screen-words.ts`.
- `save-format.ts` and `save-ledger.test.ts`: levels `tap`, `steady`, `crystal-flare`, `crystal-lamp`; clocks `sharper`, `overtime`, `crystal-flare`; marks `boost:sharper`, `boost:overtime`, `upgrade:tap`, `upgrade:steady`; recipes and trip-find recipe `crystal-lamp`; finds and trip-find tools `pick`, `lamp`. `firestore.rules` `isFieldUpgrades` and the boosts list (Ruling 5), with `rules-test`.
- `tools/browser/fixtures.ts` (`overtimeSave` and the rest), `fixtures.test.ts`, `scripts/play.mjs` saves named for them.

- [ ] Adjust tests (`upgrades.test.ts`, `upgrade-reveal.test.ts`, `upgrade-rows.test.ts`, `workshop.test.ts`, `expeditions.test.ts`, `lost-tools.test.ts`, `teach.test.ts`, `mine-view.test.ts`, `field-log.test.ts`, emulator test).
- [ ] Remove the code. `npm run typecheck`, touched tests, `npm run gate -- fast`. Commit "The upgrades that went are deleted (#728)".

### Task 6: Labs, ledger, knip and docs

**Files:** `docs/pacing-ledger.md` (`npm run lab:ledger`), `src/lab/__snapshots__`, `src/economy/__snapshots__`, `docs/DESIGN.md`, `docs/design-intent.md`, `docs/ARCHITECTURE.md`, `docs/ART.md`, `docs/ui-audit.md`, `README.md`, `CLAUDE.md` only if they name what went.

- [ ] `npx knip` and `npx knip --production`: delete what this sliver left unused.
- [ ] `npx vitest run --project sim` (or the sim project name in `vite.config.ts`) and update snapshots that changed because the deleted features left; read each diff.
- [ ] `npm run lab -- --ci --ledger check` in the background. A guardrail FAIL is a stop (Global Constraints). Then `npm run lab:ledger` and commit the ledger.
- [ ] Docs no longer describe what went as live.
- [ ] `npm run gate -- fast`; `npm run play` on `start` and `night` (`?memorySave=1`): no page error, the save line reads. Commit "Labs, ledger and docs after #728".
