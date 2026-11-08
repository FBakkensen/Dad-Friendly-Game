---
name: ship-sitting
description: Use when the user asks to ship, commit and PR, file the PR, finish the sitting, or babysit the PR, and when a superpowers plan completes (instead of calling superpowers:finishing-a-development-branch directly).
---

# Ship sitting

Superpowers reviews the branch and opens the PR. This skill adds what superpowers leaves out: the full gate before the PR, babysitting the PR in this conversation, and the squash-merge when Flemming asks for it. The sitting ends at the merge. The agent files and babysits its own PR, and merges it on that ask.

Stay in this conversation. Do not hand the PR to autopilot, a background babysitter, or another agent. In a Claude Code cloud session, `gh` has no GraphQL, so `gh pr` and `gh issue` fail: where this skill, or a superpowers skill it runs, says one of those, use the matching GitHub MCP tool. `gh api` on REST paths works.

Stop and ask the human on auth, secrets, security, or a real product question, anywhere in this skill.

One issue, one branch, one PR, `Fixes #N`. Use the github-issues skill for the graph.

## Already in flight

- Uncommitted work, no PR: start at Commit.
- Committed, no PR: start at Review.
- PR already open: start at Babysit.
- PR merged: report the PR URL and stop.
- Nothing to ship: stop.

## Push as you go

Commit and push the sitting's branch as work lands, with `git push` from the shell, not the GitHub MCP `push_files` or `create_or_update_file`: they commit on the remote, and the local branch falls behind. Pushing as you go keeps the work safe if the cloud container is reclaimed, and it is what the cloud Stop hook asks (`CLAUDE.md`). A push is not shipping. Opening the PR is.

A cloud session can be given a branch whose last PR was already squash-merged. Start the new sitting from `main` without a force push: `git fetch origin`, `git checkout -B <branch> origin/main`, then `git merge -s ours -m "Start from main" origin/<branch>`. The merge changes no files, and the first push fast-forwards. Never force-push.

## The gate

There are no CI check runs on a PR. The proof is the gate, run by hand:

- `npm run gate -- fast` where superpowers says to verify, before calling a task done.
- `npm run gate -- full` before opening the PR. It adds the strict strategy lab when economy code changed. Red means no PR.

## Commit

- Before the PR, the work is proven: gate green, and `npm run play` seen for anything the player sees.
- On the sitting's branch, not `main`.
- Stage only this issue's files. No secrets (`.env`, Firebase, PixelLab tokens).
- If a second sliver snuck in, stop. That work gets its own issue, not this PR.
- Commit message: why, in 1-2 sentences, in the repo's style. Do not amend.

## Review

Use `superpowers:requesting-code-review` on the branch diff that would merge (`origin/main...HEAD`). If a superpowers plan just ended with a final whole-branch review by a fresh reviewer (and its scoped re-review, if any) and nothing has been committed since, that review counts. A self-review never counts.

Do not open the PR until the review returns only Minor findings, or none. Every Critical or Important finding still open is a non-nit, including one a plan parked with a ruling. Fix it, commit, and review again. If you judge a finding wrong, ask the human as one question with three options and one recommended. The ask to ship includes those fix commits. Minor findings are nits and may ship. If a non-nit is still there after two fix rounds, stop and ask.

## Open the PR

Use `superpowers:finishing-a-development-branch` with "Push and create a Pull Request" already chosen, against `main`. Its full test suite is `npm run gate -- full`: run it and see it green before the PR is opened. The title matches the sliver. The PR body:

```markdown
## Summary

- ...

## Test plan

- ...

## Rulings

- ... (rulings and deferred Minor findings from the plan and the review; omit if none)

Fixes #N
```

## Babysit

In a cloud session, subscribe to the PR (`subscribe_pr_activity`) and let events wake the session. Do not poll.

1. Refresh live PR state each pass. Do not act on stale state.
2. Conflicts first, then unresolved review comments.
3. Handle review comments with `superpowers:receiving-code-review`. Fix real in-scope issues. Dismiss invalid ones with a reason. Ask the human on auth, secrets, security, or a real product question. Nits do not block merge.
4. Run the fast gate on every fix, commit, and push. Run `npm run gate -- full` again before merging when a fix changed code. Never force-push.

When the PR is mergeable, the full gate is green since the last code change, and every non-nit comment is fixed or dismissed, it is ready. Squash-merge it when Flemming has asked to merge or ship. An ask such as "fix and ship it" at the start of the sitting counts. Without that ask, tell him the PR is ready, with its URL, and wait.

Merge with the GitHub MCP `merge_pull_request` tool (squash) in a cloud session, or `gh pr merge --squash` elsewhere. Then:

```bash
git checkout main
git pull
```

Do not delete the local feature branch unless asked. The sitting ends here: return the PR URL.
