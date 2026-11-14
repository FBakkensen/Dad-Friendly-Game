# Review before the full gate, re-check on each push (#585)

**Goal:** the Claude review runs while the full gate does, each push gets a re-check of only what changed, and a push that only merges `main` costs no model call.

**Shared module:** `tools/review/recheck.ts`, new, beside `prompt.ts`, `git.ts` and `findings.ts`, and run from the base commit like them. `findings.ts` gains the marker and a re-check heading. `prompt.ts` gains `--last` and the threads. `git.ts` gains `diff --since-last`.

1. `reviewedMarker` / `lastReviewed`: every posted review carries `<!-- claude-review reviewed=<sha> -->`, and the job finds the newest one among github-actions' reviews and comments. Tested first (`tools/review/recheck.test.ts`).
2. `changeShape` and `same`: the PR's own diff at the last reviewed commit and at the head, each against its own merge base, with blob ids and hunk positions dropped. When they are equal, the review stands.
3. `threadsOf` / `threadsText`: the review threads from GraphQL (open ones first, with every reply), as data in the intent block.
4. `.github/review/recheck.md`: the re-check paragraph, put in at `{{RECHECK}}` with the last commit.
5. The workflow: `synchronize` triggers it; the Plan step finds the last review, keeps it or builds a re-check; the Post step posts nothing for a kept review or for an art-only PR's later pushes, and heads a re-check as one.
6. The order: the PR opens after the fast gate; the full gate and signoff run once on the final commit (ship-sitting, `CLAUDE.md`, `dad-friendly-work.md`, `superpowers.md`, `docs/ARCHITECTURE.md`).
