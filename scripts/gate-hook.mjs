/* global console, process, URL */
/**
 * The Claude Code hooks that make the gate the gate (.claude/settings.json):
 *   node scripts/gate-hook.mjs stop   Stop: the fast tier when code changed
 *                                     since origin/main. Red keeps the turn going.
 *   node scripts/gate-hook.mjs push   PreToolUse on Bash: the full tier before a
 *                                     `git push`. Red blocks the push.
 * Exit 2 blocks, and stderr (the gate's one line per step, plus the tail of a
 * failed step's log) is Claude's feedback. Claude Code stops re-blocking a
 * turn after 8 Stop continuations in a row with no tool call between them.
 *
 * Every run adds one line to .gate/hook.log, so a gate that did not run is
 * visible. Any error inside the hook blocks (exit 2): a broken gate must not
 * wave a push through.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2];

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // No hook input (run by hand): treat as empty.
}

function record(outcome, command = "") {
  try {
    mkdirSync(".gate", { recursive: true });
    appendFileSync(
      ".gate/hook.log",
      `${new Date().toISOString()} ${String(mode)} ${outcome} ${command.replace(/\s+/g, " ").slice(0, 120)}\n`,
    );
  } catch {
    // The record is a convenience; the gate itself decides.
  }
}

function gate(tier) {
  const run = spawnSync(process.execPath, ["scripts/gate.mjs", tier], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    ok: run.status === 0,
    output: `${run.stdout ?? ""}${run.stderr ?? ""}`.trim(),
  };
}

async function stop() {
  const { changedSinceMain } = await import("./changed.mjs");
  if (changedSinceMain().length === 0) {
    record("skip no-changes");
    return 0;
  }
  const { ok, output } = gate("fast");
  record(ok ? "pass" : "block");
  if (!ok) {
    console.error(
      `${output}\n\nThe fast gate is red. Fix each FAIL line before you end the turn.`,
    );
    return 2;
  }
  return 0;
}

async function push() {
  const command = String(input?.tool_input?.command ?? "");
  // Every Bash call comes here: leave quickly unless it could be a push.
  if (!command.includes("push")) {
    return 0;
  }
  const { isGitPush } = await import("../src/gate.ts");
  if (!isGitPush(command)) {
    record("skip not-a-push", command);
    return 0;
  }
  const { ok, output } = gate("full");
  record(ok ? "pass" : "block", command);
  if (!ok) {
    console.error(
      `${output}\n\nThe full gate is red, so this push is blocked. Fix each FAIL line, then push again.`,
    );
    return 2;
  }
  return 0;
}

const run = { stop, push }[mode];
if (run === undefined) {
  console.error(`gate-hook: unknown mode ${String(mode)} (stop or push)`);
  process.exit(2);
}
try {
  process.exit(await run());
} catch (error) {
  record(`error ${String(error)}`);
  console.error(
    `gate-hook ${mode} failed, so it blocks: ${String(error?.stack ?? error)}`,
  );
  process.exit(2);
}
