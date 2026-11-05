---
name: hill-climb
description: Use when the user asks to run a hill-climb round, to scout the game for bugs, polish, or new ideas (however wacky), to refill a thin backlog, or to check whether ideas have potential before they become issues.
---

# Hill climb

A round turns many ideas into a few proven issues. It starts from the last round's best and dead lists, so the game climbs instead of restarting. A round files issues. It fixes nothing, commits nothing, and spends no PixelLab credits.

## 1. Start from the last round

- Find the latest round: `gh api -X GET search/issues -f q='repo:FBakkensen/Dad-Friendly-Game is:issue "Hill-climb round" in:title'`. Read its dead list, its "Climb from" line, and its open `maybe` sub-issues. This round is N+1 (round 1 if none).
- Load open issues, and search closed ones too (`reason:"not planned"` and by keyword) for every idea before you keep it. A dead or closed idea comes back only if you can say what changed.

## 2. Scout three streams

Subagents may run the streams in parallel. Each stream has a floor:

| Stream     | Floor                                                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bugs**   | `npm run play` from every named save (`--help` lists them). Read the phone **and** desktop shots and `log.txt`. Cover one away/welcome-back case and the smallest phone (360×560).                                                                          |
| **Polish** | Gameplay: `npm run lab` (`reports/strategy-lab.md`): dead stretches, never-worth buys, trap buys, spikes that break two minutes. UI/UX: shots against `docs/ui-audit.md` bars (48px targets, contrast, no page scroll) and the numbers-vs-discoveries rule. |
| **Wild**   | At least 12 ideas before any filter, at least 4 that make you say "huh". Spread them over: the dad's real night, kids growing up, the mountain's world, senses, async with other dads, prestige and generations, AI spice. Do not self-censor here.         |

A bug is **seen** (reproduced in the browser, a test, or a sim) or **suspected** (code reading or arithmetic only). Only seen bugs are filed as bugs. A suspected bug is `maybe`, with the missing repro step in its body.

## 3. Kill on the hard rules

Dead at once, with one line why: twitch real-time play, sound or vibration before unmute, punishing loss, a live server or world, AI required to progress, placeholder art, phone page scroll, jokes at dads' expense. Needing PixelLab art is a cost, not a death.

## 4. Score the survivors

Each 1–5, total out of 20: **Fit** (dad-friendly), **Fun** (or relief, for bugs), **Cost** (5 = well under one sitting), **Safety** (5 = no save field touched). Show the table.

## 5. Probe the top

The top 3–5, and every claim built on numbers, get the cheapest probe that could kill them:

| Claim             | Probe                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| economy or pacing | `npm run lab`, `npm run lab:sweep`, or a scratchpad sim. Quote the numbers. |
| reads on a phone  | a still HTML mockup in the scratchpad, shot at 360×640                      |
| feels good        | a throwaway spike, reverted before the round ends                           |

Re-score after the probe. Verdict: **promising**, **maybe**, or **dead**. An unprobed idea is at most `maybe`.

## 6. Show, then file

Show one table: stream, title, score, verdict, one line of evidence. Then the dead list, and the one you would build first and why. The human strikes rows. Then, with the github-issues skill:

- Parent **"Hill-climb round N (YYYY-MM-DD)"**. Body: what was scouted and what was not, the score table, the dead list with reasons, and a **Climb from:** line for the next round.
- One sub-issue per promising idea or seen bug, sized to one sitting, ending with an **Evidence:** line.
- `maybe` items become sub-issues labelled `maybe`.

The round ends with the parent's URL. Picking the next sitting is what-next's job, when asked.

## Common mistakes

| Mistake                                  | Instead                      |
| ---------------------------------------- | ---------------------------- |
| "Potential: high" with no score or probe | Score table, then a probe    |
| Three tame wild ideas                    | 12+, 4 strange, filter after |
| Calling arithmetic "proven"              | Seen or suspected            |
| Only open issues checked                 | Closed and not-planned too   |
| Rejected ideas only in chat              | Dead list in the parent body |
| Desktop shots unread, no small phone     | Floors in step 2             |
| Ending with A/B/C picking                | End with the parent URL      |
