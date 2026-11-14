# Claude review knows the PR's intent and reviews by lens (#582)

Design: `designs/2026-11-14-pr-review-design.md` in the project files (parent #581). Flemming: "1: agree", "3: opus for everything".

**Shared module:** `tools/review/prompt.ts`, new, beside the job it serves. The lens texts go in `.github/review/` with the prompt that #574 put in `.github/claude-review.md` (moved). No existing module picks reviewers or builds prompts.

1. `lensesFor(paths)`: the path table from the design, settled against the tree. Art and other binary files get no lens; any other text file no lens takes gets the code lens. Order: guards, save, code, game, spec. Test first (`tools/review/prompt.test.ts`).
2. `issuesFixed(body)`: GitHub's closing keywords, once each.
3. `planReview(...)`: fill the prompt, join only the chosen lens texts, end with the title, body and issues inside `<pr-intent>` as data, cut each part at 20,000 characters, and skip with a reason when there is no lens.
4. The CLI (`lenses`, `issues`, `build`) for the workflow and for the thread's own reviewer.
5. The workflow: a Plan step reads the PR's words from the event and its issues with `gh api` (`issues: read`), runs `build` from the base commit's copy (the PR's own when the base predates it), and skips the model on art only. The post step heads the comment "Reviewed as: <lenses>, at commit <sha>".
6. Docs: `docs/ARCHITECTURE.md`, and ship-sitting's review brief uses the same lenses.

Proof: the test file, `npm run gate -- fast`, dry runs of the Plan and Review steps on #575 (code), #562 (spec) and #570 (rules), then the full gate.
