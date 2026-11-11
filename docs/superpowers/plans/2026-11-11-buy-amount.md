# Buy ×10 and Max (M14-4, #358)

Spec: `docs/economy-overhaul.md`, section D. One sliver, one PR.

**Goal.** A two-minute check-in spends a normal return in about five taps. The Buys drawer gets one fat amount key that cycles ×1, ×10 and Max. Every row then shows the real count and the total price for that amount, and a tap buys that many.

**Out of scope.** Any price change. The Ready now plate, Upgrades and the staffing New row stay one at a time.

## Rulings

- **One key for the whole drawer, in the Buys header beside the "i"** (the issue says "on each buy card"). Rows are whole buttons with no spare width on a phone, and one mode key is the genre's standard. Every card still shows its own count and total. Flemming was asked on a decision card; this is the recommended option.
- **×10 is exactly ten**, all or nothing: the row shows ten's total, and is too dear until the pocket holds it. **Max is as many as the pocket holds**, at least one: with none affordable it shows one's price, dimmed, like ×1.
- **The amount is remembered on this device** (localStorage, like the vein wait), not in the save: it is a habit of the hand, not progress. A broken store starts at ×1.
- **A row's gain on ×10 and Max is the tier's speed × the units the free hands can run** (review). Max counts stones, not hands, so a Max of carts can buy machines that stand idle; the row says so in rust ("Needs 46 workers") and its gain counts only those that run. ×1 still shows what one more adds. A milestone that the buy would reach is not added in, as today's ×1 row does not add it.
- **A row too dear or short of hands keeps the counted verb** ("Buy 46"), where ×1 names the hands, so it still says how many.
- **A ready pick whose ×10 or Max the pocket cannot pay loses its amber lamp and flag on its row.** A Saving for pick keeps its flag beside the total.
- **Max is read again at the tap**, as ×1 is, so income that lands between the paint and the tap can buy one more than the row showed.
- **A machine's worker bill is one machine's bill × the count.**
- **The staffing New row hires one worker** in any amount: it teaches staffing one hand at a time. A troubled or locked row is unchanged.
- **The bulk buy is a screen move (`buyTiers`), not an `Action`.** The lab plans single buys, and a new `Action` kind would need a value model it does not use. The move buys through `buyWithTeach` once per unit, all or nothing, and logs one `tier.buy` with the final count.
- **Lab evidence: `tapsPerSitting`**, a report-only row (≤ 5 after day one, casual types): a sitting's taps with Max, where every tier bought counts one tap and every other buy (upgrade level, engineer) counts one each. It is a floor: a tier bought, then another, then the first again, counts once.

## Tasks

1. **`tiers.ts`: `BuyAmount` and `tierQuote`.** The shared price module. `tierQuote(mountain, tier, amount)` returns `{ count, cost }`, summing `tierCost` unit by unit, so it is the price `buyTier` charges. Tests in `tiers.test.ts`.
2. **`economy/actions.ts`: the `buyTiers` screen move.** Applies `buyWithTeach` `count` times; refuses unless every one lands. One `tierBought` event with the final count. Tests in `actions.test.ts`.
3. **`buys-rows.ts` and `buys-tap.ts`: rows and taps take the amount.** Price, verb ("Buy 10", "Hire 7"), gain, need and aria follow the quote. `buysTap` returns the count to buy, read again at the tap. Tests in their files.
4. **`crew-panel.ts`, `board.css`: the amount key.** A plate key in the Buys header, pressed through the board's model like the "i" (the settle guard holds). Cycles ×1 → ×10 → Max, repaints the rows, remembers the amount. A row tap dispatches `buyTier` for one and `buyTiers` for more. Tests in `mountain-screen-crew.test.ts`.
5. **Lab: `tapsPerSitting`.** The sitting log counts tiers bought and other buys; the measure and its report-only target. Tests in `sittings.test.ts` and the measures test.
6. **Browser checks and docs.** The visual check's Buys section covers the key on the phone without a scroll; `npm run play` on the `crew` save taps the key and buys. DESIGN, ARCHITECTURE, design-intent and ui-audit describe the key.

Proof follows the ladder in `.claude/rules/dad-friendly-work.md`.
