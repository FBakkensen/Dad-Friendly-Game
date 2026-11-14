# The fresh save (#558) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The save moves to a new home in a new shape (version 8, five kinds of fact by id), every read answers `ok`, `newer`, `older` or `bad`, a `newer` save is read-only, an `older` one is set aside for a fresh mountain, and the rules check only the envelope.

**Architecture:** `src/save-format.ts` writes and reads the game map; `src/persist.ts` writes and reads the envelope and returns a `SaveRead`. Every caller (guest save, phone backup, the Firebase adapter, the memory cloud) passes the four answers up; the store turns `newer` into a play block that writes nothing and `older` into a reset. `firestore.rules` checks the envelope at the new paths and makes the old ones read-only.

**Tech Stack:** TypeScript, Vitest, fast-check (the #555 generator), Firestore rules with the emulator test (`npm run test:rules`).

**Spec:** `docs/superpowers/specs/2026-11-14-fresh-save-content-rows-design.md`, sections A, B, C and Resets.

## Global Constraints

- **Resets the save.** Said in the issue, the PR body and to Flemming in chat before the merge.
- No number in play moves: the pacing ledger and both labs read as on `main`. The counts, the pocket and the rates in memory are not touched (spec, slivers 1).
- `version` is 8. Zero and empty are left out.
- Today's ids keep their spelling. An id is unique within the map it is saved in (a test).
- The game state in memory has no optional fields. A read is a discriminated result, never `undefined`.
- No new dependency, no schema library. The parser is hand-written on the readers that exist.
- New field-log codes: `save.newer`, `save.shape`, `save.set-aside`. `save.reset` is taken.
- No new line of copy. The update card (`UPDATE_TITLE`, `UPDATE_RELOAD`) is reused.

## Names (the builder's choices the spec left open)

| What                          | Name                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud document                | `games/{uid}`                                                                                                                                                 |
| Cloud archive                 | `gameArchive/{uid}/copies/{id}`                                                                                                                               |
| Guest save key                | `dad-friendly-game`                                                                                                                                           |
| Phone backup key              | `dad-friendly-game-backup:{uid}`                                                                                                                              |
| Homecomings key               | `dad-friendly-game-homecomings`                                                                                                                               |
| Field-log ring key            | `dad-friendly-game-log:{uid}` / `:guest` (the cloud field log keeps its path)                                                                                 |
| A copy set aside on the phone | `{its key}:v{version}`                                                                                                                                        |
| Game map                      | `game: { owned, stock, levels, clocks, marks: { seen, taught, recipes, finds }, run: { generation, stretch, dug, rushBank }, engineers, expeditions, bench }` |

`owned` is keyed by tier id (`helper`, `cart`, ...). `stock` by `stones` and the four material ids. `levels` holds upgrade ids and recipe ids (crafted levels). `clocks` holds boost ids, the four timer ids and `gold-rush`. `run.dug` is depth dug, `MOUNTAIN_STONES - ceil(remaining)`. The envelope gains `startedAt` (left out at 0).

## Review Focus

1. **A tab on today's build meets tomorrow's save.** It must write nothing anywhere, ever, while it stays open, including on hide, pagehide, a tick, a yield and Start over. Test in Task 3: a `newer` cloud copy, then a hide, a tick and a move, and no write reaches the cloud, the phone or the archive.
2. **A first open on this build with an old save at the old path.** A fresh mountain, no error, nothing written to `saves/{uid}`. Test in Task 3 (the adapter's paths) and Task 5 (the rules refuse the old path).
3. **A guest who signs in after the fresh start.** The guest copy and the phone backup still meet as today. Covered by the existing save-watch tests on the new keys.
4. **The writer's own check fails.** A `save.shape` error, the cloud keeps its last copy, and play goes on. Test in Task 3.
5. **A device that reset offline meets a device that played.** The played copy wins, and the blank one is never uploaded over it. Test in Task 4.

---

### Task 1: The version 8 shape and the four answers

**Files:**

- Modify: `src/save-format.ts` (rewrite), `src/persist.ts` (rewrite)
- Test: `src/save-format.test.ts`, `src/persist.test.ts` (both rewritten; the old-version tests go), new `src/save-ledger.test.ts`, `src/economy/invariants.test.ts` (`roundTrips` on the new API)
- Modify: the round-trip tests that call `parseSaveValue`/`serializeSave` (`engineers`, `expeditions`, `layers`, `relics`, `scale`, `tiers`, `workshop` tests)

**Interfaces:**

- Produces, in `src/persist.ts`:
  - `SAVE_VERSION = 8`
  - `type SaveDocument = { version: 8; lastSeen: number; startedAt?: number; rev?: number; deviceId?: string; deviceLabel?: string; game: SaveGame }`
  - `serializeSave({ mountain, lastSeen, rev?, deviceId?, deviceLabel? }): SaveDocument` (rev and device id written only when both are valid, as today)
  - `type SaveRead = { kind: "ok"; save: ParsedSave } | { kind: "newer"; version: number } | { kind: "older"; version: number; startedAt: number; rev: number } | { kind: "bad" }`
  - `readSave(value: unknown): SaveRead`
  - `ParsedSave` as today.
  - `parseSaveValue` stays only until Task 3, as `readSave(...).kind === "ok" ? save : undefined`, and is deleted there.
- Produces, in `src/save-format.ts`: `type SaveGame`, `writeGame(mountain): SaveGame`, `readGame(value, startedAt): { kind: "ok"; mountain } | { kind: "newer" } | { kind: "bad" }`, and `shippedFacts(): ShippedFacts` (every id by map, every named value: engineer names, posts, tunnels, mark ids; every cap) for the ledger.

- [ ] **Step 1: Write the failing tests.**
  - `persist.test.ts`: "a fresh mountain writes a few lines": `serializeSave({ mountain: createMountain(), lastSeen: 5 })` equals `{ version: 8, lastSeen: 5, game: { stock: { clay: …, … } , marks: { recipes: [...] } } }` with only non-zero facts.
  - "reads its own save back": for a crewed save with engineers, a trip, a bench, clocks, upgrades, crafts, seen and taught, `readSave(JSON round trip)` is `ok` with the mountain equal, `remaining` rounded up.
  - "a version above 8 is newer, below is older, with its stamp and rev": `{ version: 9, … }` → `newer`; `{ version: 7, rev: 4, mountain: { startedAt: 12 } }` → `older` with `startedAt` 0 (the envelope has none) and `rev` 4; `{ version: 7, startedAt: 12, rev: 4 }` → `startedAt` 12.
  - "an unknown id, key or named value is newer": an `owned.rocket`, a `game.village` key, a `marks.recipes` entry `"kiln"`, an engineer post `"saw"` → `newer`.
  - "a count above its cap is newer": a level past an upgrade's top level, a sixth engineer, `run.generation` over `MAX_LEGACY`, `run.dug` over `MOUNTAIN_STONES` → `newer`.
  - "stock has no cap but the safe-integer limit": `stock.clay = 10**12` reads `ok`.
  - "nonsense is bad": a string count, a negative, `1.5`, a missing `game`, a missing `lastSeen`, a non-integer version → `bad`.
  - "a missing key reads as its default": `{ version: 8, lastSeen: 1, game: {} }` → `ok` with the bare mountain's counts.
  - `save-ledger.test.ts`: `shippedFacts()` equals a literal ledger (every id per map, every named value, every cap). Comment: adding a line is fine; removing one or lowering a cap needs a version bump (spec, "The ledger of what has shipped"). Plus "ids are unique within each map".
  - `invariants.test.ts` `roundTrips`: `readSave(JSON.parse(JSON.stringify(serializeSave({ mountain, lastSeen }))))` is `ok`, its mountain equals the mountain with `remaining` rounded up, and its `lastSeen` matches.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/persist.test.ts src/save-format.test.ts src/save-ledger.test.ts`.
- [ ] **Step 3: Write `src/save-format.ts` and `src/persist.ts`.** A right-typed value this build's rules refuse (an unknown name, post or tunnel, a duplicate, a count past a cap) reads `newer`; a wrong type, a negative or a broken number reads `bad`. Reuse the existing parsers (`parseUpgrades`, `parseEngineers`, `parseExpeditions`, `parseBench`, `parseTeachIds`, ...) after a type check, so a parser's refusal on well-typed data means `newer`. `MAX_MATERIAL` goes. Versions 1 to 7, `migrateLegacyGrid`, `scaleV3`, `deepen`, `grantFromStones`, the `workshop` map and the `kept` bag's reading go. `staffed` reads as `STAFF_GRANT` and `kept` as empty until Task 2 removes them.
- [ ] **Step 4: Run the touched test files and `npm run gate -- fast`.**
- [ ] **Step 5: Commit** `The save's version 8 shape, read as ok, newer, older or bad (#558)`.

### Task 2: The load-time grants, `staffed` and `kept` go

**Files:**

- Modify: `src/mountain.ts` (`staffed`, `StaffedMark`, `STAFF_GRANT`, `isStaffedMark`, `kept` go), `src/crew.ts` (`staffExisting` goes), `src/session.ts` (the `loaded` step, `crew-joined`, `engineer-joined` and their welcome lines go), `src/save-load.ts` (`openSession` loses `staff`), `src/workshop.ts` (`KeptWorkshop`, `KeptBench`, `NOTHING_KEPT` go), `src/test-fixtures.ts` (`unstaffedSave` goes), every test and tool that names them (`grep -rn "staffed\|kept\|crew-joined\|engineer-joined\|\"loaded\""`).

**Interfaces:**

- Consumes: Task 1's reader, which no longer fills `staffed` or `kept`.
- Produces: `Mountain` without `staffed` and `kept`. `openSession(ctx, { pay, since, rebase }): { paid: number }`.

- [ ] **Step 1: Delete the tests of the grants** (`crew.test.ts` staffExisting, `session.test.ts` loaded, notice tests), and change `progress-store.test.ts` expectations that a loaded save gains workers to "a loaded save is played as it was".
- [ ] **Step 2: Remove the fields and the code.** The first borer still brings the first engineer on purchase (`buyCrew`); its test stays green.
- [ ] **Step 3: `npm run gate -- fast`, and `npx vitest run src/session.test.ts src/crew.test.ts src/progress-store.test.ts`.**
- [ ] **Step 4: Commit** `A loaded save gets no grant: staffed and the kept bag go (#558)`.

### Task 3: The new home, and `newer` is read-only

**Files:**

- Modify: `src/session-save.ts` (key, `readSessionSave` returns `SaveRead | { kind: "absent" }`), `src/phone-backup.ts` (key, `PhoneBackup` gains `newer` and `older`), `src/local-saves.ts` (homecomings key), `src/field-ring.ts` (ring key), `src/firebase-save.ts` (paths `games`, `gameArchive`; a snapshot read with `readSave`), `src/cloud-save.ts` (`CloudLoadResult` gains `{ kind: "newer" }`; the memory cloud gains `newerDocs: Set<string>` that makes `current` answer `newer`), `src/store-context.ts` (`ctx.newer`, `PlayBlock` gains `"newer"`, checked right after `"closed"`; `canWrite(ctx) = isWriter(ctx) && !ctx.newer`; snapshot gains `newer: boolean`), every save write (`writeGuestSave`, `persistPhoneBackup`, `persistCloud`, `keepInPlay`, `chooseSave`) uses `canWrite`, `src/save-load.ts` / `src/save-watch.ts` (each read's `newer` sets `ctx.newer`, records and logs `save.newer`, `saveKind` "loading", emits), `src/mountain-screen.ts` (a snapshot with `newer` opens the update card through `showAppUpdate`), `src/cloud-writer.ts` (`persistCloud` reads back what it would send; not `ok` records `save.shape` as an error, logs it, sets `saveKind` "error", and does not write), `tools/browser/harness.ts` and `tools/browser/fixtures.test.ts` (`SAVE_KEY`), `scripts/visual/rail.mjs` and `tools/journeys/expected.ts` (`readSave`). Delete `parseSaveValue`.

**Interfaces:**

- Consumes: Task 1's `readSave`, `SaveRead`.
- Produces: `CloudLoadResult` `| { kind: "newer" } | { kind: "older"; rev: number; startedAt: number; raw: unknown }` (`older` is passed up here and handled in Task 4; until then the store treats it as `unavailable`), `PhoneBackup` `| { kind: "newer" } | { kind: "older"; version: number; startedAt: number; raw: string }`, `readSessionSave(): SaveRead | { kind: "absent" }` with the raw text on `older`.

- [ ] **Step 1: Write the failing tests** in `src/progress-store.test.ts` (or a new `src/save-newer.test.ts`):
  - "a newer cloud copy writes nothing": memory cloud with the uid in `newerDocs`; open signed in; then a hide, a pagehide, ten ticks and a dig. The cloud has no doc and no write, the phone backup key is unwritten, the archive is empty, `canPlay` is false with block `newer`, the snapshot says `newer`, and the log's last code is `save.newer`.
  - "a newer phone backup writes nothing": the backup holds `{ version: 9 }`; the same checks, and the stored text is byte for byte as it was.
  - "a newer guest save writes nothing": the same for the guest key.
  - "the writer refuses a save it cannot read": stub `serializeSave`'s output through a port or a mountain with a field the reader refuses (a recipe id cast in by a test); a cloud write is not sent, `save.shape` is logged as an error, and the cloud keeps its copy.
  - `firebase-save.test.ts`: the adapter's reference paths are `games/{uid}` and `gameArchive/{uid}/copies` (read the constants or the mocked `doc` calls).
  - "the first open on this build starts fresh": storage holds a save at `dad-friendly-session` and a backup at `dad-friendly-phone-backup:{uid}`; the game opens on a fresh mountain and never touches those keys.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Build it.** The newer hold is one more block in `playBlock`. Ticks already stop when play is blocked; confirm with the test.
- [ ] **Step 4: `npm run gate -- fast`; `VISUAL_ONLY` of the update card's section; `npm run play` on a fresh save.**
- [ ] **Step 5: Commit** `The save's new home, and a newer save is read-only (#558)`.

### Task 4: An older save is set aside, and a fresh mountain keeps its stamp

**Files:**

- Modify: `src/cloud-save.ts` (`ARCHIVE_REASONS` gains `"reset"`; `CloudSave.archiveRaw?: ({ uid, raw, reason }) => Promise<CloudWriteResult>`; the memory cloud gains `olderDocs: Map<string, { rev; startedAt; raw }>` and records raw archives; `listCopies` skips what does not read `ok`), `src/firebase-save.ts` (`archiveRaw` adds the raw document to `gameArchive` with `archivedAt`, `expiresAt`, `reason`), `src/save-watch.ts` (an `older` guest save or phone backup moves its raw text to `{key}:v{version}`, then a fresh mountain), `src/save-load.ts` (an `older` cloud copy: hold the board, `archiveRaw` within `ARCHIVE_WAIT_MS` as `keepInPlay` does, then a fresh mountain written over it with `rev` = its rev + 1; a failed archive logs `save.archive` and keeps the hold), `src/save-choice.ts` (the wait-and-give-up helper is shared, not copied), `src/store-context.ts` (`ctx.blankReset`), `src/local-saves.ts` / `src/ledger-rows.ts` (homecomings cleared; `tonightLines` also starts after `save.set-aside`).

**Interfaces:**

- Consumes: Task 3's `older` results.
- Produces: `resetFresh(ctx, stamps: readonly number[]): void` in `src/save-load.ts`: a fresh mountain with `startedAt = max(stamps)`, `lastSeen` undefined, `ctx.blankReset = true`, homecomings cleared, `save.set-aside` recorded and logged with `{ source, version }`. `hasLocalProgress` ignores the run stamp while `ctx.blankReset`; any applied move or stones mined clear it.

- [ ] **Step 1: Write the failing tests** (new `src/save-reset.test.ts`):
  - "an older phone backup is set aside and the stamp kept": backup `{ version: 7, startedAt: 500, … }`; after open, its text sits at `dad-friendly-game-backup:{uid}:v7`, the game is a fresh mountain with `startedAt` 500, and `save.set-aside` is logged.
  - "an older cloud copy lands in the archive before the fresh mountain's first write": `olderDocs` holds rev 3, stamp 700; the archive gets the raw copy with reason `reset` first, then the cloud gets a fresh mountain at rev 4 with `startedAt` 700.
  - "a failed archive keeps the board held": `archiveGate.fail`; no cloud write, play blocked, `save.archive` logged.
  - "a device that played is ahead of one that reset to a blank mountain": device A resets (stamp 700, nothing mined); the cloud holds device B's version 8 copy, stamp 700, 50 stones mined; A adopts B's copy and never writes its blank one.
  - "a blank reset meets a cloud copy of this version that ties it": the cloud copy is kept.
  - "Tonight starts after a set-aside": `tonightLines` with a `save.set-aside` event shows only what came after.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Build it.**
- [ ] **Step 4: `npm run gate -- fast`.**
- [ ] **Step 5: Commit** `An older save is set aside and a fresh mountain keeps its run stamp (#558)`.

### Task 5: The rules check the envelope

**Files:**

- Modify: `firestore.rules` (new `games/{uid}` and `gameArchive/{uid}/copies/{id}`; `saves/{uid}` and `saveArchive/...` read-only; versions 1 to 7, `isValidMountain` and its helpers, `isValidGrid` and the long field comment go), `rules-test/firestore.rules.test.ts`, `src/rules-drift.test.ts` (envelope and field log only).

**Interfaces:**

- The game document: keys only `version, rev, savedAt, deviceId, deviceLabel, lastSeen, startedAt, game`; `version` int ≥ 8 and ≥ the stored one; `rev` == 1 on create, stored + 1 on update; `savedAt == request.time`; `deviceId` string 8..64; `deviceLabel` optional 1..40; `lastSeen` int ≥ 0; `startedAt` optional int ≥ 0 and ≥ the stored one; `game` is a map.
- The archive: keys only the envelope's plus `archivedAt, expiresAt, reason`; `version` int ≥ 8; `reason` in `conflict, restore, start-over, pass, reset`; the seven-day expiry as today; `rev` int ≥ 0; `deviceId` 8..64; `deviceLabel` optional 1..40; `savedAt` optional timestamp; `game` is a map.

- [ ] **Step 1: Rewrite the emulator tests first**: a full save from `serializeSave` (a late crew with engineers, trips, a bench and every clock) is accepted; a lower version is refused; an older run is refused; a rev that skips is refused; an unknown envelope key is refused; the old `saves/{uid}` takes no create and no update but is still readable; an archive copy with reason `reset` is accepted and one with reason `nope` is refused; the field log as today.
- [ ] **Step 2: `npm run test:rules` and see them fail.**
- [ ] **Step 3: Rewrite the rules.**
- [ ] **Step 4: `npm run test:rules`, `npx vitest run src/rules-drift.test.ts`.**
- [ ] **Step 5: Commit** `The rules check the envelope at the new home; the old path is read-only (#558)`.

### Task 6: Fixtures in the new shape, and the browser checks

**Files:**

- Modify: `tools/browser/fixtures.ts` (seeds become version 8 documents through one local `toDocument(seed)`; the old-version and `legacy` seeds become plain version 8 seeds), `tools/browser/fixtures.test.ts` (every fixture reads `ok` with the real `readSave`, and the real writer writes its mountain back as the same document), `tools/journeys/*` where a save is read.

- [ ] **Step 1: Write the fixture test first** and see it fail on the version 6 seeds.
- [ ] **Step 2: Convert the seeds.**
- [ ] **Step 3: `npx vitest run tools/browser/fixtures.test.ts`; `npm run visual`; `npm run journeys`; `npm run play` on a fresh game, then a reload, then a kill and reopen.**
- [ ] **Step 4: Commit** `The browser fixtures are version 8 saves (#558)`.

### Task 7: Docs and rules files

**Files:**

- Modify: `.claude/rules/observable-saves.md` (the rules check the envelope, the parser checks the game, the writer parses before it writes; the save line and launch paragraph gain a read-only save and a copy set aside), `.claude/rules/dad-friendly-work.md` (a sliver that resets says "Resets the save" in its issue and PR body first), `docs/ARCHITECTURE.md` (the save, its home, the four answers, resets), `docs/DESIGN.md` where it names a save field, this plan's Rulings.

- [ ] **Step 1: Write them.**
- [ ] **Step 2: `npm run gate -- fast`.**
- [ ] **Step 3: Commit** `Docs and rules say how the fresh save works (#558)`.

## Rulings

- **A guest on a full phone whose old save could not move aside is not saved on the phone that session.** The trigger is narrow (signed out, a full phone, an older guest save); the save line ends on the `save.error` set-aside line, and the next open tries the move again. Writing over the old text instead would lose the copy this reset promised to keep.
- **`lastSeen` reads as any finite number on the phone.** The tests play set-back and fractional clocks through the reader; the cloud rules still take only a whole number from 0, and the clock the game writes is one.
- **The ledger pins the finds a saved trip may carry** (`TRIP_FIND_IDS`): their kinds, relic ids, tools, keepsakes, engineer names and expedition recipes (Claude review finding).
- **Every writer reads back what it writes**, not only the cloud: the guest save and the phone backup go through the same `shapeRefused` (`save-shape.ts`), so a refused save never reaches the phone and the next open still plays. `save.shape` is recorded once until a save reads ok again (review finding).
- **The cloud field log still writes while a newer save holds play.** It is how a held phone is diagnosed, and it is not a save.
- **A set-aside retried in one watch is not doubled**: `settingAside` guards it per watch. A copy queued offline past the archive wait may still land twice on a later watch; a second raw copy in Saved copies is harmless.
- **A reset archive keeps the old document whole under `raw`.** The rules take that shape only for reason `reset`; the other reasons keep their v8 copy shape. The old document is never parsed, so nothing about v7 lives on in this build.
- **A reset never gives up a played copy of this version.** `resetFresh` keeps it in play and lifts its run stamp to the latest stamp set aside (the stamp only names the run, so the rules' run check holds); only an unplayed device starts a fresh mountain at that stamp, so a device that played stays ahead of one that reset to blank (review finding).
- **Set-aside is recorded as `save.set-aside` with `id: vN`.** A field event has no `version` key, and the ring stays as it is.
- **A failed move aside on the phone holds that key.** It records and logs `save.error` (source `set-aside`), and nothing this session writes or clears that key, so the old text stays where it was and the next open tries again (review finding).
- **`npm run play` gained `reload` and `reopen`**, so the done-when's reload and kill-and-reopen are seen in a real browser.
- **Seeds keep their authoring shape (a mountain and a workshop half), and `seedJson` converts them.** Old v4 seeds keep the depth they had on main (main deepened a v4 mountain from 100M on load), so each screen opens where it did.
- **Stale seeds and sections went.** `unknownBenchSave` and `staffingNoteSave` checked a v6 read that no longer exists; `crewV4Save` is now `boostedCrewSave`.
- **`parseMaterials`, `parseFinds` and `MAX_MATERIAL` went**, with the band constants only they used. The game map reader replaces them.
- **An older cloud copy is archived before the first write.** The fresh mountain writes at the old rev + 1, so the rules' rev check holds. A failed archive keeps the board held and shows the save error.
- **A right-typed value the build refuses reads as `newer`, not `bad`.** The existing parsers say no to an unknown name, post, tunnel or a count past a cap the same way; on well-typed data that is what a newer build would write. `bad` is kept for wrong types, negatives, broken numbers and a missing envelope.
- **The save line while read-only says "Loading your save..."**, with `save.newer` as its log. The update card says the rest. No new line of copy.
- **The field-log ring gets a new key too**, so Tonight in the Ledger starts empty after the fresh start; a later reset records `save.set-aside`, which Tonight starts after.
- **Fixtures are version 8 documents typed by the writer's own type**, made by one small local converter, and a test proves the real reader takes each one and the real writer writes it back the same. The browser scripts load the fixtures under Node's type stripping, which cannot load `src` modules, so the real writer cannot run there.
- **`levels` holds upgrade and recipe levels in one map**, and `clocks` holds boosts, craft timers and the Gold rush in one map: their ids do not clash, and a test says so.
