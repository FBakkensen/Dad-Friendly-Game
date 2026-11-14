# The Claude review walks the game's state (#597)

**Goal:** the review catches bugs that need following the game's state through a sequence. In the #586 replay it caught 1 of 8 known bugs, and it missed all 7 of these.

**Shared module:** the lens texts in `.github/review/`. No tool code changes.

1. The code lens adds "Walk the states" next to Intent. For each changed behaviour, the reviewer traces each state from what starts it to what the player sees and what is saved, and reports every state that goes wrong. The states are: none, the first and the last, again, interrupted, elsewhere, and changed underneath.
2. The save lens walks those states for every path that loads, holds, writes or uploads.
3. The game lens checks that each number the board shows matches what the game then does, in each state.
4. The wording stays general. It names kinds of state, never the eight known bugs, so the replay is not taught its own answers.
5. The replay is dispatched on this branch, so it reviews with the new lenses. It runs on the same eight PRs, one at a time, under $10. `docs/review-replay.md` gets a second table and the same one-line verdict.
