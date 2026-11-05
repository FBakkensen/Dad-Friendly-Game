@AGENTS.md

# Claude Code cloud sessions

Only what differs from `AGENTS.md` when this repo runs in a Claude Code cloud session:

- `gh` works for search only (`gh api -X GET search/...`). Issues, PRs, checks, comments, and merges go through the GitHub MCP tools. Where `AGENTS.md` or a skill says `gh`, use the matching MCP tool.
- Babysit a PR with `subscribe_pr_activity`, not `gh pr checks --watch`. CI and review events wake the session. Do not poll.
- Check gameplay in a real browser with `npm run play`. Chrome is `/usr/bin/google-chrome`. There is no browser MCP server.
- The production build needs `VITE_FIREBASE_*`, which this environment does not have. For a local bundle check, run `npx vite build --mode development`.
- `npm run lab:generations -- --ci` takes over 10 minutes. Run it in the background.
- The project skills load from `.claude/skills`, a link to `.pi/skills`. Edit them there.
