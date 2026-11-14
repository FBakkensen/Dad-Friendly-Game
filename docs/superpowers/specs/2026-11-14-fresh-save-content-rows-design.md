# A fresh save, and content as rows: design spec (14 Nov 2026)

Status: written for #557 under the parent #551, from Flemming's answer of 14 Nov 2026. It covers several slivers, so it ships on its own PR and is split into issues ([Slivers, in order](#slivers-in-order)). Each later sitting plans and builds one sliver from it, with no new brainstorm (`.claude/rules/superpowers.md`). What Flemming decided is under [Decided](#decided-flemming-14-nov-2026). Every other choice is marked **(my call)**, for him to check.

## Why

The game is about to get many more things: machines for three stages, goods, kilns and saws, village buildings, and in the end a rocket (`2026-11-14-line-works-village-design.md`, "Where this is going"). Today each new thing is paid for in three places that have nothing to do with how it plays.

- **A thing's facts are spread over the code.** Adding the hoist and the pit train, while they were still unseen and unbuyable, touched 36 files (#533, commit `411d471`). At `5384127`, a machine's id is spelled out in 34 non-test files in `src`, and its count is a named field (`mountain.carts`) read in 23. Its stage, post, trouble, marks, band favours, art and words each live in a table of their own, and the compiler does not ask for most of them.
- **Stones are the only thing a price can ask for.** A price is one number, taken from `mountain.pocket`, which 30 non-test files read. The line spec needs bricks and cut stone at step 2 and prices in two or three goods after that.
- **The save has one named field for each thing, written by hand five times.** A new field goes in the saved type, the writer, a hand-written parser, `firestore.rules` and the rules tests.
  - The rules file is near Firestore's limit of 1,000 expressions for one write. So every field added since v6 went into a `workshop` map that the rules do not look inside: the hoists and pit trains sit there beside the craft clocks.
  - Seven save versions are still read. `src/persist.test.ts` builds dozens of old saves by hand to prove it.
- **An old build can damage a newer save.** The parser drops a key it does not know. A tab left open on yesterday's build reads today's save and writes it back without its new fields.

The research behind this is in the project's shared files (`ideas/2026-11-14-verification-research/`, with a report). Games that grow this way keep their content as rows of data with ids that never change, run it with rules that know nothing about any one row, and save only what the player has, keyed by id (Factorio, Kittens Game, Antimatter Dimensions).

## Decided (Flemming, 14 Nov 2026)

He was asked when to reshape the save and the content. His answer: "just now, we don't need backwards compatibility, we start fresh and accept the any running game breaks, i am the only player at the moment anyway".

So:

1. **The reshape is built now**, before the line turns on in play, not after step 1.
2. **The save starts fresh.** No save from before this design is read. His running game ends when the first sliver ships.
3. **No backwards compatibility while he is the only player.** There are no migrations, and no old saves kept as tests.

## Goals

1. **A new thing is a row.** A machine that works like the others is added with its row, its words, its art and its tests. No save code, no rules file, no screen code.
2. **The save knows a few kinds of fact, each keyed by id.** How many he owns, how much he holds, what level it is, when it ends, and whether it has happened. A new id needs no new field.
3. **A price is a short list of goods**, paid from one stock, by one module.
4. **A build never writes a save it does not fully understand.** It opens it read-only and offers the update.
5. **The reshape changes nothing in play.** After the fresh start, every number, screen and lab row is as it was.
6. **It doesn't grow back.** The gate fails when the id of a thing he owns is spelled out away from its table.

## Non-goals

