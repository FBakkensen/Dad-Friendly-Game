# Dad-Friendly Game

An idle mining game for a dad after the kids are asleep: a TypeScript PWA on Vite, with one Firestore save per Google account. How it plays is in `docs/DESIGN.md`. How it is built is in `docs/ARCHITECTURE.md`.

The always-on rules are in `.claude/rules/`: `dad-friendly-game.md`, `dad-friendly-work.md`, `observable-saves.md`, `shipping.md`, and `superpowers.md`. The project skills are in `.claude/skills/`: code-review, github-issues, pixellab, ship-sitting, and what-next. The superpowers plugin is the dev workflow; `superpowers.md` says how it fits these rules.

## Commands

- `npm run gate -- fast` is the edit loop. The hooks in `.claude/settings.json` run it at the end of a turn, and run `npm run gate -- full` before every `git push`. Fix any FAIL line first. Read `.gate/logs/<step>.log` for more than the printed tail.
- `npm run play` checks gameplay in a real browser. `npm run play -- --help` lists the saves and actions.
- `npm run lab:generations -- --ci` takes over 10 minutes. Run it in the background.

## Claude Code cloud sessions

- `gh` works for search only (`gh api -X GET search/...`). Issues, PRs, comments, and merges go through the GitHub MCP tools.
- Chrome is `/usr/bin/google-chrome`. There is no browser MCP server.
- PixelLab is the `pixellab` server in `.mcp.json`. Its token is a network secret for `api.pixellab.ai` that the proxy injects, not an env var. The pixellab skill covers setup.
- Cloud sessions don't install plugins from `.claude/settings.json`. The environment's setup script adds the `claude-plugins-official` marketplace and installs superpowers. If `superpowers:` skills are missing, check that script.
- The production build needs `VITE_FIREBASE_*`, which this environment does not have. For a local bundle check, run `npx vite build --mode development`.
