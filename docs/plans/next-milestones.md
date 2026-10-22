# Next milestones (draft for Flemming, Oct 22 2026)

Sequenced after save-integrity steps C–E. Focus: make run 1 really good. Prestige last.
Earlier research and audit: m10-unlock-flow.md (still valid). Raw lab numbers: next-milestones-lab-raw.json
(main @77d4599, 20 seeds, casual-2x10, evening-1x20, five-min-a-day, checker-6x3, optimizer).

## Measured (lab)

- Clay: first clay at day 0.5 (after 10 live min), workshop at day 1.5. That's 20 live minutes, but a full calendar day with two overnight returns, and no clay recipe is usable. No policy ever spent clay before the workshop.
- Granite borer (9M): affordable at 2–3% of the band for checker and casual-2x10, 12% for evening, 36% for the optimizer and 40% for five-min-a-day. These are the moments the pocket first covers the sticker, mostly right after an overnight gap. A real player buys later, because 9M is the whole pocket.
- Code check: Granite hardness is cart 0.85, borer 0.85, drill 1 (layers.ts). The rock actually favours drills, not borers, and the screen never says which machine a band favours.
- Crystal: the Great Machine is affordable at 48–69% of the band (casual 48%).
- Runs today (passTheMine, Legacy +0.5 per run): 5.5 → 4.5 → 3.5 days for both casual and optimizer, every seed.

## Order

