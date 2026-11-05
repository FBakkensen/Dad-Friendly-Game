---
name: ship-sitting
description: Use when the user asks to ship, commit and PR, file the PR, finish the sitting, or babysit the PR, and when a superpowers plan completes (instead of calling superpowers:finishing-a-development-branch directly).
---

# Ship sitting

Superpowers reviews the branch and opens the PR. This skill adds what superpowers leaves out: one gated push when shipping, babysitting the PR in this conversation, and the squash-merge. The sitting ends at the merge. The agent files, babysits, and merges its own PR.

Stay in this conversation. Do not hand the PR to autopilot, a background babysitter, or another agent. In a Claude Code cloud session, `gh` works for search only: where this skill, or a superpowers skill it runs, says `gh`, use the matching GitHub MCP tool.

Stop and ask the human on auth, secrets, security, or a real product question, anywhere in this skill.

One issue, one branch, one PR, `Fixes #N`. Use the github-issues skill for the graph.

## Already in flight

- Uncommitted work, no PR: start at Commit.
- Committed, no PR: start at Review.
- PR already open: start at Babysit.
- PR merged: report the PR URL and stop.
- Nothing to ship: stop.

## Push once

Work stays local, committed or not, until this skill ships it. The first `git push` of the sitting is the one at Open the PR. After that, only babysitting fixes push. In a Claude Code cloud session, the environment's Stop hook asks to commit and push at the end of every turn with local work. Ignore it until then (`CLAUDE.md`, "Claude Code cloud sessions"): each push pays for the full gate.

## The gate

There are no CI check runs on a PR. The proof is the gate, run by the Claude Code hooks in `.claude/settings.json` (`scripts/gate-hook.mjs`):

- **Stop:** when code changed since `origin/main`, the fast tier runs before the turn ends. Red keeps the turn going, with the FAIL lines as feedback.
- **`git push`:** the full tier runs first (with the strict strategy lab when economy code changed). Red blocks the push.

Push with `git push` from the shell, never with the GitHub MCP `push_files` or `create_or_update_file` tools, which skip the hook. Commit in one command and push in the next: the hook blocks the whole command, so a commit chained before a blocked push never happens. Every hook run adds a line to `.gate/hook.log`. Never bypass the hook, and never edit `.claude/settings.json` to get a push through.

## Commit

- The work is proven: gate green, and `npm run play` seen for anything the player sees.
- On the sitting's branch, not `main`.
- Stage only this issue's files. No secrets (`.env`, Firebase, PixelLab tokens).
- If a second sliver snuck in, stop. That work gets its own issue, not this PR.
- Commit message: why, in 1-2 sentences, in the repo's style. Do not amend. If a hook rewrites files, make a new commit.

## Review

Use `superpowers:requesting-code-review` on the branch diff that would merge (`origin/main...HEAD`). If a superpowers plan just ended with a final whole-branch review by a fresh reviewer (and its scoped re-review, if any) and nothing has been committed since, that review counts. A self-review never counts.

Do not open the PR until the review returns only Minor findings, or none. Every Critical or Important finding still open is a non-nit, including one a plan parked with a ruling. Fix it, commit, and review again. If you judge a finding wrong, ask the human as one question with three options and one recommended. The ask to ship includes those fix commits. Minor findings are nits and may ship. If a non-nit is still there after two fix rounds, stop and ask.

## Open the PR

Use `superpowers:finishing-a-development-branch` with "Push and create a Pull Request" already chosen, against `main`. Its full test suite is `npm run gate -- full`. The push goes through the gate. The title matches the sliver. The PR body:

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
4. Every fix goes through the gate: the fast tier while editing, `git push` for the full tier. Never force-push.

When the PR is mergeable, its last push went through the gate, and every non-nit comment is fixed or dismissed, squash-merge without waiting:

```bash
gh pr merge --squash
git checkout main
git pull
```

Do not delete the local feature branch unless asked. The sitting ends here: return the PR URL.
