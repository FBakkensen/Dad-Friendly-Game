# Dad-friendly work

How we build is dad-friendly too. The superpowers plugin is the workflow (`superpowers.md`). This file adds what the project needs on top. Picking work and the stops while running a plan use the interview format: one question, three options, one recommended.

## Sittings

- One sitting produces one user-visible sliver. The game still boots. Next sitting starts from a running game.
- Chores (lint, folders, vendor setup) are not a sitting by themselves unless they unblock that same sliver, or the human picks them.
- GitHub is the backbone: issues, PRs, and the dependency graph. Even a one-line idea gets an issue. Use the github-issues skill.

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
- The gate has two tiers (`scripts/gate.mjs`, steps in `src/gate.ts`). While editing, run `npm run gate -- fast`: incremental typecheck, plus lint and `vitest related` on the code changed since `origin/main`. Before every push to a PR branch, run `npm run gate -- full` (`npm run check` is the same thing): every check, independent steps in parallel. Each prints one line per step. A failed step prints its log tail, and every full log is in `.gate/logs/`.
- Push only with `git push` from the shell, so the hook runs the full tier. Never bypass it. The ship-sitting skill has the details.
- Verify in a real browser with `npm run play` (`scripts/play.mjs`, Chrome through puppeteer-core): start from a named save, tap the fat target by selector or aria-label, and look at the phone and desktop shots. Read `log.txt` for the console, failed requests, and the save line. Any page error fails the run. `npm run play -- --help` lists the saves and actions.
- `superpowers:verification-before-completion` applies. The gate and `npm run play` are the evidence; code inspection alone never proves a sliver.
- Do not add Playwright unless asked.

## Finish the sitting, not the idea pile

- One issue is one sliver. If the feature grows, do not enlarge the issue. Suggest a new issue and link it.
- File that issue. Do not start it. The current sitting and PR stay on the issue we already picked.
- One branch, one PR, until that PR is merged or closed. Never open a second branch or PR for the same sitting. Never stack PRs.
- New ideas that appear mid-work go on GitHub. They do not sneak into the current PR.
- The agent keeps `blocked-by` / `blocking` / parent links truthful so the next sitting can start from unblocked work.

## Art and next work

- PixelLab MCP generates assets. Ask first (credits are limited). Never placeholders. Use the pixellab skill.
- When the human asks what next, what to build, or for improvement suggestions, use the what-next skill. Prefer unblocked GitHub issues as the options.
