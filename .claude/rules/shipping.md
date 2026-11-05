# File and babysit the PR

When the human asks to ship, commit and open a PR, file the PR, or finish the sitting, use the ship-sitting skill. This file is the code-review, gate, and babysit contract that skill runs. The agent files, babysits, and merges its own PR.

GitHub work goes through `gh` locally. In a Claude Code cloud session, `gh` works for search only (`gh api -X GET search/...`): issues, PRs, comments, and merges go through the GitHub MCP tools. Where this file or a skill says `gh`, use the matching MCP tool there.

## Before you file

Do not open the PR until a code-review pass returns only nits, or no findings.

A review pass covers the branch diff that would merge. It prioritizes bugs, behavioral regressions, security issues, and missing tests. Findings first, by severity. The review pass makes no edits.

Then fix every non-nit. Asking to file the PR includes those fix commits. Review again. Repeat.

Nits can ship. If a non-nit is still there after two fix rounds, stop and ask.

## The gate is the proof

There are no CI check runs on a PR. The proof is the gate, run by the Claude Code hooks in `.claude/settings.json` (`scripts/gate-hook.mjs`):

- **Stop:** when code changed since `origin/main`, the fast tier runs before the turn ends. Red keeps the turn going, with the FAIL lines as feedback.
- **`git push`:** the full tier runs first (with the strict strategy lab when economy code changed). Red blocks the push.

Push with `git push` from the shell, never with the GitHub MCP `push_files` or `create_or_update_file` tools, which skip the hook. Commit in one command and push in the next: the hook blocks the whole command, so a commit chained before a blocked push never happens. Every hook run adds a line to `.gate/hook.log`. Never bypass the hook (`--no-verify` does not apply; do not edit `.claude/settings.json` to get a push through).

## After you file

Stay in this conversation. Do not hand the PR to autopilot, a background babysitter, or another agent. In a cloud session, subscribe to the PR (`subscribe_pr_activity`) and let review events wake the session. Do not poll.

1. Refresh live PR state each pass. Do not act on stale state.
2. Conflicts first, then unresolved review comments.
3. Every fix goes through the gate: run the fast tier while editing, and `git push` runs the full tier. Never force-push.
4. Handle review comments here. Fix real in-scope issues. Dismiss invalid ones with a reason. Ask the human on auth, secrets, security, or a real product question. Nits do not block merge.

When the PR is mergeable, the last push went through the gate, and every non-nit comment is fixed or dismissed, squash-merge without waiting:

```bash
gh pr merge --squash
git checkout main
git pull
```

Then watch the `deploy-hosting` run that merge commit started: it is the only CI left. If the run list is empty, wait and list again. Do not invent work while it runs. If deploy fails, read the log, fix the cause, re-run. Never force-push. Never edit CI just to go green. The sitting is not done until that run succeeds.

Do not delete the local feature branch unless asked. Stop and ask on auth, secrets, or a real product question.
