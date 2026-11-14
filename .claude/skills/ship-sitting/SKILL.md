---
name: ship-sitting
description: Use when the user asks to ship, commit and PR, file the PR, finish the sitting, or babysit the PR, and when a superpowers plan completes (instead of calling superpowers:finishing-a-development-branch directly).
---

# Ship sitting

Superpowers reviews the branch and opens the PR. This skill adds what superpowers leaves out: the full gate on the PR's final commit, babysitting the PR in this conversation, and the squash-merge. The sitting ends at the merge. The agent reviews, files, babysits and merges its own PR without waiting for Flemming.

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

The proof is the gate, run by hand, and the `signoff` status that records it. GitHub runs two checks on a PR: the Claude review (Babysit) and `merge-check` (below).

- `npm run gate -- fast` where superpowers says to verify, before calling a task done, and before the PR is opened.
- `npm run gate -- full` on the PR's final commit, before the merge (#585). It starts in the background as soon as the PR is open, so it runs while the Claude review does, and runs again after any later push. It adds the strict strategy lab when economy code changed. Red means no merge. Green on a clean, committed HEAD leaves the signoff marker.
- `npm run gate -- signoff` after the push. It starts the `signoff` workflow, which posts the `signoff` status on HEAD. The ruleset on `main` requires that status on the head commit, so any later push needs the full gate and the signoff again. Another PR merging does not: the branch need not be up to date with `main` (#617). Never post `signoff` any other way, and never start the workflow by hand.
- `merge-check` (#617, `.github/workflows/merge-check.yml`) merges the PR into the current `main` and runs `npm run gate -- merge` (typechecks, lint, knip, the unit tests) in GitHub Actions, after every push and again for every open PR each time `main` moves. Its status on the head is pending while it runs, and green names the `main` commit it tested. So when another PR merges, wait a few minutes for it, then merge: no rebase, no new push, no new full gate. Red means this PR and what landed on `main` break each other, or conflict: merge `main` into the branch, fix, and that push needs the full gate and the signoff again. Never post `merge-check` by hand.
- After the merge, `deploy-hosting` runs the full gate on `main` before it deploys. If it goes red, fix `main` first.

## Commit

- Before the PR, the work is proven: the fast gate green, and `npm run play` seen for anything the player sees.
- On the sitting's branch, not `main`.
- Stage only this issue's files. No secrets (`.env`, Firebase, PixelLab tokens).
- If a second sliver snuck in, stop. That work gets its own issue, not this PR.
- Commit message: why, in 1-2 sentences, in the repo's style. Do not amend.

## Review

Use `superpowers:requesting-code-review` on the branch diff that would merge (`origin/main...HEAD`). If a superpowers plan just ended with a final whole-branch review by a fresh reviewer (and its scoped re-review, if any) and nothing has been committed since, that review counts. A self-review never counts. The review brief asks the reviewer to search the codebase, not only the diff, for an existing mechanism the change copies or should have used: a copy is an Important finding. The brief uses the same lenses as the CI review (#582): `git diff --name-only origin/main...HEAD | node tools/review/prompt.ts lenses` names them, and the reviewer gets `.github/review/prompt.md`'s rules, each named `.github/review/<lens>.md`, the issue and the plan.

Do not open the PR until the review returns only Minor findings, or none. Every Critical or Important finding still open is a non-nit, including one a plan parked with a ruling. Fix it, commit, and review again. If you judge a finding wrong, give the reviewer your reason in the scoped re-review. Dismiss it, with the reason under Rulings, only if the reviewer agrees. If it turns on a product or design call, ask the human as one question with three options and one recommended. Minor findings are nits and may ship. If a non-nit is still there after two fix rounds, stop and ask.

## Open the PR

Use `superpowers:finishing-a-development-branch` with "Push and create a Pull Request" already chosen, against `main`. Its test suite here is `npm run gate -- fast`: see it green, push, and open the PR, so the Claude review starts at once (#585). Then start `npm run gate -- full` in the background and babysit while both run. Do not edit the working tree while a full gate runs: a fix waits for it, or stops it, and the full gate runs again after the last fix push. The title matches the sliver. The PR body:

```markdown
## Summary

- ...

## Test plan

- ...

## Rulings

- ... (the plan's ledger rulings, such as prices, growth rates, and band scales picked inside the agreed levers, deferred Minor findings from the review, and small follow-ups not worth their own issue; omit if none)

Fixes #N
```

## Babysit

In a cloud session, subscribe to the PR (`subscribe_pr_activity`) and let events wake the session. Do not poll.

1. Refresh live PR state each pass. Do not act on stale state.
2. Conflicts first, then unresolved review comments.
3. Handle review comments with `superpowers:receiving-code-review`. Fix real in-scope issues. Dismiss invalid ones with a reason. Every review thread, from the Claude review, a person or another bot, is answered and resolved before the merge, nits too (below).
   - The `claude-review` workflow (#572) posts a PR review headed "Claude review" a few minutes after the PR is opened, reopened or marked ready for review, and a re-check after each push (step 4). Its body says which lenses it reviewed with and at which commit, and each finding is its own review thread, on its line or on its file (#584). A finding in a file the PR does not touch is listed in the body. When it did not review (art only, credit used up, no secret, a failure), it posts a plain comment that says why. If GitHub refused the review or a file thread, the findings come as a plain "Claude review" comment instead: answer each one, point by point, in one PR comment. Wait for its run before merging.
   - **Every review thread is answered and resolved before the merge, Minor ones too (Flemming, 14 Nov 2026).** For each thread: fix it and reply with the commit that fixes it, or reply with the reason it stays as it is (wrong, out of scope with the issue you filed, or a ruling). Then resolve the thread (`resolve_review_thread`; replies with `add_reply_to_pull_request_comment`). Answer the findings listed in the review body in one PR comment. A `Needs Flemming` finding (one of the three stops in `.claude/rules/superpowers.md`, or a product or design call that is his) goes to Flemming, and its thread stays open until he answers. No other finding waits for a person.
4. Run the fast gate on every fix and commit it. Reply on each thread with "Fixed in <short sha>: …" (or why not), and resolve it, before you push, so the re-check reads the replies and `tools/review/tally.ts` counts the fix. Then push. Each push gets a re-check from the Claude review: it looks only at what changed since the commit it last reviewed, reads the replies on the threads, and posts new findings only. A push that only merges `main` keeps the earlier review with no model call. Batch the fixes for one review into one push where you can. Before merging, run `npm run gate -- full` on the final commit, then `npm run gate -- signoff`. Any later push (a fix, or `main` merged into the branch) needs both again, so do not merge `main` in just because it moved: `merge-check` re-tests the PR on the new `main` by itself (#617). Merge `main` in only for a conflict or a red `merge-check`. Never force-push.

When the PR is mergeable, its head commit has a green `claude-review` status (#587: reviewed, kept with no model call, or skipped for art, a used-up credit or a missing secret; it is pending while the review runs and red when it failed, so re-run the job), has a green `signoff` and a green `merge-check` whose description names the current `main` commit (`gh api repos/{owner}/{repo}/commits/<sha>/status` shows all three; if `merge-check` names an older `main`, wait for the new run), no review thread is open (`pull_request_read` with `get_review_comments` shows each thread's state), and every other non-nit comment is fixed or dismissed, it is ready. Squash-merge it. Do not wait for Flemming's "merge": he made Claude responsible for reviews and merges (2026-11-11). Wait only when a `Needs Flemming` finding, or another product or design call, is still open on the PR: then swap the issue's `agent-working` for `needs-you` and ask (github-issues, Triage).

Merge with the GitHub MCP `merge_pull_request` tool (squash) in a cloud session, or `gh pr merge --squash` elsewhere. Then:

```bash
git checkout main
git pull
```

Remove `agent-working` from the closed issue, and triage the issues it was blocking (github-issues, Triage). Do not delete the local feature branch unless asked. The sitting ends here: return the PR URL.
