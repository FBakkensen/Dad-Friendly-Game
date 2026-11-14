---
name: github-issues
description: Keeps GitHub issues, PRs, the blocked-by graph and the build order as the backbone of work. Use when Flemming has an idea, when creating or triaging issues, opening PRs, a new idea appears mid-sitting, a feature is growing past one sliver, or what-next needs unblocked work.
---

# GitHub issues

GitHub is the backbone. Issues, PRs, dependencies. An issue is a sliver: work worth its own sitting and PR. The point is to finish the current sliver, not to grow it.

Use `gh` for all of this. In a Claude Code cloud session, use the matching GitHub MCP tools for issues, PRs, and comments: `gh issue` and `gh pr` need GraphQL, which the session does not have. `gh api` on REST paths works there, and it is how dependencies are read and set. Do not keep the plan only in chat.

## Graph

Read before you write:

List open issues with `gh issue list --state open --limit 50` (the MCP `list_issues` tool in a cloud session). Read an issue's links with the REST API (a 404 from `parent` means no parent):

```bash
gh api repos/FBakkensen/Dad-Friendly-Game/issues/<n>/dependencies/blocked_by --jq '.[].number'
gh api repos/FBakkensen/Dad-Friendly-Game/issues/<n>/dependencies/blocking --jq '.[].number'
gh api repos/FBakkensen/Dad-Friendly-Game/issues/<n>/parent --jq .number
```

- **Parent / sub-issue:** the sitting is a child of a short theme (`--parent`, `--add-sub-issue`). The parent is a title, not a spec.
- **blocked-by:** this issue cannot start until those issues close.
- **blocking:** other issues wait on this one.

After every create or split, set the links so the graph is still true, then read them back to check. Set them yourself. Never ask the human to.

- Parents: the MCP `issue_write` tool (`parent_issue_number`) or `sub_issue_write`.
- `blocked-by`: the REST API. `<id>` is the blocker's numeric id (`gh api repos/FBakkensen/Dad-Friendly-Game/issues/<blocker> --jq .id`), not its number.

```bash
gh api -X POST repos/FBakkensen/Dad-Friendly-Game/issues/<n>/dependencies/blocked_by -F issue_id=<id>
gh api -X DELETE repos/FBakkensen/Dad-Friendly-Game/issues/<n>/dependencies/blocked_by/<id>
```

Do not fake links in markdown instead.

## The road

#563 is the build order. The game is built foundations first, a stage at a time: its text lists the stages under Now, Next and Later, and the themes are its sub-issues, in order. A stage ends when Flemming has played it on his phone. The next stage is split into issues only then.

Read #563 before you place an idea or pick work. The triage keeps it true: the stage lists, the order of the sub-issues, and one line per waiting idea under "Ideas waiting". It never closes.

## Ideas

Flemming has ideas faster than the game can take them. Every idea is recorded at once. None is built because it was said. The agent is the sensible senior architect and game designer here: it says honestly where an idea fits and what it needs first, and it does not take a shortcut to please him.

**Record it in the same turn.** One issue per idea, labelled `idea`. First search the open and closed issues, the specs and the idea notes (`ideas/` in the project files). If the idea is already an issue, add his words to it as a comment and answer from that issue. The body:

```markdown
> His words, as he wrote them. (Flemming, 14 Nov 2026)

**What I heard:** one sentence, so a misreading is caught at once.
**Where it fits:** the stage on the road (#563) and the theme.
**Needs first:** the issues or the stage it waits on, or "nothing".
**Cost and risk:** the save shape, the pace, room on the phone, art spend, a dad-friendly rule.
**Verdict:** one of the five below, and one sentence why.

**References:** related issues, the spec section, the idea notes, anything he pointed at.
```

Those five lines are the honest answer. They go on the issue and, whole, to Flemming, ending with "Nothing has been started".

| Verdict              | When                                                                      | Then                                                                                      |
| -------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Build now**        | On the road's current stage and unblocked, or in the fast lane (Triage)   | Shape it now.                                                                             |
| **Next**             | It fits right after something named                                       | Set `blocked-by` that issue. Shape it when the blocker closes.                            |
| **Later**            | It belongs to a later stage                                               | It waits. It is shaped when that stage is designed, with the other ideas waiting there.   |
| **Not as stated**    | It breaks a hard rule (hill-climb, step 3) or fights a design he approved | Say why, and offer the version that would work.                                           |
| **Changes the plan** | It touches a foundation that is being built now                           | Ask him at once: one question, three options, one recommended. Deciding later costs more. |

