# One way to change the game, one home for each rule: architecture spec (9 Nov 2026)

Status: draft for Flemming's approval. It covers several slivers. It ships on its own PR for #405 under the parent issue #404. Each later sitting plans and builds one sliver from it, with no new brainstorm (`.claude/rules/superpowers.md`). Flemming asked for it to be written straight from the design audit (B5 sitting, 9 Nov). The calls marked **(my call)** are mine, for him to check.

## Why

B5 took about 8 hours. The root-cause work and a fresh design audit agree on why: the game rules are well built, and almost everything around them is not.

- **Two closures absorb every feature.**
  - `createProgressStore` is 2,203 lines with 40 mutable variables. It grew from 298 lines over 11 feature PRs, and it owns the time step, game rules, session news and all persistence.
  - `mountMountainScreen` is 1,146 lines with 47 imports. It regrew to 1,283 after a split had brought it down to about 460.
- **There is no player action.**
  - The UI changes the game through `applyMutation((m) => m)`, then counts things before and after to learn whether a buy happened (4 sites).
  - The store diffs two mountains to work out what to log, and the screen wraps the store in a `Proxy` to learn who changed it.
  - The UI and the strategy lab apply slightly different rules for the same move (recall to camp, the staffing teach mark, layer recipe grants). So the lab's guardrails measure a slightly different game.
- **Screen behaviour rules have no home.**
  - The 400ms settle is enforced in 5 places with 3 behaviours. The Done hold has 2 implementations, the freeze-while-open rule 2 different mechanisms, and the buy-tap pipeline 3 copies.
  - Open and covered state is read back from DOM classes, and 47 timers run on the real clock.
  - So the rules can only be proven in a real browser, slowly, late and with flakes. Each new drawer rediscovers them: B5 found the same bug class in 5 tasks.
- **The browser script became the main behaviour test.** `scripts/visual-check.mjs` went from 316 to 7,133 lines, about 1,000 per board sliver. It has 29 real-time sleeps and retry loops.
- **The in-memory game state carries the save format's gaps.** 21 of 29 `Mountain` fields are optional (`.engineers ??` alone appears 55 times). "On an expedition" is stored twice, and the UI patches the contradiction. Teach ids are plain strings.

The audit is `docs/superpowers/specs/2026-11-09-design-audit.md`, a snapshot at `ce2a779`. Its findings are cited here by file and line where they decide something.

## Goals

1. **One way to change the game.**
   - Every move the player makes is a typed `Action`, applied by one function shared by the game and the lab.
   - The result says what happened: `applied` with its events, or `refused` with a reason.
   - The UI, the field log and the lab read meaning from that result, never by diffing state.
2. **One home for each screen rule.** The settle after opening, the Done hold, the blink on a dear tap, freezing rows while a drawer is open, and the thanks after a fix each live once, in a pure board interaction model on a clock the tests control. Every row, bay, key, plate and Back uses it.
3. **Rules proven fast.** Tap, hold, settle and freeze rules are proven by unit tests in milliseconds. The real browser checks only what a browser can see: layout, no scroll, contrast, 2× art and font fit.
4. **A browser check that grows by table rows.** One typed harness and fixture module shared by the browser scripts, with per-component checks as scenario × screen-size tables. A new screen part adds rows, not 1,000 lines.
5. **One time step.** The game and the lab advance the world through the same pure `step`. The store becomes a thin service that runs that step's effects (cloud write, phone backup, field log) and keeps its write state as one discriminated union.
6. **A complete game state.** Optional fields stay only in the versioned save format. Parsing returns a complete state; "on an expedition" is derived, not stored; teach and timer ids are closed unions; session news is one queue of typed notices.
7. **It doesn't grow back.**
   - A function-length ratchet in the gate: today's large functions have ceilings that can only go down, and new code gets a limit.
   - Plans name the shared module a new behaviour goes into.
   - The final review checks for copies of existing mechanisms across the codebase, not only within the diff.

## Non-goals

