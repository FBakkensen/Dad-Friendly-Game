# Replay old PRs and tally the Claude review (#586)

**Goal:** a number for how often the reviewer is right, and a tally that can be run on demand.

**Shared modules:** the `claude-review` workflow gets a `workflow_dispatch` mode instead of a second workflow, so the replay runs the same Plan and Review steps. The tally is a new file, `tools/review/tally.ts`, beside the other review tools, because nothing reads the posted reviews back yet.

1. `workflow_dispatch` with a PR number. A first step, "Find the PR", reads the PR from the API and sets PR, BASE, HEAD, the tools commit and the checkout ref for every later step. A replay takes its tools from the commit it was started on (today's `main`), checks out `refs/pull/<n>/head` (merged branches are often deleted), and never re-checks.
2. A replay posts nothing and sets no status, refuses a fork's PR, and keeps nothing that holds the key or a token (the repo and its artifacts are public). A failed review fails the run. "Keep the replay" writes the prompt, the answer, what would have been posted, and the target into an artifact kept 30 days, and the would-be review into the run summary.
3. `tools/review/tally.ts`: per merged PR, the reviews (bodies naming a cost), the findings (the counts line), the threads fixed (a reply "Fixed in <sha>"), answered and kept, or left open, and the cost. Pages are asked for by number, because `--paginate` follows `repositories/<id>` links that the cloud proxy refuses.
4. The ship-sitting skill asks for "Fixed in <short sha>" replies, so the tally counts them.
5. A dispatch only works once the workflow is on `main`, so the replay itself runs after this PR merges. Its table goes in `docs/review-replay.md` in a second PR on #586, which closes it.
