# Journeys: kill the tab and reopen, and the tab left open all night (#553)

An agent-run sitting under M16 (#551), on the player driver and `Expected` from #552.

## Plan

1. The driver learns three moves: `kill()` (the renderer crashes through CDP `Page.crash`, so no pagehide, visibilitychange or unload handler runs), `reopen()` (a new tab in the same phone, at the same moment), and `jump(ms)` (the clock jumps at once, every due timer runs once at the far end). `open()` takes the moment to open at, and `otherPhone()` gives a second phone with its own storage.
2. `Expected` keeps what the game last saved (every applied move is saved at once, `commit` in `src/store-actions.ts`) and `reopened(at)` opens it the way any stored save is opened.
3. Kill and reopen: digs, a buy, a dig, the kill, the reopen. The board reads the same moment, and plays on.
4. The tab left open all night: the mid-game save open at nine, the clock jumps eight hours, and the open tab pays what a cold open of the same save on another phone pays (its welcome card's haul is the rules' haul). The crew digs on afterwards.

## Rulings

- **A hard kill loses the crew's work since the last move to the away rate.** The game saves on moves, hide and pagehide, not on ticks. On the mid-game save, five minutes of watching before a kill loses 122,760 of 175,500 stones. That is a bug, filed as #573 (fast lane, coordinator's ruling); this journey pins today's behaviour as a named known gap (the second test), so the fix shows as a change.
- **"Removing the save on a buy" is proved by hand:** skipping `persistSession` for `buyTier` in `commit` turns the first kill journey red (expected 1, received 20). Reverted.
- **The open tab gets no welcome card after the night.** The welcome card shows once per open (`markWelcomed`); a later payout on an open tab is paid silently. The journey compares the board's stones instead, and the cold open's card carries the haul.
- **The phone profile** (`tools/journeys/phone.ts`) is shared by the config and the second phone, so both phones are the same size.
