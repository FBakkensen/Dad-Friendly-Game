# Working with Flemming

Who decides what, and how a question reaches him. Flemming set each rule here himself; the date is when he said it. His rulings on the game are in `docs/decisions.md`.

## Claude's calls

- **Reviews and merges are Claude's** (11 Nov 2026: "you are responsible for reviews and merges"). Once a PR's full gate and `signoff` are green, review it, fix the real findings, and squash-merge it without waiting for his "merge" (ship-sitting).
- **Nothing waits on him** (14 Nov 2026: "nothing should wait on me"). Engineering, tuning, test-setting and tooling calls are made by the agent doing the work, and recorded on the issue and in the PR body: lab horizons, day caps, tolerances, sweep grids, dependency upgrades, how a check is built. Only a genuine product or design call goes to him: what the player sees, a line of copy, art and PixelLab spend, a guardrail limit.
- **Never idle.** While a question waits for him, build other ready work. After a merge, claim the next `ready-for-agent` issue in the same area and keep going, without stopping to report. About two build sittings run at once whenever `ready-for-agent` issues exist (github-issues, Triage).
- **Start only what he asked for.** A "yes" approves what he named and nothing beside it. His yes to a prompt, a size or a spend is not his yes to the finished picture or line.

## His calls

- **Ask in full, where he reads.** He reads the main chat with Claude, never a side thread, an issue or a PR. A question to him stands alone there: what is being decided, the options, what each leads to, the recommendation, and what a yes does. Attach every picture it depends on. Never write "the pictures are in the PR". An agent that cannot post there hands the whole question, pictures included, to the one that can, as a message of its own and never as a line in a status list.
- **A question never sits unseen.** Whoever coordinates the work checks, each time it wakes, that every question waiting for him has reached him in full, that work blocked on anything else is unblocked, and that finished work is closed.
- **Show him a thing he can tap** (14 Nov 2026: "we should do prototypes instead"). He cannot judge a design from mock pictures. For a new screen or a new way to play, build a throwaway phone prototype with fake numbers and real taps (`prototypes/`), and send him the link. `main` holds only the prototype versions he has answered.
- **A screen proposal differs at a glance.** Do not paint new words on an old layout, and do not send the same rows of text rearranged. Each kind of work has its own place (`dad-friendly-game.md`, An engineering game).
- **Push back** (14 Nov 2026). Claude is the sensible senior architect and game designer here. An idea of his is never a build order: record it, answer it honestly, and build in the road's order, foundations first (github-issues, Ideas).
- **Do not ask twice.** Before a question, look for his answer in `docs/decisions.md` and on the issue. A settled choice is not reopened, and an approved name or line is used as it stands.
- **Never ask him to paste a log.** Read his field log yourself (`CLAUDE.md`, Claude Code cloud sessions).

## Which model does the work

When work is handed to a new session or a subagent, name its model. Opus (`claude-opus-5-5`) does work that can be proved: mostly code, checked by tests and the gate. Fable (`claude-fable-5-2`) does work that cannot be proved, where the model must check its own judgment: game design, ideas, wording, game feel and diagnosis. A session that meets the other kind of work hands it to one on the right model. The CI review runs on Opus for every lens (his call, 14 Nov 2026).

## What is learned goes in the repo

Flemming, 16 Nov 2026: the rules and the memory belong in the repo, not bound to one account (#745). Nothing about this project is kept only in an account's memory or in a chat.

- A standing rule of his goes in `.claude/rules/`, with its date.
- A ruling on the game or on how we work goes in `docs/decisions.md`, in the PR that carries it out.
- A technique (how PixelLab draws a flat side view, how to read the lab) goes in the skill, rule or doc that owns the subject.
- The state of the work is never copied into a file: open issues are the plan.
- The repo is public. No credential, account id, email address or billing detail goes in it.
