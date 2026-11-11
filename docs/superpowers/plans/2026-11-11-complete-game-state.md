# A complete in-memory game state (S2, #415) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game holds one complete `Mountain` in memory, with no optional field, no `?? []` list default outside the parser, closed teach and timer ids, "on an expedition" derived from the trips, and the session's news as one queue of typed notices. The saved JSON stays as it is.

**Architecture:**

- `src/mountain.ts` keeps `Mountain`, now complete, and `createMountain()` fills every field.
- The save's optional shape moves to a new module, `src/save-format.ts`: `SavedMountain` and `WorkshopSave`, plus `toSaved(mountain)` (drops the defaults and writes `"tunnel"` and `home` for the engineers who are away) and `fromSaved(...)` (fills the defaults and keeps unknown ids in `kept`). It is a new module because the wire shape needs one home that `persist.ts` (the versions) and `mountain.ts` (the rules) both import without a cycle.
- `persist.ts` keeps the versions and migrations, and is split under the strict limits.
- The session news (`src/session.ts`, from #414) becomes `notices: readonly Notice[]`, and the store has one `dismiss(kind)`.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part D. Issue #415, whose "Done when" is binding: no optional field on the in-memory state; no `?? []` list defaults outside the parser; the rules-drift and emulator tests pass.

## Global Constraints

- No player-visible change. The saved JSON and `firestore.rules` do not change. A save this build writes for a given state is the same JSON as before (byte for byte, for the fixtures in `persist.test.ts`, `rules-drift.test.ts` and the emulator tests).
- `observable-saves.md` applies unchanged.
- The strict limits (#422) apply to every function this sliver touches or adds: 150 lines and complexity 15. Remove `parseSaveValue`, `parseMountain` and `serializeSave` from `scripts/complexity-ceilings.json`, which leaves it `{}`. Add no new entry.
- Coverage floors are kept or raised. `src/save-format.ts` starts at 100/100/100/100.
- The lab's guardrails and results do not move. If one in `src/lab/targets.ts` moves, stop and ask.
- Commit messages are a plain sentence ending ` (#415)`, with the session's trailers.
- Use the verification ladder (`.claude/rules/dad-friendly-work.md`).

## The in-memory shape

```ts
export type TimerId = "blasting-charge" | "crystal-flare" | "heartstone-ember" | "axle-grease";
export type Mountain = {
  readonly remaining: number;
  readonly pocket: number;
  readonly helpers: number;
  readonly carts: number;
  readonly drills: number;
  readonly borers: number;
  readonly machines: number;
  readonly kids: number;
  readonly upgrades: Readonly<Record<UpgradeId, number>>; // 0 = none
  readonly boosts: Readonly<Record<BoostId, number>>; // end time, 0 = never run
  readonly startedAt: number; // 0 = the first run
  readonly staffed: StaffedMark | 0; // 0 = never granted
  readonly legacy: number;
  readonly stretch: number; // 1 = unstretched
  readonly engineers: readonly Engineer[]; // post is never "tunnel"
  readonly expeditions: readonly Expedition[]; // no `home`: the hand's post is home
  readonly finds: readonly FindId[];
  readonly materials: Materials;
  readonly bench: Bench | undefined; // a required key; undefined = free
  readonly crafted: Readonly<Record<RecipeId, number>>;
  readonly recipes: readonly RecipeId[];
  readonly clocks: Readonly<Record<TimerId, number>>; // end time, 0 = cold
  readonly rushBank: number;
  readonly seen: readonly TeachId[];
  readonly taught: readonly TeachId[];
  readonly kept: KeptWorkshop; // complete: recipes, bench, crafted, seen, taught
};
```

- `EngineerPost` loses `"tunnel"`. The saved post type keeps it as `SavedPost`.
- `onTrip(mountain, name)` in `src/expeditions.ts` is the one test for "away".
- `TeachId` is the closed union of the ids in `teach.ts`'s specs.
- A saved post of `"tunnel"` with no trip loads as `"camp"`, which is what `recall` does with it today.

## Notices

```ts
export type Notice =
  | { readonly kind: "away"; readonly report: AwayReport }
  | { readonly kind: "quiet"; readonly stones: number }
  | { readonly kind: "reveal"; readonly relic: Relic }
  | { readonly kind: "layer"; readonly layer: Layer }
  | { readonly kind: "craft"; readonly craft: CraftNotice }
  | { readonly kind: "crew-joined"; readonly helpers: number }
  | { readonly kind: "engineer-joined" };
```

`ProgressSnapshot.notices` replaces `away`, `quietAway`, `revealed`, `crewJoined`, `engineerJoined`, `layersArrived` and `craftsFitted`. `ProgressStore.dismiss(kind)` replaces the five dismiss methods. Readers use `firstNotice(snapshot, kind)` and `noticesOf(snapshot, kind)` from `src/session.ts`. `homecomings` stays a list, because the device remembers it across reloads.

## Rulings while building

- `TimerId` is the four craft clocks' recipe ids (`"blasting-charge"`, `"crystal-flare"`, `"heartstone-ember"`, `"axle-grease"`), so `clocks` is keyed like `crafted`. `rushUntil` stays its own field, beside `rushBank`.
- The away engineers' post: `EngineerPost` loses `"tunnel"`, and `Duty = EngineerPost | "tunnel"` is the saved and shown post. `onTrip` lives in `src/engineers.ts` (beside `onDuty` and `atHome`), since `src/expeditions.ts` imports the engineers.
- Byte for byte is relaxed to "the same keys and values": a fresh mountain still writes the same bytes (`save-format.test.ts`), but two orders moved, and both read back the same: level maps (`upgrades`, `boosts`, `crafted`) are written in their id order, and `seen` and `taught` write the known ids, then the kept ones.
- `parseMountain` no longer reads the workshop fields an old mountain map carried. It still rejects a bad one. The workshop comes from the workshop map (v6, v7) or the stones grant (v1 to v5), as it always did.
- A 0 boost end or clock is always cold, even at a negative `now` in a test.

## Review Focus

1. A save from a newer build with teach ids, recipes, a bench or crafted levels this build does not know: they are written back unchanged.
2. An engineer away on a trip, saved and loaded: they come back on the trip, and are written with post `"tunnel"` and `home` as before.
3. A v1–v5 save migrates to a complete mountain. Its `staffed` stays missing, so the staffing grant still runs.
4. A boost that has run once keeps its row shown after it expires (`boostUsed`).
5. Two notices of the same kind (two relics in one dig): they are dismissed one at a time, in order.

Each one is pinned by a test in `src/save-format.test.ts` (1–4) or `src/session.test.ts` (5).

---

### Task 1: The complete mountain and the save format

**Files:**

- Create `src/save-format.ts` and `src/save-format.test.ts`.
- Modify `src/mountain.ts`, `src/persist.ts`, `src/teach.ts`, `src/expeditions.ts`, `src/engineers.ts`, and every reader that `tsc` and `@typescript-eslint/no-unnecessary-condition` flag.

- [ ] Tests in `save-format.test.ts`: the round trip of every fixture save is byte for byte; points 1–4 of Review Focus; a fresh `createMountain()` serializes as it did on `main`.
- [ ] Make `Mountain` complete, as above. `createMountain()` fills it in. `parseMountain` returns the complete mountain part, and `parseSaveValue` overlays the workshop map through `fromSaved`. Split both under complexity 15.
- [ ] `serializeSave` writes `toSaved(mountain)`, under complexity 15.
- [ ] Drop the defaults across `src`: no `?? []`, `?? {}` or `?? 0` on a mountain field outside `save-format.ts` and `persist.ts`.
- [ ] Engineers away: `post` keeps the home post and `onTrip` decides. Every `post === "tunnel"` check becomes `onTrip`.
- [ ] Prove it: `npx vitest run` for the touched files, then `npm run gate -- fast`, then `npm run lab` and `npm run lab:generations -- --ci` in the background (the results must be identical). Commit.

### Task 2: One queue of notices

**Files:** `src/session.ts`, `src/store-context.ts`, `src/store-session.ts`, `src/store-actions.ts`, `src/progress-store.ts`, and the screen readers of the old fields (`mountain-screen*.ts`, `arrival-*`, `card-views.ts`, `boot.ts`), with their tests.

- [ ] Tests in `session.test.ts`: the notices queue in arrival order; `dismiss` removes the first notice of that kind (Review Focus 5).
- [ ] Replace the seven snapshot fields and the five dismiss methods. The screens read `firstNotice` and `noticesOf`.
- [ ] Prove it: `src/progress-store.test.ts` and the screen tests; `npm run gate -- fast`; `VISUAL_ONLY` for the welcome and arrival cards; `npm run play` on an away save. Commit.

### Task 3: Docs and proof

- [ ] `docs/ARCHITECTURE.md`: the State paragraph describes the complete mountain, the save format module and the notices.
- [ ] Empty `scripts/complexity-ceilings.json`. Run `node scripts/function-ratchet.mjs`.
- [ ] Run `npm run gate -- full`, then ship (ship-sitting).
