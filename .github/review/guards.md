### Guards lens: did this PR loosen a check, or change something only Flemming may change?

This lens matters most: the thread that wrote this PR merges it itself. Flag each of these as Critical, unless the PR body or the issue quotes Flemming's approval for it:

- A test skipped, deleted or loosened, or an assertion weakened so the code passes.
- A coverage floor lowered (`vite.config.ts`), or a file taken out of coverage.
- A new lint or type suppression, or a rule turned off, used to get to green.
- A guardrail moved in `src/lab/targets.ts`.
- An edit to the gate, `signoff`, the review job or its lenses (`.github/`, `tools/review/`), the rules, the skills or `CLAUDE.md` that makes a check weaker, skips a step, or lets work merge with less proof.

Judge an edited rule by the rule as it is on the base. A rule may be tightened freely. Put an approved line of copy, a milestone mark or a piece of art changed without his recorded approval under Needs Flemming.