- No change to how the game plays, its numbers, its look or its sound, except the named fixes below.
- No change to the save format or `firestore.rules`. Normalizing happens at the parse boundary, and the saved JSON stays as it is.
- No framework, game engine, state library, or any new dependency. Plain TypeScript, as today.
- No rewrite of the pure rules layer (`scale`, `mountain`, `tiers`, `rates` and the rest), which the audit found sound.
- No change to the browser checks for layout, contrast, art and fit beyond moving them onto the shared harness.
- No new player-facing features. #357, #358 and the M14 economy work keep their own issues.

## Anti-goals

These would make it a failure even if it works:

- **A behaviour change nobody asked for.** Any difference a player could notice, other than the named fixes, is a defect.
- **A big-bang rewrite**, or a sliver that leaves two homes for one rule. Each sliver deletes what it replaces, in the same PR.
- **An abstraction with one user.** The interaction model exists because 4+ controls share each rule; an Action exists because 3 callers need it.
- **Slower verification.** No sliver may add real-time sleeps or retries to the browser checks.
- **A lab that silently changes.** If unifying UI and lab rules moves a guardrail in `src/lab/targets.ts`, that's a stop for Flemming, not a ruling.

## The named behaviour fixes

These are the only player-visible changes. Each is a bug today.

1. **A double tap on "Back to the board" no longer opens the key under it.** After a finger closes a drawer, a finger click on whatever is under it is ignored for the settle (B5 review, I1).
2. **The Done hold is judged by when the finger came down**, like the settle already is (B5 ruling).
3. **The UI and the lab apply the same rule for recall, staffing teach marks and layer recipe grants.** The UI's behaviour wins, since it's what players experience, and the lab adopts it **(my call)**.

## Design

### A. Actions: one way to change the game

- `src/economy/actions.ts` keeps `Action` and `applyAction`. They become the only way the game changes.
  - The union grows to cover every UI move it lacks today: a dig by hand, a vein tap, a trouble press and fix, the seen and teach marks the UI applies today, and any other `applyMutation` call site (18 in 5 files). Each becomes a kind.
  - Moves that only touch the session, such as dismissing a card or playing here, stay store methods for now and move with C below.
- A new `dispatch(action)` on the store replaces `applyMutation`. It returns a discriminated result:
  - `{ kind: "applied"; events }`, where `events` is a typed list (bought, fixed, mined, crafted and the rest);
  - or `{ kind: "refused"; reason }`, where the reason is a typed union (too dear, short of workers, locked, holding).
- What comes out:
  - The UI shows Done, the blink, the thanks or the kick from the result, with no count diffs.
  - The field log records the returned events, and `noteChanges` and `noteCrew` are deleted.
  - The `Proxy` in the screen is deleted.
- Teach marks, recipe grants and the recall camp fallback move inside `applyAction`, so the lab plays the same game. `buyWithTeach` and `grantDepthRecipe`'s compensation go away.
- Builder's choice: event names, and whether `applyAction` returns `{ mountain, events }` or `dispatch` derives events. One place decides either way.

### B. The board interaction model: one home for each screen rule

