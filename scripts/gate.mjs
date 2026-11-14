/* global console, process, URL */
/**
 * One quiet gate, two tiers. One line per step; each full log goes to
 * .gate/logs/<step>.log, and a failed step prints its tail.
 *   npm run gate -- fast   the edit loop (npm run check:fast)
 *   npm run gate -- merge  what merge-check.yml runs on each PR merged with main
 *   npm run gate -- full   before the PR is opened (npm run check)
 *   npm run gate -- signoff  after the push: the signoff status (signoff.mjs)
 * The step table and its rules are in src/gate.ts.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { performance } from "node:perf_hooks";
import { constants } from "node:os";
import { fileURLToPath } from "node:url";
import {
  GATE_DIR,
  LAB_DIRS,
  LAB_ENTRIES,
  USAGE,
  economyChanged,
  exitCode,
  gateSteps,
  importClosure,
  logTail,
  nextMoves,
  parseArgs,
  parsePass,
  planTier,
  recordMove,
  reuseInputs,
  reusedOutcome,
  summaryLine,
  totalLine,
} from "../src/gate.ts";
import { MARKER, markerAfterFull, markerText } from "../src/signoff.ts";
import { changedSinceMain, touchedSinceMain } from "./changed.mjs";

// Every path below is repo-relative, wherever the gate was started from.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));

const parsed = parseArgs(process.argv.slice(2));
if (parsed.kind === "help") {
  console.log(USAGE);
  process.exit(0);
}
if (parsed.kind === "invalid") {
  console.error(`${parsed.message}\n\n${USAGE}`);
  process.exit(2);
}
if (parsed.kind === "signoff") {
  const { signoff } = await import("./signoff.mjs");
  process.exit(await signoff());
}
const { tier } = parsed;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
/** HEAD and whether the tree is clean, untracked files included. */
const treeState = () => ({
  head: git("rev-parse", "HEAD").trim(),
  clean: git("status", "--porcelain").trim() === "",
});
// Only the full tier earns a signoff marker, so only it reads the tree.
const before = tier === "full" ? treeState() : undefined;

const changed = changedSinceMain();

const read = (path) =>
  existsSync(path) ? readFileSync(path, "utf8") : undefined;

/** Every file the strategy lab runs: its commands, loader, policies and measures. */
function labClosure() {
  const discovered = LAB_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => `${dir}/${name}`),
  );
  return importClosure([...LAB_ENTRIES, ...discovered], read);
}
// Only the full tier asks whether this branch touches code the lab runs.
const closure = tier === "full" ? labClosure() : new Set();
// Every touched file, not only code: a hand edit of the pacing ledger (#554) runs the lab.
const economy =
  tier === "full" &&
  economyChanged([...changed, ...touchedSinceMain()], closure);

// A reusable step that passed records the fingerprint of its inputs here; the same
// fingerprint later reuses that pass instead of running it again (#403).
const REUSE = `${GATE_DIR}/reuse`;
const recordPath = (step) =>
  `${REUSE}/${step.name.replace(/[^\w.-]/g, "_")}.json`;
const reuseKey = (step, files = closure) =>
  createHash("sha256")
    .update(
      reuseInputs({
        step,
        files: [...files].map((path) => [path, read(path) ?? ""]),
        lock: read("package-lock.json") ?? "",
        node: process.version,
      }),
    )
    .digest("hex");
const startedAt = git("rev-parse", "HEAD").trim();

const plan = planTier(
  tier,
  gateSteps(changed, { economy, touched: touchedSinceMain() }),
);
if (plan.kind === "invalid") {
  console.error(`gate: ${plan.message}`);
  process.exit(2);
}
const { steps } = plan;
if (tier === "fast") {
  console.log(
    changed.length === 0
      ? "gate fast: no changed code files; typecheck only."
      : `gate fast: ${String(changed.length)} changed code file(s).`,
  );
} else if (tier === "merge") {
  console.log("gate merge: the whole-tree checks and the unit tests (#617).");
} else {
  console.log(
    economy
      ? "gate full: economy code changed; the strict strategy lab runs too."
      : "gate full: no economy code changed; strategy lab skipped.",
  );
}

const LOGS = `${GATE_DIR}/logs`;
mkdirSync(LOGS, { recursive: true });
// A full run replaces the last pass: only a green run earns it back.
if (tier === "full") rmSync(MARKER, { force: true });
const logPath = (step) => `${LOGS}/${step.name.replace(/[^\w.-]/g, "_")}.log`;
const width = Math.max(...steps.map((step) => step.name.length));
const outcomes = new Map();
const running = new Set();
const children = new Set();
const began = performance.now();

