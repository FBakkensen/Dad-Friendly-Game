# A found relic feels like a find (#523)

**Goal:** digging up a relic is the biggest moment of a run, and the reveal should look like it. Today it is the 24px socket icon at 48px in an empty frame, it just appears, and it says the power twice. After this sliver the relic is the gold 64px sprite at 2×, it rises into place with light around it, and one line says what it does. All six relics share the reveal.

**Not in this sliver:** the Legend page, a found relic's detail page and its keepsakes, depths and powers, sound, and anything on the board before the drawer opens (the socket lighting first is its own issue).

**Must not happen:** the phone page scrolls; a blur, glow filter or soft fade (the board is hard pixels and hard steps); a wait he cannot skip; motion with reduced motion on.

## Approaches

- **A. The relic rises and shines (picked, Flemming 13 Nov).** The relic climbs in hard steps and lands; pixel light dashes around it turn a notch at a time; the words step in under it.
- **B. Big and still.** Same page, nothing moves. Cheapest, but it still just appears, which is half of what felt flat.
- **C. The board reacts first.** The socket lights before the drawer opens. The best moment, but it touches the board, the drawer's opening and the away-card order: its own issue.

Art (Flemming 13 Nov): the gold sprites already in `src/assets/relics/`, not the 24px board icons scaled up and not new PixelLab art. No credits spent.

## Design

- **The relic.** `src/assets/relics/<relic>.png` at exactly 2×, centred in a 128px box (the files are 52 to 62px, so 104 to 124px on screen), `image-rendering: pixelated`. Only the reveal uses it; the detail page, the shelf and the Legend keep the 24px icons.
- **The rise.** When the reveal page is shown, the relic comes up from below its place in hard steps (`steps()`, like the cards' rise) and lands. It starts after the drawer's own 0.24s slide and is done within about half a second.
- **The light.** Around the relic, short dashes of art-pixel blocks at the eight compass points, drawn in CSS in a warm amber token (no new art, no filter, no gradient edge). Two frames, near and far, swapped slowly for as long as the page is open.
- **The words.** Kicker, then after the relic lands: "You found the …", "The virtue of ….", and one line (below). They step in whole, not faded.
- **The plate.** Carry it with pride is on the page from the start and is guarded by the drawer's existing settle, nothing new. An early tap carries the relic, which loses nothing: it is on the shelf.
- **Reduced motion.** No rise and no swap: the relic, the dashes (near frame) and the words are simply there.
- **Replays.** Each reveal plays once when its page is shown: the idle repaint does not restart it, and a second relic found right after the first plays its own.

## The one line (copy, for Flemming's approval)

| Relic   | Kept on the reveal                                                                                           | Dropped from the reveal                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Lantern | Your power: Golden veins appear 40% sooner, and it lights the way to the next relic.                         | It lights the way to the next relic, and golden veins glint more often.                                             |
| Shield  | Your power: Your crew keeps mining up to 24 hours while you're away.                                         | Your crew keeps mining for a whole day while you're away, not just 8 hours.                                         |
| Hammer  | Your power: Unlocks the Great Machine.                                                                       | The Great Machine can be built, the mightiest crew of all.                                                          |
| Heart   | Your power: Away pay grows the longer you're gone, up to ×1.5 after 12 hours.                                | The longer you're away, the harder your crew works: up to half again the away pay after 12 hours.                   |
| Crown   | Your power: Kid workers join the crew: they mine, count as workers, and make every worker and kid 2% faster. | The same sentence with "each one makes".                                                                            |
| Mantle  | You reached the bottom of the mountain. Every dad who keeps showing up is a hero.                            | Your power: Ends the run as a Legend. Pass the mine to your kid when you are ready. (The Legend page says it next.) |

No new words: every kept line is in the game today.

## Shared module

- `src/relic-pages.ts#createRevealPage` holds the reveal and keeps doing so. It stops sharing `relicHead`'s art with the detail page; the detail page is not changed.
- The gold art gets one home beside `RELIC_LIT` in `src/board-relics.ts` (`RELIC_GOLD`), imported straight from `src/assets/relics/`.
- `Relic.power` is read only by the reveal. It goes; the Mantle's sentence stays as the reveal's one exception.
- The motion is CSS in `src/board.css`, next to `.relic-page`, with its reduced-motion rule in the board's existing block.

## Left to the builder

Exact step counts and timings inside the bounds above, the dashes' size and colour token, and how the browser checks hold still on a looping page (follow what the engineer walker's loop does).
