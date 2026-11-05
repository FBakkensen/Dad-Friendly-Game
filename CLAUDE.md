@AGENTS.md

# Claude Code cloud sessions

Only what differs from `AGENTS.md` when this repo runs in a Claude Code cloud session:

- `gh` works for search only (`gh api -X GET search/...`). Issues, PRs, checks, comments, and merges go through the GitHub MCP tools. Where `AGENTS.md` or a skill says `gh`, use the matching MCP tool.
- Babysit a PR with `subscribe_pr_activity`. Review events wake the session. There are no PR check runs: the `git push` hook ran the full tier. Do not poll.
- Check gameplay in a real browser with `npm run play`. Chrome is `/usr/bin/google-chrome`. There is no browser MCP server.
- The production build needs `VITE_FIREBASE_*`, which this environment does not have. For a local bundle check, run `npx vite build --mode development`.
- The edit loop is `npm run gate -- fast`. The hooks in `.claude/settings.json` run it at the end of a turn, and run `npm run gate -- full` before every `git push`. Fix any FAIL line first. Read `.gate/logs/<step>.log` for more than the printed tail.
- Push with `git push` from Bash, not the GitHub MCP `push_files` tool, which skips the hook. After a merge, watch `deploy-hosting` on `main`: it is the only CI.
- `npm run lab:generations -- --ci` takes over 10 minutes. Run it in the background.
- The project skills load from `.claude/skills`, a link to `.pi/skills`. Edit them there.
