# Counts by id (#559, M16-8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the game state holds `owned`, one complete record from tier id to count, in place of eight named fields, and every record keyed by machine is built from the tier table.

**Architecture:** the tier table (`src/tiers.ts`) is the one list of things he can own. Its ids become the `TierId` union (`as const`), a machine row carries its stage, and the zero records (`Staffing`, the running and speed records) are built from the rows. `Mountain.owned` replaces `helpers` … `kids`; `owned(mountain, tier)` and `buyTier` read and write it. The save already stores `owned` (#558), so the reader and writer stop translating.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-fresh-save-content-rows-design.md`, section D, and its anti-goals.

## Global Constraints

- Nothing he sees changes. The pacing ledger does not move, both labs print the same rows as `main`, and the visual check passes with no shot updated.
- No two shapes side by side: the named fields, `CrewField`, the row's `field` and `MACHINE_STAGE` go in this PR.
- Ids stay a closed union, taken from the table. A typo is a type error.
- `effectiveRates` is the labs' hot path: one lab job is timed against `main` and is no slower.
- The game state has no optional fields.

## Review Focus

1. A spread that writes a count (`{ ...mountain, carts: n }`) must become `owned: { ...mountain.owned, cart: n }`; a spread that loses the other counts is a silent bug. The labs' unchanged rows and the ledger catch it.
2. The save round-trip: the reader hands `owned` through, the writer writes it, and a count above the cap still reads as `newer`.
3. The field log: crew and idle by id, for every tier, and the rules accept them without naming ids.
4. Hot-path cost: `owned[tier.id]` in place of `mountain[tier.field]` in `effectiveRates` and its cache key.
5. The line's stage of each machine reads from its row, and `stageOf` still says "none" for the hands.

## Tasks

### Task 1: The table makes the ids, and a machine row says its stage

**Files:** `src/tiers.ts`, `src/line.ts`, `src/staffing.ts`, `src/rates.ts`; tests `src/tiers.test.ts`, `src/line.test.ts`.

- `TIERS` is declared `as const satisfies` its row type; `TierId` is the union of its ids. A machine row has `stage: Stage` (the type stays in `src/line.ts`, imported as a type). The hands' rows have no stage.
- `MACHINE_STAGE` goes. `stageOf(id)` reads the row. `stageSpeeds` walks the machine rows.
- `machineRecord(value)` / `tierRecord(value)` in `src/tiers.ts` build a complete record over the machine or tier ids. `NONE_RUNNING` and every zero record keyed by machine or tier in non-test `src` use them.
- Tests: every machine row has a stage and the hands none; `machineRecord(0)` has exactly the machine ids; `stageOf` as before.

### Task 2: `owned` in the game state

**Files:** `src/mountain.ts`, `src/tiers.ts`, `src/save-format.ts`, `src/save-load.ts`, every non-test reader of the named fields (the compiler lists them), `src/test-fixtures.ts` and the tests.

- `Mountain.owned: Readonly<Record<TierId, number>>`; `EMPTY_MOUNTAIN.owned` is `tierRecord(0)`. `owned(mountain, tier)` reads it; `buyTier` adds one to `owned[id]`. The row's `field` and `CrewField` go.
- The save reader puts the read counts on `owned`; the writer writes `mountain.owned`. `crewCounts` and the save's own field union go.
- A test helper `withOwned(mountain, counts)` in `src/test-fixtures.ts` sets counts in tests.
- Tests: `buyTier` adds to `owned` and leaves the other counts; the save round-trip keeps `owned`.

### Task 3: The field log by id

**Files:** `src/field-log.ts`, `firestore.rules`, `src/field-log.test.ts`, the rules test.

- `crew` is every tier's count and `idle` every machine's idle count, both by id (the line's machines included). The rules check each is a map of at most 16 entries and stop listing ids.
- Tests: the snapshot has every tier id; the rules accept a log with the hoist and the pit train.

### Task 4: Docs and proof

- `docs/ARCHITECTURE.md` (the tier table, the game state's counts, the field log), `docs/DESIGN.md` where it names a field.
- Prove with the ladder in `.claude/rules/dad-friendly-work.md`: the test files, `npm run gate -- fast`, the visual check with no shot updated, `npm run lab -- --ci --ledger check`, and one lab job timed against `main`; then the full gate once on the final commit.