M10 Design system (mobile). M11 Unlock and introduction flow, built on the M10 components. M12 Band balance (needs M11's lab events). M13 Escalating generations (brief only).

## Choices are the game (adopted Oct 22)

Design intent: the choices are the game. Every system exists to put a real decision in front of the dad, and the UI shows the reason behind each system (e.g. "machines are crew you staff", "each layer asks for a new tool") rather than a wall of readouts. A choice must not be obvious: if every option scales the same way, the best buy is a single sort and the other buttons are scenery.

Numbers rule: show real numbers (the price, what one more adds, workers needed and free). NEVER show payback, expected gain, best-value or time-to-afford. Discoveries stay vague. No "?".

Mechanisms adopted (all 7), folded into the milestones below in this order:

1. Report-only decision-entropy and greedy-regret lab measures (M10).
2. Layer-favoured machines and ownership milestones (M12).
3. Contested worker pool, plus short/long boosts and crafts (M11).
4. Tier synergies and material forks (M11).
5. Kid-run twists, each run longer than the last (M13).

Needs Flemming's OK: the D3 balance decision (which machine each band favours) and every lab threshold change in `src/lab/targets.ts`. New measures start report-only.

### M10 Design system. Goal: one consistent mobile look on every screen.

Sources: Apple HIG (44pt targets) https://developer.apple.com/design/human-interface-guidelines/accessibility ; WCAG 2.5.8 https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ; Material 3 layout https://m3.material.io/foundations/designing/structure ; NN/g progressive disclosure https://www.nngroup.com/articles/progressive-disclosure/
PRs: 10.1 screen audit, with screenshots of every screen and sheet and a list of inconsistencies · 10.2 tokens (type scale, 4/8 spacing, colours, radii, 48px targets) plus a lint/visual check · 10.3 mockups of card, button, chip, timer, notice and badge (approve) · 10.4 migrate the mountain and crew screens · 10.5 upgrades, boosts, workshop and engineers · 10.6 relics, legacy, welcome and menu, plus a no-scroll check at 360×640.

Choices step 1 (10.7, after 10.2): lab measures, report-only. Decision entropy = how much the top policies (optimizer, casual, checker, evening, crafting heavy) disagree on the best move at each moment, median and worst tenth per band. Greedy regret = how much later a "cheapest stones/s per stone" bot finishes than the best policy. Depends on: nothing in M10 (lab only, no UI). Done when: both measures appear in reports/strategy-lab.md for 20 seeds with a baseline recorded here, and no target in targets.ts changed.

### M11 Introduce AND teach every system. Goal: every system announces itself, explains itself in 1–2 lines, guides one first use, and has a tap-anytime "How it works" card.

Teaching audit (code + screens, main @77d4599). A=announce, E=explain, G=guided first use, R=reminder. Worst first:

| System                                                                 | A                                            | E                                                        | G                   | R                |
| ---------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------- | ------------------- | ---------------- |
| Workshop (opening, crafting, timers, reinforce, grease, cancel/refund) | none (button swaps in)                       | none                                                     | none                | none             |
| Materials (clay/iron/crystal/heartstone)                               | chip only                                    | none                                                     | none                | none             |
| Layers / hardness                                                      | layer card + next-layer hint                 | names the band, never hardness or which machine it suits | none                | weak (hint line) |
| Upgrades                                                               | silent (button, no badge)                    | one effect line per row                                  | none                | none             |
| Boosts                                                                 | silent                                       | effect + timer                                           | none                | none             |
| Tending                                                                | none                                         | none                                                     | none                | none             |
| Expeditions / tunnels                                                  | none                                         | one line per tunnel                                      | none                | partial          |
| Recipe discovery                                                       | vague hint card                              | ok (vague by design)                                     | none                | none             |
| Staffing (workers per machine)                                         | none                                         | card line "Needs N workers · N free" (new)               | none                | crew line        |
| Engineers / promotion                                                  | arrival panel (good)                         | partial                                                  | none                | none             |
| Machines (cart to Great Machine)                                       | card appears; Great Machine via relic        | gain + cost on card                                      | none                | card             |
| Time away / welcome                                                    | card ok                                      | stones + layers, no materials                            | n/a                 | none             |
| Pass to kid                                                            | legend card + confirm                        | thin (Legacy bonus not explained)                        | n/a                 | none             |
| Golden veins, hazards, relics/shelf, tapping                           | good (glint, on-screen, tease/reveal, shelf) | ok                                                       | ok (tap is obvious) | shelf ok         |

Research (verified): show the help at the moment of need, not as up-front tutorials (NN/g https://www.nngroup.com/articles/onboarding-tutorials/ , https://www.nngroup.com/articles/mobile-app-onboarding/); progressive disclosure (https://www.nngroup.com/articles/progressive-disclosure/); learning comes from doing, through action and feedback loops (Cook, https://www.gamedeveloper.com/design/the-chemistry-of-game-design); help sits in the same place on every screen (WCAG 3.2.6 https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html).

Pattern (built from M10 parts):

1. Trigger: a dot badge on the button plus a one-line "New" note.
2. Reveal card: a title plus 1–2 lines (real numbers for buys, vague for finds), one big button that does the first action ("Craft Axle grease, 1 iron").
3. Guided first use: the target is highlighted until it's done once, then a payoff line ("Crew ×2 for 20 min").
4. "i" button in the same corner of every system's sheet: one screen "How it works", 3–4 lines, no scroll, real numbers, dad tone.
5. Save keeps `seen` + `taught` ids; old saves count as seen, but the "i" works for all.
   PRs: 11.1 lab appear/firstUse events + revealToUse baseline · 11.2 mockups of the pattern for workshop, materials, upgrades (approve) · 11.3 shared teach component + `seen/taught` save fields · 11.4 How-it-works copy for every system (one file, word check: no "?", no scroll) · 11.5 workshop: opening card, guided first craft, info card (timers, cancel refund, reinforce, grease) · 11.6 clay fix (D1) + materials info + retune · 11.7 upgrades/boosts: reveal near affordable, badge, guided first buy · 11.8 layers/hardness, tending, staffing, expeditions, engineers info + guided first trip/tend · 11.9 welcome-back with materials, pass-to-kid explainer · 11.10 revealToUse guardrail (needs OK).

Choices step 3 (after 11.3 and 11.5): contested worker pool. Workshop crafts, tending and trouble repair take free workers for a while, competing with machine staffing; the crew line and cards show "Needs N workers · N free". Short/long boosts and crafts: a strong short timer and a gentle long one ("×3 for 10 min" vs "×1.5 for 8 h"), with real price, multiplier and duration. Depends on: step 1 baseline, M10 components. Done when: boosts and crafts leave the lab's "never the best" list for casual and checker, the best timer pick differs between the 2-minute and 30-minute policies, and a "staffing binding share" measure is reported.
Choices step 4 (after step 3): tier synergies (e.g. "+1% to every drill for each cart, you have 24 carts") on the existing cartSyn/drillSyn/borerSyn/machineSyn upgrades, and material forks (each band's material feeds two recipes for different play styles; clay usable in the Topsoil per D1). Depends on: step 3, 11.6 clay fix. Done when: decision entropy rises against the step 1 baseline in at least two bands, idle materials stays 0, and craft leaves "never the best" for most policies.

### M12 Band balance. Goal: each band's favoured machine is clear on screen and affordable early in that band.

PRs: 12.1 lab measure favouredAffordShare per band, report-only · 12.2 decide the favoured machines (D3) and the layer card names them · 12.3 retune costs/hardness, 20 seeds green · 12.4 guardrail (needs OK).

Choices step 2 (replaces 12.2–12.3 detail): layer-favoured machines. Each band boosts one tool and dulls another instead of a flat 0.85 (proposal: Granite drills up and carts down, Crystal borers up and drills down, Deep Heart the Great Machine up and carts down; final picks are D3 and need Flemming's OK). The layer card names the favoured tool and each card shows its real output in this band. Ownership milestones: at 10/25/50 of a machine that tier digs twice as fast, shown as "12 of 25 drills: at 25, every drill digs twice as fast". Depends on: step 1 baseline, 12.1 favouredAffordShare, M11 layer explainer. Done when: each band's favoured machine is affordable early in that band (value set with Flemming), greedy regret is clearly above zero in at least one band, decision entropy rises against the baseline, finish days stay in the week, and no threshold changed without his OK.

### M13 Generations (later). Goal: each kid run is longer AND bigger.

Brief: the buff grows slower than the challenge. Per generation: mountain ×k, costs ×k, Legacy buff ×b with b<k, so runs lengthen and the numbers grow (Pecorella's prestige maths https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii ; Kittens Game "increasing challenge" https://wiki.kittensgame.com/en/game-tabs/challenges). Add new bands or mechanics per generation. Lab: a multi-run sim and a "run N+1 > run N" target. Numbers are designed later.

Choices step 5: kid-run twists. Each generation: mountain ×k, costs ×k, Legacy buff ×b with b<k, plus one rule twist per run (e.g. a new band where a different machine is king). The pass card describes the new mountain vaguely; play shows real numbers. Depends on: steps 2–4. Done when: a multi-run lab sim shows each run longer than the last (today 5.5 → 4.5 → 3.5 days fails this), the best mix differs between runs, and the new "run N+1 > run N" target is set with Flemming's OK.

## Decisions

D1 Clay: craftable blasting charge in the Topsoil (rec.) / clay only from Granite / open the workshop at 1M.
D2 Upgrade reveal: when near affordable (rec.) / keep count gates and add a toast.
D3 Granite: make borers the favoured machine and cheaper early (rec., matches your play feel) / keep drills favoured and say so.
D4 Order: design system first (rec.) / unlock flow first.
D6 Teaching for existing players: show each reveal once, the first time they open that system (rec.) / only the info button.
D5 Guardrail values: set after the baselines, with your OK.
