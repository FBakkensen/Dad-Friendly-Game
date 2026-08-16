---
name: what-next
description: Suggests the next dad-friendly development sliver as one interview question with three options and one recommendation. Use when the user asks what next, what to build, what to improve, for suggestions, or which sliver to do in this sitting.
---

# What next

Ask **one** question at a time. Three options, A B C. Mark one as recommended and say why. Wait for the answer. Do not dump a backlog.

This is how dad-friendly decisions get made. Same shape as the project interview.

## Before you ask

Read the always-on rules (dad-friendly game, dad-friendly work) and the current repo. Load open GitHub issues with the github-issues skill. The three options should be unblocked issues when those exist.

Score every option against:

- One sitting, one user-visible sliver, game still boots
- Close is pause, touch-first, silent until unmute
- Types + Vitest + proof in Cursor's integrated browser
- No placeholders. If the sliver needs art, the sitting includes asking first then PixelLab MCP, not boxes
- No game pick until the human asks. If they ask, only turn-based or idle
- No SpaceTimeDB, no live world, no Playwright unless asked
- Runtime AI only as optional spice
- Fits in one GitHub issue. If it does not, split first, then offer the small piece

If two options fail those tests, do not offer them. Invent better ones, then file them as issues only after the human picks (or says yes).

## Empty repo or chassis only

Do not invent a game. Offer chassis slivers such as: Vite+TS boot screen, PWA install, Google sign-in, save blob round-trip, mute control, first PixelLab asset after asking.

## After a game exists

Prefer improvements that deepen the gentle loop, shorten time-to-pause, or make instant quit safer. Skip chores dressed up as features. Turn-based and idle only.

## Format

Use this shape in the chat (icons allowed):

```markdown
### What next?

[one sentence: what decision this sitting is]

| | Option | What it means |
|---|---|---|
| **A** ⭐ | **short name** | one sitting of work. what the player can tap when done. |
| **B** | **short name** | ... |
| **C** | **short name** | ... |

**Recommended: A** (or B, or C)

[two or three sentences: why this one, why not the others. Be specific to this repo.]

Reply **A**, **B**, or **C**.
```

Put the star on the recommended row. Keep each "what it means" to two or three sentences. Name the files or screens that would change when you know them.

## After they pick

If the pick has no issue yet, create it with the github-issues skill, including dependencies. Then do that sliver. Do not chain a second what-next in the same sitting unless they ask. Mid-sitting ideas become new issues, not extra scope.
