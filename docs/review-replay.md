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

To be filled in from the replays.
