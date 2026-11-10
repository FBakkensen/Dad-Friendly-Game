# One shared browser harness (H1a, #438) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The five browser scripts share one typed harness, `tools/browser/harness.ts`: `visual-check`, `ui-audit`, `play`, `mockup-check` and `env-report`. The harness holds the Vite server, the Chrome path and launch, page open with save seeding and clock control, a pair of tabs, a bare window, press and hold, the tap-clock step and teardown. Each script keeps today's behaviour exactly.

**Architecture:**

- `tools/browser/harness.ts` lives under the tools tsconfig, which already covers `typecheck:tools` and lint.
- Node 24 strips types natively, so the `.mjs` scripts import it directly.
- The harness imports only puppeteer-core, vite and node. Saves stay in `scripts/fixtures.mjs`, where H1b (#439) types them.
- Each place where today's scripts differ becomes an option, never a merged behaviour:
  - port and URL override;
  - launch args;
  - seeding: once-guarded, on every load, removed, or none;
  - viewport and device scale;
  - clock: real, skewable or stopped `Date`, with a real or held tap clock;
  - press: desk click or phone tap, with ui-audit's click fallback;
  - the page-error sink.

**Tech Stack:** Node 24 with type stripping, puppeteer-core, Vite's `createServer`, and Vitest for the pure parts.

**Spec:** `docs/superpowers/specs/2026-11-09-architecture-design.md`, part E, and issue #438. The issue's "Done when" is binding. The map behind this plan is `h-map.md` in the session scratchpad, §1, and is not committed.

## Global Constraints

- **No behaviour change in any script.** The visual check's ok-label set, with digits stripped, equals the baseline taken in Task 1 on `main`. The mockups pass. `npm run play` passes on every save `--help` lists. `npm run audit:ui` runs, and its report matches the Task 1 baseline apart from timestamps and known noise.
- **Today's differences are options, and every default is today's behaviour per script** (map §1b):

  | Script       | Port, URL override | Launch args                                                 | Seeding                                                     | Viewport                                     |
  | ------------ | ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
  | visual       | 4174, `VISUAL_URL` | `--no-sandbox`                                              | once per tab, guard key `visual-seeded`, through `seedJson` | DPR 1; desk means width ≥ 600                |
  | ui-audit     | 4175, no override  | `--no-sandbox --hide-scrollbars --font-render-hinting=none` | raw JSON on every load, or the key removed                  | DPR 2, always mobile and touch               |
  | play         | 4175, `--url`      | `--no-sandbox`                                              | once per tab, guard key `play-seeded`                       | DPR 2; phone from the plan, desktop 1366×768 |
  | mockup-check | 4175, `MOCKUP_URL` | `--no-sandbox`                                              | none                                                        | DPR 1, mobile and touch                      |

  Model the clock as `{ date: "real" | "skewable" | "stopped"; tap: "real" | "held" }`. Visual's `stopClock` maps to `date: "stopped"`, its skew patch to `"skewable"`, and `tapClock: "held"` to `tap: "held"`, keeping `HELD_TAP_START = 1e9` and `stepTapClock`'s behaviour.

- **Unchanged rules:**
  - Keep each script's page-error handling: visual folds errors into its failures, ui-audit returns them, play counts and logs them. Do this through an `onPageError` callback.
  - Keep mockup-check's one page per worker across shots. Use `newWindow()`, not `open()`.
  - Keep play's `wait` action (`sleep(ms)`). It is user-facing CLI behaviour, not a fixed sleep in a check.
  - Change no check, label, timeout or wait condition. Moving code into the harness is the only change.
- **Done-when grep:** `grep -nE "createServer|google-chrome|puppeteer\.launch" scripts/` finds nothing. `open(`, `__skewMs` and `__tapNow` are defined only in the harness.
- **Gate:**
  - The visual and mockup gate steps keep their commands (`node scripts/visual-check.mjs`, `node scripts/mockup-check.mjs`), exit codes and `VISUAL_ONLY` and `VISUAL_JOBS` behaviour.
  - Every function is 150 lines or under, with complexity 15 or under, and no ceiling entry is added.
  - `typecheck:tools`, lint and knip cover the new files.
- **Proving each task:**
  - Run the full visual check, `npm run visual`, about 7 minutes, only in the task that changes the visual check. The other tasks prove with their own script.
  - Never run two browser scripts at once, and never edit `src` or `scripts` while one runs.
  - Commit messages are a plain sentence ending ` (#438)`.

## Review Focus

1. **Two-tab open:** visual's s17 and ui-audit's "other-tab-playing" each open one context with two pages, and the other-tab card must still show. Pinned by s17 and the ui-audit report.
2. **A reload in ui-audit seeds again; a reload in visual does not.** A merged seeding mode would silently change one of them. Pinned by the `SeedMode` unit test and the two baselines.
3. **The held tap clock** (`performance.now` → `__tapNow`) is installed before any page script runs, and `stepTapClock` moves only the held tab's clock. Pinned by the drawer, rail and press-look sections.
4. **A run against a given URL** (`VISUAL_URL`, play's `--url`, `MOCKUP_URL`) starts no server and stops none at the end. Pinned by a unit test of `startServer`'s option handling.
5. **Early-exit teardown:** visual closes the browser and the server on an early exit, as it does today (around lines 7194–7196). Pinned by reading the runner; there is no separate test.

---

### Task 1: Baselines, the harness core, and the two small scripts

**Files:**

- Create: `tools/browser/harness.ts` and `tools/browser/harness.test.ts`
- Modify: `scripts/env-report.mjs`, `scripts/mockup-check.mjs`

**Interfaces:**

- Produces in `harness.ts`:

  ```ts
  /** CHROME_PATH, else the first google-chrome that exists, else /usr/bin/google-chrome. */
  export function chromePath(
    env?: NodeJS.ProcessEnv,
    exists?: (p: string) => boolean,
  ): string;
  export function launchChrome(options?: {
    readonly args?: readonly string[];
  }): Promise<Browser>;
  /** Starts Vite on `port` unless `url` is given; `close()` is a no-op when it did not start one. */
  export function startServer(options: {
    readonly port: number;
    readonly url: string | undefined;
  }): Promise<{ readonly base: string; close(): Promise<void> }>;
  /** A bare page in its own context, for callers that drive navigation themselves (mockups). */
  export function newWindow(
    browser: Browser,
    viewport: Viewport,
  ): Promise<{ page: Page; close(): Promise<void> }>;
  ```

  `Browser`, `Page` and `Viewport` are puppeteer-core's types.

- [ ] **Step 1: Baselines, before any change.** Run these and save their output under the session scratchpad (`/tmp/claude-0/…/scratchpad/h1a-baseline/`), not in the repo:
  - `npm run visual` (the whole run);
  - `npm run mockups`;
  - `npm run audit:ui`;
  - `npm run play` on each save `--help` lists.

  From the visual log, keep the sorted ok-label lines with digits stripped (`grep '^ok' | sed 's/[0-9]//g' | sort -u`). Record the counts in the report.

- [ ] **Step 2: Write the failing tests** in `tools/browser/harness.test.ts`:
  - `chromePath` prefers `CHROME_PATH`, then the first existing path, then the default;
  - `startServer` with a `url` starts nothing and its `close` is a no-op (inject the starter, or test the option handling as a pure function).

  Check that the main vitest projects pick up `tools/**/*.test.ts`. If they don't, put the tests where they will run, and say where in the report.

- [ ] **Step 3:** Implement the core. Move `env-report`'s and `mockup-check`'s Chrome path, launch and server onto it. mockup-check uses `newWindow` for its one-page-per-worker pool.
- [ ] **Step 4:** Run `npm run mockups` and `node scripts/env-report.mjs`; compare with the baseline and expect the same. Then run the harness tests, `npm run gate -- fast`, `npx knip` and `npm run functions`.
- [ ] **Step 5: Commit** "The browser harness starts the server and Chrome for the mockups and the environment report (#438)".

### Task 2: `open`, seeding and the clocks; play on the harness

**Files:**

- Modify: `tools/browser/harness.ts`, `tools/browser/harness.test.ts`, `scripts/play.mjs`

**Interfaces:**

- Produces:

  ```ts
  export type SeedMode =
    | { readonly kind: "once"; readonly guard: string; readonly json: string }
    | { readonly kind: "everyLoad"; readonly json: string }
    | { readonly kind: "remove" }
    | { readonly kind: "none" };
  export interface PageClock {
    readonly date: "real" | "skewable" | "stopped";
    readonly tap: "real" | "held";
  }
  export const HELD_TAP_START = 1e9;
  export interface OpenOptions {
    readonly viewport: Viewport;
    readonly seed: SeedMode;
    readonly clock: PageClock;
    readonly search?: string;
    readonly waitUntil?: "networkidle0" | "domcontentloaded";
    readonly onPageError: (error: Error) => void;
    readonly beforeLoad?: (page: Page) => Promise<void>; // visual's standalone insets, reducedMotion, boardProbe
  }
  export function open(
    browser: Browser,
    base: string,
    options: OpenOptions,
  ): Promise<{ page: Page; context: BrowserContext; close(): Promise<void> }>;
  export function openPair(
    browser: Browser,
    base: string,
    options: OpenOptions,
  ): Promise<{
    pages: readonly [Page, Page];
    context: BrowserContext;
    close(): Promise<void>;
  }>;
  export function stepTapClock(page: Page, ms: number): Promise<void>;
  /** The init script each seed mode installs; pure, so it can be unit tested. */
  export function seedScript(seed: SeedMode, key: string): string | undefined;
  ```

  - `json` is what the caller seeds today: `seedJson(save)` from `fixtures.mjs` for visual and play, and ui-audit's raw `JSON.stringify`.
  - `open` adds nothing a script did not do today. Visual-only setup goes through `beforeLoad`.

- [ ] **Step 1: Write the failing tests** for `seedScript`:
  - "once" writes only while its guard is unset;
  - "everyLoad" writes on every run;
  - "remove" deletes the key;
  - "none" installs nothing.

  Use the save key the scripts use today; read it from them. Also test the clock option mapping, if it has a pure part.

- [ ] **Step 2:** Implement `open`, `openPair`, `stepTapClock` and the clock init. Each moves verbatim from visual's `open` (about lines 428–501) and its tap-clock helpers (about 416–426), keeping today's order of init scripts.
- [ ] **Step 3:** Move play onto the harness: its server, launch, and the page open in its screen loop (about lines 281–320). Use seeding "once" with guard `play-seeded`, the clock real/real, and play's own error and console logging through `onPageError` and its existing listeners.
- [ ] **Step 4:** Run `npm run play` on every save and compare with the baseline (exit codes, page-error counts, the save line in `log.txt`). Then run the harness tests and the per-task checks.
- [ ] **Step 5: Commit** "play opens its pages through the browser harness (#438)".

### Task 3: ui-audit on the harness

**Files:**

- Modify: `scripts/ui-audit.mjs`, and `tools/browser/harness.ts` only if a ui-audit difference needs a new option

- [ ] **Step 1:** Move ui-audit onto the harness: the server on 4175, always started; the launch with its three args; `open` with seeding "everyLoad", or "remove" when the save is undefined; DPR 2 mobile; the clock skewable/real. Use `openPair` for "other-tab-playing" (about lines 1424–1447). Its `press`, which waits for the target to be visible, taps, and falls back to a click, stays in ui-audit if only ui-audit uses it. Otherwise it becomes `press(page, target, { fallbackClick: true })` in the harness.
- [ ] **Step 2:** Run `npm run audit:ui` and diff its report against the baseline. Expect no change apart from timestamps and known noise; list any noise in the report. Then run the per-task checks.
- [ ] **Step 3: Commit** "The UI audit opens its pages through the browser harness (#438)".

### Task 4: The visual check on the harness

**Files:**

- Modify: `scripts/visual-check.mjs`, and `tools/browser/harness.ts` for `press` and `holdThrough`

**Interfaces:**

- Produces:

  ```ts
  export function press(
    page: Page,
    selector: string,
    options: { readonly desk: boolean },
  ): Promise<void>; // visual's click-on-desk / tap-on-phone
  export function holdThrough(
    page: Page,
    selector: string,
    done: (selector: string) => boolean,
    options: { readonly desk: boolean },
  ): Promise<boolean>;
  ```

  visual keeps its `desks` WeakMap and passes `desk`, so each call site reads as it does today.

- [ ] **Step 1:** Move visual onto the harness:
  - its server (4174, `VISUAL_URL`), its launch, and its `open`. Use seeding "once" with guard `visual-seeded`. Map `{ stopClock, tapClock }` onto `PageClock`, and pass the standalone insets, `reducedMotion` and `boardProbe` through `beforeLoad`;
  - s17's two-tab copy onto `openPair`;
  - `press` and `holdThrough` onto the harness;
  - the teardown on every exit path.

  Keep visual's own `section`, `check`, failures, queue and `VISUAL_JOBS`.

- [ ] **Step 2:** Run `npm run visual` (the whole run). Compare the ok-label set, digits stripped, with the Task 1 baseline, and expect it equal. Record the wall time against the baseline's.
- [ ] **Step 3:** Run the done-when grep, and expect no `createServer`, `google-chrome` or `puppeteer.launch` left under `scripts/`. Check that `open(`, `__skewMs` and `__tapNow` are defined only in the harness. Then run the per-task checks.
- [ ] **Step 4: Commit** "The visual check opens, presses and holds through the browser harness (#438)".

### Task 5: Docs and proof (controller)

- [ ] Update `docs/ARCHITECTURE.md`'s browser-check paragraph: one harness in `tools/browser/harness.ts`, its options, and which script uses which modes. Keep it short.
- [ ] Run `npm run mockups`, `npm run audit:ui` and `npm run play` on every save, one at a time, each against its baseline.
- [ ] Then the full gate, the final review and the PR, through ship-sitting.