- A pure module (suggested name `src/board-interaction.ts`) owns the screen's interaction state and decisions.
  - **Inputs:** timestamped events, each carrying the press time (when the finger came down, from `event.timeStamp`, as B5's `settlingFor` does), the target control's id, and whether it was a finger or the keyboard. Plus open and close requests, ticks, and dispatch results.
  - **State:** which overlay is open or opening or closing (drawers, cards, the how cards, notes), which control is holding Done or settling, and what is frozen in each open drawer (order, visibility, chip row count).
  - **Outputs:**
    - for each press, a decision: act, ignore-early, ignore-held or blink;
    - view state for the painters: what is open, held, blinking, frozen and lit;
    - timer requests as data ("wake me at t").
- The model runs on an injected clock. The real clock lives in exactly one place, the composition root.
- One shared **control behaviour** (tap, settle, hold, blink) is used by every row, bay, key, plate and Back, and press feedback ("is down") is one mechanism.
- DOM modules (`board-drawer`, `board-row`, `board-keys`, `board-ready`, `board-bays`, the panels) become painters of the model's view state, and read no state back from DOM classes.
  - The hand-rolled copies are deleted: the settle judges in `board-drawer.ts` and `card-tap.ts`, the holds in `board-row.ts` and `board-ready.ts`, the two freeze mechanisms, the two thanks timers, and the 9 DOM helper copies (in favour of `board-dom.ts`).
- The screen gets one render path, replacing today's `render()` and the 1s tick's separate list. Which card covers which, and when the New sign may show, comes from the model instead of `querySelector`.
- **Proof:** the rules are unit-tested on the model with a fake clock. That includes a seeded random-sequence test (hand-written generator, no new dependency **(my call)**) asserting the invariants for any sequence of presses and times:
  - at most one buy per double tap;
  - no row moves while its drawer is open;
  - nothing acts inside a settle or a hold.

### C. One time step and a thin store

- Pure core (suggested `src/session.ts`): `step(session, input, now) → { session, effects }`.
  - The input is a tick, an action, a cloud snapshot, or a visibility change.
  - The session holds the game state, hazards, the notice queue and the baselines.
  - Effects are data: write the phone backup, write to the cloud, log an event, show a notice.
- `src/lab/world.ts` uses the same `step`, so the lab and the game advance the world identically: expedition settle, accrue and hazards in one order, plus the live-versus-away gap and the clock-back rule.
- `createProgressStore` becomes a sync service that runs the effects through today's ports (`CloudSave`, phone backup, field log, `TabWriter`).
  - Its write state becomes one discriminated union, replacing about 13 loose variables (`cloudFlight`, `cloudDirty`, `resumeHold` and the rest).
  - The store stops importing screen modules (`screen-words`, `workshop-sheet`), restoring "imports point down". The layout preview hooks (`previewTrouble`, `previewConflict`) move to a test-only seam.
- `docs/observable-saves` behaviour is unchanged: the same save line, log codes, backup timing and launch rule. The emulator and save tests must pass unchanged.

### D. A complete game state

- `parseSaveValue` returns a complete `GameState`: empty lists, zero levels, no optional fields. The optional shape stays only in the versioned save type that is written and read. `rules-drift.test.ts` keeps guarding the saved fields.
- "On an expedition" is derived from `expeditions`, and the `"tunnel"` post goes from the in-memory model. Only the save keeps it, if old saves need it.
- Teach and seen ids become a closed union. The four `…Until` craft clocks become one `Record<TimerId, number>` in memory, while the saved fields stay as they are.
- Session news becomes one queue of a discriminated `Notice` union with a single `dismiss`, replacing 8 optional snapshot fields and 5 dismiss methods.

### E. The browser check grows by rows

- One typed harness module shared by `visual-check`, `ui-audit`, `play` and `mockup-check`: the server, Chrome, `open`, `press`, a page clock the check controls, and the save fixtures. It replaces the four copies, the untyped `fixtures.mjs` and the six inline builders.
- Per-component check modules (`scripts/visual/*.mjs` or `.ts`, **builder's choice**), each a table of scenario × screen size × expectation. `visual-check.mjs` becomes a runner.
- Tap, hold, settle and freeze checks leave the browser once B proves them. What stays is one wiring check per control family: a real tap reaches the model, and the model's decision is painted, on the controlled page clock with no sleeps.
- New checks never use fixed sleeps; they wait on page events or the controlled clock.

### F. It doesn't grow back

- **A function-length ratchet in the gate (my call on the mechanism):** a script like `token-check` fails any function over 150 lines that isn't in a ceiling list. Each existing large function is in the list at its current length, and the gate fails if one grows past its ceiling. A PR that shrinks one lowers its ceiling in the same PR. The list starts with the 14 functions of 200 lines or more from the audit.
- **`.claude/rules/superpowers.md`:** a plan names the shared module each new behaviour goes into, or says why it needs a new one.
- **Reviews:** the final whole-branch review prompt (in the ship-sitting skill) asks for copies of existing mechanisms across the codebase, not only within the diff.
- **Comments and docs describe the code as it is,** not a changelog. New code doesn't add "until B7" or issue-number history to comments. ARCHITECTURE.md is corrected where the audit found it stale (the screen "~460 lines", the long single-line paragraphs).

## Slivers, in order

Each sliver is one sitting and one PR, keeps the game booting with every gate green, and deletes what it replaces. The order, with what each one is blocked by:

1. **G: the ratchet and the rules** (F). Blocked by nothing. It's first so nothing grows while the rest lands.
2. **A1: actions and dispatch** (A, without the field-log change). The UI's 18 `applyMutation` sites move to `dispatch`; the Proxy and the count diffs go; the three UI/lab divergences are unified (named fix 3). Blocked by G.
3. **I1: the board interaction model** (B, the pure module and its tests only, wired to nothing yet). Blocked by A1, since it consumes dispatch results.
4. **I2: Buys and Upgrades onto the model.** The drawers, their rows, the keys and Back move onto it, along with the Ready plate and the bays (named fixes 1 and 2). The hand-rolled copies go, and the screen gets one render path for these parts. Their tap checks move from the browser to I1's unit tests, leaving one wiring check each. Blocked by I1.
5. **H: the shared browser harness** (E). The sections stay as they are, moved onto the harness, then converted to tables. Blocked by I2, so it converts the checks once, after they've shrunk.
6. **B6–B8 (#374–#376)** continue on the model and the harness. B6's Workshop and Engineers drawers are the model's next users and add browser checks as table rows. Blocked by H.
7. **A2: the field log from events** (the rest of A). Blocked by A1. It can run any time after A1; placed here so the UI work isn't delayed.
8. **S1: one time step and a thin store** (C). Blocked by A2 and #368's end (B8), so the store doesn't move under the UI work.
9. **S2: a complete game state** (D). Blocked by S1.

**(My call)** I2 may split into "drawers and rows" and "keys, plate and bays" if its plan runs over one sitting. B6 is blocked only by the first half.

## Measures of done

Every sliver has to show the measure that applies to it in its PR:

- **After A1:** no `applyMutation` call site in non-test `src`, no `Proxy` in the screen, and no success worked out by a count diff. Lab guardrails are unchanged, or a stop was raised.
- **After I2:** one settle judge, one hold and one freeze in non-test `src`, found by grep. No `classList.contains` decision reads in the board modules. Zero fixed sleeps and zero retry loops in the drawer and rail browser checks. `mountMountainScreen` is under 600 lines on its way down.
- **After H:** one harness module, with no `createServer`, Chrome-path or `open()` copies in the scripts. B6's browser checks add under 250 lines.
- **After S1:** `createProgressStore` is under 500 lines, and the lab's `World` uses the shared `step`. Save, emulator and cloud tests pass unchanged.
- **After S2:** no optional field on the in-memory game state, and no `?? []` default for its lists outside the parser.
- **Throughout:** the function-length ratchet only goes down, coverage floors are kept or raised, and the full gate runs once per sliver before its PR.

## Constraints

- Strict TypeScript and lint as today. Illegal states are made unrepresentable with discriminated unions (`dad-friendly-work.md`).
- TDD for every behaviour, and characterization tests first where existing behaviour moves. The existing screen tests are kept passing until a sliver replaces what they pin with tests on the new module.
- `observable-saves.md` applies unchanged to every sliver that touches the store.
- The verification ladder in `dad-friendly-work.md`, and the three stops in `superpowers.md`. A guardrail limit moving in `src/lab/targets.ts` is a stop.
- No new dependencies.

## Left to the builder

- Module and type names beyond the suggestions above, and file layout inside `src/`.
- The event and refusal vocabularies, as long as each is a closed union.
- Exactly how the painters subscribe to the model's view state, as long as there's one render path.
- The check module format for E, `.mjs` or typed.
- Within a sliver, the order of characterization tests and moves.
