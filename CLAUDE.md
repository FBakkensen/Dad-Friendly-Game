# Dad-Friendly Game

An idle mining game for a dad after the kids are asleep: a TypeScript PWA on Vite, with one Firestore save per Google account. How it plays is in `docs/DESIGN.md`. How it is built is in `docs/ARCHITECTURE.md`.

The always-on rules are in `.claude/rules/`: `dad-friendly-game.md`, `dad-friendly-work.md`, `observable-saves.md`, and `superpowers.md`. The superpowers plugin is the dev workflow; `superpowers.md` maps a sitting onto its skills and lists where the project differs. The project skills in `.claude/skills/` only add what superpowers lacks: what-next (picking work), hill-climb (scouting bugs, polish, and wild ideas into issues), github-issues (the issue graph), pixellab (art), and ship-sitting (review, the PR, babysitting, and merge).

## Commands

- Prove each change with the verification ladder in `.claude/rules/dad-friendly-work.md`: the test file, then `npm run gate -- fast`, then one visual section and `npm run play`, then the full gate once before the PR. `npm run gate -- fast` is the edit loop. Run it where superpowers says to verify, before calling a task done. Run `npm run gate -- full` before opening the PR, push, then `npm run gate -- signoff` (the ruleset on `main` requires its `signoff` status; never post it any other way). Fix any FAIL line first. Read `.gate/logs/<step>.log` for more than the printed tail. The full gate runs the visual check, the gameplay journeys and the labs one at a time, and reuses a lab run whose inputs passed before (records in `.gate/reuse/`).
- `npm run play` checks gameplay in a real browser. `npm run play -- --help` lists the saves and actions.
- `npm run journeys` plays the stored gameplay journeys (`tools/journeys/`, Playwright Test) and checks the board against the game's own rules. A failure keeps a trace in `.gate/journeys/`.
- `npm run lab:generations -- --ci` takes about 3 minutes on 4 cores, one process per policy and seed (`LAB_JOBS` sets the count). Run it in the background.

## Claude Code cloud sessions

- `gh` has no GraphQL here, so `gh issue` and `gh pr` fail. `gh api` on REST paths works: search (`gh api -X GET search/...`) and issue dependencies (the github-issues skill). Issues, PRs, comments, and merges go through the GitHub MCP tools.
- Chrome is `/usr/bin/google-chrome`. There is no browser MCP server.
- PixelLab is the `pixellab` server in `.mcp.json`. Its token is a network secret for `api.pixellab.ai` that the proxy injects, not an env var. The pixellab skill covers setup.
- The cloud environment has its own Stop hook (`~/.claude/stop-hook-git-check.sh`, registered in `/root/.claude/launcher-settings.json`, outside this repo). At the end of any turn with uncommitted, untracked, or unpushed work, it asks to commit and push, so a reclaimed container loses nothing. Do that: commit and push the sitting's branch as work lands. A push is not shipping. Opening the PR is (ship-sitting).
- Cloud sessions don't install plugins from `.claude/settings.json`. The environment's setup script adds the `claude-plugins-official` marketplace and installs superpowers. If `superpowers:` skills are missing, check that script.
- The production build needs `VITE_FIREBASE_*`, which this environment does not have. For a local bundle check, run `npx vite build --mode development`.
