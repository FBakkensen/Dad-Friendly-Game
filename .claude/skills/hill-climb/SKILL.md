---
name: hill-climb
description: Use when the user asks to run a hill-climb round, to scout the game for bugs, polish, or new ideas (however wacky), to refill a thin backlog, or to check whether ideas have potential before they become issues.
---

# Hill climb

A round turns many ideas into a few proven issues. It starts from the last round's best and parked lists, so the game climbs instead of restarting. A round files issues. It fixes nothing, commits nothing, and spends no PixelLab credits.

## 1. Start from the last round

- Round parents carry the `hill-climb` label. Find the latest: `gh api -X GET search/issues -f q='repo:FBakkensen/Dad-Friendly-Game is:issue label:hill-climb' -f sort=created -f order=desc` and take the first item. Read its dead list, parked list, **Climb from:** line, and its open `maybe` sub-issues. This round is N+1 (round 1 if none).
- The same `gh api -X GET search/issues` loads open issues and closed ones (`is:closed`, `reason:"not planned"`, keywords). Check every kept idea against both. A dead or closed idea comes back only if you can say what changed.

## 2. Scout three streams

Subagents may run the streams in parallel. `play` clears its output folder, so give every run its own `--out <scratchpad>/<stream>-<save>`. Each stream has a floor:

| Stream     | Floor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bugs**   | `npm run play` from every named save (`--help` lists them). Read every phone shot and `log.txt`. Cover one away/welcome-back case and the supported phone sizes, 424×924 and 424×830 (`docs/DESIGN.md`, #273). Smaller phones only need to open without page errors. `play` opens 424×924 by default; `--viewport 424x830` takes the shorter one, the `away` save opens on the welcome-back card, and the `brief` save shows the quiet short-absence note. Where `play` cannot reach a size or a state, write a scratchpad puppeteer probe that reuses `tools/browser/harness.ts` and `tools/browser/fixtures.ts`. |
| **Polish** | Gameplay: `npm run lab -- --seeds 5` in the background (`reports/strategy-lab.md`): dead stretches, never-worth buys, trap buys, spikes that break two minutes. Before reporting "never used", read that policy in `src/lab/` — a weight of 0 is the policy, not the game. UI/UX: shots against the `docs/ui-audit.md` bars (48px targets, contrast, no page scroll at the supported sizes) and the numbers-vs-discoveries rule.                                                                                                                                                                                   |
| **Wild**   | At least 12 ideas before any filter, at least 4 that make you say "huh". Spread them over: the dad's real night, kids growing up, the mountain's world, senses, async with other dads, prestige and generations, AI spice. Do not self-censor here.                                                                                                                                                                                                                                                                                                                                                                |

A bug is **seen** (reproduced in the browser, a test, or a sim) or **suspected** (code reading or arithmetic only). Only seen bugs are filed as bugs. A suspected bug is `maybe`, with the missing repro step in its body. A gap in the project's own tooling (a `play` save or viewport that is missing) is a finding too.

## 3. Kill on the hard rules

Dead at once, with one line why: twitch real-time play, sound or vibration before unmute, punishing loss, progress lost on instant quit or a confirm on close, a live server or world, AI required to progress, placeholder art, phone page scroll, jokes at dads' expense (the tone in `docs/DESIGN.md`). Needing PixelLab art is a cost, not a death. When the rules are silent or disagree (say, landscape, a raised art ceiling such as a tileset or isometric world, or a shipped choice that bends a rule), it is a question for the human, not a verdict.

## 4. Score the survivors

Each 1–5, total out of 20:

- **Fit:** 5 = obeys every rule and deepens the gentle loop; 1 = only just legal.
- **Fun** (relief, for bugs and tooling): 5 = the dad notices tonight; 1 = nobody notices.
- **Cost:** 5 = well under one sitting; 1 = several sittings or new backend.
- **Safety:** 5 = no save field touched; 1 = new save shape and rules.

## 5. Probe the top

The top 3–5, and every claim built on numbers, get the cheapest probe that could kill them:

| Claim             | Probe                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| economy or pacing | `npm run lab`, `npm run lab:sweep`, or a scratchpad sim. Quote the numbers.                                                                                                                             |
| reads on a phone  | a scratchpad HTML mockup, or CSS injected into the running game, shot at 424×830                                                                                                                        |
| feels good        | JS or CSS injected into the running game. A working-tree edit only if `git status --porcelain` was empty when the round began: edit, shoot, `git checkout -- <file>`, and the tree is clean at the end. |

Re-score after the probe. Verdict: **promising**, **maybe**, or **dead**. An unprobed idea is at most `maybe`.

## 6. Show, then file

Show one table: stream, title, score, verdict, one line of evidence. Then the dead list, any questions for the human, and the one you would build first and why. The human strikes rows. Then, with the github-issues skill:

- Parent **"Hill-climb round N (YYYY-MM-DD)"**, labelled `hill-climb` (create the `hill-climb` and `maybe` labels if they are missing). Body: what was scouted and what was not, the score table, the dead list with reasons, the parked list, and a **Climb from:** line for the next round.
- One sub-issue per promising idea or seen bug, sized to one sitting, ending with an **Evidence:** line.
- The top six `maybe` items by score after probing become sub-issues labelled `maybe`, each naming the probe that would settle it. Every other `maybe` goes on the parent's parked list, one line each. The next round may promote them.

The round ends with the parent's URL. Picking the next sitting is what-next's job, when asked.

## Common mistakes

| Mistake                                  | Instead                       |
| ---------------------------------------- | ----------------------------- |
| "Potential: high" with no score or probe | Score table, then a probe     |
| Three tame wild ideas                    | 12+, 4 strange, filter after  |
| Calling arithmetic "proven"              | Seen or suspected             |
| Only open issues checked                 | Closed and not-planned too    |
| Rejected ideas only in chat              | Dead list in the parent body  |
| Twenty `maybe` issues                    | Six issues, the rest parked   |
| Lab "never used" taken at face value     | Read the policy weights first |
| Shots unread, no small phone             | Floors in step 2              |
| Ending with A/B/C picking                | End with the parent URL       |
