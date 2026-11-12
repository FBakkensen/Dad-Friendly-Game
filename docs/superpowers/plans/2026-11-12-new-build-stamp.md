# An open game picks up a new build (#516)

**Goal:** after a deploy, a device that keeps the game open sees the update card (#464) the next time the game comes back to the front, and its field log names the build it runs.

**Why it never fires today:** `public/sw.js` is copied as is, so its bytes are the same on every deploy. `registration.update()` on visible (`src/pwa.ts`) finds no new worker, so `controllerchange` never fires. `APP_VERSION` is the constant `"0.0.0"`.

**Shared module:** new `src/build-stamp.ts`, pure: `buildId(env, gitSha)` picks the id, `stampServiceWorker(source, id)` writes it into the worker's source, and `appVersion()` reads the defined `__APP_BUILD__` for the field log. No module stamps a build today. `vite.config.ts` gets one build-only plugin that defines `__APP_BUILD__` and stamps `dist/sw.js` after the bundle is written. `src/field-log.ts` keeps `APP_VERSION`, now read from the stamp. `src/pwa.ts` and the update card do not change: they already do the rest.

## Rulings (agent-run sitting)

1. **The id:** the commit's short sha, 7 characters: `GITHUB_SHA` in Actions (deploy-hosting builds there), else `git rev-parse --short HEAD`, else `local`. It fits the field log's 24-character text cap. The same commit built twice is the same build, so the same bytes are right.
2. **The worker:** `public/sw.js` gains one comment line, `// Build: dev`, that the plugin replaces (a comment still changes the bytes the browser compares, and lint has no unused name to flag). The cache name stays `dad-mine-shell-v1`: renaming it would delete the cached hashed assets an old open page may still lazy-load, and Firebase Hosting no longer serves them after a deploy. A missing placeholder fails the build, so a later edit cannot silently break the stamp.
3. **Dev, tests and `play`:** no stamp. `APP_VERSION` reads `dev` there, and the worker is never registered outside production.
4. **No reload by itself:** the update card stays the one way to take the new build, as #464 built it.

## Tasks

1. `src/build-stamp.ts` and its tests: the id from Actions, from git, and the fallback; the stamp replaces the placeholder and throws without one; two ids give two different workers.
2. `vite.config.ts`: the build-only plugin (define, then stamp `sw.js` in `closeBundle`); `public/sw.js` placeholder; `src/vite-env.d.ts` declares `__APP_BUILD__`; `src/field-log.ts` reads it.
3. Browser probe: build twice with different ids, serve A, then swap in B, bring the page back to visible, and see the update card.
4. Docs: `ARCHITECTURE.md` (the worker and the field log's version). The deploy job checks that `dist/sw.js` carries a stamp, so a build that lost the plugin cannot ship an unchanged worker.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test file, `npm run gate -- fast`, the two-build probe, then the full gate before the PR.
