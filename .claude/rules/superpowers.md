# Superpowers

The superpowers plugin (`superpowers@claude-plugins-official`, enabled in `.claude/settings.json`) is the dev workflow. Use its skills as they say. This file maps a sitting onto those skills and lists the few places the project differs. Cloud-session rules, such as committing and pushing as work lands, are in `CLAUDE.md`.

## A sitting, start to finish

1. **Pick:** the what-next skill (ours; superpowers has no work picker).
2. **Issue:** the github-issues skill (ours). Every sliver has an issue before code.
3. **Design:** `superpowers:brainstorming`.
4. **Plan:** `superpowers:writing-plans`, for one sliver only. A design that spans several slivers is split first (Specs and plans, below).
5. **Build:** `superpowers:subagent-driven-development`, or `superpowers:executing-plans` for a plan of a few tasks. `superpowers:test-driven-development` and `superpowers:systematic-debugging` as they say.
6. **Prove:** `superpowers:verification-before-completion`. The evidence is the gate and `npm run play` (`dad-friendly-work.md`).
7. **Review and ship:** the ship-sitting skill (ours). It runs `superpowers:requesting-code-review`, then `superpowers:finishing-a-development-branch` with the PR option, then babysits, and squash-merges when Flemming asks to me## Where we differ

- **Specs for big designs.** A brainstorm whose design spans several slivers produces one spec. After the spec is approved, do not go to writing-plans (this replaces brainstorming's handoff). The spec ships as its own PR on a parent issue and is split into sliver issues under it. Each later sitting plans one sliver from that spec (no new brainstorm), builds it, and ships one PR. A small change does its short design, plan, and build in one sitting and one PR. Plans are committed with the sliver.
- **Finishing is always a PR.** In `superpowers:finishing-a-development-branch`, do not show the menu: the choice is "Push and create a Pull Request" against `main`. A local merge would stay in a cloud container that gets thrown away. Its test suite is `npm run gate -- full`. When a plan says to use finishing-a-development-branch, use the ship-sitting skill instead; it reviews, calls finishing, and merges when Flemming asks.
- **Three stops while running a plan.** Besides superpowers' own stop reasons, stop for only three things:
  - a guardrail limit in `src/lab/targets.ts`;
  - an approved milestone mark, line of copy, or piece of art;
  - PixelLab spend (the pixellab skill always asks first).

  Ask it as one question with three options and one recommended. Everything else is a ruling, as superpowers says: decide, record it in the ledger, and keep going. That includes prices, growth rates, and band scales inside the levers the plan agreed on. Rulings also go in the PR body (ship-sitting).

- **Worktrees.** None. Work in place on the sitting's branch. That is the declared preference `superpowers:using-git-worktrees` asks for.
- **Style.** The three-option question is for picking work (what-next) and the three stops. Brainstorming asks its own way. Commit messages follow the repo's style (`M13-5: ...` or a plain sentence), not `feat:` prefixes.
