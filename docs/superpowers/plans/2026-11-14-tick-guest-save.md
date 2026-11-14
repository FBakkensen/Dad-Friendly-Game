# A tab the phone kills keeps the crew's last minutes (#573)

A fast-lane bug found by the kill-and-reopen journey (#553). The guest save was written on moves, hide and pagehide, but not on the crew's ticks. A hard kill (no pagehide) handed the crew's work since the last move back as time away, at 30%.

## Plan

1. `src/progress-store.test.ts`: a tick writes the guest save at the tick's clock, with no new log line. It is red without the fix (the save keeps `lastSeen` 1000, not 3000).
2. `src/local-saves.ts`: `persistSessionQuietly` writes the guest save with no `save.session ok` line. It shares one writer with `persistSession`, and a failed write is still recorded (`save.error`).
3. `src/store-actions.ts` `tickStore`: the tick that already writes the signed-in phone backup now also writes the guest save, once one exists (`saveKind` is `session`, the same check hide uses). A second test: an untouched guest mountain is not saved by a tick, and the save line still says unsigned.
4. The journey: "kill the tab while the crew digs" now reads the same moment, both on the board and in the rules. `Expected` saves on each tick once a move has been saved or a save was opened, as the store does. Red without the fix (rules 5, board 1).

## Rulings

- **Only once a guest save exists.** A tick always moves the clock, so without the check a fresh mountain nobody touched would be saved within a second and come back as "Saved on this device". The check is the one hide already uses. Every guest with a crew has made a move, so has a save.
- **Every tick, no throttle.** The issue proposed a write every few seconds. The signed-in phone backup has written the full save on every such tick since it was built, so the guest save follows the same path rather than getting a second rhythm. A kill loses at most one tick.
- **Quiet.** A `save.session ok` line every second would bury the save line's `data-log`, so the tick writes log nothing. Failures still record, so a full device adds a `save.error` each second, as the signed-in phone backup already does.
- **Signed in was already safe,** checked by reading the code, not by a journey: the phone backup is written each tick, and launch keeps the copy with more stones mined. The bug was the guest's.
- No new save field and no economy number.
