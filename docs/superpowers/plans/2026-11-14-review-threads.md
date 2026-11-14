# Claude review findings as threads that must be resolved (#584)

**Goal:** each finding of the CI review is a PR review thread, and the thread that wrote the PR answers and resolves every one before it merges.

**Shared module:** `tools/review/findings.ts`, new, beside `prompt.ts` and `git.ts`, and run from the base commit like them. Nothing in the repo builds GitHub reviews today.

1. `ANSWER_SCHEMA` and `parseAnswer`: the reviewer answers through `claude -p --json-schema` with a summary and findings (severity, path, line, title, body). Tested first (`tools/review/findings.test.ts`).
2. `commentableLines(diff)`: the new-side lines in each hunk of `git diff BASE...HEAD`, which GitHub takes for a line comment.
3. `reviewPost`: one `COMMENT` review. A finding on a commentable line is a line thread. One elsewhere in a file the PR touches is a file thread (`subject_type: file`). One in another file is listed in the body. A fallback Markdown comment holds every finding.
4. The workflow: the Plan step saves the diff, the Review step passes the schema, and the Post step posts the review and the file threads. It posts the fallback when GitHub refuses, and keeps the secret guard over everything it posts.
5. The prompt's answer section describes the fields. The ship-sitting skill gets the hard rule: every thread is fixed or answered and then resolved, Minor ones too, and only the three stops wait for Flemming. `docs/ARCHITECTURE.md` describes it all.
