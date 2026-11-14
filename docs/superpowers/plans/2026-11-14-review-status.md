# A required status that waits for the Claude review (#587)

**Goal:** `main` can require a status that is green only once the review of the PR's head commit has posted, been kept, or been skipped for a used-up credit or art.

**Shared module:** the `claude-review` workflow itself. The status is two `gh api .../statuses/<sha>` calls around the steps that already exist, so no new tool file is needed.

1. Permission `statuses: write`.
2. A first step sets `claude-review` to pending on the head commit.
3. The Post step writes what the status should say when it succeeds: reviewed, re-checked, kept, art only, or credit used up.
4. A last step, `if: always()`, sets green with that text, green when there is no API key, and red otherwise (failed, timed out, cancelled), so a status never stays pending.
5. The ship-sitting skill's merge rule names the status, and `docs/ARCHITECTURE.md` describes it. Flemming adds it as a required check in the `signoff` ruleset, with the clicks given to him in chat.
