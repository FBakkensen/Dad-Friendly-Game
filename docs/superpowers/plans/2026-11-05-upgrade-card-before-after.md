# Upgrade cards say what one more level does (#324) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every lasting-upgrade card shows the real before and after, the way Better boots already does.

**Architecture:** `upgradeEffectLine` in `src/screen-words.ts` computes "before" and "after" by running `effectiveRates` on the mountain with the upgrade's level set to the other value (one more level while one is left; level 0 once a one-level upgrade is owned). The sheet in `src/upgrades-panel.ts` already calls it; nothing there changes.

**Tech Stack:** TypeScript, Vitest (happy-dom for the screen tests).

**Spec:** the design approved in chat on issue #324 (a small change, so no spec file):

| Card         | Line                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strong arms  | `Taps 1 to 20.` (now, then one more level). All levels bought: `Taps now 120.`                                                                                                                                             |
| Better boots | unchanged: `Workers 1/s to 2.4/s.`                                                                                                                                                                                         |
| Steady hands | `Away pay 30% to 37.5%.`, before and after buying                                                                                                                                                                          |
| Synergies    | `Carts 6/s to 6.7/s.` (one unit of the boosted tier, before and after). None of the source tier owned: the upgrade's `perLevel` sentence, e.g. `Each worker makes carts 1% faster.` The machine one names `Great Machine`. |

## Global Constraints

- No retuning: no number in `src/upgrades.ts` or `src/rates.ts` changes.
- Speeds use `formatSpeed`, taps `formatCount`, percents the existing `shareWords`.
- The phone layout never scrolls; buy buttons stay where they are.
- Commit messages: a plain sentence ending in `(#324)`.

## Review Focus

- Strong arms with a crew too small for one more level to add a stone: reads `Taps 1 to 1.` (honest, no special case).
- Strong arms at Lv 10/10: `Taps now N.`, never a "to" with a level that cannot be bought.
- A synergy bought: still before→after (as boots does), not a single number.
- A boost or Legacy running: before and after both include it, because both come from `effectiveRates` at the same `at`.
- The Great Machine synergy says `Great Machine`, not `Machines`.

---

### Task 1: Before→after effect lines

**Files:**

- Modify: `src/screen-words.ts:183-229` (`bootsEffectLine`, `upgradeEffectLine`, `synergyEffectLine`)
- Test: `src/screen-words.test.ts` (new `describe("upgrade card before and after (#324)")`)
- Modify: `src/mountain-screen-crew.test.ts:203,215,563,573` (expected strings)
- Modify: `docs/DESIGN.md:129` (the quoted preview sentence)

**Interfaces:**

- Produces: `upgradeEffectLine(upgrade: Upgrade, mountain: Mountain, at: number): string` (signature unchanged).
- Private helper in `screen-words.ts`: `withLevel(mountain: Mountain, id: UpgradeId, level: number): Mountain` returning `{ ...mountain, upgrades: { ...mountain.upgrades, [id]: level } }`.

- [ ] **Step 1: Write the failing tests** in `src/screen-words.test.ts`, using `minedMountain` from `./test-fixtures`, `upgradeById` from `./upgrades`, and `at = Date.now()`:
  - `crew = { ...minedMountain(1_000_000), helpers: 12, carts: 5 }`
  - Strong arms Lv0 on `crew` → `"Taps 1 to 1."`; Lv0 on a 500-worker crew (`helpers: 500`) gives a "to" bigger than the "from" (assert the regex `/^Taps 1 to \d+\.$/` and that the second number > 1); Lv10 → matches `/^Taps now \d+\.$/`.
  - Steady hands unowned → `"Away pay 30% to 37.5%."`; owned (`upgrades: { steady: 1 }`) → the same string.
  - Helping hands (`cartSyn`) on `crew` → `"Carts 6/s to 6.7/s."`; with `upgrades: { cartSyn: 1 }` → the same string.
  - Helping hands with `helpers: 0, carts: 5` → `"Each worker makes carts 1% faster."`
  - Borer tracks (`machineSyn`) with borers owned → starts with `"Great Machine "`.
  - Better boots stays `"Workers 1/s to 2.4/s."` on `crew`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/screen-words.test.ts -t "#324"`
Expected: FAIL on the tap, steady and synergy strings (old wording).

- [ ] **Step 3: Implement.** One `before`/`after` pair per card from `effectiveRates(withLevel(...), at)`. For a one-level upgrade (`maxLevel === 1`) before is level 0 and after is level 1, whatever is owned. For Strong arms, before is the current level and after is level + 1; at `maxLevel` return `Taps now N.`. Synergies read `rates.tierSpeed[synergy.to]` and name the tier `Great Machine` for `machine`, else `${tier.shortName}s`. A synergy whose source count is 0 returns `upgrade.perLevel`. Boots can use the same path (drop the `BOOTS_SPEED_PER_LEVEL` division) as long as its test string holds. Remove imports that go unused.

- [ ] **Step 4: Update the screen tests** in `src/mountain-screen-crew.test.ts` to the new strings (run the file, read each new actual value, and check it against the rules above before pasting it in). Update the quoted sentence in `docs/DESIGN.md:129` to the new synergy line.

- [ ] **Step 5: Run the edit gate**

Run: `npm run gate -- fast`
Expected: every step OK.

- [ ] **Step 6: Commit**

```bash
git add src/screen-words.ts src/screen-words.test.ts src/mountain-screen-crew.test.ts docs/DESIGN.md docs/superpowers/plans/2026-11-05-upgrade-card-before-after.md
git commit -m "Upgrade cards show before and after for every upgrade (#324)"
```

### Task 2: Prove it in the browser

- [ ] **Step 1:** `npm run play -- --save crew label:Buys` and `npm run play -- --save mid label:Buys` (open the upgrades sheet; check `--help` for the button's name if `Buys` misses).
- [ ] **Step 2:** Read the phone and desktop shots: Strong arms, Steady hands and a synergy card show the new lines, nothing wraps into the buy button, the sheet does not scroll on the phone. Read `log.txt`: no page errors.
- [ ] **Step 3:** `npm run gate -- full`. Expected: every step OK.
