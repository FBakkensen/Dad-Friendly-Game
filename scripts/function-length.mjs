/* global console, process, URL */
/**
 * The function-length ratchet (#408): fails when a function in non-test src is over 150 lines
 * with no ceiling, grows past its ceiling, or when the ceiling list in
 * scripts/function-ceilings.json is not exact or rose against the base (origin/main, or
 * FUNCTION_BASE). The rules are in src/function-length.ts.
 *   node scripts/function-length.mjs          check
 *   node scripts/function-length.mjs --print  the current over-limit functions, as JSON
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { splitGitPaths } from "../src/gate.ts";
import {
  FUNCTION_LIMIT,
  baseFromShow,
  isMeasured,
  judgeLengths,
  measureFunctions,
  parseCeilings,
  problemLine,
} from "../src/function-length.ts";

// Every path below is repo-relative, wherever this was started from.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));

const CEILINGS = "scripts/function-ceilings.json";
// The C locale keeps git's messages in English, which baseFromShow reads.
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, LC_ALL: "C" },
  });

// Untracked files too: a new file is measured before it is committed.
const files = splitGitPaths(
  git(
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src",
  ),
)
  // A file deleted but not yet committed is still listed: skip what is gone.
  .filter((path) => isMeasured(path) && existsSync(path));
const spans = files.flatMap((path) =>
  measureFunctions(path, readFileSync(path, "utf8")),
);

if (process.argv.includes("--print")) {
  const over = Object.fromEntries(
    spans
      .filter((span) => span.lines > FUNCTION_LIMIT)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((span) => [span.id, span.lines]),
  );
  console.log(JSON.stringify(over, null, 2));
  process.exit(0);
}

/** The list on the base (origin/main, or FUNCTION_BASE), through baseFromShow. */
function baseCeilings() {
  const ref = process.env.FUNCTION_BASE ?? "origin/main";
  let outcome;
  try {
    outcome = { kind: "shown", text: git("show", `${ref}:${CEILINGS}`) };
  } catch (error) {
    outcome = { kind: "failed", message: String(error?.stderr ?? error) };
  }
  try {
    return baseFromShow(outcome);
  } catch (error) {
    console.error(`function-length: ${String(error?.message ?? error)}`);
    process.exit(1);
  }
}

const problems = judgeLengths({
  spans,
  ceilings: parseCeilings(readFileSync(CEILINGS, "utf8")),
  base: baseCeilings(),
});
if (problems.length > 0) {
  console.error(
    `Function lengths: ${String(problems.length)} problem(s). No function may pass ${String(FUNCTION_LIMIT)} lines; those in ${CEILINGS} may only shrink.`,
  );
  for (const problem of problems) console.error(`- ${problemLine(problem)}`);
  process.exit(1);
}
const over = spans.filter((span) => span.lines > FUNCTION_LIMIT).length;
console.log(
  `Function lengths passed (${String(over)} over ${String(FUNCTION_LIMIT)}, all at their ceilings).`,
);
