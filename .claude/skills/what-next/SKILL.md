---
name: what-next
description: Suggests the next dad-friendly development sliver as one interview question with three options and one recommendation. Use when the user asks what next, what to build, what to improve, for suggestions, or which sliver to do in this sitting.
---

# What next

Ask **one** question at a time. Three options, A B C. Mark one as recommended and say why. Wait for the answer. Do not dump a backlog.

This is how dad-friendly decisions get made. Same shape as the project interview.

## Agent-run sittings

A thread started on an issue has its pick: skip this skill. An agent choosing work with no one to ask takes a `ready-for-agent` issue (github-issues, Triage) instead of asking. Prefer the one that unblocks the most, then the oldest. It claims it before the branch. The interview below is for when Flemming asks.

## Before you ask

Read the project rules in `.claude/rules/` (dad-friendly game, dad-friendly work) and the current repo. Load open GitHub issues with the github-issues skill. The three options should be unblocked issues when those exist.

Score every option against:

- One sitting, one user-visible sliver, game still boots
- Close is pause, touch-first, silent until unmute
- Types + Vitest + proof in a real browser
- No placeholders. If the sliver needs art, the sitting includes asking first then PixelLab MCP, not boxes
- Turn-based or idle only, never real-time twitch play
- No SpaceTimeDB, no live world, no Playwright unless asked
- Runtime AI only as optional spice
- Fits in one GitHub issue. If it does not, split first, then offer the small piece

If two options fail those tests, do not offer them. Invent better ones (or run a round with the hill-climb skill when the backlog is thin), then file them as issues only after the human picks (or says yes).

## What to prefer

Prefer improvements that deepen the gentle loop, shorten time-to-pause, or make instant quit safer. Skip chores dressed up as features. Turn-based and idle only.

## Format

Use this shape in the chat (icons allowed):

```markdown
### What next?

[one sentence: what decision this sitting is]

|          | Option         | What it means                                           |
| -------- | -------------- | ------------------------------------------------------- |
| **A** ⭐ | **short name** | one sitting of work. what the player can tap when done. |
| **B**    | **short name** | ...                                                     |
| **C**    | **short name** | ...                                                     |

**Recommended: A** (or B, or C)

[two or three sentences: why this one, why not the others. Be specific to this repo.]

Reply **A**, **B**, or **C**.
```

Put the star on the recommended row. Keep each "what it means" to two or three sentences. Name the files or screens that would change when you know them.

## After they pick

If the pick has no issue yet, create it with the github-issues skill, including dependencies. Then start that sliver with `superpowers:brainstorming`, or with `superpowers:writing-plans` from the parent spec when the issue belongs to an approved spec. Do not chain a second what-next in the same sitting unless they ask. Mid-sitting ideas are not extra scope. One worth its own sitting becomes an issue. Smaller ones follow the github-issues skill.
