---
name: github-issues
description: Keeps GitHub issues, PRs, and the blocked-by graph as the backbone of work. Use when creating or triaging issues, opening PRs, a new idea appears mid-sitting, a feature is growing past one sliver, or what-next needs unblocked work.
---

# GitHub issues

GitHub is the backbone. Issues, PRs, dependencies. Also for simple ideas. The point is to finish the current sliver, not to grow it.

Use `gh` for all of this. Do not keep the plan only in chat.

## Graph

Read before you write:

```bash
gh issue list --state open --limit 50 --json number,title,blockedBy,blocking,parent,url
```

- **Parent / sub-issue:** the sitting is a child of a short theme (`--parent`, `--add-sub-issue`). The parent is a title, not a spec.
- **blocked-by:** this issue cannot start until those issues close.
- **blocking:** other issues wait on this one.

After every create or split, set the links so the graph is still true. If `gh` rejects dependency flags, say so. Do not fake links in markdown instead.

## One issue is one sliver

An issue is done in one sitting: one user-visible change, game still boots.

If the human (or the agent) wants more:

1. Stop enlarging the current issue.
2. Suggest a **new** issue. Show title, parent, `blocked-by` / `blocking`.
3. Create it only after they say yes.

New ideas that appear through work follow the same path. They do not sneak into the current PR.

## Create

Ask first with title and links. Then:

```bash
gh issue create --title "..." --body "$(cat <<'EOF'
**Player can tap:** ...

**Out of scope:** ... (own issues)

**Done when:** types + Vitest + seen in Cursor's browser
EOF
)" --parent N --blocked-by N,M --blocking P
```

Omit flags you do not need. Body stays that short. No design doc in the issue.

Simple ideas still get an issue. One or two sentences is enough.

## Work and PRs

- No issue, no implementation. File it, then code.
- Do not start an issue that is still blocked.
- One PR closes one issue when possible (`Fixes #N`).
- If the diff grows a second sliver, stop. File the second issue. Keep this PR on `#N`.

## No remote yet

If there is no GitHub remote, say that. Do not invent issue numbers. Offer to create the repo with `gh repo create` only if the human asks.
