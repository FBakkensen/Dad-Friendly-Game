# Lock the Claude reviewer's shell (#583)

**Goal:** the CI reviewer can read the repo and nothing more.

**Probes first (14 Nov, Claude Code 2.1.325, the job's exact flags):** `git grep -O'<program>'` started the program, and `git diff --output=` and `git log --output=` each wrote a file. A deny list (`Bash(git *-O*)` and the like) let `git grep -iO'<program>'` through, because git joins short flags. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` will not start without bubblewrap.

**Shared module:** `tools/review/git.ts`, new, beside `prompt.ts`. No module wraps git for a model today.

1. `gitCall(range, args)`: fixed subcommands (diff, log, show, grep, ls-files), a few options of its own, git's arguments built by the wrapper (`-e` before the pattern, `--end-of-options` before a revision, `--` before paths), and a refusal for anything else. Test first (`tools/review/git.test.ts`).
2. The CLI runs git with no shell, the pager off, and git's exit code passed on. A refusal exits 2.
3. The workflow writes a `review-git` shim from the base commit's copy, puts it on the Review step's PATH, and allows only `Bash(review-git:*)`. The bare `Read` allow goes: Read inside the checkout needs no rule.
4. The prompt and the code lens name `review-git`. An empty `review.json` says "no result" (the Minor left from #574).
5. Probe again: every escape is refused, and a dry run on a merged PR still reads and searches.
