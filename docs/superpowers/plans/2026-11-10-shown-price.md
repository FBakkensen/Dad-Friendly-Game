# Charged the price that was shown (#367) Plan

A small change: short design, plan and build in one sitting (`.claude/rules/superpowers.md`).

**Goal:** a Buy on a lasting upgrade, and a Promote, charge the number the player saw, never a bigger one. If the price moved since the paint, the tap buys nothing, blinks, and the row shows the new price.

**Out of scope:** the prices themselves. Machines (`tierCost` reads only the run's stretch, not the band) and boosts (priced from income) are not band-scaled at the tap, so they stay as they are.

## Why it happens

`dispatch` settles the crew's work up to the tap inside the commit, then runs `applyMove` (`src/progress-store.ts`, `dispatchMove`). If that settle crosses a band, `oneOffStretch` jumps (×2.625, ×2.4, ×5.14) and `buyUpgrade` / `promote` price the move again at the new band. The row painted before the settle still shows the old price.

## Design

- **The move carries its price.** In `src/economy/actions.ts`, the `buyUpgrade` and `promote` actions get a required `price: number`: the price the player was shown. Required, not optional: there is no buy without a quote, so no caller can forget it. `actionApplied` refuses (returns the same mountain, so `applyMove` says `refused`) when the price is not today's price. One guard, `quotedPrice(mountain, action)`, in that module, the one place moves are applied (#409). It reads the price the same way `buyUpgrade` and `promote` do (`upgradeCost(..., oneOffStretch)`, `promoteCost`); `buyUpgrade` and `promote` themselves stay as they are, since the pacing sim and the lab runner call them directly.
- **The lab quotes the price it sees.** `listActions` puts the current price on the two actions. The lab applies a listed action to the same mountain, so its runs do not change.
- **Upgrades drawer** (`src/upgrades-panel.ts`). `paintReady` remembers the exact price it painted on each upgrade row. The row's tap sends that price. On a refusal (pocket short, or the price moved) the row blinks refused, as a short pocket already does, and the drawer asks for a render (`requestRender`, the screen's `ctx.paint`, as the Engineers sheet already gets it), so the new price is on the row at once. Boost rows are unchanged.
- **Promote** (`src/engineers-panel.ts`). The Promote button's tap remembers the price on the button at that moment; Step up sends it. If the price moved while the confirm sat open, Step up buys nothing, the confirm closes, and the render shows the new price on the button (the sheet already re-renders after Step up).
- **Docs.** `docs/ARCHITECTURE.md`: the `Action` paragraph says a buy carries its price.

## Proof

- `src/economy/actions.test.ts`: a `buyUpgrade` and a `promote` whose price is not today's are refused and the mountain is the same; the listed actions carry today's price.
- `src/mountain-screen-upgrades.test.ts`: a crew a few stones short of the Crystal Caves band (10M mined), a painted upgrade row, the clock moved so the tap's settle crosses the band: the tap spends nothing, the row reads refused, and the row then shows the new price. The same tap without the crossing still buys.
- `src/mountain-screen-crew.test.ts` (or `promotion-teach.test.ts`, whichever holds the promote confirm): a band crossed while the confirm is open: Step up spends nothing and the button shows the new price.
- `npm run play` on a save with an affordable upgrade and promotion: Buy and Promote still apply in the browser, the shots show the price, no page errors. A band crossing inside one tap cannot be timed from the play script, so the crossing itself is proven in the screen tests. No new visual-check section (H is moving that file).

## Tasks

1. Domain: required `price` on `buyUpgrade` and `promote`, the guard in `actionApplied`, `listActions` quotes it; update every construction in tests (TDD: the refusal tests first).
2. Upgrades drawer: remember the painted price, send it, blink and re-render on a refusal; the band-crossing screen test first.
3. Promote: remember the button's price at the tap, send it from Step up; the confirm-open crossing test first.
4. Docs: `docs/ARCHITECTURE.md`.
5. Prove it on the ladder: the test files, `npm run gate -- fast`, `npm run play`, then `npm run gate -- full` once before the PR.
