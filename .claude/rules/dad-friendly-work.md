# Dad-friendly work

How we build is dad-friendly too. The superpowers plugin is the workflow (`superpowers.md`). This file adds what the project needs on top. Picking work and the stops while running a plan use the interview format: one question, three options, one recommended.

## Sittings

- One sitting produces one user-visible sliver. The game still boots. Next sitting starts from a running game.
- Chores (lint, folders, vendor setup) are not a sitting by themselves unless they unblock that same sliver, or the human picks them.
- GitHub is the backbone: issues, PRs, and the dependency graph. An issue is a sliver: work worth its own sitting and PR. Use the github-issues skill.

## Docs

- Open GitHub issues are the plan. Specs and plans for a sliver follow `.claude/rules/superpowers.md`.
- `docs/DESIGN.md` (the numbers and milestone history), `docs/design-intent.md` (why each part exists), `docs/ARCHITECTURE.md`, `docs/ART.md`, and `docs/ui-audit.md` describe how the game works now. A PR that changes behavior updates them in the same PR.

## Stack

- TypeScript web app. Vite. Installable PWA.
- Firebase: Google auth and one JSON save document per user.
- No game engine (Phaser, Pixi, or similar) until the game needs one.
- Fat-finger UI on every screen.
- Never commit Firebase, PixelLab, or other secrets.

## Done means proven

- Strongly typed TypeScript. Illegal save states should be hard to represent (discriminated unions, not optional-field bags).
- `tsc` clean. TDD with Vitest (`superpowers:test-driven-development`), with tests for every behavior change. Keep the coverage floors; never lower one to go green. A test that plays the economy for over a second goes in a `*.sim.test.ts` file (the `sim` project, full tier only). A test file that needs the DOM opens with `// @vitest-environment happy-dom`.
- The gate has two tiers (`scripts/gate.mjs`, steps in `src/gate.ts`). Run `npm run gate -- fast` where superpowers says to verify, before calling a task done: incremental typecheck, plus lint, `vitest related` and a prettier check on the files changed since `origin/main`. Before opening the PR, run `npm run gate -- full` (`npm run check` is the same thing): every check, independent steps in parallel. The visual check, the gameplay journeys and the two labs each fill every core, so they take turns. A lab run whose inputs (every file it imports, the lock file, Node) passed before is reused, not run again. Each prints one line per step. A failed step prints its log tail, and every full log is in `.gate/logs/`. After the push, `npm run gate -- signoff` posts the `signoff` status that `main` requires (#397). Agents never post that status any other way, and never start the `signoff` workflow by hand.
- No function in non-test `src` is over 150 lines or a cognitive complexity of 15 (`npm run functions`, in both gate tiers). There are no exceptions and no allow-list (#422): a function over a limit fails the gate. Split or simplify it.
- Prove a change with the cheapest check that covers it, and climb only as far as you need:
  1. the test file you touched (`npx vitest run <file>`);
  2. `npm run gate -- fast`;
  3. for anything the player sees, the one visual section that covers it (`VISUAL_ONLY='<section>' npm run visual`) and `npm run play` on its save, and for a change to how the game plays over time, the journey that covers it (`npm run journeys -- <file>`);
  4. `npm run gate -- full`, once, before the PR, and again only after a fix to a step it failed.
- Briefs and plans quote this ladder rather than setting their own tiers. A full gate never proves a single fix.
- A plan keeps each screen's browser checks green in the task that changes that screen, never in a later "fix the checks" task.
- A full gate takes 10–14 minutes. Start it in the background and wait for it to finish. Never wrap it in `timeout`, and never poll it in a sleep loop.
- Commit and push the sitting's branch as work lands (`CLAUDE.md`). The ship-sitting skill has the details.
- Verify in a real browser with `npm run play` (`scripts/play.mjs`, Chrome through puppeteer-core): start from a named save, tap the fat target by selector or aria-label, and look at the phone shots. Read `log.txt` for the console, failed requests, and the save line. Any page error fails the run. `npm run play -- --help` lists the saves and actions.
- `superpowers:verification-before-completion` applies. The gate and `npm run play` are the evidence; code inspection alone never proves a sliver.
- Playwright Test is for gameplay journeys (`tools/journeys/`, `npm run journeys`); the visual check and `npm run play` stay on puppeteer-core.

## Finish the sitting, not the idea pile

- One issue is one sliver. If the feature grows, do not enlarge the issue. Suggest a new issue and link it.
- File that issue. Do not start it. The current sitting and PR stay on the issue we already picked.
- One branch, one PR, until that PR is merged or closed. Never open a second branch or PR for the same sitting. Never stack PRs.
- New ideas that appear mid-work do not sneak into the current PR. One worth its own sitting becomes an issue. A review nit or small follow-up goes in the PR body under Rulings, or to Flemming in chat. File it only if he asks.
- The agent keeps `blocked-by` / `blocking` / parent links truthful so the next sitting can start from unblocked work.

## Art and next work

- PixelLab MCP generates assets. Ask first (credits are limited). Never placeholders. Use the pixellab skill.
- When the human asks what next, what to build, or for improvement suggestions, use the what-next skill. Prefer unblocked GitHub issues as the options. When the backlog is thin, or the human wants new ideas checked, run a round with the hill-climb skill first.
