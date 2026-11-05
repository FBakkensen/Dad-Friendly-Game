/* global console, process, URL */
/**
 * One quiet gate, two tiers. One line per step; each full log goes to
 * .gate/logs/<step>.log, and a failed step prints its tail.
 *   npm run gate -- fast   the edit loop (npm run check:fast)
 *   npm run gate -- full   before every push to a PR branch (npm run check)
 * The step table and its rules are in src/gate.ts.
 */
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
} from "node:fs";
import { performance } from "node:perf_hooks";
import { constants } from "node:os";
import { fileURLToPath } from "node:url";
import {
  GATE_DIR,
  USAGE,
  changedCode,
  exitCode,
  gateSteps,
  logTail,
  nextMoves,
  parseArgs,
  planTier,
  splitGitPaths,
  summaryLine,
  totalLine,
} from "../src/gate.ts";

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
const { tier } = parsed;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

function base() {
  try {
    return git("merge-base", "origin/main", "HEAD").trim();
  } catch {
    // No origin/main here (and no network wanted in the fast loop): HEAD.
    console.log("gate: no origin/main; comparing against HEAD.");
    return "HEAD";
  }
}

const changed =
  tier === "fast"
    ? changedCode([
        ...splitGitPaths(git("diff", "--name-only", "-z", base())),
        ...splitGitPaths(
          git("ls-files", "--others", "--exclude-standard", "-z"),
        ),
      ]).filter((path) => existsSync(path))
    : [];

const plan = planTier(tier, gateSteps(changed));
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
}

const LOGS = `${GATE_DIR}/logs`;
mkdirSync(LOGS, { recursive: true });
const logPath = (step) => `${LOGS}/${step.name.replace(/[^\w.-]/g, "_")}.log`;
const width = Math.max(...steps.map((step) => step.name.length));
const outcomes = new Map();
const running = new Set();
const children = new Set();
const began = performance.now();

// A Ctrl-C or a hook timeout stops the whole gate: dev servers, Chrome, and
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
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
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
  for (const step of start) {
    const job = run(step).then(() => inFlight.delete(job));
    inFlight.add(job);
  }
  if (skip.length > 0 && start.length === 0) continue;
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
console.log(
  `\n${totalLine(tier, outcomeList, (performance.now() - began) / 1000)}`,
);
process.exit(exitCode(outcomeList));
