# Design audit: Dad-Friendly Game

Audited at `ce2a779` (branch `claude/beautiful-thompson-t7oje5`, B5 / #373 in progress). The local clone is shallow (129 commits back to 2026-11-02), so older history was read read-only through the GitHub REST API (`gh api repos/FBakkensen/Dad-Friendly-Game/commits?path=…` and `contents?ref=…`). Nothing in the repo was changed, and the gate and visual check were not run. Numbers from the last full gate come from the existing `.gate/logs/`.

## Verdict

"Extremely bad coding behaviour" overstates it at the line level. The code is strictly typed: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `strictTypeChecked` ESLint, 0 `@ts-ignore`, 0 `eslint-disable`, 1 `any`, 6 casts. It has 1,847 unit tests at 98% statement coverage, and the game-rules layer is genuinely pure and well factored: none of the 28 rules modules imports UI code. "Bad design" is accurate for everything around that core, and it is getting worse. Two closure "god functions" absorb almost every feature. `createProgressStore` is 2,203 lines with 40 mutable closure variables and about 9 concerns; it grew from 298 to 2,425 lines over 11 feature PRs. `mountMountainScreen` is 1,146 lines with 47 imports, and it grew back to 1,283 after a deliberate split had brought it down to about 460. There is no first-class player action or event in the UI. Mutations are opaque `(m) => m` closures, so the UI works out whether a buy happened by counting before and after, and the store works out which events to log by diffing two mountains. The UI and the strategy lab also apply slightly different rules for the same moves. UI behaviour rules (double-tap guards, Done holds, "rows never move under a finger", which card covers which) are spread across DOM closures, `setTimeout`s, CSS transitions and state read back from DOM classes, and they are copied per panel. As a result they can only really be proven in a browser. The 7,133-line `scripts/visual-check.mjs` has become the main behaviour test. It grows about 1,000 lines per UI sliver and now needs sleeps and retries to stay green. The cause is how the agents worked, not their competence: each sliver was made locally correct, green and reviewed on its own, and no one paid down the structure that cuts across features.

## Scale (for calibration)

- `src/` non-test TypeScript, including `lab/` and `economy/`: 36,890 lines in 178 files. Tests: 44,083 lines in 118 files. 36 of those files (22,483 lines, 51%) need happy-dom.
- 7,981 lines (22% of non-test src) sit inside 14 functions of 200 lines or more (brace-matched count, below).
- CSS: `style.css` 3,204 lines and `board.css` 2,418. Browser scripts: `visual-check.mjs` 7,133, `ui-audit.mjs` 1,730, `mockup-check.mjs` 532, `play.mjs` 364.
- Last full gate (`.gate/logs/coverage.log`): 1,847 tests, Duration 97 s, statements 98.03%, branches 94.8%. `visual.log` holds 2,192 ok/FAIL lines. It was last written about 11 minutes after coverage finished, but that run overlapped with the lab, so treat the time as rough.

---

## 1. Separation of concerns

**What is pure and fast to test (good, keep).**

- The game-rules layer: `scale`, `mountain`, `tiers`, `relics`, `layers`, `upgrades`, `boosts`, `veins`, `crew`, `rates`, `field-log`, `engineers`, `expeditions`, `hazards`, `workshop`, `lost-tools`, `legacy` and `milestones`.
- Pure view rules: `ready-now`, `machine-bays`, `mine-window`, `haulage` (a reducer), `output-gauge`, `crew-count` and `board-fit`.
- I checked every one of these for imports of panel, screen, board, words, sheet or store modules: none (scripted grep over 28 modules). `buys-rows`, `upgrade-rows` and `key-rail` import only `screen-words` and `tier-lock-words`, which are string modules with no DOM.

**F1.1 The state layer contains game rules and UI wording.** Severity: high. Spread: one module that every feature touches.

- `progress-store.ts` runs the authoritative time step: `settle` at 1968–2012 (expedition settle, live accrue, hazard step, the clock-back rule, and the 10 s `LIVE_GAP_MS` live-versus-away rule at 231 and 1185).
- It also runs save migrations and grants: `staffExisting` at 331, `grantFirstEngineer` at 350, and `grantRecipes` on entering a layer at 635. It marks first use (`recordFirstUse` at 2067).
- It imports the screen layer: `craftFittedWords` and `SAVE_CONFLICT_ERROR` from `screen-words` (line 71), and `fittedEffect` from `workshop-sheet` (line 81). That breaks ARCHITECTURE.md's rule that imports point down (screen is layer 4, state is layer 3).
- It exposes layout-check hooks in its production interface: `previewTrouble` and `previewConflict` (`progress-store.ts:184–190`).

**F1.2 UI behaviour rules live in DOM closures, timers and CSS.** Severity: high. Spread: every interactive control.

- "A tap within 400 ms of a drawer opening does nothing" is enforced in five listener sites with three different semantics: `board-drawer.ts:264–301` (Back at pointerdown and click, "i" on click only, how cards with capture and `stopPropagation`) and `card-tap.ts:53,111`.
- Whether the second tap lands on the drawer at all depends on a CSS transition: `board.css:658–668`, `transform 0.24s steps(6)`. So the rule cannot be judged without layout and animation.
- "Rows never move under a finger" is two different mechanisms. Buys uses a `wanted` map plus a `frozen` flag (`crew-panel.ts:384–510`). Upgrades reorders only while shut but still calls `hide(row.root, …)` while open (`upgrades-panel.ts:350–378`).
- Which card covers which, and when the New sign may show, is decided by querying the DOM: `mountain-screen.ts:890–971`, `root.querySelector(OPEN_SHEET)` and `boardNote.note.classList.contains("on")`.

**F1.3 Rendering has side effects and there are two render paths.** Severity: medium.

- `render()` mutates the store: `queueMicrotask(() => progress.dismissQuietAway())` at `mountain-screen.ts:764–768`.
- The 1 s tick (`mountain-screen.ts:1203–1221`) calls its own hand-picked subset of 11 render functions, and `render()` (762–887) calls a different list. A new part has to be added to both by hand.

**F1.4 The panel contract is broken in practice.** Severity: low to medium.

- ARCHITECTURE.md says a panel "never reads another panel's elements". The screen does: `workshop.menuEntry.querySelector(".workshop-open")` (`mountain-screen.ts:1120`) and `relicPlate.root.querySelectorAll(".board-socket")` (1167).
- `card-tap.ts:4–9` hard-codes three panels' CSS classes (`.workshop-recipes, .engineers-dialog, .board-sheet-list`) to find the scroller.

## 2. Duplication (counted)

| Rule / mechanism                                                          | Copies                                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                            | Severity                                                          |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| The "advance the world" step                                              | 2, plus `pacing`                                                                 | `progress-store.ts:1968–2012` settles expeditions, then accrues, then steps hazards. `lab/world.ts:52–78` accrues, steps hazards, then settles expeditions. The store also has the 10 s live/away rule, clock-back handling and layer-recipe grants, which the lab does not.                                                                                                        | **high** (the lab's guardrails measure a slightly different game) |
| Per-move game rules, UI vs lab                                            | 3 known divergences                                                              | The UI's recall falls back to camp when the post is "tunnel" (`engineers-panel.ts:735–741`); the lab's `applyAction` recall does not (`economy/actions.ts:247`). The UI hire marks staffing taught (`crew-panel.ts:51–59`, `buyWithTeach`). The lab's craft calls `grantDepthRecipe` (`actions.ts:252,915`) to make up for the store-only `grantRecipes` (`progress-store.ts:635`). | **high**                                                          |
| "Did the mutation succeed?" by count diff                                 | 4                                                                                | `crew-panel.ts:257,348`, `upgrades-panel.ts:182`, `mountain-screen.ts:512`                                                                                                                                                                                                                                                                                                          | medium                                                            |
| Field-log events worked out by diffing mountains                          | 2 functions, about 120 lines                                                     | `noteChanges` and `noteCrew`, `progress-store.ts:372–476`                                                                                                                                                                                                                                                                                                                           | medium                                                            |
| Buy-tap pipeline (early, holding, not ready, re-read, blink, apply, done) | 3                                                                                | `crew-panel.ts:292–353`, `upgrades-panel.ts:152–188`, `mountain-screen.ts:495–515` with `board-ready.ts:330–353`                                                                                                                                                                                                                                                                    | medium                                                            |
| 400 ms settle guard                                                       | 5 sites, 3 semantics                                                             | `board-drawer.ts:264–301`, `card-tap.ts:53,111`                                                                                                                                                                                                                                                                                                                                     | medium                                                            |
| Done hold (1.9 s)                                                         | 2 implementations, 1 shared constant                                             | `board-row.ts:254–281`, `board-ready.ts:330–353`                                                                                                                                                                                                                                                                                                                                    | low to medium                                                     |
| "Fixed!" thanks after a trouble fix                                       | 2, with 2 separate `THANKS_MS = 1600`                                            | `crew-panel.ts:66,248`, `mountain-screen.ts:323,1099`                                                                                                                                                                                                                                                                                                                               | low                                                               |
| Freeze layout while a drawer is open                                      | 2 different                                                                      | F1.2                                                                                                                                                                                                                                                                                                                                                                                | medium                                                            |
| "i" how-cards wiring and `legend()`                                       | 2 near-identical blocks each                                                     | `crew-panel.ts:112–121,188–202` and `upgrades-panel.ts:84–93,132–146`                                                                                                                                                                                                                                                                                                               | low                                                               |
| DOM micro-helpers (`hide`/`show`/`mark`/`toggle`)                         | 9 local copies in 5 files, although `board-dom.ts` exists for exactly this       | `board-drawer.ts:77`, `board-keys.ts:55,61`, `board-row.ts:55,61`, `crew-panel.ts:99,105`, `upgrades-panel.ts:71,77`                                                                                                                                                                                                                                                                | low                                                               |
| Press feedback                                                            | 4                                                                                | `card-tap` `is-pressed`, `board-keys` `is-down`, `board-ready` guard frame, `engineers-panel.ts:235–249` `pressedKey` timer                                                                                                                                                                                                                                                         | low                                                               |
| "Session news" (cards shown once)                                         | 8 snapshot fields, 3 baselines, 5 dismiss methods, plus 1 extra localStorage key | `progress-store.ts:92–131`, 279–290, 165–177, 23                                                                                                                                                                                                                                                                                                                                    | medium                                                            |
| Browser harness (server, Chrome path, `open`, `press`, clock skew)        | 4 scripts                                                                        | `createServer` in visual-check, ui-audit, play and mockup-check; the Chrome path in those four plus env-report; `open()` at `visual-check.mjs:415` and `ui-audit.mjs:137`; the `__skewMs` Date patch in 2                                                                                                                                                                           | medium                                                            |
| Save fixtures                                                             | 3 places                                                                         | Untyped `scripts/fixtures.mjs` restates the first-engineer rule (`withCurrentEngineer`, a copy of `engineers.ts:136`). `visual-check.mjs` adds 6 builders of its own (2287–5892).                                                                                                                                                                                                   | low to medium                                                     |
| Duration formatting                                                       | 4                                                                                | `format.ts` `formatDuration`, `chipTime`, `etaShort`; `screen-words.ts:109` `formatClock`                                                                                                                                                                                                                                                                                           | low (mostly genuinely different formats)                          |

## 3. Size and shape

Functions of 200 lines or more (brace-matched):

| Function                                                                                                          | Lines   | What it mixes                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createProgressStore` (`progress-store.ts:233`)                                                                   | 2,203   | cloud sync, rev and conflict handling, listener backoff, the server read on resume, phone backup, guest save, field log, the hazard session, session news (8 kinds), migrations and grants, the world time step, the tab seat, UI preview hooks. 40 `let`s and 59 inner functions. |
| `mountMountainScreen` (`mountain-screen.ts:128`)                                                                  | 1,146   | DOM construction (33 `createElement`), vein state and its own localStorage persistence (291–314), the Proxy around the store (171–188), Ready-now buying, cover and focus rules, the teach sign, the rail, two render loops. 47 imports, 13 `let`s.                                |
| `createEngineersPanel`                                                                                            | 857     | DOM (81 `createElement`), 15 `let`s, 3 timers, game-rule composition (`station(recall(…))`)                                                                                                                                                                                        |
| `createWorkshopPanel`                                                                                             | 550     | 13 `let`s, 2 timers                                                                                                                                                                                                                                                                |
| `createCrewPanel`                                                                                                 | 531     | buy pipeline, chip layout, freeze, count-up animation                                                                                                                                                                                                                              |
| `createRelicPanels`                                                                                               | 363     | —                                                                                                                                                                                                                                                                                  |
| `createTabWriter`                                                                                                 | 348     | acceptable: one concern with injected ports                                                                                                                                                                                                                                        |
| `createMineWindow`                                                                                                | 326     | —                                                                                                                                                                                                                                                                                  |
| `createUpgradesPanel`, `createMenuPanel`, `howItWorks`, `createMachineBays`, `createBoardRow`, `createBoardSheet` | 243–305 | —                                                                                                                                                                                                                                                                                  |

**F3.1 Growth by accretion, with history.** Severity: high.

- `progress-store.ts` line counts at successive commits: 298 (`6f14f95`, #33) → 583 (`2f5a4fc`, pass the mine) → 860 (`b7e63d9`, trouble) → 1,030 (`c682d88`, field log) → 1,219 (`dfc1454`, layer card) → 1,500 (`9fdfb62`, phone backup) → 1,719 (`77d4599`, rev) → 2,077 (`8e290f4`, fresh read and writer tab) → 2,425 (`f350a7b`, Two saves found) → 2,456 now. Every feature went into the same closure.
- `mountain-screen.ts`: 1,406 lines at `d98d9e5`. It was split (#121–#126) and ARCHITECTURE.md:202 still says "now ~460 lines". It then regrew: 504 at `b7e63d9`, 779 at `0e82484`, 915 at `115469b`, 1,250 at `7e014a8` (B4), 1,283 now. The doc was never corrected.

## 4. Where state lives

- **In typed models (good):** `Mountain` (the save), `HazardState`, `VeinState`, `TabSeat`, and `CloudLoadResult` / `CloudWriteResult` / `MergeResult`.
- **In closure variables (F4.1, severity high):** 248 factory-level `let`s across `src/*.ts`. The store holds 40. These include the cloud write state machine as loose booleans and numbers (`cloudFlight`, `cloudDirty`, `resumeHold`, `serverSeen`, `hydrated`, `rev`, `syncedRev`, `phoneDirty`, `consecutiveRevMerges`, four timer handles; `progress-store.ts:262–366`). Invalid combinations are representable and only provable through timing tests. The engineers panel holds 15, the workshop panel 13 and the screen 13.
- **In the DOM (F4.2, severity medium):**
  - Whether a sheet or card is open is read back with `querySelector`: `mountain-screen.ts:904,923,971`.
  - Whether any effect is running is read from DOM nodes the same function has just written: `mountain-screen.ts:863–865`.
  - Whether the scrim is on is read from classes: `board-drawer.ts:351–352`.
  - The board note's state is read as `.on`: `mountain-screen.ts:930,970`.
  - In total: 16 `classList.contains` reads in non-test src, and 7 `querySelector` lookups in the screen alone.
- **In CSS (F4.3, severity medium):** where the second tap of a double tap lands is decided by the drawer's `transform 0.24s steps(6)` (`board.css:663–668`), which a JS constant (`DRAWER_SETTLE_MS = 400`) is tuned against. The visual check keeps a third copy (`DRAWER_MS = 400`, `visual-check.mjs:3732`).
- **A Proxy hack (F4.4, severity low to medium):** the screen wraps the store in a `Proxy` so it can set a `localChange` flag during `applyMutation` (`mountain-screen.ts:171–188`), because a mutation does not say who made it or what it was.

## 5. Time

- **Injected clocks (good):** `now` in the store, the screen and the tab writer; `tapClock` in the screen. The rules layer takes `now` as a parameter everywhere; `haulage` and `output-gauge` take `dt`.
- **Real timers everywhere else (F5.1, severity medium, widespread):** 47 `setTimeout` / `setInterval` / `requestAnimationFrame` calls in 14 non-test files (store 8, tab-writer 6, engineers-panel 6, board-ready 6, board-row 4, …). Each module schedules its own timers inline. So:
  - unit tests must combine `vi.useFakeTimers` (used in 15 files, 26 times in `mountain-screen-crew.test.ts` and 23 in `mountain-screen.test.ts`) with an injected `now`;
  - the screen needs two clocks (`now` and `tapClock`, `mountain-screen.ts:154–158`), because "a gate run may stop" the game clock;
  - browser checks patch `Date.now` globally (`__skewMs`, and the `stopClock` option used 21 times in visual-check) and sleep in real time.
- **Real-time sleeps in browser checks (F5.2, severity high, see section 6):** `visual-check.mjs` has 29 fixed sleeps (11 × 300 ms, 6 × 450 ms, 3 × 150 ms, 2 × 120 ms, 2 × 600 ms, 1 each of 80, 250 and 1,500 ms) and a retry loop for load ("Under the full gate's load the second tap can come down after the drawer's 400ms settle… Retry it (at most thrice)", 6745–6764).

## 6. Testability and test structure

**Browser-only for good reasons:** layout, no-scroll, contrast, exact-2x art, safe-area insets, font fit. The real-browser check is right for these.

**F6.1 Behaviour rules proven in the browser because they have no pure home.** Severity: high.

- Check labels include: "a double tap on Ready now buys exactly one cart", "five taps fix the troubled bay", "a 700ms hold fixes the troubled bay", "a second tap inside the 1.9s hold buys nothing", "a tap on a dear row spends nothing and its lamp reads red within 200ms", "a double tap on the ${id} key … buys nothing".
- `doubleTap` (`visual-check.mjs:5173–5251`) installs a `MutationObserver` and `pointerdown` spies inside the page to measure how far into the settle the second press landed.
- The same rules also have unit tests (`board-drawer.test.ts:109,277,305`; `board-row.test.ts:370,411`). The browser copy exists because the unit tests cannot see the CSS-animated hit-test race.
- Cost in history: 8 commits on #372 and #373 are about this single rule (`58b4da3`, `3884807`, `a00961d`, `774531c`, `a619f01`, `d9727e9`, `42e2be3`, `ce2a779`). Their subjects describe changes to the test's timing, not to the game.

**F6.2 Visual-check cost grows linearly per feature.** Severity: high.

- Size: 316 lines (`2ed5e34`, Oct 11) → 912 (`f1a3ae2`) → 1,796 (`02addbc`) → 2,641 (`5c5932c`) → 3,112 (`96a1615`, Nov 5) → 7,133 now.
- Each board sliver added about 1,000 lines: B2 `2f985f9` +1,057/−469; B3 `279c72f` +850/−178; B4 `7e014a8` +886/−22; B5 so far `d0d7b18` +1,857/−340 plus about 450 more in follow-ups.
- It is one file: a global `failures` array, 34 `section(...)` registrations, 202 `check(` calls and 61 `page.evaluate` calls. Labels still read "section 4 (line 816)", left over from the mechanical split in `96a1615` (#313).
- Browser checks re-implement expectations by importing the rules into the page (`railFacts` imports `key-rail.ts` and `persist.ts`, 5963–6030). They also pin sprite pixel offsets (`LAMP_RED_X = "-120px"`, `CAP_X`).

**F6.3 Unit tests through the whole screen.** Severity: medium.

- Four `mountain-screen*.test.ts` files (about 8,700 lines, 329 + 233 + 122 + 44 `querySelector` calls) mount the entire screen to test, for example, a save migration ("greets an older save with how many helpers joined", `mountain-screen-crew.test.ts`). They were split by size "for parallel workers" (`mountain-screen.harness.ts:2`), not by concern.
- They act as characterization tests and catch regressions. They pin CSS class names, and 36 `style.*` / `backgroundPosition` assertions in `board-window.test.ts` pin sprite offsets. Pure-rule tests (`ready-now`, `rates`, `workshop`, …) pin behaviour well.

## 7. Types

- **Strong at the edges (good):** discriminated unions for `CloudLoadResult`, `CloudWriteResult`, `MergeResult`, `ReadyPick`, `ReadyTap`, `SettledFind`, `HazardState` and `Action` (`economy/actions.ts:85–103`). The compiler and lint config are strict, as listed in the verdict.

**F7.1 `Mountain` is an optional-field bag from save history.** Severity: medium to high, widespread.

- 21 of 29 fields are optional (`mountain.ts:47–127`).
- Defaults are scattered rather than normalized at the parse boundary: `.engineers ??` / `.engineers?.` appears 55 times in non-test src, `.expeditions` 20, `.recipes` 14, `.crafted` 10, `.boosts` 9, `.legacy` 9.
- Four timed-craft clocks are separate fields (`chargeUntil`, `flareUntil`, `emberUntil`, `axleUntil`; 45 mentions across `persist.ts`, `workshop.ts` and `firestore.rules`), while boosts are a record. So a new timed recipe means a new save field, a rule, a parse and a serialize.

**F7.2 Redundant, contradictory state is representable.** Severity: medium.

- `Engineer.post` can be `"tunnel"` (`engineers.ts:32–37`) while the matching `Expedition` holds `home` (`expeditions.ts:91–98`). "On an expedition" is stored twice, and the UI patches the illegal combination: "A tunnel with no expedition has no home post to restore" (`engineers-panel.ts:737–740`).
- UI actions address engineers by array index.

**F7.3 Stringly-typed IDs.** Severity: low to medium.

- `seen?: readonly string[]` and `taught?: readonly string[]` (`mountain.ts:120–122`), with `markTaught(mountain, id: string)` (`teach.ts:169`).
- `RowView` (`row-view.ts:23–39`) is a flat bag where "an empty string hides" a field, and where `state`, `lamp` and `can` can contradict each other.

**F7.4 The session snapshot is a bag of optional news.** Severity: medium.

- `ProgressSnapshot` (`progress-store.ts:92–131`) has `away?`, `quietAway?`, `revealed?`, `crewJoined?`, `engineerJoined: true | undefined`, `homecomings`, `layersArrived`, `craftsFitted` and `saveConflict?`, plus the independent booleans `ready`, `playing` and `elsewhere`, which are derived inconsistently (lines 518 and 530).

## 8. What is genuinely good (keep as the model)

1. **The pure rules layer and the single multiplier site.** All speed, tap and away maths goes through `effectiveRates`, and no rules module imports UI.
2. **Pure view models with discriminated results:** `readyNow`/`ReadyPick`, `bayViews`, `keyViews`, `buyRowView`, `windowScene`, and `haulage` as a `dt` reducer. This is the pattern the rest of the UI should follow.
3. **The save layer:** a versioned parser (`persist.ts`), `compareSaveProgress`, `mergeSaves`, the `CloudSave` interface with a memory fake, result kinds instead of exceptions, `rules-drift.test.ts` (a `Required<Mountain>` sample makes a new field a type error), and the emulator tests.
4. **Ports injected at the composition root:** `CloudSave`, `AuthController`, `TabWriter` with `locks`, `bus`, `storage` and `now`.
5. **The gate's static guards:** runtime import-cycle check, knip strict, token check on new CSS, per-module coverage floors, fast and full tiers.
6. **The strategy lab's typed `Action` list and `applyAction`.** It is the right shape for the UI to adopt too.
7. **Extractions that worked:** `board-row` shared by both drawers, `watchFixHold` (`trouble-tap.ts`, extracted in `c9646ea`), `ui-audit-measure.ts` measurement maths shared between scripts, `board-dom.ts` `fitFirst`/`write`.

## 9. Coding behaviours that produced the problems

1. **Growing a feature by adding to the nearest closure.** The store went from 298 to 2,456 lines across 11 feature PRs (F3.1). Each feature (hazards, expeditions, field log, layers, crafts, rev, conflict) added `let`s, a `note…` function and a snapshot field to the same function.
2. **Splitting once, then regrowing.** The mountain-screen split (#121–#126) brought the file to about 460 lines and ARCHITECTURE.md recorded it. It then regrew to 1,283 lines, and the doc line was never revisited (ARCHITECTURE.md:202).
3. **Copying a mechanism instead of extracting it, then reviewing per sliver.** The Upgrades drawer (`6d4a792`, `154ea79`) and the Buys drawer (`7121291`, `c24cb29`) were built in consecutive commits with copied `hide`/`mark`/`legend`/how-cards code and two different "freeze" mechanisms (section 2). `board-dom.ts` already existed and was skipped. The 9 helper copies show reviews looked at one sliver at a time and never across features.
4. **Fixing a timing test instead of the design.** 8 commits adjusted when and where the browser check's second tap lands, then added a retry for "the full gate's load" (`ce2a779`), instead of making the guard a pure function of timestamps (F6.1).
5. **Appending tests per feature into one script.** The visual check gained about 1,000 lines per board sliver (F6.2), with untyped fixtures and helpers defined inline next to each section.
6. **Treating docs and comments as an append-only changelog.**
   - 221 issue references (`#373`, …) in non-test src.
   - 30 "today's …" / "until B7" transitional comments.
   - ARCHITECTURE.md has a 3,453-character single line, and its paragraphs read like PR logs.
   - Stale contradictions: `mountain-screen.ts:112–123` says "Only buying waits: Back … work[s] at once", while `board-drawer.ts:264` makes Back share the settle.
7. **Many-clause commits.** For example, `a619f01` "Drawers judge their settle…, the footnote stands over Back, an off spare takes no room, a row's flag shares the name's line, and the New row scrolls its list alone" bundles five unrelated changes, which makes bisecting and reviewing harder.
8. **Running two UI generations side by side.** Old panels build with raw `document.createElement` (81 in engineers-panel, 46 each in workshop and relic panels); new board parts use `el()`. Old sheets keep B2's `--board-top` "until B6 and B7". About 9 `style.css` classes are referenced by no code (`.boost-chips`, `.engineer-head`, `.engineer-lock`, `.engineer-post(s)`, `.engineer-station`, `.engineer-tunnels`, `.engineers-sub`, `.sheet-kicker`). A migration in flight is normal; the cost is that every rule has two homes until it finishes.

---

## The 5 design problems that cost the most (ranked)

### 1. The progress store is a 2,203-line closure that owns the game's time step, rules, session news and all persistence

- **Evidence:** `progress-store.ts:233–2436`. 40 `let`s, 59 inner functions, 28 imports including `screen-words` and `workshop-sheet`. Grew 298 → 2,456 lines across 11 feature PRs. The world step (`settle`, 1968–2012) is a second copy of `lab/world.ts:52–95` in a different order and with extra rules (live/away gap, clock-back, recipe grants). Every new system so far has had to edit it.
- **Root fix:**
  - Split it into a **pure session core**: `step(session, input, now) → { session, effects }`. Here `input` is a tick, a player action, a cloud snapshot or visibility. `session` holds the mountain, hazards, the news queue and baselines. `effects` are data such as "write phone backup", "cloud write", "log event".
  - Add a **sync service** that runs effects through the existing ports (`CloudSave`, phone backup, field log, `TabWriter`) and holds the write state machine as a discriminated union, not 13 loose variables.
  - Make the lab's `World` the same core, so the game and the guardrails run one step function.

### 2. There is no first-class player action or event, so UI, store and lab each recover meaning differently

- **Evidence:**
  - `applyMutation(update: (m) => m)` (`progress-store.ts:162`).
  - Success worked out by count diff in 4 UI sites.
  - Field-log events worked out by diffing mountains (`noteChanges` and `noteCrew`, 372–476).
  - A `Proxy` added just to learn who mutated (`mountain-screen.ts:171–188`).
  - UI and lab apply different rules for the same move: recall-to-camp (`engineers-panel.ts:735`), `buyWithTeach`, `grantDepthRecipe` (`actions.ts:915`).
- **Root fix:** make `economy/actions.ts`'s `Action` union the only way to change the game: `dispatch(action) → { kind: "applied", events } | { kind: "refused", reason }`. Teach marks, grants and camp fallbacks move inside `applyAction`. The UI renders Done or a blink from the result. The field log records the returned events. The lab dispatches the same actions.

### 3. UI interaction rules are scattered across DOM closures, timers, CSS and DOM-class state, and copied per panel

- **Evidence:**
  - The settle guard is in 5 sites with 3 semantics; the Done hold has 2 implementations; "thanks" 2; the freeze-while-open rule 2 different mechanisms; the buy pipeline 3; DOM helpers 9 copies.
  - Open/covered state is read back from the DOM (`mountain-screen.ts:890–971`).
  - 47 inline timers.
  - `mountMountainScreen` is 1,146 lines with 47 imports and two render paths (762 and 1203). It regrew after its split.
- **Root fix:**
  - A pure **board interaction model**: a state machine of which overlays are open, which control holds Done or a settle, and what is frozen. It takes timestamped input events (`pointerdown`, `click`, key, tick) and returns decisions and view state, against an injected clock.
  - One shared **control behaviour** (tap, settle, hold, blink, freeze) used by every row, bay, key and plate.
  - DOM modules become thin painters of that view state, with one render path. The screen becomes a composition root of a few hundred lines.

### 4. The real-browser script is the de facto behaviour test: monolithic, linear in features, and timing-fragile

- **Evidence:**
  - `visual-check.mjs` grew 316 → 7,133 lines, about +1,000 per board sliver (B2 +1,057, B3 +850, B4 +886, B5 +1,857 and more).
  - 202 checks in one file with a global `failures` array.
  - 29 real-time sleeps and a load retry loop (6745–6764).
  - In-page `MutationObserver` timing probes (5173–5251).
  - 8 commits spent stabilizing one double-tap rule.
  - The harness is duplicated across 4 scripts, with untyped fixtures.
- **Root fix:**
  - Once problem 3 is fixed, prove tap, hold, settle and freeze rules as fast unit tests on the interaction model with a fake clock.
  - Limit the browser check to things only a browser can see (layout, no-scroll, contrast, 2x art, font fit).
  - Organise it as per-component spec modules over one shared, typed harness and fixture module (shared with ui-audit, play and mockup-check), with declarative scenario × viewport tables. A new screen part then adds a table row, not 1,000 lines.

### 5. The in-memory model inherits save-format optionality and redundancy, so illegal states are easy to represent

- **Evidence:**
  - 21 of 29 `Mountain` fields are optional (`mountain.ts:47–127`); `engineers ??` / `?.` alone appears 55 times.
  - "On expedition" is stored twice (`Engineer.post === "tunnel"` and `Expedition.home`), and the UI patches the contradiction (`engineers-panel.ts:737`).
  - `seen` / `taught` are `string[]`.
  - Four separate `…Until` craft clocks.
  - Session news is spread over 8 optional snapshot fields, 3 baselines and 5 dismiss methods.
- **Root fix:**
  - Keep optionality only in the versioned save DTO. `parseSaveValue` returns a normalized, complete `GameState` (empty lists, zero levels).
  - Derive "on expedition" from `expeditions` and drop the `"tunnel"` post.
  - Make teach IDs and timer IDs closed unions, with timed effects as one `Record<TimerId, until>`.
  - Make session news one queue of a discriminated `Notice` union with a single `dismiss`.

## What to keep (summary)

- Pure rules modules and `effectiveRates` as the single place multipliers meet.
- Pure view models returning discriminated unions (`ready-now`, `machine-bays`, `key-rail`, `buys-rows`, `mine-window`, the `haulage` reducer).
- The save layer's result kinds, parser, merge/compare, `CloudSave` port and memory fake, and the rules-drift and emulator tests.
- Strict TypeScript and lint settings, which are already clean.
- The gate's static guards and per-module coverage floors.
- The lab's typed `Action` and `applyAction`: promote it to the game's only mutation path.
- `board-row` and `watchFixHold` as examples of extraction done right.
