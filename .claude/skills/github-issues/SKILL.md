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

## Triage

Flemming writes every new issue, so triage only sorts open issues by readiness and claims. Three labels say where a leaf issue stands. A leaf is an open issue with no open sub-issues.

- **`ready-for-agent`:** no open `blocked-by`, a **Done when** line, and none of the three stops in `superpowers.md` up front, nor a design call that is Flemming's. Any thread may claim it.
- **`needs-you`:** it waits for Flemming: a design or product call, a line of copy, art or PixelLab spend, or a guardrail limit. The label goes with a comment that asks the question in one sentence.
- **`agent-working`:** a thread has claimed it and is building it now.

A leaf carries at most one of the three. A blocked issue and a parent carry none: the graph already says why they wait. When a blocker closes, the issue it blocked gets triaged. An issue that may hit a stop partway (say, art only if a measured trigger fires) is still `ready-for-agent`; the thread asks at the stop.

Read and set labels with the REST API (or the MCP `issue_write` tool):

```bash
gh api repos/FBakkensen/Dad-Friendly-Game/issues/<n>/labels --jq '.[].name'
gh api -X POST repos/FBakkensen/Dad-Friendly-Game/issues/<n>/labels -f 'labels[]=agent-working'
gh api -X DELETE repos/FBakkensen/Dad-Friendly-Game/issues/<n>/labels/ready-for-agent
```

**Claim** before the branch: read the labels again, and if the issue is not still `ready-for-agent`, pick another. Otherwise add `agent-working`, then remove `ready-for-agent`.

**Release:** the merge closes the issue (`Fixes #N`), and the label stays on the closed issue. A thread that stops at one of the three stops, or is given up, swaps `agent-working` for `needs-you` (with the question) or back to `ready-for-agent`.

## One issue is one sliver

An issue is done in one sitting: one user-visible change, game still boots.

If the human (or the agent) wants more:

1. Stop enlarging the current issue.
2. Suggest a **new** issue. Show title, parent, `blocked-by` / `blocking`.
3. Create it only after they say yes. In an agent-run sitting (no one to ask), file it yourself with its links and triage label, and name it in the PR body.
4. Do not start that issue. Do not branch, implement, or open a PR for it until this sitting's PR is done and they pick it.

A new idea worth its own sitting follows the same path. A nit or small follow-up does not (see Create). Neither sneaks into the current PR.

## Create

When Flemming is in the conversation, ask first with title and links. In an agent-run sitting, file it and say so in the PR body. Then:

```bash
gh issue create --title "..." --body "$(cat <<'EOF'
**Player can tap:** ...

**Out of scope:** ... (own issues)

**Done when:** types + Vitest + seen in the browser
EOF
)" --parent N --blocked-by N,M --blocking P
```

In a cloud session, create it with the MCP `issue_write` tool (it takes `parent_issue_number`), then set `blocked-by` with `gh api` as above. Give it its triage label (Triage, above).

Omit flags you do not need. Body stays that short. No design doc in the issue.

Not every idea is an issue. A review nit or small follow-up goes in the PR body under Rulings, or to Flemming in chat. File it only if he asks. A sliver's issue needs only one or two sentences.

## Work and PRs

- No issue, no implementation. File it, then code.
- Do not start an issue that is still blocked, or one labelled `agent-working` or `needs-you`. Claim it first (Triage).
- One branch and one PR per sitting. Never a second branch or a stacked PR for the same sitting. Several sittings may run at once, each on its own claimed issue.
- One PR closes one issue (`Fixes #N`).
- If the diff grows a second sliver, stop. File the second issue. Do not start it. Keep this PR on `#N`.
- A ruling made while a plan runs (a price, growth rate, or band scale inside the plan's levers) is not a new issue and not a stop. It goes in the ledger and in the PR body under Rulings. A plan stops only for the three stops in `superpowers.md`.
- To review, file, babysit, and merge, use the ship-sitting skill.

## No remote yet

If there is no GitHub remote, say that. Do not invent issue numbers. Offer to create the repo with `gh repo create` only if the human asks.