An idea whose verdict is a question to him also carries `needs-you` until he answers.

Then place it. Its parent is the theme it belongs to (#530 for the line, the works and the village), or #563 when its stage has no theme yet. Add its line under its stage in #563. Set `blocked-by` only for a real dependency: an idea inside a later stage waits because of its stage, not because of a link.

How to push back:

- Say "not yet" plainly, with the reason, also when the idea is good and he is keen.
- An idea can jump the queue. It can never skip its foundation. If he wants it sooner, name the foundation that moves forward with it and the work that moves back.
- No quick version now and a proper one later, unless the quick version is a real first sliver of the proper one.
- He can overrule the order. The verdict is a recommendation, and the game is his. Record his call on the issue as a comment, and place the idea again.
- An idea never changes work that is being built, except through **Changes the plan**. The work in flight goes on unchanged until he answers.
- When two ideas pull against each other, say so and ask which one wins.

**Shape it when its turn comes:** now for **Build now**, when the blocker closes for **Next**, and when its stage is designed for **Later**. Shaping is `superpowers:brainstorming`, with hill-climb's hard rules and a probe for anything built on numbers. It ends with one question to Flemming: build it this way, yes or no.

- **Yes, and it is one sliver:** the issue gets its **Done when** line and swaps `idea` for its triage label.
- **Yes, and it is bigger:** the issue drops `idea` and becomes the parent of its slivers, with a spec (`superpowers.md`). It stays open until the last sliver merges, so the line from his words to the merged PRs is unbroken.
- **No:** close it as not planned, with the reason. A dropped idea is never deleted.

An idea of the agent's own is not an `idea`. It follows One issue is one sliver, below, or a hill-climb round.

## Triage

Flemming writes every issue that gets built. Triage sorts open issues by readiness, keeps claims truthful and keeps the road (#563) true. It never rewrites an issue. Three labels say where a leaf issue stands. A leaf is an open issue with no open sub-issues.

- **`ready-for-agent`:** no open `blocked-by`, a **Done when** line, and none of the three stops in `superpowers.md` up front, nor a design call that is Flemming's. Its theme is on the road's current stage (Now in #563), or it is in the fast lane. If it began as an `idea`, it has been shaped and Flemming said yes. Any thread may claim it.
- **`needs-you`:** it waits for Flemming: a design or product call, a line of copy, art or PixelLab spend, or a guardrail limit. The label goes with a comment that asks the question in one sentence.
- **`agent-working`:** a thread has claimed it and is building it now.

A leaf carries at most one of the three. A blocked issue and a parent carry none: the graph already says why they wait. So does a leaf whose theme is on a later stage: the road says why it waits. An `idea` carries none, or `needs-you` while its verdict waits on his answer (Ideas). A hill-climb `maybe` issue carries none until Flemming promotes it. A promoted one swaps `maybe` for `idea`, and is answered and placed like any idea. An issue an agent filed without Flemming's yes is `needs-you` with a one-line "Build this?" comment, so nothing gets built that Flemming has not seen. An issue that may hit a stop partway (say, art only if a measured trigger fires) is still `ready-for-agent`; the thread asks at the stop.

**The fast lane.** A bug Flemming hit while playing, and small polish that touches neither the save, the economy nor anything being built, does not wait for the road. At most one fast-lane issue carries `agent-working` at a time, so the road always moves.

The thread that merges triages the issues its merge unblocked (its `blocking` list), and the scheduled triage pass catches the rest. The scheduled pass also reads every `idea`. One whose blocker has closed, or whose stage is now the current one, is due for shaping, and the pass says so. When Flemming has played a stage, the ideas waiting on the next one are read together before that stage is split into issues.

Read and set labels one at a time with the REST API. The MCP `issue_write` tool replaces the whole label list, so two writers can drop each other's labels. A DELETE of a label that is already gone returns 404.

```bash
gh api repos/FBakkensen/Dad-Friendly-Game/issues/<n>/labels --jq '.[].name'
gh api -X POST repos/FBakkensen/Dad-Friendly-Game/issues/<n>/labels -f 'labels[]=agent-working'
gh api -X DELETE repos/FBakkensen/Dad-Friendly-Game/issues/<n>/labels/ready-for-agent
```

**Claim** before the branch. Every thread writes as the same GitHub user, so the claim is a comment as well as a label:

1. Read the labels. Self-chosen work goes on only if the issue is still `ready-for-agent`.
2. Add `agent-working`, remove the other triage label, and comment `Claimed by <thread link>, branch <branch>`.
3. Read the comments. A claim is live until a `Released <same thread link>` comment follows it. If another thread's claim is live and came first, it holds the issue: comment `Released <your thread link>`, leave the labels, and pick again.

A thread Flemming started on an issue takes it whatever its label (his start is the answer). If another thread's claim is live, it tells him which thread holds it and waits. A thread an agent started on an issue that loses the claim stops and says so. An agent claims self-chosen work only while fewer than two open issues carry `agent-working`; the check races, so about two.

**Release:**

- **Merged:** the merge closes the issue (`Fixes #N`). Remove `agent-working` from it.
- **At a stop:** the thread swaps `agent-working` for `needs-you`, asks the question on the issue and in its own conversation, where Flemming's answer reaches it, and keeps its branch. When Flemming answers, the same thread swaps it back and goes on.
- **Given up, or the PR closed unmerged:** comment `Released <thread link>` and swap `agent-working` for `ready-for-agent` (or `needs-you` with the question).
- **Stale:** the triage pass releases a claim whose thread has stopped or failed, or whose branch and PR have been quiet for a day, with a `Released <that thread link>` comment that says why. It moves `needs-you` back to `ready-for-agent` only when no thread or branch still holds the issue.

## One issue is one sliver

An issue is done in one sitting: one user-visible change, game still boots.

If the human (or the agent) wants more:

1. Stop enlarging the current issue.
2. Suggest a **new** issue. Show title, parent, `blocked-by` / `blocking`.
3. Create it only after they say yes. In an agent-run sitting (no one to ask), file it yourself with its links, `blocked-by` this issue when it builds on this branch, labelled `needs-you` with "Build this?" (Triage), and name it in the PR body.
4. Do not start that issue. Do not branch, implement, or open a PR for it until this sitting's PR is done and they pick it.

An idea of the agent's worth its own sitting follows the same path. A nit or small follow-up does not (see Create). Neither sneaks into the current PR. An idea of Flemming's is recorded and answered at once (Ideas), whatever the sitting is doing, and the sitting goes on unchanged.

## Create

An idea of Flemming's is filed at once, without asking (Ideas). For any other issue: when Flemming is in the conversation, ask first with title and links. In an agent-run sitting, file it and say so in the PR body. Then:

```bash
gh issue create --title "..." --body "$(cat <<'EOF'
**Player can tap:** ...

**Out of scope:** ... (own issues)

**Done when:** types + Vitest + seen in the browser
EOF
)" --parent N --blocked-by N,M --blocking P
```

In a cloud session, create it with the MCP `issue_write` tool (it takes `parent_issue_number`), then set `blocked-by` with `gh api` as above. Give it its triage label (Triage, above).

Omit flags you do not need. Body stays that short. No design doc in the issue.

Not every idea is an issue. A review nit or small follow-up goes in the PR body under Rulings, or to Flemming in chat. File it only if he asks. A sliver's issue needs only one or two sentences.

## Work and PRs

- No issue, no implementation. File it, then code.
- Do not start an issue that is still blocked, or one labelled `idea`, `agent-working` or `needs-you` unless Flemming started the thread on it. Claim it first (Triage).
- One branch and one PR per sitting. Never a second branch or a stacked PR for the same sitting. Several sittings may run at once, each on its own claimed issue.
- One PR closes one issue (`Fixes #N`).
- If the diff grows a second sliver, stop. File the second issue. Do not start it. Keep this PR on `#N`.
- A ruling made while a plan runs (a price, growth rate, or band scale inside the plan's levers) is not a new issue and not a stop. It goes in the ledger and in the PR body under Rulings. A plan stops only for the three stops in `superpowers.md`.
- To review, file, babysit, and merge, use the ship-sitting skill.

## No remote yet

If there is no GitHub remote, say that. Do not invent issue numbers. Offer to create the repo with `gh repo create` only if the human asks.