// A Ctrl-C or a timeout stops the whole gate: dev servers, Chrome, and
// the emulator must not outlive it. Each step leads its own process group.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    for (const child of children) {
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        // Already gone.
      }
    }
    console.log(`\ngate ${tier}: stopped by ${signal}`);
    process.exit(128 + constants.signals[signal]);
  });
}

function settle(step, outcome) {
  outcomes.set(step.name, outcome);
  console.log(summaryLine(step.name, outcome, width));
}

function run(step) {
  running.add(step.name);
  const log = openSync(logPath(step), "w");
  const started = performance.now();
  return new Promise((resolve) => {
    let finished = false;
    const finish = (code) => {
      // A spawn error may be followed by close; count the step once.
      if (finished) return;
      finished = true;
      children.delete(child);
      closeSync(log);
      running.delete(step.name);
      const seconds = (performance.now() - started) / 1000;
      settle(
        step,
        code === 0
          ? { kind: "passed", seconds }
          : { kind: "failed", seconds, code },
      );
      resolve();
    };
    const child = spawn(step.command, step.args, {
      stdio: ["ignore", log, log],
      shell: process.platform === "win32",
      detached: process.platform !== "win32",
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...step.env },
    });
    children.add(child);
    child.on("error", (error) => {
      console.error(`gate: ${step.name} did not start: ${error.message}`);
      finish(127);
    });
    child.on("close", (code, signal) => finish(code ?? (signal ? 128 : 1)));
  });
}

const inFlight = new Set();
for (;;) {
  const { start, skip } = nextMoves(steps, outcomes, running);
  for (const { step, because } of skip) {
    settle(step, { kind: "skipped", because });
  }
  let reusedNow = 0;
  for (const step of start) {
    const key = step.reusable ? reuseKey(step) : undefined;
    const reused =
      key === undefined
        ? undefined
        : reusedOutcome(step, key, parsePass(read(recordPath(step))));
    if (reused !== undefined) {
      settle(step, reused);
      reusedNow += 1;
      continue;
    }
    const job = run(step).then(() => {
      inFlight.delete(job);
      if (key === undefined) return;
      // A green run earns a record only if its inputs did not change while it ran: the
      // closure is read again now, so an edit mid-run is caught.
      const move = recordMove({
        passed: outcomes.get(step.name)?.kind === "passed",
        before: key,
        after: reuseKey(step, labClosure()),
      });
      if (move === "write") {
        mkdirSync(REUSE, { recursive: true });
        writeFileSync(
          recordPath(step),
          JSON.stringify({ key, sha: startedAt }),
        );
      } else {
        rmSync(recordPath(step), { force: true });
      }
    });
    inFlight.add(job);
  }
  // A reused step settles at once: look again before waiting, so the next one starts now.
  if (reusedNow > 0 || (skip.length > 0 && start.length === 0)) continue;
  if (inFlight.size === 0) break;
  await Promise.race(inFlight);
}

for (const step of steps) {
  if (outcomes.get(step.name)?.kind !== "failed") continue;
  const path = logPath(step);
  const text = readFileSync(path, "utf8");
  // CI throws the log folder away, so it gets the whole log.
  if (process.env.CI) {
    console.log(`\n--- ${step.name}: ${path}`);
    console.log(text.trimEnd());
  } else {
    console.log(`\n--- ${step.name}: last lines of ${path}`);
    console.log(logTail(text));
  }
}
const outcomeList = [...outcomes.values()];
const total = totalLine(tier, outcomeList, (performance.now() - began) / 1000);
console.log(`\n${total}`);
const code = exitCode(outcomeList);
if (before !== undefined) {
  const after = treeState();
  const move = markerAfterFull({
    green: code === 0,
    headBefore: before.head,
    headAfter: after.head,
    cleanBefore: before.clean,
    cleanAfter: after.clean,
    summary: total,
  });
  if (move.kind === "write") {
    writeFileSync(MARKER, markerText(move.marker));
    console.log(
      `gate full: signoff ready for ${move.marker.sha.slice(0, 7)}; after the push, run npm run gate -- signoff.`,
    );
  } else {
    console.log(`gate full: no signoff marker (${move.reason}).`);
  }
}
process.exit(code);
