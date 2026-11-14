### Save lens: can a player lose progress, or can a failure go unseen?

`.claude/rules/observable-saves.md` is the checklist. Check each point against the change:

- Every new or changed save field is mirrored in `firestore.rules`, with the emulator round-trip test in `rules-test/`.
- The save is written on a dig, on hide and on pagehide. The phone backup stays current and is never removed.
- Launch keeps the copy that is ahead, and a tie between two real copies keeps the phone.
- Every failure is logged as a structured event and shown on the save line. Nothing is swallowed.
- A change that resets players' saves says "Resets the save" in the PR and was flagged to Flemming first.
- Parsing a stored save rejects an illegal state instead of carrying it into the game.
- Walk the code lens's states for every path that loads, holds, writes or uploads: the same event arriving twice or mid-flight, the page killed with no hide or pagehide after a stretch of play, another tab holding the seat. Each must keep the progress the player saw and leave a log line that says what happened.
