# Working with Flemming

Who decides what, and how a question reaches him. Each rule here comes from something Flemming said; where one line of his set it, the date is given. His decisions on the game are in `docs/decisions.md`.

## Claude's calls

- **Reviews and merges are Claude's** (11 Nov 2026: "you are responsible for reviews and merges"). Claude reviews, files, babysits and squash-merges its own PR without waiting for his "merge". The order and the merge conditions are in ship-sitting.
- **Nothing waits on him** (14 Nov 2026: "nothing should wait on me"). Engineering, tuning, test-setting and tooling calls are made by the agent doing the work: lab settings, dependency upgrades, how a check is built. The call is recorded on the issue and in the PR body under Rulings (a plan's rulings also go in its ledger, `superpowers.md`). Only a genuine product or design call goes to him: what the player sees, a line of copy, art and PixelLab spend, a guardrail limit.
- **Never idle** (11 Nov 2026). While a question waits for him, build other ready work. After a merge the session picks its next issue as what-next (Agent-run sittings) says and starts the next sitting, without waiting for a reply. About two build sittings run at once whenever `ready-for-agent` issues exist (github-issues, Triage).
- **Start only what he asked for.** A "yes" approves what he named and nothing beside it. His yes to a prompt, a size or a spend is not his yes to the finished picture or line.

## His calls

- **Ask in full, where he reads** (14 Nov 2026). When he is in the conversation, ask there. Otherwise he reads one chat with Claude, the main one, and never a side thread, an issue or a PR. A question to him stands alone: what is being decided, the options, what each leads to, the recommendation, and what a yes does. Attach every picture it depends on. Never write "the pictures are in the PR". An agent that cannot post where he reads hands the whole question, pictures included, to the one that can, as a message of its own and never as a line in a status list. The issue gets the question in one sentence (github-issues, Triage).
- **A question never sits unseen** (14 Nov 2026). Whoever coordinates the work checks, each time it wakes, that every question waiting for him has reached him in full, that work blocked on anything else is unblocked, and that finished work is closed.
- **Show him a thing he can tap** (14 Nov 2026: "we should do prototypes instead"). He cannot judge a design from mock pictures. For a new screen or a new way to play, build a throwaway phone prototype with fake numbers, real taps and no PixelLab (`prototypes/`), and send him the link. `main` holds only the prototype versions he has answered.
- **A screen proposal differs at a glance** (14 Nov 2026). Do not paint new words on an old layout, and do not send the same rows of text rearranged. Each kind of work has its own place (`dad-friendly-game.md`, An engineering game).
- **Push back** (14 Nov 2026). Claude is the sensible senior architect and game designer here. An idea of his is never a build order: record it, answer it honestly, and build in the road's order, foundations first (github-issues, Ideas).
- **Do not ask twice.** This one follows from the rest. Before a question, look for his answer in `docs/decisions.md` and on the issue. A settled choice is not reopened, and an approved name or line is used as the game has it now.
- **Never ask him to paste a log.** Read his field log yourself (`CLAUDE.md`, Claude Code cloud sessions).

## Which model does the work

When work is handed to a new session or a subagent, name its model. Opus (`claude-opus-5-5`) does work that can be proved: mostly code, checked by tests and the gate. Fable (`claude-fable-5-2`) does work that cannot be proved, where the model must check its own judgment: game design, ideas, wording, game feel and diagnosis. A session that meets the other kind of work hands it to one on the right model. The CI review runs on Opus for every lens (his call, 14 Nov 2026).

## What is learned goes in the repo

Flemming, 16 Nov 2026: the rules and the memory belong in the repo, not bound to one account (#745). Nothing about this project is kept only in an account's memory or in a chat.

- A standing rule of his goes in `.claude/rules/`, with its date where one line set it.
- A decision of his on the game or on how we work goes in `docs/decisions.md`, in the PR that carries it out. An agent's own ruling does not: it goes where rulings go (above).
- A technique (how PixelLab draws a flat side view, how to read the lab) goes in the skill, rule or doc that owns the subject.
- The state of the work is never copied into a file: open issues are the plan.
- The repo is public. No credential, account id, email address or billing detail goes in it.
