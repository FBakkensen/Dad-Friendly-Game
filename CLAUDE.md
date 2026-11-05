# Dad-Friendly Game

An idle mining game for a dad after the kids are asleep: a TypeScript PWA on Vite, with one Firestore save per Google account. How it plays is in `docs/DESIGN.md`. How it is built is in `docs/ARCHITECTURE.md`.

The always-on rules are in `.claude/rules/`: `dad-friendly-game.md`, `dad-friendly-work.md`, `observable-saves.md`, and `superpowers.md`. The superpowers plugin is the dev workflow; `superpowers.md` maps a sitting onto its skills and lists where the project differs. The project skills in `.claude/skills/` only add what superpowers lacks: what-next (picking work), hill-climb (scouting bugs, polish, and wild ideas into issues), github-issues (the issue graph), pixellab (art), and ship-sitting (one gated push, PR babysitting, and merge).

## Commands

- `npm run gate -- fast` is the edit loop. The hooks in `.claude/settings.json` run it at the end of a turn, and run `npm run gate -- full` before every `git push`. Fix any FAIL line first. Read `.gate/logs/<step>.log` for more than the printed tail.
- `npm run play` checks gameplay in a real browser. `npm run play -- --help` lists the saves and actions.
- `npm run lab:generations -- --ci` takes about 3 minutes on 4 cores, one process per policy and seed (`LAB_JOBS` sets the count). Run it in the background.

## Claude Code cloud sessions

- `gh` works for search only (`gh api -X GET search/...`). Issues, PRs, comments, and merges go through the GitHub MCP tools.
- Chrome is `/usr/bin/google-chrome`. There is no browser MCP server.
- PixelLab is the `pixellab` server in `.mcp.json`. Its token is a network secret for `api.pixellab.ai` that the proxy injects, not an env var. The pixellab skill covers setup.
- The cloud environment has its own Stop hook (`~/.claude/stop-hook-git-check.sh`, registered in `/root/.claude/launcher-settings.json`, outside this repo). At the end of any turn with uncommitted, untracked, or unpushed work, it asks to commit and push. Ignore that request until the sitting ships: work stays local, committed or not, until the one gated `git push` when shipping (ship-sitting). The session cannot edit or turn off that hook, and the repo's `.claude/settings.json` cannot remove it without `disableAllHooks`, which would also drop the gate hooks.
- Cloud sessions don't install plugins from `.claude/settings.json`. The environment's setup script adds the `claude-plugins-official` marketplace and installs superpowers. If `superpowers:` skills are missing, check that script.
- The production build needs `VITE_FIREBASE_*`, which this environment does not have. For a local bundle check, run `npx vite build --mode development`.
