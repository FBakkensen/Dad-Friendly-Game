# Keep the left mountain in Saved copies (#480)

**Goal:** after a Start over or a pass, Ledger > Saved copies holds the mountain he left, and Play this one brings it back, signed in, as a new run.

**Shared module:** `src/save-choice.ts` already holds archive-then-switch (`chooseSave`, `restoreCopy`). The new run's archive step goes there beside them. `beginRun` in `src/store-actions.ts` stays the one place a run starts; it is called after the archive, unchanged.

## Rulings (agent-run sitting)

1. **Archive first, then start.** Signed in, Start over and Pass it on archive the mountain in play (`reason: "start-over"` / `"pass"`) and only then call `beginRun`. A failed or timed-out archive (10 s) keeps the mountain in play, logs `save.archive` as an error on the save line, and records it in the field log. Losing a minute is fine; losing the mountain is not.
2. **Nothing to keep, nothing archived.** A mountain with no stone mined this run starts over without a copy, so two quick Start overs do not crowd the three-copy shelf. Signed out there is no shelf, so the run starts at once as before.
3. **One new run at a time.** A second press while the archive is in flight is refused. If the run changed under the archive (another device's newer run arrived), the new run is not started.
4. **An earlier run comes back as a new run.** Restoring a copy whose run started before the one in play stamps `startedAt = max(now, playing + 1)`, so the later-run rule and `notOlderRun` in `firestore.rules` still hold. Its time away is not paid (he was playing the other run meanwhile): `lastSeen` is now. A same-run copy restores as before.
5. **The reason is stored.** `archiveCopy` takes a required `reason` (`conflict`, `restore`, `start-over`, `pass`). `firestore.rules` accepts those four; the emulator test covers them.
6. **No new copy.** Saved copies shows every copy with Play this one. The earlier-run line goes away. No new words on screen.
7. `startOver` and `passTheMine` on the store return promises (`boolean`: a new run started). The Ledger and the Legacy card act on the answer.

## Tasks

1. `cloud-save.ts`, `firebase-save.ts`, `firestore.rules`, rules test: `reason` on the archive.
2. `save-choice.ts`: `keepThenBegin` (archive, then `beginRun`), and `restoreCopy` for an earlier run. Store tests in `progress-store-new-run-copy.test.ts`.
3. `progress-store.ts`: async `startOver` / `passTheMine`; callers in `ledger-panel.ts`, `legacy-panel.ts`; their tests.
4. `saved-copies-panel.ts`: every copy playable; drop `SAVED_COPY_EARLIER_RUN`; screen test; boot preview.
5. Docs: `DESIGN.md`, `ARCHITECTURE.md`, `ui-audit.md`.

Prove with the ladder in `.claude/rules/dad-friendly-work.md`.
