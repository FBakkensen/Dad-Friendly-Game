---
name: ship-sitting
description: Commits the current sitting, runs a code-review pass, fixes non-nits, opens one PR, babysits CI and reviews through squash-merge, then watches the hosting deploy on main. Use when the user asks to ship, commit and PR, file the PR, finish the sitting, or babysit the PR.
---

# Ship sitting

Commit, code-review, fix, open the PR, babysit until squash-merge, then watch the deploy workflow on `main`. Stay in this conversation. Do not use autopilot, background babysitters, or a cloud agent.

One issue, one branch, one PR. `Fixes #N`. Use the github-issues skill for the graph.

## Already in flight

- Uncommitted work, no PR: start at Commit.
- Committed, no PR: start at Code-review.
- PR already open: start at Babysit.
- Merged, deploy still running or failed: start at After merge.
- Nothing to ship: stop.

## Gate

Before the first commit:

- On the sitting's branch, not `main`.
- Stage only this issue's files. No secrets (`.env`, `.cursor/mcp.json`, Firebase, PixelLab tokens).
- `npm run check` green.
- If a second sliver snuck in, stop. That work gets its own issue, not this PR.

## Commit

Follow the git commit protocol. In parallel: `git status`, `git diff`, `git log` for message style.

Then stage the sitting's files and commit with a HEREDOC. Message is why, 1-2 sentences. Do not amend unless the commit protocol allows it. Do not push yet.

If hooks rewrite files, make a new commit. Do not amend a failed hook.

## Code-review

Load the code-review skill (`/skill:code-review`) and follow it. Do not skip it. Do not substitute a paraphrase of the review contract in `AGENTS.md` for that skill.

The relevant code is the branch diff that would merge (`git diff main...HEAD`).

Do not run `gh pr create` until this pass returns only nits, or no findings.

## Fix

Fix every non-nit. Commit the fixes. The ask to ship includes those commits. Run the code-review pass again.

Nits can ship. If a non-nit remains after two fix rounds, stop and ask.

## Create the PR

Push with `-u` if needed. Then `gh pr create`. Title matches the sliver. Body:

```markdown
## Summary

- ...

## Test plan

- ...

Fixes #N
```

One PR closes one issue. Never a second branch or stacked PR.

## Babysit

Refresh live PR state each pass (`gh pr view`, `gh pr checks`). Do not act on stale state.

1. Conflicts first, then unresolved review comments, then failing CI.
2. Watch CI to completion (`gh pr checks --watch`). Do not invent work while checks run.
3. Fix CI caused by this PR. Read the failing log. Push the fix. Never force-push. Never edit CI config just to go green.
4. Handle review comments here. Fix real in-scope issues. Dismiss invalid ones with a reason. Ask the human on auth, secrets, or a real product question. Nits do not block merge.

When the PR is mergeable, required CI is green, and every non-nit comment is fixed or dismissed, squash-merge without waiting:

```bash
gh pr merge --squash
git checkout main
git pull
```

Do not delete the local feature branch unless asked. Then go to After merge. Do not return the PR URL yet.

## After merge

The sitting is not done at squash-merge. `deploy-hosting` runs on `main` and can fail after the PR is green.

Refresh the merge commit, then list the workflows that commit started:

```bash
git rev-parse HEAD
gh run list --commit "$(git rev-parse HEAD)" --json databaseId,name,status,conclusion,url
```

If the list is empty, wait and list again. Do not treat an empty list as success.

Watch each run to completion, including `check` if it ran again, and `deploy-hosting`:

```bash
gh run watch <id> --exit-status
```

Do not invent work while they run.

If deploy fails, read the log (`gh run view <id> --log-failed`). Fix the cause. Push if it is code. Re-run the workflow (`gh run rerun <id>`). Never force-push. Never edit CI just to go green.

Return the PR URL only after those runs succeed.
