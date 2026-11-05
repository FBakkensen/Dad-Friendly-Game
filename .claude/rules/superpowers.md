# Superpowers

The superpowers plugin (`superpowers@claude-plugins-official`, enabled in `.claude/settings.json`) is the dev workflow: brainstorming, specs, plans, TDD, systematic debugging, subagent-driven development, and verification. Use its skills as it says. Where they disagree with these rules, these rules win.

## Picking work

- "What next" and "what should I build" go to the what-next skill. It picks the sliver. Brainstorming starts after the pick.
- Every sliver still has a GitHub issue before code (the github-issues skill).

## Specs and plans

- Follow superpowers: specs go in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, committed.
- A project-sized brainstorm produces one spec. The spec ships as its own PR on a parent issue, and the spec is split into sliver issues under that parent.
- Each sitting writes the plan for one sliver issue, builds it, and ships one PR.
- A small change does its short design, plan, and build in one sitting and one PR.
- The current-state docs (`docs/DESIGN.md`, `docs/design-intent.md`, `docs/ARCHITECTURE.md`, `docs/ART.md`, `docs/ui-audit.md`) stay where they are. Specs and plans record what was decided. A PR that changes behavior updates the current-state docs.

## Running a plan

- Subagent-driven development runs on its own through one sliver's plan, without "should I continue?" check-ins.
- It stops for its own stop reasons, and also for any number, tuning, copy, or art call the approved spec does not settle. That call goes to the human as one question with three options and one recommended. PixelLab still asks first (the pixellab skill).
- The other rulings it makes go in the PR body.
- A small plan (a few tasks) runs inline with executing-plans instead.

## Workspace and shipping

- No worktrees. Work on the sitting's branch.
- The ship-sitting skill replaces finishing-a-development-branch. Never merge locally into `main`.
- Our code-review skill is the gate before filing the PR. A superpowers review's Critical and Important findings are non-nits; Minor findings are nits. A follow-up idea from a review becomes a GitHub issue.
- Commit messages follow the repo's style (`M13-5: ...` or a plain sentence), not `feat:` prefixes.

## Proof

- TDD for logic, with Vitest.
- Verification evidence is the gate (`npm run gate -- fast`, then the full tier on `git push`) plus `npm run play` for anything the player sees.