- No change to how the game plays, its numbers, its look, its words or its sound.
- No change to the line, the cage, the works or the village. Their spec stands, apart from the old-save rows this one replaces ([below](#what-this-replaces-in-the-line-spec)).
- No change to which copy of a save is ahead (#548 owns that), or to when the game saves.
- No game engine, no entity system, no content in JSON files, no schema library, and no new dependency **(my call)**. The tables stay typed TypeScript, and the parser stays hand-written on the readers `src/save-format.ts` already has.
- No migration framework. The day one is needed is named under [Resets](#resets).
- No content that is loaded or swapped at run time. The tables are constants.
- No table of every multiplier with where it comes from. That was recommended for step 3 and stays there.

## Anti-goals

These would make it a failure even if it works:

- **A number that moves.** A reshape sliver that changes a lab row, a pacing figure or a price has a bug. If a guardrail in `src/lab/targets.ts` would have to move, that's a stop for Flemming.
- **Two shapes side by side.** Each sliver deletes what it replaces in the same PR. No `mountain.carts` beside `owned.cart`, and no old parser kept "for now".
- **A reset nobody was told about.** A sliver that ends his run says so before it is built ([Resets](#resets)).
- **An abstraction with one user.** No generic "entity" or "component". A row's fields are the ones the rules read today.
- **A slower lab.** `effectiveRates` is the labs' hot path. A sliver that touches it times one lab job against `main`.

## Design

### A. The fresh save

**A new home, so nothing old can touch it.** The new save has a new Firestore document path and new phone storage keys. No build from before this sliver reads or writes them, so a tab left open on an old build cannot damage the new save.

- The old document (`saves/{uid}`), its archive and the old phone keys are left where they are and never deleted. The rules make the old path read-only for its owner: an old build's save fails where he can see it, and a reload brings the new build **(my call)**.
- Suggested names: `games/{uid}` and `gameArchive/{uid}/copies`, with the phone and guest keys renamed to match. Builder's choice.
- The field log keeps its path.
- What belongs to a run starts over with it: the homecoming news (`dad-friendly-homecomings`) and Tonight in the Ledger must not show the old run after the fresh start, or after a later reset. How is the builder's choice.

**The envelope.** As today: `version`, `rev`, `savedAt`, `deviceId`, an optional `deviceLabel`, `lastSeen`, and one map with the game in it. `version` starts at 8, so it can't be mistaken for an old one. The run's stamp (`startedAt`) moves up into the envelope, where the rules and every later build can read it whatever shape the game has **(my call)**. `rev`, `savedAt` and the device fields are the cloud's, as today: a phone or guest copy has only the version, the run's stamp, `lastSeen` and the game.

**The game, by kind of fact.** The save says five kinds of thing about an id, each in one map:

| Map      | Says                | Holds today                                         | Holds later, with no new field        |
| -------- | ------------------- | --------------------------------------------------- | ------------------------------------- |
| `owned`  | how many he owns    | workers, each machine, the kids                     | kilns, saws, buildings                |
| `stock`  | how much he holds   | stones, clay, iron, crystal, heartstone             | bricks, cut stone, manufactured goods |
| `levels` | what level it is    | upgrades, Workshop gear                             | anything with levels                  |
| `clocks` | when it ends        | boosts, what a craft leaves running, the Gold rush  | anything on a timer                   |
| `marks`  | whether it happened | seen, taught, found, known recipes, by kind of mark | orders sent, doors opened             |

- Beside the maps are the few records that are not a count: the run (the generation, the stretch, how far the shaft has gone, the rush's banked stones), the engineers, the parties out, and the bench's job with its own end time (so a job and its clock can't come apart).
- **The save says how far the shaft has gone, not how much mountain is left (my call).** The mountain will have no bottom (line spec, step 3), and #545 and #548 count stones dug. The game state in memory keeps `remaining` for now, and the writer turns one into the other.
- Zero and empty are left out, as today. A fresh game is a few lines.
- **Ids.** Today's ids are kept as they are spelled (`cartSyn`, `machine`): nothing is renamed **(my call)**. A new id is lowercase words joined by hyphens. An id is unique within the map it is saved in, and a test checks that. Where two tables that share a map would clash, the builder gives each its own map. An id is never renamed, and never used again for something else.
- The names of the maps and records are the builder's choice. The five kinds are not.

**One parser, four answers.** Reading a save returns one of:

- `ok`, with a complete game state: every id present, zero where the save said nothing.
- `newer`: the save holds more than this build knows. The version is above this build's; or there is an id, a key or a named value (a post, a tunnel) it does not know; or a count is above this build's cap for it (a level past the top level, a sixth engineer). An amount in `stock` has no cap but the safe-integer limit: a good's ceiling is a rule of play, and a pile over its room is a legal save (line spec, step 2).
- `older`: the version is below this build's.
- `bad`: nonsense. A wrong type, a negative or broken number, a missing envelope. Handled as an unreadable copy is today.

The parser keeps today's caps, so the rules of play can trust the state it returns. More than it knows is `newer`; nonsense is `bad` **(my call)**. So a later build can add an id or raise a cap without a new version: an old build goes read-only by itself.

**The guard: `newer` is read-only.** The build shows the "Update available" card that exists today (#464: `UPDATE_TITLE`, `UPDATE_RELOAD`, raised by `showAppUpdate`) and writes nothing: not the cloud document, not the phone backup, not the archive. The hold is one more block in `playBlock` (`src/store-context.ts`), beside the other-tab and conflict blocks. It records `save.newer` on the save line. Boot HTML is sent uncached, so Reload brings the build that understands the save. Offline, the service worker may serve the old build again: the card comes back, and still nothing is written.

- This replaces the `kept` bag, which carried a few kinds of unknown id through an old build. Nothing is carried now, because nothing is written **(my call)**.
- A missing key is never `newer` or `bad`: it reads as its default. So adding a fact to the save needs no version change and resets nothing.

**The ledger of what has shipped.** One test holds every id, every named value and every cap shipped under the current version. Adding an id or a value adds a line, and raising a cap changes one. Taking one out, or lowering a cap, fails the test until the version goes up or the old value is given a reading ([Resets](#resets)). Without it, the newest build would read its own save as `newer`, and Reload would change nothing.

### Resets

`older` means the shape changed under a save. While Flemming is the only player, that is a reset **(my reading of his answer; he can end it any day)**:

- The old copy is set aside, never deleted: the cloud copy goes to the archive with a new reason, and the phone copy moves to a side key that carries its version. Then a fresh mountain starts. The field log records it under a new code (`save.reset` is taken: Start over and the pass use it). A copy set aside is for the record: no screen lists it or restores it.
- The old cloud copy lands in the archive before the fresh mountain's first cloud write. `keepThenBegin` (`src/save-choice.ts`) is the mechanism to extend. Until it lands the board holds, as it does while loading.
- **The fresh mountain keeps the run stamp (my call):** the highest stamp among the copies it set aside, the phone's and the cloud's, read from the envelope. So the rules' "not an older run" check passes, and the fresh mountain is not a later run than what another device has played since.
- **A blank mountain from a reset is not a copy until something is played on it.** Its stamp alone is not progress. So when it meets a cloud copy of this version, the cloud copy is kept, and between two played copies the one with more stones mined is ahead, as today. A device that resets while offline can't overwrite the other's play.
- The first sliver's own fresh start needs none of this: the old save stays at the old path.
- **Adding never resets.** A new id, a new key with a default, a new mark kind, a higher cap: old saves load, and the version stays.
- **Changing what a fact means, lowering a cap, or retiring an id or a named value, resets.** The version goes up.
- **A reset is allowed, not owed.** Where an old value has an obvious reading that is one line in the parser (#539: a post saved as `borer` reads as the face), the builder may keep the save and add the reading. The ledger lists it, and the next reset deletes it.
- **A sliver that resets says so first**: "Resets the save" in its issue and its PR body, so he reads it in the chat before his run ends. This goes in `.claude/rules/dad-friendly-work.md`.
- **The day there is a second player, resets end.** From then a shape change needs a migration step from each version to the next, and a kept sample save for each. That is Flemming's call to make, and a new design.

There is no line on screen for a reset **(my call)**: he is told in the chat, and a note would be a line of copy for one reader.

### B. The rules check the envelope. The parser checks the game.

`firestore.rules` can't loop over a map, so checking each id costs expressions for every row of content, and the file is already at its limit. From the first sliver the rules check only what they can check for any amount of content:

- the owner, as today;
- the envelope's keys and types, and that the game is a map;
- `rev` moves by one, and `savedAt` is the server's time, as today;
- the run is not older than the stored one, as today;
- **the version never goes down.** This is the guard again, on the server: an old build can't replace a newer save even if its own check failed.

What the rules gave up, the writer takes on:

- **The writer checks its own work.** Before a cloud write, the store parses what it is about to send. Anything but `ok` is not written: it records `save.shape` as an error and shows on the save line. The cloud keeps its last good copy, which is what a refused write did before.
- **A round-trip property.** For any state random play can reach, reading what was written gives the same state, once the stones left are rounded up to a whole stone as the writer rounds them today. So a fact the writer forgets fails the test. It runs on the generator of #555 if that has merged, or on a small one of its own.
- The emulator test stays: a full save goes through the real rules, a lower version is refused, an older run is refused, and the old path takes no write.

`.claude/rules/observable-saves.md` changes with it. "Mirror every new or changed save field in `firestore.rules`" becomes the three lines above: the rules check the envelope, the parser checks the game, the writer parses before it writes. Its save line and its launch paragraph gain the two new cases: a read-only save, and a copy set aside by a reset. `src/rules-drift.test.ts` shrinks to the envelope and the field log.

### C. What goes

In the first sliver, with the fresh save:

- Versions 1 to 7: the `switch` in `src/persist.ts`, the grid migration, the scaling and deepening steps, `grantFromStones`, and their tests.
- The `workshop` overflow map and the `kept` bag.
- The one-time grants a loaded save gets (`loaded` in `src/session.ts`), and the mark that tracks them: `staffExisting` and the `staffed` mark, and the first engineer for a save that had borers before engineers existed. The `crew-joined` and `engineer-joined` notices and their welcome lines go with them, since nothing else raises them. The first borer still brings the first engineer when it is bought (`buyCrew`). A new mountain starts as today's new mountain does.
- The old-version seeds in `tools/browser/fixtures.ts`. Every saved game the browser checks and `npm run play` use is built as a game state and written by the real writer, never as hand-written JSON, so a fixture can't drift from the format.
- The rules for versions 1 to 7, and the long field list in the rules file's opening comment.

### D. Counts by id

In memory, the game state gets the save's shape for counts: `owned` is a complete record from id to count.

- The named fields (`helpers`, `carts`, `hoists`, `drills`, `borers`, `trains`, `machines`, `kids`), `CrewField` and the row's `field` go. `buyTier` adds to `owned[id]`.
- A row says its own stage. `MACHINE_STAGE` goes into the rows. `src/line.ts` stays the one home of the line's rule.
- Every record keyed by machine (`Staffing`, the speed and running records, the bays) is built from the table, so a new row is in all of them.
- The field log's crew and idle lists are maps by id, and its rules stop listing ids.
- Ids stay a closed union, taken from the table (`as const`). A typo is still a type error.

### E. One stock, and prices as lists

- `stock` is a complete record from good to amount. `pocket` becomes `stock.stones`. The four materials move into it from the Workshop's own record.
- One table lists everything he can hold: stones and the four materials now. A row says its name, where it comes from and its ceiling, if it has one. Bricks and cut stone are two more rows at step 2. On screen, materials are still called materials.
- `Price` is a short list of `{ good, amount }`. Every price in the game is one: a machine, an upgrade, a boost, a promotion, a recipe. Today each has one entry, except recipes.
- One module is the only code that takes from the stock or adds to it: can he pay, pay, add, and the ceiling. `src/workshop.ts` has most of this for materials today, and it is extended, not copied. Suggested home: `src/stock.ts`.
- A move's result says what was spent and gained by good. "The price he was shown" on an upgrade or a promotion is a `Price`.
- What a price in two goods is worth to the lab's players is not decided here. Every tier price is stones until step 2, whose lab probe owns that question.

### F. A row carries the rest

After the line's step 1 has settled what belongs to a stage (#539 moves posts and trouble):

- **Two tables, one id.** The rules row holds what play needs: stage, price, growth, rate, hands, when it opens, what it needs, its marks, which bands suit it or are tough on it. A view row, keyed by the same id, holds its names, its lines and its art. The view table is a complete record, so a machine without words or art does not compile. The rules never import the view.
- Suggested home: `src/content/`, one file per table, with `tiers.ts`, `layers.ts`, `milestones.ts` and the rest moving in as their turn comes. Builder's choice.
- What is special to one row is a field on the row (`needs`, `opensAt`), never an `if` on its id.
- **The id check.** A gate step, beside `npm run functions`, fails when the quoted id of a thing he owns (a row of the `owned` tables: the worker, a machine, the kid, and later the works and the buildings) appears in non-test `src` outside the tables and the lab's player types. No allow-list, as with the function limits. Where the code uses the same word for something else (`"machine"` as a kind), the code's word changes, not the id.

## The measure

Add the next machine after F and count the files. The aim: its row, its view row, its art, its tests, and `docs/DESIGN.md`. #533 took 36.

## Slivers, in order

Each is one sitting and one PR, keeps the game booting with every gate green, and deletes what it replaces.

1. **The fresh save** (A, B, C and Resets). Resets the save. In memory, only `staffed` and `kept` leave the game state, with the grants. The counts, the pocket and the rates are not touched, so the labs and every screen are as they were.
   - Blocked by nothing. It can run beside #534 and #543, which are lab work.
   - Proof: the round-trip property; the emulator tests above; a test that a `newer` save writes nothing; a test of a reset (the old copy is set aside, the run stamp is kept, and a device that has played is ahead of one that reset to a blank mountain); `npm run play` on a fresh game, then a reload, then a kill and reopen. The lab reports read as on `main`.
2. **Counts by id** (D). No change he can see. Flemming picked this work ([Decided](#decided-flemming-14-nov-2026), 1), which is what `.claude/rules/dad-friendly-work.md` asks of a sitting with nothing to see. The same holds for 3 and 4.
   - Blocked by 1, by #543 (so the line's numbers are not being tuned under a wide move), and by #554 (the pacing ledger is the proof).
   - Proof: the pacing ledger does not move, both labs print the same rows as `main`, the visual check passes with no shot updated, and one lab job is timed against `main`.
3. **One stock, and prices as lists** (E). No change he can see.
   - Blocked by 2. Same proof.
4. **A row carries the rest, and the id check** (F).
   - Blocked by 3 and by #537, #538 and #539.
   - Proof: the id check is in the gate and green; the same ledger and lab proof.

**The line waits for 2 and 3.** #536 turns the line on in play, and it gets "blocked by" sliver 3. So #536 to #539 and the cage are written once, on the new shape. None of them touches the rules file, and what the cage adds to the save (#545) is added as A says. #539 turns the engineers' posts from machines into stages, which retires saved values: its builder gives each old post a reading or resets the save, and says which in the PR. The cost is about two sittings before the line turns on **(my call, from "just now")**. Step 2 of the line spec is split after sliver 4.

The journeys of #552 and #553 are not blockers. If they have merged, slivers 1 to 4 run them.

## What this replaces in the line spec

`2026-11-14-line-works-village-design.md` is changed in this PR, only where Flemming's answer overrules it:

- Step 1's "Old saves" row, rule 17's first half, and "#536 ... with the old-save grant": there is no grant. A save played since the fresh start meets the line as it is, and may run slower than it did.
- The cage's "Old saves" row and the last line of "How it would be built": a save from before the cage loads with the crew at the heading, since a missing fact reads as its default. A new fact is added to the save as this spec says, not mirrored in `firestore.rules`.
- Steps 2 and 3 keep their old-save rows, with a note: when the step is split, the builder asks whether Flemming is still the only player. If he is, a reset may take the place of a grant.

#536's issue loses its old-save line.

## Constraints

- `.claude/rules/observable-saves.md`, as changed in B: the save line, the log codes, the phone backup and the launch rule are as today.
- The verification ladder in `.claude/rules/dad-friendly-work.md`, and the three stops in `.claude/rules/superpowers.md`.
- Strict TypeScript. The game state in memory has no optional fields. A read is a discriminated result, never `undefined`.
- TDD. Where behaviour moves, tests that pin it come first.
- Docs move with the code: `docs/ARCHITECTURE.md` (the save, the content tables), `docs/DESIGN.md` where it names a field.

## Calls I made

For Flemming to check. Each is easy to turn back before its sliver is built.

1. Resets go on after the first one, announced each time, until he says there is a second player.
2. The line turns on after slivers 2 and 3, about two sittings later than it would.
3. The rules stop checking the game's contents. The writer checks its own work instead.
4. A build that meets anything it does not know goes read-only. Nothing unknown is carried through.
5. The old save path becomes read-only, so an old build's save fails in view.
6. The save counts how far the shaft has gone, not what is left.
7. No line on screen for a reset.
8. No schema library and no new dependency.
9. Today's ids keep their spelling.
10. A fresh mountain after a reset keeps the old run stamp, so it never outranks another device's play.
11. A count above a build's cap reads as `newer`, so raising a cap needs no new version.
12. A reset is allowed, not owed: where one line in the parser can read an old value, the builder may keep the save.
13. With no grant, a save played before the line turns on may run slower on the day it does.

## Left to the builder

- The path, key, map and record names, and the file layout under `src/`.
- How the ledger of what has shipped and the id check are written.
- Whether the writer's check also runs on phone backup writes, as long as every cloud write has it.
- Whether "tier" stays the word in the code for a thing bought in Buys.
- The order of moves inside a sliver.
