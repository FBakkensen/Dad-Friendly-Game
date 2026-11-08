---
name: github-issues
description: Keeps GitHub issues, PRs, and the blocked-by graph as the backbone of work. Use when creating or triaging issues, opening PRs, a new idea appears mid-sitting, a feature is growing past one sliver, or what-next needs unblocked work.
---

# GitHub issues

GitHub is the backbone. Issues, PRs, dependencies. An issue is a sliver: work worth its own sitting and PR. The point is to finish the current sliver, not to grow it.

Use `gh` for all of this. In a Claude Code cloud session, use the matching GitHub MCP tools for issues, PRs, and comments: `gh issue` and `gh pr` need GraphQL, which the session does not have. `gh api` on REST paths works there, and it is how dependencies are read and set. Do not keep the plan only in chat.

## Graph

Read before you write:

List open issues with `gh issue list --state open --limit 50` (the MCP `list_issues` tool in a cloud session). Read an issue's links with the REST API (a 404 from `parent` means no parent):

```bash
gh api repos/FBakkensen/Dad-Friendly-Game/issues/<n>/dependencies/blocked_by --jq '.[].number'
gh api repos/FBakkensen/Dad-Friendly-Game/issues/<n>/dependencies/blocking --jq '.[].number'
gh api repos/FBakkensen/Dad-Friendly-Game/issues/<n>/parent --jq .number
```

- **Parent / sub-issue:** the sitting is a child of a short theme (`--parent`, `--add-sub-issue`). The parent is a title, not a spec.
- **blocked-by:** this issue cannot start until those issues close.
- **blocking:** other issues wait on this one.

After every create or split, set the links so the graph is still true, then read them back to check. Set them yourself. Never ask the human to.

- Parents: the MCP `issue_write` tool (`parent_issue_number`) or `sub_issue_write`.
- `blocked-by`: the REST API. `<id>` is the blocker's numeric id (`gh api repos/FBakkensen/Dad-Friendly-Game/issues/<blocker> --jq .id`), not its number.

```bash
gh api -X POST repos/FBakkensen/Dad-Friendly-Game/issues/<n>/dependencies/blocked_by -F issue_id=<id>
gh api -X DELETE repos/FBakkensen/Dad-Friendly-Game/issues/<n>/dependencies/blocked_by/<id>
```

Do not fake links in markdown instead.

## One issue is one sliver

An issue is done in one sitting: one user-visible change, game still boots.

If the human (or the agent) wants more:

1. Stop enlarging the current issue.
2. Suggest a **new** issue. Show title, parent, `blocked-by` / `blocking`.
3. Create it only after they say yes.
4. Do not start that issue. Do not branch, implement, or open a PR for it until this sitting's PR is done and they pick it.

New ideas that appear through work follow the same path. They do not sneak into the current PR.

## Create

Ask first with title and links. Then:

```bash
gh issue create --title "..." --body "$(cat <<'EOF'
**Player can tap:** ...

**Out of scope:** ... (own issues)

**Done when:** types + Vitest + seen in the browser
EOF
)" --parent N --blocked-by N,M --blocking P
```

In a cloud session, create it with the MCP `issue_write` tool (it takes `parent_issue_number`), then set `blocked-by` with `gh api` as above.

Omit flags you do not need. Body stays that short. No design doc in the issue.

Not every idea is an issue. A review nit or small follow-up goes in the PR body under Rulings, or to Flemming in chat. File it only if he asks. A sliver's issue needs only one or two sentences.

## Work and PRs

- No issue, no implementation. File it, then code.
- Do not start an issue that is still blocked.
- One branch and one PR at a time. Never a second branch, stacked PR, or parallel PR.
- One PR closes one issue (`Fixes #N`).
- If the diff grows a second sliver, stop. File the second issue. Do not start it. Keep this PR on `#N`.
- A ruling made while a plan runs (a price, growth rate, or band scale inside the plan's levers) is not a new issue and not a stop. It goes in the ledger and in the PR body under Rulings. A plan stops only for the three stops in `superpowers.md`.
- To review, file, babysit, and merge, use the ship-sitting skill.

## No remote yet

If there is no GitHub remote, say that. Do not invent issue numbers. Offer to create the repo with `gh repo create` only if the human asks.
