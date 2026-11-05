# Superpowers

The superpowers plugin (`superpowers@claude-plugins-official`, enabled in `.claude/settings.json`) is the dev workflow. Use its skills as they say. This file lists only where the project adds to them or differs from them. Where they disagree, the project's rules and skills win.

## A sitting, start to finish

1. **Pick:** the what-next skill (ours; superpowers has no work picker).
2. **Issue:** the github-issues skill (ours). Every sliver has an issue before code.
3. **Design:** `superpowers:brainstorming`.
4. **Plan:** `superpowers:writing-plans`, for one sliver only. A design that spans several slivers is split first (Specs and plans, below).
5. **Build:** `superpowers:subagent-driven-development`, or `superpowers:executing-plans` for a plan of a few tasks. `superpowers:test-driven-development` and `superpowers:systematic-debugging` as they say.
6. **Prove:** `superpowers:verification-before-completion`. The evidence is the gate and `npm run play` (`dad-friendly-work.md`).
7. **Review and ship:** the ship-sitting skill (ours). It runs `superpowers:requesting-code-review`, then `superpowers:finishing-a-development-branch` with the PR option, then babysits, merges, and watches the deploy.

## Where we differ

- **No worktrees.** Work in place on the sitting's branch. That is the declared preference for `superpowers:using-git-worktrees`.
- **Specs and plans.** A brainstorm whose design spans several slivers produces one spec. After the spec is approved, do not go to writing-plans (this overrides brainstorming's handoff). The spec ships as its own PR on a parent issue and is split into sliver issues under it. Each later sitting plans one sliver from that spec (no new brainstorm), builds it, and ships one PR. Plans are committed with the sliver. A small change does its short design, plan, and build in one sitting and one PR. Specs and plans record what was decided; the current-state docs (`dad-friendly-work.md`) still describe how the game works now.
- **Execution method is already chosen.** At the writing-plans handoff, it is subagent-driven, or executing-plans for a plan of a few tasks. Still ask the human to review the plan.
- **Extra stops while running a plan.** Besides superpowers' own stop reasons, stop for any number, tuning, copy, or art call the approved spec does not settle. Ask it as one question with three options and one recommended. PixelLab always asks first (the pixellab skill). Other rulings go in the PR body.
- **Questions.** Brainstorming asks its own way. The three-option format is for picking work (what-next) and for the stops above.
- **Finishing.** In `superpowers:finishing-a-development-branch`, the choice is always "Push and create a Pull Request": do not show the menu. The base branch is `main`. Its full test suite is `npm run gate -- full`. The PR URL is reported after the deploy, not at creation. Never merge locally into `main`. When a plan says to use finishing-a-development-branch, use the ship-sitting skill instead; it reviews, then calls finishing.
- **Review severity.** Critical and Important findings are non-nits and are fixed before the PR. Minor findings are nits and may ship. A follow-up idea from a review becomes a GitHub issue.
- **Commit messages** follow the repo's style (`M13-5: ...` or a plain sentence), not `feat:` prefixes.
