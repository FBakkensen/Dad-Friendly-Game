# Project rules

Always-on rules for any AI agent working in this repo (ported from the original Cursor rules). Skills for this project live in `.pi/skills/` (code-review, github-issues, pixellab, ship-sitting, what-next).

## Dad-friendly game

The player is an adult after lights-out. Kids are asleep in the house. Content may be sharp. Audio must not be.

A dad-friendly game has at least these characteristics:

- can be played in short interrupted sessions
- is relaxing for the brain after a long day when the kids is finally asleep
- can be played everywhere both PC and mobile
- can survive instant quit and picked up later

### Session

- Built for about two minutes. May stretch if the house stays quiet.
- Gentle loop. A little craft is good. Never punishing. Losing a minute is fine. Losing the evening is not.
- Close is pause. No confirm dialog. Kill the tab or lock the phone. Next open is the same moment, minus at most one in-flight tap.
- Persist on every meaningful mutation, on `visibilitychange` hidden, and on `pagehide`.

### Shape

Turn-based or idle are both in bounds. Real-time twitch play is not.

- Turn-based: a sitting is one turn or a short run of turns. Close mid-turn is still pause.
- Idle: progress may accrue while away. Compute it from timestamps on the next open. Idle is not a live server.

### Devices

- One web app on phone and PC. Touch-first. Fat targets. Mouse uses the same UI.
- Same save on every device from day one. Identity is one-tap Google. Backend is a save blob, not a live world. No SpaceTimeDB.

### Senses and art

- Silent until the player unmutes. No autoplay.
- PixelLab pixel art. Simple animation loops. No tileset world, no 8-direction walker, no isometric map until that ceiling is raised on purpose.
- No placeholders. The human cannot abstract from boxes. If art is missing, stop and use the pixellab skill.

### AI in play

- Optional spice. Never required to progress. If the model or network is down, the game still plays.

## Dad-friendly work

How we build is dad-friendly too. The interview format (one question, three options, one recommended) is the model for decisions.

### Sittings

- No long spec. No design doc. Open GitHub issues are the plan.
- One sitting produces one user-visible sliver. The game still boots. Next sitting starts from a running game.
- Chores (lint, folders, vendor setup) are not a sitting by themselves unless they unblock that same sliver.
- Do not pick the game until the human asks. When they do, it is turn-based or idle.
- GitHub is the backbone: issues, PRs, and the dependency graph. Even a one-line idea gets an issue. Use the github-issues skill.

### Chassis (until a game exists)

- TypeScript web app. Vite. Installable PWA.
- Firebase: Google auth and one JSON save document per user.
- Game engine unpicked. Do not add Phaser, Pixi, or similar until the genre needs it.
- Fat-finger UI from the first screen.
- Never commit Firebase, PixelLab, or other secrets.

### Done means proven

- Strongly typed TypeScript. Illegal save states should be hard to represent (discriminated unions, not optional-field bags).
- `tsc` clean. Unit tests green for the sliver (Vitest).
- Verify in a real browser through the `chrome-devtools` MCP tools (configured in `.mcp.json`, driven via the `mcp` proxy tool): serve the app (`npm run dev` or a build + preview), `navigate_page` to it, `take_screenshot`, tap the fat target with `click`/`click_at`, and check `list_console_messages`. Use `list_network_requests` to prove cloud-save writes, and `resize_page` for the phone-shaped check.
- Do not add Playwright unless asked. Do not claim a sliver is done from code inspection alone.

### Finish the sitting, not the idea pile

- One issue is one sliver. If the feature grows, do not enlarge the issue. Suggest a new issue and link it.
- File that issue. Do not start it. The current sitting and PR stay on the issue we already picked.
- One branch, one PR, until that PR is merged or closed. Never open a second branch or PR for the same sitting. Never stack PRs.
- New ideas that appear mid-work go on GitHub. They do not sneak into the current PR.
- The agent keeps `blocked-by` / `blocking` / parent links truthful so the next sitting can start from unblocked work.

### Art and next work

- PixelLab MCP generates assets. Ask first. Never placeholders. Use the pixellab skill.
- When the human asks what next, what to build, or for improvement suggestions, use the what-next skill. Prefer unblocked GitHub issues as the options.

## Observable saves

Signed-in progress lives in one Firestore document per Google uid. There is no second save in `localStorage`.

### Do

- Treat the cloud document as the grid while signed in. Watch it. Write it on a dig, hide, and pagehide.
- Show a save line: account, loading, or unreachable.
- Record structured log events (`code`, `detail`, counts). Put the latest on the save line as `data-log`.
- Keep boot HTML `no-cache, no-store`. Hashed `/assets/**` may be immutable.

### Don't

```ts
// BAD: a second save, and a swallowed failure
writeGridSave({ storage: localStorage, grid });
try {
  await setDoc(ref, payload);
} catch {
  return;
}

// GOOD: cloud only, caller sees the miss
const result = await cloudSave.write({ uid, grid });
if (result.kind === "failed") {
  logger.record({ level: "error", code: "save.write", detail: result.message });
}
```

Do not claim phone and PC match from code inspection. Read the save line in the browser.

## File and babysit the PR

When the human asks to ship, commit and open a PR, file the PR, or finish the sitting, use the ship-sitting skill. This section is the code-review and babysit contract that skill runs.

### Before you file

Do not run `gh pr create` until a code-review pass returns only nits, or no findings.

A review pass covers the branch diff that would merge. It prioritizes bugs, behavioral regressions, security issues, and missing tests. Findings first, by severity. The review pass makes no edits.

Then fix every non-nit. Asking to file the PR includes those fix commits. Review again. Repeat.

Nits can ship. If a non-nit is still there after two fix rounds, stop and ask.

### After you file

Stay in this conversation. Do not use autopilot, background babysitters, or a cloud agent.

Babysit with `gh` here:

1. Refresh live PR state each pass (`gh pr view`, `gh pr checks`). Do not act on stale state.
2. Conflicts first, then unresolved review comments, then failing CI.
3. Watch CI to completion (`gh pr checks --watch`). Do not invent work while checks run.
4. Fix CI caused by this PR. Read the failing log. Push the fix. Never force-push. Never edit CI config just to go green.
5. If GitHub later adds PR code review, handle those comments here. Fix real in-scope issues. Dismiss invalid ones with a reason. Ask the human on security or product calls. Nits do not block merge.

When the PR is mergeable, required CI is green, and every non-nit comment is fixed or dismissed, squash-merge without waiting:

```bash
gh pr merge --squash
git checkout main
git pull
```

Then watch the workflows that merge commit started, including `deploy-hosting`. If the run list is empty, wait and list again. Do not invent work while they run. If deploy fails, read the log, fix the cause, re-run. Never force-push. Never edit CI just to go green. The sitting is not done until those runs succeed.

Do not delete the local feature branch unless asked. Stop and ask on auth, secrets, or a real product question.
