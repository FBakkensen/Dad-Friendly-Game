# Part 1 is switched on (#664)

**Resets the save.** The save goes to version 9: today's save (version 8) is set aside, never converted (the phone keeps its text at `{key}:v8`, the cloud keeps it in Saved copies), and a fresh mine starts with the old run stamp.

Spec: `docs/superpowers/specs/2026-11-14-slice-1-design.md`, "How it would be built", "The save" and "Proof". An agent-run sitting: the design calls below are rulings.

## Tasks

1. **Rock dug in all** (call 13). `Mountain.rockDug` counts what drilling digs (`flowMine` adds `flow.moved[0]`), saved as `run.rock` (`save-format`, the ledger). `rockDugInAll` (`mountain`) is stones mined from the mountain plus it, and `compareSaveProgress` and the merge's `mined` fact read it. Tests: `mine-piles`, `save-ledger`, `save-progress`, `save-format`.
2. **Version 9.** `SAVE_VERSION` 9; `firestore.rules` takes `version >= 9`; the tests and fixtures that pinned 8 (current) or 9 (newer) move up one; a version 8 save reads `older` (`persist.test`). The emulator test passes.
3. **Boot.** `createAppServices` holds `fresh.off=0` on every boot; `main` mounts the frame for everyone; `?slice=1` and its `dev-slice` account go (the frame's play saves are the `dev-dad` memory save's phone backup). `server-read` guards the stones tapped during a read on resume (Infinity − Infinity). A new phone's fresh mine is not a copy: `anyProgress` counts past the start's.
4. **The visual check and play.** Today's board's section modules go; `saves.mjs` holds the save line in each of its words with its drawer, and the save's cards; `frame.mjs` opens on `?memorySave=1`. Play's saves are the frame's (`start` … `roof`), `fresh` and `newer`.
5. **Journeys.** On the frame: the first evening to the Light Tower's roof (new), back after eight hours and the tab open all night on a busy fresh mine (the shift report), and kill and reopen.
6. **Docs.** `DESIGN.md`, `design-intent.md`, `ARCHITECTURE.md`, `ui-audit.md` (re-shot on the frame by `npm run audit:ui`), `observable-saves.md`.

## Rulings

- Today's game stays in the code behind `fresh.off` until #665; the unit tests and the labs play it unless they set the factor. No bound in `src/lab/targets.ts` moves, so there is no stop.
- The ids that went (relics, the pass, veins, the upgrades that went) stay in the save reader and the ledger until #665: a version 9 save in play never holds them, and removing them is #665's (a cap lowered or an id removed then needs no new version, since no shipped version 9 save holds them).
- The `?slice=1` preview goes: the frame is the game. Its play saves move to the `dev-dad` memory save (`?memorySave=1`), and lose the `slice-` prefix in play's list. The visual sections keep their `slice frame` labels until #665.
- The first evening's journey plays the lab's part 1 dad (`freshPlan`, never holding, no upgrades) and looks in every ten minutes; ten minutes folded in at once is a stretch away, so the shift report comes up between looks, as it does on a tab left open.
- The frame's stockpile carries its exact count as `data-count`, as the odometer did, for the journeys.
- The rules take `version >= 9`, so a build from before #664 can no longer write a new cloud document; it reads the version 9 copy as `newer` and asks for the update.
- Found by the audit, left for their own issues: the frame's keys stand closer than the 8px gap, and while a signed-in save loads the frame shows a new mine's numbers (both in `docs/ui-audit.md`, What the report still flags).
