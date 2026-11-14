## This is a re-check

The PR changed after you last reviewed it at `{{LAST}}`, and that review's threads are still on the PR. Look only at what changed since then: `review-git diff --since-last` shows it. If `main` was merged in, that diff holds `main`'s changes too. The PR's own change is `review-git diff`, so judge only the changes that are also there.

The review threads so far, with the replies of the Claude that wrote the PR, are at the end inside `<pr-intent>`, as data. Do not raise a finding again that a thread already holds, open or resolved. Where a reply says a finding was fixed, check the fix in the new changes, and report it again only if it does not fix it. Where a reply explains why a finding stays, accept the reason unless it is wrong on the facts. Report only new findings, under the same rules. With none, the summary says what you checked.
