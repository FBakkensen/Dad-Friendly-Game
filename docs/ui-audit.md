# Screen audit

Measured on the running game by `npm run audit:ui` (`scripts/ui-audit.mjs`) at the supported phone, 424×924 (installed app) and 424×830 (Chrome with its address bar) (#273), portrait, device scale 2. It records; it changes no style, layout, copy or play.

Shots live in [`docs/ui-audit/`](ui-audit/). Each file is `<screen>-<state>-<WxH>.png`.

Bars used below:

- Touch targets 48×48px, with 8px between them (`--target-min`, `--target-gap` in `src/tokens.css`). [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) asks only 24×24 at AA. [Apple HIG accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) asks 44×44pt. 48px matches a Material touch target.
- Body text 4.5:1, large text and controls 3:1. [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Large text here means 24px, or 18.66px at weight 700 or more.
- Spacing on a 4px grid. [Material 3 layout](https://m3.material.io/foundations/layout/understanding-layout/spacing) uses a 4dp step for the same reason: thumbs and type line up.
- No scroll at 424×830. The page (`html` and `#app`) never scrolls, and no sheet scrolls as a whole. Long lists (Buys, Upgrades, the Workshop page) scroll inside their sheet.

## Screens

| Screen                   | 424×924                                             | 424×830                                             | What is wrong                                                                                                                                                 |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mountain at rest         | [shot](ui-audit/mountain-rest-424x924.png)          | [shot](ui-audit/mountain-rest-424x830.png)          | Pocket pill, band line, crew chips, goal line, shelf, rock, bottom bar. The rock, the shelf, the teach note and the bottom bar stand 8px apart (#346).        |
| Golden vein              | [shot](ui-audit/mountain-vein-424x924.png)          | [shot](ui-audit/mountain-vein-424x830.png)          | Same mountain, plus the vein. The `+13.6 thousand crew` float is 12.8px.                                                                                      |
| Hazard                   | [shot](ui-audit/mountain-hazard-424x924.png)        | [shot](ui-audit/mountain-hazard-424x830.png)        | Buys sheet. The cave-in shout sits on the cart card and is readable.                                                                                          |
| Next-layer hint          | [shot](ui-audit/mountain-layer-hint-424x924.png)    | [shot](ui-audit/mountain-layer-hint-424x830.png)    | ☰ menu. The hint sits in the ledger under the goal. Vague on purpose.                                                                                        |
| Crew, needs workers      | [shot](ui-audit/crew-needs-workers-424x924.png)     | [shot](ui-audit/crew-needs-workers-424x830.png)     | Buys sheet. A card says `Needs 8 workers`; the free count stays on the crew chip.                                                                             |
| Material chips           | [shot](ui-audit/material-chips-424x924.png)         | [shot](ui-audit/material-chips-424x830.png)         | ☰ menu ledger: clay, iron, crystal and heartstone with real counts.                                                                                          |
| Upgrades and boosts      | [shot](ui-audit/upgrades-boosts-timer-424x924.png)  | [shot](ui-audit/upgrades-boosts-timer-424x830.png)  | The list scrolls inside the sheet. Running boosts are chips under the crew. The list scrolls clear of Close.                                                  |
| Workshop, bench idle     | [shot](ui-audit/workshop-idle-424x924.png)          | [shot](ui-audit/workshop-idle-424x830.png)          | Bottom-bar Workshop. Real prices (`Craft · 500K`). Every control is 48px. Four cards a page at 424×924; three at 424×830, where four would be cut off (#347). |
| Workshop, crafting       | [shot](ui-audit/workshop-crafting-424x924.png)      | [shot](ui-audit/workshop-crafting-424x830.png)      | Bench timer is a real clock. Cancel names the refund.                                                                                                         |
| Workshop, cancel confirm | [shot](ui-audit/workshop-cancel-424x924.png)        | [shot](ui-audit/workshop-cancel-424x830.png)        | Second tap says `Tap again to cancel`. Same button, no separate sheet.                                                                                        |
| Workshop, reinforce      | [shot](ui-audit/workshop-reinforce-424x924.png)     | [shot](ui-audit/workshop-reinforce-424x830.png)     | Shows the real machine rates and `5 iron`. The button says `Craft` because the stone price is 0.                                                              |
| Workshop, axle grease    | [shot](ui-audit/workshop-axle-grease-424x924.png)   | [shot](ui-audit/workshop-axle-grease-424x830.png)   | Page two: `Crew 13.6K/s to 27.3K/s`. `Craft` sits in the top third (center 244px). More to make is 8px above Close.                                           |
| Workshop, need more      | [shot](ui-audit/workshop-need-more-424x924.png)     | [shot](ui-audit/workshop-need-more-424x830.png)     | Greyed `Need 4 more iron` on `.workshop-craft.is-short`. The first `Craft · 500K` sits in the top third.                                                      |
| Craft done               | [shot](ui-audit/workshop-craft-done-424x924.png)    | [shot](ui-audit/workshop-craft-done-424x830.png)    | Notice names the fit and a real rate. One button.                                                                                                             |
| Engineers, promote       | [shot](ui-audit/engineers-promote-424x924.png)      | [shot](ui-audit/engineers-promote-424x830.png)      | Price is real (`Promote: 2M stones`). Title, why and rank word are 12px. A large empty band sits between Ada and the promote row.                             |
| Engineers, expedition    | [shot](ui-audit/engineers-expedition-424x924.png)   | [shot](ui-audit/engineers-expedition-424x830.png)   | Ada is out. The line is words (`about an hour`) at 12px, not a clock.                                                                                         |
| Engineers, homecoming    | [shot](ui-audit/engineers-homecoming-424x924.png)   | [shot](ui-audit/engineers-homecoming-424x830.png)   | `Welcome home` names who came back and what they carried. No digits, on purpose.                                                                              |
| Relic tease              | [shot](ui-audit/relic-tease-424x924.png)            | [shot](ui-audit/relic-tease-424x830.png)            | ☰ menu ledger: `Next: Mantle of the Hero · Almost there`. Vague depth is correct.                                                                            |
| Relic reveal             | [shot](ui-audit/relic-reveal-424x924.png)           | [shot](ui-audit/relic-reveal-424x830.png)           | Fits. The continue button is in the bottom half.                                                                                                              |
| Relic shelf              | [shot](ui-audit/relic-shelf-424x924.png)            | [shot](ui-audit/relic-shelf-424x830.png)            | Fits with no scroll. The unfound row uses the tease line.                                                                                                     |
| Legacy badge             | [shot](ui-audit/legacy-badge-424x924.png)           | [shot](ui-audit/legacy-badge-424x830.png)           | `Legacy ×2` is 12.8px, beside the rock.                                                                                                                       |
| Pass the mine            | [shot](ui-audit/legacy-pass-424x924.png)            | [shot](ui-audit/legacy-pass-424x830.png)            | ☰ menu with the pass row. Fits.                                                                                                                              |
| Pass confirm             | [shot](ui-audit/legacy-confirm-424x924.png)         | [shot](ui-audit/legacy-confirm-424x830.png)         | Title is `Pass the mine to your kid.`, no question mark. The stakes are written in full.                                                                      |
| Welcome back             | [shot](ui-audit/welcome-back-424x924.png)           | [shot](ui-audit/welcome-back-424x830.png)           | Real stones gained, one button in the bottom half. The 2-minute door.                                                                                         |
| Layer arrival            | [shot](ui-audit/layer-arrival-424x924.png)          | [shot](ui-audit/layer-arrival-424x830.png)          | Names the band and the machine it suits. No depth number.                                                                                                     |
| Menu                     | [shot](ui-audit/menu-game-424x924.png)              | [shot](ui-audit/menu-game-424x830.png)              | Ledger, Workshop, Saved copies, field log, Start over. The two links are 13.6px.                                                                              |
| Field log                | [shot](ui-audit/field-log-424x924.png)              | [shot](ui-audit/field-log-424x830.png)              | A log for a person, not a decision. Fine tucked in the menu.                                                                                                  |
| Start over confirm       | [shot](ui-audit/start-over-confirm-424x924.png)     | [shot](ui-audit/start-over-confirm-424x830.png)     | Title is `Start over?`, the one question mark. A second sheet on top of the menu.                                                                             |
| Save: sign in            | [shot](ui-audit/save-status-unsigned-424x924.png)   | [shot](ui-audit/save-status-unsigned-424x830.png)   | `Sign in to save` at 16px. On a fresh mountain the rock is 8px from the shelf and the bottom bar.                                                             |
| Save: this device        | [shot](ui-audit/save-status-session-424x924.png)    | [shot](ui-audit/save-status-session-424x830.png)    | `Saved on this device`.                                                                                                                                       |
| Save: loading            | [shot](ui-audit/save-status-loading-424x924.png)    | [shot](ui-audit/save-status-loading-424x830.png)    | `Loading your save...`                                                                                                                                        |
| Save: account            | [shot](ui-audit/save-status-account-424x924.png)    | [shot](ui-audit/save-status-account-424x830.png)    | `Saved to your account`.                                                                                                                                      |
| Save: unreachable        | [shot](ui-audit/save-status-error-424x924.png)      | [shot](ui-audit/save-status-error-424x830.png)      | `Couldn't reach your save`. Honest, not a scold.                                                                                                              |
| Two saves, at rest       | [shot](ui-audit/save-conflict-rest-424x924.png)     | [shot](ui-audit/save-conflict-rest-424x830.png)     | Real depths and pockets. The cards are 8px apart and 8px above `Play this one`.                                                                               |
| Two saves, other card    | [shot](ui-audit/save-conflict-selected-424x924.png) | [shot](ui-audit/save-conflict-selected-424x830.png) | The other device card takes the gold border. Same gaps.                                                                                                       |
| Saved copies             | [shot](ui-audit/saved-copies-earlier-424x924.png)   | [shot](ui-audit/saved-copies-earlier-424x830.png)   | One row is greyed: `From an earlier run – can't be played now`.                                                                                               |
| Playing in another tab   | [shot](ui-audit/other-tab-playing-424x924.png)      | [shot](ui-audit/other-tab-playing-424x830.png)      | Own card and `.other-tab-play`, not the shared `.go` button. Copy is gentle.                                                                                  |
| Update available         | [shot](ui-audit/update-available-424x924.png)       | [shot](ui-audit/update-available-424x830.png)       | Own `.update-card` and `.update-reload`. One job: reload.                                                                                                     |

## What the report still flags

Every target is at least 48px and 8px from the next, no sheet or page scrolls, and no measured text pair fails contrast. What is left:

### Targets closer than 8px

None. Every pair of targets stands at least 8px apart (`--target-gap`, #328 and #346). The audit measures a button only where a finger can reach it: the part inside its scrolling list, at rest, not mid-press.

### Thumb reach

Every open sheet's main button is in the bottom half. Two Workshop pages put a first `Craft` in the top third (center 244px of 830): axle grease and need more.

### Spacing and colour

Off the 4px grid, most seen: 6px on `.relic-shelf`, `.teach-info`, `.menu-button` and `.save-card`, 2px on `.pocket-stack` and `.crew-posts`, and 1px padding on `.teach-info`, `.menu-button`, `.menu-close`, `.workshop-more` and `.workshop-close`.

Near-duplicate night browns (RGB distance under 15): `#1e130d` / `#1c120c` / `#140d09` / `#120c0a`, `#3a2a1c` / `#362514`, and the ink pair `#c9b391` / `#c9b08e`.

### Copy

One `?` is left in player text: `Start over?` (`src/menu-panel.ts`). Purchases, tending and crafting show real numbers. Relic hints, the layer hint, expedition time and homecoming finds stay vague.

## Information architecture

A session is either about 2 minutes (look, one decision, leave) or about 30 minutes (plan, craft, send people out, tune the crew). The short path stays short. The long path is one tap away, and it does not sit on the mountain while he is only checking in.

### What exists today

Taps are from the mountain, with nothing else open.

| Surface                                                                          | Taps                     | What he decides                                                                       |
| -------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------- |
| Mountain, vein, band line, crew chips, goal line, shelf, legacy badge, save line | 0                        | Tap the rock or the vein.                                                             |
| Welcome back, homecoming, craft-done, layer card, relic reveal                   | 0 (they open themselves) | Read it and go back. One button.                                                      |
| Buys (bottom bar)                                                                | 1                        | Buy the next worker or machine, or fix trouble on a card.                             |
| Workshop (bottom bar)                                                            | 1                        | Craft, wait, or cancel.                                                               |
| Engineers (bottom bar)                                                           | 1                        | Tend, send, recall, or promote.                                                       |
| Upgrades and boosts (bottom bar)                                                 | 1                        | Buy a lasting upgrade or start a boost.                                               |
| Relic shelf                                                                      | 1                        | Read a relic. No purchase.                                                            |
| ☰ menu                                                                          | 1                        | Read the ledger (stones left, materials, next relic), sign in, or pick a buried tool. |
| Field log, saved copies                                                          | 2                        | Copy a log, or play an old copy.                                                      |
| Start over, pass the mine                                                        | 2, then a confirm        | Throw the run away, or end the mountain.                                              |
| Two saves found, other tab, update                                               | 0 when they happen       | Pick a save, play here, or reload.                                                    |

Top 5 actions, 2 minutes: see what the crew did (0 taps), dismiss it (1), tap the vein or the rock (1), open Buys and buy one card (2), leave (0).

Top 5 actions, 30 minutes: open the Workshop and start or collect a craft (2), open Engineers and tend or send (2), open Upgrades and buy or boost (2), glance at the shelf (1), check the next relic in the menu or on the goal line (0 or 1).

## Design direction

Flemming on the first token mocks: better, and not yet a crisp night. The notes below are the rules for three later mocks (`mountain-a` with `upgrades-a`, `mountain-b` with `upgrades-b`, `mountain-c` with `upgrades-c`). The game follows direction B: the bottom bar and the buy sheets.

Looked at Cookie Clicker, Egg Inc, AdVenture Capitalist, Idle Miner Tycoon, Melvor Idle, and Universal Paperclips, plus the touch research already behind the 48px bar. Nine rules:

1. **One hero number, and the rate tucked under it.** Cookie Clicker's eye lands on the Big Cookie, then the bank and the cookies-per-second line beside it. The count and the rate are one thought. The next buy is the only other number at that volume. ([Big Cookie](https://cookieclicker.wiki.gg/wiki/Big_Cookie), [a walkthrough of that screen](https://steamcommunity.com/sharedfiles/filedetails/?id=2591407770))
2. **The picture is the tap, and the tap answers.** The Big Cookie shrinks for a moment and a number floats off it. Our press is that same physical inset, and the price stays on the button. The layout does not jump, so the 8px gap survives the press. Sound stays off until he unmutes.
3. **The buy sits where the thumb already is. The count can sit up high.** He plays one-handed: the phone stays in one hand, and the thumb taps the rock. Flemming picked the sheet for direction B. Read-only lines (the pocket, the stones a second, the layer, the crew) sit at the top. The rock fills the lower middle. Buys, Workshop, Engineers, and Upgrades sit on the bottom bar. The buy cards open over the lower screen, so they do not push the rock up. A card has one of four states: ready (gold, the price and what one more adds), short of workers (`Needs N workers`, and the free count stays on the crew line), too expensive (grey, the price only), or locked (the word Locked, no price). ([Hoober, UX Matters, 2013](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php), [Hoober, ACM Interactions, 2015](https://interactions.acm.org/archive/view/may-june-2015/fingers-thumbs-and-people), [thumb zones](https://gamedesign.gg/articles/mobile-game-ux-design/))
4. **An icon, a name, and one number.** Cookie Clicker's shop is a picture, a count, and a price, not a paragraph. A phone table that tries to show every column becomes a squint. The name stays, because a bare sprite is not a sentence. The sentence does not.
5. **Numbers use tabular figures.** Each digit takes the same width, so a ticking counter does not wobble. `font-variant-numeric: tabular-nums`. ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-variant-numeric))
6. **One gold control.** The affordable next buy is the gold fill. Everything he cannot buy yet uses the one disabled fill, or it leaves the check-in entirely. Two gold buttons is two decisions.
7. **Two sessions, two depths.** A two-minute open shows the hero number, the picture, and one buy, then he is gone. A thirty-minute sitting opens Workshop, Engineers, or Upgrades with one thumb tap, and that sheet fits. Portrait is the interruptible shape. ([sessions and portrait](https://gamedesign.gg/articles/mobile-game-ux-design/), and the target map above)
8. **Whitespace is the hierarchy.** Six equal cards make every fact shout. One frame, one gold button, and quiet type for the rest. The 8px gap and the 16px pause around the hero are doing that work. ([Material spacing](https://m3.material.io/foundations/layout/understanding-layout/spacing), [48px targets](https://m3.material.io/foundations/designing/structure))
9. **Free hands are counted once.** Spare workers are one pool, so the crew line is the only place that says how many are free. A buy card says what that one machine needs (`Needs 3 workers`) and stops there.
