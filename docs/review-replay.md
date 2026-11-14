# Claude review replay (#586)

How often is the Claude review right? This replays the review, as it runs on `main` today (#582–#587), on merged PRs whose bugs were found and fixed later, and on two PRs no later fix touched. Each replay is a manual run of `.github/workflows/claude-review.yml` with the PR's number; it posts nothing and keeps its answer as the run's `replay-pr-<n>` artifact.

## The PRs, picked before any replay ran

A "known bug" PR is one whose lines a later fix removed: `git blame` on the parent of each fix commit, over the lines it deleted, names the PR that wrote them, and the fix's issue says what the bug was.

| PR                                                    | Known bugs (issue, fixed in)                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #574 Review each PR with Claude in CI                 | #576: the review fails on a PR whose base predates the prompt (#577)                                                                                                      |
| #476 S1: one time step and a thin store               | #481: a repeat sign-in during the resume hold leaves the save stuck loading (#483). #573: a tab the phone kills pays the crew's last minutes at the away rate (#580)      |
| #402 B4: machine bays, Ready now and the red button   | #490: a hire that starts an idle machine shows only his own hands (#502). #517: with no crew the plate says every hand is busy, and under a minute it says "in 1m" (#521) |
| #482 The field log keeps the evening through a reload | #484: a Start over refused in a second tab reaches the cloud log only after a reload (#487)                                                                               |
| #472 M14-6: the Gold rush vein                        | #525: stones a second counts the Gold rush, and its end is silent (#526)                                                                                                  |
| #461 Control board B6a: the Workshop drawer           | #492: clay recipes say "Need 4 more clay" forever past the Topsoil (#503)                                                                                                 |
| #501 One Sound key in the Ledger                      | none known (clean)                                                                                                                                                        |
| #513 Numbers stand out in a line                      | none known (clean)                                                                                                                                                        |

That is N = 8 known bugs in six PRs. The whole replay stays under $10: runs go one at a time, and they stop before one could take the total past $10 (each may spend up to $2).

## Results

Replayed on 14 Nov 2026 with the tools at e445c4c, one run at a time, for $6.86 in all.

**Of 8 known bugs it caught 1. Of its 15 findings, none was shown wrong.** Six were checked against the code (or a later PR that fixed the same thing) and all were right; the other nine read as plausible but were not checked.

| PR           | Lenses                         | Cost  | Findings                            | Known bugs               | What it said                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------ | ----- | ----------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #574         | guards, spec                   | $0.22 | 1 Needs Flemming, 3 Minor           | #576 caught              | "A PR is reviewed by its own copy of the prompt": load it from the base commit, which is the fix #577 made. It also found that `Bash(git grep:*)` can start any program (`-O`), which #583 closed later. The model choice it raised was Flemming's, and he chose Opus afterwards. |
| #476         | guards, save, code, game, spec | $1.99 | 1 Critical, 1 Minor, 1 Pre-existing | #481 missed, #573 missed | Critical: the modules split out of `progress-store` got coverage floors below its old 96/93/98/96 (checked: `save-watch` has 88 branches). A `v8 ignore` hides a case the types allow. A failed guest save never reaches the save line.                                           |
| #402         | guards, save, code, spec       | $1.20 | 2 Minor                             | #490 missed, #517 missed | Two docs that disagree with the code (checked: `trouble-tap.ts` says the Ready plate uses the fix hold; it does not).                                                                                                                                                             |
| #482         | guards, save, code, spec       | $0.55 | 2 Minor                             | #484 missed              | An unreadable kept field log is read as empty and overwritten with no log line. `save.loaded` is recorded when a stuck tab loses the seat.                                                                                                                                        |
| #472         | guards, save, code, game, spec | $0.85 | 2 Minor                             | #525 missed              | The emulator round-trip save has no `rushUntil`/`rushBank` (checked: still missing on `main`). The committed plan describes the first design.                                                                                                                                     |
| #461         | guards, save, code, game, spec | $1.16 | 1 Minor                             | #492 missed              | `firstCraftLabel` and `WorkshopTeach.action` are dead (checked).                                                                                                                                                                                                                  |
| #501 (clean) | guards, code, game, spec       | $0.37 | none                                | –                        | –                                                                                                                                                                                                                                                                                 |
| #513 (clean) | guards, code, game, spec       | $0.52 | 1 Needs Flemming                    | –                        | Approved milestone sentences are no longer shown, and "Twice as fast" is new copy.                                                                                                                                                                                                |

### What the numbers say

- **Rules, guards and docs: strong.** Every finding that was checked was right, and on #574 it found two problems that later took their own PRs. A clean PR got no findings, or one copy question.
- **Behaviour over time: weak.** Every missed bug needs following the game's state through a sequence: a second sign-in during the resume hold, a tab killed without pagehide, a new mountain with no crew, the last minute before a buy, a material that runs out past its band, a boost that ends mid-play. Its findings on those PRs were about the code's shape and docs instead. The game lens caught no play bug.
- **Cost.** These are large PRs (up to 8,000 changed lines); they averaged $0.86 a review, and #476 used almost all of its $2 cap. Day-to-day reviews so far average about $0.38 (`node tools/review/tally.ts`).

What this suggests for the prompt is #597, filed for Flemming; changing the prompt here was out of scope (#586).
