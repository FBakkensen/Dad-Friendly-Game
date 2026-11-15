# Builders and the building site (#690)

Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md`, rule 7 (items 8 to 12), "The save" and "Proof". Off in play: only a fresh mine (`freshMineOn`) reaches it. Parent #530; after one workforce (#689).

## Rulings (agent-run sitting)

1. **One place.** The site's numbers and its work over time live in `src/building-site.ts` (`SITE_HOLDS`, the builder's rate, `stepWork`), because Flemming may turn the site over (call 34). The step machinery stays in `city` and the loop in `transport.deliver`, which calls `stepWork`.
2. **Building is a job** (`JOB_IDS` gains `building`). A builder builds in 20 goods a second, and the site holds 500: the spec's starting numbers, for the lab to set (#655). Nothing lifts a builder: no boots, no marks.
3. **A fresh mine starts with twelve workers**: three on each stage, one driver and two builders (rule 2.10, the prototype's).
4. **The site in the save is `onSite`, beside `arrived`.** `arrived` stays what transport brought to the step in all, so what transport still has to bring (`stillRequired`) is unchanged; what is built in is `arrived − onSite`. One more key in the project, left out when empty: no version bump. The reader refuses more on the site than arrived, more than the site holds, or a step whose goods are all built in, as `bad`.
5. **A step is done when what it requires is built in** (`stepDone`). `receive` only lays goods on the site; `buildIn` takes them off it and starts the next step, in the same state (on hold stays on hold).
6. **Exact over a stretch, not a tick at a time.** `stepWork` finishes a step at the longer of what the builders take (what is on the site and still to come, at their rate) and what transport takes, when the pocket holds what it still requires. Otherwise it brings at most `carry·s`, the room the builders make (`SITE_HOLDS − onSite + build·s`) and the pocket, and builds in at most `build·s` and what reached the site. So a night is one computation and never holds more than the site holds. Exact for one good; with several, transport and the builders split evenly, as transport already does.
7. **On hold**, transport brings nothing and the builders build in what is on the site. A step built in on hold gives way to the next one on hold. `accrue` runs the site whenever something is ordered, not only while delivering.
8. **Unattended**, the builders work at the night shift output, like transport, and `secondsToFinish` counts each step at the longer of its two times, so a roof built in on hold at night lights the rest of the night from that second.
9. **The page's numbers** are `orderNumbers` in `transport`: what transport brings a second (no more than the builders make room for once the site is full), what the builders build in a second (no more than reaches them once it is empty), what is on the site, and what the step still requires built in. It names no limit (rule 7.11).
10. **The limit, for the lab only**, gains `builders`: `orderLimit` takes the builders' time when it is the longer one. The lab's players do not move builders yet (#655).
11. **When nothing moves**, `deliver` returns the same mountain, so an idle order costs no new state.

## Tasks

1. `building` job and twelve at the start (`workforce`, `mountain`).
2. `Site.onSite`, `receive`, `buildIn`, `stillToBuild`, `stepDone`, `siteAfter` (`city`), tests first.
3. `building-site`: the numbers and `stepWork`; `transport.deliver` runs it; `orderLimit`, `orderNumbers`, `secondsToFinish`; property tests (never more on the site than it holds, never more built in than required, nothing lost).
4. `accrue` runs it on hold; night tests (a full site stops transport; a roof built in on hold lights the night).
5. Save `onSite`; reader checks; ledger.
6. Docs: `ARCHITECTURE.md`.
