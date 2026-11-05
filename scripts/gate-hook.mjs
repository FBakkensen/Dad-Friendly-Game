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
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2];

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // No hook input (run by hand): treat as empty.
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

if (mode === "stop") {
  const { changedSinceMain } = await import("./changed.mjs");
  if (changedSinceMain().length === 0) {
    process.exit(0);
  }
  const { ok, output } = gate("fast");
  if (!ok) {
    console.error(
      `${output}\n\nThe fast gate is red. Fix each FAIL line before you end the turn.`,
    );
    process.exit(2);
  }
  process.exit(0);
}

if (mode === "push") {
  const command = String(input?.tool_input?.command ?? "");
  // Every Bash call comes here: leave quickly unless it could be a push.
  if (!command.includes("push")) {
    process.exit(0);
  }
  const { isGitPush } = await import("../src/gate.ts");
  if (!isGitPush(command)) {
    process.exit(0);
  }
  const { ok, output } = gate("full");
  if (!ok) {
    console.error(
      `${output}\n\nThe full gate is red, so this push is blocked. Fix each FAIL line, then push again.`,
    );
    process.exit(2);
  }
  process.exit(0);
}

console.error(`gate-hook: unknown mode ${String(mode)} (stop or push)`);
process.exit(1);
