# The field log from dispatch events (A2, #413) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The field log records the events `applyMove` returns, and `noteChanges` and `noteCrew` (the mountain diffs in `progress-store.ts`) are deleted, with the same ring entries as today.

**Architecture:**

- `applyMove` in `src/economy/actions.ts` (the one way the game changes) returns `events` on `applied`: a closed `MoveEvent` union, derived from the move's kind, never from comparing two mountains field by field.
- `src/field-log.ts` (the module that owns the ring's codes) gains one pure mapping, `fieldEntry(event)`, from a `MoveEvent` to the ring's `{ code, data }`.
- The store's `commit` takes the events with the new mountain and records each through `fieldEntry`. The `applyMutation` test seam records no move events.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part A ("The field log records the returned events, and `noteChanges` and `noteCrew` are deleted"), and issue #413, whose "Done when" is binding: field-log tests pin the same entries as today, from events; no mountain diffing remains; `observable-saves` behaviour is unchanged.

## Global Constraints

- No player-visible change. No change to the save format, `firestore.rules`, the ring's codes, or their data keys and values.
- `observable-saves.md` applies unchanged. The save, emulator and cloud tests pass without edits.
- `DispatchResult` (the store's public `dispatch` result) stays as it is. **(Ruling)** The events stay inside the store until a caller needs them; adding them to `DispatchResult` would touch the board-control test fakes that #432 is editing in parallel.
- Out of scope: the store split (S1, #414). Trouble presses and fixes, `crew.staff`, relics, away reports, layers, crafts done, and homecomings keep their own `record` calls.
- Stay out of the board controls (`card-tap`, `board-keys`, `board-ready`, `board-save`, `board-skin`) and the CSS. In `docs/ARCHITECTURE.md`, edit only the State paragraph's `dispatch` lines and the `field-log` paragraph.
- **Ratchet:** delete `src/progress-store.ts#createProgressStore>noteCrew` from `scripts/complexity-ceilings.json`. Set `src/progress-store.ts#createProgressStore` in `scripts/function-ceilings.json` to its new exact line count (it comes down from 2196). No new entry in either list. New functions stay at 150 lines or under and complexity 15 or under (`npm run functions`).
- Coverage floors for `actions.ts`, `field-log.ts` and `progress-store.ts` in `vite.config.ts` are kept or raised.
- Commit messages are a plain sentence ending ` (#413)`, with the session's trailers.
- Verification ladder (`.claude/rules/dad-friendly-work.md`): the test file, then `npm run gate -- fast`, then `npm run play`, then the full gate once, by the controller, before the PR.

## Review Focus

1. Choosing a post for an engineer who is out on an expedition: one `expedition.recall`, plus `engineer.station` only when the new post is not the trip's `home`. Choosing the home post records the recall alone.
2. Recalling an engineer whose post is `tunnel` with no trip (the #409 fallback to camp): today that records `engineer.station` with `camp` and no recall. It must still.
3. A refused move (a buy the pocket can't pay, a station to the same post) records nothing.
4. A move while the session is not playing (loading, unreachable) records nothing.
5. Buying a boost that is already running records `boost.start` with the new end time.

Each has a test in Task 1 (the events) or Task 2 (the ring).

---

### Task 1: `applyMove` returns the move's events

**Files:**

- Modify: `src/economy/actions.ts` (`MoveResult`, `applyMove`, a new `moveEvents` helper)
- Test: `src/economy/actions.test.ts` (the `applyMove (#409)` describe)

**Interfaces:**

- Produces, exported from `src/economy/actions.ts`:

```ts
export type MoveEvent =
  | { readonly kind: "tierBought"; readonly id: TierId; readonly count: number }
  | {
      readonly kind: "upgradeBought";
      readonly id: UpgradeId;
      readonly level: number;
    }
  | {
      readonly kind: "boostStarted";
      readonly id: BoostId;
      readonly endsAt: number;
    }
  | { readonly kind: "craftStarted"; readonly recipe: RecipeId }
  | {
      readonly kind: "promoted";
      readonly name: EngineerName;
      readonly crew: number;
    }
  | {
      readonly kind: "sent";
      readonly name: EngineerName;
      readonly tunnel: TunnelId;
    }
  | {
      readonly kind: "recalled";
      readonly name: EngineerName;
      readonly tunnel: TunnelId;
    }
  | {
      readonly kind: "stationed";
      readonly name: EngineerName;
      readonly post: EngineerPost;
    }
  | { readonly kind: "veinTapped"; readonly stones: number };
```

- `MoveResult`'s `applied` arm gains `readonly events: readonly MoveEvent[]`. `refused` is unchanged. `applyAction` (the lab's move) ignores events.

The events per move kind, each read from `before` (the mountain the move saw), `next` (the applied mountain) and the move:

| Move                                                          | Events                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `buyTier`                                                     | `tierBought { id, count: owned(next, tier) }`                                        |
| `buyUpgrade`                                                  | `upgradeBought { id, level: upgradeLevel(next, id) }`                                |
| `buyBoost`                                                    | `boostStarted { id, endsAt: next.boosts[id] }`                                       |
| `craft`                                                       | `craftStarted { recipe }`                                                            |
| `promote`                                                     | `promoted { name: nextEngineerName(before engineers), crew: next.engineers.length }` |
| `send`                                                        | `sent { name: engineer at index in before, tunnel: move.tunnel }`                    |
| `recall`, `station`                                           | `crewEvents` below                                                                   |
| `tapVein`                                                     | `veinTapped { stones: gained }`                                                      |
| `dig`, `markSeen`, `markAllSeen`, `cancelCraft`, `fixTrouble` | none                                                                                 |

`crewEvents(before, next, index)` for `recall` and `station`: let `hand` be the engineer at `index` in `before`, `trip` their expedition in `before` (if any), and `landed` the engineer at `index` in `next`.

- If `trip` exists, emit `recalled { name, tunnel: trip.tunnel }` first.
- Then emit `stationed { name, post: landed.post }` when `landed.post !== (trip?.home ?? hand.post)` and `landed.post !== "tunnel"`.

This is the rule `noteCrew` applies today, keyed on the one engineer the move names.

- [ ] **Step 1: Write the failing tests** in the `applyMove (#409)` describe, using the file's `rich`, `broke`, `travelling` and `fresh` fixtures, with exact events (`toEqual`):
  - `"says what a buy, an upgrade, a boost and a craft did"`: `buyTier cart` on `rich` gives `[{ kind: "tierBought", id: "cart", count: rich.carts + 1 }]`. `buyUpgrade` gives its new level. `buyBoost` gives `endsAt` equal to the applied mountain's `boosts[id]`. `craft` gives `craftStarted` with the recipe.
  - `"names the promoted engineer and the crew size"`.
  - `"says who left for which tunnel"`: `send`.
  - `"recalls a party without stationing them, and a station from a tunnel recalls first"`: `recall` on `travelling` gives `[recalled]` only. `station` to a post other than the trip's `home` gives `[recalled, stationed]` in that order. `station` to the trip's `home` gives `[recalled]` only.
  - `"stations a tunnel post with no trip back at camp"`: an engineer with `post: "tunnel"` and no expedition, `recall` gives `[{ kind: "stationed", name, post: "camp" }]`.
  - `"says what a vein tap gave, and nothing for a dig, a seen mark or a cancelled craft"`: `tapVein` gives `[{ kind: "veinTapped", stones: result.gained }]`; `dig` and `markSeen` give `[]`.
  - `"buys a boost again while one runs, with the new end"`: a second `buyBoost` on the applied mountain (pocket topped up) gives the later `endsAt`.
  - Existing `toEqual({ kind: "refused" })` assertions stay as they are: refused moves carry no events.

- [ ] **Step 2: Run** `npx vitest run src/economy/actions.test.ts`. Expected: the new tests FAIL (`events` is undefined).

- [ ] **Step 3: Implement** `moveEvents(before: Mountain, next: Mountain, move: Move): readonly MoveEvent[]` and `crewEvents(before, next, index)` in `src/economy/actions.ts`. `applyMove` calls `moveEvents` only on the applied path. Use a `switch` on `move.kind` with the exhaustiveness guard the file already uses. Keep each function at complexity 15 or under; split the `switch` arms into small helpers if needed.

- [ ] **Step 4: Run** `npx vitest run src/economy/actions.test.ts`, then `npm run gate -- fast`. Expected: PASS, no FAIL lines.

- [ ] **Step 5: Commit** `git commit -m "applyMove says what each move did, as typed events (#413)"`.

### Task 2: The store records the events, and the mountain diffs go

**Files:**

- Modify: `src/field-log.ts` (new `fieldEntry`)
- Modify: `src/progress-store.ts` (`commit`, `dispatchMove`, `applyMutation`; delete `noteChanges` and `noteCrew` and the imports only they used)
- Modify: `scripts/function-ceilings.json`, `scripts/complexity-ceilings.json`
- Modify: `docs/ARCHITECTURE.md` (the State `dispatch` lines and the `field-log` paragraph)
- Test: `src/field-log.test.ts`, `src/progress-store.test.ts`

**Interfaces:**

- Consumes: `MoveEvent` and `MoveResult.events` from Task 1.
- Produces: `export function fieldEntry(event: MoveEvent): Omit<FieldEvent, "at">` in `src/field-log.ts`, with these exact codes and data (today's):

| Event           | `code`              | `data`                                           |
| --------------- | ------------------- | ------------------------------------------------ |
| `tierBought`    | `tier.buy`          | `{ id, count }`                                  |
| `upgradeBought` | `upgrade.buy`       | `{ id, count: level }`                           |
| `boostStarted`  | `boost.start`       | `{ id, endsAt: new Date(endsAt).toISOString() }` |
| `craftStarted`  | `craft.start`       | `{ id: recipe }`                                 |
| `promoted`      | `engineer.promote`  | `{ id: name, count: crew }`                      |
| `sent`          | `expedition.send`   | `{ id: name, source: tunnel }`                   |
| `recalled`      | `expedition.recall` | `{ id: name, source: tunnel }`                   |
| `stationed`     | `engineer.station`  | `{ id: name, source: post }`                     |
| `veinTapped`    | `vein.tap`          | `{ stones }`                                     |

- Store internals: `commit` takes `update: (mountain: Mountain) => { readonly mountain: Mountain; readonly events: readonly MoveEvent[] }` and drops its `note` parameter. After the mountain changes, it records each event with `record(entry.code, entry.data)` where `entry = fieldEntry(event)`, in order, where `noteChanges`, `noteCrew` and the `vein.tap` line ran. `dispatchMove` passes `applyMove`'s events (none when refused). `applyMutation` becomes `(update: (mountain: Mountain) => Mountain) => void` and commits with `events: []`.

- [ ] **Step 1: Turn the store's field-log tests into dispatch tests (characterization).** In `src/progress-store.test.ts`, every test that asserts a ring entry produced by a move (the `tier.buy`, `upgrade.buy`, `boost.start`, `vein.tap`, `craft.start`, `engineer.promote`, `engineer.station`, `expedition.send` and `expedition.recall` assertions, including "copies the newest 50 events" and "keeps the ring in memory") makes that move with `progress.dispatch({ kind: ... })` instead of `applyMutation(rule function)`. `applyMutation` stays only to set up state (pocket, carts, engineers, expeditions). Keep every expected code and data value exactly as today. Replace "does not record a boost whose end time did not change" with `"records nothing for a refused move"`: a `buyBoost` with an empty pocket and a `station` to the same post leave the ring unchanged. Add `"records nothing for a move while the session is not playing"` beside the existing not-playing dispatch test.

- [ ] **Step 2: Run** `npx vitest run src/progress-store.test.ts`. Expected: PASS on today's code. That is the characterization: the diffs and the events must agree.

- [ ] **Step 3: Write the failing tests.**
  - `src/field-log.test.ts`: `"maps each move event to today's ring entry"`, one `toEqual` per row of the table above.
  - `src/progress-store.test.ts`: `"records no move events for the applyMutation seam"`: `applyMutation((m) => buyTier({ ...m, pocket: firstWorker }, "helper"))` leaves `fieldLog().events` empty.

- [ ] **Step 4: Run** both test files. Expected: the `fieldEntry` test fails (not exported), and the seam test fails (the diff still records `tier.buy`).

- [ ] **Step 5: Implement** `fieldEntry` in `src/field-log.ts` (a `switch` with the exhaustiveness guard), and the store changes in the Interfaces block. Delete `noteChanges`, `noteCrew`, the `note` parameter, and any import left unused. No `TIERS`, `UPGRADES` or `BOOSTS` loop and no before/after engineer or expedition map remains in `progress-store.ts`.

- [ ] **Step 6: Ratchet.** Delete the `noteCrew` complexity entry. Run `node scripts/function-ratchet.mjs --print lines` and set `createProgressStore`'s ceiling to the printed count.

- [ ] **Step 7: Docs.** In `docs/ARCHITECTURE.md`: the State paragraph says `applyMove` returns the move's typed events and `dispatch` records them in the field log, and `applyMutation` records none. The `field-log` paragraph says the ring's move entries come from those events through `fieldEntry`. No other paragraph changes.

- [ ] **Step 8: Run** `npx vitest run src/field-log.test.ts src/progress-store.test.ts`, then `npm run gate -- fast`. Expected: PASS, no FAIL lines. Then `grep -n "noteChanges\|noteCrew" -r src` prints nothing.

- [ ] **Step 9: Prove it in the browser.** `npm run play` on a save with a cart to buy (see `npm run play -- --help`): buy it, open the menu's field-log copy, and check `log.txt` shows no page error and the save line is unchanged.

- [ ] **Step 10: Commit** `git commit -m "The field log records dispatch events, and the mountain diffs are deleted (#413)"`.
